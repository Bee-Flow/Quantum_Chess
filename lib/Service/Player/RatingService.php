<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Player;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Rating;
use OCA\QuantumChess\Db\RatingMapper;
use OCP\AppFramework\Utility\ITimeFactory;

/**
 * Elo ratings and the online result counts of the players.
 *
 * Every player starts at 1200 and never drops below 100. The K-factor is 40 during the first ten rated games (the
 * rating is provisional) and 20 afterwards. Unrated games count in the results but not in the rating.
 */
class RatingService {
	public const START = 1200;
	public const FLOOR = 100;
	/** A rating is provisional during this many rated games. */
	public const PROVISIONAL_GAMES = 10;
	public const K_PROVISIONAL = 40;
	public const K = 20;

	public function __construct(
		private readonly RatingMapper $mapper,
		private readonly GameMapper $games,
		private readonly ITimeFactory $time,
	) {
	}

	/**
	 * The player's rating and results, or null before their first finished online game.
	 *
	 * @return array{
	 *     rating: int,
	 *     provisional: bool,
	 *     ratedGames: int,
	 *     peak: int,
	 *     games: int,
	 *     wins: int,
	 *     losses: int,
	 *     draws: int,
	 *     listed: ?bool,
	 *     lastRatedAt: ?int,
	 * }|null
	 */
	public function get(string $uid): ?array {
		$row = $this->mapper->findByUid($uid);
		return $row === null ? null : $this->toArray($row);
	}

	/**
	 * @return array{
	 *     rating: int,
	 *     provisional: bool,
	 *     ratedGames: int,
	 *     peak: int,
	 *     games: int,
	 *     wins: int,
	 *     losses: int,
	 *     draws: int,
	 *     listed: ?bool,
	 *     lastRatedAt: ?int,
	 * }
	 */
	public function toArray(Rating $row): array {
		return [
			'rating' => $row->getRating(),
			'provisional' => $row->getRatedGames() < self::PROVISIONAL_GAMES,
			'ratedGames' => $row->getRatedGames(),
			'peak' => $row->getPeak(),
			'games' => $row->getGames(),
			'wins' => $row->getWins(),
			'losses' => $row->getLosses(),
			'draws' => $row->getDraws(),
			'listed' => $row->getListed() === null ? null : $row->getListed() === 1,
			'lastRatedAt' => $row->getLastRatedAt(),
		];
	}

	/**
	 * The rating change of one side: K depends on the player's rated games before this game, and the change is rounded
	 * half away from zero.
	 *
	 * @param float $score 1 for a win, 0.5 for a draw, 0 for a loss
	 */
	public static function delta(int $rating, int $opponent, float $score, int $ratedGames): int {
		$expected = 1.0 / (1.0 + 10.0 ** ((float)($opponent - $rating) / 400.0));
		$k = (float)($ratedGames < self::PROVISIONAL_GAMES ? self::K_PROVISIONAL : self::K);
		$delta = (int)round($k * ($score - $expected));
		return max(self::FLOOR, $rating + $delta) - $rating;
	}

	/**
	 * The player's row, created with the start values when missing (a concurrent creation is tolerated). With
	 * `$lock` the row is locked first, so the values read are current until the transaction ends.
	 */
	private function row(string $uid, int $now, bool $lock = false): Rating {
		$row = $this->mapper->findByUid($uid);
		if ($row === null) {
			$this->mapper->insertIfMissing($uid, self::START, $now);
		}
		if ($lock) {
			$this->mapper->lock($uid);
		}
		if ($row === null || $lock) {
			$row = $this->mapper->findByUid($uid);
		}
		if ($row === null) {
			throw new \RuntimeException('The rating row of a player could not be created.');
		}
		return $row;
	}

	/**
	 * Records a finished game: the results of both players whose accounts still exist, and the Elo change when the
	 * game is rated. It runs inside the transaction that finishes the game and sets the game's rating fields; the
	 * caller saves the game.
	 */
	public function applyResult(Game $game): void {
		if ($game->getStatus() !== Game::STATUS_FINISHED) {
			return;
		}
		$now = $this->time->getTime();
		$white = $game->getWhiteUid();
		$black = $game->getBlackUid();
		$score = match ($game->getResult()) {
			'1-0' => 1.0,
			'0-1' => 0.0,
			default => 0.5,
		};
		/** @var array<string, Rating> $rows */
		$rows = [];
		$uids = array_values(array_filter([$white, $black], fn ($uid) => $uid !== null));
		// Both rows are locked in ascending uid order before they are read, and written in that order too, so two
		// games of one player that finish at the same time neither lose an update nor deadlock.
		sort($uids);
		foreach ($uids as $uid) {
			$rows[$uid] = $this->row($uid, $now, true);
		}
		$rated = $game->getRated() === 1 && $white !== null && $black !== null;
		$deltas = ['w' => 0, 'b' => 0];
		if ($rated) {
			$w = $rows[$white];
			$b = $rows[$black];
			$deltas = [
				'w' => self::delta($w->getRating(), $b->getRating(), $score, $w->getRatedGames()),
				'b' => self::delta($b->getRating(), $w->getRating(), 1.0 - $score, $b->getRatedGames()),
			];
			$game->setRatingWBefore($w->getRating());
			$game->setRatingBBefore($b->getRating());
			$game->setRatingWDelta($deltas['w']);
			$game->setRatingBDelta($deltas['b']);
		}
		foreach ($uids as $uid) {
			$color = $uid === $white ? 'w' : 'b';
			$row = $rows[$uid];
			$mine = $color === 'w' ? $score : 1.0 - $score;
			$row->setGames($row->getGames() + 1);
			if ($mine === 1.0) {
				$row->setWins($row->getWins() + 1);
			} elseif ($mine === 0.0) {
				$row->setLosses($row->getLosses() + 1);
			} else {
				$row->setDraws($row->getDraws() + 1);
			}
			if ($rated) {
				$row->setRating($row->getRating() + $deltas[$color]);
				$row->setPeak(max($row->getPeak(), $row->getRating()));
				$row->setRatedGames($row->getRatedGames() + 1);
				$row->setLastRatedAt($now);
			}
			$row->setUpdatedAt($now);
			$this->mapper->update($row);
		}
	}

	/**
	 * The player's rating after each of their last `$limit` rated games, oldest first.
	 *
	 * @return list<array{gameId: int, t: int, rating: int}>
	 */
	public function history(string $uid, int $limit = 100): array {
		$points = [];
		foreach ($this->games->findRatedFinished($uid, $limit) as $game) {
			$white = $game->getWhiteUid() === $uid;
			$before = $white ? $game->getRatingWBefore() : $game->getRatingBBefore();
			$delta = $white ? $game->getRatingWDelta() : $game->getRatingBDelta();
			if ($before !== null && $delta !== null) {
				$points[] = [
					'gameId' => $game->getId(),
					't' => (int)$game->getFinishedAt(),
					'rating' => $before + $delta,
				];
			}
		}
		return array_reverse($points);
	}

	/**
	 * The players who may appear on the leaderboard: at least `$minGames` rated games, the last one at or after
	 * `$activeSince`.
	 *
	 * @return list<array{
	 *     uid: string,
	 *     rating: int,
	 *     provisional: bool,
	 *     ratedGames: int,
	 *     wins: int,
	 *     losses: int,
	 *     draws: int,
	 *     listed: ?bool,
	 * }>
	 */
	public function leaderboardRows(int $minGames, int $activeSince): array {
		return array_map(fn (Rating $row) => [
			'uid' => $row->getUid(),
			'rating' => $row->getRating(),
			'provisional' => $row->getRatedGames() < self::PROVISIONAL_GAMES,
			'ratedGames' => $row->getRatedGames(),
			'wins' => $row->getWins(),
			'losses' => $row->getLosses(),
			'draws' => $row->getDraws(),
			'listed' => $row->getListed() === null ? null : $row->getListed() === 1,
		], $this->mapper->findEligible($minGames, $activeSince));
	}

	/** Stores the player's leaderboard choice; null follows the server's leaderboard mode. */
	public function setListed(string $uid, ?bool $listed): void {
		$row = $this->row($uid, $this->time->getTime());
		$row->setListed($listed === null ? null : ($listed ? 1 : 0));
		$row->setUpdatedAt($this->time->getTime());
		$this->mapper->update($row);
	}

	public function deleteUser(string $uid): void {
		$this->mapper->deleteByUid($uid);
	}
}
