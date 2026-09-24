/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The public API contract: every exported name exists, the support keys (Appendix D), and the purity and layering of
 * src/engine: no randomness, clock, DOM, network or console in the rules (§9.1), imports only inside the engine, and
 * the presentation helpers of `ui/` kept apart.
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { E, play, S } from './helpers.js'

const CONTRACT = {
	constants: [
		'V',
		'T',
		'BUDGET',
		'MAX_WORLDS',
		'MAX_LOCATIONS',
		'FIFTY_MOVE_PLIES',
		'REPETITION_COUNT',
		'MAX_PLY',
		'LINK_THRESHOLD',
		'PIECE_TYPES',
		'PROMOTION_TYPES',
		'INITIAL_TYPES',
		'START_SQUARES',
		'WHITE_KING',
		'BLACK_KING',
		'START_JSON',
		'START_HASH',
		'CASTLING',
		'CASTLING_FLAGS',
		'RESULT_REASONS',
		'WIN_REASONS',
		'ILLEGAL_REASONS',
		'SETUP_ERRORS',
		'OUTCOME_KEYS',
	],
	errors: ['IllegalMoveError', 'EngineArgumentError', 'SetupError', 'InvalidStateError'],
	functions: [
		'initialState',
		'validateState',
		'parseState',
		'serializeState',
		'canonicalCopy',
		'positionHash',
		'gameResult',
		'generateMoves',
		'hasAnyLegalMove',
		'findMove',
		'isLegal',
		'whyIllegal',
		'getOutcomes',
		'applyMove',
		'moveCode',
		'parseMoveCode',
		'moveNotation',
		'squareName',
		'squareIndex',
		'worldCount',
		'budget',
		'squareView',
		'pieceLocations',
		'conditionalView',
		'links',
		'linkGroups',
		'kingDanger',
		'moveRisk',
		'kingTrapped',
		'pct',
		'rollDisplay',
		'rollIntervals',
		'setupPosition',
		'rollIdentity',
		'sha256hex',
		'chainStart',
		'chainNext',
		'supportKey',
		'supportKeyMirror',
		'applyForSearch',
		'outcomesForSearch',
	],
}

describe('public API names', () => {
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
			expect(() => E.kingDanger(bad, 'w'))
				.toThrowError(expect.objectContaining({ name: 'InvalidStateError', code: 'shape' }))
		}
	})
})

describe('support keys', () => {
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

describe('purity and layering of src/engine', () => {
	const root = join(import.meta.dirname, '../../../src/engine')
	const ui = join(root, 'ui')

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

	/**
	 * The module specifiers a file imports or re-exports (static and dynamic).
	 *
	 * @param {string} text source text
	 * @return {string[]}
	 */
	function specifiers(text) {
		const out = []
		for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+['"]([^'"]+)['"]/gm)) {
			out.push(m[1])
		}
		for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
			out.push(m[1])
		}
		for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
			out.push(m[1])
		}
		return out
	}

	it('rule modules import only other rule modules', () => {
		const list = files(root).filter((f) => !f.startsWith(ui + '/'))
		expect(list.length).toBeGreaterThan(20)
		for (const f of list) {
			for (const spec of specifiers(readFileSync(f, 'utf8'))) {
				expect(spec.startsWith('.'), f + ' imports ' + spec).toBe(true)
				const target = resolve(dirname(f), spec)
				expect(
					relative(root, target).startsWith('..'),
					f + ' imports ' + spec + ' outside src/engine',
				).toBe(false)
				expect(target.startsWith(ui + '/'), f + ' imports the presentation helper ' + spec).toBe(false)
			}
		}
	})

	it('presentation helpers import only the engine and @nextcloud/l10n', () => {
		const list = files(ui)
		expect(list.length).toBeGreaterThan(5)
		for (const f of list) {
			for (const spec of specifiers(readFileSync(f, 'utf8'))) {
				if (spec === '@nextcloud/l10n') {
					continue
				}
				expect(spec.startsWith('.'), f + ' imports ' + spec).toBe(true)
				expect(
					relative(root, resolve(dirname(f), spec)).startsWith('..'),
					f + ' imports ' + spec + ' outside src/engine',
				).toBe(false)
			}
			const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
			for (const re of [/Math\.random/, /\bDate\b/, /\bwindow\b/, /\bdocument\b/, /\bfetch\(/, /localStorage/]) {
				expect(re.test(code), f + ' uses ' + re).toBe(false)
			}
		}
	})

	it('the engine index does not re-export the presentation helpers', () => {
		const text = readFileSync(join(root, 'index.js'), 'utf8')
		expect(specifiers(text).some((s) => s.startsWith('./ui/'))).toBe(false)
	})

	it('no randomness, clock, DOM, network or console in the rules engine', () => {
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
		const list = files(root).filter((f) => !f.startsWith(ui + '/'))
		expect(list.length).toBeGreaterThan(20)
		const spdx = '/**\n * SPDX-FileCopyrightText: 2026 BeeFlow\n * SPDX-License-Identifier: AGPL-3.0-or-later\n */'
		for (const f of list) {
			const text = readFileSync(f, 'utf8')
			const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
			for (const re of banned) {
				expect(re.test(code), f + ' uses ' + re).toBe(false)
			}
			expect(text.startsWith(spdx), f).toBe(true)
			expect(/from '\.\/ui\//.test(text), f + ' imports UI code').toBe(false)
		}
	})
})
