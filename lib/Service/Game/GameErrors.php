<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use OCP\IL10N;

/**
 * The API errors about an online game that is missing or not in a suitable state, with their translated messages.
 * The game services and the repository share them, so the same situation always reads the same.
 */
class GameErrors {
	public function __construct(
		private readonly IL10N $l,
	) {
	}

	/** The game does not exist, or the user may not see it (`not_found`). */
	public function notFound(): ApiException {
		return ApiException::notFound($this->l->t('This game does not exist or is not available.'));
	}

	/** The action does not fit the game's status (`invalid_status`). */
	public function invalidStatus(): ApiException {
		return ApiException::invalidStatus($this->l->t('This is not possible in the current state of the game.'));
	}

	/** The game has ended (`game_over`). */
	public function gameOver(): ApiException {
		return ApiException::gameOver($this->l->t('This game is over.'));
	}

	/** The game changed since the client or the server read it (`conflict`). */
	public function conflict(): GameConflictException {
		return new GameConflictException($this->l->t('The game has changed in the meantime.'));
	}
}
