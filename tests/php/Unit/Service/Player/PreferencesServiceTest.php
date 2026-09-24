<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Player;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Player\PreferencesService;
use OCA\QuantumChess\Service\Player\UserDocumentStore;
use OCP\Config\IUserConfig;
use OCP\IL10N;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The preference document: stored as it is, within its size limit.
 */
#[CoversClass(PreferencesService::class)]
#[CoversClass(UserDocumentStore::class)]
final class PreferencesServiceTest extends TestCase {
	private function config(): IUserConfig {
		$store = new \ArrayObject();
		$config = $this->createMock(IUserConfig::class);
		$config->method('getValueString')->willReturnCallback(
			fn (string $u, string $a, string $k, string $d = '') => $store[$k] ?? $d,
		);
		$config->method('setValueString')->willReturnCallback(
			function (string $u, string $a, string $k, string $v) use ($store) {
				$store[$k] = $v;
				return true;
			},
		);
		return $config;
	}

	private function l(): IL10N {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnArgument(0);
		return $l;
	}

	public function testPreferencesAreStoredVerbatimWithinTheLimit(): void {
		$service = new PreferencesService(new UserDocumentStore($this->config()), $this->l());
		$this->assertSame([], $service->get('bob'));
		$this->assertSame(
			['v' => 1, 'unknown' => ['x' => true]],
			$service->set('bob', ['v' => 1, 'unknown' => ['x' => true]]),
		);
		try {
			$service->set('bob', ['blob' => str_repeat('x', PreferencesService::MAX_BYTES)]);
			$this->fail('too large');
		} catch (ApiException $e) {
			$this->assertSame([413, 'too_large'], [$e->getStatus(), $e->getErrorCode()]);
		}
		try {
			$service->set('bob', ["\xff" => 1]);
			$this->fail('not encodable');
		} catch (ApiException $e) {
			$this->assertSame(
				[400, 'invalid_argument', ['field' => 'preferences']],
				[$e->getStatus(), $e->getErrorCode(), $e->getExtra()],
			);
		}
		$this->expectException(ApiException::class);
		$service->set('bob', [1, 2, 3]);
	}

	public function testDocumentsAreStoredAsObjectsWithoutEscapes(): void {
		$config = $this->config();
		$store = new UserDocumentStore($config);
		$store->set('bob', 'preferences', []);
		$this->assertSame('{}', $config->getValueString('bob', 'quantumchess', 'preferences'));
		$store->set('bob', 'preferences', ['url' => 'a/b', 'name' => 'Zoë']);
		$this->assertSame('{"url":"a/b","name":"Zoë"}', $config->getValueString('bob', 'quantumchess', 'preferences'));
		$this->assertSame([], $store->get('bob', 'missing'));
	}
}
