<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Evaluation of the quantum moves: split (§4.7), merge (§4.8) and Measure (§4.9), with checks 8, 11 and 16–21 of
 * §4.11.
 *
 * JavaScript twin: src/engine/quantumMoves.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 *
 * @psalm-type SplitContext = array{X: int, f: int, type: int, letter: string, onF: list<int>, rc: list<int>|null, base: int, flags: array<int, list<int>>}
 */
final class QuantumMoves {
	/**
	 * Per-(X, f) data shared by all splits of X from f.
	 *
	 * @return SplitContext
	 */
	public static function splitContext(Analysis $a, int $X, int $f): array {
		$letter = Tables::$letter[$X];
		$onF = [];
		foreach ($a->boards as $i => $b) {
			if ($b[$f] === $letter) {
				$onF[] = $i;
			}
		}
		return ['X' => $X, 'f' => $f, 'type' => $a->typeCodes[$X], 'letter' => $letter, 'onF' => $onF, 'rc' => null, 'base' => -1, 'flags' => []];
	}

	/**
	 * Lane-clear flags for the worlds of onF, for a split target t. Cached in the context.
	 *
	 * @param SplitContext $ctx
	 * @return list<int>
	 */
	public static function splitFlags(Analysis $a, array &$ctx, int $t): array {
		if (isset($ctx['flags'][$t])) {
			return $ctx['flags'][$t];
		}
		$fl = [];
		$laneOcc = MoveRules::laneOccupied($a, Tables::standardLane($ctx['type'], $ctx['f'], $t, null));
		if ($laneOcc === false) {
			$fl = array_fill(0, count($ctx['onF']), 0);
		} else {
			foreach ($ctx['onF'] as $i) {
				$fl[] = MoveRules::laneClear($a->boards[$i], $laneOcc) ? 1 : 0;
			}
		}
		$ctx['flags'][$t] = $fl;
		return $fl;
	}

	/**
	 * Evaluate a split (S2–S7; checks 11, 16–19). X = occ(f) is a q/r/b/n of the side to move.
	 *
	 * @param SplitContext|null $ctx
	 * @return MoveRecord|string record or reason code
	 */
	public static function evalSplit(Analysis $a, int $X, int $f, int $t1, int $t2, ?array &$ctx = null): MoveRecord|string {
		$type = $a->typeCodes[$X];
		if ($t1 === $f || $t2 === $f || !isset(Tables::$geo[$type * 4096 + $f * 64 + $t1]) || !isset(Tables::$geo[$type * 4096 + $f * 64 + $t2])) {
			return 'unreachable';
		}
		if ($a->occ[$t1] >= 0 || $a->occ[$t2] >= 0) {
			return 'split_target_occupied';
		}
		if ($ctx === null) {
			$ctx = self::splitContext($a, $X, $f);
		}
		$c1 = self::splitFlags($a, $ctx, $t1);
		$c2 = self::splitFlags($a, $ctx, $t2);
		$onF = $ctx['onF'];
		$weights = $a->weights;
		$s4 = false;
		$hasT1 = false;
		$hasT2 = false;
		$hasF = false;
		$happen = 0;
		foreach ($onF as $j => $i) {
			$w = $weights[$i];
			$x1 = $c1[$j] === 1;
			$x2 = $c2[$j] === 1;
			if ($x1 && $x2) {
				$s4 = true;
			}
			if ($x1) {
				$hasT1 = true;
			}
			if ($x2 && $w >= 2) {
				$hasT2 = true;
			}
			if (!$x1 || (!$x2 && $w >= 2)) {
				$hasF = true;
			}
			if ($x1 || $x2) {
				$happen += $w;
			}
		}
		if (!$s4) {
			return 'split_blocked';
		}
		$locAfter = count($a->locs[$X]) - 1 + ($hasT1 ? 1 : 0) + ($hasT2 ? 1 : 0) + ($hasF ? 1 : 0);
		if ($locAfter > Tables::MAX_LOCATIONS) {
			return 'location_cap';
		}
		// S5: the exact count of distinct own projections after the split.
		if ($ctx['rc'] === null) {
			$ctx['rc'] = $a->restClasses($X)[1];
			$pos = $a->positions($X);
			$seenBase = [];
			foreach ($pos as $i => $p) {
				if ($p !== $f) {
					$seenBase[$ctx['rc'][$i] * 64 + $p] = true;
				}
			}
			$ctx['base'] = count($seenBase);
		}
		$rc = $ctx['rc'];
		$seen = [];
		foreach ($onF as $j => $i) {
			$base = $rc[$i] * 64;
			$seen[$base + ($c1[$j] === 1 ? $t1 : $f)] = true;
			if ($weights[$i] >= 2) {
				$seen[$base + ($c2[$j] === 1 ? $t2 : $f)] = true;
			}
		}
		// Keys of worlds without X on f have X elsewhere, so they never collide with the keys above (which use t1,
		// t2 or f): the two sets are disjoint and the counts add up.
		if ($ctx['base'] + count($seen) > Tables::BUDGET) {
			return 'budget_full';
		}
		$rec = new MoveRecord();
		$rec->kind = 'split';
		$rec->X = $X;
		$rec->ci = $X < 16 ? 0 : 1;
		$rec->type = $type;
		$rec->letter = $ctx['letter'];
		$rec->f = $f;
		$rec->t = $t1;
		$rec->t2 = $t2;
		$rec->flags1 = $c1;
		$rec->flags2 = $c2;
		$rec->onF = $onF;
		$rec->resolution = 'quantum';
		$rec->outcomes = [];
		$rec->happenWeight = $happen;
		$rec->from = [$f];
		$rec->to = [$t1, $t2];
		$rec->sortKey = ((64 + $f) * 64 + $t1) * 64 + $t2;
		return $rec;
	}

	/**
	 * Evaluate a merge (M2–M4; checks 11, 20, 21). occ(f1) = occ(f2) = X, a q/r/b/n of the side to move.
	 *
	 * @return MoveRecord|string record or reason code
	 */
	public static function evalMerge(Analysis $a, int $X, int $f1, int $f2, int $t): MoveRecord|string {
		$type = $a->typeCodes[$X];
		$ci = $X < 16 ? 0 : 1;
		if ($t === $f1 || $t === $f2 || !isset(Tables::$geo[$type * 4096 + $f1 * 64 + $t]) || !isset(Tables::$geo[$type * 4096 + $f2 * 64 + $t])) {
			return 'unreachable';
		}
		$z = $a->occ[$t];
		if ($z >= 0 && $z !== $X && ($z < 16) === ($ci === 0)) {
			return 'merge_target_own';
		}
		$lane1 = MoveRules::laneOccupied($a, Tables::standardLane($type, $f1, $t, null));
		$lane2 = MoveRules::laneOccupied($a, Tables::standardLane($type, $f2, $t, null));
		$letter = Tables::$letter[$X];
		$enemy = $ci === 0 ? 1 : 0;
		$colorOf = Tables::$colorOfChar;
		$wMiss = 0;
		$wMove = 0;
		$wCap = 0;
		$m1 = false;
		$m2 = false;
		foreach ($a->boards as $i => $b) {
			$w = $a->weights[$i];
			$arrive = false;
			if ($b[$f1] === $letter) {
				if ($lane1 !== false && MoveRules::laneClear($b, $lane1)) {
					$arrive = true;
					$m1 = true;
				}
			} elseif ($b[$f2] === $letter) {
				if ($lane2 !== false && MoveRules::laneClear($b, $lane2)) {
					$arrive = true;
					$m2 = true;
				}
			}
			if (!$arrive) {
				$wMiss += $w;
			} elseif (($colorOf[$b[$t]] ?? -1) === $enemy) {
				$wCap += $w;
			} else {
				$wMove += $w;
			}
		}
		if (!$m1 || !$m2) {
			return 'merge_part_stuck';
		}
		$rec = new MoveRecord();
		$rec->kind = 'merge';
		$rec->X = $X;
		$rec->ci = $ci;
		$rec->type = $type;
		$rec->letter = $letter;
		$rec->f = $f1;
		$rec->t = $t;
		$rec->f2 = $f2;
		$rec->laneOcc = $lane1 === false ? null : $lane1;
		$rec->laneOcc2 = $lane2 === false ? null : $lane2;
		$rec->inM = $z >= 0 && ($z < 16) !== ($ci === 0);
		$rec->wMiss = $wMiss;
		$rec->wMove = $wMove;
		$rec->wCap = $wCap;
		$rec->captureId = $wCap > 0 ? $z : -1;
		$rec->from = [$f1, $f2];
		$rec->to = [$t];
		$rec->sortKey = ((128 + $f1) * 64 + $f2) * 64 + $t;
		MoveRules::classify($a, $rec);
		return $rec;
	}

	/**
	 * Evaluate a Measure of X (§4.9; check 8).
	 *
	 * @return MoveRecord|string record or reason code
	 */
	public static function evalMeasure(Analysis $a, int $X): MoveRecord|string {
		$loc = $a->locs[$X];
		if (count($loc) < 2) {
			return 'not_superposed';
		}
		$outcomes = [];
		foreach ($loc as $j => $s) {
			$outcomes[] = ['key' => Tables::$names[$s], 'weight' => $a->locW[$X][$j]];
		}
		$rec = new MoveRecord();
		$rec->kind = 'measure';
		$rec->X = $X;
		$rec->ci = $X < 16 ? 0 : 1;
		$rec->type = $a->typeCodes[$X];
		$rec->letter = Tables::$letter[$X];
		$rec->f = $loc[0];
		$rec->resolution = 'rolled';
		$rec->outcomes = $outcomes;
		$rec->happenWeight = Tables::T;
		$rec->from = [$loc[0]];
		$rec->to = [];
		$rec->sortKey = (192 + $loc[0]) * 4096;
		return $rec;
	}
}
