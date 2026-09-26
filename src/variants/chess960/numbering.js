/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The 960 start positions of Chess960 and their numbers (Reinhard Scharnagl's scheme, the numbering lichess and FIDE
 * use): number 518 is the ordinary chess setup RNBQKBNR, 0 is BBQNNRKR and 959 is RKRNNQBB.
 */

/** The number of start positions. */
export const POSITIONS = 960

/** The number of the ordinary chess setup. */
export const ORTHODOX_POSITION = 518

/** The two files of the knights among the five files still free, for each value 0..9 of the knight digit. */
const KNIGHTS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]

/**
 * Whether a value is a valid start position number: an integer from 0 to 959.
 *
 * @param {unknown} n value
 * @return {boolean}
 */
export function isPosition(n) {
	return Number.isInteger(n) && n >= 0 && n < POSITIONS
}

/**
 * The files (0 = a) that are still free in a back rank under construction.
 *
 * @param {Array<string|null>} rank the back rank so far
 * @return {number[]}
 */
function freeFiles(rank) {
	const out = []
	for (let f = 0; f < rank.length; f++) {
		if (rank[f] === null) {
			out.push(f)
		}
	}
	return out
}

/**
 * The back rank of a start position, from file a to file h, in lower case (`518` gives `rnbqkbnr`): the light-squared
 * bishop by the number mod 4, the dark-squared bishop by the next digit mod 4, the queen on one of the six free files,
 * the knights on two of the five free files, then rook, king and rook on the last three free files.
 *
 * @param {number} n start position number, 0..959
 * @return {string}
 */
export function backRank960(n) {
	if (!isPosition(n)) {
		throw new Error('no Chess960 start position: ' + n)
	}
	const rank = new Array(8).fill(null)
	let rest = n
	rank[[1, 3, 5, 7][rest % 4]] = 'b'
	rest = Math.floor(rest / 4)
	rank[[0, 2, 4, 6][rest % 4]] = 'b'
	rest = Math.floor(rest / 4)
	rank[freeFiles(rank)[rest % 6]] = 'q'
	rest = Math.floor(rest / 6)
	const free = freeFiles(rank)
	for (const k of KNIGHTS[rest]) {
		rank[free[k]] = 'n'
	}
	freeFiles(rank).forEach((f, i) => {
		rank[f] = 'rkr'[i]
	})
	return rank.join('')
}

/**
 * The number of a back rank (the inverse of `backRank960`), or -1 when the text is not a Chess960 back rank.
 *
 * @param {string} rank eight letters from file a, in either case (`RNBQKBNR`)
 * @return {number}
 */
export function positionNumber(rank) {
	const r = String(rank).toLowerCase()
	if (r.length !== 8) {
		return -1
	}
	const light = [1, 3, 5, 7].findIndex((f) => r[f] === 'b')
	const dark = [0, 2, 4, 6].findIndex((f) => r[f] === 'b')
	if (light < 0 || dark < 0) {
		return -1
	}
	let free = [...r].map((p, f) => (p === 'b' ? -1 : f)).filter((f) => f >= 0)
	const queen = free.findIndex((f) => r[f] === 'q')
	free = free.filter((f) => r[f] !== 'q')
	const knights = free.map((f, i) => (r[f] === 'n' ? i : -1)).filter((i) => i >= 0)
	const knight = KNIGHTS.findIndex(([a, b]) => a === knights[0] && b === knights[1])
	if (queen < 0 || knights.length !== 2 || knight < 0) {
		return -1
	}
	const n = light + 4 * dark + 16 * queen + 96 * knight
	return backRank960(n) === r ? n : -1
}
