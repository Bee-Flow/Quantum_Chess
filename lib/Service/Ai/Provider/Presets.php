<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * The providers that users can pick from a list, with their API, base URL and suggested models.
 *
 * The suggested models are a starting point for the model field; the provider's own model list always wins.
 */
final class Presets {
	/**
	 * `fixedUrl`: the base URL cannot be changed. `local`: a local server, which needs an allow-list entry.
	 * `tokenParam`: the name of the output token limit in the request body.
	 *
	 * @var array<string, array{
	 *     label: string,
	 *     kind: 'openai'|'anthropic',
	 *     baseUrl: string,
	 *     keyRequired: bool,
	 *     local: bool,
	 *     fixedUrl: bool,
	 *     tokenParam: string,
	 *     suggestedModels: list<string>,
	 * }>
	 */
	public const ALL = [
		'openai' => [
			'label' => 'OpenAI',
			'kind' => 'openai',
			'baseUrl' => 'https://api.openai.com/v1',
			'keyRequired' => true,
			'local' => false,
			'fixedUrl' => true,
			'tokenParam' => 'max_completion_tokens',
			'suggestedModels' => ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
		],
		'anthropic' => [
			'label' => 'Anthropic',
			'kind' => 'anthropic',
			'baseUrl' => 'https://api.anthropic.com/v1',
			'keyRequired' => true,
			'local' => false,
			'fixedUrl' => true,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
		],
		'mistral' => [
			'label' => 'Mistral',
			'kind' => 'openai',
			'baseUrl' => 'https://api.mistral.ai/v1',
			'keyRequired' => true,
			'local' => false,
			'fixedUrl' => true,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => ['mistral-medium-latest', 'mistral-small-latest', 'mistral-large-latest'],
		],
		'openrouter' => [
			'label' => 'OpenRouter',
			'kind' => 'openai',
			'baseUrl' => 'https://openrouter.ai/api/v1',
			'keyRequired' => true,
			'local' => false,
			'fixedUrl' => true,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => ['openai/gpt-5-mini', 'anthropic/claude-sonnet-5', 'mistralai/mistral-medium'],
		],
		'groq' => [
			'label' => 'Groq',
			'kind' => 'openai',
			'baseUrl' => 'https://api.groq.com/openai/v1',
			'keyRequired' => true,
			'local' => false,
			'fixedUrl' => true,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
		],
		'gemini' => [
			'label' => 'Google Gemini',
			'kind' => 'openai',
			'baseUrl' => 'https://generativelanguage.googleapis.com/v1beta/openai',
			'keyRequired' => true,
			'local' => false,
			'fixedUrl' => true,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => ['gemini-2.5-flash', 'gemini-2.5-pro'],
		],
		'ollama' => [
			'label' => 'Ollama',
			'kind' => 'openai',
			'baseUrl' => 'http://localhost:11434/v1',
			'keyRequired' => false,
			'local' => true,
			'fixedUrl' => false,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => [],
		],
		'localai' => [
			'label' => 'LocalAI',
			'kind' => 'openai',
			'baseUrl' => 'http://localhost:8080/v1',
			'keyRequired' => false,
			'local' => true,
			'fixedUrl' => false,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => [],
		],
		'lmstudio' => [
			'label' => 'LM Studio',
			'kind' => 'openai',
			'baseUrl' => 'http://localhost:1234/v1',
			'keyRequired' => false,
			'local' => true,
			'fixedUrl' => false,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => [],
		],
		'custom' => [
			'label' => 'Custom',
			'kind' => 'openai',
			'baseUrl' => '',
			'keyRequired' => false,
			'local' => false,
			'fixedUrl' => false,
			'tokenParam' => 'max_tokens',
			'suggestedModels' => [],
		],
	];

	public static function exists(string $id): bool {
		return isset(self::ALL[$id]);
	}

	/**
	 * A preset; an unknown id gets the `custom` preset.
	 *
	 * @return array{
	 *     label: string,
	 *     kind: 'openai'|'anthropic',
	 *     baseUrl: string,
	 *     keyRequired: bool,
	 *     local: bool,
	 *     fixedUrl: bool,
	 *     tokenParam: string,
	 *     suggestedModels: list<string>,
	 * }
	 */
	public static function get(string $id): array {
		return self::ALL[$id] ?? self::ALL['custom'];
	}

	/**
	 * The presets as the settings pages list them.
	 *
	 * @return list<array{
	 *     id: string,
	 *     label: string,
	 *     kind: string,
	 *     baseUrl: string,
	 *     keyRequired: bool,
	 *     local: bool,
	 *     fixedUrl: bool,
	 *     suggestedModels: list<string>,
	 * }>
	 */
	public static function publicList(): array {
		$list = [];
		foreach (self::ALL as $id => $preset) {
			$list[] = [
				'id' => $id,
				'label' => $preset['label'],
				'kind' => $preset['kind'],
				'baseUrl' => $preset['baseUrl'],
				'keyRequired' => $preset['keyRequired'],
				'local' => $preset['local'],
				'fixedUrl' => $preset['fixedUrl'],
				'suggestedModels' => $preset['suggestedModels'],
			];
		}
		return $list;
	}
}
