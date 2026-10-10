<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Variants;

use OCA\QuantumChess\Variants\VariantEngine;
use PHPUnit\Framework\TestCase;

/**
 * A move request of a server-ruled game takes at most 100 ms (p95): read the stored state, apply the move with the
 * escape rule and the umpire's announcement, store the new state, and build both players' views. Measured on every
 * position of the referee fixtures and on a 64-world state. The CI margin is generous (×3); the typical figures are
 * printed for the report.
 */
final class PerformanceTest extends TestCase {
	private const BUDGET_MS = 100.0;
	private const CI_MARGIN = 3.0;

	/** The moves (all with u = 7) that lead to 64 worlds: an Italian opening, then three splits per side. */
	private const TO_64 = ['g1-f3', 'g8-f6', 'b1-c3', 'b8-c6', 'e2-e4', 'e7-e5', 'f1-c4', 'f8-c5', 'd2-d3', 'd7-d6',
		'c3-b1|e2', 'c6-b4|d4', 'c1-d2|e3', 'c8-h3|g4', 'c4-b3|b5', 'a8-b8|c8'];

	/**
	 * @param list<float> $times
	 */
	private static function percentile(array $times, float $q): float {
		sort($times);
		return $times[(int)floor((count($times) - 1) * $q)];
	}

	/**
	 * The time of one move request in milliseconds, and the new stored state.
	 *
	 * @return array{0: float, 1: string}
	 */
	private function request(string $json, string $code, int $u): array {
		$t = hrtime(true);
		$state = VariantEngine::decode($json);
		$next = VariantEngine::apply($state, $code, $u);
		$this->assertNotNull($next);
		$stored = VariantEngine::encode($next);
		VariantEngine::settlement($next);
		VariantEngine::viewFor($next, 0);
		VariantEngine::viewFor($next, 1);
		return [(hrtime(true) - $t) / 1e6, $stored];
	}

	/**
	 * @param list<float> $times
	 */
	private function report(string $what, array $times): void {
		$p95 = self::percentile($times, 0.95);
		fwrite(STDERR, sprintf(
			"\n[php referee] %s: median %.2f ms, p95 %.2f ms, max %.2f ms (n = %d)\n",
			$what,
			self::percentile($times, 0.5),
			$p95,
			max($times),
			count($times),
		));
		$this->assertLessThan(self::BUDGET_MS * self::CI_MARGIN, $p95);
	}

	public function testMoveRequestsOfTheFixtureGames(): void {
		foreach (['kriegspiel', 'darkchess'] as $variant) {
			$times = [];
			foreach (RefereeParityTest::fixture($variant)['games'] as $game) {
				$json = VariantEngine::encode(VariantEngine::newGame($variant));
				foreach ($game['steps'] as $step) {
					[$times[], $json] = $this->request($json, $step['code'], $step['u']);
				}
			}
			$this->report($variant . ' fixture move requests', $times);
		}
	}

	public function testMoveRequestsOnA64WorldState(): void {
		foreach (['kriegspiel', 'darkchess'] as $variant) {
			$state = VariantEngine::newGame($variant);
			foreach (self::TO_64 as $code) {
				$state = VariantEngine::apply($state, $code, 7);
				$this->assertNotNull($state, $code);
			}
			$this->assertCount(64, $state['worlds']);
			$json = VariantEngine::encode($state);
			// Fog of war lists the legal moves to the side to move; in Kriegspiel the player tries the candidates
			$codes = $variant === 'darkchess'
				? VariantEngine::viewFor($state, $state['turn'])['legal']
				: VariantEngine::candidateMoves($state);
			$times = [];
			foreach ($codes as $code) {
				if (!VariantEngine::isLegal($state, $code)) {
					continue;
				}
				foreach ([0, 9_999_999] as $u) {
					[$times[]] = $this->request($json, $code, $u);
				}
			}
			$this->assertGreaterThan(60, count($times));
			$this->report($variant . ' move requests on a 64-world state', $times);
		}
	}
}
