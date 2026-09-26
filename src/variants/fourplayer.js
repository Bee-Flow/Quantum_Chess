/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Four-player chess (the chess.com board and armies): Red, Blue, Yellow and Green play clockwise on a 14 × 14 board
 * without its four 3 × 3 corners. Free for all (default): a captured king takes its whole army off the board, the last
 * king standing wins. Teams (option): Red and Yellow against Blue and Green, partners cannot capture each other, the
 * first captured king loses for its team. Each player's quantum budget is 2 while four play (4 with three, 8 with
 * two). Player-facing rules are in docs/variants.md; the design is in handoff/research/fourplayer.md.
 */

import { t } from '@nextcloud/l10n'
import {
	castlingMoves,
	clearEnPassant,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	unifyCastling,
} from './core/orthodox.js'
import { FILE_LETTERS, rectTopology } from './core/topology.js'
import { defineVariant, sideName } from './core/variant.js'
import { addPiece, attacks, emptyWorld, hasRoyal, OFF, placePiece, pushMove } from './core/world.js'

/** The board is SIZE × SIZE squares without its four ARM × ARM corners. */
const SIZE = 14
const ARM = 3
const LAST = SIZE - 1
const SIDES = [0, 1, 2, 3]

/** The quantum budget of each player by the number of kings still on the board (the largest n with n^players ≤ 64). */
const BUDGETS = [8, 8, 8, 4, 2]

/** The promotion line, counted from the own back line: the 8th line in free for all, the 11th in Teams. */
const PROMOTION_FFA = 7
const PROMOTION_TEAMS = 10

/** The last side of the turn order: its move before the start position, so that Red is to move. */
const LAST_SIDE = 3

/**
 * The computer's terms. OUT: its own king is gone, and (plus its material) its king can be captured by an enemy that
 * moves before it does again (free for all; in a Teams game a captured king ends the game). ELIMINATED: each enemy
 * already out in free for all, and each enemy king it can capture right now, about the army that leaves the board
 * with it (without it the computer would lose value by taking a weak player's king, since the enemy average rises).
 * TEAM_LOSS: in Teams, its own or its partner's king can be captured by an enemy that moves before that king's
 * player does again (and the other way round).
 */
const OUT = 10000
const ELIMINATED = 4000
const TEAM_LOSS = 20000
/** Small positional terms: a pawn per line it has advanced, a knight or bishop that stands in the centre. */
const PAWN_STEP = 6
const CENTRAL_MINOR = 15
/**
 * The mop-up against a king that has nothing but pawns left: per square next to it that it cannot use, when the
 * computer attacks it, and per step its own king is closer; only with at least MATING in pieces (a rook) of its own.
 */
const CORNERED = 40
const CHASED = 100
const MATING = 500
const NEAR = 10
const KING_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

/**
 * Whether a square exists: everything except the four corners.
 *
 * @param {number} f file index
 * @param {number} r rank index
 * @return {boolean}
 */
function exists(f, r) {
	return !((f < ARM || f > LAST - ARM) && (r < ARM || r > LAST - ARM))
}

/**
 * The coordinate labels: file letters in one row under the board, rank numbers hugging the cross, left of the
 * leftmost square of each rank. (Letters under rank 4 for the files a-c would run into the "3" beside rank 3 and read
 * as "c3", a square that does not exist.)
 *
 * @return {object[]}
 */
function boardLabels() {
	const labels = []
	for (let f = 0; f < SIZE; f++) {
		labels.push({ x: f + 0.5, y: SIZE + 0.32, text: FILE_LETTERS[f] })
	}
	for (let r = 0; r < SIZE; r++) {
		const leftmost = r < ARM || r > LAST - ARM ? ARM : 0
		labels.push({ x: leftmost - 0.3, y: SIZE - r - 0.5, text: String(r + 1) })
	}
	return labels
}

// 160 dense cells on a phone: keep the zoom controls although the board is below the automatic size
const topology = rectTopology(SIZE, SIZE, { exists, noLabels: true, layout: { labels: boardLabels(), zoomable: true } })

/**
 * Turn a vector written for Red a quarter turn clockwise per side (y up): Blue's forward is +file, Yellow's -rank,
 * Green's -file.
 *
 * @param {number} side side index
 * @param {number[]} vec vector for Red
 * @return {number[]}
 */
function orient(side, vec) {
	let [a, b] = vec
	for (let i = 0; i < side; i++) {
		[a, b] = [b, -a]
	}
	return [a, b]
}

/**
 * Turn Red's square coordinates to a side's equivalent square (a quarter turn clockwise per side).
 *
 * @param {number} side side index
 * @param {number[]} c coordinates of a Red square
 * @return {number} the square
 */
function turnSquare(side, [x, y]) {
	for (let i = 0; i < side; i++) {
		[x, y] = [y, LAST - x]
	}
	return topology.at([x, y])
}

/**
 * How far a square lies in front of a side's back line (0 on the back line, 1 on the pawn line).
 *
 * @param {number} side side index
 * @param {number} sq square
 * @return {number}
 */
export function progress(side, sq) {
	const [x, y] = topology.coords[sq]
	return [y, x, LAST - y, LAST - x][side]
}

/**
 * Whether a world is a Teams game. Worlds built without the mode (tests, old saves) are free for all.
 *
 * @param {object} w world
 * @return {boolean}
 */
function isTeams(w) {
	return Boolean(w.x?.teams)
}

/**
 * Whether two sides play in the same team of a Teams game (Red with Yellow, Blue with Green).
 *
 * @param {number} a side index
 * @param {number} b side index
 * @return {boolean}
 */
function sameTeam(a, b) {
	return a % 2 === b % 2
}

/**
 * The winners when a side of a Teams game loses: the other team.
 *
 * @param {number} loser side index
 * @return {number[]}
 */
function otherTeam(loser) {
	return loser % 2 === 0 ? [1, 3] : [0, 2]
}

/**
 * The castling rights of the start position: both wings of every army, from Red's squares turned for each side.
 * The king goes two squares towards the rook and the rook lands on the square the king crossed.
 *
 * @return {object[]}
 */
function startRights() {
	const out = []
	for (const side of SIDES) {
		const at = (x) => turnSquare(side, [x, 0])
		out.push({ flag: 'K', side, king: at(7), rook: at(10), kingTo: at(9), rookTo: at(8) })
		out.push({ flag: 'Q', side, king: at(7), rook: at(3), kingTo: at(5), rookTo: at(6) })
	}
	return out
}

/**
 * The squares of the kings (the only royal type) in a world, per side (-1 when that side has none).
 *
 * @param {object} b world
 * @return {number[]}
 */
function kingSquares(b) {
	const out = [-1, -1, -1, -1]
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0 && b.ty[id] === 'k') {
			out[b.sd[id]] = b.sq[id]
		}
	}
	return out
}

/**
 * The sides that still have a king in a world.
 *
 * @param {object} b world
 * @return {number[]}
 */
function aliveSides(b) {
	return kingSquares(b).map((sq, side) => (sq >= 0 ? side : -1)).filter((side) => side >= 0)
}

/**
 * Whether the board of a world holds nothing but two kings that are not next to each other: neither can ever be
 * forced next to the other on this board, so the game is dead.
 *
 * @param {object} b world
 * @param {number[]} kings king squares per side
 * @return {boolean}
 */
function twoLoneKings(b, kings) {
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0 && b.ty[id] !== 'k') {
			return false
		}
	}
	const [a, c] = kings.filter((sq) => sq >= 0).map((sq) => topology.coords[sq])
	return Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1])) > 1
}

/**
 * Whether two squares are a rook step apart.
 *
 * @param {number} a square
 * @param {number} b square
 * @return {boolean}
 */
function nextTo(a, b) {
	const [ax, ay] = topology.coords[a]
	const [bx, by] = topology.coords[b]
	return Math.abs(ax - bx) + Math.abs(ay - by) === 1
}

/**
 * The piece types: the orthodox pieces with values for this board (long diagonals make the bishop strong) and pawns
 * that promote on their 8th line (free for all) or 11th line (Teams) to a queen, rook, bishop or knight.
 *
 * @return {object}
 */
function pieceTypes() {
	const types = orthodoxTypes({ lastRank: () => false })
	types.q.value = 1000
	types.r.value = 500
	types.b.value = 450
	types.n.value = 300
	types.p.promote = {
		zone: (side, to, from, w) => progress(side, to) === (isTeams(w) ? PROMOTION_TEAMS : PROMOTION_FFA),
		to: ['q', 'r', 'b', 'n'],
	}
	return types
}

const evalCache = new WeakMap()

/**
 * The side to move in a world: the first side after `x.mover` (the side that played the last ply, or sat it out)
 * that still has a king. -1 when the world does not record it (a position built without it).
 *
 * @param {object} b world
 * @param {number[]} kings king squares per side
 * @return {number}
 */
function sideToMove(b, kings) {
	const last = b.x?.mover
	if (!Number.isInteger(last)) {
		return -1
	}
	for (let i = 1; i <= SIDES.length; i++) {
		const s = (last + i) % SIDES.length
		if (kings[s] >= 0) {
			return s
		}
	}
	return -1
}

/**
 * Whether side `e` moves before side `owner` does again, from the side to move `turn` on (true when `turn` is unknown,
 * -1). Sides without a king are skipped.
 *
 * @param {number} e side index
 * @param {number} owner side index
 * @param {number[]} kings king squares per side
 * @param {number} turn side to move, or -1
 * @return {boolean}
 */
function movesBefore(e, owner, kings, turn) {
	if (kings[e] < 0 || e === owner) {
		return false
	}
	if (turn < 0) {
		return true
	}
	for (let i = 0; i < SIDES.length; i++) {
		const s = (turn + i) % SIDES.length
		if (s === owner) {
			return false
		}
		if (s === e) {
			return true
		}
	}
	return false
}

/**
 * Whether a king can be captured before its player moves again: an enemy still in the game that moves from `turn`
 * up to the king's player attacks it. The enemies that move after the king's player do not count, since that player
 * can still step away.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} owner the king's side
 * @param {number[]} kings king squares per side
 * @param {number} turn side to move, or -1 (every enemy counts)
 * @return {boolean}
 */
function threatened(V, b, owner, kings, turn) {
	if (kings[owner] < 0) {
		return false
	}
	const teams = isTeams(b)
	return SIDES.some((e) => !(teams && sameTeam(e, owner)) && movesBefore(e, owner, kings, turn)
		&& attacks(V, b, e, kings[owner]))
}

/**
 * How many enemy kings the side to move can capture right now, when that is the side itself (in Teams: or its
 * partner). None when the side to move is unknown.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @param {number[]} kings king squares per side
 * @param {number} turn side to move, or -1
 * @return {number}
 */
function capturable(V, b, side, kings, turn) {
	if (turn < 0 || (turn !== side && !(isTeams(b) && sameTeam(turn, side)))) {
		return 0
	}
	return SIDES.filter((e) => kings[e] >= 0 && e !== turn && !(isTeams(b) && sameTeam(e, turn))
		&& attacks(V, b, turn, kings[e])).length
}

/**
 * The mop-up terms of a side: against every enemy king that has nothing but pawns left, while the side has at least
 * a rook's worth of pieces, the squares next to that king it cannot use (off the board, taken by its own team or
 * attacked by the side's team), an attack on the king and the distance of the side's own king. Without them the
 * search, which looks two plies ahead, shuffles a won endgame into the quiet-move draw. A piece of the side's team
 * next to that king and not defended is lost when the king's player moves first: the search would not see that
 * capture when another player moves in between.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @param {number[]} kings king squares per side
 * @param {number[]} force material per side without kings and pawns
 * @param {number} turn side to move, or -1
 * @return {number}
 */
function mopUp(V, b, side, kings, force, turn) {
	if (force[side] < MATING) {
		return 0
	}
	const teams = isTeams(b)
	const team = (a, c) => a === c || (teams && sameTeam(a, c))
	const ours = SIDES.filter((s) => kings[s] >= 0 && team(s, side))
	let score = 0
	for (const e of SIDES) {
		const k = kings[e]
		if (k < 0 || team(e, side) || force[e] > 0) {
			continue
		}
		// the king steps off its square, so a line through it also covers the squares behind it
		const lifted = { ...b, board: b.board.slice() }
		lifted.board[k] = -1
		const covered = (sq) => ours.some((s) => attacks(V, lifted, s, sq))
		for (const d of KING_STEPS) {
			const t = topology.step(k, d)
			const id = t < 0 ? -1 : b.board[t]
			if (t < 0 || (id >= 0 && team(b.sd[id], e)) || covered(t)) {
				score += CORNERED
			} else if (id >= 0 && team(b.sd[id], side) && movesBefore(e, b.sd[id], kings, turn)) {
				score -= V.types[b.ty[id]].value
			}
		}
		if (covered(k)) {
			score += CHASED
		}
		// the own king helps: the closer, the better
		const [ex, ey] = topology.coords[k]
		const [ox, oy] = topology.coords[kings[side]]
		score += NEAR * (LAST - Math.max(Math.abs(ex - ox), Math.abs(ey - oy)))
	}
	return score
}

/**
 * The positional terms of a side in a world: advanced pawns and centralised knights and bishops (without them the
 * computer, which sees only material, would shuffle its pieces back and forth).
 *
 * @param {object} b world
 * @param {number} side side index
 * @return {number}
 */
function positional(b, side) {
	let score = 0
	for (let id = 0; id < b.sq.length; id++) {
		const s = b.sq[id]
		if (s < 0 || b.sd[id] !== side) {
			continue
		}
		const ty = b.ty[id]
		if (ty === 'p') {
			score += PAWN_STEP * (progress(side, s) - 1)
		} else if (ty === 'n' || ty === 'b') {
			const [x, y] = topology.coords[s]
			if (x >= ARM && x <= LAST - ARM && y >= ARM && y <= LAST - ARM) {
				score += CENTRAL_MINOR
			}
		}
	}
	return score
}

/**
 * The computer's extra terms for a side in a world (see `evaluate`).
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @return {number}
 */
function extraTerms(V, b, side) {
	const kings = kingSquares(b)
	if (kings[side] < 0) {
		return -OUT
	}
	const teams = isTeams(b)
	const material = [0, 0, 0, 0]
	const force = [0, 0, 0, 0]
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0) {
			const value = V.types[b.ty[id]].value
			material[b.sd[id]] += value
			if (b.ty[id] !== 'k' && b.ty[id] !== 'p') {
				force[b.sd[id]] += value
			}
		}
	}
	// the search sees only the next player's answer; the players after it may capture before this side moves again
	const turn = sideToMove(b, kings)
	let score = positional(b, side) + mopUp(V, b, side, kings, force, turn)
	// ai.js values a world as own - (the material of every other side) / 3
	if (teams) {
		// the partner is no enemy: own + partner - enemy1 - enemy2
		const partner = material[(side + 2) % 4]
		const enemies = material[(side + 1) % 4] + material[(side + 3) % 4]
		score += (4 * partner - 2 * enemies) / 3
		// the first king captured ends the game: the team to move wins if it can capture one now
		if (capturable(V, b, side, kings, turn)) {
			score += TEAM_LOSS
		} else if (threatened(V, b, side, kings, turn) || threatened(V, b, (side + 2) % 4, kings, turn)) {
			score -= TEAM_LOSS
		}
	} else {
		// the average over the enemies still in the game: own - E / k (the same while all four play)
		const others = SIDES.filter((s) => s !== side && kings[s] >= 0)
		const rest = others.reduce((sum, s) => sum + material[s], 0)
		score += others.length ? rest / 3 - rest / others.length : 0
		score += ELIMINATED * (SIDES.length - 1 - others.length)
		// a captured king takes the whole army with it
		if (threatened(V, b, side, kings, turn)) {
			score -= OUT + material[side]
		}
		score += ELIMINATED * capturable(V, b, side, kings, turn)
	}
	return score
}

const spec = {
	id: 'fourplayer',
	category: 'boards',
	sides: [
		// TRANSLATORS: a player of four-player chess, named after its colour (Xiangqi's first player is Red too)
		{ id: 'r', name: () => t('quantumchess', 'Red'), color: 'red', rotate: 0 },
		// TRANSLATORS: a player of four-player chess, named after its colour (the same word names a board theme)
		{ id: 'b', name: () => t('quantumchess', 'Blue'), color: 'blue', rotate: 270 },
		// TRANSLATORS: a player of four-player chess, named after its colour
		{ id: 'y', name: () => t('quantumchess', 'Yellow'), color: 'yellow', rotate: 180 },
		// TRANSLATORS: a player of four-player chess, named after its colour
		{ id: 'g', name: () => t('quantumchess', 'Green'), color: 'green', rotate: 90 },
	],
	topology,
	orient,
	types: pieceTypes(),
	options: [
		{
			id: 'mode',
			type: 'choice',
			label: () => t('quantumchess', 'Game mode'),
			values: [
				{ id: 'ffa', label: () => t('quantumchess', 'Free for all') },
				{ id: 'teams', label: () => t('quantumchess', 'Teams: Red and Yellow against Blue and Green') },
			],
			default: 'ffa',
		},
	],
	maxPly: 1200,
	quietPlies: 200,
	// The classic end rules (docs/rules.md 5 and 6; handoff/LEAD-DECISIONS.md L1, which lists the four-player games).
	// "Your king cannot escape" is left out: the core's rule makes the player who just moved the only winner, but with
	// three or four players in the game another player may be the one to capture, a captured king only puts its
	// player out in free for all, and a Teams game is won by a team; the flag holds for the whole game, so it stays
	// off when two players are left too. The core's bare-kings draw is left out: this variant has its own
	// (worldResult: free for all, two kings not next to each other; three lone kings can still trap one). The
	// quiet-move draw waits while the player to move can capture a king for certain.
	escapeRule: false,
	bareKingsDraw: false,
	drawsWait: true,

	/**
	 * The start position: every army `R N B Q K B N R` from its own left with the pawns in front, Red's squares turned
	 * a quarter turn per side. `x` holds the mode, the en passant square, the castling rights and `mover`, the side
	 * that played the last ply (Green before the first move): the computer reads the side to move from it, since its
	 * `evaluate` hook sees only the world.
	 *
	 * @param {object} [options] option values (`mode`: ffa or teams)
	 * @return {object}
	 */
	setup(options = {}) {
		const w = emptyWorld(spec)
		const back = 'rnbqkbnr'
		for (const side of SIDES) {
			for (let i = 0; i < back.length; i++) {
				addPiece(w, back[i], side, turnSquare(side, [ARM + i, 0]))
			}
			for (let i = 0; i < back.length; i++) {
				addPiece(w, 'p', side, turnSquare(side, [ARM + i, 1]))
			}
		}
		w.x = { teams: options.mode === 'teams', ep: -1, epVictim: -1, castle: startRights(), mover: LAST_SIDE }
		return w
	},

	/**
	 * Castling on both wings, pawn double steps and en passant. En passant is open only to a pawn standing next to the
	 * pawn that just double-stepped, and it promotes when it lands on the capturer's promotion line.
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		const out = castlingMoves(spec, w, side)
		for (const m of pawnExtras(spec, w, side, (s, sq) => progress(s, sq) === 1)) {
			if (m.kind !== 'ep') {
				out.push(m)
			} else if (nextTo(m.from, w.x.epVictim)) {
				pushMove(spec, w, out, m.id, m.from, m.to, m.capture, 'ep')
			}
		}
		return out
	},

	/**
	 * Teams: a partner's pieces cannot be captured (they block like the own pieces).
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @param {object[]} list moves
	 * @return {object[]}
	 */
	filterMoves(w, side, list) {
		if (!isTeams(w)) {
			return list
		}
		return list.filter((m) => m.capture < 0 || !sameTeam(w.sd[m.capture], side))
	},

	/**
	 * The en passant square, castling rights and the side that moved (`x.mover`, for the computer's king danger); in
	 * free for all, a captured king takes its whole army off the board.
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 * @param {object} prev the world before the move
	 */
	afterMove(next, m, prev) {
		orthodoxAfterMove(spec, next, m)
		next.x.mover = prev.sd[m.id]
		if (m.capture < 0 || prev.ty[m.capture] !== 'k' || isTeams(next)) {
			return
		}
		const victim = prev.sd[m.capture]
		for (let id = 0; id < next.sq.length; id++) {
			if (next.sd[id] === victim && next.sq[id] >= 0) {
				placePiece(next, id, OFF)
			}
		}
		if (next.x.castle?.length) {
			next.x.castle = next.x.castle.filter((c) => c.side !== victim)
		}
	},

	/**
	 * A world where the action did not take effect (and a turn a player sits out) ends the en passant right too, and
	 * records the side whose turn it was, as `afterMove` does.
	 *
	 * @param {object} b world
	 * @param {object} action the action played
	 * @param {number} side the side whose turn it was
	 * @return {object}
	 */
	applyMiss(b, action, side) {
		const c = clearEnPassant(b)
		return c.x?.mover === side ? c : { ...c, x: { ...c.x, mover: side } }
	},

	/**
	 * A castling right is kept only while every world has it.
	 *
	 * @param {object[]} bs worlds
	 * @return {object[]}
	 */
	unifyWorlds(bs) {
		return unifyCastling(bs)
	},

	/**
	 * A player without a king is out and skipped.
	 *
	 * @param {object} b world
	 * @param {number} side side index
	 * @return {boolean}
	 */
	isOut(b, side) {
		return !hasRoyal(spec, b, side)
	},

	/**
	 * The fair-share budget: 2 per player while four kings stand (4 with three, 8 with two); always 2 in Teams.
	 *
	 * @param {object} b a world
	 * @return {{limit: number}}
	 */
	budgetRule(b) {
		return { limit: isTeams(b) ? BUDGETS[4] : BUDGETS[aliveSides(b).length] }
	},

	/**
	 * Free for all: a player who cannot move sits out. Teams: the core's draw.
	 *
	 * @param {object} state the new state
	 * @return {boolean}
	 */
	passWhenStuck(state) {
		return !isTeams(state.worlds[0].b)
	},

	/**
	 * The result of a world. Teams: the first captured king loses for its team. Free for all: the last king wins; two
	 * lone kings that are not next to each other are a draw.
	 *
	 * @param {object} b world
	 * @return {null|{winner: number|null, winners?: number[], reason: string}}
	 */
	worldResult(b) {
		const kings = kingSquares(b)
		const alive = SIDES.filter((s) => kings[s] >= 0)
		if (isTeams(b)) {
			const lost = SIDES.find((s) => kings[s] < 0)
			return lost === undefined ? null : { winner: null, winners: otherTeam(lost), reason: 'king' }
		}
		if (alive.length === 1) {
			return { winner: alive[0], reason: 'king' }
		}
		if (alive.length === 0) {
			return { winner: null, reason: 'king' }
		}
		if (alive.length === 2 && twoLoneKings(b, kings)) {
			return { winner: null, reason: 'bareKings' }
		}
		return null
	},

	/**
	 * Free for all: the players whose king this move captured, for the line "Blue is out".
	 *
	 * @param {object} prev state before the move
	 * @param {string} code move code
	 * @param {object} branch the outcome
	 * @param {object} next state after the move
	 * @return {object|null}
	 */
	recordInfo(prev, code, branch, next) {
		const before = prev.worlds[0].b
		const after = next.worlds[0].b
		if (isTeams(after)) {
			return null
		}
		const out = SIDES.filter((s) => hasRoyal(spec, before, s) && !hasRoyal(spec, after, s))
		return out.length ? { out } : null
	},

	/**
	 * The lines of a move record: "Blue is out".
	 *
	 * @param {object} record history record
	 * @return {string[]|null}
	 */
	infoText(record) {
		const out = record.info?.out
		if (!Array.isArray(out)) {
			return null
		}
		// TRANSLATORS: four-player chess, a player whose king was captured; {side} is Red, Blue, Yellow or Green
		return out.map((side) => t('quantumchess', '{side} is out', { side: sideName(spec, side) }))
	},

	/**
	 * The short text in a player row: "out" for an eliminated player (free for all), the partner in Teams.
	 *
	 * @param {object} state state
	 * @param {number} side side index
	 * @return {{text: string, title?: string}|null}
	 */
	sideInfo(state, side) {
		const b = state.worlds[0].b
		if (isTeams(b)) {
			return {
				// TRANSLATORS: four-player chess, next to a player's name: its partner, Red, Blue, Yellow or Green
				text: t('quantumchess', 'with {partner}', { partner: sideName(spec, (side + 2) % 4) }),
				// TRANSLATORS: four-player chess in Teams, the tooltip of a player's partner
				title: t(
					'quantumchess',
					'Partners cannot capture each other; the first king captured loses for its team.',
				),
			}
		}
		return hasRoyal(spec, b, side) ? null : { text: t('quantumchess', 'out') }
	},

	/**
	 * A resignation: in Teams the other team wins; in free for all the other players still in the game.
	 *
	 * @param {object} state state
	 * @param {number} loser the side that resigns
	 * @return {{winner: number|null, winners?: number[], reason: string}}
	 */
	resignResult(state, loser) {
		const b = state.worlds[0].b
		if (isTeams(b)) {
			return { winner: null, winners: otherTeam(loser), reason: 'resign' }
		}
		const rest = aliveSides(b).filter((s) => s !== loser)
		return rest.length === 1
			? { winner: rest[0], reason: 'resign' }
			: { winner: null, winners: rest, reason: 'resign' }
	},

	/**
	 * The texts of this variant's draw rules.
	 *
	 * @param {string} reason reason code
	 * @return {string|null}
	 */
	reasonText(reason) {
		return reason === 'quiet' ? t('quantumchess', '200 moves in a row without a capture or a pawn move') : null
	},

	/**
	 * The computer's extra terms: a king that an enemy could capture before its player moves again (its own, and its
	 * partner's in Teams; the side to move comes from `x.mover`), its own king lost, every enemy already out (free for
	 * all), the material of the enemies still in the game (in Teams the partner's material counts as its own), the
	 * mop-up against a king without pieces, advanced pawns and central knights and bishops. Cached per world.
	 *
	 * @param {object} b world
	 * @param {number} side side index
	 * @return {number}
	 */
	evaluate(b, side) {
		let per = evalCache.get(b)
		if (per === undefined) {
			per = []
			evalCache.set(b, per)
		}
		if (per[side] === undefined) {
			per[side] = extraTerms(spec, b, side)
		}
		return per[side]
	},

	/**
	 * The rules card of this variant.
	 *
	 * @return {string[]}
	 */
	rules() {
		return [
			t('quantumchess', 'Four armies take turns clockwise: Red, Blue, Yellow, Green. The board is 14 × 14 squares without its four 3 × 3 corners.'),
			t('quantumchess', 'Pawns walk towards the opposite side. In free for all they promote on their 8th rank, just past the middle of the board; in Teams, on their 11th rank. A pawn becomes a queen, rook, bishop or knight.'),
			t('quantumchess', 'Castling works as usual for every army. A pawn that has just moved two squares may be taken en passant only by the next player, with a pawn standing next to it.'),
			t('quantumchess', 'Free for all: capture a king and that player is out. Their whole army, ghosts included, leaves the board. The last king standing wins.'),
			t('quantumchess', 'Teams: Red and Yellow play against Blue and Green. Your partner\'s pieces block you like your own and cannot be captured. The first king captured loses the game for its team.'),
			t(
				'quantumchess',
				'A king that cannot escape does not lose at once, as it would in classic Quantum Chess: it must be captured.',
			),
			t(
				'quantumchess',
				'The quantum budget is not 8 here but shared fairly: each player\'s budget is 2 while four players are in the game, 4 with three and 8 with two.',
			),
			t('quantumchess', 'A player who cannot move sits out in free for all; in Teams, the game is drawn. 200 moves in a row (all players together) without a capture or a pawn move is a draw, and so are two lone kings that are not next to each other.'),
		]
	},
}

export default defineVariant(spec)
