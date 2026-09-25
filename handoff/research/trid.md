# Variant spec: `trid` (Tri-Dimensional Chess, simplified: fixed attack boards)

Category: `dimensions`.

- **UI name and summary** come from `src/variants/catalog.js` (not edited here): "Tri-Dimensional chess", "Three
  main levels and four attack boards, as seen on the starship Enterprise." The research proposed "Tri-D Chess" and a
  summary without franchise names; see §8.1 (item 11) for the open naming question.
- **Naming:** keep "Star Trek" and franchise logos out of the UI (trademark). In the rules card, credit the board to
  Franz Joseph's 1975 design and the rules to Jens Meder's *Tournament Rules for Three-Dimensional Chess*, which build
  on Andrew Bartmess's Federation Standard rules.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site during the research, so the first draft
came from search-engine extracts plus prior knowledge. The source review (§8.1) read the pages themselves (Meder's
rules in English and German with the start-position diagram, Meder's FAQ, the W3DCF laws, Bartmess's own sample-game
page and Roth's FS5 summary) and corrected the rule set accordingly. Every move list and count in §7 was computed with
a reference move generator (`handoff/tools/trid.py`) and re-checked with an independent one written for the review
(`handoff/tmp/trid-rules/gen.py`, not committed).

| Source | What it gives |
|---|---|
| Jens Meder & friends, *Tournament Rules for Three-Dimensional Chess* (content unchanged since 1995): https://meder.spacechess.org/3dschach/chess3d.htm, German original https://meder.spacechess.org/3dschach/schach3d.htm, start diagram https://meder.spacechess.org/3dschach/image5.gif, FAQ https://meder.spacechess.org/3dschach/faq.htm | **Base rule set.** The **notation** used here (E1–E14): files `z a b c d e`, ranks `0`–`9`, levels `W N B`, attack-board pins `QL1`…`QL6` / `KL1`…`KL6`, squares such as `z1QL1`. The start position (2.7, diagram). Art. 2.8: "non-existent squares are part of 'files', 'ranks' and 'diagonals'". Art. 3.1: any flat-chess move may end on any level; "A piece, on any individual square, blocks the ability of other pieces to move at all levels … But the moving piece may land above or below the occupied square"; no purely vertical moves; a move may not end on a non-existent square. Art. 3.4: pawns, en passant landing on either level, promotion rank per file. Art. 3.5: kingside castling swaps king and rook; queenside castling puts the king beside the rook and the rook on the king's square; no castling "before move 2" (German: "vor dem 2. Zug"). FAQ Q3 confirms the any-level block was chosen deliberately; FAQ Q9 confirms queenside castling across the non-existent `b0`/`c0`. |
| Andrew Bartmess, *The Federation Standard Tri-D Chess Rules* (1976, rev. 5.0 "FS5"): booklet only (https://www.goodreads.com/book/show/22214671); sample game and notation by Bartmess: http://www.grigor.org/tactical.htm | The rule set Meder's rules derive from. The booklet is not online. Bartmess's page uses the same start position, castles kingside (`O-O`) in its sample game and lists `O-O-O` for queenside castling in its notation, but some of the sample game's moves pass over pieces standing on a lower level (7…Qb9-b4(4) past pawns on b6(4)/b5(4), 16.Qe3xBb3(4) past a knight on c3(2), in his notation), so FS does **not** block on every level. It uses a path rule instead (see Roth). **Not followed for blocking.** |
| J. Roth, "Star Trek 3-D Chess Rules" (FS5, clarified): https://www.thedance.net/~roth/TECHBLOG/chess.html | FS5 as played: ignoring every board above the higher of its start and target boards, a piece travels on the "highest path" through the rest, and only pieces on that path block it; en passant lands on that path; kingside castling swaps king and rook; queenside castling (once the queen has left) puts the king on the queen's home square and the queen's rook on the king's home square; an optional FS5 "rook pawn" rule lets pawns on the outer files step or capture sideways inwards. **Used to confirm castling; path rule and rook-pawn option not adopted.** |
| World Tri-Dimensional Chess Federation laws: http://w3dcf.com/information/laws | A different modern rule set: bishops, king and queen on the main level, rooks and knights on the attack boards, and a path-based level change. Used only to corroborate promotion: "Where further progress forward on the same file is facilitated by an attack board positioned on the opponent's starting edge, the pawn may be promoted only when it has reached the rear rank of that attack board." |
| Chess Variant Pages, "3D chess from Star Trek": https://www.chessvariants.com/3d.dir/startrek.html (behind a browser check; read through a search extract only) | An older rule set where "each step taken, the piece can go up or down one or more levels; where going up or down a level always means going from a movable level to a fixed level or vice versa". **Rejected**: it is hard to explain and not the standard. |
| Franz Joseph, *Star Fleet Technical Manual* (1975) | The original board: 3 main levels of 4×4 and 4 attack boards of 2×2. |

**Chosen rule set:** Meder's **Tournament Rules** (the FS-derived rule set with a complete public text), with these
changes. Each one is justified below.

1. **The four attack boards are fixed** on their starting pins: White's on `QL1` and `KL1`, Black's on `QL6` and
   `KL6`.
   - There are no attack-board moves and no attack-board ownership rules (Meder art. 3.6 is dropped). The set of
     squares never changes.
   - This was requested by the brief. It also keeps a world a plain piece list.
2. **Castling on both sides**, as in Meder art. 3.5, which Roth's FS5 summary confirms:
   - kingside: the king and the rook on the king's attack board swap places;
   - queenside: the king goes to `a0` (the queen's home square, next to the rook) and the rook to `d0` (the king's
     home square). The king crosses the non-existent `b0`/`c0`, which Meder allows (FAQ Q9);
   - not on a side's first move (Meder: "before move 2").
3. **No check.** As in every Quantum Chess variant, you win by capturing the king. The check conditions of the
   classical rules are dropped: a move may leave the own king attacked, and castling is allowed while the king's
   square or its destination is attacked.
4. **En passant lands on either level** of the skipped square (Meder art. 3.4(d)).
5. **Promotion on the last rank of the pawn's file** (Meder art. 3.4(e)(ii) with the boards fixed; W3DCF agrees):
   - White: rank 9 on files `z a d e`, rank 8 on `b c`.
   - Black: rank 0 on `z a d e`, rank 1 on `b c`.
6. **Not adopted:** FS5's path-based blocking (Meder blocks on every level, which is simpler and what the quantum
   rules in §4 build on) and FS5's optional rook-pawn sideways move (Meder does not have it; Roth calls it optional).

---

## 2. Classical rules (complete)

### 2.1 Board, squares and coordinates

- **Coordinates:** `x` = file index, `y` = rank (0–9), plus a **level tag**.
  - Files: `z`=0, `a`=1, `b`=2, `c`=3, `d`=4, `e`=5.
  - Level tags: `W` (White main level), `N` (Neutral), `B` (Black main level), and the four attack boards `QL1`,
    `KL1`, `QL6`, `KL6`.
- **Square name** = file + rank + level tag, as in Meder (appendix E; Bartmess's own notation differs: files a–f and
  numbered levels such as `e0(3)`). Examples: `a2W`, `b3N`, `z0QL1`, `e9KL6`.
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
   level** (Meder art. 3.1(c)). A void column counts as empty, so riders fly across the gaps (Meder art. 2.8:
   "non-existent squares are part of files, ranks and diagonals"; FAQ Q2). A ride stops at the edge of the 6×10
   rectangle.
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

As in Meder's start diagram (art. 2.7) and Bartmess's sample game (his queen's rook on "a0", king on "e0(3)" are
`z0QL1` and `d0KL1` here).

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
    board (Meder art. 3.4(e)(ii)–(iii): with the attack board overhanging the corner the furthest rank of files a
    and d is 9, or 0 for Black; W3DCF says the same).
  - Promotion is compulsory and may choose any of Q, R, B, N, whatever has been captured (Meder art. 3.4(e)(i)).
  - The White `z` and `e` pawns can leave their file only by capturing diagonally (`z1 → a2`, `e1 → d2`).

### 2.5 Castling (both sides; Meder art. 3.5)

- **Conditions for both castlings:** the king has never moved, the rook used has never moved, and the side has
  already made at least one move (Meder: castling is illegal "before move 2", so neither side may castle on its first
  move). Castling never captures.
- **Kingside** (`O-O`): the king on `d0KL1` and the rook on `e0KL1` **swap** places: the king moves onto `e0KL1` and
  the rook goes to `d0KL1`. Nothing can stand between them.
  - Black: the king `d9KL6` onto `e9KL6`, the rook to `d9KL6`.
- **Queenside** (`O-O-O`): the king goes to the square beside the queen's rook and that rook to the square the king
  left: the king moves onto `a0QL1` and the rook from `z0QL1` goes to `d0KL1`.
  - Black: the king onto `a9QL6`, the rook from `z9QL6` to `d9KL6`.
  - The square between them, `a0QL1` (the queen's home square), must be empty. `b0` and `c0` do not exist and never
    block (Meder FAQ Q9). Pieces on rank 1 (`a1W`, `a1QL1`, …) do not matter.
- Castling is played by moving the king (from `d0KL1` onto `e0KL1` or `a0QL1`), but its key is `O-O` / `O-O-O`, never
  the king's `from-to`, so the move list reads as in chess (§3).
- Meder's "not in check / not onto an attacked square" conditions are dropped, because the quantum rules have no
  check.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate (Meder art. 1.1). With fixed attack boards every turn
  is a piece move.
- **Classically** (Meder art. 1.2, 5, 9), a game is won by checkmate. Stalemate and a position where neither side
  can mate are draws; threefold repetition and the 50-move rule are draws on a claim; draws by agreement.
- **In Quantum Chess 2.0**, the shared rules of the variants core apply (`docs/variants.md`, `core/quantum.js`):
  - You win by capturing the king (result reason `king`). There is no check, no checkmate and no "trapped king"
    rule in the variants core.
  - Draws: 50 moves by each side without a capture or a pawn move (`quiet`, 100 plies), the move limit (`moveLimit`,
    600 plies), and a side without a legal move (`noMoves`).
  - There is no repetition draw and no bare-kings draw.

---

## 3. Engine mapping (contract)

The module is written with the hooks of `handoff/IMPLEMENTING.md` plus the core items of `handoff/CORE-CHANGES.md`
named below (Q1, Q2, Q3, W1, W3, W4, W5, U4). All of them are in `src/variants/core` now (working tree of 2026-09-25;
checked in §8.2). Nothing Tri-D-specific goes into the core (CORE-CHANGES item 36: projected move generation is a
variant `generate` hook; there is no `core/movegen.js`).

```js
export default defineVariant({
  id: 'trid',
  category: 'dimensions',                          // as in catalog.js (the placeholder module says 'rules')
  // name and summary: from catalog.js ('Tri-Dimensional chess'), not declared in the module
  sides: whiteBlack(),                             // core/orthodoxVariant.js: White = side 0, Black = side 1
  topology,                                        // makeTopology(), see "Topology" below
  types: {                                         // `name: () => t(...)` on each type, as in orthodoxTypes()
    k: { moves: [], royal: true, value: 0, glyph: { sprite: 'k' } },          // royal, so solid, not splittable
    q: { moves: [], value: 950, glyph: { sprite: 'q' } },
    r: { moves: [], value: 520, glyph: { sprite: 'r' } },
    b: { moves: [], value: 320, glyph: { sprite: 'b' } },
    n: { moves: [], value: 280, glyph: { sprite: 'n' } },
    p: { moves: [], solid: true, value: 100, glyph: { sprite: 'p' },
         promote: { zone: (side, to) => rankOf(to) === LAST[side][fileOf(to)], to: ['q', 'r', 'b', 'n'] } },
  },
  setup: () => startWorld(),                       // section 2.3 plus the world extras below; no options
  generate(w, side),                               // projected moves, pawn extras, both castlings (pseudo-code below)
  afterMove(next, m, prev),                        // x.moved, x.ep / x.epVictim, x.castle, x.started (below)
  applyMiss: (b) => clearEnPassant(b),             // CORE-CHANGES Q1 + W4: en passant expires in idle worlds
  unifyWorlds: (bs) => unifyCastling(bs),          // CORE-CHANGES Q3 + W5: castling rights equal in every world
  rules: () => [...],                              // the eight entries of section 5
  // worldResult: core default (a side without its king has lost, reason 'king'); no options, no visibility
})
```

- Imports: `castlingMoves`, `clearEnPassant` and `unifyCastling` from `core/orthodox.js`; `whiteBlack` from
  `core/orthodoxVariant.js`; `makeTopology` from `core/topology.js`; `addPiece`, `emptyWorld`, `moveKey` and `pushMove`
  from `core/world.js`.
- `LAST = [[9, 9, 8, 8, 9, 9], [0, 0, 1, 1, 0, 0]]` (per side, per file index `z` … `e`; section 2.4). The zone reads
  the file of the target square `to`, never the pawn's own file: `c7B-b8B` promotes, `c7B-d8KL6` does not (T13).
- **Movement descriptors stay empty on purpose.** A `generate` hook replaces the descriptor generator completely: the
  core then calls neither `extraMoves` nor `filterMoves`, so pawn extras and castling are produced by `generate`
  itself. `world.attacks`, `givesCheck`, `linesOf` and `pieceMoves` read the descriptors and step with
  `topology.step`, which on this topology stays on one level and stops at a void; with flat vectors they would
  silently give wrong lanes. The variant must not call them. Everything else (legal moves, outcomes, splits, merges,
  `royalDanger`, the computer player, the board's targets) goes through `generate`.
- **Topology.** `makeTopology({ coords, name, cell, layout })` (there is no `layered` helper).
  - `coords`: `[x, y, h]` with `x` the file index (`z` = 0 … `e` = 5), `y` the rank (0–9) and `h` the level in height
    order: `W` = 0, `QL1` = 1, `KL1` = 2, `N` = 3, `B` = 4, `QL6` = 5, `KL6` = 6.
  - Square indexes in the order level (`h`), then rank, then file. The core writes the two squares of a split or merge
    code in index order, so the codes are `a1W-b3W|b3N` and `b3W|b3N-c5N` (lower level first).
  - `name: ([x, y, h]) => 'zabcde'[x] + y + LEVELS[h]`; `cell` and `layout` from section 6.
  - A column table built once: `COLS[x + 6 * y]` = the existing squares of that column, lowest first (0, 1 or 2).
- **Oriented vectors.** `generate` uses `f = +1` for White and `-1` for Black directly; the default `orient` is not
  needed.

**Projected move generation** (`generate(w, side)`; allocation-light, it runs in every world on every move):

```
for each piece id of `side` on the board, at square s in column (x0, y0):
  pawn: pawnMoves (below)
  other: vectors = KING8 (k, q), ORTH4 (r), DIAG4 (b), KNIGHT8 (n); rider = q, r, b
    for each vector (dx, dy):
      (x, y) = (x0, y0)
      repeat (once for k and n, until stop for riders):
        (x, y) += (dx, dy); if (x, y) outside 6x10: stop
        for t in COLS[x + 6y]:                              // void column -> no destinations
          t empty:     pushMove(V, w, out, id, s, t, -1)
          t enemy:     pushMove(V, w, out, id, s, t, w.board[t])
        if rider and some square of COLS[x + 6y] is occupied: stop   // blocked on ANY level

pawnMoves (f = +1 White, -1 Black):
  step:     every empty square of column (x0, y0+f): pushMove (promotion comes from types.p.promote)
  double:   id not in x.moved, every square of column (x0, y0+f) empty (a void column counts as empty),
            every empty square of column (x0, y0+2f): pushMove(..., 'double')
  capture:  every square of columns (x0±1, y0+f) that holds an enemy: pushMove
  ep:       if x.ep == column (x0±1, y0+f) and the piece on x.epVictim is an enemy pawn: every empty square of
            that column: { key: moveKey(from, to), kind: 'ep', capture: that pawn }

castling: if x.started[side]: out.push(...castlingMoves(V, w, side))          // core/orthodox.js (W3)
  per right c of x.castle with c.side == side: this side's k on c.king, its r on c.rook, and c.kingTo and c.rookTo
  empty unless they are c.king or c.rook (kingside: nothing to check; queenside: a0QL1 / a9QL6). It emits
  { key: 'O-O' (flag K/k) or 'O-O-O' (flag Q/q), from: c.king, to: c.kingTo, id: king, capture: -1,
    kind: 'castle', extra: { rook: { id: rook, to: c.rookTo }, kingTo: c.kingTo } }
```

- Use `pushMove` for every ordinary pawn move: it expands the promotions (`b7B-b8B=q`, lowercase type ids, as every
  core key). En passant never promotes (the skipped rank is never a last rank).
- `castlingMoves` gives exactly these two castlings on this topology (checked, §8.2). Its `between` (W3) finds no
  square between `d0KL1` and `a0QL1`, or between `z0QL1` and `d0KL1`: the void `b0`/`c0` are not squares, and the level
  coordinate differs. So queenside castling needs only `a0QL1` empty, as Meder FAQ Q9 says, and pieces on rank 1 never
  matter. The helper does not know the first-move rule, hence the `x.started` guard. A local loop with the same
  result is fine too.
- `applyClassical` (core, W1) lifts king and rook off the board first, then puts the king on `extra.kingTo` and the
  rook on `extra.rook.to`. So the kingside swap (the king lands on the rook's square) and the queenside move both
  come out right (T10).

**World extras** (`x`, plain JSON; after every move they are identical in every world, test F1):

- `startWorld()` creates all five fields below, and the hooks only replace their values; they never add or delete a
  field. Worlds are compared by the JSON text of `x` (`worldKey`), key order included, so a field that exists in some
  worlds only would keep identical positions apart.
- `moved`: the ids of the pawns that have moved, **sorted** (worlds are compared by their JSON text). A pawn may
  double-step only while its id is not in the list. A square test is not enough: the queen's pawn can step from
  `a1QL1` to `a2W`, White's other start square, and must not double-step from there.
- `ep`, `epVictim`: -1 and -1, or, right after a double step, the flat index `x + 6y` of the skipped column and the
  square of the pawn that double-stepped. `afterMove` sets them on every double step and resets them on every other
  move. With these names and -1 for "none", the core helper `clearEnPassant` (W4) is exactly the `applyMiss` this
  variant needs.
- `castle`: the rights in the orthodox array shape of `core/orthodox.js`, four entries at the start:
  - `{ flag: 'K', side: 0, king: d0KL1, rook: e0KL1, kingTo: e0KL1, rookTo: d0KL1 }` (kingside swap);
  - `{ flag: 'Q', side: 0, king: d0KL1, rook: z0QL1, kingTo: a0QL1, rookTo: d0KL1 }` (queenside);
  - `k` and `q` for Black likewise with `d9KL6`, `e9KL6`, `z9QL6`, `a9QL6`.
  - `afterMove` removes every entry whose `king` or `rook` square is the move's `from` or `to` (the filter of
    `orthodoxAfterMove`). A castling move starts on the king's square, so it removes both of that side's entries.
- `started`: `[false, false]` at the start; `afterMove` sets the mover's entry (`prev.sd[m.id]`). Castling needs it
  (no castling on a side's first move, section 2.5). A split also runs `afterMove` in both halves. Plies 0 and 1
  never miss and are never a Measure: White's only splits on ply 0 are the knights' (`a1W-b3W|b3N`,
  `d1W-c3W|c3N`), and no Black piece can reach rank 3 or 4 on ply 1. So the flag is the same in every world; if it
  were not, castling would simply be illegal (it is certain-only, section 4.7).

**Castling rights follow the state** (docs/rules.md section 5; lead decision D1):

- `afterMove` clears rights per world; `unifyWorlds: (bs) => unifyCastling(bs)` (CORE-CHANGES Q3 + W5) then keeps a
  right in the new state only if **every** world still has it. Together this is "the right is lost as soon as, after
  any move, the king or that rook is not 100 % on its home square": a partial slide clears it in the worlds where the
  rook moved, a split wherever the rook left (normally both halves), a capture of the rook on its square in the
  capturing worlds.
- A rolled Missed rook or king move leaves every world of that outcome untouched, so the right survives (TQ7).
- Because the rights are then identical everywhere and imply that king and rook are home in every world, kingside
  castling is available in every world or in none, and a castling key never coincides with an ordinary king move.

**Move keys:**

| Kind | Example |
|---|---|
| move | `a2W-a4N` (a double step, kind `double`) |
| promotion | `b7B-b8B=q` (the type id, lowercase) |
| castling | `O-O` / `O-O-O`, kind `castle`; king `d0KL1` to `e0KL1` / `a0QL1` (Black `d9KL6` to `e9KL6` / `a9QL6`) |
| en passant | `c5N-b6B`, kind `ep` |
| split | `a1W-b3W\|b3N` |
| merge | `b3W\|d3N-c5B` |

- Castling keys are `O-O` / `O-O-O`: the orthodox keys, which `castlingMoves` emits, and Bartmess's notation. The
  king's `from-to` would also be safe, because the core's certain-only rule (CORE-CHANGES Q2) makes a castling key
  legal only when every world generates it as castling. The board still plays castling as a king move:
  `useVariantGame` matches a move by `from` and `to`, so the player clicks the king, then its own rook's square
  (kingside) or `a0QL1` (queenside).

**Royal / solid / splittable.**

- Royal: `k`. Solid: `k` and `p`. Splittable: `q`, `r`, `b` and `n`, including promoted pieces (the default
  `splittable = !solid`).

**Piece values** (centipawns):

| Piece | P | N | B | R | Q |
|---|---|---|---|---|---|
| Value | 100 | 280 | 320 | 520 | 950 |

- Rooks are relatively strong here: they cross the voids, and every stop can be taken on two levels. The empty-board
  average number of moves is R 16.8, Q 25.9, B 9.1, N 6.5 (re-computed on the prototype).
- Suggested `evaluate(w, side)` terms (optional). It sees one world only, with no move number. Count each term for
  `side` minus the same term for the enemy: `ai.js` adds `evaluate(b, side)` to own-minus-enemy material, so a
  one-sided term would ignore the opponent's activity.
  - +10 for a minor piece or queen on level `N`;
  - +5 per attacked square: a distinct target square of the side's moves other than pawn steps, taken from
    `generate(V, w, side)`, which is cached per world. Never from `world.attacks` (see above);
  - -15 for a rook on `z0QL1` or `e0KL1` (Black: `z9QL6`, `e9KL6`) while the own pawn in front of it (`z1QL1`,
    `e1KL1`; Black `z8QL6`, `e8KL6`) is still there (boxed in).

**Size.**

- At the start, White has **20** classical moves: 16 pawn moves (4 pawns × 2 levels × single or double step) and
  4 knight moves. Castling is not allowed on the first move. Black also has 20.
- Perft 2 = **400**, perft 3 = **9128** (from ply 2 on, White may castle kingside). Re-checked on the prototype.
- The branching factor stays well below orthodox chess, so the generic AI's depth is not a problem.
- Split pairs are more numerous because of level choices (a queen alone on `b3N`: 378 pairs). The computer player's
  cap on split candidates is generic (CORE-CHANGES U4); nothing to do in the variant. The split list for humans stays
  complete.
- Speed: random games on the prototype take about 40-50 ms per 60 plies, with up to 64 worlds (F1).

---

## 4. Quantum adaptation

All shared quantum rules apply unchanged: worlds, split, merge, measure, land = roll, pass = link, the solid roll,
the game-end roll, a budget of 8, a cap of 4 locations and at most 64 worlds. The decisions below settle every case
that is special to Tri-D. None of them needs Tri-D code in the quantum layer: they follow from `generate` (section 3)
and the generic core.

1. **Lanes are columns (pass = link).**
   - A rider or double-stepping pawn is blocked in a world when an intermediate column holds a piece on any level in
     that world.
   - So a ghost part on either level of a column in the path blocks in its worlds (TQ1).
   - If the target square is certainly empty and the mover is a queen, rook or bishop, the result is a **link**, not a
     roll; a link that would push the mover's side over its budget is rolled instead, as everywhere. If the target
     square may hold a piece, the move lands, which is a roll (item 2). A double step is a pawn move, so it is always
     rolled when the worlds disagree (item 5).
2. **Landing is per square, not per column (land = roll).**
   - The measured class M, which settles a move by roll, applies if the **target square** (file, rank and level) may
     hold a piece in some world. This is the core's generic test (`isMeasured` reads the target square only). A part
     of the moving piece itself on the target does not count: the moving part joins it (docs/rules.md 2.1).
   - A piece or ghost on the other level of the target column is irrelevant: it neither blocks nor causes a roll.
   - Example: rook `b1W-b3W` with a knight ghost on `b3N` is certain (TQ2); a king step likewise (TQ12).
3. **Splits may use two levels of one column** (a "level split"), for example `a1W-b3W|b3N`.
   - Both targets must be certainly empty and reachable by a quiet move, as always.
   - The piece is then *certainly* in column `b3`, so it blocks every lane through `b3` in every world. A move whose
     only lane crosses `b3` misses in every world and is therefore illegal (TQ3).
   - This gives a teachable pattern: "a level ghost is a solid wall but an uncertain target".
4. **Merge.**
   - The target must be reachable from both parts by a flat move. Two parts in the same column can never merge in
     place, because vertical moves don't exist.
   - A piece's moves depend only on its column, never on its level. So parts on the two levels of one column have the
     same targets and can merge onto any of them; with no other part and no possible blocker the piece is whole
     again, with no roll (TQ11).
   - Converging capture works as in the classic game.
5. **Pawns are solid.**
   - Steps, double steps and captures are in class M and are rolled when the worlds disagree (TQ4, TQ13).
   - A double step needs the skipped column empty on both levels in that world. Otherwise it **misses**; it never
     falls back to a single step (as in the classic rules; TQ6).
   - A pawn move onto one level of a column is only affected by that square: a ghost on the other level of the
     target column neither blocks nor causes a roll, also for a double step (TQ13, TQ14).
6. **En passant is always certain.**
   - A double step only happens in worlds where the skipped column is empty on every level, and the roll keeps only
     those worlds. So right after it, the skipped column is empty in every world, and the capturing pawn and the
     victim are both solid.
   - Every en-passant key, one per level of the skipped square, is therefore available in every world and never
     rolled (TQ6, TQ14). It cannot coincide with an ordinary capture key in another world, because the skipped column
     is empty everywhere on that ply.
   - It is offered only on the move right after the double step, and only when it is actually available. That ply
     ends it in **every** world: also where the reply missed and on a Measure turn (lead decision D2; TQ9).
   - Implementation: en passant moves have kind `ep`, which the core treats as certain-only (`isCertain`,
     CORE-CHANGES Q2: legal only if every world generates the key as a certain move, then never rolled).
     `applyMiss: (b) => clearEnPassant(b)` (Q1 + W4) clears `x.ep` in the worlds where a move, split or merge did not
     happen and in every world of a Measure.
7. **Castling** (lead decision D1; docs/rules.md section 5) needs the side's right for that side of the board, the
   side's first move already played, and the king and that rook 100 % on their home squares.
   - Castling never rolls. It is legal only if it is available in **every** world (kind `castle`, certain-only:
     CORE-CHANGES Q2). Then it is certain: no roll, no link.
   - The right is lost for good as soon as, after any move, the king or that rook is not 100 % home: it moved, split,
     was captured, or took part in a partial slide (TQ10). Measuring the rook back home does not restore it. Section 3
     ("Castling rights follow the state") says how.
   - A king or rook move that is **Missed** in a roll does not cost the right: the piece never left (TQ7).
   - **Kingside** (`O-O`): nothing lies between king and rook, so while the right exists it is available in every
     world and certain.
   - **Queenside** (`O-O-O`) also needs `a0QL1` empty. If a ghost part (of either colour) may stand on `a0QL1`,
     `O-O-O` is **not offered**: a ghost part on a square that castling needs blocks it, as in the classic game. The
     right stays; once `a0QL1` is empty in every world, `O-O-O` is legal again and certain (TQ8).
8. **Promotion**
   - The piece is part of the key (`=q`, `=r`, `=b`, `=n`: the core's lowercase type ids).
   - It happens only in the worlds where the pawn really arrives on its file's last rank; the roll settles this (TQ5).
   - The promoted piece can split and merge.
9. **Attack boards are fixed.** Nothing about them is quantum: there are no ghost boards and no board rolls.
10. **The king is solid.**
    - A king step to a square that might be occupied is rolled; a piece on the other level of the target column does
      not matter (TQ12).
    - King danger (`royalDanger`) counts both levels of every column, because it uses the enemy's `generate` (TQ12).
11. **Solid roll and game-end roll.** They never fire in Tri-D; they are only safety nets, as in the classic game.
    - Kings and pawns only move by measured or certain moves.
    - A pass = link move lands only where no other piece can be, so it captures nothing. A merge onto a possible enemy
      is rolled. Castling and en passant are certain and happen in every world.
    - `worldResult` only reports a missing king, and only a capture removes one.
    - So after every move the solid pieces and the result are the same in every world of the chosen outcome.
    - Checked: in 140 seeded random games on the prototype (18,560 plies with splits, merges, measures, castling, en
      passant and promotions), no outcome of any played move had a `solid:` or `end:` note (F1).
12. **Budget 8, location cap 4, 64 worlds, Measure.** Unchanged. The world extras (`moved`, `ep`, `castle`,
    `started`) are the same in every world after every move (section 3), so they never multiply the worlds.

---

## 5. Player-facing rules text (rules card)

`rules()` returns these eight entries, one translated string each (the shared quantum rules, including "castling and
en passant never roll", are shown separately by the app):

1. There are three 4×4 main levels, White's (W, lowest), Neutral (N) and Black's (B, highest), and four 2×2 attack
   boards at the back corners. In this version the attack boards never move.
2. Squares are named file, rank, level, such as b3N. Seen from above, all boards form one map with files z, a–d, e
   and ranks 0–9; b3W and b3N are the two levels of map square b3.
3. Every move is a normal chess move on that map, and the piece may stop on any level of the target map square.
   Moving straight up or down is not a move.
4. A piece on any level of a map square in between blocks the move. Gaps with no board count as empty: you can fly
   across them, but you cannot stop there.
5. Pawns step forward (two steps on their first move) and capture diagonally forward, onto any level. En passant lands
   on either level of the skipped square.
6. A pawn promotes on the last rank of its file: rank 8 on files b and c, rank 9 on files z, a, d and e (Black: rank 1
   and rank 0).
7. Castling is allowed from your second move on, if the king and that rook have not moved (in any possibility). King's
   side: the king and the rook next to it swap places. Queen's side: once the queen's square is empty, the king goes
   there and the corner rook goes to the king's square.
8. Quantum tip: a ghost on either level of a map square blocks moves across it in its possibilities, and a piece split
   over both levels of one map square blocks it for certain. A ghost on the other level of your target square does
   not matter.

---

## 6. UI layout

What the layout API of `VariantBoard.vue` offers, and therefore what v1 uses: `rect` cells with the shades `light` /
`dark`; `layout.boards` (a thin frame and a caption above each board); `layout.lines` (thin brown lines);
`layout.labels` (text); `layout.areas` (background rectangles in the shades `frame`, `wood`, `river`);
`layout.zoomable`. One static layout per variant (CORE-CHANGES item 38: wide and compact layouts are deferred; the
board zooms and pans instead).

- **Cells.** Square cells, one board colour scheme for all levels: `dark` if `(x + y)` is even, else `light`. The
  level shows through the board's caption and position, never through the cell colours.
- **Glyphs.** The cburnett sprites for all pieces (Tri-D has only orthodox pieces).

### 6.1 Wide layout (v1, all screens)

A rank-aligned staircase. All boards share one vertical rank axis, `Y = 9 - rank` (rank 9 at the top); `X` and `Y`
are the top-left corner of a `rect` cell of size 1. The drawing is 18.5 × 10 units (`layout.width`, `layout.height`).

| Board | Files at X | Ranks (rows) |
|---|---|---|
| `QL1` | z=0, a=1 | 0–1 |
| `W` | a=2.5, b=3.5, c=4.5, d=5.5 | 1–4 |
| `KL1` | d=7, e=8 | 0–1 |
| `N` | a=7, b=8, c=9, d=10 | 3–6 |
| `QL6` | z=9.5, a=10.5 | 8–9 |
| `B` | a=12, b=13, c=14, d=15 | 5–8 |
| `KL6` | d=16.5, e=17.5 | 8–9 |

- No two boards overlap (checked on the prototype). `KL1` sits under `N` (the rank-2 row is empty between them), and
  `QL6` sits above `N` (the rank-7 row is empty between them).
- Each attack board sits next to its main level along the shared rank row, 0.5 apart: `QL1`'s `a1` next to W's `a1`,
  `KL1`'s `d1` next to W's `d1`, `QL6`'s `a8` next to B's `a8`, and `KL6`'s `d8` next to B's `d8`.
- **Pins:** one `lines` entry per pair joins the two facing cell edges across the gap, at mid-row: (2, 8.5)–(2.5, 8.5),
  (6.5, 8.5)–(7, 8.5), (11.5, 1.5)–(12, 1.5), (16, 1.5)–(16.5, 1.5). It shows "this attack board hangs over that
  corner". (The API has no dot primitive.)
- **Boards:** one `boards` entry per board, `{ x, y, w, h }` **without** `label` (a frame only). `VariantBoard.vue`
  draws a board label above the *turned* board, while the file letters turn with the drawing. So in Black's view each
  board's file letters would sit in its caption's row ("a QL1 z", 0.08 apart, on every attack board).
- **Labels** (all as `layout.labels`, which turn with the drawing, so a recipe that is clear in White's view is clear
  in Black's):
  - the captions `W`, `N`, `B`, `QL1`, `KL1`, `QL6`, `KL6`, centred 0.32 above each board at `(x + w / 2, y - 0.32)`.
    They are notation like the square names (the layout is static data built when the module loads, so no translated
    words); the rules card explains W, N and B;
  - the file letters under each board, at `y` = the board's bottom + 0.32;
  - the rank numbers 0–9 at `x = -0.3`, `y = 9.5 - rank`.
  - Tight spots: `N`'s caption shares the one-row gap under `QL6` with `QL6`'s file letters, and `KL1`'s caption
    shares the gap under `N` with `N`'s file letters. Neither stands above a letter, and a box check of every label
    in both views finds no overlap and no crowding (§8.2). Every cell's accessible name is its square name anyway.
- **`layout.zoomable: true`.** 18.5 × 10 is below the automatic zoom threshold (200 square units), but 64 small cells
  on a phone need the zoom buttons.

### 6.2 Later (not v1)

These need UI changes (package "ai-ui", not the core) and are optional:

- **Tall layout for portrait phones**: a file-aligned stack, `X` = file index (`z` = 0 … `e` = 5), boards stacked in
  height order with White's at the bottom and a 0.5 gap, each with its own rank labels; 6 × 18 units: `QL6` and `KL6`
  (ranks 9, 8) on rows 0–1, `B` (8 … 5) on 2.5–5.5, `N` (6 … 3) on 7–10, `W` (4 … 1) on 11.5–14.5, `QL1` and `KL1`
  (1, 0) on 16–17. It needs a layout chosen by screen shape (CORE-CHANGES item 38).
- **Level tints**: frame tints W blue-grey, N neutral grey, B warm grey and a thicker frame for attack boards. The
  `boards` frame has one style today; this needs a per-board style field and CSS.
- **Column twin**: hovering or selecting a square outlines the other square of the same column, with a small "also
  b3W" hint. This needs a new optional hook (for example `twins(sq) -> sq[]`) read by `useVariantGame` to add a mark.
- **Top view toggle**: the 6×10 flat map with void columns hatched, each two-level column drawn as a split cell.

### 6.3 Every layout

- **Black's view** rotates the drawing 180° (the core default for side 1).
- When a piece is picked up, every target is shown on every level (automatic: targets are marked per square).
- **Void columns** are never drawn, because they are not squares.

---

## 7. Test cases

Unless stated otherwise, positions add White K `d0KL1` and Black K `d9KL6`, both marked as having moved, and
castling is off. Every pawn in a test position counts as moved (no double step) unless it is marked **unmoved**, and
both sides count as having made their first move, except in the start position. "Classical moves" means one world's
classical generator output, with no check rule. White is to move unless a test says that Black plays.

In the quantum tests (TQ), "N is 50% on X and 50% on Y" means two worlds of equal weight that differ only in where that
piece stands (same piece id); two such ghosts are independent (four worlds of 25%) unless stated otherwise. The world
extras are those of §3 (`ep` -1, `started` true for both sides, castling rights only where a test gives them).
Outcomes are named as in the preview: **Certain** (one outcome, not rolled), **Quantum** / linked (one outcome, not
rolled, pieces in several places), or a **roll** with its Missed / Moved / Captured parts. Promotion keys use the
core's lowercase type ids (`=q`). Every expectation below was run on a prototype on the real core with the
CORE-CHANGES items in place (§8.2); TQ8-TQ10 fail on the core before Q1-Q3, as their notes say.

**T1. Squares.**
- Exactly 64 squares exist. The 20 two-square columns are the ones listed in §2.1.
- `b0`, `c0`, `z2` … `z7`, `e2` … `e7`, `b9` and `c9` are void.
- `a1` exists on `W` and `QL1`. `z1` exists only on `QL1`.

**T2. Start position.**
- White has exactly **20** classical moves:
  - `a1W-b3W`, `a1W-b3N`, `d1W-c3W`, `d1W-c3N`;
  - for each of `a`, `b`, `c` and `d`: `x2W-x3W`, `x2W-x3N`, `x2W-x4W`, `x2W-x4N`.
- The pieces on the attack boards (Rz0, Qa0, Kd0, Pz1, Pa1, Pd1, Pe1, Re0) have no moves. In particular `O-O` is
  **not** offered: castling is not allowed on a side's first move.
- Black has 20. Perft 2 = **400**. Perft 3 = **9128** (White's second move may be kingside castling).

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
- `c2W` holds its own pawn, `z3` and `c0` are void, and the other four knight vectors leave the map.
- In an otherwise empty position, `a1W` has exactly {`b3W`, `b3N`, `c2W`}.

**T7. Promotion depends on the file.**
- All pawns in T7 have moved (an unmoved White P on `a7B` could also double-step to `a9QL6` and promote).
- White P `b7B`: exactly `b7B-b8B=q/r/b/n`, which promotes.
- White P `a7B`: exactly `a7B-a8B` and `a7B-a8QL6`, with **no** promotion (`a9` still exists).
- White P `a8B`: `a8B-a9QL6=q/r/b/n`, which promotes.
- White P `z8QL6`: `z8QL6-z9QL6=q/r/b/n`.
- White P `d7B` with a Black N on `e8KL6`: `d7B-d8B`, `d7B-d8KL6` and `d7B-e8KL6` (a capture), none of which promotes.

**T8. Double step blocked by the other level.**
- White P `a2W` (unmoved), Black N `a3N`.
- **Expected:** the pawn's only move is `a2W-a3W`.
  - `a2W-a4W` and `a2W-a4N` are illegal, because column `a3` is occupied (on `N`).
  - `a2W-a3N` is illegal, because a pawn cannot capture straight ahead.

**T9. En passant on either level.**
- Position: White P `c5N`, Black P `b7B` (unmoved). Black plays `b7B-b5N`.
- **Expected:** White's moves with the `c5N` pawn are exactly `c5N-c6N`, `c5N-c6B`, `c5N-b6N` (ep) and `c5N-b6B`
  (ep).
- Both ep moves remove the pawn from `b5N`.
- If White plays anything else first, neither ep move is available afterwards.

**T10. Castling.**
- From the start position, no castling key exists on White's first move or on Black's first move.
- After `a2W-a3W a7B-a6B`, White's classical moves include `O-O` (from `d0KL1` to `e0KL1`), and no `O-O-O`: the queen
  is on `a0QL1`. After `O-O` the White K is on `e0KL1`, the White R is on `d0KL1`, and White has no castling move for
  the rest of the game. Black then has `O-O` (from `d9KL6` to `e9KL6`) likewise.
- Queenside: after `c2W-c3W a7B-a6B`, `b1W-c2W a6B-a5B`, `a0QL1-b1W c7B-c6B`, White has both `O-O` and `O-O-O`. After
  `O-O-O` the White K is on `a0QL1`, the rook from `z0QL1` is on `d0KL1`, the rook on `e0KL1` has not moved, and White
  has no castling move for the rest of the game. After Black's reply (for example `a5B-a4N`) the king's only move is
  `a0QL1-z0QL1`.
- Constructed: White K `d0KL1`, R `z0QL1`, R `e0KL1` with both rights, Black K `d9KL6`, Black N `a0QL1`. The king's
  moves are exactly `d0KL1-c1W`, `d0KL1-d1W`, `d0KL1-d1KL1`, `d0KL1-e1KL1` and `O-O`; `O-O-O` is not offered
  (castling never captures, and the king does not reach `a0QL1` by a normal move). Without the knight, and with any
  pieces on `a1W` and `a1QL1`, both castlings are offered.

**T11. Black promotion.**
- Black P `c2W`: `c2W-c1W=q/r/b/n`, which promotes.
- Black P `a2W`, with `a1W` and `a1QL1` empty: exactly `a2W-a1W` and `a2W-a1QL1`, with no promotion (`a0` still
  exists).
- Black P `a1W`: `a1W-a0QL1=q/r/b/n`.
- Black P `a1QL1`: `a1QL1-a0QL1=q/r/b/n`.

**T12. The king across levels.**
- White K `b4W` (instead of `d0KL1`), otherwise empty board: exactly 16 moves: {`a3W`, `a3N`, `a4W`, `a4N`,
  `a5N`, `a5B`, `b3W`, `b3N`, `b5N`, `b5B`, `c3W`, `c3N`, `c4W`, `c4N`, `c5N`, `c5B`}.
- `b4N` is not among them (that would be a vertical move).
- White K `d0KL1`, empty board: exactly {`c1W`, `d1W`, `d1KL1`, `e0KL1`, `e1KL1`}. `c0` is void.

**T13. Promotion reads the file the pawn arrives on, also for captures.**
- White P `c7B`, Black N `b8B` and N `d8KL6`. The pawn's moves are exactly:
  - `c7B-c8B=q/r/b/n`;
  - `c7B-b8B=q/r/b/n`, a capture that promotes (file `b` ends at rank 8);
  - `c7B-d8KL6`, a capture that does **not** promote (file `d` ends at rank 9).
- Black P `b2W`, White N `a1W` and N `c1W`, Black to move. The pawn's moves are exactly `b2W-b1W=q/r/b/n`,
  `b2W-c1W=q/r/b/n` and `b2W-a1W` (no promotion: file `a` ends at rank 0 for Black).

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
- `b7B-b8B=q` is a roll:
  - 50% **Moved**: a White queen stands 100% on `b8B`, and the knight is 100% on `c6N`.
  - 50% **Missed**: the pawn stays on `b7B` unpromoted, and the knight is 100% on `b8B`.

**TQ6. The double step rolls, then en passant is certain** (quantum).
- White P `c5N`. Black P `b7B` (unmoved). Black N is 50% on `b6N` and 50% on `a6B`.
- Black plays `b7B-b5N`. It is a roll:
  - 50% **Missed**: the knight is 100% on `b6N` and blocks the skipped column. There is no ep afterwards
    (`c5N-b6N` is still legal, but as an ordinary capture of the knight, not as en passant).
  - 50% **Moved**: the knight is 100% on `a6B`. Now White's `c5N-b6N` (ep) and `c5N-b6B` (ep) are both **Certain**
    (no roll), and each removes the pawn from `b5N`.

**TQ7. Castling next to ghosts, and a missed attack keeps the right** (quantum).
- Start position, except that White's `e1KL1` pawn is gone, a Black N is 50% on `e1KL1` and 50% on `c3N`, and both
  sides have already made their first move (castling rights intact).
  - `O-O` is offered and previews as **Certain**: no roll and no link. `O-O-O` is not offered (the queen stands on
    `a0QL1`).
- Different position: White K `d0KL1` and R `e0KL1`, both unmoved, with the right intact. A Black N is 50% on `c1W`
  and 50% on `b5N`.
  - Black plays `c1W-e0KL1`. It is a **roll**, because the target holds a piece:
    - 50% **Captured**: the rook is gone, and White's castling right is lost.
    - 50% **Missed**: the knight is 100% on `b5N`. The rook never left `e0KL1`, so it is still 100% home and the
      right survives: White's `O-O` is legal and **Certain**.

**TQ8. Queenside castling past a possible ghost** (quantum).
- White K `d0KL1` and R `z0QL1`, both unmoved, with the queenside right intact and White's first move already
  played. Black K `d9KL6`. A Black N is 50% on `a0QL1` and 50% on `b2W`.
- **Expected:** `O-O-O` is **illegal** (not offered): `a0QL1` is occupied in one world, and castling is legal only
  when it is available in every world (§4.7). It is never rolled. (The core before CORE-CHANGES Q2 rolled it, 50%
  Missed / 50% Moved.)
- The right survives. Add a White P `c2W`; White plays `c2W-c3W`, Black measures `?a0QL1`:
  - result `b2W` (the knight is 100% on `b2W`): `O-O-O` is legal and **Certain**; after it the king is on `a0QL1`,
    the rook on `d0KL1`, `z0QL1` is empty and White has no castling right left;
  - result `a0QL1`: `O-O-O` is still illegal.

**TQ9. En passant ends after one ply in every world** (quantum; lead decision D2).
- (a) Measure turns. White P `c5N`, White N 50% `a1W` / 50% `c2W`; Black P `b7B` (unmoved), Black N 50% `a8B` / 50%
  `d8B` (four worlds). Black plays `b7B-b5N`: **Certain** (the skipped column `b6` is empty in every world). Right
  after it, `c5N-b6N` and `c5N-b6B` are certain captures.
  - Instead, White measures `?a1W` and Black then measures `?a8B` (any results). **Expected:** `c5N-b6N` and
    `c5N-b6B` are **illegal**. (The core before Q1: legal and certain, a full turn late, because a Measure left every
    world unchanged. It needs Q1 and the variant's `applyMiss`.)
- (b) Missed worlds. White P `c5N`, R `a1W`; Black P `b7B` (unmoved), Black N 50% `a4W` / 50% `c7B`. Black plays
  `b7B-b5N` (**Certain**). White plays `a1W-a6N`: linked, no roll (blocked on `a4` where the knight is on `a4W`).
  Black plays `c7B-d5B`: linked, no roll (it misses where the knight is on `a4W`).
  - **Expected:** `c5N-b6N` is **illegal**. (The core before Q1: a roll, 50% Missed / 50% Captured: en passant a
    turn late in the world where both moves missed.)

**TQ10. A partial slide costs the castling right for good** (quantum).
- White K `d0KL1`, R `e0KL1` with the kingside right. Black N 50% `e1KL1` / 50% `b5N`.
- `O-O` is legal and **Certain**. White plays `e0KL1-e8KL6` instead: linked, no roll. Where the knight is on
  `e1KL1` the rook is blocked; otherwise it flies across the void `e2`–`e7`. The rook is 50% `e0KL1` / 50% `e8KL6`.
- **Expected:** after Black's reply (for example `d9KL6-d8B`), `O-O` is **illegal**. White measures the rook `?e0KL1`
  and finds it at home (100% `e0KL1`); after Black's next move (`d8B-d9KL6`) `O-O` is still illegal: the right is
  gone in every world. (The core before Q2 and Q3: a roll after the slide, and legal again after the measurement. The
  second part needs Q3 and the variant's `unifyWorlds`.)

**TQ11. A level split merges onto a third square** (quantum).
- White N `a1W`. White splits `a1W-b3W|b3N`; Black plays `d9KL6-d8B`.
- **Expected:** the knight's merges are exactly `b3W|b3N-t` for the ten squares `t` in {`a1W`, `a1QL1`, `c1W`, `d2W`,
  `d4W`, `d4N`, `a5N`, `a5B`, `c5N`, `c5B`}: both parts stand in column `b3`, so they reach the same squares. There is
  no merge onto `b3W` or `b3N` (vertical).
- `b3W|b3N-c5N` is **Certain**: the knight is 100% on `c5N`, and White's budget is back to 1.

**TQ12. The king lands per square; king danger counts both levels** (quantum).
- (a) Black N 50% `d1W` / 50% `c5B`. `d0KL1-d1KL1` is **Certain** (the ghost on the other level of column `d1` does
  not matter). `d0KL1-d1W` is a roll: 50% **Moved**, 50% **Captured**.
- (b) Black R `d8B`; White N 50% `d4N` / 50% `a3W`. Black to move.
  - White's king danger is **50%**: where the knight stands on `d4N` it blocks the d-file (column `d4`), otherwise
    the rook's lane `d7`–`d1` is empty on every level.
  - Black's `d8B-d0KL1` is a roll: 50% **Captured** (Black wins, reason `king`), 50% **Missed** (the knight is 100%
    on `d4N`, the rook stays on `d8B`).

**TQ13. A pawn capture probes one level** (quantum).
- White P `c2W` (unmoved). Black N is 50% on `b3W` and 50% on `b3N`.
- `c2W-b3W` is a roll:
  - 50% **Captured**: the pawn is on `b3W` and the knight is gone;
  - 50% **Missed**: the pawn stays on `c2W` (still unmoved), and the knight is 100% on `b3N`.
- `c2W-b3N` gives the mirror result.
- `c2W-c3W`, `c2W-c3N`, `c2W-c4W` and `c2W-c4N` are **Certain**: column `c3` is empty in both worlds.

**TQ14. A double step lands per square, and en passant stays certain next to a ghost** (quantum).
- White P `c5N`. Black P `b7B` (unmoved). A White N is 50% on `b5B` and 50% on `a3W`. Black to move.
- `b7B-b5N` is **Certain**: the skipped column `b6` is empty in both worlds, and the knight on the other level of the
  target column does not matter.
- `b7B-b5B` is a roll: 50% **Missed** (the knight stands on `b5B`, and a pawn never captures straight ahead), 50%
  **Moved**.
- After `b7B-b5N`, White's `c5N-b6N` (ep) and `c5N-b6B` (ep) are both **Certain**. Each removes the pawn from `b5N`,
  and the knight stays 50% `b5B` / 50% `a3W`.

**F1. Fuzz invariants** (in `trid.spec.js`, besides the shared `fuzz.spec.js`).
- Play seeded random games with splits, merges and measures. After every move, `x` (`moved`, `ep`, `epVictim`,
  `castle`, `started`) has the same JSON text in every world.
- No outcome of a played move has a `solid:` or `end:` note (§4 item 11).
- On the prototype: 140 games, 18,560 plies, up to 64 worlds; neither ever happened.

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity. The rule pages were read this time (the research could only see search
extracts): Meder's Tournament Rules in English and German including the start diagram, Meder's FAQ, the W3DCF laws,
Bartmess's own notation and sample-game page, and Roth's FS5 summary. The Chess Variant Pages rules page sits behind
a browser check and was read through a search extract only. All classical cases of §7 were re-run with an
independent generator written for this review (`handoff/tmp/trid-rules/gen.py` and `tests.py`, `tests2.py`; not
committed) and cross-checked against `handoff/tools/trid.py`. T1, T3–T9, T11 and T12 give exactly the stated
results; T2 and T10 changed with the castling rules (item 3), and perft 2 = 400, perft 3 = 9128 agree between both
generators. Board, square names, the 64 squares, the 20 two-level columns, the 16 void columns, the square colours
(`a1` dark, the attack boards matching the corners they overhang) and every setup square match Meder's diagram.

Changes:

1. **Base rule set (header, §1).** The spec said it follows Bartmess's Federation Standard (FS) and quoted FS as
   "blocked … on ANY level". That quote could not be found in any Bartmess text. The FS booklet is not online, and
   Bartmess's own sample game contradicts it: in his notation 7…Qb9-b4(4) passes Black's pawns on b6(4) and b5(4),
   and 16.Qe3xBb3(4) passes White's knight on c3(2); both are legal only under FS's path rule (Roth: the piece
   travels on the "highest path"). The any-level block is Meder art. 3.1(c), chosen deliberately "so the rules would
   not become too complex" (FAQ Q3, which also notes that other rule sets differ). The spec now names Meder's
   Tournament Rules as the base, keeps the any-level block, and lists FS's path rule as not adopted. The credit line
   in the header now credits Meder, building on Bartmess. Sources: https://meder.spacechess.org/3dschach/chess3d.htm,
   https://meder.spacechess.org/3dschach/faq.htm, http://www.grigor.org/tactical.htm,
   https://www.thedance.net/~roth/TECHBLOG/chess.html.
2. **Source table (§1).** The W3DCF row misquoted en passant ("on any level" is not in the W3DCF text; that is Meder
   art. 3.4(d)) and did not say that W3DCF is a different game: its setup puts bishops, king and queen on the main
   level and rooks and knights on the attack boards, and it changes levels along a path. It is now cited only for
   promotion, with the actual wording. The Roth row now describes what Roth actually gives (FS5 path rule, both
   castlings, the optional rook-pawn move) instead of calling it a house rule set that was rejected for en passant.
   The Chess Variant Pages row quotes the search extract. Sources: http://w3dcf.com/information/laws, Roth as above,
   https://www.chessvariants.com/3d.dir/startrek.html (search extract).
3. **Castling (§1, §2.5, §3, §4.7, §5, §7 T2, T10, TQ7, new TQ8).** "Kingside only, because the sources disagree on
   where king and rook end up" was not correct: Meder art. 3.5 and Roth's FS5 agree that queenside castling puts the
   king on the queen's home square (`a0QL1`) and the queen's rook on the king's home square (`d0KL1`), and Bartmess
   uses `O-O-O` in his notation. The objection that the king would have to cross the void `b0`/`c0` is answered by
   Meder FAQ Q9 (non-existent squares are crossed and cannot be attacked). Added queenside castling with key
   `d0KL1-a0QL1` (`d9KL6-a9QL6`), needing `a0QL1` empty. Also added Meder's "castling is illegal before move 2"
   (German original: "vor dem 2. Zug"), so neither side may castle on its first move. The spec had said "legal from
   move 1". Consequences: White and Black have 20 first moves (was 21), perft 2 = 400 (was 441), perft 3 = 9128.
   §4.7 now says when queenside castling is rolled (a ghost may stand on `a0QL1`). Sources: Meder art. 3.5 (English
   and https://meder.spacechess.org/3dschach/schach3d.htm), FAQ Q9, Roth, http://www.grigor.org/tactical.htm.
4. **Win and draw rules (§2.6).** The quantum part promised a `king_trapped` win, a bare-kings draw and a repetition
   draw "as in the classic game". The variants core has none of these: it ends a game by king capture (`king`), 100
   quiet plies (`quiet`), 600 plies (`moveLimit`) or no legal move (`noMoves`), as `docs/variants.md` says. The
   classical part now lists Meder's actual draws (stalemate, dead position, claimed threefold repetition and 50-move
   rule, agreement). In §3, the custom `worldResult` with reason `king_captured` is replaced by the core default
   (reason `king`, which already has a translated text). Sources: `src/variants/core/quantum.js`,
   `src/variants/core/variant.js`, `docs/variants.md`, Meder art. 1.2, 5, 9.
5. **Promotion attribution (§1, §2.4).** "Matches FS: a pawn under an attack board does not promote" is now
   attributed to Meder art. 3.4(e)(ii)–(iii) and the W3DCF wording; the table itself was already correct. Added that
   promotion is compulsory and not limited to captured pieces (Meder art. 3.4(e)(i)). Sources: Meder, W3DCF as above.
6. **Test positions (§7 preamble, T7, T8, T12).** The tests did not say whether pawns in constructed positions have
   moved, but several results depend on it: an unmoved White pawn on `a7B` could double-step to `a9QL6` and promote
   (T7), `c5N` could double-step to `c7B` (T9), and an unmoved Black pawn on `a2W` could reach `a0QL1` (T11). The
   preamble now says every pawn has moved unless marked unmoved, and both sides have made their first move. T8 now
   says "the pawn's only move" (the White king also has moves). T12 says the king on `b4W` replaces the one on `d0KL1`.
7. **T6 wording.** From `a1W`, four knight vectors leave the 6×10 map, not five (8 vectors: `b3`, `c2`, void `z3`,
   void `c0`, and four off the map).
8. **Section references to the source (§2.1, §2.2, §2.3).** Added the article numbers for blocking and void
   squares (Meder art. 2.8, 3.1(c), FAQ Q2) and the setup source (Meder art. 2.7, Bartmess's sample game). The
   square names were called "as in Meder/FS"; they are Meder's (appendix E). Bartmess's own notation uses files a–f
   and numbered levels (`e0(3)` for White's king), so §2.1 now says so. Sources: Meder appendix E,
   http://www.grigor.org/tactical.htm.
9. **Castling-rights mechanics (§3), flagged, not redesigned.** The spec said the core clears castling rights "in
   all worlds, as it already does for classic castling". The variants core (`orthodoxAfterMove`) clears them per
   world only. Without a state-level rule, a world where the rook was captured by an enemy piece now standing on
   `e0KL1` would make `d0KL1-e0KL1` an ordinary king capture there while it is castling in another world: one key,
   two meanings. The text now says so; the "offer only when 100% home in every world" rule of §4.7 avoids it, and how
   to implement it is left to the lead and reviewer 2.
10. **En passant timing in missed worlds (§4.6), flagged.** The classical rule allows en passant only on the very
    next move. The core leaves a world where a move missed unchanged, so its `x.ep` marker survives; if the reply
    and the following move both miss in some world, a pawn could capture en passant a turn late there. This affects
    every variant with en passant and belongs to the core; noted in §4.6. Source: `src/variants/core/quantum.js`
    (`perWorldMove`), `src/variants/core/orthodox.js` (`orthodoxAfterMove`).
11. **UI name and summary (header, §3), open question.** The spec proposed "Tri-D Chess" and a summary without
    franchise names, but the fixed catalog (`src/variants/catalog.js`, not to be edited) says "Tri-Dimensional chess"
    and "…as seen on the starship Enterprise". The spec now points to the catalog. Whether the catalog summary
    should drop the franchise reference (the spec's trademark concern) is for the lead to decide.

Not changed after checking: the square naming and parsing, the 6×10 flat map with `z` and `e` files, the level
ranks (W 1–4, N 3–6, B 5–8, attack boards 0–1 and 8–9), the height order (Roth: main boards at elevations 2, 4, 6,
White's attack boards at 3, Black's at 7), every setup square, the projection rule and level choice (Meder art.
3.1(a)), no vertical moves (3.1(d)), no move ending on a void square (3.1(e)), the pawn step, double step (3.4(b),
skipped column empty on every level) and diagonal capture, en passant onto either level (3.4(d)), the promotion
table (3.4(e)(ii)), the kingside swap (3.5), White moving first (1.1), and the player-facing text apart from
castling. Not adopted and now listed in §1: FS5's optional rook-pawn sideways move, which would free the otherwise
boxed-in `z`/`e` pawns (open question 4 of the research) if the lead wants it later.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency. Two passes on 2026-09-25. The first ran before the core
changes of `handoff/CORE-CHANGES.md` had landed. The second ran after the core packages had put most of the plan
(among them Q1-Q3, W1, W3-W5 and U4) into `src/variants/core` (working tree, not yet committed). The scripts are in
`handoff/tmp/critic-trid/` (not committed):

- `proto.mjs` is a prototype of §3 on the real core: the `generate` hook, the world extras, `applyMiss`, `unifyWorlds`
  and the wide-layout cells of §6. `lib.mjs` holds the helpers.
- `classical.mjs` runs T1-T12 and perft (39 checks); `quantum.mjs`, `extra.mjs`, `extra2.mjs` and `final.mjs` run
  TQ1-TQ12; `new2.mjs` runs T13, TQ13 and TQ14.
- `fuzz2.mjs` plays seeded random games and checks F1 (`fuzz.mjs` checked only the chosen outcome's notes). `ai.mjs`
  runs the computer player. `layout.mjs` and `layout2.mjs` check the §6.1 geometry and every label box in both views.
  `mob.mjs` computes the mobility averages, and `cm.mjs` / `cm2.mjs` run the orthodox castling helper on this
  topology.
- First pass only: `patched/quantum.js`, a copy of the core of that time that emulated Q1-Q3 (`CORE=patched`). The
  second pass ran everything on the real core, without it.

Checked and correct as written (no change), on the real core of the second pass:

- T1-T12 and perft 20 / 400 / 9128. They agree with reviewer 1's two Python generators.
- TQ1-TQ12: every outcome, probability and resulting position. In the first pass, TQ8-TQ10 failed on the core of
  that time exactly as their notes say, and passed on the emulation.
- §4 items 1-5 and 9 need no Tri-D code in the quantum layer. "Landing is per square" is the core's own `isMeasured`
  test (it reads the target square only). A level split's lane block, the level merge and the pawn probes all follow
  from `generate`.
- The hooks as built do what §3 expects:
  - `applyMiss(b, action, side, { hit })` runs on every idle world (missed worlds, idle split children, missed merge
    worlds, every world of a Measure), before the budget-fallback check;
  - `unifyWorlds(bs, mover)` runs first in `stateAfter`, also in the computer's light mode;
  - `clearEnPassant` only compares `x.ep` and `x.epVictim` with -1, so a column index in `x.ep` works;
  - `unifyCastling` intersects `x.castle` by all six fields;
  - `isCertain` makes the kinds `castle` and `ep` certain-only;
  - `placeCastling` (W1) does the kingside swap;
  - `aiSplits` (U4) caps the computer's split candidates.
- The UI: clicking the king and then its own rook's square matches the single move with that `from` and `to`
  (`O-O`), and the target ring is drawn on the rook's square. Nothing in `src/variantplay` or `ai.js` reads `x.ep`,
  `x.castle` or the movement descriptors.
- The computer player takes 4-12 ms per move at the start (easy, normal, hard) and takes a hanging rook. A queen
  alone on `b3N` has 378 split pairs.
- The empty-board mobility averages of §3 (R 16.75, Q 25.88, B 9.13, N 6.50).

Changes, first pass:

1. **Castling keys (§2.5, §3, §4.7, §7 T2, T10, TQ7, TQ8).** The key was the king's `from-to` (`d0KL1-e0KL1`,
   `d0KL1-a0QL1`). The draft plan asked for castling keys that never coincide with an ordinary move key, and the old
   argument that they cannot collide relied on state-level rights that the core did not have yet. The keys are now
   `O-O` / `O-O-O` with `from` = the king's square and `to` = `e0KL1` or `a0QL1`. The board still plays castling as a
   king move: `useVariantGame` matches a move by `from` and `to`. (The reason changed in the second pass, item 12.)
2. **Queenside castling past a possible ghost (§4.7, TQ8).** It was a roll (castle where `a0QL1` is empty, miss
   elsewhere). Lead decision D1 and docs/rules.md section 5 say castling never rolls and a ghost part on a square it
   needs blocks it. `O-O-O` is now illegal while `a0QL1` may be occupied, and the right survives. Checked: the core
   of the first pass rolled it 50/50; the Q2 emulation, and now the real core, make it illegal; after Black measures
   its knight on `b2W`, `O-O-O` is legal and certain (new follow-up in TQ8).
3. **§3 rewritten to the hooks as built.**
   - `movegen: 'projected'` in `core/movegen.js` became the variant's `generate(w, side)` (CORE-CHANGES item 36). The
     pseudo-code now includes the pawn extras and castling, because with `generate` the core calls neither
     `extraMoves` nor `filterMoves`.
   - `layered({...})` does not exist. The topology is now `makeTopology` with `[x, y, h]` coordinates, a column table
     and a fixed index order (the core writes split and merge codes in index order).
   - `pieceTypes` became `types` with empty `moves`. Flat descriptors would give `attacks`, `givesCheck` and
     `linesOf` wrong same-level lanes on this topology. The `orient` and `enemies` entries (defaults suffice) and
     `worldResult: none` (the core default) were dropped.
   - `afterMove(world, move, info)` became the core's `afterMove(next, m, prev)`.
   - The world extras got exact JSON shapes: `moved` (sorted, because worlds are compared by their JSON), `ep` as the
     skipped column's index plus `epVictim` (so the core's `clearEnPassant` works), `castle` in the orthodox array
     shape (so `unifyCastling` works), and `started`.
   - Promotion keys use lowercase type ids (`b7B-b8B=q`), as `moveKey` writes them.
   - The AI's split cap is now the generic CORE-CHANGES U4.
   - `evaluate` terms: "after move 12" cannot be seen by `evaluate(w, side)`, which gets one world and no move
     number, so it became a condition on the world (the pawn in front of the corner rook still there). "+5 per
     attacked square" is now counted from `generate`, never from `world.attacks`.
   - A warning against `castlingMoves` was added here; W3 made it outdated (second pass, item 13).
4. **Castling rights and en passant expiry (§3, §4.6, §4.7).** The two implementation notes that §8.1 (items 9 and
   10) left to this review are settled with the core hooks:
   - per-world clearing in `afterMove` plus `unifyWorlds: (bs) => unifyCastling(bs)` (Q3 + W5);
   - `applyMiss: (b) => clearEnPassant(b)` (Q1 + W4), plus the certain-only `ep` kind (Q2).
   - In the first-pass fuzz run, the core of that time left the extras different between worlds in 30 of 4,666
     states (stale en passant squares and per-world rights). With the emulation, and now on the real core, this never
     happens.
5. **§4 wording.** Item 1: a link needs a rider and a certainly empty target square, and the budget fallback applies.
   Item 6: an en-passant key cannot coincide with an ordinary capture key in another world. Item 10: king danger
   comes from the enemy's `generate`, so it counts both levels. Item 12: identical extras keep the worlds at 64 or
   fewer. Test references were added to every item.
6. **§5 rules card.** It is now the eight entries that `rules()` returns (IMPLEMENTING.md: 3-8 short sentences), with
   "from your second move on" for the first-move rule and a sentence that a ghost on the other level of the target
   square does not matter (TQ2, TQ12). Castling past ghosts is covered by the shared rules text (CORE-CHANGES U7).
7. **§6 layout, fitted to the layout API of `VariantBoard.vue`.** The wide layout is the only v1 layout (CORE-CHANGES
   item 38: one layout plus zoom). The pins are `lines` with exact coordinates, because there is no dot primitive.
   `zoomable: true`, because 18.5 × 10 = 185 is under the automatic threshold of 200. Level tints, the thicker
   attack-board frame, the column-twin hint, the tall layout and the top view moved to "Later (not v1)", because
   they need UI changes. No two boards overlap.
8. **§7 preamble.** It says who moves, how a ghost maps to worlds, which world extras a test starts with, how
   outcomes are named, and the key case. T7, T11 and TQ5 use `=q/r/b/n`. In T10, the check "the king's only move is
   `a0QL1-z0QL1`" now comes after Black's reply, so that it is a check of White's legal moves.
9. **TQ6.** In the Missed outcome, `c5N-b6N` stays legal as an ordinary capture of the knight on `b6N`, not as en
   passant.
10. **New tests TQ9-TQ12.** En passant ends after one ply in every world (Measure turns, missed worlds); a partial
    slide costs the castling right for good; a level split merges onto any of its ten common squares, never
    vertically; a king step lands per square, and king danger counts both levels.

Changes, second pass (the core with the CORE-CHANGES items in place):

11. **"Planned" became "in the core" (§3 intro, §7 preamble, TQ8-TQ10 notes).** The notes now say what the core did
    before Q1-Q3. The §3 list also names W1 and W3, which the variant relies on.
12. **Castling-key reason (§2.5, §3 "Move keys").** CORE-CHANGES Q2, as revised by its own review, no longer asks
    for castling keys that differ from ordinary keys: its strict rule (a certain-only key is legal only when every
    world generates it as a certain move) makes the king's `from-to` safe too. The keys stay `O-O` / `O-O-O` (the
    orthodox keys that `castlingMoves` emits, and Bartmess's notation); the spec now gives that reason instead.
13. **`castlingMoves` (§3).** The spec said that on this topology it returns square -1 and blocks queenside castling.
    With W3's `between` it gives exactly `O-O` (the swap) and `O-O-O` (only `a0QL1` must be empty), also with pieces
    on `a1W` and `a1QL1` (`cm2.mjs`). The pseudo-code now calls it behind the `x.started` guard, because the helper
    does not know the first-move rule.
14. **World extras (§3).** Setup creates every field, and the hooks only replace values. `worldKey` compares the JSON
    text of `x`, key order included, so a field added in some worlds only would keep identical positions apart (more
    worlds, and F1 fails).
15. **`evaluate` and promotion (§3).** Each suggested `evaluate` term is own minus enemy: `ai.js` adds
    `evaluate(b, side)` to own-minus-enemy material, so a one-sided term would ignore the opponent's activity. §3
    also says that the promotion zone reads the target's file (T13).
16. **§4.** Item 2 names the own-part exception (a part moving onto another part of the same piece joins it, Q14).
    Item 4 says why level parts share their targets (moves depend only on the column). Item 5 covers pawn captures
    and the target column's other level. §3's "a split in the half that left" was wrong, because both halves leave;
    it now says "wherever the rook left". Item 11 now explains why neither safety net can fire, and gives this pass's
    fuzz numbers.
17. **§5 rules card.** "Square" meant two things: `b3N` in entry 2, the map square in entries 3, 4 and 8. Entry 2 now
    defines the map square, and entries 3, 4 and 8 use it. Entry 7 now says that the king and rook must not have
    moved "in any possibility", as in docs/rules.md 5 (a partial slide costs the right); the shared rules text only
    says that castling must be possible in every possibility.
18. **§6.1 labels.** `VariantBoard.vue` draws `boards[].label` above the *turned* board, while `layout.labels` turn
    with the drawing. So in Black's view each board's file letters landed in its caption's row: "a QL1 z" with gaps
    of 0.08 on all four attack boards, and "d c W b a" on the main boards. The captions are now `labels` 0.32 above
    each board, and the `boards` entries have no `label`, as raumschach.md does for the same reason. `layout2.mjs`
    finds no overlap and no crowding in either view (with board labels: 8 crowded pairs in Black's view).
19. **New tests.** T13: promotion depends on the file the pawn arrives on, also for captures and for Black. TQ13: a
    pawn capture probes one level. TQ14: a double step lands per square next to a ghost on the target column, and en
    passant stays certain. F1: the fuzz invariants (identical `x`, no `solid:` or `end:` note). All pass on the real
    core.
20. **Numbers (§3 speed, §4 item 11, F1).** 140 seeded random games: 18,560 plies with 3,932 splits (415 of them
    level splits), 1,890 merges, 685 measures, 267 castlings, 6 en passant captures and 19 promotions. At most 64
    worlds (the spec said 48), budget at most 8, about 40-50 ms per 60 plies.

Core changes needed:

- **None.** The variant depends on these CORE-CHANGES items, which are all in the core now, with exactly these
  semantics (checked in the second pass):
  - **Q1** `applyMiss(b, action, side, info)`: called on every idle world, before the budget-fallback check. Idle
    worlds are the worlds where a move key is not generated, idle split children, missed merge worlds and every world
    of a Measure. It must return a world and must not mutate `b`.
  - **W4** `clearEnPassant(b)`: returns `b` when `x.ep` and `x.epVictim` are both -1 (or absent), otherwise a copy
    with both -1. The Tri-D `x.ep` is a column index rather than a square; the helper only compares it with -1.
  - **Q2**: moves of kind `castle` and `ep` are certain. A key whose move is certain in some world is legal only if
    every world generates it as a certain move, and it is then never rolled.
  - **Q3** `unifyWorlds(bs, mover)`: called at the start of `stateAfter` (also in light mode). **W5**
    `unifyCastling(bs)` keeps an `x.castle` entry only if every world has it, compared by `flag`, `side`, `king`,
    `rook`, `kingTo` and `rookTo`.
  - **W1**: `applyClassical` lifts king and rook off the board first, then puts the king on `extra.kingTo ?? m.to`
    and the rook on `extra.rook.to`, including the swap where the king lands on the rook's square.
  - **W3**: `castlingMoves` with a `between` that works in any number of coordinates and leaves out squares that do
    not exist.
  - **U4**: the computer player's cap on split candidates.
- **UI, optional, not core** (package "ai-ui"): a per-board frame style (level tints), a `twins(sq)` hook for the
  column-twin hint, and a layout chosen by screen shape (item 38).
