<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Service\Game\GameLifecycle;
use OCA\QuantumChess\Service\Game\GameMaintenanceService;
use OCA\QuantumChess\Service\Game\GameTransaction;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The maintenance run (expiry, timeouts, abandonment, purging) and the removal of a user's games.
 */
#[CoversClass(GameMaintenanceService::class)]
#[CoversClass(GameLifecycle::class)]
#[CoversClass(GameTransaction::class)]
final class GameMaintenanceServiceTest extends TestCase {
	use GameServiceFixture;

	private const NOW = GameBuilder::NOW;
	private const DAY = 86400;

	/** @var array<string, list<int>> game ids that each maintenance query returns */
	private array $due = [];
	/** @var list<array{string, mixed}> the queries the run made */
	private array $queries = [];

	protected function setUp(): void {
		$this->setUpGames();
		$pick = fn (string $query): array => array_values(array_filter(array_map(fn (int $id) => $this->stored[$id] ?? null, $this->due[$query] ?? [])));
		$this->gameMapper->method('findDue')->willReturnCallback(function (array $statuses, string $column, int $time, int $limit) use ($pick): array {
			$this->queries[] = [$column, $time, $limit];
			return $pick($column);
		});
		$this->gameMapper->method('findAbandoned')->willReturnCallback(function (int $cutoff, int $limit) use ($pick): array {
			$this->queries[] = ['abandoned', $cutoff, $limit];
			return $pick('abandoned');
		});
		$this->gameMapper->method('findChatToPurge')->willReturnCallback(function (int $cutoff, int $limit) use ($pick): array {
			$this->queries[] = ['chat', $cutoff, $limit];
			return $pick('chat');
		});
		$this->gameMapper->method('findForUser')->willReturnCallback(fn (string $uid) => array_values(array_filter($this->stored, fn (Game $g) => $g->isParticipant($uid))));
	}

	private function played(array $codes, array $fields): Game {
		$state = $this->engine->initialState();
		foreach ($codes as $code) {
			$state = $this->engine->applyMove($state, $code)['state'];
		}
		return GameBuilder::active($fields + ['state' => $this->engine->serializeState($state), 'ply' => $state['ply'], 'turn' => $state['turn']]);
	}

	public function testMaintenanceRun(): void {
		$this->store(
			GameBuilder::pending(['id' => 1, 'expiresAt' => self::NOW - 5]),
			GameBuilder::open(['id' => 2, 'expiresAt' => self::NOW + 5]),
			$this->played(['e2-e4', 'e7-e5', 'd2-d4'], ['id' => 3, 'deadlineAt' => self::NOW - 10]),
			$this->played(['e2-e4'], ['id' => 4, 'deadlineAt' => self::NOW - 10]),
			$this->played(['e2-e4', 'e7-e5'], ['id' => 5, 'timeControl' => 'corr:none', 'deadlineAt' => null, 'lastMoveAt' => self::NOW - 31 * self::DAY]),
			GameBuilder::finished(['id' => 6, 'chatCount' => 3, 'finishedAt' => self::NOW - 100 * self::DAY]),
			GameBuilder::finished(['id' => 8, 'chatCount' => 1, 'finishedAt' => self::NOW - 100 * self::DAY]),
		);
		$this->due = ['expires_at' => [1, 2], 'deadline_at' => [3, 4], 'abandoned' => [5], 'chat' => [6, 8]];
		// the chat purge of game 8 loses a race against a concurrent change and is left for the next run
		$this->conflicting = [8];
		$stats = $this->maintenance()->runMaintenance(self::NOW);
		$this->assertSame([1, 2, 1, 1, 0], [$stats['expired'], $stats['timedOut'], $stats['abandoned'], $stats['chatPurged'], $stats['gamesPurged']]);
		$this->assertSame([
			[Game::STATUS_EXPIRED, null, null],
			[Game::STATUS_OPEN, null, null],
			[Game::STATUS_FINISHED, '1-0', 'timeout'],
			[Game::STATUS_ABORTED, null, 'aborted_timeout'],
			[Game::STATUS_FINISHED, '0-1', 'abandoned'],
		], array_map(fn (int $id) => [$this->stored[$id]->getStatus(), $this->stored[$id]->getResult(), $this->stored[$id]->getResultReason()], [1, 2, 3, 4, 5]));
		$this->assertSame(0, $this->stored[6]->getChatCount());
		$this->assertContains('rollback', $this->log);
		$this->assertSame([
			['expires_at', self::NOW, 200],
			['deadline_at', self::NOW, 200],
			['abandoned', self::NOW - 30 * self::DAY, 200],
			['chat', self::NOW - 90 * self::DAY, 200],
		], $this->queries, 'finished games are kept while purging is off');
	}

	public function testMaintenanceRunOrderOfSteps(): void {
		$this->store(
			GameBuilder::pending(['id' => 1, 'expiresAt' => self::NOW]),
			$this->played(['e2-e4', 'e7-e5', 'd2-d4'], ['id' => 3, 'deadlineAt' => self::NOW]),
			GameBuilder::finished(['id' => 6, 'chatCount' => 3]),
			GameBuilder::finished(['id' => 9, 'finishedAt' => self::NOW - 40 * self::DAY]),
		);
		$this->due = ['expires_at' => [1], 'deadline_at' => [3], 'chat' => [6], 'finished_at' => [9]];
		$this->config['purgeFinishedDays'] = 30;
		$this->config['chatRetentionDays'] = 7;
		$stats = $this->maintenance()->runMaintenance(self::NOW, 50);
		$this->assertSame([1, 1, 0, 1, 1], [$stats['expired'], $stats['timedOut'], $stats['abandoned'], $stats['chatPurged'], $stats['gamesPurged']]);
		$this->assertSame([
			'begin', 'save #1 rev 1→2', 'commit', 'notify inviteClosed(#1)',
			'begin', 'rate #3 1-0', 'chat #3 timeout {"color":"b"}', 'save #3 rev 5→6', 'commit', 'notify gameOver(#3, NULL)',
			'begin', 'purge chat #6', 'save #6 rev 5→6', 'commit',
			'begin', 'delete #9', 'commit', 'notify removeForGame(9)',
		], $this->log);
		$this->assertSame([
			['expires_at', self::NOW, 50],
			['deadline_at', self::NOW, 50],
			['abandoned', self::NOW - 30 * self::DAY, 50],
			['chat', self::NOW - 7 * self::DAY, 50],
			['finished_at', self::NOW - 30 * self::DAY, 50],
		], $this->queries);
	}

	public function testRemoveADeletedAccount(): void {
		$this->store(
			GameBuilder::pending(['id' => 1]),
			GameBuilder::open(['id' => 2]),
			$this->played(['e2-e4', 'e7-e5'], ['id' => 3]),
			GameBuilder::finished(['id' => 4, 'creatorUid' => 'bob', 'opponentUid' => 'alice', 'whiteUid' => 'bob', 'blackUid' => 'alice']),
			GameBuilder::finished(['id' => 5, 'opponentUid' => null, 'blackUid' => null]),
		);
		$this->maintenance()->removeUser('alice', true);
		$this->assertSame([
			'begin', 'delete #1', 'commit', 'notify removeForGame(1)',
			'begin', 'delete #2', 'commit', 'notify removeForGame(2)',
			'begin', 'rate #3 0-1', 'save #3 rev 5→6', 'clear games #3 alice', 'clear moves #3 alice', 'delete own chat #3 alice', 'commit',
			'notify removeForGame(3)', "notify gameEndedDeleted(#3, 'bob')",
			'begin', 'clear games #4 alice', 'clear moves #4 alice', 'delete own chat #4 alice', 'commit', 'notify removeForGame(4)',
			'begin', 'clear games #5 alice', 'clear moves #5 alice', 'delete own chat #5 alice', 'delete #5', 'commit', 'notify removeForGame(5)',
		], $this->log);
		$game = $this->stored[3];
		$this->assertSame([Game::STATUS_FINISHED, '0-1', 'player_deleted', 0, 'deleted', null, 'bob'],
			[$game->getStatus(), $game->getResult(), $game->getResultReason(), $game->getRated(), $game->getUnratedReason(), $game->getWhiteUid(), $game->getBlackUid()]);
		$this->assertSame([3, 4], array_keys($this->stored), 'games without any player left are deleted');
	}

	public function testRemoveTheDataOfAnAccountThatStays(): void {
		$this->store($this->played(['e2-e4', 'e7-e5'], ['id' => 3]));
		$this->maintenance()->removeUser('bob', false);
		$this->assertSame([
			'begin', 'rate #3 1-0', 'chat #3 resigned {"color":"b"}', 'save #3 rev 5→6', 'clear games #3 bob', 'clear moves #3 bob',
			'delete own chat #3 bob', 'commit', 'notify removeForGame(3)', "notify gameOver(#3, 'bob')",
		], $this->log);
		$this->assertSame([Game::STATUS_FINISHED, '1-0', 'resignation', 1], [$this->stored[3]->getStatus(), $this->stored[3]->getResult(),
			$this->stored[3]->getResultReason(), $this->stored[3]->getRated()]);
	}
}
