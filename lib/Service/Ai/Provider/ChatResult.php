<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * The answer of an LLM provider: the model's text, or the id of a scheduled Nextcloud Assistant task that the client
 * polls.
 */
final class ChatResult {
	private function __construct(
		public readonly ?string $text,
		public readonly ?int $taskId,
	) {
	}

	public static function done(string $text): self {
		return new self($text, null);
	}

	public static function pending(int $taskId): self {
		return new self(null, $taskId);
	}

	public function isPending(): bool {
		return $this->taskId !== null;
	}
}
