/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Local games (computer, LLM opponent, pass & play), kept in `localStorage` together with their roll memo
 * (docs/engine-rules.md §9.3). The index `quantumchess.localGames.v1` holds `[{id, mode, updatedAt, result, players}]`;
 * each game is one record under `quantumchess.localGame.v1.<id>`. At most 50 records are kept, and the oldest finished
 * ones are pruned first.
 */

import { applyMove, initialState, moveNotation, rollIdentity, validateState } from '../engine/index.js'
import { localGameId } from '../services/ids.js'
import { readJson, removeKey, writeJson } from '../services/storage.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */

export const INDEX_KEY = 'quantumchess.localGames.v1'
export const RECORD_PREFIX = 'quantumchess.localGame.v1.'
export const MAX_LOCAL_GAMES = 50

const MODES = ['computer', 'ai', 'local']

/**
 * Unix seconds.
 *
 * @return {number}
 */
const nowSeconds = () => Math.floor(Date.now() / 1000)

/**
 * The index, newest first.
 *
 * @return {Array<{id: string, mode: string, updatedAt: number, result: object|null, players: object}>}
 */
export function listLocalGames() {
	const index = readJson(INDEX_KEY, [])
	return (Array.isArray(index) ? index : [])
		.filter((e) => e && typeof e.id === 'string' && MODES.includes(e.mode))
		.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Load a record.
 *
 * @param {string} id game id
 * @return {object|null}
 */
export function loadLocalGame(id) {
	const record = readJson(RECORD_PREFIX + id, null)
	if (!record || record.v !== 1 || record.id !== id || !Array.isArray(record.moves) || !MODES.includes(record.mode)) {
		return null
	}
	record.rolls ??= {}
	record.ai ??= { answerMode: 'code', fallbackPlies: [], chat: [] }
	record.options ??= {}
	return record
}

/**
 * Remove records beyond the limit: the oldest finished first, then the oldest.
 *
 * @param {object[]} index index entries
 * @return {object[]} the kept entries
 */
function prune(index) {
	const kept = [...index].sort((a, b) => b.updatedAt - a.updatedAt)
	while (kept.length > MAX_LOCAL_GAMES) {
		let victim = -1
		for (let i = kept.length - 1; i >= 0; i--) {
			if (kept[i].result) {
				victim = i
				break
			}
		}
		if (victim === -1) {
			victim = kept.length - 1
		}
		removeKey(RECORD_PREFIX + kept[victim].id)
		kept.splice(victim, 1)
	}
	return kept
}

/**
 * Save a record (sets `updatedAt`) and its index entry.
 *
 * @param {object} record local game record
 * @return {object} the record
 */
export function saveLocalGame(record) {
	record.updatedAt = nowSeconds()
	writeJson(RECORD_PREFIX + record.id, record)
	const entry = {
		id: record.id,
		mode: record.mode,
		updatedAt: record.updatedAt,
		result: record.result ?? null,
		players: record.players,
	}
	const index = listLocalGames().filter((e) => e.id !== record.id)
	index.push(entry)
	writeJson(INDEX_KEY, prune(index))
	return record
}

/**
 * Delete a record.
 *
 * @param {string} id game id
 */
export function deleteLocalGame(id) {
	removeKey(RECORD_PREFIX + id)
	writeJson(INDEX_KEY, listLocalGames().filter((e) => e.id !== id))
}

/**
 * Create and save a new local game.
 *
 * @param {object} options options
 * @param {'computer'|'ai'|'local'} options.mode mode
 * @param {{w: object, b: object}} options.players players ({kind: 'human'|'engine'|'ai'|'local', …})
 * @param {'w'|'b'|null} [options.humanColor] the human's colour, null in pass & play
 * @param {object|null} [options.startState] setup position
 * @param {object} [options.options] game options: coach, autoFlip, tabletop
 * @return {object} the record
 */
export function createLocalGame({ mode, players, humanColor = null, startState = null, options = {} }) {
	if (!MODES.includes(mode)) {
		throw new TypeError('unknown local game mode: ' + String(mode))
	}
	const t = nowSeconds()
	const record = {
		v: 1,
		id: localGameId(),
		mode,
		createdAt: t,
		updatedAt: t,
		players,
		humanColor: mode === 'local' ? null : humanColor,
		startState: startState ? validateState(startState).state ?? null : null,
		moves: [],
		rolls: {},
		state: null,
		result: null,
		assisted: false,
		coachUsed: false,
		undoCount: 0,
		ai: { answerMode: 'code', fallbackPlies: [], chat: [] },
		options: { coach: 'beginner', autoFlip: false, tabletop: false, ...options },
		imported: false,
	}
	return saveLocalGame(record)
}

/**
 * Draw a fresh roll value (24 bits).
 *
 * @return {number}
 */
export function drawU() {
	return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 8
}

/**
 * The roll memo (docs/engine-rules.md §9.3): the same move in the same position always gets the same `u`, so undoing a
 * move and playing it again never changes a result the player has already seen. A new identity draws a value, stores
 * it in `record.rolls` and **saves the record before** the caller applies the move.
 *
 * @param {object} record local game record
 * @param {EngineState} stateBefore state before the move
 * @param {string} code move code
 * @param {() => number} [draw] roll source (tests)
 * @return {number}
 */
export function rollFor(record, stateBefore, code, draw = drawU) {
	const identity = rollIdentity(stateBefore, code)
	const known = record.rolls[identity]
	if (Number.isInteger(known)) {
		return known
	}
	const u = draw()
	record.rolls[identity] = u
	saveLocalGame(record)
	return u
}

/**
 * Apply one recorded move: with its roll value when it has one, else with its recorded outcome.
 *
 * @param {EngineState} state state before the move
 * @param {{code: string, u?: number|null, key?: string|null}} entry the recorded move
 * @return {{state: object, move: object, measurement: object|null}}
 */
export function applyRecorded(state, entry) {
	if (Number.isInteger(entry.u)) {
		return applyMove(state, entry.code, { u: entry.u })
	}
	return applyMove(state, entry.code, entry.key ? { outcome: entry.key } : {})
}

/**
 * Replay a record from its start with the recorded rolls.
 *
 * @param {object} record local game record
 * @param {number} [n] number of moves (default all)
 * @return {{state: object, steps: Array<{before: object, after: object, move: object, measurement: object|null}>}}
 */
export function replayLocalGame(record, n = record.moves.length) {
	let state = record.startState ?? initialState()
	const steps = []
	for (let i = 0; i < n && i < record.moves.length; i++) {
		const res = applyRecorded(state, record.moves[i])
		steps.push({ before: state, after: res.state, move: res.move, measurement: res.measurement })
		state = res.state
	}
	return { state, steps }
}

/**
 * The MoveEntry of a played move of a local game, for the move list.
 *
 * @param {{before: object, move: object, measurement: object|null}} step the applied move
 * @param {object} entry the move as the record stores it: {code, u, key, by, t, comment?, mood?}
 * @return {import('./gameController.js').MoveEntry}
 */
export function toMoveEntry(step, entry) {
	return {
		ply: step.before.ply,
		color: step.before.turn,
		code: step.move.code,
		notation: moveNotation(step.before, step.move, step.measurement),
		measurement: step.measurement,
		u: entry.u ?? null,
		by: entry.by ?? 'human',
		comment: entry.comment,
		mood: entry.mood,
		createdAt: entry.t,
	}
}
