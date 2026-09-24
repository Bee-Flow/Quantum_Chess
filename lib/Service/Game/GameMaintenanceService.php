<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\ChatMapper;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\MoveMapper;
use OCA\QuantumChess\Exception\GameConflictException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Settings\AppSettings;

/**
 * Housekeeping of online games: the periodic maintenance run, and the removal of a user's games when their account
 * is deleted.
 */
class GameMaintenanceService {

	public function __construct(
		private readonly GameMapper $games,
		private readonly MoveMapper $moves,
		private readonly ChatMapper $chat,
		private readonly GameRepository $repository,
		private readonly GameLifecycle $lifecycle,
		private readonly GameTransaction $transaction,
		private readonly AppSettings $settings,
		private readonly NotificationService $notifications,
		private readonly GameClock $clock,
	) {
	}

	/**
	 * Expires invitations, applies timeouts and abandonment, purges old chat and, when the administrator turned it
	 * on, deletes old finished games. Each step handles at most `$batch` games; the next run continues.
	 *
	 * @return array{expired: int, timedOut: int, abandoned: int, chatPurged: int, gamesPurged: int} what was done
	 */
	public function runMaintenance(int $now, int $batch = 200): array {
		$stats = ['expired' => 0, 'timedOut' => 0, 'abandoned' => 0, 'chatPurged' => 0, 'gamesPurged' => 0];
		foreach ($this->games->findDue(
			[Game::STATUS_PENDING, Game::STATUS_OPEN],
			'expires_at',
			$now,
			$batch,
		) as $game) {
			if ($this->lifecycle->resolveLazy($game)->getStatus() === Game::STATUS_EXPIRED) {
				$stats['expired']++;
			}
		}
		foreach ($this->games->findDue([Game::STATUS_ACTIVE], 'deadline_at', $now, $batch) as $game) {
			if ($this->lifecycle->resolveLazy($game)->isFinal()) {
				$stats['timedOut']++;
			}
		}
		foreach ($this->games->findAbandoned($now - GameClock::ABANDON_AFTER, $batch) as $game) {
			if ($this->lifecycle->resolveLazy($game)->isFinal()) {
				$stats['abandoned']++;
			}
		}
		$cutoff = $now - $this->settings->chatRetentionDays() * GameClock::DAY;
		foreach ($this->games->findChatToPurge($cutoff, $batch) as $game) {
			try {
				$this->transaction->run(function () use ($game): void {
					$this->chat->deleteByGame((int)$game->getId());
					$game->setChatCount(0);
					$this->repository->save($game);
				});
				$stats['chatPurged']++;
			} catch (GameConflictException) {
				// changed concurrently: the next run picks it up
			}
		}
		$days = $this->settings->purgeFinishedDays();
		if ($days > 0) {
			foreach ($this->games->findDue(
				Game::FINAL_STATUSES,
				'finished_at',
				$now - $days * GameClock::DAY,
				$batch,
			) as $game) {
				$this->transaction->run(fn () => $this->games->deleteWithChildren((int)$game->getId()));
				$this->notifications->removeForGame((int)$game->getId());
				$stats['gamesPurged']++;
			}
		}
		return $stats;
	}

	/**
	 * Removes a user from all their games.
	 *
	 * Invitations and open challenges are deleted. Running games end: as `player_deleted` when the account is gone,
	 * as a resignation otherwise. The user's id, their chat lines and their invitation texts are removed from the
	 * remaining games, and a game without any player left is deleted.
	 *
	 * @param bool $accountDeleted whether the account itself is being deleted
	 */
	public function removeUser(string $uid, bool $accountDeleted): void {
		$all = [Game::STATUS_PENDING, Game::STATUS_OPEN, Game::STATUS_ACTIVE, ...Game::FINAL_STATUSES];
		foreach ($this->games->findForUser($uid, $all, 100000) as $game) {
			$id = (int)$game->getId();
			if ($game->isAwaitingOpponent()) {
				$this->transaction->run(fn () => $this->games->deleteWithChildren($id));
				$this->notifications->removeForGame($id);
				continue;
			}
			$remaining = null;
			$this->transaction->run(function () use ($game, $uid, $accountDeleted, &$remaining): void {
				$color = $game->colorOf($uid);
				if ($game->getStatus() === Game::STATUS_ACTIVE && $color !== null) {
					$winner = $color === 'w' ? '0-1' : '1-0';
					if ($accountDeleted) {
						$game->setRated(0);
						$game->setUnratedReason('deleted');
						$this->lifecycle->finish($game, $winner, 'player_deleted', $this->clock->now());
						$remaining = $game->opponentOf($uid);
					} else {
						$this->lifecycle->finish($game, $winner, 'resignation', $this->clock->now());
						$this->lifecycle->addSystemLine($game, 'resigned', ['color' => $color]);
					}
					$this->repository->save($game);
				}
				$this->games->clearUser((int)$game->getId(), $uid);
				$this->moves->clearUser((int)$game->getId(), $uid);
				$this->chat->deleteOwn((int)$game->getId(), $uid);
				$fresh = $this->games->findById((int)$game->getId());
				if ($fresh !== null && $fresh->getWhiteUid() === null && $fresh->getBlackUid() === null
					&& $fresh->getCreatorUid() === null && $fresh->getOpponentUid() === null) {
					$this->games->deleteWithChildren((int)$game->getId());
				}
			});
			// Notifications of this game carry the removed player's id, name, chat excerpts or a rematch offer.
			$this->notifications->removeForGame($id);
			if ($remaining !== null) {
				$this->notifications->gameEndedDeleted($game, $remaining);
			} elseif ($game->getStatus() === Game::STATUS_FINISHED && $game->getResultReason() === 'resignation'
				&& !$accountDeleted) {
				$this->notifications->gameOver($game, $uid);
			}
		}
	}
}
