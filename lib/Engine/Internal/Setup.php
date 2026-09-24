<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

use OCA\QuantumChess\Engine\SetupException;

/**
 * Setup positions (Appendix A): `{state}` or `{fen, prelude?}`. Deterministic, never random.
 *
 * JavaScript twin: src/engine/setup.js. Section numbers (§) and appendices refer to docs/engine-rules.md.
 *
 * @internal
 *
 * @psalm-import-type EngineState from \OCA\QuantumChess\Engine\Engine
 */
final class Setup {
	private const FEN_PIECES = 'kqrbnp';

	public function __construct(
		private Pipeline $pipeline,
	) {
	}

	/**
	 * Parse the FEN fields. Accepts 4 to 6 fields (halfmove and fullmove default to 0 and 1).
	 *
	 * @return array{
	 *     pieces: array{0: list<array{sq: int, type: string}>, 1: list<array{sq: int, type: string}>},
	 *     turn: string,
	 *     flags: string,
	 *     ep: string,
	 *     halfmove: int,
	 *     fullmove: int,
	 * }
	 */
	public static function parseFen(mixed $fen): array {
		if (!is_string($fen)) {
			throw new SetupException('bad_fen', 'not a string');
		}
		$trimmed = trim($fen, " \t\n\r\v\f");
		$fields = $trimmed === '' ? [''] : preg_split('/\s+/', $trimmed);
		if ($fields === false || count($fields) < 4 || count($fields) > 6) {
			throw new SetupException('bad_fen', 'expected 4 to 6 fields');
		}
		$rows = explode('/', $fields[0]);
		if (count($rows) !== 8) {
			throw new SetupException('bad_fen', 'expected 8 ranks');
		}
		$pieces = [[], []];
		for ($i = 0; $i < 8; $i++) {
			$rank = 7 - $i;
			$file = 0;
			$row = $rows[$i];
			$len = strlen($row);
			for ($j = 0; $j < $len; $j++) {
				$ch = $row[$j];
				$o = ord($ch);
				if ($o >= 49 && $o <= 56) {
					$file += $o - 48;
					continue;
				}
				$lower = strtolower($ch);
				if (!str_contains(self::FEN_PIECES, $lower) || $file > 7) {
					throw new SetupException('bad_fen', 'bad placement');
				}
				$pieces[$ch === $lower ? 1 : 0][] = ['sq' => $rank * 8 + $file, 'type' => $lower];
				$file++;
			}
			if ($file !== 8) {
				throw new SetupException('bad_fen', 'a rank must have 8 files');
			}
		}
		$turn = $fields[1];
		if ($turn !== 'w' && $turn !== 'b') {
			throw new SetupException('bad_fen', 'side to move must be w or b');
		}
		$castle = $fields[2];
		$flags = '';
		if ($castle !== '-') {
			if (preg_match('/^[KQkq]{1,4}$/D', $castle) !== 1
				|| count(array_unique(str_split($castle))) !== strlen($castle)) {
				throw new SetupException('bad_fen', 'bad castling field');
			}
			foreach (Tables::CASTLING_FLAGS as $f) {
				if (str_contains($castle, $f)) {
					$flags .= $f;
				}
			}
		}
		$ep = $fields[3];
		if ($ep !== '-' && preg_match('/^[a-h][36]$/D', $ep) !== 1) {
			throw new SetupException('bad_fen', 'bad en-passant field');
		}
		$halfmove = self::digits($fields[4] ?? '0');
		if ($halfmove === null || $halfmove > 99) {
			throw new SetupException('bad_fen', 'halfmove must be 0..99');
		}
		$fullmove = self::digits($fields[5] ?? '1');
		if ($fullmove === null || $fullmove < 1) {
			throw new SetupException('bad_fen', 'fullmove must be ≥ 1');
		}
		return [
			'pieces' => $pieces,
			'turn' => $turn,
			'flags' => $flags,
			'ep' => $ep,
			'halfmove' => $halfmove,
			'fullmove' => $fullmove,
		];
	}

	/**
	 * A decimal digit string as a safe integer (leading zeros allowed), or null.
	 */
	private static function digits(string $text): ?int {
		if (preg_match('/^\d+$/D', $text) !== 1) {
			return null;
		}
		$digits = ltrim($text, '0');
		if ($digits === '') {
			return 0;
		}
		if (strlen($digits) > 16 || (strlen($digits) === 16 && strcmp($digits, '9007199254740991') > 0)) {
			return null;
		}
		return (int)$digits;
	}

	/**
	 * Assign ids to the pieces of one colour in four complete passes (Appendix A).
	 *
	 * @param list<array{sq: int, type: string}> $list pieces of the colour, ascending square
	 * @param string $types types string, updated by pass 4
	 * @return array<int, int> square → id
	 */
	private static function assignIds(array $list, int $base, string &$types): array {
		$kings = 0;
		foreach ($list as $p) {
			if ($p['type'] === 'k') {
				$kings++;
			}
		}
		if ($kings !== 1) {
			throw new SetupException('king_count', $base === 0 ? 'White' : 'Black');
		}
		if (count($list) > 16) {
			throw new SetupException('too_many_pieces', $base === 0 ? 'White' : 'Black');
		}
		$free = array_fill(0, 16, true);
		$bySquare = [];
		// Pass 1: start square of an id with the same initial type.
		$starts = array_slice(Tables::START_SQUARES, $base, 16);
		$initial = substr(Tables::INITIAL_TYPES, $base, 16);
		$pending = [];
		foreach ($list as $p) {
			$done = false;
			foreach ($starts as $k => $sq) {
				if ($free[$k] && $sq === $p['sq'] && $initial[$k] === $p['type']) {
					$free[$k] = false;
					$bySquare[$p['sq']] = $base + $k;
					$done = true;
					break;
				}
			}
			if (!$done) {
				$pending[] = $p;
			}
		}
		// Pass 2: remaining non-pawns get the lowest free id 0–7 of their initial type.
		$pass3 = [];
		foreach ($pending as $p) {
			$done = false;
			if ($p['type'] !== 'p') {
				for ($k = 0; $k < 8 && !$done; $k++) {
					if ($free[$k] && Tables::INITIAL_TYPES[$base + $k] === $p['type']) {
						$free[$k] = false;
						$bySquare[$p['sq']] = $base + $k;
						$done = true;
					}
				}
			}
			if (!$done) {
				$pass3[] = $p;
			}
		}
		// Pass 3: remaining pawns get the lowest free pawn id.
		$pass4 = [];
		foreach ($pass3 as $p) {
			$done = false;
			if ($p['type'] === 'p') {
				for ($k = 8; $k < 16 && !$done; $k++) {
					if ($free[$k]) {
						$free[$k] = false;
						$bySquare[$p['sq']] = $base + $k;
						$done = true;
					}
				}
			}
			if (!$done) {
				$pass4[] = $p;
			}
		}
		// Pass 4: remaining non-pawns get the lowest free pawn id and keep their real type.
		foreach ($pass4 as $p) {
			$done = false;
			if ($p['type'] !== 'p') {
				for ($k = 8; $k < 16 && !$done; $k++) {
					if ($free[$k]) {
						$free[$k] = false;
						$bySquare[$p['sq']] = $base + $k;
						$types[$base + $k] = $p['type'];
						$done = true;
					}
				}
			}
			if (!$done) {
				throw new SetupException('too_many_pieces', $base === 0 ? 'White' : 'Black');
			}
		}
		return $bySquare;
	}

	/**
	 * Split a prelude item into its code and optional forced outcome (`code@key`, split at the last `@`).
	 *
	 * @return array{0: string, 1: string|null}
	 */
	private static function preludeItem(mixed $item): array {
		if (is_string($item)) {
			$at = strrpos($item, '@');
			if ($at !== false) {
				return [substr($item, 0, $at), substr($item, $at + 1)];
			}
			return [$item, null];
		}
		if (is_array($item) && is_string($item['code'] ?? null)) {
			$outcome = $item['outcome'] ?? null;
			if ($outcome !== null && !is_string($outcome)) {
				// Never an outcome key: fails as prelude_bad_outcome (or prelude_outcome_unused), as in JavaScript.
				$outcome = is_scalar($outcome) ? (string)$outcome : gettype($outcome);
			}
			return [$item['code'], $outcome];
		}
		throw new SetupException('prelude_bad_code', is_scalar($item) ? (string)$item : gettype($item));
	}

	/**
	 * Build a state from a spec (Appendix A).
	 *
	 * @param array<string, mixed> $spec
	 * @return EngineState
	 */
	public function setup(array $spec): array {
		Tables::init();
		if (array_key_exists('state', $spec)) {
			$r = StateValidator::validate($spec['state']);
			if (!$r['ok']) {
				/** @var array{ok: false, error: string, message: string} $r */
				throw new SetupException('invalid_state', $r['error'] . ': ' . $r['message']);
			}
			/** @var array{ok: true, state: EngineState} $r */
			return $r['state'];
		}
		$fen = self::parseFen($spec['fen'] ?? null);
		$types = Tables::INITIAL_TYPES;
		$board = str_repeat('.', 64);
		$live = [];
		for ($c = 0; $c < 2; $c++) {
			$list = $fen['pieces'][$c];
			usort($list, static fn (array $x, array $y): int => $x['sq'] <=> $y['sq']);
			foreach (self::assignIds($list, $c * 16, $types) as $sq => $id) {
				$board[$sq] = Tables::$letter[$id];
				$live[$id] = true;
			}
		}
		$captured = [];
		for ($id = 0; $id < 32; $id++) {
			if (!isset($live[$id])) {
				$captured[] = $id;
			}
		}
		$worlds = [[$board, Tables::T]];
		$flags = $fen['flags'] === '' ? '-' : $fen['flags'];
		$state = [
			'v' => Tables::V,
			'types' => $types,
			'worlds' => $worlds,
			'turn' => $fen['turn'],
			'castling' => Worlds::castlingAfter($flags, $worlds),
			'ep' => '-',
			'halfmove' => 0,
			'fullmove' => 1,
			'ply' => 0,
			'captured' => $captured,
			'history' => ['0000000000000000'],
			'result' => null,
		];
		$prelude = $spec['prelude'] ?? [];
		if (!is_array($prelude) || !array_is_list($prelude)) {
			throw new SetupException('prelude_bad_code', 'prelude must be an array');
		}
		foreach ($prelude as $item) {
			[$code, $outcome] = self::preludeItem($item);
			$parsed = Parser::parse($code);
			if ($parsed === null || isset($parsed['castle'])) {
				throw new SetupException('prelude_bad_code', $code);
			}
			/** @var list<int> $from */
			$from = $parsed['from'];
			$X = $this->pipeline->analyze($state)->occ[$from[0]];
			if ($X < 0) {
				throw new SetupException('prelude_illegal', 'no_piece');
			}
			$state['turn'] = $X < 16 ? 'w' : 'b';
			$state['ep'] = '-';
			$state['result'] = null;
			$a = $this->pipeline->analyze($state);
			$rec = MoveInput::resolveMove($a, $code);
			if (is_string($rec)) {
				throw new SetupException('prelude_illegal', $rec);
			}
			$key = $rec->resolution;
			if ($rec->resolution === 'rolled') {
				if ($outcome === null) {
					throw new SetupException('prelude_needs_outcome', $code);
				}
				if (!in_array($outcome, array_column($rec->outcomes, 'key'), true)) {
					throw new SetupException('prelude_bad_outcome', $code . '@' . $outcome);
				}
				$key = $outcome;
			} elseif ($outcome !== null) {
				throw new SetupException('prelude_outcome_unused', $code . '@' . $outcome);
			}
			$applied = $this->pipeline->applyRecord($a, $rec, $key, false);
			if ($applied['captured'] === 0 || $applied['captured'] === 16) {
				throw new SetupException('prelude_king_captured', $code);
			}
			$state = $applied['state'];
		}
		/** @var list<array{0: string, 1: int}> $worlds */
		$worlds = $state['worlds'];
		$castling = Worlds::castlingAfter($flags, $worlds);
		$final = [
			'v' => Tables::V,
			'types' => $state['types'],
			'worlds' => $worlds,
			'turn' => $fen['turn'],
			'castling' => $castling,
			'ep' => $fen['ep'],
			'halfmove' => $fen['halfmove'],
			'fullmove' => $fen['fullmove'],
			'ply' => 0,
			'captured' => $state['captured'],
			'history' => [Worlds::hash($fen['turn'], $castling, $fen['ep'], (string)$state['types'], $worlds)],
			'result' => null,
		];
		$v = StateValidator::validate($final);
		if (!$v['ok']) {
			/** @var array{ok: false, error: string, message: string} $v */
			throw new SetupException('invalid_state', $v['error'] . ': ' . $v['message']);
		}
		/** @var array{ok: true, state: EngineState} $v */
		return $v['state'];
	}
}
