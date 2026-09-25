# Variant spec: `raumschach` (Raumschach, 5x5x5 space chess, Maack 1907)

Category: `dimensions`. UI name: "Raumschach". Summary line: "Chess in a 5x5x5 cube, with a new piece: the unicorn."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in this session, so the rules below
come from search-engine extracts of these pages plus prior knowledge. Every move count below was computed with a
reference move generator (`handoff/tools/raum.py`), so the numbers are self-consistent.

| Source | What it gives |
|---|---|
| Ferdinand Maack, *Spielregeln zum Raumschach* (Hamburg 1907, revised 1913); *Raumschach: Einführung in die Spielpraxis* (1919) | The original rules. Primary historical source, not consulted directly. |
| International Raumschach Federation (IRF): https://www.raumschach.org/tutorial, https://www.raumschach.org/misconceptions, https://www.raumschach.org/theory1 (piece monographs), https://www.raumschach.org/theory3 | Notation (level A-E, file a-e, rank 1-5), the full setup including **Black unicorns Da5, Dd5 and Black bishops Db5, De5**, the pawn with **2 move and 5 capture directions**, promotion on **rank 5 of level E**, and the value ordering Q > B > N > R > U > P. |
| Chess Variant Pages, "Raumschach": https://www.chessvariants.com/3d.dir/3d5.html (H. Bodlaender / J.-L. Cazaux) | The same board, setup and piece moves. The pawn example lists only **4** captures (Ab3, Ad3, Bb2, Bd2 from Ac2) and leaves out the forward-and-up capture (Bc3). Also says: no castling, no double step, no en passant, stalemate is a draw. |
| Wikipedia, "Three-dimensional chess" (Raumschach section): https://en.wikipedia.org/wiki/Three-dimensional_chess | Overview. 125 cells, 5 levels A (bottom) to E (top), rook through faces, bishop through edges, unicorn through corners. |
| D. B. Pritchard, *The Classified Encyclopedia of Chess Variants* (2007), entry "Raumschach" | Secondary check of the setup and the pieces. |

**Chosen rule set: Maack's standard Raumschach as documented by the IRF (raumschach.org).**

- The one real disagreement is the pawn capture. The IRF gives 5 capture directions and chessvariants.com gives 4.
  I chose the **IRF's 5**. Reasons:
  - It follows one rule: "a pawn moves one rook step forward and captures one bishop step forward". That means every
    bishop step with at least one forward component and no backward one.
  - It is symmetric, so it is easy to explain.
  - The IRF site is the one that deals with this question directly. Maack's club tried several pawn rule sets
    (IRF, quoting Maack 1919), so no version is "the" original.
- Black's minor pieces sit point-symmetric to White's: Black unicorns on Da5 and Dd5, Black bishops on Db5 and De5.
  Some diagrams online mirror them the other way; the IRF and chessvariants.com both give Da5/Dd5.
  - Check: each side gets one bishop of each cell colour.
  - Check: White's Be1 unicorn and Black's Da5 unicorn share a colour complex, and so do White's Bb1 and Black's
    Dd5. The IRF states both facts.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Cells.** A 5x5x5 cube: 125 cells, all of which exist.
- **Levels.** Five 5x5 levels, named `A` (bottom, White's home) to `E` (top, Black's home).
- **Files and ranks.** Files `a`-`e` (left to right from White's side). Ranks `1`-`5` (from White's side towards
  Black's).
- **Cell names** are level, then file, then rank: `Aa1` is White's bottom-left-near corner, `Cc3` is the centre and
  `Ee5` is the far top corner.
- **Coordinates** (0-based): `x` = file (a=0 … e=4), `y` = rank - 1 (0 … 4), `z` = level (A=0 … E=4). So
  `Aa1 = (0,0,0)`, `Cc3 = (2,2,2)` and `Ee5 = (4,4,4)`.
- **Cell colour.** Dark if `(x + y + z)` is even (so `Aa1` is dark, as a1 is in chess), light otherwise. Bishops never
  change colour.
- **Unicorn classes.** Unicorns are bound to one of 4 classes by parity: `(x, y, z) mod 2`, up to flipping all three
  bits. The classes hold 35 cells ({000,111}) and 30, 30 and 30 cells.

### 2.2 Pieces and movement

Vectors are `(dx, dy, dz)` in the coordinates above. "Ride" means slide any distance until blocked; a slider can
capture the first enemy piece on its line.

| Piece | Letter | Descriptor | Directions |
|---|---|---|---|
| King | K | `leap` over all 26 vectors with each component in {-1, 0, 1}, not all zero | 26 neighbours (6 face, 12 edge, 8 corner) |
| Queen | Q | `ride` over the same 26 vectors | rook + bishop + unicorn |
| Rook | R | `ride` over the 6 vectors with exactly one non-zero component (±1) | through the faces of the cell |
| Bishop | B | `ride` over the 12 vectors with exactly two non-zero components (±1, ±1) | through the edges; a flat diagonal in any of the three plane orientations |
| Unicorn | U | `ride` over the 8 vectors (±1, ±1, ±1) | through the corners ("triagonals"); all three coordinates change at once |
| Knight | N | `leap` over the 24 vectors that are a permutation of (0, ±1, ±2) | 2 steps along one axis and 1 along another; the third coordinate stays the same |
| Pawn | P | see below | |

**Pawn** (vectors oriented: White as written; Black multiplies each vector by `(1, -1, -1)`, so its forward is
towards rank 1 and its "up" is towards level A):

- **Move** (`mode: 'move'`, target must be empty): `leap [(0,1,0), (0,0,1)]`. One step forward (same level, next
  rank) or one step up (next level, same rank).
- **Capture** (`mode: 'capture'`, target must hold an enemy):
  `leap [(1,1,0), (-1,1,0), (1,0,1), (-1,0,1), (0,1,1)]`.
  - Diagonally forward on the same level (2 vectors).
  - Diagonally up and sideways (2 vectors).
  - Forward and up (1 vector).
- There is **no** double step, **no** en passant and **no** capture straight ahead or straight up.
- A pawn never moves or captures backwards or down. For example, `(0,-1,+1)` is not a pawn capture.

**Mobility on an empty board** (a check for the move generator):

- Rook: always 12.
- Bishop: 12 on `Aa1`, 24 on `Cc3`.
- Unicorn: 4 on `Aa1`, 16 on `Cc3`.
- Queen: 28 on `Aa1`, 52 on `Cc3`.
- King: 7 on `Aa1`, 26 on `Cc3`.
- Knight: 6 on `Aa1`, 24 on `Cc3`.
- Averages over all 125 cells: R 12.0, B 14.4, N 11.5, U 6.4, Q 32.8.

### 2.3 Setup (40 pieces, 20 per side)

| Side | Level | Cells |
|---|---|---|
| White | A, rank 1 | R `Aa1`, N `Ab1`, K `Ac1`, N `Ad1`, R `Ae1` |
| White | A, rank 2 | P `Aa2`, `Ab2`, `Ac2`, `Ad2`, `Ae2` |
| White | B, rank 1 | B `Ba1`, U `Bb1`, Q `Bc1`, B `Bd1`, U `Be1` |
| White | B, rank 2 | P `Ba2`, `Bb2`, `Bc2`, `Bd2`, `Be2` |
| Black | E, rank 5 | R `Ea5`, N `Eb5`, K `Ec5`, N `Ed5`, R `Ee5` |
| Black | E, rank 4 | P `Ea4`, `Eb4`, `Ec4`, `Ed4`, `Ee4` |
| Black | D, rank 5 | U `Da5`, B `Db5`, Q `Dc5`, U `Dd5`, B `De5` |
| Black | D, rank 4 | P `Da4`, `Db4`, `Dc4`, `Dd4`, `De4` |

- Bishop colours: White `Ba1` is light and `Bd1` is dark. Black `Db5` is dark and `De5` is light.
- Kings face each other on the c-file (`Ac1` and `Ec5`), and so do the queens (`Bc1` and `Dc5`).

### 2.4 Special moves

- No castling.
- No double step.
- No en passant.

### 2.5 Promotion

- A White pawn that arrives on **rank 5 of level E** (`Ea5`-`Ee5`) must promote. For Black, this is **rank 1 of
  level A** (`Aa1`-`Ae1`).
  - These are the only cells where a pawn has no forward move left.
  - A pawn on rank 5 of a lower level still moves up. A pawn on level E below rank 5 still moves forward.
- The pawn may promote to a Q, R, B, N or **U** (unicorn), never a K.
- A pawn can arrive by a move (forward or up) or by a capture. Example: White `Dd4xEd5=Q` via `(0,1,1)`.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate.
- **Classically**, a game is won by checkmate. Stalemate, threefold repetition and the 50-move rule are draws
  (per chessvariants.com, following FIDE).
- **In Quantum Chess 2.0**, the shared quantum rules replace check and mate:
  - You win by capturing the king, or when the opponent's king cannot escape (`king_trapped`).
  - "No legal move" is a draw. This covers stalemate.
  - Bare kings, repetition, the 50-move rule and the ply cap work as in the classic game.

---

## 3. Engine mapping (contract)

```js
export default {
  id: 'raumschach',
  category: 'dimensions',
  name: () => t('quantumchess', 'Raumschach'),
  summary: () => t('quantumchess', 'Chess in a 5×5×5 cube, with a new piece: the unicorn.'),
  sides: [{ id: 'w', name: White, color: 'white' }, { id: 'b', name: Black, color: 'black' }],
  enemies: (a, b) => a !== b,
  topology: grid([5, 5, 5], {                 // x = file, y = rank, z = level
    name: ([x, y, z]) => 'ABCDE'[z] + 'abcde'[x] + (y + 1),
    orient: { w: [1, 1, 1], b: [1, -1, -1] }, // per-axis sign for `oriented` vectors (NOT a 180° turn: x is kept)
  }),
  pieceTypes: {
    k: { moves: [{ leap: ALL26 }],                                   royal: true,  solid: true,  splittable: false, value: 0 },
    q: { moves: [{ ride: ALL26 }],                                   royal: false, solid: false, splittable: true,  value: 1100 },
    r: { moves: [{ ride: FACE6 }],                                   solid: false, splittable: true,  value: 450 },
    b: { moves: [{ ride: EDGE12 }],                                  solid: false, splittable: true,  value: 520 },
    u: { moves: [{ ride: CORNER8 }],                                 solid: false, splittable: true,  value: 170, glyph: 'U' },
    n: { moves: [{ leap: KNIGHT24 }],                                solid: false, splittable: true,  value: 470 },
    p: { moves: [{ leap: [[0,1,0],[0,0,1]], oriented: true, mode: 'move' },
                 { leap: [[1,1,0],[-1,1,0],[1,0,1],[-1,0,1],[0,1,1]], oriented: true, mode: 'capture' }],
         solid: true, splittable: false, value: 100 },
  },
  promotion: { squares: (side) => side === 'w' ? 'y==4 && z==4' : 'y==0 && z==0', choices: ['q','r','b','n','u'] },
  setup: () => START,            // §2.3, no options, no rng
  extraMoves: none,              // except the promotion expansion (=Q/=R/=B/=N/=U) of pawn moves onto promotion cells,
                                 // if the core does not do it from `promotion`
  afterMove: promotion only,     // replace the pawn by the chosen type; no rights, no ep, no counters
  worldResult: (w) => a king is missing ? { winner: other side, reason: 'king_captured' } : null,
  visibility: none,
  options: none,
  layout,                        // §6
}
```

- **Sides and teams.** Two sides, no teams.
- **Royal.** `k`.
- **Solid.** `k` and `p`.
- **Splittable.** `q`, `r`, `b`, `u` and `n`, including promoted pieces.
- **Move keys.** Cell-based:
  - moves: `Bc1-Dc3`, `Dc5-Ec5=U`;
  - splits: `Bb1-Ca2|Cc2`;
  - merges: `Ca2|Cc2-Dd3`.
  - Parse cells with `/^[A-E][a-e][1-5]$/`.
- **Piece values** (centipawns, for the generic AI):

  | Piece | P | U | R | N | B | Q |
  |---|---|---|---|---|---|---|
  | Value | 100 | 170 | 450 | 470 | 520 | 1100 |

  - The ordering Q > B > N > R > U > P follows the IRF.
  - The magnitudes are scaled roughly from empty-board mobility (§2.2).
  - The unicorn gets a little more than the IRF's "about a pawn", because a slider that can split is worth more
    here: it can build ghosts.
  - Suggested positional term: `+4 × (number of cells the piece attacks)`, capped. A centralisation bonus of
    `+6 × (6 - manhattan distance to Cc3)` for N, B, U and Q.
- **AI performance note.**
  - White has 61 classical moves at the start (perft 1), and perft 2 is 3,735 (no check).
  - In the middlegame, a centralised queen alone has up to 52 targets, which gives C(52,2) = 1,326 split pairs.
  - The AI should only consider splits whose two targets are both among the piece's best 6 quiet moves, ranked by
    the static evaluation. The move list offered to humans stays complete.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: worlds, split, merge, measure, "land = roll, pass = link", the solid roll,
the game-end roll, a budget of 8 per side and at most 4 cells per split. Here is how they meet this variant's rules.

1. **Lines are 3D, and the rule is the same.**
   - A rook, bishop, unicorn or queen that passes a cell where a piece *might* be gets linked, not rolled, as long
     as its target is certainly empty. For example, a rook sliding up the column `Aa1`-`Ea1` past a 50% knight on
     `Ca1`.
   - Knights leap, so they are never blocked: a knight move is only rolled if its target might be occupied.
2. **Split targets can be on different levels.** Any two cells the piece could reach with a quiet move qualify,
   provided both are certainly empty. For example, `Bb1-Ca2|Cc2` (unicorn) or `Bc1-Cc1|Ec1` (queen, straight up).
   The parts of one split may even lie on one line (`Bb1-Cc2|Dd3`). As usual, each half needs its own lane to be
   clear in its world.
3. **Pawns.** They are solid, and every pawn move is in the measured class M.
   - **Push forward or push up** onto a cell that might be occupied: roll. `Moved` means the cell was free; `Missed`
     means it was occupied. A pawn never captures straight ahead or straight up.
   - **Capture** (5 directions) onto a ghost: roll, `Captured` or `Missed`.
   - There is no double step or en passant, so none of the classic special cases arise.
4. **Promotion.**
   - The piece is chosen as part of the move key (`=Q/R/B/N/U`).
   - It happens only in the worlds where the pawn really arrives on its promotion cell. The pawn is solid, so a roll
     settles this at once.
   - A promoted piece, the unicorn included, can split and merge.
5. **No castling.** So no castling-rights bookkeeping and no "castling through ghosts" cases.
6. **Kings.**
   - The king is solid. A king step onto a cell that might be occupied is a roll.
   - King danger counts all 26 lines and 24 knight leaps, including converging captures.
   - `king_trapped` (every move leaves the king certainly capturable) replaces mate.
   - Expect it less often than in 8x8 chess, because a king has up to 26 flight cells. The draw rules are unchanged.
7. **The solid roll** is only a safety net here. Kings and pawns move only by measured moves, and every capture of a
   solid piece is measured, so solid pieces never disagree between worlds in normal play.
8. **The game-end roll.** `worldResult` only reports a missing king. A king capture is always measured, so all worlds
   agree, and this roll is never needed in practice.
9. **Budget 8, location cap 4, Measure.** Unchanged. A unicorn part can only ever stand on cells of its own parity
   class, which the what-if view shows naturally.

Nothing in this variant needs a new quantum rule.

---

## 5. Player-facing rules text (rules card)

- The board is a cube of five 5×5 levels, from **A** (bottom, White's home) to **E** (top, Black's home). A cell is
  named level, file, rank: **Cc3** is the centre.
- **Rooks** move straight: along a rank, a file, or straight up and down. **Bishops** move diagonally within any flat
  slice of the cube (two coordinates change together). **Unicorns** move along the space diagonals: level, file and
  rank all change at once. The **queen** combines all three, and the **king** steps to any of the 26 touching cells.
- The **knight** jumps 2 cells along one direction and 1 along another, on the same level or across levels.
- **Pawns** step one cell forward or one level up (Black: forward or down). They capture one cell diagonally: forward
  and sideways, up and sideways, or forward and up at once. There is no double step, no en passant and no castling.
- A pawn promotes on the far rank of the top level (White: rank 5 of level E; Black: rank 1 of level A). It can
  become a queen, rook, bishop, knight or unicorn.
- Unicorns split and merge like the other pieces. Kings and pawns always stay solid.

---

## 6. UI layout

- **Cells.** Squares. Shade dark when `(x+y+z)` is even, light otherwise, using the classic board colours.
- **Two layouts.** The UI picks one by container aspect ratio, or the variant returns both as `layout.wide` and
  `layout.compact`.
  - **Wide** (landscape, desktop): the five levels in one row, left to right `A B C D E`, with a gap of 0.6 cell.
    - Cell `(x, y, z)` is at `X = z·5.6 + x`, `Y = 4 - y` (rank 5 at the top of each board).
    - The drawing is 27.4 × 5 cells.
    - Put a level caption above each board ("A · bottom" … "E · top"), file letters under each board, and rank
      numbers on the left of board A.
  - **Compact** (portrait phone): a 2-column grid read bottom-up, with a gap of 0.6.
    - Bottom row: `A` (left), `B` (right). Middle row: `C`, `D`. Top row: `E`, centred.
    - Board offsets: A `(0, 11.2)`, B `(5.6, 11.2)`, C `(0, 5.6)`, D `(5.6, 5.6)`, E `(2.8, 0)`.
    - The drawing is 10.6 × 16.2 cells.
- **Black's view** rotates the whole drawing 180°: in the wide layout, E is on the left and each board is turned.
  Black's pawns then also go "up the screen".
- **Column hint.** Hovering or selecting a cell draws a thin outline on the cells with the same file and rank on the
  other four levels. This makes vertical rook lines and "up" pawn steps easy to see.
- **Move targets** appear on every level at once, with the usual previews (Certain / Quantum / Roll).
- **Glyphs.**
  - Orthodox pieces use the cburnett sprites.
  - **Unicorn:** a custom SVG in the cburnett style (a knight head with a straight horn), white and black versions.
    Fallback: a round token in the side's colour with a bold letter **U** (black on white for White, white on black
    for Black).
  - The notation letter is `U`. Ghost parts fade and carry a percentage badge, as for every piece.
- **Colour is never the only cue.** Every board shows its level letter, and every cell has a name tooltip
  (`Cc3`).

---

## 7. Test cases

Unless stated otherwise, positions add White K `Ae3` and Black K `Ee3`, which take no part. "Classical moves" means
the classical generator's keys for one world, with no check rule.

**R1. Start position.**
- The board has 125 cells and 40 pieces.
- White has exactly **61** classical moves: 15 pawn, 14 queen, 13 bishop, 12 knight, 7 unicorn, 0 king, 0 rook.
- Black also has 61.
- Perft 2 (White then Black, pseudo-legal) = **3,735**.

**R2. Start-position detail.**
- `Ac2` (White pawn) has exactly one move, `Ac2-Ac3`: `Bc2` holds its own pawn and nothing is capturable.
- `Bc2` has `Bc3` and `Cc2`.
- Knight `Ab1` → {`Aa3`, `Ac3`, `Bb3`, `Ca1`, `Cb2`, `Cc1`}.
- Unicorn `Bb1` → {`Ca2`, `Cc2`, `Dd3`, `Ee4`}.
- Unicorn `Be1` → {`Cd2`, `Dc3`, `Eb4`}.
- King `Ac1` and both rooks have no moves.

**R3. Knight geometry.** Empty board apart from the kings:
- White knight `Aa1` → exactly {`Ab3`, `Ac2`, `Ba3`, `Bc1`, `Ca2`, `Cb1`}.
- A knight on `Cc3` has 24 moves.

**R4. Unicorn geometry.** White unicorn `Cc3`, empty board:
- exactly 16 moves: {`Aa1`, `Aa5`, `Ae1`, `Ae5`, `Bb2`, `Bb4`, `Bd2`, `Bd4`, `Db2`, `Db4`, `Dd2`, `Dd4`, `Ea1`, `Ea5`,
  `Ee1`, `Ee5`};
- `Cc3-Cc4` (a rook step), `Cc3-Cd4` (a bishop step) and `Cc3-Dc4` are illegal.

**R5. Bishop, rook, queen and king geometry.** Empty board:
- Bishop `Aa1` → exactly {`Ab2`, `Ac3`, `Ad4`, `Ae5`, `Ba2`, `Bb1`, `Ca3`, `Cc1`, `Da4`, `Dd1`, `Ea5`, `Ee1`}.
- Rook `Aa1` → {`Aa2`-`Aa5`, `Ab1`-`Ae1`, `Ba1`-`Ea1`}: 12 moves.
- Queen: 28 moves on `Aa1`, 52 on `Cc3`.
- King on `Cc3`: 26 moves.

**R6. Pawn directions.**
- White pawn `Cc3`, Black knights on `Cb4`, `Cd4`, `Db3`, `Dd3` and `Dc4`, with `Cc4` and `Dc3` empty. Moves:
  - pushes: `Cc4`, `Dc3`;
  - captures: `Cb4`, `Cd4`, `Db3`, `Dd3`, `Dc4`;
  - 7 moves in total.
- Mirrored: Black pawn `Cc3`, White knights on `Cb2`, `Cd2`, `Bb3`, `Bd3` and `Bc2`. Moves:
  - pushes: `Cc2`, `Bc3`;
  - captures: `Cb2`, `Cd2`, `Bb3`, `Bd3`, `Bc2`.

**R7. What a pawn cannot do.**
- White pawn `Ac2` with Black knights on `Ac3`, `Bc2` and `Bc1`: **no moves**.
  - It cannot capture straight ahead (`Ac3`) or straight up (`Bc2`).
  - `Bc1` is up-and-backward, so it cannot capture there either.
- White pawn `Ac2` on an otherwise empty board: exactly `Ac3` and `Bc2`. `Ac2-Ac4` (a double step) is illegal.

**R8. Promotion.**
- White pawn `Dc5`, empty `Ec5`: the moves are `Dc5-Ec5=Q`, `=R`, `=B`, `=N` and `=U` (5 keys). `Dc5-Ec5` without a
  piece letter is invalid (`promotion_required`).
- White pawn `Cc5`, empty `Dc5`: `Cc5-Dc5` is a plain move (level D is not the promotion level).
- White pawn `Dd4`, Black knight `Ed5`: `Dd4xEd5=Q` is legal (forward-up capture onto a promotion cell), and so is
  the plain move `Dd4-Ed4`.
- `Ec4-Ec5=K` is invalid.
- Black pawn `Ba2`: `Ba2-Aa2` is a plain move. Black pawn `Ab2`: `Ab2-Ab1=U` promotes.

**R9. No castling.**
- Position: White K `Ac1`, R `Aa1`, R `Ae1`, Black K `Ee3`, and nothing else (no White king on `Ae3`).
- **Expected:** the king has exactly 11 moves, its in-board neighbours: {`Ab1`, `Ab2`, `Ac2`, `Ad1`, `Ad2`, `Bb1`,
  `Bb2`, `Bc1`, `Bc2`, `Bd1`, `Bd2`}.
- No key moves the king two cells or swaps it with a rook.

**R10. Colours.**
- The bishop on `Ba1` stands on a light cell (`x+y+z = 1`); every cell it can ever reach is light.
- The bishop on `Bd1` stands on a dark cell (sum 4).
- A unicorn from `Bb1` (class {010,101}) can never reach `Be1`'s class {001,110}.

**RQ1. Pass = link along a vertical line** (quantum).
- White R `Aa1`. Black N is 50% on `Ca1` and 50% on `Ce4` (2 worlds). `Ba1`, `Da1` and `Ea1` are empty.
- White plays `Aa1-Ea1`.
- **Expected:**
  - No roll: the rook is not solid and `Ea1` is certainly empty.
  - In the world with the knight on `Ca1`, the move is blocked and the rook stays on `Aa1`. In the other world, the
    rook reaches `Ea1`.
  - The rook is now 50% `Aa1` / 50% `Ea1`, linked: the rook is on `Aa1` exactly when the knight is on `Ca1`.
  - White's budget is 2/8.

**RQ2. Unicorn splits and the budget** (quantum). From the start position, White plays three splits:
1. `Bb1-Ca2|Cc2`. Both cells are certainly empty and reachable. The unicorn is 50/50. No roll. Budget 2.
2. (after any Black reply that doesn't touch these cells) `Be1-Cd2|Dc3`. Legal: the half going to `Dc3` passes
   `Cd2`, but `Cd2` is empty in that half's world. Budget 4.
3. `Bd1-Ce1|Db1`. Legal, budget 8.
- A fourth split is illegal (`budget_full`).
- `Bd1-Cd2|Ce1` would have been illegal at step 3, because `Cd2` is not certainly empty.

**RQ3. Pawn probe, forward or up** (quantum).
- White P `Bc2`. Black N is 50% on `Bc3` and 50% on `Cc2`.
- White plays `Bc2-Cc2` (push up). **Expected:** a roll.
  - 50% **Moved**: the pawn is on `Cc2`, and the knight is 100% on `Bc3`.
  - 50% **Missed**: the pawn stays on `Bc2`, and the knight is 100% on `Cc2`.
- `Bc2-Bc3` gives the mirror result.

**RQ4. Forward-and-up capture onto a ghost** (quantum).
- White P `Bc2`. Black B is 50% on `Cc3` and 50% on `Ce5`.
- White plays `Bc2xCc3`, the `(0,1,1)` capture. **Expected:** a roll.
  - 50% **Captured**: the bishop is gone.
  - 50% **Missed**: the pawn stays on `Bc2`, and the bishop is 100% on `Ce5`.
- With the chessvariants.com 4-direction rule this move would not exist. This test pins the IRF rule.

**RQ5. Promotion only if the pawn arrives** (quantum).
- White P `Dc5`. Black N is 50% on `Ec5` and 50% on `Eb3`.
- White plays `Dc5-Ec5=U`. **Expected:** a roll.
  - 50% **Moved**: a White unicorn stands 100% on `Ec5`, and the knight is 100% on `Eb3`.
  - 50% **Missed**: a White pawn (not promoted) stays on `Dc5`, and the knight is 100% on `Ec5`.
- Undo followed by `Dc5-Ec5=Q` in the same position replays the same roll (roll memo).

**RQ6. A converging capture in 3D** (quantum).
- White Q is 50% on `Aa1` and 50% on `Ee1`. Black R stands solid on `Cc1`. `Bb1` and `Dd1` are empty.
- White plays the merge `Aa1|Ee1-Cc1`.
  - `Aa1` to `Cc1` is the bishop line `(1,0,1)` through `Bb1`.
  - `Ee1` to `Cc1` is the bishop line `(-1,0,-1)` through `Dd1`.
- **Expected:** both lanes are certainly clear and the queen has no other part, so the capture is **certain**. No
  roll. The queen is 100% on `Cc1` and the rook is gone.
- Variant: add a Black knight that is 50% on `Bb1` and 50% on `Ab3`, independent of the queen (4 worlds of 25%).
  - The merge is now **rolled**: **75% Captured**, **25% Missed**.
  - It misses only in the world where the queen is on `Aa1` and the knight blocks `Bb1`. The `Ee1` part is never
    blocked.
