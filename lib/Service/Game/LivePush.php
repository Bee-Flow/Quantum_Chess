<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCP\App\IAppManager;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;

/**
 * Tells the players' open clients at once that a game changed, through the optional Client Push app (notify_push).
 *
 * Every player of the game gets the custom event `quantumchess_game` with `{id, rev}`; the client then polls the game
 * right away instead of waiting for its next poll. Without Client Push nothing happens and clients keep polling. A
 * failing push is only logged: it never affects the change of the game.
 */
class LivePush {
	/** The message queue of Client Push; named as text because the app is optional. */
	public const QUEUE_INTERFACE = 'OCA\\NotifyPush\\Queue\\IQueue';
	/** The name of the custom event the clients listen to. */
	public const MESSAGE = 'quantumchess_game';

	/**
	 * @param string $queueInterface the interface of the queue to use; tests replace it
	 */
	public function __construct(
		private readonly IAppManager $appManager,
		private readonly ContainerInterface $container,
		private readonly LoggerInterface $logger,
		private readonly string $queueInterface = self::QUEUE_INTERFACE,
	) {
	}

	/** Pushes the game's id and current revision to every player of the game. */
	public function gameChanged(Game $game): void {
		try {
			$queue = $this->queue();
			if ($queue === null) {
				return;
			}
			$body = ['id' => (int)$game->getId(), 'rev' => $game->getRev()];
			foreach (self::playersOf($game) as $uid) {
				/** @psalm-suppress MixedMethodCall the queue of an optional app */
				$queue->push('notify_custom', ['user' => $uid, 'message' => self::MESSAGE, 'body' => $body]);
			}
		} catch (\Throwable $e) {
			$this->logger->debug('Could not push a game change to Client Push.', ['exception' => $e]);
		}
	}

	/**
	 * Everyone who takes part in the game, invited players included.
	 *
	 * @return list<string>
	 */
	public static function playersOf(Game $game): array {
		$uids = array_merge(
			$game->seatUids(),
			[$game->getWhiteUid(), $game->getBlackUid(), $game->getCreatorUid(), $game->getOpponentUid()],
		);
		return array_values(array_unique(array_filter($uids, fn (?string $uid) => $uid !== null && $uid !== '')));
	}

	/** The queue of Client Push, or null when the app is not enabled. */
	private function queue(): ?object {
		if (!$this->appManager->isEnabledForAnyone('notify_push') || !interface_exists($this->queueInterface)) {
			return null;
		}
		$queue = $this->container->get($this->queueInterface);
		return is_object($queue) && method_exists($queue, 'push') ? $queue : null;
	}
}
