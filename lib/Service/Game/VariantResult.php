<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

/**
 * The result of an online variant game, as the code its players settle (`resultCode` of src/variants/online.js):
 * `win:<seats>/<reason>` with the winning seats in ascending order, or `draw/<reason>`. The empty code means that the
 * game goes on. Both are checked against tests/fixtures/online-variants.json.
 */
final class VariantResult {
	private const PATTERN = '/^(?:win:(\d(?:,\d)*)|draw)\/([A-Za-z0-9_-]{1,32})$/';

	/**
	 * @param list<int> $winners the winning seats in ascending order; empty for a draw
	 */
	private function __construct(
		public readonly array $winners,
		public readonly string $reason,
	) {
	}

	/**
	 * Parse a result code for a game with `$seatCount` seats.
	 *
	 * @return self|null null for the empty code (the game goes on)
	 * @throws \InvalidArgumentException for a malformed code, an unknown seat or seats out of order
	 */
	public static function parse(string $code, int $seatCount): ?self {
		if ($code === '') {
			return null;
		}
		if (preg_match(self::PATTERN, $code, $m) !== 1) {
			throw new \InvalidArgumentException('malformed result code');
		}
		$winners = $m[1] === '' ? [] : array_map('intval', explode(',', $m[1]));
		foreach ($winners as $i => $seat) {
			if ($seat >= $seatCount || ($i > 0 && $seat <= $winners[$i - 1])) {
				throw new \InvalidArgumentException('the winning seats must be distinct seats of the game, in order');
			}
		}
		return new self($winners, $m[2]);
	}

	/**
	 * A result with the given winners.
	 *
	 * @param list<int> $winners the winning seats, in any order; empty for a draw
	 */
	public static function of(array $winners, string $reason): self {
		$winners = array_values(array_unique($winners));
		sort($winners);
		return new self($winners, $reason);
	}

	public function isDraw(): bool {
		return $this->winners === [];
	}

	public function code(): string {
		return ($this->isDraw() ? 'draw' : 'win:' . implode(',', $this->winners)) . '/' . $this->reason;
	}
}
