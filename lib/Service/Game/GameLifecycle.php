<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\ChatMapper;
use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Seat;
use OCA\QuantumChess\Db\SeatMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Player\RatingService;
use OCA\QuantumChess\Service\Settings\AppSettings;

/**
 * The status changes that several use cases share: loading a game for a player, starting, finishing and aborting it,
 * the system lines of its chat, and the lazy resolution of passed deadlines.
 *
 * Deadlines are resolved whenever a game is loaded, not only by the background job, so the job's schedule never
 * decides a result. Methods that change a game without saving it expect the caller to save it in its transaction.
 */
class GameLifecycle {
	public function __construct(
		private readonly GameRepository $repository,
		private readonly GameTransaction $transaction,
		private readonly GameClock $clock,
		private readonly RandomSource $random,
		private readonly RatingService $ratings,
		private readonly NotificationService $notifications,
		private readonly ChatMapper $chat,
		private readonly AppSettings $settings,
		private readonly Engine $engine,
		private readonly GameErrors $errors,
		private readonly SeatMapper $seats,
	) {
	}

	/**
	 * A game that `$uid` may see, with any passed deadline resolved.
	 *
	 * @throws ApiException not_found
	 */
	public function load(int $id, string $uid, bool $allowOpen = false): Game {
		return $this->resolveLazy($this->repository->findVisible($id, $uid, $allowOpen));
	}

	/**
	 * An active game in which `$uid` plays.
	 *
	 * @throws ApiException not_found, game_over or invalid_status
	 */
	public function loadActive(int $id, string $uid): Game {
		$game = $this->load($id, $uid);
		if ($game->getStatus() !== Game::STATUS_ACTIVE || $game->colorOf($uid) === null) {
			if ($game->hasEnded()) {
				throw $this->errors->gameOver();
			}
			throw $this->errors->invalidStatus();
		}
		return $game;
	}

	/**
	 * Resolves a passed expiry, deadline or abandonment in its own transaction and returns the current game.
	 *
	 * When another request changed the game first, the stored game is returned instead.
	 *
	 * @throws ApiException not_found when the game was deleted meanwhile
	 */
	public function resolveLazy(Game $game): Game {
		$now = $this->clock->now();
		$expired = $game->isAwaitingOpponent() && $game->getExpiresAt() !== null && $game->getExpiresAt() <= $now;
		$due = $this->clock->dueAt($game);
		if (!$expired && ($due === null || $due > $now)) {
			return $game;
		}
		try {
			$this->transaction->run(function () use ($game, $expired, $due): void {
				if ($expired) {
					$game->setStatus(Game::STATUS_EXPIRED);
					$game->setFinishedAt((int)$game->getExpiresAt());
					$this->repository->save($game);
					$this->transaction->afterCommit(fn () => $this->notifications->inviteClosed($game));
					return;
				}
				$at = (int)$due;
				// The server keeps no board of a variant game.
				$state = $game->isVariant() ? [] : $this->repository->state($game);
				$outcome = $this->clock->resolveTimeout($game, $state);
				if ($outcome['status'] === Game::STATUS_ABORTED) {
					$this->abort($game, $outcome['reason'], $at);
				} else {
					$game->setVariantResult($outcome['variantResult'] ?? null);
					$this->finish($game, (string)$outcome['result'], $outcome['reason'], $at);
				}
				$this->addSystemLine($game, 'timeout', ['color' => $game->getTurn()]);
				$this->repository->save($game);
				$this->transaction->afterCommit(fn () => $this->notifications->gameOver($game));
			});
		} catch (GameConflictException) {
			return $this->repository->find((int)$game->getId()) ?? throw $this->errors->notFound();
		}
		return $game;
	}

	/**
	 * Starts an accepted invitation or a joined open challenge: colours, the rated decision, the first deadline and
	 * the start of the hash chain. A variant game also gets its seats: seat 0 plays as White, seat 1 as Black. A game
	 * with more than two seats starts with the seats its players took (`startSeated`).
	 */
	public function start(Game $game, int $now): void {
		if ($game->isMultiSeat()) {
			$this->startSeated($game, $now);
			return;
		}
		$creator = (string)$game->getCreatorUid();
		$opponent = (string)$game->getOpponentUid();
		$choice = $game->getColorChoice();
		$creatorWhite = $choice === 'w' || ($choice === 'r' && $this->random->coinFlip());
		$white = $creatorWhite ? $creator : $opponent;
		$black = $creatorWhite ? $opponent : $creator;
		$game->setWhiteUid($white);
		$game->setBlackUid($black);
		if ($game->getRatedRequested() === 1) {
			if ($this->settings->ratedEnabled() && $game->getTimeControl() !== TimeControl::Unlimited->value) {
				$game->setRated(1);
			} else {
				$game->setRated(0);
				$game->setUnratedReason('admin');
			}
		}
		$game->setDeadlineAt($this->clock->deadlineFrom($game->getTimeControl(), $now));
		if ($game->isVariant()) {
			$game->setChain(VariantChain::start(
				(int)$game->getId(),
				(string)$game->getVariant(),
				$game->getVariantOptionValues(),
				[$white, $black],
				$game->getCreatedAt(),
			));
			$game->setSeatToMove(0);
			foreach ([$white, $black] as $number => $uid) {
				$seat = new Seat();
				$seat->setGameId((int)$game->getId());
				$seat->setSeat($number);
				$seat->setUid($uid);
				$seat->setTeam(null);
				$seat->setAcceptedAt($now);
				$this->seats->insert($seat);
			}
		} else {
			$game->setChain($this->engine->chainStart((int)$game->getId(), $white, $black, $game->getCreatedAt()));
		}
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setStartedAt($now);
		$game->setExpiresAt(null);
	}

	/**
	 * Starts a game with more than two seats once every seat is taken: with the colour choice `r` the players are
	 * drawn onto the seats at random (each order equally likely, up to the roll's 2^24 steps), seat 0 moves first, and
	 * the variant chain starts from the players in seat order. Variant games are never rated.
	 */
	private function startSeated(Game $game, int $now): void {
		$turn = VariantTurn::of($game);
		$players = $turn->seats;
		if ($game->getColorChoice() === 'r') {
			for ($i = count($players) - 1; $i > 0; $i--) {
				$j = $this->random->drawU() % ($i + 1);
				[$players[$i], $players[$j]] = [$players[$j], $players[$i]];
			}
		}
		$all = array_fill(0, count($players), true);
		$game->setState(VariantTurn::start($players, $all)->json());
		foreach ($this->seats->findByGame((int)$game->getId()) as $seat) {
			$seat->setUid($players[$seat->getSeat()] ?? null);
			$seat->setAcceptedAt($now);
			$this->seats->update($seat);
		}
		$game->setRated(0);
		$game->setTurn('0');
		$game->setSeatToMove(0);
		$game->setDeadlineAt($this->clock->deadlineFrom($game->getTimeControl(), $now));
		$game->setChain(VariantChain::start(
			(int)$game->getId(),
			(string)$game->getVariant(),
			$game->getVariantOptionValues(),
			$players,
			$game->getCreatedAt(),
		));
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setStartedAt($now);
		$game->setExpiresAt(null);
	}

	/**
	 * Finishes an active game with a result, and records it in both players' ratings.
	 */
	public function finish(Game $game, string $result, string $reason, int $finishedAt): void {
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setResult($result);
		$game->setResultReason($reason);
		$game->setFinishedAt($finishedAt);
		$game->setDeadlineAt(null);
		$game->setDrawOffer(null);
		$game->setDrawOfferPly(null);
		$this->ratings->applyResult($game);
	}

	/**
	 * Aborts an active game: it ends without a result and is never rated.
	 */
	public function abort(Game $game, string $reason, int $at): void {
		$game->setStatus(Game::STATUS_ABORTED);
		$game->setResult(null);
		$game->setResultReason($reason);
		$game->setRated(0);
		if ($game->getRatedRequested() === 1) {
			$game->setUnratedReason('aborted');
		}
		$game->setFinishedAt($at);
		$game->setDeadlineAt(null);
		$game->setDrawOffer(null);
		$game->setDrawOfferPly(null);
	}

	/**
	 * Adds a system line, such as `draw_offered`, to the game's chat.
	 *
	 * @param array<string, mixed> $params the parameters the client uses to render the line
	 */
	public function addSystemLine(Game $game, string $key, array $params = []): void {
		$line = new ChatMessage();
		$line->setGameId($game->getId());
		$line->setUid(null);
		$line->setKind(ChatMessage::KIND_SYSTEM);
		$line->setMessage($key);
		$line->setParams($params === [] ? null : json_encode($params, JSON_THROW_ON_ERROR));
		$line->setCreatedAt($this->clock->now());
		$this->chat->insert($line);
		$game->setChatCount($game->getChatCount() + 1);
	}
}
