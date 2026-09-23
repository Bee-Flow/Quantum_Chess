/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * SPEC §3.2 contract: every exported name exists, support keys (ER App. D), and purity of src/engine (no
 * Math.random, clock, DOM, network or console; ER §9.1).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { E, play, S } from './helpers.js'

const CONTRACT = {
	constants: ['V', 'T', 'BUDGET', 'MAX_WORLDS', 'MAX_LOCATIONS', 'FIFTY_MOVE_PLIES', 'REPETITION_COUNT', 'MAX_PLY', 'LINK_THRESHOLD', 'PIECE_TYPES', 'PROMOTION_TYPES', 'INITIAL_TYPES', 'START_SQUARES', 'WHITE_KING', 'BLACK_KING', 'START_JSON', 'START_HASH', 'CASTLING', 'CASTLING_FLAGS', 'RESULT_REASONS', 'WIN_REASONS', 'ILLEGAL_REASONS', 'SETUP_ERRORS', 'OUTCOME_KEYS'],
	errors: ['IllegalMoveError', 'EngineArgumentError', 'SetupError', 'InvalidStateError'],
	functions: ['initialState', 'validateState', 'parseState', 'serializeState', 'canonicalCopy', 'positionHash', 'gameResult', 'generateMoves', 'hasAnyLegalMove', 'findMove', 'isLegal', 'whyIllegal', 'getOutcomes', 'applyMove', 'moveCode', 'parseMoveCode', 'moveNotation', 'squareName', 'squareIndex', 'worldCount', 'budget', 'squareView', 'pieceLocations', 'conditionalView', 'links', 'linkGroups', 'kingDanger', 'moveRisk', 'kingTrapped', 'pct', 'rollDisplay', 'rollIntervals', 'setupPosition', 'rollIdentity', 'sha256hex', 'chainStart', 'chainNext', 'supportKey', 'supportKeyMirror', 'applyForSearch', 'outcomesForSearch'],
}

describe('SPEC §3.2 names', () => {
	it('every contract name is exported', () => {
		for (const name of [...CONTRACT.constants, ...CONTRACT.errors, ...CONTRACT.functions]) {
			expect(E[name], name).toBeDefined()
		}
		for (const name of CONTRACT.functions) {
			expect(typeof E[name], name).toBe('function')
		}
		expect(E.MIN_BRANCH_WEIGHT).toBe(undefined)
		expect(E.ILLEGAL_REASONS.length).toBe(23)
		expect(E.SETUP_ERRORS.length).toBe(10)
	})

	it('error classes carry their codes', () => {
		const e = new E.IllegalMoveError('blocked', 'a1-a3')
		expect([e.name, e.code, e.move, e instanceof Error]).toEqual(['IllegalMoveError', 'blocked', 'a1-a3', true])
		const s = new E.SetupError('prelude_illegal', 'no_piece')
		expect([s.code, s.detail]).toEqual(['prelude_illegal', 'no_piece'])
		expect(new E.InvalidStateError('I5').code).toBe('I5')
	})

	it('functions that need a state reject non-states with InvalidStateError', () => {
		for (const bad of [null, 'x', 42, {}, { worlds: [] }, { worlds: [['.', 1]], types: 'k', turn: 'w' }]) {
			expect(() => E.generateMoves(bad)).toThrow()
			expect(() => E.kingTrapped(bad)).toThrow()
			expect(() => E.whyIllegal(bad, 'e2-e4')).toThrow()
			expect(() => E.kingDanger(bad, 'w')).toThrowError(expect.objectContaining({ name: 'InvalidStateError', code: 'shape' }))
		}
	})
})

describe('support keys (ER App. D)', () => {
	it('start vector', () => {
		const s = E.initialState()
		expect(E.supportKey(s)).toBe('w|RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr')
		expect(E.supportKeyMirror(s)).toBe('b|RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr')
	})

	it('ignores weights and ids; mirrors ranks and colours', () => {
		const s = play(E.initialState(), 'g1-f3|h3')
		expect(E.supportKey(s)).toBe('b|RNBQKB.RPPPPPPPP.....N.N........................pppppppprnbqkbnr')
		const two = S('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1')
		expect(E.supportKey(two)).toBe('w|..QQK' + '.'.repeat(55) + 'k...')
		const m = E.supportKeyMirror(two)
		expect(m).toBe('b|....K' + '.'.repeat(51) + '..qqk...')
		const flipped = S('2qqk3/8/8/8/8/8/8/4K3 b - - 0 1')
		expect(E.supportKey(flipped)).toBe(m)
	})
})

describe('purity of src/engine (ER §9.1)', () => {
	/**
	 * All .js files under a directory.
	 *
	 * @param {string} dir directory
	 * @return {string[]}
	 */
	function files(dir) {
		return readdirSync(dir).flatMap((f) => {
			const p = join(dir, f)
			return statSync(p).isDirectory() ? files(p) : (p.endsWith('.js') ? [p] : [])
		})
	}

	it('no randomness, clock, DOM, network or console in the rules engine', () => {
		const root = join(import.meta.dirname, '../../../src/engine')
		const banned = [
			/Math\.random/,
			/\bDate\b/,
			/performance\.now/,
			/\bwindow\b/,
			/\bdocument\b/,
			/\bfetch\(/,
			/XMLHttpRequest/,
			/\bconsole\./,
			/localStorage/,
			/toLocale/,
			/Intl\./,
			/setTimeout|setInterval/,
		]
		const list = files(root).filter((f) => !f.includes('/ui/'))
		expect(list.length).toBeGreaterThan(15)
		for (const f of list) {
			const text = readFileSync(f, 'utf8')
			const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
			for (const re of banned) {
				expect(re.test(code), f + ' uses ' + re).toBe(false)
			}
			expect(text.startsWith('/**\n * SPDX-FileCopyrightText: 2026 BeeFlow\n * SPDX-License-Identifier: AGPL-3.0-or-later\n */'), f).toBe(true)
			expect(/from '\.\/ui\//.test(text), f + ' imports UI code').toBe(false)
		}
	})
})
