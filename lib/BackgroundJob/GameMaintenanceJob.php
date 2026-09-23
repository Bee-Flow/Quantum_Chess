<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\BackgroundJob;

use OCA\QuantumChess\Service\Ai\AiMaintenance;
use OCA\QuantumChess\Service\GameService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\IJob;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/**
 * Every 15 minutes: expire invitations, time out and abandon games, purge old chat (docs/SPEC.md §8.11), then the
 * AI cleanup.
 */
class GameMaintenanceJob extends TimedJob {
	public function __construct(
		ITimeFactory $time,
		private GameService $games,
		private AiMaintenance $ai,
		private LoggerInterface $logger,
	) {
		parent::__construct($time);
		$this->setInterval(900);
		$this->setTimeSensitivity(IJob::TIME_SENSITIVE);
		$this->setAllowParallelRuns(false);
	}

	/**
	 * @param mixed $argument
	 */
	protected function run($argument): void {
		$now = $this->time->getTime();
		$stats = $this->games->runMaintenance($now);
		if (array_sum($stats) > 0) {
			$this->logger->info('Quantum Chess maintenance', ['app' => 'quantumchess'] + $stats);
		}
		$this->ai->cleanup($now);
	}
}
