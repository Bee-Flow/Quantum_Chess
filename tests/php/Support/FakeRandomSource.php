<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Support;

use OCA\QuantumChess\Service\Game\RandomSource;

/**
 * A RandomSource with chosen results that counts its rolls.
 */
final class FakeRandomSource extends RandomSource {
	/** The number of rolls drawn so far. */
	public int $draws = 0;
	/** The next roll. */
	public int $nextU = 123;
	/** The result of the next coin flip, or null for a real one. */
	public ?bool $nextCoin = null;

	public function drawU(): int {
		$this->draws++;
		return $this->nextU;
	}

	public function coinFlip(): bool {
		return $this->nextCoin ?? parent::coinFlip();
	}
}
