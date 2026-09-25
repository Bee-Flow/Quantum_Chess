import { branches, applyOutcome, legalMoves, outcomes, T, STATE_VERSION, newGame, pieceLocations, budget, royalDanger, hasLegalMove, splitsFrom } from './quantum_fp.js'
import { worldFrom, nameOf } from '/home/user/Quantum_Chess/src/variants/core/world.js'
export { newGame, legalMoves, outcomes, applyOutcome, budget, royalDanger, hasLegalMove, splitsFrom, T }
export function stateOf(V, worlds, turn = 0, edit) {
  const total = worlds.reduce((a, [, w]) => a + w, 0)
  let rest = T
  const list = worlds.map(([pl, rel], i) => {
    const b = worldFrom(V, pl, {})
    b.x = { teams: false, ep: -1, epVictim: -1, castle: [] }
    if (edit) edit(b)
    const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
    rest -= w
    return { b, w }
  })
  return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}
const L = ['R', 'B', 'Y', 'G']
export function show(V, s) {
  return s.worlds.map(({ b, w }) => {
    const pcs = b.sq.map((q, id) => q >= 0 ? L[b.sd[id]] + b.ty[id].toUpperCase() + nameOf(V, q) : null).filter(Boolean).join(' ')
    const x = { ...b.x }; if (x.castle) x.castle = x.castle.map(c => L[c.side] + c.flag).join('')
    if (x.ep >= 0) x.ep = nameOf(V, x.ep); if (x.epVictim >= 0) x.epVictim = nameOf(V, x.epVictim)
    return (w / T).toFixed(3) + ' ' + pcs + ' ' + JSON.stringify(x)
  })
}
export function outs(V, s, code) {
  const o = outcomes(V, s, code)
  return o ? o.map((x) => `${x.key}${x.notes.length ? '[' + x.notes.map(n => n.slice(0, 40)).join(';') + ']' : ''} p=${x.p}`) : null
}
export function after(V, s, code, i = 0) { const r = applyOutcome(V, s, code, i); if (!r) throw new Error('illegal ' + code); return r }
export function codes(V, s) { return legalMoves(V, s).map(m => m.code) }
