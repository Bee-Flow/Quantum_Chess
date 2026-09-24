<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Request;

use OCA\QuantumChess\Service\Ai\Provider\ProviderConnection;

/**
 * A validated request for the LLM opponent or the coach: where it goes, the model the client asked for, the position
 * and the fields of the prompt.
 *
 * @template-covariant TPrompt of array<string, mixed>
 */
final class LlmRequest {
	/**
	 * @param string|null $model the model the client asked for; used only where the source allows a choice
	 * @param array<string, mixed> $state the validated engine state
	 * @param TPrompt $prompt the fields that PromptBuilder turns into the prompt
	 */
	public function __construct(
		public readonly ProviderConnection $connection,
		public readonly ?string $model,
		public readonly array $state,
		public readonly array $prompt,
	) {
	}
}
