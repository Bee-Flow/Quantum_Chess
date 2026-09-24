/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Setup positions (Appendix A): `{state}` or `{fen, prelude?}`. Deterministic, never random.
 *
 * PHP twin: lib/Engine/Internal/Setup.php (`certainFen` is in lib/Engine/Internal/Views.php).
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { analyze } from './analysis.js'
import { applyRecord } from './apply.js'
import { castlingAfter } from './bookkeeping.js'
import { CASTLING_FLAGS, INITIAL_TYPES, START_SQUARES, T } from './constants.js'
import { SetupError } from './errors.js'
import { hashParts } from './hash.js'
import { resolveMove } from './moveInput.js'
import { parseMoveCode } from './parser.js'
import { letterOf } from './squares.js'
import { makeState, validateState } from './state.js'

/** @typedef {import('./types.js').EngineState} EngineState */

const FEN_PIECES = 'kqrbnp'

/**
 * Parse the FEN fields. Accepts 4 to 6 fields (halfmove and fullmove default to 0 and 1).
 *
 * @param {string} fen FEN text
 * @return {{pieces: Array<Array<{sq: number, type: string}>>, turn: string, flags: string, ep: string, halfmove: number, fullmove: number}}
 */
export function parseFen(fen) {
	if (typeof fen !== 'string') {
		throw new SetupError('bad_fen', 'not a string')
	}
	const fields = fen.trim().split(/\s+/)
	if (fields.length < 4 || fields.length > 6) {
		throw new SetupError('bad_fen', 'expected 4 to 6 fields')
	}
	const rows = fields[0].split('/')
	if (rows.length !== 8) {
		throw new SetupError('bad_fen', 'expected 8 ranks')
	}
	const pieces = [[], []]
	for (let i = 0; i < 8; i++) {
		const rank = 7 - i
		let file = 0
		for (const ch of rows[i]) {
			if (ch >= '1' && ch <= '8') {
				file += ch.charCodeAt(0) - 48
			} else {
				const lower = ch.toLowerCase()
				if (!FEN_PIECES.includes(lower) || file > 7) {
					throw new SetupError('bad_fen', 'bad placement')
				}
				pieces[ch === lower ? 1 : 0].push({ sq: rank * 8 + file, type: lower })
				file++
			}
		}
		if (file !== 8) {
			throw new SetupError('bad_fen', 'a rank must have 8 files')
		}
	}
	const turn = fields[1]
	if (turn !== 'w' && turn !== 'b') {
		throw new SetupError('bad_fen', 'side to move must be w or b')
	}
	const castle = fields[2]
	let flags = ''
	if (castle !== '-') {
		if (!/^[KQkq]{1,4}$/.test(castle) || new Set(castle).size !== castle.length) {
			throw new SetupError('bad_fen', 'bad castling field')
		}
		flags = CASTLING_FLAGS.filter((f) => castle.includes(f)).join('')
	}
	const ep = fields[3]
	if (ep !== '-' && !/^[a-h][36]$/.test(ep)) {
		throw new SetupError('bad_fen', 'bad en-passant field')
	}
	const halfmove = fields.length > 4 ? Number(fields[4]) : 0
	const fullmove = fields.length > 5 ? Number(fields[5]) : 1
	if (!/^\d+$/.test(fields[4] ?? '0') || !Number.isInteger(halfmove) || halfmove < 0 || halfmove > 99) {
		throw new SetupError('bad_fen', 'halfmove must be 0..99')
	}
	if (!/^\d+$/.test(fields[5] ?? '1') || !Number.isSafeInteger(fullmove) || fullmove < 1) {
		throw new SetupError('bad_fen', 'fullmove must be ≥ 1')
	}
	return { pieces, turn, flags, ep, halfmove, fullmove }
}

/**
 * Assign ids to the pieces of one colour in four complete passes (Appendix A).
 *
 * @param {Array<{sq: number, type: string}>} list pieces of the colour, ascending square
 * @param {number} base 0 for White, 16 for Black
 * @param {string[]} types mutable types array (pass 4 writes real types)
 * @return {Map<number, number>} square → id
 */
function assignIds(list, base, types) {
	if (list.filter((p) => p.type === 'k').length !== 1) {
		throw new SetupError('king_count', base === 0 ? 'White' : 'Black')
	}
	if (list.length > 16) {
		throw new SetupError('too_many_pieces', base === 0 ? 'White' : 'Black')
	}
	const free = new Array(16).fill(true)
	const bySquare = new Map()
	const pending = []
	// Pass 1: start square of an id with the same initial type.
	for (const p of list) {
		let done = false
		for (let k = 0; k < 16 && !done; k++) {
			const id = base + k
			if (free[k] && START_SQUARES[id] === p.sq && INITIAL_TYPES[id] === p.type) {
				free[k] = false
				bySquare.set(p.sq, id)
				done = true
			}
		}
		if (!done) {
			pending.push(p)
		}
	}
	// Pass 2: remaining non-pawns get the lowest free id 0–7 of their initial type.
	const pass3 = []
	for (const p of pending) {
		let done = false
		if (p.type !== 'p') {
			for (let k = 0; k < 8 && !done; k++) {
				if (free[k] && INITIAL_TYPES[base + k] === p.type) {
					free[k] = false
					bySquare.set(p.sq, base + k)
					done = true
				}
			}
		}
		if (!done) {
			pass3.push(p)
		}
	}
	// Pass 3: remaining pawns get the lowest free pawn id.
	const pass4 = []
	for (const p of pass3) {
		let done = false
		if (p.type === 'p') {
			for (let k = 8; k < 16 && !done; k++) {
				if (free[k]) {
					free[k] = false
					bySquare.set(p.sq, base + k)
					done = true
				}
			}
		}
		if (!done) {
			pass4.push(p)
		}
	}
	// Pass 4: remaining non-pawns get the lowest free pawn id and keep their real type.
	for (const p of pass4) {
		let done = false
		if (p.type !== 'p') {
			for (let k = 8; k < 16 && !done; k++) {
				if (free[k]) {
					free[k] = false
					bySquare.set(p.sq, base + k)
					types[base + k] = p.type
					done = true
				}
			}
		}
		if (!done) {
			throw new SetupError('too_many_pieces', base === 0 ? 'White' : 'Black')
		}
	}
	return bySquare
}

/**
 * Split a prelude item into its code and optional forced outcome.
 *
 * @param {string|{code: string, outcome?: string}} item prelude item
 * @return {{code: string, outcome: string|null}}
 */
function preludeItem(item) {
	if (typeof item === 'string') {
		const at = item.lastIndexOf('@')
		if (at >= 0) {
			return { code: item.slice(0, at), outcome: item.slice(at + 1) }
		}
		return { code: item, outcome: null }
	}
	if (item && typeof item === 'object' && typeof item.code === 'string') {
		return { code: item.code, outcome: item.outcome ?? null }
	}
	throw new SetupError('prelude_bad_code', String(item))
}

/**
 * Build a state from a spec (Appendix A).
 *
 * - `{state}`: validated with validateState (a fresh canonical copy is returned).
 * - `{fen, prelude?}`: ids assigned in four passes, one world of weight T, then every prelude code (optionally with
 *   `@key` for a rolled move) applied with A1–A8, then turn/halfmove/fullmove/ep from the FEN, castling = FEN flags ∩
 *   the state-based condition, ply 0, history [hash], and validateState.
 *
 * @param {{state?: EngineState, fen?: string, prelude?: Array<string|{code: string, outcome?: string}>}} spec setup spec
 * @return {EngineState} state
 * @throws {SetupError} with one of the setup error codes
 */
export function setupPosition(spec) {
	if (spec === null || typeof spec !== 'object') {
		throw new SetupError('bad_fen', 'spec must be an object')
	}
	if (spec.state !== undefined) {
		const r = validateState(spec.state)
		if (!r.ok) {
			throw new SetupError('invalid_state', r.error + ': ' + r.message)
		}
		return r.state
	}
	const fen = parseFen(spec.fen)
	const types = INITIAL_TYPES.split('')
	const board = new Array(64).fill('.')
	const live = new Set()
	for (let c = 0; c < 2; c++) {
		const list = fen.pieces[c].slice().sort((x, y) => x.sq - y.sq)
		const ids = assignIds(list, c * 16, types)
		for (const [sq, id] of ids) {
			board[sq] = letterOf(id)
			live.add(id)
		}
	}
	const captured = []
	for (let id = 0; id < 32; id++) {
		if (!live.has(id)) {
			captured.push(id)
		}
	}
	let worlds = [[board.join(''), T]]
	let state = makeState({
		types: types.join(''),
		worlds,
		turn: fen.turn,
		castling: castlingAfter(fen.flags === '' ? '-' : fen.flags, worlds),
		ep: '-',
		halfmove: 0,
		fullmove: 1,
		ply: 0,
		captured,
		history: ['0000000000000000'],
		result: null,
	})
	const prelude = spec.prelude ?? []
	if (!Array.isArray(prelude)) {
		throw new SetupError('prelude_bad_code', 'prelude must be an array')
	}
	for (const item of prelude) {
		const { code, outcome } = preludeItem(item)
		const parsed = parseMoveCode(code)
		if (parsed === null || parsed.castle !== undefined) {
			throw new SetupError('prelude_bad_code', code)
		}
		const X = analyze(state).occ[parsed.from[0]]
		if (X < 0) {
			throw new SetupError('prelude_illegal', 'no_piece')
		}
		state = makeState({
			types: state.types,
			worlds: state.worlds,
			turn: X < 16 ? 'w' : 'b',
			castling: state.castling,
			ep: '-',
			halfmove: state.halfmove,
			fullmove: state.fullmove,
			ply: state.ply,
			captured: state.captured,
			history: state.history,
			result: null,
		})
		const a = analyze(state)
		const r = resolveMove(a, code)
		if (r.reason !== undefined) {
			throw new SetupError('prelude_illegal', r.reason)
		}
		const rec = r.rec
		let key = rec.resolution
		if (rec.resolution === 'rolled') {
			if (outcome === null) {
				throw new SetupError('prelude_needs_outcome', code)
			}
			if (!rec.outcomes.some((o) => o.key === outcome)) {
				throw new SetupError('prelude_bad_outcome', code + '@' + outcome)
			}
			key = outcome
		} else if (outcome !== null) {
			throw new SetupError('prelude_outcome_unused', code + '@' + outcome)
		}
		const applied = applyRecord(a, rec, key, false, false)
		if (applied.captured === 0 || applied.captured === 16) {
			throw new SetupError('prelude_king_captured', code)
		}
		state = applied.state
	}
	worlds = state.worlds
	const castling = castlingAfter(fen.flags === '' ? '-' : fen.flags, worlds)
	const h = hashParts(fen.turn, castling, fen.ep, state.types, worlds)
	const final = makeState({
		types: state.types,
		worlds,
		turn: fen.turn,
		castling,
		ep: fen.ep,
		halfmove: fen.halfmove,
		fullmove: fen.fullmove,
		ply: 0,
		captured: state.captured,
		history: [h],
		result: null,
	})
	const v = validateState(final)
	if (!v.ok) {
		throw new SetupError('invalid_state', v.error + ': ' + v.message)
	}
	return v.state
}

/**
 * FEN of the certain part of a position: every certain piece, ghosts removed (used by describeForLlm).
 *
 * @param {EngineState} state valid engine state
 * @return {string}
 */
export function certainFen(state) {
	const a = analyze(state)
	const rows = []
	for (let r = 7; r >= 0; r--) {
		let row = ''
		let empty = 0
		for (let f = 0; f < 8; f++) {
			const s = r * 8 + f
			const id = a.occ[s]
			if (id < 0 || a.occW[s] !== T) {
				empty++
				continue
			}
			if (empty > 0) {
				row += String(empty)
				empty = 0
			}
			const ty = state.types[id]
			row += id < 16 ? ty.toUpperCase() : ty
		}
		if (empty > 0) {
			row += String(empty)
		}
		rows.push(row)
	}
	return rows.join('/') + ' ' + state.turn + ' ' + state.castling + ' ' + state.ep + ' ' + state.halfmove + ' ' + state.fullmove
}
