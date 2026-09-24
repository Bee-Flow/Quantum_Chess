<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

/**
 * Where an LLM request goes: Nextcloud Assistant, the provider the administrator configured for the organisation,
 * or the user's own API key.
 *
 * The order of the cases is the order in which the API lists the sources and picks the default one.
 */
enum AiSource: string {
	case Nextcloud = 'nextcloud';
	case Shared = 'shared';
	case Personal = 'personal';

	/**
	 * The values of all sources, in order.
	 *
	 * @return list<string>
	 */
	public static function values(): array {
		return array_map(static fn (self $source): string => $source->value, self::cases());
	}
}
