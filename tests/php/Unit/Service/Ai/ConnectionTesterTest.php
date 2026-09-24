<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\ConnectionTester;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The connection test of the settings pages, and which key it may send where.
 */
#[CoversClass(ConnectionTester::class)]
final class ConnectionTesterTest extends TestCase {
	use SettingsFixture;

	/** @var list<array{string, ?string}> the URLs requested and their Authorization header */
	private array $sent = [];

	private function clients(): IClientService {
		$client = $this->createMock(IClient::class);
		$client->method('get')->willReturnCallback(function (string $url, array $options): IResponse {
			$this->sent[] = [$url, $options['headers']['Authorization'] ?? null];
			$response = $this->createMock(IResponse::class);
			$response->method('getStatusCode')->willReturn(200);
			$response->method('getBody')->willReturn('{"data":[{"id":"m"}]}');
			return $response;
		});
		$clients = $this->createMock(IClientService::class);
		$clients->method('newClient')->willReturn($client);
		return $clients;
	}

	public function testStoredKeysAreOnlySentToTheirAddress(): void {
		$this->settings()->setAdmin(['shared_provider' => ['preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1', 'model' => 'm']]);
		$this->aiSettings()->setAdminSecret('shared_api_key', 'sk-org-SECRET-1234');
		$this->aiSettings()->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1', 'model' => 'x'], 'apiKey' => 'sk-bob-PRIVATE-99']);
		$tester = $this->tester($this->clients());
		$tester->test('admin', ['scope' => 'shared', 'preset' => 'custom', 'baseUrl' => 'https://attacker.example.com/v1'], true);
		$tester->test('admin', ['scope' => 'shared', 'preset' => 'custom', 'baseUrl' => 'https://attacker.example.com/v1', 'apiKey' => 'sk-typed-0000'], true);
		$tester->test('bob', ['scope' => 'personal', 'preset' => 'custom', 'baseUrl' => 'https://attacker.example.com/v1'], false);
		$result = $tester->test('bob', ['scope' => 'personal', 'preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1'], false);
		$this->assertSame([
			['https://attacker.example.com/v1/models', null],
			['https://attacker.example.com/v1/models', 'Bearer sk-typed-0000'],
			['https://attacker.example.com/v1/models', null],
			['https://ai.example.com/v1/models', 'Bearer sk-bob-PRIVATE-99'],
		], $this->sent);
		$this->assertSame(['ok' => true, 'code' => null, 'modelCount' => 1, 'models' => [['id' => 'm', 'label' => 'm']]], $result);
		$tester->test('admin', ['scope' => 'shared', 'preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1'], true);
		$this->assertSame(['https://ai.example.com/v1/models', 'Bearer sk-org-SECRET-1234'], $this->sent[4], 'the saved address gets the saved key');
	}

	public function testRefusals(): void {
		$tester = $this->tester($this->clients());
		$this->assertSame(['ok' => false, 'code' => 'url_not_allowed', 'modelCount' => null, 'models' => null],
			$tester->test('bob', ['scope' => 'personal', 'preset' => 'custom', 'baseUrl' => 'http://localhost:1234/v1'], false));
		foreach ([
			[['scope' => 'everyone'], false, ['invalid_argument', 'scope']],
			[['scope' => 'shared', 'preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1'], false, ['not_found', null]],
			[['scope' => 'personal', 'preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1', 'apiKey' => 'sk key'], false, ['invalid_argument', 'apiKey']],
		] as [$request, $admin, $expected]) {
			try {
				$tester->test('bob', $request, $admin);
				$this->fail('refused: ' . json_encode($request));
			} catch (ApiException $e) {
				$this->assertSame($expected, [$e->getErrorCode(), $e->getExtra()['field'] ?? null]);
			}
		}
		$this->assertSame([], $this->sent);
	}
}
