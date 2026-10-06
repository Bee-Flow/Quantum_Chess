<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * The orthodox pieces on the 8 × 8 board: their movement, the start position, pawn double steps and en passant,
 * castling, promotion and the per-world bookkeeping of castling rights and the en passant square.
 *
 * JavaScript twin: src/variants/core/orthodox.js and orthodoxVariant.js (`orthodoxSpec()`: `extraMoves`,
 * `afterMove`, `applyMiss` = `clearEnPassant`, `unifyWorlds` = `unifyCastling`).
 *
 * @internal
 */
final class Orthodox {
	private const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
	private const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
	private const KING_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
	private const KNIGHT_JUMPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

	/**
	 * The movement descriptors per type (`orthodoxTypes`): `[kind, mode, oriented, vectors]`.
	 *
	 * @var array<string, array<int, array{0: string, 1: string, 2: bool, 3: array<int, array{0: int, 1: int}>}>>
	 */
	public const MOVES = [
		'k' => [['leap', 'both', false, self::KING_STEPS]],
		'q' => [['ride', 'both', false, self::ROOK_DIRS], ['ride', 'both', false, self::BISHOP_DIRS]],
		'r' => [['ride', 'both', false, self::ROOK_DIRS]],
		'b' => [['ride', 'both', false, self::BISHOP_DIRS]],
		'n' => [['leap', 'both', false, self::KNIGHT_JUMPS]],
		'p' => [['leap', 'move', true, [[0, 1]]], ['leap', 'capture', true, [[1, 1], [-1, 1]]]],
	];

	/** The promotion choices, in order. */
	public const PROMOTE_TO = ['q', 'r', 'b', 'n'];

	/** The splittable types (neither solid nor royal). */
	private const SPLITTABLE = ['q' => true, 'r' => true, 'b' => true, 'n' => true];

	/** Whether a type is splittable (`types[t].splittable`). */
	public static function splittable(string $type): bool {
		return isset(self::SPLITTABLE[$type]);
	}

	/** Whether a type has a move that only captures, the pawn (`hasCaptureOnlyMove` of umpire.js). */
	public static function captureOnly(string $type): bool {
		return $type === 'p';
	}

	/**
	 * The start world of a variant (`standardSetup(V, 'rnbqkbnr')` with the castling rights of `castlingRights`).
	 */
	public static function setup(VariantRules $rules): World {
		$back = 'rnbqkbnr';
		$sq = [];
		$ty = [];
		$sd = [];
		$board = array_fill(0, Topology::SIZE, -1);
		foreach ([0, 1] as $side) {
			$r = $side === 0 ? 0 : 7;
			$pr = $side === 0 ? 1 : 6;
			foreach ([[$r, null], [$pr, 'p']] as [$rank, $type]) {
				for ($f = 0; $f < 8; $f++) {
					$s = Topology::at($f, $rank);
					$board[$s] = count($sq);
					$sq[] = $s;
					$ty[] = $type ?? $back[$f];
					$sd[] = $side;
				}
			}
		}
		$castle = [];
		foreach ([0, 1] as $side) {
			$r = $side === 0 ? 0 : 7;
			$king = Topology::at(4, $r);
			$castle[] = ['flag' => $side === 0 ? 'K' : 'k', 'side' => $side, 'king' => $king,
				'rook' => Topology::at(7, $r), 'kingTo' => Topology::at(6, $r), 'rookTo' => Topology::at(5, $r)];
			$castle[] = ['flag' => $side === 0 ? 'Q' : 'q', 'side' => $side, 'king' => $king,
				'rook' => Topology::at(0, $r), 'kingTo' => Topology::at(2, $r), 'rookTo' => Topology::at(3, $r)];
		}
		return new World($sq, $ty, $sd, $board, ['ep' => -1, 'epVictim' => -1, 'castle' => $castle], $rules);
	}

	/**
	 * The squares strictly between two squares on one line (`between`).
	 *
	 * @return array<int, int>
	 */
	public static function between(int $a, int $b): array {
		$dx = Topology::file($b) - Topology::file($a);
		$dy = Topology::rank($b) - Topology::rank($a);
		$n = max(abs($dx), abs($dy));
		if ($n < 2 || ($dx !== 0 && abs($dx) !== $n) || ($dy !== 0 && abs($dy) !== $n)) {
			return [];
		}
		$ux = $dx <=> 0;
		$uy = $dy <=> 0;
		$out = [];
		for ($k = 1; $k < $n; $k++) {
			$s = Topology::at(Topology::file($a) + $k * $ux, Topology::rank($a) + $k * $uy);
			if ($s >= 0) {
				$out[] = $s;
			}
		}
		return $out;
	}

	/**
	 * Castling moves of a side (`castlingMoves`): every square the king and the rook cross or land on is empty.
	 *
	 * @param array<int, Move> $out
	 */
	public static function castlingMoves(World $w, int $side, array &$out): void {
		foreach ($w->castle() as $c) {
			if ($c['side'] !== $side) {
				continue;
			}
			$king = $w->board[$c['king']];
			$rook = $w->board[$c['rook']];
			if ($king < 0 || $rook < 0 || $w->ty[$king] !== 'k' || $w->ty[$rook] !== 'r'
				|| $w->sd[$king] !== $side || $w->sd[$rook] !== $side) {
				continue;
			}
			$need = [];
			foreach ([...self::between($c['king'], $c['kingTo']), $c['kingTo'],
				...self::between($c['rook'], $c['rookTo']), $c['rookTo']] as $s) {
				$need[$s] = true;
			}
			unset($need[$c['king']], $need[$c['rook']]);
			foreach ($need as $s => $_) {
				if ($w->board[$s] !== -1) {
					continue 2;
				}
			}
			$long = $c['flag'] === 'Q' || $c['flag'] === 'q';
			$to = $c['kingTo'] === $c['king'] ? $c['rook'] : $c['kingTo'];
			$out[] = new Move($long ? 'O-O-O' : 'O-O', $c['king'], $to, $king, -1, null, 'castle', $rook,
				$c['rookTo'], $c['kingTo']);
		}
	}

	/**
	 * Pawn double steps and en passant captures of a side (`pawnExtras`).
	 *
	 * @param array<int, Move> $out
	 */
	public static function pawnExtras(World $w, int $side, array &$out): void {
		$fy = $side === 0 ? 1 : -1;
		$ep = $w->ep();
		$epVictim = $w->epVictim();
		$victim = $ep >= 0 && $epVictim >= 0 ? $w->board[$epVictim] : -1;
		$epOpen = $victim >= 0 && $w->sd[$victim] !== $side && $w->board[$ep] === -1;
		$startRank = $side === 0 ? 1 : 6;
		foreach ($w->sq as $id => $s) {
			if ($s < 0 || $w->sd[$id] !== $side || $w->ty[$id] !== 'p') {
				continue;
			}
			if (Topology::rank($s) === $startRank) {
				$s1 = Topology::step($s, 0, $fy);
				$s2 = $s1 < 0 ? -1 : Topology::step($s1, 0, $fy);
				if ($s2 >= 0 && $w->board[$s1] === -1 && $w->board[$s2] === -1) {
					$out[] = new Move(World::moveKey($s, $s2), $s, $s2, $id, -1, null, 'double');
				}
			}
			if ($epOpen) {
				foreach ([1, -1] as $dx) {
					$t = Topology::step($s, $dx, $fy);
					if ($t === $ep) {
						$out[] = new Move(World::moveKey($s, $t), $s, $t, $id, $victim, null, 'ep');
					}
				}
			}
		}
	}

	/**
	 * The en passant square and the castling rights after a move (`orthodoxAfterMove`), on the new world.
	 */
	public static function afterMove(World $next, Move $m): void {
		if ($m->kind === 'double') {
			$ep = Topology::at(Topology::file($m->from), intdiv(Topology::rank($m->from) + Topology::rank($m->to), 2));
			$next->x['ep'] = $ep;
			$next->x['epVictim'] = $ep >= 0 ? $m->to : -1;
		} else {
			$next->x['ep'] = -1;
			$next->x['epVictim'] = -1;
		}
		$castle = $next->castle();
		if ($castle !== []) {
			$keep = [];
			foreach ($castle as $c) {
				if (!($m->from === $c['king'] || $m->from === $c['rook'] || $m->to === $c['rook']
					|| $m->to === $c['king'])) {
					$keep[] = $c;
				}
			}
			$next->x['castle'] = $keep;
		}
	}

	/**
	 * The en passant right ends after one ply, also in an idle world (`clearEnPassant`, the `applyMiss` hook): the
	 * world itself when there is none, else a copy without it.
	 */
	public static function clearEnPassant(World $b): World {
		if ($b->ep() === -1 && $b->epVictim() === -1) {
			return $b;
		}
		$x = $b->x;
		$x['ep'] = -1;
		$x['epVictim'] = -1;
		return $b->withX($x);
	}

	/**
	 * The text key of a castling right (`rightKey`).
	 *
	 * @param array{flag: string, side: int, king: int, rook: int, kingTo: int, rookTo: int} $c
	 */
	private static function rightKey(array $c): string {
		return $c['flag'] . ':' . $c['side'] . ':' . $c['king'] . ':' . $c['rook'] . ':' . $c['kingTo'] . ':'
			. $c['rookTo'];
	}

	/**
	 * A castling right is kept only while every world has it (`unifyCastling`, the `unifyWorlds` hook): the same
	 * list when all worlds agree, else copies of the worlds whose rights change.
	 *
	 * @param array<int, World> $bs
	 * @return array<int, World>
	 */
	public static function unifyCastling(array $bs): array {
		$n = count($bs);
		if ($n < 2) {
			return $bs;
		}
		$lists = array_map(static fn (World $b): array => $b->castle(), $bs);
		$empty = true;
		foreach ($lists as $l) {
			if ($l !== []) {
				$empty = false;
				break;
			}
		}
		if ($empty) {
			return $bs;
		}
		$keys = [];
		$count = [];
		foreach ($lists as $i => $l) {
			$keys[$i] = array_map(self::rightKey(...), $l);
			foreach (array_unique($keys[$i]) as $k) {
				$count[$k] = ($count[$k] ?? 0) + 1;
			}
		}
		$out = [];
		foreach ($bs as $i => $b) {
			$all = true;
			foreach ($keys[$i] as $k) {
				if ($count[$k] !== $n) {
					$all = false;
					break;
				}
			}
			if ($all) {
				$out[] = $b;
				continue;
			}
			$keep = [];
			foreach ($lists[$i] as $j => $c) {
				if ($count[$keys[$i][$j]] === $n) {
					$keep[] = $c;
				}
			}
			$x = $b->x;
			$x['castle'] = $keep;
			$out[] = $b->withX($x);
		}
		return $out;
	}
}
