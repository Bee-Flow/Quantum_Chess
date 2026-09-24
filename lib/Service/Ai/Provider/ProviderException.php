<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * A failed call to an LLM provider.
 *
 * The message is for debug logs only and never contains API keys or response bodies.
 */
class ProviderException extends \RuntimeException {
	public function __construct(
		private readonly UpstreamError $error,
		string $message = '',
	) {
		parent::__construct($message !== '' ? $message : $error->value);
	}

	public function getError(): UpstreamError {
		return $this->error;
	}

	/** The error code, for example `invalid_key`. */
	public function getUpstream(): string {
		return $this->error->value;
	}
}
