# Variant spec: `crazyhouse` (Crazyhouse)

Category: `rules`. Players: 2. UI name: "Crazyhouse". Summary line (already in `catalog.js`): "Captured pieces change
sides and can be dropped back onto the board."

---

## 1. Sources and chosen rule set

Research note: WebFetch and curl were blocked by the network proxy for lichess.org, wikipedia.org, pychess.org,
chess.com, chessvariants.com, talkchess.com and fandom.com. Only raw.githubusercontent.com could be read. So the
primary source is the **lichess rules code itself** (scalachess). The other sources below are search-engine extracts.
Every test case in section 7 was run on a prototype built on the real `src/variants/core`
(`handoff/prototypes/zh/zh.mjs`, `tzh.mjs`, `tzhq.mjs`, `tzh3.mjs`, `fuzz.mjs`, `ai2.mjs`).

| Source | What it gives |
|---|---|
| scalachess `core/src/main/scala/variant/Crazyhouse.scala` (read in full, copy in `handoff/ext/zh/Crazyhouse.scala`) | The lichess rules as code. Drops go on any empty square (`board.put` fails on occupied squares). `canDropPawnOn`: a pawn may not be dropped on rank 1 or rank 8. `Data.store`: a captured piece whose square is in `promoted` goes to the pocket as a **pawn**. `fiftyMoves = false`: **no fifty-move rule**. `isInsufficientMaterial = false`. `staleMate` only when no drop is possible either. Drops may give check (only "must not leave own king in check" applies). |
| pychess-variants `static/docs/crazyhouse.md` (read in full) | The same rules in prose: "Drops resulting in immediate checkmate are permitted. Unlike in shogi, this includes pawn drops." "Pawns may not be dropped on the players' 1st or 8th ranks." "Pawns that have been promoted and later captured are dropped as pawns." "Dropped white and black pawns on the 2nd and 7th ranks, respectively, are permitted to make a two-square move." "**A dropped rook can't castle.**" Also the strategy note that pawns and knights gain value and queens, rooks and bishops lose value. |
| Fairy-Stockfish `src/variant.cpp` (`crazyhouse_variant`) and `src/psqt.cpp` (read) | `pieceDrops = true`, `capturesToHand = true`, standard start position with empty pockets. `psqt.cpp`: piece values "saturate earlier in drop variants" (`v * 7000 / (7000 + v)`) and are halved because a capture changes the material twice. |
| lichess.org/variant/crazyhouse, Wikipedia "Crazyhouse", Lichess Wiki (search extracts) | Same rules. "A pawn that is dropped on its 2nd rank may use its two-square initial advance." |
| lichess forum "Castling with a dropped rook freezes games" and "Crazyhouse castling bug" (search extracts) | Lichess does not allow castling with a dropped rook. |
| lila PR #21647 "Show fifty-move rule in analysis UI" (search extract) | Confirms that `Crazyhouse.fiftyMoves = false` on lichess. |
| lichess forum "Value of Pieces in Crazyhouse", chess.com "Crazyhouse strategy" (search extracts) | Common human estimate "1-2-4": pawn 1, knight/bishop/rook 2, queen 4. Knights are rated a little higher, bishops a little lower. |

**Chosen rule set: lichess Crazyhouse (scalachess).** It is the reference implementation that most players know. The
sources agree on every drop rule. They differ only on details outside the drop rules, which are decided here:

- **Castling with a dropped rook:** not allowed (lichess, pychess). Some older club rule sets let a rook dropped on
  its corner castle. Lichess wins because its rule follows from the ordinary castling rights (a right is lost for
  good when the rook leaves its square or is captured), and our engine already handles rights that way.
- **Check and checkmate:** Quantum Chess has no check. You win by **capturing the king**, as in every variant of this
  app. A crazyhouse "drop mate" becomes a king capture on the next move.
- **Draws:** lichess has no fifty-move rule and no insufficient-material draw. It does have threefold repetition and
  stalemate (only when no drop is possible). This app keeps its **generic** draw rules instead. They are: 50 moves by
  each side without a capture, a pawn move or a drop (`quietPlies` 100), the move limit (`maxPly` 600), and no legal
  move. The variant core has no repetition rule. The quiet rule can only fire after 100 plies with no capture, pawn
  move or drop, which almost never happens in crazyhouse. It keeps pass & play games finite. There is never a
  material draw: all 32 pieces stay in the game.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- 8 × 8 board, files `a`–`h` (coordinate 0–7), ranks `1`–`8` (coordinate 0–7). All 64 squares exist.
- Square names are file letter + rank number (`e4`). `a1` is dark (`(f + r) % 2 === 0` → dark).
- White (side 0) sits at the bottom and moves up (+rank). Black (side 1) sits at the top and moves down.
- Each side also has a **hand** (pocket): captured pieces waiting to be dropped. Hands are not squares. In the world
  they are pieces with `sq = HAND (-2)`.

### 2.2 Pieces and movement

Vectors are `[file, rank]`. `oriented` vectors are written for White and mirrored in rank for Black.

| Type | Name | Movement descriptors | Notes |
|---|---|---|---|
| `k` | King | `{ leap: KING_STEPS }` (8 neighbours) | Royal. Castling is an extra move. |
| `q` | Queen | `{ ride: ROOK_DIRS }`, `{ ride: BISHOP_DIRS }` | |
| `r` | Rook | `{ ride: ROOK_DIRS }` | |
| `b` | Bishop | `{ ride: BISHOP_DIRS }` | |
| `n` | Knight | `{ leap: KNIGHT_JUMPS }` (±1,±2 and ±2,±1) | |
| `p` | Pawn | `{ leap: [[0,1]], oriented, mode: 'move' }`, `{ leap: [[1,1],[-1,1]], oriented, mode: 'capture' }` | Double step and en passant are extra moves. Promotes on the last rank. |
| `+q` | Promoted queen | as `q` | Created only by promotion. Goes to the capturer's hand as a pawn. |
| `+r` | Promoted rook | as `r` | as above |
| `+b` | Promoted bishop | as `b` | as above |
| `+n` | Promoted knight | as `n` | as above |

`ROOK_DIRS`, `BISHOP_DIRS`, `KING_STEPS` and `KNIGHT_JUMPS` are the constants of `core/orthodox.js`. Promoted types are
separate type ids so that the "reverts to a pawn" rule is visible on the board and needs no extra bookkeeping. This
matches scalachess, which tracks the squares of promoted pieces in `Data.promoted`.

### 2.3 Setup (every square)

- White: Ra1, Nb1, Bc1, Qd1, Ke1, Bf1, Ng1, Rh1, pawns a2, b2, c2, d2, e2, f2, g2, h2.
- Black: Ra8, Nb8, Bc8, Qd8, Ke8, Bf8, Ng8, Rh8, pawns a7, b7, c7, d7, e7, f7, g7, h7.
- Both hands are empty. Castling rights KQkq, no en passant square. White moves first.

### 2.4 Captures and hands

- A captured piece **changes colour** and goes into the **capturer's** hand. For example, White captures a black
  knight, and White now holds a white knight in hand.
- A captured **promoted** piece (`+q`, `+r`, `+b`, `+n`) goes into the hand as a **pawn**.
- A king never goes into a hand. Capturing it ends the game (2.7).
- En passant captures send the captured pawn to the hand like any capture.
- The total number of pieces is always 32: pieces only move between the board and the hands.

### 2.5 Drops

- Instead of moving a piece, the side to move may **drop** one piece from its own hand onto **any empty square**.
- **Pawns may not be dropped on rank 1 or rank 8**, for either colour.
- A drop never captures. A drop may attack the enemy king ("drop mate" in orthodox crazyhouse), and so may a pawn drop.
- A dropped piece is an ordinary piece from then on:
  - a pawn dropped on its own second rank (rank 2 for White, rank 7 for Black) may make the **two-square step**,
    and may then be taken **en passant**;
  - a pawn dropped on rank 7 (White) or rank 2 (Black) promotes on its next step.
- Move code: `<type>@<square>` with the type id in lower case (`dropKey`): `p@e4`, `n@f3`, `b@c4`, `r@d1`, `q@h5`.
  The move list may print it in upper case (`N@f3`).

### 2.6 Other special moves

- **Double step and en passant:** as in chess. The double step is allowed from rank 2 (White) or rank 7 (Black),
  whatever the pawn's history, so it also applies to dropped pawns. Uses `pawnExtras`.
- **Castling:** as in chess (without the check conditions: Quantum Chess has no check). King e1→g1 with rook h1→f1
  (`O-O`), or king e1→c1 with rook a1→d1 (`O-O-O`). Black castles the same way on rank 8. Every square between the
  king and the rook must be empty. A right is lost for good when the king or that rook moves, or the rook is captured
  on its square (`orthodoxAfterMove`). **A rook dropped on a1/h1/a8/h8 never castles**: its right was lost when the
  original rook left or was captured, and a drop never restores a right.
- **Promotion:** a pawn reaching the last rank must promote to a queen, rook, bishop or knight (codes `e7-e8=q`,
  `=r`, `=b`, `=n`). The new piece has the promoted type (`+q`, ...).

### 2.7 End of the game

- **Win:** capture the enemy king (lichess: checkmate). Resignation.
- **Draw:** quiet rule (100 plies without a capture, a pawn move or a drop), move limit (600 plies), a side to move
  without any legal move (move, drop, split, merge or measure). Also agreement, which the UI provides.
- **Turn order:** White, Black, alternating.

---

## 3. Engine mapping (contract)

| Field | Value |
|---|---|
| `id`, `category` | `'crazyhouse'`, `'rules'` |
| `sides` | `whiteBlack()` (0 = White, 1 = Black) |
| `teams`, `enemies` | none, default (`a !== b`) |
| `topology` | `standardBoard(8, 8).topology` (as `orthodoxSpec()`) |
| `types` | `orthodoxTypes({ lastRank })` plus `+q`, `+r`, `+b`, `+n` copied from `q`, `r`, `b`, `n` |
| royal | `k` |
| solid | `k`, `p` (the defaults). Promoted types are not solid. |
| splittable | `q`, `r`, `b`, `n`, `+q`, `+r`, `+b`, `+n` (the default `!solid`) |
| `drops` | `true` (shows both hands in the UI) |
| `setup` | `standardSetup(V, 'rnbqkbnr')` (castling KQkq, ep −1, empty hands) |
| `extraMoves` | `pawnExtras` (double steps from rank index 1 / 6, en passant), `castlingMoves`, and **drops** (below) |
| `onCapture` | victim to the capturer's hand (below) |
| `afterMove` | `orthodoxAfterMove` (ep square, castling rights), then turn a promotion into the promoted type |
| `solidExtra` | the hand contents (a guard, see 4.1) |
| `worldResult` | the default: a side without its king has lost (`reason: 'king'`) |
| `evaluate` | hand pieces at full value, and pieces near the enemy king (below) |
| `quietPlies`, `maxPly` | defaults (100, 600) |
| `options`, `visibility` | none |

Piece values for the computer (`value`, centipawns), after the "1-2-2-2-4" crazyhouse estimate:

| `p` | `n` | `b` | `r` | `q` | `k` | `+q` | `+r` | `+b` | `+n` |
|---|---|---|---|---|---|---|---|---|---|
| 100 | 220 | 200 | 230 | 420 | 400 | 420 | 230 | 200 | 220 |

The promoted types keep the value of their base type. The loss when one is captured (the opponent gains only a pawn)
is visible to the search anyway, through the hand.

Sketch (verified in the prototype; the names are those of `core/world.js` and `core/orthodox.js`):

```js
const PROMOTED = { '+q': 'q', '+r': 'r', '+b': 'b', '+n': 'n' }

extraMoves(w, side) {
	const out = [
		...pawnExtras(spec, w, side, (s, sq) => board.rankOf(sq) === (s === 0 ? 1 : 6)),
		...castlingMoves(spec, w, side),
	]
	for (const [type, ids] of handOf(w, side)) {           // one entry per type; ids ascending
		for (let sq = 0; sq < 64; sq++) {
			if (w.board[sq] !== -1) continue
			const r = board.rankOf(sq)
			if (type === 'p' && (r === 0 || r === 7)) continue
			out.push({ key: dropKey(spec, type, sq), from: -1, to: sq, id: ids[0], capture: -1,
				promo: null, drop: type, kind: 'drop' })
		}
	}
	return out
},
onCapture(next, victim, m) {
	const t = next.ty[victim]
	if (spec.types[t].royal) { placePiece(next, victim, OFF); return }  // the game is over anyway
	placePiece(next, victim, HAND)
	next.sd[victim] = next.sd[m.id]                         // the capturer's side
	next.ty[victim] = PROMOTED[t] ? 'p' : t
},
afterMove(next, m) {
	orthodoxAfterMove(spec, next, m)
	if (m.promo) next.ty[m.id] = '+' + m.promo              // the core already set 'q'; mark it as promoted
},
solidExtra(b) {                                            // every hand piece as side + type, sorted
	const out = []
	for (let id = 0; id < b.sq.length; id++) if (b.sq[id] === HAND) out.push(b.sd[id] + b.ty[id])
	return out.sort().join('')
},
```

Keep the promotion choices `['q', 'r', 'b', 'n']`, so that the move codes stay `e7-e8=q`. `afterMove` turns the type
into `+q`. The castling-rights filter of `orthodoxAfterMove` also runs for drops (`m.from = -1`). This is harmless:
a drop onto a rook's home square only happens after that rook's right is already gone.

`evaluate(w, side)` (tried in the prototype, where it gives plausible play: the computer drops for tactics instead of
at once):

- **+0.2 × value** for every piece in the own hand, and **−0.2 × value** for every piece in the enemy hand. `ai.js`
  counts hand pieces at 0.8, so this puts them at full value. Without it, the computer drops every piece at once for
  a free +20%.
- **+12** for every own non-king piece within king distance 2 of the enemy king, and **−12** for every enemy piece
  within distance 2 of the own king.

Performance (prototype): 20 random games of 80 plies take 1.9 s in total, with at most 32 worlds. From a middlegame
position with a pawn in hand (70 legal moves), `chooseMove` takes 16 ms (easy), 103 ms (normal) and 232 ms (hard).

---

## 4. Quantum adaptation

The shared rules apply unchanged: split, merge, measure, land = roll, pass = link, solid roll, game-end roll, budget
8, 4 squares per split. The crazyhouse-specific decisions are these.

### 4.1 Hands are always certain

The brief asks what happens when "a ghost is captured only in some worlds". The answer is that the capture roll
decides it, and the hands then agree in every possibility:

- A capture always **lands** on a square where a piece is or might be, so it is in the measured class. When the
  outcomes differ it is rolled: *Captured* against *Moved* or *Missed*. After the roll, the ghost is captured in every
  remaining possibility or in none.
- **One occupant per square.** Over all possibilities, a square never holds two different pieces. This is the classic
  invariant I1 of `engine-rules.md`, and "land = roll" keeps it in the variant core too: a move, merge or drop that
  lands where another piece might be is rolled, and splits need certainly empty targets. So a capture takes the
  **same piece id** in every possibility where it captures.
- It follows that **every hand is identical, piece ids included, in all possibilities**. The prototype fuzz test
  confirmed this over 1569 random plies with 171 splits and 167 drops: no state had differing hands.

So there is no "maybe in hand" piece, and hands never count towards the budget (every possibility has the same
hand). The implementation still adds the hands to `solidExtra`, as a cheap guard. If a future rule ever broke the
invariant, the solid roll would settle the hands instead of leaving an uncertain hand. The core already does this for
pawns in hand (`solidKey` counts solid types in hands). The UI's `min–max` hand display then always shows one number.

### 4.2 Drops: land = roll

- A drop is always in the **measured class** (`isMeasured` already returns true for drops).
- **Onto a certainly empty square:** the drop is certain. The piece is 100% on that square.
- **Onto a square where a ghost part (enemy *or* own) might stand:** a roll with two results:
  - **Dropped** (key `move`): the square was empty. The piece is placed, and the ghost is known **not** to be there.
  - **Missed** (key `miss`): the square was taken. Nothing is placed, the piece **stays in the hand**, and the turn is
    used. The ghost is now 100% on that square.

  A drop is therefore a cheap **probe**, like a pawn push. The odds are those of the square being empty.
- A drop is never "pass = link" (it has no path), and never falls back to a budget roll.
- **Which piece id is dropped:** the lowest id of that type in the mover's hand (`handOf` lists ids ascending). By 4.1
  this is the same piece in every possibility, so the dropped piece is one solid piece everywhere. No renumbering is
  needed.
- **No split drops.** A piece cannot be dropped onto two squares at once. That would be a new move form
  (`N@f3|h3`), and the brief asks for simplicity. A dropped queen, rook, bishop or knight may split from the next
  turn on, like any piece.
- Pawn drops create a **solid** pawn. The rank 1 and 8 restriction is checked per possibility, but it depends only on
  the square, so it is the same everywhere.

### 4.3 Promoted pieces

`+q`, `+r`, `+b` and `+n` are ordinary splittable pieces. They can split, merge, be measured and link. When a part of
a promoted ghost is captured, the capture roll decides whether it was there. In the *Captured* branch the capturer
receives a **pawn**, certainly (test Z7). Pawns in hand are solid (the core's `solidKey`), which matches 4.1.

### 4.4 Castling, en passant, promotion

These are unchanged from the orthodox variants of this app:

- rights and the ep square are per-possibility world state (`x.castle`, `x.ep`);
- castling is a king move, so it is rolled when it is possible in some possibilities only;
- a ghost part, or a dropped piece, between king and rook blocks castling in the possibilities where it stands.

A rook dropped in the corner never castles (2.6).

### 4.5 Budget, game end, counters

- **Budget:** 8 per side, counted as usual. Drops and captures never raise it: a drop happens in all remaining
  possibilities or in none, and hands are identical. Splitting a dropped piece raises it as usual.
- **Game end:** capture the king. A king is solid, so a king capture is certain or rolled (*Captured*/*Missed*), and
  the game-end roll never has more to do than in classic Quantum Chess.
- **Quiet counter:** a drop resets it, like a capture or a pawn move (the core already does this: `sample.drop`).
- **King danger ring:** counts only moves that capture now. A drop cannot capture, so an enemy piece in hand does not
  add to the ring. The player sees the hands, and the confirmation dialog covers blunders as usual.

---

## 5. Player-facing rules text (rules card)

1. When you capture a piece, it changes colour and goes into your hand.
2. Instead of moving, you may drop a piece from your hand onto any empty square. Pawns may not be dropped on the first
   or last rank.
3. A pawn dropped on your own second rank may still move two squares.
4. A promoted piece (marked with a small +) goes back into the hand as a pawn when it is captured.
5. A rook that was dropped in its corner cannot castle.
6. Dropping onto a square where a ghost might stand is a roll: either your piece lands, or the square was taken, your
   piece stays in your hand and the ghost is found.
7. You always know exactly what is in both hands.
8. Capture the enemy king to win.

---

## 6. UI layout

- **Board:** the standard 8 × 8 `rectTopology` with file and rank labels, light/dark shades, White at the bottom (as
  `orthodoxSpec()`).
- **Hands:** the existing hands panel (`drops: true`), one row per side: "In hand: White" and "In hand: Black". Use
  the cburnett sprites of the owner's colour with the count next to them, in the order P, N, B, R, Q. Only the side to
  move can click its hand.
  - Choosing a hand piece highlights every legal drop square, with the usual preview badge: **Certain** on certainly
    empty squares, **Roll** with the odds where a ghost might stand.
  - Pawn drops never show squares on rank 1 or 8.
- **Outcome wording for drops:** show **"Dropped"** instead of "Moved", and **"Missed: the square was taken"**
  instead of "Missed". In the move list, write drops in upper case: `N@f3`.
- **Promoted pieces:** use the cburnett sprite of the base type (`glyph: { sprite: 'q', promoted: true }`), plus a
  small marker. This needs two small UI changes:
  - `glyphOf` must pass `promoted` through for sprites;
  - `VariantPiece.vue` draws the marker: a red disc (`#b71c1c`, r = 0.11 × size) with a white "+", in the
    **top-right** corner of the piece (x = +0.32 × size, y = −0.32 × size), away from the probability badge in the
    bottom-right.

  Type names: "Promoted queen", "Promoted rook", "Promoted bishop", "Promoted knight" (screen readers and tooltips).

---

## 7. Test cases

Notation: placements as in `worldFrom` (`{ e1: '0:k' }`, side 0 = White, 1 = Black). "Hand" lists `[side, type]`,
which in the Vitest helper means `addPiece(b, type, side, HAND)` in `edit`. `x = { ep: -1, epVictim: -1, castle: [] }`
unless stated otherwise. Two worlds written "A / B" have equal weight unless stated otherwise. All results below were
produced by the prototype.

| # | Position and moves | Expected |
|---|---|---|
| Z1 | Start position. `e2-e4`, `d7-d5`, `e4-d5`, `d8-d5`. | White's hand holds 1 pawn, and so does Black's (`handView` → `[{type:'p',min:1,max:1}]` each). `quiet` = 0. White has 33 drop codes (the 33 empty squares on ranks 2–7). `p@e2` and `p@e3` are legal. `p@e1`, `p@e8` and `p@e7` (occupied) are not. |
| Z2 | White Ke1, Black Ke8, White hand `[0,'n']`, `quiet` = 7. `n@f3`. | One outcome, `move` p = 1 (certain). The knight is 100% on f3 and White's hand is empty. `quiet` = 0. |
| Z3 | White Ke1, Black Ke8, hands `[0,'p']` and `[1,'p']`, White to move. | `p@a1` and `p@h8` are illegal. `p@a2` and `p@h7` are legal. There are exactly 48 pawn-drop codes (ranks 2–7, 48 empty squares). The same holds for Black: `p@a1` and `p@a8` are illegal, `p@a2` is legal, 48 codes. |
| Z4 | White Ke1, Black Ke8, pe4, pa7, White hand `[0,'p']`. `p@d2`, `a7-a6`, `d2-d4`, `e4-d3`. | `d2-d4` is legal and certain. After it, the ep square is d3 and `e4-d3` (en passant) is legal. After `e4-d3`: black pawn on d3, White's d4 pawn gone, Black's hand holds 1 pawn. |
| Z5 | White Ka1, Pe7, Black Kh8, Ra8. `e7-e8=q` (the choices are `=q`, `=r`, `=b`, `=n`), then `a8-e8`. | After the promotion, the piece on e8 has type `+q` and moves like a queen. After `a8-e8` (certain capture), Black's hand holds a **pawn**, not a queen. |
| Z6 | White Ke1, Rh1, Black Ke8, pa7, White hand `[0,'r']`, `x.castle = [{flag:'K', side:0, king:e1, rook:h1, kingTo:g1, rookTo:f1}]`. `h1-h5`, `a7-a6`, `r@h1`, `a6-a5`. | `O-O` is legal at the start. After the sequence, the dropped rook stands on h1 and the king on e1, but `O-O` is **not** legal (the right was lost when the rook left h1). |
| Z7 | White Ka1, Pd7, Black Kh8, Ra5, Bh1. `d7-d8=q`, `h8-h7`, `d8-d5\|d2` (the promoted queen splits), then Black `a5-d5`. | The split gives 50% d5 / 50% d2. `a5-d5` is rolled: `move` 50% / `capture` 50%. In the capture branch the rook stands on d5, the queen is gone from every possibility, and Black's hand holds 1 **pawn** (certain). |
| Z8 | White Ka1, Black Kh8, pa6, White hand `[0,'p']`. `p@c7`, `a6-a5`. | White can now play `c7-c8=q`, `=r`, `=b` or `=n`. |
| Z9 | White Ke1, Rh1 (right K as in Z6), Black Ke8, Black hand `[1,'n']`, Black to move. `n@f1`. | Certain drop. White's `O-O` is not legal while f1 is occupied. `e1-f1` captures the knight with certainty. |
| Z10 | White Ka1, Black Kh8, pg7, ph7, White hand `[0,'n']`. `n@f7`, `g7-g6`, `f7-h8`. | `f7-h8` is a certain capture of the king. The result is `{ winner: 0, reason: 'king' }`. |
| Q1 (quantum: drop probe) | A: White Ke1, Black Ke8, nd4 / B: White Ke1, Black Ke8, nf4. Both: White hand `[0,'p']`. `p@d4`. | Two rolled outcomes: `miss` 50%, `move` 50%. **Miss:** the knight is 100% on d4 and the pawn is still in White's hand. **Move:** a white pawn stands on d4 and the knight is 100% on f4. |
| Q2 (quantum: capturing a ghost) | A: White Ke1, Bb5, Black Ke8, nc6 / B: White Ke1, Bb5, Black Ke8, na6. `b5-c6`. | Rolled: `move` 50%, `capture` 50%. **Move:** the bishop is on c6, the knight is 100% on a6, and both hands are empty. **Capture:** the bishop is on c6 and White's hand holds a knight (certain, `min = max = 1`). |
| Q3 (quantum: drop onto an own ghost) | A: White Ke1, Nc3, Black Ke8 / B: White Ke1, Ne5, Black Ke8. Both: White hand `[0,'b']`. `b@e5`. | Rolled: `miss` 50% (the knight is 100% on e5 and the bishop stays in hand) / `move` 50% (the bishop is 100% on e5 and the knight is 100% on c3). |
| Q4 (quantum: a dropped piece is one piece) | White Ke1, Ng1, White hand `[0,'n']`, Black Ke8. `g1-f3\|h3`, `e8-d8`, `n@c3`. | The split takes White's budget to 2. `n@c3` is certain (the drop does not care where the ghost is). Afterwards the budget is still 2, the c3 knight has the same id in both possibilities (`ownPieceAt(c3) >= 0`), and it can split on White's next turn. |
| Q5 (drop odds) | A (weight 3): White Ke1, Black Ke8, nd4 / B (weight 1): White Ke1, Black Ke8, nf5. White hand `[0,'p']`. `p@d4`. | `miss` 75%, `move` 25%. |
| F1 (fuzz invariant) | Random games (the fuzz spec). | After every move, every world has the same set of hand pieces (id, side, type). The budget is ≤ 8 for both sides. No world has a pawn on rank 1 or 8. The piece count on the board plus in the hands plus the kings off the board is always 32. |
