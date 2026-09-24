/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Candidate moves for an LLM opponent: the best moves at the chosen strength, each with its expected score **for the
 * side to move**, machine tags that the server's prompt builder turns into English, and `ok` (✓): within the
 * persona's tolerance of the best. The language model then picks one of them.
 *
 * Tag grammar: `king-capture:<pct>`, `certain-capture`, `converging`, `traps-king`, `capture:<pct>:<type>`,
 * `threatens-king:<pct>`, `probe`, `split`, `merge`, `measure`, `defends-king`, `saves:<type>`, `hangs:<type>`,
 * `risky` (outcome spread ≥ 30 pp), `safe` (spread < 5 pp, nothing left hanging, king no less safe), `trap` (the
 * opponent's most natural reply loses ≥ 10 pp).
 */

import {
	applyForSearch,
	generateMoves,
	getOutcomes,
	kingDanger,
	moveRisk,
	pct,
	T,
} from '../engine/index.js'
import { staticE } from './evaluate.js'
import { features, pieceThreats } from './features.js'
import { STRENGTHS } from './levels.js'
import { Searcher } from './search.js'
import { captureWeight, cleanValue, outcomeList, victimOf } from './searchValues.js'
import { NO_SLICE, runSearcher, runSync } from './tasks.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */

/** @typedef {import('./tasks.js').SliceContext} SliceContext */

/** Threat thresholds for `saves:` / `hangs:` (centipawns of expected loss). */
const THREAT_CP = 60

/** Most replies considered when looking for the opponent's "natural" reply (`trap`). */
const NATURAL_REPLIES = 60

/**
 * The persona tolerance as a fraction (accepts 0.04 or 4 for 4 pp).
 *
 * @param {number} tolerance tolerance
 * @return {number}
 */
function fraction(tolerance) {
	const t = Number(tolerance)
	if (!Number.isFinite(t) || t < 0) {
		return 0
	}
	return t > 1 ? t / 100 : t
}

/**
 * The most valuable piece (id) whose threat changed as asked, or −1.
 *
 * @param {EngineState} state position
 * @param {Float64Array} before expected losses before
 * @param {Float64Array} after expected losses after
 * @param {(before: number, after: number) => boolean} test (before, after) → matches
 * @return {number}
 */
function mostValuable(state, before, after, test) {
	let best = -1
	let bestLoss = 0
	for (let id = 0; id < 32; id++) {
		if (state.types[id] === 'k') {
			continue
		}
		if (test(before[id], after[id])) {
			const loss = Math.max(before[id], after[id])
			if (loss > bestLoss) {
				bestLoss = loss
				best = id
			}
		}
	}
	return best
}

/**
 * Does the opponent's most natural reply (the best by a one-ply static look) lose at least 10 pp against its best
 * reply? Judged on the most probable outcome of the candidate.
 *
 * @param {Searcher} searcher the finished searcher (its transposition table is reused)
 * @param {object} entry root entry of the candidate
 * @return {boolean}
 */
function isTrap(searcher, entry) {
	let kid = entry.children[0]
	for (const c of entry.children) {
		if (c.weight > kid.weight) {
			kid = c
		}
	}
	const child = kid.state
	if (child === null || child.result !== null) {
		return false
	}
	const replies = generateMoves(child).filter((m) => m.type !== 'split')
	if (replies.length < 2) {
		return false
	}
	// The natural reply: best after one ply by the static evaluation (captures first when many).
	const feat = features(child)
	const ordered = replies
		.map((m) => ({ m, w: captureWeight(m) * (victimOf(feat, m) >= 0 ? 1 : 0) }))
		.sort((a, b) => b.w - a.w)
		.slice(0, NATURAL_REPLIES)
	let natural = null
	let naturalStatic = -1
	for (const { m } of ordered) {
		let v = 0
		for (const o of outcomeList(m)) {
			const gc = applyForSearch(child, m, o.key)
			const x = gc.result !== null ? (gc.result.result === '1/2-1/2' ? 0.5 : 1) : 1 - staticE(gc)
			v += (o.weight / T) * x
		}
		if (v > naturalStatic) {
			naturalStatic = v
			natural = m
		}
	}
	const depth = Math.max(1, searcher.depth - 1)
	const bestReply = searcher.valueOf(child, depth, 4000)
	if (bestReply === null || natural === null) {
		return false
	}
	let naturalDeep = 0
	for (const o of outcomeList(natural)) {
		const gc = applyForSearch(child, natural, o.key)
		let x
		if (gc.result !== null) {
			x = gc.result.result === '1/2-1/2' ? 0.5 : 1
		} else {
			const v = searcher.valueOf(gc, depth - 1, 3000)
			if (v === null) {
				return false
			}
			x = 1 - v
		}
		naturalDeep += (o.weight / T) * x
	}
	return bestReply - naturalDeep >= 0.10
}

/**
 * The tags of one candidate (see the tag grammar in the file header).
 *
 * @param {EngineState} state position
 * @param {object} entry root entry (searched with exact outcomes)
 * @param {Searcher} searcher finished searcher
 * @param {Float64Array} threatsBefore expected losses of the mover's pieces before the move
 * @return {string[]}
 */
function tagsFor(state, entry, searcher, threatsBefore) {
	const m = entry.move
	const feat = features(state)
	const mover = state.turn
	const enemy = mover === 'w' ? 'b' : 'w'
	const enemyKing = mover === 'w' ? 16 : 0
	const tags = []
	const cw = captureWeight(m)
	const vid = victimOf(feat, m)
	const outcomes = getOutcomes(state, m)
	if (vid === enemyKing && cw > 0) {
		tags.push('king-capture:' + pct(cw))
	}
	if (m.capture && m.resolution === 'certain') {
		tags.push('certain-capture')
	}
	if (m.type === 'merge' && m.capture) {
		tags.push('converging')
	}
	if (outcomes.some((o) => o.state.result !== null && o.state.result.reason === 'king_trapped')) {
		tags.push('traps-king')
	}
	if (cw > 0 && vid >= 0 && vid !== enemyKing) {
		tags.push('capture:' + pct(cw) + ':' + state.types[vid])
	}
	if (!(vid === enemyKing && cw > 0)) {
		let danger = 0
		for (const o of outcomes) {
			if (o.state.result === null) {
				danger += o.probability * kingDanger(o.state, enemy)
			}
		}
		if (danger > 0) {
			tags.push('threatens-king:' + pct(danger))
		}
	}
	const type = state.types[m.piece]
	if (m.resolution === 'rolled' && m.type === 'standard' && m.outcomes.some((o) => o.key === 'miss')
		&& (type === 'p' || type === 'n' || type === 'b') && vid !== enemyKing) {
		tags.push('probe')
	}
	if (m.type !== 'standard') {
		tags.push(m.type)
	}
	const dangerBefore = kingDanger(state, mover) / T
	const risk = moveRisk(state, m)
	if (dangerBefore > 0 && risk <= dangerBefore - 0.05) {
		tags.push('defends-king')
	}
	const after = new Float64Array(32)
	for (const o of outcomes) {
		if (o.state.result === null) {
			const t = pieceThreats(o.state, mover)
			for (let id = 0; id < 32; id++) {
				after[id] += o.probability * t[id]
			}
		}
	}
	const saved = mostValuable(state, threatsBefore, after, (b, a) => b >= THREAT_CP && a <= 0.4 * b)
	if (saved >= 0) {
		tags.push('saves:' + state.types[saved])
	}
	const hung = mostValuable(state, threatsBefore, after, (b, a) => a >= THREAT_CP && a >= b + THREAT_CP)
	if (hung >= 0) {
		tags.push('hangs:' + state.types[hung])
	}
	const values = entry.children.map((c) => c.value).filter((v) => v !== null)
	const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0
	if (spread >= 0.30) {
		tags.push('risky')
	} else if (spread < 0.05 && hung < 0 && risk <= dangerBefore + 1e-9) {
		tags.push('safe')
	}
	if (isTrap(searcher, entry)) {
		tags.push('trap')
	}
	return tags
}

/**
 * Candidates task (generator). Options: `{strength = 'balanced', tolerance = 0.05, multiPv = 6, timeMs?,
 * nodeBudget?, now?}`. Result: `Candidate[]` best first: `{code, E (side to move), tags, ok}`.
 *
 * @param {EngineState} state position (game not over)
 * @param {object} [options] options
 * @param {SliceContext} [ctx] slicing context
 * @yields {void}
 * @return {Array<{code: string, E: number, tags: string[], ok: boolean}>}
 */
export function* candidatesTask(state, options = {}, ctx = NO_SLICE) {
	const strength = STRENGTHS[options.strength ?? 'balanced']
	if (strength === undefined) {
		throw new TypeError('unknown strength: ' + String(options.strength))
	}
	if (state.result !== null) {
		return []
	}
	const multiPv = Math.max(1, options.multiPv ?? 6)
	const searcher = new Searcher(state, {
		level: strength.level,
		timeMs: options.timeMs ?? strength.timeMs,
		nodeBudget: options.nodeBudget,
		multiPv,
		margin: 0.001,
		exactOutcomes: true,
		usePartial: false,
		now: options.now,
	})
	yield* runSearcher(searcher, ctx)
	const top = searcher.root.filter((e) => e.value !== null).slice(0, multiPv)
	if (top.length === 0) {
		return []
	}
	const best = cleanValue(top[0].value)
	const limit = fraction(options.tolerance ?? 0.05) * strength.toleranceFactor
	const before = pieceThreats(state, state.turn)
	const out = []
	for (const e of top) {
		const E = cleanValue(e.value)
		out.push({ code: e.code, E, tags: tagsFor(state, e, searcher, before), ok: E >= best - limit - 1e-12 })
		yield
	}
	return out
}

/**
 * Candidates synchronously. See `candidatesTask`.
 *
 * @param {EngineState} state position
 * @param {object} [options] options
 * @return {Array<{code: string, E: number, tags: string[], ok: boolean}>}
 */
export function candidates(state, options = {}) {
	return runSync(candidatesTask(state, options))
}
