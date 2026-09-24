/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The result sentence of a roll, from both points of view, with the rarity line; and a plain move sentence for the
 * screen-reader live region. The player sees the odds before a move and an explanation after it. Display only.
 */

import { n, t } from '@nextcloud/l10n'
import { findMove, pct, pieceLocations, squareName, T } from '../index.js'
import { explainOutcome } from './explainOutcome.js'
import { formatProbability } from './format.js'
import { capitalize, colorName, colorOfId, figurine, pieceName, pieceTypeName, sentenceCase, TEXT } from './pieces.js'

/**
 * Join square names with "or" ("f8", "f8 or g7", "a1, b2 or c3").
 *
 * @param {string[]} names square names
 * @return {string}
 */
export function joinOr(names) {
	if (names.length <= 1) {
		return names[0] ?? ''
	}
	return t('quantumchess', '{list} or {last}', { list: names.slice(0, -1).join(', '), last: names[names.length - 1] }, undefined, TEXT)
}

/**
 * Join items with "and".
 *
 * @param {string[]} items items
 * @return {string}
 */
function joinAnd(items) {
	if (items.length <= 1) {
		return items[0] ?? ''
	}
	return t('quantumchess', '{list} and {last}', { list: items.slice(0, -1).join(', '), last: items[items.length - 1] }, undefined, TEXT)
}

/**
 * Resolve a move input to the LegalMove of `state`.
 *
 * @param {object} state state before
 * @param {object|string} move LegalMove, move object or code
 * @return {object}
 */
function legal(state, move) {
	if (move && typeof move === 'object' && typeof move.code === 'string' && typeof move.piece === 'number') {
		return move
	}
	const found = findMove(state, move)
	if (found === null) {
		throw new RangeError('not a legal move of this position')
	}
	return found
}

/**
 * The texts of one roll, built twice: with figurines (`text`) and with piece names (`speech`).
 *
 * @param {object} ctx context
 * @param {(id: number) => string} P piece reference
 * @return {string}
 */
function sentence(ctx, P) {
	const { lm, key, ex, before, pov, moverName, viewer, p } = ctx
	const X = lm.piece
	const piece = P(X)
	const sq = squareName
	const vars = { piece, p, name: moverName }
	const whereOf = (locs) => joinOr(locs.map((l) => sq(l.square)))
	const fromText = joinOr(lm.from.map(sq))
	const mentioned = new Set([X])
	let text

	if (lm.type === 'measure') {
		vars.square = key
		text = pov === 'mover'
			? t('quantumchess', 'Measured: your {piece} is on {square} · {p}', vars, undefined, TEXT)
			: t('quantumchess', '{name} measured their {piece}: it\'s on {square} · {p}', vars, undefined, TEXT)
		const settled = ex.settled.map((s) => t('quantumchess', '{piece} settled on {square} with it.', { piece: P(s.piece), square: sq(s.square) }, undefined, TEXT))
		return [text, ...settled].join(' ')
	}

	const target = lm.to.length === 1 ? lm.to[0] : null
	vars.square = target === null ? '' : sq(target)
	vars.from = fromText

	if (key === 'capture') {
		const cap = ex.captured
		mentioned.add(cap)
		const capLoc = pieceLocations(before)[cap]
		const capSquare = capLoc.some((l) => l.square === target) || capLoc.length !== 1 ? target : capLoc[0].square
		vars.target = P(cap)
		vars.square = sq(capSquare)
		if (cap === 0 || cap === 16) {
			text = pov === 'mover'
				? t('quantumchess', '{target} captured! You win · {p}', vars, undefined, TEXT)
				: t('quantumchess', 'Your king was captured on {square} · {p}', vars, undefined, TEXT)
		} else {
			text = pov === 'mover'
				? t('quantumchess', 'Captured: {piece} took {target} on {square} · {p}', vars, undefined, TEXT)
				: t('quantumchess', '{name}\'s {piece} captured your {target} on {square} · {p}', vars, undefined, TEXT)
		}
	} else if (key === 'move') {
		const tp = ex.targetPiece
		if (tp !== null && ex.targetPieceAfter.length > 0) {
			mentioned.add(tp)
			vars.target = P(tp)
			vars.where = whereOf(ex.targetPieceAfter)
			if (pov === 'mover') {
				text = t('quantumchess', 'Moved: {square} was empty, the {target} is on {where}. {piece} is now on {square} · {p}', vars, undefined, TEXT)
			} else if (colorOfId(tp) === viewer) {
				text = t('quantumchess', '{name}\'s {piece} found {square} empty: your {target} is on {where} · {p}', vars, undefined, TEXT)
			} else {
				text = t('quantumchess', '{name}\'s {piece} found {square} empty: the {target} is on {where} · {p}', vars, undefined, TEXT)
			}
		} else {
			text = pov === 'mover'
				? t('quantumchess', 'Moved: {piece} is now on {square} · {p}', vars, undefined, TEXT)
				: t('quantumchess', '{name}\'s {piece} moved to {square} · {p}', vars, undefined, TEXT)
		}
	} else {
		// miss
		const after = ex.pieceAfter
		const stays = after.length === 1 && lm.from.includes(after[0].square)
		vars.where = whereOf(after)
		switch (ex.cause) {
			case 'absent':
				text = pov === 'mover'
					? t('quantumchess', 'Missed: your {piece} wasn\'t on {from}; it\'s on {where} · {p}', vars, undefined, TEXT)
					: t('quantumchess', '{name}\'s {piece} was on {where}, not {from}. Nothing moved · {p}', vars, undefined, TEXT)
				break
			case 'blocked': {
				const b = ex.blockers[0]
				mentioned.add(b.piece)
				vars.blocker = P(b.piece) + sq(b.square)
				vars.from = stays ? sq(after[0].square) : fromText
				if (pov === 'mover') {
					text = stays
						? t('quantumchess', 'Missed: {blocker} was in the way. {piece} stays on {from} · {p}', vars, undefined, TEXT)
						: t('quantumchess', 'Missed: {blocker} was in the way · {p}', vars, undefined, TEXT)
				} else {
					text = colorOfId(b.piece) === viewer
						? t('quantumchess', '{name}\'s {piece} was blocked by your {blocker} · {p}', vars, undefined, TEXT)
						: t('quantumchess', '{name}\'s {piece} was blocked by {name}\'s own {blocker} · {p}', vars, undefined, TEXT)
				}
				break
			}
			case 'own_piece': {
				const occ = ex.occupant.piece
				mentioned.add(occ)
				vars.occupant = P(occ)
				text = pov === 'mover'
					? t('quantumchess', 'Missed: your {occupant} was on {square}, so the {piece} couldn\'t land there · {p}', vars, undefined, TEXT)
					: t('quantumchess', '{name}\'s {piece} was stopped by {name}\'s own {occupant} · {p}', vars, undefined, TEXT)
				break
			}
			case 'occupied': {
				const occ = ex.occupant.piece
				mentioned.add(occ)
				vars.occupant = P(occ)
				if (pov === 'mover') {
					text = t('quantumchess', 'Missed: {square} was occupied by {occupant}. {piece} stays on {from} · {p}', vars, undefined, TEXT)
				} else {
					text = colorOfId(occ) === viewer
						? t('quantumchess', '{name}\'s pawn found your {occupant} on {square} · {p}', vars, undefined, TEXT)
						: t('quantumchess', '{name}\'s pawn found {name}\'s own {occupant} on {square} · {p}', vars, undefined, TEXT)
				}
				break
			}
			default: {
			// no_enemy: a pawn found nothing to capture
				const tp = ex.targetPiece
				if (tp !== null && ex.targetPieceAfter.length > 0) {
					mentioned.add(tp)
					vars.target = P(tp)
					vars.where = whereOf(ex.targetPieceAfter)
					text = pov === 'mover'
						? t('quantumchess', 'Missed: {square} was empty, the {target} is on {where}. {piece} stays on {from} · {p}', vars, undefined, TEXT)
						: t('quantumchess', '{name}\'s pawn found {square} empty: your {target} is on {where} · {p}', vars, undefined, TEXT)
				} else {
					text = pov === 'mover'
						? t('quantumchess', 'Missed: there was nothing to capture on {square} · {p}', vars, undefined, TEXT)
						: t('quantumchess', '{name}\'s pawn found nothing to capture on {square} · {p}', vars, undefined, TEXT)
				}
			}
		}
	}
	const settled = ex.settled
		.filter((s) => !mentioned.has(s.piece))
		.map((s) => t('quantumchess', '{piece} settled on {square}.', { piece: P(s.piece), square: sq(s.square) }, undefined, TEXT))
	if (lm.fallback && pov === 'mover') {
		text = t('quantumchess', 'Rolled because your budget was full.') + ' ' + text
	}
	return [text, ...settled].join(' ')
}

/**
 * The result sentence of a rolled move.
 *
 * Returns null for moves without a measurement record: nothing random happened, so there is no result chip.
 * Otherwise `{glyph, text, rarity, speech, key, weight, probability, tone}`:
 * - `glyph` is ✓ for Captured and ○ for every other result (results never use error red);
 * - `text` uses figurines, `speech` piece names (for the live region);
 * - `rarity` is "A 1-in-N result." (p ≤ 20 %) or, for the mover, "Unlucky: that capture was 85% likely." when a
 *   capture of at least 80 % did not happen; null otherwise. Never taunting.
 *
 * Callers may pass the state after the move as `after`; it is ignored, because the explanation replays the move.
 *
 * @param {object} input input
 * @param {object} input.before state before the move
 * @param {object|string} input.move the LegalMove (or its code)
 * @param {object|null} input.measurement the measurement record
 * @param {'mover'|'opponent'} [input.pov] point of view
 * @param {{mover?: string, opponent?: string}} [input.names] display names
 * @param {'percent'|'fraction'} [input.format] probability format
 * @return {null|{glyph: string, text: string, rarity: string|null, speech: string, key: string, weight: number, probability: number, tone: 'capture'|'neutral'}}
 */
export function resultSentence({ before, move, measurement, pov = 'mover', names = {}, format = 'percent' }) {
	if (!measurement) {
		return null
	}
	const lm = legal(before, move)
	const key = measurement.key
	const outcome = measurement.outcomes.find((o) => o.key === key)
	const weight = outcome ? outcome.weight : T
	const moverColor = colorOfId(lm.piece)
	const viewer = pov === 'mover' ? moverColor : (moverColor === 'w' ? 'b' : 'w')
	const ex = explainOutcome(before, lm.code, key)
	const ctx = {
		lm,
		key,
		ex,
		before,
		pov,
		viewer,
		moverName: names.mover || colorName(moverColor),
		p: formatProbability(weight, { format, weight: true }),
	}
	const fig = (id) => figurine(before.types[id], colorOfId(id))
	const name = (id) => pieceName(before.types[id], colorOfId(id))
	const text = sentence(ctx, fig)
	const speech = sentenceCase(sentence(ctx, name))

	const probability = weight / T
	const capture = measurement.outcomes.find((o) => o.key === 'capture')
	let rarity = null
	if (pov === 'mover' && key !== 'capture' && capture && capture.weight / T >= 0.8) {
		rarity = t('quantumchess', 'Unlucky: that capture was {q} likely.', { q: formatProbability(capture.weight, { format, weight: true }) }, undefined, TEXT)
	} else if (probability <= 0.2) {
		rarity = t('quantumchess', 'A 1-in-{n} result.', { n: Math.round(1 / probability) }, undefined, TEXT)
	}
	return {
		glyph: key === 'capture' ? '✓' : '○',
		text,
		rarity,
		speech,
		key,
		weight,
		probability,
		tone: key === 'capture' ? 'capture' : 'neutral',
	}
}

/**
 * Spoken percentage ("50 percent").
 *
 * @param {number} weight weight 0..T
 * @return {string}
 */
function spokenPercent(weight) {
	return n('quantumchess', '%n percent', '%n percent', pct(weight))
}

/**
 * A plain sentence for a move, for the screen-reader live region: "White knight splits from g1
 * to f3 and h3, 50 percent each." For rolled moves it is the spoken result sentence.
 *
 * @param {object} input input
 * @param {object} input.before state before
 * @param {object} input.after state after
 * @param {object|string} input.move the LegalMove (or its code)
 * @param {object|null} [input.measurement] measurement record of a rolled move
 * @param {'mover'|'opponent'} [input.pov] point of view for rolls
 * @param {{mover?: string, opponent?: string}} [input.names] display names
 * @return {string}
 */
export function moveSentence({ before, after, move, measurement = null, pov = 'mover', names = {} }) {
	const lm = legal(before, move)
	if (measurement) {
		return resultSentence({ before, move: lm, measurement, pov, names }).speech
	}
	const color = colorOfId(lm.piece)
	const piece = capitalize(pieceName(before.types[lm.piece], color))
	const sq = squareName
	const locs = pieceLocations(after)[lm.piece]
	const spread = locs.map((l) => t('quantumchess', '{square} {percent}', { square: sq(l.square), percent: spokenPercent(l.weight) }, undefined, TEXT))
	if (lm.type === 'split') {
		const even = locs.length === 2 && locs[0].weight === locs[1].weight
		return even
			? t('quantumchess', '{piece} splits from {from} to {a} and {b}, 50 percent each.', { piece, from: sq(lm.from[0]), a: sq(lm.to[0]), b: sq(lm.to[1]) }, undefined, TEXT)
			: t('quantumchess', '{piece} splits from {from} to {a} and {b}: {spread}.', { piece, from: sq(lm.from[0]), a: sq(lm.to[0]), b: sq(lm.to[1]), spread: joinAnd(spread) }, undefined, TEXT)
	}
	if (lm.type === 'merge') {
		const text = t('quantumchess', '{piece} merges from {a} and {b} to {to}.', { piece, a: sq(lm.from[0]), b: sq(lm.from[1]), to: sq(lm.to[0]) }, undefined, TEXT)
		const captured = after.captured.filter((id) => !before.captured.includes(id))
		const extra = captured.length > 0
			? ' ' + t('quantumchess', 'It captures the {target}.', { target: pieceName(before.types[captured[0]], colorOfId(captured[0])) }, undefined, TEXT)
			: ''
		return locs.length > 1 ? text + extra + ' ' + t('quantumchess', 'Now {spread}.', { spread: joinAnd(spread) }, undefined, TEXT) : text + extra
	}
	const from = lm.from[0]
	const to = lm.to[0]
	if (before.types[lm.piece] === 'k' && Math.abs(to - from) === 2) {
		return to > from
			? t('quantumchess', '{color} castles kingside.', { color: colorName(color) }, undefined, TEXT)
			: t('quantumchess', '{color} castles queenside.', { color: colorName(color) }, undefined, TEXT)
	}
	const captured = after.captured.filter((id) => !before.captured.includes(id))
	let text = captured.length > 0
		? t('quantumchess', '{piece} takes {target} on {square}.', { piece, target: pieceName(before.types[captured[0]], colorOfId(captured[0])), square: sq(to) }, undefined, TEXT)
		: t('quantumchess', '{piece} moves from {from} to {to}.', { piece, from: sq(from), to: sq(to) }, undefined, TEXT)
	if (lm.promo) {
		text += ' ' + t('quantumchess', 'It promotes to a {type}.', { type: pieceTypeName(lm.promo) }, undefined, TEXT)
	}
	if (lm.resolution === 'quantum' && locs.length > 1) {
		text += ' ' + t('quantumchess', 'Now {spread}.', { spread: joinAnd(spread) }, undefined, TEXT)
	}
	return text
}
