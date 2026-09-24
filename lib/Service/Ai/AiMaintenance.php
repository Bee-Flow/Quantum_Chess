<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\Service\Ai\Provider\NextcloudAiProvider;

/**
 * The periodic cleanup of the LLM integration, run by the background job.
 */
class AiMaintenance {
	/** Finished tasks older than this many seconds are deleted (one hour). */
	private const TASK_RETENTION = 3600;

	public function __construct(
		private readonly NextcloudAiProvider $nextcloudAi,
		private readonly AiUsageService $usage,
	) {
	}

	/**
	 * Deletes the app's finished Nextcloud Assistant tasks older than an hour and the usage counters older than
	 * 30 days.
	 */
	public function cleanup(int $now): void {
		$this->nextcloudAi->cleanup($now - self::TASK_RETENTION);
		$this->usage->cleanup($now);
	}
}
