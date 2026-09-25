# 5D multiverse workflow: status when it was stopped (2026-09-25 14:06 UTC)

Every agent that was started, in order, with its final report. "Stopped" means the agent was killed before it
finished; its work is lost unless it had already written files.

## research:rules: finished

I've written the rules file: handoff/research/multiverse-rules.md. The wikis, Steam, Reddit and Wikipedia are blocked here, so wiki text comes only from search excerpts; the rules rest mainly on the code of three independent implementations (5d-chess-js, ftxi/5dchess_engine, penteract/cwmtt). I ran five rule scenarios through 5d-chess-js 1.2.1 to confirm them (scripts in scratchpad/exp/).

1. **Boards and time:** every board is a position with a side to move, so each T has a white board and a black board (T1w < T1b < T2w …). Only the latest board of a timeline can be played, by the side whose colour it has. One time step is one full turn, so a piece always lands on a board of its own colour.
2. **Timelines:** White's new timelines are +1, +2, …, Black's are −1, −2, …, in creation order. Two-timeline setups start with −0/+0. Each player sees their own timelines extending downwards; time runs left to right for both.
3. **Three kinds of move:** a move on the same board makes 1 new board. A move onto another timeline's latest board (a hop) advances both timelines. A move onto an older board (time travel) advances the source and starts a new timeline half a turn later, holding only the travelling piece. Riders need every board on their path to exist. Each playable board can take part in at most one move per turn.
4. **Active timelines:** a player's n-th timeline is active only if the opponent has made at least n−1. The present is the earliest latest board among active timelines. It moves back after an active branch or when an older timeline becomes active again; inactive timelines and boards ahead of the present are optional.
5. **Submitting:** a turn is one or more moves plus Submit. You may submit only when the present has passed to the opponent's colour and no royal piece of yours can be captured. There is no pass. One hop can clear two boards you must play, and an active branch into the past makes the rest optional.
6. **Check:** it counts attacks through time and across timelines, including kings on past boards, from every board the opponent can play. Checkmate = in check with no legal turn (loss); stalemate = no legal turn otherwise (draw). Softmate and hardmate are only descriptions.
7. **Example:** fool's mate (1. f3 e6 2. g4 Qh4) is only a softmate in 5D. The single legal reply is the king escaping one turn into the past, (0T3)Ke1>>(0T2)f2.
8. **Pawns:** they move forward in rank or towards the opponent's timelines (White towards −L) and may double-step from the start in either direction. They capture diagonally on the board or one timeline forward and one turn earlier or later. En passant and castling only count the same board; promotion is to a queen only. A piece that travels counts as moved.
9. **Also in the file:** exact setups for 12 official variants, the clocks (10+3/L, 20+5/L, 40+8/L, a delay per active timeline), a 28-point edge-case checklist, and notes on how the rules meet the quantum layer. Those notes cover the solidExtra timeline structure, nextSide with a Submit button, the fact that there is no pass, and layoutOf with a white and a black board per T.
10. **Still uncertain (11 points in section 12):** whether "in check at turn start" assumes passing on present boards only or on all your boards; one brawn capture direction; draw offers and repetition or 50-move rules; the official game reportedly calling some non-mates mate; promotion in the Princess variant; and setups of the smaller variants.

## research:pieces: finished

Findings written to handoff/research/multiverse-pieces.md
1. Sources: most rule sites are blocked here (used as search excerpts only), so every vector was checked against three local engines (5d-chess-js, ftxi C++, the Java 5dChessGUI). They agree for White; ftxi's Black code has bugs. The vectors were also checked against moves decoded from real official games (5dpgn).
2. Vectors are (dx, dy, dT, dL). One step in T is one full turn (2 half-turn boards, always a board where the mover's colour is to move). Black flips only y and L. Every vector with dL = 0 and dT > 0 can never land on an existing board.
3. Riders need a board-existence test at every step, and paths are read on past boards. A piece's own past self blocks it (a rook that stood on a1 cannot ride straight back in time along T). Leapers only test the target.
4. Direction counts:

   | Piece | Vectors | Can land (not dL = 0, dT > 0) |
   |---|---|---|
   | Rook | 8 | 7 |
   | Bishop | 24 | 20 |
   | Unicorn | 32 | 28 |
   | Dragon | 16 | 16 |
   | Queen / royal queen | 80 | 71 |
   | Princess | 32 | 27 |
   | King / common king (one step) | 80 | 71 |
   | Knight | 48 | 40 |

   Unicorn and dragon cannot move on their own board. The file has full grouped tables plus the core/topology.js helpers that generate them.
5. Pawn (White): quiet steps (0,+1,0,0) and (0,0,0,−1). An unmoved pawn may double-step along either axis from any rank (a real game shows d1-d3 followed by en passant). Captures are (±1,+1,0,0) and (0,0,±1,−1). En passant works on one board only. Promotion is to a queen only, even in the Princess variant.
6. Brawn: moves and promotes like a pawn, plus 4 extra captures: (±1,0,0,−1), (0,+1,0,−1) and (0,+1,−1,0). The rule is "exactly 2 axes, at least one forward, none backward", with x and T counting as sideways. Common king: not royal and never castles. Royal queen: royal.
7. Castling happens on one board only. King and rook must be unmoved; the king moves 2 squares towards the rook. The check test counts only attacks on that board. Unmoved flags are per piece per board: a board copied into a new timeline keeps them, the travelling piece loses its flag.
8. Section 7 tables all 43 official setups with FEN, board size (8×8 down to 1×1), starting timelines and pieces per side, and lists which variants use S, Y, C, U, D and W. There is no official "Tiny" category.
9. Recommendations: use an official 5×5 setup (Small family) instead of Gardner's; override `orient` so Black negates coordinates 1 and 3; K, Y, P and W solid, keeping C solid too is a design choice; queen-only promotion; AI values estimated from community values (P1, R3, N5, B5, Q15).
10. Twelve uncertain points are listed, including: setups come from one community parser table; conflicting Half Reflected FEN; castling rook distance on small boards; brawn promotion on a cross-board capture; en passant on a new timeline's first board; the middle-square rule for the timeline double step.

## research:engines: finished

I wrote the engines research to `handoff/research/multiverse-engines.md`, with sources, measurements, 16 edge cases and 12 uncertain points. The benchmark scripts are in `handoff/prototypes/eng/`.

1. **Sources read:** 5d-chess-js and 5d-chess-renderer (the Open 5D Chess project behind chessin5d.net, which is the "open-5d-chess" of the task), ftxi's 5dchess_engine (C++ with a web UI), adri326's 5dchess-tools v1 and v2 (Rust), penteract's cwmtt (Haskell), and the 5dpgn notation spec. I found no separate repository called `open-5d-chess`.
2. **How every engine stores the game:** a table of boards that never change, indexed by timeline and half-turn. Each timeline has a small skeleton (first and last half-turn, who created it). The present, active timelines, the boards you must move on, and whether you may submit are all cheap functions of that skeleton.
3. **Check is cheap, checkmate is not:** check detection takes 0.07–0.6 ms in 5d-chess-js. Checkmate grows like 40^n actions for n timelines. 5d-chess-js reports mate when its time limit runs out, so it can claim false mates. **Do not implement checkmate; keep the app's king-capture rule and show 5D-style danger.**
4. **Timelines explode:** random play reached 25–51 timelines after 40 half-turns. I recommend hard caps: 3 created timelines per side (at most 7) and a travel window of 4 turns. Offer the official board options Standard 8×8, Small 5×5 and Very Small 4×4.
5. **World format is the main cost:** at 128,000 squares, 64 world keys take 362 ms and one world is 395 KB of JSON. Only the live boards should be squares with piece ids (448 squares on 8×8). The past boards in the window go as short strings in `w.x`. That gives an estimated 4–10 KB per world and about 0.65 MB worst case per game, which matters because games are saved in localStorage.
6. **One core change is needed:** today a world where a move misses stays unchanged. In 5D the other worlds gain new boards, so a solid roll fires, with a multi-KB solid key saved as its roll note. A hook `applyMiss(world, action)` fixes this: the missed worlds get the same new boards, just without the piece moving. The rule becomes "the boards a move creates depend only on the move, never on the outcome." Without it, every uncertain move must be rolled.
7. **Other small fixes found in the core and UI:**
   - `squareView` needs a guard for squares beyond `board.length`.
   - `ai.js` `replyValue` treats the mover's own next move as the opponent's reply, which is wrong with multi-move turns.
   - The last-move highlight (`legalFromHistory`) cannot parse 5D move codes.
   - The layout focus recentres the view after every ply.
   - The defaults `quietPlies` (100) and `maxPly` (600) are too short; I suggest 300 and 1,200.
8. **Speed:** a lean typed-array move generator costs about 0.5 µs per move, so 64 worlds take 13–30 ms at 5–9 timelines on 8×8. That is fine for the UI. The AI needs candidate pruning: moves on mandatory boards and captures first, then Submit.
9. **UI:** rows are timelines and time runs left to right for both players, so Black's view must not use a 180° rotation. It needs a present band, frames showing whose move each board is, shaded inactive rows, and pulsing frames on boards you must still move on. Add dashed placeholders for the next boards, curved time-travel arrows for the last turn only, and red check arrows. Show uncertain past boards with probabilities, mark sealed history, and add a status panel with a Submit button.
10. **Proposals the lead must decide:** the new layout fields (`kind`, `arrows`, `views`, a viewer-aware `layoutOf`), the `applyMiss` hook, and whether measuring a piece costs a board's move.

## design:faithful: stopped (not finished)

## design:playable: finished

Design written to handoff/research/multiverse-design-playable.md (about 870 lines, 9 sections, 36 test scenarios). It uses no core change: only the IMPLEMENTING.md hooks plus `solidExtra`, `nextSide`, `actions` and `layoutOf`.

1. **Boards:** only the official small boards. "Small" 5×5 is the default; "Small – Centered", "Very Small – Open" 4×4 (the easiest start) and "Just Knights" are options. Capacity is fixed at 5×5 cells, 5 rows (L−2…L+2) and 4 history ages, so 625 squares and about 7 KB per world.
2. **Limits:** each player may open 1 or 2 new timelines (option). At the cap a king in the past can still be captured; that ends the game and opens no timeline. Each timeline keeps its latest board plus the 4 before it (two turns). Older boards are sealed. The game is drawn after 300 plies without a capture or pawn move, or at 1000 plies.
3. **Turns:** the turn follows the real game (present, active timelines, must-move and optional boards). It ends by itself when the player has no board left. The Submit button ("↵") is only needed when optional boards remain. It comes from `actions()`, and its label says how many boards still need a move.
4. **Winning:** capture any king on any board, past boards included. With no legal move, a player loses if a king can certainly be captured, otherwise it is a draw. There is no checkmate search.
5. **Pieces:** every piece is written out as (x, y, T, L) vectors (counts checked against the topology helpers: rook 7, bishop 20, queen and king 71, knight 40). Pawns move forward on the board or one timeline towards the opponent, capture diagonally on the board or one timeline forward and one turn back or ahead, and always promote to a queen. Double steps, board-only en passant and board-only castling are included. Whether a king, rook or pawn has never moved is stored in its type (`k0`, `r0`, `p0`), so copied boards keep that state.
6. **The one quantum rule, forced by the core:** a world where a move cannot happen stays unchanged. So `measured: () => true`: any move that would turn out differently in different possibilities is rolled, with correct Missed/Moved/Captured labels. A Missed roll changes nothing and that board still waits, and measuring is free. Sliding past a ghost never links pieces.
7. **Why not "pass = link":** keeping it would need "void" moves. Those create null moves behind pieces that block for certain, because a world cannot see the other worlds. The `applyMiss` hook from the earlier research would fix this but needs a core change.
8. **Timeline structure is shared:** `solidExtra` holds the side to move, the created counts and each row's start, end and parent. Everything about turns and layout depends on it, so it is identical in every possibility. `nextSide` just reads the side to move.
9. **Split and merge stay on one board:** time-travel moves carry `id: -1`, so the core never uses them for splits or merges. The remaining structural rolls are rare: splitting one part of a ghost, or a split or merge whose path might be blocked. They show the core's generic note, and the design says so.
10. **The past is visible and uncertain:** history boards are real squares, and a piece there has its square as its id, so the existing board component draws past ghosts with percentages. A new timeline copies ghosts as linked copies, and old ghost squares count toward the budget until they are sealed.
11. **Danger display:** for the side not to move, `generate` returns one placeholder move marked "†" per world when a king can be captured. `royalDanger` therefore shows the chance that some move captures a king, which is the right number when misses are free.
12. **Computer player:** `evaluate` removes history material and adds king danger and a small bonus for having opened fewer timelines. `aiView` narrows the search to must-move boards, keeping a move in all worlds or none so the odds stay exact.
13. **Speed targets:** `generate` ≤ 0.15 ms per world, one UI move ≤ 20 ms at 8 worlds and ≤ 80 ms at 64, the fuzz test ≤ 5 s. A table lists 13 core behaviours the design relies on, with file and line, so tests can pin them.
14. **Screen layout (`layoutOf`):** rows are timelines and time always runs left to right. There is a present band, gold "must move" and blue "optional" halos, washed-out history boards and highlighted last moves. Arrows between boards mark branches and travel. The view zooms to the must-move boards and recentres only when the timeline structure changes. There is an option to draw Black at the bottom, and square names are readable for screen readers.
15. **Tests:** 36 scenarios with exact move lists, codes, ids and odds, covering structure, travel, pawns, quantum rules, limits, layout and performance. Section 8 lists every deviation from the official game, and the doc includes 8 translated `rules()` sentences.

## design:quantum: stopped (not finished)
