# Multiverse chess (Quantum 5D): complete design, lens "maximum fidelity"

Variant id `multiverse`, category `dimensions`, catalogue name *Multiverse chess (5D)*.

This design stays as close to *5D Chess With Multiverse Time Travel* (Thunkspace, 2020) as the quantum engine
allows: the real turn (moves on your boards, the present, Submit), active and inactive timelines, hops and branches
with the official numbering, every official piece (unicorn, dragon, princess, brawn, common king, royal queen), the
standard 8 × 8 start plus 19 other official setups, and the official stalemate and checkmate classification. It is
genuinely quantum: ghosts can travel through time, the past itself can be uncertain and is drawn that way, and new
timelines copy ghosts as linked twins.

It is built on the core as planned in `handoff/CORE-CHANGES.md` (Q1 `applyMiss` with `info.hit`, Q2 certain castling
and en passant, Q3 `unifyWorlds`, Q4 short notes, Q9 record squares, Q11 the `squareView` guard, U1, U2, U3, U6, U7,
U9, U11) and asks for **two** more small, generic, backwards-compatible items (X1 marker ids, X2 `budgetExtra`,
section 5.15). Everything was validated on a prototype wired to a patched copy of the real core:
`handoff/prototypes/mv-faithful/` (section 9). Measured facts are marked **[measured]**.

Sources: `research/multiverse-rules.md` (R), `research/multiverse-pieces.md` (P), `research/multiverse-engines.md`
(E), the earlier spec `research/multiverse.md` (M), the competing `research/multiverse-design-playable.md` (PD),
`docs/rules.md`, `handoff/IMPLEMENTING.md`, `handoff/CORE-CHANGES.md`, and the core in `src/variants/core/`.

---

## 0. The decisions at a glance

| # | Question | Decision | Why |
|---|---|---|---|
| F1 | Boards | **Standard 8 × 8 is the default.** 19 more official setups are options: the Standard family (Turn Zero, Two Timelines, Princess, Reversed Royalty, Defended Pawn, Half Reflected), Simple – No Queens 7 × 7, Small 5 × 5 (two), Very Small 4 × 4 (two), Focused (unicorns, dragons, brawns), Misc (King of Kings, Royal Queen Showdown, Excessive, Timeline Marauders, Timeline Invasion). | Fidelity: the real game starts on 8 × 8; every official piece occurs; the small boards serve phones and quick games. |
| F2 | A turn | Exactly 5D: move on every board of yours **at the present**, optionally on your other boards, then **Submit**. The turn also ends by itself when you have no board left. No pass. | The present and the Submit rule are the heart of 5D. |
| F3 | Travel | All four axes; **hop** onto another timeline's latest board, **branch** onto any older board; official numbering (+n White, −n Black, −0/+0 in even starts); the official activity rule; the present moves back after an active branch and after a reactivation. | Verified move for move against 5d-chess-js (section 9). |
| F4 | Limits | New timelines per player **2 / 3 / 4** (default 3); travel reach **2 / 4 / 6 turns** (default 4); at the cap a royal piece in the past can still be captured. | Bounded rows and state size; the reach covers every decoded real-game move (P 6.3). |
| F5 | Winning | **Capture a royal piece** (king or royal queen) on any board, past boards included. | Quantum Chess has no check; section 4 argues why the 5D spirit survives. |
| F6 | No legal action | If you cannot finish your turn, the game ends at once: **checkmate** (loss) if a royal piece of yours would certainly be captured, otherwise **stalemate** (draw). Detected exactly by a structural test (5.13). | The official classification, without the exponential search. |
| F7 | Pass = link, land = roll | Everywhere, **through time and across timelines**. A ghost that was not really there still takes its boards along (`applyMiss` with `hit`): the board passes, a jumped-to board passes, the new timeline still opens as an untouched copy. | "The structure follows the move, never the outcome": one multiverse in every possibility. |
| F8 | A rolled Missed | Uses up **only the board it was played from**; nothing opens, nothing arrives. | Quantum Chess: a Missed move still costs the move. 5D: the move's board is spent. |
| F9 | Measure | **Uses up one of your boards** (the board of the tapped part if it is yours to play, else your first must-move board). | Quantum Chess: measuring costs the move; a free measurement would make every rolled ghost attack pointless (measure first, then attack for certain). |
| F10 | Split and merge | On **one board** (travel moves are never split or merge moves). | A split into the past would open a timeline in half of the possibilities. |
| F11 | The past | History boards are **real squares** in the world. They show ghosts with their chances; a branch copies them as **linked twins**; they count toward the owner's budget until they leave the travel reach. | "The past is uncertain" is the most quantum 5D effect; players must see it. |
| F12 | One multiverse | Timelines, their ends, who created them, the present and whose turn it is are identical in every possibility (`solidExtra`). | One board picture, one present, one Submit. |
| F13 | Castling, en passant | Only on one board, as in 5D; castling without any check test (Quantum Chess); both are **certain-only** (Q2); the castling right follows the state (Q3). | Official rule plus the shared Quantum Chess rule. |
| F14 | Promotion | **Queen only**, automatic (official). | S4/S7 in P 4.3. |
| F15 | Computer | The generic `ai.js`; `aiView` prunes the candidates world-independently; `evaluate` adds 5D terms; multi-move turns via U3's default; `stateResult` lets the search see stuck turns. | Plays every setup; one ply ≤ 1.9 s at normal **[measured]**. |
| F16 | Hooks | Planned: Q1, Q2, Q3, Q4, Q9, Q11, U1, U2, U3, U6, U7, U9, U11. Requested: **X1** marker ids on the board (a one-line fuzz change), **X2** `budgetExtra(b, side)` in the budget. Optional UI-step items in 7.8. | Section 5.15. |

---

## 1. Player-facing rules (complete)

### 1.1 The multiverse

- Each **row is a timeline**. **Time runs to the right** for both players. The standard game starts with one timeline,
  **L0**, holding one board.
- Every board has **a player to move**: a **White board** (○) or a **Black board** (●). Along a timeline they
  alternate: T1 ○, T1 ●, T2 ○, T2 ● … **T** is the turn number printed on the board.
- Only the **latest board of a timeline** can be moved on, and only by the player whose board it is. All older boards
  are **history**: they never change.
- Every move adds boards: the board you moved on gets a successor with your move made (it is then your opponent's
  board), and the old one stays behind as history.
- Pieces can travel back **at most 4 turns** (option 2, 4 or 6). Boards older than that are **sealed**: they are
  shown as "⋯", nothing can travel to them or through them, and a king that stood there is safe there.

### 1.2 Your turn

- **The present** is the earliest latest board among the **active** timelines (1.3). It is marked with a light band.
- **Must-move boards** (gold halo): your latest boards at the present. You must make one move on each of them.
- **Optional boards** (blue halo): your other latest boards (timelines that are ahead of the present, or inactive).
  You may move on them, once each.
- Each board takes part in **at most one move per turn**: after you move on it, or a piece of yours arrives on it, it
  is your opponent's board.
- When the present has passed to your opponent, press **Submit turn**, or keep moving on optional boards first. Your
  turn also ends by itself when you have no board left to move on. There is no pass.
- **Moves are final**: every move is settled at once (with its roll, if any), so it cannot be taken back.

### 1.3 Travelling through time and timelines

- A piece moves along **four axes**: files, ranks, **time** and **timelines**. One step in time is one whole turn
  back (from T5 ○ to T4 ○), so a piece always lands on a board where its own player is to move. One step across is
  the neighbouring timeline at the same turn.
- **Jump**: landing on the latest board of another timeline moves the piece there; both timelines get a new board.
- **Branch**: landing on an **older** board (of any timeline, also your own) **opens a new timeline**: the old board
  is copied, your piece arrives on the copy (capturing what stands there), and your opponent moves there next. Only
  your piece comes along. Your own timeline gets a new board without the piece.
- A timeline you open is numbered **+1, +2, …** (White) or **−1, −2, …** (Black) and drawn below (White's) or above
  (Black's) the others. With two starting timelines they are called −0 and +0.
- **Active timelines**: the starting timelines are always active. Your *n*-th new timeline is active only while your
  opponent has opened at least *n − 1*. Inactive timelines can be played, but they do not count for the present.
  Opening a timeline can make an older timeline of your opponent active again.
- **The present moves**: forward when the must-move boards have been played; **back** when someone opens an active
  timeline in the past (the new board is then the earliest, and it is the opponent's), or when a timeline becomes
  active again. After you move the present back, your remaining must-move boards become optional.

### 1.4 The pieces

Every piece keeps its chess pattern in all four axes. "Axes" are files, ranks, time and timelines; "diagonal" means
the same distance on each axis used.

| Piece | Moves |
|---|---|
| Rook | any distance along **one** axis |
| Bishop | any distance along **two** axes, the same distance on both |
| Unicorn | any distance along **three** axes (it cannot move within its own board) |
| Dragon | any distance along **all four** axes (it cannot move within its own board) |
| Princess | rook or bishop |
| Queen | any distance along one, two, three or four axes |
| Royal queen | moves like a queen; it is **royal** like a king |
| King | one step along one to four axes; royal |
| Common king | moves like a king, but is **not** royal and never castles |
| Knight | two steps along one axis and one along another (it jumps) |

A sliding piece needs every board on its way to exist and every square on its way to be empty, as they were then.
Your own pieces block you, also your own past self.

### 1.5 Pawns and brawns

- White goes **up**: forward in rank, or **one timeline up** (towards Black's timelines) at the same turn. Black goes
  down.
- A pawn that has never moved may make a **double step** in either direction (the square in between must be empty,
  and for the timeline double step the board in between must exist).
- Captures: diagonally forward on its board, or **one timeline forward and one turn back or ahead**, on the same
  square. A pawn never moves along time alone and never captures straight ahead.
- A **brawn** moves like a pawn and also captures one step along exactly two axes when it goes forward along at least
  one of them and backward along none: sideways plus one timeline forward, one rank forward plus one timeline forward,
  or one rank forward plus one turn back.
- **Promotion**: a pawn or brawn that reaches its last rank becomes a **queen** at once.
- **En passant** works only on one board, on the move right after the double step, as in chess.

### 1.6 Castling

On one board only, with a king and a rook that have never moved: the two squares next to the king towards the rook
and every square up to the rook are empty; the king moves two squares towards the rook and the rook lands on the
square the king crossed. There is no check, so castling out of, through or into danger is allowed. As everywhere in
Quantum Chess, castling needs those squares empty in every possibility, it is never rolled, and a rook that is not
100 % on its square has lost the right for good.

### 1.7 Winning and drawing

- **You win by capturing a king or royal queen** of your opponent on any board: a latest board, or a past board by
  travelling there. A player can have several kings (a king that travels meets its own past self); losing any one of
  them loses the game.
- **King danger**: the line under the board shows the chance that your opponent could capture one of your royal
  pieces on their next turn if you only moved elsewhere. At 100 % this is what 5D players call **check**; the
  threatened royal squares are tinted red.
- **No way to finish your turn** (a must-move board you cannot move on, nothing can arrive on it, and you cannot move
  the present back): the game ends at once. You **lose** if one of your royal pieces would certainly be captured
  (checkmate), otherwise it is a **draw** (stalemate).
- **Draws** also: 300 moves in a row without a capture or a pawn or brawn move actually happening; 1200 moves in the
  game; agreement.

### 1.8 Quantum in the multiverse

All Quantum Chess rules apply (split, merge, measure, land = roll, pass = link, solid kings and pawns, budget 8, at
most 64 possibilities, the game-end roll), with these multiverse rules:

- **Solid pieces**: kings, royal queens, common kings, pawns and brawns. Knights, bishops, rooks, queens, princesses,
  unicorns and dragons can split.
- **Split and merge stay on one board**: the targets are squares of the piece's own board.
- **A ghost travels, the boards stay certain.** A ghost part may jump or open a timeline. Where the piece was not
  really there (and nothing is rolled), the move still happens on the boards: your board passes, a jumped-to board
  passes, and the new timeline still opens as a copy of the past **with nobody arriving**. The piece is then partly
  here, partly in the other timeline.
- **Land = roll, also in the past.** Landing on a square where a piece is or might be, on any board, is a roll.
- **Missed uses up the board.** If the dice say Missed, your piece stays where it was, only the board you played from
  is used (it passes to your opponent), nothing opens and nothing arrives.
- **Measuring uses up a board**: the board of the part you tap if it is yours to play, otherwise your first
  must-move board.
- **The past is quantum.** History boards show ghosts with their chances. A new timeline copies them as **twins**:
  linked copies that are always where the original was; find out where one is and you know where all are.
- **The past remembers.** Old ghost squares keep counting toward your budget until the boards are older than the
  travel reach.
- **One multiverse.** Which timelines exist, how long they are, the present and whose turn it is are always certain.

### 1.9 Limits

| Limit | Value | At the limit |
|---|---|---|
| New timelines per player | 2, 3 or 4 (default 3) | no more branches, except a branch that captures a royal piece (it ends the game and opens nothing); jumps stay possible |
| Travel reach | 2, 4 or 6 turns (default 4) | older boards are sealed: no target, a ride stops there |
| Budget | 8 per player, 64 possibilities | the shared Quantum Chess rules |
| Moves without a capture or pawn or brawn move | 300 | draw |
| Moves in the game | 1200 | draw |

### 1.10 `rules()`: eight sentences

```js
rules: () => [
	t('quantumchess', 'Every row is a timeline and time runs to the right. You move only on the latest board of a timeline, and only where it is your move; every move adds a new board.'),
	t('quantumchess', 'On your turn you must move once on each of your boards at the present, the earliest latest board of the active timelines. Then press Submit turn, or first move on your other boards; the turn also ends when you have no board left.'),
	t('quantumchess', 'Pieces move along four axes: files, ranks, turns back in time and timelines. Rook: one axis; bishop: two; unicorn: three; dragon: four; queen: any; knight: two and one; king: one step.'),
	t('quantumchess', 'Landing on the latest board of another timeline jumps there. Landing on an older board opens a new timeline where only your piece arrives; your n-th new timeline is active only if your opponent has opened at least n − 1.'),
	t('quantumchess', 'Pawns and brawns move forward on the board or one timeline towards the opponent, capture diagonally or one timeline forward and one turn back or ahead, and promote to a queen.'),
	t('quantumchess', 'There is no check: capture a king or royal queen on any board, also in the past, to win. If you cannot finish your turn, you lose when a king of yours would certainly be taken, otherwise it is a draw.'),
	t('quantumchess', 'A ghost that was not really there still takes its boards along: they pass, and a new timeline still opens without it. A Missed roll uses up only the board you moved from; measuring uses up one of your boards.'),
	t('quantumchess', 'The past is quantum too: old boards show ghosts with their chances, new timelines copy them as linked twins, and they count toward your budget until they are older than the travel reach.'),
],
```

---

## 2. Boards, setups, time and the turn (exact)

### 2.1 Options

```js
options: [
	{ id: 'setup', type: 'choice', label: () => t('quantumchess', 'Start position'), default: 'standard',
	  values: SETUP_IDS.map((id) => ({ id, label: SETUP_LABELS[id] })),       // table 2.2, in its order
	  describe: (v) => SETUP_DESCRIPTIONS[v]() },                           // U11: "8 × 8, one timeline"
	{ id: 'timelines', type: 'choice', label: () => t('quantumchess', 'New timelines per player'), default: '3',
	  values: [{ id: '2', label: … }, { id: '3', label: … }, { id: '4', label: … }] },
	{ id: 'reach', type: 'choice', label: () => t('quantumchess', 'How far back pieces can travel'), default: '4',
	  values: [{ id: '2', label: () => t('quantumchess', '2 turns') }, { id: '4', … }, { id: '6', … }] },
	{ id: 'flip', type: 'boolean', label: () => t('quantumchess', 'Show Black at the bottom'), default: false },
],
```

`flip` only changes the drawing (7.1). `setup(options)` reads `Number(options.timelines)` (M) and
`2 * Number(options.reach)` (HB, history boards per timeline).

### 2.2 Setups (5DFEN, ranks top to bottom; K, R, P, W start unmoved)

| id | Official name | Size | Start timelines | Position |
|---|---|---|---|---|
| `standard` | Standard | 8 | 0 | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR` |
| `turnzero` | Standard – Turn Zero | 8 | 0 (T0 ● history and T1 ○) | the Standard position on both boards |
| `twotimelines` | Standard – Two Timelines | 8 | −0, +0 | Standard on both |
| `princess` | Standard – Princess | 8 | 0 | `rnbskbnr/…/RNBSKBNR` |
| `reversed` | Standard – Reversed Royalty | 8 | 0 | `rnbycbnr/…/RNBYCBNR` |
| `defended` | Standard – Defended Pawn | 8 | 0 | `rqbnkbnr/…/RQBNKBNR` |
| `halfreflected` | Standard – Half Reflected | 8 | 0 | `rnbkqbnr/…/RNBQKBNR` |
| `noqueens` | Simple – No Queens | 7 | 0 | `rnbknbr/ppppppp/7/7/7/PPPPPPP/RNBKNBR` |
| `small` | Small | 5 | 0 | `kqbnr/ppppp/5/PPPPP/KQBNR` |
| `smallcentered` | Small – Centered | 5 | 0 | `rnkqr/ppppp/5/PPPPP/RQKNR` |
| `verysmall` | Very Small | 4 | 0 | `nbrk/pppp/PPPP/KRBN` |
| `verysmallopen` | Very Small – Open | 4 | 0 | `nbrk/3p/P3/KRBN` |
| `justunicorns` | Focused – Just Unicorns | 5 | 0 | `1u1uk/5/5/5/KU1U1` |
| `justdragons` | Focused – Just Dragons | 5 | 0 | `2ddk/5/5/5/KDD2` |
| `justbrawns` | Focused – Just Brawns | 5 | 0 | `wwwwk/5/5/5/KWWWW` |
| `kingofkings` | Misc – King of Kings | 5 | 0 | `cckcc/5/5/5/CCKCC` |
| `royalqueens` | Misc – Royal Queen Showdown | 6 | 0 | `4y1/6/6/6/6/1Y4` |
| `excessive` | Misc – Excessive | 7 | 0 | `kruqdrk/rnbknbr/ppppppp/7/PPPPPPP/RNBKNBR/KRUQDRK` |
| `marauders` | Misc – Timeline Marauders | 5 | −1, 0, +1 | (−1) `wrkrw/1www1/5/5/5` · (0) `w1w1w/5/5/5/W1W1W` · (+1) `5/5/5/1WWW1/WRKRW` |
| `invasion` | Misc – Timeline Invasion | 5 | −0, +0 | (−0) `nbkrb/ppppp/5/5/PPPPP` · (+0) `ppppp/5/5/PPPPP/NBKRB` |

Letters: K king, C common king, Y royal queen, Q queen, S princess, R rook, B bishop, N knight, U unicorn, D dragon,
P pawn, W brawn. White (side 0) moves first. More official 5DFEN setups (P 7.2) can be added as table rows; the
engine needs nothing else (even starts, three starting timelines and a staggered start are all supported by the
skeleton).

### 2.3 Time and colours

- Half-turn index **v = 2·T + c**, c = 0 White to move (○), 1 Black (●). T1 ○ = 2, T1 ● = 3, T0 ● = 1.
- `T(v) = v >> 1`, colour `v & 1`. One step of a piece in time changes v by **2** (same colour).

### 2.4 Timelines

- Internal row index **l** (integer). Single start: L0 = 0, White's k-th new timeline l = +k, Black's l = −k. Three
  starting timelines: −1, 0, +1, then ±2 …. Even start: −0 is l = −1, +0 is l = 0, White's k-th is l = k, Black's
  k-th is l = −1 − k. **One step across is always ±1 in l** (−0 and +0 are neighbours).
- Labels: odd starts `0`, `+k`, `−k`; even starts `+l` for l ≥ 0, `−(|l| − 1)` for l < 0. The minus is U+2212.
- Created counts: White `cW = lmax − l0max`, Black `cB = l0min − lmin` (`[l0min, l0max]` = the starting range).
- Per row: `st` (first board), `en` (latest board), parent `(pl, pv)` (the board it was copied from; none for a
  starting row) and its storage slot (creation order).

### 2.5 Which boards exist

- Board (l, v) **exists** iff the row exists and `max(st, en − HB) ≤ v ≤ en`, HB = 2 × reach (8 by default).
- Boards before `st` never existed on that row; boards older than `en − HB` are **sealed**.

### 2.6 Active, present, playable, mandatory, optional

- `active(l)`: `l0min ≤ l ≤ l0max`; or l > l0max and `l − l0max ≤ cB + 1`; or l < l0min and `l0min − l ≤ cW + 1`.
- **present P** = min `en` over the active rows.
- `playable(side)` = rows with `en & 1 = side`. `mandatory(s)` = active rows with `en = P` when `P & 1 = s` (else
  none). `optional(s)` = `playable(s)` minus `mandatory(s)`.
- **Submit is legal iff `P & 1 ≠ s`** (the present has passed).

### 2.7 The turn

- A turn is every move made by the side to move `s` (ordinary moves, splits, merges, measurements) until the side
  changes.
- **The turn ends by itself** after any move of `s` that leaves `playable(s)` empty (then `P & 1 ≠ s` holds).
- **Submit** (`↵`) is an ordinary move key, legal iff the present has passed; it only sets the side to move.
- At the start of a turn the present always has the mover's colour, so at least one move is needed: **no pass**.
- Skeleton only, so all of this is the same in every possibility.

### 2.8 What a move does

Let the piece stand on the latest board of row u (v = en(u)) and land on board (u2, v2).

| Kind | Condition | Effect |
|---|---|---|
| physical | (u2, v2) = (u, v) | row u advances with the move made |
| hop (`>`) | (u2, v2) ≠ (u, v), v2 = en(u2) | row u advances without the piece; row u2 advances with the piece on the target (capturing) |
| branch (`>>`) | v2 < en(u2) (any row, also u) | row u advances without the piece; a **new row** for the mover: `st = en = v2 + 1`, parent (l(u2), v2), board = copy of (u2, v2) with the piece on the target (capturing the copy there) |
| branch onto a royal piece | the target on (u2, v2) holds an enemy king or royal queen | row u advances without the piece, the mover wins; **no row opens** |

The travelling piece becomes "moved"; every copied piece keeps its unmoved state from the copied board. En passant
rights do not travel.

### 2.9 Branch permission

A branch is generated iff the mover has created fewer than M timelines, or its target holds an enemy royal piece. M
is at most 4, so rows stay within the capacity (5.2).

### 2.10 Results and limits

| Situation | Result | Reason code |
|---|---|---|
| a royal piece is captured (in the chosen possibility) | the capturer wins | `king` |
| the side to move cannot finish its turn (5.13), a royal piece of it would certainly be captured | the other side wins | `checkmate` |
| the same, otherwise | draw | `stalemate` |
| `quiet` reaches 300 | draw | `quiet` (core) |
| `ply` reaches 1200 | draw | `moveLimit` (core) |

`maxPly: 1200`, `quietPlies: 300` (variant fields; CORE-CHANGES item 47).

---

## 3. The pieces as vectors (dx, dy, dT, dL)

### 3.1 Axes and orientation

x = file, y = rank, T in whole turns (v changes by 2·dT), L in timelines. Vectors are written for White; **Black
negates dy and dL only** (pawn and brawn; every other piece is symmetric). Vectors with **dL = 0 and dT > 0** are
dropped: they can never find a board (the source is the latest board of its row).

### 3.2 Riders and leapers (generators from `core/topology.js`, filtered by the rule above)

| Type ids | Piece | Vectors | Count | Kind |
|---|---|---|---|---|
| `r0`, `r` | rook | `directions(4, 1)` | 7 | ride |
| `b` | bishop | `directions(4, 2)` | 20 | ride |
| `u` | unicorn | `directions(4, 3)` | 28 | ride |
| `d` | dragon | `directions(4, 4)` | 16 | ride |
| `s` | princess | rook + bishop | 27 | ride |
| `q`, `y` | queen, royal queen | `allDirections(4)` | 71 | ride |
| `k0`, `k`, `c` | king, common king | `allDirections(4)` | 71 | leap (one step) |
| `n` | knight | `symmetric([2, 1], 4)` | 40 | leap |

- **Leap**: the target board must exist and the target square must be empty or hold an enemy.
- **Ride**: k = 1, 2, …: stop when the board (l + k·dL, v + 2k·dT) does not exist (also sealed), the square is off
  the board, or the square is occupied (an enemy is a capture, then stop). Squares are read on the boards passed, as
  they were then (history), so a piece's own past self blocks it.

### 3.3 Pawn and brawn (White; Black negates dy and dL)

| Move | Vectors | Condition |
|---|---|---|
| step | (0,+1,0,0), (0,0,0,−1) | target empty |
| double step (unmoved `p0`/`w0`, from any rank) | (0,+2,0,0) over (0,+1,0,0); (0,0,0,−2) over (0,0,0,−1) | both squares empty; the middle board exists |
| capture | (±1,+1,0,0), (0,0,+1,−1), (0,0,−1,−1) | target holds an enemy |
| brawn only, capture | (±1,0,0,−1), (0,+1,0,−1), (0,+1,−1,0) | target holds an enemy |
| en passant (kind `ep`) | (±1,+1,0,0) onto `x.ep[row]` | the enemy pawn or brawn beside it made a physical double step on this board with the move that produced it |

- Promotion: any pawn or brawn move whose target rank is the last rank (White rank N, Black rank 1) makes a queen
  (key suffix `=Q`). Pawn timeline moves and T–L captures keep the rank; the brawn's (0,+1,0,−1) and (0,+1,−1,0) can
  promote on another board (P 9.4: S1 and S2 do so).
- A physical double step sets `x.ep[row]` to the skipped cell; any other advance of that row clears it.

### 3.4 Castling (kind `castle`, physical only)

The royal king `k0` and an own `r0` on the same rank of the live board: the king's two squares towards the rook are
on the board and empty, and every square from there up to the rook is empty (the rook is the first piece met). The
king moves two squares towards the rook, the rook to the square the king crossed; both become `k` / `r`. No attack
test. The common king never castles. Key: the king's move, e.g. `(0T5)e1-g1` (unique: a king never moves two files
otherwise). Q2 makes it certain-only; Q3 (`unifyWorlds`, 5.11) removes a rook's right as soon as it is not `r0` on
the same square in every possibility.

### 3.5 Moved flags are types

`k0`, `r0`, `p0`, `w0` become `k`, `r`, `p`, `w` when the piece moves in any way (also by travelling, and as a split
or merge part: a split rook is `r` in both parts). Copies keep their type, so a copied past board keeps its castling
and double-step rights (P 2.5, R 3.6).

### 3.6 Piece types for `defineVariant`

| Type | Name | royal | solid | splittable | value (cp) | glyph | `resetsQuiet` |
|---|---|---|---|---|---|---|---|
| `k0`, `k` | King | yes | yes | no | 0 | sprite `k` | no |
| `y` | Royal queen | yes | yes | no | 0 | text `Y`, circle | no |
| `c` | Common king | no | yes | no | 350 | text `C`, circle | **false** (Q8) |
| `q` | Queen | | | yes | 1400 | sprite `q` | |
| `s` | Princess | | | yes | 800 | text `S`, circle | |
| `r0`, `r` | Rook | | | yes | 350 | sprite `r` | |
| `b` | Bishop | | | yes | 500 | sprite `b` | |
| `n` | Knight | | | yes | 450 | sprite `n` | |
| `u` | Unicorn | | | yes | 550 | text `U`, circle | |
| `d` | Dragon | | | yes | 350 | text `D`, circle | |
| `p0`, `p` | Pawn | | yes | no | 100 | sprite `p` | yes (default) |
| `w0`, `w` | Brawn | | yes | no | 140 | text `W`, circle | yes (default) |

All with `moves: []` (the variant's `generate` replaces the descriptor generator). Values follow P 8.6 (5D
estimates: rooks weaker and knights and bishops stronger than in 2D).

---

## 4. Capture the king instead of check

### 4.1 Why the spirit of 5D survives

In the official game a player may not submit a turn after which the opponent could capture one of their royal pieces
with one move from one of the opponent's playable boards ("check"), and a player in check with no legal turn is
checkmated. Capture-the-king keeps every decision that matters:

1. **Same threats.** The set of enemy moves that would capture a royal piece after you submit is identical: the
   generator is the official one (checked against 5d-chess-js in 19,135 positions, section 9), including
   trans-temporal checks on history boards and checks from inactive or future timelines.
2. **Same outcome under correct play.** A position where every legal 5D turn leaves a royal piece capturable is
   checkmate in 5D; here every turn you can play loses the king next turn. A player who has a safe turn has it in both
   rules. Only illegal-in-5D turns become legal here, and they lose at once, so a rational player never plays them
   unless every alternative also loses.
3. **Same escapes.** The 5D escapes from check (move the king, block, capture the checker, or **travel back** to
   rewind the present so that the threatened boards become optional, the "softmate" escape) work identically,
   because threats only come from boards where it is the opponent's move (E5 fool's mate, test 7).
4. **Same stalemate.** "A board you must play but cannot" ends the game at once as in 5D (5.13): a draw, or a loss
   when a royal piece would certainly be captured (the 5D checkmate). The one outcome that differs: a player who is
   not in check but whose every complete turn would expose a royal piece has no legal action in 5D (a stalemate,
   drawn); here that player must play on and loses the royal piece. Quantum Chess has no stalemate by check either
   (docs/rules.md 5 and 6), so the multiverse keeps the shared rule; such positions are rare in 5D because a branch
   into the past usually offers a way out.
5. **What changes, and why it must.** (a) 5D's prohibition is exponential to check (40^n turns for n timelines, E 5.2)
   and the official client reportedly misjudges some mates; in up to 64 possibilities it is impossible in a browser.
   (b) With ghosts, "in check" is a probability; "you may not submit at 30 % danger" has no sensible meaning, while
   "a 30 % shot at your king" is exactly Quantum Chess. (c) Quantum Chess already has no check (docs/rules.md 5), so
   the multiverse keeps the shared rule. The Quantum Chess "king cannot escape" shortcut would need the same
   exponential search, so the multiverse does not have it; the stuck test (5.13) is its exact 5D counterpart.

### 4.2 How the check, softmate and checkmate intuition is shown

- **Danger = 5D check.** `royalDanger(V, state, me)` during my turn is the chance (over the possibilities) that the
  opponent could capture one of my royal pieces **if I passed my remaining must-move boards** (the official "in
  check" test, pass on present boards: R 7.1 and E 5.1). The existing danger line reads "Your king is in danger:
  N %"; at 100 % it is check.
- **Where**: every royal square of the side to move that is capturable in some possibility gets the cell shade
  `danger` (red tint; the CSS class exists), on live and on history boards (a king in the past is marked on its past
  board). A thin line joins the attacker's board to the king's board (7.3).
- **Submit label**: "Submit turn (a king can be taken: 50 %)" when submitting now would leave a royal piece
  capturable from the boards already handed over (then the danger is real, not phantom).
- **Softmate**: when the danger is 100 % and every move that lowers it is a time-travel move, the status line says
  "Only time travel escapes (softmate)". Computed on demand (7.8, U-step): `royalDanger` after each candidate move of
  the must-move boards (≈ 0.2 ms per move per possibility).
- **Checkmate / stalemate** end the game with the reason texts `checkmate`: "no way to finish the turn while a king
  would certainly be captured (checkmate)" and `stalemate`: "no way to finish the turn (stalemate)".
- The generic safety net (docs/rules.md 5) asks for confirmation when a move raises the danger.

---

## 5. Engine mapping

### 5.1 Declaration

```js
const spec = {
	id: 'multiverse', category: 'dimensions',
	sides: [
		{ id: 'w', name: () => t('quantumchess', 'White'), color: 'white', rotate: 0 },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black', rotate: 0 },   // time must not be reversed
	],
	topology,              // 5.2 (live squares only)
	types,                 // 3.6
	options, setup, rules, // 2.1, 2.2, 1.10
	generate, apply,       // 5.8, 5.9
	applyMiss,             // 5.10 (Q1)
	unifyWorlds,           // 5.11 (Q3)
	budgetExtra,           // 5.12 (X2)
	solidExtra, nextSide, actions, worldResult, stateResult, noMoves, reasonText,   // 5.13
	sideInfo, recordInfo, infoText,  // 5.13 (U6, Q9, U9)
	evaluate, aiView,      // 5.14
	layoutOf,              // 7
	maxPly: 1200, quietPlies: 300,
}
export default defineVariant(spec)
```

Not used: `extraMoves`, `filterMoves`, `afterMove`, `onCapture`, `measured`, `candidateMoves`, `isOut`, `drops`.

### 5.2 Static topology: live squares and names

- **13 label blocks** of 64 cells (8 × 8 grid; smaller boards use its lower-left N × N part): block order
  `0, +0, −0, +1, −1, +2, −2, +3, −3, +4, −4, +5, −5`. `LIVE = 832`.
- **Live square** of row l, cell (x, y): `block(label(l)) · 64 + y · 8 + x`. Every row has exactly one live board, so
  this is unambiguous and the same in every game with that label.
- `makeTopology({ coords: [block, x, y], name, cell })`, **names** `(0)e2`, `(+1)c3`, `(−1)c3`, `(+0)b1`, `(−0)b3`
  (no `-`, `|`, `?`, `@`, `=` or space). They appear in split, merge and measure codes and outcomes (`On (+1)c3`).
- The static `cell` layout is a plain grid; it is never shown (`layoutOf` always exists).
- Capacity: single start l ∈ [−4, 4], even start [−5, 4], three starts [−5, 5] with M ≤ 4: all labels exist.

### 5.3 History squares and markers (X1)

- **History square** of the board (slot, v), cell (x, y): `LIVE + (slot · HB + v mod HB) · N² + y · N + x`, where
  slot is the row's creation index. A ring per row: the HB boards `en − HB … en − 1` occupy distinct `v mod HB`, so a
  board keeps its squares for its whole life in the window (last-move marks stay valid).
- History squares are part of the **world's `board` array** (not of `V.topology`; `layoutOf` names them). The board
  length is `LIVE + rows · HB · N²` and grows by `HB · N²` when a row is created (identical in every world).
- A history cell holds −1 or a **marker id** `side · 16 + typeIndex` (ids 0 … 31, order
  `k0 k c y q s r0 r b n u d p0 p w0 w`), whose `sq` is −1 (OFF), `ty` and `sd` its type and side. So the core's
  `squareView` / `boardView` draw the past with its chances, `isMeasured` sees occupied past targets (land = roll),
  `solidKey` sees past kings and pawns, and `worldKey` distinguishes different pasts, with no hook.
- **X1** (the contract): "an id with `sq = OFF` may stand on board squares as a marker". The only generic code that
  forbids it is the fuzz invariant `b.sq[board[s]] === s`; it becomes
  `if (id >= 0 && b.sq[id] >= 0) expect(b.sq[id]).toBe(sq)` (one line in `tests/js/variants/fuzz.spec.js`). Checked
  against `quantum.js`, `ai.js` and `useVariantGame.js`: markers are never moved, never measured
  (`legalMoves` skips `sq < 0`), never counted as material (`worldValue` skips `sq < 0`), never split or merged
  (`ownPieceAt` finds them but they have no generated moves). Why not the alternatives: history as strings in `x`
  needs the deferred `views` UI extension (CORE-CHANGES item 49) plus a `measured(sample, state)` argument; history
  with one id per square is about 4 times larger (13 JSON characters per history cell instead of 3).

### 5.4 Piece ids

- Ids 0 … 31: markers (5.3).
- **Live pieces**: when row slot k is created (the starting rows at setup), the piece on cell c gets id
  `32 + k · N² + c`. A piece keeps its id when it moves, travels, promotes or splits; a captured piece gets `sq = −1`.
  Ids are never reused (a row is created once).
- A branch gives the copied pieces the new row's block ids; the travelling piece keeps its own id. A ghost copied
  from a past board therefore becomes **twins**, one id per possible square, each present exactly in the
  possibilities where the original stood there (linked; 6.4).
- `sq`, `ty`, `sd` grow by N² per created row (unused ids: `sq −1`, `ty ''`, `sd 0`).

### 5.5 The world

```js
{
	sq, ty, sd,               // ids 0-31 markers, then N² per row slot
	board,                    // LIVE live squares, then HB · N² history squares per row slot
	x: {
		g: [8, 8, 3, 0],      // N, HB, M (new timelines per player), start mode (0 single, 1 even, 2 three rows)
		s: 0,                 // side to move (drives nextSide)
		r: [[0, 2, 9, null, null], [1, 5, 8, 0, 4]],   // per slot: [l, st, en, parentL, parentV]
		ep: [-1, 20],         // per slot: en passant cell (y · N + x) on its live board, or -1
		k: -1,                // side that captured a royal piece in this world, or -1
	},
}
```

The created counts, the present and activity are derived (5.6). No history strings, no cached hashes: `x` is about
100 bytes.

### 5.6 Skeleton helpers (pure, cached per `x` object)

`info(x) → { N, HB, M, mode, byL: Map(l → slot), c: [cW, cB], active(l), present, lmin, lmax }`, `exists(slot, v)`,
`mandatory(x)`, `playable(x, side)`, `canSubmit(x)`, `cellAt(w, slot, v, x, y)` (−1 or `side · 16 + typeIndex` from
the live id or the marker), exactly as in 2.4 – 2.6.

### 5.7 Move keys (world-independent; they are the codes of the move list)

```
board := "(" label "T" T ")"                label from 2.4 (U+2212 minus), T = v >> 1
cell  := file rank                           a–h, 1–8
key   := board cell "-" cell ["=Q"]          physical (also double step, en passant, castling = the king's move)
       | board cell ">" board cell ["=Q"]    hop
       | board cell ">>" board cell ["=Q"]   branch
       | "↵"                                  Submit
```

Examples: `(0T1)g1-f3`, `(0T2)f3>>(0T1)f5`, `(−0T1)b1>(+0T1)b3`, `(0T6)b7-b8=Q`, `(0T5)e1-g1` (castling), `↵`. The
target board's colour is the mover's, so it is not written. Keys contain no `|` and never start with `?`; ASCII `-`
appears only as the physical separator. Split, merge and measure codes come from the core with the static names:
`(0)g1-(0)f3|(0)h3`, `(0)f3|(0)h3-(0)g1`, `?(+1)f5`.

### 5.8 `generate(w, side)`

**The mover (`side === x.s`)**, for each row with `en & 1 = side` (must-move rows first, then optional rows), each
own live piece, each vector (3.2, 3.3), k = 1, 2, …:

1. Target board (l + k·dL, en + 2k·dT), cell (x + k·dx, y + k·dy); stop if the board does not exist or the cell is off
   the board. Read the cell with `cellAt`.
2. Classify (2.8); drop a branch without permission (2.9).
3. Push:

```js
{ key, from: liveSq(l, x, y),
  to: travel === 'branch' ? histSq(slot2, v2, x2, y2) : liveSq(l2, x2, y2),   // the square the UI shows
  id: travel === 'physical' ? X : -1,       // travel moves are never split or merge moves (F10)
  capture: the occupant's id (live id, or the marker on a past square) or -1; en passant: the victim,
  promo: 'q' | null, drop: null,
  kind: 'normal' | 'double' | 'ep' | 'castle' | 'hop' | 'branch',
  extra: { travel, slot, v, s2, v2, x0, y0, x2, y2, royal, mover: X, rook?, rookTo?, victim?, skip? } }
```

`extra.slot`, `s2`, `v2`, `x2`, `y2`, `travel` and `royal` depend only on the key and the skeleton (royal pieces are
solid), so `applyMiss` may use them from the union's sample. If the present has passed, push
`{ key: '↵', from: -1, to: -1, id: -1, capture: -1, promo: null, drop: null, kind: 'submit', extra: {} }` last.

**The other side (`side !== x.s`)**: the danger list for `royalDanger`. Pass the mover's must-move boards (their row
ends +1, same pieces), then scan the other side's playable rows for the first capture of a royal piece of the mover
(live or past). Return one pseudo-move `{ key: '†', to, capture: the royal's id or marker, kind: 'danger' }`, else
`[]`. `royalDanger` sums weights per key, so it reports the chance that **some** royal capture exists (the union of
all ghost attackers; test 25). `table()` never asks for this side, so `†` is never legal; `apply` returns the world
unchanged for kind `danger` (Q7's second rule never needs it, because the first rule already counts the capture).

### 5.9 `apply(w, m)`

`next` = a copy (arrays sliced, `x` copied field by field). `advance(slot)` = write the row's live board into its
history ring at `en mod HB` (markers), `en += 1`, `ep[slot] = −1`; live pieces keep their squares. By kind:

- **physical**: advance(u); remove the victim (`ep`: `extra.victim`); a royal victim sets `x.k = mover`; place X on
  `to`; type → moved type or `q`; castling places the rook; a double step sets `ep[u]`.
- **hop**: advance(u); advance(u2); remove X from u; capture on the target (royal → `x.k`); place X.
- **branch**: read the target board's codes **before** advancing (u2 may be u, and v2 may be the ring slot about to be
  overwritten); advance(u); remove X. If `extra.royal`: `x.k = mover` (no row). Otherwise create the row: slot n,
  `l = lmax + 1` (White) or `lmin − 1` (Black), `r.push([l, v2 + 1, v2 + 1, l(u2), v2])`, extend `board` by
  HB · N² and the id arrays by N², copy every piece of the target board except the target cell to its block id, place
  X on the target cell (a piece of the copy there is captured by not being created).
- **submit**: `x.s = 1 − x.s`.
- Afterwards (not for submit): if `playable(x.s)` is empty, `x.s = 1 − x.s` (the automatic end).

Cost: 3–11 µs per move on 8 × 8 **[measured]**.

### 5.10 `applyMiss(b, action, side, { hit })` (Q1)

| Action | `hit` | Effect on the idle world |
|---|---|---|
| move, physical | any | advance(u) (the board passes, the piece stays) |
| move, hop | true | advance(u), advance(u2) |
| move, branch (not royal) | true | read the target, advance(u), open the row as an **untouched copy** (all copied pieces get block ids; nobody arrives); the created count rises |
| move, hop or branch | false (a rolled Missed) | advance(u) only |
| move, royal branch | any | advance(u) only (no row in any outcome) |
| split, merge | true (split), any (merge) | advance(row of `from[0]`) |
| measure | false | advance(the row of `from[0]` if its latest board is the mover's, else `mandatory[0]`, else `playable[0]`) |

Then the automatic end. The result depends only on the action and the skeleton, so all idle worlds of an outcome
build the same boards as its moving worlds: `solidExtra` never differs inside an outcome, and the solid roll never
fires on structure. **Why `hit` matters**: with `hit = true` (pass = link, or a split with a blocked half) the idle
worlds must match the moving worlds of the same outcome; with `hit = false` the Missed outcome is its own reality and
only spends the source board (F8). Alternative for the lead, one line: ignore `hit` ("a rolled Missed still opens
its timeline"); nothing else changes.

### 5.11 `unifyWorlds(bs, mover)` (Q3)

A rook id that is `r0` in some world and not `r0` on the same square in all worlds becomes `r` in every world (a
partial slide or a split costs the right for good, docs/rules.md 5; test 28). Kings, pawns and brawns are solid, so
their flags never differ. Returns the input array when nothing changes.

### 5.12 `budgetExtra(b, side)` (X2)

The side's markers on history squares (their squares and types), as a short hash string (two 32-bit hashes),
cached per world object. **Requested core change**: in the budget arrangement of a side, append
`'|' + V.budgetExtra(b, side)` when the hook exists (the place is Q6's `budgetInfo` and the mover's comparisons in
`moveBranches`, `mergeBranches`, `splitBranches`; `budget(state, side)` without V keeps today's meaning).

Why it is needed: after a merge, possibilities can differ **only in the past** (the ghost's old squares on history
boards). Without X2 they cost no budget, so a player could merge and split repeatedly and fill the 64 possibilities
with history-only differences; the **opponent's** splits would then be refused by the world bound, which breaks
"your opponent can never use up your budget". With X2, only your own moves raise your budget (the ownership lemma of
M 4 D8), and the bound 8 × 8 = 64 holds. Fallback without a core change: one "ledger" id per side with `sq = −3` and
`ty = 'h' + hash`; the core's projection counts it (it skips only OFF), and every other core loop skips `sq < 0`.

### 5.13 The other hooks

```js
solidExtra: (w) => w.x.s + '|' + w.x.r.map((r) => r.join('.')).join(';'),   // side to move + every row
nextSide: (w) => w.x.s,
actions: (state) => [{ code: '↵', label: submitLabel(state) }],
worldResult: (w) => (w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null),
stateResult: (state) => (stuck(state) ? endResult(state) : null),
noMoves: (state) => endResult(state),
endResult = (state) => royalDanger(V, state, state.turn) >= 1
	? { winner: 1 - state.turn, reason: 'checkmate' } : { winner: null, reason: 'stalemate' },
reasonText: (r) => ({ checkmate: t(…), stalemate: t(…) })[r] ?? null,
```

- `solidExtra` is the whole skeleton (Q4 then uses it as the short roll note).
- `submitLabel(state)`: legal → "Submit turn", with " (a king can be taken: N %)" when the real danger after
  submitting is above 0; otherwise `n('quantumchess', 'Submit turn ({count} board still to move)', 'Submit turn
  ({count} boards still to move)', count)`. The view disables the button when `isLegal` is false.
- **`stuck(state)`** (the official "no legal action", exact for the structure): false if the present has passed, or
  the mover has a superposed own piece (a measurement can clear a board), or some branch key would move the present
  to the opponent's colour (a rewind, including a reactivation); otherwise let Z be the must-move boards with no key
  departing from them: stuck iff Z cannot be matched to **distinct** playable source boards that have a hop key onto
  them (bipartite matching over ≤ 9 boards). Keys are the union over the possibilities. It runs in `stateAfter` also
  in light mode, so the computer sees a stranding move as a draw or a loss. Measured cost: one generation of the
  mover per world, shared with the next `legalMoves` through the generation cache.
- **`sideInfo(state, side)`** (U6): "Timelines 1/3" (+ "next one active" when `c[side] ≤ c[other]`), and for the side
  to move "To move: (0T5), (+1T5)".
- **`recordInfo(prev, code, branch, next)`** (Q9, optional) → `{ opened: '+1', present: 'T3' }` when a row was opened
  or the present moved back; **`infoText(record)`** (U9) → "opens timeline +1 · the present moves back to T3".
- **`noteText(note)`** (U7): `solid:` notes should never occur; if one does, "The multiverse had to agree".
- Options `describe` (U11): "8 × 8, one timeline, standard pieces".

### 5.14 The computer

- **Multi-move turns**: U3's default (`replySide` = `s.turn`; when it is still me, my best continuation) is used
  unchanged. A turn costs one `chooseMove` per board; normal level 0.01–1.8 s per ply, median 0.9 s on Standard
  **[measured]**.
- **`aiView(state, side)`**: shallow world copies whose `x.ai = { t: [set0, set1] }`, `t[s]` = every square (live or
  history) that holds a piece of the other side in some possibility. In AI mode the mover's `generate` keeps:
  1. every move whose target square is in `t[mover]` (a capture in some possibility, also of a king in the past);
  2. physical moves from **must-move** boards;
  3. every travel move of a royal piece (escapes through time);
  4. hops onto a must-move board (they clear two boards);
  5. branches from must-move boards at most one turn back (they rewind the present);
  6. Submit. Splits come from `ai.js` (U4).
  The filter reads only the key, the skeleton, solid pieces and the shared target set, so a key is kept in every
  world or none and the outcome weights stay exact. `chooseMove` re-checks candidates on the real state.
- **`evaluate(w, side)`** (added to the core's material of live pieces; markers are not material): **+200 contempt**
  (a game that goes on beats a stalemate unless the position is bad: without it the computer, at equal material,
  took stalemates in Marauders by stranding its own boards); −3000 if the enemy can capture a royal piece of `side`
  on its next move in this world (−1200 if `side` is still to move and the threat is only the phantom one); +400 /
  +150 for the reverse; +120 × clamp(c[enemy] − c[side], −2, 2) (timeline advantage, R 5.1). Stuck turns come from
  `stateResult` (a draw is 0, a checkmate −WIN).

### 5.15 Core items relied upon, and the two requests

| Item | Where | What this design needs from it |
|---|---|---|
| Q1 `applyMiss(b, action, side, { hit })` | CORE-CHANGES 2.1 | idle worlds of moves, splits, merges, measures; `hit` (5.10) |
| Q2 certain moves | 2.1 | kinds `castle` and `ep` certain-only |
| Q3 `unifyWorlds` | 2.1 | castling rights (5.11) |
| Q4 short notes | 2.1 | `solid:` + `solidExtra` |
| Q7 `royalDanger` | 2.1 | the first rule counts `†` (5.8); `apply` ignores kind `danger` |
| Q8 `resetsQuiet` | 2.1 | `c: false` |
| Q9 record `from` / `to`, `recordInfo` | 2.1 | last-move marks, travel arrows |
| Q11 `squareView` guard | 2.1 | display squares of sealed boards |
| U1, U2 (`focus.key`), U3, U6, U7, U9, U11 | 2.3 | marks, focus, AI turns, player row, notes, move list, options |
| `stateResult` | existing | the stuck test, also in light mode |
| **X1** marker ids | new, test only | one line in `fuzz.spec.js`, a sentence in IMPLEMENTING.md |
| **X2** `budgetExtra(b, side)` | new, Q6 area | one term in the arrangement key; fallback: ledger ids (5.12) |

The playable design's assumption "a missed world is kept unchanged" is not needed.

### 5.16 Performance **[measured]**

Node 22 on this machine (`bench.mjs`, 8 × 8 Standard, reach 4, cap 3; states from random quantum games). Phones are
1.5–3 times slower (E 0).

| Timelines | Worlds | Legal keys | `generate` per world | threats per world | `apply` | `worldKey` | one move (`branches` + `stateAfter`) | `royalDanger` | `layoutOf` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 20 | 26 µs | 56 µs | 5 µs | 19 µs | 0.05 ms | 0.2 ms | 0.2 ms |
| 4 | 1 | 202 | 147 µs | 43 µs | 11 µs | 30 µs | 0.11 ms | 0.1 ms | 0.1 ms |
| 7 | 1 | 150 | 93 µs | 40 µs | 6 µs | 68 µs | 0.20 ms | 0.1 ms | 0.5 ms |
| 7 | 8 | 146 | 148 µs | 64 µs | 8 µs | 75 µs | 1.9 ms | 0.7 ms | 0.8 ms |
| 7 | 64 | 115 | 48 µs | 57 µs | 3 µs | 85 µs | 16.6 ms | 4.2 ms | 0.9 ms |

- A UI ply at 64 worlds and 7 timelines (`applyMove` + `legalMoves` 1.3 ms + `royalDanger` + `layoutOf`): about
  25 ms in Node, under 100 ms on a phone. 5 × 5 is 2–3 times cheaper.
- The computer, one ply: easy 9–621 ms, normal 11–1,810 ms, hard 52–4,320 ms (the levels' time limits of 0.4, 1.5 and
  4 s bound it; the tail is the last candidate). A turn of k boards takes k plies.
- Fuzz: 150 random quantum plies with up to 64 worlds take 1–2 s per game on 8 × 8.

### 5.17 State size **[measured]**

One world measured; the 8- and 64-world columns are measured where a fuzz state of that size existed (144 KB,
1.1 MB, 75 KB), else 8 or 64 times the world.

| Board | Timelines | One world (JSON) | 8 worlds | 64 worlds |
|---|---|---|---|---|
| 8 × 8, reach 4 | 1 | 4.9 KB | 39 KB | 0.3 MB |
| 8 × 8, reach 4 | 4 | 11 KB | 90 KB | 0.7 MB |
| 8 × 8, reach 4 | 7 | 17.3 KB | 144 KB | 1.1 MB |
| 8 × 8 even start, reach 4 | 8 | 19.6 KB | 157 KB | 1.25 MB |
| 5 × 5, reach 4 | 7 | 8.7 KB | 75 KB | 0.55 MB |

A saved game is the start state plus the current state plus one history record per ply (~150 bytes): a typical game
(≤ 8 worlds, ≤ 5 timelines, 400 plies) is 100–200 KB; the worst case (64 worlds, 7 timelines) about 1.2 MB. The
reach option is the lever: reach 2 halves the history part, reach 6 adds half.

---

## 6. Quantum rules (engine view)

### 6.1 Split, merge, measure

- **Split**: a splittable piece on a live board of the mover (must-move or optional), to two squares of the **same
  board** that are empty in every world and reachable by a quiet physical move (core `splitTargets`; travel moves
  carry `id: −1`). Never rolled. Worlds without the piece on `f`, and a half whose path is blocked, are idle with
  `hit = true`: that board passes there too (5.10). So there is no structural roll after a split (the playable
  design's cases E1–E3 disappear).
- **Merge**: two parts of one piece on one live board to a square of that board. Idle worlds pass the board.
- **Measure**: any own superposed piece (a live ghost part, a twin, or a part in another timeline). The outcome
  keeps the matching worlds; every world passes one board of the mover (F9, 5.10).

### 6.2 Moves of ghost parts: pass = link and land = roll everywhere

- A move is **rolled** (core `isMeasured`) when the mover is solid, or when the target square (live or past) may hold
  another piece in some world. The past is in `board`, so no hook is needed.
- Otherwise a ghost part's move is **not rolled**: worlds where the piece is absent, or its path through the past or
  across timelines is blocked, are idle with `hit = true`. Example (test 18): a knight 50 % f3 / 50 % h3 plays
  `(0T2)f3>>(0T1)f5`: one outcome, not rolled; timeline +1 opens in both possibilities; the knight is 50 % on
  (0)h3 and 50 % on (+1)f5.
- The budget fallback (a quantum move that would exceed 8) rolls as usual; its Missed outcome is `hit = false`.

### 6.3 Rolls across timelines

A world is a whole multiverse, so a roll anywhere settles every ghost, twin and past square that depends on it, on
every timeline at once. Capturing a ghost's copy in the past (test 21) removes only the copy on the new timeline;
the original on L0 is then certain.

### 6.4 Twins

A branch copies the past board of its own world. A ghost's possible squares become separate ids (5.4), each present
exactly where the original stood there: 50 % twins on (−1)f3 and (−1)h3 in test 20. They are linked to the original
and to each other; measuring one decides all. Twins cannot merge with each other (different ids): a merge needs one
piece. Twins never raise the budget (they are a function of the history, which X2 already counts).

### 6.5 The budget and the world bound

- A side's arrangement = its live pieces (core) + its markers in the history window (X2). Only a side's own splits,
  and its pass = link moves, raise it; rolls and captures only remove worlds; the opponent's moves copy or freeze the
  side's pieces as functions of what exists. So each side stays ≤ 8 and worlds ≤ 64.
- After a merge the worlds still differ in the past: the budget stays up until those boards are sealed (test 23:
  2 worlds for 8 more moves, then 1).

### 6.6 What stays classical, and why

| Classical | Why |
|---|---|
| the skeleton: rows, starts, ends, parents, created counts, side to move (`solidExtra`) | one picture, one present, one Submit; which boards must move has one answer |
| kings, royal queens, common kings, pawns, brawns | the shared rule (royal pieces must be certain for capture-the-king; pawns probe); the danger display relies on certain kings |
| unmoved flags (types `k0`, `r0`, `p0`, `w0`) | solid pieces and `unifyWorlds` |
| castling and en passant | certain-only (Q2) |
| Submit, the automatic end, the stuck test | functions of the skeleton and the union of keys |

---

## 7. UI

### 7.1 `layoutOf(state)` geometry (one square = 1 unit)

- N = board size. Left margin **2.6** (row labels), top margin **1.8** (header and "Now"), column gap **1.2**, row
  gap **1.5** (board labels). Column pitch N + 1.2, row pitch N + 1.5.
- **Rows**: the existing timelines ordered by l ascending (Black's new timelines on top, White's below: White's
  forward on the board and across timelines both point up). With the `flip` option the order is reversed and every
  board is turned half round (rank 1 at the top, file a on the right); time still runs left to right. `sides[1].rotate = 0`.
- **Columns**: the sorted set of v of all boards in the window of any row. Where two neighbouring columns differ by
  more than 1, a gap column of width 1.4 labelled "⋯".
- `width` = content width; `height` = max(content height, 0.6 × width) with the content centred vertically, so a
  zoomed window on a phone in portrait still shows whole boards. `zoomable: true`.
- `size` = the board length of the worlds (`LIVE + rows · HB · N²`).

### 7.2 Cells, boards, areas, lines, labels

- **Cells**: every square of every existing board in the window: live squares (5.2) and history squares (5.3), at
  `(x0 + x, y0 + N − 1 − y)`. Shades: live `dark` (a1 dark) / `light`; history `mid` / `light` (the past looks
  washed out). Pieces and ghost percentages come from `boardView`, markers included.
- **Boards** (frames with labels): live `(+1T5) ○` / `●`; history `T5 ○` / `●`.
- **Areas** (under everything): the **present band** (shade `frame`, the present column ± 0.45, all rows) with the
  label "Now"; a **gold halo** (`wood`, 0.35 around, 0.75 above for the label) on each must-move board of the side to
  move; a **blue halo** (`river`) on each optional board.
- **Lines** (drawn under the cells, so they run between board edges): **branch connectors** from the right edge of
  the parent board (or the left margin of the parent row when the parent is sealed) to the left edge of the row's
  first shown board, as an elbow (three segments) with a two-stroke head; **travel arrows** for the hops and branches
  of the last turn of each side (from `state.history`, skipping Missed records): source board → target board;
  **threat lines** for the royal captures of 4.2.
- **Labels**: row labels `L0`, `L+1`, `L−0` … with a second line "inactive" when inactive; "⋯" at the left of a row
  whose older boards are sealed and in gap columns; the header "New timelines: White 1/3 · Black 0/3".
- **Names** (accessibility and `data-square`): `t('Timeline {line}, T{turn}, {side} to move: {square}')` for every
  drawn square, e.g. "Timeline +1, T5, Black to move: c3".

### 7.3 The danger display

`layoutOf` computes the phantom threats of the side to move in each world (the same scan as 5.8, all captures) and
gives every threatened royal square the shade `danger` (the existing red cell class), plus one threat line per
(attacker board, royal board) pair. Together with the danger line and the Submit label this is 5D's check display.

### 7.4 Focus and zoom

- Target box: the must-move boards of the side to move; else its playable boards; else the present column.
- `zoom = clamp(min((W + 1.4) / fw, (H + 1.4) / fh), 1, 8)` with `fw = max(box width, 2.5 · (N + 1.2)) + 1`,
  `fh = max(box height, N) + 1.5`: about two and a half boards wide.
- `focus.key` (U2) = side to move + present + the rows of the must-move boards + the number of rows + `flip`. The view
  recentres when the next boards to play change (after a move on a must-move board, a new timeline, the other side's
  turn), not after a move on an optional board, and not when only the pieces change.

### 7.5 What the player sees and does

1. **Start of the turn**: the view centres on the gold boards; the Submit button reads "Submit turn (2 boards still
   to move)" and is disabled; the player row shows "To move: (0T5), (+1T5)" and "Timelines 1/3".
2. **Tap a piece** on a gold or blue board: dots and rings on every board it can reach: its own board, the latest
   boards of other timelines, and past boards (faded). A target on a past board opens a new timeline.
3. **Tap a target**: a certain move plays at once; an uncertain one opens the existing roll box ("50 % Missed · 50 %
   Captured") or shows "Quantum" for pass = link. The board advances, the halo moves on, a new row appears with a
   connector, the present band moves.
4. After the last must-move board the Submit button lights up (or the turn passes by itself when no board is left).
5. **Split / Merge / Measure** use the existing mode buttons. Split targets are on the piece's own board. Measuring
   uses up a board; the hint says which.
6. **Zoom** with + / −, "Whole board", pinch or Ctrl + wheel; pan by dragging.

### 7.6 Phone behaviour

- The focus shows two and a half boards; on 8 × 8 that is about 15 px per square on a 360 px screen, so the player
  zooms in once or twice (+ doubles as 1.5×); pieces stay tappable at 1.5–2× (≥ 23–30 px). The small setups (5 × 5,
  4 × 4) are playable at the default focus.
- The layout is at least 0.6 times as tall as it is wide, so the zoomed window in portrait shows whole boards.
- Every move is two taps; nothing needs hovering. The Submit button and the danger line are outside the SVG.

### 7.7 Texts

Option labels and descriptions (2.1), the eight rules (1.10), `submitLabel` (5.13), `sideInfo`, `infoText`,
`reasonText`, board and row labels, "Now", "inactive", the header and cell names: all through `t()` / `n()`.

### 7.8 Optional UI-step items (the multiverse workflow's UI step; each has a fallback)

| Item | What | Fallback |
|---|---|---|
| Line kinds | `lines[i].kind: 'branch' \| 'travel' \| 'threat'` → CSS colour and dash (threat red) | all lines brown |
| Board kinds | `boards[i].kind: 'white' \| 'black'` → light / dark frame | ○ / ● in the label |
| Focus fit | `focus.box` + the component keeps ≥ 28 px per square on touch screens | the zoom of 7.4 |
| "Now" button | re-applies `layout.focus` | "Whole board" and zoom in |
| Strand warning | `V.moveWarning(state, code) → string \| null` shown in the move preview: "After this move you cannot finish your turn: the game would end in a draw" (the stuck test on the resulting state) | none (the game ends as the rules say) |
| Softmate hint | 4.2 | none |

---

## 8. Test scenarios (exact results, all run on the prototype)

Notation: `S(id, M, reach)` = new game with that setup (defaults M 3, reach 4); custom positions are one-off setups
(one line of 5DFEN per starting timeline); `play` takes outcome 0 unless an index is given; ids are live ids
(`32 + slot · N² + cell`). Row tuples are `[l, st, en, pl, pv]`.

### Structure and classical rules

1. **Start.** `S(standard)`: exactly 20 keys, `(0T1)b1-c3 (0T1)b1-a3 (0T1)g1-h3 (0T1)g1-f3 (0T1)a2-a3 (0T1)a2-a4 …
   (0T1)h2-h4` (the 20 chess moves prefixed `(0T1)`); `↵` not legal; `mandatory` = [slot 0].
2. **Automatic end and en passant square.** `(0T1)e2-e4`: certain; turn 1; rows `[[0,2,3,null,null]]`; `x.ep` = [20]
   (e3); the history board (0T1 ○) holds on a1…h1 the markers 6, 9, 8, 4, 0, 8, 9, 6 (`r0 n b q k0 b n r0`).
3. **E1, rewinding the present.** `(0T1)g1-f3`, `(0T1)g8-f6`: White has 26 keys, of which exactly 4 travel:
   `(0T2)b1>>(0T1)b3`, `(0T2)f3>>(0T1)h3`, `(0T2)f3>>(0T1)d3`, `(0T2)f3>>(0T1)f5`. After `(0T2)f3>>(0T1)f5`: rows
   `[[0,2,5,null,null],[1,3,3,0,2]]`; present 3; turn Black; `mandatory` = [+1]; `↵` illegal; (+1)f5 = knight id 38
   (the traveller), (+1)g1 = knight id 102 (the copy), (0)f3 empty. Black has 47 keys (21 from +1, 26 from L0).
   After `(+1T1)e7-e6`: still Black, present 4, `↵` legal. After `↵`: White, `mandatory` = [+1].
4. **E2, an inactive branch does not rewind.** Continue `(+1T2)b1-c3`, `(0T2)e7-e6`, `(+1T2)d7-d6` (White,
   `mandatory` [L0, +1]), `(+1T3)g1>>(+1T2)g3`: new row `[2,5,5,1,4]`, inactive; present 6; `mandatory` [L0]; `↵`
   illegal. After `(0T3)b1-c3` the turn passes to Black by itself.
5. **E3, reactivation.** Continue `(+1T3)a7-a6` (`mandatory` [L0]), `(0T3)f6>>(0T2)h6`: new row `[−1,6,6,0,5]`;
   +2 becomes active; present 5; `mandatory` [+2]; `↵` illegal. After `(+2T2)a7-a6` the turn passes to White.
6. **E4, one hop clears two boards.** `S(twotimelines)`: 44 keys, among them the hops `(−0T1)b1>(+0T1)b3`,
   `(−0T1)g1>(+0T1)g3`, `(+0T1)b1>(−0T1)b3`, `(+0T1)g1>(−0T1)g3`. After `(−0T1)b1>(+0T1)b3`: rows
   `[[−1,2,3,…],[0,2,3,…]]`, Black to move.
7. **E5, fool's mate is a softmate.** `(0T1)f2-f3`, `(0T1)e7-e6`, `(0T2)g2-g4`, `(0T2)d8-h4`: `royalDanger(White)` = 1;
   24 keys; the king has exactly `(0T3)e1-f2` and `(0T3)e1>>(0T2)f2`. After the latter: rows
   `[[0,2,7,…],[1,5,5,0,4]]`; present 5; Black to move; `royalDanger(White)` = 0; (+1)e1 = the king's past copy
   (`k0`), (+1)f2 = the traveller (`k`).
8. **Rook Tactics I (a king captured in the past).** Custom `4k/5/5/5/K1R2`: `(0T1)a1-b2`, `(0T1)e5-e4`, `(0T2)c1-e1`,
   `(0T2)e4-d3`, `(0T3)e1-e5`: `royalDanger(Black)` = 1. After `(0T3)d3-c3`, White's rook has
   `(0T4)e5>>(0T3)e5`, `(0T4)e5>>(0T2)e5`, `(0T4)e5>>(0T1)e5`; the last one: `{ winner: 0, reason: 'king' }`, rows
   `[[0,2,9,…]]` (no row opens).
9. **Unicorns and dragons cannot move on their own board.** `S(justunicorns)` and `S(justdragons)`: exactly
   `(0T1)a1-a2`, `(0T1)a1-b2`. Just Unicorns after `(0T1)a1-a2`, `(0T1)e5-e4`: the unicorns have exactly
   `(0T2)b1>>(0T1)c2`, `(0T2)b1>>(0T1)a2`, `(0T2)d1>>(0T1)e2`, `(0T2)d1>>(0T1)c2`.
10. **Pawns across timelines.** Custom three-row start `(−1) 4k/5/5/5/K4 · (0) 4k/5/5/2P2/K4 · (+1) 4k/5/5/5/K4`:
    keys from (0)c2 are exactly `(0T1)c2-c3`, `(0T1)c2-c4`, `(0T1)c2>(−1T1)c2` (none towards +1). After the hop:
    rows −1 and 0 end 3, +1 ends 2, `mandatory` [+1], (−1)c2 = the pawn, type `p`.
11. **T–L capture.** Custom `(−1) 4k/5/5/2n2/K4 · (0) 4k/5/5/2P2/K4 · (+1) 4k/5/5/5/K4`, then `(−1T1)a1-a2`,
    `(+1T1)a1-a2`, `(0T1)a1-a2`, `(−1T1)c2-d4`, `(0T1)e5-d5`, `(+1T1)e5-d5`: the pawn has exactly `(0T2)c2-c3`,
    `(0T2)c2-c4`, `(0T2)c2>(−1T2)c2`, `(0T2)c2>>(−1T1)c2` (the last captures the knight in the past).
12. **Brawn captures.** Custom `(−1) 4k/5/2p2/1p1p1/K4 · (0) 4k/5/5/2W2/K4 · (+1) 4k/5/5/5/K4`: the brawn has exactly
    `(0T1)c2-c3`, `(0T1)c2-c4`, `(0T1)c2>(−1T1)c2`, `(0T1)c2>(−1T1)d2`, `(0T1)c2>(−1T1)b2`, `(0T1)c2>(−1T1)c3`.
13. **Castling and promotion.** Custom 8 × 8 `r3k2r/8/8/8/8/8/1P6/R3K2R`: the king has `(0T1)e1-f1 e1-d1 e1-e2 e1-f2
    e1-d2 e1-g1 e1-c1`; after `(0T1)e1-g1`: g1 = king (`k`), f1 = rook (`r`). Custom 5 × 5 `4k/1P3/5/5/K4`: the only
    key from b4 is `(0T1)b4-b5=Q`.
14. **The timeline cap.** `S(standard, M 1)`, `(0T1)g1-f3`, `(0T1)g8-f6`, `(0T2)f3>>(0T1)f5`, `(+1T1)e7-e6`, `↵`:
    White has created 1; White has no `>>` key and no hop key.
15. **The travel reach.** Custom `4k/5/5/5/K1R2`, `(0T1)c1-c2`, `(0T1)e5-e4`, `(0T2)c2-c3`, `(0T2)e4-e5`,
    `(0T3)c3-c4`, `(0T3)e5-e4`: with reach 2 the rook's time keys are `(0T4)c4>>(0T3)c4`, `(0T4)c4>>(0T2)c4`; with
    reach 4 also `(0T4)c4>>(0T1)c4`.
16. **Royal types.** `V.royalTypes` = {k0, k, y}; `V.solidTypes` = {k0, k, c, y, p0, p, w0, w}. In `S(reversed)`
    capturing the common king does not end the game; capturing the royal queen does.

### Quantum

17. **Split on one board.** `S(standard)`: `splitTargets((0)g1)` = (0)f3, (0)h3; `(0)g1-(0)f3|(0)h3`: not rolled,
    2 worlds, Black to move, rows `[[0,2,3,…]]` in both, White budget 2.
18. **A ghost travels (pass = link through time).** 17, `(0T1)a7-a6`, then `(0T2)f3>>(0T1)f5`: one outcome `move`,
    not rolled; 2 worlds; rows `[[0,2,5,…],[1,3,3,0,2]]` in both; knight 38 is 50 % (0)h3 / 50 % (+1)f5; White budget
    2; Black `mandatory` [+1].
19. **A rolled Missed uses up the board.** 17, `(0T1)e7-e5`, then `(0T2)f3-e5`: Missed 50 % / Captured 50 %, rolled.
    After Missed: 1 world, knight 100 % (0)h3, rows `[[0,2,5,…]]` (the board passed), Black to move.
20. **Twins.** 17, `(0T1)e7-e6`, `(0T2)a2-a3`, `(0T2)b8>>(0T1)b6`: new row `[−1,4,4,0,3]`; twins 117 on (−1)f3 and
    119 on (−1)h3, 50 % each; 2 worlds; White budget 2; measures offered `?(0)f3`, `?(−1)h3`, `?(−1)f3`.
    `?(−1)f3` outcome 0 (`gone`): 1 world; (−1)h3 = twin 119, (0)h3 = knight 38; row −1 ends 5 (the measurement used
    that board); White still to move.
21. **Land = roll in the past.** Custom `3qk/5/5/5/K1N2`: `(0)c1-(0)b3|(0)d3`, `(0T1)d5-d4`, `(0T2)a1-a2`; Black's
    `(0T2)d4>>(0T1)d3`: Moved 50 % / Captured 50 %, rolled; both open `[−1,4,4,0,3]`. Captured: (−1)d3 = the queen,
    the knight is 100 % (0)d3 (only its copy was taken). Moved: (−1)b3 = the knight's copy, (0)b3 = the knight.
22. **A ghost captures a king in the past.** Custom `4k/5/5/5/K1N2`: `(0)c1-(0)b3|(0)d3`, `(0T1)e5-d5`, `(0T2)a1-a2`,
    `(0T2)d5-e5`: `royalDanger(Black)` = 0.5; `(0T3)d3>>(0T2)d5`: Missed 50 % / Captured 50 %. Captured:
    `{ winner: 0, reason: 'king' }`, no new row. Missed: no new row, L0 ends 7, Black to move, knight 100 % b3.
23. **The past remembers.** 17, `(0T1)a7-a6`, `(0)f3|(0)h3-(0)g1`: 2 worlds, White budget 2 (with X2). After
    `(0T2)a6-a5`, `(0T3)a2-a3`, `(0T3)a5-a4`, `(0T4)b2-b3`, `(0T4)h7-h6`, `(0T5)c2-c3`, `(0T5)h6-h5`: still 2 / 2;
    after `(0T6)d2-d3` (L0 ends 13, the ghost boards are sealed): 1 world, budget 1.
24. **Measuring uses up a board.** 17, `(0T1)a7-a6`: the only measure is `?(0)f3`; outcome 0: 1 world, rows
    `[[0,2,5,…]]`, Black to move, `ply` 3.
25. **Danger is the union of ghost attackers.** Two worlds 50/50 with rows `[[0,2,3,…]]`, Black to move: A
    `4k/5/3N1/5/K4`, B `4k/5/2B2/5/K4`: `royalDanger(Black)` = 1 (each white key captures in one world only).
26. **Stuck ends the game.** `S(marauders)`: `mandatory` [−1, 0, +1]; 34 keys, 8 of them hops onto (−1).
    After `(0T1)a1-a2`: 25 keys, 5 hops onto (−1) left, no result. After `(+1T1)b2-b3`: result
    `{ winner: null, reason: 'stalemate' }` (nothing can reach (−1T1) any more).
27. **Castling is certain-only.** Custom 8 × 8 `4k3/8/8/8/8/4N3/8/4K2R`: `(0)e3-(0)f1|(0)g2`, `(0T1)e8-d8`:
    `(0T2)e1-g1` is not legal (`branches` null). With `(0)e3-(0)c2|(0)d5` instead: one outcome `move`, 100 %, not
    rolled.
28. **A partial slide costs the right.** Custom `4k3/8/6n1/8/8/8/P7/4K2R`: `(0T1)a2-a3`, `(0)g6-(0)e5|(0)h4`,
    `(0T2)h1-h8` (one outcome, not rolled; the rook is 50 % h1 / 50 % h8 and `r` in both worlds after `unifyWorlds`),
    `?(0)h4` outcome 0 (h4): the rook is 100 % on h1 with type `r`; White has no `e1-g1` key.

### Layout, invariants, performance

29. **Layout at the start.** `layoutOf(S(standard))`: 64 cells; one board labelled `(0T1) ○`; areas `frame`, `wood`;
    width 12.2, height 11.3; focus `{ x: 6.6, y: 5.8, zoom: 1 }`.
30. **Layout after 3 (after `↵`).** 6 boards (L0 T1 ○ … T2 ●, +1 T1 ● and T2 ○); labels `L0`, `L+1`, `Now` and the
    header; 10 line segments (the branch connector and the travel arrow, 5 each); focus zoom ≈ 1.72 on the +1 board.
31. **Invariants** (every state of every test and of the fuzz games): `solidExtra` equal in all worlds; `sq`/`board`
    consistent for live ids; marker ids only on history squares; array lengths equal in all worlds; weights sum to T;
    budgets ≤ 8 with X2; worlds ≤ 64; a finished game has no legal move.
32. **Performance.** Fuzz 60 plies × 2 seeds on Standard under 5 s; `generate` of the start under 0.1 ms; `layoutOf`
    for 7 timelines under 2 ms; one move at 64 worlds under 25 ms (Node).

---

## 9. Validation on the prototype

`handoff/prototypes/mv-faithful/` (not production code; paths absolute to this machine):

| Script | What it does |
|---|---|
| `patch-core.mjs` | writes `core/quantum.mjs` and `core/ai.mjs`: the committed core (155704f, read with `git show`) with Q1 (`hit`), Q2, Q3, Q11, U3 and X2 patched in |
| `mv.mjs` | the variant: encoding, generation, apply, `applyMiss`, `unifyWorlds`, `budgetExtra`, threats, stuck test, AI hooks |
| `layout.mjs` | `layoutOf` |
| `cross.mjs <variant> <seed> <games> <plies> <reach> <cap>` | random games against 5d-chess-js 1.2.1 (`handoff/tmp/mv-faithful/package`, from `npm pack 5d-chess-js@1.2.1`) |
| `fuzz.mjs`, `bench.mjs`, `selfplay.mjs` | random quantum games with invariants; measurements; the computer against itself |
| `scen.mjs`, `scen2.mjs`, `scen3.mjs`, `scen4.mjs` | the scenarios of section 8 |

**Rules fidelity [measured].** 19 setups (the 7 built into 5d-chess-js plus 12 loaded as 5DFEN), 60 random games
each, reach 30 and cap 5 so that nothing is cut: 1,140 games, 17,996 plies, 19,135 positions, 1,540,399 reference
moves. The prototype generates **exactly the same moves** in every position (5,678 travel moves were played),
except two deliberate kinds: castling while attacked (9 positions; Quantum Chess has no check) and en passant right
after a physical double step whose victim square was occupied one turn earlier (29 positions; 5d-chess-js infers en
passant from the board one turn back and misses these; this design follows chess). The present and "may submit"
agree everywhere. The official "in check" test (phantom threats) agrees in all positions (1,093 checks) except 8 in
Just Brawns where 5d-chess-js misses checks by **White** pawns and brawns (reproduced: a white pawn d4 beside a black
king e5 is not reported; a black pawn is).

**Cost of the limits [measured].** Standard and Two Timelines with reach 4 and cap 3, 60 games each: of 1,145,232
reference moves, 6,711 (0.59 %) are cut by the reach (a target older than 4 turns, or a ride through a sealed
board), and 32 % by the timeline cap; random play opens a timeline with about one move in ten, far more than
people do. 7 "check" differences, all kings older than the reach.

**Quantum invariants [measured].** 10,414 random quantum plies (splits, merges, measurements, travel) on 11 setups:
every invariant of section 8, test 31 holds; up to 64 worlds and 8 timelines; largest world 19.6 KB, largest state
1.1 MB.

**The computer [measured].** Self-play (`selfplay.mjs`), every ply legal, no failed search: Standard normal 80 plies
(27 turns, 23 travel moves, 7 timelines, median 0.9 s per ply), Two Timelines easy 80 plies (20 turns, 22 travel
moves, splits and measurements, 8 timelines), Small normal 51 plies to a king capture, Just Unicorns normal 10 plies
to a king capture, Timeline Marauders normal over six seeds: a king capture, a checkmate, two stalemates after turn 8
and two games still open after 40 plies.

---

## 10. Deviations from the official game, and the difference with the playable design

Deviations (for `docs/variants.md`):

1. Capture the king instead of check (section 4); stuck turns end the game at once with the official classification.
2. A travel reach (default 4 turns) and a cap on new timelines (default 3 per player); a king in the past can always
   be captured.
3. Moves are final inside a turn (every move settles its roll); the turn ends by itself when no board is left.
4. Castling without a check test; castling and en passant never roll; promotion to a queen only (official).
5. En passant also when the victim's square was occupied the turn before (chess rule; 5d-chess-js differs).
6. The quantum rules of 1.8.

Compared with `multiverse-design-playable.md`:

| | Playable | Faithful (this design) |
|---|---|---|
| Boards | 5 × 5 and 4 × 4 only | Standard 8 × 8 default + 19 official setups, all pieces |
| Timelines | 1–2 per player | 2–4 per player (default 3), even and three-row starts |
| Reach | 2 turns | 2 / 4 / 6 turns (default 4) |
| Pass = link | none (every uncertain move is rolled) | everywhere, through time (Q1 `hit`) |
| Missed | free, the board still waits | uses up the board (Quantum Chess) |
| Measure | free | uses up a board (no free collapse) |
| Stuck | only when no key at all | the official test (matching), at once, also for the AI |
| History | square ids (≈ 13 JSON chars per cell) | markers (≈ 3 chars per cell) |
| Core | no change | the plan + X1 (test line) + X2 (one term) |
| Validation | scenarios | 1.5 M reference moves, fuzz, benchmarks, self-play |

---

## 11. Open points

1. **X2 or the ledger.** `budgetExtra` is one generic term; the ledger fallback works on the unchanged core but
   relies on `sq = −3` being skipped everywhere.
2. **`hit = false` semantics** (5.10): "a rolled Missed only spends the source board" is my choice; "structure follows
   the key even when Missed" is a one-line alternative.
3. **Measure board**: the tapped part's board, else the first must-move board. A stricter rule (only parts on your
   own boards) needs a legality hook.
4. **Strand warning** (7.8): the rules end a stuck turn at once; without the warning a beginner can strand a board
   by moving in the wrong order (Marauders, test 26). The computer avoids it: its search sees `stateResult`, and
   the +200 contempt makes it prefer playing on unless it judges its position bad.
5. **Defaults**: cap 3 and reach 4 are proposals; the prototype shows the reach costs 0.6 % of the official moves.
6. **Setup names** use the 5dpgn `Board` names (P 7.2); a few in-game names ("Misc – Small") may differ.
7. **Brawn promotion** by a cross-board capture follows 5d-chess-js and ftxi (P 9.4).
8. **Phone zoom**: the 2.5-board focus is small on 8 × 8 phones; `focus.box` (7.8) would fix it.
