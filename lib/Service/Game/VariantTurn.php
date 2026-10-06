<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;

/**
 * What the server keeps about the course of a browser-ruled variant game, in the game's `state` column instead of a
 * board (docs/development/online-variants.md): how often the turn has passed to another seat (`turns`), and the ply
 * of the move that waits for its settlement (`pending`, null when every move is settled).
 *
 * A move is not a turn: in 5D chess a player makes several moves before *Submit turn* passes the turn.
 */
final class VariantTurn {
	private function __construct(
		public readonly int $turns,
		public readonly ?int $pending,
	) {
	}

	/** The record of a new game: no turn passed, nothing pending. */
	public static function start(): self {
		return new self(0, null);
	}

	public static function of(Game $game): self {
		$data = json_decode($game->getState(), true);
		if (!is_array($data)) {
			return self::start();
		}
		$turns = is_int($data['turns'] ?? null) ? max(0, $data['turns']) : 0;
		$pending = is_int($data['pending'] ?? null) ? $data['pending'] : null;
		return new self($turns, $pending);
	}

	public function withPending(?int $ply): self {
		return new self($this->turns, $ply);
	}

	public function withTurnPassed(): self {
		return new self($this->turns + 1, $this->pending);
	}

	/** Whether every seat of a two-seat game has played a turn: the turn has passed twice. */
	public function bothHavePlayed(): bool {
		return $this->turns >= 2;
	}

	public function json(): string {
		return json_encode(['v' => 1, 'turns' => $this->turns, 'pending' => $this->pending], JSON_THROW_ON_ERROR);
	}
}
