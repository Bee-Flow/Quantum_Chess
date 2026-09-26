/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Writes multiverse-cross.json, the fixture of tests/js/variants/multiverse-cross.spec.js: random classical games (one
 * world, no splits) on every setup of multiverse chess, played in step with 5d-chess-js 1.2.1, an independent
 * implementation of 5D chess, and at every position what 5d-chess-js says: the number of legal moves of the side to
 * move and a hash of their sorted list, the boards that must move, whether the turn may be submitted, and the 5D check
 * (the opponent's royal captures after the must-move boards are passed).
 *
 * 5d-chess-js is not a dependency of the app. Run with the library installed next to the app's modules, or with
 * `FIVED_CHESS_JS` pointing at its `dist/5d-chess.js`:
 *
 *   npm install --no-save 5d-chess-js@1.2.1
 *   node tests/js/variants/fixtures/multiverse-cross.mjs [games per setup = 1] [plies = 36] [seed = 11]
 *
 * The games follow the moves both engines have. At every position every difference between the two move lists must be
 * one of the deliberate differences of the app (docs/variants.md, "Multiverse chess (5D)"): moves only 5d-chess-js
 * has because the app limits the new timelines (the test finds those itself by lifting the cap) or seals boards older
 * than the travel reach (listed as `reach` with the move), and moves only the app has because it allows castling in
 * danger (`castle`) or knows en passant from the double step itself (`epOccupied`, `epNoBoard`). Anything else stops
 * the generator with the position, so a fixture is only written when the two engines agree. Promotion is to a queen
 * only in both, as in the original game.
 *
 * Moves are written engine-neutral as `l:v:xy>l:v:xy` for the source and target: the timeline `l` (0, +1 = 1, −1 =
 * −1; an even start has −0 = −1 and +0 = 0), the half-turn index `v` (T1 White to move is 2, T1 Black 3) and the cell
 * (file, rank from 0). Deterministic: the same code and seed give the same bytes.
 */

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as Q from '../../../../src/variants/core/quantum.js'
import V from '../../../../src/variants/multiverse.js'
import { phantomPass } from '../../../../src/variants/multiverse/moves.js'
import { ROYAL } from '../../../../src/variants/multiverse/pieces.js'
import { SETUP_ORDER, SETUPS } from '../../../../src/variants/multiverse/setup.js'
import { canSubmit, decode, lOf, mandatory, slotAt, sqOf } from '../../../../src/variants/multiverse/skeleton.js'
import { appMoves, digest, reachCut, sig } from './multiverse-cross-lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'multiverse-cross.json')
const require = createRequire(import.meta.url)
const Chess = require(process.env.FIVED_CHESS_JS ?? '5d-chess-js')

const [gamesArg = '1', pliesArg = '36', seedArg = '11'] = process.argv.slice(2)
const GAMES = Number(gamesArg)
const PLIES = Number(pliesArg)
/** The travel reach and the cap of new timelines per game, in turn: both limits and both reaches are exercised. */
const LIMITS = [['auto', '3'], ['4', '1'], ['2', '2'], ['4', '4']]
/** 5d-chess-js's built-in boards (loaded by name; every other setup is loaded from its 5DFEN). */
const BUILTIN = {
	standard: 'standard',
	defended: 'defended_pawn',
	halfreflected: 'half_reflected',
	princess: 'princess',
	reversed: 'reversed_royalty',
	turnzero: 'turn_zero',
	twotimelines: 'two_timelines',
}
/** Queen codes of 5d-chess-js: White 10, Black 9. */
const QUEENS = [10, 9]

/** Coverage counts, printed at the end. */
const stats = { moves: 0, cap: 0, reach: 0, promotions: 0, kinds: {} }

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

/**
 * The line of a raw 5d-chess-js timeline index (0, 2, 4 … are 0, +1, +2; 1, 3 … are −1, −2; an even start has 1 = −0,
 * 2 = +0, 3 = −1, 4 = +1).
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
 * The 5DFEN of a setup for 5d-chess-js: every king, rook, pawn and brawn unmoved, each row with its line and first
 * board.
 *
 * @param {string} id setup id
 * @return {string}
 */
function customFen(id) {
	const S = SETUPS[id]
	const star = (f) => f.replace(/[KRPWkrpw]/g, (c) => c + '*')
	const label = (l) => (S.md === 1 ? (l < 0 ? '-0' : '+0') : String(l))
	const rows = S.rows.map(([l, f, v = 2]) => `[${star(f)}:${label(l)}:${v >> 1}:${'wb'[v & 1]}]`)
	return '[Size "' + S.n + 'x' + S.n + '"]\n[Board "custom"]\n' + rows.join('\n')
}

/**
 * A 5d-chess-js game of a setup, promoting to queens only.
 *
 * @param {string} id setup id
 * @return {object}
 */
function refGame(id) {
	const c = BUILTIN[id] ? new Chess(null, BUILTIN[id]) : new Chess(customFen(id))
	c.skipDetection = true
	c.rawPromotionPieces = QUEENS.slice()
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
 * Why 5d-chess-js does not have a move of the app: castling while the king or a square it crosses is attacked on its
 * board (5d-chess-js's own test), en passant after a double step whose victim square was occupied one turn earlier
 * (5d-chess-js infers en passant from that board) or whose board one turn earlier does not exist; null otherwise.
 *
 * @param {object} c 5d-chess-js game
 * @param {object} w world
 * @param {object} m the app's move
 * @return {string|null}
 */
function onlyAppReason(c, w, m) {
	const x = w.x
	const e = m.extra
	const f = decode(m.from)
	if (m.kind === 'castle') {
		const md = x.md
		const l = lOf(e.u, md)
		const raw = md === 1 ? (l >= 0 ? 2 * l + 2 : -2 * l - 1) : l >= 0 ? 2 * l : -2 * l - 1
		const t = x.tl[e.u][1] - rawToV(c, 0)
		const dir = e.tx > f.x ? 1 : -1
		const B = c.raw.boardFuncs
		const attacked = (i) => B.positionIsAttacked(c.rawBoard, [raw, t, f.y, f.x + i * dir], x.s)
		return [0, 1, 2].some(attacked) ? 'castle' : null
	}
	if (m.kind === 'ep') {
		const v = x.tl[e.u][1]
		if (v - 2 < x.tl[e.u][0]) {
			return 'epNoBoard'
		}
		return w.board[sqOf(e.u, slotAt(x, e.u, v - 2), e.tx, f.y)] >= 0 ? 'epOccupied' : null
	}
	return null
}

/**
 * 5d-chess-js's 5D check: the opponent's moves that capture a royal piece of the side to move after its present
 * boards are passed.
 *
 * @param {object} c 5d-chess-js game
 * @param {number} md start mode
 * @return {Set<string>}
 */
function refChecks(c, md) {
	const B = c.raw.boardFuncs
	const tmp = B.copy(c.rawBoard)
	c.raw.mateFuncs.blankAction(tmp, c.rawAction)
	const color = c.rawAction % 2
	const out = new Set()
	for (const m of B.moves(tmp, c.rawAction + 1, false, false, false, QUEENS)) {
		if (m.length === 2 && B.positionExists(tmp, m[1])) {
			const p = Math.abs(tmp[m[1][0]][m[1][1]][m[1][2]][m[1][3]])
			if ((p === 11 || p === 12 || p === 19 || p === 20) && p % 2 === color) {
				out.add(refSig(c, md, m))
			}
		}
	}
	return out
}

/**
 * Submit in 5d-chess-js whatever its check test says (the app has no check rule).
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

/**
 * Stop with a position where the engines differ in a way the app does not explain.
 *
 * @param {object} game the game so far
 * @param {string} what the difference
 */
function fail(game, what) {
	const { setup, reach, timelines, codes } = game
	throw new Error(what + '\n' + JSON.stringify({ setup, reach, timelines, codes }))
}

/**
 * Compare one position and record it.
 *
 * @param {object} game the game so far
 * @param {object} c 5d-chess-js game
 * @param {object} state the app's state
 * @return {Array} the moves both engines have, as [app move, raw 5d-chess-js move]
 */
function position(game, c, state) {
	const w = state.worlds[0].b
	const x = w.x
	const md = x.md
	const side = state.turn
	const mine = appMoves(w, side)
	const lifted = appMoves(w, side, { lift: true })
	const ref = new Map()
	for (const m of c.moves('raw', false, false)) {
		const s = refSig(c, md, m)
		if (!ref.has(s) || (m.length === 2 && QUEENS.includes(m[1][4]))) {
			ref.set(s, m)
		}
	}
	const entry = { i: game.codes.length }
	const reach = []
	for (const s of ref.keys()) {
		if (!lifted.has(s)) {
			const why = reachCut(w, s)
			if (!why) {
				fail(game, 'only 5d-chess-js has ' + s)
			}
			reach.push(s)
		}
	}
	for (const s of lifted.keys()) {
		if (!mine.has(s) && ref.has(s)) {
			stats.cap++
		}
	}
	const only = []
	for (const [s, m] of lifted) {
		if (!ref.has(s)) {
			const why = onlyAppReason(c, w, m)
			if (!why) {
				fail(game, 'only the app has ' + m.key)
			}
			only.push([s, why])
		}
	}
	const [count, hash] = digest(ref.keys())
	entry.n = count
	entry.h = hash
	entry.m = c.raw.boardFuncs.present(c.rawBoard, c.rawAction).map((p) => rawToL(p, md)).sort((a, b) => a - b)
	if (entry.m.length === 0) {
		entry.s = 1
	}
	if (canSubmit(x) !== (entry.s === 1)) {
		fail(game, 'may submit differs')
	}
	if (mandatory(x).map((u) => lOf(u, md)).sort((a, b) => a - b).join() !== entry.m.join()) {
		fail(game, 'must-move boards differ')
	}
	// the 5D check, also with the cap lifted
	const pass = phantomPass(x)
	const checks = refChecks(c, md)
	const mineChecks = new Set([...appMoves(w, 1 - side, { lift: true, pass }).entries()]
		.filter(([, m]) => m.capture >= 0 && ROYAL.has(w.ty[m.capture]))
		.map(([s]) => s))
	const checkReach = []
	for (const s of checks) {
		if (!mineChecks.has(s)) {
			if (!reachCut(w, s, pass)) {
				fail(game, 'only 5d-chess-js sees the check ' + s)
			}
			checkReach.push(s)
		}
	}
	for (const s of mineChecks) {
		if (!checks.has(s)) {
			fail(game, 'only the app sees the check ' + s)
		}
	}
	if (checks.size) {
		entry.k = digest(checks)
	}
	if (reach.length) {
		entry.r = reach.sort()
	}
	if (checkReach.length) {
		entry.kr = checkReach.sort()
	}
	if (only.length) {
		entry.o = only.sort((a, b) => (a[0] < b[0] ? -1 : 1))
	}
	game.positions.push(entry)
	const common = []
	for (const [s, m] of mine) {
		if (ref.has(s)) {
			common.push([m, ref.get(s)])
			stats.kinds[m.kind] = (stats.kinds[m.kind] ?? 0) + 1
			stats.promotions += m.promo ? 1 : 0
		}
	}
	stats.moves += ref.size
	stats.reach += reach.length
	return common
}

/**
 * One random game in step with 5d-chess-js.
 *
 * @param {string} setup setup id
 * @param {number} g game number
 * @return {object}
 */
function playGame(setup, g) {
	const [reach, timelines] = LIMITS[(g + SETUP_ORDER.indexOf(setup)) % LIMITS.length]
	const game = { setup, reach, timelines, codes: [], positions: [] }
	let state = Q.newGame(V, { setup, timelines, reach, view: 'white' })
	const c = refGame(setup)
	for (let ply = 0; ply < PLIES && !state.result; ply++) {
		const w = state.worlds[0].b
		const x = w.x
		const side = state.turn
		const common = position(game, c, state)
		if (canSubmit(x) && (rng() < 0.35 || common.length === 0)) {
			state = Q.applyMove(V, state, 'submit', 0).state
			refSubmit(c)
			game.codes.push('submit')
			continue
		}
		if (common.length === 0) {
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
		const pool = r < 0.3 && pools[0].length ? pools[0] : r < 0.45 && pools[1].length ? pools[1] : pools[2]
		let pick = pool[Math.floor(rng() * pool.length)]
		let next = Q.applyMove(V, state, pick[0].key, 0)
		// a move that strands the mover ends the game: try others
		for (let tries = 0; next?.state.result?.reason === 'stranded' && tries < 6; tries++) {
			pick = common[Math.floor(rng() * common.length)]
			next = Q.applyMove(V, state, pick[0].key, 0)
		}
		if (!next) {
			fail(game, 'the app refuses ' + pick[0].key)
		}
		game.codes.push(pick[0].key)
		c.move(pick[1])
		state = next.state
		const x2 = state.worlds[0].b.x
		if (x2.s !== side && x2.k < 0) {
			// the app passed the turn by itself: 5d-chess-js submits
			if (c.raw.boardFuncs.present(c.rawBoard, c.rawAction).length !== 0) {
				fail(game, 'the app ended the turn, 5d-chess-js cannot submit')
			}
			refSubmit(c)
		}
	}
	if (!state.result) {
		position(game, c, state)
	}
	return game
}

const games = []
for (const setup of SETUP_ORDER) {
	for (let g = 0; g < GAMES; g++) {
		games.push(playGame(setup, g))
	}
}

/**
 * The fixture as text: one game per block, its codes and positions wrapped at 120 columns, tabs for indentation.
 *
 * @return {string}
 */
function format() {
	const wrap = (items, indent) => {
		const lines = []
		let line = ''
		for (const item of items) {
			const text = JSON.stringify(item)
			if (line && 4 * indent + line.length + text.length + 2 > 120) {
				lines.push(line)
				line = ''
			}
			line += (line ? ' ' : '') + text + ','
		}
		if (line) {
			lines.push(line)
		}
		return lines.map((l, i) => '\t'.repeat(indent) + (i === lines.length - 1 ? l.slice(0, -1) : l)).join('\n')
	}
	// a position on one line, or with its lists of differences on lines of their own when it would be too long
	const entry = (p) => {
		const one = '\t\t\t\t' + JSON.stringify(p)
		if (one.replace(/\t/g, '    ').length <= 120) {
			return one
		}
		const { r, kr, o, ...head } = p
		const lists = Object.entries({ r, kr, o }).filter(([, v]) => v)
		const text = JSON.stringify(head).slice(0, -1) + ','
		return '\t\t\t\t' + text + '\n' + lists.map(([k, v], i) => `\t\t\t\t\t"${k}": [\n${wrap(v, 6)}\n\t\t\t\t\t]`
			+ (i === lists.length - 1 ? '}' : ',')).join('\n')
	}
	const blocks = games.map((g) => [
		'\t\t{',
		`\t\t\t"setup": ${JSON.stringify(g.setup)}, "reach": ${JSON.stringify(g.reach)}, `
		+ `"timelines": ${JSON.stringify(g.timelines)},`,
		'\t\t\t"codes": [',
		wrap(g.codes, 4),
		'\t\t\t],',
		'\t\t\t"positions": [',
		g.positions.map(entry).join(',\n'),
		'\t\t\t]',
		'\t\t}',
	].join('\n'))
	return [
		'{',
		'\t"reference": "5d-chess-js 1.2.1",',
		`\t"seed": ${Number(seedArg)},`,
		'\t"games": [',
		blocks.join(',\n'),
		'\t]',
		'}',
		'',
	].join('\n')
}

const text = format()
writeFileSync(OUT, text)
const positions = games.reduce((a, g) => a + g.positions.length, 0)
const count = (key) => games.reduce((a, g) => a + g.positions.filter((p) => p[key]).length, 0)
console.log(`${games.length} games, ${positions} positions, ${(text.length / 1024).toFixed(0)} KB; positions with `
	+ `reach cuts ${count('r')}, check ${count('k')}, moves only the app has ${count('o')}`)
console.log(JSON.stringify(stats))
