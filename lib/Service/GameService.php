<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\Db\ChatMapper;
use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Db\MoveMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\Exception as DbException;
use OCP\IDBConnection;
use OCP\IL10N;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

/**
 * The server-authoritative online game flow (docs/SPEC.md §8): lobby, invitations, open challenges, moves with
 * CSPRNG rolls and the hash chain, draw offers, resignation, abort, rematch, chat, deadlines and maintenance.
 *
 * Every write runs in one transaction with an optimistic `rev` check; notifications are sent after commit.
 */
class GameService {
	public const PHRASES = ['good_luck', 'nice_split', 'well_played', 'oops', 'thanks', 'good_game'];
	public const CHAT_MAX = 500;
	public const LOBBY_GROUP_MAX = 20;
	public const DRAW_COOLDOWN_PLIES = 6;
	public const REMATCH_EXPIRY = 86400;

	/** @var list<callable(): void> */
	private array $afterCommit = [];

	public function __construct(
		private GameMapper $games,
		private MoveMapper $moves,
		private ChatMapper $chatMapper,
		private Engine $engine,
		private InvitePolicy $policy,
		private TimeControl $timeControl,
		private RatingService $ratings,
		private NotificationService $notifications,
		private SettingsService $settings,
		private IDBConnection $db,
		private ITimeFactory $time,
		private IUserManager $userManager,
		private IL10N $l,
		private LoggerInterface $logger,
	) {
	}

	// ------------------------------------------------------------------ helpers

	private function now(): int {
		return $this->time->getTime();
	}

	/** The CSPRNG draw of a rolled move (ER §9.2); a method so that tests can observe it. */
	protected function drawU(): int {
		return random_int(0, Engine::T - 1);
	}

	private function notFound(): ApiException {
		return new ApiException('not_found', $this->l->t('This game does not exist or is not available.'), 404);
	}

	private function invalidStatus(): ApiException {
		return new ApiException('invalid_status', $this->l->t('This is not possible in the current state of the game.'), 409);
	}

	private function conflict(): ApiException {
		return new ApiException('conflict', $this->l->t('The game has changed in the meantime.'), 409);
	}

	/**
	 * Runs `$fn` in a transaction, then the queued after-commit callbacks.
	 *
	 * @template T
	 * @param callable(): T $fn
	 * @return T
	 */
	private function tx(callable $fn): mixed {
		$this->afterCommit = [];
		$this->db->beginTransaction();
		try {
			$result = $fn();
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			$this->afterCommit = [];
			throw $e;
		}
		$callbacks = $this->afterCommit;
		$this->afterCommit = [];
		foreach ($callbacks as $callback) {
			try {
				$callback();
			} catch (\Throwable $e) {
				$this->logger->warning('Quantum Chess: after-commit step failed', ['exception' => $e]);
			}
		}
		return $result;
	}

	/** @param callable(): void $callback */
	private function after(callable $callback): void {
		$this->afterCommit[] = $callback;
	}

	/** Saves the game with `rev + 1`; throws `conflict` when someone else changed it first. */
	private function save(Game $game): void {
		$rev = $game->getRev();
		$game->setRev($rev + 1);
		$game->setUpdatedAt($this->now());
		if (!$this->games->updateChecked($game, $rev)) {
			$game->setRev($rev);
			throw $this->conflict();
		}
	}

	private function addSystemLine(Game $game, string $key, array $params = []): void {
		$line = new ChatMessage();
		$line->setGameId($game->getId());
		$line->setUid(null);
		$line->setKind(ChatMessage::KIND_SYSTEM);
		$line->setMessage($key);
		$line->setParams($params === [] ? null : json_encode($params));
		$line->setCreatedAt($this->now());
		$this->chatMapper->insert($line);
		$game->setChatCount($game->getChatCount() + 1);
	}

	/** Finishes an active game (SPEC §8.1 finish); the caller saves it. */
	private function finish(Game $game, string $result, string $reason, int $finishedAt): void {
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setResult($result);
		$game->setResultReason($reason);
		$game->setFinishedAt($finishedAt);
		$game->setDeadlineAt(null);
		$game->setDrawOffer(null);
		$game->setDrawOfferPly(null);
		$this->ratings->applyResult($game);
	}

	private function abortGame(Game $game, string $reason, int $at): void {
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

	/** @return array<string, mixed> */
	private function state(Game $game): array {
		return $this->engine->parseState($game->getState());
	}

	/**
	 * Loads a game for `$uid`: a participant, or (with `$allowOpen`) a user who may see the open challenge. Applies
	 * lazy maintenance first.
	 */
	private function load(int $id, string $uid, bool $allowOpen = false): Game {
		$game = $this->games->findById($id);
		if ($game === null) {
			throw $this->notFound();
		}
		if (!$game->isParticipant($uid) && !($allowOpen && $this->policy->canSeeOpenChallenge($uid, $game))) {
			throw $this->notFound();
		}
		return $this->resolveLazy($game);
	}

	/**
	 * Resolves a passed expiry, deadline or abandonment (own transaction, rev-checked). Returns the current game.
	 */
	public function resolveLazy(Game $game): Game {
		$now = $this->now();
		$status = $game->getStatus();
		$expired = in_array($status, [Game::STATUS_PENDING, Game::STATUS_OPEN], true)
			&& $game->getExpiresAt() !== null && $game->getExpiresAt() <= $now;
		$due = $this->timeControl->dueAt($game);
		if (!$expired && ($due === null || $due > $now)) {
			return $game;
		}
		try {
			$this->tx(function () use ($game, $expired, $due): void {
				if ($expired) {
					$game->setStatus(Game::STATUS_EXPIRED);
					$game->setFinishedAt((int)$game->getExpiresAt());
					$this->save($game);
					$this->after(fn () => $this->notifications->inviteClosed($game));
					return;
				}
				$at = (int)$due;
				$outcome = $this->timeControl->resolveTimeout($game, $this->state($game));
				if ($outcome['status'] === Game::STATUS_ABORTED) {
					$this->abortGame($game, $outcome['reason'], $at);
				} else {
					$this->finish($game, (string)$outcome['result'], $outcome['reason'], $at);
				}
				$this->addSystemLine($game, 'timeout', ['color' => $game->getTurn()]);
				$this->save($game);
				$this->after(fn () => $this->notifications->gameOver($game));
			});
		} catch (ApiException $e) {
			if ($e->getErrorCode() !== 'conflict') {
				throw $e;
			}
			$fresh = $this->games->findById((int)$game->getId());
			if ($fresh === null) {
				throw $this->notFound();
			}
			return $fresh;
		}
		return $game;
	}

	// ------------------------------------------------------------------ reads

	/** @return array{yourTurn: list<Game>, waiting: list<Game>, invitations: list<Game>, outgoing: list<Game>, open: list<Game>, recent: list<Game>} */
	public function getLobby(string $uid): array {
		$live = array_map(fn (Game $g) => $this->resolveLazy($g),
			$this->games->findForUser($uid, [Game::STATUS_PENDING, Game::STATUS_OPEN, Game::STATUS_ACTIVE]));
		$groups = ['yourTurn' => [], 'waiting' => [], 'invitations' => [], 'outgoing' => [], 'open' => [], 'recent' => []];
		foreach ($live as $game) {
			$status = $game->getStatus();
			if ($status === Game::STATUS_ACTIVE) {
				$groups[$game->colorOf($uid) === $game->getTurn() ? 'yourTurn' : 'waiting'][] = $game;
			} elseif ($status === Game::STATUS_PENDING && $game->getOpponentUid() === $uid) {
				$groups['invitations'][] = $game;
			} elseif (in_array($status, [Game::STATUS_PENDING, Game::STATUS_OPEN], true) && $game->getCreatorUid() === $uid) {
				$groups['outgoing'][] = $game;
			}
		}
		usort($groups['yourTurn'], fn (Game $a, Game $b) => [$a->getDeadlineAt() ?? PHP_INT_MAX, $this->timeControl->lastActivity($a)]
			<=> [$b->getDeadlineAt() ?? PHP_INT_MAX, $this->timeControl->lastActivity($b)]);
		foreach ($this->games->findOpen(100) as $game) {
			if (count($groups['open']) >= self::LOBBY_GROUP_MAX) {
				break;
			}
			if ($this->policy->canSeeOpenChallenge($uid, $game)) {
				$game = $this->resolveLazy($game);
				if ($game->getStatus() === Game::STATUS_OPEN) {
					$groups['open'][] = $game;
				}
			}
		}
		$groups['recent'] = $this->games->history($uid, [Game::STATUS_FINISHED, Game::STATUS_ABORTED], null, null, 5);
		foreach ($groups as $key => $list) {
			$groups[$key] = array_slice($list, 0, self::LOBBY_GROUP_MAX);
		}
		return $groups;
	}

	public function lobbyToken(string $uid): string {
		$print = $this->games->lobbyFingerprint($uid);
		return 'u' . substr(md5($print['mine']), 0, 10) . '.o' . substr(md5($print['open']), 0, 6);
	}

	/** @return array{yourTurn: int, invitations: int} */
	public function countActionNeeded(string $uid): array {
		$counts = ['yourTurn' => 0, 'invitations' => 0];
		$now = $this->now();
		foreach ($this->games->findForUser($uid, [Game::STATUS_PENDING, Game::STATUS_ACTIVE]) as $game) {
			if ($game->getStatus() === Game::STATUS_ACTIVE && $game->colorOf($uid) === $game->getTurn()
				&& ($this->timeControl->dueAt($game) ?? PHP_INT_MAX) > $now) {
				$counts['yourTurn']++;
			} elseif ($game->getStatus() === Game::STATUS_PENDING && $game->getOpponentUid() === $uid
				&& ($game->getExpiresAt() ?? PHP_INT_MAX) > $now) {
				$counts['invitations']++;
			}
		}
		return $counts;
	}

	/** @return list<Game> invitations (incl. rematch offers) first, then your-move games by nearest deadline */
	public function listDashboard(string $uid, int $limit = 7): array {
		$lobby = $this->getLobby($uid);
		return array_slice(array_merge($lobby['invitations'], $lobby['yourTurn']), 0, max(0, $limit));
	}

	/**
	 * @param array<string, mixed> $query status (finished|aborted|all), cursor, limit
	 * @return array{games: list<Game>, next: ?string}
	 */
	public function history(string $uid, array $query): array {
		$statuses = match ($query['status'] ?? 'finished') {
			'aborted' => [Game::STATUS_ABORTED],
			'all' => [Game::STATUS_FINISHED, Game::STATUS_ABORTED],
			default => [Game::STATUS_FINISHED],
		};
		$limit = max(1, min(50, (int)($query['limit'] ?? 20)));
		$beforeFinished = null;
		$beforeId = null;
		$cursor = $query['cursor'] ?? null;
		if (is_string($cursor) && $cursor !== '') {
			$decoded = base64_decode($cursor, true);
			if ($decoded === false || !preg_match('/^(\d+):(\d+)$/', $decoded, $m)) {
				throw new ApiException('invalid_argument', $this->l->t('Invalid cursor'), 400, ['field' => 'cursor']);
			}
			$beforeFinished = (int)$m[1];
			$beforeId = (int)$m[2];
		}
		$list = $this->games->history($uid, $statuses, $beforeFinished, $beforeId, $limit + 1);
		$next = null;
		if (count($list) > $limit) {
			$list = array_slice($list, 0, $limit);
			$last = $list[$limit - 1];
			$next = base64_encode((int)$last->getFinishedAt() . ':' . (int)$last->getId());
		}
		return ['games' => $list, 'next' => $next];
	}

	public function get(int $id, string $uid): Game {
		return $this->load($id, $uid, true);
	}

	/** @return array{game: Game, moves: list<Move>, chat: list<ChatMessage>} */
	public function getFull(int $id, string $uid): array {
		$game = $this->load($id, $uid, true);
		if (!$game->isParticipant($uid)) {
			return ['game' => $game, 'moves' => [], 'chat' => []];
		}
		return ['game' => $game, 'moves' => $this->moves->findByGame($id), 'chat' => $this->chatMapper->findByGame($id)];
	}

	/**
	 * A plain `rev` compare (the distributed-cache hot path is deferred to 1.1).
	 *
	 * @return array{changed: bool, rev: int, now: int, game?: Game, moves?: list<Move>, chat?: list<ChatMessage>}
	 */
	public function poll(int $id, string $uid, int $rev, int $ply, int $chatId, bool $watching): array {
		$game = $this->load($id, $uid, true);
		$now = $this->now();
		if ($game->getRev() === $rev) {
			return ['changed' => false, 'rev' => $rev, 'now' => $now];
		}
		$participant = $game->isParticipant($uid);
		return [
			'changed' => true,
			'rev' => $game->getRev(),
			'now' => $now,
			'game' => $game,
			'moves' => $participant ? $this->moves->findByGame($id, max(0, $ply)) : [],
			'chat' => $participant ? $this->chatMapper->findByGame($id, max(0, $chatId)) : [],
		];
	}

	/** @return list<string> user ids, most recent first */
	public function recentOpponents(string $uid, int $limit = 8): array {
		$result = [];
		foreach ($this->games->findForUser($uid, [Game::STATUS_ACTIVE, Game::STATUS_FINISHED, Game::STATUS_ABORTED], 100) as $game) {
			$other = $game->opponentOf($uid);
			if ($other !== null && !in_array($other, $result, true) && $this->userManager->userExists($other)) {
				$result[] = $other;
				if (count($result) >= $limit) {
					break;
				}
			}
		}
		return $result;
	}

	/** @return array{rated: bool, reason: ?string} */
	public function ratedCheck(string $uid, string $opponent): array {
		return $this->settings->ratedEnabled() ? ['rated' => true, 'reason' => null] : ['rated' => false, 'reason' => 'admin'];
	}

	/** @return array{active: int, finishedToday: int} */
	public function diagnostics(): array {
		return $this->games->diagnostics($this->now());
	}

	// ------------------------------------------------------------------ creating and answering

	/**
	 * @param array<string, mixed> $request opponent, color, rated, timeControl, message, scopeGroup
	 */
	public function create(string $uid, array $request): Game {
		if (!$this->policy->isMultiplayerUser($uid)) {
			throw new ApiException('multiplayer_disabled', $this->l->t('Online games are not available for you.'), 403);
		}
		$opponent = $request['opponent'] ?? null;
		if ($opponent !== null && (!is_string($opponent) || $opponent === '')) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid opponent'), 400, ['field' => 'opponent']);
		}
		/** @var ?string $opponent */
		$isOpen = $opponent === null;
		$color = $request['color'] ?? 'r';
		if (!in_array($color, ['w', 'b', 'r'], true)) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid colour'), 400, ['field' => 'color']);
		}
		$rated = $request['rated'] ?? true;
		if (!is_bool($rated)) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => 'rated']);
		}
		$timeControl = $request['timeControl'] ?? 'corr:3d';
		if (!is_string($timeControl) || !$this->timeControl->isValid($timeControl)) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid time control'), 400, ['field' => 'timeControl']);
		}
		$message = $request['message'] ?? null;
		if ($message !== null && !is_string($message)) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid message'), 400, ['field' => 'message']);
		}
		$message = $message === null ? null : mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $message) ?? ''), 0, 200);
		$scopeGroup = $request['scopeGroup'] ?? null;
		if ($scopeGroup !== null && (!is_string($scopeGroup) || $opponent !== null || $scopeGroup === '')) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid group'), 400, ['field' => 'scopeGroup']);
		}
		if ($rated && $timeControl === 'corr:none') {
			throw new ApiException('rated_needs_deadline', $this->l->t('Rated games need a time limit.'), 400);
		}
		if ($rated && !$this->settings->ratedEnabled()) {
			throw new ApiException('rated_not_allowed', $this->l->t('Rated games are turned off on this server.'), 400);
		}
		if ($opponent === null) {
			if (!$this->settings->openChallengesEnabled()) {
				throw new ApiException('open_challenges_disabled', $this->l->t('Open challenges are turned off on this server.'), 403);
			}
			if ($scopeGroup !== null && !$this->policy->isInGroup($uid, $scopeGroup)) {
				throw new ApiException('invalid_argument', $this->l->t('Invalid group'), 400, ['field' => 'scopeGroup']);
			}
		} else {
			$opponent = $this->policy->assertCanInvite($uid, $opponent);
		}
		$this->policy->assertWithinLimits($uid, $opponent);

		$now = $this->now();
		$game = new Game();
		$game->setCreatorUid($uid);
		$game->setOpponentUid($opponent);
		$game->setColorChoice($rated ? 'r' : $color);
		$game->setStatus($isOpen ? Game::STATUS_OPEN : Game::STATUS_PENDING);
		$game->setState($this->engine->serializeState($this->engine->initialState()));
		$game->setPly(0);
		$game->setTurn('w');
		$game->setRev(1);
		$game->setRatedRequested($rated ? 1 : 0);
		$game->setRated(0);
		$game->setTimeControl($timeControl);
		$days = $isOpen ? $this->settings->openExpiryDays() : $this->settings->inviteExpiryDays();
		$game->setExpiresAt($now + $days * 86400);
		$game->setInviteMessage($message === '' ? null : $message);
		$game->setScopeGroup($scopeGroup);
		$game->setCreatedAt($now);
		$game->setUpdatedAt($now);
		$game = $this->games->insert($game);
		if (!$isOpen) {
			$this->notifications->invite($game);
		}
		return $game;
	}

	/** SPEC §8.1 start: colours, rated decision, deadline, chain_0. The caller saves. */
	private function start(Game $game, int $now): void {
		$creator = (string)$game->getCreatorUid();
		$opponent = (string)$game->getOpponentUid();
		$choice = $game->getColorChoice();
		$creatorWhite = $choice === 'w' || ($choice === 'r' && random_int(0, 1) === 0);
		$white = $creatorWhite ? $creator : $opponent;
		$black = $creatorWhite ? $opponent : $creator;
		$game->setWhiteUid($white);
		$game->setBlackUid($black);
		if ($game->getRatedRequested() === 1) {
			if ($this->settings->ratedEnabled() && $game->getTimeControl() !== 'corr:none') {
				$game->setRated(1);
			} else {
				$game->setRated(0);
				$game->setUnratedReason('admin');
			}
		}
		$game->setDeadlineAt($this->timeControl->deadlineFrom($game->getTimeControl(), $now));
		$game->setChain($this->engine->chainStart((int)$game->getId(), $white, $black, $game->getCreatedAt()));
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setStartedAt($now);
		$game->setExpiresAt(null);
		$game->setReminders(0);
	}

	public function accept(int $id, string $uid): Game {
		$game = $this->load($id, $uid);
		if ($game->getOpponentUid() !== $uid || $game->getStatus() !== Game::STATUS_PENDING) {
			throw $this->invalidStatus();
		}
		$this->policy->assertActiveLimit($uid);
		return $this->tx(function () use ($game): Game {
			$this->start($game, $this->now());
			$this->save($game);
			$this->after(function () use ($game): void {
				$this->notifications->inviteClosed($game);
				$this->notifications->inviteAccepted($game);
			});
			return $game;
		});
	}

	public function decline(int $id, string $uid): Game {
		$game = $this->load($id, $uid);
		if ($game->getOpponentUid() !== $uid || $game->getStatus() !== Game::STATUS_PENDING) {
			throw $this->invalidStatus();
		}
		return $this->tx(function () use ($game): Game {
			$game->setStatus(Game::STATUS_DECLINED);
			$game->setFinishedAt($this->now());
			$this->save($game);
			$this->after(function () use ($game): void {
				$this->notifications->inviteClosed($game);
				$this->notifications->inviteDeclined($game);
			});
			return $game;
		});
	}

	public function cancel(int $id, string $uid): Game {
		$game = $this->load($id, $uid);
		if ($game->getCreatorUid() !== $uid || !in_array($game->getStatus(), [Game::STATUS_PENDING, Game::STATUS_OPEN], true)) {
			throw $this->invalidStatus();
		}
		return $this->tx(function () use ($game): Game {
			$game->setStatus(Game::STATUS_CANCELLED);
			$game->setFinishedAt($this->now());
			$this->save($game);
			$this->after(fn () => $this->notifications->inviteClosed($game));
			return $game;
		});
	}

	public function join(int $id, string $uid): Game {
		$game = $this->games->findById($id);
		if ($game === null) {
			throw $this->notFound();
		}
		if ($game->getCreatorUid() === $uid) {
			if ($game->getStatus() === Game::STATUS_OPEN) {
				throw new ApiException('own_challenge', $this->l->t('This is your own challenge.'), 400);
			}
			throw $this->invalidStatus();
		}
		if ($game->getStatus() !== Game::STATUS_OPEN) {
			// A taken challenge answers like any other game id: game ids of other people cannot be probed (§12.3).
			// `already_taken` is only the answer of the join that lost the race below.
			throw $this->notFound();
		}
		if (!$this->policy->canSeeOpenChallenge($uid, $game)) {
			throw $this->notFound();
		}
		$game = $this->resolveLazy($game);
		if ($game->getStatus() !== Game::STATUS_OPEN) {
			throw $this->notFound();
		}
		$this->policy->assertActiveLimit($uid);
		try {
			return $this->tx(function () use ($game, $uid): Game {
				$game->setOpponentUid($uid);
				$this->start($game, $this->now());
				$this->save($game);
				$this->after(fn () => $this->notifications->inviteAccepted($game, true));
				return $game;
			});
		} catch (ApiException $e) {
			if ($e->getErrorCode() === 'conflict') {
				throw $this->alreadyTaken();
			}
			throw $e;
		}
	}

	private function alreadyTaken(): ApiException {
		return new ApiException('already_taken', $this->l->t('Someone was faster. The challenge is gone.'), 409);
	}

	// ------------------------------------------------------------------ playing

	/**
	 * SPEC §8.4: participant → idempotency → lazy deadline → status → turn → ply → legality.
	 *
	 * @return array{game: Game, move: Move, measurement: ?array, replayed: bool}
	 */
	public function move(int $id, string $uid, string $code, int $ply, ?string $clientId, ?int $thinkMs): array {
		$game = $this->games->findById($id);
		if ($game === null || !$game->isParticipant($uid)) {
			throw $this->notFound();
		}
		if ($clientId !== null && !preg_match('/^[A-Za-z0-9-]{8,36}$/', $clientId)) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid client id'), 400, ['field' => 'clientId']);
		}
		if ($thinkMs !== null && ($thinkMs < 0 || $thinkMs > 2592000000)) {
			$thinkMs = null;
		}
		if ($clientId !== null && ($stored = $this->moves->findByClientId($id, $clientId)) !== null) {
			return ['game' => $game, 'move' => $stored, 'measurement' => $stored->getMeasurementRecord(), 'replayed' => true];
		}
		$game = $this->resolveLazy($game);
		if ($game->getStatus() !== Game::STATUS_ACTIVE) {
			if ($game->getStatus() === Game::STATUS_FINISHED || $game->getStatus() === Game::STATUS_ABORTED) {
				throw new ApiException('game_over', $this->l->t('This game is over.'), 409);
			}
			throw $this->invalidStatus();
		}
		$color = $game->colorOf($uid);
		if ($color !== $game->getTurn()) {
			throw new ApiException('not_your_turn', $this->l->t('It is not your move.'), 403);
		}
		if ($ply !== $game->getPly()) {
			throw $this->conflict();
		}
		$state = $this->state($game);
		$legal = $this->engine->findMove($state, $code);
		if ($legal === null) {
			throw new ApiException('illegal_move', $this->l->t('This move is not possible.'), 400,
				['reason' => $this->engine->whyIllegal($state, $code) ?? 'malformed']);
		}
		$u = $legal['resolution'] === 'rolled' ? $this->drawU() : null;
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
		$now = $this->now();

		$move = new Move();
		$move->setGameId($id);
		$move->setPly($ply);
		$move->setColor($color);
		$move->setUid($uid);
		$move->setCode($legal['code']);
		$move->setNotation($notation);
		$move->setMeasurement($measurement === null ? null : json_encode($measurement, JSON_UNESCAPED_SLASHES));
		$move->setChain($chain);
		$move->setStateHash($this->engine->positionHash($after));
		$move->setSupportKey($this->engine->supportKey($after));
		$move->setClientId($clientId);
		$move->setThinkMs($thinkMs);
		$move->setCreatedAt($now);

		try {
			return $this->tx(function () use ($game, $move, $after, $json, $chain, $color, $ply, $now, $measurement, $capturedType): array {
				$move = $this->moves->insert($move);
				$game->setState($json);
				$game->setPly((int)$after['ply']);
				$game->setTurn((string)$after['turn']);
				$game->setChain($chain);
				$game->setLastMoveAt($now);
				$game->setDeadlineAt($this->timeControl->deadlineFrom($game->getTimeControl(), $now));
				$game->setReminders(0);
				$declined = false;
				$offer = $game->getDrawOffer();
				if ($offer !== null && $offer !== $color) {
					$this->closeDrawOffer($game, $offer, $ply);
					$declined = true;
				}
				$result = $after['result'] ?? null;
				if (is_array($result)) {
					$this->finish($game, (string)$result['result'], (string)$result['reason'], $now);
				}
				$this->save($game);
				$this->after(function () use ($game, $move, $declined, $capturedType): void {
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
			if ($e->getReason() !== DbException::REASON_UNIQUE_CONSTRAINT_VIOLATION) {
				throw $e;
			}
			if ($clientId !== null && ($stored = $this->moves->findByClientId($id, $clientId)) !== null) {
				$fresh = $this->games->findById($id) ?? $game;
				return ['game' => $fresh, 'move' => $stored, 'measurement' => $stored->getMeasurementRecord(), 'replayed' => true];
			}
			throw $this->conflict();
		}
	}

	/** Declines the pending offer of `$offerer` (cool-down starts at `$ply`); the caller saves. */
	private function closeDrawOffer(Game $game, string $offerer, int $ply): void {
		$game->setDrawOffer(null);
		$game->setDrawOfferPly(null);
		if ($offerer === 'w') {
			$game->setLastDrawW($ply);
		} else {
			$game->setLastDrawB($ply);
		}
		$this->addSystemLine($game, 'draw_declined', ['color' => $offerer]);
	}

	private function loadActive(int $id, string $uid): Game {
		$game = $this->load($id, $uid);
		if ($game->getStatus() !== Game::STATUS_ACTIVE || $game->colorOf($uid) === null) {
			if (in_array($game->getStatus(), [Game::STATUS_FINISHED, Game::STATUS_ABORTED], true)) {
				throw new ApiException('game_over', $this->l->t('This game is over.'), 409);
			}
			throw $this->invalidStatus();
		}
		return $game;
	}

	public function resign(int $id, string $uid): Game {
		$game = $this->loadActive($id, $uid);
		$color = (string)$game->colorOf($uid);
		return $this->tx(function () use ($game, $color, $uid): Game {
			$this->finish($game, $color === 'w' ? '0-1' : '1-0', 'resignation', $this->now());
			$this->addSystemLine($game, 'resigned', ['color' => $color]);
			$this->save($game);
			$this->after(fn () => $this->notifications->gameOver($game, $uid));
			return $game;
		});
	}

	public function abort(int $id, string $uid): Game {
		$game = $this->loadActive($id, $uid);
		if ($game->getPly() >= 2) {
			throw new ApiException('abort_not_allowed', $this->l->t('The game can only be aborted before both sides have moved.'), 409);
		}
		$color = (string)$game->colorOf($uid);
		return $this->tx(function () use ($game, $color, $uid): Game {
			$this->abortGame($game, 'aborted', $this->now());
			$this->addSystemLine($game, 'aborted', ['color' => $color]);
			$this->save($game);
			$this->after(fn () => $this->notifications->gameOver($game, $uid));
			return $game;
		});
	}

	public function draw(int $id, string $uid, string $action): Game {
		if (!in_array($action, ['offer', 'accept', 'decline'], true)) {
			throw new ApiException('invalid_argument', $this->l->t('Invalid action'), 400, ['field' => 'action']);
		}
		$game = $this->loadActive($id, $uid);
		$color = (string)$game->colorOf($uid);
		$other = $color === 'w' ? 'b' : 'w';
		$offer = $game->getDrawOffer();
		if ($action === 'offer' && $offer === $other) {
			$action = 'accept';
		}
		if ($action === 'offer') {
			$availableAt = GameSerializer::drawAvailableAtPly($game, $color);
			if ($offer === $color || ($availableAt !== null && $game->getPly() < $availableAt)) {
				throw new ApiException('draw_not_allowed', $this->l->t('You cannot offer a draw right now.'), 409,
					['availableAtPly' => $offer === $color ? null : $availableAt]);
			}
			return $this->tx(function () use ($game, $color): Game {
				$game->setDrawOffer($color);
				$game->setDrawOfferPly($game->getPly());
				$this->addSystemLine($game, 'draw_offered', ['color' => $color]);
				$this->save($game);
				$this->after(fn () => $this->notifications->drawOffered($game));
				return $game;
			});
		}
		if ($offer !== $other) {
			throw new ApiException('no_draw_offer', $this->l->t('There is no draw offer to answer.'), 409);
		}
		return $this->tx(function () use ($game, $action, $other): Game {
			if ($action === 'accept') {
				$this->finish($game, '1/2-1/2', 'agreement', $this->now());
				$this->addSystemLine($game, 'draw_accepted', ['color' => $other === 'w' ? 'b' : 'w']);
			} else {
				$this->closeDrawOffer($game, $other, $game->getPly());
			}
			$this->save($game);
			$this->after(function () use ($game, $action): void {
				$this->notifications->drawClosed($game);
				if ($action === 'accept') {
					$this->notifications->gameOver($game);
				}
			});
			return $game;
		});
	}

	public function chat(int $id, string $uid, ?string $text, ?string $phrase): ChatMessage {
		if (!$this->settings->chatEnabled()) {
			throw new ApiException('chat_disabled', $this->l->t('Chat is turned off on this server.'), 403);
		}
		$game = $this->load($id, $uid);
		$status = $game->getStatus();
		$open = $game->colorOf($uid) !== null && ($status === Game::STATUS_ACTIVE
			|| (in_array($status, [Game::STATUS_FINISHED, Game::STATUS_ABORTED], true)
				&& (int)$game->getFinishedAt() + GameSerializer::CHAT_OPEN_AFTER_END >= $this->now()));
		if (!$open) {
			throw new ApiException('chat_closed', $this->l->t('The chat of this game is closed.'), 409);
		}
		$message = new ChatMessage();
		if ($phrase !== null) {
			if (!in_array($phrase, self::PHRASES, true)) {
				throw new ApiException('invalid_argument', $this->l->t('Unknown phrase'), 400, ['field' => 'phrase']);
			}
			$message->setKind(ChatMessage::KIND_PHRASE);
			$message->setMessage($phrase);
		} else {
			$clean = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', (string)$text) ?? '');
			$length = mb_strlen($clean);
			if ($length < 1 || $length > self::CHAT_MAX) {
				throw new ApiException('invalid_argument', $this->l->t('A message has 1 to 500 characters.'), 400, ['field' => 'message']);
			}
			$message->setKind(ChatMessage::KIND_TEXT);
			$message->setMessage($clean);
		}
		$message->setGameId($id);
		$message->setUid($uid);
		$message->setCreatedAt($this->now());
		return $this->tx(function () use ($game, $message): ChatMessage {
			$message = $this->chatMapper->insert($message);
			$game->setChatCount($game->getChatCount() + 1);
			$this->save($game);
			$this->after(fn () => $this->notifications->chat($game, $message));
			return $message;
		});
	}

	public function setMuted(int $id, string $uid, bool $muted): bool {
		$game = $this->load($id, $uid);
		$color = $game->colorOf($uid);
		if ($color === null) {
			throw $this->invalidStatus();
		}
		return $this->tx(function () use ($game, $color, $muted): bool {
			if ($color === 'w') {
				$game->setMuteW($muted ? 1 : 0);
			} else {
				$game->setMuteB($muted ? 1 : 0);
			}
			$this->save($game);
			return $muted;
		});
	}

	public function rematch(int $id, string $uid): Game {
		try {
			return $this->requestRematch($id, $uid);
		} catch (ApiException $e) {
			// A simultaneous rematch request for the same game (a double click, or both players at once) won the race:
			// answer as if it had come first (§8.5: the requester gets the pending game, the other player accepts it).
			if (in_array($e->getErrorCode(), ['conflict', 'too_many_invitations'], true)
				&& $this->games->findById($id)?->getRematchId() !== null) {
				return $this->requestRematch($id, $uid);
			}
			throw $e;
		}
	}

	private function requestRematch(int $id, string $uid): Game {
		$old = $this->load($id, $uid);
		$color = $old->colorOf($uid);
		if ($color === null || !in_array($old->getStatus(), [Game::STATUS_FINISHED, Game::STATUS_ABORTED], true)) {
			throw $this->invalidStatus();
		}
		$existing = $old->getRematchId() === null ? null : $this->games->findById($old->getRematchId());
		if ($existing !== null) {
			$existing = $this->resolveLazy($existing);
			if ($existing->getStatus() === Game::STATUS_PENDING) {
				if ($existing->getCreatorUid() === $uid) {
					return $existing;
				}
				if ($existing->getOpponentUid() === $uid) {
					return $this->accept((int)$existing->getId(), $uid);
				}
			} elseif ($existing->getStatus() === Game::STATUS_ACTIVE && $existing->isParticipant($uid)) {
				return $existing;
			}
		}
		$other = $old->opponentOf($uid);
		if ($other === null) {
			throw new ApiException('user_not_found', $this->l->t('You can\'t invite this user'), 404);
		}
		$this->policy->assertCanInvite($uid, $other);
		$this->policy->assertWithinLimits($uid, $other);
		$now = $this->now();
		return $this->tx(function () use ($old, $uid, $other, $color, $now): Game {
			$game = new Game();
			$game->setCreatorUid($uid);
			$game->setOpponentUid($other);
			$game->setColorChoice($color === 'w' ? 'b' : 'w');
			$game->setStatus(Game::STATUS_PENDING);
			$game->setState($this->engine->serializeState($this->engine->initialState()));
			$game->setRev(1);
			$game->setRatedRequested($old->getRatedRequested());
			$game->setTimeControl($old->getTimeControl());
			$game->setExpiresAt($now + self::REMATCH_EXPIRY);
			$game->setRematchOf($old->getId());
			$game->setCreatedAt($now);
			$game->setUpdatedAt($now);
			$game = $this->games->insert($game);
			$old->setRematchId($game->getId());
			$this->addSystemLine($old, 'rematch_offered', ['color' => $color]);
			$this->save($old);
			$this->after(fn () => $this->notifications->invite($game));
			return $game;
		});
	}

	public function markSeen(int $id, string $uid): void {
		$game = $this->games->findById($id);
		if ($game !== null && $game->isParticipant($uid)) {
			$this->notifications->markSeen($game, $uid);
		}
	}

	// ------------------------------------------------------------------ maintenance and deletion

	/** @return array{expired: int, timedOut: int, abandoned: int, reminders: int, chatPurged: int, gamesPurged: int} */
	public function runMaintenance(int $now, int $batch = 200): array {
		$stats = ['expired' => 0, 'timedOut' => 0, 'abandoned' => 0, 'reminders' => 0, 'chatPurged' => 0, 'gamesPurged' => 0];
		foreach ($this->games->findDue([Game::STATUS_PENDING, Game::STATUS_OPEN], 'expires_at', $now, $batch) as $game) {
			if ($this->resolveLazy($game)->getStatus() === Game::STATUS_EXPIRED) {
				$stats['expired']++;
			}
		}
		foreach ($this->games->findDue([Game::STATUS_ACTIVE], 'deadline_at', $now, $batch) as $game) {
			if ($this->resolveLazy($game)->isFinal()) {
				$stats['timedOut']++;
			}
		}
		foreach ($this->games->findAbandoned($now - TimeControl::ABANDON_AFTER, $batch) as $game) {
			if ($this->resolveLazy($game)->isFinal()) {
				$stats['abandoned']++;
			}
		}
		$cutoff = $now - $this->settings->chatRetentionDays() * 86400;
		foreach ($this->games->findChatToPurge($cutoff, $batch) as $game) {
			try {
				$this->tx(function () use ($game): void {
					$this->chatMapper->deleteByGame((int)$game->getId());
					$game->setChatCount(0);
					$this->save($game);
				});
				$stats['chatPurged']++;
			} catch (ApiException) {
				// changed concurrently: the next run picks it up
			}
		}
		$days = $this->settings->purgeFinishedDays();
		if ($days > 0) {
			foreach ($this->games->findDue(Game::FINAL_STATUSES, 'finished_at', $now - $days * 86400, $batch) as $game) {
				$this->tx(fn () => $this->games->deleteWithChildren((int)$game->getId()));
				$this->notifications->removeForGame((int)$game->getId());
				$stats['gamesPurged']++;
			}
		}
		return $stats;
	}

	/**
	 * SPEC §8.12. `$accountDeleted`: the account is gone (active games end as `player_deleted`); otherwise the user
	 * erased their data and active games are resigned.
	 */
	public function removeUser(string $uid, bool $accountDeleted): void {
		$all = [Game::STATUS_PENDING, Game::STATUS_OPEN, Game::STATUS_ACTIVE, ...Game::FINAL_STATUSES];
		foreach ($this->games->findForUser($uid, $all, 100000) as $game) {
			$id = (int)$game->getId();
			if (in_array($game->getStatus(), [Game::STATUS_PENDING, Game::STATUS_OPEN], true)) {
				$this->tx(fn () => $this->games->deleteWithChildren($id));
				$this->notifications->removeForGame($id);
				continue;
			}
			$remaining = null;
			$this->tx(function () use ($game, $uid, $accountDeleted, &$remaining): void {
				$color = $game->colorOf($uid);
				if ($game->getStatus() === Game::STATUS_ACTIVE && $color !== null) {
					$winner = $color === 'w' ? '0-1' : '1-0';
					if ($accountDeleted) {
						$game->setRated(0);
						$game->setUnratedReason('deleted');
						$this->finish($game, $winner, 'player_deleted', $this->now());
						$remaining = $game->opponentOf($uid);
					} else {
						$this->finish($game, $winner, 'resignation', $this->now());
						$this->addSystemLine($game, 'resigned', ['color' => $color]);
					}
					$this->save($game);
				}
				$this->games->clearUser((int)$game->getId(), $uid);
				$this->moves->clearUser((int)$game->getId(), $uid);
				$this->chatMapper->deleteOwn((int)$game->getId(), $uid);
				$fresh = $this->games->findById((int)$game->getId());
				if ($fresh !== null && $fresh->getWhiteUid() === null && $fresh->getBlackUid() === null
					&& $fresh->getCreatorUid() === null && $fresh->getOpponentUid() === null) {
					$this->games->deleteWithChildren((int)$game->getId());
				}
			});
			// Notifications of this game carry the removed player's id, name, chat excerpts or a rematch offer.
			$this->notifications->removeForGame($id);
			if ($remaining !== null) {
				$this->notifications->gameEndedDeleted($game, $remaining);
			} elseif ($game->getStatus() === Game::STATUS_FINISHED && $game->getResultReason() === 'resignation' && !$accountDeleted) {
				$this->notifications->gameOver($game, $uid);
			}
		}
	}
}
