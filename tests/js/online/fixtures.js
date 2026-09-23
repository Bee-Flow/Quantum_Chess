/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Server-shaped online games for the frontend-online tests: GameFull with MoveDTOs, chains and states computed the
 * way GameService does (SPEC §8.4), so the client checks run against real engine data.
 */

import { applyMove, chainNext, chainStart, initialState, moveNotation, positionHash, serializeState } from '../../../src/engine/index.js'

export const ALICE = { userId: 'alice', displayName: 'Alice' }
export const BOB = { userId: 'bob', displayName: 'Bob' }

/**
 * Build a GameFull after the given moves.
 *
 * @param {Array<string|{code: string, u: number}>} list moves (rolled moves need u)
 * @param {object} [extra] fields to override
 * @return {object} GameFull
 */
export function makeGame(list = [], extra = {}) {
	const base = {
		id: 42,
		status: 'active',
		timeControl: 'corr:3d',
		rated: true,
		ratedRequested: true,
		creator: ALICE,
		opponent: BOB,
		white: ALICE,
		black: BOB,
		colorChoice: 'r',
		myColor: 'w',
		createdAt: 1790000000,
		startedAt: 1790000010,
		deadlineAt: 1790259200,
		expiresAt: null,
		result: null,
		resultReason: null,
		winner: null,
		ratingChange: null,
		rematchOf: null,
		rematchId: null,
		drawOffer: null,
		canOfferDraw: true,
		drawAvailableAtPly: null,
		canAbort: true,
		canResign: true,
		canRematch: false,
		ratings: { w: { rating: 1200, provisional: true }, b: { rating: 1210, provisional: true } },
		muted: false,
		chatCount: 0,
		chatOpen: true,
		now: 1790000200,
		startState: null,
		chat: [],
		...extra,
	}
	let state = base.startState ?? initialState()
	let chain = chainStart(base.id, base.white.userId, base.black.userId, base.createdAt)
	const moves = []
	for (const item of list) {
		const code = typeof item === 'string' ? item : item.code
		const u = typeof item === 'string' ? undefined : item.u
		const r = applyMove(state, code, u === undefined ? {} : { u })
		chain = chainNext(chain, state.ply, r.move.code, r.measurement?.u ?? null, r.measurement?.key ?? null, r.state)
		moves.push({
			ply: state.ply,
			color: state.turn,
			userId: state.turn === 'w' ? base.white.userId : base.black.userId,
			code: r.move.code,
			notation: moveNotation(state, r.move.code, r.measurement),
			measurement: r.measurement,
			chain,
			stateHash: positionHash(r.state),
			createdAt: 1790000100 + moves.length,
		})
		state = r.state
	}
	return {
		...base,
		turn: state.turn,
		ply: state.ply,
		state: JSON.parse(serializeState(state)),
		chain,
		moves,
		rev: 10 + moves.length,
		canAbort: base.canAbort && state.ply < 2,
		...extra,
	}
}

/**
 * The live part of a GameFull (what poll and move answers carry).
 *
 * @param {object} full GameFull
 * @return {object} GameLive
 */
export function live(full) {
	const copy = { ...full }
	delete copy.moves
	delete copy.chat
	delete copy.startState
	return copy
}
