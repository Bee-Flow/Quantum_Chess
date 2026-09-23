/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * diffViews (GAME-DESIGN §3.6.1 "Collapse"): what changed on every square and for every piece between two states,
 * so the board can animate appear / vanish / solidify / fade / move. JS-only and display-only.
 */

import { T } from '../constants.js'
import { pieceLocations, squareView } from '../views.js'

/**
 * Compare two states.
 *
 * `squares[s]` is null when nothing changed, otherwise `{kind, piece, before, after, beforePiece, afterPiece}`:
 * - `appear`: nothing could stand there before, now `piece` can;
 * - `vanish`: `piece` could stand there before and cannot now (a part that disappeared or moved away);
 * - `captured`: the piece that stood there was captured (it may have been replaced by the captor);
 * - `replace`: a different piece stands there now (the old one moved away or was captured elsewhere);
 * - `solidify`: the same piece, now certain (weight T);
 * - `grow` / `fade`: the same piece with a higher / lower (non-zero) weight.
 *
 * `pieces` lists every piece whose locations changed: `{piece, kind, from, to, before, after}` where `kind` is
 * `captured`, `settled` (a ghost became certain on one of its squares, e.g. linked pieces collapsing with a roll),
 * `ghost` (a certain piece became a ghost), `moved` (squares changed) or `reweighted` (same squares, new weights);
 * `from` are the squares it left and `to` the squares it reached. `captured`, `settled` and `ghosts` repeat the
 * ids for convenience.
 *
 * @param {object} before state before
 * @param {object} after state after
 * @return {{squares: Array<null|object>, pieces: object[], captured: number[], settled: number[], ghosts: number[]}}
 */
export function diffViews(before, after) {
	const vb = squareView(before)
	const va = squareView(after)
	const capturedNow = new Set(after.captured.filter((id) => !before.captured.includes(id)))
	const squares = new Array(64).fill(null)
	for (let s = 0; s < 64; s++) {
		const b = vb[s]
		const x = va[s]
		if (b === null && x === null) {
			continue
		}
		const entry = {
			kind: null,
			piece: x !== null ? x.piece : b.piece,
			before: b === null ? 0 : b.weight,
			after: x === null ? 0 : x.weight,
			beforePiece: b === null ? null : b.piece,
			afterPiece: x === null ? null : x.piece,
		}
		if (b === null) {
			entry.kind = 'appear'
		} else if (x === null) {
			entry.kind = capturedNow.has(b.piece) ? 'captured' : 'vanish'
			entry.piece = b.piece
		} else if (b.piece !== x.piece) {
			entry.kind = capturedNow.has(b.piece) ? 'captured' : 'replace'
		} else if (b.weight === x.weight) {
			continue
		} else if (x.weight === T) {
			entry.kind = 'solidify'
		} else {
			entry.kind = x.weight > b.weight ? 'grow' : 'fade'
		}
		squares[s] = entry
	}
	const lb = pieceLocations(before)
	const la = pieceLocations(after)
	const pieces = []
	const settled = []
	const ghosts = []
	for (let id = 0; id < 32; id++) {
		const pb = lb[id]
		const pa = la[id]
		if (pb.length === 0) {
			continue
		}
		const sb = pb.map((l) => l.square)
		const sa = pa.map((l) => l.square)
		const from = sb.filter((q) => !sa.includes(q))
		const to = sa.filter((q) => !sb.includes(q))
		let kind = null
		if (pa.length === 0) {
			kind = 'captured'
		} else if (pb.length > 1 && pa.length === 1 && from.length > 0 && to.length === 0) {
			kind = 'settled'
			settled.push(id)
		} else if (pb.length === 1 && pa.length > 1) {
			kind = 'ghost'
			ghosts.push(id)
		} else if (from.length > 0 || to.length > 0) {
			kind = 'moved'
		} else if (pb.some((l, j) => l.weight !== pa[j].weight)) {
			kind = 'reweighted'
		}
		if (kind !== null) {
			pieces.push({ piece: id, kind, from, to, before: pb, after: pa })
		}
	}
	return { squares, pieces, captured: [...capturedNow], settled, ghosts }
}
