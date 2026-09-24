<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSource;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The LLM requests: a rejected request never reaches a provider, and the provider's answer is parsed.
 */
#[CoversClass(LlmService::class)]
final class LlmServiceTest extends TestCase {
	use SettingsFixture;

	public function testRejectedRequestsNeverReachAProvider(): void {
		$clients = $this->createMock(IClientService::class);
		$clients->expects($this->never())->method('newClient');
		$llm = $this->llm($clients);
		$valid = ['source' => 'personal', 'persona' => 'professor', 'color' => 'w', 'language' => 'en', 'state' => (new Engine())->initialState(),
			'candidates' => [['code' => 'e2-e4', 'E' => 0.5, 'tags' => [], 'ok' => true]]];
		foreach ([['source' => 'openai'], ['color' => 'b'], []] as $patch) {
			try {
				$llm->requestMove('bob', $patch + $valid);
				$this->fail('rejected: ' . json_encode($patch));
			} catch (ApiException $e) {
				$this->assertContains($e->getErrorCode(), ['invalid_argument', 'ai_unavailable']);
			}
		}
	}

	public function testMoveThroughAPersonalProvider(): void {
		$posted = [];
		$client = $this->createMock(IClient::class);
		$client->method('post')->willReturnCallback(function (string $url, array $options) use (&$posted): IResponse {
			$posted[] = [$url, json_decode($options['body'], true)];
			$response = $this->createMock(IResponse::class);
			$response->method('getStatusCode')->willReturn(200);
			$response->method('getBody')->willReturn(json_encode(['choices' => [['message' => ['content' => '{"move":"e2-e4","comment":"Hi","mood":"happy"}']]]]));
			return $response;
		});
		$clients = $this->createMock(IClientService::class);
		$clients->method('newClient')->willReturn($client);
		$this->aiSettings()->setPersonal('bob', ['provider' => ['preset' => 'openai', 'model' => 'gpt-5-mini'], 'apiKey' => 'sk-bob-12345678']);
		$result = $this->llm($clients)->requestMove('bob', ['source' => 'personal', 'model' => 'gpt-5', 'persona' => 'q7', 'color' => 'w',
			'state' => (new Engine())->initialState(), 'candidates' => [['code' => 'e2-e4', 'E' => 0.5, 'tags' => [], 'ok' => true]]]);
		$this->assertSame(['status' => 'done', 'move' => 'e2-e4', 'pick' => null, 'comment' => 'Hi', 'mood' => 'happy'], $result);
		$this->assertSame('https://api.openai.com/v1/chat/completions', $posted[0][0]);
		$this->assertSame(['gpt-5', 3200, 0.7], [$posted[0][1]['model'], $posted[0][1]['max_completion_tokens'], $posted[0][1]['temperature']],
			'a personal provider takes the requested model; reasoning models get four times the tokens');
		$this->assertSame(['nextcloud' => 0, 'shared' => 0, 'personal' => 1], $this->usage()->today());
		$this->assertSame(['models' => [['id' => 'gpt-5-mini', 'label' => 'gpt-5-mini']], 'chosenByAdmin' => true],
			$this->sharedModels(), 'without an allow-list the organisation provider offers its own model only');
	}

	/** @return array<string, mixed> */
	private function sharedModels(): array {
		$this->settings()->setAdmin(['shared_enabled' => true, 'shared_provider' => ['preset' => 'openai', 'model' => 'gpt-5-mini']]);
		$this->aiSettings()->setAdminSecret('shared_api_key', 'sk-shared-00000000');
		return $this->llm($this->createMock(IClientService::class))->listModels('bob', AiSource::Shared);
	}
}
