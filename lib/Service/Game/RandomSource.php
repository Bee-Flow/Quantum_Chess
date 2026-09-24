<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Engine\Engine;

/**
 * The randomness of online games: the roll of a rolled move and the random colour draw.
 *
 * Both come from PHP's CSPRNG on the server, so neither player can predict or influence them.
 */
class RandomSource {
	/**
	 * A roll `u` for Engine::applyMove(), uniform in [0, Engine::T).
	 */
	public function drawU(): int {
		return random_int(0, Engine::T - 1);
	}

	/**
	 * A fair coin flip.
	 */
	public function coinFlip(): bool {
		return random_int(0, 1) === 0;
	}
}
