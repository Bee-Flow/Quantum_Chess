<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\VariantMove;
use OCA\QuantumChess\Db\VariantMoveMapper;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Variants\VariantEngine;
use OCP\DB\Exception as DbException;
use OCP\IL10N;

/**
 * Moves of a browser-ruled chess variant game (docs/development/online-variants.md): the server rolls, the browsers
 * rule.
 *
 * The server does not know the rules of the variants. A move is stored with the roll `u` the server draws after the
 * move arrived, so nobody can choose their dice. A browser then settles the move: it plays it with that roll and
 * reports the seat to move next, the result and the position hash. Only then does the turn pass. Every browser
 * replays every move and checks every settlement; one that does not agree disputes the game, which annuls it.
 *
 * Two-seat games keep the colours of classic games: seat 0 plays as White, seat 1 as Black. Resigning, draw offers,
 * time-outs, notifications and the lobby therefore work as for classic games. A game with more than two seats names
 * its sides by seat number (`'0'` to `'3'`, see Game) and keeps its result as a variant result code only.
 *
 * Kriegspiel and Fog of war are ruled by the server instead (VariantCatalog::isRefereed, docs/development/
 * online-variants.md section 6): the server keeps the real position (VariantTurn `board`) and plays every move with
 * the PHP twin of the variant layer (lib/Variants/). A move it refuses changes nothing and uses no turn; a move it
 * accepts is rolled, played and settled at once. Every player receives only their own view (`viewOf`), and the
 * moves stay hidden until the game has ended.
 */
class VariantGameplayService {
	/** The longest thinking time a client may report for a move (30 days, in milliseconds). */
	private const MAX_THINK_MS = 2592000000;
	/** A move code: printable ASCII without spaces, as the variants write them. */
	private const CODE_PATTERN = '/^[\x21-\x7E]{1,255}\z/';

	public function __construct(
		private readonly GameRepository $repository,
		private readonly GameLifecycle $lifecycle,
		private readonly GameTransaction $transaction,
		private readonly VariantMoveMapper $moves,
		private readonly RandomSource $random,
		private readonly GameClock $clock,
		private readonly NotificationService $notifications,
		private readonly IL10N $l,
		private readonly GameErrors $errors,
	) {
	}

	/** The colour that seat `$seat` plays as: White or Black, or with more than two seats the seat number. */
	public static function colorOfSeat(Game $game, int $seat): string {
		if ($game->isMultiSeat()) {
			return (string)$seat;
		}
		return $seat === 0 ? 'w' : 'b';
	}

	/** The seat that plays colour `$color`. */
	public static function seatOfColor(Game $game, string $color): int {
		if ($game->isMultiSeat()) {
			return (int)$color;
		}
		return $color === 'w' ? 0 : 1;
	}

	/**
	 * The result when seat `$seat` leaves the game (it resigns, its time runs out, its player's account is deleted):
	 * in a team game the other team wins, otherwise every other seat.
	 */
	public static function lossOf(Game $game, int $seat, string $reason): VariantResult {
		$teams = VariantCatalog::teams((string)$game->getVariant(), $game->getVariantOptionValues()) ?? [];
		foreach ($teams as $team) {
			if (!in_array($seat, $team, true)) {
				continue;
			}
			$others = array_values(array_filter($teams, fn (array $t) => $t !== $team));
			return VariantResult::of(array_merge(...$others), $reason);
		}
		$all = range(0, max(0, $game->getSeatCount() - 1));
		return VariantResult::of(array_values(array_diff($all, [$seat])), $reason);
	}

	/**
	 * Finishes a variant game with a result: a two-seat game also writes it as a classic result, a game with more
	 * seats only as its variant result code (`result` is `*` there). The caller saves the game.
	 *
	 * @param string $reason the reason as classic games name it (`resignation`, `timeout`), else the variant's
	 */
	public static function finishWith(
		Game $game,
		VariantResult $result,
		string $reason,
		int $now,
		GameLifecycle $lifecycle,
	): void {
		$game->setVariantResult($result->code());
		$lifecycle->finish($game, $game->isMultiSeat() ? '*' : self::classicResult($result), $reason, $now);
	}

	/**
	 * The view of a server-ruled game for `$uid`: while the game runs, the state of the variant layer as that player
	 * may know it (VariantEngine::viewFor); once it has ended, the real state (with `visible` and `legal` null). Null
	 * for a game that the server does not rule, that has no position (not started), or for someone who does not play.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function viewOf(Game $game, string $uid): ?array {
		$board = self::boardOf($game);
		$color = $game->colorOf($uid);
		if ($board === null || $color === null) {
			return null;
		}
		if ($game->hasEnded()) {
			return ['visible' => null, 'legal' => null] + $board;
		}
		return VariantEngine::viewFor($board, self::seatOfColor($game, $color));
	}

	/**
	 * The real position of a server-ruled game, or null.
	 *
	 * @return array<string, mixed>|null
	 */
	private static function boardOf(Game $game): ?array {
		if (!VariantCatalog::isRefereed((string)$game->getVariant())) {
			return null;
		}
		$board = VariantTurn::of($game)->board;
		return $board === null ? null : VariantEngine::decode($board);
	}

	/** The start record of a variant game: for a server-ruled variant with its start position. */
	public static function startTurn(string $variant): VariantTurn {
		$turn = VariantTurn::start();
		return VariantCatalog::isRefereed($variant)
			? $turn->withBoard(VariantEngine::encode(VariantEngine::newGame($variant)))
			: $turn;
	}

	/**
	 * The odds of a move of a server-ruled game before the player confirms it (Fog of war): its outcomes without the
	 * game result, or null for a move the server refuses. Only for the player to move.
	 *
	 * @return list<array<string, mixed>>|null
	 * @throws ApiException
	 */
	public function preview(int $id, string $uid, string $code): ?array {
		$game = $this->activeGame($this->participantGame($id, $uid));
		$board = self::boardOf($game);
		if ($board === null) {
			throw $this->errors->invalidStatus();
		}
		$color = $game->colorOf($uid);
		if ($color === null || $color !== $game->getTurn()) {
			throw new ApiException(ApiError::NotYourTurn, $this->l->t('It is not your move.'));
		}
		if (!preg_match(self::CODE_PATTERN, $code)) {
			return null;
		}
		return VariantEngine::preview($board, $code);
	}

	/**
	 * Sends a move and draws its roll. The turn stays with the mover until the move is settled. In a server-ruled
	 * game the server decides the move instead: a move it refuses comes back as `refused` (nothing is stored, the turn
	 * is not used); a move it accepts is played and settled at once.
	 *
	 * The checks run in this order: participant, idempotent retry, lazy deadline, status, turn, a move that still
	 * waits for its settlement, ply, the form of the code.
	 *
	 * @return array{game: Game, move: ?VariantMove, replayed: bool, refused: bool}
	 * @throws ApiException
	 */
	public function move(int $id, string $uid, string $code, int $ply, ?string $clientId, ?int $thinkMs): array {
		$game = $this->participantGame($id, $uid);
		if ($clientId !== null && !preg_match('/^[A-Za-z0-9-]{8,36}\z/', $clientId)) {
			throw ApiException::invalidArgument('clientId', $this->l->t('Invalid client id'));
		}
		if ($thinkMs !== null && ($thinkMs < 0 || $thinkMs > self::MAX_THINK_MS)) {
			$thinkMs = null;
		}
		if ($clientId !== null && ($stored = $this->moves->findByClientId($id, $clientId)) !== null) {
			return ['game' => $game, 'move' => $stored, 'replayed' => true, 'refused' => false];
		}
		$game = $this->activeGame($game);
		$color = $game->colorOf($uid);
		if ($color === null || $color !== $game->getTurn()) {
			throw new ApiException(ApiError::NotYourTurn, $this->l->t('It is not your move.'));
		}
		$turn = VariantTurn::of($game);
		if ($turn->pending !== null || $ply !== $game->getPly()) {
			throw $this->errors->conflict();
		}
		if (!preg_match(self::CODE_PATTERN, $code)) {
			throw ApiException::invalidArgument('code', $this->l->t('This move is not possible.'));
		}
		$seat = self::seatOfColor($game, $color);
		$board = self::boardOf($game);
		if ($board !== null && !VariantEngine::isLegal($board, $code)) {
			return ['game' => $game, 'move' => null, 'replayed' => false, 'refused' => true];
		}
		$u = $this->random->drawU();
		$chain = VariantChain::next((string)$game->getChain(), $ply, $seat, $code, $u);
		$now = $this->clock->now();

		$move = new VariantMove();
		$move->setGameId($id);
		$move->setPly($ply);
		$move->setSeat($seat);
		$move->setUid($uid);
		$move->setCode($code);
		$move->setU($u);
		$move->setNextSeat(null);
		$move->setResult(null);
		$move->setStateHash(null);
		$move->setSettledBy(null);
		$move->setSettledAt(null);
		$move->setChain($chain);
		$move->setClientId($clientId);
		$move->setThinkMs($thinkMs);
		$move->setCreatedAt($now);

		$next = null;
		if ($board !== null) {
			$next = VariantEngine::apply($board, $code, $u);
			if ($next === null) {
				throw $this->errors->conflict();
			}
			$settlement = VariantEngine::settlement($next);
			$move->setNextSeat($settlement['nextSeat']);
			$move->setResult($settlement['result']);
			$move->setStateHash($settlement['stateHash']);
			$move->setSettledBy($uid);
			$move->setSettledAt($now);
		}

		try {
			return $this->transaction->run(function () use ($game, $move, $turn, $chain, $ply, $now, $next): array {
				$move = $this->moves->insert($move);
				$game->setPly($ply + 1);
				$game->setChain($chain);
				$game->setLastMoveAt($now);
				if ($next === null) {
					$game->setState($turn->withPending($ply)->json());
					$this->repository->save($game);
				} else {
					$result = VariantResult::parse((string)$move->getResult(), $game->getSeatCount());
					$this->conclude($game, $move, $turn->withBoard(VariantEngine::encode($next)), $result, $now);
				}
				return ['game' => $game, 'move' => $move, 'replayed' => false, 'refused' => false];
			});
		} catch (DbException $e) {
			// The unique indexes on (game, ply) and (game, clientId) make a concurrent move for the same ply fail here.
			if ($e->getReason() !== DbException::REASON_UNIQUE_CONSTRAINT_VIOLATION) {
				throw $e;
			}
			if ($clientId !== null && ($stored = $this->moves->findByClientId($id, $clientId)) !== null) {
				$game = $this->repository->find($id) ?? $game;
				return ['game' => $game, 'move' => $stored, 'replayed' => true, 'refused' => false];
			}
			throw $this->errors->conflict();
		}
	}

	/**
	 * Settles the move at `$ply`: what it led to when played with its roll. Any player may settle, so a game goes on
	 * when the mover leaves before settling. The same settlement again changes nothing; a different one disputes the
	 * game.
	 *
	 * @param string $result the result code (VariantResult), empty while the game goes on
	 * @throws ApiException
	 */
	public function settle(int $id, string $uid, int $ply, int $nextSeat, string $result, string $stateHash): Game {
		$game = $this->participantGame($id, $uid);
		if (VariantCatalog::isRefereed((string)$game->getVariant())) {
			// the server settles the moves of the games it rules
			throw $this->errors->invalidStatus();
		}
		if ($nextSeat < 0 || $nextSeat >= $game->getSeatCount()) {
			throw ApiException::invalidArgument('nextSeat', $this->l->t('Invalid value'));
		}
		try {
			$parsed = VariantResult::parse($result, $game->getSeatCount());
		} catch (\InvalidArgumentException) {
			throw ApiException::invalidArgument('result', $this->l->t('Invalid value'));
		}
		if (!preg_match('/^[0-9a-f]{16}\z/', $stateHash)) {
			throw ApiException::invalidArgument('stateHash', $this->l->t('Invalid value'));
		}
		$move = $this->moves->findByPly($id, $ply);
		if ($move === null) {
			throw $this->errors->conflict();
		}
		if ($move->isSettled()) {
			$same = $move->getNextSeat() === $nextSeat && $move->getResult() === $result
				&& $move->getStateHash() === $stateHash;
			return $same ? $game : $this->annul($game, $uid, $ply);
		}
		$game = $this->activeGame($game);
		$turn = VariantTurn::of($game);
		if ($turn->pending !== $ply) {
			throw $this->errors->conflict();
		}
		$now = $this->clock->now();
		return $this->transaction->run(function () use (
			$game,
			$move,
			$turn,
			$uid,
			$nextSeat,
			$result,
			$parsed,
			$stateHash,
			$now,
		): Game {
			$move->setNextSeat($nextSeat);
			$move->setResult($result);
			$move->setStateHash($stateHash);
			$move->setSettledBy($uid);
			$move->setSettledAt($now);
			$this->moves->update($move);
			$this->conclude($game, $move, $turn, $parsed, $now);
			return $game;
		});
	}

	/**
	 * After a move was settled (by a browser, or by the server in a server-ruled game): the turn passes when the move
	 * hands it to another seat, an open draw offer of the other side is declined, a result finishes the game, and the
	 * players are told. Runs inside the transaction; saves the game.
	 */
	private function conclude(
		Game $game,
		VariantMove $move,
		VariantTurn $turn,
		?VariantResult $parsed,
		int $now,
	): void {
		$nextSeat = (int)$move->getNextSeat();
		$mover = self::colorOfSeat($game, $move->getSeat());
		$passed = $nextSeat !== $move->getSeat();
		$turn = $turn->withPending(null);
		if ($passed) {
			$turn = $turn->withTurnPassed();
			$game->setTurn(self::colorOfSeat($game, $nextSeat));
			$game->setDeadlineAt($this->clock->deadlineFrom($game->getTimeControl(), $now));
		}
		$game->setSeatToMove($nextSeat);
		$game->setState($turn->json());
		$declined = false;
		$offer = $game->getDrawOffer();
		// with more than two seats an offer stands until every seat answered it
		if ($offer !== null && $offer !== $mover && !$game->isMultiSeat()) {
			GameplayService::declineDrawOffer($game, $offer, $move->getPly(), $this->lifecycle);
			$declined = true;
		}
		if ($parsed !== null) {
			self::finishWith($game, $parsed, $parsed->reason, $now, $this->lifecycle);
		}
		$this->repository->save($game);
		$this->transaction->afterCommit(function () use ($game, $move, $passed, $declined): void {
			if ($declined) {
				$this->notifications->drawClosed($game);
			}
			if ($game->getStatus() !== Game::STATUS_ACTIVE) {
				$this->notifications->gameOver($game);
			} elseif ($passed) {
				$this->notifications->variantTurn($game, (string)$move->getUid());
			}
		});
	}

	/**
	 * A player's browser found a move or a settlement that does not agree with the rules: the game is annulled.
	 *
	 * @throws ApiException
	 */
	public function dispute(int $id, string $uid, int $ply): Game {
		$game = $this->participantGame($id, $uid);
		if (VariantCatalog::isRefereed((string)$game->getVariant())) {
			throw $this->errors->invalidStatus();
		}
		if ($this->moves->findByPly($id, $ply) === null) {
			throw ApiException::invalidArgument('ply', $this->l->t('Invalid value'));
		}
		return $this->annul($game, $uid, $ply);
	}

	/**
	 * The result of a two-seat game as classic games store it.
	 */
	public static function classicResult(VariantResult $result): string {
		return match ($result->winners) {
			[0] => '1-0',
			[1] => '0-1',
			default => '1/2-1/2',
		};
	}

	/**
	 * Ends a game whose moves the players do not agree on. An active or finished game becomes aborted (no result, never
	 * rated); a game that is already annulled stays as it is.
	 */
	private function annul(Game $game, string $uid, int $ply): Game {
		if (!in_array($game->getStatus(), [Game::STATUS_ACTIVE, Game::STATUS_FINISHED], true)) {
			return $game;
		}
		return $this->transaction->run(function () use ($game, $uid, $ply): Game {
			$this->lifecycle->abort($game, 'disputed', $this->clock->now());
			$game->setVariantResult(null);
			$this->lifecycle->addSystemLine($game, 'disputed', ['ply' => $ply]);
			$this->repository->save($game);
			$this->transaction->afterCommit(fn () => $this->notifications->gameOver($game, $uid));
			return $game;
		});
	}

	/**
	 * A variant game that `$uid` plays in.
	 *
	 * @throws ApiException
	 */
	private function participantGame(int $id, string $uid): Game {
		$game = $this->repository->find($id);
		if ($game === null || !$game->isParticipant($uid)) {
			throw $this->errors->notFound();
		}
		if (!$game->isVariant()) {
			throw $this->errors->invalidStatus();
		}
		return $game;
	}

	/**
	 * The game after its deadline was resolved, when it is still active.
	 *
	 * @throws ApiException
	 */
	private function activeGame(Game $game): Game {
		$game = $this->lifecycle->resolveLazy($game);
		if ($game->getStatus() !== Game::STATUS_ACTIVE) {
			if ($game->hasEnded()) {
				throw $this->errors->gameOver();
			}
			throw $this->errors->invalidStatus();
		}
		return $game;
	}
}
