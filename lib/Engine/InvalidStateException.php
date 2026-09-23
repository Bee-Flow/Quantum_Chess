<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine;

/**
 * A state that fails validation (ENGINE-RULES §2.7): the invariant is `shape` or `I1` … `I12`.
 */
class InvalidStateException extends \RuntimeException {
	public function __construct(
		private string $invariant,
		string $message = '',
	) {
		parent::__construct('invalid state: ' . $invariant . ($message !== '' ? ': ' . $message : ''));
	}

	/**
	 * `shape` or `I1` … `I12`.
	 */
	public function getInvariant(): string {
		return $this->invariant;
	}
}
