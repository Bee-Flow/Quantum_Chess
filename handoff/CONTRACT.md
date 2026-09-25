# Quantum variants: architecture contract (draft v1)

Goal: Quantum Chess 2.0 adds ~19 chess variants, each with the quantum element of the existing game. All run in the
browser (pass & play, and vs a built-in computer). The existing classic Quantum Chess (src/engine, lib/Engine,
online play) is untouched.

## Layers

```
src/variants/
  core/topology.js     squares, coordinates, vectors, layouts (grid n-D, masked grid, hex)
  core/world.js        the classical "piece-list world" toolkit used by most variants
  core/movegen.js      generic movement from piece descriptors (leap, ride, hop, lame leaper, oriented vectors)
  core/quantum.js      the quantum layer: worlds, weights, rolls, split/merge/measure, budget, game-end roll
  core/ai.js           generic computer player (expectimax over roll outcomes + reply threat)
  registry.js          id -> variant module
  <id>.js              one module per variant
```

## Quantum semantics (same as classic Quantum Chess rules v1, generalised)

State = list of weighted **worlds**. Each world is a complete *classical* position of the variant. Integer weights,
sum T = 2^24, rescaled by largest remainder after conditioning. The side to move, ply and result are global.

On a turn a player makes exactly one of:

- **Move**: a classical move of the variant, identified by a square-based key (`e2-e4`, `e7-e8=Q`, `N@f3` drop,
  castling as the king move). Applied world by world: in each world the key is `move`, `capture` (the variant's
  classical move generator produces the key in that world) or `miss` (it does not: piece absent, lane blocked,
  target friendly, not allowed in that world...). Legal if at least one world is not `miss`.
  - **Measured class M** (settled by a roll): the mover is a *solid* piece type (kings, pawns and whatever else the
    variant declares solid), or the target square may hold another piece in any world, or the move is a drop, or the
    variant flags the move as measured. If M and there are >= 2 distinct keys: roll one key with probability
    = its total weight over ALL worlds; keep only the worlds with that key. ("Land = roll")
  - Not in M: applied per world, no roll: worlds where it misses keep the piece on its square, so the piece becomes a
    ghost linked to whatever blocked it ("pass = link"). Budget fallback: if that would exceed the mover's budget,
    it is rolled like M.
- **Split** (splittable pieces only: by default every non-solid, non-royal piece on the board): piece X at f to t1
  and t2, both *certainly empty* (empty in every world), both reachable by a quiet classical move of X. In each world
  with X on f: two children with half the weight, X on t1 (if that quiet move is valid in the world, else stays) and
  X on t2. Never rolled. Illegal if the budget or the location bound (4 squares) would be exceeded.
- **Merge**: two parts f1, f2 of the same splittable piece X to t (reachable from both; t not friendly). Per world:
  X from f1 (if valid) else from f2 (if valid) else miss. Rolled if t may hold an enemy.
- **Measure**: an own superposed piece: roll its location, keep the matching worlds. Costs the turn.

Generic safety nets, applied after every move, in this order:
1. **Solid roll**: if some solid piece (by type) is not in the same place in every world, roll among the groups of
   worlds that agree on all solid pieces. Kings and pawns (and other solid types) are never ghosts.
2. **Game-end roll**: the variant's `worldResult(world)` is evaluated per world. If it differs between worlds, roll
   among the groups (each distinct result, and "game continues"). A game is over only when every world agrees.
   This is how three-check, antichess, horde, king of the hill, atomic, elimination in four-player etc. become
   quantum: "if the game might be over, reality decides".

Budget: B(side) = number of distinct arrangements of that side's pieces over the worlds, <= 8. Total worlds <= 64.

## Variant module interface (piece-list world variants)

```js
export default {
  id: 'atomic',
  category: 'rules',            // 'dimensions' | 'uncertainty' | 'rules' | 'boards' | 'regional'
  name: () => t('quantumchess', 'Atomic'),       // translated at call time
  summary: () => t(...), rules: () => [t(...), ...],
  sides: [{ id: 'w', name, color }, ...],        // play order; 2 or 4
  teams?: [[0, 2], [1, 3]],                      // optional
  enemies(a, b) -> bool,
  topology,                                      // from core/topology.js
  pieceTypes: { k: { moves: [...descriptors], royal, solid, splittable, value, glyph }, ... },
  options?: [{ id, type, values, default }],     // e.g. chess960 start position number
  setup(options, rng) -> world,                  // classical start world
  extraMoves?(world, side, ctx) -> classical moves (castling, en passant, double push, drops ...),
  afterMove?(world, move, info) -> void          // mutates the cloned next world: promotion, explosion, hands,
                                                 // check counters, castling rights, ep square, ...
  worldResult?(world, ctx) -> null | { winner: sideIndex | teamIndex | null, reason },
  visibility?(state, side) -> Set of squares | null   // hidden-information variants
  layout -> { cells: [{ sq, x, y, w, h, shape, shade }], width, height, labels, lines, boards }
}
```

Piece movement descriptors (vectors in topology coordinates; `oriented` vectors are turned to the side's forward):
`{ leap: vecs }`, `{ ride: vecs, range? }`, `{ hop: vecs }` (cannon capture), `{ leap: vecs, via: vec -> legVecs }`
(lame leapers: xiangqi horse/elephant), `mode: 'both' | 'move' | 'capture'`, `region: name` (palace, own side).

Variants with a completely different world shape (5D multiverse) implement the world-level functions themselves:
`generate(world, side)`, `apply(world, move)`, `occupantAt(world, sq)`, `locate(world, id)`, `worldKey(world)`,
`solidKey(world)`, `projection(world, side)`, `worldResult(world)` and a dynamic `layout(state)`.

## UI

One generic SVG board renders any layout (square cells, hex cells, intersections with grid lines, several boards
side by side or in a grid). Pieces: the cburnett sprites for orthodox types; text glyphs (kanji / hanzi / letters)
in the proper shape for other types. Ghost parts are faded with a percentage badge. Hidden-information variants
show a hand-over curtain in pass & play and only the visible squares.
