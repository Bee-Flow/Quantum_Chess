<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use PHPUnit\Framework\TestCase;

/**
 * Validating and applying one move takes at most 10 ms (p95) on a 64-world state. Measured the way a move request
 * runs on the server: a fresh engine, validateState of the stored JSON, findMove, applyMove with a drawn u,
 * moveNotation, serializeState. The CI margin is generous (×3); the typical figure is printed for the report.
 */
final class PerformanceTest extends TestCase {
	private const BUDGET_MS = 10.0;
	private const CI_MARGIN = 3.0;

	/**
	 * 64 worlds: three independent 50/50 pieces per side (B(w) = B(b) = 8) in a full middlegame.
	 *
	 * @return array<string, mixed>
	 */
	private static function state64(Engine $e): array {
		return $e->setupPosition([
			'fen' => 'r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R w - - 0 1',
			'prelude' => ['c3-a4|b5', 'e3-g5|h6', 'd2-c1|e2', 'c6-a5|b4', 'e6-g4|h3', 'd7-c8|e7'],
		]);
	}

	/**
	 * @param list<float> $times
	 */
	private static function percentile(array $times, float $q): float {
		sort($times);
		return $times[(int)floor((count($times) - 1) * $q)];
	}

	public function testMoveRequestPipelineOnA64WorldState(): void {
		$e = new Engine();
		$s = self::state64($e);
		$this->assertSame(64, $e->worldCount($s));
		$this->assertSame([8, 8], [$e->budget($s, 'w'), $e->budget($s, 'b')]);
		$json = $e->serializeState($s);
		$codes = $e->legalCodes($s);
		$this->assertGreaterThan(60, count($codes));
		$times = [];
		foreach (range(0, 1) as $round) {
			foreach ($codes as $code) {
				$fresh = new Engine();
				$t = hrtime(true);
				$state = $fresh->validateState($json);
				$legal = $fresh->findMove($state, $code);
				$this->assertNotNull($legal);
				$u = $legal['resolution'] === 'rolled' ? random_int(0, 16777215) : null;
				$r = $fresh->applyMove($state, $legal['code'], $u);
				$fresh->moveNotation($state, $legal['code'], $r['measurement']);
				$fresh->serializeState($r['state']);
				$times[] = (hrtime(true) - $t) / 1e6;
			}
		}
		$p95 = self::percentile($times, 0.95);
		fwrite(STDERR, sprintf("\n[php engine] move request on a 64-world state: median %.2f ms, p95 %.2f ms (n = %d)\n", self::percentile($times, 0.5), $p95, count($times)));
		$this->assertLessThan(self::BUDGET_MS * self::CI_MARGIN, $p95);
	}

	public function testGenerateMovesAndViewsOnA64WorldState(): void {
		$e = new Engine();
		$json = $e->serializeState(self::state64($e));
		$gen = [];
		$views = [];
		for ($i = 0; $i < 20; $i++) {
			$fresh = new Engine();
			$s = $fresh->validateState($json);
			$t = hrtime(true);
			$moves = $fresh->generateMoves($s);
			$gen[] = (hrtime(true) - $t) / 1e6;
			$t = hrtime(true);
			$fresh->kingDanger($s, 'w');
			$fresh->kingDanger($s, 'b');
			$fresh->links($s);
			$fresh->kingTrapped($s);
			$fresh->squareView($s);
			$fresh->supportKey($s);
			$fresh->describeForLlm($s, 'b');
			$views[] = (hrtime(true) - $t) / 1e6;
			$this->assertNotEmpty($moves);
		}
		fwrite(STDERR, sprintf("[php engine] generateMoves on a 64-world state: median %.2f ms; views + describeForLlm: median %.2f ms\n", self::percentile($gen, 0.5), self::percentile($views, 0.5)));
		$this->assertLessThan(50.0, self::percentile($gen, 0.95));
		$this->assertLessThan(50.0, self::percentile($views, 0.95));
	}
}
