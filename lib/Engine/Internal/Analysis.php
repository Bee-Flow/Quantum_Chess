<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Derived data of one state (§3.1, §3.3): occupancy, marginal weights, locations, projections. Assumes a valid
 * state (untrusted input goes through the validator first).
 *
 * The lazily filled fields are caches for this state only; states are immutable by contract.
 *
 * JavaScript twin: src/engine/analysis.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 */
final class Analysis {
	/** @var array<string, mixed> the analysed state */
	public array $state;
	public int $n;
	/** @var list<string> boards in canonical order */
	public array $boards;
	/** @var list<int> weights in canonical order */
	public array $weights;
	/** @var array<int, int> occupant id per square 0..63, -1 for none (§3.1 occ) */
	public array $occ;
	/** @var array<int, int> W(occ(s)@s) per square 0..63, 0 for none */
	public array $occW;
	/** @var array<int, list<int>> loc(X) per id 0..31, ascending */
	public array $locs;
	/** @var array<int, list<int>> W(X@s) per id 0..31, parallel to locs */
	public array $locW;
	/** @var array<int, int> type code per id 0..31 */
	public array $typeCodes;
	/** Colour index of the side to move (0 White, 1 Black). */
	public int $ci;
	/** En-passant square index, or -1. */
	public int $ep;

	/** @var array<int, list<int>> X's square in every world, per id */
	public array $pos = [];
	/** @var array<int, array{0: int, 1: list<int>}> own-projection classes per colour index */
	public array $proj = [];
	/** @var array<int, array{0: int, 1: list<int>}> projection classes without X, per id */
	public array $rest = [];
	/** @var list<MoveRecord>|null all legal records in canonical order */
	public ?array $moves = null;
	/** @var array<string, MoveRecord>|null records by canonical code */
	public ?array $recs = null;
	/** @var array<int, int> cached kingDanger per colour index (0 and 1), -1 when unknown */
	public array $danger = [-1, -1];
	/** @var array{trapped: bool, anyLegal: bool}|null cached E1b information */
	public ?array $trapped = null;

	/**
	 * @param array<string, mixed> $state a valid engine state
	 */
	public function __construct(array $state) {
		Tables::init();
		$this->state = $state;
		/** @var list<array{0: string, 1: int}> $worlds */
		$worlds = $state['worlds'];
		$n = count($worlds);
		$boards = [];
		$weights = [];
		foreach ($worlds as $w) {
			$boards[] = $w[0];
			$weights[] = $w[1];
		}
		$this->n = $n;
		$this->boards = $boards;
		$this->weights = $weights;

		// Squares where some board differs from the first one; every other square is the same in all worlds.
		$b0 = $boards[0];
		$diff = [];
		for ($i = 1; $i < $n; $i++) {
			$x = $b0 ^ $boards[$i];
			$p = strspn($x, "\0");
			while ($p < 64) {
				$diff[$p] = true;
				$p += 1 + strspn($x, "\0", $p + 1);
			}
		}
		$idOf = Tables::$idOf;
		$occ = array_fill(0, 64, -1);
		$occW = array_fill(0, 64, 0);
		for ($s = 0; $s < 64; $s++) {
			if (!isset($diff[$s])) {
				$c = $b0[$s];
				if ($c !== '.') {
					$occ[$s] = $idOf[$c] ?? -1;
					$occW[$s] = Tables::T;
				}
				continue;
			}
			$sum = 0;
			$id = -1;
			for ($i = 0; $i < $n; $i++) {
				$c = $boards[$i][$s];
				if ($c !== '.') {
					$sum += $weights[$i];
					if ($id < 0) {
						$id = $idOf[$c] ?? -1;
					}
				}
			}
			$occ[$s] = $id;
			$occW[$s] = $sum;
		}
		$this->occ = $occ;
		$this->occW = $occW;

		$locs = array_fill(0, 32, []);
		$locW = array_fill(0, 32, []);
		for ($s = 0; $s < 64; $s++) {
			$id = $occ[$s];
			if ($id >= 0) {
				$locs[$id][] = $s;
				$locW[$id][] = $occW[$s];
			}
		}
		$this->locs = $locs;
		$this->locW = $locW;

		$types = (string)$state['types'];
		$typeCodes = [];
		for ($id = 0; $id < 32; $id++) {
			$typeCodes[] = Tables::TYPE_CODE[$types[$id]] ?? Tables::TYPE_P;
		}
		$this->typeCodes = $typeCodes;
		$this->ci = $state['turn'] === 'w' ? 0 : 1;
		$this->ep = $state['ep'] === '-' ? -1 : (Tables::$index[(string)$state['ep']] ?? -1);
	}

	/**
	 * X's square in every world. Cached.
	 *
	 * @return list<int>
	 */
	public function positions(int $id): array {
		if (isset($this->pos[$id])) {
			return $this->pos[$id];
		}
		$loc = $this->locs[$id];
		$count = count($loc);
		if ($count === 1) {
			$p = array_fill(0, $this->n, $loc[0]);
		} elseif ($count === 0) {
			$p = array_fill(0, $this->n, -1);
		} else {
			$ch = Tables::$letter[$id];
			$p = [];
			foreach ($this->boards as $b) {
				$at = -1;
				foreach ($loc as $s) {
					if ($b[$s] === $ch) {
						$at = $s;
						break;
					}
				}
				$p[] = $at;
			}
		}
		$this->pos[$id] = $p;
		return $p;
	}

	/**
	 * Superposed live pieces of a colour, ascending id.
	 *
	 * @return list<int>
	 */
	public function superposedIds(int $ci): array {
		$out = [];
		$base = $ci * 16;
		for ($id = $base; $id < $base + 16; $id++) {
			if (count($this->locs[$id]) > 1) {
				$out[] = $id;
			}
		}
		return $out;
	}

	/**
	 * Class the worlds by the squares of a set of pieces: the class count and a class per world.
	 *
	 * @param list<int> $ids superposed piece ids
	 * @return array{0: int, 1: list<int>}
	 */
	public function classify(array $ids): array {
		if ($ids === []) {
			return [1, array_fill(0, $this->n, 0)];
		}
		$ps = [];
		foreach ($ids as $id) {
			$ps[] = $this->positions($id);
		}
		$map = [];
		$cls = [];
		for ($i = 0; $i < $this->n; $i++) {
			$key = '';
			foreach ($ps as $p) {
				$key .= chr(48 + $p[$i]);
			}
			if (!isset($map[$key])) {
				$map[$key] = count($map);
			}
			$cls[] = $map[$key];
		}
		return [count($map), $cls];
	}

	/**
	 * Own-projection classes of colour ci (§3.3): B(c) is the count. Cached.
	 *
	 * @return array{0: int, 1: list<int>}
	 */
	public function projection(int $ci): array {
		if (!isset($this->proj[$ci])) {
			$this->proj[$ci] = $this->classify($this->superposedIds($ci));
		}
		return $this->proj[$ci];
	}

	/**
	 * Projection classes of X's colour without X ("rest classes"), used to count B after a move of X. Cached.
	 *
	 * @return array{0: int, 1: list<int>}
	 */
	public function restClasses(int $id): array {
		if (!isset($this->rest[$id])) {
			$ids = [];
			foreach ($this->superposedIds($id < 16 ? 0 : 1) as $x) {
				if ($x !== $id) {
					$ids[] = $x;
				}
			}
			$this->rest[$id] = $this->classify($ids);
		}
		return $this->rest[$id];
	}

	/**
	 * B(c) of colour index ci (§3.3).
	 */
	public function budget(int $ci): int {
		return $this->projection($ci)[0];
	}
}
