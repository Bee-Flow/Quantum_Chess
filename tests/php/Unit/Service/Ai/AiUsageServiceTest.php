<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiUsageService;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The rate limit, the one-request-at-a-time rule, the daily counters and the latency record.
 */
#[CoversClass(AiUsageService::class)]
final class AiUsageServiceTest extends TestCase {
	use SettingsFixture;

	public function testLimitsAndCounters(): void {
		$usage = $this->usage();
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
			$this->assertSame(
				[429, 'ai_rate_limited', AiUsageService::RETRY_AFTER],
				[$e->getStatus(), $e->getErrorCode(), $e->getRetryAfter()],
			);
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
}
