<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Db\MoveMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Notification\NotificationService;
use OCP\DB\Exception as DbException;
use OCP\IL10N;

/**
 * Playing an online game: moves, draw offers, resignation and abort.
 *
 * The server is authoritative. It checks every move with the PHP rules engine, draws the roll of a rolled move itself,
 * and extends the game's hash chain, which clients verify.
 */
class GameplayService {
	/** The longest thinking time a client may report for a move (30 days, in milliseconds). */
	private const MAX_THINK_MS = 2592000000;

	public function __construct(
		private readonly GameRepository $repository,
		private readonly GameLifecycle $lifecycle,
		private readonly GameTransaction $transaction,
		private readonly MoveMapper $moves,
		private readonly Engine $engine,
		private readonly RandomSource $random,
		private readonly GameClock $clock,
		private readonly NotificationService $notifications,
		private readonly IL10N $l,
		private readonly GameErrors $errors,
	) {
	}

	/**
	 * Plays a move.
	 *
	 * The checks run in this order: participant, idempotent retry, lazy deadline, status, turn, ply, legality. The
	 * order matters: a retry with a known `clientId` returns the stored move even after the game has ended.
	 *
	 * @param string $code the move in engine notation
	 * @param int $ply the ply the client played the move at; any other ply than the game's is a conflict
	 * @param string|null $clientId the client's idempotency key
	 * @param int|null $thinkMs the client's thinking time, dropped when implausible
	 * @return array{game: Game, move: Move, measurement: ?array, replayed: bool}
	 * @throws ApiException
	 */
	public function move(int $id, string $uid, string $code, int $ply, ?string $clientId, ?int $thinkMs): array {
		$game = $this->repository->find($id);
		if ($game === null || !$game->isParticipant($uid)) {
			throw $this->errors->notFound();
		}
		if ($clientId !== null && !preg_match('/^[A-Za-z0-9-]{8,36}$/', $clientId)) {
			throw ApiException::invalidArgument('clientId', $this->l->t('Invalid client id'));
		}
		if ($thinkMs !== null && ($thinkMs < 0 || $thinkMs > self::MAX_THINK_MS)) {
			$thinkMs = null;
		}
		if ($clientId !== null && ($stored = $this->moves->findByClientId($id, $clientId)) !== null) {
			return ['game' => $game, 'move' => $stored, 'measurement' => $stored->getMeasurementRecord(), 'replayed' => true];
		}
		$game = $this->lifecycle->resolveLazy($game);
		if ($game->getStatus() !== Game::STATUS_ACTIVE) {
			if ($game->hasEnded()) {
				throw $this->errors->gameOver();
			}
			throw $this->errors->invalidStatus();
		}
		$color = $game->colorOf($uid);
		if ($color === null || $color !== $game->getTurn()) {
			throw new ApiException(ApiError::NotYourTurn, $this->l->t('It is not your move.'));
		}
		if ($ply !== $game->getPly()) {
			throw $this->errors->conflict();
		}
		$state = $this->repository->state($game);
		$legal = $this->engine->findMove($state, $code);
		if ($legal === null) {
			throw new ApiException(ApiError::IllegalMove, $this->l->t('This move is not possible.'),
				['reason' => $this->engine->whyIllegal($state, $code) ?? 'malformed']);
		}
		$u = $legal['resolution'] === 'rolled' ? $this->random->drawU() : null;
		$applied = $this->engine->applyMove($state, $legal['code'], u: $u);
		$after = $applied['state'];
		$measurement = $applied['measurement'];
		$notation = $this->engine->moveNotation($state, $legal['code'], $measurement);
		$json = $this->engine->serializeState($after);
		$chain = $this->engine->chainNext((string)$game->getChain(), $ply, $legal['code'], $measurement['u'] ?? null, $measurement['key'] ?? null, $json);
		$capturedType = null;
		$capturedAfter = $after['captured'];
		if (count($capturedAfter) > count($state['captured'])) {
			$capturedType = $after['types'][(int)end($capturedAfter)] ?? null;
		}
		$now = $this->clock->now();

		$move = new Move();
		$move->setGameId($id);
		$move->setPly($ply);
		$move->setColor($color);
		$move->setUid($uid);
		$move->setCode($legal['code']);
		$move->setNotation($notation);
		$move->setMeasurement($measurement === null ? null : json_encode($measurement, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
		$move->setChain($chain);
		$move->setStateHash($this->engine->positionHash($after));
		$move->setSupportKey($this->engine->supportKey($after));
		$move->setClientId($clientId);
		$move->setThinkMs($thinkMs);
		$move->setCreatedAt($now);

		try {
			return $this->transaction->run(function () use ($game, $move, $after, $json, $chain, $color, $ply, $now, $measurement, $capturedType): array {
				$move = $this->moves->insert($move);
				$game->setState($json);
				$game->setPly((int)$after['ply']);
				$game->setTurn((string)$after['turn']);
				$game->setChain($chain);
				$game->setLastMoveAt($now);
				$game->setDeadlineAt($this->clock->deadlineFrom($game->getTimeControl(), $now));
				$declined = false;
				$offer = $game->getDrawOffer();
				if ($offer !== null && $offer !== $color) {
					$this->closeDrawOffer($game, $offer, $ply);
					$declined = true;
				}
				$result = $after['result'] ?? null;
				if (is_array($result)) {
					$this->lifecycle->finish($game, (string)$result['result'], (string)$result['reason'], $now);
				}
				$this->repository->save($game);
				$this->transaction->afterCommit(function () use ($game, $move, $declined, $capturedType): void {
					if ($declined) {
						$this->notifications->drawClosed($game);
					}
					if ($game->getStatus() === Game::STATUS_ACTIVE) {
						$this->notifications->yourTurn($game, $move, $capturedType);
					} else {
						$this->notifications->gameOver($game);
					}
				});
				return ['game' => $game, 'move' => $move, 'measurement' => $measurement, 'replayed' => false];
			});
		} catch (DbException $e) {
			// The unique indexes on (game, ply) and (game, clientId) make a concurrent move for the same ply fail here.
			if ($e->getReason() !== DbException::REASON_UNIQUE_CONSTRAINT_VIOLATION) {
				throw $e;
			}
			if ($clientId !== null && ($stored = $this->moves->findByClientId($id, $clientId)) !== null) {
				$fresh = $this->repository->find($id) ?? $game;
				return ['game' => $fresh, 'move' => $stored, 'measurement' => $stored->getMeasurementRecord(), 'replayed' => true];
			}
			throw $this->errors->conflict();
		}
	}

	/**
	 * The player to move resigns.
	 *
	 * @throws ApiException
	 */
	public function resign(int $id, string $uid): Game {
		$game = $this->lifecycle->loadActive($id, $uid);
		$color = (string)$game->colorOf($uid);
		return $this->transaction->run(function () use ($game, $color, $uid): Game {
			$this->lifecycle->finish($game, $color === 'w' ? '0-1' : '1-0', 'resignation', $this->clock->now());
			$this->lifecycle->addSystemLine($game, 'resigned', ['color' => $color]);
			$this->repository->save($game);
			$this->transaction->afterCommit(fn () => $this->notifications->gameOver($game, $uid));
			return $game;
		});
	}

	/**
	 * Aborts a game before both sides have moved; an aborted game has no result and is never rated.
	 *
	 * @throws ApiException
	 */
	public function abort(int $id, string $uid): Game {
		$game = $this->lifecycle->loadActive($id, $uid);
		if ($game->getPly() >= 2) {
			throw new ApiException(ApiError::AbortNotAllowed, $this->l->t('The game can only be aborted before both sides have moved.'));
		}
		$color = (string)$game->colorOf($uid);
		return $this->transaction->run(function () use ($game, $color, $uid): Game {
			$this->lifecycle->abort($game, 'aborted', $this->clock->now());
			$this->lifecycle->addSystemLine($game, 'aborted', ['color' => $color]);
			$this->repository->save($game);
			$this->transaction->afterCommit(fn () => $this->notifications->gameOver($game, $uid));
			return $game;
		});
	}

	/**
	 * Offers a draw, or accepts or declines the opponent's offer.
	 *
	 * Offering while the opponent's offer is pending accepts it. After a declined offer the same player may offer
	 * again only after a cool-down (Game::DRAW_COOLDOWN_PLIES).
	 *
	 * @param string $action `offer`, `accept` or `decline`
	 * @throws ApiException
	 */
	public function draw(int $id, string $uid, string $action): Game {
		if (!in_array($action, ['offer', 'accept', 'decline'], true)) {
			throw ApiException::invalidArgument('action', $this->l->t('Invalid action'));
		}
		$game = $this->lifecycle->loadActive($id, $uid);
		$color = (string)$game->colorOf($uid);
		$other = Game::otherColor($color);
		$offer = $game->getDrawOffer();
		if ($action === 'offer' && $offer === $other) {
			$action = 'accept';
		}
		if ($action === 'offer') {
			$availableAt = $game->drawAvailableAtPly($color);
			if ($offer === $color || ($availableAt !== null && $game->getPly() < $availableAt)) {
				throw new ApiException(ApiError::DrawNotAllowed, $this->l->t('You cannot offer a draw right now.'),
					['availableAtPly' => $offer === $color ? null : $availableAt]);
			}
			return $this->transaction->run(function () use ($game, $color): Game {
				$game->setDrawOffer($color);
				$game->setDrawOfferPly($game->getPly());
				$this->lifecycle->addSystemLine($game, 'draw_offered', ['color' => $color]);
				$this->repository->save($game);
				$this->transaction->afterCommit(fn () => $this->notifications->drawOffered($game));
				return $game;
			});
		}
		if ($offer !== $other) {
			throw new ApiException(ApiError::NoDrawOffer, $this->l->t('There is no draw offer to answer.'));
		}
		return $this->transaction->run(function () use ($game, $action, $color, $other): Game {
			if ($action === 'accept') {
				$this->lifecycle->finish($game, '1/2-1/2', 'agreement', $this->clock->now());
				$this->lifecycle->addSystemLine($game, 'draw_accepted', ['color' => $color]);
			} else {
				$this->closeDrawOffer($game, $other, $game->getPly());
			}
			$this->repository->save($game);
			$this->transaction->afterCommit(function () use ($game, $action): void {
				$this->notifications->drawClosed($game);
				if ($action === 'accept') {
					$this->notifications->gameOver($game);
				}
			});
			return $game;
		});
	}

	/**
	 * Declines the pending offer of `$offerer`; its cool-down starts at `$ply`. The caller saves the game.
	 */
	private function closeDrawOffer(Game $game, string $offerer, int $ply): void {
		$game->setDrawOffer(null);
		$game->setDrawOfferPly(null);
		if ($offerer === 'w') {
			$game->setLastDrawW($ply);
		} else {
			$game->setLastDrawB($ply);
		}
		$this->lifecycle->addSystemLine($game, 'draw_declined', ['color' => $offerer]);
	}
}
