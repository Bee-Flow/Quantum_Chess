<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Settings;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Settings\AdminSetting;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Service\Settings\SettingDefinition;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The admin settings: defaults, ranges, validation, the organisation provider, and the output of the settings API.
 */
#[CoversClass(AppSettings::class)]
#[CoversClass(AdminSetting::class)]
#[CoversClass(SettingDefinition::class)]
final class AppSettingsTest extends TestCase {
	use SettingsFixture;

	public function testAdminDefaultsAndValidation(): void {
		$settings = $this->settings();
		$admin = $settings->getAdmin();
		$this->assertSame(14, $admin['invite_expiry_days']);
		$this->assertSame('opt-in', $admin['leaderboard_mode']);
		$this->assertFalse($admin['shared_enabled']);
		$this->assertSame(['hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false], $admin['shared_api_key']);

		$saved = $settings->setAdmin([
			'invite_expiry_days' => 30,
			'purge_finished_days' => 0,
			'mp_groups' => ['staff', 'ghosts'],
			'local_allowlist' => ['http://localhost:11434/v1/'],
		]);
		$this->assertSame(30, $saved['invite_expiry_days']);
		$this->assertSame(['staff'], $saved['mp_groups'], 'unknown groups are dropped');
		$this->assertSame(['http://localhost:11434/v1'], $saved['local_allowlist']);

		foreach ([
			['invite_expiry_days' => 61], ['purge_finished_days' => 10], ['leaderboard_mode' => 'maybe'],
			['mp_enabled' => 'yes'], ['shared_api_key' => 'x'], ['unknown' => 1], ['local_allowlist' => ['not a url']],
			['ai_privacy_notice' => str_repeat('x', 1001)], ['shared_provider' => ['preset' => 'nope']],
		] as $patch) {
			try {
				$settings->setAdmin($patch);
				$this->fail('rejected: ' . json_encode($patch));
			} catch (ApiException $e) {
				$this->assertSame(
					[400, 'invalid_argument', array_key_first($patch)],
					[$e->getStatus(), $e->getErrorCode(), $e->getExtra()['field']],
				);
			}
		}
		$this->assertSame(30, $settings->inviteExpiryDays(), 'nothing was stored by a rejected patch');
	}

	public function testSharedProvider(): void {
		$settings = $this->settings();
		try {
			$settings->setAdmin(['shared_provider' => [
				'preset' => 'ollama',
				'baseUrl' => 'http://localhost:11434/v1',
				'model' => 'llama3',
			]]);
			$this->fail('local address refused');
		} catch (ApiException $e) {
			$this->assertSame('url_not_allowed', $e->getErrorCode());
		}
		$saved = $settings->setAdmin([
			'shared_allow_local' => true,
			'shared_provider' => [
				'preset' => 'ollama',
				'baseUrl' => 'http://localhost:11434/v1',
				'model' => 'llama3',
				'label' => 'Our AI',
			],
		]);
		$this->assertSame(
			[
				'preset' => 'ollama',
				'kind' => 'openai',
				'baseUrl' => 'http://localhost:11434/v1',
				'model' => 'llama3',
				'label' => 'Our AI',
			],
			$saved['shared_provider'],
		);
		// hosted presets always use their own URL
		$saved = $settings->setAdmin(['shared_provider' => [
			'preset' => 'anthropic',
			'baseUrl' => 'https://evil.example.com',
			'model' => 'claude-opus-5',
		]]);
		$this->assertSame('https://api.anthropic.com/v1', $saved['shared_provider']['baseUrl']);
		$this->assertSame('anthropic', $saved['shared_provider']['kind']);
		$saved = $settings->setAdmin(['shared_provider' => null]);
		$this->assertNull($saved['shared_provider'], 'null removes the provider');
	}

	public function testANewAddressDropsTheSharedKey(): void {
		$settings = $this->settings();
		$settings->setAdmin(['shared_provider' => [
			'preset' => 'custom',
			'baseUrl' => 'https://ai.example.com/v1',
			'model' => 'm',
		]]);
		$this->aiSettings()->setAdminSecret('shared_api_key', 'sk-org-SECRET-1234');
		$saved = $settings->setAdmin(['shared_provider' => [
			'preset' => 'custom',
			'baseUrl' => 'https://ai.example.com/v1/',
			'model' => 'm2',
			'label' => 'AI',
		]]);
		$this->assertTrue($saved['shared_api_key']['hasKey'], 'model and label changes keep the key');
		$saved = $settings->setAdmin(['shared_provider' => [
			'preset' => 'custom',
			'baseUrl' => 'https://attacker.example.com/v1',
			'model' => 'm2',
		]]);
		$this->assertFalse(
			$saved['shared_api_key']['hasKey'],
			'a new address drops the key (it was confirmed with the password)',
		);
	}

	/**
	 * Stored admin values as the admin page and the settings API show them: every key in a fixed order, clamped to
	 * its range, with unknown enum values and non-string list entries replaced.
	 *
	 * @return array<string, array{array<string, mixed>, array<string, mixed>}>
	 */
	public static function adminOutput(): array {
		return [
			'defaults' => [[], self::ADMIN_DEFAULTS],
			'stored values' => [[
				'mp_enabled' => false, 'mp_groups' => ['staff', 5, 'chess'],
				'invite_expiry_days' => 100, 'open_expiry_days' => 0,
				'max_active_games' => 50, 'chat_retention_days' => 7, 'purge_finished_days' => 5,
				'leaderboard_mode' => 'weird',
				'leaderboard_min_games' => 3, 'shared_enabled' => true, 'shared_daily_cap' => -1,
				'shared_model_allowlist' => ['gpt-5', null],
				'shared_provider' => [
					'preset' => 'mistral',
					'baseUrl' => 'https://api.mistral.ai/v1',
					'model' => 'mistral-small-latest',
					'label' => 'Team',
				],
				'local_allowlist' => ['http://localhost:11434/v1'], 'ai_max_output_tokens' => 99999,
				'ai_privacy_notice' => 'Be nice.',
			], array_replace(self::ADMIN_DEFAULTS, [
				'mp_enabled' => false, 'mp_groups' => ['staff', 'chess'],
				'invite_expiry_days' => 60, 'open_expiry_days' => 1,
				'max_active_games' => 50, 'chat_retention_days' => 7, 'purge_finished_days' => 30,
				'leaderboard_mode' => 'opt-in',
				'leaderboard_min_games' => 3, 'shared_enabled' => true,
				'shared_provider' => [
					'preset' => 'mistral',
					'kind' => 'openai',
					'baseUrl' => 'https://api.mistral.ai/v1',
					'model' => 'mistral-small-latest',
					'label' => 'Team',
				],
				'shared_daily_cap' => 0, 'shared_model_allowlist' => ['gpt-5'],
				'local_allowlist' => ['http://localhost:11434/v1'],
				'ai_max_output_tokens' => 4000, 'ai_privacy_notice' => 'Be nice.',
			])],
			'purging turned off' => [
				['purge_finished_days' => -4],
				array_replace(self::ADMIN_DEFAULTS, ['purge_finished_days' => 0]),
			],
			'unknown provider preset' => [
				['shared_provider' => ['preset' => 'nope', 'baseUrl' => 'https://x.example.com']],
				self::ADMIN_DEFAULTS,
			],
		];
	}

	#[DataProvider('adminOutput')]
	public function testAdminOutput(array $stored, array $expected): void {
		$this->app = $stored;
		$this->assertSame($expected, $this->settings()->getAdmin());
	}

	private const ADMIN_DEFAULTS = [
		'mp_enabled' => true,
		'mp_groups' => [],
		'open_challenges' => true,
		'rated_enabled' => true,
		'invite_expiry_days' => 14,
		'open_expiry_days' => 7,
		'max_active_games' => 30,
		'chat_enabled' => true,
		'chat_retention_days' => 90,
		'purge_finished_days' => 0,
		'leaderboard_mode' => 'opt-in',
		'leaderboard_min_games' => 5,
		'leaderboard_active_days' => 90,
		'leaderboard_groups' => [],
		'nc_ai_enabled' => true,
		'shared_enabled' => false,
		'shared_provider' => null,
		'shared_groups' => [],
		'shared_daily_cap' => 1000,
		'shared_model_allowlist' => [],
		'allow_personal_keys' => true,
		'shared_allow_local' => false,
		'local_allowlist' => [],
		'ai_requests_per_hour' => 60,
		'ai_max_output_tokens' => 800,
		'ai_safety_identifier' => false,
		'ai_privacy_notice' => '',
		'shared_api_key' => ['hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false],
	];

	public function testAppSecretIsCreatedOnce(): void {
		$secret = $this->settings()->appSecret();
		$this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $secret);
		$this->assertSame($secret, $this->settings()->appSecret());
	}
}
