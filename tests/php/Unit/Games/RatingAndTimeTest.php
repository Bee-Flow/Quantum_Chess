<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Games;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Rating;
use OCA\QuantumChess\Db\RatingMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Service\RatingService;
use OCA\QuantumChess\Service\TimeControl;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\TestCase;

/**
 * Elo (SPEC §8.6) and the clock (SPEC §8.3).
 */
final class RatingAndTimeTest extends TestCase {
	public function testDeltaKSwitchRoundingAndFloor(): void {
		$this->assertSame(20, RatingService::delta(1200, 1200, 1.0, 0));
		$this->assertSame(-20, RatingService::delta(1200, 1200, 0.0, 9));
		$this->assertSame(10, RatingService::delta(1200, 1200, 1.0, 10), 'K = 20 from the 10th rated game on');
		$this->assertSame(0, RatingService::delta(1200, 1200, 0.5, 3));
		// E = 1/(1+10^(-200/400)) = 0.7597 → 40 * (0.5 - 0.7597) = -10.39 → -10
		$this->assertSame(-10, RatingService::delta(1400, 1200, 0.5, 0));
		$this->assertSame(0, RatingService::delta(100, 1500, 0.0, 0), 'floor at 100');
		$this->assertSame(-10, RatingService::delta(110, 110, 0.0, 0), 'a loss never goes below the floor');
	}

	public function testApplyResultUpdatesBothRowsAndTheGame(): void {
		$rows = [];
		$mapper = $this->createMock(RatingMapper::class);
		$mapper->method('findByUid')->willReturnCallback(function (string $uid) use (&$rows) {
			return $rows[$uid] ?? null;
		});
		$mapper->method('insert')->willReturnCallback(function (Rating $row) use (&$rows) {
			$rows[$row->getUid()] = $row;
			return $row;
		});
		$mapper->method('update')->willReturnArgument(0);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		$service = new RatingService($mapper, $this->createMock(GameMapper::class), $time);

		$bob = new Rating();
		$bob->setUid('bob');
		$bob->setRating(1300);
		$bob->setPeak(1300);
		$bob->setRatedGames(12);
		$rows['bob'] = $bob;

		$game = new Game();
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(1);
		$game->setResult('1-0');
		$service->applyResult($game);

		$alice = $rows['alice'];
		// alice: K 40, E = 1/(1+10^(100/400)) = 0.3599 → +25.6 → +26; bob: K 20, → -12.8 → -13
		$this->assertSame(1226, $alice->getRating());
		$this->assertSame(1287, $bob->getRating());
		$this->assertSame([26, -13], [$game->getRatingWDelta(), $game->getRatingBDelta()]);
		$this->assertSame([1200, 1300], [$game->getRatingWBefore(), $game->getRatingBBefore()]);
		$this->assertSame([1, 0, 1, 1], [$alice->getWins(), $alice->getLosses(), $alice->getGames(), $alice->getRatedGames()]);
		$this->assertSame([0, 1, 13], [$bob->getWins(), $bob->getLosses(), $bob->getRatedGames()]);
		$this->assertSame(1226, $alice->getPeak());
	}

	public function testUnratedGamesOnlyCount(): void {
		$rows = [];
		$mapper = $this->createMock(RatingMapper::class);
		$mapper->method('findByUid')->willReturnCallback(fn (string $uid) => $rows[$uid] ?? null);
		$mapper->method('insert')->willReturnCallback(function (Rating $row) use (&$rows) {
			$rows[$row->getUid()] = $row;
			return $row;
		});
		$mapper->method('update')->willReturnArgument(0);
		$service = new RatingService($mapper, $this->createMock(GameMapper::class), $this->createMock(ITimeFactory::class));
		$game = new Game();
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(0);
		$game->setResult('1/2-1/2');
		$service->applyResult($game);
		$this->assertSame([1200, 1, 0], [$rows['alice']->getRating(), $rows['alice']->getDraws(), $rows['alice']->getRatedGames()]);
		$this->assertNull($game->getRatingWDelta());
	}

	private function game(int $ply, string $turn, ?int $deadline = 1000): Game {
		$game = new Game();
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setPly($ply);
		$game->setTurn($turn);
		$game->setTimeControl($deadline === null ? 'corr:none' : 'corr:1d');
		$game->setDeadlineAt($deadline);
		$game->setStartedAt(100);
		return $game;
	}

	public function testTimeoutOutcomes(): void {
		$tc = new TimeControl();
		$state = (new Engine())->initialState();
		$this->assertSame('aborted_timeout', $tc->resolveTimeout($this->game(0, 'w'), $state)['reason'], 'White never moved');
		$this->assertSame(Game::STATUS_ABORTED, $tc->resolveTimeout($this->game(1, 'b'), $state)['status'], 'Black never moved');
		$this->assertSame(['status' => 'finished', 'result' => '0-1', 'reason' => 'timeout'], $tc->resolveTimeout($this->game(2, 'w'), $state));
		$this->assertSame('1-0', $tc->resolveTimeout($this->game(5, 'b'), $state)['result']);
		$bare = $state;
		$bare['captured'] = range(1, 15);
		$this->assertSame(['status' => 'finished', 'result' => '1/2-1/2', 'reason' => 'timeout_draw'], $tc->resolveTimeout($this->game(8, 'b'), $bare), 'the waiting side has only its king');
		$this->assertSame('abandoned', $tc->resolveTimeout($this->game(8, 'w', null), $state)['reason']);
	}

	public function testDeadlines(): void {
		$tc = new TimeControl();
		$this->assertSame(1000 + 259200, $tc->deadlineFrom('corr:3d', 1000));
		$this->assertNull($tc->deadlineFrom('corr:none', 1000));
		$this->assertFalse($tc->isValid('corr:2d'));
		$this->assertSame(1000, $tc->dueAt($this->game(3, 'w', 1000)));
		$none = $this->game(3, 'w', null);
		$none->setLastMoveAt(500);
		$this->assertSame(500 + TimeControl::ABANDON_AFTER, $tc->dueAt($none));
	}
}
