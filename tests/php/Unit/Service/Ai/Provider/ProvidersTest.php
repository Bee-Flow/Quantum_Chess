<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai\Provider;

use OCA\QuantumChess\Service\Ai\Provider\AnthropicProvider;
use OCA\QuantumChess\Service\Ai\Provider\ChatResult;
use OCA\QuantumChess\Service\Ai\Provider\HttpProvider;
use OCA\QuantumChess\Service\Ai\Provider\OpenAiProvider;
use OCA\QuantumChess\Service\Ai\Provider\ProviderException;
use OCA\QuantumChess\Tests\Support\ArrayMemcache;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use OCP\Http\Client\LocalServerException;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The providers the server calls directly, against a mocked HTTP client: request bodies and headers, the retry
 * without an unsupported parameter, the mapping of errors, and keys that never reach a log call.
 */
#[CoversClass(OpenAiProvider::class)]
#[CoversClass(AnthropicProvider::class)]
#[CoversClass(HttpProvider::class)]
final class ProvidersTest extends TestCase {
	/** @var list<array{method: string, url: string, options: array}> */
	private array $calls = [];
	/** @var list<array{0: int, 1: string}|\Throwable> */
	private array $answers = [];
	/** @var list<string> */
	private array $logged = [];

	private function clients(): IClientService {
		$client = $this->createMock(IClient::class);
		$respond = function (string $method, string $url, array $options): IResponse {
			$this->calls[] = ['method' => $method, 'url' => $url, 'options' => $options];
			$answer = array_shift($this->answers) ?? [500, ''];
			if ($answer instanceof \Throwable) {
				throw $answer;
			}
			$response = $this->createMock(IResponse::class);
			$response->method('getStatusCode')->willReturn($answer[0]);
			$response->method('getBody')->willReturn($answer[1]);
			return $response;
		};
		$client->method('post')->willReturnCallback(fn (string $url, array $options) => $respond('POST', $url, $options));
		$client->method('get')->willReturnCallback(fn (string $url, array $options) => $respond('GET', $url, $options));
		$service = $this->createMock(IClientService::class);
		$service->method('newClient')->willReturn($client);
		return $service;
	}

	private function logger(): LoggerInterface {
		$logger = $this->createMock(LoggerInterface::class);
		foreach (['debug', 'info', 'warning', 'error', 'notice'] as $level) {
			$logger->method($level)->willReturnCallback(function (string $message, array $context = []): void {
				$this->logged[] = $message . ' ' . json_encode($context);
			});
		}
		return $logger;
	}

	private function openai(string $preset = 'openai', string $baseUrl = 'https://api.openai.com/v1', ?ArrayMemcache $cache = null): OpenAiProvider {
		return new OpenAiProvider($this->clients(), $cache ?? new ArrayMemcache(), $this->logger(), ['preset' => $preset, 'baseUrl' => $baseUrl, 'apiKey' => 'sk-secret-1234', 'allowLocal' => false]);
	}

	private function options(array $override = []): array {
		return $override + ['model' => 'gpt-5-mini', 'maxTokens' => 3200, 'temperature' => 0.7, 'effort' => null, 'safetyId' => 'abc', 'purpose' => 'move'];
	}

	private const MESSAGES = [['role' => 'system', 'content' => 'S'], ['role' => 'user', 'content' => 'U']];

	private static function ok(string $content): array {
		return [200, json_encode(['choices' => [['message' => ['role' => 'assistant', 'content' => $content], 'finish_reason' => 'stop']]])];
	}

	public function testOpenAiRequest(): void {
		$this->answers = [self::ok('{"move":"e7-e5"}')];
		$result = $this->openai()->chat(self::MESSAGES, $this->options());
		$this->assertEquals(ChatResult::done('{"move":"e7-e5"}'), $result);
		$call = $this->calls[0];
		$this->assertSame('https://api.openai.com/v1/chat/completions', $call['url']);
		$this->assertSame('Bearer sk-secret-1234', $call['options']['headers']['Authorization']);
		$this->assertFalse($call['options']['allow_redirects']);
		$this->assertSame(60, $call['options']['timeout']);
		$this->assertSame(10, $call['options']['connect_timeout']);
		$this->assertSame(['allow_local_address' => false], $call['options']['nextcloud']);
		$body = json_decode($call['options']['body'], true);
		$this->assertSame(['model' => 'gpt-5-mini', 'messages' => self::MESSAGES, 'temperature' => 0.7, 'max_completion_tokens' => 3200, 'safety_identifier' => 'abc'], $body);
	}

	public function testUnsupportedParameterIsRetriedOnceAndRemembered(): void {
		$cache = new ArrayMemcache();
		$this->answers = [
			[400, '{"error":{"message":"Unsupported value: \'temperature\' does not support 0.7 with this model.","param":"temperature"}}'],
			self::ok('{"move":"e7-e5"}'),
			self::ok('{"move":"e7-e6"}'),
		];
		$provider = $this->openai('openai', 'https://api.openai.com/v1', $cache);
		$this->assertFalse($provider->chat(self::MESSAGES, $this->options())->isPending());
		$this->assertArrayHasKey('temperature', json_decode($this->calls[0]['options']['body'], true));
		$this->assertArrayNotHasKey('temperature', json_decode($this->calls[1]['options']['body'], true));
		$provider->chat(self::MESSAGES, $this->options());
		$this->assertCount(3, $this->calls, 'the next call goes out without temperature at once');
		$this->assertArrayNotHasKey('temperature', json_decode($this->calls[2]['options']['body'], true));
	}

	public function testOpenRouterHeadersAndMaxTokens(): void {
		$this->answers = [self::ok('hi')];
		$this->openai('openrouter', 'https://openrouter.ai/api/v1')->chat(self::MESSAGES, $this->options(['model' => 'openai/gpt-5-mini']));
		$headers = $this->calls[0]['options']['headers'];
		$this->assertSame('Quantum Chess', $headers['X-Title']);
		$this->assertArrayNotHasKey('HTTP-Referer', $headers);
		$body = json_decode($this->calls[0]['options']['body'], true);
		$this->assertSame(3200, $body['max_tokens']);
		$this->assertArrayNotHasKey('safety_identifier', $body);
	}

	/** @return array<string, array{array{0: int, 1: string}|\Throwable, string}> */
	public static function errors(): array {
		return [
			'401' => [[401, '{"error":"bad key sk-secret-1234"}'], 'invalid_key'],
			'403' => [[403, ''], 'invalid_key'],
			'404' => [[404, '{}'], 'model_not_found'],
			'400 model' => [[400, '{"error":{"message":"The model `x` does not exist"}}'], 'model_not_found'],
			'429' => [[429, '{"error":{"message":"Rate limit"}}'], 'rate_limited'],
			'429 quota' => [[429, '{"error":{"code":"insufficient_quota"}}'], 'quota_exceeded'],
			'402' => [[402, ''], 'quota_exceeded'],
			'500' => [[503, 'down'], 'unreachable'],
			'400 other' => [[400, '{"error":"nope"}'], 'bad_response'],
			'bad json' => [[200, 'not json'], 'bad_response'],
			'refusal' => [[200, '{"choices":[{"message":{"content":null,"refusal":"no"}}]}'], 'refused'],
			'timeout' => [new \RuntimeException('cURL error 28: Operation timed out'), 'timeout'],
			'connect' => [new \RuntimeException('cURL error 7: Failed to connect'), 'unreachable'],
			'local' => [new LocalServerException('local'), 'unreachable'],
		];
	}

	#[DataProvider('errors')]
	public function testErrorMapping(array|\Throwable $answer, string $code): void {
		$this->answers = [$answer];
		try {
			$this->openai()->chat(self::MESSAGES, $this->options());
			$this->fail('expected an exception');
		} catch (ProviderException $e) {
			$this->assertSame($code, $e->getUpstream());
			$this->assertStringNotContainsString('sk-secret-1234', $e->getMessage());
		}
		foreach ($this->logged as $line) {
			$this->assertStringNotContainsString('sk-secret-1234', $line, 'keys never reach the log');
		}
	}

	public function testModelListIsFiltered(): void {
		$this->answers = [[200, json_encode(['data' => [['id' => 'gpt-5'], ['id' => 'text-embedding-3-small'], ['id' => 'whisper-1'], ['id' => 'gpt-4.1-mini'], ['id' => 'omni-moderation-latest']]])]];
		$models = $this->openai()->listModels();
		$this->assertSame(['gpt-4.1-mini', 'gpt-5'], array_column($models, 'id'));
		$this->assertSame('https://api.openai.com/v1/models', $this->calls[0]['url']);
		$this->assertSame('GET', $this->calls[0]['method']);
	}

	private function anthropic(): AnthropicProvider {
		return new AnthropicProvider($this->clients(), new ArrayMemcache(), $this->logger(), ['preset' => 'anthropic', 'baseUrl' => 'https://api.anthropic.com/v1', 'apiKey' => 'sk-ant-secret', 'allowLocal' => false]);
	}

	public function testAnthropicRequestAndEffortRetry(): void {
		$this->answers = [
			[400, '{"type":"error","error":{"type":"invalid_request_error","message":"output_config: Extra inputs are not permitted"}}'],
			[200, json_encode(['content' => [['type' => 'thinking', 'thinking' => '…'], ['type' => 'text', 'text' => 'Hello '], ['type' => 'text', 'text' => 'there']], 'stop_reason' => 'end_turn'])],
		];
		$result = $this->anthropic()->chat(self::MESSAGES, $this->options(['model' => 'claude-opus-5', 'temperature' => null, 'effort' => 'low', 'purpose' => 'coach']));
		$this->assertEquals(ChatResult::done('Hello there'), $result);
		$first = $this->calls[0];
		$this->assertSame('https://api.anthropic.com/v1/messages', $first['url']);
		$this->assertSame('sk-ant-secret', $first['options']['headers']['x-api-key']);
		$this->assertSame('2023-06-01', $first['options']['headers']['anthropic-version']);
		$this->assertSame(90, $first['options']['timeout']);
		$body = json_decode($first['options']['body'], true);
		$this->assertSame(['model' => 'claude-opus-5', 'max_tokens' => 3200, 'system' => 'S', 'messages' => [['role' => 'user', 'content' => 'U']], 'metadata' => ['user_id' => 'abc'], 'output_config' => ['effort' => 'low']], $body);
		$this->assertArrayNotHasKey('temperature', $body);
		$this->assertArrayNotHasKey('output_config', json_decode($this->calls[1]['options']['body'], true));
	}

	public function testAnthropicStopReasons(): void {
		foreach (['refusal' => 'refused', 'max_tokens' => 'bad_response'] as $stop => $code) {
			$this->answers = [[200, json_encode(['content' => [['type' => 'text', 'text' => 'x']], 'stop_reason' => $stop])]];
			try {
				$this->anthropic()->chat(self::MESSAGES, $this->options(['model' => 'claude-opus-5', 'effort' => null]));
				$this->fail('expected an exception');
			} catch (ProviderException $e) {
				$this->assertSame($code, $e->getUpstream());
			}
		}
	}
}
