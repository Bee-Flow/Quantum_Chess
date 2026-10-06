<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * What one search of the escape rule remembers (`EscapeSearch` of src/variants/core/quantum.js): the side that must
 * escape, the side that moves next, whether facts of single worlds may decide (`free`; `fast` is always true for
 * these variants), the classical moves applied so far and the facts per world, both by object identity as in
 * JavaScript.
 *
 * @internal
 */
final class EscapeSearch {
	/** @var \WeakMap<Move, World> */
	private \WeakMap $applied;
	/** @var \WeakMap<World, WorldFacts> */
	public \WeakMap $facts;

	/**
	 * @param int $d the side to move, which must escape
	 * @param int $e the side that moves after it
	 * @param bool $free whether an outcome where `e` takes a royal piece for certain can end only by `worldResult`
	 */
	public function __construct(
		public int $d,
		public int $e,
		public bool $free,
	) {
		/** @var \WeakMap<Move, World> */
		$this->applied = new \WeakMap();
		/** @var \WeakMap<World, WorldFacts> */
		$this->facts = new \WeakMap();
	}

	/**
	 * `applyClassical`, remembered per move object (`apply` of the search).
	 */
	public function apply(World $b, Move $m): World {
		$next = $this->applied[$m] ?? null;
		if ($next === null) {
			$next = World::applyClassical($b, $m);
			$this->applied[$m] = $next;
		}
		return $next;
	}
}
