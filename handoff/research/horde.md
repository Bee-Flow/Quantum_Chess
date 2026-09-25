# Variant spec: `horde` (Horde)

Category: `rules`. UI name: "Horde". Summary line (already in `catalog.js`): "White has 36 pawns against the complete
black army."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for lichess.org, wikipedia.org, chess.com and pychess.org.
The **lichess source code** could be read: the rules below were checked against the scalachess implementation
(raw.githubusercontent.com, saved in `handoff/ext/scalachess/`). The other sources come from search-engine
extracts. Every test case in section 7 was run on a prototype built on the real `src/variants/core`
(`handoff/exp/anti/proto.mjs`, `thorde.mjs`).

| Source | What it gives |
|---|---|
| lichess.org, https://lichess.org/variant/horde ("One side has a large number of pawns, the other has a normal army.") | A special start position. Moves are as in standard chess, with one exception for pawns: **pawns on the first rank may move two squares**, like pawns on the second rank. The pieces **may not capture en passant** a pawn that moved two squares from the first rank. The Pieces win by capturing all the Pawns; the Pawns win by checkmating the King. |
| scalachess `core/src/main/scala/variant/Horde.scala` (https://github.com/lichess-org/scalachess) | Exact setup: white pawns on every square of ranks 1-4 plus **b5, c5, f5, g5**, black ordinary army. `initialFen = rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1`. `castles = Castles.black` (only Black may castle). `specialEnd`: White has no pieces left, which means Black wins. Insufficient-material rules for the horde (only relevant to checkmate chess). |
| scalachess `Position.scala` | `genPawn`: in horde, double steps may **land on rank 3 or rank 4** for White, so pawns on rank 1 and rank 2 may double-step when both squares are empty. `potentialEpSquare`: no en passant square after a double step that starts on the pawn's own back rank. Promotion roles: Q, R, B, N (the default). |
| lichess forum, "[Horde] Missing rule?", "Horde: En Passant wasn't allowed when a pawn moved two squares up from the back rank", "Horde Rules ??" | These confirm the no-en-passant rule for first-rank double steps, and that a stalemate of either side is a draw (White can be stalemated). |
| chess.com, "Horde Chess" (https://www.chess.com/terms/horde-chess); Wikipedia, "Dunsany's chess" (https://en.wikipedia.org/wiki/Dunsany%27s_chess) | The history: Dunsany's chess (1942) gives Black 32 pawns against White's army. Horde is the modern lichess form. |

**Chosen rule set: lichess Horde (the current `Horde.scala`).**

- The exact 36-pawn setup, and White (the horde) moves first.
- First-rank double steps, which cannot be captured en passant.
- Only Black castles. Promotion as in chess.
- White wins by checkmate, which in the quantum game means capturing the king (section 4). Black wins by capturing
  every White piece. Stalemate is a draw.

Other versions (such as Dunsany's 32 pawns) are not used. lichess is the
version players know, and the user names it.

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
- **Castling.** Black only, with the ordinary chess rules.
- **Promotion.** A White pawn reaching rank 8, or a Black pawn reaching rank 1, promotes to a queen, rook, bishop or
  knight. White's promoted pieces are ordinary pieces of the horde.

### 2.5 Win, draw and turn order (classical, lichess)

- **White wins** by checkmating the Black king.
- **Black wins** by capturing every White piece: all pawns and any promoted pieces.
- **Draw**
  - Stalemate of either side. White is stalemated when all its pawns are blocked and it has no capture.
  - 50-move rule and repetition.
  - lichess's horde-specific insufficient-material rules, for cases where White cannot possibly mate.
- White moves first.

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()`.

| Field | Value |
|---|---|
| `id`, `category` | `'horde'`, `'rules'` |
| `sides` | `whiteBlack()`: side 0 is White (the horde, at the bottom), side 1 is Black. No teams. |
| `topology` | `standardBoard(8, 8).topology` |
| `types` | orthodox (`orthodoxTypes`, promotion to q, r, b, n). **royal: `k`** (only Black has one). **solid: `k`, `p`.** **splittable: `q`, `r`, `b`, `n`**, which for White means only promoted pieces. |
| values | orthodox `VALUES` (K 400, Q 900, R 500, B 330, N 320, P 100). |
| `evaluate(w, side)` | Pawn advancement for the horde. For every White pawn add `ADV[rank]` with `ADV = [0, 0, 0, 0, 10, 25, 60, 0]` (index = rank 0..7). Return `+sum` for side 0 and `−sum` for side 1. Optional: −15 for Black per White pawn on rank 6 or 7 with no Black piece in front of it. |
| `setup()` | Build with `emptyWorld`. `addPiece(w, 'p', 0, sq)` for every square of ranks 1-4 and for b5, c5, f5, g5. Then the Black back rank `rnbqkbnr` on rank 8 and pawns a7-h7. Then `w.x = { ep: -1, epVictim: -1, castle: castlingRights(V, w) }`, which gives only Black's `k` and `q`, because White has no king. |
| `extraMoves(w, side)` | `pawnExtras(spec, w, side, (s, sq) => (s === 0 ? rankOf(sq) <= 1 : rankOf(sq) === 6))` plus `castlingMoves(spec, w, side)`. |
| `afterMove(next, m)` | `orthodoxAfterMove(spec, next, m)`; then, if `m.kind === 'double'` and `rankOf(m.from) === 0` (White from rank 1): `next.x.ep = -1`, `next.x.epVictim = -1`. |
| `worldResult(w, mover)` | **Required override.** The default "a side without royal pieces has lost" would declare Black the winner at once, because White never has a king. In this order: (1) no Black king on the board: `{ winner: 0, reason: 'king' }`. (2) no White piece on the board: `{ winner: 1, reason: 'horde' }`. (3) `generate(V, w, 1 - mover).size === 0`: `{ winner: null, reason: 'stalemate' }`. (4) Otherwise `null`. |
| `noMoves(state)` | `{ winner: null, reason: 'stalemate' }`. Only a safety net; normally (3) above ends the game first. |
| `reasonText(reason)` | `'horde'` → t('quantumchess', 'the horde was destroyed'); `'stalemate'` → t('quantumchess', 'stalemate'). `'king'` is generic. |
| `visibility`, `options` | none |
| `rules()` | section 5 |

No core change is needed. The 50-move counter works as in chess: pawn moves and captures reset it, and moves of the
royal king do not.

---

## 4. Quantum adaptation

### 4.1 Winning

- **White wins by capturing the Black king**, as everywhere in Quantum Chess.
  - There is no check. Black may leave the king attacked, or move it onto an attacked square.
  - The king is solid, and the danger ring on it works as usual.
  - Consequence (decision): a classical stalemate of Black (king not attacked, but every king move steps into
    attack, and no other move) is **not** a draw here. Black must move, and White may then capture the king. This
    follows from the shared "capture the king" rule and needs no extra text.
- **Black wins by capturing every White piece.**
  - Checked per possibility.
  - A capture always lands on an occupied square, so the capture roll itself decides whether the last White piece
    fell. Example: a ghost bishop part takes the last pawn, with odds of 50% Captured and 50% Missed (test T11).
- **There is no insufficient-material draw** (decision). lichess needs it because White must *checkmate*. Here any
  White piece can capture a careless king, and Black can always try to take the last White piece. The 50-move rule
  ends hopeless endings.

### 4.2 Stalemate: a draw, per possibility

- After every move, `worldResult` checks whether the side to move next has **no ordinary move** in that possibility.
  If so, that possibility is a draw.
- The generic game-end roll then decides when this holds in some possibilities only. Example: a Black ghost knight
  part stands in front of White's last pawn (T12): 50% draw by stalemate, 50% play on.
- Measure and merge do not count as moves of a position.
- Black is practically never stalemated, because its king may always step, even into attack. The rule matters for
  the horde, whose pawns can all be blocked.

### 4.3 The horde is solid

- **Pawns are solid** (the shared rule). White starts with no piece that can split, so White has **no quantum moves
  of its own until it promotes**.
- White's quantum game:
  - probing Black's ghosts with pawn pushes and captures (always rolls);
  - linking Black's sliding pieces is not possible, because White pieces are never ghosts;
  - later, splitting promoted pieces.
- White's budget stays at 1 until a promoted piece splits. Black's pieces are never blocked "maybe", because White
  has no ghosts.
- Decision: this asymmetry is kept. It is faithful to the variant (the horde *is* pawns), and it is easy to
  explain. It also gives Black's ghosts a natural enemy: every pawn push onto a ghost part is a probe.
- The balance is an open question (section 8).

### 4.4 Double steps and en passant

- A first-rank or second-rank double step is an ordinary solid pawn move. If the way might be blocked in some
  possibilities, it is **rolled**: Moved or Missed, never "one square instead".
- The en passant rules are kept per possibility: no en passant square after a double step from rank 1. The double
  step is rolled whenever its result differs between possibilities, so the en passant square is the same in every
  possibility.

### 4.5 Castling and everything else

- Black castles under the usual Quantum Chess conditions of the orthodox variants (`castlingMoves`).
- Budget 8, the 4-square bound, split, merge, measure, land = roll, pass = link and the solid roll are all
  unchanged.
- White's promoted pieces split and merge like any other piece.

---

## 5. Player-facing rules text (rules card)

- White has 36 pawns and no king. Black has the ordinary army and moves second.
- White wins by capturing the Black king. There is no check, so Black must keep its king out of reach itself.
- Black wins by capturing every White piece, including pieces White got by promotion.
- White pawns on the first or the second rank may move two squares if both squares are free. A pawn that moves two
  squares from the first rank cannot be captured en passant.
- Only Black can castle. Pawns promote as usual.
- Pawns are always solid, so White can only split pieces it gets by promotion.
- If the player to move has no legal move, the game is a draw. If this is so in only some possibilities, a roll
  decides.

---

## 6. UI layout

- **Board.** Ordinary 8 × 8 board, square cells, `light` / `dark` shades, labels a-h and 1-8, White (the horde) at
  the bottom. cburnett sprites. There are no new glyphs.
- **Danger ring** on the Black king only. White has no king, so nothing is drawn for White.
- **Piece counter** (optional, via the generic `V.sideInfo(state, side)` hook proposed in the three-check spec).
  White's row shows "Horde: 36" (pawns plus promoted pieces), so players can see the goal of Black. Show a range
  when the count differs between possibilities.
- **Result texts:** "Black wins (the horde was destroyed)", "White wins (a king was captured)", "Draw (stalemate)".
- **Performance note.** A world has 52 pieces at the start, and move generation runs in every possibility.
  `generate` is cached per world, and the stalemate check in `worldResult` reuses that cache, which the next turn
  needs anyway.

---

## 7. Test cases

Worlds are `worldFrom` placements with `x = { ep: -1, epVictim: -1, castle: [] }` unless stated otherwise. Capital
letters are White and lower case is Black. White moves unless stated otherwise. All outcomes were produced by the
prototype on the real core.

**T1. Start.**
- `newGame(V)`: White has 36 pawns on exactly the squares of section 2.3.
- Black: ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8, pa7-ph7.
- Castling rights: `k` (e8→g8, h8→f8) and `q` (e8→c8, a8→d8).
- White's legal moves, with splits, are exactly the 8 moves a4-a5, b5-b6, c5-c6, d4-d5, e4-e5, f5-f6, g5-g6, h4-h5.
  There are no splits. No result.
- After `e4-e5`, Black has 15 legal moves.

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
`d7-d5`, White's legal moves are `e5-e6` and `e5-d6`.

**T6. Destroying the horde.** White Ph2; Black rh8, ke8; Black to move. `h8-h2` gives `{ winner: 1, reason:
'horde' }`.

**T7. No check; capturing the king wins.**
- White Pd6; Black ke8, ra8; Black to move.
- The king's moves include `e8-e7` and `e8-d7`, although the d6 pawn attacks e7.
- After `e8-e7`, White has `d6-d7` and `d6-e7`. `d6-e7` gives `{ winner: 0, reason: 'king' }`.

**T8. Promotion.**
- White Pg7; Black rh8, ka8.
- White's legal moves: `g7-g8=q`, `g7-g8=r`, `g7-g8=b`, `g7-g8=n`, `g7-h8=q`, `g7-h8=r`, `g7-h8=b`, `g7-h8=n`.
- There is no promotion to a king.

**T9. Black castles.** White Pa2; Black ra8, ke8, rh8 with `x.castle = castlingRights(V, w)`; Black to move. The
legal moves include `O-O` and `O-O-O`. `O-O` has one outcome, Moved with p = 1.

**T10. Quantum: a pawn probes a ghost.**
- White Pe5; Black ke8, and a knight 50% on d6 and 50% on a6.
- `e5-d6`: Missed p = 0.5 (the knight is 100% on a6), Captured p = 0.5.
- `e5-e6`: Moved p = 1.

**T11. Quantum: the last pawn and a ghost attacker.**
- White Ph2 (the only White piece); Black ke8, and a bishop 50% on c7 and 50% on a8. Black to move.
- `c7-h2` has two outcomes, each p = 0.5:
  - Missed: no result, and the bishop is 100% on a8;
  - Captured: `{ winner: 1, reason: 'horde' }`.

**T12. Quantum: a stalemate settled by the game-end roll.**
- White Ph5 (the only White piece); Black ke8, and a knight 50% on h6 and 50% on b8. Black to move.
- `e8-d8` has two outcomes, each p = 0.5:
  - `move[end:{"winner":null,"reason":"stalemate"}]`: the knight is 100% on h6, blocking the pawn, and the game is
    a draw;
  - `move[end:null]`: the knight is 100% on b8, and play goes on.

**T13. Quantum: only promoted pieces split.** White Qd1, Pa2; Black ke8, ph7. `splitTargets` has 21 squares from
d1 and 0 from a2.

**T14. Quantum: a ghost attacks the king.**
- White: a queen 50% on e1 and 50% on a1, and Pa2; Black ke8.
- `e1-e8` has two outcomes, each p = 0.5:
  - Missed: the queen is 100% on a1;
  - Captured: `{ winner: 0, reason: 'king' }`.

**T15. Certain stalemate.** White Ph5; Black ng8, ke8; Black to move. `g8-h6` blocks the pawn, and White has no
move: `{ winner: null, reason: 'stalemate' }`.

---

## 8. Open questions

1. **Balance.** Black gets the full quantum toolkit (ghost pieces that dodge pawn forks), while White can only
   probe until it promotes. Classical Horde is roughly balanced. The quantum version may favour Black; the
   capture-the-king rule (no stalemate escape for Black) pulls the other way. Playtest before adding a handicap
   option. A possible option would be "White pawns on rank 1 split" (not recommended: it breaks the "pawns are
   always solid" rule).
2. **Per-possibility stalemate draw (chosen)** or only the generic state-level draw (no legal move at all). The
   chosen rule is the same mechanism as antichess's stalemate win, and it is faithful to "White can be stalemated".
3. **No insufficient-material rule** (chosen). lichess's detailed horde rules serve checkmate chess and do not
   carry over to capture-the-king.
4. **Optional UI hook** `sideInfo` for the horde counter.
