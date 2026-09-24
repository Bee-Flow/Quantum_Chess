<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Game;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\App\IAppManager;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Share\IManager as IShareManager;

/**
 * Who may play online, invite whom and see which open challenges, and how many games a user may have open at once.
 *
 * Invitations follow the server's sharing rules: a user may invite whoever they could share with, or anyone they have
 * played before. Everyone who may play online can invite. Every refusal answers the same `404 user_not_found`, so
 * nothing about other accounts or their settings leaks.
 */
class InvitePolicy {
	/** The most invitations a user may have waiting for an answer. */
	public const MAX_PENDING = 10;
	/** The most open challenges a user may have at once. */
	public const MAX_OPEN = 3;

	public function __construct(
		private readonly IUserManager $userManager,
		private readonly IGroupManager $groupManager,
		private readonly IAppManager $appManager,
		private readonly IShareManager $shareManager,
		private readonly AppSettings $settings,
		private readonly GameMapper $games,
		private readonly IL10N $l,
	) {
	}

	/** Whether the user exists, is enabled and may play online. */
	public function isMultiplayerUser(string $uid): bool {
		$user = $this->userManager->get($uid);
		return $user !== null && $user->isEnabled() && $this->settings->isMultiplayerEnabledFor($uid);
	}

	/** Whether `$from` may invite `$to` (user ids match case-insensitively). */
	public function canInvite(string $from, string $to): bool {
		if ($from === $to || $to === '') {
			return false;
		}
		$fromUser = $this->userManager->get($from);
		$toUser = $this->userManager->get($to);
		if ($fromUser === null || $toUser === null || !$toUser->isEnabled() || !$fromUser->isEnabled()
			|| $fromUser->getUID() === $toUser->getUID()) {
			return false;
		}
		if (!$this->appManager->isEnabledForUser(Application::APP_ID, $toUser)
			|| !$this->settings->isMultiplayerEnabledFor($from) || !$this->settings->isMultiplayerEnabledFor($to)) {
			return false;
		}
		return $this->canReach($fromUser, $toUser);
	}

	/**
	 * Whether `$from` may reach `$to` under the server's sharing settings.
	 *
	 * When sharing is restricted to group members, the two must share a group that is not excluded from the
	 * restriction. Then user enumeration decides, possibly limited to shared groups or to full matches. Two users who
	 * cannot find each other that way may still reach each other when they have played before.
	 */
	public function canReach(IUser $from, IUser $to): bool {
		$shared = null;
		$sharedGroups = function () use (&$shared, $from, $to): array {
			if ($shared === null) {
				$shared = array_values(array_intersect(
					$this->groupManager->getUserGroupIds($from),
					$this->groupManager->getUserGroupIds($to),
				));
			}
			return $shared;
		};
		if ($this->shareManager->shareWithGroupMembersOnly()) {
			$excluded = $this->shareManager->shareWithGroupMembersOnlyExcludeGroupsList();
			// Nextcloud 32 only documents the array return type, Nextcloud 33+ declares it natively.
			/** @psalm-suppress RedundantCondition, TypeDoesNotContainType */
			if (array_diff($sharedGroups(), is_array($excluded) ? $excluded : []) === []) {
				return false;
			}
		}
		if ($this->shareManager->allowEnumeration()) {
			if (!$this->shareManager->limitEnumerationToGroups() || $sharedGroups() !== []) {
				return true;
			}
		}
		if ($this->shareManager->allowEnumerationFullMatch()) {
			return true;
		}
		return $this->games->havePlayed($from->getUID(), $to->getUID());
	}

	/**
	 * @return string the invitee's canonical user id (user ids match case-insensitively, stored ids must be exact)
	 * @throws ApiException user_not_found
	 */
	public function assertCanInvite(string $from, string $to): string {
		$user = $this->canInvite($from, $to) ? $this->userManager->get($to) : null;
		if ($user === null) {
			throw new ApiException(ApiError::UserNotFound, $this->l->t('You can\'t invite this user'));
		}
		return $user->getUID();
	}

	/**
	 * Checks the limits for a new invitation to `$to`, or a new open challenge when `$to` is null.
	 *
	 * @throws ApiException too_many_open, too_many_invitations or too_many_active
	 */
	public function assertWithinLimits(string $from, ?string $to): void {
		if ($to === null) {
			if ($this->games->countCreated($from, Game::STATUS_OPEN) >= self::MAX_OPEN) {
				throw new ApiException(
					ApiError::TooManyOpen,
					$this->l->t('You already have %d open challenges.', [self::MAX_OPEN]),
				);
			}
		} elseif ($this->games->countCreated($from, Game::STATUS_PENDING) >= self::MAX_PENDING
			|| $this->games->countPendingPair($from, $to) >= 1) {
			throw new ApiException(ApiError::TooManyInvitations, $this->l->t('You have too many open invitations.'));
		}
		$this->assertActiveLimit($from);
	}

	/**
	 * Checks that the user may start another game.
	 *
	 * @throws ApiException too_many_active
	 */
	public function assertActiveLimit(string $uid): void {
		if ($this->games->countActive($uid) >= $this->settings->maxActiveGames()) {
			throw new ApiException(
				ApiError::TooManyActive,
				$this->l->t('You have reached the maximum number of running games.'),
			);
		}
	}

	public function isInGroup(string $uid, string $gid): bool {
		return $this->groupManager->isInGroup($uid, $gid);
	}

	/**
	 * Whether `$viewer` may see and join an open challenge: one restricted to a group is visible to its members, any
	 * other one to everyone the creator could invite.
	 */
	public function canSeeOpenChallenge(string $viewer, Game $game): bool {
		$creator = $game->getCreatorUid();
		if ($game->getStatus() !== Game::STATUS_OPEN || $creator === null || $creator === $viewer
			|| !$this->isMultiplayerUser($viewer)) {
			return false;
		}
		$group = $game->getScopeGroup();
		if ($group !== null && $group !== '') {
			return $this->groupManager->isInGroup($viewer, $group);
		}
		return $this->canInvite($viewer, $creator);
	}
}
