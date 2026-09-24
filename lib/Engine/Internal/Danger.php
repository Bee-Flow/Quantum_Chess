<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * King danger (§8) and the trapped-king test (§6, E1b). Both are normative: the end checks use them.
 *
 * JavaScript twin: src/engine/danger.js. Section numbers (§) refer to docs/engine-rules.md.
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
	 * @param array<int, int> $weights weight of each board, by the same index
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

	/**
	 * kingDanger (§8) of the king of colour index ci, cached on the analysis.
	 */
	public static function kingDanger(Analysis $a, int $ci): int {
		if ($a->danger[$ci] < 0) {
			$a->danger[$ci] = self::of($a->boards, $a->weights, $a->typeCodes, $ci);
		}
		return $a->danger[$ci];
	}

	/**
	 * Does the (legal) record, in any of its outcomes, avoid leaving the mover's king certainly capturable (or end
	 * the game at once by capturing the enemy king)? Used by E1b.
	 */
	private static function escapes(Analysis $a, MoveRecord $rec): bool {
		$enemyKing = $a->ci === 0 ? 16 : 0;
		foreach (Worlds::recordKeys($rec) as $key) {
			if ($rec->captureId === $enemyKing && Worlds::outcomeCaptures($rec, $key)) {
				return true;
			}
			[$boards, $weights, $total] = Worlds::outcomeBoards($a, $rec, $key);
			if (self::of($boards, $weights, $a->typeCodes, $a->ci) < $total) {
				return true;
			}
		}
		return false;
	}

	/**
	 * E1b details (§6): whether the side to move is trapped and whether it has any legal move. Cached.
	 *
	 * When the mover's king is certainly capturable after a reply, the side to move there has a certain king
	 * capture, so E2–E4 are suspended (D18) and E6 cannot fire; only E1 (the reply captured the enemy king) or E5
	 * (ply limit) could end the game. The test is therefore exactly: no reply reaches the ply limit, captures the
	 * enemy king, or leaves kingDanger below T. Outcome states are never built in full.
	 *
	 * @return array{trapped: bool, anyLegal: bool}
	 */
	public static function trappedInfo(Analysis $a): array {
		if ($a->trapped !== null) {
			return $a->trapped;
		}
		if ($a->state['result'] !== null) {
			$info = ['trapped' => false, 'anyLegal' => false];
		} elseif ((int)$a->state['ply'] + 1 >= Tables::MAX_PLY) {
			// Every reply ends the game by E5, which is an escape.
			$info = ['trapped' => false, 'anyLegal' => MoveGenerator::someRecord($a, static fn (): bool => true)];
		} else {
			$anyLegal = false;
			$escaped = MoveGenerator::someRecord($a, static function (MoveRecord $rec) use (&$anyLegal, $a): bool {
				$anyLegal = true;
				return self::escapes($a, $rec);
			}, true);
			$info = ['trapped' => $anyLegal && !$escaped, 'anyLegal' => $anyLegal];
		}
		$a->trapped = $info;
		return $info;
	}
}
