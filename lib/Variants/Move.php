<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * A classical move of one world (`ClassicalMove` of src/variants/core/world.js). Moves are compared by identity in
 * the caches of the escape search, as in JavaScript, and never changed once made.
 *
 * @internal
 */
final class Move {
	/**
	 * @param string $key the move's code, the same in every world
	 * @param int $from from square
	 * @param int $to target square (castling: the king's destination)
	 * @param int $id the moving piece
	 * @param int $capture the captured piece, or -1
	 * @param string|null $promo the type the piece turns into
	 * @param string $kind normal, double, ep, castle, or try (Kriegspiel's pawn tries)
	 * @param int $rookId castling: the rook (`extra.rook.id`), else -1
	 * @param int $rookTo castling: the rook's destination (`extra.rook.to`), else -1
	 * @param int $kingTo castling: the king's destination (`extra.kingTo`), else -1
	 */
	public function __construct(
		public string $key,
		public int $from,
		public int $to,
		public int $id,
		public int $capture,
		public ?string $promo,
		public string $kind,
		public int $rookId = -1,
		public int $rookTo = -1,
		public int $kingTo = -1,
	) {
	}

	/**
	 * Whether the move is certain (`isCertain` of quantum.js; for these variants also `noPath`): castling and en
	 * passant.
	 */
	public function certain(): bool {
		return $this->kind === 'castle' || $this->kind === 'ep';
	}
}
