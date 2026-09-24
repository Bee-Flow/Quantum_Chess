<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Prompt;

/**
 * The personalities of the LLM opponents: their names and the part of the system prompt that gives them their voice.
 *
 * The ids, names and tolerances match the persona catalogue of the web app. The names are not translated.
 */
final class Personas {
	/**
	 * `tolerance`: how many percentage points of winning chance below the best candidate a move may be and still count
	 * as within the persona's strength.
	 *
	 * @var array<string, array{name: string, tolerance: int, block: string}>
	 */
	public const ALL = [
		'professor' => [
			'name' => 'Professor Qubit',
			'tolerance' => 4,
			'block' => 'Speak like a kind, enthusiastic teacher. In your comment, explain the idea of your move in one simple sentence. Praise good play; never mock.',
		],
		'captain' => [
			'name' => 'Captain Collapse',
			'tolerance' => 10,
			'block' => 'Talk like a cheerful, family-friendly pirate. You love rolls and attacking the king; choose them when they are ✓.',
		],
		'superposa' => [
			'name' => 'Madame Superposa',
			'tolerance' => 8,
			'block' => 'Speak as a theatrical fortune teller about fate and possibilities. Prefer split, merge and measure moves among ✓ candidates.',
		],
		'q7' => [
			'name' => 'Q-7',
			'tolerance' => 1,
			'block' => 'Speak like a polite minimalist robot. Choose candidate 1 unless another ✓ candidate is within 1 %. Mention exactly one number.',
		],
	];

	public static function exists(string $id): bool {
		return isset(self::ALL[$id]);
	}

	public static function name(string $id): string {
		return self::ALL[$id]['name'] ?? $id;
	}

	public static function block(string $id): string {
		return self::ALL[$id]['block'] ?? '';
	}
}
