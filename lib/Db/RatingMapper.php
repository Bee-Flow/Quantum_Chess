<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * Queries of the `qchess_ratings` table.
 *
 * @template-extends QBMapper<Rating>
 */
class RatingMapper extends QBMapper {
	public const TABLE = 'qchess_ratings';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, Rating::class);
	}

	public function findByUid(string $uid): ?Rating {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}

	/** @return list<Rating> players with at least `$minGames` rated games, rated at or after `$activeSince` */
	public function findEligible(int $minGames, int $activeSince): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->gte('rated_games', $qb->createNamedParameter($minGames, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->gte('last_rated_at', $qb->createNamedParameter($activeSince, IQueryBuilder::PARAM_INT)))
			->orderBy('rating', 'DESC')->addOrderBy('rated_games', 'DESC')
			->setMaxResults(1000);
		return $this->findEntities($qb);
	}

	/**
	 * Create the player's row with the start values unless it exists. A concurrent insert of the same row is not an
	 * error (INSERT … ON CONFLICT DO NOTHING / INSERT IGNORE), so it never aborts the caller's transaction.
	 */
	public function insertIfMissing(string $uid, int $start, int $now): void {
		$this->db->insertIgnoreConflict(self::TABLE, ['uid' => $uid, 'rating' => $start, 'peak' => $start, 'updated_at' => $now]);
	}

	/**
	 * Lock the player's row until the end of the transaction (an UPDATE that changes nothing), so that a read after it
	 * sees the latest committed values and no other transaction can change them in between.
	 */
	public function lock(string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->update(self::TABLE)->set('updated_at', 'updated_at')
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->executeStatement();
	}

	public function deleteByUid(string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))->executeStatement();
	}
}
