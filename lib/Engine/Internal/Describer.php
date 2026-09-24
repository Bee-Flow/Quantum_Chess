<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * The POSITION block of an LLM prompt (Appendix B): header, certain FEN, uncertain pieces with percentages, links in
 * words, possibilities, budgets and king danger. English only: it is model input, not UI copy. Legal moves are
 * listed by the prompt builder, not here.
 *
 * JavaScript counterpart: src/engine/describe.js. It implements the same appendix, but the two are not a parity
 * pair. The header, FEN, uncertain-piece, possibilities and game-over lines are byte-identical; the differences are:
 *
 * - The link line names the most strongly correlated squares (the JavaScript helper names the most likely joint
 *   placement, which can be as likely as without the link and then says nothing about it). At most 12 links are
 *   written out; the rest is counted.
 * - The block is capped at 4096 bytes: link texts are dropped until it fits.
 * - The JavaScript helper also lists the legal moves and split targets; this block does not.
 * - The model's colour is required here and optional in JavaScript (the side to move).
 *
 * Appendix letters refer to docs/engine-rules.md.
 *
 * @internal
 */
final class Describer {
	private const TYPE_NAMES = [
		'k' => 'king',
		'q' => 'queen',
		'r' => 'rook',
		'b' => 'bishop',
		'n' => 'knight',
		'p' => 'pawn',
	];

	/** At most this many links are written out; the rest is counted. */
	private const MAX_LINKS = 12;

	/** Size limit of the block: it must stay well within an LLM prompt. */
	private const MAX_BYTES = 4096;

	private static function pieceName(string $types, int $id, bool $lower = false): string {
		$color = $id < 16 ? 'White' : 'Black';
		return ($lower ? strtolower($color) : $color) . ' ' . self::TYPE_NAMES[$types[$id]];
	}

	private static function side(string $c): string {
		return $c === 'w' ? 'White' : 'Black';
	}

	/**
	 * @param string $perspective 'w' or 'b': the colour the model plays
	 */
	public static function describe(Analysis $a, string $perspective): string {
		$state = $a->state;
		$types = (string)$state['types'];
		$names = Tables::$names;
		$lines = [];
		$lines[] = 'Quantum Chess (rules v1). You are ' . self::side($perspective) . '. Move ' . $state['fullmove']
			. ', ' . self::side((string)$state['turn']) . ' to move.';
		$lines[] = 'Certain pieces (FEN, uncertain pieces removed): ' . Views::certainFen($a);
		$ghosts = [];
		for ($id = 0; $id < 32; $id++) {
			if (count($a->locs[$id]) > 1) {
				$parts = [];
				foreach ($a->locs[$id] as $j => $s) {
					$parts[] = $names[$s] . ' ' . Views::pct($a->locW[$id][$j]) . '%';
				}
				$ghosts[] = '- ' . self::pieceName($types, $id) . ': ' . implode(', ', $parts);
			}
		}
		$lines[] = $ghosts === [] ? 'Uncertain pieces: none' : 'Uncertain pieces:';
		array_push($lines, ...$ghosts);
		$links = Views::links($a);
		$linkTexts = [];
		foreach (array_slice($links, 0, self::MAX_LINKS) as [$x, $y]) {
			$linkTexts[] = self::linkText($a, $types, $x, $y);
		}
		$tail = [];
		$tail[] = 'Possibilities: ' . $a->n . '. Budget: White ' . $a->budget(0) . '/' . Tables::BUDGET . ', Black '
			. $a->budget(1) . '/' . Tables::BUDGET . '. King danger: White ' . Views::pct(Danger::kingDanger($a, 0))
			. '%, Black ' . Views::pct(Danger::kingDanger($a, 1)) . '%.';
		if ($state['result'] !== null) {
			/** @var array{result: string, reason: string} $result */
			$result = $state['result'];
			$tail[] = 'Game over: ' . $result['result'] . ' (' . $result['reason'] . ').';
		}
		// Keep the block within MAX_BYTES: drop link texts (they are counted instead) until it fits.
		do {
			$more = count($links) - count($linkTexts);
			$linkLine = 'Links: ' . ($linkTexts === []
				? ($links === [] ? 'none' : $more . ' linked pairs')
				: implode('; ', $linkTexts) . ($more > 0 ? '; and ' . $more . ' more' : ''));
			$text = implode("\n", [...$lines, $linkLine, ...$tail]);
		} while (strlen($text) > self::MAX_BYTES && array_pop($linkTexts) !== null);
		return $text;
	}

	/**
	 * One link in words. It names the pair of squares with the strongest positive correlation, the quantity the
	 * link test measures (T·W(X@a ∧ Y@b) − W(X@a)·W(Y@b), ties to the lowest squares), and says how the two
	 * placements go together, e.g. "white rook a8 <-> black knight c4 (the rook is on a8 exactly when the knight is
	 * on c4)".
	 */
	private static function linkText(Analysis $a, string $types, int $x, int $y): string {
		$names = Tables::$names;
		$px = $a->positions($x);
		$py = $a->positions($y);
		$joint = [];
		foreach ($a->weights as $i => $w) {
			$k = $px[$i] * 64 + $py[$i];
			$joint[$k] = ($joint[$k] ?? 0) + $w;
		}
		$best = null;
		foreach ($a->locs[$x] as $i => $sx) {
			$wx = $a->locW[$x][$i];
			foreach ($a->locs[$y] as $j => $sy) {
				$wy = $a->locW[$y][$j];
				$wxy = $joint[$sx * 64 + $sy] ?? 0;
				$dev = Tables::T * $wxy - $wx * $wy;
				if ($best === null || $dev > $best[0]) {
					$best = [$dev, $sx, $sy, $wx, $wy, $wxy];
				}
			}
		}
		/** @var array{0: int, 1: int, 2: int, 3: int, 4: int, 5: int} $best */
		[, $sx, $sy, $wx, $wy, $wxy] = $best;
		// Short labels: the type when the types differ, else colour and type, else first/second.
		$nx = self::TYPE_NAMES[$types[$x]];
		$ny = self::TYPE_NAMES[$types[$y]];
		if ($nx === $ny) {
			if (($x < 16) !== ($y < 16)) {
				$nx = self::pieceName($types, $x, true);
				$ny = self::pieceName($types, $y, true);
			} else {
				$nx = 'first';
				$ny = 'second';
			}
		}
		$ax = 'the ' . $nx . ' is on ' . $names[$sx];
		$ay = 'the ' . $ny . ' is on ' . $names[$sy];
		if ($wxy === $wx && $wxy === $wy) {
			$how = $ax . ' exactly when ' . $ay;
		} elseif ($wxy === $wx) {
			$how = 'whenever ' . $ax . ', ' . $ay;
		} elseif ($wxy === $wy) {
			$how = 'whenever ' . $ay . ', ' . $ax;
		} else {
			$how = $ay . ' in ' . Views::pct($wxy * Tables::T / $wx) . '% of the cases where ' . $ax . ', against '
				. Views::pct($wy) . '% overall';
		}
		return self::pieceName($types, $x, true) . ' ' . $names[$sx] . ' <-> ' . self::pieceName($types, $y, true) . ' '
			. $names[$sy] . ' (' . $how . ')';
	}
}
