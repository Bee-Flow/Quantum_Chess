# Variant spec: `hexagonal` (Gliński's hexagonal chess, 1936/1949)

Category: `boards` (as in `src/variants/catalog.js`; the current placeholder module wrongly says `rules`). UI name:
"Hexagonal chess". Summary (already in the catalogue): "Gliński's chess on 91 hexagons, with three bishops each."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the egress proxy for every rules site (wikipedia.org, wikibooks.org,
chessvariants.com, greenchess.net). So the rules below come from search-engine extracts of those pages, from open-source
implementations cloned from GitHub, and from one PDF that reproduces the Wikipedia diagrams. Every number in this spec
(move counts, perft, target lists) was computed with a reference generator, `handoff/tools/hexchess.py`. That
generator's **legal** perft matches the published perft of two independent engines exactly (see below).

| Source | What it gives |
|---|---|
| Wikipedia, "Hexagonal chess", section Gliński: https://en.wikipedia.org/wiki/Hexagonal_chess (search extracts only) | 91 cells in three colours, files a-l without j, the setup, the pawn rules: "If a pawn captures an enemy piece and lands on the starting hex of any friendly pawn it may still move two hexes forward", captures "one hex orthogonally forward at a 60-degree angle to the vertical", en passant. Stalemate scores 3/4 to the stalemating player and 1/4 to the stalemated player. |
| Chess Variant Pages, "Glinski's Hexagonal Chess": https://www.chessvariants.com/hexagonal.dir/hexagonal.html (search extracts only) | The same rules: vertical files and V-shaped ranks, no j. "All pawns can make a double step from their starting cells." No castling. |
| J. M. Coskey, *Gliński's Hexagonal Chess: Board Template and Rules* (CC BY-SA 2023), https://github.com/jaycoskey/Games_MakeGlinskiChessBoard (PDF read in full) | Rooks move toward 12, 2, 4, 6, 8 and 10 o'clock and bishops toward 1, 3, 5, 7, 9 and 11 o'clock: the cells are flat-topped and the files vertical. Knight: "two cells in any rook direction, then turn 60 degrees left or right and move one more cell". Pawns capture toward 10 and 2 o'clock. No castling. Stalemate 3/4–1/4. A fool's mate: `1. Qe1-c3 Qe10-c6 2. b1-b2 b7-b6 3. Bf3-b1 e7-e6 4. Qc3xf9#`. Piece values as reported: Gliński Q 10, R 5, N 4, B 3, P 1; a self-play engine Q 9.5, R 5.63, B 3.33, N 3.05. The PDF also embeds the **Wikipedia setup diagram**. I sampled its pixels to get the exact cell colours (all 91 cells match the formula in 2.1). |
| talvola/abstract_games, `engine/games/glinski_chess/{rules.md,game.py,selftest.py}` (read) | A complete implementation. Its legal **perft from the start position is 51 / 2,586 / 137,858**, checked node by node against scottbedard/hexchess (the engine behind hexchess.club). It uses the double step "from ANY starting cell of a pawn of its colour", promotion to Q/R/B/N on the 11 far-edge cells, and stalemate 3/4–1/4. Also: "white Kf9 covers all five flight hexes of a black Kf11 without giving check". |
| k15z/hexchess-zero `docs/content/docs/rules.mdx`; scottbedard/hexchess (both cloned) | Notation (a-l without j, file f in the centre, f6 in the middle), the setup, 51 legal moves at the start, 12 king and 12 knight targets. |
| W. Gliński, *Rules of Hexagonal Chess* (1973) and *First Theories of Hexagonal Chess* (1974) | The primary sources. I did not consult them directly; the sources above quote them. |

**Chosen rule set: Gliński's standard rules as given by Wikipedia and chessvariants.com.** The reference implementation
reproduces their perft exactly. The decisions:

- **Double step: tied to the cell, not the pawn.**
  - Some summaries say "a pawn that has not yet moved may move two cells". Wikipedia and Gliński add that a pawn that
    captures onto *another* friendly pawn's starting cell may double-step from there.
  - Both hexchess.club and talvola implement this as "a pawn standing on any of its side's pawn starting cells may
    double-step".
  - That formulation is exactly equivalent, and it needs no per-pawn flag. It is equivalent because every file has
    only one starting cell, straight moves go up the file, and no pawn can ever get below its side's row of starting
    cells.
- **Stalemate.** Gliński scores it 3/4–1/4 in favour of the stalemating side. Some online sites score it as a draw.
  Quantum Chess has no check, so a stalemated king must move into capture and is taken: a full win for the stalemating
  side. The rare "no move at all" position is scored the same way, as a loss for the player who cannot move (section
  4.8). Fractional scores do not exist in the app.
- **Cell colours.** These follow the Wikipedia diagram: the centre f6 is the middle shade, and White's bishops stand on
  light (f1), dark (f2) and middle (f3). Printed boards vary in which physical colour is which. Only the three-way
  split matters for play.
- **Promotion:** Q, R, B or N. It is compulsory, and allowed whether the pawn arrives by a move or by a capture.
- **No castling.**
- **No "insufficient material" draw.** The variants engine has none, and K+2N or K+B+B can sometimes win on this board.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Cells.** A regular hexagon with 6 cells per side: 91 hexagonal cells. The cells are **flat-topped**: each has
  neighbours straight above and straight below, so the files are vertical columns.
- **Files.** 11 files `a b c d e f g h i k l`, left to right from White's side. **There is no `j`.**
- **Ranks.** Ranks are numbered from 1 at the bottom of every file. The file lengths are:

  | File | a | b | c | d | e | f | g | h | i | k | l |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | Cells | a1–a6 | b1–b7 | c1–c8 | d1–d9 | e1–e10 | f1–f11 | g1–g10 | h1–h9 | i1–i8 | k1–k7 | l1–l6 |

  - A rank is V-shaped. Rank 1 is `a1 b1 c1 d1 e1 f1 g1 h1 i1 k1 l1`: `f1` is the lowest cell, and the rank rises
    toward `a1` and `l1`.
  - The top edge is `a6 b7 c8 d9 e10 f11 g10 h9 i8 k7 l6`.
  - `f6` is the centre.

- **Coordinates.** Let `q = "abcdefghikl".indexOf(file) - 5`, so a = −5, f = 0 and l = +5. Let `n` be the rank.

  | System | Formula | Board test | Notes |
  |---|---|---|---|
  | **Axial** `(q, r)` | `r = n - 6 - min(q, 0)`; back: `n = r + 6 + min(q, 0)` | `max(|q|, |r|, |q + r|) <= 5` | `r` grows "up the file". Neighbour vectors are the standard axial set. |
  | **Cube** `(x, y, z)` | `(q, -q - r, r)` | `max(|x|, |y|, |z|) <= 5`, with `x + y + z = 0` | |
  | **Doubled** `(q, h)` (**use this in the engine**) | `h = 2r + q = 2n - 12 + |q|`; back: `n = (h + 12 - |q|) / 2`, `r = (h - q) / 2` | `|q| <= 5`, `|q| + |h| <= 10`, `h ≡ q (mod 2)` | `h` is the height in half-cells. |

  - Examples (doubled): `f6 = (0, 0)`, `f1 = (0, -10)`, `f11 = (0, 10)`, `a1 = (-5, -5)`, `a6 = (-5, 5)`,
    `l1 = (5, -5)`, `g1 = (1, -9)`, `e1 = (-1, -9)`.
  - Examples (axial): `f1 = (0, -5)`, `g1 = (1, -5)`, `e1 = (-1, -4)`, `a1 = (-5, 0)`.
  - **Why doubled.** The mirror between White and Black is `(q, h) → (q, -h)`. That is exactly the engine's default
    `orient` (negate coordinate 1), and every vector set below is closed under flipping each sign. In axial
    coordinates the mirror is `(q, r) → (q, -q - r)`, so `orient` would have to be overridden.
  - The 180° rotation (Black's view) is `(q, h) → (-q, -h)`.
- **Distance** (for the AI): `|Δq| + max(0, (|Δh| - |Δq|) / 2)`, the same as axial `max(|Δq|, |Δr|, |Δq + Δr|)`.
- **Drawing** (flat-topped, circumradius `R`): `x = 1.5 R q`, `y_up = (√3 / 2) R h`. Cells in a column are `√3 R`
  apart, and columns are `1.5 R` apart.
- **Cell colours (three shades).** Class = `h mod 3`, the same as axial `(q - r) mod 3`:

  | Class | Shade | Cells | Examples |
  |---|---|---|---|
  | 0 | **mid** | 31 | centre `f6`, `f3`, `f9`, `b1`, `d2`, `h2`, `k1` |
  | 1 | **dark** | 30 | `f2`, `f5`, `f8`, `f11`, `a1`, `d1`, `h1`, `l1` |
  | 2 | **light** | 30 | `f1`, `f4`, `f7`, `f10`, `c1`, `i1` |

  - Use `((h % 3) + 3) % 3` for the class.
  - All cells at one height share a shade, so the board shows horizontal bands, as in Wikipedia's diagram. All 91
    cells were checked against that diagram.
  - Neighbouring cells never share a shade. Bishops never leave theirs: every bishop vector has `Δh ∈ {0, ±3}`.

### 2.2 Pieces and movement

Vectors are given in doubled `(Δq, Δh)`, with axial `(Δq, Δr)` after them. "Ride" means slide until blocked; the first
enemy piece on the line can be captured.

| Piece | Descriptor | Vectors (doubled) | Axial | Meaning |
|---|---|---|---|---|
| Rook R | `ride` | `(0,±2) (1,1) (1,-1) (-1,1) (-1,-1)` | `(0,±1) (1,0) (1,-1) (-1,1) (-1,0)` | 6 "orthogonal" lines through the cell's edges: up/down the file, and 4 lines at 60° to the vertical (the two branches of the V-shaped ranks). |
| Bishop B | `ride` | `(±2,0) (1,3) (1,-3) (-1,3) (-1,-3)` | `(2,-1) (-2,1) (1,1) (1,-2) (-1,2) (-1,-1)` | 6 diagonal lines through the cell's corners: horizontal left/right and four steep lines 30° from the vertical. A diagonal step passes **between** two cells, and those two flanking cells never block it. |
| Queen Q | `ride` rook + bishop | 12 | | |
| King K | `leap` rook + bishop steps | 12 | | Up to 12 targets. The diagonal step jumps between two cells and cannot be blocked. **No castling.** |
| Knight N | `leap` | `(±1,±5) (±2,±4) (±3,±1)` (12) | `(1,2) (2,1) (3,-1) (3,-2) (2,-3) (1,-3)` and their negatives | 2 cells along a rook line, then 1 cell turned 60°: the nearest cells a queen cannot reach. It jumps, and it always changes shade. |
| Pawn P | see below | | | |

- **Do not use `symmetric()` from topology.js** for these vectors. It also permutes coordinates, which would turn
  `(1, 5)` into `(5, 1)`. Write the vector lists out as above.
- **Pawn**, with vectors given for White. Black uses the default `orient`, which negates `Δh`.
  - **Move** (`mode: 'move'`): `leap [(0, 2)]`, one cell straight up the file.
  - **Capture** (`mode: 'capture'`): `leap [(-1, 1), (1, 1)]`, the upper-left and upper-right *edge* neighbours (10
    and 2 o'clock).
    - A pawn never captures along a bishop diagonal (`(±1, 3)`), never sideways, and never straight ahead.
    - Black captures toward the lower-left and lower-right neighbours, `(-1, -1)` and `(1, -1)`.
  - **Double step** (special move): a pawn standing on one of **its side's pawn starting cells** may move two cells
    straight forward (`(0, 4)`) if both cells are empty.
    - White's starting cells are `b1 c2 d3 e4 f5 g4 h3 i2 k1`; Black's are `b7 c7 d7 e7 f7 g7 h7 i7 k7`.
    - This includes a pawn that reached such a cell by a capture: after `e4xf5` the pawn may later play `f5-f7`.
    - A double step never reaches a promotion cell.
  - **En passant.** Right after an enemy double step, a pawn that attacks the skipped cell may capture onto that cell;
    the double-stepped pawn is removed.
    - Example: after Black `c7-c5`, a White pawn on `b5` or `d6` may play `b5-c6` or `d6-c6`, capturing `c5`.
    - Example: after White `d3-d5`, a Black pawn on `c4` or `e5` may play `c4-d4` or `e5-d4`.
    - The capture is allowed on the immediately following move only.

**Mobility on an empty board** (a check for the move generator):

| Piece | Min | Max (`f6`) | Average (91 cells) |
|---|---|---|---|
| Rook | 20 | 30 | 22.75 |
| Bishop | 10 | 14 | 11.87 (12 on `f6`) |
| Queen | 30 | 42 | 34.62 |
| King | 5 | 12 | 9.89 |
| Knight | 4 | 12 | 7.91 |

### 2.3 Setup (36 pieces, 18 per side; mirror-symmetric top to bottom, not point-symmetric)

| Side | K | Q | R | B | N | P |
|---|---|---|---|---|---|---|
| White | `g1` | `e1` | `c1`, `i1` | `f1` (light), `f2` (dark), `f3` (mid) | `d1`, `h1` | `b1 c2 d3 e4 f5 g4 h3 i2 k1` |
| Black | `g10` | `e10` | `c8`, `i8` | `f11` (dark), `f10` (light), `f9` (mid) | `d9`, `h9` | `b7 c7 d7 e7 f7 g7 h7 i7 k7` |

- Both queens stand on the e-file and both kings on the g-file.
- The White pawns form a V pointing up to `f5`; the Black pawns (all on rank 7) form a V pointing down to `f7`.
- World extras: `x = { ep: -1, epVictim: -1, castle: [] }`.
- Suggested piece-id order: White K, Q, R c1, R i1, B f1, B f2, B f3, N d1, N h1, P b1…k1, then Black in the same
  order.

### 2.4 Special moves

- Double step and en passant (2.2).
- No castling.
- No other special moves.

### 2.5 Promotion

- A pawn that reaches the **last cell of its file** must promote to a Q, R, B or N.
  - White promotes on `a6 b7 c8 d9 e10 f11 g10 h9 i8 k7 l6` (doubled: `h + |q| = 10`).
  - Black promotes on `a1 b1 c1 d1 e1 f1 g1 h1 i1 k1 l1` (doubled: `h - |q| = -10`).
- The pawn may arrive by a move or by a capture.
- The rank number is not what counts. For example, White `g9xf10` does not promote (`f10` is not the end of the
  f-file), but `g9xh9` and `g9-g10` do.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate.
- **Classically:**
  - Checkmate wins.
  - Stalemate gives 3/4 to the stalemating side and 1/4 to the stalemated side.
  - Threefold repetition and the 50-move rule are draws.
- **In Quantum Chess 2.0:**
  - You win by capturing the king (default `worldResult`).
  - A player with no move at all loses (section 4.8).
  - The engine's quiet limit (100 plies, the 50-move rule) and move limit (600 plies) are draws.

---

## 3. Engine mapping (contract)

```js
const FILES = 'abcdefghikl'
const ROOK6 = [[0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]
const BISHOP6 = [[2, 0], [-2, 0], [1, 3], [1, -3], [-1, 3], [-1, -3]]
const KING12 = [...ROOK6, ...BISHOP6]
const KNIGHT12 = [[1, 5], [1, -5], [-1, 5], [-1, -5], [2, 4], [2, -4], [-2, 4], [-2, -4], [3, 1], [3, -1], [-3, 1], [-3, -1]]
// coords in index order: file a..l, then rank ascending (a1 = 0, a6 = 5, b1 = 6, ..., f1 = 40, f6 = 45, f11 = 50, l6 = 90)
const coords = []
for (let q = -5; q <= 5; q++) for (let h = -10; h <= 10; h++) if (Math.abs(q) + Math.abs(h) <= 10 && (h - q) % 2 === 0) coords.push([q, h])
const promoCell = (side, [q, h]) => (side === 0 ? h + Math.abs(q) === 10 : h - Math.abs(q) === -10)

export default defineVariant({
  id: 'hexagonal',
  category: 'boards',
  sides: whiteBlack(),                         // default orient (negate coordinate 1) is the correct mirror here
  topology: makeTopology({
    coords,
    name: ([q, h]) => FILES[q + 5] + (h + 12 - Math.abs(q)) / 2,
    cell: ([q, h]) => ({ x: X0 + 0.866025 * (q + 5), y: 1.1 + (10 - h) / 2, w: 1.154701, h: 1, shape: 'hex',
                          shade: ['mid', 'dark', 'light'][((h % 3) + 3) % 3] }),
    layout: { width: 11.215, height: 12.3, labels },                   // section 6
  }),
  types: {
    k: { moves: [{ leap: KING12 }], royal: true, value: 400, glyph: { sprite: 'k' } },          // royal ⇒ solid
    q: { moves: [{ ride: KING12 }], value: 950, glyph: { sprite: 'q' } },
    r: { moves: [{ ride: ROOK6 }], value: 560, glyph: { sprite: 'r' } },
    b: { moves: [{ ride: BISHOP6 }], value: 330, glyph: { sprite: 'b' } },
    n: { moves: [{ leap: KNIGHT12 }], value: 300, glyph: { sprite: 'n' } },
    p: { moves: [{ leap: [[0, 2]], oriented: true, mode: 'move' },
                 { leap: [[-1, 1], [1, 1]], oriented: true, mode: 'capture' }],
         solid: true, value: 100, glyph: { sprite: 'p' },
         promote: { zone: (side, to) => promoCell(side, topology.coords[to]), to: ['q', 'r', 'b', 'n'] } },  // forced
  },
  setup: () => START,                          // section 2.3; no options, no rng
  extraMoves: (w, side) => hexPawnExtras(V, w, side),   // double step (kind 'double') + en passant (kind 'ep')
  afterMove: (next, m) => orthodoxAfterMove(V, next, m),  // sets x.ep = (q, (h1+h2)/2), x.epVictim; castle is []
  noMoves: (state) => ({ winner: 1 - state.turn, reason: 'stalemate' }),
  reasonText: (r) => (r === 'stalemate' ? t('quantumchess', 'stalemate') : null),
  rules: () => [...],                          // section 5
})
```

- **`hexPawnExtras`.** This is `pawnExtras` from orthodox.js with hex vectors. The existing helper hard-codes the
  forward vector `[0, 1]` and the captures `[±1, 1]`, so either write it locally or give `pawnExtras` an optional
  `{ fwd: [0, 2], captures: [[1, 1], [-1, 1]] }` (with the old values as defaults). It does two things for every pawn
  of `side`:
  - **Double step.** If the pawn's square is in `START[side]` (a Set of the 9 starting-cell indexes of that side),
    let `s1 = step(s, orient(side, [0, 2]))` and `s2 = step(s1, same)`. If both are empty, push
    `{ key: moveKey(s, s2), kind: 'double', capture: -1 }`.
  - **En passant.** If `w.x.ep >= 0`, then for each capture vector `c`, let `t = step(s, orient(side, c))`. If
    `t === w.x.ep`, the target is empty, and `board[x.epVictim]` holds an enemy piece, push
    `{ key: moveKey(s, t), kind: 'ep', capture: victim }`.
  - A double step can never land on a promotion cell, so `pushMove` is not needed.
  - `orthodoxAfterMove` works unchanged: its midpoint `(f, (r1 + r2) / 2)` is `(q, h ± 2)` in doubled coordinates.
- **Sides and teams.** Two sides, no teams.
- **Royal:** `k`. **Solid:** `k`, `p`. **Splittable:** `q`, `r`, `b`, `n`, including promoted pieces.
- **Visibility, options:** none.
- **`worldResult`:** the default (a side without a king has lost). No per-world counters.
- **Move keys.**
  - Moves: `e4-f5`, `g9-h9=q`. Splits: `d1-c3|f4`, with the targets sorted by index. Merges: `c3|f4-e4`.
    Measure: `?f3`.
  - Parse cells with `topology.byName`. Names that are not cells (`j1`, `f12`, `a7`) return −1.
- **Piece values** (centipawns, for the AI):

  | Piece | P | N | B | R | Q |
  |---|---|---|---|---|---|
  | Value | 100 | 300 | 330 | 560 | 950 |

  - These follow the self-play estimate reported by Coskey (Q 9.5, R 5.63, B 3.33, N 3.05) and empty-board mobility.
    A hex rook is relatively stronger than a square-board rook: R/B mobility is 1.9 here against 1.6 on 8×8.
  - The king's value (400) cancels out.
- **Optional `evaluate(w, side)`:**
  - Knights and bishops: `+6 × (5 - distance to f6)`.
  - Pawns: `+12 × (5 - min(5, pushes left to promotion))`. For White, pushes left = `(10 - |q| - h) / 2`; for Black,
    `(h - |q| + 10) / 2`.
- **AI performance.**
  - The start position has 51 classical moves (perft 1 = 51).
  - A central queen has 42 targets, which gives C(42,2) = 861 split pairs. As in raumschach, let the AI consider only
    splits whose two targets are among the piece's best 6 quiet moves. The move list for humans stays complete.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: worlds, split, merge, measure, "land = roll, pass = link", the solid roll,
the game-end roll, a budget of 8 per side and at most 4 cells per split. Here is how they meet Gliński's rules.

1. **Lines.**
   - Rook, bishop and queen slides link when they pass a cell where a piece *might* stand, and roll only when they
     *land* on one (or when the budget is full).
   - A bishop (or queen) moving diagonally passes **between** two cells. Those two flanking cells are not on its line,
     so a ghost there never blocks it, never links it and never causes a roll (test Q2).
   - The king's diagonal step and every knight move are leaps: they are never blocked.
2. **Three bishops.** Each bishop is bound to one shade. Both parts of a split bishop stay on that shade, and so does
   a merge. A bishop can never capture a piece that stands on another shade. Nothing else changes.
3. **Pawns are solid**, so every pawn move is rolled whenever its per-world results differ.
   - **Push onto a maybe-occupied cell:** Moved or Missed.
   - **Double step:** it needs *both* cells empty in a world. If the middle or the target cell might be occupied, the
     move is rolled: Moved (the pawn is on the far cell) or Missed (the pawn stays). It never falls back to a single
     step.
   - **Capture onto a ghost:** Captured or Missed. The capture cells are the two forward *edge* neighbours.
4. **The double-step right belongs to the cell.** The rule "a pawn on its side's starting cell may double-step" reads
   only the pawn's current cell. A pawn is solid and stands on the same cell in every world, so the right is always
   certain.
   - A capture that lands on a starting cell (for example `e4xf5`) grants the right in the worlds where the capture
     happened. Those are all the remaining worlds, because the capture was rolled.
5. **En passant** exists only on the move right after a double step, and it is always certain:
   - The double step was rolled (or certain), so in every remaining world the skipped cell is empty and the enemy
     pawn stands on the far cell.
   - The capturing pawn is solid.
   - So the key is a capture in every world: one outcome, no roll.
6. **Promotion.**
   - The piece is chosen in the move key (`=q/=r/=b/=n`), and promotion is compulsory.
   - It happens only in the worlds where the pawn really arrives on a promotion cell, and the pawn's roll settles
     which worlds those are. A pawn that missed stays a pawn.
   - A promoted bishop takes the shade of its promotion cell, so a side can own two bishops on one shade.
   - Promoted Q/R/B/N can split and merge.
7. **No castling.** No castling rights and no "castling through ghosts" cases.
8. **Stalemate and "no move".**
   - There is no check. So a classical stalemate (the king is not attacked, but every move walks into capture) plays
     out as: the stalemated side must move, and the opponent captures the king. That is a win for the stalemating
     side. Gliński gave that side 3/4; here it gets the whole point, which is in the same direction.
   - If a player has **no move at all** (no ordinary move, split, merge or measure), that player **loses**
     (`noMoves` → reason `stalemate`). The default for variants is a draw; this follows Gliński, whose stalemated
     player scores less than a draw. Such positions are practically unreachable on this board.
   - K vs K is not drawn at once: it runs to the quiet limit.
9. **Game-end roll.** `worldResult` only looks for a missing king. Every king capture is a landing on an occupied
   cell, so it is rolled, and all remaining worlds agree. The game-end roll is only a safety net here.
10. **Budget 8, 4 cells per split, Measure.** Unchanged. The hex geometry gives queens and rooks many split targets
    (up to 42 and 30), but the limits are the same.

**Open core issue (affects every variant with en passant, reported here because it came up).**

- `x.ep` is per world. A world where a move *misses* keeps its old `x` unchanged, and so does every world on a Measure
  turn. So an en passant right can survive in some worlds beyond the one ply it should last.
  - Example: White plays `d3-d5`, Black measures a ghost, White measures a ghost, and Black's `c4-d4` en passant is
    still generated three plies after the double step.
- Suggested fix in the core: after every turn, clear the one-ply extras (`ep`, `epVictim`) in the worlds where the
  mover's move was not applied, including Measure. This could be a variant hook `afterIdle(next)`, or the core could
  reset `x.ep` when it is set and the move did not come from that world.
- A variant cannot fix this alone, because `afterMove` only sees applied worlds.

---

## 5. Player-facing rules text (rules card)

- The board has 91 hexagons in three shades. The files a to l (there is no j) run straight up, and the ranks bend in a
  V around the middle file f.
- Rooks move in straight lines through the six sides of a cell. Bishops move along the six diagonals through the
  corners (left, right and four steep lines), so each of the three bishops stays on its own shade. The queen combines
  both, and the king steps one cell in any of these 12 directions.
- The knight jumps two cells in a straight line and then one cell turned 60°. It has up to 12 targets and cannot be
  blocked.
- Pawns move one cell straight forward and capture one cell forward-left or forward-right, onto the neighbouring cells
  (not along the diagonals). A pawn on any of its side's pawn starting cells may move two cells, even if it got there
  by capturing. En passant works as in chess.
- A pawn promotes at the far end of its file, to a queen, rook, bishop or knight.
- There is no castling. Stalemate is not a draw: a king without a safe move must still move and can be captured, and a
  player who has no move at all loses.

---

## 6. UI layout

- **Cells.** Flat-topped hexagons (`shape: 'hex'`; the board component already draws flat-topped hexes with
  circumradius `w / 2`).
  - Use `w = 2/√3 ≈ 1.154701` and `h = 1`, so cells in a column are 1 unit apart and columns are `√3/2 ≈ 0.866025`
    apart.
  - Cell centre: `x = X0 + 0.866025 × (q + 5)` with `X0 = 0.7 + 1/√3 ≈ 1.27735`; `y = 1.1 + (10 - h) / 2`.
  - The drawing is **11.215 × 12.3** units.
  - Check values: `f11` at (5.6075, 1.1), `f6` at (5.6075, 6.1), `f1` at (5.6075, 11.1), `a1` at (1.2774, 8.6),
    `l6` at (9.9376, 3.6).
- **Shades.** Class `((h % 3) + 3) % 3`: 0 → `mid`, 1 → `dark`, 2 → `light`.
  - `mid` in the CSS is the 50% mix of light and dark, which matches Wikipedia's three board colours (#ffce9e /
    #e8ab6f / #d18b47) almost exactly.
  - Shade is never the only cue: every cell has its name as a tooltip or aria label.
- **Labels** (`layout.labels`), as in Wikipedia's diagram:
  - **File letters:** below the bottom cell of each file, at `(cx, cy + 0.8)`: `a` under `a1` … `l` under `l1`.
  - **Rank numbers, left side:** `1`–`6` to the left of `a1`–`a6`, at `(cx - 0.85, cy)`. `7`–`11` above-left of the
    top cells `b7 c8 d9 e10 f11`, at `(cx - 0.6, cy - 0.55)`.
  - **Rank numbers, right side** (mirror): `1`–`6` to the right of `l1`–`l6`. `7`–`11` above-right of
    `k7 i8 h9 g10 f11`.
- **No `boards` or `areas`.** One board. An optional frame could be a hexagonal outline polygon, but the component has
  no polygon areas, so leave it out.
- **Black's view** is the usual 180° rotation. It maps the board onto itself (`(q, h) → (-q, -h)`).
- **Pieces.** The orthodox cburnett sprites for all six types. Three identical bishop sprites per side is expected; the
  shade under each bishop tells them apart.
  - Piece size is the component default (0.84 × the smaller cell side).
  - Ghost parts fade and carry a percentage badge, as everywhere.
- **Move targets** use the usual dot and ring marks. For bishops it helps to also highlight the whole line, because
  hex diagonals skip past cells.

---

## 7. Test cases

Unless stated otherwise, positions add a White K on `l1` and a Black K on `f11` that take no part. "Moves" means the
classical generator's keys in one world, pseudo-legal (no check rule). Square indexes are in the coordinate order of
section 3.

**C1. Topology.**
- 91 cells. The file lengths are 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6.
- `byName('j1') === -1`, `byName('f12') === -1` and `byName('a7') === -1`.
- `f6` is `(0, 0)` (index 45), `f1` is index 40 and `l6` is index 90.
- Shades: 31 mid, 30 dark, 30 light. `f1` light, `f2` dark, `f3` mid, `f6` mid, `f9` mid, `f10` light, `f11` dark,
  `a1` dark, `b1` mid, `c1` light.

**C2. Start position.**
- White has exactly **51** moves: 17 pawn (9 single + 8 double; `f5-f7` is blocked by Black's f7 pawn), 12 bishop,
  8 knight, 6 queen, 6 rook, 2 king:
  `b1-b2 b1-b3 c1-d2 c1-e3 c1-f4 c2-c3 c2-c4 d1-b2 d1-c3 d1-f4 d1-g2 d3-d4 d3-d5 e1-a5 e1-b4 e1-c3 e1-d2 e1-e2 e1-e3
  e4-e5 e4-e6 f1-e2 f1-g2 f2-b6 f2-c5 f2-d4 f2-e3 f2-g3 f2-h4 f2-i5 f2-k6 f3-d2 f3-h2 f5-f6 g1-g2 g1-h2 g4-g5 g4-g6
  h1-e2 h1-f4 h1-i3 h1-k2 h3-h4 h3-h5 i1-f4 i1-g3 i1-h2 i2-i3 i2-i4 k1-k2 k1-k3`.
- Black also has 51.
- Pseudo-legal perft: 2 = **2,587**, 3 = **138,057**.
- Legal perft, for reference: 51 / 2,586 / 137,858, matching hexchess.club and talvola.
  - The single extra node at depth 2 is `f2-d4` followed by `g10-g9`: the king walks into the bishop's line
    d4-e6-f8-g9. With no check rule that move is generated.

**C3. Geometry on an empty board.**
- Rook `f6`: 30 moves.
- Bishop `f6`: exactly {`b4 d2 d5 d8 e4 e7 g4 g7 h2 h5 h8 k4`}.
- Knight `f6`: exactly {`c4 c5 d3 d7 e3 e8 g3 g8 h3 h7 i4 i5`}.
- King `f6`: exactly {`d5 e4 e5 e6 e7 f5 f7 g4 g5 g6 g7 h5`}.
- Queen `f6`: 42 moves; queen `e1`: 30 moves.
- Black king `f11`: exactly {`e9 e10 f10 g9 g10`}.
- Knight `a1`: exactly {`b4 c4 d2 d3`}.
- Rook `c1`: exactly {`a1 b1 c2`-`c8 d1 d2 e1 e3 f1 f4 g4 h4 i4 k4 l4`} (20).

**C4. Pawn directions.**
- White P `f6`, with Black knights on `e6 g6 e7 g7 e5 g5 f7`: moves are exactly `f6-e6` and `f6-g6`.
  - No straight capture (`f7`), no capture along a diagonal (`e7`, `g7`), and nothing backwards.
- Mirrored: Black P `f6`, with White knights on `e6 g6 e7 g7 e5 g5 f5`: exactly `f6-e5` and `f6-g5`.

**C5. Double step belongs to the cell.**
- White P `e4`, Black N `f5`: moves `e4-e5`, `e4-e6` and `e4-f5`.
  - After `e4-f5` (capture) and any Black move, the pawn on `f5` has `f5-f6` and `f5-f7`.
- White P `e4`, Black N `d4`: after `e4-d4` (capture), the pawn has only `d4-d5`, because `d4` is not a starting
  cell.
- White P `b1`, Black N `c2`: after `b1-c2`, the pawn has `c2-c3` and `c2-c4`.
- White P `c2`, with any piece on `c3`: no `c2-c4`, and no single step either.

**C6. En passant.**
- White P `b5` and P `d6`, Black P `c7`, Black to move. After `c7-c5`: `x.ep = c6` and `x.epVictim = c5`.
  - White then has `b5-c6` and `d6-c6`, both kind `ep`, each removing the pawn on `c5`.
- White P `c2`, Black P `d4`. After `c2-c4`: `x.ep = c3`, and Black has `d4-c3` (kind `ep`) as well as `d4-d3`.
- Only immediately: White P `b5`, Black P `c7`, Black to move. Play `c7-c5`, then `l1-l2`, then `f11-f10`. Now the
  `b5` pawn has only `b5-b6`.

**C7. Promotion.**
- White P `g9`, Black knights on `f10` and `h9`. Moves are exactly `g9-f10` (**no** promotion: `f10` is not the end of
  the f-file), `g9-g10=q/r/b/n` and `g9-h9=q/r/b/n`: 9 keys.
  - Plain `g9-g10` and `g9-g10=k` are invalid.
- Black P `g2`, White knights on `f2` and `h1`: exactly `g2-f2`, `g2-g1=q/r/b/n` and `g2-h1=q/r/b/n`.
- White P `a5` on an otherwise empty file: exactly `a5-a6=q/r/b/n`.
- White P `d8`, Black N `c8`: `d8-c8=q/r/b/n` and `d8-d9=q/r/b/n`.

**C8. No castling.**
- White K `g1`, R `i1`, Black K `f11`: no `O-O` or `O-O-O` key.
- The king has exactly the 7 moves {`e1 f1 f2 f3 g2 h1 h2`} (`e1` and `f3` are diagonal steps). The king never
  moves two cells, and it never swaps places with the rook.

**C9. Fool's mate** (Coskey / Wikipedia).
- From the start: `e1-c3 e10-c6 b1-b2 b7-b6 f3-b1 e7-e6 c3-f9`. The last move captures the bishop on `f9`, and the
  queen now attacks `g10`.
- Black has 64 pseudo-legal moves, and after every one of them White can capture the Black king. Classically this is
  mate; here White wins on the next move with the king capture, `worldResult` → `{ winner: 0, reason: 'king' }`.

**C10. King and bishop diagonals are not blocked by the flanking cells.**
- White K `f6`, White pawns on `e5` and `e6`, Black K `a1`: the king's moves include `d5` (between `e5` and `e6`), 10
  moves in all: {`d5 e4 e7 f5 f7 g4 g5 g6 g7 h5`}.
- White B `f3`, with White pawns on `g2` and `g3`: `f3-h2` and `f3-k1` are still moves.

**Q1. Pass = link on a bent rank** (quantum).
- White R `c1`. Black N is 50% on `e3` and 50% on `a6`. The line `c1-d2-e3-f4-g4-h4` is otherwise empty.
- White plays `c1-h4`. **Expected:**
  - No roll: the rook is not solid, and `h4` is empty in both worlds.
  - In the world with the knight on `e3`, the rook stays on `c1` (a miss). In the other world it arrives on `h4`.
  - The rook is now 50% `c1` / 50% `h4`, linked to the knight: rook on `c1` exactly when the knight is on `e3`.
  - White's budget is 2/8.

**Q2. A diagonal passes between ghosts** (quantum).
- White B `f3`. Black N is 50% on `g3` and 50% on `g2`: the two cells flanking the diagonal `f3-h2`.
- White plays `f3-h2`. **Expected:**
  - One outcome, no roll, no link. The bishop is 100% on `h2` in both worlds, and the knight is still 50/50.
  - White's budget is 1.
  - A wrong implementation that treats the flanking cells as "via" legs would link the bishop here.

**Q3. Double step through a ghost** (quantum).
- White P `c2`, Black P `d4`. Black N is 50% on `c3` and 50% on `a6`.
- White plays `c2-c4`. **Expected:** a roll with 2 outcomes.
  - 50% **Missed**: the pawn stays on `c2` (it does *not* go to `c3`), and the knight is 100% on `c3`.
  - 50% **Moved**: the pawn is on `c4`, the knight is 100% on `a6`, `x.ep = c3` and `x.epVictim = c4`.
- **Q3b (en passant after the rolled double step).** In the Moved branch, Black plays `d4-c3`. **Expected:** one
  outcome, no roll. The Black pawn is on `c3` and the White pawn on `c4` is gone.

**Q4. Capture onto a starting cell regains the double step** (quantum).
- White P `e4`. Black B is 50% on `f5` and 50% on `h4` (both dark cells).
- White plays `e4-f5`. **Expected:** a roll.
  - 50% **Captured**: the pawn is on `f5` and the bishop is gone. After a Black king move, `f5-f7` is a legal double
    step.
  - 50% **Missed**: the pawn stays on `e4`, and the bishop is 100% on `h4`. `e4-e6` is still legal later, because
    `e4` is a starting cell.

**Q5. Promotion only if the pawn arrives** (quantum).
- White P `d8`. Black N is 50% on `d9` and 50% on `h9`.
- White plays `d8-d9=q`. **Expected:** a roll.
  - 50% **Moved**: a White queen stands 100% on `d9`, and the knight is 100% on `h9`.
  - 50% **Missed**: a White pawn (not promoted) stays on `d8`, and the knight is 100% on `d9`.
- `d8-c8=q` is illegal: `c8` is empty in both worlds, so no capture exists.

**Q6. Classical stalemate becomes a king capture** (quantum rules, classical position).
- White K `f9`, Black K `f11`, nothing else, Black to move. In Gliński's rules this is stalemate (3/4 for White).
- **Expected:**
  - Black has exactly 5 moves (`f11-e9 e10 f10 g9 g10`), and after each of them White has a king capture.
  - Example: `f11-f10`, then `f9-f10` → result `{ winner: 0, reason: 'king' }`.
  - The game is not ended by `noMoves` before Black moves.

**Q7. No move at all loses.**
- `V.noMoves(state)` with `state.turn === 1` returns `{ winner: 0, reason: 'stalemate' }`.
- `reasonText('stalemate')` is a translated string.
- A real no-move position needs about 20 blocked pawns on this board, so test the hook directly.
