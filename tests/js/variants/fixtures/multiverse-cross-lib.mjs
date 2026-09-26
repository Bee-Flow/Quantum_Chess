/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The engine-neutral form of multiverse moves shared by the cross-check fixture's generator (multiverse-cross.mjs) and
 * its test (tests/js/variants/multiverse-cross.spec.js).
 *
 * A move is written `l:v:xy>l:v:xy` for its source and target: the timeline `l` (0, +1 = 1, −1 = −1; an even start
 * has −0 = −1 and +0 = 0), the half-turn index `v` (T1 White to move is 2, T1 Black 3) and the cell (file, then rank,
 * from 0). A castling move is the king's move; a promotion is not written (both engines promote to a queen only).
 */

import { fnv1a64 } from '../../../../src/engine/index.js'
import { genMoves } from '../../../../src/variants/multiverse/moves.js'
import { RIDES } from '../../../../src/variants/multiverse/pieces.js'
import { decode, lOf, sqOf, uOf } from '../../../../src/variants/multiverse/skeleton.js'

/**
 * The signature of a move from its source and target `[l, v, x, y]`.
 *
 * @param {number[]} a source
 * @param {number[]} b target
 * @return {string}
 */
export function sig(a, b) {
	return a[0] + ':' + a[1] + ':' + a[2] + a[3] + '>' + b[0] + ':' + b[1] + ':' + b[2] + b[3]
}

/**
 * The parts of a signature: `[[l, v, x, y], [l, v, x, y]]`.
 *
 * @param {string} s signature
 * @return {number[][]}
 */
export function unsig(s) {
	return s.split('>').map((p) => {
		const [l, v, xy] = p.split(':')
		return [Number(l), Number(v), Number(xy[0]), Number(xy[1])]
	})
}

/**
 * The signature of a move of the app.
 *
 * @param {object} x the world's extra state
 * @param {object} m move
 * @param {boolean[]|null} [pass] rows passed virtually (the phantom of 5D check)
 * @return {string}
 */
export function appSig(x, m, pass = null) {
	const e = m.extra
	const f = decode(m.from)
	const v = x.tl[e.u][1] + (pass && pass[e.u] ? 1 : 0)
	return sig([lOf(e.u, x.md), v, f.x, f.y], [lOf(e.tu, x.md), e.tv, e.tx, e.ty])
}

/**
 * The app's moves of a side as signatures, with the cap of new timelines lifted when asked (`m` 99: every branch the
 * rules allow, whatever the number of timelines opened; the rows themselves stay within the app's capacity).
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {object} [opts] options
 * @param {boolean} [opts.lift] lift the cap
 * @param {boolean[]|null} [opts.pass] rows passed virtually (the phantom of 5D check)
 * @return {Map<string, object>} signature → move
 */
export function appMoves(w, side, { lift = false, pass = null } = {}) {
	const b = lift ? { ...w, x: { ...w.x, m: 99 } } : w
	const out = new Map()
	for (const m of genMoves(b, side, { pass })) {
		out.set(appSig(w.x, m, pass), m)
	}
	return out
}

/**
 * The count and hash of a signature list, sorted (the first 48 bits of FNV-1a-64 over the list, joined by spaces).
 *
 * @param {Iterable<string>} sigs signatures
 * @return {[number, string]}
 */
export function digest(sigs) {
	const list = [...sigs].sort()
	return [list.length, list.length ? fnv1a64(list.join(' ')).slice(0, 12) : '']
}

/**
 * Whether board (l, v) is stored in the world but sealed: older than the travel reach, given the latest boards.
 *
 * @param {object} x the world's extra state
 * @param {number[]} ends latest board per row (−1 for a missing row)
 * @param {number} l line
 * @param {number} v half-turn index
 * @return {boolean}
 */
function sealed(x, ends, l, v) {
	const u = uOf(l, x.md)
	return u >= 0 && x.tl[u] !== null && v >= x.tl[u][0] && v <= ends[u] && ends[u] - v > x.h
}

/**
 * Why the app has no move of this signature because of the travel reach: `reach` when its target board is sealed,
 * `reachPath` when a rider or a pawn's double step passes a sealed board; null otherwise.
 *
 * @param {object} w world
 * @param {string} s signature
 * @param {boolean[]|null} [pass] rows passed virtually (the phantom of 5D check)
 * @return {string|null}
 */
export function reachCut(w, s, pass = null) {
	const x = w.x
	const ends = x.tl.map((e, u) => (e === null ? -1 : e[1] + (pass && pass[u] ? 1 : 0)))
	const [a, b] = unsig(s)
	if (sealed(x, ends, b[0], b[1])) {
		return 'reach'
	}
	const u0 = uOf(a[0], x.md)
	const id = u0 < 0 ? -1 : w.board[sqOf(u0, 0, a[2], a[3])]
	const type = id >= 0 ? w.ty[id][0] : ''
	if (RIDES[type] || type === 'p' || type === 'w') {
		const d = [b[2] - a[2], b[3] - a[3], (b[1] - a[1]) / 2, b[0] - a[0]]
		const k = Math.max(...d.map(Math.abs))
		for (let j = 1; j < k; j++) {
			if (sealed(x, ends, a[0] + (j * d[3]) / k, a[1] + (2 * j * d[2]) / k)) {
				return 'reachPath'
			}
		}
	}
	return null
}
