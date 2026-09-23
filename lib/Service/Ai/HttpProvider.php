<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCP\Http\Client\IClientService;
use OCP\Http\Client\LocalServerException;
use OCP\ICache;
use Psr\Log\LoggerInterface;

/**
 * Shared HTTP plumbing of the direct providers (docs/SPEC.md §10.2, §10.8, §12.2): IClientService with timeouts, no
 * redirects, the local-address switch from UrlGuard, status → upstream code mapping, and the per-model memory of
 * unsupported parameters.
 */
abstract class HttpProvider implements ProviderInterface {
	public const CONNECT_TIMEOUT = 10;

	/**
	 * @param array{preset: string, baseUrl: string, apiKey: ?string, allowLocal: bool} $config
	 */
	public function __construct(
		protected IClientService $clients,
		protected ICache $cache,
		protected LoggerInterface $logger,
		protected array $config,
	) {
	}

	/**
	 * @param array<string, string> $headers
	 * @param array<string, mixed>|null $body JSON body (POST) or null (GET)
	 * @return array{0: int, 1: mixed, 2: string} status, decoded body, raw body
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
			throw new ProviderException('unreachable', 'local address blocked');
		} catch (\Throwable $e) {
			$message = $this->redact($e->getMessage());
			if (stripos($message, 'timed out') !== false || str_contains($message, 'cURL error 28')) {
				throw new ProviderException('timeout', $message);
			}
			throw new ProviderException('unreachable', $message);
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
	 * Map a non-2xx status to an upstream code (§10.8). Upstream bodies are only logged at debug level.
	 *
	 * @throws ProviderException
	 */
	protected function throwForStatus(int $status, string $raw): void {
		if ($status >= 200 && $status < 300) {
			return;
		}
		$lower = strtolower($raw);
		$this->logger->debug('Quantum Chess AI: upstream answered {status}: {body}', [
			'app' => 'quantumchess', 'status' => $status, 'body' => $this->redact(substr($raw, 0, 500)),
		]);
		$code = match (true) {
			$status === 401, $status === 403 => 'invalid_key',
			$status === 402, str_contains($lower, 'quota'), str_contains($lower, 'insufficient_balance'), str_contains($lower, 'credit') => 'quota_exceeded',
			$status === 404 => 'model_not_found',
			$status === 429 => 'rate_limited',
			$status === 408, $status === 504 => 'timeout',
			$status === 400 && (str_contains($lower, 'model') && (str_contains($lower, 'not found') || str_contains($lower, 'does not exist') || str_contains($lower, 'invalid model') || str_contains($lower, 'not_found'))) => 'model_not_found',
			$status >= 500 => 'unreachable',
			default => 'bad_response',
		};
		throw new ProviderException($code, 'HTTP ' . $status);
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

	/** @return list<string> */
	protected function dropped(string $model): array {
		$value = $this->cache->get($this->droppedKey($model));
		return is_array($value) ? array_values(array_filter($value, 'is_string')) : [];
	}

	protected function rememberDropped(string $model, string $param): void {
		$list = $this->dropped($model);
		$list[] = $param;
		$this->cache->set($this->droppedKey($model), array_values(array_unique($list)), 7 * 86400);
	}

	private function droppedKey(string $model): string {
		return 'dropped:' . md5($this->config['baseUrl'] . '|' . $model);
	}

	protected function redact(string $text): string {
		$key = $this->config['apiKey'] ?? null;
		return ($key !== null && $key !== '') ? str_replace($key, '***', $text) : $text;
	}

	protected static function timeout(string $purpose): int {
		return $purpose === 'move' ? 60 : 90;
	}
}
