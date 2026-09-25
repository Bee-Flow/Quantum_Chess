// Prototypes of antichess and horde, used only to check the research test cases on the real core.
import { orthodoxSpec } from '/home/user/Quantum_Chess/src/variants/core/orthodoxVariant.js'
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
import { castlingMoves, castlingRights, orthodoxAfterMove, pawnExtras, standardSetup } from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
import { addPiece, emptyWorld, generate } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { branches, parseCode, legalMoves as coreLegal, splitsFrom } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'

const piecesOf = (w, side) => { let n = 0; for (let id = 0; id < w.sq.length; id++) if (w.sd[id] === side && w.sq[id] >= 0) n++; return n }

// ---------- antichess
const a = orthodoxSpec({ royalKing: false, promoteTo: ['q', 'r', 'b', 'n', 'k'] })
const light = (sq) => { const c = a.topology.coords[sq]; return (c[0] + c[1]) % 2 === 1 }
Object.assign(a, {
  id: 'antichess', category: 'rules', rules: () => [],
  setup() { return standardSetup(a, 'rnbqkbnr', { castling: false }) },
  extraMoves(w, side) { return pawnExtras(a, w, side, (s, sq) => a.board.rankOf(sq) === (s === 0 ? 1 : 6)) },
  filterMoves(w, side, list) { return list.some((m) => m.capture >= 0) ? list.filter((m) => m.capture >= 0) : list },
  compulsoryCapture: true,
  worldResult(w, mover) {
    const next = 1 - mover
    if (piecesOf(w, next) === 0) return { winner: next, reason: 'allLost' }
    if (piecesOf(w, mover) === 0) return { winner: mover, reason: 'allLost' }
    if (generate(a, w, next).size === 0) return { winner: next, reason: 'stalemate' }
    // opposite-coloured bishops only
    const colours = [new Set(), new Set()]
    for (let id = 0; id < w.sq.length; id++) {
      if (w.sq[id] < 0) continue
      if (w.ty[id] !== 'b') return null
      colours[w.sd[id]].add(light(w.sq[id]))
    }
    if (colours[0].size === 1 && colours[1].size === 1 && [...colours[0]][0] !== [...colours[1]][0]) return { winner: null, reason: 'bishops' }
    return null
  },
  noMoves(state) { return { winner: state.turn, reason: 'stalemate' } },
  materialSign: -1,
})
export const ANTI = defineVariant(a)

// The proposed core rule "compulsoryCapture", emulated on top of the core for the prototype.
function captureKeys(V, state) {
  const out = new Set()
  for (const { b } of state.worlds) for (const [k, m] of generate(V, b, state.turn)) if (m.capture >= 0) out.add(k)
  return out
}
export function mustCapture(V, state) { return V.compulsoryCapture && captureKeys(V, state).size > 0 }
export function branchesC(V, state, code) {
  const list = branches(V, state, code)
  if (!list || !mustCapture(V, state)) return list
  const mv = parseCode(V, code)
  if (mv.type === 'move') return captureKeys(V, state).has(mv.key) ? list : null
  if (mv.type === 'merge') return list.some((b) => b.captures.length > 0) ? list : null
  return null
}
export function legalC(V, state, splits = false) {
  const all = coreLegal(V, state, { splits })
  return all.filter((m) => branchesC(V, state, m.code))
}

// ---------- horde
const h = orthodoxSpec()
Object.assign(h, {
  id: 'horde', category: 'rules', rules: () => [],
  setup() {
    const w = emptyWorld(h)
    const T = h.topology
    for (let r = 0; r < 4; r++) for (let f = 0; f < 8; f++) addPiece(w, 'p', 0, T.at([f, r]))
    for (const n of ['b5', 'c5', 'f5', 'g5']) addPiece(w, 'p', 0, T.byName(n))
    const back = 'rnbqkbnr'
    for (let f = 0; f < 8; f++) addPiece(w, back[f], 1, T.at([f, 7]))
    for (let f = 0; f < 8; f++) addPiece(w, 'p', 1, T.at([f, 6]))
    w.x = { ep: -1, epVictim: -1, castle: [] }
    w.x.castle = castlingRights(h, w)
    return w
  },
  extraMoves(w, side) {
    return [
      ...pawnExtras(h, w, side, (s, sq) => (s === 0 ? h.board.rankOf(sq) <= 1 : h.board.rankOf(sq) === 6)),
      ...castlingMoves(h, w, side),
    ]
  },
  afterMove(next, m) {
    orthodoxAfterMove(h, next, m)
    if (m.kind === 'double' && h.board.rankOf(m.from) === 0) { next.x.ep = -1; next.x.epVictim = -1 }
  },
  worldResult(w, mover) {
    let king = false
    for (let id = 0; id < w.sq.length; id++) if (w.sd[id] === 1 && w.ty[id] === 'k' && w.sq[id] >= 0) king = true
    if (!king) return { winner: 0, reason: 'king' }
    if (piecesOf(w, 0) === 0) return { winner: 1, reason: 'horde' }
    if (generate(h, w, 1 - mover).size === 0) return { winner: null, reason: 'stalemate' }
    return null
  },
})
export const HORDE = defineVariant(h)
export { splitsFrom }
