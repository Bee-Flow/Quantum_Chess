<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * Kriegspiel's umpire: the squares a side sees, the board as a side knows it (every enemy piece removed), the moves a
 * player may try, and the announcement after every move (captures, check with its directions and chance, pawn
 * tries), stored on the history record as `info: { announce, end? }`.
 *
 * JavaScript twin: src/variants/kriegspiel/umpire.js (without the texts) and the `recordInfo` hook of
 * src/variants/kriegspiel.js.
 *
 * @psalm-import-type Branch from Quantum
 *
 * @internal
 */
final class Kriegspiel extends VariantRules {
	/** The check directions in the order in which they are announced (`DIRECTIONS`). */
	public const DIRECTIONS = ['file', 'rank', 'long', 'short', 'knight'];

	public function id(): string {
		return 'kriegspiel';
	}

	public function umpire(): bool {
		return true;
	}

	public function visibleSquares(State $state, int $seat): array {
		return self::visibility($state, $seat);
	}

	public function viewWorlds(State $state, int $seat, array $visible): array {
		return self::ownView($state, $seat)->worlds;
	}

	public function candidateCodes(State $state): array {
		return array_column(self::candidateMoves($state), 'code');
	}

	/**
	 * The squares a side sees: those of its own pieces in some world (`visibility`).
	 *
	 * @return array<int, true>
	 */
	public static function visibility(State $state, int $side): array {
		$out = [];
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			foreach ($b->sq as $id => $s) {
				if ($s >= 0 && $b->sd[$id] === $side) {
					$out[$s] = true;
				}
			}
		}
		return $out;
	}

	/**
	 * A world as `side` knows it (`ownWorld`): every other piece off the board as a pawn, no en passant square, only
	 * `side`'s castling rights.
	 */
	private static function ownWorld(World $b, int $side): World {
		$c = $b->copy();
		foreach ($c->sq as $id => $_) {
			if ($c->sd[$id] !== $side) {
				$c->place($id, World::OFF);
				$c->ty[$id] = 'p';
			}
		}
		$x = $c->x;
		$x['ep'] = -1;
		$x['epVictim'] = -1;
		$x['castle'] = array_values(array_filter($c->castle(), static fn (array $r): bool => $r['side'] === $side));
		$c->x = $x;
		return $c;
	}

	/**
	 * The state as `side` knows it (`ownView`): identical worlds merged in first-seen order, weights added, no
	 * history, quiet 0. Built once per state and side.
	 */
	public static function ownView(State $state, int $side): State {
		if (isset($state->views[$side])) {
			return $state->views[$side];
		}
		$bs = [];
		foreach ($state->worlds as $e) {
			$bs[] = self::ownWorld($e['b'], $side);
		}
		$worlds = Quantum::mergeWorlds($bs, array_column($state->worlds, 'w'));
		$view = new State($state->v, $state->variant, $state->options, $worlds, $state->turn, $state->ply, 0,
			$state->result, []);
		return $state->views[$side] = $view;
	}

	/**
	 * The moves the side to move may try (`candidateMoves`): its moves on its own board, plus the pawn tries.
	 *
	 * @return array<int, array{code: string, type: string, from: int, to: int, promo: string|null, drop: null,
	 *   kind: string}>
	 */
	public static function candidateMoves(State $state): array {
		if ($state->result !== null) {
			return [];
		}
		$side = $state->turn;
		$own = self::ownView($state, $side);
		$byKey = [];
		foreach (Quantum::ordinaryMoves($own) as $m) {
			$byKey[$m['code']] = $m;
		}
		$tries = [];
		foreach ($own->worlds as $e) {
			$b = $e['b'];
			foreach ($b->sq as $id => $s) {
				if ($s >= 0 && $b->sd[$id] === $side && Orthodox::captureOnly($b->ty[$id])) {
					World::pieceMoves($b, $id, $tries, true);
				}
			}
		}
		foreach ($tries as $m) {
			if ($m->kind === 'try' && !isset($byKey[$m->key])) {
				$byKey[$m->key] = ['code' => $m->key, 'type' => 'move', 'from' => $m->from, 'to' => $m->to,
					'promo' => $m->promo, 'drop' => null, 'kind' => 'try'];
			}
		}
		return array_values($byKey);
	}

	/**
	 * The number of squares on the diagonal through `(f, r)` in direction `(1, s)` and back (`diagonalLength`).
	 */
	private static function diagonalLength(int $f, int $r, int $s): int {
		$up = $s > 0 ? Topology::RANKS - 1 - $r : $r;
		$down = $s > 0 ? $r : Topology::RANKS - 1 - $r;
		return min(Topology::FILES - 1 - $f, $up) + min($f, $down) + 1;
	}

	/**
	 * The direction of a check from the king's point of view (`checkDirection`).
	 */
	public static function checkDirection(int $king, int $from): string {
		$f = Topology::file($king);
		$r = Topology::rank($king);
		$dx = Topology::file($from) - $f;
		$dy = Topology::rank($from) - $r;
		if ($dy === 0) {
			return 'rank';
		}
		if ($dx === 0) {
			return 'file';
		}
		if (abs($dx) !== abs($dy)) {
			return 'knight';
		}
		$sign = ($dx <=> 0) * ($dy <=> 0);
		return self::diagonalLength($f, $r, $sign) > self::diagonalLength($f, $r, -$sign) ? 'long' : 'short';
	}

	/**
	 * The check of the side to move (`checkOf`): `{ dirs, p }`, or null.
	 *
	 * @return array{dirs: array<int, string>, p: int|float}|null
	 */
	public static function checkOf(State $state): ?array {
		if ($state->result !== null) {
			return null;
		}
		$side = $state->turn;
		$dirs = [];
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			foreach (World::generate($b, 1 - $side) as $m) {
				if ($m->capture >= 0 && $b->sd[$m->capture] === $side && World::royal($b->ty[$m->capture])) {
					$dirs[self::checkDirection($m->to, $m->from)] = true;
				}
			}
		}
		if ($dirs === []) {
			return null;
		}
		$list = [];
		foreach (self::DIRECTIONS as $d) {
			if (isset($dirs[$d])) {
				$list[] = $d;
			}
		}
		return ['dirs' => $list, 'p' => Quantum::royalDanger($state, $side)];
	}

	/**
	 * The pawn tries of the side to move (`pawnTries`).
	 */
	public static function pawnTries(State $state): int {
		if ($state->result !== null) {
			return 0;
		}
		$legal = Quantum::table($state)['union'];
		$pairs = [];
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			foreach (World::generate($b, $state->turn) as $m) {
				if ($m->capture >= 0 && Orthodox::captureOnly($b->ty[$m->id]) && isset($legal[$m->key])) {
					$pairs[$m->from . ':' . $m->to] = true;
				}
			}
		}
		return count($pairs);
	}

	/**
	 * The captures of a played move as the umpire announces them (`capturesOf`): `[{ sq, kind }]`.
	 *
	 * @param Branch $branch
	 * @return array<int, array{sq: string, kind: string}>
	 */
	private static function capturesOf(State $prev, string $code, array $branch): array {
		$out = [];
		$seen = [];
		foreach ($branch['captures'] as $X) {
			$sq = $X;
			$kind = 'piece';
			$ep = null;
			foreach ($prev->worlds as $e) {
				$m = World::generate($e['b'], $prev->turn)[$code] ?? null;
				if ($m !== null && $m->kind === 'ep' && $m->to === $X && $e['b']->epVictim() >= 0) {
					$ep = $e['b'];
					break;
				}
			}
			if ($ep !== null) {
				$sq = $ep->epVictim();
				$kind = 'pawn';
			} else {
				foreach ($prev->worlds as $e) {
					$b = $e['b'];
					$occ = $b->board[$X];
					if ($occ < 0 || $b->sd[$occ] === $prev->turn) {
						continue;
					}
					if (World::royal($b->ty[$occ])) {
						$kind = 'king';
						break;
					}
					if (Orthodox::captureOnly($b->ty[$occ])) {
						$kind = 'pawn';
					}
				}
			}
			$name = Topology::name($sq);
			if (!isset($seen[$name])) {
				$seen[$name] = true;
				$out[] = ['sq' => $name, 'kind' => $kind];
			}
		}
		return $out;
	}

	/**
	 * The record info of a move (the `recordInfo` hook of kriegspiel.js): `{ announce: { captures, check, tries },
	 * end? }`.
	 *
	 * @param Branch $branch
	 * @return array<string, mixed>
	 */
	public function recordInfo(State $prev, string $code, array $branch, State $next): array {
		$info = ['announce' => [
			'captures' => self::capturesOf($prev, $code, $branch),
			'check' => self::checkOf($next),
			'tries' => self::pawnTries($next),
		]];
		if ($next->result !== null) {
			$info['end'] = true;
		}
		return $info;
	}
}
