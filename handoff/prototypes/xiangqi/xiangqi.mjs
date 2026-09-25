/**
 * Prototype of the xiangqi variant on the real variant core (handoff/research/xiangqi.md, section 3).
 * Not linted, not part of the app. Implementers may copy the declaration into src/variants/xiangqi.js.
 */

import { t } from '@nextcloud/l10n'
import { FILE_LETTERS, makeTopology } from '../../../src/variants/core/topology.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { pushMove } from '../../../src/variants/core/world.js'

export const FILES = 9
export const RANKS = 10

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ELEPHANT = DIAG.map(([f, r]) => [2 * f, 2 * r])
const HORSE = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]

// ---------------------------------------------------------------------------------------------------------------
// Board: 9 x 10 intersections, drawn as points on a wooden board with grid lines, river and palace diagonals
// ---------------------------------------------------------------------------------------------------------------

const coords = []
for (let r = 0; r < RANKS; r++) {
	for (let f = 0; f < FILES; f++) {
		coords.push([f, r])
	}
}

/** x of a file line, y of a rank line (Red at the bottom). */
const X = (f) => f + 0.5
const Y = (r) => RANKS - 0.5 - r

const lines = []
for (let r = 0; r < RANKS; r++) {
	lines.push({ x1: X(0), y1: Y(r), x2: X(FILES - 1), y2: Y(r) })
}
for (let f = 0; f < FILES; f++) {
	if (f === 0 || f === FILES - 1) {
		lines.push({ x1: X(f), y1: Y(0), x2: X(f), y2: Y(RANKS - 1) })
	} else {
		lines.push({ x1: X(f), y1: Y(0), x2: X(f), y2: Y(4) })
		lines.push({ x1: X(f), y1: Y(5), x2: X(f), y2: Y(RANKS - 1) })
	}
}
for (const [r0, r1] of [[0, 2], [7, 9]]) {
	lines.push({ x1: X(3), y1: Y(r0), x2: X(5), y2: Y(r1) })
	lines.push({ x1: X(5), y1: Y(r0), x2: X(3), y2: Y(r1) })
}
const labels = []
for (let f = 0; f < FILES; f++) {
	labels.push({ x: X(f), y: RANKS + 0.2, text: FILE_LETTERS[f] })
}
for (let r = 0; r < RANKS; r++) {
	labels.push({ x: -0.2, y: Y(r), text: String(r + 1) })
}

export const topology = makeTopology({
	coords,
	name: ([f, r]) => FILE_LETTERS[f] + String(r + 1),
	cell: ([f, r]) => ({ x: X(f), y: Y(r), w: 1, h: 1, shape: 'point', shade: 'light' }),
	layout: {
		width: FILES,
		height: RANKS,
		labels,
		lines,
		areas: [
			{ x: 0, y: 0, w: FILES, h: RANKS, shade: 'wood' },
			{ x: X(0), y: Y(5), w: FILES - 1, h: 1, shade: 'river' },
		],
	},
})

const fileOf = (sq) => topology.coords[sq][0]
const rankOf = (sq) => topology.coords[sq][1]

/** Whether a point is in the side's palace (files d-f, ranks 1-3 for Red, 8-10 for Black). */
export function inPalace(side, sq) {
	const f = fileOf(sq)
	const r = rankOf(sq)
	return f >= 3 && f <= 5 && (side === 0 ? r <= 2 : r >= 7)
}

/** Whether a point is on the side's own half (ranks 1-5 for Red, 6-10 for Black). */
export function ownHalf(side, sq) {
	return side === 0 ? rankOf(sq) <= 4 : rankOf(sq) >= 5
}

// ---------------------------------------------------------------------------------------------------------------
// The variant
// ---------------------------------------------------------------------------------------------------------------

const ATTACKERS = new Set(['r', 'h', 'c', 'p'])

/**
 * The square of a side's general, or -1.
 */
function generalOf(w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.ty[id] === 'k' && w.sq[id] >= 0) {
			return id
		}
	}
	return -1
}

/** Whether the two generals stand on one file with nothing between them. */
export function facing(w) {
	const a = generalOf(w, 0)
	const b = generalOf(w, 1)
	if (a < 0 || b < 0 || fileOf(w.sq[a]) !== fileOf(w.sq[b])) {
		return false
	}
	let s = w.sq[a]
	while ((s = topology.step(s, [0, 1])) >= 0 && s !== w.sq[b]) {
		if (w.board[s] !== -1) {
			return false
		}
	}
	return true
}

const glyph = (red, black) => ({ text: (side) => (side === 0 ? red : black), shape: 'xiangqi' })

const spec = {
	id: 'xiangqi',
	category: 'regional',
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
			value: 0,
			glyph: glyph('帥', '將'),
		},
		a: {
			name: () => t('quantumchess', 'Advisor'),
			moves: [{ leap: DIAG, region: (side, to) => inPalace(side, to) }],
			value: 200,
			glyph: glyph('仕', '士'),
		},
		e: {
			name: () => t('quantumchess', 'Elephant'),
			moves: [{ leap: ELEPHANT, via: (v) => [[v[0] / 2, v[1] / 2]], region: (side, to) => ownHalf(side, to) }],
			value: 200,
			glyph: glyph('相', '象'),
		},
		h: {
			name: () => t('quantumchess', 'Horse'),
			moves: [{ leap: HORSE, via: (v) => (Math.abs(v[0]) === 2 ? [[Math.sign(v[0]), 0]] : [[0, Math.sign(v[1])]]) }],
			value: 400,
			glyph: glyph('傌', '馬'),
		},
		r: {
			name: () => t('quantumchess', 'Chariot'),
			moves: [{ ride: ORTHO }],
			value: 900,
			glyph: glyph('俥', '車'),
		},
		c: {
			name: () => t('quantumchess', 'Cannon'),
			moves: [{ ride: ORTHO, mode: 'move' }, { hop: ORTHO }],
			value: 450,
			glyph: glyph('炮', '砲'),
		},
		p: {
			name: () => t('quantumchess', 'Soldier'),
			moves: [
				{ leap: [[0, 1]], oriented: true },
				{ leap: [[1, 0], [-1, 0]], when: (side, from) => !ownHalf(side, from) },
			],
			solid: true,
			value: 100,
			glyph: glyph('兵', '卒'),
		},
	},
	rules: () => [],
	setup() {
		return startWorld()
	},
	// the flying general: a general captures the enemy general along an open file
	extraMoves(w, side) {
		const out = []
		const g = generalOf(w, side)
		if (g < 0) {
			return out
		}
		const from = w.sq[g]
		const dir = side === 0 ? [0, 1] : [0, -1]
		let s = from
		while ((s = topology.step(s, dir)) >= 0) {
			const occ = w.board[s]
			if (occ === -1) {
				continue
			}
			if (w.ty[occ] === 'k' && w.sd[occ] !== side) {
				pushMove(spec, w, out, g, from, s, occ, 'fly')
			}
			break
		}
		return out
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
			return alive[0] === alive[1] ? { winner: null, reason: 'general' } : { winner: alive[0] ? 0 : 1, reason: 'general' }
		}
		if (!attackers && !facing(w)) {
			return { winner: null, reason: 'noAttackers' }
		}
		return null
	},
	noMoves(state) {
		return { winner: 1 - state.turn, reason: 'noMoves' }
	},
	reasonText(reason) {
		switch (reason) {
			case 'general':
				return t('quantumchess', 'a general was captured')
			case 'noAttackers':
				return t('quantumchess', 'no piece left that can cross the river')
			case 'perpetualCheck':
				return t('quantumchess', 'perpetual check')
			default:
				return null
		}
	},
	evaluate(w, side) {
		let s = 0
		for (let id = 0; id < w.sq.length; id++) {
			if (w.ty[id] === 'p' && w.sq[id] >= 0 && !ownHalf(w.sd[id], w.sq[id])) {
				s += w.sd[id] === side ? 100 : -100
			}
		}
		return s
	},
}

/** The start position (WXF Figure A; FEN rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w). */
export const START = {
	a1: '0:r', b1: '0:h', c1: '0:e', d1: '0:a', e1: '0:k', f1: '0:a', g1: '0:e', h1: '0:h', i1: '0:r',
	b3: '0:c', h3: '0:c',
	a4: '0:p', c4: '0:p', e4: '0:p', g4: '0:p', i4: '0:p',
	a7: '1:p', c7: '1:p', e7: '1:p', g7: '1:p', i7: '1:p',
	b8: '1:c', h8: '1:c',
	a10: '1:r', b10: '1:h', c10: '1:e', d10: '1:a', e10: '1:k', f10: '1:a', g10: '1:e', h10: '1:h', i10: '1:r',
}

/** The classical start world. */
function startWorld() {
	const w = { sq: [], ty: [], sd: [], board: new Array(topology.size).fill(-1), x: {} }
	for (const [name, piece] of Object.entries(START)) {
		const [side, type] = piece.split(':')
		const sq = topology.byName(name)
		const id = w.sq.length
		w.sq.push(sq)
		w.ty.push(type)
		w.sd.push(Number(side))
		w.board[sq] = id
	}
	return w
}

export default defineVariant(spec)
