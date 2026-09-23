<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Listener;

use OCA\QuantumChess\Service\GameService;
use OCA\QuantumChess\Service\RatingService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\User\Events\UserDeletedEvent;
use Psr\Log\LoggerInterface;

/**
 * Account deletion (docs/SPEC.md §8.12): running games end as `player_deleted`, the user's traces are removed.
 *
 * @template-implements IEventListener<Event>
 */
class UserDeletedListener implements IEventListener {
	public function __construct(
		private GameService $games,
		private RatingService $ratings,
		private LoggerInterface $logger,
	) {
	}

	public function handle(Event $event): void {
		if (!$event instanceof UserDeletedEvent) {
			return;
		}
		$uid = $event->getUser()->getUID();
		try {
			$this->games->removeUser($uid, true);
			$this->ratings->deleteUser($uid);
		} catch (\Throwable $e) {
			$this->logger->error('Quantum Chess: could not remove the data of a deleted user', ['exception' => $e]);
		}
	}
}
