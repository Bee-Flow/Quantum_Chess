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
 * (the seats that agree to the open draw offer), `muted` (the seats that muted the chat) and `out` (the seats that are out
 * of a game where every player plays for themselves, as the browsers settle it: VariantGameplayService::settle).
 * `endedBy` is the seat whose resignation, timeout or removed account ended the game.
 * A game of a server-ruled variant (Kriegspiel, Fog of war: VariantCatalog::isRefereed) keeps its real position here
 * as well (`board`, the state of lib/Variants/ as JSON text), which no player ever receives while the game runs.
 *
 * A move is not a turn: in 5D chess a player makes several moves before *Submit turn* passes the turn.
 */
final class VariantTurn {
	/**
	 * @param list<?string> $seats
	 * @param list<bool> $accepted
	 * @param list<int> $drawVotes
	 * @param list<int> $muted
	 * @param list<int> $out
	 */
	private function __construct(
		public readonly int $turns,
		public readonly ?int $pending,
		public readonly array $seats = [],
		public readonly array $accepted = [],
		public readonly array $drawVotes = [],
		public readonly array $muted = [],
		public readonly ?string $board = null,
		public readonly array $out = [],
		public readonly ?int $endedBy = null,
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
		$board = is_string($data['board'] ?? null) ? $data['board'] : null;
		$endedBy = is_int($data['endedBy'] ?? null) ? $data['endedBy'] : null;
		return new self(
			$turns,
			$pending,
			$seats,
			$accepted,
			$ints('drawVotes'),
			$ints('muted'),
			$board,
			$ints('out'),
			$endedBy,
		);
	}

	/**
	 * @param array<array-key, mixed> $data
	 * @return list<mixed>
	 */
	private static function listOf(array $data, string $key): array {
		return is_array($data[$key] ?? null) ? array_values($data[$key]) : [];
	}

	/**
	 * A copy with some fields replaced (named arguments only).
	 *
	 * @param array<string, mixed> $changes
	 */
	private function with(array $changes): self {
		$f = array_merge([
			'turns' => $this->turns,
			'pending' => $this->pending,
			'seats' => $this->seats,
			'accepted' => $this->accepted,
			'drawVotes' => $this->drawVotes,
			'muted' => $this->muted,
			'board' => $this->board,
			'out' => $this->out,
			'endedBy' => $this->endedBy,
		], $changes);
		/** @psalm-suppress MixedArgument the keys above carry the types of the constructor */
		return new self(
			$f['turns'],
			$f['pending'],
			$f['seats'],
			$f['accepted'],
			$f['drawVotes'],
			$f['muted'],
			$f['board'],
			$f['out'],
			$f['endedBy'],
		);
	}

	public function withPending(?int $ply): self {
		return $this->with(['pending' => $ply]);
	}

	public function withTurnPassed(): self {
		return $this->with(['turns' => $this->turns + 1]);
	}

	/**
	 * @param list<?string> $seats
	 * @param list<bool> $accepted
	 */
	public function withSeats(array $seats, array $accepted): self {
		return $this->with(['seats' => $seats, 'accepted' => $accepted]);
	}

	/** @param list<int> $votes */
	public function withDrawVotes(array $votes): self {
		$votes = array_values(array_unique($votes));
		sort($votes);
		return $this->with(['drawVotes' => $votes]);
	}

	public function withMuted(int $seat, bool $muted): self {
		$list = array_values(array_diff($this->muted, [$seat]));
		if ($muted) {
			$list[] = $seat;
			sort($list);
		}
		return $this->with(['muted' => $list]);
	}

	/** The record with the real position of a server-ruled game, as JSON text. */
	public function withBoard(string $board): self {
		return $this->with(['board' => $board]);
	}

	/**
	 * The record with the seats that are out of the game (sorted, without doubles).
	 *
	 * @param list<int> $out
	 */
	public function withOut(array $out): self {
		$out = array_values(array_unique($out));
		sort($out);
		return $this->with(['out' => $out]);
	}

	/** The record with the seat whose resignation, timeout or removed account ended the game. */
	public function withEndedBy(?int $seat): self {
		return $this->with(['endedBy' => $seat]);
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
			$data['out'] = $this->out;
		}
		if ($this->endedBy !== null) {
			$data['endedBy'] = $this->endedBy;
		}
		if ($this->board !== null) {
			$data['board'] = $this->board;
		}
		return json_encode($data, JSON_THROW_ON_ERROR);
	}
}
