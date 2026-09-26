/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The pieces of multiverse chess (handoff/research/multiverse-final.md section 5): every official piece of 5D chess,
 * their vectors over the four axes (dx, dy, dT, dL) = file, rank, whole turns, lines, and their types.
 *
 * Kings, rooks, pawns and brawns that never moved have their own types (`k0`, `r0`, `p0`, `w0`): castling and double
 * steps need them, and like every solid type they are the same in every world. A piece on a history board has the
 * type `'h' + type` (`hk0`, `hq` …): the same name, glyph and royal and solid flags, never moving, worth nothing to
 * the computer.
 */

import { t } from '@nextcloud/l10n'
import { allDirections, directions, symmetric } from '../core/topology.js'

/**
 * Whether a vector can ever find a board: the source is always a latest board, so a step forward in time on the same
 * line never lands anywhere.
 *
 * @param {number[]} v vector (dx, dy, dT, dL)
 * @return {boolean}
 */
function usable(v) {
	return !(v[3] === 0 && v[2] > 0)
}

/** The rook's lines along one axis (7). */
export const ROOK = directions(4, 1).filter(usable)
/** The bishop's lines along two axes at once (20). */
export const BISHOP = directions(4, 2).filter(usable)
/** The unicorn's lines along three axes at once (28). */
export const UNICORN = directions(4, 3).filter(usable)
/** The dragon's lines along all four axes (16). */
export const DRAGON = directions(4, 4).filter(usable)
/** The princess: rook and bishop (27). */
export const PRINCESS = [...ROOK, ...BISHOP]
/** The queen's lines and the king's steps: one to four axes (71). */
export const QUEEN = allDirections(4).filter(usable)
/** The knight's leaps: two along one axis and one along another (40). */
export const KNIGHT = symmetric([2, 1], 4).filter(usable)

/** The riding pieces by base type. */
export const RIDES = Object.freeze({ r: ROOK, b: BISHOP, u: UNICORN, d: DRAGON, s: PRINCESS, q: QUEEN, y: QUEEN })
/** The leaping pieces by base type. */
export const LEAPS = Object.freeze({ k: QUEEN, c: QUEEN, n: KNIGHT })

/**
 * A pawn or brawn vector set for a side: written for White (forward rank +1, forward line −1), Black negates dy and
 * dL.
 *
 * @param {number[][]} vecs vectors for White
 * @param {number} side side index
 * @return {number[][]}
 */
function oriented(vecs, side) {
	return side === 0 ? vecs : vecs.map(([dx, dy, dT, dL]) => [dx, -dy, dT, -dL])
}

/**
 * Pawn and brawn vectors per side: `steps` (one rank forward on the board, one line forward at the same turn; the
 * double step repeats them), `captures` (diagonally forward on the board, one line forward and one turn back or
 * ahead) and `brawn` (the brawn's extra captures: sideways plus a line forward, a rank and a line forward, a rank
 * forward and a turn back).
 */
export const PAWN = Object.freeze([0, 1].map((side) => ({
	steps: oriented([[0, 1, 0, 0], [0, 0, 0, -1]], side),
	captures: oriented([[1, 1, 0, 0], [-1, 1, 0, 0], [0, 0, 1, -1], [0, 0, -1, -1]], side),
	brawn: oriented([[1, 0, 0, -1], [-1, 0, 0, -1], [0, 1, 0, -1], [0, 1, -1, 0]], side),
})))

/** The piece names by base type. */
const NAMES = {
	k: () => t('quantumchess', 'King'),
	y: () => t('quantumchess', 'Royal queen'),
	c: () => t('quantumchess', 'Common king'),
	q: () => t('quantumchess', 'Queen'),
	s: () => t('quantumchess', 'Princess'),
	r: () => t('quantumchess', 'Rook'),
	b: () => t('quantumchess', 'Bishop'),
	n: () => t('quantumchess', 'Knight'),
	u: () => t('quantumchess', 'Unicorn'),
	d: () => t('quantumchess', 'Dragon'),
	p: () => t('quantumchess', 'Pawn'),
	w: () => t('quantumchess', 'Brawn'),
}

/** The computer's values by base type (community values and estimates; royal pieces 0). */
const VALUES = { k: 0, y: 0, c: 350, q: 1400, s: 800, r: 350, b: 500, n: 450, u: 550, d: 350, p: 100, w: 140 }

/** The live types: kings, rooks, pawns and brawns that never moved have a `0` type. */
export const LIVE_TYPES = Object.freeze([
	'k0',
	'k',
	'y',
	'c',
	'q',
	's',
	'r0',
	'r',
	'b',
	'n',
	'u',
	'd',
	'p0',
	'p',
	'w0',
	'w',
])

/**
 * The base type of a live or history type: `hk0` → `k`, `r0` → `r`.
 *
 * @param {string} type type
 * @return {string}
 */
export function baseType(type) {
	return (type[0] === 'h' ? type.slice(1) : type).replace('0', '')
}

/**
 * The live type of a history type (`hn` → `n`, `hk0` → `k0`); a live type stays.
 *
 * @param {string} type type
 * @return {string}
 */
export function liveType(type) {
	return type[0] === 'h' ? type.slice(1) : type
}

/**
 * The type of a piece after it moved: kings, rooks, pawns and brawns lose their unmoved flag.
 *
 * @param {string} type live type
 * @return {string}
 */
export function movedType(type) {
	return type.replace('0', '')
}

/** The live and history types that are royal (a king or a royal queen). */
export const ROYAL = new Set()
/** The piece types of the declaration, live and history. */
export const TYPES = {}
for (const type of LIVE_TYPES) {
	const b = baseType(type)
	const royal = b === 'k' || b === 'y'
	const solid = royal || b === 'c' || b === 'p' || b === 'w'
	// a brawn is a pawn with a crossbar; the other unusual pieces are letters (U, D, S, Y, C)
	let glyph = { text: b.toUpperCase(), shape: 'circle' }
	if ('kqrbnp'.includes(b)) {
		glyph = { sprite: b }
	} else if (b === 'w') {
		glyph = { sprite: 'p', bar: true }
	}
	// the variant generates every move itself; a common king that moves does not reset the quiet-move counter
	TYPES[type] = { name: NAMES[b], moves: [], royal, solid, splittable: !solid, value: VALUES[b], glyph }
	if (b === 'c') {
		TYPES[type].resetsQuiet = false
	}
	TYPES['h' + type] = {
		name: NAMES[b],
		moves: [],
		royal,
		solid,
		splittable: false,
		value: 0,
		glyph,
		resetsQuiet: false,
	}
	if (royal) {
		ROYAL.add(type)
		ROYAL.add('h' + type)
	}
}
