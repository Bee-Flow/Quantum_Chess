<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\VariantCatalog;
use OCA\QuantumChess\Service\Game\VariantGameplayService;
use OCA\QuantumChess\Service\Game\VariantTurn;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use OCA\QuantumChess\Variants\VariantEngine;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Online games of the server-ruled variants, Kriegspiel and Fog of war (docs/development/online-variants.md,
 * section 6): the server keeps the real position, refuses or plays and settles every move, sends each player only
 * their own view, hides the moves until the game has ended and previews the odds of a move.
 */
#[CoversClass(VariantGameplayService::class)]
#[CoversClass(VariantTurn::class)]
#[CoversClass(VariantCatalog::class)]
final class RefereedGameplayTest extends TestCase {
	use GameServiceFixture;

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

	/** A game of `$variant`, alice (White, seat 0) against bob (Black, seat 1). */
	private function started(string $variant = 'kriegspiel'): Game {
		$this->random->nextCoin = true;
		$game = $this->invitations()->create('alice', ['opponent' => 'bob', 'variant' => $variant]);
		$game = $this->invitations()->accept((int)$game->getId(), 'bob');
		$this->log = [];
		return $game;
	}

	/** @return array<string, mixed> */
	private function board(Game $game): array {
		return VariantEngine::decode((string)VariantTurn::of($game)->board);
	}

	/**
	 * The squares of the pieces of `$side` in a state.
	 *
	 * @param array<string, mixed> $state
	 * @return list<int>
	 */
	private function squaresOf(array $state, int $side): array {
		$out = [];
		foreach ($state['worlds'] as $world) {
			$b = (array)$world['b'];
			foreach ($b['sq'] as $id => $sq) {
				if ($b['sd'][$id] === $side && $sq >= 0) {
					$out[] = $sq;
				}
			}
		}
		return array_values(array_unique($out));
	}

	public function testOnlyKriegspielAndFogOfWarAreRefereed(): void {
		$this->assertTrue(VariantCatalog::isRefereed('kriegspiel'));
		$this->assertTrue(VariantCatalog::isRefereed('darkchess'));
		$this->assertFalse(VariantCatalog::isRefereed('atomic'));
		$this->assertTrue(VariantCatalog::isOnline('kriegspiel'));
	}

	public function testAGameStartsWithTheRealPositionAndAViewPerPlayer(): void {
		$game = $this->started();
		$this->assertSame(
			VariantEngine::positionHash(VariantEngine::newGame('kriegspiel')),
			VariantEngine::positionHash($this->board($game)),
		);
		$alice = VariantGameplayService::viewOf($game, 'alice');
		$this->assertNotNull($alice);
		$this->assertSame([], $this->squaresOf($alice, 1), 'white sees no black piece');
		$this->assertCount(16, $this->squaresOf($alice, 0));
		$this->assertSame(range(0, 15), $alice['visible']);
		$this->assertNull(VariantGameplayService::viewOf($game, 'carol'), 'no view for someone who does not play');
		$atomic = $this->invitations()->create('alice', ['opponent' => 'carol', 'variant' => 'atomic']);
		$this->assertNull(VariantTurn::of($atomic)->board, 'the browsers rule Atomic');
	}

	public function testARefusedMoveChangesNothing(): void {
		$game = $this->started();
		$result = $this->variantGameplay()->move(100, 'alice', 'e2-e5', 0, 'client-0001', null);
		$this->assertSame([true, null, false], [$result['refused'], $result['move'], $result['replayed']]);
		$this->assertSame([0, 'w', 0], [$game->getPly(), $game->getTurn(), $this->random->draws]);
		$this->assertSame([], $this->log, 'nothing is stored');
	}

	public function testAnAcceptedMoveIsRolledPlayedAndSettledByTheServer(): void {
		$game = $this->started();
		$this->random->nextU = 77;
		$result = $this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, 'client-0001', 900);
		$move = $result['move'];
		$this->assertNotNull($move);
		$expected = VariantEngine::apply(VariantEngine::newGame('kriegspiel'), 'e2-e4', 77);
		$this->assertNotNull($expected);
		$settlement = VariantEngine::settlement($expected);
		$this->assertSame(
			[false, 'e2-e4', 77, 1, '', $settlement['stateHash'], 'alice'],
			[
				$result['refused'],
				$move->getCode(),
				$move->getU(),
				$move->getNextSeat(),
				$move->getResult(),
				$move->getStateHash(),
				$move->getSettledBy(),
			],
		);
		$this->assertSame([1, 'b', 1, null], [
			$game->getPly(),
			$game->getTurn(),
			$game->getSeatToMove(),
			VariantTurn::of($game)->pending,
		]);
		$this->assertSame($settlement['stateHash'], VariantEngine::positionHash($this->board($game)));
		$this->assertSame(1, VariantTurn::of($game)->turns);
		$this->assertContains("notify variantTurn(#100, 'alice')", $this->log);
		$again = $this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, 'client-0001', null);
		$this->assertTrue($again['replayed']);
		$this->assertApiError(
			'not_your_turn',
			fn () => $this->variantGameplay()->move(100, 'alice', 'd2-d4', 1, null, null),
		);
	}

	public function testTheBrowsersSettleAndDisputeNothing(): void {
		$this->started();
		$this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, null, null);
		$this->assertApiError(
			'invalid_status',
			fn () => $this->variantGameplay()->settle(100, 'bob', 0, 1, '', '0123456789abcdef'),
		);
		$this->assertApiError('invalid_status', fn () => $this->variantGameplay()->dispute(100, 'bob', 0));
	}

	public function testTheMovesStayHiddenUntilTheGameEnds(): void {
		$game = $this->started();
		$this->variantGameplay()->move(100, 'alice', 'e2-e4', 0, null, null);
		$this->variantGameplay()->move(100, 'bob', 'e7-e5', 1, null, null);
		$this->assertSame([], $this->queries()->getFull(100, 'alice')['moves']);
		$this->assertSame([], $this->queries()->poll(100, 'bob', 0, 0, 0)['moves'] ?? []);
		$bob = VariantGameplayService::viewOf($game, 'bob');
		$this->assertNotNull($bob);
		$last = (array)$bob['history'][0];
		$this->assertSame(['', 0], [$last['code'], $last['side']], 'white\'s move is hidden from black');

		$this->gameplay()->resign(100, 'bob');
		$this->assertSame(Game::STATUS_FINISHED, $game->getStatus());
		$codes = array_map(fn ($m) => $m->getCode(), $this->queries()->getFull(100, 'bob')['moves']);
		$this->assertSame(['e2-e4', 'e7-e5'], $codes);
		$revealed = VariantGameplayService::viewOf($game, 'bob');
		$this->assertNotNull($revealed);
		$this->assertNull($revealed['visible']);
		$this->assertCount(16, $this->squaresOf($revealed, 0), 'the whole board is shown');
	}

	public function testAKingCaptureFinishesTheGame(): void {
		$file = __DIR__ . '/../../../../fixtures/referee/kriegspiel.json';
		$fixture = json_decode((string)file_get_contents($file), true);
		$replay = null;
		foreach ($fixture['games'] as $candidate) {
			if (($candidate['result']['reason'] ?? null) === 'king') {
				$replay = $candidate;
				break;
			}
		}
		$this->assertNotNull($replay);
		$game = $this->started();
		foreach ($replay['steps'] as $step) {
			$this->random->nextU = $step['u'];
			$uid = $step['turn'] === 0 ? 'alice' : 'bob';
			$result = $this->variantGameplay()->move(100, $uid, $step['code'], $step['ply'], null, null);
			$this->assertSame($step['stateHash'], $result['move']?->getStateHash(), 'ply ' . $step['ply']);
		}
		$last = end($replay['steps']);
		$this->assertSame(Game::STATUS_FINISHED, $game->getStatus());
		$this->assertSame($last['result'], $game->getVariantResult());
		$this->assertSame($replay['result']['winner'] === 0 ? '1-0' : '0-1', $game->getResult());
	}

	public function testFogOfWarPreviewsTheOddsOfAMove(): void {
		$this->started('darkchess');
		$outcomes = $this->variantGameplay()->preview(100, 'alice', 'e2-e4');
		$this->assertNotNull($outcomes);
		$this->assertSame(['move'], array_map(fn (array $o) => $o['key'], $outcomes));
		$this->assertNull($this->variantGameplay()->preview(100, 'alice', 'e2-e5'));
		$this->assertApiError('not_your_turn', fn () => $this->variantGameplay()->preview(100, 'bob', 'e7-e5'));
	}
}
