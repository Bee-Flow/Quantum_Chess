/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The move preview, the "odds card" (GAME-DESIGN §3.5.5): every number comes from `LegalMove.outcomes`,
 * `getOutcomes()` and `moveRisk()`, memoised per (position hash, code). Pure functions; the card components render
 * the result.
 */

import { t } from '@nextcloud/l10n'
import { budget, getOutcomes, linkGroups, moveRisk, pieceLocations, squareName, T } from '../../engine/index.js'
import {
	colorOfId,
	explainOutcome,
	figurine,
	formatProbability,
	joinOr,
	memoByHash,
	outcomeLabel,
	pieceTypeName,
	resolutionLabel,
	resolutionText,
	TEXT,
} from '../../engine/ui/index.js'

/** moveRisk per (position, code); the safety net needs it for the whole legal list. */
export const riskOf = memoByHash((state, move) => moveRisk(state, move.code ?? move), { size: 512 })

/** getOutcomes per (position, code). */
export const outcomesOf = memoByHash((state, move) => getOutcomes(state, move.code ?? move), { size: 128 })

/** explainOutcome per (position, code, key). */
const explainOf = memoByHash((state, move, key) => explainOutcome(state, move.code ?? move, key), { size: 128 })

/**
 * Figurine plus square ("♞d4").
 *
 * @param {object} state state (types)
 * @param {number} id piece id
 * @param {number} square square index
 * @return {string}
 */
function figSq(state, id, square) {
	return figurine(state.types[id], colorOfId(id)) + squareName(square)
}

/**
 * The explanation line of a Missed outcome, in the conditional tense of a preview.
 *
 * @param {object} state state before
 * @param {object} move LegalMove
 * @param {object} ex explainOutcome of `miss`
 * @return {string}
 */
function missLine(state, move, ex) {
	const piece = figurine(state.types[move.piece], colorOfId(move.piece))
	switch (ex.cause) {
	case 'absent':
		return t('quantumchess', 'Missed: your {piece} isn\'t on {from} in these possibilities.', { piece, from: joinOr(move.from.map(squareName)) }, undefined, TEXT)
	case 'blocked': {
		const b = ex.blockers[0]
		return t('quantumchess', 'Missed: {blocker} may be in the way.', { blocker: figSq(state, b.piece, b.square) }, undefined, TEXT)
	}
	case 'own_piece':
		return t('quantumchess', 'Missed: your own {occupant} may be on {square}.', {
			occupant: figurine(state.types[ex.occupant.piece], colorOfId(ex.occupant.piece)),
			square: squareName(move.to[0]),
		}, undefined, TEXT)
	case 'occupied':
		return t('quantumchess', 'Missed: {square} may be occupied by {occupant}.', {
			occupant: figurine(state.types[ex.occupant.piece], colorOfId(ex.occupant.piece)),
			square: squareName(move.to[0]),
		}, undefined, TEXT)
	default:
		return t('quantumchess', 'Missed: there may be nothing to capture on {square}.', { square: squareName(move.to[0]) }, undefined, TEXT)
	}
}

/**
 * Locations as "f3 50% · h3 50%".
 *
 * @param {Array<{square: number, weight: number}>} locs locations
 * @param {string} format probability format
 * @return {string}
 */
function spread(locs, format) {
	return locs.map((l) => squareName(l.square) + ' ' + formatProbability(l.weight, { format, weight: true })).join(' · ')
}

/**
 * The odds-card data of a legal move.
 *
 * Returns `{move, label, labelText, icon, piece, title, outcomes, lines, risk, riskText, whatIf}`:
 * - `label`: certain | quantum | roll | roll-budget; `labelText` its translated name;
 * - `outcomes`: for rolled moves `[{key, weight, probability, label, text}]` in key order, else [];
 * - `lines`: explanation lines `[{text, tone}]` (tone: neutral | quantum | success | warning);
 * - `risk`: `moveRisk` (0..1) and `riskText` ("Your king could then be captured: 25%"), only when > 0;
 * - `whatIf`: a square for the "What if? (E)" button (a ghost part involved in the move), or null.
 *
 * @param {object} state state before
 * @param {object} move LegalMove of `state`
 * @param {object} [options] options
 * @param {'percent'|'fraction'} [options.format] probability format
 * @param {boolean} [options.physics] physics names
 * @return {object}
 */
export function movePreview(state, move, { format = 'percent', physics = false } = {}) {
	const X = move.piece
	const color = colorOfId(X)
	const type = state.types[X]
	const fig = figurine(type, color)
	const label = resolutionLabel(move)
	const p = (w) => formatProbability(w, { format, weight: true })
	const locsBefore = pieceLocations(state)
	const from = move.from.map(squareName).join('|')
	const to = move.to.map(squareName).join('|')
	let title
	if (move.type === 'measure') {
		title = t('quantumchess', 'Measure {piece}', { piece: fig }, undefined, TEXT)
	} else {
		title = fig + ' ' + from + ' → ' + to
	}
	const lines = []
	let outcomes = []
	const outs = outcomesOf(state, move)

	if (move.resolution === 'rolled') {
		outcomes = move.outcomes.map((o) => ({
			key: o.key,
			weight: o.weight,
			probability: o.weight / T,
			label: outcomeLabel(o.key),
			text: outcomeLabel(o.key) + ' ' + p(o.weight),
		}))
		if (move.type === 'measure') {
			lines.push({ text: spread(locsBefore[X], format), tone: 'quantum' })
		} else {
			if (move.fallback) {
				lines.push({
					text: t('quantumchess', 'This would normally make your {piece} a ghost, but your budget is full, so it is settled with a roll.', { piece: pieceTypeName(type) }, undefined, TEXT),
					tone: 'quantum',
				})
			}
			for (const o of move.outcomes) {
				const ex = explainOf(state, move, o.key)
				if (o.key === 'miss') {
					lines.push({ text: missLine(state, move, ex), tone: 'neutral' })
				} else if (o.key === 'move' && ex.targetPiece !== null && ex.targetPieceAfter.length > 0) {
					lines.push({
						text: t('quantumchess', 'If Moved, {target} is on {where}.', {
							target: figurine(state.types[ex.targetPiece], colorOfId(ex.targetPiece)),
							where: spread(ex.targetPieceAfter, format),
						}, undefined, TEXT),
						tone: 'neutral',
					})
				}
			}
		}
	} else if (move.type === 'split') {
		const after = outs[0].state
		lines.push({
			text: t('quantumchess', '{piece} {spread} · budget {before} → {after}', {
				piece: fig,
				spread: spread(pieceLocations(after)[X], format),
				before: budget(state, color),
				after: budget(after, color),
			}, undefined, TEXT),
			tone: 'quantum',
		})
	} else if (move.type === 'merge' && !move.capture) {
		const after = outs[0].state
		lines.push({
			text: t('quantumchess', '{piece} {spread} · budget {before} → {after}', {
				piece: fig,
				spread: spread(pieceLocations(after)[X], format),
				before: budget(state, color),
				after: budget(after, color),
			}, undefined, TEXT),
			tone: 'quantum',
		})
	} else if (move.capture) {
		lines.push({ text: t('quantumchess', 'Certain capture. No dice.'), tone: 'success' })
	} else if (move.resolution === 'quantum') {
		const after = outs[0].state
		const locs = pieceLocations(after)[X]
		const arrive = locs.find((l) => l.square === move.to[0])
		const stay = locs.filter((l) => l.square !== move.to[0])
		let text = t('quantumchess', 'No dice. {piece} arrives {p}, stays on {from} {q}.', {
			piece: fig,
			p: p(arrive ? arrive.weight : 0),
			from: joinOr(stay.map((l) => squareName(l.square))),
			q: p(stay.reduce((s, l) => s + l.weight, 0)),
		}, undefined, TEXT)
		const group = linkGroups(after).find((g) => g.includes(X))
		if (group) {
			const others = group.filter((id) => id !== X).map((id) => {
				const l = pieceLocations(after)[id]
				return figSq(after, id, l.slice().sort((a, b) => b.weight - a.weight)[0].square)
			})
			text += ' ' + t('quantumchess', 'Linked to {pieces}.', { pieces: others.join(', ') }, undefined, TEXT)
		}
		lines.push({ text, tone: 'quantum' })
	} else {
		lines.push({ text: t('quantumchess', 'No dice.'), tone: 'neutral' })
	}

	const risk = riskOf(state, move)
	const riskText = risk > 0
		? t('quantumchess', 'Your king could then be captured: {p}', { p: formatProbability(risk * T, { format, weight: true }) }, undefined, TEXT)
		: null

	// The what-if view is useful when a ghost is involved: the moving piece's part, or a ghost on the target.
	let whatIf = null
	if (locsBefore[X].length > 1) {
		whatIf = move.from[0]
	} else if (move.to.length === 1) {
		const occ = outs.length > 1 ? explainOf(state, move, outs[0].key).targetPiece : null
		if (occ !== null && locsBefore[occ].length > 1) {
			whatIf = move.to[0]
		}
	}

	return {
		move,
		label,
		labelText: resolutionText(label, { physics }),
		piece: { type, color },
		title,
		outcomes,
		lines,
		risk,
		riskText,
		whatIf,
	}
}
