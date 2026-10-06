<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * Queries of the `qchess_seats` table.
 *
 * @template-extends QBMapper<Seat>
 */
class SeatMapper extends QBMapper {
	public const TABLE = 'qchess_seats';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, Seat::class);
	}

	/** @return list<Seat> the seats of a game, in seat order */
	public function findByGame(int $gameId): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->orderBy('seat', 'ASC');
		return $this->findEntities($qb);
	}

	/** @return list<int> the ids of the games in which `$uid` holds a seat */
	public function findGameIdsForUser(string $uid): array {
		$qb = $this->db->getQueryBuilder();
		$qb->selectDistinct('game_id')->from(self::TABLE)
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		$result = $qb->executeQuery();
		$ids = [];
		while (($row = $result->fetch()) !== false) {
			$ids[] = (int)$row['game_id'];
		}
		$result->closeCursor();
		return $ids;
	}

	/** Empties the seat of `$uid` when the account is deleted; the seat itself stays. */
	public function clearUser(int $gameId, string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->update(self::TABLE)->set('uid', $qb->createNamedParameter(null))
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->executeStatement();
	}

	public function deleteByGame(int $gameId): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->executeStatement();
	}
}
