# Variant spec: `darkchess` (Fog of War / Dark chess)

Category: `uncertainty`. UI name: "Fog of war". Catalog summary (already in `catalog.js`): "You only see the squares
your pieces can reach."

Every number in section 7 was computed with a prototype of the hooks below, run on the real variant core
(`handoff/tools/hid/proto.mjs` for `visibility`, `handoff/tools/hid/ai2.mjs` for `aiView`). Implementers can
copy from those files.

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the egress proxy for every rules site (wikipedia.org, chessvariants.com,
chess.com, pychess.org, arxiv.org, dagstuhl.de). The rules below come from search-engine extracts of these pages,
cross-checked against each other and against prior knowledge.

| Source | What it gives |
|---|---|
| Wikipedia, "Dark chess": https://en.wikipedia.org/wiki/Dark_chess | Invented by Jens Bæk Nielsen and Torben Osted in 1989. You see your own pieces, the squares they can legally move to, and enemy pieces on those squares, which must therefore be capturable. A pawn's blocked forward square stays dark. The diagonal squares in front of a pawn are dark unless an enemy stands there or en passant is possible. The goal is to capture the king. Nobody is told about check. Moving into check or staying in check is legal. |
| Chess.com, Fog of War: https://www.chess.com/terms/fog-of-war-chess, https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess, https://www.chess.com/variants/fog-of-war | Same visibility rule. Hidden squares are marked, so they can't be confused with visible empty squares. En passant: "the threatened pawn and the square it moved through are both visible to the capturing player, but only until the end of the turn". The Capture the King rule is on: no notice of check, no obligation to leave it. Castling out of, through and into attack is allowed. Added to chess.com in September 2020. |
| Chess Variant Pages: https://www.chessvariants.com/other.dir/fog_of_war_chess.html and https://www.chessvariants.com/incinf.dir/darkness.html | The same rules. Draws by repetition and the 50-move rule are enforced by the host. There is no stalemate in the classical sense, because a king may always step into attack. |
| M. Gehnen, J. Stannat, "Fog of War Chess", arXiv:2601.18813 (2026), also FUN 2026 "Endgames in Fog of War Chess" (LIPIcs vol. 366) | Endgame theory under these rules. K+Q always beats K. K+R cannot force a win against K, but K+R+R can. This is useful to know when designing draws: a lone rook is not a forced win. |
| B. H. Zhang, T. Sandholm, arXiv:2506.01242 (2025), "Obscuro" | A superhuman Fog of War program built on the chess.com rules. It confirms that the rule set above is the de facto standard. |
| Lichess | **Has no Fog of War variant.** Several feature requests exist on the forum (for example https://lichess.org/forum/lichess-feedback/adding-the-fog-of-war--dark-chess-chess-variant-to-lichess), and the developers have said they plan no new variants. The "lichess" part of the brief therefore does not apply. |

**Chosen rule set: chess.com Fog of War, which is the Nielsen/Osted dark chess rule set, played with the shared
quantum rules.**

- The sources agree on everything that matters: visibility, capture the king, en passant visibility and castling.
- Draw rules: the sources only say that the host enforces the usual draws. Here the shared quantum draws apply:
  - 50 moves by each side without a capture or pawn move (`quietPlies` 100);
  - the move limit of 600 plies;
  - no legal move at all.
- Bare kings are **not** an automatic draw. Under capture-the-king a king that steps next to the enemy king is
  captured, and in the fog neither player can see the other king. The shared variant core has no bare-kings rule
  either.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Board.** The standard 8 × 8 board: all 64 squares exist.
- **Square names.** Files `a`–`h` from White's left, ranks `1`–`8` from White's side. `a1` is a dark square.
- **Coordinates.** 0-based `[file, rank]`, so `a1 = [0,0]` and `h8 = [7,7]`. This is `rectTopology(8, 8)`, as used
  by `orthodoxSpec()`.

### 2.2 Pieces and movement

Vectors are `[dfile, drank]`. The pawn's vectors are oriented: Black negates `drank`.

| Piece | Descriptor | Notes |
|---|---|---|
| King K | `leap` over the 8 `KING_STEPS` | Royal. It may step into attack: there is no check. |
| Queen Q | `ride` over `ROOK_DIRS` + `BISHOP_DIRS` | |
| Rook R | `ride` over `ROOK_DIRS` = [1,0], [-1,0], [0,1], [0,-1] | |
| Bishop B | `ride` over `BISHOP_DIRS` = [±1,±1] | |
| Knight N | `leap` over `KNIGHT_JUMPS` = the 8 (±1,±2)/(±2,±1) | |
| Pawn P | `leap [[0,1]]`, oriented, mode `move`; `leap [[1,1],[-1,1]]`, oriented, mode `capture` | Plus the double step and en passant (below). |

### 2.3 Setup

| Side | Rank | Pieces |
|---|---|---|
| White | 1 | Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1 |
| White | 2 | pawns a2–h2 |
| Black | 8 | ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8 |
| Black | 7 | pawns a7–h7 |

White moves first.

### 2.4 Special moves

- **Double step.** A pawn on its start rank (2 for White, 7 for Black) may move two squares forward if both squares
  are empty.
- **En passant.** Only on the move right after an enemy double step. A pawn that could have captured the passing
  pawn on the skipped square may do so: it moves to the skipped square and the passing pawn is removed.
- **Castling.** The king moves two squares towards a rook and that rook jumps to the square the king crossed:
  - `O-O`: Ke1-g1 with Rh1-f1 (Black: Ke8-g8 with Rh8-f8);
  - `O-O-O`: Ke1-c1 with Ra1-d1 (Black: Ke8-c8 with Ra8-d8).

  The conditions:
  - neither the king nor that rook has moved;
  - every square between them is empty.

  There are **no** conditions about attacked squares: castling out of, through or into attack is legal.

### 2.5 Promotion

- A pawn that reaches the last rank (8 for White, 1 for Black) must promote to a queen, rook, bishop or knight of
  its side. The owner chooses.
- The opponent sees the new piece only if its square is visible to them.

### 2.6 Visibility (the defining rule)

Side S sees these squares:

1. **Own pieces:** every square occupied by a piece of S.
2. **Move targets:** every square to which S has a legal move. There is no check, so every pseudo-legal move is
   legal. That includes:
   - empty squares reached by non-capturing moves (single and double pawn steps, piece moves, the king's castling
     destination);
   - squares with a capturable enemy piece;
   - the en passant target square.
3. **En passant victim:** while S can capture en passant, the square of the passing pawn.

Consequences, all standard in dark chess:

- A slider sees along its lines up to and including the first enemy piece. It sees nothing behind that piece.
- A pawn sees the square in front of it only when that square is empty. A dark square directly in front of your
  pawn means something is standing there.
- A pawn sees a diagonal square only when an enemy piece stands there, or when it can capture en passant.
- A square that none of your pieces can move to stays dark, even if it is next to your pieces. For example, after
  1. e4 White cannot see `e3`.
- **Enemy pieces are shown only on visible squares.** Nothing is announced about hidden squares: no check, no
  opponent move, no hidden capture.
- Your own pieces are always visible, and you always see when one of them is captured, because it disappears.
- **Hidden squares are marked as hidden**, so "dark" is never confused with "empty".

### 2.7 Win, draw, turn order

- White and Black alternate; White starts.
- **Win:** capture the enemy king.
  - Nobody is told about check.
  - Leaving your king capturable is legal.
  - A player who cannot see the attacker simply loses the king.
- **Draw** (chosen, section 1): 50 moves by each side without a capture or pawn move, the 600-ply limit, or a side
  with no legal move at all. With capture-the-king this last case needs a side whose every piece is completely
  boxed in, so it is extremely rare.
- There is no draw by insufficient material and no bare-kings draw.

---

## 3. Engine mapping (contract)

The module is `orthodoxSpec()` plus hidden-information hooks. Nothing about movement changes.

```js
const spec = Object.assign(orthodoxSpec(), {
	id: 'darkchess',
	category: 'uncertainty',
	hidden: true,
	hiddenStyle: 'fog',               // NEW optional flag, see section 6 (default 'fog')
	rules: () => [...],               // section 5
	visibility(state, side) { ... },  // below
	aiView(state, side) { ... },      // below
	evaluate(w, side) { ... },        // optional vision term, below
})
export default defineVariant(spec)
```

The fields in detail:

| Field | Value |
|---|---|
| `sides` | `whiteBlack()`: `[{ id: 'w', color: 'white' }, { id: 'b', color: 'black' }]`, White first |
| `teams`, `enemies` | none / default (`a !== b`) |
| `topology` | `standardBoard(8, 8).topology` (from `orthodoxSpec()`) |
| `types` | `orthodoxTypes()` |
| royal | `k` |
| solid | `k`, `p` |
| splittable | `q`, `r`, `b`, `n` |
| values (centipawns) | k 400, q 900, r 500, b 330, n 320, p 100 (the orthodox `VALUES`) |
| `setup` | `standardSetup(spec, 'rnbqkbnr')`: castling rights for both sides, `x.ep = -1` |
| `extraMoves` | `pawnExtras` (double step on rank 2/7, en passant) + `castlingMoves` (as in `orthodoxSpec`) |
| `afterMove` | `orthodoxAfterMove` (ep square, castling rights) |
| `worldResult` | default: a side without its king has lost (`reason: 'king'`) |
| `options` | none |
| `maxPly`, `quietPlies` | defaults 600 and 100 |

### 3.1 `visibility(state, side)`

The squares side `side` can see in the current state. It is square-based and taken over all worlds:

```js
visibility(state, side) {
	const out = new Set()
	for (const { b } of state.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.sq[id] >= 0) out.add(b.sq[id])        // own pieces (every part of a ghost)
		}
		for (const m of generate(spec, b, side).values()) {                  // cached per world and side
			out.add(m.to)                                                    // every move target
			if (m.kind === 'ep') out.add(b.sq[m.capture])                    // the passing pawn
		}
	}
	return out
}
```

- The function is called for the viewer whether or not it is the viewer's turn. `generate` works for either side.
- `pawnExtras` only makes en passant moves for the side whose enemy just double-stepped, so the en passant window
  closes by itself after one move.
- The core's `reachable(V, state, side)` gives the move-target part.

### 3.2 `aiView(state, me)`: what the computer may know

**Knowledge contract.** The computer uses exactly what a human in its seat sees:

1. its own pieces in every world, with the worlds' weights. This is its own quantum state, as the board shows it;
2. the set of squares visible to it (3.1), and what may stand on those squares in each world;
3. which enemy pieces it has captured. It saw them when it took them;
4. public counters: `turn`, `ply`, `quiet`.

It must **not** read:

- enemy pieces on hidden squares;
- enemy castling rights;
- the en passant square, unless it can capture en passant right now;
- enemy move codes in `history`;
- the enemy budget;
- any roll result in advance.

The core's `chooseMove` then keeps only the candidates that are legal in the real state. In Fog of War every move
the computer can see is legal, so this filter only removes impossible phantom captures.

**Construction (baseline, verified in `handoff/tools/hid/ai2.mjs`):**

1. `vis = visibility(state, me)`.
2. For every real world `b`, make a copy `c`:
   - Remove every enemy piece whose square is not in `vis` (`placePiece(c, id, OFF)`).
   - Keep only `me`'s castling rights in `c.x.castle`.
   - Keep `c.x.ep` / `c.x.epVictim` only if `me` has an en passant move in `b`. Otherwise set both to -1.
3. **Phantoms** stand in for the hidden enemy army.
   - `alive[t]` for each enemy type `t` is the start count minus the enemy pieces of type `t` that are off the board.
     These were captured by `me`, so their types are known.
   - Per world, `seen[t]` is the number of visible enemy pieces of type `t`, and `want[t] = max(0, alive[t] − seen[t])`.
   - Each enemy type has fixed **phantom slots**: its start squares in square order. For Black these are
     K e8; Q d8; R a8, h8; B c8, f8; N b8, g8; P a7…h7. The slots are appended to every view world with the same ids
     in every world.
   - Slot `i` of type `t` is placed on its start square when `i < want[t]` and that square is hidden and empty in
     that view world. Otherwise it stays `OFF`.
   - **The enemy king is always placed.** When its start square is visible or occupied, it goes to the nearest hidden
     empty square (Chebyshev distance, ties to the lowest square index). Every view world then has exactly one
     enemy king, so the default `worldResult` does not declare the computer the winner.
4. Merge identical worlds, summing their weights, which still total T. Return
   `{ ...state, worlds, history: [] }`.

This construction depends only on items 1 to 4 of the contract. Section 7 has the no-leak test.

The computer's play in the fog is naive by design. It assumes unseen pieces are still at home. A better belief
model can come later, as long as the no-leak test passes.

### 3.3 `evaluate(w, side)` (optional)

A small vision term: `+2 × (number of distinct move targets of side in w)`. Vision is worth something when you are
blind. `generate` is cached per world, so the cost is small. Leave it out if the fuzz test gets slow.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: split, merge, measure, land = roll, pass = link, the solid roll, the
game-end roll, budget 8 and at most 4 squares per piece. Only **what each player sees** is new. Every ambiguous case
is decided here.

**D-1. Which squares are visible?** A square is visible if, in **at least one possibility**, one of your pieces (or
one part of a ghost) stands on it, could move to it, or could capture en passant from next to it.
- The same rule reads "a ghost sees from every square it might be on".
- Rejected alternative: visibility weighted by possibility ("you see e5 in 50% of the worlds"). It can't be drawn,
  and it can't be explained in one sentence.

**D-2. What is shown on a visible square?** Everything that might stand there, with its overall chance (for
example "n 50%"), exactly as in the classic game. Nothing is ever drawn on a hidden square except your own pieces,
which are always on visible squares anyway.
- If an enemy ghost has one part on a visible square and one in the fog, you see only the visible part, with its
  percentage. You can work out that the rest is somewhere in the fog, and that is fine.

**D-3. Own pieces.** You always see all parts of your own pieces with their percentages, and the links among your
own pieces. Lines or threads to enemy pieces are never drawn.
- An enemy move can make one of your ghosts collapse: they landed on one of its squares, or measured a piece that
  yours is linked to. You see the collapse. That is information the quantum rules give you, not a leak.

**D-4. Scouting by splitting.**
- Splitting a knight, bishop, rook or queen lets it see from both target squares. Example: 1. Ng1-f3|h3 from the
  start reveals `e5` and `g5` (test D7).
- This is deliberate and fun. The budget of 8 and the 4-square limit keep it in check.
- Split targets are quiet-move targets, and those are always visible. So "both targets certainly empty" can always be
  judged from what you see, and the split rules need no change.

**D-5. Move preview with odds: allowed.**
- The odds preview ("50% Captured / 50% Moved") uses only what the mover can see:
  - Every square on the path of a move that can be played in some world is a move target in that world, so it is
    visible.
  - Every square that blocks a path is visible too: it is a capture target, or one of your own pieces.
  - The target is visible.
  - Whether your own piece is on the from-square is your own information.
  - The solid roll and the game-end roll only split on pieces that the move itself touches, and those are on visible
    squares.
- So the preview reveals nothing about hidden squares, and it stays.
- The summarised notes ("A piece that is always solid was settled", "The game ends: …") are safe too.

**D-6. No check, no warning.** The king-danger text and ring are **not shown** in Fog of War. The move
confirmation "safety net" is **off**. Both are computed from hidden pieces, and the chess.com rules tell nobody about
check.

**D-7. Opponent's moves.**
- The opponent's last move is not highlighted, and their roll box is hidden (already true: `hideLast`).
- While the game runs, a history row of the opponent shows only "A move", or "Capture on X" when they captured one
  of your pieces. The rules as built do that already.
- En passant: the core records the square the capturing pawn moved to (for example `d6`), and the owner of the
  captured pawn sees it vanish from `d5`.

**D-8. Budgets.** You see your own budget pips. The opponent's pips are replaced by "?" while the game runs, because
their budget says how many ghosts they have in the fog.

**D-9. Measure.** You can only measure your own ghosts, as always. The result is public only in the sense that the
piece appears where it is. The opponent sees it only if that square is visible to them.

**D-10. Game end.** The game-end roll works as always. When a king is captured, both players see the result. The
**whole board is revealed** once the game is over, which the rules as built already do: `hidden` is null when
`state.result` is set.

**D-11. Pass & play hand-over.** Both players are human on one device, so after every move:
1. **Your result.** The mover still sees **their own** view after the move. That includes the roll result of their
   own move and the capture they made. Then they press "Pass the device".
2. **Curtain.** "Pass the device to Black." Nothing of either board is drawn. The button reads "I am Black: show my
   board".
3. The next player sees their own fogged view and "Black moved" / "Capture on X" for the opponent's move.

Today the curtain appears straight after the move, and the mover never sees the result of their own roll. Step 1 is
new (section 6).

**D-12. Against the computer.** The human's view is shown at all times, including while the computer thinks. The
computer follows 3.2.

**D-13. Undo** is disabled while a hidden-information game is running. In pass & play it would show the side that
moved last to the other player. Against the computer it would let you see a result and take it back. It comes back
when the game has ended.

**D-14. Draws.** The shared rules apply (section 2.7). Nothing depends on hidden information apart from the game
ending itself, and the end is announced to both players.

---

## 5. Player-facing rules text (rules card)

1. You see only your own pieces and the squares they could move to. Everything else is hidden in fog.
2. An enemy piece shows up only on a square you can see. A ghost part in the fog stays hidden.
3. A ghost sees from every square it might be on, so splitting a piece also lets you look further.
4. A dark square right in front of your pawn means something is standing there.
5. En passant shows you the passing pawn for that one turn only.
6. There is no check and nobody warns you: you win by capturing the king, and your own king can be taken by a piece
   you never saw.
7. In pass & play each player sees only their own view. Hand the device over when asked. The whole board is revealed
   when the game ends.

---

## 6. UI layout

- **Board:** the standard 8 × 8 layout of `rectTopology`. Light and dark squares, file letters `a`–`h` along the
  bottom and rank numbers `1`–`8` along the left side. White is at the bottom. In pass & play the board turns
  towards the side to move, which the rules as built do already (`viewer = state.turn` for hidden variants).
- **Glyphs:** the cburnett sprites for all six orthodox pieces. No new glyphs. Ghost parts are faded with a
  percentage badge, as everywhere.
- **Fog** (`hiddenStyle: 'fog'`):
  - Hidden squares keep their light/dark contrast but are drawn clearly darker and desaturated, for example 60% of a
    neutral slate `#5b6472` over the square colour.
  - Add a fine 45° hatch at about 20% opacity, so hidden squares are not told apart by colour alone.
  - Each hidden square's accessible name is "e5: hidden" (already built).
  - Add a one-line legend under the board: "Fog: squares you cannot see."
- **Visible squares** look exactly like a normal board.
- **Side panel:**
  - Own budget pips; "?" for the opponent (D-8).
  - No king-danger text (D-6).
  - The move preview with odds works as in other variants (D-5).
  - The history shows "A move" / "Capture on X" for the opponent during the game.
- **Hand-over** (D-11), in two steps:
  1. A "Your move: {result}" box with a "Pass the device" button. The board stays in the mover's view.
  2. The curtain (already built) that hides everything, with "I am {side}: show my board".
- **Undo** is disabled until the game ends (D-13).
- **After the game:** no fog. All pieces and the full history (codes and odds) are shown.

**Leak checklist for the UI** (to verify when implementing):

- `pieceAt(sq)` in `useVariantGame.js` reads the first world's occupant, whatever its side. It must only ever return
  a piece of the viewer. Use `ownPieceAt` or filter by side. Otherwise selecting a square could mark the parts of an
  enemy ghost as "part".
- `danger` must not be rendered for darkchess.
- The opponent's budget must not be rendered.
- No "possibilities" / what-if panel may show full worlds while the game runs.

---

## 7. Test cases

Positions use `worldFrom` placements (`'0:k'` is a White king, `'1:n'` a Black knight). A state with several worlds
lists **the same pieces in the same order** in every world, so the ids match. Squares in visibility sets are listed
rank by rank. Where a test needs castling rights, it sets them explicitly. Otherwise worlds have
`x = { ep: -1, epVictim: -1, castle: [] }`.

**D1. Start position visibility.**
- `newGame`: `visibility(s, 0)` = exactly the 32 squares a1–h4.
- `visibility(s, 1)` = exactly a5–h8.
- The board, as White sees it, draws no Black piece.

**D2. What 1. e4 d5 shows (and hides).** From the start:
- Play `e2-e4`. `visibility(·, 0)` has **35** squares:
  - rank 1–2 (16);
  - a3 b3 c3 d3 f3 g3 h3 (**e3 is hidden**: no White piece can move there);
  - a4–h4;
  - b5, e5, h5, a6.
- Black's visibility is still a5–h8 (32).
- Then play `d7-d5`:
  - White's visibility has 36 squares and now includes **d5**, showing the Black pawn (`e4-d5` is a capture).
  - Black's visibility (36) now includes **e4** (a pawn capture), d4, g4 and h3 (bishop c8).

**D3. A blocked pawn leaves a dark square.** One world: `{ e1:'0:k', e4:'0:p', e8:'1:k', e5:'1:p' }`, White to move.
- `visibility(·,0)` = exactly {d1, e1, f1, d2, e2, f2, e4}. `e5` is hidden.
- White's legal moves are the 5 king steps. The pawn on e4 has no move.

**D4. En passant window.** One world `{ e1:'0:k', e5:'0:p', e8:'1:k', d7:'1:p' }`, Black to move. Play `d7-d5`.
- White's visibility = {d1, e1, f1, d2, e2, f2, **d5**, e5, **d6**, e6}.
- `e5-d6` is legal: 1 outcome, `capture`, capture square recorded as `d6`.
- If White instead plays `e1-f1`, White's visibility becomes exactly {e1, f1, g1, e2, f2, g2, e5, e6}. d5 and d6 are
  hidden again.

**D5. Castling ignores attacks.** One world `{ e1:'0:k', h1:'0:r', a8:'1:k', f8:'1:r' }`, White to move, with the
White right `{ flag:'K', side:0, king:e1, rook:h1, kingTo:g1, rookTo:f1 }`.
- `O-O` is legal although the Black rook covers f1.
- White's visibility = {d1, e1, f1, g1, h1, d2, e2, f2, h2–h8}. The f-file above f1 is hidden, so White does not see
  the rook on f8.
- After `O-O`:
  - the king is on g1 and the rook on f1;
  - Black's visibility includes f1–f7, and the White rook is visible to Black on f1.

**D6. Stepping into an unseen attack loses.** One world `{ e1:'0:k', h8:'1:k', d8:'1:r' }`, White to move.
- White's visibility = {d1, e1, f1, d2, e2, f2}. The rook is not visible.
- `e1-d1` is legal and not refused.
- UI: no danger text or safety dialog appears for darkchess.
- Black's visibility then includes d1 (with the White king).
- `d8-d1` is 1 outcome, `capture`. The state result is `{ winner: 1, reason: 'king' }`.

**D7. Quantum: splitting to scout.** From the start, play the split `g1-f3|h3`:
- White's visibility gains exactly **e5 and g5** and loses nothing.
- Black's visibility is unchanged (32 squares). f3 and h3 are hidden from Black.

**D8. Quantum: an enemy ghost half in the fog; a ghost that sees the king.** Two worlds, weight 1:1:
- A = `{ a1:'0:r', e1:'0:k', e8:'1:k', a5:'1:n' }`;
- B = `{ a1:'0:r', e1:'0:k', e8:'1:k', h5:'1:n' }`.

White to move.
- White's visibility = {a1, b1, c1, d1, e1, f1, a2, d2, e2, f2, a3–a8}.
  - `squareView(a5)` = Black knight, p = 0.5, shown on a5 as "n 50%".
  - h5 is hidden.
- `a1-a5` outcomes: `[move 0.5, capture 0.5]`. The preview may show them (D-5).
- `a1-a8` has 1 outcome, `move`, not rolled. Afterwards the rook is at a1 50% / a8 50%, linked to the knight.
  - White's visibility now also contains **b8, c8, d8 and e8**. The a8 part can capture the king in world B, so the
    Black king is visible on e8.
  - `royalDanger(·, 1)` = 0.5, but Black's UI shows **no** danger (D-6).
- Black plays `h5-g7` (1 outcome). Then `a8-e8` has outcomes `[miss 0.5, capture 0.5]`.
  - capture → `result = { winner: 0, reason: 'king' }`;
  - miss → the rook is 100% on a1 and the knight 100% on a5.

**D9. Quantum: a pawn sees a ghost on its diagonal.** Two worlds, 1:1:
- A = `{ e1:'0:k', e4:'0:p', e8:'1:k', d5:'1:n' }`;
- B = `{ e1:'0:k', e4:'0:p', e8:'1:k', b6:'1:n' }`.

White to move.
- White's visibility = {d1, e1, f1, d2, e2, f2, e4, **d5**, e5}. f5 and b6 are hidden.
- `e4-d5`: `[miss 0.5, capture 0.5]` (a pawn, so it is rolled).
- `e4-f5` is illegal (null).
- `e4-e5` is 1 outcome, `move`.

**D10. The computer does not peek (no-leak test).** From the start:
- Play `e2-e4`. Then, in state A, Black plays `h7-h6`; in state B, Black plays `g7-g6`.
  - `visibility(A,0)` equals `visibility(B,0)`.
  - `aiView(A,0)` and `aiView(B,0)` are **deep-equal**: the same worlds with the same weights after sorting by
    `worldKey`.
  - In state C, Black plays `d7-d5` (visible to White via e4xd5): `aiView(C,0)` differs from `aiView(A,0)`.
- For every view, check:
  - the weights sum to T;
  - every world has exactly one Black king and all of White's pieces as in reality;
  - no enemy piece stands on a square that is visible to White, unless it really might be there.

**D11. View invariants in random games.** Add darkchess to `fuzz.spec.js` (automatic through `VARIANT_IDS`). For
each state:
- every legal ordinary move's `to` square is in `visibility(state, state.turn)`;
- every own-piece square is visible;
- `aiView(state, state.turn)` sums to T and has exactly one enemy king in every world.

**D12. UI (component test of `VariantGameView`, optional).** A darkchess game against the computer:
- The opponent's budget renders as "?".
- The danger text is absent even when `royalDanger > 0`.
- Undo is disabled while `state.result` is null.
- After the result is set, no cell has the fog class.
