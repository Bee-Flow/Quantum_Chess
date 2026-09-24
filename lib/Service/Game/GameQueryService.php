<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\ChatMapper;
use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Db\MoveMapper;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\IL10N;
use OCP\IUserManager;

/**
 * Read access to online games: the lobby and its change token, the dashboard list, the history, a single game with
 * its moves and chat, polling, recent opponents and the admin diagnostics.
 *
 * Reading a game resolves its passed deadlines first (see GameLifecycle).
 */
class GameQueryService {
	/** The most games the lobby shows per group. */
	public const LOBBY_GROUP_MAX = 20;

	public function __construct(
		private readonly GameMapper $games,
		private readonly MoveMapper $moves,
		private readonly ChatMapper $chat,
		private readonly GameLifecycle $lifecycle,
		private readonly InvitePolicy $policy,
		private readonly GameClock $clock,
		private readonly AppSettings $settings,
		private readonly NotificationService $notifications,
		private readonly IUserManager $userManager,
		private readonly IL10N $l,
	) {
	}

	/**
	 * The user's lobby. Games where it is the user's move come first, nearest deadline first; open challenges are the
	 * ones the user may join.
	 *
	 * @return array{yourTurn: list<Game>, waiting: list<Game>, invitations: list<Game>, outgoing: list<Game>, open: list<Game>, recent: list<Game>}
	 */
	public function getLobby(string $uid): array {
		$live = array_map(fn (Game $g) => $this->lifecycle->resolveLazy($g),
			$this->games->findForUser($uid, [Game::STATUS_PENDING, Game::STATUS_OPEN, Game::STATUS_ACTIVE]));
		$groups = ['yourTurn' => [], 'waiting' => [], 'invitations' => [], 'outgoing' => [], 'open' => [], 'recent' => []];
		foreach ($live as $game) {
			$status = $game->getStatus();
			if ($status === Game::STATUS_ACTIVE) {
				$groups[$game->colorOf($uid) === $game->getTurn() ? 'yourTurn' : 'waiting'][] = $game;
			} elseif ($status === Game::STATUS_PENDING && $game->getOpponentUid() === $uid) {
				$groups['invitations'][] = $game;
			} elseif ($game->isAwaitingOpponent() && $game->getCreatorUid() === $uid) {
				$groups['outgoing'][] = $game;
			}
		}
		usort($groups['yourTurn'], fn (Game $a, Game $b) => [$a->getDeadlineAt() ?? PHP_INT_MAX, $this->clock->lastActivity($a)]
			<=> [$b->getDeadlineAt() ?? PHP_INT_MAX, $this->clock->lastActivity($b)]);
		foreach ($this->games->findOpen(100) as $game) {
			if (count($groups['open']) >= self::LOBBY_GROUP_MAX) {
				break;
			}
			if ($this->policy->canSeeOpenChallenge($uid, $game)) {
				$game = $this->lifecycle->resolveLazy($game);
				if ($game->getStatus() === Game::STATUS_OPEN) {
					$groups['open'][] = $game;
				}
			}
		}
		$groups['recent'] = $this->games->history($uid, [Game::STATUS_FINISHED, Game::STATUS_ABORTED], null, null, 5);
		foreach ($groups as $key => $list) {
			$groups[$key] = array_slice($list, 0, self::LOBBY_GROUP_MAX);
		}
		return $groups;
	}

	/**
	 * A short token that changes whenever the user's lobby may have changed. Clients poll it and load the full lobby
	 * only when it changes.
	 */
	public function lobbyToken(string $uid): string {
		$print = $this->games->lobbyFingerprint($uid);
		return 'u' . substr(md5($print['mine']), 0, 10) . '.o' . substr(md5($print['open']), 0, 6);
	}

	/**
	 * The number of games waiting for the user's move and of unanswered invitations.
	 *
	 * @return array{yourTurn: int, invitations: int}
	 */
	public function countActionNeeded(string $uid): array {
		$counts = ['yourTurn' => 0, 'invitations' => 0];
		$now = $this->clock->now();
		foreach ($this->games->findForUser($uid, [Game::STATUS_PENDING, Game::STATUS_ACTIVE]) as $game) {
			if ($game->getStatus() === Game::STATUS_ACTIVE && $game->colorOf($uid) === $game->getTurn()
				&& ($this->clock->dueAt($game) ?? PHP_INT_MAX) > $now) {
				$counts['yourTurn']++;
			} elseif ($game->getStatus() === Game::STATUS_PENDING && $game->getOpponentUid() === $uid
				&& ($game->getExpiresAt() ?? PHP_INT_MAX) > $now) {
				$counts['invitations']++;
			}
		}
		return $counts;
	}

	/**
	 * The games of the dashboard widget: invitations (including rematch offers) first, then the games waiting for the
	 * user's move, nearest deadline first.
	 *
	 * @return list<Game>
	 */
	public function listDashboard(string $uid, int $limit = 7): array {
		$lobby = $this->getLobby($uid);
		return array_slice(array_merge($lobby['invitations'], $lobby['yourTurn']), 0, max(0, $limit));
	}

	/**
	 * One page of the user's ended games, newest first.
	 *
	 * @param array<string, mixed> $query `status` (finished, aborted or all), `cursor` (from the previous page) and
	 *                                    `limit` (1 to 50)
	 * @return array{games: list<Game>, next: ?string} `next` is the cursor of the next page
	 * @throws ApiException invalid_argument for a malformed cursor
	 */
	public function history(string $uid, array $query): array {
		$statuses = match ($query['status'] ?? 'finished') {
			'aborted' => [Game::STATUS_ABORTED],
			'all' => [Game::STATUS_FINISHED, Game::STATUS_ABORTED],
			default => [Game::STATUS_FINISHED],
		};
		$limit = max(1, min(50, (int)($query['limit'] ?? 20)));
		$beforeFinished = null;
		$beforeId = null;
		$cursor = $query['cursor'] ?? null;
		if (is_string($cursor) && $cursor !== '') {
			$decoded = base64_decode($cursor, true);
			if ($decoded === false || !preg_match('/^(\d+):(\d+)$/', $decoded, $m)) {
				throw ApiException::invalidArgument('cursor', $this->l->t('Invalid cursor'));
			}
			$beforeFinished = (int)$m[1];
			$beforeId = (int)$m[2];
		}
		$list = $this->games->history($uid, $statuses, $beforeFinished, $beforeId, $limit + 1);
		$next = null;
		if (count($list) > $limit) {
			$list = array_slice($list, 0, $limit);
			$last = $list[$limit - 1];
			$next = base64_encode((int)$last->getFinishedAt() . ':' . (int)$last->getId());
		}
		return ['games' => $list, 'next' => $next];
	}

	/**
	 * A game the user takes part in, or an open challenge they may join.
	 *
	 * @throws ApiException not_found
	 */
	public function get(int $id, string $uid): Game {
		return $this->lifecycle->load($id, $uid, true);
	}

	/**
	 * A game with all its moves and chat lines. Someone who may only join the game sees neither.
	 *
	 * @return array{game: Game, moves: list<Move>, chat: list<ChatMessage>}
	 * @throws ApiException not_found
	 */
	public function getFull(int $id, string $uid): array {
		$game = $this->lifecycle->load($id, $uid, true);
		if (!$game->isParticipant($uid)) {
			return ['game' => $game, 'moves' => [], 'chat' => []];
		}
		return ['game' => $game, 'moves' => $this->moves->findByGame($id), 'chat' => $this->chat->findByGame($id)];
	}

	/**
	 * What changed since the client's revision: nothing, or the game with the moves from `$ply` and the chat lines
	 * after `$chatId`.
	 *
	 * @return array{changed: bool, rev: int, now: int, game?: Game, moves?: list<Move>, chat?: list<ChatMessage>}
	 * @throws ApiException not_found
	 */
	public function poll(int $id, string $uid, int $rev, int $ply, int $chatId): array {
		$game = $this->lifecycle->load($id, $uid, true);
		$now = $this->clock->now();
		if ($game->getRev() === $rev) {
			return ['changed' => false, 'rev' => $rev, 'now' => $now];
		}
		$participant = $game->isParticipant($uid);
		return [
			'changed' => true,
			'rev' => $game->getRev(),
			'now' => $now,
			'game' => $game,
			'moves' => $participant ? $this->moves->findByGame($id, max(0, $ply)) : [],
			'chat' => $participant ? $this->chat->findByGame($id, max(0, $chatId)) : [],
		];
	}

	/**
	 * The user ids of the user's recent opponents whose accounts still exist, most recent first.
	 *
	 * @return list<string>
	 */
	public function recentOpponents(string $uid, int $limit = 8): array {
		$result = [];
		foreach ($this->games->findForUser($uid, [Game::STATUS_ACTIVE, Game::STATUS_FINISHED, Game::STATUS_ABORTED], 100) as $game) {
			$other = $game->opponentOf($uid);
			if ($other !== null && !in_array($other, $result, true) && $this->userManager->userExists($other)) {
				$result[] = $other;
				if (count($result) >= $limit) {
					break;
				}
			}
		}
		return $result;
	}

	/**
	 * Whether a new game may be rated; `reason` says why not.
	 *
	 * @return array{rated: bool, reason: ?string}
	 */
	public function ratedCheck(): array {
		return $this->settings->ratedEnabled() ? ['rated' => true, 'reason' => null] : ['rated' => false, 'reason' => 'admin'];
	}

	/**
	 * The number of active games and of games finished in the last 24 hours, for the admin status.
	 *
	 * @return array{active: int, finishedToday: int}
	 */
	public function diagnostics(): array {
		return $this->games->diagnostics($this->clock->now() - GameClock::DAY);
	}

	/**
	 * Clears the informational notifications of a game the user has opened.
	 */
	public function markSeen(int $id, string $uid): void {
		$game = $this->games->findById($id);
		if ($game !== null && $game->isParticipant($uid)) {
			$this->notifications->markSeen($game, $uid);
		}
	}
}
