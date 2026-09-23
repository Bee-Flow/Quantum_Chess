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
 * @template-extends QBMapper<Move>
 */
class MoveMapper extends QBMapper {
	public const TABLE = 'qchess_moves';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, Move::class);
	}

	/** @return list<Move> moves with ply >= `$fromPly`, in ply order */
	public function findByGame(int $gameId, int $fromPly = 0): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->gte('ply', $qb->createNamedParameter($fromPly, IQueryBuilder::PARAM_INT)))
			->orderBy('ply', 'ASC');
		return $this->findEntities($qb);
	}

	public function findByClientId(int $gameId, string $clientId): ?Move {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('client_id', $qb->createNamedParameter($clientId)));
		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}

	public function findLast(int $gameId): ?Move {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->orderBy('ply', 'DESC')->setMaxResults(1);
		$list = $this->findEntities($qb);
		return $list[0] ?? null;
	}

	public function countByColor(int $gameId, string $color): int {
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('color', $qb->createNamedParameter($color)));
		$result = $qb->executeQuery();
		$n = (int)$result->fetchOne();
		$result->closeCursor();
		return $n;
	}

	public function clearUser(int $gameId, string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->update(self::TABLE)->set('uid', $qb->createNamedParameter(null))
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->executeStatement();
	}
}
