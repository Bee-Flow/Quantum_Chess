/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Xiangqi (Chinese chess) by the World Xiangqi Federation rules (2018): the pieces stand on the 90 points of a 9 × 10
 * grid with a river and two palaces. The general and the advisors never leave their palace, the elephants never
 * cross the river, the horse and the elephant are blocked by a piece on the point they pass, the cannon captures by
 * jumping over exactly one screen, and a soldier steps sideways once it has crossed the river. Capture the enemy
 * general to win, also with the flying general along an open file. A side loses at once when every move it has would
 * let its general be captured for certain (the core's escape rule, `cannotEscape`: checkmate and the WXF stalemate),
 * and a side without any move loses. Draws: no piece left that can cross the river, 50 moves by each side without a
 * capture, the move limit. There is no repetition rule, so perpetual check does not lose. The research spec is
 * handoff/research/xiangqi.md; the player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { FILE_LETTERS, makeTopology } from './core/topology.js'
import { defineVariant } from './core/variant.js'
import { addPiece, emptyWorld, pushMove } from './core/world.js'

/** Number of files (vertical lines) and ranks (horizontal lines). */
export const FILES = 9
export const RANKS = 10

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ELEPHANT = DIAG.map(([f, r]) => [2 * f, 2 * r])
const HORSE = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]
/** Both directions along a file, for the flying general (`generate` calls it in every world on every move). */
const FILE_DIRS = [[0, 1], [0, -1]]

/**
 * The start position (WXF Figure A; Fairy-Stockfish `rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w`),
 * rank 10 at the top: the WXF letters (general K, advisor A, elephant E, horse H, chariot R, cannon C, soldier P),
 * upper case for Red, `.` for an empty point. The letters in lower case are the type ids.
 */
export const START_ROWS = Object.freeze([
	'rheakaehr',
	'.........',
	'.c.....c.',
	'p.p.p.p.p',
	'.........',
	'.........',
	'P.P.P.P.P',
	'.C.....C.',
	'.........',
	'RHEAKAEHR',
])

/** Piece values in centipawns for the computer player (H. T. Lau's values × 100, the cannon a little higher). */
export const VALUES = Object.freeze({ k: 0, a: 200, e: 200, h: 400, r: 900, c: 450, p: 100 })

/** The types that can cross the river (the others can never capture anything but a facing general). */
const ATTACKERS = new Set(['r', 'h', 'c', 'p'])

// ---------------------------------------------------------------------------------------------------------------
// The board: 9 × 10 points on a wooden board with the grid, the river and the palace diagonals
// ---------------------------------------------------------------------------------------------------------------

/**
 * The x of a file line in layout units.
 *
 * @param {number} f file (0 = a)
 * @return {number}
 */
const X = (f) => f + 0.5

/**
 * The y of a rank line in layout units (Red at the bottom).
 *
 * @param {number} r rank (0 = 1)
 * @return {number}
 */
const Y = (r) => RANKS - 0.5 - r

/** The points with the small corner marks of printed boards: the start points of the cannons and soldiers. */
const MARKED = ['b3', 'h3', 'a4', 'c4', 'e4', 'g4', 'i4', 'a7', 'c7', 'e7', 'g7', 'i7', 'b8', 'h8']

/**
 * The lines of the drawn board: the ten rank lines, the file lines (the inner ones stop at the river), the palace
 * diagonals and the corner marks.
 *
 * @return {Array<{x1: number, y1: number, x2: number, y2: number}>}
 */
function boardLines() {
	const lines = []
	const line = (x1, y1, x2, y2) => lines.push({ x1, y1, x2, y2 })
	for (let r = 0; r < RANKS; r++) {
		line(X(0), Y(r), X(FILES - 1), Y(r))
	}
	for (let f = 0; f < FILES; f++) {
		if (f === 0 || f === FILES - 1) {
			line(X(f), Y(0), X(f), Y(RANKS - 1))
		} else {
			line(X(f), Y(0), X(f), Y(4))
			line(X(f), Y(5), X(f), Y(RANKS - 1))
		}
	}
	for (const [r0, r1] of [[0, 2], [7, 9]]) {
		line(X(3), Y(r0), X(5), Y(r1))
		line(X(5), Y(r0), X(3), Y(r1))
	}
	// an L-shaped mark 0.07 from the point in every quarter that lies on the board
	const gap = 0.07
	const len = 0.15
	for (const name of MARKED) {
		const f = FILE_LETTERS.indexOf(name[0])
		const r = Number(name.slice(1)) - 1
		for (const [dx, dy] of DIAG) {
			if (f + dx < 0 || f + dx >= FILES) {
				continue
			}
			const cx = X(f) + dx * gap
			const cy = Y(r) + dy * gap
			line(cx, cy + dy * len, cx, cy)
			line(cx, cy, cx + dx * len, cy)
		}
	}
	return lines
}

/**
 * The coordinate labels: files a–i under the board, ranks 1–10 left of it.
 *
 * @return {Array<{x: number, y: number, text: string}>}
 */
function boardLabels() {
	const labels = []
	for (let f = 0; f < FILES; f++) {
		labels.push({ x: X(f), y: RANKS + 0.2, text: FILE_LETTERS[f] })
	}
	for (let r = 0; r < RANKS; r++) {
		labels.push({ x: -0.2, y: Y(r), text: String(r + 1) })
	}
	return labels
}

const coords = []
for (let r = 0; r < RANKS; r++) {
	for (let f = 0; f < FILES; f++) {
		coords.push([f, r])
	}
}

/** The 90 points, `a1` … `i10`, drawn as point cells (a shade without a CSS rule keeps the point transparent). */
export const topology = makeTopology({
	coords,
	name: ([f, r]) => FILE_LETTERS[f] + String(r + 1),
	cell: ([f, r]) => ({ x: X(f), y: Y(r), w: 1, h: 1, shape: 'point', shade: 'light' }),
	layout: {
		width: FILES,
		height: RANKS,
		labels: boardLabels(),
		lines: boardLines(),
		areas: [
			{ x: 0, y: 0, w: FILES, h: RANKS, shade: 'wood' },
			{ x: X(0), y: Y(5), w: FILES - 1, h: 1, shade: 'river' },
		],
	},
})

/**
 * The file of a point (0 = a).
 *
 * @param {number} sq point
 * @return {number}
 */
const fileOf = (sq) => topology.coords[sq][0]

/**
 * The rank of a point (0 = 1).
 *
 * @param {number} sq point
 * @return {number}
 */
const rankOf = (sq) => topology.coords[sq][1]

/**
 * Whether a point is in a side's palace: files d–f, ranks 1–3 for Red and 8–10 for Black.
 *
 * @param {number} side side index
 * @param {number} sq point
 * @return {boolean}
 */
export function inPalace(side, sq) {
	const f = fileOf(sq)
	const r = rankOf(sq)
	return f >= 3 && f <= 5 && (side === 0 ? r <= 2 : r >= RANKS - 3)
}

/**
 * Whether a point is on a side's own half of the board: ranks 1–5 for Red, 6–10 for Black.
 *
 * @param {number} side side index
 * @param {number} sq point
 * @return {boolean}
 */
export function ownHalf(side, sq) {
	return side === 0 ? rankOf(sq) <= 4 : rankOf(sq) >= 5
}

// ---------------------------------------------------------------------------------------------------------------
// Rules in one world
// ---------------------------------------------------------------------------------------------------------------

/**
 * The id of a side's general in a world, or -1 when it was captured.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
export function generalOf(w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] >= 0 && w.sd[id] === side && w.ty[id] === 'k') {
			return id
		}
	}
	return -1
}

/**
 * Whether the two generals stand on one file with no piece between them (the flying general can capture).
 *
 * @param {object} w world
 * @return {boolean}
 */
export function facing(w) {
	const a = generalOf(w, 0)
	const b = generalOf(w, 1)
	if (a < 0 || b < 0 || fileOf(w.sq[a]) !== fileOf(w.sq[b])) {
		return false
	}
	const low = Math.min(w.sq[a], w.sq[b])
	const high = Math.max(w.sq[a], w.sq[b])
	for (let s = low + FILES; s < high; s += FILES) {
		if (w.board[s] !== -1) {
			return false
		}
	}
	return true
}

/**
 * The flying general: the general captures the enemy general along its file when no piece stands between them. The
 * key is an ordinary move key (`e1-e10`), which no one-point general move can have. The kind `fly` is not a certain
 * kind, so in a quantum state it is settled like any general move: it captures where the file is open.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side to move
 * @return {object[]} the flying capture, or nothing
 */
function flyingGeneral(V, w, side) {
	const out = []
	const g = generalOf(w, side)
	if (g < 0) {
		return out
	}
	const from = w.sq[g]
	// the enemy palace is always ahead; both directions keep hand-made positions honest
	for (const dir of FILE_DIRS) {
		let s = from
		while ((s = topology.step(s, dir)) >= 0) {
			const occ = w.board[s]
			if (occ === -1) {
				continue
			}
			if (w.ty[occ] === 'k' && V.enemies(side, w.sd[occ])) {
				pushMove(V, w, out, g, from, s, occ, 'fly')
			}
			break
		}
	}
	return out
}

/**
 * The glyph of a piece type: one character on the round wooden disc, different for Red and Black.
 *
 * @param {string} red Red's character
 * @param {string} black Black's character
 * @return {object}
 */
function glyph(red, black) {
	return { text: (side) => (side === 0 ? red : black), shape: 'xiangqi' }
}

// ---------------------------------------------------------------------------------------------------------------
// The computer's positional terms
// ---------------------------------------------------------------------------------------------------------------

/**
 * Positional bonuses in centipawns per type, side and point: a soldier across the river is worth twice as much (Lau),
 * a little more near the enemy palace and a little less on the last rank, where it can only step sideways; a horse is
 * better in the middle of the board than on its edge.
 */
const BONUS = { p: [[], []], h: [[], []] }
for (let sq = 0; sq < topology.size; sq++) {
	const f = fileOf(sq)
	for (const side of [0, 1]) {
		// ranks counted from the side's own back rank
		const r = side === 0 ? rankOf(sq) : RANKS - 1 - rankOf(sq)
		let p = 0
		if (r >= 5) {
			p = 100
			if (r === RANKS - 1) {
				p = 60
			} else if (r >= 6 && f >= 2 && f <= 6) {
				p += 20
			}
		}
		BONUS.p[side][sq] = p
		const edge = Math.min(f, FILES - 1 - f, rankOf(sq), RANKS - 1 - rankOf(sq))
		BONUS.h[side][sq] = edge === 0 ? -20 : Math.min(edge, 3) * 8
	}
}

/**
 * The positional score of a world for a side: own bonuses minus the enemy's.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
function positional(w, side) {
	let score = 0
	for (let id = 0; id < w.sq.length; id++) {
		const sq = w.sq[id]
		const table = BONUS[w.ty[id]]
		if (sq < 0 || table === undefined) {
			continue
		}
		const v = table[w.sd[id]][sq]
		score += w.sd[id] === side ? v : -v
	}
	return score
}

// ---------------------------------------------------------------------------------------------------------------
// The variant
// ---------------------------------------------------------------------------------------------------------------

const spec = {
	id: 'xiangqi',
	category: 'regional',
	// no castling and no en passant: the shared rules card leaves out its sentence about them
	specialMoves: false,
	sides: [
		{ id: 'r', name: () => t('quantumchess', 'Red'), color: 'red' },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black' },
	],
	topology,
	types: {
		k: {
			name: () => t('quantumchess', 'General'),
			moves: [{ leap: ORTHO, region: (side, to) => inPalace(side, to) }],
			royal: true,
			value: VALUES.k,
			glyph: glyph('帥', '將'),
		},
		a: {
			name: () => t('quantumchess', 'Advisor'),
			moves: [{ leap: DIAG, region: (side, to) => inPalace(side, to) }],
			value: VALUES.a,
			glyph: glyph('仕', '士'),
		},
		e: {
			name: () => t('quantumchess', 'Elephant'),
			// the elephant's eye: the point in between must be empty
			moves: [{ leap: ELEPHANT, via: (v) => [[v[0] / 2, v[1] / 2]], region: (side, to) => ownHalf(side, to) }],
			value: VALUES.e,
			glyph: glyph('相', '象'),
		},
		h: {
			name: () => t('quantumchess', 'Horse'),
			// the horse's leg: the orthogonal point next to the horse, in the direction of the long step
			moves: [{
				leap: HORSE,
				via: (v) => (Math.abs(v[0]) === 2 ? [[Math.sign(v[0]), 0]] : [[0, Math.sign(v[1])]]),
			}],
			value: VALUES.h,
			glyph: glyph('傌', '馬'),
		},
		r: {
			name: () => t('quantumchess', 'Chariot'),
			moves: [{ ride: ORTHO }],
			value: VALUES.r,
			glyph: glyph('俥', '車'),
		},
		c: {
			name: () => t('quantumchess', 'Cannon'),
			moves: [{ ride: ORTHO, mode: 'move' }, { hop: ORTHO }],
			value: VALUES.c,
			glyph: glyph('炮', '砲'),
		},
		p: {
			name: () => t('quantumchess', 'Soldier'),
			moves: [
				{ leap: [[0, 1]], oriented: true },
				{ leap: [[1, 0], [-1, 0]], when: (side, from) => !ownHalf(side, from) },
			],
			solid: true,
			// WXF counts 50 moves by each side without a capture: a soldier move does not reset the counter
			resetsQuiet: false,
			value: VALUES.p,
			glyph: glyph('兵', '卒'),
		},
	},
	rules: () => [
		t('quantumchess', 'Pieces stand on the points where the lines cross. Red moves first. The river divides the board, and each side has a palace: the 3 × 3 points marked with two diagonal lines.'),
		t('quantumchess', 'The general 帥/將 steps one point straight and never leaves its palace. Advisors 仕/士 step one point diagonally along the palace\'s diagonal lines.'),
		t('quantumchess', 'Elephants 相/象 move exactly two points diagonally and never cross the river. Horses 傌/馬 move one point straight, then one diagonally outwards. Both are blocked by a piece on the point they pass, and a ghost blocks them only where it really is.'),
		t('quantumchess', 'Chariots 俥/車 move like rooks. Cannons 炮/砲 move like rooks too, but capture only by jumping over exactly one piece of either colour. A ghost works as that screen only in the possibilities where it is really there.'),
		t('quantumchess', 'Soldiers 兵/卒 step one point forward, and also sideways once they have crossed the river. They never move back and never promote. Generals and soldiers are always solid; every other piece can split.'),
		t('quantumchess', 'Capture the enemy general to win. If the two generals stand on one file with nothing between them, the player to move may fly along the file and capture the other general. A ghost between them shields only where it really is.'),
		t('quantumchess', 'You lose at once if every move you have would let your general be captured for certain, or if you have no move at all. It is a draw when no chariot, horse, cannon or soldier is left and the generals do not face each other, or after 50 moves by each side without a capture.'),
		t('quantumchess', 'Unlike standard xiangqi, there is no repetition rule: perpetual check does not lose.'),
	],
	setup() {
		const w = emptyWorld(spec)
		// rank 1 first, so Red's pieces get the lower ids
		for (let r = 0; r < RANKS; r++) {
			const row = START_ROWS[RANKS - 1 - r]
			for (let f = 0; f < FILES; f++) {
				const letter = row[f]
				if (letter !== '.') {
					addPiece(w, letter.toLowerCase(), letter === letter.toUpperCase() ? 0 : 1, topology.at([f, r]))
				}
			}
		}
		// no castling, no double step, no en passant, no counters: a xiangqi world has no extra state
		w.x = {}
		return w
	},
	extraMoves(w, side) {
		return flyingGeneral(spec, w, side)
	},
	worldResult(w) {
		const alive = [false, false]
		let attackers = false
		for (let id = 0; id < w.sq.length; id++) {
			if (w.sq[id] < 0) {
				continue
			}
			if (w.ty[id] === 'k') {
				alive[w.sd[id]] = true
			} else if (ATTACKERS.has(w.ty[id])) {
				attackers = true
			}
		}
		if (!alive[0] || !alive[1]) {
			// both generals gone cannot happen (one move captures one piece); kept as a safety net
			return alive[0] === alive[1]
				? { winner: null, reason: 'general' }
				: { winner: alive[0] ? 0 : 1, reason: 'general' }
		}
		// only generals, advisors and elephants: nobody can capture anything again, unless the generals face. This
		// covers the bare generals too; the core's bare-kings draw (kept on) is then only reached with facing generals,
		// where it waits for the certain flying capture (drawsWait)
		if (!attackers && !facing(w)) {
			return { winner: null, reason: 'noAttackers' }
		}
		return null
	},
	// WXF 3.1.A: a side without any move has lost. A side whose every move exposes its general (checkmate, the WXF
	// stalemate) has moves, so the core's escape rule ends that game first, with the reason 'cannotEscape'.
	noMoves(state) {
		return { winner: 1 - state.turn, reason: 'noMoves' }
	},
	reasonText(reason) {
		switch (reason) {
			case 'general':
				return t('quantumchess', 'a general was captured')
			case 'cannotEscape':
				// TRANSLATORS: Xiangqi: every move of the loser would have let its general be captured for certain
				return t('quantumchess', 'the general could not escape')
			case 'noAttackers':
				return t('quantumchess', 'no piece left that can cross the river')
			case 'quiet':
				return t('quantumchess', '50 moves by each side without a capture')
			default:
				return null
		}
	},
	evaluate(w, side) {
		return positional(w, side)
	},
}

export default defineVariant(spec)
