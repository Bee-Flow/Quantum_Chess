<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Constants, board alphabet and precomputed geometry (ENGINE-RULES §1–§3.2, §4.2). Built once per process.
 *
 * @internal Only for lib/Engine. Other code uses {@see \OCA\QuantumChess\Engine\Engine}.
 */
final class Tables {
	public const V = 1;
	public const T = 16777216;
	/** T as a float, for the derived probabilities (exact: T is a power of two). */
	public const TF = 16777216.0;
	/** T² as a float (2^48), the denominator of moveRisk. */
	public const T2F = 281474976710656.0;
	public const BUDGET = 8;
	public const MAX_WORLDS = 64;
	public const MAX_LOCATIONS = 4;
	public const FIFTY_MOVE_PLIES = 100;
	public const REPETITION_COUNT = 3;
	public const MAX_PLY = 1200;
	public const LINK_THRESHOLD = 68719476736;

	public const TYPE_K = 0;
	public const TYPE_Q = 1;
	public const TYPE_R = 2;
	public const TYPE_B = 3;
	public const TYPE_N = 4;
	public const TYPE_P = 5;

	/** Type code → character. */
	public const TYPE_CHARS = ['k', 'q', 'r', 'b', 'n', 'p'];

	/** Character → type code. */
	public const TYPE_CODE = ['k' => 0, 'q' => 1, 'r' => 2, 'b' => 3, 'n' => 4, 'p' => 5];

	public const INITIAL_TYPES = 'kqrrbbnnppppppppkqrrbbnnpppppppp';

	public const START_SQUARES = [
		4, 3, 0, 7, 2, 5, 1, 6, 8, 9, 10, 11, 12, 13, 14, 15,
		60, 59, 56, 63, 58, 61, 57, 62, 48, 49, 50, 51, 52, 53, 54, 55,
	];

	public const START_JSON = '{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["CGEBAFHDIJKLMNOP................................ijklmnopcgebafhd",16777216]],"turn":"w","castling":"KQkq","ep":"-","halfmove":0,"fullmove":1,"ply":0,"captured":[],"history":["80c209d9560802c2"],"result":null}';

	public const START_HASH = '80c209d9560802c2';

	/** Castling flags in canonical order. */
	public const CASTLING_FLAGS = ['K', 'Q', 'k', 'q'];

	/**
	 * Castling table (§4.6): flag → king id, king from/to, rook id, rook from/to, squares that must be empty.
	 */
	public const CASTLING = [
		'K' => ['flag' => 'K', 'king' => 0, 'from' => 4, 'to' => 6, 'rook' => 3, 'rookFrom' => 7, 'rookTo' => 5, 'empty' => [5, 6]],
		'Q' => ['flag' => 'Q', 'king' => 0, 'from' => 4, 'to' => 2, 'rook' => 2, 'rookFrom' => 0, 'rookTo' => 3, 'empty' => [1, 2, 3]],
		'k' => ['flag' => 'k', 'king' => 16, 'from' => 60, 'to' => 62, 'rook' => 19, 'rookFrom' => 63, 'rookTo' => 61, 'empty' => [61, 62]],
		'q' => ['flag' => 'q', 'king' => 16, 'from' => 60, 'to' => 58, 'rook' => 18, 'rookFrom' => 56, 'rookTo' => 59, 'empty' => [57, 58, 59]],
	];

	public const RESULT_REASONS = ['king_captured', 'king_trapped', 'bare_kings', 'repetition', 'fifty_moves', 'max_ply', 'no_moves'];

	public const WIN_REASONS = ['king_captured', 'king_trapped'];

	public const ILLEGAL_REASONS = [
		'game_over', 'malformed', 'no_piece', 'not_your_piece', 'piece_mismatch', 'merge_mismatch', 'cannot_split',
		'cannot_merge', 'not_superposed', 'castle_no_right', 'castle_blocked', 'unreachable', 'promotion_required',
		'promotion_invalid', 'nothing_to_capture', 'blocked', 'own_piece', 'split_target_occupied', 'split_blocked',
		'location_cap', 'budget_full', 'merge_target_own', 'merge_part_stuck',
	];

	public const SETUP_ERRORS = [
		'bad_fen', 'king_count', 'too_many_pieces', 'prelude_bad_code', 'prelude_illegal', 'prelude_needs_outcome',
		'prelude_bad_outcome', 'prelude_outcome_unused', 'prelude_king_captured', 'invalid_state',
	];

	public const OUTCOME_KEYS = ['miss', 'move', 'capture'];

	/** Directions as [dFile, dRank]; 0..3 orthogonal, 4..7 diagonal (same order as the JS engine). */
	private const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];

	/** Ray directions per type code (empty for non-sliders). */
	public const SLIDE_DIRS = [[], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3], [4, 5, 6, 7], [], []];

	/** @var array<int, string> id → board letter */
	public static array $letter = [];
	/** @var array<string, int> board letter → id */
	public static array $idOf = [];
	/** @var array<string, int> board character → colour index (0 White, 1 Black); '.' is absent */
	public static array $colorOfChar = [];
	/** @var array<int, string> square index → name */
	public static array $names = [];
	/** @var array<string, int> square name → index */
	public static array $index = [];
	/** @var array<int, list<int>> RAYS[s * 8 + d]: squares from s (exclusive), nearest first */
	public static array $rays = [];
	/** @var array<int, list<int>> LANE[f * 64 + t]: squares strictly between f and t (only for squares on a line) */
	public static array $lane = [];
	/** @var array<int, int> DIR_OF[f * 64 + t]: direction index (only for squares on a line) */
	public static array $dirOf = [];
	/** @var array<int, true> GEO[type * 4096 + f * 64 + t] is set when G(type, f, t) holds */
	public static array $geo = [];
	/** @var list<list<list<int>>> TARGETS[type][s]: geometric targets of non-pawn types, ascending */
	public static array $targets = [];
	/** @var array<int, list<int>> */
	public static array $knight = [];
	/** @var array<int, list<int>> */
	public static array $king = [];
	/** @var array<int, array<int, int>> PAWN_PUSH[ci][f] (only when on the board) */
	public static array $pawnPush = [[], []];
	/** @var array<int, array<int, int>> PAWN_DOUBLE[ci][f] (only from the start rank) */
	public static array $pawnDouble = [[], []];
	/** @var array<int, array<int, list<int>>> PAWN_CAPTURES[ci][f], ascending */
	public static array $pawnCaptures = [[], []];
	/** @var array<int, array<int, list<int>>> PAWN_ATTACKERS[ci][k]: squares from which a pawn of ci attacks k */
	public static array $pawnAttackers = [[], []];

	private static bool $ready = false;

	/**
	 * Build every table (idempotent).
	 */
	public static function init(): void {
		if (self::$ready) {
			return;
		}
		for ($id = 0; $id < 32; $id++) {
			$ch = chr($id < 16 ? 0x41 + $id : 0x61 + $id - 16);
			self::$letter[] = $ch;
			self::$idOf[$ch] = $id;
			self::$colorOfChar[$ch] = $id < 16 ? 0 : 1;
		}
		for ($s = 0; $s < 64; $s++) {
			$name = chr(97 + ($s & 7)) . (string)(($s >> 3) + 1);
			self::$names[] = $name;
			self::$index[$name] = $s;
		}
		for ($s = 0; $s < 64; $s++) {
			$f = $s & 7;
			$r = $s >> 3;
			foreach (self::DIRECTIONS as $d => [$df, $dr]) {
				$ray = [];
				$ff = $f + $df;
				$rr = $r + $dr;
				while ($ff >= 0 && $ff < 8 && $rr >= 0 && $rr < 8) {
					$ray[] = $rr * 8 + $ff;
					$ff += $df;
					$rr += $dr;
				}
				self::$rays[$s * 8 + $d] = $ray;
				foreach ($ray as $i => $t) {
					self::$lane[$s * 64 + $t] = array_slice($ray, 0, $i);
					self::$dirOf[$s * 64 + $t] = $d;
				}
			}
			$knight = [];
			$king = [];
			for ($t = 0; $t < 64; $t++) {
				$adf = abs(($t & 7) - $f);
				$adr = abs(($t >> 3) - $r);
				if (($adf === 1 && $adr === 2) || ($adf === 2 && $adr === 1)) {
					$knight[] = $t;
				}
				if ($t !== $s && $adf <= 1 && $adr <= 1) {
					$king[] = $t;
				}
			}
			self::$knight[$s] = $knight;
			self::$king[$s] = $king;
		}
		for ($type = 0; $type < 6; $type++) {
			self::$targets[$type] = [];
		}
		for ($s = 0; $s < 64; $s++) {
			for ($t = 0; $t < 64; $t++) {
				if ($s === $t) {
					continue;
				}
				$adf = abs(($t & 7) - ($s & 7));
				$adr = abs(($t >> 3) - ($s >> 3));
				$i = $s * 64 + $t;
				if ($adf <= 1 && $adr <= 1) {
					self::$geo[self::TYPE_K * 4096 + $i] = true;
				}
				if ($adf === $adr) {
					self::$geo[self::TYPE_B * 4096 + $i] = true;
					self::$geo[self::TYPE_Q * 4096 + $i] = true;
				}
				if ($adf === 0 || $adr === 0) {
					self::$geo[self::TYPE_R * 4096 + $i] = true;
					self::$geo[self::TYPE_Q * 4096 + $i] = true;
				}
				if (($adf === 1 && $adr === 2) || ($adf === 2 && $adr === 1)) {
					self::$geo[self::TYPE_N * 4096 + $i] = true;
				}
			}
			for ($type = 0; $type < 5; $type++) {
				$list = [];
				for ($t = 0; $t < 64; $t++) {
					if (isset(self::$geo[$type * 4096 + $s * 64 + $t])) {
						$list[] = $t;
					}
				}
				self::$targets[$type][$s] = $list;
			}
			self::$targets[self::TYPE_P][$s] = [];
		}
		for ($ci = 0; $ci < 2; $ci++) {
			$dir = $ci === 0 ? 8 : -8;
			$startRank = $ci === 0 ? 1 : 6;
			for ($s = 0; $s < 64; $s++) {
				self::$pawnAttackers[$ci][$s] = [];
			}
			for ($s = 0; $s < 64; $s++) {
				$f = $s & 7;
				$caps = [];
				$t = $s + $dir;
				if ($t >= 0 && $t < 64) {
					self::$pawnPush[$ci][$s] = $t;
					if (($s >> 3) === $startRank) {
						self::$pawnDouble[$ci][$s] = $s + 2 * $dir;
					}
					if ($f >= 1) {
						$caps[] = $t - 1;
					}
					if ($f <= 6) {
						$caps[] = $t + 1;
					}
				}
				sort($caps);
				self::$pawnCaptures[$ci][$s] = $caps;
				foreach ($caps as $c) {
					self::$pawnAttackers[$ci][$c][] = $s;
				}
			}
		}
		self::$ready = true;
	}

	/**
	 * Pawn move kind for colour index ci: 'push', 'double', 'diagonal' or null (§4.2).
	 */
	public static function pawnKind(int $ci, int $f, int $t): ?string {
		if ((self::$pawnPush[$ci][$f] ?? -1) === $t) {
			return 'push';
		}
		if ((self::$pawnDouble[$ci][$f] ?? -1) === $t) {
			return 'double';
		}
		foreach (self::$pawnCaptures[$ci][$f] as $c) {
			if ($c === $t) {
				return 'diagonal';
			}
		}
		return null;
	}

	/**
	 * The lane of a standard move (§3.2): squares strictly between f and t for sliders, the skipped square of a
	 * double push, empty otherwise.
	 *
	 * @return list<int>
	 */
	public static function standardLane(int $type, int $f, int $t, ?string $pawnKind): array {
		if ($type === self::TYPE_Q || $type === self::TYPE_R || $type === self::TYPE_B) {
			return self::$lane[$f * 64 + $t] ?? [];
		}
		if ($pawnKind === 'double') {
			return [($f + $t) >> 1];
		}
		return [];
	}
}
