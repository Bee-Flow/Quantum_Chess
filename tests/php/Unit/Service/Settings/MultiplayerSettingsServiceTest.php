<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Settings;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * A user's online game settings: notification switches and the leaderboard listing.
 */
#[CoversClass(MultiplayerSettingsService::class)]
final class MultiplayerSettingsServiceTest extends TestCase {
	use SettingsFixture;

	public function testNotificationSwitches(): void {
		$settings = $this->multiplayerSettings();
		$result = $settings->setMultiplayer('bob', ['notifications' => ['chat' => false, 'previews' => false]]);
		$this->assertFalse($result['notifications']['chat']);
		$this->assertTrue($result['notifications']['yourTurn']);
		$this->assertSame(
			[
				'invites' => true,
				'yourTurn' => true,
				'reminders' => true,
				'drawOffers' => true,
				'results' => true,
				'chat' => false,
				'previews' => false,
			],
			$settings->notificationSwitches('bob'),
		);
		$this->expectException(ApiException::class);
		$settings->setMultiplayer('bob', ['notifications' => ['chat' => 'no']]);
	}

	public function testMultiplayerOutput(): void {
		$settings = $this->multiplayerSettings();
		$this->assertSame([
			'invitePolicy' => 'everyone', 'blocked' => [], 'listed' => null, 'leaderboardMode' => 'opt-in',
			'notifications' => [
				'invites' => true,
				'yourTurn' => true,
				'reminders' => true,
				'drawOffers' => true,
				'results' => true,
				'chat' => true,
				'previews' => true,
			],
		], $settings->getMultiplayer('bob'));
		foreach ([
			['invitePolicy' => 'everyone'],
			['blocked' => []],
			['listed' => 'yes'],
			['notifications' => ['unknown' => true]],
			['notifications' => 'all'],
		] as $patch) {
			try {
				$settings->setMultiplayer('bob', $patch);
				$this->fail('rejected: ' . json_encode($patch));
			} catch (ApiException $e) {
				$this->assertSame(
					['invalid_argument', 400, ['field' => array_key_first($patch)]],
					[$e->getErrorCode(), $e->getStatus(), $e->getExtra()],
				);
			}
		}
	}
}
