<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Settings;

/**
 * Every admin setting of the app, by its app config key.
 *
 * The order of the cases is the order of the keys in the admin settings API. The API key of the organisation provider
 * is a secret and not part of this list (see KeyStore).
 */
enum AdminSetting: string {
	case MultiplayerEnabled = 'mp_enabled';
	case MultiplayerGroups = 'mp_groups';
	case OpenChallenges = 'open_challenges';
	case RatedEnabled = 'rated_enabled';
	case InviteExpiryDays = 'invite_expiry_days';
	case OpenExpiryDays = 'open_expiry_days';
	case MaxActiveGames = 'max_active_games';
	case ChatEnabled = 'chat_enabled';
	case ChatRetentionDays = 'chat_retention_days';
	case PurgeFinishedDays = 'purge_finished_days';
	case LeaderboardMode = 'leaderboard_mode';
	case LeaderboardMinGames = 'leaderboard_min_games';
	case LeaderboardActiveDays = 'leaderboard_active_days';
	case LeaderboardGroups = 'leaderboard_groups';
	case NcAiEnabled = 'nc_ai_enabled';
	case SharedEnabled = 'shared_enabled';
	case SharedProvider = 'shared_provider';
	case SharedGroups = 'shared_groups';
	case SharedDailyCap = 'shared_daily_cap';
	case SharedModelAllowlist = 'shared_model_allowlist';
	case AllowPersonalKeys = 'allow_personal_keys';
	case SharedAllowLocal = 'shared_allow_local';
	case LocalAllowlist = 'local_allowlist';
	case AiRequestsPerHour = 'ai_requests_per_hour';
	case AiMaxOutputTokens = 'ai_max_output_tokens';
	case AiSafetyIdentifier = 'ai_safety_identifier';
	case AiPrivacyNotice = 'ai_privacy_notice';

	/**
	 * The type, default and range of the setting.
	 */
	public function definition(): SettingDefinition {
		return match ($this) {
			self::MultiplayerEnabled, self::OpenChallenges, self::RatedEnabled, self::ChatEnabled, self::NcAiEnabled,
			self::AllowPersonalKeys => SettingDefinition::bool(true),
			self::SharedEnabled, self::SharedAllowLocal, self::AiSafetyIdentifier => SettingDefinition::bool(false),
			self::MultiplayerGroups, self::LeaderboardGroups, self::SharedGroups => SettingDefinition::groups(),
			self::InviteExpiryDays => SettingDefinition::int(14, 1, 60),
			self::OpenExpiryDays => SettingDefinition::int(7, 1, 30),
			self::MaxActiveGames => SettingDefinition::int(30, 1, 200),
			self::ChatRetentionDays, self::LeaderboardActiveDays => SettingDefinition::int(90, 1, 3650),
			// 0 keeps finished games forever; otherwise they are deleted after 30 to 3650 days
			self::PurgeFinishedDays => SettingDefinition::int(0, 30, 3650, zeroDisables: true),
			self::LeaderboardMode => SettingDefinition::enum('opt-in', ['off', 'opt-in', 'opt-out']),
			self::LeaderboardMinGames => SettingDefinition::int(5, 1, 100),
			self::SharedProvider => SettingDefinition::provider(),
			self::SharedDailyCap => SettingDefinition::int(1000, 0, 1000000),
			self::SharedModelAllowlist => SettingDefinition::models(),
			self::LocalAllowlist => SettingDefinition::urls(),
			self::AiRequestsPerHour => SettingDefinition::int(60, 1, 1000),
			self::AiMaxOutputTokens => SettingDefinition::int(800, 100, 4000),
			self::AiPrivacyNotice => SettingDefinition::text(1000),
		};
	}
}
