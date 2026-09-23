<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Move evaluation, legality (ENGINE-RULES §4.4–§4.11) and generation (§4.10). Mirrors src/engine/moves.js.
 *
 * Every candidate move is evaluated by the same functions, whether it comes from the generator, from `whyIllegal`
 * or from `findMove`, so the three can never disagree.
 *
 * @internal
 */
final class Moves {
	public const MISS = 0;
	public const MOVE = 1;
	public const CAPTURE = 2;
	public const KEY_NAMES = ['miss', 'move', 'capture'];
	public const PROMO_INDEX = ['q' => 1, 'r' => 2, 'b' => 3, 'n' => 4];
	private const PROMOS = ['q', 'r', 'b', 'n'];
	private const LETTER_TYPE = ['K' => Tables::TYPE_K, 'Q' => Tables::TYPE_Q, 'R' => Tables::TYPE_R, 'B' => Tables::TYPE_B, 'N' => Tables::TYPE_N];

	/**
	 * Is board character c a piece of the colour opposite to ci?
	 */
	private static function isEnemy(string $c, int $ci): bool {
		$color = Tables::$colorOfChar[$c] ?? -1;
		return $color >= 0 && $color !== $ci;
	}

	/**
	 * Possibly occupied lane squares, null when the lane is certainly clear, false when some lane square is
	 * certainly occupied (blocked in every world).
	 *
	 * @param list<int> $lane
	 * @return list<int>|null|false
	 */
	private static function laneOccupied(Analysis $a, array $lane): array|null|false {
		$out = null;
		foreach ($lane as $s) {
			if ($a->occ[$s] >= 0) {
				if ($a->occW[$s] === Tables::T) {
					return false;
				}
				$out[] = $s;
			}
		}
		return $out;
	}

	/**
	 * Is the lane clear in board b? `laneOcc` from laneOccupied (not false).
	 *
	 * @param list<int>|null $laneOcc
	 */
	public static function laneClear(string $b, ?array $laneOcc): bool {
		if ($laneOcc === null) {
			return true;
		}
		foreach ($laneOcc as $s) {
			if ($b[$s] !== '.') {
				return false;
			}
		}
		return true;
	}

	/**
	 * Per-world key of a standard (non-castling) move in board b (§4.3): MISS, MOVE or CAPTURE.
	 */
	public static function standardKeyIn(MoveRecord $rec, string $b): int {
		if ($b[$rec->f] !== $rec->letter) {
			return self::MISS;
		}
		if ($rec->laneOcc !== null) {
			foreach ($rec->laneOcc as $s) {
				if ($b[$s] !== '.') {
					return self::MISS;
				}
			}
		}
		$c = $b[$rec->t];
		if ($rec->pawn === 'push' || $rec->pawn === 'double') {
			return $c === '.' ? self::MOVE : self::MISS;
		}
		if ($rec->pawn === 'diagonal') {
			return $rec->ep || self::isEnemy($c, $rec->ci) ? self::CAPTURE : self::MISS;
		}
		if ($c === '.') {
			return self::MOVE;
		}
		return self::isEnemy($c, $rec->ci) ? self::CAPTURE : self::MISS;
	}

	/**
	 * Which merge source arrives in board b (§4.8): 1 from f1, 2 from f2, 0 for miss.
	 */
	public static function mergeSourceIn(MoveRecord $rec, string $b): int {
		if ($b[$rec->f] === $rec->letter) {
			return self::laneClear($b, $rec->laneOcc) ? 1 : 0;
		}
		if ($b[$rec->f2] === $rec->letter) {
			return self::laneClear($b, $rec->laneOcc2) ? 2 : 0;
		}
		return 0;
	}

	/**
	 * Outcome list and resolution of a standard move or merge from its key weights (§4.5).
	 */
	private static function classify(Analysis $a, MoveRecord $rec): void {
		$outcomes = [];
		if ($rec->wMiss > 0) {
			$outcomes[] = ['key' => 'miss', 'weight' => $rec->wMiss];
		}
		if ($rec->wMove > 0) {
			$outcomes[] = ['key' => 'move', 'weight' => $rec->wMove];
		}
		if ($rec->wCap > 0) {
			$outcomes[] = ['key' => 'capture', 'weight' => $rec->wCap];
		}
		$rec->outcomes = $outcomes;
		$rec->happenWeight = $rec->wMove + $rec->wCap;
		if ($rec->inM) {
			$rec->resolution = count($outcomes) >= 2 ? 'rolled' : 'certain';
		} elseif ($rec->wMiss > 0) {
			// [miss, move]: quantum unless the unmeasured result would exceed the budget.
			if (self::budgetAfterQuantum($a, $rec) > Tables::BUDGET) {
				$rec->fallback = true;
				$rec->resolution = 'rolled';
			} else {
				$rec->resolution = 'quantum';
			}
		} else {
			$rec->resolution = 'certain';
		}
	}

	/**
	 * B(mover) after the unmeasured result of a standard move or merge outside M (§4.5 budget fallback).
	 */
	private static function budgetAfterQuantum(Analysis $a, MoveRecord $rec): int {
		$rc = $a->restClasses($rec->X)[1];
		$pos = $a->positions($rec->X);
		$seen = [];
		$merge = $rec->kind === 'merge';
		foreach ($a->boards as $i => $b) {
			$moved = $merge ? self::mergeSourceIn($rec, $b) !== 0 : self::standardKeyIn($rec, $b) !== self::MISS;
			$seen[$rc[$i] * 64 + ($moved ? $rec->t : $pos[$i])] = true;
		}
		return count($seen);
	}

	/**
	 * Evaluate a standard move of X from f to t (checks 9–15 of §4.11). X = occ(f) is of the side to move.
	 *
	 * @return MoveRecord|string record or reason code
	 */
	public static function evalStandard(Analysis $a, int $X, int $f, int $t, ?string $promo): MoveRecord|string {
		$type = $a->typeCodes[$X];
		$ci = $X < 16 ? 0 : 1;
		if ($type === Tables::TYPE_K && $f === ($ci === 0 ? 4 : 60) && ($t === $f + 2 || $t === $f - 2)) {
			return self::evalCastle($a, $X, $f, $t, $promo);
		}
		$pk = null;
		if ($type === Tables::TYPE_P) {
			$pk = Tables::pawnKind($ci, $f, $t);
			if ($pk === null) {
				return 'unreachable';
			}
		} elseif (!isset(Tables::$geo[$type * 4096 + $f * 64 + $t])) {
			return 'unreachable';
		}
		$needsPromo = $type === Tables::TYPE_P && ($t >> 3) === ($ci === 0 ? 7 : 0);
		if ($needsPromo && $promo === null) {
			return 'promotion_required';
		}
		if (!$needsPromo && $promo !== null) {
			return 'promotion_invalid';
		}
		$laneOcc = self::laneOccupied($a, Tables::standardLane($type, $f, $t, $pk));
		$letter = Tables::$letter[$X];
		$isEp = $pk === 'diagonal' && $t === $a->ep;
		$pushLike = $pk === 'push' || $pk === 'double';
		$wMiss = 0;
		$wMove = 0;
		$wCap = 0;
		$anyClear = false;
		if ($laneOcc === false) {
			$wMiss = Tables::T;
		} elseif ($laneOcc === null && count($a->locs[$X]) === 1) {
			// X certain on f and the lane certainly clear: the marginals decide.
			$anyClear = true;
			$z = $a->occ[$t];
			$wz = $a->occW[$t];
			if ($pushLike) {
				$wMove = Tables::T - $wz;
				$wMiss = $wz;
			} elseif ($pk === 'diagonal') {
				if ($isEp) {
					$wCap = Tables::T;
				} elseif ($z >= 0 && ($z < 16) !== ($ci === 0)) {
					$wCap = $wz;
					$wMiss = Tables::T - $wz;
				} else {
					$wMiss = Tables::T;
				}
			} elseif ($z < 0) {
				$wMove = Tables::T;
			} elseif (($z < 16) !== ($ci === 0)) {
				$wCap = $wz;
				$wMove = Tables::T - $wz;
			} else {
				$wMiss = $wz;
				$wMove = Tables::T - $wz;
			}
		} else {
			$enemy = $ci === 0 ? 1 : 0;
			$colorOf = Tables::$colorOfChar;
			$boards = $a->boards;
			$weights = $a->weights;
			for ($i = 0, $n = $a->n; $i < $n; $i++) {
				$b = $boards[$i];
				$w = $weights[$i];
				if ($b[$f] !== $letter) {
					$wMiss += $w;
					continue;
				}
				if ($laneOcc !== null) {
					foreach ($laneOcc as $s) {
						if ($b[$s] !== '.') {
							$wMiss += $w;
							continue 2;
						}
					}
				}
				$anyClear = true;
				$c = $b[$t];
				if ($pushLike) {
					if ($c === '.') {
						$wMove += $w;
					} else {
						$wMiss += $w;
					}
				} elseif ($pk === 'diagonal') {
					if ($isEp || ($colorOf[$c] ?? -1) === $enemy) {
						$wCap += $w;
					} else {
						$wMiss += $w;
					}
				} elseif ($c === '.') {
					$wMove += $w;
				} elseif (($colorOf[$c] ?? -1) === $enemy) {
					$wCap += $w;
				} else {
					$wMiss += $w;
				}
			}
		}
		if ($wMove + $wCap === 0) {
			if ($pk === 'diagonal') {
				return 'nothing_to_capture';
			}
			if ($pushLike || !$anyClear) {
				return 'blocked';
			}
			return 'own_piece';
		}
		$occT = $a->occ[$t];
		$rec = new MoveRecord();
		$rec->kind = 'standard';
		$rec->X = $X;
		$rec->ci = $ci;
		$rec->type = $type;
		$rec->letter = $letter;
		$rec->f = $f;
		$rec->t = $t;
		$rec->promo = $promo;
		$rec->pawn = $pk;
		$rec->ep = $isEp;
		$rec->laneOcc = $laneOcc === false ? null : $laneOcc;
		$rec->inM = $type === Tables::TYPE_P || $type === Tables::TYPE_K || ($occT >= 0 && $occT !== $X);
		$rec->wMiss = $wMiss;
		$rec->wMove = $wMove;
		$rec->wCap = $wCap;
		$rec->captureId = $wCap > 0 ? ($isEp ? $a->occ[$ci === 0 ? $t - 8 : $t + 8] : $occT) : -1;
		$rec->from = [$f];
		$rec->to = [$t];
		$rec->sortKey = ($f * 64 + $t) * 64 + ($promo === null ? 0 : self::PROMO_INDEX[$promo]);
		self::classify($a, $rec);
		return $rec;
	}

	/**
	 * Evaluate castling (§4.6; checks 9, 10, 12).
	 */
	private static function evalCastle(Analysis $a, int $X, int $f, int $t, ?string $promo): MoveRecord|string {
		$flag = $t > $f ? ($X === 0 ? 'K' : 'k') : ($X === 0 ? 'Q' : 'q');
		if (!str_contains((string)$a->state['castling'], $flag)) {
			return 'castle_no_right';
		}
		$c = Tables::CASTLING[$flag];
		foreach ($c['empty'] as $s) {
			if ($a->occ[$s] >= 0) {
				return 'castle_blocked';
			}
		}
		if ($promo !== null) {
			return 'promotion_invalid';
		}
		$rec = new MoveRecord();
		$rec->kind = 'standard';
		$rec->X = $X;
		$rec->ci = $X < 16 ? 0 : 1;
		$rec->type = Tables::TYPE_K;
		$rec->letter = Tables::$letter[$X];
		$rec->f = $f;
		$rec->t = $t;
		$rec->castle = $c;
		$rec->wMove = Tables::T;
		$rec->resolution = 'certain';
		$rec->outcomes = [];
		$rec->happenWeight = Tables::T;
		$rec->from = [$f];
		$rec->to = [$t];
		$rec->sortKey = ($f * 64 + $t) * 64;
		return $rec;
	}

	/**
	 * Per-(X, f) data shared by all splits of X from f.
	 *
	 * @return array{X: int, f: int, type: int, letter: string, onF: list<int>, rc: list<int>|null, base: int, flags: array<int, list<int>>}
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
	 * @param array{X: int, f: int, type: int, letter: string, onF: list<int>, rc: list<int>|null, base: int, flags: array<int, list<int>>} $ctx
	 * @return list<int>
	 */
	private static function splitFlags(Analysis $a, array &$ctx, int $t): array {
		if (isset($ctx['flags'][$t])) {
			return $ctx['flags'][$t];
		}
		$fl = [];
		$laneOcc = self::laneOccupied($a, Tables::standardLane($ctx['type'], $ctx['f'], $t, null));
		if ($laneOcc === false) {
			$fl = array_fill(0, count($ctx['onF']), 0);
		} else {
			foreach ($ctx['onF'] as $i) {
				$fl[] = self::laneClear($a->boards[$i], $laneOcc) ? 1 : 0;
			}
		}
		$ctx['flags'][$t] = $fl;
		return $fl;
	}

	/**
	 * Evaluate a split (S2–S7; checks 11, 16–19). X = occ(f) is a q/r/b/n of the side to move.
	 *
	 * @param array{X: int, f: int, type: int, letter: string, onF: list<int>, rc: list<int>|null, base: int, flags: array<int, list<int>>}|null $ctx
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
		$lane1 = self::laneOccupied($a, Tables::standardLane($type, $f1, $t, null));
		$lane2 = self::laneOccupied($a, Tables::standardLane($type, $f2, $t, null));
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
				if ($lane1 !== false && self::laneClear($b, $lane1)) {
					$arrive = true;
					$m1 = true;
				}
			} elseif ($b[$f2] === $letter) {
				if ($lane2 !== false && self::laneClear($b, $lane2)) {
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
		self::classify($a, $rec);
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

	/**
	 * The canonical code of a record (§4.1).
	 */
	public static function recCode(MoveRecord $rec): string {
		$names = Tables::$names;
		switch ($rec->kind) {
			case 'standard':
				return $names[$rec->f] . '-' . $names[$rec->t] . ($rec->promo === null ? '' : '=' . strtoupper($rec->promo));
			case 'split':
				return $names[$rec->f] . '-' . $names[$rec->t] . '|' . $names[$rec->t2];
			case 'merge':
				return $names[$rec->f] . '|' . $names[$rec->f2] . '-' . $names[$rec->t];
			default:
				return '?' . $names[$rec->f];
		}
	}

	/**
	 * The public LegalMove of a record (§4.10), keys in order, built once.
	 *
	 * @return array<string, mixed>
	 */
	public static function legalOf(MoveRecord $rec): array {
		if ($rec->legal !== null) {
			return $rec->legal;
		}
		$m = ['type' => $rec->kind, 'from' => $rec->from, 'to' => $rec->to];
		if ($rec->promo !== null) {
			$m['promo'] = $rec->promo;
		}
		$m['code'] = self::recCode($rec);
		$m['piece'] = $rec->X;
		$m['resolution'] = $rec->resolution;
		$m['measured'] = $rec->resolution === 'rolled';
		$m['fallback'] = $rec->fallback;
		$m['capture'] = $rec->wCap > 0;
		$m['happenWeight'] = $rec->happenWeight;
		$m['outcomes'] = $rec->outcomes;
		$m['successProbability'] = (float)$rec->happenWeight / Tables::TF;
		$rec->legal = $m;
		$rec->code = $m['code'];
		return $m;
	}

	/**
	 * Push the legal standard moves (including castling) of X from f.
	 *
	 * @param list<MoveRecord> $out
	 */
	private static function genStandardFrom(Analysis $a, int $X, int $f, array &$out): void {
		$type = $a->typeCodes[$X];
		$ci = $X < 16 ? 0 : 1;
		$occ = $a->occ;
		if ($type === Tables::TYPE_P) {
			$lastRank = $ci === 0 ? 7 : 0;
			$targets = [];
			if (isset(Tables::$pawnPush[$ci][$f])) {
				$targets[] = Tables::$pawnPush[$ci][$f];
			}
			if (isset(Tables::$pawnDouble[$ci][$f])) {
				$targets[] = Tables::$pawnDouble[$ci][$f];
			}
			foreach (Tables::$pawnCaptures[$ci][$f] as $t) {
				$z = $occ[$t];
				if ($t === $a->ep || ($z >= 0 && ($z < 16) !== ($ci === 0))) {
					$targets[] = $t;
				}
			}
			foreach ($targets as $t) {
				if (($t >> 3) === $lastRank) {
					$r = self::evalStandard($a, $X, $f, $t, 'q');
					if ($r instanceof MoveRecord) {
						$out[] = $r;
						$out[] = $r->withPromo('r');
						$out[] = $r->withPromo('b');
						$out[] = $r->withPromo('n');
					}
				} else {
					$r = self::evalStandard($a, $X, $f, $t, null);
					if ($r instanceof MoveRecord) {
						$out[] = $r;
					}
				}
			}
			return;
		}
		if ($type === Tables::TYPE_K || $type === Tables::TYPE_N) {
			$targets = $type === Tables::TYPE_K ? Tables::$king[$f] : Tables::$knight[$f];
			foreach ($targets as $t) {
				$z = $occ[$t];
				if ($z >= 0 && ($z < 16) === ($ci === 0) && $a->occW[$t] === Tables::T) {
					continue;
				}
				$r = self::evalStandard($a, $X, $f, $t, null);
				if ($r instanceof MoveRecord) {
					$out[] = $r;
				}
			}
			if ($type === Tables::TYPE_K && $f === ($ci === 0 ? 4 : 60) && $a->state['castling'] !== '-') {
				foreach ([$f + 2, $f - 2] as $t) {
					$r = self::evalStandard($a, $X, $f, $t, null);
					if ($r instanceof MoveRecord) {
						$out[] = $r;
					}
				}
			}
			return;
		}
		foreach (Tables::SLIDE_DIRS[$type] as $d) {
			foreach (Tables::$rays[$f * 8 + $d] as $t) {
				$z = $occ[$t];
				$certain = $z >= 0 && $z !== $X && $a->occW[$t] === Tables::T;
				if (!($certain && ($z < 16) === ($ci === 0))) {
					$r = self::evalStandard($a, $X, $f, $t, null);
					if ($r instanceof MoveRecord) {
						$out[] = $r;
					}
				}
				if ($certain) {
					break;
				}
			}
		}
	}

	/**
	 * Split targets of X from f worth trying: empty in every world and not behind a certain blocker (ascending).
	 *
	 * @return list<int>
	 */
	private static function splitCandidates(Analysis $a, int $X, int $f): array {
		$type = $a->typeCodes[$X];
		$out = [];
		if ($type === Tables::TYPE_N) {
			foreach (Tables::$knight[$f] as $t) {
				if ($a->occ[$t] < 0) {
					$out[] = $t;
				}
			}
			return $out;
		}
		foreach (Tables::SLIDE_DIRS[$type] as $d) {
			foreach (Tables::$rays[$f * 8 + $d] as $t) {
				if ($a->occ[$t] < 0) {
					$out[] = $t;
				} elseif ($a->occW[$t] === Tables::T) {
					break;
				}
			}
		}
		sort($out);
		return $out;
	}

	/**
	 * Push the legal splits of X from f.
	 *
	 * @param list<MoveRecord> $out
	 */
	private static function genSplitsFrom(Analysis $a, int $X, int $f, array &$out): void {
		$targets = self::splitCandidates($a, $X, $f);
		if (count($targets) < 2) {
			return;
		}
		$ctx = self::splitContext($a, $X, $f);
		// Targets that are never reachable cannot be part of a legal split (S4).
		$usable = [];
		foreach ($targets as $t) {
			if (in_array(1, self::splitFlags($a, $ctx, $t), true)) {
				$usable[] = $t;
			}
		}
		$count = count($usable);
		for ($i = 0; $i < $count; $i++) {
			for ($j = $i + 1; $j < $count; $j++) {
				$r = self::evalSplit($a, $X, $f, $usable[$i], $usable[$j], $ctx);
				if ($r instanceof MoveRecord) {
					$out[] = $r;
				}
			}
		}
	}

	/**
	 * Push the legal merges of a superposed X.
	 *
	 * @param list<MoveRecord> $out
	 */
	private static function genMerges(Analysis $a, int $X, array &$out): void {
		$loc = $a->locs[$X];
		$type = $a->typeCodes[$X];
		$ci = $X < 16 ? 0 : 1;
		$count = count($loc);
		for ($i = 0; $i < $count; $i++) {
			for ($j = $i + 1; $j < $count; $j++) {
				$f1 = $loc[$i];
				$f2 = $loc[$j];
				foreach (Tables::$targets[$type][$f1] as $t) {
					if ($t === $f2 || !isset(Tables::$geo[$type * 4096 + $f2 * 64 + $t])) {
						continue;
					}
					$z = $a->occ[$t];
					if ($z >= 0 && $z !== $X && ($z < 16) === ($ci === 0)) {
						continue;
					}
					$r = self::evalMerge($a, $X, $f1, $f2, $t);
					if ($r instanceof MoveRecord) {
						$out[] = $r;
					}
				}
			}
		}
	}

	/**
	 * Is the piece a q/r/b/n?
	 */
	private static function isQuantumType(Analysis $a, int $id): bool {
		$ty = $a->typeCodes[$id];
		return $ty === Tables::TYPE_Q || $ty === Tables::TYPE_R || $ty === Tables::TYPE_B || $ty === Tables::TYPE_N;
	}

	/**
	 * All legal records of the side to move, in canonical order (§4.10). Cached in the analysis.
	 *
	 * @return list<MoveRecord>
	 */
	public static function allRecords(Analysis $a): array {
		if ($a->moves !== null) {
			return $a->moves;
		}
		$out = [];
		if ($a->state['result'] === null) {
			$base = $a->ci * 16;
			for ($X = $base; $X < $base + 16; $X++) {
				$loc = $a->locs[$X];
				if ($loc === []) {
					continue;
				}
				$quantum = self::isQuantumType($a, $X);
				foreach ($loc as $f) {
					self::genStandardFrom($a, $X, $f, $out);
					if ($quantum) {
						self::genSplitsFrom($a, $X, $f, $out);
					}
				}
				if (count($loc) > 1) {
					self::genMerges($a, $X, $out);
					$m = self::evalMeasure($a, $X);
					if ($m instanceof MoveRecord) {
						$out[] = $m;
					}
				}
			}
			usort($out, static fn (MoveRecord $x, MoveRecord $y): int => $x->sortKey <=> $y->sortKey);
		}
		// Keep identity with records created earlier by findMove/whyIllegal on this state.
		$map = [];
		foreach ($out as $i => $rec) {
			$code = self::recCode($rec);
			if ($a->recs !== null && isset($a->recs[$code])) {
				$rec = $a->recs[$code];
				$out[$i] = $rec;
			}
			$rec->code = $code;
			$map[$code] = $rec;
		}
		$a->recs = $map;
		$a->moves = $out;
		return $out;
	}

	/**
	 * Visit legal records lazily in "escape first" order: king moves, other standard moves, merges, measures,
	 * splits. Stops as soon as the visitor returns true. With `capturesFirst`, every capture is visited right after
	 * the king moves (taking the attacker is the other quick escape).
	 *
	 * @param callable(MoveRecord): bool $visit
	 * @return bool whether the visitor stopped the walk
	 */
	public static function someRecord(Analysis $a, callable $visit, bool $capturesFirst = false): bool {
		if ($a->state['result'] !== null) {
			return false;
		}
		if ($a->moves !== null) {
			if ($capturesFirst) {
				$king = $a->ci * 16;
				foreach ([true, false] as $want) {
					foreach ($a->moves as $r) {
						if (($r->X === $king || $r->wCap > 0) === $want && $visit($r)) {
							return true;
						}
					}
				}
				return false;
			}
			foreach ($a->moves as $r) {
				if ($visit($r)) {
					return true;
				}
			}
			return false;
		}
		$base = $a->ci * 16;
		$buf = [];
		if ($capturesFirst) {
			// King moves, then every capture (it may remove the attacker), then the other standard moves.
			for ($X = $base; $X < $base + 16; $X++) {
				foreach ($a->locs[$X] as $f) {
					self::genStandardFrom($a, $X, $f, $buf);
				}
				if ($X === $base) {
					foreach ($buf as $r) {
						if ($visit($r)) {
							return true;
						}
					}
					$buf = [];
				}
			}
			$caps = [];
			$rest = [];
			foreach ($buf as $r) {
				if ($r->wCap > 0) {
					$caps[] = $r;
				} else {
					$rest[] = $r;
				}
			}
			foreach ($caps as $r) {
				if ($visit($r)) {
					return true;
				}
			}
			foreach ($rest as $r) {
				if ($visit($r)) {
					return true;
				}
			}
			$buf = [];
		} else {
			for ($X = $base; $X < $base + 16; $X++) {
				foreach ($a->locs[$X] as $f) {
					self::genStandardFrom($a, $X, $f, $buf);
					foreach ($buf as $r) {
						if ($visit($r)) {
							return true;
						}
					}
					$buf = [];
				}
			}
		}
		for ($X = $base; $X < $base + 16; $X++) {
			if (count($a->locs[$X]) > 1) {
				self::genMerges($a, $X, $buf);
				$m = self::evalMeasure($a, $X);
				if ($m instanceof MoveRecord) {
					$buf[] = $m;
				}
				foreach ($buf as $r) {
					if ($visit($r)) {
						return true;
					}
				}
				$buf = [];
			}
		}
		for ($X = $base; $X < $base + 16; $X++) {
			if ($a->locs[$X] !== [] && self::isQuantumType($a, $X)) {
				foreach ($a->locs[$X] as $f) {
					self::genSplitsFrom($a, $X, $f, $buf);
					foreach ($buf as $r) {
						if ($visit($r)) {
							return true;
						}
					}
					$buf = [];
				}
			}
		}
		return false;
	}

	/**
	 * Accept an integer square: an int, or an integral float (JSON `12.0` is the integer 12 in JavaScript).
	 */
	private static function squareOf(mixed $s): int {
		if (is_int($s)) {
			return $s >= 0 && $s <= 63 ? $s : -1;
		}
		if (is_float($s) && is_finite($s) && floor($s) === $s && $s >= 0.0 && $s <= 63.0) {
			return (int)$s;
		}
		return -1;
	}

	/**
	 * Normalise a move object (§4.11 check 2): `{type, from, to, promo}` (promo null when absent) or null when
	 * malformed. Split targets and merge sources are sorted by index.
	 *
	 * @return array{type: string, from: list<int>, to: list<int>, promo: string|null}|null
	 */
	public static function normaliseMoveObject(mixed $input): ?array {
		if (!is_array($input) || ($input !== [] && array_is_list($input))) {
			return null;
		}
		$type = $input['type'] ?? null;
		$from = $input['from'] ?? null;
		$to = $input['to'] ?? null;
		$promoIn = $input['promo'] ?? null;
		switch ($type) {
			case 'standard':
				$nf = 1;
				$nt = 1;
				break;
			case 'split':
				$nf = 1;
				$nt = 2;
				break;
			case 'merge':
				$nf = 2;
				$nt = 1;
				break;
			case 'measure':
				$nf = 1;
				$nt = 0;
				break;
			default:
				return null;
		}
		if (!is_array($from) || !is_array($to) || !array_is_list($from) || !array_is_list($to) || count($from) !== $nf || count($to) !== $nt) {
			return null;
		}
		$f = [];
		foreach ($from as $s) {
			$sq = self::squareOf($s);
			if ($sq < 0) {
				return null;
			}
			$f[] = $sq;
		}
		$t = [];
		foreach ($to as $s) {
			$sq = self::squareOf($s);
			if ($sq < 0) {
				return null;
			}
			$t[] = $sq;
		}
		$promo = null;
		if ($promoIn !== null) {
			if ($type !== 'standard' || !in_array($promoIn, self::PROMOS, true)) {
				return null;
			}
			$promo = $promoIn;
		}
		if ($type === 'split') {
			if ($t[0] === $t[1]) {
				return null;
			}
			sort($t);
		}
		if ($type === 'merge') {
			if ($f[0] === $f[1]) {
				return null;
			}
			sort($f);
		}
		return ['type' => $type, 'from' => $f, 'to' => $t, 'promo' => $promo];
	}

	/**
	 * Resolve a move input against a state: the full §4.11 pipeline. Returns the legal record (with the Measure
	 * `from` normalised) or the first failing reason code.
	 */
	public static function resolveMove(Analysis $a, mixed $input): MoveRecord|string {
		$obj = $input;
		$letter = null;
		if (is_string($input)) {
			// An unparsable string is malformed before anything else; the parsed move then runs checks 1–21.
			$p = Parser::parse($input);
			if ($p === null) {
				return 'malformed';
			}
			if (isset($p['castle'])) {
				$home = $a->ci === 0 ? 4 : 60;
				$obj = ['type' => 'standard', 'from' => [$home], 'to' => [$p['castle'] === 'O-O' ? $home + 2 : $home - 2]];
			} else {
				$obj = ['type' => $p['type'], 'from' => $p['from'], 'to' => $p['to'], 'promo' => $p['promo'] ?? null];
				$letter = $p['letter'] ?? null;
			}
		}
		if ($a->state['result'] !== null) {
			return 'game_over';
		}
		$mv = self::normaliseMoveObject($obj);
		if ($mv === null) {
			return 'malformed';
		}
		$X = $a->occ[$mv['from'][0]];
		if ($X < 0) {
			return 'no_piece';
		}
		if (($X < 16) !== ($a->ci === 0)) {
			return 'not_your_piece';
		}
		if ($letter !== null && self::LETTER_TYPE[$letter] !== $a->typeCodes[$X]) {
			return 'piece_mismatch';
		}
		$code = self::codeOfNormalised($a, $mv, $X);
		if ($a->recs !== null && isset($a->recs[$code])) {
			return $a->recs[$code];
		}
		$r = self::evaluate($a, $mv, $X);
		if (is_string($r)) {
			return $r;
		}
		$r->code = $code;
		$a->recs[$code] = $r;
		return $r;
	}

	/**
	 * Canonical code of a normalised move (Measure squares mapped to min loc(X)).
	 *
	 * @param array{type: string, from: list<int>, to: list<int>, promo: string|null} $mv
	 */
	private static function codeOfNormalised(Analysis $a, array $mv, int $X): string {
		$names = Tables::$names;
		switch ($mv['type']) {
			case 'standard':
				return $names[$mv['from'][0]] . '-' . $names[$mv['to'][0]] . ($mv['promo'] === null ? '' : '=' . strtoupper($mv['promo']));
			case 'split':
				return $names[$mv['from'][0]] . '-' . $names[$mv['to'][0]] . '|' . $names[$mv['to'][1]];
			case 'merge':
				return $names[$mv['from'][0]] . '|' . $names[$mv['from'][1]] . '-' . $names[$mv['to'][0]];
			default:
				return '?' . $names[$a->locs[$X][0]];
		}
	}

	/**
	 * Checks 6 onwards for a normalised move whose piece passed checks 3–5.
	 *
	 * @param array{type: string, from: list<int>, to: list<int>, promo: string|null} $mv
	 */
	private static function evaluate(Analysis $a, array $mv, int $X): MoveRecord|string {
		$type = $a->typeCodes[$X];
		switch ($mv['type']) {
			case 'merge':
				if ($a->occ[$mv['from'][1]] !== $X) {
					return 'merge_mismatch';
				}
				if ($type === Tables::TYPE_K || $type === Tables::TYPE_P) {
					return 'cannot_merge';
				}
				return self::evalMerge($a, $X, $mv['from'][0], $mv['from'][1], $mv['to'][0]);
			case 'split':
				if ($type === Tables::TYPE_K || $type === Tables::TYPE_P) {
					return 'cannot_split';
				}
				return self::evalSplit($a, $X, $mv['from'][0], $mv['to'][0], $mv['to'][1]);
			case 'measure':
				return self::evalMeasure($a, $X);
			default:
				return self::evalStandard($a, $X, $mv['from'][0], $mv['to'][0], $mv['promo']);
		}
	}
}
