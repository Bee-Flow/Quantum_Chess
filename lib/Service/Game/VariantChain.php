<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

/**
 * The hash chain of online variant games (docs/development/online-variants.md section 3.3). It is separate from the
 * chain of classic games (Engine::chainStart), whose start names exactly two players:
 *
 *   chain_0 = sha256("qchess-vchain|v1|" . id . "|" . variant . "|" . canonicalOptions . "|" . uid_0 . "|" . …
 *             . "|" . uid_(n-1) . "|" . createdAt)
 *   chain_n = sha256(chain_(n-1) . "|" . ply . "|" . seat . "|" . code . "|" . u)
 *
 * A seat without a player adds an empty user id. JavaScript twin: src/online/vchain.js; both are checked against
 * tests/fixtures/online-variants.json.
 */
final class VariantChain {
	private const JSON_FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS
		| JSON_THROW_ON_ERROR;

	/**
	 * The options of a game as canonical JSON: an object with its keys in byte order and strings, integers and
	 * booleans as values.
	 *
	 * @param array<string, mixed> $options option values
	 * @throws \InvalidArgumentException for any other value
	 */
	public static function canonicalOptions(array $options): string {
		ksort($options, SORT_STRING);
		$parts = [];
		foreach ($options as $key => $value) {
			if (!is_string($value) && !is_bool($value) && !is_int($value)) {
				throw new \InvalidArgumentException('option ' . $key . ' must be a string, an integer or a boolean');
			}
			if (is_int($value) && abs($value) > 9007199254740991) {
				throw new \InvalidArgumentException('option ' . $key . ' must be a safe integer');
			}
			$parts[] = json_encode((string)$key, self::JSON_FLAGS) . ':' . json_encode($value, self::JSON_FLAGS);
		}
		return '{' . implode(',', $parts) . '}';
	}

	/**
	 * chain_0 of a variant game.
	 *
	 * @param array<string, mixed> $options option values
	 * @param list<string|null> $seatUids the user id of every seat, in seat order (null for a seat without a player)
	 * @throws \InvalidArgumentException for negative numbers or options that are not plain
	 */
	public static function start(
		int $gameId,
		string $variant,
		array $options,
		array $seatUids,
		int $createdAt,
	): string {
		if ($gameId < 0 || $createdAt < 0) {
			throw new \InvalidArgumentException('gameId and createdAt must be non-negative integers');
		}
		$parts = ['qchess-vchain', 'v1', (string)$gameId, $variant, self::canonicalOptions($options)];
		foreach ($seatUids as $uid) {
			$parts[] = $uid ?? '';
		}
		$parts[] = (string)$createdAt;
		return hash('sha256', implode('|', $parts));
	}

	/**
	 * chain_n of a variant game.
	 *
	 * @throws \InvalidArgumentException for negative numbers
	 */
	public static function next(string $previous, int $ply, int $seat, string $code, int $u): string {
		if ($ply < 0 || $seat < 0 || $u < 0) {
			throw new \InvalidArgumentException('ply, seat and u must be non-negative integers');
		}
		return hash('sha256', $previous . '|' . $ply . '|' . $seat . '|' . $code . '|' . $u);
	}
}
