<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Evaluation of standard moves and castling (§4.3–§4.6, checks 9–15 of §4.11), and the lane helpers that the quantum
 * moves share. Every candidate move is evaluated by the same functions, whether it comes from the generator, from
 * `whyIllegal` or from `findMove`, so the three can never disagree.
 *
 * JavaScript twin: src/engine/moveRules.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 */
final class MoveRules {
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
	public static function laneOccupied(Analysis $a, array $lane): array|null|false {
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
			return MoveRecord::MISS;
		}
		if ($rec->laneOcc !== null) {
			foreach ($rec->laneOcc as $s) {
				if ($b[$s] !== '.') {
					return MoveRecord::MISS;
				}
			}
		}
		$c = $b[$rec->t];
		if ($rec->pawn === 'push' || $rec->pawn === 'double') {
			return $c === '.' ? MoveRecord::MOVE : MoveRecord::MISS;
		}
		if ($rec->pawn === 'diagonal') {
			return $rec->ep || self::isEnemy($c, $rec->ci) ? MoveRecord::CAPTURE : MoveRecord::MISS;
		}
		if ($c === '.') {
			return MoveRecord::MOVE;
		}
		return self::isEnemy($c, $rec->ci) ? MoveRecord::CAPTURE : MoveRecord::MISS;
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
	public static function classify(Analysis $a, MoveRecord $rec): void {
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
			$moved = $merge ? self::mergeSourceIn($rec, $b) !== 0 : self::standardKeyIn($rec, $b) !== MoveRecord::MISS;
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
		$rec->sortKey = ($f * 64 + $t) * 64 + ($promo === null ? 0 : MoveRecord::PROMO_INDEX[$promo]);
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
}
