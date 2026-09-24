<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSettingsService;
use OCA\QuantumChess\Service\Ai\AiSource;
use OCA\QuantumChess\Service\Ai\Provider\Presets;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * A user's LLM settings, the privacy notices, and the organisation provider's key.
 */
#[CoversClass(AiSettingsService::class)]
final class AiSettingsServiceTest extends TestCase {
	use SettingsFixture;

	public function testAdminSecret(): void {
		$ai = $this->aiSettings();
		$info = $ai->setAdminSecret('shared_api_key', 'sk-ant-api03-XYZW');
		$this->assertSame(['hasKey' => true, 'keyHint' => 'XYZW', 'keyUnreadable' => false], $info);
		$this->assertStringNotContainsString('sk-ant-api03-XYZW', json_encode($this->settings()->getAdmin()));
		$this->expectException(ApiException::class);
		$ai->setAdminSecret('other_key', 'x');
	}

	public function testPersonalSettings(): void {
		$ai = $this->aiSettings();
		try {
			$ai->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'http://127.0.0.1:9000/v1', 'model' => 'm']]);
			$this->fail('local refused');
		} catch (ApiException $e) {
			$this->assertSame(['url_not_allowed', 'provider'], [$e->getErrorCode(), $e->getExtra()['field']]);
		}
		$this->settings()->setAdmin(['local_allowlist' => ['http://127.0.0.1:9000/v1']]);
		$personal = $ai->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'http://127.0.0.1:9000/v1/', 'model' => 'm'], 'apiKey' => 'sk-local-9999', 'defaultSource' => 'personal']);
		$this->assertSame('http://127.0.0.1:9000/v1', $personal['provider']['baseUrl']);
		$this->assertSame([true, '9999', 'personal'], [$personal['hasKey'], $personal['keyHint'], $personal['defaultSource']]);
		$this->assertStringNotContainsString('sk-local-9999', json_encode($personal));
		$personal = $ai->setPersonal('bob', ['apiKey' => null]);
		$this->assertTrue($personal['hasKey'], 'null keeps the key');
		$personal = $ai->setPersonal('bob', ['apiKey' => '', 'defaultSource' => null]);
		$this->assertSame([false, null], [$personal['hasKey'], $personal['defaultSource']]);

		$this->settings()->setAdmin(['allow_personal_keys' => false]);
		try {
			$ai->setPersonal('bob', ['apiKey' => 'sk-new-12345678']);
			$this->fail('personal keys are off');
		} catch (ApiException $e) {
			$this->assertSame([403, 'ai_unavailable'], [$e->getStatus(), $e->getErrorCode()]);
		}
	}

	public function testAPersonalKeyStaysWithItsAddress(): void {
		$ai = $this->aiSettings();
		$ai->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1', 'model' => 'm'], 'apiKey' => 'sk-bob-PRIVATE-99']);
		$this->assertTrue($ai->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1', 'model' => 'x']])['hasKey']);
		$this->assertFalse($ai->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'https://other.example.com/v1', 'model' => 'x']])['hasKey']);
		$personal = $ai->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'https://ai.example.com/v1', 'model' => 'x'], 'apiKey' => 'sk-bob-PRIVATE-99']);
		$this->assertTrue($personal['hasKey'], 'a key sent with the new address is stored');
		$this->assertSame(['preset' => 'custom', 'kind' => 'openai', 'baseUrl' => 'https://ai.example.com/v1', 'model' => 'x'], $this->user['bob']['ai_provider']);
	}

	public function testPersonalOutput(): void {
		$this->assertSame([
			'allowPersonalKeys' => true, 'provider' => null, 'hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false,
			'defaultSource' => null, 'presets' => Presets::publicList(), 'localAllowlist' => [],
		], $this->aiSettings()->getPersonal('bob'));
	}

	public function testPrivacyNotices(): void {
		$ai = $this->aiSettings();
		$this->user['bob']['ai_notice_ack'] = ['personal', 'bogus', 'nextcloud'];
		$this->assertSame(['nextcloud', 'personal'], $ai->noticeAcked('bob'), 'known sources, in their order');
		$this->assertSame(['nextcloud', 'personal', 'shared'], $ai->ackNotice('bob', AiSource::Shared));
		$this->assertSame(['nextcloud', 'shared', 'personal'], $ai->ackNotice('bob', AiSource::Shared), 'acknowledging twice stores nothing');
	}
}
