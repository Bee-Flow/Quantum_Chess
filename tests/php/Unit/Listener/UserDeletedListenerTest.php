<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Listener;

use OCA\QuantumChess\Listener\UserDeletedListener;
use OCA\QuantumChess\Service\Game\GameMaintenanceService;
use OCA\QuantumChess\Service\Player\RatingService;
use OCP\EventDispatcher\Event;
use OCP\IUser;
use OCP\User\Events\UserDeletedEvent;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A deleted account is removed from the games and the ratings; a failure is logged and never breaks the deletion.
 */
#[CoversClass(UserDeletedListener::class)]
final class UserDeletedListenerTest extends TestCase {
	private function deleted(string $uid): UserDeletedEvent {
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn($uid);
		return new UserDeletedEvent($user);
	}

	public function testRemovesTheUserFromGamesAndRatings(): void {
		$games = $this->createMock(GameMaintenanceService::class);
		$games->expects($this->once())->method('removeUser')->with('carol', true);
		$ratings = $this->createMock(RatingService::class);
		$ratings->expects($this->once())->method('deleteUser')->with('carol');
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects($this->never())->method('error');

		(new UserDeletedListener($games, $ratings, $logger))->handle($this->deleted('carol'));
	}

	public function testIgnoresOtherEvents(): void {
		$games = $this->createMock(GameMaintenanceService::class);
		$games->expects($this->never())->method('removeUser');
		$ratings = $this->createMock(RatingService::class);
		$ratings->expects($this->never())->method('deleteUser');

		(new UserDeletedListener($games, $ratings, $this->createMock(LoggerInterface::class)))->handle(new Event());
	}

	public function testLogsAFailureInsteadOfThrowing(): void {
		$games = $this->createMock(GameMaintenanceService::class);
		$games->method('removeUser')->willThrowException(new \RuntimeException('database down'));
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects($this->once())->method('error')->with(
			$this->anything(),
			$this->callback(fn (array $context) => $context['exception'] instanceof \RuntimeException),
		);

		(new UserDeletedListener($games, $this->createMock(RatingService::class), $logger))
			->handle($this->deleted('carol'));
	}
}
