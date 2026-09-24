<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Resolving a move input (a code string, a move array or a LegalMove) against a state: the full check pipeline of
 * §4.11, which `findMove`, `whyIllegal`, `applyMove` and every other method that takes a move share.
 *
 * JavaScript twin: src/engine/moveInput.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 */
final class MoveInput {
	/** Piece letter of a code → type code (a letter only has to match for these pieces). */
	private const LETTER_TYPE = ['K' => Tables::TYPE_K, 'Q' => Tables::TYPE_Q, 'R' => Tables::TYPE_R, 'B' => Tables::TYPE_B, 'N' => Tables::TYPE_N];

	/**
	 * Accept an integer square: an int, or an integral float (JSON `12.0` is the integer 12 in JavaScript).
	 */
	private static function squareOf(mixed $s): int {
		if (is_int($s)) {
			return $s >= 0 && $s <= 63 ? $s : -1;
		}
		if (is_float($s) && is_finite($s) && floor($s) === $s && $s >= 0.0 && $s <= 63.0) {
			return (int)$s;
		}
		return -1;
	}

	/**
	 * Normalise a move object (§4.11 check 2): `{type, from, to, promo}` (promo null when absent) or null when
	 * malformed. Split targets and merge sources are sorted by index.
	 *
	 * @return array{type: string, from: list<int>, to: list<int>, promo: string|null}|null
	 */
	public static function normalizeMoveObject(mixed $input): ?array {
		if (!is_array($input) || ($input !== [] && array_is_list($input))) {
			return null;
		}
		$type = $input['type'] ?? null;
		$from = $input['from'] ?? null;
		$to = $input['to'] ?? null;
		$promoIn = $input['promo'] ?? null;
		switch ($type) {
			case 'standard':
				$nf = 1;
				$nt = 1;
				break;
			case 'split':
				$nf = 1;
				$nt = 2;
				break;
			case 'merge':
				$nf = 2;
				$nt = 1;
				break;
			case 'measure':
				$nf = 1;
				$nt = 0;
				break;
			default:
				return null;
		}
		if (!is_array($from) || !is_array($to) || !array_is_list($from) || !array_is_list($to) || count($from) !== $nf || count($to) !== $nt) {
			return null;
		}
		$f = [];
		foreach ($from as $s) {
			$sq = self::squareOf($s);
			if ($sq < 0) {
				return null;
			}
			$f[] = $sq;
		}
		$t = [];
		foreach ($to as $s) {
			$sq = self::squareOf($s);
			if ($sq < 0) {
				return null;
			}
			$t[] = $sq;
		}
		$promo = null;
		if ($promoIn !== null) {
			if ($type !== 'standard' || !in_array($promoIn, MoveRecord::PROMOS, true)) {
				return null;
			}
			$promo = $promoIn;
		}
		if ($type === 'split') {
			if ($t[0] === $t[1]) {
				return null;
			}
			sort($t);
		}
		if ($type === 'merge') {
			if ($f[0] === $f[1]) {
				return null;
			}
			sort($f);
		}
		return ['type' => $type, 'from' => $f, 'to' => $t, 'promo' => $promo];
	}

	/**
	 * Resolve a move input against a state: the full §4.11 pipeline. Returns the legal record (with the Measure
	 * `from` normalised) or the first failing reason code.
	 */
	public static function resolveMove(Analysis $a, mixed $input): MoveRecord|string {
		$obj = $input;
		$letter = null;
		if (is_string($input)) {
			// An unparsable string is malformed before anything else; the parsed move then runs checks 1–21.
			$p = Parser::parse($input);
			if ($p === null) {
				return 'malformed';
			}
			if (isset($p['castle'])) {
				$home = $a->ci === 0 ? 4 : 60;
				$obj = ['type' => 'standard', 'from' => [$home], 'to' => [$p['castle'] === 'O-O' ? $home + 2 : $home - 2]];
			} else {
				$obj = ['type' => $p['type'], 'from' => $p['from'], 'to' => $p['to'], 'promo' => $p['promo'] ?? null];
				$letter = $p['letter'] ?? null;
			}
		}
		if ($a->state['result'] !== null) {
			return 'game_over';
		}
		$mv = self::normalizeMoveObject($obj);
		if ($mv === null) {
			return 'malformed';
		}
		$X = $a->occ[$mv['from'][0]];
		if ($X < 0) {
			return 'no_piece';
		}
		if (($X < 16) !== ($a->ci === 0)) {
			return 'not_your_piece';
		}
		if ($letter !== null && self::LETTER_TYPE[$letter] !== $a->typeCodes[$X]) {
			return 'piece_mismatch';
		}
		$code = self::codeOfNormalized($a, $mv, $X);
		if ($a->recs !== null && isset($a->recs[$code])) {
			return $a->recs[$code];
		}
		$r = self::checkMove($a, $mv, $X);
		if (is_string($r)) {
			return $r;
		}
		$r->code = $code;
		$a->recs[$code] = $r;
		return $r;
	}

	/**
	 * Canonical code of a normalised move (Measure squares mapped to min loc(X)).
	 *
	 * @param array{type: string, from: list<int>, to: list<int>, promo: string|null} $mv
	 */
	private static function codeOfNormalized(Analysis $a, array $mv, int $X): string {
		$names = Tables::$names;
		switch ($mv['type']) {
			case 'standard':
				return $names[$mv['from'][0]] . '-' . $names[$mv['to'][0]] . ($mv['promo'] === null ? '' : '=' . strtoupper($mv['promo']));
			case 'split':
				return $names[$mv['from'][0]] . '-' . $names[$mv['to'][0]] . '|' . $names[$mv['to'][1]];
			case 'merge':
				return $names[$mv['from'][0]] . '|' . $names[$mv['from'][1]] . '-' . $names[$mv['to'][0]];
			default:
				return '?' . $names[$a->locs[$X][0]];
		}
	}

	/**
	 * Checks 6 onwards for a normalised move whose piece passed checks 3–5.
	 *
	 * @param array{type: string, from: list<int>, to: list<int>, promo: string|null} $mv
	 */
	private static function checkMove(Analysis $a, array $mv, int $X): MoveRecord|string {
		$type = $a->typeCodes[$X];
		switch ($mv['type']) {
			case 'merge':
				if ($a->occ[$mv['from'][1]] !== $X) {
					return 'merge_mismatch';
				}
				if ($type === Tables::TYPE_K || $type === Tables::TYPE_P) {
					return 'cannot_merge';
				}
				return QuantumMoves::evalMerge($a, $X, $mv['from'][0], $mv['from'][1], $mv['to'][0]);
			case 'split':
				if ($type === Tables::TYPE_K || $type === Tables::TYPE_P) {
					return 'cannot_split';
				}
				return QuantumMoves::evalSplit($a, $X, $mv['from'][0], $mv['to'][0], $mv['to'][1]);
			case 'measure':
				return QuantumMoves::evalMeasure($a, $X);
			default:
				return MoveRules::evalStandard($a, $X, $mv['from'][0], $mv['to'][0], $mv['promo']);
		}
	}
}
