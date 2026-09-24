<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCP\AppFramework\Utility\ITimeFactory;

/**
 * The clock of online games: the current time, move deadlines, and the outcome when a deadline passes.
 *
 * A game with a time limit is lost by the player who does not move before the deadline. A game without a time limit
 * counts as abandoned after ABANDON_AFTER seconds without a move.
 */
class GameClock {
	/** One hour in seconds. */
	public const HOUR = 3600;

	/** One day in seconds. */
	public const DAY = 86400;

	/** Seconds without a move after which a game without a time limit is abandoned. */
	public const ABANDON_AFTER = 30 * self::DAY;

	public function __construct(
		private readonly ITimeFactory $time,
	) {
	}

	/** The current Unix time. */
	public function now(): int {
		return $this->time->getTime();
	}

	/**
	 * The deadline of a move that starts at `$from`, or null for a time control without a limit.
	 */
	public function deadlineFrom(string $timeControl, int $from): ?int {
		$period = TimeControl::tryFrom($timeControl)?->period();
		return $period === null ? null : $from + $period;
	}

	/** The last activity of an active game: its last move, else its start. */
	public function lastActivity(Game $game): int {
		return $game->getLastMoveAt() ?? $game->getStartedAt() ?? $game->getCreatedAt();
	}

	/**
	 * The time at which the clock decides an active game (its deadline or its abandonment), or null.
	 */
	public function dueAt(Game $game): ?int {
		if ($game->getStatus() !== Game::STATUS_ACTIVE) {
			return null;
		}
		if ($game->getDeadlineAt() !== null) {
			return $game->getDeadlineAt();
		}
		if ($game->getTimeControl() === TimeControl::Unlimited->value) {
			return $this->lastActivity($game) + self::ABANDON_AFTER;
		}
		return null;
	}

	/**
	 * The outcome of a passed deadline, or of abandonment, for the side to move.
	 *
	 * Before both sides have moved the game is aborted. A player who has only the king left cannot win on time, so
	 * the game is drawn instead.
	 *
	 * @param array<string, mixed> $state the game's engine state
	 * @return array{status: string, result: ?string, reason: string}
	 */
	public function resolveTimeout(Game $game, array $state): array {
		$abandoned = $game->getDeadlineAt() === null;
		$late = $game->getTurn();
		// With the standard start both sides have made a move once two plies were played.
		if ($game->getPly() < 2) {
			return ['status' => Game::STATUS_ABORTED, 'result' => null, 'reason' => 'aborted_timeout'];
		}
		$waiting = Game::otherColor($late);
		$first = $waiting === 'w' ? 1 : 17;
		$captured = is_array($state['captured'] ?? null) ? $state['captured'] : [];
		$bareKing = true;
		for ($id = $first; $id < $first + 15; $id++) {
			if (!in_array($id, $captured, true)) {
				$bareKing = false;
				break;
			}
		}
		if ($bareKing) {
			return [
				'status' => Game::STATUS_FINISHED,
				'result' => '1/2-1/2',
				'reason' => $abandoned ? 'abandoned' : 'timeout_draw',
			];
		}
		return [
			'status' => Game::STATUS_FINISHED,
			'result' => $waiting === 'w' ? '1-0' : '0-1',
			'reason' => $abandoned ? 'abandoned' : 'timeout',
		];
	}
}
