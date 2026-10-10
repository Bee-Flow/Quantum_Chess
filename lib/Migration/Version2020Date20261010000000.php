<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Migration;

use Closure;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Bee Flow Chess is no longer offered. It was ruled by the server, which no longer knows it, so its games that have not
 * ended are closed: open invitations are cancelled and running games are aborted, unrated. Finished games, ratings and
 * leaderboard entries stay as they are.
 */
class Version2020Date20261010000000 extends SimpleMigrationStep {
	private const VARIANT = 'beeflow';

	public function __construct(
		private IDBConnection $db,
	) {
	}

	/**
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
		$now = time();

		$qb = $this->db->getQueryBuilder();
		$cancelled = $qb->update(GameMapper::TABLE)
			->set('status', $qb->createNamedParameter(Game::STATUS_CANCELLED))
			->set('expires_at', $qb->createNamedParameter(null))
			->set('finished_at', $qb->createNamedParameter($now))
			->set('updated_at', $qb->createNamedParameter($now))
			->where($qb->expr()->eq('variant', $qb->createNamedParameter(self::VARIANT)))
			->andWhere($qb->expr()->in('status', $qb->createNamedParameter(
				[Game::STATUS_PENDING, Game::STATUS_OPEN],
				IDBConnection::PARAM_STR_ARRAY,
			)))
			->executeStatement();

		$qb = $this->db->getQueryBuilder();
		$qb->update(GameMapper::TABLE)
			->set('unrated_reason', $qb->createNamedParameter('aborted'))
			->where($qb->expr()->eq('variant', $qb->createNamedParameter(self::VARIANT)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_ACTIVE)))
			->andWhere($qb->expr()->eq('rated_requested', $qb->createNamedParameter(1)))
			->executeStatement();

		$qb = $this->db->getQueryBuilder();
		$aborted = $qb->update(GameMapper::TABLE)
			->set('status', $qb->createNamedParameter(Game::STATUS_ABORTED))
			->set('result', $qb->createNamedParameter(null))
			->set('result_reason', $qb->createNamedParameter('aborted'))
			->set('rated', $qb->createNamedParameter(0))
			->set('finished_at', $qb->createNamedParameter($now))
			->set('deadline_at', $qb->createNamedParameter(null))
			->set('draw_offer', $qb->createNamedParameter(null))
			->set('draw_offer_ply', $qb->createNamedParameter(null))
			->set('updated_at', $qb->createNamedParameter($now))
			->where($qb->expr()->eq('variant', $qb->createNamedParameter(self::VARIANT)))
			->andWhere($qb->expr()->eq('status', $qb->createNamedParameter(Game::STATUS_ACTIVE)))
			->executeStatement();

		if ($cancelled + $aborted > 0) {
			$output->info(sprintf('Bee Flow Chess: %d invitations cancelled, %d games aborted', $cancelled, $aborted));
		}
	}
}
