/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Bughouse: crazyhouse for four players on two boards, made turn-based. White A and Black B (Team 1) play against
 * White B and Black A (Team 2); the seats move in turn White A, White B, Black B, Black A. A captured piece goes to
 * the capturer's partner, who may drop it on an empty square of their own board; capturing any king ends the whole
 * game. Both boards are one topology (`[file, rank, board]`, squares `A:e4` and `B:e4`), each team shares one quantum
 * budget, and en passant belongs to the board where the pawn moved. The research spec is
 * handoff/research/bughouse.md.
 */

import { t } from '@nextcloud/l10n'
import { castlingMoves, orthodoxTypes, pawnExtras, unifyCastling } from './core/orthodox.js'
import { FILE_LETTERS, makeTopology } from './core/topology.js'
import { defineVariant, sideName } from './core/variant.js'
import { addPiece, dropKey, emptyWorld, HAND, handOf, OFF, placePiece } from './core/world.js'

/** Gap between the two drawn boards, in layout units. */
const GAP = 0.8
/** Left edge of board B in the drawing. */
const BX = 8 + GAP
/**
 * Height of the strip of file letters under the cells. Each board frame holds it, so that the board letter (drawn
 * above the frame in every view) never meets the file letters, which the half turn of Team 2's view puts above the
 * cells (as in raumschach).
 */
const STRIP = 0.6

// Square index = 64 × board + 8 × rank + file (the order of the coordinates below), so the coordinates of a square
// follow from its index.
const COORDS = []
for (let bd = 0; bd < 2; bd++) {
	for (let r = 0; r < 8; r++) {
		for (let f = 0; f < 8; f++) {
			COORDS.push([f, r, bd])
		}
	}
}

/**
 * The square of a file, rank and board.
 *
 * @param {number} f file index (0 = a)
 * @param {number} r rank index (0 = rank 1)
 * @param {number} bd board (0 = A, 1 = B)
 * @return {number}
 */
function at(f, r, bd) {
	return 64 * bd + 8 * r + f
}

/**
 * The rank index of a square.
 *
 * @param {number} sq square
 * @return {number}
 */
function rankOf(sq) {
	return (sq >> 3) & 7
}

/**
 * The board of a square (0 = A, 1 = B).
 *
 * @param {number} sq square
 * @return {number}
 */
function boardOfSq(sq) {
	return sq >> 6
}

/** The board of each seat: White A and Black A play on board A, White B and Black B on board B. */
const SEAT_BOARD = [0, 1, 1, 0]
/** The two teams: White A + Black B, White B + Black A. A seat's team is `seat % 2`. */
const TEAMS = [[0, 2], [1, 3]]

/**
 * The partner of a seat (same team, other board, other colour).
 *
 * @param {number} seat seat index
 * @return {number}
 */
function partner(seat) {
	return (seat + 2) % 4
}

/** The squares of each board, and those where a pawn may be dropped (not on rank 1 or 8). */
const BOARD_SQUARES = [0, 1].map((bd) => COORDS.map((c, sq) => sq).filter((sq) => boardOfSq(sq) === bd))
const PAWN_DROP_SQUARES = BOARD_SQUARES.map((list) => list.filter((sq) => rankOf(sq) !== 0 && rankOf(sq) !== 7))

// The drawing: board A as White A sees it on the left, board B turned half a turn on the right, so that the partners
// of Team 1 sit side by side at the bottom (White A bottom-left, Black B bottom-right), as over the board.
const labels = []
for (let i = 0; i < 8; i++) {
	labels.push({ x: i + 0.5, y: 8.32, text: FILE_LETTERS[i] })
	labels.push({ x: BX + (7 - i) + 0.5, y: 8.32, text: FILE_LETTERS[i] })
	labels.push({ x: -0.3, y: 7.5 - i, text: String(i + 1) })
	labels.push({ x: BX + 8.3, y: i + 0.5, text: String(i + 1) })
}

const topology = makeTopology({
	coords: COORDS,
	name: ([f, r, bd]) => (bd ? 'B' : 'A') + ':' + FILE_LETTERS[f] + (r + 1),
	cell: ([f, r, bd]) => ({
		x: bd ? BX + 7 - f : f,
		y: bd ? r : 7 - r,
		w: 1,
		h: 1,
		shape: 'rect',
		shade: (f + r) % 2 === 0 ? 'dark' : 'light',
	}),
	layout: {
		width: BX + 8,
		// the height includes the strip of file letters, so the drawing turns about its middle
		height: 8 + STRIP,
		// the whole drawing is small enough to show at once, but too wide for a phone: allow zooming in on a board
		zoomable: true,
		labels,
		boards: [{ x: 0, y: 0, w: 8, h: 8 + STRIP, label: 'A' }, { x: BX, y: 0, w: 8, h: 8 + STRIP, label: 'B' }],
	},
})

// One layout per seat: a wooden rim behind the board of the seat to move, and a focus on that board. The focus key
// names the seat, not the board: the view turns on every ply with auto-flip, and the board recentres only when the
// key changes, so a zoomed view follows the seat to move with the current rotation.
const ACTIVE = [0, 1, 2, 3].map((seat) => {
	const x = SEAT_BOARD[seat] ? BX : 0
	return {
		...topology,
		layout: {
			...topology.layout,
			areas: [{ x: x - 0.12, y: -0.12, w: 8.24, h: 8.24, shade: 'wood' }],
			focus: { x: x + 4, y: 4, key: 'seat' + seat },
		},
	}
})

/** Piece values for the computer (the crazyhouse estimate: minor pieces and pawns gain, heavy pieces lose). */
const VALUES = { k: 400, q: 420, r: 230, b: 200, n: 220, p: 100 }
/** The promoted types and their base types: a captured promoted piece is passed on as a pawn. */
const PROMOTED = { '+q': 'q', '+r': 'r', '+b': 'b', '+n': 'n' }
const PROMOTED_NAMES = {
	'+q': () => t('quantumchess', 'Promoted queen'),
	'+r': () => t('quantumchess', 'Promoted rook'),
	'+b': () => t('quantumchess', 'Promoted bishop'),
	'+n': () => t('quantumchess', 'Promoted knight'),
}

const types = orthodoxTypes({ lastRank: (side, sq) => rankOf(sq) === (side >= 2 ? 0 : 7) })
for (const [type, value] of Object.entries(VALUES)) {
	types[type].value = value
}
for (const [type, base] of Object.entries(PROMOTED)) {
	types[type] = { ...types[base], name: PROMOTED_NAMES[type], glyph: { sprite: base, promoted: true } }
}

/**
 * The castling rights of the start position: each seat castles on its own board, short (`K`/`k`) and long
 * (`Q`/`q`), in the shape `castlingMoves` and `unifyCastling` read.
 *
 * @return {object[]}
 */
function startRights() {
	const out = []
	for (let side = 0; side < 4; side++) {
		const bd = SEAT_BOARD[side]
		const r = side < 2 ? 0 : 7
		const king = at(4, r, bd)
		const [short, long] = side < 2 ? ['K', 'Q'] : ['k', 'q']
		out.push({ flag: short, side, king, rook: at(7, r, bd), kingTo: at(6, r, bd), rookTo: at(5, r, bd) })
		out.push({ flag: long, side, king, rook: at(0, r, bd), kingTo: at(2, r, bd), rookTo: at(3, r, bd) })
	}
	return out
}

/** Drop codes by type and square (built on first use). */
const DROP_KEYS = new Map()

/**
 * The code of a drop, cached.
 *
 * @param {string} type dropped type
 * @param {number} sq target square
 * @return {string}
 */
function dropCode(type, sq) {
	let keys = DROP_KEYS.get(type)
	if (keys === undefined) {
		keys = COORDS.map((c, s) => dropKey({ topology }, type, s))
		DROP_KEYS.set(type, keys)
	}
	return keys[sq]
}

/**
 * Whether two squares of one board are within king distance 2.
 *
 * @param {number} a square
 * @param {number} b square
 * @return {boolean}
 */
function near(a, b) {
	return Math.abs((a & 7) - (b & 7)) <= 2 && Math.abs(rankOf(a) - rankOf(b)) <= 2
}

// The computer's own material count (ai.js) is own + 0.5 × every non-enemy − the enemy (the opponent on the same
// board), with hand pieces at 0.8. `evaluate` adds the difference to team material: own + partner − both opponents,
// hand pieces at full value. Rows: the viewing seat; columns: the owner's relation to it (0 own, 1 partner, 2 the
// opponent on the same board, 3 the opponent on the other board).
const BOARD_TERM = [0, 0.5, 0, -1.5]
const HAND_TERM = [0.2, 0.6, -0.2, -1.4]
const RELATION = [0, 1, 2, 3].map((me) => [0, 1, 2, 3].map((o) => {
	if (o === me) {
		return 0
	}
	if (o === partner(me)) {
		return 1
	}
	return o === 3 - me ? 2 : 3
}))

const spec = {
	id: 'bughouse',
	category: 'rules',
	drops: true,
	sides: [
		{ id: 'aw', name: () => t('quantumchess', 'White A'), color: 'white', rotate: 0 },
		{ id: 'bw', name: () => t('quantumchess', 'White B'), color: 'white', rotate: 180 },
		{ id: 'bb', name: () => t('quantumchess', 'Black B'), color: 'black', rotate: 0 },
		{ id: 'ab', name: () => t('quantumchess', 'Black A'), color: 'black', rotate: 180 },
	],
	teams: TEAMS,
	topology,
	types,
	handOrder: ['p', 'n', 'b', 'r', 'q'],
	maxPly: 1200,
	quietPlies: 200,
	// a seat without any legal move waits for a piece from its partner: it sits out instead of ending the game
	passWhenStuck: true,
	// The classic end rules (docs/rules.md 5 and 6; LEAD-DECISIONS L1, which lists bughouse with the four-seat games).
	// "Your king cannot escape" is left out: the core's rule names the seat that just moved (half the time a seat of
	// the other board) as the only winner, while a bughouse game is won by a team. It would also end games too early:
	// the king of White A or Black B is taken only after the two moves of the other board, where the partner may still
	// capture a king first and win. The bare-kings draw is left out: it cannot happen, since a captured piece stays in
	// the game (in a hand) and only a captured king leaves it, which ends the game. The draws wait while the seat to
	// move can capture a king for certain, as in the classic game.
	escapeRule: false,
	bareKingsDraw: false,
	drawsWait: true,
	rules: () => [
		t('quantumchess', 'Two teams play on two boards: White A and Black B against White B and Black A.'),
		t(
			'quantumchess',
			'The seats move in turn: White A, White B, Black B, Black A. A player who cannot move sits out.',
		),
		t(
			'quantumchess',
			'What you capture goes to your partner, who may drop it on an empty square of their own board instead of moving. Pawns are never dropped on the first or last rank.',
		),
		t('quantumchess', 'A captured promoted piece (marked +) is passed on as a pawn.'),
		t(
			'quantumchess',
			'Capturing a king on either board ends the whole game: that king\'s team loses. A king that cannot escape does not lose at once: it must be captured.',
		),
		t(
			'quantumchess',
			'Your team shares one budget of 8, not 8 per player: your partner\'s ghosts count too.',
		),
		t(
			'quantumchess',
			'A drop onto a square where a ghost might stand is a roll. If the square is taken, the piece stays in your hand.',
		),
		t(
			'quantumchess',
			'A pawn dropped on your second rank may move two squares. A dropped rook never castles. En passant is only possible on the next turn of that board.',
		),
	],
	/**
	 * Only the two seats of one board face each other (pieces never leave their board, so no other pair can meet).
	 *
	 * @param {number} a seat
	 * @param {number} b seat
	 * @return {boolean}
	 */
	enemies(a, b) {
		return a + b === 3
	},
	/**
	 * Pawn vectors are written for White: the Black seats mirror the rank.
	 *
	 * @param {number} side seat
	 * @param {number[]} vec vector for White
	 * @return {number[]}
	 */
	orient(side, vec) {
		if (side < 2) {
			return vec
		}
		const v = vec.slice()
		v[1] = -v[1]
		return v
	},
	/**
	 * The orthodox start position on both boards, empty hands, every castling right, no en passant square.
	 *
	 * @return {object}
	 */
	setup() {
		const w = emptyWorld(spec)
		const back = 'rnbqkbnr'
		for (let side = 0; side < 4; side++) {
			const bd = SEAT_BOARD[side]
			const [br, pr] = side < 2 ? [0, 1] : [7, 6]
			for (let f = 0; f < 8; f++) {
				addPiece(w, back[f], side, at(f, br, bd))
			}
			for (let f = 0; f < 8; f++) {
				addPiece(w, 'p', side, at(f, pr, bd))
			}
		}
		w.x = { ep: [-1, -1], epVictim: [-1, -1], castle: startRights() }
		return w
	},
	/**
	 * Double steps and en passant on the seat's board, castling, and drops from the seat's hand onto the empty
	 * squares of its board.
	 *
	 * @param {object} w world
	 * @param {number} side seat
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		const bd = SEAT_BOARD[side]
		// the orthodox helper reads one en passant square: give it this board's
		const view = { ...w, x: { ep: w.x.ep[bd], epVictim: w.x.epVictim[bd] } }
		const out = pawnExtras(spec, view, side, (s, sq) => rankOf(sq) === (s >= 2 ? 6 : 1))
		if (w.x.castle?.length) {
			out.push(...castlingMoves(spec, w, side))
		}
		for (const [type, ids] of handOf(w, side)) {
			for (const sq of type === 'p' ? PAWN_DROP_SQUARES[bd] : BOARD_SQUARES[bd]) {
				if (w.board[sq] === -1) {
					out.push({
						key: dropCode(type, sq),
						from: -1,
						to: sq,
						id: ids[0],
						capture: -1,
						promo: null,
						drop: type,
						kind: 'drop',
					})
				}
			}
		}
		return out
	},
	/**
	 * A captured piece goes to the capturer's partner, in its own colour; a promoted piece becomes a pawn again. A
	 * captured king leaves the game (which ends it).
	 *
	 * @param {object} next the new world (mutable)
	 * @param {number} victim captured piece
	 * @param {object} m the capturing move
	 */
	onCapture(next, victim, m) {
		const type = next.ty[victim]
		if (type === 'k') {
			placePiece(next, victim, OFF)
			return
		}
		placePiece(next, victim, HAND)
		next.sd[victim] = partner(next.sd[m.id])
		next.ty[victim] = PROMOTED[type] ? 'p' : type
	},
	/**
	 * Per-board bookkeeping after a move: the en passant square of the board the move was played on (set after a
	 * double step, cleared after anything else), the castling rights, and the promoted type.
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 */
	afterMove(next, m) {
		const bd = boardOfSq(m.to)
		if (m.kind === 'double') {
			// same file, two ranks apart: the skipped square is the midpoint of the indexes
			next.x.ep[bd] = (m.from + m.to) / 2
			next.x.epVictim[bd] = m.to
		} else {
			next.x.ep[bd] = -1
			next.x.epVictim[bd] = -1
		}
		if (next.x.castle?.length) {
			next.x.castle = next.x.castle.filter((c) => !(m.from === c.king || m.from === c.rook || m.to === c.rook
				|| m.to === c.king))
		}
		if (m.promo) {
			next.ty[m.id] = '+' + m.promo
		}
	},
	/**
	 * A world where the seat's action did not take effect (a miss, a measurement, a skipped turn) still ends the en
	 * passant right of the seat's board; the other board keeps its own.
	 *
	 * @param {object} b world
	 * @param {object} action the action
	 * @param {number} side the seat whose turn it was
	 * @return {object}
	 */
	applyMiss(b, action, side) {
		const bd = SEAT_BOARD[side]
		if (b.x.ep[bd] === -1 && b.x.epVictim[bd] === -1) {
			return b
		}
		const ep = b.x.ep.slice()
		const epVictim = b.x.epVictim.slice()
		ep[bd] = -1
		epVictim[bd] = -1
		return { ...b, x: { ...b.x, ep, epVictim } }
	},
	/**
	 * A castling right survives only while every world has it.
	 *
	 * @param {object[]} bs worlds
	 * @return {object[]}
	 */
	unifyWorlds(bs) {
		return unifyCastling(bs)
	},
	/**
	 * Partners share one budget of 8.
	 *
	 * @param {object} b world
	 * @param {number} side seat
	 * @return {{sides: number[], limit: number}}
	 */
	budgetRule(b, side) {
		return { sides: [side, partner(side)], limit: 8 }
	},
	/**
	 * The hands, which are the same in every world (a guard: a difference would be settled like a solid piece).
	 *
	 * @param {object} b world
	 * @return {string}
	 */
	solidExtra(b) {
		const out = []
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sq[id] === HAND) {
				out.push(b.sd[id] + b.ty[id])
			}
		}
		return out.sort().join('')
	},
	/**
	 * The team of a captured king loses, on both boards.
	 *
	 * @param {object} b world
	 * @return {null|{winner: null, winners: number[], reason: string}}
	 */
	worldResult(b) {
		let kings = 0
		for (let id = 0; id < b.sq.length; id++) {
			if (b.ty[id] === 'k' && b.sq[id] >= 0) {
				kings |= 1 << b.sd[id]
			}
		}
		for (let s = 0; s < 4; s++) {
			if (!(kings & (1 << s))) {
				return { winner: null, winners: TEAMS[1 - (s % 2)].slice(), reason: 'king' }
			}
		}
		return null
	},
	/**
	 * One player resigns for the team.
	 *
	 * @param {object} state state
	 * @param {number} loser seat that resigns
	 * @return {{winner: null, winners: number[], reason: string}}
	 */
	resignResult(state, loser) {
		return { winner: null, winners: TEAMS[1 - (loser % 2)].slice(), reason: 'resign' }
	},
	/**
	 * The quiet draw counts drops too, over four players.
	 *
	 * @param {string} reason reason code
	 * @return {string|null}
	 */
	reasonText(reason) {
		return reason === 'quiet'
			? t('quantumchess', '50 moves by each player without a capture, a pawn move or a drop')
			: null
	},
	/**
	 * The team of a seat in its player row, with the partner as tooltip.
	 *
	 * @param {object} state state
	 * @param {number} side seat
	 * @return {{text: string, title: string}}
	 */
	sideInfo(state, side) {
		return {
			text: side % 2 === 0 ? t('quantumchess', 'Team 1') : t('quantumchess', 'Team 2'),
			title: t('quantumchess', 'Partner: {side}', { side: sideName(spec, partner(side)) }),
		}
	},
	/**
	 * The board of the seat to move is marked (and followed when zoomed in).
	 *
	 * @param {object} state state
	 * @return {object}
	 */
	layoutOf(state) {
		return state.result ? topology : ACTIVE[state.turn]
	},
	/**
	 * The computer answers with the opponent on its own board, who moves three plies later; the next seat plays on
	 * the other board.
	 *
	 * @param {object} s state after the computer's move
	 * @param {number} me the computer's seat
	 * @return {number}
	 */
	replySide(s, me) {
		return 3 - me
	},
	/**
	 * Team material with hand pieces at full value (see the table above), plus the crazyhouse attack term: +12 for
	 * each own piece within king distance 2 of the enemy king on the own board, −12 for each enemy piece that close
	 * to the own king.
	 *
	 * @param {object} b world
	 * @param {number} side seat
	 * @return {number}
	 */
	evaluate(b, side) {
		const opp = 3 - side
		let ownKing = -1
		let oppKing = -1
		for (let id = 0; id < b.sq.length; id++) {
			if (b.ty[id] === 'k' && b.sq[id] >= 0) {
				if (b.sd[id] === side) {
					ownKing = b.sq[id]
				} else if (b.sd[id] === opp) {
					oppKing = b.sq[id]
				}
			}
		}
		const rel = RELATION[side]
		let score = 0
		for (let id = 0; id < b.sq.length; id++) {
			const s = b.sq[id]
			if (s === OFF) {
				continue
			}
			const o = b.sd[id]
			const v = spec.types[b.ty[id]].value
			if (s === HAND) {
				score += HAND_TERM[rel[o]] * v
				continue
			}
			score += BOARD_TERM[rel[o]] * v
			if (b.ty[id] === 'k') {
				continue
			}
			if (o === side && oppKing >= 0 && near(s, oppKing)) {
				score += 12
			} else if (o === opp && ownKing >= 0 && near(s, ownKing)) {
				score -= 12
			}
		}
		return score
	},
}

export default defineVariant(spec)
