# Variant spec: `chess960` (Chess960 / Fischer Random Chess)

Category: `rules`. UI name: "Chess960". Summary line (already in `catalog.js`): "Fischer Random: the back rank is
shuffled into one of 960 start positions."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in this session (lichess.org,
wikipedia.org, fide.com, russellcottrell.com, fairy-stockfish.github.io all returned EGRESS_BLOCKED). The rules below
come from search-engine extracts of the pages listed, plus prior knowledge. The numbering scheme was then implemented
as a reference generator (`handoff/prototypes/c960/sp.mjs`) and checked against the three published anchor numbers
(0 = BBQNNRKR, 518 = RNBQKBNR, 959 = RKRNNQBB). All 960 numbers give 960 distinct, valid back ranks, and the
inverse function returns the original number for each of them. Every test case in section 7 was run on a prototype
built on the real `src/variants/core` (`handoff/prototypes/c960/proto.mjs`, `t960.mjs`, `perft.mjs`).

| Source | What it gives |
|---|---|
| FIDE Handbook, Laws of Chess, *Guidelines II. Chess960 Rules* (http://rcc.fide.com/guidelinesii/, https://handbook.fide.com/chapter/e012023) | The official rules: start position rules, castling end squares (king c/g file, rook d/f file), the vacancy condition, notation O-O / O-O-O, and the four ways a castling can look on the board. |
| Wikipedia, "Fischer random chess" / "Chess960" (https://en.wikipedia.org/wiki/Chess960) | Setup constraints, castling summary, SP 518 = the ordinary start position. |
| Wikipedia, "Chess960 numbering scheme" / "Fischer random chess numbering scheme" (https://en.wikipedia.org/wiki/Chess960_numbering_scheme) | Reinhard Scharnagl's numbering 0-959: the direct derivation (bishops by remainder mod 4, queen mod 6, knights by a 10-entry table, then R K R). SP 0 = BBQNNRKR, SP 959 = RKRNNQBB. |
| lichess.org, https://lichess.org/variant/chess960 and forum threads "Castling in Chess960" | The lichess user interface: **you castle by moving the king onto the rook you castle with**. Castling is allowed when the king does not change square, provided the rook's target square is free. |
| chess.com, "How do I castle in Chess960?" (https://support.chess.com/en/articles/8614060) | Confirms the end squares and the "king or rook may stay put" cases. |

**Chosen rule set: FIDE Guidelines II (Chess960), with Scharnagl numbering, and lichess's castling input (king onto
rook).** The sources do not disagree on any rule. They differ only in the user interface, where there are two ways to
enter a castling move:

- King to its destination square. This is the ordinary chess method, and it is ambiguous in Chess960.
- King onto its own rook. This is the lichess method, and it is never ambiguous.

I chose **king onto rook**. The destination method breaks in two ways:

- If the king does not move, "king to its destination" is a click on the king itself.
- If the king moves one square to an empty destination, the castling and the ordinary king step have the same from
  and to squares. Example: Ra1 Kb1, where both O-O-O and Kb1-c1 go b1 → c1.

The current UI would show both of those as "promotion choices". "King onto own rook" is never an ordinary move, so it
is unambiguous in all 960 positions.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- Ordinary 8 × 8 board. Files `a`-`h` (x = 0..7), ranks `1`-`8` (y = 0..7). Square names `a1` … `h8`. All 64 squares
  exist.
- Square index as produced by `rectTopology(8, 8)`: `y * 8 + x`, so a1 = 0, h1 = 7, e8 = 60, h8 = 63.
- Square colour: dark when `(x + y)` is even (a1 is dark), light otherwise. **Light back-rank squares: b1, d1, f1, h1.
  Dark: a1, c1, e1, g1.**
- White moves up (towards rank 8), Black down.

### 2.2 Pieces and movement

The ordinary chess pieces, unchanged. Vectors are `(dx, dy)`:

| Piece | Letter | Descriptor |
|---|---|---|
| King | K | `leap` over the 8 vectors (±1, 0), (0, ±1), (±1, ±1) |
| Queen | Q | `ride` over the 8 king vectors |
| Rook | R | `ride` over (±1, 0), (0, ±1) |
| Bishop | B | `ride` over (±1, ±1) |
| Knight | N | `leap` over (±1, ±2), (±2, ±1) |
| Pawn | P | `leap [(0, 1)]` oriented, `mode: 'move'`; `leap [(1, 1), (-1, 1)]` oriented, `mode: 'capture'`; plus the double step and en passant (extraMoves) |

These are exactly `orthodoxTypes()` from `src/variants/core/orthodox.js`.

### 2.3 Setup

- Rank 2: eight White pawns (a2-h2). Rank 7: eight Black pawns (a7-h7).
- Rank 1: the eight White pieces K, Q, R, R, B, B, N, N in a random order with two constraints:
  1. the two bishops stand on squares of **opposite colours**;
  2. the king stands **between the two rooks** (on a file strictly between them).
- Rank 8: Black's pieces **mirror** White's: the same piece type on the same file (if White has a knight on b1,
  Black has a knight on b8).
- There are exactly 4 × 4 × 6 × 10 = **960** such back ranks.

**Numbering (Scharnagl, direct derivation).** Start position number `N` in 0..959:

1. `B1 = N mod 4`, `N2 = floor(N / 4)`. Light-squared bishop on file `[b, d, f, h][B1]`.
2. `B2 = N2 mod 4`, `N3 = floor(N2 / 4)`. Dark-squared bishop on file `[a, c, e, g][B2]`.
3. `Q = N3 mod 6`, `N4 = floor(N3 / 6)` (0..9). The queen goes on the `Q`-th free file, counting from `a`, 0-based,
   among the 6 files still free.
4. The knights go on two of the 5 files still free (counted from `a`, 0-based), by the table for `N4`:

   | N4 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
   |---|---|---|---|---|---|---|---|---|---|---|
   | knights on free files | 0,1 | 0,2 | 0,3 | 0,4 | 1,2 | 1,3 | 1,4 | 2,3 | 2,4 | 3,4 |
   | pattern | NN--- | N-N-- | N--N- | N---N | -NN-- | -N-N- | -N--N | --NN- | --N-N | ---NN |

5. The last 3 free files get **R, K, R** in that order from left to right.

Inverse (back rank → number): `N = B1 + 4·B2 + 16·Q + 96·N4`.

The reference implementation (`handoff/prototypes/c960/sp.mjs`), to be ported as a pure helper (for example
`backRank960(n)` returning a lower-case string such as `'rnbqkbnr'` for `standardSetup`):

```js
const KNIGHTS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]
function backRank960(n) {
	const r = new Array(8).fill(null)
	const free = () => r.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
	r[[1, 3, 5, 7][n % 4]] = 'b'; n = Math.floor(n / 4)
	r[[0, 2, 4, 6][n % 4]] = 'b'; n = Math.floor(n / 4)
	r[free()[n % 6]] = 'q'; n = Math.floor(n / 6)
	const f = free()
	for (const k of KNIGHTS[n]) r[f[k]] = 'n'
	free().forEach((i, k) => { r[i] = 'rkr'[k] })
	return r.join('')
}
```

Test vectors (all generated and cross-checked):

| N | back rank (a → h) | N | back rank (a → h) |
|---|---|---|---|
| 0 | BBQNNRKR | 95 | NNRKRQBB |
| 1 | BQNBNRKR | 310 | NQBRKBRN |
| 2 | BQNNRBKR | 518 | RNBQKBNR (ordinary chess) |
| 3 | BQNNRKRB | 534 | RNBKQBNR |
| 4 | QBBNNRKR | 709 | RKBBQNNR |
| 12 | QBNNRKBR | 959 | RKRNNQBB |
| 20 | NBBQNRKR | 249 | NRKBBQNR |

The king stands on files b-g only: b 108 positions, c 168, d 204, e 204, f 168, g 108.

### 2.4 Special moves

- **Pawn double step** from rank 2 (White) or rank 7 (Black), both squares empty. **En passant** as in chess, only
  on the next move. Both are unchanged (`pawnExtras`).
- **Castling** (FIDE Guidelines II):
  - Each side may castle once per game, with the rook on the **a-side** of the king ("queenside", notated `O-O-O`) or
    with the rook on the **h-side** ("kingside", `O-O`).
  - **End squares are those of ordinary chess**, whatever the start position:
    - `O-O-O`: king on the c-file (c1 / c8) and rook on the d-file (d1 / d8);
    - `O-O`: king on the g-file (g1 / g8) and rook on the f-file (f1 / f8).
  - **Rights.** The king and the castling rook must both still be on their start squares and must not have moved
    earlier in the game. The rights are recorded at setup: for each side, the king square and the square of each of
    the two rooks.
  - **Vacancy.** Every square between the king's start and end squares, **including the end square**, and every
    square between the rook's start and end squares, **including the end square**, must be empty. The only pieces
    allowed on them are the castling king and the castling rook.
  - Classical FIDE also forbids castling out of, through or into check. **This condition is dropped in Quantum Chess**
    (there is no check; see section 4).
  - **Four shapes**, all legal:
    - Both pieces move.
    - Only the king moves (the rook is already on its end square: rook on d1 for O-O-O, rook on f1 for O-O).
    - Only the rook moves (the king is already on its end square: king on c1 for O-O-O, king on g1 for O-O).
    - King and rook swap squares (for example Kf1 Rg1 → Kg1 Rf1, or Kd1 Rc1 → Kc1 Rd1).
  - Castling can be possible on the **very first move**: 162 of the 960 start positions allow it. Examples: SP 3
    (BQNNRKRB) allows `O-O` (Kf1 Rg1 → Kg1 Rf1); SP 74 (NNRKBBQR) allows `O-O-O` (Kd1 Rc1 → Kc1 Rd1).
  - **Input (UI)**: pick the king, then click **the rook** to castle with. The move key stays `O-O` / `O-O-O`.
- **Promotion**: a pawn reaching the last rank becomes a Q, R, B or N (choice), as in chess.

### 2.5 Win, draw and turn order (classical)

- Classical Chess960 is ordinary chess after the setup: checkmate wins, stalemate draws, and the threefold
  repetition, 50-move and insufficient-material draws apply. White moves first.
- The quantum version replaces check and mate with capture-the-king (section 4).

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()` and change only the setup, the castling input and the options.

| Field | Value |
|---|---|
| `id`, `category` | `'chess960'`, `'rules'` |
| `sides` | `whiteBlack()`: `[{ id: 'w', color: 'white' }, { id: 'b', color: 'black' }]`. No teams. `enemies` default (`a !== b`). |
| `topology` | `standardBoard(8, 8).topology` (same as orthodox). |
| `types` | `orthodoxTypes({ lastRank })`: `k` royal + solid; `p` solid; `q`, `r`, `b`, `n` splittable. |
| royal / solid / splittable | royal: `k`. solid: `k`, `p`. splittable: `q`, `r`, `b`, `n` (and promoted pieces). |
| values (centipawns) | the orthodox `VALUES`: K 400, Q 900, R 500, B 330, N 320, P 100. No variant `evaluate` term is needed. |
| `options` | `[{ id: 'position', type: 'number', label: () => t('quantumchess', 'Start position (0–959)'), min: 0, max: 959, random: true, default: 518 }]` |
| `setup(options, rng)` | `n = Number.isInteger(options.position) && 0 <= n <= 959 ? options.position : Math.floor(rng() * 960)`, then `standardSetup(spec, backRank960(n))`. `standardSetup` already mirrors the back rank for Black, places the pawns and computes `x.castle` with `castlingRights`, whose default end squares (king to file 2 or 6, rook to file 3 or 5) are exactly the Chess960 ones. |
| `extraMoves(w, side)` | `pawnExtras(...)` (double step from rank 2/7, en passant) plus the castling moves, with **`to` = the castling rook's square** (see below). |
| `afterMove(next, m)` | `orthodoxAfterMove(spec, next, m)`: sets the en passant square and drops castling rights when the king or that rook leaves its square, or something lands on it. |
| `worldResult` | default (a side without its king has lost). |
| `visibility` | none. |
| `rules()` | section 5. |

**How the new-game dialog uses the option.** `VariantsView.vue` already prefills a `random: true` number option with
a random value and shows a "Random" button. The state therefore always stores the concrete number in
`state.options.position`, which makes games reproducible and lets the game view show "Start position 123". The
`default: 518` only applies when the field holds an invalid value (`optionValues`). The `rng` fallback in `setup`
exists only for callers that pass no option at all.

**Castling moves: two small core changes are needed.** Both were confirmed by running the current core.

1. **Bug in `applyClassical` (world.js).** The king is placed on `m.to`. `castlingMoves` sets
   `to: c.kingTo === c.king ? c.rook : c.kingTo`, so when the king does not move, `m.to` is the rook's square and the
   king lands **on the rook's square**.
   - Reproduced: Ra1 Kg1 Rh1, `O-O`, gives **Kh1 Rf1** instead of Kg1 Rf1.
   - Fix: place the king on `m.extra.kingTo ?? m.to` and end with `next.board[kingTo] = m.id`.
   - The existing "place king, then place rook" order is then correct for all four castling shapes. I checked every
     overlap: king onto the rook's square, rook onto the king's square, the swap, king staying, rook staying.
2. **King onto rook.** Give `castlingMoves` an option (for example `castlingMoves(V, w, side, { toRook: true })`)
   that sets `to: c.rook` for every castling move, and keep `extra.kingTo`. Chess960 passes `toRook: true`.
   Orthodox-start variants may keep `to = kingTo` (their king always moves two squares, so nothing is ambiguous).
   The square set that must be empty (`need`) stays as it is; it already matches FIDE.

With `to` = the rook's square, the move is still a king move, and the king is solid, so `isMeasured` treats it as
measured. `m.capture` is -1, so the outcome is `move` or `miss`.

**Keys.** `O-O` (h-side) and `O-O-O` (a-side), as now. Display them as `O-O` / `O-O-O` in the move list.

**Rights.** `x.castle` holds the rights, `[{ flag: 'K'|'Q'|'k'|'q', side, king, rook, kingTo, rookTo }]`, and is set
once at setup. `castlingRights` picks the outermost rook on each side of the king; in a Chess960 start position there
is exactly one rook on each side. A right is dropped (per world) when:

- the king or that rook moves away (`m.from`), or
- a piece lands on the king's or the rook's start square (`m.to`).

It never comes back.

---

## 4. Quantum adaptation

Chess960 changes only the start position and the castling geometry. Everything else is the shared quantum layer, so
the adaptation is short.

1. **Capture the king, no check.** Castling is allowed out of, through and into attack. The FIDE condition "the king
   may not be in check or pass through or land on an attacked square" is dropped, exactly as for ordinary castling in
   classic Quantum Chess (rules.md §5) and in every orthodox-based variant.
2. **Castling is a king move, so it is measured** (the king is solid).
   - The move is played per world. It exists in a world when that world still holds the right, the king and that rook
     are on their start squares, and every square in the vacancy set is empty.
   - If the worlds disagree, one roll decides between Moved (castled) and Missed (nothing moved), with the total
     weight of each.
   - Example: a ghost standing on a square the castling needs.
   - This is how orthodox castling already works in the variants core. Classic Quantum Chess (rules.md §5) instead
     forbids castling when a ghost stands between; the variants follow the generic core, and Chess960 keeps that.
     Reason: castling in Chess960, King of the Hill, Three-check and Atomic behaves identically, and the input stays
     simple.
3. **Castling rights are per world.** Example: a rook slides out past a ghost (pass = link).
   - In the worlds where the rook really moved, the right is lost.
   - In the worlds where it stayed, the right remains.
   - A later castling is then a roll whose odds are exactly the rook's odds of still being home (test C11).
   - Players need not track this: the castling preview shows the odds, like any other roll.
4. **Splits.** Castling can never be part of a split or merge. `quietTargets` and `mergeBranches` already exclude
   `kind === 'castle'`, and the king is not splittable. A rook that splits away from its start square loses its right
   in every world where it left.
5. **Solid roll and game-end roll.** Nothing variant-specific. King and pawns are solid, and `worldResult` is the
   default capture-the-king.
6. **Budget.** Unchanged (8 per side, at most 4 squares per piece, at most 64 worlds).
7. **Random start and fairness.** The start position is chosen once, before the first move, for both sides (mirror
   image), so it is fair. The number is visible to both players. It is not a quantum roll and is not part of the
   dice log.

---

## 5. Player-facing rules text (rules card)

- The pieces on the back rank start in one of 960 shuffled positions, and Black's pieces mirror White's. The pawns
  start as usual.
- The two bishops always stand on squares of different colours, and the king always stands between the two rooks.
- Each start position has a number from 0 to 959; number 518 is the ordinary chess setup. You can pick a number or
  let the game choose one.
- After castling, the king and rook stand where they would in ordinary chess: king on g and rook on f (O-O), or king
  on c and rook on d (O-O-O).
- To castle, move your king onto the rook you want to castle with. Neither may have moved, and every square they
  cross or land on must be empty.
- Sometimes only the king or only the rook moves, and in some start positions you can castle on your first move.
- Castling is a king move: if a ghost might stand in the way, a roll decides whether it happens.

---

## 6. UI layout

- **Board.** The ordinary 8 × 8 board from `rectTopology(8, 8)`:
  - square cells, shade `dark` when `(x + y)` is even and `light` otherwise;
  - file letters below and rank numbers on the left;
  - White at the bottom (layout y = 7 - rank index).
- **Pieces.** The cburnett sprites (`glyph: { sprite: 'k' | 'q' | 'r' | 'b' | 'n' | 'p' }`). There are no new pieces.
- **Castling input.**
  - When the king is selected and a castling move is legal in some world, the castling rook's square gets the
    ordinary target marker plus a small castle badge. Its tooltip reads "Castle (O-O)" or "Castle (O-O-O)".
  - Clicking the rook plays the castling move.
  - The king's end square is **not** a castling target. When it is empty and next to the king, it keeps its meaning
    of an ordinary king step.
  - After castling, the move list shows `O-O` / `O-O-O`.
- **Start position.** Show it in the game header or the side panel as "Start position 518". The UI can read it from
  `state.options.position`; a generic "game info" hook, or reading `options` in `VariantGameView`, is enough.
- **New-game dialog (optional).** Under the number field, show the back rank as a letter string (e.g. "RNBQKBNR") so
  players can see the position before they start. Possible hook: `options[i].describe?(value) -> string`.

---

## 7. Test cases

Positions use `worldFrom` placements. `withCastle` means `x.castle = castlingRights(V, world)` computed on that world
(for explicit positions); otherwise `x = { ep: -1, epVictim: -1, castle: [] }`. All results below were produced by
the prototype on the real core, **with the two core fixes of section 3 applied**. C4 fails on the current core: the
king lands on h1.

**C1. Numbering and setup.**
- `setup({ position: 0 })`: rank 1 is Ba1 Bb1 Qc1 Nd1 Ne1 Rf1 Kg1 Rh1; rank 8 is ba8 bb8 qc8 nd8 ne8 rf8 kg8 rh8; the
  pawns are on ranks 2 and 7; castling rights `KQkq`.
- `position: 959`: rank 1 is Ra1 Kb1 Rc1 Nd1 Ne1 Qf1 Bg1 Bh1, and rank 8 mirrors it.
- `position: 518`: the ordinary chess start position.
- Also check `1 → BQNBNRKR`, `3 → BQNNRKRB`, `95 → NNRKRQBB`, `534 → RNBKQBNR`.
- For all n in 0..959: the back rank is valid (bishops on opposite colours, king between the rooks), all 960 are
  distinct, and the inverse formula returns n.

**C2. Option handling.**
- `optionValues(V, { position: 1000 })` gives `{ position: 518 }` (out of range, so the default).
- `optionValues(V, { position: 77 })` gives 77.
- `setup({}, () => 0.54)` uses `floor(0.54 × 960) = 518`, the ordinary position.

**C3. First-move counts** (ordinary moves only, splits excluded; `legalMoves(V, newGame(V, { position }))`).

| SP | back rank | moves | why |
|---|---|---|---|
| 518 | RNBQKBNR | 20 | as in chess |
| 0 | BBQNNRKR | 20 | no castling: `O-O` needs f1 empty, and the a-side rook is on f1 |
| 3 | BQNNRKRB | **21** | 16 pawn moves, 4 knight moves, and `O-O` (Kf1 Rg1 → Kg1 Rf1) |
| 20 | NBBQNRKR | 19 | the a1 knight has only b3 |
| 310 | NQBRKBRN | 18 | the corner knights have 1 move each |

Across all 960 positions: 18 moves in 22 positions, 19 in 336, 20 in 540, 21 in 62. Castling is possible at move 1
in 162 positions.

**C4. Only the rook moves (king already on g1).**
- Position: White Ra1, Kg1, Rh1; Black Ke8; `withCastle` (rights `KQ`).
- The castling moves are `O-O` with `to = h1` and `O-O-O` with `to = a1`.
- `O-O` gives one outcome, `move` with p = 1, and the result **Ra1 Kg1 Rf1**, rights `""`.
- `O-O-O` gives **Kc1 Rd1 Rh1**, rights `""`.
- (The current core gives Kh1 Rf1 for `O-O`: the bug of section 3.)

**C5. The king steps one square; castling is not confused with the king step.**
- Position: White Ra1, Kb1, Rh1; Black Ke8; `withCastle`.
- The moves from b1 include `b1-c1` (`to = c1`) and `O-O-O` (`to = a1`), as separate moves; there is also `O-O` with
  `to = h1`.
- `O-O-O` gives Kc1 Rd1 Rh1.
- `O-O` gives Ra1 Kg1 Rf1 (the king crosses c1-f1 and the rook crosses g1).
- Clicking b1 and then c1 in the UI plays the king step, not a castling.

**C6. Swap castling.**
- Position: White Ra1, Kf1, Rg1; Black Ke8; `withCastle`.
- `O-O` gives Ra1 **Kg1 Rf1**.
- Also Rc1 Kd1 Rh1: `O-O-O` (`to = c1`) gives **Kc1 Rd1** Rh1.

**C7. Only the king moves.** White Rd1, Ke1, Rh1; Black Ke8; `withCastle`. `O-O-O` gives **Kc1**, Rd1 unchanged, Rh1.
It needs only c1 to be empty.

**C8. Blocked castling.**
- Position: White Ra1, Nb1, Ke1, Rh1; Black Ke8; `withCastle`.
- `O-O-O` is **not** legal: b1 lies between the rook (a1) and its end square (d1).
- `O-O` is legal.
- In the start position of SP 0 neither side can castle, because the other rook stands on f1/f8.

**C9. Castling rights.**
- From SP 518, play a2-a4, a7-a5, a1-a3, h7-h6, a3-a1, h6-h5. The rights are now `Kkq`: White has lost `Q` for
  good, although the rook is back on a1.
- Merging back, or returning the rook, never restores a right.
- After a king move, both of that side's rights are gone.

**C10. Quantum: a ghost on the castling path means a roll.**
- White Ra1, Ke1, Rh1; Black Ke8 and a Black knight that is 50 % on g1 and 50 % on h3. Two worlds, `withCastle`.
- `O-O` has two outcomes: `miss` p = 0.5 and `move` p = 0.5.
  - Missed: nothing moves (Ke1 Rh1, rights `KQ` kept); the knight is now known to be on g1.
  - Moved: Kg1 Rf1, rights `""`; the knight is known to be on h3.
- No split, merge or measure is needed.

**C11. Quantum: castling rights linked to a ghost (pass = link).**
- White Ra1, Ke1, Rh1; Black Ke8 and a Black knight that is 50 % on h3 and 50 % on a6; `withCastle`.
- `h1-h5` is **not rolled**: one outcome, `move` p = 1.
  - World A (knight a6): Rh5, rights `Q`.
  - World B (knight h3): the rook stayed on h1, rights `KQ`.
- Black plays `e8-d8`.
- `O-O` now has two outcomes: `miss` 0.5 (world A: no right, the rook is on h5) and `move` 0.5 (world B: Kg1 Rf1).

**C12. Castling on move 1.**
- `newGame(V, { position: 3 })`: `O-O` is legal at once and gives Kg1 Rf1 (from Kf1 Rg1). White's rights become `kq`.
- `newGame(V, { position: 74 })` (NNRKBBQR): `O-O-O` is legal at once and gives Kc1 Rd1 (from Kd1 Rc1).

---

## 8. Open questions

1. **Core fixes needed.**
   - (a) `applyClassical` must place the king on `m.extra.kingTo`.
   - (b) `castlingMoves` needs a `toRook` option.

   Both are described in section 3. (a) is a real bug for every Chess960 position where the king starts on c1/g1 and
   castles to that side (SP 0 after f1 is cleared, for example); C4 fails without it.
2. **Castling past a ghost.** Here it is a roll (the variants core). Classic Quantum Chess forbids it instead. I kept
   the core behaviour for consistency across all orthodox variants; changing it would be a core decision for all of
   them.
3. **Chess960 elsewhere.** Should King of the Hill, Three-check or Atomic also offer a Chess960 start as an option?
   Lichess does not, so I did not specify it. Supporting it would only need the `position` option and
   `backRank960()` in those modules.
