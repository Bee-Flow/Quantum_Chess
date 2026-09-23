<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Exception\ApiException;
use OCP\App\IAppManager;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Share\IManager as IShareManager;

/**
 * Who may invite whom and see which open challenges (docs/SPEC.md §8.2). Every failure answers the same
 * `404 user_not_found`, so nothing about accounts or policies leaks. The personal invite policy and block list are
 * deferred to 1.1 (docs/LEAN-1.0.md).
 */
class InvitePolicy {
	public const MAX_PENDING = 10;
	public const MAX_OPEN = 3;

	public function __construct(
		private IUserManager $userManager,
		private IGroupManager $groupManager,
		private IAppManager $appManager,
		private IShareManager $shareManager,
		private SettingsService $settings,
		private GameMapper $games,
		private IL10N $l,
	) {
	}

	public function isMultiplayerUser(string $uid): bool {
		$user = $this->userManager->get($uid);
		return $user !== null && $user->isEnabled() && $this->settings->isMultiplayerEnabledFor($uid);
	}

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

	/** Steps 3 and 4 of SPEC §8.2: the sharing group restriction and user enumeration. */
	public function canReach(IUser $from, IUser $to): bool {
		$shared = null;
		$sharedGroups = function () use (&$shared, $from, $to): array {
			if ($shared === null) {
				$shared = array_values(array_intersect($this->groupManager->getUserGroupIds($from), $this->groupManager->getUserGroupIds($to)));
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
	 * @throws ApiException 404 user_not_found
	 */
	public function assertCanInvite(string $from, string $to): string {
		$user = $this->canInvite($from, $to) ? $this->userManager->get($to) : null;
		if ($user === null) {
			throw new ApiException('user_not_found', $this->l->t('You can\'t invite this user'), 404);
		}
		return $user->getUID();
	}

	public function assertWithinLimits(string $from, ?string $to): void {
		if ($to === null) {
			if ($this->games->countCreated($from, Game::STATUS_OPEN) >= self::MAX_OPEN) {
				throw new ApiException('too_many_open', $this->l->t('You already have %d open challenges.', [self::MAX_OPEN]), 429);
			}
		} elseif ($this->games->countCreated($from, Game::STATUS_PENDING) >= self::MAX_PENDING
			|| $this->games->countPendingPair($from, $to) >= 1) {
			throw new ApiException('too_many_invitations', $this->l->t('You have too many open invitations.'), 429);
		}
		$this->assertActiveLimit($from);
	}

	public function assertActiveLimit(string $uid): void {
		if ($this->games->countActive($uid) >= $this->settings->maxActiveGames()) {
			throw new ApiException('too_many_active', $this->l->t('You have reached the maximum number of running games.'), 429);
		}
	}

	public function isInGroup(string $uid, string $gid): bool {
		return $this->groupManager->isInGroup($uid, $gid);
	}

	public function canSeeOpenChallenge(string $viewer, Game $game): bool {
		$creator = $game->getCreatorUid();
		if ($game->getStatus() !== Game::STATUS_OPEN || $creator === null || $creator === $viewer || !$this->isMultiplayerUser($viewer)) {
			return false;
		}
		$group = $game->getScopeGroup();
		if ($group !== null && $group !== '') {
			return $this->groupManager->isInGroup($viewer, $group);
		}
		return $this->canInvite($viewer, $creator);
	}
}
