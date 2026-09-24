<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai\Provider;

use OCA\QuantumChess\Service\Ai\Provider\UrlGuard;
use OCA\QuantumChess\Service\Ai\Provider\UrlNotAllowedException;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Which provider addresses are allowed, and when local addresses are.
 */
#[CoversClass(UrlGuard::class)]
final class UrlGuardTest extends TestCase {
	use SettingsFixture;

	/**
	 * url, scope, sharedAllowLocal, allowlist → allowLocal (null = refused)
	 *
	 * @return array<string, array{string, string, bool, list<string>, ?bool}>
	 */
	public static function urls(): array {
		return [
			'public https' => ['https://api.openai.com/v1/', 'personal', false, [], false],
			'public http' => ['http://api.openai.com/v1', 'personal', false, [], null],
			'credentials' => ['https://user:pw@api.openai.com/v1', 'personal', false, [], null],
			'query' => ['https://api.openai.com/v1?x=1', 'personal', false, [], null],
			'ftp' => ['ftp://api.openai.com/v1', 'personal', false, [], null],
			'localhost refused' => ['http://localhost:11434/v1', 'personal', false, [], null],
			'localhost allow-listed' => [
				'http://LOCALHOST:11434/v1/',
				'personal',
				false,
				['http://localhost:11434/v1'],
				true,
			],
			'allow-list is exact' => [
				'http://localhost:11434/v2',
				'personal',
				false,
				['http://localhost:11434/v1'],
				null,
			],
			'loopback ip' => ['http://127.0.0.1:8080/v1', 'personal', false, [], null],
			'private ip' => ['https://192.168.1.10/v1', 'personal', false, [], null],
			'cgnat ip' => ['https://100.64.0.1/v1', 'personal', false, [], null],
			'ipv6 loopback' => ['http://[::1]:11434/v1', 'personal', false, [], null],
			'ipv6 unique local' => ['https://[fd00::1]/v1', 'personal', false, [], null],
			'ipv4-mapped' => ['https://[::ffff:127.0.0.1]/v1', 'personal', false, [], null],
			'single label' => ['https://ollama/v1', 'personal', false, [], null],
			'.local' => ['https://gpu.local/v1', 'personal', false, [], null],
			'resolves private' => ['https://internal.example.com/v1', 'personal', false, [], null],
			'one resolved address local' => ['https://rebind.example.com/v1', 'personal', false, [], null],
			'shared local off' => ['http://localhost:11434/v1', 'shared', false, [], null],
			'shared local on' => ['http://localhost:11434/v1', 'shared', true, [], true],
			'personal ignores shared switch' => ['http://localhost:11434/v1', 'personal', true, [], null],
		];
	}

	#[DataProvider('urls')]
	public function testUrlGuard(
		string $url,
		string $scope,
		bool $sharedAllowLocal,
		array $allowlist,
		?bool $allowLocal,
	): void {
		try {
			$result = $this->guard()->check($url, $scope, $sharedAllowLocal, $allowlist);
			$this->assertSame($allowLocal, $result['allowLocal']);
			$this->assertStringEndsNotWith('/', $result['url']);
		} catch (UrlNotAllowedException) {
			$this->assertNull($allowLocal, 'refused');
		}
	}
}
