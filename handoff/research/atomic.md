# Variant spec: `atomic` (Atomic chess)

Category: `rules`. UI name: "Atomic". Catalog summary (already in `catalog.js`): "Every capture explodes and takes
the pieces around it along."

Every expected value in section 7 was computed with a prototype of the hooks below, run on the real variant core
(`handoff/tools/atomic/proto.mjs`, cases in `cases.mjs`, `cases2.mjs`, `danger.mjs`, `ai.mjs`). The prototype
also played 30 random games of up to 120 plies (splits included) without an error, a broken budget or a missing
king while the game was running. The largest state had 48 worlds, and the run took about 3.8 s.

The committed scripts in `handoff/tools/atomic/` import the core from a stale absolute path
(`/home/user/Quantum_Chess/...`), and `proto.mjs` there still has the old piece values. Working copies with fixed
paths are in `handoff/tmp/review1-atomic/` (source review) and `handoff/tmp/critic-atomic/` (engine review). The
current ones are in `handoff/tmp/critic-atomic/pass2/`, run on the core with the `CORE-CHANGES.md` packages as they
stood in the working tree on 2026-09-25 (not yet committed): `proto.mjs` is section 3 as written, including
`layoutOf` and `evaluate`; `cases.mjs` asserts T1 to T23; `new.mjs` asserts T24 to T28 and L1; `fuzz.mjs` checks the
claims of section 4 on every move; `patched.mjs` runs the core change of 3.1 on a patched copy of the core
(`pass2/core/`). `handoff/tmp/` is ignored by git, so copy what you need.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the egress proxy for lichess.org, wikipedia.org, chessprogramming.org,
wikibooks.org, chronatog.com and the other rules sites. Two sources were read **in full** through
raw.githubusercontent.com:

- the lichess rules engine, `scalachess/core/src/main/scala/variant/Atomic.scala` (master, fetched 2026-09-25);
- its test suite, `scalachess/test-kit/src/test/scala/AtomicVariantTest.scala`.

These are the executable definition of the lichess rules. The other sources below were read as search-engine
extracts by the original researcher. A later review with web access (section 8.1) fetched every page in the table,
the ICC and FICS help files, the three Pav articles and the Fairy-Stockfish source, and corrected the claims that the
pages do not support.

| Source | What it gives |
|---|---|
| lichess, https://lichess.org/variant/atomic, and the scalachess source above | **The chosen rule set.** On a capture, every non-pawn piece on the 8 squares around the capture square explodes, together with the capturing piece. The captured piece is removed by the capture itself. The code reads `squaresToExplode = (dest.kingAttacks & occupied & ~pawns) \| dest`. En passant explodes around `dest` too, which is the square the capturing pawn lands on. A capture that would blow up your own king is illegal (`explodesOwnKing`), so a king can never capture. A move that blows up the enemy king is legal even if it leaves your own king in check, as long as it does not blow up your own king too, and it wins (`specialEnd: kings.count < 2`). A king that touches the enemy king cannot be in check (`kingThreatened`). The castling rights of exploded rooks are removed. Automatic draws (`Variant.autoDraw`): insufficient material (atomic's own list), 100 half-moves without a capture or pawn move, and fivefold repetition. A threefold repetition can be claimed. |
| Wikipedia, "Atomic chess", https://en.wikipedia.org/wiki/Atomic_chess | The same rules. History: "In 1995 the German Internet Chess Server (GICS) introduced the game, based on rules one of its users collected from friends who played offline." The cited GICS help page (K. Knopper, "Atomic Chess Rules") is dated 27 November 1995. It later spread to MEWIS, then Chess Live and the Internet Chess Club (2000), FICS (2003), lichess (2015) and chess.com (late 2020). The ICC version "does not enforce check at all, making legal any move, even one leaving the king to be captured directly in the next move". |
| ICC help "atomic" (wild 27), https://web.archive.org/web/20140525233041/http://www6.chessclub.com/help/atomic; Fairy-Stockfish `nocheckatomic` in `src/variant.cpp` ("Atomic chess without checks (ICC rules)") | **The precedent for change 1 below.** "Win by capturing or destroying your opponent's king without simultaneously destroying your own king. You may not make a move which destroys your own king. Check and checkmate are not recognized; you may move into check, castle out of check, or castle through check." Also: "There is no chain reaction -- only direct captures detonate", and "For captures en passant, ground-zero of the explosion is the square on the sixth rank upon which the capturing pawn lands." |
| FICS help "atomic", https://web.archive.org/web/20140525232429/http://www.freechess.org/Help/HelpFiles/atomic.html | The same explosion. "An en-passant move's 'ground zero' is the square the capturing pawn moves to." Touching kings: "it is not possible to capture one king without destroying the other." |
| Chess.com, https://www.chess.com/terms/atomic-chess | The same explosion rule. Pawns are removed only when they capture or are captured. Kings may touch, and a player cannot blow up both kings at once. "For en passant captures, the explosion happens around the square where the capturing pawn lands." |
| Chessprogramming wiki, https://www.chessprogramming.org/Atomic_Chess; PyChess, https://www.pychess.org/variants/atomic; Wikibooks, https://en.wikibooks.org/wiki/Chess_Variants/Atomic_Chess | The same rules (Fairy-Stockfish's `atomic` and PyChess follow lichess). En passant: "the center of the explosion is at the target square behind the pawn being captured" (chessprogramming). |
| S. Pav, "Atomic Piece Values, Again", https://www.gilgamath.com/atomic-three (31 May 2021) | Logistic-regression piece values from about 9 million rated lichess atomic games. For a random snapshot of each game, relative to the pawn: N 1.5, B 1.8, R 3.4, Q 7.8. Used for the computer player (section 3). The earlier article, https://www.gilgamath.com/atomic-two, gives 1 : 2.5 : 4 : 8 : 22, which the author says only fits the very end of a game. |

**Chosen rule set: lichess Atomic, with three changes for Quantum Chess.**

1. **Capture the king instead of check and checkmate.** The rest of Quantum Chess works this way, and the brief asks
   for it. All lichess legality rules that depend on check are dropped. You may leave your king where it can be blown
   up, and you may castle out of, through or into danger. This is exactly the Internet Chess Club rule set (wild 27)
   and Fairy-Stockfish's `nocheckatomic`. The ban on blowing up your own king stays.
2. **The draw rules are the shared quantum draws** (50 moves by each side without a capture or a pawn move, the move
   limit, no legal move), plus **one** automatic draw from lichess: *only the two kings are left*. The finer lichess
   insufficient-material rules are not used. They are: a bare king against K+N, K+B, K+R or K+N+N; K+B vs K+B with
   bishops on opposite colours; and closed positions of kings and blocked pawns, possibly with bishops of one side
   that can never capture, because every enemy pawn stands on the other colour. With capture-the-king and dice they
   are not certain draws, and the 50-move rule ends them anyway. There is **no repetition draw**: lichess draws a
   fivefold repetition automatically and lets a player claim a threefold one, but the shared quantum rules have no
   repetition rule.
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
5. There is no chain reaction: pieces destroyed in the blast do not explode in turn. For en passant, a piece that is
   next to the captured pawn's square but not next to the capture square is not touched.

**Legality.** A capture whose blast area contains **your own king** is illegal. Its consequences:

- A king never captures: its start square is always next to the capture square.
- A piece standing next to your own king can never be taken by you.
- A capture next to both kings is illegal for either side. As a result, **touching kings cannot be captured
  directly**: a piece that captures the king would blow up its own king too. A touching king can still be blown up
  by a capture on a square that is next to it but not next to the other king.
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
  - the side to move has no legal move, even when its king stands where it could be captured (T27). Lichess scores
    some of these positions as checkmate; Fairy-Stockfish's `nocheckatomic` scores them as a draw (its default
    `stalemateValue`).
- There is no repetition draw (section 1, change 2).
- There is no check, no checkmate and no stalemate rule beyond "no legal move". A position that lichess scores as
  stalemate often has legal moves here, because the king may step into danger (T17).

---

## 3. Engine mapping (contract)

The module is `orthodoxSpec()` with a non-capturing king, a move filter, an explosion in `afterMove` and its own
`worldResult`. Sketch, verified in `handoff/tools/atomic/proto.mjs` and, exactly as written here, in
`handoff/tmp/critic-atomic/pass2/proto.mjs`:

```js
// imports: royalSquares, hasRoyal, placePiece, OFF (world.js); KING_STEPS, orthodoxAfterMove (orthodox.js)
const ATOMIC_VALUES = { p: 100, n: 150, b: 180, r: 340, q: 780, k: 400 }  // not `VALUES`: orthodox.js exports that
const spec = orthodoxSpec()
const topo = spec.topology
const neighbours = (sq) => KING_STEPS.map((v) => topo.step(sq, v)).filter((s) => s >= 0)
const chebyshev = (a, b) => Math.max(...topo.coords[a].map((v, i) => Math.abs(v - topo.coords[b][i])))
const kingSquare = (w, side) => royalSquares(spec, w, side)[0] ?? -1

spec.types.k.moves = [{ leap: KING_STEPS, mode: 'move' }]           // kings never capture
for (const [type, value] of Object.entries(ATOMIC_VALUES)) spec.types[type].value = value
Object.assign(spec, {
	id: 'atomic',
	category: 'rules',
	rules: () => [...],                                              // section 5
	blastArea(sq) { return [sq, ...neighbours(sq)] },                // also used by layoutOf (section 6)
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
		if (next.x.castle?.length) {                                 // test worlds may have no castling list
			next.x.castle = next.x.castle.filter((c) => !area.includes(c.rook) && !area.includes(c.king))
		}
	},
	worldResult(w) { ... },                                          // below
	reasonText(reason) { ... },                                      // 'exploded' only ('bareKings' is generic, U7)
	layoutOf(state) { ... },                                         // optional blast marks, section 6
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
| values (centipawns) | p 100, n 150, b 180, r 340, q 780, k 400 (Pav's fitted atomic values for a random snapshot, relative to the pawn, section 1; the king value never matters because a game without a king is over) |
| `setup` | `standardSetup(spec, 'rnbqkbnr')`: castling rights for both sides, `x.ep = -1` |
| `extraMoves` | as in `orthodoxSpec`: `pawnExtras` (double step, en passant) + `castlingMoves` |
| `filterMoves` | drops every move with `capture >= 0` whose `to` is at Chebyshev distance ≤ 1 from the mover's king. This covers en passant (its `to` is the skipped square, T19) and merges, because `mergesFrom` and `mergeBranches` use the generated moves (T20). |
| `afterMove` | `orthodoxAfterMove`, then the explosion (2.4) and the loss of castling rights |
| `applyMiss`, `unifyWorlds` | inherited from `orthodoxSpec()` (`CORE-CHANGES.md` W4: `clearEnPassant`, the en passant square expires in missed worlds and on Measure turns; W5: `unifyCastling`, a castling right is kept only while every world has it). Atomic must not override them, and must not replace `orthodoxSpec()`'s `afterMove` without calling `orthodoxAfterMove` (the sketch does). |
| `blastArea(sq)` | not a core hook: the square and its neighbours. Used by `afterMove` and by `layoutOf`. |
| `layoutOf(state)` | optional: the blast marks of section 6 (`CORE-CHANGES.md` item 28 makes this variant-level; the outline uses `layout.outlines`, U15) |
| `worldResult(w)` | see below |
| `visibility`, `options` | none |
| `maxPly`, `quietPlies` | defaults 600 and 100 |

**`worldResult(w)`:**

```js
worldResult(w) {
	const wk = hasRoyal(spec, w, 0)                                  // world.js
	const bk = hasRoyal(spec, w, 1)
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
  - `'exploded'` → "a king was blown up" (the result reads "White wins (a king was blown up)");
  - every other reason → null. The generic texts already have `'bareKings'`, "only the two kings are left"
    (`CORE-CHANGES.md` U7, in `src/variantplay/texts.js`).
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
- Checked in `handoff/tools/atomic/ai.mjs`: a self-play game at level normal ran to ply 60 in about 1.7 s. The
  review re-ran it with the values above: ply 60 in about 0.5 s, and 3. Nxf7 found on easy, normal and hard.
- The computer finds the classic 3. Nxf7 blow-up on every level without this term. The term only helps it avoid
  walking into such threats earlier.
- The engine review ran the term exactly as written here on the current `ai.js`
  (`handoff/tmp/critic-atomic/pass2/ai.mjs`): 3. Nxf7 on easy, normal and hard in 7, 12 and 38 ms.

### 3.1 Core change needed: king danger must count explosions

`royalDanger` in `quantum.js` used to count only moves whose `m.capture` **is** a royal piece. In atomic, a capture
next to the king blows it up, so the danger line of the variant game ("Your king is in danger: {percent}") would show
nothing in positions where the king is lost for certain (T7(c), T15, T21). No variant hook can change this: the UI
calls the core's `royalDanger` directly.

- **`CORE-CHANGES.md` Q7 (generic, no hook; in the working tree, not yet committed).** An enemy move `m` in world `b`
  counts when it captures a royal piece of `side`, or when `m.capture >= 0`, `side` has a royal piece in `b`, and it
  has none after `applyClassical(V, b, m)`. The moves come from `generate(V, b, e)` for every enemy `e`, the weights
  are summed per `m.key` over the worlds, and the result is the largest sum over the keys. The generated moves are
  already filtered, so a capture next to the attacker's own king never counts (touching kings, T7(a)). T7(c), T15 and
  T21 give the values of section 7 on the core in the working tree.
- For ordinary moves atomic needs nothing else. The engine review compared this part of Q7 with a cheap atomic-only
  test (`m.capture >= 0` and `side`'s king at Chebyshev distance ≤ 1 from `m.to`) on every position of 240 random
  games: always equal. A `royalLoss` hook would only be a speed-up.
- **Still missing: converging captures next to the king.** Q7 also counts merges ("converging captures", docs/rules.md
  section 5), but `mergeDanger` evaluates only merges whose target may hold a royal piece of `side`. In atomic a merge
  onto **any** piece next to the king blows the king up. T11's merge `d5|h5-f6` wins for certain, yet the core shows
  "50 %" (from the single part `d5-f6`), not "100 %" (T24). In the fuzz run the core showed too little in 514 of
  36,910 danger values (both sides of 18,455 positions in 240 games, about 1.4 %).
- **The fix (generic, one condition):** in `mergeDanger(V, state, e, side)`, evaluate every merge of `e` whose target
  may hold a piece that `e` can capture (some world has on `t` a piece of a side `s` with `V.enemies(e, s)`), instead of
  only a royal piece of `side`. The per-world count stays as it is: a world counts when its merge move captures and
  `royalLoss` holds. A merge that cannot capture can never remove a royal piece, so this is exactly "every merge". In
  every variant where only a capture *of* the king removes it, the extra merges add nothing, so no other value changes.
  On a patched copy of the core (`pass2/core/`, `pass2/patched.mjs`) the patched `royalDanger` equalled a brute-force
  count over every ordinary move and every legal merge for all 36,910 danger values of the fuzz run, and cost about
  0.05 ms per call instead of 0.035 ms. T24 gives 1 and ⅔ there.

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
- So after any move, **the explosion happened in every possibility of the new position or in none of them**. The
  fuzz run of section 7 checks this on every result of every move played.

**A-2. Ghosts in the blast (decided by the brief).**
- A ghost part on a blast square is destroyed **only in the possibilities where the piece really stands there**. No
  dice are rolled for it.
- The piece survives with the chance of its other parts. For example, a knight 50% d6 / 50% h6 caught by a blast on
  e5 becomes "50% h6, 50% destroyed".
- This works the same for your own ghosts and for enemy ghosts.
- A partly destroyed piece is an ordinary ghost. Its owner may move or split it, merge two of its parts that are
  still on the board, or **measure** it. The measure results are "No longer on the board" (outcome key `gone`) or its
  square. A piece with only one square left on the board has nothing to merge (T12).
- **"Destroyed" counts as one of the piece's at most 4 places**, just as it counts as an arrangement for the budget.
  This is how the core counts (`splitBranches` counts the distinct values of `b.sq[X]`, `OFF` included). A
  piece that is destroyed in some possibilities can therefore stand on at most 3 squares, and a split that would put
  it on a fourth square is refused (T22). The rule "never more than 4 squares" still holds.
- Rejected alternative: "a blast measures every ghost it touches". It adds rolls to moves that were certain, and it
  would make the preview much harder to read.

**A-3. Solid pieces in the blast.**
- Pawns survive blasts, so a blast never moves a pawn.
- Kings are solid, so a king is in the blast area in every possibility of the Captured result or in none of them.
- Hence the solid roll is never triggered by an explosion. It stays as the generic safety net.

**A-4. You may not blow up your own king.**
- The rule is checked in every possibility: a capture whose blast would reach your own king does not happen there.
  Your king is solid, and the capture square is the target, so this is the **same in every possibility**.
- If an enemy piece surely stands on the target, the move is simply illegal. The preview does not offer it. (Exactly:
  the move is offered only if some possibility has your piece on its square, its path clear and the target empty.)
- If the target only *might* hold an enemy piece, the move is a roll between two results:
  - **Moved:** the square was empty.
  - **Missed:** an enemy piece was there, so capturing it would have blown up your own king. Your piece stays.
- This covers every kind of capture: en passant (the blast centre is the square the pawn lands on, T19) and a merge
  onto a square next to your own king (T20).
- **Kings never capture.** A king step onto a square where a piece might be is a roll between Moved and Missed, like
  a pawn push.
- **Touching kings are safe** from direct capture, exactly as on lichess. This follows from the same rule. A touching
  king can still be blown up from a square next to it that is not next to the other king (T7(c)).

**A-5. Ghost capturers.**
- A ghost part that captures is on the target in every Captured possibility, so it explodes there.
- The rest of the piece is gone with it: in those possibilities it was not anywhere else.
- In the Missed possibilities nothing explodes.
- A ghost part attacking another ghost has the usual three results, Missed, Moved and Captured, and only Captured
  explodes (T21).
- A part that moves onto another part of the same piece joins it (docs/rules.md 2.1, `CORE-CHANGES.md` Q14). Nothing
  is captured there, so nothing explodes, and the move is not rolled (T28).

**A-6. Converging capture (merge onto an enemy piece).**
- It is a capture, so it explodes.
- "Preparation beats dice" still holds. A merge that captures for certain blows up for certain, and if the enemy king
  is next to the target, that wins without a roll (T11).
- The king-danger line must count such a merge like any other blow-up: T11's merge puts Black's king at 100 %, and
  with a third part of the knight that reaches nothing, at ⅔ (T24). This needs the core change of 3.1.
- A merge onto a square next to your own king can't capture (A-4). If an enemy piece surely stands there, the merge
  is not offered. If one might stand there, the merge is a roll between Moved and Missed (T20).

**A-7. Promotion.**
- A capturing promotion explodes the new piece at once.
- A pawn's diagonal move exists only as a capture, so a capturing promotion has only two results: **Captured** (the
  new piece explodes) or **Missed** (the pawn stays). It never has a Moved result, so the chosen piece never
  survives and the choice never matters (T18).
- The four keys (`g7-h8=q`, `=r`, `=b`, `=n`) stay. `pushMove` generates them, they give identical results, and the
  move keys of promotions stay the same as in every other variant.

**A-8. Castling.**
- Castling follows the shared rules of every variant, as the lead decided them (`CORE-CHANGES.md` D1, Q2, W5, after
  docs/rules.md section 5): castling is legal only when it is possible in every possibility, it never rolls, and a
  right is lost as soon as the king or that rook is not 100% on its start square. Atomic inherits this from
  `orthodoxSpec()` and adds nothing to it.
- The only atomic rule: an explosion whose blast area holds the king's or the rook's start square removes that right
  (T4, T9). A right exists only while its rook is 100% home, and by A-1 an explosion happens in every possibility of
  the new position or in none. So an explosion always removes the right everywhere, and castling never has to deal
  with a rook that is destroyed in some possibilities only.
- The core does this (`CORE-CHANGES.md` Q2 and W5, in the working tree). T26 checks it together with an explosion: a
  rolled capture that blows up the h1 rook removes `K` in its Captured result, while the Moved result keeps `K` and
  `O-O` is then certain.

**A-9. The game-end roll.**
- Kings are solid (A-3), so "the king was blown up" is decided by the move's own roll and never needs an extra one
  (T21: the Captured result wins with no `end:` note). The fuzz run never saw a game-end roll between "a king was
  blown up" and "the game goes on".
- **Only the two kings are left** can differ between possibilities. Example: a partly destroyed ghost is the last
  piece of one side. Then the game-end roll decides between "Draw: only the two kings are left" and "The game goes
  on" (T14).

**A-10. The budget.**
- An explosion maps every possibility to exactly one possibility, and it removes only pieces standing in the blast
  area. So it can never raise a budget: a destroyed part replaces "the piece is here" by "the piece is gone".
- More exactly: which of your pieces the blast removes depends only on where your own pieces stand, so two
  possibilities with the same arrangement of your pieces still have the same arrangement afterwards.
- The opponent's explosions can only lower your budget, never use it up (T23).

**A-11. Draw counter.** Every capture resets the 50-move count. Explosions don't count separately, because they only
happen with a capture. Pawn moves reset it by the shared rule of every variant, and only when they really happened: a
Missed pawn move does not (docs/rules.md section 6; `CORE-CHANGES.md` Q8, in the working tree; T25). Atomic adds
nothing here.

**Summary for players.** Every capture is an explosion. A ghost in the blast is destroyed only where it really stood.
You can't blow up your own king, so a king never captures and touching kings are safe. Blow up the enemy king to
win.

---

## 5. Player-facing rules text (for `rules()`)

Each line is one `t('quantumchess', '…')` string:

1. Every capture is an explosion. The capturing piece, the captured piece and every piece except pawns on the eight
   squares around the capture square are removed, whoever they belong to.
2. Pawns survive explosions, unless they capture or are captured themselves.
3. Blow up the enemy king to win: capture it, or capture any piece or pawn next to it.
4. Kings never capture, and you may never capture on a square next to your own king. A king move or a move onto a
   square next to your own king is rolled if an enemy piece might stand there: it misses if the piece is really there.
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
- **Blast marks** (optional; variant-level, as `CORE-CHANGES.md` item 28 decides, so no generic UI change):
  - `layoutOf(state)`: when the last history record has `captures`, return
    `{ ...V.topology, cells, layout: { ...V.topology.layout, outlines } }`. In `cells`, every cell of `blastArea(c)`,
    for each capture square `c`, has `shade: 'hill'` (was `light`) or `'hilldark'` (was `dark`); the other cells are
    the same objects. `outlines` is the border of the blast area: for `c = [f, r]`, the rectangle from
    `x = max(0, f − 1)` to `min(7, f + 1) + 1` and from `y = 7 − min(7, r + 1)` to `8 − max(0, r − 1)`, as four
    segments `{ x1, y1, x2, y2 }` (layout units, y down, White at the bottom; the board turns them for Black).
    Otherwise return `V.topology` itself, so that nothing is redrawn.
  - `captures` already holds the right centre: the target of a normal capture or merge, and the square the pawn lands
    on for en passant (checked on T19: d6). A Moved or Missed result has no captures, so nothing is marked (L1).
  - The board reads `layoutOf` for every state, whoever moved, so the computer's explosions are marked too.
  - `layout.outlines` are drawn above the cells as thin near-black lines (`CORE-CHANGES.md` U15, used by King of the
    Hill's hill), so the mark does not depend on colour alone. The information itself does not either: the removed
    pieces are gone from the board, and the move list shows the move and its result.
- **Not planned for v1:** a capture preview on targets (a burst sign) and an outcome label "Captured (explodes)". Both
  would need generic UI changes that the core plan does not include (item 29 was rejected). The rules card says that
  every capture explodes.
- **Partly destroyed ghosts.** These need no new drawing. The part shows its percentage badge, for example "50%",
  and the what-if and possibilities views show the worlds without the piece. A measurement offers "No longer on the
  board" (the existing `gone` text) as a result.
- **King danger.** The variant game has no ring: it shows "Your king is in danger: {percent}" in the status line,
  from `royalDanger(V, state, viewer)` (`useVariantGame.js`, `danger`). With Q7 (3.1) the line appears whenever a
  single enemy capture could blow up your king, and 100% is the atomic version of "check". A converging capture next
  to your king is counted only after the core change of 3.1 (T24); until then the line shows the chance of the best
  single part instead.

---

## 7. Test cases

Notation:

- A position lists its pieces as `Side:type@square`. Capital letters are White and lower case is Black.
- Worlds are given with relative weights, `x = { ep: -1, epVictim: -1, castle: [] }` unless stated, and White is to
  move unless stated. `stateOf` / `play` from `tests/js/variants/helpers.js` build these directly.
- "Outcomes" lists `key p` in the core's order, and R marks a rolled branch.
- All numbers were produced by the prototype on the real core. The engine review asserted every value of T1 to T28
  and L1 on the core in the working tree, with the `CORE-CHANGES.md` packages as implemented on 2026-09-25
  (`handoff/tmp/critic-atomic/pass2/cases.mjs` and `new.mjs`, all passing).
- Danger values marked "Q7" hold on that core; the core before the packages returned 0 for them. The values marked
  "3.1 fix" need the core change of section 3.1; the value the core gives without it is stated next to them. No other
  value depends on a core change.
- List the pieces in the same order in every world, with the ghost last: `worldFrom` numbers the pieces in the order
  of the placement, so the parts of one piece get the same id. A world "without" a piece that the other worlds have
  (a destroyed part, T22) simply omits it: `pieceLocations` counts a missing id as off the board, exactly like
  `placePiece(b, id, OFF)`.

**T1. The Nxf7 blow-up (classical).**
- Start position. Play `g1-f3`, `a7-a6`, `f3-e5`, `a6-a5`, then `e5-f7`.
- Outcomes: `capture 1.0` (not rolled).
- After the move:
  - e8, f8, g8 and f7 are empty, and the white knight is gone.
  - The black pawns e7 and g7 are still there, and so is the queen on d8.
  - `result = { winner: 0, reason: 'exploded' }`.
- The start position has exactly 20 ordinary moves.

**T2. The explosion hits the capturer's surroundings too (classical, scalachess test "End move regression: from
init").**
- Start position. Play `e2-e4`, `d7-d5`, `g1-f3`, `d5-e4`, `f1-b5`, then `d8-d2`.
- After `d5-e4`, the white knight on f3 is gone (next to e4). The captured white pawn and the capturing black pawn
  are both gone, so d5 and e4 are empty.
- After `d8-d2`:
  - Ke1, Qd1, Bc1 and the black queen are gone, and so is the pawn that stood on d2.
  - Nb1 and the c2 pawn remain.
  - `result = { winner: 1, reason: 'exploded' }`.

**T3. A full blast (classical, scalachess test "contrived board", with a white pawn added on a2).**
- White: Kb1, Bh3, Pa2. Black: ka8, bd7, be7, nf7, rd6, qe6, nf6, qd5, re5. (The scalachess FEN
  `k7/3bbn2/3rqn2/3qr3/8/7B/8/1K6 w` has no pawn on a2.)
- Move `h3-e6`: `capture 1.0`.
- Afterwards only Kb1, Pa2 and ka8 are left, and the game goes on because a pawn is left.
- Without the white pawn, the same move ends in `result = { winner: null, reason: 'bareKings' }`.

**T4. Pawns survive, and a captured rook loses its castling right (classical, scalachess test "Must explode
surrounding non pawn pieces on capture").**
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
  - `royalDanger(White) = 0` (Q7; also 0 on the core before it).
- (b) Black to move. White Ke3, Pa2. Black kf5, ra3.
  - The kings don't touch. `a3-e3`: `capture 1.0`, then `result = { winner: 1, reason: 'exploded' }`.
- (c) Black to move. White Ke4, Pd3. Black kf5, ra3, ph7. The kings touch.
  - `a3-d3` is legal: d3 is next to e4 but not next to f5. `a3-d3`: `capture 1.0`.
  - Afterwards only kf5 and ph7 are left, and `result = { winner: 1, reason: 'exploded' }`.
  - `royalDanger(White) = 1` before the move (Q7).

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
  - White's rights are `[K]` only, and its legal castling moves are exactly `O-O`. Black has no right left: its
    `q` right went when the a8 rook moved.

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
- Black's ordinary moves, measures and merges are exactly `h8-g8 h8-g7 h7-h6 h7-h5 h6-g8 h6-f7 h6-g4 h6-f5 ?h6`:
  there is no merge, because only one part of the knight is on the board.
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

**T15. King danger counts explosions (Q7, 3.1).**
- (a) Black to move. White Ke1, Pd2. Black qa5, ke8.
  - `royalDanger(White) = 1`, because `a5-d2` blows up e1. `a5-d2`: `capture 1.0`, and Black wins.
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

**T17. No stalemate, because there is no check (classical, scalachess test "Must be a stalemate if a king could
usually take a piece, but can't because it would explode").**
- White Kf1, Rb6. Black ka8. White plays `b6-b7`.
- On lichess Black is now stalemated. Here `result` stays null, and Black's legal moves are exactly `a8-a7` and
  `a8-b8`. There is no `a8-b7`, because a king never captures.
- After either king move, White captures the king: `b7-a7` or `b7-b8` gives `capture 1.0`, then
  `result = { winner: 0, reason: 'exploded' }`.

**T18. A capturing promotion is Captured or Missed, never Moved (quantum, A-7).**
- Two worlds, ½ each:
  - {Ka1, Pg7, rh8, ke8, pa7}
  - {Ka1, Pg7, rb8, ke8, pa7}
- White's pawn moves are exactly `g7-g8=q g7-g8=r g7-g8=b g7-g8=n g7-h8=q g7-h8=r g7-h8=b g7-h8=n`.
- Each of `g7-h8=q`, `g7-h8=r`, `g7-h8=b` and `g7-h8=n`: `miss 0.5 R | capture 0.5 R`. There is no `move` result.
- Missed gives {Ka1, Pg7, rb8, ke8, pa7}. Captured gives {Ka1, ke8, pa7} whatever piece was chosen, and the game goes
  on (e8 is not next to h8).

**T19. En passant: the blast centre, and no en passant next to your own king (classical).**
- (a) Black to move. White Ke1, Pe5. Black ke8, pd7, nc4, be7, rc6.
  - `d7-d5`: `move 1.0`, and `x.ep` is d6. Then White `e5-d6`: `capture 1.0`, and the history record's `captures`
    holds only the square d6.
  - Afterwards only Ke1, ke8 and nc4 are left, and the game goes on.
  - be7 and rc6 are next to d6, so they explode. nc4 is next to d5, the captured pawn's square, but not next to d6,
    so it survives. ke8 is two ranks from d6 and survives.
- (b) Black to move. White Ke6, Pe5. Black kh8, pd7, pa7.
  - After `d7-d5`, White's legal moves are exactly `e6-d6 e6-d7 e6-e7 e6-f5 e6-f6 e6-f7`.
  - `e5-d6` is not legal: its blast centre d6 is next to White's king.

**T20. A merge onto a square next to your own king (quantum, A-4 and A-6).**
- (a) Four worlds, ¼ each: White Ke1 and a knight on b3 or f3; Black kh8, ph7 and a bishop on d2 or a5 (every
  combination once).
  - The legal merges are exactly `b3|f3-d4` and `b3|f3-d2`.
  - `b3|f3-d2`: `miss 0.5 R | move 0.5 R`.
  - Missed keeps the two worlds with the bishop on d2: the bishop is 100% on d2, the knight still 50% b3 / 50% f3.
  - Moved gives {Ke1, Nd2, ba5, kh8, ph7}.
- (b) Two worlds, ½ each: {Ke1, Nb3, bd2, kh8, ph7} and {Ke1, Nf3, bd2, kh8, ph7}.
  - The only legal merge is `b3|f3-d4`. `b3|f3-d2` is not legal: the capture on d2 is removed in both worlds.

**T21. A ghost attacks a ghost next to the king (quantum, A-5 and A-9).**
- Four worlds, ¼ each: White Ke1, Pa2 and a bishop on c4 or h3; Black ke8, pa7 and a knight on f7 or a6 (every
  combination once).
- `c4-f7`: `miss 0.5 R | move 0.25 R | capture 0.25 R`. No result carries an `end:` note.
  - Missed: the bishop is 100% on h3, and the knight is still 50% f7 / 50% a6.
  - Moved gives {Bf7, Ke1, Pa2, ke8, na6, pa7}, and the game goes on.
  - Captured gives {Ke1, Pa2, pa7} and `result = { winner: 0, reason: 'exploded' }`.
- `royalDanger(Black) = 0.25` before the move (Q7).

**T22. A destroyed part counts as one of the 4 places (quantum, A-2).**
- Black to move. Four worlds with relative weights 2 : 1 : 1 : 2. Every world has White Ke1, Pa2 and Black kh8, ph7.
  A black knight is, in turn: nowhere (destroyed; that world has no knight, see the notation), on d4, on e3, on g4.
- The knight's locations are: off the board ⅓, d4 ⅙, e3 ⅙, g4 ⅓. Black's budget is 4.
- `g4-f6|h6` is not legal, and the knight on g4 has no legal split at all. After the split the knight would have 5
  places: off the board, d4, e3, f6 and h6.
- The same position with the knight on c6 instead of destroyed: `g4-f6|h6` is not legal either (5 squares).
- Three worlds of equal weight, with the knight destroyed, on e3 and on g4: `g4-f6|h6` is legal (`split 1.0`, 4
  places).

**T23. The opponent's explosion lowers your budget (quantum, A-10).**
- Two worlds, ½ each:
  - {Ka1, Pa2, Re1, pe5, kh8, ph7, nd6}
  - {Ka1, Pa2, Re1, pe5, kh8, ph7, nf6}
- Black's budget is 2. `e1-e5`: `capture 1.0`. Both d6 and f6 are next to e5, so the knight is destroyed in both
  worlds.
- Afterwards there is one world, {Ka1, Pa2, kh8, ph7}, and Black's budget is 1.

**T24. King danger counts a converging capture next to the king (quantum, A-6, 3.1 fix).**
- (a) T11's position (two worlds, ½ each: {Ke1, Nd5, ke7, bf6} and {Ke1, Nh5, ke7, bf6}).
  - `royalDanger(Black) = 1`, with White to move and with Black to move: the merge `d5|h5-f6` blows up e7 for
    certain.
  - Without the 3.1 fix the core gives 0.5 (the single part `d5-f6`).
- (b) The same with a third world {Ke1, Na1, ke7, bf6}, ⅓ each.
  - `d5|h5-f6`: `miss ⅓ R | capture ⅔ R`. Captured gives {Ke1} and `result = { winner: 0, reason: 'exploded' }`;
    Missed gives {Ke1, Na1, bf6, ke7}.
  - `royalDanger(Black) = ⅔` (assert with `toBeCloseTo(2 / 3, 6)`). Without the 3.1 fix the core gives ⅓.
- (c) For comparison, a merge onto the king itself is counted by Q7 already: two worlds {Ke1, Nd5, kf6, ba8} and
  {Ke1, Nh5, kf6, ba8}: `royalDanger(Black) = 1`.

**T25. The 50-move count only restarts for a move that happened (A-11, Q8).**
- Two worlds, ½ each: {Ke1, Pe2, ke8, ne3} and {Ke1, Pe2, ke8, na6}, `quiet = 10`.
  - `e2-e3`: `miss 0.5 R | move 0.5 R`. After Missed `quiet = 11`, after Moved `quiet = 0`.
- {Ke1, Ra1, ke8, na6}, `quiet = 10`: `a1-a6` (a capture, it explodes) gives `quiet = 0`.
- Two worlds, ½ each: {Ke1, Ra1, ke8, na4} and {Ke1, Ra1, ke8, nc6}, `quiet = 10`: `a1-a6` is one unrolled `move 1.0`
  (pass = link) and gives `quiet = 11`.

**T26. An explosion takes a castling right in every possibility at once (quantum, A-8).**
- Black to move. `x.castle = castlingRights(V, world)` in both worlds, so White has `K`. Two worlds, ½ each:
  - {Ke1, Rh1, Ng2, Pa2, ke8, bb7}
  - {Ke1, Rh1, Nc3, Pa2, ke8, bb7}
- `b7-g2`: `move 0.5 R | capture 0.5 R`.
  - Moved gives {Ke1, Rh1, Nc3, Pa2, ke8, bg2} with White's right `K`; then White's `O-O` is `move 1.0`.
  - Captured gives {Ke1, Pa2, ke8} with no right at all (h1 is next to g2); `O-O` is not legal.
- With the knight on g1 instead of g2 (White to move): `O-O` is not legal, because g1 is not certainly empty.

**T27. No legal move is a draw, even at 100 % king danger (classical, 2.7).**
- Black to move. White Ka1. Black qb2, ba2, nc3, kh8.
- `c3-b1`: `move 1.0`. White's king now has no move (a king never captures), and White has no other piece, so
  `result = { winner: null, reason: 'noMoves' }`. Black threatens `b2-a1` (the king is at 100 % danger), and lichess
  scores the position as checkmate; here the game is drawn at once.

**T28. A part that joins another part of the same piece does not explode (quantum, A-5, Q14).**
- Two worlds, ½ each: {Ke1, Nf3, bd6, ke8} and {Ke1, Ne5, bd6, ke8}.
- `f3-e5`: `move 1.0`, not rolled. Afterwards there is one world, {Ke1, Ne5, bd6, ke8}, and the history record's
  `captures` is empty (the bishop on d6, next to e5, is untouched).

**L1. Blast marks (section 6, only if `layoutOf` is implemented).**
- After T19(a)'s `e5-d6`: the cells with shade `hill` or `hilldark` are exactly c5, c6, c7, d5, d6, d7, e5, e6 and e7;
  d6 has `hilldark`. `layout.outlines` is `[{ x1: 2, y1: 1, x2: 5, y2: 1 }, { x1: 5, y1: 1, x2: 5, y2: 4 },
  { x1: 5, y1: 4, x2: 2, y2: 4 }, { x1: 2, y1: 4, x2: 2, y2: 1 }]`.
- After T19(a)'s `d7-d5` (no capture), and after a Moved result: `layoutOf(state) === V.topology`.

**Fuzz.** Random games with splits must never throw. They must keep both budgets ≤ 8, and they must never have a
world without a king while `result` is null. The prototype passed 30 games of 120 plies.

The engine review also checked these claims of section 4 on every move of 240 random games of up to 120 plies
(splits in 30% of the moves, 18,627 moves, up to 48 worlds, 3 to 8 s per 60 games;
`handoff/tmp/critic-atomic/pass2/fuzz.mjs`, core in the working tree). All held, and the atomic fuzz test should check
them too:
- in every result of every move, either every world captured or none did (A-1), and `captures` has at most one
  square;
- no result carries a `solid:` note (A-3), and no `end:` note ever separates "a king was blown up" from "the game
  goes on" (A-9);
- the budget of the side that did not move never rises (A-10: `budgetInfo(V, s, side).used`);
- `x.ep`, `x.epVictim` and `x.castle` are identical in all worlds (W4, W5 with atomic's own castling filter);
- `layoutOf(state)` returns 64 cells (section 6);
- `royalDanger` is never below the cheap atomic test (a capture next to the king, 3.1); with the 3.1 fix it equals a
  brute-force count over every ordinary move and every legal merge of the enemy.

Partly destroyed pieces (A-2) turned up in 520 to 1,040 positions per 60 games, so the fuzz run does exercise them.

---

## Open design questions

1. **Core change for king danger (3.1).** Settled for ordinary moves: `CORE-CHANGES.md` Q7 counts every capture after
   which the side has no royal piece left (generic, no hook; in the working tree). **Open:** Q7 evaluates only merges
   onto a square that may hold the king, so a converging capture next to the king is not counted (T24: 0.5 instead
   of 1). The one-condition fix in 3.1 is needed; it changes no value in any other variant.
2. **Blast marks.** Settled: variant-level (`CORE-CHANGES.md` item 28), through atomic's own `layoutOf` (section 6).
   It stays optional.
3. **Label of the Captured outcome.** Settled: the shared text "Captured" stays, and the rules card says that every
   capture explodes (`CORE-CHANGES.md` item 29, `outcomeText` hook rejected).
4. The finer lichess insufficient-material draws are not used (section 1). Only "only the two kings are left" is an
   automatic draw.
5. **Repetition.** Lichess draws a fivefold repetition automatically. The shared quantum rules have no repetition
   draw, so atomic has none either (section 1, change 2). The core plan keeps it that way for every variant
   (`CORE-CHANGES.md` item 60: a documented deviation).
6. **"Destroyed" and the 4-place limit (A-2, T22).** The core counts "no longer on the board" as one of a piece's 4
   places, so a partly destroyed piece can stand on at most 3 squares. Atomic is the first variant where a piece can
   be partly gone, so this is where players will meet it. The spec accepts the core as it is. If the core team would
   rather count only board squares (`b.sq[X] >= 0` in the location count of `splitBranches`), T22's first case
   flips: `g4-f6|h6` becomes legal (4 squares plus "destroyed"). The case with the knight on c6 stays illegal, and
   nothing else in this spec changes.
7. **No legal move with the king in danger (2.7, T27).** Kings never capture, so a bare king boxed in by enemy pieces
   has no move, which is a draw by the shared rule (as in Fairy-Stockfish's `nocheckatomic`), while lichess scores it
   as checkmate. A `noMoves(state)` hook could score it as a loss when `royalDanger(V, state, state.turn) === 1`. The
   spec keeps the shared draw; the position is rare, and the classic "your king cannot escape" loss is not part of the
   variants core (`CORE-CHANGES.md` item 72).

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity (2026-09-25). Every page below was fetched, and the scalachess, Fairy-Stockfish
and PyChess sources were read from the clones in `handoff/ext/` (scalachess master of 2026-09-22). Every classical
test was re-run with the prototype on the current core (copy with fixed paths in `handoff/tmp/review1-atomic/`). T1 to
T16 give exactly the values in section 7. Nine scalachess `AtomicVariantTest` positions were also played on the
prototype (`lichess.mjs`): king capture b1xc1 illegal, the d5xd2 perimeter win, d8xd7 next to its own king illegal,
the lichess en passant blast, the discovered-check win d8xd2, "end move regression: from position" (T2 is the "from
init" test), K vs K, a king walking next to the enemy king, and the second contrived board. All agree with lichess,
apart from the deliberate capture-the-king change.

Confirmed without change: the board, square names and colours, the setup and castling rights, every piece's
movement, the king's move-only descriptor, the explosion set (`(dest.kingAttacks & occupied & ~pawns) | dest`), the
en passant centre, the ban on blowing up your own king, touching kings, castling squares, promotion choices, the loss
of castling rights for exploded rooks, the 50-move count, the bare-kings draw, and the 20 moves of the start position.

Changes:

1. **Section 1, Wikipedia row: history corrected.** The article says only that GICS introduced the game in 1995,
   "based on rules one of its users collected from friends who played offline". The date 27 November 1995 is the date
   of the cited GICS help page, not of the first game, and the user name "connex" appears in none of the fetched sources. Source:
   https://en.wikipedia.org/wiki/Atomic_chess (wikitext, History and references).
2. **Section 1: en passant quote re-attributed.** The quote "the 3×3 square is not centred on the captured pawn, but
   on the square it bypassed" is not in the Wikipedia article. The same rule, in the sources' own words, now comes
   from chessprogramming, chess.com, ICC and FICS. Sources: https://www.chessprogramming.org/Atomic_Chess,
   https://www.chess.com/terms/atomic-chess, the ICC and FICS help files (URLs in the table).
3. **Section 1: new source rows for ICC (wild 27) with Fairy-Stockfish `nocheckatomic`, and for FICS.** ICC's
   atomic is exactly the chosen capture-the-king rule set: no check or checkmate, castling through check allowed, and
   no move may destroy your own king. So change 1 has a published precedent. Sources:
   https://web.archive.org/web/20140525233041/http://www6.chessclub.com/help/atomic,
   https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/src/variant.cpp (`nocheckatomic_variant`),
   https://web.archive.org/web/20140525232429/http://www.freechess.org/Help/HelpFiles/atomic.html.
4. **Section 1, lichess row: "always legal" made precise, and automatic draws listed.** A move that blows up the
   enemy king may leave your own king in check, but it may never blow up your own king too (`kingSafety` requires
   `!explodesOwnKing`). Lichess's automatic draws are insufficient material, the 50-move rule and fivefold
   repetition; threefold can be claimed. Sources:
   https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Atomic.scala,
   https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Variant.scala (`autoDraw`).
5. **Section 1, change 2: the list of lichess insufficient-material draws corrected, and the missing repetition rule
   stated.** The old list left out K+N+N vs K, and "K+minor vs K" and "bishops on opposite colours" were vague. The
   scalachess code draws: a bare king against K+N, K+B, K+R or K+N+N; K+B vs K+B on opposite colours; and closed
   positions of kings, blocked pawns and bishops that can never capture. The spec did not say whether repetition
   draws exist. They do not, because the core has none: `quantum.js` has only the quiet, move-limit and no-move draws.
   A new open question 5 records this. Source: `insufficientAtomicWinningMaterial` and `atomicClosedPosition` in
   Atomic.scala (URL above).
6. **Section 1 row and section 3 values: Pav's piece values corrected.** The numbers Q 5.57, R 2.72, B 1.92, N 1.53
   are in none of Pav's three atomic articles. "Atomic Piece Values, Again" gives N 1.5, B 1.8, R 3.4, Q 7.8 per
   pawn for a random snapshot, so the values are now p 100, n 150, b 180, r 340, q 780. The AI check was re-run with
   the evaluate term (`handoff/tmp/review1-atomic/ai3.mjs`): Nxf7 was found on every level, a 60-ply self-play game
   took about 0.5 s, and Black's replies after 1. Nf3 a6 2. Ne5 were the same as with the old values. Sources:
   https://www.gilgamath.com/atomic-three, https://www.gilgamath.com/atomic-two.
7. **Section 2.4: "no chain reaction" stated.** Blasted pieces do not explode in turn. The prototype already did
   this, but the spec never said it. Source: ICC help ("There is no chain reaction -- only direct captures
   detonate").
8. **Section 2.4: "touching kings cannot be taken at all" corrected to "cannot be captured directly".** A touching
   king can still be blown up by a capture next to it that is not next to the other king. The old wording suggested
   the king was fully immune. Sources: https://en.wikipedia.org/wiki/Atomic_chess (Endgame: "a non-king piece can be
   captured that is adjacent to one king but not the other"), https://lichess.org/variant/atomic.
9. **Section 2.7: draws made explicit.** "No legal move" is a draw even when the king could be captured, because
   there is no checkmate. There is no repetition draw. A lichess stalemate usually has legal moves here (new T17).
   Sources: ICC help (check and checkmate are not recognized), and the core's `stateAfter` in `quantum.js`.
10. **Section 5, rules text lines 3 and 4 made precise.** "Any piece next to it" now reads "any piece or pawn next to
    it". In chess usage "piece" often excludes pawns, and capturing a pawn next to the king also wins. "Capture next
    to your own king" now reads "capture on a square next to your own king". Source: Atomic.scala
    (`explodesOpponentKing` tests `dest.kingAttacks` whatever the captured type).
11. **Section 7: T2, T3 and T4 labels now name the exact scalachess tests.** T3 now says that the scalachess FEN has
    no pawn on a2. T2's wording "the pawn on d5 has left d5" was replaced by what happens: both pawns are gone, and d5
    and e4 are empty. T9 now also says that Black's `q` right is gone. Source:
    https://github.com/lichess-org/scalachess/blob/master/test-kit/src/test/scala/AtomicVariantTest.scala.
12. **Section 7: new T17.** It uses the lichess stalemate test position, and shows the one place where the
    capture-the-king change alters a classical result. It was verified on the prototype: Black's moves are exactly
    `a8-a7 a8-b8`, and each is answered by a rook capture of the king, which wins. Sources: AtomicVariantTest (URL
    above), and the Wikipedia Check diagram (`k7/1R6/8/8/2K5/8/8/8`), which is "a win for White in variations that do
    not enforce the rules of check".

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency (2026-09-25). The review ran in two passes: pass 1 on the core
before the `CORE-CHANGES.md` packages, pass 2 on the core with the packages in the working tree. The list "Core
changes needed" at the end of pass 2 is the current one.

#### Pass 1 (core before the packages)

Read: `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md`, the core (`quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`,
`ai.js`), `docs/rules.md`, `docs/variants.md`, the variant UI (`useVariantGame.js`, `VariantBoard.vue`, `texts.js`,
`VariantGameView.vue`) and `handoff/CORE-CHANGES.md`, which appeared during the review. The spec now follows its
decisions. The core files did not change during the review.

Method: section 3 was written out as a prototype exactly as the sketch says (`handoff/tmp/critic-atomic/proto.mjs`).
Every value of T1 to T17 was asserted on the current core and all passed unchanged. The new tests T7(c) and T18 to
T23 were asserted the same way (`cases.mjs`, 114 checks in total). Section 4 was checked on every move of 240 random
games (`fuzz.mjs`), and the evaluate term on the AI (`ai.mjs`).

Confirmed without change: the engine mapping works with the hooks as built (the king's move-only descriptor,
`filterMoves`, `afterMove`, `worldResult`, `reasonText`, `evaluate`). Also confirmed: the explosion claims A-1, A-3,
A-9 and A-10, every value of T1 to T17, and the eight rules lines apart from line 4.

Changes:

1. **Header: where the prototype lives.** The committed scripts in `handoff/tools/atomic/` import the core from
   `/home/user/Quantum_Chess/...` and fail to load. `proto.mjs` there also still has the old piece values. The header
   now points to the working copies and says that `handoff/tmp/` is ignored by git.
2. **Section 3 sketch: `next.x.castle?.length` guard.** As written, `next.x.castle.filter` throws a TypeError on any
   world without a castling list, for example a test world whose `edit` sets no `castle`. The prototypes already had
   the guard.
3. **Section 3 table.**
   - The `filterMoves` row now also names `mergesFrom`, which offers the merges, and points to T19 and T20.
   - New rows: `applyMiss` and `unifyWorlds`, inherited from `orthodoxSpec()` after W4 and W5 (atomic must not
     override them), `blastArea` and `layoutOf`.
   - `reasonText`: the `bareKings` text becomes generic with U7.
4. **Section 3.1 now follows `CORE-CHANGES.md` Q7** (the generic "no royal piece after the capture" test, no hook).
   The spec had left the choice open. The review compared Q7's test with a cheap atomic test on every fuzz position,
   and they always agreed, so atomic needs nothing more.
   - The old text cited T13 for danger values, but T13 has none.
   - It described a "ring" that the variant UI does not have.
5. **Section 3, evaluate:** the term was re-run exactly as written. Nxf7 is found on all three levels.
6. **A-1: "the explosion happened in every possibility or in none" is now stated.** A-8 and the blast shading depend
   on it. The fuzz run found no result that mixed captured and uncaptured worlds in about 18,600 moves.
7. **A-2: new decision, "destroyed" counts as one of the 4 places** (T22, open question 6). This is the core as
   built: `splitBranches` counts `OFF` as a location. The spec was silent on it, and atomic is where players will
   first meet a partly gone piece.
8. **A-4 made precise.**
   - The illegal case is now "an enemy piece surely stands on the target".
   - En passant and merges are named, with new tests.
   - It now says that a touching king can be blown up from the side (new T7(c)).
9. **A-5 and A-6 now have tests.** A ghost part attacking a ghost gives Missed / Moved / Captured and only Captured
   explodes (T21). A merge onto a square next to your own king is either not offered, or rolled between Moved and
   Missed (T20).
10. **A-7 corrected.** The old reason, "the choice matters in the Moved possibilities", is wrong. A pawn's diagonal
    move exists only as a capture, so a capturing promotion is Captured or Missed, and the chosen piece never
    survives. T18 checks that all four keys give identical results.
11. **A-8 rewritten for D1, Q2 and W5:**
    - castling is legal only when it is possible in every possibility, and it never rolls;
    - a right is lost when the king or that rook is not 100% home;
    - an explosion removes a right in every possibility at once.

    The old "loses its right only there" described a case that A-1 rules out. "Resolved by the usual rules for a
    solid king move" (a roll) is no longer the shared rule.
12. **A-9 and A-10: evidence added.** A-9 cites T21 and the fuzz run. A-10 states the exact reason: which of your
    pieces a blast removes depends only on where your own pieces stand. T23 shows the opponent's budget falling.
13. **A-11: a Missed pawn move does not reset the 50-move count** (docs/rules.md section 6). Today's core does reset
    it: `e2-e3` Missed took `quiet` from 10 to 0 (`quiet.mjs`). `CORE-CHANGES.md` Q8 fixes this for every variant.
14. **Section 5, line 4 reworded.** "If such a move might capture, it is rolled" contradicted itself, because such a
    move is exactly one that may not capture. It also did not say that it applies to king moves. The meaning is
    unchanged. The other seven lines match section 4 and the shared texts in `texts.js`.
15. **Section 6 changed:**
    - The blast marks are now atomic's own `layoutOf` re-shading (`CORE-CHANGES.md` item 28) instead of a generic
      change to `useVariantGame.js`. Layout `lines` are drawn under square cells, so the shading can only be a colour
      cue, and the text says so.
    - The capture preview and "Captured (explodes)" moved to "not planned" (item 29 was rejected).
    - The optional "destroyed in" accessible label was dropped, because it would need a generic UI change.
    - King danger is shown in a status line, not a ring.
16. **Section 7 changed:**
    - new notation lines: the re-verification, and which values need Q7;
    - T7(a): the danger value is 0 both before and after Q7;
    - new tests T7(c) and T18 to T23;
    - the invariants that the atomic fuzz test should check.
17. **Open questions:** 1, 2, 3 and 5 are marked settled by `CORE-CHANGES.md`. New question 6 is the 4-place count.

Notes for the core team (generic, found in passing):
- W6 (`attacks(..., { royal: false })`) lists atomic's king-safety term as a user, but atomic does not need it. The
  atomic king's only descriptor is `mode: 'move'`, and `attacks` already skips move-only descriptors. Using W6 does
  no harm.
- In Q7, keep today's direct royal-capture test first and apply the move only when it fails. Then the multiverse
  placeholder danger moves (`kind: 'danger'`, whose `capture` is a royal victim) are counted without being applied.
  Q7's wording ("as today, or ...") implies this order.

Core changes needed, as seen in pass 1 (all already in `CORE-CHANGES.md`; nothing atomic-specific beyond Q7):

1. **Q7, king danger counts every loss of a royal piece.** In `royalDanger(V, state, side)`, for every enemy `e` of
   `side`, every world `b` and every move `m` of `generate(V, b, e)`, `m` counts when either:
   - `m.capture >= 0`, `b.sd[m.capture] === side` and `V.royalTypes.has(b.ty[m.capture])` (today's test, checked
     first); or
   - `m.capture >= 0`, `side` has a royal piece on the board in `b`, and it has none in `applyClassical(V, b, m)`.

   Weights are summed per `m.key` over the worlds, and the result is the largest sum, as today. Atomic's T7(c), T15
   and T21 danger values need it. Without it, the danger line misses every blow-up that is not a direct king
   capture.
2. The other planned items reach atomic through `orthodoxSpec()` and need nothing from it: Q1/W4 (en passant expiry
   in missed worlds), Q2 (castling and en passant certain-only), Q3/W5 (castling rights intersected over the worlds),
   Q4 (labels after settling rolls) and Q8 (Missed moves do not reset the quiet count). None of them changes a value
   in section 7.
3. Optional, not needed: count only board squares (`b.sq[X] >= 0`) in the 4-place limit of `splitBranches` (open
   question 6). T22's first case would then become legal.

#### Pass 2 (core packages in the working tree)

Read again: `handoff/CORE-CHANGES.md` (plan and review notes), the core as changed in the working tree (`quantum.js`
with Q1-Q14, `world.js`, `orthodox.js`, `orthodoxVariant.js` with W1-W7, `variant.js`, `ai.js` with U3, U4, U14),
the variant UI (`texts.js` with U7, `VariantBoard.vue` with U15, `useVariantGame.js`, `VariantGameView.vue`),
`docs/rules.md`, `docs/variants.md` and `tests/js/variants/fuzz.spec.js`. The core files were still being edited
during the review; the values below are from the tree as it stood at 17:30.

Method (`handoff/tmp/critic-atomic/pass2/`): `proto.mjs` is section 3 as now written, with `layoutOf` and `evaluate`.
`cases.mjs` asserts every value of T1 to T23, `new.mjs` those of T24 to T28 and L1; all pass. `fuzz.mjs` checked
section 4 on every move of 240 random games (4 seeds × 60, up to 120 plies, 18,627 moves), `diff.mjs` compared the
danger tests, `patched.mjs` ran the proposed core change on a patched copy of the core (`pass2/core/`, one condition
changed in `mergeDanger`), and `ai.mjs` the evaluate term on the current `ai.js`.

Confirmed without change: every value of T1 to T23 holds on the new core. Q2, Q3/W5, Q4, Q8 and Q14 changed none
of them, and the danger values of T7(c), T15 and T21 now hold (Q7). The claims A-1, A-3, A-9 and A-10 held on every
move. `x.ep`, `x.epVictim` and `x.castle` were identical in all worlds after every move. The eight rules lines match
section 4, the shared rules of `texts.js` (which now include the castling and game-end sentences, so atomic repeats
neither) and the generic `bareKings` text. The engine mapping works with the hooks as built.

Changes:

1. **Section 3.1 and A-6: converging captures next to the king (new finding, core change).** Q7 counts merges only
   when their target may hold a royal piece, so a merge onto any other piece next to the king, which blows the king
   up, is missed. T11's certain win shows as 50 % instead of 100 % (T24). This happened in 514 of 36,910 danger values
   of the fuzz run. 3.1 now gives the one-condition fix, verified on a patched copy of the core (equal to a
   brute-force count on every fuzz position, about 0.015 ms more per call). Before, 3.1 said that atomic needed
   nothing beyond Q7; that was checked on the core without merge danger.
2. **Section 3.1, 6, 7: Q7 status.** The texts "today's core returns 0" and "after Q7" are replaced: Q7 is in the
   working tree and gives the values of T7(c), T15 and T21.
3. **Section 3 sketch.** `hasKing` does not exist: `worldResult` now uses `hasRoyal` from world.js, and the helpers
   `neighbours`, `chebyshev` and `kingSquare` (from `royalSquares`) are written out. The value table is called
   `ATOMIC_VALUES`, because orthodox.js exports `VALUES` and an import would clash.
4. **Section 3 table and `reasonText`.** `applyMiss` and `unifyWorlds` are now in `orthodoxSpec()`, so the rows say
   what they do instead of "once the plan lands", and warn that a replaced `afterMove` must keep calling
   `orthodoxAfterMove`. The generic `bareKings` text is in `texts.js` (U7), so atomic's `reasonText` answers only
   `exploded`.
5. **A-8: the core now does what A-8 describes** (Q2, W5). The sentence "today's core still rolls castling" is
   replaced by the new test T26: a rolled capture that blows up the h1 rook removes `K` in its Captured result only,
   and `O-O` is then certain in the Moved result.
6. **A-11: Q8 is in the core.** New test T25: a Missed pawn move adds 1, a capture resets, a pass = link move adds 1.
7. **A-2 made precise.** A partly destroyed piece can merge only two parts that are still on the board. T12 now lists
   Black's moves: no merge for a knight that is 50 % h6 / 50 % gone.
8. **A-4 made precise.** The exact condition for offering such a move (some possibility with the piece on its square,
   a clear path and an empty target).
9. **A-5: new line and test T28.** A part that moves onto another part of the same piece joins it (Q14); nothing is
   captured, so nothing explodes, even with an enemy piece next to the target.
10. **Section 2.7 and open question 7: no legal move.** A bare king boxed in by enemy pieces has no move (kings never
    capture), which is a draw here and checkmate on lichess. New test T27 pins the draw; the spec keeps it (as
    Fairy-Stockfish's `nocheckatomic`, whose `stalemateValue` is a draw), and question 7 names the `noMoves` hook
    that would change it.
11. **Section 6: the blast mark gets an outline.** Pass 1 said that a variant cannot draw an outline, because
    `layout.lines` are drawn under the cells. U15 has since added `layout.outlines`, drawn above the cells (King of the
    Hill uses it). The spec now gives the exact rectangle, and L1 tests the cells and the four segments. The mark no
    longer depends on colour alone. The king-danger paragraph follows item 1.
12. **Section 7.**
    - Notation: what was verified on which core, what "Q7" and "3.1 fix" mean, and how to build worlds so that the
      parts of one piece get one id (T22's destroyed world simply omits the knight).
    - New tests T24 to T28 and L1; T12's move list; T7(a), T7(c), T15 and T21 no longer say "today's core gives 0".
    - Fuzz invariants: the budget through `budgetInfo`, `x.ep` / `x.castle` identical in all worlds, `layoutOf`,
      and the danger comparison of item 1. New numbers.
13. **Header:** points to the pass 2 scripts.

Notes for the core team (generic, found in passing):
- `CORE-CHANGES.md` section 5 says "atomic.md: T13 and T15 danger values hold on the core after Q7". T13 has no
  danger value; the tests are T7(c), T15 and T21, and T24 needs the fix of item 1.
- The item 1 fix belongs with Q7's converging captures (IT10 on `orthodoxSpec()` is unaffected: there a merge that
  does not capture the king never removes it).
- `docs/variants.md`, shared rule 6, gives "an explosion next to the king" as an example of the game-end roll. In
  atomic that is never a separate roll (A-9: kings are solid, so the move's own roll decides it). The atomic example
  of a game-end roll is "only the two kings are left" after an explosion that took a ghost in some possibilities
  only (T14).

**Core changes needed** (current list):

1. **New: `mergeDanger` evaluates every merge that might capture** (a follow-up to Q7; atomic.md 3.1, T24).
   - Exact semantics: in `royalDanger(V, state, side)` → `mergeDanger(V, state, e, side)`, a merge candidate `mv` of
     enemy `e` (from `mergeCandidates(V, se, f)`) is evaluated when **some world of `se` has on `mv.to[0]` a piece of
     a side `s` with `V.enemies(e, s)`**, instead of "a royal piece of `side`". Nothing else changes: the merge's
     per-world entries come from `perWorldMerge`, a world counts when its entry has `m.capture >= 0` and
     `royalLoss(V, b, m, side, hasRoyalPiece(V, b, side), entry.b)` holds, its weight is summed, and the largest sum
     over the merges and over the ordinary move keys is the danger.
   - Effect: a converging capture next to a king now counts like any other blow-up. In variants where only a capture
     *of* a royal piece removes it, the extra merges never count, so every other value is unchanged.
   - Tests: T24(a) 1 (with either side to move), T24(b) ⅔, T24(c) 1; Q7-a to Q7-d unchanged.
   - Why a variant hook cannot do it: the UI calls the core's `royalDanger` directly, and no hook lets a variant add
     danger; a new hook would itself be a core change, and the one condition is simpler and generic.
   - Cost: about 0.05 ms per call instead of 0.035 ms (atomic fuzz positions); it runs only for the danger line and
     Kriegspiel's announcements, never in the AI search.
2. **Already in the working tree, needed as they are:** Q7 (royal loss after a capture; T7(c), T15, T21), Q1/W4
   (`applyMiss` = `clearEnPassant`), Q2 (castling and en passant certain-only), Q3/W5 (`unifyWorlds` =
   `unifyCastling`; T26), Q4 (labels after the game-end roll; T14 unchanged), Q8 (T25), Q14 (T28), U7 (`bareKings`
   text) and U15 (`layout.outlines`, L1). Atomic needs nothing else from them.
3. Optional, not needed: count only board squares (`b.sq[X] >= 0`) in the 4-place limit of `splitBranches` (open
   question 6). T22's first case would then become legal.
