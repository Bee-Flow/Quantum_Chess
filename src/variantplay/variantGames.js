/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Variant games on this device, in the browser storage: an index plus one record per game. A record keeps the start
 * state and every move with the index of its outcome, so the game can be replayed exactly (undo), and the current
 * state, so opening a game needs no replay.
 */

import { localGameId } from '../services/ids.js'
import { readJson, removeKey, writeJson } from '../services/storage.js'

export const INDEX_KEY = 'quantumchess.variants.index.v1'
export const RECORD_PREFIX = 'quantumchess.variants.game.v1.'
/** Games kept per device; the oldest finished games go first. */
export const MAX_GAMES = 24

/**
 * @typedef {object} VariantGameRecord
 * @property {number} v record version
 * @property {string} id game id
 * @property {string} variant variant id
 * @property {object} options option values
 * @property {Array<{kind: 'human'|'computer', level?: string, name?: string}>} players one per side
 * @property {boolean} autoFlip turn the board to the side to move in pass & play
 * @property {object} initial start state
 * @property {Array<{code: string, i: number}>} moves moves with the index of their outcome
 * @property {Record<string, number>} [rolls] the roll memo: `rollMemoKey` of rolls.js (`<ply>:<position hash>:<code
 *   without its promotion>`) → the random number used; keys of older games (`<ply>:<code>`) are never found again
 * @property {object} current current state
 * @property {number} created creation time (ms)
 * @property {number} updated last change (ms)
 */

/**
 * The index of the games on this device, newest first.
 *
 * @return {Array<{id: string, variant: string, updated: number, result: object|null, ply: number}>}
 */
export function listVariantGames() {
	const list = readJson(INDEX_KEY, [])
	return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : []
}

/**
 * Load a game record.
 *
 * @param {string} id game id
 * @return {VariantGameRecord|null}
 */
export function loadVariantGame(id) {
	const rec = readJson(RECORD_PREFIX + id, null)
	return rec && rec.v === 1 && rec.current && rec.initial ? rec : null
}

/**
 * Save a game record and update the index.
 *
 * @param {VariantGameRecord} rec record
 * @return {boolean} whether it was stored
 */
export function saveVariantGame(rec) {
	rec.updated = Date.now()
	const ok = writeJson(RECORD_PREFIX + rec.id, rec)
	const index = listVariantGames().filter((e) => e.id !== rec.id)
	index.unshift({
		id: rec.id,
		variant: rec.variant,
		updated: rec.updated,
		result: rec.current.result ?? null,
		ply: rec.current.ply,
		players: rec.players.map((p) => p.kind),
	})
	while (index.length > MAX_GAMES) {
		const victim = [...index].reverse().find((e) => e.result) ?? index[index.length - 1]
		index.splice(index.indexOf(victim), 1)
		removeKey(RECORD_PREFIX + victim.id)
	}
	writeJson(INDEX_KEY, index)
	return ok
}

/**
 * Create and store a new game.
 *
 * @param {object} data game data
 * @param {string} data.variant variant id
 * @param {object} data.options option values
 * @param {object[]} data.players one per side
 * @param {object} data.initial start state
 * @param {boolean} [data.autoFlip] turn the board in pass & play
 * @return {VariantGameRecord}
 */
export function createVariantGame({ variant, options, players, initial, autoFlip = false }) {
	const now = Date.now()
	const rec = {
		v: 1,
		id: localGameId(),
		variant,
		options,
		players,
		autoFlip,
		initial,
		moves: [],
		rolls: {},
		current: initial,
		created: now,
		updated: now,
	}
	saveVariantGame(rec)
	return rec
}

/**
 * Delete a game.
 *
 * @param {string} id game id
 */
export function deleteVariantGame(id) {
	removeKey(RECORD_PREFIX + id)
	writeJson(INDEX_KEY, listVariantGames().filter((e) => e.id !== id))
}
