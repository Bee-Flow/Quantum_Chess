/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Precomputed geometry and lane tables (ENGINE-RULES §3.2, §4.2). Everything here is built once at module load.
 */

const EMPTY = Object.freeze([])

/** Type codes used internally: index into 'kqrbnp'. */
export const TYPE_K = 0
export const TYPE_Q = 1
export const TYPE_R = 2
export const TYPE_B = 3
export const TYPE_N = 4
export const TYPE_P = 5

/** 'kqrbnp' character → type code. */
export const TYPE_CODE = Object.freeze({ k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 })

/** Type code → character. */
export const TYPE_CHAR = 'kqrbnp'

/** The eight ray directions as [dFile, dRank]; 0..3 orthogonal, 4..7 diagonal. */
const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]

/** Directions a type code slides in (empty for non-sliders). */
export const SLIDE_DIRS = Object.freeze([[], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3], [4, 5, 6, 7], [], []])

/** RAYS[s * 8 + d] = squares from s (exclusive) in direction d, nearest first. */
export const RAYS = []

/** Knight targets per square. */
export const KNIGHT = []

/** King targets per square (adjacent squares). */
export const KING = []

/** LANE[f * 64 + t] = squares strictly between f and t on a line, nearest to f first; empty when not on a line. */
export const LANE = []

/** DIR_OF[f * 64 + t] = direction index from f to t on a line, or -1. */
export const DIR_OF = new Int8Array(4096).fill(-1)

/** GEO[type * 4096 + f * 64 + t] = 1 when G(type, f, t) holds (§3.2; pawns excluded, castling excluded). */
export const GEO = new Uint8Array(6 * 4096)

/** Geometric targets of non-pawn types per square: TARGETS[type][s] (ascending). */
export const TARGETS = [[], [], [], [], [], []]

/**
 * Pawn geometry for colour index ci (0 = White, 1 = Black):
 * PAWN_PUSH[ci][f] single push target or -1, PAWN_DOUBLE[ci][f] double push target or -1,
 * PAWN_CAPTURES[ci][f] diagonal targets, PAWN_ATTACKERS[ci][k] squares from which a pawn of colour ci attacks k.
 */
export const PAWN_PUSH = [new Int8Array(64).fill(-1), new Int8Array(64).fill(-1)]
export const PAWN_DOUBLE = [new Int8Array(64).fill(-1), new Int8Array(64).fill(-1)]
export const PAWN_CAPTURES = [[], []]
export const PAWN_ATTACKERS = [[], []]

/** Knight and king attacker squares are symmetric to their targets. */

/**
 * Build all tables.
 */
function build() {
	for (let s = 0; s < 64; s++) {
		const f = s & 7
		const r = s >> 3
		for (let d = 0; d < 8; d++) {
			const ray = []
			let ff = f + DIRECTIONS[d][0]
			let rr = r + DIRECTIONS[d][1]
			while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
				ray.push(rr * 8 + ff)
				ff += DIRECTIONS[d][0]
				rr += DIRECTIONS[d][1]
			}
			RAYS[s * 8 + d] = ray
			for (let i = 0; i < ray.length; i++) {
				const t = ray[i]
				LANE[s * 64 + t] = ray.slice(0, i)
				DIR_OF[s * 64 + t] = d
			}
		}
		const knight = []
		const king = []
		for (let t = 0; t < 64; t++) {
			const df = Math.abs((t & 7) - f)
			const dr = Math.abs((t >> 3) - r)
			if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) {
				knight.push(t)
			}
			if (t !== s && df <= 1 && dr <= 1) {
				king.push(t)
			}
		}
		KNIGHT[s] = knight
		KING[s] = king
	}
	for (let i = 0; i < 4096; i++) {
		if (LANE[i] === undefined) {
			LANE[i] = []
		}
	}
	for (let s = 0; s < 64; s++) {
		for (let t = 0; t < 64; t++) {
			if (s === t) {
				continue
			}
			const df = Math.abs((t & 7) - (s & 7))
			const dr = Math.abs((t >> 3) - (s >> 3))
			const i = s * 64 + t
			if (df <= 1 && dr <= 1) {
				GEO[TYPE_K * 4096 + i] = 1
			}
			if (df === dr) {
				GEO[TYPE_B * 4096 + i] = 1
				GEO[TYPE_Q * 4096 + i] = 1
			}
			if (df === 0 || dr === 0) {
				GEO[TYPE_R * 4096 + i] = 1
				GEO[TYPE_Q * 4096 + i] = 1
			}
			if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) {
				GEO[TYPE_N * 4096 + i] = 1
			}
		}
		for (let type = 0; type < 5; type++) {
			const list = []
			for (let t = 0; t < 64; t++) {
				if (GEO[type * 4096 + s * 64 + t]) {
					list.push(t)
				}
			}
			TARGETS[type][s] = list
		}
	}
	for (let ci = 0; ci < 2; ci++) {
		const dir = ci === 0 ? 8 : -8
		const startRank = ci === 0 ? 1 : 6
		for (let s = 0; s < 64; s++) {
			PAWN_ATTACKERS[ci][s] = []
		}
		for (let s = 0; s < 64; s++) {
			const f = s & 7
			const r = s >> 3
			const caps = []
			const t = s + dir
			if (t >= 0 && t < 64) {
				PAWN_PUSH[ci][s] = t
				if (r === startRank) {
					PAWN_DOUBLE[ci][s] = s + 2 * dir
				}
				// White: f + 7 needs file ≥ 1, f + 9 needs file ≤ 6. Black mirrors: f − 9 needs file ≥ 1, f − 7 needs file ≤ 6.
				if (f >= 1) {
					caps.push(t - 1)
				}
				if (f <= 6) {
					caps.push(t + 1)
				}
			}
			caps.sort((a, b) => a - b)
			PAWN_CAPTURES[ci][s] = caps
			for (const c of caps) {
				PAWN_ATTACKERS[ci][c].push(s)
			}
		}
	}
}

build()

/**
 * G(type, f, t) for a non-pawn type code (§3.2).
 *
 * @param {number} type type code
 * @param {number} f from square
 * @param {number} t to square
 * @return {boolean}
 */
export function geo(type, f, t) {
	return GEO[type * 4096 + f * 64 + t] === 1
}

/**
 * Pawn move kind for colour index ci: 'push', 'double', 'diagonal' or null (§4.2).
 *
 * @param {number} ci colour index (0 White, 1 Black)
 * @param {number} f from square
 * @param {number} t to square
 * @return {'push'|'double'|'diagonal'|null}
 */
export function pawnKind(ci, f, t) {
	if (PAWN_PUSH[ci][f] === t) {
		return 'push'
	}
	if (PAWN_DOUBLE[ci][f] === t) {
		return 'double'
	}
	const caps = PAWN_CAPTURES[ci][f]
	for (let i = 0; i < caps.length; i++) {
		if (caps[i] === t) {
			return 'diagonal'
		}
	}
	return null
}

/**
 * The lane of a move (§3.2): the squares strictly between f and t for sliders, the skipped square of a double push,
 * empty otherwise.
 *
 * @param {number} type type code
 * @param {number} f from square
 * @param {number} t to square
 * @return {number[]}
 */
export function laneOf(type, f, t) {
	if (type === TYPE_Q || type === TYPE_R || type === TYPE_B) {
		return LANE[f * 64 + t]
	}
	if (type === TYPE_P && Math.abs(t - f) === 16) {
		return [(f + t) >> 1]
	}
	return EMPTY
}
