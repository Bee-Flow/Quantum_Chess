# Variant spec: `chess960` (Chess960 / Fischer Random Chess)

Category: `rules`. UI name: "Chess960". Summary line (already in `catalog.js`): "Fischer Random: the back rank is
shuffled into one of 960 start positions."

---

## 1. Sources and chosen rule set

Research note: WebFetch was blocked by the network proxy for every rules site in the research session (lichess.org,
wikipedia.org, fide.com, russellcottrell.com, fairy-stockfish.github.io all returned EGRESS_BLOCKED). The rules below
came from search-engine extracts of the pages listed, plus prior knowledge. The numbering scheme was then implemented
as a reference generator (`handoff/prototypes/c960/sp.mjs`) and checked against the three published anchor numbers
(0 = BBQNNRKR, 518 = RNBQKBNR, 959 = RKRNNQBB). All 960 numbers give 960 distinct, valid back ranks, and the
inverse function returns the original number for each of them. Every test case in section 7 was run on a prototype
built on the real `src/variants/core` (`handoff/prototypes/c960/proto.mjs`, `t960.mjs`, `perft.mjs`).

Source review (see 8.1): the rules review opened the FIDE Handbook text, the lichess and Wikipedia pages and the
lichess rules code (scalachess), and checked every classical rule below against them. The generator now matches the
lichess table of all 960 start positions entry for entry, and the first-move counts were recomputed independently.

| Source | What it gives |
|---|---|
| FIDE Handbook, Laws of Chess, *Guidelines II. Chess960 Rules* (https://handbook.fide.com/chapter/e012023; older copy http://rcc.fide.com/guidelinesii/) | The official rules. II.1: after the setup the game is played as regular chess. II.2: start position rules. II.3.1: one castling per game. II.3.2.1-4: the four castling methods. II.3.2.6: the end squares (king c/g file, rook d/f file), notation 0-0 / 0-0-0. II.3.2.7: the vacancy condition, castling possible on move 1, king or rook (not both) may stay put. |
| FIDE Laws of Chess, Articles 3.7.3.3, 3.8.2.1, 3.8.2.2, 3.9, 5.1.1, 5.2.1, 5.2.2, 9.2, 9.3, 9.6 (same page) | The classical rules that Guidelines II inherits: promotion, loss of the castling right, castling prevented by an attacked king square, crossed square or end square, check, checkmate, and the draw rules. |
| Wikipedia, "Fischer random chess" / "Chess960" (https://en.wikipedia.org/wiki/Chess960) | Setup constraints, castling summary (no castling out of or through check: no square from the king's start square to its end square may be attacked), SP 518 = the ordinary start position. |
| Wikipedia, "Chess960 numbering scheme" / "Fischer random chess numbering scheme" (https://en.wikipedia.org/wiki/Chess960_numbering_scheme) | Reinhard Scharnagl's numbering 0-959: the direct derivation (bishops by remainder mod 4, queen mod 6, knights by the 10-entry "N5N" table, then R K R). SP 518 = RNBQKBNR. |
| lichess.org, https://lichess.org/variant/chess960 | The lichess user interface: "The only way to castle is to move the King onto the Rook." Castling is allowed when the king does not change square, "however the square that the rook jumps to must be free". |
| scalachess (lichess rules library), `core/src/main/scala/variant/Chess960.scala` (https://github.com/lichess-org/scalachess; local clone `handoff/ext/scalachess`) | The table of all 960 start positions by number (`initialPositionsStr`, index = SP number) and the symmetric Black rank. |
| chess.com, "How do I castle in Chess960?" (https://support.chess.com/en/articles/8614060) | Confirms the end squares and the classical no-check conditions; suggests clicking the king, then the rook. |

**Chosen rule set: FIDE Guidelines II (Chess960), with Scharnagl numbering, and lichess's castling input (king onto
rook).** The sources do not disagree on any rule. They differ only in the user interface, where there are two ways to
enter a castling move:

- King to its destination square. This is the ordinary chess method, and it is ambiguous in Chess960.
- King onto its own rook. This is the lichess method, and it is never ambiguous in a classical position.

I chose **king onto rook**. The destination method breaks in two ways:

- If the king does not move, "king to its destination" is a click on the king itself.
- If the king moves one square to an empty destination, the castling and the ordinary king step have the same from
  and to squares. Example: Ra1 Kb1, where both O-O-O and Kb1-c1 go b1 → c1.

The current UI would show both of those as "promotion choices". In a classical position "king onto own rook" is never
an ordinary move, so it is unambiguous in all 960 start positions and every position reached from them. This also
holds in quantum positions, because castling needs the rook on its start square in every world (lead decision D1;
section 6 and test C13). Before D1, a rook that was home in some worlds only could make the king step onto its square
share its from and to squares with the castling (8.1 item 7, 8.2).

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

Cross-check (review): `backRank960(n)` above equals `initialPositionsStr(n)` of lichess's scalachess
(`variant/Chess960.scala`) for every n in 0..959, so a position number means the same start position here as on
lichess. Black's rank is the same string in lower case on rank 8 (scalachess `Variant.symmetricRank`; FIDE II.2.3
"the black pieces are placed opposite the white pieces").

### 2.4 Special moves

- **Pawn double step** from rank 2 (White) or rank 7 (Black), both squares empty. **En passant** as in chess, only
  on the next move. Both are unchanged (`pawnExtras`).
- **Castling** (FIDE Guidelines II.3, plus Laws Art. 3.8.2 for what II.3 does not change):
  - Each side may castle once per game (II.3.1), with the rook that stands on the **a-side** of the king
    ("queenside"; FIDE calls it c-side castling, notated `0-0-0`) or with the rook on the **h-side** of the king
    ("kingside"; FIDE: g-side castling, `0-0`). FIDE writes zeros; the move keys and the move list use the letter O
    (`O-O-O`, `O-O`), as PGN does.
  - **End squares are those of ordinary chess**, whatever the start position (II.3.2.6):
    - `O-O-O`: king on the c-file (c1 / c8) and rook on the d-file (d1 / d8);
    - `O-O`: king on the g-file (g1 / g8) and rook on the f-file (f1 / f8).
  - **Rights** (Art. 3.8.2.1). The right is lost for good once the king has moved, and the right with one rook is
    lost once that rook has moved (or was captured). So the king and the castling rook must both still be on their
    start squares and must not have moved earlier in the game. The rights are recorded at setup: for each side, the
    king square and the square of each of the two rooks.
  - **Vacancy** (II.3.2.7). Every square between the king's start and end squares, **including the end square**, and
    every square between the rook's start and end squares, **including the end square**, must be empty. The only
    pieces allowed on them are the castling king and the castling rook. The squares strictly between the king and
    the castling rook always fall inside these ranges, but squares outside them may stay occupied, including squares
    that must be empty in ordinary chess (FIDE's example: after `0-0-0` the a-, b- and e-squares may still be filled).
    For example, with the king on e1 and the rook on d1, `O-O-O` needs only c1 empty; a1 and b1 may be occupied.
  - **Check conditions (classical only).** Classical Chess960 also forbids castling when the king is in check, when
    any square from the king's start square to its end square is attacked, and when the king would be in check after
    castling (Art. 3.8.2.2, 3.9.2). **All of these are dropped in Quantum Chess** (there is no check; see section 4).
  - **Four shapes**, all legal (FIDE II.3.2.1-4):
    - Double-move castling: both pieces move.
    - King-move-only castling: the rook is already on its end square (rook on d1 for O-O-O, rook on f1 for O-O).
    - Rook-move-only castling: the king is already on its end square (king on c1 for O-O-O, king on g1 for O-O).
    - Transposition castling: king and rook swap squares (for example Kf1 Rg1 → Kg1 Rf1, or Kd1 Rc1 → Kc1 Rd1).
  - Castling can be possible on the **very first move** (II.3.2.7): 162 of the 960 start positions allow it (`O-O` in
    90, `O-O-O` in 72, never both). Examples: SP 3 (BQNNRKRB) allows `O-O` (Kf1 Rg1 → Kg1 Rf1); SP 74 (NNRKBBQR)
    allows `O-O-O` (Kd1 Rc1 → Kc1 Rd1).
  - **Input (UI)**: pick the king, then click **the rook** to castle with (as on lichess). The move key stays `O-O` /
    `O-O-O`. The click is unambiguous in quantum positions too (section 6).
- **Promotion**: a pawn reaching the last rank becomes a Q, R, B or N of its own colour (choice), as in chess
  (Art. 3.7.3.3).

### 2.5 Win, draw and turn order

- Classical Chess960 is ordinary chess after the setup (FIDE II.1): checkmate wins (Art. 5.1.1); stalemate
  (Art. 5.2.1) and a dead position (Art. 5.2.2) draw; threefold repetition and the 50-move rule draw on a claim
  (Art. 9.2, 9.3), and fivefold repetition and the 75-move rule draw automatically (Art. 9.6). White moves first,
  then the sides alternate.
- The quantum version uses the shared rules of every orthodox-based variant (`docs/variants.md`, "The quantum rules
  of every variant"), plus the bare-kings draw of classic Quantum Chess:
  - **Win:** capture the enemy king. There is no check, checkmate or stalemate in the classical sense.
  - **Draws:**
    - 100 plies in a row without a capture or a pawn move (`quietPlies`, the 50-move rule);
    - the move limit (`maxPly`, 600 plies);
    - a side to move without any legal move (default `noMoves`);
    - **bare kings:** only the two kings are left, and the side to move cannot capture the enemy king.
  - The bare-kings draw is the draw of classic Quantum Chess (`docs/rules.md` section 6). It is also the
    capture-the-king form of FIDE's dead position (Art. 5.2.2) for king against king. Three-check, Atomic and Hyper 4D
    use the same rule and the same reason code `bareKings` (CORE-CHANGES item 40 lists Chess960 among them).
  - Threefold repetition and the other dead-position draws are **not** applied: the variants core has no repetition
    rule (CORE-CHANGES item 60), and no other variant draws on material.

---

## 3. Engine mapping (contract)

Start from `orthodoxSpec()` and change only the setup, the castling input, the options, `worldResult` (bare kings)
and `rules()`. Every core feature this mapping uses is in the core of the working tree (2026-09-25, package "world"
W1, W2, W4, W5 and package "quantum" Q2, Q3, Q8, Q9 of `handoff/CORE-CHANGES.md`); nothing is emulated any more
(8.2, second pass).

| Field | Value |
|---|---|
| `id`, `category` | `'chess960'`, `'rules'` |
| `sides` | `whiteBlack()`: `[{ id: 'w', color: 'white' }, { id: 'b', color: 'black' }]`. No teams. `enemies` default (`a !== b`). |
| `topology` | `standardBoard(8, 8).topology` (same as orthodox). |
| `types` | `orthodoxTypes({ lastRank })`: `k` royal + solid; `p` solid; `q`, `r`, `b`, `n` splittable. |
| royal / solid / splittable | royal: `k`. solid: `k`, `p`. splittable: `q`, `r`, `b`, `n` (and promoted pieces). |
| values (centipawns) | the orthodox `VALUES`: K 400, Q 900, R 500, B 330, N 320, P 100. No variant `evaluate` term is needed. |
| `options` | `[{ id: 'position', type: 'number', label: () => t('quantumchess', 'Start position (0–959)'), min: 0, max: 959, random: true, default: 518, describe: (n) => backRank960(n).toUpperCase() + ' (' + n + ')' }]`. `describe` is the option field of CORE-CHANGES U11, which is built: the dialog shows it under the number field, and the game view shows it **instead of** the value (`optionValueText` in `src/variantplay/texts.js`). Returning the back rank plus the number, for example "RNBQKBNR (518)", keeps the number in the game view ("Start position (0–959): RNBQKBNR (518)") without a core change (section 6). The letters and the number are chess notation and are not translated, like a FEN. |
| `setup(options, rng)` | `const p = options.position; const n = Number.isInteger(p) && p >= 0 && p <= 959 ? p : Math.floor(rng() * 960)`, then `standardSetup(spec, backRank960(n))`. `standardSetup` already mirrors the back rank for Black, places the pawns and computes `x.castle` with `castlingRights`, whose default end squares (king to file 2 or 6, rook to file 3 or 5) are exactly the Chess960 ones. |
| `extraMoves(w, side)` | `pawnExtras(...)` (double step from rank 2/7, en passant) plus the castling moves, with **`to` = the castling rook's square** (see below): `[...pawnExtras(spec, w, side, (s, sq) => spec.board.rankOf(sq) === (s === 0 ? 1 : 6)), ...castlingMoves(spec, w, side, { toRook: true })]` (CORE-CHANGES W2, built). |
| `afterMove(next, m)` | Inherited: `orthodoxAfterMove(spec, next, m)` sets the en passant square and drops castling rights when the king or that rook leaves its square, or something lands on it. |
| `unifyWorlds`, `applyMiss` | Inherited from `orthodoxSpec()` (CORE-CHANGES W5 and W4, built): `unifyCastling` keeps a right only if every world of the chosen outcome still has it; `clearEnPassant` ends the en passant right in worlds where the move did not happen. Do not override them. |
| `worldResult(w, mover)` | Capture the king, plus bare kings (section 2.5), as in threecheck.md step 3: (1) a side with no king on the board has lost, `{ winner: other side, reason: 'king' }`; (2) else, if only the two kings are on the board and the side to move next (`1 - mover`) cannot capture the mover's king (`attacks(spec, w, 1 - mover, kingSquare)`, kings included), `{ winner: null, reason: 'bareKings' }`; (3) else `null`. The text for `bareKings` is in the core (`reasonText` in `src/variantplay/texts.js`: "only the two kings are left"), so no `reasonText` is needed. |
| `visibility` | none. |
| `rules()` | section 5. |

**How the new-game dialog uses the option.** `VariantsView.vue` prefills a `random: true` number option with a random
value and shows a "Random" button. The state therefore always stores the concrete number in `state.options.position`,
which makes games reproducible and lets the game view show "Start position (0–959): RNBQKBNR (518)" (`optionLines`).
The `default: 518` only applies when the field holds an invalid value (`optionValues`). The `rng` fallback in `setup`
exists only for callers that pass no valid option (C2).

**Castling moves: the core provides everything.** Both castling changes this spec asked for are built in the core of
the working tree and were checked there (8.2, second pass):

1. **Castling placement (CORE-CHANGES W1, lead decision D4).** `applyClassical` (world.js, `placeCastling`) lifts the
   king and the rook off the board, then puts the king on `m.extra.kingTo ?? m.to` and the rook on `extra.rook.to`,
   and throws if either target holds another piece. This is right for all four castling shapes (C4-C7, C12, C17).
   - Before W1 the king was put on `m.to`. With this spec's `to` (always the rook's square) that broke every castling
     in which the king does not land on the rook's square: C4 and C5 gave Kh1 or Ka1, the rook-stays shape (C7, C17)
     threw `castling rook target occupied` inside `branches`, and 81 of the 120 random games of C18 failed.
   - The `ClassicalMove` JSDoc (world.js) says that for `kind: 'castle'`, `to` is the square the player clicks and
     `extra.kingTo` is where the king lands. Code that needs the king's destination (a future King of the Hill 960,
     for example) must read `extra.kingTo`, not `to`.
2. **King onto rook (CORE-CHANGES W2).** `castlingMoves(V, w, side, { toRook: true })` sets `to` to the rook's square
   on every castling move and keeps `extra.kingTo`. Orthodox-start variants keep the default (`to = kingTo`): their
   king always moves two squares, so nothing is ambiguous. The set of squares that must be empty (`need`) matches
   FIDE II.3.2.7.

With `to` = the rook's square, the move keeps `kind: 'castle'`, so it is **certain** (CORE-CHANGES Q2, lead decision
D1; `isCertain` in quantum.js): the key is legal only when every world generates it as a castling move, it is then
played in every world with the one outcome `move`, and it is never rolled (section 4, item 2).

**Keys.** `O-O` (h-side) and `O-O-O` (a-side), as now. Display them as `O-O` / `O-O-O` in the move list.

**Rights.** `x.castle` holds the rights, `[{ flag: 'K'|'Q'|'k'|'q', side, king, rook, kingTo, rookTo }]`, and is set
once at setup. `castlingRights` picks the outermost rook on each side of the king; in a Chess960 start position there
is exactly one rook on each side. A right is dropped (per world) when:

- the king or that rook moves away (`m.from`), or
- a piece lands on the king's or the rook's start square (`m.to`).

After every move, `unifyWorlds` (`unifyCastling`, CORE-CHANGES Q3 with W5, inherited from `orthodoxSpec()`) keeps in
every world only the rights that every world of the chosen outcome still has. So a right is lost everywhere as soon as
one world has lost it, that is, as soon as the king or that rook is not 100 % on its start square. The rights are
therefore identical in all worlds (CORE-CHANGES IT8). A right never comes back. While a right exists, its king and its
rook stand on their start squares in every world, and they are the original pieces: any move from or onto one of those
squares, in any world, has already dropped it.

---

## 4. Quantum adaptation

Chess960 changes only the start position and the castling geometry. Everything else is the shared quantum layer, so
the adaptation is short.

1. **Capture the king, no check.** Castling is allowed out of, through and into attack. The FIDE conditions "the
   king may not be in check, pass over or land on an attacked square, or be in check after castling" (section 2.4)
   are dropped, exactly as for ordinary castling in classic Quantum Chess (rules.md §5) and in every orthodox-based
   variant.
2. **Castling never rolls.** This is the classic rule (`docs/rules.md` section 5; `docs/engine-rules.md` §4.6, D3,
   D12, I9), which the lead's decision D1 makes binding for every variant (CORE-CHANGES Q2).
   - `O-O` / `O-O-O` is legal only when **every** world allows it. In every world the right must still exist, the
     king and that rook must stand on their start squares, and every square of the vacancy set must be empty.
   - It then happens in every world at once. It has one outcome, `move`, is never rolled, links nothing and leaves the
     budget unchanged.
   - A ghost that might stand on a square the castling needs makes castling **illegal**, not a roll. This holds for
     an enemy ghost (C10) and for an own ghost, such as the other rook partly on the end square (C14). Measuring an
     own ghost can clear the way (C14).
   - Only the vacancy set counts. A ghost on a square outside it does not block: b1, for example, when Rd1 Ke1
     castles `O-O-O`, and any square at all in the swap shape, whose vacancy set is empty (C17).
   - A ghost left by a slide that linked (pass = link) blocks like any other ghost, also an enemy one (C20).
   - On the core as built before D1, castling was a measured king move and rolled between Moved and Missed. The
     research and the rules review wrote the first version of this spec for that behaviour (see 8.2).
3. **Castling rights follow the state** (D1; CORE-CHANGES Q3 with W5).
   - A right is lost in every world as soon as, after any move, the king or that rook is not 100 % on its start
     square. That happens when it moves, splits or is captured, or when a slide happened in some worlds only
     (pass = link; C11, C13, C14, C15). A capture that is possible in some worlds only is a roll, so only its
     Captured outcome loses the right (C20).
   - A right never comes back: not by merging back, not by returning the rook (C9, C15), and not when a measurement
     later finds the rook at home (C11).
   - A king or rook move that was rolled and **Missed** keeps the right, because the piece never left (C11, second
     part).
   - The rights are therefore the same in every world at all times. Players need not track possibilities.
4. **Splits.** Castling can never be part of a split or merge. `quietTargets` (used by splits), `mergesFrom` and
   `mergeBranches` skip every certain move (`noPath` in quantum.js: castling and en passant), and the king is not
   splittable. A rook that splits away from
   its start square loses its right at once, in every world. This holds even when one split path is blocked in some
   worlds and the rook stays home there (C15).
5. **Solid roll and game-end roll.** Nothing variant-specific. King and pawns are solid.
   - Castling is certain and never captures, so it never causes a follow-up solid roll or game-end roll.
   - `worldResult` is capture-the-king plus bare kings (section 2.5). A move captures either in every world of the
     chosen outcome or in none: a capture that is possible in some worlds only is a landing roll, and en passant is
     certain. So all worlds of a state have the same number of pieces of each side, and the kings are solid. The
     bare-kings test therefore gives the same answer in every world after the solid roll, and the game-end roll is
     never needed for it (C19; the random games of C18 check the equal piece counts after every move).
6. **Budget.** Unchanged (8 per side, at most 4 squares per piece, at most 64 worlds). Castling never makes a ghost
   and never changes the budget. When `unifyWorlds` drops a right, worlds that then become identical merge, which can
   only lower the budget.
7. **Random start and fairness.** The start position is chosen once, before the first move, for both sides (mirror
   image), so it is fair. The number is visible to both players. It is not a quantum roll and is not part of the
   dice log.
8. **Move identity and the counters.**
   - The keys `O-O` and `O-O-O` are the same in every world, and so is `to`. The rights, with their king and rook
     squares, are fixed at setup and identical in every world (item 3), so every world maps a key to the same squares.
   - King onto rook never clashes with an ordinary king move. Castling needs the rook on its start square in every
     world, so no world can have that square empty or holding an enemy piece at the same time (section 6, C13).
   - Castling is neither a capture nor a pawn move, so it does not reset the 100-ply counter (`quiet`; C16).

---

## 5. Player-facing rules text (rules card)

- The pieces on the back rank start in one of 960 shuffled positions, and Black's pieces mirror White's. The pawns
  start as usual.
- The two bishops always stand on squares of different colours, and the king always stands between the two rooks.
- Each start position has a number from 0 to 959; number 518 is the ordinary chess setup. You can pick a number or
  let the game choose one.
- After castling, the king and rook stand where they would in ordinary chess: king on g and rook on f (O-O), or king
  on c and rook on d (O-O-O).
- To castle, move your king onto the rook you want to castle with. Neither may have moved yet, and every square the
  king or that rook crosses or lands on must be empty, apart from the king and that rook themselves.
- Sometimes only the king or only the rook moves, or the two swap places, and in some start positions you can castle
  on your very first move.
- A ghost that might stand on one of those squares blocks castling, and a right is lost for good as soon as the king
  or that rook is not 100% on its starting square. There is no check, so you may castle out of, through or into
  attack.
- The game is a draw when only the two kings are left, unless the player to move can capture the other king.

Each bullet is one `t('quantumchess', '...')` string of `rules()` (8 strings, the most IMPLEMENTING.md allows). The
shared rules card (`sharedRules()` in `src/variantplay/texts.js`, CORE-CHANGES U7) already says that castling is only
possible when it is possible in every possibility and is never rolled. The seventh bullet uses the wording of
`docs/rules.md` section 5 ("not 100% on its starting square"). The last bullet carries the exception of
`docs/rules.md` section 6 ("if you take your opponent's last piece with your king but land next to their king, the
game is not a draw"), which is exactly `worldResult` step 2; threecheck.md, whose rule is the same, should use the same
string (atomic.md need not: kings cannot capture there). Checked against the engine: the seventh bullet is C10, C11,
C14, C15 and C20; the eighth is C19.

---

## 6. UI layout

- **Board.** The ordinary 8 × 8 board from `rectTopology(8, 8)`:
  - square cells, shade `dark` when `(x + y)` is even and `light` otherwise;
  - file letters below and rank numbers on the left;
  - White at the bottom (layout y = 7 - rank index).
- **Pieces.** The cburnett sprites (`glyph: { sprite: 'k' | 'q' | 'r' | 'b' | 'n' | 'p' }`). There are no new pieces.
- **Castling input.**
  - When the king is selected and a castling move is legal, the castling rook's square gets the ordinary target
    marker. The board draws it as a ring, because the square holds a piece (`marks` in `useVariantGame.js`, the
    `target` mark of `VariantBoard.vue`); nothing variant-specific is needed.
  - Optional, not part of this spec's contract: a small castle badge on that square with the tooltip "Castle (O-O)"
    or "Castle (O-O-O)". The layout and mark API has no hook for it, so it would be a UI change for every variant
    that castles onto a rook.
  - Clicking the rook plays the castling move. The click handler looks for a move from the selected square to the
    clicked one before it re-selects, so a click on the own rook castles instead of selecting the rook. Castling is
    certain, so no confirmation box appears.
  - The king's end square is **not** a castling target. When it is empty and next to the king, it keeps its meaning
    of an ordinary king step.
  - **No ambiguity, also in quantum positions.** Castling needs the rook on its start square in every world (section
    4, items 2 and 3). So whenever castling is legal, no world has that square empty or holding an enemy piece, and
    no ordinary king move can end there at the same time. King onto rook is therefore unambiguous in every position
    the game can reach (C13).
    - Before decision D1 this was not so. A rook that stayed home in some worlds only kept its right there, and then
      `d1-c1` and `O-O-O` could both be legal with the same squares (8.1 item 7, old C13). D1 removes that case.
    - The click handler (`useVariantGame.js`) would still cope if two moves ever shared their squares: it puts both in
      `promoChoices`. But the box in `VariantGameView.vue` is worded for promotions ("Promote to", "Do not promote"),
      so a castling entry there would be mislabelled. This is optional hardening, not needed for Chess960.
  - After castling, the move list shows `O-O` / `O-O-O`.
  - Last-move marks (CORE-CHANGES Q9 and U1, built): the history record has `from` = the king's square and `to` = the
    move's `to` (`recordSquares` in quantum.js), and `lastMoveSquares` (`src/variantplay/marks.js`) marks them. So
    Chess960 marks the king's and the castling rook's start squares, in every castling shape (C4, C7).
- **Start position and new-game dialog (CORE-CHANGES U11, built).**
  - The dialog shows `describe(value)` under the number field, so players see the back rank before they start:
    "RNBQKBNR (518)".
  - The game view shows one line per option, with `describe(value)` in place of the value: "Start position (0–959):
    RNBQKBNR (518)". Because `describe` returns the number too, the line keeps what makes a game reproducible and
    comparable with lichess. (The first engine pass had asked the lead to change U11 for this; the variant-level
    string makes that unnecessary.)
  - `state.options.position` always holds the number, because the dialog passes `optionValues`.

---

## 7. Test cases

Positions use `worldFrom` placements, built with `stateOf` from `tests/js/variants/helpers.js`.
- `withCastle` is the edit function `(b) => { b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) } }`. It
  must set the whole `x`: when an edit function is given, the helper does not fill `x` itself. Without `withCastle`
  the helper sets `x = { ep: -1, epVictim: -1, castle: [] }`.
- "Two worlds, 50 % each" means two placements of relative weight 1, in the order listed (world A first). After a
  move the core sorts the worlds by their world key, so compare the worlds of a new state as a set, not by index.
- `V` is the variant with `worldResult` as in section 3. Castling moves are listed as `key>to`.
- Outcomes are the `key`s of `outcomes()` in their order (`miss`, `move`, `capture`). "Rolled" means `rolled: true`,
  and "not rolled" means a single outcome with `rolled: false`.
- Rights are written as the flags left in `x.castle` (`""` = none). With W5 the rights are identical in every world,
  so hand-built states must give every world the same king and rook squares on the back rank (all cases below do).

Every case below was run with its exact expected values on the **core of the working tree** (2026-09-25: W1
castling placement, W2 `toRook`, Q2 certain castling, Q3 with W5 rights that follow the state, W4, Q8, Q9), with the
variant built exactly as section 3 maps it; nothing emulated, no failure (8.2, second pass;
`handoff/tmp/critic-chess960/r2-v960.mjs`, `r2-cases.mjs`, `r2-new.mjs`, `r2-fuzz.mjs`; not committed).
- Before W1, every castling except the swap shape came out wrong (C4, C5: the king landed on the rook's square), and
  the rook-stays shape (C7, C17) threw.
- Before Q2 and W5, castling past a possible ghost rolled instead of being illegal (C10, C14, C17, C20), and a right
  survived in the worlds where the rook had stayed (C11, C13, C15); the first version of this spec described that
  (8.2).

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
- Invalid values fall back to the `rng` in `setup`: `setup({ position: -1 }, () => 0)` gives SP 0 (BBQNNRKR),
  `setup({ position: 12.5 }, () => 0.999)` gives SP 959 (RKRNNQBB), and `setup({ position: '77' }, () => 0)` gives
  SP 0 (a string is not a valid number; the dialog converts the field with `parseInt` before `optionValues`).
- `V.options[0].describe(518)` is `'RNBQKBNR (518)'`, and `describe(0)` is `'BBQNNRKR (0)'`.

**C3. First-move counts** (ordinary moves only, splits excluded; `legalMoves(V, newGame(V, { position }))`).

| SP | back rank | moves | why |
|---|---|---|---|
| 518 | RNBQKBNR | 20 | as in chess |
| 0 | BBQNNRKR | 20 | no castling: `O-O` needs f1 empty, and the a-side rook is on f1; `O-O-O` is blocked by Qc1 Nd1 Ne1 |
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
- The history record of `O-O` has `from: [g1]`, `to: [h1]`, `key: 'move'`, `rolled: false`, so the last-move marks
  are g1 and h1 (section 6). For `O-O-O` they are g1 and a1.
- (Before W1 the core gave Kh1 Rf1 for `O-O` and, with `to = a1`, Ka1 Rd1 for `O-O-O`: section 3, item 1.)

**C5. The king steps one square; castling is not confused with the king step.**
- Position: White Ra1, Kb1, Rh1; Black Ke8; `withCastle`.
- The moves from b1 are exactly `b1-a2`, `b1-b2`, `b1-c1`, `b1-c2`, `O-O-O>a1` and `O-O>h1`: the king step to c1 and
  `O-O-O` are separate moves with different `to` squares.
- `O-O-O` gives Kc1 Rd1 Rh1.
- `O-O` gives Ra1 Kg1 Rf1 (the king crosses c1-f1 and the rook crosses g1).
- Clicking b1 and then c1 in the UI plays the king step, not a castling: the only move from b1 to c1 is `b1-c1`.

**C6. Swap castling.**
- Position: White Ra1, Kf1, Rg1; Black Ke8; `withCastle`.
- `O-O` gives Ra1 **Kg1 Rf1**.
- Also Rc1 Kd1 Rh1: `O-O-O` (`to = c1`) gives **Kc1 Rd1** Rh1.

**C7. Only the king moves.** White Rd1, Ke1, Rh1; Black Ke8; `withCastle`. `O-O-O` (`to = d1`) gives **Kc1**, Rd1
unchanged, Rh1. It needs only c1 to be empty. Its history record has `from: [e1]`, `to: [d1]`. (Before W1 the core
threw `castling rook target occupied` here.)

**C8. Blocked castling.**
- Position: White Ra1, Nb1, Ke1, Rh1; Black Ke8; `withCastle`.
- `O-O-O` is **not** legal: b1 lies between the rook (a1) and its end square (d1).
- `O-O` is legal.
- In the start position of SP 0 (BBQNNRKR) neither side can castle. `O-O` (Kg1 stays, Rh1 → f1) is blocked because
  the a-side rook stands on f1, the h-side rook's end square. `O-O-O` (Kg1 → c1, Rf1 → d1) is blocked by Qc1, Nd1
  and Ne1. The same holds for Black on rank 8.

**C9. Castling rights.**
- From SP 518, play a2-a4, a7-a5, a1-a3, h7-h6, a3-a1, h6-h5. The rights are now `Kkq`: White has lost `Q` for
  good, although the rook is back on a1.
- Merging back, or returning the rook, never restores a right.
- After a king move, both of that side's rights are gone.

**C10. Quantum: a ghost on the castling path blocks castling.**
- Two worlds, 50 % each, `withCastle`: White Ra1, Ke1, Rh1; Black Ke8; a Black knight on g1 (world A) or h3
  (world B). Rights `KQ`.
- `O-O` is **not legal**: it is not in `legalMoves`, and `branches(V, s, 'O-O')` is null. (On the core before D1 it
  was a roll, `miss` 0.5 / `move` 0.5.)
- `O-O-O` is legal and certain: one outcome, `move` p = 1, not rolled (b1, c1 and d1 are empty in both worlds). It
  gives Kc1 Rd1 Rh1 in both worlds, with the knight still on g1 or h3.

**C11. Quantum: a partial slide loses the right everywhere; a Missed rook move keeps it.**
- Two worlds, 50 % each, `withCastle`: White Ra1, Ke1, Rh1; Black Ke8; a Black knight on h3 (world A) or a6
  (world B).
- `h1-h5` is **not rolled**: one outcome, `move` p = 1 (pass = link).
  - World A: the knight on h3 blocks the slide; the rook stays on h1.
  - World B: Rh5.
  - The rook is no longer 100 % on h1, so the right `K` is lost in **both** worlds: rights `Q`, `Q`.
- Black plays `e8-d8`. `O-O` is not legal (`branches` null).
- White measures `?h1` (outcomes `h1` p = 0.5 and `h5` p = 0.5, rolled) and gets `h1` (one world: Ke1 Rh1 Ra1,
  knight h3, rights `Q`); Black plays `d8-e8`.
  `O-O` is still not legal: the right does not come back.
- **A Missed rook move keeps the right.** Two worlds, 50 % each, `withCastle`: White Ra1, Ke1, Rh1; Black Ke8; a
  Black knight on h2 (world A) or h3 (world B).
  - `h1-h3` is rolled: `miss` p = 0.5 and `capture` p = 0.5.
  - After `miss` (one world: Rh1, knight h2, rights `KQ`) and Black's `e8-d8`, `O-O` has one outcome, `move` p = 1:
    Kg1 Rf1, rights `""`.
  - After `capture` (one world: Rh3, rights `Q`) and Black's `e8-d8`, `O-O` is not legal.

**C12. Castling on move 1.**
- `newGame(V, { position: 3 })`: `O-O` is legal at once (`to = g1`, the rook's square) and gives Kg1 Rf1 (from Kf1
  Rg1). The rights become `kq`. Black may then answer `O-O` at once (`to = g8`): Kg8 Rf8, rights `""`.
- `newGame(V, { position: 74 })` (NNRKBBQR): `O-O-O` is legal at once (`to = c1`) and gives Kc1 Rd1 (from Kd1 Rc1).
  Black's `O-O-O` then gives Kc8 Rd8, rights `""`.

**C13. Quantum: king onto rook stays unambiguous (section 6).**
- Two worlds, 50 % each, `withCastle`: White Rc1, Kd1, Rh1; Black Ke8; a Black knight on c3 (world A) or a6
  (world B). Rights `KQ` (the rook on c1 is next to the king: the swap shape of SP 74).
- `c1-c5` is **not rolled**: one outcome, `move` p = 1 (pass = link).
  - World A: the knight on c3 blocks the slide; the rook stays on c1.
  - World B: Rc5.
  - The right `Q` is lost in both worlds (rights `K`).
- Black plays `e8-f8`.
- From d1 to c1 there is exactly **one** legal move, `d1-c1`, and `O-O-O` is not legal. `d1-c1` is rolled:
  - `miss` p = 0.5: world A, the own rook is on c1 (Rc1 Kd1 Rh1, rights `K`);
  - `move` p = 0.5: world B, Rc5 Kc1 Rh1, rights `""`.
- Clicking d1 and then c1 plays the king step; no choice box appears.
- The same holds for the hand-built state of the old C13, which gave its two worlds different rights (world A: Rc1
  Kd1 Rh1, rights `KQ`; world B: Rc5 Kd1 Rh1, rights `K`; Black Ke8). The moves to c1 are only `c5-c1` and `d1-c1`,
  because `O-O-O` is missing in world B. Such a state cannot arise in a game once W5 is in.

**C14. Quantum: an own ghost rook on the other castling's end square (the SP 0 shape); a measurement clears it.**
- Two worlds, 50 % each, `withCastle`: White Rf1, Kg1, Rh1; Black Ke8; a Black knight on d1 (world A) or a6
  (world B). Rights `KQ` in both (K: rook h1, the king stays on g1; Q: rook f1).
- `f1-a1` is **not rolled**: one outcome, `move` p = 1 (pass = link).
  - World A: the knight on d1 blocks the slide; the rook stays on f1.
  - World B: Ra1.
  - The right `Q` is lost in both worlds (rights `K`). White's budget is 2.
- Black plays `e8-f8`.
- `O-O` (the king stays on g1, the h-side rook goes to f1) needs only f1 empty. It is **not legal**, because f1 may
  hold White's other rook. `O-O-O` is not legal either (no `Q` right).
- White measures `?a1`: rolled, `a1` p = 0.5 and `f1` p = 0.5.
  - After `a1` (one world: Ra1 Kg1 Rh1, knight a6, rights `K`) and Black's `f8-e8`, `O-O` has one outcome, `move`
    p = 1: Ra1 Kg1 Rf1, rights `""`.
  - After `f1` (one world: Rf1 Kg1 Rh1, knight d1, rights `K`) and Black's `f8-e8`, `O-O` is still not legal: f1 is
    taken.

**C15. Quantum: split, merge and the castling right.**
- `withCastle`: White Ra1, Ke1, Rh1; Black Ke8 (rights `KQ`).
- `h1-h4|h6`: one outcome, `split` p = 1. Two worlds (Rh4, Rh6), rights `Q` in both. `O-O` is not legal.
- Black `e8-d8`; White `h4|h6-h1`: one outcome, `move` p = 1. One world: Ra1 Ke1 Rh1, Black Kd8, rights `Q`.
- Black `d8-e8`: `O-O` is still not legal; `O-O-O` is.
- **A partly blocked split.** Two worlds, 50 % each, `withCastle`: White Ra1, Ke1, Rh1; Black Ke8; a Black knight on
  h3 (world A) or a6 (world B).
  - `h1-h2|h5` (one outcome, `split` p = 1) gives four worlds of 25 % each:
    - world A: Rh2, and Rh1, because the path to h5 is blocked and the rook stays;
    - world B: Rh2 and Rh5.
  - The rook is no longer 100 % on h1, so the right `K` is lost in all four worlds (rights `Q`), including the one
    where the rook stayed.
  - After Black's `e8-d8`, `O-O` is not legal; `O-O-O` is.

**C16. No check conditions, and the quiet counter.**
- `withCastle`, state `quiet: 7`: White Ra1, Ke1, Rh1; Black Ka8, Re6, Rf6, Rg6 (they attack e1, f1 and g1).
- `O-O`: one outcome, `move` p = 1, not rolled: Ra1 Kg1 Rf1, rights `""`, `quiet` becomes 8, no result.
- `O-O-O` likewise: Kc1 Rd1 Rh1, rights `""`, `quiet` 8.

**C17. Quantum: only the vacancy set counts.**
- Two worlds, 50 % each, `withCastle`: White Rd1, Ke1, Rh1; Black Ke8; a Black knight on b1 (world A) or a3
  (world B).
- `O-O-O` (the rook stays on d1) needs only c1 empty: one outcome, `move` p = 1, not rolled. Both worlds keep their
  knight: Kc1 Rd1 Rh1 with the knight on b1 or a3, rights `""`.
- With the knight on c1 instead of b1, `O-O-O` is not legal.
- (Before W1 the core threw here, as in C7.)
- **The swap shape has an empty vacancy set.** Two worlds, 50 % each, `withCastle`: White Ra1, Kf1, Rg1; Black Ke8;
  a Black knight on h1 (world A) or e1 (world B). Rights `KQ` in both.
  - `O-O` (Kf1 Rg1 → Kg1 Rf1) needs no square at all: one outcome, `move` p = 1, not rolled. The worlds become Ra1
    Kg1 Rf1 with the knight on h1 or e1, rights `""`.
  - `O-O-O` is not legal: e1 lies on the king's path to c1.

**C18. Random games over every castling shape.** The shared fuzz test (`tests/js/variants/fuzz.spec.js`) starts
every game from `optionValues(V, {})`, so for this variant it only ever plays SP 518. The variant's own spec file
must therefore play random games from other start positions.
- Start positions 0, 3, 10, 15, 74, 95, 249, 518, 534 and 959. Together they have all eight shapes: `O-O` and `O-O-O`,
  each with king stays, rook stays, swap and both move.
- 12 seeds per position (for example `seededRng(seed * 7919 + position)`), 90 plies each. Play a castling move
  whenever one is legal. Otherwise play a split on every 4th ply as `fuzz.spec.js` does, and on other plies prefer
  (with probability 0.6) a move of a back-rank piece that is not a king or a rook.
- After every move, the invariants of `fuzz.spec.js` hold, plus:
  - CORE-CHANGES IT8: `x.castle` is identical in all worlds;
  - every right's king and rook stand on its `king` and `rook` squares in every world;
  - a castling key is in `legalMoves` exactly when every world's `generate` has it (the certain rule);
  - every world has the same number of pieces of each side (section 4, item 5).
- Every castling has exactly one outcome (`move`, not rolled). Afterwards, in every world, the king stands on that
  right's `kingTo` and the rook on its `rookTo`, and the side has no right left. The history record has
  `from: [right.king]` and `to: [right.rook]`.
- Reference run on the core of the working tree: 120 games, 9,766 plies, 206 castlings (81 of them in a superposed
  state) covering all eight shapes, none rolled or missed, no failure, about 1.1 s (`r2-fuzz.mjs`). Before W1, 81 of
  the 120 games failed.

**C19. Bare kings.**
- White Ke4; Black Kh8, pd5. `e4-d5`: one outcome, `capture` p = 1. The result is
  `{ winner: null, reason: 'bareKings' }`.
- White Ke5; Black Kf7, pe6. `e5-e6` takes the last piece next to the Black king: no result, because Black, to move,
  can capture the White king. Black's `f7-e6` then gives `{ winner: 1, reason: 'king' }`.
- Two worlds, 50 % each: White Ke4; Black Kh8; a Black knight on d5 (world A) or a8 (world B). `e4-d5` is rolled:
  `move` p = 0.5 (the knight was on a8; no result) and `capture` p = 0.5 (bare kings; draw). The capture roll alone
  decides; no `end:` note appears.

**C20. Quantum: enemy moves and the castling right.**
- **An enemy capture of the castling rook in some worlds is a roll.** Two worlds, 50 % each, `withCastle`, Black to
  move (`turn` 1): White Ra1, Ke1, Rh1; Black Ke8; a Black bishop on e4 (world A) or a6 (world B). Rights `KQ`.
  - `e4-h1` is rolled: `miss` p = 0.5 and `capture` p = 0.5.
  - After `miss` (one world: Ra1 Ke1 Rh1, bishop a6, rights `KQ`), White's `O-O` has one outcome, `move` p = 1.
  - After `capture` (one world: Ra1 Ke1, Black bishop h1, rights `Q`), White's only castling is `O-O-O` (`to = a1`).
- **An enemy slide that links leaves a ghost that blocks.** Two worlds, 50 % each, `withCastle`, Black to move: White
  Ra1, Ke1, Rh1, a White knight on c4 (world A) or a3 (world B); Black Ke8, Rc8. Rights `KQ`.
  - `c8-c1` is **not rolled**: one outcome, `move` p = 1 (pass = link). World A: the knight on c4 blocks the slide,
    the rook stays on c8. World B: Black Rc1. White keeps `KQ` in both worlds (nothing touched a1, e1 or h1).
  - White's castling moves are then only `O-O` (`to = h1`), with one outcome, `move` p = 1. `O-O-O` is not legal: c1
    may hold the Black rook.

---

## 8. Review notes

Open questions left by the research (kept; 1 and 2 are settled and built, 3 is still open):

1. **Core fixes needed.**
   - (a) `applyClassical` must place the king on `m.extra.kingTo`.
   - (b) `castlingMoves` needs a `toRook` option.

   Both are described in section 3. (a) is a real bug for every Chess960 position where the king starts on c1/g1 and
   castles to that side (SP 0 after f1 is cleared, for example); C4 fails without it. Re-checked in the rules review
   on the core of 2026-09-25: Ra1 Kg1 Rh1, `O-O` still gives Kh1 Rf1.

   Engine review: both are now planned in `handoff/CORE-CHANGES.md`: (a) is W1 (lead decision D4) and (b) is W2.
   (a) is required. With this spec's `to` it matters for every castling in which the king does not land on the
   rook's square, and C7 and C17 even throw without it. (b) is convenient but not required, because the variant can
   map `to` itself (section 3). See 8.2.

   Engine review, second pass: **built.** Both are in the core of the working tree (`placeCastling` in world.js,
   `castlingMoves(..., { toRook: true })` in orthodox.js, with tests in `tests/js/variants/core-world.spec.js`), and
   every case of section 7 passes on it with the variant mapped as section 3 says.
2. **Castling past a ghost.** Here it is a roll (the variants core). Classic Quantum Chess forbids it instead. I kept
   the core behaviour for consistency across all orthodox variants; changing it would be a core decision for all of
   them.

   Engine review: **decided.** The lead's binding decision D1 (`handoff/CORE-CHANGES.md`) adopts the classic rule
   for every variant: castling is certain and never rolled (Q2), and rights follow the state (Q3 with W5). This spec
   now follows D1 in section 4 (items 2, 3, 4, 6 and 8), the rules card, section 6 and tests C10, C11, C13, C14, C15,
   C17 and C18. See 8.2.

   Engine review, second pass: **built** (`isCertain` and the certain-key filter of `table` in quantum.js,
   `unifyCastling` inherited from `orthodoxSpec()`); C10, C11, C13-C15, C17, C18 and C20 pass on it.
3. **Chess960 elsewhere.** Should King of the Hill, Three-check or Atomic also offer a Chess960 start as an option?
   Lichess does not, so I did not specify it. pychess.org does (King of the Hill 960, Three check 960, Atomic960,
   Crazyhouse960 and others: `handoff/ext/pychess-variants/server/variants.py`). Supporting it would only need the
   `position` option and `backRank960()` in those modules.

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity. Every classical rule was checked against the sources below (opened this time,
not search extracts), and every section 7 case was re-run on the real core (see the note at the top of section 7).

Confirmed without change: the board, square names and colours (a1 dark; `rectTopology` shades `(x + y)` even as
dark); the piece moves (`orthodoxTypes`); the setup constraints; the Scharnagl numbering, the knight table, the
inverse formula and all 14 test vectors; the king-file distribution; the castling end squares, the vacancy rule and
the four castling shapes; double step, en passant and promotion; the first-move counts of C3 (18: 22, 19: 336,
20: 540, 21: 62 positions) and the 162 positions with castling on move 1, recomputed with an independent counter
that does not use the core (`handoff/tmp/rev-c960-rules/indep.mjs`); test cases C1-C12.

Changes:

1. **Section 1, sources table: exact references and one more source.** The table now cites the FIDE article numbers
   (II.1, II.2, II.3.1, II.3.2.1-4, II.3.2.6, II.3.2.7), adds the Laws articles that Guidelines II inherits (3.7.3.3,
   3.8.2, 3.9, 5.1.1, 5.2.1, 5.2.2, 9.2, 9.3, 9.6), and adds scalachess. It also quotes lichess exactly, and names
   the Wikipedia table "N5N". The research had only search extracts. Sources:
   https://handbook.fide.com/chapter/e012023, https://lichess.org/variant/chess960,
   https://en.wikipedia.org/wiki/Chess960_numbering_scheme,
   https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/variant/Chess960.scala.
2. **Section 2.3: numbering cross-checked against lichess.** `backRank960(n)` equals scalachess's
   `initialPositionsStr(n)` for all 960 n, so position numbers mean the same as on lichess. Before, it was checked
   only against 3 anchors. Source: scalachess `Chess960.scala` (local clone `handoff/ext/scalachess`).
3. **Section 2.4: castling rules made exact.**
   - FIDE's current names c-side / g-side castling are added.
   - FIDE notation `0-0` (zeros) is kept apart from the keys `O-O` (letter O).
   - The right-loss rule is given as FIDE states it (king moved; that rook moved or captured).
   - Squares outside the two vacancy ranges may stay occupied (FIDE II.3.2.7 example). The squares strictly between
     the king and the castling rook always lie inside the ranges; this was checked for every king and rook file.
   - The FIDE names of the four methods are added.
   - The 162 first-move castling positions split as 90 `O-O` + 72 `O-O-O`, never both.
   - Promotion is to a piece of the pawn's own colour.

   Source: FIDE Handbook Guidelines II.3 and Laws Art. 3.7.3.3, 3.8.2.1 (https://handbook.fide.com/chapter/e012023).
4. **Section 2.4: the classical check condition is stated correctly.**
   - It said "out of, through or into check".
   - Chess960 forbids castling when the king is in check, when any square from the king's start square to its end
     square is attacked, or when the king would be in check after castling.
   - The quantum drop of all three is unchanged; section 4, item 1 now names the same three conditions.

   Sources: FIDE Laws Art. 3.8.2.2 and 3.9.2; https://en.wikipedia.org/wiki/Chess960 ("no square from the king's
   initial square to its final square may be under attack"); https://lichess.org/variant/chess960.
5. **Section 2.5: win, draw and turn order split into the classical rules and the rules actually applied.**
   - The classical list was incomplete: it now has the dead position, fivefold repetition and the 75-move rule.
   - The quantum part did not say which draws exist. They are: 100 quiet plies (`quietPlies`), the 600-ply move limit
     (`maxPly`), and no legal move (`noMoves`). There is no repetition or insufficient-material draw.

   Sources: FIDE Laws Art. 5.1.1, 5.2.1, 5.2.2, 9.2, 9.3, 9.6; `docs/variants.md`; `src/variants/core/quantum.js`
   (`stateAfter`); `src/variants/core/variant.js`.
6. **Section 3, `setup`: the pseudo-code used `n` before defining it** and wrote a chained comparison
   (`0 <= n <= 959`), which is always true in JavaScript. It is replaced by a correct expression. Source: the code
   itself; `optionValues` in `src/variants/core/variant.js` applies the same range check.
7. **Sections 1, 6 and 7 (new C13): "king onto rook" is not always unambiguous in a quantum position.**
   - The ambiguity: if the castling rook is home in some worlds and its start square is empty and next to the king in
     others, the king step and the castling have the same from and to squares.
   - Reproduced on the core with the spec's move generation: `O-O-O` and `d1-c1` are both legal with from d1, to c1.
   - The UI must offer a choice. The claim "unambiguous in all 960 positions" now holds only for classical positions.

   Source: the run in `handoff/tmp/rev-c960-rules/amb.mjs`; the lichess input rule
   (https://lichess.org/variant/chess960) assumes a classical position.
8. **Section 5, rules card: the vacancy sentence is exact and two facts are added.**
   - It said every square the king and rook cross or land on must be empty. That is false whenever one of them
     crosses or lands on the other's square: in transposition castling, in king-move-only castling (the king passes
     the rook) and in cases such as Ra1 Kb1 `O-O-O` (the rook passes the king). It now excepts the king and that rook,
     as FIDE II.3.2.7 does.
   - The swap shape is added.
   - The line "There is no check, so you may castle out of, through or into attack" is added. Chess players would
     otherwise assume the classical restriction; `docs/rules.md` section 5 states the same for classic Quantum Chess.

   Source: https://handbook.fide.com/chapter/e012023.
9. **Section 7, C8 and the SP 0 row of C3: the reason why SP 0 cannot castle is corrected.**
   - The old text said "because the other rook stands on f1/f8". That explains only `O-O`, where f1 is the h-side
     rook's end square.
   - `O-O-O` is blocked by Qc1, Nd1 and Ne1 on the king's path.
   - Verified by running the case, for Black as well.
10. **Section 8, open question 3: pychess.org does offer 960 starts** for King of the Hill, Three-check, Atomic and
    other variants. Lichess does not. Source: `handoff/ext/pychess-variants/server/variants.py` (`chess960=True`
    variants).
11. **Section 8 renamed "Review notes"**, with the research's open questions kept at its start, as the review task
    requires.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency. The review ran in two passes. The first pass ran while the
CORE-CHANGES packages were only planned, so it emulated them. The second pass re-checked the whole spec on the core
as built in the working tree and is at the end of this section.

#### First pass (planned core)

I read `IMPLEMENTING.md`, `CONTRACT.md`, the core
(`quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`), `docs/rules.md`,
`docs/engine-rules.md` §4.5-4.6, the UI click handler and choice box (`useVariantGame.js`, `VariantGameView.vue`,
`VariantsView.vue`) and `handoff/CORE-CHANGES.md`, which appeared during the review. Every case in section 7 was run
twice. The first run used the core as built today (W1 emulated, or left out to show the bug). The second used the
planned core: W1 through an `apply` hook, W2 through the mapping of section 3, and Q2 and Q3 through a patched copy of
`quantum.js`. The scripts are in `handoff/tmp/critic-chess960/` and are not committed. Reviewer 1's classical
corrections (8.1) are kept, except items 7 and 5, as explained in changes 3 and 4 below.

Changes:

1. **Section 3, fix 1 (`applyClassical`): the reach of the bug made exact.**
   - The spec said the bug hits positions where the king starts on c1/g1 and castles to that side.
   - With this spec's `to` (always the rook's square), it hits every castling except the swap shape. C4 and C5 give
     Kh1 or Ka1, and the rook-stays shape (C7, C17) throws `castling rook target occupied` inside `branches`. That
     would break the board and the computer player.
   - Biased random games (C18) on today's core: 81 of 120 games fail; with the fix, none.
   - The fix is now tied to CORE-CHANGES W1, with a smaller equivalent fix and the `apply`-hook fallback.
   - Evidence: `c1_13.mjs` with `FIX=0`, `verify3.mjs`, `fuzz960.mjs`.
2. **Section 3, fix 2 (king onto rook): not a hard core need.**
   - The variant can map `to` to `w.sq[m.extra.rook.id]` itself. That is the right's rook square, because
     `castlingMoves` only emits a move when that rook stands there.
   - The spec now uses W2 (`{ toRook: true }`) and gives this mapping as the fallback. All cases were run with the
     mapping.
3. **Sections 3-7: the spec follows the lead's binding decision D1.**
   - D1 (CORE-CHANGES Q2, Q3 with W5): castling is certain and never rolled, and a right is lost everywhere as soon
     as the king or that rook is not 100 % on its square.
   - The spec had described the core as built: castling rolled and rights kept per world. Rewritten: section 3
     (move kind, rights), section 4 (items 2, 3, 4, 6, 8), the rules card, section 6, and tests C10, C11, C13, C14,
     C15, C17, C18.
   - This replaces reviewer 1's item 7, the C13 ambiguity, for a strong reason: under D1 it cannot arise.
     Castling needs the rook on its square in every world. So when castling is legal, no world has that square
     empty or holding an enemy, and no king step can end there. The new C13 pins this, and the old hand-built C13
     state now offers only `d1-c1` and `c5-c1`.
   - As a result, the UI choice box for castling is no longer needed.
4. **Section 2.5, section 3 `worldResult`, rules card, C19: bare-kings draw added.**
   - Reviewer 1 wrote that material draws are "not applied, as in every other variant". That is no longer true:
     Three-check, Atomic and Hyper 4D draw bare kings, and so does classic Quantum Chess (`docs/rules.md` section 6).
     CORE-CHANGES item 40 lists Chess960 among the variants with reason `bareKings`.
   - The spec now uses the threecheck.md rule: only the two kings are left and the side to move cannot capture the
     enemy king. It is the capture-the-king form of FIDE Art. 5.2.2 for king against king.
   - The rules card uses the same string as threecheck.md and atomic.md.
   - Engine check: every capture is rolled by itself, so all worlds of a state have the same number of pieces, and
     the kings are solid. The bare-kings test therefore never needs the game-end roll (C19, third part).
   - The lead may drop this; the rest of the spec does not depend on it.
5. **Section 3: inherited hooks.** `unifyWorlds` (W5) and `applyMiss` (W4) come from `orthodoxSpec()` and must not be
   overridden.
6. **Section 3: `describe` option field.** Added for U11 (`backRank960(n).toUpperCase()`, not translated).
7. **Section 4: the quantum decisions made explicit**, each with a test.
   - Only the vacancy set counts (C17).
   - Measuring an own ghost can clear the way (C14).
   - A rolled Missed rook move keeps the right; a measurement never gives a lost right back (C11).
   - A rook split whose one path is blocked still loses the right everywhere (C15).
   - Castling never causes a follow-up solid roll or game-end roll.
   - The budget can only drop.
   - The keys and `to` are the same in every world.
   - Castling does not reset the 100-ply counter (C16).
8. **Section 5: the rules card matches D1 and the engine.**
   - The castling line now says a ghost blocks castling and uses `docs/rules.md`'s wording for losing the right.
   - Before, it said "a roll decides", which is false under D1.
   - The bare-kings line was added. That makes 8 strings, the maximum.
9. **Section 6: the UI plan follows the core plan.**
   - The ambiguity bullet is replaced by the argument of change 3. The promotion wording of the choice box is kept
     as optional hardening.
   - Last-move marks: `legalFromHistory` marks nothing for `O-O` today, in every orthodox variant. CORE-CHANGES Q9
     and U1 fix that.
   - Start position: CORE-CHANGES U11.
10. **Section 7: exact conventions and new cases.**
    - `withCastle` must set the whole `x`: with an edit function, `stateOf` does not fill `x`.
    - Worlds are listed in order, and outcome keys and rights are written exactly.
    - Hand-built worlds must share their king and rook squares, because with W5 the rights are identical in all
      worlds.
    - C4 and C7 name the result without W1. C12 adds Black's reply.
    - New cases:
      - C14: an own ghost rook blocks the other castling.
      - C15: split, merge and a partly blocked split.
      - C16: no check conditions; the quiet counter.
      - C17: the vacancy set only.
      - C18: random games over all eight castling shapes.
      - C19: bare kings.
    - C18 is needed because the shared `fuzz.spec.js` starts every game from `optionValues(V, {})`, so it only
      plays SP 518 and never reaches a 960 castling shape.

**Core changes needed** (first pass; all already in `handoff/CORE-CHANGES.md`, nothing new was asked, and all four are
built now: see the second pass):

1. **W1, castling placement in `applyClassical` (bug fix, required before the variant).** For a move with
   `extra.rook`, place the king on `m.extra.kingTo ?? m.to` and the rook on `extra.rook.to`, lifting both first (or
   the smaller fix of section 3), and throw if either target holds another piece. Results: Ra1 Kg1 Rh1 `O-O` gives
   Kg1 Rf1; Rd1 Ke1 `O-O-O` gives Kc1 Rd1 without throwing; the swaps give Kg1 Rf1 and Kc1 Rd1. Why not a variant
   hook: only a full `apply` replacement could do it, which copies `applyClassical` into the variant. The bug is in
   the core's own `castlingMoves` / `applyClassical` pair, and capablanca and trid need the same fix.
2. **Q2, castling is certain (D1).** A key whose move has `kind: 'castle'` in some world is legal only when every
   world generates it. It is then played in every world, with the one outcome `move`. Why not a variant hook:
   `filterMoves` and `extraMoves` see one world. Only the core's move table sees all worlds.
3. **Q3 with W5, rights follow the state (D1).** After every move, before `dedupe`, every world keeps only the
   `x.castle` entries present in every world of the chosen branch. Why not a variant hook: `afterMove` sees one world,
   and no hook sees the chosen branch today.
4. Optional: **W2**, `castlingMoves(V, w, side, { toRook: true })`. The variant can do it itself (change 2).

Not core, for the lead:
- **UI (U11).** For a number option with `describe`, show the number and the description in the game-info line
  ("518 (RNBQKBNR)"). U11 as written shows the description instead of the value, and the number is what players
  use to replay or compare a start position. (Superseded by the second pass, change 3: `describe` returns the number
  too, so U11 stays as built.)
- **UI (optional).** A castle badge on the rook's square. The target marker already works, because `to` is the rook's
  square.
- **Tests.** `fuzz.spec.js` could draw `random: true` number options from its rng instead of using the defaults.
  Until then the chess960 spec file carries C18.

#### Second pass (core as built, 2026-09-25)

I re-read `IMPLEMENTING.md`, `CONTRACT.md`, `handoff/CORE-CHANGES.md` and the core of the working tree (`quantum.js`
with `isCertain`, `idleApply`, `unifyWorlds` and `recordSquares`; `world.js` with `placeCastling`; `orthodox.js` with
`castlingMoves(..., { toRook })`, `clearEnPassant` and `unifyCastling`; `orthodoxVariant.js`; `variant.js`; `ai.js`),
the UI parts the spec relies on (`useVariantGame.js` click handler and marks, `marks.js`, `texts.js`,
`VariantsView.vue`) and `docs/rules.md` sections 5 and 6. The core tests pass (`core.spec.js`, `core-world.spec.js`,
`core-quantum.spec.js`: 89 tests). I built the variant exactly as section 3 maps it
(`handoff/tmp/critic-chess960/r2-v960.mjs`) and ran every case of section 7 with its exact expected values on that
core, with no emulation (`r2-cases.mjs`, `r2-new.mjs`, `r2-fuzz.mjs`, `r2-ai.mjs`; not committed). All pass.
Reviewer 1's classical corrections (8.1) are unchanged.

Changes:

1. **Sections 3, 6, 7 and 8: the spec now describes the core as built.** W1, W2, W4, W5, Q2, Q3, Q8, Q9, U1, U7 and
   U11 are in the working tree. The "one core fix is required" block of section 3 now says what the core does, with
   the pre-W1 failures kept as history; the `to` mapping "until W2 exists", the `apply`-hook fallback and every
   "planned core" / "current core" remark are gone. Why: an implementer following the old text would have added a
   mapping or an `apply` copy that the core no longer needs.
2. **Section 7 re-run on the real core.** C1-C19 give exactly the values the spec states. The only thing the spec did
   not say is that a new state's worlds are sorted by world key, so after a move they must be compared as a set (C10's
   result, for example, lists the h3 world first); the conventions now say so.
3. **Section 3 `options`, section 6: the start-position line keeps its number without a core change.** U11 as built
   shows `describe(value)` instead of the value in the game view, which the first pass wanted the lead to change.
   `describe` now returns the back rank and the number ("RNBQKBNR (518)"), so the game view reads "Start position
   (0–959): RNBQKBNR (518)" and U11 stays as it is.
4. **Section 5, last bullet: the bare-kings sentence was incomplete.** "The game is a draw when only the two kings
   are left" contradicts `worldResult` step 2 and C19's second part: when the king takes the last piece next to the
   enemy king, the game goes on and the enemy takes the king (`docs/rules.md` section 6 says the same). New string:
   "The game is a draw when only the two kings are left, unless the player to move can capture the other king."
   threecheck.md has the same rule and should use the same string; atomic.md need not (kings cannot capture there).
5. **Section 4, item 5: the reason why the bare-kings test never rolls is stated exactly.** "Every capture is settled
   by its own roll" is not true for a capture possible in every world (not rolled) or for en passant (certain). The
   true fact is that a move captures in every world of the chosen outcome or in none, so all worlds have the same
   number of pieces of each side. C18 now checks that after every move (9,766 plies, no exception).
6. **Section 4, item 4: split and merge paths.** They skip every certain move (`noPath`: castling and en passant),
   not only `kind === 'castle'`, as the built core does.
7. **Section 3, rights: a right implies the original pieces.** `castlingMoves` checks only the type and side of the
   pieces on the right's squares, not their ids. The spec now says why that is safe: any move from or onto the king's
   or the rook's square, in any world, has already dropped the right, so while it exists the original king and rook
   stand there in every world. C18 checks the squares after every move.
8. **Section 6, castling input.**
   - "a castling move is legal in some world" was wrong under D1: a certain move is legal only in every world.
   - The target on the rook is the ring the board already draws for an occupied target; the castle badge and its
     tooltip are optional, because the mark API has no hook for them.
   - The click handler looks for a move from the selected square to the clicked one before it re-selects, so
     clicking the own rook castles (checked in `useVariantGame.js`); castling is certain, so no confirmation box
     opens.
   - Last-move marks are built: the record has `from` = the king's square and `to` = the rook's square (C4, C7, C18).
9. **Section 7: new and sharper cases for the riskiest rules.**
   - C2: invalid option values fall back to the `rng` (-1, 12.5, a string), and the `describe` string.
   - C4, C7: the history record's squares for the king-stays and rook-stays shapes (what the last-move marks use).
   - C5: the exact move list from b1; C11: the measurement's outcomes.
   - C17, third part: the swap shape has an empty vacancy set, so ghosts next to it never block it, while the same
     ghost on the king's path blocks the other castling.
   - C18: four more invariants (the rights' pieces in every world, the certain rule, equal piece counts, the record
     squares) and the measured reference run (206 castlings, 81 of them in a superposed state).
   - C20 (new): enemy moves and the right. A capture of the castling rook possible in some worlds is a roll, and only
     its Captured outcome loses the right; an enemy slide that links through the castling path blocks that castling
     while the other one stays certain. No case covered enemy actions against a right before.
10. **Computer player.** `chooseMove` (easy and normal) returns a legal move on SP 3 and on a superposed state with a
    castling available (`r2-ai.mjs`); no spec change.
11. **Section 8, open questions 1 and 2** are marked as built.

**Core changes needed** (second pass): none. Every core feature the spec uses is built; the variant needs only the
hooks and fields of section 3.

Not core, for the lead:
- **threecheck.md**: use the bare-kings string of change 4, so both variants share one translation.
- **Tests** (kept from the first pass): `fuzz.spec.js` could draw `random: true` number options from its rng instead
  of using the defaults. Until then the chess960 spec file carries C18.
- **UI** (optional, kept): a castle badge on the rook's square needs a new mark kind in the board; the ring target
  already works.
