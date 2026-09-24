/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player's search: iterative-deepening expectimax in E-space.
 *
 * Values are expected scores **for the side to move** in [0, 1] (win 1, draw ½, loss 0); results convert them to
 * White's expected score. Decision nodes are negamax with alpha-beta; a rolled move is a chance node over its
 * outcomes (`applyForSearch`, at most 3 children, 8 for a Measure) with Star1 bounds and, when enabled, Star2 probing.
 *
 * - Transposition table keyed by `positionHash` (the last `history` entry, `transposition.js`); killer and history
 *   heuristics and split pruning (`moveOrdering.js`). The root keeps the level's full split set. Moves whose
 *   resulting positions hash equal are searched once.
 * - Quiescence on captures (≥ 25 % or ≥ 50 % by level) and on every king shot; stand pat on `staticE`.
 * - Futility pruning of quiet moves at depth 1 and late-move reductions (levels 4 and 5).
 * - E1b is skipped inside the search (`applyForSearch`, docs/engine-rules.md Appendix C); `staticE` detects a trapped
 *   mover at the leaves, and the search finds the forced capture one ply later anyway. Every move actually played
 *   goes through the normal `applyMove`.
 *
 * The searcher is **resumable**: `step(sliceDeadline)` runs until the slice deadline, and a later `step()` continues
 * (a restarted iteration finds its finished subtrees in the transposition table). The worker runs one long slice; the
 * main-thread fallback runs short ones between frames.
 */

import { applyForSearch, findMove, generateMoves, kingDanger, T } from '../engine/index.js'
import { staticE, toCp, toE } from './evaluate.js'
import { features } from './features.js'
import { levelOf, PIECE_VALUES } from './levels.js'
import { MoveOrderer } from './moveOrdering.js'
import { captureWeight, cleanValue, outcomeList, PLY_DISCOUNT, terminalValue, victimOf } from './searchValues.js'
import { EXACT, LOWER, storeEntry, UPPER } from './transposition.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/** Decision nodes stop once they are within this of beta: improvements this small never change a choice. */
const CUT_EPSILON = 2e-4

/** Delta pruning margin in quiescence (centipawns). */
const DELTA_MARGIN = 150

/** At most this many captures (besides king shots) per quiescence node. */
const Q_MAX_MOVES = 6

/** A deepening iteration whose best move lost more than this against the previous iteration may get extra time. */
const INSTABILITY_MARGIN = 0.05

/** Futility pruning: quiet moves at depth 1 are skipped when the static value plus this cannot reach alpha. */
const FUTILITY_MARGIN = 0.12

/** Late-move reductions start at this remaining depth … */
const LMR_MIN_DEPTH = 3

/** … for quiet moves from this index of the ordered move list on. */
const LMR_MIN_INDEX = 4

/** Splits from this index on are reduced by two plies instead of one … */
const LMR_SPLIT_INDEX = 10

/** … at this remaining depth or more. */
const LMR_SPLIT_DEPTH = 4

/** Width of the null window of a reduced search: it only asks whether the move beats alpha. */
const NULL_WINDOW = 1e-9

/**
 * One root move of a search result.
 *
 * @typedef {object} SearchedMove
 * @property {string} code canonical move code
 * @property {string} type move type (`standard`, `split`, `merge`, `measure`)
 * @property {string} resolution `certain`, `quantum` or `rolled`
 * @property {number|null} value value for the side to move (null: not searched)
 * @property {number|null} E White's expected score
 * @property {boolean} exact the value is exact (otherwise an upper bound)
 * @property {number} depth depth of the iteration that produced the value
 * @property {Array<{key: string|null, weight: number, value: number|null, E: number|null}>|null} outcomes the value of
 *   every outcome of a rolled move, or null
 */

/**
 * The result of a search.
 *
 * @typedef {object} SearchResult
 * @property {string|null} code the best move
 * @property {number|null} value its value for the side to move
 * @property {number|null} E White's expected score of the best move
 * @property {string[]} pv principal variation, following the most probable outcome of every roll
 * @property {number} depth last completed iteration
 * @property {number} nodes nodes searched
 * @property {number} timeMs time spent
 * @property {number} nps nodes per second
 * @property {SearchedMove[]} moves every root move, best first
 */

/**
 * Search parameters derived from the options and the level.
 *
 * @typedef {object} SearchParams
 * @property {object} level the level object
 * @property {number} maxDepth deepest iteration
 * @property {number} qMax quiescence depth limit
 * @property {number} qThreshold smallest capture probability searched in quiescence
 * @property {number} splitTargets best standard targets per piece that splits may use inside the tree
 * @property {Set<string>} splitTypes piece types that may split
 * @property {boolean} lmr late-move reductions
 * @property {boolean} star2 Star2 probing at chance nodes
 * @property {boolean} futility futility pruning at depth 1
 */

/** Thrown inside the recursion to unwind a search that must stop (never escapes the Searcher). */
class Stop {
	/**
	 * @param {'slice'|'limit'} reason why the search stops
	 */
	constructor(reason) {
		this.reason = reason
	}
}

/**
 * Search options → normalised parameters.
 *
 * @param {object} options search options
 * @return {SearchParams}
 */
function paramsOf(options) {
	const level = levelOf(options.level ?? 4)
	const qFull = level.quiescence === 'full'
	return {
		level,
		maxDepth: options.maxDepth ?? level.depth,
		qMax: qFull ? 4 : 2,
		qThreshold: qFull ? 0.25 : 0.5,
		splitTargets: level.level >= 4 ? 4 : 3,
		splitTypes: new Set(level.splitTypes),
		lmr: options.lmr ?? level.lmr,
		star2: options.star2 ?? level.star2,
		futility: level.level >= 2,
	}
}

/**
 * A resumable expectimax search of one position.
 */
export class Searcher {
	/**
	 * Options:
	 * - `level` (1–5 or a level object; default 4): depth, quiescence, split and reduction settings.
	 * - `timeMs` (default: the level's; `Infinity` for none), `maxMs` (overrun limit), `nodeBudget` (default none).
	 * - `maxDepth`: override the level's depth.
	 * - `rootMoves`: codes to restrict the root to (default: every legal move).
	 * - `rootSplits`: `'all'` (default) or `'pruned'`; `splitTop`: `{type: n}` keep only the best n root splits of
	 *   those types (level 3).
	 * - `multiPv` (default 1) and `margin` (default 0): root moves whose value may be within `margin` of the
	 *   `multiPv`-th best get exact values; the others get upper bounds.
	 * - `rootEpsilon` (with `margin` 0): a root move must beat the best by more than this to replace it (moves
	 *   within the tie window are cut early).
	 * - `include`: codes whose values must be exact.
	 * - `exactOutcomes`: search every outcome of a rolled root move with a full window (per-outcome values).
	 * - `usePartial` (default true): let moves searched in an unfinished last iteration count; analysis turns it off
	 *   to report every move from the same depth.
	 * - `ignoreKing`: `'w'`/`'b'`: that side does not notice danger to its own king (level noise).
	 * - `onProgress({depth, code, E, value, nodes, timeMs})` after each completed iteration.
	 * - `now`: clock (ms), default `performance.now`.
	 * - `tt`: a Map to share a transposition table between searches of the same game.
	 *
	 * @param {EngineState} state engine state (result null)
	 * @param {object} [options] options
	 */
	constructor(state, options = {}) {
		this.state = state
		this.options = options
		this.p = paramsOf(options)
		this.now = options.now || (() => performance.now())
		this.start = this.now()
		const timeMs = options.timeMs ?? this.p.level.timeMs
		this.deadline = Number.isFinite(timeMs) ? this.start + timeMs : Infinity
		const maxMs = options.maxMs ?? this.p.level.maxMs
		this.extendTo = Number.isFinite(maxMs) && Number.isFinite(timeMs) ? this.start + maxMs : this.deadline
		this.extended = false
		this.nodeBudget = options.nodeBudget ?? Infinity
		this.sliceDeadline = Infinity
		this.nodes = 0
		this.tt = options.tt || new Map()
		this.ignoreKing = options.ignoreKing === 'w' ? 0 : options.ignoreKing === 'b' ? 1 : -1
		this.orderer = new MoveOrderer(this.p, this.ignoreKing)
		this.multiPv = Math.max(1, options.multiPv ?? 1)
		this.margin = options.margin ?? 0
		this.rootEpsilon = options.rootEpsilon ?? 0
		this.include = new Set(options.include || [])
		this.exactOutcomes = Boolean(options.exactOutcomes)
		this.usePartial = options.usePartial ?? true
		this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
		this.done = false
		this.depth = 0 // last completed iteration
		this.iter = null // the iteration in progress: {depth, index}
		this.stopped = false
		this.root = this.buildRoot()
	}

	/**
	 * Root entries: every legal move (filtered), with its outcome children applied once.
	 *
	 * @return {object[]}
	 */
	buildRoot() {
		const state = this.state
		let moves = generateMoves(state)
		if (this.options.rootMoves) {
			const wanted = new Set(this.options.rootMoves)
			moves = moves.filter((m) => wanted.has(m.code))
		}
		const feat = features(state)
		if (this.options.rootSplits === 'pruned') {
			moves = this.orderer.pruneSplits(feat, moves, this.p.splitTargets)
		}
		if (this.options.splitTop) {
			moves = this.orderer.topSplits(feat, moves, this.options.splitTop)
		}
		const scored = this.orderer.score(feat, moves, 0, null)
		return scored.map(({ m }, i) => ({
			move: m,
			code: m.code,
			order: i,
			children: outcomeList(m).map((o) => ({ key: o.key, weight: o.weight, state: null, value: null })),
			value: null,
			exact: false,
			depth: 0,
		}))
	}

	/**
	 * Count a node and stop the search when a limit is reached.
	 */
	tick() {
		this.nodes++
		if (this.nodes >= this.nodeBudget) {
			throw new Stop('limit')
		}
		if ((this.nodes & 1) === 0) {
			const t = this.now()
			if (t >= this.sliceDeadline && this.sliceDeadline < this.deadline) {
				throw new Stop('slice')
			}
			// Analysis (usePartial off) always completes the first iteration, so that every root move gets a value; a
			// move choice may stop inside it once at least one move has one.
			if (t >= this.deadline && (this.depth > 0 || (this.usePartial && this.iter !== null && this.iter.index > 0))) {
				if (!this.extended && this.extendTo > this.deadline && this.unstable()) {
					this.extended = true
					this.deadline = this.extendTo
					return
				}
				throw new Stop('limit')
			}
		}
	}

	/**
	 * Is the current iteration's best move worse than the previous iteration's (a reason to think longer)?
	 *
	 * @return {boolean}
	 */
	unstable() {
		if (this.iter === null || this.depth === 0) {
			return false
		}
		const first = this.root[0]
		return first.depth === this.iter.depth && first.prevValue !== undefined && first.value < first.prevValue - INSTABILITY_MARGIN
	}

	/**
	 * Run until done or until the slice deadline. Returns true when the search is finished.
	 *
	 * @param {number} [sliceDeadline] clock value at which to pause (Infinity: run to the end)
	 * @return {boolean}
	 */
	step(sliceDeadline = Infinity) {
		if (this.done) {
			return true
		}
		this.sliceDeadline = sliceDeadline
		if (this.root.length === 0 || (this.root.length === 1 && !this.options.rootMoves)) {
			if (this.root.length === 1 && this.root[0].value === null) {
				// A single legal move: one shallow look for its value, never a deep search.
				try {
					this.iter = { depth: 1, index: 0 }
					this.searchRoot(1)
					this.depth = 1
				} catch (e) {
					if (!(e instanceof Stop)) {
						throw e
					}
				}
			}
			this.done = true
			return true
		}
		try {
			while (true) {
				const d = this.iter === null ? this.depth + 1 : this.iter.depth
				if (d > this.p.maxDepth) {
					break
				}
				if (this.iter === null) {
					this.iter = { depth: d, index: 0 }
					for (const e of this.root) {
						e.prevValue = e.value
					}
				}
				this.searchRoot(d)
				this.depth = d
				this.iter = null
				this.snapshot()
				this.sortRoot()
				this.report()
				if (this.decided()) {
					break
				}
			}
		} catch (e) {
			if (!(e instanceof Stop)) {
				throw e
			}
			if (e.reason === 'slice') {
				return false
			}
			if (!this.usePartial) {
				this.restore()
			}
			this.sortRoot()
		}
		this.done = true
		return true
	}

	/**
	 * Remember the root values of a completed iteration.
	 */
	snapshot() {
		for (const e of this.root) {
			e.stable = { value: e.value, exact: e.exact, depth: e.depth, kids: e.children.map((c) => c.value) }
		}
	}

	/**
	 * Drop the values of an unfinished iteration (analysis wants one consistent depth for every move).
	 */
	restore() {
		for (const e of this.root) {
			if (e.stable !== undefined) {
				e.value = e.stable.value
				e.exact = e.stable.exact
				e.depth = e.stable.depth
				e.children.forEach((c, i) => {
					c.value = e.stable.kids[i]
				})
			}
		}
	}

	/**
	 * Stop deepening when the best move is a proven win (nothing deeper can improve it) or every other move is lost.
	 *
	 * @return {boolean}
	 */
	decided() {
		const best = this.root[0]
		return best.exact && cleanValue(best.value) === 1 && this.multiPv === 1 && this.include.size === 0
	}

	/**
	 * Sort root entries: the deepest searched first, then by value; exact values before bounds.
	 */
	sortRoot() {
		const deepest = Math.max(...this.root.map((e) => e.depth))
		const firstDone = this.root[0].depth === deepest
		this.root.sort((a, b) => {
			// Trust a partial iteration only through the moves it finished (the previous best is searched first).
			const da = firstDone ? (a.depth === deepest ? 1 : 0) : 0
			const db = firstDone ? (b.depth === deepest ? 1 : 0) : 0
			if (da !== db) {
				return db - da
			}
			const va = a.value ?? -1
			const vb = b.value ?? -1
			if (va !== vb) {
				return vb - va
			}
			if (a.exact !== b.exact) {
				return a.exact ? -1 : 1
			}
			return a.order - b.order
		})
	}

	/**
	 * Progress callback after an iteration.
	 */
	report() {
		if (this.onProgress === null) {
			return
		}
		const best = this.root[0]
		this.onProgress({
			depth: this.depth,
			code: best.code,
			value: cleanValue(best.value),
			E: this.toWhite(cleanValue(best.value)),
			nodes: this.nodes,
			timeMs: Math.round(this.now() - this.start),
		})
	}

	/**
	 * A mover's value → White's expected score.
	 *
	 * @param {number} v value for the side to move at the root
	 * @return {number}
	 */
	toWhite(v) {
		return this.state.turn === 'w' ? v : 1 - v
	}

	/**
	 * One iteration over the root moves (resumes at `iter.index` after a slice pause).
	 *
	 * @param {number} depth iteration depth
	 */
	searchRoot(depth) {
		const exactValues = []
		for (let i = 0; i < this.iter.index; i++) {
			const e = this.root[i]
			if (e.exact && e.depth === depth) {
				exactValues.push(e.value)
			}
		}
		for (let i = this.iter.index; i < this.root.length; i++) {
			const e = this.root[i]
			let alpha = 0
			if (!this.include.has(e.code) && exactValues.length >= this.multiPv) {
				exactValues.sort((a, b) => b - a)
				alpha = this.margin > 0
					? Math.max(0, exactValues[this.multiPv - 1] - this.margin)
					: Math.min(1, exactValues[this.multiPv - 1] + this.rootEpsilon)
			}
			const v = this.rootValue(e, depth, alpha, 1)
			e.value = v
			e.exact = v > alpha || alpha === 0
			e.depth = depth
			if (e.exact) {
				exactValues.push(v)
			}
			this.iter.index = i + 1
		}
	}

	/**
	 * Value of a root move for the side to move (chance node over its outcomes).
	 *
	 * @param {object} e root entry
	 * @param {number} depth iteration depth
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @return {number}
	 */
	rootValue(e, depth, alpha, beta) {
		for (const c of e.children) {
			if (c.state === null) {
				c.state = applyForSearch(this.state, e.move, c.key)
			}
		}
		if (e.children.length === 1) {
			const c = e.children[0]
			const v = this.childValue(c.state, depth - 1, alpha, beta, 1)
			c.value = v
			return v
		}
		if (this.exactOutcomes) {
			let sum = 0
			for (const c of e.children) {
				c.value = this.childValue(c.state, depth - 1, 0, 1, 1)
				sum += (c.weight / T) * c.value
			}
			return sum
		}
		return this.chance(this.state, e.move, e.children, depth, alpha, beta, 0, false, 0)
	}

	/**
	 * The mover's value of a child state (1 − the child's value for its own side to move).
	 *
	 * @param {object} child state after the move
	 * @param {number} depth remaining depth for the child
	 * @param {number} alpha mover's alpha
	 * @param {number} beta mover's beta
	 * @param {number} ply ply of the child
	 * @return {number}
	 */
	childValue(child, depth, alpha, beta, ply) {
		if (child.result !== null) {
			return 1 - terminalValue(child, ply)
		}
		return 1 - this.node(child, depth, 1 - beta, 1 - alpha, ply)
	}

	/**
	 * Chance node over a rolled move's outcomes with Star1 bounds (and Star2 probing when enabled). Returns the
	 * mover's value: exact inside (alpha, beta), otherwise a bound.
	 *
	 * @param {EngineState} state position before the move
	 * @param {LegalMove} move LegalMove
	 * @param {Array<{key: string, weight: number, state: object|null}>|null} kids pre-built outcome entries or null
	 * @param {number} depth remaining depth of this node (children get depth − 1)
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @param {number} ply ply of this node
	 * @param {boolean} q quiescence
	 * @param {number} qd quiescence depth of this node
	 * @return {number}
	 */
	chance(state, move, kids, depth, alpha, beta, ply, q, qd) {
		const outs = kids || move.outcomes.map((o) => ({ key: o.key, weight: o.weight, state: null }))
		const order = outs.slice().sort((a, b) => b.weight - a.weight)
		const upper = new Float64Array(order.length).fill(1)
		let upperSum = 1
		if (this.p.star2 && !q && depth >= 2) {
			// Star2 probing: one move per outcome gives a lower bound for the replier, an upper bound for us.
			upperSum = 0
			for (let i = 0; i < order.length; i++) {
				const o = order[i]
				if (o.state === null) {
					o.state = applyForSearch(state, move, o.key)
				}
				const u = o.state.result !== null ? 1 - terminalValue(o.state, ply + 1) : 1 - this.probe(o.state, depth - 1, ply + 1)
				upper[i] = u
				upperSum += (o.weight / T) * u
			}
			if (upperSum <= alpha) {
				return upperSum
			}
		}
		let sum = 0
		let rem = 1
		let remUpper = upperSum
		for (let i = 0; i < order.length; i++) {
			const o = order[i]
			const pr = o.weight / T
			rem = Math.max(0, rem - pr)
			remUpper = Math.max(0, remUpper - pr * upper[i])
			if (o.state === null) {
				o.state = applyForSearch(state, move, o.key)
			}
			let x
			if (o.state.result !== null) {
				x = 1 - terminalValue(o.state, ply + 1)
			} else {
				const a = Math.max(0, (alpha - sum - remUpper) / pr)
				const b = Math.min(1, (beta - sum) / pr)
				if (q) {
					// A capture continues the exchange; after a miss or a plain move one more ply of captures at most.
					x = 1 - this.qsearch(o.state, 1 - b, 1 - a, ply + 1, o.key === 'capture' ? qd + 1 : qd + 2)
				} else {
					x = 1 - this.node(o.state, depth - 1, 1 - b, 1 - a, ply + 1)
				}
			}
			if (kids !== null) {
				o.value = x
			}
			sum += pr * x
			if (sum + remUpper <= alpha) {
				return sum + remUpper
			}
			if (sum >= beta) {
				return sum
			}
		}
		return sum
	}

	/**
	 * Star2 probe: the replier's value of its first (best-ordered) move only — a lower bound of its node value.
	 *
	 * @param {EngineState} state position (result null)
	 * @param {number} depth remaining depth
	 * @param {number} ply ply
	 * @return {number}
	 */
	probe(state, depth, ply) {
		this.tick()
		const e = this.tt.get(state.history[state.history.length - 1])
		if (e !== undefined && e.depth >= depth && e.flag !== UPPER) {
			return e.value
		}
		const moves = this.orderer.orderedMoves(state, ply, e !== undefined ? e.move : null, depth)
		if (moves.length === 0) {
			return 0
		}
		const m = moves[0].m
		if (m.resolution !== 'rolled') {
			return this.childValue(applyForSearch(state, m), depth - 1, 0, 1, ply + 1)
		}
		return this.chance(state, m, null, depth, 0, 1, ply, false, 0)
	}

	/**
	 * Decision node (negamax): the side to move's value.
	 *
	 * @param {EngineState} state position (result null)
	 * @param {number} depth remaining depth
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @param {number} ply distance from the root
	 * @return {number}
	 */
	node(state, depth, alpha, beta, ply) {
		if (depth <= 0) {
			return this.qsearch(state, alpha, beta, ply, 0)
		}
		this.tick()
		const hash = state.history[state.history.length - 1]
		const entry = this.tt.get(hash)
		let ttMove = null
		if (entry !== undefined) {
			ttMove = entry.move
			if (entry.depth >= depth) {
				if (entry.flag === EXACT) {
					return entry.value
				}
				if (entry.flag === LOWER && entry.value >= beta) {
					return entry.value
				}
				if (entry.flag === UPPER && entry.value <= alpha) {
					return entry.value
				}
			}
		}
		const mover = state.turn === 'w' ? 0 : 1
		if (this.ignoreKing !== 1 - mover && kingDanger(state, mover === 0 ? 'b' : 'w') === T) {
			// A certain king capture is available: the game is won.
			return 1 - ply * PLY_DISCOUNT
		}
		const alpha0 = alpha
		const ownDanger = kingDanger(state, state.turn)
		let quietCut = false
		if (this.p.futility && depth === 1 && ownDanger === 0) {
			quietCut = staticE(state, this.ignoreKing) + FUTILITY_MARGIN <= alpha
		}
		const moves = this.orderer.orderedMoves(state, ply, ttMove, depth)
		let best = -1
		let bestCode = null
		const seen = new Set()
		for (let i = 0; i < moves.length; i++) {
			const { m, tactical } = moves[i]
			if (quietCut && !tactical && best >= 0) {
				continue
			}
			let v
			if (m.resolution !== 'rolled') {
				const child = applyForSearch(state, m)
				const h = child.history[child.history.length - 1]
				if (seen.has(h)) {
					continue
				}
				seen.add(h)
				let reduce = 0
				if (this.p.lmr && depth >= LMR_MIN_DEPTH && i >= LMR_MIN_INDEX && !tactical && ownDanger === 0) {
					reduce = m.type === 'split' && depth >= LMR_SPLIT_DEPTH && i >= LMR_SPLIT_INDEX ? 2 : 1
				}
				if (reduce > 0) {
					v = this.childValue(child, depth - 1 - reduce, alpha, alpha + NULL_WINDOW, ply + 1)
					if (v > alpha) {
						v = this.childValue(child, depth - 1, alpha, beta, ply + 1)
					}
				} else {
					v = this.childValue(child, depth - 1, alpha, beta, ply + 1)
				}
			} else {
				v = this.chance(state, m, null, depth, alpha, beta, ply, false, 0)
			}
			if (v > best) {
				best = v
				bestCode = m.code
			}
			if (v > alpha) {
				alpha = v
			}
			if (alpha >= beta - CUT_EPSILON) {
				if (!tactical) {
					this.orderer.recordCutoff(ply, m.code, depth)
				}
				break
			}
		}
		if (best < 0) {
			// Every move was pruned or a duplicate: fall back to the static value.
			best = staticE(state, this.ignoreKing)
		}
		const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT
		storeEntry(this.tt, hash, depth, best, flag, bestCode)
		return best
	}

	/**
	 * Quiescence: stand pat on the static value, then captures (and king shots) with their chance nodes.
	 *
	 * @param {EngineState} state position (result null)
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @param {number} ply distance from the root
	 * @param {number} qd quiescence depth
	 * @return {number}
	 */
	qsearch(state, alpha, beta, ply, qd) {
		this.tick()
		// Quiescence results go to the transposition table too, with a negative depth for the quiescence plies
		// already used: this lets a search that restarts after a time slice resume where it stopped.
		const hash = state.history[state.history.length - 1]
		const qDepth = -qd / 16
		const entry = this.tt.get(hash)
		if (entry !== undefined && entry.depth >= qDepth) {
			if (entry.flag === EXACT || (entry.flag === LOWER && entry.value >= beta) || (entry.flag === UPPER && entry.value <= alpha)) {
				return entry.value
			}
		}
		const stand = staticE(state, this.ignoreKing)
		if (stand >= 1) {
			return 1 - ply * PLY_DISCOUNT
		}
		if (stand <= 0) {
			return ply * PLY_DISCOUNT
		}
		if (qd >= this.p.qMax || stand >= beta) {
			return stand
		}
		const alpha0 = alpha
		let best = stand
		if (stand > alpha) {
			alpha = stand
		}
		const caps = this.orderer.captures(state)
		const feat = features(state)
		const standCp = toCp(stand)
		let tried = 0
		for (let i = 0; i < caps.length; i++) {
			const c = caps[i]
			const m = findMove(state, c.code)
			if (m === null) {
				continue
			}
			const w = captureWeight(m)
			if (w === 0 && m.promo === undefined) {
				continue
			}
			if (!c.king) {
				// Deeper in quiescence only likelier captures: the threshold rises to 50 % and then to certainty.
				const threshold = qd === 0 ? this.p.qThreshold : qd === 1 ? Math.max(0.5, this.p.qThreshold) : 1
				if (w > 0 && w / T < threshold) {
					continue
				}
				if (++tried > Q_MAX_MOVES) {
					break
				}
				// Delta pruning: even the optimistic gain cannot lift this node above alpha.
				const vid = victimOf(feat, m)
				const gain = (w / T) * (vid >= 0 ? PIECE_VALUES[feat.types[vid]] : 0) + (m.promo === 'q' ? 800 : 0)
				if (toE(standCp + gain + DELTA_MARGIN) <= alpha) {
					continue
				}
			}
			let v
			if (m.resolution !== 'rolled') {
				v = this.qChild(applyForSearch(state, m), alpha, beta, ply + 1, qd + 1)
			} else {
				v = this.chance(state, m, null, 0, alpha, beta, ply, true, qd)
			}
			if (v > best) {
				best = v
			}
			if (v > alpha) {
				alpha = v
			}
			if (alpha >= beta) {
				break
			}
		}
		storeEntry(this.tt, hash, qDepth, best, best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT, null)
		return best
	}

	/**
	 * Mover's value of a quiescence child.
	 *
	 * @param {object} child state after the move
	 * @param {number} alpha mover's alpha
	 * @param {number} beta mover's beta
	 * @param {number} ply ply of the child
	 * @param {number} qd quiescence depth of the child
	 * @return {number}
	 */
	qChild(child, alpha, beta, ply, qd) {
		if (child.result !== null) {
			return 1 - terminalValue(child, ply)
		}
		return 1 - this.qsearch(child, 1 - beta, 1 - alpha, ply, qd)
	}

	/**
	 * Principal variation from the root entry: follows transposition-table moves, taking the most probable outcome of
	 * each roll.
	 *
	 * @param {object} e root entry
	 * @param {number} [maxLen] maximum length
	 * @return {string[]}
	 */
	pv(e, maxLen = 8) {
		const out = [e.code]
		let kid = e.children[0]
		for (const c of e.children) {
			if (c.weight > kid.weight) {
				kid = c
			}
		}
		let state = kid.state
		const seen = new Set()
		while (state !== null && state.result === null && out.length < maxLen) {
			const h = state.history[state.history.length - 1]
			if (seen.has(h)) {
				break
			}
			seen.add(h)
			const t = this.tt.get(h)
			if (t === undefined || t.move === null) {
				break
			}
			const m = findMove(state, t.move)
			if (m === null) {
				break
			}
			out.push(m.code)
			const o = outcomeList(m).reduce((a, b) => (b.weight > a.weight ? b : a))
			state = applyForSearch(state, m, o.key)
		}
		return out
	}

	/**
	 * A full-window value of a position for its side to move at a given depth (used after the main search for fog
	 * bands and replies; shares the transposition table). Returns null when a limit stops it.
	 *
	 * @param {EngineState} state position
	 * @param {number} depth depth
	 * @param {number} [extraNodes] node allowance on top of the current count
	 * @return {number|null}
	 */
	valueOf(state, depth, extraNodes = 20000) {
		if (state.result !== null) {
			return terminalValue(state, 0)
		}
		const saved = [this.nodeBudget, this.deadline, this.sliceDeadline]
		this.nodeBudget = this.nodes + extraNodes
		this.deadline = Infinity
		this.sliceDeadline = Infinity
		try {
			return depth <= 0 ? this.qsearch(state, 0, 1, 0, 0) : this.node(state, depth, 0, 1, 0)
		} catch (e) {
			if (!(e instanceof Stop)) {
				throw e
			}
			return null
		} finally {
			[this.nodeBudget, this.deadline, this.sliceDeadline] = saved
		}
	}

	/**
	 * The search result: best move, White's E, per-move values.
	 *
	 * @return {SearchResult}
	 */
	result() {
		const elapsed = this.now() - this.start
		const moves = this.root.map((e) => ({
			code: e.code,
			type: e.move.type,
			resolution: e.move.resolution,
			value: e.value === null ? null : cleanValue(e.value),
			E: e.value === null ? null : this.toWhite(cleanValue(e.value)),
			exact: e.exact,
			depth: e.depth,
			outcomes: e.children.length > 1 || e.move.resolution === 'rolled'
				? e.children.map((c) => ({ key: c.key, weight: c.weight, value: c.value === null ? null : cleanValue(c.value), E: c.value === null ? null : this.toWhite(cleanValue(c.value)) }))
				: null,
		}))
		const best = this.root[0]
		return {
			code: best ? best.code : null,
			value: best && best.value !== null ? cleanValue(best.value) : null,
			E: best && best.value !== null ? this.toWhite(cleanValue(best.value)) : null,
			pv: best ? this.pv(best) : [],
			depth: this.depth,
			nodes: this.nodes,
			timeMs: Math.round(elapsed),
			nps: elapsed > 0 ? Math.round(this.nodes / (elapsed / 1000)) : 0,
			moves,
		}
	}
}

/**
 * Search a position synchronously. See `Searcher` for the options.
 *
 * `value` is for the side to move, `E` is White's expected score; `moves` come best first.
 *
 * @param {EngineState} state engine state (game not over)
 * @param {object} [options] search options
 * @return {SearchResult}
 */
export function search(state, options = {}) {
	const s = new Searcher(state, options)
	s.step()
	return s.result()
}
