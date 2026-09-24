<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

use OCA\QuantumChess\AppInfo\Application;
use OCP\Http\Client\IClientService;
use OCP\ICache;
use OCP\ICacheFactory;
use Psr\Log\LoggerInterface;

/**
 * Creates the provider that a connection needs.
 */
class ProviderFactory {
	private ICache $cache;

	public function __construct(
		private readonly NextcloudAiProvider $nextcloudAi,
		private readonly IClientService $clients,
		ICacheFactory $cacheFactory,
		private readonly LoggerInterface $logger,
	) {
		$this->cache = $cacheFactory->createDistributed(Application::APP_ID . '-ai');
	}

	/**
	 * The provider for `$connection`, acting for the user `$uid`.
	 */
	public function create(string $uid, ProviderConnection $connection): ProviderInterface {
		if ($connection->kind === ProviderKind::Nextcloud) {
			return $this->nextcloudAi->forUser($uid);
		}
		$config = [
			'preset' => (string)$connection->preset,
			'baseUrl' => (string)$connection->baseUrl,
			'apiKey' => $connection->apiKey,
			'allowLocal' => $connection->allowLocal,
		];
		return $connection->kind === ProviderKind::Anthropic
			? new AnthropicProvider($this->clients, $this->cache, $this->logger, $config)
			: new OpenAiProvider($this->clients, $this->cache, $this->logger, $config);
	}
}
