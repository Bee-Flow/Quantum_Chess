/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What is on the board, derived from the rules engine's views: the pieces to draw (with their probabilities, identity
 * colours and what-if changes), king rings, the last-move squares, square labels for screen readers, the reveal arrow
 * and the outcome ring of a roll. Pure and memoised per position hash; `boardScene.js` turns it into shapes.
 */

import { n, t } from '@nextcloud/l10n'
import {
	conditionalView,
	kingDanger,
	links,
	pct,
	pieceLocations,
	squareName,
	squareView,
	T,
} from '../engine/index.js'
import { explainOutcome, memoByHash, pieceName, TEXT } from '../engine/ui/index.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/** squareView + pieceLocations + links of a position. */
export const viewsOf = memoByHash((state) => ({
	view: squareView(state),
	locs: pieceLocations(state),
	links: links(state),
}), { size: 32 })

const conditionalOf = memoByHash((state, square) => conditionalView(state, square), { size: 16 })

/**
 * The pieces to draw.
 *
 * Each item: `{key, piece, square, type, color, weight, probability, ghost, parts, idColor, chosen, impossible,
 * delta}`. `key` is `<piece id>:<square>`. With `whatIf` (a square holding a ghost part) the probabilities are the
 * conditional ones (docs/engine-rules.md §8): `chosen` marks that part, `impossible` a part that cannot be there in
 * this case, and `delta` (`{up, percent}`) a square whose chance changed by at least one percentage point.
 *
 * @param {EngineState} state engine state
 * @param {object} [options] options
 * @param {number|null} [options.whatIf] what-if square
 * @param {Record<number, number>} [options.identity] identity colours (id → 1..6)
 * @return {object[]}
 */
export function pieceItems(state, { whatIf = null, identity = {} } = {}) {
	const { view, locs } = viewsOf(state)
	const cond = whatIf === null || view[whatIf] === null ? null : conditionalOf(state, whatIf)
	const out = []
	for (let square = 0; square < 64; square++) {
		const v = view[square]
		if (v === null) {
			continue
		}
		const parts = locs[v.piece].map((l) => l.square)
		let weight = v.weight
		let impossible = false
		let delta = null
		if (cond !== null) {
			const c = cond[square]
			// conditionalView weights are not normalised; the conditional probability is `probability`
			const w = c === null ? 0 : Math.round(c.probability * T)
			impossible = c === null
			const before = pct(v.weight)
			const after = pct(w)
			if (Math.abs(after - before) >= 1) {
				delta = { up: after > before, percent: after }
			}
			weight = impossible ? v.weight : w
		}
		out.push({
			key: v.piece + ':' + square,
			piece: v.piece,
			square,
			type: v.type,
			color: v.color,
			weight,
			probability: weight / T,
			ghost: weight < T,
			parts,
			idColor: parts.length > 1 ? (identity[v.piece] ?? null) : null,
			chosen: whatIf === square && cond !== null,
			impossible,
			delta,
		})
	}
	return out
}

/**
 * King rings for the given colours.
 *
 * @param {EngineState} state engine state
 * @param {Array<'w'|'b'>} colors whose kings to check
 * @return {Array<{color: string, square: number, weight: number, percent: number, certain: boolean}>}
 */
export function kingRings(state, colors) {
	const { locs } = viewsOf(state)
	const out = []
	for (const color of colors) {
		const king = locs[color === 'w' ? 0 : 16]
		if (king.length === 0) {
			continue
		}
		const weight = kingDanger(state, color)
		if (weight > 0) {
			out.push({ color, square: king[0].square, weight, percent: pct(weight), certain: weight >= T })
		}
	}
	return out
}

/**
 * Squares of the last move: filled, or outlined with a dashed line for a Missed ("attempted").
 *
 * @param {{move: object, key?: string|null}|null} lastMove last move
 * @return {{fill: number[], dashed: number[]}}
 */
export function lastMoveSquares(lastMove) {
	if (!lastMove || !lastMove.move) {
		return { fill: [], dashed: [] }
	}
	const m = lastMove.move
	const squares = [...new Set([...(m.from ?? []), ...(m.to ?? [])])]
	return lastMove.key === 'miss' ? { fill: [], dashed: squares } : { fill: squares, dashed: [] }
}

/**
 * Spoken percentage ("50 percent").
 *
 * @param {number} weight weight 0..T
 * @return {string}
 */
function spoken(weight) {
	return n('quantumchess', '%n percent', '%n percent', pct(weight))
}

/**
 * The accessible label of a square: "f3, white knight, 50 percent, also on h3".
 *
 * @param {EngineState} state engine state
 * @param {number} square square index
 * @return {string}
 */
export function squareLabel(state, square) {
	const { view, locs } = viewsOf(state)
	const v = view[square]
	const name = squareName(square)
	if (v === null) {
		return t('quantumchess', '{square}, empty', { square: name }, undefined, TEXT)
	}
	const piece = pieceName(v.type, v.color)
	if (v.weight >= T) {
		return t('quantumchess', '{square}, {piece}', { square: name, piece }, undefined, TEXT)
	}
	const others = locs[v.piece].filter((l) => l.square !== square).map((l) => squareName(l.square))
	return t('quantumchess', '{square}, {piece}, {percent}, also on {others}', {
		square: name,
		piece,
		percent: spoken(v.weight),
		others: others.join(', '),
	}, undefined, TEXT)
}

/**
 * The reveal arrow of a roll: from the attempted square to where the ghost really was, when the
 * result depends on it; otherwise null.
 *
 * @param {EngineState} before state before the move
 * @param {LegalMove} move the move
 * @param {object|null} measurement measurement record
 * @return {{from: number, to: number}|null}
 */
export function revealArrow(before, move, measurement) {
	if (!measurement || move.type === 'measure') {
		return null
	}
	let ex
	try {
		ex = explainOutcome(before, move.code, measurement.key)
	} catch {
		return null
	}
	if (measurement.key === 'miss' && ex.cause === 'absent' && ex.pieceAfter.length === 1) {
		const to = ex.pieceAfter[0].square
		return move.from.includes(to) && move.from.length === 1 ? null : { from: move.from[0], to }
	}
	if (measurement.key !== 'capture' && ex.targetPiece !== null && ex.targetPieceAfter.length === 1
		&& move.to.length === 1) {
		const to = ex.targetPieceAfter[0].square
		return to === move.to[0] ? null : { from: move.to[0], to }
	}
	return null
}

/**
 * The square of the outcome ring: the target, or for a Measure the part that was chosen.
 *
 * @param {LegalMove} move the move
 * @return {number}
 */
export function ringSquare(move) {
	return move.type === 'measure' ? move.from[0] : move.to[move.to.length - 1]
}

/**
 * Segments of the outcome ring, in key order, as fractions of the circle.
 *
 * @param {Array<{key: string, weight: number}>} outcomes outcomes of the LegalMove
 * @return {Array<{key: string, start: number, length: number, tone: string}>}
 */
export function ringSegments(outcomes) {
	const total = outcomes.reduce((s, o) => s + o.weight, 0) || T
	let start = 0
	return outcomes.map((o, i) => {
		const length = o.weight / total
		const seg = {
			key: o.key,
			start,
			length,
			tone: o.key === 'capture'
				? 'capture'
				: (o.key === 'move' ? 'move' : (o.key === 'miss' ? 'miss' : (i % 2 === 0 ? 'move' : 'miss'))),
		}
		start += length
		return seg
	})
}

/**
 * Where entering pieces come from in a move animation: for every new `<id>:<square>` key of `after`, the square it
 * slides from (the moving piece from its source, other pieces such as the castling rook from their old square).
 *
 * @param {EngineState} before state before
 * @param {EngineState} after state after
 * @param {LegalMove} move the move
 * @param {object} [options] options
 * @param {boolean} [options.skipMover] leave the moving piece out (it already travelled)
 * @return {{origins: Record<string, number>, instantLeave: string[]}}
 */
export function travelPlan(before, after, move, { skipMover = false } = {}) {
	const lb = viewsOf(before).locs
	const la = viewsOf(after).locs
	const origins = {}
	const instantLeave = []
	for (let id = 0; id < 32; id++) {
		const b = lb[id].map((l) => l.square)
		const a = la[id].map((l) => l.square)
		if (a.length === 0 || (a.length === b.length && a.every((s) => b.includes(s)))) {
			continue
		}
		if (id === move.piece && skipMover) {
			continue
		}
		let from
		if (id === move.piece) {
			from = move.type === 'merge'
				? move.from.slice().sort((x, y) => (lb[id].find((l) => l.square === y)?.weight ?? 0)
					- (lb[id].find((l) => l.square === x)?.weight ?? 0))[0]
				: move.from[0]
		} else if (b.length > 0) {
			from = lb[id].slice().sort((x, y) => y.weight - x.weight)[0].square
		} else {
			continue
		}
		let moved = false
		for (const s of a) {
			if (!b.includes(s)) {
				origins[id + ':' + s] = from
				moved = true
			}
		}
		if (moved && !a.includes(from)) {
			instantLeave.push(id + ':' + from)
		}
	}
	return { origins, instantLeave }
}
