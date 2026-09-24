<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IAppConfig;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IL10N;
use OCP\IUserManager;
use OCP\Security\RateLimiting\ILimiter;
use OCP\Security\RateLimiting\IRateLimitExceededException;

/**
 * The limits and counters of LLM requests.
 *
 * A user may send `ai_requests_per_hour` requests per hour across all sources, and one at a time. The organisation
 * provider has a daily cap across all users. Requests are counted per source and day, and the counters are kept for
 * 30 days; the last Nextcloud Assistant latencies feed the admin status. No per-user records are kept.
 */
class AiUsageService {
	/** Seconds a rate-limited user is asked to wait. */
	public const RETRY_AFTER = 300;
	/** Seconds after which a request that never ended no longer blocks the user's next one. */
	public const BUSY_TTL = 120;
	/** Days the daily counters are kept. */
	public const KEEP_DAYS = 30;

	private ICache $cache;

	public function __construct(
		private readonly IAppConfig $appConfig,
		private readonly ILimiter $limiter,
		ICacheFactory $cacheFactory,
		private readonly IUserManager $userManager,
		private readonly ITimeFactory $time,
		private readonly AppSettings $settings,
		private readonly IL10N $l,
	) {
		$this->cache = $cacheFactory->createDistributed(Application::APP_ID . '-ai');
	}

	/**
	 * Registers a request of the user under the hourly limit and the one-at-a-time rule. Call end() afterwards.
	 *
	 * @throws ApiException ai_rate_limited or ai_busy
	 */
	public function begin(string $uid): void {
		$user = $this->userManager->get($uid);
		if ($user !== null) {
			try {
				$this->limiter->registerUserRequest('quantumchess-ai', $this->settings->aiRequestsPerHour(), 3600, $user);
			} catch (IRateLimitExceededException) {
				throw new ApiException(ApiError::AiRateLimited, $this->l->t('You have reached the hourly limit for AI requests. Please try again later.'), [], self::RETRY_AFTER);
			}
		}
		// The one-at-a-time rule needs an atomic add, which only a memory cache offers.
		if ($this->cache instanceof \OCP\IMemcache && !$this->cache->add('busy:' . $uid, 1, self::BUSY_TTL)) {
			throw new ApiException(ApiError::AiBusy, $this->l->t('Please wait for the previous AI answer.'), [], 5);
		}
	}

	/** Ends the request that begin() registered. */
	public function end(string $uid): void {
		$this->cache->remove('busy:' . $uid);
	}

	/**
	 * Counts one request of a source for today.
	 */
	public function count(string $source): void {
		$key = 'usage_' . date('Ymd', $this->time->getTime());
		$counts = $this->appConfig->getValueArray(Application::APP_ID, $key, [], true);
		$counts[$source] = (int)($counts[$source] ?? 0) + 1;
		$this->appConfig->setValueArray(Application::APP_ID, $key, $counts, true);
	}

	/**
	 * Today's requests per source.
	 *
	 * @return array{nextcloud: int, shared: int, personal: int}
	 */
	public function today(): array {
		$counts = $this->appConfig->getValueArray(Application::APP_ID, 'usage_' . date('Ymd', $this->time->getTime()), [], true);
		return [
			'nextcloud' => (int)($counts['nextcloud'] ?? 0),
			'shared' => (int)($counts['shared'] ?? 0),
			'personal' => (int)($counts['personal'] ?? 0),
		];
	}

	/** Whether the organisation provider's daily cap is used up. */
	public function sharedCapReached(): bool {
		$cap = $this->settings->sharedDailyCap();
		return $cap > 0 && $this->today()['shared'] >= $cap;
	}

	/** Records how long a Nextcloud Assistant task took; the last ten are kept. */
	public function recordLatency(int $ms): void {
		$list = $this->latencies();
		$list[] = max(0, $ms);
		$this->appConfig->setValueArray(Application::APP_ID, 'nc_ai_latencies', array_slice($list, -10), true);
	}

	/** The median of the recorded Nextcloud Assistant latencies in milliseconds, or null. */
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
	 * Deletes the counters older than KEEP_DAYS.
	 */
	public function cleanup(int $now): void {
		$cutoff = date('Ymd', $now - self::KEEP_DAYS * GameClock::DAY);
		foreach ($this->appConfig->getKeys(Application::APP_ID) as $key) {
			if (preg_match('/^usage_(\d{8})$/', $key, $m) === 1 && $m[1] < $cutoff) {
				$this->appConfig->deleteKey(Application::APP_ID, $key);
			}
		}
	}
}
