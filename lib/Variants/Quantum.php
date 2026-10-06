<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * The quantum layer for the orthodox 8 × 8 variants that the server rules: weighted worlds (integer weights summing
 * to T = 2^24, at most 64 worlds), the legal moves, the outcomes of a move (`branches`: links, rolls, splits, merges,
 * measurements, then the solid and game-end rolls), picking an outcome with `u`, the budget, certain moves, the
 * escape rule and the draws.
 *
 * JavaScript twin: src/variants/core/quantum.js, for a variant built by `orthodoxSpec()` with the defaults of
 * `defineVariant` (two sides, royal king, no compulsory capture, no hands, no `nextSide`, `isOut`, `generate`,
 * `stateResult`, `worldResult`, `budgetRule`, `allowQuantum`, `solidExtra` or `passWhenStuck`; `escapeRule` and
 * `drawsWait` on, `bareKingsDraw` as the variant says, `maxPly` 600, `quietPlies` 100). The hooks that differ per
 * variant (`setup`, `extraMoves`, `filterMoves`, `afterMove`, `unifyWorlds`, `recordInfo`) are those of its
 * `VariantRules`. Every iteration order follows the JavaScript one, since it decides which outcome a roll `u` picks.
 *
 * An entry (a world of an outcome) is `{ b, w, k, cap, idle, rq, m }`, a branch `{ weight, key, rolled, notes,
 * worlds, captures }`, as in JavaScript.
 *
 * @psalm-type Entry = array{b: World, w: int, k: string, cap: int, idle: bool, rq: bool, m: Move|null}
 * @psalm-type Branch = array{weight: int, key: string, rolled: bool, notes: array<int, string>,
 *   worlds: array<int, Entry>,
 *   captures: array<int, int>}
 * @psalm-type Parsed = array{type: string, code: string, from: array<int, int>, to: array<int, int>, key: string}
 *
 * @internal
 */
final class Quantum {
	/** The sum of all world weights. */
	public const T = 16777216;
	/** The most distinct arrangements of one side's pieces over the worlds. */
	public const BUDGET = 8;
	/** The most worlds of a state. */
	public const MAX_WORLDS = 64;
	/** The most squares one piece may be spread over. */
	public const MAX_LOCATIONS = 4;
	/** The state format version. */
	public const STATE_VERSION = 1;
	/** The move limit (`maxPly`). */
	public const MAX_PLY = 600;
	/** The quiet-move draw (`quietPlies`). */
	public const QUIET_PLIES = 100;

	/** Outcome keys in display order. */
	private const KEY_ORDER = ['miss' => 0, 'move' => 1, 'capture' => 2];

	/** The variant id. */
	public readonly string $id;
	/** Whether bare kings draw (`bareKingsDraw`). */
	public readonly bool $bareKingsDraw;

	/**
	 * @param VariantRules $rules the rules of the variant
	 */
	public function __construct(
		public readonly VariantRules $rules,
	) {
		$this->id = $rules->id();
		$this->bareKingsDraw = $rules->bareKingsDraw();
	}

	/**
	 * Start a new game (`newGame(V, options)`), with the option values the variant accepts.
	 *
	 * @param array<array-key, mixed> $given
	 * @throws \InvalidArgumentException for options the variant cannot start with
	 */
	public function newGame(array $given = []): State {
		$options = $this->rules->options($given);
		return new State(self::STATE_VERSION, $this->id, $options,
			[['b' => $this->rules->setup($options), 'w' => self::T]], 0, 0, 0, null, []);
	}

	/**
	 * The ordinary moves of the side to move per world and as a union (`table`), remembered per state.
	 *
	 * @return array{gens: array<int, array<string, Move>>, union: array<string, Move>,
	 *   captureKeys: array<string, true>}
	 */
	public static function table(State $state): array {
		if ($state->table !== null) {
			return $state->table;
		}
		$gens = [];
		foreach ($state->worlds as $e) {
			$gens[] = World::generate($e['b'], $state->turn);
		}
		$union = [];
		$certainKeys = [];
		$captureKeys = [];
		foreach ($gens as $g) {
			foreach ($g as $k => $m) {
				$k = (string)$k;
				if (!isset($union[$k])) {
					$union[$k] = $m;
				}
				if ($m->certain()) {
					$certainKeys[$k] = true;
				}
				if ($m->capture >= 0) {
					$captureKeys[$k] = true;
				}
			}
		}
		foreach ($certainKeys as $k => $_) {
			foreach ($gens as $g) {
				if (!isset($g[$k]) || !$g[$k]->certain()) {
					unset($union[$k], $captureKeys[$k]);
					break;
				}
			}
		}
		return $state->table = ['gens' => $gens, 'union' => $union, 'captureKeys' => $captureKeys];
	}

	/**
	 * Where a piece may be: `[{ sq, weight }]` by square, ascending (`pieceLocations`).
	 *
	 * @return array<int, array{sq: int, weight: int}>
	 */
	public static function pieceLocations(State $state, int $id): array {
		$acc = [];
		foreach ($state->worlds as $e) {
			$s = $e['b']->sq[$id] >= 0 ? $e['b']->sq[$id] : ($e['b']->sq[$id] === -2 ? -2 : World::OFF);
			$acc[$s] = ($acc[$s] ?? 0) + $e['w'];
		}
		ksort($acc);
		$out = [];
		foreach ($acc as $sq => $weight) {
			$out[] = ['sq' => $sq, 'weight' => $weight];
		}
		return $out;
	}

	/**
	 * The arrangement of one side's pieces in a world (`projection`).
	 */
	private static function projection(World $b, int $side): string {
		$parts = [];
		foreach ($b->sq as $id => $s) {
			if ($b->sd[$id] === $side && $s !== World::OFF) {
				$parts[] = $s . $b->ty[$id];
			}
		}
		sort($parts, SORT_STRING);
		return implode(',', $parts);
	}

	/**
	 * The number of distinct arrangements of a side's pieces over the worlds (`budgetOf`).
	 *
	 * @param array<int, array{b: World, ...}> $worlds
	 */
	public static function budgetOf(array $worlds, int $side): int {
		$set = [];
		foreach ($worlds as $e) {
			$set[self::projection($e['b'], $side)] = true;
		}
		return count($set);
	}

	/**
	 * Whether new worlds would break the budget of the side to move (`overBudget`).
	 *
	 * @param array<int, array{b: World, ...}> $worlds
	 */
	private static function overBudget(State $state, array $worlds): bool {
		return self::budgetOf($worlds, $state->turn) > self::BUDGET;
	}

	/**
	 * The solid pieces of a world as a key (`solidKey`).
	 */
	private static function solidKey(World $b): string {
		$parts = [];
		foreach ($b->board as $sq => $id) {
			if ($id >= 0 && World::solid($b->ty[$id])) {
				$parts[] = $sq . ':' . $b->sd[$id] . $b->ty[$id];
			}
		}
		return implode(',', $parts) . '|';
	}

	/**
	 * Parse a move code (`parseCode`): an ordinary move key, `f-t1|t2`, `f1|f2-t` or `?s`.
	 *
	 * @return Parsed|null
	 */
	public static function parseCode(string $code): ?array {
		if ($code === '') {
			return null;
		}
		if ($code[0] === '?') {
			$s = Topology::byName(substr($code, 1));
			return $s < 0 ? null : ['type' => 'measure', 'code' => $code, 'from' => [$s], 'to' => [], 'key' => ''];
		}
		$bar = strpos($code, '|');
		if ($bar !== false) {
			$dash = strpos($code, '-');
			if ($dash === false) {
				return null;
			}
			if ($bar < $dash) {
				$f1 = Topology::byName(substr($code, 0, $bar));
				$f2 = Topology::byName(substr($code, $bar + 1, $dash - $bar - 1));
				$t = Topology::byName(substr($code, $dash + 1));
				return $f1 < 0 || $f2 < 0 || $t < 0
					? null
					: ['type' => 'merge', 'code' => $code, 'from' => [$f1, $f2], 'to' => [$t], 'key' => ''];
			}
			$f = Topology::byName(substr($code, 0, $dash));
			$t1 = Topology::byName(substr($code, $dash + 1, $bar - $dash - 1));
			$t2 = Topology::byName(substr($code, $bar + 1));
			return $f < 0 || $t1 < 0 || $t2 < 0
				? null
				: ['type' => 'split', 'code' => $code, 'from' => [$f], 'to' => [$t1, $t2], 'key' => ''];
		}
		return ['type' => 'move', 'code' => $code, 'from' => [], 'to' => [], 'key' => $code];
	}

	/** The code of a split (`splitCode`). */
	public static function splitCode(int $f, int $t1, int $t2): string {
		[$a, $b] = $t1 < $t2 ? [$t1, $t2] : [$t2, $t1];
		return Topology::name($f) . '-' . Topology::name($a) . '|' . Topology::name($b);
	}

	/** The code of a merge (`mergeCode`). */
	public static function mergeCode(int $f1, int $f2, int $t): string {
		[$a, $b] = $f1 < $f2 ? [$f1, $f2] : [$f2, $f1];
		return Topology::name($a) . '|' . Topology::name($b) . '-' . Topology::name($t);
	}

	/**
	 * The unique piece of the side to move on a square over all worlds, or -1 (`ownPieceAt`).
	 */
	public static function ownPieceAt(State $state, int $sq): int {
		$found = -1;
		foreach ($state->worlds as $e) {
			$id = $e['b']->board[$sq];
			if ($id < 0) {
				continue;
			}
			if ($e['b']->sd[$id] !== $state->turn || ($found >= 0 && $found !== $id)) {
				return -1;
			}
			$found = $id;
		}
		return $found;
	}

	/** Whether a square is empty in every world (`certainlyEmpty`). */
	public static function certainlyEmpty(State $state, int $sq): bool {
		foreach ($state->worlds as $e) {
			if ($e['b']->board[$sq] !== -1) {
				return false;
			}
		}
		return true;
	}

	/** Whether piece `id` is in more than one place over the worlds (`superposed`). */
	public static function superposed(State $state, int $id): bool {
		$first = $state->worlds[0]['b']->sq[$id];
		foreach ($state->worlds as $e) {
			if ($e['b']->sq[$id] !== $first) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The ordinary moves of the side to move, one per key (`ordinaryMoves`): `[{ code, type, from, to, promo, drop,
	 * kind }]`.
	 *
	 * @return array<int, array{code: string, type: string, from: int, to: int, promo: string|null, drop: null,
	 *   kind: string}>
	 */
	public static function ordinaryMoves(State $state): array {
		if ($state->result !== null) {
			return [];
		}
		$out = [];
		foreach (self::table($state)['union'] as $key => $m) {
			$out[] = ['code' => (string)$key, 'type' => 'move', 'from' => $m->from, 'to' => $m->to,
				'promo' => $m->promo, 'drop' => null, 'kind' => $m->kind];
		}
		return $out;
	}

	/**
	 * The quiet targets of piece `id` from `f` in world `b` for side `side` (`quietTargets`), remembered per world.
	 *
	 * @return array<int, Move>
	 */
	private static function quietTargets(World $b, int $side, int $id, int $f): array {
		$k = $id . ':' . $f;
		if (isset($b->quiet[$side][$k])) {
			return $b->quiet[$side][$k];
		}
		$out = [];
		foreach (World::generate($b, $side) as $m) {
			if ($m->id === $id && $m->from === $f && $m->capture < 0 && $m->promo === null && !$m->certain()) {
				$out[$m->to] = $m;
			}
		}
		return $b->quiet[$side][$k] = $out;
	}

	/**
	 * The squares the piece on `f` could split to (`splitTargets`), ascending.
	 *
	 * @return array<int, int>
	 */
	public static function splitTargets(State $state, int $f): array {
		if ($state->result !== null) {
			return [];
		}
		$X = self::ownPieceAt($state, $f);
		if ($X < 0) {
			return [];
		}
		$targets = [];
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			if ($b->board[$f] !== $X || !Orthodox::splittable($b->ty[$X])) {
				continue;
			}
			foreach (self::quietTargets($b, $state->turn, $X, $f) as $t => $_) {
				$targets[$t] = true;
			}
		}
		$out = [];
		foreach ($targets as $t => $_) {
			if (self::certainlyEmpty($state, $t)) {
				$out[] = $t;
			}
		}
		sort($out);
		return $out;
	}

	/**
	 * The merges of the piece with a part on `f` (`mergesFrom`; without a compulsory capture, `mergeCandidates`).
	 *
	 * @return array<int, array{code: string, type: string, from: array<int, int>, to: array<int, int>}>
	 */
	public static function mergesFrom(State $state, int $f): array {
		if ($state->result !== null) {
			return [];
		}
		return self::mergeCandidates($state, $f);
	}

	/**
	 * The merges of the piece with a part on `f` (`mergeCandidates`).
	 *
	 * @return array<int, array{code: string, type: string, from: array<int, int>, to: array<int, int>}>
	 */
	private static function mergeCandidates(State $state, int $f): array {
		$X = self::ownPieceAt($state, $f);
		if ($X < 0 || !self::superposed($state, $X)) {
			return [];
		}
		$gens = self::table($state)['gens'];
		$locs = [];
		foreach (self::pieceLocations($state, $X) as $l) {
			if ($l['sq'] >= 0) {
				$locs[] = $l['sq'];
			}
		}
		$reach = [];
		foreach ($locs as $s) {
			$set = [];
			foreach ($state->worlds as $i => $e) {
				$b = $e['b'];
				if ($b->board[$s] === $X && Orthodox::splittable($b->ty[$X])) {
					foreach ($gens[$i] as $m) {
						if ($m->id === $X && $m->from === $s && $m->promo === null && !$m->certain()) {
							$set[$m->to] = true;
						}
					}
				}
			}
			$reach[$s] = $set;
		}
		$out = [];
		foreach ($locs as $other) {
			if ($other === $f || self::ownPieceAt($state, $other) !== $X
				|| count(self::facesOf($state, $X, [$f, $other])) > 1) {
				continue;
			}
			$parts = $f < $other ? [$f, $other] : [$other, $f];
			foreach ($reach[$f] as $t => $_) {
				if (!isset($reach[$other][$t]) || $t === $f || $t === $other) {
					continue;
				}
				if (self::friendlyMaybe($state, $t, $X) || count(self::facesOf($state, $X, [$f, $other, $t])) > 1) {
					continue;
				}
				$out[] = ['code' => self::mergeCode($f, $other, $t), 'type' => 'merge', 'from' => $parts,
					'to' => [$t]];
			}
		}
		return $out;
	}

	/**
	 * The types of piece X in the worlds where it stands on one of the squares (`facesOf`).
	 *
	 * @param array<int, int> $squares
	 * @return array<string, true>
	 */
	private static function facesOf(State $state, int $X, array $squares): array {
		$out = [];
		foreach ($state->worlds as $e) {
			if (in_array($e['b']->sq[$X], $squares, true)) {
				$out[$e['b']->ty[$X]] = true;
			}
		}
		return $out;
	}

	/** Whether a square might hold a piece of the side to move other than X (`friendlyMaybe`). */
	private static function friendlyMaybe(State $state, int $t, int $X): bool {
		foreach ($state->worlds as $e) {
			$id = $e['b']->board[$t];
			if ($id >= 0 && $id !== $X && $e['b']->sd[$id] === $state->turn) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The squares from which the side to move can handle its piece `id` (`homeSquares`).
	 *
	 * @return array<int, int>
	 */
	private static function homeSquares(State $state, int $id): array {
		$out = [];
		foreach (self::pieceLocations($state, $id) as $l) {
			if ($l['sq'] >= 0 && self::ownPieceAt($state, $l['sq']) === $id) {
				$out[] = $l['sq'];
			}
		}
		return $out;
	}

	/**
	 * The pieces of the side to move on the board in some world, in the order of first appearance (`ownPieces`).
	 *
	 * @return array<int, int>
	 */
	private static function ownPieces(State $state): array {
		$seen = [];
		foreach ($state->worlds as $e) {
			foreach ($e['b']->sq as $id => $s) {
				if ($s >= 0 && $e['b']->sd[$id] === $state->turn) {
					$seen[$id] = true;
				}
			}
		}
		return array_keys($seen);
	}

	/**
	 * Every legal move of the side to move (`legalMoves`); splits only with `splits`.
	 *
	 * @return array<int, array{code: string, type: string, ...}>
	 */
	public function legalMoves(State $state, bool $splits = false): array {
		if ($state->result !== null) {
			return [];
		}
		$out = self::ordinaryMoves($state);
		foreach (self::ownPieces($state) as $id) {
			$quantum = self::superposed($state, $id);
			if (!$quantum && !$splits) {
				continue;
			}
			$home = self::homeSquares($state, $id);
			if ($home === []) {
				continue;
			}
			if ($quantum) {
				$out[] = ['code' => '?' . Topology::name($home[0]), 'type' => 'measure', 'from' => [$home[0]],
					'to' => []];
				$merges = [];
				foreach ($home as $f) {
					foreach (self::mergesFrom($state, $f) as $m) {
						$merges[$m['code']] = $m;
					}
				}
				foreach ($merges as $m) {
					$out[] = $m;
				}
			}
			if ($splits) {
				foreach ($home as $f) {
					foreach ($this->splitsFrom($state, $f) as $m) {
						$out[] = $m;
					}
				}
			}
		}
		return $out;
	}

	/** Whether the budget of the side to move is full (`budgetFull`). */
	private static function budgetFull(State $state): bool {
		return self::budgetOf($state->worlds, $state->turn) >= self::BUDGET;
	}

	/**
	 * The legal splits of the piece on `f` (`splitsFrom`).
	 *
	 * @return array<int, array{code: string, type: string, from: array<int, int>, to: array<int, int>}>
	 */
	public function splitsFrom(State $state, int $f): array {
		if ($state->result !== null || self::budgetFull($state)) {
			return [];
		}
		$targets = self::splitTargets($state, $f);
		$out = [];
		$n = count($targets);
		for ($i = 0; $i < $n; $i++) {
			for ($j = $i + 1; $j < $n; $j++) {
				$code = self::splitCode($f, $targets[$i], $targets[$j]);
				if ($this->branches($state, $code) !== null) {
					$out[] = ['code' => $code, 'type' => 'split', 'from' => [$f], 'to' => [$targets[$i], $targets[$j]]];
				}
			}
		}
		return $out;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Outcomes
	// ------------------------------------------------------------------------------------------------------------

	/**
	 * Group items by a key, keeping the first-seen order of the keys (`groupBy`).
	 *
	 * @template E
	 * @param array<int, E> $items
	 * @param callable(E): string $keyOf
	 * @return array<int, array{0: string, 1: array<int, E>}>
	 */
	private static function groupBy(array $items, callable $keyOf): array {
		$index = [];
		$keys = [];
		$lists = [];
		foreach ($items as $e) {
			$k = $keyOf($e);
			$slot = $index['#' . $k] ?? null;
			if ($slot === null) {
				$index['#' . $k] = count($keys);
				$keys[] = $k;
				$lists[] = [$e];
			} else {
				$lists[$slot][] = $e;
			}
		}
		$out = [];
		foreach ($keys as $i => $k) {
			$out[] = [$k, $lists[$i]];
		}
		return $out;
	}

	/**
	 * The weight of a list of worlds (`weightOf`).
	 *
	 * @param array<int, array{w: int, ...}> $list
	 */
	private static function weightOf(array $list): int {
		$s = 0;
		foreach ($list as $e) {
			$s += $e['w'];
		}
		return $s;
	}

	/**
	 * Whether applying a move in a world resets the quiet counter: a pawn move (`resetsQuiet`).
	 */
	private static function resetsQuiet(World $b, Move $m): bool {
		return $m->from >= 0 && $b->board[$m->from] >= 0 && $b->ty[$b->board[$m->from]] === 'p';
	}

	/**
	 * An entry of an outcome.
	 *
	 * @return Entry
	 */
	private static function entry(World $b, int $w, string $k, int $cap, bool $idle, bool $rq = false,
		?Move $m = null): array {
		return ['b' => $b, 'w' => $w, 'k' => $k, 'cap' => $cap, 'idle' => $idle, 'rq' => $rq, 'm' => $m];
	}

	/**
	 * The per-world result of an ordinary move (`perWorldMove`).
	 *
	 * @param callable(World, Move): World $apply
	 * @return array{worlds: array<int, Entry>, sample: Move}|null
	 */
	private static function perWorldMove(State $state, string $key, callable $apply): ?array {
		$tb = self::table($state);
		$sample = $tb['union'][$key] ?? null;
		if ($sample === null) {
			return null;
		}
		$worlds = [];
		foreach ($state->worlds as $i => $e) {
			$m = $tb['gens'][$i][$key] ?? null;
			if ($m === null) {
				$worlds[] = self::entry($e['b'], $e['w'], 'miss', -1, true);
				continue;
			}
			$worlds[] = self::entry($apply($e['b'], $m), $e['w'], $m->capture >= 0 ? 'capture' : 'move',
				$m->capture >= 0 ? $m->to : -1, false, self::resetsQuiet($e['b'], $m));
		}
		return ['worlds' => $worlds, 'sample' => $sample];
	}

	/**
	 * The idle worlds through `applyMiss` (`idleApply`; the orthodox hook clears the en passant square, whatever the
	 * action and `hit`).
	 *
	 * @param array<int, Entry> $entries
	 * @return array<int, Entry>
	 */
	private static function idleApply(array $entries): array {
		$out = [];
		foreach ($entries as $e) {
			if ($e['idle']) {
				$b = Orthodox::clearEnPassant($e['b']);
				if ($b !== $e['b']) {
					$e['b'] = $b;
				}
			}
			$out[] = $e;
		}
		return $out;
	}

	/**
	 * The piece that makes an ordinary move and its type after it, when the same in every world (`moverOf`).
	 *
	 * @return array{id: int, type: string|null}
	 */
	private static function moverOf(State $state, string $key): array {
		$gens = self::table($state)['gens'];
		$id = -2;
		$type = null;
		foreach ($state->worlds as $i => $e) {
			$m = $gens[$i][$key] ?? null;
			if ($m === null || $id === -1) {
				continue;
			}
			$ty = $m->promo ?? $e['b']->ty[$m->id];
			if ($id === -2) {
				$id = $m->id;
				$type = $ty;
			} elseif ($id !== $m->id || $type !== $ty) {
				$id = -1;
			}
		}
		return $id >= 0 ? ['id' => $id, 'type' => $type] : ['id' => -1, 'type' => null];
	}

	/**
	 * Whether an ordinary move is measured (`isMeasured`).
	 */
	private static function isMeasured(State $state, Move $sample): bool {
		$self = null;
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			$mover = $sample->from >= 0 ? $b->board[$sample->from] : -1;
			if ($mover >= 0 && World::solid($b->ty[$mover])) {
				return true;
			}
			$occ = $b->board[$sample->to];
			if ($occ >= 0 && $occ !== $mover) {
				$self ??= self::moverOf($state, $sample->key);
				if ($occ !== $self['id'] || $b->ty[$occ] !== $self['type']) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * All possible outcomes of a move, or null when it is illegal (`branches`).
	 *
	 * @return array<int, Branch>|null
	 */
	public function branches(State $state, string $code): ?array {
		return $this->branchesWith($state, $code, World::applyClassical(...));
	}

	/**
	 * The outcomes of a move with the worlds built by `apply` (`branchesWith`).
	 *
	 * @param callable(World, Move): World $apply
	 * @return array<int, Branch>|null
	 */
	private function branchesWith(State $state, string $code, callable $apply): ?array {
		if ($state->result !== null) {
			return null;
		}
		$mv = self::parseCode($code);
		if ($mv === null) {
			return null;
		}
		$groups = match ($mv['type']) {
			'move' => $this->moveBranches($state, $mv['key'], $apply),
			'split' => self::splitBranches($state, $mv, $apply),
			'merge' => $this->mergeBranches($state, $mv, $apply),
			default => self::measureBranches($state, $mv),
		};
		if ($groups === null) {
			return null;
		}
		$out = [];
		foreach ($groups as $g) {
			foreach ($this->settle($state, $g) as $s) {
				$out[] = $s;
			}
		}
		return $out;
	}

	/**
	 * Per-world results as branches: one when not rolled, one per key when rolled (`toBranches`).
	 *
	 * @param array<int, Entry> $worlds
	 * @return array<int, Branch>
	 */
	private static function toBranches(array $worlds, bool $rolled): array {
		if (!$rolled) {
			return [['weight' => self::T, 'key' => self::resultKey($worlds), 'rolled' => false, 'notes' => [],
				'worlds' => $worlds, 'captures' => self::capturesOf($worlds)]];
		}
		$g = self::groupBy($worlds, static fn (array $e): string => $e['k']);
		usort($g, static fn (array $a, array $b): int => self::KEY_ORDER[$a[0]] <=> self::KEY_ORDER[$b[0]]);
		$out = [];
		foreach ($g as [$key, $list]) {
			$out[] = ['weight' => self::weightOf($list), 'key' => $key, 'rolled' => true, 'notes' => [],
				'worlds' => $list, 'captures' => self::capturesOf($list)];
		}
		return $out;
	}

	/**
	 * The outcome key of per-world results (`resultKey`).
	 *
	 * @param array<int, Entry> $list
	 */
	private static function resultKey(array $list): string {
		$move = false;
		foreach ($list as $e) {
			if ($e['k'] === 'capture') {
				return 'capture';
			}
			$move = $move || $e['k'] === 'move';
		}
		return $move ? 'move' : 'miss';
	}

	/**
	 * The capture squares of per-world results, first seen first (`capturesOf`).
	 *
	 * @param array<int, Entry> $list
	 * @return array<int, int>
	 */
	private static function capturesOf(array $list): array {
		$out = [];
		foreach ($list as $e) {
			if ($e['cap'] >= 0) {
				$out[$e['cap']] = true;
			}
		}
		return array_keys($out);
	}

	/**
	 * Link (pass = link) or roll (`linkOrRoll`).
	 *
	 * @param array<int, Entry> $worlds
	 * @param callable(): bool $measured
	 * @return array<int, Branch>
	 */
	private static function linkOrRoll(State $state, array $worlds, callable $measured): array {
		$first = $worlds[0]['k'];
		$same = true;
		foreach ($worlds as $e) {
			if ($e['k'] !== $first) {
				$same = false;
				break;
			}
		}
		if ($same) {
			return self::toBranches($worlds, false);
		}
		$idle = self::idleApply($worlds);
		if (!$measured() && !self::overBudget($state, $idle)) {
			return self::toBranches($idle, false);
		}
		return self::toBranches($idle, true);
	}

	/**
	 * Outcomes of an ordinary move (`moveBranches`).
	 *
	 * @param callable(World, Move): World $apply
	 * @return array<int, Branch>|null
	 */
	private function moveBranches(State $state, string $key, callable $apply): ?array {
		$r = self::perWorldMove($state, $key, $apply);
		if ($r === null) {
			return null;
		}
		$sample = $r['sample'];
		return self::linkOrRoll($state, $r['worlds'], static fn (): bool => self::isMeasured($state, $sample));
	}

	/**
	 * The per-world results of a split before `applyMiss` (`splitEntries`).
	 *
	 * @param Parsed $mv
	 * @param callable(World, Move): World $apply
	 * @return array{X: int, t1: int, t2: int, entries: array<int, Entry>, branching: bool}|null
	 */
	private static function splitEntries(State $state, array $mv, callable $apply): ?array {
		$f = $mv['from'][0];
		$t1 = $mv['to'][0];
		$t2 = $mv['to'][1] ?? -1;
		if ($t1 === $t2 || $t1 === $f || $t2 === $f) {
			return null;
		}
		if ($t2 < $t1) {
			[$t1, $t2] = [$t2, $t1];
		}
		$X = self::ownPieceAt($state, $f);
		if ($X < 0 || !self::certainlyEmpty($state, $t1) || !self::certainlyEmpty($state, $t2)) {
			return null;
		}
		$home = null;
		foreach ($state->worlds as $e) {
			if ($e['b']->board[$f] === $X) {
				$home = $e['b'];
				break;
			}
		}
		if ($home === null || !Orthodox::splittable($home->ty[$X])) {
			return null;
		}
		$entries = [];
		$branching = false;
		$child = static function (World $b, int $w, ?Move $m) use (&$entries, $apply): void {
			$entries[] = $m !== null
				? self::entry($apply($b, $m), $w, 'move', -1, false, self::resetsQuiet($b, $m))
				: self::entry($b, $w, 'move', -1, true);
		};
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			$w = $e['w'];
			if ($b->board[$f] !== $X) {
				$child($b, $w, null);
				continue;
			}
			$q = self::quietTargets($b, $state->turn, $X, $f);
			$m1 = $q[$t1] ?? null;
			$m2 = $q[$t2] ?? null;
			if ($m1 !== null && $m2 !== null) {
				$branching = true;
			}
			$w1 = intdiv($w + 1, 2);
			$w2 = $w - $w1;
			$child($b, $w1, $m1);
			if ($w2 > 0) {
				$child($b, $w2, $m2);
			}
		}
		return ['X' => $X, 't1' => $t1, 't2' => $t2, 'entries' => $entries, 'branching' => $branching];
	}

	/**
	 * Outcomes of a split (`splitBranches`).
	 *
	 * @param Parsed $mv
	 * @param callable(World, Move): World $apply
	 * @return array<int, Branch>|null
	 */
	private static function splitBranches(State $state, array $mv, callable $apply): ?array {
		$r = self::splitEntries($state, $mv, $apply);
		if ($r === null || !$r['branching']) {
			return null;
		}
		$X = $r['X'];
		$worlds = self::idleApply($r['entries']);
		$merged = self::dedupe($worlds);
		if (count($merged) > self::MAX_WORLDS || self::overBudget($state, $merged)) {
			return null;
		}
		$locs = [];
		foreach ($merged as $e) {
			$locs[$e['b']->sq[$X]] = true;
		}
		if (count($locs) > self::MAX_LOCATIONS) {
			return null;
		}
		return [['weight' => self::T, 'key' => 'split', 'rolled' => false, 'notes' => [], 'worlds' => $worlds,
			'captures' => []]];
	}

	/**
	 * The per-world result of a merge (`perWorldMerge`).
	 *
	 * @param Parsed $mv
	 * @param callable(World, Move): World $apply
	 * @return array{X: int, worlds: array<int, Entry>}|null
	 */
	private static function perWorldMerge(State $state, array $mv, callable $apply): ?array {
		$f1 = $mv['from'][0];
		$f2 = $mv['from'][1] ?? -1;
		$t = $mv['to'][0];
		$X = self::ownPieceAt($state, $f1);
		if ($X < 0 || self::ownPieceAt($state, $f2) !== $X || $f1 === $f2 || $t === $f1 || $t === $f2
			|| self::friendlyMaybe($state, $t, $X)) {
			return null;
		}
		$home = null;
		foreach ($state->worlds as $e) {
			if ($e['b']->board[$f1] === $X) {
				$home = $e['b'];
				break;
			}
		}
		if ($home === null || !Orthodox::splittable($home->ty[$X])
			|| count(self::facesOf($state, $X, [$f1, $f2, $t])) > 1) {
			return null;
		}
		$gens = self::table($state)['gens'];
		$find = static function (int $i, int $from) use ($gens, $X, $t): ?Move {
			foreach ($gens[$i] as $m) {
				if ($m->id === $X && $m->from === $from && $m->to === $t && $m->promo === null && !$m->certain()) {
					return $m;
				}
			}
			return null;
		};
		$arrive1 = false;
		$arrive2 = false;
		$worlds = [];
		foreach ($state->worlds as $i => $e) {
			$b = $e['b'];
			$m = ($b->board[$f1] === $X ? $find($i, $f1) : null) ?? ($b->board[$f2] === $X ? $find($i, $f2) : null);
			if ($m !== null && $m->from === $f1) {
				$arrive1 = true;
			}
			if ($m !== null && $m->from === $f2) {
				$arrive2 = true;
			}
			if ($m === null) {
				$worlds[] = self::entry($b, $e['w'], 'miss', -1, true);
				continue;
			}
			$worlds[] = self::entry($apply($b, $m), $e['w'], $m->capture >= 0 ? 'capture' : 'move',
				$m->capture >= 0 ? $t : -1, false, self::resetsQuiet($b, $m), $m);
		}
		if (!$arrive1 || !$arrive2) {
			return null;
		}
		return ['X' => $X, 'worlds' => $worlds];
	}

	/**
	 * Outcomes of a merge (`mergeBranches`).
	 *
	 * @param Parsed $mv
	 * @param callable(World, Move): World $apply
	 * @return array<int, Branch>|null
	 */
	private function mergeBranches(State $state, array $mv, callable $apply): ?array {
		$r = self::perWorldMerge($state, $mv, $apply);
		if ($r === null) {
			return null;
		}
		$t = $mv['to'][0];
		$enemyMaybe = static function () use ($state, $t): bool {
			foreach ($state->worlds as $e) {
				$id = $e['b']->board[$t];
				if ($id >= 0 && $e['b']->sd[$id] !== $state->turn) {
					return true;
				}
			}
			return false;
		};
		return self::linkOrRoll($state, $r['worlds'], $enemyMaybe);
	}

	/**
	 * Outcomes of a measurement (`measureBranches`).
	 *
	 * @param Parsed $mv
	 * @return array<int, Branch>|null
	 */
	private static function measureBranches(State $state, array $mv): ?array {
		$X = self::ownPieceAt($state, $mv['from'][0]);
		if ($X < 0 || !self::superposed($state, $X)) {
			return null;
		}
		$g = self::groupBy($state->worlds, static fn (array $e): string => (string)$e['b']->sq[$X]);
		usort($g, static fn (array $a, array $b): int => (int)$a[0] <=> (int)$b[0]);
		$out = [];
		foreach ($g as [$sq, $list]) {
			$idle = [];
			foreach ($list as $e) {
				$idle[] = self::entry($e['b'], $e['w'], 'move', -1, true);
			}
			$out[] = ['weight' => self::weightOf($list), 'key' => (int)$sq >= 0 ? Topology::name((int)$sq) : 'gone',
				'rolled' => true, 'notes' => [], 'worlds' => self::idleApply($idle), 'captures' => []];
		}
		return $out;
	}

	/**
	 * Merge identical worlds, summing their weights, in first-seen order (`dedupe`).
	 *
	 * @param array<int, array{b: World, w: int, ...}> $worlds
	 * @return array<int, array{b: World, w: int}>
	 */
	private static function dedupe(array $worlds): array {
		return self::mergeWorlds(array_column($worlds, 'b'), array_column($worlds, 'w'));
	}

	/**
	 * Identical worlds merged, their weights added, in the order in which they first appear (`dedupe`, and the merges
	 * of `ownView` and `fogWorlds`).
	 *
	 * @param array<int, World> $bs the worlds
	 * @param array<int, int> $ws their weights
	 * @return list<array{b: World, w: int}>
	 */
	public static function mergeWorlds(array $bs, array $ws): array {
		$index = [];
		$keep = [];
		$sum = [];
		foreach ($bs as $i => $b) {
			$k = World::key($b);
			if (isset($index[$k])) {
				$sum[$index[$k]] += $ws[$i];
			} else {
				$index[$k] = count($keep);
				$keep[] = $b;
				$sum[] = $ws[$i];
			}
		}
		$out = [];
		foreach ($keep as $i => $b) {
			$out[] = ['b' => $b, 'w' => $sum[$i]];
		}
		return $out;
	}

	/**
	 * The solid roll and the game-end roll on a branch (`settle`).
	 *
	 * @param Branch $branch
	 * @return array<int, Branch>
	 */
	private function settle(State $state, array $branch): array {
		// the branches with their weights as JavaScript numbers (doubles): a part of a branch gets its share
		$list = [[$branch, (float)$branch['weight']]];
		$split = static function (callable $keyOf, callable $noteOf) use (&$list, $branch): void {
			$out = [];
			foreach ($list as [$br, $weight]) {
				$g = self::groupBy($br['worlds'], $keyOf);
				if (count($g) === 1) {
					$out[] = [$br, $weight];
					continue;
				}
				$ratio = $weight / (float)self::weightOf($br['worlds']);
				foreach ($g as [$k, $ws]) {
					$part = $br;
					if (isset(self::KEY_ORDER[$branch['key']])) {
						$part['key'] = self::resultKey($ws);
						$part['captures'] = self::capturesOf($ws);
					} elseif ($branch['key'] === 'split') {
						$allIdle = true;
						foreach ($ws as $e) {
							$allIdle = $allIdle && $e['idle'];
						}
						$part['key'] = $allIdle ? 'miss' : 'split';
					}
					$part['notes'] = [...$br['notes'], $noteOf($k)];
					$part['worlds'] = $ws;
					$part['rolled'] = true;
					$out[] = [$part, (float)self::weightOf($ws) * $ratio];
				}
			}
			$list = $out;
		};
		$split(static fn (array $e): string => self::solidKey($e['b']), static fn (string $k): string => 'solid:');
		$split(static fn (array $e): string => World::json(World::result($e['b'])),
			static fn (string $k): string => 'end:' . $k);
		return self::integerWeights($list, $branch['weight']);
	}

	/**
	 * Make the weights of sub-branches integers that sum to `total`, by largest remainder (`integerWeights`).
	 *
	 * @param array<int, array{0: Branch, 1: float}> $list the branches with their (fractional) weights
	 * @return array<int, Branch>
	 */
	private static function integerWeights(array $list, int $total): array {
		$n = count($list);
		if ($n === 1) {
			$b = $list[0][0];
			$b['weight'] = $total;
			return [$b];
		}
		$floors = [];
		$rems = [];
		foreach ($list as $i => [, $w]) {
			$floors[$i] = (int)floor($w);
			$rems[$i] = $w - floor($w);
		}
		$rest = $total - array_sum($floors);
		$order = range(0, $n - 1);
		usort($order, static fn (int $a, int $b): int => ($rems[$b] <=> $rems[$a]) ?: ($a <=> $b));
		for ($k = 0; $rest > 0; $k = ($k + 1) % $n, $rest--) {
			$floors[$order[$k]]++;
		}
		$out = [];
		foreach ($list as $i => [$b]) {
			$b['weight'] = $floors[$i];
			$out[] = $b;
		}
		return $out;
	}

	/**
	 * The outcomes of a move as the referee's preview shows them: `[{ key, notes, p, captures, rolled }]`, or null
	 * when illegal (`outcomes` without the result, as `preview` of src/variants/referee.js keeps them).
	 *
	 * @return list<array{key: string, notes: array<int, string>, p: int|float, captures: array<int, int>,
	 *   rolled: bool}>|null
	 */
	public function preview(State $state, string $code): ?array {
		$list = $this->branches($state, $code);
		if ($list === null) {
			return null;
		}
		$out = [];
		foreach ($list as $b) {
			$out[] = ['key' => $b['key'], 'notes' => $b['notes'], 'p' => $b['weight'] / self::T,
				'captures' => $b['captures'], 'rolled' => $b['rolled']];
		}
		return $out;
	}

	/**
	 * Whether a move is legal (`isLegal`).
	 */
	public function isLegal(State $state, string $code): bool {
		return $this->branches($state, $code) !== null;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Applying a move
	// ------------------------------------------------------------------------------------------------------------

	/**
	 * Rescale integer weights to sum to T by largest remainder, ties to the lower index (`rescaleWeights` of
	 * src/engine/rescale.js).
	 *
	 * @param array<int, int> $weights
	 * @return array<int, int>
	 */
	public static function rescale(array $weights): array {
		$S = array_sum($weights);
		if ($S === self::T) {
			return $weights;
		}
		if (!($S > 0 && $S < self::T)) {
			throw new \RangeException('rescale needs 0 < S < T');
		}
		$q = [];
		$r = [];
		$sumQ = 0;
		foreach ($weights as $i => $w) {
			$N = $w * self::T;
			$q[$i] = intdiv($N, $S);
			$r[$i] = $N % $S;
			$sumQ += $q[$i];
		}
		$D = self::T - $sumQ;
		if ($D > 0) {
			$order = array_keys($weights);
			usort($order, static fn (int $x, int $y): int => ($r[$y] <=> $r[$x]) ?: ($x <=> $y));
			$m = count($order);
			for ($k = 0; $k < $m && $D > 0; $k++, $D--) {
				$q[$order[$k]]++;
			}
		}
		return $q;
	}

	/**
	 * The worlds of a new state: identical worlds merged in first-seen order, rescaled, sorted by world key
	 * (`normalWorlds`).
	 *
	 * @param array<int, array{b: World, w: int, ...}> $entries
	 * @return array<int, array{b: World, w: int}>
	 */
	private static function normalWorlds(array $entries): array {
		$merged = self::dedupe($entries);
		$weights = self::rescale(array_column($merged, 'w'));
		$keyed = [];
		foreach ($merged as $i => $e) {
			$keyed[] = [World::key($e['b']), $e['b'], $weights[$i]];
		}
		usort($keyed, static fn (array $a, array $b): int => strcmp($a[0], $b[0]));
		$out = [];
		foreach ($keyed as [, $b, $w]) {
			$out[] = ['b' => $b, 'w' => $w];
		}
		return $out;
	}

	/**
	 * The squares of a move for the history record (`recordSquares`).
	 *
	 * @param Parsed $mv
	 * @return array{from: array<int, int>, to: array<int, int>}
	 */
	private static function recordSquares(State $state, array $mv): array {
		if ($mv['type'] !== 'move') {
			return ['from' => $mv['from'], 'to' => $mv['to']];
		}
		$sample = self::table($state)['union'][$mv['key']] ?? null;
		return [
			'from' => $sample !== null && $sample->from >= 0 ? [$sample->from] : [],
			'to' => $sample !== null && $sample->to >= 0 ? [$sample->to] : [],
		];
	}

	/**
	 * Build the state after a chosen branch (`buildState`; no sit-out, no `stateResult`, no preview).
	 *
	 * @param Branch $branch
	 * @param array<int, Branch> $all
	 */
	private function buildState(State $state, string $code, array $branch, array $all, bool $light,
		bool $unify): State {
		$entries = $branch['worlds'];
		if ($unify) {
			$bs = $this->rules->unifyWorlds(array_column($entries, 'b'));
			foreach ($entries as $i => $e) {
				if ($bs[$i] !== $e['b']) {
					$entries[$i]['b'] = $bs[$i];
				}
			}
		}
		$worlds = self::normalWorlds($entries);
		$b0 = $worlds[0]['b'];
		$resetQuiet = $branch['captures'] !== [];
		if (!$resetQuiet) {
			foreach ($branch['worlds'] as $e) {
				if ($e['rq']) {
					$resetQuiet = true;
					break;
				}
			}
		}
		$record = null;
		if (!$light) {
			$mv = self::parseCode($code);
			assert($mv !== null);
			$record = [
				'code' => $code,
				'side' => $state->turn,
				'key' => $branch['key'],
				'notes' => $branch['notes'],
				'rolled' => $branch['rolled'],
				'p' => $branch['weight'] / self::T,
				'options' => count($all),
				'captures' => $branch['captures'],
				...self::recordSquares($state, $mv),
			];
		}
		$next = new State(self::STATE_VERSION, $state->variant, $state->options, $worlds, 1 - $state->turn,
			$state->ply + 1, $resetQuiet ? 0 : $state->quiet + 1, World::result($b0), $state->history);
		if ($next->result === null && !$light && $this->cannotEscape($next)) {
			$next->result = ['winner' => $state->turn, 'reason' => 'cannotEscape'];
		}
		if ($next->result === null) {
			$draw = $this->bareKingsDraw && self::onlyRoyals($next)
				? 'bareKings'
				: ($next->quiet >= self::QUIET_PLIES ? 'quiet' : null);
			if ($draw !== null && !self::certainCapture($next)) {
				$next->result = ['winner' => null, 'reason' => $draw];
			}
		}
		if ($next->result === null && $next->ply >= self::MAX_PLY) {
			$next->result = ['winner' => null, 'reason' => 'moveLimit'];
		}
		if ($next->result === null && !$light && !$this->hasLegalMove($next)) {
			$next->result = ['winner' => null, 'reason' => 'noMoves'];
		}
		if ($record !== null) {
			$info = $this->rules->recordInfo($state, $code, $branch, $next);
			if ($info !== null) {
				$record['info'] = $info;
			}
			$next->history = [...$state->history, $record];
		}
		return $next;
	}

	/**
	 * Whether the side to move has any legal move (`hasLegalMove`).
	 */
	public function hasLegalMove(State $state): bool {
		if (self::table($state)['union'] !== []) {
			return true;
		}
		return $this->legalMoves($state) !== [];
	}

	/**
	 * Pick a branch with the roll `u` in [0, T) (`pickBranch` with `r = u / T`).
	 *
	 * @param array<int, Branch> $list
	 * @return Branch
	 */
	public static function pickBranch(array $list, int $u): array {
		$acc = 0;
		$last = null;
		foreach ($list as $b) {
			$acc += $b['weight'];
			if ($u < $acc) {
				return $b;
			}
			$last = $b;
		}
		if ($last === null) {
			throw new \LogicException('a move has at least one outcome');
		}
		return $last;
	}

	/**
	 * Play a move with the roll `u` (`applyMove(V, state, code, u / T).state`), or null when it is illegal.
	 */
	public function applyMove(State $state, string $code, int $u): ?State {
		$list = $this->branches($state, $code);
		if ($list === null) {
			return null;
		}
		$branch = self::pickBranch($list, count($list) === 1 ? 0 : $u);
		return $this->buildState($state, $code, $branch, $list, false, true);
	}

	// ------------------------------------------------------------------------------------------------------------
	// Danger, certain captures and the escape rule
	// ------------------------------------------------------------------------------------------------------------

	/**
	 * Whether a capture in world `b` takes a royal piece of `side` (`royalLoss`). On the orthodox board only a capture
	 * of the king itself does: a capture removes one piece, the captured one.
	 */
	private static function royalLoss(World $b, Move $m, int $side): bool {
		return $b->sd[$m->capture] === $side && World::royal($b->ty[$m->capture]);
	}

	/**
	 * The chance that one enemy move could capture a royal piece of `side` (`royalDanger`).
	 */
	public static function royalDanger(State $state, int $side): int|float {
		if ($state->result !== null) {
			return 0;
		}
		$best = 0;
		$e = 1 - $side;
		$acc = [];
		foreach ($state->worlds as $entry) {
			$b = $entry['b'];
			foreach (World::generate($b, $e) as $m) {
				if ($m->capture >= 0 && self::royalLoss($b, $m, $side)) {
					$acc[$m->key] = ($acc[$m->key] ?? 0) + $entry['w'];
				}
			}
		}
		foreach ($acc as $w) {
			$best = max($best, $w / self::T);
		}
		return max($best, self::mergeDanger($state, $e, $side));
	}

	/**
	 * Whether enemy `e` could capture a royal piece of `side` for certain with one legal move (`certainFrom`).
	 */
	private static function certainFrom(State $state, int $e, int $side): bool {
		$b0 = $state->worlds[0]['b'];
		$keys = [];
		$merge = false;
		foreach (World::generate($b0, $e) as $m) {
			if ($m->capture >= 0 && self::royalLoss($b0, $m, $side)) {
				$keys[$m->key] = $m->certain();
				$merge = $merge || self::superposed($state, $m->id);
			}
		}
		$n = count($state->worlds);
		for ($i = 1; $i < $n && $keys !== []; $i++) {
			$b = $state->worlds[$i]['b'];
			$gen = World::generate($b, $e);
			foreach ($keys as $k => $certain) {
				$m = $gen[$k] ?? null;
				if ($m === null || $m->capture < 0 || $m->certain() !== $certain || !self::royalLoss($b, $m, $side)) {
					unset($keys[$k]);
				}
			}
		}
		return $keys !== [] || ($merge && (float)self::mergeDanger($state, $e, $side) === 1.0);
	}

	/**
	 * Whether the side to move can capture a royal piece of `side` for certain (`certainlyTaken`).
	 */
	private static function certainlyTaken(State $state, int $side): bool {
		if ($state->result !== null || $state->turn === $side) {
			return false;
		}
		return self::certainFrom($state, $state->turn, $side);
	}

	/**
	 * Whether the side to move can capture an enemy royal piece for certain (`certainCapture`).
	 */
	public static function certainCapture(State $state): bool {
		return self::certainFrom($state, $state->turn, 1 - $state->turn);
	}

	/**
	 * Whether some legal move of the side to move might capture an enemy royal piece (`mightTakeRoyal`).
	 */
	private static function mightTakeRoyal(State $state): bool {
		$tb = self::table($state);
		$s = 1 - $state->turn;
		foreach ($state->worlds as $i => $e) {
			foreach ($tb['gens'][$i] as $m) {
				if ($m->capture >= 0 && isset($tb['union'][$m->key]) && self::royalLoss($e['b'], $m, $s)) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Whether only royal pieces are left on the board in every world (`onlyRoyals`).
	 */
	private static function onlyRoyals(State $state): bool {
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			foreach ($b->sq as $id => $s) {
				if ($s === -2 || ($s >= 0 && !World::royal($b->ty[$id]))) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * The largest danger to a royal piece of `side` from one merge of enemy `e` (`mergeDanger`).
	 */
	private static function mergeDanger(State $state, int $e, int $side): int|float {
		$se = $state->turn === $e ? $state : $state->withTurn($e);
		$preyMaybe = static function (int $t) use ($se, $e): bool {
			foreach ($se->worlds as $entry) {
				$id = $entry['b']->board[$t];
				if ($id >= 0 && $entry['b']->sd[$id] !== $e) {
					return true;
				}
			}
			return false;
		};
		$pieces = [];
		foreach ($se->worlds as $entry) {
			$b = $entry['b'];
			foreach ($b->sq as $id => $s) {
				if ($s >= 0 && $b->sd[$id] === $e && Orthodox::splittable($b->ty[$id])) {
					$pieces[$id] = true;
				}
			}
		}
		$best = 0;
		$seen = [];
		foreach ($pieces as $X => $_) {
			if (!self::superposed($se, $X)) {
				continue;
			}
			foreach (self::pieceLocations($se, $X) as $l) {
				if ($l['sq'] < 0) {
					continue;
				}
				foreach (self::mergeCandidates($se, $l['sq']) as $mv) {
					if (isset($seen[$mv['code']]) || !$preyMaybe($mv['to'][0])) {
						continue;
					}
					$seen[$mv['code']] = true;
					$parsed = ['type' => 'merge', 'code' => $mv['code'], 'from' => $mv['from'], 'to' => $mv['to'],
						'key' => ''];
					$r = self::perWorldMerge($se, $parsed, World::applyClassical(...));
					$w = 0;
					foreach ($r['worlds'] ?? [] as $i => $entry) {
						$m = $entry['m'];
						if ($m !== null && $m->capture >= 0 && self::royalLoss($se->worlds[$i]['b'], $m, $side)) {
							$w += $entry['w'];
						}
					}
					$best = max($best, $w / self::T);
				}
			}
		}
		return $best;
	}

	/**
	 * The squares a side might reach with an ordinary move in some world (`reachable`).
	 *
	 * @return array<int, true>
	 */
	public static function reachable(State $state, int $side): array {
		$out = [];
		foreach ($state->worlds as $e) {
			foreach (World::generate($e['b'], $side) as $m) {
				$out[$m->to] = true;
			}
		}
		return $out;
	}

	/**
	 * Start the escape search on a new state (`escapeSearch`).
	 */
	private static function escapeSearch(State $state): EscapeSearch {
		return new EscapeSearch($state->turn, 1 - $state->turn, $state->ply + 1 < self::MAX_PLY);
	}

	/**
	 * What the escape search knows about one world (`worldFacts`).
	 */
	private static function worldFacts(EscapeSearch $ctx, World $b): WorldFacts {
		$f = $ctx->facts[$b] ?? null;
		if ($f === null) {
			$f = new WorldFacts(World::result($b) !== null, World::hasRoyal($b, $ctx->d));
			$ctx->facts[$b] = $f;
		}
		return $f;
	}

	/**
	 * The move of side `e` with the key of `m0` in world `b`, or null (`keyMove`). Without a `filterMoves` hook the
	 * moves of the piece on the key's from square onto its target are enough; otherwise every move is generated.
	 */
	private static function keyMove(World $b, int $e, Move $m0): ?Move {
		$id = $m0->from >= 0 ? $b->board[$m0->from] : -1;
		if (!$b->rules->filters() && $id >= 0 && $b->sd[$id] === $e && $m0->to >= 0) {
			foreach (World::movesOnto($b, $id, $m0->to) as $m) {
				if ($m->key === $m0->key) {
					return $m;
				}
			}
		}
		return World::generate($b, $e)[$m0->key] ?? null;
	}

	/**
	 * The move of the next side with the key of `m0` in `b` when it takes a royal piece there (`royalMove`).
	 */
	private static function royalMove(EscapeSearch $ctx, World $b, Move $m0): ?Move {
		$f = self::worldFacts($ctx, $b);
		if ($f->all !== null) {
			return $f->all[$m0->key] ?? null;
		}
		if (!array_key_exists($m0->key, $f->one)) {
			$m = self::keyMove($b, $ctx->e, $m0);
			$f->one[$m0->key] = $m !== null && $m->capture >= 0 && self::royalLoss($b, $m, $ctx->d) ? $m : null;
		}
		return $f->one[$m0->key];
	}

	/**
	 * Every move of the next side that takes a royal piece in world `b`, by key (`royalThreats`).
	 *
	 * @return array<string, Move>
	 */
	private static function royalThreats(EscapeSearch $ctx, World $b): array {
		$f = self::worldFacts($ctx, $b);
		if ($f->all === null) {
			$all = [];
			foreach (World::generate($b, $ctx->e) as $k => $m) {
				if ($m->capture >= 0 && self::royalLoss($b, $m, $ctx->d)) {
					$all[(string)$k] = $m;
				}
			}
			$f->all = $all;
		}
		return $f->all;
	}

	/**
	 * How a set of worlds after an action leaves the side that acted (`threatOver`).
	 *
	 * @param array<int, World> $bs
	 * @return 'ended'|'certain'|'free'|'merge'
	 */
	private static function threatOver(EscapeSearch $ctx, array $bs): string {
		if (self::worldFacts($ctx, $bs[0])->ended) {
			return 'ended';
		}
		$first = self::royalThreats($ctx, $bs[0]);
		$common = $first;
		$merge = false;
		foreach ($first as $m) {
			foreach ($bs as $b) {
				if ($b->sq[$m->id] !== $bs[0]->sq[$m->id]) {
					$merge = true;
					break 2;
				}
			}
		}
		$n = count($bs);
		for ($i = 1; $i < $n; $i++) {
			if ($common === [] && !$merge) {
				return 'free';
			}
			$b = $bs[$i];
			if (self::worldFacts($ctx, $b)->ended) {
				return 'ended';
			}
			foreach ($common as $k => $m) {
				$x = self::royalMove($ctx, $b, $m);
				if ($x === null || $x->certain() !== $m->certain()) {
					unset($common[$k]);
				}
			}
		}
		return $common !== [] ? 'certain' : ($merge ? self::mergeThreat($ctx, $bs, $first) : 'free');
	}

	/**
	 * Whether a merge of the next side takes a royal piece in every world (`mergeThreat`).
	 *
	 * @param array<int, World> $bs
	 * @param array<string, Move> $first
	 * @return 'certain'|'free'|'merge'
	 */
	private static function mergeThreat(EscapeSearch $ctx, array $bs, array $first): string {
		$open = false;
		$seen = [];
		foreach ($first as $m) {
			$X = $m->id;
			$k = $X . ':' . $m->to;
			if ($m->promo !== null || $m->certain() || isset($seen[$k])) {
				continue;
			}
			$moves = false;
			foreach ($bs as $b) {
				if ($b->sq[$X] !== $bs[0]->sq[$X]) {
					$moves = true;
					break;
				}
			}
			if (!$moves) {
				continue;
			}
			$seen[$k] = true;
			$r = self::mergeCase($ctx, $bs, $X, $m->to);
			if ($r === 'certain') {
				return 'certain';
			}
			$open = $open || $r === 'merge';
		}
		return $open ? 'merge' : 'free';
	}

	/**
	 * Whether the merge of piece X of the next side onto `t` takes a royal piece in every world (`mergeCase`).
	 *
	 * @param array<int, World> $bs
	 * @return 'certain'|'no'|'merge'
	 */
	private static function mergeCase(EscapeSearch $ctx, array $bs, int $X, int $t): string {
		$type = $bs[0]->ty[$X];
		if (!Orthodox::splittable($type)) {
			return 'no';
		}
		$keys = [];
		$oneKey = true;
		$prey = 0;
		foreach ($bs as $b) {
			$s = $b->sq[$X];
			if ($s < 0 || $s === $t || $b->sd[$X] !== $ctx->e || $b->ty[$X] !== $type) {
				return 'no';
			}
			$occ = $b->board[$t];
			if ($occ >= 0 && $b->sd[$occ] === $ctx->e) {
				return 'no';
			}
			$m = self::mergeMove($ctx, $b, $X, $t);
			if ($m === null || $m->capture < 0 || !self::royalLoss($b, $m, $ctx->d)) {
				return 'no';
			}
			if (!isset($keys[$s])) {
				if (count($keys) === 2) {
					return 'no';
				}
				$keys[$s] = $m->key;
			}
			$oneKey = $oneKey && $keys[$s] === $m->key;
			$prey += $occ >= 0 && $b->sd[$occ] !== $ctx->e ? 1 : 0;
		}
		if (count($keys) < 2 || $prey === 0) {
			return 'no';
		}
		foreach ($bs as $b) {
			foreach ($keys as $s => $_) {
				if ($b->board[$s] !== -1 && $b->board[$s] !== $X) {
					return 'no';
				}
			}
		}
		return $prey === count($bs) && $oneKey ? 'certain' : 'merge';
	}

	/**
	 * The move a merge of piece X onto `t` plays in world `b` (`mergeMove`), remembered per world. As in `keyMove`,
	 * the movement lines of X alone are used only without a `filterMoves` hook.
	 */
	private static function mergeMove(EscapeSearch $ctx, World $b, int $X, int $t): ?Move {
		$f = self::worldFacts($ctx, $b);
		$k = $X . ':' . $t;
		if (array_key_exists($k, $f->merge)) {
			return $f->merge[$k];
		}
		$s = $b->sq[$X];
		$fits = static fn (Move $m): bool => $m->id === $X && $m->from === $s && $m->to === $t && $m->promo === null
			&& !$m->certain();
		$r = null;
		if (!$b->rules->filters()) {
			foreach (World::movesOnto($b, $X, $t) as $m) {
				if ($fits($m)) {
					$r = $m;
					break;
				}
			}
		}
		if ($r === null) {
			foreach (World::generate($b, $ctx->e) as $m) {
				if ($fits($m)) {
					$r = $m;
					break;
				}
			}
		}
		return $f->merge[$k] = $r;
	}

	/**
	 * Whether one outcome of an action of the side to move is an escape (`outcomeEscapes`).
	 *
	 * @param Branch $br
	 * @param array<int, Branch> $list
	 */
	private function outcomeEscapes(State $state, string $code, array $br, array $list, EscapeSearch $ctx): bool {
		$r = self::threatOver($ctx, array_column($br['worlds'], 'b'));
		if ($r === 'ended' || $r === 'free') {
			return true;
		}
		if ($r === 'certain' && $ctx->free) {
			return false;
		}
		$next = $this->buildState($state, $code, $br, $list, true, false);
		return $next->result !== null || !self::certainlyTaken($next, $state->turn);
	}

	/**
	 * Whether an action of the side to move escapes, or null when it is illegal (`escapesBy`).
	 */
	private function escapesBy(State $state, string $code, EscapeSearch $ctx): ?bool {
		$list = $this->branchesWith($state, $code, $ctx->apply(...));
		if ($list === null) {
			return null;
		}
		foreach ($list as $br) {
			if ($this->outcomeEscapes($state, $code, $br, $list, $ctx)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Whether a split of the side to move is surely no escape, from its worlds alone (`splitTrapped`).
	 */
	private static function splitTrapped(State $state, int $f, int $t1, int $t2, EscapeSearch $ctx): bool {
		$code = self::splitCode($f, $t1, $t2);
		$mv = ['type' => 'split', 'code' => $code, 'from' => [$f], 'to' => [$t1, $t2], 'key' => ''];
		$r = self::splitEntries($state, $mv, $ctx->apply(...));
		if ($r === null || !$r['branching']) {
			return true;
		}
		if (!$ctx->free) {
			return false;
		}
		return self::threatOver($ctx, array_column(self::idleApply($r['entries']), 'b')) === 'certain';
	}

	/**
	 * The threats of the next side common to a list of worlds, or null when the game is over in one of them
	 * (`commonThreats`).
	 *
	 * @param array<int, World> $bs
	 * @return array<string, Move>|null
	 */
	private static function commonThreats(EscapeSearch $ctx, array $bs): ?array {
		if (self::worldFacts($ctx, $bs[0])->ended) {
			return null;
		}
		$common = self::royalThreats($ctx, $bs[0]);
		$n = count($bs);
		for ($i = 1; $i < $n && $common !== []; $i++) {
			if (self::worldFacts($ctx, $bs[$i])->ended) {
				return null;
			}
			self::keepThreats($ctx, $bs[$i], $common);
		}
		return $common;
	}

	/**
	 * Keep in `common` only the threats that world `b` shares (`keepThreats`).
	 *
	 * @param array<string, Move> $common
	 */
	private static function keepThreats(EscapeSearch $ctx, World $b, array &$common): void {
		foreach ($common as $k => $m) {
			$n = self::royalMove($ctx, $b, $m);
			if ($n === null || $n->certain() !== $m->certain()) {
				unset($common[$k]);
			}
		}
	}

	/**
	 * A quick test of the splits of the piece on `f` in the escape search, or null when it does not apply
	 * (`splitThreats`).
	 *
	 * @param array<int, int> $targets
	 * @return (callable(int, int): bool)|null
	 */
	private static function splitThreats(State $state, int $f, array $targets, EscapeSearch $ctx): ?callable {
		$X = self::ownPieceAt($state, $f);
		if (!$ctx->free || $X < 0 || count($targets) < 2) {
			return null;
		}
		$home = [];
		$away = [];
		foreach ($state->worlds as $i => $e) {
			if ($e['b']->board[$f] === $X) {
				$home[] = $i;
			} else {
				$away[] = $i;
			}
		}
		foreach ($home as $i) {
			if ($state->worlds[$i]['w'] < 2) {
				return null;
			}
		}
		if (!Orthodox::splittable($state->worlds[$home[0]]['b']->ty[$X])) {
			return null;
		}
		$perTarget = [];
		$part = static function (int $t) use (&$perTarget, $home, $state, $X, $f, $ctx): array {
			if (!isset($perTarget[$t])) {
				$moved = [];
				$idle = [];
				foreach ($home as $i) {
					$b = $state->worlds[$i]['b'];
					$m = self::quietTargets($b, $state->turn, $X, $f)[$t] ?? null;
					if ($m !== null) {
						$moved[] = $ctx->apply($b, $m);
					} else {
						$idle[] = $i;
					}
				}
				$perTarget[$t] = [
					'threats' => $moved !== [] ? self::commonThreats($ctx, $moved) : null,
					'idle' => $idle,
				];
			}
			return $perTarget[$t];
		};
		return static function (int $i, int $j) use ($part, $targets, $away, $state, $ctx): bool {
			$a = $part($targets[$i]);
			$c = $part($targets[$j]);
			if ($a['threats'] === null || $c['threats'] === null || $a['threats'] === [] || $c['threats'] === []) {
				return false;
			}
			$common = [];
			foreach ($a['threats'] as $k => $m) {
				$n = $c['threats'][$k] ?? null;
				if ($n !== null && $n->certain() === $m->certain()) {
					$common[$k] = $m;
				}
			}
			$idle = [...$away, ...$a['idle'], ...$c['idle']];
			$count = count($idle);
			for ($k = 0; $k < $count && $common !== []; $k++) {
				$b = Orthodox::clearEnPassant($state->worlds[$idle[$k]]['b']);
				if (self::worldFacts($ctx, $b)->ended) {
					return false;
				}
				self::keepThreats($ctx, $b, $common);
			}
			return $common !== [];
		};
	}

	/**
	 * The ordinary moves in the order the escape search tries them (`escapeOrder`).
	 *
	 * @return array<int, string>
	 */
	private static function escapeOrder(State $state): array {
		$captureKeys = self::table($state)['captureKeys'];
		$royalOn = static function (int $f) use ($state): bool {
			if ($f < 0) {
				return false;
			}
			foreach ($state->worlds as $e) {
				$id = $e['b']->board[$f];
				if ($id >= 0 && World::royal($e['b']->ty[$id])) {
					return true;
				}
			}
			return false;
		};
		$ranked = [];
		foreach (self::ordinaryMoves($state) as $m) {
			$ranked[] = [$m['code'], $royalOn($m['from']) ? 0 : (isset($captureKeys[$m['code']]) ? 1 : 2)];
		}
		usort($ranked, static fn (array $a, array $b): int => $a[1] <=> $b[1]);
		return array_column($ranked, 0);
	}

	/**
	 * "Your king cannot escape" on a new state (`cannotEscape`).
	 */
	private function cannotEscape(State $state): bool {
		$ctx = self::escapeSearch($state);
		$moves = self::escapeOrder($state);
		if ($moves !== [] && $this->escapesBy($state, $moves[0], $ctx) === true) {
			return false;
		}
		if (self::mightTakeRoyal($state)) {
			return false;
		}
		$any = $moves !== [];
		$rest = [];
		foreach (array_slice($moves, 1) as $code) {
			$rest[$code] = true;
		}
		foreach (self::ownPieces($state) as $id) {
			if (!self::superposed($state, $id)) {
				continue;
			}
			$home = self::homeSquares($state, $id);
			foreach ($home as $f) {
				foreach (self::mergesFrom($state, $f) as $m) {
					$rest[$m['code']] = true;
				}
			}
			if ($home !== []) {
				$rest['?' . Topology::name($home[0])] = true;
			}
		}
		foreach ($rest as $code => $_) {
			$r = $this->escapesBy($state, (string)$code, $ctx);
			if ($r === true) {
				return false;
			}
			$any = $any || $r === false;
		}
		if ($moves === [] || self::budgetFull($state)) {
			return $any;
		}
		foreach (self::ownPieces($state) as $id) {
			foreach (self::homeSquares($state, $id) as $f) {
				$targets = self::splitTargets($state, $f);
				$trapped = self::splitThreats($state, $f, $targets, $ctx);
				$n = count($targets);
				for ($i = 0; $i < $n; $i++) {
					for ($j = $i + 1; $j < $n; $j++) {
						if (($trapped !== null && $trapped($i, $j))
							|| self::splitTrapped($state, $f, $targets[$i], $targets[$j], $ctx)) {
							continue;
						}
						if ($this->escapesBy($state, self::splitCode($f, $targets[$i], $targets[$j]), $ctx) === true) {
							return false;
						}
					}
				}
			}
		}
		return $any;
	}
}
