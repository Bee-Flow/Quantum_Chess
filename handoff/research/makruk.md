# Variant spec: `makruk` (Makruk, Thai chess)

Category: `regional` (as in `catalog.js`; the placeholder module wrongly says `rules`). UI name: "Makruk". Catalog
summary (already in `catalog.js`): "Thai chess, close to the ancient form of the game."

Every expected value in section 7 was computed with a prototype of the module below, run on the real variant core:
`handoff/prototypes/makruk/proto.mjs` (the module), `cases.mjs` (all cases of section 7; output in `cases.out`),
`perft.mjs` and `perftfen.mjs` (move generation against Fairy-Stockfish), `fuzz.mjs`, `fuzzend.mjs` (random games
with splits, invariants checked) and `bench.mjs` (cost of the stalemate test, computer player). Run them with
`node <file>` from that folder. A Fairy-Stockfish binary built from `handoff/ext/Fairy-Stockfish` is in
`handoff/tmp/makruk/fsf`, with `handoff/tmp/makruk/fsfperft.sh "<fen>" <depth>`.

**Review update (section 8.1).** The source review corrected the counting rules (the 64-move rule, the start of the
bare-Khun count after a capture by the lone Khun, the "more pieces than the limit" case, and when the draws wait).
`handoff/prototypes/makruk/proto.mjs` still has the old counting rules; the corrected module is the review copy
`handoff/tmp/rev1-makruk/proto2.mjs`, and every case of section 7 was re-run with `handoff/tmp/rev1-makruk/cases2.mjs`
(output in `cases2.out`; the random games `fuzz2.mjs`, `fuzzend2.mjs` pass). Where this spec and `proto.mjs` differ,
this spec is right.

**Engine review (section 8.2).** The second review made the draws also wait for a converging capture, moved the
count display to the planned `sideInfo` hook (`handoff/CORE-CHANGES.md` U6), gave Q3 its label after core change Q4,
and added tests T4b, T8b, T9e, T10, Q7 and Q8. The module as it now stands is `handoff/tmp/critic-makruk/proto3.tmpl`;
all cases of section 7 are assertions in `cases3.tmpl` (85 checks). They pass on the committed core, on the plan's
prototype core with Q4, Q8 and Q14, and on the core as it was being changed (`cases3-head.mjs`, `cases3-plan.mjs`,
`cases3-live.mjs`; run the plan one with `Q4=1 Q8=1 Q14=1`).

**Second source review (section 8.1, second part).** The Thai competition rules (threefold repetition and two bare
Khuns are draws), the Thai square names, the chessvariants.com page and more Thai sources on the limit table were
added; the gameindy summary and two "sources disagree" items were corrected; rules sentence 6 now says which limit
counts. No rule of the module changed. The classical expectations of section 7 (T1-T4b, T6, T6b, T6d, T7-T9) were
re-checked against the Fairy-Stockfish binary, and all 85 checks pass on the working-tree core of 2026-09-25 17:30
(`handoff/tmp/rules2-makruk/`).

**Second engine review (section 8.2, second part).** The count display is capped (`5/5`, never `20/5`) and shows
nothing once a Khun has been captured (section 3 `sideInfo`, `countInfo`); rules sentence 7 is shorter; tests T4c
(no legal move: a loss when attacked, a stalemate when not), T6e (the last Bia's promotion starts the count), Q9 (a
count already used up when it starts, and its wait), Q10 (a split that stalemates in one possibility) and two T10
display checks were added. The module is now `handoff/tmp/critic-makruk/r2/proto4.tmpl`. The 85 checks
(`r2/cases3-p4.mjs`) and the 16 new ones (`r2/new4.mjs`) pass on the working-tree core of 2026-09-25 17:50, which
has core changes Q1, Q4, Q7, Q8 and Q14; the random games (`r2/fuzz4-wt.mjs`) pass too.

What was reused from the stopped researcher's `handoff/prototypes/capamak/`: the piece descriptors (correct), the
setup (correct, built there by swapping d8/e8 after `standardSetup`), the pieces' honour limit table and the
"limit − pieces + 1" allowance measured with the core's `quiet` counter, and the adjacent-kings exception. Changed:
promotion goes to the Met type itself instead of a separate `+p` type, bare Khuns and stalemate are decided per
possibility (game-end roll) instead of from world 0, and a stalemate rule was added.

---

## 1. Sources and chosen rule set

Web pages were fetched on 2026-09-25. chessvariants.com answers 403, so its page was read through the Web Archive.

| Source | What it gives |
|---|---|
| Fairy-Stockfish, `handoff/ext/Fairy-Stockfish` (commit 9f778da): `src/variant.cpp` `makruk_variant()`, `src/position.cpp` `count_limit()` and the counting block of `do_move()`, `src/position.h` `counting_ply()`, `is_optional_game_end()`; `tests/perft.sh` | **The executable rule set.** Start FEN `rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w`, pieces Khon = silver (`FfW`), Met = ferz (`F`), promotion region ranks 6–8 (Black 3–1) to Met only, `doubleStep = false`, `castling = false`, `nMoveRule = 0` (no 50-move rule), `countingRule = MAKRUK_COUNTING`, stalemate = draw (default `stalemateValue`), threefold repetition = draw (default `nFoldRule = 3`). Counting: no count while any unpromoted pawn is on the board. Board's honour: started automatically after the move that removes the last pawn, limit 128 plies, **not** restarted by later captures. Pieces' honour limits 8 / 16 / 22 / 32 / 44 / 64 (first match of: 2+ rooks, 1 rook, 2+ khons, 2+ knights, 1 khon, else), started at `2 × (pieces on the board)` plies after a capture or promotion by the chaser, and at `2 × pieces − 1` plies when the bare king captures the last pawn (the chaser then moves first); the game is drawn as soon as a position has a count above `2 × limit`, **unless the side to move is checkmated** (a mate always wins, also when the count is already over the limit). A capture by the bare king does not restart the count. Perft from the start: 23, 529, 12012, 273026, 6223994. |
| PyChess guide, `handoff/ext/pychess-variants/static/docs/makruk.md` (= https://www.pychess.org/variants/makruk) and `server/game.py`, `server/wsr.py` | The same rules for players. Pawns promote on the sixth rank, no double step, no castling, "Stalemates are draws, as in chess." Board's honour: "When there are no unpromoted pawns left on the board, the player with disadvantage may start the board's honor counting. The count starts from 1, and the counting limit is 64", may be stopped and restarted, and "If the player who does the counting somehow checkmates the other player and did not stop counting, the game is declared a draw." PyChess lets the player start and stop it with a button (human games only). Piece's honour: "The count starts from the number of pieces left on the board, including both kings, plus one", limit "determined by the minimum number among these conditions" (2 rooks 8, 1 rook 16, 2 bishops 22, 2 knights 32, 1 bishop 44, 1 knight 64, only queens and promoted pawns 64), and "Once the piece's honor counting is started, the limit is set in stone … even if the pieces on the board get captured afterwards." |
| Wikipedia, "Makruk", https://en.wikipedia.org/wiki/Makruk | Setup (Khun d1 / e8, Met e1 / d8), moves, "A cowrie that reaches its sixth rank is always promoted", no double step and no en passant, "The game ends as a draw if the lord is stalemated, like in Western chess and unlike shatranj." Counting: 64 moves when no cowries are left, counted by the disadvantaged player; with a bare lord the count starts "from the number of pieces left on the board, including both lords" and the winner must mate "before the maximum number is announced"; limits two rooks 8, one rook 16, two bishops (no rooks) 22, two knights (no rooks or bishops) 32, one bishop (no rooks) 44, one knight 64, only queens 64. Example: two boats and a horse against a lone lord leave "three moves to checkmate (the given value of 8 minus the total number of pieces, 5)", and "If Black captures a white boat, the count does not automatically restart". Board's honour: "When a piece is captured the count restarts only if it is the last piece of a player"; "If the disadvantaged player checkmates the advantage side and did not stop counting, the game is declared a draw." No repetition rule is mentioned. Piece names and meanings: Khun (ขุน, lord), Met (เม็ด, seed), Khon (โคน, nobleman), Ma (ม้า, horse), Ruea (เรือ, boat), Bia (เบี้ย, cowrie shell), Bia ngai (เบี้ยหงาย, overturned cowrie). |
| GNU XBoard rules page by H. G. Muller, https://www.gnu.org/software/xboard/whats_new/rules/Makruk.html (the live page answers 403/429; read through the Web Archive capture of 2023-06-05) | Setup "d1, e8: King / e1, d8: Met / … / a3-h3, a6-h6: Pawns", Betza codes K, F, R, `FfW` (Khon), N, `mfWcfF` (pawn), "Pawns promote to Met when they reach the 6th rank; there is no choice", "Stalemate (no legal moves, but not in check) is a draw." |
| Makruk manual of makruk.gameindy.com (Thai), https://makruk.gameindy.com/manual/what-is-the-difference-between-counting-sak-kradan-and-sak-mak | Sak kradan (board's honour) must be requested, is counted from 1 to 64 by the fleeing side (its own moves only), then the chaser has one more move to mate, else draw; captures do not interrupt it unless the fleeing side is left with only its Khun (then sak mak replaces it). Sak mak (pieces' honour) starts automatically ("เริ่มนับทันทีเมื่อเข้าเงื่อนไข", at once when the conditions hold) when no unpromoted Bia is on the board and one side has only its Khun. The limit is read from the chaser's pieces "in order" (ตามลำดับ) from the list 2 Rua 8, 1 Rua 16, 2 Khon 22, 2 Ma 32, 1 Khon 44, 1 Ma or any number of Mets / promoted Bias 64, and the example calls the entry that applies the one "with the fewest moves" (น้อยที่สุด). The fleeing side's first counted move is "pieces on the board + 1"; "หากจำนวนหมากทั้งหมดบนสนาม + 1 มากกว่า ตาเดิน เกมจะเสมอทันที" (if the pieces on the board + 1 exceed the limit, the game is drawn at once). Example: two Rua and 6 pieces, the fleeing side counts from 7, and when it counts 8 the chaser makes the closing move. The page does not say whether a capture changes a running sak mak. |
| gameindy, "What are the draw rules in Thai chess?" (Thai), https://makruk.gameindy.com/manual/what-are-the-rules-for-drawing-in-thai-chess | Quotes the 2018 (B.E. 2561) competition rules of the Sports Association of Thailand (สมาคมกีฬา กีฬาไทยในพระบรมราชูปถัมภ์). Draws: stalemate (หมากอับ, the Khun is not in check but cannot move and no other piece can move); repetition ("รุกล้อ" / "เดินล้อ": both players repeat the same position 3 times); only the two Khuns left ("drawn at once"); agreement; and, when a clock runs out, a winner without mating material. A player who wants a draw that the opponent refuses may ask for one of the two counts. |
| gameindy, basics (Thai), https://makruk.gameindy.com/manual/lets-get-to-know-basics-of-playing-thai-chess | White Khun ง1 (d1), Black Khun จ8 (e8), White Met จ1 (e1), Black Met ง8 (d8), Rua ก/ญ, Ma ข/ช, Khon ค/ฉ, Bia on rows 3 and 6. White always moves first. The board usually has one colour on every square (some boards are chequered like a chess board). A Bia that reaches the enemy Bia row becomes a Bia ngai that moves exactly like a Met. |
| Thai competition rules 2018, appendix C (notation), http://web.archive.org/web/20180817205956/http://bgsthai.com/2018/05/07/lawofthaichessc/ (parts A and B of these rules are not archived) | Square names: files ก ข ค ง จ ฉ ช ญ from left to right, ranks ๑–๘ from the bottom; ก๑ is the lower left square, ญ๘ the upper right one. Piece letters ข (Khun), ร (Rua), ม (Ma), ค (Khon), ม็ (Met), ง (Bia ngai), บ (Bia). |
| makrukthai.blogspot.com, "กติกาการนับเพื่อไล่หมาก", https://makrukthai.blogspot.com/2014/08/blog-post_2.html | Board's honour: "64, without adding or subtracting pieces", no unpromoted Bia, requested by the weaker side. Pieces' honour table: 1 Khon 44, 2 Khon 22, 1 Ma 64, 2 Ma 32, 1 Rua 16, 2 Rua 8, promoted Bias 64; "with several big pieces, count the one with the smallest limit" (a Ma and a Khon: count the Khon); the pieces on the board are subtracted before counting. |
| playmakruk.com rules (a Thai play site's own summary), https://playmakruk.com/rules.html | Same setup, moves and promotion. Limits 8 / 16 / 22 / 44 / 32 / 64 with "priority rook, khon, knight"; "a started piece count keeps its limit after captures"; "the attacker gets one last reply after the count reaches its limit"; "stalemate, threefold repetition, dead material and agreement also draw". |
| chessvariants.com, "Makruk: Thai Chess" (H. Bodlaender), https://www.chessvariants.com/oriental.dir/thai.html (via https://web.archive.org/web/20240227073114/https://www.chessvariants.com/oriental.dir/thai.html) | Uncheckered 8 × 8 board, no castling, no double step, promotion to Met on the sixth row, stalemate a draw; the counting numbers are left out ("my sources on this seem to contradict"). Its setup puts Black's King on d8 and Queen on e8, which contradicts every other source (see below). Search extracts (boardandpieces, chessorb): the board is usually brown with lighter lines. |

Fairy-Stockfish was run on this machine to confirm: perft 1–5 from the start position (above); perft 4–5 on nine
hand-made positions with promotions and captures for both sides (all equal to the prototype, section 7 T1); and the
count timing in the K+R+R vs K case of T6 (after `Rb2xb7` FSF shows counting fields `16 8`, i.e. limit 8 moves,
count started at 4 pieces; the chaser's 4th move `Rc4-c8` is `mate 0` at `16 16`; if that 4th move is the quiet
`Rc4-c5` instead, the fleeing move after it makes the count `17 > 16`: a draw). The review added two FSF runs
(the UCI input must stay open, e.g. `(printf '...go depth 6\n'; sleep 2) | fsf`, or no `info` lines are printed):
`8/8/7k/6P1/8/2R5/1R6/K7 b` + `h6g5` (the lone Khun takes the last Bia) shows `16 7`, and after
`b2b3 g5h6 b3b2 h6h7 b2b1 h7h8 b1b7 h8g8` (count 15) FSF finds `mate 1` with `c3c8`: the chaser has 5 moves to mate
there, one more than after its own capture (T6d). `k6n/8/2N5/8/8/8/4K3/1RSM1SNR w` + `h1h8` (9 pieces, limit 8,
the capture mates) is `mate 0`, not a draw; the same capture without the Ma on c6 is a draw at once (T7).

**Where the sources disagree, and what is chosen:**

- *Setup of Black.* chessvariants.com puts Black's King on d8 and Queen on e8 (the Kings on one file). Wikipedia
  (diagram and "Seeds are placed at the right side of lords"), XBoard, gameindy (ขุนดำ จ8, เม็ดดำ ง8), PyChess ("the
  king is always on the left side of the player regardless of color") and Fairy-Stockfish all put Black's Khun on e8
  and Met on d8. **Chosen: Khun e8, Met d8.**
- *K+Khon+2 Ma vs K.* Wikipedia's parentheses ("two knights (no rooks or bishops)") and playmakruk.com ("priority
  rook, khon, knight") give 44; Fairy-Stockfish, PyChess ("the minimum number among these conditions"), gameindy (the
  list read "in order", the entry "with the fewest moves") and makrukthai.blogspot.com ("the one with the smallest
  limit") give 32. **Chosen: 32**, the executable rule and the majority of the Thai sources.
- *Start number of the pieces' honour count.* Wikipedia counts from "the number of pieces", PyChess and gameindy
  from "pieces + 1" and forbid exceeding the limit. Both give the chaser the same number of moves, `limit − pieces`,
  to deliver mate (checked with Fairy-Stockfish). This spec states the rule in chaser moves, so the convention does
  not matter.
- *The lone Khun captures the last Bia.* The count starts once its conditions hold, and the lone side's next move is
  the first counted one (gameindy: it starts "immediately when the conditions are met"; Fairy-Stockfish: count
  `2 × pieces − 1`). The chaser then moves first and gets `limit − pieces + 1` moves to mate, one more than after
  its own capture. **Chosen: as Fairy-Stockfish** (T6d).
- *More pieces than the limit.* gameindy: drawn at once if "pieces + 1" exceeds the limit (so with `pieces ≥
  limit`); it does not say what happens when the capture that starts the count also checkmates. Fairy-Stockfish:
  drawn unless the side to move is checkmated, so such a checkmate stands (a checkmate ends the game before anybody
  counts). They also differ in one corner: when the lone Khun takes the last Bia and `pieces = limit`, Fairy-Stockfish
  still gives the chaser its free move (one move to mate), gameindy draws at once. **Chosen: Fairy-Stockfish**, which
  in capture-the-king means that the chaser always gets at least one move (T7).
- *Repetition.* The Thai competition rules of 2018 (gameindy's draw page: "รุกล้อ", the same position 3 times),
  playmakruk.com and Fairy-Stockfish (`nFoldRule = 3`, and so PyChess) draw by threefold repetition; Wikipedia does
  not mention it. The app has no repetition draw in any variant (`handoff/CORE-CHANGES.md`, item 60): a documented
  deviation. With a Bia on the board, a game that repeats therefore runs on to the 600-ply limit.
- *Board's honour.* Human play: optional, started and stopped by the weaker side (Wikipedia, PyChess, gameindy).
  Engines: automatic from the moment the last pawn disappears (Fairy-Stockfish). An app with pass & play and a
  computer opponent cannot ask anybody to count, so **automatic** is chosen and then simplified (below).
- *Names.* Ruea / Rua / Rook and Met / Med vary. This spec uses **Khun, Met, Khon, Ma, Rua, Bia** (the brief's
  spelling). XBoard calls the Khon "Elephant"; the moves are the same everywhere.
- *Cambodian rules* (first-move leaps of king and Met, Ouk Chatrang) and the old *Sut Khun* rule are not Makruk as
  played today and are not used.

**Chosen rule set: Thai Makruk as implemented by Fairy-Stockfish `makruk` and played on PyChess**, with these
changes for Quantum Chess:

1. **Capture the Khun** instead of checkmate, as everywhere in the app. There is no check and no legality rule
   about the own Khun.
2. **Stalemate stays a draw** (a Makruk defining rule and an important defensive resource of the bare Khun). It is
   tested per possibility (section 4).
3. **Counting rules simplified** to two automatic rules and one bare-Khun draw, all of them only while **no Bia is
   on the board** (with a Bia on the board Thai Makruk and Fairy-Stockfish have no move-count draw at all):
   - **64-move rule** (replaces board's honour): with no Bia on the board, the game is drawn after **65 moves by
     each side (130 plies) without a capture** (or since the last Bia's promotion): the 64 moves of Thai chess to
     checkmate, plus the move that takes the Khun. It uses the core's `quiet` counter in `stateResult`; the core's
     own `quietPlies` rule is switched off.
   - **Bare-Khun count** (pieces' honour): when no Bia is on the board and one side has only its Khun, the other
     side must capture that Khun within `A = max(1, limit − pieces + 1)` of its own moves, counted from the lone
     Khun's first move after the last capture or promotion; otherwise the game is drawn. `limit` is the
     Fairy-Stockfish table, `pieces` all pieces on the board including both Khuns.
   - **Only the two Khuns left** is a draw, unless they stand next to each other (the side to move takes the other).
   - **The draws wait** while the player to move can capture the enemy Khun for certain (as in the classic game,
     `docs/rules.md` section 6), with an ordinary move or a converging capture. Then that capture decides.

   *Justification.* The real rules need a player who announces a count, may stop it, and may be given a draw on
   request; none of that exists in pass & play or against the computer, which is why engines count automatically.
   Checkmate becomes capture-the-king one move later, so every count gets one chaser move more: "mate within
   `limit − pieces` moves" becomes "capture within `limit − pieces + 1` moves" (verified move for move against
   Fairy-Stockfish, T6, T6b, T6d), and "mate within 64 moves" becomes "capture within 65 moves"; the wait rule
   covers the ply parity (a mate on the chaser's 65th move, when the chaser moved first, is still followed by the
   capture, T9). Fairy-Stockfish never declares a counting draw against a checkmated player; the `max(1, …)` and the
   wait rule are the capture-the-king form of that exception (T7). Counting both rules with the core's `quiet`
   counter (reset by captures and by promotions of the last Bia) needs no new state in the core and is easy to say:
   "counted from the last capture". Deliberate deviations (the first three only give the stronger side more time,
   never less; the fourth follows from automatic counting, as in Fairy-Stockfish):
   - board's honour is restarted by every capture (Thai and Fairy-Stockfish: it is not);
   - a capture by the lone Khun restarts the bare-Khun count with the new material (Thai: the limit is "set in
     stone"), and, as after any capture by the lone Khun, the chaser's next move is free (T6d);
   - with more pieces than the limit after a capture by the lone Khun, the chaser gets two moves instead of none
     (with exactly as many pieces as the limit it also gets two moves: that is Fairy-Stockfish's one move to mate,
     but gameindy gives none);
   - the counts are automatic and symmetric, so a checkmate (capture) by the counting side still wins (Wikipedia,
     PyChess: a draw if the counting side mates without having stopped the count).

   Section 3.1 names the core change that would remove the second deviation (rejected in the core plan, so the
   deviation stays).

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Board.** 8 × 8 squares, all 64 exist. The board is **not chequered**: every square has the same colour (the
  usual Thai board; gameindy notes that some boards are chequered, which changes nothing in the rules).
- **Square names.** Files `a`–`h` from White's left, ranks `1`–`8` from White's side, as in Fairy-Stockfish, PyChess
  and Wikipedia. Thai notation (competition rules 2018, appendix C) names the same squares with the files ก ข ค ง จ ฉ
  ช ญ and the ranks ๑–๘ from White's side: `a1` = ก๑, `d1` = ง๑, `e8` = จ๘, `h8` = ญ๘. The app uses the Latin names
  only.
- **Coordinates.** 0-based `[file, rank]`, `a1 = [0,0]`, `h8 = [7,7]`: `rectTopology(8, 8)` via `standardBoard`.
- **Directions.** Vectors are `[dfile, drank]`. "Forward" is `+rank` for White and `−rank` for Black (oriented
  vectors, default `orient`).

### 2.2 Pieces and movement

| Piece (type id) | Thai | Betza | Descriptors (for White; `oriented` vectors are mirrored for Black) | Notes |
|---|---|---|---|---|
| Khun `k` | ขุน, lord | K | `{ leap: KING_STEPS }` | Royal. One step in any of the 8 directions. |
| Met `m` | เม็ด, seed | F | `{ leap: BISHOP_DIRS }` = `[±1,±1]` | One step diagonally (a ferz). Also the promoted Bia. |
| Khon `s` | โคน | FfW | `{ leap: BISHOP_DIRS }`, `{ leap: [[0,1]], oriented: true }` | One step diagonally or one step straight forward (a shogi silver general). It can never step straight back or sideways. |
| Ma `n` | ม้า, horse | N | `{ leap: KNIGHT_JUMPS }` | The chess knight: it jumps. |
| Rua `r` | เรือ, boat | R | `{ ride: ROOK_DIRS }` | The chess rook. The only sliding piece. |
| Bia `p` | เบี้ย, cowrie | mfWcfF | `{ leap: [[0,1]], oriented: true, mode: 'move' }`, `{ leap: [[1,1],[-1,1]], oriented: true, mode: 'capture' }` | One step forward to an empty square; captures one step diagonally forward. **No double step, no en passant.** |

All moves capture the same way they move, except the Bia. Type ids are the Fairy-Stockfish letters (`rnsmksnr`).

### 2.3 Setup (every square)

| Side | Rank | a | b | c | d | e | f | g | h |
|---|---|---|---|---|---|---|---|---|---|
| White | 1 | Rua | Ma | Khon | **Khun** | **Met** | Khon | Ma | Rua |
| White | 3 | Bia | Bia | Bia | Bia | Bia | Bia | Bia | Bia |
| Black | 6 | Bia | Bia | Bia | Bia | Bia | Bia | Bia | Bia |
| Black | 8 | Rua | Ma | Khon | **Met** | **Khun** | Khon | Ma | Rua |

Ranks 2, 4, 5 and 7 are empty. The setup is point-symmetric: each Khun faces the enemy Met (Khun d1 / Met d8, Met e1
/ Khun e8). FEN `rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w`. White moves first. There is no extra state
(`x = {}`).

### 2.4 Special moves

None. There is no castling, no double step and no en passant.

### 2.5 Promotion

- A Bia that reaches its **sixth rank** (White: rank 6; Black: rank 3) by a step or a capture **must** become a
  **Met**. There is no choice. The move key is `c5-c6=m` / `c5-b6=m` (Black `d4-d3=m`).
- The promoted piece (Bia ngai) moves exactly like a Met, has the same value, and counts as a Met for the counting
  rules. It is the Met type `m` (as in Fairy-Stockfish). The zone is "rank 6 and beyond" (Black: 3 and below); a Bia
  can only arrive on rank 6, the rest matters only for hand-made positions.

### 2.6 Win, draw, turn order

- White and Black alternate; White starts.
- **Classical Makruk:** checkmate wins; stalemate is a draw; only the two Khuns left is a draw at once; the same
  position three times is a draw (Thai competition rules 2018, Fairy-Stockfish; not in the app, section 1); once no
  unpromoted Bia is left, the counting rules (section 1) draw long endgames; while a Bia is on the board there is no
  move-count draw.
- **This app (capture the Khun):**
  - **Win:** capture the enemy Khun.
  - **Draw:**
    1. **stalemate**: the side to move is not attacked, and every move it has leaves its Khun attacked (a move that
       captures the enemy Khun always counts as safe);
    2. **only the two Khuns are left**, unless they touch (then the side to move captures);
    3. **bare-Khun count** (section 1, numbers in 2.7), only while no Bia is on the board;
    4. **64-move rule**: no Bia on the board and 65 moves by each side (130 plies, `quiet ≥ 130`) without a
       capture, counted from the last capture or the last Bia's promotion;
    5. the 600-ply move limit (core default), the only limit while a Bia is on the board.

    Draws 2 to 4 wait while the player to move can capture the enemy Khun for certain: one move captures it in
    every possibility, either an ordinary move (one key that captures it in every possibility) or a converging
    capture (a merge onto the Khun whose only outcome is Captured). For draw 2 this means the Khuns touch; for draw
    3 the player to move is always the lone side, so it also means the Khuns touch. Stalemate never needs the wait
    (a side that can capture the enemy Khun is not stalemated).
  - **No legal move at all** (`noMoves`): only reachable when the side to move has no ordinary move in any
    possibility and no Measure or merge (so, in practice, no ghost; see 8.2, core change 1), and its Khun is attacked
    in every possibility (in a possibility where it is not attacked, rule 1 has already ended the game or rolled for
    it). Every possibility is then a checkmate, so the opponent wins. (`docs/rules.md` section 6 makes "no legal
    move" a draw; that rule is for a side that is not attacked, which here is the stalemate of rule 1.) Test T4c
    (a hand-made position: every White piece blocked, the Khun attacked or not).

### 2.7 Bare-Khun count: the numbers

Allowance `A = max(1, limit − pieces + 1)` chaser moves, counted from the lone Khun's first move after the last
capture or promotion: the chaser must take the Khun with its reply to the lone Khun's `A`-th move at the latest.
After a capture or promotion by the chaser, the lone Khun moves first, so the chaser has exactly `A` moves (T6);
after a capture by the lone Khun, the chaser moves first and that move is free, so it has `A + 1` moves (T6d).
`pieces` counts every piece on the board, both Khuns included. `limit` by the chaser's material, first match:

| Chaser has | limit | Example | pieces | A |
|---|---|---|---|---|
| 2 or more Rua | 8 | K+R+R vs K | 4 | 5 |
| 1 Rua | 16 | K+R vs K | 3 | 14 |
| 2 or more Khon | 22 | K+S+S vs K | 4 | 19 |
| 2 or more Ma | 32 | K+N+N vs K; K+S+N+N vs K | 4; 5 | 29; 28 |
| 1 Khon | 44 | K+S+M vs K | 4 | 41 |
| otherwise (Ma, Met only) | 64 | K+N+M+M vs K; K+M vs K | 5; 3 | 60; 62 |

With `pieces ≥ limit` the formula gives `A ≤ 1`, and `A` is then 1: the chaser's next move must take the Khun,
which is only possible if the capture that started the count already trapped it, or if the lone Khun steps into an
attack (T7). This is the capture-the-king form of the Thai rule ("if the pieces on the board + 1 exceed the limit,
the game is drawn at once", gameindy) with Fairy-Stockfish's exception that a checkmated player is never saved by
the count (`k6n/8/2N5/8/8/8/4K3/1RSM1SNR w`, `h1h8`: 9 pieces, limit 8, FSF `mate 0`).

---

## 3. Engine mapping (the core as built)

Sketch, verified in `handoff/prototypes/makruk/proto.mjs` (which is this code without `t()`); the counting part
(`quietPlies`, `stateResult`, `countInfo`, `canTakeKhun`) as corrected by the source review is in
`handoff/tmp/rev1-makruk/proto2.mjs`, the engine review's version (`canTakeKhun` with converging captures,
`sideInfo`) is `handoff/tmp/critic-makruk/proto3.tmpl`, and the second engine review's (capped count display, no count
after a Khun capture) is `handoff/tmp/critic-makruk/r2/proto4.tmpl`.

The module is built from scratch, **not** from `orthodoxSpec()`: that declaration brings castling, double steps, en
passant and, with the core changes being made (`handoff/CORE-CHANGES.md` W4, W5), the `applyMiss` and
`unifyWorlds` hooks that keep their bookkeeping in step. Makruk has none of these and its worlds carry no per-ply
state (`x = {}`), so it needs neither hook: a world where a move missed stays as it was, which is exactly right.

```js
import { t } from '@nextcloud/l10n'
import { BISHOP_DIRS, KING_STEPS, KNIGHT_JUMPS, ROOK_DIRS, standardBoard } from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { branches, legalMoves } from './core/quantum.js'
import { defineVariant } from './core/variant.js'
import { addPiece, applyClassical, attacks, emptyWorld, generate } from './core/world.js'

const board = standardBoard(8, 8, { shade: () => 'wood' })        // uncheckered wooden board
const BACK = ['rnskmsnr', 'rnsmksnr']                              // from file a; White, Black

const spec = {
	id: 'makruk',
	category: 'regional',
	sides: whiteBlack(),
	topology: board.topology,
	types: { k, m, s, n, r, p },                                   // table below
	quietPlies: Number.POSITIVE_INFINITY,                          // core rule off; 64-move rule in stateResult
	rules: () => [...],                                            // section 5
	setup() {                                                      // BACK[side] on rank 1 / 8, Bia on rank 3 / 6
		const w = emptyWorld(spec)
		for (const side of [0, 1]) {
			for (let f = 0; f < 8; f++) addPiece(w, BACK[side][f], side, board.topology.at([f, side ? 7 : 0]))
			for (let f = 0; f < 8; f++) addPiece(w, 'p', side, board.topology.at([f, side ? 5 : 2]))
		}
		w.x = {}
		return w
	},
	worldResult(w, mover) { ... },   // Khun captured, bare Khuns, stalemate of the side to move (below)
	stateResult(state) { ... },      // bare-Khun count and 64-move rule, only without Bias (below)
	noMoves(state) { return { winner: 1 - state.turn, reason: 'noMoves' } },
	reasonText(reason) { ... },      // 'stalemate', 'bareKings', 'count', 'quiet'
	sideInfo(state, side) { ... },   // the count in the chaser's player row (below, section 6)
}
export default defineVariant(spec)
```

| Field | Value |
|---|---|
| `sides` | `whiteBlack()`; White (side 0) moves first and is at the bottom |
| `teams`, `enemies`, `orient` | none / default / default |
| `topology` | `standardBoard(8, 8, { shade: () => 'wood' }).topology` (= `rectTopology(8, 8)` with wooden cells) |
| `types` | see the table below |
| royal | `k` (and so solid) |
| solid | `k`, `p` |
| splittable | `m`, `s`, `n`, `r` (default `!solid`), promoted Bias included (they are `m`) |
| `options` | none |
| `extraMoves`, `filterMoves`, `afterMove`, `onCapture`, `measured` | none (no double step, castling, en passant; captures go off the board) |
| `quietPlies` | `Number.POSITIVE_INFINITY`: the core's quiet-move draw is switched off, because Makruk has no move-count draw while a Bia is on the board; the 64-move rule (130 plies, only without Bias) is in `stateResult`. `maxPly` default 600 |
| `worldResult`, `stateResult`, `noMoves`, `reasonText`, `sideInfo` | below |
| `applyMiss`, `unifyWorlds`, `budgetRule`, `recordInfo`, `compulsoryCapture`, `passWhenStuck` | none (core defaults; `handoff/CORE-CHANGES.md` Q1, Q3, Q5, Q6, Q9, Q10) |
| type flag `resetsQuiet` | not declared: the default (`solid && !royal`) resets the quiet counter for Bia moves that happen and not for Khun moves, which is what the counts need (Q8) |

**Types** (`name` through `t('quantumchess', ...)`):

| id | name | moves | flags | value (cp) | glyph |
|---|---|---|---|---|---|
| `k` | Khun | `[{ leap: KING_STEPS }]` | `royal: true` | 400 | `{ sprite: 'k' }` |
| `m` | Met | `[{ leap: BISHOP_DIRS }]` | | 170 | `{ text: 'M', shape: 'circle' }` |
| `s` | Khon | `[{ leap: BISHOP_DIRS }, { leap: [[0, 1]], oriented: true }]` | | 250 | `{ text: 'Kh', shape: 'circle' }` |
| `n` | Ma | `[{ leap: KNIGHT_JUMPS }]` | | 320 | `{ sprite: 'n' }` |
| `r` | Rua | `[{ ride: ROOK_DIRS }]` | | 540 | `{ sprite: 'r' }` |
| `p` | Bia | `[{ leap: [[0, 1]], oriented: true, mode: 'move' }, { leap: [[1, 1], [-1, 1]], oriented: true, mode: 'capture' }]` | `solid: true`, `promote: { zone: (side, sq) => (side === 0 ? rankOf(sq) >= 5 : rankOf(sq) <= 2), to: ['m'] }` | 100 | `{ sprite: 'p' }` |

**Piece values.** Fairy-Stockfish's classical values for these pieces (midgame/endgame: ferz 420/450, silver
660/640, knight 781/854, rook 1276/1380 plus its "strongest piece" bonus 63/65, pawn 126/186 after its promotion
correction; `types.h`, `psqt.cpp`) give, relative to the knight, Met 0.53–0.54, Khon 0.75–0.85 and Rua 1.69–1.71.
PyChess's guide gives the Met "about 1.5 to 2 pawns" and the Khon more than the Met but less than the Ma. With the
Ma at 320 (the app's knight) this gives **Met 170, Khon 250, Rua 540**, and **Bia 100** matches "Met ≈ 1.7 Bia".
Fairy-Stockfish rates the Bia lower (0.16–0.22 of a Ma); 100 is kept for the PyChess ratio and the app's pawn scale.
The Khun value never matters (a game without a Khun is over).

**`worldResult(w, mover)`** (per possibility; the core's game-end roll handles disagreement):

```js
worldResult(w, mover) {
	const k0 = khunSquare(w, 0)
	const k1 = khunSquare(w, 1)
	if (k0 < 0 || k1 < 0) {                                        // the default rule: a captured Khun loses
		return k0 < 0 && k1 < 0 ? { winner: null, reason: 'king' } : { winner: k0 >= 0 ? 0 : 1, reason: 'king' }
	}
	if (piecesOnBoard(w) === 2) {                                  // only the two Khuns
		return touch(k0, k1) ? null : { winner: null, reason: 'bareKings' }   // touching: the side to move takes
	}
	return stalemated(spec, w, 1 - mover) ? { winner: null, reason: 'stalemate' } : null
}

// the side to move is not attacked, and every ordinary move leaves its Khun attacked
function stalemated(V, w, side) {
	const k = khunSquare(w, side)
	if (k < 0 || attacks(V, w, 1 - side, k)) return false
	for (const m of generate(V, w, side).values()) {             // cached per world; reused by the next turn
		if (m.capture >= 0 && w.ty[m.capture] === 'k') return false
		if (!attacks(V, applyClassical(V, w, m), 1 - side, m.from === k ? m.to : k)) return false   // early exit
	}
	return true
}
```

Cost: the test normally stops at the first move it tries. In 60 random games of up to 300 plies (8609 plies with
splits) the whole game loop took about 0.86 s with the test and 0.57 s without (≈ 0.1 ms per ply, `bench.mjs`). The
computer player picked a move on a two-world middle game in 2 / 21 / 34 ms (easy / normal / hard).

**`stateResult(state)`** (the bare-Khun count and the 64-move rule; state level, so never rolled):

```js
const BOARD_PLIES = 130                                          // 64 moves each to mate, plus the capture

stateResult(state) {
	const info = countInfo(state)                                  // null when the count does not run
	let draw = null
	if (info && info.done >= info.allow) {
		draw = 'count'
	} else if (!hasBia(state.worlds[0].b) && state.quiet >= BOARD_PLIES) {   // Bias are solid: same in every world
		draw = 'quiet'
	}
	if (!draw || canTakeKhun(spec, state)) return null             // the draws wait for a certain Khun capture
	return { winner: null, reason: draw }
}

// the side to move can capture the enemy Khun for certain: one move key captures it in every world, or a converging
// capture does (a merge onto the Khun whose only outcome is Captured; docs/rules.md 2.3 calls it certain)
function canTakeKhun(V, state) {
	let keys = null
	for (const { b } of state.worlds) {
		const here = new Set()
		for (const m of generate(V, b, state.turn).values()) {
			if (m.capture >= 0 && b.ty[m.capture] === 'k' && (!keys || keys.has(m.key))) here.add(m.key)
		}
		keys = here
		if (here.size === 0) break
	}
	if (keys.size > 0) return true
	const ks = khunSquare(state.worlds[0].b, 1 - state.turn)      // solid: the same square in every world
	for (const m of legalMoves(V, state)) {                        // ordinary moves, measures and merges; no splits
		if (m.type === 'merge' && m.to[0] === ks) {
			const list = branches(V, state, m.code)
			if (list && list.length === 1 && list[0].key === 'capture') return true
		}
	}
	return false
}

// countInfo: null while a Bia is on the board (Bias are solid, so this is the same everywhere) and once a Khun is
// missing in some world (the game is over: without this test the winner's row of T6c would show a count after the
// lone Khun took the chaser's Khun). Otherwise a side `lone` has only its Khun in EVERY world while the other side
// (`chaser`) has more than its Khun in some world. Then
//   allow = max(1, max over the worlds of (honourLimit(chaser's types in that world) − pieces on the board + 1))
//   done  = the chaser's replies to the lone side's moves since the last capture or promotion (quiet reset)
//         = state.turn === lone ? Math.floor(state.quiet / 2) : Math.max(0, Math.ceil(state.quiet / 2) - 1)
// (after a reset by the chaser the lone side moves first and every chaser move counts; after a reset by the lone
// Khun the chaser moves first and that move does not count, as in Fairy-Stockfish)
// honourLimit: r >= 2 → 8; r === 1 → 16; s >= 2 → 22; n >= 2 → 32; s === 1 → 44; else 64
```

`canTakeKhun` runs only when a draw is about to be declared, so its cost does not matter; `stateResult` is called
before `next.result` is set, so `legalMoves` and `branches` work on that state (and their move table is the one the
next turn uses). A merge is the only other way to capture a solid Khun for certain: a single ghost part captures only
where it stands. This matters mainly for the 64-move rule (T9e): with only the two Khuns there is no ghost, and the
count is normally used up with the lone side, which has no ghost, to move (M-10).

`countInfo` should be exported: `sideInfo` shows the count with it (section 6), and the tests read it.

**`reasonText(reason)`**: `'stalemate'` → "stalemate"; `'bareKings'` → "only the two Khuns are left"; `'count'` →
"the counting rule: the lone Khun was not captured in time"; `'quiet'` → "65 moves by each side since the last
capture or promotion, with no Bia left" (overrides the generic "50 moves …" text); others → null (the generic
`'noMoves'` text "no legal move" reads "White wins (no legal move)").

**`sideInfo(state, side)`** (the player-row hook of `handoff/CORE-CHANGES.md` U6, read by
`src/variantplay/panel.js` `sideInfoOf`; text visible, `title` as tooltip):

```js
sideInfo(state, side) {
	const info = countInfo(state)
	if (info) {                                                    // the bare-Khun count, in the chaser's row only
		if (side !== info.chaser) return null
		const done = Math.min(info.done, info.allow)                 // a count used up when it starts (M-7): 5/5
		return {
			text: done + '/' + info.allow,
			title: t('quantumchess', 'Counting: {done} of {allow} moves to capture the lone Khun', {
				done,
				allow: info.allow,
			}),
		}
	}
	if (state.quiet >= 100 && !hasBia(state.worlds[0].b)) {       // the 64-move rule, from move 50 on, both rows
		const n = Math.min(Math.floor(state.quiet / 2), 65)          // 65/65 while the draw waits (T9)
		return { text: n + '/65', title: t('quantumchess', 'Moves without a capture: {n} of 65', { n }) }
	}
	return null
}
```

**`evaluate(w, side)`** (optional): +8 cp per rank a Bia has advanced from its start rank (at most 2 ranks before
it promotes), own minus enemy. Not needed for correctness and not tested.

### 3.1 Core changes needed

**None.** Everything above uses the hooks as built (`worldResult`, `stateResult`, `noMoves`, `reasonText`,
`quietPlies`) plus `sideInfo`, which `handoff/CORE-CHANGES.md` U6 adds (a variant hook the UI reads; without it
nothing is shown and the result text says why the game was drawn). Status of the earlier requests:

1. **The count display** (a `statusText` line was proposed): rejected in the plan (item 70); `sideInfo` (U6) shows
   it in the chaser's player row instead (section 6). U6 is in the working tree: `src/variantplay/panel.js`
   `sideInfoOf` calls `V.sideInfo(state, side, viewer)` and `src/views/VariantGameView.vue` shows it.
2. **A per-state counter kept by the variant** (only to follow the Thai rule that a capture by the lone Khun does
   not restart the count): rejected in the plan (item 71). Proposed semantics, for the record: `state.vx` (JSON,
   default `{}`), copied into the next state by `stateAfter`, and an optional hook `V.stateAfterHook(prev, next,
   branch)` that may return a new `vx`; makruk would store `{ lone, allow, start: ply }` when the count starts and
   ignore later captures. The fallback of this spec stays: the count restarts after every capture with the material
   then on the board, which only gives the chaser more time.
3. **Missed moves reset `quiet`**: fixed by plan item Q8. Makruk is not affected either way: its counting rules
   only run while no Bia is on the board, when only captures reset `quiet`, and a Bia that disappears (captured or
   promoted for real) always resets it (checked on the plan's prototype core, section 8.2). Q8 is in the working-tree
   core.

Other core changes and makruk (Q1, Q4, Q7, Q8 and Q14 are in the working-tree core of 2026-09-25 17:50; every case of
section 7 passes on it): Q4 changes one test label (Q3, section 7); Q7 lets the danger ring count
converging captures; Q14 lets a part join another part of the same piece without a roll; Q2 (certain moves), Q5, Q6,
Q10 and Q13 do not apply (no castling or en passant; a promoted Bia is a Met in every possibility, because the Bia
is solid and its promotion is settled at once, so a piece never has two types).

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the
game-end roll, budget 8, at most 4 squares per piece. Decisions for the special rules:

**M-1. Solid and splittable pieces.** The Khun and the Bia are solid; the Met, Khon, Ma and Rua split and merge.
A promoted Bia is a Met and splits like one. Reason: the classic game makes kings and pawns solid; the Met and Khon
are the officer pieces, and keeping them splittable gives the short-stepping Makruk army its quantum play.

**M-2. Short steps mean few links.** Only the Rua slides, so "pass = link" happens only with Rua moves (and with
moves of ghost parts). Every other move either lands (roll when the target might be occupied) or is certain.

**M-3. Khon splits use its forward step.** A split needs two quiet Khon moves: e.g. a White Khon on f5 may split to
any two of e4, g4, e6, f6, g6 (10 splits, Q2), never to f4 (not a Khon move).

**M-4. Promotion.** The Bia is solid, so a Bia move is settled at once. A push onto the sixth rank where a piece
might stand is a roll: **Moved** (the Bia arrives and becomes a Met) or **Missed** (it stays a Bia, Q1). A diagonal
capture onto the sixth rank is Captured (promoted) or Missed. No possibility ever has a half-promoted Bia.

**M-5. Stalemate is decided per possibility.** After every move the game checks, in each possibility, whether the
player to move is stalemated there (not attacked, every ordinary move exposes the Khun). If that is true in every
possibility, the game is drawn. If it is true in some possibilities only, the **game-end roll** decides: "Draw
(stalemate)" with the weight of those possibilities, otherwise "the game goes on" and they are gone (Q3). Quantum
moves (measure, a move that misses) are not considered as an escape: the stalemate is a fact of the position in
that possibility, like a Khun on the hill in King of the Hill. Ghosts count where they stand in that possibility:
a ghost Rua that pins a Met in one possibility only makes a stalemate there only, so a quiet move of the other
side (here a Khun step) ends in the game-end roll, which also settles where the Rua is (Q7). The test follows every
turn, not only ordinary moves: a split that stalemates the opponent in one of its halves ends in the same roll
(splits never roll, but the game-end roll still applies; Q10), and a Measure, which moves nothing, can leave the
opponent stalemated in the possibilities it keeps.

**M-6. No checkmate test.** A mated player moves and loses the Khun on the next move, as in every variant of the
app (the danger ring shows 100%). Checkmate needs no special rule because capture-the-king gives the same winner one
move later; stalemate does, because without the rule a draw would become a loss.

**M-7. Bare-Khun count and ghosts.**
- It starts only when the lone side has **only its Khun in every possibility**. A lone side whose last piece is a
  ghost is not bare: its piece is somewhere (Q4).
- "No Bia on the board" is the same in every possibility (Bias are solid).
- The limit is taken per possibility from the chaser's material; the **most generous** allowance counts (chaser
  material differs between possibilities only after rare captures whose victim differed between possibilities;
  T8b).
- Every turn of the chaser that answers a turn of the lone side counts, whatever it is: a move, a split, a merge, a
  measure, or a move that Missed (Q8). The count starts with the lone Khun's first move after the last capture or
  promotion; if the lone Khun made that capture, the chaser's next turn is free (T6d).
- The count runs from the last capture (the core's `quiet` counter), also when the lone side becomes bare in every
  possibility through a roll that captured nothing (its last piece had already been captured in some possibilities
  by an earlier capture whose victim differed between possibilities). The count may then already be used up, and
  the game is drawn at once unless the wait (M-10) applies (Q9).
- The count is state-level, so reaching the limit is never rolled.

**M-8. Only two Khuns.** Decided per possibility, so a capture of a ghost part that leaves the enemy with only its
Khun in some possibilities would be settled by the game-end roll. In practice the capture itself is already a roll
(Captured / Moved), and the Captured result is the draw (Q5).

**M-9. The 64-move rule** runs only while no Bia is on the board (the same in every possibility) and uses the core's
global `quiet` counter, which a capture that happened (Captured result) resets. The move that removes the last Bia
(a capture, or a promotion that really happened) resets it too, so the 65 moves are counted from the last capture
or from the last Bia's promotion. Every other turn, including a Missed move, a split, a merge and a measure, adds 1.

**M-10. The draws wait for a certain Khun capture.** The bare-Khuns draw, the count draw and the 64-move draw wait
while the player to move can capture the enemy Khun for certain: one move captures it in every possibility, either
an ordinary move (one key that captures it in every possibility) or a converging capture (a merge onto the Khun whose
only outcome is Captured, certain by `docs/rules.md` 2.3) (T5, T6c, T9, T9e). This is the classic rule "the draws
wait if the player to move can capture the enemy king for certain" (`docs/rules.md` section 6). A capture that is
only possible in some possibilities does not stop the draw (T9), and neither do two single-part shots that each
capture in half of the possibilities (T9e: only the merge is certain). For the bare Khuns it means "the Khuns touch"
(the Khuns are solid), which `worldResult` tests per world. The count is normally used up by the chaser's reply,
with the lone side (which has no ghost) to move, so there too the wait means "the Khuns touch"; only a count that is
already used up when it starts (M-7) can be tested with the chaser to move (Q9).

**M-11. Budget.** Unchanged. No Makruk rule adds possibilities; the stalemate and count rules only end games.

**Summary for players.** Pieces move as in Thai chess and ghosts work as everywhere. Stalemate is a draw, and if it
is a stalemate in only some possibilities, a roll decides. Once no Bia is left, long endgames are drawn: when one
side has only its Khun the other must capture it quickly, and otherwise 65 moves without a capture end the game.

---

## 5. Player-facing rules text (for `rules()`)

Each line is one `t('quantumchess', '…')` string (8 sentences):

1. The Khun (king) starts on d1 for White and on e8 for Black, with the Met beside it, and never castles; the Bia
   (pawns) start on each side's third rank.
2. The Met steps one square diagonally, the Khon one square diagonally or straight forward, and the Ma, Rua and Khun
   move like the knight, rook and king.
3. A Bia moves one square forward and captures one square diagonally forward; it never moves two squares (so there
   is no en passant), and on its sixth rank it always becomes a Met.
4. Stalemate (not attacked, but every move would expose the Khun) is a draw, and if it is a stalemate in only some
   possibilities, a roll decides.
5. When no Bia is left and one side has only its Khun, the other side must capture that Khun within a set number of
   its moves, counted from the lone Khun's first move after the last capture or promotion, or the game is drawn.
6. That number is the first that applies of 8 (two Rua), 16 (one Rua), 22 (two Khon), 32 (two Ma), 44 (one Khon)
   and 64, minus the number of pieces on the board (both Khuns included), plus one, and at least one.
7. When no Bia is left, the game is also drawn after 65 moves by each side without a capture or promotion, and it is
   drawn when only the two Khuns are left.
8. These draws wait while the player to move can capture the enemy Khun for certain.

---

## 6. UI layout

- **Board.** 8 × 8 square cells from `standardBoard(8, 8, { shade: () => 'wood' })`: every cell uses the existing
  `wood` shade (fill `#eecb8c`, brown `#7a5a2a` grid line), which is exactly the traditional uncheckered Thai board.
  File labels a–h under the board, rank labels 1–8 on the left; White at the bottom, the board turns 180° for Black
  as usual. No other markings. The highlight shades (selected, part, last, danger) already override `wood`.
- **Pieces.** The rule for players: *a piece that moves like a chess piece looks like one; the two that do not are
  round tokens with a letter.*
  - Khun: cburnett king `{ sprite: 'k' }`; Rua: rook `r`; Ma: knight `n`; Bia: pawn `p`.
  - Met (and promoted Bia): `{ text: 'M', shape: 'circle' }`.
  - Khon: `{ text: 'Kh', shape: 'circle' }` (two letters so that it is never read as "K" for the king; the token
    renderer already scales two-letter text).
  - Tokens use the side colours of `glyphOf` (white disc with dark letters, dark disc with white letters), the
    same as Capablanca's A and C. The chess queen and bishop sprites are deliberately **not** used: they would
    suggest long-range moves.
  - Tooltips and screen readers use the type names ("Met", "Khon", ...).
- **Promotion.** One choice only, so the board plays `=m` directly (the promotion picker opens only for 2+ matches).
- **Count display** (`sideInfo`, section 3; the player row of `handoff/CORE-CHANGES.md` U6, between the name and
  the budget pips). While the bare-Khun count runs, the chaser's row shows `3/5` (moves used / moves allowed) with
  the tooltip "Counting: 3 of 5 moves to capture the lone Khun"; the lone side's row shows nothing. The first number
  never exceeds the second: a count that is already used up when it starts (M-7) shows `5/5`. Otherwise, with no Bia
  left and from move 50 on (`quiet ≥ 100`), both rows show `52/65` with the tooltip "Moves without a capture: 52 of
  65" (at most `65/65`, shown while the draw waits). Nothing is shown once a Khun has been captured. The hook has no
  colour field, so there is no red "last move" marking. These are not the numbers
  a Thai player announces (there the fleeing side counts its own moves, from "pieces + 1" up to the limit, and
  PyChess shows that count on the fleeing side): the app shows the chaser's moves, because its allowance includes
  the move that takes the Khun.
- Ghost parts, the danger ring and the budget pips are generic and need nothing new.

---

## 7. Test cases

Notation: positions list pieces as in `stateOf` placements, White is to move and `quiet = 0` unless stated. Outcome
lists are `key p` in the core's order; R marks a rolled branch. **Every result below was produced by
`handoff/prototypes/makruk/cases.mjs` on the real core** (output saved in `cases.out`), and re-run after the source
review with the corrected counting rules by `handoff/tmp/rev1-makruk/cases2.mjs` (output `cases2.out`; T6c, T6d,
T7 and T9 are the review's versions). A hand-made count state must have the parity of a real game: after a capture
by the chaser, `quiet` is even when the lone side is to move and odd when the chaser is to move. The engine review
turned every case (and its new ones: T4b, T8b, T9e, T10, Q7, Q8) into assertions, `handoff/tmp/critic-makruk/
cases3.tmpl`, and they pass on the committed core, on the plan's prototype core with Q4, Q8 and Q14, and on the core
being changed (section 8.2). The second engine review's new cases (T4c, T6e, Q9, Q10 and two T10 checks) are
assertions in `handoff/tmp/critic-makruk/r2/new4.mjs`; they and the 85 earlier checks (`r2/cases3-p4.mjs`) pass on
the working-tree core of 2026-09-25 17:50 with the module `r2/proto4.tmpl`.

In `tests/js/variants/*.spec.js`: `stateOf(V, worlds, turn, edit)` of `tests/js/variants/helpers.js` has no `quiet`
argument (set it on the result: `{ ...stateOf(V, worlds, 1, () => {}), quiet: 129 }`), and without an `edit`
function it gives every world the orthodox `x` (`{ ep: -1, epVictim: -1, castle: [] }`). Pass a no-op `edit`
(`() => {}`) so that the worlds keep `x = {}` as in a real makruk game (the results are the same either way). One
piece id per placement, in the order written: the parts of one ghost must be written at the same position in every
world's placement (as in every quantum case below). A piece that is already captured in one world only (Q9) keeps
its id there with no square: build that world from the full placement with `worldFrom` and then call
`placePiece(b, id, OFF)` for the piece (both from `src/variants/core/world.js`).

**T1. Start position and move generation.**
- `newGame`: exactly the 32 pieces of 2.3 (`Kd1 Me1 Nb1 Ng1 Ra1 Rh1 Sc1 Sf1 Pa3…Ph3`, `ke8 md8 nb8 ng8 ra8 rh8
  sc8 sf8 pa6…ph6`).
- 23 ordinary moves: `a1-a2 a3-a4 b1-d2 b3-b4 c1-b2 c1-c2 c1-d2 c3-c4 d1-c2 d1-d2 d1-e2 d3-d4 e1-d2 e1-f2 e3-e4
  f1-e2 f1-f2 f1-g2 f3-f4 g1-e2 g3-g4 h1-h2 h3-h4`.
- With splits, 30 legal moves: the 7 splits are `c1-b2|c2 c1-b2|d2 c1-c2|d2 e1-d2|f2 f1-e2|f2 f1-e2|g2 f1-f2|g2`.
- Legal perft (moves that leave the own Khun attacked removed) = Fairy-Stockfish: 23, 529, 12012, 273026, 6223994
  (`perft.mjs 5`). Nine more positions (promotions and capture-promotions of both sides, Khon and Met endgames, the
  position `8/6ks/3M~2r1/2K1M3/8/3R4/8/8 w` from FSF's own tests) agree to depth 4 or 5 (`perftfen.mjs`), e.g.
  `3k4/8/8/8/5n2/p7/1P6/4K3 b`: 15, 89, 1251, 8290, 115499. (A tenth, illegal FEN with the side not to move in
  check differed, as expected: the core has no check.)

**T2. Khon and Met.**
- `{ a1: '0:k', h8: '1:k', e4: '0:s' }`: Khon moves `e4-d3 e4-d5 e4-e5 e4-f3 e4-f5` (no e3, d4, f4).
- `{ a1: '0:k', h8: '1:k', e5: '1:s' }`, Black to move: `e5-d4 e5-d6 e5-e4 e5-f4 e5-f6` (forward is down).
- `{ a1: '0:k', h8: '1:k', d4: '0:m' }`: `d4-c3 d4-c5 d4-e3 d4-e5`.
- `{ a1: '0:k', h8: '1:k', e4: '0:s', e5: '1:n', d5: '1:r', e3: '1:r', d4: '1:n' }`: still `e4-d3 e4-d5 e4-e5 e4-f3
  e4-f5` (captures e5 and d5, cannot take e3 or d4).

**T3. Bia: no double step, forced promotion to Met.**
- `{ a1: '0:k', h8: '1:k', e3: '0:p', c5: '0:p', b6: '1:n', d6: '1:n' }`: the e3 Bia has only `e3-e4`; the c5 Bia
  has `c5-b6=m c5-c6=m c5-d6=m` and no unpromoted `c5-c6`.
- After `c5-c6=m`: a White Met on c6 (`1.0000 Ka1 Mc6 Pe3 kh8 nb6 nd6`); after `h8-g8` it moves `c6-b5 c6-b7 c6-d5
  c6-d7`.
- `{ a1: '0:k', h8: '1:k', d4: '1:p', e3: '0:n' }`, Black to move: the d4 Bia has `d4-d3=m d4-e3=m`.
- `{ a1: '0:k', h8: '1:k', b5: '0:p', b6: '1:s' }`: the b5 Bia has no move.

**T4. Stalemate is a draw; checkmate is not.**
- `{ f7: '0:k', f5: '0:m', h8: '1:k' }`, play `f5-g6`: `result = { winner: null, reason: 'stalemate' }` (h8 is not
  attacked; g8, g7 are covered by the Khun, h7 by the Met).
- Same position, `f5-e6` instead: the game goes on (h7 is free).
- `{ f7: '0:k', a1: '0:r', h8: '1:k' }`, play `a1-h1` (mate): `result = null`, Black's moves are `h8-g8 h8-h7
  h8-g7`, `royalDanger` = 1; after `h8-g8`, `f7-g8` gives `{ winner: 0, reason: 'king' }`.
- In T6, `c4-g4` as White's 4th counted move stalemates the lone Khun on h8 (Rb7 + Rg4): `stalemate`.

**T4b. Stalemate with a pinned piece (review).** Every move of a piece other than the Khun must be tested too.
- `{ d7: '0:k', a1: '0:r', a8: '1:k', a7: '1:m' }`, `d7-c7`: `{ winner: null, reason: 'stalemate' }` (the Met's
  moves a7-b6 and a7-b8 open the a-file to the Rua; b8 and b7 are covered by the Khun on c7; a8 is not attacked).
- The same with the Rua on b1 instead of a1: `result = null`; Black's moves are `a7-b6 a7-b8 a8-b7 a8-b8` (sorted).

**T4c. No legal move: a loss when attacked, a stalemate when not (second engine review; hand-made).** Black to move.
White's Khun on a1 is boxed in by its own Rua a2 and Bias b1 and b2; the Bia a3 is blocked by the Met on a4, the
Bia b1 by the Bia b2, and Black's move to b3 blocks the Bia b2 (no White Bia has anything to capture).
- `{ a1: '0:k', a2: '0:r', a3: '0:p', b1: '0:p', b2: '0:p', a4: '1:m', c5: '1:n', h8: '1:k' }`, `c5-b3` (the Ma
  blocks b2 and attacks a1): `{ winner: 1, reason: 'noMoves' }`; in the only world `generate(V, b, 0)` is empty and
  `attacks(V, b, 1, a1)` is true. White has no move in its only possibility and its Khun is attacked: a checkmate
  (`noMoves`, section 2.6).
- The same with a Black Met on c4 instead of the Ma on c5, `c4-b3` (b2 blocked, a1 not attacked): `{ winner: null,
  reason: 'stalemate' }`, `generate(V, b, 0)` empty (the stalemate test of `worldResult` runs before `noMoves`).

**T5. Only the two Khuns.**
- `{ d4: '0:k', e5: '1:m', h8: '1:k' }`, `d4-e5`: `{ winner: null, reason: 'bareKings' }`.
- `{ d4: '0:k', e5: '1:m', f6: '1:k' }`, `d4-e5`: `result = null` (the Khuns touch), Black has `f6-e5`, which gives
  `{ winner: 1, reason: 'king' }`.

**T6. Bare-Khun count, K+R+R vs K (limit 8, 4 pieces, allowance 5).**
- `{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k', b7: '1:n' }`, `quiet = 30`, play `b2-b7`: `result = null`,
  `quiet = 0`, `countInfo = { lone: 1, chaser: 0, allow: 5, done: 0, limit: 8, pieces: 4 }`.
- Then `h8-g8 c3-c4 g8-h8 c4-c5 h8-g8 c5-c4 g8-h8 c4-c5 h8-g8`: `done` goes 0,1,1,2,2,3,3,4,4, no result.
- The chaser's 5th move `c5-c4` (quiet 10): `{ winner: null, reason: 'count' }`.

**T6b. Mate on move 4, capture on move 5 (as in Fairy-Stockfish).** From the position after `b2-b7`: `h8-g8 c3-c4
g8-h8 c4-c5 h8-g8 c5-c4 g8-h8 c4-c8 h8-h7` (`Rc4-c8` is mate; FSF: `mate 0` at count 16/16). Now `done = 4`,
`quiet = 9`. `b7-h7` (5th move, captures) → `{ winner: 0, reason: 'king' }`; `c8-c7` instead → `count` draw.

**T6c. The count waits while the Khuns touch.** `{ f6: '0:k', a1: '0:r', b1: '0:r', h8: '1:k' }`, `quiet = 9`
(White to move after the lone Khun's 5th move: `done 4`, `allow 5`). `f6-f7` → `count` draw. `f6-g7` → `result =
null` (Black can take g7 for certain); then `h8-g7` → `{ winner: 1, reason: 'king' }`.

**T6d. The lone Khun takes the last Bia: the chaser moves first (as in Fairy-Stockfish, count `16 7`).**
`{ a1: '0:k', b2: '0:r', c3: '0:r', g5: '0:p', h6: '1:k' }`, Black to move, `quiet = 40`. `h6-g5`: `result = null`,
`quiet = 0`, `countInfo = { lone: 1, chaser: 0, allow: 5, done: 0, limit: 8, pieces: 4 }`, White to move.
- Then `b2-b3 g5-h6 b3-b2 h6-h7 b2-b1 h7-h8 b1-b7 h8-g8 c3-c8 g8-h8`: `done` goes 0,0,1,1,2,2,3,3,4,4, no result
  (`c3-c8`, White's 5th move, is mate; FSF: `mate 1` in the position before it, count 15 of 16).
- White's 6th move `c8-h8` (captures) → `{ winner: 0, reason: 'king' }`; `c8-c7` instead → `count` draw.

**T6e. The last Bia's promotion starts the count (second engine review).** `{ a1: '0:k', b1: '0:r', c5: '0:p', h8:
'1:k' }`, `quiet = 40`, `c5-c6=m`: `result = null`, `quiet = 0`, `countInfo = { lone: 1, chaser: 0, allow: 13, done:
0, limit: 16, pieces: 4 }` (the promoted Bia is a Met: K+R+M has limit 16; FSF also starts pieces' honour after the
last Bia's promotion, section 8.1).

**T7. More pieces than the limit: the chaser still gets one move.**
- `{ a1: '0:k', b1: '0:r', c1: '0:r', d1: '0:n', e1: '0:n', f1: '0:s', g1: '0:s', h1: '0:m', h8: '1:k', h2: '1:m' }`,
  `g1-h2` (9 pieces, limit 8): no result, `countInfo = { allow: 1, done: 0, limit: 8, pieces: 9 }`; then `h8-g8`:
  no result; then `d1-c3` → `{ winner: null, reason: 'count' }`.
- The capture that starts the count checkmates: `{ e2: '0:k', b1: '0:r', c1: '0:s', d1: '0:m', f1: '0:s', g1: '0:n',
  h1: '0:r', c6: '0:n', a8: '1:k', h8: '1:n' }`, `h1-h8` (9 pieces; FSF `mate 0`): no result, `allow 1`, Black's
  moves `a8-b8 a8-a7 a8-b7` are all attacked; after `a8-b7`, `b1-b7` → `{ winner: 0, reason: 'king' }` (`g1-f3`
  instead → `count` draw).
- Without the g1 Khon and h1 Met, `f1-g2` capturing a Met on g2 (7 pieces): no result, allowance 2.

**T8. Limits table.** `countInfo` with Black to move on `{ a1: '0:k', <White pieces>, h8: '1:k' }`, the White
pieces on b2, c2, d2 in the order written (K+S+N+N: `b2: '0:s', c2: '0:n', d2: '0:n'`), gives the allowance column
of 2.7: K+R 14, K+S+S 19, K+N+N 29, K+S+N+N 28 (limit 32, not 44), K+S+M 41, K+N+M+M 60, K+M 62. `{ a1: '0:k', b2:
'0:r', c4: '0:p', h8: '1:k' }`: `null` (no count while a Bia is on the board). First match and Wikipedia's own
example (second source review; the White pieces on b2, c2, d2, e2 in the order written): K+R+R+N 4 (limit 8, 5
pieces: Wikipedia's "three moves to checkmate", plus the capture), K+R+S+S 12 (limit 16, not 22), K+S+S+N+N 17
(limit 22, not 32), K+S+N 41 (limit 44). Fairy-Stockfish gives the same limits and 3, 11, 16 and 40 moves to mate.

**T8b. The most generous allowance (review; hand-made).** Black to move, worlds `{ a1: '0:k', b2: '0:r', c3: '0:r',
h8: '1:k' }` and `{ a1: '0:k', b2: '0:r', c3: '0:n', h8: '1:k' }`, 50/50 (the chaser's material differs between
the possibilities): `countInfo = { lone: 1, chaser: 0, allow: 13, done: 0, limit: 16, pieces: 4 }` (K+R+N gives 13,
K+R+R only 5).

**T9. 64-move rule (only without Bias, 130 plies, waits for a certain Khun capture).**
- With a Bia: `{ a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n', c3: '0:p' }`, `quiet = 300`, `b2-b3`: no result (no
  move-count draw while a Bia is on the board; only the 600-ply limit).
- `{ a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n' }`, `quiet = 129`, `b2-b3`: `{ winner: null, reason: 'quiet' }`,
  `quiet = 130` (reason text "65 moves by each side since the last capture or promotion, with no Bia left"). With
  `quiet = 128`: no result.
- The wait: `{ f7: '0:k', a1: '0:r', h8: '1:k', a8: '1:n' }`, `quiet = 128`, `a1-h1` (mate on ply 129): no result;
  `a8-b6` → `quiet = 130`, no result (White can take h8 for certain); `h1-h8` → `{ winner: 0, reason: 'king' }`.
  The same with `quiet = 129`: `a1-h1` gives `quiet = 130` with Black to move, who cannot take a Khun: `quiet` draw
  (in Fairy-Stockfish that position is already drawn one ply earlier).
- Black to move, `quiet = 129`, worlds `{ f7: '0:k', h1: '0:r', h8: '1:k', a8: '1:n' }` plus a White Ma 50% on c3 /
  50% on e3: `a8-b6` → no result (`h1-h8` captures in both worlds). The same with the Rua 50% on h1 / 50% on g1 and
  no Ma: `a8-b6` → `quiet` draw (the capture is possible in one world only).

**T9e. The draw waits for a converging capture (review, quantum).** Black to move, `quiet = 129`, worlds `{ f7:
'0:k', h8: '1:k', a5: '1:n', h1: '0:r' }` and `{ f7: '0:k', h8: '1:k', a5: '1:n', a8: '0:r' }`, 50/50 (one White
Rua, 50% h1 / 50% a8).
- `a5-b3`: `result = null`, `quiet = 130`; White's merges are `h1|a8-a1 h1|a8-h8`.
- `outcomes('h1|a8-h8')` = one outcome `capture`, p 1, not rolled; playing it gives `{ winner: 0, reason: 'king' }`.
- The single parts are not certain: `h1-h8` and `a8-h8` are each `miss 0.5 R, capture 0.5 R`.
- With a `canTakeKhun` that tests only move keys (the source review's version), `a5-b3` is a `quiet` draw: the
  test that shows the converging capture is counted.

**T10. The count display (`sideInfo`, review).**
- T6 after `b2-b7`: `sideInfo(s, 0)` has `text` `'0/5'`, `sideInfo(s, 1)` is `null`; after the next 9 plies of T6
  (`… h8-g8`, `done` 4): `'4/5'`.
- `{ a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n' }` (no count: Black has a Ma): with `quiet = 129` both sides have
  `text` `'64/65'`; with `quiet = 100` `'50/65'`; with `quiet = 99` `null`.
- Capped (second engine review): in Q9's waiting state (White to move, `done` 20, `allow` 5) White's row has `text`
  `'5/5'` and `title` "Counting: 5 of 5 moves to capture the lone Khun", Black's row `null`. In T9's wait (`quiet =
  130`, no result) White's row has `'65/65'`.
- No count after a Khun capture (second engine review): T6c's `f6-g7`, `h8-g7` ends with `{ winner: 1, reason:
  'king' }`, and `sideInfo` is `null` for both sides (without the Khun test in `countInfo`, White's row showed
  `'0/6'`).

**Q1. Promotion push onto a possible ghost (quantum).** Worlds `{ a1: '0:k', h8: '1:k', c5: '0:p', c6: '1:n' }` and
`{ …, c5: '0:p', a5: '1:n' }`, 50/50. `c5-c6=m`: `miss 0.5 R, move 0.5 R`.
- Missed: `Ka1 Pc5 kh8 nc6` (still a Bia; the Ma is found on c6).
- Moved: `Ka1 Mc6 kh8 na5` (promoted; the Ma is on a5).
- The capture-promotion `c5-b6=m` onto a Ma 50% on b6 / 50% on a4: `miss 0.5 R, capture 0.5 R`.

**Q2. Splits (quantum).** `{ a1: '0:k', h8: '1:k', d4: '0:m', f5: '0:s', b3: '0:p' }`:
- Met d4: 6 splits `d4-c3|e3 d4-c3|c5 d4-c3|e5 d4-e3|c5 d4-e3|e5 d4-c5|e5`.
- Khon f5: 10 splits over e4, g4, e6, f6, g6 (e.g. `f5-f6|g6`, which gives `Sg6` / `Sf6` at 0.5 each, White budget
  2). No split to f4.
- Bia b3 and Khun a1: 0 splits.
- A promoted Bia splits: `{ a1: '0:k', h8: '1:k', c5: '0:p' }`, `c5-c6=m`, `h8-g8`, `c6-b7|d7`: `Md7` / `Mb7` at
  0.5 each.

**Q3. Stalemate in one possibility: game-end roll (quantum).** Worlds `{ f7: '0:k', f5: '0:m', h8: '1:k' }` and
`{ f7: '0:k', e4: '0:m', h8: '1:k' }`, 50/50. `f5-g6` (the move itself is not measured: the target is empty and
the Met is not solid): `move[end:{"winner":null,"reason":"stalemate"}] 0.5 R`, `miss[end:null] 0.5 R`. The second
label is `miss` because of core change Q4 (`handoff/CORE-CHANGES.md`), which is in the working-tree core: that part
holds only the world where the Met was not on f5. The committed core (before Q4) labels both parts `move`.
- First: `{ winner: null, reason: 'stalemate' }`, `Kf7 Mg6 kh8`.
- Second: the game goes on, `Kf7 Me4 kh8` (the Met part on f5 was not real; h7 is free).

**Q4. The count waits for a ghost (quantum).** Worlds `{ a1: '0:k', b1: '0:r', c1: '0:r', h8: '1:k', b6: '1:m' }`
and `{ …, f6: '1:m' }`, 50/50, `quiet = 20`. `countInfo = null` (Black's Met is somewhere). `b1-b6`: `move 0.5 R,
capture 0.5 R`.
- Moved: `quiet = 21`, no count, `Ka1 Rb6 Rc1 kh8 mf6`.
- Captured: `quiet = 0`, count `{ allow: 5, done: 0, limit: 8, pieces: 4 }`.

**Q5. Khun takes the last enemy piece, a ghost part (quantum).** Worlds `{ d4: '0:k', e5: '1:s', h8: '1:k' }` and
`{ d4: '0:k', g5: '1:s', h8: '1:k' }`, 50/50. `d4-e5`: `move 0.5 R, capture 0.5 R`. Moved: the game goes on (`Ke5
kh8 sg5`). Captured: `{ winner: null, reason: 'bareKings' }`.

**Q6. Danger from a ghost Ma (quantum).** Worlds `{ a1: '0:k', e6: '0:n', f8: '1:k' }` / `{ …, c6: '0:n' }`, Black
to move: `royalDanger(Black) = 0.5`. With the Black Khun on g7 instead and White to move, `e6-g7`: `miss 0.5 R,
capture 0.5 R`.

**Q7. Stalemate through a pin by a ghost (review, quantum).** Worlds `{ d7: '0:k', a1: '0:r', a8: '1:k', a7: '1:m' }`
and `{ d7: '0:k', b1: '0:r', a8: '1:k', a7: '1:m' }`, 50/50 (one White Rua, 50% a1 / 50% b1). `d7-c7` (a certain
Khun step): `move[end:{"winner":null,"reason":"stalemate"}] 0.5 R`, `move[end:null] 0.5 R` (both labels `move`
before and after Q4: the Khun moved in both worlds).
- First: `{ winner: null, reason: 'stalemate' }`, `Kc7 Ra1 ka8 ma7` (the Rua was on a1 and pins the Met, T4b).
- Second: the game goes on, `Kc7 Rb1 ka8 ma7`.

**Q8. Every chaser turn counts, a split and a measure too (review, quantum).** From T6's `{ a1: '0:k', b2: '0:r',
c3: '0:r', h8: '1:k', b7: '1:n' }`, `quiet = 30`: `b2-b7 h8-g8 c3-c4|c5` → `done 1`, White budget 2, no result;
then `g8-h8`, `?c4` (outcome 0, the Rua is on c4) → `done 2`, one world, no result.

**Q9. The lone side becomes bare through a roll that captures nothing (second engine review, quantum; hand-made).**
Black to move, `quiet = 40`, two worlds 50/50: A = `{ a1: '0:k', b2: '0:r', c1: '0:r', h8: '1:k', a3: '1:m' }`, B =
the same with the Met already captured (off the board, same ids; see the note above T1). `countInfo = null` (Black
has its Met in A). `a3-b2`: `miss 0.5 R, capture 0.5 R`.
- Missed (only B is left): `{ winner: null, reason: 'count' }` at once, `quiet = 41`, White to move, `Ka1 Rb2 Rc1
  kh8`. The count runs from the last capture (M-7): `done` 20, `allow` 5.
- Captured (only A): `result = null`, `quiet = 0`, `countInfo = null`, `Ka1 Rc1 kh8 mb2`.
- The wait with the chaser to move (M-10): the same with the second White Rua on h1 instead of c1. Missed: `result =
  null`, `quiet = 41` (White can take h8 for certain); then `h1-h8` → `{ winner: 0, reason: 'king' }`, while `h1-g1`
  → `{ winner: null, reason: 'count' }`.

**Q10. A split that stalemates in one possibility (second engine review, quantum).** `{ f7: '0:k', f5: '0:m', h8:
'1:k' }`, `f5-e6|g6` (a split never rolls, but the game-end roll still applies): `split[end:null] 0.5 R`,
`split[end:{"winner":null,"reason":"stalemate"}] 0.5 R`.
- First: the game goes on with the Met certainly on e6 (`Kf7 Me6 kh8`, White budget 1).
- Second: `{ winner: null, reason: 'stalemate' }`, `Kf7 Mg6 kh8` (T4).

**Random games** (`fuzz.mjs`, `fuzzend.mjs`), every 3rd or 4th ply a split: 60 games from the start (30 random,
30 that take certain Khun captures and avoid certain losses; 9686 plies) and 500 games from five endgame positions
(55206 plies, 6.9 s). No exception, weights always sum to T, budget ≤ 8, solid pieces identical in every world, no
legal move after a result. Endgame results: 297 Khun captures, 122 64-move draws, 53 count draws, 22 bare-Khun
draws, 6 unfinished after 300 plies. Re-run with the corrected counting rules (`handoff/tmp/rev1-makruk/fuzz2.mjs`,
`fuzzend2.mjs 100 300`): 40 games from the start (6986 plies) and 500 endgame games (55947 plies, 7.1 s), no
exception or broken invariant; endgame results 307 Khun captures, 111 64-move draws, 53 count draws, 23 bare-Khun
draws, 6 unfinished. Engine review (`handoff/tmp/critic-makruk/fuzz3.tmpl`, 60 games from each of nine starts: the
start position, the five endgames above, two endgames with `quiet` at 110 and 116 and K+R vs K; `sideInfo` called
and the count checked after every ply): committed core 51540 plies, work-in-progress core 51088 plies, no exception
or broken invariant on either. Second engine review (`r2/fuzz4-wt.mjs`, the same games with `proto4` on the
working-tree core of 17:50): 51088 plies, the same results (214 Khun captures, 174 64-move draws, 98 count draws,
26 bare-Khun draws, 1 stalemate, 27 unfinished), no exception or broken invariant.

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 (lens: rules fidelity), 2026-09-25. Every classical rule was checked against the sources below (fetched
on that day) and the Fairy-Stockfish source and binary; the changed cases were re-run on the real core
(`handoff/tmp/rev1-makruk/`: `proto2.mjs` = the prototype with the corrected counting, `cases2.mjs` / `cases2.out`,
`fuzz2.mjs`, `fuzzend2.mjs`).

Sources: Wikipedia https://en.wikipedia.org/wiki/Makruk (wikitext, "Rules" and "Counting rules"); PyChess
https://www.pychess.org/variants/makruk (= `handoff/ext/pychess-variants/static/docs/makruk.md`); gameindy
https://makruk.gameindy.com/manual/what-is-the-difference-between-counting-sak-kradan-and-sak-mak (Thai text read
directly); XBoard https://www.gnu.org/software/xboard/whats_new/rules/Makruk.html (via
http://web.archive.org/web/20230605003549/https://www.gnu.org/software/xboard/whats_new/rules/Makruk.html);
Fairy-Stockfish `handoff/ext/Fairy-Stockfish` (commit 9f778da) `src/variant.cpp` `makruk_variant()`,
`src/position.cpp` `count_limit()`, `do_move()` counting block and `is_optional_game_end()`, `src/position.h`
`counting_ply()`, `src/variant.h` defaults (https://github.com/fairy-stockfish/Fairy-Stockfish).

**Changes:**

1. **64-move rule only without Bias** (sections 1, 2.6, 3, 4 M-9, 5, 7 T9). The spec drew any position after 64
   moves without a capture or Bia move, also with Bias on the board. Thai Makruk has no move-count draw while an
   unpromoted Bia is on the board (Wikipedia: "When neither side has any cowries, the game must be completed within
   a certain number of moves"; PyChess and gameindy: board's honour needs "no unpromoted pawns"), and
   Fairy-Stockfish has `nMoveRule = 0` and `count_limit()` returns 0 while any pawn exists. The old rule drew games
   that Makruk continues, so the claim "only gives the stronger side more time" was false. Now: `quietPlies` off,
   the rule is in `stateResult` and needs no Bia on the board.
2. **130 plies instead of 128, and the draw waits** (sections 1, 2.6, 3, 5, 7 T9). Thai board's honour (gameindy):
   the fleeing side counts 64 of its moves, "then the chaser has one more move", and must mate with it;
   Fairy-Stockfish: draw once the count exceeds 128 plies unless the side to move is mated. In capture-the-king the
   mate is followed by the capture, so 128 plies cut off the chaser's last move. 130 plies plus "the draw waits
   while the player to move can capture the enemy Khun for certain" gives the Fairy-Stockfish result for both ply
   parities (checked in T9).
3. **The wait rule is general** (sections 1, 2.6, 3 `canTakeKhun`, 4 M-10, 5). It was limited to touching Khuns
   and did not apply to the 64-move rule. The classic game's rule (`docs/rules.md` section 6, "The first three
   draws wait if the player to move can capture the enemy king for certain") is now applied to the bare-Khuns,
   count and 64-move draws; for the count and the bare Khuns it gives the same results as before (T5, T6c).
4. **Count after a capture by the lone Khun** (sections 1, 2.7, 3 `countInfo`, 4 M-7, 5, 7 T6d). When the lone Khun
   takes the last Bia, Fairy-Stockfish starts the count at `2 × pieces − 1` (`do_move()`, first counting branch):
   the chaser moves first and has `limit − pieces + 1` moves to mate, one more than after its own capture (FSF run:
   `8/8/7k/6P1/8/2R5/1R6/K7 b`, `h6g5`, counting `16 7`, `mate 1` at count 15). gameindy agrees: the count starts
   when its conditions hold and the fleeing side's next move is "pieces + 1". The old `done` formula counted the
   chaser's first move and drew T6d at the mate. `done` now counts the chaser's replies to the lone side's moves;
   after a capture by the chaser nothing changes (T6, T6b re-run identical).
5. **More pieces than the limit** (sections 1, 2.7, 3, 5, 7 T7). The spec drew at once. Fairy-Stockfish never
   declares a counting draw against a checkmated player (`is_optional_game_end()`:
   `!checkers() || MoveList<LEGAL>.size()`; FSF run `k6n/8/2N5/8/8/8/4K3/1RSM1SNR w`, `h1h8`: 9 pieces, limit 8,
   `mate 0`), and a mate ends the game before any Thai count. The allowance is now `max(1, limit − pieces + 1)`:
   the chaser's next move must take the Khun. The gameindy quote was also corrected: the Thai text says "pieces on
   the board + 1" exceeding the limit, not "pieces exceed the limit".
6. **T6c parity** (section 7). A hand-made count state with the chaser to move needs an odd `quiet` after a chaser
   capture; `quiet = 8` now means "after a capture by the lone Khun". Changed to `quiet = 9`, same results.
7. **Section 1 completed.** Fairy-Stockfish row: board's honour starts automatically, is not restarted by captures;
   the `2 × pieces − 1` start; the mate exception; threefold repetition (`nFoldRule = 3`). Wikipedia row: its
   counting example ("three moves to checkmate (the given value of 8 minus the total number of pieces, 5)") and
   "the count does not automatically restart". New "sources disagree" items: capture of the last Bia by the lone
   Khun, more pieces than the limit, repetition (the app has none: `handoff/CORE-CHANGES.md` item 60). The XBoard
   page answers 403/429 and was read through the Web Archive; it confirms setup, Betza codes, promotion and the
   stalemate draw.
8. **Deviation list rewritten** (section 1 justification). Accurate list: captures restart board's honour; a capture
   by the lone Khun restarts the pieces' count; two moves instead of none after a lone capture with more pieces
   than the limit; and, new, a checkmate (capture) by the counting side wins, where Wikipedia and PyChess make it a
   draw if the count was not stopped (automatic counting cannot be stopped; Fairy-Stockfish does the same).
9. **Player-facing text** (section 5). "the Bia start on the third rank" was wrong for Black: now "each side's third
   rank"; the Met's place beside the Khun added; castling and en passant folded into lines 1 and 3 to make room
   for the corrected counting lines and the wait rule (still 8 sentences). Reason text for `quiet` and the count
   display follow the 65-move rule.
10. **Section 3.1 item 3** (Missed Bia moves reset `quiet`) no longer affects makruk: its counting rules only run
    without Bias. The old T9 Missed bullet was dropped.

**Checked and unchanged:** 8 × 8 uncheckered board and square names; setup of every square (Wikipedia diagram
`bd hd nd sd ld nd hd bd` / `bl hl nl ll sl nl hl bl`, "Seeds are placed at the right side of lords"; XBoard "d1, e8:
King / e1, d8: Met"; FSF `rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w`); every piece's move (Wikipedia, XBoard
Betza K, F, R, FfW, N, mfWcfF, FSF); no double step, no en passant, no castling; promotion on the sixth rank, forced,
to Met only (FSF promotion region ranks 6–8 / 3–1); White first; stalemate a draw (Wikipedia "like in Western chess
and unlike shatranj", PyChess, XBoard, FSF default); the limit table and FSF's 32 for K+S+N+N (PyChess "the minimum
number among these conditions"); the "limit − pieces" mating moves after a chaser capture (Wikipedia's example,
gameindy's example "starts counting at 7 … when the fleeing side counts 8 the chaser makes the closing move").
Perft 1–5 from the start re-checked with the FSF binary (23, 529, 12012, 273026, 6223994). T1–T5, T6, T6b, T8 and
Q1–Q6 were re-run on the corrected module with identical results.

#### Second source review

Reviewer 1 (lens: rules fidelity), second pass, 2026-09-25, after the engine review. Every classical rule of
sections 1, 2, 5 and 7 was checked again against pages fetched that day and against the Fairy-Stockfish source and
binary. Scratch files are in `handoff/tmp/rules2-makruk/`:

- `fsfd.sh "<fen>" "<moves>" "<uci command>"` prints FSF's FEN (with the counting fields) and the command's output.
- `perft.mjs <depth> [fen]` is the app's legal perft with the engine review's module (`proto3-now.mjs`) on
  `core-now/`, a copy of the working-tree core taken at 17:30.
- `cases3-now.mjs` runs the engine review's 85 checks on that copy (85 of 85 pass; Q3's second label is `miss`).
- `t8extra.mjs` runs the new T8 rows.
- The fetched pages are saved as `*.txt` / `*.html` in the same folder.

New sources:

- gameindy draw rules: https://makruk.gameindy.com/manual/what-are-the-rules-for-drawing-in-thai-chess
- gameindy basics: https://makruk.gameindy.com/manual/lets-get-to-know-basics-of-playing-thai-chess
- Thai competition rules 2018, appendix C:
  http://web.archive.org/web/20180817205956/http://bgsthai.com/2018/05/07/lawofthaichessc/ (the page is cited by
  Fairy-Stockfish `src/apiutil.h` for Thai notation)
- makrukthai.blogspot.com: https://makrukthai.blogspot.com/2014/08/blog-post_2.html
- playmakruk.com: https://playmakruk.com/rules.html
- chessvariants.com through the Web Archive:
  https://web.archive.org/web/20240227073114/https://www.chessvariants.com/oriental.dir/thai.html

Wikipedia (wikitext, https://en.wikipedia.org/w/index.php?title=Makruk&action=raw), the PyChess guide, the gameindy
counting page and XBoard (Web Archive) were fetched again.

**Changes:**

1. **Repetition** (section 1 "sources disagree", 2.6). The spec said the Thai sources do not mention repetition.
   They do. The 2018 competition rules, as quoted by gameindy, draw a game when both players repeat the same position
   three times ("รุกล้อ" / "เดินล้อ"), and so does playmakruk.com. Source:
   https://makruk.gameindy.com/manual/what-are-the-rules-for-drawing-in-thai-chess. The app still has no repetition
   draw (`handoff/CORE-CHANGES.md` item 60). The deviation is now stated with its effect: a game with a Bia that
   repeats runs on to the 600-ply limit.
2. **Only two Khuns left is a classical draw "at once"** (2.6, section 1 table). The rule was already in the spec
   but had no source. The same gameindy page gives it.
3. **gameindy counting row corrected** (section 1 table). "The count continues despite captures" was given for
   sak mak. On the page that sentence ("การนับจะดำเนินต่อไปแม้จะมีการกินหมากขึ้นระหว่างนับ") is in the sak kradan
   section; the page says nothing about captures during sak mak. The row now also has:
   - the sak mak list, read "in order" (ตามลำดับ);
   - the example's phrase "the entry with the fewest moves" (น้อยที่สุด);
   - the two-Rua example (6 pieces: counts 7 and 8, then the chaser's closing move).

   Source: https://makruk.gameindy.com/manual/what-is-the-difference-between-counting-sak-kradan-and-sak-mak.
4. **K+Khon+2 Ma vs K** (section 1 "sources disagree"). Thai sources were added on both sides:
   - For 32: gameindy (its ordered list) and makrukthai.blogspot.com ("choose the count with the smallest limit";
     with a Ma and a Khon, count the Khon).
   - For 44: playmakruk.com ("priority rook, khon, knight") and Wikipedia.

   The choice (32, as in Fairy-Stockfish and PyChess) is unchanged. Sources: the URLs above.
5. **Setup disagreement recorded** (section 1 table and "sources disagree"). chessvariants.com, read through the Web
   Archive, lists "Black: King d8; Queen e8". Every other source puts Black's Khun on e8 and Met on d8: Wikipedia's
   diagram, XBoard, gameindy (ขุนดำ จ8, เม็ดดำ ง8), PyChess and Fairy-Stockfish. The spec's setup is unchanged. Before
   this review the spec had only search extracts of that page.
6. **"More pieces than the limit"** (section 1 "sources disagree" and deviation list).
   - "Both let a capture that checkmates stand" said too much. gameindy says nothing about that case; for
     Fairy-Stockfish it is true (`is_optional_game_end()`).
   - A corner was missing. The lone Khun takes the last Bia and then `pieces = limit`. Fairy-Stockfish starts the
     count at `2 × limit − 1` (`do_move()`); the chaser's free move makes it `2 × limit`, which is not above the
     limit, so the chaser still has one move to mate. gameindy draws at once ("pieces + 1" is above the limit). The
     app gives two moves (mate, then capture), so it follows Fairy-Stockfish. The deviation list now says so.
7. **Thai square names** (2.1). Appendix C of the Thai competition rules names the files ก ข ค ง จ ฉ ช ญ from left
   to right and the ranks ๑–๘ from the bottom, with ก๑ in the lower left corner. gameindy uses the same names for the
   setup (White's Khun ง1, Black's Khun จ8). The app keeps a–h / 1–8, as Fairy-Stockfish, PyChess and Wikipedia do;
   the mapping is now stated.
8. **Board colour** (2.1). gameindy says Thai boards usually have one colour, but some are chequered. This is noted;
   the app's board is unchanged.
9. **Rules sentence 6** (section 5). It listed the limits without saying which one applies when the chaser has
   several kinds of piece. Read literally, K+R+S+S gave 16 or 22, and K+S+N+N gave 32 or 44. It now says "the first
   that applies", which is the rule of 2.7 and Fairy-Stockfish. It also says "(both Khuns included)": Wikipedia has
   "including both lords" and PyChess "including both kings".
10. **Count display note** (section 6). The chaser's `done/allow` is not the number a Thai player announces: the
    fleeing side counts its own moves from "pieces + 1" (gameindy, PyChess). The note says why the app shows the
    chaser's moves instead.
11. **T8 extended** (section 7). New cases: K+R+R+N 4, which is Wikipedia's own example ("three moves to checkmate"
    plus the capture); K+R+S+S 12; K+S+S+N+N 17; K+S+N 41. Fairy-Stockfish gives the same limits (8, 16, 22, 44) and
    3, 11, 16 and 40 moves to mate. The app's results come from `t8extra.mjs`.

**Checked against Fairy-Stockfish and unchanged:**

- **Perft.** 1–5 from the start = 23, 529, 12012, 273026, 6223994, both in the FSF binary and in `perft.mjs 5` on
  the current core. Four more positions agree to depth 4:
  - `3k4/8/8/8/5n2/p7/1P6/4K3 b`: 15, 89, 1251, 8290.
  - `4k3/8/1n1s2r1/P1P1P2P/p1p1p2p/1N1S2R1/8/3K4 w`: 31, 898, 26048, 715480.
  - `rnsmksnr/8/1ppp1ppp/p3p3/3PP3/PPP2PPP/8/RNSKMSNR w`: 23, 576, 13410, 336508.
  - `8/2k5/1s1m4/2P5/5p2/4M1S1/5K2/8 b`: 16, 224, 3456, 50796.
- **Move lists.** T1's 23 first moves are FSF's divide list. The move lists of T2 and T3 equal FSF's `go perft 1`
  on the same positions, leaving out the Khun moves.
- **T4 and T4b.**
  - After `f5g6` FSF has no move and gives `cp 0` (stalemate).
  - After `f5e6` Black's only move is `h8h7`.
  - After `a1h1` FSF gives `mate 0`.
  - T4b's `d7c7` is a stalemate. With the Rua on b1, Black's legal moves are `a7b6 a7b8`.
- **Counting cases.**
  - T6: FSF's counting fields are `16 8` after `b2b7`, so the lone Khun's 5th move takes the count to 17 > 16.
  - T6b: `16 16` and `mate 0` after `c4c8`.
  - T6d: `16 7` after `h6g5`. `c3c8` is then `mate 0` at `16 16`; `c3c7 g8h8` gives count 17 instead.
  - T7: `16 18` and `mate 0` after `h1h8`. After `g1h2` FSF gives `cp 0` (drawn).
  - T8: the limit of every material in 2.7, T8 and the new T8 rows, plus K+N (64) and K+S (44).
  - T9: from `n6k/5K2/8/8/8/8/8/R7 w - 128 128`, `a1h1` is `mate 0` at count 129. At `128 129` with White to move,
    the count is already past the limit.
- **Makruk counting tests in FSF's `test.py`.** The last Bia's promotion against a bare Khun starts pieces' honour
  at `2 × pieces` (`88 8`). A capture that leaves a bare Khun gives `44 8`. The last Bia's promotion with material on
  both sides starts board's honour at `128 0`, and a later move gives `128 1`. All of these agree with section 1.
- **Wording.** Everything else in sections 1, 2 and 5 (setup, moves, promotion, turn order, stalemate, the counting
  quotes) matches the pages as fetched. The type names and reason texts (sections 3 and 5) are correct.

### 8.2 Engine review

Reviewer 2 (lens: engine and quantum consistency), 2026-09-25. Read `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md`, `handoff/CORE-CHANGES.md`, `docs/rules.md` and the core (`quantum.js`, `world.js`,
`orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`), both as committed and as it was being changed, plus the
UI parts the spec relies on (`src/variantplay/texts.js`, `panel.js`, `glyphs.js`, `VariantPiece.vue`,
`VariantBoard.vue`, `useVariantGame.js`). Everything was run in `handoff/tmp/critic-makruk/`:

- `proto3.tmpl`: the module of section 3 as it now stands (source review's `proto2.mjs` plus the changes below).
- `cases3.tmpl`: every case of section 7 as an assertion (85 checks).
- Three core copies: `core-head` (the committed core), `core-plan` (the plan review's prototype of Q1-Q4, Q8 and
  Q14, run with `Q4=1 Q8=1 Q14=1`) and `core-live` (the working-tree core while it was being changed; it already
  had Q1, Q4 and Q8). `proto3-*.mjs`, `cases3-*.mjs` and `fuzz3-*.mjs` are generated from the templates per core.
- Results: 85 of 85 checks pass on all three cores. The only difference between the cores is Q3's second label
  (below).

**Changes:**

1. **The draws also wait for a converging capture** (sections 1, 2.6, 3 `canTakeKhun`, 4 M-10, 5 unchanged, 7
   T9e). `docs/rules.md` section 6 lets the draws wait while the king can be captured "for certain", and section 2.3
   calls a merge onto a solid piece, with no other part and clear paths, a certain capture. The key-only test missed
   it. In T9e a Rua 50% h1 / 50% a8 can merge onto the Khun on h8 for certain (one `capture` outcome, p 1), but the
   64-move rule drew the game. `canTakeKhun` now also accepts a merge onto the Khun whose only outcome is `capture`.
   This is variant code that imports `branches` and `legalMoves` from `core/quantum.js`, not a core change. It
   matters mainly for the 64-move rule: the bare-Khuns draw has no ghost, and the count is normally used up with the
   lone side, which has no ghost, to move. Cost: it runs only when a draw is due. The computer player chose the
   merge in 2-10 ms at every level (`bench3.mjs`).
2. **The count display uses `sideInfo`** (sections 3, 3.1, 6, 7 T10). The plan rejected the proposed `statusText`
   line (item 70) and is building U6 `sideInfo(state, side, viewer) -> { text, title }`, which
   `src/variantplay/panel.js` already reads. The spec now defines the exact hook: `done/allow` in the chaser's row
   while the count runs, and `n/65` in both rows from move 50 of the 64-move rule. The "turns red" line was
   dropped, because the hook has no colour field.
3. **Q3's label after core change Q4** (section 7 Q3). Once Q4 is in, a part made by the game-end roll gets its
   key from its own worlds. The part that holds only the world where the Met was not on f5 is therefore `miss`, not
   `move`. This was verified on `core-plan` and `core-live`; `core-head` still gives `move`. The spec gives both
   values, and the test must use the post-Q4 value. New test Q7 has `move` in both parts on every core.
4. **Section 3: hooks the plan adds** (table rows and the note above the sketch). Makruk must not start from
   `orthodoxSpec()`, which gets `applyMiss` and `unifyWorlds` (W4, W5) and castling and en passant extras. It
   needs no `applyMiss` (its `x` is `{}`), no `unifyWorlds`, no `budgetRule`, no `recordInfo`, no
   `compulsoryCapture` and no `passWhenStuck`. It also declares no `resetsQuiet`: the default resets the counter on
   Bia moves that happen and not on Khun moves. All cases give the same results with Q8 (`core-plan`, `core-live`).
5. **Section 3.1 rewritten.** It now gives the plan's verdicts on the three earlier requests (70 and 71 rejected,
   Q8 planned) and the effect of the other planned changes: Q4 changes one label, and Q7 and Q14 need nothing from
   makruk. Q2, Q5, Q6, Q10 and Q13 do not apply. Q13 cannot apply because a promotion is always settled at once (the
   Bia is solid), so no piece ever has two types.
6. **"Without a capture or promotion"** (sections 1, 2.6, 3 `reasonText`, 5 line 7, 7 T9). Per M-9, the 64-move
   count also restarts at the last Bia's promotion, so "65 moves without a capture" was incomplete. The reason text
   "after the last Bia" was also unclear; it now reads "65 moves by each side since the last capture or promotion,
   with no Bia left".
7. **`noMoves` justification** (section 2.6). "They would capture it next" was not exact: a Khun attacked in every
   possibility need not be capturable for certain by one move. The exact reason is that every possibility is then a
   checkmate (no move, attacked). The section now also explains how this relates to `docs/rules.md`, where "no legal
   move" is a draw: that case is the stalemate of rule 1. It also states the real precondition, "no Measure or
   merge", instead of "no ghost" (see core change 1).
8. **Section 4.**
   - M-5: a ghost that pins a piece makes a stalemate in some possibilities only, and the game-end roll then also
     settles the ghost (Q7).
   - M-7: the count runs from the last capture, even when the lone side becomes bare through a roll that captured
     nothing, so it may already be used up. References to T8b and Q8 were added.
   - M-10: converging captures count. The count's wait means "the Khuns touch", except for a count that is already
     used up when it starts.
9. **Section 7.**
   - Positions made explicit: T2, T3 and T8 left squares or piece types out.
   - Notes on the repository's `stateOf`: it has no `quiet` argument and gives the orthodox `x` unless `edit` is
     passed.
   - New tests for the riskiest rules:
     - T4b: a stalemate that needs the "every move exposes the Khun" test for a piece other than the Khun.
     - T8b: the most generous allowance over possibilities.
     - T9e: the wait for a converging capture.
     - T10: `sideInfo`.
     - Q7: a stalemate through a pin by a ghost, which triggers the game-end roll.
     - Q8: a split and a measure count as chaser turns.
   - Random games: `fuzz3` ran 540 games per core (starts listed in section 7) with no exception or broken invariant.

**Checked and unchanged:**

- **`stateAfter` order.** The per-world `worldResult` is settled by the game-end roll in `settle`. `stateResult`
  then runs on the new state before `quietPlies`, `maxPly` and `noMoves` (also in the core being changed), so the
  counts are state-level and never rolled, and `noMoves` sees only states that no stalemate has ended.
- **Stalemate test.** It runs per world on the side to move with `generate` (cached per world, and reused by the
  next turn's move table) and stops at the first safe move.
- **Count parity.** `countInfo`'s `done` changes only on the lone side's turns: after a chaser capture the lone side
  moves first, after a capture by the lone Khun the chaser's first move is free.
- **Solid pieces.** Bias are solid, so "no Bia on the board" read on world 0 holds for every world. A promotion is
  always settled at once (solid mover, measured), so there is never a half-promoted Bia.
- **Budget and world bound.** Unaffected (fuzz). No makruk rule adds worlds.
- **Layout and pieces.**
  - `rectTopology`'s `shade(f, r)` option gives every cell `wood`.
  - `.qc-vboard__cell--wood` exists, and the highlight classes that follow it override its fill.
  - Two-letter tokens are scaled (`VariantPiece.vue`).
  - A move with one promotion choice is played without the picker (`useVariantGame.js`).
- **Texts.** `texts.js` asks `V.reasonText` first. `rules()` has 8 sentences.

**Observations (no spec change):**

- **The computer rarely wins a counted endgame.** In computer-against-computer games at the normal level from random
  placements, 13 of 16 K+R+R vs K games and 11 of 16 K+R vs K games ended in the count draw (`mopup.mjs`). A mop-up
  `evaluate` term (lone Khun to the edge, Khuns together) changed nothing, because the search is too shallow to find
  the mate. Against the computer, the counts will usually save a bare Khun. This does not change the rules; it is an
  open question for the AI.
- **The plan review's prototype core breaks every split of a variant without `applyMiss`.** In
  `handoff/tmp/plan-review/core/quantum.js` `splitBranches`, `worlds.length = 0; worlds.push(...sworlds)` empties
  the worlds when `idleApply` returns the same array, so `branches` returns `[]` for every split. Makruk is such a
  variant. The core in the working tree does not have this bug. A core test with a variant without `applyMiss`
  (a split gives one `split` branch) would keep it out. `core-plan` in this folder has the one-line fix.

**Core changes needed:**

1. **`legalMoves` must not skip a ghost whose lowest square may hold another piece** (generic bug fix, low
   priority; this spec does not depend on it, but makruk scores `noMoves` as a loss instead of the default draw).
   - Today `legalMoves` takes the piece's lowest location `f0` and skips the whole piece (Measure, merges and
     splits) when `ownPieceAt(state, f0) !== id`, although another part is a valid handle.
   - Checked on the core being changed (`dbg2.mjs`): a Black Met 50% c3 / 50% e3, with a White Ma on c3 in the
     world where the Met is on e3. `legalMoves` offers nothing for the Met, while `branches(V, s, '?e3')` is legal
     (outcomes c3 / e3). `hasLegalMove` uses `legalMoves`, so a side whose only legal turn is such a Measure gets
     `noMoves`.
   - Exact semantics: for each own piece X, `home` = its on-board locations (ascending) with
     `ownPieceAt(state, f) === X`. Skip X only when `home` is empty. When X is superposed, offer the Measure
     `'?' + nameOf(V, home[0])` (unless `mustCapture`) and the merges of `mergesFrom` from every square of `home`.
     With `splits`, offer the splits of `splitsFrom` from every square of `home`.
   - Test: the position above, Black to move. `legalMoves` contains `?e3`, and applying it gives the outcomes `c3`
     and `e3` at 0.5 each.

#### Second engine review

Reviewer 2 (lens: engine and quantum consistency), second pass, 2026-09-25, after the second source review. Read
again `handoff/IMPLEMENTING.md`, `handoff/CONTRACT.md`, `handoff/CORE-CHANGES.md`, `docs/rules.md` and the core in the
working tree (`quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`; last functional
change of `quantum.js` 17:26, only comments changed at 17:50), plus `src/variantplay/panel.js`, `texts.js`,
`glyphs.js`, `VariantBoard.vue` and `src/views/VariantGameView.vue`. Scratch files are in
`handoff/tmp/critic-makruk/r2/`:

- `proto4.tmpl`: the module of section 3 as it now stands (`proto3.tmpl` plus change 1 below); `proto4-wt.mjs` is
  it on the working-tree core.
- `cases3-wt.mjs` (the 85 checks with `proto3`) and `cases3-p4.mjs` (the same with `proto4`): 85 of 85 pass on the
  working-tree core; Q3's second label is `miss` there.
- `new4.mjs`: the 16 new checks (T4c, T6e, Q9, Q10, two T10 bullets): 16 of 16 pass.
- `fuzz4-wt.mjs` / `fuzz4-wt.out`: 540 random games from nine starts, 51088 plies, no exception, weights always sum
  to T, budget ≤ 8, at most 64 worlds, solid pieces identical in every world, no legal move after a result.
- `measure-stalemate.mjs`: a Measure that leaves the opponent stalemated (M-5). `dbg2-wt.mjs`: the core bug below.
- `impl-shim.mjs`, `new-impl.mjs`, `cases3-impl.mjs`: the same checks on the module being written in
  `src/variants/makruk.js` (imported read-only; the version checked, of 17:53, is saved as `impl-snapshot.js.txt`).
  It passes everything except the two
  display checks of change 1, which this review changed the spec for, and T9e's last bullet, which needs the
  prototype's switch.

**Changes:**

1. **The count display could show nonsense** (sections 3 `sideInfo` and `countInfo`, 6, 7 T10). Found on the real
   core:
   - In Q9 (a count that is already used up when it starts, M-7) the chaser's row showed `20/5`, "Counting: 20 of 5
     moves to capture the lone Khun".
   - After T6c's end (the lone Khun takes the chaser's Khun, Black wins) White's row still showed `0/6`: `countInfo`
     counted the chaser's two Rua without its Khun as material.

   Now `sideInfo` shows `min(done, allow)`, and the 64-move counter at most `65/65` (a wait can last more than one
   ply). `countInfo` returns null once a Khun is missing in some world. No result changes: `stateResult` only sees
   states in which every world has both Khuns, because the game-end roll separates worlds where a Khun was taken.
   The 540 random games give the same tally as with `proto3`.
2. **Tests for the riskiest rules** (section 7).
   - T4c: the `noMoves` hook makes "no legal move" a loss, unlike the core default and `docs/rules.md` 6. That was the
     only special rule without a test. A small hand-made position shows the loss when the Khun is attacked, and the
     stalemate (from `worldResult`, which runs first) when it is not. Section 2.6 now points to it.
   - T6e: the count starts after the last Bia's promotion (a Bia move that resets `quiet`, Q8), and the promoted Bia
     counts as a Met for the limit (K+R+M, limit 16).
   - Q9: the M-7 case. The lone side becomes bare through a roll that captured nothing, the count is already used up
     (`done` 20 of 5), and the game is drawn at once. A second position shows the wait with the chaser to move (M-10),
     the only case in which the chaser's certain capture matters for the count. The world with a piece that is
     already captured is built with `placePiece(b, id, OFF)` (note added above T1).
   - Q10: a split whose one half stalemates the opponent. Splits never roll, but the game-end roll applies to every
     turn: `split[end:null] 0.5 R`, `split[end:{…stalemate}] 0.5 R`.
3. **M-5 completed.** The stalemate test follows every turn: a split (Q10), and also a Measure, which moves nothing
   but keeps only some possibilities. In `measure-stalemate.mjs`, White's Met is 50% e6 / 50% g6 and White plays
   `?e6`. The outcome `g6` leaves Black stalemated and is a draw. M-7 and M-10 now cite Q9.
4. **Rules sentence 7 shortened** (section 5). The parenthetical "(the 64 moves of Thai chess to trap the Khun, plus
   one to take it)" explains the number but states no rule; sections 1 and 2.6 keep the reason. The module being
   written already uses the short form.
5. **Status brought up to date** (header, sections 3, 3.1 and 7 Q3). Q1, Q4, Q7, Q8 and Q14 are in the working-tree
   core, and U6 is read by `panel.js` `sideInfoOf` (`V.sideInfo(state, side, viewer)`; the spec's two-argument hook
   ignores `viewer`). Q3's second label is `miss` on that core.

**Checked and unchanged:**

- **Engine mapping (section 3).** Every hook the sketch uses exists with that signature:
  - `worldResult(w, mover)`: `settle` and `stateAfter` pass `state.turn`, so the stalemate test looks at `1 - mover`.
    `ai.js` `mightForce` also passes `state.turn`.
  - `stateResult(next)`: called before `quietPlies`, `maxPly` and `noMoves`, also in light mode.
  - `noMoves(next)` and `reasonText(reason)`: `texts.js` asks the variant first.
  - `quietPlies: Number.POSITIVE_INFINITY`: kept by `defineVariant`.
  - `promote.zone(side, to, from, w)`, `standardBoard(files, ranks, { shade })` and the `text` / `circle` glyphs.

  Importing `branches` and `legalMoves` from `core/quantum.js` into the variant makes no import cycle.
- **`canTakeKhun`.**
  - It runs on the new state before its result is set, so `legalMoves` and `branches` are not blocked, and there is
    no recursion (`branches` never calls `stateAfter`).
  - A merge onto the Khun is always measured (an enemy is on the target), so a single `capture` branch means a
    capture in every world.
  - The core bug below cannot hide a certain converging capture. Such a merge has exactly two parts, and a part
    square that may hold another piece makes the merge itself illegal: `perWorldMerge` checks `ownPieceAt` of both
    squares.
- **Quantum interactions (section 4).**
  - Land = roll / pass = link: only the Rua and ghost parts link (M-2); Bia moves and promotions are rolled (M-4, Q1).
  - The solid roll keeps Bias and Khuns identical in every world, in every state of the random games.
  - Budget and world bound: unchanged, no makruk rule adds worlds.
  - The game-end roll: stalemate per possibility after a move (Q3, Q7), a split (Q10) and a Measure.
  - The counts are state-level (never rolled). Every chaser turn counts (Q8), including a Missed move: in Q9 the
    missed turn adds 1.
- **Q8's effect on makruk.** A missed Bia push no longer resets `quiet`. The counting rules start only when the last
  Bia disappears, which always resets `quiet`, so no count or 64-move result can differ.
- **Layout.** Every cell `wood`, with labels below and to the left. The board turns for Black. Highlights override
  `wood`, and two-letter tokens are scaled.

**Observation (no spec change):** the shared rules (`texts.js` `sharedRules()`) always include "Castling and en
passant are only possible when they are possible in every possibility…". It does not apply to makruk, which has
neither (nor do xiangqi, shogi and others). This is a generic UI matter: the sentence could be shown only for variants
with castling or en passant.

**Core changes needed:**

1. **The same `legalMoves` fix as in the first part** (generic, low priority; this spec does not depend on it). It is
   still present on the working-tree core of 17:50 (`dbg2-wt.mjs`: `legalMoves` offers nothing for the Black Met,
   while `?e3` is legal). The semantics and the test are unchanged; see the first part.

   Its effect on makruk is small. With the bug, `noMoves` can end a game one turn early when the side's only legal
   turn is such a Measure. By then every remaining possibility is a checkmate (no ordinary move, Khun attacked): the
   stalemate test has already rolled away the possibilities where the Khun is not attacked. So makruk's verdict, a
   loss, is the same one turn earlier.
