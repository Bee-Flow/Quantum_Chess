<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\BackgroundJob;

use OCA\QuantumChess\BackgroundJob\GameMaintenanceJob;
use OCA\QuantumChess\Service\Ai\AiMaintenance;
use OCA\QuantumChess\Service\Game\GameMaintenanceService;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The maintenance job runs the game maintenance and the LLM cleanup at the current time, and logs only when it
 * changed something.
 */
#[CoversClass(GameMaintenanceJob::class)]
final class GameMaintenanceJobTest extends TestCase {
	/**
	 * Runs the job once.
	 *
	 * @param array<string, int> $stats what the game maintenance reports
	 */
	private function runJob(array $stats, LoggerInterface $logger, ?AiMaintenance $ai = null): void {
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		$games = $this->createMock(GameMaintenanceService::class);
		$games->expects($this->once())->method('runMaintenance')->with(1790000000)->willReturn($stats);
		$job = new GameMaintenanceJob($time, $games, $ai ?? $this->createMock(AiMaintenance::class), $logger);
		(new \ReflectionMethod($job, 'run'))->invoke($job, null);
	}

	public function testRunsTheGameMaintenanceAndTheLlmCleanup(): void {
		$ai = $this->createMock(AiMaintenance::class);
		$ai->expects($this->once())->method('cleanup')->with(1790000000);
		$logger = $this->createMock(LoggerInterface::class);
		$stats = ['expired' => 2, 'timedOut' => 0, 'abandoned' => 0, 'chatPurged' => 5, 'gamesPurged' => 0];
		$logger->expects($this->once())->method('info')->with('Game maintenance', $stats);

		$this->runJob($stats, $logger, $ai);
	}

	public function testStaysQuietWhenNothingChanged(): void {
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects($this->never())->method('info');

		$this->runJob(['expired' => 0, 'timedOut' => 0, 'abandoned' => 0, 'chatPurged' => 0, 'gamesPurged' => 0], $logger);
	}
}
