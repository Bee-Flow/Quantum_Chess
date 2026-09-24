<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\Provider\Presets;
use OCA\QuantumChess\Service\Ai\Provider\ProviderConfig;
use OCA\QuantumChess\Service\Ai\Provider\ProviderValidator;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\Config\IUserConfig;
use OCP\IL10N;

/**
 * The LLM settings of a user (their own provider and key, the preferred source, the acknowledged privacy notices)
 * and the API key of the organisation provider.
 *
 * A stored API key belongs to the address it was saved for. When a provider moves to another address without a new
 * key, the old key is deleted instead of being sent there.
 */
class AiSettingsService {
	public function __construct(
		private readonly AppSettings $settings,
		private readonly IUserConfig $userConfig,
		private readonly KeyStore $keys,
		private readonly ProviderValidator $providers,
		private readonly IL10N $l,
	) {
	}

	/**
	 * Stores or, with '' or null, deletes an admin secret. The only secret is the organisation provider's API key.
	 *
	 * @return array{hasKey: bool, keyHint: ?string, keyUnreadable: bool}
	 * @throws ApiException invalid_argument
	 */
	public function setAdminSecret(string $key, ?string $value): array {
		if ($key !== KeyStore::SHARED_KEY) {
			throw $this->invalid('key');
		}
		$value = $value === null ? null : trim($value);
		if ($value !== null && $value !== '' && !KeyStore::isValidKey($value)) {
			throw $this->invalid('value');
		}
		$this->keys->setShared($value);
		return $this->keys->sharedInfo();
	}

	/**
	 * The user's own provider, or null.
	 */
	public function personalProvider(string $uid): ?ProviderConfig {
		return ProviderConfig::fromStored(
			$this->userConfig->getValueArray($uid, Application::APP_ID, 'ai_provider', [], true),
			false,
		);
	}

	/** The source the user prefers, or null. */
	public function defaultSource(string $uid): ?string {
		$source = $this->userConfig->getValueString($uid, Application::APP_ID, 'ai_default_source', '');
		return AiSource::tryFrom($source)?->value;
	}

	/**
	 * The sources whose privacy notice the user has acknowledged, in the order of AiSource.
	 *
	 * @return list<string>
	 */
	public function noticeAcked(string $uid): array {
		$ack = $this->userConfig->getValueArray($uid, Application::APP_ID, 'ai_notice_ack', []);
		return array_values(array_intersect(AiSource::values(), $ack));
	}

	/**
	 * Records that the user acknowledged the privacy notice of a source.
	 *
	 * @return list<string> the acknowledged sources
	 */
	public function ackNotice(string $uid, AiSource $source): array {
		$ack = $this->noticeAcked($uid);
		if (!in_array($source->value, $ack, true)) {
			$ack[] = $source->value;
			$this->userConfig->setValueArray($uid, Application::APP_ID, 'ai_notice_ack', $ack);
		}
		return $ack;
	}

	/**
	 * The user's LLM settings. The settings API adds the sources (see AiSourceService::sourcesFor()).
	 *
	 * @return array<string, mixed>
	 */
	public function getPersonal(string $uid): array {
		$info = $this->keys->personalInfo($uid);
		return [
			'allowPersonalKeys' => $this->settings->allowPersonalKeys(),
			'provider' => $this->personalProvider($uid)?->toArray(),
			'hasKey' => $info['hasKey'],
			'keyHint' => $info['keyHint'],
			'keyUnreadable' => $info['keyUnreadable'],
			'defaultSource' => $this->defaultSource($uid),
			'presets' => Presets::publicList(),
			'localAllowlist' => $this->settings->localAllowlist(),
		];
	}

	/**
	 * Changes some of the user's LLM settings.
	 *
	 * @param array<array-key, mixed> $patch `provider` (an object, or null to delete it), `apiKey` ('' deletes it, null
	 *                                       keeps it) and `defaultSource` (null or '' to delete it)
	 * @return array<string, mixed> getPersonal()
	 * @throws ApiException invalid_argument, url_not_allowed, or ai_unavailable when personal keys are turned off
	 */
	public function setPersonal(string $uid, array $patch): array {
		foreach (array_keys($patch) as $key) {
			if (!in_array($key, ['provider', 'apiKey', 'defaultSource'], true)) {
				throw $this->invalid((string)$key);
			}
		}
		// false: not part of the patch
		$provider = false;
		if (array_key_exists('provider', $patch)) {
			if ($patch['provider'] === null) {
				$provider = null;
			} elseif (is_array($patch['provider'])) {
				if (!$this->settings->allowPersonalKeys()) {
					throw $this->personalKeysOff();
				}
				$provider = $this->providers->validate(
					'provider',
					$patch['provider'],
					'personal',
					false,
					$this->settings->localAllowlist(),
				);
			} else {
				throw $this->invalid('provider');
			}
		}
		$apiKey = $patch['apiKey'] ?? null;
		if ($apiKey !== null) {
			if (!is_string($apiKey) || ($apiKey !== '' && !KeyStore::isValidKey(trim($apiKey)))) {
				throw $this->invalid('apiKey');
			}
			if ($apiKey !== '' && !$this->settings->allowPersonalKeys()) {
				throw $this->personalKeysOff();
			}
		}
		$default = false;
		if (array_key_exists('defaultSource', $patch)) {
			$default = $patch['defaultSource'];
			if ($default !== null && $default !== ''
				&& (!is_string($default) || AiSource::tryFrom($default) === null)) {
				throw $this->invalid('defaultSource');
			}
		}
		if ($provider !== false && !is_string($apiKey)
			&& !ProviderConfig::sameEndpoint($this->personalProvider($uid), $provider)) {
			// A saved key follows its provider only while the address stays the same.
			$apiKey = '';
		}
		if ($provider === null) {
			$this->userConfig->deleteUserConfig($uid, Application::APP_ID, 'ai_provider');
		} elseif ($provider instanceof ProviderConfig) {
			$this->userConfig->setValueArray($uid, Application::APP_ID, 'ai_provider', $provider->toArray(), true);
		}
		if (is_string($apiKey)) {
			$this->keys->setPersonal($uid, trim($apiKey));
		}
		if ($default !== false) {
			if ($default === null || $default === '') {
				$this->userConfig->deleteUserConfig($uid, Application::APP_ID, 'ai_default_source');
			} else {
				$this->userConfig->setValueString($uid, Application::APP_ID, 'ai_default_source', $default);
			}
		}
		return $this->getPersonal($uid);
	}

	/**
	 * Checks a provider for the connection test without storing it.
	 *
	 * @param array<array-key, mixed> $value
	 * @param 'shared'|'personal' $scope
	 * @throws ApiException invalid_argument or url_not_allowed, naming `baseUrl`
	 */
	public function checkProvider(array $value, string $scope): ProviderConfig {
		return $this->providers->validate(
			'baseUrl',
			$value,
			$scope,
			$this->settings->sharedAllowLocal(),
			$this->settings->localAllowlist(),
		);
	}

	private function personalKeysOff(): ApiException {
		return new ApiException(
			ApiError::AiUnavailable,
			$this->l->t('Your administrator does not allow personal AI providers.'),
			['reason' => 'disabled'],
		);
	}

	private function invalid(string $field): ApiException {
		return ApiException::invalidArgument($field, $this->l->t('Invalid value'));
	}
}
