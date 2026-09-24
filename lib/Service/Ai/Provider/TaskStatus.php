<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * The state of a Nextcloud Assistant task of this app: still pending, done with the model's text, or failed with an
 * upstream error code.
 */
final class TaskStatus {
	public const PENDING = 'pending';
	public const DONE = 'done';
	public const ERROR = 'error';

	/**
	 * @param self::PENDING|self::DONE|self::ERROR $state
	 * @param 'move'|'coach' $purpose what the task was asked for
	 */
	private function __construct(
		public readonly string $state,
		public readonly string $purpose = 'move',
		public readonly string $text = '',
		public readonly ?int $durationMs = null,
		public readonly string $error = '',
	) {
	}

	public static function pending(): self {
		return new self(self::PENDING);
	}

	/**
	 * @param 'move'|'coach' $purpose
	 * @param int|null $durationMs how long the task ran, when known
	 */
	public static function done(string $purpose, string $text, ?int $durationMs): self {
		return new self(self::DONE, $purpose, $text, $durationMs);
	}

	/**
	 * @param string $error an `UpstreamError` code
	 */
	public static function failed(string $error): self {
		return new self(self::ERROR, error: $error);
	}
}
