# Variant spec: `hexagonal` (Gliński's hexagonal chess, 1936/1949)

Category: `boards` (as in `src/variants/catalog.js`; the current placeholder module wrongly says `rules`). UI name:
"Hexagonal chess". Summary (already in the catalogue): "Gliński's chess on 91 hexagons, with three bishops each."

**Superseded in part (handoff/LEAD-DECISIONS.md L1):** the core now applies the classic "your king cannot escape" rule
to this variant (`escapeRule`, reason `cannotEscape`), together with `bareKingsDraw` and `drawsWait`, so the variant
has no `worldResult` of its own. Where sections 2.6, 3, 4.8, 5 (card entry 8) and 7 (C9, Q6) say that a mated or
stalemated side plays one more move and then loses its king, the game now ends at once in favour of the side that
delivered the mate or stalemate. `src/variants/hexagonal.js` and its tests follow L1.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the egress proxy for every rules site (wikipedia.org, wikibooks.org,
chessvariants.com, greenchess.net). So the rules below come from search-engine extracts of those pages, from open-source
implementations cloned from GitHub, and from one PDF that reproduces the Wikipedia diagrams. Every number in this spec
(move counts, perft, target lists) was computed with a reference generator, `handoff/tools/hexchess.py`. That
generator's **legal** perft matches the published perft of two independent engines exactly (see below).

Review note (section 8.1): a later rules review fetched the full pages (Wikipedia wikitext, chessvariants.com,
Wikibooks, Green Chess, the Wikipedia setup SVG and Coskey's PDF) and ran the hexchess.club engine itself. Every
classical rule, the setup, the three cell shades and every classical test case in section 7 were confirmed. The quotes
in the table below are now verbatim from the named page.

| Source | What it gives |
|---|---|
| Wikipedia, "Hexagonal chess", section Gliński: https://en.wikipedia.org/wiki/Hexagonal_chess (full wikitext read in review) | 91 cells in three colours, "the middle cell (or "hex") usually mid-tone", files a–l without j, 11 ranks "which bend 60° at file f" (ranks 1–6 have 11 cells, rank 7 has 9, rank 8 has 7, ..., rank 11 only f11). "The rules are the same as those of orthodox chess except as follows." Pawn: "may move one vacant cell vertically forward. If it stands on its starting cell or on the starting cell of any other pawn of its colour, then it is also allowed to move two vacant cells vertically forward. It may capture one cell orthogonally forward at a 60° angle to the vertical, including capturing en passant. It is promoted when it reaches the end of any file." Examples: e4xf5 keeps the option f5-f7; after c7-c5, b5xc6 e.p. No castling. Stalemate: "in tournament games, the player who delivers stalemate earns 3/4 point, and the stalemated player ... receives 1/4 point". "A king and two knights can mate a king." Fool's mate from Gliński, *First Theories of Hexagonal Chess* (1974), pp. 53–54. |
| Chess Variant Pages, "Glinski's Hexagonal Chess": https://www.chessvariants.com/hexagonal.dir/hexagonal.html (read in review via the Wayback Machine, 2009 and 2026 snapshots) | "Pawns have an initial two-step move option. En passant captures are allowed. A capturing Pawn, which arrives on a friendly Pawn's starting square, regains its initial two-step move option. Pawns promote when they arrive on one of the eleven hexes that define the opposite borders of the board. There is no castling. Stalemate earns 3/4 points for the player delivering it and 1/4 point for the player stalemated." A diagonal move "is not incumbered by pieces lying to the right or the left of the thin line of travel." Its setup diagram gives exactly the setup of 2.3 and the three shades of 2.1 (centre f6 in the middle colour). |
| Wikibooks, "Chess Variants/Hexagonal Chess": https://en.wikibooks.org/wiki/Chess_Variants/Hexagonal_Chess (read in review) | The same rules; "The central hex is always medium tone"; "If a pawn captures an enemy piece and lands on the starting hex of any friendly pawn it may still move two hexes forward"; "it may promote as usual". |
| Green Chess, "Gliński's Chess": https://greenchess.net/rules.php?v=glinski (read in review) | "Otherwise the rules of chess apply, with the following difference: There is no castling." That site scores stalemate as a draw and says Gliński's original counts it 3/4. |
| J. M. Coskey, *Gliński's Hexagonal Chess: Board Template and Rules* (CC BY-SA 2023), https://github.com/jaycoskey/Games_MakeGlinskiChessBoard (PDF read in full) | Rooks move toward 12, 2, 4, 6, 8 and 10 o'clock and bishops toward 1, 3, 5, 7, 9 and 11 o'clock: the cells are flat-topped and the files vertical. Knight: "two cells in any rook direction, then turn 60 degrees left or right and move one more cell". Pawns capture toward 10 and 2 o'clock. No castling. Stalemate 3/4–1/4. A fool's mate: `1. Qe1-c3 Qe10-c6 2. b1-b2 b7-b6 3. Bf3-b1 e7-e6 4. Qc3xf9#`. Piece values as reported: Gliński Q 10, R 5, N 4, B 3, P 1; "the program AlphaZero" Q 9.5, R 5.63, B 3.33, N 3.05. It also notes that K+B+B or K+N+N against K may or may not be able to force mate, depending on the position. The PDF also embeds the **Wikipedia setup diagram**. I sampled its pixels to get the exact cell colours (all 91 cells match the formula in 2.1). |
| talvola/abstract_games, `engine/games/glinski_chess/{rules.md,game.py,selftest.py}` (read) | A complete implementation. Its legal **perft from the start position is 51 / 2,586 / 137,858**, checked node by node against scottbedard/hexchess (the engine behind hexchess.club). It uses the double step "from ANY starting cell of a pawn of its colour", promotion to Q/R/B/N on the 11 far-edge cells, and stalemate 3/4–1/4. Also: "white Kf9 covers all five flight hexes of a black Kf11 without giving check". |
| k15z/hexchess-zero `docs/content/docs/rules.mdx`; scottbedard/hexchess (both cloned) | Notation (a-l without j, file f in the centre, f6 in the middle), the setup, 51 legal moves at the start, 12 king and 12 knight targets. In review, the TypeScript engine of scottbedard/hexchess (https://github.com/scottbedard/hexchess, `js/src`, hand-written neighbour graph, independent of this spec's coordinates) was run: the same 51 start moves, legal perft 51 / 2,586 / 137,858, pseudo-legal perft 51 / 2,587 / 138,057, the fool's mate is checkmate, and K `f9` vs K `f11` with Black to move is stalemate. |
| W. Gliński, *Rules of Hexagonal Chess* (1973) and *First Theories of Hexagonal Chess* (1974) | The primary sources. I did not consult them directly; the sources above quote them. |

**Chosen rule set: Gliński's standard rules as given by Wikipedia and chessvariants.com.** The reference implementation
reproduces their perft exactly. The decisions:

- **Double step: tied to the cell, not the pawn.**
  - Some summaries say "a pawn that has not yet moved may move two cells". Wikibooks and chessvariants.com add that a
    pawn that captures onto *another* friendly pawn's starting cell may double-step from there. Wikipedia states the
    cell rule directly: a pawn may move two vacant cells "if it stands on its starting cell or on the starting cell of
    any other pawn of its colour".
  - Both hexchess.club and talvola implement this as "a pawn standing on any of its side's pawn starting cells may
    double-step".
  - That formulation is exactly equivalent, and it needs no per-pawn flag. It is equivalent because every file has
    only one starting cell, straight moves go up the file, and no pawn can ever get below its side's row of starting
    cells.
- **Stalemate.** Gliński scores it 3/4–1/4 in favour of the stalemating side. Some online sites score it as a draw.
  Quantum Chess has no check, so a stalemated king must move into capture and is taken: a full win for the stalemating
  side. The rare "no move at all" position is scored the same way, as a loss for the player who cannot move (section
  4.8). Fractional scores do not exist in the app.
- **Cell colours.** These follow the Wikipedia diagram (and, cell for cell, the chessvariants.com diagram): the centre
  f6 is the middle shade, and White's bishops stand on light (f1), dark (f2) and middle (f3). Printed boards vary in
  which physical colour is which. Only the three-way split matters for play.
- **Promotion:** Q, R, B or N. It is compulsory, and allowed whether the pawn arrives by a move or by a capture.
- **No castling.**
- **No "insufficient material" draw, except bare kings.** A position with only the two kings left is a draw (section
  2.6), as in docs/rules.md section 6. Nothing else counts as insufficient material: docs/rules.md says the same for
  K+B or K+N against K (without check a lone king can sometimes be trapped), and on this board "a king and two knights
  can mate a king" (Wikipedia). Coskey notes that whether K+B+B or K+N+N against K can still win depends on the
  position.

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
  - Cells per rank (Wikipedia): ranks 1–6 have 11 cells each, rank 7 has 9, rank 8 has 7, rank 9 has 5, rank 10 has 3
    and rank 11 has 1 (`f11`).

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

| Piece | Min | Max | On `f6` | Average (91 cells) |
|---|---|---|---|---|
| Rook | 20 | 30 (only on `f6`) | 30 | 22.75 |
| Bishop | 10 | 14 (e.g. `c3`, `f5`, `f7`; not `f6`) | 12 | 11.87 |
| Queen | 30 | 42 (`f6` and its 6 edge neighbours) | 42 | 34.62 |
| King | 5 | 12 | 12 | 9.89 |
| Knight | 4 | 12 | 12 | 7.91 |

### 2.3 Setup (36 pieces, 18 per side; mirror-symmetric top to bottom, not point-symmetric)

| Side | K | Q | R | B | N | P |
|---|---|---|---|---|---|---|
| White | `g1` | `e1` | `c1`, `i1` | `f1` (light), `f2` (dark), `f3` (mid) | `d1`, `h1` | `b1 c2 d3 e4 f5 g4 h3 i2 k1` |
| Black | `g10` | `e10` | `c8`, `i8` | `f11` (dark), `f10` (light), `f9` (mid) | `d9`, `h9` | `b7 c7 d7 e7 f7 g7 h7 i7 k7` |

- Both queens stand on the e-file and both kings on the g-file.
- The White pawns form a V pointing up to `f5`; the Black pawns (all on rank 7) form a V pointing down to `f7`.
- World extras: `x = { ep: -1, epVictim: -1 }`. There is no `castle` entry: there is no castling, and
  `orthodoxAfterMove` skips a missing list.
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
- **Classically** (the orthodox rules apply except where Gliński differs, per Wikipedia):
  - Checkmate wins.
  - Stalemate is not a draw: in tournament games the stalemating side scores 3/4 and the stalemated side 1/4.
  - Threefold repetition and the 50-move rule are draws.
- **In Quantum Chess 2.0:**
  - You win by capturing the king.
  - A player with no move at all loses (section 4.8).
  - Only the two kings left is a draw (reason `bareKings`), unless the side to move could capture the other king at
    once, as in docs/rules.md section 6 ("the draw waits").
  - The engine's quiet limit (100 plies, the 50-move rule) and move limit (600 plies) are draws.
  - There is no threefold-repetition rule (the variants engine has none: CORE-CHANGES row 60, a documented deviation)
    and no other insufficient-material rule.
  - There is no "your king cannot escape" loss (docs/rules.md section 5): the variants engine does not have it
    (CORE-CHANGES row 72, a documented deviation). A mated or stalemated side plays one more move, and then its king
    is captured.

---

## 3. Engine mapping (contract)

Imports: `defineVariant` (core/variant.js), `whiteBlack` (core/orthodoxVariant.js), `orthodoxTypes`, `pawnExtras`,
`orthodoxAfterMove`, `clearEnPassant` (core/orthodox.js), `makeTopology` (core/topology.js), `addPiece`,
`emptyWorld`, `attacks` (core/world.js). Every hook below exists in the core as built; no core change is needed.

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
const topology = makeTopology({
  coords,
  name: ([q, h]) => FILES[q + 5] + (h + 12 - Math.abs(q)) / 2,
  cell: ([q, h]) => ({ x: X0 + 0.866025 * (q + 5), y: 1.1 + (10 - h) / 2, w: 1.154701, h: 1, shape: 'hex',
                        shade: ['mid', 'dark', 'light'][((h % 3) + 3) % 3] }),
  layout: { width: 11.215, height: 12.3, labels },                   // section 6
})
// PAWN_START[side]: a Set of the 9 starting-cell indexes of that side (section 2.2)
const HEX_PAWN = { forward: [0, 2], captures: [[1, 1], [-1, 1]] }   // for side 0; Black gets them via V.orient

// the orthodox types give names, glyphs, royal/solid flags and the forced Q/R/B/N promotion; only moves and values change
const types = orthodoxTypes({ lastRank: (side, sq) => promoCell(side, coords[sq]) })
types.k.moves = [{ leap: KING12 }]                                  // royal, so solid
types.q.moves = [{ ride: KING12 }]
types.r.moves = [{ ride: ROOK6 }]
types.b.moves = [{ ride: BISHOP6 }]
types.n.moves = [{ leap: KNIGHT12 }]
types.p.moves = [{ leap: [[0, 2]], oriented: true, mode: 'move' },
                 { leap: [[-1, 1], [1, 1]], oriented: true, mode: 'capture' }]   // solid, promote as orthodox
types.q.value = 950
types.r.value = 560
types.n.value = 300                                                 // b 330, p 100, k 400 as orthodox

const spec = {
  id: 'hexagonal',
  category: 'boards',
  sides: whiteBlack(),                         // default orient (negate coordinate 1) is the correct mirror here
  topology,
  types,
  setup: () => startWorld(),                   // section 2.3, a new world per call; no options, no rng
  extraMoves: (w, side) => pawnExtras(spec, w, side, (s, sq) => PAWN_START[s].has(sq), HEX_PAWN),
  afterMove: (next, m) => orthodoxAfterMove(spec, next, m),  // x.ep = midpoint (q, h ± 2), x.epVictim; else both -1
  applyMiss: (b) => clearEnPassant(b),         // idle worlds (missed move, Measure) lose the one-ply en passant right
  worldResult: (b, mover) => hexResult(b, mover),   // capture the king; bare kings draw (below)
  noMoves: (state) => ({ winner: 1 - state.turn, reason: 'noMoves' }),   // generic text "no legal move"
  rules: () => [...],                          // section 5
}
export default defineVariant(spec)
```

- **Pawn moves: `pawnExtras` from orthodox.js** with the hex geometry `HEX_PAWN` (core item W3). For every pawn of
  `side` it makes:
  - **Double step** (kind `double`): if `canDouble(side, s)` (the pawn stands on one of its side's 9 starting cells,
    exactly Wikipedia's cell rule) and both cells `s + fwd` and `s + 2·fwd` are empty, key `moveKey(s, s2)`.
  - **En passant** (kind `ep`, capture = the pawn on `x.epVictim`): if `x.ep` is set, holds nothing, the pawn on
    `x.epVictim` is an enemy, and `s + capture vector === x.ep`.
  - A double step can never land on a promotion cell, so `pawnExtras` not using `pushMove` is fine.
  - `orthodoxAfterMove` sets the en passant cell to the midpoint of from and to in every coordinate: `(q, h ± 2)`.
  - `ep` moves are *certain* in the core (`isCertain`): legal only when every world generates them (section 4.5).
- **`applyMiss: clearEnPassant`** (core items Q1 and W4) is required. Without it, a world where the reply to a double
  step missed, and every world of a Measure turn, would keep `x.ep`, and the en passant capture would still be legal
  several plies later (test Q8 shows it on the real core). `orthodoxSpec()` has the same hook, but this variant does
  not start from `orthodoxSpec()`, so it must declare it.
- **`worldResult` (`hexResult`)**, per world:
  1. A side with no king on the board has lost: `{ winner: other side, reason: 'king' }` (both gone: a draw with
     reason `king`, as the default does; it cannot happen here).
  2. Otherwise, if only the two kings are on the board and the side to move next (`1 - mover`) cannot capture the
     mover's king (`attacks(spec, b, 1 - mover, square of the mover's king)`, kings included): `{ winner: null,
     reason: 'bareKings' }`. The text "only the two kings are left" is built into `src/variantplay/texts.js`, so no
     `reasonText` is needed. This is the same rule as chess960.md, raumschach.md and hyper4d.md (CORE-CHANGES row 40).
  3. Otherwise `null`.
  - No per-world counters.
- **Sides and teams.** Two sides, no teams.
- **Royal:** `k`. **Solid:** `k`, `p`. **Splittable:** `q`, `r`, `b`, `n`, including promoted pieces.
- **Visibility, options, `unifyWorlds`:** none (no castling rights to unify).
- **Move keys.**
  - Moves: `e4-f5`, `g9-h9=q`. Splits: `d1-c3|f4`, with the targets sorted by index. Merges: `c3|f4-e4`.
    Measure: `?f3`.
  - Parse cells with `topology.byName`. Names that are not cells (`j1`, `f12`, `a7`) return −1.
- **Piece values** (centipawns, for the AI):

  | Piece | P | N | B | R | Q |
  |---|---|---|---|---|---|
  | Value | 100 | 300 | 330 | 560 | 950 |

  - These follow the AlphaZero estimate reported by Coskey (Q 9.5, R 5.63, B 3.33, N 3.05) and empty-board mobility.
    A hex rook is relatively stronger than a square-board rook: R/B mobility is 1.9 here against 1.6 on 8×8.
  - The king's value (400) cancels out.
- **Optional `evaluate(w, side)`** (centipawns added to the material score of one world, so it must be the terms of
  `side`'s pieces minus the same terms of the enemy's pieces):
  - Knights and bishops: `+6 × (5 - distance to f6)`.
  - Pawns: `+12 × (5 - min(5, pushes left to promotion))`. For White, pushes left = `(10 - |q| - h) / 2`; for Black,
    `(h - |q| + 10) / 2`.
  - Without it, every quiet move scores the same and the computer's split targets are picked at random among ties.
- **AI performance.**
  - The start position has 51 classical moves (perft 1 = 51).
  - A central queen has 42 targets on an empty board, which gives C(42,2) = 861 split pairs (with the kings of
    section 7 on `l1` and `f11`: 40 quiet targets, 780 splits; `splitsFrom` takes about 10 ms).
  - The core already limits the computer: `aiSplits` (core item U4) pairs only the best 6 split targets of each piece
    and keeps at most 6 splits. The move list for humans (`splitsFrom`) stays complete. Nothing to do in the variant.
  - Measured on the prototype: 40 random games of 60 plies (a split every 4th ply, as the fuzz test plays) take about
    0.6 s together, with at most 8 worlds.

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
   - **Quiet counter:** a pawn move resets the 100-ply counter only in an outcome where it really happened; a Missed
     push or capture does not (docs/rules.md section 6; core default for solid, non-royal types).
4. **The double-step right belongs to the cell.** The rule "a pawn on its side's starting cell may double-step" reads
   only the pawn's current cell. A pawn is solid and stands on the same cell in every world, so the right is always
   certain.
   - A capture that lands on a starting cell (for example `e4xf5`) grants the right in the worlds where the capture
     happened. Those are all the remaining worlds, because a pawn capture is either certain or rolled.
5. **En passant** exists only on the move right after a double step, and it is always certain (docs/rules.md
   section 4; the core treats kind `ep` as a certain move: legal only when every world generates it, never rolled,
   never linked, never a split or merge path):
   - The double step was rolled (or certain), so in every remaining world the skipped cell is empty and the enemy
     pawn stands on the far cell. Nothing moves between the double step and the reply, so the skipped cell is still
     certainly empty.
   - The capturing pawn is solid, so it stands on the same cell in every world.
   - So the key is an `ep` capture in every world: one outcome, no roll (test Q3b). If some world did not generate it,
     the core would refuse the key instead of rolling it; that cannot happen here.
   - The right ends after that one ply **in every world**: worlds where the reply was played reset `x.ep` in
     `orthodoxAfterMove`, and idle worlds (the reply missed there, every world of a Measure) reset it through
     `applyMiss: clearEnPassant` (test Q8).
6. **Promotion.**
   - The piece is chosen in the move key (`=q/=r/=b/=n`), and promotion is compulsory.
   - It happens only in the worlds where the pawn really arrives on a promotion cell, and the pawn's roll settles
     which worlds those are. A pawn that missed stays a pawn.
   - A promoted bishop takes the shade of its promotion cell, so a side can own two bishops on one shade.
   - Promoted Q/R/B/N can split and merge (test Q5).
   - A piece that is a pawn in some worlds and promoted in others never exists: the pawn is solid, so the promotion
     happened in every world of the outcome or in none. The core's "parts with different types cannot merge" rule
     never comes into play.
7. **No castling.** No castling rights and no "castling through ghosts" cases.
8. **Stalemate and "no move".**
   - There is no check. So a classical stalemate (the king is not attacked, but every move walks into capture) plays
     out as: the stalemated side must move, and the opponent captures the king. That is a win for the stalemating
     side. Gliński gave that side 3/4; here it gets the whole point, which is in the same direction.
   - The classic Quantum Chess "your king cannot escape" loss (docs/rules.md section 5) does not exist in the
     variants engine (CORE-CHANGES row 72): the stalemated or mated side really plays its last move (test Q6).
   - If a player has **no move at all** (no ordinary move, split, merge or measure), that player **loses**
     (`noMoves` → `{ winner: opponent, reason: 'noMoves' }`, shown as "no legal move"). The default for variants
     (and docs/rules.md section 6) is a draw; this follows Gliński, whose stalemated player scores less than a draw,
     and matches xiangqi, shogi and makruk. Such positions are practically unreachable on this board. The reason is
     not called "stalemate", because a classical stalemate does not end the game here (previous bullet).
   - **Bare kings** (only the two kings left) is a draw, unless the side to move could capture the other king at once
     (test Q11). This follows docs/rules.md section 6, including its "the draw waits" exception.
9. **Game-end roll.** `worldResult` looks for a missing king and for bare kings. Both follow a capture, and every
   capture is either certain (en passant, or a capture that happens in every world) or rolled: a move or merge that
   lands where a piece might stand is measured, so its outcomes are Captured / Moved / Missed, never a link. So every
   world of an outcome has lost the same number of pieces, and the kings are solid; all worlds agree on the result.
   The game-end roll is only a safety net here (tests Q10, Q11).
10. **Budget 8, 4 cells per split, Measure.** Unchanged. The hex geometry gives queens and rooks many split targets
    (up to 42 and 30), but the limits are the same. The computer only looks at a few of them (core `aiSplits`).

**Formerly open core issue: stale en passant rights (resolved in the core).**

- `x.ep` is per world, and a world where a move *misses*, or any world on a Measure turn, used to keep its old `x`.
  Example: White plays `d3-d5`, Black measures a ghost, White measures a ghost, and Black's `c4-d4` en passant was
  still legal three plies after the double step.
- The core now calls the variant's `applyMiss` hook on every idle world (CORE-CHANGES Q1, W4, decision D2). This
  variant declares `applyMiss: (b) => clearEnPassant(b)` (section 3). Test Q8 runs the example above on the real
  core: with the hook the capture is illegal; without it, it is still legal.

---

## 5. Player-facing rules text (rules card)

Eight entries of `rules()`, one translated string each (the shared quantum rules are shown separately):

1. The board has 91 hexagons in three shades. The files a to l (there is no j) run straight up, and the ranks bend in
   a V around the middle file f.
2. Rooks move in straight lines through the six sides of a cell. Bishops move along the six diagonals through its
   corners (left, right and four steep lines), so each of the three bishops stays on its own shade.
3. A diagonal step passes between two cells, and pieces on those two cells never block it. The queen moves like a rook
   or a bishop, and the king steps one cell in any of these 12 directions.
4. The knight jumps two cells in a straight line and then one cell turned 60°. It has up to 12 targets and cannot be
   blocked.
5. Pawns move one cell straight forward and capture one cell forward-left or forward-right, onto the neighbouring
   cells (not along the diagonals). A pawn on any of its side's pawn starting cells may move two cells straight
   forward if both are empty, even if it got there by capturing.
6. Right after such a double step, an enemy pawn that could capture on the skipped cell may do so on its next move
   only, removing the pawn (en passant).
7. A pawn promotes at the far end of its file, to a queen, rook, bishop or knight.
8. There is no castling. Stalemate is not a draw: a king without a safe move must still move and can be captured. A
   player with no move at all loses, and a game with only the two kings left is a draw.

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
- **No `boards` or `areas`.** One board. A frame is not needed; if one is wanted later, the six edges of the hexagon
  can be drawn as `layout.outlines` segments (core item U15), since the component has no polygon areas.
- **Black's view** is the usual 180° rotation. It maps the board onto itself (`(q, h) → (-q, -h)`).
- **Pieces.** The orthodox cburnett sprites for all six types. Three identical bishop sprites per side is expected; the
  shade under each bishop tells them apart.
  - Piece size is the component default (0.84 × the smaller cell side).
  - Ghost parts fade and carry a percentage badge, as everywhere.
- **Move targets** use the usual dot and ring marks. The board component has no line highlight, and none is needed:
  the dots already show every reachable cell, including the ones a bishop reaches by skipping past cells.

---

## 7. Test cases

Unless the test places kings itself (C8, C9, C10, Q6, Q9, Q11), positions add a White K on `l1` and a Black K on `f11`
that take no part. C3 is the exception: its boards hold **only the piece under test**, with no kings.
"Moves" means the classical generator's keys in one world, pseudo-legal (no check rule). Square indexes are in the
coordinate order of section 3. Every world has `x = { ep: -1, epVictim: -1 }` unless a test says otherwise.

Quantum tests: "X is 50% on a and 50% on b" means two worlds of equal weight that differ only in X; two independent
50/50 ghosts give four worlds of equal weight. White is to move unless stated. "One outcome" means `branches` returns
one branch with `rolled: false`; "a roll" lists the branches in the core's order (Missed, Moved, Captured). Every
case below was run on the real core (engine review, section 8.2).

**C1. Topology.**
- 91 cells. The file lengths are 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6. The rank sizes (cells whose name ends in that
  number) are 11, 11, 11, 11, 11, 11, 9, 7, 5, 3, 1 for ranks 1 to 11.
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
- Legal perft, for reference: 51 / 2,586 / 137,858, matching hexchess.club and talvola. The hexchess.club engine
  also gives the pseudo-legal 2,587 / 138,057 above (checked in review).
  - The single extra node at depth 2 is `f2-d4` followed by `g10-g9`: the king walks into the bishop's line
    d4-e6-f8-g9. With no check rule that move is generated.

**C3. Geometry on an empty board** (only the tested piece on the board, no kings).
- The default kings would change two counts: `l1` lies on the rook line `f6-g5-h4-i3-k2-l1`, so with a White K on
  `l1` the rook on `f6` has 29 moves and the queen on `f6` 41.
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

**C9. Fool's mate** (Gliński, *First Theories of Hexagonal Chess*, 1974, pp. 53–54, as cited by Wikipedia; also in
Coskey).
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
- **Q3b (en passant after the rolled double step).** In the Moved branch, Black plays `d4-c3` (kind `ep`, a certain
  move). **Expected:** one outcome `capture`, no roll. The Black pawn is on `c3`, the White pawn on `c4` is gone, and
  `x.ep` is -1 again.

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
- `d8-c8=q` is illegal: `c8` is empty in both worlds, so no capture exists. Plain `d8-d9` is illegal too.
- In the Moved branch, after a Black king move (`f11-f10`), the new queen can split: `d9-d5|d6` has one outcome
  `split`.

**Q6. Classical stalemate becomes a king capture** (quantum rules, classical position).
- White K `f9`, White P `b1`, Black K `f11`, nothing else, Black to move. In Gliński's rules this is stalemate (3/4 for
  White). The White pawn takes no part; it only keeps the position from being bare kings, which would have been drawn
  as soon as the White king arrived on `f9` (Q11).
- **Expected:**
  - `hasLegalMove` is true, so the game is not ended by `noMoves` before Black moves.
  - Black has exactly 5 moves (`f11-e9 e10 f10 g9 g10`), each one outcome, and the result stays null.
  - After each of them White captures the king with one outcome: `f9-e9`, `f9-e10`, `f9-f10`, `f9-g9`, `f9-g10` →
    result `{ winner: 0, reason: 'king' }`.

**Q7. No move at all loses.**
- `V.noMoves(state)` with `state.turn === 1` returns `{ winner: 0, reason: 'noMoves' }` (shown with the generic text
  "no legal move"; the variant has no `reasonText`).
- A real no-move position needs about 20 blocked pawns on this board, so test the hook directly.

**Q8. En passant ends after one ply, also on Measure turns** (quantum; needs `applyMiss: clearEnPassant`).
- Four worlds: White P `d3`, Black P `c4`, White N 50% `h1` / 50% `k3`, Black N 50% `g9` / 50% `i7` (independent).
- White plays `d3-d5`. **Expected:** one outcome `move` (the pawn's cells are certainly empty). Every world has
  `x.ep = d4` and `x.epVictim = d5`. Black's `c4-d4` would now be one outcome `capture`.
- Black plays `?g9` instead, then White plays `?h1` (either outcome of each). **Expected:** every world has
  `x.ep = -1`, and `c4-d4` is illegal (`branches` returns null).
- Control: the same variant **without** `applyMiss` keeps `x.ep = d4` in every world after the two measurements, and
  `c4-d4` is legal with one outcome `capture`. This is the stale right the hook removes.
- **Q8b.** After `d3-d5`, Black plays `g9-f7` instead: one outcome `move` (pass = link: the knight moves where it is on
  `g9`, and stays where it is on `i7`). **Expected:** `x.ep = -1` in all four worlds.

**Q9. The king's diagonal step is not blocked; a step onto a ghost is rolled** (quantum).
- White K `f6`, Black K `f11`, Black N 50% `g5` / 50% `g6`: the two cells flanking the king's diagonal step `f6-h5`.
- `f6-h5`. **Expected:** one outcome `move`, no roll, no link. The knight is still 50/50.
- `f6-g6` (from the same position). **Expected:** a roll: 50% **Moved** (the king is on `g6`, the knight 100% on
  `g5`), 50% **Captured**.

**Q10. A ghost queen attacks the king: land = roll** (quantum).
- White Q 50% `f6` / 50% `b1`.
- White plays `f6-f11`. **Expected:** a roll with no settling-roll notes:
  - 50% **Missed**: the queen is 100% on `b1`; the result is null.
  - 50% **Captured**: the result is `{ winner: 0, reason: 'king' }`.

**Q11. Bare kings** (quantum).
- White K `f6`, Black K `f11`, Black N 50% `g6` / 50% `a1`, nothing else. White plays `f6-g6`. **Expected:** a roll:
  - 50% **Moved**: the knight is 100% on `a1`; the result is null.
  - 50% **Captured**: only the two kings are left and `g6` does not touch `f11`: `{ winner: null, reason: 'bareKings' }`.
- **Q11b (the draw waits).** White K `f9`, Black K `f11`, Black N `f10`. White plays `f9-f10`, capturing the last
  Black piece next to the Black king. **Expected:** the result is null (Black can capture the king at once); then
  `f11-f10` gives `{ winner: 1, reason: 'king' }`.
- **Q11c.** Q11 with a White N on `a6` as well: the Captured outcome leaves K+N against K, and the result is null.

**Q12. Splits of a central queen** (quantum, performance).
- White Q `f6`. **Expected:** `splitTargets(f6)` has 40 cells (the 42 of C3 minus `l1`, White's own king, and minus
  `f11`, a capture). `splitsFrom(f6)` gives 780 splits; `f6-a1|l6` has one outcome `split`.
- `aiSplits(V, state, f6, rng)` returns between 1 and 6 legal split codes.

**Q13. A split bishop stays on its shade** (quantum).
- White B `f3` (mid). **Expected:** every cell of `splitTargets(f3)` is a mid cell.
- `f3-d2|h2`: one outcome `split`; two worlds of 50% each; White's budget is 2.
- After `f11-f10`, `d2|h2-f3`: one outcome `move`, no roll; afterwards the state has one world.

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity. The original research could not open rule pages. This review fetched them in
full and ran an independent engine. Scripts are in `handoff/tmp/rev1-hexagonal/` (scratch, not committed):

- `proto.mjs` is the section 3 declaration on the real core.
- `classical.mjs` runs C1–C10 and the classical part of Q6. All pass.
- `quantum.mjs` runs Q1–Q7. All outcomes are as written.
- `hx/` holds the scottbedard/hexchess TypeScript engine, run with `node --experimental-strip-types`.

**What was confirmed** (no change needed):

- Board: 91 cells, files a–l without j, V-shaped ranks bending at f, file lengths, and rank sizes. Setup: every one of
  the 36 start cells. Sources: the Wikipedia wikitext, and the chessvariants.com setup diagram parsed cell by cell
  (https://web.archive.org/web/20260811191853/https://www.chessvariants.com/hexagonal.dir/hexagonal.html). The FEN of
  hexchess.club gives the same.
- Cell shades: `h mod 3` (0 mid, 1 dark, 2 light) matches all 91 cells of Wikipedia's `Hexagonal chess.svg`
  (https://commons.wikimedia.org/wiki/File:Hexagonal_chess.svg; fills #ffce9e light, #e8ab6f mid, #d18b47 dark). It
  also matches all 91 cells of the chessvariants.com diagram. Centre `f6` is mid, `f1` light, `f2` dark, `f3` mid.
- Piece moves: rook, bishop, queen, king, knight and the "diagonals are not blocked by the flanking cells" rule.
  - chessvariants.com: "not incumbered by pieces lying to the right or the left of the thin line of travel".
  - Wikipedia (https://en.wikipedia.org/wiki/Hexagonal_chess) gives the knight as "any nearest cell not on an orthogonal
    or diagonal line on which it stands".
- Pawn rules:
  - Straight move, 60° edge captures, and the double step by cell ("on its starting cell or on the starting cell of any
    other pawn of its colour").
  - En passant, including both Wikipedia examples.
  - Promotion at the end of every file, to Q, R, B or N ("promote as usual": Wikibooks; "otherwise the rules of chess
    apply": Green Chess).
- No castling. Stalemate scores 3/4–1/4 (Wikipedia, chessvariants.com, Coskey).
- The start move list (51), legal perft 51 / 2,586 / 137,858 and pseudo-legal perft 51 / 2,587 / 138,057 agree with
  the independent hexchess.club engine (https://github.com/scottbedard/hexchess, `js/src`).
  - Its only legal/pseudo-legal difference at depth 2 is after `f2-d4`, as C2 says.
  - That engine also confirms the fool's mate as checkmate with 64 pseudo-legal Black replies, and K `f9` v K `f11`
    (Black to move) as stalemate.
- The empty-board mobility table was recomputed on the real core.

**Changes made:**

1. **Section 1 source table: quotes attributed to the right pages.**
   - The row "Wikipedia" quoted "If a pawn captures an enemy piece and lands on the starting hex of any friendly pawn
     ..." and "one hex orthogonally forward at a 60-degree angle". Those sentences are from Wikibooks
     (https://en.wikibooks.org/wiki/Chess_Variants/Hexagonal_Chess), not from Wikipedia.
   - The chessvariants.com quote "All pawns can make a double step from their starting cells" does not occur on that
     page.
   - Both rows now carry verbatim text from the pages. Rows were added for Wikibooks and Green Chess
     (https://greenchess.net/rules.php?v=glinski). The hexchess.club row now records the engine run.
   - Why: the spec is the source of truth for implementers, so its citations must be exact.
2. **Section 1, double-step bullet.** It now quotes Wikipedia's own wording, which *is* the cell rule. The capture
   wording is attributed to Wikibooks and chessvariants.com. The rule itself is unchanged.
3. **Section 1, insufficient-material bullet.** The unsourced "K+B+B can sometimes win" was replaced by Wikipedia's "a
   king and two knights can mate a king" and Coskey's note that KBB v K and KNN v K depend on the position
   (https://github.com/jaycoskey/Games_MakeGlinskiChessBoard, PDF, section "Insufficient material"). The decision (no
   such draw) is unchanged.
4. **Section 1, Coskey row and section 3 values.** The value estimate is attributed as in the PDF ("the program
   AlphaZero"), not to an unnamed "self-play engine".
5. **Section 2.1.** Added Wikipedia's rank sizes (11 × 6, then 9, 7, 5, 3, 1). **C1** got a matching assertion, which
   passes on the prototype.
6. **Section 2.2, mobility table.** The header "Max (`f6`)" was wrong for the bishop: its maximum of 14 is reached on
   `c3`, `f5`, `f7` etc., never on `f6` (12). The table now has separate "Max" and "On `f6`" columns. Recomputed on
   the real core.
7. **Section 2.6.** The classical stalemate score is now tied to Wikipedia's "in tournament games" wording. For Quantum
   Chess 2.0 it now says plainly that there is no repetition rule and no insufficient-material rule, because the
   variants engine has neither (`quantum.js` only has the quiet and ply limits).
8. **Section 5, rules card.**
   - Double step: added "straight forward if both are empty".
   - "En passant works as in chess" became a concrete sentence: on the next move only, by an enemy pawn that could
     capture on the skipped cell.
   - Why: players who do not know orthodox en passant need the rule, and the old text left the emptiness condition out.
9. **Section 7 preamble and C3: the kings were ambiguous.**
   - "Unless stated otherwise, positions add a White K on `l1`" also applied to C3's "empty board". But `l1` lies on
     the rook line `f6-g5-h4-i3-k2-l1`. With that king, the rook on `f6` has 29 moves (not 30) and the queen 41 (not
     42), so a literal test would fail.
   - C3 is now explicitly "only the tested piece, no kings", with the counts that the default kings would give.
   - The preamble also lists the tests that place their own kings (C8, C9, C10, Q6), so no test ends up with two
     White kings.
10. **C9.** The source of the fool's mate is now Gliński's *First Theories of Hexagonal Chess* (1974, pp. 53–54), as
    Wikipedia cites it.
11. **C2.** Recorded that the pseudo-legal perft numbers are confirmed by an independent engine.
12. **Section 3.** A note that `pawnExtras` in the core now takes a `canDouble(side, sq)` callback, which fits the cell
    rule directly. The core file was not edited.

**Not changed, out of this lens:** the open core issue about stale en passant rights (section 4) is a real rules
violation of "immediately following move only". It needs the core fix described there.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency. Checked against `src/variants/core/` as it is in the working
tree now (with the CORE-CHANGES items Q1, Q2, W3, W4, U4 and U7 already built), docs/rules.md and the IMPLEMENTING /
CONTRACT notes. Scripts are in `handoff/tmp/critic-hexagonal/` (scratch, not committed):

- `proto.mjs` is the revised section 3 declaration on the real core (core `pawnExtras`, `clearEnPassant`,
  `orthodoxTypes`, the bare-kings `worldResult`), plus a copy without `applyMiss` for the control in Q8.
- `classical.mjs` (reviewer 1's script, pointed at the new prototype) runs C1–C10: all pass, including pseudo-legal
  perft 2,587 / 138,057 with the core's `pawnExtras` instead of the hand-written helper.
- `quantum.mjs` runs Q1–Q13 exactly as written in section 7, and Q8 for all four measurement outcomes: all pass.
- `fuzz.mjs` plays 40 random games of 60 plies as the fuzz test does (about 0.6 s, at most 8 worlds, invariants
  hold) and asks the computer for a move at each level.
- `layout.mjs` checks the section 6 numbers and renders `board.png`.

**Changes made:**

1. **Section 3 rewritten for the core as built.**
   - `hexPawnExtras` is gone: the core's `pawnExtras(V, w, side, canDouble, { forward: [0, 2], captures: [[1, 1],
     [-1, 1]] })` (item W3) does exactly the double step by cell and en passant. Why: less variant code, and the
     classical tests pass unchanged on it.
   - Added `applyMiss: (b) => clearEnPassant(b)`. The declaration did not have it, and `hexagonal` does not start from
     `orthodoxSpec()`, which carries the hook. Without it the stale en passant right that section 4 reported is still
     legal on the new core after two Measure turns (test Q8, control case). The certain-move rule alone only hides the
     partly-missed case, not the Measure case.
   - Types now come from `orthodoxTypes` with the hex moves and values. Why: the old literal had no `name`, so the UI
     (`typeName`) would have shown "k", "q"...; the orthodox types also bring the glyphs, flags and forced promotion.
   - `noMoves` gives reason `noMoves` instead of `stalemate`, and `reasonText` is dropped. Why: section 4.8 and the
     rules card say a classical stalemate does *not* end the game here, so "White wins (stalemate)" would contradict
     them; the generic text "no legal move" is exact, needs no new string, and xiangqi, shogi and makruk do the same.
   - World extras without `castle` (no castling, `orthodoxAfterMove` skips a missing list); `setup` returns a new
     world per call.
   - AI: the split pruning the spec asked for is now core item U4 (`aiSplits`), so the variant does nothing. The
     `evaluate` terms are now stated as own minus enemy, which is how `ai.js` adds them to a world's value.
   - The figures (40 split targets and 780 splits for a queen on `f6` with the test kings, about 10 ms) were measured.
2. **Bare kings is a draw** (sections 1, 2.6, 3, 4.8, 5; test Q11), with docs/rules.md's "the draw waits" exception
   (not a draw if the side to move can take the other king at once).
   - Why: docs/rules.md section 6 lists "only the two kings are left" as a draw. The spec let K v K run 100 quiet plies
     instead. Reviewer 1's reason, "the variants engine has none", no longer holds: CORE-CHANGES row 40 makes it a
     variant rule with a shared text (item U7), and chess960.md, raumschach.md and hyper4d.md use the same
     `worldResult`.
   - Nothing else became insufficient material, as docs/rules.md says for K+B or K+N against K (test Q11c).
   - Consequence: Q6's old position (bare kings, stalemate) would already have been drawn when the White king arrived,
     so Q6 got a White pawn on `b1`.
3. **Section 4.5 and the "open core issue" rewritten.** The issue is resolved by core items Q1 and W4 (decision D2),
   provided the variant declares the hook (item 1). En passant is also a *certain* move in the core now (item Q2).
   The spec explains why it is available in every world after a double step, so the certain rule never refuses it
   here.
4. **Deviations named** (sections 2.6, 4.8): there is no "your king cannot escape" loss (CORE-CHANGES row 72) and no
   repetition draw (row 60). Both are decided for all variants; the spec did not say so, and 4.8's "must move and is
   captured" is only right because of row 72.
5. **Section 4, smaller fixes.**
   - 4.3: added the quiet counter (a Missed pawn move does not reset it, as docs/rules.md 6 says).
   - 4.4: a capture onto a starting cell is certain *or* rolled.
   - 4.6: parts with different types (pawn / promoted) cannot arise, so the core's merge restriction never applies.
   - 4.9: the game-end argument now covers bare kings and en passant (which lands on an empty cell but is certain).
   - 4.10: the computer's split limit.
6. **Section 5, rules card.** Now exactly 8 entries, one string each (the IMPLEMENTING limit is 3–8 sentences).
   - Added "A diagonal step passes between two cells, and pieces on those two cells never block it". This is the rule
     that decides pass = link on this board (Q2, Q9), and it was not on the card.
   - The long pawn entry was split into pawn moves and en passant.
   - The last entry now also names the no-move loss and the bare-kings draw.
7. **Section 6.**
   - The "highlight the whole bishop line" idea is not available in the board component and is not needed, so it is
     marked as such.
   - A frame, if ever wanted, can use `layout.outlines` (core item U15).
   - Verified:
     - the check values;
     - the cells span x 0.70–10.515 and y 0.60–11.60, inside the 11.215 × 12.3 drawing;
     - the 33 labels lie within x 0.43–10.79 and y 0.55–11.90, and none is closer than 0.8 to a cell centre;
     - the 180° turn maps the board onto itself;
     - the piece size (0.84) is below the hexagon's inner diameter (1).
     - The rendered board matches Wikipedia's diagram: files, V-shaped ranks and the three shades in horizontal
       bands.
8. **Section 7.**
   - Preamble: the world extras and how ghost states and outcome orders are written.
   - Q3b: the reply is kind `ep` and `x.ep` resets.
   - Q5: the plain key is illegal, and the promoted queen can split.
   - Q6: the pawn on `b1`, `hasLegalMove`, all five king captures.
   - Q7: reason `noMoves`.
   - New cases for the riskiest rules, all run on the real core:
     - Q8: en passant expiry on Measure turns and partly missed moves, with a control that fails without the hook.
     - Q9: the king's diagonal step between ghosts versus a step onto one.
     - Q10: a ghost queen takes the king by a roll, without settling notes.
     - Q11: bare kings, the waiting exception, and K+N v K is no draw.
     - Q12: central-queen split counts and `aiSplits`.
     - Q13: a split bishop stays on its shade and merges back without a roll.

**Checked and unchanged:**

- Section 3 topology, vectors, promotion zone, move keys and the default `orient` mirror.
- Section 4 items 1–3 and 6–7: pass = link on bent lines, diagonals between ghosts, and every pawn roll (Q1–Q5 as
  written).
- The layout numbers of section 6.

**Core changes needed:** none. The spec relies only on hooks and helpers that are already in the working tree:
`applyMiss` (Q1), certain `ep` moves (Q2), `pawnExtras` with geometry and the midpoint en passant cell (W3),
`clearEnPassant` (W4), `aiSplits` (U4), the generic `bareKings` and `noMoves` texts (U7, `src/variantplay/texts.js`),
`attacks` (world.js). If any of these change before the variant is written, re-run the three scripts above.
