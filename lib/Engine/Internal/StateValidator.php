<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Strict validation of untrusted states against the invariants I1–I12 (ENGINE-RULES §2.7), in the same order and
 * with the same codes as validateState in src/engine/state.js. Never throws; returns a canonical copy.
 *
 * @internal
 */
final class StateValidator {
	private const STATE_KEYS = ['v', 'types', 'worlds', 'turn', 'castling', 'ep', 'halfmove', 'fullmove', 'ply', 'captured', 'history', 'result'];
	private const MAX_SAFE_INTEGER = 9007199254740991;

	/**
	 * @return array{ok: true, state: array<string, mixed>}|array{ok: false, error: string, message: string}
	 */
	public static function validate(mixed $input): array {
		try {
			return self::run($input);
		} catch (\Throwable $e) {
			return self::fail('shape', 'unreadable input: ' . substr($e->getMessage(), 0, 200));
		}
	}

	/**
	 * @return array{ok: false, error: string, message: string}
	 */
	private static function fail(string $error, string $message): array {
		return ['ok' => false, 'error' => $error, 'message' => $message];
	}

	/**
	 * An integer in [min, max]: an int, or an integral float (JSON `1.0` is the integer 1 in JavaScript).
	 */
	private static function intIn(mixed $x, int $min, int $max): ?int {
		if (is_float($x) && is_finite($x) && floor($x) === $x && abs($x) <= self::MAX_SAFE_INTEGER) {
			$x = (int)$x;
		}
		if (!is_int($x) || $x < $min || $x > $max) {
			return null;
		}
		return $x;
	}

	/**
	 * Is this a JSON array (a PHP list)? An empty PHP array is both `[]` and `{}`.
	 */
	private static function isList(mixed $x): bool {
		return is_array($x) && array_is_list($x);
	}

	/**
	 * @return array{ok: true, state: array<string, mixed>}|array{ok: false, error: string, message: string}
	 */
	private static function run(mixed $input): array {
		Tables::init();
		$obj = $input;
		if (is_string($obj)) {
			if (strlen($obj) > 1000000) {
				return self::fail('shape', 'input too large');
			}
			try {
				$obj = json_decode($obj, true, 64, JSON_THROW_ON_ERROR);
			} catch (\JsonException) {
				return self::fail('shape', 'not JSON');
			}
		}
		if (!is_array($obj) || ($obj !== [] && array_is_list($obj))) {
			return self::fail('shape', 'not an object');
		}
		if (count($obj) !== count(self::STATE_KEYS)) {
			return self::fail('shape', 'expected exactly the keys ' . implode(',', self::STATE_KEYS));
		}
		foreach (self::STATE_KEYS as $k) {
			if (!array_key_exists($k, $obj)) {
				return self::fail('shape', 'missing key ' . $k);
			}
		}
		$v = $obj['v'];
		$types = $obj['types'];
		$worldsIn = $obj['worlds'];
		$turn = $obj['turn'];
		$castling = $obj['castling'];
		$ep = $obj['ep'];
		$capturedIn = $obj['captured'];
		$historyIn = $obj['history'];
		$resultIn = $obj['result'];

		// I12
		if (self::intIn($v, 1, 1) === null) {
			return self::fail('I12', 'v must be 1');
		}
		// I8
		if (!is_string($types) || strlen($types) !== 32 || preg_match('/^[kqrbnp]{32}$/D', $types) !== 1) {
			return self::fail('I8', 'types must be 32 characters over kqrbnp');
		}
		for ($id = 0; $id < 32; $id++) {
			$initial = Tables::INITIAL_TYPES[$id];
			$ty = $types[$id];
			if ($initial !== 'p') {
				if ($ty !== $initial) {
					return self::fail('I8', 'id ' . $id . ' must keep type ' . $initial);
				}
			} elseif ($ty === 'k') {
				return self::fail('I8', 'pawn id ' . $id . ' cannot be a king');
			}
		}
		// Scalars
		if ($turn !== 'w' && $turn !== 'b') {
			return self::fail('shape', 'turn must be w or b');
		}
		if (!is_string($castling) || $castling === '' || strlen($castling) > 4 || preg_match('/^(?:-|K?Q?k?q?)$/D', $castling) !== 1) {
			return self::fail('shape', 'castling must be - or a subset of KQkq in order');
		}
		if (!is_string($ep) || ($ep !== '-' && preg_match('/^[a-h][1-8]$/D', $ep) !== 1)) {
			return self::fail('shape', 'ep must be - or a square name');
		}
		$ply = self::intIn($obj['ply'], 0, Tables::MAX_PLY);
		if ($ply === null) {
			return self::fail('I11', 'ply must be an integer 0..1200');
		}
		$halfmove = self::intIn($obj['halfmove'], 0, 99 + $ply);
		if ($halfmove === null) {
			return self::fail('I11', 'halfmove must be an integer 0..99+ply');
		}
		$fullmove = self::intIn($obj['fullmove'], 1, self::MAX_SAFE_INTEGER);
		if ($fullmove === null) {
			return self::fail('I11', 'fullmove must be an integer ≥ 1');
		}
		// captured: at most 31 ids (30 pieces plus a king in a game won by king_captured, e.g. W16; I4 checks the
		// kings). The JS engine still caps at 30 and rejects that final state (see .integration-notes/engine-js.md).
		if (!self::isList($capturedIn) || count($capturedIn) > 31) {
			return self::fail('I2', 'captured must be an array of at most 31 ids');
		}
		$captured = [];
		$isCaptured = array_fill(0, 32, false);
		foreach ($capturedIn as $x) {
			$id = self::intIn($x, 0, 31);
			if ($id === null) {
				return self::fail('I2', 'captured ids must be integers 0..31');
			}
			if ($isCaptured[$id]) {
				return self::fail('I2', 'duplicate captured id ' . $id);
			}
			$isCaptured[$id] = true;
			$captured[] = $id;
		}
		// result
		$result = null;
		if ($resultIn !== null) {
			if (!is_array($resultIn) || ($resultIn !== [] && array_is_list($resultIn))) {
				return self::fail('I11', 'result must be null or an object');
			}
			if (array_keys($resultIn) !== ['result', 'reason']) {
				return self::fail('I11', 'result must have exactly the keys result, reason');
			}
			$r = $resultIn['result'];
			$reason = $resultIn['reason'];
			if ($r !== '1-0' && $r !== '0-1' && $r !== '1/2-1/2') {
				return self::fail('I11', 'bad result value');
			}
			if (!is_string($reason) || !in_array($reason, Tables::RESULT_REASONS, true)) {
				return self::fail('I11', 'bad result reason');
			}
			if (in_array($reason, Tables::WIN_REASONS, true) === ($r === '1/2-1/2')) {
				return self::fail('I11', 'result and reason disagree');
			}
			$result = ['result' => $r, 'reason' => $reason];
		}
		// I4 (liveness part)
		$kingCaptured = ($isCaptured[0] ? 1 : 0) + ($isCaptured[16] ? 1 : 0);
		if ($result !== null && $result['reason'] === 'king_captured') {
			if ($kingCaptured !== 1) {
				return self::fail('I4', 'king_captured needs exactly one captured king');
			}
			if ($isCaptured[16] !== ($result['result'] === '1-0')) {
				return self::fail('I4', 'the winner must be the side whose king is alive');
			}
		} elseif ($kingCaptured !== 0) {
			return self::fail('I4', 'both kings must be live');
		}
		// worlds
		if (!self::isList($worldsIn) || count($worldsIn) < 1 || count($worldsIn) > Tables::MAX_WORLDS) {
			return self::fail('I7', 'worlds must be an array of 1..64 entries');
		}
		$worlds = [];
		$sum = 0;
		$prev = null;
		foreach ($worldsIn as $w) {
			if (!self::isList($w) || count($w) !== 2) {
				return self::fail('shape', 'a world must be [board, weight]');
			}
			$b = $w[0];
			if (!is_string($b) || strlen($b) !== 64) {
				return self::fail('shape', 'a board must be a 64-character string');
			}
			$weight = self::intIn($w[1], 1, Tables::T);
			if ($weight === null) {
				return self::fail('I5', 'weights must be integers 1..2^24');
			}
			$sum += $weight;
			if ($prev !== null && !(strcmp($prev, $b) < 0)) {
				return self::fail('I6', 'boards must be strictly ascending');
			}
			$prev = $b;
			$worlds[] = [$b, $weight];
		}
		if ($sum !== Tables::T) {
			return self::fail('I5', 'weights must sum to 2^24');
		}
		// I1, I2 per square and per world
		$idOf = Tables::$idOf;
		/** @var array<int, int> $occ */
		$occ = array_fill(0, 64, -1);
		foreach ($worlds as [$b]) {
			$seen = [];
			for ($s = 0; $s < 64; $s++) {
				$c = $b[$s];
				if ($c === '.') {
					continue;
				}
				$id = $idOf[$c] ?? -1;
				if ($id < 0) {
					return self::fail('shape', 'boards may only contain . A-P a-p');
				}
				if ($occ[$s] === -1) {
					$occ[$s] = $id;
				} elseif ($occ[$s] !== $id) {
					return self::fail('I1', 'two pieces share a square across worlds');
				}
				if ($isCaptured[$id]) {
					return self::fail('I2', 'captured id on a board');
				}
				if (isset($seen[$id])) {
					return self::fail('I2', 'a piece appears twice in one board');
				}
				$seen[$id] = true;
			}
			for ($id = 0; $id < 32; $id++) {
				if (!$isCaptured[$id] && !isset($seen[$id])) {
					return self::fail('I2', 'live id ' . $id . ' missing from a board');
				}
			}
		}
		// I3, I4: classical pawns and kings
		$b0 = $worlds[0][0];
		$n = count($worlds);
		for ($id = 0; $id < 32; $id++) {
			if ($isCaptured[$id]) {
				continue;
			}
			$ty = $types[$id];
			if ($ty !== 'p' && $ty !== 'k') {
				continue;
			}
			$ch = Tables::$letter[$id];
			$s0 = strpos($b0, $ch);
			$s0 = $s0 === false ? -1 : $s0;
			for ($i = 1; $i < $n; $i++) {
				if ($s0 < 0 || $worlds[$i][0][$s0] !== $ch) {
					return self::fail($ty === 'p' ? 'I3' : 'I4', ($ty === 'p' ? 'pawn ' : 'king ') . $id . ' must be classical');
				}
			}
			if ($ty === 'p' && ($s0 < 8 || $s0 >= 56)) {
				return self::fail('I3', 'pawn on rank 1 or 8');
			}
		}
		// I9: castling
		if ($castling !== '-') {
			foreach (Tables::CASTLING_FLAGS as $flag) {
				if (!str_contains($castling, $flag)) {
					continue;
				}
				$c = Tables::CASTLING[$flag];
				$kc = Tables::$letter[$c['king']];
				$rc = Tables::$letter[$c['rook']];
				foreach ($worlds as [$b]) {
					if ($b[$c['from']] !== $kc || $b[$c['rookFrom']] !== $rc) {
						return self::fail('I9', 'castling flag ' . $flag . ' needs king and rook on their home squares');
					}
				}
			}
		}
		// I10: en passant
		if ($ep !== '-') {
			$e = Tables::$index[$ep];
			$er = $e >> 3;
			if (($turn === 'b' && $er !== 2) || ($turn === 'w' && $er !== 5)) {
				return self::fail('I10', 'ep square on the wrong rank');
			}
			$p = $turn === 'b' ? $e + 8 : $e - 8;
			$pid = $occ[$p];
			$pawnWhite = $turn === 'b';
			if ($pid < 0 || ($pid < 16) !== $pawnWhite || $types[$pid] !== 'p') {
				return self::fail('I10', 'no double-pushed pawn beside the ep square');
			}
			$beside = false;
			foreach ([-1, 1] as $df) {
				$file = ($p & 7) + $df;
				if ($file < 0 || $file > 7) {
					continue;
				}
				$id = $occ[($p & ~7) + $file];
				if ($id >= 0 && ($id < 16) === ($turn === 'w') && $types[$id] === 'p') {
					$beside = true;
				}
			}
			if (!$beside) {
				return self::fail('I10', 'no pawn of the side to move beside the double-pushed pawn');
			}
			if ($occ[$e] !== -1) {
				return self::fail('I10', 'ep square must be empty');
			}
		}
		// history
		if (!self::isList($historyIn) || count($historyIn) < 1 || count($historyIn) > $halfmove + 1) {
			return self::fail('I11', 'history must have 1..halfmove+1 entries');
		}
		$history = [];
		foreach ($historyIn as $h) {
			if (!is_string($h) || preg_match('/^[0-9a-f]{16}$/D', $h) !== 1) {
				return self::fail('I11', 'history entries must be 16 lowercase hex digits');
			}
			$history[] = $h;
		}
		if (end($history) !== Worlds::hash($turn, $castling, $ep, $types, $worlds)) {
			return self::fail('I11', 'the last history entry must be the position hash');
		}
		$state = [
			'v' => Tables::V,
			'types' => $types,
			'worlds' => $worlds,
			'turn' => $turn,
			'castling' => $castling,
			'ep' => $ep,
			'halfmove' => $halfmove,
			'fullmove' => $fullmove,
			'ply' => $ply,
			'captured' => $captured,
			'history' => $history,
			'result' => $result,
		];
		// I7: budget
		$a = new Analysis($state);
		if ($a->budget(0) > Tables::BUDGET || $a->budget(1) > Tables::BUDGET) {
			return self::fail('I7', 'budget exceeds 8');
		}
		return ['ok' => true, 'state' => $state];
	}
}
