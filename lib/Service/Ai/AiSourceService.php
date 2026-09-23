<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\SettingsService;
use OCP\IL10N;

/**
 * AI source availability (docs/SPEC.md §10.1): Nextcloud AI, the organisation provider and the user's own key, in
 * this default order.
 */
class AiSourceService {
	public function __construct(
		private SettingsService $settings,
		private KeyStore $keys,
		private NextcloudAiProvider $nextcloudAi,
		private AiUsageService $usage,
		private UrlGuard $urlGuard,
		private IL10N $l,
	) {
	}

	/** @return array{sources: list<array<string, mixed>>, default: ?string, privacyNotice: string} */
	public function sourcesFor(string $uid): array {
		$acked = $this->settings->noticeAcked($uid);
		$sources = [$this->nextcloud($uid), $this->shared($uid), $this->personal($uid)];
		foreach ($sources as &$source) {
			$source['noticeAcked'] = in_array($source['id'], $acked, true);
		}
		unset($source);
		return ['sources' => $sources, 'default' => $this->defaultOf($uid, $sources), 'privacyNotice' => $this->settings->aiPrivacyNotice()];
	}

	/** @return array{nextcloud: bool, shared: bool, personal: bool, any: bool, default: ?string} */
	public function summary(string $uid): array {
		$sources = [$this->nextcloud($uid), $this->shared($uid), $this->personal($uid)];
		$available = [];
		foreach ($sources as $source) {
			$available[$source['id']] = $source['available'];
		}
		return [
			'nextcloud' => $available['nextcloud'],
			'shared' => $available['shared'],
			'personal' => $available['personal'],
			'any' => in_array(true, $available, true),
			'default' => $this->defaultOf($uid, $sources),
		];
	}

	/**
	 * The connection settings of an available source.
	 *
	 * @return array{source: string, kind: string, preset: ?string, baseUrl: ?string, model: ?string, apiKey: ?string, allowLocal: bool, modelAllowlist: list<string>}
	 * @throws ApiException 403 ai_unavailable
	 */
	public function resolve(string $uid, string $source): array {
		$info = match ($source) {
			'nextcloud' => $this->nextcloud($uid),
			'shared' => $this->shared($uid),
			'personal' => $this->personal($uid),
			default => throw new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => 'source']),
		};
		if (!$info['available']) {
			throw new ApiException('ai_unavailable', $this->l->t('This AI source is not available.'), 403, ['reason' => $info['reason']]);
		}
		if ($source === 'nextcloud') {
			return ['source' => $source, 'kind' => 'nextcloud', 'preset' => null, 'baseUrl' => null, 'model' => null, 'apiKey' => null, 'allowLocal' => false, 'modelAllowlist' => []];
		}
		$provider = $source === 'shared' ? $this->settings->sharedProvider() : $this->settings->personalProvider($uid);
		if ($provider === null) {
			throw new ApiException('ai_unavailable', $this->l->t('This AI source is not available.'), 403, ['reason' => 'not_configured']);
		}
		$allowLocal = false;
		try {
			$allowLocal = $this->urlGuard->check($provider['baseUrl'], $source === 'shared' ? 'shared' : 'personal', $this->settings->sharedAllowLocal(), $this->settings->localAllowlist())['allowLocal'];
		} catch (UrlNotAllowedException) {
			// the allow-list changed after the provider was saved
			throw new ApiException('url_not_allowed', $this->settings->urlMessage('local'), 400, ['field' => 'baseUrl']);
		}
		return [
			'source' => $source,
			'kind' => $provider['kind'],
			'preset' => $provider['preset'],
			'baseUrl' => $provider['baseUrl'],
			'model' => $provider['model'] !== '' ? $provider['model'] : (Presets::get($provider['preset'])['suggestedModels'][0] ?? null),
			'apiKey' => $source === 'shared' ? $this->keys->getShared() : $this->keys->getPersonal($uid),
			'allowLocal' => $allowLocal,
			'modelAllowlist' => $source === 'shared' ? $this->settings->sharedModelAllowlist() : [],
		];
	}

	/**
	 * @param list<array<string, mixed>> $sources
	 */
	private function defaultOf(string $uid, array $sources): ?string {
		$preferred = $this->settings->defaultSource($uid);
		foreach ($sources as $source) {
			if ($source['id'] === $preferred && $source['available']) {
				return $preferred;
			}
		}
		foreach ($sources as $source) {
			if ($source['available']) {
				return (string)$source['id'];
			}
		}
		return null;
	}

	/** @return array<string, mixed> */
	private function nextcloud(string $uid): array {
		$reason = null;
		$type = null;
		if (!$this->settings->ncAiEnabled()) {
			$reason = 'disabled';
		} else {
			$type = $this->nextcloudAi->taskType($uid);
			if ($type === null) {
				$reason = 'no_provider';
			}
		}
		return [
			'id' => 'nextcloud',
			'label' => $this->l->t('Nextcloud AI'),
			'available' => $reason === null,
			'reason' => $reason,
			'providerName' => $type === null ? null : $this->nextcloudAi->providerName($type),
			'taskType' => $type,
			'models' => null,
		];
	}

	/** @return array<string, mixed> */
	private function shared(string $uid): array {
		$provider = $this->settings->sharedProvider();
		$reason = null;
		if (!$this->settings->sharedEnabled()) {
			$reason = 'disabled';
		} elseif (!$this->settings->inGroups($uid, $this->settings->sharedGroups())) {
			$reason = 'not_allowed';
		} elseif ($provider === null || ($provider['model'] === '' && Presets::get($provider['preset'])['suggestedModels'] === [])) {
			$reason = 'not_configured';
		} elseif (Presets::get($provider['preset'])['keyRequired'] && $this->keys->getShared() === null) {
			$reason = 'not_configured';
		} elseif ($this->usage->sharedCapReached()) {
			$reason = 'cap_reached';
		}
		$label = $provider !== null && $provider['label'] !== '' ? $provider['label'] : $this->l->t('Organisation AI');
		return [
			'id' => 'shared',
			'label' => $label,
			'available' => $reason === null,
			'reason' => $reason,
			'preset' => $provider['preset'] ?? null,
			'model' => $provider === null ? null : ($provider['model'] !== '' ? $provider['model'] : null),
			'models' => $provider !== null && $this->settings->sharedModelAllowlist() !== [] ? $this->settings->sharedModelAllowlist() : null,
		];
	}

	/** @return array<string, mixed> */
	private function personal(string $uid): array {
		$provider = $this->settings->personalProvider($uid);
		$info = $this->keys->personalInfo($uid);
		$reason = null;
		if (!$this->settings->allowPersonalKeys()) {
			$reason = 'disabled';
		} elseif ($provider === null) {
			$reason = 'not_configured';
		} elseif (Presets::get($provider['preset'])['keyRequired'] && ($info['hasKey'] === false || $info['keyUnreadable'])) {
			$reason = 'no_key';
		} elseif ($provider['model'] === '' && Presets::get($provider['preset'])['suggestedModels'] === []) {
			$reason = 'not_configured';
		}
		return [
			'id' => 'personal',
			'label' => $this->l->t('My own API key'),
			'available' => $reason === null,
			'reason' => $reason,
			'preset' => $provider['preset'] ?? null,
			'model' => $provider === null ? null : ($provider['model'] !== '' ? $provider['model'] : null),
			'keyHint' => $info['keyHint'],
		];
	}
}
