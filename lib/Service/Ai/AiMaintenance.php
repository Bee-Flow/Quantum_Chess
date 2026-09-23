<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

/**
 * Cleanup of AI tasks and usage counters (docs/SPEC.md §6.5), called by GameMaintenanceJob.
 */
class AiMaintenance {
	public function __construct(
		private NextcloudAiProvider $nextcloudAi,
		private AiUsageService $usage,
	) {
	}

	/**
	 * Deletes the app's finished TaskProcessing tasks older than an hour and usage counters older than 30 days.
	 */
	public function cleanup(int $now): void {
		$this->nextcloudAi->cleanup($now - 3600);
		$this->usage->cleanup($now);
	}
}
