// Prototypes of capablanca and makruk on the real variants core, used only to check the research test cases.
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
import { whiteBlack } from '/home/user/Quantum_Chess/src/variants/core/orthodoxVariant.js'
import {
  castlingMoves, orthodoxAfterMove, orthodoxTypes, pawnExtras, standardBoard, standardSetup,
  KING_STEPS, ROOK_DIRS, BISHOP_DIRS, KNIGHT_JUMPS,
} from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
import { hasRoyal } from '/home/user/Quantum_Chess/src/variants/core/world.js'

// ---------- capablanca
const cb = standardBoard(10, 8)
const capaTypes = orthodoxTypes({ lastRank: cb.lastRank, promoteTo: ['q', 'c', 'a', 'r', 'b', 'n'] })
capaTypes.a = { name: 'Archbishop', moves: [{ ride: BISHOP_DIRS }, { leap: KNIGHT_JUMPS }], value: 825, glyph: { text: 'A', shape: 'circle' } }
capaTypes.c = { name: 'Chancellor', moves: [{ ride: ROOK_DIRS }, { leap: KNIGHT_JUMPS }], value: 850, glyph: { text: 'C', shape: 'circle' } }
const capa = {
  id: 'capablanca', category: 'boards', rules: () => [],
  sides: whiteBlack(), topology: cb.topology, board: cb, types: capaTypes,
  setup() { return standardSetup(capa, 'rnabqkbcnr') },
  extraMoves(w, side) {
    return [
      ...pawnExtras(capa, w, side, (s, sq) => cb.rankOf(sq) === (s === 0 ? 1 : 6)),
      ...castlingMoves(capa, w, side),
    ]
  },
  afterMove(next, m) { orthodoxAfterMove(capa, next, m) },
}
export const CAPA = defineVariant(capa)

// ---------- makruk
const mb = standardBoard(8, 8)
const rankOf = mb.rankOf
const mkTypes = {
  k: { name: 'Khun', moves: [{ leap: KING_STEPS }], royal: true, solid: true, value: 400, glyph: { sprite: 'k' } },
  m: { name: 'Met', moves: [{ leap: BISHOP_DIRS }], value: 180, glyph: { text: 'M', shape: 'circle' } },
  s: { name: 'Khon', moves: [{ leap: BISHOP_DIRS }, { leap: [[0, 1]], oriented: true }], value: 250, glyph: { text: 'S', shape: 'circle' } },
  n: { name: 'Ma', moves: [{ leap: KNIGHT_JUMPS }], value: 300, glyph: { sprite: 'n' } },
  r: { name: 'Rua', moves: [{ ride: ROOK_DIRS }], value: 500, glyph: { sprite: 'r' } },
  p: {
    name: 'Bia',
    moves: [{ leap: [[0, 1]], oriented: true, mode: 'move' }, { leap: [[1, 1], [-1, 1]], oriented: true, mode: 'capture' }],
    solid: true, value: 100, glyph: { sprite: 'p' },
    promote: { zone: (side, sq) => (side === 0 ? rankOf(sq) >= 5 : rankOf(sq) <= 2), to: ['+p'] },
  },
  '+p': { name: 'Bia Ngai', moves: [{ leap: BISHOP_DIRS }], value: 180, glyph: { text: 'M', shape: 'circle' } },
}
const LIMITS = (w, strong) => {
  const cnt = (t) => w.sq.filter((q, id) => q >= 0 && w.sd[id] === strong && w.ty[id] === t).length
  if (cnt('r') >= 2) return 8
  if (cnt('r') === 1) return 16
  if (cnt('s') >= 2) return 22
  if (cnt('n') >= 2) return 32
  if (cnt('s') === 1) return 44
  return 64
}
const onBoard = (w) => w.sq.filter((q) => q >= 0).length
const bare = (w, side) => w.sq.every((q, id) => q < 0 || w.sd[id] !== side || w.ty[id] === 'k')
const anyBia = (w) => w.sq.some((q, id) => q >= 0 && w.ty[id] === 'p')
export function countInfo(V, state) {
  const ws = state.worlds.map((e) => e.b)
  if (ws.some(anyBia)) return null
  for (const lone of [0, 1]) {
    if (!ws.every((w) => bare(w, lone))) continue
    const strong = 1 - lone
    if (ws.every((w) => bare(w, strong))) return { kind: 'bare' }
    const allow = Math.max(...ws.map((w) => LIMITS(w, strong) - onBoard(w) + 1))
    const q = state.quiet
    const chaserMoves = state.turn === lone ? Math.ceil(q / 2) : Math.floor(q / 2)
    return { kind: 'piece', lone, strong, allow, chaserMoves, limit: Math.max(...ws.map((w) => LIMITS(w, strong))) }
  }
  return { kind: 'board', moves: Math.floor(state.quiet / 2) }
}
const mk = {
  id: 'makruk', category: 'regional', rules: () => [],
  sides: whiteBlack(), topology: mb.topology, board: mb, types: mkTypes,
  quietPlies: 128,
  setup() {
    const V = mk
    const w = standardSetup(V, 'rnsk' + 'msnr', { pawnRank: 2, castling: false })
    // standardSetup mirrors the files for Black (same type on the same file); makruk is point-symmetric: swap d8/e8
    const d8 = V.topology.byName('d8'), e8 = V.topology.byName('e8')
    const a = w.board[d8], b = w.board[e8]
    w.board[d8] = b; w.board[e8] = a; w.sq[a] = e8; w.sq[b] = d8
    w.x = {}
    return w
  },
  stateResult(state) {
    const c = countInfo(mk, state)
    if (!c) return null
    if (c.kind === 'bare') {
      const w = state.worlds[0].b
      const ks = w.sq.filter((q, id) => q >= 0 && w.ty[id] === 'k').map((q) => mb.topology.coords[q])
      const adj = ks.length === 2 && Math.abs(ks[0][0] - ks[1][0]) <= 1 && Math.abs(ks[0][1] - ks[1][1]) <= 1
      return adj ? null : { winner: null, reason: 'bareKings' }
    }
    if (c.kind === 'piece' && c.chaserMoves >= c.allow) return { winner: null, reason: 'count' }
    return null
  },
}
export const MAKRUK = defineVariant(mk)
export { hasRoyal }
