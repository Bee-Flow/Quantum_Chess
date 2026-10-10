<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * The referee of the server-ruled variants, Kriegspiel and Fog of war (docs/development/online-variants.md, section
 * 6): new games, legality, applying a move with the server's roll `u`, what a move leads to, and each player's view.
 *
 * JavaScript twins: `newGame`, `isLegal`, `applyMove` of src/variants/core/quantum.js, `settlementOf`, `resultCode`
 * and `positionHash` of src/variants/online.js, and `viewFor`, `preview` of src/variants/referee.js. Checked against
 * tests/fixtures/referee/ (`npm run fixtures:referee`).
 *
 * States are plain arrays in the JSON shape of the JavaScript layer (`{ v, variant, options, worlds, turn, ply, quiet,
 * result, history }`). Every array returned here stays correct under a plain `json_encode`: JSON objects that may be
 * empty (`options`, a world's `x`) are `stdClass` then, and lists are lists. `encode` and `decode` store a state as
 * JSON text and read it back in that form.
 */
final class VariantEngine {
	/** The sum of all world weights: `u` is an integer in [0, T). */
	public const T = Quantum::T;

	/** The variants the server rules, with their bare-kings draw. */
	private const VARIANTS = ['kriegspiel' => true, 'darkchess' => false];

	/** @var array<string, Quantum> */
	private static array $rules = [];

	/**
	 * Whether the server rules the online games of a variant (`isRefereed` of referee.js).
	 */
	public static function supports(string $variant): bool {
		return isset(self::VARIANTS[$variant]);
	}

	/**
	 * The rules of a variant.
	 *
	 * @throws \InvalidArgumentException for another variant
	 */
	private static function rules(string $variant): Quantum {
		if (!isset(self::VARIANTS[$variant])) {
			throw new \InvalidArgumentException('not a server-ruled variant: ' . $variant);
		}
		return self::$rules[$variant] ??= new Quantum($variant, self::VARIANTS[$variant]);
	}

	/**
	 * A state and its rules from the array form.
	 *
	 * @param array<array-key, mixed> $state
	 * @return array{0: Quantum, 1: State}
	 */
	private static function load(array $state): array {
		$s = State::fromArray($state);
		return [self::rules($s->variant), $s];
	}

	/**
	 * The start state of a new game (`newGame(V, {})`).
	 *
	 * @return array<string, mixed>
	 */
	public static function newGame(string $variant): array {
		return self::rules($variant)->newGame()->toArray();
	}

	/**
	 * Whether a move is legal (`isLegal`): false after the end and for a code that names no move.
	 *
	 * @param array<array-key, mixed> $state
	 */
	public static function isLegal(array $state, string $code): bool {
		[$q, $s] = self::load($state);
		return $q->isLegal($s, $code);
	}

	/**
	 * Play a move with the roll `u` (`applyMove(V, state, code, u / T).state`): the next state, with the move's
	 * history record (and its `info`), or null when the move is illegal.
	 *
	 * @param array<array-key, mixed> $state
	 * @param int $u the roll, an integer in [0, T)
	 * @return array<string, mixed>|null
	 * @throws \InvalidArgumentException for a roll outside [0, T)
	 */
	public static function apply(array $state, string $code, int $u): ?array {
		if ($u < 0 || $u >= self::T) {
			throw new \InvalidArgumentException('the roll must be in [0, T)');
		}
		[$q, $s] = self::load($state);
		return $q->applyMove($s, $code, $u)?->toArray();
	}

	/**
	 * The result of a state as the short code the server stores (`resultCode` of online.js): `win:<seat>/<reason>`,
	 * `draw/<reason>`, or the empty string while the game goes on.
	 *
	 * @param mixed $result the state's `result`
	 */
	public static function resultCode(mixed $result): string {
		if ($result instanceof \stdClass) {
			$result = (array)$result;
		}
		if (!is_array($result)) {
			return '';
		}
		$reason = (string)($result['reason'] ?? '');
		$winners = [];
		if (isset($result['winners']) && is_array($result['winners']) && $result['winners'] !== []) {
			$winners = array_map('intval', $result['winners']);
		} elseif (isset($result['winner'])) {
			$winners = [(int)$result['winner']];
		}
		if ($winners === []) {
			return 'draw/' . $reason;
		}
		sort($winners);
		return 'win:' . implode(',', $winners) . '/' . $reason;
	}

	/**
	 * A hash of a position (`positionHash` of online.js): the side to move and every world as its text and weight, in
	 * the stored order, FNV-1a-64 as 16 hex digits. Works on a state and on a view.
	 *
	 * @param array<array-key, mixed> $state
	 */
	public static function positionHash(array $state): string {
		$parts = [(string)(int)($state['turn'] ?? 0)];
		foreach ((array)($state['worlds'] ?? []) as $e) {
			$e = (array)$e;
			$b = (array)$e['b'];
			$x = $b['x'] ?? [];
			$parts[] = World::text(
				array_values(array_map('intval', (array)$b['sq'])),
				array_values(array_map('strval', (array)$b['ty'])),
				array_values(array_map('intval', (array)$b['sd'])),
				array_values(array_map('intval', (array)$b['board'])),
				is_array($x) || $x instanceof \stdClass ? $x : [],
			) . '@' . (string)(int)$e['w'];
		}
		return hash('fnv1a64', implode(';', $parts));
	}

	/**
	 * What a move leads to (`settlementOf` of online.js).
	 *
	 * @param array<array-key, mixed> $state the state after the move
	 * @return array{nextSeat: int, result: string, stateHash: string}
	 */
	public static function settlement(array $state): array {
		return [
			'nextSeat' => (int)($state['turn'] ?? 0),
			'result' => self::resultCode($state['result'] ?? null),
			'stateHash' => self::positionHash($state),
		];
	}

	/**
	 * A history record of another player as a player sees it (`hiddenRecord` of referee.js).
	 *
	 * @param array<string, mixed> $h
	 * @return array<string, mixed>
	 */
	private static function hiddenRecord(array $h): array {
		$out = ['code' => '', 'side' => $h['side'], 'key' => '', 'notes' => [], 'rolled' => false, 'p' => 1,
			'options' => 1, 'captures' => []];
		if (array_key_exists('info', $h) && $h['info'] !== null) {
			$out['info'] = $h['info'];
		}
		return $out;
	}

	/**
	 * The view of a seat (`viewFor` of referee.js): the state as that player may know it, with `visible` (the squares
	 * the player sees, ascending) and `legal` (in Fog of war the ordinary moves of the side to move, to that side; in
	 * Kriegspiel none), both null after the end, when the view is the real state.
	 *
	 * @param array<array-key, mixed> $state the real state
	 * @return array<string, mixed>
	 */
	public static function viewFor(array $state, int $seat): array {
		[$q, $s] = self::load($state);
		$out = $s->toArray();
		if ($s->result !== null) {
			$out['visible'] = null;
			$out['legal'] = null;
			return $out;
		}
		$kriegspiel = $q->id === 'kriegspiel';
		$visible = $kriegspiel ? Kriegspiel::visibility($s, $seat) : FogOfWar::visibility($s, $seat);
		$worlds = $kriegspiel ? Kriegspiel::ownView($s, $seat)->worlds : FogOfWar::fogWorlds($s, $seat, $visible);
		$legal = [];
		if (!$kriegspiel && $s->turn === $seat) {
			$legal = array_column(Quantum::ordinaryMoves($s), 'code');
		}
		$history = [];
		foreach ($s->history as $h) {
			$history[] = ($h['side'] ?? null) === $seat ? $h : self::hiddenRecord($h);
		}
		$squares = array_keys($visible);
		sort($squares);
		$out['worlds'] = State::worldsToArray($worlds);
		$out['quiet'] = 0;
		$out['history'] = $history;
		$out['visible'] = $squares;
		$out['legal'] = $legal;
		return $out;
	}

	/**
	 * The odds of a move before it is confirmed (`preview` of referee.js): `[{ key, notes, p, captures, rolled }]`, or
	 * null for a move that is not legal.
	 *
	 * @param array<array-key, mixed> $state the real state
	 * @return list<array{key: string, notes: array<int, string>, p: int|float, captures: array<int, int>,
	 *   rolled: bool}>|null
	 */
	public static function preview(array $state, string $code): ?array {
		[$q, $s] = self::load($state);
		return $q->preview($s, $code);
	}

	/**
	 * The moves the player to move may try in Kriegspiel (`candidateMoves` of umpire.js), as codes; empty in Fog of
	 * war and after the end.
	 *
	 * @param array<array-key, mixed> $state the real state
	 * @return array<int, string>
	 */
	public static function candidateMoves(array $state): array {
		[$q, $s] = self::load($state);
		if ($q->id !== 'kriegspiel') {
			return [];
		}
		return array_column(Kriegspiel::candidateMoves($s), 'code');
	}

	/**
	 * A state as JSON text, for storage: empty objects stay `{}`.
	 *
	 * @param array<array-key, mixed> $state
	 */
	public static function encode(array $state): string {
		return json_encode(State::fromArray($state)->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
			| JSON_THROW_ON_ERROR);
	}

	/**
	 * A state from its JSON text (see `encode`), in the form the other functions return.
	 *
	 * @return array<string, mixed>
	 * @throws \JsonException for text that is not JSON
	 * @throws \InvalidArgumentException for JSON that is not a state
	 */
	public static function decode(string $json): array {
		$data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
		if (!is_array($data)) {
			throw new \InvalidArgumentException('not a state');
		}
		return State::fromArray($data)->toArray();
	}
}
