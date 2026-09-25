/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * King of the Hill (lichess rules): orthodox chess in which a king that steps onto one of the four centre squares
 * (d4, e4, d5, e5, "the hill") wins at once. The one check-like rule of the variant: a king may not step onto a hill
 * square that an enemy piece attacks once the king stands there. It is tested per world inside the move generator,
 * so with ghosts a hill step rolls between "Missed" (attacked in that possibility) and the win. Capturing the enemy
 * king still wins, and so does a king that cannot escape; two lone kings are no draw. The research spec is
 * handoff/research/koth.md.
 */

import { t } from '@nextcloud/l10n'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { applyClassical, attacks } from './core/world.js'

/**
 * Whether a square (file and rank index) is on the hill.
 *
 * @param {number} f file index (0 = a)
 * @param {number} r rank index (0 = rank 1)
 * @return {boolean}
 */
function isHill(f, r) {
	return (f === 3 || f === 4) && (r === 3 || r === 4)
}

/**
 * The shade of a square: the hill keeps the light/dark pattern in its own colours.
 *
 * @param {number} f file index
 * @param {number} r rank index
 * @return {string}
 */
function shade(f, r) {
	const dark = (f + r) % 2 === 0
	if (isHill(f, r)) {
		return dark ? 'hilldark' : 'hill'
	}
	return dark ? 'dark' : 'light'
}

// The border of the hill in layout units (x right, y down, one unit per cell), drawn above the cells.
const outlines = [
	{ x1: 3, y1: 3, x2: 5, y2: 3 },
	{ x1: 5, y1: 3, x2: 5, y2: 5 },
	{ x1: 5, y1: 5, x2: 3, y2: 5 },
	{ x1: 3, y1: 5, x2: 3, y2: 3 },
]

// Extended in place (never spread): the orthodox hooks refer to this very object, which defineVariant completes.
const spec = orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })
const topo = spec.topology

/**
 * The computer's bonus for a king that has a step towards the hill onto a square that is empty or holds an enemy
 * piece. Without it, a move that opens the king's path (e2-e3) is worth no more than a rook shuffle at the search
 * depth of the Hard level, which keeps the first of equal moves and so played a1-b1, b1-a1 until the 50-move draw.
 */
const OPEN_PATH = 12

/**
 * The computer's bonus for a king next to the hill by its number of free hill steps (0, 1 or 2; see `freeSteps`).
 * The search looks only one answer ahead: without it the Hard level walked its king forward (Kd7 after 1.d3 d6
 * 2.Kd2) and missed that 3.Ke3 then threatens d4 and e4 at once, and one move can rarely guard both squares. Over 72
 * games against Normal, Hard won 24 and lost 44 before, and won 31 and lost 36 with it.
 */
const FREE_STEPS = [0, 60, 250]

/** The hill squares as a lookup table by square index. */
const HILL = new Array(topo.size).fill(false)
/** The king distance to the hill by square index (0 on the hill). */
const DIST = new Array(topo.size).fill(0)
/** The computer's pull towards the hill by square index: 110, 45 or 15 at a king distance of 1, 2 or 3. */
const PULL = new Array(topo.size).fill(0)
for (let sq = 0; sq < topo.size; sq++) {
	const [f, r] = topo.coords[sq]
	HILL[sq] = isHill(f, r)
	// king distance to the nearest of files d-e and ranks 4-5
	DIST[sq] = Math.max(Math.max(3 - f, f - 4, 0), Math.max(3 - r, r - 4, 0))
	PULL[sq] = [0, 110, 45, 15][DIST[sq]] ?? 0
}
/** The king steps towards the hill by square index: the neighbouring squares nearer the hill. */
const TOWARDS = topo.coords.map(([f, r], sq) => {
	const out = []
	for (let df = -1; df <= 1; df++) {
		for (let dr = -1; dr <= 1; dr++) {
			const n = topo.at([f + df, r + dr])
			if (n >= 0 && DIST[n] < DIST[sq]) {
				out.push(n)
			}
		}
	}
	return out
})
/** The hill squares next to each square by square index: one or two for a square of the ring, none elsewhere. */
const HILL_NEXT = TOWARDS.map((steps, sq) => (DIST[sq] === 1 ? steps : []))

/**
 * Whether a king on `at` has a step towards the hill onto a square that is empty or holds an enemy piece.
 *
 * @param {object} w world
 * @param {number} at the king's square
 * @param {number} side the king's side
 * @return {boolean}
 */
function openPath(w, at, side) {
	const steps = TOWARDS[at]
	for (let i = 0; i < steps.length; i++) {
		const occ = w.board[steps[i]]
		if (occ === -1 || w.sd[occ] !== side) {
			return true
		}
	}
	return false
}

/**
 * The number of free hill steps of a king on `at`: the hill squares next to it that hold no piece of its side and
 * that no enemy piece attacks. For speed the attacks are read with the king still on `at`, so a rook, bishop or queen
 * line through the king's square to the hill square behind it is missed; that slider attacks the king itself, which
 * the search sees.
 *
 * @param {object} w world
 * @param {number} at the king's square
 * @param {number} side the king's side
 * @return {number}
 */
function freeSteps(w, at, side) {
	const next = HILL_NEXT[at]
	let n = 0
	for (let i = 0; i < next.length; i++) {
		const occ = w.board[next[i]]
		if ((occ === -1 || w.sd[occ] !== side) && !attacks(spec, w, 1 - side, next[i])) {
			n++
		}
	}
	return n
}

/**
 * Whether a move is a king step onto the hill that the hill-entry rule forbids in this world: after the move, an
 * enemy piece attacks the square (pinned pieces, the enemy king and slider lines through the king's old square all
 * count). Castling never reaches the hill.
 *
 * @param {object} w world
 * @param {number} side the moving side
 * @param {object} m classical move
 * @return {boolean}
 */
function refusedHillStep(w, side, m) {
	return HILL[m.to] && w.ty[m.id] === 'k' && m.kind !== 'castle'
		&& attacks(spec, applyClassical(spec, w, m), 1 - side, m.to)
}

Object.assign(spec, {
	id: 'koth',
	category: 'rules',
	// Two lone kings still race for the hill (lichess never declares insufficient material here). The other classic
	// end rules stay on: a king that cannot escape loses (a hill step the king may make is an escape), and the
	// 50-move draw waits while the side to move can capture the enemy king for certain.
	bareKingsDraw: false,
	rules: () => [
		t('quantumchess', 'Move your king onto one of the four centre squares (d4, e4, d5, e5) and you win at once.'),
		t(
			'quantumchess',
			'Your king may not step onto a centre square that an enemy piece would attack once your king stands there. This is the only place where attacks limit your king.',
		),
		t(
			'quantumchess',
			'Capturing an enemy piece on a centre square with your king also wins, if no other enemy piece attacks that square afterwards.',
		),
		t(
			'quantumchess',
			'If a ghost means a centre square would be attacked in only some possibilities, a king step onto it is a roll: either your king arrives and you win, or the move is Missed and your king stays where it was.',
		),
		t('quantumchess', 'Capturing the enemy king also wins. Castling, en passant and promotion are unchanged.'),
	],
	/**
	 * The hill-entry rule, per world: drop the king steps onto an attacked hill square.
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @param {object[]} list generated moves
	 * @return {object[]}
	 */
	filterMoves(w, side, list) {
		for (let i = 0; i < list.length; i++) {
			if (refusedHillStep(w, side, list[i])) {
				return list.filter((m) => !refusedHillStep(w, side, m))
			}
		}
		return list
	},
	/**
	 * A side without a king has lost; otherwise a king on the hill wins for its side.
	 *
	 * @param {object} w world
	 * @return {null|{winner: number|null, reason: string}}
	 */
	worldResult(w) {
		let kings = 0
		let hill = -1
		for (let id = 0; id < w.sq.length; id++) {
			if (w.ty[id] !== 'k' || w.sq[id] < 0) {
				continue
			}
			kings |= 1 << w.sd[id]
			if (HILL[w.sq[id]]) {
				hill = w.sd[id]
			}
		}
		if (kings !== 3) {
			return { winner: kings === 0 ? null : kings === 1 ? 0 : 1, reason: 'king' }
		}
		return hill >= 0 ? { winner: hill, reason: 'hill' } : null
	},
	/**
	 * The text of the hill win.
	 *
	 * @param {string} reason reason code
	 * @return {string|null}
	 */
	reasonText(reason) {
		return reason === 'hill' ? t('quantumchess', 'a king reached the hill') : null
	},
	/**
	 * The computer's pull towards the hill, own king minus enemy king: a king nearer the hill counts more (`PULL`),
	 * a king whose path towards the hill is open counts `OPEN_PATH` more, and a king next to the hill counts more by
	 * its free hill steps (`FREE_STEPS`). A one-move threat is seen by the search (a hill step ends the game, so it
	 * counts as a forcing reply).
	 *
	 * @param {object} w world
	 * @param {number} side the side the value is for
	 * @return {number}
	 */
	evaluate(w, side) {
		let v = 0
		for (let id = 0; id < w.sq.length; id++) {
			const at = w.sq[id]
			if (w.ty[id] !== 'k' || at < 0) {
				continue
			}
			const s = w.sd[id]
			const term = PULL[at] + (openPath(w, at, s) ? OPEN_PATH : 0) + FREE_STEPS[freeSteps(w, at, s)]
			v += s === side ? term : -term
		}
		return v
	},
})

export default defineVariant(spec)
