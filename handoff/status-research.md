# Variant research workflow: status when it was stopped (2026-09-25 14:06 UTC)

Every agent that was started, in order, with its final report. "Stopped" means the agent was killed before it
finished; its work is lost unless it had already written files.

## research:raumschach+trid: finished

I wrote both specs: `raumschach.md` and `trid.md`. Direct page fetches were blocked by the network proxy, so every rule comes from search-result extracts plus my own knowledge; each file says so in section 1. To keep the numbers and test cases consistent, I wrote two small reference move generators and checked every move list and count in the test sections against them.

**Rule sets chosen**
- **Raumschach:** Maack's rules as documented by the International Raumschach Federation (raumschach.org), cross-checked against chessvariants.com.
  - Black's minor pieces sit point-symmetric to White's: unicorns on Da5 and Dd5, bishops on Db5 and De5.
  - Pawns move one step forward or one level up and capture in 5 directions, including forward-and-up.
  - Promotion is on rank 5 of level E (Black: rank 1 of level A), to Q, R, B, N or unicorn.
  - There is no castling, no double step and no en passant.
- **Tri-D:** Bartmess "Federation Standard" rules, with Jens Meder's notation and clarifications. Squares are named like `b3N` or `z0QL1`.
  - **Board:** the four attack boards are fixed at their starting corners, which leaves exactly 64 squares.
  - **Movement (projection rule):** every move is a normal flat chess move seen from above and may end on any level that has the target square. A piece on either level of a square in between blocks the move. Gaps with no board are empty space you can fly across but not stop on. Moving straight up or down is not a move.
  - **Promotion:** on the last rank of the pawn's file (rank 9 on files z, a, d, e; rank 8 on b, c).
  - **Castling:** kingside only, where king and rook swap places.
  - **En passant:** the capturing pawn may land on either level of the skipped square.

Neither variant needs a new quantum rule. The Tri-D-specific quantum cases (blocking by a ghost on another level, splitting a piece across both levels of one square, when en passant and castling are certain) are all settled in section 4 of `trid.md`.

**Open design questions**
1. **Raumschach pawn captures:** the IRF gives 5 directions and chessvariants.com gives 4 (no forward-and-up capture). I chose 5. Test RQ4 exists only under this rule, so it breaks if you switch.
2. **Tri-D needs a new core feature.** Move generation must treat a whole column as blocked if any level holds a piece. The contract's movement descriptors can't express that yet, so I propose adding it to `core/movegen.js` rather than inside the variant.
3. **Where Tri-D castling rights live:** at state level as in the classic game, or per world with castling offered only when every world agrees. Both give the same result; the core needs to pick one.
4. **Fixed attack boards box pieces in.** White's z and e pawns can only leave by capturing, and the corner rooks are slow to develop. Movable attack boards could be a later option, but they would need a new move type and a changing board shape.
5. **Queenside castling in Tri-D** is left out because the sources disagree on where the pieces end up.
6. **The computer player will choke on splits.** In Raumschach a centred queen alone has up to 1,326 possible split pairs. I suggest the AI only considers splits among each piece's 6 best quiet moves.
7. **Layout:** the contract has one fixed layout, but both variants need a wide and a tall version depending on screen shape.
8. **Unicorn glyph:** a custom knight-with-horn sprite, or a "U" token as the fallback.
9. **Piece values** (unicorn 170, Tri-D rook 520) are estimates from mobility and need playtesting.
10. **Naming:** keep "Star Trek" out of the UI and call it "Tri-D Chess", with credit to Franz Joseph and Bartmess.

Files are in `handoff/`:
- `research/raumschach.md`
- `research/trid.md`
- `tools/raum.py`
- `tools/trid.py`

## research:multiverse: finished

I wrote the spec for `multiverse` (a playable simplified "5D-lite" of 5D Chess), with all 7 sections plus a list of open design questions.

**Research:** Wikipedia, Steam, the fandom wiki, chessbase and the official site were blocked by the network proxy. For those I only had search snippets. Instead I checked every rule against the source code of two independent open-source implementations of the official rules (5d-chess-js v1.2.1 and ftxi/5dchess_engine). I also used the community notation standard (adri326/5dchess-notation) and its variants repo. For the 5×5 start position I relied on the Gardner minichess paper (arXiv:1307.7118), known from search results only. Where the implementations disagree with the official game on promotion, I followed the official game: pawns promote to a queen only.

**The 5D-lite design:**
- **Board:** 5×5 with Gardner's start position, no castling, no double step, no en passant. At 8×8, up to 5 timelines × several boards would be unreadable, and 64 quantum worlds would be too slow.
- **Turns:** one move per ply, played on your "present": your earliest boards where it is your move. This forces a lagging timeline to catch up, as the official present does.
- **Winning:** capture any enemy king on any board, including a king left behind on a past board. There is no check.
- **Timelines:** you may open a new timeline only if you haven't opened more than your opponent, at most 2 each. So there are at most 5 timelines and all are always active.
- **History:** each timeline keeps its last 5 boards, so you can reach back at most 2 turns.
- **Square numbers:** `sq = ((L+2)·1024 + h)·25 + 5y + x`, where h is the half-step index; this runs from 0 to 127,999. A draw at ply 1000 keeps h below 1024.
- **Move keys:** `(0T2)c3-(0T1)a3` for a time-travel move, `(0T1)b1-a3|c3` for a split, `?(-1T2)a3` for a measure.
- **World object:** a whole multiverse per world. Which timelines exist and how far they have run is identical in every world; only the pieces differ.

**Quantum decisions:** all 14 are in section 4. The main ones:
- Split and merge only within one board.
- A ghost can travel in time. Where it wasn't really there, the new timeline still opens as an untouched copy of the past.
- A rolled move that comes out Missed opens nothing new; only your own board passes.
- Pieces copied into a new timeline from a board holding a ghost stay linked to the originals ("twins").
- Budget counts the history boards, so a merge only frees budget once the old boards drop out of the history, 2 turns later.

**Tests:** 9 classical and 5 quantum, with exact positions and expected results.

**Open design questions** (section 8 of the spec):
1. **Needs a change to the shared contract.** The quantum layer must call a new `applyMiss(world, move, structural)` for worlds where the move didn't happen, and a new `pass(world, board)` for Measure. It must also check, as an invariant, that the boards and timelines line up across worlds. Without these, a missed move leaves different worlds with different sets of boards.
2. Allowing a "time-travel split" later.
3. Counting history in the budget versus a separate cap on worlds.
4. Once both sides have opened 2 timelines, the past is closed. The alternative is to retire the oldest timeline.
5. I drew White's timelines below the main one, but couldn't verify the official game's on-screen orientation.
6. The official 4×4 "Very Small - Open" setup could be offered as an option.
7. The classic "cannot escape" rule is dropped here.
8. The computer player's search is costly in 4 dimensions.

File is in handoff/research:
- multiverse.md

## research:hyper4d: finished

I wrote the spec for `hyper4d`. It is TessChess (Ben Reiniger, 2013) with one change: I reordered the back row so each side has a bishop on each colour.

**Research limits:** WebFetch was blocked for every rules site (chessvariants.com and its mirrors, Wikipedia, mdpi.com, math.iit.edu, itch.io). The TessChess, Hyperchess, 4*Chess/Open King and Chesseract rules therefore come from search-result extracts, not the pages themselves. I read two open-source 4D engines directly by cloning them from GitHub (lukajk1/4D-chess and saFilipJohansson/4D-Chess). All move counts and test positions in the spec were computed with a reference move generator I wrote in Python.

**Board and names:** a 4×4 grid of 4×4 boards, 256 cells. A cell is named board then square, so `B2c3` is square c3 on board B2 (TessChess writes it `Bc23`). Coordinates are `[x, y, z, w]` = small file, small rank, big file, big rank.

**How the pieces move:**
- **Rook:** one axis, 8 directions, always 12 targets on an empty board.
- **Bishop:** two axes in equal steps, 24 directions. It stays on one colour.
- **Queen:** rook plus bishop, 32 directions, as in TessChess. An 80-direction queen would average 57 targets and reach up to 95 of the 255 other cells from a central cell, which would dominate a board where no line is longer than 3 steps.
- **King:** any touching cell, 80 directions. Every source except one uses this, and in the grid it is easy to see: the 3×3 block around it on its own board and on each board around it.
- **Knight:** 2 steps along one axis and 1 along another, 48 jumps. All sources agree.
- **Pawn:** pushes forward on its board or one board forward (two forward directions). It captures one step forward plus one step sideways (8 captures), never straight ahead and never forward plus forward. No double step, no en passant, no castling.
- **Promotion:** on rank 4 of the top boards A4–D4 for White (rank 1 of A1–D1 for Black), to queen, rook, bishop or knight.

**Setup:** the TessChess formation, 16 pieces per side.
- White pieces stand on rank 1 of boards A1–D1, files b and c: R Q K R on file b, B N N B on file c.
- White pawns stand on rank 2 of boards A2–D2, files b and c.
- Black is the mirror image in both forward directions.
- TessChess's own order puts all four bishops on the same colour; mine gives each side one of each. The start statistics are the same: 135 moves per side, perft 2 = 18,257, perft 3 = 2,571,743. No piece is attacked at the start, and I found no forced king capture in the first two moves.

**Quantum part:** no new rules are needed. Cross-board lines follow "pass = link" exactly like lines on one board, and splits may land on two different boards. Pawns and kings stay solid and every move they make is settled at once.

The spec also covers the engine mapping (a custom `orient` that flips both forward axes, piece values, a recommended bare-kings draw), a 7-bullet rules card, the drawing layout and 19 test cases: 12 classical and 7 quantum.

**Open design questions:**
1. Should we keep TessChess's exact back-row order for authenticity, even though all four bishops are then on one colour?
2. Should there be an option for an 80-direction queen? I don't recommend it.
3. Should the bare-kings draw be a rule for all variants instead of only this one? The shared core has no such rule today.
4. Balance is untested beyond TessChess's claim that king and queen force mate against a lone king. The formation is open, so rooks can reach the enemy's boards on move 1.
5. On a 360 px phone a cell is about 19 px wide, so play relies on zoom.

The placeholder `src/variants/hyper4d.js` says `category: 'rules'`; the catalog and the spec say `dimensions`.

Files are in `handoff/`:
- `research/hyper4d.md`
- `tools/hyper4d.py`
- `tools/setups.py`
- `tools/forced.py`

## research:kriegspiel+darkchess: finished

I wrote both spec files: Fog of War (`darkchess`) follows the chess.com rules and Kriegspiel follows the ICC ("wild 16") rules, both with capture-the-king. Most rules sites were blocked, so the rule sets rest on search-engine extracts plus my own knowledge; the specs say where. All test numbers were computed by a prototype of the hooks running on the real variant core.

**Files**
- handoff/research/darkchess.md (12 tests)
- handoff/research/kriegspiel.md (15 tests)
- Prototypes for the implementers: handoff/tools/hid/proto.mjs (visibility, own-only view, candidate moves, check and pawn-try announcements) and handoff/tools/hid/ai2.mjs (computer view; the no-leak checks pass)

**Rule sets chosen**
- **Fog of War:** chess.com rules (same as the original 1989 Dark chess). Lichess has no Fog of War variant, so that part of the brief doesn't apply.
  - A square is visible if, in at least one possibility, one of your pieces or ghost parts stands on it or could move to it (including en passant).
  - A visible square shows everything that might be there, with its percentage.
  - The move preview with odds stays: I checked that it only uses squares the mover can see.
  - There is no king-danger display and no warning before a risky move.
- **Kriegspiel:** ICC rules. The umpire announces to both players that a move was made, captures (square, and whether a pawn or a piece), check with direction(s) and its chance, and the number of pawn captures the player to move could try.
  - The umpire says "No" only when an attempt would miss in every possibility. The turn is not used, the state doesn't change and only the mover is told.
  - A move that is possible somewhere is played at once. If a roll makes it miss, the turn is still used.
  - There is no odds preview, and own roll results are shown without percentages.
- **The computer** in both variants sees only what a human in its seat would see. Unseen enemy pieces are assumed to be on their start squares; this baseline is deliberately naive. A test checks that the computer's view is identical for two games that differ only in hidden enemy moves.

**Open design questions**
1. **Core change for announcements.** Storing the umpire's announcements needs a small optional hook in `stateAfter` in `quantum.js`. The alternative is for the UI to replay the move list to recompute them.
2. **New optional variant flags and UI work.** The specs propose `hiddenStyle` (fog vs. plain board), `umpire` and `ownView`. The UI then needs:
   - a two-step hand-over, so the mover sees their own result before the curtain (today they never do);
   - Undo disabled while a hidden game runs;
   - the opponent's budget shown as "?";
   - no odds box in Kriegspiel.
3. **Existing UI code that leaks hidden information:**
   - `pieceAt` reads the first possibility's piece whatever its side.
   - The Split/Merge/Measure modes compute their targets from the real state. In Kriegspiel they must use the own-only view.
4. **Check chance and self-danger.** Should the Kriegspiel check announcement include the chance? I chose yes. There is also no warning when a player leaves their own king capturable.
5. **Scouting by splitting.** Every ghost part sees fully, however small its chance. This may be strong; the budget and the 4-square limit keep it in check.
6. **Castling in the variants core.** When a ghost might block the path, castling is settled by a roll. The classic `rules.md` says castling needs certainly-empty squares and never rolls. This affects all orthodox variants, not just these two.

## research:chess960+koth+threecheck: finished

I wrote all three spec files. Every section 7 test case was run on a prototype built on the real core, with the two castling fixes applied to the prototype. The rule pages themselves could not be opened: the proxy blocked lichess, Wikipedia and fide.com. So the rules come from search-result extracts plus prior knowledge, and each file says so. The prototype also found two bugs in the shared core (under "Core changes needed" below).

**Files written**
- handoff/research/chess960.md
- handoff/research/koth.md
- handoff/research/threecheck.md
- Prototypes and checks: handoff/prototypes/c960/ (`sp.mjs`, `proto.mjs`, `t960.mjs`, `tkoth.mjs`, `t3c.mjs`, `perft.mjs`)

**Rule sets chosen**
- **Chess960:** FIDE's official Chess960 rules, with the standard 0–959 numbering. The numbering was checked against the known anchors 0, 518 and 959: all 960 positions are distinct and valid, and the reverse formula gives back the number.
  - Castling ends on the usual squares: king to c/g, rook to d/f. Every square the king or rook crosses or lands on must be empty.
  - You castle by moving the king onto its own rook, as on lichess. Moving the king to its end square is ambiguous when the king only steps one square or doesn't move at all.
  - The start position is a new-game option (0–959, filled in at random, default 518).
  - Castling past a ghost is a roll, as in the other variants. Castling rights are tracked per possibility.
- **King of the Hill:** lichess rules — you win at once when your king reaches d4, e4, d5 or e5.
  - The king may not step onto a centre square that an enemy piece attacks after the move. This is the only check-like rule. Without it, 1.e4 e5 2.Ke2, then 3.Kd3 or Ke3 and 4.Kd4, is a forced win for White.
  - The rule is applied per possibility, so a ghost attacker turns the king move into a roll: arrive and win, or miss and stay.
  - The game-end roll never has to decide a hill win, because the king is always solid.
- **Three-check:** lichess rules — your third check wins, and a double check counts once. A check means one of your pieces other than the king attacks the enemy king after your move, in each possibility where the move was actually played.
  - Missed moves and measurements never give check.
  - If the opponent leaves their king attacked, each further move you play counts again.
  - The check counter is always certain. If a move gives check in only some possibilities, a roll settles it at once. So a possible third check is decided by that same roll, and the game-end roll never sees a partial third check.

**Core changes needed** (described in the files, not made)
1. **Chess960 castling bug in `applyClassical`.** The king is placed on the move's target square, which is the rook's square when the king doesn't move. I reproduced it: Ra1 Kg1 Rh1, then O-O, gives Kh1 Rf1. Fix: place the king on `extra.kingTo`. `castlingMoves` also needs a `toRook` option.
2. **Wrong outcome label after the core's extra settling roll.** When that roll splits a move that wasn't itself rolled, a part where the piece never moved is still labelled "Moved". This shows up in three-check test T6. Fix: recompute the label and captures for each part.
3. **Small hooks:**
   - an `attacks` option that skips the king as attacker;
   - `V.noteText` for the check-counter roll (the UI currently says "a solid piece was settled");
   - `V.sideInfo` to show the check counters in the player row;
   - board options on `orthodoxSpec` for the hill shading.

**Open design questions**
- **King of the Hill:** keep the "no stepping onto an attacked centre square" rule, or switch to "the king must survive one enemy reply on the hill" (no special rule, but a maybe-attacked hill becomes a game-deciding gamble)?
- **Three-check counter:** keep it always certain, or let it be uncertain per possibility? Uncertain counters would roll only at a possible third check. But they also create hidden extra possibilities, and the 64-possibility cap would then refuse splits while the budget pips still show room.
- **Three-check recounting:** should a check left standing count again, or only new checks?
- **Bare-kings draw:** add it as an option for Chess960 and Three-check, but not King of the Hill, where two lone kings still race for the hill.
- **Castling past a ghost:** it rolls here, but classic Quantum Chess forbids it. Changing that would affect every variant built on ordinary chess.
- **Chess960 start in other variants:** should King of the Hill, Three-check or Atomic offer it as an option? Lichess doesn't.

## research:atomic: finished

I wrote the atomic spec with all 7 sections and 16 test cases. The rule set is lichess Atomic. A prototype of the rules running on the real variant core produced every expected value in the tests. It also played 30 random games of up to 120 plies, splits included, with no errors or broken budgets.

**Research access:** WebFetch was blocked for lichess, Wikipedia, chessprogramming, wikibooks and the other rules sites. I did read lichess's own rules code and its test suite in full from raw.githubusercontent.com (`scalachess` `Atomic.scala` and `AtomicVariantTest.scala`). Wikipedia, chess.com and the piece-value article (gilgamath) were only available as search-result extracts.

**Rule set: lichess Atomic, with three changes.**
1. You win by capturing or blowing up the king. The lichess check and checkmate rules are dropped, so castling through or into danger is allowed.
2. Draws are the shared quantum draws plus one automatic draw: only the two kings are left. The finer lichess insufficient-material draws are not used.
3. The quantum rules below.

Everything else matches lichess exactly:
- **Blast:** the captured piece, the capturing piece, and every non-pawn piece on the 8 surrounding squares are removed.
- **Pawns:** they survive explosions unless they capture or are captured.
- **Own king:** a capture that would blow up your own king is illegal. So kings never capture, and touching kings can't be taken.
- **En passant:** the explosion is centred on the square the capturing pawn lands on.
- **Castling:** a right is lost when its rook or king is blown up.

**Quantum decisions:**
- An explosion never rolls on its own. It happens exactly in the possibilities where the move captures, and a move that might or might not capture is already rolled.
- A ghost part caught in a blast is destroyed only where it really stood, with no roll. The piece survives with the chance of its other parts, and its owner can measure it ("No longer on the board" or its square).
- If a capture next to your own king only *might* happen, the move rolls: Moved where the square was empty, Missed where an enemy piece stood.
- Explosions never raise a budget and never trigger the roll that keeps kings and pawns solid.
- The "only two kings left" draw can differ between possibilities, so a roll decides it.
- A merge that captures for certain next to the enemy king wins with no roll.
- Piece values for the computer player come from a published fit on lichess atomic games: p 100, n 150, b 190, r 270, q 560. An optional king-safety term is included. Without it, the computer already finds the classic early blow-up on f7 at every level.

**Open design questions:**
1. **King-danger ring (needs a core change).** `royalDanger` in `quantum.js` only counts direct captures of the king, so it shows 0% when a king is about to be blown up. The proposed fix is a generic test: "the side has no king after this capture move". A `royalLoss` hook would also work. I prototyped the generic test and it gives the right values (1.0, 0.5 and 0 in test T15 and T7). This change should be reported to you rather than made silently.
2. **Explosion marks on the board.** An optional `blast` mark would tint the 3×3 area of the last capture, using a `V.blastArea` hook. Do we want this small generic UI addition, or leave atomic without a visual explosion?
3. **Outcome label.** Keep "Captured" and let the rules card say that every capture explodes, or add an `outcomeText` hook so atomic can say "Captured (explodes)"?
4. **Draw rules.** Is dropping lichess's finer insufficient-material draws acceptable? The 50-move rule ends those positions anyway.

Files are in handoff:
- research/atomic.md
- tools/atomic/proto.mjs
- tools/atomic/cases.mjs
- tools/atomic/cases2.mjs
- tools/atomic/verify.mjs
- tools/atomic/danger.mjs
- tools/atomic/ai.mjs
- Atomic.scala
- AtomicTest.scala

## research:crazyhouse+bughouse: finished

I wrote both spec files: crazyhouse (the lichess rules) and bughouse (the common online rules, made turn-based). I checked every test case on a working prototype built on the real `src/variants/core`. For bughouse that prototype needs a small change to the core, a budget shared by each team.

Only raw GitHub pages were reachable (lichess, Wikipedia, chess.com and pychess.org were blocked), so the rules come from the lichess rules code itself, the pychess rule pages and Fairy-Stockfish, plus search-engine extracts. Random-game runs broke none of the invariants I checked, over 2332 crazyhouse moves and 2246 bughouse moves.

**Rule sets chosen**
- **Crazyhouse (lichess):**
  - Captured pieces change colour and go into your hand; you may drop them on any empty square instead of moving. Pawns cannot be dropped on rank 1 or 8.
  - A pawn dropped on its own second rank may still move two squares, and can then be taken en passant.
  - A captured promoted piece goes into the hand as a pawn. Promoted pieces get their own piece types (`+q`, `+r`, `+b`, `+n`) so the board can show a marker.
  - A rook dropped in its corner never castles.
  - As everywhere in the app, you win by capturing the king. The app's normal draw rules stay (50 moves each without a capture, pawn move or drop; the move limit; no legal move). Lichess has no 50-move rule but does have threefold repetition; the variants core has no repetition rule.
- **Bughouse:**
  - Four seats, and they move in this order: White A, White B, Black B, Black A. So the teams alternate every move, each board alternates White and Black, and every capture reaches your partner exactly two moves later. I compared this with the two other obvious orders, which are less even.
  - Teams: White A + Black B against White B + Black A. Board B is drawn turned round, so partners sit side by side at the bottom.
  - Capturing a king on either board ends the whole game; that king's team loses.
  - Real bughouse has no stalemate (the player waits for pieces), but waiting is impossible when taking turns, so a seat with no legal move makes the game a draw. Move limits are doubled for four seats.

**Quantum decisions**
- **Hands are always certain.** A square can never hold two different pieces across possibilities, so a capture always takes the same piece everywhere. Both prototypes confirm this: no state ever had differing hands. The brief's "ghost captured only in some worlds" case is settled by the capture's own roll. I added hands to the solid check anyway as a cheap safeguard.
- **Drops:** a drop onto an empty square is certain. A drop onto a square where a ghost might stand is a roll: "Dropped", or "Missed", where the piece stays in hand and the ghost is found. That makes a drop a cheap probe.
- **Which piece is dropped:** the lowest-numbered piece of that type in the hand. It is the same piece in every possibility, so no renumbering is needed.
- **No dropping onto two squares at once**; a dropped piece can split from its next turn.
- **Bughouse budget is per team:** 8 shared by both partners. That keeps the game at 64 possibilities or fewer, and the other team can never use up yours. The two boards never affect each other's odds.

**Open questions before implementing**
1. **Team budget (needed for bughouse):** add a small core hook, e.g. `budgetSides(side)`, so the budget counts both partners. Without it, one team can fill the shared 64-possibility limit and block the other team's splits.
2. **Two-coordinate helpers (needed for bughouse):** the castling and en passant helpers in `orthodox.js` only work on a single 2D board. Either generalise them (backward-compatible) or write local versions, as the prototype does. En passant also has to be tracked per board.
3. **Computer player in bughouse (optional):** it only looks at the next seat's reply, which is on the other board, so it will leave pieces hanging on its own board. A hook such as `replySide(state, me)` returning the opponent on the same board would fix this.
4. **Screen changes:**
   - a "+" marker on promoted pieces;
   - "Dropped" instead of "Moved" in move previews;
   - a highlight on the board whose seat is to move;
   - team budget pips;
   - on phones, whether the wide two-board layout needs a stacked alternative.
5. **Computer evaluation:** without a change, the computer drops every piece at once, because pieces in hand count for only 80%. The specs give an evaluation that counts them at full value (tried in the crazyhouse prototype), plus a team-material version for bughouse.
6. **Deliberate rule choices** you may want to revisit: no castling with a dropped rook, the app's own draw rules instead of lichess's, no-legal-move as a draw in bughouse, and no two-square drops.

Files are in handoff/:
- research/crazyhouse.md
- research/bughouse.md
- exp/zh/ (the prototypes: zh.mjs and bug.mjs, the team-budget core copy quantum_team.js, and the test and fuzz scripts)

## research:antichess+horde: finished

I wrote both spec files. Both follow lichess rules. Every test case was run on a prototype built on the real `src/variants/core`, and the results match what the specs say. Antichess needs one small core change before it can play as specified; horde needs none.

WebFetch was blocked for lichess, wikipedia, chess.com and pychess. I checked the rules against lichess's own source code (scalachess, read from raw GitHub) and used search extracts for the rest.

**Files**
- `handoff/research/antichess.md` (16 test cases)
- `handoff/research/horde.md` (15 test cases)
- Prototype and runs: `scratchpad/exp/anti/proto.mjs`, `tanti.mjs`, `thorde.mjs`, `t16.mjs`, `tquiet.mjs`
- scalachess sources: `scratchpad/ext/scalachess/` (Antichess, Horde, Position, Variant, Board, Castles)

**Antichess (lichess rules)**
- Capturing is compulsory and you choose which capture. The king is an ordinary piece, pawns may promote to a king, there is no castling.
- You win by losing all your pieces or by having no legal move.
- Opposite-coloured bishops is a draw, but only when no pawns are left; locked-pawn positions go to the 50-move rule instead.
- In the quantum game, win, stalemate and the bishops draw are checked in each possibility after every move, and the game-end roll settles any disagreement.
- Compulsory capture works on two levels:
  - In each possibility, only captures are allowed where a capture exists.
  - Across the whole game, if any move might capture in any possibility, you must try one of those moves. Quiet moves, splits and Measure are then not allowed, and a merge is allowed only onto an enemy piece. Every such try is settled by a roll (Captured, Moved or Missed).
- The king stays solid, so the rule "kings and pawns are always solid" holds here too.
- The computer player gives every piece the same value and tries to lose material.

**Horde (lichess rules)**
- White has 36 pawns: all of ranks 1–4, plus b5, c5, f5, g5. Black has the normal army and may castle both ways.
- White pawns on rank 1 or 2 may move two squares. A two-square move from rank 1 cannot be taken en passant.
- White wins by capturing the Black king; Black wins by capturing every White piece. Stalemate is a draw, checked per possibility.
- There is no insufficient-material draw, because in capture-the-king any White piece can still take a careless king.
- The variant must replace the default win check: the default would give Black the win at once, since White has no king.

**Open design questions**
1. **Core change for antichess (`compulsoryCapture`).** Without it, a player can dodge a possible capture by moving elsewhere, and Measure becomes a free pass. The spec describes the change (about 25 lines in `quantum.js`) and the weaker fallback.
2. **50-move counter in antichess.** The core resets it on moves of any solid non-royal piece, so antichess king moves reset it; lichess resets it only on captures and pawn moves. A per-type `resetsQuiet` flag would fix this; otherwise it is a minor deviation.
3. **Antichess king:** I chose solid; making it splittable would suit "an ordinary piece" but break the cross-variant rule.
4. **Horde balance:** White cannot split anything until a pawn promotes, while Black has every quantum move. Capture-the-king also means a Black "stalemate" is a loss rather than a draw. This needs playtesting.
5. **Optional UI hooks:** a "You must capture" status line and piece counters beside the players' names.

## research:hexagonal: finished

Wrote `handoff/research/hexagonal.md` with all 7 sections, plus a reference move generator at `handoff/tools/hexchess.py`.

**Sources.** The proxy blocked Wikipedia, chessvariants.com, wikibooks and greenchess, so I used search excerpts from those sites plus four GitHub projects: talvola/abstract_games, scottbedard/hexchess (the engine behind hexchess.club), k15z/hexchess-zero, and Coskey's Gliński board PDF, which contains the Wikipedia setup diagram. My generator's legal perft matches the published 51 / 2,586 / 137,858 exactly. That confirms the geometry, the setup and the pawn rules.

**Rule set chosen:** Gliński's standard rules as given by Wikipedia and chessvariants.com.
- **Board:** 91 flat-topped hexagons, files a–l without j, V-shaped ranks.
- **Setup:** White K g1, Q e1, B f1/f2/f3, N d1/h1, R c1/i1, pawns b1 c2 d3 e4 f5 g4 h3 i2 k1. Black mirrors this top to bottom: K g10, Q e10, B f9–f11, N d9/h9, R c8/i8, all pawns on rank 7.
- **Movement:** rook along 6 lines through the cell edges; bishop along 6 diagonals through the corners (the two cells beside a diagonal never block it); queen both; king one step in any of those 12 directions; knight to 12 cells.
- **Pawns:** capture onto the forward-left or forward-right neighbouring cell. Any pawn standing on one of its side's pawn starting cells may double-step, including one that captured its way there. En passant as in chess. Promotion to Q/R/B/N on the last cell of each file. No castling.
- **Cell shades:** checked against all 91 cells of the Wikipedia diagram. f6 is the middle shade, f1 light, f2 dark.
- **Coordinates:** I recommend "doubled" coordinates (file offset q, height h = 2·rank − 12 + |q|), with the axial and cube formulas also given. In this system the engine's default black/white mirror is already correct, the cell shade is simply h mod 3, and the en passant helper `orthodoxAfterMove` works unchanged.
- **Stalemate:** Gliński scores it ¾–¼. Here there is no check, so a stalemated king must move and gets captured: a full win for the stalemating side. A player with no move at all loses.

**Open design questions:**
1. **No legal move = loss** (via the `noMoves` hook), where variants normally score it a draw. I chose this to follow Gliński, whose stalemated player gets less than a draw. Such positions need about 20 blocked pawns, so test Q7 checks the hook directly.
2. **En passant can outlive its one move (core issue, affects every variant with en passant).** The en passant square is stored per possibility. Possibilities where a move missed, and every possibility on a Measure turn, keep the old value. Example: White d3-d5, Black measures, White measures, and Black's en passant capture is still offered three plies later. A variant cannot fix this alone; the core needs to clear the square in possibilities the move did not touch.
3. **Engine tweaks.** `pawnExtras` in `orthodox.js` hard-codes square-board pawn vectors. Either write a local hex version or give it optional forward and capture vectors. The existing placeholder module has category `rules`; the catalogue says `boards`.
4. **AI and values.** A central queen has 42 targets, so 861 possible splits; the AI should only consider a subset. Piece values (P 100, N 300, B 330, R 560, Q 950) are my choice, since published estimates disagree.

## research:fourplayer: finished

I wrote the spec for `fourplayer` and checked every test case in it on a prototype built on the real core. Web pages were blocked by the proxy, so the rules come from search extracts and prior knowledge, backed by the source of an open-source chess.com-style engine (github.com/obryanlouis/4pchess) that I cloned and read. Two of the rules need small changes to `quantum.js` (hooks 1 and 2 below).

**Files**
- Spec: `handoff/research/fourplayer.md`
- Prototype: `handoff/prototypes/fp/`
  - `proto.mjs`: the variant.
  - `quantum_fp.js`: a copy of `quantum.js` with the proposed `budgetLimit` and `passWhenStuck` hooks.
  - `lib.mjs` and `t1.mjs`–`t13.mjs`: the scenario and fuzz scripts.

**Rule set: chess.com 4 Player Chess**
- **Default mode, Free for all:** capturing a king knocks that player out, and their whole army leaves the board, ghosts included. The last king standing wins.
- **Option, Teams:** Red and Yellow play against Blue and Green. You cannot capture your partner's pieces. The first king captured loses for its team.
- **Board and setup:** as chess.com, confirmed against the engine's start position. Red has Qg1 Kh1, Blue Qa8 Ka7, Yellow Qh14 Kg14, Green Qn7 Kn8.
- **Turn order:** clockwise: Red, Blue, Yellow, Green.
- **Promotion:** on the 8th line in Free for all, the 11th in Teams, with a free choice of piece in both modes.
- **Castling:** on both wings for all four armies; for Blue and Green it runs along a file.
- **En passant:** only the next player may take. Each army can take and be taken en passant.
- **Draws:** 200 moves in a row without a capture or pawn move; move limit 1200.

**Quantum decisions**
- **Knock-outs are always certain:** kings are always solid, so a king capture is always rolled. The next player to move depends on how the roll came out.
- **Shared budget:** with the current core, Red and Blue can fill the 64-possibility cap with three splits each, and then Yellow and Green cannot split at all. Instead each player gets 2 while four are in the game, 4 with three and 8 with two. That keeps it to at most 16 possibilities with four players.
- **A player who cannot move sits out.** Only a captured king knocks a player out.

Random games (about 1,170 moves) never broke an invariant, and the computer took at most about 0.3 s per move.

**Open questions**
1. **Core hooks.**
   - `budgetLimit(world)` is needed for fairness.
   - `passWhenStuck` covers a very rare case; without it the game ends in a draw.
   - A resign hook (in `useVariantGame`) is needed because today's resign lists the Teams partner as a winner. In Free-for-all pass & play it would also let a resigning player drop out while the others play on.
   - Optional: pass the world to `enemies(a, b, w)`. Teams would then no longer need its move filter and computer-scoring correction.
2. **Points mode (chess.com scoring):** left out of v1. The spec sketches how it could be added.
3. **En passant window:** chess.com and the engine allow it until the pawn's owner moves again. Say if exact chess.com behaviour matters.
4. **Knocked-out army:** removed, rather than left as chess.com's grey blocking pieces.
5. **Free-for-all promotion:** free choice, rather than chess.com's automatic queen.
6. **Seats:** letting each seat be human or computer (for example two humans against two computers in Teams) needs a change to the new-game dialog.
7. **Teams budget:** 2 per player, or a shared team budget of 8 as the bughouse spec proposes.
8. **Square colouring:** follows the engine's UI; no choice suits all four armies.

The placeholder `fourplayer.js` says category `rules`, but the catalog says `boards`.

## research:capablanca+makruk: stopped (not finished)

## research:shogi: stopped (not finished)
