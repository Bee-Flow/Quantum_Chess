<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine;

/**
 * A setup position that cannot be built (docs/engine-rules.md Appendix A). The reason is one of Engine::SETUP_ERRORS;
 * the detail is the `whyIllegal` code for `prelude_illegal`, otherwise a short description or null. JavaScript twin:
 * `SetupError` in src/engine/errors.js.
 */
class SetupException extends \RuntimeException {
	public function __construct(
		private string $reason,
		private ?string $detail = null,
	) {
		parent::__construct(
			'setup failed: ' . $reason . ($detail !== null && $detail !== '' ? ' (' . $detail . ')' : ''),
		);
	}

	/**
	 * One of Engine::SETUP_ERRORS.
	 */
	public function getReason(): string {
		return $this->reason;
	}

	/**
	 * The `whyIllegal` code for `prelude_illegal`; otherwise a short description, or null.
	 */
	public function getDetail(): ?string {
		return $this->detail;
	}
}
