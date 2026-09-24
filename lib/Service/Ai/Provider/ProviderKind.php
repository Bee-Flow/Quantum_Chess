<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * The API an LLM provider speaks.
 */
enum ProviderKind: string {
	/** The OpenAI chat completions API, which most hosted and local servers offer. */
	case OpenAi = 'openai';
	/** The Anthropic Messages API. */
	case Anthropic = 'anthropic';
	/** Nextcloud Assistant, through TaskProcessing. */
	case Nextcloud = 'nextcloud';
}
