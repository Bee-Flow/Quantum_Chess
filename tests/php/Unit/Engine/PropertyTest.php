<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Property tests (§12) over seeded random playouts, checked after every applied move: I1–I12 and canonical bytes,
 * Σ weights = T, both budgets ≤ 8, B(¬mover) never grows, ≤ 64 worlds, the notation round trip and the win mark,
 * measurement records, getOutcomes = applyMove, determinism across instances, and cross-checks of kingDanger,
 * kingTrapped and moveRisk against naive transcriptions of their definitions.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */
final class PropertyTest extends TestCase {
	private const STARTS = [
		['fen' => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'prelude' => []],
		['fen' => 'r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1', 'prelude' => []],
		['fen' => '4k3/pp3ppp/8/8/8/8/PP3PPP/4K3 w - - 0 1', 'prelude' => []],
		['fen' => '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'prelude' => ['d1-d4|h5', 'd8-a5|d5']],
		['fen' => 'r3k3/1P6/8/8/8/8/6p1/4K2R w Kq - 0 1', 'prelude' => []],
		['fen' => '4k3/8/8/2n1b3/8/8/8/2N1K1B1 w - - 0 1', 'prelude' => []],
		['fen' => '7k/5ppp/8/8/8/8/5PPP/R6K w - - 0 1', 'prelude' => []],
		[
			'fen' => 'r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R w - - 0 1',
			'prelude' => ['c3-a4|b5', 'e3-g5|h6', 'd2-c1|e2', 'c6-a5|b4', 'e6-g4|h3', 'd7-c8|e7'],
		],
	];

	private int $rng = 1;

	/**
	 * Deterministic xorshift32 in [0, 1).
	 */
	private function random(): float {
		$x = $this->rng;
		$x ^= ($x << 13) & 0xFFFFFFFF;
		$x ^= $x >> 17;
		$x ^= ($x << 5) & 0xFFFFFFFF;
		$this->rng = $x;
		return $x / 4294967296;
	}

	/**
	 * @template T
	 * @param list<T> $list
	 * @return T
	 */
	private function pick(array $list): mixed {
		return $list[(int)floor($this->random() * count($list))];
	}

	/**
	 * @param list<array<string, mixed>> $moves
	 * @return array<string, mixed>
	 */
	private function choose(array $moves, string $policy): array {
		$r = $this->random();
		$filter = null;
		if ($policy === 'quantum' && $r < 0.6) {
			$filter = static fn (array $m): bool => $m['type'] !== 'standard' || $m['resolution'] !== 'certain';
		} elseif ($policy === 'aggressive' && $r < 0.7) {
			$filter = static fn (array $m): bool => $m['capture'] === true;
		} elseif ($policy === 'merge' && $r < 0.5) {
			$filter = static fn (array $m): bool => $m['type'] === 'merge' || $m['type'] === 'measure';
		}
		if ($filter !== null) {
			$list = array_values(array_filter($moves, $filter));
			if ($list !== []) {
				return $this->pick($list);
			}
		}
		return $this->pick($moves);
	}

	/**
	 * Naive kingDanger: flip the turn and take the best capture weight on the king square among the opponent's
	 * legal standard moves and merges.
	 *
	 * @param array<string, mixed> $state
	 */
	private static function naiveDanger(Engine $e, array $state, string $color): int {
		$k = $e->pieceLocations($state)[$color === 'w' ? 0 : 16];
		if ($k === []) {
			return 0;
		}
		$flipped = $state;
		$flipped['turn'] = $color === 'w' ? 'b' : 'w';
		$flipped['ep'] = '-';
		$flipped['castling'] = '-';
		$flipped['result'] = null;
		$flipped['history'] = [$e->positionHash($flipped)];
		$best = 0;
		foreach ($e->generateMoves($e->validateState($flipped)) as $m) {
			if ($m['type'] !== 'split' && $m['type'] !== 'measure' && $m['to'][0] === $k[0]['square']) {
				foreach ($m['outcomes'] as $o) {
					if ($o['key'] === 'capture' && $o['weight'] > $best) {
						$best = $o['weight'];
					}
				}
			}
		}
		return $best;
	}

	/**
	 * Naive kingTrapped (§6): every outcome of every legal move keeps the game running with the mover's king
	 * certainly capturable. (getOutcomes runs E1b in the outcome states, which cannot change this answer.)
	 *
	 * @param array<string, mixed> $state
	 */
	private static function naiveTrapped(Engine $e, array $state): bool {
		$moves = $e->generateMoves($state);
		if ($state['result'] !== null || $moves === []) {
			return false;
		}
		foreach ($moves as $m) {
			foreach ($e->getOutcomes($state, $m['code']) as $o) {
				if ($o['state']['result'] !== null
					|| $e->kingDanger($o['state'], (string)$state['turn']) !== Engine::T) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * Naive moveRisk (§8) from getOutcomes.
	 *
	 * @param array<string, mixed> $state
	 */
	private static function naiveRisk(Engine $e, array $state, string $code): float {
		$enemyKing = $state['turn'] === 'w' ? 16 : 0;
		$risk = 0.0;
		foreach ($e->getOutcomes($state, $code) as $o) {
			if ($o['captured'] !== $enemyKing) {
				$risk += ($o['weight'] / Engine::T) * ($e->kingDanger($o['state'], (string)$state['turn']) / Engine::T);
			}
		}
		return $risk;
	}

	/**
	 * @return iterable<string, array{0: int, 1: string, 2: int, 3: int}>
	 */
	public static function playouts(): iterable {
		yield 'uniform' => [1, 'uniform', 16, 50];
		yield 'quantum-heavy' => [2, 'quantum', 16, 50];
		yield 'aggressive' => [3, 'aggressive', 16, 80];
		yield 'merge and measure' => [4, 'merge', 16, 50];
		yield 'long games' => [5, 'uniform', 3, 400];
	}

	#[DataProvider('playouts')]
	public function testPropertiesHoldAfterEveryMove(int $seed, string $policy, int $games, int $maxPlies): void {
		$this->rng = $seed * 2654435761 % 4294967296 ?: 1;
		$e = new Engine();
		$other = new Engine();
		$counts = [
			'plies' => 0,
			'rolled' => 0,
			'splits' => 0,
			'merges' => 0,
			'measures' => 0,
			'danger' => 0,
			'trapped' => 0,
		];
		$results = [];
		for ($g = 0; $g < $games; $g++) {
			$s = $e->setupPosition(self::STARTS[$g % count(self::STARTS)]);
			for ($p = 0; $p < $maxPlies && $s['result'] === null; $p++) {
				$moves = $e->generateMoves($s);
				$this->assertNotEmpty($moves, 'no moves in a running game');
				$this->assertTrue($e->hasAnyLegalMove($s));
				$m = $this->choose($moves, $policy);
				$u = (int)floor($this->random() * Engine::T);
				$before = $e->serializeState($s);
				$r = $e->applyMove($s, $m['code'], $u);
				$after = $e->serializeState($r['state']);
				$where = ' after ' . $m['code'] . ' (game ' . $g . ', ply ' . $p . ')';
				// The input is untouched (also in the cache) and a fresh instance agrees byte for byte.
				$this->assertSame($before, $e->serializeState($s), 'input changed' . $where);
				$again = $other->applyMove(FixtureLoader::state($before), $m['code'], $u);
				$this->assertSame($after, $other->serializeState($again['state']), 'not deterministic' . $where);
				$this->assertSame($r['measurement'], $again['measurement'], 'record not deterministic' . $where);
				// I1–I12 and canonical bytes.
				$this->assertSame(
					$after,
					$e->serializeState($e->validateState($after)),
					'invalid or not canonical' . $where,
				);
				$this->assertSame(Engine::T, array_sum(array_column($r['state']['worlds'], 1)), 'sum' . $where);
				$this->assertLessThanOrEqual(64, count($r['state']['worlds']), 'worlds' . $where);
				// Budgets: both ≤ 8, the mover's opponent never gains.
				$mover = (string)$s['turn'];
				$opp = $mover === 'w' ? 'b' : 'w';
				$this->assertLessThanOrEqual(8, $e->budget($r['state'], 'w'), 'budget' . $where);
				$this->assertLessThanOrEqual(8, $e->budget($r['state'], 'b'), 'budget' . $where);
				$this->assertLessThanOrEqual(
					$e->budget($s, $opp),
					$e->budget($r['state'], $opp),
					'opponent budget grew' . $where,
				);
				// Measurement record.
				if ($m['resolution'] === 'rolled') {
					$counts['rolled']++;
					$rec = $r['measurement'];
					$this->assertNotNull($rec);
					$this->assertSame($u, $rec['u']);
					$this->assertSame($m['outcomes'], $rec['outcomes']);
					$this->assertSame($m['fallback'], $rec['fallback']);
					$acc = 0;
					$expectKey = null;
					foreach ($m['outcomes'] as $o) {
						$acc += $o['weight'];
						if ($u < $acc) {
							$expectKey = $o['key'];
							break;
						}
					}
					$this->assertSame($expectKey, $rec['key'], 'key' . $where);
					$found = false;
					foreach ($e->getOutcomes($s, $m['code']) as $o) {
						if ($o['key'] === $rec['key']) {
							$found = true;
							$this->assertSame(
								$after,
								$e->serializeState($o['state']),
								'getOutcomes differs from applyMove' . $where,
							);
						}
					}
					$this->assertTrue($found);
				} else {
					$this->assertNull($r['measurement'], 'record on an unrolled move' . $where);
				}
				$counts['splits'] += $m['type'] === 'split' ? 1 : 0;
				$counts['merges'] += $m['type'] === 'merge' ? 1 : 0;
				$counts['measures'] += $m['type'] === 'measure' ? 1 : 0;
				// Notation round trip and the win mark.
				$text = $e->moveNotation($s, $m['code'], $r['measurement']);
				$this->assertSame(
					$m['code'],
					$e->findMove($s, $text)['code'] ?? null,
					'notation does not parse back' . $where . ': ' . $text,
				);
				$won = $r['state']['result'] !== null
					&& in_array($r['state']['result']['reason'], Engine::WIN_REASONS, true);
				$this->assertSame($won, str_ends_with($text, ' #'), 'mark' . $where);
				// Naive cross-checks on a sample.
				if ($counts['plies'] % 23 === 0
					&& !in_array(0, $r['state']['captured'], true)
					&& !in_array(16, $r['state']['captured'], true)) {
					foreach (['w', 'b'] as $c) {
						$this->assertSame(
							self::naiveDanger($e, $r['state'], $c),
							$e->kingDanger($r['state'], $c),
							'kingDanger' . $where,
						);
					}
					$counts['danger']++;
					if ($r['state']['result'] === null) {
						$this->assertSame(
							self::naiveTrapped($e, $r['state']),
							$e->kingTrapped($r['state']),
							'kingTrapped' . $where,
						);
						foreach (array_slice($e->generateMoves($r['state']), 0, 30) as $lm) {
							$this->assertEqualsWithDelta(
								self::naiveRisk($e, $r['state'], $lm['code']),
								$e->moveRisk($r['state'], $lm['code']),
								1e-12,
								'moveRisk ' . $lm['code'] . $where,
							);
						}
						$counts['trapped']++;
					}
				}
				$s = $r['state'];
				$counts['plies']++;
			}
			$reason = $s['result']['reason'] ?? 'unfinished';
			$results[$reason] = ($results[$reason] ?? 0) + 1;
		}
		$this->assertGreaterThan(40 * min($games, 3), $counts['plies']);
		$this->assertGreaterThan(0, $counts['danger']);
		if ($policy === 'quantum') {
			$this->assertGreaterThan(100, $counts['splits']);
		}
		if ($policy === 'merge') {
			$this->assertGreaterThan(50, $counts['merges'] + $counts['measures']);
		}
		if ($policy === 'aggressive') {
			$this->assertGreaterThan(0, $results['king_captured'] ?? 0);
		}
	}
}
