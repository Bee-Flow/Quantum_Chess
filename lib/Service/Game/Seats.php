<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Seat;

/**
 * The players of an online variant game, by seat: what `Game::colorOf`, `uidOf` and `opponentOf` answer for the two
 * colours of a classic game.
 */
final class Seats {
	/** @var array<int, Seat> */
	private array $bySeat = [];

	/**
	 * @param list<Seat> $seats the seats of one game, in any order
	 */
	public function __construct(array $seats) {
		foreach ($seats as $seat) {
			$this->bySeat[$seat->getSeat()] = $seat;
		}
		ksort($this->bySeat);
	}

	/** @return list<Seat> the seats in seat order */
	public function all(): array {
		return array_values($this->bySeat);
	}

	public function get(int $seat): ?Seat {
		return $this->bySeat[$seat] ?? null;
	}

	/** The seat of `$uid`, or null when they do not play in the game. */
	public function seatOf(string $uid): ?int {
		if ($uid === '') {
			return null;
		}
		foreach ($this->bySeat as $number => $seat) {
			if ($seat->getUid() === $uid) {
				return $number;
			}
		}
		return null;
	}

	public function uidOf(int $seat): ?string {
		return $this->get($seat)?->getUid();
	}

	public function isParticipant(string $uid): bool {
		return $this->seatOf($uid) !== null;
	}

	public function teamOf(int $seat): ?int {
		return $this->get($seat)?->getTeam();
	}

	/** @return list<string> the user ids of the other players, in seat order */
	public function others(string $uid): array {
		$others = [];
		foreach ($this->bySeat as $seat) {
			$other = $seat->getUid();
			if ($other !== null && $other !== $uid && !in_array($other, $others, true)) {
				$others[] = $other;
			}
		}
		return $others;
	}

	/** @return list<string|null> the user id of every seat in seat order, as the variant chain starts from it */
	public function uids(): array {
		return array_map(fn (Seat $seat) => $seat->getUid(), $this->all());
	}

	/** @return list<int> the seats that still play, in seat order */
	public function playing(): array {
		$playing = [];
		foreach ($this->bySeat as $number => $seat) {
			if ($seat->isPlaying()) {
				$playing[] = $number;
			}
		}
		return $playing;
	}

	/** Whether every seat has a player who took it. */
	public function isFull(): bool {
		foreach ($this->bySeat as $seat) {
			if ($seat->getUid() === null || $seat->getAcceptedAt() === null) {
				return false;
			}
		}
		return $this->bySeat !== [];
	}
}
