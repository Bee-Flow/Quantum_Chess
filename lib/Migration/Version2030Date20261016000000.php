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
 * The seats that are out after a move of a game of more than two seats (docs/development/online-variants.md):
 * `qchess_vmoves.out_seats` keeps them as the settling browser claims them, so the server knows who still plays when a
 * player resigns, runs out of time or votes on a draw.
 */
class Version2030Date20261016000000 extends SimpleMigrationStep {
	/**
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		$schema = $schemaClosure();

		if ($schema->hasTable('qchess_vmoves')) {
			$t = $schema->getTable('qchess_vmoves');
			if (!$t->hasColumn('out_seats')) {
				$t->addColumn('out_seats', Types::STRING, ['notnull' => false, 'length' => 16]);
				return $schema;
			}
		}

		return null;
	}
}
