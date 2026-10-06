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
 * Prepares online play for the chess variants (docs/development/online-variants.md): the variant columns of
 * `qchess_games`, and the tables `qchess_seats` (the players of a variant game, one row per seat) and `qchess_vmoves`
 * (its moves with the roll the server drew). Classic games leave the new columns at their defaults.
 */
class Version2000Date20261006000000 extends SimpleMigrationStep {
	/**
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		$schema = $schemaClosure();

		$games = $schema->getTable('qchess_games');
		if (!$games->hasColumn('variant')) {
			$games->addColumn('variant', Types::STRING, ['notnull' => false, 'length' => 32]);
			$games->addColumn('variant_options', Types::TEXT, ['notnull' => false]);
			$games->addColumn('variant_rules', Types::SMALLINT, ['notnull' => false]);
			$games->addColumn('variant_result', Types::STRING, ['notnull' => false, 'length' => 64]);
			$games->addColumn('seat_count', Types::SMALLINT, ['notnull' => true, 'default' => 2]);
			$games->addColumn('seat_to_move', Types::SMALLINT, ['notnull' => false]);
		}

		if (!$schema->hasTable('qchess_seats')) {
			$t = $schema->createTable('qchess_seats');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$t->addColumn('game_id', Types::BIGINT, ['notnull' => true, 'unsigned' => true]);
			$t->addColumn('seat', Types::SMALLINT, ['notnull' => true]);
			$t->addColumn('uid', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('team', Types::SMALLINT, ['notnull' => false]);
			foreach (['accepted_at', 'resigned_at', 'out_at'] as $col) {
				$t->addColumn($col, Types::BIGINT, ['notnull' => false]);
			}
			$t->addColumn('draw_vote', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('mute', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('last_seen_ply', Types::INTEGER, ['notnull' => false]);
			$t->setPrimaryKey(['id']);
			$t->addUniqueIndex(['game_id', 'seat'], 'qc_s_game_seat');
			$t->addIndex(['uid'], 'qc_s_uid');
		}

		if (!$schema->hasTable('qchess_vmoves')) {
			$t = $schema->createTable('qchess_vmoves');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$t->addColumn('game_id', Types::BIGINT, ['notnull' => true, 'unsigned' => true]);
			$t->addColumn('ply', Types::INTEGER, ['notnull' => true]);
			$t->addColumn('seat', Types::SMALLINT, ['notnull' => true]);
			$t->addColumn('uid', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('code', Types::STRING, ['notnull' => true, 'length' => 255]);
			$t->addColumn('u', Types::INTEGER, ['notnull' => true]);
			$t->addColumn('next_seat', Types::SMALLINT, ['notnull' => false]);
			$t->addColumn('result', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('state_hash', Types::STRING, ['notnull' => false, 'length' => 16]);
			$t->addColumn('settled_by', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('settled_at', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('chain', Types::STRING, ['notnull' => true, 'length' => 64]);
			$t->addColumn('client_id', Types::STRING, ['notnull' => false, 'length' => 36]);
			$t->addColumn('think_ms', Types::INTEGER, ['notnull' => false]);
			$t->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
			$t->setPrimaryKey(['id']);
			$t->addUniqueIndex(['game_id', 'ply'], 'qc_vm_game_ply');
			$t->addUniqueIndex(['game_id', 'client_id'], 'qc_vm_game_client');
			$t->addIndex(['uid'], 'qc_vm_uid');
		}

		return $schema;
	}
}
