<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Notification;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Notification\IManager as INotificationManager;
use Psr\Log\LoggerInterface;

/**
 * Sends and removes the app's notifications. The game services call it after their transaction has committed.
 *
 * Notifications come in families; a user has at most one notification per game and family, and a new one replaces
 * the old one. The user's notification switches only stop new notifications from being sent. A failure here is logged
 * and never breaks the game.
 */
class NotificationService {
	/** The subjects of each family. */
	public const FAMILIES = [
		'invite' => ['invite', 'rematch'],
		'info' => ['invite_accepted', 'open_joined', 'invite_declined', 'game_ended_deleted'],
		'turn' => ['your_turn'],
		'draw' => ['draw_offer'],
		'result' => ['game_over'],
		'chat' => ['chat'],
	];
	/** The length of the chat excerpt in a chat notification, in characters. */
	public const EXCERPT_LENGTH = 80;

	public function __construct(
		private readonly INotificationManager $manager,
		private readonly MultiplayerSettingsService $settings,
		private readonly ITimeFactory $time,
		private readonly LoggerInterface $logger,
	) {
	}

	/** Invites the opponent to a game or to a rematch. */
	public function invite(Game $game): void {
		$to = $game->getOpponentUid();
		$from = $game->getCreatorUid();
		if ($to === null || $from === null) {
			return;
		}
		$choice = $game->getColorChoice();
		$this->send($to, $game, $game->getRematchOf() !== null ? 'rematch' : 'invite', [
			'actor' => $from,
			'timeControl' => $game->getTimeControl(),
			'rated' => $game->getRatedRequested() === 1,
			'color' => $choice === 'w' ? 'b' : ($choice === 'b' ? 'w' : 'r'),
			'message' => $game->getInviteMessage(),
		], 'invite', 'invites');
	}

	/**
	 * Tells the creator that the opponent accepted the invitation or, with `$joined`, joined the open challenge.
	 */
	public function inviteAccepted(Game $game, bool $joined = false): void {
		$to = $game->getCreatorUid();
		$from = $game->getOpponentUid();
		if ($to === null || $from === null) {
			return;
		}
		$this->send($to, $game, $joined ? 'open_joined' : 'invite_accepted', [
			'actor' => $from,
			'yourMove' => $game->colorOf($to) === $game->getTurn(),
		], 'info', 'invites');
	}

	/** Tells the creator that the opponent declined the invitation. */
	public function inviteDeclined(Game $game): void {
		$to = $game->getCreatorUid();
		$from = $game->getOpponentUid();
		if ($to === null || $from === null) {
			return;
		}
		$this->send($to, $game, 'invite_declined', ['actor' => $from], 'info', 'invites');
	}

	/** Removes the invitation notifications of a game that no longer waits for an answer. */
	public function inviteClosed(Game $game): void {
		foreach ([$game->getOpponentUid(), $game->getCreatorUid()] as $uid) {
			if ($uid !== null) {
				$this->clear($uid, $game->getId(), 'invite');
			}
		}
	}

	/**
	 * Tells the player to move about the opponent's move.
	 *
	 * @param string|null $capturedType the type letter of the piece the move captured, if any
	 */
	public function yourTurn(Game $game, Move $lastMove, ?string $capturedType = null): void {
		$to = $game->uidOf($game->getTurn());
		$from = $game->opponentOf((string)$to);
		if ($to === null || $from === null) {
			return;
		}
		$record = $lastMove->getMeasurementRecord();
		$key = is_array($record) ? ($record['key'] ?? null) : null;
		$weight = null;
		if (is_array($record) && is_array($record['outcomes'] ?? null)) {
			foreach ($record['outcomes'] as $outcome) {
				if (($outcome['key'] ?? null) === $key) {
					$weight = (int)$outcome['weight'];
				}
			}
		}
		$this->send($to, $game, 'your_turn', [
			'actor' => $from,
			'moveNumber' => intdiv($lastMove->getPly(), 2) + 1,
			'ply' => $game->getPly(),
			'lastMove' => [
				'code' => $lastMove->getCode(),
				'notation' => $lastMove->getNotation(),
				'color' => $lastMove->getColor(),
				'key' => $key,
				'weight' => $weight,
				'capturedType' => $capturedType,
			],
		], 'turn', 'yourTurn');
	}

	/** Tells the opponent about a draw offer. */
	public function drawOffered(Game $game): void {
		$by = $game->getDrawOffer();
		if ($by === null) {
			return;
		}
		$from = $game->uidOf($by);
		$to = $game->uidOf(Game::otherColor($by));
		if ($to === null || $from === null) {
			return;
		}
		$this->send($to, $game, 'draw_offer', [
			'actor' => $from,
			'moveNumber' => intdiv($game->getPly(), 2) + 1,
			'ply' => $game->getPly(),
		], 'draw', 'drawOffers');
	}

	/** Removes the draw offer notifications of a game. */
	public function drawClosed(Game $game): void {
		foreach ([$game->getWhiteUid(), $game->getBlackUid()] as $uid) {
			if ($uid !== null) {
				$this->clear($uid, $game->getId(), 'draw');
			}
		}
	}

	/**
	 * Tells both players the result and removes the game's other open notifications. `$except` is the player who
	 * resigned or aborted, who needs no notification.
	 */
	public function gameOver(Game $game, ?string $except = null): void {
		$deferred = $this->manager->defer();
		try {
			foreach (['w' => $game->getWhiteUid(), 'b' => $game->getBlackUid()] as $color => $uid) {
				if ($uid === null) {
					continue;
				}
				foreach (['turn', 'draw', 'invite'] as $family) {
					$this->clear($uid, $game->getId(), $family);
				}
				$other = $game->uidOf(Game::otherColor($color));
				if ($uid === $except || $other === null) {
					continue;
				}
				$result = $game->getResult();
				$outcome = $game->getStatus() === Game::STATUS_ABORTED ? 'aborted'
					: ($result === '1/2-1/2' ? 'draw' : (($result === '1-0') === ($color === 'w') ? 'win' : 'loss'));
				$before = $color === 'w' ? $game->getRatingWBefore() : $game->getRatingBBefore();
				$delta = $color === 'w' ? $game->getRatingWDelta() : $game->getRatingBDelta();
				$this->send($uid, $game, 'game_over', [
					'actor' => $other,
					'outcome' => $outcome,
					'reason' => $game->getResultReason(),
					'rating' => $before === null || $delta === null ? null : $before + $delta,
					'delta' => $delta,
				], 'result', 'results');
			}
		} finally {
			if ($deferred) {
				$this->manager->flush();
			}
		}
	}

	/**
	 * Tells the other player about a chat message, unless they muted the game. The excerpt is included only when the
	 * recipient allows previews.
	 */
	public function chat(Game $game, ChatMessage $message): void {
		$author = $message->getUid();
		if ($author === null) {
			return;
		}
		$to = $game->opponentOf($author);
		$color = $to === null ? null : $game->colorOf($to);
		if ($to === null || $color === null || ($color === 'w' ? $game->getMuteW() : $game->getMuteB()) === 1) {
			return;
		}
		$excerpt = null;
		if ($this->settings->notificationSwitches($to)['previews']) {
			$excerpt = $message->getKind() === ChatMessage::KIND_TEXT
				? mb_substr(preg_replace('/\s+/u', ' ', $message->getMessage()) ?? '', 0, self::EXCERPT_LENGTH)
				: null;
		}
		$this->send($to, $game, 'chat', [
			'actor' => $author,
			'excerpt' => $excerpt,
			'phrase' => $message->getKind() === ChatMessage::KIND_PHRASE ? $message->getMessage() : null,
		], 'chat', 'chat');
	}

	/** Tells the remaining player that the game ended because the opponent's account was deleted. */
	public function gameEndedDeleted(Game $game, string $remainingUid): void {
		foreach (['turn', 'draw', 'invite'] as $family) {
			$this->clear($remainingUid, $game->getId(), $family);
		}
		$this->send($remainingUid, $game, 'game_ended_deleted', [], 'info', 'results');
	}

	/** Removes the informational notifications of a game the user opened; those that need an answer stay. */
	public function markSeen(Game $game, string $uid): void {
		foreach (['info', 'turn', 'result', 'chat'] as $family) {
			$this->clear($uid, $game->getId(), $family);
		}
	}

	/** Removes all notifications of a game, for every user. */
	public function removeForGame(int $gameId): void {
		try {
			$n = $this->manager->createNotification();
			$n->setApp(Application::APP_ID)->setObject('game', (string)$gameId);
			$this->manager->markProcessed($n);
		} catch (\Throwable $e) {
			$this->logger->warning('Could not remove the notifications of a game.', ['exception' => $e]);
		}
	}

	private function clear(string $uid, int $gameId, string $family): void {
		try {
			foreach (self::FAMILIES[$family] as $subject) {
				$n = $this->manager->createNotification();
				$n->setApp(Application::APP_ID)->setUser($uid)->setObject('game', (string)$gameId)->setSubject($subject);
				$this->manager->markProcessed($n);
			}
		} catch (\Throwable $e) {
			$this->logger->warning('Could not remove notifications.', ['exception' => $e]);
		}
	}

	/**
	 * Replaces the user's notification of the family with a new one, if the user's switch allows it.
	 *
	 * @param array<string, mixed> $parameters the subject parameters that Notifier renders
	 * @param string $switch the name of the user's notification switch
	 */
	private function send(string $uid, Game $game, string $subject, array $parameters, string $family, string $switch): void {
		$this->clear($uid, $game->getId(), $family);
		try {
			if (!($this->settings->notificationSwitches($uid)[$switch] ?? true)) {
				return;
			}
			$n = $this->manager->createNotification();
			$n->setApp(Application::APP_ID)
				->setUser($uid)
				->setDateTime(new \DateTime('@' . $this->time->getTime()))
				->setObject('game', (string)$game->getId())
				->setSubject($subject, $parameters);
			$this->manager->notify($n);
		} catch (\Throwable $e) {
			$this->logger->warning('Could not send a notification.', ['exception' => $e]);
		}
	}
}
