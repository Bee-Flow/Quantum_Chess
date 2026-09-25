# Multiverse chess (Quantum 5D): complete design, lens "clarity and playability"

Variant id `multiverse`, category `dimensions` (as in `src/variants/catalog.js`; the placeholder module says `rules`,
which must be changed). Display name from the catalogue: *Multiverse chess (5D)*.

This design is written for normal players on a laptop and on a phone. It stays faithful to *5D Chess With Multiverse
Time Travel* (Thunkspace, 2020) wherever that does not cost clarity or speed, it is genuinely quantum, and it runs on
the existing variants core **without changing it**: only the hooks in `handoff/IMPLEMENTING.md` plus `solidExtra`,
`nextSide`, `actions` and `layoutOf` are used. Section 4.11 lists every core behaviour the design relies on, with
file and line, so that tests can pin them.

Sources: `research/multiverse-rules.md` (R), `research/multiverse-pieces.md` (P), `research/multiverse-engines.md`
(E), the earlier spec `research/multiverse.md` (M), `docs/rules.md`, and the code in `src/variants/core/`,
`src/variantplay/` and `src/views/VariantGameView.vue`.

---

## 0. The decisions at a glance

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Board | The **official small boards** only: *Small* 5×5 (default), *Small – Centered* 5×5, *Very Small – Open* 4×4 (the easiest start), *Focused – Just Knights* 5×5. One static capacity of 5×5 cells. | A phone shows a 5×5 board at a usable size; move lists stay short, so the computer is quick. The 8×8 start is a later, separate catalogue entry (section 8). |
| D2 | Timelines | At most **1 or 2 new timelines per player** (option, default 2): at most 5 rows, L−2 … L+2. | Readable rows, bounded engine cost. |
| D3 | History | Each timeline keeps its **latest board and the 4 boards before it** (two full turns). Older boards are *sealed*. | Knights reach 2 turns back; the picture stays 5 boards wide. |
| D4 | A turn | Move on your boards; **the turn ends by itself** when you have no board left to move on; press **Submit turn** only when optional boards are left. | Faithful turn structure without an extra click in the common case. |
| D5 | Winning | **Capture any enemy king on any board, past boards included.** The danger line is the 5D "check". | The app's rule; no exponential checkmate search (E §5.2). |
| D6 | The one quantum rule of the multiverse | **A move that would turn out differently in different possibilities is always rolled** (`measured: () => true`). Nothing is linked by sliding past a ghost. **A Missed roll changes nothing**: the board still waits for your move. | The core keeps a world unchanged where a move misses (`quantum.js:709-711`); rolling keeps every timeline identical in every possibility with honest *Missed / Moved / Captured* labels. |
| D7 | Classical structure | Timelines, their boards, who created them, the present and the side to move are **the same in every possibility** (`solidExtra`). | One multiverse on screen, one present, one Submit. |
| D8 | Split and merge | Only **on one board** (travel moves carry `id: -1`, so the core never uses them for splits or merges). | A split into the past would open a timeline in half of the possibilities. |
| D9 | History on screen | History boards are real squares with square-based piece ids, so the existing board component draws **past ghosts with their percentages**. | "The past is uncertain" is the most striking quantum 5D effect; it must be visible. |
| D10 | Danger | For the side **not** to move, `generate` returns one pseudo-move `†` per world if a king can be captured, so `royalDanger` shows the chance that **some** move captures a king. | Misses are free, so every attacking ghost part can be tried in turn: the real danger is the union, not the best single move. |
| D11 | Computer | `aiView` switches the search to the mandatory boards; `evaluate` removes history material and adds king danger and the timeline advantage. | Keeps the generic `ai.js` within its time limits. |

---

## 1. Player-facing rules (complete)

### 1.1 The multiverse

- Each **row is a timeline**; **time runs to the right**. The game starts with one timeline, **L0**, and one board.
- Every move adds a board: the board you moved on is copied one step to the right with your move made, and the old
  board stays behind as **history**. History never changes.
- A board is either a **White board** (White to move there, marked ○) or a **Black board** (Black to move, ●). The
  boards of a timeline alternate: T1 ○, T1 ●, T2 ○, T2 ● … **T** is the turn number.
- Only the **latest board of a timeline** can be moved on, and only by the player whose board it is.
- Each timeline keeps its latest board and **the four boards before it** (its last two turns). Older boards are
  **sealed**: they are no longer shown, nothing can travel to them, and their pieces no longer matter.

### 1.2 Your turn

- **Must move** boards (gold): the timelines of the **present** that are yours. You make one move on each of them.
  The present is the earliest latest board among the *active* timelines (1.3).
- **Optional** boards (blue): your other latest boards (timelines that are ahead of the present, or inactive). You may
  move on them, once each, but you do not have to.
- One board takes part in **at most one move per turn**: once you have moved on it (or a piece arrived on it), it is
  your opponent's board.
- **Your turn ends by itself** when you have no board left to move on. If only optional boards are left, press
  **Submit turn** to end it, or keep moving on them.
- Moves are final: a move cannot be taken back inside a turn (its roll has already happened).

### 1.3 Travelling through time and timelines

- Pieces move in **four directions**: files, ranks, **time** and **timelines**. One step in time is one whole turn
  back (from T5 ○ to T4 ○): a piece only ever lands on a board where it is its own player's move. One step across is
  the neighbouring timeline, at the same turn.
- **Landing on the latest board of another timeline** (a *jump*) moves the piece there: both timelines get a new
  board.
- **Landing on an older board** (the past of any timeline, also your own) **opens a new timeline**: the old board is
  copied, your piece arrives on the copy, and your opponent moves there next. Only the travelling piece comes along.
  Your own timeline gets a new board without the piece.
- A timeline opened by White is numbered L+1, L+2 and is drawn **below**; one opened by Black is L−1, L−2 and is drawn
  **above**.
- Each player may open only a few timelines (1 or 2, chosen at the start). After that, pieces can still jump to the
  latest boards of other timelines, and **a king in the past can still be captured** (that ends the game, no timeline
  opens).
- **Active timelines.** L0 is always active. Your *n*-th timeline is active only while your opponent has opened at
  least *n − 1*. An inactive timeline can be played, but it does not count for the present. When the opponent opens a
  timeline, one of yours can become active again.
- **The present moves.** It moves right when every must-move board has been played. It moves **back** when someone
  opens an *active* timeline in the past: the new board is then the earliest, it is the opponent's board, and your
  remaining must-move boards become optional.

### 1.4 The pieces

Every piece keeps its chess pattern in all four directions.

| Piece | Moves |
|---|---|
| Rook | any distance along one direction (file, rank, time back, or timelines) |
| Bishop | any distance along two directions at once, equally far in both |
| Queen | any distance along one, two, three or four directions at once, equally far in each |
| King | one step along one to four directions |
| Knight | two steps along one direction and one along another (it jumps) |

A sliding piece needs every board on its way to exist and every square on its way to be empty; the squares are read
on the boards it passes, as they were then. Your own pieces block you, also your own past self.

### 1.5 Pawns

- White pawns go **up**: forward in rank, or **one timeline up** (towards Black's timelines) at the same turn. Black
  pawns go down.
- A pawn that has never moved may make a **double step** in either of these two directions (the square in between
  must be empty).
- A pawn **captures** diagonally forward on its board, or **one timeline forward and one turn back or ahead** (same
  square). It never moves along time alone, never captures straight ahead.
- **Promotion**: a pawn that reaches the last rank on its board becomes a **queen**.
- **En passant** works on one board, as in chess, right after the double step.

### 1.6 Castling

On one board, as in chess: a king and a rook that have never moved on that board's history, all squares between them
empty. The king moves two squares towards the rook, the rook jumps over it. There is no check, so castling out of,
through or into danger is allowed (as in all Quantum Chess).

### 1.7 Winning and drawing

- **You win by capturing any enemy king** on any board: a latest board, or a past board by time travel. A player can
  have several kings (a king that travels leaves its old self behind); losing any of them loses the game.
- **The danger line** shows the chance that your opponent could capture one of your kings on their next turn, from the
  boards you have already handed over. At 100 % you are in what 5D players call check.
- **No legal move** (a must-move board you cannot move on, and nothing else to do): you **lose** if a king of yours can
  certainly be captured, otherwise the game is a **draw**.
- **Draws**: about 50 turns each without a capture or a pawn move (300 moves), the move limit (1000 moves), or
  agreement / resignation as usual.

### 1.8 Quantum in the multiverse

All the Quantum Chess rules apply (split, merge, measure, land = roll, solid kings and pawns, budget 8, 64
possibilities, game-end roll), with these multiverse rules:

- **Split and merge stay on one board.** A knight, bishop, rook or queen can split to two empty squares of its own
  board. Merging brings the two parts together on that board.
- **Every uncertain move is rolled.** If a move would happen in some possibilities but not in others (your piece
  might not be there, its way might be blocked, the target might be occupied), the dice decide at once. Nothing is
  linked by sliding past a ghost.
- **Missed changes nothing.** The board still waits for your move. You learned where things are, for free.
- **Measuring is free**: it does not use a board.
- **The past is uncertain.** History boards show ghosts as they were, with their percentages. Landing on such a
  square in the past is a roll.
- **New timelines copy ghosts.** When a past board with a ghost is copied into a new timeline, the ghost is copied
  too; the copies stay **linked** to the original: find out where one is, and you know where all are.
- **The past remembers.** Old ghost squares count toward your budget until those boards are sealed (two turns).
- **One multiverse.** Which timelines exist, how long they are, the present and whose turn it is are always certain.
  If a split or merge could only partly happen, a roll first decides whether it happens at all (section 5.4).

### 1.9 Limits

| Limit | Value | At the limit |
|---|---|---|
| New timelines per player | 1 or 2 (default 2) | no more travel to the past, except to capture a king |
| History per timeline | latest board + 4 earlier boards | older boards are sealed |
| Budget | 8 per player | splits are refused (core) |
| Possibilities | 64 | (core) |
| Moves without capture or pawn move | 300 | draw |
| Moves in the game | 1000 | draw |

### 1.10 `rules()`: the eight sentences

```js
rules: () => [
	t('quantumchess', 'Each row is a timeline and time runs to the right: only the latest board of a timeline is played, the older boards are its history (the last two turns are kept).'),
	t('quantumchess', 'On your turn move once on every board marked “must move”; boards marked “optional” may be played too. The turn ends by itself, or press Submit turn when only optional boards are left.'),
	t('quantumchess', 'Pieces move on the board, back in time (one step is one turn, to a board where it is your move) and across timelines, keeping their chess pattern in all four directions.'),
	t('quantumchess', 'Landing on the latest board of another timeline moves the piece there; landing on an older board opens a new timeline. Each player may open only a few, but a king in the past can always be captured.'),
	t('quantumchess', 'Pawns step forward on the board or one timeline towards the opponent; they capture diagonally on the board, or one timeline forward and one turn back or ahead, and promote to a queen.'),
	t('quantumchess', 'Capture any enemy king on any board, also on a past board, to win.'),
	t('quantumchess', 'Quantum: a move that would turn out differently in different possibilities is always rolled, nothing is linked by sliding past. After Missed nothing changed and the board still waits for your move. Measuring is free.'),
	t('quantumchess', 'Split and merge stay on one board. A new timeline copies the past board with its ghosts, and the copies stay linked; old ghost squares count toward your budget until they are sealed.'),
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
		{ id: 'open', label: () => t('quantumchess', 'Very small and open, 4×4: the easiest start') },
		{ id: 'knights', label: () => t('quantumchess', 'Kings and knights only, 5×5') },
	] },
	{ id: 'timelines', type: 'choice', label: () => t('quantumchess', 'New timelines per player'), default: '2', values: [
		{ id: '1', label: () => t('quantumchess', 'One (at most 3 timelines)') },
		{ id: '2', label: () => t('quantumchess', 'Two (at most 5 timelines)') },
	] },
	{ id: 'blackView', type: 'boolean', label: () => t('quantumchess', 'Draw Black at the bottom'), default: false },
],
```

`blackView` only changes the drawing (6.9). There is no option for the history window: it is fixed.

### 2.2 Setups (5DFEN: ranks top to bottom, `*` = has never moved)

| id | Size | Board (0T1 ○) | Source |
|---|---|---|---|
| `small` | 5×5 | `k*qbnr*/p*p*p*p*p*/5/P*P*P*P*P*/K*QBNR*` | official *Small* (P §7.2) |
| `centered` | 5×5 | `r*nk*qr*/p*p*p*p*p*/5/P*P*P*P*P*/R*QK*NR*` | official *Small – Centered* |
| `open` | 4×4 | `nbr*k*/3p*/P*3/K*R*BN` | official *Very Small – Open* |
| `knights` | 5×5 | `n1k*n1/5/5/5/1NK*1N` | official *Focused – Just Knights* |

White (side 0) moves first. `x.n` is the board size (4 or 5); on 4×4 only files a–d and ranks 1–4 exist.

### 2.3 Time

- Half-turn index **v** = 2·(T − 1) + colour, colour 0 = White to move (○), 1 = Black to move (●). (0T1 ○) is v = 0.
- `T(v) = (v >> 1) + 1`, `colour(v) = v & 1`.
- One step of a piece in time changes v by **2**.

### 2.4 Timelines and rows

- Line numbers L ∈ {−2, −1, 0, +1, +2}; row index **u = L + 2** (0 … 4). Written `0`, `+1`, `+2`, `−1`, `−2` (U+2212
  minus sign everywhere a player reads it).
- White's k-th new timeline is L = +k, Black's is L = −k. A new row exists in every possibility or in none.
- Per row: `start` (first board), `end` (latest board), parent `(L', v')` (the board it was copied from; none for L0).

### 2.5 Which boards exist

- Board (u, v) **exists** iff row u exists and `max(start, end − 4) ≤ v ≤ end`. Its **age** is `end − v` (0 = latest).
- Boards with `v < end − 4` are **sealed**. Boards before `start` never existed on that row (its past is its parent's).

### 2.6 Playable, active, present, mandatory, optional

For a skeleton with created counts `c = [c0, c1]` and side to move `s`:

- `playable(side)` = rows whose latest board has that side's colour: `colour(end) = side`.
- `active(u)`: L = 0, or L > 0 and L ≤ c1 + 1, or L < 0 and −L ≤ c0 + 1.
- **present** `P` = min of `end` over the active rows.
- `mandatory(s)` = active rows with `end = P` and `colour(P) = s` (empty once the present has passed).
- `optional(s)` = `playable(s)` minus `mandatory(s)`.

### 2.7 A turn, the automatic end, Submit

- A turn is a sequence of moves by `s` (ordinary moves, splits, merges, measurements), then the turn passes.
- **Automatic end**: after every applied move by `s` (not Submit), if `playable(s)` is empty, `x.s` becomes `1 − s`
  in that same move (then `colour(P) ≠ s` holds automatically). It depends on the skeleton only, so it is the same in
  every world.
- **Submit** (`↵`) is legal iff `colour(P) ≠ s` (the present has passed) and `playable(s)` is not empty (optional
  boards left). It only sets `x.s = 1 − s`.
- At the start of a turn the present has the mover's colour, so there is no pass and at least one move is needed.
- A rolled **Missed** and a **Measure** leave every world unchanged (core behaviour), so the turn does not end and no
  board is used.

### 2.8 What a move does

Let the piece stand on the latest board of row u (v = end(u)) and land on board (u2, v2).

| Kind | Condition | Effect |
|---|---|---|
| physical | u2 = u and v2 = v | row u advances: its new latest board is the old one with the move made |
| hop (`>`) | (u2, v2) ≠ (u, v) and v2 = end(u2) | row u advances without the piece; row u2 advances with the piece on the target (capturing) |
| branch (`>>`) | v2 < end(u2) (any row, also u) | row u advances without the piece; a **new row** for the mover: `start = end = v2 + 1`, parent (L(u2), v2), board = copy of (u2, v2) with the piece on the target (capturing the copy there); `c[mover] += 1` |
| branch onto a king | the target on (u2, v2) holds an enemy king | row u advances without the piece; the mover wins (`x.k = mover`); **no row is opened** |

The travelling piece becomes "moved"; every copied piece keeps its "never moved" state from the copied board.

### 2.9 Branch permission

A branch is generated iff `c[mover] < m` (m = option `timelines`), **or** its target square holds an enemy king. A
branch that would need a row beyond L±2 cannot happen, because `m ≤ 2`.

### 2.10 Win and draw

- `worldResult(w)`: `x.k ≥ 0` → `{ winner: x.k, reason: 'king' }`, else null. Kings are solid, so a king capture is
  either certain or part of a rolled move; the game-end roll handles the rest.
- `noMoves(state)`: `royalDanger(V, state, state.turn) === 1` → `{ winner: 1 − turn, reason: 'stuck' }`, else
  `{ winner: null, reason: 'noMoves' }`.
- `quietPlies: 300`, `maxPly: 1000` (a turn is 2–5 plies).
- `reasonText`: `quiet` → "a long time without a capture or a pawn move", `stuck` → "no legal move while a king could
  be captured".

### 2.11 Limits and what happens there

| Limit | Behaviour |
|---|---|
| `c[side] = m` | quiet or non-king branches are not generated; the Submit label and the header say "no new timelines left" |
| window (4 boards) | a target older than `end − 4` does not exist; a rider stops there; the row shows "⋯" on the left |
| a row far behind (inactive) | it stays playable (optional); the layout collapses the empty columns into one "⋯" gap |
| 5 rows | never exceeded (m ≤ 2 per side) |
| 300 quiet plies / 1000 plies | draw (core, with the texts above) |
| budget 8 / 64 worlds / 4 squares per split | core rules unchanged |

---

## 3. The pieces as vectors (dx, dy, dT, dL)

x = file, y = rank, T in whole turns (v changes by 2·dT), L in timelines. Vectors with **dL = 0 and dT > 0** are
dropped (they can never find a board).

| Type ids | Piece | Vectors (from `core/topology.js`) | Count | Kind |
|---|---|---|---|---|
| `r0`, `r` | rook | `directions(4, 1)` | 7 | ride |
| `b` | bishop | `directions(4, 2)` | 20 | ride |
| `q` | queen | `allDirections(4)` | 71 | ride |
| `k0`, `k` | king (royal) | `allDirections(4)` | 71 | leap |
| `n` | knight | `symmetric([2, 1], 4)` | 40 | leap |
| `p0`, `p` | pawn | below | – | special |

- **Leap**: only the target board and square are checked. **Ride**: step k = 1, 2, …; stop when the board does not
  exist, the square is off the n×n board, or the square is occupied (an enemy there is a capture, then stop).
- Target empty → quiet move; enemy → capture; own piece (including the piece's own past self) → blocked.
- **Pawn** (White; Black negates dy and dL):
  - quiet: `(0,+1,0,0)`, `(0,0,0,−1)`;
  - unmoved (`p0`) double: `(0,+2,0,0)` with `(0,+1,0,0)` empty, `(0,0,0,−2)` with `(0,0,0,−1)` existing and empty;
  - capture only: `(±1,+1,0,0)`, `(0,0,+1,−1)`, `(0,0,−1,−1)`;
  - en passant: on the latest board of row u, if `x.ep[u] = e` (the square skipped by the enemy double step that made
    this board), a pawn capturing diagonally onto e removes the pawn on (file of e, rank of the capturer's from
    square). Kind `ep`.
  - promotion: a physical move onto the last rank (rank n for White, rank 1 for Black) gives type `q`, key suffix `=q`.
    Timeline moves and T–L captures keep the rank and never promote.
- **Castling** (kind `castle`, physical only): `k0` and `r0` on the same rank of the same latest board, at least 3
  files apart, every square strictly between them empty; the king moves 2 files towards the rook, the rook to the
  square the king crossed; both become `k`/`r`. No attack test.
- **Never-moved state = type**: `k0`, `r0`, `p0` become `k`, `r`, `p` when that piece moves (also by travelling, also
  as a split or merge part). Copies keep their type, so a copied board keeps its castling and double-step rights.

Types: all with `moves: []` (descriptors are unused, `generate` is overridden), glyph sprites `k q r b n p`, names
King, Queen, Rook, Bishop, Knight, Pawn. Solid: `k0 k p0 p`; royal: `k0 k`; splittable (default): `q r0 r b n`.
Values (centipawns, 4D-adjusted, P §8.6): `p0 p` 100, `r0 r` 400, `n` 450, `b` 450, `q` 1100, `k0 k` 0.

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
	topology,                 // 4.2, static
	types,                    // 3
	options,                  // 2.1
	setup, rules,             // 2.2, 1.10
	generate, apply,          // 4.7, 4.8 (replace the classical generator and apply)
	measured: () => true,     // D6
	solidExtra, nextSide, actions, layoutOf,
	worldResult, noMoves, reasonText,
	evaluate, aiView,         // 4.10
	maxPly: 1000, quietPlies: 300,
}
export default defineVariant(spec)
export { buildWorld, SUBMIT }  // tests (4.13)
```

`afterMove`, `extraMoves`, `filterMoves`, `onCapture`, `candidateMoves`, `stateResult`, `isOut` are not used.

### 4.2 Static topology: capacity, square encoding, names

Constants: `N = 5` (cells per side), `C = 25`, `R = 5` rows, `H = 4` history ages.

| Squares | Formula | Range |
|---|---|---|
| latest board of row u, cell c | `u·25 + c` | 0 … 124 |
| history board of row u, age a (1 … 4), cell c | `125 + (u·4 + a − 1)·25 + c` | 125 … 624 |

`c = y·5 + x`; **S = 625 squares**. Examples: `(0)a1` = 50, `(0)c3` = 62, `(+1)c5` = 97, `(0~1)a1` = 325,
`(0~2)c3` = 362, `(−2~4)e5` = 224.

`makeTopology({ coords, name, cell })` with coords `[x, y, u, a]` (a = 0 for the latest board). Names (no `-`, `|`,
`?`, `@`, `=`, space):

- latest board: `(0)c3`, `(+1)c3`, `(−1)c3` (U+2212);
- history: `(0~2)c3` = "timeline 0, two boards before its latest".

These names appear in split, merge and measure codes and in measure outcomes (`On (0)c3`). The **drawn** names are
absolute and come from `layoutOf` (6.7). The static `cell()` is a plain grid; it is never shown, because `layoutOf`
always exists.

### 4.3 Piece ids

- Arrays `sq`, `ty`, `sd` have length **625** in every world. Unused ids: `sq = −1`, `ty = ''`, `sd = 0`.
- **Live pieces** (on latest boards): when row u is created (L0 at setup), the piece on cell c gets id `u·25 + c`. A
  piece keeps its id when it moves, travels, promotes or splits. Captured: `sq = −1`. Ids are never reused (a row is
  created once).
- **History pieces**: the piece on history square h has id **h**. Snapshots copy type and side; ids follow squares.
- A new row's copies get the block ids of the new row (`n·25 + c`); the travelling piece keeps its own id.
- Consequence: a ghost copied into a new timeline becomes one piece per possible square ("twins"). They are linked
  (they exist in exactly the worlds where the original stood there), they can be measured and moved (rolled), but
  twins cannot be merged with each other (5.1).

### 4.4 The world

```js
{
	sq: number[625], ty: string[625], sd: number[625], board: number[625],
	x: {
		n: 5,                  // board size of this game (4 or 5)
		m: 2,                  // new timelines allowed per side
		s: 0,                  // side to move (drives nextSide)
		c: [0, 0],             // timelines created by White, Black
		tl: [null, null, [0, 7, 0, -1], null, null],   // per row: [start, end, parentL, parentV] or null
		ep: [-1, -1, -1, -1, -1],   // per row: en passant cell on its latest board, or -1
		k: -1,                 // side that captured a king in this world, or -1
		// ai: 1               // only in the computer's search copy (4.10)
	},
}
```

World JSON is about 7 KB (625 × 4 short entries); 64 worlds about 0.45 MB; a typical state (≤ 8 worlds) under 60 KB.

### 4.5 Skeleton helpers (pure, from `x` only)

`exists(u, v)`, `age(u, v)`, `active(u)`, `present(x)`, `playable(x, side)`, `mandatory(x, side)`, `canSubmit(x)`,
`newLine(x, side)` exactly as in 2.5 – 2.9, plus
`squareOf(u, v, cell) = v === end(u) ? u·25 + cell : 125 + (u·4 + end(u) − v − 1)·25 + cell`.

### 4.6 Move keys (identical in every world; they are the codes in the move list)

```
board := "(" line "T" turn ")"     line ∈ {0, +1, +2, −1, −2}, turn = T(v)
cell  := file rank                 a–e, 1–5
key   := board cell "-" cell ["=q"]     physical (also double step, en passant, castling = the king's move)
       | board cell ">" board cell      hop
       | board cell ">>" board cell     branch
       | "↵"                             Submit (constant SUBMIT)
```

Examples: `(0T1)d1-c3`, `(0T5)a3>(+1T5)a3`, `(0T2)c3>>(0T1)c5`, `(0T5)b4-b5=q`, `(0T5)a1-c1` (castling), `↵`. The
turn is derived from the skeleton, so keys never differ between worlds. Keys contain no `|` and never start with `?`
(`parseCode`, `quantum.js:340`). Split, merge and measure codes are built by the core from the static names:
`(0)d1-(0)c3|(0)e3`, `(0)c3|(0)e3-(0)d1`, `?(0)c3`, `?(0~2)c3`.

### 4.7 `generate(w, side)`

**Mover (`side === x.s`).** For each row u in `playable(side)` (all of them; in AI mode see 4.10), with v = end(u):

1. For each cell c of the n×n board with an own piece X on square `u·25 + c`:
   - kings, knights: leap over the vector table; queens, rooks, bishops: ride; pawns: 3; castling: 3.
   - target (u2, v2, c2): u2 = u + dL·k, v2 = v + 2·dT·k; must exist (2.5) and be on the board.
   - classify (2.8); drop branches without permission (2.9).
2. Push a ClassicalMove:

```js
{ key, from: u·25 + c, to: squareOf(u2, v2, c2),
  id: kind is physical ? X : -1,         // D8: travel moves are never split or merge moves
  capture: victim id on the target or -1,
  promo: 'q' or null, drop: null,
  kind: 'normal' | 'double' | 'ep' | 'castle' | 'hop' | 'branch',
  extra: { id: X, u, u2, v2, c, c2, rook?: { from, to }, victim? } }
```

3. If `canSubmit(x)`: push `{ key: '↵', from: -1, to: -1, id: -1, capture: -1, promo: null, drop: null, kind:
   'submit' }`.

Order: rows ascending, cells ascending, vectors in table order, k ascending, `↵` last. Keys are unique per world. Key
prefixes per (row, T) and cell names are precomputed strings.

**Not the mover (`side !== x.s`): the danger list.** Scan `playable(side)` for the first capture of an enemy royal
piece (on a latest or a history board) and return at most one move `{ key: '†', …, capture: victim, kind: 'danger'
}`, else `[]`. Only `royalDanger` reads this (`quantum.js:1266-1287` sums weights per key), so it shows the weight
of the worlds in which *some* king capture exists. `table()` only ever generates for `state.turn`
(`quantum.js:98`), so `†` never becomes a legal move. While the opponent is to move, `royalDanger` for the waiting
player uses the opponent's real keys and shows the best single move; on your own turn it shows the union, which is
the number that matters when your turn ends.

### 4.8 `apply(w, m)` and the snapshot

`next = cloneWorld(w)`, then by kind:

- **advance(u)** (a board of row u gets a successor): for a = 4 … 2 move the content of history age a − 1 to age a
  (square ids follow: `sq[h] = h`, `board[h] = h`, or both −1 and `ty[h] = ''`); copy the latest board of u into age
  1 (type and side per cell); `tl[u][1] += 1`; `ep[u] = −1`. Pieces on the latest board keep their squares and ids.
- **physical**: advance(u); remove the victim (`sq = −1`; a royal victim sets `x.k = mover`); move X from `from` to
  `to`; type → moved type; promotion → `q`; castling moves the rook; en passant removes `extra.victim`; a double step
  sets `ep[u]` to the skipped cell.
- **hop**: advance(u); advance(u2); remove X from row u; capture on the target of row u2 (a royal victim sets
  `x.k = mover`); place X there (moved type).
- **branch**: read the content of board (u2, age a) **before** advancing (u2 may equal u); advance(u); remove X from
  row u. If the target cell holds an enemy king: `x.k = mover`, stop. Otherwise row n = `newLine(mover) + 2`:
  `tl[n] = [v2 + 1, v2 + 1, L(u2), v2]`, `c[mover] += 1`, `ep[n] = −1`; for every cell c' of the copied board except
  the target, put a piece with id `n·25 + c'`, same type and side, on square `n·25 + c'`; place X on `n·25 + c2`
  (moved type).
- **submit**: `x.s = 1 − x.s`.
- Then the **automatic end** (2.7) for every kind except submit.

Cost: one clone of 4 × 625 entries plus at most 2 × 100 history cells, about 20 µs.

### 4.9 The hooks

```js
solidExtra: (w) => w.x.s + '/' + w.x.c.join(',') + '/' + w.x.tl.map((r) => (r ? r.join('.') : '-')).join(';'),
nextSide: (w) => w.x.s,
actions: (state) => [{ code: SUBMIT, label: submitLabel(state) }],
measured: () => true,
worldResult: (w) => (w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null),
```

- `solidExtra` is the whole skeleton: side to move, created counts, and every row's start, end and parent. Everything
  about turns and layout is a function of it, so it is identical in every world.
- `nextSide` is evaluated on the first world of the new state (`quantum.js:1154`); `x.s` is the same in all.
- `submitLabel(state)` (skeleton of `state.worlds[0].b`): legal → `t('Submit turn')`; otherwise `n('quantumchess',
  'Submit turn (move on {count} more board first)', 'Submit turn (move on {count} more boards first)', count)` with
  count = `mandatory(s).length`. The view marks the button disabled when `isLegal` is false
  (`VariantGameView.vue:313-316`).
- `measured: () => true` only matters when the per-world results differ (`quantum.js:830-836`): then the move is
  rolled by *miss / move / capture*.

### 4.10 The computer player

`evaluate(w, side)` (added to the core's material count, `ai.js:47-77`):

1. **History does not count**: subtract `value(own history pieces) − value(enemy history pieces)` (ids 125 … 624).
2. **Kings**: −3000 if an enemy king capture exists from the enemy's playable boards in this world; +1500 if
   `x.s === side` and `side` can capture an enemy king now.
3. **Timeline advantage** (R §5.1): if `c[side] < m`: +120 × clamp(`c[enemy] − c[side]`, −2, 2).

`aiView(state, side)` (called once per search, `ai.js:201`): return a copy of the state whose worlds carry `x.ai = 1`
(shallow copies, arrays shared). In AI mode the mover's `generate` keeps:

- every move from **mandatory** boards, and `↵` when legal;
- from optional boards only moves whose target holds an enemy king (kings are solid, so this is the same in every
  world) and hops onto a mandatory board (a way to clear a stuck board).

The filter uses only the skeleton, the key and king squares, so a key is kept in all worlds or in none and the
outcome weights stay exact. If the pruned union is empty, `aiView` returns the real state. `chooseMove` checks every
candidate against the real state (`ai.js:204`). The reply after `↵` is the opponent's search in AI mode; the reply
after one of my own moves is my best continuation (`replyValue` with `them === me`, `ai.js:253`), which is what a
multi-move turn needs.

### 4.11 Core behaviours relied upon (pin them with tests)

| Behaviour | Where |
|---|---|
| A world where a key is absent is kept unchanged (`miss`) | `quantum.js:707-711` |
| `measured(sample)` is consulted only when per-world results differ | `quantum.js:830-836`, `734` |
| Split targets and merges use only moves with `m.id === X`, no promo, not `castle` | `quantum.js:475-482`, `537-541`, `923-929` |
| Solid roll by `solidKey` including `solidExtra`, then game-end roll | `quantum.js:263-279`, `1015-1041` |
| `turn = nextSide(first world)`, `result = worldResult(first world)` | `quantum.js:1154-1157` |
| `royalDanger` sums weights per key of royal captures from `generate(V, b, e)` | `quantum.js:1266-1287` |
| `table()` generates for `state.turn` only | `quantum.js:95-111` |
| `applyClassical` calls `V.apply`, `generate` calls `V.generate` | `world.js:435-436`, `468-470` |
| The board draws `layoutOf(state)` and pieces from `boardView(state, layout.size)` | `VariantBoard.vue:174`, `340` |
| `layout.focus` recentres only when the object changes | `VariantBoard.vue:219-225` |
| `actions(state)` buttons, disabled when `isLegal` is false | `VariantGameView.vue:313-316` |
| `aiView` replaces the searched state | `ai.js:201-204` |
| Side rotation from `sides[i].rotate` | `useVariantGame.js` `rotation` |

### 4.12 Performance budget

| Operation | Target (Node, 5×5, ≤ 5 rows) | Basis |
|---|---|---|
| `generate`, mover, one world | ≤ 0.15 ms typical, ≤ 0.4 ms worst (5 latest boards with queens) | E §6.3: 110 µs for 5 timelines on 5×5 |
| danger list, one world | ≤ 0.05 ms (stops at the first king capture) | |
| `apply` | ≤ 0.03 ms | 4 × 625 copies |
| `solidExtra` | ≤ 2 µs | 5 rows |
| `branches` of one move, 64 worlds | ≤ 5 ms | apply + `solidKey` O(625) per world |
| `stateAfter`, 64 worlds | ≤ 4 ms | `worldKey` O(625) per world (E §6.4) |
| one UI move (applyMove + royalDanger + layoutOf + boardView), 8 worlds | ≤ 20 ms; 64 worlds ≤ 80 ms | |
| `layoutOf` | ≤ 2 ms (≤ 625 cells) | |
| computer, one move | easy ≤ 0.5 s, normal ≤ 2 s, hard ≤ 5 s | `LEVELS.timeMs` + one candidate |
| fuzz (60 plies, 2 seeds) | ≤ 5 s | `fuzz.spec.js` |
| state size | world ≤ 8 KB JSON; 64 worlds ≤ 0.5 MB | localStorage |

Candidate counts: at the start of *Small* 7 keys; a typical middlegame board 30–60 keys (about half of them travel);
3 mandatory boards about 150 keys. Phones are 1.5–3× slower than Node (E §0).

### 4.13 Test helper

`buildWorld(spec)` builds one world from board strings (unlisted stored boards are **empty**):

```js
buildWorld({ n: 5, m: 2, s: 0, c: [0, 0], ep: {},
	rows: { 0: { start: 0, end: 6, parent: null, boards: { 6: '3k1/5/4N/5/K4', 4: '4k/5/5/5/K4' } } } })
```

FEN ranks top to bottom, `*` after K, R or P = never moved. Live pieces get block ids `u·25 + c`, history pieces
square ids. Tests make multi-world states with the helpers' `stateOf`-like weighting over several `buildWorld`s, or by
playing core splits.

---

## 5. Quantum rules (engine view)

### 5.1 Split, merge, measure

- **Split**: `q r0 r b n` (promoted queens too). Targets: two squares of the **same latest board**, empty in every
  world, reachable by a quiet physical move in a world where the piece stands there (core `splitTargets`). Travel
  moves have `id: -1`, so they are never split or merge targets. A split never rolls.
- **Merge**: two parts of one piece on one latest board, to a square of that board both can reach physically.
- **Measure**: any own superposed piece: a ghost part on a latest board, a **twin** in a new timeline, or a ghost
  **on a history board** ("where was my knight at T3?"). Measuring never changes a board, so it is free. Outcome
  labels: `On (0)c3`; for a twin or a history part that is absent in some worlds the other outcome reads "No longer on
  the board".
- **Kings and pawns** are solid (core). Copies of them are solid too.

### 5.2 Rolls across timelines

- A roll keeps only the worlds of the chosen outcome, and a world is a whole multiverse. So a roll on one board
  settles every copy, twin and history square of the pieces involved **on every timeline at once**. Measuring the
  original ghost on L0 decides its twin on L−1 and its past on (0~2).
- **Land = roll** everywhere: a target square that may hold a piece in some world, on a latest or a history board.
- **Pass = link does not exist in the multiverse**: with `measured: () => true` every move whose per-world results
  differ is rolled. The rolled groups are *miss* (world unchanged), *move* and *capture* (the same key applied). Each
  group has one skeleton, so the solid roll never fires on structure for ordinary moves.
- **Missed is free**: the miss worlds are unchanged (`quantum.js:709-711`), so the side to move, the present and every
  board stay as they were.
- **Links** come from three sources: a split piece and its own history; twins made by a branch; and pieces of both
  sides copied from a past board that differs between worlds. They show as matching percentages; the what-if view
  (tap a part) shows the correlations.

### 5.3 What stays classical, and why

| Classical | Why |
|---|---|
| the skeleton: rows, starts, ends, parents, created counts, side to move (`solidExtra`) | one board picture, one present, one Submit; "which boards must I move" has one answer |
| kings and pawns | core rule; also keeps king captures in the past certain or cleanly rolled |
| the "never moved" state of kings, rooks, pawns (their types) | kings and pawns are solid; a rook that splits becomes moved in every world |
| Submit and the automatic end | functions of the skeleton, so never rolled |

### 5.4 Structural edge cases (the only solid rolls on structure)

The core applies splits and merges world by world and keeps a world unchanged where a part cannot move
(`quantum.js:873-887`, `941-957`). Three cases can therefore leave worlds with different skeletons; the solid roll
then decides, with the UI note "A piece that is always solid was settled" and the outcome label *Split*:

| Case | What the player gets |
|---|---|
| E1: splitting **one part of a ghost** (the piece may not be there) | a roll first decides whether the piece is on that square: yes → it splits; no → nothing happened, the board still waits |
| E2: a **split whose path may be blocked** by a ghost | the possibilities where it could not happen are rolled against the rest |
| E3: a **merge whose path may be blocked** onto a certainly empty square | as E2 (a merge onto a possibly occupied square is rolled normally) |

They are rare, consistent with "Missed changes nothing", and keep ghosts at two parts in practice. The note text is
the core's; a later UI polish could let a variant word it ("the multiverse had to agree"), which is not needed here.

### 5.5 Alternatives rejected

- **Pass = link with "void" moves** (generate the key also where the path is blocked, keep the piece, still advance
  the board): a world cannot know whether its blocker exists in every world, so certainly blocked moves would become
  legal *null moves* (a rook "moving" behind its own pawn, the start position full of them), `hasLegalMove` would
  never see a stuck board, and rolled voids would be labelled *Moved*.
- **An `applyMiss` hook** (E §9.5): a core change; not allowed here.
- **One move per ply** (M): a miss would stall (the opponent has no board of its colour).
- **History as strings in `x`** (E §9.2 R2): the existing board cannot draw them, so the uncertain past would be
  invisible.
- **8×8 boards**: 4× the squares, unreadable on a phone with several rows, and the computer too slow in 64 worlds.

### 5.6 Budget, history and the world bound

- The budget counts arrangements of a side's pieces including history pieces and twins (`quantum.js:219-242`). Only a
  side's own splits can raise it (every other change maps one world to one world, and rolls only remove worlds), so
  "your opponent can never use up your budget" still holds, and ≤ 8 per side keeps ≤ 64 worlds.
- After a merge the worlds still differ in the ghost's old squares, so the budget stays up until those boards are
  sealed (at most 4 advances of that timeline).

---

## 6. UI (`layoutOf(state)`)

### 6.1 Geometry (units: one square = 1)

- n = board size. Column pitch `px = n + 1.2`, row pitch `py = n + 1.6`, left margin 2.4 (row labels), top margin 1.6
  (header and "Now").
- **Rows**: only existing rows, ordered by L ascending (Black's timelines on top, L0, White's below); with
  `blackView` the order is reversed.
- **Columns**: the sorted set of v of every displayed board. Between two displayed columns whose v differ by more than
  1, a gap of width 1.2 with the label "⋯". Time always runs left to right.
- Board (u, v) top-left: `x0 = 2.4 + colX(v)`, `y0 = 1.6 + rowIndex(u)·py`.
- Content size `cw × ch`; the returned `width = cw`, `height = max(ch, 0.75·cw)` with the content centred
  vertically, so a zoomed window on a phone is tall enough to show a whole board.
- `layout.zoomable = true`.

### 6.2 Cells and shades

- Only squares of existing boards (and only a–d, 1–4 on 4×4) become cells: `{ sq, x: x0 + col, y: y0 + (n − 1 −
  row), w: 1, h: 1, shape: 'rect', shade }` (mirrored with `blackView`: `x0 + (n − 1 − col)`, `y0 + row`).
- Latest boards: `dark` / `light` checker. History boards: `mid` / `light` (washed out, "the past").
- **Last moves** (the current turn of the side to move and the opponent's last turn, parsed from `state.history`
  keys, only records that were not Missed): from and to squares on the boards they concern get `hill` / `hilldark`.

### 6.3 Boards

`boards[]` for every displayed board, label on the frame: `t('L{line} T{turn}')` + ` ○` or ` ●`; for the mover's
latest boards add ` · must move` or ` · optional` (translated). History boards: `T{turn} ○/●` only.

### 6.4 Areas (drawn under everything)

- **Present band**: shade `frame`, over the present column across all rows, label "Now" above it.
- **Must move** halo: shade `wood` (gold), 0.3 around each mandatory board of the side to move.
- **Optional** halo: shade `river` (blue), around each optional board of the side to move.

### 6.5 Lines (arrows)

Lines are drawn under the cells, so arrows run **between board edges** (always visible): a shaft plus two 0.35 head
strokes at ±25°.

- **Branch connector** for every row with a parent: from the right edge of the parent board (if displayed; else the
  left margin of the parent row) to the left edge of the row's first board (if displayed; else its "⋯").
- **Travel arrows** for the hops and branches of the current and the opponent's last turn: from the edge of the board
  the piece left to the edge of the board it arrived on.

### 6.6 Labels

- Row labels in the left margin: `L0`, `L+1`, `L−1`; a second line "inactive" or "new" (a row is new while `end −
  start ≤ 1`).
- Header: `t('New timelines: White {w}/{max} · Black {b}/{max}')`.
- "Now" above the present band; "⋯" in gap columns and before a row whose older boards are sealed.

### 6.7 Names (accessibility)

`names[sq]` for drawn squares: `t('Timeline {line}, turn {turn}, {side} to move: {square}')`, e.g. "Timeline +1,
turn 4, Black to move: c3". The board's aria labels then read "Timeline +1, turn 4, Black to move: c3: Knight (50
%)". Other squares keep the static names.

### 6.8 Focus and zoom

- Target box: the mandatory boards of the side to move; if none (only optional boards left), its playable boards;
  else the present column.
- `zoom = clamp(min(Wf / max(bw + 3, 3·px), Hf / (bh + 3)), 1, 4)` with `Wf = width + 1.4`, `Hf = height + 1.4`
  (the view box of `VariantBoard.vue`), centred on the box: about three boards wide on any screen.
- The focus object is **memoised by `solidExtra` + `blackView`** (a small map, last 32 entries), so a Missed roll, a
  Measure or a move on an optional board that leaves the skeleton unchanged does not recentre the view; a new present,
  a new row or the other side's turn does.

### 6.9 Black at the bottom

`blackView`: rows reversed and boards mirrored (6.2); time still runs left to right. `sides[1].rotate = 0` because a
180° rotation of the whole layout would reverse time. The app's "Flip board" still rotates everything (it reverses
time; the option is the better choice).

### 6.10 What the player sees and does

1. **Start of the turn**: the view zooms on the gold "must move" boards; the button reads "Submit turn (move on 2 more
   boards first)" and is disabled; the danger line shows the chance that a king of yours can be taken.
2. **Tap a piece** on a gold or blue board: dots and rings appear on every board it can reach: the same board, the
   latest boards of other timelines, and faded past boards. A target on a faded board opens a new timeline.
3. **Tap a target**: a certain move plays at once; an uncertain one opens the roll box ("50 % Missed · 50 %
   Captured"). The board changes, the halo moves on; after the last must-move board the turn passes by itself, or
   "Submit turn" lights up if optional boards are left.
4. **A new timeline** appears as a new row with an arrow from the copied board and the label "new"; the view recentres
   on the present.
5. **Split / Merge / Measure** use the existing mode buttons; split targets are only on the piece's own board;
   measure accepts ghost parts on any board, also in the past.
6. **Zoom** with + / −, "Whole board", pinch or Ctrl + wheel; pan by dragging.

### 6.11 Other texts

Option labels (2.1), `submitLabel` (4.9), `reasonText` (2.10), board and row labels (6.3, 6.6), all via `t()` / `n()`.

---

## 7. Test scenarios (expected results)

Notation: `S` = new game with default options (*Small*, 2 timelines); positions via `buildWorld` (4.13); "certain" =
one outcome, not rolled.

### Structure and classical rules

1. **Start moves.** `S`: ordinary keys are exactly `(0T1)a2-a3 (0T1)b2-b3 (0T1)c2-c3 (0T1)d2-d3 (0T1)e2-e3
   (0T1)d1-c3 (0T1)d1-e3` (7); `splitsFrom((0)d1)` = [`(0)d1-(0)c3|(0)e3`]; `↵` is not legal; the action label is
   "Submit turn (move on 1 more board first)". *Open* start: 10 ordinary keys.
2. **Automatic end.** `S`, `(0T1)d1-c3`: certain; `turn = 1`; `tl[L0] = [0, 1, 0, −1]`; `(0~1)d1` holds the white
   knight, `(0)c3` holds it (id 53); `↵` never played.
3. **Travel moves.** `S`, `(0T1)d1-c3`, `(0T1)e4-e3`: White has exactly 13 ordinary keys, among them the branches
   `(0T2)c3>>(0T1)a3`, `(0T2)c3>>(0T1)e3`, `(0T2)c3>>(0T1)c5`; no queen, bishop or king travel (own past selves and
   pieces block), and `(0T2)e1-d1` exists.
4. **Branch.** Then `(0T2)c3>>(0T1)c5`: certain, key capture; row +1 = `[1, 1, 0, 0]`; `(+1)` board = the start
   position with the black bishop replaced by the white knight on c5 (id 53) and a second white knight on d1 (id 78);
   L0 end 3 without the knight; `c = [1, 0]`; turn Black; `mandatory(Black) = {+1}`, `optional(Black) = {L0}`.
5. **Optional boards and Submit.** Then `(+1T1)e4-e3`: turn stays Black; `↵` legal, label "Submit turn"; after `↵`
   White must move on +1 only; after any White move there the turn passes automatically.
6. **Hop and branch at the same turn.** `c = [1, 1]`, White to move; L0 `[0, 8]` latest `4k/5/R4/5/K4`; L+1 `[5,
   8]` `4k/5/5/5/K4`; L−1 `[6, 9]` `4k/5/5/5/K4`. `(0T5)a3>(+1T5)a3` exists and is certain: L0 and L+1 end 9, no new
   row, turn passes (one move cleared both must-move boards). `(0T5)a3>>(−1T5)a3` exists (L−1 has moved on).
7. **Rewinding the present.** `c = [0, 1]`; L0 `[0, 8]` latest `4k/5/5/5/K3R`; L−1 `[7, 8]` `4k/5/5/5/K4`.
   `(0T5)e1>>(0T4)e1`: new row +1 `[7, 7, 0, 6]`, active; present = 7 (●); turn stays White (L−1 is optional now);
   `↵` legal.
8. **Inactive timeline.** `c = [1, 0]`; L0 `[0, 8]` `4k/5/5/5/K3R`; L+1 `[5, 8]` `4k/5/5/5/K4`. `(0T5)e1>>(0T4)e1`
   opens +2 (inactive: 2 > c1 + 1); present stays 8; `↵` illegal; +1 still must move; row label "inactive".
9. **Cap.** As 8 with option `timelines: '1'`: no `>>` key except a king capture; with a black king on `(0~2)e1`,
   `(0T5)e1>>(0T4)e1` exists, is certain, White wins (`king`), no row opens, `c` stays `[1, 0]`.
10. **King captured in the past.** L0 `[0, 6]`, boards 6: `3k1/5/4N/5/K4`, 4: `4k/5/5/5/K4`; White to move.
    `royalDanger(Black) = 1`; `(0T4)e3>>(0T3)e5` is certain; result `{ winner: 0, reason: 'king' }`.
11. **Window.** L0 `[0, 6]`, boards 6: `4k/5/4R/5/K4`, 4: `4k/5/5/5/K3R`, 2: `4k/5/5/5/K3R`: keys
    `(0T4)e3>>(0T3)e3` and `(0T4)e3>>(0T2)e3` exist; nothing reaches T1 (sealed); `exists(L0, 1)` is false.
12. **Blocked path in the past, own past self.** As 11 with a black knight on board 4 e3: `(0T4)e3>>(0T3)e3` is a
    capture and `(0T4)e3>>(0T2)e3` does not exist. A rook that stood on e1 on boards 2, 4, 6 has no key with dT < 0
    along T.
13. **Pawn directions.** `c = [0, 1]`; L0 `[0, 4]` latest `4k/5/5/2P2/K4`; L−1 `[2, 4]`, boards 4: `4k/5/5/5/K4`, 2:
    `4k/5/5/2n2/K4`. Keys from `(0)c2`: `(0T3)c2-c3`, `(0T3)c2>(−1T3)c2` (hop), `(0T3)c2>>(−1T2)c2` (capture,
    branch); no move towards +L, none along T alone, no double step (the pawn has moved).
14. **Double steps and en passant.** L0 `[0, 4]` latest `4k/3p1/5/2P*2/K4`: `(0T3)c2-c4` sets `ep[L0] = c3`; turn passes;
    Black has `(0T3)d4-c3` (kind `ep`, captures the pawn on c4); one board later it is gone. Rows −2, −1, 0 at the
    same turn with `(0)c2` = `P*` and both other c2 empty: `(0T3)c2>(−2T3)c2` exists; with `(−1)c2` occupied it does
    not.
15. **Promotion.** L0 `[0, 8]` latest `4k/1P3/5/5/K4`: the only key from b4 to b5 is `(0T5)b4-b5=q`; afterwards `(0)b5` has
    type `q`.
16. **Castling.** L0 `[0, 8]` latest `k4/5/5/5/K*3R*`: `(0T5)a1-c1` puts the king on c1 (`k`) and the rook on b1 (`r`); with
    `K` instead of `K*` the key does not exist.

### Quantum

17. **Split on one board.** `S`, `(0)d1-(0)c3|(0)e3`: not rolled, 2 worlds 50/50, turn Black, White budget 2; both
    worlds have L0 end 1.
18. **A ghost part moving is rolled; Missed is free.** 17, then `(0T1)a4-a3` (certain), then `(0T2)c3-b5`: outcomes
    Missed 50 % / Captured 50 %. After Missed: 1 world, knight 100 % on e3, L0 end still 2, turn White, `↵` illegal.
19. **A ghost part travels.** 17 + `(0T1)a4-a3`, then `(0T2)c3>>(0T1)a3`: Missed 50 % (no row, `c = [0, 0]`,
    White still to move) / Moved 50 % (row +1 with the knight on a3 and its past self on d1, turn Black).
20. **Twins and a roll across timelines.** 17, `(0T1)a4-a3`, `(0T2)b2-b3`, `(0T2)d5>>(0T1)d3`: certain; row −1 `[2,
    2, 0, 1]`; on it a white knight 50 % on c3 (id 37) and 50 % on e3 (id 39); turn White with −1 must move and L0
    optional; White budget 2. `?(0)c3`: On (0)c3 50 % / On (0)e3 50 %; after "On (0)c3" the twin is 100 % on
    `(−1)c3`, id 39 is gone, White budget 1, turn and skeleton unchanged.
21. **Land = roll in the past.** Two worlds 50/50, White to move, L0 `[0, 6]`: board 6 `3k1/5/5/5/K1N2` in both;
    board 4: A `4k/5/2n2/5/K4`, B `4k/5/4n/5/K4`. `(0T4)c1>>(0T3)c3`: Moved 50 % / Captured 50 %; both open row +1
    `[5, 5, 0, 4]`; after Captured the knight's copy is missing only on +1, L0's history still shows it (now 100 % on
    `(0~2)c3`).
22. **No pass = link.** L0 `[0, 4]`, latest board: A `4k/5/n4/5/R3K`, B `4k/5/2n2/5/R3K` (50/50, White to move):
    `(0T3)a1-a5` → Missed 50 % / Moved 50 %; after Missed the rook is on a1, the knight 100 % on a3, turn White.
    `(0T3)a1-a3` → Moved 50 % / Captured 50 %.
23. **The past remembers.** `S`: `(0)d1-(0)c3|(0)e3`, `(0T1)a4-a3`, `(0)c3|(0)e3-(0)d1` (certain), then `(0T2)e4-e3`,
    `(0T3)b2-b3`, `(0T3)d4-d3`, `(0T4)d2-e3`: after the merge 2 worlds and White budget 2; still 2 after each of the
    next three moves; after `(0T4)d2-e3` (L0 end 7, boards 1 and 2 sealed) 1 world, budget 1.
24. **Measure is free.** 17 + `(0T1)a4-a3`, `?(0)c3`: two outcomes 50/50; afterwards turn White, L0 end 2, `ply` + 1,
    `↵` illegal.
25. **E1, splitting a ghost part.** 17 + `(0T1)a4-a3`, `(0)c3-(0)d1|(0)a4` (targets sorted by square): two outcomes, key `split`, 50/50, notes
    start with `solid:`; one has 2 worlds (knight a4 / d1), L0 end 3, turn Black; the other 1 world (knight e3), L0
    end 2, turn White.
26. **Submit is never rolled.** The state of 20 before the measurement; `(−1T2)b2-b3` (certain): turn stays White (L0 optional), `↵` legal in
    every world, `outcomes(↵)` has one entry, not rolled.
27. **Game-end roll.** As 10 but the knight 50 % on e3 / 50 % on a3 (two worlds): `royalDanger(Black) = 0.5`;
    `(0T4)e3>>(0T3)e5` → Missed 50 % (game goes on, White to move) / Captured 50 % (White wins).
28. **Danger is the union.** Black to move; L0 `[0, 7]` latest `4k/5/5/5/K4`; L+1 `[5, 8]` board 8: A `3k1/5/4N/5/K4`,
    B `3k1/1N3/5/5/K4`; board 6 `4k/5/5/5/K4` in both. `royalDanger(Black) = 1` (A: `(+1T5)e3>>(+1T4)e5`, B:
    `(+1T5)b4-d5`; each alone is 50 %).

### Limits and results

29. **Stuck.** White to move, `c = [1, 0]`; L0 `[0, 8]` latest `4k/5/5/5/5`; L+1 `[7, 9]` latest `4k/5/5/5/r3K`:
    `hasLegalMove = false`, `noMoves` → `{ winner: 1, reason: 'stuck' }`; without the rook → `{ winner: null, reason:
    'noMoves' }`.
30. **Move limit and quiet.** `ply = 999`, any certain move → `moveLimit`; `quiet = 299`, a knight move without
    capture → `quiet`, and `reasonText('quiet')` is the multiverse text.

### UI and performance

31. **Layout at the start.** `S`: 25 cells; one board labelled "L0 T1 ○ · must move"; one `wood` area and one `frame`
    area; `height ≥ 0.75·width`; `focus.zoom` = 1 … 4.
32. **Layout after test 4.** Rows L0 above L+1 (White's below); a connector from the right edge of the L0 T1 ○ board to
    the left edge of the L+1 T1 ● board; row label "new"; `wood` halo on L+1, `river` on L0.
33. **Focus identity.** For the states before and after a Missed roll (18) and a Measure (24) `layout.focus` is the same
    object; after a move that changes the present it is a different one.
34. **Black at the bottom.** `blackView: true`: rows in reverse order, `(0)a1` drawn at the top right of its board,
    columns still increasing in v from left to right.
35. **Performance.** Fuzz: 60 random plies × 2 seeds under 5 s; `generate` for a start world under 0.1 ms (median of
    1000); `layoutOf` for 5 rows × 5 boards under 2 ms.
36. **Invariants** (added to the variant's spec, on every state of tests 1–30): `solidExtra` equal in all worlds;
    ids on latest boards unique per world; `sq`/`board` consistent; history ids equal their squares.

---

## 8. Deviations from the official game (say them in `docs/variants.md`)

1. Capture the king instead of checkmate; the danger line replaces "you are in check"; no legal move while a king can
   certainly be captured loses, otherwise it is a draw.
2. Official small boards only; the 8×8 *Standard* start would be a separate catalogue entry built from the same module
   (a factory with N = 8), with its own capacity.
3. At most 1–2 new timelines per player; a king in the past can still be captured after that.
4. History window of two turns; older boards are sealed.
5. Moves inside a turn cannot be taken back; the turn ends by itself when no board is left.
6. Odd starts only (one L0); no Turn Zero, no −0/+0 variants, no unicorns, dragons, brawns, princesses.
7. Quantum: the rules of section 1.8.

## 9. Small open points

- The core's note text for the structural roll (5.4) is generic; a later UI change could let a variant word notes.
- If players ask for pass = link in the multiverse, it needs a core hook (`applyMiss`, E §9.5); the rest of this
  design would not change.
- The order of the four setups in the new-game dialog could put *Very small and open* first for newcomers.
