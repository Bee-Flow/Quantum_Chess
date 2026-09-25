# Variant spec: `antichess` (Antichess, also called Losing chess)

Category: `rules`. UI name: "Antichess". Summary line (already in `catalog.js`): "Capturing is compulsory and
whoever loses all their pieces wins."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for lichess.org, wikipedia.org, chess.com and pychess.org.
The **lichess source code** could be read: the rules below were checked against the scalachess implementation
(raw.githubusercontent.com, saved in `handoff/ext/scalachess/`). The other sources come from search-engine
extracts. Every test case in section 7 was run on a prototype built on the real `src/variants/core`
(`handoff/exp/anti/proto.mjs`, `tanti.mjs`).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/antichess ("Lose all your pieces (or get stalemated) to win the game.") | Capturing is forced; with several captures you choose. The king has no royal power: it can be captured, there is no check or checkmate, and no castling. A pawn may also promote to a king. You win by losing all your pieces or by being stalemated. |
| scalachess `core/src/main/scala/variant/Antichess.scala` (https://github.com/lichess-org/scalachess) | The exact implementation. `validMoves`: if any capture exists (king captures, en passant and all other captures), only captures are legal. `castles = Castles.none`. `promotableRoles = Q, R, B, N, K`. `specialEnd`: the side to move has no pieces **or** no legal move, and then `winner` is the side to move. `isInsufficientMaterial` (auto-draw): only bishops and locked pawns remain, and each side's bishops stand on one square colour, opposite to the other side's. |
| scalachess `Variant.scala`, `Position.scala` | `autoDraw` = insufficient material, 50 moves, fivefold repetition. En passant is a capture, so it is compulsory (`isLegalEnPassant` is always true in antichess). |
| Wikipedia, "Losing chess" (https://en.wikipedia.org/wiki/Losing_chess); chessvariants.org, "Losing Chess" (https://www.chessvariants.org/diffobjective.dir/giveaway.html); ICGA "Losing Chess"; perpetualcheck.com, "Antichess, chapter I" | The same core rules and the rule families. The families differ mainly on **stalemate**. **International rules** (used by lichess): the stalemated player wins. **FICS**: the player with fewer pieces wins, and equal counts are a draw. **AISE / LC3**: a draw. Some rule sets restrict promotion (LC3: queens only). |
| lichess forum, "Antichess rules?" | Players confirm the lichess reading: you must capture when you can, but you may choose which capture. |

**Chosen rule set: lichess Antichess (the International rules).**

- Capturing is compulsory, and the player chooses among the captures.
- The king is an ordinary piece.
- There is no castling.
- A pawn may promote to a king.
- You win by losing all your pieces or by being stalemated.
- Draw: the lichess opposite-coloured-bishops rule, simplified (section 2.6), plus the generic draws.

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
- **Promotion:** a pawn that reaches the last rank must promote to a queen, rook, bishop, knight **or king**. A
  promoted king is an ordinary king (not royal), and a side may have several kings.

### 2.6 Win, draw and turn order (classical, lichess)

- **Win.** The side to move wins if:
  - it has **no pieces left**, or
  - it has **no legal move** (stalemate).
- **Draw.**
  - **Opposite-coloured bishops.** Every piece left on the board is a bishop, all of White's bishops stand on one
    square colour, and all of Black's stand on the other. Then neither side can ever capture, so the game is drawn.
  - lichess also counts pawns that are locked by pawns and can never touch the enemy bishops' colour. **Simplified
    here:** the rule applies only when no pawns are left. Locked-pawn positions end by the 50-move rule instead.
  - Also the 50-move rule and repetition, as in chess. The quantum game has only the generic draws; see section 3.
- White moves first. There are no other turn rules.

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec({ royalKing: false, promoteTo: ['q', 'r', 'b', 'n', 'k'] })`.

| Field | Value |
|---|---|
| `id`, `category` | `'antichess'`, `'rules'` |
| `sides` | `whiteBlack()`. No teams, default `enemies`. |
| `topology` | `standardBoard(8, 8).topology` |
| `types` | orthodox, with `k.royal = false`. **royal: none.** **solid: `k`, `p`** (orthodoxTypes already sets `solid: true` on the king). **splittable: `q`, `r`, `b`, `n`**. The promotion choices of `p` are `['q', 'r', 'b', 'n', 'k']`. |
| values | **100 for every type** (lichess's own material count, `materialImbalance`, counts every piece the same), and `materialSign: -1`, so the computer wants to *lose* material. |
| `setup()` | `standardSetup(spec, 'rnbqkbnr', { castling: false })`. This gives `x = { ep: -1, epVictim: -1, castle: [] }`. |
| `extraMoves(w, side)` | `pawnExtras(spec, w, side, (s, sq) => rankOf(sq) === (s === 0 ? 1 : 6))` only: double steps and en passant, **no castling**. |
| `filterMoves(w, side, list)` | `list.some((m) => m.capture >= 0) ? list.filter((m) => m.capture >= 0) : list`. This is the classical compulsory capture, applied in every world on its own. |
| `compulsoryCapture: true` | The state-level obligation of section 4.1. **This needs a small core change**; see below. |
| `afterMove(next, m)` | `orthodoxAfterMove(spec, next, m)`. Promotion is done by the core. |
| `worldResult(w, mover)` | `next = 1 - mover`. In this order: (1) `next` has no piece on the board: `{ winner: next, reason: 'allLost' }`. (2) `mover` has no piece on the board (cannot happen in antichess; kept for safety): `{ winner: mover, reason: 'allLost' }`. (3) `generate(V, w, next).size === 0`: `{ winner: next, reason: 'stalemate' }`. (4) Every piece on the board is a bishop, White's bishops all stand on one square colour and Black's all on the other: `{ winner: null, reason: 'bishops' }`. (5) Otherwise `null`. **Do not use the default** `worldResult`. |
| `noMoves(state)` | `{ winner: state.turn, reason: 'stalemate' }`. Only a safety net: the stalemate check in `worldResult` normally ends the game first. |
| `reasonText(reason)` | `'allLost'` → t('quantumchess', 'all pieces lost'); `'stalemate'` → t('quantumchess', 'stalemate'); `'bishops'` → t('quantumchess', 'bishops on opposite colours'). |
| `evaluate`, `visibility`, `options` | none |
| `rules()` | section 5 |

**Required core change: `compulsoryCapture` (generic, about 25 lines in `quantum.js`).** The per-world
`filterMoves` alone cannot express the state-level obligation of section 4.1: `generate` sees only one world, and
it is cached per world. Proposed implementation:

- In `table(V, state)`, also collect `captureKeys`: the keys that are a capture (`m.capture >= 0`) in at least one
  world.
- New export `mustCapture(V, state)`:
  `Boolean(V.compulsoryCapture) && !state.result && table(V, state).captureKeys.size > 0`.
- `ordinaryMoves`: when `mustCapture`, skip the keys that are not in `captureKeys`.
- `splitTargets`: when `mustCapture`, return `[]`.
- `mergesFrom`: when `mustCapture`, keep only the merges whose `branches` contain a capture
  (`list.some((b) => b.captures.length > 0)`).
- `legalMoves`: when `mustCapture`, do not offer the measurement.
- `branches(V, state, code)`: when `mustCapture`, return `null` for:
  - a split;
  - a measure;
  - an ordinary move whose key is not in `captureKeys`;
  - a merge without a capturing branch.
- `hasLegalMove` needs no change: when a capture is compulsory, a capture key exists.

The UI (`useVariantGame.js`) uses exactly these functions, so it follows automatically. The computer player uses
`legalMoves`, `splitsFrom` and `branches`, so it follows too. The prototype emulates the rule on top of the core
(`branchesC` / `legalC` in `proto.mjs`).

**Fallback without the core change.** If the core is not changed, the variant still runs with the per-world
`filterMoves` alone, but then:

- a quiet move stays legal as long as **one** world has no capture. It misses in the worlds that do, and a
  non-solid piece becomes a linked ghost there (test T10 shows the core result);
- Measure is always allowed, even when a capture is certain.

The rules text would then have to say "in every possibility where you can capture, your move must capture there;
elsewhere it misses", and compulsory capture becomes much weaker. **Not recommended.**

**Known core deviation: the 50-move counter.** `stateAfter` resets `quiet` after a move of a solid, non-royal
type. That is meant for pawns. The antichess king is solid and non-royal, so king moves reset the counter too
(checked: a king move gives `quiet = 0`). lichess resets only on captures and pawn moves.

- Effect: games in which only kings shuffle end at the move limit (600 plies) instead of after 50 moves. This is
  rare, because two bare kings must soon capture each other.
- Proposed generic fix: a per-type flag `resetsQuiet` (default `solid && !royal`); antichess sets it to `false` on
  `k`.
- If the core is not changed, accept the deviation.

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

Consequences (tests T10-T15):

- **Every capture try is settled at once.** Its target holds an enemy piece in some possibility, so it is a landing
  move ("land = roll"). An en passant try is rolled because the pawn is solid. So while a capture is compulsory, no
  links and no new ghosts arise.
- **Captured / Moved / Missed.** In a possibility where the try does not capture:
  - where that possibility has **no** capture at all, the move may be an ordinary quiet move there. For example, a
    bishop lands on the empty square: **Moved**;
  - where that possibility has **another** capture, the move is not allowed there: **Missed**, and the turn is used;
  - where the piece is not there, or the path is blocked, or the move is a pawn's diagonal step onto an empty
    square: **Missed**.
- **A ghost part can force the opponent.** A part of your piece that stands where the opponent could capture it
  obliges them to try, even at 25%. In a game about giving pieces away, this makes splitting a sharp tactical tool.
  It is symmetric and visible, because the preview shows every capture try with its odds.
- **Your own ghost can force you.** If a part of your rook could capture, you must try (T15). It hits only if it is
  really there.

Why not the per-world rule alone (the fallback in section 3)?

- It lets a player dodge a possible capture by playing elsewhere: the move misses in the capture possibilities, and
  in those it is a free pass.
- It turns ordinary moves into ghosts "because a capture was compulsory somewhere", which is hard to explain.
- It leaves Measure as a pass whenever you hold a ghost. In antichess, a free tempo decides many endgames.

The chosen rule is one sentence for players, and it keeps the forcing character of the game.

### 4.2 Split, merge and measure

- **When no capture is possible in any possibility:** the usual quantum rules. Knights, bishops, rooks and queens
  (including promoted ones) may split, merge and be measured.
- **When a capture is possible:** no split and no Measure. A merge only onto a square where it may capture (a
  converging capture). The converging capture is certain when the usual conditions hold (T12).

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

- **All pieces lost.** A side's pieces can only be lost by a capture, and a capture is always a landing roll. So in
  practice the capture roll itself decides. Example: the last enemy piece is a 50/50 ghost and you capture one part
  (T14): 50% Captured, and the opponent has lost everything and wins; 50% Moved.
- **Stalemate** means no *ordinary* move in that possibility.
  - Quantum actions do not count: a Measure is not a move of the position.
  - If the opponent is stalemated in some possibilities only, the game-end roll decides (T13). With the weight of
    those possibilities, the opponent wins by stalemate; otherwise the game goes on in the remaining possibilities.
  - A miss can also produce it: if your move missed in a possibility where the opponent has no move, they win there.
    As in chess, the side to move without a move wins.

### 4.5 Draws

- **Opposite-coloured bishops** (section 2.6, pawnless form): checked per possibility, so the game-end roll decides
  when it holds in some possibilities only. A ghost bishop's parts always stand on the same square colour, so a
  bishop can never be "maybe light, maybe dark".
- **Generic draws:** 50 moves by each side without a capture or pawn move (see the core deviation in section 3),
  and the move limit.
- There is no repetition draw in the variants core, and no bare-kings draw: two bare kings are not a draw in
  antichess.

### 4.6 Everything else

Budget 8, the 4-square bound, land = roll, pass = link (whenever no capture is compulsory), the solid roll, double
steps and en passant are all unchanged.

---

## 5. Player-facing rules text (rules card)

- Lose all your pieces to win. You also win if it is your turn and you have no legal move.
- Capturing is compulsory. If any of your moves might capture, in any possibility, you must play one of them. You
  choose which one.
- While you must capture, you cannot split or measure, and you may merge only onto an enemy piece. The dice then
  decide whether your capture happened.
- The king is an ordinary piece. There is no check, kings can be captured, and losing yours does not end the game.
  Kings are still always solid.
- There is no castling. A pawn may also promote to a king.
- If only bishops are left and each side's bishops stand on squares of a different colour, the game is a draw.
- If a move might have left your opponent with no pieces or no legal move, a roll decides whether the game is over.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, `light` / `dark` shades, labels a-h and 1-8, White at the bottom.
  cburnett sprites. There are no new glyphs; a promoted king uses the king sprite.
- **Promotion picker.** It offers five choices: Q, R, B, N and **K**. Build it from the `promo` values of the
  legal moves, so the king appears automatically.
- **No danger ring and no king-safety confirmation.** There are no royal pieces.
- **"You must capture" hint.** When `mustCapture(V, state)` is true, the status line under the board says:
  t('quantumchess', 'You must capture: only moves that might capture are allowed.')
  - Only the capture tries get move targets.
  - The Split and Measure buttons are greyed out, with the tooltip:
    t('quantumchess', 'Not now: a capture is compulsory.')
- **Piece counters** (optional, via the generic `V.sideInfo(state, side)` hook proposed in the three-check spec).
  Each player row shows how many pieces that side has, e.g. "Pieces: 9".
  - When the count differs between possibilities, show the range with the chance of the lower value, e.g.
    "Pieces: 8–9". This way colour is never the only clue.
  - It helps players see who is close to winning.
- **Result texts:** "White wins (all pieces lost)", "Black wins (stalemate)", "Draw (bishops on opposite colours)".

---

## 7. Test cases

Worlds are `worldFrom` placements with `x = { ep: -1, epVictim: -1, castle: [] }`. Capital letters are White and
lower case is Black. White moves unless stated otherwise. "Legal" lists every legal code (with splits) under the
`compulsoryCapture` rule. All outcomes were produced by the prototype on the real core.

**T1. Start.**
- `newGame(V)` has 20 legal moves and no `O-O`.
- `x.castle` is `[]`. No result.
- `royalTypes` is empty. `solidTypes` is {k, p}.

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

**T6. En passant is compulsory.**
- White Pe5, Pa2; Black pd7, ph7; Black to move.
- After `d7-d5`, White's only legal move is `e5-d6` (one outcome, capture, p = 1).
- The result position is White Pd6, Pa2; Black ph7.

**T7. Losing everything wins.**
- White Ra1; Black pa7.
- Legal: only `a1-a7`. Result: `{ winner: 1, reason: 'allLost' }` (Black wins).

**T8. Stalemate wins.**
- White Ph2; Black ph3, nb8; Black to move.
- Legal: `b8-c6`, `b8-d7`, `b8-a6`.
- After `b8-c6`, White has no move (h2 is blocked, and g3 holds nothing to capture): `{ winner: 0, reason:
  'stalemate' }`.

**T9. Opposite-coloured bishops draw.**
- White Bc1 (dark); Black bc8 (light), ng5.
- Legal: only `c1-g5` (through d2, e3 and f4). Result: `{ winner: null, reason: 'bishops' }`, because g5 is dark
  and c8 is light.
- The same position with Black's bishop on f8 (dark) instead of c8: no result.

**T10. Quantum: a capture possible in one possibility only.**
- White Pd4, Ng1; Black ka8, and a knight 50% on e5 and 50% on h5.
- `mustCapture` is true. Legal: only `d4-e5`, with outcomes Missed p = 0.5 (the knight is on h5) and Captured
  p = 0.5.
- `g1-f3` is illegal.
- (Core without the rule: `g1-f3` would be legal, with outcome `move`, not rolled, and the knight would become a
  ghost linked to the black knight.)

**T11. Quantum: Captured / Moved.**
- White Bc3, Ng1; Black ka8, and a knight 50% on e5 and 50% on h5.
- Legal: only `c3-e5`, with two outcomes, each p = 0.5:
  - Moved: the bishop is on e5 and the knight is 100% on h5. In that possibility White had no capture, so the quiet
    bishop move was allowed there.
  - Captured: the bishop is on e5 and Black has only the king a8.
- (b) The same, but with a White Rh1 instead of Ng1. The rook captures on h5 in the other possibility.
  - Legal: `c3-e5` and `h1-h5`, each with Missed p = 0.5 and Captured p = 0.5.
  - In the possibility where the target is empty, a capture was compulsory elsewhere, so the quiet move misses.

**T12. Quantum: no split or Measure while a capture is possible; a merge onto an enemy is allowed.**
- White: a knight 50% on c3 and 50% on e3, and Pe4. Black pd5, ka8.
- Legal (with splits): exactly `c3-d5`, `e3-d5`, `e4-d5` and `c3|e3-d5`.
- `?c3` and every split are illegal.
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

---

## 8. Open questions

1. **Core change `compulsoryCapture`** (section 3) is needed for the chosen rule. The alternative is the per-world
   rule alone. It needs no core change, but compulsory capture becomes weak and Measure becomes a free pass.
2. **King solid (chosen) or splittable.** Splittable would be more "ordinary piece", but it would break the
   cross-variant rule "kings and pawns are always solid".
3. **50-move counter:** with the current core, moves of the (solid, non-royal) antichess king reset it. Proposed
   core flag: `resetsQuiet`.
4. **Draw rules.** Only the pawnless opposite-bishops draw is implemented. lichess's locked-pawn extension is
   left to the 50-move rule.
5. **Optional UI hooks:** `mustCapture` in the status line, and `sideInfo` piece counters.
