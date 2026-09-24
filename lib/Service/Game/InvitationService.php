<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\IL10N;

/**
 * Creating games: invitations to a user, open challenges that anyone allowed may join, their answers, and rematches.
 */
class InvitationService {
	/** Seconds until a rematch offer expires (one day). */
	public const REMATCH_EXPIRY = GameClock::DAY;

	public function __construct(
		private readonly GameRepository $repository,
		private readonly GameLifecycle $lifecycle,
		private readonly GameTransaction $transaction,
		private readonly InvitePolicy $policy,
		private readonly AppSettings $settings,
		private readonly GameClock $clock,
		private readonly Engine $engine,
		private readonly NotificationService $notifications,
		private readonly IL10N $l,
		private readonly GameErrors $errors,
	) {
	}

	/**
	 * Creates an invitation, or an open challenge when the request names no opponent.
	 *
	 * The checks run in a fixed order, so a request with several problems always reports the same one: the user may
	 * play online, then each field, then the rules for rated games, open challenges and group scopes, then who may be
	 * invited, and last the user's limits.
	 *
	 * @param array<string, mixed> $request `opponent`, `color` (w, b or r), `rated`, `timeControl`, `message` and
	 *                                      `scopeGroup` (open challenges only)
	 * @throws ApiException
	 */
	public function create(string $uid, array $request): Game {
		if (!$this->policy->isMultiplayerUser($uid)) {
			throw new ApiException(
				ApiError::MultiplayerDisabled,
				$this->l->t('Online games are not available for you.'),
			);
		}
		$opponent = $request['opponent'] ?? null;
		if ($opponent !== null && (!is_string($opponent) || $opponent === '')) {
			throw ApiException::invalidArgument('opponent', $this->l->t('Invalid opponent'));
		}
		/** @var ?string $opponent */
		$isOpen = $opponent === null;
		$color = $request['color'] ?? 'r';
		if (!in_array($color, ['w', 'b', 'r'], true)) {
			throw ApiException::invalidArgument('color', $this->l->t('Invalid colour'));
		}
		$rated = $request['rated'] ?? true;
		if (!is_bool($rated)) {
			throw ApiException::invalidArgument('rated', $this->l->t('Invalid value'));
		}
		$timeControl = $request['timeControl'] ?? TimeControl::DEFAULT->value;
		if (!is_string($timeControl) || TimeControl::tryFrom($timeControl) === null) {
			throw ApiException::invalidArgument('timeControl', $this->l->t('Invalid time control'));
		}
		$message = $request['message'] ?? null;
		if ($message !== null && !is_string($message)) {
			throw ApiException::invalidArgument('message', $this->l->t('Invalid message'));
		}
		$message = $message === null
			? null
			: mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $message) ?? ''), 0, 200);
		$scopeGroup = $request['scopeGroup'] ?? null;
		if ($scopeGroup !== null && (!is_string($scopeGroup) || $opponent !== null || $scopeGroup === '')) {
			throw ApiException::invalidArgument('scopeGroup', $this->l->t('Invalid group'));
		}
		if ($rated && $timeControl === TimeControl::Unlimited->value) {
			throw new ApiException(ApiError::RatedNeedsDeadline, $this->l->t('Rated games need a time limit.'));
		}
		if ($rated && !$this->settings->ratedEnabled()) {
			throw new ApiException(
				ApiError::RatedNotAllowed,
				$this->l->t('Rated games are turned off on this server.'),
			);
		}
		if ($opponent === null) {
			if (!$this->settings->openChallengesEnabled()) {
				throw new ApiException(
					ApiError::OpenChallengesDisabled,
					$this->l->t('Open challenges are turned off on this server.'),
				);
			}
			if ($scopeGroup !== null && !$this->policy->isInGroup($uid, $scopeGroup)) {
				throw ApiException::invalidArgument('scopeGroup', $this->l->t('Invalid group'));
			}
		} else {
			$opponent = $this->policy->assertCanInvite($uid, $opponent);
		}
		$this->policy->assertWithinLimits($uid, $opponent);

		$now = $this->clock->now();
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
		$game->setExpiresAt($now + $days * GameClock::DAY);
		$game->setInviteMessage($message === '' ? null : $message);
		$game->setScopeGroup($scopeGroup);
		$game->setCreatedAt($now);
		$game->setUpdatedAt($now);
		$game = $this->repository->insert($game);
		if (!$isOpen) {
			$this->notifications->invite($game);
		}
		return $game;
	}

	/**
	 * The invited player accepts an invitation or a rematch offer, which starts the game.
	 *
	 * @throws ApiException
	 */
	public function accept(int $id, string $uid): Game {
		$game = $this->lifecycle->load($id, $uid);
		if ($game->getOpponentUid() !== $uid || $game->getStatus() !== Game::STATUS_PENDING) {
			throw $this->errors->invalidStatus();
		}
		$this->policy->assertActiveLimit($uid);
		return $this->transaction->run(function () use ($game): Game {
			$this->lifecycle->start($game, $this->clock->now());
			$this->repository->save($game);
			$this->transaction->afterCommit(function () use ($game): void {
				$this->notifications->inviteClosed($game);
				$this->notifications->inviteAccepted($game);
			});
			return $game;
		});
	}

	/**
	 * The invited player declines an invitation or a rematch offer.
	 *
	 * @throws ApiException
	 */
	public function decline(int $id, string $uid): Game {
		$game = $this->lifecycle->load($id, $uid);
		if ($game->getOpponentUid() !== $uid || $game->getStatus() !== Game::STATUS_PENDING) {
			throw $this->errors->invalidStatus();
		}
		return $this->transaction->run(function () use ($game): Game {
			$game->setStatus(Game::STATUS_DECLINED);
			$game->setFinishedAt($this->clock->now());
			$this->repository->save($game);
			$this->transaction->afterCommit(function () use ($game): void {
				$this->notifications->inviteClosed($game);
				$this->notifications->inviteDeclined($game);
			});
			return $game;
		});
	}

	/**
	 * The creator withdraws an invitation or an open challenge.
	 *
	 * @throws ApiException
	 */
	public function cancel(int $id, string $uid): Game {
		$game = $this->lifecycle->load($id, $uid);
		if ($game->getCreatorUid() !== $uid || !$game->isAwaitingOpponent()) {
			throw $this->errors->invalidStatus();
		}
		return $this->transaction->run(function () use ($game): Game {
			$game->setStatus(Game::STATUS_CANCELLED);
			$game->setFinishedAt($this->clock->now());
			$this->repository->save($game);
			$this->transaction->afterCommit(fn () => $this->notifications->inviteClosed($game));
			return $game;
		});
	}

	/**
	 * Another player joins an open challenge, which starts the game.
	 *
	 * @throws ApiException `already_taken` when another player joined first
	 */
	public function join(int $id, string $uid): Game {
		$game = $this->repository->find($id);
		if ($game === null) {
			throw $this->errors->notFound();
		}
		if ($game->getCreatorUid() === $uid) {
			if ($game->getStatus() === Game::STATUS_OPEN) {
				throw new ApiException(ApiError::OwnChallenge, $this->l->t('This is your own challenge.'));
			}
			throw $this->errors->invalidStatus();
		}
		if ($game->getStatus() !== Game::STATUS_OPEN) {
			// A taken challenge answers like any other game id, so game ids of other people cannot be probed.
			// `already_taken` is only the answer of the join that lost the race below.
			throw $this->errors->notFound();
		}
		if (!$this->policy->canSeeOpenChallenge($uid, $game)) {
			throw $this->errors->notFound();
		}
		$game = $this->lifecycle->resolveLazy($game);
		if ($game->getStatus() !== Game::STATUS_OPEN) {
			throw $this->errors->notFound();
		}
		$this->policy->assertActiveLimit($uid);
		try {
			return $this->transaction->run(function () use ($game, $uid): Game {
				$game->setOpponentUid($uid);
				$this->lifecycle->start($game, $this->clock->now());
				$this->repository->save($game);
				$this->transaction->afterCommit(fn () => $this->notifications->inviteAccepted($game, true));
				return $game;
			});
		} catch (GameConflictException) {
			throw new ApiException(ApiError::AlreadyTaken, $this->l->t('Someone was faster. The challenge is gone.'));
		}
	}

	/**
	 * Offers a rematch of an ended game, with swapped colours and the same settings.
	 *
	 * Asking again is idempotent: the player who asked first gets the pending offer, the other player accepts it, and
	 * a running rematch is returned as it is.
	 *
	 * @throws ApiException
	 */
	public function rematch(int $id, string $uid): Game {
		try {
			return $this->requestRematch($id, $uid);
		} catch (ApiException $e) {
			// A simultaneous request for the same game (a double click, or both players at once) won the race: answer
			// as if it had come first, so the requester gets the pending game and the other player accepts it.
			if (($e instanceof GameConflictException || $e->getError() === ApiError::TooManyInvitations)
				&& $this->repository->find($id)?->getRematchId() !== null) {
				return $this->requestRematch($id, $uid);
			}
			throw $e;
		}
	}

	/**
	 * @throws ApiException
	 */
	private function requestRematch(int $id, string $uid): Game {
		$old = $this->lifecycle->load($id, $uid);
		$color = $old->colorOf($uid);
		if ($color === null || !$old->hasEnded()) {
			throw $this->errors->invalidStatus();
		}
		$rematchId = $old->getRematchId();
		$existing = $rematchId === null ? null : $this->repository->find($rematchId);
		if ($existing !== null) {
			$existing = $this->lifecycle->resolveLazy($existing);
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
			throw new ApiException(ApiError::UserNotFound, $this->l->t('You can\'t invite this user'));
		}
		$this->policy->assertCanInvite($uid, $other);
		$this->policy->assertWithinLimits($uid, $other);
		$now = $this->clock->now();
		return $this->transaction->run(function () use ($old, $uid, $other, $color, $now): Game {
			$game = new Game();
			$game->setCreatorUid($uid);
			$game->setOpponentUid($other);
			$game->setColorChoice(Game::otherColor($color));
			$game->setStatus(Game::STATUS_PENDING);
			$game->setState($this->engine->serializeState($this->engine->initialState()));
			$game->setRev(1);
			$game->setRatedRequested($old->getRatedRequested());
			$game->setTimeControl($old->getTimeControl());
			$game->setExpiresAt($now + self::REMATCH_EXPIRY);
			$game->setRematchOf($old->getId());
			$game->setCreatedAt($now);
			$game->setUpdatedAt($now);
			$game = $this->repository->insert($game);
			$old->setRematchId($game->getId());
			$this->lifecycle->addSystemLine($old, 'rematch_offered', ['color' => $color]);
			$this->repository->save($old);
			$this->transaction->afterCommit(fn () => $this->notifications->invite($game));
			return $game;
		});
	}
}
