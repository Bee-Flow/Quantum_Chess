# Variant spec: `hyper4d` (4D chess on a 4x4x4x4 hypercube: TessChess)

Category: `dimensions`. UI name: "4D chess" (as in `catalog.js`). Summary line (catalog): "A 4 × 4 grid of 4 × 4
boards: every piece gains two extra directions."

Note for the implementer: the placeholder `src/variants/hyper4d.js` declares `category: 'rules'`. The catalog and this
spec say `dimensions`.

---

## 1. Sources and chosen rule set

Research note: the first draft was written without web access (search-engine extracts only), and it misread TessChess.
The rules review (section 8) read the TessChess page in full from the Internet Archive (chessvariants.com itself answers
with a Cloudflare challenge), the author's own Chess Variants Wiki page and the setup diagram of the page, and rewrote
the pieces, the setup and every count to match. All counts in this spec were recomputed with a prototype on the real
variant core (`handoff/tmp/rev1-hyper4d/proto.mjs`, scratch) and cross-checked with an adapted copy of
`handoff/tools/hyper4d.py`.

| Source | What it gives |
|---|---|
| **TessChess**, Ben Reiniger, The Chess Variant Pages, 2013-06-03: https://www.chessvariants.com/rules/tesschess (read via https://web.archive.org/web/20231211161003/https://www.chessvariants.com/rules/tesschess) | **The rule set of this spec.** A 4x4x4x4 hypercube drawn as a 4x4 array of 4x4 boards, with "small" and "big" left/right and forward/backward directions. Square names: big column A-D, small column a-d, big row, small row (`Ab11`). **Setup (the page's diagram, "the current favorite"): White R Ab11, Db11; N Ac11, Dc11; B Ba11, Ca11; Q Bd11; K Cd11; 12 pawns Ab22, Ac22, Ba22, Bb22, Bc22, Bd22, Ca22, Cb22, Cc22, Cd22, Db22, Dc22; Black in rows 44 and 33, mirrored.** "The **rook** slides along orthogonals or triagonals. The **bishop** slides along diagonals or quadragonals. Note that the bishop is colorbound. The **queen** moves as a rook or bishop. The **king** steps one cell in any direction." The **knight** moves 2 in one direction and 1 in another ("exactly 0012"). The **pawn** moves one step in either forward direction ("big" or "little") and captures with one forward step plus one step in one of the four non-forward directions. "Pawns do not have an initial two-step (and hence no en passant), and promote upon reaching their forward-most row" (44 for White, 11 for Black). Object: checkmate. "K+Q forces mate against lone K." A comment on the page by Kevin Pacey (2016) estimates P 1, N 3.4, B 5.6, R 7.4, Q 14. |
| **TessChess** on the Chess Variants Wiki, same author, 2010: http://chessvariants.wikidot.com/tesschess | The same pieces, in more words: "Queens move kingwise, but may continue in the same direction"; "Bishops may move along any diagonal or quadragonal"; "Rooks may move along any orthogonal or triagonal"; "There is no castling"; "Pawns may promote upon reaching the forwardmost row". An **older setup** (8 pieces on files b and c, 8 pawns: R Ab11/Dc11, B Ac11/Db11, N Bb11/Cc11, Q Bc11, K Cb11). The author writes there: "One of the main things I don't like about the original setup is that all bishops are stuck on dark squares". The 2013 diagram fixes that. |
| Ben Reiniger, *Four dimensional chess* (IIT note): http://math.iit.edu/~breiniger/Chess/chess-basicmath.pdf | Background by the same author (not readable here). |
| **Hyperchess**, Joe Joyce, 2004: https://www.chessvariants.com/3d.dir/hyperchess.html | 4x4x4x4 as 16 "big squares" of 16 "little squares", cell numbers 1111-4444. King: the 8 neighbours in its big square or the same little square in the 8 neighbouring big squares (16 directions). Rook: straight on the little or the big squares. Bishop: a pure little or pure big diagonal, or a one-step rook "sidestep". The knight traces its path and can be blocked. Pawns step forward or sideways by one number, never backward or diagonally. |
| **4\*Chess**, Kevin Pacey, 2015: https://www.chessvariants.com/rules/4chess-four-dimensional-chess (also Slim 4\*Chess, and Open King 4\*4DChess https://www.chessvariants.com/rules/open-king-44dchess) | Sixteen 4x4 mini-boards, 96 pieces (Slim: 80). Rook 1 axis (8 directions), bishop 2 axes (24), unicorn 3 axes (32), balloon 4 axes (16), **queen = all of them (80)**, king = that queen, one step. Knight 48. Pawn: one rook step forward (on the board, or one board column or row), captures one bishop step forward, no double step, no en passant; promotion on the last rank of the corner mini-board where the enemy king starts. Open King: queen and king 80 directions, **TessChess pawns**. |
| **Chesseract**, Jim Aikin: https://www.chessvariants.com/large.dir/contest/chesseract.html | 4x4x4x4; K, Q, minstrel, 2 rooks, 2 unicorns, 2 wizards, 4 bishops, 4 knights and 21 pawns per side; "virtually unplayable" by its own account. Shows the danger of a crowded 4D setup. |
| **lukajk1/4D-chess** (GitHub, read from source: `src/core/pieces.ts`, `src/core/geometry.ts`, `src/variants.ts`): https://github.com/lukajk1/4D-chess | Rook 1 axis, bishop 2 axes, **queen and king all 80** step vectors, knight (1,2) leaper, unicorn 3 axes, balloon 4 axes. 4^4 variant with pawns pushing along **two** axes, capturing "one forward plus one square in x or z, never combining the two forward axes", promotion in the far corner of both forward axes. No castling. 32 pawns per side. |
| **saFilipJohansson/4D-Chess** (GitHub, README and `starting_positions/four_d_4x4x4x4_v*.txt`): https://github.com/saFilipJohansson/4D-Chess | Pawns forward in "forward dimensions", capture one forward plus one non-forward step. Restricts the king to rook steps "to prevent checkmating from becoming impossibly difficult". Its 4^4 setups use 64+ pieces per side. |
| *A Mathematical Framework for Four-Dimensional Chess*, Appl. Math. 6(3), 48 (MDPI 2026): https://www.mdpi.com/2673-9909/6/3/48 | Formal displacement sets on {1..8}^4: rook changes one coordinate, bishop two by the same amount, king one step on any combination (Chebyshev distance 1). Not verified in review (the site answers 403). |

**Chosen rule set: TessChess as published on The Chess Variant Pages (Ben Reiniger, 2013), unchanged.** The only
additions are the shared Quantum Chess 2.0 rules (capture the king instead of checkmate, see 2.6) and a bare-kings draw.

What is taken from TessChess:

- the board, and the big/small directions;
- the setup of the 2013 diagram: per side 8 pieces on the first rank of the four home boards and 12 pawns on rank 2 of
  the second row of boards, Black mirrored;
- the pieces: rook = orthogonal + triagonal (40 directions), bishop = diagonal + quadragonal (40 directions),
  queen = rook + bishop (all 80 directions), king = any touching cell (80), knight = 48 leaps;
- the pawn: two forward directions, eight capture directions;
- no double step, no en passant, no castling;
- promotion on "row 44" (White) and "row 11" (Black).

Why the published TessChess, and what the other sources do:

1. **Queen: all 80 directions.**
   - TessChess ("the queen moves as a rook or bishop", with its 40-direction rook and bishop; the wiki: "Queens move
     kingwise, but may continue"), 4\*Chess, Open King, lukajk1 and MDPI all give the queen every direction.
   - Empty-board mobility on 4^4: min 45, average 57.1, max 95 of the 255 other cells. That is a strong piece, but
     TessChess balances it by also strengthening the rook and the bishop (item 2).
2. **Rook: orthogonals + triagonals; bishop: diagonals + quadragonals.**
   - This is TessChess's own design choice: "the orthogonal slider is rather weak, and the quadragonal slider is
     restricted to one of eight bindings", so the four elemental sliders are paired.
   - A plain one-axis rook would reach only 12 of 255 cells from every cell (4.7%, against 22% in 8x8 chess). The
     TessChess rook reaches 24 / 30.0 / 48 (min / average / max), the bishop 21 / 27.1 / 47.
   - Every rook step changes the cell colour ("rooks and knights alternate colors in each step"); the bishop is
     colour-bound.
3. **King: all 80 directions (every touching cell).** TessChess, 4\*Chess, Open King, lukajk1 and MDPI agree. Only
   Filip's engine restricts it. TessChess: "a king commands a 3x3x3x3 cube", and "K+Q forces mate against lone K".
4. **Knight: 2 + 1 on any two axes (48 leaps).** All sources agree; it is the only leaper.
5. **Pawn: two forward axes (small rank and big rank); captures one forward step plus one sideways step (small file or
   big file), never forward + forward.** TessChess, Open King and lukajk1 agree word for word, and Filip is
   equivalent. 4\*Chess (three forward axes) and Hyperchess (sideways steps) differ.
6. **Setup: the 2013 diagram.**
   - Each side has one bishop of each colour, queens face queens and kings face kings, each pair screened by two pawns.
   - No piece is attacked at the start, and no first move attacks a king (H1).
   - The older 2010 wiki array (16 pieces per side, all four bishops on dark cells) is superseded by the author's own
     diagram and is not used.
7. **No castling, no double step, no en passant.** TessChess says so explicitly (page and wiki). On a 4-cell axis a
   double step would cross half the board. None of the 4D sources has castling.

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
- **Cell colour.** Dark if `x + y + z + w` is even (so `A1a1` is dark, like a1, and as in the TessChess diagram), light
  otherwise. There are 128 of each.
  - Every rook step (one or three axes), knight leap and one-axis king step changes the colour.
  - Every bishop step (two or four axes) keeps it, so bishops are bound to one colour.
  - The same square on two neighbouring boards therefore has opposite colours.

### 2.2 Pieces and movement

Vectors are `[dx, dy, dz, dw]`. The four kinds of slider direction (TessChess's terms) change one, two, three or all
four coordinates by the same amount per step: **orthogonal** (8 directions), **diagonal** (24), **triagonal** (32) and
**quadragonal** (16).

- **Ride** means: slide any distance until blocked. A rider can capture the first enemy piece on its line.
- On this board a ride is at most 3 steps long.
- The intermediate cells of a ride are the cells along the 4D line, and they can lie on other boards. For example, the
  bishop line `A1c1 → B1c2 → C1c3` follows `[0,1,1,0]`: one square up and one board right per step. Only these cells
  can block; the "component steps" of one diagonal step never do.

| Piece | Letter | Descriptor | Directions | Empty-board mobility (min / avg / max) |
|---|---|---|---|---|
| King | K | `leap` over `allDirections(4)`: every vector with components in {-1,0,1}, not all 0 | 80 = 8 + 24 + 32 + 16 | 15 / 38.06 / 80 |
| Queen | Q | `ride` over `allDirections(4)` | 80 = rook + bishop | 45 / 57.13 / 95 |
| Rook | R | `ride` over `directions(4,1)` and `ride` over `directions(4,3)` | 40 = 8 orthogonal + 32 triagonal | 24 / 30.00 / 48 |
| Bishop | B | `ride` over `directions(4,2)` and `ride` over `directions(4,4)` | 40 = 24 diagonal + 16 quadragonal | 21 / 27.13 / 47 |
| Knight | N | `leap` over `symmetric([1,2], 4)`: 2 along one axis and 1 along another | 48 | 12 / 18.00 / 24 |
| Pawn | P | see below | | |

How the directions look in the grid of boards:

- **Rook, orthogonal.** Along its rank or file on its own board (6 cells). Or to the **same square** on the other boards
  of its board row or board column (6 cells). Always 12 cells on an empty board.
- **Rook, triagonal.** Three coordinates change by one per step:
  - one square diagonally on its board **and** one board straight (left, right, up or down), e.g. `[1,1,1,0]`;
  - or one square straight **and** one board diagonally, e.g. `[1,0,1,1]` (one square right, one board up-right).
- **Bishop, diagonal.** Three kinds of line:
  - diagonally on its own board (4 directions);
  - to the same square on diagonally neighbouring boards and beyond (4 directions);
  - one square straight **and** one board straight at the same time, in any combination (4 × 4 = 16 directions).
    Examples: `[1,0,1,0]` is one square right and one board right. `[0,1,0,1]` is one square up and one board up.
    `[1,0,0,1]` is one square right and one board up.
- **Bishop, quadragonal.** One square diagonally **and** one board diagonally at the same time, e.g. `[1,1,1,1]`
  (`A1a1-B2b2-C3c3-D4d4`).
- **Queen.** Rook or bishop: any of the 80 directions, as far as the line is free ("kingwise, but may continue").
- **King.** Any cell that differs by at most 1 in every coordinate. In the drawing: the 3×3 squares around its square,
  on its own board and on each board around its board, except its own cell.
- **Knight.** 8 ordinary jumps on its board, plus 8 "board-knight" jumps to the same square on a board a knight's move
  away, plus 16 of the form 2 squares + 1 board, plus 16 of the form 1 square + 2 boards. Knights jump: nothing blocks
  them.
- **Counting rule (TessChess).** Count the steps between two cells along each of the four axes. A slider move needs all
  non-zero counts equal: one or three non-zero counts is a rook line, two or four a bishop line, any number a queen
  line. A knight move has exactly the counts 0, 0, 1, 2.

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

### 2.3 Setup (40 pieces, 20 per side)

```
          A             B             C             D
      a  b  c  d    a  b  c  d    a  b  c  d    a  b  c  d
 4 4  .  r  n  .    b  .  .  q    b  .  .  k    .  r  n  .      board row 4 (A4 B4 C4 D4), rank 4
 4 3  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 4 2  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 4 1  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .

 3 4  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .      board row 3
 3 3  .  p  p  .    p  p  p  p    p  p  p  p    .  p  p  .      rank 3
 3 2  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 3 1  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .

 2 4  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .      board row 2
 2 3  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 2 2  .  P  P  .    P  P  P  P    P  P  P  P    .  P  P  .      rank 2
 2 1  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .

 1 4  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .      board row 1
 1 3  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 1 2  .  .  .  .    .  .  .  .    .  .  .  .    .  .  .  .
 1 1  .  R  N  .    B  .  .  Q    B  .  .  K    .  R  N  .      rank 1
(first number = board row, second = rank on that board)
```

| Side | Cells |
|---|---|
| White pieces (rank 1 of boards A1-D1) | R `A1b1`, N `A1c1`, B `B1a1`, Q `B1d1`, B `C1a1`, K `C1d1`, R `D1b1`, N `D1c1` |
| White pawns (rank 2 of boards A2-D2) | `A2b2`, `A2c2`, `B2a2`, `B2b2`, `B2c2`, `B2d2`, `C2a2`, `C2b2`, `C2c2`, `C2d2`, `D2b2`, `D2c2` |
| Black pieces (rank 4 of boards A4-D4) | r `A4b4`, n `A4c4`, b `B4a4`, q `B4d4`, b `C4a4`, k `C4d4`, r `D4b4`, n `D4c4` |
| Black pawns (rank 3 of boards A3-D3) | `A3b3`, `A3c3`, `B3a3`, `B3b3`, `B3c3`, `B3d3`, `C3a3`, `C3b3`, `C3c3`, `C3d3`, `D3b3`, `D3c3` |

- In TessChess names: White R Ab11, N Ac11, B Ba11, Q Bd11, B Ca11, K Cd11, R Db11, N Dc11; pawns Ab22, Ac22, Ba22,
  Bb22, Bc22, Bd22, Ca22, Cb22, Cc22, Cd22, Db22, Dc22.
- Black is White's mirror in the forward axes: `(x, y, z, w) → (x, 3-y, z, 3-w)`.
- **Bishop colours.**
  - White `B1a1` (sum 1) is light and `C1a1` (sum 2) is dark.
  - Black `B4a4` (sum 7) is light and `C4a4` (sum 8) is dark.
- **Kings and queens** face each other along the `[0,1,0,1]` diagonal:
  - `C1d1 … C4d4`, screened by the pawns `C2d2` and `C3d3`;
  - `B1d1 … B4d4`, screened by `B2d2` and `B3d3`.
- Not used: the 2010 wiki array, in our names R `A1b1`, B `A1c1`, N `B1b1`, Q `B1c1`, K `C1b1`, N `C1c1`, B `D1b1`,
  R `D1c1` with 8 pawns on files b and c, which puts all four bishops on dark cells.

### 2.4 Special moves

- No castling.
- No double step.
- No en passant.

### 2.5 Promotion

- A White pawn that arrives on **rank 4 of board row 4** (`y = 3` and `w = 3`: the 16 cells `A4a4` … `D4d4`, TessChess's
  "row 44") must promote. For Black, this is **rank 1 of board row 1** (`y = 0` and `w = 0`, "row 11").
- It can arrive by either push or by a capture.
- The choices are Q, R, B or N, never K. (TessChess does not list the choices; this is the FIDE set.)
- Promotion is compulsory: a pawn on these cells would have no move left. (The TessChess page says pawns "promote upon
  reaching" the row; the older wiki says "may promote".)
- Reaching rank 4 on a lower board, or board row 4 on a lower rank, is **not** promotion. The pawn still has a push
  left.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate.
- **Classically** (TessChess): the object is to checkmate the opposing king. The page states no draw rules, so the FIDE
  ones apply (stalemate is a draw, and so is a position where no checkmate is possible, such as king against king).
- **In Quantum Chess 2.0**, the shared quantum rules replace check and mate:
  - there is no check;
  - you win by capturing the enemy king;
  - the draws are 50 moves by each side without a capture or a pawn move, the move limit (600 plies), and "no legal
    move". A pawn move counts only in the worlds where it really happened: a Missed push does not reset the count;
  - this spec adds **bare kings = draw** when the two kings do not touch (see §3), the capture-the-king form of FIDE's
    "dead position". A lone king with up to 80 flight cells can never be trapped by the other king.
- **Shared deviations from `docs/rules.md`** (the variants core has these rules nowhere; CORE-CHANGES items 60 and 72):
  - there is no "your king cannot escape" loss;
  - there is no draw by threefold repetition;
  - the 50-move and move-limit draws do not wait while the player to move can capture the enemy king for certain;
  - the move limit is 600 plies (300 moves by each side), not 600 moves by each side.
  - The bare-kings draw is the exception: it does wait while the player to move can capture the enemy king for
    certain, because it is not given while the kings touch (§3).

---

## 3. Engine mapping (contract)

```js
const DIRS1 = directions(4, 1)        // 8 orthogonal directions
const DIRS2 = directions(4, 2)        // 24 diagonal directions
const DIRS3 = directions(4, 3)        // 32 triagonal directions
const DIRS4 = directions(4, 4)        // 16 quadragonal directions
const ALL80 = allDirections(4)        // 80 = all of the above
const KNIGHT48 = symmetric([1, 2], 4) // 48
const G = 0.8, PITCH = 4 + G          // gap between boards, board pitch
const START = { A1b1: '0:r', A1c1: '0:n', /* ... section 2.3, one entry per piece */ A3c3: '1:p' }

/** Whether both kings are on the board and their cells differ by at most 1 in every coordinate. */
function kingsTouch(b) {
  const ks = []
  for (let id = 0; id < b.sq.length; id++) {
    if (b.ty[id] === 'k' && b.sq[id] >= 0) ks.push(coords[b.sq[id]])
  }
  return ks.length === 2 && ks[0].every((v, i) => Math.abs(v - ks[1][i]) <= 1)
}

const spec = {
  id: 'hyper4d',
  category: 'dimensions',
  sides: whiteBlack(),                               // two sides, no teams, enemies = a !== b (default)
  orient: (side, v) => (side === 0 ? v : [v[0], -v[1], v[2], -v[3]]),   // Black mirrors BOTH forward axes
  topology: makeTopology({
    coords,                                          // [x,y,z,w] for sq = x + 4y + 16z + 64w, in index order
    name: ([x, y, z, w]) => 'ABCD'[z] + (w + 1) + 'abcd'[x] + (y + 1),
    cell: ([x, y, z, bw]) => ({ x: z * PITCH + x, y: (3 - bw) * PITCH + (3 - y), w: 1, h: 1, shape: 'rect',
                                shade: (x + y + z + bw) % 2 === 0 ? 'dark' : 'light' }),
    layout: { width: 18.4, height: 18.4, boards, labels },   // section 6
  }),
  types: {
    k: { name: () => t('quantumchess', 'King'), moves: [{ leap: ALL80 }], royal: true, solid: true, value: 400,
         glyph: { sprite: 'k' } },
    q: { name: () => t('quantumchess', 'Queen'), moves: [{ ride: ALL80 }], value: 1400, glyph: { sprite: 'q' } },
    r: { name: () => t('quantumchess', 'Rook'), moves: [{ ride: DIRS1 }, { ride: DIRS3 }], value: 740,
         glyph: { sprite: 'r' } },
    b: { name: () => t('quantumchess', 'Bishop'), moves: [{ ride: DIRS2 }, { ride: DIRS4 }], value: 560,
         glyph: { sprite: 'b' } },
    n: { name: () => t('quantumchess', 'Knight'), moves: [{ leap: KNIGHT48 }], value: 340, glyph: { sprite: 'n' } },
    p: { name: () => t('quantumchess', 'Pawn'),
         moves: [{ leap: [[0,1,0,0],[0,0,0,1]], oriented: true, mode: 'move' },
                 { leap: [[1,1,0,0],[-1,1,0,0],[0,1,1,0],[0,1,-1,0],[1,0,0,1],[-1,0,0,1],[0,0,1,1],[0,0,-1,1]],
                   oriented: true, mode: 'capture' }],
         solid: true, value: 100, glyph: { sprite: 'p' },
         promote: { zone: (side, sq) => { const [, y, , w] = coords[sq]; return side === 0 ? y === 3 && w === 3 : y === 0 && w === 0 },
                    to: ['q', 'r', 'b', 'n'] } },          // compulsory: no `optional`
  },
  setup: () => worldFrom(spec, START),   // a fresh world per game; no options, no rng; x stays {}
  // no extraMoves, no afterMove (the core does promotion), no filterMoves, no visibility, no options,
  // no applyMiss / unifyWorlds (CORE-CHANGES Q1, Q3: there is no en passant and no castling to keep in step)
  worldResult(b) {
    // the hook REPLACES the core's default, so it must repeat the king rule itself
    for (const s of [0, 1]) {
      if (!hasRoyal(spec, b, s)) {           // world.js
        return { winner: 1 - s, reason: 'king' }
      }
    }
    let pieces = 0
    for (let id = 0; id < b.sq.length; id++) {
      if (b.sq[id] >= 0) pieces++
    }
    // bare kings: exactly two pieces on the board (the kings) whose cells differ by 2 or more in some coordinate
    return pieces === 2 && !kingsTouch(b) ? { winner: null, reason: 'bareKings' } : null
  },
  // no reasonText: the generic 'bareKings' text (CORE-CHANGES U7) is built into src/variantplay/texts.js
  rules: () => [...],            // section 5
}
export default defineVariant(spec)
```

- **Sides / teams / enemies.** Two sides (`w`, `b`). No teams. `enemies(a, b) = a !== b`.
- **Orientation.** Custom `orient`. The default only mirrors coordinate 1, which would leave Black's pawns pushing
  *up* the board rows.
- **Royal.** `k`.
- **Solid.** `k` and `p`. No other type is solid.
- **Splittable.** `q`, `r`, `b` and `n`, including promoted pieces (the default `!solid`).
- **Move keys.** Cell based:
  - moves: `B1d1-B4d1`, `B4b3-B4b4=q`;
  - splits: `D1c1-B1c2|B2c1`;
  - merges: `A2a2|C4c4-C2c2`.
  - `splitCode` and `mergeCode` write the two cells in square-index order (`sq = x + 4y + 16z + 64w`: board row
    first, then board column, then rank, then file). So `B1c2` (22) comes before `B2c1` (82). `parseCode` accepts
    either order, but tests that compare codes from `splitsFrom` / `mergesFrom` must use this order.
- **Type names.** Every type needs `name` (the existing strings "King" … "Pawn"). The board's `aria-label`, the
  tooltips and the promotion choice show `typeName`, which falls back to the bare letter `q` without it.
- **worldResult.**
  - The hook replaces the core's default completely, so it must itself return `{ winner: 1 - s, reason: 'king' }`
    when side `s` has no king (code above). Both kings missing cannot happen: one capture removes one piece.
  - Recommended extra: when only the two kings are left **and they do not touch**, the result is a draw
    (`bareKings`). This is cheap and ends otherwise endless games. "Only the two kings" means exactly two pieces with
    `sq >= 0`; "touch" means the two cells differ by at most 1 in each of the four coordinates.
  - No `reasonText` hook: CORE-CHANGES U7 is built, and `reasonText` in `src/variantplay/texts.js` already shows
    "only the two kings are left" for `bareKings`, the same string in every variant.
  - If the kings touch, the game goes on, because the side to move simply captures the other king. The classic rules
    make the same exception ("the draws wait if the player to move can capture the enemy king for certain"). With only
    the kings left, that capture is possible (and certain, since kings are solid) exactly when they touch, so this
    draw is exactly `docs/rules.md` 6's "only the two kings are left" together with its waiting rule.
  - Both results agree between worlds. Every capture happens in all worlds of its outcome: a move or merge that
    captures in some world has a piece on its target there, so it is measured (land = roll) and the roll keeps only
    the capturing worlds, or it captures in every world (certain). So all worlds keep the same number of pieces, and
    the kings are solid. The game-end roll is only a safety net here. HQ13 checks this: in 400 random plies with up to
    64 worlds, no outcome ever carried a `solid:` or `end:` note.
- **Piece values** (centipawns, for the generic AI):

  | Piece | P | N | B | R | Q | K |
  |---|---|---|---|---|---|---|
  | Value | 100 | 340 | 560 | 740 | 1400 | 400 |

  - P, N, B, R and Q are Kevin Pacey's TessChess estimates (1, 3.4, 5.6, 7.4 and 14 pawns), from a comment on the
    TessChess page.
  - The order Q > R > B > N > P also follows empty-board mobility: 57.1, 30.0, 27.1, 18.0.
  - The king's value follows the codebase convention (`VALUES.k`).
- **Optional `evaluate(w, side)`** (light, per world). It returns the value for `side`: its own terms minus the
  enemy's (`ai.js` adds it to own material minus enemy material).
  - Pawn advance: `+8 × (forward steps made)`. For White that is `y + w - 2`; for Black it is `(3 - y) + (3 - w) - 2`.
    Add `+40` more when a single push reaches the promotion cells.
  - Centralisation: `+5 ×` (number of coordinates in {1, 2}) for N, B and Q, so at most +20.
- **Performance** (numbers for tests and budgeting; measured on the core, section 8.2):
  - The start position has **153** classical moves per side.
  - Perft 2 = **23,453**. Perft 3 = **3,788,850** (pseudo-legal, no check, a king capture ends the line; no king
    capture is possible within 2 plies). Perft 3 takes about 1.5 s.
  - Splits at the start: **958**, of which the queen alone has C(29,2) = 406. A central queen on an empty board has 95
    targets, so C(95,2) = 4,465 split pairs.
  - The fuzz procedure of `tests/js/variants/fuzz.spec.js` (only Black splits, so at most 8 worlds) takes about
    0.3-0.4 s per 60-ply game.
  - The computer player on the core as built (with CORE-CHANGES U4, `aiSplits`: at most 6 targets and 15 pairs per
    piece), limits 0.4 / 1.5 / 4 s for Easy / Normal / Hard:
    - at the start: about 0.01 / 0.1-0.3 / 0.4-0.8 s;
    - with 8 worlds: about 0.03 / 1.5 / 4.0 s;
    - with 64 worlds: about 0.35-0.5 / 1.6-1.7 / 4.1-4.2 s. There `aiSplits` costs about 80 ms for all pieces of a
      side (before U4: 2.3 s for Easy).
    - The search checks its deadline only between candidate moves, so it can overrun a limit by one candidate.
  - `splitsFrom` (the complete list; used only by tests and `legalMoves(..., { splits: true })`) costs about 0.5 ms per
    target pair at 64 worlds: 1-2 s for all pieces of a side, up to 0.8 s for one piece. There every pair was illegal,
    because both budgets were full and a split always adds an arrangement (section 4, item 9). Tests that
    call it should skip it at a full budget to save time (HQ13). The human UI calls only `splitTargets` (about 1 ms at 64 worlds).
  - `generate` benefits from the per-variant line cache in `world.js`. A king has up to 80 one-cell lines, and a queen
    up to 80 lines of at most 3 cells (rook and bishop up to 40 each).
- **Core changes that touch this variant** (`handoff/CORE-CHANGES.md`). All of these are already in the core of the
  working tree (checked on 2026-09-25):
  - Q7: king danger counts converging captures (HQ12);
  - Q8: a Missed pawn move no longer resets the 50-move counter, as `docs/rules.md` 6 says (HQ2b);
  - Q14: a part moving onto another part of the same piece joins it without a roll (HQ8);
  - U4: computer split candidates;
  - U7: the generic `bareKings` text;
  - U2 and item 39: a start focus (section 6).

  Q1-Q3 and W1-W5 (en passant, castling) do not apply, because this variant has neither. Q13 (parts with different
  types cannot merge) never triggers here, because pawns are solid and so every promotion happens in all worlds of
  its outcome. Section 7 was run on this core, and every expectation holds.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: worlds, split, merge, measure, "land = roll, pass = link", the solid roll,
the game-end roll, a budget of 8 per side, at most 4 cells per piece and at most 64 worlds. The decisions below cover
every place where 4D meets them. All of them follow from the core as built, including CORE-CHANGES Q7 (converging
captures in king danger, item 7) and Q14 (a part joins another part of its piece, item 3), which are in the working
tree. The only open point is the UI's roll memo for promotions (item 5).

1. **A line is a line, on one board or across boards.**
   - The intermediate cells of a rook, bishop or queen move are the cells along its 4D vector. They can be on other
     boards: `A1a1-A4a1` passes `A2a1` and `A3a1`; `A1c1-C1c3` passes `B1c2`; the rook's triagonal `A1b1-C1d3` passes
     `B1c2`.
   - "Pass = link" treats them exactly like cells on one board. If such a cell *might* hold a piece and the target is
     certainly empty, the move is not rolled: in the worlds where it is blocked, the slider stays and becomes linked
     (HQ1, HQ1b, HQ10). The only exception is the shared budget fallback: if the link would push the mover's budget
     over 8, the move is rolled instead ("Roll (budget full)", HQ14).
   - Merges follow the same rule. A merge is rolled only if its target might hold an enemy piece. Onto a certainly
     empty cell, a part whose board-crossing path is blocked in some worlds stays there and becomes linked (HQ4b).
   - "Land = roll" wins over "pass = link". If the target might hold a piece, the move is rolled even when a ghost on
     the path might also block it: the blocked worlds become `Missed` (HQ10: a queen's 4-axis capture of the king past
     a knight ghost is 50% Captured, 50% Missed).
   - The move preview should draw the path across the boards.
2. **Knights are never blocked,** including their board-to-board jumps. A knight move is rolled only if its target
   might be occupied.
3. **Splits may use two different boards,** for example `D1c1-B1c2|B2c1`. Both targets must be certainly empty quiet
   targets.
   - The two targets may even lie on one line (`B1d1-B2d1|B4d1`). Each new world holds the queen on only one of the
     two targets, so the near half never blocks the far half.
   - If one path might be blocked, that half stays home in the worlds where it is blocked.
   - If no world has both paths clear, the split is illegal. This is the shared rule. It appears here because
     board-crossing lines are easy to overlook.
   - **One part moving onto another part of the same piece** (after that split: `B2d1-B4d1`) is an ordinary move onto
     the piece's own part. By `docs/rules.md` 2.1 and `docs/engine-rules.md` 4.5 (edge case 11) it is **not rolled**:
     the part moves in its own worlds, the weights add up on the target, and a piece whose parts all arrive is solid
     again (HQ8). The move is rolled only if some world has **another** piece on the target. The core does this since
     CORE-CHANGES Q14: `isMeasured` does not count a part of the moving piece with the same type as "another piece".
     Before Q14 it rolled: with two parts that was a pointless die (both results gave the same position), and with
     three parts it gave wrong odds (HQ8b).
4. **Pawns** are solid, and every pawn move is in the measured class M.
   - Each of the two pushes is its own move key.
   - A push onto a cell that might be occupied is a roll: `Moved` (the cell was free) or `Missed` (something is
     there).
   - A capture onto a ghost is a roll: `Captured` or `Missed`. This includes the captures along the board axes, such as
     `B2b2-C3b2` (one board right and one board up, HQ11).
   - There is no double step and no en passant, so neither classic special case arises.
   - Pawns probe well in 4D because they have two push directions: one pawn can test two cells, one per turn.
5. **Promotion.**
   - The piece is part of the key (`=q/r/b/n`).
   - Promotion happens only in the worlds where the pawn really arrives on a promotion cell. The pawn is solid, so the
     roll settles this at once.
   - The four promotion keys of one push have identical outcome lists (same results, weights and order), so the same
     random number gives the same result whichever piece is chosen (HQ5). As in the classic game (`docs/rules.md` 8),
     undo followed by another promotion piece must replay the same roll. The UI's roll memo does not do this yet: it
     keys on the whole code, including `=q`. That needs the shared UI change in section 8.2 ("Core changes needed",
     item 1).
   - A promoted piece can split and merge (HQ5b).
6. **No castling, no en passant.** `w.x` stays `{}`. There are no rights to keep in step with the worlds.
7. **Kings.**
   - The king is solid.
   - A step onto a cell that might be occupied is a roll. A step onto a certainly empty cell is certain. A step onto a
     cell where one of its own ghosts might stand is rolled too: `Moved` or `Missed` (HQ6b).
   - King danger counts the queen's 80 directions, the rook's and the bishop's 40, the 48 knight leaps, pawn captures
     and the enemy king's 80 steps; it comes from `generate`, so the variant needs no code for it.
   - King danger also counts **converging captures** (a merge onto the king), as `docs/rules.md` 5 says. The core
     does this since CORE-CHANGES Q7 (`mergeDanger` in `royalDanger`). A queen that is 50% on each of two lines to
     the king can capture it for certain with a merge, and the ring shows 100% (HQ12). In 4D this is common, because
     a queen has 80 lines.
8. **Solid roll and game-end roll.**
   - Both are only safety nets here.
   - Kings and pawns move only by measured moves, and every capture of a solid piece is measured. So solid pieces
     never disagree between worlds in normal play.
   - A king capture is always settled for all worlds at once (rolled, or certain), so every world agrees on
     `worldResult`.
   - The same holds for `bareKings`: every world of an outcome keeps the same number of pieces (section 3) and the
     kings stand in the same cells. A rolled capture of the last other piece is a draw in its `Captured` branch and
     play goes on in its `Moved` branch, with no extra roll (HQ9). HQ13 checks that no outcome ever carries a `solid:`
     or `end:` note.
9. **Budget 8, 4-cell cap, 64 worlds, Measure.** Unchanged. A bishop's ghost parts always stay on its colour; the
   what-if view shows this naturally.
   - A split always adds at least one arrangement of the mover's pieces: both targets are certainly empty, so the two
     children of a world where both paths are clear are new arrangements. So no split is legal when the mover's
     budget is full (HQ14). Every 64-world state of the review runs had both budgets full.

Nothing in this variant needs a new quantum rule, and the core as built follows `docs/rules.md` in every point above,
apart from the shared deviations listed in 2.6 and the UI's roll memo (item 5).

---

## 5. Player-facing rules text (rules card)

`rules()` returns exactly these 8 strings, in this order (the core allows 3 to 8; the shared quantum rules are shown
separately):

1. The board is a 4 × 4 grid of small 4 × 4 boards, and a cell is named board, then square: B2c3 is square c3 on
   board B2. Stepping to the same square on the next board (left, right, up or down) counts as one step, just like
   stepping to the next square.
2. A rook moves straight along a rank or file of its board, or to the same square on the other boards of its row or
   column of boards. It may also move one square diagonally and one board straight at once, or one square straight
   and one board diagonally, step after step.
3. A bishop moves diagonally on its board, to the same square on a diagonal line of boards, or one square and one
   board straight at once. It may also move one square diagonally and one board diagonally at once. It never leaves
   its colour.
4. The queen moves like a rook or a bishop: in any direction a king can step, as far as the way is free.
5. The king steps to any touching cell (up to 80): the squares around it, and the same square and the squares around
   it on each board next to its board, diagonal neighbours included. The knight jumps 2 steps one way and 1 step
   another, also between boards.
6. A pawn moves one square up its board, or to the same square one board up (Black: down). It captures one step
   forward plus one step sideways (a square or a board to the left or right), never straight ahead. There is no double
   step, no en passant and no castling.
7. A pawn must promote on rank 4 of the top boards A4–D4 (Black: rank 1 of A1–D1), to a queen, rook, bishop or knight.
8. The game is drawn when only the two kings are left and they do not touch.

Changes from the first version are listed in section 8.1 (item 11) and section 8.2.

---

## 6. UI layout

- **Cells.** Squares, `shape: 'rect'`, 1×1.
- **Shading.** Dark when `x + y + z + w` is even, light otherwise, using the classic board colours.
  - This is the true 4D colouring. Each small board is an ordinary checkerboard. Neighbouring boards have opposite
    phases (`A1a1` is dark, `B1a1` is light), which is why a bishop stays on its colour. The TessChess diagram is
    coloured the same way.
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
  - Checked against `VariantBoard.vue`: every cell lies in `[0, 18.4]`, and the view box adds `PAD = 0.7` on every
    side, so the labels at `18.72` and `-0.3` and the board labels (drawn 0.22 above each frame) are all inside it.
    `W × H = 338 > 200`, so the board is zoomable without setting `layout.zoomable`.
- **Black's view** rotates the whole drawing 180° (the default for side 1). Black's boards and pawns then run up the
  screen, and the board labels follow the rotated frames.
  - Point labels are rotated as points, and board labels always sit above their rotated frame. So in Black's view
    the file letters (`d c b a` from left to right) end up above the top row of boards, on the same line as those
    boards' labels. They do not overlap: the letters sit 0.5 and 1.5 units from the board's centre, and the label
    (about 0.45 units wide) sits on the centre. Check this on a screenshot. If it reads badly, leave the file letters
    out, because every cell's name is in its tooltip and `aria-label`. No layout position avoids both views.
- **Glyphs.** Only orthodox pieces, so the cburnett sprites for K, Q, R, B, N and P. Ghost parts fade and carry a
  percentage badge, as for every piece.
- **Targets and paths.**
  - When a piece is selected, targets appear on every board at once, with the usual previews (Certain / Quantum /
    Roll).
  - Recommended generic enhancement, shared with Raumschach: while a cell is hovered or selected, faintly outline
    **the same square on the other 15 boards**. This makes board-to-board rook lines and pawn pushes easy to read.
- **Small screens.**
  - 256 cells in 18.4 units give about 19 px per cell on a 360 px phone. Rely on the existing zoom (up to 8×).
  - A zoomed start is possible only through `layout.focus` (`{ x, y, zoom, key }`, via a `layoutOf(state)` that
    returns the static topology with a focus; CORE-CHANGES item 39 and U2). The focus applies on **every** screen
    width, and `layoutOf` does not know the viewer. With a fixed `key` it applies once, when the board is mounted.
    Recommendation for v1: no focus (the whole hypercube, with the zoom buttons). A focus on "the side to move's home
    boards" cannot be built. A fixed focus on White's home boards would show Black the enemy's home boards, because
    the focus is rotated with the view. A focus that follows the side to move would recentre on every ply. If the lead
    wants a zoomed start anyway, the only focus that works the same in both views is the centre:
    `{ x: 9.2, y: 9.2, zoom: 2, key: 'centre' }`, which shows the four middle boards B2, C2, B3 and C3.
- **Colour is never the only cue.** Every board carries its label, and every cell has its name in the tooltip and the
  `aria-label` (`B2c3`).

---

## 7. Test cases

Unless stated otherwise, positions contain only the pieces listed. "Moves" means the classical generator's keys for
one world, with no check rule. Promotion keys use lower-case letters (`=q`). Every list was produced by a prototype of
this spec on the real variant core (review, section 8) and cross-checked with an adapted `handoff/tools/hyper4d.py`.

**H1. Start position.**
- The board has 256 cells and 40 pieces (20 per side).
- White has exactly **153** classical moves: pawns 24, knights 26, bishops 26, king 16, queen 29, rooks 32.
- Black also has 153.
- Perft 2 = **23,453**. Perft 3 = **3,788,850**.
- No piece of either side is attacked in the start position. No White first move attacks the Black king, and no White
  first move leaves the White king capturable (and the same for Black's first moves).

**H2. Start-position details.**
- Queen `B1d1` → exactly {`A1c2`, `A1d1`, `A1d2`, `A2c1`, `A2d1`, `A2d2`, `B1a4`, `B1b1`, `B1b3`, `B1c1`, `B1c2`,
  `B1d2`, `B1d3`, `B1d4`, `B2c1`, `B2d1`, `B3b1`, `B3d1`, `B4a1`, `B4d1`, `C1c1`, `C1c2`, `C1d2`, `C2c1`, `C2d1`,
  `D1b3`, `D1d3`, `D3b1`, `D3d1`} (29). The own bishop `B1a1`, the own king `C1d1` and the own pawns block it.
- Rook `A1b1` → {`A1a1`, `A1b2`, `A1b3`, `A1b4`, `A2b1`, `A3b1`, `A4b1`, `B1b1`, `C1b1`} (orthogonal) plus {`A2a2`,
  `B1a2`, `B1c2`, `C1d3`, `B2a1`, `B2c1`, `C3d1`} (triagonal): 16. The own knight `A1c1`, the own rook `D1b1` and the
  own pawns `A2c2` and `B2b2` block it.
- Knight `A1c1` → {`A1a2`, `A1b3`, `A1d3`, `A2a1`, `A2c3`, `A3b1`, `A3c2`, `A3d1`, `B1c3`, `B3c1`, `C1b1`, `C1c2`,
  `C2c1`} (13).
- Bishop `B1a1` → {`A1a2`, `A2a1`, `B1b2`, `B1c3`, `B1d4`, `B2b1`, `B3c1`, `B4d1`, `C1a2`, `C1b1`, `C2a1`, `D1a3`,
  `D3a1`} (13). Its quadragonal lines are blocked at once by the own pawns `A2b2` and `C2b2`.
- Pawn `A2b2` → {`A2b3`, `A3b2`}. Black pawn `A3b3` → {`A3b2`, `A2b3`}.

**H3. Rook geometry.** Empty board:
- Rook `B2b2` → exactly the 12 orthogonal cells {`B2a2`, `B2c2`, `B2d2`, `B2b1`, `B2b3`, `B2b4`, `A2b2`, `C2b2`,
  `D2b2`, `B1b2`, `B3b2`, `B4b2`} plus the 36 triagonal cells {`A1a2`, `A1b1`, `A1b3`, `A1c2`, `A2a1`, `A2a3`, `A2c1`,
  `A2c3`, `A3a2`, `A3b1`, `A3b3`, `A3c2`, `B1a1`, `B1a3`, `B1c1`, `B1c3`, `B3a1`, `B3a3`, `B3c1`, `B3c3`, `B4d4`,
  `C1a2`, `C1b1`, `C1b3`, `C1c2`, `C2a1`, `C2a3`, `C2c1`, `C2c3`, `C3a2`, `C3b1`, `C3b3`, `C3c2`, `D2d4`, `D4b4`,
  `D4d2`}: 48, the maximum.
- Rook `A1a1` has 24 moves, the minimum. On average a rook has 30.
- `A1a1-A2b2` (`[1,1,0,1]`, 3 axes) is a rook move. `A1a1-A1b2` (2 axes) and `A1a1-B2b2` (4 axes) are not.

**H4. Bishop geometry and colour.** Empty board:
- Bishop `A1a1` → exactly {`A1b2`, `A1c3`, `A1d4`, `A2a2`, `A2b1`, `A3a3`, `A3c1`, `A4a4`, `A4d1`, `B1a2`, `B1b1`,
  `B2a1`, `C1a3`, `C1c1`, `C3a1`, `D1a4`, `D1d1`, `D4a1`} (18 diagonal) plus {`B2b2`, `C3c3`, `D4d4`} (quadragonal):
  21.
- Bishop `B2b2` has 47 moves.
- Every target of a lone bishop on `B1a1` is light (odd sum), and every target of a lone bishop on `C1a1` is dark.
- `A1a1-A2b2` (3 axes) is not a bishop move.

**H5. The queen has all 80 directions.** Empty board:
- Queen `A1a1` has exactly 45 moves: the 24 rook targets of `A1a1` plus the 21 bishop targets of H4.
- Queen `B2b2` has 95.
- `A1a1-B2b2` (4 axes) and `A1a1-A2b2` (3 axes) are queen moves.
- With a White queen `A1a1`, a White king `D1d1` and a Black king `D4d4`, the queen captures the king with
  `A1a1-D4d4` (`[3,3,3,3]`, the quadragonal line through `B2b2` and `C3c3`), and the king-danger for Black is 100%.

**H6. King geometry.** Empty board:
- King `A1a1` → exactly {`A1a2`, `A1b1`, `A1b2`, `A2a1`, `A2a2`, `A2b1`, `A2b2`, `B1a1`, `B1a2`, `B1b1`, `B1b2`,
  `B2a1`, `B2a2`, `B2b1`, `B2b2`} (15).
- King `B2b2` has **80** moves, including `B2b2-C3c2` (`[1,0,1,1]`, a 3-axis step) and `B2b2-C3c3` (4-axis).

**H7. Knight geometry.** Empty board:
- Knight `A1a1` → exactly {`A1b3`, `A1c2`, `A2a3`, `A2c1`, `A3a2`, `A3b1`, `B1a3`, `B1c1`, `B3a1`, `C1a2`, `C1b1`,
  `C2a1`} (12).
- Knight `B2b2` has 24 moves. Knight `D4d4` has 12.
- Knights jump: a White knight `A1a1` with White rooks on all four neighbours `A1b1`, `A1a2`, `B1a1` and `A2a1` (plus a
  White king `D1d1` and a Black king `D4d4`) still has all 12 moves listed above.

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
- Black pawn `C2c1` (rank 1, board row 2) → exactly `C2c1-C1c1=q/r/b/n`: Black promotes by the board push too.
  Black pawn `C2c2` → exactly `C2c2-C1c2` and `C2c2-C2c1`, both plain moves. (This checks that `orient` turns both
  forward axes for Black.)

**H11. No castling.**
- Position: White K `C1d1`, R `A1b1`, R `D1b1`, Black K `D4d4` (the TessChess squares of the king and rooks).
- The king has exactly 23 moves, all to touching cells: the cells with `x ∈ {2,3}`, `y ∈ {0,1}`, `z ∈ {1,2,3}` and
  `w ∈ {0,1}`, other than its own cell.
- No key moves the king two cells or swaps it with a rook.

**H12. Draw with bare kings.**
- Position: White K `B2b2`, Black K `D4d4` with a Black knight on `C2b2`, White to move.
- White plays `B2b2-C2b2`, which captures the knight.
- **Expected:** the result is a draw (`bareKings`). No roll is needed: there is only one world, so the knight is
  certainly on `C2b2`.
- Same position with the Black king on `C3c3`: after `B2b2-C2b2` the kings touch (`[1,1,0,1]`). So the game is
  **not** drawn, and Black captures the White king next move (`C3c3-C2b2`, Black wins by `king`).

**HQ1. Pass = link across boards** (quantum).
- Pieces: White R `A1a1`, White K `D1d1`, Black K `D4d4`. Black N is 50% on `A2a1` and 50% on `C3c3` (2 worlds).
- White plays `A1a1-A4a1`, straight up through the boards A2 and A3.
- **Expected:**
  - No roll: the rook is not solid and `A4a1` is certainly empty.
  - In the world with the knight on `A2a1`, the move is blocked and the rook stays on `A1a1`. In the other world, it
    reaches `A4a1`.
  - The rook is now 50% `A1a1` / 50% `A4a1`, linked: the rook is on `A1a1` exactly when the knight is on `A2a1`.
  - One outcome, key `move`, not rolled (preview "Quantum"). White's budget is 2/8 (Black's stays 2/8).
- **HQ1b, the same on a triagonal line.** White R `A1a1`, White K `D1d1`, Black K `D4d4`; Black N 50% on `C1c3`, 50% on
  `A4a4`. `A1a1-D1d4` follows `[1,1,1,0]` through `B1b2` and `C1c3`. **Expected:** one outcome `move`, not rolled; the
  rook is 50% `D1d4` / 50% `A1a1`, and it is on `A1a1` exactly when the knight is on `C1c3`. Budgets 2/8 and 2/8.

**HQ2. Pawn probe with two push directions** (quantum).
- Pieces: White P `B2b2`, White K `D1d1`, Black K `D4d4`. Black N is 50% on `B2b3` and 50% on `B3b2`.
- White plays `B2b2-B2b3`. **Expected:** a roll.
  - 50% **Moved**: the pawn is on `B2b3`, and the knight is 100% on `B3b2`.
  - 50% **Missed**: the pawn stays on `B2b2`, and the knight is 100% on `B2b3`.
- `B2b2-B3b2` (the board push) gives the mirror result.
- **HQ2b, the 50-move counter.** The same position with `quiet: 7` before `B2b2-B2b3`: after **Missed** the counter
  is 8, after **Moved** it is 0. A pawn move resets the count only where it really happened (`docs/rules.md` 6,
  CORE-CHANGES Q8).

**HQ3. Splits across boards, a partly blocked split, and an illegal one** (quantum). From the start position:
1. White: `D1c1-B1c2|B2c1`.
   - Both cells are certainly empty knight targets, on two different boards (`[0,1,-2,0]` and `[0,0,-2,1]`).
   - No roll. The knight is 50% `B1c2` / 50% `B2c1`. White's budget is 2.
2. Black: `A3b3-A3b2`. This is certain: the pawn is solid and the cell is certainly empty.
3. White: `B1d1-B1a4|B4a1` is **illegal** (no world has both paths clear).
   - The `B1a4` path (`[-1,1,0,0]`, diagonally on board B1) crosses `B1c2` and `B1b3`.
   - The `B4a1` path (`[-1,0,0,1]`, one square left and one board up per step) crosses `B2c1` and `B3b1`.
   - In each world, exactly one of these paths holds the knight.
4. White: `B1d1-B1a4|B1d4` is **legal**. Only the `B1a4` path can be blocked, in the world where the knight is on
   `B1c2`. **Expected:** no roll.
   - The queen is 25% `B1d1`, 25% `B1a4` and 50% `B1d4`.
   - The `B1d1` part is linked to the knight: queen on `B1d1` ⇔ knight on `B1c2`.
   - White's budget is 4/8.

**HQ4. A converging capture along two different 4D lines** (quantum).
- Pieces: White K `D1d1`, Black K `D4a4`, Black R `C2c2` (certainly there). White Q is 50% on `A2a2` and 50% on
  `C4c4`.
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
- **HQ4b, the same merge onto an empty cell links instead** (added by the engine review). Same position without the
  Black rook: White K `D1d1`, Black K `D4a4`, White Q 50% `A2a2` / 50% `C4c4`, Black N 50% `B2b2` / 50% `D1a1`,
  independent (4 worlds of 25%). White plays `A2a2|C4c4-C2c2`.
  - **Expected:** one outcome `move`, **not rolled** (no enemy piece can be on `C2c2`; `docs/engine-rules.md` 11,
    edge case 27).
  - The queen is 75% `C2c2` / 25% `A2a2`. It is on `A2a2` exactly when it was there and the knight blocked `B2b2`.
  - The worlds are (queen `C2c2`, knight `D1a1`) 50%, (queen `C2c2`, knight `B2b2`) 25% and (queen `A2a2`, knight
    `B2b2`) 25%: 3 worlds, budgets 2/8 and 2/8.

**HQ5. Promotion only if the pawn arrives** (quantum).
- Pieces: White P `B4b3`, White K `D1d1`, Black K `D4d4`. Black N is 50% on `B4b4` and 50% on `D2d2`.
- White plays `B4b3-B4b4=n`. **Expected:** a roll.
  - 50% **Moved**: a White knight stands 100% on `B4b4`, and the Black knight is 100% on `D2d2`.
  - 50% **Missed**: a White **pawn** (not promoted) stays on `B4b3`, and the Black knight is 100% on `B4b4`.
- `B4b3-B4b4=q` in the same position has exactly the same outcome list as `=n` (Missed 50%, Moved 50%, same order),
  so the same random number gives the same result: with `applyMove(..., r)` for r = 0.1, 0.49, 0.51 and 0.9 both
  keys pick the same branch.
- UI (after "Core changes needed" item 1, section 8.2): undo followed by `B4b3-B4b4=q` replays the roll of `=n` (the
  memo key ignores the promotion piece). On the UI as built, the memo key contains `=q`, so a new number is drawn.
- **HQ5b, a promoted piece can split** (added by the engine review). White P `B4b3`, White K `D1d1`, Black K `D4d4`,
  one world. White `B4b3-B4b4=q` (certain: one outcome `move`), Black `D4d4-D3d4`, White `B4b4-A4a4|B4a4`.
  **Expected:** one outcome `split`, not rolled; the new queen is 50% `A4a4` / 50% `B4a4`.

**HQ6. A king's 3-axis step onto a ghost** (quantum).
- Pieces: White K `B2b2`, White N `A1a1` (so that a capture does not leave bare kings), Black K `D4d4`. Black B is 50%
  on `C3c2` and 50% on `D4a4` (both light cells).
- White plays `B2b2-C3c2` (`[1,0,1,1]`). **Expected:** a roll, because the king is solid and the target might be
  occupied.
  - 50% **Captured**: the bishop is gone and the king is on `C3c2`. The game goes on.
  - 50% **Moved**: the king is on `C3c2`, and the bishop is 100% on `D4a4`.
- The same with a White **rook** on `B2b2` and the White king moved to `D1d1` (a position without a White king is
  already lost: `worldResult` gives Black the win after any move). The rook has the same move, a triagonal step. It
  is rolled the same way, 50% Moved / 50% Captured, because its target might be occupied. A White bishop on `B2b2`
  (king on `D1d1`) has no such move: `B2b2-C3c2` is illegal.
- **HQ6b, onto its own ghost** (added by the engine review). White K `B2b2`, Black K `D4d4`; White N 50% on `C3c2`,
  50% on `A1a1`. White plays `B2b2-C3c2`. **Expected:** a roll.
  - 50% **Missed**: the own knight was on `C3c2`. The king stays on `B2b2`, and the knight is 100% on `C3c2`.
  - 50% **Moved**: the king is on `C3c2`, and the knight is 100% on `A1a1`.

**HQ7. A ghost captures the king** (quantum, game end).
- Pieces: White K `B1b1`, Black K `D4d4`. White R is 50% on `D1d4` and 50% on `A1a1`. `D2d4` and `D3d4` are empty.
- White plays `D1d4-D4d4` (straight up through the boards D2 and D3). **Expected:** a roll (land = roll).
  - 50% **Captured**: the Black king is taken and **White wins** (`king`). Every remaining world agrees, so no
    game-end roll is needed.
  - 50% **Missed**: the rook is 100% on `A1a1` (from there `D4d4` is a quadragonal line, which a rook cannot use). The
    game goes on with Black to move.

**HQ8. A part moves onto another part of the same piece** (quantum; added by the engine review). The expectations
follow `docs/rules.md` 2.1 and `docs/engine-rules.md` 4.5 (edge cases 11 and 12). They hold on the core as built since
CORE-CHANGES Q14; the core before Q14 rolled HQ8a and HQ8b.
- **HQ8a.** From the start: White `B1d1-B2d1|B4d1` (a split along one line; the queen is 50% `B2d1` / 50% `B4d1`),
  Black `A3b3-A3b2`, White `B2d1-B4d1`.
  - **Expected:** one outcome, key `move`, **not rolled**. The queen is 100% on `B4d1`, there is 1 world, and White's
    budget is 1.
  - Before Q14: rolled, 50% Missed / 50% Moved, and both branches gave that same position.
- **HQ8b.** White K `D1a1`, Black K `D4d4`; White Q 25% `B2d1`, 25% `B4d1`, 50% `A1a1` (3 worlds). White plays
  `B2d1-B4d1`.
  - **Expected:** one outcome `move`, not rolled. The queen is 50% `B4d1` / 50% `A1a1`, and White's budget is 2.
  - Before Q14: rolled, 75% Missed (queen 33% `B4d1` / 67% `A1a1`) / 25% Moved (queen 100% `B4d1`), wrong odds.
- **HQ8c** (the same before and after Q14). White K `D1a1`, Black K `D4d4`; White Q 50% `B2d1` / 50% `A1a1`, and a
  Black N on `B4d1` only in the world with the queen on `A1a1` (2 worlds). White plays `B2d1-B4d1`. **Expected:**
  rolled, 50% Missed / 50% Moved, because another piece might be on the target.

**HQ9. Bare kings after a rolled capture** (quantum, game end).
- White K `B2b2`, Black K `D4d4`; the Black N (the last piece besides the kings) is 50% on `C2b2`, 50% on `A4a4`.
- White plays `B2b2-C2b2`. **Expected:** a roll, because the king is solid and the target might be occupied. Both
  outcomes have no notes, so there is no extra game-end roll.
  - 50% **Moved**: the king is on `C2b2`, the knight is 100% on `A4a4`, and the game goes on.
  - 50% **Captured**: only the kings are left, not touching: **draw** (`bareKings`).
- Same with the Black king on `C3c3`: the Captured branch leaves the kings touching, so the game goes on.

**HQ10. A 4-axis capture of the king past a ghost, and the same line as a link** (quantum).
- White Q `A1a1`, White K `D1d1`, Black K `D4d4`; Black N 50% on `B2b2` (on the queen's line), 50% on `A4a4`.
- King danger for Black: **50%**.
- `A1a1-D4d4`: the target holds the king, so land = roll wins over pass = link. **Expected:** a roll.
  - 50% **Missed**: the knight is on `B2b2` and blocked the line. The queen stays on `A1a1`, the knight is 100% on
    `B2b2`, and the game goes on.
  - 50% **Captured**: **White wins** (`king`).
- `A1a1-C3c3` (the same line, to a certainly empty cell). **Expected:** one outcome `move`, not rolled. The queen is
  50% `C3c3` / 50% `A1a1`, and it is on `A1a1` exactly when the knight is on `B2b2`. Budgets 2/8 and 2/8.

**HQ11. Pawn captures along the board axes onto a ghost** (quantum).
- White P `B2b2`, White K `D1d1`, Black K `D4d4`; Black N 50% on `C3b2`, 50% on `A4a4`. `B2b2-C3b2` is the capture
  `[0,0,1,1]`: one board right and one board up, same square.
- **Expected:** a roll.
  - 50% **Missed**: the pawn stays on `B2b2`, and the knight is 100% on `A4a4`.
  - 50% **Captured**: the pawn is on `C3b2`, and the knight is gone.
- Mirror: Black P `B3b3`, White N 50% on `C2b3`, 50% on `A1a1`, Black to move. `B3b3-C2b3` (`[0,0,1,-1]` for Black)
  is also 50% Missed / 50% Captured.

**HQ12. A converging capture of the king, and the danger ring** (quantum; added by the engine review).
- White K `A4d4`, Black K `C2c2`; White Q 50% on `A2a2`, 50% on `C4c4` (the two bishop lines of HQ4).
- The merge `A2a2|C4c4-C2c2` captures the king **for certain**: one outcome `capture`, not rolled, White wins.
- A single part (`A2a2-C2c2`) is 50% Missed / 50% Captured.
- **Expected king danger for Black: 100%** (`docs/rules.md` 5: the ring counts converging captures), both with White
  to move and with Black to move. This holds on the core as built since CORE-CHANGES Q7; before Q7, `royalDanger`
  gave 50%.

**HQ13. The safety nets never fire** (fuzz invariant for `tests/js/variants/hyper4d.spec.js`).
- Play seeded random games: ordinary moves, and a random split for the side to move on 2 of every 4 plies, so both
  sides split and the state reaches 64 worlds.
- **Expected:** no outcome of any played move has a note (no `solid:` or `end:` roll), and every world agrees on
  `worldResult` after every move. The engine reviews ran 400 plies (`seededRng(11)` to `seededRng(14)`, 100 plies
  each, splits on the plies with `ply % 4` equal to 1 or 2, from a random square of an own splittable piece) and more
  than 5,000 plies in other runs: 0 notes, 0 disagreements, up to 64 worlds.
- Call `splitsFrom` only when `budgetInfo(V, s, s.turn).used < limit`. At a full budget no split can be legal
  (section 4, item 9), so the games stay the same, but the test is 2.5 times faster: 400 plies take about 7 s
  instead of 17 s. Two seeds are enough for CI.

**HQ14. The budget fallback on a board-crossing link** (quantum; added by the engine review).
- Pieces: White R `A1a1`, White K `D1d1`, Black K `D4d4`. Black N 50% `A2a1` / 50% `C3c3` (as in HQ1). White ghosts,
  each 50/50 and independent of every other ghost: N `B1b1` / `B1c2`, B `C1c1` / `D2d2`.
- **HQ14a, budget 4/8.** 8 worlds; budgets 4/8 (White) and 2/8 (Black). White plays `A1a1-A4a1`. **Expected:** one
  outcome `move`, not rolled (a link, as in HQ1). The rook is 50% `A1a1` / 50% `A4a1`; the budgets are 8/8 and 2/8,
  and there are still 8 worlds.
- **HQ14b, budget full.** Add a third White ghost, Q `B2b2` / `C2c3`: 16 worlds, budgets 8/8 and 2/8. White plays
  `A1a1-A4a1`. **Expected:** a roll ("Roll (budget full)"): the link would give White 16 arrangements.
  - 50% **Missed**: the knight was on `A2a1`. The rook stays on `A1a1`, and the knight is 100% on `A2a1`.
  - 50% **Moved**: the rook is on `A4a1`, and the knight is 100% on `C3c3`.
  - Both outcomes have no notes. Budgets after either outcome: 8/8 and 1/8.
- In HQ14b, `splitTargets` still lists the rook's certainly empty targets, but `splitsFrom` for `A1a1` is empty: no
  split is legal at a full budget (`docs/engine-rules.md` 11, edge case 21).

---

## Open design questions

1. **Setup (settled in review).** The spec uses the setup of the TessChess page (2013, 20 per side). The older wiki
   array (16 per side, all bishops on dark cells) is not offered.
2. **Piece set.** The spec uses TessChess's pieces (rook 40, bishop 40, queen 80 directions). A simplified set (one-axis
   rook, two-axis bishop, 32-direction queen, as in the first draft of this spec) would be easier to read in the grid
   but matches no published 4D game, so it is not recommended.
3. **Bare kings (settled by CORE-CHANGES item 40).** The draw stays in this variant's `worldResult`, and the core
   gives the generic text (U7, built).
4. **Balance.** Beyond TessChess's own note (K+Q mates a lone K) and Pacey's piece values, nothing is known about
   balance.
   - The formation is open: rooks and queens can reach the enemy's home board row on move 1 (`A1b1-A4b1`,
     `B1d1-B4d1`).
   - No piece is attacked at the start, and no first move attacks a king (H1).
   - First-move advantage is untested.
5. **Phones.** 256 cells give about 19 px per cell. CORE-CHANGES item 39 leaves a zoomed start to the variant
   (`layoutOf` + `layout.focus`, U2). Section 6 explains why a per-side focus cannot be built and recommends no focus
   in v1 (or the centre focus).

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 (rules fidelity), 2026-09-25. The TessChess rules page (https://www.chessvariants.com/rules/tesschess) is
behind a Cloudflare challenge, so it was read from the Internet Archive snapshot
https://web.archive.org/web/20231211161003/https://www.chessvariants.com/rules/tesschess, with its setup diagram
https://web.archive.org/web/20231211161003im_/https://www.chessvariants.com/membergraphics/MStesschess/tesschessinit.jpg
and the author's wiki page http://chessvariants.wikidot.com/tesschess. The other chessvariants.com pages were read from
Internet Archive snapshots of 2024-2025. Every count was recomputed with a prototype of this spec on the real core
(`handoff/tmp/rev1-hyper4d/proto.mjs`, `htests.mjs`, `hq.mjs`, `hq3.mjs`, `hq6.mjs`; scratch, not committed) and
cross-checked with an adapted copy of `handoff/tools/hyper4d.py` (same 153 moves, perft 2 and mobility figures). The
prototype reproduces the first draft's own numbers (135 moves, perft 2 = 18,257, perft 3 = 2,571,743) when set to the
draft's rules, so the differences below come from the rules, not from the generator.

Changes:

1. **Rook: one axis (8 directions) → orthogonal + triagonal (40).** The TessChess page: "The rook slides along
   orthogonals or triagonals"; the wiki: "Rooks may move along any orthogonal or triagonal". The draft said TessChess's
   rook was the one-axis rook. Sources: TessChess page and wiki (URLs above).
2. **Bishop: two axes (24) → diagonal + quadragonal (40).** "The bishop slides along diagonals or quadragonals. Note
   that the bishop is colorbound." Same sources.
3. **Queen: 32 directions → all 80.** "The queen moves as a rook or bishop" means the TessChess rook + bishop, which is
   all 80 directions; the wiki says "Queens move kingwise, but may continue in the same direction". The draft's claim
   "TessChess chooses rook + bishop (32)" and its argument against an 80-direction queen rested on the misreading, and
   the 32-direction queen matched no source. 4\*Chess also has an 80-direction queen
   (https://www.chessvariants.com/rules/4chess-four-dimensional-chess), which the draft had attributed to Open King
   only.
4. **Setup: the draft's reordering of the 2010 wiki array (16 per side) → the 2013 diagram of the TessChess page (8
   pieces + 12 pawns per side: R Ab11/Db11, N Ac11/Dc11, B Ba11/Ca11, Q Bd11, K Cd11, pawns Ab22, Ac22, Ba22-Bd22,
   Ca22-Cd22, Db22, Dc22; Black mirrored in rows 44 and 33).** The draft took the text setup of the 2010 wiki, whose
   all-dark bishops the author himself disliked; the published diagram already has one bishop per colour, so the
   draft's own reordering (its only intended deviation) is no longer needed. Source: the diagram (URL above), read cell
   by cell. Section 2.3, the kings/queens and bishop-colour notes, and the reference line were rewritten.
5. **Section 1 rewritten.** The TessChess row now quotes the page; a wiki row was added; the chosen rule set is now
   "TessChess unchanged"; the "sources disagree" list now argues from the real TessChess. Removed false claims: "the
   king is the only piece that can step along a 3- or 4-axis diagonal", "no piece slides along them", "rook = weakest
   piece". Corrected the Hyperchess row (the bishop also has a one-step rook sidestep, the knight can be blocked, pawns
   also step sideways; https://www.chessvariants.com/3d.dir/hyperchess.html), the 4\*Chess row (queen 80), the
   Chesseract row (full army; https://www.chessvariants.com/large.dir/contest/chesseract.html) and marked the MDPI
   paper as unverified (HTTP 403).
6. **2.1 colour rules**: every rook step (1 or 3 axes) and every knight leap changes colour, every bishop step (2 or 4
   axes) keeps it; the TessChess diagram uses the same colouring (Aa11 dark). TessChess: "rooks and knights alternate
   colors in each step".
7. **2.2**: piece table, direction descriptions and mobility figures redone for the TessChess pieces; added TessChess's
   counting rule ("for sliders, the nonzero numbers of squares in each direction must be equal, and for knights they
   must be exactly 0012"). Pawn, king and knight rules were checked against the page and are unchanged.
8. **2.5 / 2.6**: stated what TessChess leaves open. It lists no promotion choices (FIDE Q/R/B/N used) and the wiki
   says "may promote" while the page says "promote upon reaching", so promotion is compulsory (the pawn would have no
   move left). The page gives checkmate as the object and no draw rules, so FIDE's apply classically; the bare-kings
   draw is the capture-the-king form of FIDE's dead position (Laws of Chess 5.2.2,
   https://handbook.fide.com/chapter/E012023).
9. **Section 3**: types (rook/bishop/queen descriptors), move-key examples on the new setup, the worldResult agreement
   argument (the draft said "every capture is rolled", but a capture onto a certainly occupied cell such as HQ4 is
   certain), piece values now Kevin Pacey's TessChess estimates from the comments of the TessChess page (P 1, N 3.4,
   B 5.6, R 7.4, Q 14 → 100/340/560/740/1400), performance numbers (153 moves, perft 2 = 23,453, perft 3 = 3,788,850,
   958 splits at the start, queen 406).
10. **Section 4**: examples moved to the new setup (`D1c1-B1c2|B2c1`, `B1d1-B2d1|B4d1`, rook triagonal `A1b1-C1d3`);
    king danger now counts 80 queen directions and the 40-direction rook and bishop.
11. **Section 5**: rook, bishop and queen bullets rewritten for the TessChess moves.
12. **Section 7**: H1, H2, H3, H4, H5, H7 (jump example: the start square `B1c1` no longer holds a knight) and H11 (the
    TessChess king square `C1d1`: 23 moves) recomputed; HQ3 rebuilt on the new setup (knight `D1c1`, queen `B1d1`) and
    run on the core. Fixed wrong statements that did not depend on the piece set: H12 said "no roll is needed: the
    knight was solid" (knights are not solid; there is simply one world); HQ4 called the Black rook "solid" (only
    kings and pawns are); HQ6's Captured branch left only the two kings, not touching, so the prototype ends the game
    as a `bareKings` draw there, which the draft did not say (a White knight `A1a1` was added so that the case tests
    only the king step), and HQ6's queen remark became a rook/bishop remark.
13. **Verified unchanged** (by reasoning and on the core): board, cell names and coordinates, the `B2c3` naming and the
    TessChess mapping, orientation (Black mirrors both forward axes), pawn moves and captures (H8, H9), promotion cells
    and keys (H10), no castling / double step / en passant, H6, H12 results, HQ1, HQ2, HQ4 outcomes (certain; 75% /
    25%; 67% / 33%), HQ5 and HQ7.

### 8.2 Engine review

Reviewer 2 (engine and quantum consistency), 2026-09-25. Read `handoff/IMPLEMENTING.md`, `handoff/CONTRACT.md`,
`handoff/CORE-CHANGES.md`, the core in `src/variants/core/` (`quantum.js`, `world.js`, `variant.js`, `topology.js`,
`ai.js`, `orthodox*.js`), the variant UI (`VariantBoard.vue`, `texts.js`, `useVariantGame.js`), `docs/rules.md` and
`docs/engine-rules.md`. An earlier run of this review was stopped before it wrote this subsection. Before stopping, it
had already added the following to sections 3, 4 and 7: HQ1b, HQ8-HQ13, the performance figures and four "core
changes". This subsection re-checks that work and records it.

Every case of section 7 was run on a prototype of section 3 on the core of the working tree. The scripts are
`handoff/tmp/critic-hyper4d/proto.mjs` with `classical.mjs`, `quantum.mjs` and `newtests.mjs`, and, for this run,
`r2/new2.mjs`, `r2/hq13.mjs`, `r2/hq13h.mjs` and `r2/ai64.mjs` (scratch, not committed). All cases pass, the old ones
and the new ones.

Changes:

1. **The earlier run's core changes 1 and 2 are built.**
   - They are CORE-CHANGES Q14 (a part joins another part of the same piece: `isMeasured` with `moverOf`) and Q7
     (converging captures in king danger: `mergeDanger`). Both are in the working tree's `quantum.js`.
   - HQ8a, HQ8b, HQ8c and HQ12 pass on this core. Section 3, section 4 (the introduction, items 3 and 7 and the closing
     paragraph) and section 7 (HQ8, HQ12) no longer say that the core fails them.
   - HQ8's "core as built" lines are now notes on how the core behaved before Q14.
2. **The earlier run's "core change 4" is no longer requested.** It asked for an early exit in `splitsFrom` when the
   budget is full.
   - U4 (`aiSplits`) is built. At 64 worlds it costs about 80 ms per side, not seconds.
   - The complete `splitsFrom` is called only by tests. HQ13 now skips it at a full budget. The games stay identical
     (same move list hash) and run 2.5 times faster: 7 s instead of 17 s for 400 plies.
   - Section 4 item 9 states why no split can be legal at a full budget: the two children of a branching world are
     new arrangements, because both targets are certainly empty. HQ14 checks this.
3. **Section 3, code and hooks.**
   - The `reasonText` hook is removed: U7 is built, and `texts.js` shows the shared "only the two kings are left". The
     hook's own string, "only the kings are left", also differed from the shared one.
   - The `kingsTouch` helper is written out. The code called it without defining it.
   - A new note says that the `bareKings` draw is `docs/rules.md` 6's "only the two kings are left" with its waiting
     rule.
4. **Section 3, performance, re-measured on the current core.**
   - The fuzz takes 0.3-0.4 s per game.
   - The computer player now has timings at the start, at 8 worlds and at 64 worlds. Easy at 64 worlds went from
     2.3 s to 0.35-0.5 s.
   - The cost of `splitsFrom` was measured again.
   - The paragraph about `splitsFromLimited` is removed: that function no longer exists.
   - The list "Core changes that touch this variant" now says that all of them are built. Q13 cannot trigger here.
5. **Section 2.6: shared deviations from `docs/rules.md`.** CORE-CHANGES items 60 and 72 ask every spec to list them,
   and this spec did not:
   - there is no "king cannot escape" loss;
   - there is no repetition draw;
   - the 50-move and move-limit draws do not wait;
   - the move limit is 600 plies.

   Also added: a Missed pawn push does not reset the 50-move count (Q8, `docs/rules.md` 6).
6. **Section 4.**
   - Item 1: merges link like moves (HQ4b), and the budget fallback now has a test (HQ14).
   - Item 5: the memo reference points to the list below, and the promoted-piece split has a test (HQ5b).
   - Item 7: the king step onto its own ghost has a test (HQ6b).
   - Item 9: why no split is legal at a full budget.
7. **Section 5 (rules card).**
   - Bishop: "diagonally from board to board" could be read as "one square diagonally and one board". It now reads
     "to the same square on a diagonal line of boards".
   - King: "every neighbouring board" could be read as the four orthogonal neighbours only. It now reads "each board
     next to its board, diagonal neighbours included".
   - The cross-reference "section 8.2 (item 11)" meant reviewer 1's list. It now points to 8.1.
8. **Section 7.** New cases, each run on the core:
   - H10: Black promotes by the board push (`C2c1-C1c1=q/r/b/n`), which checks that `orient` turns both forward axes;
   - HQ2b: the 50-move counter after Missed (8) and Moved (0);
   - HQ4b: a merge onto an empty cell past a ghost links (75% / 25%, 3 worlds, not rolled);
   - HQ5b: a promoted queen can split;
   - HQ6b: a king step onto its own ghost (Missed / Moved);
   - HQ14: the budget fallback on a board-crossing link (budget 4: a link; budget 8: rolled 50% / 50%), and no split
     at a full budget.

   Also changed:
   - HQ8c now names the kings and the side to move;
   - HQ13 now gives the exact procedure, the budget guard and the timing.
9. **Open design questions 3 and 5** are marked as settled by CORE-CHANGES items 40 and 39.
10. **Checked and left unchanged.**
    - The engine mapping can be built with the hooks as they are: the custom `orient`, `makeTopology` with 4D
      coordinates, the descriptors (`directions(4, k)`, `allDirections(4)`, `symmetric([1, 2], 4)`),
      `promote.zone(side, to)`, and a `worldResult` that replaces the default. It needs no `applyMiss` or
      `unifyWorlds`.
    - Every item of section 4 agrees with `docs/rules.md` 2-7 and `docs/engine-rules.md` 11 (edge cases 3, 5, 9, 11,
      12, 21, 24, 26, 27).
    - The solid roll and the game-end roll never fire, by the argument in section 3 and in HQ13: 400 plies, 0 notes,
      0 disagreements, up to 64 worlds.
    - Section 6 fits `VariantBoard.vue`:
      - the board labels sit 0.22 above the frames;
      - `PAD = 0.7` holds the labels;
      - the board is zoomable, since 338 > 200;
      - a focus is rotated with the view, and the centre focus shows B2, C2, B3 and C3.
    - H1-H12 and HQ1-HQ13 reproduce exactly.

Core changes needed:

1. **The variant UI's roll memo** (`play` in `src/variantplay/composables/useVariantGame.js`). This is a shared UI
   change, not in `src/variants/core/`, and not yet in CORE-CHANGES.md. No variant hook reaches the memo.
   - Today the key is `state.ply + ':' + code`. `docs/rules.md` 8 asks for two things:
     - **(a) The same roll whichever promotion piece is chosen.** Strip a trailing promotion suffix from the code in
       the key, with `code.replace(/=[^-|?@=\s]+$/, '')` (`B4b3-B4b4=q` → `B4b3-B4b4`), as the classic memo does
       (`stripPromo` in `rollIdentity`, `docs/engine-rules.md` 9.3). The promotion keys of one move have identical
       outcome lists (HQ5), so the same number gives the same result.
     - **(b) A new roll once the game has changed.** Add a hash of the position to the key: `state.turn` and every
       world as `worldKey(b) + '@' + w`, in the stored order. The classic memo is ply / position hash / code. Without
       the hash, an undo followed by a different earlier move reuses, at the same ply, a roll the player has already
       seen.
   - Test: the UI line of HQ5 (undo, then `=q` after `=n`, gives the same branch).

Not needed, optional: `splitsFrom` and `aiSplits` could return `[]` at once when `budgetInfo(V, state, state.turn)`
has `used >= limit`. The result is the same (section 4 item 9), but it saves about 1-2 s per call of the complete
list at 64 worlds, and 80 ms per computer move.
