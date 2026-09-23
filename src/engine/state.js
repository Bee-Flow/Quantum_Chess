/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * State construction, canonical serialisation (§2.5, §2.6) and strict validation (§2.7).
 */

import { analyse, projection } from './analysis.js'
import {
	BUDGET,
	CASTLING,
	CASTLING_FLAGS,
	INITIAL_TYPES,
	MAX_PLY,
	MAX_WORLDS,
	RESULT_REASONS,
	START_JSON,
	T,
	V,
	WIN_REASONS,
} from './constants.js'
import { hashParts } from './hash.js'
import { idOfCode, letterCodeOf } from './squares.js'

const STATE_KEYS = ['v', 'types', 'worlds', 'turn', 'castling', 'ep', 'halfmove', 'fullmove', 'ply', 'captured', 'history', 'result']
const HEX16 = /^[0-9a-f]{16}$/
const CASTLING_RE = /^(?:-|K?Q?k?q?)$/
const SQUARE_RE = /^[a-h][1-8]$/

/**
 * Build a state object with the keys in canonical order (§2.5). Values are used as given (no copies).
 *
 * @param {object} p parts
 * @param {string} p.types types string
 * @param {Array<[string, number]>} p.worlds canonical worlds
 * @param {'w'|'b'} p.turn side to move
 * @param {string} p.castling castling field
 * @param {string} p.ep en-passant field
 * @param {number} p.halfmove halfmove clock
 * @param {number} p.fullmove fullmove number
 * @param {number} p.ply ply count
 * @param {number[]} p.captured captured ids
 * @param {string[]} p.history position hashes
 * @param {object|null} p.result result or null
 * @return {object}
 */
export function makeState({ types, worlds, turn, castling, ep, halfmove, fullmove, ply, captured, history, result }) {
	return { v: V, types, worlds, turn, castling, ep, halfmove, fullmove, ply, captured, history, result }
}

/**
 * The start position (§2.5), a fresh object.
 *
 * @return {object}
 */
export function initialState() {
	return JSON.parse(START_JSON)
}

/**
 * Canonical JSON (§2.6). Rebuilds the key order, so it is safe for states that went through other code.
 *
 * @param {object} state engine state
 * @return {string}
 */
export function serializeState(state) {
	return JSON.stringify(canonicalCopy(state))
}

/**
 * A deep copy of a state with canonical key order.
 *
 * @param {object} state engine state
 * @return {object}
 */
export function canonicalCopy(state) {
	return makeState({
		types: state.types,
		worlds: state.worlds.map((w) => [w[0], w[1]]),
		turn: state.turn,
		castling: state.castling,
		ep: state.ep,
		halfmove: state.halfmove,
		fullmove: state.fullmove,
		ply: state.ply,
		captured: state.captured.slice(),
		history: state.history.slice(),
		result: state.result === null ? null : { result: state.result.result, reason: state.result.reason },
	})
}

/**
 * Parse canonical JSON (or any JSON) into a state and validate it.
 *
 * @param {string} json JSON text
 * @return {{ok: true, state: object}|{ok: false, error: string, message: string}}
 */
export function parseState(json) {
	return validateState(json)
}

/**
 * Game result of a state (§6), or null.
 *
 * @param {object} state engine state
 * @return {{result: string, reason: string}|null}
 */
export function gameResult(state) {
	return state.result === null ? null : { result: state.result.result, reason: state.result.reason }
}

/**
 * Fail helper.
 *
 * @param {string} error code
 * @param {string} message text
 * @return {{ok: false, error: string, message: string}}
 */
function fail(error, message) {
	return { ok: false, error, message }
}

/**
 * Is this a non-negative safe integer within [min, max]?
 *
 * @param {unknown} x value
 * @param {number} min minimum
 * @param {number} max maximum
 * @return {boolean}
 */
function isInt(x, min, max) {
	return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max
}

/**
 * Strictly validate untrusted input against every invariant I1–I12 (§2.7). Never throws.
 *
 * Accepts a state object or its JSON text. On success returns a fresh canonical copy.
 *
 * Error codes: `shape` (wrong type, missing or unknown keys), `I1` … `I12`.
 *
 * @param {unknown} input state object or JSON string
 * @return {{ok: true, state: object}|{ok: false, error: string, message: string}}
 */
export function validateState(input) {
	try {
		return validateUnsafe(input)
	} catch (e) {
		return fail('shape', 'unreadable input: ' + (e && e.message ? String(e.message).slice(0, 200) : 'error'))
	}
}

/**
 * The validation body (may throw on hostile objects; wrapped by validateState).
 *
 * @param {unknown} input state object or JSON string
 * @return {{ok: true, state: object}|{ok: false, error: string, message: string}}
 */
function validateUnsafe(input) {
	let obj = input
	if (typeof obj === 'string') {
		if (obj.length > 1000000) {
			return fail('shape', 'input too large')
		}
		try {
			obj = JSON.parse(obj)
		} catch {
			return fail('shape', 'not JSON')
		}
	}
	if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
		return fail('shape', 'not an object')
	}
	const keys = Object.keys(obj)
	if (keys.length !== STATE_KEYS.length) {
		return fail('shape', 'expected exactly the keys ' + STATE_KEYS.join(','))
	}
	for (const k of STATE_KEYS) {
		if (!Object.hasOwn(obj, k)) {
			return fail('shape', 'missing key ' + k)
		}
	}
	// Copy every field once (getters run exactly once).
	const v = obj.v
	const types = obj.types
	const worldsIn = obj.worlds
	const turn = obj.turn
	const castling = obj.castling
	const ep = obj.ep
	const halfmove = obj.halfmove
	const fullmove = obj.fullmove
	const ply = obj.ply
	const capturedIn = obj.captured
	const historyIn = obj.history
	const resultIn = obj.result

	// I12
	if (v !== V) {
		return fail('I12', 'v must be 1')
	}
	// I8
	if (typeof types !== 'string' || types.length !== 32 || !/^[kqrbnp]{32}$/.test(types)) {
		return fail('I8', 'types must be 32 characters over kqrbnp')
	}
	for (let id = 0; id < 32; id++) {
		const initial = INITIAL_TYPES[id]
		const ty = types[id]
		if (initial !== 'p') {
			if (ty !== initial) {
				return fail('I8', 'id ' + id + ' must keep type ' + initial)
			}
		} else if (ty === 'k') {
			return fail('I8', 'pawn id ' + id + ' cannot be a king')
		}
	}
	// Scalars
	if (turn !== 'w' && turn !== 'b') {
		return fail('shape', 'turn must be w or b')
	}
	if (typeof castling !== 'string' || castling.length === 0 || castling.length > 4 || !CASTLING_RE.test(castling)) {
		return fail('shape', 'castling must be - or a subset of KQkq in order')
	}
	if (typeof ep !== 'string' || (ep !== '-' && !SQUARE_RE.test(ep))) {
		return fail('shape', 'ep must be - or a square name')
	}
	if (!isInt(ply, 0, MAX_PLY)) {
		return fail('I11', 'ply must be an integer 0..1200')
	}
	if (!isInt(halfmove, 0, 99 + ply)) {
		return fail('I11', 'halfmove must be an integer 0..99+ply')
	}
	if (!isInt(fullmove, 1, Number.MAX_SAFE_INTEGER)) {
		return fail('I11', 'fullmove must be an integer ≥ 1')
	}
	// captured
	if (!Array.isArray(capturedIn) || capturedIn.length > 30) {
		return fail('I2', 'captured must be an array of at most 30 ids')
	}
	const captured = []
	const isCaptured = new Uint8Array(32)
	for (let i = 0; i < capturedIn.length; i++) {
		const id = capturedIn[i]
		if (!isInt(id, 0, 31)) {
			return fail('I2', 'captured ids must be integers 0..31')
		}
		if (isCaptured[id]) {
			return fail('I2', 'duplicate captured id ' + id)
		}
		isCaptured[id] = 1
		captured.push(id)
	}
	// result
	let result = null
	if (resultIn !== null) {
		if (typeof resultIn !== 'object' || Array.isArray(resultIn)) {
			return fail('I11', 'result must be null or an object')
		}
		const rk = Object.keys(resultIn)
		if (rk.length !== 2 || rk[0] !== 'result' || rk[1] !== 'reason') {
			return fail('I11', 'result must have exactly the keys result, reason')
		}
		const r = resultIn.result
		const reason = resultIn.reason
		if (r !== '1-0' && r !== '0-1' && r !== '1/2-1/2') {
			return fail('I11', 'bad result value')
		}
		if (typeof reason !== 'string' || !RESULT_REASONS.includes(reason)) {
			return fail('I11', 'bad result reason')
		}
		if (WIN_REASONS.includes(reason) === (r === '1/2-1/2')) {
			return fail('I11', 'result and reason disagree')
		}
		result = { result: r, reason }
	}
	// I4 (liveness part)
	const kingCaptured = isCaptured[0] + isCaptured[16]
	if (result !== null && result.reason === 'king_captured') {
		if (kingCaptured !== 1) {
			return fail('I4', 'king_captured needs exactly one captured king')
		}
		if ((isCaptured[16] === 1) !== (result.result === '1-0')) {
			return fail('I4', 'the winner must be the side whose king is alive')
		}
	} else if (kingCaptured !== 0) {
		return fail('I4', 'both kings must be live')
	}
	// worlds
	if (!Array.isArray(worldsIn) || worldsIn.length < 1 || worldsIn.length > MAX_WORLDS) {
		return fail('I7', 'worlds must be an array of 1..64 entries')
	}
	const n = worldsIn.length
	const worlds = new Array(n)
	let sum = 0
	for (let i = 0; i < n; i++) {
		const w = worldsIn[i]
		if (!Array.isArray(w) || w.length !== 2) {
			return fail('shape', 'a world must be [board, weight]')
		}
		const b = w[0]
		const weight = w[1]
		if (typeof b !== 'string' || b.length !== 64) {
			return fail('shape', 'a board must be a 64-character string')
		}
		if (!isInt(weight, 1, T)) {
			return fail('I5', 'weights must be integers 1..2^24')
		}
		sum += weight
		if (i > 0 && !(worlds[i - 1][0] < b)) {
			return fail('I6', 'boards must be strictly ascending')
		}
		worlds[i] = [b, weight]
	}
	if (sum !== T) {
		return fail('I5', 'weights must sum to 2^24')
	}
	// I1, I2 per square and per world
	const occ = new Int8Array(64).fill(-1)
	for (let i = 0; i < n; i++) {
		const b = worlds[i][0]
		const seen = new Uint8Array(32)
		for (let s = 0; s < 64; s++) {
			const c = b.charCodeAt(s)
			if (c === 46) {
				continue
			}
			const id = idOfCode(c)
			if (id < 0) {
				return fail('shape', 'boards may only contain . A-P a-p')
			}
			if (occ[s] === -1) {
				occ[s] = id
			} else if (occ[s] !== id) {
				return fail('I1', 'two pieces share a square across worlds')
			}
			if (isCaptured[id]) {
				return fail('I2', 'captured id on a board')
			}
			if (seen[id]) {
				return fail('I2', 'a piece appears twice in one board')
			}
			seen[id] = 1
		}
		for (let id = 0; id < 32; id++) {
			if (!isCaptured[id] && !seen[id]) {
				return fail('I2', 'live id ' + id + ' missing from a board')
			}
		}
	}
	// I3, I4: classical pawns and kings
	const b0 = worlds[0][0]
	for (let id = 0; id < 32; id++) {
		if (isCaptured[id]) {
			continue
		}
		const ty = types[id]
		if (ty !== 'p' && ty !== 'k') {
			continue
		}
		const code = letterCodeOf(id)
		const s0 = b0.indexOf(String.fromCharCode(code))
		for (let i = 1; i < n; i++) {
			if (worlds[i][0].charCodeAt(s0) !== code) {
				return fail(ty === 'p' ? 'I3' : 'I4', (ty === 'p' ? 'pawn ' : 'king ') + id + ' must be classical')
			}
		}
		if (ty === 'p' && (s0 < 8 || s0 >= 56)) {
			return fail('I3', 'pawn on rank 1 or 8')
		}
	}
	// I9: castling
	if (castling !== '-') {
		for (const flag of CASTLING_FLAGS) {
			if (!castling.includes(flag)) {
				continue
			}
			const c = CASTLING[flag]
			const kc = letterCodeOf(c.king)
			const rc = letterCodeOf(c.rook)
			for (let i = 0; i < n; i++) {
				const b = worlds[i][0]
				if (b.charCodeAt(c.from) !== kc || b.charCodeAt(c.rookFrom) !== rc) {
					return fail('I9', 'castling flag ' + flag + ' needs king and rook on their home squares')
				}
			}
		}
	}
	// I10: en passant
	if (ep !== '-') {
		const e = (ep.charCodeAt(1) - 49) * 8 + (ep.charCodeAt(0) - 97)
		const er = e >> 3
		if ((turn === 'b' && er !== 2) || (turn === 'w' && er !== 5)) {
			return fail('I10', 'ep square on the wrong rank')
		}
		const p = turn === 'b' ? e + 8 : e - 8
		const pid = occ[p]
		const pawnWhite = turn === 'b'
		if (pid < 0 || (pid < 16) !== pawnWhite || types[pid] !== 'p') {
			return fail('I10', 'no double-pushed pawn beside the ep square')
		}
		let beside = false
		for (const df of [-1, 1]) {
			const file = (p & 7) + df
			if (file < 0 || file > 7) {
				continue
			}
			const s = (p & ~7) + file
			const id = occ[s]
			if (id >= 0 && (id < 16) === (turn === 'w') && types[id] === 'p') {
				beside = true
			}
		}
		if (!beside) {
			return fail('I10', 'no pawn of the side to move beside the double-pushed pawn')
		}
		if (occ[e] !== -1) {
			return fail('I10', 'ep square must be empty')
		}
	}
	// history
	if (!Array.isArray(historyIn) || historyIn.length < 1 || historyIn.length > halfmove + 1) {
		return fail('I11', 'history must have 1..halfmove+1 entries')
	}
	const history = new Array(historyIn.length)
	for (let i = 0; i < historyIn.length; i++) {
		const h = historyIn[i]
		if (typeof h !== 'string' || !HEX16.test(h)) {
			return fail('I11', 'history entries must be 16 lowercase hex digits')
		}
		history[i] = h
	}
	if (history[history.length - 1] !== hashParts(turn, castling, ep, types, worlds)) {
		return fail('I11', 'the last history entry must be the position hash')
	}
	const state = { v: V, types, worlds, turn, castling, ep, halfmove, fullmove, ply, captured, history, result }
	// I7: budget
	const a = analyse(state)
	if (projection(a, 0).count > BUDGET || projection(a, 1).count > BUDGET) {
		return fail('I7', 'budget exceeds 8')
	}
	return { ok: true, state }
}
