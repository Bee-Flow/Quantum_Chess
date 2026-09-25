# Variant spec: `threecheck` (Three-check)

Category: `rules`. UI name: "Three-check". Summary line (already in `catalog.js`): "Put the enemy king in check three
times to win."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in this session (lichess.org,
wikipedia.org, fairy-stockfish.github.io). The rules below come from search-engine extracts of the pages listed, plus
prior knowledge. Every test case in section 7 was run on a prototype built on the real `src/variants/core`
(`handoff/prototypes/c960/proto.mjs`, `t3c.mjs`).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/threeCheck ("Check your opponent 3 times to win the game.") | The lichess rules: ordinary chess, and a player who gives check three times wins. Checkmate also wins. |
| lichess forum, "Three-Check Rule Clarification" (https://lichess.org/forum/lichess-feedback/three-check-rule-clarification) and "Rules: Double check in Three-check game" | "A move is considered to give ONE check if the King is threatened, regardless if multiple pieces are giving the check (in the event of a double check)." This is the official lichess rule. |
| Wikipedia, "Three-check chess" (https://en.wikipedia.org/wiki/Three-check_chess) | The same rules, and the history of the variant. |
| chess.com Help Center, "What is 3-Check chess?" (https://support.chess.com/en/articles/8588462) | The same rules; a double check counts once. |
| Fairy-Stockfish, "chess-variant-standards: FEN" (https://fairy-stockfish.github.io/chess-variant-standards/fen.html) | Lichess stores the check counters as checks *given* per side, e.g. `... 0 1 +0+0`. The older form counts checks *remaining*, e.g. `3+3`. Only relevant for naming the counter. |
| SchemingMind knowledge base, "Three Checks" | The same rules. |

**Chosen rule set: lichess Three-check.** A check is a move that leaves the opponent's king attacked. Each such move
counts **one** check (a double check counts once). The third check wins immediately. The counter stores checks
**given** per side, as lichess does. The sources agree.

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
| King | `leap` (±1, 0), (0, ±1), (±1, ±1) |
| Queen | `ride` over the 8 king vectors |
| Rook | `ride` (±1, 0), (0, ±1) |
| Bishop | `ride` (±1, ±1) |
| Knight | `leap` (±1, ±2), (±2, ±1) |
| Pawn | `leap [(0,1)]` oriented, move only; `leap [(±1,1)]` oriented, capture only; plus the double step from rank 2/7 and en passant |

### 2.3 Setup

The ordinary chess start position:

- White: Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1, pawns a2-h2.
- Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7-h7.

Check counters start at White 0, Black 0.

### 2.4 Special moves and promotion

As in chess: castling, double step, en passant, promotion to Q, R, B or N. Any of these can give check, and then it
counts. Examples:

- the castled rook on f1 attacks a king on f8;
- an en passant capture uncovers a line (a discovered check);
- a pawn promotes to a queen that attacks the king.

### 2.5 Win, draw and turn order (classical, lichess)

- **Checks.** After each move, if the opponent's king is in check, the mover's counter goes up by one.
  - A double check counts one.
  - A discovered check counts.
  - A king can never give check.
- **Win.** The side that gives its **third** check wins at once. Checkmate also wins.
- **Draw.** Stalemate, threefold repetition and the 50-move rule are draws, as in chess.
  - Any piece other than the king can still give checks, so the only dead position is king against king. This
    follows from the rules; the lichess implementation detail was not verified.
- White moves first.

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
| `extraMoves` | orthodox (double step, en passant, castling). |
| `afterMove(next, m, prev)` | Two steps. 1. `orthodoxAfterMove(spec, next, m)`. 2. With `side = prev.sd[m.id]` (the mover), `enemy = 1 - side`: if the enemy king is attacked in `next` **by a piece of `side` other than its king**, set `next.x.checks = [...]` with `checks[side] + 1`. Read `next.x.checks ?? [0, 0]`, because worlds built by tests may lack it. |
| `solidExtra(w)` | `'checks:' + (w.x.checks ?? [0, 0]).join(':')`. **This makes the check counter solid** (section 4): the core's solid roll then settles it whenever worlds disagree. The hook already exists in `solidKey` (quantum.js). |
| `worldResult(w, mover)` | 1. A side with no king on the board has lost: `{ winner: other, reason: 'king' }`. 2. Else, if `checks[s] >= 3` for some side: `{ winner: s, reason: 'checks' }`. 3. Else `null`. |
| `reasonText(reason)` | `'checks'` → `t('quantumchess', 'three checks')`. |
| `evaluate(w, side)` | `CHECK_VALUE[checks[side]] - CHECK_VALUE[checks[enemy]]` with `CHECK_VALUE = [0, 180, 500]` (the third check is a win and is scored by the search). Optional extra term: −40 per enemy piece (other than the king) that attacks a square next to your own king. |
| `visibility`, `options` | none. |
| `rules()` | section 5. |

**Attack test.** "Attacked by a piece of `side` other than its king" is `world.givesCheck` minus the royal attackers.
Two ways to get it:

- Preferred, a small core change: an optional argument on `attacks`, for example
  `attacks(V, w, side, target, { royal: false })`, that skips attackers whose type is royal.
- Otherwise, a local helper that loops over the mover's non-king pieces with `linesOf` (the prototype's `checked()`
  in `proto.mjs`).

Either way the test covers pawn diagonals, knights, and sliders blocked by any piece in that world. Castling and en
passant are not attacks, but a castled rook or an uncovered line after them is.

**Where the counter lives.** The counter is `w.x.checks` (JSON, 2 small integers). It is part of `worldKey`, so
worlds with different counters are never merged by `dedupe`. Thanks to `solidExtra` they can never coexist after a
move anyway.

**Roll notes (UI).** The solid roll that settles the counter produces a note `solid:<solid key>|checks:W:B`. The
generic `noteText` shows it as "A piece that is always solid was settled", which is wrong here. Proposed: an optional
`V.noteText(note)` hook, consulted first by `texts.js` `noteText`. For three-check it returns the counter from the
`checks:W:B` suffix, e.g. "Checks: White 2, Black 0". The outcome preview then reads, for example:

- "Moved · Checks: White 1, Black 0 · 50 %"
- "Missed · Checks: White 0, Black 0 · 50 %"

**Core issue: the outcome label after a solid roll.** In `settle()` (quantum.js), a branch split by the solid roll or
the game-end roll keeps the parent branch's `key` and `captures`. When the parent was an unrolled pass = link branch
(key `move` because some worlds moved), a sub-branch made only of `miss` worlds is still labelled "Moved"
(reproduced in T6).

- Fix: when splitting a branch whose key is `miss`, `move` or `capture`, recompute the sub-branch key from its own
  worlds (`capture` if any world captured, else `move` if any moved, else `miss`), and recompute `captures`.
- Three-check makes this visible, because a non-solid move can now trigger a solid roll. It can also happen in other
  variants (for example atomic).

**Optional draw.** `stateResult(state)`: when every world has only the two kings on the board, return
`{ winner: null, reason: 'bareKings' }`. Without it, the generic 50-move rule ends such games.

---

## 4. Quantum adaptation

### 4.1 What a check is, per possibility

**Decision:** in each world where your move is actually played, your move gives check if, **after** it, one of your
pieces other than your king attacks the enemy king in that world. "Attacks" means it could capture the king there
with an ordinary move. A double check counts once.

Consequences, each decided explicitly:

- **Missed worlds give no check.** Where your move was not played (Missed), nothing happened, so no check is counted
  there.
- **A measure never gives check.** No piece moves.
- **Split.** A split plays the move in both halves: each half is checked on its own. If a half cannot move because
  its path is blocked (it stays home), that half's world counts no check.
- **The king does not give check.** A king next to the enemy king is not a check. It is simply a king the opponent
  can capture. This is faithful to chess, where a king can never give check. It also prevents a "walk your king up
  for the third check" trick that capture-the-king would otherwise allow.
- **A check left standing counts again.** There is no check rule, so your opponent may leave their king attacked. If
  they do, each further move you play there is again "a move after which the king is attacked" and counts another
  check. This follows lichess's definition literally: the position after your move is checked. You may of course
  simply capture the king instead. With a solid attacker this situation is rare (you would just capture); with a
  ghost attacker it keeps the pressure on, like a real check.
- **Only the mover scores.** Your move never changes your opponent's counter, even if it leaves your own king
  attacked.

### 4.2 The counter is solid: checks are always certain

**Decision:** the check counter is treated like a solid piece, via `solidExtra`. After every move, if the worlds
disagree about whether your move gave check, the **solid roll** settles it at once.

- The chance of "check" is the total weight of the worlds where it gave check.
- The worlds that disagree with the result are discarded, as after any roll.
- Every other quantum rule is unchanged: split, merge, measure, land = roll, pass = link, budget 8.

So **the number of checks each side has given is always a whole, certain number**, and a move that *might* give check
is a *measurement*. Examples (tests T5-T8):

- A queen split in which one half would give check collapses at once: 50 % check (that half is real), 50 % no check.
- A ghost part that moves to give check rolls: it checks only if it was really there.
- A certain rook move to the king's file past a ghost blocker rolls: it checks only if the blocker was elsewhere.

**Interaction with the game-end roll.** The solid roll runs *before* the game-end roll (`settle` in quantum.js).
After it, every world of a branch has the same counter. Therefore:

- A **third check** is never partial. If a move might give the third check, the counter roll decides it:
  - with the check's probability, White has 3 checks in every remaining world, and `worldResult` ends the game;
  - otherwise the game goes on with the old counter.
- For players this is exactly "if the game might be over, reality decides" (variants.md, quantum rule 6).
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

Castling, en passant, promotion, the budget, splits and merges are unchanged. Capturing the king still wins. Draws are
the generic ones (plus the optional bare-kings draw).

---

## 5. Player-facing rules text (rules card)

- Give check three times and you win. Capturing the king also wins.
- A check is a move after which one of your pieces (not your king) attacks the enemy king. A double check counts as
  one.
- The number of checks is always certain. If your move gives check in some possibilities but not in others, the game
  rolls at once to decide whether it did, and shows you the odds before you move.
- A move that misses gives no check, and measuring never gives check.
- If your opponent leaves their king attacked, every further move you make counts as another check, unless you simply
  capture the king.
- The counters next to the players' names show how many checks each side has given.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, `light` / `dark` shades, labels a-h and 1-8, White at the bottom.
  cburnett sprites; there are no new pieces.
- **Check counters.** Show them in each player's row of `VariantGameView`, next to the budget pips: three small
  "+" marks, filled for each check given, plus the text "2/3" (so colour is never the only clue).
  - Tooltip: "Checks given: 2 of 3".
  - The counter is certain, so it can be read from `state.worlds[0].b.x.checks`.
  - This needs a small generic hook, for example `V.sideInfo?(state, side) -> { text, title } | null` rendered in the
    player row. Other variants can use it too.
- **Outcome preview and move list.** With the `V.noteText` hook (section 3), a rolled move shows the counter per
  outcome ("Checks: White 1, Black 0"). The move list marks a move that gave check with `+`, as in chess notation.
  One way: `sideInfo` or the history record compares the counter before and after the move.
- **Danger ring.** Unchanged: it shows the chance that the enemy could capture your king next move. It is not a check
  counter.

---

## 7. Test cases

Worlds are `worldFrom` placements; unless stated otherwise `x = { ep: -1, epVictim: -1, castle: [], checks: [W, B] }`
with the counters given. White moves unless stated otherwise. "Counters" are `[White, Black]` in every remaining
world. All outcomes were produced by the prototype on the real core.

**T1. A classical check counts.** From the start: 1.e4 e5 2.Bc4 Nc6 3.Bxf7. Counters `[1, 0]`, one world, no result.

**T2. A double check counts once.** White Kh1, Re1, Ne4; Black ke8; counters `[0, 0]`. `e4-f6` gives the rook's and
the knight's check together. Counters `[1, 0]`.

**T3. The king does not give check.** White Kd5; Black kd8; counters `[2, 0]`. `d5-d6` puts the kings next to each
other. Counters stay `[2, 0]` and there is no result. (Black may now capture the White king.)

**T4. The third check wins.** White Ka1, Qd1; Black kh8; counters `[2, 1]`. `d1-d8` (check along rank 8). Counters
`[3, 1]`; result `{ winner: 0, reason: 'checks' }`.

**T5. Quantum: a split into check collapses at once.**
- White Kg1, Bf1; Black ke8; counters `[0, 0]`.
- `f1-b5|d3` (b5 attacks e8 through c6 and d7; d3 does not) has two outcomes, each p = 0.5, key `split`, each with a
  `solid:` note:
  - bishop 100 % on d3, counters `[0, 0]`;
  - bishop 100 % on b5, counters `[1, 0]`.
- No ghost remains.

**T6. Quantum: a ghost part gives check only if it is really there.**
- White Kg1 and a queen that is 50 % on d1 and 50 % on d3; Black ke8; counters `[0, 0]`.
- `d1-h5` (h5 attacks e8 through g6 and f7) is not a landing roll, since h5 is empty everywhere, but the counter roll
  splits it:
  - p = 0.5: Qh5, counters `[1, 0]`;
  - p = 0.5: the queen was on d3 (the move missed), counters `[0, 0]`.
- Note: the current core labels the second branch `move`; it should be `miss` (core issue in section 3).

**T7. Quantum: a ghost blocker.**
- White Kg1, Ra1; Black ke8 and a knight that is 50 % on e5 and 50 % on c6; counters `[0, 0]`.
- `a1-e1` is played in both worlds, and the counter roll gives two outcomes, each p = 0.5:
  - knight 100 % on e5 (it blocks the file), counters `[0, 0]`;
  - knight 100 % on c6, counters `[1, 0]`.

**T8. Quantum: a possible third check.**
- As T6, but counters `[2, 0]`.
- `d1-h5` has two outcomes, each p = 0.5:
  - counters `[3, 0]` and result `{ winner: 0, reason: 'checks' }`;
  - counters `[2, 0]`, the game goes on, and the queen is 100 % on d3.

**T9. Castling gives check.** White Ke1, Rh1 with right `K`; Black kf8; counters `[0, 0]`. `O-O` gives Kg1 Rf1 and
counters `[1, 0]` (the rook on f1 attacks f8).

**T10. A check left standing counts again.** White Kg1, Bb5, pa2; Black ke8 (attacked by the bishop through c6 and
d7); counters `[1, 0]`. `a2-a3` gives counters `[2, 0]`.

**T11. Promotion check.**
- White Ka1, pe7; Black kh8; counters `[0, 0]`.
- The moves of the pawn are `e7-e8=q`, `=r`, `=b`, `=n`.
- `e7-e8=q` gives counters `[1, 0]` (the queen on e8 attacks h8 along the rank).
- `e7-e8=n` gives counters `[0, 0]`.

**T12. Black's counter.** Black to move; White Ke1; Black ra8, kh8; counters `[0, 0]`. `a8-a1` gives counters
`[0, 1]`.

**T13. Measuring gives no check.**
- Two worlds, each with White Kg1, Bb5, pa2 and Black ke8 (the king is already attacked), plus a White knight that is
  50 % on c1 and 50 % on h3. Counters `[1, 0]`.
- `?c1` has outcomes `c1` and `h3`, each p = 0.5, and in both the counters stay `[1, 0]`.
- (Compare T10: a move that is played counts; a measurement does not.)

**T14. Start.** `newGame(V)`: 20 legal ordinary moves, counters `[0, 0]`, no result.

---

## 8. Open questions

1. **Solid counter (chosen) or per-world counters.** Solid means every possible check is settled by an immediate
   roll. Per-world counters would roll only at a possible third check, but they bring uncertain counters and hidden
   world growth (section 4.2).
2. **A check left standing counts again** (chosen, lichess's position-based definition). The alternative, "only a new
   attack counts", is closer to "each check is an event". Under the solid counter it would also cause rolls between
   worlds where the king was already attacked and worlds where it was newly attacked.
3. **Core and UI hooks.**
   - `attacks(..., { royal: false })` or a local helper;
   - `V.noteText(note)` for the counter roll;
   - `V.sideInfo(state, side)` for the counters in the player row;
   - the `settle()` label fix (section 3).
4. **Bare-kings draw.** Optional `stateResult`. It could instead become a generic rule for all orthodox variants
   except King of the Hill.
