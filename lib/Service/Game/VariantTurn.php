<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;

/**
 * What the server keeps about the course of a browser-ruled variant game, in the game's `state` column instead of a
 * board (docs/development/online-variants.md): how often the turn has passed to another seat (`turns`), and the ply
 * of the move that waits for its settlement (`pending`, null when every move is settled).
 *
 * A game with more than two seats also keeps its players here (Game::seatUids reads them): `seats` (the user id per
 * seat, null for an open seat), `accepted` (whether each seat's player has taken it), and while it runs `drawVotes`
 * (the seats that agree to the open draw offer) and `muted` (the seats that muted the chat).
 *
 * A move is not a turn: in 5D chess a player makes several moves before *Submit turn* passes the turn.
 */
final class VariantTurn {
	/**
	 * @param list<?string> $seats
	 * @param list<bool> $accepted
	 * @param list<int> $drawVotes
	 * @param list<int> $muted
	 */
	private function __construct(
		public readonly int $turns,
		public readonly ?int $pending,
		public readonly array $seats = [],
		public readonly array $accepted = [],
		public readonly array $drawVotes = [],
		public readonly array $muted = [],
	) {
	}

	/**
	 * The record of a new game: no turn passed, nothing pending, and for more than two seats its players.
	 *
	 * @param list<?string> $seats the user id per seat (null for an open seat); empty for two seats
	 * @param list<bool> $accepted whether each seat's player has taken it
	 */
	public static function start(array $seats = [], array $accepted = []): self {
		return new self(0, null, $seats, $accepted);
	}

	public static function of(Game $game): self {
		$data = json_decode($game->getState(), true);
		if (!is_array($data)) {
			return self::start();
		}
		$turns = is_int($data['turns'] ?? null) ? max(0, $data['turns']) : 0;
		$pending = is_int($data['pending'] ?? null) ? $data['pending'] : null;
		$seats = [];
		foreach (self::listOf($data, 'seats') as $uid) {
			$seats[] = is_string($uid) && $uid !== '' ? $uid : null;
		}
		$accepted = [];
		foreach (self::listOf($data, 'accepted') as $taken) {
			$accepted[] = $taken === true;
		}
		$ints = static fn (string $key): array => array_values(array_filter(self::listOf($data, $key), 'is_int'));
		return new self($turns, $pending, $seats, $accepted, $ints('drawVotes'), $ints('muted'));
	}

	/**
	 * @param array<array-key, mixed> $data
	 * @return list<mixed>
	 */
	private static function listOf(array $data, string $key): array {
		return is_array($data[$key] ?? null) ? array_values($data[$key]) : [];
	}

	public function withPending(?int $ply): self {
		return new self($this->turns, $ply, $this->seats, $this->accepted, $this->drawVotes, $this->muted);
	}

	public function withTurnPassed(): self {
		$turns = $this->turns + 1;
		return new self($turns, $this->pending, $this->seats, $this->accepted, $this->drawVotes, $this->muted);
	}

	/**
	 * @param list<?string> $seats
	 * @param list<bool> $accepted
	 */
	public function withSeats(array $seats, array $accepted): self {
		return new self($this->turns, $this->pending, $seats, $accepted, $this->drawVotes, $this->muted);
	}

	/** @param list<int> $votes */
	public function withDrawVotes(array $votes): self {
		$votes = array_values(array_unique($votes));
		sort($votes);
		return new self($this->turns, $this->pending, $this->seats, $this->accepted, $votes, $this->muted);
	}

	public function withMuted(int $seat, bool $muted): self {
		$list = array_values(array_diff($this->muted, [$seat]));
		if ($muted) {
			$list[] = $seat;
			sort($list);
		}
		return new self($this->turns, $this->pending, $this->seats, $this->accepted, $this->drawVotes, $list);
	}

	/** Whether every seat of a two-seat game has played a turn: the turn has passed twice. */
	public function bothHavePlayed(): bool {
		return $this->turns >= 2;
	}

	/** Whether every one of `$seatCount` seats has played a turn. */
	public function everyonePlayed(int $seatCount): bool {
		return $this->turns >= $seatCount;
	}

	public function json(): string {
		$data = ['v' => 1, 'turns' => $this->turns, 'pending' => $this->pending];
		if ($this->seats !== []) {
			$data['seats'] = $this->seats;
			$data['accepted'] = $this->accepted;
			$data['drawVotes'] = $this->drawVotes;
			$data['muted'] = $this->muted;
		}
		return json_encode($data, JSON_THROW_ON_ERROR);
	}
}
