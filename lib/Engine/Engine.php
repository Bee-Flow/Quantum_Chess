<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine;

use OCA\QuantumChess\Engine\Internal\Analysis;
use OCA\QuantumChess\Engine\Internal\Core;
use OCA\QuantumChess\Engine\Internal\Describer;
use OCA\QuantumChess\Engine\Internal\MoveRecord;
use OCA\QuantumChess\Engine\Internal\Moves;
use OCA\QuantumChess\Engine\Internal\Parser;
use OCA\QuantumChess\Engine\Internal\RollDisplay;
use OCA\QuantumChess\Engine\Internal\Setup;
use OCA\QuantumChess\Engine\Internal\StateValidator;
use OCA\QuantumChess\Engine\Internal\Tables;
use OCA\QuantumChess\Engine\Internal\Views;
use OCA\QuantumChess\Engine\Internal\Worlds;

/**
 * The Quantum Chess rules engine, PHP twin of src/engine (normative rules: docs/ENGINE-RULES.md; API: SPEC §3.4).
 *
 * Pure and deterministic: no clock, locale, network or database; the only randomness is the default roll of
 * {@see applyMove()} (`random_int`). States are the canonical arrays of ER §2.5 (lists stay lists, keys in order)
 * and are never mutated. Derived data of recently used states is cached inside the instance, keyed by the exact
 * state, so repeated calls on one position (find, apply, notation, views) do the work once.
 *
 * Methods that take a state expect a valid one: check untrusted input with {@see validateState()} first.
 * Results are byte-identical to the JavaScript engine on the parity fixtures (tests/fixtures/engine).
 */
final class Engine {
	/** Rules version, stored as `v` in every state. */
	public const V = 1;
	/** The fixed sum of all world weights, 2^24. */
	public const T = 16777216;
	/** Maximum number of distinct own arrangements per side. */
	public const BUDGET = 8;
	/** Derived bound on the number of worlds (never checked on its own). */
	public const MAX_WORLDS = 64;
	/** Maximum number of squares a piece may occupy after a split. */
	public const MAX_LOCATIONS = 4;
	public const FIFTY_MOVE_PLIES = 100;
	public const REPETITION_COUNT = 3;
	public const MAX_PLY = 1200;
	/** Link threshold of links(): |T·W(a∧b) − W(a)·W(b)| ≥ 2^36. */
	public const LINK_THRESHOLD = 68719476736;
	/** Canonical JSON of the start position (ER §2.5). */
	public const START_JSON = Tables::START_JSON;
	public const START_HASH = Tables::START_HASH;
	public const PIECE_TYPES = ['k', 'q', 'r', 'b', 'n', 'p'];
	public const PROMOTION_TYPES = ['q', 'r', 'b', 'n'];
	public const CASTLING_FLAGS = Tables::CASTLING_FLAGS;
	/** Result reasons written by the engine (ER §6). */
	public const RESULT_REASONS = Tables::RESULT_REASONS;
	/** Reasons that are a win for the mover. */
	public const WIN_REASONS = Tables::WIN_REASONS;
	/** `whyIllegal` reason codes in check order (ER §4.11). */
	public const ILLEGAL_REASONS = Tables::ILLEGAL_REASONS;
	/** Setup error codes (ER Appendix A). */
	public const SETUP_ERRORS = Tables::SETUP_ERRORS;
	/** Outcome keys of standard moves and merges, in key order. */
	public const OUTCOME_KEYS = Tables::OUTCOME_KEYS;

	private Core $core;

	public function __construct() {
		Tables::init();
		$this->core = new Core();
	}

	// ---------------------------------------------------------------- states

	/**
	 * The start position (ER §2.5).
	 *
	 * @return array<string, mixed>
	 */
	public function initialState(): array {
		/** @var array<string, mixed> */
		return json_decode(self::START_JSON, true, 16, JSON_THROW_ON_ERROR);
	}

	/**
	 * Strictly validate untrusted input (a decoded array or a JSON string) against I1–I12 (ER §2.7).
	 *
	 * @return array<string, mixed> a fresh canonical copy
	 * @throws InvalidStateException with the invariant (`shape`, `I1` … `I12`)
	 */
	public function validateState(mixed $data): array {
		$r = StateValidator::validate($data);
		if (!$r['ok']) {
			throw new InvalidStateException($r['error'], $r['message']);
		}
		return $r['state'];
	}

	/**
	 * json_decode + validateState.
	 *
	 * @return array<string, mixed>
	 * @throws InvalidStateException
	 */
	public function parseState(string $json): array {
		return $this->validateState($json);
	}

	/**
	 * Canonical JSON (ER §2.6). Rebuilds the key order, so it is safe for states that went through other code.
	 *
	 * @param array<string, mixed> $state
	 * @throws InvalidStateException when a key is missing
	 */
	public function serializeState(array $state): string {
		foreach (['v', 'types', 'worlds', 'turn', 'castling', 'ep', 'halfmove', 'fullmove', 'ply', 'captured', 'history', 'result'] as $k) {
			if (!array_key_exists($k, $state)) {
				throw new InvalidStateException('shape', 'missing key ' . $k);
			}
		}
		$worlds = [];
		foreach ((array)$state['worlds'] as $w) {
			$worlds[] = [$w[0], $w[1]];
		}
		$result = $state['result'];
		if (is_array($result)) {
			$result = ['result' => $result['result'] ?? null, 'reason' => $result['reason'] ?? null];
		}
		$copy = [
			'v' => $state['v'],
			'types' => $state['types'],
			'worlds' => $worlds,
			'turn' => $state['turn'],
			'castling' => $state['castling'],
			'ep' => $state['ep'],
			'halfmove' => $state['halfmove'],
			'fullmove' => $state['fullmove'],
			'ply' => $state['ply'],
			'captured' => array_values((array)$state['captured']),
			'history' => array_values((array)$state['history']),
			'result' => $result,
		];
		try {
			return json_encode($copy, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
		} catch (\JsonException $e) {
			throw new InvalidStateException('shape', $e->getMessage());
		}
	}

	/**
	 * Position hash (ER §5.4): FNV-1a-64, 16 lowercase hex digits.
	 *
	 * @param array<string, mixed> $state
	 */
	public function positionHash(array $state): string {
		Core::checkShape($state);
		return Worlds::positionHash($state);
	}

	/**
	 * The result (`{result, reason}`, a copy) or null while the game runs.
	 *
	 * @param array<string, mixed> $state
	 * @return array{result: string, reason: string}|null
	 */
	public function gameResult(array $state): ?array {
		$r = $state['result'] ?? null;
		if (!is_array($r)) {
			return null;
		}
		return ['result' => (string)($r['result'] ?? ''), 'reason' => (string)($r['reason'] ?? '')];
	}

	// ---------------------------------------------------------------- moves

	/**
	 * Every legal move of the side to move in canonical order (ER §4.10), as LegalMove arrays with the keys
	 * `type, from, to, promo?, code, piece, resolution, measured, fallback, capture, happenWeight, outcomes,
	 * successProbability`. Empty when the game is over.
	 *
	 * @param array<string, mixed> $state
	 * @return list<array<string, mixed>>
	 */
	public function generateMoves(array $state): array {
		$a = $this->core->analyse($state);
		if ($a->state['result'] !== null) {
			return [];
		}
		$out = [];
		foreach (Moves::allRecords($a) as $rec) {
			$out[] = Moves::legalOf($rec);
		}
		return $out;
	}

	/**
	 * The canonical codes of every legal move, in order.
	 *
	 * @param array<string, mixed> $state
	 * @return list<string>
	 */
	public function legalCodes(array $state): array {
		$a = $this->core->analyse($state);
		if ($a->state['result'] !== null) {
			return [];
		}
		$out = [];
		foreach (Moves::allRecords($a) as $rec) {
			$out[] = (string)$rec->code;
		}
		return $out;
	}

	/**
	 * Does the side to move have at least one legal move? Stops at the first one.
	 *
	 * @param array<string, mixed> $state
	 */
	public function hasAnyLegalMove(array $state): bool {
		$a = $this->core->analyse($state);
		if ($a->state['result'] !== null) {
			return false;
		}
		if ($a->trapped !== null) {
			return $a->trapped['anyLegal'];
		}
		return Moves::someRecord($a, static fn (): bool => true);
	}

	/**
	 * The LegalMove matching a move array, LegalMove or code (lenient parser, ER §4.12), or null (also on a
	 * piece-letter mismatch). Measure moves match by piece.
	 *
	 * @param array<string, mixed> $state
	 * @param array<string, mixed>|string $move
	 * @return array<string, mixed>|null
	 */
	public function findMove(array $state, array|string $move): ?array {
		$a = $this->core->analyse($state);
		if ($a->state['result'] !== null) {
			return null;
		}
		$r = Moves::resolveMove($a, $move);
		return $r instanceof MoveRecord ? Moves::legalOf($r) : null;
	}

	/**
	 * whyIllegal(...) === null.
	 *
	 * @param array<string, mixed> $state
	 * @param array<string, mixed>|string $move
	 */
	public function isLegal(array $state, array|string $move): bool {
		return $this->whyIllegal($state, $move) === null;
	}

	/**
	 * The first failing reason code of ER §4.11 (one of ILLEGAL_REASONS), or null when the move is legal. Never
	 * throws for a valid state, whatever the move input is. A single move is validated without generating the
	 * full move list.
	 *
	 * @param array<string, mixed> $state
	 */
	public function whyIllegal(array $state, mixed $move): ?string {
		$r = Moves::resolveMove($this->core->analyse($state), $move);
		return is_string($r) ? $r : null;
	}

	/**
	 * Resolve the input or throw (pipeline step A1).
	 */
	private function recordOrThrow(Analysis $a, mixed $move): MoveRecord {
		$r = Moves::resolveMove($a, $move);
		if (is_string($r)) {
			throw new IllegalMoveException($r, $move);
		}
		return $r;
	}

	/**
	 * All possible results of a move (ER §5.6): one entry per outcome of a rolled move (key order), otherwise one
	 * entry with key `certain` or `quantum` and weight T. Entry: `{key, weight, probability, happened, captured,
	 * state}`.
	 *
	 * @param array<string, mixed> $state
	 * @param array<string, mixed>|string $move
	 * @return list<array{key: string, weight: int, probability: float, happened: bool, captured: int|null, state: array<string, mixed>}>
	 * @throws IllegalMoveException
	 */
	public function getOutcomes(array $state, array|string $move): array {
		$a = $this->core->analyse($state);
		$rec = $this->recordOrThrow($a, $move);
		$out = [];
		foreach (Worlds::recordKeys($rec) as $i => $key) {
			$weight = $rec->resolution === 'rolled' ? $rec->outcomes[$i]['weight'] : Tables::T;
			$r = $this->core->applyRecord($a, $rec, $key, true);
			$out[] = [
				'key' => $key,
				'weight' => $weight,
				'probability' => (float)$weight / Tables::TF,
				'happened' => $key !== 'miss',
				'captured' => $r['captured'] >= 0 ? $r['captured'] : null,
				'state' => $r['state'],
			];
		}
		return $out;
	}

	/**
	 * Apply a move (ER §5.1). Never mutates its input.
	 *
	 * Randomness is consulted only for rolled moves (ignored and not validated otherwise), with the precedence
	 * `$outcome` (a forced key; the record then has `u: null`) > `$u` (0 ≤ u < 2^24) > `$rng` (returns a float in
	 * [0, 1); u = floor(r · 2^24)) > `random_int(0, 2^24 − 1)`. Online games pass an explicit `$u` so that it can be
	 * recorded (ER §9.2).
	 *
	 * @param array<string, mixed> $state
	 * @param array<string, mixed>|string $move
	 * @param callable():(float|int)|null $rng
	 * @return array{state: array<string, mixed>, move: array<string, mixed>, measurement: array{key: string, u: int|null, captured: int|null, outcomes: list<array{key: string, weight: int}>, fallback: bool}|null}
	 * @throws IllegalMoveException when the move is illegal (the reason is the whyIllegal code)
	 * @throws \InvalidArgumentException for a bad `$u`, `$outcome` or `$rng` result
	 */
	public function applyMove(array $state, array|string $move, ?int $u = null, ?string $outcome = null, ?callable $rng = null): array {
		$a = $this->core->analyse($state);
		$rec = $this->recordOrThrow($a, $move);
		if ($rec->resolution !== 'rolled') {
			$r = $this->core->applyRecord($a, $rec, $rec->resolution, true);
			return ['state' => $r['state'], 'move' => Moves::legalOf($rec), 'measurement' => null];
		}
		if ($outcome !== null) {
			if (!in_array($outcome, array_column($rec->outcomes, 'key'), true)) {
				throw new \InvalidArgumentException('outcome ' . $outcome . ' is not an outcome of ' . $rec->code);
			}
			$key = $outcome;
			$used = null;
		} else {
			if ($u !== null) {
				if ($u < 0 || $u >= Tables::T) {
					throw new \InvalidArgumentException('u must be an integer with 0 ≤ u < 2^24');
				}
				$used = $u;
			} elseif ($rng !== null) {
				$x = $rng();
				if (!(is_float($x) || is_int($x)) || !is_finite((float)$x) || $x < 0 || $x >= 1) {
					throw new \InvalidArgumentException('rng must return a finite number r with 0 ≤ r < 1');
				}
				$used = (int)floor((float)$x * Tables::TF);
			} else {
				$used = random_int(0, Tables::T - 1);
			}
			$key = self::keyForU($rec->outcomes, $used);
		}
		$r = $this->core->applyRecord($a, $rec, $key, true);
		return [
			'state' => $r['state'],
			'move' => Moves::legalOf($rec),
			'measurement' => [
				'key' => $key,
				'u' => $used,
				'captured' => $r['captured'] >= 0 ? $r['captured'] : null,
				'outcomes' => $rec->outcomes,
				'fallback' => $rec->fallback,
			],
		];
	}

	/**
	 * The outcome key chosen by u (ER §5.2): the first outcome whose cumulative weight exceeds u.
	 *
	 * @param list<array{key: string, weight: int}> $outcomes
	 */
	private static function keyForU(array $outcomes, int $u): string {
		$acc = 0;
		$key = '';
		foreach ($outcomes as $o) {
			$acc += $o['weight'];
			$key = $o['key'];
			if ($u < $acc) {
				break;
			}
		}
		return $key;
	}

	/**
	 * Canonical code of a move array (ER §4.1).
	 *
	 * @param array<string, mixed> $move
	 * @throws \InvalidArgumentException for a malformed move
	 */
	public function moveCode(array $move): string {
		return Parser::moveCode($move);
	}

	/**
	 * Lenient parser (ER §4.12): null, `['castle' => 'O-O'|'O-O-O']`, or `['type', 'from', 'to', 'promo'?,
	 * 'letter'?]` (split targets and merge sources sorted by index, promo lower case, letter K Q R B N only when
	 * given).
	 *
	 * @return array<string, mixed>|null
	 */
	public function parseMoveCode(string $text): ?array {
		return Parser::parse($text);
	}

	/**
	 * Notation of a move played in `$stateBefore` (ER §5.7), e.g. `Bc1xh6 {capture 50%}`, `?Na4 {c4 50%}`,
	 * `Qd4|h5xh8 #`, `Ng1-f3|h3`, `O-O`, `e7-e8=Q`. A rolled move needs its measurement record; the win mark is
	 * derived by replaying the move.
	 *
	 * @param array<string, mixed> $stateBefore
	 * @param array<string, mixed>|string $move
	 * @param array<string, mixed>|null $measurement
	 * @throws IllegalMoveException
	 * @throws \InvalidArgumentException when a rolled move has no matching measurement record
	 */
	public function moveNotation(array $stateBefore, array|string $move, ?array $measurement = null): string {
		$a = $this->core->analyse($stateBefore);
		$rec = $this->recordOrThrow($a, $move);
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
		$after = $this->core->applyRecord($a, $rec, $rec->resolution === 'rolled' ? $key : $rec->resolution, true)['state'];
		$result = $after['result'];
		$won = is_array($result) && in_array($result['reason'] ?? null, Tables::WIN_REASONS, true);
		return $head . $suffix . ($won ? ' #' : '');
	}

	// ---------------------------------------------------------------- squares

	/**
	 * Name of a square index (28 → 'e4').
	 *
	 * @throws \InvalidArgumentException outside 0..63
	 */
	public function squareName(int $index): string {
		if ($index < 0 || $index > 63) {
			throw new \InvalidArgumentException('square index must be 0..63');
		}
		return Tables::$names[$index];
	}

	/**
	 * Index of a square name ('e4' → 28; upper-case files accepted), or -1.
	 */
	public function squareIndex(string $name): int {
		return Tables::$index[strlen($name) === 2 ? strtolower($name[0]) . $name[1] : ''] ?? -1;
	}

	// ---------------------------------------------------------------- views (ER §8)

	/**
	 * @param array<string, mixed> $state
	 */
	public function worldCount(array $state): int {
		return $this->core->analyse($state)->n;
	}

	/**
	 * B(color), 1..8 (ER §3.3).
	 *
	 * @param array<string, mixed> $state
	 */
	public function budget(array $state, string $color): int {
		return $this->core->analyse($state)->budget(self::colorIndex($color));
	}

	/**
	 * For each square: null, or `{piece, type, color, weight, probability}` of its occupant.
	 *
	 * @param array<string, mixed> $state
	 * @return list<array{piece: int, type: string, color: string, weight: int, probability: float}|null>
	 */
	public function squareView(array $state): array {
		return Views::squareView($this->core->analyse($state));
	}

	/**
	 * For each id 0..31: `[{square, weight, probability}]` ascending (empty for captured ids).
	 *
	 * @param array<string, mixed> $state
	 * @return list<list<array{square: int, weight: int, probability: float}>>
	 */
	public function pieceLocations(array $state): array {
		return Views::pieceLocations($this->core->analyse($state));
	}

	/**
	 * What-if view (ER §8) for the piece on `$square`: per square null or `{piece, weight, probability}`. Null
	 * (instead of a list) when the square is certainly empty, as in the JS engine.
	 *
	 * @param array<string, mixed> $state
	 * @return list<array{piece: int, weight: int, probability: float}|null>|null
	 * @throws \InvalidArgumentException outside 0..63
	 */
	public function conditionalView(array $state, int $square): ?array {
		if ($square < 0 || $square > 63) {
			throw new \InvalidArgumentException('square index must be 0..63');
		}
		return Views::conditionalView($this->core->analyse($state), $square);
	}

	/**
	 * Linked pairs `[x, y]` (x < y), sorted.
	 *
	 * @param array<string, mixed> $state
	 * @return list<array{0: int, 1: int}>
	 */
	public function links(array $state): array {
		return Views::links($this->core->analyse($state));
	}

	/**
	 * Connected components of links(), each sorted, ordered by their first id.
	 *
	 * @param array<string, mixed> $state
	 * @return list<list<int>>
	 */
	public function linkGroups(array $state): array {
		return Views::linkGroups($this->links($state));
	}

	/**
	 * kingDanger (ER §8): the weight 0…T with which the opponent could capture `$color`'s king with its best single
	 * move (T = certain danger).
	 *
	 * @param array<string, mixed> $state
	 */
	public function kingDanger(array $state, string $color): int {
		return Core::danger($this->core->analyse($state), self::colorIndex($color));
	}

	/**
	 * moveRisk (ER §8): the probability in [0, 1] that the mover's king can be captured after the move, exactly
	 * `(Σ_o W_o · KD_o) / 2^48`.
	 *
	 * @param array<string, mixed> $state
	 * @param array<string, mixed>|string $move
	 * @throws IllegalMoveException
	 */
	public function moveRisk(array $state, array|string $move): float {
		$a = $this->core->analyse($state);
		return Core::moveRisk($a, $this->recordOrThrow($a, $move));
	}

	/**
	 * kingTrapped (ER §6, E1b).
	 *
	 * @param array<string, mixed> $state
	 */
	public function kingTrapped(array $state): bool {
		$a = $this->core->analyse($state);
		if ($a->state['result'] !== null) {
			return false;
		}
		return Core::trappedInfo($a)['trapped'];
	}

	/**
	 * Display percentage of a weight (ER §8): 0 only for 0, 100 only for T, otherwise 1..99.
	 */
	public function pct(int $weight): int {
		return Views::pct($weight);
	}

	/**
	 * The text form of a roll (ER §9.4), e.g. `Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712
	 * → Moved`. `$labels` may override `miss`, `move`, `capture`, `rolled` and `forced`.
	 *
	 * @param array<string, mixed> $record measurement record
	 * @param array<string, string> $labels
	 * @throws \InvalidArgumentException for a malformed record
	 */
	public function rollDisplay(array $record, array $labels = []): string {
		return RollDisplay::text($record, $labels);
	}

	/**
	 * The numbers behind rollDisplay: `{decimals, intervals: [{key, start, end, startText, endText, chosen}], u,
	 * uText, chosen}`.
	 *
	 * @param array<string, mixed> $record measurement record
	 * @return array{decimals: int, intervals: list<array{key: string, start: int, end: int, startText: string, endText: string, chosen: bool}>, u: int|null, uText: string|null, chosen: string}
	 * @throws \InvalidArgumentException for a malformed record
	 */
	public function rollIntervals(array $record): array {
		return RollDisplay::intervals($record);
	}

	// ---------------------------------------------------------------- setup, record, fair play, LLM

	/**
	 * Build a state from `['state' => …]` or `['fen' => …, 'prelude' => [...]]` (ER Appendix A).
	 *
	 * @param array<string, mixed> $spec
	 * @return array<string, mixed>
	 * @throws SetupException
	 */
	public function setupPosition(array $spec): array {
		return (new Setup($this->core))->setup($spec);
	}

	/**
	 * chain_0 (ER §9.4).
	 *
	 * @throws \InvalidArgumentException for negative numbers
	 */
	public function chainStart(int $gameId, string $whiteUid, string $blackUid, int $createdAt): string {
		if ($gameId < 0 || $createdAt < 0) {
			throw new \InvalidArgumentException('gameId and createdAt must be non-negative integers');
		}
		return hash('sha256', 'qchess-chain|v1|' . $gameId . '|' . $whiteUid . '|' . $blackUid . '|' . $createdAt);
	}

	/**
	 * chain_n (ER §9.4). `$ply` is the state ply before the move; `$u`/`$key` are null (written `-`) for moves
	 * that were not rolled (`$u` also for forced outcomes).
	 *
	 * @throws \InvalidArgumentException for negative numbers
	 */
	public function chainNext(string $prev, int $ply, string $code, ?int $u, ?string $key, string $canonicalStateJsonAfter): string {
		if ($ply < 0 || ($u !== null && $u < 0)) {
			throw new \InvalidArgumentException('ply and u must be non-negative integers');
		}
		return hash('sha256', $prev . '|' . $ply . '|' . $code . '|' . ($u === null ? '-' : (string)$u) . '|'
			. ($key ?? '-') . '|' . hash('sha256', $canonicalStateJsonAfter));
	}

	/**
	 * Roll-memo identity (ER §9.3): `ply/positionHash/code without =Q|=R|=B|=N`.
	 *
	 * @param array<string, mixed> $stateBefore
	 */
	public function rollIdentity(array $stateBefore, string $code): string {
		return (int)$stateBefore['ply'] . '/' . $this->positionHash($stateBefore) . '/' . Parser::stripPromo($code);
	}

	/**
	 * Fair-play support key (ER App. D): `turn|` + 64 type letters (upper case White) or `.`.
	 *
	 * @param array<string, mixed> $state
	 */
	public function supportKey(array $state): string {
		return Views::supportKey($this->core->analyse($state));
	}

	/**
	 * The colour mirror of the support key (ranks flipped, colours and turn swapped).
	 *
	 * @param array<string, mixed> $state
	 */
	public function supportKeyMirror(array $state): string {
		return Views::supportKeyMirror($this->core->analyse($state));
	}

	/**
	 * FEN of the certain pieces only (ghosts removed), with the state's turn, castling, ep and clocks.
	 *
	 * @param array<string, mixed> $state
	 */
	public function certainFen(array $state): string {
		return Views::certainFen($this->core->analyse($state));
	}

	/**
	 * The POSITION block of an LLM prompt (ER Appendix B) for the model playing `$perspective` ('w' or 'b'):
	 * header, certain FEN, uncertain pieces with percentages, links in words, possibilities, budgets and king
	 * danger. It does not list legal moves. Plain ASCII English, well under 4 KB.
	 *
	 * @param array<string, mixed> $state
	 * @throws \InvalidArgumentException for a perspective other than 'w' or 'b'
	 */
	public function describeForLlm(array $state, string $perspective): string {
		self::colorIndex($perspective);
		return Describer::describe($this->core->analyse($state), $perspective);
	}

	/**
	 * 'w' → 0, 'b' → 1.
	 *
	 * @throws \InvalidArgumentException
	 */
	private static function colorIndex(string $color): int {
		if ($color === 'w') {
			return 0;
		}
		if ($color === 'b') {
			return 1;
		}
		throw new \InvalidArgumentException('colour must be w or b');
	}
}
