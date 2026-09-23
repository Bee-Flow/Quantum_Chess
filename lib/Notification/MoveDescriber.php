<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Notification;

use OCA\QuantumChess\Engine\Engine;
use OCP\IL10N;

/**
 * "The last move in words" for the `your_turn` notification (docs/GAME-DESIGN.md §7.12), from the stored move
 * parameters `{code, notation, color, key, weight, capturedType}`.
 */
class MoveDescriber {
	public function __construct(
		private Engine $engine,
	) {
	}

	public static function pieceName(IL10N $l, string $type): string {
		return match (strtolower($type)) {
			'k' => $l->t('king'),
			'q' => $l->t('queen'),
			'r' => $l->t('rook'),
			'b' => $l->t('bishop'),
			'n' => $l->t('knight'),
			default => $l->t('pawn'),
		};
	}

	/**
	 * @param array<string, mixed> $move
	 */
	public function describe(IL10N $l, array $move): string {
		$notation = is_string($move['notation'] ?? null) ? $move['notation'] : '';
		$head = trim((string)preg_replace('/\s*(\{[^}]*\}|#)\s*/', ' ', $notation));
		$key = is_string($move['key'] ?? null) ? $move['key'] : null;
		$weight = is_int($move['weight'] ?? null) ? $move['weight'] : null;
		$pct = $weight === null ? null : $this->engine->pct($weight);
		// Percentages use a no-break space ("58 %") so that the number and the sign stay on one line.
		$captured = is_string($move['capturedType'] ?? null) ? self::pieceName($l, $move['capturedType']) : null;

		if (preg_match('/^O-O(-O)?/', $head)) {
			return $l->t('They castled.');
		}
		if (preg_match('/^\?([KQRBN]?)([a-h][1-8])/', $head, $m)) {
			$piece = self::pieceName($l, $m[1] === '' ? 'p' : $m[1]);
			if ($key !== null && preg_match('/^[a-h][1-8]$/', $key)) {
				return $l->t('They measured their %1$s: it\'s on %2$s', [$piece, $key]);
			}
			return $l->t('They measured their %1$s', [$piece]);
		}
		if (preg_match('/^([KQRBN]?)([a-h][1-8])-([a-h][1-8])\|([a-h][1-8])/', $head, $m)) {
			// Translations may not contain a pipe character, so the two targets are one parameter.
			return $l->t('They split their %1$s: %2$s → %3$s', [self::pieceName($l, $m[1] === '' ? 'p' : $m[1]), $m[2], $m[3] . ' | ' . $m[4]]);
		}
		if (preg_match('/^([KQRBN]?)([a-h][1-8])\|([a-h][1-8])([x-])([a-h][1-8])/', $head, $m)) {
			$piece = self::pieceName($l, $m[1] === '' ? 'p' : $m[1]);
			if ($captured !== null) {
				return $pct === null
					? $l->t('They merged their %1$s on %2$s and captured your %3$s', [$piece, $m[5], $captured])
					: $l->t('They merged their %1$s on %2$s and captured your %3$s (%4$d %% chance)', [$piece, $m[5], $captured, $pct]);
			}
			return $l->t('They merged their %1$s on %2$s', [$piece, $m[5]]);
		}
		if (preg_match('/^([KQRBN]?)([a-h][1-8])([x-])([a-h][1-8])/', $head, $m)) {
			$piece = self::pieceName($l, $m[1] === '' ? 'p' : $m[1]);
			$to = $m[4];
			if ($key === 'miss') {
				return $l->t('Their move to %1$s missed (%2$d %%)', [$to, (int)$pct]);
			}
			if ($captured !== null) {
				return $pct === null
					? $l->t('They captured your %1$s on %2$s', [$captured, $to])
					: $l->t('They captured your %1$s on %2$s (%3$d %% chance)', [$captured, $to, $pct]);
			}
			if ($pct !== null) {
				return $l->t('Their %1$s landed on %2$s (%3$d %%)', [$piece, $to, $pct]);
			}
			return $l->t('They moved their %1$s to %2$s', [$piece, $to]);
		}
		return $notation;
	}
}
