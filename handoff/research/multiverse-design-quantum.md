# Multiverse chess (Quantum 5D): complete design, lens "quantum depth"

Variant id `multiverse`, category `dimensions` (as in `src/variants/catalog.js`). Display name from the catalogue.

This design asks one question and answers it all the way down: **what is the most natural way for quantum
possibilities and the multiverse of *5D Chess With Multiverse Time Travel* to live together?** The answer is one
principle, and everything else follows from it:

> **Boards are certain, pieces are quantum.**
> Which timelines exist, which boards they have, where the present is and whose turn it is are the same in every
> possibility. What stands on the boards (the present boards *and* the past) may be uncertain. A move always builds
> its boards, whatever the dice say about the piece.

The lead's decision to add `applyMiss` ("the missed worlds get the same new boards, just without the piece moving") is
exactly this principle in code. With it the multiverse gets the full quantum rule set, including **pass = link through
time and across timelines**, which the competing design (`multiverse-design-playable.md`) had to drop.

Everything in this file is backed by a working prototype on a snapshot of the **current working-tree core** (with
Q1 `applyMiss`, Q2, Q6, Q7, Q9, Q14, U3) plus one small proposed hook: `handoff/prototypes/mv-quantum/`
(section 11). All numbers marked *measured* come from it (Node 22 on the development machine; phones are 1.5 to 3 times
slower). The 123 checks of `tests.mjs` pass; the fuzz ran about 4,100 random plies with invariants after each one.

Sources: `research/multiverse-rules.md` (R), `research/multiverse-pieces.md` (P), `research/multiverse-engines.md`
(E), the earlier spec `research/multiverse.md` (M), the competing design `research/multiverse-design-playable.md`
(D-P), `handoff/CORE-CHANGES.md` (CC), `docs/rules.md`, and the code in `src/variants/core/` and `src/variantplay/`.

---

## 0. The decisions at a glance

| # | Question | Decision |
|---|---|---|
| Q1 | What is classical? | The **skeleton**: timelines, their first and last board, their parent board, the timelines each side created, which are active, the present, the side to move (`solidExtra`). Also kings and pawns (solid, core rule), and board colours. |
| Q2 | What is quantum? | **Every non-solid piece on every stored board**: present boards, other timelines, and the history boards of the past. The past is drawn with its ghosts and their percentages. |
| Q3 | Timelines versus possibilities | **Timelines are AND, possibilities are OR.** All timelines exist at once and you play on all of them; of the possibilities only one is real and the dice find out which. A piece can be 50 % on one timeline and 50 % on another (one piece, two timelines), but a timeline never exists "50 %". |
| Q4 | What a move builds | **The structure follows the move** (`applyMiss`, always, rolled or linked): the source board passes, a jump's target board passes, a branch opens its timeline as an untouched copy of the past board, in every possibility where the piece did not move. So before any roll the player knows exactly which boards the move will create. |
| Q5 | Pass = link | **Real, in all four directions.** A ghost part may move, jump or travel into the past. Where it really stands it arrives; elsewhere the boards are still built and it stays home, linked. A rider whose path through the past is blocked in some possibilities is linked to the blocker. |
| Q6 | Land = roll | Unchanged, and it reaches into the past: landing on a square (present or past) that may hold a piece is rolled. Solid pieces (kings, pawns) always roll. |
| Q7 | The cost of trying | **Every attempt uses its boards**: a Moved, Linked or Missed move, and a Measure, all use the board(s) they name. No free probing. |
| Q8 | Split | Both halves land on **one board**: your own board, the latest board of another timeline (a *jump split*), or a board in the past (a *time split*, which opens one new timeline with the piece on two squares). Never on two boards: that would make the shape of the multiverse uncertain. |
| Q9 | Merge | Two parts **on one board** merge onto any square both can reach: on that board, on another timeline, or in the past. Parts on different boards can rejoin by moving one part onto the other (the core's join rule, no roll). |
| Q10 | Measure | Only a part on a board you may play now; it **uses that board**. The roll settles the piece everywhere: all its parts, its copies in other timelines ("twins") and its history. |
| Q11 | The past remembers | History boards are real squares, so they count for the budget. After a merge the possibilities stay apart (the past still shows both paths) until those boards leave the history window, two turns later ("which-path memory"). |
| Q12 | Winning | Capture any enemy king on any board, past boards included (the app's rule; no exponential checkmate search). The danger line is the 5D "check": the chance that the opponent can take a king if you end your turn now. |
| Q13 | Faithfulness | The official turn structure (several moves, present, active timelines, Submit), all official movement in four axes, official pawn rules, official small boards **and** the 8×8 Standard start. Caps: 1 to 3 new timelines per player, two turns of history. |
| Q14 | Engine | History boards as real squares on a static topology of 2,240 squares, piece ids per cell, a ring of four history boards per timeline. One new optional core hook, `allowQuantum(state, action)`, plus a one-line core bug fix (section 4.10). |
| Q15 | Computer | `aiView` searches the mandatory boards only, `replySide` searches no answer inside one's own turn, `evaluate` adds 5D check, threats and the timeline advantage. Typical answers take under 0.1 s; the slowest measured move took 0.8 s on 5×5 and 1.2 s on 8×8. |

**Compared with the competing design** (D-P): D-P rolls every uncertain move (`measured: () => true`), makes a
Missed roll and a Measure free (the board still waits), and allows splits and merges only on the piece's own board.
This design keeps pass = link (the heart of Quantum Chess) in 5D, keeps the cost of trying (as in the base game,
where a missed move costs the turn), and adds splits into the past and onto other timelines. Both designs share the
skeleton rule, the history-as-squares model, twins and the king-capture rule.

---

## 1. Player-facing rules (complete)

### 1.1 The multiverse

- Each **row is a timeline**; **time runs to the right**. The game starts with one timeline, **L0**, and one board.
- A board is a **White board** (White to move there, marked ○) or a **Black board** (Black to move, ●). The boards of
  a timeline alternate: T1 ○, T1 ●, T2 ○, T2 ● … **T** is the turn number.
- Every move adds boards: the board you moved on is copied one step to the right with your move made, and the old
  board stays behind as **history**. History never changes.
- Only the **latest board of a timeline** can be moved on, and only by the player whose board it is.
- Each timeline keeps its latest board and **the four boards before it** (two turns). Older boards are **sealed**:
  they are no longer shown and nothing can travel to them.

### 1.2 Your turn

- **Must move** boards (gold halo): your boards at **the present**, the earliest latest board among the *active*
  timelines (1.3). You move once on each of them.
- **Optional** boards (blue halo): your other latest boards. You may move on each of them once.
- Once you moved on a board (or a piece jumped onto it), it is your opponent's board.
- **Your turn ends by itself** when you have no board left. When only optional boards are left, **Submit turn** ends
  it (or keep moving on them).
- Moves inside a turn are final: each one has already been rolled. (Undo works as in every variant: it replays the
  same rolls.)

### 1.3 Travelling through time and timelines

- Pieces move in **four directions**: files, ranks, **time** and **timelines**. One step back in time is one whole
  turn (from T5 ○ to T4 ○), so a piece always lands on a board where it is its own player's move. One step across is
  the neighbouring timeline.
- **A jump** onto the latest board of another timeline moves the piece there: both timelines get a new board.
- **Landing on an older board** (the past of any timeline, also your own) **opens a new timeline**: the old board is
  copied, your piece arrives on the copy, and your opponent moves there next. Only the travelling piece comes along;
  your own timeline gets a new board without it.
- Timelines opened by White are numbered L+1, L+2, … and drawn **below** L0; Black's are L−1, L−2, … and drawn
  **above**.
- Each player may open **1, 2 or 3 timelines** (chosen at the start). After that, pieces can still jump to other
  timelines' latest boards, and **a king in the past can still be captured** (that ends the game; no timeline opens).
- **Active timelines.** L0 is always active. Your *n*-th timeline is active while your opponent has opened at least
  *n − 1*. Inactive timelines can be played but do not count for the present. When the opponent opens a timeline,
  one of yours may become active again.
- **The present moves** right when every must-move board has been played. It moves **back** when someone opens an
  *active* timeline in the past: the new board is the earliest one and belongs to the opponent, so your remaining
  must-move boards become optional.

### 1.4 The pieces

Every piece keeps its chess pattern in all four directions.

| Piece | Moves |
|---|---|
| Rook | any distance along one direction (file, rank, back in time, or across timelines) |
| Bishop | any distance along two directions at once, equally far in both |
| Queen | any distance along one to four directions at once, equally far in each |
| King | one step along one to four directions |
| Knight | two steps along one direction and one along another (it jumps) |

A sliding piece needs every board on its way to exist and every square on its way to be empty (read on the boards it
passes, as they were then). Your own pieces block you, also your own past self.

### 1.5 Pawns

- White pawns go **up**: one rank forward on the board, or **one timeline up** (towards Black's timelines) at the same
  turn. Black pawns go down.
- A pawn that never moved may make a **double step** in either of these directions (the square in between empty).
- A pawn **captures** diagonally forward on its board, or **one timeline forward and one turn back or ahead** (same
  square). It never moves along time alone and never captures straight ahead.
- **Promotion**: reaching the last rank on its board, a pawn becomes a **queen**.
- **En passant** works on one board, right after the double step, as in chess.

### 1.6 Castling

On one board: a king and a rook that never moved, every square between them empty; the king moves two squares towards
the rook and the rook jumps over it. There is no check, so castling out of, through or into danger is allowed. As
everywhere in Quantum Chess, castling is only possible when it is possible in **every** possibility, and it is never
rolled.

### 1.7 Winning and drawing

- **Capture any enemy king** on any board, a latest board or a past board, to win. A player can have several kings (a
  king that travels leaves its past self behind); losing any one loses the game.
- **The danger line** shows the chance that your opponent could capture one of your kings on their next turn if you
  end your turn now. At 100 % you are in what 5D players call *check*.
- **No legal move** (a must-move board you cannot move on and nothing else to do): you **lose** if one of your kings
  can certainly be captured, otherwise the game is a **draw**.
- **Draws**: 300 moves without a capture or a pawn move, 1,200 moves in all, or agreement.

### 1.8 Quantum in the multiverse

All the Quantum Chess rules apply (split, merge, measure, land = roll, pass = link, kings and pawns always solid,
budget, game-end roll). The multiverse adds these:

1. **Boards are certain, pieces are quantum.** The timelines, their boards, the present and whose turn it is are the
   same in every possibility. Only the pieces on the boards (now and in the past) can be uncertain.
2. **Timelines are AND, possibilities are OR.** Every timeline is real and you play on all of them. Of the
   possibilities, only one is real.
3. **A move always makes its boards.** The dice decide what happens to the piece, never which boards appear. A move
   that turns out *Missed* still uses its board (and still opens its timeline, with nobody arriving).
4. **Ghosts travel.** A part of a ghost may jump or travel to the past. Where the piece really was, it arrives; in
   the other possibilities the new boards appear without it and it stays home. The piece is now spread over two
   timelines, linked.
5. **Splits land on one board**: yours, the latest board of another timeline (a *jump split*), or a board in the past
   (a *time split*: one new timeline opens, with your piece on two squares).
6. **Merges start from one board.** Two parts on the same board can merge onto any square both can reach, also on
   another timeline or in the past. A part can also move onto its other part on another timeline: it joins it.
7. **Measuring uses a board.** You measure a ghost that has a part on one of your boards; that board passes. The
   result settles the piece everywhere, on every timeline and in the past.
8. **The past is quantum.** History boards show ghosts as they were. Landing on such a square is a roll; a path
   through them may be linked. When a timeline copies a board with a ghost, the copies are **twins**: linked to the
   original, so measuring one settles them all.
9. **The past remembers.** After a merge the history still shows both paths, so they count for your budget until
   those boards are sealed (two turns).
10. **Budget**: 8 per side on the small boards with up to 2 new timelines each; 4 per side on the 8×8 board and with
    3 new timelines each (the multiverse is then already large).

### 1.9 Limits

| Limit | Value | At the limit |
|---|---|---|
| New timelines per player | 1, 2 or 3 (option, default 2) | no more travel into the past, except to capture a king |
| History | the latest board and the four before it, per timeline | older boards are sealed |
| Budget | 8 (small boards, ≤ 2 timelines each) or 4 | splits refused; links rolled (core) |
| Possibilities | 64 (8 × 8) or 16 (4 × 4) | follows from the budget |
| Moves without capture or pawn move | 300 | draw |
| Moves in the game | 1,200 | draw |

### 1.10 `rules()`: eight sentences

```js
rules: () => [
	t('quantumchess', 'Each row is a timeline and time runs to the right. Only the latest board of a timeline is played: move once on every board marked “must move” (the present); the others are optional. The turn ends by itself, or press Submit turn.'),
	t('quantumchess', 'Pieces move on the board, back in time (one step is one turn) and across timelines, keeping their pattern in all four directions. Landing on another timeline’s latest board moves the piece there; landing on an older board opens a new timeline.'),
	t('quantumchess', 'Pawns step forward on the board or one timeline towards the opponent, capture diagonally or one timeline forward and one turn back or ahead, and become queens. Capture any enemy king, also one in the past, to win.'),
	t('quantumchess', 'Boards are certain, pieces are quantum: the timelines, the present and whose turn it is are the same in every possibility. A move always makes its boards; the dice only decide what happens to the piece.'),
	t('quantumchess', 'So a ghost can travel: where it really stood it arrives, elsewhere the new boards appear without it and it stays home, linked. A Missed move still uses its board, and measuring a ghost uses the board its part stands on.'),
	t('quantumchess', 'Both halves of a split land on one board: your own, another timeline’s latest board, or a board in the past. Two parts merge only from one board.'),
	t('quantumchess', 'The past is quantum too: old boards show ghosts as they were, landing on them is a roll, and new timelines copy them as linked twins. After a merge the past remembers both paths for two turns (they still count for your budget).'),
	t('quantumchess', 'Each player may open 1 to 3 timelines; boards older than two turns are sealed. Budget: 8 on the small boards with up to 2 timelines each, otherwise 4.'),
],
```

---

## 2. Boards, setups, time and the turn (exact)

### 2.1 Options

```js
options: [
	{ id: 'setup', type: 'choice', label: () => t('quantumchess', 'Start position'), default: 'small', values: [
		{ id: 'small', label: () => t('quantumchess', 'Small, 5×5 (official “Small”)') },
		{ id: 'centered', label: () => t('quantumchess', 'Small with the king in the centre, 5×5') },
		{ id: 'open4', label: () => t('quantumchess', 'Very small and open, 4×4: the easiest start') },
		{ id: 'knights', label: () => t('quantumchess', 'Kings and knights, 5×5') },
		{ id: 'standard', label: () => t('quantumchess', 'Standard 8×8: the long game (budget 4)') },
	] },
	{ id: 'timelines', type: 'choice', label: () => t('quantumchess', 'New timelines per player'), default: '2', values: [
		{ id: '1', label: () => t('quantumchess', 'One (at most 3 timelines)') },
		{ id: '2', label: () => t('quantumchess', 'Two (at most 5 timelines)') },
		{ id: '3', label: () => t('quantumchess', 'Three (at most 7 timelines, budget 4)') },
	] },
	{ id: 'view', type: 'choice', label: () => t('quantumchess', 'Drawn at the bottom'), default: 'white', values: [
		{ id: 'white', label: () => t('quantumchess', 'White') },
		{ id: 'black', label: () => t('quantumchess', 'Black') },
	] },
],
```

`view` only changes the drawing (6.9). U11's `describe` can print the setup string.

### 2.2 Setups (5DFEN: ranks top to bottom; every king, rook and pawn starts "never moved")

| id | Size | Board (0T1 ○) | Official name (P §7.2) |
|---|---|---|---|
| `small` | 5×5 | `kqbnr/ppppp/5/PPPPP/KQBNR` | Small |
| `centered` | 5×5 | `rnkqr/ppppp/5/PPPPP/RQKNR` | Small – Centered |
| `open4` | 4×4 | `nbrk/3p/P3/KRBN` | Very Small – Open |
| `knights` | 5×5 | `n1kn1/5/5/5/1NK1N` | Focused – Just Knights |
| `standard` | 8×8 | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR` | Standard |

White (side 0) moves first. `x.n` is the board size (4, 5 or 8). Odd starts only (one L0).

### 2.3 Time

- Half-turn index **v** = 2·(T − 1) + colour; colour 0 = White to move (○), 1 = Black (●). (0T1 ○) is v = 0.
- `T(v) = (v >> 1) + 1`, `colour(v) = v & 1`. One step of a piece in time changes v by 2.

### 2.4 Timelines and rows

- Line numbers L ∈ {−3 … +3}. Storage row (zig-zag, so arrays grow only as timelines appear): `u(0) = 0`,
  `u(L) = 2L − 1` for L > 0, `u(L) = −2L` for L < 0; `L(u)` is the inverse.
- White's k-th new timeline is L = +k, Black's is L = −k (by who made the move, not whose piece travelled).
- Per row: `tl[u] = [start, end, parentL, parentV]` (first and latest v, and the board it was copied from; null for
  L0), or null if the row does not exist. A row exists in every possibility or in none.

### 2.5 Which boards exist

- Board (u, v) **exists** iff row u exists and `max(start, end − 4) ≤ v ≤ end`. `v = end` is the **latest** board;
  the others are **history**. Older boards are **sealed**; boards before `start` never existed on that row.
- Stored history boards sit in a **ring** of four slots per row: board v (< end) is in slot `1 + (v mod 4)`.

### 2.6 Playable, active, present, mandatory, optional

For created counts `c = [c0, c1]`, the option m and the side to move s:

- `playable(side, u)`: row u exists and `colour(end(u)) = side`.
- `active(u)`: L = 0, or L > 0 and L ≤ c1 + 1, or L < 0 and −L ≤ c0 + 1.
- **present** `P` = min of `end(u)` over the active rows.
- `mandatory(s)` = active rows with `end = P`, if `colour(P) = s`; otherwise empty.
- `optional(s)` = `playable(s)` minus `mandatory(s)`.
- `canSubmit` ⇔ `colour(P) ≠ s`.

### 2.7 A turn, the automatic end, Submit

- A turn is a sequence of actions by s: ordinary moves (on the board, jumps, branches), splits, merges, measurements.
- **Automatic end**: after every action except Submit, if no row is playable for s, `x.s = 1 − s` in that same
  action. This depends only on the skeleton, so it happens in every possibility.
- **Submit** (code `submit`) is legal iff `canSubmit` holds (then some optional board is left, otherwise the turn
  would have ended by itself). It sets `x.s = 1 − s`.
- At the start of a turn the present has the mover's colour, so there is no pass: at least one action is needed.
- **Every action uses boards** (principle Q7): a move uses its source board (and a jump's target board, or opens a
  timeline); a split or merge uses the boards of its path; a measurement uses the board of the named part. A Missed
  outcome uses them too.

### 2.8 What a move does

The piece stands on the latest board of row u (v = end(u)) and lands on board (u2, v2).

| Kind | Condition | Effect (every possibility; where the piece is absent or blocked, the same boards appear without it) |
|---|---|---|
| physical | u2 = u, v2 = v | row u advances: its new latest board is the old one with the move made |
| jump (`>`) | (u2, v2) ≠ (u, v), v2 = end(u2) | row u advances without the piece; row u2 advances with the piece on the target (capturing) |
| branch (`>>`) | v2 < end(u2) (any row, also u) | row u advances without the piece; a **new row** for the mover: `start = end = v2 + 1`, parent (L(u2), v2), board = copy of (u2, v2) with the piece on the target (capturing the copy there); `c[mover] += 1` |
| branch onto a king | the target on (u2, v2) holds an enemy king | row u advances without the piece; the mover wins (`x.k = mover`); **no row opens** |

The travelling piece becomes "moved"; copied pieces keep their "never moved" state from the copied board.

### 2.9 Branch permission

A branch is generated iff `c[mover] < m`, **or** its target square holds an enemy king (kings are solid, so this is
the same in every possibility). Rows stay within L−3 … L+3 because m ≤ 3.

### 2.10 Win and draw

- `worldResult(w)`: `x.k ≥ 0` → `{ winner: x.k, reason: 'king' }`, else null. The core's game-end roll settles
  possibilities that disagree.
- `noMoves(state)`: `royalDanger(V, state, state.turn) >= 1` → `{ winner: 1 − turn, reason: 'stuck' }`, else
  `{ winner: null, reason: 'noMoves' }` (5D's checkmate and stalemate, without the search).
- `maxPly: 1200`, `quietPlies: 300` (a turn is 1 to 7 actions; Submit counts as a ply).

### 2.11 Limits and what happens there

| Limit | Behaviour |
|---|---|
| `c[side] = m` | quiet or non-king branches are not generated; the header shows "White 2/2" |
| history window | a target older than `end − 4` does not exist; a rider stops there; the row shows "⋯" on the left |
| a row far behind (inactive) | stays playable (optional); the layout collapses empty columns into a "⋯" gap |
| 7 rows | never exceeded (m ≤ 3) |
| budget / 64 or 16 possibilities / 4 squares per split | core rules; the budget comes from `budgetRule` |
| 300 quiet plies / 1,200 plies | draw (`quiet`, `moveLimit`) |

---

## 3. The pieces as vectors (dx, dy, dT, dL)

x = file, y = rank, T in whole turns (v changes by 2·dT), L in timelines. Vectors with **dL = 0 and dT > 0** are left
out (the source is the latest board of its row, so they never find a board).

| Types (live) | Piece | Vectors (`core/topology.js`) | Count | Kind |
|---|---|---|---|---|
| `r0`, `r` | rook | `directions(4, 1)` | 7 | ride |
| `b` | bishop | `directions(4, 2)` | 20 | ride |
| `q` | queen | `allDirections(4)` | 71 | ride |
| `k0`, `k` | king (royal) | `allDirections(4)` | 71 | leap |
| `n` | knight | `symmetric([2, 1], 4)` | 40 | leap |
| `p0`, `p` | pawn | below | – | special |

- **Leap**: only the target board and square are checked. **Ride**: step k = 1, 2, …: target board
  `(L + k·dL, v + 2k·dT)` must exist (2.5) and the square must be on the n×n board; empty → quiet move and continue;
  enemy → capture and stop; own piece (including the piece's own past self) → stop.
- **Pawn** (White: forward y = +1, forward L = −1; Black negates both):
  - quiet: `(0, +1, 0, 0)` (physical), `(0, 0, 0, −1)` (jump, or branch if that board is history);
  - never moved (`p0`): double `(0, +2, 0, 0)` with `(0, +1, 0, 0)` empty; double `(0, 0, 0, −2)` with the middle
    timeline's board existing and its square empty;
  - capture only: `(±1, +1, 0, 0)`, `(0, 0, +1, −1)`, `(0, 0, −1, −1)`;
  - en passant: on the latest board of row u, if `x.ep[u]` is the square skipped by the enemy double step that made
    this board, a diagonal capture onto it removes that pawn. Kind `ep` (certain-only, CC Q2).
  - promotion: a physical move onto the last rank gives a queen, key suffix `=q`. Timeline moves and T–L captures keep
    the rank and never promote.
- **Castling** (kind `castle`, physical only, certain-only by CC Q2): `k0` and an own `r0` on the same rank of the
  same latest board with at least two empty squares between them (all squares between must be empty); the king moves
  two files towards the rook, the rook to the square the king crossed; both become `k` / `r`. The key is the king's
  move, e.g. `(0T5)a1-c1`.
- **Never-moved state = type**: `k0`, `r0`, `p0` become `k`, `r`, `p` when that piece moves (also by travelling, and
  as a split or merge part). Copies keep their type.

History types are `'h' + live type` (`hk0`, `hk`, `hq`, `hr0`, `hr`, `hb`, `hn`, `hp0`, `hp`): they never move
(generation only reads latest boards), have value 0, are royal / solid like their live type and are not splittable.
Glyphs: cburnett sprites `k q r b n p`. Values (P §8.6, 4D-adjusted): p 100, r 400, n 450, b 450, q 1100, k 0.

---

## 4. Engine mapping

### 4.1 Declaration

```js
const spec = {
	id: 'multiverse', category: 'dimensions',
	sides: [
		{ id: 'w', name: () => t('quantumchess', 'White'), color: 'white', rotate: 0 },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black', rotate: 0 },   // time must not be reversed
	],
	topology, types, options, setup, rules,               // 4.2, 3, 2.1, 2.2, 1.10
	generate, apply, applyMiss, allowQuantum,             // 4.7 - 4.10
	solidExtra, nextSide, actions, layoutOf,              // 4.11, 6
	worldResult, noMoves, reasonText, recordInfo, infoText, budgetRule,
	evaluate, aiView, replySide,                          // 4.12
	maxPly: 1200, quietPlies: 300,
}
export default defineVariant(spec)
```

Not used: `extraMoves`, `filterMoves`, `afterMove`, `onCapture`, `measured` (the core's rules decide), `unifyWorlds`
(castling rights are types), `passWhenStuck`.

### 4.2 Static topology: capacity, square encoding, names

Constants: `BC = 8` (board capacity), `H = 4` history slots, `SLOTS = 5` (slot 0 = latest board), `ROWS = 7`.

- **Square**: `sq = ((u·SLOTS) + slot)·64 + y·8 + x`; **size 2,240**. A 5×5 game uses x, y < 5 only.
- `makeTopology({ coords, name, cell })` with coords `[x, y, slot, u]`.
- **Names** (no `-`, `|`, `?`, `@`, `=`, space): latest board `L0:c3`, `L+1:c3`, `L−1:c3` (U+2212); history
  slot k: `L0~k:c3` (k = 1 … 4; slot k holds the board with v ≡ k − 1 mod 4). Names appear in split, merge and
  measure codes and in measure outcomes. Players read absolute names from `layoutOf` (6.7) and readable move lines
  from `infoText` (4.11).
- The ring keeps a history board on the same squares for its whole life in the window, so last-move marks (CC U1)
  and records stay right; an age-based naming would shift every history square on each advance.
- The static `cell()` is a plain grid; it is never drawn, because `layoutOf` always exists.

### 4.3 Piece ids

- **Compact per game size**: `id = ((u·SLOTS) + slot)·n² + y·n + x`, so arrays hold 5·n² ids per row.
- **Live pieces**: when row u is created (L0 at setup), the piece on cell (x, y) gets the id of that cell in slot 0.
  A piece keeps its id when it moves, jumps, travels, promotes or splits; captured: `sq = −1`. Ids are never reused
  (a row is created once).
- **History pieces**: a history cell's piece has that cell's id (slot 1 … 4). The snapshot copies type (`'h' + t`)
  and side; when the slot is reused four boards later, its ids are reused for the new board.
- **New rows**: the copied pieces get the new row's slot-0 ids; the travelling piece keeps its own id.
- **Twins**: a ghost on the copied board (say 50 % c3 / 50 % e3) becomes one piece per possible square in the new
  row. They are linked (each exists exactly in the possibilities where the original stood there), they can move,
  split and be measured, but twins cannot merge with each other (they are different pieces).
- Two copies of one physical piece can coexist (a king that travelled back and its past self), as in 5D.

### 4.4 The world

```js
{
	sq: number[], ty: string[], sd: number[],   // length (uMax + 1) · 5 · n², the same in every world
	board: number[],                            // length (uMax + 1) · 5 · 64; -1 = empty
	x: {
		n: 5,                  // board size
		m: 2,                  // new timelines allowed per side
		s: 0,                  // side to move (drives nextSide)
		c: [0, 0],             // timelines created by White, Black
		tl: [[0, 7, null, null], null, …],       // 7 entries: [start, end, parentL, parentV] or null
		ep: [-1, …],           // 7 entries: en passant cell (y·8 + x) on the row's latest board, or -1
		k: -1,                 // side that captured a king in this world, or -1
		// ai: 1               // only in the computer's search copy (4.12)
	},
}
```

`uMax` is the highest row index created so far; arrays grow in every world at once (the skeleton is shared). Unused
ids: `sq = −1`, `ty = ''`, `sd = 0`.

### 4.5 Skeleton helpers (pure, from `x`)

`uOf`, `LOf`, `skeleton(x) → { act(u), present }`, `playable(x, side, u)`, `mandatory(x)`, `canSubmit(x)`,
`slotAt(x, u, v)` (−1 when not stored), `vOfSlot(x, u, slot)`, `T(v)`. Everything about turns, keys and layout is a
function of `x.s`, `x.c`, `x.m` and `x.tl`, which `solidExtra` covers.

### 4.6 Move keys (identical in every world; the codes in the move list, 5dpgn style)

```
board := "(" line "T" turn ")"          line ∈ {0, +1, -1, +2, …} (ASCII minus, as 5dpgn), turn = T(v)
key   := board cell "-" cell ["=q"]      physical (also double step, en passant, castling = the king's move)
       | board cell ">" board cell       jump
       | board cell ">>" board cell      branch
       | "submit"
```

Examples: `(0T1)d1-c3`, `(0T3)a3>(+1T3)a3`, `(0T2)c3>>(0T1)e3`, `(0T5)b4-b5=q`, `(0T5)a1-c1`. Split, merge and
measure codes are built by the core from the static names: `L0:d1-L0:c3|L0:e3`, `L0:c3-L0~1:a3|L0~1:e3` (time
split), `L0:c3|L0:e3-L0:d1`, `?L0:c3`. Keys contain no `|` and never start with `?`.

### 4.7 `generate(w, side)`

**The mover (`side === x.s`).** For each row u playable for the mover (in AI mode see 4.12), v = end(u), for each own
piece on the latest board: leap / ride / pawn / castling as in section 3; target (u2, v2) must be stored; classify
(2.8); drop branches without permission (2.9). Push:

```js
{ key, from: sqOf(u, 0, x, y), to: sqOf(u2, slot2, x2, y2),   // `to` is the drawn square, also on a past board
  id, capture: victim id on the target or -1, promo: 'q' | null, drop: null,
  kind: 'normal' | 'double' | 'ep' | 'castle' | 'hop' | 'branch',
  extra: { u, tu: u2, tv: v2, tx: x2, ty: y2, noRow, rook? } }
```

Travel moves carry the piece's id, so the core may use them as split and merge paths (Q8, Q9); `allowQuantum`
keeps them on one board. Add `{ key: 'submit', from: -1, to: -1, id: -1, capture: -1, kind: 'submit' }` when
`canSubmit`.

**Not the mover (`side !== x.s`): the phantom danger list.** The mover's playable rows are passed virtually
(`end + 1`, as the engines' "phantom boards", E §0.4); then the first capture of a royal piece of the mover by `side`,
on any board (latest or history), is returned as one move `{ key: '†', id: -1, capture: victim, kind: 'danger' }`,
else `[]`. `royalDanger` sums weights per key, so it shows the weight of the possibilities in which *some* king
capture exists: the 5D check. `id: −1` keeps the phantom list out of the core's converging-capture check (CC Q7),
which would otherwise try to apply it as a merge. `table()` only generates for `state.turn`, so `†` never becomes a
legal move.

Cost (measured): one world with 5 rows: 40 µs (5×5), 83 µs (8×8).

### 4.8 `apply(w, m)` and the snapshot

`next = clone(w)` (arrays sliced, `x` copied), then by kind:

- **advance(u)**: the latest board of u is copied into history slot `1 + (end mod 4)` (the oldest board leaves the
  window): for each cell, the old piece of that history cell is removed, and the latest board's piece (if any) is
  copied with the cell's history id, type `'h' + t`, same side. Then `tl[u][1] += 1`, `ep[u] = −1`. Pieces on the
  latest board keep their squares and ids.
- **physical**: advance(u); remove the victim (a royal victim sets `x.k = mover`); move the piece (type → moved type,
  promotion → `q`); castling moves the rook; `double` sets `ep[u]` to the skipped cell.
- **hop**: advance(u); advance(u2); remove the piece from row u; capture on the target of row u2; place it there.
- **branch**: first read the board (u2, v2) (it may be on row u and in the slot that advance will overwrite); if the
  target holds an enemy king: advance(u), remove the piece, `x.k = mover`, done. Otherwise **openRow**: new row
  `nu = u(±(c[mover] + 1))`, `tl[nu] = [v2 + 1, v2 + 1, L(u2), v2]`, `ep[nu] = −1`, `c[mover] += 1`, every piece of the
  copied board except the one on the target cell is placed with the new row's slot-0 ids and its live type; then
  advance(u), remove the piece from row u, place it on the new row's target cell (moved type).
- **submit**: `x.s = 1 − x.s`.
- Then the **automatic end** (2.7) for every kind except submit.

Cost (measured): 4 µs (5×5), 24 µs (8×8).

### 4.9 `applyMiss(b, action, side, info)`: the structure follows the action

This is the lead's decided hook (CC Q1), used exactly as specified there. For every idle world (the action did not
take effect there) it builds **the same boards** without moving anything. It ignores `info.hit`: a rolled Missed
builds the boards too (principle Q7), so the skeleton after an action depends only on its code.

```js
applyMiss(b, action) {
	const next = clone(b)
	const x = next.x
	if (action.type === 'move') {
		const m = action.sample
		if (m.kind === 'submit') { x.s = 1 - x.s; return next }       // never idle in practice
		const e = m.extra
		if (m.kind === 'branch') {
			if (!e.noRow) openRow(next, x.s, e.tu, e.tv, -1, -1)         // an untouched copy of the past board
			advance(next, e.u)
		} else if (m.kind === 'hop') {
			advance(next, e.u); advance(next, e.tu)
		} else {
			advance(next, e.u)
		}
	} else if (action.type === 'measure') {
		advance(next, rowOf(action.from[0]))                          // measuring uses that board
	} else if (action.type === 'split' || action.type === 'merge') {
		const f = decode(action.from[0]), t = decode(action.to[0])      // one board each (allowQuantum)
		if (t.slot > 0) { openRow(next, x.s, t.u, vOfSlot(x, t.u, t.slot), -1, -1); advance(next, f.u) }
		else if (t.u !== f.u) { advance(next, f.u); advance(next, t.u) }
		else advance(next, f.u)
	} else {
		return b                                                        // 'pass' (CC Q10) is never used here
	}
	autoEnd(x)
	return next
}
```

Why the skeleton can never differ between worlds after this:

- ordinary move: every world applies the same kind with the same (u, u2, v2) (they come from the key); hit worlds by
  `apply`, idle worlds by `applyMiss`;
- split: both targets are on one board (4.10), so both children build the same boards; idle children build them too;
- merge: both parts on one board and one target, so every world builds the same boards;
- measure: every world advances the same row;
- the automatic end and Submit read the skeleton only.

So the core's solid roll never fires on structure (the fuzz never saw one in about 4,100 plies), and its notes stay
short (CC Q4).

### 4.10 The one new core hook: `allowQuantum(state, action) → boolean` (and a bug fix)

**Hook** (optional; default: everything the generic rules allow). The core asks it before it accepts a split, a
merge or a measurement: `action = { type: 'split' | 'merge' | 'measure', from: number[], to: number[] }` (for a merge
candidate `to` may be empty). Generic meaning: "the variant may forbid a split, merge or measurement that the generic
rules allow". Call sites (all in `quantum.js`):

1. `splitBranches`: return null when not allowed (so `splitsFrom`, `isLegal`, `branches`, the AI follow);
2. `mergeCandidates`: skip a pair of parts that is not allowed (the UI's merge marks follow);
3. `perWorldMerge`: return null when not allowed (so `mergeBranches` and `mergeDanger`);
4. `measureBranches`: return null when not allowed;
5. `legalMoves`: list the measurement of a piece at its **first allowed** part (today it lists `?` at the first
   location only).

The multiverse's rule:

```js
allowQuantum(state, { type, from, to }) {
	const x = state.worlds[0].b.x
	const f = decode(from[0])
	if (f.slot !== 0 || !playable(x, x.s, f.u)) return false        // a part on a board you may play now
	if (type === 'measure') return true
	if (type === 'merge') { const g = decode(from[1]); return g.slot === 0 && g.u === f.u }   // parts on one board
	const a = decode(to[0]), b = decode(to[1])
	return a.u === b.u && a.slot === b.slot                           // both halves on one board
}
```

Why a hook and not `generate`: split and merge paths are ordinary quiet moves; the pairing of two targets happens in
the core. Without the hook a two-board split would be legal and then settled by the solid roll ("a piece that is always
solid was settled"), which is wrong and confusing. Cost: one call per candidate; backwards compatible (no other
variant defines it).

**Bug fix (generic):** `perWorldMerge` reads the piece's type from the first world (`state.worlds[0].b.ty[X]`). A twin
can be absent from the first world (`ty = ''`), which throws. Read it from a world where X stands on `f1`, as
`splitBranches` already does:

```js
const home = state.worlds.find(({ b }) => b.board[f1] === X).b
if (!V.types[home.ty[X]].splittable || facesOf(state, X, [f1, f2]).size > 1 || !allowed(...)) return null
```

The prototype carries exactly these two patches (search `PROTOTYPE PATCH` in `prototypes/mv-quantum/core/quantum.mjs`;
tests Q7, Q12, Q21 and Q9's "two boards" check pin them).

### 4.11 The other hooks

```js
solidExtra: (w) => w.x.s + '/' + w.x.c.join(',') + '/' + w.x.tl.map((e) => (e ? e[0] + '.' + e[1] : '')).join(';'),
nextSide: (w) => w.x.s,
actions: (state) => [{ code: 'submit', label: submitLabel(state) }],
worldResult: (w) => (w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null),
budgetRule: (b) => ({ limit: b.x.n <= 5 && b.x.m <= 2 ? 8 : 4 }),
```

- `solidExtra`: side to move, created counts and every row's start and end (parents are fixed at creation by the
  same key, so they follow). About 40 characters.
- `submitLabel(state)`: `t('Submit turn')` when legal; otherwise `n('quantumchess', 'Submit turn (move on {count}
  more board first)', 'Submit turn (move on {count} more boards first)', count)` with `count = mandatory.length`.
  The view disables the button when `isLegal` is false.
- `budgetRule` (CC Q6) is constant per game (n and m never change), so it never lowers a limit mid-game.
- `recordInfo(prev, code, branch, next)` (CC Q9) stores `{ rows: [new row indexes], arrows: [[u1, v1, x1, y1, u2,
  v2, x2, y2], …] }`: the new timelines of the action and, unless the outcome is `miss`, each travel in absolute board
  coordinates (the board the piece left, the board it arrived on). The layout draws the arrows from it (6.5).
- `infoText(record)` (CC U9): one line per new row, e.g. "Opened timeline +1 (a copy of L0 T1 ○)"; for a `miss`
  outcome that opened a row: "Missed: the timeline opened anyway, nobody arrived".
- `reasonText`: `stuck` → "no legal move while a king could certainly be taken"; `quiet` → "300 moves without a
  capture or a pawn move"; others generic.

### 4.12 The computer player

- **`evaluate(w, side)`** (added to the core's material; history types are worth 0). Two phantom tests per world:
  *check* = the waiting side could capture a king of the side to move if that side passed its remaining boards;
  *threat* = the side to move can capture a king right now.
  - `side` is to move: −3000 if in check, +6000 if it has a threat;
  - the enemy is to move: −6000 if the enemy has a threat, +3000 if the enemy is in check;
  - +60 × clamp(`c[enemy] − c[side]`, −2, 2): the timeline advantage (R §5.1).
- **`aiView(state)`**: if the side to move has mandatory **and** optional boards, a shallow copy whose worlds carry
  `x.ai = 1`; in that mode `generate` keeps every move from mandatory boards, and from optional boards only king
  captures and jumps onto a mandatory board (the skeleton and solid kings decide, so a key is kept in all worlds or
  none, and the odds stay exact). Otherwise the real state. `chooseMove` checks every candidate against the real
  state (`ai.js`).
- **`replySide(s, me)`** (CC U3): `s.turn === me ? null : s.turn`. Inside my own turn there is no answer yet; the
  evaluation (with its check term) judges the position; after my turn ends the opponent answers as usual. (The core
  default, "my best continuation", played equally well but slower: 3–1 against easy with 32 ms instead of 19 ms per
  move.)
- **Measured strength and speed** (5×5 Small unless noted; `aiplay.mjs`, `aigames.mjs`, `bench.mjs`):

  | Match | Result | Time per move |
  |---|---|---|
  | normal (White) vs easy | 3 wins, 1 draw (a real 5D stalemate) | avg 19 ms, max 312 ms |
  | easy vs normal (Black) | normal 3–1 | avg 13 ms, max 150 ms |
  | hard vs normal | hard 3–1 | avg 82 ms, max 784 ms |
  | normal vs normal, 12 seeds | 12 decisive games of 11–53 plies; 10 used time travel, 5 used splits | – |
  | Standard 8×8, normal vs easy | normal 2–0 (139 and 92 plies) | avg 63 ms, max 1.17 s |
  | bench states (1–16 worlds) | easy / normal / hard | avg 71 / 87 / 106 ms, max 151 / 165 / 193 ms |
  | bench 8×8 (up to 64 worlds before the budget rule) | easy / normal / hard | max 0.68 / 1.04 / 1.14 s |

### 4.13 Core behaviours relied upon (pin them with tests)

| Behaviour | Core item | Test |
|---|---|---|
| Idle worlds pass through `applyMiss`, also rolled Missed and Measure | CC Q1 | Q2, Q3, Q11, Q14, Q19 |
| Castling and en passant legal only when certain in every world | CC Q2 | Q23, Q24, T13, T15 |
| `budgetRule` limit; links over the limit are rolled | CC Q6 | Q19, Q20 |
| `royalDanger` adds converging captures (our `†` moves carry `id: −1`) | CC Q7 | Q16, Q22 |
| History records carry `from`, `to` and `info` | CC Q9 | R1 |
| A part moving onto its own other part joins it (no roll) | CC Q14 | Q25 |
| Split / merge paths skip certain moves | CC Q2 | (castling is never a split path) |
| `replySide`, `aiView` | CC U3, `ai.js` | A1, A2 |
| Focus recentres only when its key changes | CC U2 | U3 |
| `squareView` / `boardView` skip squares beyond `board.length` | CC Q11 | U1 |
| `turn = nextSide(first world)`, `result = worldResult(first world)`, `table()` for `state.turn` only | today | T2, T4 |

### 4.14 Performance budget (measured on the prototype; Node 22)

| Operation | 5×5, 5 rows | 8×8, 5 rows | Target on a phone (×3) |
|---|---|---|---|
| `generate`, one world | 40 µs | 83 µs | ≤ 0.3 ms |
| `apply`, one move | 4 µs | 24 µs | ≤ 0.1 ms |
| `legalMoves`: 1 / 2–8 / 9–32 / 33–64 worlds | 0.04 / 0.18 / 1.3 / 3.1 ms | 0.05 / 0.35 / 3.2 / – ms | ≤ 10 ms |
| `branches` of one move, largest states | 1.5 ms (64 w) | 1.5 ms (16 w) | ≤ 5 ms |
| `stateAfter`, largest states | 4.8 ms (64 w) | 4.2 ms (16 w) | ≤ 15 ms |
| `royalDanger`, largest states | 2.4–9.8 ms (64 w) | 4.9 ms (16 w) | ≤ 30 ms |
| `layoutOf` (memoised by skeleton, view and arrows) | 0.06 ms rebuild, 1.1 ms on the largest | 1.2 ms | ≤ 4 ms |
| one UI move on the largest state (`legalMoves` + `royalDanger` + `layoutOf` + `boardView` + `applyMove`) | 25.6 ms (64 w) | 11.4 ms (16 w) | ≤ 80 ms |
| random play with all invariants checked | ≈ 1 ms per ply | ≈ 4.4 ms per ply | – |

The fuzz (`fuzz.mjs`, random moves with a split every third ply) ran 30 games × 150 plies on Small (1,519 plies,
1.6 s), 10 × 120 on Standard (5.3 s), 20 × 150 on Centered with 3 timelines each and 20 × 150 on Knights. After every
ply: weights sum to T, `sq`/`board` agree, the skeleton is equal in all worlds, solid pieces agree, used budget ≤ limit,
worlds ≤ product of the budgets, and the opponent's move never raised a budget. No structural solid roll occurred.
Counted links: 51 on Small (33 on one board, 13 jumps, 5 branches).

### 4.15 State size (measured)

| Configuration | Per world (JSON) | Computer games: avg / max state | Worst case (both budgets full) |
|---|---|---|---|
| 5×5, 2 new timelines (5 rows), budget 8 | ≈ 2.4 KB per row (11.8 KB at 5 rows) | 9.0 / 27.1 KB | 64 worlds: 754 KB |
| 5×5 Knights, budget 8 | 10.4 KB | 10.2 / 43.9 KB | 64 worlds: 664 KB |
| 5×5, 3 new timelines (7 rows), budget 4 | 16.5 KB | 20.6 / 70.7 KB | 16 worlds: 264 KB |
| 8×8 Standard, 2 (5 rows), budget 4 | 21.3 KB | 46.4 / 173.8 KB | 16 worlds: 340 KB |

A saved game (`variantGames.js`) is the start state (3–4 KB), the move list, the roll memo and the current state
with its history (about 140 bytes per ply). Typical saved games are 10–40 KB (5×5) and 50–180 KB (8×8). The budget of
4 on 8×8 and with 3 timelines exists for this table: with 8 those configurations could reach 1–1.4 MB. The worst case
of the default (0.75 MB) needs both players to hold three independent ghosts at once; see open point 10.2.

### 4.16 Test helper

`buildWorld({ n, m, s, c, rows: { L: { st, en, parent: [L, v], boards: { v: fen } } } })` builds one world from
board strings (FEN ranks top to bottom; `*` after K, R, P = never moved; unlisted stored boards are empty; live
pieces get their cell ids, history pieces their history-cell ids). `setId(w, sq, id)` gives the piece on a square
another id, to build ghosts that span worlds. `stateOfWorlds([[world, relWeight], …], turn)` makes a state.

---

## 5. Quantum rules (engine view, and why)

### 5.1 What is classical and what is quantum

| Classical (the same in every possibility) | Why |
|---|---|
| Which timelines exist, their start and end, their parent, the created counts | One picture of the multiverse; the question "which boards must I move on?" has one answer. Physics: the background on which quantum states live is classical. |
| The present, active timelines, the side to move, Submit | Time is a parameter, not an observable (as in quantum mechanics). An uncertain present would make the turn itself uncertain. |
| Kings and pawns (core), board colours, never-moved states of kings and pawns | Solid pieces never become ghosts; king captures are certain or cleanly rolled. |

| Quantum (may differ between possibilities) | How it shows |
|---|---|
| Every non-solid piece on every **latest** board | ghosts with percentages, as in the base game |
| Every piece on every **history** board | the past is drawn with its ghosts: "where was that knight at T3?" |
| Copies of ghosts in new timelines (twins) | linked copies with the same percentages |
| One piece spread **over several timelines** | e.g. a knight 50 % on L0 e3 and 50 % on L+1 e3 (example E1) |
| The captured-king flag per world (`x.k`) | settled by the core's game-end roll |

### 5.2 Split, merge, measure (exact)

- **Split** (`q r0 r b n`, promoted queens too): from a part on a latest board you may play now, to two squares
  `t1`, `t2` that are **empty in every possibility**, both reachable by a quiet move of the piece in some possibility
  where it stands there, and **on one board** (`allowQuantum`). The board may be the piece's own latest board, the
  latest board of another timeline (jump split: both boards pass) or a stored past board (time split: one new
  timeline opens, `c[mover] += 1`, and the piece is on two squares of it). Never rolled. Where a child's path is
  blocked, or the piece is not on `f`, `applyMiss` builds the same boards.
- **Merge**: two parts of one piece on **one latest board** you may play, to a square both can reach by a quiet move
  (or a capture, then rolled if an enemy may be there), anywhere: that board, another timeline's latest board, or the
  past (the new timeline then gets the whole piece, example Q26). Parts with different types cannot merge (CC Q13;
  `r0` and `r`).
- **Measure**: a superposed own piece with a part on a latest board you may play. Outcomes: the squares of its parts
  (any board) and `gone` (a twin that does not exist in some possibilities). The named part's board passes. Parts
  only on boards you cannot play now (the opponent's boards, the past) cannot be measured now; the past is settled
  only through the present (a roll there, or a measurement of a live part).
- **Join**: a part that moves onto the square of its own other part (same piece, same type), on any board, joins it
  without a roll (CC Q14). This is how parts on two timelines reunite (example Q25).

### 5.3 Rolls and links across timelines

A world is **a whole multiverse**. A roll keeps only the worlds of one outcome, so it settles, at once and on every
timeline, everything that was correlated with the rolled question: the piece's other parts, its twins, its history,
and the pieces linked to it.

| Move | Every possibility agrees | Target may hold a piece somewhere (land) | Otherwise, results differ (pass) |
|---|---|---|---|
| physical | certain | **rolled**: Missed / Moved / Captured | **linked**: where it could not move, the board still passes and the piece stays |
| jump | certain | rolled; a Missed still passes both boards | linked: the piece is now spread over two timelines |
| branch | certain | rolled; a Missed still opens the timeline (an untouched copy) | linked: the timeline opens everywhere, the piece arrives where it really was |
| branch onto a king | certain win | rolled (game-end): Missed passes the board, no timeline | – (a king square is always occupied) |
| solid mover (king, pawn) | certain | always rolled | always rolled |
| over the budget | – | – | rolled instead of linked (the boards are still built) |

The **danger line** is a union over possibilities: every attacking ghost part counts, because each would be tried
in the possibilities where it really stands.

### 5.4 How `applyMiss` makes pass = link real in 5D (walk-through, example E1)

White's knight is 50 % c3 / 50 % e3 on L0 (T2 ○). White plays `(0T2)c3>>(0T1)e3`:

1. The core generates the key in world A (knight on c3) only. It is not *measured*: the mover is not solid and the
   target (0T1)e3 is empty in both worlds. So it is a link.
2. World A applies the branch: L0 advances without the knight, a new row L+1 opens as a copy of (0T1 ○) with the knight
   on e3.
3. World B is idle: `applyMiss` advances L0 (the knight stays on e3) and opens L+1 as an untouched copy of (0T1 ○).
4. Both worlds have the same skeleton (L0 end 3, L+1 [1, 1], created [1, 0], present T1 ●, Black to move). The knight
   is **50 % on L0 e3 and 50 % on L+1 e3**: one piece, two timelines. On L+1 its past self stands on d1 in both.
5. Without `applyMiss` world B would keep one timeline and no L0 advance; the core's solid roll would then have to
   settle the skeleton, destroying the link (this is why D-P rolled everything).

### 5.5 Twins, history and which-path memory

- **Twins** (example E4): Black travels to (0T1 ●), where White's knight stood 50 % c3 / 50 % e3. The new timeline L−1
  gets two twin knights, each present in half the possibilities. They are separate pieces, perfectly linked to the
  original. Measuring the twin on L−1 (which uses L−1's board) settles the original on L0 at once.
- **History ghosts**: landing on a past square where a ghost may have stood is a roll; its outcome also tells where
  the ghost went afterwards ("shoot the past to learn the present", example E2).
- **Which-path memory** (example E6): a merge brings a ghost back on the board, but the history boards still differ
  (they show where each part went). The worlds stay apart and count for the budget until the split boards leave the
  window (at most 4 advances of that row, two turns); then identical worlds merge by themselves. Quantum physics calls
  this *which-path information*; erasing it (here: forgetting the old boards) restores the single state.

### 5.6 The budget: ownership and the world bound

The budget counts the distinct arrangements of a side's pieces, history pieces and twins included. Only the side's
own splits and links can raise it:

- the opponent's moves never move my pieces except by capturing, and a capture's target is occupied, so it is always
  rolled (one outcome survives);
- a branch copies my pieces from a board I already have (twins are a function of my history), and an advance copies
  my latest pieces into history and drops the oldest board: neither can separate worlds that agree on my pieces;
- rolls and settling only remove worlds.

So "your opponent can never use up your budget" still holds (the fuzz checks it after every ply), and the number of
worlds is at most the product of the two budgets: 64 (budget 8) or 16 (budget 4).

### 5.7 Why this is fair and understandable

1. **One principle** explains every structural rule: boards are certain, pieces are quantum. Players can predict
   exactly which boards a move will create before any roll; the move preview can draw them.
2. **Timelines are AND, possibilities are OR**: the two kinds of "many" never mix. A timeline is never half there.
3. **Every attempt costs the same**: Moved, Linked, Missed and Measure all use their boards. There is no free probing
   (in D-P a Missed roll or a Measure is free, so a player can probe ghost after ghost at no cost).
4. **Budget ownership** holds (5.6), so the opponent cannot flood you with possibilities.
5. **Nothing is hidden**: past ghosts are drawn with their percentages; twins share the percentages of their original.
6. **Kings and pawns stay solid** on every timeline, so a king is never "maybe in the past".
7. **The present is certain**, so the must-move boards, Submit and the automatic end are never rolled.
8. **The same core rules** decide land = roll, pass = link, budget and game end; the multiverse adds only one
   restriction (one board per split or merge) and one extension (measuring uses a board).

### 5.8 Alternatives considered and rejected

| Alternative | Why not |
|---|---|
| Superposed skeleton (a timeline that exists in some possibilities) | The present, the must-move boards and Submit would become uncertain; the UI could not draw one multiverse; the core reads `nextSide` from one world. |
| Roll every uncertain move (`measured: () => true`, D-P) | Loses pass = link, the heart of Quantum Chess, and with it ghost travel. |
| A rolled Missed builds nothing (`info.hit === false` → identity) | Two rules instead of one; a Missed would be free and let players probe; the preview could not show the boards for sure. |
| Splits over two boards | The two children would build different boards; the core cannot add the other board's structure to a hit child without a new, non-generic hook. Jump and time splits give the same power on one board. |
| Measuring history parts or parts on the opponent's boards | Would allow measuring without using a board of your own; the past is settled only through the present. |
| Measuring for free (D-P) | Free information; asymmetric with the base game, where Measure costs the turn. |
| History as strings in `x` (E R2) | The core could not see the past: no land = roll in the past, no links through it, no time splits, no past ghosts on screen. |
| One id for all copies of a ghost | Id space grows as B · 2^rows (M §3.4); twins with cell ids are simpler and only lose "twins can merge". |

### 5.9 New tactics

| Tactic | What happens | Example |
|---|---|---|
| **Ghost raid** | Send one part of a ghost into the past. The timeline opens for certain (and rewinds the present if it is active); the raider is there only as a ghost. The opponent must defend against a piece that may not exist. | E1 |
| **The empty portal** | A travel move with a ghost part always rewinds the present and gives you a timeline, even when the dice say Missed. A cheap way to take the timeline tempo. | E5 |
| **Time-split fork** | Split into the past: the new timeline has your piece on two squares, e.g. attacking two targets on the copied board. | E3, sample game ply 11 |
| **Shoot the past** | Land on a past square where an enemy ghost may have stood: the roll reveals where that ghost is *now*, on the present board. | E2 |
| **Past shield** | A ghost that stood on a square of an older board blocks enemy time-travel rides there in some possibilities: their travel becomes a link and costs *their* budget (or is rolled when it is full). | E2 (Q4) |
| **Twin probe** | When the opponent copies your ghost into their timeline, measure the twin there (using that board) to learn where your original is. | E4 |
| **Quantum pass** | On a must-move board where every move is bad, measuring a ghost there uses the board without moving anything. Ghosts are tempo reserves. | Q11 |
| **Ghost king hunt** | A ghost that attacks a king in the past: the danger line shows 50 %; trying it is a game-end roll. | E7 |
| **Jump split and past merge** | Split onto another timeline's latest board (two boards pass at once), later merge there, or merge two halves into the past so the whole piece arrives in the new timeline. | E8, Q26 |
| **Rejoin across timelines** | A part jumps onto its own other part on another timeline: certain, no roll, the piece is whole again. | Q25 |

---

## 6. UI (`layoutOf(state)`)

Only features the board component has today (CC U2, U15): `boards`, `areas` (`frame`, `wood`, `river`), `lines`
(under the cells), `outlines` (above them), `labels`, `focus` with a `key`, `zoomable`. Prototype: `layout.mjs`.

### 6.1 Geometry (one square = 1 unit)

- n = board size. Column pitch `px = n + gx` (gx = 1.1 for n ≤ 5, 1.6 for 8), row pitch `py = n + gy` (1.6 / 2.0);
  left margin 3.0 (row labels), top margin 2.6 (header and "Now").
- **Rows**: the existing timelines ordered by L: Black's on top, L0, White's below. With `view: 'black'` the order is
  reversed and every board is turned 180° (files and ranks), **time still runs left to right**.
- **Columns**: the set of v of every stored board, plus `end + 1` of every row the side to move may play (the "next
  board" placeholder). Between two columns whose v differ by more than 1: a 1.2 gap with a "⋯" label.
- `width` = content width; `height = max(content height, 0.75 · width)` with the content centred vertically, so a
  zoomed window on a phone is tall enough for a whole board.

### 6.2 Cells and shades

Only squares of stored boards (and only the n×n part) become cells. Latest boards: `dark` / `light`; history boards:
`mid` / `light` (washed out). `size` = the world's `board.length` (boardView reads it; CC Q11 makes it safe).

### 6.3 Boards

One `boards[]` entry per stored board; label on the frame: latest `L+1 T5 ●`, history `T4 ○` (○ = White to move there,
● = Black).

### 6.4 Areas (under everything)

- **Present band**: `frame`, over the present column across all rows, label "Now" above it.
- **Must move**: `wood` halo 0.3 around each mandatory board of the side to move. **Optional**: `river` halo.

### 6.5 Lines, outlines and arrows

- **Branch connector** (`lines`, under the cells, visible in the gaps): from the right edge of the parent board (if
  stored) to the left edge of the row's first shown board; if the parent board is sealed, from the left margin at the
  parent row.
- **Next-board placeholder** (`outlines`): a rectangle (four segments) in the column after each playable row's latest
  board, with its label (`T3 ○`), so players see where their move will put the board.
- **Travel arrows** (`outlines`, above the cells): for the side to move's current turn and the opponent's last turn,
  every `record.info.arrows` entry whose two boards are shown: a shaft from the centre of the square the piece left
  to the centre of the square it reached, plus two 0.4 head strokes at ±25°. Linked travels get an arrow too (the
  piece moved in some possibilities); a Missed outcome has none.
- Last-move marks come from the record's `from` / `to` (CC U1); `to` of a branch is the target square on the past
  board, which the ring keeps in place.

### 6.6 Labels

- Row labels in the left margin: `L0`, `L+1`, `L−1`; a second line "inactive" for inactive rows.
- "⋯" in gap columns and to the left of a row whose older boards are sealed.
- Header: `New timelines: White {w}/{m} · Black {b}/{m}`.

### 6.7 Names (accessibility)

`names[sq]` for every drawn square: `t('Timeline {line}, turn {turn}, {side} to move: {square}')`, e.g. "Timeline
+1, turn 4, Black to move: c3". The board's aria labels then read "… c3: Knight (50 %)".

### 6.8 Focus and zoom

- Box: the mandatory boards of the side to move; if none, its playable boards; else the present column.
- `zoom = clamp(min(width / max(boxW + 2, 2.2 · px), height / (boxH + 2)), 1, 4)`: about two boards wide at least,
  centred on the box.
- `focus.key = [x.s, present, number of rows, view].join('/')`: the view recentres when the turn passes, the present
  moves, a timeline appears or the view changes, and **not** after each move inside a turn (CC U2), so a player's own
  zoom and pan survive a turn with several moves.
- The layout is memoised by skeleton + view + arrows (64 entries); a rebuild costs 0.06 ms.

### 6.9 Black at the bottom

`sides[1].rotate = 0` (a 180° rotation would reverse time) and the `view` option (rows reversed, boards turned). In a
game against the computer the player picks the view at the start. (A viewer-aware `layoutOf(state, { viewer })` was
deferred by CC item 48; with it, `view` could default to the human side.)

### 6.10 What the player sees and does

1. **Start of the turn**: the view zooms on the gold "must move" boards; the button reads "Submit turn (move on 2
   more boards first)" and is disabled; the danger line shows the chance that a king of yours can be taken.
2. **Tap a piece** on a gold or blue board: dots on every board it can reach: its own board, the latest boards of other
   timelines, faded past boards. The dashed placeholders show where boards will appear.
3. **Tap a target**: a certain or linked move plays at once; an uncertain one opens the roll box ("50 % Missed · 50 %
   Captured"). New boards appear in every outcome; a new row slides in with its connector.
4. **Split**: Split mode, tap the piece, tap two targets on one board (past boards included; a pair on two boards is
   refused with "Both halves must land on one board"). **Merge**: tap a part, the other part on the same board, then
   the target anywhere. **Measure**: tap a part on a gold or blue board; that board passes.
5. After the last must-move board the turn passes by itself, or "Submit turn" lights up when optional boards are left.
6. **Zoom** with + / −, "Whole board", pinch or Ctrl + wheel; pan by dragging.

### 6.11 Phone behaviour

- Default 5×5 with at most 5 rows. A 360 px wide phone at the focus zoom shows about two boards: ≈ 27 px per square
  on 5×5, ≈ 17 px on 8×8 (pinch to zoom in further).
- One UI move on the largest 5×5 state costs 25.6 ms in Node (≈ 80 ms on a phone); typical states under 5 ms.
- The computer usually answers within 0.1 s on 5×5; its slowest measured move took 0.8 s (≈ 2.4 s on a phone), and
  1.2 s on 8×8 (≈ 3.5 s). The levels' own time limits (`LEVELS.timeMs`) cap the search anyway.

### 6.12 Optional small UI improvements (not required)

- In Split mode, after the first target, mark only targets that form a legal pair with it (`splitsFrom` filtered by
  `t1`): generic, helps every variant where pairs can be refused.
- A "Now" button in the zoom bar that re-applies `layout.focus`.
- A viewer-aware `layoutOf(state, { viewer })` (6.9).

---

## 7. Worked example games (all verified by the prototype: `ex1.mjs` … `ex5.mjs`, `game2.mjs`)

Boards are written rank 5 first, files a–e; `N50` = a White knight with 50 %.

### E1. A knight in two timelines (ghost travel, pass = link) — `ex1.mjs`

Start *Small*. 1. W `L0:d1-L0:c3|L0:e3`: split, certain; 2 worlds, White budget 2; Black to move. 2. B `(0T1)a4-a3`.

3. W `(0T2)c3>>(0T1)e3`: **not rolled** (linked). L0 advances to T2 ●, a new timeline **L+1** opens from (0T1 ○) in
both possibilities; the knight is **50 % on L0 e3 and 50 % on L+1 e3** (its past self stands on L+1 d1 in both). The
present rewinds to T1 ● (L+1), so White's turn is over; Black must move on L+1, L0 is optional.

```
L0  T2 ●  k q b n r | . p p p p | p . . . N50 | P P P P P | K Q B . R
L+1 T1 ●  k q b n r | p p p p p | . . . . N50 | P P P P P | K Q B N R
```

4. B `(+1T1)e4-e3`: a pawn (solid) steps onto a square where the knight may be: **rolled, Missed 50 % / Moved 50 %**.
- *Missed*: the knight was on L+1 e3 all along: it is now 100 % there, L0 e3 is empty in every board, **the L+1 board
  passed** (T2 ○, the pawn did not move). The present is T2 ○, so Black may Submit or play L0.
- *Moved*: the knight was on L0 e3 (now 100 %), the pawn stands on L+1 e3.

### E2. Shoot the past; a past shield (land = roll and pass = link in the past) — `ex2.mjs`

Two possibilities (50/50), White to move, L0 from T2 ○ to T4 ○ (v2…v6). A Black knight ghost: at T2 ● it went
c3 → b1 in A and c3 → d1 in B. White: king on e3, bishop on a1; Black king d5.

```
v4 T3 ○ (A)  4k/5/5/4K/Bn3      (B)  4k/5/5/4K/B2n1
v6 T4 ○ (A)  3k1/5/4K/5/Bn3     (B)  3k1/5/4K/5/B2n1
```

- `(0T4)a1>>(0T2)c1` (a bishop step changes x and T together: over (0T3 ○) b1 to (0T2 ○) c1): **certain,
  linked**. In A the knight stands on (0T3)b1 and blocks the ride, so the bishop never leaves; in B it arrives.
  Timeline L+1 opens (copy of T2 ○) in both. Bishop: **L0 a1 50 % / L+1 c1 50 %**, linked to the knight's past
  (budgets 2 / 2). The knight's past was a **shield**, and White now carries a ghost.
- `(0T4)a1>>(0T3)b1` instead: the target (0T3)b1 may hold the knight: **rolled, Moved 50 % / Captured 50 %**. After
  *Captured*, the knight is known: it is **100 % on L0 b1 now** as well, and the new timeline L+1 has the White
  bishop on b1. Shooting the past told White where the knight is in the present.

### E3. The time split — `ex3.mjs` (part C)

Small: 1. W `(0T1)d1-c3`, 1… B `(0T1)a4-a3`. White's split targets from L0 c3 include the past board (0T1 ○):
`L0:d1 L0:a4 L0~1:a3 L0~1:e3`.

2. W `L0:c3-L0~1:a3|L0~1:e3`: **split into the past**, certain. One timeline L+1 opens (copy of T1 ○), with the
knight **50 % a3 / 50 % e3 on it**; L0 advances without the knight; created [1, 0]; Black to move on L+1.

```
L0  T2 ●  k q b n r | . p p p p | p . . . . | P P P P P | K Q B . R
L+1 T1 ●  k q b n r | p p p p p | N50 . . . N50 | P P P P P | K Q B N R
```

`L0:c3-L0:a4|L0~1:e3` (halves on two boards) is illegal.

### E4. Twins and a measurement across timelines — `ex3.mjs` (part E)

1. W `L0:d1-L0:c3|L0:e3`, 1… B `(0T1)a4-a3`, 2. W `(0T2)b2-b3`, 2… B `(0T2)d5>>(0T1)d3`: Black's knight travels to
(0T1 ●), where White's knight stood 50/50: timeline **L−1** opens with **two twin knights** (50 % c3, 50 % e3) and the
Black knight on d3. White must move on L−1 (present T2 ○), L0 is optional. White budget still 2.

3. W `?L−1:c3` (uses L−1's board): outcomes **gone 50 % / L−1:c3 50 %**. After "L−1:c3": 1 world; the twin on e3 is
gone, and **the original on L0 is 100 % c3**, in the present and in all history boards. Budget 1.

### E5. The empty portal (Missed still opens the door) — `ex3.mjs` (part G)

1. W `L0:d1-L0:c3|L0:e3`, 1… B `(0T1)a4-a3`. 2. W `(0T2)c3>>(0T1)c5` (capture the bishop in the past):
**rolled, Missed 50 % / Captured 50 %**.
- *Missed*: the knight was on e3 (now 100 %). Timeline **L+1 still opens** as an untouched copy of (0T1 ○), with the
bishop alive on c5; created [1, 0]; L0 passed; the present rewinds to T1 ●: White's turn is over.
- *Captured*: L+1 opens with the knight on c5 and the bishop gone.

Either way White gained the timeline and the tempo; only the capture was left to chance.

### E6. Which-path memory — `ex5.mjs` (part 1)

1. W `L0:d1-L0:c3|L0:e3` (2 worlds, budget 2), 1… B `(0T1)a4-a3`, 2. W `L0:c3|L0:e3-L0:d1`: merge, certain; the
knight is 100 % on d1, **but still 2 worlds and budget 2**: the history boards T1 ● and T2 ○ show the knight on c3 in
one and e3 in the other. 2… B `(0T2)b4-b3`, 3. W `(0T3)e2-e3`, 3… B `(0T3)c4-c3`: still 2 / 2 (L0 end 6). 4. W
`(0T4)d1-c3`: the split boards leave the window (L0 end 7): **1 world, budget 1**. The past forgot; the piece is one
again.

### E7. A ghost hunts a king in the past (game-end roll) — `ex5.mjs` (part 2)

Two worlds, White to move, L0 T2 ○ … T3 ○. A White knight went b1 → c3 (A) or b1 → a3 (B) at T2 ○; the Black king
stood on e3 at T2 ○. Danger for Black: **0.5**. `(0T3)c3>>(0T2)e3`: **rolled, Missed 50 % / Captured 50 %**.
*Captured*: White wins (`king`). *Missed*: no timeline (a king capture opens none), L0 passed, the game goes on.

### E8. Jump split and merge on another timeline — `ex4.mjs`

L0 and L+1 at T3 ○, a White knight on L0 c3. `L0:c3-L+1:a3|L+1:e3`: a **jump split**, certain: both boards pass,
the knight is 50 % a3 / 50 % e3 on L+1. After two Black king moves, `L+1:a3|L+1:e3-L+1:c4` merges it (certain;
still 2 worlds: L+1's history remembers). Other merges listed: `…-L+1:c2`, `…-L+1~1:c3` (into the past),
`…-L0:c3` (back to L0 by a jump).

### E9. A complete computer game (normal vs normal, Small, seed 2) — `aigames.mjs 2 2 normal normal 2`

```
 1. W (0T1)d2-d3              2. B (0T1)c4-d3             3. W (0T2)c2-d3             4. B (0T2)e4-d3
 5. W (0T3)c1-d2              6. B (0T3)d5>>(0T2)d3   Black's knight captures a pawn in the past: L−1 opens
 7. W (-1T3)b1-d3             8. W (0T4)d2-b4         White plays both must-move boards
 9. B (-1T3)b5>(0T4)b4        Black's queen jumps from L−1 to L0 and takes the bishop
10. W (-1T4)d1>>(0T4)d3       White's knight travels: L+1 opens
11. W L0:b1-L−1~3:b1|L−1~3:c2 time split of the queen into L−1's past: L+2 opens with the queen 50 % b1 / 50 % c2
12. B (-1T4)d5>>(-1T3)d3     13. B (+2T4)e4-d3          14. B (+1T4)b5-d3           15. B (0T5)b4-e1
16. W (-2T4)e2-d3            17. W (+2T5)d1>(+1T5)d3
18. W L−1:d3-L0:d2|L0:c3      jump split of the other queen onto L0: Black's danger 100 %
19. B (0T6)e1>(-2T4)c1
20. B (+2T5)d3-c2             pawn takes the ghost queen? rolled: Missed 50 % / Captured 50 % → Missed
                              (the queen on L+2 was on b1; the board passed)
21. B (+1T5)e5-e2            22. B (-1T5)a4-a3
23. W L0:d2|L0:c3-L0:a5       merge with capture: both halves reach a5, the Black king falls. White wins.
```

23 plies, 5 timelines, 2 splits (one into the past, one onto another timeline), one converging capture, one roll.

---

## 8. Test scenarios (expected results)

All are implemented in `prototypes/mv-quantum/tests.mjs` (123 checks, all passing). Notation: `S` = new game,
*Small*, 2 timelines; `S1` = `S` + `L0:d1-L0:c3|L0:e3` (split); positions from `buildWorld` (4.16); "certain" = one
outcome, not rolled; `oc` = outcome keys with percentages.

### Structure and classical rules

1. **T1 Start.** `S`: keys exactly `(0T1)d1-e3 (0T1)d1-c3 (0T1)a2-a3 (0T1)b2-b3 (0T1)c2-c3 (0T1)d2-d3 (0T1)e2-e3`;
   `splitsFrom(L0:d1)` = `[L0:d1-L0:c3|L0:e3]`; `submit` illegal; state JSON < 3 KB.
2. **T2 A move makes a board.** `S`, `(0T1)d1-c3`: turn 1; `tl[L0] = [0, 1, null, null]`; knight id 3 100 % on
   `L0:c3`; `L0~1:d1` holds `hn` with the history cell id.
3. **T3 Branch.** `S`, `(0T1)d1-c3`, `(0T1)a4-a3`: branch keys exactly `(0T2)c3>>(0T1)a3`, `…c5`, `…e3`. Then
   `(0T2)c3>>(0T1)a3`: L0 `[0, 3]`, L+1 `[1, 1, 0, 0]`, created `[1, 0]`, knight 100 % `L+1:a3`, its past self on
   `L+1:d1` with id of (L+1, d1); turn Black, mandatory `[L+1]`.
4. **T4 Optional boards and Submit.** Then `(+1T1)e4-e3`: turn stays Black, `submit` legal; after `submit` White
   must move on L+1 only; after `(+1T2)b2-b3` the turn passes by itself.
5. **T5 One jump clears two boards.** White to move, created [1, 0]; L0 `[0, 4]` `4k/5/R4/5/K4`, L+1 `[3, 4]`
   `4k/5/5/5/K4`: mandatory both; `(0T3)a3>(+1T3)a3` certain; both ends 5, turn Black.
6. **T6 An active branch rewinds the present.** created [0, 1]; L0 `[0, 8]` (8: `4k/5/5/5/K3R`, 6: `4k/5/5/5/K4`),
   L−1 `[7, 8]`: mandatory [L0, L−1]; `(0T5)e1>>(0T4)e1` → L+1 `[7, 7, 0, 6]`, present 7, turn White, `submit` legal.
7. **T7 An inactive branch does not.** created [1, 0], L+1 `[5, 8]`: the same move opens L+2 `[7, 7, 0, 6]`,
   inactive; present 8; `submit` illegal; mandatory [L+1].
8. **T8 The cap.** m = 1, created [1, 0], a Black king on (0T3 ○) e1: the only `>>` key is `(0T5)e1>>(0T3)e1`; it
   wins (`king`), no row opens, created stays [1, 0].
9. **T9 King captured in the past.** L0 `[2, 6]` (6: `3k1/5/4N/5/K4`, 4: `4k/5/5/5/K4`): `royalDanger(Black) = 1`;
   `(0T4)e3>>(0T3)e5` certain capture; result `{ winner: 0, reason: 'king' }`.
10. **T10 Window.** L0 `[0, 6]` (6: `4k/5/4R/5/K4`, 4 and 2: `4k/5/5/5/K3R`): keys `(0T4)e3>>(0T3)e3` and
    `(0T4)e3>>(0T2)e3`; nothing reaches T1.
11. **T11 Own past self blocks.** A rook on a1 on boards 2, 4, 6: no `(0T4)a1>>` key.
12. **T12 Pawn directions.** created [0, 1]; L0 `[0, 4]` `4k/5/5/2P2/K4`; L−1 `[2, 4]` (2: `4k/5/5/2n2/K4`): keys from
    c2 exactly `(0T3)c2-c3`, `(0T3)c2>(-1T3)c2`, `(0T3)c2>>(-1T2)c2`; the last is a certain capture.
13. **T13 Double steps and en passant.** `4k/3p*1/5/2P*2/K4`: `(0T3)c2-c4`, then Black has `(0T3)d4-c3` (kind `ep`);
    afterwards `L0:c4` is empty. Rows L0, L−1, L−2 at T3 with an unmoved pawn on L0 c2: `(0T3)c2>(-1T3)c2` and
    `(0T3)c2>(-2T3)c2`.
14. **T14 Promotion.** `4k/1P3/5/5/K4`: the only b4→b5 key is `(0T5)b4-b5=q`; afterwards type `q`.
15. **T15 Castling.** `k4/5/5/5/K*3R*`: `(0T5)a1-c1` gives king `k` on c1 and rook `r` on b1.

### Quantum

16. **Q1 Split.** `S1`: 2 worlds with weights 8,388,608 each, White budget 2, L0 `[0, 1]`, turn Black.
17. **Q2 A ghost travels (link).** `S1`, `(0T1)a4-a3`: `oc((0T2)c3>>(0T1)e3)` = `move 100 certain`; after it the
    knight is `L0:e3 50 / L+1:e3 50`, L+1 `[1, 1, 0, 0]` in **every** world, budget 2.
18. **Q3 A probe on the new timeline.** Then `(+1T1)e4-e3` = `miss 50 / move 50`; after Missed: 1 world, knight
    100 % `L+1:e3`, L+1 `[1, 2, 0, 0]` (the board passed), turn Black, `submit` legal.
19. **Q4 Pass = link through the past.** E2's state: `(0T4)a1>>(0T2)c1` certain; bishop `L0:a1 50 / L+1:c1 50`;
    budgets 2 / 2.
20. **Q5 Land = roll in the past.** `(0T4)a1>>(0T3)b1` = `move 50 / capture 50`; after Captured: 1 world, a knight on
    `L0:b1`.
21. **Q6 Time split.** `S`, `(0T1)d1-c3`, `(0T1)a4-a3`: `L0:c3-L0~1:a3|L0~1:e3` = `split 100 certain`; 2 worlds,
    knight `L+1:a3 50 / L+1:e3 50`, L+1 `[1, 1, 0, 0]`, created [1, 0], turn Black.
22. **Q7 Two boards.** `L0:c3-L0:a4|L0~1:e3` is illegal.
23. **Q8 Jump split.** created [1, 0], L0 `[0, 4]` `4k/5/2N2/5/K4`, L+1 `[3, 4]`: `L0:c3-L+1:a3|L+1:e3` certain;
    knight `L+1:a3 50 / L+1:e3 50`; both ends 5; turn Black.
24. **Q9 Merge on another timeline; parts on two boards.** Then `(0T3)e5-d5`, `(+1T3)e5-d5`, `L+1:a3|L+1:e3-L+1:c4`
    certain; knight 100 % `L+1:c4`; still 2 worlds, budget 2. After `S1`, `(0T1)a4-a3`, `(0T2)c3>>(0T1)e3`,
    `(+1T1)b4-b3`, `submit`: no merge is legal (parts on L0 and L+1).
25. **Q10 Which-path memory.** E6: after the merge 2 worlds / budget 2 / knight 100 % d1; after three more plies 2 / 2
    (L0 end 6); after `(0T4)d1-c3` 1 / 1 (L0 end 7).
26. **Q11 Measuring uses the board.** `S1`, `(0T1)a4-a3`: `?L0:c3` = `L0:c3 50 / L0:e3 50`; after "L0:c3": 1 world,
    L0 end 3, turn Black, knight 100 % c3.
27. **Q12 Only on a board you may play.** A ghost with both parts on L+1 while L+1's latest board is Black's: `?L+1:a3`
    illegal, no measure in `legalMoves`.
28. **Q13 Twins.** E4: twins `off 50 / L−1:c3 50` and `off 50 / L−1:e3 50`, budget 2, L−1 `[2, 2, 0, 1]`, mandatory
    [L−1]; `?L−1:c3` = `gone 50 / L−1:c3 50`; after "L−1:c3": 1 world, knight id 3 100 % `L0:c3`, budget 1.
29. **Q14 A rolled Missed still opens the timeline.** `S1`, `(0T1)a4-a3`: `(0T2)c3>>(0T1)c5` = `miss 50 / capture
    50`; after Missed: L+1 `[1, 1, 0, 0]`, created [1, 0], knight 100 % `L0:e3`, `L+1:c5` holds the bishop.
30. **Q15 Game-end roll in the past.** E7: danger 0.5; outcomes `miss 50 / capture 50`; Missed: no result, 1 row, L0
    end 5, created [0, 0]; Captured: `{ winner: 0, reason: 'king' }`.
31. **Q16 Danger is the union.** Black to move, Black king c5; one White knight 50 % b3 / 50 % e4:
    `royalDanger(Black) = 1` (each position alone would be 50 %).
32. **Q17 A king step onto a maybe-occupied square.** Black knight b2 (A) / c3 (B): `(0T3)a1-b2` = `move 50 /
    capture 50`.
33. **Q18 One skeleton.** After any move of Q4 every world has the same `solidExtra`.
34. **Q19 Budget fallback.** E2's state with `budgetRule: () => ({ limit: 1 })`: `(0T4)a1>>(0T2)c1` = `miss 50 /
    move 50` (rolled); the Missed state has L+1 `[3, 3, 0, 2]`, bishop 100 % `L0:a1`, `L+1:c1` empty. Without the
    limit: `move 100 certain`.
35. **Q20 Budget per setup.** limits: Small/2 → 8, Standard/2 → 4, Small/3 → 4.
36. **Q21 A piece absent from the first world merges.** Worlds C (no knight, weight 2), A (knight c3), B (knight e3),
    one id: `ty` in world 0 is `''`; `L0:c3|L0:e3-L0:d1` legal and certain; afterwards `off 50 / L0:d1 50`.
37. **Q22 The phantom list.** Q16's state: danger 1 (no crash in the converging-capture check); `generate(A, 0)` =
    `[['†', -1]]`.
38. **Q23 Castling is certain-only.** K*a1, R*e1 and a White knight 50 % d1 (between them) / 50 % b2: `(0T5)a1-c1`
    illegal; with the knight 50 % b2 / 50 % b3: `move 100 certain`.
39. **Q24 En passant after a linked world.** Knight ghost a2 / c1 (never on the lines): after `(0T3)c2-c4` both worlds
    have `ep = c3`; `(0T3)d4-c3` = `capture 100 certain`.
40. **Q25 Rejoin across timelines.** Knight 50 % L0 a3 / 50 % L+1 c3: `(0T3)a3>(+1T3)c3` certain; afterwards 100 %
    `L+1:c3`, both ends 5.
41. **Q26 Merge into the past.** Knight 50 % b1 / 50 % d1 on L0 (T3 ○), (0T1 ○) empty around c1:
    `L0:b1|L0:d1-L0~1:c1` certain; 100 % `L+1:c1`, L+1 `[1, 1, 0, 0]`, 2 worlds (memory).

### Limits, results, computer, records

42. **L1 No legal move.** Mandatory L0 with only a Black king on it, White to move: `hasLegalMove` false; `noMoves` →
    `{ winner: 1, reason: 'stuck' }` with a Black rook attacking White's king on L+1, else `{ winner: null, reason:
    'noMoves' }`.
43. **L2 Limits.** `ply = 1199` + any move → `moveLimit`; `quiet = 299` + a knight move → `quiet`; a pawn move resets
    `quiet` to 0.
44. **A1 The computer's view.** After T3's branch (Black: L+1 mandatory, L0 optional): pruned keys ⊂ legal keys and
    fewer; each starts with `(+1T1)` or contains `>(+1T1)`; a jump from `(0T2)` onto L+1 is kept. At the start (no
    optional board) `aiView` returns the state itself.
45. **A2 The computer.** T9's position: `chooseMove` (normal) wins at once; from the start (easy) it plays a legal move.
46. **R1 Records.** After T3's branch: `info = { rows: [1], arrows: [[0, 2, 2, 2, 1, 1, 0, 2]] }`; after Q14's Missed:
    `{ rows: [1], arrows: [] }`.

### UI

47. **U1 Start layout.** 25 cells; boards `['L0 T1 ○']`; areas `frame`, `wood`; 4 outlines (the placeholder);
    `height ≥ 0.75 · width`.
48. **U2 After a branch.** Row labels `L0`, `L+1` (L+1 below L0); 1 connector line; areas `frame`, `river`, `wood`;
    outlines: 2 placeholders + 1 arrow (shaft + 2 heads) = 11.
49. **U3 Focus key.** After T3's branch: `(+1T1)e4-e3` moves the present (T1 ● → T2 ○), so the key changes; the
    optional `(0T2)b4-b3` instead keeps turn, present and rows, so the key stays the same.
50. **U4 Black's view.** L+1 drawn above L0; `T1 ○` left of `L0 T2 ●` (time still runs left to right).
51. **U5 Names.** `names[L+1:a3]` = "Timeline +1, turn 1, Black to move: a3".

Invariants (the fuzz and every test): weights sum to T; `sq`/`board` agree in every world; `solidExtra` equal in all
worlds; solid pieces equal in all worlds; used budget ≤ limit for both sides; worlds ≤ product of budgets; the side
to move equals `x.s`; the opponent's move never raises a budget.

---

## 9. Deviations from the official game (for `docs/variants.md`)

1. Capture the king instead of checkmate; the danger line replaces "you are in check"; no legal move while a king can
   certainly be taken loses, otherwise it is a draw.
2. At most 1–3 new timelines per player (a king in the past can still be captured after that); two turns of history.
3. Moves inside a turn cannot be taken back to be rolled again (Undo replays the same rolls); the turn ends by itself
   when no board is left.
4. Odd starts only (one L0): no Turn Zero, no −0/+0 variants, no unicorns, dragons, brawns, princesses. Promotion to
   a queen only (as the official game).
5. En passant is not possible on the first board of a new timeline (as 5d-chess-js; P §9 item 5).
6. Quantum: section 1.8.

## 10. Open points for the lead

1. **The hook name**: `allowQuantum(state, action)` (4.10). It is generic (any variant could restrict splits, merges
   or measurements); the prototype patch is 20 lines in five call sites plus the merge type bug fix.
2. **State size of the default** (4.15): 0.75 MB in the worst case (64 worlds). If that is too much for
   localStorage, set the budget to 4 for every setup (one constant in `budgetRule`; worst case 190 KB) or add a
   generic "the game could not be saved on this device" notice when `saveVariantGame` returns false.
3. **Measure on optional boards**: allowed (any board you may play). Restricting it to must-move boards would make the
   "quantum pass" stronger but is harder to explain.
4. **`view` option versus a viewer-aware layout** (6.9).
5. **Knights setup**: official *Focused – Just Knights* has no pawns, so its games end only by king capture or the
   300-move rule; keep it or drop it.

## 11. Reproduction (`handoff/prototypes/mv-quantum/`)

| File | What |
|---|---|
| `mvq.mjs` | the variant (topology, types, setups, generate, apply, applyMiss, allowQuantum, hooks, AI hooks, `buildWorld`) |
| `layout.mjs` | `layoutOf` (section 6) |
| `core/` | a snapshot of the working-tree core (`quantum`, `ai`, `world`, `variant`, `topology`) with the two patches of 4.10 |
| `lib.mjs` | helpers: `show`, `play`, `outs`, `invariants`, `stateOfWorlds`, `seeded` |
| `tests.mjs` | the scenarios of section 8: `node tests.mjs` → 123 passed |
| `fuzz.mjs` | random games with invariants: `node fuzz.mjs small 30 150 2` |
| `bench.mjs`, `uicost.mjs`, `sizes.mjs` | timings (4.14), UI cost, state sizes (4.15) |
| `aiplay.mjs`, `aigames.mjs`, `game2.mjs` | computer matches, logged games, E9 |
| `ex1.mjs` … `ex5.mjs` | worked examples E1–E8 |

Results of the last runs are in `handoff/tmp/mvq/` (ignored by git).
