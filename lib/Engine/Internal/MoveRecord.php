<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Internal move record: everything the pipeline needs about one legal move in one state. Its public face is the
 * LegalMove array of §4.10 ({@see MoveRecord::legalOf()}).
 *
 * JavaScript twin: src/engine/moveRecord.js. Section numbers (§) refer to docs/engine-rules.md.
 *
 * @internal
 *
 * @psalm-import-type LegalMove from \OCA\QuantumChess\Engine\Engine
 */
final class MoveRecord {
	/** Per-world outcome of a standard move or merge (§4.3): the move did not happen. */
	public const MISS = 0;
	/** Per-world outcome: the piece moved to an empty square. */
	public const MOVE = 1;
	/** Per-world outcome: the piece captured on its target square. */
	public const CAPTURE = 2;
	/** Promotion letter → the promotion index of the §4.10 sort tuple. */
	public const PROMO_INDEX = ['q' => 1, 'r' => 2, 'b' => 3, 'n' => 4];
	/** Promotion letters in tuple order. */
	public const PROMOS = ['q', 'r', 'b', 'n'];

	/** Move type: 'standard', 'split', 'merge' or 'measure'. */
	public string $kind = 'standard';
	/** Moving piece id. */
	public int $X = 0;
	/** Colour index of the mover (0 White, 1 Black). */
	public int $ci = 0;
	/** Type code of the mover. */
	public int $type = 0;
	/** Board letter of the mover. */
	public string $letter = 'A';
	/** From square (merge: the lower source; Measure: the lowest square of the piece). */
	public int $f = -1;
	/** To square (split: the lower target; Measure: -1). */
	public int $t = -1;
	/** Merge: the higher source, otherwise -1. */
	public int $f2 = -1;
	/** Split: the higher target, otherwise -1. */
	public int $t2 = -1;
	/** Promotion letter ('q', 'r', 'b', 'n') or null. */
	public ?string $promo = null;
	/**
	 * The castling table entry of a castling move, otherwise null.
	 *
	 * @var array{
	 *     flag: string,
	 *     king: int,
	 *     from: int,
	 *     to: int,
	 *     rook: int,
	 *     rookFrom: int,
	 *     rookTo: int,
	 *     empty: list<int>,
	 * }|null
	 */
	public ?array $castle = null;
	/** Pawn move kind: 'push', 'double', 'diagonal', or null for other pieces. */
	public ?string $pawn = null;
	/** The move is an en-passant capture. */
	public bool $ep = false;
	/** @var list<int>|null lane squares that may be occupied (null: the lane is certainly clear) */
	public ?array $laneOcc = null;
	/** @var list<int>|null merge: the same for the lane from the higher source */
	public ?array $laneOcc2 = null;
	/** @var list<int>|null split: lane-clear flag of child 1 per world of onF */
	public ?array $flags1 = null;
	/** @var list<int>|null split: lane-clear flag of child 2 per world of onF */
	public ?array $flags2 = null;
	/** @var list<int>|null split: indices of the worlds with the piece on f */
	public ?array $onF = null;
	/** The move is in the measured class (§4.5): its outcomes are rolled when there are several. */
	public bool $inM = false;
	/** Total weight of the worlds in which the move misses. */
	public int $wMiss = 0;
	/** Total weight of the worlds in which the piece moves without capturing. */
	public int $wMove = 0;
	/** Total weight of the worlds in which the piece captures. */
	public int $wCap = 0;
	/** The piece a capture outcome takes, or -1. */
	public int $captureId = -1;
	/** Rolled only because the unmeasured result would exceed the budget (§4.5). */
	public bool $fallback = false;
	/** How the move resolves: 'certain', 'quantum' or 'rolled'. */
	public string $resolution = 'certain';
	/** @var list<array{key: string, weight: int}> the outcomes in key order */
	public array $outcomes = [];
	/** Total weight of the worlds in which the move happens. */
	public int $happenWeight = 0;
	/** @var list<int> the `from` squares of the LegalMove */
	public array $from = [];
	/** @var list<int> the `to` squares of the LegalMove */
	public array $to = [];
	/** The §4.10 sort tuple as one integer. */
	public int $sortKey = 0;
	/** The canonical code, once known. */
	public ?string $code = null;
	/** @var LegalMove|null the public LegalMove, built once */
	public ?array $legal = null;
	/** The cached moveRisk, null until computed. */
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
		$r->sortKey = ($this->f * 64 + $this->t) * 64 + self::PROMO_INDEX[$promo];
		return $r;
	}

	/**
	 * The canonical code of a record (§4.1).
	 */
	public static function recCode(MoveRecord $rec): string {
		$names = Tables::$names;
		switch ($rec->kind) {
			case 'standard':
				return $names[$rec->f] . '-' . $names[$rec->t]
					. ($rec->promo === null ? '' : '=' . strtoupper($rec->promo));
			case 'split':
				return $names[$rec->f] . '-' . $names[$rec->t] . '|' . $names[$rec->t2];
			case 'merge':
				return $names[$rec->f] . '|' . $names[$rec->f2] . '-' . $names[$rec->t];
			default:
				return '?' . $names[$rec->f];
		}
	}

	/**
	 * The public LegalMove of a record (§4.10), keys in order, built once.
	 *
	 * @return LegalMove
	 */
	public static function legalOf(MoveRecord $rec): array {
		if ($rec->legal !== null) {
			return $rec->legal;
		}
		$m = ['type' => $rec->kind, 'from' => $rec->from, 'to' => $rec->to];
		if ($rec->promo !== null) {
			$m['promo'] = $rec->promo;
		}
		$m['code'] = self::recCode($rec);
		$m['piece'] = $rec->X;
		$m['resolution'] = $rec->resolution;
		$m['measured'] = $rec->resolution === 'rolled';
		$m['fallback'] = $rec->fallback;
		$m['capture'] = $rec->wCap > 0;
		$m['happenWeight'] = $rec->happenWeight;
		$m['outcomes'] = $rec->outcomes;
		$m['successProbability'] = (float)$rec->happenWeight / Tables::TF;
		$rec->legal = $m;
		$rec->code = $m['code'];
		return $m;
	}
}
