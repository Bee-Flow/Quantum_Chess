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
 * Queries of the `qchess_games` table.
 *
 * @template-extends QBMapper<Game>
 */
class GameMapper extends QBMapper {
	public const TABLE = 'qchess_games';
	private const USER_COLUMNS = ['white_uid', 'black_uid', 'creator_uid', 'opponent_uid'];

	public function __construct(IDBConnection $db) {
		parent::__construct($db, self::TABLE, Game::class);
	}

	public function findById(int $id): ?Game {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException) {
			return null;
		}
	}

	/**
	 * Optimistic update: writes the changed fields only when the stored `rev` still equals `$expectedRev`.
	 */
	public function updateChecked(Game $game, int $expectedRev): bool {
		$fields = $game->getUpdatedFields();
		unset($fields['id']);
		if ($fields === []) {
			return true;
		}
		$qb = $this->db->getQueryBuilder();
		$qb->update(self::TABLE);
		foreach (array_keys($fields) as $property) {
			$getter = 'get' . ucfirst($property);
			$qb->set($game->propertyToColumn($property), $qb->createNamedParameter($game->$getter(), $this->getParameterTypeForProperty($game, $property)));
		}
		$qb->where($qb->expr()->eq('id', $qb->createNamedParameter($game->getId(), IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('rev', $qb->createNamedParameter($expectedRev, IQueryBuilder::PARAM_INT)));
		$updated = $qb->executeStatement() === 1;
		if ($updated) {
			$game->resetUpdatedFields();
		}
		return $updated;
	}

	private function userExpr(IQueryBuilder $qb, string $uid): \OCP\DB\QueryBuilder\ICompositeExpression {
		$param = $qb->createNamedParameter($uid);
		return $qb->expr()->orX(...array_map(fn (string $col) => $qb->expr()->eq($col, $param), self::USER_COLUMNS));
	}

	/**
	 * Games of `$uid` with one of `$statuses`.
	 *
	 * @param list<string> $statuses
	 * @return list<Game>
	 */
	public function findForUser(string $uid, array $statuses, int $limit = 200): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($this->userExpr($qb, $uid))
			->andWhere($qb->expr()->in('status', $qb->createNamedParameter($statuses, IQueryBuilder::PARAM_STR_ARRAY)))
			->orderBy('updated_at', 'DESC')->addOrderBy('id', 'DESC')
			->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/**
	 * The open challenges, newest first.
	 *
	 * @return list<Game>
	 */
	public function findOpen(int $limit = 100): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_OPEN)))
			->orderBy('created_at', 'DESC')->addOrderBy('id', 'DESC')
			->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/**
	 * Finished (or aborted) games of `$uid`, newest first, after the cursor.
	 *
	 * @param list<string> $statuses
	 * @return list<Game>
	 */
	public function history(string $uid, array $statuses, ?int $beforeFinished, ?int $beforeId, int $limit): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($this->userExpr($qb, $uid))
			->andWhere($qb->expr()->in('status', $qb->createNamedParameter($statuses, IQueryBuilder::PARAM_STR_ARRAY)));
		if ($beforeFinished !== null && $beforeId !== null) {
			$qb->andWhere($qb->expr()->orX(
				$qb->expr()->lt('finished_at', $qb->createNamedParameter($beforeFinished, IQueryBuilder::PARAM_INT)),
				$qb->expr()->andX(
					$qb->expr()->eq('finished_at', $qb->createNamedParameter($beforeFinished, IQueryBuilder::PARAM_INT)),
					$qb->expr()->lt('id', $qb->createNamedParameter($beforeId, IQueryBuilder::PARAM_INT)),
				),
			));
		}
		$qb->orderBy('finished_at', 'DESC')->addOrderBy('id', 'DESC')->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/**
	 * Games with one of `$statuses` whose `$column` (deadline_at, expires_at or finished_at) is at or before `$time`,
	 * the earliest first.
	 *
	 * @param list<string> $statuses
	 * @return list<Game>
	 */
	public function findDue(array $statuses, string $column, int $time, int $limit): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->in('status', $qb->createNamedParameter($statuses, IQueryBuilder::PARAM_STR_ARRAY)))
			->andWhere($qb->expr()->isNotNull($column))
			->andWhere($qb->expr()->lte($column, $qb->createNamedParameter($time, IQueryBuilder::PARAM_INT)))
			->orderBy($column, 'ASC')
			->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/** @return list<Game> final games that ended at or before `$cutoff` and still have chat rows */
	public function findChatToPurge(int $cutoff, int $limit): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->in('status', $qb->createNamedParameter(Game::FINAL_STATUSES, IQueryBuilder::PARAM_STR_ARRAY)))
			->andWhere($qb->expr()->lte('finished_at', $qb->createNamedParameter($cutoff, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->gt('chat_count', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
			->orderBy('finished_at', 'ASC')
			->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/**
	 * Active games without a time limit (`corr:none`) whose last activity is at or before `$cutoff`.
	 *
	 * @return list<Game>
	 */
	public function findAbandoned(int $cutoff, int $limit): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_ACTIVE)))
			->andWhere($qb->expr()->eq('time_control', $qb->createNamedParameter('corr:none')))
			->andWhere($qb->expr()->orX(
				$qb->expr()->lte('last_move_at', $qb->createNamedParameter($cutoff, IQueryBuilder::PARAM_INT)),
				$qb->expr()->andX(
					$qb->expr()->isNull('last_move_at'),
					$qb->expr()->lte('started_at', $qb->createNamedParameter($cutoff, IQueryBuilder::PARAM_INT)),
				),
			))
			->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/** @return list<Game> the user's finished rated games, newest first */
	public function findRatedFinished(string $uid, int $limit): array {
		$qb = $this->db->getQueryBuilder();
		$param = $qb->createNamedParameter($uid);
		$qb->select('*')->from(self::TABLE)
			->where($qb->expr()->orX($qb->expr()->eq('white_uid', $param), $qb->expr()->eq('black_uid', $param)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_FINISHED)))
			->andWhere($qb->expr()->eq('rated', $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT)))
			->orderBy('finished_at', 'DESC')->addOrderBy('id', 'DESC')
			->setMaxResults($limit);
		return $this->findEntities($qb);
	}

	/** The number of games with `$status` that `$uid` created. */
	public function countCreated(string $uid, string $status): int {
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))->from(self::TABLE)
			->where($qb->expr()->eq('creator_uid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter($status)));
		return $this->fetchCount($qb);
	}

	/** The number of pending invitations from `$from` to `$to`. */
	public function countPendingPair(string $from, string $to): int {
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))->from(self::TABLE)
			->where($qb->expr()->eq('creator_uid', $qb->createNamedParameter($from)))
			->andWhere($qb->expr()->eq('opponent_uid', $qb->createNamedParameter($to)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_PENDING)));
		return $this->fetchCount($qb);
	}

	/** The number of active games in which `$uid` plays. */
	public function countActive(string $uid): int {
		$qb = $this->db->getQueryBuilder();
		$param = $qb->createNamedParameter($uid);
		$qb->select($qb->func()->count('*', 'n'))->from(self::TABLE)
			->where($qb->expr()->orX($qb->expr()->eq('white_uid', $param), $qb->expr()->eq('black_uid', $param)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_ACTIVE)));
		return $this->fetchCount($qb);
	}

	/** True when the two users have an active or finished game together. */
	public function havePlayed(string $a, string $b): bool {
		$qb = $this->db->getQueryBuilder();
		$pa = $qb->createNamedParameter($a);
		$pb = $qb->createNamedParameter($b);
		$qb->select('id')->from(self::TABLE)
			->where($qb->expr()->orX(
				$qb->expr()->andX($qb->expr()->eq('white_uid', $pa), $qb->expr()->eq('black_uid', $pb)),
				$qb->expr()->andX($qb->expr()->eq('white_uid', $pb), $qb->expr()->eq('black_uid', $pa)),
			))
			->setMaxResults(1);
		$result = $qb->executeQuery();
		$row = $result->fetch();
		$result->closeCursor();
		return $row !== false;
	}

	/**
	 * Aggregate of a user's non-final games and of all open challenges; changes whenever the lobby may have changed.
	 *
	 * @return array{mine: string, open: string}
	 */
	public function lobbyFingerprint(string $uid): array {
		$live = [Game::STATUS_PENDING, Game::STATUS_OPEN, Game::STATUS_ACTIVE];
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))
			->selectAlias($qb->func()->sum('rev'), 's')
			->selectAlias($qb->func()->max('updated_at'), 'm')
			->from(self::TABLE)
			->where($this->userExpr($qb, $uid))
			->andWhere($qb->expr()->in('status', $qb->createNamedParameter($live, IQueryBuilder::PARAM_STR_ARRAY)));
		$mine = $this->fetchRow($qb);
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))
			->selectAlias($qb->func()->sum('rev'), 's')
			->selectAlias($qb->func()->max('updated_at'), 'm')
			->from(self::TABLE)
			->where($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_OPEN)));
		$open = $this->fetchRow($qb);
		return [
			'mine' => implode('-', array_map('strval', $mine)),
			'open' => implode('-', array_map('strval', $open)),
		];
	}

	/** Deletes a game with its moves and chat lines. */
	public function deleteWithChildren(int $gameId): void {
		foreach ([MoveMapper::TABLE, ChatMapper::TABLE] as $table) {
			$qb = $this->db->getQueryBuilder();
			$qb->delete($table)->where($qb->expr()->eq('game_id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))->executeStatement();
		}
		$qb = $this->db->getQueryBuilder();
		$qb->delete(self::TABLE)->where($qb->expr()->eq('id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))->executeStatement();
	}

	/**
	 * Removes `$uid` from a game when the account is deleted: every player column that holds `$uid` becomes NULL, and
	 * so does the invitation message when `$uid` wrote it (it is the creator's own words).
	 */
	public function clearUser(int $gameId, string $uid): void {
		$qb = $this->db->getQueryBuilder();
		$qb->update(self::TABLE)->set('invite_message', $qb->createNamedParameter(null))
			->where($qb->expr()->eq('id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('creator_uid', $qb->createNamedParameter($uid)))
			->executeStatement();
		foreach (self::USER_COLUMNS as $column) {
			$qb = $this->db->getQueryBuilder();
			$qb->update(self::TABLE)->set($column, $qb->createNamedParameter(null))
				->where($qb->expr()->eq('id', $qb->createNamedParameter($gameId, IQueryBuilder::PARAM_INT)))
				->andWhere($qb->expr()->eq($column, $qb->createNamedParameter($uid)))
				->executeStatement();
		}
	}

	/**
	 * The number of active games and of games finished since `$finishedSince` (Unix seconds).
	 *
	 * @return array{active: int, finishedToday: int}
	 */
	public function diagnostics(int $finishedSince): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))->from(self::TABLE)
			->where($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_ACTIVE)));
		$active = $this->fetchCount($qb);
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'n'))->from(self::TABLE)
			->where($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_FINISHED)))
			->andWhere($qb->expr()->gte('finished_at', $qb->createNamedParameter($finishedSince, IQueryBuilder::PARAM_INT)));
		return ['active' => $active, 'finishedToday' => $this->fetchCount($qb)];
	}

	private function fetchCount(IQueryBuilder $qb): int {
		$result = $qb->executeQuery();
		$n = (int)$result->fetchOne();
		$result->closeCursor();
		return $n;
	}

	/**
	 * The count, revision sum and latest update of a fingerprint query.
	 *
	 * @return list<int>
	 */
	private function fetchRow(IQueryBuilder $qb): array {
		$result = $qb->executeQuery();
		$row = $result->fetch();
		$result->closeCursor();
		return is_array($row) ? [(int)($row['n'] ?? 0), (int)($row['s'] ?? 0), (int)($row['m'] ?? 0)] : [0, 0, 0];
	}
}
