import { V, visibility, names, newGame, applyOutcome, br, st, legalMoves, squareView, N, pieceLocations, royalDanger } from './proto.mjs'
let s = newGame(V)
const before = visibility(s, 0)
s = applyOutcome(V, s, 'g1-f3|h3', 0)
const after = visibility(s, 0)
console.log('D7 new squares', names([...after].filter(q => !before.has(q))).join(' '), 'lost', names([...before].filter(q => !after.has(q))).join(' '))
console.log('D7 black sees', visibility(s, 1).size)
// D8 rook and knight ghost
let s8 = st([[{ a1: '0:r', e1: '0:k', e8: '1:k', a5: '1:n' }, 1], [{ a1: '0:r', e1: '0:k', e8: '1:k', h5: '1:n' }, 1]], 0)
console.log('D8 vis', names(visibility(s8, 0)).join(' '))
console.log('D8 a5 view', JSON.stringify(squareView(s8, V.topology.byName('a5'))))
console.log('D8 a1-a5', JSON.stringify(br(s8, 'a1-a5')))
console.log('D8 a1-a8', JSON.stringify(br(s8, 'a1-a8')))
let s8b = applyOutcome(V, s8, 'a1-a8', 0)
console.log('D8 rook locs', JSON.stringify(pieceLocations(s8b, 0).map(l => [N(l.sq), l.p])))
console.log('D8 black vis', names(visibility(s8b, 1)).join(' '))
console.log('D8 black danger', royalDanger(V, s8b, 1))
// black passes with king move e8-d8? then white. Let black play h-knight... Let black play e8-f8? Instead test white capture after a black null-ish move: black king e8-e7
let s8c = applyOutcome(V, s8b, 'e8-d8', 0)
console.log('D8 after Kd8 white vis', names(visibility(s8c, 0)).join(' '))
let s8d = applyOutcome(V, s8b, 'e8-f8', 0)
// Instead let black do a quiet knight move? knight is ghost; knight part a5-b7:
console.log('D8 black moves', legalMoves(V, s8b).map(m=>m.code).join(' '))
