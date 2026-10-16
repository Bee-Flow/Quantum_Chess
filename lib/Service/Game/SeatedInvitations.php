<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Seat;
use OCA\QuantumChess\Db\SeatMapper;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\IL10N;

/**
 * Invitations to variant games with more than two seats, Four-player chess and Bughouse
 * (docs/development/online-variants.md, phase 3). InvitationService hands these games over.
 *
 * The creator names a player per seat, themselves included, or leaves a seat open for anyone who may see open
 * challenges. Every invited player answers on their own. One who declines an open challenge (that is not a
 * rematch) frees their seat for anyone, while open challenges are allowed; otherwise they decline the whole game. The
 * game starts when every seat is taken: with the seats as chosen, or, with the colour choice `r`, the players drawn
 * onto the seats at random. A game with an open seat is an open challenge until every seat is filled.
 *
 * Until the start, the players of the seats live in the game's record (VariantTurn: `seats` and `accepted`) and in a
 * `qchess_seats` row per seat, so that invited players find the game in their lobby.
 */
class SeatedInvitations {
	public function __construct(
		private readonly GameRepository $repository,
		private readonly GameLifecycle $lifecycle,
		private readonly GameTransaction $transaction,
		private readonly InvitePolicy $policy,
		private readonly AppSettings $settings,
		private readonly GameClock $clock,
		private readonly SeatMapper $seats,
		private readonly NotificationService $notifications,
		private readonly IL10N $l,
		private readonly GameErrors $errors,
	) {
	}

	/**
	 * The players of the seats that a request asks for: one entry per seat, a user id or null for an open seat, with
	 * the creator in exactly one seat.
	 *
	 * @param mixed $players the request's `players`
	 * @return list<?string> the canonical user id per seat
	 * @throws ApiException
	 */
	public function seatsOf(string $uid, mixed $players, int $seatCount): array {
		if (!is_array($players) || !array_is_list($players) || count($players) !== $seatCount) {
			throw ApiException::invalidArgument(
				'players',
				$this->l->t('Name a player for every seat, or leave it open.'),
			);
		}
		$seats = [];
		foreach ($players as $player) {
			if ($player !== null && (!is_string($player) || $player === '')) {
				throw ApiException::invalidArgument('players', $this->l->t('Invalid opponent'));
			}
			$seats[] = $player === null || $player === $uid ? $player : $this->policy->assertCanInvite($uid, $player);
		}
		$named = array_values(array_filter($seats, fn (?string $p) => $p !== null));
		if (count(array_keys($seats, $uid, true)) !== 1 || count($named) !== count(array_unique($named))) {
			throw ApiException::invalidArgument('players', $this->l->t('Every player takes one seat, you included.'));
		}
		if (in_array(null, $seats, true) && !$this->settings->openChallengesEnabled()) {
			throw new ApiException(
				ApiError::OpenChallengesDisabled,
				$this->l->t('Open challenges are turned off on this server.'),
			);
		}
		foreach ($seats as $player) {
			if ($player !== $uid) {
				$this->policy->assertWithinLimits($uid, $player);
			}
		}
		/** @var list<?string> $seats */
		return $seats;
	}

	/**
	 * Stores a new game with more than two seats, prepared by InvitationService (variant, options, time control,
	 * message), with its seats, and invites the named players.
	 *
	 * @param list<?string> $seats the user id per seat (null for an open seat)
	 * @param ?\Closure(Game): void $also more work in the same transaction, with the stored game (a rematch marks the
	 *                                    old game)
	 */
	public function create(Game $game, string $uid, array $seats, ?\Closure $also = null): Game {
		$open = in_array(null, $seats, true);
		$accepted = array_map(fn (?string $player) => $player === $uid, $seats);
		$game->setStatus($open ? Game::STATUS_OPEN : Game::STATUS_PENDING);
		$game->setOpponentUid(null);
		$game->setState(VariantTurn::start($seats, $accepted)->json());
		return $this->transaction->run(function () use ($game, $uid, $seats, $accepted, $also): Game {
			$game = $this->repository->insert($game);
			if ($also !== null) {
				$also($game);
			}
			foreach ($seats as $number => $player) {
				$seat = new Seat();
				$seat->setGameId((int)$game->getId());
				$seat->setSeat($number);
				$seat->setUid($player);
				$seat->setTeam(VariantCatalog::teamOf(
					(string)$game->getVariant(),
					$game->getVariantOptionValues(),
					$number,
				));
				$seat->setAcceptedAt($accepted[$number] ? $game->getCreatedAt() : null);
				$this->seats->insert($seat);
			}
			$this->transaction->afterCommit(function () use ($game, $seats, $uid): void {
				foreach ($seats as $player) {
					if ($player !== null && $player !== $uid) {
						$this->notifications->invite($game, $player);
					}
				}
			});
			return $game;
		});
	}

	/**
	 * The players of a rematch of a game with more than two seats: every player moves on by one seat (the player of
	 * the last seat takes seat 0), so that over as many rematches as there are seats everyone plays every seat.
	 *
	 * @return list<?string>
	 */
	public static function rotated(Game $old): array {
		$players = $old->seatUids();
		if ($players === []) {
			return [];
		}
		$last = array_pop($players);
		array_unshift($players, $last);
		return $players;
	}

	/**
	 * An invited player takes their seat; the game starts when every seat is taken.
	 *
	 * @throws ApiException
	 */
	public function accept(Game $game, string $uid): Game {
		if (!$game->isInviteeOf($uid)) {
			throw $this->errors->invalidStatus();
		}
		$this->policy->assertActiveLimit($uid);
		$seat = (int)array_search($uid, $game->seatUids(), true);
		return $this->take($game, $uid, $seat, false);
	}

	/**
	 * An invited player declines. In an open challenge that is not a rematch, while open challenges are allowed, their
	 * seat becomes open (`releasable`); otherwise the game is declined for everyone.
	 *
	 * @throws ApiException
	 */
	public function decline(Game $game, string $uid): Game {
		if (!$game->isInviteeOf($uid)) {
			throw $this->errors->invalidStatus();
		}
		$reopen = $game->getStatus() === Game::STATUS_OPEN && self::releasable($game, $this->settings);
		return $this->transaction->run(function () use ($game, $uid, $reopen): Game {
			if ($reopen) {
				self::release($game, $uid, $this->seats);
			} else {
				$game->setStatus(Game::STATUS_DECLINED);
				$game->setFinishedAt($this->clock->now());
			}
			$this->repository->save($game);
			$this->transaction->afterCommit(function () use ($game, $uid, $reopen): void {
				if ($reopen) {
					$this->notifications->inviteClosed($game, $uid);
					$this->notifications->inviteDeclined($game, $uid, true);
				} else {
					$this->notifications->inviteClosed($game);
					$this->notifications->inviteDeclined($game, $uid);
				}
			});
			return $game;
		});
	}

	/**
	 * Whether a player may leave the waiting game `$game` with more than two seats and leave their seat open for
	 * anyone, instead of ending it: open challenges are allowed and it is not a rematch (which is meant for its
	 * players only).
	 */
	public static function releasable(Game $game, AppSettings $settings): bool {
		return $game->isMultiSeat() && $game->isAwaitingOpponent() && $game->getRematchOf() === null
			&& $settings->openChallengesEnabled();
	}

	/**
	 * Frees the seat of `$uid` in the waiting game `$game` (in its record and its seat row): the seat is open again and
	 * the game an open challenge. The caller saves the game.
	 */
	public static function release(Game $game, string $uid, SeatMapper $seatMapper): void {
		$turn = VariantTurn::of($game);
		$number = array_search($uid, $turn->seats, true);
		if ($number === false) {
			return;
		}
		$seats = $turn->seats;
		$accepted = $turn->accepted;
		$seats[$number] = null;
		$accepted[$number] = false;
		/** @var list<?string> $seats */
		/** @var list<bool> $accepted */
		$game->setState($turn->withSeats($seats, $accepted)->json());
		$game->setStatus(Game::STATUS_OPEN);
		foreach ($seatMapper->findByGame((int)$game->getId()) as $seat) {
			if ($seat->getSeat() === $number) {
				$seat->setUid(null);
				$seat->setAcceptedAt(null);
				$seatMapper->update($seat);
			}
		}
	}

	/**
	 * Another player takes the first open seat of an open challenge.
	 *
	 * @throws ApiException `already_taken` when another player took the last seat first
	 */
	public function join(Game $game, string $uid): Game {
		$seats = $game->seatUids();
		$seat = array_search(null, $seats, true);
		if ($seat === false || in_array($uid, $seats, true)) {
			throw $this->errors->invalidStatus();
		}
		$this->policy->assertActiveLimit($uid);
		try {
			return $this->take($game, $uid, (int)$seat, true);
		} catch (GameConflictException) {
			throw new ApiException(ApiError::AlreadyTaken, $this->l->t('Someone was faster. The challenge is gone.'));
		}
	}

	/**
	 * `$uid` takes seat `$number`; the game starts when every seat is taken.
	 */
	private function take(Game $game, string $uid, int $number, bool $joined): Game {
		return $this->transaction->run(function () use ($game, $uid, $number, $joined): Game {
			$turn = VariantTurn::of($game);
			$seats = $turn->seats;
			$accepted = $turn->accepted;
			$seats[$number] = $uid;
			$accepted[$number] = true;
			/** @var list<?string> $seats */
			/** @var list<bool> $accepted */
			$game->setState($turn->withSeats($seats, $accepted)->json());
			foreach ($this->seats->findByGame((int)$game->getId()) as $seat) {
				if ($seat->getSeat() === $number) {
					$seat->setUid($uid);
					$seat->setAcceptedAt($this->clock->now());
					$this->seats->update($seat);
				}
			}
			$full = !in_array(null, $seats, true) && !in_array(false, $accepted, true);
			if ($full) {
				$this->lifecycle->start($game, $this->clock->now());
			} elseif (!in_array(null, $seats, true)) {
				// every open seat is taken; the game waits for the invited players
				$game->setStatus(Game::STATUS_PENDING);
			}
			$this->repository->save($game);
			$this->transaction->afterCommit(function () use ($game, $uid, $joined, $full): void {
				if (!$joined) {
					$this->notifications->inviteClosed($game, $uid);
				}
				if ($full) {
					// every player hears that the game started, the creator included
					$this->notifications->gameStarted($game, $uid);
				} else {
					$this->notifications->inviteAccepted($game, $joined, $uid);
				}
			});
			return $game;
		});
	}
}
