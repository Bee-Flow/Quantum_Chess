# Variant spec: `horde` (Horde)

Category: `rules`. UI name: "Horde". Summary line (already in `catalog.js`): "White has 36 pawns against the complete
black army."

---

## 1. Sources and chosen rule set

Research note: the original research could not open web pages and relied on the scalachess source plus
search-engine extracts. The source review (section 8.1) fetched every page below and read the scalachess,
Fairy-Stockfish and PyChess sources in `handoff/ext/`. Every test case in section 7 was run on a prototype built on
the real `src/variants/core` (`handoff/prototypes/anti/proto.mjs`, `thorde.mjs`; the imports there point to
`/home/user/Quantum_Chess` and must be changed to the local checkout before they run). The engine review (section
8.2) wrote the variant again from section 3 alone and ran every test of section 7 as Vitest tests on the real core
(`handoff/tmp/critic-horde/`, git-ignored).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/horde (page subtitle: "One side has a large number of pawns, the other has a normal army.") | "Horde chess is a variant where white has 36 pawns (which will be referred to as The Pawns) and black (The Pieces) needs to destroy the Horde to win." "A move is legal if and only if it is legal in standard chess for a similar position", with one exception for the Pawns: "Pawns on the first rank may move two squares, similar to Pawns on the second rank. However, Pawns of the Pieces may not capture Pawns on the first rank that have moved two squares as it is not a valid en passant capture." "The Pieces win by capturing all the Pawns. This includes pieces promoted from the Pawns." "The Pawns win by checkmating the King of the Pieces." |
| scalachess `core/src/main/scala/variant/Horde.scala` (https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Horde.scala) | Exact setup: white pawns on every square of ranks 1-4 plus **b5, c5, f5, g5**, black ordinary army. `initialFen = rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1`. `castles = Castles.black` (only Black may castle). `specialEnd`: White has no pieces left, which means Black wins. `isInsufficientMaterial` (the automatic draw) is only `hordeClosedPosition`, a fortress test; the long list of White material that cannot mate (`hasInsufficientMaterial`) is used only when Black runs out of time. Black never has insufficient material. |
| scalachess `Position.scala` | `genPawn`: in horde, double steps may **land on rank 3 or rank 4** for White, so pawns on rank 1 and rank 2 may double-step when both squares are empty. `potentialEpSquare`: no en passant square after a double step that starts on the pawn's own back rank. Promotion roles: Q, R, B, N (the default). |
| scalachess `variant/Variant.scala` | Horde does not override `staleMate` (not in check and no legal move), so a stalemate of either side is a draw. `autoDraw`: 50-move rule (100 half-moves without a pawn move, capture or promotion) and fivefold repetition end the game automatically. |
| Fairy-Stockfish `src/variant.cpp`, `horde_variant()` (https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/src/variant.cpp); PyChess plays Horde through it | The same start FEN with `kq`; `doubleStepRegion[WHITE] \|= Rank1BB`; `enPassantRegion[WHITE] = Rank6BB`, `enPassantRegion[BLACK] = Rank3BB` ("exclude en passant on second rank"); losing all pieces loses (`extinctionPieceTypes = ALL_PIECES`). |
| scalachess `test-kit/src/test/resources/horde.perft` | Three perft positions (start, open flank, en passant) to depth 4. The review reproduced all twelve numbers with the core move generator (section 8.1). |
| lichess forum, "[Horde] Missing rule?", "Horde: En Passant wasn't allowed when a pawn moved two squares up from the back rank", "Horde Rules ??" | These confirm the no-en-passant rule for first-rank double steps, and that a stalemate of either side is a draw (White can be stalemated). |
| Wikipedia, "Dunsany's chess" (https://en.wikipedia.org/wiki/Dunsany%27s_chess); chess.com, "Horde Chess" (https://www.chess.com/terms/horde-chess) | The history. Dunsany's chess (Lord Dunsany, 1942): **White** has 32 pawns on ranks 1-4, Black has the ordinary army and **moves first**; only Black's pawns may double-step. Horde chess (Filip Rachunek, 2002) turned the colours round: White has the army and moves first, Black has 32 pawns. The "Horde variant" gives White 36 pawns; "White's pawns on the first and second ranks may advance one or two steps, provided that the path on the file is free. Unlike in regular chess, this does not have to be the pawn's first move." chess.com: "The game draws after a stalemate." |

**Chosen rule set: lichess Horde (the current `Horde.scala`).**

- The exact 36-pawn setup, and White (the horde) moves first.
- First-rank double steps, which cannot be captured en passant.
- Only Black castles. Promotion as in chess.
- White wins by checkmate, which in the quantum game means capturing the king (section 4). Black wins by capturing
  every White piece. Stalemate is a draw.

Other versions (Dunsany's 32 pawns with the pieces moving first, Rachunek's 32-pawn Horde with the pawns as Black)
are not used. lichess is the version players know, and the user names it.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- Ordinary 8 × 8 board. Files `a`-`h` (x = 0..7), ranks `1`-`8` (y = 0..7), names `a1` … `h8`, all 64 squares exist.
- Square index `y * 8 + x` (a1 = 0, h1 = 7, a8 = 56, h8 = 63).

### 2.2 Pieces and movement

The ordinary chess pieces, with ordinary moves.

| Piece | Descriptor |
|---|---|
| King (Black only) | `leap` (±1, 0), (0, ±1), (±1, ±1). Royal. |
| Queen | `ride` (±1, 0), (0, ±1), (±1, ±1) |
| Rook | `ride` (±1, 0), (0, ±1) |
| Bishop | `ride` (±1, ±1) |
| Knight | `leap` (±1, ±2), (±2, ±1) |
| Pawn | `leap [(0, 1)]` oriented, mode move; `leap [(1, 1), (−1, 1)]` oriented, mode capture. **Double step:** White pawns on rank 1 **or** rank 2, Black pawns on rank 7, when both squares ahead are empty. En passant (section 2.4). |

A White pawn on rank 1 moves exactly like any other White pawn: one square forward, or diagonally forward to
capture (onto rank 2), plus the double step to rank 3.

### 2.3 Setup (every square)

- **White: 36 pawns, no other pieces.**
  - rank 1: a1 b1 c1 d1 e1 f1 g1 h1;
  - rank 2: a2 b2 c2 d2 e2 f2 g2 h2;
  - rank 3: a3 b3 c3 d3 e3 f3 g3 h3;
  - rank 4: a4 b4 c4 d4 e4 f4 g4 h4;
  - rank 5: **b5 c5 f5 g5**.
- **Black:** ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pawns a7 b7 c7 d7 e7 f7 g7 h7.
- Castling rights: Black `k` (Ke8-g8, Rh8-f8) and `q` (Ke8-c8, Ra8-d8). White has none.
- The en passant square is empty. **White moves first.**

In the start position White has exactly **8** legal moves: a4-a5, d4-d5, e4-e5, h4-h5, b5-b6, c5-c6, f5-f6, g5-g6.

### 2.4 Special moves and promotion

- **Double step.**
  - A White pawn on rank 1 may move to rank 3, and one on rank 2 to rank 4, if both squares ahead are empty.
  - A Black pawn on rank 7 may move to rank 5.
  - Only the rank decides, not whether the pawn has moved before: a pawn that stepped from rank 1 to rank 2 may
    still double-step from rank 2.
- **En passant.**
  - After a double step **from rank 2** (White) or **from rank 7** (Black), an enemy pawn may capture it en passant
    on the next move, as in chess.
  - After a double step **from rank 1** there is **no** en passant: the skipped square on rank 2 is not an en passant
    square.
- **Castling.** Black only (rights `kq`), with the ordinary chess rules: the king and that rook have not moved,
  the squares between them are empty, and the king is not in check and does not cross or land on a square a White
  piece attacks. Section 4.5 drops the check conditions.
- **Promotion.** A White pawn reaching rank 8, or a Black pawn reaching rank 1, promotes to a queen, rook, bishop or
  knight. White's promoted pieces are ordinary pieces of the horde.

### 2.5 Win, draw and turn order (classical, lichess)

- **White wins** by checkmating the Black king.
- **Black wins** by capturing every White piece: all pawns and any promoted pieces.
- **Draw**
  - Stalemate of either side: the side to move is not in check and has no legal move. White is stalemated when
    none of its pieces can move, for example when every pawn is blocked and has nothing to capture and there is no
    promoted piece with a move.
  - The "closed position" (fortress) draw, lichess's only automatic insufficient-material draw in Horde
    (`Horde.isInsufficientMaterial` = `hordeClosedPosition`): with White to move, White has no legal move; with Black
    to move, every legal Black move leaves White without a legal move. Exception for the second case: when White has
    a single piece and Black attacks it, the game goes on, because Black can win by taking it. The first case is the
    stalemate above.
  - 50-move rule (automatic after 100 half-moves without a pawn move or capture) and repetition (threefold can be
    claimed, fivefold is automatic).
  - lichess's list of White material that can never mate (a lone piece against a lone king, two knights, ...) is
    **not** a draw by itself. It only turns a Black loss on time into a draw. Black never has insufficient
    material.
- White moves first.

---

## 3. Engine mapping (contract)

Build the module by extending the object that `orthodoxSpec()` returns **in place**
(`defineVariant(Object.assign(orthodoxSpec(), { ... }))`), never a spread copy: `defineVariant` completes that object in
place, and the orthodox hooks refer to it (with a spread copy they see the unfinished original: for example
`orthodoxSpec().extraMoves` then throws `V.orient is not a function`). The horde's own hooks below refer to the same
object (`spec`). Set only the fields below. Keep every other field of `orthodoxSpec()`, in particular `applyMiss` (en
passant expiry, CORE-CHANGES W4) and `unifyWorlds` (castling rights follow the state, W5), which `orthodoxSpec()` has in
the current core (sections 4.4, 4.5; T21 and T23 fail without them). `spec` below is that object.

| Field | Value |
|---|---|
| `id`, `category` | `'horde'`, `'rules'` |
| `sides` | `whiteBlack()` (already set by `orthodoxSpec()`): side 0 is White (the horde, at the bottom), side 1 is Black. No teams. |
| `topology` | `standardBoard(8, 8).topology` (already set by `orthodoxSpec()`) |
| `types` | Unchanged from `orthodoxSpec()` (`orthodoxTypes`, promotion to q, r, b, n). **royal: `k`** (only Black has one). **solid: `k`, `p`.** **splittable: `q`, `r`, `b`, `n`**, which for White means only promoted pieces. |
| values | orthodox `VALUES` (K 400, Q 900, R 500, B 330, N 320, P 100). |
| `evaluate(w, side)` | Pawn advancement for the horde. `sum` = the sum of `ADV[spec.board.rankOf(sq)]` over the White pawns on the board, with `ADV = [0, 0, 0, 0, 10, 25, 60, 0]` (index = rank index 0..7; a pawn never stands on index 7). Return `+sum` for side 0 and `−sum` for side 1. Nothing else: material is counted by `ai.js` itself. The start position gives +40 / −40 (T22). |
| `setup()` | Build with `emptyWorld(spec)`. `addPiece(w, 'p', 0, sq)` for every square of ranks 1-4 and for b5, c5, f5, g5. Then the Black back rank `rnbqkbnr` on rank 8 and pawns a7-h7. Then `w.x = { ep: -1, epVictim: -1, castle: castlingRights(spec, w) }`, which gives only Black's `k` and `q`, because White has no king. |
| `extraMoves(w, side)` | `pawnExtras(spec, w, side, (s, sq) => (s === 0 ? rankOf(sq) <= 1 : rankOf(sq) === 6))` plus `castlingMoves(spec, w, side)`, with `rankOf = spec.board.rankOf` (rank index 0..7 from `orthodoxSpec()`). The moves keep their kinds `double`, `ep` and `castle`, which CORE-CHANGES Q2 relies on. |
| `afterMove(next, m)` | `orthodoxAfterMove(spec, next, m)`; then, if `m.kind === 'double'` and `rankOf(m.from) === 0` (White from rank 1): `next.x.ep = -1`, `next.x.epVictim = -1`. A double step from rank 2 keeps the en passant square on rank 3 that `orthodoxAfterMove` sets. |
| `worldResult(w, mover)` | **Required override.** The default "a side without royal pieces has lost" would declare Black the winner at once, because White never has a king. `mover` is the side that has just moved (the core passes `state.turn` from before the move, in `settle` and in `stateAfter`), so `1 - mover` is the side to move next. In this order: (1) no piece with `sd = 1`, type `k` and `sq >= 0`: `{ winner: 0, reason: 'king' }`. (2) no piece with `sd = 0` and `sq >= 0`: `{ winner: 1, reason: 'horde' }`. (3) `generate(spec, w, 1 - mover).size === 0`: `{ winner: null, reason: 'stalemate' }`. (4) Otherwise `null`. The order matters: a horde without pieces also has no move, so (2) must come before (3). `generate` is cached per world object, so (3) costs one move generation per new world, which the next turn's move table then reuses (except on the ply where `unifyWorlds` copies a world because a castling right is lost). (3) reads the castling rights through `generate`, although `unifyWorlds` (which runs after the game-end roll) may change them: this cannot change the result, because a world where Black can castle always has the king step to f8 or d8 as well. |
| `noMoves(state)` | `{ winner: null, reason: 'stalemate' }`. Only a safety net: (3) above ends the game first (it never fired in 59,163 fuzz plies, section 8.2). |
| `reasonText(reason)` | `'horde'` → `t('quantumchess', 'the horde was destroyed')`; `'stalemate'` → `t('quantumchess', 'stalemate')`; otherwise `null` (`'king'` is generic). |
| `sideInfo(state, side, viewer)` | Optional (CORE-CHANGES U6, built: `src/variantplay/panel.js` `sideInfoOf`). Side 0: `{ text: t('quantumchess', 'Horde: {count}', { count }), title: t('quantumchess', 'White pieces left. Black wins by capturing all of them.') }`, where `count` is the number of White pieces on the board in `state.worlds[0].b`. Side 1: `null`. The count is the same in every possibility (section 4.1), so no range is needed. |
| `visibility`, `options`, `passWhenStuck` | none (a side without a move is a draw, never a pass) |
| `maxPly`, `quietPlies` | defaults (600, 100) |
| `rules()` | section 5 |

No new core change is needed. Horde uses generic core changes from CORE-CHANGES.md, which are now in `src/variants/core`
and `src/variantplay`, all through `orthodoxSpec()` or the core, none with horde code: Q1 + W4 (en passant expires in
possibilities where the next turn did not happen, also on a Measure turn: T23), Q2 (castling and en passant are
certain-only and never roll: T9, T21), Q3 + W5 (castling rights follow the state: T21), Q4 (outcome labels after a
follow-up roll), Q8 (the quiet counter: T24), and, optionally, U6 (`sideInfo`: T22) and U14 (the computer treats moves
that might end the game, such as a stalemating block, as forcing). The 50-move counter works as in chess: a pawn move or
a capture that really happened resets it (a Missed pawn move adds 1, as `docs/rules.md` section 6 says), and moves of
the royal king or of promoted pieces do not (T24). Repetition draws are not carried over: the shared core has no
repetition rule (the same for every variant); `maxPly` and the 50-move counter end endless games. lichess's
closed-position draw is covered by the per-possibility stalemate draw (section 4.1).

---

## 4. Quantum adaptation

### 4.1 Winning

- **White wins by capturing the Black king**, as everywhere in Quantum Chess.
  - There is no check. Black may leave the king attacked, or move it onto an attacked square.
  - The king is solid, and the king-danger display works as usual. It only concerns Black: White has no royal
    piece, so `royalDanger(V, state, 0)` is always 0 (T7).
  - Consequence (decision): a classical stalemate of Black (king not attacked, but every king move steps into
    attack, and no other move) is **not** a draw here.
  - Update (handoff/LEAD-DECISIONS.md L1, which overrides this spec): the core's classic end rules apply. White
    wins at once when the Black king cannot escape (`cannotEscape`), including the classical stalemate above; a
    Black action that might capture the last White piece is an escape, since that outcome ends the game. White has
    no royal piece, so it never loses this way. The 50-move draw waits while White can capture the Black king for
    certain, but not while Black can capture the last White piece for certain. `bareKingsDraw` is off.
- **Black wins by capturing every White piece.**
  - Checked per possibility.
  - A capture always lands on an occupied square, so the capture roll itself decides whether the last White piece
    fell. Example: a ghost bishop part takes the last pawn, with odds of 50% Captured and 50% Missed (test T11).
  - The number of White pieces is the same in every possibility. A capture lands on a square that is occupied in
    some possibility, so it is rolled unless every possibility agrees; either way it happens in every possibility of
    an outcome or in none. So the "horde" result never needs the game-end roll, also when the last White piece is a
    promoted ghost (T18). The fuzz run of section 8.2 checked this after every move.
- **There is no insufficient-material draw** (decision).
  - lichess's list of White material that cannot mate only decides games lost on time, and it exists because
    White must *checkmate*. This game has no clock, and any White piece can capture a careless king.
  - lichess's one automatic material draw, the closed position (section 2.5), needs no rule of its own: when every
    Black move leaves the horde without a move, the per-possibility stalemate draw (section 4.2) ends the game right
    after Black's move, with the same result (Black's only other moves put its king where White can take it). When
    White has a single piece that Black attacks, Black can take it, as in lichess.
  - Black can always try to take the last White piece. The 50-move rule ends hopeless endings.

### 4.2 Stalemate: a draw, per possibility

- After every turn (a move, a split, a merge or a measure), `worldResult` checks whether the side to move next has
  **no ordinary move** in that possibility: `generate` returns nothing there. If so, that possibility is a draw. The
  side that has just moved is not checked: White may block its own last pawn, and the draw comes after Black's
  reply, unless that reply gives White a move again or takes White's last piece (T25; lichess's closed-position
  draw, section 2.5).
- The generic game-end roll then decides when this holds in some possibilities only. Examples:
  - a Black ghost knight part stands in front of White's last pawn, and Black plays an unrelated king move (T12):
    50% draw by stalemate, 50% play on, and the knight's place is settled by that roll;
  - a Black knight splits so that one part blocks White's last pawn (T17): the split is settled by the game-end
    roll at once, 50% draw, 50% the knight stands on its other square. This is the one way a split rolls: the
    split itself is not rolled, the game-end check after it is (`docs/variants.md`, shared rule 6).
- A split, a merge and a measure are not moves of a position. A possibility in which every White piece is blocked is
  a stalemate there, even if White could still measure or merge a ghost at the state level (T20).
- `worldResult` counts every generated move, including castling and en passant, which CORE-CHANGES Q2 refuses at the
  state level when they are not possible in every possibility. This never changes a result: a possibility where
  Black can castle also has the king step to f8 or d8, and the en passant square is the same in every possibility
  (section 4.4). The generic `noMoves` draw stays as a safety net only.
- Black is stalemated only when its king is walled in by its own pieces and none of them can move, because the king
  may always step, even into attack. The rule matters for the horde, whose pawns can all be blocked.

### 4.3 The horde is solid

- **Pawns are solid** (the shared rule). White starts with no piece that can split, so White has **no quantum moves
  of its own until it promotes**.
- White's quantum game:
  - probing Black's ghosts with pawn pushes and captures (rolled whenever the result differs between
    possibilities);
  - Black's sliding pieces cannot become linked to White pieces while White has no ghost; until then a Black slide
    can only be blocked "maybe" by a Black ghost;
  - later, splitting promoted pieces, or linking them by sliding past a Black ghost (pass = link).
- White's budget stays at 1 until a promoted piece becomes a ghost (by a split, or by a slide past a Black ghost).
- Decision: this asymmetry is kept. It is faithful to the variant (the horde *is* pawns), and it is easy to
  explain. It also gives Black's ghosts a natural enemy: every pawn push onto a ghost part is a probe.
- The balance is an open question (section 8).

### 4.4 Double steps and en passant

- A first-rank or second-rank double step is an ordinary solid pawn move. If the way might be blocked in some
  possibilities, it is **rolled**: Moved or Missed, never "one square instead".
- The en passant rules are kept per possibility: no en passant square after a double step from rank 1. The double
  step is rolled whenever its result differs between possibilities, so right after it the en passant square is the
  same in every possibility (T19).
- En passant follows `docs/rules.md` section 4 (CORE-CHANGES D2): it is certain, never rolled, and offered only when
  it is possible in every possibility (Q2), and only on the very next turn. In possibilities where that turn missed,
  the square expires too (Q1 with `orthodoxSpec().applyMiss`, W4), and so it does on a Measure turn (T23). The
  variant must not replace `applyMiss`: without it a stale square survives a Measure turn and a Missed push, and the
  en passant capture becomes legal two turns late (the control test of T23). The fuzz run of section 8.2 found no
  state in which the en passant square differs between possibilities.

### 4.5 Castling and everything else

- Black castles as in `docs/rules.md` section 5 (CORE-CHANGES D1):
  - classically (`castlingMoves`): the king and that rook stand on their start squares with the right (`k` or `q`)
    still held, and every square between them and their destinations is empty;
  - it is legal only when it is possible in **every** possibility, and it is never rolled (Q2). A Black ghost part
    on a square in between makes it illegal (T21);
  - the right is lost in every possibility as soon as the king or that rook is not 100% on its start square
    (Q3 with `orthodoxSpec().unifyWorlds`, W5), for example after a rook slide that only partly happened, and it
    does not come back when a measurement shows that the rook never left (T21); a White piece that captures on a8
    or h8 removes that right (`orthodoxAfterMove`, T8);
  - there is no check, so castling out of, through or into an attacked square is allowed (unlike lichess,
    section 2.4).
- Budget 8, the 4-square bound, split, merge, measure, land = roll, pass = link and the solid roll are all
  unchanged.
- White's promoted pieces split and merge like any other piece.

---

## 5. Player-facing rules text (rules card)

- White has 36 pawns and no king. Black has the ordinary army and moves second.
- White wins by capturing the Black king. There is no check, so Black must keep its king out of reach itself.
- Black wins by capturing every White piece, including pieces White got by promotion.
- White pawns on the first or the second rank may move two squares if both squares are free, even if they have
  moved before. A pawn that moves two squares from the first rank cannot be captured en passant.
- Only Black can castle. Pawns promote as usual.
- Pawns are always solid, so White can only split pieces it gets by promotion.
- Stalemate is a draw: if the player to move cannot move any piece, the game is drawn. If that is so in only some
  possibilities, a roll decides at once.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, `light` / `dark` shades, labels a-h and 1-8, White (the horde) at
  the bottom. cburnett sprites. There are no new glyphs.
- **Layout.** `standardBoard(8, 8)` from `orthodoxSpec()`; the layout API needs nothing else.
- **King danger.** The variant UI shows "Your king is in danger: {percent}" in the side panel for the viewing side
  (`useVariantGame` → `royalDanger(V, state, viewer)`). For White it is always 0 (no royal piece), so the line never
  appears for the horde. Nothing to do in the variant.
- **Piece counter** (optional, the generic `V.sideInfo(state, side, viewer)` hook, CORE-CHANGES U6, built; exact
  definition in section 3; T22). White's row shows "Horde: 36" (pawns plus promoted pieces), so players can see Black's
  goal. It is one number, because the count is the same in every possibility (section 4.1).
- **Result texts** (generic `resultText` with `reasonText` of section 3): "Black wins (the horde was destroyed)",
  "White wins (a king was captured)", "Draw (stalemate)". A game-end roll shows the generic notes "The game ends:
  Draw (stalemate)" or "The game goes on".
- **Performance note.** A world has 52 pieces at the start, and move generation runs in every possibility. `generate` is
  cached per world object, and the stalemate check in `worldResult` fills that cache for the next turn. Measured on the
  prototype and the current core (section 8.2; two runs on a shared machine): the check doubles the time of a full split
  list (mean 0.7-1.0 ms instead of 0.4-0.5 ms, worst 10-14 ms instead of 5-7 ms, over 640 positions of 12 random games
  with up to 24 possibilities); the slowest move of the fuzz run took about 20 ms; a Normal against Normal computer game
  of 112 plies took 0.8-1.2 s in total, at most 22-32 ms per move.

---

## 7. Test cases

Conventions:

- A state is built with `stateOf(V, worlds, turn, edit)` from `tests/js/variants/helpers.js`: one `worldFrom`
  placement per possibility, equal weights, with `x = { ep: -1, epVictim: -1, castle: [] }` unless stated otherwise.
  Capital letters are White and lower case is Black. White moves unless stated otherwise.
- "A knight 50% on d6 and 50% on a6" means two worlds, **in the order written**, that differ only in that piece's
  square. Every world lists the pieces in the same order (the pieces written first, then the ghost), because
  `worldFrom` numbers the pieces in order and a ghost must have the same id in every world.
- Outcomes are listed in the order `outcomes(V, state, code)` returns them: `miss`, `move`, `capture` for a rolled
  move; the outcomes of a game-end roll follow the order of the worlds; the outcomes of a Measure follow the square
  index (`a6` before `h6` before `b8`). Each is written `{ key, notes, p }`; "not rolled" means `rolled: false`.
  "Take `x`" means `applyOutcome` with the index of outcome `x`.
- All outcomes were produced on the real core with the CORE-CHANGES items in place (working tree of 2026-09-25,
  `quantum.js` of 17:50) by a prototype written from section 3 alone (`handoff/tmp/critic-horde/horde.mjs`);
  T1-T15 and T17-T25 are Vitest tests in `handoff/tmp/critic-horde/horde.spec.js`, T16 is
  `handoff/tmp/critic-horde/perft.mjs`.

**T1. Start.**
- `newGame(V)`: White has 36 pawns on exactly the squares of section 2.3.
- Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pa7-ph7.
- Castling rights: `k` (e8→g8, h8→f8) and `q` (e8→c8, a8→d8).
- White's legal moves, with splits, are exactly the 8 moves a4-a5, b5-b6, c5-c6, d4-d5, e4-e5, f5-f6, g5-g6, h4-h5.
  There are no splits. No result.
- After `e4-e5`, Black has exactly 15 legal moves without splits: a7-a5, a7-a6, b7-b6, b8-a6, b8-c6, c7-c6, d7-d5,
  d7-d6, e7-e6, f7-f6, g7-g6, g8-f6, g8-h6, h7-h5, h7-h6. With splits there are exactly 17: these and
  `b8-a6|c6`, `g8-f6|h6`.

**T2. Double step from rank 1: no en passant.**
- White Pa1; Black pb3, ke8.
- White's legal moves: `a1-a2`, `a1-a3`.
- After `a1-a3`: `x.ep = -1`, and Black's b3 pawn has only `b3-b2` (no `b3-a2`).

**T3. Double step from rank 2: en passant as usual.**
- White Pc2; Black pd4, ke8. After `c2-c4`: `x.ep = c3` (index 18), `x.epVictim = c4` (index 26).
- Black may play `d4-c3`, which captures with p = 1.
- That removes White's last piece: result `{ winner: 1, reason: 'horde' }`.

**T4. A blocked double step.**
- White Pa1, Pb1; Black na3, nb2, ke8.
- White's legal moves: exactly `a1-a2` and `a1-b2` (the capture onto rank 2).
- There is no `a1-a3` (a3 is occupied) and no b1 move (b2 is occupied, and a2 and c2 are empty).

**T5. White captures en passant after Black's double step.** White Pe5; Black pd7, ke8; Black to move. After
`d7-d5`, White's legal moves are `e5-e6` and `e5-d6`; `e5-d6` has one outcome `{ key: 'capture', notes: [], p: 1 }`.

**T6. Destroying the horde.** White Ph2; Black rh8, ke8; Black to move. `h8-h2` gives `{ winner: 1, reason:
'horde' }`.

**T7. No check; capturing the king wins.**
- White Pd6; Black ke8, ra8; Black to move.
- The king's moves are exactly `e8-d7`, `e8-d8`, `e8-e7`, `e8-f7`, `e8-f8`, although the d6 pawn attacks e7.
- After `e8-e7`, White has exactly `d6-d7` and `d6-e7`; `royalDanger(V, s, 1)` is 1 and `royalDanger(V, s, 0)` is 0.
  `d6-e7` gives `{ winner: 0, reason: 'king' }`.

**T8. Promotion.**
- White Pg7; Black rh8, ka8.
- White's legal moves: `g7-g8=q`, `g7-g8=r`, `g7-g8=b`, `g7-g8=n`, `g7-h8=q`, `g7-h8=r`, `g7-h8=b`, `g7-h8=n`.
- There is no promotion to a king.
- With the Black king on e8 instead and `x.castle = castlingRights(V, w)` (only `k`): after `g7-h8=q` White has a
  queen on h8 and `x.castle` is empty.

**T9. Black castles.** White Pa2; Black ra8, ke8, rh8 with `x.castle = castlingRights(V, w)`; Black to move. The
legal moves include `O-O` and `O-O-O`. `O-O` has one outcome, Moved with p = 1, not rolled. After it Black has
kg8, rf8, ra8 and `x.castle` is empty.

**T10. Quantum: a pawn probes a ghost.**
- White Pe5; Black ke8, and a knight 50% on d6 and 50% on a6.
- `e5-d6`: `{ key: 'miss', notes: [], p: 0.5 }` (one world left: the knight is 100% on a6, the pawn stays on e5)
  and `{ key: 'capture', notes: [], p: 0.5 }`.
- `e5-e6`: `{ key: 'move', notes: [], p: 1 }`.

**T11. Quantum: the last pawn and a ghost attacker.**
- White Ph2 (the only White piece); Black ke8, and a bishop 50% on c7 and 50% on a8. Black to move.
- `c7-h2` has two outcomes, each p = 0.5, without notes:
  - `miss`: no result, one world, and the bishop is 100% on a8;
  - `capture`: `{ winner: 1, reason: 'horde' }`.

**T12. Quantum: a stalemate settled by the game-end roll.**
- White Ph5 (the only White piece); Black ke8, and a knight 50% on h6 and 50% on b8 (worlds in that order). Black
  to move.
- `e8-d8` has two outcomes, each p = 0.5:
  - `{ key: 'move', notes: ['end:{"winner":null,"reason":"stalemate"}'], p: 0.5 }`: the knight is 100% on h6,
    blocking the pawn; result `{ winner: null, reason: 'stalemate' }`;
  - `{ key: 'move', notes: ['end:null'], p: 0.5 }`: one world, the knight is 100% on b8, and play goes on.

**T13. Quantum: only promoted pieces split.** White Qd1, Pa2; Black ke8, ph7. `splitTargets(V, s, d1)` has 21
squares and `splitTargets(V, s, a2)` none.

**T14. Quantum: a ghost attacks the king.**
- White: a queen 50% on e1 and 50% on a1, and Pa2; Black ke8.
- `e1-e8` has two outcomes, each p = 0.5, without notes:
  - `miss`: no result, and the queen is 100% on a1;
  - `capture`: `{ winner: 0, reason: 'king' }`.

**T15. Certain stalemate.** White Ph5; Black ng8, ke8; Black to move. `g8-h6` has one outcome
`{ key: 'move', notes: [], p: 1 }`; it blocks the pawn, and White has no move: `{ winner: null, reason: 'stalemate' }`.

**T16. Classical move generation against lichess (perft).**
- Positions and counts from scalachess `test-kit/src/test/resources/horde.perft`. Count classical moves with
  `generate` and `applyClassical` on single worlds (castling rights from the FEN via `castlingRights`, `ep = -1`).
- The variant has no check, so the test itself must filter Black's moves the classical way: drop a move that leaves
  the Black king attacked (`attacks(V, next, 0, kingSquare)`), and drop castling when the king is attacked or
  crosses an attacked square. White's moves are not filtered.
- Expected counts, depth 1 to 4:
  - `rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq -`: 8, 128, 1274, 23310;
  - `4k3/pp4q1/3P2p1/8/P3PP2/PPP2r2/PPP5/PPPP4 b - -`: 30, 241, 6633, 56539;
  - `k7/5p2/4p2P/3p2P1/2p2P2/1p2P2P/p2P2P1/2P2P2 w - -`: 13, 172, 2205, 33781.
- The third position checks the first-rank rule: with en passant allowed after a double step from rank 1 it gives
  13, 173, 2216, 34086.

**T17. Quantum: a split that might stalemate the horde is settled by the game-end roll.**
- White Ph5 (the only White piece); Black ke8, ng8. Black to move.
- `g8-f6|h6` has two outcomes (the split's worlds in target order, f6 first):
  - `{ key: 'split', notes: ['end:null'], p: 0.5 }`: one world, the knight is 100% on f6, no result, and Black's
    budget is 1;
  - `{ key: 'split', notes: ['end:{"winner":null,"reason":"stalemate"}'], p: 0.5 }`: the knight is 100% on h6 and
    blocks the pawn; result `{ winner: null, reason: 'stalemate' }`.
- `g8-e7|f6` (neither part blocks the pawn) has one outcome `{ key: 'split', notes: [], p: 1 }`.

**T18. Quantum: the last White piece is a promoted ghost.**
- White: a queen 50% on a1 and 50% on h1 (the only White piece); Black ke8, ra8. Black to move.
- `a8-a1` has two outcomes, each p = 0.5, without notes (no game-end roll):
  - `move`: no result, one world: the queen is 100% on h1 and the rook on a1;
  - `capture`: `{ winner: 1, reason: 'horde' }`.

**T19. Quantum: a rolled double step from rank 1.**
- White Pb1, Pg2; Black ke8, pc3, and a knight 50% on b2 and 50% on h6.
- `b1-b3` is legal and has two outcomes, each p = 0.5, without notes:
  - `miss`: one world; the pawn stays on b1 and the knight is 100% on b2;
  - `move`: one world with `x.ep = -1`; Black's c3 pawn has only `c3-c2` (no en passant `c3-b2`).

**T20. Quantum: a measure does not save a stalemated possibility.**
- White: a rook 50% on a1 and 50% on h1, Pa2, Pb1; Black ke8, na3, nb2. Black to move. With the rook on a1 no White
  piece can move.
- `e8-d8` has two outcomes, each p = 0.5:
  - `{ key: 'move', notes: ['end:{"winner":null,"reason":"stalemate"}'], p: 0.5 }`: result
    `{ winner: null, reason: 'stalemate' }`;
  - `{ key: 'move', notes: ['end:null'], p: 0.5 }`: no result, one world, the rook is 100% on h1.
- White could measure the rook (`?a1` is legal in the same position with White to move); that does not count.

**T21. Quantum: castling is certain-only, and a partial slide loses the right.** White Pa2; Black ke8, rh8 and a
knight; `x.castle = castlingRights(V, w)` (only `k`); Black to move.
- Knight 50% on g8 and 50% on e6: `O-O` is not in `legalMoves` and `branches` returns null. Both possibilities
  still hold `k`.
- Knight 50% on c6 and 50% on e6 (never between king and rook): `O-O` has one outcome `move`, p = 1, not rolled.
- Knight 50% on h6 and 50% on a6: `h8-h3` has one outcome `move`, p = 1, not rolled (pass = link): two worlds, rook
  h8 with knight h6 and rook h3 with knight a6. `x.castle` is empty in both.
  - White `a2-a3`: `O-O` is illegal.
  - Black `?h6` (outcomes `a6`, `h6`; take `h6`): one world with ke8, rh8, nh6. White `a3-a4`: `O-O` is still
    illegal (the right does not come back).

**T22. Hooks for the computer and the player row.**
- `evaluate`: the start world gives +40 for side 0 and −40 for side 1; a world with White Pa6, Pb7, Pc2 (Black
  ke8) gives +85 for side 0.
- `sideInfo(newGame(V), 0, 0).text` is "Horde: 36"; `sideInfo(newGame(V), 1, 0)` is null.

**T23. Quantum: en passant lasts one turn, also a Measure turn.**
- White Pa2, Pc2, Pg2; Black ke8, pd4, a knight X 50% on b8 and 50% on h6, and a knight Y 50% on g3 and 50% on
  a6: four worlds in the order (X b8, Y g3), (X b8, Y a6), (X h6, Y g3), (X h6, Y a6).
- `c2-c4`: `x.ep` is 18 (c3) in every world; now `d4-c3` would have one outcome `capture`, p = 1, not rolled.
- Black plays `?b8` instead (outcomes `h6`, `b8`; take `b8`): two worlds, `x.ep = -1` in both.
- White `g2-g3`: `{ key: 'miss', notes: [], p: 0.5 }` (Y on g3) and `{ key: 'move', notes: [], p: 0.5 }`; take
  `miss`: one world. Black's d4 pawn has only `d4-d3`, and `d4-c3` is illegal. (Without `orthodoxSpec().applyMiss`
  the square survives both idle turns and `d4-c3` is a certain capture.)

**T24. The 50-move counter.**
- White Pe2, Pa2; Black ke8, and a knight 50% on e3 and 50% on a6; `quiet` = 7. `e2-e3` has outcomes `miss` 0.5
  (the new `quiet` is 8) and `move` 0.5 (`quiet` 0). With `quiet` = 99, `miss` ends the game with
  `{ winner: null, reason: 'quiet' }` and `move` does not.
- White Qd1, Pa2; Black ke8, ph7; `quiet` = 7: `d1-d4` gives 8, then `e8-d8` 9, `a2-a3` 0, `h7-h5` 0.

**T25. The stalemate test looks at the side to move next.**
- White Ph5; Black ke8, ph7. `h5-h6` has one outcome `{ key: 'move', notes: [], p: 1 }` and no result, although
  White has no move now: Black moves next.
- Black's legal moves are exactly `e8-d7`, `e8-d8`, `e8-e7`, `e8-f7`, `e8-f8`; `e8-d8` gives
  `{ winner: null, reason: 'stalemate' }`.

---

## 8. Review notes

Open questions (from the research, updated by the source review):

1. **Balance.** Black gets the full quantum toolkit (ghost pieces that dodge pawn forks), while White can only
   probe until it promotes. Classical Horde is roughly balanced. The quantum version may favour Black; the
   capture-the-king rule (no stalemate escape for Black) pulls the other way. Playtest before adding a handicap
   option. A possible option would be "White pawns on rank 1 split" (not recommended: it breaks the "pawns are
   always solid" rule).
2. **Per-possibility stalemate draw (chosen)** or only the generic state-level draw (no legal move at all). The
   chosen rule is the same mechanism as antichess's stalemate win, and it is faithful to "White can be stalemated".
3. **No insufficient-material rule** (chosen). lichess's detailed horde material rules only settle games lost on
   time, which this game does not have; its closed-position draw is covered by the per-possibility stalemate draw
   (section 4.1).
4. **Optional UI hook** `sideInfo` for the horde counter (CORE-CHANGES U6, now built; T22).
5. **Repetition.** lichess draws a fivefold repetition automatically; the shared quantum rules have no repetition
   draw, so Horde has none either (section 3). A repetition rule, if wanted, belongs in the core for every variant.

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity (2026-09-25). The lichess variant page, Wikipedia "Dunsany's chess" and the
chess.com "Horde Chess" page were fetched; the scalachess (commit 57d3483), Fairy-Stockfish (commit 9f778da) and
PyChess sources were read from the clones in `handoff/ext/`. The prototype was re-run on the current core (a copy
with the import paths fixed, in `handoff/tmp/rev1-horde/`): T1 to T15 give exactly the values in section 7.
`handoff/tmp/rev1-horde/perft.mjs` reproduces all twelve scalachess perft numbers (new T16).

Confirmed without change: the 8 × 8 board and square names; every setup square (36 White pawns on ranks 1-4 plus
b5, c5, f5, g5; the ordinary Black army; FEN
`rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1`); White moves first; only Black may
castle (`kq`); the movement of every piece; White double steps from rank 1 (to rank 3) and rank 2 (to rank 4),
whether or not the pawn has moved before; no en passant after a double step from rank 1, en passant as usual after
one from rank 2 or rank 7; promotion to Q, R, B or N; Black wins by taking every White piece, promoted pieces
included; White wins by checkmate (capture-the-king here); stalemate of either side is a draw; the 8 White moves of
the start position; T1-T15.

Changes:

1. **History corrected (section 1).** The spec said that Dunsany's chess gives Black 32 pawns against White's
   army. In Dunsany's chess (1942) White has the 32 pawns on ranks 1-4, Black has the army and moves first. The
   colours were reversed in Filip Rachunek's Horde chess (2002); the 36-pawn setup is the later "Horde variant"
   that lichess plays. Source: https://en.wikipedia.org/wiki/Dunsany%27s_chess.
2. **lichess page quoted verbatim (section 1).** The row quoted the page subtitle as if it were the rules; it now
   quotes the rules text itself. Source: https://lichess.org/variant/horde.
3. **Draw rules made exact (sections 1, 2.5).** The spec listed "lichess's horde-specific insufficient-material
   rules, for cases where White cannot possibly mate" as a draw. In scalachess the only automatic material draw in
   Horde is `hordeClosedPosition` (the horde has no move, or every Black move leaves it without one, unless White
   has a single piece that Black attacks); the list of White material that cannot mate (`hasInsufficientMaterial`)
   is only used through `opponentHasInsufficientMaterial`, i.e. when Black runs out of time. The 50-move rule
   (100 half-moves) and fivefold repetition are automatic (`Variant.autoDraw`). Source:
   https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Horde.scala and
   https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Variant.scala.
4. **White's stalemate defined precisely (section 2.5).** "All its pawns are blocked and it has no capture" ignored
   promoted pieces; it is now "no legal move", as `Variant.staleMate` defines it. Same source.
5. **Insufficient-material decision re-argued (sections 3, 4.1, 8 item 3).** The old reason ("lichess needs it
   because White must checkmate") described the timeout rule only. The text now explains why neither lichess rule
   needs an equivalent: no clock, and the closed-position draw is reached by the per-possibility stalemate draw one
   move later at most. Repetition is stated as not carried over (new item 5). Same sources.
6. **Castling conditions spelled out (sections 2.4, 4.5).** "Ordinary chess rules" (classical) and "usual Quantum
   Chess conditions" (quantum) are now listed: in lichess the king may not castle out of, through or into check; in
   this game only the empty squares and the unmoved king and rook count, as `castlingMoves` implements. Source:
   https://lichess.org/variant/horde ("legal in standard chess") and `src/variants/core/orthodox.js`.
7. **Player text (section 5).** Added "even if they have moved before" to the double-step sentence: a pawn that
   stepped from rank 1 to rank 2 may double-step again, which players would not expect from ordinary chess. Source:
   Wikipedia ("this does not have to be the pawn's first move"), chess.com, scalachess `Position.genPawn`.
8. **Engine mapping made unambiguous (section 3).** `rankOf` is now named as `spec.board.rankOf`, and `afterMove`
   says that a rank-2 double step keeps the en passant square.
9. **New test T16 (section 7).** The three scalachess Horde perft positions to depth 4, with a classical legality
   filter for Black. They check the setup, both double steps, en passant (the third position fails without the
   rank-1 rule: 13, 173, 2216, 34086), castling and promotion. Source:
   https://github.com/lichess-org/scalachess/blob/master/test-kit/src/test/resources/horde.perft. Fairy-Stockfish
   `horde_variant()` encodes the same rules (`doubleStepRegion` rank 1, `enPassantRegion` ranks 6 and 3).
10. **Research note updated (section 1).** The prototype in `handoff/prototypes/anti/` imports from
    `/home/user/Quantum_Chess` and needs its paths changed before it runs.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency (2026-09-25). Read `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md`, `handoff/CORE-CHANGES.md`, the core (`quantum.js`, `world.js`, `orthodox.js`,
`orthodoxVariant.js`, `variant.js`, `ai.js`) and the variant UI helpers (`src/variantplay/texts.js`, `panel.js`,
`useVariantGame.js`), `docs/rules.md` and `docs/variants.md`. A first pass of this review ran on the core before the
CORE-CHANGES packages landed; it edited sections 1, 3, 4 and 6 and was stopped before it finished section 7 and this
section. This pass re-ran everything on the current core, in which every CORE-CHANGES item that Horde relies on is
built (Q1-Q4, Q8, W4, W5, U6, U14), and finished the file. Scripts, all in `handoff/tmp/critic-horde/` (git-ignored):

- `horde.mjs`: the variant written from section 3 alone, with `rules()`, `reasonText` and `sideInfo` exactly as
  specified.
- `horde.spec.js` (`npx vitest run --config handoff/tmp/critic-horde/vitest.config.mjs`): T1-T15 and T17-T25 as
  written in section 7, plus three controls (T23 without `applyMiss` and T21 without `unifyWorlds` give the stale
  results; the White piece count is the same in every world of every outcome). All 27 pass.
- `perft.mjs`: T16, all twelve scalachess numbers.
- `fuzz.mjs`: 720 random games (240 from the start, 480 from random endgames with few White pawns and sometimes a
  promoted piece), 59,163 plies with 7,546 splits (4,427 by White), 2,503 merges, 881 measures, 1,601 promotions,
  3,942 rolled moves and up to 32 possibilities. Checked after every ply: weights sum to T; at most 64 worlds;
  `budgetInfo(...).used <= limit` for both sides; solid pieces identical in every world; the White piece count,
  `x.ep` and `x.castle` identical in every world; `x.ep` only on rank 3 or 6; a finished game has no legal move and
  its reason holds in every world (`horde`: no White piece, `king`: no Black king, `stalemate`: the side to move
  generates nothing); an unfinished game has a generated move for the side to move in every world; the `noMoves`
  safety net never fires. No violation. Results: 261 king captures, 292 destroyed hordes, 72 stalemates, 6 quiet
  draws, 89 games still open at 200 plies. Five game-end rolls, all stalemates, four of them after a split. The run
  was repeated after the core changed again at 17:50 (`quantum.js`, `variant.js`), now also failing on any solid-roll
  note: identical numbers, no violation, no solid roll.
- `cost2.mjs` and `ai.mjs`: the numbers of section 6.

Changes (both passes), and why:

1. **Section 7 completed.** Sections 3 and 4 cited T17-T22, which did not exist. Added with exact positions and
   outcomes: T17 (a split settled by the game-end roll), T18 (the last White piece is a promoted ghost: no game-end
   roll), T19 (a rolled rank-1 double step, no en passant after Moved), T20 (a possible Measure does not save a
   stalemated possibility), T21 (castling), T22 (`evaluate` and `sideInfo`).
2. **New tests for the riskiest rules.** T23: the en passant square lasts one turn, also a Measure turn and a Missed
   push; it fails if the variant loses `orthodoxSpec().applyMiss`, which happens silently when the module is written as
   its own object instead of from `orthodoxSpec()`, or replaces that hook. T24: the 50-move counter for an army of pawns
   (a Missed push does not reset it, a promoted piece and the king do not reset it). T25: the stalemate test looks at
   the side to move next (`1 - mover`); with the mover instead, White's self-block would end the game at once, before
   Black could reply.
3. **T21 extended and rewritten for the current core.** It said castling past a ghost is rolled "today"; with Q2 it
   is illegal, and a ghost that never stands in between leaves it certain. New: a rook slide that only partly
   happened removes the right in every possibility, and it stays lost after a measurement shows that the rook never
   left (`docs/rules.md` section 5). The control shows that without `unifyWorlds` the right would come back.
4. **T1, T5, T8, T9, T15 made exact.** The split list after `e4-e5` is now exact; T5 and T15 give the outcome of the
   key move; T8 checks that promoting with a capture on h8 removes Black's `k` right; T9 checks that castling is not
   rolled and the position and rights after it.
5. **"As built" statements updated** (sections 3, 4.4, 4.5, 6, 7): the stale en passant square and the rolled
   castling are gone from the current core; the core-change paragraph now names what each item does for Horde and
   the test that checks it; U6 is built; the fuzz and performance numbers are those of the current core.
6. **Section 3, `worldResult`.** Stated why (2) must come before (3), and why reading the castling rights through
   `generate` does not break Q3's rule that `unifyWorlds` may only change data `worldResult` does not read (a world
   with a castling move also has a king step to f8 or d8). The generation cache is not reused on the one ply where
   `unifyWorlds` copies a world.
7. **Section 3, in-place extension.** The reason given (a spread copy makes move generation throw) holds only for
   the orthodox hooks that Horde does not replace; reworded.
8. **Section 4.2.** The sentence on castling and en passant said they "can only matter" in a corner case; they
   cannot change a result at all (reason in item 6; the en passant square is the same in every possibility). Added
   that the mover itself is not checked (T25), which is how lichess's closed-position draw arises here.
9. **Section 4.1.** Added the shared deviation from `docs/rules.md` sections 5 and 6 (no "your king cannot escape"
   loss, no waiting draws; CORE-CHANGES item 72), which every spec must list.
10. **Earlier pass, sections 3, 4 and 6** (verified again here): the in-place extension that keeps `applyMiss` and
    `unifyWorlds`; `mover` is `state.turn` before the move in `settle`, `stateAfter` and the computer's
    `mightForce`; `evaluate` pinned to `spec.board.rankOf` with a checkable value (the optional Black term was
    dropped); `sideInfo` defined exactly, as one number, because the White piece count is the same in every
    possibility (every capture lands on an occupied square, so it is measured and each outcome captures in all its
    worlds or in none); 4.1: `royalDanger(V, s, 0)` is always 0; 4.2: the game-end roll also follows splits,
    merges and measures; 4.3: Black's slides cannot be linked to White pieces while White has no ghost, and White's
    budget stays 1 until a promoted piece becomes a ghost; 4.4 and 4.5 follow CORE-CHANGES D1 and D2; 6: the danger
    line (not a ring) comes from `useVariantGame`.

Checked and left unchanged: every hook of section 3 exists in the current core with the stated signature and is enough
(no `generate`, `apply`, `stateResult` or `passWhenStuck` needed); `castlingRights` skips White, which has no king; the
only result that can differ between the possibilities of one outcome is the stalemate, so the game-end roll is needed
for it alone (the king is solid and every capture is rolled); the solid roll never fires in Horde (solid pieces move,
promote and are captured only by rolled or certain moves); Black's budget, the 4-square bound, land = roll, pass = link,
Q7's converging captures and Q14's joining parts need nothing from the variant; section 5 is 7 entries, each short and
consistent with sections 2 and 4, and the shared sentences (split, merge, castling never rolled) come from
`sharedRules()`; section 6 needs nothing beyond `standardBoard(8, 8)`.

Note for the lead (no change needed): the comment of `mightForce` in `ai.js` says that a Missed outcome "ends
nothing". In Horde it can: when White is already blocked (T25), a Black move that misses keeps a world in which
White has no move, and that is a stalemate. The function evaluates `worldResult` on the kept world and so handles it
correctly; only the comment is too narrow.

Core changes needed: none.
