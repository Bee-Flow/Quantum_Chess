<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Support;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Service\Ai\AiSettingsService;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\AiUsageService;
use OCA\QuantumChess\Service\Ai\ConnectionTester;
use OCA\QuantumChess\Service\Ai\KeyStore;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCA\QuantumChess\Service\Ai\Prompt\PromptBuilder;
use OCA\QuantumChess\Service\Ai\Provider\NextcloudAiProvider;
use OCA\QuantumChess\Service\Ai\Provider\ProviderFactory;
use OCA\QuantumChess\Service\Ai\Provider\ProviderValidator;
use OCA\QuantumChess\Service\Ai\Provider\UrlGuard;
use OCA\QuantumChess\Service\Ai\Request\AiRequestValidator;
use OCA\QuantumChess\Service\Player\RatingService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
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
use Psr\Log\LoggerInterface;

/**
 * The settings and LLM services on top of in-memory app and user config, a fake cipher and a UrlGuard without DNS.
 *
 * The services are created anew by each call; their state lives in `$app` (app config) and `$user` (user config).
 *
 * @psalm-require-extends \PHPUnit\Framework\TestCase
 */
trait SettingsFixture {
	/** @var array<string, mixed> app config key → value */
	private array $app = [];
	/** @var array<string, array<string, mixed>> user → key → value */
	private array $user = [];
	private ?ArrayMemcache $cache = null;
	/** Whether the hourly rate limit is reached. */
	private bool $limited = false;
	/** @var list<string> */
	private array $groupsOfBob = ['staff'];
	/** The task type Nextcloud Assistant offers, or null. */
	private ?string $taskType = null;

	private function cache(): ArrayMemcache {
		return $this->cache ??= new ArrayMemcache();
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

	/** A reversible fake cipher; anything it did not encrypt fails to decrypt. */
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

	/** A UrlGuard with fixed DNS answers. */
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

	private function providerValidator(): ProviderValidator {
		return new ProviderValidator($this->guard(), $this->l());
	}

	private function settings(): AppSettings {
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('groupExists')->willReturnCallback(fn (string $gid) => in_array($gid, ['staff', 'admin'], true));
		$groups->method('isInGroup')->willReturnCallback(fn (string $uid, string $gid) => $uid === 'bob' && in_array($gid, $this->groupsOfBob, true));
		$users = $this->createMock(IUserManager::class);
		$users->method('get')->willReturn($this->createMock(IUser::class));
		return new AppSettings($this->appConfig(), $groups, $users, $this->l(), $this->keys(), $this->guard(), $this->providerValidator());
	}

	private function aiSettings(): AiSettingsService {
		return new AiSettingsService($this->settings(), $this->userConfig(), $this->keys(), $this->providerValidator(), $this->l());
	}

	private function multiplayerSettings(): MultiplayerSettingsService {
		return new MultiplayerSettingsService($this->userConfig(), $this->createMock(RatingService::class), $this->settings(), $this->l());
	}

	private function usage(): AiUsageService {
		$limiter = $this->createMock(ILimiter::class);
		$limiter->method('registerUserRequest')->willReturnCallback(function (): void {
			if ($this->limited) {
				throw new class('limited') extends \Exception implements IRateLimitExceededException {
				};
			}
		});
		$users = $this->createMock(IUserManager::class);
		$users->method('get')->willReturn($this->createMock(IUser::class));
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		return new AiUsageService($this->appConfig(), $limiter, $this->cacheFactory(), $users, $time, $this->settings(), $this->l());
	}

	private function cacheFactory(): ICacheFactory {
		$factory = $this->createMock(ICacheFactory::class);
		$factory->method('createDistributed')->willReturn($this->cache());
		return $factory;
	}

	private function nextcloudAi(): NextcloudAiProvider {
		$nc = $this->createMock(NextcloudAiProvider::class);
		$nc->method('taskType')->willReturnCallback(fn () => $this->taskType);
		$nc->method('providerName')->willReturn('Local LLM');
		return $nc;
	}

	private function sources(): AiSourceService {
		return new AiSourceService($this->settings(), $this->aiSettings(), $this->keys(), $this->nextcloudAi(), $this->usage(), $this->guard(),
			$this->providerValidator(), $this->l());
	}

	private function providerFactory(IClientService $clients): ProviderFactory {
		return new ProviderFactory($this->nextcloudAi(), $clients, $this->cacheFactory(), $this->createMock(LoggerInterface::class));
	}

	private function validator(): AiRequestValidator {
		return new AiRequestValidator(new Engine(), $this->sources(), $this->l());
	}

	private function llm(IClientService $clients): LlmService {
		return new LlmService($this->validator(), new PromptBuilder(new Engine()), $this->sources(), $this->usage(), $this->settings(),
			$this->nextcloudAi(), $this->providerFactory($clients), $this->cacheFactory(), $this->l(), $this->createMock(LoggerInterface::class));
	}

	private function tester(IClientService $clients): ConnectionTester {
		return new ConnectionTester($this->aiSettings(), $this->settings(), $this->keys(), $this->guard(), $this->providerFactory($clients), $this->l());
	}
}
