/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Shogi (Japanese chess) with the quantum rules: a 9 × 9 board, captured pieces change sides and wait in the
 * capturer's hand to be dropped back onto the board, and most pieces promote in the enemy camp. The rule set is
 * lishogi's standard shogi in capture-the-king form: a king capture wins, and the core's classic escape rule
 * (`cannotEscape`: every action of the side to move would let its king be captured for certain) ends the game at once,
 * as lishogi's checkmate and stalemate do; the automatic 27-point impasse rule; and the quiet rule and a 500-ply limit
 * instead of the repetition rule. Promotion happens per possibility; a pawn drop that would be a pawn-drop mate
 * misses in the possibilities where it would be one. Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { BISHOP_DIRS, KING_STEPS, ROOK_DIRS } from './core/orthodox.js'
import { rectTopology } from './core/topology.js'
import { defineVariant } from './core/variant.js'
import { addPiece, attacks, cloneWorld, emptyWorld, HAND, handOf, OFF, pieceMoves, placePiece } from './core/world.js'

/** Rank letters from the top of the board (Gote's back rank a) to the bottom (Sente's back rank i). */
const RANKS = 'abcdefghi'
/** Number of files and ranks. */
const N = 9
/** Sente's back rank from file 9 (left) to file 1 (right); Gote's is the same, turned. */
const BACK = 'lnsgkgsnl'

// Movement vectors, written for Sente (forward = [0, 1]); the oriented ones are mirrored for Gote.
const FORWARD = [0, 1]
const GOLD = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]]
const SILVER = [[0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
const KNIGHT = [[1, 2], [-1, 2]]

/** The pieces that count 5 points for the impasse; every other piece but the king counts 1. */
const BIG = new Set(['r', 'b', '+r', '+b'])
/** Every promoted type and the type it turns back into when it is captured. */
const UNPROMOTED = Object.freeze({ '+r': 'r', '+b': 'b', '+s': 's', '+n': 'n', '+l': 'l', '+p': 'p' })
/**
 * Share of its value a piece in hand gets on top of the computer's 0.8, so that it counts in full (net 1.0, as in
 * crazyhouse). More would make every drop cost the computer points its one-move search never wins back, so it would
 * hardly ever drop a piece but a pawn.
 */
const HAND_BONUS = 0.2
/** Bonus for every piece within two king steps of the enemy king. */
const NEAR_KING = 15

/** Half the length of the four short strokes of a star point: with the round caps, a dot about 0.11 across. */
const STAR = 0.03

/**
 * The board labels: file numbers across the top (9 on the left) and rank letters down the right edge (a at the top).
 *
 * @return {object[]}
 */
function boardLabels() {
	const labels = []
	for (let f = 0; f < N; f++) {
		labels.push({ x: f + 0.5, y: -0.32, text: String(N - f) })
	}
	for (let k = 0; k < N; k++) {
		labels.push({ x: N + 0.3, y: k + 0.5, text: RANKS[k] })
	}
	return labels
}

/**
 * The four star points that mark the promotion zones, on the grid corners 3 and 6 lines in: four short strokes
 * crossing at each point. They are outlines (drawn near-black above the cells, with round caps), not labels: a label
 * takes the page's grey text colour, which has too little contrast on the wood in a dark theme.
 *
 * @return {object[]}
 */
function starPoints() {
	const d = STAR * Math.SQRT1_2
	return [[3, 3], [6, 3], [3, 6], [6, 6]].flatMap(([x, y]) => [
		{ x1: x - STAR, y1: y, x2: x + STAR, y2: y },
		{ x1: x, y1: y - STAR, x2: x, y2: y + STAR },
		{ x1: x - d, y1: y - d, x2: x + d, y2: y + d },
		{ x1: x - d, y1: y + d, x2: x + d, y2: y - d },
	])
}

// Engine coordinates [f, r]: f = 9 - file (0 = file 9 on the left), r = 8 - rank letter index (0 = rank i at the
// bottom), so 9i = 0, 1i = 8, 5e = 40, 1a = 80.
const topology = rectTopology(N, N, {
	name: (f, r) => String(N - f) + RANKS[N - 1 - r],
	shade: () => 'wood',
	noLabels: true,
	layout: { labels: boardLabels(), outlines: starPoints() },
})

/**
 * The rank index of a square (0 = rank i, Sente's back rank).
 *
 * @param {number} sq square
 * @return {number}
 */
function rankOf(sq) {
	return topology.coords[sq][1]
}

/**
 * The file index of a square (0 = file 9, on Sente's left).
 *
 * @param {number} sq square
 * @return {number}
 */
function fileOf(sq) {
	return topology.coords[sq][0]
}

/**
 * Whether a square lies on one of the `n` ranks farthest from a side (n = 3: its promotion zone, the enemy camp).
 *
 * @param {number} side side index
 * @param {number} sq square
 * @param {number} n number of ranks
 * @return {boolean}
 */
export function farRanks(side, sq, n) {
	return side === 0 ? rankOf(sq) >= N - n : rankOf(sq) <= n - 1
}

/**
 * The promotion of a type: optional when a move starts or ends in the zone, compulsory on the last `forcedRanks`
 * ranks (where the piece could never move again).
 *
 * @param {string} to the promoted type
 * @param {number} [forcedRanks] how many far ranks force the promotion (0: never)
 * @return {object}
 */
function promotion(to, forcedRanks = 0) {
	return {
		zone: (side, sq) => farRanks(side, sq, 3),
		fromZone: true,
		to: [to],
		optional: true,
		forced: forcedRanks ? (side, sq) => farRanks(side, sq, forcedRanks) : undefined,
	}
}

/**
 * A pentagon glyph with a kanji; promoted pieces are written in red.
 *
 * @param {string|((side: number) => string)} text the kanji
 * @param {boolean} [promoted] a promoted piece
 * @return {object}
 */
function glyph(text, promoted = false) {
	return promoted ? { text, shape: 'shogi', promoted: true } : { text, shape: 'shogi' }
}

/**
 * A piece that moves as a gold general (the gold itself and the four small promoted pieces).
 *
 * @param {() => string} name translated name
 * @param {number} value value for the computer
 * @param {string} text kanji
 * @param {boolean} promoted a promoted piece
 * @return {object}
 */
function goldMover(name, value, text, promoted) {
	return { name, moves: [{ leap: GOLD, oriented: true }], value, glyph: glyph(text, promoted) }
}

/** The drop codes of every type in hand and square (`p@5e`), built once. */
const dropKeys = new Map()

/**
 * The drop codes of a type by square.
 *
 * @param {string} type hand type
 * @return {string[]}
 */
function dropKeysOf(type) {
	let keys = dropKeys.get(type)
	if (!keys) {
		keys = topology.names.map((name) => type + '@' + name)
		dropKeys.set(type, keys)
	}
	return keys
}

const spec = {
	id: 'shogi',
	category: 'regional',
	drops: true,
	maxPly: 500,
	// The core's classic end rules stay on (escapeRule, bareKingsDraw and drawsWait by default). The escape rule is
	// shogi's own: checkmate and stalemate both lose at once. The bare-kings draw never comes, since every captured
	// piece but a king goes to a hand. Shogi has neither castling nor en passant, so the shared rules card leaves out
	// its sentence about them.
	specialMoves: false,
	handOrder: ['r', 'b', 'g', 's', 'n', 'l', 'p'],
	sides: [
		{ id: 'b', name: () => t('quantumchess', 'Sente'), color: 'black' },
		{ id: 'w', name: () => t('quantumchess', 'Gote'), color: 'white' },
	],
	topology,
	types: {
		k: {
			name: () => t('quantumchess', 'King'),
			moves: [{ leap: KING_STEPS }],
			royal: true,
			value: 0,
			glyph: glyph((side) => (side === 0 ? '玉' : '王')),
		},
		r: {
			name: () => t('quantumchess', 'Rook'),
			moves: [{ ride: ROOK_DIRS }],
			value: 1300,
			promote: promotion('+r'),
			glyph: glyph('飛'),
		},
		b: {
			name: () => t('quantumchess', 'Bishop'),
			moves: [{ ride: BISHOP_DIRS }],
			value: 1100,
			promote: promotion('+b'),
			glyph: glyph('角'),
		},
		g: goldMover(() => t('quantumchess', 'Gold general'), 800, '金', false),
		s: {
			name: () => t('quantumchess', 'Silver general'),
			moves: [{ leap: SILVER, oriented: true }],
			value: 700,
			promote: promotion('+s'),
			glyph: glyph('銀'),
		},
		n: {
			name: () => t('quantumchess', 'Knight'),
			moves: [{ leap: KNIGHT, oriented: true }],
			value: 500,
			promote: promotion('+n', 2),
			glyph: glyph('桂'),
		},
		l: {
			name: () => t('quantumchess', 'Lance'),
			moves: [{ ride: [FORWARD], oriented: true }],
			value: 400,
			promote: promotion('+l', 1),
			glyph: glyph('香'),
		},
		p: {
			name: () => t('quantumchess', 'Pawn'),
			moves: [{ leap: [FORWARD], oriented: true }],
			solid: true,
			value: 100,
			promote: promotion('+p', 1),
			glyph: glyph('歩'),
		},
		'+r': {
			name: () => t('quantumchess', 'Dragon (promoted rook)'),
			moves: [{ ride: ROOK_DIRS }, { leap: BISHOP_DIRS }],
			value: 1700,
			glyph: glyph('龍', true),
		},
		'+b': {
			name: () => t('quantumchess', 'Horse (promoted bishop)'),
			moves: [{ ride: BISHOP_DIRS }, { leap: ROOK_DIRS }],
			value: 1500,
			glyph: glyph('馬', true),
		},
		'+s': goldMover(() => t('quantumchess', 'Promoted silver'), 800, '全', true),
		'+n': goldMover(() => t('quantumchess', 'Promoted knight'), 900, '圭', true),
		'+l': goldMover(() => t('quantumchess', 'Promoted lance'), 900, '杏', true),
		'+p': goldMover(() => t('quantumchess', 'Tokin (promoted pawn)'), 1000, 'と', true),
	},

	/**
	 * What is special in shogi (the shared quantum rules are shown separately).
	 *
	 * @return {string[]}
	 */
	rules() {
		return [
			t(
				'quantumchess',
				'Sente moves first. Every piece captures the way it moves; the pawn captures straight ahead.',
			),
			t(
				'quantumchess',
				'Captured pieces join your hand unpromoted. Instead of moving you may drop one, unpromoted, onto any empty square; if a ghost might stand there, a roll decides.',
			),
			t(
				'quantumchess',
				'You may not drop a pawn on a file that holds one of your unpromoted pawns, nor a pawn, lance or knight where it could never move.',
			),
			t(
				'quantumchess',
				'You may not drop a pawn that attacks the enemy king and leaves it no escape; if that is so in only some possibilities, the drop misses in those.',
			),
			t(
				'quantumchess',
				'Every piece but the king and the golds may promote (red) when it moves into, within or out of the three far ranks; a pawn or lance on the last rank and a knight on the last two must.',
			),
			t(
				'quantumchess',
				'A tokin (promoted pawn) is not solid: it can split. A ghost promotes only in the possibilities where it really moves, and parts with different faces cannot merge.',
			),
			t(
				'quantumchess',
				'You also win by impasse: start your turn with your king, unattacked, and at least ten other pieces in the enemy camp, and at least 28 points as Sente or 27 as Gote, counting your pieces in the enemy camp and in your hand (rooks and bishops, promoted or not, 5; other pieces 1; the king 0).',
			),
			t(
				'quantumchess',
				'A player who has no move at all loses. 50 moves each without a capture, a drop or a pawn move that happens, or 500 moves in total, is a draw.',
			),
		]
	},

	/**
	 * The start position: each side has its rook on its own right and its bishop on its own left; hands are empty.
	 *
	 * @return {object}
	 */
	setup() {
		const w = emptyWorld(spec)
		for (const side of [0, 1]) {
			// Gote's army is Sente's, turned by 180 degrees
			const at = (f, r) => topology.at(side === 0 ? [f, r] : [N - 1 - f, N - 1 - r])
			for (let f = 0; f < N; f++) {
				addPiece(w, BACK[f], side, at(f, 0))
			}
			addPiece(w, 'b', side, at(1, 1))
			addPiece(w, 'r', side, at(7, 1))
			for (let f = 0; f < N; f++) {
				addPiece(w, 'p', side, at(f, 2))
			}
		}
		w.x = {}
		return w
	},

	/**
	 * The drops: every piece type in hand onto every empty square, except where the piece could never move, a pawn
	 * on a file with an own unpromoted pawn (nifu) and a pawn-drop mate (uchifuzume). The dropped piece is the
	 * lowest id of its type in the hand, the same piece in every world.
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		const out = []
		const hand = handOf(w, side)
		if (hand.size === 0) {
			return out
		}
		let pawnFiles = null
		for (const [type, ids] of hand) {
			const keys = dropKeysOf(type)
			for (let sq = 0; sq < topology.size; sq++) {
				if (w.board[sq] !== -1) {
					continue
				}
				if ((type === 'p' || type === 'l') && farRanks(side, sq, 1)) {
					continue
				}
				if (type === 'n' && farRanks(side, sq, 2)) {
					continue
				}
				if (type === 'p') {
					pawnFiles ??= pawnFilesOf(w, side)
					if (pawnFiles[fileOf(sq)] || pawnDropMate(w, side, sq, ids[0])) {
						continue
					}
				}
				out.push({
					key: keys[sq],
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
		return out
	},

	/**
	 * A captured piece changes sides and goes into the capturer's hand, unpromoted; a captured king leaves the game
	 * (and ends it).
	 *
	 * @param {object} next mutable world after the move
	 * @param {number} victim captured piece
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
		next.ty[victim] = UNPROMOTED[type] ?? type
	},

	/**
	 * A guard for the solid roll: the contents of both hands (they are the same in every world, since every capture
	 * and every drop is settled by a roll).
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
	 * The result in one world: a captured king, else the impasse of the side about to move.
	 *
	 * @param {object} w world
	 * @param {number} mover the side that just moved
	 * @return {null|{winner: number|null, reason: string}}
	 */
	worldResult(w, mover) {
		const alive = [false, false]
		for (let id = 0; id < w.sq.length; id++) {
			if (w.sq[id] >= 0 && w.ty[id] === 'k') {
				alive[w.sd[id]] = true
			}
		}
		if (!alive[0] || !alive[1]) {
			return { winner: alive[0] ? 0 : alive[1] ? 1 : null, reason: 'king' }
		}
		const next = 1 - mover
		return impasse(w, next) ? { winner: next, reason: 'impasse' } : null
	},

	/**
	 * A player who cannot make any move loses.
	 *
	 * @param {object} state state
	 * @return {{winner: number, reason: string}}
	 */
	noMoves(state) {
		return { winner: 1 - state.turn, reason: 'noMoves' }
	},

	/**
	 * Texts of the reasons this variant uses.
	 *
	 * @param {string} reason reason code
	 * @return {string|null}
	 */
	reasonText(reason) {
		switch (reason) {
			case 'impasse':
				return t('quantumchess', 'impasse: the 27-point rule')
			case 'quiet':
				return t('quantumchess', '50 moves without a capture, a drop or a pawn move')
			case 'noMoves':
				return t('quantumchess', 'the other player cannot move')
			default:
				return null
		}
	},

	/**
	 * Move codes for the move list in the shogi manner: drops as `P*5e`, a promotion with a `+` (`7c-7b+`).
	 *
	 * @param {string} code move code
	 * @return {string|null}
	 */
	codeText(code) {
		const drop = /^([a-z])@(.+)$/.exec(code)
		if (drop) {
			return drop[1].toUpperCase() + '*' + drop[2]
		}
		const promoted = /^([^|?]+)=\+[a-z]$/.exec(code)
		return promoted ? promoted[1] + '+' : null
	},

	/**
	 * Extra terms for the computer: pieces in hand are worth more than on the board, and pieces near the enemy king
	 * build an attack.
	 *
	 * @param {object} w world
	 * @param {number} side the side to evaluate for
	 * @return {number}
	 */
	evaluate(w, side) {
		const kings = [-1, -1]
		for (let id = 0; id < w.sq.length; id++) {
			if (w.ty[id] === 'k' && w.sq[id] >= 0) {
				kings[w.sd[id]] = w.sq[id]
			}
		}
		let score = 0
		for (let id = 0; id < w.sq.length; id++) {
			const sq = w.sq[id]
			const sign = w.sd[id] === side ? 1 : -1
			if (sq === HAND) {
				score += sign * HAND_BONUS * spec.types[w.ty[id]].value
			} else if (sq >= 0 && w.ty[id] !== 'k') {
				const king = kings[1 - w.sd[id]]
				if (king >= 0 && kingDistance(sq, king) <= 2) {
					score += sign * NEAR_KING
				}
			}
		}
		return score
	},
}

/**
 * The number of king steps between two squares.
 *
 * @param {number} a square
 * @param {number} b square
 * @return {number}
 */
function kingDistance(a, b) {
	return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)))
}

/**
 * The files (by file index) that hold an unpromoted pawn of a side (nifu).
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {boolean[]}
 */
export function pawnFilesOf(w, side) {
	const files = new Array(N).fill(false)
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.ty[id] === 'p' && w.sq[id] >= 0) {
			files[fileOf(w.sq[id])] = true
		}
	}
	return files
}

/**
 * Uchifuzume in one world: whether a pawn of `side` dropped on `sq` would attack the enemy king and leave it no
 * escape. Every board move of the enemy is tried (the king's first); a move that captures the dropper's king is an
 * escape, and so is every move after which the enemy king cannot be captured. Enemy drops never escape: they can
 * neither capture the pawn nor block its attack on the adjacent king.
 *
 * @param {object} w world (the square `sq` is empty)
 * @param {number} side the dropping side
 * @param {number} sq target square
 * @param {number} id the pawn in hand
 * @return {boolean}
 */
export function pawnDropMate(w, side, sq, id) {
	const kingSq = topology.step(sq, spec.orient(side, FORWARD))
	if (kingSq < 0) {
		return false
	}
	const k = w.board[kingSq]
	if (k < 0 || w.sd[k] === side || w.ty[k] !== 'k') {
		return false
	}
	const s = cloneWorld(w)
	placePiece(s, id, sq)
	const enemy = s.sd[k]
	const replies = []
	pieceMoves(spec, s, k, replies)
	for (let p = 0; p < s.sq.length; p++) {
		if (p !== k && s.sd[p] === enemy && s.sq[p] >= 0) {
			pieceMoves(spec, s, p, replies)
		}
	}
	for (const m of replies) {
		if (m.capture >= 0 && s.ty[m.capture] === 'k') {
			return false
		}
		// make the reply on the scratch world, test the king, unmake it (a promotion changes no attack of `side`)
		const { from, to, capture } = m
		if (capture >= 0) {
			s.sq[capture] = OFF
		}
		s.board[from] = -1
		s.board[to] = m.id
		s.sq[m.id] = to
		const safe = !attacks(spec, s, side, m.id === k ? to : kingSq)
		s.sq[m.id] = from
		s.board[from] = m.id
		s.board[to] = capture
		if (capture >= 0) {
			s.sq[capture] = to
		}
		if (safe) {
			return false
		}
	}
	return true
}

/**
 * The 27-point impasse rule for the side about to move: its king and at least ten other own pieces in its
 * promotion zone, at least 28 points (Sente) or 27 (Gote) from its pieces in the zone and in its hand (rooks,
 * bishops, dragons and horses 5, other pieces 1, the king 0), and its king not attacked.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {boolean}
 */
export function impasse(w, side) {
	let king = -1
	let others = 0
	let points = 0
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] !== side) {
			continue
		}
		const sq = w.sq[id]
		if (sq === HAND) {
			points += BIG.has(w.ty[id]) ? 5 : 1
		} else if (sq >= 0 && farRanks(side, sq, 3)) {
			if (w.ty[id] === 'k') {
				king = sq
			} else {
				others++
				points += BIG.has(w.ty[id]) ? 5 : 1
			}
		}
	}
	if (king < 0 || others < 10 || points < (side === 0 ? 28 : 27)) {
		return false
	}
	return !attacks(spec, w, 1 - side, king)
}

export default defineVariant(spec)
