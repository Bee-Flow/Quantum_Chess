# Variant spec: `trid` (Tri-Dimensional Chess, simplified: fixed attack boards)

Category: `dimensions`.

- **UI name:** "Tri-D Chess".
- **Summary line:** "The three-level board from science fiction: three 4×4 levels and four small attack boards."
- **Naming:** keep "Star Trek" and franchise logos out of the UI (trademark). In the rules card, credit the board to
  Franz Joseph's 1975 design and the rules to Andrew Bartmess's Federation Standard rules.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in this session, so the rules below
come from search-engine extracts of these pages plus prior knowledge. Every move list and count in §7 was computed
with a reference move generator (`handoff/tools/trid.py`).

| Source | What it gives |
|---|---|
| Andrew Bartmess, *The Federation Standard Tri-D Chess Rules* (1976, expanded later; rev. 5.0). Text: http://www.grigor.org/original.htm; book: https://www.goodreads.com/book/show/22214671 | **Base rule set ("FS").** Moves are normal chess moves seen from above. A piece may end on any level. "A piece is blocked … if an intermediary piece occupies any square on the movement path, on ANY level." Kingside castling is a plain swap of king and rook. |
| Jens Meder & friends, *Tournament Rules for Three-Dimensional Chess*: https://meder.spacechess.org/3dschach/chess3d.htm, and FAQ: https://meder.spacechess.org/3dschach/faq.htm | The **notation** used here: files `z a b c d e`, ranks `0`–`9`, levels `W N B`, attack-board pins `QL1`…`QL6` / `KL1`…`KL6`, and squares such as `z1QL1`. It also clarifies FS: **"non-existent squares are also part of files, ranks and diagonals"**; a move that **ends** on a non-existent square is forbidden; a piece blocks at all levels, but the mover may land above or below it; there are no purely vertical moves. |
| World Tri-Dimensional Chess Federation laws: http://w3dcf.com/information/laws | Promotion at "the very furthest point": the rear rank of the attack boards at the far corners, or the rear rank of the far main level where no attack board is present. En passant: the capturing pawn moves "to an unoccupied square, **on any level**, directly behind" the pawn. |
| Chess Variant Pages, "3D chess from Star Trek": https://www.chessvariants.com/3d.dir/startrek.html | An older rule set where every step changes between a movable and a fixed level. **Rejected**: it is hard to explain and not the standard. |
| J. Roth, "Star Trek 3-D Chess Rules": https://www.thedance.net/~roth/TECHBLOG/chess.html | An FS-based house version: en passant lands on the "highest path" level. **Rejected** in favour of the WTDCF "any level" wording. |
| Franz Joseph, *Star Fleet Technical Manual* (1975) | The original board: 3 main levels of 4×4 and 4 attack boards of 2×2. |

**Chosen rule set:** Bartmess **Federation Standard**, using Meder's notation and clarifications, with these
simplifications. Each one is justified below.

1. **The four attack boards are fixed** on their starting pins: White's on `QL1` and `KL1`, Black's on `QL6` and
   `KL6`.
   - There are no attack-board moves and no attack-board ownership rules. The set of squares never changes.
   - This was requested by the brief. It also keeps a world a plain piece list.
2. **Castling: kingside only**, as the FS swap of king and rook.
   - Queenside castling is left out. The sources disagree on where the king and rook end up.
   - With fixed boards, the king would have to jump the void at `b0`/`c0`.
3. **En passant lands on any level** of the skipped square (WTDCF wording).
   - The FS-based rule sets keep en passant. Roth's "highest path" reading has no clear meaning for a pawn that
     changed level.
4. **Promotion on the last rank of the pawn's file.** This is FS/WTDCF's "furthest point" with the boards fixed:
   - White: rank 9 on files `z a d e`, rank 8 on `b c`.
   - Black: rank 0 on `z a d e`, rank 1 on `b c`.

---

## 2. Classical rules (complete)

### 2.1 Board, squares and coordinates

- **Coordinates:** `x` = file index, `y` = rank (0–9), plus a **level tag**.
  - Files: `z`=0, `a`=1, `b`=2, `c`=3, `d`=4, `e`=5.
  - Level tags: `W` (White main level), `N` (Neutral), `B` (Black main level), and the four attack boards `QL1`,
    `KL1`, `QL6`, `KL6`.
- **Square name** = file + rank + level tag, as in Meder/FS. Examples: `a2W`, `b3N`, `z0QL1`, `e9KL6`.
- **Parsing:** `/^([zabcde])(\d)(W|N|B|QL1|KL1|QL6|KL6)$/`.
- **The squares that exist: 64 in total.**

| Level | Kind | Files | Ranks | Squares |
|---|---|---|---|---|
| `W` | main 4×4 (lowest) | a–d | 1–4 | a1…d4 (16) |
| `N` | main 4×4 (middle) | a–d | 3–6 | a3…d6 (16) |
| `B` | main 4×4 (highest) | a–d | 5–8 | a5…d8 (16) |
| `QL1` | White queen's attack board, on pin at W's a1 corner | z, a | 0–1 | z0, a0, z1, a1 |
| `KL1` | White king's attack board, on pin at W's d1 corner | d, e | 0–1 | d0, e0, d1, e1 |
| `QL6` | Black queen's attack board, on pin at B's a8 corner | z, a | 8–9 | z8, a8, z9, a9 |
| `KL6` | Black king's attack board, on pin at B's d8 corner | d, e | 8–9 | d8, e8, d9, e9 |

- **Columns.** Seen from above, the "flat map" is a 6×10 rectangle of **columns** `(x, y)`.
  - 44 columns exist, meaning they hold at least one square.
  - **20 columns hold two squares:**

    | Column(s) | Levels |
    |---|---|
    | `a1`, `d1` | W + QL1 / W + KL1 |
    | `a3`–`d3`, `a4`–`d4` | W + N |
    | `a5`–`d5`, `a6`–`d6` | N + B |
    | `a8`, `d8` | B + QL6 / B + KL6 |

  - The other 24 hold one square each.
  - 16 columns are **void** (no square at all): `z2`–`z7`, `e2`–`e7`, `b0`, `c0`, `b9`, `c9`.
- **Height order** (used only for drawing and for listing a column's squares):
  `W` < `QL1`/`KL1` < `N` < `B` < `QL6`/`KL6`.
- **Square colour:** dark if `(x + y)` is even (so `a1` is dark, as in chess), the same on every level. A bishop keeps
  its colour across levels.

### 2.2 Movement: the projection rule

Every move is a **normal flat-chess move on the 6×10 map**, plus a free choice of the level it ends on.

1. The move's flat displacement `(dx, dy)` must be a legal displacement for that piece type in ordinary chess.
   `(0, 0)` never is: **moving straight up or down to the same column is not a move.**
2. **Destination.** The target column must exist. The move may end on **any existing square of that column** that is
   empty (a move) or holds an enemy (a capture). It may never end on a friendly piece, or on a void column.
   - Pieces on the *other* level of the target column do not matter.
   - Pieces on other levels of the starting column do not matter either.
3. **Blocking (riders: R, B, Q; the pawn's double step).** Each **intermediate** column must be empty **on every
   level**. A void column counts as empty, so riders fly across the gaps (Meder: "non-existent squares are part of
   files, ranks and diagonals"). A ride stops at the edge of the 6×10 rectangle.
4. **Leapers (N, and K steps)** are never blocked.

Descriptors are the ordinary 2D chess vectors:

| Piece | Letter | Descriptor (flat vectors) |
|---|---|---|
| King | K | `leap` (±1,0), (0,±1), (±1,±1) |
| Queen | Q | `ride` over the 8 king directions |
| Rook | R | `ride` (±1,0), (0,±1) |
| Bishop | B | `ride` (±1,±1) |
| Knight | N | `leap` (±1,±2), (±2,±1) |
| Pawn | P | move `leap (0,1)` oriented; capture `leap (±1,1)` oriented; plus the double step and en passant (§2.4) |

"Oriented" means White's forward is `+y` and Black's forward is `-y`.

### 2.3 Setup (32 pieces)

| White | Square(s) |
|---|---|
| Rook | `z0QL1`, `e0KL1` |
| Queen | `a0QL1` |
| King | `d0KL1` |
| Knights | `a1W`, `d1W` |
| Bishops | `b1W`, `c1W` |
| Pawns | `z1QL1`, `a1QL1`, `d1KL1`, `e1KL1`, `a2W`, `b2W`, `c2W`, `d2W` |

| Black | Square(s) |
|---|---|
| Rook | `z9QL6`, `e9KL6` |
| Queen | `a9QL6` |
| King | `d9KL6` |
| Knights | `a8B`, `d8B` |
| Bishops | `b8B`, `c8B` |
| Pawns | `z8QL6`, `a8QL6`, `d8KL6`, `e8KL6`, `a7B`, `b7B`, `c7B`, `d7B` |

- The queen's pawn (`a1QL1`) and the king's pawn (`d1KL1`) stand directly above the knights `a1W` and `d1W`.
- The queens face each other on the a-file and the kings on the d-file.
- The position is mirror-symmetric (`y → 9 - y`, `W ↔ B`, `QL1 ↔ QL6`, `KL1 ↔ KL6`).
- Neutral level `N` is empty at the start.

### 2.4 Pawns

- **Step.** One column forward (`y+1` for White, `y-1` for Black), onto any **empty** square of that column. A pawn
  never captures straight ahead.
- **Double step.** A pawn that **has not moved yet** may go two columns forward, onto any empty square of that
  column, if the skipped column is empty on every level.
  - A void skipped column counts as empty, but this never happens with the fixed boards.
  - The `z` and `e` pawns can never double-step: their columns 2 and 3 (White) or 7 and 6 (Black) are void.
- **Capture.** Diagonally forward, `(x±1, y+1)` for White, onto any square of that column that holds an enemy piece.
- **En passant.** Suppose an enemy pawn has just double-stepped from column `(x, y0)` to `(x, y0+2f)`. A pawn standing
  on a column `(x±1, y0+2f)`, on any level, may on the **very next move** capture it: it moves to **any empty square
  of the skipped column** `(x, y0+f)` and removes the double-stepped pawn.
- **Promotion.** When a pawn arrives on the **last rank of its file**, it must promote to Q, R, B or N.

  | File | z | a | b | c | d | e |
  |---|---|---|---|---|---|---|
  | White last rank | 9 | 9 | 8 | 8 | 9 | 9 |
  | Black last rank | 0 | 0 | 1 | 1 | 0 | 0 |

  - A White pawn on `a8B`/`a8QL6` or `d8B`/`d8KL6` does **not** promote. It still has `a9`/`d9` ahead on the attack
    board, which matches FS: a pawn under an attack board does not promote.
  - The White `z` and `e` pawns can leave their file only by capturing diagonally (`z1 → a2`, `e1 → d2`).

### 2.5 Castling (kingside only)

- White: if the king on `d0KL1` and the rook on `e0KL1` have never moved, the move `d0KL1-e0KL1` **swaps** them. The
  king ends on `e0KL1` and the rook on `d0KL1`.
- Black: the same with `d9KL6-e9KL6`.
- Nothing stands between them. It is legal from move 1.
- The classical FS condition "not in check" is dropped, because the quantum rules have no check.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate.
- **Classically**, a game is won by checkmate. Stalemate, repetition and 50 moves are draws.
- **In Quantum Chess 2.0**, the shared rules apply:
  - You win by capturing the king, or when the opponent's king cannot escape (`king_trapped`).
  - "No legal move" is a draw.
  - Bare kings, repetition, the 50-move rule and the ply cap work as in the classic game.

---

## 3. Engine mapping (contract)

```js
export default {
  id: 'trid',
  category: 'dimensions',
  name: () => t('quantumchess', 'Tri-D Chess'),
  summary: () => t('quantumchess', 'Three 4×4 levels and four small attack boards. Moves are ordinary chess moves seen from above.'),
  sides: [{ id: 'w', … }, { id: 'b', … }],
  enemies: (a, b) => a !== b,
  topology: layered({
    rect: [6, 10],                                // flat map, x = 'zabcde', y = 0..9
    levels: { W: {files:'abcd', ranks:[1,4]}, N: {files:'abcd', ranks:[3,6]}, B: {files:'abcd', ranks:[5,8]},
              QL1: {files:'za', ranks:[0,1]}, KL1: {files:'de', ranks:[0,1]},
              QL6: {files:'za', ranks:[8,9]}, KL6: {files:'de', ranks:[8,9]} },
    height: { W:0, QL1:1, KL1:1, N:2, B:3, QL6:4, KL6:4 },
    name: ([x, y, lv]) => 'zabcde'[x] + y + lv,
    orient: { w: [1, 1], b: [1, -1] },
  }),
  movegen: 'projected',                           // §2.2; see the pseudo-code below
  pieceTypes: {
    k: { moves: [{ leap: KING8 }],  royal: true, solid: true,  splittable: false, value: 0 },
    q: { moves: [{ ride: KING8 }],  solid: false, splittable: true, value: 950 },
    r: { moves: [{ ride: ORTH4 }],  solid: false, splittable: true, value: 520 },
    b: { moves: [{ ride: DIAG4 }],  solid: false, splittable: true, value: 320 },
    n: { moves: [{ leap: KNIGHT8 }], solid: false, splittable: true, value: 280 },
    p: { moves: [{ leap: [[0,1]], oriented: true, mode: 'move' },
                 { leap: [[1,1],[-1,1]], oriented: true, mode: 'capture' }],
         solid: true, splittable: false, value: 100 },
  },
  setup: () => START,                              // §2.3, no options
  extraMoves(world, side),                         // double step, en passant, kingside castling (§2.4, §2.5)
  afterMove(world, move, info),                    // promotion, pawn "moved" flag, ep info, castling flags
  worldResult: (w) => a king is missing ? { winner: other side, reason: 'king_captured' } : null,
  visibility: none,
  options: none,                                   // possible later option: movable attack boards (see open questions)
  layout,                                          // §6
}
```

**Projected move generation** (it belongs in `core/movegen.js` as a topology capability, so the quantum layer, king
danger and the AI all use the same lanes):

```
columnSquares(x, y) -> the existing squares of that column (0, 1 or 2 of them)
occupiedColumn(world, x, y) -> some square of that column holds a piece

gen(piece at s = (x0, y0, L), descriptor):
  for each vector (dx, dy) (oriented for pawns):
    (x, y) = (x0, y0)
    repeat (once for leap, until stop for ride):
      (x, y) += (dx, dy); if (x, y) outside 6x10: stop
      for sq in columnSquares(x, y):                  // void column -> no destinations
        occ = world.at(sq)
        if occ empty    and mode in {both, move}:    emit s-sq
        if occ is enemy and mode in {both, capture}: emit s-sq (capture)
      if ride and occupiedColumn(world, x, y): stop   // blocked on ANY level
```

- **World extras:**
  - `moved`: the set of pawn ids that have moved, for the double step.
  - `ep`: either null or `{ skipped: [x, y], victim: sq }`. It is set only when an en-passant capture is actually
    available.
  - `castle`: `{ w: bool, b: bool }`.
- **Castling rights follow the state**, as in classic D12. After every move, a side's right is cleared if, in some
  world, its king is not on its home square or its e-rook (by piece id) is not on its home square.
  - The world keeps the flag. The core clears it in all worlds, as it already does for classic castling.
  - If the core offers only world-level flags, there is an equivalent: generate the castling key only when the flag
    is set in **every** world and K and R are on `d0`/`e0` (`d9`/`e9`) in every world.
- **Move keys:**

  | Kind | Example |
  |---|---|
  | move | `a2W-a4N` |
  | promotion | `b7B-b8B=Q` |
  | castling | `d0KL1-e0KL1` (the king's move) |
  | en passant | `c5N-b6B` (flagged) |
  | split | `a1W-b3W\|b3N` |
  | merge | `b3W\|d3N-c5B` |

- **Royal / solid / splittable.**
  - Royal: `k`.
  - Solid: `k` and `p`.
  - Splittable: `q`, `r`, `b` and `n`, including promoted pieces.
- **Piece values** (centipawns):

  | Piece | P | N | B | R | Q |
  |---|---|---|---|---|---|
  | Value | 100 | 280 | 320 | 520 | 950 |

  - Rooks are relatively strong here: they cross the voids, and every stop can be taken on two levels. The
    empty-board average number of moves is R 16.8, Q 25.9, B 9.1, N 6.5.
  - Suggested positional term: +10 for a minor piece or queen on level `N`, and +5 per attacked square.
  - Suggested penalty: -15 for a rook still boxed in on its home square (`z0`/`e0`) after move 12.
- **Size.**
  - At the start, White has **21** classical moves: 16 pawn moves (4 pawns × 2 levels × single or double step),
    4 knight moves and 1 castling. Black also has 21.
  - Perft 2 = **441**.
  - The branching factor stays well below orthodox chess, so the generic AI's depth is not a problem.
  - Split pairs are more numerous because of level choices. Use the same "top 6 quiet targets" cap for the AI as in
    Raumschach.

---

## 4. Quantum adaptation

All shared quantum rules apply unchanged: worlds, split, merge, measure, land = roll, pass = link, the solid roll,
the game-end roll, a budget of 8 and a cap of 4 locations. The decisions below settle every case that is special to
Tri-D.

1. **Lanes are columns (pass = link).**
   - A rider or double-stepping pawn is blocked in a world when an intermediate column holds a piece on any level in
     that world.
   - So a ghost part on either level of a column in the path blocks in its worlds.
   - If the target is certainly empty, the result is a **link**, not a roll. Otherwise the move lands, which is a roll.
2. **Landing is per square, not per column (land = roll).**
   - The measured class M, which settles a move by roll, applies if the **target square** (file, rank and level) may
     hold a piece in some world.
   - A piece or ghost on the other level of the target column is irrelevant: it neither blocks nor causes a roll.
   - Example: rook `b1W-b3W` with a knight ghost on `b3N` is certain.
3. **Splits may use two levels of one column** (a "level split"), for example `a1W-b3W|b3N`.
   - Both targets must be certainly empty and reachable by a quiet move, as always.
   - The piece is then *certainly* in column `b3`, so it blocks every lane through `b3` in every world. A move whose
     only lane crosses `b3` misses in every world and is therefore illegal.
   - This gives a teachable pattern: "a level ghost is a solid wall but an uncertain target".
4. **Merge.**
   - The target must be reachable from both parts by a flat move. Two parts in the same column can never merge in
     place, because vertical moves don't exist.
   - Parts on the two levels of one column can merge onto a common third square.
   - Converging capture works as in the classic game.
5. **Pawns are solid.**
   - Steps, double steps and captures are in class M and are rolled when the worlds disagree.
   - A double step needs the skipped column empty on both levels in that world. Otherwise it **misses**; it never
     falls back to a single step (as in the classic rules).
   - A pawn push onto one level of a column is only affected by that square.
6. **En passant is always certain.**
   - A double step only happens in worlds where the skipped column is empty on every level, and the roll keeps only
     those worlds. So right after it, the skipped column is empty in every world.
   - The capturing pawn and the victim are both solid.
   - Every en-passant key, one per level of the skipped square, is therefore certain and never rolled.
   - It is offered only on the move right after the double step, and only when it is actually available.
7. **Castling (kingside swap)** is never rolled.
   - It is offered only if the right is intact and the king and e-rook are 100% on their home squares.
   - The right is lost for good as soon as, after any move, the king or that rook is not 100% home: it moved, split,
     was captured, or took part in a partial slide.
   - A missed king or rook move does not cost the right.
   - Nothing lies between the two pieces, so ghosts never block castling.
8. **Promotion**
   - The piece is part of the key (`=Q/R/B/N`).
   - It happens only in the worlds where the pawn really arrives on its file's last rank; the roll settles this.
   - The promoted piece can split and merge.
9. **Attack boards are fixed.** Nothing about them is quantum: there are no ghost boards and no board rolls.
10. **The king is solid.**
    - A king step to a square that might be occupied is rolled.
    - King danger counts both levels of every column.
11. **Solid roll and game-end roll.** They are only safety nets here, as in the classic game: kings and pawns only
    move by measured moves, and `worldResult` only reports a missing king.
12. **Budget 8, location cap 4, Measure.** Unchanged.

---

## 5. Player-facing rules text (rules card)

- There are seven boards:
  - three 4×4 **main levels**: White's (W, lowest), Neutral (N) and Black's (B, highest), each two ranks further
    forward;
  - four 2×2 **attack boards** at the back corners.
  - In this version the attack boards never move. Squares are named file, rank, level: `b3N`.
- **Look from above.** Every move must be a normal chess move on the flat map (files z, a–d, e; ranks 0–9). The piece
  may then stop on **any level** that has the target square.
- A piece on **any level** of a square in between blocks the move. Gaps with no board count as empty squares: you can
  fly across them, but you cannot stop there.
- Moving straight up or down to the same square on another level is not a move.
- **Pawns** step forward (two steps on their first move) and capture diagonally forward, onto any level. En passant
  lands on either level of the skipped square.
- A pawn promotes on the **last rank of its file**: rank 8 on files b and c, rank 9 on files z, a, d and e (for Black:
  rank 1 and rank 0).
- **Castling:** only on the king's side. The king and the rook on the king's attack board swap places, if neither has
  moved.
- **Quantum tip:** a ghost on either level of a square blocks moves through that square in its possibilities. A piece
  split over both levels of one square blocks it for certain.

---

## 6. UI layout

- **Cells.** Square cells, one board colour scheme for all levels: dark if `(x + y)` is even. Each board has a frame
  and a caption. The level shows through the frame tint and the caption, never through the cell colours.
  - Frame tints: W blue-grey, N neutral grey, B warm grey. Attack boards get a thicker "metal" frame.
- **Glyphs.** The cburnett sprites for all pieces (Tri-D has only orthodox pieces).

### 6.1 Wide layout (landscape and desktop; default)

A rank-aligned staircase. All boards share one vertical rank axis, `Y = 9 - rank` (rank 9 at the top). The drawing is
18.5 × 10 cells.

| Board | Files at X | Ranks (rows) |
|---|---|---|
| `QL1` | z=0, a=1 | 0–1 |
| `W` | a=2.5, b=3.5, c=4.5, d=5.5 | 1–4 |
| `KL1` | d=7, e=8 | 0–1 |
| `N` | a=7, b=8, c=9, d=10 | 3–6 |
| `QL6` | z=9.5, a=10.5 | 8–9 |
| `B` | a=12, b=13, c=14, d=15 | 5–8 |
| `KL6` | d=16.5, e=17.5 | 8–9 |

- No two boards overlap. `KL1` sits under `N` (rank 2 is empty between them), and `QL6` sits above `N` (rank 7 is
  empty between them).
- Each attack board touches its main level along the shared rank row: `QL1`'s `a1` next to W's `a1`, `KL1`'s `d1`
  next to W's `d1`, `QL6`'s `a8` next to B's `a8`, and `KL6`'s `d8` next to B's `d8`.
- A small **pin** dot with a short connector joins each such pair. It shows "this attack board hangs over that
  corner".
- **Labels:**
  - rank numbers 0–9 on the far left;
  - file letters under each board;
  - a caption above each board: "W · White", "N · Neutral", "B · Black", "QL1", "KL1", "QL6", "KL6".

### 6.2 Tall layout (portrait phones)

A file-aligned stack. `X = file index` (`z` = 0 … `e` = 5). The boards are stacked in height order, White's at the
bottom, with a 0.5-cell gap. Each board has its own rank labels. The drawing is 6 × 18 cells.

| Band (top to bottom) | Contents | Rows |
|---|---|---|
| top | `QL6` (z,a) and `KL6` (d,e), ranks 9, 8 | 0–1 |
| | `B`, ranks 8 … 5 | 2.5–5.5 |
| | `N`, ranks 6 … 3 | 7–10 |
| | `W`, ranks 4 … 1 | 11.5–14.5 |
| bottom | `QL1` and `KL1`, ranks 1, 0 | 16–17 |

### 6.3 Both layouts

- **Black's view** rotates the drawing 180°.
- **Column twin.** Hovering or selecting a square outlines the other square of the same column, if one exists, with
  a small "also b3W" hint. When a piece is picked up, every target is shown on every level.
- **Void columns** are never drawn in either layout, because they are not squares.
- **Optional "top view" toggle** for experienced players: the 6×10 flat map with void columns hatched. Each
  two-level column is drawn as a split cell, upper half for the higher level and lower half for the lower level.
  This is not needed for v1.

---

## 7. Test cases

Unless stated otherwise, positions add White K `d0KL1` and Black K `d9KL6`, both marked as having moved, and
castling is off. "Classical moves" means one world's classical generator output, with no check rule.

**T1. Squares.**
- Exactly 64 squares exist. The 20 two-square columns are the ones listed in §2.1.
- `b0`, `c0`, `z2` … `z7`, `e2` … `e7`, `b9` and `c9` are void.
- `a1` exists on `W` and `QL1`. `z1` exists only on `QL1`.

**T2. Start position.**
- White has exactly **21** classical moves:
  - `a1W-b3W`, `a1W-b3N`, `d1W-c3W`, `d1W-c3N`;
  - for each of `a`, `b`, `c` and `d`: `x2W-x3W`, `x2W-x3N`, `x2W-x4W`, `x2W-x4N`;
  - `d0KL1-e0KL1` (castling).
- The pieces on the attack boards (Rz0, Qa0, Pz1, Pa1, Pd1, Pe1, Re0) have no moves, apart from the king's castling.
- Black has 21. Perft 2 = **441**.

**T3. Blocking on any level.**
- Position: White R `b1W`, Black N `b3N`.
- **Expected:** the rook's moves are exactly {`b2W`, `b3W`, `b3N`(capture), `a1W`, `a1QL1`, `z1QL1`, `c1W`, `d1W`,
  `d1KL1`, `e1KL1`}.
- `b1W-b4W` and `b1W-b5N` are illegal. The knight on the other level of column `b3` blocks the file, even though
  `b3W` is empty.

**T4. Flying across the void.**
- Position: White R `z0QL1`, Black P `z8QL6`.
- **Expected:** `z0QL1-z8QL6` (capture) is legal, crossing `z2`–`z7`. The rook's moves are exactly {`a0QL1`,
  `z1QL1`, `z8QL6`}.
- No move ends on `z2`–`z7`.
- Without the Black pawn, `z0QL1-z9QL6` is also legal.

**T5. No vertical moves; ending on any level.**
- White Q `b3W` on an otherwise empty board (kings as usual).
- `b3W-b3N` is illegal.
- Legal moves include `b3W-b4N`, `b3W-b8B` (the file is flown through `b4`–`b7`), `b3W-e0KL1` (diagonal through
  `c2` and `d1`) and `b3W-d5B`.
- There are 28 moves in total.

**T6. The knight chooses its level.**
- In the start position, `a1W` has exactly `a1W-b3W` and `a1W-b3N`.
- `c2W` holds its own pawn, `z3` and `c0` are void, and the other five knight vectors leave the map.
- In an otherwise empty position, `a1W` has exactly {`b3W`, `b3N`, `c2W`}.

**T7. Promotion depends on the file.**
- White P `b7B`: exactly `b7B-b8B=Q/R/B/N`, which promotes.
- White P `a7B`: exactly `a7B-a8B` and `a7B-a8QL6`, with **no** promotion (`a9` still exists).
- White P `a8B`: `a8B-a9QL6=Q/R/B/N`, which promotes.
- White P `z8QL6`: `z8QL6-z9QL6=Q/R/B/N`.
- White P `d7B` with a Black N on `e8KL6`: `d7B-d8B`, `d7B-d8KL6` and `d7B-e8KL6` (a capture), none of which promotes.

**T8. Double step blocked by the other level.**
- White P `a2W` (unmoved), Black N `a3N`.
- **Expected:** the only move is `a2W-a3W`.
  - `a2W-a4W` and `a2W-a4N` are illegal, because column `a3` is occupied (on `N`).
  - `a2W-a3N` is illegal, because a pawn cannot capture straight ahead.

**T9. En passant on either level.**
- Position: White P `c5N`, Black P `b7B` (unmoved). Black plays `b7B-b5N`.
- **Expected:** White's moves with the `c5N` pawn are exactly `c5N-c6N`, `c5N-c6B`, `c5N-b6N` (ep) and `c5N-b6B`
  (ep).
- Both ep moves remove the pawn from `b5N`.
- If White plays anything else first, neither ep move is available afterwards.

**T10. Castling.**
- From the start position, `d0KL1-e0KL1` is legal. Afterwards the White K is on `e0KL1`, the White R is on `d0KL1`,
  and White has no castling move for the rest of the game.
- Black: `d9KL6-e9KL6` likewise.
- There is no queenside castling key in any position.

**T11. Black promotion.**
- Black P `c2W`: `c2W-c1W=Q/R/B/N`, which promotes.
- Black P `a2W`, with `a1W` and `a1QL1` empty: exactly `a2W-a1W` and `a2W-a1QL1`, with no promotion (`a0` still
  exists).
- Black P `a1W`: `a1W-a0QL1=Q/R/B/N`.
- Black P `a1QL1`: `a1QL1-a0QL1=Q/R/B/N`.

**T12. The king across levels.**
- White K `b4W`, empty board: exactly 16 moves: {`a3W`, `a3N`, `a4W`, `a4N`, `a5N`, `a5B`, `b3W`, `b3N`, `b5N`,
  `b5B`, `c3W`, `c3N`, `c4W`, `c4N`, `c5N`, `c5B`}.
- `b4N` is not among them (that would be a vertical move).
- White K `d0KL1`, empty board: exactly {`c1W`, `d1W`, `d1KL1`, `e0KL1`, `e1KL1`}. `c0` is void.

**TQ1. A ghost on another level links a rider** (quantum).
- White R `b1W`. Black N is 50% on `b3N` and 50% on `c5B`.
- White plays `b1W-b5N`. **Expected:** no roll, because `b5N` is certainly empty and a rook is not solid.
  - Where the knight is on `b3N`, the rook is blocked and stays on `b1W`.
  - Otherwise the rook reaches `b5N`.
  - The rook is 50% `b1W` / 50% `b5N`, linked to the knight. White's budget is 2.

**TQ2. A ghost on the other level of the target is irrelevant** (quantum).
- Same position as TQ1. White plays `b1W-b3W`.
- **Expected: Certain.** The rook is 100% on `b3W`, with no roll and no link. The only lane column is `b2`, and `b3W`
  is empty in both worlds.
- By contrast, `b1W-b4W` gives 50% `b1W` / 50% `b4W`, linked.

**TQ3. A level split is a wall** (quantum).
- White N `a1W`. Black R `b6N`.
- White splits `a1W-b3W|b3N`. This is legal: both squares are certainly empty and reachable. The knight is 50/50,
  there is no roll, and White's budget is 2.
- Black's replies:
  - `b6N-b1W` is **illegal**. Column `b3` is occupied in every world, so the move would miss everywhere.
  - `b6N-b3N` is a **roll**:
    - 50% **Captured**: the knight was on `b3N`.
    - 50% **Moved**: the rook now stands on `b3N` above the knight, which is 100% on `b3W`.
  - `b6N-b4W` is **certain**.

**TQ4. A pawn probes one level** (quantum).
- White P `c2W` (unmoved). Black N is 50% on `c3W` and 50% on `c3N`.
- `c2W-c3W` is a roll:
  - 50% **Moved**: the knight is 100% on `c3N`.
  - 50% **Missed**: the knight is 100% on `c3W`.
- `c2W-c3N` gives the mirror result.
- `c2W-c4W` and `c2W-c4N` are **illegal**: the skipped column `c3` is occupied in every world.

**TQ5. Promotion only if the pawn arrives** (quantum).
- White P `b7B`. Black N is 50% on `b8B` and 50% on `c6N`.
- `b7B-b8B=Q` is a roll:
  - 50% **Moved**: a White queen stands 100% on `b8B`, and the knight is 100% on `c6N`.
  - 50% **Missed**: the pawn stays on `b7B` unpromoted, and the knight is 100% on `b8B`.

**TQ6. The double step rolls, then en passant is certain** (quantum).
- White P `c5N`. Black P `b7B` (unmoved). Black N is 50% on `b6N` and 50% on `a6B`.
- Black plays `b7B-b5N`. It is a roll:
  - 50% **Missed**: the knight is 100% on `b6N` and blocks the skipped column. There is no ep afterwards.
  - 50% **Moved**: the knight is 100% on `a6B`. Now White's `c5N-b6N` (ep) and `c5N-b6B` (ep) are both **Certain**
    (no roll), and each removes the pawn from `b5N`.

**TQ7. Castling next to ghosts, and a missed attack keeps the right** (quantum).
- Start position, except that White's `e1KL1` pawn is gone and a Black N is 50% on `e1KL1` and 50% on `c3N`.
  - `d0KL1-e0KL1` is offered and previews as **Certain**: no roll and no link.
- Different position: White K `d0KL1` and R `e0KL1`, both unmoved, with the right intact. A Black N is 50% on `c1W`
  and 50% on `b5N`.
  - Black plays `c1W-e0KL1`. It is a **roll**, because the target holds a piece:
    - 50% **Captured**: the rook is gone, and White's castling right is lost.
    - 50% **Missed**: the knight is 100% on `b5N`. The rook never left `e0KL1`, so it is still 100% home and the
      right survives.
