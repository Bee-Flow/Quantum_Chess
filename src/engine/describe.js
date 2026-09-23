/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Plain-text position description for LLM prompts (ENGINE-RULES Appendix B, non-normative). English only: it is
 * model input, not UI copy.
 */

import { analyse, positions } from './analysis.js'
import { budget } from './analysis.js'
import { BUDGET, T } from './constants.js'
import { kingDanger } from './danger.js'
import { TYPE_CHAR } from './geometry.js'
import { generateMoves } from './legality.js'
import { certainFen } from './setup.js'
import { SQUARE_NAMES } from './squares.js'
import { links, pct } from './views.js'

const TYPE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }

/**
 * Piece name, e.g. "White rook".
 *
 * @param {object} state engine state
 * @param {number} id piece id
 * @param {boolean} [lower] lower-case colour word
 * @return {string}
 */
function pieceName(state, id, lower = false) {
	const colour = id < 16 ? 'White' : 'Black'
	return (lower ? colour.toLowerCase() : colour) + ' ' + TYPE_NAMES[state.types[id]]
}

/**
 * Short description of one legal move.
 *
 * @param {object} state engine state
 * @param {object} m LegalMove
 * @return {string}
 */
function describeMove(state, m) {
	const odds = m.outcomes.map((o) => o.key + ' ' + pct(o.weight) + '%').join(', ')
	switch (m.resolution) {
		case 'certain':
			return m.code + (m.capture ? ' (certain capture)' : ' (certain)')
		case 'quantum':
			return m.code + ' (quantum: happens ' + pct(m.happenWeight) + '%, no roll)'
		default:
			if (m.type === 'measure') {
				return m.code + ' (measure: ' + m.outcomes.map((o) => o.key + ' ' + pct(o.weight) + '%').join(', ') + ')'
			}
			return m.code + ' (' + (m.fallback ? 'roll, budget full' : 'roll') + ': ' + odds + ')'
	}
}

/**
 * Describe a position for a language model (Appendix B).
 *
 * @param {object} state valid engine state
 * @param {{color?: 'w'|'b'}} [options] the model's colour (defaults to the side to move)
 * @return {string}
 */
export function describeForLlm(state, options = {}) {
	const a = analyse(state)
	const me = options.color ?? state.turn
	const lines = []
	const side = (c) => (c === 'w' ? 'White' : 'Black')
	lines.push('Quantum Chess (rules v1). You are ' + side(me) + '. Move ' + state.fullmove + ', ' + side(state.turn) + ' to move.')
	lines.push('Certain pieces (FEN, uncertain pieces removed): ' + certainFen(state))
	const ghosts = []
	for (let id = 0; id < 32; id++) {
		if (a.locs[id].length > 1) {
			ghosts.push('- ' + pieceName(state, id) + ': '
				+ a.locs[id].map((s, j) => SQUARE_NAMES[s] + ' ' + pct(a.locW[id][j]) + '%').join(', '))
		}
	}
	lines.push(ghosts.length === 0 ? 'Uncertain pieces: none' : 'Uncertain pieces:')
	lines.push(...ghosts)
	const linkLines = links(state).map(([x, y]) => {
		// Name the most likely joint placement of the pair.
		const px = positions(a, x)
		const py = positions(a, y)
		const joint = new Map()
		for (let i = 0; i < a.n; i++) {
			const k = px[i] * 64 + py[i]
			joint.set(k, (joint.get(k) ?? 0) + a.weights[i])
		}
		let bestK = -1
		let bestW = -1
		for (const [k, w] of joint) {
			if (w > bestW) {
				bestW = w
				bestK = k
			}
		}
		const sx = Math.floor(bestK / 64)
		const sy = bestK % 64
		const wx = a.locW[x][a.locs[x].indexOf(sx)]
		return pieceName(state, x, true) + ' ' + SQUARE_NAMES[sx] + ' <-> ' + pieceName(state, y, true) + ' '
			+ SQUARE_NAMES[sy] + ' (' + TYPE_NAMES[state.types[y]] + ' on ' + SQUARE_NAMES[sy] + ' in '
			+ pct(bestW * T / wx) + '% of the cases where the ' + TYPE_NAMES[state.types[x]] + ' is on ' + SQUARE_NAMES[sx] + ')'
	})
	lines.push('Links: ' + (linkLines.length === 0 ? 'none' : linkLines.join('; ')))
	lines.push('Possibilities: ' + a.n + '. Budget: White ' + budget(state, 'w') + '/' + BUDGET + ', Black '
		+ budget(state, 'b') + '/' + BUDGET + '. King danger: White ' + pct(kingDanger(state, 'w')) + '%, Black '
		+ pct(kingDanger(state, 'b')) + '%.')
	if (state.result !== null) {
		lines.push('Game over: ' + state.result.result + ' (' + state.result.reason + ').')
		return lines.join('\n')
	}
	const moves = generateMoves(state)
	const nonSplit = moves.filter((m) => m.type !== 'split')
	lines.push('Legal moves: ' + nonSplit.map((m) => describeMove(state, m)).join('; '))
	const splitsByFrom = new Map()
	for (const m of moves) {
		if (m.type === 'split') {
			const key = m.from[0]
			if (!splitsByFrom.has(key)) {
				splitsByFrom.set(key, new Set())
			}
			splitsByFrom.get(key).add(m.to[0])
			splitsByFrom.get(key).add(m.to[1])
		}
	}
	if (splitsByFrom.size > 0) {
		const parts = []
		for (const [f, targets] of splitsByFrom) {
			const id = a.occ[f]
			parts.push(TYPE_CHAR[a.typeCodes[id]].toUpperCase() + SQUARE_NAMES[f] + ' may split to two of: '
				+ [...targets].sort((x, y) => x - y).map((s) => SQUARE_NAMES[s]).join(', '))
		}
		lines.push('Splits (code from-t1|t2): ' + parts.join('; '))
	}
	return lines.join('\n')
}
