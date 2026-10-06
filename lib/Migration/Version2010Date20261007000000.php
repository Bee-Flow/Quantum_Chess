<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Ratings per chess variant (docs/development/online-variants.md, phase 5): `qchess_vratings` keeps a rating and the
 * result counts per player and variant, next to the classic ones in `qchess_ratings` (which also keeps the player's
 * leaderboard choice for every board).
 */
class Version2010Date20261007000000 extends SimpleMigrationStep {
	/**
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		$schema = $schemaClosure();

		if (!$schema->hasTable('qchess_vratings')) {
			$t = $schema->createTable('qchess_vratings');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$t->addColumn('uid', Types::STRING, ['notnull' => true, 'length' => 64]);
			$t->addColumn('variant', Types::STRING, ['notnull' => true, 'length' => 32]);
			$t->addColumn('rating', Types::INTEGER, ['notnull' => true, 'default' => 1200]);
			$t->addColumn('peak', Types::INTEGER, ['notnull' => true, 'default' => 1200]);
			foreach (['rated_games', 'games', 'wins', 'losses', 'draws'] as $col) {
				$t->addColumn($col, Types::INTEGER, ['notnull' => true, 'default' => 0]);
			}
			$t->addColumn('last_rated_at', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
			$t->setPrimaryKey(['id']);
			$t->addUniqueIndex(['uid', 'variant'], 'qc_vr_uid_variant');
			$t->addIndex(['variant', 'rating'], 'qc_vr_variant_rating');
		}

		return $schema;
	}
}
