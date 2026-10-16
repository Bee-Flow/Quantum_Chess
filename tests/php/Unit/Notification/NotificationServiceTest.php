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
use OCA\QuantumChess\Service\Game\VariantTurn;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
use OCA\QuantumChess\Tests\Support\ArrayMemcache;
use OCA\QuantumChess\Tests\Support\FakeNotification;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\ICacheFactory;
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
	private function service(array $switches = [], ?ArrayMemcache $cache = null, bool $cacheFails = false): array {
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
		$factory = $this->createMock(ICacheFactory::class);
		if ($cacheFails) {
			$factory->method('createDistributed')->willThrowException(new \RuntimeException('no cache'));
		} else {
			$factory->method('createDistributed')->with('quantumchess-watch')
				->willReturn($cache ?? new ArrayMemcache());
		}
		$logger = $this->createMock(LoggerInterface::class);
		return [new NotificationService($manager, $settings, $time, $logger, $factory), $log];
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

	private function seatedGame(): Game {
		$game = new Game();
		$game->setId(43);
		$game->setCreatorUid('alice');
		$game->setVariant('fourplayer');
		$game->setVariantOptions('{"mode":"teams"}');
		$game->setSeatCount(4);
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setStartedAt(1790000000);
		$game->setState(VariantTurn::start(['alice', 'bob', 'carol', 'dave'], [true, true, true, true])
			->withMuted(3, true)->json());
		$game->setTurn('1');
		return $game;
	}

	public function testSeatedGamesNotifyEveryOtherPlayer(): void {
		[$service, $log] = $this->service();
		$game = $this->seatedGame();
		$message = new ChatMessage();
		$message->setUid('alice');
		$message->setKind(ChatMessage::KIND_TEXT);
		$message->setMessage('Hi all');
		$service->chat($game, $message);
		$notified = fn () => array_values(array_map(
			fn ($e) => $e[1],
			array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'),
		));
		$this->assertSame(['bob:chat', 'carol:chat'], $notified(), 'dave muted the chat');

		$log->exchangeArray([]);
		$game->setDrawOffer('0');
		$service->drawOffered($game);
		$this->assertSame(['bob:draw_offer', 'carol:draw_offer', 'dave:draw_offer'], $notified());

		$log->exchangeArray([]);
		$game->setState(VariantTurn::of($game)->withOut([2])->json());
		$service->drawOffered($game);
		$this->assertSame(['bob:draw_offer', 'dave:draw_offer'], $notified(), 'carol is out and has no say');
		$game->setState(VariantTurn::of($game)->withOut([])->json());

		$log->exchangeArray([]);
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setVariantResult('win:1,3/resign');
		$service->gameOver($game, 'alice');
		$outcomes = array_map(
			fn ($e) => [$e[1], $e[2]['outcome']],
			array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify')),
		);
		$this->assertSame([
			['bob:game_over', 'win'],
			['carol:game_over', 'loss'],
			['dave:game_over', 'win'],
		], $outcomes, 'alice resigned: no notification for her');
	}

	/** @return list<string> the notified `user:subject` entries */
	private static function notified(\ArrayObject $log): array {
		return array_values(array_map(
			fn ($e) => $e[1],
			array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'),
		));
	}

	public function testAPlayerWhoWatchesTheGameGetsNoTurnOrChatNotification(): void {
		$cache = new ArrayMemcache();
		[$service, $log] = $this->service([], $cache);
		$game = $this->game();
		$service->noteWatching($game, 'bob');
		$this->assertSame([1], array_values($cache->data));
		$this->assertSame(['42/bob'], array_keys($cache->data));
		$move = new Move();
		$move->setPly(2);
		$move->setColor('w');
		$move->setCode('e2-e4');
		$move->setNotation('e4');
		$service->yourTurn($game, $move);
		$message = new ChatMessage();
		$message->setUid('alice');
		$message->setKind(ChatMessage::KIND_TEXT);
		$message->setMessage('hi');
		$service->chat($game, $message);
		$this->assertSame([], self::notified($log), 'watching: nothing new');
		$this->assertContains(['processed', 'bob:your_turn'], $log->getArrayCopy(), 'the old one is still removed');
		$this->assertContains(['processed', 'bob:chat'], $log->getArrayCopy());

		$game->setDrawOffer('w');
		$service->drawOffered($game);
		$this->assertSame(['bob:draw_offer'], self::notified($log), 'other families are still sent');

		$log->exchangeArray([]);
		$service->noteWatching($game, 'alice');
		$cache->data = [];
		$service->chat($game, $message);
		$this->assertSame(['bob:chat'], self::notified($log), 'no longer watching');
	}

	public function testABrokenCacheSendsAsBefore(): void {
		[$service, $log] = $this->service([], null, true);
		$game = $this->game();
		$service->noteWatching($game, 'bob');
		$message = new ChatMessage();
		$message->setUid('alice');
		$message->setKind(ChatMessage::KIND_TEXT);
		$message->setMessage('hi');
		$service->chat($game, $message);
		$this->assertSame(['bob:chat'], self::notified($log));
	}

	public function testTheStartOfASeatedGameReachesEveryoneButTheStarter(): void {
		[$service, $log] = $this->service();
		$game = $this->seatedGame();
		$game->setTurn('0');
		$game->setPly(0);
		$service->gameStarted($game, 'carol');
		$entries = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertSame(
			[['alice:game_started', true], ['bob:game_started', false], ['dave:game_started', false]],
			array_map(fn ($e) => [$e[1], $e[2]['yourMove']], $entries),
			'seat 0 moves first',
		);
		$this->assertSame(['carol', 'fourplayer', 0], [
			$entries[0][2]['actor'],
			$entries[0][2]['variant'],
			$entries[0][2]['ply'],
		]);
	}

	public function testADeclineInASeatedGame(): void {
		[$service, $log] = $this->service();
		$game = $this->seatedGame();
		$game->setStatus(Game::STATUS_PENDING);
		$game->setState(VariantTurn::start(['alice', 'bob', 'carol', 'dave'], [true, true, false, false])->json());
		$service->inviteDeclined($game, 'carol');
		$entries = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertSame(['alice:invite_declined', 'bob:invite_declined'], array_column($entries, 1));
		$this->assertTrue($entries[1][2]['cancelled'], 'every player who took a seat hears that the game is off');

		$log->exchangeArray([]);
		$service->inviteDeclined($game, 'carol', true);
		$entries = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertSame(['alice:invite_declined'], array_column($entries, 1));
		$this->assertTrue($entries[0][2]['reopened']);
	}

	public function testASeatedGameOverNamesWhoEndedIt(): void {
		[$service, $log] = $this->service();
		$game = $this->seatedGame();
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setVariantResult('win:0,2/timeout');
		$game->setResultReason('timeout');
		$game->setState(VariantTurn::of($game)->withEndedBy(1)->json());
		$service->gameOver($game);
		$entries = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertSame([
			['alice:game_over', 'bob', true, 'win'],
			['bob:game_over', 'alice', false, 'loss'],
			['carol:game_over', 'bob', true, 'win'],
			['dave:game_over', 'bob', true, 'loss'],
		], array_map(fn ($e) => [$e[1], $e[2]['actor'], $e[2]['endedBy'], $e[2]['outcome']], $entries));
		$this->assertSame([true, 'fourplayer'], [$entries[0][2]['seats'], $entries[0][2]['variant']]);
	}
}
