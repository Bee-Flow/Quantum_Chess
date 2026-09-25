# Variant spec: `antichess` (Antichess, also called Losing chess)

Category: `rules`. UI name: "Antichess". Summary line (already in `catalog.js`): "Capturing is compulsory and
whoever loses all their pieces wins."

---

## 1. Sources and chosen rule set

Research note: the first researchers could not open web pages and worked from the scalachess source and search
extracts. The source review (section 8.1) opened the lichess variant page, Wikipedia and the ICGA page, and read
the scalachess source in `handoff/ext/scalachess/` (commit 57d3483, September 2026) and Fairy-Stockfish in
`handoff/ext/Fairy-Stockfish/`. chessvariants.org and perpetualcheck.com refused the fetch (HTTP 403); nothing
below depends on them alone. Every test case in section 7 was run on a prototype built on the real
`src/variants/core` (`handoff/prototypes/anti/proto.mjs`, `tanti.mjs`; the full draw rule and the added cases in
`handoff/tmp/rev1-antichess/tdraw.mjs` and `t5b.mjs`). After the core packages of `handoff/CORE-CHANGES.md` landed,
the second engine review re-ran every case, and the new T21-T24, with assertions on the real core
(`handoff/tmp/critic-antichess/real.mjs` builds the module exactly as section 3 declares it; `treal.mjs` asserts
T1-T24).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/antichess ("Lose all your pieces (or get stalemated) to win the game.") | "Capturing is forced. If you can take a piece, you must. If multiple pieces can be captured, you may choose which piece you capture." Kings "lose their royal powers - they cannot castle, and checks are no longer a threat". "Pawns may be promoted to kings", and the promotion choice is always shown, even to players who set automatic queen promotion. |
| scalachess `core/src/main/scala/variant/Antichess.scala` (https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Antichess.scala) | The exact implementation. `validMoves`: if any capture exists (king captures, en passant and all other captures, capture-promotions included), only captures are legal. `castles = Castles.none`. `promotableRoles = Q, R, B, N, K`. `specialEnd`: the side to move has no pieces **or** no legal move, and then `winner` is the side to move. `isInsufficientMaterial` (automatic draw): every piece is a bishop or a pawn; each side has at least one bishop, all of a side's bishops stand on one square colour and the two sides' colours differ; every pawn is blocked by a pawn directly in front of it and has no move at all (`pawnBlockedByPawn`), and stands on the square colour of its own side's bishops (so it can never attack an enemy bishop or be attacked by one). `opponentHasInsufficientMaterial` (one knight each) is used only when a clock runs out and does not matter here. |
| scalachess `Variant.scala`, `Position.scala`, `MoveOrDrop.scala` | `autoDraw` = insufficient material, or 50 moves (`halfMoveClock >= 100`), or fivefold repetition; threefold repetition can be claimed. `status` checks the win (`variantEnd`) **before** the automatic draws. The half-move clock is reset by a pawn move, a capture or a promotion, never by a king move. En passant is a capture, so it is compulsory (`isLegalEnPassant` is always true in antichess). The test file `test-kit/src/test/scala/AntichessVariantTest.scala` has the draw positions used in T9. |
| Wikipedia, "Losing chess" (https://en.wikipedia.org/wiki/Losing_chess) | The same core rules: capturing is compulsory with a free choice, the king "may be captured like any other piece", "there is no castling", "a pawn may also be promoted to a king", a player wins when all their pieces are taken or when stalemated. Stalemate differs by rule set: **International** (the stalemated player wins; lichess uses this), **FICS** (the player with fewer pieces wins, equal counts draw), **Joint FICS/International** (a draw unless both rule sets give the same winner). Repetition, agreement and the 50-move rule work as in chess. |
| ICGA, "Losing Chess" (https://icga.org/icga/games/losingchess/) | Numbered rule sets: **LC1** = International (no pieces or stalemated wins; "the King is an ordinary piece to which a Pawn can promote"; no castling, check or mate), **LC2** = FICS stalemate count, **LC3** = promotion to queens only and stalemate is a draw, **LC4** = a stalemated player passes. |
| Fairy-Stockfish `src/variant.cpp` (`giveaway_variant`, `antichess_variant`) | `antichess` = `giveaway` without castling: `mustCapture`, promotion to Q, R, B, N or king (commoner), `stalemateValue = VALUE_MATE` (the stalemated side wins), `extinctionPieceTypes = ALL_PIECES` (losing everything wins). The same rules as lichess. |

**Chosen rule set: lichess Antichess (the International rules).**

- Capturing is compulsory, and the player chooses among the captures.
- The king is an ordinary piece.
- There is no castling.
- A pawn may promote to a king.
- You win by losing all your pieces or by being stalemated.
- Draw: the lichess opposite-coloured-bishops rule in full, locked pawns included (section 2.6), plus the generic
  draws.

Reasons: lichess is the best-known online implementation and the one the user names. Its rules are also the most
common international ones, and its source code is available as a reference.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- Ordinary 8 × 8 board. Files `a`-`h` (x = 0..7), ranks `1`-`8` (y = 0..7), names `a1` … `h8`, all 64 squares exist.
- Square index `y * 8 + x` (a1 = 0, h1 = 7, a8 = 56, h8 = 63).
- Light squares have `(x + y)` odd (h1, a8), dark squares have it even (a1, h8).

### 2.2 Pieces and movement

The ordinary chess pieces. The only change is that the king is **not royal**.

| Piece | Descriptor |
|---|---|
| King | `leap` (±1, 0), (0, ±1), (±1, ±1); mode both. Not royal: it may move to or stay on attacked squares, and it can be captured like any piece. |
| Queen | `ride` (±1, 0), (0, ±1), (±1, ±1) |
| Rook | `ride` (±1, 0), (0, ±1) |
| Bishop | `ride` (±1, ±1) |
| Knight | `leap` (±1, ±2), (±2, ±1) |
| Pawn | `leap [(0, 1)]` oriented, mode move; `leap [(1, 1), (−1, 1)]` oriented, mode capture. Also the double step from rank 2 (White) or rank 7 (Black) when both squares are empty, and en passant. |

### 2.3 Setup

The ordinary chess start position:

- White: Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1, pawns a2 b2 c2 d2 e2 f2 g2 h2.
- Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7 b7 c7 d7 e7 f7 g7 h7.

There are **no castling rights**. The en passant square is empty. White moves first. (lichess FEN
`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1`.)

### 2.4 Compulsory capture

- If the side to move has **any** capture, it must capture. It may choose which capture, and with which piece.
  - "Any capture" includes captures by the king, en passant captures and captures that promote.
  - The capture may take any enemy piece, including the enemy king.
- If there is no capture, every ordinary move is allowed.
- There is no check. A king may be left attacked, moved onto an attacked square, and captured.

### 2.5 Special moves and promotion

- **Castling:** none.
- **Double step and en passant:** as in chess. En passant is a capture, so when it is available it is one of the
  compulsory captures.
- **Promotion:** a pawn that reaches the last rank (rank 8 for White, rank 1 for Black), by a step or by a capture,
  must promote to a queen, rook, bishop, knight **or king**; the player always chooses. A promoted king is an
  ordinary king (not royal), and a side may have several kings.

### 2.6 Win, draw and turn order (classical, lichess)

The result is checked after every move, for the side that is now to move, in this order (lichess `Position.status`:
the win before the automatic draws).

- **Win.** The side to move wins if:
  - it has **no pieces left**, or
  - it has **no legal move** (stalemate).
- **Draw: no capture can ever happen again** (lichess `isInsufficientMaterial`). All of these hold:
  1. every piece on the board is a bishop or a pawn (no king, queen, rook or knight of either side);
  2. each side has at least one bishop; all of White's bishops stand on one square colour, all of Black's stand on
     one square colour, and the two colours differ;
  3. every pawn (of either side) is **locked**: the square directly in front of it (towards its promotion rank) holds
     a pawn of either side, and it has no capture, en passant included;
  4. every pawn stands on the square colour of **its own side's** bishops.

  A bishop and a pawn keep their square colour when they capture, so under 2 and 4 no piece can ever attack an enemy
  piece, and 3 means no pawn can ever move. The only capture that crosses colours is en passant, which condition 3
  excludes. The common case is bishops only (no pawns at all). A pawn blocked by a bishop or a king is **not**
  locked, and a pawn on the enemy bishops' colour prevents the draw.
- **Other draws (lichess):** 50 moves by each side (100 plies) without a capture or pawn move is an automatic draw;
  so is fivefold repetition; threefold repetition can be claimed. Two bare kings (or any other material) are **not**
  a draw. The quantum game keeps only the draws of section 4.5.
- White moves first, then the sides alternate. There are no other turn rules.

---

## 3. Engine mapping (contract)

Start from `spec = orthodoxSpec({ royalKing: false, promoteTo: ['q', 'r', 'b', 'n', 'k'] })`, extend that object in
place (for example `Object.assign(spec, { ... })`) and pass it to `defineVariant(spec)`, so the hooks below can refer
to it as `spec`. Every core item this section names (Q1-Q5, Q8, W4, W5, U6, U8) is now in the core; the module needs
no core change.

| Field | Value |
|---|---|
| `id`, `category` | `'antichess'`, `'rules'` |
| `sides` | `whiteBlack()`. No teams, default `enemies`. |
| `topology` | `standardBoard(8, 8).topology` |
| `types` | orthodox, with `k.royal = false`. **royal: none.** **solid: `k`, `p`** (orthodoxTypes already sets `solid: true` on the king). **splittable: `q`, `r`, `b`, `n`**. The promotion choices of `p` are `['q', 'r', 'b', 'n', 'k']`. **`k.resetsQuiet = false`** (core item Q8, see below): a king move does not reset the 50-move counter. **Required:** the core's default (`solid && !royal`) includes the non-royal king, so without the flag `V.quietTypes` is {k, p} and every king move resets the counter; with it, `V.quietTypes` is {p} (T1, T20). |
| values | **100 for every type** (lichess's own material count, `materialImbalance`, counts every piece the same), and `materialSign: -1`, so the computer wants to *lose* material. |
| `setup()` | `standardSetup(spec, 'rnbqkbnr', { castling: false })`. This gives `x = { ep: -1, epVictim: -1, castle: [] }`. |
| `extraMoves(w, side)` | `pawnExtras(spec, w, side, (s, sq) => spec.board.rankOf(sq) === (s === 0 ? 1 : 6))` only: double steps from rank 2 (White) and rank 7 (Black) and en passant, **no castling** (the `orthodoxSpec` default would also add `castlingMoves`). |
| `filterMoves(w, side, list)` | `list.some((m) => m.capture >= 0) ? list.filter((m) => m.capture >= 0) : list`. This is the classical compulsory capture, applied in every world on its own. |
| `compulsoryCapture: true` | The state-level obligation of section 4.1 (core item Q5 of `handoff/CORE-CHANGES.md`, in the core; see below). |
| `afterMove(next, m)` | `orthodoxAfterMove(spec, next, m)`, the same hook `orthodoxSpec()` already has (overriding it is optional). Promotion is done by the core. |
| `applyMiss`, `unifyWorlds` | **Inherited from `orthodoxSpec()`; do not override or delete them** (core items Q1 + W4 and Q3 + W5, in the core). `applyMiss` clears the en passant square in every world where the move did not take effect (a miss, the idle children of a split, every world of a Measure), so en passant is possible only on the ply right after the double step (T17, including what goes wrong without it). `unifyWorlds` is a no-op here (no castling rights). |
| `worldResult(w, mover)` | `next = 1 - mover`. In this order: (1) `next` has no piece on the board: `{ winner: next, reason: 'allLost' }`. (2) `mover` has no piece on the board (cannot happen in antichess; kept for safety): `{ winner: mover, reason: 'allLost' }`. (3) `generate(V, w, next).size === 0`: `{ winner: next, reason: 'stalemate' }`. (4) The draw of section 2.6, all four conditions: `{ winner: null, reason: 'bishops' }`. Implementation per world: walk the pieces on the board and return "no draw" at the first type other than `b` or `p`; collect each side's bishop colours (light = `(x + y)` odd) and require exactly one colour per side and different colours; for every pawn require that its colour is its own side's bishop colour and that the square one step forward (`topology.step(sq, V.orient(side, [0, 1]))`) holds a `p`; finally require that `next` has no capture in `generate(V, w, next)` (under conditions 1, 2 and 4 the only possible capture is en passant, and only `next` can have one). (5) Otherwise `null`. **Do not use the default** `worldResult`. Every possibility always holds the same pieces (section 4.4), so in practice only (3) can differ between worlds and start a game-end roll; (1), (2) and (4) are still evaluated per world. |
| `noMoves(state)` | `{ winner: state.turn, reason: 'stalemate' }`. Only a safety net: the stalemate check in `worldResult` normally ends the game first. |
| `reasonText(reason)` | `'allLost'` → t('quantumchess', 'it has no pieces left'); `'stalemate'` → t('quantumchess', 'it has no move left'); `'bishops'` → t('quantumchess', 'bishops on opposite colours'). The UI shows "{side} wins ({reason})", so the reason must describe the **winner**: "Black wins (it has no pieces left)". The shorter "all pieces lost" / "stalemate" read as the loser's misfortune ("Black wins (all pieces lost)" suggests White lost them). |
| `sideInfo(state, side, viewer)` | Optional (core item U6, shown in the player rows by `panel.js` `sideInfoOf`): `{ text: t('quantumchess', 'Pieces: {count}', { count }) }`, the number of that side's pieces on the board, taken from `state.worlds[0].b` (it is the same in every possibility). |
| `evaluate`, `visibility`, `options` | none |
| `rules()` | section 5 |

**Compulsory capture in the core (Q5, with the export `mustCapture` from Q12 and the UI from U8; all in the core).**
The per-world `filterMoves` alone cannot express the state-level obligation of section 4.1: `generate` sees only one
world, and it is cached per world. The semantics (as built in `src/variants/core/quantum.js`; verified on the real core
with T10-T15, T18, T21, T23 and the random games):

- `table(V, state)` also collects `captureKeys`: the keys of the union (after Q2 has removed the certain-only keys
  that some world lacks) that are a capture (`m.capture >= 0`) in at least one world.
- Export `mustCapture(V, state)`:
  `Boolean(V.compulsoryCapture) && !state.result && table(V, state).captureKeys.size > 0`.
- `ordinaryMoves`: when `mustCapture`, skip the keys that are not in `captureKeys`.
- `splitTargets`: when `mustCapture`, return `[]`.
- `mergesFrom`: when `mustCapture`, keep only the merges whose `branches` are not null, that is, whose outcomes
  (before the settling rolls) include a capture.
- `legalMoves`: when `mustCapture`, do not offer the measurement.
- `branches(V, state, code)`: when `mustCapture`, return `null` for:
  - a split;
  - a measure;
  - an ordinary move whose key is not in `captureKeys`;
  - a merge without a capturing outcome.
- `hasLegalMove` needs no change: when a capture is compulsory, a capture key exists.

The UI (`useVariantGame.js`) uses exactly these functions for its move targets, so it follows automatically; the
status hint and the disabled Split / Measure buttons are U8 (section 6). The computer player uses `legalMoves`,
`splitTargets` (through `aiSplits`) and `branches`, so it follows too (T24; 300 random games on the real core, 20 of
them with the computer on one side, never produced an illegal choice).

Consequence of Q2 (en passant is legal only when every world generates it) and W4 (`applyMiss` clears the en passant
square in idle worlds) for this variant: the en passant square, the capturing pawn and the captured pawn are the same
in every world, so an en passant capture is either certain or impossible, and it never adds a world-dependent
obligation.

Without `compulsoryCapture` (the per-world `filterMoves` alone) a quiet move would stay legal as long as **one** world
has no capture, and Measure would always be allowed; section 4.1 explains why that is rejected. T10 shows the
difference.

**The 50-move counter (core item Q8, in the core).** `stateAfter` resets `quiet` only when the move really happened:
the chosen outcome captured something, or a world of it applied a move of a type in `V.quietTypes`. The default
`quietTypes` are the solid, non-royal types, which here would be {k, p}, because the antichess king is solid and not
royal. So the module **must** set `k.resetsQuiet = false`; then only pawn moves (promotions included) and captures
reset, as in lichess (`MoveOrDrop.scala`), and king moves, Missed attempts and failed captures add 1 (docs/rules.md 6;
T20, T21). Without the flag, every king move restarts the count, and while a side still has a king the 50-move draw
almost never happens.

**En passant expiry (core items Q1 + W4, in the core).** A world where a move misses used to be kept unchanged, so its
`x.ep` survived into later turns, while the rules clear `ep` after every move (docs/engine-rules.md, `ep` row). The
`applyMiss` inherited from `orthodoxSpec()` now clears the square in every idle world. In antichess a stale square is
worse than elsewhere, because en passant is a capture and captures are compulsory; T17 shows the correct behaviour
and what happens if a module overrides or deletes `applyMiss`.

---

## 4. Quantum adaptation

### 4.1 Compulsory capture over the possibilities (the key decision)

**Decision: "If you might be able to capture, you must try."** Two levels work together.

1. **In every possibility on its own** (`filterMoves`): the classical rule. Where a capture exists, only captures
   are allowed there. Any other move **misses** in that possibility.
2. **Over the whole game state** (`compulsoryCapture`): if at least one ordinary move captures in at least one
   possibility, the player **must play such a capture try**.
   - A capture try is an ordinary move whose key is a capture in some possibility, or a merge that captures in some
     possibility.
   - Quiet moves, splits and Measure are then not allowed. A merge is allowed only if it may capture.
   - The player chooses freely among the capture tries, as in chess.

Consequences (tests T10-T15, T18, T21, T23 and T24):

- **Every capture try is settled at once.** Its target holds an enemy piece in some possibility, so it is a landing
  move ("land = roll"); a merge try onto a possible enemy is rolled for the same reason. An en passant capture is
  always certain: with core items Q2 and W4 the en passant square and both pawns are the same in every possibility.
  So while a capture is compulsory, no links and no new ghosts arise, and the mover's budget cannot grow.
- **Captured / Moved / Missed.** In a possibility where the try does not capture:
  - where that possibility has **no** capture at all, the move may be an ordinary quiet move there. For example, a
    bishop lands on the empty square: **Moved**;
  - where that possibility has **another** capture, the move is not allowed there: **Missed**, and the turn is used;
  - where the piece is not there, or the path is blocked, or the move is a pawn's diagonal step onto an empty
    square: **Missed** (T10; a capture-promotion try misses the same way, and the pawn stays unpromoted, T21).
  - All three results can come out of one try (T11(c)), and a merge try follows the same rules (T18).
- **The per-possibility filter matters only for capture tries.** A capture in any possibility makes its key a capture
  try, so when no capture is compulsory no possibility has a capture, and `filterMoves` removes nothing anywhere.
  When one is compulsory, only capture tries are legal, and the filter decides Moved or Missed for them.
- **A try that may miss is a legal choice.** The obligation is to *try*; a player who would rather not capture may
  pick the capture try most likely to miss (for example a 50% ghost part instead of a certain pawn capture). The
  computer player, which wants to lose material, often does exactly that (T24). This is the quantum form of the free
  choice among captures.
- **A ghost part can force the opponent.** A part of your piece that stands where the opponent could capture it
  obliges them to try, even at 25%. In a game about giving pieces away, this makes splitting a sharp tactical tool.
  It is symmetric and visible, because the preview shows every capture try with its odds.
- **Your own ghost can force you.** If a part of your rook could capture, you must try (T15). It hits only if it is
  really there.

Why not the per-world rule alone (a variant without `compulsoryCapture`)?

- It lets a player dodge a possible capture by playing elsewhere: the move misses in the capture possibilities, and
  in those it is a free pass.
- It turns ordinary moves into ghosts "because a capture was compulsory somewhere", which is hard to explain.
- It leaves Measure as a pass whenever you hold a ghost. In antichess, a free tempo decides many endgames.

The chosen rule is one sentence for players, and it keeps the forcing character of the game.

### 4.2 Split, merge and measure

- **When no capture is possible in any possibility:** the usual quantum rules. Knights, bishops, rooks and queens
  (including promoted ones) may split, merge and be measured.
- **When a capture is possible:** no split and no Measure. A merge is allowed only if it might capture in some
  possibility (a converging capture try); a merge onto a square where the enemy stands only in possibilities that
  neither part can reach is illegal. The converging capture is certain when the usual conditions hold (T12); otherwise
  it can be Captured, Moved or Missed like any capture try (T18).

### 4.3 The king

- **Not royal:** no check, no king danger, no "cannot escape" rule. A captured king is simply a lost piece, and
  losing it is *good* for its owner. `royalDanger` returns 0 because there are no royal types, so no danger ring is
  drawn.
- **Still always solid** (decision). "Kings and pawns are always solid" is a rule players know from every other
  variant. Keeping it here needs no exception on the rules card. A king move that could turn out in several ways
  is settled by a roll, as in every variant.
- **Promotion to a king** gives an ordinary solid king (type `k`), which cannot split. A side may have several kings.

### 4.4 Winning: all pieces lost, or stalemated

Both are checked **per possibility** by `worldResult` after every move, for the side that is to move next. The
generic game-end roll then applies: if the game is over in some possibilities but not in others, a roll decides.

- **All pieces lost.** A side's pieces can only be lost by a capture, and the capture's own outcome decides it; the
  game-end roll never does. The reason: every possibility always holds **the same pieces** (only their squares
  differ). A move that may land on another piece is rolled, and splits and links need a target that is empty in every
  possibility, so a square never holds different pieces in different possibilities, and a capture outcome takes the
  same piece everywhere. (Checked on 21,539 states of 300 random games on the patched core, and again on 21,997 plies
  of 300 random games on the real core: no state had different piece sets, and every game-end roll was a stalemate
  roll.) Example: the last enemy piece is a 50/50 ghost and you capture one part (T14): 50% Captured, and the
  opponent has lost everything and wins; 50% Moved.
- **Stalemate** means no *ordinary* move in that possibility.
  - Quantum actions do not count: a Measure is not a move of the position.
  - If the opponent is stalemated in some possibilities only, the game-end roll decides (T13). With the weight of
    those possibilities, the opponent wins by stalemate; otherwise the game goes on in the remaining possibilities.
  - A miss can also produce it: if your move missed in a possibility where the opponent has no move, they win there
    (T22: that outcome is labelled Missed and carries the note of the game-end roll). As in classical antichess (not
    as in orthodox chess, where stalemate is a draw), the side to move without a move wins.
  - **The stalemated player's own ghost counts too** (decision, T19). If a part of their own piece is boxed in, they
    may have no move in that possibility only; the game-end roll then decides, and with that weight they win by
    stalemate. This is "reality decides": if the piece really stands there, they really cannot move. A state-level
    rule ("stalemate only when no quantum action is left") was rejected: a side with a ghost could then never be
    stalemated, because Measure would always be left.
  - Consequence: after the game-end roll, every possibility of the new state gives the side to move at least one
    ordinary move, so `noMoves` is only a safety net (checked in the random games).

### 4.5 Draws

- **No capture can ever happen again** (section 2.6, the full lichess rule with locked pawns): checked per
  possibility, after the win checks. In practice it holds in all possibilities or in none:
  - every possibility holds the same pieces (section 4.4);
  - a bishop's parts always stand on one square colour;
  - "locked" needs a *pawn* in front, and pawns are solid (a ghost bishop part in front of a pawn does not lock it in
    any possibility);
  - the only capture it allows is en passant, which is the same in every possibility because core items Q1 and W4
    clear stale en passant squares.

  The check stays per possibility, so the game-end roll would still settle any difference.
- **Generic draws:** 50 moves by each side without a capture or pawn move (exact with core item Q8 and
  `k.resetsQuiet = false`; see section 3), and the move limit.
- There is no repetition draw in the variants core (lichess: fivefold automatic, threefold on claim; accepted
  deviation), and no bare-kings draw: two bare kings are not a draw in antichess.

### 4.6 Everything else

Budget 8, the 4-square bound, land = roll, pass = link (whenever no capture is compulsory), the solid roll, double
steps and en passant are all unchanged. En passant follows the core decisions D2 and Q2: it is always certain, and
it is possible only on the ply right after the double step. The right expires even where that ply's move missed, and
on a Measure turn (T17).

A part that moves onto another part of the same piece joins it (docs/rules.md 2.1, core item Q14): one outcome, no
roll. That is not a capture, so it is never a capture try, and it is illegal while a capture is compulsory (T23).

---

## 5. Player-facing rules text (rules card)

Eight items, in this order; each is one `t('quantumchess', ...)` string. The shared quantum rules (split, merge,
land = roll, solid pieces, the game-end roll, budget) are shown separately and are not repeated here.

- Lose all your pieces to win. You also win if it is your turn and none of your pieces can move.
- Capturing is compulsory. If any of your moves might capture, in any possibility, you must play one of them. You
  choose which one.
- While you must capture, you cannot split or measure, and you may merge only if the merge might capture.
- Where a capture try finds nothing to take, it misses if you had another capture in that possibility; otherwise it
  counts as an ordinary move there (a pawn cannot step diagonally, so its try misses).
- The king is an ordinary piece. There is no check, kings can be captured, and losing yours does not end the game.
  Kings are still always solid.
- There is no castling. A pawn may also promote to a king.
- The game is a draw when no capture can ever happen again: only bishops and pawns are left, each side's bishops
  stand on one square colour and the two sides' colours differ, and every pawn is blocked by a pawn and stands on
  its own bishops' colour.
- If whether you can move depends on where a ghost (yours or your opponent's) really is, a roll decides whether you
  are stalemated.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, `light` / `dark` shades, labels a-h and 1-8, White at the bottom.
  cburnett sprites. There are no new glyphs; a promoted king uses the king sprite.
- **Promotion picker.** It offers five choices: Q, R, B, N and **K**. Build it from the `promo` values of the
  legal moves, so the king appears automatically. Always show it (no automatic queen), as lichess does in
  antichess, where an underpromotion is often the point of the move.
- **No danger ring and no king-safety confirmation.** There are no royal pieces.
- **"You must capture" hint** (core item U8, generic and already built in `VariantGameView.vue` and
  `useVariantGame.js` from the `mustCapture` export; the module only sets `compulsoryCapture: true`). When
  `mustCapture(V, state)` is true on a human player's turn, the status line under the board says:
  t('quantumchess', 'You must capture: only moves that might capture are allowed.')
  - Only the capture tries get move targets (automatic: the targets come from `legalMoves`).
  - The Split and Measure buttons are greyed out, with the tooltip:
    t('quantumchess', 'Not now: a capture is compulsory.') Merge stays available (a merge that might capture is
    allowed).
  - The move mode survives from turn to turn, so a player may still be in Split or Measure mode when a capture
    becomes compulsory. U8 switches the mode back to Move when the turn starts (`afterChange`), and `setMode` refuses
    Split and Measure while a capture is compulsory, so the misleading "This piece cannot split: …" never appears.
- **Piece counters** (optional, core item U6: `V.sideInfo(state, side, viewer)`). Each player row shows how many
  pieces that side has, e.g. "Pieces: 9". The count is the same in every possibility (section 4.4), so no range is
  needed. It helps players see who is close to winning.
- **Result texts** (the UI's "{side} wins ({reason})" with section 3's `reasonText`): "Black wins (it has no pieces
  left)", "White wins (it has no move left)", "Draw (bishops on opposite colours)"; the generic draws read "Draw (50
  moves without a capture or a pawn move)" and "Draw (the move limit)".

---

## 7. Test cases

Worlds are `worldFrom` placements with `x = { ep: -1, epVictim: -1, castle: [] }`. Capital letters are White and
lower case is Black. White moves unless stated otherwise. "Legal" lists every legal code (with splits) under the
`compulsoryCapture` rule. All outcomes were produced by the prototype on the real core (T5(b) and T9(c)-(f) with
the full draw rule of section 2.6, `handoff/tmp/rev1-antichess/tdraw.mjs` and `t5b.mjs`). Positions given as a FEN
board are the lichess test positions from `AntichessVariantTest.scala`.

The engine reviews re-ran every case on the module exactly as section 3 declares it: first on patched copies of the
core (`handoff/tmp/critic-antichess/anti.mjs`, `pcore/`), then, after the core packages landed, on the real core with
assertions for T1-T24 (`real.mjs`, `treal.mjs`) and random games (`tfuzz2.mjs`). Every result below is the real
core's. "p" values are exact. When a move has several outcomes, pick the outcome by its key and notes, not by its
index: the order of the game-end outcomes follows the order of the worlds (T13 and T19 list them in opposite orders).
Give every piece the same position in each world's placement object (a ghost's id is its index in `worldFrom`).

**T1. Start.**
- `newGame(V)`: `legalMoves(V, s)` has 20 moves and no `O-O`; with splits there are 22 (plus `b1-a3|c3` and
  `g1-f3|h3`).
- `x.castle` is `[]`. No result.
- `royalTypes` is empty. `solidTypes` is {k, p}. `quietTypes` is {p} (it is {k, p} without `k.resetsQuiet = false`).

**T2. Compulsory capture, classical.** From the start: `e2-e3`, `b7-b5`. White's only legal move is `f1-b5` (the
bishop reaches b5 through e2, d3 and c4).

**T3. Free choice among captures.**
- White Ra1, Nc3; Black ra8, pb5, ph7.
- Legal: exactly `a1-a8` and `c3-b5`.

**T4. The king is an ordinary piece.**
- (a) White Kd4; Black re4, ph7. Legal: only `d4-e4` (the king must capture).
- (b) Black to move. White Ka1, Ph2; Black ra4.
  - Legal: only `a4-a1`.
  - Afterwards there is no result: White lost its king but still has the pawn h2.

**T5. Promotion to a king.**
- White Pe7; Black pa5.
- Legal: `e7-e8=q`, `e7-e8=r`, `e7-e8=b`, `e7-e8=n`, `e7-e8=k`.
- After `e7-e8=k`: a White king (type `k`, not royal) stands on e8. No result.
- (b) A capture that promotes is a compulsory capture. White Pe7, Pa2; Black nd8, ph7. Legal: exactly
  `e7-d8=q`, `e7-d8=r`, `e7-d8=b`, `e7-d8=n`, `e7-d8=k` (`e7-e8` and `a2-a3` are not allowed). After `e7-d8=k`:
  White Kd8, Pa2; Black ph7; no result; `quiet` is 0.

**T6. En passant is compulsory.**
- White Pe5, Pa2; Black pd7, ph7; Black to move.
- After `d7-d5`, White's only legal move is `e5-d6` (one outcome, capture, p = 1).
- The result position is White Pd6, Pa2; Black ph7.

**T7. Losing everything wins.**
- White Ra1; Black pa7.
- Legal: only `a1-a7`. Result: `{ winner: 1, reason: 'allLost' }` (Black wins).

**T8. Stalemate wins.**
- White Ph2; Black ph3, nb8; Black to move.
- Legal: `b8-c6`, `b8-d7`, `b8-a6` and the splits `b8-a6|c6`, `b8-a6|d7`, `b8-c6|d7` (6 codes).
- After `b8-c6`, White has no move (h2 is blocked, and g3 holds nothing to capture): `{ winner: 0, reason:
  'stalemate' }`.

**T9. Draw: no capture can ever happen again.**
- (a) White Bc1 (dark); Black bc8 (light), ng5.
  - Legal: only `c1-g5` (through d2, e3 and f4). Result: `{ winner: null, reason: 'bishops' }`, because g5 is
    dark and c8 is light.
  - The same position with Black's bishop on f8 (dark) instead of c8: no result; Black then has the seven ordinary
    bishop moves from f8 (`legalMoves` without splits; the bishop's splits come on top).
- (b) Several bishops: `8/6P1/8/8/1b6/8/8/5B2`, White to move (White Bf1, Pg7; Black bb4). After `g7-g8=b`:
  `{ winner: null, reason: 'bishops' }` (White's bishops f1 and g8 are both light, Black's b4 is dark).
- (c) Locked pawns: `8/6p1/4B1P1/4p3/4P3/8/2p5/8`, Black to move (White Be6, Pg6, Pe4; Black pg7, pe5, pc2).
  Legal: exactly the five promotions `c2-c1=q`, `c2-c1=r`, `c2-c1=b`, `c2-c1=n`, `c2-c1=k`. After `c2-c1=b`:
  `{ winner: null, reason: 'bishops' }`. White's bishop and pawns are on light squares, Black's bishop and pawns on
  dark squares, and every pawn is blocked by a pawn.
- (d) Pawns on the enemy bishops' colour: `8/6p1/1B4P1/4p3/4P3/8/3p4/8`, Black to move (White Bb6, Pg6, Pe4;
  Black pg7, pe5, pd2). After `d2-d1=b`: no result (White's bishop b6 is dark, so White's pawns on light g6 and e4
  stand on the colour of Black's bishop d1).
- (e) A pawn blocked by a bishop is not locked: `8/8/4BbP1/4p3/4P3/8/8/8`, Black to move (White Be6, Pg6, Pe4;
  Black bf6, pe5). After `f6-g7`: no result (g6 is blocked by the bishop g7, not by a pawn).
- (f) En passant: White Ba1, Pd4, Pe5; Black bh1, pd7, pe6; Black to move. After `d7-d5` every pawn is blocked by
  a pawn and stands on its own bishops' colour, but White can capture en passant: no result, and White's only legal
  move is `e5-d6`.

**T10. Quantum: a capture possible in one possibility only.**
- White Pd4, Ng1; Black ka8, and a knight 50% on e5 and 50% on h5.
- `mustCapture` is true. Legal: only `d4-e5`, with outcomes Missed p = 0.5 (the knight is on h5) and Captured
  p = 0.5.
- `g1-f3` is illegal.
- (Without `compulsoryCapture`: `g1-f3` would be legal, with outcome `move`, not rolled, and the knight would become
  a ghost linked to the black knight.)

**T11. Quantum: Captured / Moved.**
- White Bc3, Ng1; Black ka8, and a knight 50% on e5 and 50% on h5.
- Legal: only `c3-e5`, with two outcomes, each p = 0.5:
  - Moved: the bishop is on e5 and the knight is 100% on h5. In that possibility White had no capture, so the quiet
    bishop move was allowed there.
  - Captured: the bishop is on e5 and Black has only the king a8.
- (b) The same, but with a White Rh1 instead of Ng1. The rook captures on h5 in the other possibility.
  - Legal: `c3-e5` and `h1-h5`, each with Missed p = 0.5 and Captured p = 0.5.
  - In the possibility where the target is empty, a capture was compulsory elsewhere, so the quiet move misses.
- (c) All three results from one try. White Bc3, Rh1; Black ka8, and a knight 50% on e5, 25% on h5 and 25% on b8
  (three worlds, relative weights 2 : 1 : 1).
  - Legal (with splits): exactly `c3-e5` and `h1-h5`.
  - `c3-e5`: Missed p = 0.25 (knight on h5: White had the capture `h1-h5` there), Moved p = 0.25 (knight on b8: no
    capture there) and Captured p = 0.5. After Moved: White Be5, Rh1; Black nb8, ka8, all 100%.
  - `h1-h5`: Missed p = 0.5, Moved p = 0.25, Captured p = 0.25.

**T12. Quantum: no split or Measure while a capture is possible; a merge onto an enemy is allowed.**
- White: a knight 50% on c3 and 50% on e3, and Pe4. Black pd5, ka8.
- Legal (with splits): exactly `c3-d5`, `e3-d5`, `e4-d5` and `c3|e3-d5`.
- `?c3` and every split are illegal (`branches` is null). `splitTargets(V, s, c3)` is `[]`, and `mergesFrom(V, s, c3)`
  is exactly `[c3|e3-d5]`.
- `c3|e3-d5` is Captured with p = 1 (a certain converging capture).
- `c3-d5` gives Missed p = 0.5 and Captured p = 0.5.
- (b) Without a capture (White: the same knight and Pa2; Black ph7, ka8): `?c3`, `c3|e3-d5` and `c3|e3-d1` are
  legal.

**T13. Quantum: stalemate decided by the game-end roll.**
- White Ph2; Black ph3, ke8, and a knight 50% on g3 and 50% on b1. Black to move, no capture available.
- `e8-d8` has two outcomes, each p = 0.5:
  - `move[end:null]`: the knight is 100% on g3, and White must capture `h2-g3` next;
  - `move[end:{"winner":0,"reason":"stalemate"}]`: the knight is 100% on b1, White has no move, and **White wins**.

**T14. Quantum: the last piece is a ghost.**
- White Bb2, Ph2; Black: only a knight, 50% on f6 and 50% on a6.
- Legal: only `b2-f6`, with two outcomes, each p = 0.5:
  - Moved: the bishop is on f6 and the knight is 100% on a6; no result;
  - Captured: Black has no pieces and **Black wins** (`allLost`).

**T15. Quantum: your own ghost forces you.**
- White: a rook 50% on a1 and 50% on h1, and Pc2. Black na8.
- Legal: only `a1-a8`, with Missed p = 0.5 and Captured p = 0.5.
- `c2-c3` is illegal. (Without the rule it would be a pawn roll: Missed 0.5 / Moved 0.5.)

**T16. A promoted king is solid.** White Kd1 (promoted earlier; type `k`) and Qa1; Black ph7. With splits, the
legal moves contain queen splits but no split from d1.

**T17. Quantum: en passant only right after the double step (core items Q1 + W4).**
- Four worlds, 25% each: White Ka1, Pd2 and a knight on g1 or b1; Black pe4 and a rook on a8 or h8 (all four
  combinations).
- `d2-d4`: one outcome, `move`, p = 1; every world has the en passant square d3.
- Black: legal exactly `e4-d3` (en passant, Captured p = 1) and `a8-a1` (Missed p = 0.5, Captured p = 0.5). Play
  `a8-a1` with the outcome Missed: the rook is on h8, and two worlds remain (knight on g1 / b1).
- White: `g1-e2` has one outcome, not rolled (pass = link: the knight moves where it stands on g1).
- Expected: after `a8-a1` Missed, `x.ep` is -1 in both worlds (the inherited `applyMiss` cleared it in the idle
  worlds). After `g1-e2`, `mustCapture` is false, `e4-d3` is illegal, and Black has 15 ordinary moves (`e4-e3` and 14
  rook moves).
- Regression check (a module that overrides or deletes `applyMiss`): the world with the knight on b1 keeps the stale
  square d3. Q2 then makes `e4-d3` illegal (not every world generates it), but `filterMoves` in that world keeps only
  that capture, so every Black move misses there: `e4-e3` is Missed 0.5 / Moved 0.5 and `h8-h7` becomes one unrolled
  `move` that leaves the rook a ghost. (Before Q1, Q2 and W4 were in the core, the late en passant `e4-d3` was
  offered, Missed 0.5 / Captured 0.5, and with Q5 alone it was even **forced**.)

**T18. Quantum: a converging capture try (merge) with Moved and Missed.**
- White: a knight 50% on c3 and 50% on e3, and Pa2. Black ka8, and a knight 50% on d5 and 50% on h5, independent of
  the White knight (four worlds, 25% each).
- `mustCapture` is true. Legal (with splits): exactly `c3-d5`, `e3-d5` and `c3|e3-d5`.
- `c3|e3-d5`: Moved p = 0.5 (the black knight is on h5; White had no capture there, so the merge was an ordinary
  move; the White knight is now 100% on d5, the black knight 100% on h5) and Captured p = 0.5 (White Nd5, Pa2;
  Black ka8).
- `c3-d5`: Missed p = 0.5, Moved p = 0.25, Captured p = 0.25.
- (b) The same plus a White Rh1, which captures on h5 in the h5 worlds.
  - Legal: exactly `c3-d5`, `e3-d5`, `h1-h5` and `c3|e3-d5`.
  - `c3|e3-d5`: Missed p = 0.5 (in the h5 worlds White had the capture `h1-h5`, so the merge misses; the White
    knight stays 50% c3 / 50% e3) and Captured p = 0.5.
  - `h1-h5`: Missed p = 0.5, Captured p = 0.5.
  - `c3|e3-d1` is illegal, and `mergesFrom(V, s, c3)` is exactly `[c3|e3-d5]`.

**T19. Quantum: stalemated by your own ghost.**
- White Pb3, Pc2, and a knight 50% on a1 and 50% on f3; Black pb4, pc3, ke8. Black to move, no capture available.
- `e8-d8` has two outcomes, each p = 0.5:
  - `move[end:{"winner":0,"reason":"stalemate"}]`: the knight is 100% on a1. Both of its targets (b3 and c2) hold
    White pawns, and those pawns are blocked and have nothing to capture, so White has no move and **White wins**;
  - `move[end:null]`: the knight is 100% on f3; White has 8 legal ordinary moves (the knight's).

**T20. The 50-move counter (core item Q8, `k.resetsQuiet = false`).**
- White Ka1, Nh1, Pc2; Black kh8, and a knight 50% on c3 and 50% on c4. `quiet` is 10. No capture is available.
- `a1-a2` gives `quiet` 11; `h1-g3` 11; `c2-c3` (Missed p = 0.5 / Moved p = 0.5) gives 11 after Missed and 0 after
  Moved. The promotions of T5 (`e7-e8=k`) and T5(b) (`e7-d8=k`) give 0.
- Without `k.resetsQuiet = false`, `a1-a2` would give 0.

**T21. Quantum: a capture-promotion try onto a ghost; a failed capture does not reset the counter.**
- White Pe7, Ph2; Black ka8, and a knight 50% on d8 and 50% on a6. `quiet` is 10.
- `mustCapture` is true. Legal (with splits): exactly `e7-d8=q`, `e7-d8=r`, `e7-d8=b`, `e7-d8=n`, `e7-d8=k`, each
  with Missed p = 0.5 and Captured p = 0.5. `e7-e8=q` and `h2-h3` are illegal.
- After `e7-d8=k` Missed: White Pe7, Ph2; Black ka8, na6 (100%); `quiet` 11 (in the a6 possibility White had no
  capture, but a pawn cannot step diagonally onto an empty square).
- After `e7-d8=k` Captured: White Kd8, Ph2; Black ka8; `quiet` 0; no result.

**T22. Quantum: a miss leaves the opponent stalemated.**
- White Pb3, and a rook 50% on a1 and 50% on h1; Black pb4 only. No capture is available.
- `a1-a3` has two outcomes, each p = 0.5 (the move itself is not rolled; the game-end roll splits it, and core item
  Q4 labels each part by its own worlds):
  - `move[end:null]`: White Ra3, Pb3; Black pb4. Black's only legal move is `b4-a3`;
  - `miss[end:{"winner":1,"reason":"stalemate"}]`: the rook stayed on h1, Black's pawn is blocked and has nothing to
    capture, so **Black wins**.
- `mightForce(V, s, 'a1-a3')` is true: the computer player sees that the Missed outcome ends the game.

**T23. Quantum: joining your own part is not a capture try.**
- White: a knight 50% on f3 and 50% on e5, and Ra1; Black na8, kh8.
- `mustCapture` is true. Legal (with splits): exactly `a1-a8`. `f3-e5` (the f3 part joining the e5 part) is illegal.
- The same with the Black knight on b8 instead of a8 (no capture anywhere): `f3-e5` has one outcome, `move`, p = 1,
  not rolled, and afterwards there is one possibility, with the knight 100% on e5.

**T24. The computer player respects the obligation.**
- The position of T12. For each level (`easy`, `normal`, `hard`) and seeds 1-5, `chooseMove(V, s, { level,
  rng: seededRng(seed) })` returns one of `c3-d5`, `e3-d5`, `e4-d5` and `c3|e3-d5` (on the current core it prefers
  `c3-d5`, the try that may miss, because it wants to lose material; the test must accept any of the four).

---

## 8. Review notes

Open questions (from the research, updated by the source review and the engine review):

1. **Core change `compulsoryCapture`** (section 3) is needed for the chosen rule. Done: Q5 is in the core (with
   `mustCapture` and the UI item U8). The alternative, the per-world rule alone, would make compulsory capture weak and
   Measure a free pass.
2. **King solid (chosen) or splittable.** Splittable would be more "ordinary piece", but it would break the
   cross-variant rule "kings and pawns are always solid".
3. **50-move counter:** done: Q8 is in the core (no reset for missed attempts). The module must still set
   `k.resetsQuiet = false`, because the default treats the solid, non-royal antichess king like a pawn (T1, T20).
4. **Draw rules.** Resolved by the source review: the full lichess rule (locked pawns included) is specified in
   section 2.6; it is a few lines per world. Repetition draws are not in the variants core (accepted deviation).
5. **UI:** done: the `mustCapture` status hint, the disabled Split / Measure buttons and the switch back to Move (U8)
   and the `sideInfo` player-row text (U6) are in the UI.
6. **Stalemate by your own ghost** (section 4.4, T19; engine review decision). It follows "reality decides". The
   alternative, stalemate only at the state level, would never stalemate a side that holds a ghost.
7. **Stale en passant square:** done: Q1 + W4 are in the core, and the module inherits `applyMiss` from
   `orthodoxSpec()`. It matters more here than elsewhere, because en passant is a compulsory capture (T17).

### 8.1 Source review

Reviewer 1 (lens: rules fidelity). Every classical rule was checked against the lichess variant page, the
scalachess source (`handoff/ext/scalachess`, commit 57d3483), Wikipedia, the ICGA rule sets and Fairy-Stockfish.
Every section 7 case was re-run on the real core (`handoff/tmp/rev1-antichess/`, a copy of the prototype with the
paths fixed, plus `tdraw.mjs` and `t5b.mjs`); all results match the text.

Confirmed without change: board, square names and colours (a1 dark, h1 light); the start position and FEN
`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1` with no castling rights; the movement of every piece;
compulsory capture with free choice, including king captures, en passant and capture-promotions; no check; no
castling; promotion to Q, R, B, N or K; the win for the side to move with no pieces or no legal move; the order
"win before draw"; T1-T8 and T10-T16.

Changes:

1. **Draw rule made exact (sections 1, 2.6, 3, 4.5, 5, 8).** The spec replaced lichess's locked-pawn rule by a
   pawnless-only rule, which declares no draw in positions lichess draws (for example T9(c)) and left them to the
   50-move rule, which the current core hardly ever triggers while kings are on the board. The rule is now the one
   in `Antichess.isInsufficientMaterial` with its four conditions, including the condition the old text did not
   state (each pawn on its own bishops' colour) and the en passant exception, with an implementation recipe.
   Sources: https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Antichess.scala,
   `InsufficientMatingMaterial.pawnBlockedByPawn`, and the lichess tests in
   https://github.com/lichess-org/scalachess/blob/master/test-kit/src/test/scala/AntichessVariantTest.scala.
2. **New tests T9(b)-(f)** from those lichess tests (several bishops, locked pawns, pawns on the enemy bishops'
   colour, a pawn blocked by a bishop) plus an en passant case; and **T5(b)**, a compulsory capture-promotion.
   All run on the real core with the new rule.
3. **Rule families corrected (section 1).** "AISE / LC3: a draw" was not supported by any source. The ICGA page
   names LC1 (International: stalemated wins, king promotion), LC2 (FICS count), LC3 (queen-only promotion,
   stalemate draws) and LC4 (the stalemated player passes); Wikipedia names International, FICS and Joint
   FICS/International. Sources: https://icga.org/icga/games/losingchess/, https://en.wikipedia.org/wiki/Losing_chess.
4. **lichess page quoted exactly, forum row removed (section 1).** The variant page itself states the free choice
   among captures, so the unverified forum thread is not needed. Added that lichess always shows the promotion
   choice (section 6: the picker is never skipped). Source: https://lichess.org/variant/antichess.
5. **Other draws stated exactly (section 2.6).** lichess: 50 moves (100 plies) without capture or pawn move is an
   automatic draw, fivefold repetition is automatic, threefold can be claimed; the half-move clock resets on pawn
   moves, captures and promotions only. Sources: scalachess `Variant.autoDraw`, `Variant.fiftyMoves`,
   `MoveOrDrop.scala` (same repository).
6. **50-move core deviation re-assessed (section 3).** The old text called it rare ("only kings shuffle"). In fact
   every king move resets the core counter, so the 50-move draw is almost never reached while a side has a king.
   The `resetsQuiet` flag is now marked as needed for fidelity. Source: `MoveOrDrop.scala` (reset rule) and
   `src/variants/core/quantum.js` `stateAfter` (checked: a king move gives `quiet = 0`).
7. **"As in chess, the side to move without a move wins" (section 4.4)** was wrong for orthodox chess (stalemate
   is a draw there); now "as in classical antichess".
8. **Small precision fixes:** promotion also by a capture, on rank 8 or rank 1, player always chooses (2.5); turn
   alternation (2.6); `spec.board.rankOf` and the note that the `orthodoxSpec` default would add castling (3);
   Fairy-Stockfish added as an independent confirmation (`giveaway_variant` / `antichess_variant` in
   `handoff/ext/Fairy-Stockfish/src/variant.cpp`, https://github.com/fairy-stockfish/Fairy-Stockfish).
9. **Sources that could not be opened:** chessvariants.org
   (https://www.chessvariants.org/diffobjective.dir/giveaway.html) and perpetualcheck.com
   (https://perpetualcheck.com/antichess/ChapterI.pdf) answered HTTP 403; they are no longer cited as evidence for
   any rule.

### 8.2 Engine review

Reviewer 2 (lens: engine and quantum consistency). The module was built exactly as section 3 declares it
(`handoff/tmp/critic-antichess/anti.mjs`) and run against three cores:

- the real `src/variants/core`;
- a copy with Q5 implemented as specified (`pcore-q5/`);
- a copy that adds the Q1 + W4 and Q8 behaviour (`pcore/`).

Every section 7 case was checked with assertions (`tverify.mjs`, `tall.mjs`, `tdraw2.mjs`). Random games checked the
fuzz invariants plus two more: under `mustCapture` every legal code may capture and every multi-outcome try is rolled,
and no possibility is left in which the side to move has no ordinary move (`tfuzz.mjs`: 60 games and 4,222 plies, 15
of the games with the computer on one side). A second probe (`tset.mjs`) ran 300 games and 21,539 states. Reviewer 1's
classical rules and corrections were not changed.

Confirmed without change: the engine mapping is implementable with the hooks as built plus the planned core items;
`orthodoxSpec({ royalKing: false, promoteTo })` gives no royal types, solid `k` / `p` and splittable `q r b n`;
`royalDanger` is 0; the promotion picker already lists all five choices (the variant UI never auto-queens); the
layout is the standard `rectTopology`; T2-T7, T9-T16 as written (T1 and T8 corrected below); the Q5 semantics of
section 3 are exactly those of `handoff/CORE-CHANGES.md` Q5; the computer player never chose an illegal move under
the rule.

Changes:

1. **Stale en passant square found and tied to core items Q1 + W4 (sections 3, 4.1, 4.6, 8; new test T17).** In
   today's core a world where a move misses keeps its old `x.ep`. Because en passant is a compulsory capture, Black
   was **forced** into an en passant three plies after the double step (reproduced on the real core and on Q5). The
   planned `applyMiss` of `orthodoxSpec()` fixes it, so section 3 now says to inherit it (never override or delete
   it). Q2 alone would not help (T17 explains why). With Q1 + W4 an en passant capture is always certain, and the
   old claim "an en passant try is rolled" in 4.1 was replaced.
2. **Quiet counter: a second deviation (sections 3, 4.5, 8; new test T20).** Besides king moves, a **Missed** pawn
   move also resets `quiet` today. docs/engine-rules.md (halfmove row) says missed attempts add 1. Both are fixed by
   the planned Q8. Section 3 now sets `k.resetsQuiet = false`.
3. **Every possibility always holds the same pieces (sections 3, 4.4, 4.5, 6).** A move that may land on another
   piece is rolled, so a square never holds different pieces in different possibilities, and a capture outcome
   removes the same piece everywhere (checked: 0 of 21,539 random states differ). Consequences written into the
   spec:
   - "all pieces lost" and the draw are never decided by the game-end roll; only stalemate is;
   - 4.5 wrongly said that a ghost bishop in front of a pawn can make it "locked in one possibility and free in
     another": "locked" needs a pawn in front, and pawns are solid;
   - the piece counter never needs a range (section 6).
4. **Stalemate by your own ghost decided (sections 4.4, 5, 8; new test T19).** Stalemate is per possibility, so a
   boxed-in part of the stalemated player's *own* ghost can win them the game through the game-end roll. The old
   text only covered the opponent's ghost (T13). This is kept as "reality decides", and the rejected state-level
   alternative is recorded.
5. **Rules card (section 5).** "No legal move" became "none of your pieces can move" (a Measure does not count, as in
   4.4). "You may merge only onto an enemy piece" became "only if the merge might capture": a merge onto a square
   where the enemy stands only in possibilities that neither part can reach is illegal. "The dice then decide" was
   dropped, because a converging capture can be certain. A new item explains Moved versus Missed for a capture try.
   The last item now names the per-possibility stalemate (the shared rules already cover the game-end roll). The
   card is now exactly 8 items.
6. **UI (section 6).** The hint and the disabled buttons are core item U8 in `VariantGameView.vue`, not a variant
   hook, and they need the `mustCapture` export (Q12). Added: the move mode persists between turns, so U8 must also
   leave Split / Measure mode or give the compulsory-capture notice. Otherwise today's "This piece cannot split: …"
   is misleading. `sideInfo` now has the planned U6 signature and a single count.
7. **Tests made exact (section 7).**
   - T1: 20 moves without splits, 22 with splits.
   - T8: the "Legal" list lacked the three knight splits, but the section's own convention is "with splits".
   - T9(a): "seven moves" means ordinary moves.
   - T12: now pins `splitTargets` and `mergesFrom`.
   - New: T11(c) (Captured, Moved and Missed from one try), T17 (en passant expiry), T18 (a merge as a capture try,
     with Moved and with Missed, and a merge that cannot capture is illegal), T19 (own-ghost stalemate) and T20
     (quiet counter, before and after Q8).
   - A note that multi-outcome cases pick their outcome by key and notes, not by index.
8. **Section 3 details.** `captureKeys` is taken from the union after Q2; rows added for the inherited `applyMiss` /
   `unifyWorlds` and for the optional `sideInfo`; the `worldResult` row notes that only its stalemate check can differ
   between worlds.

Core changes needed (all already planned in `handoff/CORE-CHANGES.md`; nothing new is requested):

- **Q5 `compulsoryCapture` + Q12 export `mustCapture`.** Exact semantics as in section 3 (identical to Q5):
  - `captureKeys` = the keys of the Q2-filtered union that capture in at least one world;
  - `mustCapture(V, state) = Boolean(V.compulsoryCapture) && !state.result && captureKeys.size > 0`;
  - when `mustCapture` is true:
    - `ordinaryMoves` keeps only `captureKeys`;
    - `splitTargets` returns `[]`;
    - `mergesFrom` keeps only the merges whose `branches` are not null;
    - `legalMoves` offers no measure;
    - `branches` returns null for a split, a measure, a move key outside `captureKeys`, and a merge none of whose
      outcomes captures.

  Verified: T10-T15, T11(c), T18, the random-game invariants, and the computer player.
- **Q1 + W4 (`applyMiss` clears `x.ep` / `x.epVictim` in every idle world, `orthodoxSpec()` supplies it).** Antichess
  inherits it. Verified with an equivalent hook: T17 as expected, and no state of the random games has differing en
  passant squares (12 did without it).
- **Q8 (`resetsQuiet`, default `solid && !royal`; reset only when the move really happened).** Antichess sets
  `k.resetsQuiet = false`. Verified: T20 as expected; T5 and T5(b) still reset.
- **Q2** (en passant certain-only): no effect on antichess once Q1 + W4 are in (the en passant move exists in every
  world or in none); it must not be relied on alone (T17).
- **UI U8** (required for the rules card to be discoverable) and **U6** (optional piece counter).

#### Second pass on the real core (after the core packages landed)

Reviewer 2 again (same lens), 2026-09-25, after Q1-Q5, Q8, Q13, Q14, W4, W5, U6, U8 and U14 of
`handoff/CORE-CHANGES.md` reached `src/variants/core` and `src/variantplay` (the core suites pass: 89 tests). The
module was rebuilt exactly as section 3 declares it, on the real core (`handoff/tmp/critic-antichess/real.mjs`), and:

- `treal.mjs` asserts every case T1-T24;
- `tfuzz2.mjs` played 300 random games (21,997 plies; splits, merges and measures included; 20 games with the
  computer on one side) and checked after every ply:
  - every world holds the same pieces and the same en passant square, and no castling rights;
  - the budget is at most 8 and there are at most 64 worlds;
  - with no result, every world gives the side to move an ordinary move, and `hasLegalMove` holds;
  - in the 9,013 states with a compulsory capture, each of the 14,688 legal codes was an ordinary move or a merge
    with a capturing outcome, and no unrolled outcome mixed results; `splitTargets` was `[]` for every piece.
  - Results: 207 all-pieces-lost, 92 stalemate and 1 bishops draw. The only game-end rolls were stalemate rolls.
- `t17noapply.mjs` shows what T17's regression check says.

Reviewer 1's classical rules and corrections were not changed. Confirmed without change:

- the mapping of section 3, with the hooks as built;
- the Q5 semantics, which match `quantum.js` line for line;
- every quantum decision of section 4 against docs/rules.md (land = roll, pass = link, solid roll, game-end roll,
  budget, world bound);
- the standard 8 × 8 layout;
- T1-T20, whose results on the real core are the "expected after the core items" results of the first pass.

Changes:

1. **"Planned" became "in the core" (sections 1, 3, 4.5, 6, 7, 8).**
   - The fallback block for a core without Q5 is removed (4.1 keeps the reasons against the per-world rule).
   - The "current core" rows of T17 and T20 are replaced by the real core's results.
   - T17's regression check is rewritten for the real core. Without the inherited `applyMiss`, Q2 now makes the stale
     en passant illegal, but `filterMoves` keeps only that capture in the stale world, so every Black move misses
     there (`t17noapply.mjs`). The earlier text said the late en passant was forced, which is no longer what happens.
2. **`k.resetsQuiet = false` is now marked required, with the evidence (sections 3, 8; T1, T20).** The core's default
   `quietTypes` for this declaration is {k, p}. T1 now pins `quietTypes` = {p}, and T20 states the value without
   the flag.
3. **Rules card item 4 was wrong for pawns (section 5).** "Your piece still moves if you had no capture in that
   possibility" contradicts T10: `d4-e5` is Missed in the h5 possibility although White has no capture there, because
   a pawn cannot step diagonally onto an empty square. It now says the try "counts as an ordinary move there (a pawn
   cannot step diagonally, so its try misses)".
4. **Result texts were ambiguous (sections 3 `reasonText`, 6).** The UI prints "{side} wins ({reason})", so "Black
   wins (all pieces lost)" reads as if White had lost them. The reasons now describe the winner: "it has no pieces
   left", "it has no move left".
5. **Two clarifications in 4.1.**
   - The per-possibility filter matters only for capture tries: when no capture is compulsory, no possibility has a
     capture, so it removes nothing.
   - The obligation is to *try*, so choosing the capture try most likely to miss is legal. The computer player, which
     wants to lose material, prefers `c3-d5` (may miss) to the certain `e4-d5` or `c3|e3-d5` in T12 (T24). This is
     intended, not a bug.
6. **A miss that stalemates the opponent (4.4; new T22).** The 4.4 bullet had no test. T22 also pins core item Q4:
   the Missed part of an unrolled move that the game-end roll splits off is labelled `miss`. It also pins
   `mightForce`: a Missed outcome can end the game.
7. **Joining your own part (4.6; new T23).** A part moving onto another part of the same piece (Q14) is never a
   capture try, so it is illegal while a capture is compulsory, and certain otherwise.
8. **New T21:** a capture-promotion try onto a ghost. It has five promotion keys, each Missed / Captured; the Missed
   pawn stays unpromoted; a failed capture adds 1 to `quiet`.
9. **New T24:** the computer player at every level returns only capture tries under the obligation.
10. **Smaller fixes:**
    - section 3 tells how to extend `orthodoxSpec()` in place;
    - `afterMove` is the inherited hook;
    - the Q5 text describes `mergesFrom` as built (filter by `branches` not null);
    - the U6 and U8 wiring as built (`panel.js` `sideInfoOf`; `afterChange` and `setMode` leave Split / Measure);
    - section 7 notes that a ghost's id is its index in each world's placement object.

Observation for the core team (no change needed): the JSDoc of `mightForce` in `src/variants/core/ai.js` says "A
Missed outcome keeps the old world, so it ends nothing". In antichess a Missed outcome can end the game (T22). The
code evaluates `worldResult` on every outcome, so it is right; only the comment is inaccurate.

Core changes needed: **none.** Every core item this spec relies on (Q1-Q5, Q8, Q14, W4, W5, U6, U8, U14) is in the
core, and T1-T24 pass on it with the module exactly as section 3 declares it.
