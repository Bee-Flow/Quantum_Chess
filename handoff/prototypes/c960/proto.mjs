// Prototypes of chess960, koth and threecheck used only to check the research test cases.
import { orthodoxSpec } from '/home/user/Quantum_Chess/src/variants/core/orthodoxVariant.js'
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
import { castlingRights, castlingMoves, orthodoxAfterMove, pawnExtras, standardSetup } from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
import { attacks, linesOf, cloneWorld, placePiece, capturePiece, applyClassical, hasRoyal } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { sp } from './sp.mjs'

// ---------- chess960
const c960 = orthodoxSpec()
Object.assign(c960, {
  id: 'chess960', category: 'rules', rules: () => [],
  setup(options) { const n = Number.isInteger(options.position) ? options.position : 518; return standardSetup(c960, sp(n).toLowerCase()) },
  extraMoves(w, side) {
    return [
      ...pawnExtras(c960, w, side, (s, sq) => c960.board.rankOf(sq) === (s === 0 ? 1 : 6)),
      ...castlingMoves(c960, w, side).map((m) => { const c = w.x.castle.find((c) => c.side === side && c.king === m.from && (m.key === 'O-O') === (c.flag === 'K' || c.flag === 'k')); return { ...m, to: c.rook, extra: { ...m.extra, kingTo: c.kingTo } } }),
    ]
  },
  apply(w, m) {
    const next = cloneWorld(w)
    if (m.capture >= 0) capturePiece(c960, next, m.capture, m)
    if (m.kind === 'castle') {
      // lift both, then place both (handles every overlap)
      const rook = m.extra.rook.id
      placePiece(next, m.id, -1); placePiece(next, rook, -1)
      placePiece(next, m.id, m.extra.kingTo); placePiece(next, rook, m.extra.rook.to)
    } else {
      placePiece(next, m.id, m.to)
      if (m.promo) next.ty[m.id] = m.promo
    }
    orthodoxAfterMove(c960, next, m)
    return next
  },
})
export const CHESS960 = defineVariant(c960)

// ---------- koth
const HILL = ['d4', 'e4', 'd5', 'e5']
const k = orthodoxSpec()
const hillSet = () => new Set(HILL.map((n) => k.topology.byName(n)))
Object.assign(k, {
  id: 'koth', category: 'rules', rules: () => [],
  filterMoves(w, side, list) {
    const hill = hillSet()
    return list.filter((m) => {
      if (w.ty[m.id] !== 'k' || !hill.has(m.to) || m.kind === 'castle') return true
      const next = applyClassical(k, w, m)
      return !attacks(k, next, 1 - side, m.to)
    })
  },
  worldResult(w, mover) {
    for (const s of [0, 1]) if (!hasRoyal(k, w, s)) return { winner: 1 - s, reason: 'king' }
    const hill = hillSet()
    for (let id = 0; id < w.sq.length; id++) if (w.ty[id] === 'k' && hill.has(w.sq[id])) return { winner: w.sd[id], reason: 'hill' }
    return null
  },
})
export const KOTH = defineVariant(k)

// ---------- threecheck
const t3 = orthodoxSpec()
function checked(V, w, side, victim) {
  const ks = []
  for (let id = 0; id < w.sq.length; id++) if (w.sd[id] === victim && w.sq[id] >= 0 && w.ty[id] === 'k') ks.push(w.sq[id])
  for (let id = 0; id < w.sq.length; id++) {
    if (w.sd[id] !== side || w.sq[id] < 0 || w.ty[id] === 'k') continue
    for (const line of linesOf(V, w.ty[id], side, w.sq[id])) {
      if (line.d.mode === 'move') continue
      if (line.kind === 'leap') { if (ks.includes(line.squares[0]) && !line.via.some((s) => w.board[s] !== -1)) return true }
      else for (const t of line.squares) { if (ks.includes(t)) return true; if (w.board[t] !== -1) break }
    }
  }
  return false
}
Object.assign(t3, {
  id: 'threecheck', category: 'rules', rules: () => [],
  setup() { const w = standardSetup(t3, 'rnbqkbnr'); w.x.checks = [0, 0]; return w },
  afterMove(next, m, prev) {
    orthodoxAfterMove(t3, next, m)
    const side = prev.sd[m.id]
    if (!next.x.checks) next.x.checks = [0, 0]
    if (checked(t3, next, side, 1 - side)) next.x.checks[side]++
  },
  solidExtra(w) { return (w.x.checks ?? [0, 0]).join(':') },
  worldResult(w, mover) {
    for (const s of [0, 1]) if (!hasRoyal(t3, w, s)) return { winner: 1 - s, reason: 'king' }
    const c = w.x.checks ?? [0, 0]
    for (const s of [0, 1]) if (c[s] >= 3) return { winner: s, reason: 'checks' }
    return null
  },
})
export const THREECHECK = defineVariant(t3)
