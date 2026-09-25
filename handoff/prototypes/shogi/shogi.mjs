// Prototype of the shogi variant on the real variants core, only to check the research spec (handoff/research/shogi.md).
// Not production code: names are plain strings, no t(), no JSDoc.
import { defineVariant } from '../../../src/variants/core/variant.js'
import { rectTopology } from '../../../src/variants/core/topology.js'
import { BISHOP_DIRS, KING_STEPS, ROOK_DIRS } from '../../../src/variants/core/orthodox.js'
import {
	addPiece, attacks, cloneWorld, dropKey, emptyWorld, HAND, handOf, OFF, pieceMoves, placePiece,
} from '../../../src/variants/core/world.js'

const RANKS = 'abcdefghi'
// file index f = 0..8 is shogi file 9..1 (left to right from Sente's side); rank index r = 0..8 is rank i..a
const labels = []
for (let f = 0; f < 9; f++) labels.push({ x: f + 0.5, y: -0.32, text: String(9 - f) })
for (let k = 0; k < 9; k++) labels.push({ x: 9.3, y: k + 0.5, text: RANKS[k] })
for (const [x, y] of [[3, 3], [6, 3], [3, 6], [6, 6]]) labels.push({ x, y, text: '•', dot: true })
const topology = rectTopology(9, 9, {
	name: (f, r) => String(9 - f) + RANKS[8 - r],
	shade: () => 'wood',
	noLabels: true,
	layout: { labels },
})
const rankOf = (sq) => topology.coords[sq][1]
const fileOf = (sq) => topology.coords[sq][0]
// the n farthest ranks for a side (n = 3: the promotion zone)
export const farRanks = (side, sq, n) => (side === 0 ? rankOf(sq) >= 9 - n : rankOf(sq) <= n - 1)
const inZone = (side, sq) => farRanks(side, sq, 3)

const GOLD = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]]
const SILVER = [[0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
const KNIGHT = [[1, 2], [-1, 2]]
const promote = (to, forcedRanks = 0) => ({
	zone: (side, sq) => inZone(side, sq),
	fromZone: true,
	to: [to],
	optional: true,
	forced: forcedRanks ? (side, sq) => farRanks(side, sq, forcedRanks) : undefined,
})
const glyph = (text, promoted = false) => ({ text, shape: 'shogi', promoted })
const gold = (name, value, text) => ({ name, moves: [{ leap: GOLD, oriented: true }], value, glyph: glyph(text, true) })
export const BIG = new Set(['r', 'b', '+r', '+b'])

const spec = {
	id: 'shogi',
	category: 'regional',
	drops: true,
	maxPly: 500,
	sides: [
		{ id: 's', name: 'Sente', color: 'black' },
		{ id: 'g', name: 'Gote', color: 'white' },
	],
	topology,
	types: {
		k: { name: 'King', moves: [{ leap: KING_STEPS }], royal: true, solid: true, value: 0,
			glyph: { text: (side) => (side === 0 ? '玉' : '王'), shape: 'shogi' } },
		r: { name: 'Rook', moves: [{ ride: ROOK_DIRS }], value: 1300, promote: promote('+r'), glyph: glyph('飛') },
		b: { name: 'Bishop', moves: [{ ride: BISHOP_DIRS }], value: 1100, promote: promote('+b'), glyph: glyph('角') },
		g: { name: 'Gold general', moves: [{ leap: GOLD, oriented: true }], value: 800, glyph: glyph('金') },
		s: { name: 'Silver general', moves: [{ leap: SILVER, oriented: true }], value: 700, promote: promote('+s'),
			glyph: glyph('銀') },
		n: { name: 'Knight', moves: [{ leap: KNIGHT, oriented: true }], value: 500, promote: promote('+n', 2),
			glyph: glyph('桂') },
		l: { name: 'Lance', moves: [{ ride: [[0, 1]], oriented: true }], value: 400, promote: promote('+l', 1),
			glyph: glyph('香') },
		p: { name: 'Pawn', moves: [{ leap: [[0, 1]], oriented: true }], solid: true, value: 100,
			promote: promote('+p', 1), glyph: glyph('歩') },
		'+r': { name: 'Dragon', moves: [{ ride: ROOK_DIRS }, { leap: BISHOP_DIRS }], value: 1700, glyph: glyph('龍', true) },
		'+b': { name: 'Horse', moves: [{ ride: BISHOP_DIRS }, { leap: ROOK_DIRS }], value: 1500, glyph: glyph('馬', true) },
		'+s': gold('Promoted silver', 800, '全'),
		'+n': gold('Promoted knight', 900, '圭'),
		'+l': gold('Promoted lance', 900, '杏'),
		'+p': gold('Tokin', 1000, 'と'),
	},
	rules: () => [],
	setup() {
		const w = emptyWorld(spec)
		const back = 'lnsgkgsnl'
		for (const side of [0, 1]) {
			const at = (f, r) => topology.at(side === 0 ? [f, r] : [8 - f, 8 - r])
			for (let f = 0; f < 9; f++) addPiece(w, back[f], side, at(f, 0))
			addPiece(w, 'b', side, at(1, 1))
			addPiece(w, 'r', side, at(7, 1))
			for (let f = 0; f < 9; f++) addPiece(w, 'p', side, at(f, 2))
		}
		w.x = {}
		return w
	},
	extraMoves(w, side) {
		const out = []
		const hand = handOf(w, side)
		if (hand.size === 0) return out
		let pawnFiles = null
		for (const [type, ids] of hand) {
			for (let sq = 0; sq < topology.size; sq++) {
				if (w.board[sq] !== -1) continue
				if ((type === 'p' || type === 'l') && farRanks(side, sq, 1)) continue
				if (type === 'n' && farRanks(side, sq, 2)) continue
				if (type === 'p') {
					pawnFiles ??= pawnFilesOf(w, side)
					if (pawnFiles.has(fileOf(sq))) continue
					if (pawnDropMate(w, side, sq, ids[0])) continue
				}
				out.push({ key: dropKey(spec, type, sq), from: -1, to: sq, id: ids[0], capture: -1, promo: null,
					drop: type, kind: 'drop' })
			}
		}
		return out
	},
	onCapture(next, victim, m) {
		const t = next.ty[victim]
		if (spec.types[t].royal) {
			placePiece(next, victim, OFF)
			return
		}
		placePiece(next, victim, HAND)
		next.sd[victim] = next.sd[m.id]
		next.ty[victim] = t[0] === '+' ? t.slice(1) : t
	},
	solidExtra(b) {
		const out = []
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] === HAND) out.push(b.sd[id] + b.ty[id])
		return out.sort().join('')
	},
	worldResult(w, mover) {
		const alive = [false, false]
		for (let id = 0; id < w.sq.length; id++) if (w.sq[id] >= 0 && w.ty[id] === 'k') alive[w.sd[id]] = true
		if (!alive[0] || !alive[1]) {
			return alive[0] || alive[1] ? { winner: alive[0] ? 0 : 1, reason: 'king' } : { winner: null, reason: 'king' }
		}
		const next = 1 - mover
		return impasse(w, next) ? { winner: next, reason: 'impasse' } : null
	},
	noMoves(state) {
		return { winner: 1 - state.turn, reason: 'noMoves' }
	},
	evaluate(w, side) {
		let s = 0
		let kings = [-1, -1]
		for (let id = 0; id < w.sq.length; id++) if (w.ty[id] === 'k' && w.sq[id] >= 0) kings[w.sd[id]] = w.sq[id]
		for (let id = 0; id < w.sq.length; id++) {
			const v = spec.types[w.ty[id]].value
			const sign = w.sd[id] === side ? 1 : -1
			if (w.sq[id] === HAND) {
				s += sign * 0.3 * v
			} else if (w.sq[id] >= 0 && w.ty[id] !== 'k') {
				const ek = kings[1 - w.sd[id]]
				if (ek >= 0) {
					const d = Math.max(Math.abs(fileOf(ek) - fileOf(w.sq[id])), Math.abs(rankOf(ek) - rankOf(w.sq[id])))
					if (d <= 2) s += sign * 15
				}
			}
		}
		return s
	},
}

// files (file index) holding an unpromoted pawn of the side
export function pawnFilesOf(w, side) {
	const files = new Set()
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.ty[id] === 'p' && w.sq[id] >= 0) files.add(fileOf(w.sq[id]))
	}
	return files
}

// Uchifuzume in one world: the pawn dropped on sq attacks the enemy king, and every board move of the enemy leaves
// its king capturable (or the enemy has no board move). A reply that captures the dropper's king is an escape.
// Enemy drops never escape an attack by an adjacent pawn, so they are not tried.
export function pawnDropMate(w, side, sq, id) {
	const kingSq = topology.step(sq, spec.orient(side, [0, 1]))
	if (kingSq < 0) return false
	const k = w.board[kingSq]
	const enemy = 1 - side
	if (k < 0 || w.sd[k] !== enemy || !spec.types[w.ty[k]].royal) return false
	const w2 = cloneWorld(w)
	placePiece(w2, id, sq)
	const replies = []
	pieceMoves(spec, w2, k, replies) // king first: the usual escapes
	for (let pid = 0; pid < w2.sq.length; pid++) {
		if (pid !== k && w2.sd[pid] === enemy && w2.sq[pid] >= 0) pieceMoves(spec, w2, pid, replies)
	}
	for (const m of replies) {
		if (m.capture >= 0 && spec.types[w2.ty[m.capture]].royal) return false
		const w3 = cloneWorld(w2)
		if (m.capture >= 0) placePiece(w3, m.capture, OFF)
		placePiece(w3, m.id, m.to)
		if (!attacks(spec, w3, side, m.id === k ? m.to : kingSq)) return false
	}
	return true
}

// the 27-point impasse declaration, checked for the side about to move
export function impasse(w, side) {
	let king = -1
	let count = 0
	let points = 0
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] !== side) continue
		const sq = w.sq[id]
		if (sq === HAND) {
			points += BIG.has(w.ty[id]) ? 5 : 1
		} else if (sq >= 0 && inZone(side, sq)) {
			if (w.ty[id] === 'k') {
				king = sq
			} else {
				count++
				points += BIG.has(w.ty[id]) ? 5 : 1
			}
		}
	}
	if (king < 0 || count < 10 || points < (side === 0 ? 28 : 27)) return false
	return !attacks(spec, w, 1 - side, king)
}

export const SHOGI = defineVariant(spec)
