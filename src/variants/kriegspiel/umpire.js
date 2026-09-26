/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What a Kriegspiel player knows and what the umpire says (docs/variants.md, Kriegspiel):
 * the squares a side sees, the board as a side knows it (every enemy piece removed), the moves a player may try, and
 * the announcement after every move: captures with their square and whether a pawn or a piece was taken, check with
 * its directions and its chance, and the number of pawn tries of the side to move.
 */

import { n, t } from '@nextcloud/l10n'
import { ordinaryMoves, royalDanger } from '../core/quantum.js'
import { sideName } from '../core/variant.js'
import { cloneWorld, generate, OFF, pieceMoves, placePiece, worldKey } from '../core/world.js'

/** The check directions in the order in which they are announced. */
export const DIRECTIONS = Object.freeze(['file', 'rank', 'long', 'short', 'knight'])

/** The own views already built: state → Map(side → view). States never change, so a view never goes stale. */
const viewCache = new WeakMap()

/**
 * The squares a side sees: the squares where one of its pieces stands in at least one possibility.
 *
 * @param {object} state state
 * @param {number} side side index
 * @return {Set<number>}
 */
export function visibility(state, side) {
	const out = new Set()
	for (const { b } of state.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.sq[id] >= 0) {
				out.add(b.sq[id])
			}
		}
	}
	return out
}

/**
 * A world as `side` knows it: every other side's piece is off the board (and shown as a pawn, so that not even a
 * promotion can be read from it), no en passant square, and only `side`'s castling rights. Piece ids are kept, so
 * the own pieces have the same ids as in the real world.
 *
 * @param {object} b world
 * @param {number} side side index
 * @return {object}
 */
function ownWorld(b, side) {
	const c = cloneWorld(b)
	for (let id = 0; id < c.sq.length; id++) {
		if (c.sd[id] !== side) {
			placePiece(c, id, OFF)
			c.ty[id] = 'p'
		}
	}
	c.x = { ...c.x, ep: -1, epVictim: -1, castle: (c.x.castle ?? []).filter((r) => r.side === side) }
	return c
}

/**
 * The state as `side` knows it: the real worlds without the enemy pieces, identical worlds merged (their weights
 * added). The turn and the ply are kept; the history is dropped and the quiet counter is 0, because the opponent's
 * pawn moves, which reset it, are never announced. Built once per state and side.
 *
 * @param {object} state state
 * @param {number} side side index
 * @return {object}
 */
export function ownView(state, side) {
	let perSide = viewCache.get(state)
	if (perSide === undefined) {
		perSide = new Map()
		viewCache.set(state, perSide)
	}
	let view = perSide.get(side)
	if (view === undefined) {
		const byKey = new Map()
		for (const { b, w } of state.worlds) {
			const c = ownWorld(b, side)
			const k = worldKey(c)
			const e = byKey.get(k)
			if (e) {
				e.w += w
			} else {
				byKey.set(k, { b: c, w })
			}
		}
		view = { ...state, worlds: [...byKey.values()], history: [], quiet: 0 }
		perSide.set(side, view)
	}
	return view
}

/**
 * The moves the side to move may try (the umpire decides on the real state): every move its pieces could make if the
 * enemy pieces were not there, plus the pawn tries, the diagonal pawn captures onto squares that are empty on its own
 * board (an enemy piece, or an en passant capture, might be there). Each `{ code, type: 'move', from, to, promo,
 * drop, kind }`, one per key; `kind` is `try` for a pawn try.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {object[]}
 */
export function candidateMoves(V, state) {
	if (state.result) {
		return []
	}
	const side = state.turn
	const own = ownView(state, side)
	const byKey = new Map()
	for (const m of ordinaryMoves(V, own)) {
		byKey.set(m.code, candidate(m.code, m, m.kind))
	}
	const tries = []
	for (const { b } of own.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.sq[id] >= 0 && hasCaptureOnlyMove(V, b.ty[id])) {
				pieceMoves(V, b, id, tries, { ghostEnemies: true })
			}
		}
	}
	for (const m of tries) {
		if (m.kind === 'try' && !byKey.has(m.key)) {
			byKey.set(m.key, candidate(m.key, m, 'try'))
		}
	}
	return [...byKey.values()]
}

/**
 * A candidate move for the board: `{ code, type: 'move', from, to, promo, drop: null, kind }`.
 *
 * @param {string} code move code
 * @param {{from: number, to: number, promo: string|null}} m the move
 * @param {string} kind move kind
 * @return {object}
 */
function candidate(code, m, kind) {
	return { code, type: 'move', from: m.from, to: m.to, promo: m.promo, drop: null, kind }
}

/**
 * Whether a piece type has a move that only captures (the pawn's diagonal step): only such pieces have tries.
 *
 * @param {object} V variant
 * @param {string} type piece type
 * @return {boolean}
 */
export function hasCaptureOnlyMove(V, type) {
	return Boolean(V.types[type]?.moves.some((d) => d.mode === 'capture'))
}

/**
 * The number of squares on the diagonal through `(f, r)` that goes in direction `(1, s)` and back.
 *
 * @param {number} f file index
 * @param {number} r rank index
 * @param {number} s 1 for the rising diagonal, -1 for the falling one
 * @param {number} files number of files
 * @param {number} ranks number of ranks
 * @return {number}
 */
function diagonalLength(f, r, s, files, ranks) {
	const up = s > 0 ? ranks - 1 - r : r
	const down = s > 0 ? r : ranks - 1 - r
	return Math.min(files - 1 - f, up) + Math.min(f, down) + 1
}

/**
 * The direction of a check "from the king's point of view": the attacker on `from` stands on the king's rank, file,
 * long or short diagonal (the longer and the shorter of the two diagonals through the king's square), or it is a
 * knight (anything else).
 *
 * @param {object} V variant
 * @param {number} king the king's square
 * @param {number} from the attacker's square
 * @return {string} one of `DIRECTIONS`
 */
export function checkDirection(V, king, from) {
	const [f, r] = V.topology.coords[king]
	const [ff, fr] = V.topology.coords[from]
	const dx = ff - f
	const dy = fr - r
	if (dy === 0) {
		return 'rank'
	}
	if (dx === 0) {
		return 'file'
	}
	if (Math.abs(dx) !== Math.abs(dy)) {
		return 'knight'
	}
	const { files, ranks } = boardSize(V)
	const mine = diagonalLength(f, r, Math.sign(dx) * Math.sign(dy), files, ranks)
	const other = diagonalLength(f, r, -Math.sign(dx) * Math.sign(dy), files, ranks)
	return mine > other ? 'long' : 'short'
}

/**
 * Whether square `sq` lies on the line of a check direction through the king's square `king` (the square itself
 * included): its rank, its file, its long or short diagonal, or, for a knight check, the square itself.
 *
 * @param {object} V variant
 * @param {number} king the king's square when the check was announced
 * @param {number} sq a square
 * @param {string} dir one of `DIRECTIONS`
 * @return {boolean}
 */
export function onCheckLine(V, king, sq, dir) {
	if (sq === king) {
		return true
	}
	const [f, r] = V.topology.coords[king]
	const [ff, fr] = V.topology.coords[sq]
	if (dir === 'rank') {
		return fr === r
	}
	if (dir === 'file') {
		return ff === f
	}
	if (dir === 'knight' || Math.abs(ff - f) !== Math.abs(fr - r)) {
		return false
	}
	return checkDirection(V, king, sq) === dir
}

/**
 * The size of the (rectangular) board: `{ files, ranks }`.
 *
 * @param {object} V variant
 * @return {{files: number, ranks: number}}
 */
function boardSize(V) {
	let files = 0
	let ranks = 0
	for (const [f, r] of V.topology.coords) {
		files = Math.max(files, f + 1)
		ranks = Math.max(ranks, r + 1)
	}
	return { files, ranks }
}

/**
 * The check of the side to move of a state: `{ dirs, p }` when one enemy move (a merge included) could capture its
 * king in some possibility, else null. `dirs` are the directions of every capturing move in every world, in the
 * order of `DIRECTIONS`; `p` is the quantum layer's `royalDanger`. Both come from the same enemy moves, so the check
 * is announced exactly when `p > 0` (the danger of a merge is carried by the ordinary move of each part).
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {{dirs: string[], p: number}|null}
 */
export function checkOf(V, state) {
	if (state.result) {
		return null
	}
	const side = state.turn
	const dirs = new Set()
	for (const { b } of state.worlds) {
		for (let e = 0; e < V.sideCount; e++) {
			if (!V.enemies(e, side)) {
				continue
			}
			for (const m of generate(V, b, e).values()) {
				if (m.capture >= 0 && b.sd[m.capture] === side && V.royalTypes.has(b.ty[m.capture])) {
					dirs.add(checkDirection(V, m.to, m.from))
				}
			}
		}
	}
	if (dirs.size === 0) {
		return null
	}
	return { dirs: DIRECTIONS.filter((d) => dirs.has(d)), p: royalDanger(V, state, side) }
}

/**
 * The pawn tries of the side to move: the number of distinct pairs of from and to squares among its legal ordinary
 * moves whose mover is a pawn and that capture in at least one possibility (en passant included; the promotions of
 * one capture count once). 0 when the game is over.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {number}
 */
export function pawnTries(V, state) {
	if (state.result) {
		return 0
	}
	const legal = new Set(ordinaryMoves(V, state).map((m) => m.code))
	const pairs = new Set()
	for (const { b } of state.worlds) {
		for (const m of generate(V, b, state.turn).values()) {
			if (m.capture >= 0 && hasCaptureOnlyMove(V, b.ty[m.id]) && legal.has(m.key)) {
				pairs.add(m.from + ':' + m.to)
			}
		}
	}
	return pairs.size
}

/**
 * The captures of a played move as the umpire announces them: `[{ sq, kind }]` with the square name of the captured
 * unit and `kind` `king`, `pawn` or `piece`. The square is where the captured unit stood, so an en passant capture is
 * announced on the passing pawn's square, not on the square the capturing pawn moved to. Kings and pawns are solid,
 * so the kind is the same in every possibility.
 *
 * @param {object} V variant
 * @param {object} prev state before the move
 * @param {string} code move code
 * @param {object} branch the outcome that was played
 * @return {Array<{sq: string, kind: string}>}
 */
function capturesOf(V, prev, code, branch) {
	const out = []
	const seen = new Set()
	for (const X of branch.captures) {
		let sq = X
		let kind = 'piece'
		const ep = prev.worlds.find(({ b }) => {
			const m = generate(V, b, prev.turn).get(code)
			return m && m.kind === 'ep' && m.to === X && b.x.epVictim >= 0
		})
		if (ep) {
			sq = ep.b.x.epVictim
			kind = 'pawn'
		} else {
			for (const { b } of prev.worlds) {
				const occ = b.board[X]
				if (occ < 0 || !V.enemies(prev.turn, b.sd[occ])) {
					continue
				}
				if (V.royalTypes.has(b.ty[occ])) {
					kind = 'king'
					break
				}
				if (hasCaptureOnlyMove(V, b.ty[occ])) {
					kind = 'pawn'
				}
			}
		}
		const name = V.topology.names[sq]
		if (!seen.has(name)) {
			seen.add(name)
			out.push({ sq: name, kind })
		}
	}
	return out
}

/**
 * What the umpire announces to both players after a move: `{ captures, check, tries }` (see `checkOf` and
 * `pawnTries`; `check` and `tries` are those of the side to move of the new state). Never the move, its result,
 * promotions, castling, en passant as such, or whether the move was a split, a merge or a measurement.
 *
 * @param {object} V variant
 * @param {object} prev state before the move
 * @param {string} code move code
 * @param {object} branch the outcome that was played
 * @param {object} next state after the move
 * @return {{captures: Array<{sq: string, kind: string}>, check: object|null, tries: number}}
 */
export function announce(V, prev, code, branch, next) {
	return { captures: capturesOf(V, prev, code, branch), check: checkOf(V, next), tries: pawnTries(V, next) }
}

/**
 * The text of a chance, e.g. `50 %`; never 0 % or 100 % for a chance that is not certain.
 *
 * @param {number} p chance 0..1
 * @return {string}
 */
function percentText(p) {
	let v = Math.round(p * 100)
	if (p > 0 && v === 0) {
		v = 1
	}
	if (p < 1 && v === 100) {
		v = 99
	}
	return t('quantumchess', '{percent} %', { percent: v })
}

/**
 * The name of a check direction.
 *
 * @param {string} dir one of `DIRECTIONS`
 * @return {string}
 */
function directionText(dir) {
	switch (dir) {
		case 'file':
			// TRANSLATORS: Kriegspiel, the direction of a check: along the king's file (a column of the chessboard)
			return t('quantumchess', 'file')
		case 'rank':
			// TRANSLATORS: Kriegspiel, the direction of a check: along the king's rank (a row of the chessboard)
			return t('quantumchess', 'rank')
		case 'long':
			// TRANSLATORS: Kriegspiel, the direction of a check: the longer of the two diagonals through the king
			return t('quantumchess', 'long diagonal')
		case 'short':
			// TRANSLATORS: Kriegspiel, the direction of a check: the shorter of the two diagonals through the king
			return t('quantumchess', 'short diagonal')
		default:
			// TRANSLATORS: the piece; Kriegspiel also uses it as the direction of a check given by a knight
			return t('quantumchess', 'knight')
	}
}

/**
 * The umpire's lines for a move record (`record.info.announce`), the same for every viewer: who moved, each capture,
 * the check and the pawn tries of the side to move. No tries line after the move that ended the game
 * (`record.info.end`, or a king capture in a record without that mark): no turn follows it. Null for a record
 * without an announcement. `brief` (the move list) keeps only the lines that carry information: no "… moved." (the
 * row is the move) and no "No pawn tries.".
 *
 * @param {object} V variant
 * @param {object} record history record
 * @param {object} [opts] options
 * @param {boolean} [opts.brief] only the captures, the check and the pawn tries
 * @return {string[]|null}
 */
export function umpireLines(V, record, { brief = false } = {}) {
	const a = record?.info?.announce
	if (!a) {
		return null
	}
	// TRANSLATORS: Kriegspiel, the umpire's first line after a move; {side} is White or Black
	const lines = brief ? [] : [t('quantumchess', '{side} moved.', { side: sideName(V, record.side) })]
	let kingTaken = false
	for (const c of a.captures ?? []) {
		if (c.kind === 'king') {
			kingTaken = true
			lines.push(t('quantumchess', 'The king on {square} is captured.', { square: c.sq }))
		} else if (c.kind === 'pawn') {
			lines.push(t('quantumchess', 'Capture on {square}: a pawn.', { square: c.sq }))
		} else {
			lines.push(t('quantumchess', 'Capture on {square}: a piece.', { square: c.sq }))
		}
	}
	if (a.check) {
		lines.push(t('quantumchess', 'Check: {directions} ({percent}).', {
			directions: a.check.dirs.map(directionText).join(', '),
			percent: percentText(a.check.p),
		}))
	}
	if (!kingTaken && !record.info.end && (a.tries > 0 || !brief)) {
		// TRANSLATORS: Kriegspiel, the umpire: a pawn try is a pawn capture the player to move might be able to make
		lines.push(a.tries > 0
			? n('quantumchess', '%n pawn try.', '%n pawn tries.', a.tries)
			: t('quantumchess', 'No pawn tries.'))
	}
	return lines
}
