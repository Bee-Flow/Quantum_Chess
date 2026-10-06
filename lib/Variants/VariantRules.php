<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * What sets one server-ruled variant apart (Bee Flow Chess, Kriegspiel, Fog of war): the hooks of its JavaScript
 * declaration that the quantum layer and the referee call, with the defaults of `orthodoxSpec()` (the orthodox start,
 * pawn extras and castling, `orthodoxAfterMove`, `unifyCastling`, no `filterMoves`), and its view (`viewFor` of
 * src/variants/referee.js: the visible squares, the worlds a player may know, whether the side to move gets its legal
 * moves). Every world carries the rules of its variant (`World::$rules`), as a JavaScript world is used with its `V`.
 *
 * @psalm-import-type Branch from Quantum
 *
 * @internal
 */
abstract class VariantRules {
	/** @var array<string, VariantRules> */
	private static array $byId = [];

	/**
	 * The rules of a server-ruled variant, or null for another variant (`isRefereed` of referee.js).
	 */
	public static function of(string $id): ?self {
		if (isset(self::$byId[$id])) {
			return self::$byId[$id];
		}
		$rules = match ($id) {
			'beeflow' => new BeeFlow(),
			'kriegspiel' => new Kriegspiel(),
			'darkchess' => new FogOfWar(),
			default => null,
		};
		if ($rules !== null) {
			self::$byId[$id] = $rules;
		}
		return $rules;
	}

	/** The variant id (`V.id`). */
	abstract public function id(): string;

	/** Whether bare kings draw (`bareKingsDraw`). */
	public function bareKingsDraw(): bool {
		return true;
	}

	/**
	 * The option values a new game stores (`options` of the state): none by default, whatever is given.
	 *
	 * @param array<array-key, mixed> $given
	 * @return array<string, mixed>
	 * @throws \InvalidArgumentException for options the variant cannot start with
	 */
	public function options(array $given): array {
		return [];
	}

	/**
	 * The start world (`setup`) for the option values of `options`.
	 *
	 * @param array<string, mixed> $options
	 */
	public function setup(array $options): World {
		return Orthodox::setup($this);
	}

	/**
	 * The variant's special moves of a side (`extraMoves`): pawn double steps, en passant and castling.
	 *
	 * @param array<int, Move> $out
	 */
	public function extraMoves(World $w, int $side, array &$out): void {
		Orthodox::pawnExtras($w, $side, $out);
		Orthodox::castlingMoves($w, $side, $out);
	}

	/**
	 * Whether the variant has a `filterMoves` hook: then the escape search finds a move by generating all moves, not
	 * from the movement lines of one piece (`keyMove`, `mergeMove` of quantum.js).
	 */
	public function filters(): bool {
		return false;
	}

	/**
	 * The `filterMoves` hook: the moves of a side that remain, in order (only called when `filters` is true).
	 *
	 * @param array<int, Move> $list
	 * @return array<int, Move>
	 */
	public function filterMoves(World $w, int $side, array $list): array {
		return $list;
	}

	/**
	 * The bookkeeping after a move on the new world (`afterMove`): `orthodoxAfterMove`.
	 */
	public function afterMove(World $next, Move $m): void {
		Orthodox::afterMove($next, $m);
	}

	/**
	 * The worlds of the chosen outcome with their state-level facts made identical (`unifyWorlds`): castling rights.
	 *
	 * @param array<int, World> $bs
	 * @return array<int, World>
	 */
	public function unifyWorlds(array $bs): array {
		return Orthodox::unifyCastling($bs);
	}

	/**
	 * What the history record of a move tells (`recordInfo`), or null.
	 *
	 * @param Branch $branch
	 * @return array<string, mixed>|null
	 */
	abstract public function recordInfo(State $prev, string $code, array $branch, State $next): ?array;

	/**
	 * The squares a side sees (`visibility`; every square when the variant has none).
	 *
	 * @return array<int, true>
	 */
	public function visibleSquares(State $state, int $seat): array {
		return array_fill_keys(range(0, Topology::SIZE - 1), true);
	}

	/**
	 * The worlds of a seat's view (`viewOf`, `ownView` or `fogWorlds` in `viewFor` of referee.js).
	 *
	 * @param array<int, true> $visible the squares the seat sees
	 * @return array<int, array{b: World, w: int}>
	 */
	abstract public function viewWorlds(State $state, int $seat, array $visible): array;

	/** Whether an umpire answers the tries (`V.umpire`): then a view lists no legal moves. */
	public function umpire(): bool {
		return false;
	}

	/**
	 * The moves the player to move may try (`candidateMoves`), as codes: none unless an umpire answers them.
	 *
	 * @return array<int, string>
	 */
	public function candidateCodes(State $state): array {
		return [];
	}
}
