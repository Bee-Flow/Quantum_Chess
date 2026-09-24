<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * The Anthropic Messages API.
 *
 * Requests carry no temperature but a reasoning effort (`output_config.effort`). A model that rejects the effort gets
 * the request once more without it, and the effort is left out for that model from then on.
 */
final class AnthropicProvider extends HttpProvider {
	/** The `anthropic-version` header. */
	public const VERSION = '2023-06-01';

	public function chat(array $messages, array $options): ChatResult {
		$model = (string)($options['model'] ?? '');
		if ($model === '') {
			throw new ProviderException(UpstreamError::ModelNotFound, 'no model configured');
		}
		$system = [];
		$turns = [];
		foreach ($messages as $message) {
			if ($message['role'] === 'system') {
				$system[] = $message['content'];
			} else {
				$turns[] = ['role' => $message['role'], 'content' => $message['content']];
			}
		}
		$body = ['model' => $model, 'max_tokens' => $options['maxTokens'], 'system' => implode("\n\n", $system), 'messages' => $turns];
		if ($options['safetyId'] !== null) {
			$body['metadata'] = ['user_id' => $options['safetyId']];
		}
		$useEffort = $options['effort'] !== null && !in_array('output_config', $this->dropped($model), true);
		if ($useEffort) {
			$body['output_config'] = ['effort' => $options['effort']];
		}
		$timeout = self::timeout($options['purpose']);
		[$status, $data, $raw] = $this->send('/messages', $this->headers(), $body, $timeout);
		if ($status === 400 && $useEffort && (str_contains($raw, 'output_config') || str_contains($raw, 'effort'))) {
			$this->rememberDropped($model, 'output_config');
			unset($body['output_config']);
			[$status, $data, $raw] = $this->send('/messages', $this->headers(), $body, $timeout);
		}
		$this->throwForStatus($status, $raw);
		if (!is_array($data) || !is_array($data['content'] ?? null)) {
			throw new ProviderException(UpstreamError::BadResponse, 'no content');
		}
		$stop = $data['stop_reason'] ?? null;
		if ($stop === 'refusal') {
			throw new ProviderException(UpstreamError::Refused, 'refusal');
		}
		if ($stop === 'max_tokens') {
			throw new ProviderException(UpstreamError::BadResponse, 'max_tokens');
		}
		$text = '';
		foreach ($data['content'] as $block) {
			if (is_array($block) && ($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
				$text .= $block['text'];
			}
		}
		if (trim($text) === '') {
			throw new ProviderException(UpstreamError::BadResponse, 'empty content');
		}
		return ChatResult::done($text);
	}

	public function listModels(): array {
		[$status, $data, $raw] = $this->send('/models?limit=1000', $this->headers(), null, 30);
		$this->throwForStatus($status, $raw);
		if (!is_array($data) || !is_array($data['data'] ?? null)) {
			throw new ProviderException(UpstreamError::BadResponse, 'no model list');
		}
		$models = [];
		foreach ($data['data'] as $entry) {
			$id = is_array($entry) ? ($entry['id'] ?? null) : null;
			if (is_string($id) && $id !== '' && strlen($id) <= 128) {
				$label = is_string($entry['display_name'] ?? null) && $entry['display_name'] !== '' ? $entry['display_name'] : $id;
				$models[] = ['id' => $id, 'label' => $label];
			}
		}
		return $models;
	}

	/** @return array<string, string> */
	private function headers(): array {
		return [
			'x-api-key' => (string)($this->config['apiKey'] ?? ''),
			'anthropic-version' => self::VERSION,
		];
	}
}
