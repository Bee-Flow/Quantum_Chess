/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The trainer progress document (SPEC §14.8.4, GAME-DESIGN §5.6): mirrored in localStorage and synced with
 * `PUT /api/trainer/progress` (debounced 2 s). The merge is the same as `TrainerProgressService::mergeDocs`.
 */

import { reactive } from 'vue'
import { getTrainerProgress, saveTrainerProgress } from '../services/api.js'
import { initial } from '../services/initialState.js'
import { readJson, writeJson } from '../services/storage.js'

export const STORAGE_KEY = 'quantumchess.trainer.v1'
export const SYNC_DELAY_MS = 2000

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

/**
 * The earlier of two timestamps (null/undefined lose).
 *
 * @param {number|null|undefined} a timestamp
 * @param {number|null|undefined} b timestamp
 * @return {number|null}
 */
function earliest(a, b) {
	if (a === null || a === undefined) {
		return b ?? null
	}
	if (b === null || b === undefined) {
		return a
	}
	return Math.min(a, b)
}

/**
 * The larger of two numbers (missing values lose).
 *
 * @param {number|undefined} a number
 * @param {number|undefined} b number
 * @return {number|undefined}
 */
function max(a, b) {
	if (typeof a !== 'number') {
		return b
	}
	return typeof b === 'number' ? Math.max(a, b) : a
}

const RULES = {
	lessons: { done: 'or', stars: 'max', at: 'earliest' },
	puzzles: { solved: 'or', stars: 'max', tries: 'max', hints: 'max', at: 'earliest' },
}

/**
 * Merge two map entries by field rules; unknown keys: the incoming value wins.
 *
 * @param {object} a stored entry
 * @param {object} b incoming entry
 * @param {object} rules field rules
 * @return {object}
 */
function mergeEntry(a, b, rules) {
	const out = { ...a, ...b }
	for (const [field, rule] of Object.entries(rules)) {
		if (!(field in a) && !(field in b)) {
			continue
		}
		if (rule === 'or') {
			out[field] = Boolean(a[field]) || Boolean(b[field])
		} else if (rule === 'max') {
			out[field] = max(a[field], b[field])
		} else {
			out[field] = earliest(a[field], b[field])
		}
	}
	return out
}

/**
 * Merge every numeric leaf by maximum.
 *
 * @param {unknown} a stored
 * @param {unknown} b incoming
 * @return {unknown}
 */
function mergeCounters(a, b) {
	if (isObj(a) && isObj(b)) {
		const out = { ...a }
		for (const [k, v] of Object.entries(b)) {
			out[k] = k in a ? mergeCounters(a[k], v) : v
		}
		return out
	}
	if (typeof a === 'number' && typeof b === 'number') {
		return Math.max(a, b)
	}
	return b ?? a
}

/**
 * Merge two progress documents (SPEC §14.8.4).
 *
 * @param {object} a stored document
 * @param {object} b incoming document
 * @return {object}
 */
export function mergeProgress(a, b) {
	a = isObj(a) ? a : {}
	b = isObj(b) ? b : {}
	const out = { ...a, ...b, v: 1 }
	for (const map of ['lessons', 'puzzles']) {
		if (map in a || map in b) {
			const x = isObj(a[map]) ? a[map] : {}
			const y = isObj(b[map]) ? b[map] : {}
			const m = { ...x }
			for (const [id, entry] of Object.entries(y)) {
				m[id] = isObj(x[id]) && isObj(entry) ? mergeEntry(x[id], entry, RULES[map]) : entry
			}
			out[map] = m
		}
	}
	if ('achievements' in a || 'achievements' in b) {
		const x = isObj(a.achievements) ? a.achievements : {}
		const y = isObj(b.achievements) ? b.achievements : {}
		const m = { ...x }
		for (const [id, at] of Object.entries(y)) {
			m[id] = earliest(x[id], at)
		}
		out.achievements = m
	}
	if ('counters' in a || 'counters' in b) {
		out.counters = mergeCounters(a.counters ?? {}, b.counters ?? {})
	}
	if ('xp' in a || 'xp' in b) {
		out.xp = max(a.xp, b.xp)
	}
	if (isObj(a.streak) && isObj(b.streak)) {
		const later = String(a.streak.last ?? '') > String(b.streak.last ?? '') ? a.streak : b.streak
		out.streak = { ...later, best: max(a.streak.best, b.streak.best) }
	}
	return out
}

/**
 * Stars for a finished lesson (GAME-DESIGN §5.1.1): 3 = no hints and no retries; 2 = at most 2 hints or 1 retry.
 *
 * @param {number} hints hints used
 * @param {number} retries retries
 * @return {number}
 */
export function lessonStars(hints, retries) {
	if (hints === 0 && retries === 0) {
		return 3
	}
	return (hints <= 2 && retries === 0) || (hints === 0 && retries <= 1) ? 2 : 1
}

/**
 * Stars for a solved puzzle (GAME-DESIGN §5.2.1): 3 = first try, no hints; 2 = at most one hint or a second try.
 *
 * @param {number} tries attempts including the solving one
 * @param {number} hints hints used
 * @return {number}
 */
export function puzzleStars(tries, hints) {
	if (tries <= 1 && hints === 0) {
		return 3
	}
	return (tries <= 1 && hints <= 1) || (tries <= 2 && hints === 0) ? 2 : 1
}

/** The reactive progress document. */
export const progress = reactive(mergeProgress(initial('trainerProgress', {}), readJson(STORAGE_KEY, {})))

let timer = null

/** Persist locally and schedule the server sync. */
function persist() {
	writeJson(STORAGE_KEY, progress)
	clearTimeout(timer)
	timer = setTimeout(() => {
		syncProgress().catch(() => {})
	}, SYNC_DELAY_MS)
}

/**
 * Replace the reactive document's content.
 *
 * @param {object} doc document
 */
function assign(doc) {
	for (const k of Object.keys(progress)) {
		if (!(k in doc)) {
			delete progress[k]
		}
	}
	Object.assign(progress, doc)
}

/**
 * Send the local document to the server and adopt the merged answer.
 *
 * @return {Promise<void>}
 */
export async function syncProgress() {
	clearTimeout(timer)
	timer = null
	const merged = await saveTrainerProgress(JSON.parse(JSON.stringify(progress)))
	assign(mergeProgress(progress, merged))
	writeJson(STORAGE_KEY, progress)
}

/**
 * Fetch the server document (another device may have progressed) and merge it in.
 *
 * @return {Promise<void>}
 */
export async function refreshProgress() {
	const remote = await getTrainerProgress()
	assign(mergeProgress(progress, remote))
	writeJson(STORAGE_KEY, progress)
	// push what only this device knows (the server merges, so a redundant PUT is harmless)
	if (Object.keys(progress.lessons ?? {}).length || Object.keys(progress.puzzles ?? {}).length) {
		persist()
	}
}

/**
 * Record a finished lesson.
 *
 * @param {string} id lesson id
 * @param {number} stars 1–3
 */
export function recordLesson(id, stars) {
	const now = Math.floor(Date.now() / 1000)
	assign(mergeProgress(progress, { lessons: { [id]: { done: true, stars, at: now } } }))
	persist()
}

/**
 * Record a puzzle attempt or solve.
 *
 * @param {string} id puzzle id
 * @param {object} entry {solved, stars, tries, hints}
 */
export function recordPuzzle(id, entry) {
	const now = Math.floor(Date.now() / 1000)
	assign(mergeProgress(progress, { puzzles: { [id]: { ...entry, at: entry.solved ? now : null } } }))
	persist()
}

/**
 * The first lesson that is not done, or null when all are.
 *
 * @param {object[]} lessons curriculum
 * @return {object|null}
 */
export function nextLesson(lessons) {
	return lessons.find((l) => !progress.lessons?.[l.id]?.done) ?? null
}
