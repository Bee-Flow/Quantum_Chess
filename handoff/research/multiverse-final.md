# Multiverse chess (Quantum 5D): final specification

Variant id `multiverse`, category `dimensions`, catalogue name *Multiverse chess (5D)* (`src/variants/catalog.js`).

**Status: final and authoritative** (2026-09-25), **revised after two adversarial reviews** (section 15 lists every
finding and what was done). It replaces `multiverse.md`, `multiverse-design-playable.md`,
`multiverse-design-faithful.md` and `multiverse-design-quantum.md` wherever they differ. Those remain useful as
background (their worked examples, tactics and measurements are referred to below).

How it was made: the three judges (player, engineer, physicist) scored the three designs. This spec takes the engine
model and the quantum rules of the **quantum design** (one structural rule, history as real squares, `allowQuantum`)
and grafts on the fidelity machinery of the **faithful design** (every official piece, 21 official setups including
even, three-row and Turn Zero starts, the travel-reach option, the exact "cannot finish the turn" test with the
official checkmate / stalemate split, the official 5D check test, rook castling rights, the 5d-chess-js cross-check)
and the plain player-facing parts of the **playable design** (frame texts, setup order, pinned core behaviours). Every
must-fix item of the three judges is resolved; section 14 is the index.

Everything here was validated on a new prototype that runs on a copy of the **current working-tree core** plus the
one proposed hook (`handoff/tmp/mv-final/`, section 13): 120 scenario checks pass, the generator matches 5d-chess-js
1.2.1 on 2.2 million reference moves (apart from the documented deviations), and the fuzz, size, UI-cost and computer measurements quoted below are
**measured** (Node 22 on the development machine, an AMD Ryzen AI Max+ 395; a mid-range phone is 3 to 5 times
slower). The review fixes of section 15 were validated on a copy of that prototype with the fixes applied
(`handoff/tmp/mvf-review/`): 140 scenario checks pass, including every new one of section 10.

Sources: `research/multiverse-rules.md` (R), `research/multiverse-pieces.md` (P), `research/multiverse-engines.md`
(E), the three designs (DQ, DF, DP), `handoff/CORE-CHANGES.md` (CC), `handoff/LEAD-DECISIONS.md` (L1-L5),
`handoff/IMPLEMENTING.md`, `docs/rules.md`, and the code in `src/variants/core/` and `src/variantplay/`.

---

## 0. Decisions at a glance

| # | Question | Decision |
|---|---|---|
| F1 | Base | The quantum design's engine and quantum rules, with the faithful design's fidelity grafted on. |
| F2 | The three principles | **Boards are certain, pieces are quantum. Timelines are AND, possibilities are OR. A move always makes its boards; the dice only decide what happens to the piece.** They are the core of the rules card and the tutorial. |
| F3 | Structure of a Missed or linked move | **The structure follows the key in every idle world** (`applyMiss` ignores `info.hit`): the source board passes, a jumped-to board passes, a branch opens its timeline as an untouched copy. The only exception is a travel or a merge onto an enemy royal piece on a past board: it opens no row in any outcome. The present, the must-move boards and the end of the turn never depend on dice. |
| F4 | Pieces | Every official piece: king, queen, rook, bishop, knight, pawn, unicorn, dragon, princess, brawn, common king, royal queen. |
| F5 | Setups | 21 official setups (section 2.2). **Default: Small 5×5**; the list starts with Small ("quick, best on phones"), Very Small – Open ("the easiest start"), Standard 8×8 ("the real game; best on a laptop"). |
| F6 | Limits | New timelines per player 1 / 2 / 3 (default 3). Travel reach "auto" (2 turns on boards up to 5×5, 4 turns on larger boards), 2 or 4. Budget **8 per side on every setup**. |
| F7 | Turn | The official turn: move once on every "must move" board (the present), optionally on your other boards, then Submit turn; the turn ends by itself when no board is left. |
| F8 | Winning | Capture a royal piece (king or royal queen) on any board, past boards included. |
| F9 | 5D check | The danger line is the chance that the opponent can capture one of your royal pieces with **one move (or converging merge)** if you passed your must-move boards now: the official check test, with real moves. It is the same number before and right after Submit. Threatened royal squares are tinted and joined to the attacker by a line. |
| F10 | Cannot finish the turn | Detected at once by a structural test (`stateResult`, exact apart from three rare one-sided cases, 6.13). **At the start of a turn** it is the official split: **checkmate** (loss) when a royal piece of yours can be captured for certain (danger 100 %, one move or merge), otherwise **stalemate** (draw). **A move after which you cannot finish your own turn loses** (reason `stranded`: in the original such a turn cannot be submitted, and a draw here would be an escape from lost positions). Such a move asks for confirmation first (`moveWarning`, which warns only about your own turn). |
| F11 | Measure | Only a part standing on a board you may play now; **that board passes**. One measure code per allowed part. |
| F12 | Split and merge | Both halves of a split land on **one board** (your own, another timeline's latest board, or a past board, which opens one timeline). A merge starts from two parts on **one board** and may land on any square both reach. A part that moves onto its other part joins it without a roll (core Q14). |
| F13 | The past | History boards are real squares with real pieces (a ring per timeline). The past is drawn with its ghosts, landing on it is a roll, paths through it can be linked, new timelines copy ghosts as **twins**, and after a merge the past remembers both paths (budget) until those boards are sealed. |
| F14 | Castling | One board, no check test, certain-only (core Q2); a rook keeps its right only while it is unmoved **on the same square in every possibility** (`unifyWorlds`). |
| F15 | Codes | Move keys use the 5dpgn style with U+2212 for negative timelines (`(−1T3)b1-c3`); ASCII `-` only separates a physical move; Submit is `submit`. Square names are `(0)c3`, `(+1)c3`, `(−0)c3`, history `(0)~3c3`. The move list shows absolute text through `codeText(code, record)`. |
| F16 | Computer | `aiView` (must-move boards first, plus the branches that move the present back; the state itself when the view has no move), `replySide` = no answer inside its own turn, 5D terms in `evaluate` (check, threat, a hanging-piece term for the boards it has already played, timelines, contempt), `stateResult` so it never strands itself, a per-turn time share, and a bounded synchronous stretch (section 7). |
| F17 | Core and app changes | One new core hook (`allowQuantum`). Small generic app/AI items: strand warning, packed saves with a "not saved" notice, undo that replays once, AI yield points, time share and an exact-view flag, `codeText` record argument, Split-mode pair filter, focus box, zoom cap and touch panning / pinch for touch screens, view preset, turn-wide last-move marks, no "Flip board", a threat style for outlines (section 7). |
| F18 | Classic end rules (L1) | `escapeRule` off (multi-move turns; the stuck test is the 5D counterpart), `bareKingsDraw: false` (kings can still take each other through time), `drawsWait: true`. |

---

## 1. Player rules (complete)

### 1.1 The multiverse

- Each **row is a timeline**; **time runs to the right**, for both players. Most setups start with one timeline,
  **L0**, holding one board.
- A board is a **White board** (marked ○: White is to move there) or a **Black board** (●). Along a timeline they
  alternate: T1 ○, T1 ●, T2 ○, T2 ● … **T** is the turn number.
- Only the **latest board of a timeline** can be played, and only by the player whose board it is. Every move adds
  boards: the board you moved on gets a successor with your move made (now your opponent's board), and the old board
  stays behind as **the past**. The past never changes.
- Each timeline keeps its latest board and the boards of the last **2 turns** (by default on boards up to 5×5) or
  **4 turns** (larger boards): the **travel reach**, an option. Older boards are **sealed**: they are not drawn, nothing can travel to or
  through them, and a king that stood there is safe there.

### 1.2 Your turn

- **The present** is the earliest latest board among the **active** timelines (1.3). A band marked **Now** shows it.
- **Must move** boards (gold halo, frame text "must move"): your latest boards at the present. You move once on
  each of them.
- **Optional** boards (blue halo, "optional"): your other latest boards. You may move on them, once each.
- A board takes part in at most one move per turn: after you moved on it, or a piece of yours jumped onto it, it is
  your opponent's board.
- **The turn ends by itself** when you have no board left. When only optional boards are left, press **Submit turn**
  (or keep moving on them). At the start of a turn there is always a must-move board, so there is no pass.
- Each move is played and rolled at once. **Undo** takes a move back, but a roll never changes: the same move in the
  same position gives the same result, and using undo marks the game as assisted (docs/rules.md 8).

### 1.3 Travelling through time and timelines

- Pieces move in **four directions**: files, ranks, **time** and **timelines**. One step back in time is one whole
  turn (T5 ○ to T4 ○), so a piece always lands on a board where it is its own player's move. One step across is the
  neighbouring timeline at the same turn.
- **Jump**: landing on the latest board of another timeline moves the piece there; both timelines get a new board.
- **Branch**: landing on an older board (of any timeline, also your own) **opens a new timeline**: the old board is
  copied, your piece arrives on the copy (capturing what stands there), and your opponent moves there next. Only the
  travelling piece comes along; your own timeline gets a new board without it.
- White's new timelines are numbered **+1, +2, +3** and drawn below; Black's **−1, −2, −3** drawn above. Setups with
  two starting timelines call them **−0** and **+0**; Timeline Marauders starts with −1, 0 and +1.
- Each player may open **1, 2 or 3 timelines** (option). After that, jumps stay possible, and a **king in the past
  can still be captured** (that ends the game and opens nothing).
- **Active timelines.** The starting timelines are always active. Your *n*-th new timeline is active while your
  opponent has opened at least *n − 1*. Inactive timelines can be played but do not count for the present; opening a
  timeline can make one of the opponent's timelines active again.
- **The present moves** forward when every must-move board has been played, and **back** when someone opens an
  active timeline in the past (its first board is the opponent's, so your remaining must-move boards become
  optional) or reactivates one of the opponent's timelines (its latest board is then the earliest; if that board is
  yours, it becomes your must-move board and you must move there before you can submit).

### 1.4 The pieces

Every piece keeps its chess pattern in all four directions ("axes": file, rank, time, timeline).

| Piece | Moves |
|---|---|
| Rook | any distance along one axis |
| Bishop | any distance along two axes at once, equally far in both |
| Unicorn | any distance along three axes at once (so never within its own board) |
| Dragon | any distance along all four axes at once (never within its own board) |
| Queen | any distance along one to four axes, equally far in each |
| Princess | rook or bishop |
| Royal queen | like a queen, and royal like a king |
| King | one step along one to four axes; royal |
| Common king | like a king, but not royal; never castles |
| Knight | two steps along one axis and one along another; it jumps |

A sliding piece needs every board on its way to exist and every square on its way to be empty (read on the boards it
passes, as they were then). Your own pieces block you, also your own past self.

### 1.5 Pawns and brawns

- White goes **up**: one rank forward on its board, or **one timeline up** (towards Black's timelines) at the same
  turn. Black goes down.
- A pawn or brawn that never moved may make a **double step** in either direction (the square in between empty; for
  the timeline double step the board in between must exist).
- Captures: diagonally forward on the board, or **one timeline forward and one turn back or ahead** on the same
  square. Never straight ahead, never along time alone.
- A **brawn** also captures one step along exactly two axes when it goes forward along at least one of them and
  backward along none: sideways plus one timeline forward, one rank forward plus one timeline forward, or one rank
  forward plus one turn back.
- **Promotion**: a pawn or brawn that reaches its last rank becomes a **queen** at once (the official rule; a brawn
  can also promote by a capture onto another board).
- **En passant** works on one board only, on the move right after the enemy's physical double step, as in chess, and
  like everywhere in Quantum Chess only when it is possible in every possibility.

### 1.6 Castling

On one board, with a king and a rook that never moved: the two squares next to the king towards the rook and every
square up to the rook are empty; the king moves two squares towards the rook and the rook lands on the square the king
crossed. There is no check, so castling out of, through or into danger is allowed. It is never rolled and is possible
only when it is possible in **every** possibility; a rook that was ever not 100 % on its square has lost the right for
good (a partial slide, a split, a link).

### 1.7 Winning and drawing

- **Capture a king or royal queen** of your opponent on any board: a latest board, or a past board by travelling
  there. A player can have several kings (a king that travels meets its own past self); losing any one loses.
- **King danger** (the line under the board) is the chance that your opponent could capture one of your royal pieces
  with one move if you ended your turn now (your must-move boards passed). At 100 % this is 5D's **check**. The
  threatened squares are tinted red, also on past boards, with a line to the attacker, and the Submit button shows the
  danger that submitting leaves.
- **Cannot finish your turn** (no order of your moves plays every must-move board: typically one you cannot move on,
  onto which nothing of yours can still arrive, while no move sends the present back): the game ends at once.
  - If this is so **at the start of your turn** (your opponent's turn left you there), you **lose** when a royal
    piece of yours can be captured for certain (**checkmate**), otherwise it is a **draw** (**stalemate**), as in 5D.
  - If **your own move** in this turn put you there, you **lose** (**stranded**): the original game would not let
    you submit such a turn, so it cannot be a way out of a lost position. A move that would do this asks for
    confirmation first ("After this move you cannot finish your turn: you lose").
  - A move after which **your opponent** cannot finish their turn and the game is drawn says so before you play it;
    one that checkmates them does not ask.
  - The official stalemate (not in check, but every turn would leave a king in check) is **not** a draw here: there
    is no check rule, so you play your turn and your king can be taken. Stalemate here means only a turn that cannot
    be finished at all.
- **Draws** also: 300 moves in a row without a capture or a pawn or brawn move, 1,200 moves in the game, agreement.
  Only kings left is **not** a draw here: kings can still reach each other through time.

### 1.8 Quantum in the multiverse

All Quantum Chess rules apply (split, merge, measure, land = roll, pass = link, solid kings and pawns, budget 8, at
most 64 possibilities, the game-end roll). The multiverse adds:

1. **Boards are certain, pieces are quantum.** Which timelines exist, their boards, the present and whose turn it is
   are the same in every possibility. Only what stands on the boards (now and in the past) can be uncertain.
2. **Timelines are AND, possibilities are OR.** Every timeline is real and you play on all of them; of the
   possibilities only one is real. A piece can be 50 % on one timeline and 50 % on another; a timeline is never
   "50 % there".
3. **A move always makes its boards.** The dice decide what happens to the piece, never which boards appear. A
   Missed move still uses its board (and still opens its timeline, with nobody arriving); a Measure uses the board of
   the part you measure.
4. **Ghosts travel.** A part of a ghost may jump or travel into the past. Where the piece really stood it arrives;
   elsewhere the new boards appear without it and it stays home: the piece is now spread over two timelines, linked.
5. **Solid pieces**: kings, royal queens, common kings, pawns and brawns. Knights, bishops, rooks, queens,
   princesses, unicorns and dragons can split.
6. **Splits land on one board**: yours, the latest board of another timeline (a *jump split*: both boards are used),
   or a board in the past (a *time split*: one new timeline opens, with your piece on two squares of it). **Merges
   start from one board** and may land anywhere both parts reach. A part that moves onto its own other part joins it
   without a roll.
7. **Measure** a ghost only through a part on a board you may play now; that board passes. The result settles the
   piece everywhere: all its parts, its twins and its past.
8. **The past is quantum.** Past boards show ghosts with their chances. Landing on such a square is a roll; a path
   through them may be linked. When a new timeline copies a board with a ghost, the copies are **twins**: separate
   pieces, each present exactly where the original stood, so finding one settles all.
9. **The past remembers.** After a merge the past still shows both paths, so they keep counting for your budget until
   those boards are sealed (at most the travel reach). The move list says until when.

### 1.9 What the player does (the flow)

1. The view zooms to the gold "must move" boards; "Submit turn (move on 2 more boards first)" is disabled.
2. Tap a piece on a gold or blue board: dots on every board it can reach (its board, other timelines' latest boards,
   faded past boards). Dashed outlines one column to the right show where your new boards will appear.
3. Tap a target: a certain or linked move plays at once; an uncertain one opens the roll box. New boards appear in
   every outcome; a new row slides in with a connector and the label "new".
4. Split: Split mode, the piece, then two targets; after the first target only squares that can pair with it are
   marked. Merge: a part, the other part on the same board, then the target. Measure: tap a part on a gold or blue
   board.
5. After the last must-move board the turn passes by itself, or "Submit turn" lights up while optional boards remain.
6. The squares of every move of the opponent's last turn and of your turn so far stay marked (also after a Submit),
   on the boards those moves produced, together with the travel arrows.

---

## 2. Setup and options

### 2.1 Options

```js
options: [
	{ id: 'setup', type: 'choice', label: () => t('quantumchess', 'Start position'), default: 'small',
	  values: SETUP_ORDER.map((id) => ({ id, label: SETUP_LABELS[id] })),         // 2.2, in this order
	  describe: (v) => SETUP_DESCRIPTIONS[v]() },                                // U11
	{ id: 'timelines', type: 'choice', label: () => t('quantumchess', 'New timelines per player'), default: '3',
	  values: [
		{ id: '1', label: () => t('quantumchess', 'One') },
		{ id: '2', label: () => t('quantumchess', 'Two') },
		{ id: '3', label: () => t('quantumchess', 'Three') } ] },
	{ id: 'reach', type: 'choice', label: () => t('quantumchess', 'How far back pieces can travel'), default: 'auto',
	  values: [
		{ id: 'auto', label: () => t('quantumchess', 'Automatic (2 turns on small boards, 4 on large ones)') },
		{ id: '2', label: () => t('quantumchess', '2 turns (lighter)') },
		{ id: '4', label: () => t('quantumchess', '4 turns (as far as real games go)') } ] },
	{ id: 'view', type: 'choice', label: () => t('quantumchess', 'Drawn at the bottom'), default: 'white',
	  values: [
		{ id: 'white', label: () => t('quantumchess', 'White') },
		{ id: 'black', label: () => t('quantumchess', 'Black') } ] },
],
```

`setup(options)` reads `n` and the rows from the setup, `h = 2 × reach` (reach "auto": 2 when n ≤ 5, else 4),
`m = Number(options.timelines)`. `view` only changes the drawing (section 9.9). A reach of 6 turns is not offered:
reach 4 already covers every travel decoded from real games (P 6.3) and cuts under 1 % of the moves of random play on
8×8 (section 13), while 6 would add half again to the state and the drawing.

### 2.2 Setups (5DFEN, ranks top to bottom; every K, R, P, W starts unmoved)

Order of the list = order of this table. Labels are plain language; `describe` gives the official name and size.

| id | Label (describe) | n | Start lines | Position(s) |
|---|---|---|---|---|
| `small` | Small: quick, best on phones (official "Small", 5×5) | 5 | 0 | `kqbnr/ppppp/5/PPPPP/KQBNR` |
| `verysmallopen` | Very small and open: the easiest start, learn here (official "Very Small – Open", 4×4) | 4 | 0 | `nbrk/3p/P3/KRBN` |
| `standard` | Standard: the real game, long; best on a laptop (8×8) | 8 | 0 | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR` |
| `smallcentered` | Small with the king in the centre (5×5) | 5 | 0 | `rnkqr/ppppp/5/PPPPP/RQKNR` |
| `verysmall` | Very small (4×4) | 4 | 0 | `nbrk/pppp/PPPP/KRBN` |
| `noqueens` | Simple, no queens (7×7) | 7 | 0 | `rnbknbr/ppppppp/7/7/7/PPPPPPP/RNBKNBR` |
| `turnzero` | Standard with turn zero: Black may travel to T0 (8×8) | 8 | 0, from T0 ● | Standard on T0 ● (history) and T1 ○ |
| `twotimelines` | Standard on two timelines, −0 and +0 (8×8) | 8 | −0, +0 | Standard on both |
| `princess` | Standard with princesses (8×8) | 8 | 0 | `rnbskbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR` |
| `reversed` | Reversed royalty: the queen is royal, the king is not (8×8) | 8 | 0 | `rnbycbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBYCBNR` |
| `defended` | Defended pawn (8×8) | 8 | 0 | `rqbnkbnr/pppppppp/8/8/8/8/PPPPPPPP/RQBNKBNR` |
| `halfreflected` | Half reflected (8×8) | 8 | 0 | `rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR` |
| `justknights` | Kings and knights (5×5) | 5 | 0 | `n1kn1/5/5/5/1NK1N` |
| `justunicorns` | Kings and unicorns (5×5) | 5 | 0 | `1u1uk/5/5/5/KU1U1` |
| `justdragons` | Kings and dragons (5×5) | 5 | 0 | `2ddk/5/5/5/KDD2` |
| `justbrawns` | Kings and brawns (5×5) | 5 | 0 | `wwwwk/5/5/5/KWWWW` |
| `kingofkings` | King of kings: common kings (5×5) | 5 | 0 | `cckcc/5/5/5/CCKCC` |
| `royalqueens` | Royal queen showdown (6×6) | 6 | 0 | `4y1/6/6/6/6/1Y4` |
| `excessive` | Excessive: three kings each, every piece (7×7) | 7 | 0 | `kruqdrk/rnbknbr/ppppppp/7/PPPPPPP/RNBKNBR/KRUQDRK` |
| `marauders` | Timeline marauders: three timelines (5×5) | 5 | −1, 0, +1 | (−1) `wrkrw/1www1/5/5/5` · (0) `w1w1w/5/5/5/W1W1W` · (+1) `5/5/5/1WWW1/WRKRW` |
| `invasion` | Timeline invasion: two timelines (5×5) | 5 | −0, +0 | (−0) `nbkrb/ppppp/5/5/PPPPP` · (+0) `ppppp/5/5/PPPPP/NBKRB` |

Letters: K king, C common king, Y royal queen, Q queen, S princess, R rook, B bishop, N knight, U unicorn, D dragon,
P pawn, W brawn. White (side 0) moves first. The describe line also shows the start of the pieces' texts for the
unusual pieces ("Unicorns move along three axes at once").

---

## 3. Limits

| Limit | Value | At the limit |
|---|---|---|
| New timelines per player | 1, 2 or 3 (default 3) | quiet and capturing branches are not generated; a branch onto an enemy royal piece still is (it ends the game, no row opens); jumps stay possible |
| Rows (timelines) | ≤ 7 single start, ≤ 8 even start, ≤ 9 three-row start | follows from the cap |
| Travel reach | 2 or 4 turns ("auto": 2 on n ≤ 5, 4 on n ≥ 6) | older boards are sealed: no target, a ride stops there |
| Budget | **8 per side, every setup** (docs/rules.md 7.1) | splits refused; a link over the limit is rolled (its Missed still builds the boards) |
| Possibilities | 64 | follows from the budget (the opponent never raises yours, 8.6) |
| Squares per piece | 4 | core `MAX_LOCATIONS` |
| Moves without capture or pawn / brawn move | 300 | draw (`quiet`) |
| Moves in the game | 1,200 (Submit counts) | draw (`moveLimit`) |
| Saved record | packed (7.2 H8): computer games measured 9–91 KB; a 64-world state packs to 49–142 KB; worst case (1,200 plies ending in a 64-world 8×8 state) about 520 KB | "This game could not be saved on this device" notice (7.2 H8) |

---

## 4. Turn structure (exact)

### 4.1 Time

- Half-turn index **v = 2·T + c**, c = 0 White to move (○), 1 Black (●). T1 ○ = 2, T1 ● = 3, T0 ● = 1.
- `T(v) = v >> 1`, colour `v & 1`. One step of a piece in time changes v by 2.

### 4.2 Lines and rows

- Internal line number **l**. Single start: L0 = 0, White's k-th new line +k, Black's −k. Three-row start: −1, 0, +1,
  then White 1 + k, Black −1 − k. Even start: −0 is l = −1, +0 is l = 0, White's k-th new line is +k, Black's is
  l = −1 − k (shown "−k"). One step across is always ±1 in l (−0 and +0 are neighbours).
- Storage row **u** (static, so square names are static): single and three-row starts `u(l) = l ≥ 0 ? 2l : −2l − 1`;
  even starts `u(−1) = 9` ("−0"), `u(0) = 10` ("+0"), `u(l > 0) = 2l`, `u(l ≤ −2) = −2l − 3` (the zig-zag of the shown
  number). `LAB[u]` = `0, −1, +1, −2, +2, −3, +3, −4, +4, −0, +0` for u = 0 … 10 (U+2212 minus).
- **The map is used only inside the capacity**: a line outside `[l0 − m, l1 + m]` never exists, and generation rejects
  such a target line before mapping it (`uOf` itself returns −1 outside `[l0 − 3, l1 + 3]`, the largest capacity).
  Without this the even-start zig-zag wraps: `u(5) = 10` is the row of +0 and `u(−6) = 9` the row of −0, so a knight
  on +3 would "jump" onto +0 (test S21).
- Per row: `tl[u] = [st, en, pu, pv]` (first and latest v; the parent board's row and v; null for starting rows),
  or null when the row does not exist. A row exists in every possibility or in none.
- Created counts `c = [cW, cB]` (new lines of each side).

### 4.3 Which boards exist

- Board (u, v) **exists** iff `tl[u]` exists and `max(st, en − h) ≤ v ≤ en`; `v = en` is the **latest** board, the
  others are **history**; older boards are **sealed**; boards before `st` never existed on that row (Turn Zero starts
  with `st = 1`).
- History board v sits in ring slot `1 + (v mod h)` (the h boards `en − h … en − 1` have distinct residues), so a
  history board keeps its squares for its whole life (last-move marks and records stay right).

### 4.4 Active, present, playable, must move, optional, Submit

With `[l0, l1]` the starting line range (`[0,0]`, `[−1,0]` even, `[−1,1]` three rows) and side to move `s`:

- `active(l)` ⇔ `l0 ≤ l ≤ l1`, or `l > l1` and `l − l1 ≤ cB + 1`, or `l < l0` and `l0 − l ≤ cW + 1`.
- **present** `P` = min `en` over the existing active rows.
- `playable(side, u)` ⇔ row u exists and `en(u) & 1 = side`.
- `mandatory(s)` = active rows with `en = P`, if `P & 1 = s`; otherwise none. `optional(s)` = `playable(s)` minus
  `mandatory(s)`.
- **Submit** (code `submit`) is legal ⇔ `P & 1 ≠ s`. It sets `x.s = 1 − s` and `x.t = 0`.
- **Automatic end**: after every action except Submit, if no row is playable for `s`, `x.s = 1 − s` in the same
  action.
- **Actions this turn** `x.t`: every action except Submit adds 1 (in every world: `apply` and `applyMiss` both end
  with the automatic end, which counts it); Submit and the automatic end set it to 0 when the turn passes. So
  `x.t = 0` exactly at the start of a turn (4.7: checkmate / stalemate there, `stranded` later).
- All of this reads the skeleton only, which is equal in every world, so it happens in every possibility.

### 4.5 What each action builds (every possibility)

The piece stands on the latest board of row u (v = en(u)) and lands on (u2, v2). "Idle" worlds are those where the
action did not take effect (the piece absent, its path blocked, the Missed outcome, every world of a Measure).

| Action | Condition | Effect in moving worlds | Effect in idle worlds (`applyMiss`) |
|---|---|---|---|
| physical | u2 = u, v2 = v | row u advances with the move made | row u advances |
| jump (`>`) | v2 = en(u2), (u2, v2) ≠ (u, v) | u and u2 advance; the piece leaves u and lands on u2 (capturing) | u and u2 advance |
| branch (`>>`) | v2 < en(u2) (any row, also u) | new row for the mover `[v2 + 1, v2 + 1, u2, v2]`, a copy of (u2, v2) with the piece on the target (capturing the copy there); u advances without the piece; `c[mover] += 1` | the same new row as an untouched copy; u advances; `c[mover] += 1` |
| branch onto an enemy royal piece | the target on (u2, v2) holds an enemy king or royal queen | u advances, the piece leaves, the mover wins (`x.k`); **no row** | u advances; no row |
| split | both targets on one board (u2, slot) | as the quiet move to the first target: physical, jump (both boards pass) or time split (one new row copies the past board, the piece on two squares of it) | the same boards |
| merge | both parts on one latest board; target anywhere | as the move from the first part to the target | the same boards (a target on a past board holding an enemy royal piece: no row, as the royal branch row; royal pieces are solid, so this is the same in every world) |
| measure | the part on a board you may play | – | that part's row advances |
| submit | `canSubmit` | `x.s = 1 − s` | – |

Then the automatic end. The travelling piece becomes "moved" (`k0 → k`, `r0 → r`, `p0 → p`, `w0 → w`); copied
pieces keep their state from the copied board. En passant never travels (a new row starts with no en passant square).

### 4.6 Branch permission

A branch is generated iff `c[mover] < m`, or its target holds an enemy royal piece (royal pieces are solid, so this is
the same in every possibility). Rows therefore stay within the capacity of section 4.2.

### 4.7 Results

| Situation | Result | Reason |
|---|---|---|
| a royal piece is captured (in the chosen outcome; the core's game-end roll settles disagreeing worlds) | the capturer wins | `king` |
| the side to move cannot finish its turn (6.13) at its start (`x.t = 0`) and can lose a royal piece for certain | the other side wins | `checkmate` |
| the same at the start of the turn, otherwise | draw | `stalemate` |
| the side to move cannot finish its turn after its own action in this turn (`x.t > 0`) | the other side wins | `stranded` |
| no legal action at all (`noMoves`) | as the three rows above | `checkmate` / `stalemate` / `stranded` |
| 300 quiet plies / 1,200 plies | draw | `quiet` / `moveLimit` |

---

## 5. Pieces and vectors (dx, dy, dT, dL)

x = file, y = rank, T in whole turns (v changes by 2·dT), L in lines. Vectors with **dL = 0 and dT > 0** are left out
(the source is always a latest board, so they never find a board). Written for White; Black negates dy and dL of
pawns and brawns only (every other set is symmetric). `directions`, `allDirections` and `symmetric` are the helpers
of `core/topology.js`.

| Types (live) | Piece | Vectors | Count | Kind |
|---|---|---|---|---|
| `r0`, `r` | rook | `directions(4, 1)` | 7 | ride |
| `b` | bishop | `directions(4, 2)` | 20 | ride |
| `u` | unicorn | `directions(4, 3)` | 28 | ride |
| `d` | dragon | `directions(4, 4)` | 16 | ride |
| `s` | princess | rook + bishop | 27 | ride |
| `q`, `y` | queen, royal queen | `allDirections(4)` | 71 | ride |
| `k0`, `k`, `c` | king, common king | `allDirections(4)` | 71 | leap |
| `n` | knight | `symmetric([2, 1], 4)` | 40 | leap |

- **Leap**: the target board must exist (a target line outside `[l0 − m, l1 + m]` never exists, 4.2) and the target
  square be empty or hold an enemy.
- **Ride**: k = 1, 2, …: target board (l + k·dL, en + 2k·dT) and cell (x + k·dx, y + k·dy); stop when the board does
  not exist (also sealed) or the cell is off the n×n board; empty → quiet move, continue; enemy → capture, stop; own
  piece (also a history copy of an own piece) → stop. Squares are read on the boards passed, as they were then.

**Pawn and brawn** (White: forward y = +1, forward L = −1; Black negates both):

| Move | Vectors | Condition |
|---|---|---|
| step | (0, +1, 0, 0) physical, (0, 0, 0, −1) jump or branch | target empty |
| double step (unmoved `p0` / `w0`) | (0, +2, 0, 0) over (0, +1, 0, 0); (0, 0, 0, −2) over (0, 0, 0, −1) | both squares empty, the middle board exists |
| capture | (±1, +1, 0, 0), (0, 0, +1, −1), (0, 0, −1, −1) | target holds an enemy |
| brawn capture | (±1, 0, 0, −1), (0, +1, 0, −1), (0, +1, −1, 0) | target holds an enemy |
| en passant (kind `ep`, certain-only) | (±1, +1, 0, 0) onto `x.ep[u]` on the latest board | the enemy pawn or brawn beside it made a physical double step with the move that produced this board |

- Promotion: any pawn or brawn move with dy ≠ 0 whose target rank is the last rank (White n, Black 1) makes a queen
  (key suffix `=Q`, `promo: 'q'`), whatever its kind: physical, jump or branch. The brawn's capture (0, +1, −1, 0)
  always lands on a past board, so it promotes as a branch: the queen stands on the new row (test S14b). Pawn
  timeline moves and T–L captures (dy = 0) never promote.
- A physical double step sets `x.ep[u]` to the skipped cell (`y·8 + x`); every advance of that row clears it.

**Castling** (kind `castle`, certain-only by core Q2): a `k0` on the latest board; towards each side, the two squares
next to the king are on the board and empty, and the first piece met further on is an own `r0`; the king moves two
files, the rook to the square the king crossed; both become `k` / `r`. Key = the king's move, e.g. `(0T5)a1-c1`.
The common king never castles.

**Types** (`defineVariant`): all with `moves: []` (the variant generates).

| Type | Name | royal | solid | splittable | value | glyph | `resetsQuiet` |
|---|---|---|---|---|---|---|---|
| `k0`, `k` | King | yes | yes | no | 0 | sprite `k` | – |
| `y` | Royal queen | yes | yes | no | 0 | text `Y`, circle | – |
| `c` | Common king | no | yes | no | 350 | text `C`, circle | **false** |
| `q` | Queen | | | yes | 1400 | sprite `q` | |
| `s` | Princess | | | yes | 800 | text `S`, circle | |
| `r0`, `r` | Rook | | | yes | 350 | sprite `r` | |
| `b` | Bishop | | | yes | 500 | sprite `b` | |
| `n` | Knight | | | yes | 450 | sprite `n` | |
| `u` | Unicorn | | | yes | 550 | text `U`, circle | |
| `d` | Dragon | | | yes | 350 | text `D`, circle | |
| `p0`, `p` | Pawn | | yes | no | 100 | sprite `p` | default (yes) |
| `w0`, `w` | Brawn | | yes | no | 140 | text `W`, circle | default (yes) |

History types are `'h' + type` (`hk0`, `hq`, `hw0` …): same name, glyph, royal and solid flags; not splittable;
value 0; `resetsQuiet: false`. They never move (generation reads latest boards only). Values follow P 3.x / 8
(community values plus estimates).

---

## 6. Engine mapping

### 6.1 Declaration

```js
const spec = {
	id: 'multiverse', category: 'dimensions',
	sides: [
		{ id: 'w', name: () => t('quantumchess', 'White'), color: 'white', rotate: 0 },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black', rotate: 0 },  // time never runs right to left
	],
	topology, types, options, setup, rules,                     // 6.2, 5, 2.1, 2.2, 11.1
	generate, apply, applyMiss, allowQuantum, unifyWorlds,      // 6.7 - 6.11
	solidExtra, nextSide: (w) => w.x.s, actions, worldResult,   // 6.12
	stateResult, noMoves, reasonText,                           // 6.13
	recordInfo, infoText, codeText, sideInfo, moveWarning,      // 6.14
	lastMoveMarks,                                              // 6.14, H11
	budgetRule: () => ({ limit: 8 }),
	evaluate, aiView, replySide, aiTimeShare,                   // 6.15
	aiViewExact: true,                                          // 6.15, H2
	layoutOf, flipBoard: false,                                 // 9, H12
	escapeRule: false, bareKingsDraw: false, drawsWait: true,   // L1 (F18)
	maxPly: 1200, quietPlies: 300,
}
export default defineVariant(spec)
```

`escapeRule` is already false by default here (`nextSide`/`actions`), `bareKingsDraw` too; they are written out
because L1 asks the final spec to decide. Not used: `extraMoves`, `filterMoves`, `afterMove`, `onCapture`,
`measured`, `passWhenStuck`, `candidateMoves`, `drops`, `isOut`. `specialMoves` stays true (castling, en passant).

### 6.2 Static topology, square encoding, names

- Constants: `ROWS = 11` (u 0 … 10), `HMAX = 8` (reach 4), `SLOTS = 9` (slot 0 = latest board, 1 … 8 history), cells
  of 8×8 (smaller boards use the lower-left n×n part).
- **Square**: `sq = ((u·9) + slot)·64 + y·8 + x`; topology size 11·9·64 = **6,336**.
- `makeTopology({ coords, name, cell })`, coords `[x, y, slot, u]`.
- **Names** (no `-`, `|`, `?`, `@`, `=` or space): latest board `(0)c3`, `(+1)c3`, `(−1)c3`, `(−0)c3`, `(+0)c3`;
  history slot k: `(0)~3c3`. They appear in split, merge and measure codes and in measure outcomes ("On (+1)c3").
  The move list shows absolute text (`(0T1)a3`) through `codeText` (6.14).
- The static `cell()` is a plain grid; it is never drawn (`layoutOf` always exists).

### 6.3 Piece ids

- `id = ((ord(u)·(h + 1)) + slot)·n² + y·n + x`, where `ord(u)` is the row's **creation index** (`x.ord`, `x.nr`), so
  ids stay compact whatever the row numbers.
- **Live pieces**: a piece gets the slot-0 id of its cell when its row is created (setup, or a branch copy); it keeps
  that id when it moves, jumps, travels, promotes, splits; captured: `sq = −1`. Ids are never reused.
- **History pieces**: a history cell's piece has that cell's id (slots 1 … h); the snapshot copies type `'h' + t` and
  side; when the slot is reused h boards later, its ids are reused for the new board.
- **Twins**: a ghost on a copied board becomes one piece per possible square in the new row, each present exactly in
  the possibilities where the original stood there. They are linked, they can move, split and be measured; twins
  cannot merge with each other (different pieces).
- Two copies of one physical piece can coexist (a king that travelled and its past self), as in 5D.

### 6.4 The world

```js
{
	sq: number[], ty: string[], sd: number[],   // length nr · (h + 1) · n², the same in every world
	board: number[],                            // length (uMax + 1) · 9 · 64; −1 = empty
	x: {
		n: 5, h: 4, m: 3, md: 0,                // board size, history boards per row, cap, start mode (0 single, 1 even, 2 three rows)
		s: 0,                                   // side to move (drives nextSide)
		t: 0,                                   // actions of the side to move in the current turn (4.4)
		c: [0, 0],                              // new lines created by White, Black
		tl: [ROWS entries],                     // [st, en, pu, pv] or null
		ep: [ROWS entries],                     // en passant cell (y·8 + x) on the row's latest board, or −1
		ord: [ROWS entries], nr: 1,             // creation index of each row, number of rows
		k: -1,                                  // side that captured a royal piece in this world, or −1
		// ai: 1                                // only in the computer's view (6.15)
	},
}
```

Unused ids: `sq −1`, `ty ''`, `sd 0`. Arrays grow in every world at once (the skeleton is shared).

### 6.5 Skeleton helpers (pure; `skeleton(x)` cached per `x` object)

`uOf(l, md)` (−1 outside `[l0 − 3, l1 + 3]`, 4.2), `lOf(u, md)`, `LAB[u]`, `skeleton(x) → { act(u), present }`,
`playable(x, side, u)`, `mandatory(x)`,
`canSubmit(x)`, `newRowFor(x, side)` (`u(l1 + cW + 1)` or `u(l0 − cB − 1)`), `slotAt(x, u, v, pass)` (−1 when not
stored; `pass` = rows virtually advanced for the phantom, whose latest board is then `en + 1` with the slot-0
pieces), `vOfSlot(x, u, slot)`.

### 6.6 Move keys (identical in every world; the codes of the move list)

```
board := "(" LAB[u] "T" T(v) ")"             e.g. (0T5), (+1T5), (−1T3), (−0T1)
cell  := file rank                            a–h, 1–8
key   := board cell "-" cell ["=Q"]           physical (also double step, en passant, castling = the king's move)
       | board cell ">" board cell ["=Q"]     jump
       | board cell ">>" board cell ["=Q"]    branch
       | "submit"
```

Keys contain no `|`, never start with `?`, and ASCII `-` appears only as the physical separator (U+2212 in labels),
so `marks.js` and `rolls.js` parse them. Split, merge and measure codes come from the core with the static names:
`(0)d1-(0)c3|(0)e3`, `(0)c3-(0)~3a3|(0)~3e3` (time split), `(0)c3|(0)e3-(0)d1`, `?(+1)c3`.

### 6.7 `generate(w, side)`

**The mover (`side === x.s`).** For each row u playable for the mover (in the computer's view see 6.15), v = en, for
each own piece on the latest board: leap / ride / pawn / castling as in section 5; the target line must lie in
`[l0 − m, l1 + m]` (checked before `uOf`, 4.2) and the target (u2, v2) must be stored; classify (4.5); drop branches
without permission (4.6). Push

```js
{ key, from: sqOf(u, 0, x, y), to: sqOf(u2, slot2, x2, y2),   // `to` is the drawn square, also on a past board
  id, capture: occupant id (live or history) or −1, promo: 'q' | null, drop: null,
  kind: 'normal' | 'double' | 'ep' | 'castle' | 'hop' | 'branch',
  extra: { u, tu: u2, tv: v2, tx: x2, ty: y2, noRow, rook? } }
```

Travel moves carry the real piece id: the core may use them as split and merge paths (`allowQuantum` keeps them on one
board) and its join rule (Q14) sees a part landing on its own other part. Add
`{ key: 'submit', from: −1, to: −1, id: −1, capture: −1, kind: 'submit' }` when `canSubmit`.

**Not the mover (`side !== x.s`): the phantom list (5D check).** Pass the mover's **must-move** rows virtually (their
latest board becomes `en + 1` with the same pieces; the official check test, R 7.1, E 5.1) and return the waiting
side's **real moves from there**, with real keys, ids and kinds, each flagged `phantom: true`. `apply` returns the
world itself for a phantom move. So `royalDanger(V, state, mover)` is the core's ordinary number: the best single
key (the weight of the worlds in which it takes a royal piece) or converging merge (`mergeDanger`, which reads the
phantom paths). Before Submit, with no must-move boards left, the phantom passes nothing and the list equals the
opponent's list after Submit, so **the danger is the same number before and after Submit** (test Q17). `table()`
only generates for `state.turn`, so phantom moves are never legal. When the mover has no must-move board the list is
the waiting side's moves as they stand.

Cost (measured, one world): 5×5 with 5 rows 12 µs (mover) and 31 µs (phantom); 8×8 with 7 rows and 332 keys 83 µs
and 21 µs.

### 6.8 `apply(w, m)`

`next = clone(w)` (arrays sliced; `x` copied with `c`, `tl`, `ep`, `ord` sliced). By kind:

- **advance(u)**: the latest board of u is copied into ring slot `1 + (en mod h)`: for each cell, the old piece of
  that history cell is removed, and the latest board's piece (if any) is placed there with the cell's history id,
  type `'h' + t`, same side. Then `en += 1`, `ep[u] = −1`. Live pieces keep their squares and ids.
- **physical**: advance(u); remove the victim (a royal victim sets `x.k = mover`); move the piece (moved type, or `q`
  on promotion); castling moves the rook; `double` sets `ep[u]`.
- **hop**: advance(u); advance(u2); remove the piece from u; capture on the target of u2 (royal → `x.k`); place it.
- **branch**: first read the target board (it may be on row u, in the slot the advance overwrites). Royal target:
  advance(u), remove the piece, `x.k = mover`, no row. Otherwise **openRow**: `nu = newRowFor(x, mover)`, grow the
  arrays, `tl[nu] = [v2 + 1, v2 + 1, u2, v2]`, `ep[nu] = −1`, `c[mover] += 1`, every piece of the copied board
  except the one on the target cell is placed with the new row's slot-0 ids and its live type; then advance(u), remove
  the piece from u, place it on the new row's target cell (`q` when `promo`, otherwise the moved type).
- **submit**: `x.s = 1 − x.s`, `x.t = 0`. **phantom**: return `w`.
- Then the automatic end (4.4), except for submit: `x.t += 1`; if no row is playable for `x.s`, `x.s = 1 − x.s` and
  `x.t = 0`.

Cost (measured): 2–5 µs per move.

### 6.9 `applyMiss(b, action, side, info)`: the structure follows the key

The lead's decided hook (CC Q1), used as decided: the idle worlds get the same new boards, just without the piece
moving. It **ignores `info.hit`**, so a rolled Missed builds the boards too and the skeleton after an action depends
only on its code.

```js
applyMiss(b, action) {
	if (action.type === 'pass') return b                          // never used (no passWhenStuck)
	const next = clone(b), x = next.x
	if (action.type === 'move') {
		const m = action.sample
		if (m.kind === 'submit') { x.s = 1 - x.s; x.t = 0; return next }   // never idle in practice
		const e = m.extra
		if (m.kind === 'branch') { if (!e.noRow) openRow(next, x.s, e.tu, e.tv, -1, -1); advance(next, e.u) }
		else if (m.kind === 'hop') { advance(next, e.u); advance(next, e.tu) }
		else advance(next, e.u)
	} else if (action.type === 'measure') {
		advance(next, decode(action.from[0]).u)                       // measuring uses that board
	} else {                                                          // split or merge: one board each (6.10)
		const f = decode(action.from[0]), t = decode(action.to[0])
		if (t.slot > 0) {
			const o = b.board[action.to[0]]                           // an enemy royal piece there (solid: in every world)?
			if (!(o >= 0 && b.sd[o] !== x.s && types[b.ty[o]].royal)) openRow(next, x.s, t.u, vOfSlot(x, t.u, t.slot), -1, -1)
			advance(next, f.u)
		}
		else if (t.u !== f.u) { advance(next, f.u); advance(next, t.u) }
		else advance(next, f.u)
	}
	autoEnd(x)                                                        // x.t += 1, and the automatic end (4.4)
	return next
}
```

Why the skeleton can never differ between worlds: an ordinary move applies the same kind with the same (u, u2, v2) in
every world (they come from the key, including `noRow`); a split has both targets on one board, so both children and
the idle children build the same boards; a merge starts from one board to one target, and a merge onto an enemy royal
piece on a past board opens no row in the capturing world (its path is a royal branch) nor in any idle world (the
check above; a split never targets an occupied square); a measure advances one row; Submit and the automatic end read
the skeleton. So the core's solid roll never fires on structure (the fuzz asserts it) and its notes stay short, and
the skeleton after an action depends only on its code (test Q15b: a twin merged onto a king in the past).

### 6.10 `allowQuantum(state, action)` (the one new core hook, 7.1)

```js
allowQuantum(state, { type, from, to }) {
	const x = state.worlds[0].b.x
	const f = decode(from[0])
	if (f.slot !== 0) return false                                   // parts only on latest boards
	if (type === 'measure') return x.s === state.turn && playable(x, state.turn, f.u)
	if (type === 'merge') { const g = decode(from[1]); return g.slot === 0 && g.u === f.u }   // one board
	const a = decode(to[0]), b = decode(to[1])
	return a.u === b.u && a.slot === b.slot                          // both halves on one board
}
```

For splits and merges it checks structure only: that the parts can move at all already follows from the generation
(only playable boards generate quiet moves), and in the danger count (`mergeDanger` on a copy with the waiting side to
move) the phantom's boards are the ones that generate.

### 6.11 `unifyWorlds(bs)`

A rook id that is `r0` in some world but not `r0` **on the same square in every world** becomes `r` in every world;
the input array is returned when nothing changes (test Q26). Kings, pawns and brawns are solid, so their flags never
differ.

### 6.12 `solidExtra`, `nextSide`, `actions`, `worldResult`

```js
solidExtra: (w) => w.x.s + '/' + w.x.t + '/' + w.x.c.join(',') + '/' + w.x.tl.map((e) => (e ? e[0] + '.' + e[1] : '')).join(';'),
nextSide: (w) => w.x.s,
actions: (state) => [{ code: 'submit', label: submitLabel(state) }],
worldResult: (w) => (w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null),
```

- `solidExtra`: side to move, actions this turn, created counts, every row's first and latest board (parents follow
  from the keys).
- `submitLabel(state)`: legal and `d = royalDanger(V, state, state.turn)` > 0 → `t('Submit turn (a king of yours can
  be taken: {p} %)')`; legal → `t('Submit turn')`; otherwise `n('quantumchess', 'Submit turn (move on {count} more
  board first)', 'Submit turn (move on {count} more boards first)', count)` with `count = mandatory.length`. The
  danger is memoised per state object (a `WeakMap`), so the danger line and the label compute it once.

### 6.13 `stateResult` (the stuck test), `noMoves`, `reasonText`

`stateResult(state) = stuck(state) ? endResult(state) : null`; `noMoves(state) = endResult(state)`;
`endResult(state) = x.t > 0 ? { winner: 1 − turn, reason: 'stranded' } : royalDanger(V, state, state.turn) >= 1 ? {
winner: 1 − turn, reason: 'checkmate' } : { winner: null, reason: 'stalemate' }` (`x` of the first world; `>= 1`
means one key or merge captures a royal piece in every world: a certain capture, docs/rules.md 5). At the start of a
turn (`x.t = 0`) the position was left by the opponent's turn: the official split. After an action of the side to move
in this turn (`x.t > 0`) the side stranded its own turn and loses: in the original such a turn cannot be submitted,
and a draw would let a player escape any lost position by stranding (measured: with a draw here, the computer took
that exit in 5 of 8 Timeline Marauders self-play games at the normal level once it was clearly behind in material).

`stuck(state)` (the official "no legal turn", for the structure; runs in `stateAfter` also in light mode, so the
computer sees stranding moves). It is a **completion search**: not stuck iff some sequence of the mover's actions,
each board used once, makes Submit legal.

1. Not stuck if `canSubmit`.
2. **Quick path**: not stuck if every must-move row has a **physical** key (kind `normal` or `double`) in the cached
   generation (possibly the computer's pruned view: pruning never removes must-move rows' keys). A physical move never
   disappears during the turn, so playing one on every must-move board finishes it. Most calls end here (measured
   0.03–0.1 ms).
3. The **unpruned** union of the mover's keys (castling and en passant only when every world has them). Not stuck if
   some key might capture an enemy royal piece (the player may still try it; this exit is one-sided).
4. **Abstract actions** from that union, per playable row u: *solo* (u has a physical, castling or en passant key),
   *measure X* (a square of u's latest board with `ownPieceAt(state, s) = X ≥ 0` and X superposed; measuring uses the
   board, and each piece can be measured once), *jump to u2* (a jump key onto row u2), *branch to (u2, v2)* (a branch
   key, `noRow` ones were handled in step 3).
5. Depth-first search over skeleton copies y (rows' `[st, en]`, created counts; memoised on y and the measured pieces):
   success when `canSubmit(y)`; from each row u not yet used in y (`en` unchanged):
   - if u is must-move in y: its solo action (advance u), each unmeasured measure (advance u), each jump to an unused
     row (advance u and u2), each branch (open the row as `afterBranch`, advance u, `c[mover] + 1`; only while
     `c[mover] < m`);
   - if u is not must-move: only a jump onto a must-move row, and a branch after which the must-move set changes or
     Submit is legal (the present moved back, or a timeline was reactivated);
   - a jump whose target row was already used becomes a branch onto that board (as in real play: the board is then in
     the past), subject to the same permission.
   Stuck iff the search fails. At most 9 rows, each used once, so the search is small: measured over the 113,000
   calls of 2,621 self-play positions (Timeline Marauders, Timeline Invasion, Small; easy and normal), 0.07 ms per
   call on average, at most 22 ms; about half of the calls on Timeline Marauders pass the quick path, two thirds on
   Timeline Invasion, all of them on Small.

Exactness: because the structure follows the key (F3), every legal key clears its boards whatever the dice say, and
keys can only disappear during a turn (boards never change and new boards belong to the opponent), except that a jump
turns into a branch once its target board was played, which the search models (no key appears during a turn: the
mover's boards do not change, and a board another action advanced stays as a past board with the same pieces).
"Stuck" is therefore always right. "Not stuck" is exact except for three one-sided cases: the royal capture of step 3
may be Missed; a jump or branch whose path runs through the oldest stored board of a row that another action of the
turn advances (that board is then sealed) is still counted; and measuring one piece can settle a piece linked to it,
so a second measurement the search counts may no longer exist. In those cases the player may still be stuck later;
the game then ends by the next `stateResult` or by `noMoves`. Measured: in those 2,621 positions none was "not stuck"
while every action of the side to move stranded it. The first version of this test (a quick path on any departing
key, a bipartite matching of the keyless must-move rows to jump sources, and "a branch that changes the must-move
set" as a way out) missed real stuck positions in two ways: a branch from a must-move row counted as a way out
although only its own row left the set (Timeline Marauders, easy self-play: 3 of 30 games, test Q27b), and rows whose
only keys are jumps onto boards that another must-move board needs (a row with departing keys was never checked
again; 2 of 1,222 positions in 30 easy games, test Q27c).

`reasonText`: `checkmate` → "The turn could not be finished and a king would certainly be captured (checkmate)";
`stalemate` → "The turn could not be finished (stalemate)"; `stranded` → "A move left the turn impossible to finish
(stranded)"; `quiet` → "300 moves without a capture or a pawn move"; other reasons generic.

### 6.14 Records and texts

- **`recordInfo(prev, code, branch, next)`** (CC Q9) stores, when non-empty: `rows` (new row indexes), `arrows`
  (`[u1, v1, x1, y1, u2, v2, x2, y2]` per travel, in absolute board coordinates, the board the piece left and the one
  it arrived on; none when the outcome is `miss`), `text` (split, merge and measure codes in absolute notation, e.g.
  `(0T2)c3 split (0T1)a3 | (0T1)e3`), `back` (the new present when it moved back), `memory` (`[u, v]`: after a merge
  whose worlds still differ, the latest past board on which they differ), and, for every action except Submit,
  `cells`: the squares of the action as `[u, v, x, y]` **on the boards it produced**: the start square (or both
  parts of a merge, or the measured part) on `(u, en + 1)`; a target on a latest board on `(u2, en2 + 1)`; a target
  on a past board on the new row `(nu, v2 + 1)` (a royal target without a row: `(u2, v2)`). The same in every
  outcome (a Missed move still marks where it went). Pure (undo replays call it again).
- **`lastMoveMarks(state)`** (7.2 H11): the squares of every record of the opponent's last turn and of the turn in
  progress (the trailing run of records of `state.turn`, if any, plus the run before it), from `info.cells`, each
  turned into the square that shows that board now (`slotAt`; sealed boards skipped). So a branch marks its arrival on
  the new row (the past target's ring slot may already hold a newer board: a branch onto the source row's oldest
  board is overwritten by that row's own advance, test R2), and marks follow their boards into the past as rows
  advance.
- **`codeText(code, record)`**: `submit` → "Submit turn"; `record?.info?.text` when present (the absolute split, merge
  or measure text); otherwise the code (ordinary keys are already absolute). Needs the record argument (7.2 H5);
  without it the code is shown.
- **`infoText(record)`**: one line per fact, e.g. "Opened timeline +1 (a copy of (0T1) ○)"; for a `miss` outcome that
  opened a row: "Missed: timeline +1 opened anyway, nobody arrived"; `back`: "The present moves back to T1 ●";
  `memory`: "The past still remembers both paths until (0T2) ○ is sealed".
- **`sideInfo(state, side)`** (CC U6): text "Timelines {c}/{m}" plus, for the side to move, " · Must move: (0T5),
  (+1T5)"; title "New timelines opened by this side, of {m}. Your next one is active while your opponent has opened
  at least as many." The budget pips (U5, `budgetInfo`) show the budget including the past.
- **`moveWarning(state, code)`** (7.2 H4): for each outcome, the light `stateAfter` `next`; only results with reason
  `stranded`, `checkmate` or `stalemate` count. The stuck side is always `next.turn`:
  - `next.turn === state.turn` (the mover is stuck; the reason is then `stranded`): "After this move you cannot
    finish your turn: you lose";
  - otherwise the opponent is stuck at the start of their turn: a `checkmate` (the mover wins) gives no warning; a
    `stalemate` gives "After this move your opponent cannot finish their turn: the game ends in a draw".
  The first text wins over the second (some outcome strands the mover); else null. Tests Q30, Q30b, Q30c.

### 6.15 The computer player

- **`evaluate(w, side)`** (added to the core's material; history types are worth 0): two fast scans per world
  (generation without building keys): the **phantom scan** = the waiting side's moves after the phantom pass (6.7),
  which gives *check* (it could capture a royal piece of the side to move) and *hang* (the value of the most valuable
  non-royal piece of the side to move that it could capture **on a latest board the side to move can no longer play
  this turn**, i.e. a row whose latest board is the waiting side's); and the *threat* scan = the side to move can
  capture a royal piece now (stopped at the first one). Side to move: −3000 in check, +6000 with a threat, −0.8 ×
  hang; the other side to move: −6000 if it has a threat, +3000 if it is in check, +0.8 × hang. Plus **+200
  contempt** (at equal material the computer prefers playing on to a stalemate it could cause) and +100 ×
  clamp(c[enemy] − c[side], −2, 2) (the timeline advantage, R 5.1). Stuck turns come from `stateResult`.
  The hang term is what judges the non-final moves of a turn (`replySide` is null there): without it the computer
  took a pawn defended by a pawn with its queen on the first of two must-move boards in 12 of 12 seeds at normal and
  hard and 5 of 12 at easy; with it in 0, 0 and 1 of 12 (easy keeps its noise; test A4). Pieces on boards the side
  still plays this turn are left out: they can still move, and counting them made mid-turn positions look worse than
  they are. The scans cost what the old royal-only tests cost (measured at 64 worlds: easy 390 / 558 ms, normal 861 /
  1,508 ms, hard 1,048 / 3,225 ms average per ply on Small / Standard, against 399 / 677, 875 / 1,542, 1,170 / 3,466
  before; longest blocks unchanged).
- **`aiView(state)`**: when the side to move has must-move **and** optional boards, a shallow copy whose worlds carry
  `x.ai = 1`; in that mode `generate` keeps every move from must-move boards and, from other boards, only royal
  captures, jumps onto a must-move board, and **branches after which a must-move board is no longer must-move or
  Submit is legal** (the present moves back: the same skeleton test the stuck search applies to rows that are not
  must-move, 6.13 step 5, memoised per (u, u2, v2)). All of these depend on the skeleton and solid kings only, so a
  key is kept in every world or none and the odds stay exact. When the pruned view has no legal move, `aiView` returns
  the state itself (so the core never falls back to a random move); so it does when the side to move lacks must-move
  or optional boards. The view is **exact** (every candidate of the view is legal on the real state with the same
  outcomes), so the declaration sets `aiViewExact: true` (7.2 H2) and `chooseMove` checks only the chosen code on the
  real state. Test A5: in a Timeline Marauders position where the only non-stranding move is a
  branch from an optional board, the first version's view was empty and the computer played a random stranding move.
- **`replySide(s, me) = s.turn === me ? null : s.turn`**: inside its own turn there is no answer yet, the evaluation
  (with its check and hang terms) judges; after the turn ends the opponent answers. Measured against the core default
  ("my best continuation"): normal vs normal on Small, 6 games each, 89 ms against 132 ms per ply on average; results
  White 2 / Black 4 against White 4 / Black 2 (no difference in strength visible at this sample), so `null` is kept.
- **`aiTimeShare(state)`** (7.2 H3) = `1 / (number of the mover's playable boards + x.t)`: a turn of k boards shares
  one level budget instead of k.

### 6.16 Performance budget (measured; desktop, Node 22)

Largest states reached by random play with a split every third ply (4 states per configuration, 64 worlds; 48 on
4×4), measured on the patched copy of the current working-tree core. "One UI step" = `legalMoves` + the mover's
danger + `layoutOf` + `boardView` + `applyMove`.

| Configuration | Rows | legalMoves | danger (mover / waiting) | layoutOf (cells) | boardView | applyMove | one UI step | phone ×3–5 |
|---|---|---|---|---|---|---|---|---|
| Small, reach 2 (default) | 7 | 4.8 ms | 20.7 / 4.6 ms | 2.1 ms (850) | 11.9 ms | 13.7 ms | ≈ 53 ms | 0.15–0.3 s |
| Small – Centered, reach 2 | 7 | 5.0 | 23.2 / 5.9 | 2.2 (875) | 14.5 | 15.1 | ≈ 60 | 0.2–0.3 s |
| Very Small – Open (48 worlds) | 7 | 4.5 | 16.7 / 12.5 | 2.2 (528) | 11.9 | 4.7 | ≈ 40 | 0.1–0.2 s |
| Small, reach 4 | 7 | 19.4 | 12.5 / 18.4 | 2.5 (1,100) | 17.2 | 26.1 | ≈ 78 | 0.25–0.4 s |
| Standard, reach 4 | 7 | 18.4 | 33.9 / 17.7 | 2.5 (3,520) | 29.4 | 38.3 | ≈ 123 | 0.4–0.6 s |
| Standard, reach 2 | 6 | 13.4 | 14.1 / 8.1 | 2.1 (1,280) | 14.3 | 18.9 | ≈ 63 | 0.2–0.3 s |
| Two Timelines, reach 4 | 6 | 38.7 | 28.3 / 8.3 | 2.8 (2,304) | 21.4 | 28.8 | ≈ 120 | 0.35–0.6 s |

Typical states (1–8 worlds) are 10 to 50 times cheaper. Per world: `generate` 12–83 µs (mover), 21–31 µs (phantom),
`apply` 2–5 µs; the stuck test 0.02–0.1 ms per call; packing and stringifying a 64-world state 2–22 ms. **Targets**
for the implementation (desktop Node, these states): one UI step ≤ 130 ms; `layoutOf` rebuild ≤ 5 ms; the Vue render
of the largest 8×8 layout (3,520 cells) must be measured on a phone-class CPU before release, with a target of
≤ 250 ms per re-render (if it is slower: skip re-rendering unchanged boards by keying the board groups, a generic
board-component optimisation).

**The computer at 64 worlds** (4 states each; avg / max per ply; "block" = the longest stretch without yielding to
the browser):

| Configuration | easy (0.4 s) | normal (1.5 s) | hard (4 s) |
|---|---|---|---|
| Small, reach 2 | 399 / 415 ms (block 415) | 875 / 1,514 ms (block 589) | 1,170 / 2,514 ms (block 666) |
| Small – Centered | 380 / 412 (363) | 1,027 / 1,528 (1,528) | 2,308 / 4,024 (4,024) |
| Very Small – Open (48 worlds) | 311 / 407 (275) | 1,401 / 1,510 (764) | 2,214 / 4,011 (2,012) |
| Small, reach 4 | 399 / 442 (439) | 1,512 / 1,535 (1,535) | 2,857 / 4,035 (4,035) |
| Standard, reach 4 | 677 / 995 (995) | 1,542 / 1,564 (1,564) | 3,466 / 4,007 (1,673) |
| Standard, reach 2 | 491 / 608 (608) | 1,517 / 1,530 (1,530) | 3,363 / 4,033 (4,032) |
| Two Timelines, reach 4 | 1,072 / 2,405 (2,405) | 1,751 / 2,363 (2,363) | 4,051 / 4,074 (4,074) |

The level clocks of the current core hold for normal and hard within 0.1 s (an older copy without the deadline inside
the first candidate measured blocks of up to 21 s; that is fixed in the working tree), but easy overshoots to 2.4 s on
8×8 (the forcing pre-pass), and the **whole search is often one synchronous block** as long as the level time, which
would freeze a phone for 4–20 s. **Required** (7.2 H2): the search yields and checks its clock inside the candidate
pre-pass and inside each candidate's evaluation. Acceptance at these states: the longest block ≤ 150 ms on desktop,
and every ply ends within the level time plus 150 ms.

**Typical play** (the computer against itself, 1–16 worlds, this core): Small normal vs normal, 8 games, 266 plies,
avg 102 ms, max 1.1 s per ply; hard vs normal avg 129 ms, max 2.6 s; normal vs easy avg 23 ms; Very Small – Open
normal vs normal avg 38 ms, max 0.33 s; Standard normal vs normal, 2 games, 191 plies, avg 0.48 s, max 1.5 s. With
the review changes (hang term, view escapes, completion search): Small normal vs normal, 8 games, 315 plies, avg
83 ms, max 1.4 s; Standard, 2 games, 193 plies, avg 0.44 s, max 1.5 s; Timeline Marauders, 8 games, 374 plies, avg
21 ms, max 0.31 s.
Per-turn targets on a phone (with `aiTimeShare`, one turn shares the level time): easy ≤ 1.5 s, normal ≤ 5 s,
hard ≤ 12 s.

**Quantum use and stranding** (same games): the computer splits often (12–14 splits per 200 plies on Small and
Standard; 7–9 with the review changes), travels a lot (39–85 travel moves), rolls 5–9 times, but links rarely (0–3)
and measures rarely (0–1); empty portals 1 per 200 plies, no quantum-pass abuse. In 14 Timeline Marauders games (8
normal, 6 easy) of the first version the game ended 9 times by checkmate or stalemate, always created by the
opponent's move. With the review changes, 16 games (8 normal, 8 easy): 9 checkmates or stalemates, all at the start of
the stuck side's turn, and 1 `stranded` (normal, a choice between stranding and losing the king at once); no
position in 2,621 self-play positions (Timeline Marauders, Timeline Invasion, Small) was left "not stuck" while
every action stranded the mover. Using ghosts more (links, measurements) is a tuning item for later, not a rules
issue.

### 6.17 State size and saving (measured)

| Configuration | One world (JSON) | 64 worlds plain | 64 worlds packed (7.2 H8) |
|---|---|---|---|
| Small, reach 2, 7 rows | 21.9 KB | 1.4 MB | 58 KB |
| Small – Centered, reach 2, 7 rows | 22.2 KB | 1.4 MB | 49 KB |
| Very Small – Open, 48 worlds | 17.8 KB | 0.85 MB | 37 KB |
| Small, reach 4 | 28.5 KB | 1.8 MB | 57 KB |
| Standard, reach 4, 7 rows | 53.6 KB | 3.4 MB | 142 KB |
| Standard, reach 2, 6 rows | 30.1 KB | 1.9 MB | 105 KB |
| Standard, cap 2, reach 4, 5 rows | 37.9 KB | 2.4 MB | 100 KB |
| Two Timelines, reach 4, 6 rows | 52.5 KB | 3.4 MB | 82 KB |

A history record costs about 210 bytes per ply (155 before `info.cells`, 6.14). Saved records of computer games
(plain, before packing, measured before `info.cells`): Small 9–57 KB (13–68 plies), Standard 81–140 KB (128–200
plies; 91 KB packed); `info.cells` adds about 55 bytes per ply to these. Worst case of a record: the packed current
state (≤ 150 KB) + the packed start state + ≤ 1,200 history records (≤ 260 KB) + the move list and the roll memo
(≤ 110 KB): about 520 KB, so **packing is required** (7.2 H8); the ~5 MB browser storage then holds several long
games, and the notice covers the rest. Without packing a single 64-world 8×8 state would already use 3.4 MB.

### 6.18 Core behaviours relied upon (pin each with a test)

| Behaviour | Core item | Test |
|---|---|---|
| Idle worlds pass through `applyMiss`, also a rolled Missed and a Measure | Q1 | Q3, Q11, Q14, Q19 |
| Castling and en passant legal only when certain in every world | Q2 | Q22, Q23, S13, S15 |
| `unifyWorlds` runs on the chosen outcome | Q3 | Q26 |
| `budgetRule` limit; a link over the limit is rolled | Q6 | Q19, Q20 |
| `royalDanger` counts converging captures; phantom moves carry real ids | Q7 | Q16, Q17, U4 |
| History records carry `from`, `to`, `info` | Q9 | R1 |
| `squareView` / `boardView` skip squares beyond `board.length` | Q11 | U1 |
| Parts with different types cannot merge (`r0` / `r`) | Q13 | Q26 (after unify both are `r`) |
| A part moving onto its own other part joins it (no roll) | Q14 | Q24 |
| `perWorldMerge` reads the type where the piece stands on f1 (absent twins) | fixed in the working tree | Q21 |
| `stateResult` runs in light mode | today | Q28 |
| `replySide`, `aiView`, the time clock | U3, ai.js | A1, A2 |
| Focus recentres only when its key changes | U2 | U3 |
| `turn = nextSide(first world)`, `result = worldResult(first world)`, `table()` for `state.turn` only | today | S2, S9 |

---

## 7. Changes needed beyond IMPLEMENTING.md (the exact list)

Everything else in this spec uses the core as it is in the working tree (applyMiss, Q2, Q3, Q6, Q7, Q9, Q11, Q13,
Q14, U1-U6, U9, U11, U15, the AI clock).

### 7.1 Core (quantum.js): one hook

**H1 `allowQuantum(state, action) → boolean`** (optional; default: everything the generic rules allow). "The variant
may forbid a split, merge or measurement that the generic rules allow." `action = { type: 'split' | 'merge' |
'measure', from: number[], to: number[] }` (for a merge pair without a target, `to` is empty). Call sites, all in
`quantum.js` (verified against the working tree; the prototype's patch is `handoff/tmp/mv-final/patch-core.mjs`):

1. `splitBranches`: after the piece and the targets are checked, return null when not allowed (so `splitsFrom`,
   `isLegal`, `branches`, the computer follow);
2. `mergeCandidates`: skip a pair of parts that is not allowed (`to: []`), so the UI's merge marks follow;
3. `perWorldMerge`: return null when not allowed (`to: [t]`), which also covers `mergeBranches` and `mergeDanger`;
4. `measureBranches`: return null when not allowed;
5. `legalMoves`: with the hook, list **one measurement per allowed home part** (`homeSquares(state, id).filter(...)`);
   without it keep today's first-part listing;
6. `cannotEscape`: use the first allowed home part (generic correctness; the multiverse has the escape rule off).

Backwards compatible (no other variant defines it; the prototype runs every scenario on the patched working-tree
copy). Document it in `variant.js` and IMPLEMENTING.md.

### 7.2 App and computer (generic, small)

| # | Where | Change | Why | Status |
|---|---|---|---|---|
| H2 | `core/ai.js` | Yield (`await breathe()` every ~12 ms) and check the clock inside the candidate pre-pass (`candidates`, **the real-state filter of an `aiView` copy**, the forcing filter) and inside each candidate's evaluation (per outcome and per reply, as a chunked loop), so no synchronous stretch exceeds ~150 ms at 64 worlds. Memoise `branches(V, s, code)` within one `chooseMove` (the forcing filter and `expected` share it). A declaration flag **`aiViewExact: true`** (optional, default false: "every candidate of `aiView` is legal on the real state with the same outcomes") lets `chooseMove` skip the per-candidate re-check and verify only the chosen code on the real state, falling back to the next best when it is illegal | measured: the whole search is often one block of 1.5 s (normal) or 4 s (hard); easy overshoots to 2.4 s on 8×8; the real-state filter alone, which runs before any clock check today, takes 1.6 s at 64 worlds on Standard (183 candidates; 5–8 s on a phone) and 0.26 s on Small | required |
| H3 | `core/ai.js` | Optional hook `aiTimeShare(state) → (0, 1]`: the share of the level's time for this ply (default 1). With H2's `aiViewExact` the filter no longer eats the share | a turn of k boards otherwise takes k level budgets | required for phones |
| H4 | `useVariantGame.js`, `VariantGameView.vue` | Optional hook `moveWarning(state, code) → string \| null`; when it returns a text, `attempt()` asks for confirmation (the roll box with the warning text), also for certain moves; null plays as today. The multiverse returns a text only for a move that strands the mover (a loss) or leaves the opponent stranded for a draw (6.14), never for a winning move | the stranding trap (random play strands Timeline Marauders within two moves) | required |
| H5 | `texts.js`, `VariantGameView.vue` | Call `V.codeText(code, record)` with the history record where one exists (move list, last-move box) | absolute text for time splits and past merges | recommended |
| H6 | `VariantBoard.vue` | (a) `layout.focus.box = { w, h }` (layout units): zoom to fit the box, and on a coarse pointer keep at least 28 px per unit (`matchMedia('(pointer: coarse)')`). (b) **Lift the zoom cap** for such layouts: `maxZoom = max(8, (W + 2·PAD) · 40 / svgPixelWidth)` (40 px per unit at most), used by `setZoom`, the + button and the focus watch (today all clamp to `MAX_ZOOM = 8`). (c) **Touch panning and pinch**: `touch-action: none` on the SVG while zoom > 1 (today `manipulation`, with which the browser claims a one-finger drag and sends `pointercancel`, which ends the pan), `setPointerCapture` on pointerdown, and a two-pointer pinch that scales the zoom around the pinch midpoint; at zoom 1 the page still scrolls over the board | ≈ 15 px squares on 8×8 at 360 px otherwise; measured: Standard layouts are 119 units wide (median; p90 147, max 157), so 28 px per unit on a 360 px phone needs zoom up to 12.3, above the cap in 76 % of positions (at zoom 8 an 8×8 board is 146 px, not 224); a zoomed multiverse must be panned to reach other rows | required |
| H7 | `useVariantGame.js` | Split mode: after the first target, mark only targets t with `isLegal(splitCode(f, t1, t))`; Measure mode: check `isLegal('?' + names[sq])` for the tapped square itself (notice `noMeasure` otherwise) | one-board splits; a part on a board you may not play | required |
| H8 | `variantGames.js`, `storage.js`, view | Record version 2: `initial.worlds` and `current.worlds` saved as world 0 plus, per other world, the changed indices of `sq`, `ty`, `sd`, `board` (and `x` only when it differs); `loadVariantGame` unpacks v2 and still reads v1. `saveVariantGame` returns false on a quota error, and the view shows "This game could not be saved on this device" | 3.4 MB → 142 KB (8×8, 64 worlds); silent loss of saves today | required |
| H9 | `useVariantGame.js` | `undo()`: count the records to pop from `state.history` (pop while the popped record's side is a computer, then the human's move), then replay once | today one full replay per popped ply: seconds on a phone for a multi-move computer turn | required |
| H10 | new-game dialog | When the variant has a `view` option with values `white` / `black` and the human plays Black against the computer, preselect `black` | Black at the bottom without a 180° turn (time must run to the right) | recommended |
| H11 | `useVariantGame.js` (`marks`) | Optional hook `lastMoveMarks(state) → number[]`: when defined, the squares marked "last" are these instead of `lastMoveSquares(V, last record)`; hidden variants keep today's rule (no marks for the opponent's move) | today only the last record is marked: after a turn ended by Submit nothing is marked (Submit has no squares), and of a multi-move turn only the last move; a branch's record `to` is its past target square, whose ring slot may already hold a newer board (6.14) | required |
| H12 | `VariantGameView.vue`, `useVariantGame.js` | Optional declaration flag `flipBoard: false`: the view hides "Flip board" and `rotation` ignores `flipped` | "Flip board" rotates the whole layout 180°, which reverses time and mirrors the rows; the `view` option (and H10) is the way to put Black at the bottom | required |
| H13 | `VariantBoard.vue` | Optional `kind` on `layout.outlines` entries: `kind: 'threat'` is drawn in the danger colour (a CSS class `qc-vboard__outline--threat`), any other kind or none as today | the threat lines of 5D check must be drawn above the cells (lines are drawn under the opaque cells, where a threat inside one board is invisible), and distinguishable from travel arrows and placeholders | required (without it the threat lines are plain outlines) |

Optional polish, not needed for v1: more outline kinds (dashed placeholders); a "Now"
button that re-applies `layout.focus`; a twin thread between twins (would need a `relatedParts(state, id)` hook);
the softmate hint ("only time travel escapes"), which costs ≈ 0.2 ms per candidate move per world; a preview of the
row a branch will open while its target is selected.

---

## 8. Quantum rules (engine view)

### 8.1 Classical and quantum

| Classical (the same in every possibility) | Why |
|---|---|
| The skeleton: rows, their first and latest boards, parents, created counts, side to move (`solidExtra`) | One picture; "which boards must I play?" has one answer; the present is a parameter, not an observable |
| Kings, royal queens, common kings, pawns, brawns and their unmoved flags | Solid (core rule; royal pieces must be certain for capture-the-king) |
| Castling and en passant | Certain-only (core Q2) |
| Submit, the automatic end, the stuck test | Functions of the skeleton and the union of keys |

| Quantum (may differ) | How it shows |
|---|---|
| Every non-solid piece on every latest board | ghosts with percentages |
| Every piece on every history board | the past drawn with its ghosts |
| Twins in new timelines | separate pieces with their original's percentages |
| One piece spread over several timelines | e.g. a knight 50 % on (0)e3 and 50 % on (+1)e3 (Q2) |
| The captured-king flag `x.k` | settled by the game-end roll |

### 8.2 Split, merge, measure (exact)

- **Split**: from a part on a latest board you may play (a quiet move exists only there), to two squares that are
  empty in every possibility, both reachable by a quiet move of the piece in some possibility where it stands there,
  and **on one board** (`allowQuantum`): the piece's own board, another timeline's latest board (jump split: both
  boards pass), or a stored past board (time split: one new row, `c[mover] += 1`, the piece on two squares of it).
  Never rolled. Idle children (piece absent, path blocked) build the same boards.
- **Merge**: two parts of one piece on **one latest board** you may play, to a square both reach (a quiet move, or a
  capture, rolled if an enemy may be there): that board, another timeline's latest board, or the past (the new row
  gets the whole piece, Q25). Parts with different types cannot merge (Q13 of the core).
- **Measure**: a superposed own piece with a part on a board you may play; that board passes. Outcomes: the squares of
  the piece's parts, and `gone` for a twin that does not exist in some possibilities ("No longer on the board"). The
  past and the opponent's boards are settled only through the present.
- **Join**: a part that moves onto the square of its other part (same piece, same type), on any board, joins it
  without a roll (core Q14): parts on two timelines reunite by a jump (Q24).

### 8.3 Rolls and links across timelines

A world is a whole multiverse; a roll keeps the worlds of one outcome and settles, at once and on every timeline, the
piece's other parts, its twins, its history and the pieces linked to it.

| Move | Same result everywhere | Target may hold a piece somewhere (land) | Otherwise, results differ (pass) |
|---|---|---|---|
| physical | certain | rolled: Missed / Moved / Captured (Missed: the board passes) | linked: where it could not move, the board passes and the piece stays |
| jump | certain | rolled; a Missed still passes both boards | linked: the piece is spread over two timelines |
| branch | certain | rolled; a Missed still opens the timeline (an untouched copy) | linked: the timeline opens everywhere, the piece arrives where it really was |
| branch or merge onto a royal piece in the past | certain win | rolled (game-end roll): Missed passes the board, no timeline (also for a merge whose piece is absent in some worlds, test Q15b) | – |
| solid mover | certain | always rolled | always rolled |
| over the budget | – | – | rolled instead of linked (the boards are still built) |

### 8.4 Danger (5D check), exactly

- For the side to move: `royalDanger(V, state, s)` = the best single key or converging merge of the waiting side in
  the phantom position (the mover's must-move boards passed): the weight of the worlds in which it captures a royal
  piece of s. It is the official "in check" test with real moves, and it equals the danger right after Submit.
- For the waiting side: the mover's best single key or merge now.
- Checkmate needs **1**: one key or merge that captures in every world (a certain capture, docs/rules.md 5). A union
  over different attackers is never counted as certain (the old '†' union showed 100 % during the turn and 50 %
  after Submit for the same attack: fixed, Q17).

### 8.5 Twins, the quantum past and which-path memory

- **Twins**: a branch copies the past board of its own world; a ghost's possible squares become separate pieces, each
  present exactly where the original stood (Q13). Measuring a twin (on a board you may play) settles the original.
- **The quantum past**: landing on a past square that may hold a piece is a roll whose outcome also tells where that
  ghost is now (Q5, "shoot the past"); a past square that may hold a piece blocks a ride in some possibilities, so the
  ride links (Q4, "past shield").
- **Which-path memory**: after a merge the history boards still differ, so the worlds stay apart and count for the
  budget until the last differing board is sealed (at most h advances of that row); then identical worlds merge by
  themselves (Q10). The record says until when.

### 8.6 The budget: ownership and the world bound

The budget counts the distinct arrangements of a side's pieces, history pieces and twins included. Only the side's own
splits and links raise it: the opponent's captures are always rolled (one outcome survives); a branch copies pieces
from a board that already exists (twins are a function of the history), and an advance copies latest pieces into
history and drops the oldest board, neither of which can separate worlds that agree on the side's pieces; rolls only
remove worlds. So "your opponent can never use up your budget" holds (the fuzz asserts it after every ply) and the
worlds stay ≤ 8 × 8 = 64.

### 8.7 Tactics (rules page and tutorial material)

| Tactic | What happens | Test / example |
|---|---|---|
| Ghost raid | Send one part of a ghost into the past: the timeline opens for certain (and rewinds the present if active); the raider is there only as a ghost. | Q2, DQ E1 |
| Empty portal | A travel move with a ghost part always opens its timeline and uses its boards, even when Missed: a cheap timeline tempo. | Q14, DQ E5 |
| Time-split fork | Split into the past: the new timeline has the piece on two squares. | Q6, DQ E3 |
| Shoot the past | Land on a past square where an enemy ghost may have stood; the roll tells where it is now. | Q5, DQ E2 |
| Past shield | A ghost that may have stood on a past square blocks enemy rides there in some possibilities: their travel links and costs their budget. | Q4 |
| Twin probe | Measure the twin the opponent copied into their timeline to learn where your original is. | Q13, DQ E4 |
| Quantum pass | On a must-move board where every move is bad, measuring a ghost there uses the board without moving. | Q11, Q29 |
| Ghost king hunt | A ghost attacking a king in the past: 50 % danger; trying it is a game-end roll. | Q15, DQ E7 |
| Jump split, past merge | Split onto another timeline's latest board, merge there or into the past. | Q8, Q9, Q25 |
| Rejoin | A part jumps onto its own other part on another timeline: certain, whole again. | Q24 |

The worked examples E1–E9 of `multiverse-design-quantum.md` section 7 stay valid with the renames of this spec (v =
2T + c, so every v there is 2 higher; names `L0:c3` → `(0)c3`, `L0~k:c3` → `(0)~kc3` with the slot of section 4.3;
budget 8 everywhere).

### 8.8 Alternatives rejected

| Alternative | Why not |
|---|---|
| A rolled Missed builds nothing (`hit = false`, DF) | two structural rules; the present and the end of the turn would depend on dice; the preview could not show the boards; a Missed would be free probing |
| Roll every uncertain move, free Missed and Measure (DP) | loses pass = link and the cost of trying (docs/rules.md 2.4, 3.2) |
| Measure "else your first must-move board" (DF) | any ghost anywhere becomes a pass token; the charged board depends on which part is tapped |
| Travel moves with id −1 (DF) | the core's join and path rules would not see the mover |
| History as markers with X1 / X2 (DF) | bends the one-id-one-square invariant, needs a budget hook; with packed saves the real-id ring is small enough |
| Budget 4 on large setups (DQ) | breaks the documented budget of 8; packed saves solve the size |
| A fixed 2-turn window on 8×8 (DQ) | cuts 3.4 % of the moves of random play and real 4-turn travels |
| Reach 6 | adds half again to state and drawing for moves real games do not use |
| Refuse stranding moves outright | needs the stuck test for every key of every refresh; a warning with confirmation costs one move's outcomes |
| A turn stranded by the player's own move is a draw (checkmate when a king can be taken for certain), as at the start of a turn (the first version of this spec) | a free escape from any lost position that the original does not have: measured, the computer took it in 5 of 8 Timeline Marauders games once it was clearly behind, and a human can do the same; the warning then even advertises the draw |
| Superposed skeleton, splits over two boards | an uncertain present and board set; a solid roll would have to settle structure |

---

## 9. UI (`layoutOf(state)`)

Uses only what the board component has today (boards, areas `frame` / `wood` / `river`, lines under the cells,
outlines above them, labels, cell shades including `danger`, focus with a key, `zoomable`) plus H6 (focus box, zoom
cap, touch panning and pinch), H11 (turn-wide last-move marks), H12 (no "Flip board") and H13 (threat outlines).
Prototype: `handoff/tmp/mv-final/layoutf.mjs`, with the review changes in `handoff/tmp/mvf-review/layoutf.mjs`.

### 9.1 Geometry (one square = 1 unit)

- Column pitch `n + gx` (gx 1.1 for n ≤ 6, 1.6 for n ≥ 7), row pitch `n + gy` (1.6 / 2.0); left margin 3.0 (row
  labels), top margin 2.6 (header and "Now").
- **Rows**: the existing rows ordered by l: Black's timelines on top, White's below (White's "forward across
  timelines" is up, like its pawns). With `view: 'black'` the order is reversed and every board is turned 180°;
  time still runs left to right.
- **Columns**: every stored board's v, plus `en + 1` of every row the side to move may play (the placeholder column).
  Between two columns whose v differ by more than 1: a 1.2 gap with a "⋯" label.
- `width` = content width; `height = max(content height, 0.75 · width)`, content centred, so a zoomed window on a
  phone in portrait shows whole boards.
- `size` = the worlds' `board.length`; the layout is memoised by skeleton + view + recent records + threats (64
  entries).

### 9.2 Cells, boards, areas

- Cells: every square of every stored board (only the n×n part). Latest boards `dark` / `light`; history `mid` /
  `light` (washed out); threatened royal squares of the side to move `danger`.
- Boards: frame per stored board; label latest `L+1 T5 ●`, history `T4 ○`; a latest board the side to move may play
  adds " · must move" or " · optional" (text as well as colour, docs/rules.md principle).
- Areas: the present band (`frame`, "Now" above it); halo `wood` (gold) around must-move boards, `river` (blue)
  around optional ones.

### 9.3 Lines and outlines

- **Branch connectors** (lines): from the right edge of the parent board (or the left margin of the parent row when
  the parent board is sealed) to the left edge of the row's first shown board.
- **Threat lines** (**outlines** with `kind: 'threat'`, H13, so they are drawn above the opaque cells in the danger
  colour; 5D check): from the attacker's square to each threatened royal square (from the phantom list, which the
  danger line already generated and the core caches per world).
- **Next-board placeholders** (outlines): a rectangle in the column after each playable row's latest board, labelled
  `T3 ○`, so players see where their move will put the board.
- **Travel arrows** (outlines): for the current turn and the opponent's last turn (the same records as
  `lastMoveMarks`), each `record.info.arrows` entry whose two boards are shown: a shaft from the centre of the square
  left to the centre of the square reached, and two 0.4 heads at ±25°. Linked travels get one; a Missed outcome has
  none.
- **Last-move marks** come from `lastMoveMarks(state)` (6.14, H11): every move of the opponent's last turn and of the
  turn in progress, from the records' `info.cells` in absolute board coordinates, drawn on the boards those moves
  produced. A branch marks its arrival on the new row, not the past target (whose ring slot the source row's own
  advance may already have reused: a branch onto the oldest stored board, the full travel reach). The record's own
  `from` / `to` (CC U1) are not used for the marks.

### 9.4 Labels and names

- Row labels in the left margin: `L0`, `L+1`, `L−1`, `L−0`, `L+0`; a second line "inactive" or "new" (a row opened in
  the last two turns).
- "⋯" in gap columns and left of a row whose older boards are sealed; header "New timelines: White 1/3 · Black 0/3".
- `names[sq]` = "Timeline +1, turn 4, Black to move: c3" for every drawn square (screen readers; the board's aria
  label reads "… c3: Knight (50 %)").

### 9.5 Focus, zoom, phone

- Box: the must-move boards of the side to move; if none, its playable boards; else the present column.
- `zoom = clamp(min(width / max(boxW + 2, 2.2 · pitch), height / (boxH + 2)), 1, 4)` (the fine-pointer zoom);
  `focus.box = { w, h }` (H6): on touch screens the component zooms so that one unit is at least 28 px (a 5×5 board is
  then 140 px, two boards fit a 360 px phone; an 8×8 board 224 px). That needs zooms up to about 12 on Standard (the
  layout is up to 157 units wide), so H6 lifts the component's zoom cap of 8 for such layouts; with the cap an 8×8
  board would get only about 18 px per unit (146 px).
- `focus.key = [side to move, present, number of rows, must-move rows, view]`: the view recentres when the boards to
  play change (a must-move board played, a timeline opened, the turn passed), not after a move on an optional board,
  and not when only pieces change (CC U2).

### 9.6 Submit button, danger line, player rows, move list

- The action button shows `submitLabel` (6.12); disabled while `submit` is illegal.
- The danger line (generic) reads "Your king is in danger: N %"; in the multiverse this is the 5D check (8.4).
- Player rows: `sideInfo` "Timelines 1/3 · Must move: (0T5), (+1T5)"; budget pips from `budgetInfo`.
- Move list: `codeText(code, record)` and `infoText(record)` lines (6.14).

### 9.7 Phone behaviour

Default Small 5×5 with at most 7 rows: 850 cells in the largest measured state (reach 2). Standard 8×8 with reach 4
drew up to 3,520 cells (55 boards), so its description says "best on a laptop" and the reach option offers 2 turns
(1,280 cells in the largest measured state). The measured UI step at the worst states is 40–123 ms on desktop
(0.1–0.6 s on a phone); typical states are far cheaper. Zoomed in, the multiverse is wider than the screen, so other
rows are reached by panning with one finger or pinching (H6 c), by "Whole board" (about 3–6 px per unit) or by the
focus, which recentres whenever the boards to play change. Test U7 checks drag and pinch with Playwright touch
emulation.

### 9.8 What stays the same as other variants

Move, Split, Merge, Measure modes; the roll box; undo; resign; the budget pips; the danger line; zoom buttons,
Ctrl + wheel, drag to pan with a mouse. Touch drag and pinch come with H6 c (today a one-finger drag is taken by the
browser, and there is no pinch handler).

### 9.9 Black at the bottom

`sides[1].rotate = 0` (a 180° rotation would reverse time) and the `view` option (rows reversed, boards turned). The
new-game dialog preselects `black` when the human plays Black against the computer (H10). For the same reason the
declaration sets `flipBoard: false` (H12): the game view hides "Flip board", which would otherwise rotate the whole
multiverse 180° (time running right to left, the rows mirrored). The view is chosen at the start of the game.

---

## 10. Test scenarios (exact expected results)

All except the app tests U6 and U7 are implemented in `handoff/tmp/mvf-review/scenf.mjs` (143 checks, all passing on
the patched working-tree core with the review fixes; the first 120 are those of `handoff/tmp/mv-final/scenf.mjs`,
with the expectations of section 15 applied). Every position below is reachable: a row created by White starts on a
Black board (odd `st`, parent board even), one created by Black on a White board (the fuzz and the test helper assert
it).

Notation: `S` = new game (defaults: Small, cap 3, reach auto); `S1` = `S` + `(0)d1-(0)c3|(0)e3`; positions from
`buildWorld({ n, h, m, md, s, c, rows: { l: { st, en, parent: [u, v], boards: { v: fen } } } })` (FEN ranks top to
bottom, `*` after K, R, P, W = unmoved, history pieces get their cell ids); `setId` gives a piece the same id in
several worlds (a ghost); "certain" = one outcome, not rolled; `oc` = outcome keys with percentages; worlds 50/50
unless noted.

### Structure and classical rules

1. **S1 Start.** Keys exactly `(0T1)d1-e3 (0T1)d1-c3 (0T1)a2-a3 (0T1)b2-b3 (0T1)c2-c3 (0T1)d2-d3 (0T1)e2-e3`;
   `splitsFrom((0)d1)` = `[(0)d1-(0)c3|(0)e3]`; `submit` illegal; `h = 4`, `m = 3`, budget limit 8. Standard: `h = 8`,
   20 keys.
2. **S2 A move makes a board.** `S`, `(0T1)d1-c3`: turn 1; `tl[0] = [2, 3, null, null]`; `(0)~3d1` holds `hn`.
3. **S3 Branch.** Then `(0T1)a4-a3`: branch keys exactly `(0T2)c3>>(0T1)a3`, `…c5`, `…e3`. After `(0T2)c3>>(0T1)a3`:
   `tl[L0] = [2, 5]`, `tl[L+1] = [3, 3, 0, 2]`, created `[1, 0]`; the knight 100 % `(+1)a3`; its past self on `(+1)d1`
   (type `n`); Black to move, must move `[+1]`, `submit` illegal.
4. **S4 Optional boards and Submit.** Then `(+1T1)e4-e3`: still Black, no must-move board, `submit` legal. After
   `submit`: White, must move `[+1]`. After `(+1T2)b2-b3`: Black (the turn passed by itself), `submit` illegal.
5. **S5 One jump clears two boards.** White, created `[1, 0]`; L0 `[2, 10]` `4k/5/R4/5/K4`, L+1 `[9, 10]`
   `4k/5/5/5/K4`: must move `[0, +1]`; `(0T5)a3>(+1T5)a3` certain; both ends 11; Black to move.
6. **S6 An active branch moves the present back.** Created `[0, 1]`; L0 `[2, 10]` (10: `4k/5/5/5/K3R`, 8:
   `4k/5/5/5/K4`), L−1 `[10, 10]` (parent `[0, 9]`): must move `[0, −1]`; after `(0T5)e1>>(0T4)e1`: L+1 `[9, 9, 0, 8]`,
   present 9, White still to move, `submit` legal, no must-move board.
7. **S7 An inactive branch does not.** Created `[1, 0]`, L+1 `[7, 10]`: the same move opens L+2 `[9, 9, 0, 8]`,
   inactive; present 10; `submit` illegal; must move `[+1]`.
8. **S7b Reactivating the opponent's timeline can bring the present back to your own board.** Black to move, created
   `[2, 0]`; L0 `[2, 11]` (11: `4k/5/5/3r1/K4`, 9: `4k/5/5/5/K4`), L+1 `[9, 12]` (parent `[0, 8]`, 12: `4k/5/5/5/K4`),
   L+2 `[7, 7]` (parent `[0, 6]`, 7: `4k/5/5/5/K4`; inactive): present 11, must move `[0]`. After
   `(0T5)d2>>(0T4)d2`: L−1 `[10, 10, 0, 9]`, L+2 active, present 7 (a Black board), must move `[+2]`, `submit`
   illegal, Black still to move.
9. **S8 The cap.** m = 1, created `[1, 0]`, a Black king on (0T3 ○) e1: the only `>>` key is `(0T5)e1>>(0T3)e1`;
   afterwards `{ winner: 0, reason: 'king' }`, created still `[1, 0]`, 2 rows.
10. **S9 A king in the past.** L0 `[6, 10]` (10: `3k1/5/4N/5/K4`, 8 and 6: `4k/5/5/5/K4`): `royalDanger(Black) = 1`;
   `(0T5)e3>>(0T4)e5` = `capture 100 certain`; result `king` for White.
11. **S10 The reach.** Rook on (0T5) e3, L0 `[2, 10]`: reach 2 → time keys exactly `(0T5)e3>>(0T4)e3`,
    `(0T5)e3>>(0T3)e3`; reach 4 → also `…(0T2)e3`, `…(0T1)e3`.
12. **S11 Own past self blocks.** A rook on a1 on boards 6, 8, 10: no `(0T5)a1>>` key.
13. **S12 Pawn directions, T–L capture.** Created `[0, 1]`; L0 `[2, 10]` `4k/5/5/2P2/K4`; L−1 `[8, 10]` (parent
    `[0, 7]`; 10: `4k/5/5/5/K4`, 8: `4k/5/5/2n2/K4`): keys from c2 exactly `(0T5)c2-c3`, `(0T5)c2>(−1T5)c2`,
    `(0T5)c2>>(−1T4)c2`; the last is `capture 100 certain`.
14. **S13 Double step, en passant.** `4k/3p*1/5/2P*2/K4`: `(0T5)c2-c4`, then `(0T5)d4-c3` has kind `ep`, `capture
    100 certain`; afterwards `(0)c4` is empty.
15. **S14 Promotion.** `4k/1P3/5/5/K4`: the only key from b4 is `(0T5)b4-b5=Q`; afterwards `(0)b5` holds `q`.
16. **S14b A brawn promotes by a capture into the past.** L0 `[2, 10]` (10: `4k/3W1/5/5/K4`, 8: `3rk/5/5/5/K4`): keys
    from d4 exactly `(0T5)d4-d5=Q`, `(0T5)d4-e5=Q`, `(0T5)d4>>(0T4)d5=Q`; after the last, `(+1)d5` holds `q`.
17. **S15 Castling.** `k4/5/5/5/K*3R*`: `(0T5)a1-c1` → `(0)c1` king `k`, `(0)b1` rook `r`.
18. **S16 Unicorns and dragons.** Just Unicorns and Just Dragons start with exactly `(0T1)a1-a2`, `(0T1)a1-b2`. Just
    Unicorns after `(0T1)a1-a2`, `(0T1)e5-e4`: the unicorns have exactly `(0T2)b1>>(0T1)a2`, `(0T2)b1>>(0T1)c2`,
    `(0T2)d1>>(0T1)c2`, `(0T2)d1>>(0T1)e2`.
19. **S17 Brawn.** Three-row start (−1) `4k/5/2p2/1p1p1/K4` · (0) `4k/5/5/2W*2/K4` · (+1) `4k/5/5/5/K4`: keys from
    c2 exactly `(0T1)c2-c3`, `(0T1)c2-c4`, `(0T1)c2>(−1T1)b2`, `(0T1)c2>(−1T1)c2`, `(0T1)c2>(−1T1)c3`,
    `(0T1)c2>(−1T1)d2`.
20. **S18 Even start.** Two Timelines: must move `[−0, +0]`, 44 keys; the jumps exactly `(+0T1)b1>(−0T1)b3`,
    `(+0T1)g1>(−0T1)g3`, `(−0T1)b1>(+0T1)b3`, `(−0T1)g1>(+0T1)g3`; after `(−0T1)b1>(+0T1)b3` both ends are 3 and Black
    is to move.
21. **S19 Turn Zero.** After `(0T1)g1-f3`: Black's keys into T0 exactly `(0T1)b8>>(0T0)b6`, `(0T1)g8>>(0T0)g6`.
22. **S20 Royal types.** Live royal types `k0 k y`; solid `c k k0 p p0 w w0 y`. `yc3/5/2N2/5/YC3`: `(0T5)c3-b5`
    (takes the common king) → no result; `yc3/5/1N3/5/YC3`: `(0T5)b3-a5` (takes the royal queen) → `king` for White.
23. **S21 An even start never wraps a line.** Even start, created `[3, 3]`, rows −3 … +3 (shown) all ending at 10
    (`4k/5/5/5/K4`), a White knight on `(+3)b1` and one on `(−3)b1`: no key from them lands on −0 or +0;
    `(+3T5)b1>(+2T5)b3` and `(−3T5)b1>(−2T5)b3` exist.

### Quantum

24. **Q1 Split.** `S1`: 2 worlds of weight 8,388,608, White budget 2, `tl[0] = [2, 3]`, Black to move.
25. **Q2 A ghost travels (link).** `S1`, `(0T1)a4-a3`: `oc((0T2)c3>>(0T1)e3)` = `move 100 certain`; after it the
    knight is `(0)e3 50 / (+1)e3 50`, L+1 `[3, 3, 0, 2]` in every world, budget 2.
26. **Q3 A probe.** Then `(+1T1)e4-e3` = `miss 50 / move 50`; after Missed: 1 world, knight 100 % `(+1)e3`, L+1
    `[3, 4]` (the board passed), Black to move, `submit` legal.
27. **Q4 Pass = link through the past.** Two worlds, L0 `[6, 10]`; a Black knight went c3 → b1 (A) or c3 → d1 (B) at
    T3 ●; White king e3, bishop a1: `(0T5)a1>>(0T3)c1` certain; the bishop is `(0)a1 50 / (+1)c1 50`; budgets 2 / 2.
28. **Q5 Land = roll in the past.** Same position: `(0T5)a1>>(0T4)b1` = `move 50 / capture 50`; after Captured: 1
    world, `(0)b1` holds a knight 100 % (the present settled by shooting the past).
29. **Q6 Time split.** `S`, `(0T1)d1-c3`, `(0T1)a4-a3`: split targets of `(0)c3` exactly `(0)d1 (0)a4 (0)~3a3 (0)~3e3`
    ((0)~3c5 holds the bishop); `(0)c3-(0)~3a3|(0)~3e3` = `split 100 certain`; afterwards 2 worlds, the knight `(+1)a3
    50 / (+1)e3 50`, L+1 `[3, 3, 0, 2]`, created `[1, 0]`, Black to move.
30. **Q7 Two boards.** `(0)c3-(0)a4|(0)~3e3` is illegal.
31. **Q8 Jump split.** Created `[1, 0]`, L0 `[2, 10]` `4k/5/2N2/5/K4`, L+1 `[9, 10]`: `(0)c3-(+1)a3|(+1)e3` = `split
    100 certain`; the knight `(+1)a3 50 / (+1)e3 50`; both ends 11; Black to move.
32. **Q9 Merge on another timeline; not across boards.** Then `(0T5)e5-d5`, `(+1T5)e5-d5`: `(+1)a3|(+1)e3-(+1)c4` =
    `move 100 certain`; the knight 100 % `(+1)c4`; still 2 worlds and budget 2 (memory). After `S1`, `(0T1)a4-a3`,
    `(0T2)c3>>(0T1)e3`, `(+1T1)b4-b3`, `submit`: no merge is legal (parts on two boards).
33. **Q10 Which-path memory.** `S1`, `(0T1)a4-a3`, `(0)c3|(0)e3-(0)d1`: 2 worlds, budget 2, `info.memory = [0, 4]`
    ("until (0T2) ○ is sealed"); after `(0T2)b4-b3`, `(0T3)e2-e3`, `(0T3)c4-c3`: still 2 / 2 (L0 end 8); after
    `(0T4)d1-c3`: 1 world, budget 1 (L0 end 9).
34. **Q11 Measuring uses the board.** `S1`, `(0T1)a4-a3`: measures offered exactly `?(0)c3`, `?(0)e3`; `?(0)c3` =
    `(0)c3 50 / (0)e3 50`; after the first: 1 world, L0 end 5, Black to move.
35. **Q12 Only on a board you may play.** `S1`, `(0T1)a4-a3`, `(0T2)c3>>(0T1)e3`, `(+1T1)b4-b3`, `submit`: White to
    move, must move `[+1]`; the knight's parts stand on `(0)e3` (a Black board now) and `(+1)e3`: `?(0)e3` illegal,
    `?(+1)e3` legal, the only measure offered is `?(+1)e3`.
36. **Q13 Twins.** `S1`, `(0T1)a4-a3`, `(0T2)b2-b3`, `(0T2)d5>>(0T1)d3`: L−1 `[4, 4, 0, 3]`; twins `(−1)c3` n 50 %
    and `(−1)e3` n 50 %; White budget 2; must move `[−1]`; `?(−1)c3` = `gone 50 / (−1)c3 50`; after `(−1)c3`: 1
    world, `(0)c3` knight 100 %, budget 1.
37. **Q14 A rolled Missed still opens the timeline.** `S1`, `(0T1)a4-a3`: `(0T2)c3>>(0T1)c5` = `miss 50 / capture
    50`; after Missed: L+1 `[3, 3, 0, 2]`, created `[1, 0]`, `(+1)c5` holds the bishop, Black to move.
38. **Q15 Game-end roll in the past.** Worlds A (knight c3) / B (knight a3), L0 `[6, 8]`, the Black king e3 at
    (0T3 ○): danger for Black 0.5; `(0T4)c3>>(0T3)e3` = `miss 50 / capture 50`; Missed: no result, 1 row, L0 end 9,
    created `[0, 0]`; Captured: `king` for White.
39. **Q15b A merge onto a king in the past opens no row in any outcome.** L0 `[2, 10]` with (0T3 ○) = `4k/5/5/5/K1k2`;
    world C (weight 2) has no knight, world A a knight on b1, world B the same knight id on d1: `(0)b1|(0)d1-(0)~3c1` =
    `miss 50 / capture 50`; Missed: no result, created `[0, 0]`, 1 row, L0 end 11; Captured: `king` for White.
40. **Q16 Converging capture.** Black to move, king c5; a White knight 50 % b3 / 50 % e4: `royalDanger(Black) = 1`
    (the merge onto c5 captures in every world).
41. **Q17 The same danger before and after Submit.** Black to move, king c5; world A a White knight b3, world B a
    White bishop a3 (different pieces): `royalDanger(Black) = 0.5`; after `(0T5)e5-e4` (the turn passes) still 0.5.
42. **Q18 One skeleton.** After every action of this list, every world has the same `solidExtra` (also asserted by
    the fuzz after every ply).
43. **Q19 Budget fallback.** Q4's state with `budgetRule: () => ({ limit: 1 })`: `(0T5)a1>>(0T3)c1` = `miss 50 /
    move 50` (rolled); the Missed state has L+1 `[7, 7, 0, 6]` and `(+1)c1` empty.
44. **Q20 Budget 8 everywhere.** Limits of Small, Standard, Two Timelines, Timeline Marauders: 8, 8, 8, 8.
45. **Q21 A piece absent from the first world merges.** Worlds C (no knight, weight 2), A (knight c3), B (knight e3),
    one id: `ty` in world 0 is `''`; the knight `off 50 / (0)c3 25 / (0)e3 25`; `(0)c3|(0)e3-(0)d1` = `move 100
    certain` (no exception).
46. **Q22 Castling is certain-only.** `k4/5/5/5/K*2NR*` with the knight 50 % d1 / 50 % b2: `(0T5)a1-c1` illegal; with
    the knight 50 % b2 / 50 % b3: `move 100 certain`.
47. **Q23 En passant after a linked world.** A White knight 50 % a2 / 50 % c1 (off the lines): after `(0T5)c2-c4`,
    `(0T5)d4-c3` = `capture 100 certain`.
48. **Q24 Rejoin across timelines.** A knight 50 % (0)a3 / 50 % (+1)c3: `(0T5)a3>(+1T5)c3` = `move 100 certain`;
    afterwards 100 % `(+1)c3`.
49. **Q25 Merge into the past.** A knight 50 % (0)b1 / 50 % (0)d1 at (0T5 ○): `(0)b1|(0)d1-(0)~3c1` = `move 100
    certain`; afterwards 100 % `(+1)c1`, L+1 `[7, 7, 0, 6]`, still 2 worlds (memory).
50. **Q26 A partial slide loses castling.** `k4/5/4n/5/K*3R*` / `k4/5/1n3/5/K*3R*` (one Black knight id):
    `(0T5)e1-e4` = `move 100 certain` (linked); the rook is `(0)e1 50 / (0)e4 50` with type `r` in both worlds; after
    `(0T5)a5-b5` and the measurement outcome `(0)e1`: the rook 100 % `(0)e1`, type `r` (no castling key).
51. **Q27 Stuck.** Timeline Marauders: must move `[0, −1, +1]`, 34 keys, 8 of them jumps onto (−1). After
    `(0T1)a1-a2`: 5 jumps onto (−1) left, no result. After `(+1T1)b2-b3` (White stranded its own turn):
    `{ winner: 1, reason: 'stranded' }`. At the start of a turn: L0 `[2, 10]` `4k/5/5/5/5` must move with no White
    piece, L+1 `[9, 11]` `4k/5/5/5/r3K`: `hasLegalMove` false, `noMoves` = `{ winner: 1, reason: 'checkmate' }`; with
    `4k/5/5/5/4K` on L+1: `stalemate`.
52. **Q27b A branch from a must-move row is no way out.** Timeline Marauders after `(0T1)c1>(−1T1)c1`, `(+1T1)a1-a3`,
    `(0T1)c5-c3`, `(−1T1)b5>(+1T1)b5`, `(+1T2)b1>(0T2)b1`, `(−1T2)c1-c2`, `(+1T2)b5-b2`, `(−1T2)c5>>(0T1)b4`,
    `(0T2)e5-e3`, `(−2T2)a1-a2`, `(+1T3)c1-b2`, `(−1T3)c2-c3`, `(0T3)b1-b4`, `(−2T2)b4>>(−1T1)a4`,
    `(−1T3)c4>(0T3)b4`, `submit`, `(−2T3)e1-e3`, `(−1T4)c3-d4`, `(−3T2)c1-c2` (no rolls): no result, and
    `moveWarning('(0T4)a1-a2')` = the draw note. After `(0T4)a1-a2`: Black to move, must move `[+1, −2]` (no Black
    piece on +1, created `[0, 2]`), `{ winner: null, reason: 'stalemate' }` at once. (The first version's step 6 let
    the game go on, and Black could still turn it into a loss.)
53. **Q27c Jumps that need the same board.** Cap 1, Black to move, created `[1, 1]`; L0 `[2, 9]` (9: `r3k/5/5/5/2K2`),
    L+1 `[7, 9]` (parent `[0, 6]`, empty), L−1 `[8, 9]` (parent `[0, 7]`, 9: `5/5/2w2/2P2/5`): must move `[0, −1, +1]`;
    the brawn's only key is `(−1T4)c3>(0T4)c3`, and +1 can only be reached from L0. Every order strands (the rook's
    jump uses L0 before the brawn can; the brawn's jump uses L0 before +1 is reached; a branch is over the cap), so
    `stuck` is true and the result is `stalemate` (with `x.t = 1`, i.e. after an own action: `stranded`, winner
    White). The first version's matching (keyless +1 ← L0) said "not stuck".
54. **Q28 The stuck test ignores pruning.** Q27's state after `(0T1)a1-a2` in the computer's view (`x.ai`): not stuck;
    after `(+1T1)b2-b3` in that view: stuck.
55. **Q29 A measurable part is a way out.** m = 1, created `[1, 0]`; L0 `[2, 10]` must move with blocked pawns and a
    White knight part on a1 (world A) whose other part stands on (+1)c3 (world B); no key departs from L0: not stuck,
    `?(0)a1` offered; after measuring, L0 ends at 11 and Black is to move.
56. **Q30 Strand warning.** Q27 after `(0T1)a1-a2`: `moveWarning('(+1T1)b2-b3')` = "After this move you cannot
    finish your turn: you lose"; `moveWarning('(+1T1)b1>(−1T1)b1')` = null.
57. **Q30b No warning for a winning move.** White, created `[1, 0]`; L0 `[2, 10]` `5/5/5/5/K4`, L+1 `[9, 12]` (parent
    `[0, 8]`) `R3k/5/5/5/K4`; after `(0T5)a1-a2`: `moveWarning('submit')` = null, and `submit` gives
    `{ winner: 0, reason: 'checkmate' }`. Without the rook on L+1: `moveWarning('submit')` = "After this move your
    opponent cannot finish their turn: the game ends in a draw", and `submit` gives `stalemate`.
58. **Q30c The draw note in play.** Q27b: `moveWarning('(0T4)a1-a2')` is the draw note, not the loss text.

### Limits, records, UI, computer

59. **L1 Limits.** `ply = 1199` + any move → `moveLimit`; `quiet = 299` + a knight move → `quiet`; a pawn move resets
    `quiet` to 0.
60. **R1 Records.** After S3's branch: `info = { rows: [2], arrows: [[0, 4, 2, 2, 2, 3, 0, 2]], back: 3, cells:
    [[0, 5, 2, 2], [2, 3, 0, 2]] }`. After Q6's time split: `info.text = '(0T2)c3 split (0T1)a3 | (0T1)e3'`. After
    Q14's Missed: `{ rows: [2], arrows: [], back: 3, cells: [[0, 5, 2, 2], [2, 3, 2, 4]] }`.
61. **R2 Last-move marks.** A rook on (0T5) e3, L0 `[2, 10]`, reach 2: after `(0T5)e3>>(0T3)e3` (onto the oldest stored
    board, whose slot L0's own advance reuses) `lastMoveMarks` = `(0)e3`, `(+1)e3` (not `(0)~3e3`). White, created
    `[1, 0]`, L0 `[2, 10]` and L+1 `[9, 10]` (parent `[0, 8]`), both `4k/5/5/5/K3R`: after `(0T5)e1-e2`, `(+1T5)e1-e3`
    (the turn passes)
    the marks are `(0)e1`, `(0)e2`, `(+1)e1`, `(+1)e3`; after Black's `(0T5)e5-d5` they are `(0)~4e1`, `(0)~4e2`,
    `(+1)e1`, `(+1)e3`, `(0)e5`, `(0)d5` (White's marks on L0 followed their board into the past).
62. **U1 Start layout.** 25 cells; boards `['L0 T1 ○ · must move']`; areas `frame`, `wood`; 4 outlines (the
    placeholder); `height ≥ 0.75 · width`.
63. **U2 After a branch.** Row labels `L0`, `L+1` + "new"; areas `frame`, `river`, `wood`; 1 line (the connector)
    and 1 outline of kind `threat` (Black is in 5D check, danger 1, the tinted square is `(0)~1a5`: the White knight
    on L+1 can take the king on (0T2 ○) a5).
64. **U3 Focus key.** After S3's branch: `(0T2)b4-b3` (optional board) keeps the key; `(+1T1)e4-e3` (the must-move
    board) changes it.
65. **U4 Danger display.** Black to move, king c5, a White knight b3 (L0 `[6, 11]`): the tinted squares are exactly
    `(0)c5`; no line, one outline of kind `threat`.
66. **U5 Names.** `names[(+1)a3]` = "Timeline +1, turn 1, Black to move: a3".
67. **U6 No flip.** The declaration has `flipBoard: false`; the game view shows no "Flip board" button, and the board's
    rotation stays 0 for both sides (app test).
68. **U7 Touch (app, Playwright touch emulation).** On a zoomed multiverse, a one-finger drag pans (the centre moves,
    no `pointercancel` ends it), a two-finger pinch changes the zoom around the midpoint, and on a 360 px wide screen
    a Standard layout reaches 28 px per unit at the focus.
69. **A1 The computer's view.** After S3's branch (Black: L+1 must move, L0 optional): the pruned keys are a proper
    subset of the legal keys and each starts with `(+1T1)` or jumps onto it.
70. **A2 The computer takes a king.** S9's position: `chooseMove` (normal) returns a move whose result is `king` for
    White.
71. **A3 Self-play.** Normal vs normal on Small, 8 seeds: every ply legal, no failed search, every game ends by
    `king`. Timeline Marauders, 8 seeds normal vs normal and 8 easy vs easy: every `checkmate` / `stalemate` result
    arises at the start of the stuck side's turn (the last history record's side ≠ the side to move); a `stranded`
    result only when every alternative loses too (measured: 1 in 16 games, a choice between stranding and a king
    captured at once).
72. **A4 No blind blunder inside a turn.** White must move on L0 and L+1 (created `[1, 0]`; L0 `[2, 10]`
    `1p3/2p1k/5/5/K1Q2`, L+1 `[9, 10]` `4k/3pp/5/5/K4`): over 6 seeds at the normal level, White's turn never ends with
    its queen capturable (the first version played `(0T5)c1-c4`, taking a pawn defended by b5, in every seed).
73. **A5 The view keeps the way out.** Timeline Marauders after `(+1T1)a1-a3`, `(0T1)a1>(−1T1)a1`, `(−1T1)b4>(+1T1)b4`,
    `(0T1)c5-c3`, `(+1T2)a3-b4`, `(0T2)e1-e3`, `(−1T2)a1-a2`, `(0T2)c3>(+1T2)c2`, `(−1T2)c5>>(0T2)d5`,
    `(+1T3)c1-c2`, `(0T3)c1-c3`, `(−2T3)e3-e4`, `(−1T3)a2-a3`, `(−2T3)d5-e4`, `(0T3)a5-a3`, `(−1T3)b5>(+1T3)b5`,
    `(+1T4)c2>>(+1T3)c2`, `submit` (no rolls): Black must move on +2 (no Black piece there); `aiView` contains
    `(+1T4)b5>>(+1T2)b5` (a new active Black row at T2 moves the present back, Submit becomes legal) and not
    `(+1T4)b5>>(+1T3)b5`; `chooseMove` (easy, 4 seeds) never strands.

**Invariants** (the fuzz and every test, after every ply): weights sum to T; `sq` / `board` agree in every world;
`solidExtra` equal in all worlds (it includes `x.t`); solid pieces equal in all worlds; used budget ≤ limit for both
sides; worlds ≤ the product of the budgets; the side to move equals `x.s`; the opponent's move never raises a budget;
no `solid:` roll note ever; castling illegal after any partial slide; a twin split and merge never throws; a row
created by side c has `st ≡ c + 1` and `pv ≡ c` (mod 2); a position the stuck test calls "not stuck" has an action
after which the mover is not stranded (checked on self-play). Measured: Small 12 games
(705 plies, up to 64 worlds, 7 rows, 71 splits, 8 measures, 19 links), Standard 4 × 80, Two Timelines 3 × 60,
Timeline Marauders 8 games: all invariants hold, no structural roll.

---

## 11. Player-facing texts

### 11.1 `rules()` (eight strings)

```js
rules: () => [
	t('quantumchess', 'Each row is a timeline and time runs to the right. You play only on the latest board of a timeline, when it is your move there (○ White, ● Black). Every move adds a new board; the old ones stay as the past.'),
	t('quantumchess', 'On your turn move once on every board marked “must move” (the present, “Now”); boards marked “optional” you may play too. The turn ends by itself when no board is left, otherwise press Submit turn. Each move is rolled at once; Undo never changes a roll.'),
	t('quantumchess', 'Pieces move along files, ranks, back in time (one step is one turn) and across timelines, keeping their pattern: rook one axis, bishop two, unicorn three, dragon four, queen any. Landing on the latest board of another timeline jumps there; landing on an older board opens a new timeline that only your piece enters.'),
	t('quantumchess', 'Pawns and brawns step forward or one timeline towards the opponent, capture diagonally or one timeline forward and one turn back or ahead, and become queens. Capture any enemy king or royal queen, also one in the past, to win. Each player may open 1 to 3 timelines; old boards are sealed after the travel reach.'),
	t('quantumchess', 'Boards are certain, pieces are quantum: which boards exist, the present and whose turn it is are the same in every possibility. Timelines are AND, possibilities are OR.'),
	t('quantumchess', 'A move always makes its boards; the dice only decide what happens to the piece. So a ghost can travel: where it really stood it arrives, elsewhere the new boards appear without it. A Missed move and a Measure still use their board.'),
	t('quantumchess', 'Both halves of a split land on one board: yours, another timeline’s latest board, or a board in the past. Merges start from one board. You measure only a part on a board you may play. The past is quantum too: new timelines copy ghosts as twins, and after a merge the past remembers both paths until those boards are sealed.'),
	t('quantumchess', 'If your turn cannot be finished from its start, the game ends at once: you lose if a king of yours can be taken for certain (checkmate), otherwise it is a draw (stalemate). A move after which you could not finish your turn loses; the game asks before you play it.'),
],
```

### 11.2 Documentation (`docs/variants.md`)

```markdown
### Multiverse chess (5D)

*5D Chess With Multiverse Time Travel*, with ghosts. Start with **Small** (5×5) or **Very small and open** (4×4);
**Standard** (8×8) is the real, long game and is best on a laptop.

- **Timelines and turns.** Each row is a timeline and time runs to the right. On your turn you move once on every
  board marked *must move* (the present, *Now*), may move on your *optional* boards, and the turn ends by itself or
  with **Submit turn**.
- **Time travel.** Pieces also move back in time (one step is one turn) and across timelines. Landing on another
  timeline's latest board jumps there; landing on an older board opens a new timeline. Each player may open 1 to 3
  timelines, and pieces can travel back 2 turns on small boards and 4 on large ones.
- **All official pieces.** Rook, bishop, queen, king, knight and pawn keep their pattern in all four directions; the
  unicorn moves along three axes at once, the dragon along four, the princess like a rook or bishop, the brawn like a
  pawn with extra captures; the royal queen is royal, the common king is not. 21 official start positions.
- **Boards are certain, pieces are quantum.** Which boards exist, the present and whose turn it is are the same in
  every possibility; only the pieces on them (now and in the past) can be ghosts. Timelines are AND, possibilities
  are OR.
- **A move always makes its boards.** The dice only decide what happens to the piece: a ghost that travels arrives
  where it really stood and stays home elsewhere, linked. A Missed move and a Measure still use their board.
- **One board per split.** Both halves of a split land on one board (yours, another timeline's latest board, or a
  past board, which opens a timeline); merges start from one board; you measure a ghost through a part on a board you
  may play.
- **The quantum past.** Old boards show ghosts with their chances; landing on them is a roll; new timelines copy
  ghosts as *twins*; after a merge the past remembers both paths (and they count for your budget of 8) until those
  boards are sealed.
- **Winning.** Capture a king or royal queen on any board, also in the past. The danger line is 5D's check: the
  chance your opponent could take a king if you ended your turn now. If your turn cannot be finished from its start,
  the game ends: checkmate when a king of yours can be taken for certain, otherwise stalemate (a draw). A move after
  which you could not finish your turn loses; the game asks first.
- **Differences from the original.** Capture the king instead of the check rule, so the original stalemate (not in
  check, but every turn would leave a king in check) is not a draw here: you play your turn and your king can be
  taken. Castling is allowed out of, through and into danger. Moves inside a turn are played and rolled one by one
  and cannot be rearranged before you submit, so a move that strands your own turn loses. At most 3 new timelines
  per player and a travel reach; castling and en passant only when certain; Undo replays the same rolls; draws after
  300 moves without a capture or pawn move and after 1,200 moves. As in 5D, pawns and brawns always become queens
  (in Quantum Chess you would choose).
```

### 11.3 Other texts

- Reason texts (6.13, including `stranded`), `submitLabel` (6.12), `sideInfo` (6.14), `infoText` lines (6.14), the two
  `moveWarning` texts (6.14),
  board labels, "Now", "must move", "optional", "new", "inactive", the header, cell names (9.4): all through `t()` /
  `n()`.
- Glossary additions (`translationfiles/GLOSSARY.md`, section "Time and timelines"): must move / optional (board),
  twin, sealed (board), travel reach, unicorn, dragon, princess, brawn, common king, royal queen, checkmate,
  stalemate (here: a turn that cannot be finished from its start, not the official "every turn leaves a king in
  check"), stranded (a turn left unfinishable by the player's own move).

---

## 12. Deviations from the official game (for `docs/variants.md` and the rules page)

1. Capture a royal piece instead of the check rule; the danger line (with tinted squares and threat lines) replaces
   "you are in check"; a turn that cannot be finished from its start ends the game at once as checkmate (a royal
   piece can be taken for certain) or stalemate. A turn that would leave a king capturable is legal and loses the
   king. So **the official stalemate** (not in check, but every turn would leave a king in check) **is not a draw
   here**: you finish your turn and your king can be taken. "Stalemate" here means only a turn that cannot be finished
   at all.
2. At most 1–3 new timelines per player (a king in the past can still be captured after that); a travel reach of 2
   or 4 turns (sealed boards).
3. Moves inside a turn are played and rolled one by one; Undo replays the same rolls and marks the game as assisted.
   Since a move cannot be withdrawn the way the original lets you rearrange a turn before submitting, a move after
   which you cannot finish your turn loses the game (`stranded`); the game asks for confirmation first.
4. Castling without an attack test (out of, through and into danger); castling and en passant only when certain;
   promotion to a queen only (as in the base game of 5D; it differs from Quantum Chess, not from 5D); en passant is
   not possible on the first board of a new timeline and also works when the victim's square was occupied one turn
   earlier (the chess rule; 5d-chess-js differs).
5. 300 moves without a capture or pawn move, or 1,200 moves in all, draw.
6. The quantum rules of section 1.8.

---

## 13. Validation and reproduction

Prototype: `handoff/tmp/mv-final/` (ignored by git; not production code).

| File | What |
|---|---|
| `mvf.mjs` | the variant: encoding, setups, generation (all pieces), apply, `applyMiss`, `allowQuantum`, `unifyWorlds`, stuck test, `moveWarning`, records, AI hooks, `buildWorld` |
| `layoutf.mjs` | `layoutOf` (section 9) |
| `core/` + `patch-core.mjs` | a copy of the working-tree core (`quantum`, `ai`, `world`, `variant`, `topology`) with H1 patched in |
| `libf.mjs`, `scenf.mjs` | helpers; the scenarios of section 10 (`node scenf.mjs` → 120 passed) |
| `fuzzf.mjs` | random games with invariants (`node fuzzf.mjs small 12 150 3`) |
| `cross.mjs` | cross-check against 5d-chess-js 1.2.1 (`MVF_ROWS=13 MVF_HMAX=60 node cross.mjs <setup> <seed> <games> <plies> [reach] [cap]`) |
| `measuref.mjs`, `recsize.mjs`, `gencost.mjs` | sizes, UI cost and computer timings at 64 worlds (6.16, 6.17); saved-record sizes; per-world costs |
| `aitimesf.mjs`, `strand.mjs`, `aiprof.mjs` | computer matches with quantum-use counts; who created each stuck result; phase profile of one search |
| `out/` | the logs of every run quoted in this spec |

**Review prototype** `handoff/tmp/mvf-review/` (a copy of the above with every fix of section 15; it supersedes
`mvf.mjs`, `libf.mjs`, `layoutf.mjs` and `scenf.mjs` of `mv-final/`):

| File | What |
|---|---|
| `mvf.mjs` | the fixes, marked `REVIEW`: target-line range, branch promotion, `applyMiss` royal merge, `x.t` and the `stranded` rule (`MVF_STRAND=draw` restores the first version's draw), the completion search `stuck` (`MVF_STUCK=old` runs the first version's test, kept as `stuckOld`), `moveWarning`, `info.cells`, `lastTurnRecords`, `lastMoveMarks`, the evaluation scan with the hang term (`MVF_HANG`, `MVF_CONTEMPT`), the view escapes and fallback |
| `libf.mjs`, `layoutf.mjs`, `scenf.mjs` | the row-parity invariant; threat outlines and shared `lastTurns`; the scenarios of section 10 (`node scenf.mjs` → 143 passed) |
| `probe-sound.mjs` | self-play positions that are "not stuck" while every action strands (`node probe-sound.mjs marauders 30 easy`) |
| `probe-warn.mjs`, `probe-hang4.mjs`, `probe-prune.mjs`, `probe-undetected.mjs`, `diag*.mjs`, `extract.mjs` | the reviewers' probes run on the fixed prototype; diagnostics of stranded endings; move lists of self-play games for scenarios |
| `logs/`, `final/` | the runs quoted in sections 6 and 15 (`final/` on the finished copy: scenarios, fuzz on Small, Standard, Two Timelines, Timeline Invasion and Marauders, self-play, 64-world timings, cross-check) |

With the fixes the cross-check against 5d-chess-js 1.2.1 still matches on Two Timelines, Timeline Invasion, Timeline
Marauders, Just Knights and Standard (40 games each, reach 30, cap 4: 0 moves only in one generator), and Just
Brawns shows only the known brawn gap (18 last-rank brawn moves in 8 positions). All invariants hold in the fuzz
runs (Small 12 × 150, Standard 4 × 80 at reach 4, Two Timelines 3 × 60, Timeline Invasion 6 × 120, Timeline
Marauders 8 games), with no structural roll.

**Rules fidelity [measured].** All 21 setups, 40 random games each with reach and cap lifted (reach 30, cap 4):
18,357 positions, 2,224,883 reference moves. The generator produces **exactly the reference moves** except: castling
while attacked (80 positions; Quantum Chess has no check), en passant after a double step whose victim square was
occupied one turn earlier (31; the chess rule), and in Just Brawns 39 brawn moves onto the last rank in 13 positions
that 5d-chess-js 1.2.1 does not generate in a custom setup (a reference gap; the official rule promotes them), plus 8
check reports that follow from those. The present and "may submit" agree everywhere; the phantom check agrees in all
1,424 checked positions except those 8. (Even starts must be loaded into 5d-chess-js with `new Chess(fen)`; loading
them with `fen()` on a default board leaves a stray timeline 0.)

**Cost of the limits [measured]** (cap 3, random play; share of the reference moves removed by the reach, including
rides through sealed boards): Standard reach 4: 0.87 % (reach 2: 3.4 %); Two Timelines reach 4: 0.49 % (reach 2:
4.4 %); Small reach 2: 2.7 % (reach 4: 0.1 %); Small – Centered reach 2: 1.7 %; Very Small – Open reach 2: 1.0 %.
The cap removes far more in random play, which opens a timeline about once in ten moves.

**Open points for the lead** (none blocks the implementation): whether the recommended app items H5, H10 go in v1;
the phone render measurement of the 8×8 layout (9.7) and the touch test U7 on a real phone (H6 c); tuning the
computer to use links and measurements more often (6.16); the brawn gap of 5d-chess-js (report it upstream); the
`stranded` rule (F10), which this revision adopted (section 15, R1): reverting it to the first version's draw is one
line in `endResult` plus the texts, but reopens the escape from lost positions.

---

## 14. Must-fix index (every item of the three judges)

| Judge item | Resolution |
|---|---|
| Missed structure / one structural rule (player, engineer, physicist) | F3, 4.5, 6.9; tests Q3, Q14, Q15, Q19 |
| Measure rule (all three) | F11, 6.10, H1 (listing per allowed part), H7; stuck test step 4 (measure actions); tests Q11, Q12, Q29 |
| Travel moves with id −1 (player) | real ids (6.7); no extra path flag needed: splits and merges along travel paths are allowed and kept on one board by `allowQuantum`; tests Q6, Q8, Q24, Q25 |
| perWorldMerge crash (all three) | already fixed in the working tree (reads the type where the piece stands on f1); test Q21 |
| X1 marker ids, X2 budgetExtra (player, engineer) | not used: history as real ids in a ring (6.3), the budget counts them natively; tests Q10, fuzz |
| State size and saving (player, engineer, physicist) | 6.17, H8 (packed v2 records + notice), limits table 3; measured every option combination that matters |
| Phone use (player, engineer) | default Small, H6 focus box ≥ 28 px, reach option, 9.5, 9.7, UI cost 6.16 |
| Stranding trap (player, physicist) | stuck test in `stateResult` (6.13, a completion search since the review), `moveWarning` + confirmation (H4), a self-stranded turn loses (F10); tests Q27, Q27b, Q27c, Q28, Q30, Q30b |
| Undo and "moves are final" (player, physicist) | 1.2, rules string 2, 12.3; H9 replays once |
| Danger / phantom semantics (all three) | F9, 6.7, 8.4: official E1/E4 phantom with real moves, best single move or merge, same before and after Submit; checkmate needs 1; tests Q16, Q17, S9, U2, U4 |
| Softmate hint cost (player) | dropped from v1 (7.2 optional) |
| Computer on phones (player, engineer) | H2 (bounded blocks), H3 (`aiTimeShare`), measurements 6.16, per-level phone targets, `replySide` null measured against the default, self-play quantum use (10, A3; 13) |
| Budget 8 (all three) | F6, `budgetRule` 8 everywhere; test Q20 |
| Keys and names (player, engineer, physicist) | F15, 6.2, 6.6, `codeText(code, record)` (H5); tests S12, S18, Q6, R1 |
| Rules card and texts (player) | 11.1 (three principles, UI words), 11.2, 12 |
| Black's view (player, engineer) | 9.9, H10 |
| Castling rights (engineer, physicist) | `unifyWorlds` 6.11; test Q26 |
| Undo replay cost (engineer) | H9 |
| Storage silently full (engineer) | H8 |
| One structural rule pinned (engineer) | tests Q14 (Missed opens the row), S8 and Q15 (a royal branch opens nothing) |
| Split-mode pair filter (engineer, physicist) | H7 |
| Stuck test vs pruning and measure rule (engineer) | 6.13 steps 2 and 4 (quick path on the cached, possibly pruned generation; the search on the unpruned union with measure actions); tests Q28, Q29 |
| Travel reach (engineer, physicist) | option 2 / 4, auto by board size; cut measured (13) |
| History encoding (engineer, physicist) | one model: real ids in a ring (6.2, 6.3) |
| `allowQuantum` call sites (engineer) | 7.1, six places, verified against the working tree |
| Phone rendering (engineer) | 9.7 (cells per configuration, render target, reach 2 option) |
| Twins defined and shown (physicist) | 6.3, 8.5, rules string 7, doc bullet; measure outcome "No longer on the board"; a twin thread is optional polish (7.2) |
| Player-facing names (physicist) | readable static names `(0)c3`, absolute record text, `names[]` |
| Which-path memory explained (physicist) | `recordInfo.memory` + `infoText` line; test Q10 |
| Invariant tests (physicist) | section 10 invariants, fuzz |
| Two adversarial reviews of this spec (19 findings) | section 15 |

---

## 15. Review notes

Two adversarial reviews (rules; engine, computer and UI) reported 19 findings against the first version of this spec.
Each was reproduced with the reviewers' probe (`handoff/tmp/rev-mvfinal-rules/p1–p5.mjs`,
`handoff/prototypes/mv-final/*.mjs`) on the prototype, fixed in the spec, and the fix was validated on
`handoff/tmp/mvf-review/` (section 13). **All 19 are real; none was rejected.** Three were fixed differently from the
reviewer's proposal (6, 9, 12), and the verification led to three further changes (R1–R3 below).

| # | Finding (severity) | Verdict | What changed |
|---|---|---|---|
| 1 | `moveWarning` says "you lose" when the move checkmates or stalemates the **opponent** (high) | fixed | The stuck side is `next.turn`: only an outcome in which the mover itself is stuck (`next.turn === state.turn`, now always `stranded`) gives "After this move you cannot finish your turn: you lose"; an outcome in which the opponent is stalemated gives the note "…your opponent cannot finish their turn: the game ends in a draw"; checkmating the opponent gives no warning. 1.7, 6.14, H4, 11.3; tests Q30, Q30b (the probe's position: Submit wins, no warning), Q30c. |
| 2 | A brawn's capture into the past onto its last rank keeps `=Q` but does not promote (medium) | fixed | 6.8 branch: the piece is placed as `q` when `promo`; 5 says promotion applies to every kind, and the brawn's (0, +1, −1, 0) capture promotes as a branch. Test S14b. |
| 3 | A Missed merge onto an enemy king on a past board opens a timeline, so the skeleton depends on the dice (medium) | fixed | `applyMiss` opens no row for a split or merge whose past target holds an enemy royal piece (solid, so the same in every world); F3, 4.5, 6.9 (code and argument), 8.3. Test Q15b (the probe's three worlds: Missed has no row, created `[0, 0]`). |
| 4 | Reactivating an opponent's timeline can move the present back onto the mover's own board; rules text and tests said otherwise (medium) | fixed | 1.3 now says a reactivated timeline whose latest board is yours becomes a must-move board. 6.13 names the one-sided exits. Test S7b (the probe's position: present 7, must move `[+2]`, Submit illegal, Black to move). |
| 5 | The official stalemate becomes a loss here and "stalemate" means something else; not listed as a deviation (low) | fixed | 1.7, 11.2 ("Differences") and 12.1 now say that the official stalemate is not a draw here and that stalemate means only a turn that cannot be finished; the glossary entry says the same. The reason texts already lead with "The turn could not be finished". |
| 6 | A branch's last-move `to` mark points at the wrong board after the largest same-timeline travel (low) | fixed, differently | The reviewer proposed recording the arrival square as `to`, but the core takes a record's `to` from the generated move, whose `to` must stay the past square (the square the player taps, the captured piece, the split names). Instead `recordInfo` stores `cells` (absolute `[u, v, x, y]` on the boards the action produced, the arrival on the new row for a branch) and the new hook `lastMoveMarks` (H11) turns them into squares at draw time. 6.14, 9.3; tests R1, R2 (the probe's position: the marks are `(0)e3`, `(+1)e3`). |
| 7 | Player-facing text contradicts the rules: promotion listed as a difference, deviations missing, Excessive label (low) | fixed | 11.2 no longer lists promotion as a difference from 5D (it says pawns become queens as in 5D, unlike Quantum Chess), and adds castling through danger, final moves inside a turn with the `stranded` loss, the official stalemate, and the 300 / 1,200 draws. 12.4 clarified. 2.2: "three kings each". |
| 8 | Tests S6 and S12 build unreachable positions (Black timelines starting on a Black board) (low) | fixed | S6: L−1 `[10, 10]`, parent `[0, 9]`; S12: L−1 `[8, 10]`, parent `[0, 7]`; expected results unchanged. New invariant (fuzz and test helper): a row created by side c has `st ≡ c + 1`, `pv ≡ c` (mod 2); the old S6 position fails it. |
| 9 | Stuck-test step 6 misses real stalemates and checkmates; the result can change (high) | fixed, and the test replaced | The reviewer's step 6 ("a row of Z stops being must-move, or Submit") was applied and passes the 120 scenarios, but verifying it found a second hole: rows whose only keys are jumps onto boards another must-move board needs (the first version never re-checked a row with departing keys; 2 of 1,222 self-play positions, both of which ended in a forced stranding). 6.13 is now a completion search over abstract actions (quick path unchanged), exact apart from three named one-sided cases. Tests Q27b (the reviewer's seed-10 position as a move list: stalemate at once), Q27c; measured 0 misses in 2,621 self-play positions, 0.07 ms per call. |
| 10 | The even-start row map is not injective: knights on the outer timelines jump onto −0 / +0 (high) | fixed | Generation rejects a target line outside `[l0 − m, l1 + m]` before mapping it; `uOf` returns −1 outside `[l0 − 3, l1 + 3]`. 4.2, 5, 6.5, 6.7. Test S21 (the probe's knights on +3 and −3). |
| 11 | `moveWarning` tells the winner "you lose" (high; the same defect as 1, found by the other review with a self-play probe) | fixed with 1 | The probe (`warn.mjs`, 8 easy Timeline Marauders games) now gives no warning for the winning Submits and the draw note for the stalemating ones. |
| 12 | The computer judges every non-final move of a multi-move turn with no answer: queen blunders (medium) | fixed, adjusted | The reviewer's preferred fix (a hanging-piece term from the phantom list), with one change: only pieces on boards the side can no longer play this turn count (pieces on boards it still plays can still move). One key-less scan per world gives both the check and the hang term, so the cost is unchanged. 6.15; test A4 (the probe: queen en prise 0 / 0 / 1 of 12 at normal / hard / easy, from 12 / 12 / 5). The alternative (phantom moves that apply, `replySide` = opponent inside the turn) was not needed. |
| 13 | `aiView` pruning hides the branch that moves the present back; the computer strands itself (medium) | fixed | The view also keeps branches from other boards after which a must-move board is no longer must-move or Submit is legal, and returns the state itself when it has no legal move. 6.15; test A5 (the probe's seed-29 position as a move list); the pruning probe finds no such position in 40 games. |
| 14 | The real-state candidate filter runs synchronously before any clock check (1.6 s at 64 worlds on Standard) (medium) | fixed | H2 now covers that filter (chunked, yields, clock), memoises `branches` within one `chooseMove`, and adds the declaration flag `aiViewExact` (the multiverse view is exact), with which only the chosen code is checked on the real state. 6.1, 6.15, H2, H3. The timing is the reviewer's measurement. |
| 15 | H6's 28 px per unit cannot be reached on 8×8: the board component caps the zoom at 8 (medium) | fixed | H6 (b) lifts the cap for such layouts (`maxZoom = max(8, (W + 2·PAD) · 40 / svgPixelWidth)`), used by `setZoom`, the + button and the focus. 9.5 explains the numbers (zoom up to 12.3 on Standard; 146 px boards with the cap). |
| 16 | Phone navigation: no pinch, and drag-to-pan is cancelled on touch screens (medium) | fixed (device check open) | Confirmed in the code (`touch-action: manipulation`, no multi-pointer code); the cancellation follows the Pointer Events spec but was not tried on a device. H6 (c): `touch-action: none` while zoomed, pointer capture, a two-pointer pinch. 9.7, 9.8 (no longer promises pinch today); test U7; the device check is an open point (13). |
| 17 | Threat lines (5D check) are drawn under the opaque cells (low) | fixed | Threat lines are outlines with `kind: 'threat'` (drawn above the cells in the danger colour), a small generic board item H13. 9.3; tests U2, U4. |
| 18 | Last-move marks vanish after a turn ended by Submit and show only one move of a multi-move turn (low) | fixed | `lastMoveMarks(state)` (H11) marks every action of the opponent's last turn and of the turn in progress, from `info.cells`, on the boards they produced (so marks follow their boards into the past). 1.9, 6.14, 9.3; test R2. |
| 19 | "Flip board" rotates the multiverse 180°, reversing time (low) | fixed | Declaration flag `flipBoard: false` (H12): the view hides the button and ignores `flipped`; the `view` option and H10 put Black at the bottom. 6.1, 9.9; test U6. |

**Further changes made while verifying the fixes**

- **R1. A turn stranded by the player's own move loses (`stranded`).** With the first version's rule (such a turn is
  a draw unless a king can be taken for certain) and the fixes above, self-play showed the computer taking a draw by
  stranding its own turn whenever it was clearly behind: 5 of 8 Timeline Marauders games at the normal level (its
  static value was about −1,700 against 0 for the draw; raising the contempt to 800 changed nothing). A human can do
  the same, and the warning would even announce the draw. The original game has no such exit: a turn that cannot be
  finished cannot be submitted, and stalemate or checkmate is judged only for a turn that cannot be finished from its
  start. So a stuck turn at its start keeps the official split, and a turn stranded by an action of the same turn loses
  (F10, 1.7, 4.7, 6.13, 6.14, 8.8, 11.1, 11.2, 12.1, 12.3; tests Q27, Q27c, Q30, A3). With the completion search (R2)
  the warning is reliable (apart from the three rare one-sided cases of 6.13), so a player loses this way only after
  confirming. Measured afterwards: 1 `stranded` ending
  in 16 Marauders self-play games, a choice between stranding and losing the king at once. Reverting is one line in
  `endResult` (and the texts); the lead may prefer that, at the cost of the escape.
- **R2. The completion search** (finding 9): the stuck test decides the game result and the warnings, and with R1 an
  undetected stuck position would cost a player the game without a warning, so its exactness matters more than
  before.
- **R3. `x.t`, the actions made in the current turn** (4.4, 6.4, 6.8, 6.9, 6.12): structural (the same in every
  world, part of `solidExtra`), it tells the start of a turn from later (R1), and `aiTimeShare` reads it instead of
  the history.
- **Costs of the changes.** `info.cells` makes a history record about 210 bytes instead of 155, so the worst saved
  record grows from about 450 KB to about 520 KB (3, 6.17). The computer's 64-world timings and the typical-play
  timings did not grow (6.15, 6.16). The cross-check against 5d-chess-js and the fuzz still pass (13).
