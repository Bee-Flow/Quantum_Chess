<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\TimeControl;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IL10N;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Time controls, deadlines, and the outcome of a passed deadline or of abandonment.
 */
#[CoversClass(GameClock::class)]
#[CoversClass(TimeControl::class)]
final class GameClockTest extends TestCase {
	private function clock(): GameClock {
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		return new GameClock($time);
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
		$tc = $this->clock();
		$state = (new Engine())->initialState();
		$this->assertSame(
			'aborted_timeout',
			$tc->resolveTimeout($this->game(0, 'w'), $state)['reason'],
			'White never moved',
		);
		$this->assertSame(
			Game::STATUS_ABORTED,
			$tc->resolveTimeout($this->game(1, 'b'), $state)['status'],
			'Black never moved',
		);
		$this->assertSame(
			['status' => 'finished', 'result' => '0-1', 'reason' => 'timeout'],
			$tc->resolveTimeout($this->game(2, 'w'), $state),
		);
		$this->assertSame('1-0', $tc->resolveTimeout($this->game(5, 'b'), $state)['result']);
		$bare = $state;
		$bare['captured'] = range(1, 15);
		$this->assertSame(
			['status' => 'finished', 'result' => '1/2-1/2', 'reason' => 'timeout_draw'],
			$tc->resolveTimeout($this->game(8, 'b'), $bare),
			'the waiting side has only its king',
		);
		$this->assertSame('abandoned', $tc->resolveTimeout($this->game(8, 'w', null), $state)['reason']);
	}

	public function testDeadlines(): void {
		$tc = $this->clock();
		$this->assertSame(1000 + 259200, $tc->deadlineFrom('corr:3d', 1000));
		$this->assertNull($tc->deadlineFrom('corr:none', 1000));
		$this->assertNull(TimeControl::tryFrom('corr:2d'));
		$this->assertSame(1000, $tc->dueAt($this->game(3, 'w', 1000)));
		$none = $this->game(3, 'w', null);
		$none->setLastMoveAt(500);
		$this->assertSame(500 + GameClock::ABANDON_AFTER, $tc->dueAt($none));
	}

	public function testTimeControls(): void {
		$this->assertSame(
			[86400, 259200, 604800, null],
			array_map(fn (TimeControl $tc) => $tc->period(), TimeControl::cases()),
		);
		$this->assertSame(TimeControl::ThreeDays, TimeControl::DEFAULT);
		$this->assertSame(TimeControl::ThreeDays, TimeControl::fromStored('corr:unknown'));
		$this->assertSame(TimeControl::SevenDays, TimeControl::fromStored('corr:7d'));
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnArgument(0);
		$this->assertSame(['1 day per move', '3 days per move', '7 days per move', 'No time limit'],
			array_map(fn (TimeControl $tc) => $tc->label($l), TimeControl::cases()));
		$this->assertSame(1790000000, $this->clock()->now());
	}
}
