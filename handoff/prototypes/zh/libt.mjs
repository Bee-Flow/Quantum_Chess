const Q = './quantum_team.js'
const { branches, applyOutcome, legalMoves, outcomes, T, STATE_VERSION, newGame, pieceLocations, handView, budget, ownPieceAt, splitsFrom } = await import(Q)
const { worldFrom, nameOf, HAND } = await import('/home/user/Quantum_Chess/src/variants/core/world.js')
export { newGame, legalMoves, outcomes, applyOutcome, handView, budget, ownPieceAt, splitsFrom, pieceLocations, T, branches }
export function stateOf(V, worlds, turn = 0, edit) {
  const total = worlds.reduce((a, [, w]) => a + w, 0)
  let rest = T
  const list = worlds.map(([pl, rel, hand], i) => {
    const b = worldFrom(V, pl, {}, hand ?? [])
    b.x = { ep: [-1, -1], epVictim: [-1, -1], castle: [] }
    if (edit) edit(b)
    const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
    rest -= w
    return { b, w }
  })
  return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}
export function show(V, s) {
  return s.worlds.map(({ b, w }) => {
    const pcs = b.sq.map((q, id) => q >= 0 ? `${b.sd[id]}${b.ty[id]}@${nameOf(V, q)}` : q === HAND ? `hand${b.sd[id]}:${b.ty[id]}` : null).filter(Boolean).join(' ')
    return (w / T).toFixed(4) + ' ' + pcs + ' ep=' + JSON.stringify(b.x.ep)
  })
}
export function outs(V, s, code) {
  const o = outcomes(V, s, code)
  return o ? o.map((x) => `${x.key}${x.notes.length ? '[' + x.notes.join(';') + ']' : ''} p=${x.p.toFixed(4)}${x.rolled ? ' rolled' : ''}`) : null
}
export function after(V, s, code, i = 0) { const n = applyOutcome(V, s, code, i); if (!n) throw new Error('illegal ' + code); return n }
export function codes(V, s) { return legalMoves(V, s).map(m => m.code) }
