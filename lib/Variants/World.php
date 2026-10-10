<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * One world: an ordinary position (piece list, board and the extra state `x`), with move generation and application
 * for the orthodox pieces.
 *
 * JavaScript twin: src/variants/core/world.js. As there, a world is never changed once it is complete, so its key and
 * its moves are remembered on the object (the JavaScript `keyCache` and `genCache`, which are keyed by the world
 * object as well). Only a fresh copy (`copy`, `withX`) is changed while it is being built.
 *
 * @internal
 */
final class World {
	/** Square value of a piece that has been removed from the game (`OFF`). */
	public const OFF = -1;

	/** @var array<string, string> */
	private const ROYAL = ['k' => 'k'];
	/** @var array<string, string> */
	private const SOLID = ['k' => 'k', 'p' => 'p'];

	/** @var string|null `worldKey`, once computed */
	public ?string $key = null;
	/** @var array<int, array<string, Move>> `generate` per side */
	public array $gen = [];
	/** @var array<int, array<string, array<int, Move>>> `quietTargets` per side, by `id:from` */
	public array $quiet = [];

	/** @var array<string, array<int, array{0: string, 1: string, 2: array<int, int>}>> `linesOf` by type:side:sq */
	private static array $lines = [];

	/**
	 * @param array<int, int> $sq square of every piece id (-1 off the board)
	 * @param array<int, string> $ty type of every piece id
	 * @param array<int, int> $sd side of every piece id
	 * @param array<int, int> $board piece id on every square, -1 when empty
	 * @param array<string, mixed> $x the extra state: `ep`, `epVictim`, `castle`
	 */
	public function __construct(
		public array $sq,
		public array $ty,
		public array $sd,
		public array $board,
		public array $x,
	) {
	}

	/**
	 * A copy that may be changed (`cloneWorld`).
	 */
	public function copy(): self {
		return new self($this->sq, $this->ty, $this->sd, $this->board, $this->x);
	}

	/**
	 * The same pieces with other extra state (`{ ...b, x }`).
	 *
	 * @param array<string, mixed> $x
	 */
	public function withX(array $x): self {
		return new self($this->sq, $this->ty, $this->sd, $this->board, $x);
	}

	/**
	 * Move piece `id` to square `to` or off the board, in a world under construction (`placePiece`).
	 */
	public function place(int $id, int $to): void {
		$from = $this->sq[$id];
		if ($from >= 0 && $this->board[$from] === $id) {
			$this->board[$from] = -1;
		}
		$this->sq[$id] = $to;
		if ($to >= 0) {
			$this->board[$to] = $id;
		}
	}

	/**
	 * The castling rights of the world (`x.castle`, empty when absent).
	 *
	 * @return array<int, array{flag: string, side: int, king: int, rook: int, kingTo: int, rookTo: int}>
	 */
	public function castle(): array {
		/** @var array<int, array{flag: string, side: int, king: int, rook: int, kingTo: int, rookTo: int}> */
		return is_array($this->x['castle'] ?? null) ? $this->x['castle'] : [];
	}

	/** The en passant square, or -1 (`x.ep`). */
	public function ep(): int {
		return is_int($this->x['ep'] ?? null) ? $this->x['ep'] : -1;
	}

	/** The square of the pawn that can be taken en passant, or -1 (`x.epVictim`). */
	public function epVictim(): int {
		return is_int($this->x['epVictim'] ?? null) ? $this->x['epVictim'] : -1;
	}

	/**
	 * A world from its JSON form.
	 *
	 * @param array<array-key, mixed> $b
	 */
	public static function fromArray(array $b): self {
		$x = $b['x'] ?? [];
		if ($x instanceof \stdClass) {
			$x = (array)$x;
		}
		/** @psalm-suppress MixedArgument */
		return new self(
			array_map('intval', array_values((array)$b['sq'])),
			array_map('strval', array_values((array)$b['ty'])),
			array_map('intval', array_values((array)$b['sd'])),
			array_map('intval', array_values((array)$b['board'])),
			self::plainX(is_array($x) ? $x : []),
		);
	}

	/**
	 * The extra state as plain arrays (decoded JSON objects of a castling right become arrays).
	 *
	 * @param array<array-key, mixed> $x
	 * @return array<string, mixed>
	 */
	private static function plainX(array $x): array {
		$out = [];
		foreach ($x as $k => $v) {
			if ($k === 'castle' && is_array($v)) {
				$list = [];
				foreach ($v as $r) {
					$list[] = (array)$r;
				}
				$v = $list;
			}
			$out[(string)$k] = $v;
		}
		return $out;
	}

	/**
	 * The JSON form of the world: `{ sq, ty, sd, board, x }`, with `x` an object even when empty.
	 *
	 * @return array{sq: array<int, int>, ty: array<int, string>, sd: array<int, int>, board: array<int, int>,
	 *   x: array<string, mixed>|\stdClass}
	 */
	public function toArray(): array {
		return [
			'sq' => $this->sq,
			'ty' => $this->ty,
			'sd' => $this->sd,
			'board' => $this->board,
			'x' => $this->x === [] ? new \stdClass() : $this->x,
		];
	}

	/**
	 * The text key of a world (`worldKey`): two worlds with the same key are the same position. Remembered.
	 */
	public static function key(self $w): string {
		return $w->key ??= self::text($w->sq, $w->ty, $w->sd, $w->board, $w->x);
	}

	/**
	 * The text of a world from its parts (`keyOf` of world.js, `worldText` of online.js): the board with side, type
	 * and id per square, the hands (none on these boards), and `JSON.stringify(x)`.
	 *
	 * @param array<int, int> $sq
	 * @param array<int, string> $ty
	 * @param array<int, int> $sd
	 * @param array<int, int> $board
	 * @param array<array-key, mixed>|\stdClass $x
	 */
	public static function text(array $sq, array $ty, array $sd, array $board, array|\stdClass $x): string {
		$hands = [];
		foreach ($sq as $id => $s) {
			if ($s === -2) {
				$hands[] = $sd[$id] . $ty[$id];
			}
		}
		sort($hands, SORT_STRING);
		$cells = [];
		foreach ($board as $id) {
			$cells[] = $id < 0 ? '.' : $sd[$id] . $ty[$id] . $id;
		}
		return implode(',', $cells) . '|' . implode('', $hands) . '|' . self::json($x);
	}

	/**
	 * `JSON.stringify` of plain data: an empty array that stands for an object (`x`) is written as `{}`.
	 *
	 * @param mixed $v
	 */
	public static function json(mixed $v): string {
		if ($v === []) {
			return '{}';
		}
		return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION
			| JSON_THROW_ON_ERROR);
	}

	/** Whether a type is royal (`V.royalTypes`). */
	public static function royal(string $type): bool {
		return isset(self::ROYAL[$type]);
	}

	/** Whether a type is solid (`V.solidTypes`). */
	public static function solid(string $type): bool {
		return isset(self::SOLID[$type]);
	}

	/**
	 * The movement lines of a piece type for a side on a square (`linesOf`): `[kind, mode, squares]`, kind leap or
	 * ride, in descriptor and vector order.
	 *
	 * @return array<int, array{0: string, 1: string, 2: array<int, int>}>
	 */
	public static function linesOf(string $type, int $side, int $sq): array {
		$key = $type . ':' . $side . ':' . $sq;
		if (isset(self::$lines[$key])) {
			return self::$lines[$key];
		}
		$lines = [];
		foreach (Orthodox::MOVES[$type] ?? [] as [$kind, $mode, $oriented, $vecs]) {
			foreach ($vecs as [$dx, $dy]) {
				if ($oriented && $side !== 0) {
					$dy = -$dy;
				}
				if ($kind === 'leap') {
					$t = Topology::step($sq, $dx, $dy);
					if ($t >= 0) {
						$lines[] = ['leap', $mode, [$t]];
					}
				} else {
					$squares = [];
					$s = $sq;
					while (true) {
						$s = Topology::step($s, $dx, $dy);
						if ($s < 0) {
							break;
						}
						$squares[] = $s;
					}
					if ($squares !== []) {
						$lines[] = ['ride', $mode, $squares];
					}
				}
			}
		}
		return self::$lines[$key] = $lines;
	}

	/**
	 * The code of an ordinary move (`moveKey`).
	 */
	public static function moveKey(int $from, int $to, ?string $promo = null): string {
		return Topology::name($from) . '-' . Topology::name($to) . ($promo !== null ? '=' . $promo : '');
	}

	/**
	 * Add a move, expanded into its promotions when a pawn reaches the last rank (`pushMove`).
	 *
	 * @param array<int, Move> $out
	 */
	public static function pushMove(self $w, array &$out, int $id, int $from, int $to, int $capture,
		string $kind = 'normal'): void {
		$side = $w->sd[$id];
		if ($w->ty[$id] === 'p' && Topology::rank($to) === ($side === 0 ? Topology::RANKS - 1 : 0)) {
			foreach (Orthodox::PROMOTE_TO as $p) {
				$out[] = new Move(self::moveKey($from, $to, $p), $from, $to, $id, $capture, $p, $kind);
			}
			return;
		}
		$out[] = new Move(self::moveKey($from, $to), $from, $to, $id, $capture, null, $kind);
	}

	/**
	 * The descriptor moves of piece `id` (`pieceMoves`). With `ghost` (Kriegspiel's own view) a capture-only leap
	 * onto an empty square is a pawn try (kind `try`).
	 *
	 * @param array<int, Move> $out
	 */
	public static function pieceMoves(self $w, int $id, array &$out, bool $ghost = false): void {
		$from = $w->sq[$id];
		$side = $w->sd[$id];
		foreach (self::linesOf($w->ty[$id], $side, $from) as [$kind, $mode, $squares]) {
			if ($kind === 'leap') {
				$t = $squares[0];
				$occ = $w->board[$t];
				if ($occ === -1) {
					if ($mode !== 'capture') {
						self::pushMove($w, $out, $id, $from, $t, -1);
					} elseif ($ghost) {
						self::pushMove($w, $out, $id, $from, $t, -1, 'try');
					}
				} elseif ($mode !== 'move' && $side !== $w->sd[$occ]) {
					self::pushMove($w, $out, $id, $from, $t, $occ);
				}
				continue;
			}
			foreach ($squares as $t) {
				$occ = $w->board[$t];
				if ($occ === -1) {
					if ($mode !== 'capture') {
						self::pushMove($w, $out, $id, $from, $t, -1);
					}
					continue;
				}
				if ($mode !== 'move' && $side !== $w->sd[$occ]) {
					self::pushMove($w, $out, $id, $from, $t, $occ);
				}
				break;
			}
		}
	}

	/**
	 * The descriptor moves of piece `id` that end on square `to`, in `pieceMoves` order (`movesOnto` of quantum.js).
	 *
	 * @return array<int, Move>
	 */
	public static function movesOnto(self $b, int $id, int $to): array {
		$out = [];
		$from = $b->sq[$id];
		$side = $b->sd[$id];
		foreach (self::linesOf($b->ty[$id], $side, $from) as [$kind, $mode, $squares]) {
			if (!in_array($to, $squares, true)) {
				continue;
			}
			if ($kind === 'ride') {
				$blocked = false;
				foreach ($squares as $t) {
					if ($t === $to) {
						break;
					}
					if ($b->board[$t] !== -1) {
						$blocked = true;
						break;
					}
				}
				if ($blocked) {
					continue;
				}
			}
			$occ = $b->board[$to];
			if ($occ === -1) {
				if ($mode !== 'capture') {
					self::pushMove($b, $out, $id, $from, $to, -1);
				}
			} elseif ($mode !== 'move' && $side !== $b->sd[$occ]) {
				self::pushMove($b, $out, $id, $from, $to, $occ);
			}
		}
		return $out;
	}

	/**
	 * All ordinary moves of a side, by key, the first move of a key kept (`generate`). Remembered per world and side.
	 *
	 * @return array<string, Move>
	 */
	public static function generate(self $w, int $side): array {
		if (isset($w->gen[$side])) {
			return $w->gen[$side];
		}
		$list = [];
		foreach ($w->sq as $id => $s) {
			if ($s >= 0 && $w->sd[$id] === $side) {
				self::pieceMoves($w, $id, $list);
			}
		}
		Orthodox::pawnExtras($w, $side, $list);
		Orthodox::castlingMoves($w, $side, $list);
		$map = [];
		foreach ($list as $m) {
			if (!isset($map[$m->key])) {
				$map[$m->key] = $m;
			}
		}
		return $w->gen[$side] = $map;
	}

	/**
	 * Apply an ordinary move and return the new world (`applyClassical`, with the orthodox `afterMove`).
	 */
	public static function applyClassical(self $w, Move $m): self {
		$next = $w->copy();
		if ($m->capture >= 0) {
			$next->place($m->capture, self::OFF);
		}
		if ($m->rookId >= 0) {
			$next->place($m->id, self::OFF);
			$next->place($m->rookId, self::OFF);
			if ($next->board[$m->kingTo] !== -1) {
				throw new \LogicException('castling king target occupied');
			}
			if ($next->board[$m->rookTo] !== -1 || $m->rookTo === $m->kingTo) {
				throw new \LogicException('castling rook target occupied');
			}
			$next->place($m->id, $m->kingTo);
			$next->place($m->rookId, $m->rookTo);
		} else {
			$next->place($m->id, $m->to);
		}
		if ($m->promo !== null) {
			$next->ty[$m->id] = $m->promo;
		}
		Orthodox::afterMove($next, $m);
		return $next;
	}

	/**
	 * Whether a side has a royal piece on the board (`hasRoyalPiece` of quantum.js).
	 */
	public static function hasRoyal(self $b, int $side): bool {
		foreach ($b->sq as $id => $s) {
			if ($s >= 0 && $b->sd[$id] === $side && isset(self::ROYAL[$b->ty[$id]])) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The result of the game in one world, or null while it goes on there (`worldResult` of quantum.js: capture the
	 * king).
	 *
	 * @return array{winner: int|null, reason: string}|null
	 */
	public static function result(self $b): ?array {
		$alive = [];
		for ($s = 0; $s < 2; $s++) {
			if (self::hasRoyal($b, $s)) {
				$alive[] = $s;
			}
		}
		if (count($alive) === 2) {
			return null;
		}
		return ['winner' => $alive[0] ?? null, 'reason' => 'king'];
	}
}
