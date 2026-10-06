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
use OCA\QuantumChess\Service\Game\VariantChain;
use OCA\QuantumChess\Service\Game\VariantGameplayService;
use OCA\QuantumChess\Service\Game\VariantTurn;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Online games of the chess variants: invitations with a variant, moves whose roll the server draws, settlements that
 * pass the turn, disputes that annul the game, and the classic routes that refuse variant games.
 */
#[CoversClass(VariantGameplayService::class)]
#[CoversClass(VariantTurn::class)]
final class VariantGameplayServiceTest extends TestCase {
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

	private function vg(): VariantGameplayService {
		return $this->variantGameplay();
	}

	/** An Atomic game of alice (White, seat 0) against bob (Black, seat 1), started through the invitation. */
	private function started(array $options = []): Game {
		$this->random->nextCoin = true;
		$game = $this->invitations()->create('alice', [
			'opponent' => 'bob',
			'variant' => 'atomic',
			'options' => $options,
		]);
		$game = $this->invitations()->accept((int)$game->getId(), 'bob');
		$this->log = [];
		return $game;
	}

	/** Plays and settles one move; `$next` is the seat to move afterwards. */
	private function play(Game $game, string $uid, string $code, int $next, string $result = ''): Game {
		$ply = $game->getPly();
		$this->variantGameplay()->move((int)$game->getId(), $uid, $code, $ply, null, null);
		return $this->variantGameplay()->settle((int)$game->getId(), $uid, $ply, $next, $result, self::HASH);
	}

	public function testAnInvitationWithAVariantStartsAVariantGame(): void {
		$this->random->nextCoin = true;
		$game = $this->invitations()->create('alice', [
			'opponent' => 'bob',
			'variant' => 'chess960',
			'options' => ['position' => 518],
			'rated' => true,
		]);
		$this->assertSame(
			['chess960', '{"position":518}', 1, 2, 1, '{"v":1,"turns":0,"pending":null}'],
			[
				$game->getVariant(),
				$game->getVariantOptions(),
				$game->getVariantRules(),
				$game->getSeatCount(),
				$game->getRatedRequested(),
				$game->getState(),
			],
			'a two-player variant game may be rated',
		);
		$game = $this->invitations()->accept((int)$game->getId(), 'bob');
		$this->assertSame([Game::STATUS_ACTIVE, 'alice', 'bob', 0], [
			$game->getStatus(),
			$game->getWhiteUid(),
			$game->getBlackUid(),
			$game->getSeatToMove(),
		]);
		$this->assertSame(
			VariantChain::start(100, 'chess960', ['position' => 518], ['alice', 'bob'], self::NOW),
			$game->getChain(),
		);
		$this->assertSame([[0, 'alice', self::NOW], [1, 'bob', self::NOW]], array_map(
			fn ($seat) => [$seat->getSeat(), $seat->getUid(), $seat->getAcceptedAt()],
			$this->seats,
		));
	}

	public function testOnlyTheOnlineVariantsCanBeInvited(): void {
		foreach (['classic', 'chess', 7] as $variant) {
			$e = $this->assertApiError(
				'invalid_argument',
				fn () => $this->invitations()->create('alice', ['opponent' => 'bob', 'variant' => $variant]),
			);
			$this->assertSame('variant', $e->getExtra()['field'] ?? null, (string)$variant);
		}
		foreach ([[1, 2], ['x' => 1.5], ['x' => null], ['x' => str_repeat('a', 1000)]] as $options) {
			$this->assertApiError('invalid_argument', fn () => $this->invitations()->create('alice', [
				'opponent' => 'bob',
				'variant' => 'atomic',
				'options' => $options,
			]));
		}
		$this->assertSame([], $this->log, 'a rejected request stores nothing');
	}

	public function testAMoveGetsItsRollButKeepsTheTurnUntilItIsSettled(): void {
		$game = $this->started();
		$this->random->nextU = 4242;
		$result = $this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, 'client-0001', 1500);
		$move = $result['move'];
		$this->assertSame([0, 0, 'alice', 'e2-e4', 4242, null, 1500], [
			$move->getPly(),
			$move->getSeat(),
			$move->getUid(),
			$move->getCode(),
			$move->getU(),
			$move->getNextSeat(),
			$move->getThinkMs(),
		]);
		$this->assertSame(VariantChain::next(
			VariantChain::start(100, 'atomic', [], ['alice', 'bob'], self::NOW),
			0,
			0,
			'e2-e4',
			4242,
		), $game->getChain());
		$this->assertSame([1, 'w', 0], [$game->getPly(), $game->getTurn(), VariantTurn::of($game)->pending]);
		$this->assertSame(1, $this->random->draws);

		$again = $this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, 'client-0001', null);
		$this->assertTrue($again['replayed']);
		$this->assertSame(1, $this->random->draws, 'a retry draws no new roll');
		$this->assertApiError('conflict', fn () => $this->vg()->move(100, 'alice', 'd2-d4', 1, null, null));
		$this->assertApiError('not_your_turn', fn () => $this->vg()->move(100, 'bob', 'e7-e5', 1, null, null));
		$this->assertSame(['begin', 'insert vmove 0 e2-e4 u 4242', 'save #100 rev 2→3', 'commit'], $this->log);
	}

	public function testTheFormOfAMoveIsChecked(): void {
		$this->started();
		foreach (['', 'e2 e4', "e2-e4\n", str_repeat('a', 256)] as $code) {
			$this->assertApiError(
				'invalid_argument',
				fn () => $this->vg()->move(100, 'alice', $code, 0, null, null),
			);
		}
		$this->assertApiError(
			'invalid_argument',
			fn () => $this->vg()->move(100, 'alice', 'e2-e4', 0, 'bad id!', null),
		);
		$this->assertSame(0, $this->random->draws);
	}

	public function testASettlementPassesTheTurn(): void {
		$game = $this->started();
		$this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, null, null);
		$this->log = [];
		$game = $this->variantGameplay()->settle(100, 'alice', 0, 1, '', self::HASH);
		$this->assertSame(['b', 1, 1, null, self::NOW + 259200], [
			$game->getTurn(),
			$game->getSeatToMove(),
			VariantTurn::of($game)->turns,
			VariantTurn::of($game)->pending,
			$game->getDeadlineAt(),
		]);
		$this->assertSame([
			'begin', 'settle vmove 0 → 1 ', 'save #100 rev 3→4', 'commit', "notify variantTurn(#100, 'alice')",
		], $this->log);
		$this->log = [];
		$this->assertSame($game, $this->variantGameplay()->settle(100, 'bob', 0, 1, '', self::HASH));
		$this->assertSame([], $this->log, 'the same settlement again changes nothing');
	}

	public function testAnyPlayerMaySettleForAMoverWhoLeft(): void {
		$this->started();
		$this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, null, null);
		$game = $this->variantGameplay()->settle(100, 'bob', 0, 1, '', self::HASH);
		$this->assertSame(['b', 'bob'], [$game->getTurn(), $this->variantMoves[100][0]->getSettledBy()]);
	}

	public function testSeveralMovesInOneTurn(): void {
		$game = $this->started();
		$game = $this->play($game, 'alice', 'a', 0);
		$this->assertSame(['w', 1, 0], [$game->getTurn(), $game->getPly(), VariantTurn::of($game)->turns]);
		$this->assertNotContains("notify variantTurn(#100, 'alice')", $this->log, 'the turn did not pass');
		$game = $this->play($game, 'alice', 'submit', 1);
		$this->assertSame(['b', 2, 1], [$game->getTurn(), $game->getPly(), VariantTurn::of($game)->turns]);
	}

	public function testASettledResultFinishesTheGame(): void {
		$game = $this->started();
		$game = $this->play($game, 'alice', 'e2-e4', 1);
		$game = $this->play($game, 'bob', 'f7-f6', 0);
		$this->log = [];
		$game = $this->play($game, 'alice', 'd1-h5', 0, 'win:0/exploded');
		$this->assertSame([Game::STATUS_FINISHED, '1-0', 'exploded', 'win:0/exploded', null], [
			$game->getStatus(),
			$game->getResult(),
			$game->getResultReason(),
			$game->getVariantResult(),
			$game->getDeadlineAt(),
		]);
		$this->assertSame([
			'begin', 'insert vmove 2 d1-h5 u 123', 'save #100 rev 6→7', 'commit',
			'begin', 'settle vmove 2 → 0 win:0/exploded', 'rate #100 1-0', 'save #100 rev 7→8', 'commit',
			'notify gameOver(#100, NULL)',
		], $this->log, 'the rating service records nothing for a variant game (RatingServiceTest)');
		$this->assertSame(
			['1/2-1/2', '0-1'],
			[
				VariantGameplayService::classicResult(\OCA\QuantumChess\Service\Game\VariantResult::of([], 'quiet')),
				VariantGameplayService::classicResult(\OCA\QuantumChess\Service\Game\VariantResult::of([1], 'king')),
			],
		);
	}

	public function testADifferentSettlementAnnulsTheGame(): void {
		$game = $this->started();
		$game = $this->play($game, 'alice', 'e2-e4', 1);
		$this->log = [];
		$game = $this->variantGameplay()->settle(100, 'bob', 0, 0, '', self::HASH);
		$this->assertSame([Game::STATUS_ABORTED, 'disputed', null, 0], [
			$game->getStatus(),
			$game->getResultReason(),
			$game->getResult(),
			$game->getRated(),
		]);
		$this->assertContains('chat #100 disputed {"ply":0}', $this->log);
		$this->assertContains("notify gameOver(#100, 'bob')", $this->log);
	}

	public function testADisputeAnnulsEvenAFinishedGame(): void {
		$game = $this->started();
		$game = $this->play($game, 'alice', 'e2-e4', 0, 'win:0/king');
		$this->assertSame(Game::STATUS_FINISHED, $game->getStatus());
		$game = $this->variantGameplay()->dispute(100, 'bob', 0);
		$this->assertSame([Game::STATUS_ABORTED, null], [$game->getStatus(), $game->getVariantResult()]);
		$this->log = [];
		$this->variantGameplay()->dispute(100, 'alice', 0);
		$this->assertSame([], $this->log, 'an annulled game stays as it is');
		$this->assertApiError('invalid_argument', fn () => $this->vg()->dispute(100, 'bob', 9));
		$this->assertApiError('not_found', fn () => $this->vg()->dispute(100, 'carol', 0));
	}

	public function testSettlementsAreChecked(): void {
		$this->started();
		$this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, null, null);
		$settle = fn (int $ply, int $next, string $result, string $hash)
			=> fn () => $this->vg()->settle(100, 'alice', $ply, $next, $result, $hash);
		$this->assertApiError('invalid_argument', $settle(0, 2, '', self::HASH));
		$this->assertApiError('invalid_argument', $settle(0, 1, 'win:3/king', self::HASH));
		$this->assertApiError('invalid_argument', $settle(0, 1, '', 'XYZ'));
		$this->assertApiError('invalid_argument', $settle(0, 1, '', self::HASH . "\n"));
		$this->assertApiError('invalid_argument', $settle(0, 1, "draw/quiet\n", self::HASH));
		$this->assertApiError('conflict', $settle(1, 1, '', self::HASH));
	}

	public function testAbortAndTimeOutCountTurnsNotPlies(): void {
		$game = $this->started();
		$game = $this->play($game, 'alice', 'a', 0);
		$game = $this->play($game, 'alice', 'submit', 1);
		$this->assertTrue(GameplayService::canAbort($game), 'only White has played');
		$game = $this->play($game, 'bob', 'submit', 0);
		$this->assertFalse(GameplayService::canAbort($game));
		$this->assertApiError('abort_not_allowed', fn () => $this->gameplay()->abort(100, 'alice'));

		$game->setDeadlineAt(self::NOW - 1);
		$this->assertApiError('game_over', fn () => $this->vg()->move(100, 'alice', 'e2-e4', 3, null, null));
		$this->assertSame([Game::STATUS_FINISHED, '0-1', 'timeout'], [
			$game->getStatus(),
			$game->getResult(),
			$game->getResultReason(),
		], 'White did not move in time');
	}

	public function testATimeOutBeforeBothPlayedAborts(): void {
		$game = $this->started();
		$game = $this->play($game, 'alice', 'e2-e4', 1);
		$game->setDeadlineAt(self::NOW - 1);
		$this->assertApiError('game_over', fn () => $this->vg()->move(100, 'bob', 'e7-e5', 1, null, null));
		$this->assertSame([Game::STATUS_ABORTED, 'aborted_timeout'], [$game->getStatus(), $game->getResultReason()]);
	}

	public function testResigningAndDrawsWorkAsInClassicGames(): void {
		$this->started();
		$game = $this->gameplay()->draw(100, 'alice', 'offer');
		$this->assertSame('w', $game->getDrawOffer());
		$this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, null, null);
		$this->variantGameplay()->settle(100, 'alice', 0, 1, '', self::HASH);
		$this->assertSame('w', $game->getDrawOffer(), 'the offer stays while its maker moves');
		$this->variantGameplay()->move(100, 'bob', 'e7-e5', 1, null, null);
		$this->variantGameplay()->settle(100, 'bob', 1, 0, '', self::HASH);
		$this->assertSame([null, 1], [$game->getDrawOffer(), $game->getLastDrawW()], 'a move declines the offer');
		$game = $this->gameplay()->resign(100, 'bob');
		$this->assertSame([Game::STATUS_FINISHED, '1-0', 'resignation'], [
			$game->getStatus(),
			$game->getResult(),
			$game->getResultReason(),
		]);
	}

	public function testTheClassicMoveRouteRefusesVariantGames(): void {
		$this->started();
		$this->assertApiError('invalid_status', fn () => $this->gameplay()->move(100, 'alice', 'e2-e4', 0, null, null));
		$this->store(GameBuilder::active());
		$this->assertApiError('invalid_status', fn () => $this->vg()->move(7, 'alice', 'e2-e4', 0, null, null));
		$this->assertApiError('invalid_status', fn () => $this->vg()->settle(7, 'alice', 0, 1, '', self::HASH));
	}

	public function testQueriesReturnTheVariantMoves(): void {
		$game = $this->started();
		$this->play($game, 'alice', 'e2-e4', 1);
		$this->play($game, 'bob', 'e7-e5', 0);
		$full = $this->queries()->getFull(100, 'alice');
		$this->assertSame(['e2-e4', 'e7-e5'], array_map(fn ($m) => $m->getCode(), $full['moves']));
		$poll = $this->queries()->poll(100, 'bob', 0, 1, 0);
		$this->assertSame(['e7-e5'], array_map(fn ($m) => $m->getCode(), $poll['moves'] ?? []));
	}
}
