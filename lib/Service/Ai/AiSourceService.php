<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\Provider\NextcloudAiProvider;
use OCA\QuantumChess\Service\Ai\Provider\Presets;
use OCA\QuantumChess\Service\Ai\Provider\ProviderConnection;
use OCA\QuantumChess\Service\Ai\Provider\ProviderValidator;
use OCA\QuantumChess\Service\Ai\Provider\UrlGuard;
use OCA\QuantumChess\Service\Ai\Provider\UrlNotAllowedException;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\IL10N;

/**
 * Which LLM sources a user may use, and how to reach them.
 *
 * A source is available when the administrator enabled it for the user, it is configured completely, and its limits
 * are not used up. When unavailable, `reason` says why: `disabled`, `no_provider`, `not_allowed`, `not_configured`,
 * `no_key` or `cap_reached`. The user's preferred source is the default when available, otherwise the first available
 * source in the order of AiSource.
 */
class AiSourceService {
	public function __construct(
		private readonly AppSettings $settings,
		private readonly AiSettingsService $aiSettings,
		private readonly KeyStore $keys,
		private readonly NextcloudAiProvider $nextcloudAi,
		private readonly AiUsageService $usage,
		private readonly UrlGuard $urlGuard,
		private readonly ProviderValidator $providers,
		private readonly IL10N $l,
	) {
	}

	/**
	 * The sources with their availability and details, the default source and the administrator's privacy notice.
	 *
	 * @return array{sources: list<array<string, mixed>>, default: ?string, privacyNotice: string}
	 */
	public function sourcesFor(string $uid): array {
		$acked = $this->aiSettings->noticeAcked($uid);
		$sources = [$this->nextcloud($uid), $this->shared($uid), $this->personal($uid)];
		foreach ($sources as &$source) {
			$source['noticeAcked'] = in_array($source['id'], $acked, true);
		}
		unset($source);
		return [
			'sources' => $sources,
			'default' => $this->defaultOf($uid, $sources),
			'privacyNotice' => $this->settings->aiPrivacyNotice(),
		];
	}

	/**
	 * Which sources are available, for the initial state of the app page.
	 *
	 * @return array{nextcloud: bool, shared: bool, personal: bool, any: bool, default: ?string}
	 */
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
	 * The connection to an available source.
	 *
	 * @throws ApiException ai_unavailable, or url_not_allowed when the provider's address is no longer allowed
	 */
	public function resolve(string $uid, AiSource $source): ProviderConnection {
		$info = match ($source) {
			AiSource::Nextcloud => $this->nextcloud($uid),
			AiSource::Shared => $this->shared($uid),
			AiSource::Personal => $this->personal($uid),
		};
		if (!$info['available']) {
			throw new ApiException(
				ApiError::AiUnavailable,
				$this->l->t('This AI source is not available.'),
				['reason' => $info['reason']],
			);
		}
		if ($source === AiSource::Nextcloud) {
			return ProviderConnection::nextcloud();
		}
		$provider = $source === AiSource::Shared
			? $this->settings->sharedProvider()
			: $this->aiSettings->personalProvider($uid);
		if ($provider === null) {
			throw new ApiException(
				ApiError::AiUnavailable,
				$this->l->t('This AI source is not available.'),
				['reason' => 'not_configured'],
			);
		}
		try {
			$allowLocal = $this->urlGuard->check(
				$provider->baseUrl,
				$source->value,
				$this->settings->sharedAllowLocal(),
				$this->settings->localAllowlist(),
			)['allowLocal'];
		} catch (UrlNotAllowedException) {
			// the allow-list changed after the provider was saved
			throw new ApiException(
				ApiError::UrlNotAllowed,
				$this->providers->urlMessage('local'),
				['field' => 'baseUrl'],
			);
		}
		return new ProviderConnection(
			$source,
			$provider->kind,
			$provider->preset,
			$provider->baseUrl,
			$provider->model !== ''
				? $provider->model
				: (Presets::get($provider->preset)['suggestedModels'][0] ?? null),
			$source === AiSource::Shared ? $this->keys->getShared() : $this->keys->getPersonal($uid),
			$allowLocal,
			$source === AiSource::Shared ? $this->settings->sharedModelAllowlist() : [],
		);
	}

	/**
	 * @param list<array<string, mixed>> $sources
	 */
	private function defaultOf(string $uid, array $sources): ?string {
		$preferred = $this->aiSettings->defaultSource($uid);
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
			'id' => AiSource::Nextcloud->value,
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
		} elseif ($provider === null
			|| ($provider->model === '' && Presets::get($provider->preset)['suggestedModels'] === [])) {
			$reason = 'not_configured';
		} elseif (Presets::get($provider->preset)['keyRequired'] && $this->keys->getShared() === null) {
			$reason = 'not_configured';
		} elseif ($this->usage->sharedCapReached()) {
			$reason = 'cap_reached';
		}
		$label = $provider !== null && $provider->label !== '' ? $provider->label : $this->l->t('Organisation AI');
		return [
			'id' => AiSource::Shared->value,
			'label' => $label,
			'available' => $reason === null,
			'reason' => $reason,
			'preset' => $provider?->preset,
			'model' => $provider === null ? null : ($provider->model !== '' ? $provider->model : null),
			'models' => $provider !== null && $this->settings->sharedModelAllowlist() !== []
				? $this->settings->sharedModelAllowlist()
				: null,
		];
	}

	/** @return array<string, mixed> */
	private function personal(string $uid): array {
		$provider = $this->aiSettings->personalProvider($uid);
		$info = $this->keys->personalInfo($uid);
		$reason = null;
		if (!$this->settings->allowPersonalKeys()) {
			$reason = 'disabled';
		} elseif ($provider === null) {
			$reason = 'not_configured';
		} elseif (Presets::get($provider->preset)['keyRequired']
			&& ($info['hasKey'] === false || $info['keyUnreadable'])) {
			$reason = 'no_key';
		} elseif ($provider->model === '' && Presets::get($provider->preset)['suggestedModels'] === []) {
			$reason = 'not_configured';
		}
		return [
			'id' => AiSource::Personal->value,
			'label' => $this->l->t('My own API key'),
			'available' => $reason === null,
			'reason' => $reason,
			'preset' => $provider?->preset,
			'model' => $provider === null ? null : ($provider->model !== '' ? $provider->model : null),
			'keyHint' => $info['keyHint'],
		];
	}
}
