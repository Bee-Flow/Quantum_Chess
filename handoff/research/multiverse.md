# Variant spec: `multiverse` (5D-lite: chess with multiverse time travel)

Category: `dimensions`. Display name: **Multiverse (5D)**. Summary: *Chess through time and timelines on small 5×5
boards. Move into the past, open new timelines and capture a king anywhere in the multiverse.*

This variant has a different world shape from the others: a world is a whole multiverse, so the module implements the
world-level functions of the contract itself (section 3). Section 3.6 lists three small **contract extensions** that it
needs: `applyMiss`, `pass`, and "the skeleton is the same in every world".

---

## 1. Sources and chosen rule set

### 1.1 Sources

The rule pages usually cited (Wikipedia, the Steam guides, the fandom wiki, chessbase, the official site) could not be
fetched from this environment: the egress proxy blocked them. I checked every rule claim below against the **source
code of two independent open-source implementations of the official rules**, and against the community notation
standard. Search-result excerpts of the blocked pages agreed with them.

| # | Source | Used for |
|---|---|---|
| S1 | **5d-chess-js** v1.2.1 (npm `5d-chess-js`, AGPL, https://gitlab.com/5d-chess/5d-chess-js), which says it implements the official rules. I read `dist/5d-chess.js`: `board.js` (`active`, `present`, `move`), `piece.js` (`movePos`, `moveVecs`, `timelineMove`, pawn and en-passant code), `mate.js` (`checks`, `checkmate`, `stalemate`), `action.js`, `validate.js` | movement vectors in 4 axes, time step = 2 half-boards (same colour only), branching and non-branching jumps, new timeline numbering, active timelines, present, check |
| S2 | **ftxi/5dchess_engine** (https://github.com/ftxi/5dchess_engine), C++. Files `src/core/multiverse_base.cpp` (`get_present`, `insert_board` active range), `src/core/state.cpp` (`submit`, `get_timeline_status`: mandatory / optional / unplayable timelines, `phantom`), `src/core/check_position.cpp` (pawn timeline direction `forward_l = C ? 1 : -1`), `src/core/variants.cpp` (official setups, including **Very Small - Open** 4×4 `nbrk/3p*/P*3/KRBN`) | second independent check of present, active, submit and pawn direction |
| S3 | **Shad's 5D algebraic notation / 5dpgn** (https://github.com/adri326/5dchess-notation, README) | vocabulary (turn, action, jump, branching `>>` vs non-branching `>`), coordinates `(LxTy)`, white creates positive and black negative timelines, definitions of check, softmate and checkmate, "Underpromotion in the base game is not available", 5DFEN board strings, 5×5 puzzles (`[Size "5x5"]`) |
| S4 | **adri326/5dchess-variants** (https://github.com/adri326/5dchess-variants): `base/Standard/*/variant.5dpgn` | Standard 5DFEN, variant list |
| S5 | Wikipedia "5D Chess with Multiverse Time Travel" (https://en.wikipedia.org/wiki/5D_Chess_with_Multiverse_Time_Travel), from search excerpts only | the present line, "the nth timeline created by a player is active if the opponent has created at least n−1 timelines", pawns promote only to queens |
| S6 | Steam guides "A Guide on Pieces Moving Through Time and Timelines" and "All Variants Explained" (https://steamcommunity.com/sharedfiles/filedetails/?id=2176513845, https://steamcommunity.com/sharedfiles/filedetails/?id=2223803379), from search excerpts only | small-board variants use a reduced set of 5 pawns plus R, N, B, Q, K |
| S7 | **Gardner minichess**: M. Mhalla, F. Prost, "Gardner's Minichess Variant is solved", arXiv:1307.7118 (2013); Wikipedia "Minichess" | the 5×5 start position, and the AISE rules without the pawn double step or castling (the rules that were solved: a draw) |

### 1.2 Chosen rule set

- **Reference (section 2.1):** the official game "5D Chess With Multiverse Time Travel" (Thunkspace, 2020), as
  implemented by S1 and S2. Where S1 and S2 disagree with the official game, I follow the official game:
  - **Promotion.** S4's `Standard` header allows `Q,N,R,B`, and 5d-chess-js offers every piece. The official game
    promotes **only to a queen** (S3, S5). I chose queen only.
  - **Castling through check.** 5d-chess-js tests attacks on the king's own board only. This does not matter for
    5D-lite, which has no castling.
- **Normative for this app (section 2.2): 5D-lite.** This is my own design, derived from the official rules and cut
  down so that it fits the quantum engine. The main changes:
  1. One move per ply, played on your earliest board (a one-move form of the "present").
  2. Capture the king. There is no check.
  3. 5×5 Gardner boards.
  4. You may open a new timeline only when you have not opened more than your opponent, and at most two each. So
     there are at most 5 timelines, and every timeline is active.
  5. A history window of 2 turns.

  The quantum layer sits on top of this.

**Board size: 5×5 (Gardner).**

- **UI.** 5D-lite shows up to 5 timelines × about 5–9 boards. At 5×5 that is at most about 1,100 cells. At 8×8 it
  would be about 2,900 cells, which is unreadable on a laptop and impossible on a phone.
- **Engine.** The quantum layer keeps up to 64 worlds, each a whole multiverse. At 5×5 a world is at most 25 boards
  × 25 cells. Queen move generation over 80 directions stays cheap.
- **Precedent.** The official game ships small-board modes (S2, S6), and the standard 5dpgn puzzles are 5×5 (S3).
  Gardner's 5×5 position is the best-known and best-studied 5×5 chess (S7), and it uses exactly the "5 pawns + R N B
  Q K" reduced set of the official small modes.
- **Rules.** Gardner's AISE rules have no double step, no en passant and no castling. This removes all per-piece
  "has moved" flags, which matters because boards are copied into new timelines.

---

## 2. Classical rules

### 2.1 Reference: the official 5D rules (summary, for context; not implemented)

- **Multiverse.** A 2-D arrangement of 8×8 boards: timelines (rows, index L) × time (columns).
  - Each time step T (≥ 1) has a *white-to-move* board and a *black-to-move* board: two "sub-steps".
  - The game starts with one board, (L0, T1, white to move).
- **Coordinates.** A square is (L, T, file, rank). A piece moves along four axes: file, rank, T (one step = one full
  turn, always to a board of the **same colour to move**) and L (one step = the neighbouring timeline).
- **Pieces.**
  - Rook: any distance along 1 axis.
  - Bishop: along exactly 2 axes, equal distance.
  - Unicorn: 3 axes.
  - Dragon: 4 axes.
  - Queen: any number of axes, equal distance.
  - King: one step along any number of axes.
  - Knight: 2 along one axis and 1 along another.
  - Princess: rook + bishop.
  - Common king: a non-royal king. Royal queen: a royal queen.
  - Every move except the pawn's is symmetric in all four axes (S1 `movePos`/`moveVecs`).
- **Pawns.**
  - A pawn steps one square forward in rank, or one timeline "forward" at the same T. White goes towards negative
    L, Black towards positive L (S1 `timelineMove(l, −forward)`; S2 `forward_l`).
  - An unmoved pawn may double-step in either direction.
  - It captures diagonally forward on its board, or one timeline forward and one T earlier or later (the "T-L
    diagonal").
  - En passant exists on the board only.
  - It promotes to a queen on the last rank.
- **Moves create boards.**
  - Only the **latest** board of a timeline can be moved from, and only by the player whose colour is to move on it.
  - A move gives the source timeline its next board.
  - If the piece lands on another board:
    - if that board is the latest board of its timeline (and so the mover's colour), that timeline also gets its next
      board containing the piece: a **non-branching jump**;
    - otherwise a **new timeline** is created. Its first board is a copy of the target board plus the arriving piece,
      one sub-step later. White's new timelines are numbered +1, +2, … and Black's −1, −2, …
- **Active timelines.** L0 is active. The n-th timeline created by a player is active if the opponent has created at
  least n−1 timelines.
- **The present.** The present is the earliest end (latest board) among the active timelines.
  - **Mandatory** boards: active timelines whose latest board is at the present.
  - **Optional** boards: other timelines whose latest board has the mover's colour, including inactive ones.
  - A player makes any number of moves and may **submit** only once the present has passed to the opponent (S2
    `submit`, `get_timeline_status`).
  - Travelling back in time moves the present back to the new timeline.
- **Check and mate.**
  - A player is in check if, after they pass on all their boards, the opponent could capture any royal piece with one
    move. This includes kings on past boards, because moves onto past boards are legal.
  - An action may not leave the player in check.
  - **Checkmate**: in check and no legal action. **Softmate**: only time travel escapes. **Stalemate**: no legal
    action while not in check, which is a draw.
- **Variants.** Standard, Turn Zero, Two Timelines (−0/+0), Princess, Reversed Royalty, Defended Pawn, Half
  Reflected, Very Small - Open (4×4) and others.

### 2.2 Normative: 5D-lite classical rules

#### 2.2.1 Multiverse, boards and coordinates

- **Board.** 5×5. Files a–e (x = 0..4), ranks 1–5 (y = 0..4). Cell index `c = 5·y + x`: a1 = 0, e1 = 4, a2 = 5, …,
  e5 = 24. Every cell of every board exists.
- **Half-step index h** (0, 1, 2, …): `h = 2·(T−1) + colour`, where colour 0 = White to move and 1 = Black to move.
  T is the turn number shown to players: (T1, White) = h0, (T1, Black) = h1, (T2, White) = h2, and so on.
- **Timelines.**
  - L ∈ {−2, −1, 0, +1, +2}. L0 exists from the start.
  - White opens +1, then +2. Black opens −1, then −2.
  - The set of existing L values is therefore always contiguous.
  - Each timeline has a `start` h (its first board), an `end` h (its latest board) and a `parent` (L, h): the board it
    branched from (null for L0).
- **Board name.** `(L T)` plus the colour, written `(0T3w)` or `(−1T2b)`. In move keys the colour is omitted, because
  it is always the mover's.
- **History window.**
  - A timeline stores only its boards with `h ≥ end − 4`: its latest board and the 4 before it, so at most 5 boards.
  - Older boards are deleted when the timeline advances. A deleted board no longer exists for any purpose.
  - Consequence: from your latest board you reach back at most **2 turns** on the same timeline.
- **Board existence.** Board (L, h) *exists* iff timeline L exists, `start(L) ≤ h ≤ end(L)` and `h ≥ end(L) − 4`.

#### 2.2.2 Movement (4 axes: x, y, t, l)

A vector is (dx, dy, dt, dl). dt counts **full turns**: a step changes h by 2·dt, so it always lands on a board of the
same colour. dl counts timelines.

- A move goes from square s on board (Ls, hs) to square s′ on board (Ld, hd) with `Ld = Ls + dl·k` and
  `hd = hs + 2·dt·k`.
- Every board touched must exist. For riders this includes every intermediate step.
- Every intermediate square must be empty.
- The target square must be empty or hold an enemy piece (a capture).

| Piece | Vectors | Kind |
|---|---|---|
| Rook R | the 8 unit vectors along one axis | ride |
| Bishop B | the 24 vectors with exactly two non-zero entries, each ±1 | ride |
| Queen Q | the 80 non-zero vectors with entries in {−1, 0, 1} | ride |
| King K | the same 80 vectors | leap (one step) |
| Knight N | the 48 vectors with one entry ±2, another ±1, the rest 0 | leap |
| Pawn P (White; Black mirrors y and l) | quiet: (0,+1,0,0) (board step) and (0,0,0,−1) (timeline step). Capture only: (±1,+1,0,0) (board diagonal) and (0,0,±1,−1) (T-L diagonal). | leap, with modes |

- **Pawns.** No double step and no en passant. A pawn never moves along t alone, and never towards its own side in
  l. White's pawns go towards negative L (Black's timelines), Black's towards positive L.
- **Riders.** Rides are naturally short:
  - x and y: at most 4 steps;
  - t: at most 2 steps back (the window). Forward in t is possible only onto another timeline whose later board
    exists;
  - l: at most 4 steps.

#### 2.2.3 Kinds of move and what they build

Let the source board be `s = (Ls, hs)`: the latest board of Ls, with the mover's colour. Let the target board be
`d = (Ld, hd)`.

| Kind | Condition | Effect |
|---|---|---|
| **Physical** | d = s | Ls gets board hs+1: a copy of s with the move made. |
| **Jump** (non-branching) | d ≠ s and hd = end(Ld) | Ls gets hs+1 (a copy of s without the piece). Ld gets hd+1 (a copy of d with the piece on s′, capturing what was there). |
| **Branch** | hd < end(Ld) (d is a past board; Ld may equal Ls) | Ls gets hs+1 (without the piece). A new timeline Ln is created with `start = end = hd+1` and `parent = (Ld, hd)`. Its board is a copy of d with the piece on s′, capturing what was there. `made[mover] += 1`. |

- **Ln.** White: +1 if White has opened none yet, else +2. Black: −1 or −2.
- **Branch permission.** A branch is legal only if `made[mover] ≤ made[opponent]` and `made[mover] < 2`: you may
  open a timeline only if you have not opened more than your opponent. So every timeline is always active. A move
  whose target is a past board is simply not available without permission.
- **After every move.** Each advanced or created timeline is pruned to its window. Every new board has the opponent
  to move.

#### 2.2.4 Turn order and the present

- White moves first. Plies alternate. Each ply is exactly one move.
- **Your boards:** the latest boards with your colour to move. **Your present:** those of your boards with the
  smallest T.
  - You must move from a board in your present.
  - If no legal move starts from a board in your present, your present becomes your next-earliest boards, and so on.
  - If you have no legal move at all, the game is drawn (stalemate).
- **You always have at least one board.** The opponent's last move advanced its source board to your colour.
- **Why the present rule.** Every timeline keeps advancing: a laggard timeline must be played until it catches up.
  Without it, a player could freeze a timeline by never playing on it, which the official present also forbids. After
  a branch, the new timeline is the earliest, so the opponent must answer there next. This is the official "present
  moves back".

#### 2.2.5 Setup (Gardner): one board (0T1w)

5DFEN (S3 syntax, ranks 5 → 1): `[rnbqk/ppppp/5/PPPPP/RNBQK:0:1:w]`

| Side | a | b | c | d | e |
|---|---|---|---|---|---|
| Black rank 5 | r a5 | n b5 | b c5 | q d5 | k e5 |
| Black rank 4 | p a4 | p b4 | p c4 | p d4 | p e4 |
| rank 3 | – | – | – | – | – |
| White rank 2 | P a2 | P b2 | P c2 | P d2 | P e2 |
| White rank 1 | R a1 | N b1 | B c1 | Q d1 | K e1 |

`made = {w: 0, b: 0}`. White to move.

#### 2.2.6 Special moves and promotion

- There is no castling, no double step and no en passant.
- **Promotion.** A pawn that reaches its last rank by a board move (White rank 5, Black rank 1) becomes a **queen** at
  once. There is no choice (official 5D rule). Timeline moves and T-L captures keep the rank, so they never promote.

#### 2.2.7 Winning and drawing

- **Win: capture any enemy king** on any board, in any timeline. This includes:
  - a king left behind on a past board, reached by time travel (the branch is created and the game ends);
  - a king on another timeline's latest board (a jump).
- Kings are royal wherever they are. A king that travels into the past leaves two kings of its side on the new
  timeline, and losing either loses the game. A timeline may have no king of a side.
- **Draws:**
  - no legal move (2.2.4);
  - 100 plies in a row without a capture or a pawn move;
  - ply 1000, a technical cap that guarantees `h < 1024`.
- There is **no** check and no mate test. Resign and draw agreement are generic.

---

## 3. Engine mapping (contract)

### 3.1 Module header

```js
export default {
  id: 'multiverse', category: 'dimensions',
  name: () => t('quantumchess', 'Multiverse (5D)'),
  sides: [{ id: 'w', name: () => t('quantumchess', 'White'), color: '#f4f1ea' },
          { id: 'b', name: () => t('quantumchess', 'Black'), color: '#2b2b2b' }],
  enemies: (a, b) => a !== b,        // no teams
  options: [],                        // none (see open questions: 4×4 "Very Small - Open")
  visibility: undefined,              // full information
  worldLevel: true,                   // implements generate/apply/... itself (section 3.4)
}
```

### 3.2 Square encoding (static integers with caps)

- `u = L + 2` ∈ 0..4. `h` ∈ 0..1023 (`H_MAX = 1024`, guaranteed by the ply cap: the largest `end` grows by at most
  1 per ply). `c = 5·y + x` ∈ 0..24.
- **`sq = (u·1024 + h)·25 + c`**, range 0..127,999. The board id is `bid = u·1024 + h`.
- Decode: `c = sq % 25`, `bid = ⌊sq/25⌋`, `h = bid % 1024`, `u = ⌊bid/1024⌋`.
- The encoding is stable for the whole game: a square keeps its number while its board exists.
- Examples:
  - (0T1w)a1 = 51200
  - (0T1w)e5 = 51224
  - (−2T3b)c3: u = 0, h = 5 → 137
  - (+2T500b)e5: u = 4, h = 999 → 127399
- Topology coordinates of `sq`: (x, y, h, l). Movement uses (dx, dy, dt, dl) with `Δh = 2·dt`, and a dynamic
  existence test (2.2.1). The generic `core/topology.js` grid cannot express "board exists", so the module generates
  moves itself, reusing the vector tables.

**Move keys** (square-based, canonical):

```
board   = "(" L "T" T ")"        ; L in -2..2 written "-2","-1","0","1","2"; T >= 1; colour = mover's
sq      = file rank              ; "a".."e" "1".."5"
std     = board sq "-" [board] sq ["=Q"]     ; target board omitted iff it equals the source board
split   = board sq "-" sq "|" sq             ; physical only; first target has the lower cell index
merge   = board sq "|" sq "-" sq             ; physical only; first source has the lower cell index
measure = "?" board sq                        ; a part of an own ghost on one of the mover's present boards
```

- Examples:
  - `(0T1)b1-c3` (physical)
  - `(0T2)c3-(0T1)a3` (time travel, a branch)
  - `(0T4)a3-(-1T4)a3` (a jump)
  - `(0T6)b4-b5=Q`
  - `(0T1)b1-a3|c3`
  - `(0T2)a3|c3-b1`
  - `?(-1T2)a3`
- The lenient parser also accepts `(+1T4)`, `(L1T4)` and a missing `=Q`.
- **Display notation** (move list) follows 5dpgn, S3: `(0T2)Nc3>>(0T1)a3` for a branch, `(0T4)Ra3>(-1T4)a3` for a
  jump, `x` for captures.

### 3.3 Piece types

`AX = [x, y, t, l]`. `ROOK8`, `BISHOP24`, `QUEEN80` and `KNIGHT48` are as in 2.2.2. Oriented vectors are mirrored for
Black in **y and l** (not t, not x).

```js
pieceTypes: {
  k: { moves: [{ leap: QUEEN80 }], royal: true, solid: true, splittable: false, value: 0,  glyph: 'K' },
  q: { moves: [{ ride: QUEEN80 }],  splittable: true, value: 950, glyph: 'Q' },
  r: { moves: [{ ride: ROOK8 }],    splittable: true, value: 400, glyph: 'R' },
  b: { moves: [{ ride: BISHOP24 }], splittable: true, value: 350, glyph: 'B' },
  n: { moves: [{ leap: KNIGHT48 }], splittable: true, value: 350, glyph: 'N' },
  p: { moves: [{ leap: [[0,1,0,0],[0,0,0,-1]],                  oriented: true, mode: 'move' },
               { leap: [[1,1,0,0],[-1,1,0,0],[0,0,1,-1],[0,0,-1,-1]], oriented: true, mode: 'capture' }],
       solid: true, splittable: false, value: 100, glyph: 'P' },
}
```

- **Royal:** k. **Solid:** k, p. **Splittable:** q, r, b, n (including promoted queens).
- **Values (AI).** In 4 axes the rook has 8 directions against the bishop's 24 and the knight's 48, so R is valued
  down relative to 2-D chess, and N and B are equal and high. The AI evaluation:
  - **Material:** summed over the **latest board of every timeline**. Duplicating a winning position into a new
    timeline therefore counts double, which matches how 5D players value timelines.
  - **King danger:** minus the chance that each own king instance is capturable in one enemy move, on every stored
    board of the enemy's colour, **including past boards**. A king that was attacked in the past cannot run.
  - **Branch right:** +40 for having branch permission when the opponent does not.

### 3.4 World object and world-level functions

```js
world = {
  n: 5,
  made: [w, b],                         // timelines opened by White / Black (0..2 each)   } skeleton:
  lines: {                              // key L; only existing timelines                     } identical in
    0: { start: 0, end: 7, parent: null,                                                    // every world
         boards: { 3: Uint16Array(25), 4: ..., 7: ... } },   // only h in [max(start,end-4), end]
    1: { start: 1, end: 5, parent: [0, 0], boards: {...} },
  },
  kingTaken: null | 0 | 1,              // the side that captured a king in this world
  quiet: 0,                             // plies since a capture or pawn move happened in this world
}
```

**Cell code:** 0 = empty, otherwise `id·8 + type`, with type 1 P, 2 N, 3 B, 4 R, 5 Q, 6 K. Type is stored **per
cell**, so history boards still show a pawn that later promoted.

**Piece ids.**

- Starting ids are bases 0..31: White K 0, Q 1, R 2, B 3, N 4, P a–e = 5–9. Black k 16, q 17, r 18, b 19, n 20,
  p a–e = 21–25.
- **Custom test positions:**
  - Timeline L gets creation index k: L0 = 0; opened timelines 1..`made[0]+made[1]`, in the order they were opened.
  - Its pieces get `base + (k === 0 ? 0 : 32 << (k−1))`.
  - Bases follow the cell order of its first stored board: White from 0, Black from 16.
  - A piece keeps its id on the later boards of the same timeline.
- `side(id) = (id % 32) < 16 ? White : Black`.
- **Copies on a new timeline get fresh ids; the travelling piece keeps its own.** When the k-th timeline of the game
  is created (k = `made[0] + made[1]` after the increment, 1..4), each piece copied from board d gets
  `id' = id + (32 << (k−1))`.
  - Before creation k every id is below `32 << (k−1)`, so this is injective and never collides.
  - It does not depend on world contents, so it is identical in all worlds. The largest id is below 512.
  - Copies of a ghost are **twins**: linked to the original through the shared worlds (4.6).
  - Invariant: each id appears at most once over all **latest** boards of a world. History boards keep the ids they
    had.

**Functions.** In the contract's names, plus the extensions in 3.6:

- `present(world, side)`: the side's present boards, derived from the skeleton only.
- `generate(world, side)`: classical moves from the side's present boards, including present widening (2.2.4).
  Returns standard keys only. The quantum layer adds split, merge and measure.
- `apply(world, move)`: for a world where the move happens. Performs the structural effect (2.2.3) and the piece
  change.
  - A capture of a royal piece sets `kingTaken`.
  - Promotion is automatic.
  - `quiet` is reset on a capture or pawn move, and incremented otherwise.
  - Timelines are pruned to the window.
- `occupantAt(world, sq)`: the id at `sq`, or null (also when the board does not exist).
- `locate(world, id)`: the square(s) of `id` on **latest boards** only. There is 0 or 1 per world.
- `worldKey(world)`: the skeleton + every stored board + `kingTaken` + `quiet`.
- `solidKey(world)`: the squares of every K and P on the latest boards. The history of solid pieces is identical in
  every world by construction.
- `projection(world, side)`: every (board, cell, id, type) of that side over **all stored boards**, history included
  (4.7).
- `worldResult(world, ctx)`:
  - `kingTaken !== null` → `{ winner: kingTaken, reason: 'king' }`;
  - `quiet ≥ 100` → `{ winner: null, reason: 'quiet' }`;
  - `ctx.ply ≥ 1000` → `{ winner: null, reason: 'length' }`;
  - otherwise null.
- `layout(state)`: dynamic (section 6).
- `extraMoves` / `afterMove`: not used. The pawn timeline moves are in the descriptors (3.3). What `afterMove` would
  do (promotion, `kingTaken`, `quiet`, pruning, `made`) happens inside `apply`.

### 3.5 Move generation per world, exactly

1. **Boards.** `B` = the mover's present boards. Iterate every piece of the mover on each board in `B`.
2. **Vectors.** For each descriptor vector v, for k = 1, 2, … (only k = 1 for leapers):
   - target = (Ls + k·dl, hs + 2k·dt, x + k·dx, y + k·dy);
   - stop if the board does not exist or (x, y) is off the board;
   - if the square is empty: emit it (quiet, unless the mode is capture-only) and continue riding;
   - if it holds an enemy: emit a capture (unless the mode is move-only) and stop;
   - if it holds an own piece: stop.
3. **Classify** the target board (2.2.3). Drop branches without branch permission.
4. **Promotion.** A pawn board move reaching its last rank gets `=Q`.
5. **Per-world key:**
   - `move`: the piece is on the source in this world and the key is generated, with a quiet target;
   - `capture`: the same, with an enemy on the target;
   - `miss`: otherwise.

### 3.6 Contract extensions needed

1. **The skeleton is global.** `made` and every timeline's `start`, `end` and `parent` must be identical in all
   worlds after every ply. Add `validateState` invariant **I-5D**.
2. **`applyMiss(world, move, structural)`**, called for every surviving world where the move did not happen:
   - `structural = true` when the move happened in at least one surviving world. Build the same boards as `apply`,
     but move no piece: the source passes; a jump target passes; a branch is an untouched copy of d with fresh ids.
     `made` is incremented.
   - `structural = false` when no surviving world has the move (a rolled **Missed**). Only the source board passes:
     no branch is created, no target advances, and `made` is unchanged.
   - `quiet += 1` in both cases.
   - For other variants the default is the identity.
3. **`pass(world, bid)`** for Measure: the board `bid` (a present board of the mover holding a part of the measured
   piece) passes, so its timeline advances by an unchanged copy.

A split calls `apply` with the physical moves f→t1 and f→t2 for its two children. It calls `applyMiss(…, true)` for a
child whose lane is blocked, and for worlds without X on f. A merge works the same way. After every ply the generic
layer must **deduplicate worlds by `worldKey`** (pruning can make worlds identical).

### 3.7 Size

- Per world: at most 5 timelines × 5 boards × 25 cells. With up to 64 worlds, that is 40,000 cells.
- **Intern boards:** keep one frozen `Uint16Array` per distinct board content. Most history boards are shared by all
  worlds.
- A world key is about 1–2 KB.

---

## 4. Quantum adaptation (all decisions)

The shared rules apply unchanged: split, merge, measure, land = roll, pass = link, solid roll, game-end roll, budget
8 per side, 64 worlds, 4 locations per split. The decisions specific to 5D:

- **D1: the skeleton is shared.** Which timelines exist, where they start and end, and who has opened how many are
  the same in every possibility.
  - Therefore the present, branch permission and "is this target a branch?" are decided once, for all worlds.
  - Only the pieces on the boards differ between worlds.
- **D2: split and merge are physical.** Every square named (f, t1, t2, or f1, f2, t) is on **one** present board of
  the mover.
  - The targets must be certainly empty on that board and reachable by a quiet board move. They are never rolled.
  - Their structural effect is just "this board advances", the same in every world.
  - A split through time would open a timeline in only half the worlds, which D1 forbids. A merge from two boards
    would advance two present boards in one ply.
- **D3: ghosts may travel.** A part of a ghost may make any move, including a jump or a branch. The move happens in
  the worlds where the piece really stands on that square. In the other worlds (`applyMiss(…, true)`):
  - the new timeline still opens, as an **untouched copy of the past**;
  - the jumped-to timeline passes.

  The result is a piece that is "50% here, 50% in timeline +1", linked across timelines. Player wording: "Where your
  ghost wasn't really there, the new timeline still opens, but nobody arrives."
- **D4: a rolled Missed builds nothing new.** If a move is rolled (measured class M, or the budget fallback) and the
  result is **Missed**, only your source board passes (the turn is used): no branch opens and no other timeline
  advances. Branch rights are spent only when a branch is actually created.
- **D5: measured class M on other boards.** A standard move is in M if the mover is solid (K, P), or if the target
  square may hold another piece in any world.
  - On a board other than the source, **the mover's own id counts as another piece**. That is its past self, a
    friendly piece that blocks in that world.
  - The "moving onto its own part" exception of the classic rules applies only on latest boards, where the id marks a
    real part.
  - Consequence: time-travelling onto a square where a ghost stood in the past is a roll (**land = roll**, through
    time).
- **D6: pass = link through time and across timelines.** A rider whose path crosses a square that holds a piece in
  some worlds (on an intermediate past board or timeline) is blocked there and arrives elsewhere. No roll, unless the
  budget is full. The rider becomes linked to that piece's past position (test Q3).
- **D7: twins.** When a branch copies a board that holds ghost parts:
  - the copies get fresh ids (3.4) but sit on the same squares in the same worlds, so they are **perfectly linked**
    to the originals;
  - measuring either one settles both (test Q4);
  - twins never raise the budget, because the copy is a function of what is already stored.
- **D8: the past remembers.** The budget projection includes the history boards in the window.
  - After a **merge**, the piece is solid at once, but the possibilities that differ only in the ghost's old squares
    stay separate until those boards leave the window: up to 2 turns (4 of that timeline's boards).
  - A **Measure** frees the budget at once, because it discards possibilities.
  - The rule is needed for the world bound: without it, histories would multiply worlds beyond 8 × 8.
  - The ownership lemma still holds: an opponent's move only adds your copied pieces (a function of your projection)
    or drops old boards. So they never raise your budget.
- **D9: Measure is played on a present board.**
  - Measure a ghost that has a part on one of your present boards. The roll is over **all** its parts, on any
    timeline.
  - That board then passes (nothing moves on it) and the ply is used.
  - Ghost parts that sit only on boards outside your present cannot be measured until those boards come into your
    present.
- **D10: solid roll and game-end roll** are generic.
  - Kings and pawns only ever move by rolled moves, and copies of them are solid, so the solid roll is a safety net
    only.
  - A king capture can differ between worlds only through a rolled merge. `quiet` can differ, so the game-end roll
    handles it.
- **D11: king capture in the past.**
  - The move is a branch onto the king's past square, always in class M (the target holds the king in every world
    where the board has it).
  - If the capturing piece is a ghost, it is a roll: Captured (the branch opens, the game ends) or Missed (only your
    board passes, D4).
- **D12: promotion** happens only when the pawn move really happens. It is always rolled or certain, never quantum.
- **D13: present widening and legality.** "A move exists on this board" means a key that is non-miss in at least one
  world, or a split, merge or measure on that board.
- **D14:** there is **no "cannot escape" shortcut** (the classic rule): the 4-D two-ply test is too expensive and hard
  to explain. The king-danger ring still shows the chance for every own king instance on boards of the opponent's
  colour, past boards included, and the confirmation dialog uses it.

---

## 5. Player-facing rules text (rules card)

- Every move leaves the old board behind as history. The game grows to the right in time, and up to five timelines
  stack on top of each other.
- Pieces move in four directions: across the board, back in time (one step = one turn, onto a board where it is your
  move) and across timelines. A rook goes along one direction, a bishop along two equally, a queen or king along any
  number, and a knight 2 along one and 1 along another.
- You make one move per turn, on one of your boards in the **present**: the leftmost boards where it is your move
  (highlighted).
- Moving onto a board that has already been played (the past, or a timeline that has moved on) opens a **new
  timeline** in which your piece arrives. You may open one only if you have not opened more than your opponent, at
  most two each, and you can reach back at most two turns.
- **Capture any enemy king on any board and you win**, even a king in the past. Kings on old boards cannot run away,
  so guard where your king *was* as well as where it is.
- Pawns step forward on the board or one timeline towards the opponent's timelines. They capture diagonally on the
  board, or one timeline forward and one turn earlier or later. They become queens.
- Split and merge happen within one board. A ghost can travel in time: where it wasn't really there, the new
  timeline still opens, but nobody arrives.
- The past remembers ghosts: a ghost's old squares on history boards count toward your budget until those boards
  fade out, two turns later.

---

## 6. UI layout

`layout(state)` is dynamic. It returns `{ cells, boards, lines, labels, width, height }` in board units (1 = one
cell).

- **Grid of boards.**
  - Rows are the existing timelines, sorted by L ascending: **Black's timelines on top, White's below**. White's
    pawns move up in rank and in timeline together.
  - Columns are half-steps h, from `hMin` (the smallest stored h) to `hMax` (the largest end).
  - Board origin: `x0 = 2 + (h − hMin)·6`, `y0 = 1.5 + row·6.5`. That is 5 cells plus a gap of 1 horizontally and
    1.5 vertically.
  - Cell (x, y) sits at `(x0 + x, y0 + 4 − y)`, so rank 1 is at the bottom of each board.
  - Typical size is about 3–5 rows × 5–9 columns. The maximum is about 56 × 34 units.
- **Cells.** `shape: 'square'`. `shade = (x + y) % 2 === 0 ? 'dark' : 'light'`, so a1 is dark.
- **Board frames** (`boards[]`: `{ bid, x, y, w: 5, h: 5, colour, latest, present, playable }`).
  - The frame colour shows who is to move: a light frame (`--qc-frame-white`, #f4f1ea) for White-to-move boards, a
    dark frame (`--qc-frame-black`, #2b2b2b) for Black-to-move boards.
  - Past (non-latest) boards: cell shades at about 80% contrast. Pieces stay at full opacity, so ghost percentages
    remain readable.
  - The mover's **present** boards: a 3 px accent outline (purple, #7c5cff, as the official game uses purple for the
    present).
  - **The present line:** a translucent vertical accent band behind the present column.
- **Lines.**
  - Thin arrows between consecutive boards of a timeline.
  - **Branch connectors:** a cubic curve from the right edge of the parent board (Lp, hd) to the left edge of the new
    timeline's first board. If the parent board was pruned, the curve starts at the left margin of the parent row. It
    is drawn in the creator's colour with an outline.
  - Link threads (chain icon) between twins and cross-timeline ghost parts, as in the classic UI.
- **Labels.**
  - Row labels on the left, as chips coloured by the creator: `L−2`, `L−1`, `L0`, `L+1`, `L+2` (typographic minus).
  - Column labels on top: `T3` with ○ for White to move or ● for Black to move.
  - A small counter by each player's name: "timelines opened 1/2", greyed when that player may not branch now.
- **Glyphs.** All pieces are orthodox, so use the cburnett sprites. No new glyphs.
- **Move preview.** Selecting a piece highlights targets **on every board**.
  - Branch targets carry a small fork badge and the tooltip "opens timeline L+1".
  - Past targets not allowed because of the branch rule are greyed, with the tooltip "Opening a timeline now would
    put you two ahead of your opponent" or "You have opened two timelines".
  - Jump targets show both boards as advancing.
- **Compact mode** (default below 900 px wide, toggle elsewhere): show only the boards with the colour of the side
  to move. These are the only boards a move can land on. This halves the columns: `x0 = 2 + (T − Tmin)·6`.
  - Phones also get pinch-zoom, and "centre on present" as the default scroll.
- **King danger** rings on every king instance on boards of the opponent's colour, past boards included.

---

## 7. Test cases

Positions use 5DFEN board strings: `[ranks 5→1 : L : T : w|b]`. `made` and the side to move are given. An unlisted
history board does not exist: the timeline starts at the first listed board. `A`/`B` name possibilities (worlds),
with their weights. The start position is `S = rnbqk/ppppp/5/PPPPP/RNBQK`.

### Classical

**C1: start move list.**
- Position: S at (0T1w), White to move.
- Expected: exactly 8 legal moves:
  - `(0T1)a2-a3`, `b2-b3`, `c2-c3`, `d2-d3`, `e2-e3`
  - `(0T1)b1-a3`, `(0T1)b1-c3`
  - the split `(0T1)b1-a3|c3`
- No move leaves (0T1): there is no other board. There is no measure.

**C2: a branching knight.**
- Plies: 1. `(0T1)b1-c3` 2. `(0T1)b5-a3` 3. `(0T2)c3-(0T1)a3`.
- Expected after ply 3:
  - L0 end = h3: (0T2b) = `r1bqk/ppppp/n4/PPPPP/R1BQK`.
  - New timeline **L+1**, `start = end = h1`, `parent = (0, h0)`: (1T1b) = `rnbqk/ppppp/N4/PPPPP/RNBQK`. The
    traveller on a3 keeps id 4; the copied knight on b1 has id 36.
  - `made = {w: 1, b: 0}`.
  - Black's present = {(1T1b)} only.

**C3: the present is enforced.**
- After C2, Black plays `(0T2)a3-c2`.
- Expected: illegal (`not_present`). Black must play on (1T1).

**C4: branch permission.**
- After C2, 4. `(1T1)e4-e3`. White's only board is now (1T2w).
- Expected:
  - Every legal White move has its target on (1T2).
  - `(1T2)b1-(0T2)b3` (a knight with dl = −1, dy = +2; (0T2w)b3 is empty) is illegal (`branch_limit`): White has
    opened 1 timeline and Black 0.

**C5: a non-branching jump.**
- Position, `made = {w:0, b:1}` (L−1 has creation index 1, so its ids are +32), White to move:
  - L0 starts at h6: (0T4w) = `4k/5/R1P2/5/K4`.
  - L−1 starts at h4, three boards:
    - (−1T3w) = `4k/5/2n2/5/K4`
    - (−1T3b) = `4k/5/2n2/K4/5`
    - (−1T4w) = `4k/5/5/K4/1n3`
- White's present = {(0T4w), (−1T4w)}.
- Move `(0T4)a3-(-1T4)a3` (rook, dl = −1).
- Expected:
  - Certain.
  - (0T4b) = `4k/5/2P2/5/K4` and (−1T4b) = `4k/5/R4/K4/1n3`.
  - No new timeline. `made` is unchanged.
  - Black's present = both T4b boards.

**C6: pawn timeline moves** (C5 position).
- (a) `(0T4)c3-(-1T4)c3`: certain jump. (0T4b) = `4k/5/R4/5/K4` and (−1T4b) = `4k/5/2P2/K4/1n3`.
- (b) `(0T4)c3-(1T4)c3`: illegal. There is no L+1, and White pawns never move towards +L.
- (c) `(0T4)c3-(0T3)c3`: illegal. A pawn never moves along t alone.
- (d) `(0T4)c3-(-1T3)c3`: a T-L diagonal capture of the knight on (−1T3w)c3. It is a branch; White may branch
  (0 ≤ 1).
  - Certain capture.
  - New **L+1**: `start = h5`, `parent = (−1, h4)`, (1T3b) = `4k/5/2P2/5/K4`. The copies get the offset of the 2nd
    creation (+64).
  - (0T4b) = `4k/5/R4/5/K4`.
  - `made = {w:1, b:1}`.
  - Black's present = {(1T3b)}. (−1T4w) is still White's, untouched.

**C7: capturing a king in the past wins.**
- Position (one world), White to move, `made = {0, 0}`. L0 starts at h2:
  - (0T2w) = `4k/N4/5/5/K4`
  - (0T2b) = `2N1k/5/5/5/K4`
  - (0T3w) = `2Nk1/5/5/5/K4`
- The knight on c5 does not attack d5 on the board.
- Move `(0T3)c5-(0T2)e5`: a knight move with dx = +2, dt = −1, onto the king's T2 square.
- Expected:
  - Certain capture. A branch L+1 is created: (1T2b) = `4N/N4/5/5/K4`.
  - `kingTaken = White` → **White wins** (reason `king`).
  - Before the move, the danger ring on the black king at (0T2w)e5 shows 100%.

**C8: the history window.**
- Position, White to move. L0 starts at h0:
  - h0 `1k3/5/5/5/1K1R1`
  - h1 `1k3/5/5/5/1K2R`
  - h2 `k4/5/5/5/1K2R`
  - h3 `k4/5/5/5/K3R`
  - h4 `1k3/5/5/5/K3R`
  - h5 `1k3/5/4R/5/K4`
  - h6 = (0T4w) `k4/5/4R/5/K4`
- Stored: h2..h6. (h0 and h1 were pruned.)
- Expected:
  - `(0T4)e3-(0T3)e3` is legal (a branch).
  - `(0T4)e3-(0T2)e3` is legal: the rook rides dt = −1 twice, and (0T3w)e3 is empty.
  - `(0T4)e3-(0T1)e3` is illegal: (0T1w) is not stored.

**C9: promotion.**
- (0T6w) = `4k/1P3/5/5/K4`.
- `(0T6)b4-b5=Q` → (0T6b) = `1Q2k/5/5/5/K4`.
- The lenient `(0T6)b4-b5` is parsed to the same move.
- `(0T6)b4-b5=N` is illegal (queen only).

### Quantum

**Q1: a ghost travels in time (cross-timeline link).**
- Plies from S: 1. `(0T1)b1-a3|c3` (split; A = a3, B = c3, 50/50) 2. `(0T1)e4-e3` 3. `(0T2)c3-(0T1)e3`.
- Expected on ply 3:
  - Not in M: the knight is not solid, and (0T1w)e3 is empty in every world.
  - Keys: A = miss, B = move → **quantum, no roll**. White's budget stays 2.
  - L+1 is created in **both** worlds:
    - A: (0T2b) = `rnbqk/pppp1/N3p/PPPPP/R1BQK` and (1T1b) = S.
    - B: (0T2b) = `rnbqk/pppp1/4p/PPPPP/R1BQK` and (1T1b) = `rnbqk/ppppp/4N/PPPPP/RNBQK`.
  - The board shows the knight (id 4) 50% on (0T2b)a3 and 50% on (1T1b)e3, joined by a link thread. The copy on
    (1T1b)b1 (id 36) is solid.
  - Black's present = {(1T1b)}.
- Follow-up: 4. `(1T1)d4-e3` is a **roll**:
  - 50% Captured (world B): the knight is gone everywhere.
  - 50% Missed (world A): the pawn stays on d4, and the knight is 100% on (0T2b)a3.

**Q2: a ghost captures a king in the past.**
- Two worlds, 50/50, White to move, `made = {0, 0}`. L0 starts at h2.
  - World A: the boards of C7.
  - World B: (0T2w) = `4k/N4/5/5/K4`, (0T2b) = `4k/5/5/1N3/K4`, (0T3w) = `3k1/5/5/1N3/K4`. At T2 the knight was
    split a4 → c5|b2.
- Move `(0T3)c5-(0T2)e5`. It is in M (the target holds the king), with keys A = capture and B = miss.
- Expected: a **roll**, 50/50.
  - **Captured:** world A kept. L+1 is created with (1T2b) = `4N/N4/5/5/K4`. White wins.
  - **Missed:** world B kept. **No L+1**: only (0T3) passes, so (0T3b) = `3k1/5/5/1N3/K4`. `made` stays {0, 0}. The
    knight is 100% on b2, and Black is to move on (0T3b).

**Q3: pass = link through time.**
- Plies from a custom L0 starting at h4, White to move, `made = {0, 0}`:
  - (0T3w) = `4k/5/2n2/5/B3K`. White plays `(0T3)e1-e2`.
  - Black splits `(0T3)c3-b1|d1` → worlds A (n on b1) and B (n on d1).
  - White plays `(0T4)e2-e3`.
  - Black plays `(0T4)e5-d5`.
  - Now (0T5w): A = `3k1/5/4K/5/Bn3`, B = `3k1/5/4K/5/B2n1`.
- Move `(0T5)a1-(0T3)c1`: a bishop riding (dx +1, dt −1) twice, through (0T4w)b1.
- Expected:
  - Not in M: (0T3w)c1 is empty in every world, and (0T3w) = h4 is still stored.
  - A: blocked by the knight on (0T4w)b1 → miss. B: clear → move.
  - **Quantum, no roll.** White's budget goes 1 → 2.
  - L+1 is created in both worlds, with (1T3b) = a copy of (0T3w). In B only, it also has the bishop (original id)
    on c1.
  - The bishop is 50% on (0T5b)a1 and 50% on (1T3b)c1, **linked** to the knight: bishop on a1 ⇔ knight on b1.
  - Black's present = {(1T3b)}.

**Q4: twins, and measuring one of them.**
- Plies from S:
  1. `(0T1)b1-a3|c3` (A = a3, B = c3)
  2. `(0T1)e4-e3`
  3. `(0T2)d2-d3`
  4. `(0T2)b5-(0T1)b3`: Black's knight, dy −2 and dt −1, onto (0T1b), which is empty in both worlds. Certain.
- Expected after ply 4:
  - L−1 is created, with `start = h2` and `parent = (0, h1)`:
    - A: (−1T2w) = `rnbqk/ppppp/Nn3/PPPPP/R1BQK`
    - B: (−1T2w) = `rnbqk/ppppp/1nN2/PPPPP/R1BQK`
  - The white knight copy (**twin**, id 36) is on a3/c3 in the same worlds as the original (id 4) on (0T3w).
  - White's present = {(−1T2w)}.
- Then 5. `?(-1T2)a3` rolls 50/50. Say it gives a3:
  - world A is kept;
  - the twin is solid on (−1T2)a3 **and** the original is solid on (0T3w)a3;
  - (−1T2w) passes → (−1T2b) is identical;
  - White's budget is 1.

**Q5: the past remembers (budget after a merge).**
- Plies from S:
  1. `(0T1)b1-a3|c3`
  2. `(0T1)e4-e3`
  3. `(0T2)a3|c3-b1` (merge; certain)
  4. `(0T2)d4-d3`
  5. `(0T3)b2-b3`
  6. `(0T3)a4-a3`
  7. `(0T4)c2-c3`
- Expected:
  - After ply 3 the knight is 100% on b1, **but** there are still 2 possibilities (they differ on (0T1b) and (0T2w)),
    and White's budget is 2/8.
  - It stays 2 after plies 4, 5 and 6.
  - After ply 7, L0 stores h3..h7 only. The two worlds coalesce: 1 possibility, and White's budget is 1/8.


---

## 8. Open design questions

1. **Contract extensions** (3.6): the shared skeleton invariant, `applyMiss(world, move, structural)` and
   `pass(world, bid)` for Measure. Without them, a missed or partly missed move would leave worlds with different sets
   of boards.
2. **Physical-only split and merge** (D2). A "time-travel split" (one half opening a timeline) would be spectacular,
   but it breaks the shared skeleton unless the branch opens in every world, as in D3. This could be a later
   extension: "at most one target may be a branch; the branch opens everywhere".
3. **History in the budget** (D8). This is the price of the 64-world bound: budget is freed only 2 turns after a
   merge. The alternative is to count only the latest boards and add a separate cap on worlds that differ only in
   history.
4. **Branch cap.** Once both sides have opened 2 timelines, the past is closed: only jumps remain, and kings on past
   boards become safe. An alternative is to retire the oldest non-main timeline when a 6th would be created. That is
   more faithful, but harder to explain and to lay out.
5. **Orientation.** White's timelines are drawn below L0 and Black's above, which matches the pawn directions. I
   could not verify the official game's on-screen orientation from here.
6. **Optional 4×4 setup.** The official "Very Small - Open" (`nbrk/3p*/P*3/KRBN`, S2) could be an `options` entry.
   It would be cheaper for the AI and more readable on phones.
7. **No "cannot escape" rule** (D14). If the classic rule is made generic in `core/`, it must enumerate past-board
   king captures. That is expensive in 4-D.
8. **AI cost.** The expectimax reply threat must include captures onto past boards. Move counts are at most about
   5 pieces × 80 directions × short rides per present board. Order branch captures of kings first.
