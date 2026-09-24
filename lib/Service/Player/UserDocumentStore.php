<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Player;

use OCA\QuantumChess\AppInfo\Application;
use OCP\Config\IUserConfig;

/**
 * JSON documents stored per user in the user config, such as the in-app preferences and the trainer progress.
 *
 * Documents are JSON objects, stored as lazy values and encoded without escaping slashes or Unicode.
 */
class UserDocumentStore {
	public function __construct(
		private readonly IUserConfig $config,
	) {
	}

	/**
	 * The document stored under `$key`, or an empty one.
	 *
	 * @return array<string, mixed>
	 */
	public function get(string $uid, string $key): array {
		$stored = json_decode($this->config->getValueString($uid, Application::APP_ID, $key, '{}', true), true);
		return is_array($stored) ? $stored : [];
	}

	/**
	 * Stores `$document` under `$key` as a JSON object.
	 *
	 * @param array<array-key, mixed> $document
	 * @param int $maxBytes the size limit of the encoded document
	 * @throws \JsonException when the document cannot be encoded
	 * @throws DocumentTooLargeException when the encoded document is larger than `$maxBytes`
	 */
	public function set(string $uid, string $key, array $document, int $maxBytes = PHP_INT_MAX): void {
		$json = json_encode((object)$document, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
		if (strlen($json) > $maxBytes) {
			throw new DocumentTooLargeException();
		}
		$this->config->setValueString($uid, Application::APP_ID, $key, $json, true);
	}
}
