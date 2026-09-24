<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Support;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Engine\Engine;

/**
 * Builds Game entities for unit tests: alice creates the game and plays White, bob is her opponent and plays Black.
 *
 * Every named constructor takes a map of fields (`'drawOffer' => 'w'`) that override the defaults. The fields are set
 * through the entity's setters, then the updated-field list is reset, so the entity looks as if it was just loaded.
 */
final class GameBuilder {
	/** The fixed "now" of the fixtures. */
	public const NOW = 1790000000;

	/**
	 * An active game at the start position, started an hour ago, White to move.
	 *
	 * @param array<string, mixed> $fields
	 */
	public static function active(array $fields = []): Game {
		$engine = new Engine();
		$id = (int)($fields['id'] ?? 7);
		return self::build([
			'id' => $id,
			'creatorUid' => 'alice',
			'opponentUid' => 'bob',
			'whiteUid' => 'alice',
			'blackUid' => 'bob',
			'colorChoice' => 'w',
			'status' => Game::STATUS_ACTIVE,
			'state' => $engine->serializeState($engine->initialState()),
			'ply' => 0,
			'turn' => 'w',
			'rev' => 5,
			'ratedRequested' => 1,
			'rated' => 1,
			'timeControl' => 'corr:3d',
			'deadlineAt' => self::NOW + 1000,
			'createdAt' => self::NOW - 5000,
			'updatedAt' => self::NOW - 4000,
			'startedAt' => self::NOW - 4000,
			'chain' => $engine->chainStart($id, 'alice', 'bob', self::NOW - 5000),
		], $fields);
	}

	/**
	 * A pending invitation from alice to bob.
	 *
	 * @param array<string, mixed> $fields
	 */
	public static function pending(array $fields = []): Game {
		$engine = new Engine();
		return self::build([
			'id' => 7,
			'creatorUid' => 'alice',
			'opponentUid' => 'bob',
			'colorChoice' => 'w',
			'status' => Game::STATUS_PENDING,
			'state' => $engine->serializeState($engine->initialState()),
			'ply' => 0,
			'turn' => 'w',
			'rev' => 1,
			'ratedRequested' => 1,
			'rated' => 0,
			'timeControl' => 'corr:3d',
			'expiresAt' => self::NOW + 86400,
			'inviteMessage' => 'Fancy a game?',
			'createdAt' => self::NOW - 600,
			'updatedAt' => self::NOW - 600,
		], $fields);
	}

	/**
	 * An open challenge of alice that nobody has joined yet.
	 *
	 * @param array<string, mixed> $fields
	 */
	public static function open(array $fields = []): Game {
		return self::pending($fields + [
			'opponentUid' => null,
			'status' => Game::STATUS_OPEN,
			'colorChoice' => 'r',
			'inviteMessage' => null,
		]);
	}

	/**
	 * A rated game that alice (White) won by resignation ten minutes ago.
	 *
	 * @param array<string, mixed> $fields
	 */
	public static function finished(array $fields = []): Game {
		return self::active($fields + [
			'status' => Game::STATUS_FINISHED,
			'result' => '1-0',
			'resultReason' => 'resignation',
			'ply' => 12,
			'turn' => 'w',
			'deadlineAt' => null,
			'lastMoveAt' => self::NOW - 900,
			'finishedAt' => self::NOW - 600,
			'ratingWBefore' => 1200,
			'ratingBBefore' => 1250,
			'ratingWDelta' => 22,
			'ratingBDelta' => -22,
		]);
	}

	/**
	 * @param array<string, mixed> $defaults
	 * @param array<string, mixed> $fields
	 */
	private static function build(array $defaults, array $fields): Game {
		$game = new Game();
		foreach ($fields + $defaults as $field => $value) {
			$game->{'set' . ucfirst($field)}($value);
		}
		$game->resetUpdatedFields();
		return $game;
	}
}
