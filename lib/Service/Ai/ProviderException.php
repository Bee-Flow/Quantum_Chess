<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

/**
 * An upstream failure with one of the codes of docs/SPEC.md §10.8. The message is for debug logs only and never
 * contains keys or upstream bodies.
 */
class ProviderException extends \RuntimeException {
	public const CODES = ['invalid_key', 'model_not_found', 'rate_limited', 'quota_exceeded', 'timeout', 'unreachable', 'bad_response', 'refused'];

	public function __construct(
		private string $upstream,
		string $message = '',
	) {
		parent::__construct($message !== '' ? $message : $upstream);
	}

	public function getUpstream(): string {
		return $this->upstream;
	}
}
