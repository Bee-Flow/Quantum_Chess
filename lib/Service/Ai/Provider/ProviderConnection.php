<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

use OCA\QuantumChess\Service\Ai\AiSource;

/**
 * Everything needed to call the provider of an LLM source: its API, address, model and key, whether it may be a local
 * address, and the models the administrator allows.
 */
final class ProviderConnection {
	/**
	 * @param string|null $model the model to use unless the request names an allowed one; null for Nextcloud Assistant
	 * @param list<string> $modelAllowlist the models users may choose; empty when they may not choose
	 */
	public function __construct(
		public readonly AiSource $source,
		public readonly ProviderKind $kind,
		public readonly ?string $preset,
		public readonly ?string $baseUrl,
		public readonly ?string $model,
		public readonly ?string $apiKey,
		public readonly bool $allowLocal,
		public readonly array $modelAllowlist,
	) {
	}

	/** The connection to Nextcloud Assistant, which needs no address or key. */
	public static function nextcloud(): self {
		return new self(AiSource::Nextcloud, ProviderKind::Nextcloud, null, null, null, null, false, []);
	}
}
