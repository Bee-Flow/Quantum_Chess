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
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\IL10N;

/**
 * The chat of an online game: free text and predefined phrases between the two players, and muting.
 *
 * The chat is open while the game runs and for a week after it ended.
 */
class ChatService {
	/** The keys of the predefined phrases; clients translate them. */
	public const PHRASES = ['good_luck', 'nice_split', 'well_played', 'oops', 'thanks', 'good_game'];
	/** The longest text message, in characters. */
	public const MAX_LENGTH = 500;
	/** How long the chat stays open after the game ended, in seconds (7 days). */
	public const OPEN_AFTER_END = 604800;

	public function __construct(
		private readonly GameLifecycle $lifecycle,
		private readonly GameRepository $repository,
		private readonly GameTransaction $transaction,
		private readonly ChatMapper $chat,
		private readonly AppSettings $settings,
		private readonly NotificationService $notifications,
		private readonly GameClock $clock,
		private readonly IL10N $l,
		private readonly GameErrors $errors,
	) {
	}

	/**
	 * Whether the chat of a game is open at `$now`. Whether chat is enabled on the server is checked separately.
	 */
	public static function isOpen(Game $game, int $now): bool {
		return $game->getStatus() === Game::STATUS_ACTIVE
			|| ($game->hasEnded() && (int)$game->getFinishedAt() + self::OPEN_AFTER_END >= $now);
	}

	/**
	 * Sends a text message or, with `$phrase`, a predefined phrase to the opponent.
	 *
	 * Control characters are removed from a text message, except line breaks.
	 *
	 * @throws ApiException
	 */
	public function send(int $id, string $uid, ?string $text, ?string $phrase): ChatMessage {
		if (!$this->settings->chatEnabled()) {
			throw new ApiException(ApiError::ChatDisabled, $this->l->t('Chat is turned off on this server.'));
		}
		$game = $this->lifecycle->load($id, $uid);
		if ($game->colorOf($uid) === null || !self::isOpen($game, $this->clock->now())) {
			throw new ApiException(ApiError::ChatClosed, $this->l->t('The chat of this game is closed.'));
		}
		$message = new ChatMessage();
		if ($phrase !== null) {
			if (!in_array($phrase, self::PHRASES, true)) {
				throw ApiException::invalidArgument('phrase', $this->l->t('Unknown phrase'));
			}
			$message->setKind(ChatMessage::KIND_PHRASE);
			$message->setMessage($phrase);
		} else {
			$clean = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', (string)$text) ?? '');
			$length = mb_strlen($clean);
			if ($length < 1 || $length > self::MAX_LENGTH) {
				throw ApiException::invalidArgument('message', $this->l->t('A message has 1 to 500 characters.'));
			}
			$message->setKind(ChatMessage::KIND_TEXT);
			$message->setMessage($clean);
		}
		$message->setGameId($id);
		$message->setUid($uid);
		$message->setCreatedAt($this->clock->now());
		return $this->transaction->run(function () use ($game, $message): ChatMessage {
			$message = $this->chat->insert($message);
			$game->setChatCount($game->getChatCount() + 1);
			$this->repository->save($game);
			$this->transaction->afterCommit(fn () => $this->notifications->chat($game, $message));
			return $message;
		});
	}

	/**
	 * Mutes or unmutes the chat notifications of a game for the player `$uid`.
	 *
	 * @return bool the new setting
	 * @throws ApiException
	 */
	public function setMuted(int $id, string $uid, bool $muted): bool {
		$game = $this->lifecycle->load($id, $uid);
		$color = $game->colorOf($uid);
		if ($color === null) {
			throw $this->errors->invalidStatus();
		}
		return $this->transaction->run(function () use ($game, $color, $muted): bool {
			if ($color === 'w') {
				$game->setMuteW($muted ? 1 : 0);
			} else {
				$game->setMuteB($muted ? 1 : 0);
			}
			$this->repository->save($game);
			return $muted;
		});
	}
}
