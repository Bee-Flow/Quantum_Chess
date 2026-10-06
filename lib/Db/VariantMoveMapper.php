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
 * Queries of the `qchess_vmoves` table.
 *
 * @template-extends QBMapper<VariantMove>
 */
class VariantMoveMapper extends QBMapper {
	public const TABLE = 'qchess_vmoves';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, VariantMove::class);
	}

	/** @return list<VariantMove> moves with ply >= `$fromPly`, in ply order */
	public function findByGame(int $gameId, int $fromPly = 0): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->gte('ply', $qb->createNamedParameter($fromPly, IQueryBuilder::PARAM_INT)))
			->orderBy('ply', 'ASC');
		return $this->findEntities($qb);
	}

	public function findByPly(int $gameId, int $ply): ?VariantMove {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('ply', $qb->createNamedParameter($ply, IQueryBuilder::PARAM_INT)));
		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}

	public function findByClientId(int $gameId, string $clientId): ?VariantMove {
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

	/** Removes `$uid` from the moves of a game when the account is deleted; the moves themselves stay. */
	public function clearUser(int $gameId, string $uid): void {
		foreach (['uid', 'settled_by'] as $column) {
			$qb = $this->db->getQueryBuilder();
			$qb->update(self::TABLE)->set($column, $qb->createNamedParameter(null))
				->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
				->andWhere($qb->expr()->eq($column, $qb->createNamedParameter($uid)))
				->executeStatement();
		}
	}

	public function deleteByGame(int $gameId): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->executeStatement();
	}
}
