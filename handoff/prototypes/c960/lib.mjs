import { branches, applyOutcome, legalMoves, outcomes, T, STATE_VERSION, newGame, pieceLocations } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { worldFrom, nameOf } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { castlingRights } from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
export { newGame, legalMoves, outcomes, applyOutcome }
export function stateOf(V, worlds, turn = 0, edit) {
  const total = worlds.reduce((a, [, w]) => a + w, 0)
  let rest = T
  const list = worlds.map(([pl, rel], i) => {
    const b = worldFrom(V, pl, {})
    b.x = { ep: -1, epVictim: -1, castle: [] }
    if (edit) edit(b)
    const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
    rest -= w
    return { b, w }
  })
  return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}
export const withCastle = (V) => (b) => { b.x.castle = castlingRights(V, b) }
export function show(V, s) {
  return s.worlds.map(({ b, w }) => {
    const pcs = b.sq.map((q, id) => q >= 0 ? (b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + nameOf(V, q) : null).filter(Boolean).join(' ')
    const x = { ...b.x }; if (x.castle) x.castle = x.castle.map(c => c.flag).join('')
    return (w / T).toFixed(3) + ' ' + pcs + ' ' + JSON.stringify(x)
  })
}
export function outs(V, s, code) {
  const o = outcomes(V, s, code)
  return o ? o.map((x) => `${x.key}${x.notes.length ? '[' + x.notes.join(';') + ']' : ''} p=${x.p}`) : null
}
export function after(V, s, code, i = 0) { return applyOutcome(V, s, code, i) }
export function codes(V, s) { return legalMoves(V, s).map(m => m.code) }
