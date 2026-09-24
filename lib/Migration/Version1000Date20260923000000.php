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
 * Creates the app's tables: `qchess_games`, `qchess_moves`, `qchess_chat` and `qchess_ratings`.
 *
 * Some columns of `qchess_games` are reserved and not used yet; the Game entity lists them.
 */
class Version1000Date20260923000000 extends SimpleMigrationStep {
	/**
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		$schema = $schemaClosure();

		if (!$schema->hasTable('qchess_games')) {
			$t = $schema->createTable('qchess_games');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			foreach (['creator_uid', 'opponent_uid', 'white_uid', 'black_uid'] as $col) {
				$t->addColumn($col, Types::STRING, ['notnull' => false, 'length' => 64]);
			}
			$t->addColumn('color_choice', Types::STRING, ['notnull' => true, 'length' => 1, 'default' => 'r']);
			$t->addColumn('status', Types::STRING, ['notnull' => true, 'length' => 16, 'default' => 'pending']);
			$t->addColumn('result', Types::STRING, ['notnull' => false, 'length' => 8]);
			$t->addColumn('result_reason', Types::STRING, ['notnull' => false, 'length' => 32]);
			$t->addColumn('state', Types::TEXT, ['notnull' => true]);
			$t->addColumn('start_state', Types::TEXT, ['notnull' => false]);
			$t->addColumn('ply', Types::INTEGER, ['notnull' => true, 'default' => 0]);
			$t->addColumn('turn', Types::STRING, ['notnull' => true, 'length' => 1, 'default' => 'w']);
			$t->addColumn('rev', Types::INTEGER, ['notnull' => true, 'default' => 0]);
			$t->addColumn('rated_requested', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('rated', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('unrated_reason', Types::STRING, ['notnull' => false, 'length' => 16]);
			$t->addColumn('time_control', Types::STRING, ['notnull' => true, 'length' => 16, 'default' => 'corr:3d']);
			$t->addColumn('deadline_at', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('expires_at', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('reminders', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('ext_days', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('invite_message', Types::STRING, ['notnull' => false, 'length' => 200]);
			$t->addColumn('scope_group', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('draw_offer', Types::STRING, ['notnull' => false, 'length' => 1]);
			foreach (['draw_offer_ply', 'last_draw_w', 'last_draw_b', 'rating_w_before', 'rating_b_before'] as $col) {
				$t->addColumn($col, Types::INTEGER, ['notnull' => false]);
			}
			$t->addColumn('rating_w_delta', Types::SMALLINT, ['notnull' => false]);
			$t->addColumn('rating_b_delta', Types::SMALLINT, ['notnull' => false]);
			$t->addColumn('rematch_of', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('rematch_id', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('chain', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('chat_count', Types::INTEGER, ['notnull' => true, 'default' => 0]);
			$t->addColumn('mute_w', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('mute_b', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('visibility', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
			$t->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
			foreach (['started_at', 'last_move_at', 'finished_at'] as $col) {
				$t->addColumn($col, Types::BIGINT, ['notnull' => false]);
			}
			$t->setPrimaryKey(['id']);
			$t->addIndex(['white_uid', 'status'], 'qc_g_white_status');
			$t->addIndex(['black_uid', 'status'], 'qc_g_black_status');
			$t->addIndex(['creator_uid', 'status'], 'qc_g_creator_status');
			$t->addIndex(['opponent_uid', 'status'], 'qc_g_opp_status');
			$t->addIndex(['status', 'deadline_at'], 'qc_g_status_deadline');
			$t->addIndex(['status', 'expires_at'], 'qc_g_status_expires');
			$t->addIndex(['status', 'finished_at'], 'qc_g_status_finished');
		}

		if (!$schema->hasTable('qchess_moves')) {
			$t = $schema->createTable('qchess_moves');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$t->addColumn('game_id', Types::BIGINT, ['notnull' => true, 'unsigned' => true]);
			$t->addColumn('ply', Types::INTEGER, ['notnull' => true]);
			$t->addColumn('color', Types::STRING, ['notnull' => true, 'length' => 1]);
			$t->addColumn('uid', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('code', Types::STRING, ['notnull' => true, 'length' => 16]);
			$t->addColumn('notation', Types::STRING, ['notnull' => true, 'length' => 64]);
			$t->addColumn('measurement', Types::TEXT, ['notnull' => false]);
			$t->addColumn('chain', Types::STRING, ['notnull' => true, 'length' => 64]);
			$t->addColumn('state_hash', Types::STRING, ['notnull' => true, 'length' => 16]);
			$t->addColumn('support_key', Types::STRING, ['notnull' => true, 'length' => 66]);
			$t->addColumn('client_id', Types::STRING, ['notnull' => false, 'length' => 36]);
			$t->addColumn('think_ms', Types::INTEGER, ['notnull' => false]);
			$t->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
			$t->setPrimaryKey(['id']);
			$t->addUniqueIndex(['game_id', 'ply'], 'qc_m_game_ply');
			$t->addUniqueIndex(['game_id', 'client_id'], 'qc_m_game_client');
			$t->addIndex(['uid'], 'qc_m_uid');
		}

		if (!$schema->hasTable('qchess_chat')) {
			$t = $schema->createTable('qchess_chat');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$t->addColumn('game_id', Types::BIGINT, ['notnull' => true, 'unsigned' => true]);
			$t->addColumn('uid', Types::STRING, ['notnull' => false, 'length' => 64]);
			$t->addColumn('kind', Types::SMALLINT, ['notnull' => true, 'default' => 0]);
			$t->addColumn('message', Types::STRING, ['notnull' => true, 'length' => 1000]);
			$t->addColumn('params', Types::STRING, ['notnull' => false, 'length' => 255]);
			$t->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
			$t->setPrimaryKey(['id']);
			$t->addIndex(['game_id', 'id'], 'qc_c_game');
			$t->addIndex(['uid'], 'qc_c_uid');
		}

		if (!$schema->hasTable('qchess_ratings')) {
			$t = $schema->createTable('qchess_ratings');
			$t->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$t->addColumn('uid', Types::STRING, ['notnull' => true, 'length' => 64]);
			$t->addColumn('rating', Types::INTEGER, ['notnull' => true, 'default' => 1200]);
			$t->addColumn('peak', Types::INTEGER, ['notnull' => true, 'default' => 1200]);
			foreach (['rated_games', 'games', 'wins', 'losses', 'draws'] as $col) {
				$t->addColumn($col, Types::INTEGER, ['notnull' => true, 'default' => 0]);
			}
			$t->addColumn('listed', Types::SMALLINT, ['notnull' => false]);
			$t->addColumn('last_rated_at', Types::BIGINT, ['notnull' => false]);
			$t->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
			$t->setPrimaryKey(['id']);
			$t->addUniqueIndex(['uid'], 'qc_r_uid');
			$t->addIndex(['rating'], 'qc_r_rating');
		}

		return $schema;
	}
}
