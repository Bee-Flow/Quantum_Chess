<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Notification;

use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
use OCA\QuantumChess\Tests\Support\FakeNotification;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Notification\IManager;
use OCP\Notification\INotification;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Sending and removing notifications: one per user, game and family, and the user's switches.
 */
#[CoversClass(NotificationService::class)]
final class NotificationServiceTest extends TestCase {
	private function game(): Game {
		$game = new Game();
		$game->setId(42);
		$game->setCreatorUid('alice');
		$game->setOpponentUid('bob');
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setPly(3);
		$game->setTurn('b');
		$game->setTimeControl('corr:3d');
		$game->setRatedRequested(1);
		return $game;
	}

	/**
	 * The service with a notification manager that logs `[processed|notify, user:subject, parameters]`.
	 *
	 * @return array{0: NotificationService, 1: \ArrayObject<int, array>}
	 */
	private function service(array $switches = []): array {
		$log = new \ArrayObject();
		$manager = $this->createMock(IManager::class);
		$manager->method('createNotification')->willReturnCallback(fn () => new FakeNotification());
		$manager->method('markProcessed')->willReturnCallback(function (INotification $n) use ($log) {
			$log[] = ['processed', $n->getUser() . ':' . $n->getSubject()];
		});
		$manager->method('notify')->willReturnCallback(function (INotification $n) use ($log) {
			$log[] = ['notify', $n->getUser() . ':' . $n->getSubject(), $n->getSubjectParameters()];
		});
		$settings = $this->createMock(MultiplayerSettingsService::class);
		$settings->method('notificationSwitches')->willReturnCallback(fn (string $uid) => ($switches[$uid] ?? []) + [
			'invites' => true,
			'yourTurn' => true,
			'reminders' => true,
			'drawOffers' => true,
			'results' => true,
			'chat' => true,
			'previews' => true,
		]);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		return [new NotificationService($manager, $settings, $time, $this->createMock(LoggerInterface::class)), $log];
	}

	public function testYourTurnReplacesTheFamilyAndCarriesTheMove(): void {
		[$service, $log] = $this->service();
		$move = new Move();
		$move->setPly(2);
		$move->setColor('w');
		$move->setCode('f3-e5');
		$move->setNotation('Nf3xe5 {capture 50%}');
		$move->setMeasurement('{"key":"capture","u":1,"captured":28,"outcomes":[{"key":"miss","weight":8388608},{"key":"capture","weight":8388608}],"fallback":false}');
		$service->yourTurn($this->game(), $move, 'p');
		$entries = $log->getArrayCopy();
		$this->assertSame(
			[['processed', 'bob:your_turn']],
			array_map(fn ($e) => [$e[0], $e[1]], array_slice($entries, 0, 1)),
		);
		$this->assertSame('notify', $entries[1][0]);
		$this->assertSame('bob:your_turn', $entries[1][1]);
		$this->assertSame([
			'code' => 'f3-e5',
			'notation' => 'Nf3xe5 {capture 50%}',
			'color' => 'w',
			'key' => 'capture',
			'weight' => 8388608,
			'capturedType' => 'p',
		], $entries[1][2]['lastMove']);
		$this->assertSame(
			['alice', 2, 3],
			[$entries[1][2]['actor'], $entries[1][2]['moveNumber'], $entries[1][2]['ply']],
		);
	}

	public function testSwitchesSuppressCreationOnly(): void {
		[$service, $log] = $this->service(['bob' => ['drawOffers' => false]]);
		$game = $this->game();
		$game->setDrawOffer('w');
		$service->drawOffered($game);
		$this->assertSame(
			['processed'],
			array_unique(array_column($log->getArrayCopy(), 0)),
			'cleared but not created',
		);
	}

	public function testMutedChatAndPreviews(): void {
		[$service, $log] = $this->service(['bob' => ['previews' => false]]);
		$game = $this->game();
		$message = new ChatMessage();
		$message->setUid('alice');
		$message->setKind(0);
		$message->setMessage('hello there');
		$service->chat($game, $message);
		$notify = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertNull($notify[0][2]['excerpt'], 'previews off: no excerpt');
		$game->setMuteB(1);
		$service->chat($game, $message);
		$this->assertCount(
			1,
			array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'),
			'muted: no notification',
		);
	}

	public function testGameOverSkipsTheResigner(): void {
		[$service, $log] = $this->service();
		$game = $this->game();
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setResult('0-1');
		$game->setResultReason('resignation');
		$service->gameOver($game, 'alice');
		$notify = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertCount(1, $notify);
		$this->assertSame('bob:game_over', $notify[0][1]);
		$this->assertSame('win', $notify[0][2]['outcome']);
	}
}
