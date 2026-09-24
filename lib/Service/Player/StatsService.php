<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Player;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\InvitePolicy;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUserManager;

/**
 * A user's statistics (online rating and results, the results of local games, the rating history) and the
 * leaderboard.
 *
 * The leaderboard follows the administrator's mode: `off`, `opt-in` (players who chose to be listed) or `opt-out`
 * (everyone who did not decline). It shows only players the viewer could invite.
 */
class StatsService {
	/** The user config key of the local game statistics. */
	public const LOCAL_KEY = 'local_stats';
	/** After this many rated games, a player who has not chosen yet is asked whether to be listed. */
	public const ASK_LISTING_AFTER = 5;

	public function __construct(
		private readonly RatingService $ratings,
		private readonly AppSettings $settings,
		private readonly InvitePolicy $policy,
		private readonly IUserManager $userManager,
		private readonly IGroupManager $groupManager,
		private readonly UserDocumentStore $documents,
		private readonly ITimeFactory $time,
		private readonly IL10N $l,
	) {
	}

	/**
	 * The user's statistics page: online results with the leaderboard rank, local results and the rating history.
	 *
	 * @return array<string, mixed>
	 */
	public function mine(string $uid): array {
		$row = $this->ratings->get($uid) ?? [
			'rating' => RatingService::START, 'provisional' => true, 'ratedGames' => 0, 'peak' => RatingService::START,
			'games' => 0, 'wins' => 0, 'losses' => 0, 'draws' => 0, 'listed' => null, 'lastRatedAt' => null,
		];
		$mode = $this->settings->leaderboardMode();
		$rank = null;
		if ($mode !== 'off' && $row['ratedGames'] > 0) {
			$rank = $this->leaderboard($uid, null)['me']['rank'] ?? null;
		}
		$online = $row;
		unset($online['lastRatedAt']);
		$online['rank'] = $rank;
		$online['askListing'] = $mode !== 'off' && $row['listed'] === null
			&& $row['ratedGames'] >= self::ASK_LISTING_AFTER;
		return [
			'online' => $online,
			'local' => $this->localStats($uid),
			'ratingHistory' => $this->ratings->history($uid),
		];
	}

	private function isListed(?bool $listed, string $mode): bool {
		return $mode === 'opt-out' ? $listed !== false : $listed === true;
	}

	/**
	 * The leaderboard as `$viewer` sees it, optionally for one of the viewer's groups, with the viewer's own entry.
	 *
	 * @return array<string, mixed>
	 * @throws ApiException invalid_argument for a group the viewer is not in
	 */
	public function leaderboard(string $viewer, ?string $group): array {
		$mode = $this->settings->leaderboardMode();
		$minGames = $this->settings->leaderboardMinGames();
		$viewerUser = $this->userManager->get($viewer);
		$groups = [];
		if ($viewerUser !== null) {
			foreach ($this->groupManager->getUserGroups($viewerUser) as $g) {
				$groups[] = ['id' => $g->getGID(), 'displayName' => $g->getDisplayName()];
			}
		}
		$result = ['mode' => $mode, 'minGames' => $minGames, 'entries' => [], 'me' => null, 'groups' => $groups];
		if ($mode === 'off' || $viewerUser === null) {
			return $result;
		}
		if ($group !== null && $group !== '' && !in_array($group, array_column($groups, 'id'), true)) {
			throw ApiException::invalidArgument('group', $this->l->t('Unknown group'));
		}
		$restrict = $this->settings->leaderboardGroups();
		$activeSince = $this->time->getTime() - $this->settings->leaderboardActiveDays() * GameClock::DAY;
		$entries = [];
		foreach ($this->ratings->leaderboardRows($minGames, $activeSince) as $row) {
			if (!$this->isListed($row['listed'], $mode)) {
				continue;
			}
			$user = $this->userManager->get($row['uid']);
			if ($user === null || !$user->isEnabled()) {
				continue;
			}
			if ($restrict !== [] && array_intersect($restrict, $this->groupManager->getUserGroupIds($user)) === []) {
				continue;
			}
			if ($group !== null && $group !== '' && !$this->groupManager->isInGroup($row['uid'], $group)) {
				continue;
			}
			if ($row['uid'] !== $viewer && !$this->policy->canReach($viewerUser, $user)) {
				continue;
			}
			$entries[] = [
				'userId' => $row['uid'],
				'displayName' => $user->getDisplayName(),
				'rating' => $row['rating'],
				'provisional' => $row['provisional'],
				'ratedGames' => $row['ratedGames'],
				'wins' => $row['wins'],
				'losses' => $row['losses'],
				'draws' => $row['draws'],
			];
		}
		usort(
			$entries,
			fn (array $a, array $b) => [$b['rating'], $b['ratedGames'], $a['displayName']]
				<=> [$a['rating'], $a['ratedGames'], $b['displayName']],
		);
		$myRank = null;
		foreach ($entries as $i => $entry) {
			$entries[$i] = ['rank' => $i + 1] + $entry;
			if ($entry['userId'] === $viewer) {
				$myRank = $i + 1;
			}
		}
		$result['entries'] = $entries;
		$mine = $this->ratings->get($viewer);
		if ($mine !== null && $mine['ratedGames'] > 0) {
			$result['me'] = [
				'rank' => $myRank,
				'userId' => $viewer,
				'displayName' => $viewerUser->getDisplayName(),
				'rating' => $mine['rating'],
				'provisional' => $mine['provisional'],
				'ratedGames' => $mine['ratedGames'],
				'wins' => $mine['wins'],
				'losses' => $mine['losses'],
				'draws' => $mine['draws'],
				'listed' => $this->isListed($mine['listed'], $mode),
			];
		}
		return $result;
	}

	/**
	 * The results of local games: against the computer player per level, against each LLM opponent, and the number
	 * of pass-and-play games.
	 *
	 * @return array{
	 *     engine: array<array-key, array{w: int, l: int, d: int}>,
	 *     llm: array<array-key, array{w: int, l: int, d: int}>,
	 *     hotseat: array{games: int},
	 * }
	 */
	public function localStats(string $uid): array {
		$stored = $this->documents->get($uid, self::LOCAL_KEY);
		$wld = fn (mixed $v): array => [
			'w' => (int)(is_array($v) ? ($v['w'] ?? 0) : 0),
			'l' => (int)(is_array($v) ? ($v['l'] ?? 0) : 0),
			'd' => (int)(is_array($v) ? ($v['d'] ?? 0) : 0),
		];
		$engine = [];
		for ($level = 1; $level <= 5; $level++) {
			$engine[(string)$level] = $wld($stored['engine'][(string)$level] ?? null);
		}
		$llm = [];
		foreach (is_array($stored['llm'] ?? null) ? $stored['llm'] : [] as $persona => $v) {
			$llm[(string)$persona] = $wld($v);
		}
		return ['engine' => $engine, 'llm' => $llm, 'hotseat' => ['games' => (int)($stored['hotseat']['games'] ?? 0)]];
	}

	/**
	 * Records the result of a local game.
	 *
	 * @param array<string, mixed> $payload `opponent` (engine, llm or hotseat), `level` (1 to 5, against the computer
	 *                                      player), `persona` (against an LLM opponent), `result` and `color`
	 * @return array<string, mixed> the new local statistics
	 * @throws ApiException invalid_argument
	 */
	public function recordLocal(string $uid, array $payload): array {
		$opponent = $payload['opponent'] ?? null;
		$result = $payload['result'] ?? null;
		$invalid = fn (string $field) => ApiException::invalidArgument($field, $this->l->t('Invalid value'));
		if (!in_array($opponent, ['engine', 'llm', 'hotseat'], true)) {
			throw $invalid('opponent');
		}
		if (!in_array($result, ['win', 'loss', 'draw'], true)) {
			throw $invalid('result');
		}
		$color = $payload['color'] ?? null;
		if ($color !== null && !in_array($color, ['w', 'b'], true)) {
			throw $invalid('color');
		}
		$stats = $this->localStats($uid);
		$bucket = ['win' => 'w', 'loss' => 'l', 'draw' => 'd'][$result];
		if ($opponent === 'engine') {
			$level = $payload['level'] ?? null;
			if (!is_int($level) || $level < 1 || $level > 5) {
				throw $invalid('level');
			}
			$stats['engine'][$level][$bucket]++;
		} elseif ($opponent === 'llm') {
			$persona = $payload['persona'] ?? null;
			if (!is_string($persona) || !preg_match('/^[a-z0-9_-]{1,32}$/', $persona)) {
				throw $invalid('persona');
			}
			$stats['llm'][$persona] ??= ['w' => 0, 'l' => 0, 'd' => 0];
			$stats['llm'][$persona][$bucket]++;
		} else {
			$stats['hotseat']['games']++;
		}
		$this->documents->set($uid, self::LOCAL_KEY, $stats);
		return $stats;
	}
}
