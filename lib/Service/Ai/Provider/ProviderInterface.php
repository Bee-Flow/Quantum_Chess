<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * An LLM provider: sends a chat to a model and lists the models it offers.
 */
interface ProviderInterface {
	/**
	 * Sends the messages to the model.
	 *
	 * In `$options`, `safetyId` is a pseudonymous user id for the provider's abuse detection and `effort` the reasoning
	 * effort of Anthropic models; either may be null.
	 *
	 * @param list<array{role: 'system'|'user'|'assistant', content: string}> $messages
	 * @param array{
	 *     model: ?string,
	 *     maxTokens: int,
	 *     temperature: ?float,
	 *     effort: ?string,
	 *     safetyId: ?string,
	 *     purpose: 'move'|'coach',
	 * } $options
	 * @throws ProviderException
	 */
	public function chat(array $messages, array $options): ChatResult;

	/**
	 * The models the provider offers.
	 *
	 * @return list<array{id: string, label: string}>
	 * @throws ProviderException
	 */
	public function listModels(): array;
}
