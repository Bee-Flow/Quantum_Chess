# 5D Chess With Multiverse Time Travel: the complete rules (research, lens "rules")

Game: *5D Chess With Multiverse Time Travel*, Thunkspace LLC (Conor Petersen), 2020, Steam / Windows, macOS, Linux.
This file describes the rules of the **official game** as exactly as the available sources allow. It is a
reference for building a faithful quantum version; it does not design the quantum layer. Section 11 lists
consequences for the implementation and section 12 lists the uncertain points.

Confidence marks used below:

- **[C]** confirmed by at least two independent sources, usually two independent implementations plus a wiki text,
  or by an experiment (section 8).
- **[S]** one source only (named).
- **[U]** uncertain; see section 12.

---

## 1. Sources

The egress proxy of this environment blocks Wikipedia, the two 5D chess wikis, Steam, Reddit, chess.com, ChessBase
and the official site. I had only (a) search-engine excerpts of those pages and (b) the full source code of open
implementations on GitHub/GitLab, which I cloned and read. Where the code and the wiki excerpts agree, the rule is
marked [C].

| # | Source | What I used it for |
|---|---|---|
| S1 | **5d-chess-js** (Alexbay218, Shad Amethyst and others), source cloned from https://gitlab.com/5d-chess/5d-chess-js, `src/board.js` (`active`, `present`, `move`), `src/piece.js` (all move vectors, pawn, brawn, en passant, castling, `timelineMove`), `src/mate.js` (`checks`, `blankAction`, `checkmate`, `stalemate`), `src/index.js` (`submit`, `submittable`), plus the npm build 1.2.1 that I ran (section 8) | nearly every movement and turn rule |
| S2 | **ftxi/5dchess_engine** (C++20), https://github.com/ftxi/5dchess_engine: `src/core/state.cpp` (`apply_move`, `submit`, `get_timeline_status`, `phantom`, `get_mate_type_impl`), `src/core/multiverse_base.cpp` (`get_present`, `insert_board`, pawn/en passant/castling generation), `src/core/multiverse_variants.cpp` (active range for odd and even starts), `src/core/variants.cpp`, `docs/index.md`, `docs/hypercuboid.md` | independent second implementation of present, activity, submit, check, mate/softmate/stalemate classification |
| S3 | **penteract/cwmtt** (Haskell), https://github.com/penteract/cwmtt: `Game/Chess/TimeTravel/Moves.hs` (move vectors, pawn and brawn capture vectors, castling "threatened within a single board", auto-queen promotion, `isKnownCheck` on the opponent's playable boards), `Layouts.hs` (official setups), `README.md` | third implementation; the author also designed the checkmate algorithm the others use |
| S4 | **Shad's 5D algebraic notation (5dpgn)**, https://github.com/adri326/5dchess-notation `README.md` | vocabulary (turn, action, board, step, sub-step, physical/super-physical, jump, `>` vs `>>`, `~` = present moved), check/softmate/checkmate definitions, `-0`/`+0`, "internally in the game −0 is −1", Turn Zero `T0`, "Underpromotion in the base game is not available", inactive timeline reactivation `(~Tx)` |
| S5 | **adri326/5dchess-variants**, https://github.com/adri326/5dchess-variants `base/**/variant.5dpgn` and READMEs | official Standard-family setups in 5DFEN |
| S6 | **5D Chess Wiki (Fandom)**, https://5d-chess.fandom.com/wiki/ Terminology, Checkmate, Tutorial, Pieces, Variants (search excerpts only) | present, active/inactive, softmate, hardmate, stalemate, checkmate ("a king could be captured if a pass is made on all present boards"), "a turn must change the location of the present", pawns always promote to queens, variant list |
| S7 | **5D Chess Wiki (wiki.gg)**, https://5dchess.wiki.gg/wiki/Rules (search excerpts only) | pawn "forward"/"sideways" definition, no en passant through time or timelines, castling only physically, mate definition ("no sequence of legal moves that leaves the Present on the opponent's color and none of the active player's kings in check"), timeline advantage worth slightly more than a queen |
| S8 | Wikipedia, https://en.wikipedia.org/wiki/5D_Chess_with_Multiverse_Time_Travel (search excerpts only) | developer, dimensions, present line, "the nth timeline created by a player is active if the opponent has created at least n−1 timelines", display (timelines you create go downwards from your point of view), time controls 10+3/L, 20+5/L, 40+8/L |
| S9 | Steam guides and discussions (search excerpts only): "A Guide on Pieces Moving Through Time and Timelines" (id 2176513845), "All Variants Explained" (id 2223803379), threads "Can't submit moves when an active board has no movable pieces", "Forgotten timelines", "So you can play on inactive timelines?", "How do this check works?", "Moving pieces into the (player's) future?" | inactive timelines are optional but playable; stalemate when a present board cannot be moved on; trans-temporal check; forward-in-time moves only to other timelines |
| S10 | **My experiments** with 5d-chess-js 1.2.1 under Node 22, scripts `handoff/prototypes/t1.js` … `t6.js` | worked examples in section 8 |

---

## 2. The multiverse: boards, half-turn states, coordinates

### 2.1 Boards [C]

- A **board** is one complete chess position (8×8 in Standard) *with a side to move*. Every board is either a
  **white board** (White to move, drawn with a white outline) or a **black board** (Black to move, dark outline)
  (S6, S8, S1, S2).
- Boards are never changed once they exist. Each move **creates** one or two new boards (section 4). The whole game
  state is the set of all boards created so far (the multiverse).

### 2.2 Coordinates [C]

- A board has a **timeline** coordinate L (integer; section 2.3) and a **time** coordinate T (integer ≥ 1, or ≥ 0
  in Turn Zero variants), plus its colour (who is to move). Written `(L T)`, e.g. `(0T1)`, `(-1T6)`; 5dpgn uses
  `(<L>T<T>)` and omits the colour because a player only ever interacts with boards of their own colour (S4).
- **Half-turn states.** For each T there is a white board and a black board: order in time is
  `T1w < T1b < T2w < T2b < …`. Both S1 and S2 store this as one index `v = 2·T + c` (c = 0 white, 1 black).
  A move on board `(L, T, w)` produces `(L, T, b)`; a move on `(L, T, b)` produces `(L, T+1, w)`.
- A square is `(L, T, file, rank)`, e.g. `(-1T6)e4`.
- **Four movement axes**: file x, rank y, time t, timeline l (S8: "file, rank, turn, timeline").
  **One step along t is one full turn** (two half-turn states), so a piece that moves in time always lands on a board
  of the **same colour** as the one it left (S1: `givenPieceTurn + movePos[i][1] * 2`; S2 `vec4` t with fixed colour;
  S3 separate white/black boards per T).

### 2.3 Timelines and their numbering [C]

- A **timeline** is a row of boards with consecutive half-turn states, from its first board (`start`) to its latest
  board (`end`).
- **Standard** starts with one timeline, **L0** (displayed "L" or "0L"), with one board `(0T1)w`.
- A timeline created by **White** gets the next unused **positive** integer (+1, +2, …); a timeline created by
  **Black** gets the next unused **negative** integer (−1, −2, …) (S4; S1 `move`: new index = largest existing of
  that parity + 2; S2 `new_line()`: `l_max + 1` for White, `l_min − 1` for Black). Who created it is decided by who
  made the branching move, not by where the piece came from.
- So the set of timeline numbers is always contiguous, and the creation order equals the distance from the centre.
- **Even number of starting timelines** (e.g. *Standard – Two Timelines*, *Misc – Timeline Invasion*): the two
  central starting timelines are labelled **−0** and **+0** (the game shows them this way; the `+` is mandatory)
  (S4, S5). Internally the game stores −0 as −1 (S4). White's first created timeline is then +1 and Black's −1.
  Implementations store them as −0.5/+0.5 (S4 parser) or use the bitwise complement `~l` (S2).
- **More than two starting timelines** (e.g. *Misc – Timeline Battleground*: three 5×5 boards on L −1, 0, +1, S3
  `Layouts.hs`): starting timelines are neutral; timelines "created" are counted beyond the initial range (S2:
  `whites_lines = l_max − l0_max`, `blacks_lines = l0_min − l_min`).
- Display: timelines are rows, time runs left (past) to right (future). **Each player sees the timelines they create
  extending downwards** and the opponent's upwards; the time axis is the same for both players (S8, S9). A new
  timeline is drawn in the next empty row on the creator's side. An arrow under each timeline shows its status:
  **purple = active**, the creator's colour (white/black) = inactive (S9).

### 2.4 Which boards exist [C]

- On timeline L, exactly the boards with `start(L) ≤ v ≤ end(L)` exist. There are no gaps.
- A created timeline has **no boards before its first board**. Its "history" is drawn as a branch from the parent
  board, but for movement the earlier boards of the new row do not exist (S1 `positionExists`; S2 `inbound`).
  A piece on L+1 cannot move back in time on L+1 past the branch point.
- The future does not exist: no board later than `end(L)` exists on L.

### 2.5 Playable boards and history boards [C]

- A board is **playable** iff it is the **latest board of its timeline** (thick outline in the game). All other
  boards are **history boards** (S6 Terminology; S1 `positionIsLatest`; S2 `get_timeline_end`).
- A player may move **only pieces that stand on a playable board of their own colour** (S1
  `getMovesFromTimelines` skips boards whose parity is not the mover's; S2 asserts `(p.t, player) == timeline_end`).
- A playable board of the opponent's colour cannot be moved from, and cannot be moved *to* (section 4.5).

---

## 3. Movement in four dimensions

### 3.1 General rules for every piece [C]

- A move is a vector `(dx, dy, dt, dl)`; the target square is on board `(L + dl, T + dt)` of the same colour.
- **Leapers** (knight, king, common king, pawn steps) need only the target board and square to exist.
- **Riders** (rook, bishop, unicorn, dragon, queen, princess, royal queen) repeat the vector. **Every
  intermediate board must exist and every intermediate square must be empty**; the ride stops at the first
  non-existing board (S1: `while (positionExists)`; S2: a missing board acts as a blocker; S3 `line`). Intermediate
  boards of the other colour are not on the path (steps are whole turns).
- The target square must be empty or hold an **enemy** piece (a capture). Own pieces block, including a piece's own
  earlier copy on a history board (e.g. a king cannot move one turn back to the square it stood on).
- The same generalised vectors apply in every direction of t and l; only pawns and brawns are directional.

### 3.2 Pieces and their vectors [C]

"Axes" means how many of x, y, t, l change. S1 `movePos`/`moveVecs`, S3 `rm/bm/um/dm/qm/nm`.

| Piece (5dpgn letter) | Movement | Number of directions |
|---|---|---|
| Rook (R) | any distance along exactly 1 axis | 8 |
| Bishop (B) | any distance along exactly 2 axes, equal distance ("diagonal") | 24 |
| Unicorn (U) | exactly 3 axes, equal distance ("triagonal") | 32 |
| Dragon (D) | all 4 axes, equal distance ("quadragonal") | 16 |
| Queen (Q) | 1–4 axes, equal distance | 80 |
| Princess (S) | rook + bishop (1 or 2 axes) | 32 |
| King (K), royal | one step, 1–4 axes | 80 |
| Common king (C), not royal, cannot castle | as king | 80 |
| Royal queen (Y), royal | as queen | 80 |
| Knight (N) | 2 along one axis and 1 along another (leap) | 48 |
| Pawn (P), Brawn (W) | section 3.3 | – |

Examples (S9 guide): a rook can go back any number of turns on its own timeline keeping its square, or sideways to
the same square on neighbouring timelines; a bishop moving "diagonally" across T and L keeps its square; a knight
move of 2 turns back and 1 square sideways is legal (dt = −2 is two full turns).

### 3.3 Pawns [C]

- **Forward** means the rank direction towards the opponent **or** the timeline direction towards the opponent's
  side. **Sideways** means the file direction or the time direction (S7).
- **White pawns go towards negative L** (Black's timelines), Black pawns towards positive L (S1 `timelineMove(l,
  −forward)`; S2 `forward_l`; S3 `pawnDirections White = [−unitl, unity]`; S9 "white pieces can only move UP through
  timelines" when White is at the bottom). With −0/+0, White goes +0 → −0.
- **Non-capturing moves:** one step forward in rank (same board), or one step forward in L at the **same T**
  (`dt = 0`). An **unmoved** pawn may instead make a **double step in either of these directions** (the square passed
  must be empty; for the L double step the intermediate timeline's board must exist) (S1, S3, S6: "in either
  direction along which it could move 1").
- **Captures:** diagonally forward on the board (`dy = +1, dx = ±1`) **or** in the T–L plane: one timeline forward
  and one turn earlier or later (`dl = forward, dt = ±1`, same file and rank) (S1, S3 `wpcm`). There is no pawn
  capture that mixes a spatial axis with t or l.
- A pawn never moves along t alone, never backwards, never sideways without capturing.
- A pawn's L-move is a super-physical move: if the target board is a history board it **branches** (a pawn can
  create a timeline); if it is a playable board it is a non-branching jump.
- **En passant exists only on the board itself**, exactly as in chess: the enemy pawn made a double step on this
  board with the move that produced this board. No en passant through time or across timelines (S7; S1 compares the
  board one full turn earlier on the same timeline; S2 idem, so the first board of a new timeline never allows it).
- **Promotion:** a pawn that reaches the last rank by a board move **always becomes a queen**; underpromotion does
  not exist in the base game (S4, S6, S3 auto-queen). Timeline moves and T–L captures keep the rank, so a pawn only
  promotes on its own board.

### 3.4 Brawn [C mostly]

A brawn ("pawn + extra captures"; S6: "attacks along any diagonal that includes a forward direction and does not
include any backward direction") moves like a pawn (including the double steps) and captures on every 2-axis
diagonal made of a forward component and a sideways-or-forward component. For White (forward y = +1,
forward l = −1): `(±1,+1,0,0)`, `(0,0,±1,−1)`, `(±1,0,0,−1)`, `(0,+1,±1,0)`, `(0,+1,0,−1)` (S3 `wbcm`). S1 omits
`(0,+1,+1,0)` [U]. A brawn can promote through a super-physical capture that changes its rank (S2 "promotion (only
brawns can do)"); it promotes to a queen.

### 3.5 Castling [C]

- Only on one board (physical), with a king and a rook that have **never moved** (on that board's history).
- The squares between them must be empty. The king moves two squares towards the rook; the rook lands on the square
  the king crossed.
- Castling is illegal if the king is **physically** in check or crosses a **physically** attacked square
  (attacks from pieces on the same board only; attacks through time or timelines do not count here) (S7; S1
  `positionIsAttacked` on the same board; S3 "is a square threatened within a single board (for castling)").
- The final position must of course pass the normal check test of section 7.1.
- S2 accepts only a rook on the edge file; the official setups always have them there.

### 3.6 "Has moved" flags [C]

- Every moved piece becomes "moved", including a piece that jumps or time-travels (S1 `Math.abs`, S3 `setMoved`,
  S2 `piece_name`). A travelling pawn therefore loses its double step and a travelling king/rook loses castling.
- Boards copied into a new timeline keep the flags they had on the target board. After travelling back to T1 in
  Standard, the untouched pieces on the new timeline can still double-step and castle.

---

## 4. What a move does (board creation)

Let the moving piece stand on playable board `s = (Ls, Ts)` of the mover's colour, and let the target square lie on
board `d = (Ld, Td)` of the same colour. There are three cases (S1 `move`, S2 `apply_move`, S3 `fullMove'`,
S4 vocabulary) [C]:

| Kind | Condition | Result |
|---|---|---|
| **Physical** (spatial) move | `d = s` | Ls gets one new board: s with the move made. |
| **Non-branching jump** ("hop", 5dpgn `>`) | `d ≠ s` and d is **playable** (the latest board of Ld) | Ls gets a new board: s **without** the piece. Ld gets a new board: d **with** the piece on the target square (a piece there is captured). |
| **Branching jump** (time travel, 5dpgn `>>`) | d is a **history board** (any timeline, including Ls itself) | Ls gets a new board: s without the piece. A **new timeline** is created. Its first board is a copy of d with the piece on the target square (capturing what was there), placed at the **next half-turn state after d** (`(Ld,T,w)` → new board `(Ln,T,b)`; `(Ld,T,b)` → `(Ln,T+1,w)`), with the opponent to move. |

Details and consequences:

- Every new board has the **opponent** to move. So after a move, the source timeline (and the target timeline of a
  hop) is no longer playable for the mover in this turn.
- The new timeline Ln is numbered as in 2.3 and drawn in a new row on the mover's side, with a branch arrow from d.
- **Only the moving piece travels.** Nothing else comes along: no other pieces, no en passant right, no "moved" flags
  of other pieces. A capture on a history board removes the piece **only on the new timeline**; the old timeline
  still has it. The piece's own past copies stay where they were, so a side can own **two copies of the same piece**
  (for example two kings) on the new timeline, and **no king** on the timeline the king left ("king exiling", S6).
- A hop can go forward in T: e.g. from `(0T5)w` to the playable `(1T7)w` if timeline 1 is ahead. Forward in T on the
  mover's **own** timeline is impossible (the source is its latest board) (S9).
- **Illegal targets:** a board that does not exist (the future of any timeline, a T before a timeline's start, a
  timeline number outside the existing range); a board of the opponent's colour (impossible anyway, section 2.2).
  There is no way to "move to a board where it is not your turn".
- **Each playable board can take part in at most one move per turn**: once moved from or hopped onto, its timeline
  has advanced to the opponent's colour. A history board can be the target of several branching moves in one turn
  (each makes its own timeline) [S: S1, S2 allow it; not stated in a wiki].
- **Order matters within a turn:** jumping to a board before moving on it is a hop; after moving on it, the same
  target is a history board and the jump branches. Timelines created in one turn are numbered in the order of the
  moves (S3 note: "if more than 1 timeline is created in a single turn, then order matters").

---

## 5. Active timelines and the present

### 5.1 Active and inactive timelines [C]

- The starting timelines are always active.
- **The n-th timeline created by a player is active iff the opponent has created at least n − 1 timelines** (S8, S6,
  S9; S1 `active`; S2 `calculate_active_range`). Equivalently, each player's active created timelines are limited to
  (opponent's created count + 1).
- Activity is recomputed after every created timeline. When a player creates a timeline, an inactive timeline of the
  opponent can become active again (**reactivation**) (S4 `(~Tx)`; S2 `insert_board` "check reactivate").
- Inactive timelines still exist and can be played on by whoever's colour their latest board has; moving there is
  **optional**, and they **do not affect the present** (S9 "Forgotten timelines", "So you can play on inactive
  timelines?").
- Having created fewer timelines than the opponent (**timeline advantage**) means your next branch is active and pulls
  the present back while theirs would not; S7 estimates it as worth slightly more than a queen.

### 5.2 The present [C]

- **The present = the earliest half-turn state `(T, colour)` among the latest boards of all active timelines**
  (S1 `present`; S2 `get_present` = min over active `timeline_end`; S6 "the time of the earliest active board";
  S9 "the present line always aligns itself with the active board which is furthest left").
- It is drawn as a vertical bar labelled "The Present" through that column (S9).
- The present can move:
  - **forward**, when the mover has moved on all active boards at the present (their timelines advance by a
    half-turn); it can jump several steps if the other active timelines are already ahead;
  - **back**, when a branching move creates an **active** timeline whose new board is earlier than the present
    (S2 `apply_move`: `if (new_present < present) present = new_present`); 5dpgn marks this with `~`;
  - **back**, when a created timeline **reactivates** an older inactive timeline whose latest board is earlier.
- A branch that creates an **inactive** timeline never moves the present (section 8, example E2).

### 5.3 Mandatory, optional and unplayable boards [C]

For the player to move (S2 `get_timeline_status`, S1 `moves(presentOnly)`, S9):

- **Mandatory:** active timelines whose latest board is exactly at the present (these are the mover's colour).
- **Optional:** every other playable board of the mover's colour: active timelines that are ahead of the present,
  and inactive timelines (ahead or behind).
- **Unplayable:** timelines whose latest board has the opponent's colour.

---

## 6. The turn

### 6.1 Structure [C]

- White moves first (puzzles can start with Black). A **turn** of one player (5dpgn: an **action**) is a sequence of
  one or more moves on playable boards of their colour, followed by pressing **Submit** (S4, S8).
- Before submitting, moves can be undone (S1 `undo`; the game has an undo button [S: S1 only for the API, U for the
  game UI]).

### 6.2 When you may submit [C]

You may submit iff **both**:

1. **the present has passed to the opponent**, i.e. after your moves the earliest latest board among the active
   timelines has the opponent's colour (S1 `submittable`: `present(...).length <= 0`; S2 `submit`: `if (player ==
   present colour) return false`; S6 Tutorial: "a player must move the present before they can submit … either by
   advancing the present or by rewinding the present"); and
2. **you are not in check** after your moves (section 7.1) (S7, S1 `submit`, S2 `can_apply`).

Ways to satisfy condition 1:

- make a move **from** every mandatory board, and/or hop a piece **onto** a mandatory board (a hop advances both the
  source and the target timeline, so one move can clear two mandatory boards; example E4);
- or create an **active** timeline in the past: the present moves back to the new board, which has the opponent's
  colour, so the remaining mandatory boards become optional ("you don't have to play the rest"; example E1);
- a reactivation can also move the present back (and may *add* mandatory boards if the reactivated board has your
  colour; example E3).

After condition 1 holds you may still make optional moves before submitting (for example on boards ahead of the
present or on inactive timelines).

### 6.3 Derived facts [C, derived from 6.2]

- **There is no pass.** At the start of a turn the present is always on the mover's colour (the opponent could only
  submit once it was), so at least one move is needed.
- **Temporary check is allowed** inside a turn; only the submitted whole is judged (S1, S2 test only at submit).
- A mandatory board on which you have no legal move (no pieces, all blocked or pinned) must be cleared by a hop onto
  it or by rewinding the present; if that is impossible you have no legal turn (section 7.3) (S9 thread "Can't submit
  moves when an active board has no movable pieces").
- **Turn numbers are not times.** The notation's turn counter (`1.`, `2.`, …) counts actions; the T of the boards
  played can go down after time travel (S4).

---

## 7. Check, mate, stalemate and the end of the game

### 7.1 Check [C]

- **Royal pieces:** king and royal queen (not the common king) (S5 Reversed Royalty, S6, S1 `checks`).
- **At submission:** your action is illegal if, in the resulting position, **any single move by the opponent from
  any of the opponent's playable boards could capture any of your royal pieces** on **any existing board** it can
  reach (S1 `checks`; S2 `find_checks` over timelines whose end has the attacker's colour; S3 `isKnownCheck` over
  `playableBoards`). This includes:
  - physical attacks on a board where it is now the opponent's turn;
  - attacks via a **hop** onto a playable board;
  - **trans-temporal / historical checks**: capturing a king that stands on a **history board** by travelling back to
    it (S2 `HISTORICAL_CHECK`; S9 "How do this check works?"). A king in check in the past cannot move; the check must
    be removed by capturing or blocking the attacker, or by making it impossible to reach (S9);
  - attacks from boards ahead of the present and from inactive timelines (they are playable for the opponent).
- Pieces on the opponent's history boards, and on boards where it is still your move, give no check.
- The game marks checks with **red arrows** (S9).
- **"In check" at the start of a turn** (used to tell checkmate from stalemate): the royal piece could be captured if
  you passed. S6 and S1 pass on **all present (mandatory) boards** only; S2 passes on **all** your playable boards
  ("phantom" boards) [U: only differs in exotic positions].

### 7.2 Checkmate [C]

- The player to move is **in check and has no legal action** (no sequence of moves after which conditions 1 and 2 of
  6.2 hold). They lose (S6 Checkmate, S7, S2 `get_mate_type_impl`).
- The game ends at checkmate; a king is never actually captured.
- The official client detects checkmate automatically; S3 notes that it "is believed to incorrectly claim some
  positions are checkmate" [U]. Exact checkmate detection is expensive (the number of actions grows like
  (moves per board)^(number of timelines)); S2 and S3 use the hypercuboid / SAT-style search.

### 7.3 Stalemate [C]

- The player to move is **not** in check and has **no legal action** → **draw** (S6, S2).
- Typical 5D stalemate: a board in the present on which you cannot move, the present cannot be moved back, and no
  piece can hop onto that board (S9 excerpt).

### 7.4 Softmate and hardmate (terminology only; the game continues) [C]

- **Softmate:** a check where the only legal actions rewind the present (travel into the past to create an active
  timeline). 5dpgn marks it `*` (S4, S6, S2 `SOFTMATE` = legal actions exist only among "travel back" actions and the
  player is in check).
- **Hardmate:** a softmate where there is no way to stop all the checks at some time step; the defender can only
  delay until the present catches up (S6).
- Example E5: the 2-D fool's mate position is only a softmate in 5D.

### 7.5 Other game endings and clocks

- **Resignation** [C, S1 5dpgn results]. **Draw offer**: the online and local modes reportedly have "Offer Draw" /
  "Accept draw offer?" [U].
- **Timeout** loses (S4 example "White wins by timeout") [C]. Whether a timeout against a side without mating
  material is a draw is unknown [U].
- **Clocks** (added in the October 2020 update, S8/S9): No clock, **Short 10+3/L, Medium 20+5/L, Long 40+8/L**: main
  time in minutes plus a **simple delay** of that many seconds **per active timeline** at the start of the turn (S8).
- **No repetition, fifty-move or insufficient-material rules** are mentioned anywhere [U]. A position can never repeat
  exactly, because every turn adds boards to the multiverse.

---

## 8. Worked examples (verified by running 5d-chess-js 1.2.1, S10)

- **E1 – rewinding the present.** `1. Nf3 / Nf6  2. (0T2)Nf3>>(0T1)f5~`. White's knight goes one turn back and two
  ranks up onto the history board `(0T1)w`. Timeline **+1** is created with first board `(1T1)b`; L0 advances to
  `(0T2)b`. The present moves back to T1 black, so White can submit at once. Black's only mandatory board is
  `(1T1)`; after `(1T1)e6` Black may submit **without** playing on `(0T2)b` (it lies ahead of the present, so it is
  optional).
- **E2 – an inactive branch does not rewind.** Continuing `3. (1T2)Nc3 / (0T2)e6 (1T2)d6  4. (1T3)Ng1>>(1T2)g3`:
  White's second timeline (+2) is inactive (Black has created none). After it, `(0T3)w` is still mandatory:
  `submittable()` = false; after `(0T3)Nc3` it is true.
- **E3 – reactivation.** Black to move: `(1T3)a6 (0T3)Nf6>>(0T2)h6~` creates −1. That reactivates White's +2, whose
  latest board `(2T2)b` is earlier than the present and has Black's colour, so it becomes mandatory: `submittable()`
  = false until Black also plays `(2T2)a6`.
- **E4 – a hop clears two mandatory boards.** *Standard – Two Timelines*: `1. (-0T1)Nb1>(+0T1)b3` alone is a complete
  legal first turn.
- **E5 – fool's mate is a softmate.** `1. f3 / e6  2. g4 / Qh4`: White is in check but not mated. The **only** legal
  action is `(0T3)Ke1>>(0T2)f2~`: the king escapes one turn into the past (to f2, empty on `(0T2)w`), creating +1
  with two white kings and leaving L0 without a white king. Any other move leaves `(0T3)b` with Qxe1 possible,
  because the move's own source board always advances.

---

## 9. Variants in the official game

Setups known exactly (S5 5DFEN, S2 `variants.cpp`, S3 `Layouts.hs`):

| Variant | Size | Start |
|---|---|---|
| Standard (Default) | 8×8 | one board `(0T1)w`, normal chess position |
| Standard – Turn Zero | 8×8 | the start position twice: `(0T0)b` (a history board) and `(0T1)w`; Black can travel to T0 |
| Standard – Two Timelines | 8×8 | the start position on `(-0T1)w` and `(+0T1)w` |
| Standard – Reversed Royalty | 8×8 | `…Y C…`: royal queen on d-file, common king on e-file |
| Standard – Half Reflected | 8×8 | one side's king and queen swapped: Black's in S1, S3 and the S5 README (black K d8, Q e8), White's in the S5 5DFEN; the two are mirror images, so the game is the same |
| Standard – Defended Pawn | 8×8 | queen and queen's knight swapped (`R*QBNK*BNR*`) |
| Standard – Princess | 8×8 | queen replaced by a princess |
| Very Small – Open | 4×4 | `nbrk/3p*/P*3/KRBN` |
| Focused – Just Pawns / Just Brawns | 5×5 | `ppppk/5/5/5/KPPPP` / `wwwwk/5/5/5/KWWWW` |
| Focused – Just Kings | 3×3 | `2k/3/K2` |
| Misc – Timeline Battleground | 5×5 | three timelines (−1, 0, +1) with different 5×5 armies |
| Misc – Timeline Invasion | 5×5 | two timelines −0/+0 |

Other names from S6/S9 without verified setups: Very Small – Default; Small – Default, Centered, Flipped, Open;
Simple – No Bishops, No Knights, No Queens (7×7 per a game record in S4), No Rooks, Simple Set; Focused – Just
Bishops, Just Dragons, Just Knights, Just Queens, Just Rooks, Just Unicorns; Misc – Excessive, Global Warming, King
of Kings, Royal Queen Showdown, Timeline Formations, Timeline Marauders; later "Classic", "Hourglass", "Expanded"
[U]. Unicorn, dragon, brawn, princess, common king and royal queen appear only in variants.

---

## 10. Checklist of edge cases

1. A piece may move only from a playable board of its own colour; the mover's other boards (history) are frozen.
2. Moving in time always lands on the same colour (steps are whole turns); the other colour is never a target.
3. No target board = illegal: the future of any timeline, before a created timeline's start, beyond the outermost
   timeline.
4. Riders need every intermediate board to exist and every intermediate square to be empty; knights leap over gaps.
5. A piece cannot land on a square occupied by its own side, including its own past copy.
6. Target playable → hop (two timelines advance, no new timeline); target history → branch (new timeline).
7. Travelling back on one's own timeline also branches, and the source timeline still advances without the piece.
8. A branch creates boards on the source timeline **and** the new timeline; the new board is one half-turn after the
   target and has the opponent to move.
9. White's new timelines are +, Black's −, numbered by creation order; −0/+0 in even starts.
10. Activity: the n-th created timeline of a player is active iff the opponent has created ≥ n − 1. Initial
    timelines are always active. Creating a timeline can reactivate an opponent's timeline.
11. Present = earliest latest board among **active** timelines only.
12. Inactive timelines and active timelines ahead of the present are optional but playable.
13. One move can clear two mandatory boards (hop from one to the other).
14. An active branch into the past rewinds the present and makes the rest of the old present optional.
15. An inactive branch never moves the present.
16. A reactivated earlier timeline can rewind the present and can create new mandatory boards for the mover.
17. Each playable board is used at most once per turn; history boards can be targeted repeatedly.
18. The order of moves inside a turn changes their meaning (hop vs branch, timeline numbers).
19. No passing; at least one move per turn; submit only when the present is on the opponent's colour and no royal
    piece is capturable.
20. Temporary check inside a turn is fine.
21. Check counts attacks through time and across timelines, including kings on history boards; sources are the
    opponent's playable boards only (also those ahead of the present and on inactive timelines).
22. Several kings per side can exist (king travel); every one is royal; a timeline can have none.
23. A capture on a history board removes the piece only in the new timeline.
24. Pawns: forward in rank or in L (White → −L); double step from unmoved in either; captures board-diagonal or
    (L forward, T ± 1); never along t alone; en passant only on the board; promotion only to queen, only on the board.
25. Castling: board only; unmoved king and rook; king not physically in check and not crossing physically attacked
    squares.
26. Moved flags: any moving piece (also travelling ones) becomes "moved"; copied boards keep their flags.
27. A mandatory board without a legal move forces a hop onto it or a rewind; otherwise checkmate/stalemate.
28. Checkmate = in check and no legal action (loss); stalemate = not in check and no legal action (draw); softmate
    and hardmate are descriptions only.

---

## 11. Consequences for a quantum implementation (notes, not design)

- **Rules-level world = a whole multiverse.** Everything that decides *what is legal to try* depends on the multiverse
  skeleton: which timelines exist, their `start`/`end` half-turn state, their parent board, who created them, which
  are active, where the present is. If the quantum layer lets worlds disagree on the skeleton, the UI cannot show one
  board grid and "the present" becomes ambiguous. So the skeleton is the natural content of `solidExtra(world)`: a
  string such as the ordered list of `(L, start, end)` plus the created counts. Whether a move is a hop or a branch
  depends only on the skeleton, so it is the same in every world. But a move can be legal in one world and illegal in
  another (for example a ride blocked by a piece that exists only there); it then advances a timeline, or creates
  one, in some worlds only. That must be settled by a roll, which is exactly what `solidExtra` provides.
- **Turn = several moves + Submit.** This maps to `nextSide(world, side)` returning the same side until the player
  submits, and `actions(state)` offering **"Submit turn"** only when condition 1 of 6.2 holds (the present has passed).
  Condition 1 depends only on the skeleton, so it is the same in every world. Condition 2 (not in check) differs per
  world; a quantum version has to choose between "legal if safe in every world", "in at least one world", or the
  engine's own king-capture rule (the app's generic rule is "capture the king").
- **No pass exists**, so a mandatory board without a legal move in some world is a real rules problem for a quantum
  game (in other worlds the same board may be playable). The official answer is "no legal turn → mate or stalemate".
- **A branch copies a board.** A ghost (superposed) piece on the copied history board is copied too; in each world
  the new board is simply that world's copy of the target board, which the per-world model gives for free.
- **Layout (`layoutOf`)**: rows = timelines, columns = half-turn states `v = 2T + c` (a white and a black board per
  T), new rows on the creator's side, a present line through the column of the present, purple marker for active
  rows. The official game keeps the time axis left→right for both players and flips only the timeline axis; a plain
  180° rotation for Black would also reverse time. The game shows every board ever made; long games need zoom, pan
  and focus on the present.
- **Checkmate detection is exponential in the number of timelines** (7.2). A king-capture win rule, or a cap on
  timelines, avoids it; the official rule does not.

---

## 12. Uncertain points

1. **"In check" at the start of a turn**: pass on present boards only (S6, S1) or on every own playable board (S2
   phantom)? Differs only when a royal piece stands on an own playable board ahead of the present or on an inactive
   timeline. It matters only for the checkmate/stalemate distinction.
2. **Brawn capture `(y forward, t + 1)`**: allowed by S3 and the S6 wording, missing in S1.
3. **Draw offers, repetition, fifty-move rule, insufficient material, timeout against a lone king**: no reliable
   source. Draw offers probably exist online and locally; the others are probably absent.
4. **Official checkmate detection** is reported (S3) to claim some non-mates as mates; the rule itself (no legal
   action while in check) is certain.
5. **Several branches to the same history board in one turn**: allowed by S1 and S2; no wiki text found.
6. **Undo in the official UI** before submitting: very likely (every client has it), not confirmed from the game.
7. **Promotion choice in Princess and Reversed Royalty**: the base game promotes "only to a queen" (S4, S6). In
   Princess (no queens on the board) it may promote to a princess; S5 lists `S,N,R,B` for it, but S5 lists `Q,N,R,B`
   for Standard too, which the base game does not allow.
8. **Castling with a rook not on the edge file** (S2 rejects it, S1 allows it): irrelevant for the official setups.
9. **Exact setups and board sizes** of the Small, Simple, Focused (other than Just Pawns/Brawns/Kings) and later Misc
   variants were not verified.
10. **Display details**: whether the present line takes the colour of the side to move, and exactly where a new
    timeline row is inserted ("vacant row closest to the originating timeline", S9, versus always the outermost row,
    which the numbering implies). The numbering rule itself is certain.
11. **Clock details**: "simple delay per active timeline" comes from one Wikipedia excerpt (S8).
