/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Crazyhouse (the lichess rules): orthodox chess in which a captured piece changes colour and goes into the
 * capturer's hand, and a player may drop a piece from the hand onto any empty square instead of moving (pawns not on
 * rank 1 or 8). Promoted pieces are separate types (`+q`, `+r`, `+b`, `+n`) that go back into a hand as pawns. A drop
 * is a measured move: onto a square where a ghost might stand it is a roll (Dropped or Missed). Hands are the same in
 * every possibility, because a capture takes the same piece in every possibility where it happens.
 * Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { castlingMoves, orthodoxAfterMove, pawnExtras } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { dropKey, HAND, OFF, placePiece } from './core/world.js'

/** The promoted types and the base type each one moves like. */
const PROMOTED = Object.freeze({ '+q': 'q', '+r': 'r', '+b': 'b', '+n': 'n' })

/** Piece values in centipawns, after the "1-2-2-2-4" crazyhouse estimate (pawns and knights gain, queens lose). */
const VALUES = Object.freeze({ p: 100, n: 220, b: 200, r: 230, q: 420, k: 400 })

/** The names of the promoted types (screen readers and tooltips). */
const PROMOTED_NAMES = {
	'+q': () => t('quantumchess', 'Promoted queen'),
	'+r': () => t('quantumchess', 'Promoted rook'),
	'+b': () => t('quantumchess', 'Promoted bishop'),
	'+n': () => t('quantumchess', 'Promoted knight'),
}

/** The share of its value a hand piece gets on top of the computer player's 0.8, so that it counts in full. */
const HAND_BONUS = 0.2
/** Bonus for a piece within king distance 2 of the enemy king (and the same malus near the own king). */
const NEAR_KING = 12

const spec = orthodoxSpec()
const topo = spec.topology
const FILE = topo.coords.map((c) => c[0])
const RANK = topo.coords.map((c) => c[1])

for (const [type, value] of Object.entries(VALUES)) {
	spec.types[type] = { ...spec.types[type], value }
}
for (const [type, base] of Object.entries(PROMOTED)) {
	spec.types[type] = {
		...spec.types[base],
		name: PROMOTED_NAMES[type],
		glyph: { sprite: base, promoted: true },
	}
}

/**
 * `DROP_KEYS[type][sq]`: the drop codes, built once. The core generates the moves of every world the escape rule and
 * the computer player meet, and with full hands building these strings there took a sixth of that time.
 */
const DROP_KEYS = Object.fromEntries(['p', 'n', 'b', 'r', 'q']
	.map((type) => [type, topo.names.map((name, sq) => dropKey(spec, type, sq))]))

/**
 * The drops of a side in a world: every piece type in its hand onto every empty square, pawns not on rank 1 or 8.
 * The dropped piece is the lowest id of that type in the hand, which is the same piece in every possibility (hands
 * are identical in all of them).
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {object[]} out output
 */
function dropMoves(w, side, out) {
	const first = new Map()
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] === HAND && w.sd[id] === side && !first.has(w.ty[id])) {
			first.set(w.ty[id], id)
		}
	}
	for (const [type, id] of first) {
		const keys = DROP_KEYS[type]
		for (let sq = 0; sq < w.board.length; sq++) {
			if (w.board[sq] !== -1 || (type === 'p' && (RANK[sq] === 0 || RANK[sq] === 7))) {
				continue
			}
			out.push({
				key: keys[sq],
				from: -1,
				to: sq,
				id,
				capture: -1,
				promo: null,
				drop: type,
				kind: 'drop',
			})
		}
	}
}

/**
 * King distance (the number of king steps) between two squares.
 *
 * @param {number} a square
 * @param {number} b square
 * @return {number}
 */
function kingDistance(a, b) {
	return Math.max(Math.abs(FILE[a] - FILE[b]), Math.abs(RANK[a] - RANK[b]))
}

/** The eight lines from a square: four rook lines, then four bishop lines. */
const LINES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

/** `RAYS[sq][d]`: the squares from `sq` along `LINES[d]`, nearest first. */
const RAYS = topo.coords.map(([f, r]) => LINES.map(([df, dr]) => {
	const ray = []
	for (let k = 1; topo.at([f + k * df, r + k * dr]) >= 0; k++) {
		ray.push(topo.at([f + k * df, r + k * dr]))
	}
	return ray
}))

/**
 * The move order the computer player needs when its king is attacked along a line. The core search (`chooseMove`)
 * tries the captures first and then the other moves in the order of this list, and it has no hook for its own order;
 * the drops come last in it. At 64 possibilities each move costs it tens of milliseconds, so it ran out of time before
 * it reached the drop that shields the king. So when an enemy rook, bishop or queen (promoted ones too) could take
 * the king of `side` in this world, the king's own moves and the moves and drops onto the squares in between come
 * first, in their old order. Otherwise the list is returned as it is. Only the order changes, never the moves.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {object[]} list the moves of `side` in `w`
 * @return {object[]}
 */
function parryFirst(w, side, list) {
	let king = -1
	for (let id = 0; id < w.sq.length && king < 0; id++) {
		if (w.sq[id] >= 0 && w.sd[id] === side && w.ty[id] === 'k') {
			king = id
		}
	}
	if (king < 0) {
		return list
	}
	let between = null
	const rays = RAYS[w.sq[king]]
	for (let d = 0; d < rays.length; d++) {
		const ray = rays[d]
		let i = 0
		while (i < ray.length && w.board[ray[i]] < 0) {
			i++
		}
		const id = i < ray.length ? w.board[ray[i]] : -1
		const base = id >= 0 && w.sd[id] !== side ? (PROMOTED[w.ty[id]] ?? w.ty[id]) : null
		if (base === 'q' || base === (d < 4 ? 'r' : 'b')) {
			between ??= new Set()
			for (let j = 0; j < i; j++) {
				between.add(ray[j])
			}
		}
	}
	if (!between) {
		return list
	}
	const parry = (m) => m.id === king || between.has(m.to)
	return [...list.filter(parry), ...list.filter((m) => !parry(m))]
}

Object.assign(spec, {
	id: 'crazyhouse',
	category: 'rules',
	drops: true,
	handOrder: ['p', 'n', 'b', 'r', 'q'],
	rules: () => [
		t('quantumchess', 'When you capture a piece, it changes colour and goes into your hand.'),
		t(
			'quantumchess',
			'Instead of moving, you may drop a piece from your hand onto any empty square. Pawns may not be dropped on rank 1 or rank 8.',
		),
		t('quantumchess', 'A pawn dropped on your own second rank may still move two squares.'),
		t('quantumchess', 'When a promoted piece (marked with a small +) is captured, the capturer gets a pawn.'),
		t('quantumchess', 'A dropped rook can never castle, not even from its corner.'),
		t(
			'quantumchess',
			'Dropping onto a square where a ghost might stand is a roll: either your piece lands, or the ghost is found there and your piece stays in your hand (your turn is still used).',
		),
		t('quantumchess', 'You always know exactly what is in both hands.'),
		t(
			'quantumchess',
			'Drops count when a king must escape: a dropped piece can shield your king, and a drop that leaves the enemy king no escape wins at once.',
		),
	],
	/**
	 * Double steps (also of a pawn dropped on its second rank), en passant, castling and the drops.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		const out = pawnExtras(spec, w, side, (s, sq) => RANK[sq] === (s === 0 ? 1 : 6))
		out.push(...castlingMoves(spec, w, side))
		dropMoves(w, side, out)
		return out
	},
	/**
	 * No move is filtered out; the order only helps the computer player find a drop that shields its king (see
	 * `parryFirst`). The hook has a price: with any `filterMoves` the core's escape rule no longer takes the moves of
	 * one piece as a shortcut (`keyMove`) but generates every move of each world it meets. With full hands at 64
	 * possibilities, a king that cannot escape then takes about 0.7 s to decide instead of 0.15 s (test "no drop
	 * shields a king from a knight"). The whole search runs only when no early action escapes, which in practice is
	 * the move that ends the game; a computer player that loses its king at many possibilities is worse. A core hook
	 * for the search order would remove the price.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @param {object[]} list the moves of `side` in `w`
	 * @return {object[]}
	 */
	filterMoves(w, side, list) {
		return parryFirst(w, side, list)
	},
	/**
	 * A captured piece changes colour and goes into the capturer's hand; a promoted piece goes there as a pawn. A
	 * captured king leaves the board (the game is over).
	 *
	 * @param {object} next the new world (mutable)
	 * @param {number} victim the captured piece
	 * @param {object} m the capturing move
	 */
	onCapture(next, victim, m) {
		const type = next.ty[victim]
		if (spec.types[type].royal) {
			placePiece(next, victim, OFF)
			return
		}
		placePiece(next, victim, HAND)
		next.sd[victim] = next.sd[m.id]
		next.ty[victim] = PROMOTED[type] ? 'p' : type
	},
	/**
	 * The en passant square and the castling rights (a drop keeps the rights: it never creates one), then a promotion
	 * becomes the promoted type (the move code keeps the base letter, `e7-e8=q`).
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 */
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
		if (m.promo) {
			next.ty[m.id] = '+' + m.promo
		}
	},
	/**
	 * The contents of both hands. Hands are the same in every possibility (see the module comment), so this never
	 * triggers a solid roll; it is a guard that would settle an uncertain hand by a roll instead of showing one.
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
	 * The quiet rule also counts drops.
	 *
	 * @param {string} reason reason code
	 * @return {string|null}
	 */
	reasonText(reason) {
		return reason === 'quiet' ? t('quantumchess', '50 moves without a capture, a pawn move or a drop') : null
	},
	/**
	 * Extra terms for the computer player: hand pieces at their full value (the search counts them at 0.8, which
	 * would make it drop everything at once), and pieces close to the enemy king.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {number}
	 */
	evaluate(w, side) {
		const kings = [-1, -1]
		for (let id = 0; id < w.sq.length; id++) {
			if (w.sq[id] >= 0 && w.ty[id] === 'k') {
				kings[w.sd[id]] = w.sq[id]
			}
		}
		let score = 0
		for (let id = 0; id < w.sq.length; id++) {
			const s = w.sq[id]
			const own = w.sd[id] === side
			if (s === HAND) {
				score += (own ? HAND_BONUS : -HAND_BONUS) * spec.types[w.ty[id]].value
			} else if (s >= 0 && w.ty[id] !== 'k') {
				const enemyKing = kings[1 - w.sd[id]]
				if (enemyKing >= 0 && kingDistance(s, enemyKing) <= 2) {
					score += own ? NEAR_KING : -NEAR_KING
				}
			}
		}
		return score
	},
})

export default defineVariant(spec)
