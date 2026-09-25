# 5D Chess With Multiverse Time Travel: the pieces

This note covers how every piece moves in the official game "5D Chess With Multiverse Time Travel" (Thunkspace,
2020): the four axes, one table of vectors per piece, the special moves, and which pieces, board sizes and setups
each official variant uses. It ends with notes for the quantum implementation (section 8) and the uncertain points
(section 9).

Convention used throughout: a vector is **(dx, dy, dT, dL)**.

- x is the file (a = 0). y is the rank (1 = 0).
- T is time, counted in **full turns** (section 1.2).
- L is the timeline.
- Vectors are written for **White**. For Black, flip the sign of **dy and dL**, and only those (section 1.5).

---

## 0. Key facts

1. **Four axes.**
   - x and y are the physical axes, on the board.
   - T and L are the superphysical axes, across boards.
   - One step along any axis is one unit of distance: one square, one turn or one timeline.
2. **One step in time is one full turn.** A move by dT = −1 goes from the board where you are to move at turn T to
   the board where **you** are to move at turn T−1. The opponent's boards in between are skipped: the step covers two
   half-turn boards.
3. **Every piece moves only between boards where its own colour is to move.** It leaves from a playable board: the
   latest board of its timeline, with its colour to move. It lands on any existing board with that same colour to
   move: a past board, another timeline's present board, or another timeline's board further ahead in time.
4. **Pieces other than pawns and brawns are fully symmetric in the four axes.**

   | Piece | Letter | Moves |
   |---|---|---|
   | Rook | R | Rides along 1 axis. |
   | Bishop | B | Rides along exactly 2 axes, the same distance on each. |
   | Unicorn | U | Rides along exactly 3 axes. |
   | Dragon | D | Rides along exactly 4 axes. |
   | Queen | Q | Rides along any number of axes. |
   | Royal queen | Y | Moves like the queen, but is royal. |
   | Princess | S | Rides along 1 or 2 axes (rook plus bishop). |
   | King | K | One step along any number of axes. |
   | Common king | C | Moves like the king, but is **not** royal and cannot castle. |
   | Knight | N | Leaps 2 along one axis and 1 along another. |

   The vector counts are 8 (rook), 24 (bishop), 32 (unicorn), 16 (dragon), 80 (queen), 32 (princess), 80 (king) and
   48 (knight).
5. **The pawn** (P) has two "forward" axes: +y (towards the enemy's back rank) and −L for White (towards the
   timelines Black creates). For Black they are −y and +L.
   - **Quiet moves.** The pawn steps 1 forward along y, or 1 forward along L at the same T. It may make a 2-step along
     either axis if it has not moved. Both squares must be empty.
   - **Captures.** It captures diagonally forward, either (±1, +1, 0, 0) on its own board, or (0, 0, ±1, −1): one
     timeline forward and one turn earlier or later.
   - **En passant** exists **only on one board**.
   - **Promotion.** It promotes on its last rank, **to a queen only** in the official game.
6. **The brawn** (W) moves and promotes like a pawn. It also captures one step along **exactly two axes**, provided
   the step goes forward along at least one axis and backward along none. x and T count as "sideways", never as
   backward. That gives 4 extra captures: (±1, 0, 0, −1), (0, +1, 0, −1) and (0, +1, −1, 0).
7. **Castling** happens only on one board. The king and the rook must both be unmoved. The check test counts only
   attacks on that board ("physically in check").
8. **Official piece sets.**
   - The 8×8 Standard family uses P N B R Q K. Princess replaces Q with S. Reversed Royalty uses Y and C.
   - U, D, W, C and Y appear in the 5×5, 6×6 and 7×7 Focused and Misc variants (section 7.3).
   - Board sizes range from 8×8 down to 1×1.

---

## 1. Sources

The rule pages usually cited could not be fetched from this environment, because the egress proxy blocks them:
Wikipedia, the 5D Chess fandom wiki, 5dchess.wiki.gg, the Steam guides and their mirrors (steamsolo.com,
gameplay.tips), handwiki, namu.wiki, TV Tropes and speedrun.com. Their content was used **only as search-engine
excerpts**; those rows are marked "excerpt" in the table.

Every movement vector below is checked against **three independent open-source implementations**, whose code I read
in full for piece movement. It is also checked against **decoded moves from real games**: games of the official game
transcribed in 5dpgn, in section 6.

| # | Source | What it gave |
|---|---|---|
| S1 | **5d-chess-js** v1.2.1 (Alexbay218, AGPL; the npm package, read locally from `5dsrc/package/dist/5d-chess.js`, with its source and tests in `5dsrc/5d-chess-js-src/src/`). It says it implements the official rules. | Everything below; see the notes after this table. |
| S2 | **ftxi/5dchess_engine** (C++, read locally at `5dsrc/5dchess_engine/src/core/`) | An independent check of all piece geometry; see the notes after this table. |
| S3 | **AquaBaby / Slavrick 5dChessGUI** (Java, `5dsrc/5dChessGUI/src/engine/`) | A third check; see the notes after this table. |
| S4 | **adri326/5dchess-notation** (Shad's 5dpgn): `README.md`, `parsers/game.js`, `test/*.5dpgn` | See the notes after this table. |
| S5 | **adri326/5dchess-variants** `base/…` and `community/…` (5DFEN of the base-game variants) | Setups with unmoved markers; brawn and royalty READMEs. Its Half Reflected FEN conflicts with S1 and S4 (section 9). |
| S6 | Wikipedia, "5D Chess with Multiverse Time Travel" (excerpt) | "Pawns … forwards through the L-dimension (towards timelines created by the opponent — decreasing L for white, increasing L for black)". "Castling is permitted but not generalized across turns and timelines, nor is the prohibition of castling out of or through check". En passant on one board only. Promotion to queen only. The brawn definition "exactly two axes if it moves forward along at least one axis and does not move backward along any axis". Unicorn and dragon: "exactly three / four axes equally". |
| S7 | 5D Chess fandom wiki, pages *Pieces* and *Variants* (excerpt) | "A pawn that has not yet moved can move 2 spaces … (in either direction along which it could move 1)". "Castling is impossible if the king is (physically) in check or if the square that is traversed is (physically) in check". En passant involving more than one board is not possible. "The *Promotions* field is not supported by the base game and in the base game, pawns always promote to queens, even in [Standard - Princess]". |
| S8 | Steam guides "A Guide on Pieces Moving Through Time and Timelines" (id 2176513845) and "All Variants Explained (With Pictures)" (id 2223803379) (excerpt) | White pawns move "UP" through timelines (White at the bottom), Black "DOWN". Unmoved pawns may move 2 timelines. Knight across boards: "1 dimension → 2 squares away, 2 dimensions → 1 square away, 3 dimensions → same square". Variant piece counts, for example Excessive = "7 Pawns, 2 Bishops, 2 Knights, 4 Rooks, 1 Dragon, 1 Unicorn, 1 Queen & 3 Kings per side". Timeline Formations = "5 Pawns & 1 King per side … Kings start on the same rank as their pawns but in a different timeline". |
| S9 | chess.com forum "I've got two questions about 5d chess…" (excerpt) | Community piece values: P 1, R 3, N 5, B 5, Q 15. |

Notes on S1:

- `piece.js` / `exports.movePos` holds the leapers (knight, king, common king).
- `exports.moveVecs` holds the riders (bishop, rook, queen, royal queen, princess, unicorn, dragon). Its vectors are
  written as [dL, dT, dy, dx], and T is multiplied by 2 in half-turn indices.
- `exports.moves` holds the pawn and brawn code, en passant and castling.
- `exports.timelineMove` handles L arithmetic, including the −0/+0 case.
- `board.js` holds the variant setups; `mate.js` / `checks` defines royalty (K and Y).
- The tests `brawn.test.js`, `castling.test.js`, `enpassant.test.js` and `promotion.test.js` were also read.

Notes on S2:

- `piece.h` defines the piece set and the unmoved markers for P, W, K and R only.
- `move_geometry.h` and `multiverse_base.cpp` (`gen_physical_moves_impl`, `gen_moves_impl`, `gen_compound_moves`)
  hold the move generation: rook = orthogonal, bishop = orthogonal × orthogonal compound, unicorn = orthogonal ×
  diagonal, dragon = diagonal × diagonal.
- The pawn uses `vec4(0,0,0,-1)` for White and `+1` for Black.
- Brawn capture tables are in the same files. `variants.cpp` has four presets; `promotion_header.cpp` sets queen as
  the default promotion.
- Caveat: the black branch has copy-paste bugs (`PAWN_UW` inside the black code, and a brawn table with dy = +1 for
  Black), so it is used only for the White geometry.

Notes on S3:

- `MoveNotation.java` holds the pawn and brawn movement and attack tables in (x, y, T, L).
- `MoveGenerator.java` holds the pawn double step as a range-2 slider along both forward axes, en passant through
  `enPassentSquare`, and castling through `kingCanCastle` on the board only.
- `GameState.promote` allows promotion only on a physical move.

Notes on S4:

- The piece letters: P W K C Q Y S N R B U D.
- Branching `>>` versus non-branching `>` jumps.
- "Underpromotion in the base game is not available".
- The `BOARDS` table in `parsers/game.js`, with the setup of **every official variant**. Greek letters are used there
  for the fairy pieces: β/Β brawn, ρ/Ρ royal queen, κ/Κ common king.
- **Real transcribed games** in the README and `test/` ("5D chess online game", 2020): `game-2.5dpgn`,
  `invasion.5dpgn`, the "Simple - No Queens" game and the "Standard - Half Reflected" game.

S1, S2 and S3 agree on every piece vector for White, and S1 and S3 agree for Black (S2 has the Black bugs noted
above). The real games in S4 decode to exactly these vectors (section 6).

---

## 2. Geometry: axes, boards, time steps, paths

### 2.1 The multiverse and board coordinates

- A board is identified by **(L, T, c)**: its timeline L, its turn T (shown in the game as T1, T2, …; Turn Zero
  variants also have T0), and c, the colour to move on it (w or b).
- Inside a timeline, the boards follow each other as T1w, T1b, T2w, T2b, … A useful linear index is the half-turn
  index **h = 2·(T − T₀) + (c = b ? 1 : 0)**.
- **Timeline numbering.**
  - The game starts with timeline 0 ("odd" variants), or with −0 and +0 ("even" variants: Two Timelines and most
    Misc - Timeline …).
  - White's new timelines are numbered +1, +2, … and Black's −1, −2, …
  - For arithmetic in even variants, map the labels to consecutive integers: … −1 → −2, −0 → −1, +0 → 0, +1 → 1, …
    One step in L then moves to the neighbouring label in the order … −2, −1, −0, +0, +1, +2, … (S1 `timelineMove`
    with `isEvenTimeline`).
- **Display in the official game.**
  - Time runs horizontally, left = past. Boards alternate white-to-move and black-to-move.
  - Timelines are stacked vertically: **negative (Black) timelines at the top, positive (White) at the bottom** (S5
    READMEs: "The top timeline is the −0 timeline"; S8: White pawns move "UP" through timelines).
  - So White's two forward directions, +y and −L, both point up the screen.

### 2.2 What "one square in time" is

A step of dT = ±1 changes h by **±2**: one full turn, to the board of the **same colour to move**.

- Example: a white piece on (0 T5 w) with dT = −1 lands on (0 T4 w), skipping (0 T4 b).
- Example: a black piece on (0 T5 b) with dT = −2 lands on (0 T3 b).

A move therefore **never lands on a board where the opponent is to move**. Those boards are not part of the mover's
geometry at all, not even as path squares.

S1 applies this as `givenPieceTurn + movePos[i][1] * 2` and `moveVecs[i][1] * 2`. S2 uses (T, c) with c fixed to the
mover's colour. S4 notes that "players can only interact with boards belonging to their sub-turns".

### 2.3 Which boards exist for a piece

The source is always a playable board: the latest board of its timeline, with the mover's colour to move. The target
board (L + k·dL, T + k·dT, c) must **exist**:

- **Same timeline, dT > 0: never exists.** The source is already that timeline's latest board. Every vector with
  dL = 0 and dT > 0 is therefore always impossible. They are struck through in the tables. All three engines skip
  them (S2 simply leaves them out: `orthogonal_tl_directions` has no (0, 0, +1, 0)).
- **dT < 0: exists** while T + k·dT is still on that timeline, that is at or after the timeline's first board.
  - A timeline created by branching starts at its branch turn. Earlier coordinates on that L do **not** exist, even
    though the parent timeline has boards there.
  - In Turn Zero, L0 also has a T0 **b** board, so a black piece can step back to T0 but a white piece cannot.
- **dL ≠ 0: exists** if that timeline exists and has a board at that T with the mover's colour. This board can be:
  - in its past (the target is a past board, so a new timeline is created);
  - its latest board (a non-branching jump);
  - for dT > 0, a board that timeline has already reached although the source timeline has not.

### 2.4 Leapers and riders across boards

- **Leapers** (knight, king, common king, and the pawn and brawn steps) test **only the target square**: the board
  exists, and the square is empty or holds an enemy (capture). The 2-steps of pawns and brawns also need the middle
  square to be empty.
- **Riders** (rook, bishop, unicorn, dragon, queen, royal queen, princess) repeat the unit vector k = 1, 2, 3, …
  - Stop when the board (L + k·dL, T + k·dT) does not exist, or (x + k·dx, y + k·dy) is off the board.
  - Every intermediate square, on its own intermediate board, must be empty.
  - The ride may stop on an empty square, or capture the first enemy it meets and stop there.
  - S1: `while (positionExists(curMove))`. S2: `inbound(q, C)`, and a missing board is treated as a friendly blocker.
- **Paths run through the past as it was.** Intermediate and target squares are read on those (past) boards, so they
  hold the pieces that stood there at that moment.
  - **Your own past self blocks you.** A rook that has stood on a1 since T1 cannot ride straight back in time along T:
    (0T5)a1 → (0T4)a1 finds its own rook on (0T4 w)a1, which is a friendly piece.
  - Pure T moves are therefore possible only onto squares the piece (or another friendly piece) did not occupy at
    that time.
  - In Rook Tactics I (6.1), the rook's T-ride works because the rook reached e5 only at T3.
- **Captures on other boards** remove the victim only on the **new** board that the move creates (section 2.5). The
  original past board is immutable history.

### 2.5 What a move creates (only what the piece rules need)

Let s be the source board, d the target board and d' the square on it.

| Kind | Condition | Result |
|---|---|---|
| Physical | d = s | Timeline L(s) gets its next board: s with the move made. |
| Non-branching jump (`>`) | d ≠ s, and d is the **latest** board of its timeline (so it has the mover's colour) | L(s) gets its next board (s without the piece). L(d) gets its next board (d with the piece on d', capturing whatever was there). |
| Branching jump (`>>`) | d is **not** the latest board of its timeline (a past board, which may be on L(s) itself) | L(s) gets its next board (without the piece). A **new timeline** is created: its first board is d with the piece on d', one half-turn later, with the opponent to move. White numbers it +n, Black −n. |

These rules match S1 `board.move`, S2 `state.cpp` and the S4 vocabulary. A piece that arrives by jumping or branching
counts as **moved** (S1: `Math.abs(piece)` clears the unmoved flag). Every other piece copied onto the new board keeps
the unmoved/moved status it had **on board d**.

---

## 3. The pieces: movement vectors

Vectors are (dx, dy, dT, dL). ~~Struck through~~ = dL = 0 with dT > 0: part of the definition, but it never finds an
existing board (2.3). "Possible" counts the rest.

### 3.1 Summary table

| Piece | 5dpgn / 5DFEN letter | Kind | Rule | Vectors | Possible | Physical only (dT = dL = 0) | Superphysical only (dx = dy = 0) | Royal | Unmoved flag used |
|---|---|---|---|---|---|---|---|---|---|
| Rook | R | ride | exactly 1 axis | 8 | 7 | 4 | 3 | no | yes (castling) |
| Bishop | B | ride | exactly 2 axes, equal distance | 24 | 20 | 4 | 4 | no | no |
| Unicorn | U | ride | exactly 3 axes, equal distance | 32 | 28 | 0 (**cannot move on its own board**) | 0 | no | no |
| Dragon | D | ride | exactly 4 axes, equal distance | 16 | 16 | 0 (**cannot move on its own board**) | 0 | no | no |
| Queen | Q | ride | 1 to 4 axes, equal distance | 80 | 71 | 8 | 7 | no | no |
| Royal queen | Y (also RQ) | ride | as the queen | 80 | 71 | 8 | 7 | **yes** | no |
| Princess | S (also PR) | ride | 1 or 2 axes (rook plus bishop) | 32 | 27 | 8 | 7 | no | no |
| King | K | leap 1 | any 1 to 4 axes, one step | 80 | 71 | 8 | 7 | **yes** | yes (castling) |
| Common king | C (also CK) | leap 1 | as the king | 80 | 71 | 8 | 7 | no | no (**never castles**) |
| Knight | N | leap | 2 along one axis, 1 along another | 48 | 40 | 8 | 8 | no | no |
| Pawn | P | special | section 3.6 | 2 moves (+2 double) + 4 captures | – | – | – | no | yes (double step) |
| Brawn | W (also BR) | special | pawn plus 4 captures | 2 (+2) + 8 | – | – | – | no | yes (double step) |

- **On their own board**, all pieces except U, D, P and W move exactly as in chess:
  - the princess, queen and royal queen move as a chess queen on the board;
  - the common king moves as a chess king.
- **Distance on each axis.** "Equal distance" means the rider moves k along each of its axes. A bishop's (+1, 0, −1, 0)
  ridden k times goes k files right and k turns back.
- **Generators** (also in `core/topology.js` of this repo):

  | Piece | Generator |
  |---|---|
  | Rook | `directions(4, 1)` |
  | Bishop | `directions(4, 2)` |
  | Unicorn | `directions(4, 3)` |
  | Dragon | `directions(4, 4)` |
  | Queen, royal queen, king, common king | `allDirections(4)` |
  | Princess | `directions(4, 1)` plus `directions(4, 2)` |
  | Knight | `symmetric([2, 1], 4)` |

### 3.2 The unit vectors grouped by axes (for the rook, bishop, unicorn, dragon, queen, princess and king)

**Exactly 1 axis (rook, and part of the queen, princess, king and common king):**

| Axes | Vectors |
|---|---|
| x | (−1,0,0,0) (+1,0,0,0) |
| y | (0,−1,0,0) (0,+1,0,0) |
| T | (0,0,−1,0) ~~(0,0,+1,0)~~ |
| L | (0,0,0,−1) (0,0,0,+1) |

**Exactly 2 axes (bishop, and part of the queen, princess, king and common king):**

| Axes | Vectors |
|---|---|
| x+y | (−1,−1,0,0) (−1,+1,0,0) (+1,−1,0,0) (+1,+1,0,0) |
| x+T | (−1,0,−1,0) ~~(−1,0,+1,0)~~ (+1,0,−1,0) ~~(+1,0,+1,0)~~ |
| x+L | (−1,0,0,−1) (−1,0,0,+1) (+1,0,0,−1) (+1,0,0,+1) |
| y+T | (0,−1,−1,0) ~~(0,−1,+1,0)~~ (0,+1,−1,0) ~~(0,+1,+1,0)~~ |
| y+L | (0,−1,0,−1) (0,−1,0,+1) (0,+1,0,−1) (0,+1,0,+1) |
| T+L | (0,0,−1,−1) (0,0,−1,+1) (0,0,+1,−1) (0,0,+1,+1) |

**Exactly 3 axes (unicorn, "triagonal", and part of the queen, king and common king):**

| Axes | Vectors |
|---|---|
| x+y+T | (−1,−1,−1,0) ~~(−1,−1,+1,0)~~ (−1,+1,−1,0) ~~(−1,+1,+1,0)~~ (+1,−1,−1,0) ~~(+1,−1,+1,0)~~ (+1,+1,−1,0) ~~(+1,+1,+1,0)~~ |
| x+y+L | (−1,−1,0,−1) (−1,−1,0,+1) (−1,+1,0,−1) (−1,+1,0,+1) (+1,−1,0,−1) (+1,−1,0,+1) (+1,+1,0,−1) (+1,+1,0,+1) |
| x+T+L | (−1,0,−1,−1) (−1,0,−1,+1) (−1,0,+1,−1) (−1,0,+1,+1) (+1,0,−1,−1) (+1,0,−1,+1) (+1,0,+1,−1) (+1,0,+1,+1) |
| y+T+L | (0,−1,−1,−1) (0,−1,−1,+1) (0,−1,+1,−1) (0,−1,+1,+1) (0,+1,−1,−1) (0,+1,−1,+1) (0,+1,+1,−1) (0,+1,+1,+1) |

**Exactly 4 axes (dragon, "quadragonal", and part of the queen, king and common king): all 16 vectors (±1, ±1, ±1,
±1).**

**Summary by piece:**

| Piece | Built from |
|---|---|
| Rook | the 1-axis table |
| Bishop | the 2-axis table |
| Unicorn | the 3-axis table |
| Dragon | the 4-axis set |
| Princess | the 1-axis and 2-axis tables (as riders) |
| Queen and royal queen | all four (as riders) |
| King and common king | all four, as **single steps** |

### 3.3 Knight (48 vectors, leaper, jumps over everything)

| Shape | Vectors |
|---|---|
| 2 along x, 1 along y | (+2,+1,0,0) (+2,−1,0,0) (−2,+1,0,0) (−2,−1,0,0) |
| 2 along x, 1 along T | ~~(+2,0,+1,0)~~ (+2,0,−1,0) ~~(−2,0,+1,0)~~ (−2,0,−1,0) |
| 2 along x, 1 along L | (+2,0,0,+1) (+2,0,0,−1) (−2,0,0,+1) (−2,0,0,−1) |
| 2 along y, 1 along x | (+1,+2,0,0) (−1,+2,0,0) (+1,−2,0,0) (−1,−2,0,0) |
| 2 along y, 1 along T | ~~(0,+2,+1,0)~~ (0,+2,−1,0) ~~(0,−2,+1,0)~~ (0,−2,−1,0) |
| 2 along y, 1 along L | (0,+2,0,+1) (0,+2,0,−1) (0,−2,0,+1) (0,−2,0,−1) |
| 2 along T, 1 along x | ~~(+1,0,+2,0)~~ ~~(−1,0,+2,0)~~ (+1,0,−2,0) (−1,0,−2,0) |
| 2 along T, 1 along y | ~~(0,+1,+2,0)~~ ~~(0,−1,+2,0)~~ (0,+1,−2,0) (0,−1,−2,0) |
| 2 along T, 1 along L | (0,0,+2,+1) (0,0,+2,−1) (0,0,−2,+1) (0,0,−2,−1) |
| 2 along L, 1 along x | (+1,0,0,+2) (−1,0,0,+2) (+1,0,0,−2) (−1,0,0,−2) |
| 2 along L, 1 along y | (0,+1,0,+2) (0,−1,0,+2) (0,+1,0,−2) (0,−1,0,−2) |
| 2 along L, 1 along T | (0,0,+1,+2) (0,0,−1,+2) (0,0,+1,−2) (0,0,−1,−2) |

- Only the target board and square are checked. The intermediate boards (for example T−1 on a dT = −2 leap) do not
  need to exist.
- This matches S8: "1 dimension → 2 squares away, 2 dimensions → 1 square away, 3 dimensions → same square". The
  "dimensions" there count superphysical steps.
- S1 `movePos(5|6)` holds these 48 vectors exactly. S2 builds the same set from four parts: the physical knight; one
  superphysical step (orthogonal T/L) combined with a physical 2-jump; two superphysical steps along one axis combined
  with a physical 1-jump; and the 8 purely superphysical (T, L) knight jumps.

### 3.4 King and common king

- **King:** one step along any 1 to 4 axes, which is the 80 unit vectors of 3.2 as single leaps (71 possible). It is
  royal.
- **Common king:** the same moves. It is not royal (capturing it does not win, and it is never "in check") and it
  never castles (S6/S7 excerpt: "non-royal and non-castling"; S1 castles only piece codes 11 and 12; S2 has no unmoved
  flag for C).
- **Castling** is in 4.2.

### 3.5 Royal queen and princess

- **Royal queen (Y):** moves as a queen and is royal. Capturing it, or checkmating it, has the same effect as for the
  king (S5 Reversed Royalty README; S1 `checks` treats codes 19/20 as royal).
- **Princess (S):** rook plus bishop, so at most 2 axes at a time. It cannot move along triagonals or quadragonals
  (S5 Princess README: "preventing the feasibility of the f7 sacrifice in most cases").

### 3.6 Pawn (P)

Forward axes: **y** (White +1, Black −1) and **L** (White −1, towards Black's timelines; Black +1). Sideways axes: x
and T.

| Kind | White vectors | Black vectors | Condition |
|---|---|---|---|
| Step (quiet) | (0,+1,0,0) | (0,−1,0,0) | the target is empty |
| Timeline step (quiet) | (0,0,0,−1) | (0,0,0,+1) | the target is empty; same T, neighbouring timeline |
| Double step (quiet) | (0,+2,0,0) | (0,−2,0,0) | the pawn is **unmoved**; both squares are empty |
| Timeline double step (quiet) | (0,0,0,−2) | (0,0,0,+2) | the pawn is **unmoved**; the square on the middle timeline (same T) exists and is empty, and the target is empty |
| Capture, board diagonal | (+1,+1,0,0) (−1,+1,0,0) | (+1,−1,0,0) (−1,−1,0,0) | the target holds an enemy; **also en passant** (4.1) |
| Capture, T-L diagonal | (0,0,+1,−1) (0,0,−1,−1) | (0,0,+1,+1) (0,0,−1,+1) | the target holds an enemy; forward one timeline, one turn earlier or later, **same square** |

- A pawn never captures straight forward, along either axis.
- A pawn never captures along a mixed spatial/superphysical diagonal (S6 excerpt: "Pawns have an additional
  restriction that brawns do not: they cannot capture along a diagonal consisting of one spatial direction and one
  non-spatial direction").
- **Timeline moves keep x and y**, so they never promote. A timeline double step has no en passant.
- **An unmoved pawn may double-step from any rank**, not only its second rank.
  - Evidence: the official game vs the CPU in S4 `test/invasion.5dpgn`. On (−0) White's pawns start on **rank 1**.
    White plays `(-0T4)d3` (d1 to d3), and Black answers `(-0T4)exd2 {En passant}`.
  - S1's test `brawn.test.js` allows a brawn double step from rank 1.
  - The unmoved flag is per piece per board: S5 5DFEN marks `P*`/`W*`.
- **Timeline direction evidence** from real games (S4):
  - White `(1T25)Pa4>(0T25)a4` (L+1 → L0) in `game-2.5dpgn`;
  - Black `(0T9)Pa6>(1T9)a6` (L0 → L+1) in `ShadTestGame2` / `game-2`;
  - Black `(-1T19)c6>(0T19)c6` (−1 → 0) in the Simple - No Queens game;
  - Black T-L capture `(1T7)Pc3>>x(2T6)c3` (dT = −1, dL = +1) in the Timeline Invasion game.
- **Promotion:** in 4.3.

### 3.7 Brawn (W)

A brawn moves, double-steps, takes en passant and promotes **exactly like a pawn**. On top of the pawn's 4 captures it
has **4 more captures** (S1 `cardinalities`, S3 `whiteBrawnattack` / `blackBrawnattack`).

Rule (S6): one step along **exactly two axes**, forward along at least one, backward along none (x and T are
sideways).

| Extra capture | White | Black |
|---|---|---|
| sideways on the board plus one timeline forward | (+1,0,0,−1) (−1,0,0,−1) | (+1,0,0,+1) (−1,0,0,+1) |
| one rank forward plus one timeline forward | (0,+1,0,−1) | (0,−1,0,+1) |
| one rank forward plus one turn back | (0,+1,−1,0) | (0,−1,−1,0) |
| (one rank forward plus one turn ahead: same timeline, never exists) | ~~(0,+1,+1,0)~~ | ~~(0,−1,+1,0)~~ |

- Full brawn capture set for White: (±1,+1,0,0), (0,0,±1,−1), (±1,0,0,−1), (0,+1,0,−1) and (0,+1,−1,0). That is 8
  possible vectors, which is exactly the set the rule generates (checked by enumeration).
- **The brawn's quiet moves are the pawn's.** The extra vectors are captures only. S2 has a table that looks like
  quiet moves for them, but it is buggy (it tests `shift_north(z) & ~occupied`) and S1 and S3 contradict it.
- **Promotion on a cross-board capture.** The captures (0,+1,0,−1) and (0,+1,−1,0) change the rank, so a brawn can
  reach its last rank **on another board**. S1 ("Must promote") and S2 ("only brawns can do") promote it there. S3
  promotes only on physical moves. See section 9.
- **The victim of en passant** may be a pawn or a brawn, and so may the capturer (S1 `enPassant` accepts codes 1/2
  and 15/16; S3 treats both).
- **Remark in S5** (Standard - Brawns): "vulnerable to the f7 sacrifice, as brawns cannot take pieces next to them in
  the past". Indeed (±1, 0, −1, 0) is not a brawn capture: it has no forward component.

---

## 4. Special moves

### 4.1 En passant (one board only)

- It is exactly as in chess, **on one board**.
- **Conditions.** An enemy pawn or brawn has just made a **physical** double step on this timeline and now stands
  beside your pawn or brawn. You capture it by moving diagonally onto the square it skipped.
- **How S1 checks it.** It compares the current board with the board **one full turn earlier on the same timeline**,
  L T−1 with your colour. On that earlier board the victim was on its start square and the square it now occupies was
  empty.
- Timeline double steps create no en passant, and en passant across boards is impossible (S6, S7).
- Edge case: the first board of a newly branched timeline has no earlier board on its own L (see section 9).

### 4.2 Castling (one board only)

- **Pieces.** The **king** (never the common king) and a **rook** of the same colour on the same rank. Both are
  unmoved **on this board**.
- **Empty squares.** All squares between them are empty.
- **The move.** The king moves **two squares towards the rook**, and the rook moves to the square the king crossed.
- **Check test.** The king may not be in check, and may not cross or land on an attacked square. Only attacks **from
  the same board** count (S7: "(physically) in check"; S6: the check prohibition "is not generalized across turns and
  timelines"; S1, S2 and S3 all test attacks on that board only).
  - Landing on a square attacked from another board is still illegal in the end, because a player may not end the
    turn in check.
- **Never across time or timelines.** The king cannot castle onto another board.
- **Other boards.**
  - Castling works on other board sizes too. The Simple - No Queens game (7×7, king d1) has `(0T5)O-O {to the right}`,
    which is Kd1-f1 with Rg1-e1.
  - S6 excerpt: the rook "need not be on the player's first rank", and should be "at least two squares away".
- **Unmoved flags survive copying.** A king or rook that is unmoved on a past board is still unmoved on a new
  timeline branched from that board. After a piece time-travels, it is moved.
- **Implementations.**
  - S1 requires the two squares next to the king to be empty, then scans for the first piece, which must be an unmoved
    rook.
  - S2 also requires the rook to be on the edge of the board.
  - Notation: `O-O` / `O-O-O` with e1/e8 kings, otherwise `K<from><to>` (S4).

### 4.3 Promotion

- **Where.** A pawn or brawn that reaches its last rank (White: the top rank, Black: rank 1) promotes at once.
- **To what, in the official game: a queen only.** This holds even in Standard - Princess (S7 excerpt: "the
  Promotions field is not supported by the base game and in the base game, pawns always promote to queens, even in
  this variant"; S4: "Underpromotion in the base game is not available"; S2's default `promotion_options::QUEEN`).
- **Community clients differ.**
  - S1 offers every non-royal piece type present on the board, and in the Princess variant promotes to S, not Q (its
    `promotion.test.js`).
  - S5 headers list `Promotions "Q,N,R,B"` (Princess: `"S,N,R,B"`, Reversed Royalty: `"Q,N,R,B,C"`).
- A physical step, a physical capture and a brawn rank-changing cross-board capture can promote (section 3.7). Pawn
  timeline moves and T-L captures never promote.
- The real Timeline Invasion game has `(1T3)axb1=Q` (S4).

---

## 5. Royalty and attacks (what the check rule needs from each piece)

- **Royal pieces:** K and Y. Every royal piece on any board counts: past boards, and several royals on one board
  (Excessive has 3 kings per side; King of Kings has 1 K and 4 C).
- **Non-royal:** everything else, including C.
- **Attacks equal capture moves.** The attack set of a piece is its capture set:
  - for P and W, only their capture vectors (a pawn's forward steps never attack);
  - for the others, their normal moves.
- **Official check.** A player is in check if, **after passing** on all their playable boards, the opponent could
  capture a royal piece with one move from any of the opponent's playable boards.
  - The target may be on a past board, as in Rook Tactics I (6.1).
  - A player may not submit a turn that leaves them in check. Checkmate is being in check with no legal action.
    Softmate is when only time travel escapes.
  - Sources: S1 `mate.js`, S4 vocabulary.
- **Quantum Chess** replaces check with "capture the king". The attack sets above still say which enemy moves threaten
  a king, which the king-danger display needs.

---

## 6. Worked examples from real games (useful as test fixtures)

### 6.1 Rook Tactics I (5×5 official puzzle, S4)

`[4k/5/5/5/K1R2:0:1:w]`: black k e5; white K a1, R c1.

1. (0T1)Kb2 / (0T1)Ke4
2. (0T2)Re1 / (0T2)Kd3
3. (0T3)Re5#, with the comment "attacks (0T1)Ke5"

How the mate works:

- After Black passes, White has the board (0T4 w). The rook on e5 rides **(0, 0, −1, 0) three times** to (0T1 w)e5,
  where the black king still stands.
- The squares it passes, (0T3 w)e5 and (0T2 w)e5, are empty: the king had already left for d3 and e4.
- This shows three things: a pure T ride, a king on a past **white-to-move** board being capturable by White, and a
  path through past boards.

### 6.2 Knight Tactics III (5×5, S4)

1. (0T1)Nd2 / (0T1)c3
2. (0T2)Nb3 / (0T2)c2
3. (0T3)Nb3>>(0T1)a3 / (1T1)Ke4
4. (1T2)Nb5#, with the comment "attacks (0T3)Kd5"

- Move 3 is the knight vector (−1, 0, −2, 0): 2 turns back and 1 file left. It creates timeline +1.
- In move 4 the knight makes a physical move a3 → b5. From (1T3 w)b5 it then attacks (0T3 w)d5 with (+2, 0, 0, −1).

### 6.3 Moves decoded from real games (all consistent with section 3)

| Move (game) | Piece, colour | (dx, dy, dT, dL) | Kind |
|---|---|---|---|
| `(0T6)Nb1>>(0T5)b3` (Simple - No Queens) | N, White | (0,+2,−1,0) | knight 2y + 1T |
| `(0T6)Ne7>(1T6)e5` | N, Black | (0,−2,0,+1) | knight 2y + 1L |
| `(-1T9)Bd4>x(0T9)d3` | B, Black | (0,−1,0,+1) | bishop y+L |
| `(-1T16)Kb7>x(0T16)c6` | K, Black | (+1,−1,0,+1) | king, 3 axes |
| `(-1T17)Rb4>(1T17)b4` | R, White | (0,0,0,+2) | rook along L through (0T17)b4 |
| `(-1T20)Bc4>>x(-1T18)a4` | B, Black | (−2,0,−2,0) | bishop x+T, distance 2 |
| `(-1T20)Bb6>x(0T20)b7` | B, White | (0,+1,0,+1) | bishop y+L |
| `(0T6)Qg5>>x(0T4)g3` (Half Reflected) | Q, Black | (0,−2,−2,0) | queen y+T |
| `(0T11)Qd1>(2T11)f3` | Q, White | (+2,+2,0,+2) | queen x+y+L (a unicorn line) through (1T11)e2 |
| `(2T13)Bd6>>x(2T9)d2` | B, Black | (0,−4,−4,0) | bishop y+T, distance 4 |
| `(0T8)Nf3>x(-1T8)f5` | N, White | (0,+2,0,−1) | knight |
| `(+0T2)Kc1>>(-0T1)c2~` (Timeline Invasion) | K, White | (0,+1,−1,−1) | king, 3 axes (+0 → −0 is dL = −1) |
| `(+0T8)Be1>>(-1T6)e1~` | B, White | (0,0,−2,−2) | bishop T+L through (−0T7)e1 |
| `(-0T5)Na5>x(+0T5)a3` | N, Black | (0,−2,0,+1) | knight |
| `(1T7)Pc3>>x(2T6)c3+~` | P, Black | (0,0,−1,+1) | pawn T-L capture |
| `(1T3)axb1=Q` | P, Black | (+1,−1,0,0) | capture with promotion to Q |
| `(-0T4)exd2 {En passant}` | P, Black | (−1,−1,0,0) | en passant after White's d1-d3 |

---

## 7. Official variants: board sizes, setups and pieces

### 7.1 Notes on the table

- **Where the setups come from.**
  - The setups come from the `BOARDS` table in S4 `parsers/game.js`, whose keys are the official variant names as
    used in the 5dpgn `[Board "…"]` header.
  - The Standard family was cross-checked against S1 `board.init` and S5.
  - Where they are available, piece counts were checked against the S8 excerpts: Excessive, Small, Timeline
    Formations and Timeline Invasion.
- **FEN.** Ranks are listed top (Black's back rank) to bottom (rank 1). For the fairy pieces I write 5DFEN letters (W,
  Y, C) instead of S4's Greek letters.
- **Several timelines.**
  - With several starting timelines, the boards are listed in the order of the "Timelines" column, **top timeline
    (negative) first**.
  - "−0:1" in S4 marks a timeline that starts one half-turn later. For Timeline Fragments this means that (−0) starts
    with Black to move (S5 calls this "staggered").
- **Unmoved markers.** In the official game every pawn, brawn, king and rook starts unmoved, including pawns on a back
  rank (section 3.6).

### 7.2 The table

| Category / name (5dpgn `Board`) | Size | Timelines (start boards) | Setup (top rank → rank 1) | Pieces per side |
|---|---|---|---|---|
| **Standard** | 8×8 | 0 (T1w) | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR` | K Q 2R 2B 2N 8P |
| Standard - Turn Zero | 8×8 | 0 (T0b **and** T1w, identical) | the same position on both boards | as Standard. Black can travel to the T0 board, whose position no one has touched. |
| Standard - Two Timelines | 8×8 | −0, +0 (T1w each) | Standard on both | as Standard, twice |
| Standard - Defended Pawn | 8×8 | 0 | `rqbnkbnr/…/RQBNKBNR` (Q and N swapped on b/d) | as Standard |
| Standard - Half Reflected | 8×8 | 0 | `rnbkqbnr/…/RNBQKBNR` (**Black** K d8, Q e8; S1, S4, S5 README) | as Standard |
| Standard - Princess | 8×8 | 0 | `rnbskbnr/…/RNBSKBNR` | **S** replaces Q |
| Standard - Reversed Royalty | 8×8 | 0 | `rnbycbnr/…/RNBYCBNR` (Y on d, C on e) | **Y** (royal) and **C** (common) replace Q and K. No castling (C never castles). |
| Simple - No Queens | 7×7 | 0 | `rnbknbr/ppppppp/7/7/7/PPPPPPP/RNBKNBR` | K 2R 2B 2N 7P |
| Simple - Knights vs. Bishops | 6×6 | 0 | `rbqkbr/pppppp/6/6/PPPPPP/RNQKNR` | Black: K Q 2R 2B 6P. White: K Q 2R 2N 6P. |
| Simple - No Bishops | 6×6 | 0 | `rnqknr/pppppp/6/6/PPPPPP/RNQKNR` | K Q 2R 2N 6P |
| Simple - No Knights | 6×6 | 0 | `rbqkbr/pppppp/6/6/PPPPPP/RBQKBR` | K Q 2R 2B 6P |
| Simple - No Rooks | 6×6 | 0 | `nbqkbn/pppppp/6/6/PPPPPP/NBQKBN` | K Q 2B 2N 6P |
| Simple - Simple Set | 6×6 | 0 | `rnbqkr/pppppp/6/6/PPPPPP/RKQBNR` (point-symmetric) | K Q 2R B N 6P |
| Small | 5×5 | 0 | `kqbnr/ppppp/5/PPPPP/KQBNR` (both kings on the a-file) | K Q R B N 5P (S8: "5 Pawns, 1 Bishop, 1 Knight, 1 Rook, 1 Queen & 1 King") |
| Small - Flipped | 5×5 | 0 | `nbrqk/ppppp/5/PPPPP/KQRBN` | K Q R B N 5P |
| Small - Centered | 5×5 | 0 | `rnkqr/ppppp/5/PPPPP/RQKNR` | K Q 2R N 5P |
| Small - Open | 5×5 | 0 | `prnbk/3pp/5/PP3/KBNRP` (a pawn on each back rank) | K R B N 3P |
| Very Small | 4×4 | 0 | `nbrk/pppp/PPPP/KRBN` | K R B N 4P |
| Very Small - Open | 4×4 | 0 | `nbrk/3p/P3/KRBN` (S2: `nbrk/3p*/P*3/KRBN`) | K R B N 1P |
| Focused - Just Knights | 5×5 | 0 | `n1kn1/5/5/5/1NK1N` | K 2N |
| Focused - Just Bishops | 5×5 | 0 | `1bbk1/5/5/5/1KBB1` | K 2B |
| Focused - Just Rooks | 5×5 | 0 | `1rk1r/5/5/5/R1KR1` | K 2R |
| Focused - Just Queens | 6×6 | 0 | `1q1k2/6/6/6/6/2K1Q1` | K Q |
| Focused - Just Pawns | 5×5 | 0 | `ppppk/5/5/5/KPPPP` (pawns on the back rank) | K 4P |
| Focused - Just Kings | 3×3 | 0 | `2k/3/K2` | K |
| Focused - Just Unicorns | 5×5 | 0 | `1u1uk/5/5/5/KU1U1` | K 2**U** |
| Focused - Just Dragons | 5×5 | 0 | `2ddk/5/5/5/KDD2` | K 2**D** |
| Focused - Just Brawns (S5 also calls it "Brawns - Small") | 5×5 | 0 | `wwwwk/5/5/5/KWWWW` (S5: `w*w*w*w*k*/5/5/5/K*W*W*W*W*`) | K 4**W**. The brawns "can immediately jump two squares forward" (S5). |
| Misc - Timeline Invasion | 5×5 | −0, +0 | (−0) `nbkrb/ppppp/5/5/PPPPP` · (+0) `ppppp/5/5/PPPPP/NBKRB` | K R 2B N 10P. Each side's pieces start on a different timeline. |
| Misc - Timeline Formations | 5×5 | −0, +0 | (−0) `ppppp/5/5/5/2K2` · (+0) `2k2/5/5/5/PPPPP` | K 5P, on different timelines |
| Misc - Timeline Tactitian (sic) | 4×4 | −0, +0 | (−0) `kbnr/pppp/4/4` · (+0) `4/4/PPPP/KBNR` | K R B N 4P |
| Misc - Timeline Strategos | 5×5 | −0, +0 | (−0) `nbkur/ppppp/5/5/5` · (+0) `5/5/5/PPPPP/RUKBN` | K **U** R B N 5P |
| Misc - Timeline Battleground(s) | 5×5 | −1, 0, +1 | (−1) `rrkrr/bbqbb/ppppp/5/PPPPP` · (0) `nnnnn/ppppp/5/PPPPP/NNNNN` · (+1) `ppppp/5/PPPPP/BBQBB/RRKRR` | K Q 4R 4B 5N 15P |
| Misc - Timeline Skirmish | 5×5 | −0, +0 | (−0) `3rk/3pp/5/BB3/NN3` · (+0) `3nn/3bb/5/PP3/KR3` | K R 2B 2N 2P |
| Misc - Timeline Fragments | 4×4 | −0 (starts 1 half-turn later), +0 | (−0) `kppp/4/4/NBRU` · (+0) `nbru/4/4/KPPP` | K R B N **U** 3P |
| Misc - Timeline Marauders | 5×5 | −1, 0, +1 | (−1) `wrkrw/1www1/5/5/5` · (0) `w1w1w/5/5/5/W1W1W` · (+1) `5/5/5/1WWW1/WRKRW` | K 2R 8**W** |
| Misc - King of Kings | 5×5 | 0 | `cckcc/5/5/5/CCKCC` | K and 4**C** |
| Misc - Royal Queen Showdown | 6×6 | 0 | `4y1/6/6/6/6/1Y4` | a single **Y**, and nothing else |
| Misc - Excessive | 7×7 | 0 | `kruqdrk/rnbknbr/ppppppp/7/PPPPPPP/RNBKNBR/KRUQDRK` | **3K** 4R 2B 2N **U** Q **D** 7P (S8 confirms these counts) |
| Misc - Global Warming | 1×1 | 0 | `1` (an empty board) | none. A joke: an instant draw (S8 excerpt). |
| Checkmate Practice - Knight | 6×6 | 0 | `5n/6/6/6/6/K5` | White K. Black n, with no king. |
| Checkmate Practice - Bishop | 6×6 | 0 | `4b1/6/6/6/6/K5` | White K. Black b. |
| Checkmate Practice - Rook | 6×6 | 0 | `5r/6/6/6/6/K5` | White K. Black r. |
| Checkmate Practice - Queen | 6×6 | 0 | `4q1/6/6/6/6/K5` | White K. Black q. |
| Checkmate Practice - Pawns | 6×6 | 0 | `2ppp1/6/6/6/6/3K2` | White K d1. Black c6, d6, e6. |

**Names.**

- There is no official "Tiny" category. An S8 excerpt says the guide's "Tiny" is "referred to as 'Small' in the game".
- The in-game menu may prefix the small boards with "Misc -" (speedrun.com lists "Misc - Small", "Misc - Very Small"
  and so on). The 5dpgn names are as in the table.
- Other game modes are not variants: "Random" picks a variant, and "Puzzles" (Rook, Knight, Bishop, Queen Tactics …,
  mostly on 5×5 boards) are positions.

### 7.3 Where each non-standard piece appears (official variants)

| Piece | Variants |
|---|---|
| Princess S | Standard - Princess |
| Royal queen Y | Standard - Reversed Royalty; Misc - Royal Queen Showdown |
| Common king C | Standard - Reversed Royalty; Misc - King of Kings |
| Unicorn U | Focused - Just Unicorns; Misc - Timeline Strategos; Misc - Timeline Fragments; Misc - Excessive |
| Dragon D | Focused - Just Dragons; Misc - Excessive |
| Brawn W | Focused - Just Brawns; Misc - Timeline Marauders. Community variants: Standard - Brawns, Turn Zero - Brawns, Staggered Timelines - Brawns (S5). |
| Several royals per side | Misc - Excessive (3 K); Misc - King of Kings (1 K, whose partners are only common kings) |

---

## 8. Notes for the quantum implementation (pieces lens)

These points follow from the research. Where a point is a design choice rather than a fact about the game, it says
so.

1. **Vector tables.**
   - Use the generators in 3.1 in (x, y, T, L) order. Map a step of T to a change of **2 in the half-turn index**.
   - Keep dL = 0 with dT > 0 in the tables if convenient: the board-existence test (2.3) removes them. They cost
     generation time, though (9 of the queen's 80 directions), so leaving them out is cleaner.
   - Riders need a **board-existence test at every step**, and the path is read on past boards (2.4). The generic
     `rectTopology` cannot express this, so the multiverse module must generate its moves itself, as the earlier
     `multiverse.md` already concluded.
2. **Orientation.**
   - Only P and W are oriented. Black flips **y and L** and leaves x and T alone.
   - The core default `orient` negates coordinate 1 only, so the 5D module must override `orient` (negate indices 1 and
     3), or write both colour tables by hand.
3. **Unmoved flags are per piece per board**, and are needed for P, W (double step), K and R (castling).
   - A copied board inherits the flags. The travelling piece loses its flag.
   - For quantum worlds this state must be identical in every world where the piece is on that square. Storing it per
     cell (like the type) matches the real rules.
4. **Solid or splittable** (design choice). The quantum rules say kings and pawns are always solid (`docs/rules.md`
   rule 6). The natural extension is:

   | Group | Pieces |
   |---|---|
   | Solid | K and Y (royal); P and W (pawn-like) |
   | Splittable | Q, S, R, B, N, U, D |
   | Open choice | C (common king) |

   For C:
   - It is a non-royal king, and it might be splittable. That would be faithful to "non-royal".
   - Making it solid is simpler for players, because it looks like a king.
   - I would keep C solid for clarity, and flag it as a design choice.
5. **Promotion.**
   - Faithful: queen only, automatic, as in the official game.
   - The existing quantum rules let the player choose the promotion piece (`docs/rules.md` section 4). Choosing between
     queen only and the variant's list (S5 `Promotions` header) is a design decision.
   - Recommended: **queen only** in the 5D variant, to stay faithful. If a choice is offered, follow the S5 list (Q,
     N, R, B; Princess: S, N, R, B).
6. **Values for the AI** (heuristic).
   - The community values (S9) are P 1, R 3, N 5, B 5 (slightly better than N), Q 15.
   - These are my own interpolations by number of possible directions and reach, **unverified**:

     | Piece | Estimate |
     |---|---|
     | Princess S | ≈ 8 (R + B) |
     | Unicorn U | ≈ 5–6 (28 directions, but none on its own board) |
     | Dragon D | ≈ 3–4 (16 directions, needs an existing board on another timeline at every step) |
     | Common king C | ≈ 3–4 (71 one-step directions) |
     | Brawn W | ≈ 1.3–1.5 |

   - In centipawns this might be P 100, R 300, N 450, B 500, S 800, U 550, D 350, C 350, Q 1500 and W 140.
7. **Which official setup** (design choice for this app). If the earlier 5D-lite plan keeps a 5×5 board, the
   faithful choice is an **official** 5×5 setup rather than Gardner's `rnbqk/ppppp/5/PPPPP/RNBQK`, which is not a 5D
   Chess variant:
   - Small: `kqbnr/ppppp/5/PPPPP/KQBNR`;
   - Small - Centered / Flipped / Open;
   - a Focused set.

   Very Small - Open (4×4) is the smallest official "real" game, and S2 ships it as one of only 4 presets. The
   Standard family is 8×8 (cost: see the existing layout concerns in `multiverse.md`).
8. **UI.**
   - The Unicorn and Dragon cannot move on their own board. Every move they make creates or advances another board, so
     the UI must show cross-board targets clearly.
   - The pawn's timeline step and T-L capture keep the square. Highlight "the same square on the neighbouring
     timeline".

---

## 9. Uncertain points

1. **The variant setups** come from S4's `BOARDS` table (a community parser) and not from the game files.
   - Only the Standard family (S1, S5) and the piece counts of Small, Excessive, Timeline Invasion and Timeline
     Formations (S8 excerpts) were cross-checked.
   - The exact in-game names and categories are not fully certain: "Misc - Small" versus "Small", and "Timeline
     Battleground" versus "Battlegrounds".
   - The "Tactitian" spelling is S4's.
2. **Standard - Half Reflected.**
   - S1 `board.init` and S4 swap **Black's** K and Q (`rnbkqbnr`), which matches the S5 README text ("black's king and
     queen are swapped").
   - S5's own 5DFEN swaps **White's** instead (`R*NBK*QBNR*`). I trust the majority: Black's.
3. **Castling details** on non-standard boards.
   - S6 says the rook must be "at least two squares away". S1 requires two empty squares next to the king before the
     rook (so the rook is at least 3 away), and S2 requires the rook to be on the edge.
   - What happens with a rook 2 squares away (6×6 `RNQKNR`: king d1, rook f1), or with a rook not on the edge, is
     unverified.
4. **Brawn promotion by a cross-board capture** ((0,+1,0,−1) or (0,+1,−1,0) onto the last rank). S1 and S2 promote;
   S3 does not. The official behaviour is unverified; I assume it promotes, since the brawn "has the promotion
   abilities of the pawn".
5. **En passant on the first board of a new timeline.**
   - S1 looks up (L, T−1) on the same L, which does not exist there, so there is no en passant.
   - S3 stores an en-passant square on the board, so it is allowed.
   - The official behaviour is unverified. This is a rare edge case.
6. **Blocking on the middle square of a timeline double step.**
   - All three engines require the middle timeline's square (same T) to be empty.
   - One S4 test file (`test/marauders.5dpgn`, a single line, possibly synthetic) shows `(1T1)BRa1>(-1T1)a1` where
     (0T1)a1 holds a white brawn.
   - I follow the engines. It could be checked in the official game.
7. **Promotion in Standard - Princess.** Official: queen (S7 excerpt). S1 promotes to princess. I follow the official
   rule.
8. **Checkmate Practice.** Which side the human controls is not verified. White has only a king; Black has pieces but
   no king.
9. **Timeline Fragments start offset** ("−0:1"): which side moves first on (−0) is inferred from S4's syntax only.
10. **Community piece values** (S9) are one forum opinion. The values for U, D, S, C and W in section 8 are my
    estimates.
11. **Colour conventions for time-travel targets.**
    - A target board must be the mover's colour to move. This is certain: all engines agree, and so does S4 ("only
      interact with boards belonging to their sub-turns").
    - A target that is another timeline's **latest** board of the mover's colour makes the jump non-branching. Whether
      the official game treats a board that has already been moved from **during the current turn** as past, and so
      branching, follows from "latest board" logic in S1. It was not observed in the official game.
12. **The display orientation** (negative timelines on top) is inferred from S5 READMEs and S8. It holds for White's
    view; I did not verify whether the game flips the view for Black.
