<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Derived views (ENGINE-RULES §8), identical in both engines. Mirrors src/engine/views.js and fairplay.js.
 *
 * @internal
 */
final class Views {
	/**
	 * Display percentage of a weight (§8): 0 only for W = 0, 100 only for W = T, otherwise 1..99 (round half up).
	 * Accepts non-integer weights (ratios on the T scale) with the same floating-point steps as the JS engine.
	 */
	public static function pct(int|float $W): int {
		if ($W <= 0) {
			return 0;
		}
		if ($W >= Tables::T) {
			return 100;
		}
		// Double arithmetic in the JS order: exact for integer weights, identical for ratios.
		return (int)min(99, max(1, floor((200.0 * (float)$W + Tables::TF) / (2.0 * Tables::TF))));
	}

	/**
	 * For each square: null if no world has a piece there, otherwise `{piece, type, color, weight, probability}`.
	 *
	 * @return list<array{piece: int, type: string, color: string, weight: int, probability: float}|null>
	 */
	public static function squareView(Analysis $a): array {
		$out = [];
		for ($s = 0; $s < 64; $s++) {
			$id = $a->occ[$s];
			if ($id < 0) {
				$out[] = null;
			} else {
				$weight = $a->occW[$s];
				$out[] = [
					'piece' => $id,
					'type' => Tables::TYPE_CHARS[$a->typeCodes[$id]] ?? 'p',
					'color' => $id < 16 ? 'w' : 'b',
					'weight' => $weight,
					'probability' => (float)$weight / Tables::TF,
				];
			}
		}
		return $out;
	}

	/**
	 * For each id 0..31: its locations `[{square, weight, probability}]`, ascending (empty for captured ids).
	 *
	 * @return list<list<array{square: int, weight: int, probability: float}>>
	 */
	public static function pieceLocations(Analysis $a): array {
		$out = [];
		for ($id = 0; $id < 32; $id++) {
			$list = [];
			foreach ($a->locs[$id] as $j => $s) {
				$w = $a->locW[$id][$j];
				$list[] = ['square' => $s, 'weight' => $w, 'probability' => (float)$w / Tables::TF];
			}
			$out[] = $list;
		}
		return $out;
	}

	/**
	 * What-if view (§8): with X = occ(sq), for each square the piece standing there in the worlds with X on sq and
	 * its conditional probability. Null when sq is empty in every world.
	 *
	 * @return list<array{piece: int, weight: int, probability: float}|null>|null
	 */
	public static function conditionalView(Analysis $a, int $sq): ?array {
		$X = $a->occ[$sq];
		if ($X < 0) {
			return null;
		}
		$ch = Tables::$letter[$X];
		$acc = array_fill(0, 64, 0);
		$W0 = 0;
		foreach ($a->boards as $i => $b) {
			if ($b[$sq] !== $ch) {
				continue;
			}
			$w = $a->weights[$i];
			$W0 += $w;
			for ($s = 0; $s < 64; $s++) {
				if ($b[$s] !== '.') {
					$acc[$s] += $w;
				}
			}
		}
		$out = [];
		for ($s = 0; $s < 64; $s++) {
			$out[] = $acc[$s] === 0 ? null : ['piece' => $a->occ[$s], 'weight' => $acc[$s], 'probability' => (float)$acc[$s] / (float)$W0];
		}
		return $out;
	}

	/**
	 * Linked pieces (§8): pairs [X, Y] (X < Y) of live superposed pieces with
	 * |T·W(X@a ∧ Y@b) − W(X@a)·W(Y@b)| ≥ 2^36 for some a ∈ loc(X), b ∈ loc(Y).
	 *
	 * @return list<array{0: int, 1: int}>
	 */
	public static function links(Analysis $a): array {
		$ids = array_merge($a->superposedIds(0), $a->superposedIds(1));
		$out = [];
		$count = count($ids);
		for ($x = 0; $x < $count; $x++) {
			$X = $ids[$x];
			$px = $a->positions($X);
			for ($y = $x + 1; $y < $count; $y++) {
				$Y = $ids[$y];
				$py = $a->positions($Y);
				$joint = [];
				foreach ($a->weights as $i => $w) {
					$k = $px[$i] * 64 + $py[$i];
					$joint[$k] = ($joint[$k] ?? 0) + $w;
				}
				if (self::linked($a, $X, $Y, $joint)) {
					$out[] = [$X, $Y];
				}
			}
		}
		return $out;
	}

	/**
	 * @param array<int, int> $joint joint weights indexed [a * 64 + b]
	 */
	private static function linked(Analysis $a, int $X, int $Y, array $joint): bool {
		foreach ($a->locs[$X] as $i => $sx) {
			$wx = $a->locW[$X][$i];
			foreach ($a->locs[$Y] as $j => $sy) {
				$wy = $a->locW[$Y][$j];
				if (abs(Tables::T * ($joint[$sx * 64 + $sy] ?? 0) - $wx * $wy) >= Tables::LINK_THRESHOLD) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Connected components of links(): lists of ids (ascending), ordered by their smallest id.
	 *
	 * @param list<array{0: int, 1: int}> $links
	 * @return list<list<int>>
	 */
	public static function linkGroups(array $links): array {
		$parent = range(0, 31);
		$find = static function (int $x) use (&$parent): int {
			while ($parent[$x] !== $x) {
				$parent[$x] = $parent[$parent[$x]];
				$x = $parent[$x];
			}
			return $x;
		};
		$members = [];
		foreach ($links as [$x, $y]) {
			$members[$x] = true;
			$members[$y] = true;
			$rx = $find($x);
			$ry = $find($y);
			if ($rx !== $ry) {
				$parent[max($rx, $ry)] = min($rx, $ry);
			}
		}
		$ids = array_keys($members);
		sort($ids);
		$groups = [];
		foreach ($ids as $id) {
			$groups[$find($id)][] = $id;
		}
		$out = array_values($groups);
		usort($out, static fn (array $p, array $q): int => $p[0] <=> $q[0]);
		return $out;
	}

	/**
	 * The 64 support characters of a state: the type letter of occ(s), upper case for White, lower case for
	 * Black, `.` when the square is certainly empty (ENGINE-RULES App. D).
	 */
	public static function supportSquares(Analysis $a): string {
		$out = '';
		for ($s = 0; $s < 64; $s++) {
			$id = $a->occ[$s];
			if ($id < 0) {
				$out .= '.';
			} else {
				$ch = Tables::TYPE_CHARS[$a->typeCodes[$id]] ?? 'p';
				$out .= $id < 16 ? strtoupper($ch) : $ch;
			}
		}
		return $out;
	}

	/**
	 * Support key: `turn|` + 64 characters.
	 */
	public static function supportKey(Analysis $a): string {
		return $a->state['turn'] . '|' . self::supportSquares($a);
	}

	/**
	 * Colour mirror of the support key: ranks flipped, colours (letter case) swapped, turn swapped.
	 */
	public static function supportKeyMirror(Analysis $a): string {
		$sq = self::supportSquares($a);
		$swapped = strtr($sq, 'KQRBNPkqrbnp', 'kqrbnpKQRBNP');
		$rows = str_split($swapped, 8);
		return ($a->state['turn'] === 'w' ? 'b' : 'w') . '|' . implode('', array_reverse($rows));
	}

	/**
	 * FEN of the certain part of a position: every certain piece, ghosts removed (App. B).
	 */
	public static function certainFen(Analysis $a): string {
		$state = $a->state;
		$types = (string)$state['types'];
		$rows = [];
		for ($r = 7; $r >= 0; $r--) {
			$row = '';
			$empty = 0;
			for ($f = 0; $f < 8; $f++) {
				$s = $r * 8 + $f;
				$id = $a->occ[$s];
				if ($id < 0 || $a->occW[$s] !== Tables::T) {
					$empty++;
					continue;
				}
				if ($empty > 0) {
					$row .= (string)$empty;
					$empty = 0;
				}
				$ty = $types[$id];
				$row .= $id < 16 ? strtoupper($ty) : $ty;
			}
			if ($empty > 0) {
				$row .= (string)$empty;
			}
			$rows[] = $row;
		}
		return implode('/', $rows) . ' ' . $state['turn'] . ' ' . $state['castling'] . ' ' . $state['ep'] . ' '
			. $state['halfmove'] . ' ' . $state['fullmove'];
	}
}
