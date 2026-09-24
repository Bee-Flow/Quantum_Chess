<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Player;

use OCA\QuantumChess\Exception\ApiException;
use OCP\IL10N;

/**
 * The in-app preferences of a user: one JSON object that the web app owns and the server stores as it is.
 */
class PreferencesService {
	/** The size limit of the encoded document. */
	public const MAX_BYTES = 16384;
	/** The user config key of the document. */
	public const KEY = 'preferences';

	public function __construct(
		private readonly UserDocumentStore $documents,
		private readonly IL10N $l,
	) {
	}

	/** @return array<string, mixed> */
	public function get(string $uid): array {
		return $this->documents->get($uid, self::KEY);
	}

	/**
	 * Replaces the preferences.
	 *
	 * @param array<array-key, mixed> $preferences
	 * @return array<string, mixed> the stored preferences
	 * @throws ApiException invalid_argument or too_large
	 */
	public function set(string $uid, array $preferences): array {
		if ($preferences !== [] && array_is_list($preferences)) {
			throw $this->notAnObject();
		}
		try {
			$this->documents->set($uid, self::KEY, $preferences, self::MAX_BYTES);
		} catch (\JsonException) {
			throw $this->notAnObject();
		} catch (DocumentTooLargeException) {
			throw ApiException::tooLarge($this->l->t('The preferences are too large.'));
		}
		return $this->get($uid);
	}

	private function notAnObject(): ApiException {
		return ApiException::invalidArgument('preferences', $this->l->t('Preferences must be an object.'));
	}
}
