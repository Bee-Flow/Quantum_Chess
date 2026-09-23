<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCP\Config\IUserConfig;
use OCP\IAppConfig;
use OCP\Security\ICrypto;

/**
 * API keys (docs/SPEC.md §10.7): encrypted with ICrypto and stored as sensitive, lazy values. Keys are never returned
 * by any API, never logged and never sent to the browser; callers only get `{hasKey, keyHint, keyUnreadable}`.
 */
class KeyStore {
	public const SHARED_KEY = 'shared_api_key';
	public const PERSONAL_KEY = 'ai_api_key';
	public const MAX_LENGTH = 1024;

	public function __construct(
		private IAppConfig $appConfig,
		private IUserConfig $userConfig,
		private ICrypto $crypto,
	) {
	}

	/**
	 * The organisation key in clear text, or null when none is stored or it cannot be decrypted.
	 */
	public function getShared(): ?string {
		return $this->decrypt($this->appConfig->getValueString(Application::APP_ID, self::SHARED_KEY, '', true));
	}

	/** @return array{hasKey: bool, keyHint: ?string, keyUnreadable: bool} */
	public function sharedInfo(): array {
		return $this->info($this->appConfig->getValueString(Application::APP_ID, self::SHARED_KEY, '', true));
	}

	/**
	 * Store ('' or null deletes) the organisation key.
	 */
	public function setShared(?string $value): void {
		if ($value === null || $value === '') {
			$this->appConfig->deleteKey(Application::APP_ID, self::SHARED_KEY);
			return;
		}
		$this->appConfig->setValueString(Application::APP_ID, self::SHARED_KEY, $this->crypto->encrypt($value), true, true);
	}

	public function getPersonal(string $uid): ?string {
		return $this->decrypt($this->userConfig->getValueString($uid, Application::APP_ID, self::PERSONAL_KEY, '', true));
	}

	/** @return array{hasKey: bool, keyHint: ?string, keyUnreadable: bool} */
	public function personalInfo(string $uid): array {
		return $this->info($this->userConfig->getValueString($uid, Application::APP_ID, self::PERSONAL_KEY, '', true));
	}

	public function setPersonal(string $uid, ?string $value): void {
		if ($value === null || $value === '') {
			$this->userConfig->deleteUserConfig($uid, Application::APP_ID, self::PERSONAL_KEY);
			return;
		}
		$this->userConfig->setValueString($uid, Application::APP_ID, self::PERSONAL_KEY, $this->crypto->encrypt($value), true, IUserConfig::FLAG_SENSITIVE);
	}

	/**
	 * Whether a key is acceptable: printable ASCII without spaces, 1–1024 characters.
	 */
	public static function isValidKey(string $value): bool {
		return strlen($value) <= self::MAX_LENGTH && preg_match('/^[\x21-\x7e]+$/', $value) === 1;
	}

	private function decrypt(string $stored): ?string {
		if ($stored === '') {
			return null;
		}
		try {
			$plain = $this->crypto->decrypt($stored);
		} catch (\Throwable) {
			return null;
		}
		return $plain === '' ? null : $plain;
	}

	/** @return array{hasKey: bool, keyHint: ?string, keyUnreadable: bool} */
	private function info(string $stored): array {
		if ($stored === '') {
			return ['hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false];
		}
		$plain = $this->decrypt($stored);
		if ($plain === null) {
			return ['hasKey' => true, 'keyHint' => null, 'keyUnreadable' => true];
		}
		return ['hasKey' => true, 'keyHint' => strlen($plain) >= 8 ? substr($plain, -4) : null, 'keyUnreadable' => false];
	}
}
