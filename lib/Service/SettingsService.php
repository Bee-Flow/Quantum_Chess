<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\KeyStore;
use OCA\QuantumChess\Service\Ai\Presets;
use OCA\QuantumChess\Service\Ai\UrlGuard;
use OCA\QuantumChess\Service\Ai\UrlNotAllowedException;
use OCP\Config\IUserConfig;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUserManager;

/**
 * Typed access to every key of docs/SPEC.md §11 with its default and range (SPEC §6.5). App config keys are read and
 * written only here; secrets go through KeyStore and are never returned.
 */
class SettingsService {
	public const SOURCES = ['nextcloud', 'shared', 'personal'];

	/** Notification switch → user config key. */
	public const NOTIFY_KEYS = [
		'invites' => 'notify_invites',
		'yourTurn' => 'notify_your_turn',
		'reminders' => 'notify_reminders',
		'drawOffers' => 'notify_draw_offers',
		'results' => 'notify_results',
		'chat' => 'notify_chat',
		'previews' => 'notify_previews',
	];

	/**
	 * Admin keys of §11.1: [type, default, extra…]. Types: bool, int (min, max), enum (values), groups, models, urls,
	 * provider, text (max length). `purge_finished_days` accepts 0 or 30–3650.
	 */
	private const ADMIN = [
		'mp_enabled' => ['bool', true],
		'mp_groups' => ['groups', []],
		'open_challenges' => ['bool', true],
		'rated_enabled' => ['bool', true],
		'invite_expiry_days' => ['int', 14, 1, 60],
		'open_expiry_days' => ['int', 7, 1, 30],
		'max_active_games' => ['int', 30, 1, 200],
		'chat_enabled' => ['bool', true],
		'chat_retention_days' => ['int', 90, 1, 3650],
		'purge_finished_days' => ['int', 0, 30, 3650],
		'leaderboard_mode' => ['enum', 'opt-in', ['off', 'opt-in', 'opt-out']],
		'leaderboard_min_games' => ['int', 5, 1, 100],
		'leaderboard_active_days' => ['int', 90, 1, 3650],
		'leaderboard_groups' => ['groups', []],
		'nc_ai_enabled' => ['bool', true],
		'shared_enabled' => ['bool', false],
		'shared_provider' => ['provider', []],
		'shared_groups' => ['groups', []],
		'shared_daily_cap' => ['int', 1000, 0, 1000000],
		'shared_model_allowlist' => ['models', []],
		'allow_personal_keys' => ['bool', true],
		'shared_allow_local' => ['bool', false],
		'local_allowlist' => ['urls', []],
		'ai_requests_per_hour' => ['int', 60, 1, 1000],
		'ai_max_output_tokens' => ['int', 800, 100, 4000],
		'ai_safety_identifier' => ['bool', false],
		'ai_privacy_notice' => ['text', '', 1000],
	];

	/** Lazy admin keys (read only when needed). */
	private const LAZY = ['shared_provider', 'ai_privacy_notice'];

	public function __construct(
		private IAppConfig $appConfig,
		private IUserConfig $userConfig,
		private IGroupManager $groupManager,
		private IUserManager $userManager,
		private IL10N $l,
		private KeyStore $keys,
		private UrlGuard $urlGuard,
		private RatingService $ratings,
	) {
	}

	// ------------------------------------------------------------------ low-level typed access

	private function bool(string $key): bool {
		return $this->appConfig->getValueBool(Application::APP_ID, $key, (bool)self::ADMIN[$key][1]);
	}

	private function int(string $key): int {
		$spec = self::ADMIN[$key];
		$default = (int)$spec[1];
		$min = (int)($spec[2] ?? 0);
		$max = $spec[3] ?? PHP_INT_MAX;
		$value = $this->appConfig->getValueInt(Application::APP_ID, $key, $default);
		if ($key === 'purge_finished_days') {
			return $value <= 0 ? 0 : max($min, min($max, $value));
		}
		return max($min, min($max, $value));
	}

	private function enum(string $key): string {
		$default = (string)self::ADMIN[$key][1];
		$value = $this->appConfig->getValueString(Application::APP_ID, $key, $default);
		return in_array($value, (array)self::ADMIN[$key][2], true) ? $value : $default;
	}

	/** @return list<string> */
	private function list(string $key): array {
		$value = $this->appConfig->getValueArray(Application::APP_ID, $key, [], in_array($key, self::LAZY, true));
		return array_values(array_filter($value, 'is_string'));
	}

	/**
	 * The value of one admin key, typed, with its default.
	 */
	private function value(string $key): mixed {
		return match (self::ADMIN[$key][0]) {
			'bool' => $this->bool($key),
			'int' => $this->int($key),
			'enum' => $this->enum($key),
			'text' => $this->appConfig->getValueString(Application::APP_ID, $key, '', true),
			'provider' => $this->sharedProvider(),
			default => $this->list($key),
		};
	}

	// ------------------------------------------------------------------ admin page

	/**
	 * Every admin key of §11.1 with its value; the secret as {hasKey, keyHint, keyUnreadable}.
	 *
	 * @return array<string, mixed>
	 */
	public function getAdmin(): array {
		$result = [];
		foreach (array_keys(self::ADMIN) as $key) {
			$result[$key] = $this->value($key);
		}
		$result[KeyStore::SHARED_KEY] = $this->keys->sharedInfo();
		return $result;
	}

	/**
	 * Validate and store a partial set of non-secret admin keys.
	 *
	 * @param array<string, mixed> $patch
	 * @return array<string, mixed> getAdmin()
	 * @throws ApiException 400 invalid_argument / url_not_allowed
	 */
	public function setAdmin(array $patch): array {
		$clean = [];
		foreach ($patch as $key => $value) {
			if (!is_string($key) || !isset(self::ADMIN[$key])) {
				throw $this->invalid((string)$key);
			}
			$clean[$key] = $value;
		}
		$sharedAllowLocal = array_key_exists('shared_allow_local', $clean) && is_bool($clean['shared_allow_local'])
			? $clean['shared_allow_local'] : $this->sharedAllowLocal();
		$validated = [];
		foreach ($clean as $key => $value) {
			$validated[$key] = $this->validateAdmin($key, $value, $sharedAllowLocal);
		}
		foreach ($validated as $key => $value) {
			$lazy = in_array($key, self::LAZY, true);
			match (self::ADMIN[$key][0]) {
				'bool' => $this->appConfig->setValueBool(Application::APP_ID, $key, (bool)$value),
				'int' => $this->appConfig->setValueInt(Application::APP_ID, $key, (int)$value),
				'enum' => $this->appConfig->setValueString(Application::APP_ID, $key, (string)$value),
				'text' => $this->appConfig->setValueString(Application::APP_ID, $key, (string)$value, $lazy),
				default => is_array($value) ? $this->appConfig->setValueArray(Application::APP_ID, $key, $value, $lazy) : null,
			};
		}
		return $this->getAdmin();
	}

	/**
	 * @throws ApiException
	 */
	private function validateAdmin(string $key, mixed $value, bool $sharedAllowLocal): mixed {
		$spec = self::ADMIN[$key];
		switch ($spec[0]) {
			case 'bool':
				if (!is_bool($value)) {
					throw $this->invalid($key);
				}
				return $value;
			case 'int':
				if (!is_int($value)) {
					throw $this->invalid($key);
				}
				if ($key === 'purge_finished_days' && $value === 0) {
					return 0;
				}
				if ($value < $spec[2] || $value > $spec[3]) {
					throw $this->invalid($key);
				}
				return $value;
			case 'enum':
				if (!is_string($value) || !in_array($value, $spec[2], true)) {
					throw $this->invalid($key);
				}
				return $value;
			case 'text':
				if (!is_string($value) || mb_strlen($value) > $spec[2]) {
					throw $this->invalid($key);
				}
				return trim((string)preg_replace('/[^\P{Cc}\n]/u', '', $value));
			case 'groups':
				return $this->validateGroups($key, $value);
			case 'models':
				return $this->validateModels($key, $value);
			case 'urls':
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
			case 'provider':
				if ($value === null || $value === []) {
					return [];
				}
				if (!is_array($value)) {
					throw $this->invalid($key);
				}
				$provider = $this->validateProvider($key, $value, 'shared', $sharedAllowLocal, []);
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
			if (!is_string($model) || !self::isValidModel($model)) {
				throw $this->invalid($key);
			}
			$models[] = $model;
		}
		return array_values(array_unique($models));
	}

	public static function isValidModel(string $model): bool {
		return preg_match('/^[A-Za-z0-9][A-Za-z0-9._:\/@+-]{0,127}$/', $model) === 1;
	}

	/**
	 * A provider object {preset, kind, baseUrl, model}: the preset decides the kind and, for hosted presets, the URL.
	 *
	 * @param array<array-key, mixed> $value
	 * @param 'shared'|'personal' $scope
	 * @param list<string> $allowlist
	 * @return array{preset: string, kind: string, baseUrl: string, model: string}
	 * @throws ApiException
	 */
	private function validateProvider(string $field, array $value, string $scope, bool $sharedAllowLocal, array $allowlist): array {
		$presetId = $value['preset'] ?? null;
		if (!is_string($presetId) || !Presets::exists($presetId)) {
			throw $this->invalid($field);
		}
		$preset = Presets::get($presetId);
		$model = $value['model'] ?? '';
		if (!is_string($model) || ($model !== '' && !self::isValidModel($model))) {
			throw $this->invalid($field);
		}
		if ($preset['fixedUrl']) {
			$baseUrl = $preset['baseUrl'];
		} else {
			$url = $value['baseUrl'] ?? '';
			if (!is_string($url) || trim($url) === '') {
				throw $this->invalid($field);
			}
			try {
				$baseUrl = $this->urlGuard->check($url, $scope, $sharedAllowLocal, $allowlist)['url'];
			} catch (UrlNotAllowedException $e) {
				throw new ApiException('url_not_allowed', $this->urlMessage($e->getMessage()), 400, ['field' => $field]);
			}
		}
		return ['preset' => $presetId, 'kind' => $preset['kind'], 'baseUrl' => $baseUrl, 'model' => $model];
	}

	public function urlMessage(string $reason): string {
		return match ($reason) {
			'https_required' => $this->l->t('The address must start with https://.'),
			'local' => $this->l->t('This local address is not allowed. Ask your administrator to add it to the list of allowed local servers.'),
			default => $this->l->t('This is not a valid server address.'),
		};
	}

	/**
	 * Store (value) or delete ('' or null) an admin secret. Only `shared_api_key` exists.
	 *
	 * @return array{hasKey: bool, keyHint: ?string, keyUnreadable: bool}
	 * @throws ApiException
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

	// ------------------------------------------------------------------ multiplayer (used by the game backend)

	public function isMultiplayerEnabledFor(string $uid): bool {
		if (!$this->bool('mp_enabled')) {
			return false;
		}
		return $this->inGroups($uid, $this->list('mp_groups'));
	}

	/**
	 * Whether a user is in one of the groups (an empty list means everyone).
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
		return $this->bool('open_challenges');
	}

	public function ratedEnabled(): bool {
		return $this->bool('rated_enabled');
	}

	public function chatEnabled(): bool {
		return $this->bool('chat_enabled');
	}

	public function inviteExpiryDays(): int {
		return $this->int('invite_expiry_days');
	}

	public function openExpiryDays(): int {
		return $this->int('open_expiry_days');
	}

	public function maxActiveGames(): int {
		return $this->int('max_active_games');
	}

	public function chatRetentionDays(): int {
		return $this->int('chat_retention_days');
	}

	public function purgeFinishedDays(): int {
		return $this->int('purge_finished_days');
	}

	public function leaderboardMode(): string {
		return (string)$this->value('leaderboard_mode');
	}

	public function leaderboardMinGames(): int {
		return $this->int('leaderboard_min_games');
	}

	public function leaderboardActiveDays(): int {
		return $this->int('leaderboard_active_days');
	}

	/** @return list<string> */
	public function leaderboardGroups(): array {
		return $this->list('leaderboard_groups');
	}

	/**
	 * The personal invite policy is deferred to 1.1 (docs/LEAN-1.0.md): everyone who may play online can invite.
	 */
	public function invitePolicy(string $uid): string {
		return 'everyone';
	}

	/**
	 * The block list is deferred to 1.1 (docs/LEAN-1.0.md).
	 *
	 * @return list<string>
	 */
	public function blockedUsers(string $uid): array {
		return [];
	}

	/** @return array{invites: bool, yourTurn: bool, reminders: bool, drawOffers: bool, results: bool, chat: bool, previews: bool} */
	public function notificationSwitches(string $uid): array {
		$get = fn (string $key): bool => $this->userConfig->getValueBool($uid, Application::APP_ID, $key, true);
		return [
			'invites' => $get('notify_invites'),
			'yourTurn' => $get('notify_your_turn'),
			'reminders' => $get('notify_reminders'),
			'drawOffers' => $get('notify_draw_offers'),
			'results' => $get('notify_results'),
			'chat' => $get('notify_chat'),
			'previews' => $get('notify_previews'),
		];
	}

	/** @return array{invitePolicy: string, blocked: list<array>, listed: ?bool, leaderboardMode: string, notifications: array<string, bool>} */
	public function getMultiplayer(string $uid): array {
		return [
			'invitePolicy' => $this->invitePolicy($uid),
			'blocked' => [],
			'listed' => $this->ratings->get($uid)['listed'] ?? null,
			'leaderboardMode' => $this->leaderboardMode(),
			'notifications' => $this->notificationSwitches($uid),
		];
	}

	/**
	 * @param array<string, mixed> $patch {listed?: bool|null, notifications?: {<switch>: bool}}
	 * @return array<string, mixed> getMultiplayer()
	 * @throws ApiException
	 */
	public function setMultiplayer(string $uid, array $patch): array {
		foreach (array_keys($patch) as $key) {
			if (!in_array($key, ['listed', 'notifications'], true)) {
				throw $this->invalid((string)$key);
			}
		}
		$switches = [];
		if (array_key_exists('notifications', $patch)) {
			if (!is_array($patch['notifications'])) {
				throw $this->invalid('notifications');
			}
			foreach ($patch['notifications'] as $name => $on) {
				if (!is_string($name) || !isset(self::NOTIFY_KEYS[$name]) || !is_bool($on)) {
					throw $this->invalid('notifications');
				}
				$switches[self::NOTIFY_KEYS[$name]] = $on;
			}
		}
		if (array_key_exists('listed', $patch) && $patch['listed'] !== null && !is_bool($patch['listed'])) {
			throw $this->invalid('listed');
		}
		foreach ($switches as $key => $on) {
			$this->userConfig->setValueBool($uid, Application::APP_ID, $key, $on);
		}
		if (array_key_exists('listed', $patch)) {
			$this->ratings->setListed($uid, $patch['listed']);
		}
		return $this->getMultiplayer($uid);
	}

	// ------------------------------------------------------------------ AI (admin)

	public function ncAiEnabled(): bool {
		return $this->bool('nc_ai_enabled');
	}

	public function sharedEnabled(): bool {
		return $this->bool('shared_enabled');
	}

	/**
	 * The organisation provider, or null when none is configured.
	 *
	 * @return array{preset: string, kind: string, baseUrl: string, model: string, label: string}|null
	 */
	public function sharedProvider(): ?array {
		$value = $this->appConfig->getValueArray(Application::APP_ID, 'shared_provider', [], true);
		if (!is_string($value['preset'] ?? null) || !Presets::exists($value['preset']) || !is_string($value['baseUrl'] ?? null) || $value['baseUrl'] === '') {
			return null;
		}
		return [
			'preset' => $value['preset'],
			'kind' => Presets::get($value['preset'])['kind'],
			'baseUrl' => $value['baseUrl'],
			'model' => is_string($value['model'] ?? null) ? $value['model'] : '',
			'label' => is_string($value['label'] ?? null) ? $value['label'] : '',
		];
	}

	/** @return list<string> */
	public function sharedGroups(): array {
		return $this->list('shared_groups');
	}

	public function sharedDailyCap(): int {
		return $this->int('shared_daily_cap');
	}

	/** @return list<string> */
	public function sharedModelAllowlist(): array {
		return $this->list('shared_model_allowlist');
	}

	public function allowPersonalKeys(): bool {
		return $this->bool('allow_personal_keys');
	}

	public function sharedAllowLocal(): bool {
		return $this->bool('shared_allow_local');
	}

	/** @return list<string> */
	public function localAllowlist(): array {
		return $this->list('local_allowlist');
	}

	public function aiRequestsPerHour(): int {
		return $this->int('ai_requests_per_hour');
	}

	public function aiMaxOutputTokens(): int {
		return $this->int('ai_max_output_tokens');
	}

	public function aiSafetyIdentifier(): bool {
		return $this->bool('ai_safety_identifier');
	}

	public function aiPrivacyNotice(): string {
		return $this->appConfig->getValueString(Application::APP_ID, 'ai_privacy_notice', '', true);
	}

	/**
	 * The internal HMAC key (64 hex digits), generated on first use.
	 */
	public function appSecret(): string {
		$secret = $this->appConfig->getValueString(Application::APP_ID, 'app_secret', '', true);
		if (preg_match('/^[0-9a-f]{64}$/', $secret) !== 1) {
			$secret = bin2hex(random_bytes(32));
			$this->appConfig->setValueString(Application::APP_ID, 'app_secret', $secret, true, true);
		}
		return $secret;
	}

	// ------------------------------------------------------------------ AI (personal)

	/**
	 * The user's own provider, or null.
	 *
	 * @return array{preset: string, kind: string, baseUrl: string, model: string}|null
	 */
	public function personalProvider(string $uid): ?array {
		$value = $this->userConfig->getValueArray($uid, Application::APP_ID, 'ai_provider', [], true);
		if (!is_string($value['preset'] ?? null) || !Presets::exists($value['preset']) || !is_string($value['baseUrl'] ?? null) || $value['baseUrl'] === '') {
			return null;
		}
		return [
			'preset' => $value['preset'],
			'kind' => Presets::get($value['preset'])['kind'],
			'baseUrl' => $value['baseUrl'],
			'model' => is_string($value['model'] ?? null) ? $value['model'] : '',
		];
	}

	public function defaultSource(string $uid): ?string {
		$source = $this->userConfig->getValueString($uid, Application::APP_ID, 'ai_default_source', '');
		return in_array($source, self::SOURCES, true) ? $source : null;
	}

	/** @return list<string> */
	public function noticeAcked(string $uid): array {
		$ack = $this->userConfig->getValueArray($uid, Application::APP_ID, 'ai_notice_ack', []);
		return array_values(array_intersect(self::SOURCES, $ack));
	}

	/** @return list<string> */
	public function ackNotice(string $uid, string $source): array {
		$ack = $this->noticeAcked($uid);
		if (!in_array($source, $ack, true)) {
			$ack[] = $source;
			$this->userConfig->setValueArray($uid, Application::APP_ID, 'ai_notice_ack', $ack);
		}
		return $ack;
	}

	/**
	 * The personal settings (§7.4.8) without `sources`, which the controller adds from AiSourceService.
	 *
	 * @return array<string, mixed>
	 */
	public function getPersonal(string $uid): array {
		$info = $this->keys->personalInfo($uid);
		return [
			'allowPersonalKeys' => $this->allowPersonalKeys(),
			'provider' => $this->personalProvider($uid),
			'hasKey' => $info['hasKey'],
			'keyHint' => $info['keyHint'],
			'keyUnreadable' => $info['keyUnreadable'],
			'defaultSource' => $this->defaultSource($uid),
			'presets' => Presets::publicList(),
			'localAllowlist' => $this->localAllowlist(),
		];
	}

	/**
	 * @param array<string, mixed> $patch {provider?: {preset, kind, baseUrl, model}|null, apiKey?: string|null, defaultSource?: string|null}
	 * @return array<string, mixed> getPersonal()
	 * @throws ApiException
	 */
	public function setPersonal(string $uid, array $patch): array {
		foreach (array_keys($patch) as $key) {
			if (!in_array($key, ['provider', 'apiKey', 'defaultSource'], true)) {
				throw $this->invalid((string)$key);
			}
		}
		$provider = false;
		if (array_key_exists('provider', $patch)) {
			if ($patch['provider'] === null) {
				$provider = null;
			} elseif (is_array($patch['provider'])) {
				if (!$this->allowPersonalKeys()) {
					throw new ApiException('ai_unavailable', $this->l->t('Your administrator does not allow personal AI providers.'), 403, ['reason' => 'disabled']);
				}
				$provider = $this->validateProvider('provider', $patch['provider'], 'personal', false, $this->localAllowlist());
			} else {
				throw $this->invalid('provider');
			}
		}
		$apiKey = $patch['apiKey'] ?? null;
		if ($apiKey !== null) {
			if (!is_string($apiKey) || ($apiKey !== '' && !KeyStore::isValidKey(trim($apiKey)))) {
				throw $this->invalid('apiKey');
			}
			if ($apiKey !== '' && !$this->allowPersonalKeys()) {
				throw new ApiException('ai_unavailable', $this->l->t('Your administrator does not allow personal AI providers.'), 403, ['reason' => 'disabled']);
			}
		}
		$default = false;
		if (array_key_exists('defaultSource', $patch)) {
			$default = $patch['defaultSource'];
			if ($default !== null && $default !== '' && (!is_string($default) || !in_array($default, self::SOURCES, true))) {
				throw $this->invalid('defaultSource');
			}
		}
		if ($provider === null) {
			$this->userConfig->deleteUserConfig($uid, Application::APP_ID, 'ai_provider');
		} elseif (is_array($provider)) {
			$this->userConfig->setValueArray($uid, Application::APP_ID, 'ai_provider', $provider, true);
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
	 * Validate a provider for the connection test without storing it.
	 *
	 * @param array<array-key, mixed> $value
	 * @param 'shared'|'personal' $scope
	 * @return array{preset: string, kind: string, baseUrl: string, model: string}
	 * @throws ApiException
	 */
	public function checkProvider(array $value, string $scope): array {
		return $this->validateProvider('baseUrl', $value, $scope, $this->sharedAllowLocal(), $this->localAllowlist());
	}

	private function invalid(string $field): ApiException {
		return new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => $field]);
	}
}
