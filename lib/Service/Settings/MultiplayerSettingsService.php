<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Settings;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Player\RatingService;
use OCP\Config\IUserConfig;
use OCP\IL10N;

/**
 * A user's settings for online games: the notification switches and the leaderboard listing.
 */
class MultiplayerSettingsService {
	/** Notification switch → user config key. Every switch is on by default. */
	public const NOTIFY_KEYS = [
		'invites' => 'notify_invites',
		'yourTurn' => 'notify_your_turn',
		'reminders' => 'notify_reminders',
		'drawOffers' => 'notify_draw_offers',
		'results' => 'notify_results',
		'chat' => 'notify_chat',
		'previews' => 'notify_previews',
	];

	/** Who may invite the user. Everyone who may play online can invite everyone they can reach. */
	public const INVITE_POLICY = 'everyone';

	public function __construct(
		private readonly IUserConfig $userConfig,
		private readonly RatingService $ratings,
		private readonly AppSettings $settings,
		private readonly IL10N $l,
	) {
	}

	/**
	 * @return array{invites: bool, yourTurn: bool, reminders: bool, drawOffers: bool, results: bool, chat: bool, previews: bool}
	 */
	public function notificationSwitches(string $uid): array {
		$switches = [];
		foreach (self::NOTIFY_KEYS as $name => $key) {
			$switches[$name] = $this->userConfig->getValueBool($uid, Application::APP_ID, $key, true);
		}
		/** @var array{invites: bool, yourTurn: bool, reminders: bool, drawOffers: bool, results: bool, chat: bool, previews: bool} $switches */
		return $switches;
	}

	/**
	 * The settings as the settings API returns them. `blocked` is always empty: there is no block list.
	 *
	 * @return array{invitePolicy: string, blocked: list<array>, listed: ?bool, leaderboardMode: string, notifications: array<string, bool>}
	 */
	public function getMultiplayer(string $uid): array {
		return [
			'invitePolicy' => self::INVITE_POLICY,
			'blocked' => [],
			'listed' => $this->ratings->get($uid)['listed'] ?? null,
			'leaderboardMode' => $this->settings->leaderboardMode(),
			'notifications' => $this->notificationSwitches($uid),
		];
	}

	/**
	 * Changes the leaderboard listing and some notification switches.
	 *
	 * @param array<array-key, mixed> $patch `listed` (true, false, or null for the server's default) and
	 *                                       `notifications` (switch name → bool)
	 * @return array<string, mixed> getMultiplayer()
	 * @throws ApiException invalid_argument
	 */
	public function setMultiplayer(string $uid, array $patch): array {
		foreach (array_keys($patch) as $key) {
			if (!in_array($key, ['listed', 'notifications'], true)) {
				throw $this->invalid((string)$key);
			}
		}
		$switches = [];
		if (array_key_exists('notifications', $patch)) {
			if (!is_array($patch['notifications'])) {
				throw $this->invalid('notifications');
			}
			foreach ($patch['notifications'] as $name => $on) {
				if (!is_string($name) || !isset(self::NOTIFY_KEYS[$name]) || !is_bool($on)) {
					throw $this->invalid('notifications');
				}
				$switches[self::NOTIFY_KEYS[$name]] = $on;
			}
		}
		if (array_key_exists('listed', $patch) && $patch['listed'] !== null && !is_bool($patch['listed'])) {
			throw $this->invalid('listed');
		}
		foreach ($switches as $key => $on) {
			$this->userConfig->setValueBool($uid, Application::APP_ID, $key, $on);
		}
		if (array_key_exists('listed', $patch)) {
			$this->ratings->setListed($uid, $patch['listed']);
		}
		return $this->getMultiplayer($uid);
	}

	private function invalid(string $field): ApiException {
		return ApiException::invalidArgument($field, $this->l->t('Invalid value'));
	}
}
