<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Settings;

use OCA\QuantumChess\Service\Ai\AiUsageService;
use OCA\QuantumChess\Service\Ai\Provider\NextcloudAiProvider;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCP\App\IAppManager;
use OCP\IAppConfig;
use OCP\ICacheFactory;

/**
 * The status card of the admin settings: Nextcloud Assistant's availability and latency, and diagnostics of the
 * server setup that affect the app.
 */
class AdminStatusService {
	public function __construct(
		private readonly NextcloudAiProvider $nextcloudAi,
		private readonly AiUsageService $usage,
		private readonly GameQueryService $games,
		private readonly ICacheFactory $cacheFactory,
		private readonly IAppManager $appManager,
		private readonly IAppConfig $appConfig,
	) {
	}

	/**
	 * The status as the administrator `$uid` sees it.
	 *
	 * @return array{ncAi: array<string, mixed>, diagnostics: array<string, mixed>}
	 */
	public function status(string $uid): array {
		$type = $this->nextcloudAi->taskType($uid);
		$diagnostics = $this->games->diagnostics();
		return [
			'ncAi' => [
				'providerName' => $type === null ? null : $this->nextcloudAi->providerName($type),
				'taskTypes' => $type === null ? [] : [$type],
				'medianLatencyMs' => $this->usage->medianLatency(),
			],
			'diagnostics' => [
				'activeGames' => $diagnostics['active'],
				'finishedToday' => $diagnostics['finishedToday'],
				'aiRequestsToday' => $this->usage->today(),
				'distributedCache' => $this->cacheFactory->isAvailable(),
				'notifyPush' => $this->appManager->isEnabledForUser('notify_push'),
				'backgroundJobMode' => $this->appConfig->getValueString('core', 'backgroundjobs_mode', 'ajax'),
			],
		];
	}
}
