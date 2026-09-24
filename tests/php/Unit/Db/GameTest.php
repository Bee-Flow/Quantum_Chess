<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Db;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The questions a game answers about itself: players, colours, status and draw cool-down.
 */
#[CoversClass(Game::class)]
final class GameTest extends TestCase {
	public function testPlayers(): void {
		$game = GameBuilder::active();
		$this->assertSame(['w', 'b', null], [$game->colorOf('alice'), $game->colorOf('bob'), $game->colorOf('carol')]);
		$this->assertSame(
			['bob', 'alice', null],
			[$game->opponentOf('alice'), $game->opponentOf('bob'), $game->opponentOf('carol')],
		);
		$this->assertSame(
			[true, false, false],
			[$game->isParticipant('alice'), $game->isParticipant('carol'), $game->isParticipant('')],
		);
		$invitation = GameBuilder::pending();
		$this->assertSame(
			[null, 'bob', 'alice'],
			[$invitation->colorOf('alice'), $invitation->opponentOf('alice'), $invitation->opponentOf('bob')],
		);
		$this->assertSame(['b', 'w'], [Game::otherColor('w'), Game::otherColor('b')]);
	}

	public function testStatus(): void {
		$this->assertSame([true, true, false], [
			GameBuilder::pending()->isAwaitingOpponent(),
			GameBuilder::open()->isAwaitingOpponent(),
			GameBuilder::active()->isAwaitingOpponent(),
		]);
		$this->assertSame([true, true, false, false], [
			GameBuilder::finished()->hasEnded(),
			GameBuilder::finished(['status' => Game::STATUS_ABORTED])->hasEnded(),
			GameBuilder::pending(['status' => Game::STATUS_DECLINED])->hasEnded(),
			GameBuilder::active()->hasEnded(),
		]);
		$this->assertTrue(GameBuilder::pending(['status' => Game::STATUS_DECLINED])->isFinal());
	}

	public function testDrawCooldown(): void {
		$game = GameBuilder::active(['lastDrawW' => 4]);
		$this->assertSame([10, null], [$game->drawAvailableAtPly('w'), $game->drawAvailableAtPly('b')]);
	}
}
