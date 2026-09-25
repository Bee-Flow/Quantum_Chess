# Variant spec: `atomic` (Atomic chess)

Category: `rules`. UI name: "Atomic". Catalog summary (already in `catalog.js`): "Every capture explodes and takes
the pieces around it along."

Every expected value in section 7 was computed with a prototype of the hooks below, run on the real variant core
(`handoff/tools/atomic/proto.mjs`, cases in `cases.mjs`, `cases2.mjs`, `danger.mjs`, `ai.mjs`). The prototype
also played 30 random games of up to 120 plies (splits included) without an error, a broken budget or a missing
king while the game was running. The largest state had 48 worlds, and the run took about 3.8 s.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the egress proxy for lichess.org, wikipedia.org, chessprogramming.org,
wikibooks.org, chronatog.com and the other rules sites. Two sources were read **in full** through
raw.githubusercontent.com:

- the lichess rules engine, `scalachess/core/src/main/scala/variant/Atomic.scala` (master, fetched 2026-09-25);
- its test suite, `scalachess/test-kit/src/test/scala/AtomicVariantTest.scala`.

These are the executable definition of the lichess rules. The other sources below were read as search-engine
extracts.

| Source | What it gives |
|---|---|
| lichess, https://lichess.org/variant/atomic, and the scalachess source above | **The chosen rule set.** On a capture, every non-pawn piece on the 8 squares around the capture square explodes, together with the capturing piece. The captured piece is removed by the capture itself. The code reads `squaresToExplode = (dest.kingAttacks & occupied & ~pawns) \| dest`. En passant explodes around `dest` too, which is the square the capturing pawn lands on. A capture that would blow up your own king is illegal (`explodesOwnKing`), so a king can never capture. A move that blows up the enemy king is always legal and wins (`specialEnd: kings.count < 2`). A king that touches the enemy king cannot be in check (`kingThreatened`). The castling rights of exploded rooks are removed. |
| Wikipedia, "Atomic chess", https://en.wikipedia.org/wiki/Atomic_chess | The same rules. History: first played online at the German Internet Chess Server (GICS) on 27 November 1995, introduced by the user "connex". It later spread to MEWIS, Chess Live and the Internet Chess Club (2000), FICS (2003), lichess (2015) and chess.com (late 2020). For en passant, "the 3×3 square is not centred on the captured pawn, but on the square it bypassed". |
| Chess.com, https://www.chess.com/terms/atomic-chess | The same explosion rule. Pawns are removed only when they capture or are captured. Kings may touch, and a player cannot blow up both kings at once. |
| Chessprogramming wiki, https://www.chessprogramming.org/Atomic_Chess; PyChess, https://www.pychess.org/variants/atomic; Wikibooks, https://en.wikibooks.org/wiki/Chess_Variants/Atomic_Chess | The same rules (Fairy-Stockfish and PyChess follow lichess). |
| S. Pav, "Atomic Piece Values, Again", https://www.gilgamath.com/atomic-three (search extract) | Piece values fitted on lichess atomic games: Q 5.57, R 2.72, B 1.92, N 1.53, P 1.00. Used for the computer player (section 3). |

**Chosen rule set: lichess Atomic, with three changes for Quantum Chess.**

1. **Capture the king instead of check and checkmate.** The rest of Quantum Chess works this way, and the brief asks
   for it. All lichess legality rules that depend on check are dropped. You may leave your king where it can be blown
   up, and you may castle out of, through or into danger.
2. **The draw rules are the shared quantum draws** (50 moves by each side without a capture or a pawn move, the move
   limit, no legal move), plus **one** automatic draw from lichess: *only the two kings are left*. The finer lichess
   insufficient-material rules are not used. These cover K+minor vs K, K+R vs K, bishops on opposite colours and
   locked pawns. With capture-the-king and dice they are not certain draws, and the 50-move rule ends them anyway.
3. Explosions and ghosts follow the quantum rules in section 4.

The explosion radius, pawn immunity, the capturing piece exploding, kings never capturing, the ban on blowing up your
own king, touching kings, the en passant centre and the loss of castling rights are **exactly as on lichess**.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Board.** The standard 8 × 8 board, and all 64 squares exist.
- **Square names.** Files `a`–`h` from White's left, ranks `1`–`8` from White's side. `a1` is a dark square.
- **Coordinates.** 0-based `[file, rank]`, so `a1 = [0,0]` and `h8 = [7,7]`. This is `rectTopology(8, 8)`, as used
  by `orthodoxSpec()`.
- **Neighbours.** The *neighbours* of a square are the up to 8 squares at Chebyshev distance 1: the `KING_STEPS`
  vectors `[±1,0] [0,±1] [±1,±1]`. There are fewer at the edge: `a1` has 3 neighbours and `a4` has 5.
- **Blast area.** The *blast area* of a square is the square itself plus its neighbours: 3 × 3, cut off at the edge.

### 2.2 Pieces and movement

Vectors are `[dfile, drank]`. The pawn's vectors are oriented, so Black negates `drank`.

| Piece | Descriptor | Notes |
|---|---|---|
| King K | `leap` over the 8 `KING_STEPS`, **mode `move`** | Royal. **It never captures**: a king capture would always blow up its own king (2.4). It may step next to the enemy king. |
| Queen Q | `ride` over `ROOK_DIRS` + `BISHOP_DIRS` | |
| Rook R | `ride` over `ROOK_DIRS` | |
| Bishop B | `ride` over `BISHOP_DIRS` | |
| Knight N | `leap` over `KNIGHT_JUMPS` | |
| Pawn P | `leap [[0,1]]` oriented, mode `move`; `leap [[1,1],[-1,1]]` oriented, mode `capture` | Plus the double step and en passant. |

### 2.3 Setup

The standard start position. White moves first.

| Side | Rank | Pieces |
|---|---|---|
| White | 1 | Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1 |
| White | 2 | pawns a2–h2 |
| Black | 8 | ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8 |
| Black | 7 | pawns a7–h7 |

Both sides have all four castling rights, and there is no en passant square.

### 2.4 The explosion (the defining rule)

Whenever a move captures, whichever piece makes it:

1. The captured piece is removed. For en passant, that is the passed pawn on its own square.
2. The capturing piece is removed as well, whatever its type, even a pawn or a piece that has just promoted.
3. Every piece **except pawns** standing on a neighbour of the **capture square** is removed. This applies to both
   colours, including kings. The capture square is the square the capturing piece moved to. For en passant, it is
   the square the pawn skipped, **not** the square of the captured pawn.
4. Pawns are only ever removed by 1 and 2. A pawn next to the capture square survives.

**Legality.** A capture whose blast area contains **your own king** is illegal. Its consequences:

- A king never captures: its start square is always next to the capture square.
- A piece standing next to your own king can never be taken by you.
- A capture next to both kings is illegal for either side. As a result, **touching kings cannot be taken at all**: a
  piece that captures the king would blow up its own king too.
- Nothing else is illegal, because there is no check.

### 2.5 Other special moves

- **Double step.** A pawn on its start rank (2 for White, 7 for Black) may move two squares forward if both squares
  are empty.
- **En passant.** Only on the move right after an enemy double step, as in chess. The explosion is centred on the
  square the capturing pawn lands on (2.4).
- **Castling.** It works as in chess and is never a capture:
  - `O-O`: Ke1-g1 with Rh1-f1 (Black: Ke8-g8 with Rh8-f8);
  - `O-O-O`: Ke1-c1 with Ra1-d1 (Black: Ke8-c8 with Ra8-d8).

  The conditions are that the king and that rook have never moved and have not been removed, and that every square
  between them is empty. There are **no** conditions about attacked squares.
- **Castling rights after an explosion.** A castling right is lost for good when its king or rook is removed by a
  capture or an explosion.

### 2.6 Promotion

- A pawn that reaches the last rank (8 for White, 1 for Black) promotes to a queen, rook, bishop or knight of its
  side. The owner chooses.
- If the promoting move is a capture, the new piece explodes at once (2.4, point 2).

### 2.7 Win, draw, turn order

- White and Black alternate, and White starts.
- **Win:** the enemy king leaves the board. There are two ways:
  - it is captured directly;
  - it stands next to a capture square and is blown up.

  Both kings can never go at once: that would need a capture next to your own king, which is illegal.
- **Draw:**
  - **only the two kings are left.** Kings can't capture, so nothing can ever happen again;
  - 50 moves by each side without a capture or a pawn move;
  - the 600-ply move limit;
  - the side to move has no legal move.
- There is no check, no checkmate and no stalemate rule beyond "no legal move".

---

## 3. Engine mapping (contract)

The module is `orthodoxSpec()` with a non-capturing king, a move filter, an explosion in `afterMove` and its own
`worldResult`. Sketch, verified in `handoff/tools/atomic/proto.mjs`:

```js
const spec = orthodoxSpec()
spec.types.k.moves = [{ leap: KING_STEPS, mode: 'move' }]           // kings never capture
for (const [type, value] of Object.entries(VALUES)) spec.types[type].value = value
Object.assign(spec, {
	id: 'atomic',
	category: 'rules',
	rules: () => [...],                                              // section 5
	blastArea(sq) { return [sq, ...neighbours(sq)] },                // also used by the UI (section 6)
	filterMoves(w, side, list) {                                     // no capture next to your own king
		const k = kingSquare(w, side)
		return k < 0 ? list : list.filter((m) => m.capture < 0 || chebyshev(m.to, k) > 1)
	},
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)                             // ep square, castling rights of moved pieces
		if (m.capture < 0) return
		const area = spec.blastArea(m.to)
		for (const s of area) {
			const id = next.board[s]
			if (id >= 0 && (s === m.to || next.ty[id] !== 'p')) placePiece(next, id, OFF)
		}
		next.x.castle = next.x.castle.filter((c) => !area.includes(c.rook) && !area.includes(c.king))
	},
	worldResult(w) { ... },                                          // below
	reasonText(reason) { ... },                                      // 'exploded', 'bareKings'
	evaluate(w, side) { ... },                                       // optional, below
})
export default defineVariant(spec)
```

The fields in detail:

| Field | Value |
|---|---|
| `sides` | `whiteBlack()`: White (side 0) moves first |
| `teams`, `enemies` | none / default (`a !== b`) |
| `topology` | `rectTopology(8, 8)` (from `orthodoxSpec()`) |
| `types` | `orthodoxTypes()`, with the king's descriptor replaced by `{ leap: KING_STEPS, mode: 'move' }` |
| royal | `k` |
| solid | `k`, `p` (as always) |
| splittable | `q`, `r`, `b`, `n` |
| values (centipawns) | p 100, n 150, b 190, r 270, q 560, k 400 (Pav's fitted atomic values, scaled to the pawn; the king value never matters because a game without a king is over) |
| `setup` | `standardSetup(spec, 'rnbqkbnr')`: castling rights for both sides, `x.ep = -1` |
| `extraMoves` | as in `orthodoxSpec`: `pawnExtras` (double step, en passant) + `castlingMoves` |
| `filterMoves` | drops every move with `capture >= 0` whose `to` is at Chebyshev distance ≤ 1 from the mover's king. This covers en passant (its `to` is the skipped square) and merges, because `mergeBranches` uses the generated moves. |
| `afterMove` | `orthodoxAfterMove`, then the explosion (2.4) and the loss of castling rights |
| `worldResult(w)` | see below |
| `visibility`, `options` | none |
| `maxPly`, `quietPlies` | defaults 600 and 100 |

**`worldResult(w)`:**

```js
worldResult(w) {
	const wk = hasKing(w, 0)
	const bk = hasKing(w, 1)
	if (!wk || !bk) {
		return wk === bk ? { winner: null, reason: 'exploded' } : { winner: wk ? 0 : 1, reason: 'exploded' }
	}
	// only the two kings left: nobody can ever capture again
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] >= 0 && w.ty[id] !== 'k') return null
	}
	return { winner: null, reason: 'bareKings' }
}
```

- `reasonText`:
  - `'exploded'` → "a king was blown up";
  - `'bareKings'` → "only the two kings are left".
- The branch where both kings are gone can't happen, because of the legality rule. It is there only for safety.

**`evaluate(w, side)`** is optional but recommended. It is an atomic king-safety term.

- `threat(s)` counts the squares `q` in the blast area of `s`'s king that meet all three conditions:
  - `q` holds a piece of `s`. That includes the king itself.
  - The enemy attacks `q`: `attacks(V, w, enemy, q)` from world.js. Kings never count, because their descriptor is
    `move` only.
  - `q` is **not** next to the enemy king. A capture there would be illegal.
- Cap the count at 2.
- Return `60 × (threat(enemy) − threat(side))`.
- It costs at most 9 `attacks` calls per side per world.
- Checked in `handoff/tools/atomic/ai.mjs`: a self-play game at level normal ran to ply 60 in about 1.7 s.
- The computer finds the classic 3. Nxf7 blow-up on every level without this term. The term only helps it avoid
  walking into such threats earlier.

### 3.1 Core change needed: king danger must count explosions

`royalDanger` in `quantum.js` counts only moves whose `m.capture` **is** a royal piece. In atomic, a capture next to
the king blows it up, so the ring would show 0% in positions where the king is lost for certain.

- Proposed generic fix, prototyped in `handoff/tools/atomic/danger.mjs`: for each enemy move with
  `m.capture >= 0`, count it when the side has **no royal piece left after the move**:
  `!hasRoyal(V, applyClassical(V, b, m), side)`.
- This equals the old rule for every variant without side effects. It only costs a world copy per capture move.
- An optional hook `V.royalLoss(b, m, side)` can do the same check cheaply: capture and Chebyshev distance ≤ 1 to the
  king.
- The prototype gives exactly the expected values: see T13 and T15.
- The implementer should report this change rather than edit `quantum.js` silently: it touches the core.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the
game-end roll, budget 8 and at most 4 squares per piece. The explosion is applied **world by world** by `afterMove`,
so everything below follows from the core. The decisions are written out so that players and tests can rely on them.

**A-1. Explosions never roll by themselves.**
- An explosion happens in exactly those possibilities where the move captures.
- A move that captures in some possibilities but not in others always lands on a maybe-occupied square, so it is
  already a roll by "land = roll" (Captured / Moved / Missed).
- Inside the Captured result every possibility has the same capture square, so it has the same blast area.

**A-2. Ghosts in the blast (decided by the brief).**
- A ghost part on a blast square is destroyed **only in the possibilities where the piece really stands there**. No
  dice are rolled for it.
- The piece survives with the chance of its other parts. For example, a knight 50% d6 / 50% h6 caught by a blast on
  e5 becomes "50% h6, 50% destroyed".
- This works the same for your own ghosts and for enemy ghosts.
- A partly destroyed piece is an ordinary ghost. Its owner may move it, split it, merge it, or **measure** it. The
  measure results are "No longer on the board" (outcome key `gone`) or its square.
- Rejected alternative: "a blast measures every ghost it touches". It adds rolls to moves that were certain, and it
  would make the preview much harder to read.

**A-3. Solid pieces in the blast.**
- Pawns survive blasts, so a blast never moves a pawn.
- Kings are solid, so a king is in the blast area in every possibility of the Captured result or in none of them.
- Hence the solid roll is never triggered by an explosion. It stays as the generic safety net.

**A-4. You may not blow up your own king.**
- The rule is checked in every possibility: a capture whose blast would reach your own king does not happen there.
  Your king is solid, and the capture square is the target, so this is the **same in every possibility**.
- If the target is surely occupied, the move is simply illegal. The preview does not offer it.
- If the target only *might* hold an enemy piece, the move is a roll between two results:
  - **Moved:** the square was empty.
  - **Missed:** an enemy piece was there, so capturing it would have blown up your own king. Your piece stays.
- **Kings never capture.** A king step onto a square where a piece might be is a roll between Moved and Missed, like
  a pawn push.
- **Touching kings are safe** from direct capture, exactly as on lichess. This follows from the same rule.

**A-5. Ghost capturers.**
- A ghost part that captures is on the target in every Captured possibility, so it explodes there.
- The rest of the piece is gone with it: in those possibilities it was not anywhere else.
- In the Missed possibilities nothing explodes.

**A-6. Converging capture (merge onto an enemy piece).**
- It is a capture, so it explodes.
- "Preparation beats dice" still holds. A merge that captures for certain blows up for certain, and if the enemy king
  is next to the target, that wins without a roll (T11).
- A merge onto a square next to your own king can't capture (A-4).

**A-7. Promotion.**
- A capturing promotion explodes the new piece at once. The owner still picks it, because in a rolled move the choice
  matters in the Moved possibilities.

**A-8. Castling.**
- The rights are per possibility, as in every variant.
- A rook or king that is destroyed in some possibilities loses its right only there. Castling then needs the rook to
  be there, and it is resolved by the usual rules for a solid king move.

**A-9. The game-end roll.**
- Kings are solid (A-3), so "the king was blown up" is decided by the move's own roll and never needs an extra one.
- **Only the two kings are left** can differ between possibilities. Example: a partly destroyed ghost is the last
  piece of one side. Then the game-end roll decides between "Draw: only the two kings are left" and "The game goes
  on" (T14).

**A-10. The budget.**
- An explosion maps every possibility to exactly one possibility, and it removes only pieces standing in the blast
  area. So it can never raise a budget: a destroyed part replaces "the piece is here" by "the piece is gone".
- The opponent's explosions can only lower your budget, never use it up.

**A-11. Draw counter.** Every capture resets the 50-move count. Explosions don't count separately, because they only
happen with a capture.

**Summary for players.** Every capture is an explosion. A ghost in the blast is destroyed only where it really stood.
You can't blow up your own king, so a king never captures and touching kings are safe. Blow up the enemy king to
win.

---

## 5. Player-facing rules text (for `rules()`)

Each line is one `t('quantumchess', '…')` string:

1. Every capture is an explosion. The capturing piece, the captured piece and every piece except pawns on the eight
   squares around the capture square are removed, whoever they belong to.
2. Pawns survive explosions, unless they capture or are captured themselves.
3. Blow up the enemy king to win: capture it, or capture any piece next to it.
4. Kings never capture, and you may never capture next to your own king. If such a move might capture, it is rolled,
   and it misses where an enemy piece really stands.
5. Kings may stand next to each other. While they touch, neither king can be captured directly.
6. En passant explodes around the square the capturing pawn moves to.
7. A ghost caught in an explosion is destroyed only in the possibilities where it really stood there. It survives
   with the chance of its other parts, and no dice are rolled for it.
8. The game is a draw when only the two kings are left.

---

## 6. UI layout

- **Board.** The standard 8 × 8 square board from `rectTopology(8, 8)`:
  - square cells, shades `light` and `dark` (`a1` dark);
  - file labels a–h under the board and rank labels 1–8 on the left;
  - White at the bottom, and the board turns 180° for Black as usual.
- **Pieces.** The cburnett sprites (`{ sprite: 'k' | 'q' | 'r' | 'b' | 'n' | 'p' }`). There are no non-orthodox
  glyphs.
- **Blast marks** (small, generic addition to `useVariantGame.js` `marks`):
  - When the last history record has `captures` (the capture squares of the chosen branch) and the variant has
    `blastArea`, add the mark `blast` to every square of `blastArea(c)` for each capture square `c`.
  - CSS `qc-vboard__cell--blast`: a warm orange tint over the cell shade, for example
    `fill: color-mix(in srgb, #ff7a00 35%, currentShade)`, plus a dashed 2px outline in the same orange.
  - Add a one-off 500 ms flash, switched off under `prefers-reduced-motion`.
  - The mark must not depend on colour alone. The outline pattern (dashed) makes it distinct from `last` (solid) and
    `danger`.
- **Capture preview (optional, nice to have).** When a piece is selected, targets where the move might capture can
  get the mark `blast-target`: a small burst ✸ drawn in the corner of the target cell. Pressing the target shows the
  outcome box as usual. "Captured" means "captured and exploded", which the rules card explains.
- **Partly destroyed ghosts.** These need no new drawing. The part shows its percentage badge, for example "50%",
  and the what-if and possibilities views show the worlds without the piece. The piece's accessible label may add
  "destroyed in {percent} %" when `pieceLocations` has an `OFF` entry. This is optional.
- **King danger ring.** It works as in the classic game once the core counts explosions (3.1). Red at 100% is the
  atomic version of "check".

---

## 7. Test cases

Notation:

- A position lists its pieces as `Side:type@square`. Capital letters are White and lower case is Black.
- Worlds are given with relative weights, `x = { ep: -1, epVictim: -1, castle: [] }` unless stated, and White is to
  move unless stated. `stateOf` / `play` from `tests/js/variants/helpers.js` build these directly.
- "Outcomes" lists `key p` in the core's order, and R marks a rolled branch.
- All numbers were produced by the prototype on the real core.

**T1. The Nxf7 blow-up (classical).**
- Start position. Play `g1-f3`, `a7-a6`, `f3-e5`, `a6-a5`, then `e5-f7`.
- Outcomes: `capture 1.0` (not rolled).
- After the move:
  - e8, f8, g8 and f7 are empty, and the white knight is gone.
  - The black pawns e7 and g7 are still there, and so is the queen on d8.
  - `result = { winner: 0, reason: 'exploded' }`.
- The start position has exactly 20 ordinary moves.

**T2. The explosion hits the capturer's surroundings too (classical, lichess regression).**
- Start position. Play `e2-e4`, `d7-d5`, `g1-f3`, `d5-e4`, `f1-b5`, then `d8-d2`.
- After `d5-e4`, the white knight on f3 is gone (next to e4). Both e4 pawns are gone, and the pawn on d5 has left
  d5.
- After `d8-d2`:
  - Ke1, Qd1, Bc1 and the black queen are gone, and so is the pawn that stood on d2.
  - Nb1 and the c2 pawn remain.
  - `result = { winner: 1, reason: 'exploded' }`.

**T3. A full blast (classical, lichess "contrived board").**
- White: Kb1, Bh3, Pa2. Black: ka8, bd7, be7, nf7, rd6, qe6, nf6, qd5, re5.
- Move `h3-e6`: `capture 1.0`.
- Afterwards only Kb1, Pa2 and ka8 are left, and the game goes on because a pawn is left.
- Without the white pawn, the same move ends in `result = { winner: null, reason: 'bareKings' }`.

**T4. Pawns survive, and a captured rook loses its castling right (classical, lichess test).**
- Start position. Play `b2-b3`, `a7-a6`, `c1-b2`, `g7-g6`, then `b2-h8`: `capture 1.0`.
- Afterwards:
  - h8 and g8 are empty (the rook was captured and the knight exploded), and the bishop is gone.
  - The pawns h7 and g6 remain, and so does the f8 bishop.
  - The castling rights are `K, Q, q`: Black's `k` is gone.

**T5. Kings never capture; a king step onto a ghost rolls.**
- (a) White Ke1. Black re2, ke8.
  - White's king moves are exactly `e1-d1 e1-f1 e1-d2 e1-f2`. There is no `e1-e2`.
- (b) Two worlds, ½ each:
  - {Ke1, ne2, ke8}
  - {Ke1, nc3, ke8}
  - `e1-e2` outcomes: `miss 0.5 R | move 0.5 R`.

**T6. No capture next to your own king; the quantum version misses.**
- (a) White Kg1, Ra2. Black nf2, ke8.
  - `a2-f2` is not legal, because f2 is next to g1. `a2-e2` is legal.
- (b) Two worlds, ½ each:
  - {Kg1, Ra2, nf2, ke8}
  - {Kg1, Ra2, nc5, ke8}
  - `a2-f2` outcomes: `miss 0.5 R | move 0.5 R`. The Missed result leaves the rook on a2 and the knight 100% on f2.

**T7. Touching kings.**
- (a) Black to move. White Ke4, Pa2. Black kf5, ra4.
  - `a4-e4` is not legal: the blast would reach f5.
  - With the core fix (3.1), `royalDanger(White) = 0`.
- (b) Black to move. White Ke3, Pa2. Black kf5, ra3.
  - The kings don't touch. `a3-e3`: `capture 1.0`, then `result = { winner: 1, reason: 'exploded' }`.

**T8. The en passant explosion centre.**
- Black to move. White Ke1, Pe5. Black ke8, pd7, nc7, pc6, qe6, bf7, ra8.
- Play `d7-d5`, then White `e5-d6`: `capture 1.0`.
- Afterwards:
  - d5, d6, c7 and e6 are empty.
  - The pawn c6 survives: it is a pawn next to the centre.
  - bf7 and ke8 survive: they are not next to d6.
  - ra8 survives, and the game goes on.

**T9. An exploded rook takes its castling right with it.**
- Black to move. White Ke1, Ra1, Rh1, Pa2. Black ke8, ra8.
- `x.castle = castlingRights(V, world)`, so White has K and Q.
- `a8-a2`: `capture 1.0`.
- Afterwards:
  - a1 and a2 are empty, and the black rook is gone.
  - White's rights are `[K]` only, and its legal castling moves are exactly `O-O`.

**T10. A capturing promotion explodes.**
- (a) White Ka1, Pg7. Black rh8, kg8.
  - The legal pawn moves are `g7-h8=q g7-h8=r g7-h8=b g7-h8=n`.
  - `g7-h8=q`: `capture 1.0`, then `result = { winner: 0, reason: 'exploded' }`.
- (b) White Ka1, Pg7. Black rh8, ke8, bf8.
  - After `g7-h8=q` only Ka1, ke8 and bf8 are left: the new queen exploded. The game goes on.

**T11. Converging capture: preparation beats dice (quantum).**
- Two worlds, ½ each:
  - {Ke1, Nd5, ke7, bf6}
  - {Ke1, Nh5, ke7, bf6}
- The legal merges include `d5|h5-f6` and `d5|h5-f4`.
- `d5|h5-f6`: `capture 1.0`, not rolled. The blast reaches e7, so White wins for certain.
- A single part instead:
  - `d5-f6`: `miss 0.5 R | capture 0.5 R`;
  - `h5-f6`: the same.

**T12. A ghost in the blast is destroyed only where it stands (quantum).**
- Two worlds, ½ each:
  - {Ka1, Pa2, Re1, pe5, kh8, ph7, nd6}
  - {Ka1, Pa2, Re1, pe5, kh8, ph7, nh6}
- Black's budget is 2.
- `e1-e5`: `capture 1.0`, not rolled.
- Afterwards there are two worlds, ½ each:
  - {Ka1, Pa2, kh8, ph7}
  - {Ka1, Pa2, kh8, ph7, nh6}
- The knight's locations: off the board 0.5, h6 0.5. The budgets are Black 2 and White 1.
- Black may measure it: `?h6` has outcomes `gone 0.5 R | h6 0.5 R`.
- `h6-f5` is legal and not rolled: `move 1.0`. The knight is then 50% f5 and 50% gone.

**T13. Your own ghost in your own blast, and land = roll near a ghost (quantum).**
- (a) Two worlds, ½ each:
  - {Ka1, Pa2, Re1, Nd4, pe5, kh8, ph7}
  - {Ka1, Pa2, Re1, Nh4, pe5, kh8, ph7}
  - `e1-e5`: `capture 1.0`.
  - The White knight becomes 50% h4 / 50% gone, and White's budget stays 2.
- (b) Two worlds, ½ each:
  - {Ka1, Pa2, Bb2, ne5, rf6, kh8, ph7}
  - {Ka1, Pa2, Bb2, na6, rf6, kh8, ph7}
  - `b2-e5`: `move 0.5 R | capture 0.5 R`.
  - Moved gives {Ka1, Pa2, Be5, na6, rf6, kh8, ph7}.
  - Captured gives {Ka1, Pa2, kh8, ph7}: the bishop, knight and rook f6 are gone.

**T14. The game-end roll on "only the two kings are left" (quantum).**
- Two worlds, ½ each:
  - {Kh1, Re2, ka8, be5, nd6}
  - {Kh1, Re2, ka8, be5, nb1}
- `e2-e5` gives two outcomes, both rolled:
  - `capture` with note `end:{"winner":null,"reason":"bareKings"}`, p 0.5. The knight was on d6 and exploded.
  - `capture` with note `end:null`, p 0.5. The game goes on with the knight 100% on b1.

**T15. The king-danger ring counts explosions (needs 3.1).**
- (a) Black to move. White Ke1, Pd2. Black qa5, ke8.
  - `royalDanger(White) = 1`, because `a5-d2` blows up e1. `a5-d2`: `capture 1.0`, and Black wins.
  - With the unchanged core, `royalDanger` returns 0. This test must fail before the fix.
- (b) White to move. Two worlds, ½ each:
  - {Ke1, Bc4, Pa2, ke8, nf7, pa7}
  - {Ke1, Bc4, Pa2, ke8, na6, pa7}
  - `royalDanger(Black) = 0.5`.
  - `c4-f7`: `move 0.5 R | capture 0.5 R`. White wins in the capture branch.
- (c) After `g1-f3 a7-a6 f3-e5` from the start, with Black to move: `royalDanger(Black) = 1`.

**T16. A slide blocked by a ghost, then a capture (quantum).**
- Two worlds, ½ each:
  - {Ke1, Ra1, ra8, nb8, kh8, ph7, ba4}
  - {Ke1, Ra1, ra8, nb8, kh8, ph7, bd4}
- `a1-a8`: `miss 0.5 R | capture 0.5 R`.
- In the capture branch the white rook, the black rook and the knight b8 are all gone.

**Fuzz.** Random games with splits must never throw. They must keep both budgets ≤ 8, and they must never have a
world without a king while `result` is null. The prototype passed 30 games of 120 plies.

---

## Open design questions

1. **Core change for the danger ring (3.1).** Should `royalDanger` use the generic "no royal piece after the capture"
   test, or a `royalLoss` hook? Without either, the atomic ring shows 0% while the king is about to explode.
2. **Blast marks.** The `blast` mark from `V.blastArea` is a small generic UI addition. Implement it, or leave atomic
   without a visual explosion?
3. **Label of the Captured outcome.** Keep the shared text "Captured", with the rules card saying that every capture
   explodes, or add an optional `outcomeText` hook so that atomic says "Captured (explodes)"?
4. The finer lichess insufficient-material draws are not used (section 1). Only "only the two kings are left" is an
   automatic draw.
