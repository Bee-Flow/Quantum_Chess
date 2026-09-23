<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

/**
 * OpenAI-compatible chat completions (docs/SPEC.md §10.2): OpenAI, Mistral, OpenRouter, Groq, Gemini, Ollama,
 * LocalAI, LM Studio and custom servers.
 */
class OpenAiProvider extends HttpProvider {
	public const MODEL_FILTER = '/embed|whisper|tts|dall-e|image|audio|moderation|transcribe|realtime|rerank|guard/i';

	public function chat(array $messages, array $options): array {
		$model = (string)($options['model'] ?? '');
		if ($model === '') {
			throw new ProviderException('model_not_found', 'no model configured');
		}
		$preset = Presets::get($this->config['preset']);
		$params = [];
		if ($options['temperature'] !== null) {
			$params['temperature'] = $options['temperature'];
		}
		$params[$preset['tokenParam']] = $options['maxTokens'];
		if ($options['safetyId'] !== null && $this->config['preset'] === 'openai') {
			$params['safety_identifier'] = $options['safetyId'];
		}
		foreach ($this->dropped($model) as $param) {
			unset($params[$param]);
		}
		$body = ['model' => $model, 'messages' => $messages];
		$timeout = self::timeout($options['purpose']);
		[$status, $data, $raw] = $this->send('/chat/completions', $this->headers(), $body + $params, $timeout);
		if ($status === 400) {
			$param = self::unsupportedParam($raw, array_keys($params));
			if ($param !== null) {
				$this->rememberDropped($model, $param);
				unset($params[$param]);
				[$status, $data, $raw] = $this->send('/chat/completions', $this->headers(), $body + $params, $timeout);
			}
		}
		$this->throwForStatus($status, $raw);
		$choice = is_array($data) && isset($data['choices'][0]) && is_array($data['choices'][0]) ? $data['choices'][0] : null;
		if ($choice === null) {
			throw new ProviderException('bad_response', 'no choices');
		}
		$content = $choice['message']['content'] ?? null;
		if (is_array($content)) {
			$content = implode('', array_map(static fn ($part) => is_array($part) && is_string($part['text'] ?? null) ? $part['text'] : '', $content));
		}
		$refusal = $choice['message']['refusal'] ?? null;
		if ((!is_string($content) || trim($content) === '') && (is_string($refusal) || ($choice['finish_reason'] ?? null) === 'content_filter')) {
			throw new ProviderException('refused', 'refusal');
		}
		if (!is_string($content) || trim($content) === '') {
			throw new ProviderException('bad_response', 'empty content');
		}
		return ['status' => 'done', 'text' => $content];
	}

	public function listModels(): array {
		[$status, $data, $raw] = $this->send('/models', $this->headers(), null, 30);
		$this->throwForStatus($status, $raw);
		if (!is_array($data) || !is_array($data['data'] ?? null)) {
			throw new ProviderException('bad_response', 'no model list');
		}
		$models = [];
		foreach ($data['data'] as $entry) {
			$id = is_array($entry) ? ($entry['id'] ?? null) : null;
			if (is_string($id) && $id !== '' && strlen($id) <= 128 && preg_match(self::MODEL_FILTER, $id) !== 1) {
				$models[$id] = ['id' => $id, 'label' => $id];
			}
		}
		ksort($models, SORT_NATURAL | SORT_FLAG_CASE);
		return array_values($models);
	}

	/** @return array<string, string> */
	private function headers(): array {
		$headers = [];
		$key = $this->config['apiKey'] ?? null;
		if ($key !== null && $key !== '') {
			$headers['Authorization'] = 'Bearer ' . $key;
		}
		if ($this->config['preset'] === 'openrouter') {
			// never HTTP-Referer: it would leak the instance URL
			$headers['X-Title'] = 'Quantum Chess';
		}
		return $headers;
	}
}
