<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * A game state of the variant layer (`QState` of src/variants/core/quantum.js) with its worlds as `World` objects.
 * Treated as immutable once built; `with` makes a changed copy (`{ ...state, ... }`). The move table is remembered
 * per state object, as the JavaScript `tableCache`.
 *
 * @internal
 */
final class State {
	/**
	 * @var array{gens: array<int, array<string, Move>>, union: array<string, Move>,
	 *   captureKeys: array<string, true>}|null
	 */
	public ?array $table = null;
	/** @var array<int, State> Kriegspiel's own views by side (`viewCache` of umpire.js) */
	public array $views = [];

	/**
	 * @param array<array-key, mixed> $options option values of the game
	 * @param array<int, array{b: World, w: int}> $worlds weighted worlds, weights summing to T
	 * @param array{winner: int|null, reason: string}|null $result
	 * @param array<int, array<string, mixed>> $history history records (plain data)
	 */
	public function __construct(
		public int $v,
		public string $variant,
		public array $options,
		public array $worlds,
		public int $turn,
		public int $ply,
		public int $quiet,
		public ?array $result,
		public array $history,
	) {
	}

	/**
	 * A copy with another side to move (`{ ...state, turn }`), with its own move table.
	 */
	public function withTurn(int $turn): self {
		$c = clone $this;
		$c->turn = $turn;
		$c->table = null;
		$c->views = [];
		return $c;
	}

	/**
	 * A state from its JSON form (`json_decode(..., true)` or the arrays this layer returns).
	 *
	 * @param array<array-key, mixed> $s
	 */
	public static function fromArray(array $s): self {
		$worlds = [];
		foreach ((array)($s['worlds'] ?? []) as $e) {
			$e = (array)$e;
			$worlds[] = ['b' => World::fromArray((array)$e['b']), 'w' => (int)$e['w']];
		}
		if ($worlds === []) {
			throw new \InvalidArgumentException('a state needs at least one world');
		}
		$result = $s['result'] ?? null;
		if ($result !== null) {
			$result = (array)$result;
			$winner = $result['winner'] ?? null;
			$result = ['winner' => $winner === null ? null : (int)$winner, 'reason' => (string)$result['reason']];
		}
		$history = [];
		foreach ((array)($s['history'] ?? []) as $h) {
			/** @var array<string, mixed> */
			$history[] = self::plain($h);
		}
		/** @var array<array-key, mixed> $options */
		$options = self::plain($s['options'] ?? []);
		return new self(
			(int)($s['v'] ?? 1),
			(string)($s['variant'] ?? ''),
			is_array($options) ? $options : [],
			$worlds,
			(int)($s['turn'] ?? 0),
			(int)($s['ply'] ?? 0),
			(int)($s['quiet'] ?? 0),
			$result,
			$history,
		);
	}

	/**
	 * Decoded JSON objects (`stdClass`) as arrays, recursively.
	 *
	 * @param mixed $v
	 * @return mixed
	 */
	private static function plain(mixed $v): mixed {
		if ($v instanceof \stdClass) {
			$v = (array)$v;
		}
		if (is_array($v)) {
			foreach ($v as $k => $item) {
				$v[$k] = self::plain($item);
			}
		}
		return $v;
	}

	/**
	 * The JSON form: `{ v, variant, options, worlds, turn, ply, quiet, result, history }`, with an empty `options` as
	 * an object.
	 *
	 * @return array<string, mixed>
	 */
	public function toArray(): array {
		return [
			'v' => $this->v,
			'variant' => $this->variant,
			'options' => $this->options === [] ? new \stdClass() : $this->options,
			'worlds' => self::worldsToArray($this->worlds),
			'turn' => $this->turn,
			'ply' => $this->ply,
			'quiet' => $this->quiet,
			'result' => $this->result,
			'history' => $this->history,
		];
	}

	/**
	 * Weighted worlds in their JSON form.
	 *
	 * @param array<int, array{b: World, w: int}> $worlds
	 * @return array<int, array{b: array<string, mixed>, w: int}>
	 */
	public static function worldsToArray(array $worlds): array {
		$out = [];
		foreach ($worlds as $e) {
			$out[] = ['b' => $e['b']->toArray(), 'w' => $e['w']];
		}
		return $out;
	}
}
