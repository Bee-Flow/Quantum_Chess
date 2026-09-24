<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSource;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\Provider\ProviderKind;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Which LLM sources a user may use, why the others are unavailable, and the connection to a source.
 */
#[CoversClass(AiSourceService::class)]
final class AiSourceServiceTest extends TestCase {
	use SettingsFixture;

	public function testSourceAvailability(): void {
		$settings = $this->settings();
		$ai = $this->aiSettings();
		$sources = $this->sources();
		$summary = $sources->summary('bob');
		$this->assertSame(['nextcloud' => false, 'shared' => false, 'personal' => false, 'any' => false, 'default' => null], $summary);
		$list = $sources->sourcesFor('bob')['sources'];
		$this->assertSame(['no_provider', 'disabled', 'not_configured'], array_column($list, 'reason'));

		$this->taskType = 'core:text2text:chat';
		$settings->setAdmin(['shared_enabled' => true, 'shared_groups' => ['staff'], 'shared_provider' => ['preset' => 'openai', 'model' => 'gpt-5-mini']]);
		$this->assertSame('not_configured', $sources->sourcesFor('bob')['sources'][1]['reason'], 'no key yet');
		$ai->setAdminSecret('shared_api_key', 'sk-shared-00000000');
		$ai->setPersonal('bob', ['provider' => ['preset' => 'openai', 'model' => 'gpt-5']]);
		$list = $sources->sourcesFor('bob');
		$this->assertSame([null, null, 'no_key'], array_column($list['sources'], 'reason'));
		$this->assertSame('Local LLM', $list['sources'][0]['providerName']);
		$this->assertSame('nextcloud', $list['default']);

		$ai->setPersonal('bob', ['apiKey' => 'sk-bob-12345678', 'defaultSource' => 'personal']);
		$this->assertSame('personal', $sources->summary('bob')['default']);
		$resolved = $sources->resolve('bob', AiSource::Personal);
		$this->assertSame([ProviderKind::OpenAi, 'https://api.openai.com/v1', 'gpt-5', 'sk-bob-12345678', false], [$resolved->kind, $resolved->baseUrl, $resolved->model, $resolved->apiKey, $resolved->allowLocal]);

		$this->groupsOfBob = [];
		$this->assertSame('not_allowed', $sources->sourcesFor('bob')['sources'][1]['reason']);
		$this->groupsOfBob = ['staff'];
		$settings->setAdmin(['shared_daily_cap' => 2]);
		$this->app['usage_' . date('Ymd', 1790000000)] = ['shared' => 2];
		$this->assertSame('cap_reached', $sources->sourcesFor('bob')['sources'][1]['reason']);
		try {
			$sources->resolve('bob', AiSource::Shared);
			$this->fail('unavailable');
		} catch (ApiException $e) {
			$this->assertSame([403, 'ai_unavailable', 'cap_reached'], [$e->getStatus(), $e->getErrorCode(), $e->getExtra()['reason']]);
		}
	}

	public function testSourceDetails(): void {
		$this->taskType = 'core:text2text';
		$this->settings()->setAdmin(['shared_enabled' => true, 'shared_model_allowlist' => ['m1', 'm2'],
			'shared_provider' => ['preset' => 'mistral', 'model' => '', 'label' => 'Team AI']]);
		$this->aiSettings()->setAdminSecret('shared_api_key', 'sk-shared-00000000');
		$this->user['bob']['ai_notice_ack'] = ['shared'];
		$result = $this->sources()->sourcesFor('bob');
		$this->assertSame([
			['id' => 'nextcloud', 'label' => 'Nextcloud AI', 'available' => true, 'reason' => null, 'providerName' => 'Local LLM', 'taskType' => 'core:text2text', 'models' => null, 'noticeAcked' => false],
			['id' => 'shared', 'label' => 'Team AI', 'available' => true, 'reason' => null, 'preset' => 'mistral', 'model' => null, 'models' => ['m1', 'm2'], 'noticeAcked' => true],
			['id' => 'personal', 'label' => 'My own API key', 'available' => false, 'reason' => 'not_configured', 'preset' => null, 'model' => null, 'keyHint' => null, 'noticeAcked' => false],
		], $result['sources']);
		$this->assertSame(['nextcloud', ''], [$result['default'], $result['privacyNotice']]);
		$shared = $this->sources()->resolve('bob', AiSource::Shared);
		$this->assertSame([AiSource::Shared, ProviderKind::OpenAi, 'mistral', 'https://api.mistral.ai/v1', 'mistral-medium-latest', 'sk-shared-00000000', false, ['m1', 'm2']],
			[$shared->source, $shared->kind, $shared->preset, $shared->baseUrl, $shared->model, $shared->apiKey, $shared->allowLocal, $shared->modelAllowlist],
			'without a model the preset suggests one');
		$this->assertSame(ProviderKind::Nextcloud, $this->sources()->resolve('bob', AiSource::Nextcloud)->kind);
	}
}
