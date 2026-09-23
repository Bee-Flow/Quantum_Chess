<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCP\Config\IUserConfig;
use OCP\IL10N;

/**
 * The in-app preference document, stored verbatim (docs/SPEC.md §11.3).
 */
class PreferencesService {
	public const MAX_BYTES = 16384;
	public const KEY = 'preferences';

	public function __construct(
		private IUserConfig $config,
		private IL10N $l,
	) {
	}

	/** @return array<string, mixed> */
	public function get(string $uid): array {
		$stored = json_decode($this->config->getValueString($uid, Application::APP_ID, self::KEY, '{}', true), true);
		return is_array($stored) ? $stored : [];
	}

	/**
	 * @param array<array-key, mixed> $preferences
	 * @return array<string, mixed>
	 */
	public function set(string $uid, array $preferences): array {
		if ($preferences !== [] && array_is_list($preferences)) {
			throw new ApiException('invalid_argument', $this->l->t('Preferences must be an object.'), 400, ['field' => 'preferences']);
		}
		$json = json_encode((object)$preferences, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		if ($json === false) {
			throw new ApiException('invalid_argument', $this->l->t('Preferences must be an object.'), 400, ['field' => 'preferences']);
		}
		if (strlen($json) > self::MAX_BYTES) {
			throw new ApiException('too_large', $this->l->t('The preferences are too large.'), 413);
		}
		$this->config->setValueString($uid, Application::APP_ID, self::KEY, $json, true);
		return $this->get($uid);
	}
}
