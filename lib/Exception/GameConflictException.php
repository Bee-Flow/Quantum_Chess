<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Exception;

/**
 * A game changed between reading and writing it (`409 conflict`).
 *
 * Game rows carry a revision counter; a write succeeds only while the counter still has the value that was read.
 * Clients resolve a conflict by fetching the game again.
 */
class GameConflictException extends ApiException {
	/**
	 * @param array<string, mixed> $extra
	 */
	public function __construct(string $message, array $extra = []) {
		parent::__construct(ApiError::Conflict, $message, $extra);
	}

	/**
	 * @param array<string, mixed> $extra
	 */
	public function withExtra(array $extra): self {
		return new self($this->getMessage(), $extra);
	}
}
