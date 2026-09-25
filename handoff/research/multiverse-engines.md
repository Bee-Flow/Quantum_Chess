# 5D Chess with Multiverse Time Travel: what the open engines and UIs teach (research lens: engines)

Scope: data structures, move generation, branching and the present, check detection, performance limits, tricky
edge cases, and how existing UIs show the multiverse. Then concrete recommendations for a compact, fast browser
implementation inside this app's quantum layer (64 weighted worlds, each a classical position), with bounded size, and
for a clear UI. The rules themselves are in the sibling files `multiverse-rules.md` and `multiverse-pieces.md`; this
file only restates rules where an engine decision depends on them.

Everything marked **[measured]** was run in this container (Node 22.22, x86-64) with the scripts in
`handoff/prototypes/eng/` (bench1–bench5, proto.mjs). Browser numbers on phones will be slower, probably 1.5–3 times.

---

## 0. Key findings (short)

1. **All engines store the multiverse as a 2D table of immutable boards**, indexed by timeline and half-turn
   (`v = 2T + colour`). Only the last board of each timeline is ever changed, and it is changed by appending a new
   board. The fast engines share unchanged boards by reference (copy-on-write). 5d-chess-js deep-copies everything on
   every move and is the slow one.
2. **The present, the active timelines, the mandatory boards and "may I submit?"** are all cheap functions of a small
   *skeleton*: per timeline, its first and last half-turn index, plus how many timelines each side has created.
   ftxi's engine computes them in a few lines (formulas in section 4). The skeleton does not depend on the pieces.
3. **Move generation is a 4D ray walk.** A step moves (x, y, T, L) by a vector. A T step moves 2 half-turns, so a
   piece only reaches boards of its own colour. The ray stops at the first board that does not exist. Vector counts
   are rook 8, bishop 24, unicorn 32, dragon 16, queen and king 80, knight 48. A physical ride on one board is the
   special case T = L = 0.
4. **Check = "if I passed now, could the opponent take a royal piece?"** Engines copy each of the mover's still
   playable boards forward unchanged. These copies are called "blank action" (5d-chess-js), "phantom" (ftxi) or
   "idle boards" (5dchess-tools). Then they generate the opponent's captures. This is cheap: **0.07–0.6 ms per
   position** [measured, 5d-chess-js, 3–22 timelines].
5. **Checkmate detection is the hard part.** A turn has about 40^n possible actions for n playable timelines (ftxi
   `docs/hypercuboid.md`). 5d-chess-js searches with a time limit (60 s by default) and **reports mate when the time
   runs out**, so it can claim mates that are not real. The hypercuboid algorithm (penteract's cwmtt, ported by ftxi)
   solves a 120-timeline mate in about 0.3 s where 5d-chess-js needs its full time limit. For this app: **do not
   implement checkmate detection.** Use the app's king-capture win rule and show the danger instead.
6. **Timelines explode quickly.** Random play reaches 25–51 timelines after 40 half-turns [measured]. The public
   bot-game database shows timelines L−10…+9 by turn 16. Human test games in cwmtt have 1–37 timelines. A browser
   engine that keeps 64 worlds, each a whole multiverse, needs **hard caps**: at most 7 timelines (3 created per
   side) and a history window of 4 turns.
7. **The size of the square space dominates the core's cost.** The core computes `worldKey`, `solidKey` and
   `boardView` in O(size) for every world. At 128,000 squares (the absolute-coordinate encoding of the earlier
   5D-lite spec), one world key takes 5.7 ms, and a world is 395 KB of JSON. At about 4,000 squares these costs drop
   to 0.2 ms and about 20 KB [measured]. **Keep only the live boards as squares (≤ 448), and keep the history window
   as compact strings in `w.x`.** That makes a world about 4–10 KB.
8. **One generic core gap blocks "pass = link" in 5D.** Today a world where a move misses is kept *unchanged*. In
   the multiverse every move also creates boards, so the missed worlds would get a different skeleton. The solid roll
   would then settle it, with a roll note that holds the whole solid key (kilobytes). A small hook
   **`applyMiss(world, sample)`** fixes this: the core calls it where it now keeps `b` unchanged. The variant then
   builds the same boards without moving the piece. **Rule: the structure follows the key, never the outcome.**
9. **UIs agree on the picture.** Rows are timelines and columns are half-turns, with time running left to right for
   both players. A vertical band marks the present. The frame of each board shows whose move it is there. Inactive
   rows are shaded. The present boards blink or glow. A faint "next board" placeholder sits after every timeline you
   can play. Time travel is drawn as curved arrows: from the start square to the past board, then on to the new
   board. Check is drawn as red arrows. Zoom and pan snap back to the present.
10. The layout API here needs small extensions for this: a board `kind` (frame style), arrows (lines with
    arrowheads and a colour per side), history cell contents (`views`), and a viewer-aware layout. For Black the time
    axis must not be reversed, and a 180° rotation of the whole layout would reverse it.

---

## 1. Sources

| # | Source | Language, licence | Version read | What I read |
|---|---|---|---|---|
| E1 | **5d-chess-js** (Alexbay218 / Shaun Wu, with Shad Amethyst and others), https://gitlab.com/5d-chess/5d-chess-js. It is the core of the "Open 5D Chess" project (chessin5d.net). | JS, AGPL-3.0 | git `ee403c8` (2022-06-15); npm 1.2.1 `dist/5d-chess.js` was run | `src/board.js` (`move`, `active`, `present`, `moves`, `positionIsAttacked`), `piece.js` (`timelineMove`, `moves`), `mate.js` (`blankAction`, `checks`, `checkmate`, `stalemate`), `action.js`, `index.js` (`submit`, `submittable`, `undo`, `inCheckmate`), tests |
| E2 | **5d-chess-renderer** (Alexbay218), https://gitlab.com/5d-chess/5d-chess-renderer. The PixiJS renderer of chessin5d.net. | JS, AGPL-3.0 | `8ec9a20` (2022-05-26), v1.1.16 | `config.js`, `palette.js`, `position.js`, `background.js`, `utils.js` (`transformBoard` ghost boards, `presentTurn`), `arrowManager.js`, `turn.js` (present blink) |
| E3 | **ftxi/5dchess_engine**, https://github.com/ftxi/5dchess_engine (web: https://ftxi.github.io/5dchess_engine/) | C++20 + WASM, BSD-2 | `4a1d35f` (2026-09-25) | `README.md`, `docs/index.md`, `docs/hypercuboid.md`, `src/core/multiverse_base.{h,cpp}`, `multiverse_variants.cpp`, `state.{h,cpp}`, `board.h`, `piece.h`; web UI `ui/scripts/{draw,worker,main,color}.js`, `ui/styles/color-schemes.css` |
| E4 | **adri326/5dchess-tools** (Shad Amethyst), https://github.com/adri326/5dchess-tools: v0.1 (`master`) and the v2 rewrite (branch `v2`) | Rust, MIT | master `68ee212` (2021-01-21); v2 `a5c012c` (2021-06-15) | README (both), v2 `lib/prelude/{partial_game,info,board}.rs`, `lib/check/threat.rs`, `lib/mate.rs` |
| E5 | **penteract/cwmtt** ("Chess With Multiverse Time Travel"), https://github.com/penteract/cwmtt | Haskell + z3, GPL-3.0 | `9632e99` (2026-05-18) | `README.md`, `Game/Chess/TimeTravel/FastCheckmate.lhs` (the original hypercuboid search), `Datatypes.hs`, `tests/results/2026-05-18T030055@90e4970.txt`, test games |
| E6 | **adri326/5dchess-notation** (5dpgn / 5DFEN, "Shad's notation"), https://github.com/adri326/5dchess-notation | JS, MIT | `99f6163` (2021-07-25) | README sections Coordinates, Jumps, Inactive timeline reactivation, Hashing, Even-numbered starting boards |
| E7 | **Slavrick/5dChessGUI**, https://github.com/Slavrick/5dChessGUI | Java, MIT | `3745495` (2025-03-18) | README (coordinate notation, features) |
| E8 | **Hexicube/5D-Chess-Game-Viewer** | Java, MIT | `033768e` (2020-08-10) | README (early notation) |
| E9 | **5d-chess-db**, https://gitlab.com/5d-chess/5d-chess-db (bot-generated mate database) | JS | `6270c0f` | README (DB layout, metadata `Checkmate_time`, `Checkmate_timeout`), `src/gen.js` |
| A1 | This app: `src/variants/core/{quantum,world,variant,ai}.js`, `src/variantplay/components/VariantBoard.vue`, `src/variantplay/composables/useVariantGame.js`, `src/variantplay/variantGames.js`, `handoff/IMPLEMENTING.md`, `handoff/CONTRACT.md` | | HEAD `155704f` | the points where a 5D world meets the core |
| R1 | Sibling research in this handoff: `multiverse-rules.md`, `multiverse-pieces.md`, `multiverse.md` (earlier 5D-lite spec) | | | rules facts, official variants and setups |

The task also mentions "open-5d-chess". This is the **Open 5D Chess** community project (Discord "Open 5D Chess",
chessin5d.net), whose code is the `gitlab.com/5d-chess` group (E1, E2, E9). I found no separate repository called
`open-5d-chess`.

---

## 2. Data structures of the multiverse

### 2.1 Per implementation

| | Multiverse | Board | Coordinates | Copying |
|---|---|---|---|---|
| **E1 5d-chess-js** | `fullBoard[l][t][rank][file]`: nested JS arrays. The timeline index is zig-zag: L ≥ 0 → `2L`, L < 0 → `−2L−1`. `t` is the half-turn index (parity = colour). Missing entries are `null`. | 2D array of small ints. Odd = one colour, even = the other; **negative = unmoved** (for castling and double steps). | Move = `[[l,t,r,f],[l,t,r,f], (castling rook) …]`. Promotion is a 5th element. | `board.copy` deep-copies the **whole multiverse** for each tried move. `setTurn` pads with `null`, and there is a comment about V8's PACKED→HOLEY transition. |
| **E3 ftxi** | `multiverse`: `vector<vector<shared_ptr<board>>>` indexed `[u][v]`. `u = l_to_u(L)` is zig-zag, `v = 2T + c`. It caches `l_min, l_max, active_min, active_max, timeline_start[u], timeline_end[u]`. | `board`: 11 bitboards (WHITE, BLACK, ROYAL, and the movement "letters" LKING, LKNIGHT, LPAWN, LRAWN, LROOK, LBISHOP, LUNICORN, LDRAGON), plus an `umove_mask` of unmoved pieces. A piece is a *combination of letters*: queen = rook+bishop+unicorn+dragon letters, princess = rook+bishop, royal = ROYAL flag. Walls = WHITE&BLACK. **Boards are at most 8×8.** | `vec4` packs x, y, t, l into one 32-bit int, 8 bits each, so adding two vectors is one integer add. README: "maximally 256 timelines and 64 units of time". | Copying a multiverse copies only the pointer table; boards are shared (`shared_ptr`). A move allocates 1–2 new boards. |
| **E4 5dchess-tools v2** | `Game` (immutable, all boards) plus `PartialGame` (the new boards of a candidate action). A `PartialGame` is either `Shallow` (one optional new board per timeline, split into a white vector and a black vector) or `Deep`, and it has a `parent` pointer, so a search tree stacks overlays **without cloning**. `Info`: present, active player, `TimelineInfo { index, starts_from, first_board, last_board }` per timeline. | `Board { l, t, width, height, pieces: Vec<Tile>, en_passant, castle, bitboards }`. En passant and castling are **per board**. Bitboards are used when the board fits. | `Time = isize` (half-turns, `present % 2 == 0` → white), `Layer = isize`, `Physical = i8`. | Overlay (copy-on-write). |
| **E5 cwmtt** | `State = (present, [Timeline], [Timeline], Player)`. Timelines are split into two lists (white's side and black's side), and `Timeline = (start, [Board])`. | `[[Cell]]`, where `Cell = Empty \| Full (Player, Piece, Moved)`. | `Coords = (l, t, x, y)` | Persistent (Haskell) lists. |
| **E6 5DFEN** | One `[board:L:T:colour]` string per board. `-0` and `+0` for even variants (the parser stores them as ±0.5). Unmoved pieces carry `*`. | FEN rows | `(LTT)sq`, for example `(-1T6)e4` | n/a |

### 2.2 Lessons

- **Timelines never disappear and boards never change.** A move only appends boards. So an immutable representation
  with structural sharing (E3 `shared_ptr`, E4 overlays) is both correct and fast. A board is a value, so the same
  history board can be shared by every search node (and, here, by every quantum world).
- **Keep the skeleton separate from the boards.** E3 caches `timeline_start/end` and the active range. E4 has
  `TimelineInfo`. Everything about turn order uses only these.
- **Piece identity is not needed by any 5D engine.** They store piece *types* per square. The quantum layer here
  does need identity: piece ids across worlds, so that it can recognise a ghost. That is the main adaptation (§9.2).
- **"Unmoved" must be stored per square on every board**, including history boards (E1 negative codes, E3
  `umove_mask`, E6 `*`). A board copied into a new timeline inherits the unmoved flags it had then. A piece that
  travels loses its flag: E3 `apply_move` uses `piece_name(...)`, which strips `0x80`.
- **Zig-zag or split storage for negative timelines.** E1 and E3 map L to a non-negative index. E4 and E5 keep two
  lists. Any of these works. Even-start variants (−0/+0) need extra care everywhere (E3 has a separate
  `multiverse_even` class using `~l`, and E6 stores ±0.5). **Recommendation: support odd starts only (one L0) in
  v1.** The official two-timeline variants can come later.

---

## 3. Move generation

### 3.1 Common algorithm (E1 `piece.moves`, E3 `gen_moves_impl`, E4 `gen/piece.rs`)

For every piece of the mover on every **playable** board: the last board of a timeline whose colour is the
mover's, whether the timeline is active or not. For every movement vector (dx, dy, dt, dl) and k = 1, 2, … (k = 1
only for leapers):

1. The target is (x + k·dx, y + k·dy, v + 2k·dt, L + k·dl). The factor 2 means a piece only lands on boards of its
   own colour.
2. **Stop if the target board does not exist.** E1 uses `while (positionExists(...))`. E3's cone copy marks a
   missing board as a friendly blocker and breaks. A board exists when its timeline exists and
   `start ≤ v' ≤ end`. Boards after `end` (the future) do not exist.
3. Stop if the square is off the board. If it holds a friendly piece, stop. If it holds an enemy, emit a capture and
   stop. Otherwise emit a move and continue.
4. Classify the target:
   - **physical**: dt = dl = 0;
   - **jump (hop, `>`)**: the target is the *last* board of another timeline, with the mover's colour;
   - **branch (`>>`)**: the target board is not the last board of its timeline, so a new timeline is created.

   The same target can therefore be a hop now and a branch later.

Vector sets (E3 `docs/index.md` generator, pieces research R1). The counts were checked by enumeration
[measured, `proto.mjs`]:

| piece | vectors |
|---|---|
| rook | 8: one axis |
| bishop | 24: two axes |
| unicorn | 32: three axes |
| dragon | 16: four axes |
| queen / royal queen | 80: any number of axes |
| king / common king | 80: any number of axes, one step |
| princess | 32: rook + bishop |
| knight | 48: 2 along one axis, 1 along another |

Pawns and brawns are special (forward along y and along L; see R1).

### 3.2 Performance tricks seen

- **E3 "copy masks"** turn a 4D slider into a 2D one. For a superphysical direction d in (t, l) and the physical
  distance n, the ring at distance n is copied from board p + n·d into one synthetic occupancy bitboard. Then one
  magic-bitboard rook, bishop or queen attack computes all rays of that (t, l) direction at once. This only pays off
  with bitboards. In JS on ≤ 8×8, plain ray walking is fast enough (§6.3).
- **E4 check flag**: `GenMovesFlag::Check` generates only moves that could capture. The threat code
  (`check/threat.rs`) shifts leaper and rider bitboards per (dl, dt) direction.
- **E1 is the simplest model.** Every call builds `[[l,t,r,f],[l,t,r,f]]` arrays, and every trial deep-copies the
  whole multiverse. It is still fast enough for one position (below 1 ms to generate the present moves in my runs),
  but not for search.

### 3.3 Special moves

- **Castling** is physical only. E1 tests attacks with `positionIsAttacked` on **the king's own board only**
  (knight, orthogonal and diagonal rays on that board). Attacks through time or from other timelines are ignored for
  castling.
- **En passant** is physical only, on one board. It is stored per board (E4 `Board.en_passant`). It is cleared on
  idle, phantom and copied boards (E4 `generate_idle_boards` sets `en_passant = None` and `set_castle(None)`).
- **Promotion**: E3 applies it on physical pawn moves and on superphysical **brawn** moves reaching the last rank.
  The official game has queen only; E1 offers every piece; E3 has `promotion_options`.
- **The unmoved flag** is lost on any superphysical move (E3).

---

## 4. Branching, the present, active timelines, the turn

These formulas come from E3 (`multiverse_base.cpp`, `multiverse_variants.cpp`, `state.cpp`) and agree with E1 and
E4.

- **New timeline index**: White → `l_max + 1`, Black → `l_min − 1` (E3 `state::new_line`). E1 does the same in
  zig-zag indices.
- **Active range (odd start, one L0)** (E3 `multiverse_odd::calculate_active_range`):
  `k = min(−l_min, l_max)`, `a = k + (k < max(−l_min, l_max) ? 1 : 0)`,
  `active = [max(l_min, −a), min(l_max, a)]`.
  So a side's created timelines are active up to the opponent's count + 1 (E4 `Info::is_active`,
  `timeline_advantage`, `timeline_debt`).
- **Reactivation**: when a new timeline widens the active range on one side, an old inactive timeline on the other
  side can become active again. E3 `insert_board` does `active_min--` "check reactivate".
- **Present** = the minimum `timeline_end` (a half-turn index) over the active timelines (E3 `get_present`, E4
  `recalculate_present`). The colour to move at the present is `v & 1`.
- **The present moves back** when a branch creates an *active* timeline that starts earlier: E3 `apply_move` sets
  `if (new_present < present) present = new_present`. 5dpgn marks this with `~` and `(~Tx)`.
- **Timeline status for the mover** (E3 `get_timeline_status`):
  - *mandatory*: active timelines whose end is exactly the present;
  - *optional*: other timelines whose end has the mover's colour (ahead of the present, or inactive);
  - *unplayable*: the rest.
- **Submit** is allowed iff the present's colour is no longer the mover's (E3 `state::submit`: `if (player == c)
  return false`; E1 `submittable`: `present(...).length <= 0`). The official rule adds "and not in check" (E1
  `submit` throws "currently in check"). E3 keeps check detection out of `submit`.
- **Undo** before submit exists in E1 (`undo` replays the move buffer from the last submitted board). In the app it
  would conflict with immediate rolls (§9.9).

---

## 5. Check, checkmate, stalemate

### 5.1 Check detection (cheap)

| Engine | Method |
|---|---|
| E1 `mate.checks` | Deep-copy. `blankAction`: every **present** board of the mover is copied forward unchanged. Then generate *all* opponent moves (every timeline, not only present) and keep those that land on a king or royal queen of the mover. |
| E3 `has_phantom_check` | "Phantom": advance **every timeline whose end has the mover's colour** (not only present ones) with an unchanged copy. Then search for one royal capture. It uses a borrowed `check_position` view, so nothing is copied. |
| E4 `is_in_check` | `generate_idle_boards`: copy the mover's boards *at the present*. Clear en passant and castling on the copies. Then `is_threatened`. |

Difference (open question in R1): E1 and E4 pass only present boards; E3 passes all boards of the mover's colour.
They differ only when a royal piece of the mover stands on a playable board ahead of the present or on an inactive
timeline.

**Cost [measured, bench2, 5d-chess-js, 8×8]**: `checks(..., detectionOnly)` takes 0.07 ms at 3 timelines, 0.28 ms at
8, and 0.57 ms at 22. Even the slowest engine is cheap here.

### 5.2 Checkmate detection (expensive; the reason not to implement it)

- A turn is a *set* of moves, one per playable board, in a consistent order. E3 `docs/hypercuboid.md` gives the
  heuristic count **40^n actions for n timelines**, and says that "Searching through all possible actions would
  require 20^10 = 1.024·10^13 iterations" for 10 timelines. To prove a mate you must exhaust them.
- **E1**: first one pass over single moves, then a DFS over moves that solve a check, then a BFS. All of it is
  capped by `checkmateTimeout` (default **60,000 ms**). On timeout it returns `[true, true]`, and `inCheckmate`
  **returns `true`**. So a timeout is reported as checkmate. The mate DB (E9) records `Checkmate_timeout` for
  exactly this reason.
- **E4**: returns `Mate::TimeoutCheckmate` / `TimeoutStalemate` (explicitly "probably"). It tries branching moves
  first when the player has a timeline advantage, uses "danger maps", and combines moves lazily.
- **E5 / E3: the hypercuboid algorithm.**
  - One axis per existing timeline, plus one per timeline that could be created. Each axis holds *semimoves*: null,
    physical, departure, or arrival.
  - Take a point, using a graph matching so that departures and arrivals pair up.
  - Test it: jump order consistent → the present has moved → no check.
  - If the test fails, remove the whole "problem slice" (all points with the same defect) and continue. The effect
    is that of a SAT solver on positive information.
  - E5 also has a z3 backend. Its README says it has "the best worst-case performance (among test cases) of any
    checkmate detection program (not counting the official client which is believed to incorrectly claim some
    positions are checkmate)".

**Measured comparison.** The cwmtt column is from `cwmtt/tests/results/2026-05-18…txt` (their machine). The
5d-chess-js column is bench4, with an 8 s cap.

| test game (cwmtt `tests/5dpgn`) | timelines | cwmtt HC | 5d-chess-js |
|---|---|---|---|
| `100_timelines` (mate) | 120 (375 boards) | 273 ms | hit the 8 s cap and **reported mate by timeout** |
| `manyChecks` (mate) | 18 | 28 ms | 9.8 s: past the 8 s cap, so most likely a timeout reported as mate |
| `NP0` (mate) / `NP` (not mate) | 8 | 8 ms / 7 ms | 1.1 s / 0.23 s |
| `wide` (mate) | 16 | 22 ms | 0.68 s |
| `standard` (mate) | 4 | 4 ms | 50 ms |

**Consequence for a quantum game.** Mate detection would have to run in up to 64 worlds, after every ply of a
multi-move turn, in a browser. That is not feasible. It is also not needed with the app's generic "capture the king"
rule. §9.6 shows how to stay close to the official feel: phantom-based danger arrows, and a warning before Submit.

---

## 6. Performance limits and scaling

### 6.1 Growth of the multiverse

**bench1** [measured]: 5d-chess-js, uniformly random legal moves, with probability p of choosing a time-travel move
when one exists. The columns count half-turn actions.

| p | after 10 actions | after 20 | after 30 | after 40 |
|---|---|---|---|---|
| 0.05 | 5 TL, 17 boards | 11 TL, 54 boards | 16 TL, 97 boards | 25 TL, 138 boards |
| 0.2 | 5 TL, 17 boards | 25 TL, 85 boards | 38 TL, 144 boards | 51 TL, 193 boards |
| 0.5 | 8 TL, 28 boards | 18 TL, 78 boards | 38 TL, 164 boards | 46 TL, 190 boards |

The largest move list for the present boards reached **1,410 moves** in one call. The mate DB example (E9, bot
game) reaches L−10…L+9 by turn 16. The human and puzzle games in cwmtt have 1–37 timelines (`niceAndrey`: 37
timelines and 348 boards after 121 actions). **Without a cap, timeline counts in the tens are normal.**

### 6.2 Branching factor per board (bench2) [measured]

On 8×8 there are 47–95 moves per present board, and **39–68 % of them are superphysical**. So time travel more than
doubles the move list. That matters for the AI and for UI target highlighting.

### 6.3 A lean JS generator (proto.mjs) [measured]

Typed-array boards, a ray walk over the vector tables above, and a `Map` of keyed move objects (the shape
`core/world.js` `generate` builds). The test is an open 8×8 middlegame on every timeline, with all timelines playable
(worst case). Window: 4 turns.

| board | timelines | moves | µs / world (count only) | µs / world (keyed Map) | ms for 64 worlds |
|---|---|---|---|---|---|
| 8×8 | 1 | 55 | 14 | 32 | 2.0 |
| 8×8 | 5 | 445 | 52 | 208 | 13 |
| 8×8 | 9 | 947 | 95 | 466 | 30 |
| 8×8 | 15 | 1,721 | 188 | 870 | 56 |
| 5×5 | 5 | 221 | 35 | 110 | 7 |
| 5×5 | 9 | 441 | 58 | 224 | 14 |

About **0.5 µs per generated keyed move**. Building the key strings costs more than the ray walk. With ≤ 7 timelines
(about 4 playable per side), `table()` over 64 worlds costs about 15–20 ms on 8×8 and about 8 ms on 5×5. That is
fine for the UI. It is the limiting factor for the AI (§9.8).

### 6.4 Cost of the core's O(size) world operations (bench5) [measured]

These are the core functions from `core/world.js`, run 64 times (once per world). The world holds a few hundred to
1,500 pieces.

| square-space size | `cloneWorld` ×64 | `worldKey` ×64 | key size | JSON / world |
|---|---|---|---|---|
| 1,000 | 1.8 ms | 9.5 ms | 3 KB | 6 KB |
| 3,584 | 1.4 ms | 14.8 ms | 10 KB | 18 KB |
| 5,376 | 1.6 ms | 17.2 ms | 14 KB | 26 KB |
| 20,000 | 8.3 ms | 76 ms | 45 KB | 77 KB |
| 128,000 | 38 ms | 362 ms | 256 KB | 395 KB |

`stateAfter` computes `worldKey` for every world of every candidate outcome, and the AI calls it thousands of times.
Games are saved to localStorage (`variantGames.js`: `initial` + `current` state, up to 24 games, with a quota of
about 5 MB). **The square space and the world JSON must stay small:** target ≤ ~4k display cells, and ≤ ~10 KB per
world.

---

## 7. Tricky edge cases (what the engines handle, and where they trip)

1. **A ray through a non-existent board stops** (E1 `while positionExists`, E3 blocker mask). Boards before a
   timeline's start and after its end do not exist, even if another timeline has a board at that T.
2. **Colour parity.** A T step is 2 half-turns, so every superphysical target has the mover's colour. A hop onto
   another timeline's last board is only possible if that board has the mover's colour. So only the mover's
   playable timelines can be hop targets.
3. **Hop vs branch** depends only on whether the target is the timeline's *last* board. This can change within a
   turn: after you move on a timeline, its old last board becomes history, so a later travel there branches.
4. **A hop advances two timelines**, so one move can clear two mandatory boards (R1 example E4).
5. **An active branch into the past moves the present back.** The remaining mandatory boards then become optional
   (R1 E1). An **inactive** branch never moves the present.
6. **Reactivation**: creating a timeline can make an old opposing timeline active again. The present can then jump
   back, and new mandatory boards can appear (E3 `insert_board`; E6 `(~Tx)`).
7. **Several branches in one turn**: they are numbered in move order (the next free index each time). Order matters
   for the numbering and for the present (E3 hypercuboid "jump order consistency").
8. **Arrive then depart**: a piece that hops onto a mandatory board advances that board, and the mover then cannot
   move there again this turn. E3 treats this as a jump-order problem.
9. **Unmoved flags** on copied boards: a branch copies them from the history board. A traveller loses its flag.
   Idle and phantom boards clear en passant and castling (E4).
10. **Castling and en passant are physical and on one board.** 5d-chess-js castling tests only attacks on that board.
11. **Check must pass the mover's boards first** (blank action / phantom / idle). Otherwise the opponent has no
    boards to attack from. Which boards are passed differs between E1/E4 and E3 (§5.1).
12. **False checkmates on timeout** (E1; E5 README about the official client). Never turn a timeout into a result.
13. **Even starts (±0)** break simple `L` arithmetic (E3 `~l`; E6 ±0.5; E1 `isEvenTimeline` in `timelineMove`).
    Turn-zero variants start at T0 (E1 `isTurnZero`).
14. **Pawn L-direction and brawn captures** differ in sign conventions between engines (E1 uses `-forward` in
    zig-zag space; E3 uses `forward_l = C ? 1 : -1`). Test them against known 5dpgn games, not by reasoning.
15. **A timeline can run far ahead of the present**, because optional moves on boards ahead are allowed. So "the
    last n boards of a timeline" and "boards within n turns of the present" are different windows (§9.3).
16. **V8 holey arrays**: E1 pads with `null` on purpose (comment in `board.setTurn`). Use dense arrays or typed arrays
    per row.

---

## 8. How the UIs show the multiverse

| Element | 5d-chess-renderer (E2, chessin5d.net) | ftxi web UI (E3 `ui/`) | Notes |
|---|---|---|---|
| Grid | `y = L · rowHeight`, `x = (2(T−1) + black) · colWidth`. So **+L rows are drawn below L0** (y grows downwards) unless `flipTimeline`. Board margin 160 px on an 800 px board (1.6 squares each side). | Same grid (`v = t<<1 \| c` columns, `l` rows) | Time runs left→right. Flip options: `flipTimeline`, `flipTurn`, `flipRank`, `flipFile` (default false) |
| Board colour | Frame tint: white boards light (`0xdddddd`), black boards dark (`0x222222`). The label colour matches. | Margin colour: white boards `#dfdfdf`, black boards `#555555` | Shows at a glance whose move a board is |
| Present | **The present boards blink** (`showPresentBlink`, 350 ms). Background: a "past" stripe texture left of the present column. | **A translucent gold column** across all rows (`--present: rgba(219,172,52,0.4)`) | R1: the official game draws a vertical "The Present" bar |
| Active / inactive | Inactive boards get a grey frame (`0x777777`). The background is **striped outside the active band**, in each side's colour. The band shows how many more timelines each side can create before they become inactive. | not separately | The "timeline advantage" becomes visible |
| Where to move | **Ghost board**: a copy of the latest board at alpha 0.4 in the *next* column, drawn only on timelines where the side to move can play, or where that ghost is in check (`utils.transformBoard`). Present boards blink. | **Phantom boards** (what the opponent would face if you passed) at 50 % opacity with a red tint, a HUD light when they are in check, and a "movable pieces" highlight (`--highlight-movable-piece`) | Two complementary ideas: the "next board" placeholder, and the "if you pass" preview |
| Moves history | Arrows only for **non-spatial** moves (spatial ones are off by default). They are curved, with a **middle point**: start → arrival square on the past board (`end`) → the new board (`realEnd`). Colour `0xd3a026`, alpha 0.6. | Physical last moves: the squares are highlighted on the **boards they produced** (`nextTurn(from)`, `nextTurn(to)`), in per-side colours. Superphysical moves: arrows in per-side colours | Showing every past jump clutters long games |
| Check | Red arrows (`arrow.check 0xf50000`); boards involved in a check get a red frame (`checkBorder 0xc50000`) | Red check arrows (`--highlight-check`); the whole canvas **desaturates** (fade 0.8) while you are in check | Strong, unmistakable feedback |
| Selection | Tints: self blue, moves green, captures red. Targets on **past** boards are drawn lighter (`pastHoverAlpha 0.2`). | Generated moves green | Past targets are visually distinct |
| Labels | Timeline labels (rotated 90°), turn labels, rank/file labels | `T{n}` column labels on the background grid. Rank/file labels **fade in with zoom** (`smoothClamp(30, 50, squarePx)`) | Level of detail |
| Zoom / pan | pixi-viewport drag, pinch, wheel, snap and bounce. Zoom is clamped to the full multiverse × 1.1. | Canvas with LOD: when a square is below 0.7 px, the board is drawn as one flat colour | Needed beyond a handful of boards |
| Threads | The engine runs in a **Web Worker** (`worker.js`); the page stays responsive | | Relevant for the AI here |

5dChessGUI (E7) adds "White/Black only views" (hide the other colour's boards) and analysis sidelines. Those are
analysis tools, not needed for play.

---

## 9. Recommendations: engine

The goal is a faithful 5D game (multi-move turns, Submit, the real present and active rules, time travel,
branching), with the generic quantum layer, bounded in size, and fast enough in a browser. R-numbers are for
reference.

### 9.1 Options and caps

| constant | recommended | option range | why |
|---|---|---|---|
| Board | **Standard 8×8** (official setup). Also **Small 5×5** `kqbnr/ppppp/5/PPPPP/KQBNR` and **Very Small 4×4** `nbrk/pppp/PPPP/KRBN` (official variants, R1 §7.2) | option `board` | faithful first; the small boards for phones and for a stronger AI |
| Created timelines per side, `MAXC` | **3** (so ≤ 7 timelines, L−3…L+3) | 1–4 | UI rows and engine cost (§6); mirrors the "timeline advantage" band |
| Travel window `WT` | **4 turns**: each timeline keeps its last `HB = 2·WT = 8` half-turn boards besides the live one | 2–6 | knight jumps go 2 turns back; rides rarely go further; the JSON size stays bounded |
| `maxPly` | **1,200** | | a turn is 2–8 plies (moves + Submit); the default 600 is only about 100 turns of 3 moves |
| `quietPlies` | **300** | | the default 100 plies is only about 15–30 turns with multi-move turns; this is too short |
| Starts | odd only (one L0) in v1 | | even starts (±0) complicate every formula (§2.2) |

A branch that would exceed `MAXC` is **not generated** (illegal). The UI must say why (§10.7). A travel target outside
the window (not among the last `HB` boards of its timeline) does not exist for move generation. The UI shows those
boards as "sealed" (§10.2).

### 9.2 World model (R2): live boards as squares, history as strings in `w.x`

The core requires `{ sq[], ty[], sd[], board[], x{} }`, loops over `board` and over the ids, and serialises worlds.
So keep **only the live board of each timeline** (its last board) as real squares with piece ids. Keep the history
window as frozen strings.

- `R = 2·MAXC + 1` rows. Row `u = L + MAXC`. `C = N·N` cells.
- **Static topology** (`V.topology`): `size = R·C` live squares, `sq = u·C + cell`.
  - Names must not contain `-`, `|`, `?`, `@`, `=` or a space (IMPLEMENTING.md). Suggestion: `L0:c3`, `L+1:c3`, and
    `L−1:c3` with U+2212 "−" for negative timelines.
  - These names are used by split, merge and measure codes (`parseCode` → `V.topology.byName`) and by history
    capture labels (`V.topology.names[s]`). Each timeline has exactly one live board, so they are unambiguous.
- **Piece ids** (live pieces only): preallocate `R·C` ids in every world (`sq = OFF` when unused), so the arrays have
  the same length in every world.
  - When a timeline is created (and for L0 at setup), the piece on cell c gets id `u·C + c`. This is deterministic
    and identical in all worlds.
  - **A travelling piece keeps its id.** Promotion keeps the id. Captured pieces go `OFF`, and ids are never reused
    (a row is created only once).
  - Trade-off: a *superposed* piece copied into a new timeline becomes separate ghosts per cell. For example, the
    copies of a knight that was 50 % c3 / 50 % e4 get two ids. They stay perfectly entangled through the worlds,
    but they cannot be merged with each other.
  - The alternative keeps one id for all copies: `id' = id + B·2^(k−1)` for the k-th created timeline (the earlier
    spec, `multiverse.md` §3.4). It lets ids grow to `B·2^(2·MAXC)` = 2,048 on 8×8, which makes a world about 3×
    larger. I recommend block ids.
- **`board`**: length `R·C` (live squares only).
- **`x`** (small, JSON), for example:

  ```js
  x = {
    s: 0,                    // side to move (drives nextSide)
    c: [1, 2],               // timelines created by White, Black
    tl: [                    // per row u: null, or the row's skeleton
      null,
      { st: 5, en: 9, p: [0, 4] },   // first half-turn index, last, parent [L, v]
      /* … */
    ],
    h: [                     // per row: up to HB history strings, oldest first, C chars each
      /* … */
    ],
    um: '…',                 // unmoved flags of live cells (bitmask string), if the board has castling/double steps
    ep: [/* … */],           // per row: en passant cell or -1 (physical only)
    k: null,                 // the side that captured a royal piece in this world (win)
  }
  ```

  Each history cell is one character: `.`, one of `PNBRQK` / `pnbrqk`, and an unmoved variant (for example `*`
  mapped to a second alphabet, as 5DFEN does).
- `solidExtra(w)` = the skeleton only: `c`, `tl` and `s`. This keeps all worlds on the same multiverse shape.
  History differences are allowed; they are part of `worldKey`, because `x` is stringified into it.
- **Sizes (estimates, not measured on an implementation)**:

  | board | live squares | display cells (live + history) | world JSON | 64 worlds |
  |---|---|---|---|---|
  | 8×8 (`MAXC` 3, `WT` 4) | 448 | 4,032 | about 10 KB | about 0.65 MB |
  | 5×5 | 175 | 1,575 | about 4 KB | about 0.26 MB |

  For comparison: with history as ids in `board[]` (R3, the fallback), 8×8 is about 60 KB per world (3.8 MB per
  state), and even 5×5 is about 24 KB (1.5 MB). That does not fit localStorage well.
- Why not history as ids?
  1. JSON size (above).
  2. The AI's `worldValue` (`ai.js:47`) sums the material of every id with `sq ≥ 0`. History material would outweigh
     live material and lag behind real captures.
  3. The core's `projection` / `budgetOf` would count history arrangements.

  R2 needs no fix for (2).

**R3 (fallback, no UI change): history as ids in `board[]`.** Use preallocated history ids `R·C + (u·HB + slot)·C +
cell`, each with its own type. Pros: the core's `squareView` and `isMeasured` see history without help, and the solid
key covers it. Cons: the sizes above, and an `evaluate` hook must subtract history material. Only for 4×4 and 5×5.

### 9.3 Skeleton functions (pure, from `x`, identical in all worlds)

- `active(u)`: L0 is always active. White's k-th created row is active iff `k ≤ c[1] + 1`. Black's k-th iff
  `k ≤ c[0] + 1` (§4).
- `present = min over active rows of tl[u].en`. `presentColour = present & 1` (0 = White if T1w has v = 0).
- `mandatory rows` = active rows with `en == present` and `(en & 1) == s`.
  `playable rows` = rows with `(en & 1) == s` (mandatory ∪ optional).
- **Submit is legal iff `presentColour !== s`.** Generate it as a ClassicalMove
  `{ key: 'submit', from: -1, to: -1, id: -1, capture: -1, kind: 'submit' }`. `apply` sets `x.s = 1 − s`. Then
  `nextSide(w) = w.x.s`. The core already handles `from < 0` (`stateAfter`, commit `155704f`). `actions(state)` returns
  `[{ code: 'submit', label: t('Submit turn') }]`.
- **Window test**: board (u, v) is stored iff `tl[u]` exists, `max(st, en − HB) ≤ v ≤ en`, and `v ≡ s (mod 2)` for
  travel by side s. Use the timeline-relative window (the last HB boards of that timeline) rather than a
  present-relative one. It is deterministic, it is a ring buffer per row, and it matches edge case 15.

### 9.4 Generation and application

- `generate(w, s)`:
  - For each playable row, the live board. For each own piece, the ray walk of §3.1 with the window test.
  - Physical moves have `to` = a live square.
  - Hops have `to` = the live square on the target row.
  - Branches have `to` = the **display square of the history cell**, `R·C + (u·HB + age−1)·C + cell`. This way the
    UI's click matching `m.from === f && m.to === sq` (`useVariantGame.js` ~l.239) works on the drawn past board.
  - Branches are generated only if `c[s] < MAXC`.
  - Pawns, brawns, castling, en passant and promotion as in R1.
  - Add `submit` when legal.
- **Keys**: square-based, identical across worlds, 5dpgn-like, never containing `|` and never starting with `?`:
  - physical `(0T5)b1-c3`
  - hop `(0T5)b1>(1T5)b3`
  - branch `(0T5)b1>>(0T3)b3`
  - promotion `…=Q`

  `T` is derived from the skeleton, so the keys are world-independent. Keys can contain `-` (only split and merge
  codes are split on `-`/`|`).
- **Captures by branch**: the captured piece is the *copy* that the new row would have. Set `m.capture = u_new·C +
  cell` (deterministic, ≥ 0). Then the core labels the outcome "capture" and resets `quiet`.
- `apply(w, m)` (the variant's own `V.apply`):
  - Freeze each touched live board into its row's history string (drop the oldest beyond HB).
  - Build the new live board(s).
  - For a branch, create the row `u_new`: `st = en = v' + 1`, `p = [L', v']`, empty history, pieces copied from the
    history string with block ids, the traveller placed, unmoved flags from the string, the traveller's flag cleared.
  - Update `c`. A royal capture sets `x.k`.
- **Precompute** the vector tables per piece type (typed arrays). Precompute the key prefix per row and T.

### 9.5 The one core extension: `applyMiss` (R4). "The structure follows the key"

Problem (A1): in `perWorldMove` (quantum.js:701) a world where the key is absent stays `{ b, k: 'miss' }`. It is
unchanged. The same happens in `splitBranches` (:852: worlds without X on f, or with a blocked lane), in
`mergeBranches` (:912), and in `measureBranches` (:968). In the multiverse, the worlds where the move happened have a
new board, so their `solidExtra` differs. `settle` (:1015) then rolls with a note `'solid:' + <whole solid key>`.
That roll is:

- a) meaningless to players (the UI says "A piece that is always solid was settled");
- b) kilobytes of text stored in every history record;
- c) it destroys "pass = link" and ghost splits and merges in 5D.

Fix: an optional hook `V.applyMiss(b, action) → world`, identity by default. The core calls it wherever it now keeps
`b` for a move-like action. `action` is the union sample move, or `{ key, from }` for split, merge and measure. The
multiverse variant then builds **the same boards** as the real move, with no piece moving:

- the source board passes (an unchanged copy);
- a hop's target board passes;
- a branch opens as an **untouched copy of the past board**.

So the skeleton after a move depends only on its key. Every world agrees, the solid roll never fires on structure,
and players can predict the new boards before the roll.

- **Measure**: either (a) it touches no board, so measuring is free within a turn (simplest, no hook needed); or
  (b) `applyMiss` passes the board that holds the measured part, so measuring costs that board's move. This is the
  earlier spec's D9 and it keeps measuring a real decision. With (b), measuring must be limited to parts on playable
  boards. That needs a legality hook, or it can be implemented in `applyMiss` as a no-op for other boards. **Rules
  decision for the lead.**
- **Fallback without the core change**: `measured(sample) → true` for every move. Then any move whose per-world
  results differ is rolled. The miss group keeps its unchanged skeleton, and only one group survives, so the result
  is consistent. But pass = link disappears in 5D, splitting or merging a ghost still triggers the solid roll, and a
  missed move is free (no board passes).
- **Time travel under R2**: the core cannot see history occupancy (`isMeasured` reads `b.board[sample.to]`). So the
  variant's `measured(sample)` must return `true` for **branch** moves (the target is a past board): "landing in the
  past is always settled". Hops land on live boards, which the core sees.
- **Also recommended**: shorten roll notes. Store an index or a short hash instead of the full `solidKey` (`settle`,
  :1029). This helps every variant.

### 9.6 Winning, check, and "no legal move" (R5)

- Keep the app's **king capture** as the win rule. `worldResult(w) = w.x.k !== null ? { winner: w.x.k, reason:
  'king' } : null`. The default "no royal pieces left" rule is not usable: every timeline has its own king, and
  history kings are not pieces under R2.
- **Show check like the real game**, without the real prohibition.
  - `royalDanger` (quantum.js:1266) calls `generate(V, b, e)` for the enemy.
  - Make `generate(w, e)` for `e ≠ w.x.s` return the **phantom** moves: the enemy's moves after the mover's
    remaining playable boards pass. This is E3's rule; E1 and E4 pass only present boards (open point §11.2). Then
    the existing "Your king is in danger: n %" line reflects real 5D check.
  - Draw red arrows (§10.5), and ask for confirmation on Submit when the danger is above 0.
  - Cost: about 0.1–0.6 ms per world (§5.1).
- `noMoves(state)`: no legal key and Submit not allowed (stuck on a mandatory board). Loss if in (phantom) danger in
  every world, else draw. This approximates checkmate and stalemate without any search.

### 9.7 Other core and UI touch points found

| where | issue | suggestion |
|---|---|---|
| `squareView` (quantum.js:134) | `id = b.board[sq]` is `undefined` for `sq ≥ board.length`, and `undefined < 0` is false, so it adds a bogus occupant | `if (!(id >= 0)) continue` |
| `VariantBoard.vue:340` | `boardView(state, topo.size)` covers the history display cells too | take live cells from `boardView(state, V.topology.size)`; take history cells from `layoutOf(state).views[sq]` (probabilities computed by the variant across worlds from `x.h`; about 64 × 3.6k chars per state, memoised) |
| `useVariantGame.js` `legalFromHistory` (~l.435) | the last-move highlight splits codes on `-` and uses `topology.byName`, so it fails on 5D keys | store `from`/`to` squares in the history record, or add a hook `codeSquares(code)` |
| `VariantBoard.vue:219` focus `watch` | `layoutOf` returns a new `focus` object on every state, so the view recentres after every ply | compare by value, and recentre only when the present or the side to move changes |
| `ai.js` `replyValue` (:253) | it assumes `s.turn` is the opponent after my move; with multi-move turns it is still me | if `s.turn === me`, return `evaluateState` (or the max over my continuation) |
| `ai.js` `worldValue` (:47) | it counts every id with `sq ≥ 0` | fine under R2; under R3 subtract history via `evaluate` |
| `variant.js` defaults | `maxPly 600`, `quietPlies 100` | 1,200 / 300 (§9.1) |
| rotation | `sides[1].rotate` defaults to 180, and a 180° turn of the whole layout reverses time | `rotate: 0` for Black, and a viewer-aware `layoutOf(state, { viewer })` (§10.1) |

### 9.8 AI (the generic `ai.js` with 5D in mind)

- The candidate lists are huge: hundreds to 1,700 keys at 5–15 timelines, and 40–70 % of them time travel (§6.2).
  Each candidate costs `branches()` over ≤ 64 worlds plus `stateAfter` (world keys).
- Suggested pruning, as a variant hook `aiCandidates(state)` or inside `chooseMove` for variants that declare
  multi-move turns:
  1. moves on **mandatory** boards first, ordered by captures;
  2. then branches that capture or give phantom check;
  3. then Submit once the present has passed;
  4. optional moves only if they capture.
- Evaluate with `evaluate(w, side)` terms: phantom danger per king, and the timeline advantage (R1: "worth slightly
  more than a queen").
- The E3 web UI runs its engine in a Web Worker. Here `chooseMove` already yields every 12 ms.

### 9.9 Turn flow and undo

In the real game, moves before Submit can be undone. Here every move is a quantum ply whose roll happens at once, so
**moves are final** and only Submit ends the turn. Say this in the rules text. The UI must not offer undo within a
turn (it would reveal and redraw rolls).

---

## 10. Recommendations: UI (`layoutOf`)

### 10.1 Geometry

- **Units**: square = 1.
  - Column pitch `N + g` and row pitch `N + g + 0.6` (the extra for labels), with `g ≈ 0.12·N + 0.5` (1.5 on 8×8,
    1.1 on 5×5). E2 uses 3.2 squares, which is too sparse here. IMPLEMENTING.md's 0.8 is tight for 8×8 labels.
- **Columns** = half-turn index v, from `min over rows (en − HB)` to `max en + 1` (the last column is for the "next
  board" placeholders). Time runs **left → right for both players** (E2, E3, R1). Collapse runs of empty columns
  (rows far apart in time) into a narrow "T6 … T11" gap column.
- **Rows**:
  - White's view: top to bottom L−3 … L−1, L0, L+1 … L+3. White-created rows are at the bottom, next to White, as in
    E2's default. This fits "side 0 at the bottom", and White's pawns then move *up* both on the board and across
    timelines, since −L is White's forward.
  - Black's view: the rows reversed and each board turned 180° (ranks and files), **time still left → right**.
  - This needs `sides[1].rotate = 0` (no global rotation) and a viewer-aware layout: the UI passes `{ viewer }` to
    `layoutOf`.
- **Only boards that exist** get cells. Placeholders are frames without cells.

### 10.2 Regions (`layout.areas`, new shades)

- `present`: a vertical translucent **gold band** behind the present column across all rows (E3). It is labelled
  "Now" at the top. Its tint could follow the side to move (open point §11.10).
- `inactive`: a desaturated or striped background behind inactive rows (E2). The row label adds "inactive".
- Optional: `advantage`, a band showing the rows a side can still create as *active* (E2 stripes), for example "Your
  next timeline will be active".
- `sealed`: a hatched strip at the left end of each row where older boards have left the window, labelled "sealed
  before T6". The cause is the window cap, so this makes the limit visible and honest.

### 10.3 Board frames (`layout.boards[]` with a `kind` extension)

- The frame colour shows the **board's colour**: a light frame means White moves there, a dark frame means Black
  (E2, E3).
- Status overlays:
  - `mandatory`: a thick accent frame with a gentle pulse (E2 blinks; respect `prefers-reduced-motion`);
  - `optional`: a thin accent frame;
  - `check`: a red frame (E2);
  - `target`: a light frame on every board that holds a legal target of the selected piece (targets can be far
    away).
- `next`: a dashed placeholder frame in the column after each **playable** timeline's end. This is E2's ghost board,
  without pieces, so it does not clash with the quantum ghost pieces. It shows where a board will appear. For a
  selected branch move, also preview the new row's placeholder, which is certain because the structure follows the
  key.

### 10.4 Cells and pieces

- Live cells come from the core view. History cells come from `layoutOf(...).views`, using the same probability
  badges as ghosts. So **uncertain history is visible**: a 50 % knight on T4 of L0 is what gets copied if someone
  branches there. That is the uniquely quantum 5D feature, and players should see it.
- Targets on past boards get a lighter target marker than targets on live boards (E2 `pastHoverAlpha`).

### 10.5 Arrows (`layout.arrows[]`, new: `{ x1, y1, x2, y2, mx?, my?, kind: 'travel'|'check'|'last', side }`)

- **Travel**: draw the jumps and branches of **the last turn of each side** only. E2 draws all of them, which
  clutters. Use a curve from the source square to the arrival square on the target board. For a branch, add a second
  dashed segment to the same square on the new row's first board (E2 "middle" mode). Colour by side.
- **Check**: red arrows from the attacker to the royal piece, from the phantom (§9.6). Label them with the
  probability when it is below 100 %.
- **Last physical moves**: square highlights on the boards they produced (E3), not arrows.

### 10.6 Zoom, focus, level of detail

- The initial and turn-start focus is the present band. The zoom fits all mandatory boards.
- Buttons:
  - "Now" (back to the present);
  - "Whole multiverse";
  - tap a board label to zoom to that board.
- Recentre only when the present or the side to move changes (§9.7).
- LOD: when a board is below about 60 px on screen, hide coordinates, percentage badges and board labels (E3 fades
  labels between 30 and 50 px per square). With ≤ 4k cells, the SVG stays usable. Memoise the per-board cell lists
  by skeleton.

### 10.7 Status panel (outside the SVG)

- "White to move · the present is T6 · still to move: (L0 T6), (L+1 T6)". These are chips; clicking one pans to the
  board. When the present has passed: "The present has passed: Submit, or keep moving on optional boards".
- The **Submit turn** button comes from `actions`. When it is disabled, say why ("Move on (L0 T6) first").
- Timelines: "Created: White 1 · Black 2 (max 3). Your next timeline will be active." When the cap is reached:
  "You have created 3 timelines: no more branches".
- The danger line (already in the app), reworded as "If you submit now, your king on (L0 T7) can be taken: 100 %".

### 10.8 Accessibility and text

- Cell aria-label: "(L+1, T5, White's board) c3: knight, 50 %".
- Board label: 5dpgn style, `(1T5)`.
- Move list: show the keys, which already are 5dpgn-like, `(0T5)Nb1>>(0T3)b3`. The piece letter can be added for
  display from the sample's type.

---

## 11. Uncertain points

1. **The official game's UI** (row order, colours, the present bar's style, and whether Black's view flips rows and
   boards) could not be checked directly: Steam and the fandom wiki are blocked here. §8 is from community clients
   (E2, E3) and R1.
2. **"In check" passing**: E1 and E4 pass only the present boards; E3 passes every board of the mover's colour. My
   §9.6 follows E3. The rules lens lists this as open too.
3. **Human game statistics**: I saw only the cwmtt test games (1–37 timelines), bot games, and my random games. The
   E9 database of real games (a public mirror at shadamethyst.xyz) was not downloaded. So the claim that ≤ 7
   timelines covers typical play is a judgment call.
4. **The caps (3 created per side, a 4-turn window)** are my proposal and have no source. The window mostly affects
   long rides and queens that travel back 5 or more turns.
5. **World-size numbers for R2** are estimates from the layout arithmetic, not measured on an implementation.
6. **Browser speed**: all timings are Node 22 in this container; mobile browsers are slower.
7. **The hypercuboid speed claims** (E3, E5) are the authors'. The cwmtt timings are from their results file, not
   re-run (it needs Haskell and z3).
8. **The claim that the official client sometimes reports false checkmates** comes only from the E5 README ("believed
   to").
9. **E3's `vec4` limits** ("256 timelines and 64 units of time") are quoted from `docs/index.md`, not verified in
   code.
10. **Whether the present marker takes the colour of the side to move** in the official game (R1 open point 10).
11. **The `applyMiss` hook, the `views`/`arrows`/`kind` layout extensions and a viewer-aware `layoutOf`** are
    proposals. Without them, see the fallbacks in §9.5 (every uncertain move rolled) and §9.2 (R3, history as ids,
    small boards only).
12. **Pawn L-direction sign conventions** differ in the engines' internal indexing (edge case 14). The direction
    itself is in R1. Verify it against a 5dpgn test game that contains a pawn timeline move.

---

## 12. Reproduction

- The scripts are in `handoff/prototypes/eng/`:
  - `bench1.js`: growth under random play;
  - `bench2.js`: moves per board and check cost;
  - `bench3.js`, `bench4.js`: mate detection, including the cwmtt test games;
  - `bench5.mjs`: the core's O(size) costs;
  - `proto.mjs`: the lean generator.
- They use the downloaded sources in `handoff/5dsrc/` (5d-chess-js 1.2.1 `dist`, cwmtt tests) and this repo's
  `src/variants/core/world.js`.
