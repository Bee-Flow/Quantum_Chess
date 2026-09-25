# Variant spec: `hyper4d` (4D chess on a 4x4x4x4 hypercube, after TessChess)

Category: `dimensions`. UI name: "4D chess" (as in `catalog.js`). Summary line (catalog): "A 4 × 4 grid of 4 × 4
boards: every piece gains two extra directions."

Note for the implementer: the placeholder `src/variants/hyper4d.js` declares `category: 'rules'`. The catalog and this
spec say `dimensions`.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in this session (chessvariants.com,
.org, ftp mirror, wikidot, Wikipedia, mdpi.com, math.iit.edu, itch.io). The rules of the chessvariants.com pages
below come from search-engine extracts of those pages. Two open-source 4D engines on GitHub were cloned and read
directly. Every count in this spec was computed with a reference move generator
(`handoff/tools/hyper4d.py`, setups in `handoff/tools/setups.py`), so the numbers are self-consistent.

| Source | What it gives |
|---|---|
| **TessChess**, Ben Reiniger, The Chess Variant Pages, 2013-06-03: https://www.chessvariants.com/rules/tesschess (also http://chessvariants.wikidot.com/tesschess) | **Base rule set.** A 4x4x4x4 hypercube drawn as a 4x4 array of 4x4 boards. Two "big" and two "small" directions. Square names: big column A-D, small column a-d, then big row and small row (`Ab11`). **White: R Ab11, Dc11; B Ac11, Db11; N Bb11, Cc11; Q Bc11; K Cb11; pawns Ab22, Ac22, Bb22, Bc22, Cb22, Cc22, Db22, Dc22. Black is White's mirror image in rows 33 and 44.** The king "commands a 3x3x3x3 cube" (80 cells). The **queen moves as a rook or a bishop**. The knight's non-zero displacements are exactly {1, 2} (`0012`). Pawns move one step in either forward direction ("big" or "little") and capture one step forward plus one step in one of the four non-forward directions. **No two-step, no en passant.** Promotion on the forward-most row (**44** for White, **11** for Black). "K+Q forces mate against lone K." |
| Ben Reiniger, *Four dimensional chess* (IIT note): http://math.iit.edu/~breiniger/Chess/chess-basicmath.pdf | Background by the same author (not readable here). |
| **Hyperchess**, Joe Joyce, 2004: https://www.chessvariants.com/3d.dir/hyperchess.html | 4x4x4x4 as 16 "big squares" of 16 "little squares", cell numbers 1111-4444. Big and little moves are independent 2D moves. King: the 8 neighbours in its big square or the same little square in the 8 neighbouring big squares (16 directions). Bishop diagonal in the big plane or the little plane. Pawns change one of their four numbers and never go backward. |
| **4\*Chess**, Kevin Pacey: https://www.chessvariants.com/rules/4chess-four-dimensional-chess (also Slim 4\*Chess, Super4\*Chess, Open King 4\*4DChess https://www.chessvariants.org/rules/open-king-44dchess) | Sixteen 4x4 mini-boards, 96 pieces (Slim: 80). Rook: 8 directions. Knight: "8 plus 8 plus 4x4 plus 4x4 = 48 directions". Pawn: one rook step forward (on the board, or one board column or row), captures one bishop step forward. Promotion on the last rank of the corner mini-board where the enemy king starts. Open King: queen = rook, bishop, unicorn (3 axes) or balloon (4 axes), i.e. all 80 directions; king = that queen, one step. |
| **Chesseract**, Jim Aikin: https://www.chessvariants.com/large.dir/contest/chesseract.html | 4x4x4x4, 21 pawns and fairy pieces per side; "virtually unplayable" by its own account. Shows the danger of a crowded 4D setup. |
| **lukajk1/4D-chess** (GitHub, read from source: `src/core/pieces.ts`, `src/core/geometry.ts`, `src/variants.ts`): https://github.com/lukajk1/4D-chess | Rook 1 axis, bishop 2 axes, **queen and king all 80** step vectors, knight (1,2) leaper, unicorn 3 axes, balloon 4 axes. 4^4 variant with pawns pushing along **two** axes, capturing "one forward plus one square in x or z, never combining the two forward axes", promotion in the far corner of both forward axes. No castling. 32 pawns per side. |
| **saFilipJohansson/4D-Chess** (GitHub, README and `starting_positions/four_d_4x4x4x4_v*.txt`): https://github.com/saFilipJohansson/4D-Chess | Pawns forward in "forward dimensions", capture one forward plus one non-forward step. Restricts the king to rook steps "to prevent checkmating from becoming impossibly difficult". Its 4^4 setups use 64+ pieces per side. |
| *A Mathematical Framework for Four-Dimensional Chess*, Appl. Math. 6(3), 48 (MDPI 2026): https://www.mdpi.com/2673-9909/6/3/48 | Formal displacement sets on {1..8}^4: rook changes one coordinate, bishop two by the same amount, king one step on any combination (Chebyshev distance 1). |

**Chosen rule set: TessChess (Ben Reiniger, 2013)**, with one change to the back-row order (explained below).

What is taken from TessChess unchanged:

- the board, and the big/small directions;
- the formation: pieces on the first rank of the four bottom boards, files b and c; pawns on rank 2 of the second row
  of boards, files b and c; Black mirrored;
- the moves of every piece: rook, bishop, queen = rook + bishop, king = 80 directions, knight = 48 leaps;
- the pawn: two forward directions, eight capture directions;
- no double step, no en passant, no castling;
- promotion on "row 44".

Where the sources disagree, and why this rule set was chosen:

1. **Queen: rook + bishop (32 directions), not all 80.**
   - TessChess chooses rook + bishop. lukajk1, Open King and the MDPI framework choose all 80.
   - Empty-board mobility on 4^4 decides it. Averages: rook 12, knight 18, bishop 21, queen(32) **33**, queen(80)
     **57.1**. An 80-direction queen reaches up to **95 of the 255 other cells** from a central cell (37% of the
     board). It would dominate a board where no line is longer than 3 steps.
   - It keeps the orthodox identity "queen = rook + bishop".
   - The 3- and 4-axis lines are the hardest to see in a grid of boards. With this choice no piece slides along them.
   - A smaller fan of targets keeps splits and the computer player manageable: a central queen has 42 targets, so
     C(42,2) = 861 split pairs, against C(95,2) = 4,465.
2. **King: all 80 directions (every touching cell), not 32 or 8.**
   - TessChess, lukajk1, Open King and MDPI all use 80. Only Filip's engine restricts it, to make checkmate
     achievable.
   - "Any touching cell" is the easiest rule to see in the grid: the 3×3 block of squares around the king, on its own
     board and on each of the (up to 8) boards around its board.
   - A restricted king would need a "which touching cells don't count" explanation.
   - There is no check here. You win by capturing the king, so a mobile king only lengthens endgames. TessChess reports
     that K+Q still forces mate against a lone king.
   - The king is the only piece that can step along a 3- or 4-axis diagonal. This asymmetry is harmless, and it is also
     TessChess's.
3. **Bishop: any two axes, equal steps (24 directions).** This follows TessChess, lukajk1, 4\*Chess and MDPI.
   Hyperchess allows only the pure small and pure big diagonals (8 of the 24). That breaks the symmetry between the
   four axes, so it is rejected.
4. **Pawn: two forward axes (small rank and big rank); captures one forward step plus one sideways step (small file or
   big file), never forward + forward.**
   - TessChess and lukajk1 agree on this word for word, and Filip is equivalent.
   - 4\*Chess (three forward axes) and Hyperchess (any of the four numbers) are less clean.
5. **Setup: TessChess's formation, but a mirror-symmetric back-row order.**
   - TessChess's order puts **all four bishops on the same colour**. White Ac11 = `A1c1` and Db11 = `D1b1` both have
     an even coordinate sum, and so do Black's mirrors, so no bishop ever controls the other 128 cells.
   - This spec reorders White's eight pieces to **file b: R Q K R** and **file c: B N N B** (boards A-D).
     - Each side then has one bishop of each colour.
     - The order is mirror-symmetric across the columns of boards, like a1-h1 in chess (apart from Q/K).
     - Queens face queens and kings face kings.
   - Start-position statistics are identical to TessChess's: 135 moves per side, perft 2 = 18,257. No piece is
     attacked at the start, and no first move attacks a king.
   - An open design question below asks whether to keep TessChess's exact order instead.
6. **No castling, no double step, no en passant.** This is TessChess. On a 4-cell axis a double step would cross half
   the board. None of the 4D sources has castling.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Cells.** A 4x4x4x4 hypercube: 256 cells, all of which exist.
- **Drawing.** A 4×4 grid of small 4×4 boards.
- **Boards** are named like squares of a big board. Column letter `A`-`D` from left to right (White's view), then row
  number `1`-`4` from White's side: `A1` bottom-left … `D4` top-right.
- **Squares** on a board are named `a`-`d` (file, left to right) and `1`-`4` (rank, bottom to top).
- **Cell name** = board + square: `B2c3` is square c3 on board B2. Parse with `/^[A-D][1-4][a-d][1-4]$/`. The name
  contains no `-`, `|`, `?`, `@`, `=` or spaces.
  - TessChess writes the same cell as `Bc23` (big column, small column, big row, small row).
  - Mapping: TessChess `Xy<R><r>` = ours `X<R>y<r>`.
- **Coordinates** (0-based), in this order `[x, y, z, w]`:
  - `x` = small file (a=0 … d=3);
  - `y` = small rank (rank - 1);
  - `z` = big file / board column (A=0 … D=3);
  - `w` = big rank / board row (row - 1).
  - So `A1a1 = [0,0,0,0]`, `B2b2 = [1,1,1,1]`, `C3c2 = [2,1,2,2]` and `D4d4 = [3,3,3,3]`.
  - Suggested square index: `sq = x + 4y + 16z + 64w`.
- **The four directions.** Small file (`x`) and big file (`z`) are **sideways**. Small rank (`y`) and big rank (`w`)
  are **forward** for White and backward for Black.
- **Cell colour.** Dark if `x + y + z + w` is even (so `A1a1` is dark, like a1), light otherwise. There are 128 of
  each.
  - Every rook or king step along one axis changes the colour.
  - Every bishop step keeps it, so bishops are bound to one colour.
  - The same square on two neighbouring boards therefore has opposite colours.

### 2.2 Pieces and movement

Vectors are `[dx, dy, dz, dw]`.

- **Ride** means: slide any distance until blocked. A rider can capture the first enemy piece on its line.
- On this board a ride is at most 3 steps long.
- The intermediate cells of a ride can lie on other boards. For example, the bishop line `A1c1 → B1c2 → C1c3` follows
  `[0,1,1,0]`: one square up and one board right per step.

| Piece | Letter | Descriptor | Directions | Empty-board mobility (min / avg / max) |
|---|---|---|---|---|
| King | K | `leap` over `allDirections(4)`: every vector with components in {-1,0,1}, not all 0 | 80 = 8 one-axis + 24 two-axis + 32 three-axis + 16 four-axis | 15 / 38.06 / 80 |
| Queen | Q | `ride` over `directions(4,1)` and `ride` over `directions(4,2)` | 32 = rook + bishop | 30 / 33.0 / 42 |
| Rook | R | `ride` over `directions(4,1)`: one non-zero component ±1 | 8 | 12 / 12.0 / 12 (always 12) |
| Bishop | B | `ride` over `directions(4,2)`: exactly two non-zero components, each ±1 | 24 | 18 / 21.0 / 30 |
| Knight | N | `leap` over `symmetric([1,2], 4)`: 2 along one axis and 1 along another | 48 | 12 / 18.0 / 24 |
| Pawn | P | see below | | |

How the directions look in the grid of boards:

- **Rook.** Along its rank or file on its own board (6 cells). Or to the **same square** on the other boards of its
  board row or board column (6 cells). Always 12 targets on an empty board.
- **Bishop.** Three kinds of line:
  - diagonally on its own board (4 directions);
  - to the same square on diagonally neighbouring boards and beyond (4 directions);
  - one square straight **and** one board straight at the same time, in any combination (4 × 4 = 16 directions).
    Examples: `[1,0,1,0]` is one square right and one board right. `[0,1,0,1]` is one square up and one board up.
    `[1,0,0,1]` is one square right and one board up.
- **Queen.** Rook or bishop. The queen does **not** move along 3- or 4-axis diagonals. For example, `A1a1-B2b2`
  (`[1,1,1,1]`) and `A1a1-A2b2` (`[1,1,0,1]`) are not queen moves.
- **King.** Any cell that differs by at most 1 in every coordinate. In the drawing: the 3×3 squares around its square,
  on its own board and on each board around its board, except its own cell.
- **Knight.** 8 ordinary jumps on its board, plus 8 "board-knight" jumps to the same square on a board a knight's move
  away, plus 16 of the form 2 squares + 1 board, plus 16 of the form 1 square + 2 boards. Knights jump: nothing blocks
  them.

**Pawn** (vectors oriented: written for White; Black negates `dy` and `dw`, so its forward is towards rank 1 and board
row 1; the sideways components `dx`, `dz` are kept):

- **Move** (`mode: 'move'`, target must be empty): `leap [[0,1,0,0], [0,0,0,1]]`. One square forward on its board, or
  the same square one board forward.
- **Capture** (`mode: 'capture'`, target must hold an enemy): 8 vectors, one forward step plus one sideways step.
  `leap [[1,1,0,0], [-1,1,0,0], [0,1,1,0], [0,1,-1,0], [1,0,0,1], [-1,0,0,1], [0,0,1,1], [0,0,-1,1]]`.
- **Not allowed:**
  - capturing straight forward, on either axis;
  - capturing "forward + forward" (`[0,1,0,1]`);
  - a double step, en passant, and any sideways or backward move.
- A White pawn on small rank 4 (`y = 3`) that is not on board row 4 can still push along `w`. A White pawn on board row
  4 that is not on rank 4 can still push along `y`. Only the promotion cells have no forward move, and a pawn never
  stays on them.

### 2.3 Setup (32 pieces, 16 per side)

```
          A             B             C             D
      a  b  c  d    a  b  c  d    a  b  c  d    a  b  c  d
 4 4  .  r  b  .    .  q  n  .    .  k  n  .    .  r  b  .      board row 4 (A4 B4 C4 D4), rank 4
 4 3  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 4 2  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 4 1  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .

 3 4  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .      board row 3
 3 3  .  p  p  .    .  p  p  .    .  p  p  .    .  p  p  .      rank 3
 3 2  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 3 1  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .

 2 4  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .      board row 2
 2 3  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 2 2  .  P  P  .    .  P  P  .    .  P  P  .    .  P  P  .      rank 2
 2 1  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .

 1 4  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .      board row 1
 1 3  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 1 2  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 1 1  .  R  B  .    .  Q  N  .    .  K  N  .    .  R  B  .      rank 1
(first number = board row, second = rank on that board)
```

| Side | Cells |
|---|---|
| White pieces (rank 1 of boards A1-D1) | R `A1b1`, B `A1c1`, Q `B1b1`, N `B1c1`, K `C1b1`, N `C1c1`, R `D1b1`, B `D1c1` |
| White pawns (rank 2 of boards A2-D2) | `A2b2`, `A2c2`, `B2b2`, `B2c2`, `C2b2`, `C2c2`, `D2b2`, `D2c2` |
| Black pieces (rank 4 of boards A4-D4) | r `A4b4`, b `A4c4`, q `B4b4`, n `B4c4`, k `C4b4`, n `C4c4`, r `D4b4`, b `D4c4` |
| Black pawns (rank 3 of boards A3-D3) | `A3b3`, `A3c3`, `B3b3`, `B3c3`, `C3b3`, `C3c3`, `D3b3`, `D3c3` |

- Black is White's mirror in the forward axes: `(x, y, z, w) → (x, 3-y, z, 3-w)`.
- **Bishop colours.**
  - White `A1c1` (sum 2) is dark and `D1c1` (sum 5) is light.
  - Black `A4c4` (sum 8) is dark and `D4c4` (sum 11) is light.
- **Kings and queens** face each other along the `[0,1,0,1]` diagonal:
  - `C1b1 … C4b4`, screened by the pawns `C2b2` and `C3b3`;
  - `B1b1 … B4b4`, screened by `B2b2` and `B3b3`.
- For reference, TessChess's own order in our names: R `A1b1`, B `A1c1`, N `B1b1`, Q `B1c1`, K `C1b1`, N `C1c1`,
  B `D1b1`, R `D1c1`, which puts both bishops on dark cells.

### 2.4 Special moves

- No castling.
- No double step.
- No en passant.

### 2.5 Promotion

- A White pawn that arrives on **rank 4 of board row 4** (`y = 3` and `w = 3`: the 16 cells `A4a4` … `D4d4`) must
  promote. For Black, this is **rank 1 of board row 1** (`y = 0` and `w = 0`).
- It can arrive by either push or by a capture.
- The choices are Q, R, B or N, never K.
- Reaching rank 4 on a lower board, or board row 4 on a lower rank, is **not** promotion. The pawn still has a push
  left.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate.
- **Classically** (TessChess): checkmate wins, and stalemate is a draw.
- **In Quantum Chess 2.0**, the shared quantum rules replace check and mate:
  - there is no check;
  - you win by capturing the enemy king;
  - the draws are 50 moves by each side without a capture or a pawn move, the move limit, and "no legal move";
  - this spec adds **bare kings = draw** when the two kings do not touch (see §3). A lone king with up to 80 flight
    cells can never be trapped by the other king.

---

## 3. Engine mapping (contract)

```js
const DIRS1 = directions(4, 1)        // 8 rook directions
const DIRS2 = directions(4, 2)        // 24 bishop directions
const KING80 = allDirections(4)       // 80
const KNIGHT48 = symmetric([1, 2], 4) // 48
const G = 0.8, PITCH = 4 + G          // gap between boards, board pitch

export default defineVariant({
  id: 'hyper4d',
  category: 'dimensions',
  sides: whiteBlack(),                               // two sides, no teams, enemies = a !== b (default)
  orient: (side, v) => (side === 0 ? v : [v[0], -v[1], v[2], -v[3]]),   // Black mirrors BOTH forward axes
  topology: makeTopology({
    coords,                                          // [x,y,z,w] for sq = x + 4y + 16z + 64w
    name: ([x, y, z, w]) => 'ABCD'[z] + (w + 1) + 'abcd'[x] + (y + 1),
    cell: ([x, y, z, w]) => ({ x: z * PITCH + x, y: (3 - w) * PITCH + (3 - y), w: 1, h: 1, shape: 'rect',
                               shade: (x + y + z + w) % 2 === 0 ? 'dark' : 'light' }),
    layout: { width: 18.4, height: 18.4, boards, labels },   // section 6
  }),
  types: {
    k: { moves: [{ leap: KING80 }],                       royal: true, solid: true,             value: 400, glyph: { sprite: 'k' } },
    q: { moves: [{ ride: DIRS1 }, { ride: DIRS2 }],                                               value: 950, glyph: { sprite: 'q' } },
    r: { moves: [{ ride: DIRS1 }],                                                                value: 400, glyph: { sprite: 'r' } },
    b: { moves: [{ ride: DIRS2 }],                                                                value: 500, glyph: { sprite: 'b' } },
    n: { moves: [{ leap: KNIGHT48 }],                                                             value: 450, glyph: { sprite: 'n' } },
    p: { moves: [{ leap: [[0,1,0,0],[0,0,0,1]], oriented: true, mode: 'move' },
                 { leap: [[1,1,0,0],[-1,1,0,0],[0,1,1,0],[0,1,-1,0],[1,0,0,1],[-1,0,0,1],[0,0,1,1],[0,0,-1,1]],
                   oriented: true, mode: 'capture' }],
         solid: true, value: 100, glyph: { sprite: 'p' },
         promote: { zone: (side, sq) => { const [, y, , w] = coords[sq]; return side === 0 ? y === 3 && w === 3 : y === 0 && w === 0 },
                    to: ['q', 'r', 'b', 'n'] } },
  },
  setup: () => START,            // section 2.3; no options, no rng
  // no extraMoves, no afterMove (the core does promotion), no filterMoves, no visibility, no options
  worldResult(b, mover) { /* default king capture ('king'); plus: only the two kings left and not touching
                             -> { winner: null, reason: 'bareKings' } */ },
  reasonText: (r) => (r === 'bareKings' ? t('quantumchess', 'only the kings are left') : null),
  rules: () => [...],            // section 5
})
```

- **Sides / teams / enemies.** Two sides (`w`, `b`). No teams. `enemies(a, b) = a !== b`.
- **Orientation.** Custom `orient`. The default only mirrors coordinate 1, which would leave Black's pawns pushing
  *up* the board rows.
- **Royal.** `k`.
- **Solid.** `k` and `p`. No other type is solid.
- **Splittable.** `q`, `r`, `b` and `n`, including promoted pieces (the default `!solid`).
- **Move keys.** Cell based:
  - moves: `B1b1-B4b1`, `B4b3-B4b4=q`;
  - splits: `B1c1-B1b3|B3b1`;
  - merges: `A2a2|C4c4-C2c2`.
- **worldResult.**
  - The default rule: the side without its king has lost (`reason: 'king'`).
  - Recommended extra: when only the two kings are left **and they do not touch**, the result is a draw
    (`bareKings`). This is cheap and ends otherwise endless games.
  - If the kings touch, the game goes on, because the side to move simply captures the other king. The classic rules
    make the same exception ("the draws wait if the player to move can capture the enemy king for certain").
  - Both results always agree between worlds, because every capture is rolled. So the game-end roll never fires in
    practice.
- **Piece values** (centipawns, for the generic AI):

  | Piece | P | R | N | B | Q | K |
  |---|---|---|---|---|---|---|
  | Value | 100 | 400 | 450 | 500 | 950 | 400 |

  - The order Q > B > N > R > P follows empty-board mobility: 33, 21, 18, 12.
  - The rook covers only 12 of 255 cells (4.7%), against 22% in 8x8 chess. So in 4D it is the weakest piece.
  - The king's value follows the codebase convention (`VALUES.k`).
- **Optional `evaluate(w, side)`** (light, per world):
  - Pawn advance: `+8 × (forward steps made)`. For White that is `y + w - 2`; for Black it is `(3 - y) + (3 - w) - 2`.
    Add `+40` more when a single push reaches the promotion cells.
  - Centralisation: `+5 ×` (number of coordinates in {1, 2}) for N, B and Q, so at most +20.
- **Performance** (numbers for tests and budgeting):
  - The start position has **135** classical moves per side.
  - Perft 2 = **18,257**. Perft 3 = **2,571,743** (pseudo-legal, no check, a king capture ends the line; no king
    capture is possible within 2 plies).
  - Splits at the start: the queen alone has C(21,2) = 210 pairs, and all pieces together about 700. The AI already
    limits splits (`splitsFromLimited`: 6 per piece, `splits: 2/6/10` per level). Keep that.
  - `generate` benefits from the per-variant line cache in `world.js`. A king has up to 80 one-cell lines, and a queen
    up to 32 lines of at most 3 cells.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: worlds, split, merge, measure, "land = roll, pass = link", the solid roll,
the game-end roll, a budget of 8 per side and at most 4 cells per split. The decisions below cover every place where
4D meets them.

1. **A line is a line, on one board or across boards.**
   - The intermediate cells of a rook, bishop or queen move are the cells along its 4D vector. They can be on other
     boards: `A1a1-A4a1` passes `A2a1` and `A3a1`; `A1c1-C1c3` passes `B1c2`.
   - "Pass = link" treats them exactly like cells on one board. If such a cell *might* hold a piece and the target is
     certainly empty, the move is not rolled: in the worlds where it is blocked, the slider stays and becomes linked.
   - The move preview should draw the path across the boards.
2. **Knights are never blocked,** including their board-to-board jumps. A knight move is rolled only if its target
   might be occupied.
3. **Splits may use two different boards,** for example `B1c1-B1b3|B3b1`. Both targets must be certainly empty quiet
   targets.
   - The two targets may even lie on one line (`B1b1-B2b1|B4b1`): the far half moves in a world where the near half is
     not there.
   - If one path might be blocked, that half stays home in the worlds where it is blocked.
   - If no world has both paths clear, the split is illegal. This is the shared rule. It appears here because
     board-crossing lines are easy to overlook.
4. **Pawns** are solid, and every pawn move is in the measured class M.
   - Each of the two pushes is its own move key.
   - A push onto a cell that might be occupied is a roll: `Moved` (the cell was free) or `Missed` (something is
     there).
   - A capture onto a ghost is a roll: `Captured` or `Missed`.
   - There is no double step and no en passant, so neither classic special case arises.
   - Pawns probe well in 4D because they have two push directions: one pawn can test two cells, one per turn.
5. **Promotion.**
   - The piece is part of the key (`=q/r/b/n`).
   - Promotion happens only in the worlds where the pawn really arrives on a promotion cell. The pawn is solid, so the
     roll settles this at once.
   - The roll memo ignores the chosen piece, as in the classic game.
   - A promoted piece can split and merge.
6. **No castling, no en passant.** `w.x` stays `{}`. There are no rights to keep in step with the worlds.
7. **Kings.**
   - The king is solid.
   - A step onto a cell that might be occupied is a roll. A step onto a certainly empty cell is certain.
   - King danger counts all 32 slider directions, the 48 knight leaps, pawn captures, the enemy king's 80 steps and
     converging captures. The king's 3- and 4-axis steps are ordinary king steps.
8. **Solid roll and game-end roll.**
   - Both are only safety nets here.
   - Kings and pawns move only by measured moves, and every capture of a solid piece is measured. So solid pieces
     never disagree between worlds in normal play.
   - A king capture is always measured, so every world agrees on `worldResult`.
9. **Budget 8, 4-cell cap, Measure.** Unchanged. A bishop's ghost parts always stay on its colour; the what-if view
   shows this naturally.

Nothing in this variant needs a new quantum rule.

---

## 5. Player-facing rules text (rules card)

- The board is a 4×4 grid of small 4×4 boards. A cell is named board, then square: **B2c3** is square c3 on board B2.
  White starts on the bottom boards, Black on the top boards.
- Stepping to the same square on the next board (left, right, up or down) counts as one step, just like stepping to
  the next square. Every piece gets these two extra directions.
- A **rook** moves straight: along a rank or file of its board, or to the same square on the boards in its row or
  column of boards.
- A **bishop** steps in two directions at once: diagonally on its board, diagonally from board to board, or one board
  and one square at the same time. The **queen** moves like a rook or a bishop.
- The **king** steps to any touching cell: the squares around it on its own board and on every board around its board,
  up to 80 cells. The **knight** jumps 2 steps one way and 1 step another, and may jump between boards.
- A **pawn** moves one square up its board, or to the same square one board up (Black: down). It captures one step
  forward plus one step sideways, never straight ahead. There is no double step, no en passant and no castling.
- A pawn promotes on rank 4 of the top boards A4–D4 (Black: rank 1 of A1–D1). It can become a queen, rook, bishop or
  knight.

---

## 6. UI layout

- **Cells.** Squares, `shape: 'rect'`, 1×1.
- **Shading.** Dark when `x + y + z + w` is even, light otherwise, using the classic board colours.
  - This is the true 4D colouring. Each small board is an ordinary checkerboard. Neighbouring boards have opposite
    phases (`A1a1` is dark, `B1a1` is light), which is why a bishop stays on its colour.
- **Grid of boards.** 4 × 4 boards with a gap of `G = 0.8`, so the board pitch is 4.8.
  - Board `(z, w)` has its top-left corner at `(z·4.8, (3-w)·4.8)`.
  - Cell `(x, y)` on it is at `X = z·4.8 + x`, `Y = (3-w)·4.8 + (3-y)`.
  - The drawing is 18.4 × 18.4 units (`PAD = 0.7` covers the labels).
- **`layout.boards`.** 16 entries `{ x: z·4.8, y: (3-w)·4.8, w: 4, h: 4, label: 'ABCD'[z] + (w+1) }`. The generic
  board draws each frame and puts the label ("B2") above the board. The 0.8 gap leaves room for it.
- **`layout.labels`.**
  - The file letters `a`-`d` under each board of the bottom row, at `(z·4.8 + x + 0.5, 18.72)`.
  - The rank numbers `1`-`4` left of each board of the left column, at `(-0.3, (3-w)·4.8 + (3-y) + 0.5)`.
  - The board labels already give the big coordinates.
- **Black's view** rotates the whole drawing 180° (the default for side 1). Black's boards and pawns then run up the
  screen, and the board labels follow the rotated frames.
- **Glyphs.** Only orthodox pieces, so the cburnett sprites for K, Q, R, B, N and P. Ghost parts fade and carry a
  percentage badge, as for every piece.
- **Targets and paths.**
  - When a piece is selected, targets appear on every board at once, with the usual previews (Certain / Quantum /
    Roll).
  - Recommended generic enhancement, shared with Raumschach: while a cell is hovered or selected, faintly outline
    **the same square on the other 15 boards**. This makes board-to-board rook lines and pawn pushes easy to read.
- **Small screens.**
  - 256 cells in 18.4 units give about 19 px per cell on a 360 px phone. Rely on the existing zoom (up to 8×).
  - Consider starting at zoom 2 on narrow screens, centred on the side to move's home boards.
- **Colour is never the only cue.** Every board carries its label, and every cell has its name in the tooltip and the
  `aria-label` (`B2c3`).

---

## 7. Test cases

Unless stated otherwise, positions contain only the pieces listed. "Moves" means the classical generator's keys for
one world, with no check rule. Promotion keys use lower-case letters (`=q`). Every list was produced by
`handoff/tools/hyper4d.py`.

**H1. Start position.**
- The board has 256 cells and 32 pieces.
- White has exactly **135** classical moves: pawns 16, knights 34, bishops 26, king 24, queen 21, rooks 14.
- Black also has 135.
- Perft 2 = **18,257**. Perft 3 = **2,571,743**.
- No piece of either side is attacked in the start position. No White first move attacks the Black king, and no White
  first move leaves the White king capturable.

**H2. Start-position details.**
- Queen `B1b1` → exactly {`A1a1`, `A1b2`, `A2b1`, `B1a1`, `B1a2`, `B1b2`, `B1b3`, `B1b4`, `B1c2`, `B1d3`, `B2a1`,
  `B2b1`, `B2c1`, `B3b1`, `B3d1`, `B4b1`, `C1a1`, `C1b2`, `C2b1`, `D1b3`, `D3b1`} (21).
- Rook `A1b1` → {`A1a1`, `A1b2`, `A1b3`, `A1b4`, `A2b1`, `A3b1`, `A4b1`} (7). `B1b1` (own queen) and `A1c1` (own
  bishop) block it.
- Knight `B1c1` → {`A1a1`, `A1c3`, `A3c1`, `B1a2`, `B1b3`, `B1d3`, `B2a1`, `B2c3`, `B3b1`, `B3c2`, `B3d1`, `C1a1`,
  `C1c3`, `C3c1`, `D1c2`, `D1d1`, `D2c1`} (17).
- Bishop `A1c1` → {`A1a3`, `A1b2`, `A1d2`, `A2b1`, `A2d1`, `A3a1`, `B1c2`, `B1d1`, `B2c1`, `C1c3`, `C3c1`, `D1c4`,
  `D4c1`} (13).
- Pawn `A2b2` → {`A2b3`, `A3b2`}. Black pawn `A3b3` → {`A3b2`, `A2b3`}.

**H3. Rook geometry.** Empty board:
- Rook `B2b2` → exactly {`B2a2`, `B2c2`, `B2d2`, `B2b1`, `B2b3`, `B2b4`, `A2b2`, `C2b2`, `D2b2`, `B1b2`, `B3b2`,
  `B4b2`}.
- A rook has 12 moves on every cell.

**H4. Bishop geometry and colour.** Empty board:
- Bishop `A1a1` → exactly {`A1b2`, `A1c3`, `A1d4`, `A2a2`, `A2b1`, `A3a3`, `A3c1`, `A4a4`, `A4d1`, `B1a2`, `B1b1`,
  `B2a1`, `C1a3`, `C1c1`, `C3a1`, `D1a4`, `D1d1`, `D4a1`} (18).
- Bishop `B2b2` has 30 moves.
- Every target of the bishop `A1c1` is dark (even sum), and every target of `D1c1` is light.

**H5. The queen is rook + bishop, not more.** Empty board:
- Queen `A1a1` has exactly 30 moves: the 12 rook targets plus the 18 bishop targets of H4.
- Queen `B2b2` has 42.
- `A1a1-B2b2` (4 axes) and `A1a1-A2b2` (3 axes) are **not** queen moves.
- With a White queen `A1a1` and a Black king `D4d4` on an otherwise empty board, the queen cannot capture the king
  (`[3,3,3,3]` is a 4-axis line), and the king-danger for Black is 0%.

**H6. King geometry.** Empty board:
- King `A1a1` → exactly {`A1a2`, `A1b1`, `A1b2`, `A2a1`, `A2a2`, `A2b1`, `A2b2`, `B1a1`, `B1a2`, `B1b1`, `B1b2`,
  `B2a1`, `B2a2`, `B2b1`, `B2b2`} (15).
- King `B2b2` has **80** moves, including `B2b2-C3c2` (`[1,0,1,1]`, a 3-axis step) and `B2b2-C3c3` (4-axis).

**H7. Knight geometry.** Empty board:
- Knight `A1a1` → exactly {`A1b3`, `A1c2`, `A2a3`, `A2c1`, `A3a2`, `A3b1`, `B1a3`, `B1c1`, `B3a1`, `C1a2`, `C1b1`,
  `C2a1`} (12).
- Knight `B2b2` has 24 moves. Knight `D4d4` has 12.
- In the start position, `B1c1-D1c2` (`[0,1,2,0]`) is legal even though the White knight on `C1c1` stands between
  them. Knights jump.

**H8. Pawn directions.**
- White pawn `B2b2` alone → exactly {`B2b3`, `B3b2`}.
- Add Black knights on `B2a3`, `B2c3`, `A2b3`, `C2b3`, `B3a2`, `B3c2`, `A3b2` and `C3b2`, with `B2b3` and `B3b2` empty.
  The pawn now has **10** moves: 2 pushes and 8 captures.
- Mirrored: Black pawn `B3b3` alone → {`B3b2`, `B2b3`}. With White knights on the same eight cells it also has 10
  moves.

**H9. What a pawn cannot do.**
- White pawn `B2b2` with Black knights on `B2b3`, `B3b2` and `B3b3`: **no moves**.
  - It cannot capture straight ahead on either axis.
  - It cannot capture forward + forward (`B3b3`).
- White pawn `B2b2` with Black knights on `B2c2`, `C2b2` (sideways), `B2a1` and `B1c2` (backward diagonals): only the
  pushes `B2b3` and `B3b2`.
- `B2b2-B2b4` and `B2b2-B4b2` (double steps) are illegal.
- White pawn `B2b4` (rank 4, but board row 2): exactly {`B3b4`}, a plain move.

**H10. Promotion.**
- White pawn `B4b3` → exactly `B4b3-B4b4=q/r/b/n` (4 keys). `B4b3-B4b4` without a piece is invalid, and so is `=k`.
- White pawn `B3b4` → exactly `B3b4-B4b4=q/r/b/n` (4 keys). This is promotion by the board push.
- White pawn `B3b3` → `B3b4` and `B4b3`, both plain moves.
- White pawn `B4b3` with Black knights on `A4b4` and `B4c4` → 12 keys: `A4b4`, `B4b4` and `B4c4`, each with
  `=q/r/b/n`.
- Black pawn `C1c2` → exactly `C1c2-C1c1=q/r/b/n`.

**H11. No castling.**
- Position: White K `C1b1`, R `A1b1`, R `D1b1`, Black K `D4d4`.
- The king has exactly 34 moves, all to touching cells. Its 35 neighbours are the cells with `x ∈ {0,1,2}`,
  `y ∈ {0,1}`, `z ∈ {1,2,3}` and `w ∈ {0,1}`, other than its own cell; the rook on `D1b1` takes one of them.
- No key moves the king two cells or swaps it with a rook.

**H12. Draw with bare kings.**
- Position: White K `B2b2`, Black K `D4d4` with a Black knight on `C2b2`, White to move.
- White plays `B2b2-C2b2`, which captures the knight.
- **Expected:** the result is a draw (`bareKings`). No roll is needed: the knight was solid.
- Same position with the Black king on `C3c3`: after `B2b2-C2b2` the kings touch (`[1,1,0,1]`). So the game is
  **not** drawn, and Black captures the White king next move.

**HQ1. Pass = link across boards** (quantum).
- Pieces: White R `A1a1`, White K `D1d1`, Black K `D4d4`. Black N is 50% on `A2a1` and 50% on `C3c3` (2 worlds).
- White plays `A1a1-A4a1`, straight up through the boards A2 and A3.
- **Expected:**
  - No roll: the rook is not solid and `A4a1` is certainly empty.
  - In the world with the knight on `A2a1`, the move is blocked and the rook stays on `A1a1`. In the other world, it
    reaches `A4a1`.
  - The rook is now 50% `A1a1` / 50% `A4a1`, linked: the rook is on `A1a1` exactly when the knight is on `A2a1`.
  - White's budget is 2/8.

**HQ2. Pawn probe with two push directions** (quantum).
- Pieces: White P `B2b2`, White K `D1d1`, Black K `D4d4`. Black N is 50% on `B2b3` and 50% on `B3b2`.
- White plays `B2b2-B2b3`. **Expected:** a roll.
  - 50% **Moved**: the pawn is on `B2b3`, and the knight is 100% on `B3b2`.
  - 50% **Missed**: the pawn stays on `B2b2`, and the knight is 100% on `B2b3`.
- `B2b2-B3b2` (the board push) gives the mirror result.

**HQ3. Splits across boards, a partly blocked split, and an illegal one** (quantum). From the start position:
1. White: `B1c1-B1b3|B3b1`.
   - Both cells are certainly empty knight targets.
   - No roll. The knight is 50% `B1b3` / 50% `B3b1`. White's budget is 2.
2. Black: `A3b3-A3b2`. This is certain: the pawn is solid and the cell is certainly empty.
3. White: `B1b1-B1b4|B4b1` is **illegal** (no world has both paths clear).
   - The `B1b4` path crosses `B1b3`.
   - The `B4b1` path crosses `B2b1` and `B3b1`.
   - In each world, exactly one of these paths holds the knight.
4. White: `B1b1-B1b4|B2b1` is **legal**. Only the `B1b4` path can be blocked, in the world where the knight is on
   `B1b3`. **Expected:** no roll.
   - The queen is 25% `B1b1`, 50% `B2b1` and 25% `B1b4`.
   - The `B1b1` part is linked to the knight: queen on `B1b1` ⇔ knight on `B1b3`.
   - White's budget is 4/8.

**HQ4. A converging capture along two different 4D lines** (quantum).
- Pieces: White K `D1d1`, Black K `D4a4`, Black R `C2c2` (solid). White Q is 50% on `A2a2` and 50% on `C4c4`.
  - `A2a2 → C2c2` is the bishop line `[1,0,1,0]` (one square right and one board right) through `B2b2`.
  - `C4c4 → C2c2` is the bishop line `[0,-1,0,-1]` through `C3c3`.
- White plays the merge `A2a2|C4c4-C2c2`.
- **Expected:** both lanes are certainly clear and the queen has no other part, so the capture is **certain**. No roll.
  The queen is 100% on `C2c2` and the rook is gone.
- Variant: add a Black N that is 50% on `B2b2` and 50% on `D1a1`, independent of the queen (4 worlds of 25%).
  - The merge is now **rolled**: **75% Captured**, **25% Missed**. It misses only when the queen is on `A2a2` and the
    knight blocks `B2b2`.
  - After Captured, the knight is 67% `D1a1` / 33% `B2b2`.
  - After Missed, the queen is 100% `A2a2` and the knight is 100% `B2b2`.

**HQ5. Promotion only if the pawn arrives** (quantum).
- Pieces: White P `B4b3`, White K `D1d1`, Black K `D4d4`. Black N is 50% on `B4b4` and 50% on `D2d2`.
- White plays `B4b3-B4b4=n`. **Expected:** a roll.
  - 50% **Moved**: a White knight stands 100% on `B4b4`, and the Black knight is 100% on `D2d2`.
  - 50% **Missed**: a White **pawn** (not promoted) stays on `B4b3`, and the Black knight is 100% on `B4b4`.
- Undo followed by `B4b3-B4b4=q` in the same position replays the same roll (roll memo).

**HQ6. A king's 3-axis step onto a ghost** (quantum).
- Pieces: White K `B2b2`, Black K `D4d4`. Black B is 50% on `C3c2` and 50% on `D4a4` (both light cells).
- White plays `B2b2-C3c2` (`[1,0,1,1]`). **Expected:** a roll, because the king is solid and the target might be
  occupied.
  - 50% **Captured**: the bishop is gone and the king is on `C3c2`.
  - 50% **Moved**: the king is on `C3c2`, and the bishop is 100% on `D4a4`.
- A White queen on `B2b2` would have no such move (H5).

**HQ7. A ghost captures the king** (quantum, game end).
- Pieces: White K `B1b1`, Black K `D4d4`. White R is 50% on `D1d4` and 50% on `A1a1`. `D2d4` and `D3d4` are empty.
- White plays `D1d4-D4d4` (straight up through the boards D2 and D3). **Expected:** a roll (land = roll).
  - 50% **Captured**: the Black king is taken and **White wins** (`king`). Every remaining world agrees, so no
    game-end roll is needed.
  - 50% **Missed**: the rook is 100% on `A1a1`. The game goes on with Black to move.

---

## Open design questions

1. **Setup order.** This spec reorders TessChess's back row (R Q K R / B N N B) so each side has bishops on both
   colours. Should the exact TessChess order (R N K B / B Q N R, all bishops dark) be used instead, for authenticity?
2. **Queen with 32 or 80 directions.** The spec uses 32 (TessChess). A "hyper-queen" option with 80 would follow
   lukajk1, Open King and MDPI. The spec does not recommend it (see §1, item 1).
3. **Bare kings.** The spec recommends a `bareKings` draw in this variant's `worldResult`. The shared core has no such
   rule today. Should it become core-wide instead?
4. **Balance.** Beyond TessChess's own note, nothing is known about balance.
   - The formation is open: rooks and queens can reach the enemy's home boards on move 1.
   - A quick check found no forced king capture in the first two moves.
   - First-move advantage is untested.
5. **Phones.** 256 cells give about 19 px per cell. A generic "zoom to the side to move's boards" start state may be
   needed.
