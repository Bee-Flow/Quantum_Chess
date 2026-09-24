<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * A configured LLM provider: the preset it is based on, its API, its base URL, the model and, for the organisation
 * provider, the name users see.
 *
 * The API key is not part of it; KeyStore keeps the keys.
 */
final class ProviderConfig {
	/**
	 * @param string $model the model id, or '' to use the preset's first suggestion
	 * @param string|null $label the name of the organisation provider; null for a personal provider
	 */
	public function __construct(
		public readonly string $preset,
		public readonly ProviderKind $kind,
		public readonly string $baseUrl,
		public readonly string $model,
		public readonly ?string $label = null,
	) {
	}

	/**
	 * The provider as stored in the app or user config, or null when none is stored or its preset is unknown.
	 *
	 * @param array<array-key, mixed> $stored
	 * @param bool $withLabel whether the provider has a label (the organisation provider)
	 */
	public static function fromStored(array $stored, bool $withLabel): ?self {
		$preset = $stored['preset'] ?? null;
		$baseUrl = $stored['baseUrl'] ?? null;
		if (!is_string($preset) || !Presets::exists($preset) || !is_string($baseUrl) || $baseUrl === '') {
			return null;
		}
		return new self(
			$preset,
			ProviderKind::from(Presets::get($preset)['kind']),
			$baseUrl,
			is_string($stored['model'] ?? null) ? $stored['model'] : '',
			$withLabel ? (is_string($stored['label'] ?? null) ? $stored['label'] : '') : null,
		);
	}

	/**
	 * Whether two providers point at the same service: the same preset and the same base URL. A stored API key is
	 * only ever sent to the address it was saved for.
	 */
	public static function sameEndpoint(?self $a, ?self $b): bool {
		return $a !== null && $b !== null && $a->preset === $b->preset && $a->baseUrl === $b->baseUrl;
	}

	/**
	 * The stored form, which the settings API also returns.
	 *
	 * @return array{preset: string, kind: string, baseUrl: string, model: string, label?: string}
	 */
	public function toArray(): array {
		$array = [
			'preset' => $this->preset,
			'kind' => $this->kind->value,
			'baseUrl' => $this->baseUrl,
			'model' => $this->model,
		];
		if ($this->label !== null) {
			$array['label'] = $this->label;
		}
		return $array;
	}
}
