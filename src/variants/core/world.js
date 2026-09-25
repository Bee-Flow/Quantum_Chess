/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The classical side of a variant: one **world** is one ordinary position (a piece list, a board and the variant's
 * extra state), and this module generates and applies ordinary moves in it. The quantum layer (quantum.js) runs these
 * functions in every world at once.
 *
 * A world is a plain JSON object and is never changed after it was made:
 *
 *   { sq: number[]  square of every piece id (-1 off the board, -2 in its owner's hand),
 *     ty: string[]  type of every piece id,
 *     sd: number[]  side (index into variant.sides) of every piece id,
 *     board: number[] piece id on every square, -1 when empty,
 *     x: object     the variant's extra state (castling rights, en passant square, counters, ...) }
 *
 * Piece movement is declared with descriptors (see `normaliseType`); special moves come from the variant's
 * `extraMoves`, side effects from its `afterMove`. The rules of every variant are in docs/variants.md.
 */

/** Square value of a piece that has been removed from the game. */
export const OFF = -1
/** Square value of a piece that waits in its owner's hand (drop variants). */
export const HAND = -2

/**
 * @typedef {object} ClassicalMove
 * @property {string} key the move's code, the same in every world (`e2-e4`, `e7-e8=q`, `n@f3`, `O-O`)
 * @property {number} from from square (-1 for a drop)
 * @property {number} to target square
 * @property {number} id the moving (or dropped) piece in this world
 * @property {number} capture the captured piece in this world, or -1
 * @property {string|null} promo type the piece turns into
 * @property {string|null} drop dropped type
 * @property {string} kind normal, drop, castle, ep, double or a variant-specific kind
 * @property {object} [extra] variant-specific data (the rook of a castling move, ...)
 */

/**
 * Create an empty world for a variant.
 *
 * @param {object} V variant
 * @return {object}
 */
export function emptyWorld(V) {
	return { sq: [], ty: [], sd: [], board: new Array(V.topology.size).fill(-1), x: {} }
}

/**
 * Add a piece to a world under construction (setup only).
 *
 * @param {object} world world being built
 * @param {string} type piece type
 * @param {number} side side index
 * @param {number} sq square, or HAND
 * @return {number} the new piece id
 */
export function addPiece(world, type, side, sq) {
	const id = world.sq.length
	world.sq.push(sq)
	world.ty.push(type)
	world.sd.push(side)
	if (sq >= 0) {
		if (world.board[sq] !== -1) {
			throw new Error('square ' + sq + ' is occupied')
		}
		world.board[sq] = id
	}
	return id
}

/**
 * Build a world from a placement map `{ squareName: 'side:type' }`, e.g. `{ e1: '0:k', e8: '1:k' }`.
 *
 * @param {object} V variant
 * @param {Record<string, string>} placement squares and pieces
 * @param {object} [x] extra state
 * @param {Array<[number, string]>} [hand] pieces in hand as [side, type]
 * @return {object}
 */
export function worldFrom(V, placement, x = {}, hand = []) {
	const w = emptyWorld(V)
	for (const [name, piece] of Object.entries(placement)) {
		const sq = V.topology.byName(name)
		if (sq < 0) {
			throw new Error('unknown square ' + name)
		}
		const [side, type] = piece.split(':')
		addPiece(w, type, Number(side), sq)
	}
	for (const [side, type] of hand) {
		addPiece(w, type, side, HAND)
	}
	w.x = x
	return w
}

/**
 * Deep copy of plain JSON data (the `x` part of a world).
 *
 * @param {unknown} v value
 * @return {unknown}
 */
export function copyData(v) {
	if (v === null || typeof v !== 'object') {
		return v
	}
	if (Array.isArray(v)) {
		return v.map(copyData)
	}
	const out = {}
	for (const k of Object.keys(v)) {
		out[k] = copyData(v[k])
	}
	return out
}

/**
 * A copy of a world that may be changed.
 *
 * @param {object} w world
 * @return {object}
 */
export function cloneWorld(w) {
	return { sq: w.sq.slice(), ty: w.ty.slice(), sd: w.sd.slice(), board: w.board.slice(), x: copyData(w.x) }
}

/**
 * Move piece `id` to square `to` (or off the board / into a hand) in a world under construction.
 *
 * @param {object} w mutable world
 * @param {number} id piece id
 * @param {number} to square, OFF or HAND
 */
export function placePiece(w, id, to) {
	const from = w.sq[id]
	if (from >= 0 && w.board[from] === id) {
		w.board[from] = -1
	}
	w.sq[id] = to
	if (to >= 0) {
		w.board[to] = id
	}
}

/**
 * Pieces of a side in its hand, as a map type → ids (ascending).
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {Map<string, number[]>}
 */
export function handOf(w, side) {
	const out = new Map()
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] === HAND && w.sd[id] === side) {
			const list = out.get(w.ty[id]) ?? []
			list.push(id)
			out.set(w.ty[id], list)
		}
	}
	return out
}

/**
 * A text key of a world: two worlds with the same key are the same position.
 *
 * @param {object} w world
 * @return {string}
 */
export function worldKey(w) {
	const hands = []
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] === HAND) {
			hands.push(w.sd[id] + w.ty[id])
		}
	}
	hands.sort()
	const board = w.board.map((id) => (id < 0 ? '.' : w.sd[id] + w.ty[id] + id)).join(',')
	return board + '|' + hands.join('') + '|' + JSON.stringify(w.x)
}

// ---------------------------------------------------------------------------------------------------------------
// Piece types and movement descriptors
// ---------------------------------------------------------------------------------------------------------------

/**
 * Fill in the defaults of a piece type.
 *
 * A type is `{ moves, royal, solid, splittable, value, promote, glyph, name }`. Each entry of `moves` is one
 * descriptor:
 *
 * - `{ leap: vectors }`: jump to `sq + v` (the lame leapers of xiangqi add `via: v => [legVectors]`, squares that
 *   must be empty);
 * - `{ ride: vectors, range? }`: slide along each vector until blocked (at most `range` steps);
 * - `{ hop: vectors }`: the cannon of xiangqi: capture the first piece after exactly one screen;
 *
 * with the common options `mode` ('both', 'move' or 'capture'), `oriented` (the vectors are given for side 0 and
 * turned with `variant.orient`), `region(side, to, from)` (targets allowed) and `when(side, from)` (from squares
 * allowed, e.g. a pawn's double step).
 *
 * @param {object} type type as declared by the variant
 * @return {object}
 */
export function normaliseType(type) {
	const royal = Boolean(type.royal)
	const solid = type.solid ?? royal
	return {
		...type,
		royal,
		solid,
		splittable: type.splittable ?? (!solid && !royal),
		value: type.value ?? 100,
		moves: (type.moves ?? []).map((d) => ({ mode: 'both', ...d })),
	}
}

/**
 * The movement lines of a piece type for a side on a square: an array of `{ kind, d, squares, via }` where `kind` is
 * leap, ride or hop, `d` the descriptor and `squares` the squares in order (one for a leap). Cached per variant.
 *
 * @param {object} V variant
 * @param {string} type piece type
 * @param {number} side side index
 * @param {number} sq square
 * @return {object[]}
 */
export function linesOf(V, type, side, sq) {
	const key = type + ':' + side + ':' + sq
	let lines = V.lineCache.get(key)
	if (lines !== undefined) {
		return lines
	}
	lines = []
	const T = V.types[type]
	const topo = V.topology
	for (const d of T?.moves ?? []) {
		if (d.when && !d.when(side, sq)) {
			continue
		}
		const vecs = d.leap ?? d.ride ?? d.hop ?? []
		for (const raw of vecs) {
			const v = d.oriented ? V.orient(side, raw) : raw
			if (d.leap) {
				const t = topo.step(sq, v)
				if (t < 0 || (d.region && !d.region(side, t, sq))) {
					continue
				}
				const via = []
				let ok = true
				for (const leg of d.via ? d.via(raw) : []) {
					const lv = d.oriented ? V.orient(side, leg) : leg
					const s = topo.step(sq, lv)
					if (s < 0) {
						ok = false
						break
					}
					via.push(s)
				}
				if (ok) {
					lines.push({ kind: 'leap', d, squares: [t], via })
				}
			} else {
				const squares = []
				let s = sq
				const range = d.range ?? Infinity
				for (let i = 0; i < range; i++) {
					s = topo.step(s, v)
					if (s < 0) {
						break
					}
					squares.push(s)
				}
				if (squares.length) {
					lines.push({ kind: d.ride ? 'ride' : 'hop', d, squares })
				}
			}
		}
	}
	V.lineCache.set(key, lines)
	return lines
}

/**
 * The name of a square.
 *
 * @param {object} V variant
 * @param {number} sq square
 * @return {string}
 */
export function nameOf(V, sq) {
	return V.topology.names[sq]
}

/**
 * The code of an ordinary move.
 *
 * @param {object} V variant
 * @param {number} from from square
 * @param {number} to target square
 * @param {string|null} [promo] promotion type
 * @return {string}
 */
export function moveKey(V, from, to, promo = null) {
	return nameOf(V, from) + '-' + nameOf(V, to) + (promo ? '=' + promo : '')
}

/**
 * The code of a drop.
 *
 * @param {object} V variant
 * @param {string} type dropped type
 * @param {number} to target square
 * @return {string}
 */
export function dropKey(V, type, to) {
	return type + '@' + nameOf(V, to)
}

/**
 * Add a move to the output, expanded into its promotions when the piece may or must promote there.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {object[]} out output
 * @param {number} id moving piece
 * @param {number} from from square
 * @param {number} to target square
 * @param {number} capture captured piece or -1
 * @param {string} [kind] move kind
 */
export function pushMove(V, w, out, id, from, to, capture, kind = 'normal') {
	const side = w.sd[id]
	const T = V.types[w.ty[id]]
	const promo = T.promote
	if (promo && (promo.zone(side, to, from, w) || (promo.fromZone && promo.zone(side, from, from, w)))) {
		const choices = typeof promo.to === 'function' ? promo.to(side, w) : promo.to
		for (const p of choices) {
			out.push({ key: moveKey(V, from, to, p), from, to, id, capture, promo: p, drop: null, kind })
		}
		if (!promo.optional || (promo.forced && promo.forced(side, to, w))) {
			return
		}
	}
	out.push({ key: moveKey(V, from, to), from, to, id, capture, promo: null, drop: null, kind })
}

/**
 * The ordinary moves of piece `id` in world `w`, from its movement descriptors.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} id piece id
 * @param {object[]} out output
 * @param {object} [ctx] context; `ghostEnemies: true` treats empty squares as possible captures (the own view of
 *   Kriegspiel, where the enemy pieces are unknown)
 */
export function pieceMoves(V, w, id, out, ctx = {}) {
	const from = w.sq[id]
	const side = w.sd[id]
	for (const line of linesOf(V, w.ty[id], side, from)) {
		const { d, squares } = line
		if (line.kind === 'leap') {
			const t = squares[0]
			if (line.via.some((s) => w.board[s] !== -1)) {
				continue
			}
			const occ = w.board[t]
			if (occ === -1) {
				if (d.mode !== 'capture') {
					pushMove(V, w, out, id, from, t, -1)
				} else if (ctx.ghostEnemies) {
					pushMove(V, w, out, id, from, t, -1, 'try')
				}
			} else if (d.mode !== 'move' && V.enemies(side, w.sd[occ])) {
				pushMove(V, w, out, id, from, t, occ)
			}
		} else if (line.kind === 'ride') {
			for (const t of squares) {
				const occ = w.board[t]
				if (occ === -1) {
					if (d.mode !== 'capture') {
						pushMove(V, w, out, id, from, t, -1)
					}
					continue
				}
				if (d.mode !== 'move' && V.enemies(side, w.sd[occ])) {
					pushMove(V, w, out, id, from, t, occ)
				}
				break
			}
		} else {
			let screen = false
			for (const t of squares) {
				const occ = w.board[t]
				if (occ === -1) {
					continue
				}
				if (!screen) {
					screen = true
					continue
				}
				if (V.enemies(side, w.sd[occ])) {
					pushMove(V, w, out, id, from, t, occ)
				}
				break
			}
		}
	}
}

/**
 * All ordinary moves of a side in a world: the descriptor moves of every piece on the board, plus the variant's
 * special moves, filtered by the variant's `filterMoves` (compulsory captures, ...). The result is a map key → move
 * and is cached per world and side.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @return {Map<string, ClassicalMove>}
 */
export function generate(V, w, side) {
	let perSide = V.genCache.get(w)
	if (perSide === undefined) {
		perSide = new Map()
		V.genCache.set(w, perSide)
	}
	let map = perSide.get(side)
	if (map !== undefined) {
		return map
	}
	let list = []
	if (V.generate) {
		list = V.generate(w, side)
	} else {
		for (let id = 0; id < w.sq.length; id++) {
			if (w.sd[id] === side && w.sq[id] >= 0) {
				pieceMoves(V, w, id, list)
			}
		}
		if (V.extraMoves) {
			list.push(...V.extraMoves(w, side))
		}
		if (V.filterMoves) {
			list = V.filterMoves(w, side, list)
		}
	}
	map = new Map()
	for (const m of list) {
		if (!map.has(m.key)) {
			map.set(m.key, m)
		}
	}
	perSide.set(side, map)
	return map
}

/**
 * Apply an ordinary move to a world and return the new world. The move must come from `generate` for this world.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {ClassicalMove} m move
 * @return {object}
 */
export function applyClassical(V, w, m) {
	if (V.apply) {
		return V.apply(w, m)
	}
	const next = cloneWorld(w)
	if (m.capture >= 0) {
		capturePiece(V, next, m.capture, m)
	}
	placePiece(next, m.id, m.to)
	if (m.promo) {
		next.ty[m.id] = m.promo
	}
	if (m.extra?.rook) {
		const { id, to } = m.extra.rook
		if (next.board[to] !== -1 && next.board[to] !== id) {
			throw new Error('castling rook target occupied')
		}
		placePiece(next, id, to)
		next.board[m.to] = m.id
	}
	if (V.afterMove) {
		V.afterMove(next, m, w)
	}
	return next
}

/**
 * Remove a captured piece: off the board, or into the capturer's hand in drop variants (`variant.onCapture`).
 *
 * @param {object} V variant
 * @param {object} next mutable world
 * @param {number} victim captured piece
 * @param {ClassicalMove} m the capturing move
 */
export function capturePiece(V, next, victim, m) {
	if (V.onCapture) {
		V.onCapture(next, victim, m)
	} else {
		placePiece(next, victim, OFF)
	}
}

/**
 * Whether piece `id` could capture on square `target` in world `w` with an ordinary move (descriptor moves only;
 * used for "check" and for attack maps).
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side attacking side
 * @param {number} target square
 * @return {boolean}
 */
export function attacks(V, w, side, target) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] !== side || w.sq[id] < 0) {
			continue
		}
		for (const line of linesOf(V, w.ty[id], side, w.sq[id])) {
			const { d, squares } = line
			if (d.mode === 'move') {
				continue
			}
			if (line.kind === 'leap') {
				if (squares[0] === target && !line.via.some((s) => w.board[s] !== -1)) {
					return true
				}
			} else if (line.kind === 'ride') {
				for (const t of squares) {
					if (t === target) {
						return true
					}
					if (w.board[t] !== -1) {
						break
					}
				}
			} else {
				let screen = false
				for (const t of squares) {
					if (t === target) {
						if (screen) {
							return true
						}
						break
					}
					if (w.board[t] !== -1) {
						if (screen) {
							break
						}
						screen = true
					}
				}
			}
		}
	}
	return false
}

/**
 * The squares of the royal pieces of a side in a world.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @return {number[]}
 */
export function royalSquares(V, w, side) {
	const out = []
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.sq[id] >= 0 && V.types[w.ty[id]]?.royal) {
			out.push(w.sq[id])
		}
	}
	return out
}

/**
 * Whether a side still has a royal piece on the board.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @return {boolean}
 */
export function hasRoyal(V, w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.sq[id] >= 0 && V.types[w.ty[id]]?.royal) {
			return true
		}
	}
	return false
}

/**
 * Whether a side attacks any royal piece of `victim` in the world (a "check" in variants that count them).
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side attacking side
 * @param {number} victim attacked side
 * @return {boolean}
 */
export function givesCheck(V, w, side, victim) {
	return royalSquares(V, w, victim).some((s) => attacks(V, w, side, s))
}
