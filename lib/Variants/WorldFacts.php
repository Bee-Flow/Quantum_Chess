<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * What the escape search knows about one world after an action (`WorldFacts` of src/variants/core/quantum.js).
 *
 * @internal
 */
final class WorldFacts {
	/** @var array<string, Move>|null every threat move, by key, once asked */
	public ?array $all = null;
	/** @var array<string, Move|null> the threat move with a key, or null, once asked */
	public array $one = [];
	/** @var array<string, Move|null> the move of a merge, by piece and square, once asked */
	public array $merge = [];

	/**
	 * @param bool $ended whether the game is over there
	 * @param bool $royal whether the side that acted has a royal piece there
	 */
	public function __construct(
		public bool $ended,
		public bool $royal,
	) {
	}
}
