<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

use OCP\Http\Client\IClientService;
use OCP\Http\Client\LocalServerException;
use OCP\ICache;
use Psr\Log\LoggerInterface;

/**
 * The HTTP side of the providers that the server calls directly.
 *
 * Requests go through Nextcloud's HTTP client with timeouts and without redirects. Local addresses are reachable only
 * when UrlGuard allowed them for this provider. HTTP errors become upstream error codes, and parameters that a model
 * rejects are remembered for a week so that later requests leave them out.
 */
abstract class HttpProvider implements ProviderInterface {
	/** Seconds to wait for the connection. */
	public const CONNECT_TIMEOUT = 10;
	/** How long a parameter that a model rejected is left out, in seconds (7 days). */
	private const DROPPED_TTL = 604800;

	/**
	 * @param array{preset: string, baseUrl: string, apiKey: ?string, allowLocal: bool} $config
	 */
	public function __construct(
		protected readonly IClientService $clients,
		protected readonly ICache $cache,
		protected readonly LoggerInterface $logger,
		protected readonly array $config,
	) {
	}

	/**
	 * Sends a request to the provider.
	 *
	 * @param array<string, string> $headers
	 * @param array<string, mixed>|null $body the JSON body of a POST request, or null for a GET request
	 * @return array{0: int, 1: mixed, 2: string} the status, the decoded body and the raw body
	 * @throws ProviderException for connection errors and timeouts
	 */
	protected function send(string $path, array $headers, ?array $body, int $timeout): array {
		$url = rtrim($this->config['baseUrl'], '/') . $path;
		$options = [
			'headers' => $headers + ['Accept' => 'application/json'],
			'timeout' => $timeout,
			'connect_timeout' => self::CONNECT_TIMEOUT,
			'allow_redirects' => false,
			'http_errors' => false,
			'nextcloud' => ['allow_local_address' => $this->config['allowLocal']],
		];
		try {
			if ($body === null) {
				$response = $this->clients->newClient()->get($url, $options);
			} else {
				$options['headers']['Content-Type'] = 'application/json';
				$options['body'] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
				$response = $this->clients->newClient()->post($url, $options);
			}
		} catch (LocalServerException $e) {
			throw new ProviderException(UpstreamError::Unreachable, 'local address blocked');
		} catch (\Throwable $e) {
			$message = $this->redact($e->getMessage());
			if (stripos($message, 'timed out') !== false || str_contains($message, 'cURL error 28')) {
				throw new ProviderException(UpstreamError::Timeout, $message);
			}
			throw new ProviderException(UpstreamError::Unreachable, $message);
		}
		$raw = $response->getBody();
		$raw = is_string($raw) ? $raw : (is_resource($raw) ? (string)stream_get_contents($raw) : '');
		$status = $response->getStatusCode();
		try {
			$data = $raw === '' ? null : json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
		} catch (\JsonException) {
			$data = null;
		}
		return [$status, $data, $raw];
	}

	/**
	 * Throws the upstream error of a status other than 2xx. Response bodies are logged at debug level only, without
	 * the API key.
	 *
	 * @throws ProviderException
	 */
	protected function throwForStatus(int $status, string $raw): void {
		if ($status >= 200 && $status < 300) {
			return;
		}
		$lower = strtolower($raw);
		$this->logger->debug('The LLM provider answered {status}: {body}', [
			'status' => $status, 'body' => $this->redact(substr($raw, 0, 500)),
		]);
		$error = match (true) {
			$status === 401, $status === 403 => UpstreamError::InvalidKey,
			$status === 402, str_contains($lower, 'quota'), str_contains($lower, 'insufficient_balance'), str_contains($lower, 'credit') => UpstreamError::QuotaExceeded,
			$status === 404 => UpstreamError::ModelNotFound,
			$status === 429 => UpstreamError::RateLimited,
			$status === 408, $status === 504 => UpstreamError::Timeout,
			$status === 400 && (str_contains($lower, 'model') && (str_contains($lower, 'not found') || str_contains($lower, 'does not exist') || str_contains($lower, 'invalid model') || str_contains($lower, 'not_found'))) => UpstreamError::ModelNotFound,
			$status >= 500 => UpstreamError::Unreachable,
			default => UpstreamError::BadResponse,
		};
		throw new ProviderException($error, 'HTTP ' . $status);
	}

	/**
	 * The first of `$params` that a 400 answer names as unsupported, or null.
	 *
	 * @param list<string> $params
	 */
	protected static function unsupportedParam(string $raw, array $params): ?string {
		$lower = strtolower($raw);
		if (!preg_match('/unsupported|not supported|unrecognized|unknown|not allowed|not permitted|extra inputs|invalid/', $lower)) {
			return null;
		}
		foreach ($params as $param) {
			if (str_contains($lower, strtolower($param))) {
				return $param;
			}
		}
		return null;
	}

	/**
	 * The parameters that `$model` of this provider rejected before.
	 *
	 * @return list<string>
	 */
	protected function dropped(string $model): array {
		$value = $this->cache->get($this->droppedKey($model));
		return is_array($value) ? array_values(array_filter($value, 'is_string')) : [];
	}

	protected function rememberDropped(string $model, string $param): void {
		$list = $this->dropped($model);
		$list[] = $param;
		$this->cache->set($this->droppedKey($model), array_values(array_unique($list)), self::DROPPED_TTL);
	}

	private function droppedKey(string $model): string {
		return 'dropped:' . md5($this->config['baseUrl'] . '|' . $model);
	}

	/** `$text` with the API key replaced by `***`. */
	protected function redact(string $text): string {
		$key = $this->config['apiKey'] ?? null;
		return ($key !== null && $key !== '') ? str_replace($key, '***', $text) : $text;
	}

	/** Seconds to wait for an answer: a move is expected faster than a coach answer. */
	protected static function timeout(string $purpose): int {
		return $purpose === 'move' ? 60 : 90;
	}
}
