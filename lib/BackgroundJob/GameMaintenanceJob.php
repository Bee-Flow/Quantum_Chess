<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\BackgroundJob;

use OCA\QuantumChess\Service\Ai\AiMaintenance;
use OCA\QuantumChess\Service\Game\GameMaintenanceService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\IJob;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/**
 * Every 15 minutes: expires invitations, times out and abandons games, purges old chat and finished games, then
 * cleans up the LLM integration.
 */
class GameMaintenanceJob extends TimedJob {
	public function __construct(
		ITimeFactory $time,
		private readonly GameMaintenanceService $games,
		private readonly AiMaintenance $ai,
		private readonly LoggerInterface $logger,
	) {
		parent::__construct($time);
		$this->setInterval(15 * 60);
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
			$this->logger->info('Game maintenance', $stats);
		}
		$this->ai->cleanup($now);
	}
}
