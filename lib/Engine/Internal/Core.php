<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

use OCA\QuantumChess\Engine\InvalidStateException;

/**
 * The move pipeline (ENGINE-RULES §5.1 A2–A9), the end checks (§6) with E1b, and a small per-state analysis cache.
 * Mirrors src/engine/apply.js and danger.js.
 *
 * JavaScript caches derived data per state object (WeakMap). PHP arrays are values, so the cache is keyed by the
 * state's exact JSON: a hit is always the same state, never a look-alike.
 *
 * @internal
 */
final class Core {
	private const CACHE_SIZE = 12;

	/** @var array<string, Analysis> */
	private array $analyses = [];
	/** @var array<string, array{0: array{result: string, reason: string}|null, 1: Analysis}> end checks per new state */
	private array $ends = [];

	/**
	 * The analysis of a state (cached).
	 *
	 * @param array<string, mixed> $state a valid engine state
	 * @throws InvalidStateException when the input is not shaped like a state
	 */
	public function analyse(array $state): Analysis {
		$key = self::keyOf($state);
		if (isset($this->analyses[$key])) {
			$a = $this->analyses[$key];
			// Keep recently used entries at the end (LRU).
			unset($this->analyses[$key]);
			$this->analyses[$key] = $a;
			return $a;
		}
		$a = new Analysis($state);
		$this->remember($key, $a);
		return $a;
	}

	/**
	 * Cache key of a state: its exact JSON (after a cheap shape check).
	 *
	 * @param array<string, mixed> $state
	 */
	private static function keyOf(array $state): string {
		self::checkShape($state);
		try {
			return json_encode($state, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
		} catch (\JsonException $e) {
			throw new InvalidStateException('shape', 'not an engine state: ' . $e->getMessage());
		}
	}

	/**
	 * A cheap shape check of a state (types of the fields every function reads). Untrusted input still needs the
	 * full validator.
	 *
	 * @param array<string, mixed> $state
	 * @throws InvalidStateException
	 */
	public static function checkShape(array $state): void {
		$worlds = $state['worlds'] ?? null;
		$types = $state['types'] ?? null;
		$turn = $state['turn'] ?? null;
		if (!is_array($worlds) || $worlds === [] || count($worlds) > Tables::MAX_WORLDS || !is_string($types) || strlen($types) !== 32
			|| ($turn !== 'w' && $turn !== 'b') || !is_string($state['castling'] ?? null) || !is_string($state['ep'] ?? null)
			|| !array_key_exists('result', $state) || !is_int($state['ply'] ?? null)) {
			throw new InvalidStateException('shape', 'not an engine state (check untrusted input with validateState first)');
		}
		foreach ($worlds as $w) {
			if (!is_array($w) || !is_string($w[0] ?? null) || strlen($w[0]) !== 64 || !is_int($w[1] ?? null)) {
				throw new InvalidStateException('shape', 'not an engine state (check untrusted input with validateState first)');
			}
		}
	}

	private function remember(string $key, Analysis $a): void {
		$this->analyses[$key] = $a;
		if (count($this->analyses) > self::CACHE_SIZE) {
			unset($this->analyses[array_key_first($this->analyses)]);
		}
	}

	/**
	 * Steps A2–A9 for a legal record and a chosen outcome key.
	 *
	 * @param string $key outcome key for a rolled move, or the resolution (`certain`/`quantum`) otherwise
	 * @param bool $endChecks run A9 (false inside a setup prelude)
	 * @return array{state: array<string, mixed>, key: string, captured: int}
	 */
	public function applyRecord(Analysis $a, MoveRecord $rec, string $key, bool $endChecks): array {
		$prev = $a->state;
		// A2, A3
		[$boards, $weights, $total] = Worlds::outcomeBoards($a, $rec, $key);
		// A4, A5
		$worlds = Worlds::canonical($boards, $weights);
		// A6
		if ($total < Tables::T) {
			$w = Worlds::rescale(array_column($worlds, 1));
			foreach ($worlds as $i => $world) {
				$worlds[$i] = [$world[0], $w[$i]];
			}
		}
		// The key that bookkeeping sees: the rolled key, or the single outcome of a certain move.
		$realised = $key;
		if ($rec->resolution === 'certain') {
			$realised = count($rec->outcomes) === 1 ? $rec->outcomes[0]['key'] : 'move';
		}
		$captured = $realised === 'capture' ? $rec->captureId : -1;
		// A7
		$types = Worlds::typesAfter((string)$prev['types'], $rec, $realised);
		$castling = Worlds::castlingAfter((string)$prev['castling'], $worlds);
		$ep = Worlds::epAfter($rec, $realised, $worlds, $types);
		$halfmove = Worlds::halfmoveAfter((int)$prev['halfmove'], $rec, $realised);
		$fullmove = $prev['turn'] === 'b' ? (int)$prev['fullmove'] + 1 : (int)$prev['fullmove'];
		$ply = (int)$prev['ply'] + 1;
		$turn = $prev['turn'] === 'w' ? 'b' : 'w';
		/** @var list<int> $capturedList */
		$capturedList = array_values((array)$prev['captured']);
		if ($captured >= 0) {
			$capturedList[] = $captured;
		}
		// A8
		$h = Worlds::hash($turn, $castling, $ep, $types, $worlds);
		if ($halfmove === 0) {
			$history = [$h];
		} else {
			/** @var list<string> $history */
			$history = array_values((array)$prev['history']);
			$history[] = $h;
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
			'captured' => $capturedList,
			'history' => $history,
			'result' => null,
		];
		// A9
		if ($endChecks) {
			$state['result'] = $this->endResult($state, (string)$prev['turn'], $captured);
		}
		return ['state' => $state, 'key' => $realised, 'captured' => $captured];
	}

	/**
	 * The end checks E1–E6 (§6) of a new state whose result is still null. Remembers the analysis of the new state
	 * (the E1b and danger work is reused by later calls on it, such as views or a notation replay).
	 *
	 * @param array<string, mixed> $state new state, result null
	 * @param string $mover the side that just moved
	 * @return array{result: string, reason: string}|null
	 */
	private function endResult(array $state, string $mover, int $captured): ?array {
		$win = $mover === 'w' ? '1-0' : '0-1';
		// E1
		if ($captured === 0 || $captured === 16) {
			return ['result' => $win, 'reason' => 'king_captured'];
		}
		$key = self::keyOf($state);
		if (isset($this->ends[$key])) {
			[$result, $na] = $this->ends[$key];
		} else {
			$na = $this->analyses[$key] ?? new Analysis($state);
			$result = $this->endChecks($na, $mover);
			$this->ends[$key] = [$result, $na];
			if (count($this->ends) > self::CACHE_SIZE) {
				unset($this->ends[array_key_first($this->ends)]);
			}
		}
		if ($result === null) {
			$this->remember($key, $na);
		} else {
			$final = $state;
			$final['result'] = $result;
			$fa = clone $na;
			$fa->state = $final;
			$fa->moves = null;
			$fa->recs = null;
			$fa->trapped = null;
			$this->remember(self::keyOf($final), $fa);
		}
		return $result;
	}

	/**
	 * E1b–E6 on the analysis of the new state.
	 *
	 * @return array{result: string, reason: string}|null
	 */
	private function endChecks(Analysis $na, string $mover): ?array {
		$state = $na->state;
		$win = $mover === 'w' ? '1-0' : '0-1';
		// E1b
		$info = self::trappedInfo($na);
		if ($info['trapped']) {
			return ['result' => $win, 'reason' => 'king_trapped'];
		}
		// D18: E2–E4 yield to a certain king capture by the side to move.
		$moverCi = $mover === 'w' ? 0 : 1;
		$pending = null;
		$kingCapturePending = static function () use (&$pending, $na, $moverCi): bool {
			if ($pending === null) {
				$pending = self::danger($na, $moverCi) === Tables::T;
			}
			return $pending;
		};
		// E2
		if (count((array)$state['captured']) === 30 && !$kingCapturePending()) {
			return ['result' => '1/2-1/2', 'reason' => 'bare_kings'];
		}
		// E3
		/** @var list<string> $history */
		$history = (array)$state['history'];
		$h = end($history);
		$count = 0;
		foreach ($history as $x) {
			if ($x === $h) {
				$count++;
			}
		}
		if ($count >= Tables::REPETITION_COUNT && !$kingCapturePending()) {
			return ['result' => '1/2-1/2', 'reason' => 'repetition'];
		}
		// E4
		if ((int)$state['halfmove'] >= Tables::FIFTY_MOVE_PLIES && !$kingCapturePending()) {
			return ['result' => '1/2-1/2', 'reason' => 'fifty_moves'];
		}
		// E5
		if ((int)$state['ply'] >= Tables::MAX_PLY) {
			return ['result' => '1/2-1/2', 'reason' => 'max_ply'];
		}
		// E6
		if (!$info['anyLegal']) {
			return ['result' => '1/2-1/2', 'reason' => 'no_moves'];
		}
		return null;
	}

	/**
	 * kingDanger on an analysis (cached).
	 */
	public static function danger(Analysis $a, int $ci): int {
		if ($a->danger[$ci] < 0) {
			$a->danger[$ci] = Danger::of($a->boards, $a->weights, $a->typeCodes, $ci);
		}
		return $a->danger[$ci];
	}

	/**
	 * Does the (legal) record, in any of its outcomes, avoid leaving the mover's king certainly capturable (or end
	 * the game at once by capturing the enemy king)? Used by E1b.
	 */
	private static function escapes(Analysis $a, MoveRecord $rec): bool {
		$enemyKing = $a->ci === 0 ? 16 : 0;
		foreach (Worlds::recordKeys($rec) as $key) {
			if ($rec->captureId === $enemyKing && Worlds::outcomeCaptures($rec, $key)) {
				return true;
			}
			[$boards, $weights, $total] = Worlds::outcomeBoards($a, $rec, $key);
			if (Danger::of($boards, $weights, $a->typeCodes, $a->ci) < $total) {
				return true;
			}
		}
		return false;
	}

	/**
	 * E1b details (§6): whether the side to move is trapped and whether it has any legal move. Cached.
	 *
	 * When the mover's king is certainly capturable after a reply, the side to move there has a certain king
	 * capture, so E2–E4 are suspended (D18) and E6 cannot fire; only E1 (the reply captured the enemy king) or E5
	 * (ply limit) could end the game. The test is therefore exactly: no reply reaches the ply limit, captures the
	 * enemy king, or leaves kingDanger below T. Outcome states are never built in full.
	 *
	 * @return array{trapped: bool, anyLegal: bool}
	 */
	public static function trappedInfo(Analysis $a): array {
		if ($a->trapped !== null) {
			return $a->trapped;
		}
		if ($a->state['result'] !== null) {
			$info = ['trapped' => false, 'anyLegal' => false];
		} elseif ((int)$a->state['ply'] + 1 >= Tables::MAX_PLY) {
			// Every reply ends the game by E5, which is an escape.
			$info = ['trapped' => false, 'anyLegal' => Moves::someRecord($a, static fn (): bool => true)];
		} else {
			$anyLegal = false;
			$escaped = Moves::someRecord($a, static function (MoveRecord $rec) use (&$anyLegal, $a): bool {
				$anyLegal = true;
				return self::escapes($a, $rec);
			}, true);
			$info = ['trapped' => $anyLegal && !$escaped, 'anyLegal' => $anyLegal];
		}
		$a->trapped = $info;
		return $info;
	}

	/**
	 * moveRisk(s, m) (§8): Σ over the outcomes of W_o · (0 if o captures the enemy king, else kingDanger(state_o,
	 * mover)), divided by 2^48. Exact: the numerator is an integer ≤ 2^48.
	 */
	public static function moveRisk(Analysis $a, MoveRecord $rec): float {
		if ($rec->risk !== null) {
			return $rec->risk;
		}
		if (self::unaffectedDanger($a, $rec)) {
			$rec->risk = (float)self::danger($a, $a->ci) / Tables::TF;
			return $rec->risk;
		}
		$enemyKing = $a->ci === 0 ? 16 : 0;
		$num = 0;
		foreach (Worlds::recordKeys($rec) as $i => $key) {
			$W = $rec->resolution === 'rolled' ? $rec->outcomes[$i]['weight'] : Tables::T;
			if ($rec->captureId === $enemyKing && Worlds::outcomeCaptures($rec, $key)) {
				continue;
			}
			[$boards, $weights, $total] = Worlds::outcomeBoards($a, $rec, $key);
			$D = Danger::of($boards, $weights, $a->typeCodes, $a->ci);
			if ($total < Tables::T && $D > 0) {
				if ($D === $total) {
					$D = Tables::T;
				} else {
					// Partial danger after a roll: measure it on the exact rescaled state (§5.3).
					$worlds = Worlds::canonical($boards, $weights);
					$D = Danger::of(array_column($worlds, 0), Worlds::rescale(array_column($worlds, 1)), $a->typeCodes, $a->ci);
				}
			}
			$num += $W * $D;
		}
		$rec->risk = (float)$num / Tables::T2F;
		return $rec->risk;
	}

	/**
	 * Can this move leave the mover's king danger unchanged for sure? True for a move that is not rolled, captures
	 * nothing, does not move the king and touches no square on a line through the mover's king.
	 */
	private static function unaffectedDanger(Analysis $a, MoveRecord $rec): bool {
		if ($rec->resolution === 'rolled' || $rec->wCap > 0 || $rec->type === Tables::TYPE_K) {
			return false;
		}
		$kingLoc = $a->locs[$a->ci === 0 ? 0 : 16];
		if ($kingLoc === []) {
			return false;
		}
		$k = $kingLoc[0];
		foreach ([$rec->f, $rec->t, $rec->f2, $rec->t2] as $s) {
			if ($s >= 0 && isset(Tables::$dirOf[$k * 64 + $s])) {
				return false;
			}
		}
		return true;
	}
}
