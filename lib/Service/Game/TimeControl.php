<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCP\IL10N;

/**
 * The time controls of online games: how long a player has for each move.
 *
 * Games store the value (`corr:3d`); the values are part of the HTTP API.
 */
enum TimeControl: string {
	case OneDay = 'corr:1d';
	case ThreeDays = 'corr:3d';
	case SevenDays = 'corr:7d';
	case Unlimited = 'corr:none';

	/** The time control of a new game when the request names none. */
	public const DEFAULT = self::ThreeDays;

	/**
	 * The time control of a stored value; values the app does not know count as the default.
	 */
	public static function fromStored(string $value): self {
		return self::tryFrom($value) ?? self::DEFAULT;
	}

	/** Seconds per move, or null without a time limit. */
	public function period(): ?int {
		return match ($this) {
			self::OneDay => GameClock::DAY,
			self::ThreeDays => 3 * GameClock::DAY,
			self::SevenDays => 7 * GameClock::DAY,
			self::Unlimited => null,
		};
	}

	/** The name shown to players, for example "3 days per move". */
	public function label(IL10N $l): string {
		return match ($this) {
			self::OneDay => $l->t('1 day per move'),
			self::SevenDays => $l->t('7 days per move'),
			self::Unlimited => $l->t('No time limit'),
			self::ThreeDays => $l->t('3 days per move'),
		};
	}
}
