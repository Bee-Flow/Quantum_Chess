/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Precomputed board geometry for the computer player's evaluation and move ordering (square index = rank · 8 + file,
 * as in the rules engine). These are heuristic helpers only: legality always comes from the rules engine.
 *
 * The tables deliberately stay separate from src/engine/geometry.js, although both describe the same board. The
 * order in which these lists enumerate squares drives the move ordering and the capture generation of the search, and
 * with it the moves the computer player chooses under a node budget. Sharing the engine's tables (which list targets
 * in a different order) would silently change the computer player's play.
 */

/** Direction deltas: 0–3 orthogonal (N, S, E, W), 4–7 diagonal (NE, NW, SE, SW). */
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]

/**
 * Build a table of target lists for leaper offsets.
 *
 * @param {number[][]} offsets [dfile, drank] pairs
 * @return {number[][]}
 */
function leaper(offsets) {
	const out = new Array(64)
	for (let s = 0; s < 64; s++) {
		const f = s & 7
		const r = s >> 3
		const list = []
		for (const [df, dr] of offsets) {
			const nf = f + df
			const nr = r + dr
			if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
				list.push(nr * 8 + nf)
			}
		}
		out[s] = list
	}
	return out
}

/** Knight targets per square. */
export const KNIGHT = leaper([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]])

/** King targets per square. */
export const KING = leaper([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]])

/** Pawn capture targets: PAWN_ATTACKS[colour][square] (0 White, 1 Black). */
export const PAWN_ATTACKS = [leaper([[-1, 1], [1, 1]]), leaper([[-1, -1], [1, -1]])]

/** Rays: RAYS[square * 8 + dir] = squares from the square outwards (dir as in DIRS). */
export const RAYS = (() => {
	const out = new Array(64 * 8)
	for (let s = 0; s < 64; s++) {
		for (let d = 0; d < 8; d++) {
			const list = []
			let f = (s & 7) + DIRS[d][0]
			let r = (s >> 3) + DIRS[d][1]
			while (f >= 0 && f < 8 && r >= 0 && r < 8) {
				list.push(r * 8 + f)
				f += DIRS[d][0]
				r += DIRS[d][1]
			}
			out[s * 8 + d] = list
		}
	}
	return out
})()

/**
 * Chebyshev distance between two squares.
 *
 * @param {number} a square
 * @param {number} b square
 * @return {number}
 */
export function distance(a, b) {
	return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)))
}

/**
 * Manhattan distance of a square from the centre (0 in the middle four squares, 6 in a corner).
 *
 * @param {number} s square
 * @return {number}
 */
export function centerDistance(s) {
	const f = s & 7
	const r = s >> 3
	return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4)
}

/**
 * Do squares f and t lie on a common line for a piece type (geometry only, empty board)?
 *
 * @param {string} type piece type letter
 * @param {number} f from square
 * @param {number} t to square
 * @return {boolean}
 */
export function reaches(type, f, t) {
	if (f === t) {
		return false
	}
	const df = Math.abs((f & 7) - (t & 7))
	const dr = Math.abs((f >> 3) - (t >> 3))
	switch (type) {
		case 'n':
			return (df === 1 && dr === 2) || (df === 2 && dr === 1)
		case 'b':
			return df === dr
		case 'r':
			return df === 0 || dr === 0
		case 'q':
			return df === dr || df === 0 || dr === 0
		case 'k':
			return df <= 1 && dr <= 1
		default:
			return false
	}
}

/**
 * The squares strictly between f and t on a line (empty for leapers or when not aligned).
 *
 * @param {number} f from square
 * @param {number} t to square
 * @return {number[]}
 */
export function between(f, t) {
	const df = (t & 7) - (f & 7)
	const dr = (t >> 3) - (f >> 3)
	if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) {
		return []
	}
	const sf = Math.sign(df)
	const sr = Math.sign(dr)
	const out = []
	let x = (f & 7) + sf
	let y = (f >> 3) + sr
	while (x !== (t & 7) || y !== (t >> 3)) {
		out.push(y * 8 + x)
		x += sf
		y += sr
	}
	return out
}
