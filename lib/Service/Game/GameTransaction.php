<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

/**
 * Runs a change of an online game in one database transaction and defers its side effects until after the commit.
 *
 * While a transaction runs, services queue callbacks with afterCommit(), typically notifications. The callbacks run
 * after a successful commit, in the order they were queued; a rollback discards them. A failing callback is logged as
 * a warning and never undoes the committed change. Transactions do not nest.
 */
class GameTransaction {
	/** @var list<callable(): void>|null the queued callbacks while a transaction runs, null otherwise */
	private ?array $queue = null;

	public function __construct(
		private readonly IDBConnection $db,
		private readonly LoggerInterface $logger,
	) {
	}

	/**
	 * Runs `$work` in a transaction, then the callbacks it queued.
	 *
	 * @template T
	 * @param callable(): T $work
	 * @return T the result of `$work`
	 * @throws \LogicException when called while a transaction is running
	 */
	public function run(callable $work): mixed {
		if ($this->queue !== null) {
			throw new \LogicException('Game transactions do not nest.');
		}
		$this->db->beginTransaction();
		$this->queue = [];
		try {
			$result = $work();
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->queue = null;
			$this->db->rollBack();
			throw $e;
		}
		$callbacks = $this->queue;
		$this->queue = null;
		foreach ($callbacks as $callback) {
			try {
				$callback();
			} catch (\Throwable $e) {
				$this->logger->warning('A step after the commit of a game change failed.', ['exception' => $e]);
			}
		}
		return $result;
	}

	/**
	 * Queues `$callback` to run after the current transaction commits.
	 *
	 * @param callable(): void $callback
	 * @throws \LogicException when no transaction is running
	 */
	public function afterCommit(callable $callback): void {
		if ($this->queue === null) {
			throw new \LogicException('afterCommit() needs a running game transaction.');
		}
		$this->queue[] = $callback;
	}
}
