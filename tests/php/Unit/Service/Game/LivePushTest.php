<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\GameErrors;
use OCA\QuantumChess\Service\Game\GameRepository;
use OCA\QuantumChess\Service\Game\GameTransaction;
use OCA\QuantumChess\Service\Game\InvitePolicy;
use OCA\QuantumChess\Service\Game\LivePush;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCP\App\IAppManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IL10N;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;

/**
 * Pushing game changes through the optional Client Push app, and the saves of the repository that trigger it: right
 * away, or once per game after the commit of a transaction.
 */
#[CoversClass(LivePush::class)]
#[CoversClass(GameRepository::class)]
final class LivePushTest extends TestCase {
	/** @var list<array{0: string, 1: mixed}> */
	private array $pushed = [];
	/** @var list<string> */
	private array $log = [];
	private bool $enabled = true;
	private ?\Throwable $failure = null;

	private function push(string $interface = LivePushTestQueue::class): LivePush {
		$apps = $this->createMock(IAppManager::class);
		$apps->method('isEnabledForAnyone')
			->willReturnCallback(fn (string $app) => $app === 'notify_push' && $this->enabled);
		$queue = new class($this) implements LivePushTestQueue {
			public function __construct(
				private readonly LivePushTest $test,
			) {
			}

			public function push(string $channel, mixed $message): void {
				$this->test->record($channel, $message);
			}
		};
		$container = $this->createMock(ContainerInterface::class);
		$container->method('get')->willReturnCallback(fn (string $id) => $id === $interface ? $queue : null);
		$logger = $this->createMock(LoggerInterface::class);
		$logger->method('debug')->willReturnCallback(function (): void {
			$this->log[] = 'debug';
		});
		return new LivePush($apps, $container, $logger, $interface);
	}

	public function record(string $channel, mixed $message): void {
		if ($this->failure !== null) {
			throw $this->failure;
		}
		$this->pushed[] = [$channel, $message];
		$this->log[] = 'push';
	}

	public function testPushesTheRevisionToEveryPlayerOnce(): void {
		$this->push()->gameChanged(GameBuilder::active(['opponentUid' => 'bob']));
		$this->assertSame([
			['notify_custom', ['user' => 'alice', 'message' => 'quantumchess_game', 'body' => ['id' => 7, 'rev' => 5]]],
			['notify_custom', ['user' => 'bob', 'message' => 'quantumchess_game', 'body' => ['id' => 7, 'rev' => 5]]],
		], $this->pushed);
	}

	public function testReachesTheSeatedPlayersOfAGameWithMoreThanTwoSeats(): void {
		$game = GameBuilder::open([
			'variant' => 'fourplayer',
			'variantOptions' => '{}',
			'variantRules' => 1,
			'seatCount' => 4,
			'whiteUid' => null,
			'blackUid' => null,
			'state' => '{"v":1,"seats":["carol","alice",null,"dave"],"accepted":[true,true,false,false]}',
		]);
		$this->assertSame(['carol', 'alice', 'dave'], LivePush::playersOf($game));
	}

	public function testDoesNothingWithoutClientPush(): void {
		$this->enabled = false;
		$this->push()->gameChanged(GameBuilder::active());
		$this->enabled = true;
		$this->push('OCA\\NotifyPush\\Queue\\IQueueThatDoesNotExist')->gameChanged(GameBuilder::active());
		$this->assertSame([], $this->log, 'app off, then app on but its queue interface missing');
	}

	public function testAFailingPushIsOnlyLogged(): void {
		$this->failure = new \RuntimeException('redis is down');
		$this->push()->gameChanged(GameBuilder::active());
		$this->assertSame(['debug'], $this->log);
	}

	private function repository(?GameTransaction $transaction): GameRepository {
		$mapper = $this->createMock(GameMapper::class);
		$mapper->method('updateChecked')->willReturnCallback(function (): bool {
			$this->log[] = 'save';
			return true;
		});
		return new GameRepository(
			$mapper,
			$this->createMock(InvitePolicy::class),
			new Engine(),
			new GameClock($this->createMock(ITimeFactory::class)),
			new GameErrors($this->createMock(IL10N::class)),
			$this->push(),
			$transaction,
		);
	}

	public function testASaveOutsideATransactionPushesRightAway(): void {
		$this->repository(null)->save(GameBuilder::active());
		$this->assertSame(['save', 'push', 'push'], $this->log);
		$this->assertSame(6, $this->pushed[0][1]['body']['rev']);
	}

	public function testSavesInATransactionPushOncePerGameAfterTheCommit(): void {
		$db = $this->createMock(IDBConnection::class);
		$db->method('commit')->willReturnCallback(function (): void {
			$this->log[] = 'commit';
		});
		$transaction = new GameTransaction($db, $this->createMock(LoggerInterface::class));
		$repository = $this->repository($transaction);
		$game = GameBuilder::active(['whiteUid' => null, 'creatorUid' => null]);
		$transaction->run(function () use ($repository, $game): void {
			$repository->save($game);
			$repository->save($game);
			$repository->save(GameBuilder::active(['id' => 8, 'whiteUid' => null, 'creatorUid' => null]));
		});
		$this->assertSame(['save', 'save', 'save', 'commit', 'push', 'push'], $this->log);
		$this->assertSame(
			[[7, 7], [8, 6]],
			array_map(fn (array $push) => [$push[1]['body']['id'], $push[1]['body']['rev']], $this->pushed),
			'the latest revision of each game',
		);
	}
}

/** Stands in for the queue of Client Push, which is not installed for the tests. */
interface LivePushTestQueue {
	public function push(string $channel, mixed $message): void;
}
