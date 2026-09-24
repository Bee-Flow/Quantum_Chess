<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * The lenient move parser of §4.12 (for LLM output and typed input) and canonical codes (§4.1). Works on bytes, so
 * any non-ASCII character makes the input unparsable, exactly like the JavaScript version.
 *
 * JavaScript twin: src/engine/parser.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 */
final class Parser {
	private const PROMO = [
		'Q' => 'q',
		'R' => 'r',
		'B' => 'b',
		'N' => 'n',
		'q' => 'q',
		'r' => 'r',
		'b' => 'b',
		'n' => 'n',
	];
	private const PIECES = ['K' => true, 'Q' => true, 'R' => true, 'B' => true, 'N' => true];
	private const SEP = ['-' => true, 'x' => true, 'X' => true, ':' => true];
	private const PAIRSEP = ['|' => true, '/' => true, ',' => true];
	private const OH = ['O' => true, 'o' => true, '0' => true];

	private string $s = '';
	private int $i = 0;
	private int $len = 0;

	/**
	 * Normalisation pipeline of §4.12 (steps 1–3): cut at the first `{`, trim whitespace (space, tab, CR, LF),
	 * strip trailing `+ # ! ?` and whitespace.
	 */
	public static function normalize(string $code): string {
		$brace = strpos($code, '{');
		if ($brace !== false) {
			$code = substr($code, 0, $brace);
		}
		$code = trim($code, " \t\r\n");
		return rtrim($code, "+#!? \t\r\n");
	}

	/**
	 * Parse a move code leniently. Returns null, `['castle' => 'O-O'|'O-O-O']`, or
	 * `['type', 'from', 'to', 'promo'?, 'letter'?]` with split targets and merge sources sorted by index.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function parse(string $code): ?array {
		$s = self::normalize($code);
		if ($s === '') {
			return null;
		}
		$p = new self();
		$p->s = $s;
		$p->len = strlen($s);
		return $p->run();
	}

	/**
	 * @return array<string, mixed>|null
	 */
	private function run(): ?array {
		$s = $this->s;
		$first = $s[0];
		if (isset(self::OH[$first])) {
			return self::castle($s);
		}
		if ($first === '?') {
			$this->i = 1;
			$letter = $this->piece();
			$sq = $this->square();
			if ($sq < 0 || !$this->end()) {
				return null;
			}
			return self::withLetter(['type' => 'measure', 'from' => [$sq], 'to' => []], $letter);
		}
		if ($this->len > 7 && strtolower(substr($s, 0, 7)) === 'measure') {
			$this->i = 7;
			$spaces = 0;
			while ($this->i < $this->len && ($s[$this->i] === ' ' || $s[$this->i] === "\t")) {
				$this->i++;
				$spaces++;
			}
			$sq = $this->square();
			if ($spaces === 0 || $sq < 0 || !$this->end()) {
				return null;
			}
			return ['type' => 'measure', 'from' => [$sq], 'to' => []];
		}
		$letter = $this->piece();
		$a = $this->square();
		if ($a < 0) {
			return null;
		}
		if ($this->optional(self::PAIRSEP)) {
			// merge: sq pairsep sq [sep] sq
			$b = $this->square();
			if ($b < 0) {
				return null;
			}
			$this->optional(self::SEP);
			$t = $this->square();
			if ($t < 0 || !$this->end()) {
				return null;
			}
			return self::withLetter(
				['type' => 'merge', 'from' => $a < $b ? [$a, $b] : [$b, $a], 'to' => [$t]],
				$letter,
			);
		}
		$this->optional(self::SEP);
		$b = $this->square();
		if ($b < 0) {
			return null;
		}
		if ($this->optional(self::PAIRSEP)) {
			// split: sq [sep] sq pairsep sq
			$c = $this->square();
			if ($c < 0 || !$this->end()) {
				return null;
			}
			return self::withLetter(
				['type' => 'split', 'from' => [$a], 'to' => $b < $c ? [$b, $c] : [$c, $b]],
				$letter,
			);
		}
		// standard: sq [sep] sq [promo]
		$promo = null;
		if (!$this->end()) {
			if ($s[$this->i] === '=') {
				$this->i++;
			}
			$ch = $this->i < $this->len ? $s[$this->i] : '';
			if (!isset(self::PROMO[$ch])) {
				return null;
			}
			$this->i++;
			$promo = self::PROMO[$ch];
			if (!$this->end()) {
				return null;
			}
		}
		$move = ['type' => 'standard', 'from' => [$a], 'to' => [$b]];
		if ($promo !== null) {
			$move['promo'] = $promo;
		}
		return self::withLetter($move, $letter);
	}

	private function end(): bool {
		return $this->i >= $this->len;
	}

	/**
	 * File letter (a-h or A-H) at offset k → 0..7, else -1.
	 */
	private function file(int $k): int {
		$j = $this->i + $k;
		if ($j >= $this->len) {
			return -1;
		}
		$c = ord($this->s[$j]);
		if ($c >= 97 && $c <= 104) {
			return $c - 97;
		}
		if ($c >= 65 && $c <= 72) {
			return $c - 65;
		}
		return -1;
	}

	/**
	 * Read a square, or return -1 without moving.
	 */
	private function square(): int {
		$f = $this->file(0);
		if ($f < 0 || $this->i + 1 >= $this->len) {
			return -1;
		}
		$r = ord($this->s[$this->i + 1]);
		if ($r < 49 || $r > 56) {
			return -1;
		}
		$this->i += 2;
		return ($r - 49) * 8 + $f;
	}

	/**
	 * Read an optional piece letter (K Q R B N followed by a file letter).
	 */
	private function piece(): ?string {
		if ($this->i < $this->len && isset(self::PIECES[$this->s[$this->i]]) && $this->file(1) >= 0) {
			return $this->s[$this->i++];
		}
		return null;
	}

	/**
	 * Read an optional one-character separator from a set.
	 *
	 * @param array<string, true> $set
	 */
	private function optional(array $set): bool {
		if ($this->i < $this->len && isset($set[$this->s[$this->i]])) {
			$this->i++;
			return true;
		}
		return false;
	}

	/**
	 * Attach the piece letter (if any) as the last key.
	 *
	 * @param array<string, mixed> $move
	 * @return array<string, mixed>
	 */
	private static function withLetter(array $move, ?string $letter): array {
		if ($letter !== null) {
			$move['letter'] = $letter;
		}
		return $move;
	}

	/**
	 * castle = oh "-" oh [ "-" oh ].
	 *
	 * @return array{castle: string}|null
	 */
	private static function castle(string $s): ?array {
		$len = strlen($s);
		if ($len === 3 && isset(self::OH[$s[0]]) && $s[1] === '-' && isset(self::OH[$s[2]])) {
			return ['castle' => 'O-O'];
		}
		if ($len === 5 && isset(self::OH[$s[0]]) && $s[1] === '-' && isset(self::OH[$s[2]]) && $s[3] === '-'
			&& isset(self::OH[$s[4]])) {
			return ['castle' => 'O-O-O'];
		}
		return null;
	}

	/**
	 * Canonical code of a move array (§4.1). Split targets and merge sources are emitted in index order.
	 *
	 * @param array<string, mixed> $move
	 */
	public static function moveCode(array $move): string {
		Tables::init();
		$names = Tables::$names;
		$from = $move['from'] ?? null;
		$to = $move['to'] ?? null;
		$sq = static function (mixed $s) use ($names): string {
			if (!is_int($s) || !isset($names[$s])) {
				throw new \InvalidArgumentException('squares must be integers 0..63');
			}
			return $names[$s];
		};
		if (!is_array($from) || !is_array($to)) {
			throw new \InvalidArgumentException('a move needs from and to arrays');
		}
		switch ($move['type'] ?? null) {
			case 'standard':
				$promo = $move['promo'] ?? null;
				return $sq($from[0] ?? null) . '-' . $sq($to[0] ?? null)
					. (is_string($promo) && $promo !== '' ? '=' . strtoupper($promo) : '');
			case 'split':
				$a = $to[0] ?? null;
				$b = $to[1] ?? null;
				if (is_int($a) && is_int($b) && $b < $a) {
					[$a, $b] = [$b, $a];
				}
				return $sq($from[0] ?? null) . '-' . $sq($a) . '|' . $sq($b);
			case 'merge':
				$a = $from[0] ?? null;
				$b = $from[1] ?? null;
				if (is_int($a) && is_int($b) && $b < $a) {
					[$a, $b] = [$b, $a];
				}
				return $sq($a) . '|' . $sq($b) . '-' . $sq($to[0] ?? null);
			case 'measure':
				return '?' . $sq($from[0] ?? null);
			default:
				throw new \InvalidArgumentException('unknown move type');
		}
	}

	/**
	 * Remove a trailing promotion suffix (`=Q`, `=R`, `=B`, `=N`) from a canonical code (§9.3).
	 */
	public static function stripPromo(string $code): string {
		return preg_match('/=[QRBN]$/', $code) === 1 ? substr($code, 0, -2) : $code;
	}
}
