<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Internal move record: everything the pipeline needs about one legal move in one state. Its public face is the
 * LegalMove array of ENGINE-RULES §4.10 ({@see Moves::legalOf()}). Mirrors the JS MoveRecord.
 *
 * @internal
 */
final class MoveRecord {
	/** 'standard', 'split', 'merge' or 'measure' */
	public string $kind = 'standard';
	/** Moving piece id. */
	public int $X = 0;
	/** Colour index of the mover. */
	public int $ci = 0;
	/** Type code of the mover. */
	public int $type = 0;
	/** Board letter of the mover. */
	public string $letter = 'A';
	/** From square (merge: the lower source; measure: min loc(X)). */
	public int $f = -1;
	/** To square (split: the lower target). */
	public int $t = -1;
	/** Merge: the higher source. */
	public int $f2 = -1;
	/** Split: the higher target. */
	public int $t2 = -1;
	public ?string $promo = null;
	/** @var array{flag: string, king: int, from: int, to: int, rook: int, rookFrom: int, rookTo: int, empty: list<int>}|null */
	public ?array $castle = null;
	/** Pawn move kind: 'push', 'double', 'diagonal' or null. */
	public ?string $pawn = null;
	/** En-passant capture. */
	public bool $ep = false;
	/** @var list<int>|null possibly occupied lane squares (null: certainly clear) */
	public ?array $laneOcc = null;
	/** @var list<int>|null merge: lane from the higher source */
	public ?array $laneOcc2 = null;
	/** @var list<int>|null split: lane-clear flag of child 1 per world of onF */
	public ?array $flags1 = null;
	/** @var list<int>|null split: lane-clear flag of child 2 per world of onF */
	public ?array $flags2 = null;
	/** @var list<int>|null split: indices of the worlds with X on f */
	public ?array $onF = null;
	public bool $inM = false;
	public int $wMiss = 0;
	public int $wMove = 0;
	public int $wCap = 0;
	/** Captured id of a capture outcome, or -1. */
	public int $captureId = -1;
	public bool $fallback = false;
	/** 'certain', 'quantum' or 'rolled'. */
	public string $resolution = 'certain';
	/** @var list<array{key: string, weight: int}> */
	public array $outcomes = [];
	public int $happenWeight = 0;
	/** @var list<int> */
	public array $from = [];
	/** @var list<int> */
	public array $to = [];
	/** The §4.10 tuple as one integer. */
	public int $sortKey = 0;
	public ?string $code = null;
	/** @var array<string, mixed>|null the public LegalMove, built once */
	public ?array $legal = null;
	public ?float $risk = null;

	/**
	 * A copy with another promotion piece (the four promotions have identical weights).
	 */
	public function withPromo(string $promo): self {
		$r = clone $this;
		$r->promo = $promo;
		$r->code = null;
		$r->legal = null;
		$r->risk = null;
		$r->sortKey = ($this->f * 64 + $this->t) * 64 + Moves::PROMO_INDEX[$promo];
		return $r;
	}
}
