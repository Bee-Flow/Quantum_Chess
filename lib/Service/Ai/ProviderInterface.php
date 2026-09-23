<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

/**
 * One LLM provider (docs/SPEC.md §10.2).
 */
interface ProviderInterface {
	/**
	 * @param list<array{role: 'system'|'user'|'assistant', content: string}> $messages
	 * @param array{model: ?string, maxTokens: int, temperature: ?float, effort: ?string, safetyId: ?string, purpose: 'move'|'coach'} $options
	 * @return array{status: 'done', text: string}|array{status: 'pending', taskId: int}
	 * @throws ProviderException with an upstream code (§10.8)
	 */
	public function chat(array $messages, array $options): array;

	/**
	 * @return list<array{id: string, label: string}>
	 * @throws ProviderException
	 */
	public function listModels(): array;
}
