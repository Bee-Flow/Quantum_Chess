<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\Db\Game;

/**
 * Correspondence time controls, deadlines, timeouts and abandonment (docs/SPEC.md §8.3). Reminders and quiet hours
 * are deferred to 1.1 (docs/LEAN-1.0.md).
 */
class TimeControl {
	public const CONTROLS = ['corr:1d' => 86400, 'corr:3d' => 259200, 'corr:7d' => 604800, 'corr:none' => null];
	public const ABANDON_AFTER = 2592000;

	public function isValid(string $timeControl): bool {
		return array_key_exists($timeControl, self::CONTROLS);
	}

	public function period(string $timeControl): ?int {
		return self::CONTROLS[$timeControl] ?? null;
	}

	public function deadlineFrom(string $timeControl, int $from): ?int {
		$period = $this->period($timeControl);
		return $period === null ? null : $from + $period;
	}

	/** Last activity of an active game: its last move, else its start. */
	public function lastActivity(Game $game): int {
		return $game->getLastMoveAt() ?? $game->getStartedAt() ?? $game->getCreatedAt();
	}

	/**
	 * The time at which an active game is resolved by the clock (deadline or abandonment), or null.
	 */
	public function dueAt(Game $game): ?int {
		if ($game->getStatus() !== Game::STATUS_ACTIVE) {
			return null;
		}
		if ($game->getDeadlineAt() !== null) {
			return $game->getDeadlineAt();
		}
		if ($game->getTimeControl() === 'corr:none') {
			return $this->lastActivity($game) + self::ABANDON_AFTER;
		}
		return null;
	}

	/**
	 * Outcome of a passed deadline (or abandonment) for the side to move (`turn`).
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
		$waiting = $late === 'w' ? 'b' : 'w';
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
			return ['status' => Game::STATUS_FINISHED, 'result' => '1/2-1/2', 'reason' => $abandoned ? 'abandoned' : 'timeout_draw'];
		}
		return [
			'status' => Game::STATUS_FINISHED,
			'result' => $waiting === 'w' ? '1-0' : '0-1',
			'reason' => $abandoned ? 'abandoned' : 'timeout',
		];
	}
}
