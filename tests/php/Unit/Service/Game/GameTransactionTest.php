<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Service\Game\GameTransaction;
use OCP\IDBConnection;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Transactions with callbacks that run only after the commit.
 */
#[CoversClass(GameTransaction::class)]
final class GameTransactionTest extends TestCase {
	/** @var list<string> */
	private array $log = [];

	private function transaction(): GameTransaction {
		$db = $this->createMock(IDBConnection::class);
		foreach (['beginTransaction' => 'begin', 'commit' => 'commit', 'rollBack' => 'rollback'] as $method => $entry) {
			$db->method($method)->willReturnCallback(function () use ($entry): void {
				$this->log[] = $entry;
			});
		}
		$logger = $this->createMock(LoggerInterface::class);
		$logger->method('warning')->willReturnCallback(function (string $message): void {
			$this->log[] = 'warning';
		});
		return new GameTransaction($db, $logger);
	}

	public function testCallbacksRunAfterTheCommitInOrder(): void {
		$tx = $this->transaction();
		$result = $tx->run(function () use ($tx): string {
			$tx->afterCommit(function (): void {
				$this->log[] = 'first';
			});
			$tx->afterCommit(function (): void {
				throw new \RuntimeException('notification failed');
			});
			$tx->afterCommit(function (): void {
				$this->log[] = 'third';
			});
			$this->log[] = 'work';
			return 'done';
		});
		$this->assertSame('done', $result);
		$this->assertSame(['begin', 'work', 'commit', 'first', 'warning', 'third'], $this->log, 'a failing callback is logged and skipped');
	}

	public function testARollbackDiscardsTheCallbacks(): void {
		$tx = $this->transaction();
		try {
			$tx->run(function () use ($tx): void {
				$tx->afterCommit(function (): void {
					$this->log[] = 'never';
				});
				throw new \RuntimeException('conflict');
			});
			$this->fail('the error is passed on');
		} catch (\RuntimeException $e) {
			$this->assertSame('conflict', $e->getMessage());
		}
		$this->assertSame(['begin', 'rollback'], $this->log);
		$this->assertSame(1, $tx->run(fn () => 1), 'the next transaction starts cleanly');
	}

	public function testTransactionsDoNotNest(): void {
		$tx = $this->transaction();
		$this->expectException(\LogicException::class);
		$tx->run(fn () => $tx->run(fn () => null));
	}

	public function testAfterCommitNeedsATransaction(): void {
		$this->expectException(\LogicException::class);
		$this->transaction()->afterCommit(fn () => null);
	}
}
