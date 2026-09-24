<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;

/**
 * Loads and saves online games.
 *
 * Saving is optimistic: a game is written only while its revision still has the value that was read.
 */
class GameRepository {
	public function __construct(
		private readonly GameMapper $games,
		private readonly InvitePolicy $policy,
		private readonly Engine $engine,
		private readonly GameClock $clock,
		private readonly GameErrors $errors,
	) {
	}

	public function find(int $id): ?Game {
		return $this->games->findById($id);
	}

	/**
	 * A game that `$uid` may see: one they take part in or, with `$allowOpen`, an open challenge they may join.
	 *
	 * Other games answer exactly like missing ones, so game ids of other people cannot be probed.
	 *
	 * @throws ApiException not_found
	 */
	public function findVisible(int $id, string $uid, bool $allowOpen = false): Game {
		$game = $this->games->findById($id);
		if ($game === null) {
			throw $this->errors->notFound();
		}
		if (!$game->isParticipant($uid) && !($allowOpen && $this->policy->canSeeOpenChallenge($uid, $game))) {
			throw $this->errors->notFound();
		}
		return $game;
	}

	/** Stores a new game and returns it with its id. */
	public function insert(Game $game): Game {
		return $this->games->insert($game);
	}

	/**
	 * Saves the changed fields of a game with the next revision.
	 *
	 * @throws GameConflictException when someone else changed the game since it was read
	 */
	public function save(Game $game): void {
		$rev = $game->getRev();
		$game->setRev($rev + 1);
		$game->setUpdatedAt($this->clock->now());
		if (!$this->games->updateChecked($game, $rev)) {
			$game->setRev($rev);
			throw $this->errors->conflict();
		}
	}

	/**
	 * The game's current position.
	 *
	 * @return array<string, mixed> the engine state
	 */
	public function state(Game $game): array {
		return $this->engine->parseState($game->getState());
	}
}
