<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * Bee Flow Chess: orthodox quantum chess in which each side's back rank is shuffled on its own (`options.white`,
 * `options.black`, numbers of `backRank`), without castling; an enemy piece is shown as a placeholder (`x`) until it
 * has moved in some world (`x.seen`, the same in every world) or is a pawn; and a piece next to its own Queen Bee (the
 * royal king) cannot be captured in a world where she stands beside it (the privacy shield, `filterMoves`).
 *
 * JavaScript twin: src/variants/beeflow.js (`backRank`, `setup`, `extraMoves`, `filterMoves`, `afterMove`,
 * `unifyWorlds`, `recordInfo`, `viewOf`) and `viewFor` of src/variants/referee.js (every square visible).
 *
 * @internal
 */
final class BeeFlow extends VariantRules {
	/** The number of different back ranks: 8! / (2! 2! 2!). */
	public const ARRANGEMENTS = 5040;
	/** The placeholder type: an enemy piece whose type the viewer does not know. */
	public const HIDDEN = 'x';

	/** The back-rank pieces of one side and how many of each, in the order in which `backRank` counts them. */
	private const PIECES = ['b' => 2, 'k' => 1, 'n' => 2, 'q' => 1, 'r' => 2];

	/** @var array<int, array<int, int>>|null the squares next to each square */
	private static ?array $neighbours = null;

	public function id(): string {
		return 'beeflow';
	}

	/**
	 * The number of different orders of the pieces left (`orders`).
	 *
	 * @param array<string, int> $left
	 */
	private static function orders(array $left): int {
		$n = 0;
		$d = 1;
		foreach ($left as $c) {
			$n += $c;
			for ($i = 2; $i <= $c; $i++) {
				$d *= $i;
			}
		}
		$f = 1;
		for ($i = 2; $i <= $n; $i++) {
			$f *= $i;
		}
		return intdiv($f, $d);
	}

	/**
	 * The back rank with number `index` (0 to 5039), from file a (`backRank`): 0 is `bbknnqrr`, 5039 `rrqnnkbb`.
	 *
	 * @throws \InvalidArgumentException for a number outside [0, 5040)
	 */
	public static function backRank(int $index): string {
		if ($index < 0 || $index >= self::ARRANGEMENTS) {
			throw new \InvalidArgumentException('not a back rank number: ' . $index);
		}
		$left = self::PIECES;
		$rest = $index;
		$out = '';
		for ($i = 0; $i < 8; $i++) {
			foreach ($left as $ty => $count) {
				if ($count === 0) {
					continue;
				}
				$left[$ty]--;
				$n = self::orders($left);
				if ($rest < $n) {
					$out .= $ty;
					break;
				}
				$rest -= $n;
				$left[$ty]++;
			}
		}
		return $out;
	}

	/**
	 * The two arrangement numbers, `{ white, black }`: both must be given, as integers in [0, 5040).
	 */
	public function options(array $given): array {
		$out = [];
		foreach (['white', 'black'] as $k) {
			$n = $given[$k] ?? null;
			if (!is_int($n) || $n < 0 || $n >= self::ARRANGEMENTS) {
				throw new \InvalidArgumentException('Bee Flow Chess needs the arrangement number ' . $k
					. ' in [0, ' . self::ARRANGEMENTS . ')');
			}
			$out[$k] = $n;
		}
		return $out;
	}

	/**
	 * The start world (`setup`): each side's back rank by its arrangement number, pawns as usual, no castling rights
	 * and no piece seen yet. Piece ids: White's back rank from file a, White's pawns, then Black's.
	 */
	public function setup(array $options): World {
		$ranks = [];
		foreach (['white', 'black'] as $k) {
			$n = $options[$k] ?? null;
			$ranks[] = self::backRank(is_int($n) ? $n : -1);
		}
		$sq = [];
		$ty = [];
		$sd = [];
		$board = array_fill(0, Topology::SIZE, -1);
		foreach ([0, 1] as $side) {
			$back = $side === 0 ? 0 : 7;
			$pawns = $side === 0 ? 1 : 6;
			foreach ([[$back, null], [$pawns, 'p']] as [$rank, $type]) {
				for ($f = 0; $f < 8; $f++) {
					$s = Topology::at($f, $rank);
					$board[$s] = count($sq);
					$sq[] = $s;
					$ty[] = $type ?? $ranks[$side][$f];
					$sd[] = $side;
				}
			}
		}
		return new World($sq, $ty, $sd, $board, ['ep' => -1, 'epVictim' => -1, 'castle' => [], 'seen' => []], $this);
	}

	/**
	 * Double steps and en passant; no castling.
	 */
	public function extraMoves(World $w, int $side, array &$out): void {
		Orthodox::pawnExtras($w, $side, $out);
	}

	public function filters(): bool {
		return true;
	}

	/**
	 * The privacy shield: no capture of a shielded piece.
	 */
	public function filterMoves(World $w, int $side, array $list): array {
		$out = [];
		foreach ($list as $m) {
			if ($m->capture < 0 || !self::shielded($w, $m->capture)) {
				$out[] = $m;
			}
		}
		return $out;
	}

	/**
	 * The squares next to a square (the king's steps).
	 *
	 * @return array<int, int>
	 */
	private static function neighbours(int $sq): array {
		if (self::$neighbours === null) {
			$all = [];
			for ($s = 0; $s < Topology::SIZE; $s++) {
				$list = [];
				foreach ([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as [$df, $dr]) {
					$n = Topology::step($s, $df, $dr);
					if ($n >= 0) {
						$list[] = $n;
					}
				}
				$all[$s] = $list;
			}
			self::$neighbours = $all;
		}
		return self::$neighbours[$sq];
	}

	/**
	 * Whether a piece stands under the privacy shield in a world (`shielded`): it is not royal, and a royal piece of
	 * its own side stands next to it.
	 */
	public static function shielded(World $w, int $id): bool {
		$sq = $w->sq[$id];
		if ($sq < 0 || World::royal($w->ty[$id])) {
			return false;
		}
		foreach (self::neighbours($sq) as $n) {
			$o = $w->board[$n];
			if ($o >= 0 && $w->sd[$o] === $w->sd[$id] && World::royal($w->ty[$o])) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The pieces seen so far in a world (`x.seen`), ascending.
	 *
	 * @return array<int, int>
	 */
	private static function seen(World $w): array {
		$seen = $w->x['seen'] ?? [];
		return is_array($seen) ? array_values(array_map('intval', $seen)) : [];
	}

	/**
	 * The orthodox bookkeeping (en passant), and the moving piece is seen.
	 */
	public function afterMove(World $next, Move $m): void {
		Orthodox::afterMove($next, $m);
		$seen = self::seen($next);
		if (!in_array($m->id, $seen, true)) {
			$seen[] = $m->id;
			sort($seen);
		}
		$next->x['seen'] = $seen;
	}

	/**
	 * A piece seen in one world is seen in all of them: the worlds whose list is shorter than the union get it.
	 */
	public function unifyWorlds(array $bs): array {
		$all = [];
		foreach ($bs as $b) {
			foreach (self::seen($b) as $id) {
				$all[$id] = true;
			}
		}
		$union = array_keys($all);
		sort($union);
		$out = [];
		foreach ($bs as $b) {
			if (count(self::seen($b)) === count($union)) {
				$out[] = $b;
				continue;
			}
			$x = $b->x;
			$x['seen'] = $union;
			$out[] = $b->withX($x);
		}
		return $out;
	}

	/**
	 * What a capture tells, as in Fog of war: `{ taken, types }`, or null.
	 */
	public function recordInfo(State $prev, string $code, array $branch, State $next): ?array {
		return FogOfWar::captureInfo($prev, $code, $branch);
	}

	/**
	 * The worlds as `viewer` may know them while the game runs (`viewOf`): every enemy piece whose type is not public
	 * (not a pawn, not seen) is a placeholder, identical worlds merged in first-seen order, weights added.
	 *
	 * @return array<int, array{b: World, w: int}>
	 */
	public static function viewOf(State $state, int $viewer): array {
		$bs = [];
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			$seen = array_flip(self::seen($b));
			$ty = null;
			foreach ($b->ty as $id => $t) {
				if ($b->sd[$id] !== $viewer && $t !== 'p' && !isset($seen[$id]) && $t !== self::HIDDEN) {
					$ty ??= $b->ty;
					$ty[$id] = self::HIDDEN;
				}
			}
			$bs[] = $ty === null ? $b : new World($b->sq, $ty, $b->sd, $b->board, $b->x, $b->rules);
		}
		return Quantum::mergeWorlds($bs, array_column($state->worlds, 'w'));
	}

	public function viewWorlds(State $state, int $seat, array $visible): array {
		return self::viewOf($state, $seat);
	}
}
