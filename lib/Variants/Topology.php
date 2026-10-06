<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * The ordinary 8 × 8 board of the server-ruled variants: square `rank * 8 + file`, named `a1` … `h8`.
 *
 * JavaScript twin: `rectTopology(8, 8)` of src/variants/core/topology.js (only what the rules read: the names, the
 * coordinates and `step`).
 *
 * @internal
 */
final class Topology {
	public const SIZE = 64;
	public const FILES = 8;
	public const RANKS = 8;

	/** @var array<int, string> */
	private static array $names = [];
	/** @var array<string, int> */
	private static array $byName = [];

	/**
	 * The square names in square order (`names` of the topology).
	 *
	 * @return array<int, string>
	 */
	public static function names(): array {
		if (self::$names === []) {
			$names = [];
			for ($r = 0; $r < self::RANKS; $r++) {
				for ($f = 0; $f < self::FILES; $f++) {
					$names[] = substr('abcdefgh', $f, 1) . (string)($r + 1);
				}
			}
			self::$names = $names;
			self::$byName = array_flip($names);
		}
		return self::$names;
	}

	/**
	 * The name of a square (`nameOf` of world.js).
	 */
	public static function name(int $sq): string {
		return self::names()[$sq];
	}

	/**
	 * The square with this name, or -1 (`byName`).
	 */
	public static function byName(string $name): int {
		self::names();
		return self::$byName[$name] ?? -1;
	}

	/** The file (coordinate 0) of a square. */
	public static function file(int $sq): int {
		return $sq % self::FILES;
	}

	/** The rank (coordinate 1) of a square. */
	public static function rank(int $sq): int {
		return intdiv($sq, self::FILES);
	}

	/**
	 * The square at these coordinates, or -1 (`at`).
	 */
	public static function at(int $f, int $r): int {
		return $f < 0 || $f >= self::FILES || $r < 0 || $r >= self::RANKS ? -1 : $r * self::FILES + $f;
	}

	/**
	 * The square at `sq + (dx, dy)`, or -1 (`step`).
	 */
	public static function step(int $sq, int $dx, int $dy): int {
		return self::at($sq % self::FILES + $dx, intdiv($sq, self::FILES) + $dy);
	}
}
