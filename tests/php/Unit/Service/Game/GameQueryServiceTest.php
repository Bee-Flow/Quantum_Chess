<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The lobby, the counts that need the user, the history pages and polling.
 */
#[CoversClass(GameQueryService::class)]
final class GameQueryServiceTest extends TestCase {
	use GameServiceFixture;

	private const NOW = GameBuilder::NOW;

	/** @var array{0: ?int, 1: ?int, 2: int}|null the cursor and limit of the last history query */
	private ?array $page = null;

	protected function setUp(): void {
		$this->setUpGames();
		$this->gameMapper->method('findForUser')->willReturnCallback(fn (string $uid, array $statuses) => array_values(array_filter($this->stored,
			fn (Game $g) => $g->isParticipant($uid) && in_array($g->getStatus(), $statuses, true))));
		$this->gameMapper->method('findOpen')->willReturnCallback(fn () => array_values(array_filter($this->stored, fn (Game $g) => $g->getStatus() === Game::STATUS_OPEN)));
		$this->gameMapper->method('history')->willReturnCallback(function (string $uid, array $statuses, ?int $before, ?int $beforeId, int $limit): array {
			$this->page = [$before, $beforeId, $limit];
			return array_slice(array_values(array_filter($this->stored, fn (Game $g) => in_array($g->getStatus(), $statuses, true))), 0, $limit);
		});
	}

	public function testLobbyGroups(): void {
		$this->store(
			GameBuilder::active(['id' => 1, 'turn' => 'b', 'deadlineAt' => self::NOW + 500]),
			GameBuilder::active(['id' => 2, 'turn' => 'b', 'deadlineAt' => self::NOW + 100]),
			GameBuilder::active(['id' => 3]),
			GameBuilder::pending(['id' => 4]),
			GameBuilder::pending(['id' => 5, 'creatorUid' => 'carol', 'opponentUid' => 'bob']),
			GameBuilder::open(['id' => 6, 'creatorUid' => 'carol']),
			GameBuilder::finished(['id' => 7]),
		);
		$lobby = $this->queries()->getLobby('bob');
		$this->assertSame(['yourTurn' => [2, 1], 'waiting' => [3], 'invitations' => [4, 5], 'outgoing' => [], 'open' => [6], 'recent' => [7]],
			array_map(fn (array $games) => array_map(fn (Game $g) => $g->getId(), $games), $lobby));
		$this->assertSame(['yourTurn' => 2, 'invitations' => 2], $this->queries()->countActionNeeded('bob'));
		$this->assertSame([4, 5, 2], array_map(fn (Game $g) => $g->getId(), $this->queries()->listDashboard('bob', 3)));
	}

	public function testHistoryPages(): void {
		foreach ([11, 12, 13] as $id) {
			$this->store(GameBuilder::finished(['id' => $id, 'finishedAt' => self::NOW - $id]));
		}
		$page = $this->queries()->history('bob', ['limit' => 2]);
		$this->assertSame([[11, 12], base64_encode((self::NOW - 12) . ':12')], [array_map(fn (Game $g) => $g->getId(), $page['games']), $page['next']]);
		$this->assertSame([null, null, 3], $this->page, 'one more than the page to know whether there is a next page');
		$this->queries()->history('bob', ['cursor' => $page['next'], 'limit' => 500]);
		$this->assertSame([self::NOW - 12, 12, 51], $this->page);
		try {
			$this->queries()->history('bob', ['cursor' => 'nonsense']);
			$this->fail('bad cursor');
		} catch (ApiException $e) {
			$this->assertSame(['invalid_argument', ['field' => 'cursor']], [$e->getErrorCode(), $e->getExtra()]);
		}
	}

	public function testPoll(): void {
		$this->store(GameBuilder::active());
		$this->moveMapper->method('findByGame')->willReturn([]);
		$this->chatMapper->method('findByGame')->willReturn([]);
		$this->assertSame(['changed' => false, 'rev' => 5, 'now' => self::NOW], $this->queries()->poll(7, 'bob', 5, 0, 0));
		$changed = $this->queries()->poll(7, 'bob', 4, 0, 0);
		$this->assertSame([true, 5, [], []], [$changed['changed'], $changed['rev'], $changed['moves'], $changed['chat']]);
		$this->assertSame(['rated' => true, 'reason' => null], $this->queries()->ratedCheck());
		$this->config['ratedEnabled'] = false;
		$this->assertSame(['rated' => false, 'reason' => 'admin'], $this->queries()->ratedCheck());
	}
}
