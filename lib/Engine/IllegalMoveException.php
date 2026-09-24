<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine;

/**
 * An illegal move (docs/engine-rules.md §4.11). The reason is the first failing `whyIllegal` code, for example
 * `blocked`. JavaScript twin: `IllegalMoveError` in src/engine/errors.js.
 */
class IllegalMoveException extends \RuntimeException {
	public function __construct(
		private string $reason,
		private mixed $move = null,
	) {
		parent::__construct('illegal move: ' . $reason);
	}

	/**
	 * The `whyIllegal` reason code (one of Engine::ILLEGAL_REASONS).
	 */
	public function getReason(): string {
		return $this->reason;
	}

	/**
	 * The rejected move input (a code string or a move array).
	 */
	public function getMove(): mixed {
		return $this->move;
	}
}
