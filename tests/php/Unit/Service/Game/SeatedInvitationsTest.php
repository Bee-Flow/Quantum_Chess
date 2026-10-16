<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Service\Game\SeatedInvitations;
use OCA\QuantumChess\Service\Game\VariantTurn;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The answers to an invitation to a game with more than two seats: who hears that the game started, and what a
 * decline does (an open seat again, or the end of the game for everyone).
 */
#[CoversClass(SeatedInvitations::class)]
final class SeatedInvitationsTest extends TestCase {
	use GameServiceFixture;

	protected function setUp(): void {
		$this->setUpGames();
	}

	/** @param list<?string> $players */
	private function create(array $players, string $variant = 'fourplayer'): Game {
		$game = $this->invitations()->create('alice', [
			'variant' => $variant,
			'options' => ['mode' => 'ffa'],
			'players' => $players,
			'color' => 'w',
		]);
		$this->log = [];
		return $game;
	}

	public function testTheLastAcceptStartsTheGameForEveryone(): void {
		$this->create(['alice', 'bob', 'carol', 'dave']);
		$this->invitations()->accept(100, 'bob');
		$this->assertContains("notify inviteAccepted(#100, false, 'bob')", $this->log, 'not full yet');
		$this->log = [];
		$this->invitations()->accept(100, 'carol');
		$game = $this->invitations()->accept(100, 'dave');
		$this->assertSame(Game::STATUS_ACTIVE, $game->getStatus());
		$this->assertContains("notify gameStarted(#100, 'dave')", $this->log);
		$this->assertNotContains("notify inviteAccepted(#100, false, 'dave')", $this->log);
	}

	public function testJoiningTheLastSeatStartsTheGame(): void {
		$this->create(['alice', 'bob', 'carol', null]);
		foreach (['bob', 'carol'] as $uid) {
			$this->invitations()->accept(100, $uid);
		}
		$this->log = [];
		$game = $this->invitations()->join(100, 'erin');
		$this->assertSame(Game::STATUS_ACTIVE, $game->getStatus());
		$this->assertContains("notify gameStarted(#100, 'erin')", $this->log);
		$this->assertNotContains("notify inviteAccepted(#100, true, 'erin')", $this->log);
	}

	public function testADeclineInAnOpenChallengeFreesTheSeat(): void {
		$this->create(['alice', 'bob', 'carol', null]);
		$this->invitations()->accept(100, 'bob');
		$this->log = [];
		$game = $this->invitations()->decline(100, 'carol');
		$this->assertSame([Game::STATUS_OPEN, ['alice', 'bob', null, null], [true, true, false, false]], [
			$game->getStatus(),
			$game->seatUids(),
			VariantTurn::of($game)->accepted,
		]);
		$this->assertSame([null, null], [$this->seats[2]->getUid(), $this->seats[2]->getAcceptedAt()]);
		$this->assertContains("notify inviteClosed(#100, 'carol')", $this->log);
		$this->assertContains("notify inviteDeclined(#100, 'carol', true)", $this->log);
		$game = $this->invitations()->join(100, 'erin');
		$this->assertSame(['alice', 'bob', 'erin', null], $game->seatUids(), 'anyone may take the seat');
	}

	public function testADeclineCancelsTheGameWithoutOpenChallenges(): void {
		$this->create(['alice', 'bob', 'carol', null]);
		$this->config['openChallengesEnabled'] = false;
		$game = $this->invitations()->decline(100, 'carol');
		$this->assertSame(Game::STATUS_DECLINED, $game->getStatus());
		$this->assertContains('notify inviteClosed(#100, NULL)', $this->log);
		$this->assertContains("notify inviteDeclined(#100, 'carol', false)", $this->log);
	}

	public function testADeclineCancelsAGameWithoutOpenSeats(): void {
		$this->create(['alice', 'bob', 'carol', 'dave']);
		$game = $this->invitations()->decline(100, 'carol');
		$this->assertSame(Game::STATUS_DECLINED, $game->getStatus());
		$this->assertContains("notify inviteDeclined(#100, 'carol', false)", $this->log);
	}

	public function testADeclineCancelsARematch(): void {
		$game = GameBuilder::open([
			'id' => 7,
			'variant' => 'fourplayer',
			'seatCount' => 4,
			'opponentUid' => null,
			'rematchOf' => 3,
			'state' => VariantTurn::start(['alice', 'bob', 'carol', null], [true, false, false, false])->json(),
		]);
		$this->store($game);
		$this->assertFalse(SeatedInvitations::releasable($game, $this->createStub(AppSettings::class)));
		$game = $this->invitations()->decline(7, 'bob');
		$this->assertSame(Game::STATUS_DECLINED, $game->getStatus());
	}
}
