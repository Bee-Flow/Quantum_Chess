<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * The Elo rating and the online result counts of one user.
 *
 * `listed` is the user's leaderboard choice: 1 (listed), 0 (not listed) or null (not decided, the admin's
 * leaderboard mode applies).
 *
 * @method string getUid()
 * @method void setUid(string $v)
 * @method int getRating()
 * @method void setRating(int $v)
 * @method int getPeak()
 * @method void setPeak(int $v)
 * @method int getRatedGames()
 * @method void setRatedGames(int $v)
 * @method int getGames()
 * @method void setGames(int $v)
 * @method int getWins()
 * @method void setWins(int $v)
 * @method int getLosses()
 * @method void setLosses(int $v)
 * @method int getDraws()
 * @method void setDraws(int $v)
 * @method int|null getListed()
 * @method void setListed(?int $v)
 * @method int|null getLastRatedAt()
 * @method void setLastRatedAt(?int $v)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $v)
 */
class Rating extends Entity {
	protected $uid = '';
	protected $rating = 1200;
	protected $peak = 1200;
	protected $ratedGames = 0;
	protected $games = 0;
	protected $wins = 0;
	protected $losses = 0;
	protected $draws = 0;
	protected $listed;
	protected $lastRatedAt;
	protected $updatedAt = 0;

	public function __construct() {
		foreach (['id', 'rating', 'peak', 'ratedGames', 'games', 'wins', 'losses', 'draws', 'listed', 'lastRatedAt', 'updatedAt'] as $field) {
			$this->addType($field, Types::INTEGER);
		}
	}
}
