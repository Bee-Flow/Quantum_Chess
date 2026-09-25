# Variant spec: `kriegspiel` (Kriegspiel, quantum, capture the king)

Category: `uncertainty`. UI name: "Kriegspiel". Catalog summary (already in `catalog.js`): "You never see the enemy
pieces; the umpire only says what happened."

Every number in section 7 was computed with a prototype of the hooks below, run on the real variant core:

- `handoff/tools/hid/proto.mjs`: `ownOnly`, `candidateMoves`, `checkInfo`, `pawnTries`;
- `handoff/tools/hid/ai2.mjs`: `aiView`.

Implementers can copy from those files. Their imports still point to `/home/user/Quantum_Chess/src/...`; change
that to the repository path. `checkInfo` there names the diagonals `'long diagonal'` / `'short diagonal'` and sorts
them alphabetically; this spec uses `'long'` / `'short'` in the fixed order of 3.5. The prototype has no
`announce`; the reviewer's version (with the en passant square of 3.5) is in `handoff/tmp/kriegspiel-rev1/kp.mjs`.

The engine review (8.2) re-ran every test twice. The first pass used `handoff/tmp/critic-kriegspiel/kp.mjs` and
`tests.mjs` on the committed core and on a scratch copy with some planned core changes. The second pass used
`r2_kp.mjs` (the hooks of section 3, `recordInfo`, `aiView` and `evaluate` included) and `r2_tests.mjs` (every test
of section 7 as an assertion, 70 of them). It ran on the core in the working tree, which now holds the changes of
`handoff/CORE-CHANGES.md` (Q1-Q14, W1-W7; not committed yet). Expected values in section 7 are those of that core.
Where the committed core from before the changes differs, the test says so.

---

## 1. Sources and chosen rule set

Research note: the original research could not open any rules page (the egress proxy blocked them) and worked from
search-engine extracts. In review (section 8.1) every source below was opened directly: chessvariants.com refuses
scripts (HTTP 403), so its pages were read from Wayback Machine snapshots, and the ICC help file from its archived
copy. The table now says what each source really contains.

| Source | What it gives |
|---|---|
| ICC help file "Kriegspiel" (the rules of ICC wild 16), archived: https://web.archive.org/web/20221206200401/https://www.chessclub.com/help/Kriegspiel (the same announcement list in 1998: https://web.archive.org/web/19980508225225/http://www.chessclub.com:80/help/Kriegspiel) | **The primary source for the chosen rules.** The computer referee announces "White's move" / "Black's move", "`Pawn at <square> captured`", "`Piece at <square> captured`", "Rank check", "File check", "Long-diagonal check" ("the longer diagonal from the king's point of view"), "Short-diagonal check" ("e.g. for a king on e1, the short diagonal is e1 to h4"), "Knight check" and "`<number> pawn tries`" ("number of legal capturing moves using pawns"). An illegal attempt: "you are simply told 'Illegal move', whether it is moving into check or moving through an enemy piece. Your opponent is not told anything". Promotion, castling and en passant are not in the list of announcements. |
| 11th Computer Olympiad (2006), Kriegspiel tournament rules: https://web.archive.org/web/20071123081716/http://www.cs.unimaas.nl/olympiad2006/rules.html | Copies the ICC help file ("The rules are those applied at Internet Chess Club") and adds that "all other rules of chess remain valid, including draw rules". |
| P. Ciancarini, G. P. Favini, "The Dark Side of the Chessboard: an Assistant to Play Kriegspiel over the ICC": http://www.cs.unibo.it/~cianca/wwwpages/chesssite/kriegspiel/interface.pdf | Describes the ICC rules. Before each turn a message that "both players actually receive" gives the number of pawn tries ("Pawn tries include possible en passant captures"), where a capture took place and "whether the captured piece was a pawn or another piece", and the check type "rank", "file", "short/long diagonal (from the King's point of view)" or "knight". "On the ICC the opponent will receive no notification of a player's illegal moves." It also says that on ICC the game is **not** drawn by threefold repetition or by the 50-move rule, which contradicts the Olympiad text above. |
| Chess Variant Pages, "Kriegspiel on ICC" (B. Enderton, 1997): https://web.archive.org/web/20240809060229/https://www.chessvariants.com/incinf.dir/kriegspielicc.html | ICC "gives the number of available pawn-capturing moves"; its rules are "pretty close to the 'Cincinnati style' rules", which only say whether there are any. Choosing between "no" and "nonsense" is called "a major sticky point", and "the ICC currently just says 'illegal move' to the mover ..., and nothing at all to the opponent". So ICC does **not** distinguish "No" from "Nonsense". |
| Chess Variant Pages, "Kriegspiel - Cincinnati Style" (D. Moeser): https://web.archive.org/web/20241110220125/https://www.chessvariants.com/incinf.dir/kriegspiel2.html | Announced after a legal move: a capture with "the square the captured piece is to be removed from. (Keep this wording in mind for an en passant capture.)", whether it was a "pawn" or a "piece", check with its direction (file, rank, long diagonal, short diagonal, knight), and whether the player to move has a legal pawn capture (a pawn capture that does not get out of check is not counted). "All announcements must be heard by both players", including "No". A pawn capture attempted when none was announced is "Nonsense". Promotion is not announced; castling and promotion are made silently. |
| Chess Variant Pages, "Kriegspiel" (H. Bodlaender): https://web.archive.org/web/20040214093653/http://www.chessvariants.com/incinf.dir/kriegspiel.html | Traditional rules: all announcements, illegal attempts included, "are heard by both players"; a capture is announced with its square but without the type of either piece, except that en passant is announced as such ("Black has taken en-passant on f3"); the "Any?" / "Try!" rule; "Impossible" for moves the player knows to be illegal. |
| Wikipedia, "Kriegspiel (chess)": https://en.wikipedia.org/wiki/Kriegspiel_(chess) | Invented by Henry Michael Temple (1899). Each player sees only their own pieces; an umpire sees everything. Its rule list: "Pawn gone" / "Piece gone" with the square (en passant "specifically announced as such"), "No" for moves illegal in the real position, "Hell no" (or "Impossible", "Nonsense") for moves that are always illegal, checks "on the vertical", "on the horizontal", "on the long diagonal" ("from the king's point of view"), "on the short diagonal", "by a knight"; the "Any?" rule ("*En passant* pawn tries are announced, but not the fact that they are *en passant* captures"); "Pawn promotions are not announced"; "Illegal move attempts are not announced to the opponent". "On the Internet Chess Club, Kriegspiel is called *Wild 16*." At RAND the umpire "only announced illegal moves, captures and checks" and could also announce pawn tries. |
| Berkeley Kriegspiel rules: http://w01fe.com/berkeley/kriegspiel/rules.html; S. Russell, J. Wolfe, "Efficient belief-state AND–OR search, with application to Kriegspiel", IJCAI 2005: https://people.eecs.berkeley.edu/~russell/papers/ijcai05-krieg.pdf | A rule set of its own ("not identical to any that we know of"), **not** the ICC one: both players hear every announcement, "Illegal" included; "Capture on X" with the square of the captured piece and without its identity ("En passant pawn captures are announced as ordinary captures"); check directions Rank, File, Short, Long, Knight, "from the king to the checking piece"; no pawn tries and no "Any?"; "Nonsense" for moves illegal on one's own board or tried twice; no draw by repetition or by the 50-move rule. |
| FIDE Laws of Chess (2023), https://handbook.fide.com/chapter/E012023 | The orthodox rules of section 2.1: article 3.7 (pawn, double step, en passant, promotion), 3.8 (king, castling and its conditions), 3.9 (check), 5 (checkmate, stalemate), 9.3 (50-move rule). |
| Wikipedia, "Dark chess" (for comparison) | In the related dark chess, nobody is told about check and the king is captured. |

**Chosen rule set: ICC (wild 16), adapted to capture-the-king and to the quantum layer.**

- Why ICC:
  - It is the best-documented automated rule set (its help file lists every announcement), and the Bologna
    Kriegspiel programs (Ciancarini and Favini) were built for it. The Berkeley programs use a set of their own.
  - Every announcement is automatic. There is no "Any?" question with its obligation to try a pawn capture, and
    such an obligation would be unfair in the quantum game, where a pawn try on a ghost can cost the turn.
  - It is the richest in information that is still fair: the pawn/piece distinction and a counted number of tries.
  - The opponent hears nothing about refused attempts, which the quantum adaptation needs (K-1).
- The other rule sets, for the record:
  - **Traditional rules** (Chess Variant Pages, Wikipedia): the "Any?" rule. The player may ask "Any?". After "Try!"
    they must attempt at least one pawn capture. The illegal attempts are heard by both players on the Chess Variant
    Pages, but not in the Wikipedia version. En passant is announced as such ("Black has taken en passant on f3").
  - **Cincinnati:** like ICC, but it says only whether a pawn capture exists, not how many. Every announcement,
    "No" included, is heard by both players.
  - **RAND:** the umpire announced only illegal moves, captures and checks, and optionally pawn tries.
  - **Berkeley:** see the table. No pawn tries, and the pawn/piece distinction is not announced.
- **Where ICC is silent or the sources disagree,** this spec decides as follows and says so where it applies:
  - the square of an en passant capture (3.5): the square of the captured pawn, as in the ICC wording
    "`Pawn at <square> captured`", the Cincinnati rule and the Berkeley rule;
  - a capture with promotion counts as one pawn try (3.5), because the ICC help file does not say how it counts;
  - the draw rules (K-14): the shared quantum rules, because the ICC sources contradict each other.
- **Adaptation to capture-the-king**, as the shared quantum rules require: "There is no check in Quantum Chess".
  - Moving into or staying in danger is legal, so check-related illegal attempts disappear.
  - The umpire still announces "check", now meaning "your king could be captured by one enemy move".
  - The game ends when a king is captured.

---

## 2. Classical rules (complete)

### 2.1 Board, pieces, setup, special moves

This is orthodox chess (FIDE Laws, articles 3 and 5). Board, pieces, setup, special moves and promotion are the same
as in `darkchess` sections 2.1 to 2.5, **except for check**: classical Kriegspiel keeps the orthodox check rules,
which dark chess drops.

- **Board:** 8 × 8, squares a1–h8 (files `a`–`h` from White's left, ranks `1`–`8` from White's side, a1 dark),
  coordinates `[file, rank]` 0-based: `rectTopology(8, 8)`.
- **Pieces:**
  - K `leap` KING_STEPS;
  - Q `ride` rook + bishop directions;
  - R `ride` ROOK_DIRS;
  - B `ride` BISHOP_DIRS;
  - N `leap` KNIGHT_JUMPS;
  - P `leap [0,1]` oriented move, and `leap [±1,1]` oriented capture.
- **Setup:** White moves first.
  - White: Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1, pawns a2–h2;
  - Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7–h7.
- **Special moves:**
  - the double step from rank 2 / 7, when both squares are empty;
  - en passant: on the move right after an enemy double step only, a pawn next to the passing pawn captures it as if
    it had moved one square. The capturing pawn goes to the skipped square (`e5-d6`) and the passing pawn (on `d5`)
    is removed;
  - castling `O-O` (Ke1-g1 with Rh1-f1) and `O-O-O` (Ke1-c1 with Ra1-d1), and the same for Black on rank 8. The
    king and that rook must not have moved, and every square between them must be empty.
- **Promotion** on the last rank to Q, R, B or N, chosen by the owner.
- **Check (classical only).** A move that leaves or puts the own king in check is illegal. Castling is also illegal
  when the king is in check, or would cross or land on an attacked square (FIDE 3.8.2.2). In Kriegspiel such moves
  get "No" like moves blocked by an unseen piece, since the player cannot see the attackers. The quantum adaptation
  drops all of these conditions (section 1, K-6, K-9).

### 2.2 The umpire's protocol (ICC, classical)

- Each player sees only their own pieces and knows the full rules. The umpire sees everything.
- **Attempts.** On their turn a player attempts moves one at a time.
  - A move that is impossible even on the player's own board ("Nonsense" / "Hell no" in other rule sets) cannot be
    entered at all. ICC itself makes no such distinction: its server answers "Illegal move" to every refused
    attempt, and most clients do not send a move that is impossible on the player's own board.
  - If the attempt is **illegal in the real position**, the umpire says "Illegal move" **to the mover only**,
    "whether it is moving into check or moving through an enemy piece". The player tries again, with no limit. The
    opponent is told nothing.
  - The first legal attempt is played. It is binding: in effect, touch-move for legal moves.
- **After every move** the umpire announces to **both** players:
  - that the side has moved ("White's move" / "Black's move": whose turn it now is);
  - **captures:** "Pawn at d5 captured" / "Piece at d5 captured". The square is the square the captured unit stood
    on, which for en passant is the passing pawn's square, not the skipped square the capturer moved to. The
    capturing piece is not named, and a captured piece's type is not given;
  - **check** of the player now to move, with its direction or directions, "from the king's point of view":
    - **rank**, **file**;
    - **long diagonal**, **short diagonal:** of the two diagonals through the king's square, the one with more
      squares, and the one with fewer. On an 8 × 8 board they never have the same length. ICC's example: for a king
      on e1 the short diagonal is e1–h4 (4 squares); the long one is a5–e1 (5 squares). A pawn check is a diagonal
      check;
    - **knight**.

    A double check gives two directions.
- **Pawn tries:** at the start of each turn the umpire announces to both players **how many** legal captures the
  player to move could make with pawns ("number of legal capturing moves using pawns"). An en passant capture
  counts, without saying so. A pawn capture that would leave the own king in check is illegal and is not counted.
- **Never announced:** promotions, castling, en passant as such, and the opponent's illegal attempts.
- **End (classical):** checkmate wins; stalemate is a draw. For the other draws the ICC sources disagree: the 2006
  Computer Olympiad rules (a copy of the ICC rules) say all the orthodox draw rules apply, while Ciancarini and Favini
  say that on ICC there is no draw by threefold repetition or by the 50-move rule. The Berkeley rules drop both
  as well. This spec does not need to settle it: the quantum game uses the shared draw rules (K-14).

---

## 3. Engine mapping (contract)

This is `orthodoxSpec()` plus hidden-information hooks. Nothing about movement changes. The comments name the
item of `handoff/CORE-CHANGES.md` that provides each new hook or flag. All of them are in the working tree now: Q9
in `quantum.js`, U9 and U10 in `src/variantplay/` and `src/views/VariantGameView.vue`.

```js
const spec = Object.assign(orthodoxSpec(), {
	id: 'kriegspiel',
	category: 'uncertainty',
	hidden: true,
	hiddenStyle: 'plain',                        // U10(c): no fog shading, a normal-looking board
	umpire: true,                                // U10(d): binding attempts, no odds preview, result without odds
	rules: () => [...],                          // section 5
	visibility(state, side) { ... },             // own squares only
	ownView(state, side) { ... },                // U10(b): the board as `side` knows it (enemy removed)
	candidateMoves(state) { ... },               // the moves the player may TRY (existing hook)
	recordInfo(prev, code, branch, next) { },    // Q9: returns { announce }, stored as record.info
	infoText(record, viewer) { ... },            // U9: the umpire's lines of a record (from record.info.announce)
	aiView(state, side) { ... },                 // what the computer may know (existing hook)
	evaluate(w, side) { ... },                   // uses x.aiCheck set by aiView (3.6, refinement b)
})
export default defineVariant(spec)
```

`orthodoxSpec()` brings `applyMiss` (W4: the en passant square is cleared in worlds where a move did not happen
and on Measure turns) and `unifyWorlds` (W5: a castling right survives only if every world has it). The spec must
not override them.

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
| `applyMiss`, `unifyWorlds` | as in `orthodoxSpec()` (W4 en passant expiry, W5 castling rights follow the state) |
| `worldResult` | default: king capture (`reason: 'king'`); no bare-kings draw (K-14) |
| `options` | none |
| `maxPly`, `quietPlies` | defaults 600 and 100 |

### 3.1 `visibility(state, side)`

The set of squares where a piece of `side` stands in at least one world. The board shows nothing else. Enemy pieces
are never drawn, because every enemy square is "hidden".

### 3.2 `ownView(state, side)`: the board as the player knows it

A state whose worlds are the real worlds with **every enemy piece removed**.
- `placePiece(c, id, OFF)` for each enemy piece on the board.
- `x.castle` keeps only `side`'s rights; `x.ep = x.epVictim = -1`.
- Identical worlds are merged and their weights added. `history: []`. Same `turn` and `ply`; `quiet: 0`, because the
  real counter is not public (K-14).

It depends only on the player's own pieces. It is used for:

- `candidateMoves` (3.3);
- the Split / Merge / Measure modes of the UI. The composable must call `splitTargets`, `mergesFrom` and
  `ownPieceAt` on `V.ownView(state, viewer)` instead of on the real state (section 6, leak checklist). The own view
  only chooses the squares the player can click. **The attempt itself is always decided on the real state** (3.4):
  a split can be legal in reality and illegal on the own view (test K21), so the UI must never refuse an attempt
  because the own view rejects it.

What the own view gives, compared with the real state (checked in the engine-review fuzz, 8.2):

- every real split target is an own-view split target;
- every legal merge and measurement of the real state is legal on the own view. A measurement is legal on one
  exactly when it is legal on the other, because a square never holds pieces of both sides in different
  possibilities (K-4);
- a split's budget, world count and 4-square bound can differ. A split child whose path a hidden piece blocks stays
  home, and when the blocked worlds line up with the player's own ghosts that gives **fewer** arrangements than the
  own view expects. The split is then legal although the own view says "budget full" (K21). The reverse also
  happens: a split legal on the own view gets "No" because hidden blockers add arrangements.

### 3.3 `candidateMoves(state)`: what the player may try

The union of:

1. `ordinaryMoves(V, ownView(state, state.turn))`: every move the player's pieces could make if the enemy pieces were
   not there. Sliders run until one of their own pieces blocks them. Castling counts when its squares are free in
   **every** own-view world (with Q2, castling is legal only when it is possible in every world). En passant never
   appears here, because the own view has no en passant square;
2. **pawn tries:** for every own pawn in every own-view world, `pieceMoves(V, b, id, out, { ghostEnemies: true })`.
   The core already makes a `kind: 'try'` move for each diagonal-forward square that is empty on the own board,
   including the promotion keys (`e7-d8=q`, …). That square might hold an enemy piece or allow en passant: an en
   passant capture has the same key as the pawn try onto the skipped square (`e5-d6`).

The result is `{ code, type: 'move', from, to, promo, drop: null, kind }`, one entry per key; `kind` is `'try'` for
the entries of item 2 that are not in item 1 (the tests count them), otherwise the kind of the generated move.

- **Invariant:** every key of `ordinaryMoves(V, state)` on the real state is in `candidateMoves(state)`. Removing
  enemy pieces never blocks a move, every capture key is either a quiet move or a pawn try on the own board, and a
  castling move possible in every real world is possible in every own-view world (each own-view world is a real world
  without the enemy pieces).
- **"Nonsense" moves cannot be entered.** Examples: a knight moved like a bishop, or a move onto a square that is
  certainly yours.

### 3.4 Legality: "No" (the umpire)

- An attempt is **refused** exactly when the quantum layer finds it illegal on the **real** state:
  `branches(V, state, code) === null`.
  - For an ordinary move that means it would **miss in every possibility**.
  - For castling and en passant (certain-only moves, core item Q2): it is **not possible in every possibility**. A
    castling move whose squares might hold a hidden piece is refused, not rolled.
  - For a split: a target might be occupied, no possibility has both paths clear, or the budget, the 64-world limit
    or the 4-square bound is exceeded (counted on the real worlds).
  - For a merge: a part cannot reach the target in any possibility, or the target might hold an own piece.
  - A measurement of an own ghost is never refused (K-4, K-8).
- A refused attempt changes nothing:
  - the state is the same object;
  - no history entry, no roll memo, no ply;
  - the opponent is not told.
- The UI already shows the notice "The umpire says: that move is not possible. Try another one." for hidden variants.
- **Which message.** Every attempt goes to the real state first; a legal attempt is played, whatever the own view
  says (K21). Only a refused attempt needs a message:
  - an **ordinary move** always gets the umpire's "No". Only candidates (3.3) can be entered. A candidate is either
    legal on the own view or a pawn try, and a pawn try is illegal on the own view by construction (its target is
    empty there), although the player cannot know whether it is legal in reality (test K22);
  - a **split, merge or measurement** gets the normal message ("This piece cannot split…", …) if it is also illegal
    on `ownView(state, turn)`: the player could know it from their own pieces (budget, 4-square bound, an own part
    on the target). Otherwise the umpire says "No".

  The choice depends only on the kind of attempt and on the own view once the real state has refused, so it reveals
  nothing more than the refusal itself. This is `refusalKind` in `src/variantplay/panel.js`.

### 3.5 `recordInfo(prev, code, branch, next)`: what the umpire says

The announcement is computed by the variant function `announce(prev, code, branch, next)` below and handed to the
core through the hook **`recordInfo`** (core item Q9): `recordInfo` returns `{ announce: announce(...) }`,
and the core stores it as `record.info`. So "the announcement of a move" is `record.info.announce` everywhere in
this spec.

- Q9 calls the hook once per played move, at the end of `stateAfter`, when not in light mode (never for the
  computer's search), after the result is settled. A refused attempt makes no record and no announcement.
- `next.result` and `next.turn` are final when it runs, so `check` and `tries` below are those of the side that
  really moves next.
- A replayed game (`replay()` of the composable) calls `stateAfter` again, so the stored object is rebuilt
  identically. `aiView` gets only the state, and it reads the announcements of earlier moves (3.6).
- The UI shows it through the hook `infoText(record, viewer)` (U9): the lines of section 6, for the records
  of both sides.

```js
{
	captures: [{ sq: 'd5', kind: 'pawn' | 'piece' | 'king' }],  // from branch.captures; en passant: victim square
	check: null | { dirs: ['file' | 'rank' | 'long' | 'short' | 'knight', ...], p: 0.5 },
	tries: 2,                                                  // pawn tries of next.turn, 0 when the game is over
}
```

- **captures:** one entry for each square `X` in `branch.captures` (the core records the square the capturing piece
  moved to):
  - `sq` is the square the captured unit stood on. That is `X` itself, except for an **en passant** capture (the
    move has `kind === 'ep'` in the worlds of `prev` where it was generated): then `sq` is the passing pawn's square,
    `x.epVictim` of those worlds. Example: after `e5-d6` en passant, `branch.captures` is `['d6']` but the
    announcement is `{ sq: 'd5', kind: 'pawn' }`. This follows the ICC wording "`Pawn at <square> captured`" and
    the Cincinnati rule "the square the captured piece is to be removed from" (section 1). En passant is uniform:
    with core items W4 (the en passant square is cleared in every world where a move did not happen and on Measure
    turns) and Q2 (en passant is legal only when every world generates it), a played en passant key is en passant
    in **every** world of `prev`, with the same `x.epVictim`. On the core before W4 and Q2 a stale en passant square
    could survive in some worlds and make the key a roll (test K16); the rule "en passant in the worlds where it was
    generated" still gives the right square then;
  - `kind` is `'king'` if the enemy king stood on `X`;
  - otherwise `'pawn'` if the move is en passant or an enemy pawn stood on `X` in the worlds of `prev`;
  - otherwise `'piece'`.
  - Kings and pawns are solid, so "an enemy king / pawn on X" is the same in every world, and a capture branch
    captures in every one of its worlds (a move is rolled whenever its target might hold a piece, so an unrolled
    branch never captures). The result is never uncertain, and `branch.captures` has at most one square.
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
  - `p = royalDanger(V, next, S)`: the largest, over the enemy's single moves **and merges**, of the chance that it
    captures the king. Converging captures count (core item Q7, docs/rules.md 5), as in the danger display of every
    variant. Test K18: each part of a queen on a4 / h5 attacks e8 in half the possibilities, and `p` is 1 because
    the merge `a4|h5-e8` captures for certain. The core before Q7 gave 0.5.
  - `check` is non-null exactly when `p > 0`. In each world a merge plays the ordinary move of the part that is
    there, so a world where a merge captures the king also has an enemy move of `generate` that captures it, and
    `dirs` (read from `generate`) already holds its direction.
- **tries:** the number of distinct `(from, to)` pairs among the **legal** ordinary moves of `next.turn` (the keys of
  `ordinaryMoves(V, next)`) whose mover is a pawn and that capture in at least one world of `next`. This is ICC's
  "number of legal capturing moves using pawns". En passant counts. The four promotion keys of one capture count once
  (the ICC help file does not say how it counts a capture with promotion; this spec counts one pawn and one target
  square as one try). There is no check, so the classical exclusion of pawn captures that would leave the own king
  in check does not apply. Counting legal keys matters for en passant only. With W4 no world keeps a stale en passant
  square, and with Q2 an en passant key that not every world generates is illegal, so it is never counted (test
  K16). On the core before W4 and Q2 the stale key was legal (a roll) and counted either way.
- **Never in `announce`:** the move code, promotions, castling, whether the move was rolled, how many outcomes it
  had, its result (Moved / Missed), and splits, merges or measurements as such. To the opponent, every kind of turn
  is "moved".

### 3.6 `aiView(state, me)`: what the computer may know

**Knowledge contract.** The computer uses exactly what a human in its seat knows:

1. its own pieces in every world, with the worlds' weights. This is its own quantum state as the board shows it;
2. every announcement in the history (`record.info.announce`, 3.5): its own and the opponent's, all public;
3. its own move codes and their results;
4. the umpire's answers to its attempts. The core's `chooseMove` keeps only the view's candidates that are legal in
   the real state. That equals trying them one by one in order of preference, without drawing conclusions from the
   "No" answers, so it is fair. When **no** candidate of the view is legal, the computer must still move: it tries
   the candidates of 3.3 (`candidateMoves` of the real state, which depend only on its own pieces) and the merges
   and measurements of its own view in random order, and plays the first one the umpire accepts. That is a player
   trying moves until one is accepted, so it is fair too. The current `chooseMove` returns null there and the
   computer never moves (test K23); this needs core change 1 of 8.2;
5. public counters: `turn` and `ply`. **Not** `quiet`: it is reset by pawn moves, and the opponent's pawn moves are
   never announced, so the counter would tell the computer when the opponent moved a pawn.

It must **not** read:

- any enemy piece, or which enemy piece ids are off the board. Only the pawn/piece category of its captures is
  public;
- enemy move codes, or any other field of the opponent's history records than `info.announce`: `key`, `p`,
  `rolled`, `notes` and `options` (the number of outcomes) describe hidden rolls, and `captures` holds the
  capturer's landing square, which differs from the announced square exactly for en passant;
- the enemy budget;
- enemy castling rights;
- the en passant square;
- the `quiet` counter (see item 5);
- any roll in advance.

**Construction (baseline, verified in `handoff/tools/hid/ai2.mjs`):**

1. Start from `ownView(state, me)`. All enemy pieces are gone.
2. **Phantom army.**
   - Start from the enemy's start counts per type.
   - For every capture `{ sq, kind }` announced after **me**'s moves (`sq` is a square name: convert it with
     `V.topology.byName`; `ai2.mjs` expects a square index there and fails on names):
     - a `pawn` capture removes one phantom pawn;
     - a `piece` capture removes one phantom piece: the type whose start square is nearest to `sq` (Chebyshev
       distance), among types still present.
   - Each enemy type has fixed **phantom slots**: its start squares in square order. For Black these are K e8; Q d8;
     R a8, h8; B c8, f8; N b8, g8; P a7…h7. The slots are appended with the same ids in every view world.
   - A slot is placed on its start square if it is still alive and no own piece stands on that square in **any**
     world (this is what `ai2.mjs` does). Otherwise it stays `OFF`. "Empty in that world" is not enough: a phantom
     under one of the computer's own ghost parts would put pieces of both sides on one square in different worlds,
     which a real state never has (K-4), and `ownPieceAt` would then refuse to measure or merge that ghost.
   - **The king is always placed:** on its start square, or on the nearest square that holds no own piece in any
     world (ties to the lowest index). It is then on the same square in every view world, as a king must be (kings
     are solid; a phantom king on different squares would trigger solid rolls in the computer's search).
3. **Refinements.** They use announcements only. (c) is needed at **every** level: without it, a computer whose only
   legal moves are pawn captures onto squares without a phantom has no legal candidate (test K23). (a) and (b) are
   recommended for the Normal and Hard levels.
   - (a) **Last capture:** if the opponent's last move captured on `X`, move the placed phantom **piece** nearest to
     `X` (a pawn if no piece is left) onto `X` in every world where `X` is empty. The capturer is standing there now.
     Note: after an en passant capture of the computer's pawn, the announced square is that pawn's square (3.5),
     while the capturer stands on the skipped square behind it. The announcement does not tell this apart from an
     ordinary capture on that square, so the baseline still uses `X`.
   - (b) **Check:** if the computer's king is in check, store `x.aiCheck = { side: me, k: kingSquare, dirs }` in every
     view world. `evaluate(w, side)` looks at the king of `x.aiCheck.side` in `w`. If it still stands on an announced
     line through `k`, the value is **−250** cp for `side === x.aiCheck.side` and **+250** cp for the other side
     (the search also evaluates the opponent's replies with `evaluate(w, them)`, so the term must not be applied to
     the opponent's phantom king). The lines are:
     - the same rank for `rank`;
     - the same file for `file`;
     - the same diagonal of the named length for `long` / `short`;
     - still on `k` for `knight`.
   - (c) **Pawn tries:** if the latest announcement gives the computer `tries ≥ 1`, place an extra phantom pawn on every
     diagonal-forward square of its own pawns that is empty in all view worlds (the same squares in every world).
     The computer then tries pawn captures. A wrong guess costs nothing, because the umpire says "No". Every real
     pawn capture is then a candidate: its target holds an enemy piece in some world, so it holds no own piece in any
     world (K-4) and gets a slot or an extra phantom.
4. Merge identical worlds. The weights still sum to T. Return `{ ...state, worlds, history: [], quiet: 0 }`
   (`ai2.mjs` forgets `quiet: 0`).

The computer plays a naive Kriegspiel. It assumes unseen pieces are still at home, and it probes with captures. That
is intended for Easy and Normal. A real belief model can come later, as long as the no-leak test (K12) passes.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the
game-end roll, budget 8 and at most 4 squares per piece. Castling and en passant follow docs/rules.md sections 4
and 5 through core items Q2, W4 and W5: they never roll, they are legal only when they are possible in every
possibility, en passant only right after the double step, and a castling right is lost as soon as the king or that
rook is not 100 % on its start square. A part that moves onto another part of the same piece joins it without a roll
(Q14; in Kriegspiel no enemy piece can stand there, K-4). Everything below decides how the umpire and the hidden
information combine with them.

**K-1. "No" means the move cannot be played.**
- An attempt the quantum layer rejects on the real state gets "No". The turn is not used, nothing in the state
  changes, and only the mover is told.
- Because the state is unchanged, a "No" never measures anything. It is exactly the classical umpire's "No".
- For an ordinary move, "cannot be played" means impossible in every possibility. Castling and en passant are
  certain-only (Q2): they get "No" unless they are possible in **every** possibility, so castling past a square
  where a hidden piece might stand gets "No", not a roll (test K13). Splits: see K-8.
- Examples:
  - a pawn capture onto a square where no enemy piece can be in any possibility;
  - a ghost part whose path is blocked in every possibility in which it exists (test K8);
  - castling with a hidden bishop 50 % on f1 (test K13).

**K-2. "Possible somewhere" means played.**
- An attempt that is legal in at least one possibility is **played at once and is binding**. It follows the shared
  rules:
  - rolled if it lands where another piece might be (a part of the same piece does not count, Q14), or if the
    mover is a king or pawn;
  - otherwise linked (pass = link), **unless** the link would push the mover's budget over 8: then it is rolled
    (test K19). Whether that happens depends on where hidden pieces block the path, so the player cannot always
    know in advance whether a slide will link or roll;
  - castling and en passant are never rolled (K-1).
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
- The mover gets that result line after **every** own move, in the same form, whether it was rolled or not. Whether a
  move was rolled, and how many outcomes it had, depends on hidden pieces (a pawn push is rolled only if an enemy
  piece might block it), so the UI must not show a roll marker, a roll box only for rolled moves, or the notes of the
  solid and game-end rolls while the game runs.
- A content-free confirmation for every attempt is allowed as an optional anti-misclick setting, because it reveals
  nothing.

**K-4. Own pieces are fully visible.**
- The player always sees all parts of their own pieces with their percentages, and links among their own pieces.
- When an enemy move collapses one of their ghosts (a landing on its square, or a measurement of an enemy ghost it is
  linked to), they see the collapse. This is the quantum game's own information channel, and the rules card says so.
- Example: after a pawn try that Missed on a square where a knight was 50%, the knight's owner sees it become 100%
  on its other square (test K6). After a measurement of a rook that is linked to a Black knight, Black sees the
  knight become solid (test K17).
- **One side per square.** A square never holds pieces of both sides in different possibilities: every move onto a
  square where another piece might stand is rolled (the rolled outcome groups separate the worlds), and a split needs
  squares that are empty in every possibility. So an enemy piece is never "under" one of the player's own ghost
  parts. This held on the core before and after the changes of CORE-CHANGES.md (engine-review fuzz, 8.2), and it is
  why a measurement never needs the umpire (K-8) and why phantoms in `aiView` must avoid every own square (3.6).

**K-5. Captures are announced** with square and pawn/piece.
- The square is where the captured unit stood: the target square, except for en passant, where it is the passing
  pawn's square (3.5).
- They are certain, because a capture branch captures in all its worlds, and a move that is not rolled never
  captures (its target was empty in every possibility).
- A capture of the king ends the game, and the umpire says so.

**K-6. "Check" = your king could be captured next move.**
- After every move, if the side to move could lose its king to one enemy move **in at least one possibility**, the
  umpire announces "Check" to both players.
- It gives the direction or directions (file, rank, long or short diagonal, knight) and the chance `p` (the core's
  `royalDanger`).
- The chance is the quantum form of the classical announcement. A 25% check from a ghost still has to be taken
  seriously.
- `p` is the chance of the best single enemy move **or merge**, like the danger display of every variant: a
  converging capture counts (docs/rules.md 5, core item Q7). In test K18 each part of a queen ghost attacks the king
  in half the possibilities, and the announcement is 100 % with the directions "long, short", because the merge of
  the two parts captures for certain. The rules card says "one enemy move, a merge included".
- A measurement can cause a check too: it may settle an enemy's own linked piece onto an attacking square (test
  K17).
- There is **no** announcement when the mover leaves their own king capturable. In the classical game that is simply
  impossible, and here the opponent has to find the capture themselves.
- No warning or safety dialog before a move: it would be computed from hidden pieces.

**K-7. Pawn tries** are counted as in ICC: the legal pawn captures (possible in at least one possibility), announced
to both players for the side to move after every move. A try on a ghost is a gamble: Captured, or Missed and the turn
is gone (test K6).

**K-8. Splits, merges and measurements.**
- They can be attempted like moves, and the real state decides (3.4).
  - A split into squares where an enemy piece might stand gets "No" (test K11).
  - A split whose children a hidden piece blocks in some possibilities is counted on the real worlds: blocked
    children stay home. That can push it over the budget or the 4-square bound ("No"), or keep it under the budget
    when the own view would exceed it: the split is then **played** (test K21).
  - A merge whose parts cannot reach the target in any possibility gets "No".
- A measurement of your own ghost is always legal: by the one-side-per-square rule (K-4) its legality never depends
  on hidden pieces (test K20).
- All of them are announced to the opponent only as "moved", plus any capture or check they cause (test K17).

**K-9. Castling, promotion and en passant**, as in the variants core with items Q2, W4 and W5:
- **Castling** is legal only when it is possible in **every** possibility: the right is intact, the king and that
  rook stand on their squares, and every square they cross or land on is empty (`castlingMoves`) in every
  possibility. It is never rolled. If a hidden piece might stand on one of those squares, the umpire says "No" (test
  K13). There is no check, so castling out of, through or into check is legal, unlike classical Kriegspiel, where it
  gets "No" (section 2.1). The right is lost as soon as the king or that rook is not 100 % on its start square (W5);
  a Missed king or rook move keeps it. It is never announced.
  - The core before Q2 rolled castling past a possible blocker (Missed or Moved). That was a core bug for every
    orthodox variant (decision D1).
- **Promotion** is chosen before the attempt and is never announced.
- **En passant** is attempted as a pawn capture onto the empty skipped square. It is certain (Q2) and possible only
  on the move right after the double step: W4 clears the en passant square in every world where a move did not
  happen and on Measure turns, so a stale square left in some possibilities can no longer make it a roll (test K16).
  It counts as a pawn try and is announced as a pawn capture on the **passing pawn's square** (`e5-d6` is announced
  "Capture on d5: a pawn"), as on ICC ("`Pawn at <square> captured`") and in the Cincinnati rules (section 1). It is
  not announced as en passant.

**K-10. The game-end roll and the result** are public. When the game ends, the **whole board is revealed**: all
worlds, the pieces of both sides, and the full history with codes and odds.
- In this variant the solid roll and the game-end roll never actually happen. Every move that can capture is rolled,
  so a capture branch captures on one square in all its worlds, and a king or pawn on that square stands there in
  every world (they are solid). Pawn and king moves are rolled too, and castling and en passant play the same in
  every world. So the worlds of an outcome never disagree on a solid piece or on whether a king is gone. The roll
  that decides a king capture is the move's own landing roll (test K9). History records therefore never carry
  `solid:` or `end:` notes (checked in the fuzz, K15).

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

**K-14. Draws and the end of the game.** The shared rules apply:
- 50 moves by each side without a capture or pawn move (`quietPlies` 100). With core item Q8 only a capture or a
  pawn move that really happened resets the counter; a Missed pawn move does not. The counter includes
  the opponent's pawn moves, which are never announced, so it is **not public**: the UI does not show it while the
  game runs, and this draw can come without warning. The umpire announces it when it happens;
- the 600-ply limit;
- a side with no legal move at all (the shared default, a draw).

Refused attempts are not moves and do not count. There is no checkmate and no stalemate: a king whose every move
goes into danger must still move (or another piece must), and may then be captured. The classic game's "your king
cannot escape" loss (docs/rules.md section 5) is not part of the variants core, and in Kriegspiel it would also be
computed from hidden pieces. There is no draw by threefold
repetition (the core has none; Ciancarini and Favini say ICC has none either) and none by insufficient material (a
bare king can still be captured). The ICC sources disagree on the classical draw rules (section 2.2), so these are a
choice, not a deviation.

Two rules of docs/rules.md 6 for classic Quantum Chess are not used, as in `darkchess`: the automatic draw when only
the two kings are left (the variants core has none; two bare kings can still capture each other, and the check
announcement tells the side to move when they stand side by side), and "the draws wait while the player to move can
capture the enemy king for certain" (CORE-CHANGES item 72). So the 50-move draw can end a game in which the side to
move could have taken the king.

---

## 5. Player-facing rules text (rules card)

1. You see only your own pieces. The umpire knows where everything is.
2. Try any move. The umpire says "No" if it is impossible in every possibility, or if castling or a split needs a
   square where a hidden piece might be. Then try again: your turn is not used and your opponent is not told.
3. Any other move is played at once, with a roll if needed, and you only see its result. If it misses, your turn is
   still used.
4. After every move both players hear: a move was made, every capture (the square of the captured piece, and whether
   a pawn or a piece was taken), and "check" with its directions (file, rank, long or short diagonal, knight) and the
   chance that one enemy move, a merge included, could capture the king.
5. Before each turn both players hear how many pawn captures the player to move might be able to make (en passant
   included).
6. You win by capturing the king. There is no checkmate: moving into check, and castling out of, through or into
   check, are allowed. Promotions, castling and en passant as such are never announced.
7. If one of your ghosts suddenly becomes solid, an enemy move landed on one of its squares or settled a piece it
   was linked to.
8. In pass & play, hand the device over when asked. The whole board is revealed when the game ends.

---

## 6. UI layout

- **Board:** the standard 8 × 8 layout: light and dark squares, files `a`–`h`, ranks `1`–`8`, and the cburnett
  sprites.
  - `hiddenStyle: 'plain'`: **no fog shading.** The board looks like a normal chessboard that holds only your pieces.
    `VariantBoard` skips the `qc-vboard__cell--fog` class when the variant's `hiddenStyle` is `'plain'` (U10(c), in
    the working tree).
  - Accessible names stay "e5: hidden" for squares without your pieces.
  - In pass & play the board turns towards the side to move (already built).
- **Move targets:** the dots come from `candidateMoves`, so the player sees everything they may **try**, including the
  pawn tries.
- **Umpire box** (new, above the move list). Its lines come from `V.infoText(record, viewer)` (U9) for the records
  since the viewer's own last move, the opponent's included:
  - "Black moved."
  - "Capture on d5: a pawn." / "Capture on d5: a piece." / "The king on e8 is captured."
  - "Check: file, knight (100 %)." The chance is always shown with its number.
  - "Pawn tries: 2." / "No pawn tries."
  - After a refused attempt, the existing notice text and a line "Refused this turn: e2-e4, d1-d5". This list is
    composable state, not part of the record. It is cleared when the turn ends, before the hand-over.
- **Status line:** the check announcement replaces "Your king is in danger". There is no separate danger ring or
  safety dialog.
- **Move history during the game:**
  - own rows show the code and the result (Moved / Missed / Captured, or the split, merge or measured square)
    **on every row**, with no percentage and no roll marker (K-3);
  - opponent rows show "A move" (as `historyRows` in the working tree does), never "Moved", which reads like the
    result Moved and would tell a Moved from a Missed;
  - both show the announcements (`infoText`).
- **Rolls:**
  - no pending-outcomes box (K-3);
  - after every own move, rolled or not, the same result box: the result without the percentage and without notes;
  - the opponent's roll box stays hidden (already built: `hideLast`), but the umpire's lines for that move are shown.
- **Budget pips:** your own; "?" for the opponent.
- **Hand-over:** two steps (K-12).
- **Undo** is disabled until the game ends.
- **After the game:** reveal everything (already built: `hidden` is null once `state.result` is set). History rows
  show codes and odds.
- **Optional, later:** "pencil" markers. Grey enemy piece icons the player can drop on empty squares as notes, stored
  per side in the local game record, with no effect on the game. Over-the-board Kriegspiel players keep such a board.

**Leak checklist for the UI** (to verify when implementing). The ai-ui package has since built U9 and U10 in the
working tree (`src/variantplay/panel.js`, `useVariantGame.js`, `VariantGameView.vue`), and a quick read shows the
items below handled there. The Kriegspiel component tests must still check each of them:

- `attempt()` in `useVariantGame.js` opens the pending box when `outs.length > 1`. With `V.umpire`, it must play at
  once.
- `pieceAt(sq)` reads the first world's occupant, whatever its side. In hidden variants it must use
  `ownPieceAt(V.ownView(state, viewer), sq)`.
- `clickSplit` / `clickMerge` / `marks` call `splitTargets` / `mergesFrom` on the real state. They must use
  `V.ownView(state, viewer)` to choose the squares, but the attempt itself goes to `outcomes` on the real state:
  never refuse a split because the own view does (K21), and pick the message as in 3.4.
- The measure mode's `legalMoves(Vv, s)` check runs on the real state. It reveals nothing, because a square never
  holds pieces of both sides (K-4, K20), but use `V.ownView(state, viewer)` there too, so the code needs no reasoning
  about the real state.
- `lastRoll` is set only when `outcomes.length > 1 || rolled`, and own `historyRows` show the result only when
  `rolled`. Both reveal hidden pieces (K-3). With `V.umpire`: a result box after every own move, a result on every
  own row, no percentage, no notes, no roll marker.
- `historyRows` shows secret (opponent) rows as "Capture on {squares}" from `record.captures`, which is the
  capturer's landing square: after en passant it says d6 where the umpire says d5, which tells the victim it was en
  passant. In Kriegspiel the secret rows must show `infoText` (the announcement) instead.
- `play()` stores the outcome index `i` and the record keeps `options` (the number of outcomes), `p`, `key`, `notes`
  and `rolled` for the opponent's moves: none of them may be rendered for the opponent while the game runs.
- `viewer` follows `state.turn` in hidden pass & play, so right after a move the board would switch to the next
  player's view. The two-step hand-over (K-12, U10(f)) must keep the mover's view until "Pass the device".
- `danger` (the viewer's `royalDanger`) must be replaced for display by the `check` of the latest announcement
  (`record.info.announce.check` of the last record); `royalDanger` itself must not be shown while the game runs.
- The opponent's budget must not be rendered.

---

## 7. Test cases

Positions use `worldFrom` placements (`'0:k'` is a White king, `'1:n'` a Black knight). A state with several worlds
lists the same pieces in the same order in every world. Worlds have `x = { ep: -1, epVictim: -1, castle: [] }`
unless castling rights are given. "`announce`" means the object stored on the new history record as
`record.info.announce` (3.5, core item Q9). "No" means `branches(...) === null`, with the state unchanged. Weights
are listed as relative numbers ("1:1"); `T` is split between the worlds in that ratio. "Pawn tries" means the
`tries` of 3.5 for the side to move of that state. All values hold on the core in the working tree, which has the
changes of CORE-CHANGES.md (`handoff/tmp/critic-kriegspiel/r2_tests.mjs`: 70 assertions, all pass). K13 (second
case), K16 and K18 also name the different result of the committed core from before those changes. Those were core
bugs (D1, D2, Q7), not variant rules.

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

In every row `p` is 1. ICC's own example, with White to move: one world `{ e1:'0:k', h4:'1:b', a8:'1:k' }` gives
`{ dirs: ['short'], p: 1 }`, and the same with the bishop on a5 (and the Black king on h8) gives `['long']`. The ICC
help file: "for a king on e1, the short diagonal is e1 to h4".

**K5. Pawn tries.**
- One world `{ e1:'0:k', e4:'0:p', d4:'0:p', g7:'0:p', e8:'1:k', d5:'1:p', f5:'1:n', h8:'1:r' }`, White to move:
  - pawn tries = **3**: e4-d5, e4-f5, g7-h8. g7-h8 has four promotion keys and counts once.
  - The d4 pawn has no move.
- En passant: one world `{ e1:'0:k', e5:'0:p', e8:'1:k', d7:'1:p' }`, Black to move.
  - Black plays `d7-d5`: `announce.tries` = **1** and `check` = null.
  - `e5-d6` is then legal: 1 outcome, `capture`. The core records `branch.captures` = `['d6']`, but
    `announce.captures` = `[{ sq: 'd5', kind: 'pawn' }]`: the square of the captured pawn (3.5). Afterwards d5 is
    empty and the White pawn stands on d6.

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

**K9. Quantum: a roll that may capture the king.** Two worlds 1:1:
- A = `{ e1:'0:k', a4:'0:q', e8:'1:k' }`;
- B = `{ e1:'0:k', h4:'0:q', e8:'1:k' }`.

White to move.
- `a4-e8` gives `[miss 0.5, capture 0.5]`, both with `notes` `[]`: the landing roll decides the game, and no
  game-end roll follows (K-10).
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
- Two worlds 1:1, with the bishop on f1 in A and on c4 in B: `O-O` is a candidate and **"No"**: castling is legal
  only when it is possible in every possibility (Q2, K-9). The core before Q2 rolled it instead (`[miss 0.5, move
  0.5]`): the core bug D1.
- Two worlds 1:1, with the bishop on c4 in A and on b5 in B (never on f1 or g1): `O-O` has 1 outcome, `move`, not
  rolled; the king is on g1 and the rook on f1 in both worlds. `announce` has no mention of castling:
  `{ captures: [], check: null, tries: 0 }`.
- There is no check, so castling out of or through attack is legal. One world `{ e1:'0:k', h1:'0:r', e8:'1:k',
  e5:'1:r' }` (the king is attacked on the e-file): `O-O` has 1 outcome, `move`. One world `{ e1:'0:k', h1:'0:r',
  e8:'1:k', f5:'1:r' }` (the king crosses the attacked f1): `O-O` has 1 outcome, `move`. In classical Kriegspiel
  both would be "No".

**K14. Promotion attempts.** One world `{ a1:'0:k', e7:'0:p', h1:'1:k', e8:'1:r', d8:'1:n' }`, White to move.
- The candidates from e7 are the 12 keys `e7-e8=q|r|b|n`, `e7-f8=…` and `e7-d8=…`.
- Pawn tries = 1.
- `e7-e8=q` and `e7-f8=q` are "No".
- `e7-d8=q` has 1 outcome, `capture`, with `announce.captures = [{ sq: 'd8', kind: 'piece' }]`. The promotion is not
  mentioned.

**K15. Random games (fuzz).** `fuzz.spec.js` covers kriegspiel automatically. Add a Kriegspiel fuzz that attempts
what a player could attempt: random **candidate** moves, and splits, merges and measurements chosen on
`ownView(state, turn)` (so that the games reach states with ghosts on both sides):
- on "No", it asserts that the state is unchanged and draws again;
- after every move it asserts that `ordinaryMoves(real)` ⊆ `candidateMoves` (3.3);
- it asserts that no square holds pieces of both sides in different worlds (K-4);
- it asserts that every legal merge and measurement of the real state is legal on `ownView`, and that every target of
  a legal real split is an own-view split target. It must **not** assert that a legal real split is legal on the own
  view: that is false (K21);
- it asserts that `visibility` contains exactly the own squares;
- it asserts that `aiView` sums to T with one enemy king per world, and that no phantom stands on a square that holds
  an own piece in any world;
- it asserts that `announce.tries` equals the number of distinct `(from, to)` pairs of legal pawn keys that capture in
  some world (3.5);
- it asserts that `announce.check` is non-null exactly when `royalDanger(V, next, next.turn) > 0`;
- it asserts that every announced capture square held an enemy unit in some world of `prev`, and that it differs from
  `branch.captures` only for en passant (then it is `x.epVictim` of `prev`);
- it asserts that the stored `record.info.announce` equals `announce(prev, code, branch, next)` computed again;
- it asserts that `x.ep` and `x.castle` are the same in every world (IT8 of the core plan);
- it asserts that `aiView(...).quiet` is 0, and that no square of the view holds pieces of both sides;
- it asserts that no outcome of a played move carries notes: the solid roll and the game-end roll never happen in
  this variant (K-10);
- every few plies it calls `chooseMove` with `V.aiView` (easy level, a seeded `rng`) and asserts that the computer
  returns a legal move whenever the side to move has one (K23).

**K16. Quantum: a stale en passant square is not a pawn try.** Four worlds 1:1:1:1, all
`{ e1:'0:k', e8:'1:k', d2:'0:p', e4:'1:p' }` plus a White knight on f3 or h3 and a Black knight on f6 or h6 (the four
combinations). White to move.
- `d2-d4` has 1 outcome, `move`. `announce.tries` = **2** (`e4-d3` en passant, and `e4-f3` onto the knight that is on
  f3 in half the worlds); `e4-d3` has 1 outcome, `capture`.
- Black plays `f6-g4` (1 outcome, `move`, not rolled: the knight's f6 part moves, and the worlds with the knight on
  h6 are idle), then White plays `f3-g5` (1 outcome, `move`; the worlds with the knight on h3 are idle).
- Now, Black to move: `announce.tries` = **0**, `e4-d3` is a candidate (a pawn try) and **"No"**. The en passant
  window was Black's previous move.
- The core before W4 kept `x.ep` in the worlds where both knight moves missed: there `e4-d3` was `[miss 0.75,
  capture 0.25]` and `tries` = 1. That was the stale en passant bug (D2).

**K17. Quantum: a measurement causes a check and settles an enemy ghost.** Start from K7 after `a1-a8` (rook a1 50 %
/ a8 50 %, linked to the Black knight on a4 / c4), Black to move.
- Black plays `e8-f8`: 1 outcome, `move`; `announce` = `{ captures: [], check: null, tries: 0 }` (the umpire says
  nothing about the mover's own king, K-6).
- White measures `?a1`: `[a1 0.5, a8 0.5]`, rolled.
  - `a1`: the rook is 100 % on a1 and the knight 100 % on a4; `announce` = `{ captures: [], check: null, tries: 0 }`;
  - `a8`: the rook is 100 % on a8 and the knight 100 % on c4; `announce` = `{ captures: [], check: { dirs:
    ['rank'], p: 1 }, tries: 0 }`.
  - In both, Black's own view shows its knight become solid (K-4); the announcement says nothing about a measurement.

**K18. Quantum: the check chance counts converging captures.** The K10 worlds (queen a4 in A, h5 in B, Black king
e8), Black to move: `check` = `{ dirs: ['long', 'short'], p: 1 }` and `royalDanger(V, s, 1)` = 1. Each single move
(`a4-e8`, `h5-e8`) captures in half the possibilities, but White's merge `a4|h5-e8` captures for certain (K10), and
the chance counts it (Q7, docs/rules.md 5). The core before Q7 gave 0.5.
- As an announcement: the same two worlds plus a White rook on h1, White to move. `h1-h2` has 1 outcome, `move`, and
  `announce.check` = `{ dirs: ['long', 'short'], p: 1 }`.
- Three worlds 1:1:1, the third with the queen on a1 (it reaches e8 from neither square), Black to move: `check` =
  `{ dirs: ['long', 'short'], p: 2/3 }` (the merge captures in two worlds of three; the best single move has 1/3).

**K19. Quantum: a full budget turns a link into a roll.** Sixteen worlds, all weights equal: White `e1:'0:k'`,
`a1:'0:r'`, a knight on f3 or h3, a bishop on d2 or e3, a bishop on e2 or d3; Black `e8:'1:k'` and a knight on a4 or
c4 (all 16 combinations). White to move. White's budget is 8.
- `a1-a8` gives `[miss 0.5, move 0.5]`, rolled: the link would give White 16 arrangements.
- The same with White's knight on f3 and first bishop on d2 in every world (4 worlds, White's budget 2): `a1-a8` has
  1 outcome, `move`, not rolled (the rook becomes a ghost linked to the Black knight, as in K7).

**K20. Quantum: measuring never needs the umpire.** Two worlds 1:1, A = `{ e1:'0:k', e8:'1:k', d4:'0:n', f6:'1:n' }`,
B = `{ e1:'0:k', e8:'1:k', f5:'0:n', b6:'1:n' }`, White to move: `?d4` gives `[d4 0.5, f5 0.5]` on the real state and
the same on `ownView(s, 0)`.

**K21. Quantum: a split legal in reality but not on the own view.** Six worlds, all weights equal: White `e1:'0:k'`,
`c1:'0:b'`, a rook on a1 or h1, a knight on f3, h3 or g5 (all 6 combinations); Black `e8:'1:k'` and a knight on b6
when White's knight is on f3, on d2 otherwise. White to move. White's budget is 6 on both views.
- `c1-e3|f4` is illegal on `ownView(s, 0)` (it would give 12 arrangements) but legal on the real state: 1 outcome,
  `split`. The Black knight on d2 blocks both paths in 4 of the 6 worlds, where the bishop stays home.
- Afterwards White's budget is 8 and the bishop is on c1 2/3, e3 1/6, f4 1/6. `announce` = `{ captures: [], check:
  null, tries: 0 }`.
- The UI must send this attempt to the real state and play it (3.4). With White's knight on only f3 or h3 (4 worlds),
  the split is legal on both views.
- The reverse: eight worlds, all weights equal: White `e1:'0:k'`, `a1:'0:r'`, a knight on f3 or h3, a bishop on d2
  or e3; Black `e8:'1:k'` and a knight on a4 or c6 (all 8 combinations). White's budget is 4. `a1-a3|a5` is legal on
  the own view (8 arrangements) but "No" on the real state: where the knight is on a4 the a5 child stays on a1, which
  gives 12 arrangements. The message is the umpire's "No" (3.4).

**K22. Which notice a refused attempt gets (3.4).** One world `{ e1:'0:k', e4:'0:p', g1:'0:n', e8:'1:k',
f3:'1:b' }`, White to move.
- `e4-d5` (a pawn try) is "No" and gets the **umpire's** "No", although it is illegal on `ownView(s, 0)` too: an
  ordinary move always gets the umpire's answer.
- `g1-f3|h3` is "No" (f3 holds the hidden bishop) and legal on the own view: the umpire's "No".
- K19's sixteen worlds (White's budget 8): `a1-a2|a3` is "No" on the real state and on the own view (16
  arrangements): the **normal** message ("This piece cannot split…"). K21's reverse case: the umpire's "No".

**K23. The computer always finds a move (3.6).** One world `{ a1:'0:k', b1:'0:b', a2:'0:p', b2:'0:p', c2:'0:p',
e8:'1:k', a3:'1:p', b3:'1:p', c3:'1:p' }`, White (the computer) to move.
- The legal moves are exactly `a2-b3`, `b2-a3`, `b2-c3` and `c2-b3` (pawn tries = 4). The king and the bishop are
  boxed in by their own pieces, and every push is blocked.
- With the baseline `aiView` (phantoms on Black's start squares only), no candidate of the view is legal: the view
  offers the six pushes and double steps, and the umpire refuses them all. The current `chooseMove` (level easy,
  `rng: () => 0.5`) returns **null**, and the game view would wait for the computer forever.
- With refinement (c) (the last announcement gives `tries` 4), the view has phantom pawns on a3, b3, c3 and d3, and
  `chooseMove` plays one of the four captures.
- Once the fallback of 3.6 (knowledge contract, item 4) is in (core change 1 of 8.2), `chooseMove` must return one
  of the four captures with the baseline view too.

---

## 8. Review notes

### 8.1 Source review

Reviewer lens: rules fidelity. Every source was opened directly this time. chessvariants.com refuses scripts
(HTTP 403), so its pages and the ICC help file were read from Wayback Machine snapshots. All classical expectations
of section 7 (K1–K5, K12–K14, and the classical parts of K6–K11) were re-run on the real variant core with the
prototype hooks plus an `announce` written to 3.5 (`handoff/tmp/kriegspiel-rev1/kp.mjs`, `tests.mjs`), and all of
them hold, including the new cases below. A 40-game random run (`fuzz.mjs`, 3,657 plies) found no move of
`ordinaryMoves(real)` missing from `candidateMoves`, no `aiView` with a wrong weight sum or enemy king count, and
announced its one en passant capture on the passing pawn's square.

Changes:

1. **Section 1, source table: rewritten; several rows were wrong.**
   - The ICC help file itself was missing. It is now the primary source: the exact referee messages, "Illegal move"
     to the mover only, and nothing to the opponent. Sources:
     https://web.archive.org/web/20221206200401/https://www.chessclub.com/help/Kriegspiel,
     https://web.archive.org/web/19980508225225/http://www.chessclub.com:80/help/Kriegspiel.
   - The row said ICC "distinguishes 'No' ... from 'Hell no' / 'Nonsense'". The cited page says the opposite: ICC
     "just says 'illegal move' to the mover". Source:
     https://web.archive.org/web/20240809060229/https://www.chessvariants.com/incinf.dir/kriegspielicc.html.
   - The Ciancarini and Favini row had two quotes that are not in the paper. "Short vs long diagonal check is based
     on the king's location" is really "(from the King's point of view)". "but not the fact that they are en passant
     captures" comes from Wikipedia's "Any?" paragraph. The row now also records that the paper says ICC has no
     repetition and no 50-move draw. Source:
     http://www.cs.unibo.it/~cianca/wwwpages/chesssite/kriegspiel/interface.pdf.
   - Wikipedia does not say that ICC's rules are "the most widespread". It only says ICC calls Kriegspiel "Wild 16".
     It does not cite J. D. Williams, and its RAND paragraph does not mention "Hell no". The RAND row was removed, and
     what Wikipedia says about RAND is now in the Wikipedia row. Source:
     https://en.wikipedia.org/wiki/Kriegspiel_(chess).
   - Russell and Wolfe do **not** use the ICC percepts. Their Berkeley rules announce "Capture on X" without
     pawn/piece, have no pawn tries, let both players hear "Illegal", and drop the repetition and 50-move draws.
     Sources: https://people.eecs.berkeley.edu/~russell/papers/ijcai05-krieg.pdf,
     http://w01fe.com/berkeley/kriegspiel/rules.html.
   - New rows: the 2006 Computer Olympiad rules (a copy of the ICC rules, with "including draw rules"), the
     Cincinnati page (Moeser), the traditional page (Bodlaender), and the FIDE Laws. Sources:
     https://web.archive.org/web/20071123081716/http://www.cs.unimaas.nl/olympiad2006/rules.html,
     https://web.archive.org/web/20241110220125/https://www.chessvariants.com/incinf.dir/kriegspiel2.html,
     https://web.archive.org/web/20040214093653/http://www.chessvariants.com/incinf.dir/kriegspiel.html,
     https://handbook.fide.com/chapter/E012023.
2. **Section 1, why ICC and the other rule sets: corrected.** "Most widespread ... the one research programs use"
   became "best-documented; the Bologna programs use it; Berkeley uses its own set". Several descriptions were fixed:
   "Traditional English club rules" became "traditional rules" (none of the cited sources describes them as
   English); Cincinnati also lets both players hear "No"; RAND is described as Wikipedia describes it. New: a list
   of the three points where ICC is silent or the sources disagree, and how this spec decides them. Sources: as in
   change 1.
3. **Section 2.1: "identical to darkchess 2.1 to 2.5" was wrong.** Dark chess has no check, but classical Kriegspiel
   keeps it: a move into check, and castling out of, through or into check, are illegal and get "No". A "Check
   (classical only)" bullet now says so and that the quantum adaptation drops these conditions. Also added: square
   naming (a1 dark), White moves first, the exact en passant and castling conditions, and the owner's choice of
   promotion piece. Sources: https://handbook.fide.com/chapter/E012023 (3.7, 3.8.2, 3.9, 5);
   `src/variants/core/orthodox.js` (`castlingMoves`: "There is no check in Quantum Chess, so the only condition is
   that every square the king and the rook cross or land on is empty").
4. **Section 2.2, the umpire's protocol: made exact.**
   - ICC has no "Nonsense": it answers "Illegal move" to every refused attempt. That impossible moves cannot be
     entered is now described as a client-side convention, which this spec keeps.
   - Captures use ICC's wording, and **the announced square is where the captured unit stood**. For en passant that
     is the passing pawn's square, not the skipped square. The ICC wording is "`Pawn at <square> captured`".
     Cincinnati says: "the square the captured piece is to be removed from. (Keep this wording in mind for an en
     passant capture.)" Berkeley says: "the square of the piece captured". Only the old traditional rules name the
     arrival square, and they also say "en passant" aloud.
   - Check directions are given from the king's point of view, with ICC's own e1–h4 example.
   - Pawn tries count only **legal** pawn captures (ICC: "number of legal capturing moves using pawns").
   - "The usual draws" was replaced by what the sources say, including their contradiction (Olympiad versus
     Ciancarini and Favini).
   - The unsourced "attempting to move into check is the most common 'No'" was replaced by the ICC help file's
     wording.

   Sources: the ICC help file, the Cincinnati page, the Berkeley rules, the Olympiad rules and the Ciancarini and
   Favini paper (URLs in change 1).
5. **3.5 captures, K-5, K-9, rules card item 4, test K5: the en passant square fixed.** The spec announced en
   passant on "the square the capturing pawn moved to" (`d6` after `e5-d6`), which tells the victim that a pawn was
   taken on a square where none of theirs stood. The announcement now gives the passing pawn's square (`d5`), which
   is `x.epVictim` of `prev`. The core's `branch.captures` still records `d6`, so `announce` has to map it. Checked on
   the core: after `d7-d5`, `e5-d6` has 1 outcome, `capture`, with `branch.captures` = `['d6']`; d5 is then empty and
   d6 holds the White pawn. Also: why en passant is the same in every world, the fuzz assertion, and a note for the
   computer's "last capture" refinement. Sources: as in change 4.
6. **3.5 tries:** it now says the ICC help file does not define how a capture with promotion counts, so counting it
   once is this spec's choice. On ICC only legal pawn captures count, so a pinned pawn's capture does not. That
   exclusion falls away without check. Source: ICC help file; Cincinnati page ("Knotty point ... Answer: no").
7. **3.2, 3.6 and K-14: `quiet` is not public.** The core resets it on pawn moves (`stateAfter`: solid, non-royal
   mover), and the opponent's pawn moves are never announced on ICC (their moves "show up in the form '?' or
   '?xf3'"). A public counter would reveal them, so `ownView` and `aiView` return `quiet: 0` and the UI does not show
   it. This matches the same fix in `darkchess` (its 8.1, change 13). Source: ICC help file;
   `src/variants/core/quantum.js` (`stateAfter`).
8. **K-9, castling:** the condition is now the core's (every square the king and rook cross or land on is empty,
   rights intact). It states that castling out of, through or into check is legal here, and that classical
   Kriegspiel would say "No". K13 has two new cases (castling out of check, castling across the attacked f1), both
   computed on the core: 1 outcome, `move`. Sources: FIDE 3.8.2.2; `src/variants/core/orthodox.js`
   (`castlingMoves`).
9. **K-14, draws:** now complete. It lists the 50-move rule with its hidden counter, the 600-ply limit and the
   no-legal-move draw. It also says there is no checkmate, no stalemate (the king must still move), no repetition draw
   and no insufficient-material draw, and that these are a choice because the ICC sources disagree. Sources:
   Olympiad rules, Ciancarini and Favini (URLs in change 1).
10. **Section 5, rules card:** item 4 says "the square of the captured piece" (this makes en passant unambiguous).
    Item 5 says both players hear the pawn-try count before each turn, en passant included, as on ICC. Item 6 adds
    that there is no checkmate and that moving into check and castling out of, through or into check are allowed.
    It also says en passant is never announced as such. These are the classical rules a Kriegspiel player would
    otherwise get wrong. Sources: the ICC help file, the Ciancarini and Favini paper,
    `src/variants/core/orthodox.js`.
11. **Section 7:** K4 has ICC's own example (king e1, bishop h4 → `short`; bishop a5 → `long`), computed on the core.
    K5 has the en passant announcement on d5. K13 has the two castling-through-check cases. K15 has two more
    assertions. The header notes that the prototype imports point to a stale path (`/home/user/Quantum_Chess`) and
    that the prototype names the diagonals differently.

Checked and unchanged: the board and square names, the setup, the movement of all six pieces, the double step, en
passant timing, promotion to Q/R/B/N, White moving first, the five check directions and the long/short formula (the
two diagonals never have equal length on 8 × 8, and e1 gives short = e1–h4 as ICC says), pawn tries announced to both
players and including en passant, nothing announced for promotions, castling or refused attempts, and every
expected value in K1–K14 (`handoff/tmp/kriegspiel-rev1/tests.mjs`).

### 8.2 Engine review

Reviewer lens: engine and quantum consistency. The review ran in two passes on 2026-09-25. Both kept the corrections
of 8.1.

- **First pass** (changes 1-15): checked against the committed core (`src/variants/core/`, unchanged in the working
  tree at the time) and the planned core changes in `handoff/CORE-CHANGES.md` (with the lead's decisions D1-D6). It
  also used `docs/rules.md`, `docs/variants.md`, `IMPLEMENTING.md` and the UI code that the leak checklist names
  (`useVariantGame.js`, `VariantGameView.vue`).
- **Second pass** (changes 16-27): re-checked everything on the core in the working tree, after the core team landed
  the changes of CORE-CHANGES.md (Q1-Q14, W1-W7, and U9 / U10 in the UI). It supersedes change 10 and the old list
  of core changes.

Evidence of the first pass, all in `handoff/tmp/critic-kriegspiel/`:

- `kp.mjs`: the hooks of section 3 (`recordInfo` included, pawn tries counted on legal keys), on the real core
  (`CORE=real`) or on `core2/`, a scratch copy of the core with the planned Q1 (simplified: `applyMiss` on every idle
  world), Q2, Q3, Q9, W4 and W5 (`CORE=planned`).
- `tests.mjs`: every test of section 7 on both cores (`real.txt`, `planned.txt`). The two cores differ only in K13
  (second case) and K16, exactly as the tests say; `record.info.announce` is stored by Q9 and equals the recomputed
  object. `k21.mjs`: test K21.
- `fuzz.mjs`: 12 runs of 10 games (6 seeds per core, run in parallel), 13,849 plies, with attempts chosen as a player
  would (candidates, and splits, merges and measurements picked on the own view): 1,989 splits, 353 merges, 52
  measurements, 565 rolled Missed results, 1,233 checks with `p < 1`, up to 64 worlds, 6,958 refused attempts. No
  invariant of K15 broke: no square ever held pieces of both sides, every real move was a candidate, every legal
  real merge and measurement was legal on the own view, `check` was non-null exactly when `royalDanger > 0`, every
  announced capture square held an enemy unit, and with the planned core `x.ep` and `x.castle` were the same in every
  world. It found 42 legal real splits that the own view rejects (see change 2).
- `aicheck.mjs`: reviewer 1's `aiView` on 3,281 states of random quantum games: weights sum to T, one enemy king per
  world, no phantom on a square that holds an own piece in any world (after adding `quiet: 0` and converting the
  announced square names, see change 6).

Changes:

1. **Section 3 (code block, table), 3.5: the hooks now match the planned core.** The spec asked for a
   Kriegspiel-specific `announce` hook in `stateAfter`. CORE-CHANGES.md (row 41) builds the generic `recordInfo`
   (Q9) instead, stored as `record.info`, and `infoText` (U9) for display; `ownView`, `hiddenStyle` and `umpire` are
   U10(b)-(d). The spec now returns `{ announce }` from `recordInfo` and reads `record.info.announce` everywhere
   (3.6, section 7), names the core item behind every new hook, and says that the planned `applyMiss` (W4) and
   `unifyWorlds` (W5) of `orthodoxSpec()` must be kept.
2. **3.2, 3.4, K-8, leak checklist, new test K21: the real state decides every attempt.** The old rule was "check
   the attempt on `ownView` first; if it is illegal there, show the normal message". The fuzz found legal splits
   that the own view rejects: a split child blocked by a hidden piece stays home, and when the blocked worlds line up
   with the player's own ghosts the real split has **fewer** arrangements than the own view (K21: budget 8 on the
   real state, 12 on the own view). The old rule would have refused a legal move. Now every attempt goes to the real
   state; the own view only picks the clickable squares and, after a refusal, the message. The relations that do
   hold were verified and written down (real split targets are own-view targets; legal real merges and
   measurements are legal on the own view).
3. **Section 4 intro, K-1, K-9, 3.3, 3.4, K13: castling never rolls.** The spec said a possible blocker makes
   castling a roll. That is today's core, which the lead ruled a bug (D1, Q2; docs/rules.md 5: every square between
   king and rook "empty for certain", "castling never rolls"). Castling is now legal only when possible in every
   possibility, otherwise the umpire says "No"; K13's second case is "No" (today's core: `[miss 0.5, move 0.5]`),
   and a new case shows certain castling (bishop c4 / b5: 1 outcome, `move`, not rolled). The castling right follows
   W5. `candidateMoves` offers castling only when it is certain on the own view; the invariant still holds.
4. **3.5, K-9, new test K16: en passant is certain and expires.** 3.5 argued that "every world of `prev` has the same
   `x.ep`". On today's core that is false: a partly missed move leaves a stale en passant square in some worlds
   (K16: `e4-d3` is `[miss 0.75, capture 0.25]` two plies late). With W4 (the square is cleared in every idle world
   and on Measure turns) and Q2 (en passant only when every world generates it) the argument holds; the text now
   rests on them, and K16 checks `tries` = 0 and "No" on the planned core. `tries` is now defined on the **legal**
   keys (ICC: "legal capturing moves using pawns"), so it can never count a key the umpire would refuse.
5. **3.5, K-5: why announcements are never uncertain.** Added the missing half of the argument: a move is rolled
   whenever its target might hold a piece, so an unrolled branch never captures, and a capture branch captures in
   all its worlds on one square. `check` is non-null exactly when `p > 0` (the same enemy moves).
6. **3.6: the computer's view.** Announcements come from `record.info.announce`. The list of what the computer must
   not read now names the other fields of the opponent's records (`options` is the number of outcomes, `captures`
   is the capturer's landing square, which reveals en passant). Phantoms must avoid every square that holds an own
   piece in **any** world, as `ai2.mjs` does; the text said "empty in that world", which would put both sides on
   one square across worlds (never the case in a real state, K-4) and make `ownPieceAt` refuse the computer's own
   measure and merge of that ghost. Two prototype slips noted for implementers: `ai2.mjs` omits `quiet: 0`, and it
   expects announced squares as indexes while 3.5 uses names.
7. **K-2, new test K19: the budget fallback.** K-2 said "otherwise linked". The core rolls a pass = link move when
   the link would push the mover over budget 8 (`moveBranches`), and whether it would depends on where hidden pieces
   block. K19 shows the same slide linked with budget 2 and rolled (`[miss 0.5, move 0.5]`) with budget 8.
8. **K-3, section 6, leak checklist: the roll itself is hidden information.** `lastRoll` is set only when the move
   had several outcomes or was rolled, and own history rows show the roll marker only when `rolled`. Whether a
   move was rolled depends on hidden pieces (a pawn push is rolled only if an enemy piece might block it), so both
   leak. U10(d) removes only the percentage and the notes. The spec now requires the same result box and row text
   after every own move, rolled or not.
9. **K-4, new test K20, leak checklist: one side per square.** Every move onto a possibly occupied square is rolled
   and a split needs certainly empty squares, so no square ever holds pieces of both sides in different worlds
   (fuzz: never broken on either core). Consequences written down: a measurement never depends on hidden pieces
   (the old checklist item claimed the measure check "reveals whether an enemy might share a part's square"; it
   cannot), and `aiView` phantoms must respect it (change 6).
10. **K-6, rules card item 4, new test K18: the check chance.** *(Superseded by change 17: Q7 made `royalDanger`
    count merges.)* `p` was `royalDanger`: the best single enemy move, merges not counted, like the danger display of
    every variant at the time. K18: 50 % announced while the merge captures for certain. The rules card said "a
    single enemy move".
11. **K-8, K-6, new test K17: measurements.** A measurement is announced only through what it causes: K17 shows a
    measurement that gives check (rook settles on a8: `{ dirs: ['rank'], p: 1 }`) and the opponent's linked knight
    becoming solid in their own view.
12. **K-14:** the quiet counter follows Q8 (a Missed pawn move no longer resets it), and the classic "king cannot
    escape" loss of docs/rules.md 5 is not part of the variants core (it would also be computed from hidden pieces).
13. **Section 5, rules card:** item 2 now covers every "No" (impossible everywhere; castling or a split that needs a
    square where a hidden piece might be); item 3 says the player sees only the result; item 4 "a single enemy
    move" and item 5 "could try" (both reworded again in change 21); item 7 names the two real causes of a sudden
    collapse (an enemy move landed on a square of the ghost, or settled a piece it was linked to) instead of "the
    enemy did something".
14. **Section 6:** the umpire box is built from `infoText` for the records of both sides, and the opponent's lines stay
    visible although `hideLast` hides the opponent's roll box; "Refused this turn" is composable state, cleared
    before the hand-over. Leak checklist additions: secret history rows print `record.captures` ("Capture on d6" after
    en passant, which the umpire announces on d5, so the victim learns it was en passant); the opponent's record
    fields must not be rendered; in hidden pass & play `viewer` follows `state.turn`, so the hand-over must hold the
    mover's view.
15. **Section 7:** header (announcements in `record.info.announce`, values computed on the planned core, which tests
    differ today); K13 as in change 3; K15 assertions updated (one side per square, the own-view relations of change
    2 and **not** "every legal real split is legal on the own view", check versus `royalDanger`, stored equals
    recomputed announcement, uniform `x.ep` / `x.castle`, phantoms off own squares); new K16-K21.

Checked and unchanged in the first pass: the five check directions and the long/short formula; the en passant
announcement on the passing pawn's square (both cores); K1-K12 and K14 on both cores; the knowledge contract of the
computer; no announcement of the mover's own danger; the reveal at the end; the layout (the standard
`rectTopology(8, 8)` board of `orthodoxSpec()`, no layout hook needed).

#### Second pass: the core with the changes of CORE-CHANGES.md

Evidence, all in `handoff/tmp/critic-kriegspiel/`, on the core in the working tree (`src/variants/core/` with
Q1-Q14 and W1-W7; `src/variantplay/` and `src/views/` with U9 and U10):

- `r2_kp.mjs`: the hooks of section 3 (`visibility`, `ownView`, `candidateMoves`, `recordInfo` with `announce`),
  plus `aiView` with the refinements (a), (b), (c) of 3.6, `evaluate`, and the refusal notice of 3.4.
- `r2_tests.mjs`: every test of section 7 (K1-K23) as 70 assertions: all pass. The first pass's `tests.mjs` on the
  same core (`real3.txt`) differs from its planned-core output (`planned.txt`) only in K18 (change 17).
- `r2_fuzz.mjs`: 8 seeded runs (6 of 5 games, 2 of 3 games that also call the computer every 7 plies), 4,293 plies
  with attempts chosen as a player would: 622 splits, 112 merges, 15 measurements, 146 rolled Missed results, 2,089
  refused attempts, 1,198 checks (324 with `p < 1`, 84 where a merge made `p` higher than every single move), up to 64
  worlds, 113 calls of `chooseMove` with the full `aiView`. No invariant of K15 broke, the new ones included: one side
  per square in the real state and in the computer's view, stored `record.info.announce` equal to the recomputed one,
  `x.ep` and `x.castle` the same in every world, no roll notes, and the computer always found a legal move. The first
  pass's `fuzz.mjs` on the same core (3 seeds, 1,884 plies, `r2_fz_*.txt`): no invariant broken.

Changes:

16. **Header, section 3 (intro, table), 3.5, section 4 intro, K-4, K-9, K-14, section 7 (header, K13, K16): the core
    changes are in.** The working tree now holds the core items the spec called "planned" (Q1-Q14, W1-W7 in
    `quantum.js`, `variant.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`; U9 and U10 in `panel.js`,
    `useVariantGame.js`, `VariantGameView.vue`, `VariantBoard.vue`). "Planned" and "today's core" were replaced;
    the notes about the committed core from before the changes are now in the past tense, and the values of section
    7 are those of the working-tree core. The sentence "until Q9 lands, the UI can replay the moves" was removed.
17. **3.5 (check), K-6, rules card item 4, K18 rewritten: converging captures count in the check chance.** Core item
    Q7 (a bug fix against docs/rules.md 5: the danger ring "counts converging captures") made `royalDanger` count
    merges, and the working-tree core does (`mergeDanger`). The spec said "merges are not counted" and K18 expected
    0.5. On the core, K18 gives 1: each part of the queen captures in half the possibilities, and the merge
    `a4|h5-e8` captures for certain. K18 now also checks the announcement after a White move (1) and a third
    possibility where the queen cannot reach e8 (2/3 against 1/3 for the best single move). In the fuzz, 84 of
    1,198 checks had a higher `p` because of a merge. The directions do not change: in each world a merge plays the
    ordinary move of the part that stands there, so `dirs` (read from `generate`) already holds it, and `check` is
    still non-null exactly when `p > 0`.
18. **3.4 and new test K22: the notice for a refused ordinary move.** The rule "the normal message when the attempt is
    also illegal on the own view" gave the normal message to every refused pawn try, because a pawn try is always
    illegal on the own view: its target is empty there. That tells the player the move was impossible from their
    own knowledge, which it was not. Now an ordinary move always gets the umpire's "No", and only splits, merges and
    measurements look at the own view. This is also what `refusalKind` in `src/variantplay/panel.js` does.
19. **3.6 (knowledge item 4, refinement (c)), new test K23, core change 1: the computer could stop playing.**
    `chooseMove` keeps only the view's candidates that the real state accepts and returns null when none is left.
    `runComputer` in `useVariantGame.js` then plays nothing, and the game waits forever. K23 is a real case: the
    baseline view offers only pushes that the umpire refuses, while the four legal pawn captures have no phantom on
    their targets. Refinement (c) solves that case, so it is now required at every level. 3.6 now also shows why
    every real pawn capture is then a candidate. One case remains: legal pawn pushes onto squares where the view has
    a phantom slot, in a position where no other piece can move. So `chooseMove` needs a fallback: try the moves a
    player could try, in random order, until the umpire accepts one. That is fair, because it uses only the umpire's
    answers.
20. **3.6 refinement (b): the check penalty needs its side.** The computer's reply search evaluates the opponent with
    `evaluateState(V, n, them)`, which calls `evaluate(w, them)`. A term "the own king still stands on an announced
    line" would then read the opponent's phantom king. `x.aiCheck` now stores `side`, and the term is −250 for that
    side and +250 for the other. Also: the phantom king stands on the same square in every view world (kings are
    solid), which the text now says. Checked with `r2_kp.mjs` (K12, the fuzz).
21. **Rules card items 4 and 5.** Item 4: "the chance that one enemy move, a merge included, could capture the king"
    (change 17). Item 5: "how many pawn captures the player to move could try" suggested every pawn try a player may
    attempt (K1 has 14 of them, and the count is 0). It counts the pawn captures that are possible in some
    possibility, so it now says "might be able to make".
22. **K-10, K9, K15: Kriegspiel never has a settling roll.** Every move that can capture is rolled, so a capture branch
    captures on one square in all its worlds, and kings and pawns are solid. So the worlds of an outcome never
    disagree on a solid piece or on a king capture, and the solid roll and the game-end roll never happen. K9 was
    titled "the game-end roll", but its roll is the landing roll (notes `[]`). The fuzz now asserts that no outcome
    has notes (none in 4,293 plies).
23. **K-14 and the section 3 table: two draws of docs/rules.md 6 made explicit.** The spec said "the shared rules
    apply" but did not mention two draws that docs/rules.md 6 lists for classic Quantum Chess. One is the automatic
    draw when only the two kings are left. The other is that the draws wait while the player to move can take the
    king for certain. Neither is used, as in `darkchess`; the variants core has neither (CORE-CHANGES items 40 and
    72). The behaviour is unchanged: the spec already had no insufficient-material draw.
24. **Section 4 intro, K-2: Q14.** A part that moves onto another part of the same piece joins it without a roll.
    K-2 said "rolled if it lands where a piece might be"; it now says "another piece". In Kriegspiel no enemy piece
    can stand on the own part's square (K-4), so such a move is never a landing roll.
25. **Section 6.** Opponent rows say "A move", as the working-tree `historyRows` does, not "Moved". "Moved" is also the
    result of an own move and would read as "the opponent's move did not miss". The fog-free board (U10(c)) is
    built. The leak checklist says that U9 and U10 are built and that the component tests must still check every
    item.
26. **K15:** new assertions (no roll notes; the computer finds a move; no square of the computer's view holds both
    sides), and the condition "once Q2, W4 and W5 are in" was dropped.
27. **Section 7:** new tests K22 (the refusal notice) and K23 (the computer never stalls); K18 rewritten (change 17);
    the header names the evidence.

Checked and unchanged in the second pass: every other expected value of K1-K21 on the working-tree core; the
invariant `ordinaryMoves(real)` ⊆ `candidateMoves`, with castling offered only when it is certain on the own view;
one side per square; en passant certain, uniform and announced on the passing pawn's square (K5, K16); castling
certain-only and its rights unified (K13, fuzz); the budget fallback (K19) and the split that is legal only in
reality (K21, and 15 more cases in the fuzz runs); `recordInfo` called once per played move, not in light mode,
after the result (`stateAfter`), and rebuilt identically by a replay; the pawn-try count on legal keys; the
knowledge contract of the computer (K12 with the full `aiView`); the layout (the standard `rectTopology(8, 8)`
board of `orthodoxSpec()`, no layout hook needed).

**Core changes needed** (this list replaces the first pass's).

Planned in `handoff/CORE-CHANGES.md` and now in the working tree, needed as built: Q1 + W4 (en passant expiry), Q2
(castling and en passant certain-only), Q3 + W5 (castling rights follow the state), Q7 (converging captures in
`royalDanger`), Q8 (quiet counter), Q9 (`recordInfo`, `record.info`), Q14 (a part joins its own part), U5 (opponent
budget "?"), U9 (`infoText`) and U10 (a)-(f). Also built: the five ai-ui items the first pass asked for. They are the
umpire's lines for every record, the opponent's included; the same result box and row after every own move; the
own view only choosing squares, with the notice rule of change 18; "Refused this turn"; and the hand-over keeping the
mover's view (`panel.js`, `useVariantGame.js`, `VariantGameView.vue`).

Not built yet:

1. **A computer that always moves** (`src/variants/core/ai.js`, package "ai-ui"). In `chooseMove`, when `V.aiView` is
   set and no candidate of the view is legal on the real state, the computer must still play if the real state has a
   legal move. Build the list of codes a player could attempt:
   - `V.candidateMoves(real)` when the variant has that hook, else the codes of `legalMoves(V, real)`;
   - then, when the variant has `ownView`, the measure and merge codes of `legalMoves(V, V.ownView(real, me))`.

   Shuffle the list with the search's `rng` and return the first code for which `branches(V, real, code)` is not
   null. Return null only when none is legal. Variants without `aiView` are unchanged. Test: K23 with the baseline
   view returns one of `a2-b3`, `b2-a3`, `b2-c3`, `c2-b3`.
