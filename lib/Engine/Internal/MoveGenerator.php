<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Generation of the legal move list (§4.10): every legal record of the side to move in canonical order, and a lazy
 * walk in "escape first" order for the questions that stop at the first answer (any legal move, E1b).
 *
 * JavaScript twin: src/engine/moveGenerator.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 *
 * @psalm-import-type SplitContext from QuantumMoves
 */
final class MoveGenerator {
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
					$r = MoveRules::evalStandard($a, $X, $f, $t, 'q');
					if ($r instanceof MoveRecord) {
						$out[] = $r;
						$out[] = $r->withPromo('r');
						$out[] = $r->withPromo('b');
						$out[] = $r->withPromo('n');
					}
				} else {
					$r = MoveRules::evalStandard($a, $X, $f, $t, null);
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
				$r = MoveRules::evalStandard($a, $X, $f, $t, null);
				if ($r instanceof MoveRecord) {
					$out[] = $r;
				}
			}
			if ($type === Tables::TYPE_K && $f === ($ci === 0 ? 4 : 60) && $a->state['castling'] !== '-') {
				foreach ([$f + 2, $f - 2] as $t) {
					$r = MoveRules::evalStandard($a, $X, $f, $t, null);
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
					$r = MoveRules::evalStandard($a, $X, $f, $t, null);
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
		$ctx = QuantumMoves::splitContext($a, $X, $f);
		// Targets that are never reachable cannot be part of a legal split (S4).
		$usable = [];
		foreach ($targets as $t) {
			if (in_array(1, QuantumMoves::splitFlags($a, $ctx, $t), true)) {
				$usable[] = $t;
			}
		}
		$count = count($usable);
		for ($i = 0; $i < $count; $i++) {
			for ($j = $i + 1; $j < $count; $j++) {
				$r = QuantumMoves::evalSplit($a, $X, $f, $usable[$i], $usable[$j], $ctx);
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
					$r = QuantumMoves::evalMerge($a, $X, $f1, $f2, $t);
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
					$m = QuantumMoves::evalMeasure($a, $X);
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
			$code = MoveRecord::recCode($rec);
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
				$m = QuantumMoves::evalMeasure($a, $X);
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
}
