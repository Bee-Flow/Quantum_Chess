<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\SettingsService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IAppConfig;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IL10N;
use OCP\IUserManager;
use OCP\Security\RateLimiting\ILimiter;
use OCP\Security\RateLimiting\IRateLimitExceededException;

/**
 * AI limits and aggregated counters (docs/SPEC.md §10.6): `ai_requests_per_hour` per user across sources, one
 * concurrent request per user, the organisation provider's daily cap, per-day counters kept 30 days, and the
 * Nextcloud AI latencies for the admin status card. No per-user logs are kept.
 */
class AiUsageService {
	public const RETRY_AFTER = 300;
	public const BUSY_TTL = 120;
	public const KEEP_DAYS = 30;

	private ICache $cache;

	public function __construct(
		private IAppConfig $appConfig,
		private ILimiter $limiter,
		ICacheFactory $cacheFactory,
		private IUserManager $userManager,
		private ITimeFactory $time,
		private SettingsService $settings,
		private IL10N $l,
	) {
		$this->cache = $cacheFactory->createDistributed(Application::APP_ID . '-ai');
	}

	/**
	 * Register a request of the user: hourly limit and the one-at-a-time rule. Call end() afterwards.
	 *
	 * @throws ApiException 429 ai_rate_limited / ai_busy
	 */
	public function begin(string $uid): void {
		$user = $this->userManager->get($uid);
		if ($user !== null) {
			try {
				$this->limiter->registerUserRequest('quantumchess-ai', $this->settings->aiRequestsPerHour(), 3600, $user);
			} catch (IRateLimitExceededException) {
				throw new ApiException('ai_rate_limited', $this->l->t('You have reached the hourly limit for AI requests. Please try again later.'), 429, [], self::RETRY_AFTER);
			}
		}
		if ($this->cache instanceof \OCP\IMemcache && !$this->cache->add('busy:' . $uid, 1, self::BUSY_TTL)) {
			throw new ApiException('ai_busy', $this->l->t('Please wait for the previous AI answer.'), 429, [], 5);
		}
	}

	public function end(string $uid): void {
		$this->cache->remove('busy:' . $uid);
	}

	/**
	 * Count one request of a source for today.
	 */
	public function count(string $source): void {
		$key = 'usage_' . date('Ymd', $this->time->getTime());
		$counts = $this->appConfig->getValueArray(Application::APP_ID, $key, [], true);
		$counts[$source] = (int)($counts[$source] ?? 0) + 1;
		$this->appConfig->setValueArray(Application::APP_ID, $key, $counts, true);
	}

	/** @return array{nextcloud: int, shared: int, personal: int} */
	public function today(): array {
		$counts = $this->appConfig->getValueArray(Application::APP_ID, 'usage_' . date('Ymd', $this->time->getTime()), [], true);
		return [
			'nextcloud' => (int)($counts['nextcloud'] ?? 0),
			'shared' => (int)($counts['shared'] ?? 0),
			'personal' => (int)($counts['personal'] ?? 0),
		];
	}

	public function sharedCapReached(): bool {
		$cap = $this->settings->sharedDailyCap();
		return $cap > 0 && $this->today()['shared'] >= $cap;
	}

	public function recordLatency(int $ms): void {
		$list = $this->latencies();
		$list[] = max(0, $ms);
		$this->appConfig->setValueArray(Application::APP_ID, 'nc_ai_latencies', array_slice($list, -10), true);
	}

	public function medianLatency(): ?int {
		$list = $this->latencies();
		if ($list === []) {
			return null;
		}
		sort($list);
		$n = count($list);
		return $n % 2 === 1 ? $list[intdiv($n, 2)] : intdiv($list[intdiv($n, 2) - 1] + $list[intdiv($n, 2)], 2);
	}

	/** @return list<int> */
	private function latencies(): array {
		$list = $this->appConfig->getValueArray(Application::APP_ID, 'nc_ai_latencies', [], true);
		return array_values(array_map('intval', array_filter($list, 'is_numeric')));
	}

	/**
	 * Delete usage counters older than 30 days.
	 */
	public function cleanup(int $now): void {
		$cutoff = date('Ymd', $now - self::KEEP_DAYS * 86400);
		foreach ($this->appConfig->getKeys(Application::APP_ID) as $key) {
			if (preg_match('/^usage_(\d{8})$/', $key, $m) === 1 && $m[1] < $cutoff) {
				$this->appConfig->deleteKey(Application::APP_ID, $key);
			}
		}
	}
}
