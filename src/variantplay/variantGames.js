/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Variant games on this device, in the browser storage: an index plus one record per game. A record keeps the start
 * state and every move with the index of its outcome, so the game can be replayed exactly (undo), and the current
 * state, so opening a game needs no replay.
 *
 * The worlds of the two states are saved packed (record version 2, `packWorlds`): the first world in full and every
 * other world as its differences from the first. The worlds of one state differ in a few pieces, so a state of 64
 * worlds on a large board takes a few percent of its plain size (3.4 MB become about 140 KB in the multiverse).
 * Records of version 1 (worlds in full) are still read. When the storage refuses a record, the finished games are
 * removed, the oldest first, until it fits (the browser storage is shared by the whole Nextcloud site, so it may be
 * full of other data). A record that still does not fit is not saved: `saveVariantGame` then returns false and the
 * game view tells the player; a new game that cannot be stored is not created (`createVariantGame` returns null).
 */

import { localGameId } from '../services/ids.js'
import { readJson, removeKey, writeJson } from '../services/storage.js'

export const INDEX_KEY = 'quantumchess.variants.index.v1'
export const RECORD_PREFIX = 'quantumchess.variants.game.v1.'
/** Games kept per device; the oldest finished games go first. */
export const MAX_GAMES = 24
/** The version of the saved records: 2 since the worlds are packed. */
export const RECORD_VERSION = 2

/** The arrays of a world saved as differences (world.js: square, type and side per piece, piece per square). */
const ARRAYS = Object.freeze(['sq', 'ty', 'sd', 'board'])

/**
 * @typedef {object} VariantGameRecord
 * @property {number} v record version (`RECORD_VERSION`; the saved format, the record in memory always holds full
 *   worlds)
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
 * Whether a world has exactly the fields of the first world and the four arrays, so it can be saved as differences.
 *
 * @param {object} b world
 * @param {object} b0 the first world
 * @return {boolean}
 */
function samePlan(b, b0) {
	const keys = Object.keys(b)
	return keys.length === Object.keys(b0).length && keys.every((k) => k in b0)
		&& ARRAYS.every((k) => Array.isArray(b[k]) && Array.isArray(b0[k]))
}

/**
 * The worlds of a state as they are saved: the first one in full; every other one as `{ w, d, n?, f? }`, where `d`
 * lists per array (`sq`, `ty`, `sd`, `board`) the indices whose value differs from the first world, with their
 * values (`[index, value, index, value, ...]`, left out when nothing differs), `n` the length of an array whose
 * length differs, and `f` the other fields (`x`, the variant's extra state) whose JSON differs. A world whose fields
 * differ from those of the first is kept in full.
 *
 * @param {Array<{b: object, w: number}>} worlds the worlds of a state
 * @return {object[]}
 */
export function packWorlds(worlds) {
	const b0 = worlds[0].b
	const others = Object.keys(b0).filter((k) => !ARRAYS.includes(k))
	const json0 = Object.fromEntries(others.map((k) => [k, JSON.stringify(b0[k])]))
	return worlds.map(({ b, w }, i) => {
		if (i === 0 || !samePlan(b, b0)) {
			return { b, w }
		}
		const d = {}
		const n = {}
		for (const k of ARRAYS) {
			const a = b[k]
			const a0 = b0[k]
			const changes = []
			for (let j = 0; j < a.length; j++) {
				if (a[j] !== a0[j]) {
					changes.push(j, a[j])
				}
			}
			if (changes.length > 0) {
				d[k] = changes
			}
			if (a.length !== a0.length) {
				n[k] = a.length
			}
		}
		const out = { w, d }
		if (Object.keys(n).length > 0) {
			out.n = n
		}
		for (const k of others) {
			if (JSON.stringify(b[k]) !== json0[k]) {
				out.f ??= {}
				out.f[k] = b[k]
			}
		}
		return out
	})
}

/**
 * The worlds of a state from their saved form (`packWorlds`). Every world gets its own arrays and fields.
 *
 * @param {object[]} packed the saved worlds
 * @return {Array<{b: object, w: number}>}
 */
export function unpackWorlds(packed) {
	const b0 = packed[0].b
	return packed.map((e) => {
		if (e.b) {
			return { b: e.b, w: e.w }
		}
		const b = {}
		for (const k of Object.keys(b0)) {
			if (ARRAYS.includes(k)) {
				const a = b0[k].slice(0, e.n?.[k] ?? b0[k].length)
				const changes = e.d?.[k] ?? []
				for (let j = 0; j < changes.length; j += 2) {
					a[changes[j]] = changes[j + 1]
				}
				b[k] = a
			} else {
				b[k] = JSON.parse(JSON.stringify(e.f && k in e.f ? e.f[k] : b0[k]))
			}
		}
		return { b, w: e.w }
	})
}

/**
 * A state with its worlds packed or unpacked.
 *
 * @param {object} state state
 * @param {(worlds: object[]) => object[]} how `packWorlds` or `unpackWorlds`
 * @return {object}
 */
function withWorlds(state, how) {
	return { ...state, worlds: how(state.worlds) }
}

/**
 * Whether a saved state has worlds to read.
 *
 * @param {object} state saved state
 * @return {boolean}
 */
function hasWorlds(state) {
	return Boolean(state) && Array.isArray(state.worlds) && state.worlds.length > 0 && Boolean(state.worlds[0]?.b)
}

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
 * Load a game record, of version 1 (worlds in full) or 2 (worlds packed); the record returned holds full worlds.
 *
 * @param {string} id game id
 * @return {VariantGameRecord|null} the record, or null when it is missing or unreadable
 */
export function loadVariantGame(id) {
	const rec = readJson(RECORD_PREFIX + id, null)
	if (!rec || (rec.v !== 1 && rec.v !== RECORD_VERSION) || !hasWorlds(rec.current) || !hasWorlds(rec.initial)) {
		return null
	}
	if (rec.v === 1) {
		return { ...rec, v: RECORD_VERSION }
	}
	try {
		const initial = withWorlds(rec.initial, unpackWorlds)
		return { ...rec, initial, current: withWorlds(rec.current, unpackWorlds) }
	} catch {
		return null
	}
}

/**
 * Write a record, making room for it when the storage refuses it: the finished games other than this one are removed,
 * the oldest first, one at a time, until the record fits or none is left. A game that is still running is never
 * removed.
 *
 * @param {string} id game id
 * @param {object} saved the record as it is saved
 * @return {boolean} whether the record is written
 */
function writeRecord(id, saved) {
	if (writeJson(RECORD_PREFIX + id, saved)) {
		return true
	}
	const finished = listVariantGames().filter((e) => e.result && e.id !== id)
	while (finished.length) {
		const victim = finished.pop()
		deleteVariantGame(victim.id)
		if (writeJson(RECORD_PREFIX + id, saved)) {
			return true
		}
	}
	return false
}

/**
 * Save a game record (packed, version 2) and update the index. When the storage refuses the record (it is full, or
 * not available) even after the finished games made room (`writeRecord`), the stored copy and the index stay as they
 * were; when it refuses the index of a game that was not listed yet, the record is removed again, so that no game
 * takes space without being listed.
 *
 * @param {VariantGameRecord} rec record (its worlds in full; it is not changed apart from `updated`)
 * @return {boolean} whether the game is stored
 */
export function saveVariantGame(rec) {
	rec.updated = Date.now()
	const saved = {
		...rec,
		v: RECORD_VERSION,
		initial: withWorlds(rec.initial, packWorlds),
		current: withWorlds(rec.current, packWorlds),
	}
	if (!writeRecord(rec.id, saved)) {
		return false
	}
	const before = listVariantGames()
	const listed = before.some((e) => e.id === rec.id)
	const index = before.filter((e) => e.id !== rec.id)
	index.unshift({
		id: rec.id,
		variant: rec.variant,
		updated: rec.updated,
		result: rec.current.result ?? null,
		ply: rec.current.ply,
		players: rec.players.map((p) => p.kind),
	})
	const removed = []
	while (index.length > MAX_GAMES) {
		// never the game being saved (the first entry)
		const victim = index.slice(1).reverse().find((e) => e.result) ?? index[index.length - 1]
		index.splice(index.indexOf(victim), 1)
		removed.push(victim.id)
	}
	if (!writeJson(INDEX_KEY, index)) {
		if (!listed) {
			removeKey(RECORD_PREFIX + rec.id)
		}
		return listed
	}
	for (const id of removed) {
		removeKey(RECORD_PREFIX + id)
	}
	return true
}

/**
 * Create and store a new game. A game that the storage refuses (`saveVariantGame` returns false) is not created: it
 * could not be opened.
 *
 * @param {object} data game data
 * @param {string} data.variant variant id
 * @param {object} data.options option values
 * @param {object[]} data.players one per side
 * @param {object} data.initial start state
 * @param {boolean} [data.autoFlip] turn the board in pass & play
 * @return {VariantGameRecord|null} the record, or null when it could not be stored
 */
export function createVariantGame({ variant, options, players, initial, autoFlip = false }) {
	const now = Date.now()
	const rec = {
		v: RECORD_VERSION,
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
	return saveVariantGame(rec) ? rec : null
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
