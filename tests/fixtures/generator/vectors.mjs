/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Assembly of the fixture files from the played games: the parser cases (fixed inputs plus notation round trips),
 * the derived views of a sample of states, the records (hash chains, roll display, roll identity, support keys,
 * certain FEN, SHA-256) and the hand-written vectors. Section numbers (§) refer to docs/engine-rules.md.
 */

import * as E from '../../../src/engine/index.js'
import { LABELS_NL, PARSER_INPUTS, ROLL_RECORDS, SETUP_ERROR_SPECS, SETUP_SPECS, START, W2 } from './cases.mjs'
import { json } from './play.mjs'

/**
 * parser.json: every parser input once, then the notation strings of every scripted example step and of every fifth
 * step of the random games, so that each must parse back.
 *
 * @param {object[]} examples scripted example fixtures
 * @param {object[]} games random game fixtures
 * @return {Array<{input: string, expect: object|null}>}
 */
export function parserFixtures(examples, games) {
	const parserSet = new Set()
	const parserCases = []
	const parserCase = (input) => {
		if (!parserSet.has(input)) {
			parserSet.add(input)
			parserCases.push({ input, expect: E.parseMoveCode(input) })
		}
	}
	PARSER_INPUTS.forEach(parserCase)
	for (const g of [...examples, ...games]) {
		g.steps.forEach((st, i) => {
			if (i % 5 === 0 || g.seed === null) {
				parserCase(st.notation)
			}
		})
	}
	return parserCases
}

/**
 * views.json: the derived views of the first and last state of every example and of a sample of game states.
 *
 * @param {object[]} examples scripted example fixtures
 * @param {object[]} games random game fixtures
 * @return {object[]}
 */
export function viewFixtures(examples, games) {
	// Views: interesting states from the examples and a sample of game states.
	const viewStates = []
	for (const g of examples) {
		viewStates.push(g.start, g.steps[g.steps.length - 1].after)
	}
	games.forEach((g, i) => {
		if (i % 3 === 0 && g.steps.length > 10) {
			viewStates.push(g.steps[Math.floor(g.steps.length / 2)].after)
		}
	})
	return [...new Set(viewStates)].slice(0, 110).map((text) => {
		const s = JSON.parse(text)
		const moveRisk = {}
		for (const m of E.generateMoves(s)) {
			moveRisk[m.code] = E.moveRisk(s, m.code)
		}
		return {
			state: text,
			kingDanger: { w: E.kingDanger(s, 'w'), b: E.kingDanger(s, 'b') },
			budget: { w: E.budget(s, 'w'), b: E.budget(s, 'b') },
			worlds: E.worldCount(s),
			links: E.links(s),
			linkGroups: E.linkGroups(s),
			kingTrapped: E.kingTrapped(s),
			squareView: E.squareView(s),
			moveRisk,
		}
	})
}

/**
 * records.json: hash chains (the W2 vector of §9.4 and three games with non-ASCII user ids), roll display vectors,
 * roll identities, support keys, certain FENs and SHA-256 vectors.
 *
 * @param {object[]} examples scripted example fixtures
 * @param {object[]} games random game fixtures
 * @return {object}
 */
export function recordFixtures(examples, games) {
	const chains = []
	{
		const w2 = E.setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6'] })
		const chain0 = E.chainStart(42, 'alice', 'bob', 1790000000)
		const r = E.applyMove(w2, 'c1-h6', { u: 8388608 })
		const after = json(r.state)
		chains.push({
			gameId: 42,
			whiteUid: 'alice',
			blackUid: 'bob',
			createdAt: 1790000000,
			start: json(w2),
			chain0,
			moves: [{ ply: 0, code: 'c1-h6', u: 8388608, key: 'capture', after, afterSha256: E.sha256hex(after), chain: E.chainNext(chain0, 0, 'c1-h6', 8388608, 'capture', after) }],
		})
		for (const [gi, g] of games.slice(0, 3).entries()) {
			const gameId = 1000 + gi
			const whiteUid = gi === 1 ? 'Élodie Dupont' : 'user' + gi
			const blackUid = gi === 2 ? 'ユーザー' : 'opponent@example.com'
			const createdAt = 1790000000 + gi * 86400
			let prev = E.chainStart(gameId, whiteUid, blackUid, createdAt)
			const entry = { gameId, whiteUid, blackUid, createdAt, start: g.start, chain0: prev, moves: [] }
			g.steps.slice(0, 12).forEach((st, i) => {
				const u = st.measurement === null ? null : st.measurement.u
				const key = st.measurement === null ? null : st.measurement.key
				const chain = E.chainNext(prev, JSON.parse(g.start).ply + i, st.code, u, key, st.after)
				entry.moves.push({ ply: JSON.parse(g.start).ply + i, code: st.code, u, key, after: st.after, afterSha256: E.sha256hex(st.after), chain })
				prev = chain
			})
			chains.push(entry)
		}
	}
	const rollRecords = [...ROLL_RECORDS]
	for (const g of games) {
		for (const st of g.steps) {
			if (st.measurement !== null && rollRecords.length < 60 && (st.measurement.outcomes.length === 3 || rollRecords.length % 4 === 0)) {
				rollRecords.push(st.measurement)
			}
		}
	}
	const recordStates = [START, W2, ...examples.map((g) => JSON.parse(g.steps[0].after)), ...games.slice(0, 15).map((g) => JSON.parse(g.steps[Math.min(9, g.steps.length - 1)].after))]
	return {
		v: 1,
		chain: chains,
		rollDisplay: rollRecords.map((record, i) => ({
			record,
			labels: i % 3 === 2 ? LABELS_NL : null,
			text: E.rollDisplay(record, i % 3 === 2 ? LABELS_NL : undefined),
			intervals: E.rollIntervals(record),
		})),
		rollIdentity: [
			{ state: json(W2), code: 'c1-h6', expect: E.rollIdentity(W2, 'c1-h6') },
			...examples.slice(0, 20).map((g) => ({ state: g.start, code: g.steps[0].code, expect: E.rollIdentity(JSON.parse(g.start), g.steps[0].code) })),
			{ state: json(E.setupPosition({ fen: '7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', prelude: ['g7-e8|f5'] })), code: 'e7-e8=N', expect: E.rollIdentity(E.setupPosition({ fen: '7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', prelude: ['g7-e8|f5'] }), 'e7-e8=N') },
		],
		supportKey: recordStates.map((s) => ({ state: json(s), key: E.supportKey(s), mirror: E.supportKeyMirror(s) })),
		certainFen: recordStates.map((s) => ({ state: json(s), fen: E.certainFen(s) })),
		sha256: ['', 'abc', 'qchess-chain|v1|42|alice|bob|1790000000', 'Élodie|ユーザー|😀'].map((text) => ({ text, hex: E.sha256hex(text) })),
	}
}

/**
 * vectors.json: start, rescale, r → u, pct, move order, the scripted examples, the whyIllegal cases, setup vectors and
 * setup errors.
 *
 * @param {object[]} examples scripted example fixtures
 * @param {object[]} whyCases recorded whyIllegal cases
 * @return {object}
 */
export function vectorFixtures(examples, whyCases) {
	const setupErrors = SETUP_ERROR_SPECS.map((spec) => {
		try {
			E.setupPosition(spec)
		} catch (e) {
			return { spec, expect: e.code, detail: e.code === 'prelude_illegal' ? e.detail : null }
		}
		throw new Error('setup spec did not fail: ' + JSON.stringify(spec))
	})

	return {
		v: 1,
		start: { json: E.START_JSON, hash: E.START_HASH },
		rescale: [
			{ weights: [8388608, 4194304], expect: E.rescaleWeights([8388608, 4194304]) },
			{ weights: [1, 1, 1], expect: E.rescaleWeights([1, 1, 1]) },
			{ weights: [5, 3, 7, 1], expect: E.rescaleWeights([5, 3, 7, 1]) },
			{ weights: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], expect: E.rescaleWeights([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) },
			{ weights: [16777215], expect: E.rescaleWeights([16777215]) },
		],
		rToU: [0, 0.3, 0.5, 0.999999999, 0.1, 0.75, 1 / 3].map((r) => ({ r, u: E.uFromRandom(r) })),
		pct: [0, 1, 83886, 83887, 167772, 8388608, 11184811, 5592405, 16609443, 16609444, 16777215, 16777216].map((w) => ({ weight: w, expect: E.pct(w) })),
		moveOrder: { state: json(E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1' })), legal: E.legalCodes(E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1' })) },
		examples,
		whyIllegal: whyCases,
		setup: SETUP_SPECS.map((spec) => ({ spec, expect: json(E.setupPosition(spec)) })),
		setupErrors,
	}
}
