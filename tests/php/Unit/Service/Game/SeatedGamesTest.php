<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Service\Game\SeatedInvitations;
use OCA\QuantumChess\Service\Game\VariantChain;
use OCA\QuantumChess\Service\Game\VariantGameplayService;
use OCA\QuantumChess\Service\Game\VariantTurn;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Variant games with four seats (Four-player chess and Bughouse): a player per seat or an open seat, each invited
 * player's answer, the start once every seat is taken (as chosen or drawn at random), turns by seat number, and the
 * end by resignation, time-out or a draw every seat agrees to.
 */
#[CoversClass(SeatedInvitations::class)]
#[CoversClass(VariantGameplayService::class)]
#[CoversClass(VariantTurn::class)]
#[CoversClass(Game::class)]
final class SeatedGamesTest extends TestCase {
	use GameServiceFixture;

	private const NOW = GameBuilder::NOW;
	private const HASH = '0123456789abcdef';

	protected function setUp(): void {
		$this->setUpGames();
	}

	private function assertApiError(string $code, callable $fn): ApiException {
		try {
			$fn();
		} catch (ApiException $e) {
			$this->assertSame($code, $e->getErrorCode());
			return $e;
		}
		$this->fail("expected $code");
	}

	/**
	 * A game of `$variant` with alice, bob, carol and dave in seats 0 to 3, started.
	 *
	 * @param array<string, string> $options
	 */
	private function started(string $variant = 'fourplayer', array $options = ['mode' => 'ffa']): Game {
		$game = $this->invitations()->create('alice', [
			'variant' => $variant,
			'options' => $options,
			'players' => ['alice', 'bob', 'carol', 'dave'],
			'color' => 'w',
		]);
		foreach (['bob', 'carol', 'dave'] as $uid) {
			$game = $this->invitations()->accept((int)$game->getId(), $uid);
		}
		$this->log = [];
		return $game;
	}

	/**
	 * Plays and settles a move of `$uid`; the turn passes to `$next`.
	 *
	 * @param list<int>|null $out the seats that are out after the move, as the settling browser names them
	 */
	private function play(Game $game, string $uid, int $next, string $result = '', ?array $out = null): Game {
		$ply = $game->getPly();
		$this->variantGameplay()->move((int)$game->getId(), $uid, 'a' . $ply, $ply, null, null);
		return $this->variantGameplay()->settle((int)$game->getId(), $uid, $ply, $next, $result, self::HASH, $out);
	}

	/** A free-for-all game in which every seat has played and carol (seat 2) is out; dave is to move. */
	private function withCarolOut(): Game {
		$game = $this->started();
		foreach ([['alice', 1, []], ['bob', 2, []], ['carol', 3, []], ['dave', 0, []], ['alice', 1, []]] as $step) {
			$game = $this->play($game, $step[0], $step[1], '', $step[2]);
		}
		// bob takes carol's king: her turn is skipped
		return $this->play($game, 'bob', 3, '', [2]);
	}

	public function testAnInvitationNamesAPlayerPerSeat(): void {
		$game = $this->invitations()->create('alice', [
			'variant' => 'fourplayer',
			'options' => ['mode' => 'teams'],
			'players' => ['Bob', 'alice', null, 'carol'],
			'color' => 'w',
			'rated' => true,
		]);
		$this->assertSame([Game::STATUS_OPEN, 4, 0, ['bob', 'alice', null, 'carol']], [
			$game->getStatus(),
			$game->getSeatCount(),
			$game->getRatedRequested(),
			$game->seatUids(),
		]);
		$this->assertSame([true, true, false, true], [
			$game->isInviteeOf('bob'),
			$game->isParticipant('carol'),
			$game->isInviteeOf('alice'),
			$game->isInviteeOf('carol'),
		]);
		$this->assertSame(
			[[0, 'bob', null, 0], [1, 'alice', self::NOW, 1], [2, null, null, 0], [3, 'carol', null, 1]],
			array_map(fn ($s) => [$s->getSeat(), $s->getUid(), $s->getAcceptedAt(), $s->getTeam()], $this->seats),
			'a seat per player, the creator accepted, teams by parity',
		);
		$this->assertContains("notify invite(#100, 'bob')", $this->log);
		$this->assertContains("notify invite(#100, 'carol')", $this->log);
		$this->assertNotContains("notify invite(#100, 'alice')", $this->log);
	}

	public function testThePlayersOfTheSeatsAreChecked(): void {
		$create = fn (mixed $players) => fn () => $this->invitations()->create('alice', [
			'variant' => 'bughouse',
			'players' => $players,
		]);
		$this->assertApiError('invalid_argument', $create(null));
		$this->assertApiError('invalid_argument', $create(['alice', 'bob', 'carol']));
		$this->assertApiError('invalid_argument', $create(['bob', 'carol', 'dave', 'erin']));
		$this->assertApiError('invalid_argument', $create(['alice', 'bob', 'bob', 'carol']));
		$this->assertApiError('invalid_argument', $create(['alice', 'alice', 'bob', 'carol']));
		$this->assertApiError('invalid_argument', $create(['alice', 7, 'bob', 'carol']));
		$this->config['openChallengesEnabled'] = false;
		$this->assertApiError('open_challenges_disabled', $create(['alice', null, 'bob', 'carol']));
		$this->assertSame([], $this->log);
	}

	public function testTheGameStartsWhenEverySeatIsTaken(): void {
		$game = $this->invitations()->create('alice', [
			'variant' => 'fourplayer',
			'options' => ['mode' => 'ffa'],
			'players' => ['alice', 'bob', null, 'carol'],
			'color' => 'w',
		]);
		$game = $this->invitations()->accept(100, 'bob');
		$this->assertSame([Game::STATUS_OPEN, null], [$game->getStatus(), $game->colorOf('bob')]);
		$this->assertApiError('invalid_status', fn () => $this->invitations()->accept(100, 'bob'));
		$game = $this->invitations()->join(100, 'dave');
		$this->assertSame(Game::STATUS_PENDING, $game->getStatus(), 'every open seat is taken; carol has not answered');
		$this->assertApiError('not_found', fn () => $this->invitations()->join(100, 'erin'));
		$game = $this->invitations()->accept(100, 'carol');
		$this->assertSame([Game::STATUS_ACTIVE, '0', 0, ['alice', 'bob', 'dave', 'carol'], '2', '0'], [
			$game->getStatus(),
			$game->getTurn(),
			$game->getSeatToMove(),
			$game->seatUids(),
			$game->colorOf('dave'),
			$game->colorOf('alice'),
		]);
		$this->assertSame(
			VariantChain::start(100, 'fourplayer', ['mode' => 'ffa'], ['alice', 'bob', 'dave', 'carol'], self::NOW),
			$game->getChain(),
		);
		$this->assertSame(['alice', 'bob', 'dave', 'carol'], array_map(fn ($s) => $s->getUid(), $this->seats));
		$this->assertContains("notify gameStarted(#100, 'carol')", $this->log, 'the game started');
	}

	public function testRandomSeatsAreDrawnAtTheStart(): void {
		$game = $this->invitations()->create('alice', [
			'variant' => 'bughouse',
			'players' => ['alice', 'bob', 'carol', 'dave'],
			'color' => 'r',
		]);
		$this->random->nextU = 1;
		foreach (['bob', 'carol', 'dave'] as $uid) {
			$game = $this->invitations()->accept(100, $uid);
		}
		// Fisher-Yates with j = u mod (i + 1) = 1: swap seats 3 and 1, then 2 and 1, then 1 stays
		$this->assertSame(['alice', 'carol', 'dave', 'bob'], $game->seatUids());
		$this->assertSame(3, $this->random->draws);
	}

	public function testOneDeclineDeclinesTheGame(): void {
		$this->invitations()->create('alice', [
			'variant' => 'bughouse',
			'players' => ['alice', 'bob', 'carol', 'dave'],
		]);
		$game = $this->invitations()->decline(100, 'carol');
		$this->assertSame(Game::STATUS_DECLINED, $game->getStatus());
		$this->assertContains("notify inviteDeclined(#100, 'carol', false)", $this->log);
		$this->assertApiError('invalid_status', fn () => $this->invitations()->accept(100, 'bob'));
	}

	public function testTurnsPassBySeat(): void {
		$game = $this->started();
		$this->assertApiError(
			'not_your_turn',
			fn () => $this->variantGameplay()->move(100, 'bob', 'x', 0, null, null),
		);
		$game = $this->play($game, 'alice', 1);
		$this->assertSame(['1', 1], [$game->getTurn(), $game->getSeatToMove()]);
		$this->assertContains("notify variantTurn(#100, 'alice')", $this->log);
		$game = $this->play($game, 'bob', 2);
		$game = $this->play($game, 'carol', 3);
		$this->assertTrue(GameplayService::canAbort($game), 'dave has not played yet');
		$game = $this->play($game, 'dave', 0);
		$this->assertFalse(GameplayService::canAbort($game));
		$game = $this->play($game, 'alice', 1, 'win:0,2/king');
		$this->assertSame([Game::STATUS_FINISHED, '*', 'win:0,2/king'], [
			$game->getStatus(),
			$game->getResult(),
			$game->getVariantResult(),
		]);
	}

	public function testAResignationEndsTheGameForEveryone(): void {
		$this->started();
		$game = $this->gameplay()->resign(100, 'carol');
		$this->assertSame([Game::STATUS_FINISHED, '*', 'resignation', 'win:0,1,3/resign'], [
			$game->getStatus(),
			$game->getResult(),
			$game->getResultReason(),
			$game->getVariantResult(),
		]);
		$this->assertContains('chat #100 resigned {"color":"2"}', $this->log);
	}

	public function testAResignationInATeamGameLosesForTheTeam(): void {
		$this->started('bughouse', []);
		$game = $this->gameplay()->resign(100, 'bob');
		$this->assertSame('win:0,2/resign', $game->getVariantResult());
	}

	public function testATimeOutLosesForTheSeatToMove(): void {
		$game = $this->started('fourplayer', ['mode' => 'teams']);
		foreach ([['alice', 1], ['bob', 2], ['carol', 3], ['dave', 0]] as [$uid, $next]) {
			$game = $this->play($game, $uid, $next);
		}
		$game->setDeadlineAt(self::NOW - 1);
		$this->assertApiError('game_over', fn () => $this->variantGameplay()->move(100, 'alice', 'x', 4, null, null));
		$this->assertSame([Game::STATUS_FINISHED, 'timeout', 'win:1,3/timeout'], [
			$game->getStatus(),
			$game->getResultReason(),
			$game->getVariantResult(),
		]);
	}

	public function testADrawNeedsEverySeat(): void {
		$this->started();
		$game = $this->gameplay()->draw(100, 'alice', 'offer');
		$this->assertSame(['0', [0]], [$game->getDrawOffer(), VariantTurn::of($game)->drawVotes]);
		$this->assertApiError('draw_not_allowed', fn () => $this->gameplay()->draw(100, 'alice', 'offer'));
		$this->gameplay()->draw(100, 'bob', 'accept');
		$game = $this->gameplay()->draw(100, 'carol', 'offer');
		$this->assertSame([Game::STATUS_ACTIVE, [0, 1, 2]], [$game->getStatus(), VariantTurn::of($game)->drawVotes]);
		$game = $this->gameplay()->draw(100, 'dave', 'accept');
		$this->assertSame([Game::STATUS_FINISHED, 'agreement', 'draw/agreement'], [
			$game->getStatus(),
			$game->getResultReason(),
			$game->getVariantResult(),
		]);
	}

	public function testOneDeclineClosesTheDrawOffer(): void {
		$this->started();
		$this->gameplay()->draw(100, 'alice', 'offer');
		$game = $this->gameplay()->draw(100, 'dave', 'decline');
		$this->assertSame([null, []], [$game->getDrawOffer(), VariantTurn::of($game)->drawVotes]);
		$this->assertApiError('no_draw_offer', fn () => $this->gameplay()->draw(100, 'bob', 'accept'));
	}

	public function testTheSettlementNamesTheSeatsThatAreOut(): void {
		$game = $this->withCarolOut();
		$this->assertSame([[2], '3', [0, 1, 3]], [
			VariantTurn::of($game)->out,
			$game->getTurn(),
			VariantGameplayService::playingSeats($game),
		]);
		$this->assertSame('2', $this->variantMoves[100][5]->getOutSeats());
		$this->assertSame('', $this->variantMoves[100][4]->getOutSeats(), 'no seat out');
	}

	public function testTheSeatsThatAreOutAreChecked(): void {
		$game = $this->started();
		$this->variantGameplay()->move(100, 'alice', 'a0', 0, null, null);
		$settle = fn (int $next, ?array $out) => fn () => $this->variantGameplay()
			->settle(100, 'alice', 0, $next, '', self::HASH, $out);
		foreach ([[4], [-1], [2, 2], [1]] as $out) {
			$e = $this->assertApiError('invalid_argument', $settle(1, $out));
			$this->assertSame('out', $e->getExtra()['field'] ?? null, json_encode($out));
		}
		// a skipped seat may still play: in free for all a player who cannot move sits out
		$game = $this->variantGameplay()->settle(100, 'alice', 0, 2, '', self::HASH, []);
		$this->assertSame(['2', []], [$game->getTurn(), VariantTurn::of($game)->out]);
	}

	public function testASeatThatIsOutStaysOut(): void {
		$game = $this->withCarolOut();
		$this->variantGameplay()->move(100, 'dave', 'a6', 6, null, null);
		$this->assertApiError(
			'invalid_argument',
			fn () => $this->variantGameplay()->settle(100, 'dave', 6, 0, '', self::HASH, []),
		);
		$this->assertApiError(
			'invalid_argument',
			fn () => $this->variantGameplay()->settle(100, 'dave', 6, 2, '', self::HASH, [2]),
			'the seat to move next is not out',
		);
		$game = $this->variantGameplay()->settle(100, 'dave', 6, 1, '', self::HASH, [0, 2]);
		$this->assertSame([0, 2], VariantTurn::of($game)->out);
	}

	public function testABrowserThatDoesNotNameThemTakesNoSkippedSeatAsOut(): void {
		$game = $this->started();
		foreach ([['alice', 1], ['bob', 2], ['carol', 3], ['dave', 0]] as [$uid, $next]) {
			$game = $this->play($game, $uid, $next);
		}
		$game = $this->play($game, 'alice', 3);
		$this->assertSame([], VariantTurn::of($game)->out, 'a skipped seat may only sit out');
		$this->assertNull($this->variantMoves[100][4]->getOutSeats(), 'the move keeps what the browser said');
		$game = $this->play($game, 'dave', 0, '', [1, 2]);
		$this->assertSame([1, 2], VariantTurn::of($game)->out, 'a newer browser names them');
		$this->assertSame('win:3/resign', $this->gameplay()->resign(100, 'alice')->getVariantResult());
	}

	public function testATeamGameDoesNotTakeSkippedSeatsAsOut(): void {
		$game = $this->started('fourplayer', ['mode' => 'teams']);
		$game = $this->play($game, 'alice', 2);
		$this->assertSame([], VariantTurn::of($game)->out);
	}

	public function testTwoSettlementsOfOneMoveAgreeWhenOneDoesNotNameTheSeatsThatAreOut(): void {
		$game = $this->withCarolOut();
		$settle = fn (string $uid, ?array $out) => $this->variantGameplay()
			->settle(100, $uid, 5, 3, '', self::HASH, $out);
		$this->assertSame(Game::STATUS_ACTIVE, $settle('dave', null)->getStatus(), 'an older browser');
		$this->assertSame(Game::STATUS_ACTIVE, $settle('alice', [2])->getStatus());
		$this->variantGameplay()->move(100, 'dave', 'a6', 6, null, null);
		$this->variantGameplay()->settle(100, 'dave', 6, 0, '', self::HASH, null);
		$this->assertSame(Game::STATUS_ACTIVE, $this->variantGameplay()
			->settle(100, 'alice', 6, 0, '', self::HASH, [2])->getStatus(), 'the first settler did not say');
		$this->assertSame(Game::STATUS_ABORTED, $settle('carol', [1, 2])->getStatus(), 'a different list disputes');
		$this->assertSame('disputed', $this->stored[100]->getResultReason());
	}

	public function testAResignationAfterAnEliminationLeavesTheSeatThatIsOut(): void {
		$this->withCarolOut();
		$game = $this->gameplay()->resign(100, 'bob');
		$this->assertSame(['win:0,3/resign', 1], [$game->getVariantResult(), VariantTurn::of($game)->endedBy]);
	}

	public function testATimeOutAfterAnEliminationLeavesTheSeatThatIsOut(): void {
		$game = $this->withCarolOut();
		$game->setDeadlineAt(self::NOW - 1);
		$this->assertApiError('game_over', fn () => $this->variantGameplay()->move(100, 'dave', 'x', 6, null, null));
		$this->assertSame(['timeout', 'win:0,1/timeout', 3], [
			$game->getResultReason(),
			$game->getVariantResult(),
			VariantTurn::of($game)->endedBy,
		]);
	}

	public function testASeatThatIsOutCannotResignAbortOrDraw(): void {
		$this->withCarolOut();
		foreach ([
			fn () => $this->gameplay()->resign(100, 'carol'),
			fn () => $this->gameplay()->abort(100, 'carol'),
			fn () => $this->gameplay()->draw(100, 'carol', 'offer'),
		] as $action) {
			$this->assertApiError('invalid_status', $action);
		}
		$this->gameplay()->draw(100, 'alice', 'offer');
		$this->assertApiError('invalid_status', fn () => $this->gameplay()->draw(100, 'carol', 'accept'));
		$this->assertApiError('invalid_status', fn () => $this->gameplay()->draw(100, 'carol', 'decline'));
	}

	public function testADrawNeedsOnlyTheSeatsThatStillPlay(): void {
		$this->withCarolOut();
		$this->gameplay()->draw(100, 'alice', 'offer');
		$game = $this->gameplay()->draw(100, 'bob', 'accept');
		$this->assertApiError('draw_not_allowed', fn () => $this->gameplay()->draw(100, 'bob', 'accept'));
		$this->assertSame(Game::STATUS_ACTIVE, $game->getStatus());
		$game = $this->gameplay()->draw(100, 'dave', 'accept');
		$this->assertSame([Game::STATUS_FINISHED, 'draw/agreement'], [$game->getStatus(), $game->getVariantResult()]);
	}

	public function testASeatThatGoesOutLeavesTheDrawOffer(): void {
		$game = $this->started();
		foreach ([['alice', 1], ['bob', 2], ['carol', 3], ['dave', 0]] as [$uid, $next]) {
			$game = $this->play($game, $uid, $next, '', []);
		}
		$this->gameplay()->draw(100, 'bob', 'offer');
		$this->gameplay()->draw(100, 'carol', 'accept');
		$this->gameplay()->draw(100, 'dave', 'accept');
		$game = $this->play($game, 'alice', 1, '', [2]);
		$this->assertSame(['1', [1, 3]], [$game->getDrawOffer(), VariantTurn::of($game)->drawVotes], 'carol is out');
		$game = $this->play($game, 'bob', 3, '', [0, 2]);
		$this->assertSame(
			[Game::STATUS_FINISHED, 'draw/agreement'],
			[$game->getStatus(), $game->getVariantResult()],
			'every seat that still plays agreed',
		);
	}

	public function testTheDrawOfferOfASeatThatGoesOutIsClosed(): void {
		$game = $this->started();
		foreach ([['alice', 1], ['bob', 2], ['carol', 3], ['dave', 0]] as [$uid, $next]) {
			$game = $this->play($game, $uid, $next, '', []);
		}
		$this->gameplay()->draw(100, 'bob', 'offer');
		$this->log = [];
		$game = $this->play($game, 'alice', 2, '', [1]);
		$this->assertSame([null, [], Game::STATUS_ACTIVE], [
			$game->getDrawOffer(),
			VariantTurn::of($game)->drawVotes,
			$game->getStatus(),
		]);
		$this->assertContains('chat #100 draw_declined {"color":"1"}', $this->log);
		$this->assertContains('notify drawClosed(#100)', $this->log);
	}

	public function testChatMuteBySeat(): void {
		$this->started();
		$this->assertTrue($this->chat()->setMuted(100, 'carol', true));
		$this->assertSame([2], VariantTurn::of($this->stored[100])->muted);
		$this->chat()->setMuted(100, 'carol', false);
		$this->assertSame([], VariantTurn::of($this->stored[100])->muted);
	}

	public function testARematchMovesEveryPlayerOnBySeat(): void {
		$this->started();
		$this->gameplay()->resign(100, 'alice');
		$this->assertApiError('not_found', fn () => $this->invitations()->rematch(100, 'erin'));
		$rematch = $this->invitations()->rematch(100, 'bob');
		$id = (int)$rematch->getId();
		$this->assertSame(['dave', 'alice', 'bob', 'carol'], $rematch->seatUids(), 'the last seat moves to seat 0');
		$this->assertSame([Game::STATUS_PENDING, 'bob', 100, 'fourplayer', 0], [
			$rematch->getStatus(),
			$rematch->getCreatorUid(),
			$rematch->getRematchOf(),
			$rematch->getVariant() === 'fourplayer' ? 'fourplayer' : null,
			$rematch->getRatedRequested(),
		]);
		$this->assertSame($id, $this->stored[100]->getRematchId());
		$this->assertSame($id, (int)$this->invitations()->rematch(100, 'bob')->getId(), 'asking again changes nothing');
		foreach (['carol', 'alice'] as $uid) {
			$this->invitations()->rematch(100, $uid);
		}
		$this->assertSame(Game::STATUS_PENDING, $this->stored[$id]->getStatus());
		$this->invitations()->rematch(100, 'dave');
		$this->assertSame(Game::STATUS_ACTIVE, $this->stored[$id]->getStatus(), 'every seat taken: the rematch starts');
		$this->assertSame(['dave', 'alice', 'bob', 'carol'], $this->stored[$id]->seatUids());
	}
}
