# Variant spec: `crazyhouse` (Crazyhouse)

Category: `rules`. Players: 2. UI name: "Crazyhouse". Summary line (already in `catalog.js`): "Captured pieces change
sides and can be dropped back onto the board."

---

## 1. Sources and chosen rule set

Research note: WebFetch and curl were blocked by the network proxy for lichess.org, wikipedia.org, pychess.org,
chess.com, chessvariants.com, talkchess.com and fandom.com. Only raw.githubusercontent.com could be read. So the
primary source is the **lichess rules code itself** (scalachess). The other sources below were search-engine extracts
at first; in the source review (8.1) the web pages were fetched and every classical rule was checked against them.
Every test case in section 7 was run on a prototype built on the real `src/variants/core`
(`handoff/prototypes/zh/zh.mjs`, `tzh.mjs`, `tzhq.mjs`, `tzh3.mjs`, `fuzz.mjs`, `ai2.mjs`), and re-run in the review
on a copy that follows the section 3 sketch exactly (`handoff/tmp/zh-review1/`, see 8.1). The engine review (8.2) ran
them once more through the real Vitest helpers (`tests/js/variants/helpers.js`), with the extra cases Z13, Z14 and
Q6–Q15, on the core as changed by `handoff/CORE-CHANGES.md` (`handoff/tmp/critic-crazyhouse/`).

| Source | What it gives |
|---|---|
| scalachess `core/src/main/scala/variant/Crazyhouse.scala` and `MoveOrDrop.scala` (read in full, clone in `handoff/ext/scalachess/`) | The lichess rules as code. Drops go on any empty square (`board.put` fails on occupied squares). `canDropPawnOn`: a pawn may not be dropped on rank 1 or rank 8 (absolute ranks, both colours). `Data.store`: a captured piece whose square is in `promoted` goes to the pocket as a **pawn**. `fiftyMoves = false`: **no fifty-move rule**. `isInsufficientMaterial = false`. `staleMate` only when no drop is possible either. Drops may give check (only "must not leave own king in check" applies). `Drop` keeps `unmovedRooks = before.unmovedRooks`: a drop never creates a castling right. Pocket order `Pawn, Knight, Bishop, Rook, Queen`. |
| pychess-variants `static/docs/crazyhouse.md` (read in full) | The same rules in prose: "Drops resulting in immediate checkmate are permitted. Unlike in shogi, this includes pawn drops." "Pawns may not be dropped on the players' 1st or 8th ranks." "Pawns that have been promoted and later captured are dropped as pawns." "Dropped white and black pawns on the 2nd and 7th ranks, respectively, are permitted to make a two-square move." "**A dropped rook can't castle.**" Also the strategy note that pawns and knights gain value and queens, rooks and bishops lose value. |
| Fairy-Stockfish `src/variant.cpp` (`crazyhouse_variant`), `src/variants.ini` and `src/psqt.cpp` (read) | `pieceDrops = true`, `capturesToHand = true`, standard start position with empty pockets. `castlingDroppedPiece` ("enable castling with dropped rooks/kings") defaults to `false` and crazyhouse keeps the default. `psqt.cpp`: piece values "saturate earlier in drop variants" (`v * 7000 / (7000 + v)`) and are halved because a capture changes the material twice. |
| lichess.org/variant/crazyhouse (fetched) | "A captured piece reverses color and goes to the capturing player's pocket." Drops go "on to an empty square". "Pawns may not be dropped on the players' 1st or 8th ranks." "Promoted but captured pawns are dropped as pawns." "Drops resulting in immediate checkmate are permitted." Otherwise the rules of standard chess. |
| Wikipedia "Crazyhouse" (fetched, wikitext) | Same rules, plus: "A pawn that is dropped on its 2nd rank may use its two-square initial advance; a pawn that is dropped on any other rank cannot." "Unlike in shogi, dropping a pawn on a file containing another pawn of the same color and dropping a pawn to deliver checkmate are both permissible." Drop notation `N@d5`. |
| FICS help file "crazyhouse" (fetched) | "Pieces that had been promoted revert to pawns when captured." Pawns "may not be dropped on the 1st or 8th rank". Drop notation `P@fr` with the piece letter from `PNBRQ`, so a pawn drop is written `P@e4`. |
| lichess forum "Crazyhouse castling bug" (fetched) and lila issue #1849 "crazyhouse: crazy castle" (closed) | "In crazyhouse, a player is not allowed to castle with a dropped piece"; lichess staff filed the report as issue #1849, since closed. The current scalachess code does not allow it (row 1). |
| talkchess thread 72124 "Crazyhouse castling rules" (fetched) | Some players argue that a rook dropped on its corner should be able to castle, but "the major servers that have implemented crazyhouse ... decided that castling rights aren't restored for dropped rooks". |
| lila PR #21647 "Show fifty-move rule in analysis UI" (still open) | Not evidence by itself; the scalachess code (`fiftyMoves = false`) is. |
| lichess forum "Value of Pieces in Crazyhouse", chess.com "Crazyhouse strategy" (search extracts) | Common human estimate "1-2-4": pawn 1, knight/bishop/rook 2, queen 4. Knights are rated a little higher, bishops a little lower. |

**Chosen rule set: lichess Crazyhouse (scalachess).** It is the reference implementation that most players know. The
sources agree on every drop rule. They differ only on details outside the drop rules, which are decided here:

- **Castling with a dropped rook:** not allowed (lichess, pychess, Fairy-Stockfish, the other major servers). Some
  players argue that a rook dropped on its corner should castle (talkchess), but no major implementation does it.
  The rule follows from the ordinary castling rights (a right is lost for good when the rook leaves its square or is
  captured, and a drop never creates one), and our engine already handles rights that way.
- **Check and checkmate:** Quantum Chess has no check. You win by **capturing the king**, as in every variant of this
  app. A crazyhouse "drop mate" becomes a king capture on the next move.
- **Draws:** lichess has no fifty-move rule and no insufficient-material draw. It does have threefold repetition and
  stalemate (only when no drop is possible). This app keeps its **generic** draw rules instead. They are: 50 moves by
  each side without a capture, a pawn move or a drop that really happened (`quietPlies` 100; a missed attempt does not
  count, 4.5), the move limit (`maxPly` 600), and no legal move. The variant core has no repetition rule. The quiet
  rule can only fire after 100 plies with no capture, pawn move or drop, which almost never happens in crazyhouse.
  It keeps pass & play games finite. There is never a material draw: all 32 pieces stay in the game.

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
- A captured **promoted** piece (`+q`, `+r`, `+b`, `+n`) goes into the capturer's hand as a **pawn** of the
  capturer's colour.
- A king never goes into a hand. Capturing it ends the game (2.7).
- En passant captures send the captured pawn to the hand like any capture.
- The total number of pieces is always 32: pieces only move between the board and the hands (a captured king leaves
  the board, and the game is then over).

### 2.5 Drops

- Instead of moving a piece, the side to move may **drop** one piece from its own hand onto **any empty square**.
- **Pawns may not be dropped on rank 1 or rank 8**, for either colour. This is the only drop restriction: knights,
  bishops, rooks and queens may be dropped on rank 1 and rank 8 too, and a bishop on a square of either colour.
- Unlike shogi, a pawn **may** be dropped on a file that already holds a pawn of the same colour (doubled pawns).
- A drop never captures. Any drop, a pawn drop included, may attack the enemy king ("drop mate" in orthodox
  crazyhouse).
- A dropped piece is an ordinary piece from then on:
  - a pawn dropped on its own second rank (rank 2 for White, rank 7 for Black) may make the **two-square step**,
    and may then be taken **en passant**; a pawn dropped on any other rank never double-steps;
  - a pawn dropped on rank 7 (White) or rank 2 (Black) can promote on its very next move (a step or a capture
    onto the last rank).
- A drop is a whole turn. A side that drops instead of taking en passant loses that en passant chance (Z11).
- Move code: `<type>@<square>` with the type id in lower case (`dropKey`): `p@e4`, `n@f3`, `b@c4`, `r@d1`, `q@h5`.
  The move list prints the piece letter in upper case for every type, pawns included: `N@f3`, `P@e4` (lichess UCI,
  FICS and Wikipedia notation).

### 2.6 Other special moves

- **Double step and en passant:** as in chess. The double step is allowed from rank 2 (White) or rank 7 (Black),
  whatever the pawn's history, so it also applies to dropped pawns; both squares ahead must be empty. En passant is
  possible only on the very next turn after the double step, by a pawn standing beside the arrival square, and lands
  on the skipped square. Uses `pawnExtras` (the ep square is cleared by every other move and by every drop, in
  `orthodoxAfterMove`, and in the quantum game also where the next move or drop missed, 4.4).
- **Castling:** as in chess (without the check conditions: Quantum Chess has no check). King e1→g1 with rook h1→f1
  (`O-O`), or king e1→c1 with rook a1→d1 (`O-O-O`). Black castles the same way on rank 8. Every square between the
  king and the rook must be empty (f1, g1 for `O-O`; b1, c1, d1 for `O-O-O`). A right is lost for good when the king
  or that rook moves, or the rook is captured on its square (`orthodoxAfterMove`). **A dropped rook never castles**,
  not even from a1/h1/a8/h8: that right was lost when the original rook left or was captured, and a drop never
  creates or restores a right (scalachess `Drop` keeps `unmovedRooks`; Fairy-Stockfish `castlingDroppedPiece = false`).
- **Promotion:** a pawn reaching the last rank must promote to a queen, rook, bishop or knight (codes `e7-e8=q`,
  `=r`, `=b`, `=n`). The new piece has the promoted type (`+q`, ...).

### 2.7 End of the game

- **Win:** capture the enemy king (lichess: checkmate). Resignation (the variant UI's Resign button).
- **Draw:** quiet rule (100 plies without a capture, a pawn move or a drop; in the quantum game only one that really
  happened counts, 4.5), move limit (600 plies), a side to move
  without any legal move (move, drop, split, merge or measure). The variant UI has no draw offer, so there is no draw
  by agreement. The end-of-game text for the quiet rule must mention drops (see `reasonText` in section 3).
- **Turn order:** White, Black, alternating.

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()` (`core/orthodoxVariant.js`): it supplies `sides`, `topology`, `board`, the six types,
`setup` and the two quantum hooks `applyMiss` and `unifyWorlds`. Extend the object it returns (`Object.assign`, as the
placeholder `src/variants/crazyhouse.js` already does): override the values, add the promoted types and the hooks
below, then call `defineVariant`. The sketch below refers to that declaration as `spec` and to its `board`.

| Field | Value |
|---|---|
| `id`, `category` | `'crazyhouse'`, `'rules'` |
| `sides` | `whiteBlack()` (0 = White, 1 = Black) |
| `teams`, `enemies` | none, default (`a !== b`) |
| `topology` | `standardBoard(8, 8).topology` (as `orthodoxSpec()`) |
| `types` | the `orthodoxSpec()` types (`orthodoxTypes({ lastRank })`) with the values below, plus `+q`, `+r`, `+b`, `+n` copied from `q`, `r`, `b`, `n` with their own `name` ("Promoted queen", ...) and `glyph: { sprite: <base>, promoted: true }` |
| royal | `k` |
| solid | `k`, `p` (the defaults). Promoted types are not solid. |
| splittable | `q`, `r`, `b`, `n`, `+q`, `+r`, `+b`, `+n` (the default `!solid`) |
| `drops` | `true` (shows both hands in the UI) |
| `setup` | `standardSetup(V, 'rnbqkbnr')` (castling KQkq, ep −1, empty hands) |
| `extraMoves` | `pawnExtras` (double steps from rank index 1 / 6, en passant), `castlingMoves`, and **drops** (below) |
| `onCapture` | victim to the capturer's hand (below) |
| `afterMove` | `orthodoxAfterMove` (ep square, castling rights), then turn a promotion into the promoted type |
| `applyMiss`, `unifyWorlds` | inherited from `orthodoxSpec()`; keep both, do not override or delete them. `applyMiss` (`clearEnPassant`) ends the en passant right in the possibilities where a move, drop, split or merge missed and on a Measure turn; `unifyWorlds` (`unifyCastling`) keeps a castling right only while every possibility has it (4.4, tests Q12, Q13) |
| `solidExtra` | the hand contents (a guard, see 4.1). The core reads this optional hook in `solidKey` and writes it into the solid-roll note (`'solid:' + solidExtra(b)`, `core/quantum.js`), although neither the hook table of `handoff/IMPLEMENTING.md` nor the header of `core/variant.js` lists it |
| `worldResult` | the default: a side without its king has lost (`reason: 'king'`) |
| `evaluate` | hand pieces at full value, and pieces near the enemy king (below) |
| `quietPlies`, `maxPly` | defaults (100, 600) |
| `resetsQuiet` | not set: the default (`p` resets the counter; the promoted types and the king do not). The core resets the counter for every drop that happens (4.5) |
| `reasonText` | `'quiet'` → "50 moves without a capture, a pawn move or a drop" (the generic text in `variantplay/texts.js` omits drops, which also reset the counter); `null` for every other reason |
| `handOrder` | `['p', 'n', 'b', 'r', 'q']` (the lichess pocket order; the hands panel sorts by it, section 6) |
| `options`, `visibility`, `budgetRule`, `passWhenStuck`, `compulsoryCapture`, `codeText`, `noteText`, `recordInfo` | none: the defaults (budget 8 per side, a side without a legal move draws with `noMoves`, the move list prints `P@e4` by itself) |

Drops keep `kind: 'drop'` and never set `certain: true`. A certain move is legal only when every possibility can play
it (core Q2), so a certain drop onto a square where a ghost might stand would be illegal instead of the probe of 4.2.

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
into `+q`. The castling-rights filter of `orthodoxAfterMove` also runs for drops (`m.from = -1`, `m.to` the drop
square). This is harmless: while a right exists, its king and rook stand on their squares in every possibility (4.4),
so no drop can land on either square.

`evaluate(w, side)` (tried in the prototype, where it gives plausible play: the computer drops for tactics instead of
at once):

- **+0.2 × value** for every piece in the own hand, and **−0.2 × value** for every piece in the enemy hand. `ai.js`
  counts hand pieces at 0.8, so this puts them at full value. Without it, the computer drops every piece at once for
  a free +20%.
- **+12** for every own non-king piece within king distance 2 of the enemy king, and **−12** for every enemy piece
  within distance 2 of the own king.

A known limit of `ai.js`: the normal level looks only at replies that might capture or end the game (`mightForce`),
and the hard level looks at every reply, but only one reply deep. A drop never captures and never ends the game, so
the normal level never considers the opponent's drops, and no level sees "drop now, take the king next move" coming
(the capture comes one ply after the reply). The proximity term works only once the piece is on the board. This is
acceptable for a first version.

Performance (prototype): 20 random games of 80 plies take 1.9 s in total, with at most 32 worlds. From a middlegame
position with a pawn in hand (70 legal moves), `chooseMove` takes 16 ms (easy), 103 ms (normal) and 232 ms (hard).
On the changed core (engine review 8.2): with a pawn in hand (60 legal moves) 6 / 34 / 74 ms (easy / normal / hard);
with a knight and a pawn in each hand (110 legal moves) 2 / 51 / 155 ms; the same with a ghost (2 possibilities, 95
legal moves) 4 / 103 / 322 ms. Random games cost about 2.4 ms per ply on average (up to 64 possibilities).

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
  confirmed this over 1569 random plies with 171 splits and 167 drops: no state had differing hands. The engine
  review (8.2) repeated it on the changed core over 29,123 plies (240 games, 2,985 drops, 6,400 splits, 3,111
  merges, 387 rolled captures, up to 64 possibilities). It also checked one occupant per square over all
  possibilities, one piece id per drop code, and the same type and side for every piece id in every possibility.
  There were no violations.
- The one-occupant rule also covers merges that capture ("converging captures", test Q7; a merge onto a square where
  another own piece might stand is illegal, `friendlyMaybe`), en passant (both pawns are solid, so the victim is the
  same piece everywhere), and a part that moves onto another part of the same piece (core Q14: both are the same
  piece id, so the square still holds only that piece).
- Every piece id also has **one type** in every possibility: promotion is certain (pawns are solid) and a captured
  piece changes type in every possibility of the capture. So the core's rule that parts with different types
  ("faces") cannot merge (core Q13) never refuses a crazyhouse merge.

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

  A drop is therefore a cheap **probe**, like a pawn push. The odds are those of the square being empty. As with
  any roll, the result also settles every piece **linked** to that ghost (test Q10). There are never more than these
  two results, and a drop never needs a solid roll or a game-end roll afterwards: it moves no piece that is already
  on the board, and it never captures. The possibilities of a **Missed** drop are idle worlds of the core: they pass
  through `applyMiss`, so an open en passant right ends there too (test Q13).
- The same holds for a drop onto a ghost part of the **same type** (a knight dropped where the own knight ghost might
  stand): it is rolled, and the dropped knight never joins the ghost. It is another piece; the core's "a part joins
  another part of the same piece" (core Q14) is for moves of that piece only (test Q15).
- **Onto a square where a solid piece stands:** a solid piece is on the same square in every possibility, so the
  square is taken everywhere and the drop is not legal. Only ghosts make a drop uncertain.
- A drop is never "pass = link" (it has no path), and never falls back to a budget roll. A full budget never blocks
  a drop, and a drop never raises it (test Q8, and 4.5).
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

These are the rules of classic Quantum Chess (`docs/rules.md` sections 4 and 5), which the variant core applies to
every orthodox variant (decisions D1 and D2 of `handoff/CORE-CHANGES.md`). Crazyhouse gets them from `orthodoxSpec()`
and adds nothing of its own:

- **Castling is certain.** `O-O` / `O-O-O` is legal only when it is possible in **every** possibility: the king and
  that rook on their start squares and every square between them empty (core Q2, `isCertain`). It is never rolled and
  never links. A ghost part, own or enemy, or a dropped piece on one of those squares in any possibility makes it
  illegal; once every possibility is clear it is certain again (test Q11).
- **Rights follow the whole state.** A right is lost in every possibility as soon as the king or that rook is not
  100% on its start square: a rook slide that happened only in some possibilities, a split, a capture on its square
  (`unifyWorlds` = `unifyCastling`, core Q3 and W5). Moving back, merging back or a Missed drop that finds the rook
  in its corner never restores it (test Q12). A king or rook move that **missed** keeps the right, because the piece
  never left (`afterMove` runs only where the move is played).
- **En passant is certain** and possible only on the ply right after the double step (core Q2). The right also ends
  in the possibilities where that ply's move missed, a Missed drop included, and on a Measure turn (`applyMiss` =
  `clearEnPassant`, core Q1 and W4; test Q13). Both pawns are solid, so in crazyhouse it is possible in every
  possibility or in none.
- **Promotion** is a pawn move, so it is settled at once (pawns are solid): it happens in every remaining possibility
  or in none, and the new piece has one type everywhere.

A rook dropped in the corner never castles (2.6). This also holds in the quantum game. A right exists only while the
original rook stands on its square in every possibility, so a drop onto that square is then illegal everywhere; once
the right is gone, no drop brings it back (Z6, Q12).

### 4.5 Budget, game end, counters

- **Budget:** 8 per side, counted as usual (`budget`, and `budgetInfo` with the default rule). The core counts hand
  pieces in the arrangement (as square −2), but hands are identical in every possibility, so they never add to it.
  Drops and captures never raise it: after the roll, a drop or capture has happened in every remaining possibility or
  in none, and it changes every possibility in the same way. A full budget never blocks a drop. Splitting a dropped
  piece raises it as usual.
- **Game end:** capture the king. A king is solid, so a king capture is certain or rolled (*Captured*/*Missed*), and
  the game-end roll never has more to do than in classic Quantum Chess. In fact no crazyhouse move ever needs a solid
  roll or a game-end roll: every outcome changes all of its possibilities in the same way (the same mover, the same
  victim, the same dropped piece, by 4.1), and a move that links captures nothing. The engine-review fuzz saw no
  follow-up roll in 29,123 plies (F1).
- **Quiet counter:** only a move that really happened resets it: a capture, a pawn move or a drop in some
  possibility of the chosen outcome (core Q8; `docs/rules.md` section 6: "Missed attempts and failed captures do not
  reset the count"). A drop that **misses** adds 1, just as a missed pawn move does (test Q9). Moves of the king and
  of the other pieces, splits, merges and measures add 1 too.
- **King danger:** counts only moves that capture now, converging captures included (`royalDanger`, core Q7). A drop
  cannot capture, so an enemy piece in hand does not add to it, even when a drop would threaten the king (test Q14).
  The variant UI shows the number in the side panel ("Your king is in danger: …"). It has no confirmation dialog for
  king safety (only rolled moves ask for confirmation), so the player must read the hands.

---

## 5. Player-facing rules text (rules card)

1. When you capture a piece, it changes colour and goes into your hand.
2. Instead of moving, you may drop a piece from your hand onto any empty square. Pawns may not be dropped on rank 1 or
   rank 8.
3. A pawn dropped on your own second rank may still move two squares.
4. When a promoted piece (marked with a small +) is captured, the capturer gets a pawn.
5. A dropped rook can never castle, not even from its corner.
6. Dropping onto a square where a ghost might stand is a roll: either your piece lands, or the ghost is found there
   and your piece stays in your hand (your turn is still used).
7. You always know exactly what is in both hands.
8. Capture the enemy king to win.

---

## 6. UI layout

- **Board:** the standard 8 × 8 `rectTopology` with file and rank labels, light/dark shades, White at the bottom (as
  `orthodoxSpec()`).
- **Hands:** the existing hands panel of `VariantGameView.vue` (shown because `drops: true`): "In hand: White" and
  "In hand: Black", each hand piece a button with the cburnett sprite of the owner's colour and the count next to it.
  A side with an empty hand gets no row (the panel filters them out). Only the side to move can click its hand (the
  other buttons are disabled). All of this exists already.
  - Order P, N, B, R, Q (the lichess pocket order, `pieceRoles` in lila `ui/round/src/crazy/crazyCtrl.ts`).
    `handView` returns the types sorted by id (`b`, `n`, `p`, `q`, `r`). **U1, built** (`handoff/CORE-CHANGES.md`
    U16): the optional variant field `handOrder`, which the `hands` computed of `VariantGameView.vue` applies through
    `sortHand` (`src/variantplay/panel.js`; types missing from the list go last, by id). The variant declares
    `handOrder: ['p', 'n', 'b', 'r', 'q']` (section 3).
  - Choosing a hand piece marks every square where the drop is legal as a target (the existing `marks` with
    `dropType`). Pawn drops never mark rank 1 or 8, because those codes are never generated. The variant UI has no
    per-square preview badge. A drop onto a certainly empty square is played at once. A drop where a ghost might stand
    has two outcomes, so the existing box "This move is settled by a roll" shows both odds and asks for confirmation
    (`attempt` → `pending`).
- **Outcome wording for drops:** show **"Dropped"** instead of "Moved", and **"Missed: the square was taken"**
  instead of "Missed". **U2, built** (`handoff/CORE-CHANGES.md` U7): `outcomeText(key, code)` in
  `src/variantplay/texts.js`; when the code is a drop (it contains `@`), `move` → "Dropped" and `miss` → "Missed: the
  square was taken". Its callers in `VariantGameView.vue` pass the code (the pending box, the roll box, the hand-over
  box and the move list). This is generic: shogi and bughouse drops read the same way (test Z14).
- **Move list:** write drops with an upper-case piece letter, pawns included: `N@f3`, `P@e4`. **U3, built**
  (`handoff/CORE-CHANGES.md` U17): `historyRows` and the hand-over box show the code through `codeText(V, code)`
  (`src/variantplay/texts.js`), which upper-cases a one-letter type before `@` (`p@e4` → `P@e4`) unless the variant
  has its own `codeText(code)` hook. Crazyhouse needs no hook. Move codes, the stored record and the tests keep the
  lower-case keys (test Z14).
- **Promoted pieces:** use the cburnett sprite of the base type (`glyph: { sprite: 'q', promoted: true }`), plus a
  small marker. **U4, built** (`handoff/CORE-CHANGES.md` U13):
  - `glyphOf` passes `promoted: true` through for sprites (test Z14);
  - `VariantPiece.vue` draws the marker: a red disc (`#b71c1c`, r = 0.11 × size) with a white "+", in the
    **top-right** corner of the piece (centre at (+0.33, −0.33) × size, so from y = −0.44 to −0.22 × size). The
    probability badge sits bottom-right (it is drawn at (+0.2, +0.3) × size, from y = +0.17 to +0.43 × size), so the
    two never overlap.

  Rule 4 of section 5 ("marked with a small +") therefore holds as soon as the promoted types declare
  `promoted: true`. Hand pieces are never promoted types (a captured promoted piece becomes a pawn), so the hands
  panel needs no marker.

  Type names: "Promoted queen", "Promoted rook", "Promoted bishop", "Promoted knight" (screen readers and tooltips).
- **Layout API:** nothing beyond `rectTopology`. No `layoutOf`, no extra `boards` or `areas`. The hands are drawn
  by the side panel, not by the board layout.

---

## 7. Test cases

Notation: placements as in `worldFrom` (`{ e1: '0:k' }`, side 0 = White, 1 = Black). "Hand" lists `[side, type]`,
which in the Vitest helper means `addPiece(b, type, side, HAND)` in `edit`. `x = { ep: -1, epVictim: -1, castle: [] }`
unless stated otherwise (the helper's `stateOf` skips this default when an `edit` is given, so that `edit` must set
`b.x` itself). Two worlds written "A / B" have equal weight unless stated otherwise. `worldFrom` numbers the pieces in
placement order and adds hand pieces after the board pieces. So in a position with several worlds, list the pieces
in the **same order in every world**: the same piece must get the same id everywhere. "With White to move" on a state
where Black is to move means `{ ...state, turn: 0 }` (`ownPieceAt`, `splitsFrom` and the move list work for the side
to move). Outcomes are listed in the core's order (`miss`, `move`, `capture`). Outcome index 0 of the Vitest `play`
helper is the first one listed. "One outcome, `move` p = 1" means `outcomes` returns exactly
`[{ key: 'move', p: 1, rolled: false, notes: [] }]` (plus `captures`). All results below were produced by the
prototype and re-checked in the source review (8.1). The engine review (8.2) ran every row through the real Vitest
helpers on the core as changed by `handoff/CORE-CHANGES.md`, and all of them pass; Q9 and Q11 were rewritten for that
core (decisions D1 and core Q8), and Z14, Q12–Q15 were added.

| # | Position and moves | Expected |
|---|---|---|
| Z1 | Start position. `e2-e4`, `d7-d5`, `e4-d5`, `d8-d5`. | White's hand holds 1 pawn, and so does Black's (`handView` → `[{ type: 'p', min: 1, max: 1, expected: 1 }]` each). `quiet` = 0. White has 33 drop codes (the 33 empty squares on ranks 2–7; d8 is the only empty square on rank 1 or 8). `p@e2` and `p@e3` are legal, and so is `p@d3` (doubled with the d2 pawn: no shogi-style restriction). `p@d8` is **illegal** (empty, but rank 8). `p@e1`, `p@e8` and `p@e7` (occupied) are not legal either. Black (same position, Black to move) also has 33 drop codes and no `p@d8`. |
| Z2 | White Ke1, Black Ke8, White hand `[0,'n']`, `quiet` = 7. `n@f3`. | One outcome, `move` p = 1 (certain). The knight is 100% on f3 and White's hand is empty. `quiet` = 0. |
| Z3 | White Ke1, Black Ke8, hands `[0,'p']` and `[1,'p']`, White to move. | `p@a1` and `p@h8` are illegal. `p@a2` and `p@h7` are legal. There are exactly 48 pawn-drop codes (ranks 2–7, 48 empty squares). The same holds for Black (same position, Black to move): `p@a1` and `p@a8` are illegal, `p@a2` is legal, 48 codes. |
| Z4 | White Ke1, Black Ke8, pe4, pa7, White hand `[0,'p']`. `p@d2`, `a7-a6`, `d2-d4`, `e4-d3`. | `d2-d4` is legal and certain. After it, the ep square is d3 and `e4-d3` (en passant) is legal. After `e4-d3`: black pawn on d3, White's d4 pawn gone, Black's hand holds 1 pawn. |
| Z5 | White Ka1, Pe7, Black Kh8, Ra8. `e7-e8=q` (the choices are `=q`, `=r`, `=b`, `=n`), then `a8-e8`. | After the promotion, the piece on e8 has type `+q` and moves like a queen (21 moves from e8 with White to move, including the captures on a8 and h8). After `a8-e8` (certain capture), Black's hand holds a **pawn**, not a queen. |
| Z6 | White Ke1, Rh1, Black Ke8, pa7, White hand `[0,'r']`, `x.castle = [{flag:'K', side:0, king:e1, rook:h1, kingTo:g1, rookTo:f1}]`. `h1-h5`, `a7-a6`, `r@h1`, `a6-a5`. | `O-O` is legal at the start. After the sequence, the dropped rook stands on h1 and the king on e1, but `O-O` is **not** legal (the right was lost when the rook left h1). |
| Z7 | White Ka1, Pd7, Black Kh8, Ra5, Bh1. `d7-d8=q`, `h8-h7`, `d8-d5\|d2` (the promoted queen splits), then Black `a5-d5`. | The split gives 50% d5 / 50% d2. `a5-d5` is rolled: `move` 50% / `capture` 50%. In the move branch the rook stands on d5, the queen is 100% on d2 and Black's hand is empty. In the capture branch the rook stands on d5, the queen is gone from every possibility, and Black's hand holds 1 **pawn** (certain). |
| Z8 | White Ka1, Black Kh8, pa6, White hand `[0,'p']`. `p@c7`, `a6-a5`. | White can now play `c7-c8=q`, `=r`, `=b` or `=n`. |
| Z9 | White Ke1, Rh1 (right K as in Z6), Black Ke8, Black hand `[1,'n']`, Black to move. `n@f1`. | Certain drop (a knight may be dropped on rank 1; only pawns are barred from it). White's `O-O` is not legal while f1 is occupied. `e1-f1` captures the knight with certainty, and White's hand then holds a knight. |
| Z10 | White Ka1, Black Kh8, pg7, ph7, White hand `[0,'n']`. `n@f7`, `g7-g6`, `f7-h8`. | `f7-h8` is a certain capture of the king. The result is `{ winner: 0, reason: 'king' }`. |
| Z11 (en passant expires) | White Ke1, Pd2, Black Ke8, pe4, Black hand `[1,'n']`. `d2-d4`, `n@a6`, `e1-f1`. | Right after `d2-d4`, `e4-d3` is legal. After Black's drop `n@a6` and White's `e1-f1`, `e4-d3` is **not** legal (the ep square is −1). |
| Z12 (drop ranks for pieces, no double step off rank 2) | White Ke1, Black Ke8, White hand `[0,'n']`, `[0,'r']`, `[0,'p']`. Then separately: White hand `[0,'p']` only, `p@d3`, `e8-d8`. | `n@a8` and `r@a1` are legal, `p@a8` is not; there are 62 `n@` codes (every empty square). After `p@d3`, `e8-d8`: `d3-d4` is legal and `d3-d5` is not. |
| Z13 (quiet text) | — | `resultText(V, { winner: null, reason: 'quiet' })` (`src/variantplay/texts.js`) is "Draw (50 moves without a capture, a pawn move or a drop)": the variant's `reasonText` wins over the generic text. |
| Z14 (UI texts and hooks) | — | `outcomeText('move', 'p@d4')` = "Dropped", `outcomeText('miss', 'n@f3')` = "Missed: the square was taken", `outcomeText('move', 'e2-e4')` = "Moved". `codeText(V, 'p@e4')` = "P@e4" and `codeText(V, 'e7-e8=q')` = "e7-e8=q" (`src/variantplay/texts.js`). `glyphOf(V, '+q', 0)` = `{ kind: 'sprite', symbol: 'qc-piece-cburnett-wQ', tint: null, promoted: true }` and `glyphOf(V, 'q', 1)` has no `promoted` (`src/variantplay/glyphs.js`). `sortHand(V, [q, r, b, n, p])` gives the order `p`, `n`, `b`, `r`, `q` (`src/variantplay/panel.js`). |
| Q1 (quantum: drop probe) | A: White Ke1, Black Ke8, nd4 / B: White Ke1, Black Ke8, nf4. Both: White hand `[0,'p']`. `p@d4`. | Two rolled outcomes: `miss` 50%, `move` 50%. **Miss:** the knight is 100% on d4 and the pawn is still in White's hand. **Move:** a white pawn stands on d4 and the knight is 100% on f4. |
| Q2 (quantum: capturing a ghost) | A: White Ke1, Bb5, Black Ke8, nc6 / B: White Ke1, Bb5, Black Ke8, na6. `b5-c6`. | Rolled: `move` 50%, `capture` 50%. **Move:** the bishop is on c6, the knight is 100% on a6, and both hands are empty. **Capture:** the bishop is on c6 and White's hand holds a knight (certain, `min = max = 1`). |
| Q3 (quantum: drop onto an own ghost) | A: White Ke1, Nc3, Black Ke8 / B: White Ke1, Ne5, Black Ke8. Both: White hand `[0,'b']`. `b@e5`. | Rolled: `miss` 50% (the knight is 100% on e5 and the bishop stays in hand) / `move` 50% (the bishop is 100% on e5 and the knight is 100% on c3). |
| Q4 (quantum: a dropped piece is one piece) | White Ke1, Ng1, White hand `[0,'n']`, Black Ke8. `g1-f3\|h3`, `e8-d8`, `n@c3`. | The split takes White's budget to 2. `n@c3` has one outcome, `move` p = 1, not rolled (the drop does not care where the ghost is). Afterwards the budget is still 2. With White to move, `ownPieceAt(c3)` is the dropped knight's id (the same id in both possibilities), and `splitsFrom(c3)` is not empty. |
| Q5 (drop odds) | A (weight 3): White Ke1, Black Ke8, nd4 / B (weight 1): White Ke1, Black Ke8, nf5. White hand `[0,'p']`. `p@d4`. | `miss` 75%, `move` 25%. |
| Q6 (quantum: capture a ghost, then drop it) | Four worlds of equal weight, pieces in this order: White Ke1, Bb5, a knight N, Black Ke8, a knight n. A: Nf3, nc6 / B: Nh3, nc6 / C: Nf3, na6 / D: Nh3, na6. `b5-c6` (take outcome `capture`), `e8-f8`, `n@d4`. | `b5-c6`: `move` 50%, `capture` 50%, both rolled. After the capture: 2 possibilities (Nf3 / Nh3). White's hand is `[{ type: 'n', min: 1, max: 1, expected: 1 }]`, the hand knight has the **same id** in both, and White's budget is 2. `n@d4`: one outcome, `move` p = 1, not rolled. Afterwards, with White to move, `ownPieceAt(d4)` is that id, the budget is still 2 and White's hand is empty. |
| Q7 (quantum: a converging capture goes to the hand) | White Ka1, Ne3, Black Kh8, ne5. `e3-c4\|g4`, `h8-h7`, `c4\|g4-e5`. | The merge has one outcome, `capture` p = 1, not rolled (both parts reach e5 and the knight is certainly there). Afterwards: 1 possibility, the white knight on e5, White's hand `[{ type: 'n', min: 1, max: 1, expected: 1 }]`. |
| Q8 (quantum: a drop at full budget) | White Ke1, Nb1, Bc1, Ng1, Black Ke8, White hand `[0,'p']`. `b1-a3\|c3`, `e8-d8`, `g1-f3\|h3`, `d8-e8`, `c1-d2\|e3`, `e8-d8`. | White's budget is 8 (8 possibilities) and no split is legal. `p@d4`: one outcome, `move` p = 1, not rolled; afterwards the budget is still 8. `p@c3` (a knight is 50% on c3): `miss` 50%, `move` 50%. In the `move` outcome the knight is 100% on a3 and White's budget is 4. |
| Q9 (quantum: only a drop that happened resets the quiet counter) | Q1's position with `quiet` = 7. `p@d4`, and separately `e1-e2`. | `p@d4` outcome `miss`: `quiet` = 8 (the drop did not happen). Outcome `move`: `quiet` = 0. `e1-e2` (a king move) gives `quiet` = 8. |
| Q10 (quantum: a drop settles a linked piece) | A: White Ke1, Rd1, Black Kh7, nd4 / B: White Ke1, Rd1, Black Kh7, nf4. White hand `[0,'p']`. `d1-d8`, `h7-h6`, `p@d4`. | `d1-d8` has one outcome, `move` p = 1, not rolled (pass = link): the rook is 50% on d1 (blocked where the knight is on d4) and 50% on d8. `p@d4`: `miss` 50%, `move` 50%. **Miss:** the knight is 100% on d4, the rook 100% on d1 and the pawn still in White's hand. **Move:** a white pawn on d4, the knight 100% on f4 and the rook 100% on d8. |
| Q11 (quantum: castling past a possible ghost) | A: White Ke1, Rh1, Black Ke8, ng1 / B: White Ke1, Rh1, Black Ke8, nc3. Castling right K (as in Z6), White to move. `O-O`; then, with Black to move, `g1-e2`, then White `O-O`. | The first `O-O` is **illegal**: not in `legalMoves`, `branches` is null (g1 might be taken). `g1-e2` has one outcome, `move` p = 1 (pass = link: in B there is no knight on g1): the knight is 50% e2 / 50% c3. Now f1 and g1 are empty in every possibility, and `O-O` has one outcome, `move` p = 1, not rolled. Afterwards: the king on g1 and the rook on f1 in both possibilities, and no rights are left. |
| Q12 (quantum: a partial slide loses the right; a corner drop never restores it) | A: White Ke1, Rh1, Black Ke8, nh3 / B: White Ke1, Rh1, Black Ke8, na6. White hand `[0,'r']`, right K. `h1-h5`, `e8-d8`, `r@h1`. | At the start `O-O` has one outcome, `move` p = 1. `h1-h5` has one outcome, `move` p = 1 (pass = link: in A the knight on h3 blocks, the rook stays on h1); afterwards the rook is 50% h1 / 50% h5 and **both** possibilities have `x.castle = []`. `r@h1`: `miss` 50%, `move` 50%. **Miss:** one possibility, the original rook 100% on h1, the knight 100% on h3, the rook still in White's hand, and `O-O` is not legal (the right is gone). **Move:** the dropped rook on h1, the original rook 100% on h5, White's hand empty, and `O-O` is not legal. |
| Q13 (quantum: en passant ends after a missed drop) | Four possibilities of equal weight, pieces in this order: White Ke1, Pd2, a bishop B, a knight N, Black Ke8, pe4; B on a6 or c8, N on f1 or h3 (all four combinations). Black hand `[1,'p']`. `d2-d4`, `p@a6`, `e1-f1`. | After `d2-d4`, `e4-d3` has one outcome, `capture` p = 1. `p@a6`: `miss` 50%, `move` 50%; take `miss`: 2 possibilities (B on a6), `x.ep` and `x.epVictim` are −1 in both, and Black's hand still holds the pawn. `e1-f1`: `miss` 50% (own knight on f1), `move` 50%; take `miss`: 1 possibility. Now `e4-d3` is **not** legal. (Without `applyMiss` it would be a certain capture: neither of the last two moves happened in that possibility.) |
| Q14 (quantum: king danger ignores the hands) | White Ke1, Black Ke8, Black hand `[1,'q']`, Black to move. `q@e2`. | Before the drop, `royalDanger(V, s, 0)` = 0 (a queen in hand cannot capture). After `q@e2`, `royalDanger(V, s, 0)` = 1. |
| Q15 (quantum: a drop onto the same type's ghost is rolled, not joined) | A: White Ke1, Nc3, Black Ke8 / B: White Ke1, Ne4, Black Ke8. White hand `[0,'n']` (id 3). `n@e4`, and separately `c3-e4`. | `n@e4`: `miss` 50%, `move` 50%, both rolled. **Move:** 1 possibility, the board knight (id 1) on c3 and the dropped knight (id 3) on e4, White's hand empty. **Miss:** 1 possibility, the board knight on e4, the knight still in hand. `c3-e4` (the board knight onto its own other part): one outcome, `move` p = 1, and 1 possibility afterwards (core Q14). |
| F1 (fuzz invariant) | Random games (the fuzz spec). | After every move: every world has the same set of hand pieces (id, side, type). Over all worlds, every square holds at most one piece id. Every drop code uses the same piece id in every world where it is generated. Every piece id has the same type and side in every world where it is on the board or in a hand. No hand holds a king or a promoted type. The budget is ≤ 8 for both sides (`budget` and `budgetInfo(V, s, side).used <= .limit`). No world has a pawn on rank 1 or 8. The piece count on the board plus in the hands plus the kings off the board is always 32. A drop has at most two outcomes (`miss`, `move`), both rolled when there are two. **No move of any kind ever has a follow-up roll** (no outcome carries a `solid:` or `end:` note, 4.5). `x.castle`, `x.ep` and `x.epVictim` are identical in every world. Castling and en passant always have exactly one unrolled outcome. After every move of a game that goes on, `quiet` is 0 when the chosen outcome captured or some world of it played a drop or a pawn move, and the previous value + 1 otherwise; in particular a Missed drop adds 1. |

---

## 8. Review notes

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity. The web pages the original research could not open were fetched, and the
reference code in `handoff/ext/` was read. Every classical rule of section 2 matches the sources: board, square names
and colours, the full setup, the movement of all six pieces, double step, en passant, castling squares, promotion
choices, capture to the capturer's hand with colour change, promoted pieces returning as pawns, drops on any empty
square, the rank 1 and 8 pawn-drop ban for both colours, the double step of pawns dropped on the second rank, and no
castling with a dropped rook.

All test cases of section 7 (Z1–Z12, Q1–Q5) were run on the real `src/variants/core` with a copy of the variant that
follows the section 3 sketch exactly (`handoff/tmp/zh-review1/zh.mjs`, `t.mjs`, `t2.mjs`; git-ignored scratch). They
all give the stated results. A fuzz run of 30 random games (2528 plies, 267 drops, 267 splits, 18 promotions) kept
the F1 invariants: identical hands in every world, budget ≤ 8, no pawn on rank 1 or 8, 32 pieces. Note: the original
prototype in `handoff/prototypes/zh/` imports from `/home/user/Quantum_Chess/...` (it does not run on this machine
unchanged), and its `zh.mjs` `afterMove` gives a dropped piece a fresh id, which the spec sketch does not do. The
sketch (same id, as in 4.2 and Q4) is the version that was verified.

Changes:

1. **Section 1, sources table.** Corrected the scalachess path (there is no `handoff/ext/zh/`; the clone is
   `handoff/ext/scalachess/`), added what `MoveOrDrop.scala` shows (a drop keeps `unmovedRooks`, so it never creates
   a castling right) and the pocket order. Replaced the "search extract" rows by what the fetched pages say, and
   added FICS and Fairy-Stockfish `castlingDroppedPiece` as sources. Marked lila PR #21647 as still open (the code,
   not the PR, is the evidence). Sources: https://lichess.org/variant/crazyhouse,
   https://en.wikipedia.org/wiki/Crazyhouse, https://www.freechess.org/Help/HelpFiles/crazyhouse.html,
   https://github.com/lichess-org/lila/pull/21647, https://github.com/lichess-org/lila/issues/1849,
   `handoff/ext/scalachess/core/src/main/scala/MoveOrDrop.scala`, `handoff/ext/Fairy-Stockfish/src/variants.ini`
   (line "castlingDroppedPiece ... (default: false)").
2. **Section 1, castling with a dropped rook.** "Some older club rule sets let a rook dropped on its corner castle"
   could not be confirmed by any source. The only dissent found is a players' debate; every implementation forbids
   it. Reworded. Sources: https://talkchess.com/forum3/viewtopic.php?t=72124,
   https://lichess.org/forum/lichess-feedback/crazyhouse-castling-bug,
   https://github.com/gbtami/pychess-variants/blob/master/static/docs/crazyhouse.md.
3. **2.4.** A captured promoted piece becomes a pawn *of the capturer's colour in the capturer's hand* (the text said
   only "the hand"). The 32-piece count now mentions the captured king. Source:
   https://en.wikipedia.org/wiki/Crazyhouse ("it enters the opponent's reserve as a pawn").
4. **2.5.** Made explicit what "any empty square" implies and the sources state: pieces other than pawns may be
   dropped on rank 1 and 8; doubled-pawn drops and pawn-drop mates are allowed (unlike shogi, which this app also
   has, so the difference must be stated); a pawn dropped off its second rank never double-steps; a pawn dropped on
   the seventh rank can promote on the next move by a step *or a capture*; a drop ends an open en passant chance.
   Sources: https://en.wikipedia.org/wiki/Crazyhouse ("Unlike in shogi, dropping a pawn on a file containing another
   pawn of the same color and dropping a pawn to deliver checkmate are both permissible"; "a pawn that is dropped on
   any other rank cannot"), https://lichess.org/variant/crazyhouse.
5. **2.5 and 6, notation.** Drops are printed with an upper-case letter for every type, pawns included (`P@e4`), as
   in lichess UCI (`Uci.Drop`, used by `Dumper` for drop SAN) and the FICS `P@fr` notation. The old text gave only
   `N@f3`, leaving pawn drops open. Sources: https://www.freechess.org/Help/HelpFiles/crazyhouse.html,
   `handoff/ext/scalachess/core/src/main/scala/format/pgn/Dumper.scala`.
6. **2.6.** Spelled out the en passant conditions (next turn only, capturing pawn beside the arrival square, lands on
   the skipped square) and the exact squares that must be empty for each castling. "A rook dropped on a1/h1/a8/h8
   never castles" became "a dropped rook never castles", with the code evidence. Sources: FIDE Laws of Chess (from
   1 January 2023) art. 3.7.2 (double step), 3.7.3 (en passant) and 3.8.2 (castling)
   (https://handbook.fide.com/chapter/E012023), scalachess `MoveOrDrop.scala`, Fairy-Stockfish `variants.ini`.
7. **2.7.** "Also agreement, which the UI provides" was wrong: the variant UI (`VariantGameView.vue`,
   `useVariantGame.js`) has a Resign button and no draw offer. Removed the claim.
8. **Section 3, `reasonText`.** The generic end text for the quiet rule reads "50 moves without a capture or a pawn
   move" (`src/variantplay/texts.js`), but in this variant drops also reset the counter (`stateAfter` in
   `core/quantum.js`). Added a `reasonText` override so the player-facing text is right.
9. **Section 5, rules card.** Item 2 now names rank 1 and rank 8 (the same two ranks for both colours). Item 4 said
   a promoted piece "goes back into the hand", which reads as the owner's hand; it now says the capturer gets a pawn.
   Item 5 said "a rook that was dropped in its corner cannot castle"; a dropped rook can never castle, so it now says
   that. Sources: https://lichess.org/variant/crazyhouse, https://en.wikipedia.org/wiki/Crazyhouse.
10. **Section 6, hands panel.** Confirmed the P, N, B, R, Q order (lila `pieceRoles`,
    https://github.com/lichess-org/lila/blob/master/ui/round/src/crazy/crazyCtrl.ts) and noted that `handView` sorts
    types by id, so the panel must reorder them.
11. **Section 7.** Z1 only tested the pawn-drop ban on occupied squares; added `p@d8` (empty, rank 8: illegal),
    `p@d3` (doubled pawn: legal), the exact `handView` value (it has an `expected` field), and the Black count.
    Z3 now says Black's check is the same position with Black to move. Z5 gives the queen's 21 moves, Z7 the move
    branch, Z9 that a knight may be dropped on rank 1 and lands in White's hand after the capture. Added Z11 (en
    passant expires after a drop) and Z12 (non-pawn drops on ranks 1 and 8, no double step from rank 3). Noted that
    the Vitest helper `stateOf` skips its default `x` when an `edit` is given.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency. The review ran in two passes. The **first pass** read the spec
against the core before the packages of `handoff/CORE-CHANGES.md` existed (its changes are summarised in 8.2.4). The
**second pass** read it again against the core as changed in the working tree (`src/variants/core/quantum.js`,
`world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`: items Q1–Q14 and W1–W7 as built), the
built UI items of that plan (`src/variantplay/texts.js`, `glyphs.js`, `panel.js`, `components/VariantPiece.vue`,
`src/views/VariantGameView.vue`), `handoff/CORE-CHANGES.md` itself, `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md` and `docs/rules.md`. Where the two passes disagree, the second pass wins: the core changed under
the spec (decisions D1 and D2 and item Q8 of the plan changed castling, en passant and the quiet counter).

#### 8.2.1 What was run (second pass)

Git-ignored scratch in `handoff/tmp/critic-crazyhouse/`:

- `zh.js`: the variant written from section 3 alone (`Object.assign` on `orthodoxSpec()`, values, promoted types,
  drops, `onCapture`, `afterMove`, `solidExtra`, `reasonText`, `handOrder`, `evaluate`).
- `zh.spec.js`: every row of section 7 through the real helpers `stateOf` / `play`
  (`npx vitest run --config handoff/tmp/critic-crazyhouse/vitest.config.mjs`): 31 tests, all pass. On the changed
  core the first pass's Q9 and Q11 failed as expected (quiet 8 instead of 0; `O-O` illegal instead of rolled); both
  rows were rewritten. The core's own suites (`core.spec.js`, `core-quantum.spec.js`, `core-world.spec.js`, 89 tests)
  pass on the same tree.
- `negative.mjs`: the new rows really pin the hooks. Without `applyMiss`, Q13 ends with a certain `e4-d3` capture
  instead of an illegal move; without `unifyWorlds`, Q12 ends with a certain `O-O` instead of an illegal one.
- `fuzz.mjs`: 24 parallel workers, 240 random games of up to 150 plies, biased towards drops and quantum moves:
  29,123 plies, 2,985 drops (156 rolled, 73 missed), 6,400 splits, 3,111 merges, 1,429 measures, 175 promotions,
  387 rolled captures, 18 castlings, 1 en passant, up to 64 possibilities. Every F1 invariant held, including the new
  ones (identical `x.castle` / `x.ep` / `x.epVictim`, certain moves unrolled, exact quiet counter, `budgetInfo`), and
  no move had a follow-up roll. Random play castles and takes en passant rarely; Z4, Z6, Z9, Z11 and Q11–Q13 pin
  those rules.
- `ai2.mjs`, `guardcost.mjs`: `chooseMove` timings (section 3), and the cost of the `solidExtra` guard: 150 ms
  against 148 ms without it for a hard-level search with 91 legal moves.

Verdict: the engine mapping is implementable with the hooks as built, and no core change is needed. Every quantum
interaction of section 4 is decided and matches the core and `docs/rules.md`: land = roll for drops (never a link,
never a budget fallback), the solid roll and the game-end roll (never triggered in crazyhouse, 4.5), the budget, the
64-possibility bound, certain castling and en passant, castling rights over the whole state, and the quiet counter.

#### 8.2.2 Changes (second pass)

1. **Section 1, 2.6, 2.7: the draw rule and en passant.** The quiet rule now counts only a capture, pawn move or drop
   that really happened (core Q8, `docs/rules.md` section 6), and the en passant right also ends where the next move
   or drop missed (core Q1 and W4). Why: both changed in the core, and 2.7 is what the draw text rests on.
2. **Section 3, `applyMiss` and `unifyWorlds`.** New row: both hooks come from `orthodoxSpec()` and must be kept; the
   intro now says to extend the returned object with `Object.assign`, as the placeholder module does. Why: the spec's
   hooks table did not mention them, and an implementer who overrides or drops them silently breaks D1 and D2
   (`negative.mjs`).
3. **Section 3, new fields.** `handOrder` is now a field of the variant (the built panel sorts by it, but only if the
   variant declares it). `resetsQuiet`, `budgetRule`, `passWhenStuck`, `compulsoryCapture`, `codeText`, `noteText`
   and `recordInfo` are listed as "defaults, not used", with what the defaults mean here. Drops must not set
   `certain: true`: a certain move is legal only when every possibility can play it (core Q2), which would turn the
   drop probe of 4.2 into an illegal move.
4. **Section 3, `solidExtra`.** The core now also writes the hook into the solid-roll note (core Q4), and the header
   of `core/variant.js` does not list it either. Why it stays: it costs about 2% of a hard-level search and would
   settle an uncertain hand if a future rule ever broke 4.1.
5. **Section 3, computer player.** The normal level answers with `mightForce` replies (captures and game-ending
   moves, core U14), not only captures; the hard level answers with every reply. The conclusion stands: drops are
   neither, so no level sees a drop-then-capture threat. The timings were measured again on the changed core.
6. **4.1.** New fuzz numbers. Added why the one-occupant rule still holds with the new core: a merge onto a square
   where another own piece might stand is illegal (`friendlyMaybe`), and a part that joins another part of the same
   piece (core Q14) is the same piece id. Added that every piece id has one type in every possibility, so the
   same-face rule for merges (core Q13) never refuses a crazyhouse merge.
7. **4.2.** A Missed drop's possibilities are idle worlds and pass through `applyMiss` (en passant ends there, Q13).
   A drop onto a ghost of the **same type** is rolled and never joins it: `isMeasured` returns true for every drop
   before its own-part test, and the dropped piece is another piece id (new test Q15). Why: core Q14 invites the wrong
   reading "the knight joins the knight".
8. **4.4 rewritten.** The old text said castling is rolled when it is possible in some possibilities only, rights
   are kept per possibility, and warned against implementing the classic rule in crazyhouse alone. The core now
   follows `docs/rules.md` sections 4 and 5 for every orthodox variant (decisions D1 and D2): castling and en passant
   are certain-only (core Q2; checked: `O-O` past a possible ghost has `branches` null), rights are unified over the
   whole state (core Q3 and W5), and en passant ends on idle worlds (core Q1 and W4). The corner-rook paragraph, and
   the note in section 3 on the rights filter for drops, now use the unified rights: while a right exists, its king
   and the original rook are on their squares in every possibility.
9. **4.5.** Quiet counter: a Missed drop now **adds 1** (it reset the counter before core Q8; checked: 8, not 0).
   Game end: added the argument, confirmed by the fuzz, that no crazyhouse move ever needs a solid roll or a game-end
   roll. King danger: counts converging captures (core Q7) and never hand pieces (new test Q14). Budget: `budgetInfo`
   gives the same number.
10. **Section 6.** U1–U4 are built (plan items U16, U7, U17, U13), checked in the files named there: `sortHand` in
    `panel.js`, `outcomeText(key, code)` and `codeText(V, code)` in `texts.js` with the exact strings, `glyphOf`
    passing `promoted`, and the marker in `VariantPiece.vue`. The text now says "built" instead of "UI change". The
    marker centre is (+0.33, −0.33) × size as built (the spec said 0.32); it still cannot touch the badge
    (y −0.44 to −0.22 against +0.17 to +0.43). "Until U4 lands" was removed. The layout needs only `rectTopology`,
    which fits the layout API (no `layoutOf`, `boards` or `areas`).
11. **Section 5.** Checked, unchanged: all eight sentences match the rules and the core, rule 4 ("marked with a
    small +") is true now that U13 is built, and castling and en passant need no crazyhouse sentence because the
    shared rules (`sharedRules` in `texts.js`) now say that both are possible only when they are possible in every
    possibility.
12. **Section 7.** Q9 (a Missed drop gives 8) and Q11 (`O-O` illegal past a possible ghost, certain once every
    possibility is clear) were rewritten for the changed core. New rows for the riskiest rules:
    - Z14: the built UI texts and hooks (`outcomeText`, `codeText`, `glyphOf`, `sortHand`).
    - Q12: a partial rook slide loses the right in every possibility, and neither a Missed nor a successful corner
      drop brings it back.
    - Q13: en passant ends after a Missed drop and a Missed king move (fails without `applyMiss`).
    - Q14: king danger ignores the hands.
    - Q15: a drop onto the same type's ghost is rolled, while the board piece's own move onto that part joins it.

    F1 now also asserts identical rights and en passant squares, one unrolled outcome for castling and en passant,
    the exact quiet counter, `budgetInfo`, and no follow-up roll for any move. The intro defines "one outcome, `move`
    p = 1".

#### 8.2.3 Core changes needed

None. Everything the spec uses exists in `src/variants/core/` as built: `extraMoves`, `onCapture`, `afterMove`,
`solidExtra`, `reasonText`, `evaluate`, `drops`, `handOrder`, drops in the measured class (`isMeasured`), the
inherited `applyMiss` and `unifyWorlds` of `orthodoxSpec()`, certain castling and en passant (`isCertain`), drops
that happened in the quiet counter (`resetsQuiet` in `quantum.js`), and hand pieces in `solidKey` and in the budget.
The UI changes the first pass asked for (U1–U4) are built as well.

Open questions for the lead:

1. **`solidExtra` is undocumented.** It is a real hook of `quantum.js` (`solidKey` and the solid-roll note), but
   neither the hook table of `handoff/IMPLEMENTING.md` nor the header of `core/variant.js` lists it;
   `handoff/CORE-CHANGES.md` section 6 plans the documentation. In crazyhouse it never fires (4.5) and costs about 2%
   of a hard-level search: keep it as the spec says, or drop it.
2. **AI and drop threats.** An `evaluate` term for enemy hand pieces near an exposed own king would be a cheap
   stop-gap. It needs play-testing before it goes into the spec.

#### 8.2.4 First pass (summary)

Against the core before `handoff/CORE-CHANGES.md` (the same scratch folder; its test file is kept as
`zh.spec.v1.js.txt`): 26 tests, and a fuzz of 29,435 plies without a violation. It changed:

1. Section 1: noted the re-run.
2. Section 3: said to start from `orthodoxSpec()`; the promoted types need their own `name` and `glyph`; the core
   reads `solidExtra` although `IMPLEMENTING.md` does not list it; added the AI limit for drop threats.
3. 4.1: fuzz evidence and the extra invariants; converging captures and en passant are covered by one occupant per
   square.
4. 4.2: a drop that finds a ghost settles every piece linked to it (Q10); a drop has exactly two results and never
   a follow-up roll; a square taken by a solid piece is taken everywhere; a full budget never blocks a drop (Q8).
5. 4.4: described castling as rolled per possibility with per-possibility rights (the core of that time) and asked
   the lead whether the variants should follow the classic rule. **Superseded**: the lead decided D1 and D2, and the
   core now follows `docs/rules.md` (8.2.2 item 8).
6. 4.5: the budget counts hand pieces harmlessly; a Missed drop resets the quiet counter. **Superseded** by core Q8
   (8.2.2 item 9). Removed the wrong claim of a king-safety confirmation dialog in the variant UI.
7. Section 5, rule 6: shortened; the turn is used on a miss.
8. Section 6: named the four UI changes U1–U4 (hand order, drop wording, drop letters, promoted marker). **Done**:
   all four are built (8.2.2 item 10).
9. Section 7: the placement-order and turn conventions for multi-world rows; Q4 fixed ("with White to move"); new
   rows Z13 and Q6–Q11; F1 extended. Q9 and Q11 were rewritten in the second pass.

The first pass's open question on castling in all orthodox variants is closed by decision D1.
