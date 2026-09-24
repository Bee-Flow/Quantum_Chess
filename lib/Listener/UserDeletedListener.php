<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Listener;

use OCA\QuantumChess\Service\Game\GameMaintenanceService;
use OCA\QuantumChess\Service\Player\RatingService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\User\Events\UserDeletedEvent;
use Psr\Log\LoggerInterface;

/**
 * Removes a deleted account from the app: its running games end as `player_deleted`, its invitations, chat lines and
 * rating are deleted, and its id is removed from the remaining games.
 *
 * @template-implements IEventListener<Event>
 */
class UserDeletedListener implements IEventListener {
	public function __construct(
		private readonly GameMaintenanceService $games,
		private readonly RatingService $ratings,
		private readonly LoggerInterface $logger,
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
			$this->logger->error('Could not remove the data of a deleted user.', ['exception' => $e]);
		}
	}
}
