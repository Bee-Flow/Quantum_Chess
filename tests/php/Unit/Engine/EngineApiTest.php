<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Engine\IllegalMoveException;
use OCA\QuantumChess\Engine\InvalidStateException;
use OCA\QuantumChess\Engine\SetupException;
use PHPUnit\Framework\TestCase;

/**
 * The public contract of the Engine facade beyond the fixtures: shapes, sampling precedence (§5.2), exceptions, the
 * cache being invisible, and the sequence of calls the server makes for an online move.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */
final class EngineApiTest extends TestCase {
	private Engine $e;

	protected function setUp(): void {
		$this->e = new Engine();
	}

	/**
	 * @return array<string, mixed>
	 */
	private function w2(): array {
		return $this->e->setupPosition(['fen' => '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'prelude' => ['g8-f6|h6']]);
	}

	public function testConstants(): void {
		$this->assertSame(1, Engine::V);
		$this->assertSame(16777216, Engine::T);
		$this->assertSame(2 ** 24, Engine::T);
		$this->assertSame([8, 64, 4, 100, 3, 1200], [Engine::BUDGET, Engine::MAX_WORLDS, Engine::MAX_LOCATIONS, Engine::FIFTY_MOVE_PLIES, Engine::REPETITION_COUNT, Engine::MAX_PLY]);
		$this->assertSame(2 ** 36, Engine::LINK_THRESHOLD);
		$this->assertCount(23, Engine::ILLEGAL_REASONS);
		$this->assertSame('game_over', Engine::ILLEGAL_REASONS[0]);
		$this->assertSame('merge_part_stuck', Engine::ILLEGAL_REASONS[22]);
		$this->assertCount(10, Engine::SETUP_ERRORS);
		$this->assertSame(['king_captured', 'king_trapped', 'bare_kings', 'repetition', 'fifty_moves', 'max_ply', 'no_moves'], Engine::RESULT_REASONS);
		$this->assertSame(PHP_INT_SIZE, 8, 'the engine needs 64-bit integers');
	}

	public function testInitialStateIsAFreshCanonicalArray(): void {
		$s = $this->e->initialState();
		$this->assertSame(Engine::START_JSON, json_encode($s, JSON_UNESCAPED_SLASHES));
		$this->assertTrue(array_is_list($s['worlds']) && array_is_list($s['captured']) && array_is_list($s['history']));
		$s['turn'] = 'b';
		$this->assertSame('w', $this->e->initialState()['turn']);
		$this->assertNull($this->e->gameResult($s));
	}

	public function testSerializeStateRebuildsTheKeyOrder(): void {
		$s = $this->e->initialState();
		$odd = ['result' => null] + array_reverse($s, true);
		$this->assertSame(Engine::START_JSON, $this->e->serializeState($odd));
		unset($odd['ep']);
		$this->expectException(InvalidStateException::class);
		$this->e->serializeState($odd);
	}

	public function testLegalMoveShape(): void {
		$moves = $this->e->generateMoves($this->w2());
		$byCode = array_column($moves, null, 'code');
		$c1h6 = $byCode['c1-h6'];
		$this->assertSame(['type', 'from', 'to', 'code', 'piece', 'resolution', 'measured', 'fallback', 'capture', 'happenWeight', 'outcomes', 'successProbability'], array_keys($c1h6));
		$this->assertSame(['standard', [2], [47], 'c1-h6', 4, 'rolled', true, false, true, Engine::T], array_slice(array_values($c1h6), 0, 10));
		$this->assertSame(1.0, $c1h6['successProbability']);
		$promo = $this->e->generateMoves($this->e->setupPosition(['fen' => '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1']));
		$codes = array_column($promo, 'code');
		$this->assertSame(['b7-b8=Q', 'b7-b8=R', 'b7-b8=B', 'b7-b8=N'], array_slice($codes, 5, 4));
		$this->assertSame(['type', 'from', 'to', 'promo', 'code'], array_slice(array_keys($promo[5]), 0, 5));
		$this->assertSame('q', $promo[5]['promo']);
	}

	public function testSamplingPrecedence(): void {
		$w2 = $this->w2();
		// outcome > u > rng > random
		$r = $this->e->applyMove($w2, 'c1-h6', 16000000, 'move', static fn (): float => 0.99);
		$this->assertSame(['key' => 'move', 'u' => null], array_slice($r['measurement'] ?? [], 0, 2));
		$r = $this->e->applyMove($w2, 'c1-h6', 100, null, static fn (): float => 0.99);
		$this->assertSame(['key' => 'move', 'u' => 100], array_slice($r['measurement'] ?? [], 0, 2));
		$r = $this->e->applyMove($w2, 'c1-h6', null, null, static fn (): float => 0.75);
		$this->assertSame(['key' => 'capture', 'u' => 12582912], array_slice($r['measurement'] ?? [], 0, 2));
		for ($i = 0; $i < 20; $i++) {
			$r = $this->e->applyMove($w2, 'c1-h6');
			$u = $r['measurement']['u'] ?? -1;
			$this->assertGreaterThanOrEqual(0, $u);
			$this->assertLessThan(Engine::T, $u);
			$this->assertSame($u < 8388608 ? 'move' : 'capture', $r['measurement']['key'] ?? null);
		}
	}

	public function testOptionsAreIgnoredForMovesThatAreNotRolled(): void {
		$r = $this->e->applyMove($this->w2(), 'e1-d1', -5, 'bogus', static fn (): float => 7.0);
		$this->assertNull($r['measurement']);
		$this->assertSame('b', $r['state']['turn']);
	}

	public function testBadRandomInputsThrowInvalidArgument(): void {
		$w2 = $this->w2();
		foreach ([
			static fn (Engine $e) => $e->applyMove($w2, 'c1-h6', Engine::T),
			static fn (Engine $e) => $e->applyMove($w2, 'c1-h6', -1),
			static fn (Engine $e) => $e->applyMove($w2, 'c1-h6', null, 'miss'),
			static fn (Engine $e) => $e->applyMove($w2, 'c1-h6', null, null, static fn (): float => 1.0),
			static fn (Engine $e) => $e->applyMove($w2, 'c1-h6', null, null, static fn (): float => NAN),
			static fn (Engine $e) => $e->applyMove($w2, 'c1-h6', null, null, static fn (): string => '0.5'),
			static fn (Engine $e) => $e->moveNotation($w2, 'c1-h6'),
			static fn (Engine $e) => $e->moveNotation($w2, 'c1-h6', ['key' => 'miss']),
			static fn (Engine $e) => $e->kingDanger($w2, 'white'),
			static fn (Engine $e) => $e->budget($w2, ''),
			static fn (Engine $e) => $e->conditionalView($w2, 64),
			static fn (Engine $e) => $e->chainStart(-1, 'a', 'b', 0),
		] as $i => $call) {
			try {
				$call($this->e);
				$this->fail('call ' . $i . ' did not throw');
			} catch (\InvalidArgumentException) {
				$this->addToAssertionCount(1);
			}
		}
	}

	public function testIllegalMovesThrowWithTheReason(): void {
		$w2 = $this->w2();
		foreach (['c1-c2' => 'unreachable', 'g8-f6' => 'no_piece', 'e8-d8' => 'not_your_piece', 'Nc1-h6' => 'piece_mismatch', 'nonsense' => 'malformed', 'e1-g1' => 'castle_no_right'] as $code => $reason) {
			try {
				$this->e->applyMove($w2, $code);
				$this->fail($code . ' was applied');
			} catch (IllegalMoveException $ex) {
				$this->assertSame($reason, $ex->getReason(), $code);
				$this->assertSame($code, $ex->getMove());
				$this->assertSame($reason, $this->e->whyIllegal($w2, $code));
				$this->assertNull($this->e->findMove($w2, $code));
				$this->assertFalse($this->e->isLegal($w2, $code));
			}
		}
		$done = $this->e->applyMove($w2, 'c1-h6', 9000000)['state'];
		$done = $this->e->applyMove($done, 'e8-d8')['state'];
		$over = $this->e->applyMove($this->e->setupPosition(['fen' => '8/8/8/8/8/8/3k4/4K3 b - - 0 1']), 'd2-e1')['state'];
		$this->assertSame('game_over', $this->e->whyIllegal($over, 'e1-e2'));
		$this->assertSame('malformed', $this->e->whyIllegal($over, 'nonsense'), 'an unparsable string is malformed first');
		$this->assertSame('game_over', $this->e->whyIllegal($over, 42), 'any other input on a finished game');
		$this->assertSame('malformed', $this->e->whyIllegal($done, 42));
		$this->assertSame([], $this->e->generateMoves($over));
		$this->assertSame([], $this->e->legalCodes($over));
		$this->assertFalse($this->e->hasAnyLegalMove($over));
		$this->assertSame(['result' => '0-1', 'reason' => 'king_captured'], $this->e->gameResult($over));
		$this->expectException(IllegalMoveException::class);
		$this->e->getOutcomes($over, 'e1-e2');
	}

	public function testFindMoveAcceptsCodesMoveArraysAndLegalMoves(): void {
		$w2 = $this->w2();
		$legal = $this->e->findMove($w2, 'c1-h6');
		$this->assertNotNull($legal);
		$this->assertSame($legal, $this->e->findMove($w2, $legal));
		$this->assertSame($legal, $this->e->findMove($w2, ['type' => 'standard', 'from' => [2], 'to' => [47]]));
		$this->assertSame($legal, $this->e->findMove($w2, 'Bc1xh6 {capture 50%}'));
		$this->assertSame($legal, $this->e->findMove($w2, '  c1h6+ '));
		$this->assertSame('c1-h6', $this->e->applyMove($w2, $legal, 1)['move']['code']);
		$this->assertTrue($this->e->hasAnyLegalMove($w2));
	}

	public function testGetOutcomes(): void {
		$w2 = $this->w2();
		$o = $this->e->getOutcomes($w2, 'c1-h6');
		$this->assertSame(['move', 'capture'], array_column($o, 'key'));
		$this->assertSame([8388608, 8388608], array_column($o, 'weight'));
		$this->assertSame([0.5, 0.5], array_column($o, 'probability'));
		$this->assertSame([true, true], array_column($o, 'happened'));
		$this->assertSame([null, 23], array_column($o, 'captured'));
		$this->assertSame(
			$this->e->serializeState($this->e->applyMove($w2, 'c1-h6', null, 'capture')['state']),
			$this->e->serializeState($o[1]['state']),
		);
		$quantum = $this->e->getOutcomes($this->e->initialState(), 'g1-f3|h3');
		$this->assertSame([['quantum', Engine::T, 1.0, true, null]], array_map(static fn (array $x): array => [$x['key'], $x['weight'], $x['probability'], $x['happened'], $x['captured']], $quantum));
		$certain = $this->e->getOutcomes($this->e->initialState(), 'e2-e4');
		$this->assertSame('certain', $certain[0]['key']);
		$this->assertSame('-', $certain[0]['state']['ep'], 'no black pawn beside e4');
		$this->assertNull($certain[0]['captured']);
	}

	public function testViewsShapes(): void {
		$w2 = $this->w2();
		$view = $this->e->squareView($w2);
		$this->assertCount(64, $view);
		$this->assertSame(['piece' => 23, 'type' => 'n', 'color' => 'b', 'weight' => 8388608, 'probability' => 0.5], $view[45]);
		$this->assertNull($view[0]);
		$locs = $this->e->pieceLocations($w2);
		$this->assertCount(32, $locs);
		$this->assertSame([['square' => 45, 'weight' => 8388608, 'probability' => 0.5], ['square' => 47, 'weight' => 8388608, 'probability' => 0.5]], $locs[23]);
		$this->assertSame([], $locs[1]);
		$this->assertSame(2, $this->e->worldCount($w2));
		$this->assertSame(0.0, $this->e->moveRisk($w2, 'c1-h6'));
		// W4 after 2. a1-a8: the rook is on a8 in half the worlds and sweeps the eighth rank.
		$w4 = $this->e->applyMove($this->e->setupPosition(['fen' => '4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1']), 'b6-a4|c4')['state'];
		$w4 = $this->e->applyMove($w4, 'a1-a8')['state'];
		$this->assertSame(Engine::T / 2, $this->e->kingDanger($w4, 'b'));
		$this->assertSame(0.5, $this->e->moveRisk($w4, 'e8-d8'));
		$this->assertSame(0.0, $this->e->moveRisk($w4, 'e8-e7'));
		$this->assertFalse($this->e->kingTrapped($w4));
		$this->assertSame(0, $this->e->pct(0));
		$this->assertSame(1, $this->e->pct(1));
		$this->assertSame(99, $this->e->pct(Engine::T - 1));
		$this->assertSame(100, $this->e->pct(Engine::T));
		$this->assertSame(50, $this->e->pct(8388608));
	}

	public function testTheCacheNeverConfusesStates(): void {
		// Same position, different clocks and history: every result must follow the exact state passed in.
		$s = $this->e->setupPosition(['fen' => '4k3/8/8/8/8/8/8/R3K3 w - - 0 1']);
		$t = $s;
		$t['halfmove'] = 7;
		$t['fullmove'] = 9;
		$this->assertSame(1, $this->e->applyMove($s, 'a1-a2')['state']['halfmove']);
		$this->assertSame(8, $this->e->applyMove($t, 'a1-a2')['state']['halfmove']);
		$this->assertSame(9, $this->e->applyMove($t, 'a1-a2')['state']['fullmove']);
		$this->assertSame(1, $this->e->applyMove($s, 'a1-a2')['state']['fullmove']);
		// A finished copy of a running state.
		$f = $s;
		$f['result'] = ['result' => '1/2-1/2', 'reason' => 'no_moves'];
		$this->assertNotSame([], $this->e->generateMoves($s));
		$this->assertSame([], $this->e->generateMoves($f));
		$this->assertNotSame([], $this->e->generateMoves($s));
		// Many states through one instance (more than the cache holds).
		$state = $this->e->initialState();
		$codes = [];
		for ($i = 0; $i < 40; $i++) {
			$codes[] = $this->e->legalCodes($state);
			$state = $this->e->applyMove($state, $codes[$i][intdiv(count($codes[$i]), 2)], 5000000)['state'];
		}
		$fresh = new Engine();
		$state = $fresh->initialState();
		for ($i = 0; $i < 40; $i++) {
			$this->assertSame($codes[$i], (new Engine())->legalCodes($state));
			$state = $fresh->applyMove($state, $codes[$i][intdiv(count($codes[$i]), 2)], 5000000)['state'];
		}
	}

	public function testSetupAcceptsAStateAndRejectsBadSpecs(): void {
		$s = $this->e->setupPosition(['state' => json_decode(Engine::START_JSON, true)]);
		$this->assertSame(Engine::START_JSON, $this->e->serializeState($s));
		$this->assertSame(Engine::START_JSON, $this->e->serializeState($this->e->setupPosition(['state' => Engine::START_JSON])));
		foreach ([[['state' => null], 'invalid_state'], [[], 'bad_fen'], [['fen' => 42], 'bad_fen'], [['fen' => '4k3/8/8/8/8/8/8/4K3 w - -', 'prelude' => 'e1-e2'], 'prelude_bad_code'],
			[['fen' => '4k3/8/8/8/8/8/8/4K3 w - -', 'prelude' => ['O-O']], 'prelude_bad_code'], [['fen' => '4k3/8/8/8/8/8/8/4K3 w - - 0 0'], 'bad_fen'],
			[['fen' => '4k3/8/8/8/8/8/8/4K3 w KK - 0 1'], 'bad_fen'], [['fen' => '4k3/8/8/8/8/8/8/4K3 x - - 0 1'], 'bad_fen']] as [$spec, $reason]) {
			try {
				$this->e->setupPosition($spec);
				$this->fail('accepted ' . json_encode($spec));
			} catch (SetupException $ex) {
				$this->assertSame($reason, $ex->getReason(), json_encode($spec) ?: '');
			}
		}
		// Four FEN fields; long zero-padded clocks are numbers.
		$this->assertSame([0, 1], array_values(array_intersect_key($this->e->setupPosition(['fen' => '4k3/8/8/8/8/8/8/4K3 w - -']), ['halfmove' => 0, 'fullmove' => 0])));
		$this->assertSame(5, $this->e->setupPosition(['fen' => '4k3/8/8/8/8/8/8/4K3 w - - 0000000000000000000005 1'])['halfmove']);
	}

	public function testServerMoveFlow(): void {
		// The calls the server makes for an online move: find the move, draw u only for a rolled move, apply it,
		// write its notation, serialise the new state, extend the hash chain, and validate the stored state again.
		$engine = new Engine();
		$state = $engine->validateState(Engine::START_JSON);
		$chain = $engine->chainStart(7, 'alice', 'bob', 1790000000);
		foreach (['e2e4', 'g8-h6|f6', 'Bf1-c4', 'f6|h6-g8', 'Qd1-h5', '?Na4'] as $code) {
			$legal = $engine->findMove($state, $code);
			if ($legal === null) {
				$this->assertIsString($engine->whyIllegal($state, $code));
				continue;
			}
			$u = $legal['resolution'] === 'rolled' ? random_int(0, 16777215) : null;
			$ply = $state['ply'];
			$r = $engine->applyMove($state, $legal['code'], u: $u);
			$notation = $engine->moveNotation($state, $legal['code'], $r['measurement']);
			$json = $engine->serializeState($r['state']);
			$chain = $engine->chainNext($chain, $ply, $legal['code'], $r['measurement']['u'] ?? null, $r['measurement']['key'] ?? null, $json);
			$this->assertSame($legal['code'], $engine->findMove($state, $notation)['code'] ?? null);
			$this->assertSame(64, strlen($chain));
			$this->assertSame(66, strlen($engine->supportKey($r['state'])));
			$this->assertLessThanOrEqual(64, strlen($notation), 'fits the notation column');
			$state = $engine->validateState($json);
		}
		$this->assertSame(5, $state['ply']);
	}
}
