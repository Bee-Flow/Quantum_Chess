// Cross-check of the real multiverse module (src/variants/multiverse.js, through the core in
// src/variants/core/quantum.js) against 5d-chess-js 1.2.1 (handoff/tmp/mv-faithful/package) on random classical games
// (one world, no splits). Session material, not shipped. 5d-chess-js is not a dependency of the app: unpack it once
// with `tar xzf handoff/tmp/mv-faithful/5d-chess-js-1.2.1.tgz -C handoff/tmp/mv-faithful` (creates `package/`).
//
// Usage: node handoff/tools/mv-cross.mjs [games per setup = 16] [plies = 100] [seed = 1] [setups = all, comma list]
// Environment: PROMO=board keeps 5d-chess-js's default promotion pieces (the pieces on the board; shows the brawn
// gap), otherwise 5d-chess-js promotes to a queen only, as the official rule and the module do. VERBOSE=1 prints
// every unexplained mismatch; LOG=<file> writes them with the full 5DFEN of the position as JSON lines; TRAVEL=<p>
// sets how often a travel move is preferred (default 0.3); BUDGET=<n> the node budget of the searches; EXAMPLES=1
// prints the first example of every explained difference.
//
// Per position (the side to move's view, also in the middle of a turn) it compares:
// - the legal moves: the core's legal codes against the variant's generation, and those against 5d-chess-js's moves
//   from every timeline (activeOnly and presentOnly off). A move only the module has is explained when it is castling
//   while the king or a crossed square is attacked (the module has no check), or en passant after a physical double
//   step whose victim square was occupied one turn earlier or whose board one turn earlier does not exist (5d-chess-js
//   infers en passant from that board). A move only 5d-chess-js has is explained when it lands on a sealed board or
//   rides through one (the travel reach), or opens a timeline over the cap. With PROMO=board, a pawn or brawn move onto
//   the last rank that 5d-chess-js misses for lack of promotion pieces is the brawn gap;
// - every stored board of the module with 5d-chess-js's board (pieces, sides, unmoved flags), the timelines, their
//   first and latest boards, the active timelines, the present and the must-move timelines;
// - may submit (the present is not the mover's) with 5d-chess-js's present list, and the core's Submit action;
// - the check test: the module's phantom list (the must-move boards passed) and the core's king danger against
//   5d-chess-js's check list (with the same promotion pieces as the moves) and inCheck;
// - the stuck test where its quick path does not decide, and every stuck ending, against an exact search over the
//   module's own moves; a stuck turn start must be checkmate or stalemate in 5d-chess-js, checkmate exactly when in
//   check.
import { appendFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as Q from '../../src/variants/core/quantum.js'
import { generate as cachedGenerate } from '../../src/variants/core/world.js'
import V from '../../src/variants/multiverse.js'
import { apply, stuck } from '../../src/variants/multiverse/engine.js'
import { genMoves, phantomPass } from '../../src/variants/multiverse/moves.js'
import { baseType, RIDES, ROYAL } from '../../src/variants/multiverse/pieces.js'
import { SETUP_ORDER, SETUPS } from '../../src/variants/multiverse/setup.js'
import {
	boardText,
	canSubmit,
	CELL_NAMES,
	decode,
	lOf,
	mandatory,
	ROWS,
	skeleton,
	slotAt,
	sqOf,
	uOf,
} from '../../src/variants/multiverse/skeleton.js'

const require = createRequire(import.meta.url)
const Chess = require('../tmp/mv-faithful/package/dist/5d-chess.js')

const [gamesArg = '16', pliesArg = '100', seedArg = '1', setupsArg = 'all'] = process.argv.slice(2)
const GAMES = Number(gamesArg)
const PLIES = Number(pliesArg)
const SETUP_LIST = setupsArg === 'all' ? SETUP_ORDER : setupsArg.split(',')
const PROMO_BOARD = process.env.PROMO === 'board'
const VERBOSE = !!process.env.VERBOSE
const LOG = process.env.LOG ?? null
/** How often a travel move is preferred (lower: the cap is reached later, so more branch lists are compared). */
const TRAVEL = Number(process.env.TRAVEL ?? 0.3)
/** The travel reach and cap per game, in turn. */
const REACHES = ['4', '2', '4', 'auto']
const CAPS = ['3', '3', '2', '1', '3']
/** Node budget of the exact completion search. */
const DFS_BUDGET = Number(process.env.BUDGET ?? 4000)
/** 5d-chess-js's built-in boards. */
const BUILTIN = {
	standard: 'standard',
	defended: 'defended_pawn',
	halfreflected: 'half_reflected',
	princess: 'princess',
	reversed: 'reversed_royalty',
	turnzero: 'turn_zero',
	twotimelines: 'two_timelines',
}
/** 5d-chess-js piece codes: TO_FEN[abs(code)]; odd codes are Black; a negative code is an unmoved piece. */
const TO_FEN = ' pPbBnNrRqQkKsSwWcCyYuUdD'.split('').map((ch) => ch.trim())
/** Queen codes: White 10, Black 9. */
const QUEENS = [10, 9]

let seed = Number(seedArg)
/**
 * A deterministic random number in [0, 1).
 *
 * @return {number}
 */
function rng() {
	seed = (seed * 1103515245 + 12345) % 2147483648
	return seed / 2147483648
}

// ---------------------------------------------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------------------------------------------

/**
 * The module's line of a 5d-chess-js raw timeline index (0, 2, 4 … are 0, +1, +2; 1, 3 … are −1, −2; an even start
 * has 1 = −0, 2 = +0, 3 = −1, 4 = +1).
 *
 * @param {number} p raw timeline index
 * @param {number} md start mode
 * @return {number}
 */
function rawToL(p, md) {
	const pub = p === 0 ? 0 : p % 2 === 0 ? p / 2 : -Math.ceil(p / 2)
	return md === 1 && pub > 0 ? pub - 1 : pub
}

/**
 * The raw timeline index of a line.
 *
 * @param {number} l line
 * @param {number} md start mode
 * @return {number}
 */
function lToRaw(l, md) {
	if (md === 1) {
		return l >= 0 ? 2 * l + 2 : -2 * l - 1
	}
	return l >= 0 ? 2 * l : -2 * l - 1
}

/**
 * A readable board and cell, as in the module's keys.
 *
 * @param {number} md start mode
 * @param {number} l line
 * @param {number} v half-turn index
 * @param {number} x file
 * @param {number} y rank
 * @return {string}
 */
function cellText(md, l, v, x, y) {
	const u = uOf(l, md)
	return (u < 0 ? '(L' + l + 'T' + (v >> 1) + ')' : boardText(u, v)) + CELL_NAMES[y * 8 + x]
}

/**
 * The signature of a move: `l:v:xy>l:v:xy` for source and target.
 *
 * @param {number[]} a source [l, v, x, y]
 * @param {number[]} b target [l, v, x, y]
 * @return {string}
 */
function sig(a, b) {
	return a[0] + ':' + a[1] + ':' + a[2] + a[3] + '>' + b[0] + ':' + b[1] + ':' + b[2] + b[3]
}

/**
 * The parts of a signature.
 *
 * @param {string} s signature
 * @return {number[][]} [[l, v, x, y], [l, v, x, y]]
 */
function unsig(s) {
	return s.split('>').map((p) => {
		const [l, v, xy] = p.split(':')
		return [Number(l), Number(v), Number(xy[0]), Number(xy[1])]
	})
}

/**
 * A signature as text.
 *
 * @param {number} md start mode
 * @param {string} s signature
 * @return {string}
 */
function sigText(md, s) {
	const [a, b] = unsig(s)
	return cellText(md, ...a) + '>' + cellText(md, ...b)
}

// ---------------------------------------------------------------------------------------------------------------
// The two engines
// ---------------------------------------------------------------------------------------------------------------

/**
 * The 5DFEN of a custom setup (unmoved markers on kings, rooks, pawns and brawns).
 *
 * @param {string} id setup id
 * @return {string}
 */
function customFen(id) {
	const S = SETUPS[id]
	const star = (f) => f.replace(/[KRPWkrpw]/g, (c) => c + '*')
	const label = (l) => (S.md === 1 ? (l < 0 ? '-0' : '+0') : String(l))
	return '[Size "' + S.n + 'x' + S.n + '"]\n[Board "custom"]\n'
		+ S.rows.map(([l, f]) => '[' + star(f) + ':' + label(l) + ':1:w]').join('\n')
}

/**
 * A 5d-chess-js game of a setup.
 *
 * @param {string} id setup id
 * @return {object}
 */
function refGame(id) {
	const c = BUILTIN[id] ? new Chess(null, BUILTIN[id]) : new Chess(customFen(id))
	c.skipDetection = true
	c.checkmateTimeout = 8000
	if (!PROMO_BOARD) {
		c.rawPromotionPieces = QUEENS.slice()
	}
	return c
}

/**
 * The half-turn index of a raw turn index.
 *
 * @param {object} c 5d-chess-js game
 * @param {number} t raw turn index
 * @return {number}
 */
function rawToV(c, t) {
	return c.raw.boardFuncs.isTurnZero(c.rawBoard) ? t : t + 2
}

/**
 * The signature of a raw 5d-chess-js move.
 *
 * @param {object} c 5d-chess-js game
 * @param {number} md start mode
 * @param {Array} m raw move
 * @return {string}
 */
function refSig(c, md, m) {
	const pos = (p) => [rawToL(p[0], md), rawToV(c, p[1]), p[3], p[2]]
	return sig(pos(m[0]), pos(m[1]))
}

/**
 * The signature of a move of the module, from its source and target boards.
 *
 * @param {object} x extra state
 * @param {object} m move
 * @param {boolean[]|null} pass rows passed virtually (the phantom)
 * @return {string}
 */
function mySig(x, m, pass = null) {
	const e = m.extra
	const f = decode(m.from)
	const v = x.tl[e.u][1] + (pass && pass[e.u] ? 1 : 0)
	return sig([lOf(e.u, x.md), v, f.x, f.y], [lOf(e.tu, x.md), e.tv, e.tx, e.ty])
}

/**
 * The latest board of every row (with the phantom, `en + 1` on passed rows); −1 for a missing row.
 *
 * @param {object} x extra state
 * @param {boolean[]|null} pass rows passed virtually
 * @return {number[]}
 */
function endsOf(x, pass = null) {
	return x.tl.map((e, u) => (e === null ? -1 : e[1] + (pass && pass[u] ? 1 : 0)))
}

/**
 * Whether board (l, v) is stored but sealed in the module (older than the travel reach), given the latest boards.
 *
 * @param {object} x extra state
 * @param {number[]} ends latest boards
 * @param {number} l line
 * @param {number} v half-turn index
 * @return {boolean}
 */
function sealed(x, ends, l, v) {
	const u = uOf(l, x.md)
	if (u < 0 || x.tl[u] === null) {
		return false
	}
	return v >= x.tl[u][0] && v <= ends[u] && ends[u] - v > x.h
}

/**
 * Why the module leaves out a move that 5d-chess-js has: 'reach' (the target board is sealed), 'reachPath' (a rider
 * passes a sealed board), 'cap' (a new timeline over the cap), or null when nothing explains it.
 *
 * @param {object} w world
 * @param {number} side the moving side
 * @param {string} s signature
 * @param {boolean[]|null} pass rows passed virtually (the phantom)
 * @return {string|null}
 */
function cutReason(w, side, s, pass = null) {
	const x = w.x
	const ends = endsOf(x, pass)
	const [a, b] = unsig(s)
	if (sealed(x, ends, b[0], b[1])) {
		return 'reach'
	}
	const u0 = uOf(a[0], x.md)
	const id = u0 < 0 ? -1 : w.board[sqOf(u0, 0, a[2], a[3])]
	const type = id >= 0 ? baseType(w.ty[id]) : ''
	// a rider, or a pawn's or brawn's double step, passes the boards in between
	if (RIDES[type] || type === 'p' || type === 'w') {
		const d = [b[2] - a[2], b[3] - a[3], (b[1] - a[1]) / 2, b[0] - a[0]]
		const k = Math.max(...d.map(Math.abs))
		for (let j = 1; j < k; j++) {
			if (sealed(x, ends, a[0] + (j * d[3]) / k, a[1] + (2 * j * d[2]) / k)) {
				return 'reachPath'
			}
		}
	}
	const tu = uOf(b[0], x.md)
	const older = tu >= 0 && x.tl[tu] !== null && b[1] < ends[tu]
	if (older && !pass && x.c[side] >= x.m) {
		const o = w.board[sqOf(tu, slotAt(x, tu, b[1]), b[2], b[3])]
		if (!(o >= 0 && ROYAL.has(w.ty[o]))) {
			return 'cap'
		}
	}
	return null
}

/**
 * The limits the reference does not have, checked on the module's own moves: no move lands on or rides through a
 * sealed board, and no branch opens a timeline over the cap (a branch onto a royal piece opens none).
 *
 * @param {object} ctx game context
 * @param {object} w world
 * @param {number} side the moving side
 * @param {object} m the module's move
 * @param {string} s its signature
 * @param {boolean[]|null} pass rows passed virtually (the phantom)
 */
function limitBreach(ctx, w, side, m, s, pass = null) {
	const why = cutReason(w, side, s, pass)
	if (why === 'reach' || why === 'reachPath') {
		finding(ctx, 'reachBreach', { move: m.key, why })
	}
	if (m.kind === 'branch' && !m.extra.noRow && w.x.c[side] >= w.x.m) {
		finding(ctx, 'capBreach', { move: m.key })
	}
	if (m.kind === 'branch' && m.extra.noRow !== (m.capture >= 0 && ROYAL.has(w.ty[m.capture]))) {
		finding(ctx, 'noRowFlag', { move: m.key })
	}
}

/**
 * 5d-chess-js's check list with the promotion pieces of its moves: after passing the present boards, the opponent's
 * moves that capture a royal piece of the side to move (as mateFuncs.checks, which always uses the default promotion
 * pieces).
 *
 * @param {object} c 5d-chess-js game
 * @param {object[]|null} promo promotion pieces or null for the default
 * @return {Array[]}
 */
function refChecks(c, promo) {
	const B = c.raw.boardFuncs
	const tmp = B.copy(c.rawBoard)
	c.raw.mateFuncs.blankAction(tmp, c.rawAction)
	const color = c.rawAction % 2
	const out = []
	for (const m of B.moves(tmp, c.rawAction + 1, false, false, false, promo)) {
		if (m.length === 2 && B.positionExists(tmp, m[1])) {
			const p = Math.abs(tmp[m[1][0]][m[1][1]][m[1][2]][m[1][3]])
			if ((p === 11 || p === 12 || p === 19 || p === 20) && p % 2 === color) {
				out.push(m)
			}
		}
	}
	return { list: out, board: tmp }
}

/**
 * Submit in 5d-chess-js whatever its check test says (the module has no check).
 *
 * @param {object} c 5d-chess-js game
 */
function refSubmit(c) {
	Object.defineProperty(c, 'inCheck', { get: () => false, configurable: true })
	try {
		c.submit()
	} finally {
		delete c.inCheck
	}
}

// ---------------------------------------------------------------------------------------------------------------
// The exact completion search (one world, the module's own moves)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Whether the side to move can finish its turn from world w: some sequence of its moves makes Submit legal or passes
 * the turn, or captures an enemy royal piece (the game ends). Null when the node budget runs out.
 *
 * @param {object} w world
 * @return {boolean|null}
 */
function canFinish(w) {
	const side = w.x.s
	const memo = new Map()
	let nodes = 0
	const rec = (b) => {
		if (b.x.s !== side || b.x.k >= 0 || canSubmit(b.x)) {
			return true
		}
		const key = b.x.tl.map((e) => (e ? e[1] : '')).join(',') + '|' + b.x.c.join() + '|' + b.sq.join()
		if (memo.has(key)) {
			return memo.get(key)
		}
		if (++nodes > DFS_BUDGET) {
			throw new Error('budget')
		}
		memo.set(key, false)
		const list = genMoves(b, side)
		if (list.some((m) => m.capture >= 0 && ROYAL.has(b.ty[m.capture]))) {
			memo.set(key, true)
			return true
		}
		// moves on their own board first (the quick way to finish)
		const travel = (m) => (m.kind === 'hop' || m.kind === 'branch' ? 1 : 0)
		list.sort((p, q) => travel(p) - travel(q))
		for (const m of list) {
			if (rec(apply(b, m))) {
				memo.set(key, true)
				return true
			}
		}
		return false
	}
	try {
		return rec(w)
	} catch (err) {
		if (err.message === 'budget') {
			return null
		}
		throw err
	}
}

/**
 * A way for 5d-chess-js to finish the turn of the side to move (ignoring check): a breadth-first search over its moves
 * (as its own stalemate test, without the check filter), shortest sequences first. The sequence found is replayed on
 * the module while its moves are common; the first move the module leaves out gets its reason. Returns
 * `{ moves, cut }` (`cut`: that reason, or null when the module has every move of the sequence), null when there is no
 * way, or 'budget'.
 *
 * @param {object} ctx game context
 * @param {object} w world
 * @return {object|null|string}
 */
function refEscape(ctx, w) {
	const c = ctx.c
	const B = c.raw.boardFuncs
	const side = w.x.s
	const action = c.rawAction
	const md = w.x.md
	const promo = PROMO_BOARD ? null : QUEENS
	const seen = new Set()
	let queue = [{ r: B.copy(c.rawBoard), path: [] }]
	let nodes = 0
	let found = null
	while (queue.length && !found) {
		const next = []
		for (const { r, path } of queue) {
			for (const m of B.moves(r, action, false, false, false, promo)) {
				if (m.length === 2 && m[1][4] && !QUEENS.includes(m[1][4])) {
					continue
				}
				const sg = refSig(c, md, m)
				const p2 = [...path, sg]
				// the same set of moves in another order: the same position
				const key = p2.slice().sort().join(';')
				if (seen.has(key)) {
					continue
				}
				seen.add(key)
				if (++nodes > DFS_BUDGET * 10) {
					return 'budget'
				}
				const r2 = B.copy(r)
				B.move(r2, m)
				if (B.present(r2, action).length === 0) {
					found = p2
					break
				}
				next.push({ r: r2, path: p2 })
			}
			if (found) {
				break
			}
		}
		queue = next
	}
	if (!found) {
		return null
	}
	let b = w
	let cut = null
	for (const sg of found) {
		const m = genMoves(b, side).find((q) => mySig(b.x, q) === sg)
		if (!m) {
			cut = cutReason(b, side, sg) ?? 'unexplained'
			break
		}
		b = apply(b, m)
	}
	return { moves: found.map((sg) => sigText(md, sg)), cut: cut ? [cut] : [] }
}

// ---------------------------------------------------------------------------------------------------------------
// Statistics and findings
// ---------------------------------------------------------------------------------------------------------------

const stats = {
	games: 0,
	plies: 0,
	positions: 0,
	turnStarts: 0,
	myMoves: 0,
	refMoves: 0,
	travel: 0,
	branches: 0,
	promotions: 0,
	castles: 0,
	enPassants: 0,
	submits: 0,
	autoEnds: 0,
	checks: 0,
	checkMoves: 0,
	boardsCompared: 0,
	positionsBelowCap: 0,
	same: {},
	explained: {
		castleAttacked: 0,
		epOccupied: 0,
		epNoBoard: 0,
		brawnGap: 0,
		brawnGapPositions: 0,
		reach: 0,
		reachPath: 0,
		cap: 0,
		checkReach: 0,
		checkBrawnGapLib: 0,
	},
	stuck: { quickFail: 0, exactAgree: 0, exactUnknown: 0, stuckEnds: 0, refMateAgree: 0, refMateTimeout: 0 },
	results: {},
	unexplained: 0,
	byKind: {},
	perSetup: {},
}
const findings = []
/** The first example of every explained difference. */
const examples = {}

/**
 * Keep the first example of an explained difference.
 *
 * @param {object} ctx game context
 * @param {string} why the reason
 * @param {string} move the move
 */
function example(ctx, why, move) {
	if (!examples[why]) {
		examples[why] = { setup: ctx.setup, options: ctx.options, codes: ctx.codes.slice(), move }
	}
}
if (LOG) {
	writeFileSync(LOG, '')
}

/**
 * Record an unexplained mismatch.
 *
 * @param {object} ctx game context
 * @param {string} kind kind of mismatch
 * @param {object} detail details
 */
function finding(ctx, kind, detail) {
	stats.unexplained++
	stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1
	stats.perSetup[ctx.setup].unexplained++
	const f = {
		kind,
		setup: ctx.setup,
		options: ctx.options,
		game: ctx.game,
		step: ctx.step,
		codes: ctx.codes.slice(),
		...detail,
	}
	if (findings.filter((g) => g.kind === kind && g.setup === ctx.setup).length < 3) {
		findings.push(f)
	}
	if (VERBOSE) {
		console.log('MISMATCH', JSON.stringify(f))
	}
	if (LOG) {
		appendFileSync(LOG, JSON.stringify({ ...f, fen: ctx.c.fen(undefined, true) }) + '\n')
	}
}

// ---------------------------------------------------------------------------------------------------------------
// The comparisons of one position
// ---------------------------------------------------------------------------------------------------------------

/**
 * Compare every stored board, the timelines, the active timelines, the present and the must-move timelines.
 *
 * @param {object} ctx game context
 * @param {object} w world
 */
function compareBoards(ctx, w) {
	const x = w.x
	const c = ctx.c
	const raw = c.rawBoard
	const md = x.md
	const refLines = new Map()
	for (let p = 0; p < raw.length; p++) {
		const tl = raw[p]
		if (!Array.isArray(tl) || tl.length === 0) {
			continue
		}
		let first = -1
		for (let t = 0; t < tl.length; t++) {
			if (Array.isArray(tl[t])) {
				first = t
				break
			}
		}
		refLines.set(rawToL(p, md), [rawToV(c, first), rawToV(c, tl.length - 1), p])
	}
	const mine = new Map()
	for (let u = 0; u < ROWS; u++) {
		if (x.tl[u]) {
			mine.set(lOf(u, md), [x.tl[u][0], x.tl[u][1], u])
		}
	}
	const lines = (m) => [...m.entries()].map(([l, [a, b]]) => l + ':' + a + '-' + b).sort().join(' ')
	if (lines(refLines) !== lines(mine)) {
		finding(ctx, 'timelines', { mine: lines(mine), ref: lines(refLines) })
		return
	}
	for (const [l, [st, en, u]] of mine) {
		const p = refLines.get(l)[2]
		for (let v = Math.max(st, en - x.h); v <= en; v++) {
			const slot = slotAt(x, u, v)
			const rb = raw[p][v - rawToV(c, 0)]
			const a = []
			const b = []
			for (let cy = 0; cy < x.n; cy++) {
				for (let cx = 0; cx < x.n; cx++) {
					const id = w.board[sqOf(u, slot, cx, cy)]
					if (id >= 0) {
						const ty = w.ty[id][0] === 'h' ? w.ty[id].slice(1) : w.ty[id]
						const ch = baseType(ty)
						const text = (w.sd[id] ? ch : ch.toUpperCase()) + (ty.includes('0') ? '*' : '')
						a.push(CELL_NAMES[cy * 8 + cx] + text)
					}
					const code = rb[cy][cx]
					if (code !== 0) {
						// 5d-chess-js marks every piece of a built-in start unmoved; only kings, rooks, pawns and
						// brawns use the flag
						const ch = TO_FEN[Math.abs(code)]
						b.push(CELL_NAMES[cy * 8 + cx] + ch + (code < 0 && 'krpwKRPW'.includes(ch) ? '*' : ''))
					}
				}
			}
			stats.boardsCompared++
			if (a.join(' ') !== b.join(' ')) {
				finding(ctx, 'board', { board: boardText(u, v), mine: a.join(' '), ref: b.join(' ') })
			}
		}
	}
	// the active timelines, the present and the must-move timelines
	const k = skeleton(x)
	const B = c.raw.boardFuncs
	const refActive = B.active(raw).map((p) => rawToL(p, md)).sort((p, q) => p - q).join()
	const myActive = [...mine.keys()].filter((l) => k.active[uOf(l, md)]).sort((p, q) => p - q).join()
	if (refActive !== myActive) {
		finding(ctx, 'active', { mine: myActive, ref: refActive })
	}
	const refPresent = Math.min(...B.active(raw).map((p) => rawToV(c, raw[p].length - 1)))
	if (refPresent !== k.present) {
		finding(ctx, 'present', { mine: k.present, ref: refPresent })
	}
	const refMust = B.present(raw, c.rawAction).map((p) => rawToL(p, md)).sort((p, q) => p - q).join()
	const myMust = mandatory(x).map((u) => lOf(u, md)).sort((p, q) => p - q).join()
	if (refMust !== myMust) {
		finding(ctx, 'mustMove', { mine: myMust, ref: refMust })
	}
	if ((c.rawAction % 2) !== x.s) {
		finding(ctx, 'sideToMove', { mine: x.s, ref: c.rawAction % 2 })
	}
}

/**
 * Classify a move only the module has: castling while attacked, the en passant cases, the brawn gap; null otherwise.
 *
 * @param {object} ctx game context
 * @param {object} w world
 * @param {object} m the module's move
 * @param {Array} [rawBoard] 5d-chess-js's raw board of the same position
 * @return {string|null}
 */
function onlyMineReason(ctx, w, m, rawBoard = ctx.c.rawBoard) {
	const x = w.x
	const c = ctx.c
	const e = m.extra
	const f = decode(m.from)
	const side = x.s
	const pl = lToRaw(lOf(e.u, x.md), x.md)
	const pt = x.tl[e.u][1] - rawToV(c, 0)
	if (m.kind === 'castle') {
		const dir = e.tx > f.x ? 1 : -1
		const B = c.raw.boardFuncs
		const attacked = [0, 1, 2].some((i) => B.positionIsAttacked(rawBoard, [pl, pt, f.y, f.x + i * dir], side))
		return attacked ? 'castleAttacked' : null
	}
	if (m.kind === 'ep') {
		const v = x.tl[e.u][1]
		if (v - 2 < x.tl[e.u][0]) {
			return 'epNoBoard'
		}
		const prev = w.board[sqOf(e.u, slotAt(x, e.u, v - 2), e.tx, f.y)]
		return prev >= 0 ? 'epOccupied' : null
	}
	if (PROMO_BOARD && m.promo) {
		// 5d-chess-js promotes only to the non-royal pieces on the board (never to a unicorn, dragon or brawn)
		const have = c.raw.pieceFuncs.availablePromotionPieces(rawBoard).filter((p) => p % 2 === side)
		return have.length === 0 ? 'brawnGap' : null
	}
	return null
}

/**
 * Compare the legal moves; returns the moves both engines have, as [module move, raw 5d-chess-js move].
 *
 * @param {object} ctx game context
 * @param {object} state state
 * @return {Array}
 */
function compareMoves(ctx, state) {
	const w = state.worlds[0].b
	const x = w.x
	const c = ctx.c
	const side = state.turn
	// the variant's generation (every move, also duplicates) and the core's legal codes
	const list = V.generate(w, side)
	const keys = new Set()
	for (const m of list) {
		if (keys.has(m.key)) {
			finding(ctx, 'duplicateKey', { key: m.key })
		}
		keys.add(m.key)
	}
	const codes = Q.legalMoves(V, state).map((m) => m.code)
	const coreSet = [...new Set(codes)].sort().join(' ')
	if (coreSet !== [...keys].sort().join(' ') || codes.length !== keys.size) {
		finding(ctx, 'coreLegal', {
			onlyCore: codes.filter((k) => !keys.has(k)).slice(0, 8),
			onlyGenerate: [...keys].filter((k) => !codes.includes(k)).slice(0, 8),
		})
	}
	const mine = [...cachedGenerate(V, w, side).values()].filter((m) => m.kind !== 'submit')
	const bySig = new Map()
	for (const m of mine) {
		const s = mySig(x, m)
		if (bySig.has(s)) {
			finding(ctx, 'duplicateSig', { a: bySig.get(s).key, b: m.key })
		}
		bySig.set(s, m)
		limitBreach(ctx, w, side, m, s)
	}
	const rawMoves = c.moves('raw', false, false)
	const refBySig = new Map()
	for (const m of rawMoves) {
		const s = refSig(c, x.md, m)
		const list2 = refBySig.get(s) ?? refBySig.set(s, []).get(s)
		list2.push(m)
	}
	stats.myMoves += mine.length
	stats.refMoves += refBySig.size
	if (x.c[side] < x.m) {
		stats.positionsBelowCap++
	}
	let gap = false
	for (const [s, m] of bySig) {
		if (refBySig.has(s)) {
			continue
		}
		const why = onlyMineReason(ctx, w, m)
		if (why) {
			stats.explained[why]++
			example(ctx, why, m.key)
			gap ||= why === 'brawnGap'
		} else {
			finding(ctx, 'onlyModule', { move: m.key, moveKind: m.kind, piece: w.ty[m.id], sig: s })
		}
	}
	if (gap) {
		stats.explained.brawnGapPositions++
	}
	for (const [s, ms] of refBySig) {
		if (bySig.has(s)) {
			continue
		}
		const why = cutReason(w, side, s)
		if (why) {
			stats.explained[why]++
			example(ctx, why, sigText(x.md, s))
		} else {
			const m = ms[0]
			const kind = m.length === 4 ? 'castle' : m.length === 3 ? 'ep' : m[1][4] ? 'promo' : ''
			finding(ctx, 'only5dChess', { move: sigText(x.md, s), moveKind: kind, sig: s })
		}
	}
	// the moves both have, with 5d-chess-js's version promoting to a queen
	const common = []
	for (const [s, m] of bySig) {
		const ms = refBySig.get(s)
		if (!ms) {
			continue
		}
		const r = ms.find((q) => q.length !== 2 || !q[1][4] || QUEENS.includes(q[1][4]))
		if (r) {
			common.push([m, r])
		}
		stats.same[m.kind] = (stats.same[m.kind] ?? 0) + 1
	}
	return { mine, common }
}

/**
 * Compare may-submit and the check test.
 *
 * @param {object} ctx game context
 * @param {object} state state
 * @return {boolean} whether 5d-chess-js reports check
 */
function compareSubmitAndCheck(ctx, state) {
	const w = state.worlds[0].b
	const x = w.x
	const c = ctx.c
	const side = state.turn
	const mySubmit = canSubmit(x)
	const refSubmit = c.raw.boardFuncs.present(c.rawBoard, c.rawAction).length === 0
	const coreSubmit = Q.legalMoves(V, state).some((m) => m.code === 'submit')
	if (mySubmit !== refSubmit || coreSubmit !== mySubmit) {
		finding(ctx, 'submit', { mine: mySubmit, core: coreSubmit, ref: refSubmit })
	}
	// the phantom: the waiting side's moves after the side to move passed its must-move boards
	const pass = phantomPass(x)
	const phantom = V.generate(w, 1 - side).filter((m) => m.capture >= 0 && ROYAL.has(w.ty[m.capture]))
	const danger = Q.royalDanger(V, state, side)
	if ((danger > 0) !== (phantom.length > 0)) {
		finding(ctx, 'dangerVsPhantom', { danger, phantom: phantom.map((m) => m.key) })
	}
	const mine = new Map(phantom.map((m) => [mySig(x, m, pass), m]))
	for (const [sg, m] of mine) {
		limitBreach(ctx, w, 1 - side, m, sg, pass)
	}
	const { list } = refChecks(c, PROMO_BOARD ? null : QUEENS)
	const ref = new Set(list.map((m) => refSig(c, x.md, m)))
	const lib = c.inCheck
	if (lib !== (ref.size > 0)) {
		// the library's own test uses the default promotion pieces: it misses a king capture by a promotion when the
		// board has no piece to promote to (the brawn gap)
		const libList = refChecks(c, null).list
		const libSigs = new Set(libList.map((m) => refSig(c, x.md, m)))
		const missed = list.filter((m) => !libSigs.has(refSig(c, x.md, m)))
		if (lib === (libList.length > 0) && missed.every((m) => m[1][4])) {
			stats.explained.checkBrawnGapLib++
		} else {
			finding(ctx, 'checkLibrary', { lib, queenChecks: ref.size })
		}
	}
	stats.checkMoves += ref.size
	if (ref.size) {
		stats.checks++
	}
	const onlyMine = [...mine.keys()].filter((s) => !ref.has(s)).filter((s) => {
		// with the default promotion pieces 5d-chess-js misses a royal capture by a promotion (the brawn gap)
		const m = mine.get(s)
		const pieces = PROMO_BOARD && m.promo ? c.raw.pieceFuncs.availablePromotionPieces(c.rawBoard) : null
		if (pieces && !pieces.some((p) => p % 2 !== side)) {
			stats.explained.checkBrawnGap = (stats.explained.checkBrawnGap ?? 0) + 1
			return false
		}
		return true
	})
	const onlyRef = [...ref].filter((s) => !mine.has(s))
	const unexplainedRef = onlyRef.filter((s) => {
		const why = cutReason(w, 1 - side, s, pass)
		if (why) {
			stats.explained.checkReach++
			return false
		}
		return true
	})
	if (onlyMine.length || unexplainedRef.length) {
		finding(ctx, 'check', {
			onlyModule: onlyMine.map((s) => mine.get(s).key),
			only5dChess: unexplainedRef.map((s) => sigText(x.md, s)),
			refInCheck: lib,
			danger,
		})
	}
	return ref.size > 0
}

/**
 * The stuck test: where its quick path does not decide, compare with the exact search.
 *
 * @param {object} ctx game context
 * @param {object} state state (no result)
 */
function compareStuck(ctx, state) {
	const w = state.worlds[0].b
	const x = w.x
	const must = mandatory(x)
	if (canSubmit(x) || must.length === 0) {
		return
	}
	const phys = new Set()
	for (const m of cachedGenerate(V, w, state.turn).values()) {
		if (m.kind === 'normal' || m.kind === 'double') {
			phys.add(m.extra.u)
		}
	}
	if (must.every((u) => phys.has(u))) {
		return
	}
	stats.stuck.quickFail++
	const exact = canFinish(w)
	if (exact === null) {
		stats.stuck.exactUnknown++
		return
	}
	const s = stuck(V, state)
	if (s === !exact) {
		stats.stuck.exactAgree++
	} else {
		finding(ctx, 'stuck', { stuck: s, exactCanFinish: exact })
	}
}

/**
 * A state that ended because a turn cannot be finished: the exact search must agree; at a turn start 5d-chess-js
 * must see checkmate (in check) or stalemate.
 *
 * @param {object} ctx game context
 * @param {object} state the ended state
 */
function compareStuckEnd(ctx, state) {
	stats.stuck.stuckEnds++
	const w = state.worlds[0].b
	const exact = canFinish(w)
	if (exact === true) {
		finding(ctx, 'stuckEnd', { reason: state.result.reason, exactCanFinish: true })
	}
	if (state.result.reason === 'stranded') {
		return
	}
	const c = ctx.c
	const inCheck = refChecks(c, PROMO_BOARD ? null : QUEENS).list.length > 0
	if ((state.result.reason === 'checkmate') !== inCheck) {
		finding(ctx, 'stuckReason', { reason: state.result.reason, refInCheck: inCheck })
	}
	const M = c.raw.mateFuncs
	const latest = c.rawBoardHistory[c.rawBoardHistory.length - 1]
	const [mate, slow] = inCheck
		? M.checkmate(latest, c.rawAction, c.checkmateTimeout)
		: M.stalemate(latest, c.rawAction, c.checkmateTimeout)
	if (slow) {
		stats.stuck.refMateTimeout++
	} else if (mate) {
		stats.stuck.refMateAgree++
	} else {
		// 5d-chess-js finds a legal turn: it must need a move the module leaves out (the cap or the reach)
		const esc = refEscape(ctx, w)
		const cut = esc && typeof esc === 'object' ? [...new Set(esc.cut)] : []
		if (cut.length && cut.every((k) => ['cap', 'reach', 'reachPath'].includes(k))) {
			const k = 'refEscapes:' + cut.sort().join('+')
			stats.stuck[k] = (stats.stuck[k] ?? 0) + 1
			if (VERBOSE) {
				console.log('ESCAPE', ctx.setup, JSON.stringify(esc))
			}
		} else {
			finding(ctx, 'stuckVs5dChess', {
				reason: state.result.reason,
				refInCheck: inCheck,
				refMate: false,
				escape: esc,
			})
		}
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Random games
// ---------------------------------------------------------------------------------------------------------------

/**
 * One random game.
 *
 * @param {string} setup setup id
 * @param {number} game game number
 */
function playGame(setup, game) {
	const options = { setup, timelines: CAPS[game % CAPS.length], reach: REACHES[game % REACHES.length], view: 'white' }
	let state = Q.newGame(V, options)
	const c = refGame(setup)
	const ctx = { setup, options, game, step: 0, codes: [], c }
	for (let step = 0; step < PLIES && !state.result; step++) {
		ctx.step = step
		const w = state.worlds[0].b
		const x = w.x
		const side = state.turn
		stats.positions++
		stats.perSetup[setup].positions++
		if (x.t === 0) {
			stats.turnStarts++
		}
		const before = stats.unexplained
		compareBoards(ctx, w)
		const { mine, common } = compareMoves(ctx, state)
		compareSubmitAndCheck(ctx, state)
		compareStuck(ctx, state)
		if (stats.unexplained > before + 20) {
			break
		}
		// choose: Submit, or a travel move, a capture, a special move, or any move
		const submit = canSubmit(x)
		if (submit && (rng() < 0.35 || common.length === 0)) {
			const next = Q.applyMove(V, state, 'submit', 0)
			if (!next) {
				finding(ctx, 'coreRefuses', { move: 'submit' })
				break
			}
			refSubmit(c)
			ctx.codes.push('submit')
			stats.submits++
			stats.plies++
			state = next.state
			if (state.result) {
				endOf(ctx, state)
			}
			continue
		}
		if (common.length === 0) {
			// with the default promotion pieces 5d-chess-js may have no queen promotion for the module's only moves
			if (!state.result && mine.length && !(PROMO_BOARD && mine.every((m) => m.promo))) {
				finding(ctx, 'noCommonMove', { mine: mine.length })
			}
			break
		}
		// captures of a royal piece end the game: mostly left out, so that games get long
		const royal = ([m]) => m.capture >= 0 && ROYAL.has(w.ty[m.capture])
		const quiet = rng() < 0.95 && common.some((p) => !royal(p)) ? common.filter((p) => !royal(p)) : common
		const pools = [
			quiet.filter(([m]) => m.kind === 'hop' || m.kind === 'branch'),
			quiet.filter(([m]) => m.capture >= 0 || m.kind === 'castle' || m.kind === 'ep' || m.promo),
			quiet,
		]
		const r = rng()
		const pool = r < TRAVEL && pools[0].length
			? pools[0]
			: r < TRAVEL + 0.15 && pools[1].length ? pools[1] : pools[2]
		let pick = pool[Math.floor(rng() * pool.length)]
		let next = Q.applyMove(V, state, pick[0].key, 0)
		if (!next) {
			finding(ctx, 'coreRefuses', { move: pick[0].key })
			break
		}
		// a move that strands the mover ends the game: check it, then try others
		for (let tries = 0; next.state.result?.reason === 'stranded' && tries < 6; tries++) {
			const exact = canFinish(next.state.worlds[0].b)
			stats.stuck.stuckEnds++
			if (exact === true) {
				finding(ctx, 'strandedButFinishable', { move: pick[0].key })
			}
			pick = common[Math.floor(rng() * common.length)]
			next = Q.applyMove(V, state, pick[0].key, 0)
			if (!next) {
				finding(ctx, 'coreRefuses', { move: pick[0].key })
				break
			}
		}
		if (!next) {
			break
		}
		const [m, rm] = pick
		ctx.codes.push(m.key)
		c.move(rm)
		stats.plies++
		if (m.kind === 'hop' || m.kind === 'branch') {
			stats.travel++
		}
		if (m.kind === 'branch') {
			stats.branches++
		}
		if (m.kind === 'castle') {
			stats.castles++
		}
		if (m.kind === 'ep') {
			stats.enPassants++
		}
		if (m.promo) {
			stats.promotions++
		}
		state = next.state
		const x2 = state.worlds[0].b.x
		if (x2.s !== side && x2.k < 0) {
			// the module passed the turn by itself: 5d-chess-js must be able to submit
			stats.autoEnds++
			if (c.raw.boardFuncs.present(c.rawBoard, c.rawAction).length !== 0) {
				finding(ctx, 'autoEnd', { move: m.key })
				break
			}
			refSubmit(c)
		}
		if (state.result) {
			endOf(ctx, state)
		}
	}
	stats.games++
}

/**
 * The end of a game: count its result and check a stuck ending.
 *
 * @param {object} ctx game context
 * @param {object} state ended state
 */
function endOf(ctx, state) {
	const reason = state.result.reason
	stats.results[reason] = (stats.results[reason] ?? 0) + 1
	if (['checkmate', 'stalemate', 'stranded'].includes(reason)) {
		compareBoards(ctx, state.worlds[0].b)
		compareStuckEnd(ctx, state)
	}
}

const t0 = Date.now()
for (const setup of SETUP_LIST) {
	stats.perSetup[setup] = { positions: 0, unexplained: 0 }
	const t1 = Date.now()
	for (let g = 0; g < GAMES; g++) {
		playGame(setup, g)
	}
	const p = stats.perSetup[setup]
	const took = ((Date.now() - t1) / 1000).toFixed(1) + ' s'
	console.log(setup.padEnd(14), 'positions', String(p.positions).padStart(5), 'unexplained', p.unexplained, took)
}
stats.seconds = Math.round((Date.now() - t0) / 1000)
stats.promo = PROMO_BOARD ? 'board' : 'queen'
console.log(JSON.stringify({ ...stats, perSetup: undefined }, null, 1))
if (process.env.EXAMPLES) {
	for (const [why, e] of Object.entries(examples)) {
		console.log('EXAMPLE', why, JSON.stringify(e))
	}
}
for (const f of findings) {
	console.log('FINDING', JSON.stringify(f))
}
