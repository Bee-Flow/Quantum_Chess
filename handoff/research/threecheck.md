# Variant spec: `threecheck` (Three-check)

Category: `rules`. UI name: "Three-check". Summary line (already in `catalog.js`): "Put the enemy king in check three
times to win."

---

## 1. Sources and chosen rule set

Research note: the original research could not open the rule pages (the proxy blocked them) and worked from
search-engine extracts. The source review (section 8.1) has since read the pages and the lichess source code, and
corrected this file where they differ. Every test case in section 7 was run on a prototype built on the real
`src/variants/core` (`handoff/prototypes/c960/proto.mjs`, `t3c.mjs`; the review's extra cases in
`handoff/tmp/rev1-threecheck/`). The engine review (section 8.2) re-ran all of them, plus T20-T29 and 200 random
quantum games, on a prototype that follows section 3 literally, on the core with the changes of
`handoff/CORE-CHANGES.md` in the tree (`handoff/tmp/critic-threecheck/proto2.mjs`, `tests2.mjs`, `fuzz2.mjs`).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/threeCheck ("Check your opponent 3 times to win the game.") | **The chosen rule set.** "All the Laws of FIDE chess apply. In particular, a move is legal if and only if it would have been legal in FIDE chess." "If you make a legal move that puts your opponent's King into the third check, you win." Checkmate still wins. "A move is considered to give ONE check if the King is threatened, regardless if multiple pieces are giving the check (in the event of a double check)." |
| scalachess (the lichess rules engine), `core/src/main/scala/variant/ThreeCheck.scala`, `History.scala`, `format/FenWriter.scala`, `variant/Variant.scala` (https://github.com/lichess-org/scalachess; clone in `handoff/ext/scalachess`) | After every move, each king that is in check (`board.isCheck`, attackers regardless of pins) adds **one** to its side's counter, however many pieces give the check. The game ends (`specialEnd`) when the side to move is in check and has received 3 checks. Status order: checkmate, then the third check, then stalemate, then the automatic draws. Automatic draws (`autoDraw`): only the two kings left (`isInsufficientMaterial = kingsOnly`), 100 plies without a capture or pawn move, fivefold repetition. A lone king against a king plus any piece is **not** a draw. |
| lichess forum, "Three-Check Rule Clarification" (https://lichess.org/forum/lichess-feedback/three-check-rule-clarification) and "Rules: Double check in Three-check game" | The same double-check sentence as the variant page. |
| Wikipedia, "Three-check chess" (https://en.wikipedia.org/wiki/Three-check_chess) | "A player can win by placing their opponent in check three times." A double check is one check. Otherwise "standard rules of chess apply, including starting position and other ending conditions, such as stalemate and checkmate." Origin unknown; Pritchard suspected a Soviet origin. |
| chess.com Help Center, "What is 3-Check chess?" (https://support.chess.com/en/articles/8588462) | Three checks win; "a double-check only counts as one check". The page also lists stalemate among the "traditional means" of winning, which contradicts FIDE, lichess and Wikipedia (stalemate is a draw). Not followed. |
| FIDE Laws of Chess, Art. 3.7, 3.8, 3.9, 5.2.2, 9.6 (https://handbook.fide.com/chapter/E012023) | Pawn moves (double step, en passant, promotion); castling conditions; the definition of check: a king is in check when attacked by an enemy piece "even if such pieces are constrained from moving" (a pinned piece still gives check); dead position; fivefold repetition and 75-move automatic draws. |
| Fairy-Stockfish, "chess-variant-standards: FEN" (https://fairy-stockfish.github.io/chess-variant-standards/fen.html) and `src/variant.cpp` (`3check`: orthodox chess plus `checkCounting`) | Two FEN forms. The standard form, after the en passant field, gives the checks each side still **needs**: `3+3` at the start. The lichess form, appended at the end, gives the checks each side has **given**, White first: `... 0 1 +0+0` (scalachess stores checks *received* per king internally and writes them swapped, which is the same information). Only relevant for naming the counter. |
| SchemingMind knowledge base, "Three Checks" (https://www.schemingmind.com/home/knowledgebase.aspx?article_id=139; the page returned 403, read from the search extract) | The same rules. Double check is one check; a king may not give check (it may not approach the enemy king); no insufficient-material draw except bare kings. |

**Chosen rule set: lichess Three-check.** A check is a move that leaves the opponent's king attacked. Each such move
counts **one** check (a double check counts once). The third check wins immediately. The counter stores checks
**given** per side, White first, as the lichess FEN suffix `+W+B` shows them. Only the two kings left is a draw. The
sources agree, except for the chess.com remark on stalemate (above).

The quantum questions are:

- what "a check" means when the position is a set of possibilities;
- how the counter combines with the game-end roll.

Section 4 decides both.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- Ordinary 8 × 8 board. Files `a`-`h` (x = 0..7), ranks `1`-`8` (y = 0..7), names `a1` … `h8`, all 64 squares.
- Square index `y * 8 + x` (a1 = 0, g1 = 6, e8 = 60).

### 2.2 Pieces and movement

Ordinary chess pieces (`orthodoxTypes`):

| Piece | Descriptor |
|---|---|
| King | `leap` (±1, 0), (0, ±1), (±1, ±1); plus castling (2.4) |
| Queen | `ride` over the 8 king vectors |
| Rook | `ride` (±1, 0), (0, ±1) |
| Bishop | `ride` (±1, ±1) |
| Knight | `leap` (±1, ±2), (±2, ±1) |
| Pawn | `leap [(0,1)]` oriented, move only; `leap [(±1,1)]` oriented, capture only; plus the double step from its start rank (White rank 2, Black rank 7), en passant, and promotion on the last rank (2.4) |

### 2.3 Setup

The ordinary chess start position:

- White: Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1, pawns a2-h2.
- Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7-h7.

Check counters start at White 0, Black 0.

### 2.4 Special moves and promotion

As in chess (FIDE Art. 3.7, 3.8), unchanged by lichess:

- **Castling** (`O-O`: Ke1-g1 with Rh1-f1; `O-O-O`: Ke1-c1 with Ra1-d1; the same on rank 8 for Black). Only if
  neither the king nor that rook has moved and every square between them is empty. Classically also only if the king
  is not in check and does not cross or land on an attacked square (section 4.3 says what the app does instead).
- **Double step** of a pawn from its start rank over an empty square to an empty square.
- **En passant**: only on the move right after the enemy double step; the capturing pawn lands on the square the
  enemy pawn passed over.
- **Promotion** on the last rank, compulsory, to Q, R, B or N.

Any of these can give check, and then it counts. Examples:

- the castled rook on f1 attacks a king on f8 (T9);
- an en passant capture gives check with the capturing pawn, or uncovers a line through the square of the captured
  pawn (a discovered check, T15);
- a pawn promotes to a queen or rook that attacks the king (T11).

### 2.5 Win, draw and turn order (classical, lichess)

- **Checks.** A king is in check when an enemy piece attacks it, even a piece that is pinned to its own king (FIDE
  Art. 3.9.1; T16). After each move, if the opponent's king is in check, the mover's counter goes up by one.
  - A double check counts one.
  - A discovered check counts.
  - A king can never give check (the kings can never stand next to each other).
  - Checks do not need to be consecutive; the counter never goes down.
- **Win.** The side that gives its **third** check wins at once. Checkmate also wins. On lichess the third check must
  be a legal move, so it can never be given while the mover's own king is left in check. If a move is both mate and
  the third check, lichess reports mate; the winner is the same.
- **Draw.** Stalemate is a draw. Lichess also ends the game as a draw automatically when only the two kings are left
  (no check is possible any more), after 50 moves by each side without a capture or a pawn move, and on fivefold
  repetition; threefold repetition can be claimed.
  - A king plus any other piece against a lone king is **not** a draw: that piece can still give checks.
- White moves first. The players alternate.

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()`.

| Field | Value |
|---|---|
| `id`, `category` | `'threecheck'`, `'rules'` |
| `sides` | `whiteBlack()`. No teams, default `enemies`. |
| `topology` | `standardBoard(8, 8).topology`. |
| `types` | orthodox. royal: `k`; solid: `k`, `p`; splittable: `q`, `r`, `b`, `n`. |
| values | orthodox `VALUES` (K 400, Q 900, R 500, B 330, N 320, P 100). |
| `setup()` | `standardSetup(spec, 'rnbqkbnr')`, then `w.x.checks = [0, 0]` (checks **given** by White, by Black). |
| `extraMoves` | orthodox (double step, en passant, castling), inherited from `orthodoxSpec()`. |
| `afterMove(next, m, prev)` | Two steps. 1. `orthodoxAfterMove(spec, next, m)`. 2. With `side = prev.sd[m.id]` (the mover), `enemy = 1 - side`: if `givesCheck(spec, next, side, enemy, { royal: false })` (world.js; a piece of `side` other than its king attacks the enemy king, below), set `next.x.checks` to a **new** array with `checks[side] + 1`. Read `next.x.checks ?? [0, 0]`, because worlds built by tests may lack it. The core calls `afterMove` (through `applyClassical`) only in the worlds where a move, a split half or a merge is really played; idle worlds (missed, a split half that stays home, the worlds without the split piece, every world of a measurement) only pass through `applyMiss`, which counts nothing. That is exactly section 4.1. |
| `applyMiss`, `unifyWorlds` | Inherited from `orthodoxSpec()` and **kept**: `applyMiss(b) = clearEnPassant(b)` (the en passant right also ends in idle worlds) and `unifyWorlds(bs) = unifyCastling(bs)` (a castling right survives only if every world has it). Neither touches `x.checks`. A three-check `applyMiss` that also counted checks would change the decision of section 4.1 (see open question 5). |
| `solidExtra(w)` | `'checks:' + (w.x.checks ?? [0, 0]).join(':')`. **This makes the check counter solid** (section 4): the core's solid roll then settles it whenever worlds disagree, and its note is `'solid:' + solidExtra(b)` (`solid:checks:1:0`). The hook is read by `solidKey` in quantum.js; it is still missing from the hook table of `IMPLEMENTING.md` and from the header of `variant.js` (documentation only, `handoff/CORE-CHANGES.md` section 6). |
| `worldResult(w, mover)` | 1. A side with no king on the board has lost: `{ winner: other, reason: 'king' }`. 2. Else, if `checks[s] >= 3` for some side: `{ winner: s, reason: 'checks' }`. 3. Else, if the two kings are the only pieces on the board and the side to move next (`1 - mover`) cannot capture the mover's king in `w` (`attacks(V, w, 1 - mover, kingSquare)`, kings included): `{ winner: null, reason: 'bareKings' }`. 4. Else `null`. The core passes the side that just moved as `mover`, both in the game-end roll (`settle`) and in `stateAfter`. |
| `reasonText(reason)` | `'checks'` → `t('quantumchess', 'three checks')`; anything else → `null`. `'bareKings'` needs no own text: the generic `reasonText` of `src/variantplay/texts.js` already says "only the two kings are left" (U7). |
| `noteText(note)` | UI hook, read first by `noteText(V, note)` in `src/variantplay/texts.js` (U7). For a note that starts with `solid:` and matches `/checks:(\d+):(\d+)$/`: if a count is 3, `t('quantumchess', 'Third check: {side} wins', { side: sideName(spec, s) })`, else `t('quantumchess', 'Checks: White {white}, Black {black}', { white, black })`. Anything else → `null` (the generic text). See "Roll notes" below. |
| `sideInfo(state, side, viewer)` | UI hook (U6, `src/variantplay/panel.js`): with `count = (state.worlds[0].b.x.checks ?? [0, 0])[side]` (certain, section 4.2), `{ text: t('quantumchess', 'Checks: {count}/3', { count }), title: t('quantumchess', 'Checks given: {count} of 3', { count }) }` for both sides. Section 6. |
| `recordInfo(prev, code, branch, next)` | Core hook (Q9, stored as `record.info`): with `side = prev.turn`, if `next.worlds[0].b.x.checks[side]` is greater than `prev.worlds[0].b.x.checks[side]` (each read with `?? [0, 0]`; the counter is the same in every world), `{ check: <the new count> }`; else `null` (no `info` field). |
| `infoText(record, viewer)` | UI hook (U9, `recordLines` in `src/variantplay/texts.js`): `record.info?.check` → `[t('quantumchess', '{side} gave check {count} of 3', { side: sideName(spec, record.side), count })]`, else `null`. Shown under the move in the move list and in the box that reports the opponent's last move. |
| `evaluate(w, side)` | `CHECK_VALUE[Math.min(checks[side], 2)] - CHECK_VALUE[Math.min(checks[enemy], 2)]` with `CHECK_VALUE = [0, 180, 500]` (the third check is a win and is scored by the search from the result). Clamp the index: `CHECK_VALUE[3]` is `undefined` and would turn the score into `NaN` if a world with 3 checks were ever evaluated. Optional extra term: −40 per enemy piece (other than the king) that attacks a square next to your own king. The search treats a move that might give the **third** check as forcing (`mightForce`, U14: some outcome has a result); a first or second check is not forcing, so the normal level's reply search does not look at it, and `evaluate` carries it instead. |
| `visibility`, `options` | none. |
| Not used | `measured`, `apply`, `generate`, `filterMoves`, `stateResult`, `noMoves` (the default draw), `budgetRule`, `compulsoryCapture`, `passWhenStuck`, `replySide`, `resignResult`. |
| `rules()` | section 5. |

**Attack test.** "Attacked by a piece of `side` other than its king" is `givesCheck(V, w, side, victim, { royal:
false })`, which skips attackers of a royal type (core change W6, in the tree). No local helper is needed.

- Do not fake it with the plain `givesCheck` on a copy without the king: the mover's king can block one of the
  mover's own lines, and removing it would invent a check.
- The test covers pawn diagonals (lines with `mode: 'move'`, the pushes, are skipped), knights, and sliders blocked
  by any piece in that world. Pins play no part: a piece pinned to its own king still gives check (FIDE Art. 3.9.1,
  T16). Castling and en passant are not attacks, but a castled rook, a pawn that captured en passant, or a line
  uncovered by either (or by a king move, T24) is.

**Where the counter lives.** The counter is `w.x.checks` (JSON, 2 small integers). It is part of `worldKey`, so
worlds with different counters are never merged by `dedupe`. Thanks to `solidExtra` they can never coexist after a
move anyway.

**Roll notes (UI).** The solid roll that settles the counter produces the note `'solid:' + solidExtra(b)`, that is
`solid:checks:W:B`, e.g. `solid:checks:1:0` (T5; core change Q4). In orthodox chess every other change of a solid
piece is already settled by land = roll (and castling and en passant are certain), so in this variant a `solid:`
note is always a counter roll: on a copy of the variant without `solidExtra`, no candidate move of 40 random games
(11745 moves) gave a `solid:` note (`fuzz2.mjs`). The generic `noteText` would show "A piece that is always solid was
settled", which is wrong here, hence the `noteText` hook above. Its regex matches the **end** of the note, so it also
reads notes saved in the old format (`solid:<solid pieces>|<hand>|checks:W:B`). The "Third check" text matters: a
third check is decided by the counter roll, so the winning branch has **no** `end:` note (T8), and without this text
the preview would not say that the game ends.

The outcome preview of T6 reads "50 % Moved · Checks: White 1, Black 0" and "50 % Missed · Checks: White 0, Black 0".

**Outcome labels after the counter roll.** The core labels each part of a branch split by the solid roll or the
game-end roll by its own worlds (core change Q4, `partLabel` in quantum.js, in the tree): a part made only of missed
worlds reads "Missed" (T6, T8, T20, T28), and the part of a split made only of idle worlds (the split piece was not on
the from square) reads "Missed" too (T23). Three-check makes such parts frequent (in 200 random games, 292 counter
rolls, 150 of them on splits), because any move can trigger a solid roll.

**Bare-kings draw (required).** Lichess draws automatically when only the two kings are left
(`isInsufficientMaterial = kingsOnly`), and so do SchemingMind and classic Quantum Chess (`docs/rules.md` section 6).
It is step 3 of `worldResult`, so it is per world like every other result: a capture that takes the last piece in
only some worlds is already a roll (land = roll, T19), and any remaining disagreement goes to the game-end roll. As
in classic Quantum Chess it waits when the side to move can capture the enemy king (a king that captured the last
piece next to the enemy king is simply taken). The kings are solid, so this condition is the same in every world. No
other material draw: a king plus any other piece can still give checks.

---

## 4. Quantum adaptation

### 4.1 What a check is, per possibility

**Decision:** in each world where your move is actually played, your move gives check if, **after** it, one of your
pieces other than your king attacks the enemy king in that world. "Attacks" means it could capture the king there
with an ordinary move. A double check counts once.

Consequences, each decided explicitly:

- **Missed worlds give no check.** Where your move was not played (Missed), nothing happened, so no check is counted
  there, **even if the enemy king is attacked in that world** (T20). This is what the core does with `afterMove`
  alone: it runs only where a move is played. (The core's `applyMiss` hook could count a check in idle worlds too;
  this spec does not, for the reasons in open question 5: a missed attempt is not a move, as for the 50-move count in
  `docs/rules.md` section 6, and it keeps "a measure never gives check" without an exception.)
- **Joining a part that already gives check.** A part that moves onto another part of the same piece joins it
  without a roll (`docs/rules.md` 2.1, core change Q14). If the part that is already there attacks the enemy king,
  the move is played only in the worlds where the moving part was: only those count a check, so the counter roll
  decides whether a check was given, although the piece ends up on the same square either way (T28). Where the
  target part does not attack the king, the join is an ordinary unrolled move.
- **A measure never gives check.** No piece moves, and the core applies no move.
- **Split.** A split plays the move in both halves: each half is checked on its own. If both halves give check, that
  is one certain check and the piece stays a ghost (T5, second part). If a half cannot move because its path is
  blocked (it stays home), that half's world counts no check; nor do the worlds where the split piece is not on the
  from square at all (a ghost part), since nothing is played there (T23).
- **Merge.** A merge is played in each world where one of the parts reaches the target, and there it counts like any
  move (T22); the worlds where it misses count no check.
- **The king does not give check.** A king next to the enemy king is not a check. It is simply a king the opponent
  can capture. This is faithful to chess, where a king can never give check. It also prevents a "walk your king up
  for the third check" trick that capture-the-king would otherwise allow. A king move can still **uncover** a check
  by another piece, and that counts (T24).
- **A check left standing counts again.** There is no check rule, so your opponent may leave their king attacked. If
  they do, each further move you play there is again "a move after which the king is attacked" and counts another
  check (T10), as long as the king is still attacked after that move. This follows the lichess implementation, which
  looks at the position after each move (scalachess adds one whenever a king is in check after a move); on lichess the
  case never arises, because a check must be answered. You may of course simply capture the king instead. With a
  solid attacker this situation is rare (you would just capture); with a ghost attacker it keeps the pressure on,
  like a real check. If the king stands attacked in only **some** worlds (for example because the opponent moved a
  ghost blocker away in some of them), your next played move, whatever it is, gives check in those worlds only, so
  the counter roll settles it and collapses the pieces involved (T21). A measurement instead counts nothing.
- **Only the mover scores.** Your move never changes your opponent's counter, even if it leaves your own king
  attacked (T18). The scalachess code looks at both kings after every move, but on lichess the mover's own king can
  never be in check after a legal move, so this is a choice for the no-check setting, not a deviation from any real
  game: the opponent scores that check only by a move of their own that leaves your king attacked.

### 4.2 The counter is solid: checks are always certain

**Decision:** the check counter is treated like a solid piece, via `solidExtra`. After every move, if the worlds
disagree about whether your move gave check, the **solid roll** settles it at once.

- The chance of "check" is the total weight of the worlds where it gave check.
- The worlds that disagree with the result are discarded, as after any roll.
- The rules for moving are unchanged: split, merge, measure, land = roll, pass = link, budget 8, 4 squares per
  piece. What changes is that **any** kind of move, including a split, a merge, a join, a pass = link move, castling
  or en passant (which never roll by themselves), becomes a roll when it gives check in some worlds only (T26, T27).
- The budget, world and location limits of a split are checked on the worlds before the counter roll, as for every
  split (`splitBranches`). A split that would break them before the roll is refused, even if the roll would have
  collapsed it.

So **the number of checks each side has given is always a whole, certain number**, and a move that *might* give check
is a *measurement*. Examples (tests T5-T8, T20, T21, T23, T26-T28):

- A queen split in which one half would give check collapses at once: 50 % check (that half is real), 50 % no check.
- A ghost part that moves to give check rolls: it checks only if it was really there.
- A certain rook move to the king's file past a ghost blocker rolls: it checks only if the blocker was elsewhere.
- A ghost part's quiet move while the enemy king stands attacked rolls: it counts only where the part was really
  there (T20).
- Castling whose rook would check past a possible blocker rolls: castling itself is certain (legal only when possible
  in every world), but the check is not (T26). The same holds for en passant (T27).

**Interaction with the game-end roll.** The solid roll runs *before* the game-end roll (`settle` in quantum.js).
After it, every world of a branch has the same counter. Therefore:

- A **third check** is never partial. If a move might give the third check, the counter roll decides it:
  - with the check's probability, the mover has 3 checks in every remaining world, and `worldResult` ends the game;
  - otherwise the game goes on with the old counter.
- For players this is exactly "if the game might be over, reality decides" (variants.md, quantum rule 6).
- Because the counter roll comes first, the winning branch carries only the counter note, `solid:checks:3:<Black's
  count>` for White's third check or `solid:checks:<White's count>:3` for Black's, and no `end:` note (T8). The
  `noteText` hook (section 3) must therefore say that the game ends.
- The generic game-end roll remains for other cases, such as a king capture that happens in only some worlds, and
  that is already a roll of its own.

**Why not per-world (uncertain) counters?** That would be the other option: each world keeps its own counter, and a
roll happens only when a third check exists in some worlds. It was rejected because:

- players would have to follow counters like "1 check (50 %) or 2 (50 %)";
- worlds with the *same* piece arrangement but different counters would multiply. The budget does not count them,
  but the 64-world cap on splits does, so players would see splits refused "for no reason" while their budget pips
  show room;
- the UI and the computer player get harder.

The solid counter keeps every quantum mechanic and is one sentence to explain.

### 4.3 Everything else

En passant, promotion, the budget, splits and merges work as in every variant (section 4.2 says when a possible check
makes them roll). The app's shared "capture the king" convention
(variants.md, quantum rule 8; `docs/rules.md` section 5) replaces the lichess check rule, with these consequences:

- **No check rule.** You may move your king into attack or leave it there. Capturing the king wins; it takes the
  place of checkmate.
- **The third check wins at once, even if your own king is attacked** (T17). The game ends before your opponent
  could capture it. On lichess such a move would be illegal; here it is the plain consequence of "the third check
  wins immediately".
- **Castling** keeps the conditions that do not involve attack (king and rook unmoved, the squares between them
  empty) and drops the rest: you may castle out of, through or into attack (`docs/rules.md` section 5, the shared
  `castlingMoves`). As in every orthodox variant it is a *certain* move: legal only when it is possible in every
  possibility, so a possible piece between king and rook makes it illegal rather than a roll (core change Q2), and
  the right is lost as soon as the king or that rook is not 100 % on its square (`unifyWorlds`, W5). Castling counts
  a check like any other move; if its rook checks in some possibilities only, the counter roll settles it (T26).
- **En passant** is certain too: legal only when possible in every possibility, and only on the ply right after the
  double step (a move that missed there, or a measurement, also ends the right: `applyMiss`, W4). It can give check
  with the capturing pawn or by uncovering a line (T15); a check in some possibilities only is settled by the counter
  roll (T27).
- **Draws** are the shared ones (50 moves by each side without a capture, pawn move or drop that really happened; the
  move limit; no legal move, the stand-in for stalemate) plus the bare-kings draw (section 3). The variants core has
  no repetition rule, so the lichess threefold (claim) and fivefold (automatic) repetition draws are not available,
  as in every other variant.

---

## 5. Player-facing rules text (rules card)

Each bullet is one `t('quantumchess', '...')` string of `rules()` (7 sentences; IMPLEMENTING.md allows 3-8). A
string that does not fit in 120 columns goes on its own line, whole.

- Give check three times to win. Capturing the king also wins.
- A check is a move after which one of your pieces (not your king) attacks the enemy king; a double check counts once.
- Checks are always certain: a check in some possibilities only is rolled at once, even after castling or en passant.
- A move that misses gives no check, even if the enemy king is attacked. Measuring never gives check.
- A check left standing counts again after each of your moves, as long as the enemy king is still attacked.
- The game is a draw when only the two kings are left.
- The counters next to the players' names show how many checks each side has given.

Checked against the engine: sentence 3 covers every kind of move, splits, merges, joins, pass = link moves, castling
and en passant included (T5, T6, T20-T23, T26-T28), and the roll is shown with its odds before it is played (the
pending box of `useVariantGame`, since such a move has two or more outcomes). "Even after castling or en passant" is
needed because the shared rules card (`sharedRules()` in `src/variantplay/texts.js`) says they "are never rolled",
which is true of castling and en passant themselves but not of the counter roll that follows them here. Sentences 2-5
do not fit in 120 columns together with their `t(...)` call; each string goes on its own line, whole. Sentence 4 is
T13, T20 and T28. Sentence 5 is T10 and T21; "as long as" matters, because moving the attacker away or blocking your
own line counts nothing. Sentence 7 describes the `sideInfo` text (section 6), which the UI shows (U6).

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, `light` / `dark` shades, labels a-h and 1-8, White at the bottom.
  cburnett sprites; there are no new pieces.
- **Layout API.** `standardBoard(8, 8).topology` is a `rectTopology`; it brings its own cells, shades and labels.
  No `layoutOf`, no extra `layout` entries.
- **Check counters.** Each player's row of `VariantGameView` shows the variant's `sideInfo` text (U6) between the
  name and the budget pips: "Checks: 2/3", with the tooltip "Checks given: 2 of 3" (section 3). The counter is
  certain, so it is read from `state.worlds[0].b.x.checks`. The hook returns only `{ text, title }`; the three "+"
  marks proposed earlier are not part of it (text only, so colour is never the only clue).
- **Outcome preview and roll box.** With the `noteText` hook (section 3), a rolled move shows the counter per
  outcome ("Checks: White 1, Black 0", or "Third check: White wins"), in the pending box before the roll and in the
  roll box after it.
- **Move list.** A move that gave check gets the line "White gave check 2 of 3" under it, from `recordInfo` (Q9,
  stored as `record.info`) and `infoText` (U9). The same line appears in the box that reports the opponent's last
  move. Games saved before the change have no `info` and show no line.
- **Danger ring.** Unchanged: it shows the chance that the enemy could capture your king next move. It is not a check
  counter.

---

## 7. Test cases

Worlds are `worldFrom` placements; unless stated otherwise `x = { ep: -1, epVictim: -1, castle: [], checks: [W, B] }`
with the counters given. White moves unless stated otherwise. "Counters" are `[White, Black]` in every remaining
world. All outcomes were produced by the prototype on the real core. T15-T19 and the corrected T3 and T11 were added
by the source review and run on the same prototype (`handoff/tmp/rev1-threecheck/review.mjs`, `bare2.mjs`; T19 with
the bare-kings step of section 3 added to the prototype's `worldResult`). T9 was also re-run with the castling right
built by `castlingRights`. The engine review re-ran T1-T19 and added T20-T25 (first pass,
`handoff/tmp/critic-threecheck/tests.mjs`, `fuzz.mjs`), then re-ran everything and added T26-T29 on the core with the
changes of `handoff/CORE-CHANGES.md` in the tree (second pass, `proto2.mjs`, `tests2.mjs`, `fuzz2.mjs`; all 36 checks
pass, and the 122 core tests pass on the same tree).

Conventions (engine review):

- A ghost is given as equal-weight worlds, listed in the order written ("50 % on d1 and 50 % on d3" = world 0 has it
  on d1, world 1 on d3).
- "Outcome i" is index i of `branches(V, state, code)`, which is what `applyOutcome(V, state, code, i)` plays. The core
  orders outcomes by key (`miss`, `move`, `capture`) for a roll by landing, and by the first world of each group for
  the counter roll.
- A "counter note" is the note `solid:checks:W:B` (core change Q4); the tests compare it exactly. `noteText` matches
  only its end, so it also reads the longer notes of games saved before Q4.
- Keys are those of the core with Q4 (each part of a branch split by the counter roll is labelled by its own worlds).

**T1. A classical check counts.** From the start: 1.e4 e5 2.Bc4 Nc6 3.Bxf7. Counters `[1, 0]`, one world, no result.

**T2. A double check counts once.** White Kh1, Re1, Ne4; Black ke8; counters `[0, 0]`. `e4-f6` gives the rook's and
the knight's check together. Counters `[1, 0]`.

**T3. The king does not give check.** White Kd5; Black kd7; counters `[2, 0]`. `d5-d6` puts the kings next to each
other: the White king now attacks d7 (`givesCheck(V, b, 0, 1)` says yes, `givesCheck(V, b, 0, 1, { royal: false })`
says no). Counters stay `[2, 0]` and there is no result. Black may now capture the White king (`d7-d6` is legal).

**T4. The third check wins.** White Ka1, Qd1; Black kh8; counters `[2, 1]`. `d1-d8` (check along rank 8). Counters
`[3, 1]`; result `{ winner: 0, reason: 'checks' }`.

**T5. Quantum: a split into check collapses at once.**
- White Kg1, Bf1; Black ke8; counters `[0, 0]`.
- `f1-b5|d3` (b5 attacks e8 through c6 and d7; d3 does not) has two outcomes, each p = 0.5, key `split`, rolled,
  each with exactly one note, a counter note:
  - outcome 0: bishop 100 % on d3, counters `[0, 0]`, notes `['solid:checks:0:0']`;
  - outcome 1: bishop 100 % on b5, counters `[1, 0]`, notes `['solid:checks:1:0']`.
- No ghost remains.
- Second part, both halves check: White Kg1, Qd1; Black ke8; counters `[0, 0]`. `d1-a4|h5` (a4 attacks e8 through
  b5, c6, d7; h5 through g6, f7) has **one** outcome, key `split`, not rolled, no notes: counters `[1, 0]` and the
  queen 50 % on a4, 50 % on h5.

**T6. Quantum: a ghost part gives check only if it is really there.**
- White Kg1 and a queen that is 50 % on d1 and 50 % on d3; Black ke8; counters `[0, 0]`.
- `d1-h5` (h5 attacks e8 through g6 and f7) is not a landing roll, since h5 is empty everywhere, but the counter roll
  splits it; both outcomes are rolled and carry one counter note:
  - outcome 0, p = 0.5: Qh5, counters `[1, 0]`, key `move`, notes `['solid:checks:1:0']`;
  - outcome 1, p = 0.5: the queen was on d3 (the move missed), queen 100 % on d3, counters `[0, 0]`, key `miss`,
    notes `['solid:checks:0:0']`.

**T7. Quantum: a ghost blocker.**
- White Kg1, Ra1; Black ke8 and a knight that is 50 % on e5 and 50 % on c6; counters `[0, 0]`.
- `a1-e1` is played in both worlds, and the counter roll gives two outcomes, each p = 0.5, key `move` (the rook
  moved in both worlds):
  - outcome 0: knight 100 % on e5 (it blocks the file), counters `[0, 0]`;
  - outcome 1: knight 100 % on c6, counters `[1, 0]`.

**T8. Quantum: a possible third check.**
- As T6, but counters `[2, 0]`.
- `d1-h5` has two outcomes, each p = 0.5:
  - outcome 0: key `move`, Qh5, counters `[3, 0]` and result `{ winner: 0, reason: 'checks' }`. Its notes are
    `['solid:checks:3:0']`; there is **no** `end:` note, because the counter roll already made every world agree
    (`noteText` gives "Third check: White wins");
  - outcome 1: key `miss`, counters `[2, 0]`, no result, the queen is 100 % on d3, notes `['solid:checks:2:0']`.

**T9. Castling gives check.** White Ke1, Rh1 with right `K`; Black kf8; counters `[0, 0]`. `O-O` gives Kg1 Rf1 and
counters `[1, 0]` (the rook on f1 attacks f8).

**T10. A check left standing counts again.** White Kg1, Bb5, pa2; Black ke8 (attacked by the bishop through c6 and
d7); counters `[1, 0]`. `a2-a3` gives counters `[2, 0]`.

**T11. Promotion check.**
- White Ka1, pe7; Black kh8; counters `[0, 0]`.
- The moves of the pawn are `e7-e8=q`, `=r`, `=b`, `=n`.
- `e7-e8=q` and `e7-e8=r` give counters `[1, 0]` (the new piece on e8 attacks h8 along the rank through f8 and g8).
- `e7-e8=b` and `e7-e8=n` give counters `[0, 0]`.

**T12. Black's counter.** Black to move; White Ke1; Black ra8, kh8; counters `[0, 0]`. `a8-a1` gives counters
`[0, 1]`.

**T13. Measuring gives no check.**
- Two worlds, each with White Kg1, Bb5, pa2 and Black ke8 (the king is already attacked), plus a White knight that is
  50 % on c1 and 50 % on h3. Counters `[1, 0]`.
- `?c1` has outcomes 0 = `c1` and 1 = `h3`, each p = 0.5, and in both the counters stay `[1, 0]`.
- (Compare T10: a move that is played counts; a measurement does not.)

**T14. Start.** `newGame(V)`: 20 legal ordinary moves, counters `[0, 0]`, no result.

**T15. En passant uncovers a check.**
- White Kh1, Ra5, pb5; Black kh5, pc7; counters `[0, 0]`; Black to move.
- `c7-c5` (counters stay `[0, 0]`), then White's moves include `b5-c6` (en passant).
- `b5-c6` removes the pawn on c5 and opens rank 5 from a5 to h5: counters `[1, 0]`.
- Control: `b5-b6` instead leaves the Black pawn on c5 in the way: counters `[0, 0]`.

**T16. A pinned piece gives check (FIDE Art. 3.9.1).**
- White Ke1, Nc3; Black re8, kf6; counters `[0, 0]`. (A legal classical position: White is in check from e8.)
- `c3-e4` blocks the rook and attacks f6, although the knight is now pinned to its own king. Counters `[1, 0]`.

**T17. The third check wins even if your own king is attacked.**
- White Ka1, Qd1; Black ra7, kh8; counters `[2, 0]`. The rook attacks the White king along the a-file.
- `d1-d8`: counters `[3, 0]`, result `{ winner: 0, reason: 'checks' }`. (On lichess this move would be illegal.)

**T18. Only the mover scores.**
- White Ke1, pa2; Black re8, kh8; counters `[0, 0]`. The rook attacks the White king along the e-file.
- `a2-a3` leaves the White king attacked: counters stay `[0, 0]` (Black's counter does not change).

**T19. Bare kings.** Counters `[1, 2]` in each case.
- White Ke4; Black kh8, pd5. `e4-d5` takes the last piece: result `{ winner: null, reason: 'bareKings' }`.
- White Ke4; Black ke6, pd5. `e4-d5` lands next to the Black king: no result, because Black can capture it; after
  `e6-d5` the result is `{ winner: 1, reason: 'king' }`.
- Quantum: White Ke4; Black kh8 and a knight that is 50 % on d5 and 50 % on a8. `e4-d5` is a king move onto a square
  that may hold a piece, so it is a landing roll with two outcomes, each p = 0.5, no notes (the counter does not
  change): outcome 0 `move` (Kd5, knight 100 % on a8) with no result, and outcome 1 `capture` with result
  `{ winner: null, reason: 'bareKings' }`. Counters stay `[1, 2]` in both.

**T20. A standing check turns a quiet ghost move into a roll** (engine review; section 4.1, missed worlds).
- White Kg1, Bb5 (attacks e8 through c6 and d7) and a queen that is 50 % on d1 and 50 % on d3; Black ke8; counters
  `[1, 0]`.
- `d1-d2` lands on a square that is empty everywhere, so elsewhere it would be pass = link. Here the played world counts
  a check (the bishop still attacks) and the missed world does not, so the counter roll splits it; both outcomes
  rolled, one counter note each:
  - outcome 0, p = 0.5: Qd2 (100 %), counters `[2, 0]`, key `move`;
  - outcome 1, p = 0.5: queen 100 % on d3, counters `[1, 0]`, key `miss`.
- Control: the same without the bishop and counters `[1, 0]`: one outcome, not rolled, key `move`, the queen 50 % on
  d2 and 50 % on d3, counters `[1, 0]`.

**T21. A ghost attacker left standing is settled by the next played move** (engine review).
- White Kg1, pa2 and a queen that is 50 % on h5 (attacks e8 through g6 and f7) and 50 % on d1 (does not); Black ke8;
  counters `[0, 0]`; White to move.
- `a2-a3` is played in both worlds (key `move` in both), and gives check only where the queen is on h5: two outcomes,
  each p = 0.5, rolled, one counter note each:
  - outcome 0: queen 100 % on h5, pawn a3, counters `[1, 0]`;
  - outcome 1: queen 100 % on d1, pawn a3, counters `[0, 0]`.
- Control: `?d1` (measure) instead has outcomes `d1` and `h5`, each p = 0.5, counters `[0, 0]` in both.

**T22. A merge counts like a move** (engine review).
- White Ka1 and a queen that is 50 % on c2 and 50 % on g2; Black ke8; counters `[0, 0]`.
- `c2|g2-e4` reaches e4 in both worlds (through d3, and through f3); e4 attacks e8 along the file. One outcome, key
  `move`, not rolled, no notes: one world, Qe4, counters `[1, 0]`.

**T23. Splitting a ghost part while the enemy king stands attacked** (engine review).
- White Kg1, Bb5 (attacks e8) and a queen that is 50 % on d1 and 50 % on h3; Black ke8; counters `[1, 0]`.
- `d1-a4|d2`: in the d1 world both halves are played and both count (the bishop still attacks); the h3 world is not
  touched and counts nothing. Two outcomes, each p = 0.5, rolled, one counter note each:
  - outcome 0: key `split`, the queen 50 % on a4 and 50 % on d2, counters `[2, 0]`;
  - outcome 1: the queen 100 % on h3, counters `[1, 0]`, key `miss` (every world of this part is idle).

**T24. A king move can uncover a check** (engine review; the king itself never gives check, T3).
- White Re1, Ke2; Black ke8; counters `[0, 0]`.
- `e2-d2`: one outcome; the rook on e1 now attacks e8 along the file. Counters `[1, 0]`, no result.

**T25. Invariants for random games** (engine review; add to the variant's own spec file, since the generic
`fuzz.spec.js` compares only the solid pieces on the board, not `solidExtra`). After every move of random games with
splits, merges and measurements:
- `x.checks` is the same in every world;
- the opponent's counter never changes, and the mover's counter goes up by 0 or 1;
- the new history record has `info` exactly when the mover's counter went up, and then `info.check` is the new count;
- every `solid:` note is `solid:checks:W:B`;
- a counter of 3 always comes with the result `{ winner: mover, reason: 'checks' }` (a move that captures the king
  counts no check, because there is no king left to attack);
- (generic, the core's IT8) `x.castle`, `x.ep` and `x.epVictim` are the same in every world.
Verified on the current core on 200 random games of up to 120 plies (11766 plies, 0.2 ms per ply, up to 64 worlds,
292 counter rolls, 150 of them on splits, 620 checks, 182 games won by three checks): no violation.

**T26. Castling is certain, but its check can be rolled** (engine review, second pass; section 4.3).
- Two worlds, each with White Ke1, Rh1 (right `K` from `castlingRights`) and Black kf8, plus a Black knight that is
  50 % on f5 (it blocks the f-file) and 50 % on a5. Counters `[0, 0]`.
- `O-O` is legal (castling is possible in both worlds) and played in both: Kg1, Rf1. The rook checks f8 only where
  the knight is on a5, so the counter roll gives two outcomes, each p = 0.5, key `move`, rolled:
  - outcome 0: knight 100 % on f5, counters `[0, 0]`, notes `['solid:checks:0:0']`;
  - outcome 1: knight 100 % on a5, counters `[1, 0]`, notes `['solid:checks:1:0']`.
  - In both, White has no castling right left.
- Control: with a White knight 50 % on g1 and 50 % on e3 instead (no Black knight), `O-O` is illegal (`branches`
  gives null; core change Q2), not a roll.

**T27. En passant is certain, but its check can be rolled** (engine review, second pass).
- Two worlds, each with White Kh1, Ra5, pb5 and Black kh5, pc5, `x.ep` = c6 and `x.epVictim` = c5 (Black has just
  played `c7-c5`), plus a Black knight that is 50 % on e5 (it blocks rank 5) and 50 % on e8. Counters `[0, 0]`.
- `b5-c6` (en passant) is played in both worlds and opens rank 5 from a5 only where the knight is on e8: two outcomes,
  each p = 0.5, key `capture`, rolled:
  - outcome 0: knight 100 % on e5, pawn c6, no pawn on c5, counters `[0, 0]`;
  - outcome 1: knight 100 % on e8, pawn c6, no pawn on c5, counters `[1, 0]`.

**T28. Joining a part that already gives check** (engine review, second pass; section 4.1).
- White Kg1 and a queen that is 50 % on d1 and 50 % on h5 (h5 attacks e8 through g6 and f7); Black ke8; counters
  `[0, 0]`.
- `d1-h5` moves the d1 part onto the h5 part. It is not a landing roll (the only piece that may be on h5 is the queen
  itself, core change Q14), but it is played only in world 0, so only that world counts a check. Two outcomes, each
  p = 0.5, rolled, and in both the queen is 100 % on h5:
  - outcome 0: key `move`, counters `[1, 0]`, notes `['solid:checks:1:0']`;
  - outcome 1: key `miss`, counters `[0, 0]`, notes `['solid:checks:0:0']`.
- Control: a queen 50 % on d1 and 50 % on d3 (neither attacks e8), `d1-d3`: one outcome, key `move`, not rolled, no
  notes, one world with the queen on d3.

**T29. The UI hooks** (engine review, second pass; sections 3 and 6).
- After T1: the last history record has `info` `{ check: 1 }` and the four before it have no `info` field;
  `infoText(record)` gives `['White gave check 1 of 3']`; `sideInfo(state, 0)` gives `{ text: 'Checks: 1/3', title:
  'Checks given: 1 of 3' }` and `sideInfo(state, 1).text` is `'Checks: 0/3'`.
- `noteText('solid:checks:1:0')` is "Checks: White 1, Black 0"; `noteText('solid:checks:3:0')` is "Third check:
  White wins"; `noteText('solid:checks:2:3')` is "Third check: Black wins"; `noteText('solid:6:0k,60:1k||checks:1:0')`
  (a note saved before Q4) is "Checks: White 1, Black 0"; `noteText('end:{"winner":null,"reason":"bareKings"}')` is
  `null`.

---

## 8. Review notes

### Open questions (from the research)

1. **Solid counter (chosen) or per-world counters.** Solid means every possible check is settled by an immediate
   roll. Per-world counters would roll only at a possible third check, but they bring uncertain counters and hidden
   world growth (section 4.2).
2. **A check left standing counts again** (chosen; it follows the lichess implementation, section 4.1). The
   alternative, "only a new attack counts", is closer to "each check is an event". Under the solid counter it would
   also cause rolls between worlds where the king was already attacked and worlds where it was newly attacked.
3. **Core and UI hooks.** Settled: all of them are in the tree (`handoff/CORE-CHANGES.md`): `givesCheck(..., {
   royal: false })` (W6), the outcome labels and short notes after the counter roll (Q4), `recordInfo` (Q9), and the
   UI hooks `noteText` (U7), `sideInfo` (U6) and `infoText` (U9). Section 3 uses them.
4. **Bare-kings draw.** Settled by the source review: it is part of the rule set (lichess draws bare kings
   automatically), as step 3 of `worldResult` (section 3). The core plan keeps it per variant (CORE-CHANGES item 40:
   atomic, three-check, chess960, hyper4d; not King of the Hill) and gives it a generic text (U7).
5. **Should an idle world count a check left standing?** (engine review, second pass.) Chosen: no. A world where your
   move was not played counts nothing, even if the enemy king stands attacked there (section 4.1). Since the core got
   `applyMiss` (Q1) the other choice is possible: a three-check `applyMiss(b, action, side)` that first calls
   `clearEnPassant(b)` and then, unless `action.type` is `measure` or `pass`, adds one to `checks[side]` (on a copy,
   never mutating `b`) when `givesCheck(spec, b, side, 1 - side, { royal: false })`. It would turn T20, T23 and T28
   into certain checks without a roll (a "check left standing" would count after every turn, played or not), but a
   rolled **Missed** outcome could then report a check, measuring would be the one kind of turn that never counts, and
   the rules card would need "even a move that misses gives check when your pieces still attack the king" (checked on
   the core: `handoff/tmp/critic-threecheck/altmiss.mjs`). The review keeps the research's choice; the lead may
   switch with this one hook, sentences 4 and 5 of section 5, and T20, T23 and T28.

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity. The rule pages and the lichess engine source were read this time (the
research could not open them). All section 7 cases were re-run on the prototype on the current core
(`handoff/tmp/rev1-threecheck/`, a copy of `handoff/prototypes/c960/` with the import paths fixed). T1, T2, T4-T10 and
T12-T14 give exactly the stated results; T6's second branch is still labelled `move` (the core issue of section 3 is
not fixed yet).

Changes:

1. **Section 1, research note and sources.** The lichess row now quotes the variant page: all FIDE laws apply, "a
   legal move that puts your opponent's King into the third check" wins, checkmate still wins, and the double-check
   sentence is on the variant page itself (not only in the forum). Added rows for the scalachess source (how the
   counter is updated, the end condition, the status order, the automatic draws) and for the FIDE Laws (castling,
   check, draws). The Wikipedia row now quotes the page. The chess.com row notes that its help page lists stalemate
   as a way to win, which contradicts FIDE, lichess and Wikipedia; it is not followed. Sources:
   https://lichess.org/variant/threeCheck, https://github.com/lichess-org/scalachess
   (`core/src/main/scala/variant/ThreeCheck.scala`, `History.scala`, `variant/Variant.scala`, `Position.scala`),
   https://en.wikipedia.org/wiki/Three-check_chess, https://support.chess.com/en/articles/8588462,
   https://handbook.fide.com/chapter/E012023.
2. **Counter orientation (sections 1 and 3).** "The counter stores checks given per side, as lichess does" was not
   accurate: scalachess stores checks *received* per king (`CheckCount`, commented "Checks received by the respective
   side") and writes them swapped in the FEN suffix `+W+B`, which therefore shows checks *given*, White first. The
   Fairy-Stockfish form `3+3` counts checks still needed. The spec keeps "given, White first" and now says why.
   Sources: scalachess `History.scala`, `format/FenWriter.scala` (`writeCheckCount`), `format/FenReader.scala`;
   https://fairy-stockfish.github.io/chess-variant-standards/fen.html; Fairy-Stockfish `src/variant.cpp`
   (`threecheck_variant`: `3+3`, `checkCounting`).
3. **Section 2.2 and 2.4, special moves.** Added the classical conditions for castling (both castlings with their
   squares), the double step, en passant (only right after the double step) and compulsory promotion, and that an en
   passant capture can give check with the capturing pawn as well as by uncovering a line. The king row mentions
   castling. Source: FIDE Laws Art. 3.7, 3.8.
4. **Section 2.5, check definition.** A king is in check even from a piece pinned to its own king; scalachess's
   `isCheck` ignores pins as well. Added "checks need not be consecutive". Sources: FIDE Laws Art. 3.9.1;
   scalachess `variant/Variant.scala` (`kingThreatened`).
5. **Section 2.5, win.** On lichess the third check must be a legal move (you cannot give it while leaving your own
   king in check), and mate takes precedence over the third check in the status order (same winner). Sources:
   https://lichess.org/variant/threeCheck; scalachess `Position.scala` (`status`), `ThreeCheck.scala`
   (`specialEnd`).
6. **Section 2.5, draws.** Replaced "the lichess implementation detail was not verified" with the verified rules:
   lichess draws automatically with only the two kings (`isInsufficientMaterial = kingsOnly`), after 100 plies
   without a capture or pawn move, and on fivefold repetition; threefold repetition is a claim. King plus any piece
   against a king is not a draw. Sources: scalachess `ThreeCheck.scala`, `variant/Variant.scala` (`autoDraw`,
   `fiftyMoves`); lichess forum, "Threefold repetition FAQ"
   (https://lichess.org/forum/lichess-feedback/threefold-repetition-faq); SchemingMind, "Three Checks"
   (https://www.schemingmind.com/home/knowledgebase.aspx?article_id=139, read from the search extract, the page
   returned 403).
7. **Section 3, bare-kings draw is required, not optional.** All sources draw bare kings, and classic Quantum Chess
   does too (`docs/rules.md` section 6). It is now step 3 of `worldResult` (per world, reason `'bareKings'`, the same
   code and text as atomic), and it waits when the side to move can capture the enemy king, as in `docs/rules.md`.
   The rules card (section 5) got the matching sentence. The open question 4 is updated.
8. **Section 3, attack test.** States that pins play no part, and that a pawn that captured en passant also counts.
9. **Section 4.1, justifications.** "A check left standing counts again" was described as "lichess's definition
   literally"; it follows the lichess *implementation* (the counter is updated from the position after each move),
   while on lichess the case cannot arise. "Only the mover scores" is now marked as a choice for the no-check setting:
   the scalachess code looks at both kings after every move, but on lichess the mover's own king is never in check.
10. **Section 4.3, deviations from lichess made explicit.** They follow from the shared capture-the-king convention:
    no check rule (king capture replaces mate); the third check wins even while your own king is attacked (illegal
    on lichess); castling keeps only the non-attack conditions (`docs/rules.md` section 5, `castlingMoves` in
    `orthodox.js`); the draws are the shared ones plus bare kings, with no repetition draws (the variants core has
    none).
11. **T3 was wrong.** After `d5-d6` the White king on d6 and the Black king on d8 are two squares apart, so the king
    attacked nothing and the test passed whether or not the king is excluded. Black's king is now on d7: after
    `d5-d6` the White king attacks d7 (`givesCheck` including kings says yes), the counters stay `[2, 0]`, and Black
    can capture (`d7-d6`). Verified on the prototype.
12. **T11** now lists all four promotions: `=q` and `=r` check h8 along rank 8, `=b` and `=n` do not. Verified.
13. **New tests T15-T19**, all verified on the prototype: en passant uncovering a check along the rank (with a
    control move), a pinned knight giving check (a legal FIDE position), the third check winning while the mover's
    own king is attacked, only the mover scoring, and the bare-kings draw (plain, next to the enemy king, and after a
    rolled capture).

Not changed here (outside this file): `docs/variants.md`, quantum rule 8, says variants that count checks count "the
king could be captured next move". Under this spec (and in chess) a king next to the enemy king is not a check (T3),
so that sentence should read "... could be captured next move by a piece other than the king".

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency. Two passes. The first pass ran before `handoff/CORE-CHANGES.md`
existed, on the core of commit `155704f`. The second pass re-read `handoff/CORE-CHANGES.md` and the core as it is now
in the working tree (`quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`, with Q1-Q14
and W1-W7 in place), the UI code the variant's hooks feed (`src/variantplay/texts.js`, `panel.js`,
`src/views/VariantGameView.vue`), `handoff/IMPLEMENTING.md`, `handoff/CONTRACT.md`, `docs/rules.md` and
`docs/variants.md`, and re-ran everything on a new prototype that follows section 3 as revised
(`handoff/tmp/critic-threecheck/proto2.mjs`):

- `tests2.mjs`: T1-T29 and their controls, 36 checks, all pass, with the exact keys and notes of section 7;
- `fuzz2.mjs`: 200 random quantum games of up to 120 plies (11766 plies, 0.2 ms per ply, up to 64 worlds, 292
  counter rolls, 150 of them on splits, 620 checks, 182 games won by three checks) never broke an invariant of T25,
  and a copy of the variant without `solidExtra` gave no `solid:` note for any of 11745 candidate moves;
- `ai2.mjs`: every level plays a third check when one is available and a first check (`f1-b5`) when it is free;
  `mightForce` is true for a possible third check and false for a first check;
- the 122 core tests (`core*.spec.js`) pass on the same tree.

Section 8.1's corrections were kept.

Verdict: the engine mapping is implementable with the hooks as built, with **no** further core change. The solid
counter works through `solidExtra`; every quantum decision of section 4 follows from what the core does (`afterMove`
runs only where a move, a split half or a merge is really played; idle worlds only pass through `applyMiss`, which in
this variant only clears en passant). The label fix, the attack filter, the record info and the three UI hooks that
the first pass asked for are all in the tree.

#### Second pass: changes

1. **Section 3, `afterMove` and the attack test.** The check test is now `givesCheck(spec, next, side, enemy, {
   royal: false })` (W6, in `world.js`); the local helper `checkedBy` and the optional `attacks` skip are gone.
   Verified by T3, which now also asserts that the plain `givesCheck` says yes and the filtered one says no.
2. **Section 3, `applyMiss` and `unifyWorlds`.** The first pass said "do not add a hook that changes missed worlds".
   That is obsolete: `orthodoxSpec()` now brings `applyMiss` (`clearEnPassant`, W4, decision D2) and `unifyWorlds`
   (`unifyCastling`, W5, decision D1), and three-check must keep both. Neither touches `x.checks`, so "a missed world
   counts no check" still holds (T13, T20, T23, T28); `fuzz2.mjs` checks that `x.castle`, `x.ep` and `x.epVictim`
   stay identical in all worlds (the core's IT8).
3. **Section 3, roll notes.** Q4 shortened the note to `'solid:' + solidExtra(b)`, i.e. `solid:checks:1:0`. The
   regex of the first pass, `/\|checks:(\d+):(\d+)$/`, **does not match** the new note (there is no `|` before
   `checks`), so the counter rolls would have shown the generic "A piece that is always solid was settled"
   (`handoff/CORE-CHANGES.md` section 5 says the same). It is now `/checks:(\d+):(\d+)$/`, which reads both formats
   (T29). The claim "a `solid:` note is always a counter roll" was
   re-checked with a copy of the variant without `solidExtra` (no `solid:` note at all), since the new notes no
   longer show the solid pieces.
4. **Section 3, outcome labels.** The "core issue" paragraph is replaced by what Q4 does (`partLabel`): T6, T8, T20
   and T23 now give `miss` as the key, and section 7 states it without "today / after the fix".
5. **Section 3, new hook rows** with exact texts, matched to the code as built: `noteText` (U7), `sideInfo(state,
   side, viewer) -> { text, title }` (U6, `sideInfoOf` in `panel.js`; there is no `marks` field), `recordInfo(prev,
   code, branch, next)` (Q9, called by `stateAfter` outside light mode, after the result is known) and `infoText(record,
   viewer)` (U9, `recordLines`). `reasonText` no longer returns the bare-kings text, which is generic now (U7).
6. **Section 3, `evaluate` and the computer player.** Added that `mightForce` (U14) treats a possible third check as
   forcing but not a first or second check, so `evaluate` carries those. Checked with `ai2.mjs`.
7. **Section 3, "Not used".** Lists the new optional hooks the variant does not need (`budgetRule`,
   `compulsoryCapture`, `passWhenStuck`, `replySide`, `resignResult`).
8. **Section 4.1, missed worlds.** The first pass justified "a missed world gives no check" as "the only choice the
   core supports without a change". Since Q1 that is no longer true (an `applyMiss` could count a standing check).
   The choice is kept with its real reasons, and the alternative, with its exact hook and its costs, is open
   question 5.
9. **Section 4.1, joining (new bullet, T28).** Q14 lets a part move onto another part of the same piece without a
   landing roll. If the part already there attacks the enemy king, the move is played only in the other part's
   worlds, so the counter roll decides whether a check was given while the board ends up the same either way. This
   follows from "a move that misses gives no check"; T28 pins it down so an implementer does not "fix" it.
10. **Section 4.2 and 4.3, castling and en passant.** Under Q2 (D1, D2) both are *certain*: legal only when possible
    in every world, never a landing roll or a link. But the counter roll still follows them: castling whose rook
    checks past a possible blocker, or en passant that uncovers a line past one, is rolled (T26, T27, verified). 4.3
    now also has the castling right rule (lost unless king and rook are 100 % home, W5), the en passant expiry in idle
    worlds (W4) and the quiet counter that only counts moves that happened (Q8, verified: a missed `e2-e3` gives 8
    from 7, the played one 0).
11. **Section 5, rules card.** Sentence 3 is now "Checks are always certain: a check in some possibilities only is
    rolled at once, even after castling or en passant." (115 characters). The shared card (`sharedRules()`, U7) says
    castling and en passant "are never rolled", which is false in three-check once the counter roll follows them, so
    the variant's card must say so. Sentence 7 (the counters) is kept without condition, since U6 is built. The note
    below the card now says which sentences need a line of their own (2-5).
12. **Section 6.** The player-row counter is the `sideInfo` text "Checks: 2/3" (the three "+" marks are not part of
    U6); the move list gets the line "White gave check 2 of 3" through `recordInfo` + `infoText` instead of the
    optional `historyMark` the first pass proposed; the roll box also shows the counter text.
13. **Section 7.** Exact notes (`solid:checks:W:B`) and keys as built; T25 gained three invariants (the record info,
    the note format, the core's IT8) and new numbers; new tests:
    - T26: castling is certain, but its check is rolled (and castling past a possible piece is illegal, Q2);
    - T27: en passant is certain, but its check is rolled;
    - T28: joining a part that already gives check;
    - T29: the four hooks `recordInfo`, `infoText`, `sideInfo` and `noteText` (old and new note formats).
14. **Section 8, open questions 3 and 4** are settled by the core plan; question 5 is new (item 8).
15. **Section 1, research note**: names the second-pass scripts.

Core changes needed: none. Everything this variant needs is in the working tree: Q4 (labels and short notes), W6
(`givesCheck(..., { royal: false })`), Q9 (`recordInfo`), and in the UI U6 (`sideInfo`), U7 (`noteText`, generic
`bareKings` text), U9 (`infoText`), U14 (`mightForce`). Q1/W4, Q2, Q3/W5, Q8 and Q14 change behaviour the spec now
describes, and the variant needs no code for them.

Documentation only (no code): `solidExtra(b) -> string` is still missing from the hook table of `IMPLEMENTING.md`,
from `docs/development/architecture.md` and from the header of `src/variants/core/variant.js` (which lists the hooks
the core changes added). Its contract, as three-check relies on it: appended to the solid key, so worlds that
disagree on it are settled by the solid roll, before the game-end roll; the note of that roll is
`'solid:' + solidExtra(b)`. `handoff/CORE-CHANGES.md` section 6 already plans the first two entries.

Outside this file (not changed):

- `sharedRules()` in `src/variantplay/texts.js`: "Castling and en passant are only possible when they are possible in
  every possibility, and they are never rolled." In three-check the counter roll can follow them (T26, T27); the
  three-check card says so (sentence 3). If the lead prefers to fix it at the source: "... and they never roll by
  themselves."
- `docs/variants.md`, quantum rule 8, as noted in 8.1 ("... could be captured next move by a piece other than the
  king").
- The first pass's generic discrepancy (a Missed pawn push reset the quiet counter) is fixed by Q8.

#### First pass (before the core changes)

The first pass found the mapping implementable on the core of that time, with one core label fix and two UI hooks.
What it asked for and where it went: the outcome label fix became Q4; documenting `solidExtra` is in
`handoff/CORE-CHANGES.md` section 6 (still open, above); the optional `attacks` skip became W6 (`{ royal: false }`);
the optional `historyMark` became Q9 `recordInfo` with U9 `infoText`; the UI hooks became U7 (`noteText`) and U6
(`sideInfo`, without marks). Its items 5, 6, 7 (note format), 8, 9 (justification), 14 (the condition on the
counters sentence), 15 and 16 (the "today" labels) are superseded by the second pass (items 2, 1, 3, 4, 8, 11, 12 and
13). Its changes, as made then:

1. **Section 3, `afterMove`.** Added where the core calls it: `applyClassical` runs for played moves, split halves
   and merges, never for missed worlds or measurements. This is why "missed worlds give no check" and "a measure never
   gives check" need no code at all (checked in T13, T20, T23).
2. **Section 3, `solidExtra`.** Confirmed in `solidKey` (quantum.js), but it is missing from the hook table of
   `IMPLEMENTING.md` (still open; see "Documentation only" of the second pass).
3. **Section 3, `worldResult`.** The bare-kings wait uses `attacks` **with** kings (the only possible attacker there).
   Checked that the core passes the side that just moved as `mover` both in the game-end roll (`settle`) and in
   `stateAfter`.
4. **Section 3, `evaluate`.** `CHECK_VALUE[3]` is `undefined`, so an unclamped lookup would give `NaN` for a world
   with 3 checks. Now `Math.min(count, 2)`. Search states with a result never reach `evaluate` today, but the clamp
   costs nothing.
5. **Section 3, hooks not to use.** Added a row: no `measured`, `apply`, `generate`, `filterMoves`, `stateResult`
   or `noMoves`. No hook that changes missed worlds either (the `applyMiss` proposed for the multiverse, if the core
   gets it), because a missed world must count no check.
6. **Section 3, attack test.** It was "preferably a core change, otherwise a local helper". It is now a decision:
   a local helper `checkedBy`, with its exact algorithm. Also a warning not to fake it with `givesCheck` on a copy
   without the king: the mover's own king can block one of the mover's lines (for example Ra1, Kd1 against a king on
   h1), so removing it would invent a check. The `attacks` filter became an optional convenience.
7. **Section 3, roll notes.** The note format was wrong: it is `solid:<solid pieces>|<solid hand pieces>|checks:W:B`
   (here `solid:6:0k,60:1k||checks:1:0`), because `solidKey` adds `solidExtra` after the hand part. In this variant
   every `solid:` note is a counter roll; checked by `notes.mjs`: the 4608 such notes over all candidate moves of 80
   random games differ only in the `checks:` part. `noteText` is UI
   code (`src/variantplay/texts.js`), not the core. The hook now has an exact signature and fallback, and must also
   say "Third check: {side} wins". The counter roll runs before the game-end roll, so the winning branch of a possible
   third check has no `end:` note (T8). Without this text the roll preview would not say that the game ends.
8. **Section 3, label issue.** Extended to splits: after a counter roll, the branch in which the split piece was not
   on the from square is labelled "Split" although nothing moved (T23). The exact fix is under "Core changes
   needed". It was validated on a patched copy of the core in `handoff/tmp/critic-threecheck/fixcore/`: T6, T8, T20
   and T23 read `miss`, T7 and T21 stay `move`, and 100 random games ran clean.
9. **Section 4.1, missed worlds.** Made explicit that a missed world counts no check **even when the enemy king is
   attacked there**, and that this is the only choice the core supports without a change. Its visible effect is new
   test T20: a quiet ghost move that would be pass = link elsewhere is rolled while the enemy king stands attacked.
10. **Section 4.1, split and merge.** The split bullet did not cover worlds where the split piece is absent (a ghost
    part): they count nothing, so the split rolls (T23). If both halves give check, the check is certain and the
    ghost stays (T5, second part). Added a merge bullet (T22); merges call `afterMove` like moves.
11. **Section 4.1, king.** "The king does not give check" could be misread as "king moves never count". A king move
    that uncovers another piece's line counts (T24).
12. **Section 4.1, standing check.** Added "as long as the king is still attacked after that move". Added the case
    where the attack stands in some worlds only: the next played move of any kind then settles it by the counter roll,
    which collapses the pieces involved (T21). This follows from the rules and is not a new rule.
13. **Section 4.2.** "Every other quantum rule is unchanged" was misleading. The movement rules are unchanged, but
    any kind of move (split, merge, pass = link) becomes a roll when it gives check in some worlds only. Also added
    that a split's budget, world and location limits are checked before the counter roll, as `splitBranches` does
    (conservative: a split that the roll would have shrunk back is still refused).
14. **Section 5, rules text.**
    - Sentence 5 was wrong: "every further move you make counts as another check" is false when the move takes the
      attacker away or blocks its line, and "unless you simply capture the king" added nothing. It now reads "... as
      long as the enemy king is still attacked".
    - Sentence 4 now says a miss gives no check "even if the enemy king is attacked" (T20).
    - All sentences were shortened towards the 120-column rule for translatable strings.
    - The counters sentence is kept only if `sideInfo` is built.
    - "Shows you the odds before you move" is true (a move with two or more outcomes waits in the pending box of
      `useVariantGame`). It moved from the rules text into the note below it.
15. **Section 6.** Stated that `rectTopology` needs nothing else from the layout API. Gave `sideInfo` an exact
    signature (a UI hook, not the core). The `+` in the move list is now optional, because the history record holds
    no counters and the UI rebuilds states by replay; see optional core item 4.
16. **Section 7, conventions.** Added the world order, what "outcome i" means (the index for `applyOutcome`), how to
    match a counter note without hard-coding the solid key, and "key after the core fix / today". Outcome indices were
    added to T5-T8, T13 and T19.
17. **T19, quantum part: the outcome order was reversed.** A landing roll lists its outcomes in `KEY_ORDER`
    (`miss`, `move`, `capture`), so outcome 0 is `move` (Kd5, knight on a8) and outcome 1 is `capture` (bare kings).
    The roll has no notes, and the counters stay `[1, 2]` (the old prototype ran it with `[0, 0]`).
18. **New tests**, all run on the current core:
    - T5, second part: a split where both halves check;
    - T20: a standing check turns a quiet ghost move into a roll, with a control case;
    - T21: a ghost attacker left standing is settled by the next played move, and a measurement instead counts
      nothing;
    - T22: a merge gives check;
    - T23: splitting a ghost part while the enemy king is attacked;
    - T24: a king move uncovers a check;
    - T25: invariants for random games. They go in the variant's own tests, because the generic `fuzz.spec.js`
      compares only the solid pieces on the board and not `solidExtra`.
