<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Rating;
use OCA\QuantumChess\Db\RatingMapper;
use OCP\AppFramework\Utility\ITimeFactory;

/**
 * Elo ratings and online result counts (docs/SPEC.md §8.6). The pair cap is deferred to 1.1 (docs/LEAN-1.0.md).
 */
class RatingService {
	public const START = 1200;
	public const FLOOR = 100;
	public const PROVISIONAL_GAMES = 10;
	public const K_PROVISIONAL = 40;
	public const K = 20;

	public function __construct(
		private RatingMapper $mapper,
		private GameMapper $games,
		private ITimeFactory $time,
	) {
	}

	/** @return array{rating: int, provisional: bool, ratedGames: int, peak: int, games: int, wins: int, losses: int, draws: int, listed: ?bool, lastRatedAt: ?int}|null */
	public function get(string $uid): ?array {
		$row = $this->mapper->findByUid($uid);
		return $row === null ? null : $this->toArray($row);
	}

	/** @return array{rating: int, provisional: bool, ratedGames: int, peak: int, games: int, wins: int, losses: int, draws: int, listed: ?bool, lastRatedAt: ?int} */
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
	 * Rating change of one side: K by the player's rated games before this game, rounded half away from zero.
	 */
	public static function delta(int $rating, int $opponent, float $score, int $ratedGames): int {
		$expected = 1.0 / (1.0 + 10.0 ** ((float)($opponent - $rating) / 400.0));
		$k = (float)($ratedGames < self::PROVISIONAL_GAMES ? self::K_PROVISIONAL : self::K);
		$delta = (int)round($k * ($score - $expected));
		return max(self::FLOOR, $rating + $delta) - $rating;
	}

	private function row(string $uid, int $now): Rating {
		$row = $this->mapper->findByUid($uid);
		if ($row === null) {
			$row = new Rating();
			$row->setUid($uid);
			$row->setRating(self::START);
			$row->setPeak(self::START);
			$row->setUpdatedAt($now);
			$row = $this->mapper->insert($row);
		}
		return $row;
	}

	/**
	 * Records a finished game: counts for both existing players, Elo when the game is rated. Runs inside the
	 * finishing transaction; sets the game's rating snapshot fields (the caller saves the game).
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
		sort($uids);
		foreach ($uids as $uid) {
			$rows[$uid] = $this->row($uid, $now);
		}
		$rated = $game->getRated() === 1 && $white !== null && $black !== null;
		$deltas = [];
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
		foreach (['w' => $white, 'b' => $black] as $color => $uid) {
			if ($uid === null) {
				continue;
			}
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

	/** @return list<array{gameId: int, t: int, rating: int}> rating after each rated game, oldest first */
	public function history(string $uid, int $limit = 100): array {
		$points = [];
		foreach ($this->games->findRatedFinished($uid, $limit) as $game) {
			$white = $game->getWhiteUid() === $uid;
			$before = $white ? $game->getRatingWBefore() : $game->getRatingBBefore();
			$delta = $white ? $game->getRatingWDelta() : $game->getRatingBDelta();
			if ($before !== null && $delta !== null) {
				$points[] = ['gameId' => $game->getId(), 't' => (int)$game->getFinishedAt(), 'rating' => $before + $delta];
			}
		}
		return array_reverse($points);
	}

	/**
	 * @return list<array{uid: string, rating: int, provisional: bool, ratedGames: int, wins: int, losses: int, draws: int, listed: ?bool}>
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
