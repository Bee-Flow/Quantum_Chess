import { FOUR as V } from './proto.mjs'
import { newGame, after, outs } from './lib.mjs'
for (const mode of ['ffa', 'teams']) {
  let s = newGame(V, { mode })
  for (const m of ['h2-h3', 'b8-d8', 'e14-f12', 'm7-l7']) s = after(V, s, m)
  console.log(mode, outs(V, s, 'g1-n8'))
  const a = after(V, s, 'g1-n8')
  console.log(mode, 'turn', a.turn, JSON.stringify(a.result), 'green pieces left', a.worlds[0].b.sq.filter((q, id) => q >= 0 && a.worlds[0].b.sd[id] === 3).length)
}
