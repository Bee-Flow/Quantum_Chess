/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player of the chess variants: a small expectimax search that averages over the outcomes of every roll.
 * It works for every variant through the quantum layer; a variant may add its own terms with `evaluate(world, side)`
 * (King of the Hill rewards a central king, Antichess reverses material, ...).
 *
 * Optional hooks read here: `aiView(state, side)` (the position as a side with hidden information sees it),
 * `evaluate(world, side)`, `materialSign`, and `replySide(state, me)`: whose answer the normal and hard levels look at
 * after one of my moves (default the side to move next; `null` for no answer; bughouse answers with the opponent on
 * the same board). When it is `me` (a turn of several moves, as in the multiverse before Submit), the search takes my
 * best continuation instead.
 *
 * The search yields to the browser every few milliseconds, so the board stays responsive while the computer thinks.
 */

import { branches, legalMoves, splitCode, splitTargets, stateAfter, T, worldResult } from './quantum.mjs'
import { applyClassical, generate, HAND } from './world.mjs'

/**
 * The levels: how deep the computer looks, how much noise it adds (in centipawns) and how long it may think.
 */
export const LEVELS = Object.freeze([
	Object.freeze({ id: 'easy', reply: false, noise: 120, splits: 2, timeMs: 400 }),
	Object.freeze({ id: 'normal', reply: true, noise: 25, splits: 6, timeMs: 1500 }),
	Object.freeze({ id: 'hard', reply: true, fullReply: true, noise: 0, splits: 10, timeMs: 4000 }),
])

const WIN = 100000

/**
 * Whether a side counts as a winner of a finished game.
 *
 * @param {object} result game result
 * @param {number} side side index
 * @return {boolean}
 */
function isWinner(result, side) {
	return result.winner === side || (Array.isArray(result.winners) && result.winners.includes(side))
}

/**
 * The value of a world for a side: own material minus the average enemy material, plus the variant's own terms.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @return {number}
 */
function worldValue(V, b, side) {
	let own = 0
	const enemy = new Array(V.sideCount).fill(0)
	for (let id = 0; id < b.sq.length; id++) {
		const s = b.sq[id]
		if (s < 0 && s !== HAND) {
			continue
		}
		const v = (V.types[b.ty[id]]?.value ?? 100) * (s === HAND ? 0.8 : 1)
		if (b.sd[id] === side) {
			own += v
		} else if (V.enemies(side, b.sd[id])) {
			enemy[b.sd[id]] += v
		} else {
			own += v * 0.5
		}
	}
	const enemies = enemy.filter((v, s) => s !== side && V.enemies(side, s))
	const avg = enemies.length ? enemies.reduce((a, c) => a + c, 0) / enemies.length : 0
	let score = own - avg
	if (V.materialSign === -1) {
		score = -score
	}
	if (V.evaluate) {
		score += V.evaluate(b, side)
	}
	return score
}

/**
 * The value of a state for a side.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} side side index
 * @return {number}
 */
export function evaluateState(V, state, side) {
	if (state.result) {
		if (state.result.winner === null && !state.result.winners) {
			return 0
		}
		return isWinner(state.result, side) ? WIN - state.ply : -WIN + state.ply
	}
	let score = 0
	for (const { b, w } of state.worlds) {
		score += (w / T) * worldValue(V, b, side)
	}
	return score
}

/**
 * The expected value of a move for `side`, averaged over its outcomes.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @param {(s: object) => number} score value of a resulting state
 * @return {number|null}
 */
function expected(V, state, code, score) {
	const list = branches(V, state, code)
	if (!list) {
		return null
	}
	let v = 0
	for (const br of list) {
		v += (br.weight / T) * score(stateAfter(V, state, code, br, list, { light: true }))
	}
	return v
}

/**
 * The candidate moves of a state: every ordinary move, measurement and merge, plus a few splits.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} splitCount how many splits to consider
 * @param {() => number} rng random numbers
 * @return {string[]}
 */
function candidates(V, state, splitCount, rng) {
	const out = legalMoves(V, state).map((m) => m.code)
	if (splitCount > 0) {
		const froms = new Set()
		for (const { b } of state.worlds) {
			for (let id = 0; id < b.sq.length; id++) {
				if (b.sd[id] === state.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) {
					froms.add(b.sq[id])
				}
			}
		}
		const pool = []
		for (const f of froms) {
			pool.push(...aiSplits(V, state, f, rng))
		}
		for (let i = 0; i < splitCount && pool.length; i++) {
			const k = Math.floor(rng() * pool.length)
			out.push(pool.splice(k, 1)[0])
		}
	}
	return out
}

/**
 * The quiet move of piece `X` from `f` to `t` in a world, or null (the move a split applies in that world).
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side to move
 * @param {number} X piece id
 * @param {number} f from square
 * @param {number} t target square
 * @return {object|null}
 */
function quietMove(V, b, side, X, f, t) {
	for (const m of generate(V, b, side).values()) {
		const certain = m.certain ?? (m.kind === 'castle' || m.kind === 'ep')
		if (m.id === X && m.from === f && m.to === t && m.capture < 0 && !m.promo && !m.drop && !certain) {
			return m
		}
	}
	return null
}

/**
 * The splits the computer considers for the piece on `f`. The full list grows quadratically with the number of
 * targets (a queen in the middle of an 8 × 8 board has 351 pairs, a Raumschach queen more than a thousand), so only
 * the best `max` targets are paired: ranked by the value of the first world where the piece stands on `f` after its
 * quiet move to the target, ties broken at random (a quiet move changes the value only through `V.evaluate`, so a
 * fixed order would always pick the same corner). Of the at most `max * (max - 1) / 2` pairs, the legal ones are
 * kept, at most `max`. The list for human players (`splitsFrom`) stays complete.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} f from square
 * @param {() => number} rng random numbers (the search's)
 * @param {number} [max] how many targets, and how many splits at most
 * @return {string[]} split codes
 */
export function aiSplits(V, state, f, rng, max = 6) {
	const targets = splitTargets(V, state, f)
	if (targets.length < 2) {
		return []
	}
	const side = state.turn
	const X = state.worlds.find(({ b }) => b.board[f] >= 0).b.board[f]
	const ranked = targets.map((t) => {
		let value = -Infinity
		for (const { b } of state.worlds) {
			if (b.board[f] !== X) {
				continue
			}
			const m = quietMove(V, b, side, X, f, t)
			if (m) {
				value = worldValue(V, applyClassical(V, b, m), side)
				break
			}
		}
		return { t, value, tie: rng() }
	})
	ranked.sort((a, b) => b.value - a.value || a.tie - b.tie)
	const best = ranked.slice(0, max).map((e) => e.t)
	const out = []
	for (let i = 0; i < best.length && out.length < max; i++) {
		for (let j = i + 1; j < best.length && out.length < max; j++) {
			const code = splitCode(V, f, best[i], best[j])
			if (branches(V, state, code)) {
				out.push(code)
			}
		}
	}
	return out
}

/**
 * Whether a move might force the game: some outcome captures something or ends the game (the moves tried first, and
 * the only replies the normal level looks at). A Missed outcome keeps the old world, so it ends nothing.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @return {boolean}
 */
export function mightForce(V, state, code) {
	const list = branches(V, state, code)
	return Boolean(list && list.some((br) => br.captures.length > 0
		|| worldResult(V, br.worlds[0].b, state.turn) !== null))
}

/**
 * Wait for the browser to breathe.
 *
 * @return {Promise<void>}
 */
function breathe() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Choose a move for the side to move.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {object} [opts] options
 * @param {string} [opts.level] easy, normal or hard
 * @param {() => number} [opts.rng] random numbers
 * @param {AbortSignal} [opts.signal] abort the search
 * @return {Promise<string|null>} a move code, or null when there is none
 */
export async function chooseMove(V, state, { level = 'normal', rng = Math.random, signal } = {}) {
	const L = LEVELS.find((l) => l.id === level) ?? LEVELS[1]
	const me = state.turn
	// hidden-information variants: search the position as this side sees it, then keep the moves that are legal
	const real = state
	if (V.aiView) {
		state = V.aiView(state, me)
	}
	const moves = candidates(V, state, L.splits, rng).filter((c) => real === state || branches(V, real, c))
	if (!moves.length) {
		return null
	}
	const started = Date.now()
	let lastBreath = started
	const deadline = started + L.timeMs
	const forcing = moves.filter((c) => mightForce(V, state, c))
	const ordered = [...forcing, ...moves.filter((c) => !forcing.includes(c))]
	let best = null
	let bestValue = -Infinity
	for (const code of ordered) {
		if (signal?.aborted) {
			return null
		}
		if (Date.now() > deadline && best !== null) {
			break
		}
		const value = expected(V, state, code, (s) => {
			if (!L.reply || s.result) {
				return evaluateState(V, s, me)
			}
			return replyValue(V, s, me, L)
		})
		if (value === null) {
			continue
		}
		const noisy = value + (L.noise ? (rng() - 0.5) * 2 * L.noise : 0)
		if (noisy > bestValue) {
			bestValue = noisy
			best = code
		}
		if (Date.now() - lastBreath > 12) {
			await breathe()
			lastBreath = Date.now()
		}
	}
	return best
}

/**
 * The value for `me` after the replying side answers with its best move (captures and game-ending moves only below
 * the hard level). The replying side is `V.replySide(s, me)`, by default the side to move next: `null` means no
 * answer (the value of `s`); another side than the one to move is searched on a copy of `s` with that side to move;
 * `me` itself (a turn of several moves) means my best continuation, since "the best answer for `them`" is then the
 * best for me.
 *
 * @param {object} V variant
 * @param {object} s state after my move
 * @param {number} me my side
 * @param {object} L level
 * @return {number}
 */
function replyValue(V, s, me, L) {
	const them = V.replySide ? V.replySide(s, me) : s.turn
	if (them === null || them === undefined) {
		return evaluateState(V, s, me)
	}
	const r = them === s.turn ? s : { ...s, turn: them }
	let codes = legalMoves(V, r).map((m) => m.code)
	if (!L.fullReply) {
		codes = codes.filter((c) => mightForce(V, r, c))
	}
	if (!codes.length) {
		return evaluateState(V, s, me)
	}
	let worst = evaluateState(V, s, me)
	let bestForThem = -Infinity
	for (const c of codes) {
		let mine = 0
		let theirs = 0
		const list = branches(V, r, c)
		if (!list) {
			continue
		}
		for (const br of list) {
			const n = stateAfter(V, r, c, br, list, { light: true })
			mine += (br.weight / T) * evaluateState(V, n, me)
			theirs += (br.weight / T) * evaluateState(V, n, them)
		}
		if (theirs > bestForThem) {
			bestForThem = theirs
			worst = mine
		}
	}
	return worst
}
