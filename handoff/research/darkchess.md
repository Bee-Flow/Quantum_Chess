# Variant spec: `darkchess` (Fog of War / Dark chess)

Category: `uncertainty`. UI name: "Fog of war". Catalog summary (already in `catalog.js`): "You only see the squares
your pieces can reach."

Every number in section 7 was computed with a prototype of the hooks below, run on the real variant core. The first
prototypes are `handoff/tools/hid/proto.mjs` (`visibility`) and `handoff/tools/hid/ai2.mjs` (`aiView`). They import
from `/home/user/...`, so their paths must be changed before they run. Also, `ai2.mjs` counts captured enemy pieces
in the first world only, which section 3.2 now forbids (test D14). The reviewed hooks are in
`handoff/tmp/critic-darkchess/` (scratch, not in git; see section 8.2): `proto.mjs` (`visibility`), `r2-view.mjs`
(`aiView` as section 3.2 now describes it, with fresh ids), `r2-record.mjs` (`recordInfo` and `infoText`) and
`r2-check.mjs` (every test of section 7 with exact assertions, on the core in the working tree).

---

## 1. Sources and chosen rule set

Research note: the original researcher could not open the rules sites and worked from search-engine extracts. The
source review (section 8.1) re-read every source below directly and corrected the table.

| Source | What it gives |
|---|---|
| Wikipedia, "Dark chess": https://en.wikipedia.org/wiki/Dark_chess | Invented by Jens Bæk Nielsen and Torben Osted in 1989. You see your own pieces, the squares they can legally move to, and enemy pieces on those squares, "which must therefore be capturable". Hidden squares are marked, so a hidden square is never confused with a visible empty square; an enemy piece directly in front of a pawn is therefore always on a hidden square. En passant: "the threatened pawn and the square it moved through are both visible to the capturing player, but only until the end of the turn". The goal is to capture the king; nobody is told about check; moving into check or staying in check is legal; castling is allowed out of, into and through attacked squares. Server differences: on chess.com a pawn "does not see what is in front of" it, and promotions stay unknown to the opponent; before 5 November 2021 chess.com lit up the en passant square but did not show the pawn. |
| Chess.com help centre and terms page: https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess, https://www.chess.com/terms/fog-of-war-chess | "Each player sees only their own pieces and the squares their pieces can move to." En passant as on Wikipedia. "The king can castle while in check, and can castle through, or into check." No notice of check, no obligation to leave it; the game ends only when a king is captured. "There are no stalemates—if a king can move to only attacked squares, it must do so." You see which enemy piece captured yours, or that a pawn promoted, only if another of your pieces can move to that square. Fog of War was chess.com's most popular variant in September 2020 (Wikipedia). |
| B. H. Zhang, T. Sandholm, "General search techniques without common knowledge for imperfect-information games, and application to superhuman Fog of War chess", arXiv:2506.01242 (ICLR 2026), Appendix A "Rules of FoW chess": https://arxiv.org/html/2506.01242 | The chess.com rules written out in full. Capture the king; castling into, out of or through check is legal; "Stalemate is a forced win for the stalemating player"; "There is no draw by insufficient material" (even K vs K is not an immediate draw); a pawn blocked by an enemy piece does not see that piece; the pawn that can be taken en passant is visible; "Threefold repetition and 50-move-rule draws do not need to be claimed", so such a draw can come without either player knowing it was near. |
| M. Gehnen, J. Stannat, "Fog of War Chess", arXiv:2601.18813 (2026): https://arxiv.org/html/2601.18813; also "Endgames in Fog of War Chess", FUN 2026, LIPIcs vol. 366, paper 21 | Same rules ("There is no stalemate"; threefold repetition and the 50-move draw "must be enforced by the game host"). Endgames: K+Q always beats K; K+R cannot force a win against K; K+R+R can. So a lone rook is not a forced win. |
| pychess.org, variant `fogofwar` (pychess-variants `variants.ini`, `client/variants.ts`; Fairy-Stockfish `Position::fog_area`, `Position::legal`) | `[fogofwar:chess]` with `king = -`, `commoner = k`, `castlingKingPiece = k`, `extinctionValue = loss`, `extinctionPieceTypes = k`: the king is an ordinary piece that must not be captured, so castling through attack is legal ("Non-royal pieces can not be impeded from castling"). Fog = own pieces plus the targets of legal moves. Differences from chess.com: the en passant victim is not revealed, and the Fairy-Stockfish defaults apply (50-move rule, threefold repetition, a position with no legal move is a draw). |
| Chess Variant Pages, "Darkness Chess" by Jens Bæk Nielsen: https://www.chessvariants.com/incinf.dir/darkness.html (read via https://web.archive.org/web/20250320102116/https://www.chessvariants.com/incinf.dir/darkness.html) | The **original 1989 rules**, which differ from the modern ones: a piece "sees" the squares it attacks as well as those it can go to (after e2-e4 the pawn sees d5, e5 and f5), and en passant was "discarded". Capture the king, no check, and "during castling the king is allowed to jump over an attacked square". Not the chosen rule set. |
| Chess Variant Pages, "Fog of War Chess" by William Lee Sims: https://www.chessvariants.com/other.dir/fog_of_war_chess.html (read via https://web.archive.org/web/20241102135831/https://www.chessvariants.com/other.dir/fog_of_war_chess.html) | A **different** computer game with the same name: normal check rules, pawns always see the three squares in front of them, a king warning system and insufficient-material draws. Not used. |
| Lichess | **Has no Fog of War variant**: scalachess `Variant.list.all` holds Standard, Crazyhouse, Chess960, From Position, King of the Hill, Three-check, Antichess, Atomic, Horde and Racing Kings only. Forum requests exist (for example https://lichess.org/forum/lichess-feedback/adding-the-fog-of-war--dark-chess-chess-variant-to-lichess). The "lichess" part of the brief therefore does not apply. |

**Chosen rule set: chess.com Fog of War (the modern standard form of Nielsen and Osted's Dark chess), played with
the shared quantum rules.**

- Chess.com, Wikipedia and both papers agree on visibility, capture the king, en passant visibility and castling.
  The 1989 original differs (pawns see the squares they attack, no en passant), and so does pychess (the en passant
  victim stays hidden). Both differences are rejected: this game follows chess.com.
- Draw rules. Chess.com draws automatically by the 50-move rule and by threefold repetition, and has no stalemate
  draw and no insufficient-material draw. Here:
  - 50 moves by each side without a capture or pawn move, automatic (`quietPlies` 100): **as on chess.com**;
  - threefold repetition: **not applied**. This is a known deviation: the variants core has no repetition rule in any
    variant. The 50-move rule and the move limit end any endless game;
  - the move limit of 600 plies (a technical limit of the core, not a chess.com rule);
  - no legal move at all: a draw (the shared default, as on pychess). Chess.com documents no rule for this case. The
    classical stalemate does not occur (see section 2.7).
- Bare kings are **not** an automatic draw, and there is no insufficient-material draw, as on chess.com. Even K vs K
  is not an immediate draw: a king that steps next to the enemy king can be captured, and it cannot see that king
  before it does. The variants core has no bare-kings rule either.

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
- **En passant.** Only on the move right after an enemy double step. An enemy pawn that attacks the skipped square
  (it stands next to the passing pawn on the same rank) may capture the passing pawn as if it had moved only one
  square: the capturing pawn moves to the skipped square and the passing pawn is removed. Written as the pawn's move
  to the skipped square (for example `e5-d6`).
- **Castling.** The king moves two squares towards a rook and that rook jumps to the square the king crossed:
  - `O-O`: Ke1-g1 with Rh1-f1 (Black: Ke8-g8 with Rh8-f8);
  - `O-O-O`: Ke1-c1 with Ra1-d1 (Black: Ke8-c8 with Ra8-d8).

  The conditions:
  - neither the king nor that rook has moved, and the rook has not been captured on its start square;
  - every square between them is empty.

  There are **no** conditions about attacked squares: castling out of, through or into attack is legal (chess.com
  help centre; Zhang and Sandholm, Appendix A).

### 2.5 Promotion

- A pawn that reaches the last rank (8 for White, 1 for Black) must promote to a queen, rook, bishop or knight of
  its side. The owner chooses.
- The opponent sees the new piece only if its square is visible to them (chess.com: "players can only see that an
  opponent has promoted if they have a piece eyeing the promotion square").

### 2.6 Visibility (the defining rule)

Side S sees these squares:

1. **Own pieces:** every square occupied by a piece of S.
2. **Move targets:** every square to which S has a legal move, worked out as if S were to move now (also while the
   opponent is to move). There is no check, so every pseudo-legal move is legal. That includes:
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
- **Enemy pieces are shown only on visible squares.** Nothing is announced: no check, and nothing about the
  opponent's move beyond what your visible squares show.
- Your own pieces are always visible, and you always see when one of them is captured, because it disappears. You
  see the piece that captured it only if that square is still visible to you, that is, if another of your pieces
  can capture there (chess.com terms page).
- **Hidden squares are marked as hidden**, so "dark" is never confused with "empty".

### 2.7 Win, draw, turn order

- White and Black alternate; White starts.
- **Win:** capture the enemy king.
  - Nobody is told about check.
  - Leaving your king capturable is legal.
  - A player who cannot see the attacker simply loses the king.
- **No stalemate.** A king whose only moves go to attacked squares must still move (or another piece must move), and
  can then be captured. This is not a draw (chess.com terms page; Zhang and Sandholm: "Stalemate is a forced win
  for the stalemating player").
- **Draw** (chosen, section 1):
  - 50 moves by each side without a capture or pawn move (`quietPlies` 100). It is automatic, as on chess.com, and
    it counts the opponent's unseen captures and pawn moves too, so it can come without warning;
  - the 600-ply limit;
  - a side with no legal move at all. With capture-the-king this needs a side whose every piece is completely boxed
    in (and, in the quantum game, that cannot split, merge or measure either), so it is extremely rare.
- There is no draw by insufficient material and no bare-kings draw (as on chess.com).
- Threefold repetition is **not** a draw here, although chess.com applies it (known deviation, section 1).

---

## 3. Engine mapping (contract)

The module is `orthodoxSpec()` plus hidden-information hooks. Nothing about movement changes.

```js
const spec = Object.assign(orthodoxSpec(), {
	id: 'darkchess',
	category: 'uncertainty',
	hidden: true,
	hiddenStyle: 'fog',               // UI flag (U10 c; 'fog' is also the default), section 6
	rules: () => [...],               // section 5
	visibility(state, side) { ... },  // 3.1
	aiView(state, side) { ... },      // 3.2
	evaluate(w, side) { ... },        // 3.3, optional vision term
	recordInfo(prev, code, branch) { ... },  // 3.5, the square where a captured piece stood
	infoText(record, viewer) { ... },        // 3.5, "Capture on d5" for the opponent's capture
})
export default defineVariant(spec)
```

`applyMiss` and `unifyWorlds` come from `orthodoxSpec()` (en passant expiry and castling rights over the whole state,
D-15 and D-16). The module must not override or delete them.

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
| `applyMiss` | inherited from `orthodoxSpec()`: `clearEnPassant(b)` in every world where the turn applied no move (a miss, an idle split child, every world of a Measure) |
| `unifyWorlds` | inherited from `orthodoxSpec()`: `unifyCastling(bs)`, a right is kept only if every world has it |
| `recordInfo`, `infoText` | new, section 3.5 |
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
- `pawnExtras` only makes en passant moves for the side whose enemy just double-stepped. The en passant window
  (rule 3 of 2.6) therefore closes after one move, **provided every world's `x.ep` is cleared after every turn**.
  The core in the working tree does this (`handoff/CORE-CHANGES.md` Q1 + W4): `orthodoxSpec().applyMiss` clears
  `x.ep` in every world where the turn applied no move (a Measure, a move that missed there, an idle split child).
  Without it the victim stays visible, and can even be taken en passant, turns later. See D-15 and tests D13, D13b.
- Visibility reads `generate` per world, not the legal moves of the state. The two differ only for certain moves
  (castling, en passant), which are legal only when every possibility allows them (Q2). This adds no square: the
  castling king's destination is also a move target of that rook in the same possibility (the squares between them
  are empty there), and en passant is available in every possibility or in none (D-15).
- The core's `reachable(V, state, side)` gives the move-target part.

### 3.2 `aiView(state, me)`: what the computer may know

**Knowledge contract.** The computer uses exactly what a human in its seat sees:

1. its own pieces in every world, with the worlds' weights. This is its own quantum state, as the board shows it;
2. the set of squares visible to it (3.1), and what may stand on those squares in each world;
3. which enemy pieces it has captured. It saw them when it took them;
4. public counters: `turn`, `ply`. (`quiet` is **not** public here: an unseen capture or pawn move of the opponent
   resets it, see D-14.)

It must **not** read:

- enemy pieces on hidden squares;
- which of several enemy pieces of one type stands on a visible square (the real piece ids). A human sees "a knight"
  on e5, not whether it is the b8 or the g8 knight (test D17);
- enemy castling rights;
- the en passant square, unless it can capture en passant right now;
- enemy move codes in `history`;
- the enemy budget;
- any roll result in advance.

The core's `chooseMove` then keeps only the candidates that are legal in the real state (it compares move codes,
which name squares, so the view's piece ids do not matter). The view differs from reality only on hidden squares,
and only a pawn can move onto or through a hidden square. So among ordinary moves, merges and measurements the filter
removes exactly two kinds, and a human in the same seat knows both are impossible:

- a pawn capture of a phantom. A hidden diagonal square is empty in every possibility, or it would be visible;
- a pawn push onto or through a hidden square. It is blocked in every possibility (rules card, item 4); the view
  removed the blocker.

A split can also be filtered in principle: the view merges possibilities that differ only on hidden squares, so a
split that fits the limit of 64 possibilities in the view can break it in the real state (D-4). The player sees that
refusal too. (It never happened in the random games of D11, which reached 64 possibilities.)
The filter therefore gives the computer nothing a human lacks. Every move that is legal in the real state is also
legal in the view, so the filtered list is never empty while the computer has a legal move. Random games confirm
all of this (section 8.2).

**Construction (verified on the core in the working tree in `handoff/tmp/critic-darkchess/r2-view.mjs`; the first
version `handoff/tools/hid/ai2.mjs` still has the first-world bug of step 4):**

1. `vis = visibility(state, me)`.
2. **Visible slots.** Collect the pairs (square, type) of the enemy pieces that stand on a square in `vis`, over all
   real worlds. Sort them by square index, then by type. Each pair is one slot with a fixed id in every view world.
3. For every real world `b`, build a new view world `c` (with `emptyWorld`; `addPiece` / `placePiece` for the pieces):
   - **Own pieces first**: every piece of `me` in `b`, captured ones included, in the order of their real ids, on
     their real squares. Their identity across worlds is the computer's own knowledge.
   - **Then the visible slots**, in their order: a slot stands on its square when the enemy piece on that square in
     `b` has the slot's type, else it is `OFF`. The real enemy ids and every hidden enemy piece are left out.
   - `c.x` is `b.x` with only `me`'s castling rights in `c.x.castle`, and with `c.x.ep` / `c.x.epVictim` kept only
     if `me` has an en passant move in `b` (otherwise both -1).
4. **Phantoms** stand in for the hidden enemy army.
   - `alive[t]` for each enemy type `t` is the start count minus the enemy pieces of type `t` that are off the board
     **in that real world `b`**. These were captured by `me`, so their types are known.
     - Count per world, never in `state.worlds[0]` only. One capture can take different pieces in different worlds
       (a knight in one, a bishop in the other), and the order of the worlds depends on hidden squares. Counting in
       the first world lets the view change with hidden squares (test D14).
     - A promoted enemy pawn still counts as a pawn until it is captured, because a promotion in the fog is not seen.
       This only makes the naive view less exact.
   - Per world, `seen[t]` is the number of visible slots of type `t` that stand on the board in `c`, and
     `want[t] = max(0, alive[t] − seen[t])`.
   - Each enemy type has fixed **phantom slots**: its start squares in square order. For Black these are
     K e8; Q d8; R a8, h8; B c8, f8; N b8, g8; P a7…h7. The slots are appended after the visible slots, with the same
     ids in every world, and they are filled **in this order** (K, Q, R, B, N, P).
   - Slot `i` of type `t` is placed on its start square when `i < want[t]` and that square is hidden and empty in
     that view world. Otherwise it stays `OFF`.
     - After step 3 every hidden square is empty, because own pieces are always visible. So only an earlier phantom
       can fill a slot's square: the king, when it had to move (next point).
   - **The enemy king is always placed.** When its start square is visible, it goes to the nearest hidden empty square
     (Chebyshev distance, ties to the lowest square index, a1 = 0 … h8 = 63). Such a square always exists: when the
     real king is not seen, its own square is hidden.
     - Every view world then has exactly one enemy king, so the default `worldResult` does not declare the computer
       the winner.
     - Kings and pawns are solid, so they are seen in every world or in none. The phantom king and the phantom pawns
       therefore stand on the same squares in every view world.
5. Merge identical worlds, summing their weights, which still total T. Sort them by `worldKey`, as `stateAfter`
   does, and return `{ ...state, worlds, history: [], quiet: 0 }`. The real `quiet` would tell the computer whether
   the opponent made an unseen capture or pawn move.

This construction depends only on items 1 to 4 of the contract, so two states that look the same to `me` give views
that are equal as whole objects (vitest `toEqual`), not only by `worldKey`. Section 7 has the no-leak tests: D10,
D14, D15, D17 and the random check of D11.

Why fresh ids (step 2): `worldKey` contains the piece ids, and so do the enemy's replies in the computer's search.
Keeping the real ids of the visible enemy pieces, as `proto.mjs` and the first version do, makes the view tell which
knight stands on e5. On the core this changed no choice in 36 searches (`r2-ids.mjs`: two positions, three levels,
six seeds), but it is a leak by the contract, and it breaks the equality of D17. The visible slots keep everything a
human sees: which type may stand on each visible square in each possibility. They drop only the link between two
visible parts of one enemy ghost, which the board never draws (D-3). The outcomes, rolls and budget checks of own
moves read squares, types and sides, never enemy ids, so the D-5 check of D11 holds with either version. The one
exception is the 64-possibility count of a split, which merges worlds by `worldKey`; that is the split filter above.

The computer's play in the fog is naive by design. It assumes unseen pieces are still at home. A better belief
model can come later, as long as the no-leak tests pass.

### 3.3 `evaluate(w, side)` (optional)

A small vision term: `+2 × (number of distinct move targets of side in w)`. Vision is worth something when you are
blind. `generate` is cached per world and side, so the cost is small. Measured on the core in the working tree over
five mid-game positions (`perf.mjs`), it moved the average think time from 14 to 15 ms at the normal level and from
34 to 76 ms at the hard level. Leave it out if the fuzz test gets slow.

### 3.4 What exists and what is new

State of the working tree at review 2 (the core packages of `handoff/CORE-CHANGES.md` were being built; every item
below was checked in the code and by the tests of section 7).

- **Hooks, enough for this variant:** `hidden`, `visibility` (read by `useVariantGame`), `aiView` (read by
  `chooseMove`), `evaluate` (read by `worldValue`), `recordInfo` (Q9, stored as `record.info`) and `infoText` (U9,
  lines under a history row and in the report box). `applyMiss` (W4) and `unifyWorlds` (W5) come with
  `orthodoxSpec()`. Movement, setup and results come from `orthodoxSpec()` unchanged.
- **Core changes this variant relies on**, all in the working tree: Q1 + W4 (the en passant square is cleared in
  every world after every turn; D13, D13b), Q2 + W5 (castling and en passant never roll; castling rights follow the
  state; D18), Q8 (the quiet counter counts only moves that happened). **No new core change is needed**: the capture
  square of an en passant capture (D-7) is handled by the module's own `recordInfo` and `infoText` (3.5).
- **Shared UI** (section 6, the same as for `kriegspiel`): built in the working tree by package "ai-ui" (U5, U10):
  the fog with the cell's own shade, the hatch and the legend, the two-step hand-over with the side panel covered,
  no danger text, the opponent's budget as "?", undo off while the game runs, and the umpire wording only for
  `umpire` variants. **Still missing:** the board's keyboard focus shows the squares of the side to move's pieces
  also when that side is the opponent (section 6, leak checklist; D12). The module cannot fix any of these with a
  hook.

### 3.5 `recordInfo` and `infoText`: the square of a capture

The opponent's history row names the square where your piece was taken (D-7). `record.captures` holds the square the
capturing piece moved to, which differs for en passant (`d6` instead of `d5`), and other variants rely on that (the
atomic blast marks are centred on it). So the module records the victim squares itself:

```js
recordInfo(prev, code, branch) {
	if (!branch.captures.length) return null
	// en passant is certain (Q2), so it is en passant in every world of prev, with the same victim square
	const b = prev.worlds[0].b
	const m = generate(spec, b, prev.turn).get(code)
	return { taken: m && m.kind === 'ep' ? [b.x.epVictim] : branch.captures.slice() }
},
infoText(record, viewer) {
	if (!record.info?.taken || record.side === viewer) return null
	const squares = record.info.taken.map((s) => nameOf(spec, s)).join(', ')
	return [t('quantumchess', 'Capture on {squares}', { squares })]
},
```

- A merge or split code is not a key of `generate`, so `m` is undefined and the capture squares are used; a merge
  captures on its target, where the victim stood.
- `recordInfo` is not called in the computer's search (light mode), so it costs nothing there.
- The UI as built shows a secret row of a variant with `infoText` as "A move" with these lines under it, and repeats
  the lines in the report box above the move list until the viewer moves again. Own rows get no line.
- Checked on the core in `r2-record.mjs`: en passant gives `info.taken` = [d5] while `captures` = [d6]; a rook
  capture on a5 and a merge capture on g5 give their own squares.

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
- The percentage counts every possibility, including those in which you could not see that square. For example,
  only the f3 part of your 50/50 knight sees e5, and an enemy bishop is 50% on e5: e5 shows "b 50%", not 25%. This
  follows from D-1 and keeps the board one picture.
- The board lists the possible occupants of a square per piece (`squareView` groups by piece id, as in the classic
  game). So when two different enemy knights may each stand on a visible e5, e5 shows two "n 50%" parts, not one
  "n 100%". That tells you they are different pieces, never which ones (the glyph shows the type only). Accepted: it
  describes a visible square. The computer's view does not even get this (3.2, step 2).

**D-3. Own pieces.** You always see all parts of your own pieces with their percentages, and the links among your
own pieces. Lines or threads to enemy pieces are never drawn. (The odds of your own moves can still show that two
visible enemy parts belong together; see D-5.)
- An enemy move can make one of your ghosts collapse: they landed on one of its squares, or measured a piece that
  yours is linked to. You see the collapse. That is information the quantum rules give you, not a leak.

**D-4. Scouting by splitting.**
- Splitting a knight, bishop, rook or queen lets it see from both target squares. Example: 1. Ng1-f3|h3 from the
  start reveals `e5` and `g5` (test D7).
- This is deliberate and fun. The budget of 8 and the 4-square limit keep it in check.
- Split targets are quiet-move targets, and those are always visible. So "both targets certainly empty" can always be
  judged from what you see, and the split rules need no change.
- A merge target must be reachable from both parts, so it is a move target, and it is visible too. Merges need no
  change either.
- A split can also be refused by the limit of 64 possibilities, which counts the opponent's possibilities as well.
  With both budgets at most 8, this limit binds before the budgets only in rare positions, such as two same-type
  pieces swapped between worlds. (Worlds that differ only in castling rights no longer occur: W5 unifies the rights
  after every move.) The refusal then hints that the opponent has many possibilities. This is accepted.

**D-5. Move preview with odds: allowed.**
- The odds preview ("50% Captured / 50% Moved") uses only what the mover can see:
  - Every square on the path of a move that can be played in some world is a move target in that world, so it is
    visible.
  - Every square that blocks the path in one world lies on the path in a world where the move can be played, so the
    first point makes it visible. (A pawn's blocker is not a capture target: it is visible only for this reason.)
  - The target is visible.
  - Whether your own piece is on the from-square is your own information.
  - The solid roll and the game-end roll only split on pieces that the move itself touches, and those are on visible
    squares.
- So the preview reveals nothing about hidden squares, and it stays.
- The summarised notes ("A piece that is always solid was settled", "The game ends: …") are safe too.
- What the preview can show beyond the board: how the visible squares hang together across possibilities. For
  example, a rook that slides past one 50% knight part to capture another gives 50% Missed / 50% Captured when both
  parts are the same knight. With two unlinked knights it gives 50% Missed / 25% Moved / 25% Captured. This is
  information about visible squares only, and it is allowed.
- Checked on the core in the working tree: in random games, every legal move gives the same outcomes, `rolled`
  flags and follow-up rolls in the real state as in the computer's view (3.2), which holds no hidden enemy piece
  (D11, section 8.2).

**D-6. No check, no warning.** The king-danger text and ring are **not shown** in Fog of War. The move
confirmation "safety net" is **off** (the variants UI has none today). Both are computed from hidden pieces, and the
chess.com rules tell nobody about check.
- The classic "your king cannot escape" loss (docs/rules.md, section 5) does not apply either. It is not one of the
  shared variant rules (docs/variants.md), the variants core has none, and it would announce a forced capture. The
  game ends only when a king is captured, or by a draw rule of 2.7.

**D-7. Opponent's moves.**
- The opponent's last move is not highlighted, and their roll box is hidden (already true: `hideLast`).
- While the game runs, a history row of the opponent shows only "A move". When they captured one of your pieces, the
  line "Capture on X" stands under it (and in the report box until you move). A split, merge or Measure of the
  opponent is also "A move".
- X is **the square where your piece was taken**. That square tells you nothing new: your piece vanished from it,
  and for every capture except en passant the capturer now stands there.
  - En passant: the line says "Capture on d5", where your pawn stood.
  - `record.captures` holds the square the capturing pawn moved to (`d6`), and the UI's default secret row prints
    it. That would tell the victim the capturer's square and that the capture was en passant, which chess.com does
    not say. The module's `recordInfo` and `infoText` (3.5) give d5; with `infoText` the UI no longer prints
    `record.captures` in a secret row.

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
3. The next player sees their own fogged view, and "A move" / "Capture on X" for the opponent's move (D-7).

Exactly (built in the working tree by U10 f, section 6):
- **Step 1:** the viewer is the side that just moved (`history.at(-1).side`), not `state.turn`. The board shows that
  side's visibility in the new state and cannot be clicked.
- **Step 2:** nothing belonging to either side is shown. This means the board and also the side panel: no move
  list, no budget pips, no danger text and no roll box. Only the curtain's button works.
- In both steps, and while the computer thinks, nothing of the side to move may reach the screen either: no
  selectable or keyboard-focusable squares of its pieces (section 6, leak checklist).
- A move that ends the game skips both steps: the result and the whole board are shown (D-10).

**D-12. Against the computer.** The human's view is shown at all times, including while the computer thinks. The
computer follows 3.2.

**D-13. Undo** is disabled while a hidden-information game is running. In pass & play it would show the side that
moved last to the other player. Against the computer it would let you see a result and take it back. It comes back
when the game has ended.

**D-14. Draws.** The shared rules apply (section 2.7). The 50-move counter does depend on hidden information: an
unseen capture or pawn move of the opponent resets it. As on chess.com, the draw is automatic and can come without
warning, so the UI does not show the counter while the game runs (it shows none today), and the computer's view
does not carry it (3.2). The end of the game is announced to both players.

**D-15. The en passant window in the quantum game.** Pawns are solid, so a double step happens in every possibility
or in none, and en passant is offered in every possibility or in none.
- The window closes after the other side's next turn, **whatever that turn is**: an ordinary move (also in the
  possibilities where it missed), a split, a merge or a Measure.
- After that turn nobody sees the passing pawn through rule 3 of 2.6, and nobody can take it en passant.
- This is core change Q1 + W4, now in the working tree (`orthodoxSpec().applyMiss`). Without it a Measure, or a
  miss in some possibilities, kept the window open there: after `d2-d4` and two Measures Black could still play
  `e4-d3` and still saw d3 and d4. Tests D13 (Measures) and D13b (a linked miss) check it.
- Q2 alone would not be enough (checked without `applyMiss`, `r2-noapplymiss.mjs`): after two Measures the stale
  square is in every possibility, so `e4-d3` stays legal; after the linked miss of D13b it is in some possibilities
  only, so Q2 makes `e4-d3` illegal, but visibility reads `generate` per world and still shows d3 and d4.

**D-16. Castling in the quantum game.** The fog changes nothing here. Castling follows the shared rule
(`handoff/CORE-CHANGES.md`, decision D1, items Q2 and W5, now in the working tree; docs/rules.md section 5).
- Castling is legal only when it is possible in every possibility, and it never rolls. An enemy ghost part that
  might stand between king and rook makes it illegal (test D18).
- A right is lost as soon as the king or that rook is not 100% on its start square.
- Everything castling depends on is visible to the castling side, in every possibility. Castling needs the squares
  between king and rook empty. Seen from the rook, the empty squares along that line are rook move targets. The
  first occupied square is either a capture target (an enemy piece) or holds an own piece, and both are visible.
- So whether castling is possible in a possibility depends only on visible squares and own pieces. The legality check
  and the preview of a castling move leak nothing. Tests D5 are single-possibility positions; D18 is the quantum
  case.

---

## 5. Player-facing rules text (rules card)

1. You see only your own pieces and the squares they could move to. Everything else is hidden in fog.
2. An enemy piece shows up only on a square you can see, with its chance. A ghost part in the fog stays hidden.
3. A ghost sees from every square it might be on, so splitting a piece also lets you look further.
4. A dark square right in front of your pawn means something is standing there.
5. En passant shows you the passing pawn for that one turn only.
6. There is no check and nobody warns you: you win by capturing the king, and your own king can be taken by a piece
   you never saw.
7. You may move into attack and castle out of, through or into attack. There is no stalemate: if every move is
   dangerous, you must still make one.
8. In pass & play each player sees only their own view: hand the device over when asked. Undo is off until the game
   ends, and then the whole board is revealed.

---

## 6. UI layout

- **Board:** the standard 8 × 8 layout of `rectTopology`. Light and dark squares, file letters `a`–`h` along the
  bottom and rank numbers `1`–`8` along the left side. White is at the bottom. In pass & play the board turns
  towards the viewer: the mover during step 1 of the hand-over, then the side to move (`viewer` in
  `useVariantGame.js`, as built).
- **Glyphs:** the cburnett sprites for all six orthodox pieces. No new glyphs. Ghost parts are faded with a
  percentage badge, as everywhere.
- **Layout API:** nothing new. `rectTopology(8, 8)` gives the cells, and `VariantBoard` already takes a `hidden` set
  and a `viewer`. The fog is only CSS in `VariantBoard.vue`.
- **Fog** (`hiddenStyle: 'fog'`, the default of U10 c; all built in the working tree):
  - Hidden squares keep their light/dark contrast but are drawn clearly darker and desaturated: 60% of a neutral
    slate `#5b6472` over the cell's own shade (`.qc-vboard__cell--fog`, with a separate rule for dark cells).
  - A fine 45° hatch at 20% opacity, so hidden squares are not told apart by colour alone.
  - Each hidden square's accessible name is "e5: hidden".
  - A one-line legend under the board: "Fog: squares you cannot see."
- **Visible squares** look exactly like a normal board.
- **Side panel** (built):
  - Own budget pips; "?" for the opponent (D-8), with the tooltip "Quantum budget: unknown" instead of the numbers.
  - No king-danger text (D-6). Rule for the UI: no danger text when `V.hidden` (Kriegspiel shows its own check
    announcement instead).
  - The move preview with odds works as in other variants (D-5).
  - The history shows "A move" for the opponent during the game, with the line "Capture on X" under a capture (D-7,
    through the module's `infoText`, 3.5).
- **Hand-over** (D-11), in two steps (built):
  1. A "Your move: {result}" box (the code and the outcome, for example "e2-e4 · Moved"), with the roll box below it
     when the move was rolled, and a "Pass the device" button. The board stays in the mover's view and cannot be
     clicked.
  2. The curtain with "I am {side}: show my board". It covers the side panel too: the panel is not rendered.
- **Undo** is disabled until the game ends (D-13).
- **After the game:** no fog. All pieces and the full history (codes and odds) are shown.

**Leak checklist for the UI** (to verify when implementing; status in the working tree at review 2):

- `pieceAt(sq)` in `useVariantGame.js` must only ever return a piece of the side to move, so selecting a square never
  marks the parts of an enemy ghost as "part". Built (U10 a, `sidePieceAt`). (This is defensive: in 3,474 random
  positions no square held a piece of one side in some possibilities and a piece of the other side in others. Land =
  roll prevents it, but nothing checks it.)
- `danger` must not be rendered for darkchess. Built (never computed while a hidden game runs).
- The opponent's budget must not be rendered, not even in a tooltip. Built.
- No "possibilities" / what-if panel may show full worlds while the game runs. None exists.
- The side panel must be covered while the curtain is up (D-11). Built.
- The notice for a refused move says "The umpire says: …" only for `umpire` variants (Kriegspiel). In darkchess the
  notice can appear, for example when a split pair breaks the budget, and must read "That move is not possible."
  Built (`refusalKind` in `panel.js`).
- The opponent's secret row must not print `record.captures` (the en passant landing square). Built for variants with
  `infoText` (D-7, 3.5).
- **Not built yet: keyboard focus.** `VariantGameView.vue` makes every from-square of `game.moves` focusable
  (`tabindex="0"`), and `game.moves` are the legal moves of `state.turn`. While the computer thinks, during step 1
  of the hand-over and under the curtain, `state.turn` is the opponent of the person looking at the screen, so the
  Tab key visits (and draws a focus ring on) the squares of the opponent's movable pieces, hidden squares included.
  Fix: in a running hidden game, `focusable` holds squares only while `isHumanTurn` and neither the hand-over nor the
  curtain is shown (the same guard as the target marks). Test D12.

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
  - Black's visibility (36) now includes **e4** (the capture `d5-e4`), d4 (the step `d5-d4`), and g4 and h3
    (bishop c8). Those four are its only squares on ranks 1–4.

**D3. A blocked pawn leaves a dark square.** One world: `{ e1:'0:k', e4:'0:p', e8:'1:k', e5:'1:p' }`, White to move.
- `visibility(·,0)` = exactly {d1, e1, f1, d2, e2, f2, e4}. `e5` is hidden.
- White's legal moves are the 5 king steps. The pawn on e4 has no move.

**D4. En passant window.** One world `{ e1:'0:k', e5:'0:p', e8:'1:k', d7:'1:p' }`, Black to move. Play `d7-d5`.
- White's visibility = {d1, e1, f1, d2, e2, f2, **d5**, e5, **d6**, e6}.
- `e5-d6` is legal: 1 outcome, `capture`. Afterwards `d5` is empty.
  - The record (`history.at(-1)`) has `captures` = [d6], the square the capturing pawn moved to (core as built), and
    `info` = `{ taken: [d5] }` from the module's `recordInfo` (3.5), the square where the captured pawn stood.
  - `infoText(record, 1)` = `['Capture on d5']` and `infoText(record, 0)` = null. Black's row for this move reads
    "A move" with the line "Capture on d5" (D-7).
  - Black's visibility is then exactly {d7, e7, f7, d8, e8, f8}. Black sees its pawn gone but does not see the White
    pawn on d6.
- In `aiView(·, 0)` of the state after `d7-d5`, the world keeps `x.ep` = d6, and `e5-d6` has one outcome, `capture`
  (White can capture en passant, so it may know the square).
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
- Out of, through and into attack: one world `{ e1:'0:k', a1:'0:r', h1:'0:r', c8:'1:r', d8:'1:r', e8:'1:r',
  h8:'1:k' }`, White to move, with the White rights `K` (as above) and `{ flag:'Q', side:0, king:e1, rook:a1,
  kingTo:c1, rookTo:d1 }`. The king stands in check from e8, d1 and c1 are attacked, and still both `O-O` and
  `O-O-O` are legal (1 outcome, `move`).
- With a White knight added on b1, `O-O-O` is illegal (b1 lies between king and rook).

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
  - `aiView(A,0)` and `aiView(B,0)` are **deep-equal** (`toEqual`: the same worlds, piece arrays included, with
    the same weights, in `worldKey` order).
  - In state C, Black plays `d7-d5` (visible to White via e4xd5): `aiView(C,0)` differs from `aiView(A,0)`.
- For every view, check:
  - the weights sum to T;
  - every world has exactly one Black king and all of White's pieces as in reality;
  - no enemy piece stands on a square that is visible to White, unless it really might be there.

**D11. View invariants in random games.** The generic `fuzz.spec.js` covers darkchess automatically through
`VARIANT_IDS`. The checks below are specific to darkchess (they do not hold in Kriegspiel), so they go into
`tests/js/variants/darkchess.spec.js`: three seeded random games of 60 plies with random outcomes, and a split
instead of an ordinary move in about a quarter of the plies (about 20 ms per position on the core, so about 4 s).
For each state:
- every legal ordinary move's `to` square is in `visibility(state, state.turn)`;
- every own-piece square is visible;
- `aiView(state, state.turn)` sums to T and has exactly one enemy king in every world;
- **D-5 mechanically:** for every legal move (ordinary, measure, merge, and up to three splits per splittable
  piece), `branches` gives the same keys, weights and `rolled` flags in the real state as in
  `aiView(state, state.turn)`. Notes are compared by kind (`solid`, `end:…`), since the text of a `solid:` note
  lists pawn squares;
- every move of `legalMoves(V, aiView(state, state.turn))` (ordinary moves, measurements, merges) that is illegal in
  the real state is a pawn move whose target, or (for a double step) whose first square, is hidden (3.2);
- every move of `legalMoves(V, state)` is legal in `aiView(state, state.turn)` (so `chooseMove` never runs out of
  candidates);
- no square holds a piece of one side in some possibilities and a piece of the other side in others.

On the core in the working tree (with Q1-Q14 and W1-W7) these held in 40 games of up to 100 plies (`r2-fuzz.mjs`, with
the view of 3.2 including fresh ids): 3,474 positions, up to 64 possibilities, 207,952 move codes compared, 1,952
filtered moves, all of them pawn moves onto or through a hidden square. The split lists of every splittable piece
were also identical in the real state and in the view (no split was filtered).

**D12. UI (component test of `VariantGameView`, optional).** A darkchess game against the computer:
- The opponent's budget renders as "?" with the tooltip "Quantum budget: unknown"; no pip element and no number of
  the opponent's budget is in the DOM.
- The danger text is absent even when `royalDanger > 0`.
- Undo is disabled while `state.result` is null.
- After the result is set, no cell has the fog class.
- A refused split (the pair breaks the budget) shows "That move is not possible.", without the word "umpire".
- While the computer is to move, no board cell has `tabindex="0"` (fails on the UI as built, section 6).

A darkchess game in pass & play:
- After White's move the board still shows White's view (viewer 0), with the "Your move" box, and no cell has
  `tabindex="0"`.
- After "Pass the device" the curtain covers the board and the side panel: no move list, no budget pips, no cell
  with `tabindex="0"`.
- After "I am Black: show my board" the viewer is 1, and the focusable cells are exactly the from-squares of Black's
  legal moves.

**D13. Quantum: the en passant window closes after any turn (Q1 + W4).** Four worlds, 1:1:1:1: every
combination of a White knight on f3 or h3 and a Black knight on f6 or h6. All four also hold `{ e1:'0:k', e8:'1:k',
d2:'0:p', e4:'1:p' }`. The pieces are listed in the order e1, e8, d2, e4, White knight, Black knight. White to move.
- `d2-d4`: 1 outcome, `move`. Black's visibility now has 19 squares: {d3, e3, f3, d4, e4, g4, d5, f5, h5, f6, h6,
  d7, e7, f7, h7, d8, e8, f8, g8}. `e4-d3` is `[capture 1]`.
- Black plays `?f6` (outcome `f6`, 50%). White is to move. Black's visibility is exactly {e3, f3, e4, g4, d5, h5, f6,
  d7, e7, f7, h7, d8, e8, f8, g8} (15): d3 and d4 are hidden again.
- White plays `?f3` (outcome `f3`, 50%). Black is to move. `e4-d3` is illegal (null), and Black's visibility is the
  same 15 squares.
- These pass on the core in the working tree. Without `applyMiss` (the core before Q1 + W4) the last two points
  fail: `x.ep = d3` survives the Measures, Black still sees d3 and d4, and `e4-d3` is still `[capture 1]`.

**D13b. Quantum: the window also closes where the next move missed.** The start of D13, then `d2-d4`.
- Black plays `f6-g4`: 1 outcome, `move`, not rolled (g4 is certainly empty, so the worlds with the knight on h6
  are linked, pass = link).
- Every world now has `x.ep` = `x.epVictim` = -1. Black's visibility (White to move) is exactly {f2, h2, e3, f3, e4,
  g4, e5, f5, f6, h6, d7, e7, f7, d8, e8, f8, g8} (17): d3 and d4 are hidden.
- White plays `f3-g5` (1 outcome, `move`). Black's visibility is exactly {f2, h2, e3, e4, g4, e5, f5, f6, h6, d7, e7,
  f7, d8, e8, f8, g8} (16), and `e4-d3` is illegal (null).
- Without `applyMiss` (Q2 alone) `e4-d3` is also null here, because the stale square is left in some possibilities
  only, but d3 and d4 stay visible to Black after both moves (`r2-noapplymiss.mjs`). That is why visibility needs
  W4, not only Q2.

**D14. Quantum: the computer's view does not depend on the order of the worlds.** State P has two worlds, 1:1:
- P1 = `{ a1:'0:k', e1:'0:r', h8:'1:k', e5:'1:n', c8:'1:b' }`;
- P2 = `{ a1:'0:k', e1:'0:r', h8:'1:k', g8:'1:n', e5:'1:b' }`.

State Q is the same with c8 and g8 swapped:
- Q1 = `{ a1:'0:k', e1:'0:r', h8:'1:k', e5:'1:n', g8:'1:b' }`;
- Q2 = `{ a1:'0:k', e1:'0:r', h8:'1:k', c8:'1:n', e5:'1:b' }`.

White to move in both.
- White's visibility is {a1–h1, a2, b2, e2, e3, e4, e5} in both. On e5 it shows "n 50%" and "b 50%".
- `e1-e5`: 1 outcome, `capture`, with captures on e5.
  - One world loses the knight and the other loses the bishop.
  - The surviving piece stands on c8 or g8, which are hidden.
- Black plays `h8-g7` (1 outcome) in both. White's visibility is then the same in P and Q: {a1, b1, e1, a2, b2, e2,
  e3, e4, a5–h5, e6, e7, e8}.
- `aiView(P, 0)` deep-equals `aiView(Q, 0)`, with two worlds of weight T/2:
  - one world has the phantom knights on b8 and g8 and one phantom bishop on c8;
  - the other has one phantom knight on b8 and the phantom bishops on c8 and f8;
  - in both, the phantom king stands on d7: e8 is visible, and d7 is the nearest hidden square with the lowest
    index.
- The first prototype (`handoff/tools/hid/ai2.mjs`) counts `alive` in the first world only, so its views of P and Q
  differ. The first world of P lost the bishop, and the first world of Q lost the knight.

**D15. Quantum: moving the hidden part of an enemy ghost changes nothing you can see.** State A is D8's state. State B
is the same with the knight's second part on g6 instead of h5: `{ a1:'0:r', e1:'0:k', e8:'1:k', a5:'1:n' }` /
`{ a1:'0:r', e1:'0:k', e8:'1:k', g6:'1:n' }`, 1:1. White to move.
- `visibility(A,0)` equals `visibility(B,0)`. This is the D8 set; h5 and g6 are hidden.
- `legalMoves(V, ·, { splits: true })` gives the same 51 codes in A and B: 15 ordinary moves and 36 splits. For every
  code, `outcomes` are equal in keys, probabilities, `rolled` flags and notes.
- `aiView(A,0)` deep-equals `aiView(B,0)`.

**D16. A promotion in the fog.** One world `{ e1:'0:k', a7:'0:p', h8:'1:k' }`, White to move.
- Black's visibility = {g7, h7, g8, h8}.
- `a7-a8=q`: 1 outcome, `move`.
- Afterwards Black's visibility is still exactly {g7, h7, g8, h8}. a8 is hidden, so Black does not see the queen, and
  Black's history row is "A move".
- `royalDanger(·, 1)` = 1 (the queen covers h8 along rank 8), and still Black's UI shows no danger (D-6).
- White's visibility contains b8–h8, so White sees the Black king on h8.

**D17. The computer's view does not know which of two same-type pieces it sees.** One world each, White to move:
P = `{ a1:'0:k', e1:'0:r', h8:'1:k', e5:'1:n', b8:'1:n' }` and Q = `{ a1:'0:k', e1:'0:r', h8:'1:k', b8:'1:n',
e5:'1:n' }` (the same position; the knight on e5 has id 3 in P and id 4 in Q).
- `visibility(P,0)` equals `visibility(Q,0)`: e5 is visible (the rook can capture there), b8 is not.
- `aiView(P,0)` deep-equals `aiView(Q,0)` (`toEqual`), because the visible knight gets the id of its visible slot
  (3.2, step 2). A view that keeps the real ids differs here (it did in the first prototype).

**D18. Quantum: castling past a possible enemy ghost.** Two worlds, 1:1, White to move, both with the White right
`{ flag:'K', side:0, king:e1, rook:h1, kingTo:g1, rookTo:f1 }`:
- A = `{ e1:'0:k', h1:'0:r', e8:'1:k', f1:'1:n' }`;
- B = `{ e1:'0:k', h1:'0:r', e8:'1:k', d6:'1:n' }`.

Checks:
- `O-O` is illegal (null) and not in `legalMoves`: it is not possible in A (D-16, Q2).
- White's visibility = {d1, e1, f1, g1, h1, d2, e2, f2, h2–h8}. f1 is visible (a capture target of the king and the
  rook in A, a move target in B) and shows "n 50%" (`squareView(f1)` = one Black knight, p 0.5).
- `h1-f1`: `[move 0.5, capture 0.5]`, rolled.
- In `aiView(·, 0)`, `O-O` is illegal too: the view keeps the visible knight part on f1.

---

## 8. Review notes

### 8.1 Source review

Reviewer lens: rules fidelity. Every source was opened directly this time: chessvariants.com refuses scripts
(HTTP 403), so its pages were read from Wayback Machine snapshots. Every classical expectation in section 7 (D1–D9,
the visibility part of D10, and the new D5 cases) was re-run on the real variant core with the section 3.1
visibility function, and all of them hold. The scratch scripts are `handoff/tmp/rev-dark/check.mjs`, `check2.mjs`
and `check3.mjs` (git ignores them). The older `handoff/tools/hid/*.mjs` prototypes import from `/home/user/...`
and need their paths changed before they run on this machine. Other core checks also passed: castling rights are
lost for good when the rook moves away and back; all four promotion choices are offered; the en passant window
closes after one move; the quiet draw comes at exactly 100 plies.

Changes:

1. **Section 1, Chess Variant Pages row: rewritten, it was wrong.** The spec said both pages give "the same rules",
   and that they say the host enforces the repetition and 50-move draws. In fact:
   - `darkness.html` gives the original 1989 rules. Pieces see the squares they attack (after e2-e4 the pawn sees
     d5, e5 and f5), en passant was "discarded", and the king may jump over an attacked square when castling.
   - `fog_of_war_chess.html` is a different game by William Lee Sims, with check, pawns that see three squares, and
     insufficient-material draws.
   - The draw sentence comes from Gehnen and Stannat, not from these pages.

   Sources: https://web.archive.org/web/20250320102116/https://www.chessvariants.com/incinf.dir/darkness.html,
   https://web.archive.org/web/20241102135831/https://www.chessvariants.com/other.dir/fog_of_war_chess.html,
   https://arxiv.org/html/2601.18813.
2. **Section 1, chosen rule set: corrected.** It said chess.com's rules are "the Nielsen/Osted dark chess rule set".
   They are its modern form, and the 1989 original differs (see change 1). The claim that "the sources agree on
   everything" is now limited to the modern sources. The rejected differences are named: the 1989 rules, and
   pychess, where the en passant victim stays hidden. Sources: as in change 1, and
   `handoff/ext/Fairy-Stockfish/src/position.h` (`fog_area`: own pieces plus legal move targets only).
3. **Section 1, draw rules: made exact, with one deviation stated.** Chess.com (per Zhang and Sandholm, Appendix A)
   draws automatically by threefold repetition and by the 50-move rule. It has no stalemate draw ("Stalemate is a
   forced win for the stalemating player") and no insufficient-material draw. The spec had said the sources "only
   say that the host enforces the usual draws", and it did not mention repetition. Threefold repetition is now
   listed as a **known deviation**: the variants core has no repetition rule. "No legal move = draw" is marked as
   the shared default, which pychess also uses (Fairy-Stockfish `stalemateValue = VALUE_DRAW`); chess.com documents
   no rule for this case. Sources: https://arxiv.org/html/2506.01242 (Appendix A),
   https://www.chess.com/terms/fog-of-war-chess, `handoff/ext/Fairy-Stockfish/src/variant.h`.
4. **Section 1, bare-kings bullet: reasoning fixed.** It said "neither player can see the other king". That is not
   always true: an adjacent enemy king is a capture target, so it is visible. The rule itself stays: no
   insufficient-material draw, and even K vs K is not an immediate draw. Source: https://arxiv.org/html/2506.01242
   (Appendix A and E.8).
5. **Section 1, chess.com row:** "Added to chess.com in September 2020" is not supported. Wikipedia only says it
   was chess.com's most popular variant in September 2020. Added the exact quotes on castling in check, on
   stalemate, and on seeing captures and promotions. Sources:
   https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess,
   https://www.chess.com/terms/fog-of-war-chess, https://en.wikipedia.org/wiki/Dark_chess.
6. **Section 1, Wikipedia row:** added the server differences it lists. On chess.com a pawn does not see what is in
   front of it, and promotions stay unknown. Before 5 November 2021 chess.com showed the en passant square but not
   the pawn. Source: https://en.wikipedia.org/wiki/Dark_chess.
7. **Section 1, new rows:** Zhang and Sandholm (the full chess.com rule text, now cited by its real title) and
   pychess / Fairy-Stockfish (the only open-source implementation; it confirms "castling through attack is legal"
   because the king is not royal, and "fog = own pieces + legal move targets"). Sources:
   https://arxiv.org/html/2506.01242, `handoff/ext/pychess-variants/variants.ini` (`[fogofwar:chess]`),
   `handoff/ext/Fairy-Stockfish/src/position.cpp` (`legal`: "Non-royal pieces can not be impeded from castling").
8. **Section 1, Lichess row:** the claim "the developers have said they plan no new variants" could not be verified.
   The linked thread holds no staff reply. It is replaced by the scalachess variant list, which has no fog-of-war
   variant. Sources: `handoff/ext/scalachess/core/src/main/scala/variant/Variant.scala` (`list.all`),
   https://lichess.org/forum/lichess-feedback/adding-the-fog-of-war--dark-chess-chess-variant-to-lichess.
9. **Section 2.4, en passant:** now says who may capture (a pawn that attacks the skipped square, standing next to
   the passing pawn) and how the move is written (`e5-d6`). **Castling:** the right is also lost when the rook is
   captured on its start square (as `orthodoxAfterMove` does). The no-attack-condition rule now cites its sources.
   Sources: https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess, https://arxiv.org/html/2506.01242.
10. **Section 2.5, promotion:** cites the chess.com wording on who sees a promotion. Source:
    https://www.chess.com/terms/fog-of-war-chess.
11. **Section 2.6, visibility:** move targets are worked out as if the viewer were to move, also during the
    opponent's turn ("after every move, each player observes all squares onto which her pieces can legally move").
    The vague "no hidden capture" is replaced by the chess.com rule: you see your piece vanish, but you see the
    capturer only if another piece of yours can capture on that square. Sources: https://arxiv.org/html/2506.01242,
    https://www.chess.com/terms/fog-of-war-chess.
12. **Section 2.7:** added the explicit "no stalemate" rule, the automatic 50-move draw (which also counts unseen
    moves) and the threefold-repetition deviation. Sources: as in change 3.
13. **Section 3.2 (items 4 and step 4) and D-14:** `quiet` is not public in Fog of War. An unseen capture or pawn
    move resets it, and chess.com's automatic draws can come "without either player knowing for certain". D-14 had
    said nothing about draws depends on hidden information. The computer's view now returns `quiet: 0`, and the UI
    must not show the counter. Source: https://arxiv.org/html/2506.01242 (Appendix A).
14. **D-5:** "every square that blocks a path is a capture target" is false for a pawn step, because a pawn cannot
    capture forward. The argument now rests on the first point: such a square lies on the path in a world where the
    move is played, so it is a move target there. The conclusion (the preview leaks nothing) is unchanged.
15. **Section 5, rules card:** added item 7: moving into attack and castling out of, through or into attack are
    allowed, and there is no stalemate. These are the classical rules a chess player would otherwise get wrong. The
    card now has 8 items, the maximum. Sources: https://support.chess.com/en/articles/8708650-what-is-fog-of-war-chess,
    https://www.chess.com/terms/fog-of-war-chess.
16. **Section 7:**
    - D2: the Black squares on ranks 1–4 are now attributed to the right pieces (d4 is the step `d5-d4`, not the
      bishop).
    - D4: states that the core records the en passant capture on `d6` (the notation square) and that `d5` is empty
      afterwards.
    - D5: new cases for castling out of check, through attack and into attack (`O-O` and `O-O-O` both legal), and
      for `O-O-O` blocked by a piece on b1.

    All values were computed on the real core.

Checked and unchanged: the board and square names (a1 dark, `rectTopology(8, 8)`), the setup, the movement of all
six pieces, the double step, promotion to Q/R/B/N, White moving first, capture-the-king, and rules card items 1 to 6
and 8.

### 8.2 Engine review

Reviewer lens: engine and quantum consistency. This review ran twice. The first pass (8.2.1) worked on the core as
it was before the packages of `handoff/CORE-CHANGES.md`. The second pass (8.2.2) re-ran every test on the core in the
working tree, where most of those packages had landed, and fixed what had changed. **The lists "Core changes needed"
and "Shared UI changes needed" at the end of 8.2.2 replace those of 8.2.1.**

#### 8.2.1 First pass

I read `IMPLEMENTING.md`, `CONTRACT.md`, the core
(`quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`), `docs/rules.md`,
`docs/variants.md`, and the UI that the spec relies on (`useVariantGame.js`, `VariantGameView.vue`,
`VariantBoard.vue`). `handoff/CORE-CHANGES.md` appeared while I worked, and the core-change lists below are aligned
with it.

**Method.** I built the section 3.1 and 3.2 hooks as a prototype on the real core:
`handoff/tmp/critic-darkchess/proto.mjs`. With it I re-ran every test and wrote new ones (`check.mjs`, `final.mjs`),
plus a random-game check (`fuzz.mjs`). All of these are scratch and not in git.
- Tests D1–D9 and the visibility part of D10 still hold as written.
- The whole of D10 holds with the reviewed `aiView`.
- The random check covered 40 games of up to 100 plies with random outcomes and splits: 3,592 positions and 222,807
  move codes.
  - Every legal move had the same outcomes, `rolled` flags and follow-up roll kinds in the real state as in the
    computer's view, which holds no hidden enemy piece. This confirms the D-5 claim mechanically.
  - All 1,832 moves that were legal only in the view were pawn moves onto or through a hidden square.
  - No square ever held a piece of one side in some possibilities and a piece of the other side in others.

Changes:

1. **Header:** the `handoff/tools/hid` prototypes import from `/home/user/...`. `ai2.mjs` also has the first-world
   bug of change 3. The header now says so and points to the reviewed prototype.
2. **3.1:** "the en passant window closes by itself after one move" is false on the core as built. A Measure, or a
   move that missed in some possibilities, leaves `x.ep` set in those worlds. The passing pawn then stays visible,
   and in test D13 it can still be taken en passant two turns late. The rule now depends on the planned core change
   Q1 + W4. New decision D-15 and new test D13.
3. **3.2, `alive`:** it is now counted in every real world, before the hidden pieces are removed. The prototype
   counted it in `state.worlds[0]` only. One capture can take a knight in one world and a bishop in another, and the
   world order depends on hidden squares. So the computer's view changed when only hidden squares changed, a leak
   the D10 test cannot catch. New test D14 fails with the first-world count and passes with the per-world count.
4. **3.2, phantoms:** the filling order (K, Q, R, B, N, P) and the square index used for ties are now given. It now
   says that every hidden square is empty after step 2 and that a hidden square for the king always exists. The
   phantom king and phantom pawns are the same in every view world, so the view keeps the solid-piece invariant.
   The sort by `worldKey` in step 4 is now required, which the deep-equal tests rely on.
5. **3.2, the `chooseMove` filter:** "this filter only removes impossible phantom captures" was incomplete. It
   removes pawn captures of phantoms and also pawn pushes onto or through a hidden square, where the view removed
   the real blocker. A human knows both are impossible, so the filter adds no knowledge. Confirmed by the random
   check.
6. **3.3:** added the measured cost of the vision term: the hard level went from 42 to 79 ms on average. It stays
   optional.
7. **New 3.4:** lists which hooks exist and are enough (`hidden`, `visibility`, `aiView`, `evaluate`), which core
   changes are needed (planned Q1 + W4, Q2 + W5, Q8; new C-2), and which shared UI changes no hook can make.
   `hiddenStyle` is marked as a UI flag, not a core hook.
8. **D-2:** the percentage on a visible square counts every possibility, including those in which the square is
   not visible. This follows from D-1 and `squareView`, but was not written down.
9. **D-3 and D-5:** the preview does not reveal hidden squares, but it can reveal how visible squares hang together
   across possibilities. For example, it shows whether two visible 50% knight parts are one piece: 50/50 against
   50/25/25, checked on the core. This is now stated and allowed. The random-game confirmation of D-5 was added.
10. **D-4:** merge targets are move targets, so they are visible too. A split can in rare cases be refused by the
    64-world limit, which counts the opponent's possibilities; this small leak is accepted. The limit binds before the
    budgets only through two same-type pieces swapped between worlds, or worlds that differ only in castling rights
    (the planned W5 removes those).
11. **D-6:** the classic "king cannot escape" loss (docs/rules.md, section 5) does not apply here. It is not a
    shared variant rule, the core has none, and it would announce a forced capture.
12. **D-7 and D4:** the opponent's capture row names the square where your piece was taken, which is d5 for en
    passant. The core as built records the capturer's target, d6. That tells the victim the capturer's square and
    that it was en passant, which chess.com does not say. Needs core change C-2. D4 now also gives Black's
    visibility after the capture: Black does not see the pawn on d6.
13. **D-11:** the hand-over is now exact. In step 1 the viewer is `history.at(-1).side`, not `state.turn`, and the
    board cannot be clicked. In step 2 the side panel is covered too. Today the curtain covers only the board, and
    the panel keeps showing the next player's move list and budget while the previous player holds the device. A
    move that ends the game skips both steps. Step 3 said the opponent's move reads "Black moved"; it now reads "A
    move", as D-7 says.
14. **New D-15 (en passant) and D-16 (castling):** D-15 says when the window closes in every possibility, whatever
    the next turn is (needs Q1 + W4). D-16 shows that everything castling depends on is visible, so it leaks nothing
    under whichever castling rule the core settles on. The core as built rolls castling when a ghost may block it,
    while docs/rules.md says castling never rolls; the plan's decision D1 (Q2, W5) settles it in favour of
    docs/rules.md.
15. **Rules card:** item 2 now says an enemy piece is shown "with its chance" (D-2). Item 8 now says that undo is
    off until the game ends (D-13), which a player would otherwise meet unexplained. The card still has 8 items.
16. **Section 6:** added that the layout API needs nothing new. The fog CSS as built mixes every hidden square from
    the dark shade, which loses the light/dark contrast the spec asks for. The danger rule is now "no danger text
    when `V.hidden`". The budget tooltip must be hidden too. New leak-checklist items: the panel under the curtain,
    and the "The umpire says" notice. That notice is shown today for every hidden variant, and in darkchess it can
    appear after a split pair that breaks the budget. The `pieceAt` item is marked as defensive.
17. **Section 7:**
    - D11 is now a darkchess spec test, because its checks do not hold in Kriegspiel. It adds the mechanical D-5
      check and the filter check, and gives the size and time: 3 games, about 3 s.
    - D12 adds the notice wording, the tooltip and the pass & play hand-over steps.
    - New tests: D13 (en passant window after Measures), D14 (the view does not depend on world order), D15 (moving a
      hidden ghost part changes no visibility, move list, preview or view) and D16 (a promotion in the fog, danger 1
      but not shown).
    - Every new or changed number was computed on the real core. D13 and the D4 capture square are given as they
      must be after Q1 + W4 and C-2, and the core as built is stated beside them.

Checked and unchanged:
- The engine mapping of section 3 against the hooks as built. `hidden`, `visibility` and `aiView` are read by the
  UI and by `chooseMove`, and `evaluate` by the computer player.
- Movement, setup and results come unchanged from `orthodoxSpec()`, with no check and castling without attack
  conditions, as the core already does.
- D-1, D-8 to D-10 and D-12 to D-14.
- The solid roll and game-end roll: they only split on pieces the move touches, and those are visible.
- The budget: it counts only one's own arrangements, and the opponent cannot raise it.
- The world bound; the layout.

**Core changes needed (first pass; superseded by 8.2.2)**

Already planned in `handoff/CORE-CHANGES.md`, and needed as planned:
- **Q1 + W4 (decision D2): en passant expiry.**
  - Every idle world goes through `orthodoxSpec().applyMiss`, which clears `x.ep` and `x.epVictim`. Idle worlds are
    those where the move missed, a split or merge child that did not move, and every world of a Measure.
  - After any turn, `x.ep >= 0` then holds in a world only if this very turn was a double step played in that world.
  - Needed by rule 3 of 2.6 (3.1), D-15 and test D13.
  - A variant hook cannot do it on today's core. `afterMove` runs only inside `applyClassical`, and the quantum layer
    calls no variant code for idle worlds. A world does not know the ply, so `generate` cannot tell a stale square
    from a fresh one.
- **Q2 + W5 (decision D1): castling and en passant never roll, and castling rights follow the state.** D-16 states
  the rule. The fog argument of D-16 holds under either rule.
- **Q8: the quiet counter counts only moves that really happened.** D-14 stays true.

New, not in the plan:
- **C-2. Record a capture at the square where the captured piece stood.**
  - Semantics: in `perWorldMove` (quantum.js), `cap` is the square of the captured piece in the world before the
    move (`b.sq[m.capture]`), not `m.to`. In the variants as built this changes only en passant, which then records
    `d5` instead of `d6`. Merges keep `t`, which is the captured piece's square. `Branch.captures`, the history
    record and the "Capture on X" row follow.
  - Why: D-7 and test D4. The default row "Capture on d6" would tell the victim the capturer's square and that the
    capture was en passant.
  - Why a variant hook cannot do it on today's core: `captures` is built inside the quantum layer, and the history
    row has no variant hook.
  - Kriegspiel needs the same square and converts it itself (kriegspiel.md 3.5); with C-2 its conversion becomes a
    no-op.
  - Fallback if the lead declines C-2: the planned `recordInfo` (Q9) stores the victim squares (for en passant,
    `x.epVictim` of the worlds before the move), and `infoText` (U9) shows "Capture on {square}" in the opponent's
    row. This also needs amendment 1 of kriegspiel.md 8.2, so that a secret row of a variant with `infoText` shows
    those lines instead of the default "Capture on …".

**Shared UI changes needed (first pass; superseded by 8.2.2)** (outside `src/variants/core`, shared with
`kriegspiel`; no variant hook can make them):
- Planned as U5 and U10:
  - `pieceAt` limited to the viewer's pieces (U10 a);
  - the `hiddenStyle` flag (U10 c);
  - undo off, no danger line and the other side's budget as "?" while a hidden game runs (U10 e, U5);
  - the two-step hand-over (U10 f).
- Not in the plan yet (package "ai-ui"):
  1. during step 1 of the hand-over the viewer is the side that just moved (the same as amendment 5 of
     kriegspiel.md 8.2);
  2. the curtain covers the side panel too: move list, budget pips, danger line, roll box and actions (D-11);
  3. the fog shading keeps the cell's light/dark shade, plus the hatch and the legend of section 6 (U10 c keeps
     today's CSS, which uses the dark shade for every hidden square);
  4. the other side's budget shows "?" in the pips' tooltip as well;
  5. the "The umpire says" notice only for `V.umpire`. U10 b gives it only when an `ownView` accepts the attempt,
     but today every hidden variant gets it.

#### 8.2.2 Second pass

Method. I re-read the core in the working tree: `quantum.js` now has Q1-Q14 (`applyMiss`, certain moves,
`unifyWorlds`, the settling labels, `mustCapture`, `budgetRule`, converging danger, the quiet rule, `recordInfo` and
the record squares, `passWhenStuck`, the `squareView` guard, the face check and the own-part join), `world.js`,
`orthodox.js` and `orthodoxVariant.js` have W1-W7 (`clearEnPassant` and `unifyCastling` as `orthodoxSpec()` hooks),
`ai.js` has U3, U4 and U14, and the UI has U1, U5, U9 and U10. `handoff/CORE-CHANGES.md` is the plan they follow.
New scratch scripts in `handoff/tmp/critic-darkchess/` (not in git):
- `r2-check.mjs`: every test of section 7 with exact assertions, the new ones included. All pass on the working tree.
- `r2-view.mjs`: `aiView` as 3.2 now describes it; `r2-json.mjs`: its views of D10, D14, D15 are equal as whole
  objects; `r2-ids.mjs`: the id leak of change 1 and its effect on `chooseMove`.
- `r2-fuzz.mjs`: the random check of D11 with that view, plus a comparison of all split lists.
- `r2-record.mjs`: `recordInfo` and `infoText` of 3.5 through the real `stateAfter`.
- `r2-noapplymiss.mjs`: D13 and D13b without `applyMiss`, to show what W4 adds for visibility.
- `perf.mjs` (first pass) re-run for 3.3.

Changes:

1. **3.2, fresh ids for visible enemy pieces (a leak by the contract).** The view kept the real ids of the visible
   enemy pieces, and `worldKey` contains ids. So the view of a position with the g8 knight on a visible e5 differed
   from the same position with the b8 knight there, although the player sees the same board (new test D17; the view
   differed, `r2-ids.mjs`). In 36 searches it changed no choice, because own moves read squares, types and sides
   only, but ties in the reply search and the enemy's ghost moves do read ids. Steps 2 and 3 now rebuild every view
   world from own pieces, one slot per visible (square, type) pair and the phantoms; the contract lists "which of
   several same-type pieces" as unknown. With this, the views of D10, D14, D15 and D17 are equal as whole objects
   (`toEqual`), which the tests now ask for. The random check of D11 gives the same results with the new view.
2. **3.2, the `chooseMove` filter:** a split can be filtered too, in principle, when the real state has more
   possibilities than the view and the split breaks the limit of 64 (it did not happen in 3,474 random positions).
   Also stated and checked: every legal move of the real state is legal in the view, so the filter never leaves the
   computer without a candidate. D11 got both checks. A note on promoted pawns in `alive` was added.
3. **3.1 and D-15, en passant:** Q1 + W4 are now in the working tree, and darkchess inherits `applyMiss` from
   `orthodoxSpec()`. D13 now passes; the "core as built fails" lines were rewritten as "without `applyMiss`". New
   test D13b covers the other idle-world path (a linked miss). Checked without `applyMiss`: Q2 alone makes `e4-d3`
   illegal after the linked miss, but d3 and d4 stay visible, because visibility reads `generate` per world. So W4 is
   what the fog needs. 3.1 also says why reading `generate` instead of the legal moves adds no square (castling
   destinations are rook targets too; en passant is in every possibility or none).
4. **D-16 and new test D18, castling:** Q2 + W5 are in the working tree. A possible enemy ghost part between king
   and rook makes `O-O` illegal, the square is visible with "n 50%", and the view agrees. The sentences about "the
   core as built rolls castling" were removed.
5. **D-7, D4 and new 3.5, the capture square: core change C-2 withdrawn.** C-2 would have changed `branch.captures`
   for en passant in every variant, but atomic's blast marks are centred on that square (the landing square, as the
   atomic rules want; `CORE-CHANGES.md` item 28). The hooks now built do the job inside the module: `recordInfo`
   (Q9) stores `{ taken }` with `x.epVictim` for en passant, and `infoText` (U9) gives the opponent the line "Capture
   on d5". The UI as built shows a secret row of a variant with `infoText` as "A move" with that line, and never
   prints `record.captures` there. Checked in `r2-record.mjs` for en passant, a rook capture and a merge capture. D4
   now asserts `captures` = [d6] and `info.taken` = [d5], and the `aiView` en passant case.
6. **Section 3, code and table:** `applyMiss` and `unifyWorlds` are listed as inherited, with "must not be
   overridden"; `recordInfo` and `infoText` added; `hiddenStyle: 'fog'` is the default of U10 c.
7. **3.4 rewritten** for the working tree: the hooks that exist, the core items the variant relies on (Q1 + W4,
   Q2 + W5, Q8), no new core change, and the one UI item still missing.
8. **D-4:** worlds that differ only in castling rights no longer occur (W5 is built); the 64-limit sentence was
   corrected.
9. **D-2:** decided how the board shows two different same-type enemy pieces that may stand on one visible square
   (two parts, because `squareView` groups by piece): accepted, and the computer's view does not get it.
10. **Section 6 and D-11, UI status:** the fog with the cell's own shade, the hatch and the legend, the two-step
    hand-over, the curtain over the side panel, the "?" budget, no danger line, undo off and the notice without
    "umpire" are all built. The texts now match what is built: the tooltip reads "Quantum budget: unknown", the
    refusal reads "That move is not possible.", the box reads "Your move: {result}".
11. **Section 6, new leak: keyboard focus.** `VariantGameView.vue` makes the from-squares of `game.moves` focusable,
    and those are the moves of `state.turn` with no guard. While the computer thinks, during step 1 of the hand-over
    and under the curtain, `state.turn` is the opponent of the person at the screen, so Tab walks over the squares of
    the opponent's movable pieces, hidden squares included, and draws a focus ring on them. Added to the leak
    checklist and to D-11, with the fix, and to D12 as three assertions (they fail on the UI as built).
12. **3.3:** re-measured on the working tree: 14 → 15 ms (normal), 34 → 76 ms (hard).
13. **D11:** new numbers on the working tree (3,474 positions, up to 64 possibilities, 207,952 codes, 1,952
    filtered moves, all pawn moves onto or through a hidden square, no split difference), the two new checks of
    change 2, the "no mixed square" check, and a time estimate from the measured 20 ms per position.
14. **D10, D14, D15:** "deep-equal" now means `toEqual` of the whole view, which holds with change 1.
15. **Header:** points to the review-2 scripts.

Checked and unchanged:
- D1-D9, D14-D16 hold as written on the working tree, number for number (`r2-check.mjs`), and so does D10.
- The rules card. Item 4 holds in the quantum game: pawns are solid and visibility is the union over possibilities,
  so a hidden square in front of your pawn holds an enemy piece in every possibility. Item 5 holds with W4.
- The solid roll and the game-end roll: they split only on pieces the move touches. The king is solid, and a capture
  onto it is always a landing roll, so every world of a capture outcome has taken the king and the game-end roll has
  nothing to split in this variant.
- The budget (own arrangements only), the world bound (64 was reached in the random games), D-8 to D-10, D-12 to
  D-14, and the layout: `rectTopology(8, 8)`, no new layout field; the fog is CSS only.
- `royalDanger` with Q7 (converging captures): D8 still 0.5 and D16 still 1; it is never shown here.

**Core changes needed**

None. The variant relies on these items of `handoff/CORE-CHANGES.md`, which are in the working tree and must stay:
- Q1 + W4: every idle world (a miss, an idle split child, every world of a Measure) passes through
  `orthodoxSpec().applyMiss`, which clears `x.ep` and `x.epVictim`. Tests D13 and D13b.
- Q2 + W5: castling and en passant are legal only when every world generates them as certain moves, and castling
  rights are unified over the worlds after every move. Test D18.
- Q8: the quiet counter is reset only by a capture or a pawn move that happened (D-14).
- Q9 (`recordInfo`) and U9 (`infoText`, with the secret-row rule "A move" plus the lines): 3.5.

C-2 of the first pass is withdrawn (change 5).

**Shared UI changes needed** (outside `src/variants/core`; they also apply to `kriegspiel`):
1. Keyboard focus in hidden games: while a hidden game runs, `focusable` in `VariantGameView.vue` holds squares only
   while it is a human's turn (`isHumanTurn`) and neither the hand-over box nor the curtain is shown; otherwise it is
   empty. Test D12.

Everything else the first pass asked for (U5, U10 a, c, e, f, the viewer of step 1, the curtain over the side panel,
the fog shading, the "?" tooltip, the notice wording) is built in the working tree; D12 verifies it.
