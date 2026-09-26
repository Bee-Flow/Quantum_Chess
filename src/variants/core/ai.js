/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player of the chess variants: a small expectimax search that averages over the outcomes of every roll.
 * It works for every variant through the quantum layer; a variant may add its own terms with `evaluate(world, side)`
 * (King of the Hill rewards a central king, Antichess reverses material, ...).
 *
 * Optional hooks read here: `aiView(state, side, level)` (the position as a side with hidden information sees it;
 * `level` is the id of the level, `'easy'`, `'normal'` or `'hard'`), `evaluate(world, side)`, `materialSign`, and
 * `replySide(state, me)`: whose answer the normal and hard levels look at after one of my moves (default the side to
 * move next; `null` for no answer; bughouse answers with the opponent on the same board). When it is `me` (a turn of
 * several moves, as in the multiverse before Submit), the search takes my best continuation instead. Two more:
 *
 * - `aiTimeShare(state) -> number` in (0, 1]: the share of the level's time this ply may take (default 1; a value
 *   outside that range counts as 1). A turn of several moves shares one level time that way.
 * - `aiViewExact` (declaration flag, default false): every candidate of `aiView` is legal on the real state with the
 *   same outcomes. The search then checks only the move it chose on the real state (and the next best when that one is
 *   not legal) instead of every candidate.
 *
 * The classic "your king cannot escape" (the variant's `escapeRule`, docs/rules.md 5) is seen in three places: the
 * outcomes of my own moves are the real states of the game, so a move after which the enemy cannot escape is a win
 * and one that ends the game against me is a loss; after my move or an answer, a side to move that can capture an
 * enemy royal piece for certain has won, and after an answer, a side whose royal piece can be captured for certain,
 * or that might be boxed in (few pieces and no safe step of a royal piece, `mayBeBoxed`), is judged by the real state
 * of that answer (so the search does not step into a mate in one, a quiet one included); and a move that makes an
 * enemy royal piece 100 % capturable, or might box it in, counts as forcing (`mightForce`). The hard level, which adds
 * no noise, breaks exact ties at random.
 *
 * The hard level looks one move further than the normal level: once its two-move pass is complete, it re-scores its
 * best candidates (`LEVELS[i].deep` of them) with a third move of mine after each answer, my forcing moves or none
 * (`deepen`), for as long as its time budget lasts, and keeps a re-scored move only when its whole evaluation fitted.
 *
 * The search yields to the browser whenever it has run for more than a few milliseconds (`pacer`), between any two
 * steps that may take long at 64 worlds: each split source and each candidate of the pre-pass, and inside the
 * evaluation of a candidate each outcome, each answer and each outcome of an answer. So the board stays responsive
 * while the computer thinks: at 64 worlds on the largest boards the longest stretch measured on a desktop is about
 * 70 ms, one real state after an answer (the escape rule's search), against seconds before. Its time budget (the
 * level's `timeMs` times `aiTimeShare`) runs from the call of `chooseMove` and is checked at the same places, so a
 * move keeps to it as well, and an aborted search stops there too. The outcomes of the candidates are computed once
 * per search: the forcing pre-pass, the evaluation and the third move of the hard level share them (`OutcomeMemo`,
 * within a memory limit).
 *
 * The time budget follows the wall clock (`Date.now`) unless `chooseMove` is given another clock (`now`, only read at
 * those checks): tests pass one that counts the checks, so that how much the search gets done, and so the move it
 * chooses, does not depend on the speed or the load of the machine. The yields to the browser always follow the wall
 * clock.
 *
 * With `aiView`, the computer plays the best move of its view that is legal on the real state. When none is, it tries
 * what a player could attempt (`candidateMoves`, and the merges and measurements of its `ownView`) in random order,
 * until the umpire accepts one.
 */

import {
	branches,
	budgetInfo,
	certainCapture,
	isCertain,
	legalMoves,
	splitCode,
	splitTargets,
	stateAfter,
	T,
	worldResult,
} from './quantum.js'
import { applyClassical, generate, HAND, linesOf, pushMove } from './world.js'

/**
 * The levels: how deep the computer looks (`reply`: the answer to each of my moves, `fullReply`: every answer rather
 * than the forcing ones, `deep`: how many of the best moves get a third move), how much noise it adds (in centipawns)
 * and how long it may think.
 */
export const LEVELS = Object.freeze([
	Object.freeze({ id: 'easy', reply: false, noise: 120, splits: 2, timeMs: 400 }),
	Object.freeze({ id: 'normal', reply: true, noise: 25, splits: 6, timeMs: 1500 }),
	Object.freeze({ id: 'hard', reply: true, fullReply: true, deep: 8, noise: 0, splits: 10, timeMs: 4000 }),
])

const WIN = 100000

/**
 * How many board and piece entries the remembered outcomes of one search may hold together (`OutcomeMemo`), about
 * 25 MB with the facts kept per world: every candidate at a few worlds, a dozen at 64 worlds on a 4 x 4 x 4 x 4 board.
 */
const MEMO_ENTRIES = 1 << 18

/** The search yields to the browser when it has run this many milliseconds without a break. */
const PACE_MS = 12

/**
 * How long after its time is spent the search still looks for a move that does not lose, when the best move it has
 * judged loses by its own outcomes (a short share of the level time can leave a single judged move, one that strands
 * a multiverse turn). The moves judged in that time get no answer, so they are compared with the best move's value
 * without its answer too; a move that loses only by the answer is kept.
 */
const GRACE_MS = 100

/**
 * Thrown by `SearchClock.check` inside the evaluation of a candidate when the time budget is spent or the search was
 * aborted.
 */
class OutOfTime extends Error {}

/**
 * The time budget of one search. An aborted search counts as out of time, so it stops inside an evaluation too.
 */
class SearchClock {
	/**
	 * @param {number} timeMs how long the search may take from now, in milliseconds
	 * @param {AbortSignal} [signal] abort the search
	 * @param {() => number} [now] the clock, in milliseconds (the wall clock unless a test counts work instead)
	 */
	constructor(timeMs, signal, now = Date.now) {
		this.timeMs = timeMs
		this.now = now
		this.deadline = now() + timeMs
		this.signal = signal
	}

	/**
	 * Whether the time is spent (or the search aborted).
	 *
	 * @return {boolean}
	 */
	up() {
		return this.now() > this.deadline || Boolean(this.signal?.aborted)
	}

	/**
	 * Stop the evaluation of the current candidate (throw `OutOfTime`) when the time is spent (or the search aborted).
	 */
	check() {
		if (this.up()) {
			throw new OutOfTime('out of time')
		}
	}

	/**
	 * Whether more than `ms` milliseconds have passed since the time was spent.
	 *
	 * @param {number} ms milliseconds
	 * @return {boolean}
	 */
	past(ms) {
		return this.now() > this.deadline + ms
	}
}

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
 * The expected value of a move for `side`, averaged over its outcomes, yielding to the browser between them.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @param {object[]|null} list every outcome of the move (`branches`), null when it is illegal
 * @param {(s: object) => number|Promise<number>} score value of a resulting state
 * @param {SearchClock|null} clock the time budget (checked before each outcome), or null for no limit
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @param {boolean} [light] whether the outcomes are the light states of the search; false for the real states of the
 *   game, with every end rule (the escape rule, no legal move, a side that sits out)
 * @return {Promise<number|null>}
 */
async function expected(V, state, code, list, score, clock, pause, light = true) {
	if (!list) {
		return null
	}
	let v = 0
	for (const br of list) {
		clock?.check()
		await pause()
		v += (br.weight / T) * await score(stateAfter(V, state, code, br, list, { light }))
	}
	return v
}

/**
 * The size of a list of outcomes as the memory it holds: the board and piece entries of its worlds.
 *
 * @param {object[]|null} list outcomes (`branches`), or null
 * @return {number}
 */
function sizeOf(list) {
	let size = 0
	for (const br of list ?? []) {
		const b = br.worlds[0].b
		size += br.worlds.length * (b.board.length + b.sq.length)
	}
	return size
}

/**
 * The outcomes of the moves of one state (`branches`), remembered for one search: the forcing pre-pass, the
 * evaluation and the third move of the hard level ask for the outcomes of the same candidate. Every outcome holds new
 * worlds, and the search keeps facts per world (the moves, the royal captures), so the lists kept may hold at most
 * `limit` board and piece entries together; a list that does not fit is computed again when it is asked for again.
 */
class OutcomeMemo {
	/**
	 * @param {object} V variant
	 * @param {object} state state
	 * @param {number} [limit] how many board and piece entries the kept lists may hold together
	 */
	constructor(V, state, limit = MEMO_ENTRIES) {
		this.V = V
		this.state = state
		this.limit = limit
		this.held = 0
		this.known = new Map()
		this.get = this.get.bind(this)
	}

	/**
	 * The outcomes of a move.
	 *
	 * @param {string} code move code
	 * @return {object[]|null} the outcomes, null when the move is illegal
	 */
	get(code) {
		let entry = this.known.get(code)
		if (entry === undefined) {
			const list = branches(this.V, this.state, code)
			entry = { list, size: sizeOf(list) }
			if (this.held + entry.size <= this.limit) {
				this.held += entry.size
				this.known.set(code, entry)
			}
		}
		return entry.list
	}

	/**
	 * Forget the outcomes of a move.
	 *
	 * @param {string} code move code
	 */
	drop(code) {
		const entry = this.known.get(code)
		if (entry !== undefined) {
			this.held -= entry.size
			this.known.delete(code)
		}
	}

	/**
	 * Whether the lists kept fill more than half of the limit.
	 *
	 * @return {boolean}
	 */
	crowded() {
		return this.held * 2 > this.limit
	}
}

/**
 * Whether a candidate of the computer's view (`aiView`) is legal on the real state, remembered for one search.
 *
 * @param {object} V variant
 * @param {object} real the real state
 * @return {(code: string) => boolean}
 */
function legalOn(V, real) {
	const known = new Map()
	return (code) => {
		let ok = known.get(code)
		if (ok === undefined) {
			ok = branches(V, real, code) !== null
			known.set(code, ok)
		}
		return ok
	}
}

/**
 * The share of the level's time for this ply: the variant's `aiTimeShare`, 1 without it or when it is not in (0, 1].
 *
 * @param {object} V variant
 * @param {object} state the real state
 * @return {number}
 */
function timeShare(V, state) {
	const share = V.aiTimeShare ? Number(V.aiTimeShare(state)) : 1
	return share > 0 && share <= 1 ? share : 1
}

/**
 * Whether a side has a royal piece on the board in a world.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @return {boolean}
 */
function hasRoyal(V, b, side) {
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === side && b.sq[id] >= 0 && V.royalTypes.has(b.ty[id])) {
			return true
		}
	}
	return false
}

/**
 * Whether a capture in world `b` takes a royal piece of `side`, as the king danger counts it: it captures one, or
 * `side` had one (`royal`) and has none after the move (atomic's explosions). Without the hooks `apply`, `onCapture`
 * and `afterMove` a capture removes nothing but the captured piece, so the move is not played to find out.
 *
 * @param {object} V variant
 * @param {object} b world before the move
 * @param {object} m capturing move of that world
 * @param {number} side the side in danger
 * @param {boolean} royal whether `side` has a royal piece in `b`
 * @return {boolean}
 */
function takesRoyal(V, b, m, side, royal) {
	if (b.sd[m.capture] === side && V.royalTypes.has(b.ty[m.capture])) {
		return true
	}
	if (!royal || !(V.apply || V.onCapture || V.afterMove)) {
		return false
	}
	return !hasRoyal(V, applyClassical(V, b, m), side)
}

/**
 * The captures of side `d` in world `b`, found without building the quiet moves (a fraction of the cost of
 * `generate`): the capture branches of the movement descriptors, walked as world.js `pieceMoves` walks them, plus the
 * captures among the variant's `extraMoves`, in the order of `generate` (the first move of a key is the one it keeps).
 * These are the captures of `generate`, and perhaps a few more that the variant's `filterMoves` would take away. A
 * variant with its own `generate` gives the captures of that.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} d the capturing side
 * @return {object[]} capturing moves of that world
 */
function capturesOf(V, b, d) {
	if (V.generate) {
		return [...generate(V, b, d).values()].filter((m) => m.capture >= 0)
	}
	const out = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] !== d || b.sq[id] < 0) {
			continue
		}
		const from = b.sq[id]
		for (const line of linesOf(V, b.ty[id], d, from)) {
			// as in pieceMoves, a move-only descriptor never captures, except for a hop
			if (line.d.mode === 'move' && line.kind !== 'hop') {
				continue
			}
			// the first piece on the line, or the one after exactly one screen for a hop
			let target = -1
			if (line.kind === 'leap') {
				target = line.via.some((s) => b.board[s] !== -1) ? -1 : line.squares[0]
			} else {
				let screens = line.kind === 'hop' ? 1 : 0
				for (const t of line.squares) {
					if (b.board[t] !== -1 && screens-- === 0) {
						target = t
						break
					}
				}
			}
			const victim = target >= 0 ? b.board[target] : -1
			if (victim >= 0 && V.enemies(d, b.sd[victim])) {
				pushMove(V, b, out, id, from, target, victim)
			}
		}
	}
	if (V.extraMoves) {
		for (const m of V.extraMoves(b, d)) {
			if (m.capture >= 0) {
				out.push(m)
			}
		}
	}
	return out
}

/** `royalTakes` per variant, world object and side (worlds never change once built). */
const takeCache = new WeakMap()

/**
 * The captures of side `d` in world `b` that might take an enemy royal piece (`capturesOf`, `takesRoyal`): their
 * move keys, each with whether it is a certain move (the first capture of a key, as `generate` keeps it), and the
 * pieces that make them. Remembered per world.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} d the capturing side
 * @return {{keys: Map<string, boolean>, ids: Set<number>}}
 */
function royalTakes(V, b, d) {
	let perWorld = takeCache.get(V)
	if (perWorld === undefined) {
		perWorld = new WeakMap()
		takeCache.set(V, perWorld)
	}
	let known = perWorld.get(b)
	if (known === undefined) {
		known = new Map()
		perWorld.set(b, known)
	}
	let found = known.get(d)
	if (found === undefined) {
		found = { keys: new Map(), ids: new Set() }
		const sides = []
		for (let s = 0; s < V.sideCount; s++) {
			if (V.enemies(d, s) && hasRoyal(V, b, s)) {
				sides.push(s)
			}
		}
		const seen = new Set()
		for (const m of sides.length > 0 ? capturesOf(V, b, d) : []) {
			if (!seen.has(m.key)) {
				seen.add(m.key)
				if (sides.some((s) => takesRoyal(V, b, m, s, true))) {
					found.keys.set(m.key, isCertain(m))
					found.ids.add(m.id)
				}
			}
		}
		known.set(d, found)
	}
	return found
}

/**
 * Whether side `d` (by default the side to move) could capture an enemy royal piece for certain with its next
 * action, as the core's `certainCapture` decides it for the escape rule and the waiting draws: one move key takes a
 * royal piece in every world (a key that is a certain move in some worlds and an ordinary move in others is not
 * legal), or one merge does (it plays an ordinary move of one piece in each world). So the captures of the worlds
 * (`royalTakes`) must have a key or a piece in common, which rules nearly every other state out at a fraction of the
 * cost. A common key settles it at once when the variant has no `filterMoves` (the captures are then exactly those
 * of `generate`); every other case asks the core. The search asks this only with the escape rule, so of two sides,
 * where it makes no difference which enemy's royal piece a key takes.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} [d] the capturing side
 * @return {boolean}
 */
function certainTake(V, state, d = state.turn) {
	if (state.result || V.royalTypes.size === 0) {
		return false
	}
	let keys = null
	let ids = null
	for (const { b } of state.worlds) {
		const t = royalTakes(V, b, d)
		if (keys === null) {
			keys = new Map(t.keys)
			ids = new Set(t.ids)
		} else {
			for (const [k, certain] of keys) {
				if (t.keys.get(k) !== certain) {
					keys.delete(k)
				}
			}
			for (const id of ids) {
				if (!t.ids.has(id)) {
					ids.delete(id)
				}
			}
		}
		if (keys.size === 0 && ids.size === 0) {
			return false
		}
	}
	if (keys.size > 0 && !V.filterMoves) {
		return true
	}
	return certainCapture(V, state.turn === d ? state : { ...state, turn: d })
}

/**
 * The candidate moves of a state: every ordinary move, measurement and merge, plus a few splits.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} splitCount how many splits to consider
 * @param {() => number} rng random numbers
 * @param {SearchClock} clock the time budget (no more split candidates once it is spent)
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @param {(code: string) => object[]|null} outcomesOf the outcomes of a move (`OutcomeMemo`)
 * @return {Promise<string[]>}
 */
async function candidates(V, state, splitCount, rng, clock, pause, outcomesOf) {
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
			if (clock.up()) {
				break
			}
			await pause()
			pool.push(...aiSplits(V, state, f, rng, 6, outcomesOf))
		}
		for (let i = 0; i < splitCount && pool.length; i++) {
			const k = Math.floor(rng() * pool.length)
			out.push(pool.splice(k, 1)[0])
		}
	}
	return out
}

/**
 * The quiet moves of piece `X` from `f` in a world, by target square (the moves a split applies in that world).
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side to move
 * @param {number} X piece id
 * @param {number} f from square
 * @return {Map<number, object>}
 */
function quietMoves(V, b, side, X, f) {
	const out = new Map()
	for (const m of generate(V, b, side).values()) {
		if (m.id === X && m.from === f && m.capture < 0 && !m.promo && !m.drop && !isCertain(m) && !out.has(m.to)) {
			out.set(m.to, m)
		}
	}
	return out
}

/**
 * The splits the computer considers for the piece on `f`. The full list grows quadratically with the number of
 * targets (a queen in the middle of an 8 × 8 board has 351 pairs, a Raumschach queen more than a thousand), so only
 * the best `max` targets are paired: ranked by the value of the first world where the piece stands on `f` after its
 * quiet move to the target, ties broken at random (a quiet move changes the value only through `V.evaluate`, so a
 * fixed order would always pick the same corner). Of the at most `max * (max - 1) / 2` pairs, the legal ones are
 * kept, at most `max`. The list for human players (`splitsFrom`) stays complete. A full budget allows no split at
 * all, so then the list is empty at once.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} f from square
 * @param {() => number} rng random numbers (the search's)
 * @param {number} [max] how many targets, and how many splits at most
 * @param {(code: string) => object[]|null} [outcomesOf] the outcomes of a move (default `branches`; the search passes
 *   its `OutcomeMemo`)
 * @return {string[]} split codes
 */
export function aiSplits(V, state, f, rng, max = 6, outcomesOf = (code) => branches(V, state, code)) {
	const budget = budgetInfo(V, state, state.turn)
	if (budget.used >= budget.limit) {
		return []
	}
	const targets = splitTargets(V, state, f)
	if (targets.length < 2) {
		return []
	}
	const side = state.turn
	const X = state.worlds.find(({ b }) => b.board[f] >= 0).b.board[f]
	// the value of each target in the first world where the piece stands on f and has that quiet move
	const values = new Map()
	for (const { b } of state.worlds) {
		if (values.size === targets.length) {
			break
		}
		if (b.board[f] !== X) {
			continue
		}
		for (const [t, m] of quietMoves(V, b, side, X, f)) {
			if (!values.has(t) && targets.includes(t)) {
				values.set(t, worldValue(V, applyClassical(V, b, m), side))
			}
		}
	}
	const ranked = targets.map((t) => ({ t, value: values.get(t) ?? -Infinity, tie: rng() }))
	ranked.sort((a, b) => b.value - a.value || a.tie - b.tie)
	const best = ranked.slice(0, max).map((e) => e.t)
	const out = []
	for (let i = 0; i < best.length && out.length < max; i++) {
		for (let j = i + 1; j < best.length && out.length < max; j++) {
			const code = splitCode(V, f, best[i], best[j])
			if (outcomesOf(code)) {
				out.push(code)
			}
		}
	}
	return out
}

/**
 * Whether a move might force the game (the moves tried first, the only replies the normal level looks at, and the
 * third moves of the hard level): some outcome captures something, ends the game by the variant's `worldResult`, or,
 * with the escape rule, leaves an enemy royal piece capturable for certain by the mover (a king danger of 100 %, what
 * chess players call check) or might box it in (`mayBeBoxed`: the escape rule may then end the game although nothing
 * attacks it). Every outcome counts, a Missed one too: its worlds are unchanged, but the other side is to move there,
 * and in some variants that alone can end the game (in `worldResult` a side to move without a move wins in antichess
 * and draws in horde, and with the escape rule the side to move may be boxed in). The game-end roll gives every world
 * of an outcome the same result, so its first world tells.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @return {boolean}
 */
export function mightForce(V, state, code) {
	const list = branches(V, state, code)
	return Boolean(list && forces(V, state, code, list))
}

/**
 * Whether one of the outcomes of a legal move might force the game (see `mightForce`).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @param {object[]} list every outcome of the move
 * @return {boolean}
 */
function forces(V, state, code, list) {
	return list.some((br) => br.captures.length > 0
		|| worldResult(V, br.worlds[0].b, state.turn) !== null
		|| (V.escapeRule && (checks(V, state, code, br, list) || boxes(V, state, br))))
}

/**
 * Whether an outcome of a move leaves an enemy royal piece capturable for certain by the mover (its king danger is
 * 100 %). One world of the outcome is tried first, since a certain capture is possible in every world.
 *
 * @param {object} V variant
 * @param {object} state state before the move
 * @param {string} code move code
 * @param {object} br the outcome
 * @param {object[]} list every outcome of the move
 * @return {boolean}
 */
function checks(V, state, code, br, list) {
	if (royalTakes(V, br.worlds[0].b, state.turn).keys.size === 0) {
		return false
	}
	return certainTake(V, stateAfter(V, state, code, br, list, { light: true }), state.turn)
}

/**
 * Whether an outcome of a move of one of two sides might box the enemy in (`mayBeBoxed`, on the worlds of the outcome
 * before they are merged; the enemy is to move next).
 *
 * @param {object} V variant
 * @param {object} state state before the move
 * @param {object} br the outcome
 * @return {boolean}
 */
function boxes(V, state, br) {
	return V.sideCount === 2 && mayBeBoxed(V, br.worlds.map((e) => e.b), 1 - state.turn)
}

/**
 * Whether the escape rule might end the game against side `d`, to move in the worlds `bs`, although none of its royal
 * pieces may be attacked (a quiet mate, what chess players would call stalemate): `d` has a royal piece, at most three
 * other pieces in the first world (on the board and in hand; with more, a quiet mate is too rare to pay for the look),
 * and no step of a royal piece that is sure to escape (`safeStep`). True only means that the real state must tell.
 *
 * @param {object} V variant
 * @param {object[]} bs the worlds, `d` to move
 * @param {number} d the side to move
 * @return {boolean}
 */
function mayBeBoxed(V, bs, d) {
	const b = bs[0]
	let others = 0
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === d && (b.sq[id] >= 0 || b.sq[id] === HAND) && !V.royalTypes.has(b.ty[id]) && ++others > 3) {
			return false
		}
	}
	return hasRoyal(V, b, d) && !safeStep(V, bs, d)
}

/**
 * Whether side `d`, to move in the worlds `bs`, has a step of a royal piece that surely escapes: a quiet move of a
 * royal piece that stands on the same square in every world, to a square that is empty in every world (a leap with
 * its `via` squares empty, or the first square of a ride), legal as an ordinary move in every world, after which no
 * capture of the enemy (`royalTakes`, which may count too many, never too few) takes a royal piece in any world. The
 * step then has outcomes in which the game ends or none of `d`'s royal pieces can be captured for certain, so the
 * escape rule cannot end the game. False when nothing is proven, and always for a variant of more than two sides,
 * with a side order of its own (`nextSide`, `isOut`) or a compulsory capture.
 *
 * @param {object} V variant
 * @param {object[]} bs the worlds, `d` to move
 * @param {number} d the side to move
 * @return {boolean}
 */
function safeStep(V, bs, d) {
	if (V.sideCount !== 2 || V.nextSide || V.isOut || V.compulsoryCapture) {
		return false
	}
	const b0 = bs[0]
	// without these hooks the step built here is the move that `generate` keeps for its key in every world
	const check = Boolean(V.generate || V.filterMoves)
	for (let id = 0; id < b0.sq.length; id++) {
		const from = b0.sq[id]
		if (b0.sd[id] !== d || from < 0 || !V.royalTypes.has(b0.ty[id]) || bs.some((b) => b.sq[id] !== from)) {
			continue
		}
		for (const line of linesOf(V, b0.ty[id], d, from)) {
			const to = line.squares[0]
			const via = line.kind === 'leap' ? line.via : []
			if (line.kind === 'hop' || line.d.mode === 'capture'
				|| !bs.every((b) => b.board[to] === -1 && via.every((q) => b.board[q] === -1))) {
				continue
			}
			const built = []
			pushMove(V, b0, built, id, from, to, -1)
			if (built.length !== 1 || built[0].promo) {
				continue
			}
			const key = built[0].key
			const moves = check ? bs.map((b) => generate(V, b, d).get(key)) : bs.map(() => built[0])
			if (moves.some((m) => !m || m.id !== id || m.capture >= 0 || m.promo || isCertain(m))) {
				continue
			}
			if (bs.every((b, i) => royalTakes(V, applyClassical(V, b, moves[i]), 1 - d).keys.size === 0)) {
				return true
			}
		}
	}
	return false
}

/**
 * Wait for the browser to breathe: continue in a new task, so that input and drawing come first. A message on a
 * channel starts that task at once, while `setTimeout` waits at least 1 ms (4 ms in a browser once timeouts nest), a
 * quarter of the search time at one yield per 12 ms; `setTimeout` only where there are no channels.
 *
 * @return {Promise<void>}
 */
function breathe() {
	if (typeof MessageChannel !== 'function') {
		return new Promise((resolve) => setTimeout(resolve, 0))
	}
	return new Promise((resolve) => {
		const channel = new MessageChannel()
		channel.port1.onmessage = () => {
			channel.port1.close()
			resolve()
		}
		channel.port2.postMessage(null)
	})
}

/**
 * A move for a computer that searches a view of the position (`aiView`) when no move of its view is legal on the real
 * state: the codes a player in its seat could attempt, in random order, until the umpire accepts one. They are the
 * variant's `candidateMoves` of the real state (which depend only on the own pieces), else the legal moves, and the
 * merges and measurements of the own view (`ownView`). Trying moves until one is accepted uses nothing but the
 * umpire's answers, so it is fair.
 *
 * @param {object} V variant
 * @param {object} real the real state
 * @param {number} me the computer's side
 * @param {() => number} rng random numbers (the search's)
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<string|null>} the first accepted code, or null when none is legal
 */
async function attemptUntilAccepted(V, real, me, rng, pause) {
	const codes = (V.candidateMoves ? V.candidateMoves(real) : legalMoves(V, real)).map((m) => m.code)
	if (V.ownView) {
		for (const m of legalMoves(V, V.ownView(real, me))) {
			if (m.type === 'measure' || m.type === 'merge') {
				codes.push(m.code)
			}
		}
	}
	const list = [...new Set(codes)]
	for (let i = list.length - 1; i > 0; i--) {
		const k = Math.floor(rng() * (i + 1))
		const swap = list[i]
		list[i] = list[k]
		list[k] = swap
	}
	for (const code of list) {
		await pause()
		if (branches(V, real, code)) {
			return code
		}
	}
	return null
}

/**
 * The pre-pass over the candidates, while the time lasts: with a view that is not exact, the candidates that are not
 * legal on the real state are left out, and of the others the moves that might force the game (`forces`) come first.
 * Once the time is spent, the remaining candidates follow unchecked, in their order. The outcomes of the forcing
 * moves, which are judged first, stay in the memo; those of the others only while it is less than half full.
 *
 * @param {object} V variant
 * @param {object} state the state the search runs on
 * @param {string[]} moves the candidates
 * @param {SearchClock} clock the time budget
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @param {OutcomeMemo} memo the outcomes of the moves of `state`
 * @param {((code: string) => boolean)|null} legal whether a candidate is legal on the real state, or null to keep all
 * @param {AbortSignal} [signal] abort the search
 * @return {Promise<{ordered: string[], forcing: Set<string>}|null>} the candidates in the order to judge them and
 *   those that might force the game, or null when the search was aborted
 */
async function prePass(V, state, moves, clock, pause, memo, legal, signal) {
	const forcing = []
	const others = []
	let n = 0
	while (n < moves.length && !clock.up()) {
		if (signal?.aborted) {
			return null
		}
		await pause()
		const code = moves[n++]
		if (legal && !legal(code)) {
			continue
		}
		const list = memo.get(code)
		if (list && forces(V, state, code, list)) {
			forcing.push(code)
		} else {
			others.push(code)
			if (memo.crowded()) {
				memo.drop(code)
			}
		}
	}
	return { ordered: [...forcing, ...others, ...moves.slice(n)], forcing: new Set(forcing) }
}

/**
 * The move to play from an exact view (`aiViewExact`): the chosen move when it is legal on the real state, else the
 * next best of the judged candidates, else the next candidate in the order of the search, else what a player could
 * attempt (`attemptUntilAccepted`).
 *
 * @param {object} V variant
 * @param {object} real the real state
 * @param {string|null} best the chosen move
 * @param {Array<{code: string, value: number}>} judged the candidates with a value
 * @param {string[]} ordered every candidate, in the order of the search
 * @param {(code: string) => boolean} legal whether a candidate is legal on the real state
 * @param {() => number} rng random numbers
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<string|null>}
 */
async function firstLegal(V, real, best, judged, ordered, legal, rng, pause) {
	const ranked = [...judged].sort((a, b) => b.value - a.value).map((e) => e.code)
	for (const code of new Set([best, ...ranked, ...ordered])) {
		if (code !== null && legal(code)) {
			return code
		}
		await pause()
	}
	return attemptUntilAccepted(V, real, real.turn, rng, pause)
}

/**
 * Choose a move for the side to move. The level's time budget (times `aiTimeShare`) counts from this call; once it is
 * spent, the search stops, also inside the evaluation of a candidate, and keeps the best move found so far. When the
 * time is spent before any candidate has a value, the next candidate is judged by the positions right after it (no
 * answer is searched), so there is always a move and the budget is kept at 64 worlds too; while the best move judged
 * loses by its own outcomes (not only by the answer), the next ones are judged that way as well, for at most
 * `GRACE_MS` more, and one of them replaces it only when its value beats the best move's value without its answer.
 * The search yields to the browser every few milliseconds throughout.
 *
 * The outcomes of my own moves are the real states of the game (`stateAfter` without light mode), so every end rule
 * of the variant counts there: a move after which the enemy cannot escape is a win, one after which the game ends
 * against me a loss. A level without noise adds a tiny random amount, so that exact ties are broken at random and
 * the computer does not move one piece back and forth. With time left after the two-move pass, the hard level looks
 * at its best candidates once more, a move deeper (`deepen`), unless it has found a sure win.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {object} [opts] options
 * @param {string} [opts.level] easy, normal or hard
 * @param {() => number} [opts.rng] random numbers
 * @param {AbortSignal} [opts.signal] abort the search
 * @param {() => number} [opts.now] the clock of the time budget, in milliseconds (default `Date.now`, as in the app);
 *   tests pass a clock that counts work (each read moves it on), so that the search does as much on any machine
 * @return {Promise<string|null>} a move code, or null when there is none
 */
export async function chooseMove(V, state, { level = 'normal', rng = Math.random, signal, now: time = Date.now } = {}) {
	const L = LEVELS.find((l) => l.id === level) ?? LEVELS[1]
	const clock = new SearchClock(L.timeMs * timeShare(V, state), signal, time)
	const pause = pacer()
	const me = state.turn
	// hidden-information variants: search the position as this side sees it, then keep the moves that are legal
	const real = state
	if (V.aiView) {
		state = V.aiView(state, me, L.id)
	}
	const memo = new OutcomeMemo(V, state)
	const outcomesOf = memo.get
	const legal = real === state ? null : legalOn(V, real)
	// a view that is not exact: every candidate is checked on the real state before it is judged
	const checkEach = legal !== null && !V.aiViewExact
	const moves = await candidates(V, state, L.splits, rng, clock, pause, outcomesOf)
	if (!moves.length) {
		return V.aiView ? attemptUntilAccepted(V, real, me, rng, pause) : null
	}
	// the moves that might force the game are tried first; once the time is spent, the rest keep their order
	const pass = await prePass(V, state, moves, clock, pause, memo, checkEach ? legal : null, signal)
	if (!pass) {
		return null
	}
	const now = (s) => evaluateState(V, s, me)
	const score = (s) => (!L.reply || s.result ? now(s) : replyValue(V, s, me, L, clock, pause))
	let best = null
	let bestValue = -Infinity
	// the value of the best move without its answer (only asked for in the grace period; undefined: not known yet)
	let bestQuick
	// the candidates whose whole evaluation fitted in the budget, for the third move of the hard level
	const scored = []
	// every candidate with a value
	const judged = []
	for (const code of pass.ordered) {
		if (signal?.aborted) {
			return null
		}
		await pause()
		if (checkEach && !legal(code)) {
			continue
		}
		let late = clock.up()
		let value = null
		if (!late) {
			try {
				value = await expected(V, state, code, outcomesOf(code), score, clock, pause, false)
			} catch (e) {
				if (!(e instanceof OutOfTime)) {
					throw e
				}
				late = true
			}
		}
		if (signal?.aborted) {
			return null
		}
		if (late) {
			// the time is spent: stop, unless no move has a value yet or the best move loses by its own outcomes (then
			// look a little longer for one that does not; a loss that only the answer shows cannot be compared with a
			// move judged without its answer)
			if (best !== null && (bestValue > -WIN / 2 || clock.past(GRACE_MS))) {
				break
			}
			if (best !== null) {
				bestQuick ??= await expected(V, state, best, outcomesOf(best), now, null, pause)
				if (bestQuick === null || bestQuick > -WIN / 2) {
					break
				}
			}
			// judge this one quickly, without the answer
			value = await expected(V, state, code, outcomesOf(code), now, null, pause)
		}
		if (value === null) {
			continue
		}
		const noisy = value + (L.noise ? (rng() - 0.5) * 2 * L.noise : rng() * 1e-3)
		if (!late) {
			scored.push({ code, value: noisy, forcing: pass.forcing.has(code) })
		}
		judged.push({ code, value: noisy })
		// a move judged without its answer is compared with the best move judged that way
		const better = late && best !== null ? value > bestQuick : noisy > bestValue
		if (better) {
			bestValue = noisy
			best = code
			bestQuick = late ? value : undefined
		}
	}
	if (signal?.aborted) {
		return null
	}
	if (L.deep && V.sideCount === 2 && scored.length > 1 && bestValue < WIN * 0.99 && !clock.up()) {
		const deeper = await deepen(V, state, me, L, clock, scored, rng, signal, pause, outcomesOf)
		if (signal?.aborted) {
			return null
		}
		best = deeper ?? best
	}
	if (real === state) {
		return best
	}
	if (checkEach) {
		return best ?? attemptUntilAccepted(V, real, me, rng, pause)
	}
	return firstLegal(V, real, best, judged, pass.ordered, legal, rng, pause)
}

/**
 * The generic draws that a played move checks only after the escape rule (the move limit comes after it too, but no
 * side can be without an escape when every answer would end the game by the move limit).
 */
const LATE_DRAWS = new Set(['quiet', 'bareKings'])

/**
 * The state after an answer as the search judges it: the light state, except with the escape rule. When the side to
 * move can capture an enemy royal piece for certain, the game counts as won by that side (`certainEnd`). When the
 * escape rule might end the game against the side to move (`mateable`: one of its royal pieces can be captured for
 * certain, or it might be boxed in), the real state of the answer (`stateAfter` without light mode) is used instead,
 * so the escape rule decides whether that side has lost at once: the answer was a mate in one. That holds for a light
 * state drawn by the 50-move or the bare-kings rule too, since a played move applies the escape rule first.
 *
 * @param {object} V variant
 * @param {object} r state before the answer
 * @param {string} c the answer
 * @param {object} br the outcome
 * @param {object[]} list every outcome of the answer
 * @return {object}
 */
function answerState(V, r, c, br, list) {
	const n = stateAfter(V, r, c, br, list, { light: true })
	if (!V.escapeRule) {
		return n
	}
	if (n.result) {
		return LATE_DRAWS.has(n.result.reason) && mateable(V, { ...n, result: null }, r.turn)
			? stateAfter(V, r, c, br, list)
			: n
	}
	return certainEnd(V, n) ?? (mateable(V, n, r.turn) ? stateAfter(V, r, c, br, list) : n)
}

/**
 * Whether the escape rule might end the game against the side to move of a light state (no result): side `by` can
 * capture one of its royal pieces for certain, or it might be boxed in (`mayBeBoxed`).
 *
 * @param {object} V variant
 * @param {object} n state
 * @param {number} by the side that moved last
 * @return {boolean}
 */
function mateable(V, n, by) {
	return certainTake(V, n, by) || mayBeBoxed(V, n.worlds.map((e) => e.b), n.turn)
}

/**
 * With the escape rule, a state whose side to move can capture an enemy royal piece for certain, as the search counts
 * it: won by that side one ply later, when it takes that piece. Null for any other state.
 *
 * @param {object} V variant
 * @param {object} n state
 * @return {object|null}
 */
function certainEnd(V, n) {
	if (!V.escapeRule || n.result || !certainTake(V, n)) {
		return null
	}
	return { ...n, ply: n.ply + 1, result: { winner: n.turn, reason: 'king' } }
}

/**
 * The answers the replying side of `s` may make, or the value for `me` when there is nothing to search. The replying
 * side is `V.replySide(s, me)`, by default the side to move next: `null` means no answer (the value of `s`); another
 * side than the one to move is searched on a copy of `s` with that side to move. With the escape rule, a replying side
 * that can capture a royal piece for certain takes it (`certainEnd`, no search). Below the hard level only its forcing
 * moves count (`mightForce`); without any answer, the value is that of `s`.
 *
 * @param {object} V variant
 * @param {object} s state after my move
 * @param {number} me my side
 * @param {object} L level
 * @param {SearchClock} clock the time budget (checked before each answer)
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<{value: number}|{them: number, r: object, answers: Array<{code: string, list: object[]}>}>}
 */
async function answersOf(V, s, me, L, clock, pause) {
	const them = V.replySide ? V.replySide(s, me) : s.turn
	if (them === null || them === undefined) {
		return { value: evaluateState(V, s, me) }
	}
	const r = them === s.turn ? s : { ...s, turn: them }
	// a replying side that can capture one of my royal pieces for certain needs no search: it takes it
	const end = certainEnd(V, r)
	if (end) {
		return { value: evaluateState(V, end, me) }
	}
	const answers = []
	for (const m of legalMoves(V, r)) {
		clock.check()
		await pause()
		const list = branches(V, r, m.code)
		if (list && (L.fullReply || forces(V, r, m.code, list))) {
			answers.push({ code: m.code, list })
		}
	}
	return answers.length ? { them, r, answers } : { value: evaluateState(V, s, me) }
}

/**
 * The values of one answer for me and for the replying side, averaged over its outcomes (`answerState`), and the
 * states after its outcomes with their probabilities.
 *
 * @param {object} V variant
 * @param {object} r state before the answer, the replying side to move
 * @param {string} code the answer
 * @param {object[]} list every outcome of the answer
 * @param {number} me my side
 * @param {number} them the replying side
 * @param {SearchClock} clock the time budget (checked before each outcome)
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<{mine: number, theirs: number, leaves: Array<{n: object, p: number}>}>}
 */
async function judgeAnswer(V, r, code, list, me, them, clock, pause) {
	let mine = 0
	let theirs = 0
	const leaves = []
	for (const br of list) {
		clock.check()
		await pause()
		const n = answerState(V, r, code, br, list)
		const p = br.weight / T
		mine += p * evaluateState(V, n, me)
		theirs += p * evaluateState(V, n, them)
		leaves.push({ n, p })
	}
	return { mine, theirs, leaves }
}

/**
 * The value for `me` after the replying side answers with its best move (`answersOf`). Below the hard level the
 * replying side may decline every forcing move: its best value starts at the value of `s`, as if it made a quiet move.
 * When the replying side is `me` itself (a turn of several moves), this is my best continuation, since "the best
 * answer for `them`" is then the best for me.
 *
 * @param {object} V variant
 * @param {object} s state after my move
 * @param {number} me my side
 * @param {object} L level
 * @param {SearchClock} clock the time budget (checked before each reply)
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<number>}
 */
async function replyValue(V, s, me, L, clock, pause) {
	const a = await answersOf(V, s, me, L, clock, pause)
	if (a.value !== undefined) {
		return a.value
	}
	let worst = evaluateState(V, s, me)
	// below the hard level the replying side may also stand pat (make a quiet move)
	let bestForThem = L.fullReply ? -Infinity : evaluateState(V, s, a.them)
	for (const { code, list } of a.answers) {
		const { mine, theirs } = await judgeAnswer(V, a.r, code, list, me, a.them, clock, pause)
		if (theirs > bestForThem) {
			bestForThem = theirs
			worst = mine
		}
	}
	return worst
}

/**
 * A function to await often during a long search: it yields to the browser when the last yield is more than a few
 * milliseconds ago (`PACE_MS`).
 *
 * @return {() => Promise<void>}
 */
function pacer() {
	let last = Date.now()
	return async () => {
		if (Date.now() - last > PACE_MS) {
			await breathe()
			last = Date.now()
		}
	}
}

/**
 * The third move of the hard level, at the end of the two-move pass: the best candidates of that pass, in the order of
 * their value (the forcing ones first among equal values, rounded to a centipawn), are scored again with `deepValue`,
 * while the time budget lasts, less a tenth of it, so that the search ends in time even when one step of it is slow.
 * The best of those whose whole evaluation fitted is chosen; null when none did (the two-move choice stands).
 *
 * @param {object} V variant
 * @param {object} state state (the computer's view)
 * @param {number} me my side
 * @param {object} L level
 * @param {SearchClock} clock the time budget of the search
 * @param {Array<{code: string, value: number, forcing: boolean}>} scored the candidates of the two-move pass with
 *   their values, and whether they might force the game
 * @param {() => number} rng random numbers
 * @param {AbortSignal|undefined} signal abort the search
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @param {(code: string) => object[]|null} outcomesOf the outcomes of a move (`OutcomeMemo`)
 * @return {Promise<string|null>}
 */
async function deepen(V, state, me, L, clock, scored, rng, signal, pause, outcomesOf) {
	const top = [...scored]
		.sort((a, b) => Math.round(b.value) - Math.round(a.value) || b.forcing - a.forcing || b.value - a.value)
		.slice(0, L.deep)
	const budget = new SearchClock(clock.deadline - clock.now() - clock.timeMs / 10, signal, clock.now)
	let best = null
	let bestValue = -Infinity
	for (const { code } of top) {
		if (signal?.aborted || budget.up()) {
			break
		}
		let value = 0
		try {
			const list = outcomesOf(code)
			for (const br of list) {
				budget.check()
				await pause()
				const s = stateAfter(V, state, code, br, list)
				const v = s.result ? evaluateState(V, s, me) : await deepValue(V, s, me, L, budget, pause)
				value += (br.weight / T) * v
			}
		} catch (e) {
			if (!(e instanceof OutOfTime)) {
				throw e
			}
			break
		}
		const noisy = value + (L.noise ? (rng() - 0.5) * 2 * L.noise : rng() * 1e-3)
		if (noisy > bestValue) {
			bestValue = noisy
			best = code
		}
	}
	return best
}

/**
 * The value for `me` after one of my moves, three moves deep: every answer of the other side (`answersOf`), then my
 * best forcing move or none (`myBest`). The other side takes the answer that leaves me the least. Since a third move
 * never lowers my value (I may make none), the answers are taken in the order of their value after two moves, and
 * the search stops as soon as that value alone is no better for the other side than the best answer found. A turn of
 * several moves (the replying side is `me`) is judged after two moves.
 *
 * @param {object} V variant
 * @param {object} s state after my move (no result)
 * @param {number} me my side
 * @param {object} L level
 * @param {SearchClock} clock the time budget
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<number>}
 */
async function deepValue(V, s, me, L, clock, pause) {
	const a = await answersOf(V, s, me, L, clock, pause)
	if (a.value !== undefined) {
		return a.value
	}
	if (a.them === me) {
		return replyValue(V, s, me, L, clock, pause)
	}
	const judged = []
	for (const { code, list } of a.answers) {
		judged.push(await judgeAnswer(V, a.r, code, list, me, a.them, clock, pause))
	}
	judged.sort((x, y) => x.mine - y.mine)
	let least = Infinity
	for (const { mine, leaves } of judged) {
		if (mine >= least) {
			break
		}
		let v = 0
		for (const { n, p } of leaves) {
			v += p * (n.result || n.turn !== me ? evaluateState(V, n, me) : await myBest(V, n, me, clock, pause))
		}
		least = Math.min(least, v)
	}
	return least
}

/**
 * My best third move in a light state where I am to move: its value is the most of the value of the state (no forcing
 * move) and of the expected values of my forcing moves (`forces`: captures, game ends, checks and moves that might box
 * the enemy in), each outcome judged by `answerState` (a check that leaves no escape is a win, a capture that leaves
 * my king to be captured for certain a loss).
 *
 * @param {object} V variant
 * @param {object} n state, `me` to move
 * @param {number} me my side
 * @param {SearchClock} clock the time budget
 * @param {() => Promise<void>} pause yields to the browser now and then
 * @return {Promise<number>}
 */
async function myBest(V, n, me, clock, pause) {
	let best = evaluateState(V, n, me)
	for (const m of legalMoves(V, n)) {
		clock.check()
		await pause()
		const list = branches(V, n, m.code)
		if (!list || !forces(V, n, m.code, list)) {
			continue
		}
		let v = 0
		for (const br of list) {
			v += (br.weight / T) * evaluateState(V, answerState(V, n, m.code, br, list), me)
		}
		best = Math.max(best, v)
	}
	return best
}
