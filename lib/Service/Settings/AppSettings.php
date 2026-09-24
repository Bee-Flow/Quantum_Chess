<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Settings;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\KeyStore;
use OCA\QuantumChess\Service\Ai\Provider\ProviderConfig;
use OCA\QuantumChess\Service\Ai\Provider\ProviderValidator;
use OCA\QuantumChess\Service\Ai\Provider\UrlGuard;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUserManager;

/**
 * The admin settings: typed getters with their defaults and ranges, and the admin settings API.
 *
 * Only this class reads and writes the app's admin settings in the app config (see AdminSetting). Stored values
 * outside their range are clamped when read, and unknown enum values fall back to the default. The API key of the
 * organisation provider is kept by KeyStore and never returned.
 */
class AppSettings {
	public function __construct(
		private readonly IAppConfig $appConfig,
		private readonly IGroupManager $groupManager,
		private readonly IUserManager $userManager,
		private readonly IL10N $l,
		private readonly KeyStore $keys,
		private readonly UrlGuard $urlGuard,
		private readonly ProviderValidator $providers,
	) {
	}

	// Typed access

	private function bool(AdminSetting $setting): bool {
		return $this->appConfig->getValueBool(Application::APP_ID, $setting->value, (bool)$setting->definition()->default);
	}

	private function int(AdminSetting $setting): int {
		$definition = $setting->definition();
		$default = is_int($definition->default) ? $definition->default : 0;
		$value = $this->appConfig->getValueInt(Application::APP_ID, $setting->value, $default);
		if ($definition->zeroDisables && $value <= 0) {
			return 0;
		}
		return max($definition->min, min($definition->max, $value));
	}

	private function enum(AdminSetting $setting): string {
		$definition = $setting->definition();
		$default = is_string($definition->default) ? $definition->default : '';
		$value = $this->appConfig->getValueString(Application::APP_ID, $setting->value, $default);
		return in_array($value, $definition->values, true) ? $value : $default;
	}

	/** @return list<string> */
	private function list(AdminSetting $setting): array {
		$value = $this->appConfig->getValueArray(Application::APP_ID, $setting->value, [], $setting->definition()->lazy);
		return array_values(array_filter($value, 'is_string'));
	}

	/**
	 * The value of a setting, as the admin settings API shows it.
	 */
	private function value(AdminSetting $setting): mixed {
		return match ($setting->definition()->type) {
			SettingDefinition::BOOL => $this->bool($setting),
			SettingDefinition::INT => $this->int($setting),
			SettingDefinition::ENUM => $this->enum($setting),
			SettingDefinition::TEXT => $this->appConfig->getValueString(Application::APP_ID, $setting->value, '', true),
			SettingDefinition::PROVIDER => $this->sharedProvider()?->toArray(),
			default => $this->list($setting),
		};
	}

	// Admin settings API

	/**
	 * Every admin setting with its value, in the order of AdminSetting, then the organisation key as
	 * `{hasKey, keyHint, keyUnreadable}`.
	 *
	 * @return array<string, mixed>
	 */
	public function getAdmin(): array {
		$result = [];
		foreach (AdminSetting::cases() as $setting) {
			$result[$setting->value] = $this->value($setting);
		}
		$result[KeyStore::SHARED_KEY] = $this->keys->sharedInfo();
		return $result;
	}

	/**
	 * Validates and stores some admin settings. Nothing is stored unless every value is valid.
	 *
	 * A new address of the organisation provider deletes its stored API key: the key was confirmed with the
	 * administrator's password for the old address.
	 *
	 * @param array<array-key, mixed> $patch setting key → new value
	 * @return array<string, mixed> getAdmin()
	 * @throws ApiException invalid_argument or url_not_allowed, naming the setting
	 */
	public function setAdmin(array $patch): array {
		$clean = [];
		foreach ($patch as $key => $value) {
			$setting = is_string($key) ? AdminSetting::tryFrom($key) : null;
			if ($setting === null) {
				throw $this->invalid((string)$key);
			}
			$clean[$key] = [$setting, $value];
		}
		$sharedAllowLocal = array_key_exists(AdminSetting::SharedAllowLocal->value, $clean) && is_bool($clean[AdminSetting::SharedAllowLocal->value][1])
			? $clean[AdminSetting::SharedAllowLocal->value][1] : $this->sharedAllowLocal();
		$validated = [];
		foreach ($clean as $key => [$setting, $value]) {
			$validated[$key] = [$setting, $this->validate($setting, $value, $sharedAllowLocal)];
		}
		$provider = $validated[AdminSetting::SharedProvider->value][1] ?? null;
		if (is_array($provider) && !ProviderConfig::sameEndpoint($this->sharedProvider(), ProviderConfig::fromStored($provider, true))) {
			$this->keys->setShared(null);
		}
		foreach ($validated as [$setting, $value]) {
			$key = $setting->value;
			$lazy = $setting->definition()->lazy;
			match ($setting->definition()->type) {
				SettingDefinition::BOOL => $this->appConfig->setValueBool(Application::APP_ID, $key, (bool)$value),
				SettingDefinition::INT => $this->appConfig->setValueInt(Application::APP_ID, $key, (int)$value),
				SettingDefinition::ENUM => $this->appConfig->setValueString(Application::APP_ID, $key, (string)$value),
				SettingDefinition::TEXT => $this->appConfig->setValueString(Application::APP_ID, $key, (string)$value, $lazy),
				default => is_array($value) ? $this->appConfig->setValueArray(Application::APP_ID, $key, $value, $lazy) : null,
			};
		}
		return $this->getAdmin();
	}

	/**
	 * The value to store for a setting.
	 *
	 * @throws ApiException
	 */
	private function validate(AdminSetting $setting, mixed $value, bool $sharedAllowLocal): mixed {
		$key = $setting->value;
		$definition = $setting->definition();
		switch ($definition->type) {
			case SettingDefinition::BOOL:
				if (!is_bool($value)) {
					throw $this->invalid($key);
				}
				return $value;
			case SettingDefinition::INT:
				if (!is_int($value)) {
					throw $this->invalid($key);
				}
				if ($definition->zeroDisables && $value === 0) {
					return 0;
				}
				if ($value < $definition->min || $value > $definition->max) {
					throw $this->invalid($key);
				}
				return $value;
			case SettingDefinition::ENUM:
				if (!is_string($value) || !in_array($value, $definition->values, true)) {
					throw $this->invalid($key);
				}
				return $value;
			case SettingDefinition::TEXT:
				if (!is_string($value) || mb_strlen($value) > $definition->maxLength) {
					throw $this->invalid($key);
				}
				// control characters are removed, line breaks are kept
				return trim((string)preg_replace('/[^\P{Cc}\n]/u', '', $value));
			case SettingDefinition::GROUPS:
				return $this->validateGroups($key, $value);
			case SettingDefinition::MODELS:
				return $this->validateModels($key, $value);
			case SettingDefinition::URLS:
				if (!is_array($value) || count($value) > 20) {
					throw $this->invalid($key);
				}
				$urls = [];
				foreach ($value as $url) {
					$normalized = is_string($url) ? $this->urlGuard->normalize($url) : null;
					if ($normalized === null) {
						throw $this->invalid($key);
					}
					$urls[] = $normalized;
				}
				return array_values(array_unique($urls));
			case SettingDefinition::PROVIDER:
				if ($value === null || $value === []) {
					return [];
				}
				if (!is_array($value)) {
					throw $this->invalid($key);
				}
				$provider = $this->providers->validate($key, $value, 'shared', $sharedAllowLocal, [])->toArray();
				$label = $value['label'] ?? '';
				if (!is_string($label) || mb_strlen($label) > 64) {
					throw $this->invalid($key);
				}
				$provider['label'] = trim((string)preg_replace('/\p{Cc}/u', '', $label));
				return $provider;
		}
		throw $this->invalid($key);
	}

	/**
	 * The existing groups of a list of group ids; unknown groups are dropped.
	 *
	 * @return list<string>
	 * @throws ApiException
	 */
	private function validateGroups(string $key, mixed $value): array {
		if (!is_array($value) || count($value) > 200) {
			throw $this->invalid($key);
		}
		$groups = [];
		foreach ($value as $gid) {
			if (!is_string($gid) || $gid === '' || strlen($gid) > 255) {
				throw $this->invalid($key);
			}
			if ($this->groupManager->groupExists($gid)) {
				$groups[] = $gid;
			}
		}
		return array_values(array_unique($groups));
	}

	/**
	 * @return list<string>
	 * @throws ApiException
	 */
	private function validateModels(string $key, mixed $value): array {
		if (!is_array($value) || count($value) > 50) {
			throw $this->invalid($key);
		}
		$models = [];
		foreach ($value as $model) {
			if (!is_string($model) || !ProviderValidator::isValidModel($model)) {
				throw $this->invalid($key);
			}
			$models[] = $model;
		}
		return array_values(array_unique($models));
	}

	private function invalid(string $field): ApiException {
		return ApiException::invalidArgument($field, $this->l->t('Invalid value'));
	}

	// Online games

	/** Whether online games are enabled for the user (an empty group list means everyone). */
	public function isMultiplayerEnabledFor(string $uid): bool {
		if (!$this->bool(AdminSetting::MultiplayerEnabled)) {
			return false;
		}
		return $this->inGroups($uid, $this->list(AdminSetting::MultiplayerGroups));
	}

	/**
	 * Whether a user is in one of the groups; an empty list means everyone.
	 *
	 * @param list<string> $groups
	 */
	public function inGroups(string $uid, array $groups): bool {
		if ($groups === []) {
			return true;
		}
		if ($this->userManager->get($uid) === null) {
			return false;
		}
		foreach ($groups as $gid) {
			if ($this->groupManager->isInGroup($uid, $gid)) {
				return true;
			}
		}
		return false;
	}

	public function openChallengesEnabled(): bool {
		return $this->bool(AdminSetting::OpenChallenges);
	}

	public function ratedEnabled(): bool {
		return $this->bool(AdminSetting::RatedEnabled);
	}

	public function chatEnabled(): bool {
		return $this->bool(AdminSetting::ChatEnabled);
	}

	public function inviteExpiryDays(): int {
		return $this->int(AdminSetting::InviteExpiryDays);
	}

	public function openExpiryDays(): int {
		return $this->int(AdminSetting::OpenExpiryDays);
	}

	public function maxActiveGames(): int {
		return $this->int(AdminSetting::MaxActiveGames);
	}

	public function chatRetentionDays(): int {
		return $this->int(AdminSetting::ChatRetentionDays);
	}

	/** Days after which finished games are deleted; 0 keeps them. */
	public function purgeFinishedDays(): int {
		return $this->int(AdminSetting::PurgeFinishedDays);
	}

	/** `off`, `opt-in` or `opt-out`. */
	public function leaderboardMode(): string {
		return $this->enum(AdminSetting::LeaderboardMode);
	}

	public function leaderboardMinGames(): int {
		return $this->int(AdminSetting::LeaderboardMinGames);
	}

	public function leaderboardActiveDays(): int {
		return $this->int(AdminSetting::LeaderboardActiveDays);
	}

	/** @return list<string> */
	public function leaderboardGroups(): array {
		return $this->list(AdminSetting::LeaderboardGroups);
	}

	// LLM integration

	public function ncAiEnabled(): bool {
		return $this->bool(AdminSetting::NcAiEnabled);
	}

	public function sharedEnabled(): bool {
		return $this->bool(AdminSetting::SharedEnabled);
	}

	/**
	 * The organisation provider, or null when none is configured.
	 */
	public function sharedProvider(): ?ProviderConfig {
		return ProviderConfig::fromStored($this->appConfig->getValueArray(Application::APP_ID, AdminSetting::SharedProvider->value, [], true), true);
	}

	/** @return list<string> */
	public function sharedGroups(): array {
		return $this->list(AdminSetting::SharedGroups);
	}

	/** Requests per day through the organisation provider, across all users; 0 means no limit. */
	public function sharedDailyCap(): int {
		return $this->int(AdminSetting::SharedDailyCap);
	}

	/** @return list<string> */
	public function sharedModelAllowlist(): array {
		return $this->list(AdminSetting::SharedModelAllowlist);
	}

	public function allowPersonalKeys(): bool {
		return $this->bool(AdminSetting::AllowPersonalKeys);
	}

	public function sharedAllowLocal(): bool {
		return $this->bool(AdminSetting::SharedAllowLocal);
	}

	/** @return list<string> */
	public function localAllowlist(): array {
		return $this->list(AdminSetting::LocalAllowlist);
	}

	public function aiRequestsPerHour(): int {
		return $this->int(AdminSetting::AiRequestsPerHour);
	}

	public function aiMaxOutputTokens(): int {
		return $this->int(AdminSetting::AiMaxOutputTokens);
	}

	public function aiSafetyIdentifier(): bool {
		return $this->bool(AdminSetting::AiSafetyIdentifier);
	}

	public function aiPrivacyNotice(): string {
		return $this->appConfig->getValueString(Application::APP_ID, AdminSetting::AiPrivacyNotice->value, '', true);
	}

	/**
	 * The app's internal HMAC key (64 hex digits), generated on first use and stored as a sensitive value.
	 */
	public function appSecret(): string {
		$secret = $this->appConfig->getValueString(Application::APP_ID, 'app_secret', '', true);
		if (preg_match('/^[0-9a-f]{64}$/', $secret) !== 1) {
			$secret = bin2hex(random_bytes(32));
			$this->appConfig->setValueString(Application::APP_ID, 'app_secret', $secret, true, true);
		}
		return $secret;
	}
}
