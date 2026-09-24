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
 * Queries of the `qchess_chat` table.
 *
 * @template-extends QBMapper<ChatMessage>
 */
class ChatMapper extends QBMapper {
	public const TABLE = 'qchess_chat';

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, ChatMessage::class);
	}

	/** @return list<ChatMessage> messages with id > `$afterId`, oldest first, at most the last `$limit` */
	public function findByGame(int $gameId, int $afterId = 0, int $limit = 200): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->gt('id', $qb->createNamedParameter($afterId, IQueryBuilder::PARAM_INT)))
			->orderBy('id', 'DESC')->setMaxResults($limit);
		return array_reverse($this->findEntities($qb));
	}

	public function deleteByGame(int $gameId): int {
		$qb = $this->db->getQueryBuilder();
		return $qb->delete(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->executeStatement();
	}

	/** Deletes the user's own text and phrase lines of a game; system lines stay. */
	public function deleteOwn(int $gameId, string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)
			->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->neq(
				'kind',
				$qb->createNamedParameter(ChatMessage::KIND_SYSTEM, IQueryBuilder::PARAM_INT),
			))
			->executeStatement();
	}
}
