<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Ai;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\AiUsageService;
use OCA\QuantumChess\Service\Ai\KeyStore;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCA\QuantumChess\Service\Ai\NextcloudAiProvider;
use OCA\QuantumChess\Service\Ai\PromptBuilder;
use OCA\QuantumChess\Service\Ai\UrlGuard;
use OCA\QuantumChess\Service\Ai\UrlNotAllowedException;
use OCA\QuantumChess\Service\RatingService;
use OCA\QuantumChess\Service\SettingsService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Config\IUserConfig;
use OCP\Http\Client\IClientService;
use OCP\IAppConfig;
use OCP\ICacheFactory;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Security\ICrypto;
use OCP\Security\RateLimiting\ILimiter;
use OCP\Security\RateLimiting\IRateLimitExceededException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * UrlGuard matrix, KeyStore, SettingsService validation, source availability, limits and request validation
 * (docs/SPEC.md §10.1, §10.6, §10.7, §11, §12.2).
 */
final class SettingsAndSourcesTest extends TestCase {
	/** @var array<string, mixed> */
	private array $app = [];
	/** @var array<string, array<string, mixed>> */
	private array $user = [];
	private ArrayMemcache $cache;
	private bool $limited = false;
	/** @var list<string> */
	private array $groupsOfBob = ['staff'];
	private ?string $taskType = null;

	protected function setUp(): void {
		$this->cache = new ArrayMemcache();
	}

	private function appConfig(): IAppConfig {
		$config = $this->createMock(IAppConfig::class);
		$get = fn (string $app, string $key, mixed $default = null) => $this->app[$key] ?? $default;
		$set = function (string $app, string $key, mixed $value) {
			$this->app[$key] = $value;
			return true;
		};
		foreach (['getValueBool', 'getValueInt', 'getValueString', 'getValueArray'] as $method) {
			$config->method($method)->willReturnCallback($get);
		}
		foreach (['setValueBool', 'setValueInt', 'setValueString', 'setValueArray'] as $method) {
			$config->method($method)->willReturnCallback($set);
		}
		$config->method('deleteKey')->willReturnCallback(function (string $app, string $key): void {
			unset($this->app[$key]);
		});
		$config->method('getKeys')->willReturnCallback(fn () => array_keys($this->app));
		return $config;
	}

	private function userConfig(): IUserConfig {
		$config = $this->createMock(IUserConfig::class);
		$get = fn (string $uid, string $app, string $key, mixed $default = null) => $this->user[$uid][$key] ?? $default;
		$set = function (string $uid, string $app, string $key, mixed $value) {
			$this->user[$uid][$key] = $value;
			return true;
		};
		foreach (['getValueBool', 'getValueString', 'getValueArray'] as $method) {
			$config->method($method)->willReturnCallback($get);
		}
		foreach (['setValueBool', 'setValueString', 'setValueArray'] as $method) {
			$config->method($method)->willReturnCallback($set);
		}
		$config->method('deleteUserConfig')->willReturnCallback(function (string $uid, string $app, string $key): void {
			unset($this->user[$uid][$key]);
		});
		return $config;
	}

	private function l(): IL10N {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnArgument(0);
		return $l;
	}

	private function crypto(): ICrypto {
		$crypto = $this->createMock(ICrypto::class);
		$crypto->method('encrypt')->willReturnCallback(fn (string $plain) => 'enc:' . strrev($plain));
		$crypto->method('decrypt')->willReturnCallback(function (string $cipher) {
			if (!str_starts_with($cipher, 'enc:')) {
				throw new \RuntimeException('HMAC does not match');
			}
			return strrev(substr($cipher, 4));
		});
		return $crypto;
	}

	private function guard(): UrlGuard {
		return new class extends UrlGuard {
			protected function resolve(string $host): array {
				return match ($host) {
					'internal.example.com' => ['10.1.2.3'],
					'rebind.example.com' => ['93.184.216.34', '127.0.0.1'],
					default => ['93.184.216.34'],
				};
			}
		};
	}

	private function keys(): KeyStore {
		return new KeyStore($this->appConfig(), $this->userConfig(), $this->crypto());
	}

	private function settings(): SettingsService {
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('groupExists')->willReturnCallback(fn (string $gid) => in_array($gid, ['staff', 'admin'], true));
		$groups->method('isInGroup')->willReturnCallback(fn (string $uid, string $gid) => $uid === 'bob' && in_array($gid, $this->groupsOfBob, true));
		$users = $this->createMock(IUserManager::class);
		$users->method('get')->willReturn($this->createMock(IUser::class));
		return new SettingsService($this->appConfig(), $this->userConfig(), $groups, $users, $this->l(), $this->keys(), $this->guard(), $this->createMock(RatingService::class));
	}

	private function usage(SettingsService $settings): AiUsageService {
		$limiter = $this->createMock(ILimiter::class);
		$limiter->method('registerUserRequest')->willReturnCallback(function (): void {
			if ($this->limited) {
				throw new class('limited') extends \Exception implements IRateLimitExceededException {
				};
			}
		});
		$factory = $this->createMock(ICacheFactory::class);
		$factory->method('createDistributed')->willReturn($this->cache);
		$users = $this->createMock(IUserManager::class);
		$users->method('get')->willReturn($this->createMock(IUser::class));
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		return new AiUsageService($this->appConfig(), $limiter, $factory, $users, $time, $settings, $this->l());
	}

	private function sources(SettingsService $settings): AiSourceService {
		$nc = $this->createMock(NextcloudAiProvider::class);
		$nc->method('taskType')->willReturnCallback(fn () => $this->taskType);
		$nc->method('providerName')->willReturn('Local LLM');
		return new AiSourceService($settings, $this->keys(), $nc, $this->usage($settings), $this->guard(), $this->l());
	}

	// ------------------------------------------------------------------ UrlGuard

	/** @return array<string, array{string, string, bool, list<string>, ?bool}> url, scope, sharedAllowLocal, allowlist → allowLocal (null = refused) */
	public static function urls(): array {
		return [
			'public https' => ['https://api.openai.com/v1/', 'personal', false, [], false],
			'public http' => ['http://api.openai.com/v1', 'personal', false, [], null],
			'credentials' => ['https://user:pw@api.openai.com/v1', 'personal', false, [], null],
			'query' => ['https://api.openai.com/v1?x=1', 'personal', false, [], null],
			'ftp' => ['ftp://api.openai.com/v1', 'personal', false, [], null],
			'localhost refused' => ['http://localhost:11434/v1', 'personal', false, [], null],
			'localhost allow-listed' => ['http://LOCALHOST:11434/v1/', 'personal', false, ['http://localhost:11434/v1'], true],
			'allow-list is exact' => ['http://localhost:11434/v2', 'personal', false, ['http://localhost:11434/v1'], null],
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
	public function testUrlGuard(string $url, string $scope, bool $sharedAllowLocal, array $allowlist, ?bool $allowLocal): void {
		try {
			$result = $this->guard()->check($url, $scope, $sharedAllowLocal, $allowlist);
			$this->assertSame($allowLocal, $result['allowLocal']);
			$this->assertStringEndsNotWith('/', $result['url']);
		} catch (UrlNotAllowedException) {
			$this->assertNull($allowLocal, 'refused');
		}
	}

	// ------------------------------------------------------------------ KeyStore

	public function testKeysAreEncryptedAndNeverReturned(): void {
		$keys = $this->keys();
		$keys->setPersonal('bob', 'sk-abcdefgh1234');
		$this->assertStringStartsWith('enc:', $this->user['bob']['ai_api_key']);
		$this->assertSame(['hasKey' => true, 'keyHint' => '1234', 'keyUnreadable' => false], $keys->personalInfo('bob'));
		$this->assertSame('sk-abcdefgh1234', $keys->getPersonal('bob'));
		$this->user['bob']['ai_api_key'] = 'garbage';
		$this->assertSame(['hasKey' => true, 'keyHint' => null, 'keyUnreadable' => true], $keys->personalInfo('bob'));
		$this->assertNull($keys->getPersonal('bob'));
		$keys->setPersonal('bob', '');
		$this->assertSame(['hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false], $keys->personalInfo('bob'));
	}

	// ------------------------------------------------------------------ SettingsService

	public function testAdminDefaultsAndValidation(): void {
		$settings = $this->settings();
		$admin = $settings->getAdmin();
		$this->assertSame(14, $admin['invite_expiry_days']);
		$this->assertSame('opt-in', $admin['leaderboard_mode']);
		$this->assertFalse($admin['shared_enabled']);
		$this->assertSame(['hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false], $admin['shared_api_key']);

		$saved = $settings->setAdmin(['invite_expiry_days' => 30, 'purge_finished_days' => 0, 'mp_groups' => ['staff', 'ghosts'], 'local_allowlist' => ['http://localhost:11434/v1/']]);
		$this->assertSame(30, $saved['invite_expiry_days']);
		$this->assertSame(['staff'], $saved['mp_groups'], 'unknown groups are dropped');
		$this->assertSame(['http://localhost:11434/v1'], $saved['local_allowlist']);

		foreach ([['invite_expiry_days' => 61], ['purge_finished_days' => 10], ['leaderboard_mode' => 'maybe'], ['mp_enabled' => 'yes'],
			['shared_api_key' => 'x'], ['unknown' => 1], ['local_allowlist' => ['not a url']], ['ai_privacy_notice' => str_repeat('x', 1001)],
			['shared_provider' => ['preset' => 'nope']]] as $patch) {
			try {
				$settings->setAdmin($patch);
				$this->fail('rejected: ' . json_encode($patch));
			} catch (ApiException $e) {
				$this->assertSame([400, 'invalid_argument', array_key_first($patch)], [$e->getStatus(), $e->getErrorCode(), $e->getExtra()['field']]);
			}
		}
		$this->assertSame(30, $settings->inviteExpiryDays(), 'nothing was stored by a rejected patch');
	}

	public function testSharedProviderAndSecret(): void {
		$settings = $this->settings();
		try {
			$settings->setAdmin(['shared_provider' => ['preset' => 'ollama', 'baseUrl' => 'http://localhost:11434/v1', 'model' => 'llama3']]);
			$this->fail('local address refused');
		} catch (ApiException $e) {
			$this->assertSame('url_not_allowed', $e->getErrorCode());
		}
		$saved = $settings->setAdmin(['shared_allow_local' => true, 'shared_provider' => ['preset' => 'ollama', 'baseUrl' => 'http://localhost:11434/v1', 'model' => 'llama3', 'label' => 'Our AI']]);
		$this->assertSame(['preset' => 'ollama', 'kind' => 'openai', 'baseUrl' => 'http://localhost:11434/v1', 'model' => 'llama3', 'label' => 'Our AI'], $saved['shared_provider']);
		// hosted presets always use their own URL
		$saved = $settings->setAdmin(['shared_provider' => ['preset' => 'anthropic', 'baseUrl' => 'https://evil.example.com', 'model' => 'claude-opus-5']]);
		$this->assertSame('https://api.anthropic.com/v1', $saved['shared_provider']['baseUrl']);
		$this->assertSame('anthropic', $saved['shared_provider']['kind']);

		$info = $settings->setAdminSecret('shared_api_key', 'sk-ant-api03-XYZW');
		$this->assertSame(['hasKey' => true, 'keyHint' => 'XYZW', 'keyUnreadable' => false], $info);
		$this->assertStringNotContainsString('sk-ant-api03-XYZW', json_encode($settings->getAdmin()));
		$this->expectException(ApiException::class);
		$settings->setAdminSecret('other_key', 'x');
	}

	public function testPersonalSettings(): void {
		$settings = $this->settings();
		try {
			$settings->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'http://127.0.0.1:9000/v1', 'model' => 'm']]);
			$this->fail('local refused');
		} catch (ApiException $e) {
			$this->assertSame(['url_not_allowed', 'provider'], [$e->getErrorCode(), $e->getExtra()['field']]);
		}
		$settings->setAdmin(['local_allowlist' => ['http://127.0.0.1:9000/v1']]);
		$personal = $settings->setPersonal('bob', ['provider' => ['preset' => 'custom', 'baseUrl' => 'http://127.0.0.1:9000/v1/', 'model' => 'm'], 'apiKey' => 'sk-local-9999', 'defaultSource' => 'personal']);
		$this->assertSame('http://127.0.0.1:9000/v1', $personal['provider']['baseUrl']);
		$this->assertSame([true, '9999', 'personal'], [$personal['hasKey'], $personal['keyHint'], $personal['defaultSource']]);
		$this->assertStringNotContainsString('sk-local-9999', json_encode($personal));
		$personal = $settings->setPersonal('bob', ['apiKey' => null]);
		$this->assertTrue($personal['hasKey'], 'null keeps the key');
		$personal = $settings->setPersonal('bob', ['apiKey' => '', 'defaultSource' => null]);
		$this->assertSame([false, null], [$personal['hasKey'], $personal['defaultSource']]);

		$settings->setAdmin(['allow_personal_keys' => false]);
		try {
			$settings->setPersonal('bob', ['apiKey' => 'sk-new-12345678']);
			$this->fail('personal keys are off');
		} catch (ApiException $e) {
			$this->assertSame([403, 'ai_unavailable'], [$e->getStatus(), $e->getErrorCode()]);
		}
	}

	public function testNotificationSwitches(): void {
		$settings = $this->settings();
		$result = $settings->setMultiplayer('bob', ['notifications' => ['chat' => false, 'previews' => false]]);
		$this->assertFalse($result['notifications']['chat']);
		$this->assertTrue($result['notifications']['yourTurn']);
		$this->assertSame(['invites' => true, 'yourTurn' => true, 'reminders' => true, 'drawOffers' => true, 'results' => true, 'chat' => false, 'previews' => false], $settings->notificationSwitches('bob'));
		$this->expectException(ApiException::class);
		$settings->setMultiplayer('bob', ['notifications' => ['chat' => 'no']]);
	}

	// ------------------------------------------------------------------ sources

	public function testSourceAvailability(): void {
		$settings = $this->settings();
		$sources = $this->sources($settings);
		$summary = $sources->summary('bob');
		$this->assertSame(['nextcloud' => false, 'shared' => false, 'personal' => false, 'any' => false, 'default' => null], $summary);
		$list = $sources->sourcesFor('bob')['sources'];
		$this->assertSame(['no_provider', 'disabled', 'not_configured'], array_column($list, 'reason'));

		$this->taskType = 'core:text2text:chat';
		$settings->setAdmin(['shared_enabled' => true, 'shared_groups' => ['staff'], 'shared_provider' => ['preset' => 'openai', 'model' => 'gpt-5-mini']]);
		$this->assertSame('not_configured', $sources->sourcesFor('bob')['sources'][1]['reason'], 'no key yet');
		$settings->setAdminSecret('shared_api_key', 'sk-shared-00000000');
		$settings->setPersonal('bob', ['provider' => ['preset' => 'openai', 'model' => 'gpt-5']]);
		$list = $sources->sourcesFor('bob');
		$this->assertSame([null, null, 'no_key'], array_column($list['sources'], 'reason'));
		$this->assertSame('Local LLM', $list['sources'][0]['providerName']);
		$this->assertSame('nextcloud', $list['default']);

		$settings->setPersonal('bob', ['apiKey' => 'sk-bob-12345678', 'defaultSource' => 'personal']);
		$this->assertSame('personal', $sources->summary('bob')['default']);
		$resolved = $sources->resolve('bob', 'personal');
		$this->assertSame(['openai', 'https://api.openai.com/v1', 'gpt-5', 'sk-bob-12345678', false], [$resolved['kind'], $resolved['baseUrl'], $resolved['model'], $resolved['apiKey'], $resolved['allowLocal']]);

		$this->groupsOfBob = [];
		$this->assertSame('not_allowed', $sources->sourcesFor('bob')['sources'][1]['reason']);
		$this->groupsOfBob = ['staff'];
		$settings->setAdmin(['shared_daily_cap' => 2]);
		$this->app['usage_' . date('Ymd', 1790000000)] = ['shared' => 2];
		$this->assertSame('cap_reached', $sources->sourcesFor('bob')['sources'][1]['reason']);
		try {
			$sources->resolve('bob', 'shared');
			$this->fail('unavailable');
		} catch (ApiException $e) {
			$this->assertSame([403, 'ai_unavailable', 'cap_reached'], [$e->getStatus(), $e->getErrorCode(), $e->getExtra()['reason']]);
		}
	}

	// ------------------------------------------------------------------ limits

	public function testLimitsAndCounters(): void {
		$usage = $this->usage($this->settings());
		$usage->begin('bob');
		try {
			$usage->begin('bob');
			$this->fail('one request at a time');
		} catch (ApiException $e) {
			$this->assertSame([429, 'ai_busy'], [$e->getStatus(), $e->getErrorCode()]);
		}
		$usage->end('bob');
		$usage->begin('bob');
		$usage->end('bob');
		$this->limited = true;
		try {
			$usage->begin('bob');
			$this->fail('rate limited');
		} catch (ApiException $e) {
			$this->assertSame([429, 'ai_rate_limited', AiUsageService::RETRY_AFTER], [$e->getStatus(), $e->getErrorCode(), $e->getRetryAfter()]);
		}
		$usage->count('personal');
		$usage->count('personal');
		$this->assertSame(['nextcloud' => 0, 'shared' => 0, 'personal' => 2], $usage->today());
		$this->app['usage_20200101'] = ['shared' => 1];
		$usage->cleanup(1790000000);
		$this->assertArrayNotHasKey('usage_20200101', $this->app);
		$this->assertArrayHasKey('usage_' . date('Ymd', 1790000000), $this->app);
		foreach ([9000, 1000, 5000] as $ms) {
			$usage->recordLatency($ms);
		}
		$this->assertSame(5000, $usage->medianLatency());
	}

	// ------------------------------------------------------------------ request validation (no provider is ever called)

	public function testMoveRequestValidation(): void {
		$settings = $this->settings();
		$engine = new Engine();
		$factory = $this->createMock(ICacheFactory::class);
		$factory->method('createDistributed')->willReturn($this->cache);
		$clients = $this->createMock(IClientService::class);
		$clients->expects($this->never())->method('newClient');
		$llm = new LlmService($engine, new PromptBuilder($engine), $this->sources($settings), $this->usage($settings), $settings,
			$this->createMock(NextcloudAiProvider::class), $this->keys(), $this->guard(), $clients, $factory, $this->l(), $this->createMock(LoggerInterface::class));
		$state = $engine->initialState();
		$valid = ['source' => 'personal', 'persona' => 'professor', 'color' => 'w', 'language' => 'en', 'state' => $state,
			'candidates' => [['code' => 'e2-e4', 'E' => 0.5, 'tags' => [], 'ok' => true]]];
		$cases = [
			'source' => ['source' => 'openai'],
			'persona' => ['persona' => 'grandpa'],
			'color' => ['color' => 'b'],
			'state' => ['state' => ['v' => 1]],
			'candidates' => ['candidates' => [['code' => 'e2-e5', 'E' => 0.5]]],
			'no candidates' => ['candidates' => []],
			'message' => ['message' => str_repeat('x', 201)],
			'feedback' => ['feedback' => ['answer' => 'x', 'reason' => 'whatever']],
			'language' => ['language' => '../etc'],
			'model' => ['model' => 'bad model!'],
		];
		foreach ($cases as $name => $patch) {
			try {
				$llm->requestMove('bob', $patch + $valid);
				$this->fail("rejected: $name");
			} catch (ApiException $e) {
				$this->assertContains($e->getErrorCode(), ['invalid_argument', 'invalid_state'], $name);
				$this->assertSame(400, $e->getStatus(), $name);
			}
		}
		try {
			$llm->requestMove('bob', $valid);
			$this->fail('personal source not configured');
		} catch (ApiException $e) {
			$this->assertSame([403, 'ai_unavailable'], [$e->getStatus(), $e->getErrorCode()]);
		}
	}
}
