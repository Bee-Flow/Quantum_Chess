<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Move notation (§5.7): head + suffix + mark, for example `Bc1xh6 {capture 50%}`, `?Na4 {c4 50%}`, `Qd4|h5xh8 #`,
 * `Ng1-f3|h3`, `O-O` or `e7-e8=Q`.
 *
 * JavaScript twin: src/engine/notation.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 */
final class Notation {
	/**
	 * Notation of a legal move played in the analysed state. A rolled move needs its measurement record; the win mark
	 * is derived by replaying the move with the recorded outcome.
	 *
	 * @param array<string, mixed>|null $measurement
	 * @throws \InvalidArgumentException when a rolled move has no matching measurement record
	 */
	public static function of(Pipeline $pipeline, Analysis $a, MoveRecord $rec, ?array $measurement): string {
		if ($rec->resolution === 'rolled') {
			$mk = $measurement['key'] ?? null;
			if (!is_string($mk) || !in_array($mk, array_column($rec->outcomes, 'key'), true)) {
				throw new \InvalidArgumentException('a rolled move needs its measurement record');
			}
			$key = $mk;
		} else {
			$key = $rec->resolution === 'certain' && count($rec->outcomes) === 1 ? $rec->outcomes[0]['key'] : 'move';
		}
		$names = Tables::$names;
		$typeChar = Tables::TYPE_CHARS[$rec->type] ?? 'p';
		$letter = $typeChar === 'p' ? '' : strtoupper($typeChar);
		$sep = $key === 'capture' ? 'x' : '-';
		switch ($rec->kind) {
			case 'standard':
				if ($rec->castle !== null) {
					$head = $rec->t > $rec->f ? 'O-O' : 'O-O-O';
				} else {
					$head = $letter . $names[$rec->f] . $sep . $names[$rec->t] . ($rec->promo === null ? '' : '=' . strtoupper($rec->promo));
				}
				break;
			case 'split':
				$head = $letter . $names[$rec->f] . '-' . $names[$rec->t] . '|' . $names[$rec->t2];
				break;
			case 'merge':
				$head = $letter . $names[$rec->f] . '|' . $names[$rec->f2] . $sep . $names[$rec->t];
				break;
			default:
				$head = '?' . $letter . $names[$rec->f];
		}
		$suffix = '';
		if ($rec->resolution === 'rolled') {
			foreach ($rec->outcomes as $o) {
				if ($o['key'] === $key) {
					$suffix = ' {' . $key . ' ' . Views::pct($o['weight']) . '%}';
					break;
				}
			}
		}
		$after = $pipeline->applyRecord($a, $rec, $rec->resolution === 'rolled' ? $key : $rec->resolution, true)['state'];
		$result = $after['result'];
		$won = is_array($result) && in_array($result['reason'] ?? null, Tables::WIN_REASONS, true);
		return $head . $suffix . ($won ? ' #' : '');
	}
}
