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
 * The ratings per player and chess variant (`qchess_vratings`), with the same locking as RatingMapper.
 *
 * @template-extends QBMapper<VariantRating>
 */
class VariantRatingMapper extends QBMapper {
	public const TABLE = 'qchess_vratings';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, VariantRating::class);
	}

	public function find(string $uid, string $variant): ?VariantRating {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->eq('variant', $qb->createNamedParameter($variant)));
		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}

	/** @return list<VariantRating> the user's rows, most rated games first */
	public function findByUid(string $uid): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->orderBy('rated_games', 'DESC')->addOrderBy('games', 'DESC')->addOrderBy('variant', 'ASC');
		return $this->findEntities($qb);
	}

	/** @return list<VariantRating> players of `$variant` with at least `$minGames` rated games since `$activeSince` */
	public function findEligible(string $variant, int $minGames, int $activeSince): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('variant', $qb->createNamedParameter($variant)))
			->andWhere($qb->expr()->gte(
				'rated_games',
				$qb->createNamedParameter($minGames, IQueryBuilder::PARAM_INT),
			))
			->andWhere($qb->expr()->gte(
				'last_rated_at',
				$qb->createNamedParameter($activeSince, IQueryBuilder::PARAM_INT),
			))
			->orderBy('rating', 'DESC')->addOrderBy('rated_games', 'DESC')
			->setMaxResults(1000);
		return $this->findEntities($qb);
	}

	/** Create the row with the start values unless it exists (a concurrent insert is not an error). */
	public function insertIfMissing(string $uid, string $variant, int $start, int $now): void {
		$this->db->insertIgnoreConflict(self::TABLE, [
			'uid' => $uid,
			'variant' => $variant,
			'rating' => $start,
			'peak' => $start,
			'updated_at' => $now,
		]);
	}

	/** Lock the row until the end of the transaction (an UPDATE that changes nothing). */
	public function lock(string $uid, string $variant): void {
		$qb = $this->db->getQueryBuilder();
		$qb->update(self::TABLE)->set('updated_at', 'updated_at')
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->eq('variant', $qb->createNamedParameter($variant)))
			->executeStatement();
	}

	public function deleteByUid(string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))->executeStatement();
	}
}
