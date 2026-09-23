/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The hash-chain check of online games (SPEC §14.4.5, §8.7, ENGINE-RULES §9.4). Every stored move is replayed with
 * its recorded `u`; the recomputed chain must equal the server's chain of every move and the game head, and the last
 * `(ply, chain)` this browser saw of a game (localStorage `quantumchess.chain.v1`) must still be there. A game with a
 * deleted player cannot be verified (the uid of `chain_0` is gone), which is not an alarm.
 */

import { applyMove, chainNext, chainStart, initialState } from '../engine/index.js'

export const CHAIN_STORAGE_KEY = 'quantumchess.chain.v1'
const MAX_STORED = 200

/**
 * Replay one stored move (MoveDTO) on a state with the recorded roll.
 *
 * @param {object} before state before the move
 * @param {object} dto MoveDTO {code, measurement}
 * @return {{state: object, move: object, measurement: object|null}}
 */
export function replayMove(before, dto) {
	const u = dto.measurement && Number.isInteger(dto.measurement.u) ? dto.measurement.u : undefined
	return applyMove(before, dto.code, u === undefined ? {} : { u })
}

/**
 * `chain_0` of a started game, or null when it cannot be computed (a player's account was deleted).
 *
 * @param {object} game GameLive / GameFull
 * @return {string|null}
 */
export function chainSeed(game) {
	const w = game?.white?.userId
	const b = game?.black?.userId
	if (!w || !b || !Number.isInteger(game.createdAt)) {
		return null
	}
	return chainStart(game.id, w, b, game.createdAt)
}

/**
 * The chain after a replayed move.
 *
 * @param {string} prev previous chain
 * @param {object} dto MoveDTO
 * @param {{state: object, move: object, measurement: object|null}} applied replay result
 * @return {string}
 */
export function chainAfter(prev, dto, applied) {
	const m = applied.measurement
	return chainNext(prev, dto.ply, applied.move.code, m ? m.u : null, m ? m.key : null, applied.state)
}

/**
 * Whether a replayed move agrees with the stored record (same outcome key).
 *
 * @param {object} dto MoveDTO
 * @param {{measurement: object|null}} applied replay result
 * @return {boolean}
 */
export function sameMeasurement(dto, applied) {
	const stored = dto.measurement ?? null
	const replayed = applied.measurement ?? null
	if (stored === null || replayed === null) {
		return stored === replayed
	}
	return stored.key === replayed.key && stored.u === replayed.u
}

/**
 * The storage key of a game: id and creation time, so that a reused id (a reset database) never raises an alarm.
 *
 * @param {object} game GameSummary
 * @return {string}
 */
export function chainKey(game) {
	return `${game.id}:${game.createdAt ?? 0}`
}

/**
 * Read the stored `(ply, chain)` of a game.
 *
 * @param {string} id chainKey(game)
 * @return {{ply: number, chain: string}|null}
 */
export function loadStoredChain(id) {
	try {
		const all = JSON.parse(globalThis.localStorage?.getItem(CHAIN_STORAGE_KEY) ?? '{}') ?? {}
		const entry = all[String(id)]
		return Array.isArray(entry) && Number.isInteger(entry[0]) && typeof entry[1] === 'string' ? { ply: entry[0], chain: entry[1] } : null
	} catch {
		return null
	}
}

/**
 * Remember the last verified `(ply, chain)` of a game (the most recent 200 games are kept).
 *
 * @param {string} id chainKey(game)
 * @param {number} ply ply of the move (state ply before it)
 * @param {string} chain the move's chain
 */
export function storeChain(id, ply, chain) {
	try {
		const all = JSON.parse(globalThis.localStorage?.getItem(CHAIN_STORAGE_KEY) ?? '{}') ?? {}
		delete all[String(id)]
		all[String(id)] = [ply, chain]
		const keys = Object.keys(all)
		for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STORED))) {
			delete all[key]
		}
		globalThis.localStorage?.setItem(CHAIN_STORAGE_KEY, JSON.stringify(all))
	} catch {
		// storage is a convenience; the server chain is still checked
	}
}

/**
 * Replay a whole game and check its chain.
 *
 * @param {object} game GameFull (moves in ply order)
 * @return {{states: object[], steps: object[], status: 'ok'|'altered'|'unverifiable', alteredPly: number|null}}
 */
export function verifyGame(game) {
	const states = [game.startState ?? initialState()]
	const steps = []
	let chain = chainSeed(game)
	const verifiable = chain !== null
	let alteredPly = null
	for (const dto of game.moves ?? []) {
		let applied
		try {
			applied = replayMove(states[states.length - 1], dto)
		} catch {
			alteredPly = dto.ply
			break
		}
		steps.push({ before: states[states.length - 1], after: applied.state, move: applied.move, measurement: applied.measurement })
		states.push(applied.state)
		if (!sameMeasurement(dto, applied) && alteredPly === null) {
			alteredPly = dto.ply
		}
		if (verifiable) {
			chain = chainAfter(chain, dto, applied)
			if (chain !== dto.chain && alteredPly === null) {
				alteredPly = dto.ply
			}
		}
	}
	if (verifiable && alteredPly === null && (game.moves ?? []).length === game.ply && chain !== game.chain) {
		alteredPly = game.ply
	}
	if (alteredPly === null) {
		const stored = loadStoredChain(chainKey(game))
		if (stored) {
			const dto = (game.moves ?? []).find((m) => m.ply === stored.ply)
			if (!dto || dto.chain !== stored.chain) {
				alteredPly = stored.ply
			}
		}
	}
	const status = alteredPly !== null ? 'altered' : (verifiable ? 'ok' : 'unverifiable')
	return { states, steps, status, alteredPly, chain: verifiable ? chain : null }
}
