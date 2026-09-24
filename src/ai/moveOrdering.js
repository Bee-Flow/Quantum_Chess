/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Move ordering of the search. Good ordering makes alpha-beta cut early: the transposition-table move first, then
 * certain king captures, king shots, captures by P(capture) × MVV-LVA, promotions, checks, killer moves, merges,
 * standard moves by the history heuristic and target square, Measures, and splits last. It also prunes the move list:
 * inside the tree only splits whose two targets are among the piece's best standard targets, and Measures only when
 * they may make a capture certain.
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { BUDGET, budget, generateMoves, squareName, T } from '../engine/index.js'
import { CHEAP, features } from './features.js'
import { between, KING, KNIGHT, RAYS, reaches } from './geometry.js'
import { PIECE_VALUES } from './levels.js'
import { captureWeight, victimOf } from './searchValues.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/** @typedef {import('./features.js').Features} Features */

/**
 * @typedef {object} OrderedMove
 * @property {LegalMove} m the LegalMove
 * @property {boolean} tactical a capture, promotion, check or transposition-table move (never reduced or pruned)
 * @property {number} score ordering score, highest first
 */

/**
 * Does the piece of a standard move or merge attack the enemy king square from its target (on the lines of certain
 * pieces only)? A cheap ordering hint for "moves that may leave the enemy king unable to escape".
 *
 * @param {Features} feat features
 * @param {LegalMove} m LegalMove
 * @param {number} king enemy king square
 * @return {boolean}
 */
function givesCheck(feat, m, king) {
	if (king < 0 || m.type === 'split' || m.type === 'measure') {
		return false
	}
	const type = feat.types[m.piece]
	const t = m.to[0]
	if (type === 'p') {
		const df = Math.abs((t & 7) - (king & 7))
		const dr = (king >> 3) - (t >> 3)
		return df === 1 && dr === (m.piece < 16 ? 1 : -1)
	}
	if (!reaches(type, t, king)) {
		return false
	}
	if (type === 'n' || type === 'k') {
		return true
	}
	const lane = between(t, king)
	for (let j = 0; j < lane.length; j++) {
		const o = feat.occ[lane[j]]
		if (o >= 0 && o !== m.piece && feat.p[lane[j]] > 0.5) {
			return false
		}
	}
	return true
}

/**
 * Orders and prunes the moves of one search. It keeps the killer moves (quiet moves that caused a cutoff, per ply) and
 * the history scores (per move code) of that search.
 */
export class MoveOrderer {
	/**
	 * @param {{splitTargets: number, splitTypes: Set<string>}} params the search parameters: split targets kept per piece
	 *   and the piece types that may split
	 * @param {number} ignoreKing colour index (0 White, 1 Black) that does not notice danger to its own king, or −1
	 */
	constructor(params, ignoreKing) {
		this.splitTargets = params.splitTargets
		this.splitTypes = params.splitTypes
		this.ignoreKing = ignoreKing
		/** @type {Array<Array<string>|undefined>} killer move codes per ply */
		this.killers = []
		/** @type {Map<string, number>} history score per move code */
		this.history = new Map()
	}

	/**
	 * Remember a quiet move that caused a cutoff: it becomes a killer move at this ply, and its history score grows by
	 * depth².
	 *
	 * @param {number} ply ply
	 * @param {string} code move code
	 * @param {number} depth remaining depth of the node
	 */
	recordCutoff(ply, code, depth) {
		this.addKiller(ply, code)
		this.history.set(code, (this.history.get(code) || 0) + depth * depth)
	}

	/**
	 * Candidate captures of the side to move, generated from the attack map without the full move list: standard
	 * captures, converging captures (merges), en passant and queen promotions. Legality is checked by `findMove`.
	 * Sorted king shots first, then by estimated gain.
	 *
	 * @param {EngineState} state position
	 * @return {Array<{code: string, king: boolean, score: number}>}
	 */
	captures(state) {
		const feat = features(state)
		const mover = state.turn === 'w' ? 0 : 1
		const base = mover * 16
		const out = []
		const seen = new Set()
		const parts = new Map()
		const add = (id, from, to, pa, promo) => {
			const vid = feat.occ[to]
			const king = vid === (mover === 0 ? 16 : 0)
			if (king && this.ignoreKing === 1 - mover) {
				return
			}
			const code = squareName(from) + '-' + squareName(to) + (promo ? '=Q' : '')
			if (seen.has(code)) {
				return
			}
			seen.add(code)
			const victim = vid >= 0 ? PIECE_VALUES[feat.types[vid]] : promo ? 800 : 100
			out.push({ code, king, score: (king ? 1e6 : 0) + pa * (vid >= 0 ? feat.p[to] : 1) * victim * 10 - PIECE_VALUES[feat.types[id]] / 10 })
			if (!promo && vid >= 0) {
				let list = parts.get(id)
				if (list === undefined) {
					list = []
					parts.set(id, list)
				}
				list.push({ from, to })
			}
		}
		const enemy = (s) => {
			const o = feat.occ[s]
			return o >= 0 && (o < 16 ? 0 : 1) !== mover
		}
		const epSq = state.ep === '-' ? -1 : (state.ep.charCodeAt(1) - 49) * 8 + (state.ep.charCodeAt(0) - 97)
		for (let from = 0; from < 64; from++) {
			const id = feat.occ[from]
			if (id < base || id >= base + 16) {
				continue
			}
			const type = feat.types[id]
			const pf = feat.p[from]
			if (type === 'p') {
				const dir = mover === 0 ? 8 : -8
				const last = mover === 0 ? 7 : 0
				const file = from & 7
				for (const df of [-1, 1]) {
					if (file + df < 0 || file + df > 7) {
						continue
					}
					const to = from + dir + df
					if (enemy(to) || to === epSq) {
						add(id, from, to, pf, to >> 3 === last)
					}
				}
				const push = from + dir
				if (push >> 3 === last && feat.occ[push] < 0) {
					add(id, from, push, pf, true)
				}
				continue
			}
			if (type === 'n' || type === 'k') {
				const list = feat.types[id] === 'n' ? KNIGHT[from] : KING[from]
				for (let j = 0; j < list.length; j++) {
					if (enemy(list[j])) {
						add(id, from, list[j], pf, false)
					}
				}
				continue
			}
			const d0 = type === 'b' ? 4 : 0
			const d1 = type === 'r' ? 4 : 8
			for (let d = d0; d < d1; d++) {
				const ray = RAYS[from * 8 + d]
				let clear = 1
				for (let j = 0; j < ray.length; j++) {
					const s = ray[j]
					const o = feat.occ[s]
					if (o < 0 || o === id) {
						continue
					}
					if (enemy(s)) {
						add(id, from, s, pf * clear, false)
					}
					clear *= 1 - feat.p[s]
					if (clear < 0.05) {
						break
					}
				}
			}
		}
		// Converging captures: two parts of one piece attacking the same enemy square.
		for (const [id, list] of parts) {
			if (feat.partsCount[id] < 2 || feat.types[id] === 'p' || feat.types[id] === 'k') {
				continue
			}
			for (let a = 0; a < list.length; a++) {
				for (let b = a + 1; b < list.length; b++) {
					if (list[a].to !== list[b].to || list[a].from === list[b].from) {
						continue
					}
					const f1 = Math.min(list[a].from, list[b].from)
					const f2 = Math.max(list[a].from, list[b].from)
					const to = list[a].to
					const vid = feat.occ[to]
					const code = squareName(f1) + '|' + squareName(f2) + '-' + squareName(to)
					if (!seen.has(code)) {
						seen.add(code)
						const king = vid === (mover === 0 ? 16 : 0)
						out.push({ code, king, score: (king ? 2e6 : 0) + feat.p[to] * PIECE_VALUES[feat.types[vid]] * 12 })
					}
				}
			}
		}
		out.sort((x, y) => y.score - x.score)
		return out
	}

	/**
	 * Keep only splits whose targets are both among the piece's best `k` standard targets (Appendix C).
	 *
	 * @param {Features} feat features
	 * @param {LegalMove[]} moves LegalMoves
	 * @param {number} k targets kept per piece
	 * @return {object[]}
	 */
	pruneSplits(feat, moves, k) {
		const targets = new Map()
		for (const m of moves) {
			if (m.type === 'standard' && !m.capture && feat.occ[m.to[0]] < 0 && feat.partsCount[m.piece] >= 1) {
				const type = feat.types[m.piece]
				if (type === 'p' || type === 'k') {
					continue
				}
				let list = targets.get(m.piece)
				if (list === undefined) {
					list = []
					targets.set(m.piece, list)
				}
				list.push({ sq: m.to[0], score: this.targetScore(feat, m.piece, m.from[0], m.to[0]) })
			}
		}
		const keep = new Map()
		for (const [id, list] of targets) {
			list.sort((a, b) => b.score - a.score)
			keep.set(id, new Set(list.slice(0, k).map((x) => x.sq)))
		}
		return moves.filter((m) => {
			if (m.type !== 'split') {
				return true
			}
			if (!this.splitTypes.has(feat.types[m.piece])) {
				return false
			}
			const set = keep.get(m.piece)
			return set !== undefined && set.has(m.to[0]) && set.has(m.to[1])
		})
	}

	/**
	 * Keep only the best `n` root splits of the given piece types (level 3: the top 6 splits for R and Q).
	 *
	 * @param {Features} feat features
	 * @param {LegalMove[]} moves LegalMoves
	 * @param {object} top `{type: n}`
	 * @return {object[]}
	 */
	topSplits(feat, moves, top) {
		const byType = new Map()
		for (const m of moves) {
			if (m.type === 'split' && top[feat.types[m.piece]] !== undefined) {
				const s = this.targetScore(feat, m.piece, m.from[0], m.to[0]) + this.targetScore(feat, m.piece, m.from[0], m.to[1])
				const t = feat.types[m.piece]
				if (!byType.has(t)) {
					byType.set(t, [])
				}
				byType.get(t).push({ m, s })
			}
		}
		const allowed = new Set()
		for (const [t, list] of byType) {
			list.sort((a, b) => b.s - a.s)
			for (const x of list.slice(0, top[t])) {
				allowed.add(x.m.code)
			}
		}
		return moves.filter((m) => m.type !== 'split' || top[feat.types[m.piece]] === undefined || allowed.has(m.code))
	}

	/**
	 * Heuristic score of a piece moving from `from` to the empty square `to`: centralisation, safety from cheaper
	 * attackers, and pressure on enemy pieces.
	 *
	 * @param {Features} feat features
	 * @param {number} id piece id
	 * @param {number} from square
	 * @param {number} to square
	 * @return {number}
	 */
	targetScore(feat, id, from, to) {
		const c = id < 16 ? 0 : 1
		const type = feat.types[id]
		const val = PIECE_VALUES[type]
		const center = (x) => 7 - (Math.abs(3.5 - (x & 7)) + Math.abs(3.5 - (x >> 3)))
		let s = (center(to) - center(from)) * 4
		const e = 1 - c
		const threat = feat.att[e * 64 + to]
		if (threat > 0) {
			s -= feat.att[CHEAP + e * 64 + to] < val ? val * threat : feat.att[c * 64 + to] >= 0.5 ? 0 : val * threat * 0.5
		}
		// Attacking the enemy king zone or undefended pieces from the new square.
		const k = feat.kingSq[e]
		if (k >= 0 && reaches(type, to, k)) {
			s += 40
		}
		return s
	}

	/**
	 * The ordered move list of a node, with the level's pruning applied.
	 *
	 * @param {EngineState} state position
	 * @param {number} ply ply
	 * @param {string|null} ttMove TT move code
	 * @param {number} depth remaining depth
	 * @return {OrderedMove[]}
	 */
	orderedMoves(state, ply, ttMove, depth) {
		const feat = features(state)
		let moves = generateMoves(state)
		moves = this.pruneSplits(feat, moves, depth >= 3 ? this.splitTargets : Math.max(2, this.splitTargets - 1))
		const mover = state.turn === 'w' ? 0 : 1
		// Measures only when the budget is full or a part is attacking something (a certain capture may follow).
		const full = budget(state, state.turn) >= BUDGET
		moves = moves.filter((m) => m.type !== 'measure' || full || this.usefulMeasure(feat, m, mover))
		if (this.ignoreKing === 1 - mover) {
			const k = feat.kingSq[this.ignoreKing]
			moves = moves.filter((m) => m.to.length === 0 || m.to[0] !== k)
		}
		return this.score(feat, moves, ply, ttMove)
	}

	/**
	 * Is a Measure worth searching when the budget is not full? Only if the piece has a part attacking an enemy piece
	 * (the Measure may make a capture certain).
	 *
	 * @param {Features} feat features
	 * @param {LegalMove} m measure LegalMove
	 * @param {number} mover colour index
	 * @return {boolean}
	 */
	usefulMeasure(feat, m, mover) {
		const id = m.piece
		const type = feat.types[id]
		for (let s = 0; s < 64; s++) {
			if (feat.occ[s] !== id) {
				continue
			}
			for (let t = 0; t < 64; t++) {
				const o = feat.occ[t]
				if (o >= 0 && (o < 16 ? 0 : 1) !== mover && reaches(type, s, t)) {
					return true
				}
			}
		}
		return false
	}

	/**
	 * Score and sort moves in the order described in the file header.
	 *
	 * @param {Features} feat features
	 * @param {LegalMove[]} moves LegalMoves
	 * @param {number} ply ply
	 * @param {string|null} ttMove TT move code
	 * @return {OrderedMove[]}
	 */
	score(feat, moves, ply, ttMove) {
		const killers = this.killers[ply] || []
		const out = new Array(moves.length)
		for (let i = 0; i < moves.length; i++) {
			const m = moves[i]
			const mover = m.piece < 16 ? 0 : 1
			const enemyKing = feat.kingSq[1 - mover]
			let score = 0
			let tactical = false
			const cw = captureWeight(m)
			if (m.code === ttMove) {
				score = 1e10
				tactical = true
			}
			if (cw > 0) {
				const vid = victimOf(feat, m)
				const pc = cw / T
				tactical = true
				if (vid === 0 || vid === 16) {
					score += 1e9 + pc * 1e8
				} else {
					const vv = vid >= 0 ? PIECE_VALUES[feat.types[vid]] : 100
					score += (pc >= 0.25 ? 3e6 : 5e5) + pc * (vv * 10 - PIECE_VALUES[feat.types[m.piece]] / 10)
				}
			} else if (m.promo === 'q') {
				score += 2.5e6
				tactical = true
			} else if (m.type === 'merge') {
				score += 6e5
			} else if (m.type === 'standard') {
				score += (this.history.get(m.code) || 0) + 1e3
				if (killers[0] === m.code) {
					score += 9e5
				} else if (killers[1] === m.code) {
					score += 8e5
				}
			} else if (m.type === 'measure') {
				score += 500
			} else {
				score += (this.history.get(m.code) || 0) / 4
			}
			if (m.type !== 'split' && m.type !== 'measure' && givesCheck(feat, m, enemyKing)) {
				score += 2e6
				tactical = true
			}
			if (m.type === 'standard' && !m.capture) {
				score += this.targetScore(feat, m.piece, m.from[0], m.to[0])
			}
			out[i] = { m, tactical, score }
		}
		out.sort((a, b) => b.score - a.score)
		return out
	}

	/**
	 * Remember a quiet move that caused a cutoff at this ply.
	 *
	 * @param {number} ply ply
	 * @param {string} code move code
	 */
	addKiller(ply, code) {
		let k = this.killers[ply]
		if (k === undefined) {
			k = this.killers[ply] = []
		}
		if (k[0] !== code) {
			k[1] = k[0]
			k[0] = code
		}
	}
}
