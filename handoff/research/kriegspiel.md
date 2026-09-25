# Variant spec: `kriegspiel` (Kriegspiel, quantum, capture the king)

Category: `uncertainty`. UI name: "Kriegspiel". Catalog summary (already in `catalog.js`): "You never see the enemy
pieces; the umpire only says what happened."

Every number in section 7 was computed with a prototype of the hooks below, run on the real variant core:

- `handoff/tools/hid/proto.mjs`: `ownOnly`, `candidateMoves`, `checkInfo`, `pawnTries`;
- `handoff/tools/hid/ai2.mjs`: `aiView`.

Implementers can copy from those files.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the egress proxy for every rules site (wikipedia.org, chessvariants.com,
w01fe.com, cs.unibo.it, chess.cs.umd.edu, berkeley.edu). The rules below come from search-engine extracts of these
pages and from prior knowledge. Where an extract and memory could not settle a detail of the *other* rule sets, the
text below says so instead of guessing.

| Source | What it gives |
|---|---|
| Wikipedia, "Kriegspiel (chess)": https://en.wikipedia.org/wiki/Kriegspiel_(chess) | Invented by Henry Michael Temple (1899). Each player sees only their own pieces; an umpire sees both. Illegal attempts are answered "No" and the player tries again. Captures and checks are announced; pawn tries can be asked for. Several rule sets exist. The most widespread are those of the Internet Chess Club (ICC), where Kriegspiel is "wild 16". |
| Chess Variant Pages, "Kriegspiel on ICC": https://www.chessvariants.com/incinf.dir/kriegspielicc.html; "Kriegspiel": https://www.chessvariants.com/incinf.dir/kriegspiel.html | On ICC the umpire gives **the number** of available pawn captures. The ICC rules are "pretty close to the Cincinnati style rules", which only say whether you have any. On ICC an illegal attempt is reported "to the mover, and nothing at all to the opponent". It distinguishes "No" (illegal because of the enemy pieces) from "Hell no" / "Nonsense" (impossible even on your own board). |
| P. Ciancarini, G. P. Favini, "The Dark Side of the Chessboard: an Assistant to Play Kriegspiel over the ICC" (http://www.cs.unibo.it/~cianca/wwwpages/chesssite/kriegspiel/interface.pdf); "A program to play Kriegspiel", ICGA Journal 30 (2007) | ICC referee messages: check by **rank, file, long diagonal, short diagonal, knight**. "Short vs long diagonal check is based on the king's location, not the checking piece." Captures give the square and whether a **pawn or a piece** was taken. Pawn tries are counted; an en passant try counts as a pawn try "but not the fact that they are en passant captures". |
| S. Russell, J. Wolfe, "Efficient belief-state AND–OR search, with application to Kriegspiel", IJCAI 2005; Berkeley Kriegspiel rules page http://w01fe.com/berkeley/kriegspiel/rules.html | Research programs are built on the ICC percepts: captures with square, check directions, pawn tries. Players keep attempting possibly legal moves until one is legal. |
| J. D. Williams, Kriegspiel rules at RAND (1950, unpublished), cited by Wikipedia | The historic "No" / "Hell no" distinction. |
| Wikipedia, "Dark chess" (for comparison) | In the related dark chess, nobody is told about check and the king is captured. |

**Chosen rule set: ICC (wild 16), adapted to capture-the-king and to the quantum layer.**

- Why ICC:
  - It is the most widespread online standard and the one research programs use.
  - Every announcement is automatic. There is no "Any?" question with its obligation to try a pawn capture, and
    such an obligation would be unfair in the quantum game, where a pawn try on a ghost can cost the turn.
  - It is the richest in information that is still fair: the pawn/piece distinction and a counted number of tries.
- The other rule sets, for the record:
  - **Traditional English club rules:** the "Any?" rule. The player may ask "Any?". After "Try!" they must attempt at
    least one pawn capture.
  - **Cincinnati:** like ICC, but says only whether pawn tries exist, not how many.
  - **RAND:** the "No" / "Hell no" distinction.
  - Some older sets announce en passant explicitly ("Black has taken en passant on f3").
  - Details beyond these could not be verified here and are not used.
- **Adaptation to capture-the-king**, as the shared quantum rules require: "There is no check in Quantum Chess".
  - Moving into or staying in danger is legal, so check-related illegal attempts disappear.
  - The umpire still announces "check", now meaning "your king could be captured by one enemy move".
  - The game ends when a king is captured.

---

## 2. Classical rules (complete)

### 2.1 Board, pieces, setup, special moves

This is orthodox chess, identical to `darkchess` sections 2.1 to 2.5:

- **Board:** 8 × 8, squares a1–h8, coordinates `[file, rank]` 0-based.
- **Pieces:**
  - K `leap` KING_STEPS;
  - Q `ride` rook + bishop directions;
  - R `ride` ROOK_DIRS;
  - B `ride` BISHOP_DIRS;
  - N `leap` KNIGHT_JUMPS;
  - P `leap [0,1]` oriented move, and `leap [±1,1]` oriented capture.
- **Setup:**
  - White: Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1, pawns a2–h2;
  - Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7–h7.
- **Special moves:** the double step from rank 2/7; en passant on the next move only; castling `O-O` (Ke1-g1 with
  Rh1-f1) and `O-O-O` (Ke1-c1 with Ra1-d1), and the same for Black on rank 8.
- **Promotion** on the last rank to Q, R, B or N.

### 2.2 The umpire's protocol (ICC, classical)

- Each player sees only their own pieces and knows the full rules. The umpire sees everything.
- **Attempts.** On their turn a player attempts moves one at a time.
  - A move that is impossible even on the player's own board ("Nonsense" / "Hell no") cannot be entered at all.
  - If the attempt is **illegal in the real position**, the umpire says "No" / "Illegal" **to the mover only**. The
    player tries again, with no limit. The opponent is told nothing.
  - The first legal attempt is played. It is binding: in effect, touch-move for legal moves.
- **After every move** the umpire announces to **both** players:
  - that the side has moved;
  - **captures:** the square, and whether a **pawn** or a **piece** was captured. The capturing piece is not named;
  - **check,** with its direction or directions:
    - **rank**, **file**;
    - **long diagonal**, **short diagonal:** of the two diagonals through the king's square, the one with more
      squares, and the one with fewer. On an 8 × 8 board they never have the same length;
    - **knight**.

    A double check gives two directions.
- **Pawn tries:** at the start of each turn the umpire announces to both players **how many** captures the player to
  move could make with pawns. An en passant capture counts, without saying so.
- **Never announced:** promotions, castling, en passant as such, and the opponent's illegal attempts.
- **End (classical):** checkmate; stalemate is a draw; the usual draws. In classical Kriegspiel, attempting to move
  into check is the most common "No".

---

## 3. Engine mapping (contract)

This is `orthodoxSpec()` plus hidden-information hooks. Nothing about movement changes.

```js
const spec = Object.assign(orthodoxSpec(), {
	id: 'kriegspiel',
	category: 'uncertainty',
	hidden: true,
	hiddenStyle: 'plain',                    // NEW optional flag: no fog shading, a normal-looking board
	umpire: true,                            // NEW optional flag: binding attempts, no odds preview, announcements
	rules: () => [...],                      // section 5
	visibility(state, side) { ... },         // own squares only
	ownView(state, side) { ... },            // NEW optional hook: the board as `side` knows it (enemy removed)
	candidateMoves(state) { ... },           // the moves the player may TRY (contract hook)
	announce(prev, code, branch, next) { },  // NEW optional hook: what the umpire says after a move
	aiView(state, side) { ... },             // what the computer may know
	evaluate(w, side) { ... },               // optional, uses x.aiCheck set by aiView
})
export default defineVariant(spec)
```

The fields in detail:

| Field | Value |
|---|---|
| `sides` | `whiteBlack()`, White first |
| `teams`, `enemies` | none / default |
| `topology` | 8 × 8 from `orthodoxSpec()` |
| `types` | `orthodoxTypes()` |
| royal | `k` |
| solid | `k`, `p` |
| splittable | `q`, `r`, `b`, `n` |
| values (centipawns) | k 400, q 900, r 500, b 330, n 320, p 100 |
| `setup`, `extraMoves`, `afterMove` | as in `orthodoxSpec()` (castling, double step, en passant, promotion) |
| `worldResult` | default: king capture (`reason: 'king'`) |
| `options` | none |
| `maxPly`, `quietPlies` | defaults 600 and 100 |

### 3.1 `visibility(state, side)`

The set of squares where a piece of `side` stands in at least one world. The board shows nothing else. Enemy pieces
are never drawn, because every enemy square is "hidden".

### 3.2 `ownView(state, side)`: the board as the player knows it

A state whose worlds are the real worlds with **every enemy piece removed**.
- `placePiece(c, id, OFF)` for each enemy piece on the board.
- `x.castle` keeps only `side`'s rights; `x.ep = x.epVictim = -1`.
- Identical worlds are merged and their weights added. `history: []`. Same `turn`, `ply` and `quiet`.

It depends only on the player's own pieces. It is used for:

- `candidateMoves` (3.3);
- the Split / Merge / Measure modes of the UI. The composable must call `splitTargets`, `mergesFrom` and
  `ownPieceAt` on `V.ownView(state, viewer)` instead of on the real state (section 6, leak checklist).

### 3.3 `candidateMoves(state)`: what the player may try

The union of:

1. `ordinaryMoves(V, ownView(state, state.turn))`: every move the player's pieces could make if the enemy pieces were
   not there. Sliders run until one of their own pieces blocks them, and castling counts when the player's own
   squares are free;
2. **pawn tries:** for every own pawn in every own-view world, `pieceMoves(V, b, id, out, { ghostEnemies: true })`.
   The core already makes a `kind: 'try'` move for each diagonal-forward square that is empty on the own board,
   including the promotion keys (`e7-d8=q`, …). That square might hold an enemy piece or allow en passant.

The result is `{ code, type: 'move', from, to, promo, drop: null }`, one entry per key.

- **Invariant:** every key of `ordinaryMoves(V, state)` on the real state is in `candidateMoves(state)`. Removing
  enemy pieces never blocks a move, and every capture key is either a quiet move or a pawn try on the own board.
- **"Nonsense" moves cannot be entered.** Examples: a knight moved like a bishop, or a move onto a square that is
  certainly yours.

### 3.4 Legality: "No" (the umpire)

- An attempt is **refused** exactly when the quantum layer finds it illegal: `branches(V, state, code) === null`.
  - For an ordinary move that means it would **miss in every possibility**.
  - For a split: a target might be occupied, no possibility has both paths clear, or the budget or 4-square bound is
    exceeded.
  - For a merge: a part cannot reach the target in any possibility, and so on.
- A refused attempt changes nothing:
  - the state is the same object;
  - no history entry, no roll memo, no ply;
  - the opponent is not told.
- The UI already shows the notice "The umpire says: that move is not possible. Try another one." for hidden variants.
- **Split and merge attempts whose failure the player can know from their own pieces** show the normal messages
  ("This piece cannot split…"), not the umpire's "No". Such failures are the budget, the 4-square bound, and a target
  that holds one of the player's own parts.
  - Rule: check the attempt on `ownView` first. If it is illegal there, show the normal message. If it is legal there
    but illegal on the real state, the umpire says "No".

### 3.5 `announce(prev, code, branch, next)`: what the umpire says

This is called once per played move, when the move is not a refused attempt. The result is stored in the history
record as `announce`.

- **Core change (small, recommended).** At the end of `stateAfter`, when `!light && V.announce`, set
  `next.history[next.history.length - 1].announce = V.announce(state, code, branch, next)`.
- **Without the core change,** the UI can compute the same object by replaying the record's move list (`replay()`
  already exists). The computer then only needs the latest announcement, which it can recompute from the current
  state.

```js
{
	captures: [{ sq: 'd5', kind: 'pawn' | 'piece' | 'king' }],  // from branch.captures
	check: null | { dirs: ['file' | 'rank' | 'long' | 'short' | 'knight', ...], p: 0.5 },
	tries: 2,                                                  // pawn tries of next.turn, 0 when the game is over
}
```

- **captures:** for each square `X` in `branch.captures` (the square the capturing piece moved to):
  - `kind` is `'king'` if the enemy king stood on `X`;
  - otherwise `'pawn'` if an enemy pawn stood on `X` in the worlds of `prev`, or if the move is an en passant capture
    (`kind === 'ep'` in a world where it was generated);
  - otherwise `'piece'`.
  - Pawns are solid, so "an enemy pawn on X" is the same in every world. The result is never uncertain.
  - Merges (converging captures) are captures too.
- **check:** only when `next.result` is null. Let `S = next.turn`.
  - For every world `b` of `next` and every move `m` of `generate(V, b, 1 − S)` with `m.capture` being `S`'s king,
    classify `m.from` relative to the king square `K = m.to`, with `dx = file(m.from) − file(K)` and
    `dy = rank(m.from) − rank(K)`:
    - `dy = 0` → `rank`;
    - `dx = 0` → `file`;
    - `|dx| = |dy|` → a diagonal:
      - the rising diagonal (`sign dx = sign dy`) has `8 − |f − r|` squares;
      - the falling diagonal has `8 − |f + r − 7|` squares, with `(f, r)` the king's 0-based coordinates;
      - the direction is `long` if its diagonal is the longer of the two, `short` otherwise;
    - anything else → `knight`.
  - A king next to the enemy king gives check too: by its step, rank / file / diagonal.
  - `dirs` is the union over all worlds, in the fixed order file, rank, long, short, knight.
  - `p = royalDanger(V, next, S)`: the largest, over single enemy moves, of the chance that the move captures the
    king. Merges are not counted, as in the core.
- **tries:** the number of distinct `(from, to)` pairs of pawn moves of `next.turn` that capture in at least one world
  of `next`. En passant counts. The four promotion keys of one capture count once.
- **Never in `announce`:** the move code, promotions, castling, whether the move was rolled, its result
  (Moved / Missed), and splits, merges or measurements as such. To the opponent, every kind of turn is "moved".

### 3.6 `aiView(state, me)`: what the computer may know

**Knowledge contract.** The computer uses exactly what a human in its seat knows:

1. its own pieces in every world, with the worlds' weights. This is its own quantum state as the board shows it;
2. every `announce` in the history: its own and the opponent's, all public;
3. its own move codes and their results;
4. the umpire's answers to its attempts. The core's `chooseMove` keeps only the view's candidates that are legal in
   the real state. That equals trying them one by one in order of preference, without drawing conclusions from the
   "No" answers, so it is fair;
5. public counters: `turn`, `ply`, `quiet`.

It must **not** read:

- any enemy piece, or which enemy piece ids are off the board. Only the pawn/piece category of its captures is
  public;
- enemy move codes;
- the enemy budget;
- enemy castling rights;
- the en passant square;
- any roll in advance.

**Construction (baseline, verified in `handoff/tools/hid/ai2.mjs`):**

1. Start from `ownView(state, me)`. All enemy pieces are gone.
2. **Phantom army.**
   - Start from the enemy's start counts per type.
   - For every capture `{ sq, kind }` announced after **me**'s moves:
     - a `pawn` capture removes one phantom pawn;
     - a `piece` capture removes one phantom piece: the type whose start square is nearest to `sq` (Chebyshev
       distance), among types still present.
   - Each enemy type has fixed **phantom slots**: its start squares in square order. For Black these are K e8; Q d8;
     R a8, h8; B c8, f8; N b8, g8; P a7…h7. The slots are appended with the same ids in every view world.
   - A slot is placed on its start square if it is still alive and that square is empty in that world. Otherwise it
     stays `OFF`.
   - **The king is always placed:** on its start square, or on the nearest empty square that is not the computer's
     own (ties to the lowest index).
3. **Recommended refinements for the Normal and Hard levels.** They use announcements only:
   - (a) **Last capture:** if the opponent's last move captured on `X`, move the placed phantom **piece** nearest to
     `X` (a pawn if no piece is left) onto `X` in every world where `X` is empty. The capturer is standing there now.
   - (b) **Check:** if the computer's king is in check, store `x.aiCheck = { k: kingSquare, dirs }` in every view world.
     `evaluate(w, side)` then subtracts **250** cp when the own king in `w` still stands on an announced line through
     `k`:
     - the same rank for `rank`;
     - the same file for `file`;
     - the same diagonal of the named length for `long` / `short`;
     - still on `k` for `knight`.
   - (c) **Pawn tries:** if the latest announcement gives the computer `tries ≥ 1`, place an extra phantom pawn on every
     diagonal-forward square of its own pawns that is empty in all view worlds. The computer then tries pawn
     captures. A wrong guess costs nothing, because the umpire says "No".
4. Merge identical worlds. The weights still sum to T. Return `{ ...state, worlds, history: [] }`.

The computer plays a naive Kriegspiel. It assumes unseen pieces are still at home, and it probes with captures. That
is intended for Easy and Normal. A real belief model can come later, as long as the no-leak test (K12) passes.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the
game-end roll, budget 8 and at most 4 squares per piece. Everything below decides how the umpire and the hidden
information combine with them.

**K-1. "No" means impossible in every possibility.**
- An attempt the quantum layer rejects gets "No". The turn is not used, nothing in the state changes, and only the
  mover is told.
- Because the state is unchanged, a "No" never measures anything. It is exactly the classical umpire's "No".
- Examples:
  - a pawn capture onto a square where no enemy piece can be in any possibility;
  - a ghost part whose path is blocked in every possibility in which it exists (test K8).

**K-2. "Possible somewhere" means played.**
- An attempt that is legal in at least one possibility is **played at once and is binding**. It follows the shared
  rules:
  - rolled if it lands where a piece might be, or if the mover is a king or pawn;
  - otherwise linked (pass = link).
- A rolled move that comes out **Missed still uses the turn**, as in every quantum variant.
- The opponent hears only "White moved".
- Rejected alternative: treat a rolled Miss like "No" and let the player try again. That would be a free measurement:
  - the roll collapses possibilities (enemy ghosts, or the player's own ghost when the part wasn't there) without
    costing the turn;
  - it would make Measure pointless and split ghosts easy to hunt.

**K-3. No odds preview.**
- The odds of a move depend on hidden enemy pieces, so the "This move is settled by a roll" box with percentages is
  **never shown** in Kriegspiel.
- The mover sees their own result afterwards (Captured / Moved / Missed), without the percentage.
- A content-free confirmation for every attempt is allowed as an optional anti-misclick setting, because it reveals
  nothing.

**K-4. Own pieces are fully visible.**
- The player always sees all parts of their own pieces with their percentages, and links among their own pieces.
- When an enemy move collapses one of their ghosts (a landing on its square, or a measurement of an enemy ghost it is
  linked to), they see the collapse. This is the quantum game's own information channel, and the rules card says so.
- Example: after a pawn try that Missed on a square where a knight was 50%, the knight's owner sees it become 100%
  on its other square (test K6).

**K-5. Captures are announced** with square and pawn/piece.
- They are certain, because a capture branch captures in all its worlds.
- A capture of the king ends the game, and the umpire says so.

**K-6. "Check" = your king could be captured next move.**
- After every move, if the side to move could lose its king to one enemy move **in at least one possibility**, the
  umpire announces "Check" to both players.
- It gives the direction or directions (file, rank, long or short diagonal, knight) and the chance `p` (the core's
  `royalDanger`).
- The chance is the quantum form of the classical announcement. A 25% check from a ghost still has to be taken
  seriously.
- There is **no** announcement when the mover leaves their own king capturable. In the classical game that is simply
  impossible, and here the opponent has to find the capture themselves.
- No warning or safety dialog before a move: it would be computed from hidden pieces.

**K-7. Pawn tries** are counted as in ICC: pawn captures possible in at least one possibility, announced for the side
to move after every move. A try on a ghost is a gamble: Captured, or Missed and the turn is gone (test K6).

**K-8. Splits, merges and measurements.**
- They can be attempted like moves.
  - A split into squares where an enemy piece might stand gets "No" (test K11).
  - A merge whose parts cannot reach the target in any possibility gets "No".
- A measurement of your own ghost is always legal.
- All of them are announced to the opponent only as "moved", plus any capture or check they cause.

**K-9. Castling, promotion and en passant**, as in the variants core:
- **Castling** is played in the worlds where the squares between king and rook are empty. The king is solid, so a
  ghost that might block the path makes castling a roll (test K13). It is never announced.
- **Promotion** is chosen before the attempt and is never announced.
- **En passant** is attempted as a pawn capture onto the empty skipped square. It counts as a pawn try and is
  announced as a pawn capture on the square the capturing pawn moved to.

**K-10. The game-end roll and the result** are public. When the game ends, the **whole board is revealed**: all
worlds, the pieces of both sides, and the full history with codes and odds.

**K-11. Budgets.** You see your own budget pips. The opponent's are replaced by "?", because their budget would say
how many ghosts they have. Your own budget never depends on hidden information you could not see: only your own
moves raise it.

**K-12. Pass & play hand-over.** The same as `darkchess` D-11, in two steps:
1. **Your result.** The mover sees their own board after the move: Captured / Moved / Missed, and the announcements
   their move caused ("Check: file", "Capture on d5: a pawn"). Then they press "Pass the device".
2. **Curtain.** "Pass the device to Black." Then "I am Black: show my board". The next player sees their board and the
   **umpire box** with everything announced since their own last move.

**K-13. Undo** is disabled while the game runs. It would reveal the other side's board in pass & play, and it would
turn "No" answers and rolls into free information against the computer.

**K-14. Draws.** The shared rules apply: 50 moves by each side without a capture or pawn move, the 600-ply limit,
and no legal move. Refused attempts are not moves and do not count.

---

## 5. Player-facing rules text (rules card)

1. You see only your own pieces. The umpire knows where everything is.
2. Try any move. If it is impossible in every possibility, the umpire says "No": try again. Your turn is not used and
   your opponent is not told.
3. A move that is possible in at least one possibility is played at once, with a roll if needed. If it misses, your
   turn is still used.
4. After every move both players hear: a move was made, every capture (its square, and whether a pawn or a piece was
   taken), and "check" with its direction (file, rank, long or short diagonal, knight) and the chance that the king
   can be captured.
5. At the start of your turn the umpire says how many pawn captures you could try.
6. You win by capturing the king. Promotions and castling are never announced.
7. If one of your ghosts suddenly becomes solid, the enemy did something to the piece it was linked to.
8. In pass & play, hand the device over when asked. The whole board is revealed when the game ends.

---

## 6. UI layout

- **Board:** the standard 8 × 8 layout: light and dark squares, files `a`–`h`, ranks `1`–`8`, and the cburnett
  sprites.
  - `hiddenStyle: 'plain'`: **no fog shading.** The board looks like a normal chessboard that holds only your pieces.
    `VariantBoard` should skip the `qc-vboard__cell--fog` class when the variant's `hiddenStyle` is `'plain'`.
  - Accessible names stay "e5: hidden" for squares without your pieces.
  - In pass & play the board turns towards the side to move (already built).
- **Move targets:** the dots come from `candidateMoves`, so the player sees everything they may **try**, including the
  pawn tries.
- **Umpire box** (new, above the move list):
  - "Black moved."
  - "Capture on d5: a pawn." / "Capture on d5: a piece." / "The king on e8 is captured."
  - "Check: file, knight (100 %)." The chance is always shown with its number.
  - "Pawn tries: 2." / "No pawn tries."
  - After a refused attempt, the existing notice text and a line "Refused this turn: e2-e4, d1-d5". It is cleared when
    the turn ends.
- **Status line:** the check announcement replaces "Your king is in danger". There is no separate danger ring or
  safety dialog.
- **Move history during the game:**
  - own rows show the code and the result (Moved / Missed / Captured) **without** a percentage;
  - opponent rows show "Moved";
  - both show the announcements.
- **Rolls:**
  - no pending-outcomes box (K-3);
  - the "Roll" box of an own move shows the result without the percentage;
  - the opponent's roll box stays hidden (already built: `hideLast`).
- **Budget pips:** your own; "?" for the opponent.
- **Hand-over:** two steps (K-12).
- **Undo** is disabled until the game ends.
- **After the game:** reveal everything (already built: `hidden` is null once `state.result` is set). History rows
  show codes and odds.
- **Optional, later:** "pencil" markers. Grey enemy piece icons the player can drop on empty squares as notes, stored
  per side in the local game record, with no effect on the game. Over-the-board Kriegspiel players keep such a board.

**Leak checklist for the UI** (to verify when implementing):

- `attempt()` in `useVariantGame.js` opens the pending box when `outs.length > 1`. With `V.umpire`, it must play at
  once.
- `pieceAt(sq)` reads the first world's occupant, whatever its side. In hidden variants it must use
  `ownPieceAt(V.ownView(state, viewer), sq)`.
- `clickSplit` / `clickMerge` / `marks` call `splitTargets` / `mergesFrom` on the real state. They must use
  `V.ownView(state, viewer)`.
- The measure mode's `legalMoves(Vv, s)` check reveals whether an enemy might share a part's square. Build the
  measure code from any part `ownPieceAt(real)` accepts. If none is accepted, the umpire says "No".
- `lastRoll` and `historyRows` must drop the percentage and the notes of own moves when `V.umpire`.
- `danger` must be replaced by `announce.check` for display.
- The opponent's budget must not be rendered.

---

## 7. Test cases

Positions use `worldFrom` placements (`'0:k'` is a White king, `'1:n'` a Black knight). A state with several worlds
lists the same pieces in the same order in every world. Worlds have `x = { ep: -1, epVictim: -1, castle: [] }`
unless castling rights are given. "`announce`" means the object stored on the new history record (3.5). "No" means
`branches(...) === null`, with the state unchanged.

**K1. Start: what White may try.** `newGame`:
- `candidateMoves` has **34** entries: the 20 legal moves plus 14 pawn tries (a2-b3, b2-a3, b2-c3, c2-b3, c2-d3,
  d2-c3, d2-e3, e2-d3, e2-f3, f2-e3, f2-g3, g2-f3, g2-h3, h2-g3).
- All 14 tries are "No".
- Pawn tries = 0.
- `visibility(s,0)` = the 16 squares of rank 1–2.

**K2. A hidden blocker gives "No".** One world `{ e1:'0:k', e2:'0:p', e8:'1:k', e3:'1:n' }`, White to move.
- `candidateMoves` = {e1-f1, e1-d1, e1-f2, e1-d2, e2-e3, e2-e4, e2-f3, e2-d3}.
- `e2-e4`, `e2-e3`, `e2-d3` and `e2-f3` are all "No".
  - After each, the state is the same object, `history.length` is 0 and `turn` is 0.
- `e1-d1` is legal: 1 outcome, `move`.
- Pawn tries = 0.

**K3. Capture announcement and a long-diagonal check.** One world `{ e1:'0:k', d1:'0:q', e8:'1:k', d7:'1:p' }`,
White to move.
- `d1-d7` has 1 outcome, `capture`.
- `announce` = `{ captures: [{ sq: 'd7', kind: 'pawn' }], check: { dirs: ['long'], p: 1 }, tries: 0 }`. For the king
  on e8, the diagonal a4–e8 has 5 squares and e8–h5 has 4.
- Then Black plays `e8-d7`: `announce` = `{ captures: [{ sq: 'd7', kind: 'piece' }], check: null, tries: 0 }`.

**K4. Check directions.** Black to move in each, one world:

| Position | `check` |
|---|---|
| `{ a1:'0:k', e1:'0:r', f6:'0:n', e8:'1:k' }` | `{ dirs: ['file', 'knight'], p: 1 }` |
| `{ a1:'0:k', h5:'0:b', e8:'1:k' }` | `['short']` |
| `{ a1:'0:k', a4:'0:b', e8:'1:k' }` | `['long']` |
| `{ a1:'0:k', h8:'0:r', d7:'0:p', e8:'1:k' }` | `['rank', 'long']` (a pawn check is a diagonal check) |
| `{ e7:'0:k', e8:'1:k' }` | `['file']` |
| `{ d7:'0:k', e8:'1:k' }` | `['long']` (kings give check too) |

**K5. Pawn tries.**
- One world `{ e1:'0:k', e4:'0:p', d4:'0:p', g7:'0:p', e8:'1:k', d5:'1:p', f5:'1:n', h8:'1:r' }`, White to move:
  - pawn tries = **3**: e4-d5, e4-f5, g7-h8. g7-h8 has four promotion keys and counts once.
  - The d4 pawn has no move.
- En passant: one world `{ e1:'0:k', e5:'0:p', e8:'1:k', d7:'1:p' }`, Black to move.
  - Black plays `d7-d5`: `announce.tries` = **1** and `check` = null.
  - `e5-d6` is then legal: capture, `kind: 'pawn'`.

**K6. Quantum: a pawn try on a ghost.** Two worlds 1:1:
- A = `{ e1:'0:k', e4:'0:p', e8:'1:k', d5:'1:n' }`;
- B = `{ e1:'0:k', e4:'0:p', e8:'1:k', b6:'1:n' }`.

White to move.
- Pawn tries = 1.
- `e4-f5` is "No".
- `e4-d5` is played: outcomes `[miss 0.5, capture 0.5]`.
  - **Captured:** `announce.captures` = `[{ sq: 'd5', kind: 'piece' }]`.
  - **Missed:**
    - the turn passes to Black (`turn` 1, history key `miss`);
    - the pawn is 100% on e4 and the knight 100% on b6;
    - `announce` = `{ captures: [], check: null, tries: 0 }`;
    - Black's view shows its own knight become solid on b6 (K-4).

**K7. Quantum: sliding past a hidden ghost links, and gives a 50% check.** Two worlds 1:1:
- A = `{ h1:'0:k', a1:'0:r', e8:'1:k', a4:'1:n' }`;
- B = `{ h1:'0:k', a1:'0:r', e8:'1:k', c4:'1:n' }`.

White to move.
- `a1-a8` has 1 outcome, `move`, not rolled.
- The rook is a1 50% / a8 50%. White sees its own rook as a ghost.
- `announce` = `{ captures: [], check: { dirs: ['rank'], p: 0.5 }, tries: 0 }`.

**K8. Quantum: a ghost part blocked in every possibility.** Two worlds 1:1:
- A = `{ e1:'0:k', d1:'0:q', d2:'1:n', e8:'1:k' }`;
- B = `{ e1:'0:k', d3:'0:q', d2:'1:n', e8:'1:k' }`.

White to move.
- `d1-d5` is a candidate but "No": blocked in A, and no queen on d1 in B.
- `d3-d5` is legal: 1 outcome, `move`.
- `d1-d2` is legal: `[miss 0.5, capture 0.5]`.

**K9. Quantum: the game-end roll.** Two worlds 1:1:
- A = `{ e1:'0:k', a4:'0:q', e8:'1:k' }`;
- B = `{ e1:'0:k', h4:'0:q', e8:'1:k' }`.

White to move.
- `a4-e8` gives `[miss 0.5, capture 0.5]`.
  - capture → `result = { winner: 0, reason: 'king' }`, `announce.captures = [{ sq: 'e8', kind: 'king' }]`, and the
    board is revealed;
  - miss → the queen is 100% on h4.
- The same position with Black to move has `check = { dirs: ['long'], p: 0.5 }`.

**K10. Quantum: a converging capture of an unseen king.**
- Two worlds 1:1, A = `{ e1:'0:k', a4:'0:q', e8:'1:k' }` and B = `{ e1:'0:k', h5:'0:q', e8:'1:k' }`, White to move:
  - the merge `a4|h5-e8` has 1 outcome, `capture`, for certain: White wins.
- The same with the Black king on g8 (in both worlds):
  - `a4|h5-e8` has 1 outcome, `move`;
  - the queen is solid on e8;
  - `announce.check` = `{ dirs: ['rank'], p: 1 }`.

**K11. Split attempts.** One world `{ e1:'0:k', g1:'0:n', e8:'1:k', f3:'1:b' }`, White to move.
- `splitTargets(V, ownView(s,0), g1)` = {e2, f3, h3}. The real state would give {e2, h3}, which must **not** be shown.
- The split `g1-f3|h3` is legal on the own view but "No" from the umpire.
- `g1-e2|h3` is legal (a split).

**K12. The computer does not peek (no-leak test).** From the start, play `e2-e4`. Then, in state A, Black plays
`a7-a5`; in state B, Black plays `h7-h5`.
- `candidateMoves(A)` equals `candidateMoves(B)`: 44 entries, 30 moves and 14 tries.
- `aiView(A,0)` and `aiView(B,0)` are deep-equal: the same worlds and weights after sorting by `worldKey`.
- In every view world:
  - the weights sum to T;
  - there is exactly one Black king;
  - all of White's pieces stand as in reality.

**K13. Castling attempts.** White's right is `{ flag:'K', side:0, king:e1, rook:h1, kingTo:g1, rookTo:f1 }`.
- One world `{ e1:'0:k', h1:'0:r', e8:'1:k', f1:'1:b' }`: `O-O` is a candidate and "No".
- Two worlds 1:1, with the bishop on f1 in A and on c4 in B: `O-O` gives `[miss 0.5, move 0.5]`. It is rolled because
  the king is solid.
- `announce` has no mention of castling.

**K14. Promotion attempts.** One world `{ a1:'0:k', e7:'0:p', h1:'1:k', e8:'1:r', d8:'1:n' }`, White to move.
- The candidates from e7 are the 12 keys `e7-e8=q|r|b|n`, `e7-f8=…` and `e7-d8=…`.
- Pawn tries = 1.
- `e7-e8=q` and `e7-f8=q` are "No".
- `e7-d8=q` has 1 outcome, `capture`, with `announce.captures = [{ sq: 'd8', kind: 'piece' }]`. The promotion is not
  mentioned.

**K15. Random games (fuzz).** `fuzz.spec.js` covers kriegspiel automatically. Add a Kriegspiel fuzz that draws random
**candidate** moves:
- on "No", it asserts that the state is unchanged and draws again;
- after every move it asserts that `ordinaryMoves(real)` ⊆ `candidateMoves` (3.3);
- it asserts that `visibility` contains exactly the own squares;
- it asserts that `aiView` sums to T with one enemy king per world;
- it asserts that `announce.tries` equals the number of distinct pawn-capture `(from, to)` pairs.
