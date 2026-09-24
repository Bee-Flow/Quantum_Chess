<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Per-world move functions and world bookkeeping (§4.3, §4.6–§4.9, §5.1 A2–A8, §5.3, §5.4).
 *
 * JavaScript twin: src/engine/outcomes.js, rescale.js, bookkeeping.js and hash.js. Section numbers (§) refer to
 * docs/engine-rules.md.
 *
 * @internal
 */
final class Worlds {
	private const KEY_CODE = ['miss' => MoveRecord::MISS, 'move' => MoveRecord::MOVE, 'capture' => MoveRecord::CAPTURE];

	/**
	 * The outcome keys of a record as getOutcomes lists them: the outcome keys of a rolled move, otherwise the
	 * single pseudo-key (`certain`/`quantum`) that stands for "no filter".
	 *
	 * @return list<string>
	 */
	public static function recordKeys(MoveRecord $rec): array {
		if ($rec->resolution === 'rolled') {
			return array_column($rec->outcomes, 'key');
		}
		return [$rec->resolution];
	}

	/**
	 * Does this outcome of the record capture a piece? (A rolled `capture`, or the single outcome of a certain
	 * capture.)
	 */
	public static function outcomeCaptures(MoveRecord $rec, string $key): bool {
		if ($key === 'capture') {
			return true;
		}
		return $key === 'certain' && count($rec->outcomes) === 1 && $rec->outcomes[0]['key'] === 'capture';
	}

	/**
	 * Apply the per-world function of a record to every world and keep the worlds of one outcome key (A2, A3).
	 * The result is not canonical yet (unsorted, possibly with duplicates, sum ≤ T).
	 *
	 * @param string $key outcome key to keep (`certain`/`quantum` keep everything)
	 * @return array{0: list<string>, 1: list<int>, 2: int} boards, weights, total weight
	 */
	public static function outcomeBoards(Analysis $a, MoveRecord $rec, string $key): array {
		$boards = [];
		$weights = [];
		$total = 0;
		$ch = $rec->letter;
		if ($rec->castle !== null) {
			$c = $rec->castle;
			$rookCh = Tables::$letter[$c['rook']];
			foreach ($a->boards as $b) {
				$b[$c['from']] = '.';
				$b[$c['to']] = $ch;
				$b[$c['rookFrom']] = '.';
				$b[$c['rookTo']] = $rookCh;
				$boards[] = $b;
			}
			return [$boards, $a->weights, Tables::T];
		}
		$filter = $rec->resolution === 'rolled' && $rec->kind !== 'measure' ? self::KEY_CODE[$key] : -1;
		switch ($rec->kind) {
			case 'standard':
				$epSquare = $rec->ep ? ($rec->ci === 0 ? $rec->t - 8 : $rec->t + 8) : -1;
				foreach ($a->boards as $i => $b) {
					$k = MoveRules::standardKeyIn($rec, $b);
					if ($filter >= 0 && $k !== $filter) {
						continue;
					}
					if ($k !== MoveRecord::MISS) {
						$b[$rec->f] = '.';
						$b[$rec->t] = $ch;
						if ($epSquare >= 0) {
							$b[$epSquare] = '.';
						}
					}
					$boards[] = $b;
					$w = $a->weights[$i];
					$weights[] = $w;
					$total += $w;
				}
				break;
			case 'merge':
				foreach ($a->boards as $i => $b) {
					$src = MoveRules::mergeSourceIn($rec, $b);
					$k = MoveRecord::MISS;
					if ($src !== 0) {
						$k = $b[$rec->t] === '.' ? MoveRecord::MOVE : MoveRecord::CAPTURE;
					}
					if ($filter >= 0 && $k !== $filter) {
						continue;
					}
					if ($src !== 0) {
						$b[$src === 1 ? $rec->f : $rec->f2] = '.';
						$b[$rec->t] = $ch;
					}
					$boards[] = $b;
					$w = $a->weights[$i];
					$weights[] = $w;
					$total += $w;
				}
				break;
			case 'split':
				$onF = $rec->onF ?? [];
				$flags1 = $rec->flags1 ?? [];
				$flags2 = $rec->flags2 ?? [];
				$j = 0;
				$m = count($onF);
				foreach ($a->boards as $i => $b) {
					$w = $a->weights[$i];
					if ($j < $m && $onF[$j] === $i) {
						// child 1 gets ceil(w/2) and goes to t1 (the lower index), child 2 gets floor(w/2) (§4.7)
						$c1 = $flags1[$j] === 1;
						$c2 = $flags2[$j] === 1;
						$j++;
						$b1 = $b;
						if ($c1) {
							$b1[$rec->f] = '.';
							$b1[$rec->t] = $ch;
						}
						$boards[] = $b1;
						$weights[] = $w - ($w >> 1);
						if ($w >= 2) {
							$b2 = $b;
							if ($c2) {
								$b2[$rec->f] = '.';
								$b2[$rec->t2] = $ch;
							}
							$boards[] = $b2;
							$weights[] = $w >> 1;
						}
					} else {
						$boards[] = $b;
						$weights[] = $w;
					}
					$total += $w;
				}
				break;
			default:
				// measure: keep the worlds with X on the named square
				$s = Tables::$index[$key] ?? -1;
				foreach ($a->boards as $i => $b) {
					if ($s < 0 || $b[$s] !== $ch) {
						continue;
					}
					$boards[] = $b;
					$w = $a->weights[$i];
					$weights[] = $w;
					$total += $w;
				}
		}
		return [$boards, $weights, $total];
	}

	/**
	 * Sort worlds by board (byte order) and merge identical boards (A4, A5). Boards never look like integers, so
	 * they are safe as array keys.
	 *
	 * @param list<string> $boards
	 * @param list<int> $weights
	 * @return list<array{0: string, 1: int}>
	 */
	public static function canonical(array $boards, array $weights): array {
		if (count($boards) === 1) {
			return [[$boards[0], $weights[0]]];
		}
		$acc = [];
		foreach ($boards as $i => $b) {
			$acc[$b] = ($acc[$b] ?? 0) + $weights[$i];
		}
		ksort($acc, SORT_STRING);
		$out = [];
		foreach ($acc as $b => $w) {
			$out[] = [(string)$b, $w];
		}
		return $out;
	}

	/**
	 * Largest-remainder rescale (§5.3) of positive integer weights whose sum S is below T: the result sums to T.
	 * Ties of the remainder go to the lower index.
	 *
	 * @param array<int, int> $weights
	 * @return array<int, int> the new weights, with the keys of `$weights`
	 */
	public static function rescale(array $weights): array {
		$S = array_sum($weights);
		if ($S === Tables::T) {
			return $weights;
		}
		if (!($S > 0 && $S < Tables::T)) {
			throw new \RangeException('rescale needs 0 < S < T');
		}
		$q = [];
		$r = [];
		$sumQ = 0;
		foreach ($weights as $i => $w) {
			$N = $w * Tables::T;
			$qi = intdiv($N, $S);
			$q[$i] = $qi;
			$r[$i] = $N % $S;
			$sumQ += $qi;
		}
		$D = Tables::T - $sumQ;
		if ($D > 0) {
			$order = array_keys($weights);
			usort($order, static fn (int $x, int $y): int => ($r[$y] <=> $r[$x]) ?: ($x <=> $y));
			for ($k = 0; $k < $D; $k++) {
				$q[$order[$k]]++;
			}
		}
		return $q;
	}

	/**
	 * State-based castling (§5.4): keep a present flag only while its king and rook are on their home squares in
	 * every world. Flags are never added.
	 *
	 * @param list<array{0: string, 1: int}> $worlds
	 */
	public static function castlingAfter(string $castling, array $worlds): string {
		if ($castling === '-') {
			return '-';
		}
		$out = '';
		foreach (Tables::CASTLING_FLAGS as $flag) {
			if (!str_contains($castling, $flag)) {
				continue;
			}
			$c = Tables::CASTLING[$flag];
			$kc = Tables::$letter[$c['king']];
			$rc = Tables::$letter[$c['rook']];
			$keep = true;
			foreach ($worlds as $w) {
				if ($w[0][$c['from']] !== $kc || $w[0][$c['rookFrom']] !== $rc) {
					$keep = false;
					break;
				}
			}
			if ($keep) {
				$out .= $flag;
			}
		}
		return $out === '' ? '-' : $out;
	}

	/**
	 * The en-passant field after a move (§5.4): the skipped square iff a pawn double push actually moved and an
	 * enemy pawn stands beside its target (same rank, adjacent file; never t ± 1 by index).
	 *
	 * @param list<array{0: string, 1: int}> $worlds
	 */
	public static function epAfter(MoveRecord $rec, string $key, array $worlds, string $types): string {
		if ($rec->pawn !== 'double' || $key !== 'move') {
			return '-';
		}
		$t = $rec->t;
		$b = $worlds[0][0];
		$file = $t & 7;
		foreach ([-1, 1] as $df) {
			$ff = $file + $df;
			if ($ff < 0 || $ff > 7) {
				continue;
			}
			$c = $b[($t & ~7) + $ff];
			$id = Tables::$idOf[$c] ?? -1;
			if ($id >= 0 && ($id < 16) !== ($rec->ci === 0) && $types[$id] === 'p') {
				return Tables::$names[($rec->f + $t) >> 1];
			}
		}
		return '-';
	}

	/**
	 * The types string after a move: a pawn that moved or captured onto its last rank takes its promotion type.
	 */
	public static function typesAfter(string $types, MoveRecord $rec, string $key): string {
		if ($rec->type === Tables::TYPE_P && $rec->promo !== null && ($key === 'move' || $key === 'capture')) {
			$types[$rec->X] = $rec->promo;
		}
		return $types;
	}

	/**
	 * The halfmove clock after a move: 0 on a capture or an actual pawn move, otherwise +1.
	 */
	public static function halfmoveAfter(int $halfmove, MoveRecord $rec, string $key): int {
		if ($key === 'capture' || ($rec->type === Tables::TYPE_P && $key === 'move')) {
			return 0;
		}
		return $halfmove + 1;
	}

	/**
	 * Position hash (§5.4): FNV-1a-64 over `turn|castling|ep|types|board_0:weight_0,…` (worlds canonical).
	 *
	 * @param list<array{0: string, 1: int}>|array<array-key, mixed> $worlds
	 */
	public static function hash(string $turn, string $castling, string $ep, string $types, array $worlds): string {
		$parts = [];
		foreach ($worlds as $w) {
			$parts[] = $w[0] . ':' . $w[1];
		}
		return hash('fnv1a64', $turn . '|' . $castling . '|' . $ep . '|' . $types . '|' . implode(',', $parts));
	}

	/**
	 * Position hash of a state.
	 *
	 * @param array<string, mixed> $state
	 */
	public static function positionHash(array $state): string {
		return self::hash(
			(string)$state['turn'],
			(string)$state['castling'],
			(string)$state['ep'],
			(string)$state['types'],
			(array)$state['worlds'],
		);
	}
}
