<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * King danger (ENGINE-RULES §8), normative because the end checks use it. Mirrors dangerOf in src/engine/danger.js.
 *
 * @internal
 */
final class Danger {
	/**
	 * The best single-move capture weight of colour ci's king by the other side, over raw worlds. The worlds need
	 * not be canonical or sum to T; the result is at most the sum of the weights.
	 *
	 * Per enemy piece: the largest weight over its attacking squares, and for q/r/b/n the sum of its two largest
	 * (a converging capture; the worlds of two parts are disjoint).
	 *
	 * @param list<string> $boards
	 * @param list<int> $weights
	 * @param array<int, int> $typeCodes type code per id
	 */
	public static function of(array $boards, array $weights, array $typeCodes, int $ci): int {
		if ($boards === []) {
			return 0;
		}
		$k = strpos($boards[0], $ci === 0 ? 'A' : 'a');
		if ($k === false) {
			return 0;
		}
		// Enemy letters by attack kind.
		$knights = [];
		$kings = [];
		$pawns = [];
		$orth = [];
		$diag = [];
		$base = $ci === 0 ? 16 : 0;
		for ($id = $base; $id < $base + 16; $id++) {
			$ch = Tables::$letter[$id];
			switch ($typeCodes[$id]) {
				case Tables::TYPE_N:
					$knights[$ch] = $id;
					break;
				case Tables::TYPE_K:
					$kings[$ch] = $id;
					break;
				case Tables::TYPE_P:
					$pawns[$ch] = $id;
					break;
				case Tables::TYPE_Q:
					$orth[$ch] = $id;
					$diag[$ch] = $id;
					break;
				case Tables::TYPE_R:
					$orth[$ch] = $id;
					break;
				case Tables::TYPE_B:
					$diag[$ch] = $id;
					break;
			}
		}
		$knightSq = Tables::$knight[$k];
		$kingSq = Tables::$king[$k];
		$pawnSq = Tables::$pawnAttackers[1 - $ci][$k];
		$rays = [];
		for ($d = 0; $d < 8; $d++) {
			$rays[] = Tables::$rays[$k * 8 + $d];
		}
		$acc = [];
		$who = [];
		foreach ($boards as $i => $b) {
			$w = $weights[$i];
			foreach ($knightSq as $s) {
				if (isset($knights[$b[$s]])) {
					$acc[$s] = ($acc[$s] ?? 0) + $w;
					$who[$s] = $knights[$b[$s]];
				}
			}
			foreach ($kingSq as $s) {
				if (isset($kings[$b[$s]])) {
					$acc[$s] = ($acc[$s] ?? 0) + $w;
					$who[$s] = $kings[$b[$s]];
				}
			}
			foreach ($pawnSq as $s) {
				if (isset($pawns[$b[$s]])) {
					$acc[$s] = ($acc[$s] ?? 0) + $w;
					$who[$s] = $pawns[$b[$s]];
				}
			}
			foreach ($rays as $d => $ray) {
				$sliders = $d < 4 ? $orth : $diag;
				foreach ($ray as $s) {
					$c = $b[$s];
					if ($c === '.') {
						continue;
					}
					if (isset($sliders[$c])) {
						$acc[$s] = ($acc[$s] ?? 0) + $w;
						$who[$s] = $sliders[$c];
					}
					break;
				}
			}
		}
		if ($acc === []) {
			return 0;
		}
		$top1 = [];
		$top2 = [];
		foreach ($acc as $s => $v) {
			$id = $who[$s];
			$t1 = $top1[$id] ?? 0;
			if ($v > $t1) {
				$top2[$id] = $t1;
				$top1[$id] = $v;
			} elseif ($v > ($top2[$id] ?? 0)) {
				$top2[$id] = $v;
			}
		}
		$best = 0;
		foreach ($top1 as $id => $v) {
			$ty = $typeCodes[$id];
			if ($ty === Tables::TYPE_Q || $ty === Tables::TYPE_R || $ty === Tables::TYPE_B || $ty === Tables::TYPE_N) {
				$v += $top2[$id] ?? 0;
			}
			if ($v > $best) {
				$best = $v;
			}
		}
		return $best;
	}
}
