<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCP\IL10N;

/**
 * What the server knows about the chess variants for online play (docs/development/online-variants.md): which
 * variants exist and can be played online, their seats and their teams. The rules themselves run in the browser only.
 *
 * JavaScript twin: src/variants/online.js and the catalogue in src/variants/catalog.js. Both are checked against
 * tests/fixtures/online-variants.json.
 */
final class VariantCatalog {
	/**
	 * The version of the variant rules online games are played with, the same as `ONLINE_RULES_VERSION` of
	 * src/variants/online.js. A game stores the version it was created with.
	 */
	public const RULES_VERSION = 1;

	/** The variants and their number of seats, in the order of the catalogue. Seat `i` plays side `i`. */
	private const SEATS = [
		'raumschach' => 2,
		'trid' => 2,
		'hyper4d' => 2,
		'multiverse' => 2,
		'kriegspiel' => 2,
		'darkchess' => 2,
		'chess960' => 2,
		'atomic' => 2,
		'crazyhouse' => 2,
		'bughouse' => 4,
		'antichess' => 2,
		'koth' => 2,
		'threecheck' => 2,
		'horde' => 2,
		'hexagonal' => 2,
		'fourplayer' => 4,
		'capablanca' => 2,
		'shogi' => 2,
		'xiangqi' => 2,
		'makruk' => 2,
	];

	/** Variants whose hidden information every player would see, since every browser replays the full state. */
	private const OFFLINE_ONLY = ['kriegspiel', 'darkchess'];

	/** The teams of a four-seat team game: the seats with the same parity play together. */
	private const PAIRS = [[0, 2], [1, 3]];

	/**
	 * The translated name of a variant, as the catalogue shows it (the same strings as src/variants/catalog.js), or
	 * the id of an unknown variant.
	 */
	public static function name(IL10N $l, string $id): string {
		return match ($id) {
			'raumschach' => $l->t('3D chess (Raumschach)'),
			'trid' => $l->t('Tri-Dimensional chess'),
			'hyper4d' => $l->t('4D chess'),
			'multiverse' => $l->t('Multiverse chess (5D)'),
			'kriegspiel' => $l->t('Kriegspiel'),
			'darkchess' => $l->t('Fog of war'),
			'chess960' => $l->t('Chess960'),
			'atomic' => $l->t('Atomic'),
			'crazyhouse' => $l->t('Crazyhouse'),
			'bughouse' => $l->t('Bughouse'),
			'antichess' => $l->t('Antichess'),
			'koth' => $l->t('King of the Hill'),
			'threecheck' => $l->t('Three-check'),
			'horde' => $l->t('Horde'),
			'hexagonal' => $l->t('Hexagonal chess'),
			'fourplayer' => $l->t('Four-player chess'),
			'capablanca' => $l->t('Capablanca chess'),
			'shogi' => $l->t('Shogi'),
			'xiangqi' => $l->t('Xiangqi'),
			'makruk' => $l->t('Makruk'),
			default => $id,
		};
	}

	/** @return list<string> the ids of every variant, in the order of the catalogue */
	public static function ids(): array {
		return array_keys(self::SEATS);
	}

	public static function exists(string $id): bool {
		return isset(self::SEATS[$id]);
	}

	public static function isOnline(string $id): bool {
		return self::exists($id) && !in_array($id, self::OFFLINE_ONLY, true);
	}

	/** The number of seats of a variant, or 0 for an unknown variant. */
	public static function seatCount(string $id): int {
		return self::SEATS[$id] ?? 0;
	}

	/**
	 * The teams of a game, as lists of seats, or null when every seat plays for itself.
	 *
	 * @param array<string, mixed> $options option values of the game
	 * @return list<list<int>>|null
	 */
	public static function teams(string $id, array $options = []): ?array {
		if ($id === 'bughouse' || ($id === 'fourplayer' && ($options['mode'] ?? null) === 'teams')) {
			return self::PAIRS;
		}
		return null;
	}

	/**
	 * The team of a seat: its index in `teams()`, or null when every seat plays for itself.
	 *
	 * @param array<string, mixed> $options option values of the game
	 */
	public static function teamOf(string $id, array $options, int $seat): ?int {
		foreach (self::teams($id, $options) ?? [] as $team => $seats) {
			if (in_array($seat, $seats, true)) {
				return $team;
			}
		}
		return null;
	}
}
