# Variant spec: `capablanca` (Capablanca chess)

Category: **`boards`**, as in `catalog.js`. The placeholder `src/variants/capablanca.js` says `'rules'` and must be
changed. UI name: "Capablanca chess". Catalog summary (already in `catalog.js`): "A 10 × 8 board with the archbishop
and the chancellor."

Every expected result in section 7 was run on a prototype built on the real variant core, at commit `e0369f5` with
`src/variants/core/` unchanged. The prototype is in `handoff/prototypes/capablanca/`:

| File | What it does |
|---|---|
| `proto.mjs` | The module of section 3 as first written, without the two hooks `applyMiss` and `unifyWorlds` (added for D1/D2, see below). The sketch of section 3 line for line, hooks included, is `handoff/tmp/critic-capablanca/eng_proto.mjs`. |
| `cases.mjs` | Every case of section 7 as first written: 72 checks, all passing at `e0369f5`. Its Q1 and Q2 predate D1 (see below); on the current core it stops with an exception at Q1, after T1–T9. Run it with `node handoff/prototypes/capablanca/cases.mjs`. |
| `perft.mjs` | Perft with the classical check rule added. It gives 28 / 784 / 25 228 / **805 128**, the same as Fairy-Stockfish `tests/perft.sh` at depth 4. |
| `fsfcastle.mjs` | Reproduces the three Capablanca castling tests of Fairy-Stockfish `test.py` (`test_castling`) exactly. |
| `fuzz.mjs` | 20 random games of up to 120 plies, with splits every 4th ply and the invariants of `fuzz.spec.js`. They take 0.4 s in total and reach at most 8 worlds. It also times the computer player. |
| `selfplay.mjs` | The computer at level normal against itself for 80 plies: 1.3 s in total, 81 ms for the slowest move. |
| `dump.mjs` | Prints the exact outcomes and worlds of the quantum cases. |

**Castling and en passant follow the lead's decisions D1 and D2** (`handoff/CORE-CHANGES.md`): both are *certain*
moves, legal only when every world allows them, and a castling right is lost as soon as the king or that rook is not
100 % on its start square. The core in the working tree already has them. `cases.mjs` was written before, so its Q1
and Q2 now fail on purpose (the old rolled castling). The D1/D2 versions of Q1, Q2, Q9, Q10 and Q11 were run on the
current core with the two hooks of section 3 added (`handoff/tmp/rev1-capablanca/r2_proto.mjs` and `r2_cases.mjs`);
the other 64 checks of `cases.mjs` pass unchanged with the hooks (`r2_cases_rest.mjs`).

The engine review (section 8.2) re-ran all of them on the section 3 sketch line for line
(`handoff/tmp/critic-capablanca/eng_proto.mjs`; `eng_rest.mjs` and `eng_d1.mjs` are reviewer 1's two scripts pointed
at it: 64 + 29 checks pass). It also checked the details the earlier scripts left out and the cases it added (Q3b,
the rook part of Q11, Q12, the danger values of Q6 and Q7) with `eng_cases.mjs`: 32 of 32 pass. `eng_fuzz.mjs` plays
random games with extra castling and en passant invariants (section 8.2).

The partial prototype in `handoff/prototypes/capamak/` from the stopped researcher had the right setup, pieces and
castling files. It is superseded by this folder: its piece values changed, and its import paths point to the old
cloud checkout.

---

## 1. Sources and chosen rule set

| Source | What it gives |
|---|---|
| Wikipedia, "Capablanca chess", https://en.wikipedia.org/wiki/Capablanca_chess (raw wikitext, fetched 2026-09-25) | **Setup:** the diagram shows rank 1 as R N A B Q K B C N R, with the caption "The archbishops are on c1/c8; the chancellors are on h1/h8" (Gollon 1968, Schmittberger 1992). **Rules:** "the king moves three squares when castling instead of moving two squares as in standard chess"; "A pawn can promote to archbishop or chancellor in addition to the regular promotion options"; "each king, instead of each queen, starts on a square of its own color". **History:** 1920s (a 1926 article); the 10 × 10 versions had pawn triple steps; Edward Lasker wrote that he and Capablanca found 10 × 8 preferable (the lead paragraph adds that Capablanca himself preferred 10 × 10, citing Winter, while the game is "usually played on a 10×8 board"). **Values:** H. G. Muller (Q 9.5, C 9, A 8.75, R 5, B 3.5 + 0.5 pair, N 3, P 1) and Ed Trice (Q 8.75, C 8.25, A 6.75, R 4.75, B 3, N 2.5). |
| chessvariants.com, "Capablanca's chess", https://www.chessvariants.com/large.dir/capablanca.html (the live site sits behind a Cloudflare check, so it was read through web.archive.org) | Lists the historical setups and then "the final version upon which Capablanca settled": "King f1; Queen e1; Archbishop c1; Chancellor h1; Rook a1, j1; Knight b1, i1; Bishop d1, g1; Pawn a2 … j2", with Black on the same files of ranks 8 and 7. "When a player castles, the king always moves three squares towards the rook." "Pawns can promote to queen, archbishop, chancellor, rook, knight, or bishop." The pawn triple step belongs only to the 10 × 10 versions. The first version (10 × 10) had the archbishop on d1 and the chancellor on g1; the page says "It is not clear whether the first change made was to a board with only eight rows, or to a setup with the new pieces between knight and bishop". Names: "At one point Capablanca also changed the names of his pieces. The older names are Marshall for Chancellor, and Chancellor for Archbishop. These older names are also used in Angel's program." |
| H. G. Muller, rules page https://hgm.nubati.net/rules/Capablanca.html | The same setup, square by square. **Castling:** "A King that has not moved before can move three squares in the direction of a Rook that has not moved before, in which case that Rook is moved to the square next to the King on the other side." The squares between must be empty, and the king may not be in check or pass through check. Double step and en passant as in chess. "Promotes to Q, C, A, R, B, or N." Checkmate wins; stalemate is a draw. Values: Q 9.5, C 9, A 8.75, R 5, B 3.5, N 3, P 1. |
| H. G. Muller, comment of 2021-12-12, https://www.chessvariants.com/index/listcomments.php?id=43673 (via web.archive.org) | "For Capablanca Chess the values are Q=950, C=900, A=875, R=500, B=350, B-pair bonus=50, N=300, P=100." These were measured in computer self-play. |
| Fairy-Stockfish, `handoff/ext/Fairy-Stockfish/src/variant.cpp` `capablanca_variant()`; `position.cpp`; `variant.h`; `tests/perft.sh`; `test.py` | **The executable reference.** Start FEN `rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1`. The pieces are `ARCHBISHOP` (Betza `BN`, letter `a`) and `CHANCELLOR` (Betza `RN`, letter `c`). **Castling:** `castlingKingsideFile = FILE_I` and `castlingQueensideFile = FILE_C`. The rook goes to `kto ± 1`, the square next to the king on the inside. The squares that must be empty are `between(rfrom, rto) \| between(kfrom, kto)` without the king and rook. Every square the king stands on or crosses, including its start and end squares, must not be attacked. Promotion piece types {A, C, Q, R, B, N}. The defaults apply: double step from rank 2 or 7, en passant, promotion on rank 8 or 1, a 50-move rule, threefold repetition, and stalemate is a draw. Perft of the start position at depth 4 is 805128. |
| pychess-variants, `handoff/ext/pychess-variants/client/variants.ts` and `static/docs/capablanca.md` | The same start FEN; pychess plays through Fairy-Stockfish. "For castling, the king then moves three squares instead of two. Pawns may promote to the archbishop and chancellor as well." Alternate starts (Bird, Carrera, Conservative, Embassy, Gothic, ...) are offered as options, and "caparandom" is the 960-style version. |
| Wikibooks, "Chess Variants/Capablanca Chess"; Green Chess, https://greenchess.net/rules.php?v=capablanca | The same rules. Green Chess: "the king moves three squares, and the rook moves two or three squares, depending on the side". |
| lichess / scalachess | Lichess does not offer Capablanca chess, so there is no lila source for it. |

**Chosen rule set: Capablanca chess as defined by Fairy-Stockfish and pychess.** This is the same game as the
"final version" on chessvariants.com and on Muller's rules page. Quantum Chess changes it in the usual way: you win by
capturing the king, there is no check, and the draws are the shared ones (sections 2.5 and 4).

The sources agree on every rule of the 10 × 8 game. Where they differ, I chose as follows:

1. **Setup.** Capablanca tried several setups. His first version was on 10 × 10, with the new pieces next to the
   queen and king (A on d1, C on g1). chessvariants.com gives two candidates for the intermediate form and says it
   is not clear which one it was: that setup on 10 × 8, or the final setup (A on c1, C on h1) on 10 × 10. I chose
   the final version: 10 × 8 with A on c1 and C on h1. The rule books (Gollon, Schmittberger) use it, and so do
   every engine and site I checked (Fairy-Stockfish, pychess, Muller's page).
2. **Names.** Capablanca's own earlier names, which Bill Angel's program still uses, were "Marshall" for the rook +
   knight and "Chancellor" for the bishop + knight. I chose the later names that Capablanca settled on and that
   every current source uses: **archbishop = bishop + knight** and **chancellor = rook + knight**.
3. **Pawn triple step.** It belongs only to the 10 × 10 versions. A search extract (Red Hot Pawn) mixes it into the
   10 × 8 rules. I chose the double step only.
4. **Piece values** (for the computer player). Muller rates the archbishop at 8.75 and Trice at 6.75. I chose
   Muller's values:
   - they come from large computer self-play samples;
   - Fairy-Stockfish's tuned values also put the archbishop close to the chancellor (A 2200, C 2300, Q 2538 in the
     middle game);
   - Muller's page is the one that gives the full rules.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- A rectangular board of **10 files × 8 ranks**, all 80 squares present:
  - files `a`–`j` are x = 0..9 and ranks `1`–`8` are y = 0..7;
  - square names run `a1` … `j8`.
- Square index as produced by `rectTopology(10, 8)`: `y * 10 + x`. So a1 = 0, f1 = 5, j1 = 9, a2 = 10, a8 = 70 and
  j8 = 79.
- **Square colour:** dark when `(x + y)` is even. So a1 is dark and j1 light, which puts a light square at each
  player's right-hand corner, as in chess. f1 is light and f8 dark.
- White (side 0) plays up the board, towards rank 8.

### 2.2 Pieces and movement

Vectors are `(dx, dy)`. A compound piece makes **either** a slide **or** a jump on each move, never both. The jump
leaps over anything in between; the slide stops at the first occupied square, which it captures if the piece there
is an enemy.

| Piece | Letter | Descriptors (core) |
|---|---|---|
| King | K | `{ leap: KING_STEPS }`: the 8 vectors (±1, 0), (0, ±1), (±1, ±1) |
| Queen | Q | `{ ride: ROOK_DIRS }`, `{ ride: BISHOP_DIRS }` |
| **Chancellor** | **C** | `{ ride: ROOK_DIRS }`, `{ leap: KNIGHT_JUMPS }` (rook + knight, Betza `RN`) |
| **Archbishop** | **A** | `{ ride: BISHOP_DIRS }`, `{ leap: KNIGHT_JUMPS }` (bishop + knight, Betza `BN`) |
| Rook | R | `{ ride: ROOK_DIRS }`: (±1, 0), (0, ±1) |
| Bishop | B | `{ ride: BISHOP_DIRS }`: (±1, ±1) |
| Knight | N | `{ leap: KNIGHT_JUMPS }`: (±1, ±2), (±2, ±1) |
| Pawn | P | `{ leap: [[0, 1]], oriented: true, mode: 'move' }`, `{ leap: [[1, 1], [-1, 1]], oriented: true, mode: 'capture' }`, plus the double step and en passant (`extraMoves`) |

Every descriptor uses `mode: 'both'` unless stated. No piece uses `region`. On an empty board a piece on e4 has these
moves: archbishop 22 (14 bishop + 8 knight), chancellor 24 (16 rook + 8 knight), queen 30.

### 2.3 Setup (every square)

| | a | b | c | d | e | f | g | h | i | j |
|---|---|---|---|---|---|---|---|---|---|---|
| rank 8 (Black) | r | n | **a** | b | q | **k** | b | **c** | n | r |
| rank 7 (Black) | p | p | p | p | p | p | p | p | p | p |
| ranks 3–6 | – | – | – | – | – | – | – | – | – | – |
| rank 2 (White) | P | P | P | P | P | P | P | P | P | P |
| rank 1 (White) | R | N | **A** | B | Q | **K** | B | **C** | N | R |

- **White:** Ra1, Nb1, Ac1, Bd1, Qe1, Kf1, Bg1, Ch1, Ni1, Rj1, and pawns on a2 to j2.
- **Black:** ra8, nb8, ac8, bd8, qe8, kf8, bg8, ch8, ni8, rj8, and pawns on a7 to j7.
- Black mirrors White file by file: the same type stands on the same file. FEN:
  `rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1`.
- The bishops stand on opposite colours (d1 light, g1 dark). Each king stands on a square of its own colour (f1
  light, f8 dark).
- Both sides start with both castling rights (`KQkq`).
- The i2 and i7 pawns are the only pawns that no piece of their own side protects. This is a known weakness of
  Capablanca's setup, and it is kept on purpose (test T1).

### 2.4 Special moves

**Pawns**

- One step forward to an empty square. It captures one step diagonally forward.
- **Double step** from rank 2 (White) or rank 7 (Black), when both squares ahead are empty.
- **En passant:** only on the very next move, an enemy pawn that could have captured on the skipped square captures
  there and removes the double-stepped pawn. All ten files work alike, including a and j (test T7).

**Castling** (the king moves three squares towards the rook, and the rook lands on the square next to the king on
the other side):

| Move | King | Rook | Squares that must be empty |
|---|---|---|---|
| White `O-O` (j-side) | f1 → i1 | j1 → h1 | g1, h1, i1 |
| White `O-O-O` (a-side) | f1 → c1 | a1 → d1 | b1, c1, d1, e1 |
| Black `O-O` | f8 → i8 | j8 → h8 | g8, h8, i8 |
| Black `O-O-O` | f8 → c8 | a8 → d8 | b8, c8, d8, e8 |

- **Rights.** Neither the king nor the castling rook may have moved earlier in the game. A right is lost for good when
  the king moves (both rights go) or when that rook moves. It is also lost when a piece lands on the rook's square,
  which means the rook was captured.
- **Classical check rule:** the king may not castle while in check, and none of the squares it stands on, crosses or
  lands on may be attacked (f1, g1, h1, i1 or f1, e1, d1, c1). The rook may cross an attacked square (b1). This rule
  is **dropped** in Quantum Chess (section 4.3).
- The king always moves three squares, so a castling move never has the same from and to squares as an ordinary
  king step. The move is entered as **king to i1 / c1**, and its key is `O-O` / `O-O-O`.

**Promotion**

- A pawn that reaches the last rank (rank 8 for White, rank 1 for Black) **must** promote, to a queen, chancellor,
  archbishop, rook, bishop or knight of the player's choice. This holds for quiet moves and captures alike.
- The number of pieces of one type is not limited, so a second archbishop is fine.

### 2.5 Win, draw and turn order

- **Classical game:** White moves first and the sides alternate. Checkmate wins. Stalemate, threefold repetition,
  the 50-move rule and insufficient material are draws (FIDE rules). Fairy-Stockfish has the first three as variant
  defaults (`stalemateValue`, `nFoldRule = 3`, `nMoveRule = 50`); insufficient material is its API function
  `has_insufficient_material`, which pychess uses to adjudicate. A lone archbishop or chancellor (with its king)
  can force mate, so it is sufficient material.
- **Quantum version:**
  - There is no check. You win by capturing the enemy king (the default `worldResult`).
  - The draws are the shared ones of `docs/variants.md`:
    - 100 plies without a capture or a pawn move that actually happened (`quietPlies`; a Missed attempt does not
      reset the count: docs/rules.md section 6, CORE-CHANGES Q8);
    - the move limit of 600 plies;
    - a side to move without any legal move.
  - Stalemate, threefold repetition and insufficient material are not separate rules. The variants core has none
    of them.
  - The "cannot escape" rule of classic Quantum Chess (`docs/rules.md` section 5) is not part of the variants core
    either.

---

## 3. Engine mapping (contract)

`orthodoxSpec()` is fixed to 8 × 8, so the module builds the same declaration on `standardBoard(10, 8)`. Everything
it needs is already in `core/orthodox.js`. The sketch below is `handoff/prototypes/capablanca/proto.mjs` plus the two
hooks of `orthodoxSpec()`. With the SPDX header and a file comment added it passes `npx eslint` as
`src/variants/capablanca.js`, and line for line (placeholder rules strings, a named export) it runs every case of
section 7 (`handoff/tmp/critic-capablanca/eng_proto.mjs`):

```js
import { t } from '@nextcloud/l10n'
import {
	BISHOP_DIRS,
	castlingMoves,
	clearEnPassant,
	KNIGHT_JUMPS,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	ROOK_DIRS,
	standardBoard,
	standardSetup,
	unifyCastling,
} from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'

const board = standardBoard(10, 8)
const types = orthodoxTypes({ lastRank: board.lastRank, promoteTo: ['q', 'c', 'a', 'r', 'b', 'n'] })
types.a = {
	name: () => t('quantumchess', 'Archbishop'),
	moves: [{ ride: BISHOP_DIRS }, { leap: KNIGHT_JUMPS }],
	value: 875,
	glyph: { text: 'A', shape: 'circle' },
}
types.c = {
	name: () => t('quantumchess', 'Chancellor'),
	moves: [{ ride: ROOK_DIRS }, { leap: KNIGHT_JUMPS }],
	value: 900,
	glyph: { text: 'C', shape: 'circle' },
}
// Muller's Capablanca values; r 500, p 100 and k 400 stay as in VALUES
types.q.value = 950
types.b.value = 350
types.n.value = 300

const spec = {
	id: 'capablanca',
	category: 'boards',
	sides: whiteBlack(),
	topology: board.topology,
	board,
	types,
	rules: () => [/* section 5 */],
	setup() {
		return standardSetup(spec, 'rnabqkbcnr')
	},
	extraMoves(w, side) {
		return [
			...pawnExtras(spec, w, side, (s, sq) => board.rankOf(sq) === (s === 0 ? 1 : 6)),
			...castlingMoves(spec, w, side),
		]
	},
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
	},
	// the same two hooks as orthodoxSpec() (CORE-CHANGES W4, W5): en passant ends after one ply, also in a world
	// where that ply's move missed and on a Measure turn; a castling right is kept only while every world has it
	applyMiss(b) {
		return clearEnPassant(b)
	},
	unifyWorlds(bs) {
		return unifyCastling(bs)
	},
}
export default defineVariant(spec)
```

`orthodoxTypes()` builds fresh objects on every call, so changing the values does not affect other variants.
`orthodoxSpec()` cannot be reused because it is fixed to 8 × 8, so the module must copy its `applyMiss` and
`unifyWorlds` hooks. Without `applyMiss`, en passant stays possible several plies late after Measure turns (Q10);
without `unifyWorlds`, a right survives in the worlds where the rook stayed home (Q2).

| Field | Value |
|---|---|
| `id`, `category` | `'capablanca'`, `'boards'` |
| `sides` | `whiteBlack()`: White (side 0, `color: 'white'`), then Black (side 1). No teams; `enemies` is the default (`a !== b`); `orient` is the default (Black mirrors coordinate 1). |
| `topology` | `standardBoard(10, 8).topology` = `rectTopology(10, 8)`: 80 squares, index `y * 10 + x`, names `a1` … `j8`. |
| `types` | `k`, `q`, `r`, `b`, `n`, `p` from `orthodoxTypes()`, plus `a` (archbishop) and `c` (chancellor) as above. The type ids `a` and `c` follow the Fairy-Stockfish letters. |
| royal | `k` |
| solid | `k`, `p` (the defaults) |
| splittable | `q`, `c`, `a`, `r`, `b`, `n` (the default `!solid`), including promoted pieces |
| values (centipawns, for the computer) | p 100, n 300, b 350, r 500, a 875, c 900, q 950, k 400. These are Muller's values; the king's value never matters. Muller's bishop-pair bonus (+50) is **not** used (see section 8). |
| promotion | `promote: { zone: lastRank, to: ['q', 'c', 'a', 'r', 'b', 'n'] }`, mandatory (`optional` unset). `pushMove` expands the six choices. Keys: `e7-e8=q`, `e7-e8=c`, `e7-e8=a`, ... |
| `setup(options, rng)` | `standardSetup(spec, 'rnabqkbcnr')`. It places both back ranks and both pawn ranks and sets `x = { ep: -1, epVictim: -1, castle: castlingRights(...) }`. Its defaults already give the Capablanca castling squares on a 10-file board: king to file `files − 2` = i with the rook to h, or king to file 2 = c with the rook to d. The resulting rights are `K f1→i1 / j1→h1`, `Q f1→c1 / a1→d1`, `k f8→i8 / j8→h8`, `q f8→c8 / a8→d8` (test T1). |
| `extraMoves(w, side)` | `pawnExtras` (double step from y = 1 for White or y = 6 for Black, plus en passant) and `castlingMoves` (keys `O-O` / `O-O-O`, `to` = the king's destination i1/c1 or i8/c8, `kind: 'castle'`, `extra.rook`). |
| `afterMove(next, m)` | `orthodoxAfterMove`: it sets or clears `x.ep` and `x.epVictim`, and it drops a castling right when a move starts from or lands on that right's king or rook square. |
| `applyMiss(b)` | `clearEnPassant(b)`, as in `orthodoxSpec()` (CORE-CHANGES Q1, W4): a world where the move did not take effect, and every world on a Measure turn, loses the en passant square, so en passant is possible only on the ply right after the double step (Q10). |
| `unifyWorlds(bs)` | `unifyCastling(bs)`, as in `orthodoxSpec()` (CORE-CHANGES Q3, W5): after every action a castling right is kept only if every world still has it (Q2, Q11). |
| castling and en passant moves | certain by default in the core (`kind: 'castle'` and `kind: 'ep'`, CORE-CHANGES Q2): legal only when every world generates them, never rolled. Nothing to declare. |
| `onCapture` | default (the captured piece goes off the board) |
| `worldResult` | default (a side whose king is gone has lost; reason `'king'`) |
| `noMoves` | default (a draw, reason `'noMoves'`) |
| `filterMoves`, `measured`, `evaluate`, `visibility`, `stateResult` | none |
| `options` | none (section 8 discusses alternative setups) |
| `maxPly`, `quietPlies` | defaults, 600 and 100 |
| `rules()` | the sentences of section 5 |

New translatable strings: "Archbishop" and "Chancellor" (type names), plus the rules sentences. Both piece names
should also go into `translationfiles/GLOSSARY.md` in the translation step.

### 3.1 Core changes needed

**None beyond the planned `handoff/CORE-CHANGES.md` items that every orthodox variant needs** (Q1 `applyMiss`, Q2
certain castling and en passant, Q3 `unifyWorlds`, W4 `clearEnPassant`, W5 `unifyCastling`; all of them are already
in the working-tree core). The Capablanca-specific parts are covered by the core as built, and the prototype confirms
each one:

- `castlingRights()` puts the king on file `files − 2` (the i-file) or file 2 (the c-file), with the rook next to it
  on the inside.
- `castlingMoves()` requires exactly the squares Fairy-Stockfish requires. The whole Fairy-Stockfish castling test
  and a perft to depth 4 match (tests T8 and T9).
- `pawnExtras()` takes the double-step ranks as a parameter.
- `pushMove()` expands any number of promotion choices.
- `rectTopology(10, 8)` labels the files a–j.

The chess960 spec asked for two core changes, now planned as CORE-CHANGES W1 and W2:

- (a) W1: `applyClassical` places the king on `m.extra.kingTo`. This makes no difference here, because the
  Capablanca king always moves and `m.to` already equals `kingTo`.
- (b) W2: a `toRook` option of `castlingMoves`. Capablanca keeps the default `to = kingTo`: clicking i1 or c1 is
  natural and never ambiguous.

If the core instead switches every variant to king-onto-rook input, Capablanca still works; only the square the
player clicks changes.

---

## 4. Quantum adaptation

Capablanca chess adds two new pieces, a wider board and a longer castling move. Everything else is the shared quantum
layer. These are the decisions for every case that could be read two ways.

### 4.1 Which pieces can be ghosts

- The **archbishop and the chancellor split and merge like a queen**. So do promoted archbishops and chancellors.
- Kings and pawns are always solid.
- No new solid types are needed.

### 4.2 Compound pieces: a jump never links, a slide can

In each world, every ordinary move of an archbishop or chancellor is either a knight jump or a slide. The core
generates both, and the quantum rules follow from that:

- **The key tells which.** No knight jump points along a rook or bishop line, so from a given square each target is
  reached either by a jump or by a slide, never both. `e4-f6` is a jump in every world and `e4-e7` a slide in every
  world; a move key never means a jump in one world and a slide in another.
- **Jump.** A jump passes no square, so a ghost in between can never block it. A jump by a piece that is not
  superposed to a square that is empty in every world is certain (test Q3, `e4-f6`).
- **Slide.** A slide past a square where a piece might be is not rolled (**pass = link**). Where it is blocked, the
  piece stays and becomes linked to the blocker (Q3, `e4-e7`).
- **Landing.** Any move that lands where another piece might be is rolled (**land = roll**, Q3 `e4-e5`, Q7). The
  piece's own other part is not "another piece": a part that jumps or slides onto it joins it without a roll
  (docs/rules.md 2.1, CORE-CHANGES Q14; test Q3b).
- **Split.** The two targets may be any two squares that are empty in every world and that the piece reaches with a
  quiet move: two jumps, two slides, or one of each. If the slide half is blocked in some worlds, that half stays
  home there, as for any slider (Q4: the archbishop ends up 50 % on d3, 25 % on c1 and 25 % on g5).
- **Merge.** Each part reaches the target with either kind of move. A converging capture is certain when the piece
  has no other part, the target piece is certainly there, and no path can be blocked. Here that means one knight
  jump and one clear slide (Q6). If a ghost might block the slide, the merge is rolled (Q6b).

### 4.3 Castling

Castling follows classic Quantum Chess (`docs/rules.md` section 5), as the lead decided for every variant (D1 in
`handoff/CORE-CHANGES.md`, core item Q2):

- Castling is a **certain move**. It is legal only when **every** world allows it, and then it happens in every
  world: it is **never rolled**.
  - So the king and that rook must stand on their start squares in every world, the right must exist (4.4), and
    every square in the table of 2.4 (g1, h1, i1 or b1, c1, d1, e1) must be **empty for certain**.
  - A ghost of either side on one of those squares, even at 25 %, blocks the castling until it is resolved (Q1).
- **There is no check condition.** The king may castle out of, through or into attack (T4).
- **Capablanca-specific:** more pieces must clear the way than in chess. Three must leave on the j-side (the g1
  bishop, the h1 chancellor and the i1 knight) and four on the a-side (the b1 knight, the c1 archbishop, the d1
  bishop and the e1 queen). So a ghost on the castling path is common.
  - A piece that splits to two squares **off** the path does not block the castling (Q9, where the chancellor
    splits h1-g3|i3).
  - A split with one half on the path, or a slide that only partly happened, leaves a ghost there and blocks the
    castling until that square is empty in every world again. The right itself is kept, because only the king and
    that rook matter for it: in Q12 the chancellor splits `h1-g1|h3`, `O-O` is illegal, and after the ghost is
    measured on h3 `O-O` is `move 1` again. An enemy ghost blocks in the same way, also on b1, the square only the
    rook crosses (Q12b).
  - Jumps clear the path for certain: a knight, or the jump half of an archbishop or chancellor split, always leaves
    its square, while a slide half that is blocked in some worlds stays home there.
  - This needs no special rule, but it belongs in the tips.

### 4.4 Castling rights

- A right is lost **as soon as, after any action, the king or that rook is not 100 % on its start square**
  (`docs/rules.md` section 5; D1). It is also lost when something lands on the rook's square.
- In the core the rights are stored in each world (`x.castle`, updated by `orthodoxAfterMove`), and the
  `unifyWorlds` hook (`unifyCastling`) then keeps a right only if every world of the new state still has it. So a
  right lost in one world is lost in all.
- If the rook splits off its square, the right is gone, even when a split half that is a slide was blocked by a
  ghost and stayed home in some world (as in Q4). Example: Ra1, Kf1, Rj1, kf8, a black knight 50 % on j3 and 50 %
  on a6; `j1-h1|j4` gives four worlds of 0.25, one of them with the rook still on j1, and the rights are `Q` in all
  four. After Black's `f8-e8`, `O-O` is illegal.
- A rook slide that only partly happened (pass = link) also loses the right everywhere, and measuring the rook back
  home does not restore it (Q2).
- A king or rook move that **Missed** keeps the right, because the piece never left (Q11: a king step and a rook
  slide that are rolled and miss). A Missed outcome exists only for a rolled move: a rook slide that is not rolled
  (pass = link) and is blocked in some worlds leaves the rook in two places, and the right is gone (Q2).
- Merging or moving back never restores a right (T5).

### 4.5 Pawns: double step, en passant, promotion

- A **double step** is a pawn move, so it is measured. If a piece might stand on the skipped square or the target
  square, a roll decides (Q8).
- **En passant is a certain move, never rolled** (`docs/rules.md` section 4; D2, core item Q2). It is legal only
  when every world allows it, and it is possible **only on the ply right after the double step**, as in chess.
  - The double step before it was settled, so every world has the same en passant square. The capturing pawn and
    the victim are solid, and the skipped square cannot be occupied (Q8).
  - The right ends after one ply in every world: `orthodoxAfterMove` clears it after a move that happened, and the
    `applyMiss` hook (`clearEnPassant`) clears it in the worlds where the move missed and on a Measure turn. Without
    that hook a Measure turn keeps the square, and en passant would still be possible three plies later (Q10).
- **Promotion** is a pawn move, so it is measured.
  - A promotion that captures on a square where a piece might be is rolled: Captured or Missed (Q5).
  - A quiet promotion to a square that is empty in every world is certain.
  - The chosen type is part of the move key (`g7-h8=c`), so it is the same in every world.
  - The new piece is an ordinary splittable piece from the next turn. A pawn never splits, so a promotion is never
    part of a split or merge (`quietTargets` and `mergeBranches` exclude promotions).

### 4.6 King capture, game-end roll, solid roll, budget

- **Capture the king** (the default `worldResult`). A ghost archbishop or chancellor that lands on the king rolls
  with its own odds, and the Captured branch ends the game (Q7). A merge can take the king for certain (Q6).
- **Game-end roll and solid roll:** the generic rules, with nothing variant-specific. As in orthodox chess, neither
  of them ever splits a branch here: kings and pawns move only by measured or certain moves, and the king is solid,
  so a capture branch takes the king in all of its worlds or in none. Random games confirm it (no outcome with a
  `solid:` or `end:` note in 80 games, `eng_fuzz.mjs`).
- **Budget:** unchanged. At most 8 arrangements per side, a piece on at most 4 squares, at most 64 worlds.
  - Each side has 9 splittable pieces at the start instead of 7.
  - A central queen has up to 30 quiet targets on 10 × 8 (435 split pairs), a chancellor 24 (276) and an archbishop
    22 (231). The board UI only needs `splitTargets` (linear); the full list `splitsFrom` of a queen on e4 in a
    four-world state (406 legal pairs) takes about 16 ms. The computer player caps it: it draws only 2, 6 or 10
    splits per move (by level) from a short list per piece (`aiSplits`, CORE-CHANGES U4: the 6 best targets, at most
    6 legal pairs). The prototype's random games and self-play run fast (see the table at the top), and at 64 worlds
    the computer keeps to its time limits (easy about 0.1 s, normal 1.5 s, hard 3.7–4.0 s; `eng_aitime.mjs`).

In short, for players: *the archbishop and the chancellor are ghosts like the queen; their knight jump flies over
ghosts, their slides can be blocked. Castling never rolls: a ghost in the way blocks it.*

---

## 5. Player-facing rules text (rules card)

1. The board is 10 squares wide (files a to j), and each side has two extra pawns and two new pieces.
2. The archbishop (A) moves like a bishop or like a knight; the chancellor (C) moves like a rook or like a knight.
3. From a to j the back rank is rook, knight, archbishop, bishop, queen, king, bishop, chancellor, knight, rook, so
   the king starts on f1 (f8 for Black).
4. To castle, the king moves three squares towards its rook, to i1 or c1 (i8 or c8 for Black), and the rook lands on
   the square next to it on the other side (h1 or d1, h8 or d8). As in chess, neither the king nor that rook may have
   moved before, and every square between them must be empty.
5. Pawns move as in chess, with the double step and en passant, and promote to a queen, chancellor, archbishop, rook,
   bishop or knight.
6. The archbishop and the chancellor can split and merge like a queen: their knight jump flies over ghosts, but
   their slides can be blocked.
7. Castling never rolls: a ghost on any square between the king and the rook blocks it, and the right is lost for
   good as soon as the king or that rook is not 100 % on its starting square. There is no check, so you may castle
   out of, through or into attack.

---

## 6. UI layout

- **Board:** `rectTopology(10, 8)`, which needs no custom layout.
  - Square cells, 1 × 1 unit. Cell x = file and y = 7 − rank, so White is at the bottom.
  - Shade `dark` when `(x + y)` is even and `light` otherwise.
  - The layout is 10 units wide and 8 high. File letters a–j go below the board and rank numbers 1–8 on its left.
  - Black's view is rotated by 180° (the default).
  - The board is 10:8 instead of square, so the existing responsive SVG makes the cells 20 % smaller at the same
    width. No other change is needed.
- **Orthodox pieces:** the cburnett sprites (`k`, `q`, `r`, `b`, `n`, `p`).
- **Archbishop:** `glyph: { text: 'A', shape: 'circle' }`. **Chancellor:** `glyph: { text: 'C', shape: 'circle' }`.
  - `glyphOf` draws a round token in the side's colour: white (`#ffffff`) with dark ink for White, `#2b2b2b` with
    white ink for Black.
  - The capital letter is the same for both sides, as in Fairy-Stockfish SAN ("Ci3") and in the Wikipedia diagram.
  - The type names "Archbishop" and "Chancellor" reach screen readers through the square labels of the board
    (`cellLabel`, for example "e4: Chancellor (50 %)") and the labels of the promotion buttons.
  - Ghost parts use the usual fading and percentage badge.
- **Legend:** none beyond the rules card. The board has no legend hook for a variant (the only line under the board
  is the fog legend of hidden games), and rules sentence 2 already says what A and C are.
- **Promotion box:** six choices, in the order Q, C, A, R, B, N (the order of `promoteTo`, which is the order of the
  moves the view receives). The existing box already wraps (`.qc-vgame__choices` has `flex-wrap: wrap`), so it fits
  on a phone with no change.
- **Castling:**
  - When the king is selected, i1 and c1 (i8 and c8 for Black) carry the ordinary target mark, because the castling
    move's `to` is the king's destination; clicking one plays `O-O` / `O-O-O`. The board has no castle badge or
    per-target tooltip, and none is needed (a badge would be a UI change, not a core one).
  - The move list shows `O-O` and `O-O-O`. The last-move marks are the king's squares, for example f1 and i1 after
    White's `O-O` (the history record's `from` and `to`).
  - The king's ordinary steps (e1, g1, ...) never coincide with a castling target.

---

## 7. Test cases

**Notation.**

- Placements are written as in `worldFrom`: `{ e1: '0:k' }`, where side 0 is White and side 1 is Black. In results,
  White pieces are upper case and Black pieces lower case, sorted alphabetically.
- `x = { ep: -1, epVictim: -1, castle: [] }` unless stated.
- "rights" means `x.castle = castlingRights(V, b)` computed for each world. With `tests/js/variants/helpers.js`,
  write `stateOf(V, worlds, turn, (b) => { b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) } })`.
- White is to move unless stated. Several worlds have equal weights unless stated.
- Outcomes are listed in the core's order as `key p`, with **R** for a rolled branch.
- Every expected value below was produced on the real core: T1–T9 and Q3–Q9 by
  `handoff/prototypes/capablanca/cases.mjs` (also with the two hooks of section 3, `r2_cases_rest.mjs`), and Q1,
  Q2, Q9, Q10 and Q11 in their D1/D2 form by `handoff/tmp/rev1-capablanca/r2_cases.mjs` on the working-tree core
  that has CORE-CHANGES Q1–Q3 and W4–W5. The engine review ran all of them again on the sketch of section 3, and
  produced Q3b, the rook part of Q11, Q12, Q12b and the extra values it added to Q3–Q8 with
  `handoff/tmp/critic-capablanca/eng_cases.mjs`.
- `royalDanger(V, s, side)` is the king-danger ring of `side` (0..1).

**T1. Start position.** `newGame(V, {})`.

- Pieces: exactly those of 2.3.
- `x.castle`, as `flag: king → kingTo, rook → rookTo`:
  - `K: f1→i1, j1→h1`
  - `Q: f1→c1, a1→d1`
  - `k: f8→i8, j8→h8`
  - `q: f8→c8, a8→d8`
- `topology.size` = 80. Squares a1 = 0, j1 = 9, a2 = 10, f1 = 5, a8 = 70, j8 = 79.
- Shades: a1 dark, j1 light, f1 light, f8 dark, d1 light, g1 dark.
- `legalMoves` gives **28** ordinary moves:
  - 20 pawn moves;
  - `b1-a3`, `b1-c3`, `i1-h3`, `i1-j3`;
  - the archbishop's jumps `c1-b3`, `c1-d3`;
  - the chancellor's jumps `h1-g3`, `h1-i3`.
- With `{ splits: true }` there are 4 more: `b1-a3|c3`, `c1-b3|d3`, `h1-g3|i3`, `i1-h3|j3`, 32 in total.
- The pawns that no piece of their own side protects (`attacks(V, b, side, sq)` is false) are exactly **i2** for
  White and **i7** for Black.

**T2. Archbishop and chancellor movement.**

- Position: White Ka1 and one piece on e4 (an archbishop, a chancellor or a queen); Black kj8.
- With an archbishop on e4, it has **22** moves: a8 b1 b7 c2 c3 c5 c6 d2 d3 d5 d6 f2 f3 f5 f6 g2 g3 g5 g6 h1 h7 i8.
- With a chancellor on e4, it has **24** moves: a4 b4 c3 c4 c5 d2 d4 d6 e1 e2 e3 e5 e6 e7 e8 f2 f4 f6 g3 g4 g5 h4 i4
  j4.
- A queen on e4 has 30 moves.
- **Boxed in:**
  - Position: White Ce4, Pd4, Pf4, Pe5, Pe3, Ka1; Black kj8, nf6.
  - The chancellor's moves are exactly the 8 jumps c3 c5 d2 d6 f2 f6 g3 g5. The jump to f6 captures.

**T3. Castling both ways.**

- White Ra1, Kf1, Rj1; Black kf8; rights (`KQ`).
- The castling moves are `O-O` (to = i1) and `O-O-O` (to = c1).
- `O-O`: `move 1`. Result: Ki1 Ra1 Rh1 kf8, White rights empty.
- `O-O-O`: result Kc1 Rd1 Rj1 kf8, rights empty.
- Black: White Kf1; Black ra8, kf8, rj8; rights; Black to move.
  - `O-O` gives ki8 rh8 ra8.
  - `O-O-O` gives kc8 rd8 rj8.

**T4. The squares that must be empty; no check rule.**

- Base: White Ra1, Kf1, Rj1; Black kf8; rights.

| Added | Castling moves |
|---|---|
| White Nb1 | only `O-O` (the rook passes b1) |
| White Qe1 | only `O-O` |
| White Bg1 | only `O-O-O` |
| Black ni1 | only `O-O-O` (an enemy piece blocks too; castling never captures) |

- **Castling through attack:**
  - White Ra1, Kf1, Rj1; Black kj8, rg8, re8; rights.
  - Both `O-O` and `O-O-O` are legal, although g1 and e1 are attacked.
  - The classical legality filter of `perft.mjs` (FIDE and Fairy-Stockfish) allows neither.

**T5. Castling rights.**

- From the start, play `j2-j4`, `j7-j5`, `j1-j3`, `a7-a6`, `j3-j1`, `a6-a5`. The rights are now **`Qkq`**: the rook is
  back on j1, but `K` is gone for good.
- Then play `e2-e3`, `e7-e6`, `f1-e2`. The rights are now **`kq`**, because the king moved.
- **Captured rook:**
  - White Ra1, Kf1, Rj1; Black kf8, rj8; rights; Black to move.
  - `j8-j1`: `capture 1`.
  - The rights are now `Q`: White lost `K` (the rook was captured), and Black lost `k` (its rook moved).

**T6. Promotion.**

- White Pe7, Ka1; Black kj8, nd8.
  - The pawn's moves are exactly these 12, in this order: `e7-e8=q`, `e7-e8=c`, `e7-e8=a`, `e7-e8=r`, `e7-e8=b`,
    `e7-e8=n`, `e7-d8=q`, `e7-d8=c`, `e7-d8=a`, `e7-d8=r`, `e7-d8=b`, `e7-d8=n`.
  - There is no `e7-e8` without a promotion.
- After `e7-e8=c`:
  - the piece on e8 has type `c`;
  - `generate(V, w, 0)` gives it **17** moves, among them `e8-f6` (jump), `e8-d8` (captures the knight), `e8-j8`
    (captures the king) and `e8-e1`.
- Black Pc2, kj8; White Ka1; Black to move. The pawn's moves are `c2-c1=q`, `c2-c1=c`, `c2-c1=a`, `c2-c1=r`,
  `c2-c1=b`, `c2-c1=n`.

**T7. Double step and en passant on the j-file.**

- White Pj2, Ka1; Black pi4, ka8.
  - The pawn's moves are `j2-j3` and `j2-j4`.
  - After `j2-j4`, `x.ep` = j3. Black's moves from i4 are `i4-i3` and `i4-j3`.
  - `i4-j3`: `capture 1`. Result: Ka1 ka8 pj3; the j4 pawn is gone.
- White Pc3, Ka1; Black ka8. The only pawn move is `c3-c4` (no double step from rank 3).

**T8. The Fairy-Stockfish castling position** (`test.py`, `test_castling`).

- From the start, play `b2-b4`, `f7-f5`, `c2-c3`, `g8-d5`, `a2-a4`, `h8-g6`, `f2-f3`, `i8-h6`, `h2-h3`.
- Black has exactly **55** moves, including `O-O` but not `O-O-O`.
- Written in UCI form (`O-O` = `f8i8`), they are exactly the list in `test.py`.
- `O-O` puts the king on i8 and the rook on h8.

**T9. Generator regression (optional).**

- Perft of the start position with the classical legality filter of `perft.mjs` gives 28, 784, 25 228 and **805 128**
  at depths 1–4.
- 805 128 is the depth-4 figure in Fairy-Stockfish `tests/perft.sh`.
- This needs the filter helper, which is not part of the variant. A Vitest version up to depth 3 takes about 0.1 s.

**Q1. Own chancellor ghost on the castling path.**

- Two worlds:
  - {Ra1, Kf1, Rj1, **Ch1**, kf8}
  - {Ra1, Kf1, Rj1, **Ch3**, kf8}
- Rights in both.
- `O-O` is **illegal**: it is not in `legalMoves`, and `outcomes` is null. The chancellor might be on h1, and
  castling is never rolled (D1).
- The only castling move is `O-O-O`: `move 1`, not rolled, because b1–e1 are empty in both worlds. Result: two worlds
  of 0.5, Kc1 Rd1 Rj1 kf8 with the chancellor on h1 or h3; rights empty.

**Q2. A rook slide that only partly happened costs the right everywhere (pass = link).**

- Two worlds:
  - {Ra1, Kf1, Rj1, kf8, **nj4**}
  - {Ra1, Kf1, Rj1, kf8, **na6**}
- Rights in both.
- `j1-j6`: `move 1`, not rolled. The result has two worlds of 0.5:
  - Kf1 Ra1 Rj6 kf8 na6;
  - Kf1 Ra1 Rj1 kf8 nj4 (the rook was stopped by the knight and stayed).
  - The rights are `Q` in **both** worlds: the rook is not 100 % on j1, so `K` is gone (`unifyWorlds`). Without the
    hook the second world would keep `KQ`.
- White's budget is 2.
- Black plays `f8-e8`. White's only castling move is `O-O-O`; `O-O` is illegal.
- White measures instead, `?j1`: `j1 0.5 R | j6 0.5 R`. After the `j1` outcome the state is Kf1 Ra1 Rj1 ke8 nj4
  with rights `Q`: the rook is home for certain, but the right does not come back, and `O-O` stays illegal.

**Q3. Chancellor: the jump is certain, the slide links, landing rolls.**

- Two worlds:
  - {Ce4, Ka1, kj8, **ne5**}
  - {Ce4, Ka1, kj8, **ng5**}
- `e4-f6`: `move 1`. The chancellor is on f6 in both worlds; the jump crosses nothing. Result: two worlds of 0.5,
  Cf6 Ka1 kj8 ne5 and Cf6 Ka1 kj8 ng5.
- `e4-e7`: `move 1`, not rolled. The result has two worlds of 0.5:
  - Ce4 … ne5 (the slide was blocked, and the chancellor is now linked to the knight);
  - Ce7 … ng5.
- `e4-e5`: `move 0.5 R | capture 0.5 R`.
  - Moved: Ce5 Ka1 kj8 ng5.
  - Captured: Ce5 Ka1 kj8.

**Q3b. A jump onto the piece's own other part joins it.**

- Two worlds, one chancellor:
  - {**Ce4**, Ka1, kj8}
  - {**Cf6**, Ka1, kj8}
- `e4-f6`: `move 1`, not rolled (the chancellor's own part on f6 is not another piece; CORE-CHANGES Q14).
- Result: one world, Cf6 Ka1 kj8: the chancellor is solid again.

**Q4. Archbishop split: a jump plus a slide that may be blocked.**

- Two worlds:
  - {Ac1, Kf1, kf8, **ne3**}
  - {Ac1, Kf1, kf8, **nh6**}
- `c1-d3|g5`: `split 1`, never rolled. d3 is a jump; g5 is the slide c1-d2-e3-f4-g5.
- The result has four worlds of 0.25:
  - Ad3 … ne3
  - **Ac1** … ne3 (the slide half stayed home)
  - Ad3 … nh6
  - Ag5 … nh6
- The archbishop is on c1 with p 0.25, d3 with 0.5 and g5 with 0.25. White's budget is 3.

**Q5. Promotion to a chancellor onto a ghost.**

- Two worlds:
  - {Pg7, Ka1, ka8, **nh8**}
  - {Pg7, Ka1, ka8, **nd5**}
- `g7-h8=c`: `miss 0.5 R | capture 0.5 R`.
  - Missed: Ka1 Pg7 ka8 nd5.
  - Captured: Ch8 Ka1 ka8.
- `g7-g8=a`: `move 1`, because g8 is empty in both worlds. Result: two worlds of 0.5, Ag8 Ka1 ka8 nh8 and Ag8 Ka1
  ka8 nd5.

**Q6. Converging capture of the king: a jump and a slide.**

- Two worlds:
  - {**Cc6**, Ka1, ke7}
  - {**Ce2**, Ka1, ke7}
- `legalMoves` lists the merge as `e2|c6-e7` (parts in square order); `?e2` and other merges are listed as well.
- Before the merge, Black's king danger `royalDanger(V, s, 1)` is **1**: each part alone takes the king in 0.5, and
  the ring counts the converging capture (docs/rules.md 5, CORE-CHANGES Q7).
- `e2|c6-e7`: `capture 1`, not rolled. c6→e7 is a jump and e2→e7 a clear slide.
- Result: Ce7 Ka1, and `result = { winner: 0, reason: 'king' }`.
- **Q6b, the slide may be blocked.**
  - Four worlds of 0.25: the chancellor on c6 or e2, crossed with a black knight on e5 or g4.
  - Black's king danger is **0.75**.
  - `e2|c6-e7`: `miss 0.25 R | capture 0.75 R`.
  - Missed: Ce2 Ka1 ke7 ne5.
  - Captured: White wins (`{ winner: 0, reason: 'king' }`).

**Q7. One part of an archbishop takes the king.**

- Two worlds:
  - {**Ad5**, Kj1, ke7}
  - {**Ab1**, Kj1, ke7}
- Black's king danger is 0.5.
- `d5-e7` (a jump): `miss 0.5 R | capture 0.5 R`.
  - Captured: `result = { winner: 0, reason: 'king' }`.
  - Missed: the game goes on, with Ab1 Kj1 ke7 (the archbishop is now known to be on b1).

**Q8. Double step past a ghost, then en passant.**

- Two worlds:
  - {Pe2, Ka1, ka8, pd4, **ne3**}
  - {Pe2, Ka1, ka8, pd4, **nc6**}
- `e2-e4`: `miss 0.5 R | move 0.5 R`.
  - Missed: Ka1 Pe2 ka8 ne3 pd4. From `quiet: 0` the counter is now 1: a Missed pawn move does not reset it.
  - Moved: Ka1 Pe4 ka8 nc6 pd4, with `ep = e3`, and `quiet` 0.
- After Moved, `d4-e3` (en passant): `capture 1`. Result: Ka1 ka8 nc6 pe3.

**Q9. Split the chancellor off the castling path, then castle for certain.**

- White Ra1, Kf1, Ch1, Rj1; Black kf8; rights.
  - The only castling move is `O-O-O`; `O-O` is blocked by h1.
- `h1-g3|i3`: `split 1`. Result: two worlds of 0.5, with Cg3 and Ci3; the rights stay `KQ`.
- Black plays `f8-e8`.
- `O-O`: `move 1`, not rolled. Result: Ki1 Ra1 Rh1 ke8, with the chancellor 0.5 on g3 and 0.5 on i3.

**Q10. En passant only on the very next ply, also after a Measure turn.**

- Four worlds of 0.25: White Pe2, Ka1; Black ka8, pd4; a black knight on **h6** or **g4**, crossed with a white
  knight on **b3** or **h3**.
- `e2-e4`: `move 1` (e3 and e4 are empty in every world). Every world now has `ep = e3`, and `d4-e3` would be
  `capture 1`.
- Black measures instead, `?g4`: `g4 0.5 R | h6 0.5 R`. After the `g4` outcome, no world has an en passant square
  any more (`applyMiss`).
- White measures, `?b3`: `b3 0.5 R | h3 0.5 R`. After the `b3` outcome: Ka1 Nb3 Pe4 ka8 ng4 pd4.
- `d4-e3` is **illegal**: the right ended with Black's Measure turn. (Without the `applyMiss` hook the square stays
  set through both Measure turns and `d4-e3` is `capture 1` three plies after the double step, which chess does not
  allow.)

**Q11. A king or rook move that Missed keeps the rights; a partly blocked rook slide does not.**

- Two worlds, rights in both:
  - {Ra1, Kf1, Rj1, kf8, **Ng2**, **nh5**}
  - {Ra1, Kf1, Rj1, kf8, **Ne3**, **nj3**}
- `f1-g2`: `miss 0.5 R | move 0.5 R` (a king move is measured; the own knight might be on g2).
  - Missed: Kf1 Ng2 Ra1 Rj1 kf8 nh5, rights **`KQ`**: the king never left.
- `j1-j5` instead: `move 1`, not rolled. Result: two worlds of 0.5, Rj5 (with Ng2, nh5) and Rj1 (with Ne3, nj3; the
  slide was stopped on j3). The rights are `Q` in both worlds.
- **A rook move that Missed.** Two worlds, rights in both:
  - {Ra1, Kf1, Rj1, kf8, **nj3**}
  - {Ra1, Kf1, Rj1, kf8, **nj5**}
  - `j1-j5`: `miss 0.5 R | capture 0.5 R`. It lands where a piece might be, so it is rolled; in the first world the
    knight on j3 stops the slide.
  - Missed: Kf1 Ra1 Rj1 kf8 nj3, rights **`KQ`**: the rook never left.
  - Captured: Kf1 Ra1 Rj5 kf8, rights `Q`.

**Q12. A split onto the castling path blocks castling but keeps the right.**

- White Ra1, Kf1, Ch1, Rj1; Black kf8; rights.
- `h1-g1|h3`: `split 1`. Result: two worlds of 0.5, Cg1 Kf1 Ra1 Rj1 kf8 and Ch3 Kf1 Ra1 Rj1 kf8, rights `KQ` in both
  (the chancellor is neither the king nor a castling rook). White's budget is 2.
- Black plays `f8-e8`.
  - The only castling move is `O-O-O` (`move 1`); `O-O` is illegal (`outcomes` null): the chancellor might be on g1.
- White measures instead, `?g1`: `g1 0.5 R | h3 0.5 R`. After the `h3` outcome: Ch3 Kf1 Ra1 Rj1 ke8, rights `KQ`.
- Black plays `e8-f8`. `O-O`: `move 1`, not rolled. Result: Ch3 Ki1 Ra1 Rh1 kf8, rights empty.

**Q12b. An enemy ghost on the path blocks castling too.**

- Two worlds, rights in both: {Ra1, Kf1, Rj1, kf8, **ni1**} and {Ra1, Kf1, Rj1, kf8, **ni3**}.
  - The only castling move is `O-O-O` (`move 1`); `O-O` is illegal.
- Two worlds, rights in both: {Ra1, Kf1, Rj1, kf8, **nb1**} and {Ra1, Kf1, Rj1, kf8, **na3**}.
  - The only castling move is `O-O` (`move 1`); `O-O-O` is illegal. b1 is crossed only by the rook, and it must be
    empty for certain as well.

---

## 8. Review notes

Open questions (from the original research; item 2 corrected and item 1 closed in the source review):

1. **Castling past a ghost and castling rights: decided.** The lead's decisions D1 and D2 (`handoff/CORE-CHANGES.md`)
   follow classic Quantum Chess: castling and en passant never roll and are legal only when every world allows
   them, and a castling right is lost as soon as the king or that rook is not 100 % home. Sections 3, 4.3–4.5, 5
   and 7 (Q1, Q2, Q10, Q11) now say so; T4 (no check condition) is unchanged.
2. **Alternative setups.** pychess offers Bird, Carrera, Conservative, Embassy, Gothic and more, and a random
   Capablanca version.
   - They are left out of 2.0: the brief asks for the exact Capablanca setup.
   - A later `setup` option could add them. They do not all castle the same way (FENs from
     `handoff/ext/pychess-variants/client/variants.ts`):
     - Bird, Carrera, Gothic, Schoolbook and Univers keep the king on f1 and the rooks in the corners, so they
       castle exactly like Capablanca chess.
     - Embassy has the king on e1 and castles to b1 or h1 (Fairy-Stockfish `embassy_variant()`:
       `castlingKingsideFile = FILE_H`, `castlingQueensideFile = FILE_B`). `castlingRights(..., { kingToLong,
       kingToShort })` already supports this.
     - Conservative (`ARNBQKBNRC`) and Victorian (`CRNBAKBNRQ`) have the rooks on b1 and i1, so on the j-side the
       king would end on its own rook's square (i1). These two need their own check on the core before they are
       offered.
3. **Glyphs.** For now the new pieces are text tokens "A" and "C". Real sprites would look better: for example a
   bishop and a knight drawn together, like the pychess sets. They need new SVG art under a
   compatible licence. That is a UI task, not a rules question.
4. **Bishop pair.** Muller adds 50 cp for the bishop pair. An optional `evaluate(w, side)` term (+50 when a side has
   both bishops in that world) could be added later. It was left out to keep the module minimal.
5. **Values.** Muller's and Trice's archbishop values differ by 2 pawns. The chosen values should be checked in
   play-testing against the computer player.
6. **The i-pawn weakness** (i2 and i7 undefended at the start) is a known flaw of Capablanca's setup. It is kept
   faithfully and is not a bug.

### 8.1 Source review

Reviewer 1 of 2, lens: rules fidelity. The pages were opened directly this time (chessvariants.com still answers
with a Cloudflare check, so it was read through web.archive.org), and the Fairy-Stockfish and pychess sources in
`handoff/ext/` were read. Scripts and fetched pages: `handoff/tmp/rev1-capablanca/`.

Sources:

- Wikipedia, raw wikitext: https://en.wikipedia.org/w/index.php?title=Capablanca_chess&action=raw
- chessvariants.com (archived copy):
  https://web.archive.org/web/2024/https://www.chessvariants.com/large.dir/capablanca.html
- H. G. Muller's rules page: https://hgm.nubati.net/rules/Capablanca.html
- Green Chess: https://greenchess.net/rules.php?v=capablanca
- Wikibooks: https://en.wikibooks.org/wiki/Chess_Variants/Capablanca_Chess
- Fairy-Stockfish `src/variant.cpp` (`capablanca_variant()`, `embassy_variant()`), `src/position.cpp`
  (`set_castling_right`, castling legality), `src/types.h` (piece values), `src/apiutil.h`
  (`has_insufficient_material`), `tests/perft.sh`, `test.py` (`test_castling`):
  https://github.com/fairy-stockfish/Fairy-Stockfish
- pychess-variants `client/variants.ts` and `static/docs/capablanca.md`: https://github.com/gbtami/pychess-variants
- pyffish 0.0.90 (the Python build of Fairy-Stockfish), installed in a local venv: https://pypi.org/project/pyffish/

Checked and correct as written (no change):

- Board 10 × 8, files a–j, ranks 1–8, square indices, colours (a1 dark, j1 light, f1 light, f8 dark). Wikipedia:
  "each king ... starts on a square of its own color (the white king on a light square; the black king on a dark
  square)".
- Every setup square (Wikipedia diagram, chessvariants "final version", Muller's square list, Fairy-Stockfish start
  FEN), both castling rights at the start, and the undefended i2 / i7 pawns (Wikipedia, gothicchess.info reference).
- The moves of all eight piece types. The archbishop and chancellor make either a slide or a jump, never both in one
  move (Wikibooks; Muller's Betza `BN` and `RN`).
- Castling: the king moves three squares, to i1/c1 (i8/c8), the rook to h1/d1 (h8/d8), and every square between king
  and rook must be empty (Muller: "all squares between King and Rook are empty"; Fairy-Stockfish `castlingPath =
  (between(rfrom, rto) | between(kfrom, kto)) & ~(kfrom | rfrom)`; Green Chess: "the rook moves two or three
  squares, depending on the side"). The classical check condition (start, crossed and end squares of the king) is
  as described in 2.4 (`position.cpp`, `Position::legal`).
- Double step from rank 2 / 7 only (no triple step on 10 × 8: chessvariants), en passant, and mandatory promotion to
  Q, C, A, R, B or N (Fairy-Stockfish `promotionPieceTypes`; Muller: "Promotes to Q, C, A, R, B, or N").
- Classical win and draw rules (Muller: checkmate wins, stalemate is a draw; Fairy-Stockfish defaults). The quantum
  draws match `docs/variants.md` and `quantum.js` (`quiet` resets on a capture or a pawn move, `quietPlies` 100,
  `maxPly` 600, `noMoves` draw).
- The piece values and their sources (Wikipedia "Piece values" table; Fairy-Stockfish `types.h`: A 2200, C 2300 /
  2600, Q 2538 / 2682).
- The rules card sentences 1–3 and 5–7.

Re-run and cross-checked:

- `cases.mjs`: 72 of 72 pass. `perft.mjs 4`: 28 / 784 / 25 228 / 805 128 (2 s), equal to `tests/perft.sh`.
  `fsfcastle.mjs`: all three `test_castling` positions match.
- Every T case that depends on classical rules (T1–T8) was also set up as a FEN in pyffish: 28 first moves; 22 / 24
  / 30 moves for A / C / Q on e4; the boxed-in chancellor's 8 jumps; the 12 and 6 promotion moves; 17 moves of the
  new chancellor on e8; `j2-j3`, `j2-j4`, `i4-i3`, `i4-j3` and the position after en passant; the rights `Qkq` and
  `kq` of T5 and `Q` after `j8-j1`; both castlings of T3 with their results; and no castling at all in the
  "through attack" position of T4. All agree with section 7.
- Differential test (`diffgen.mjs` + `diffcheck.py`): 1 500 random classical games (up to 160 plies, biased
  towards captures, pawn moves, castling and en passant) on the prototype with the legality filter of
  `perft.mjs`, compared with pyffish's legal-move list at every ply: 218 888 positions, including more than 230
  castlings, more than 270 en passant captures and about 3 600 promotions, with **0 differences**. The move
  generation of the module is therefore exactly Fairy-Stockfish's Capablanca chess, apart from the check rule that
  Quantum Chess drops on purpose.
- The Q cases were checked by hand for their classical part (the knight jump vectors c6-e7, d5-e7, h1-g3/i3,
  c1-d3; the slide c1-d2-e3-f4-g5; the blocked e-file and j-file slides; the diagonal promotion capture that is not
  a move on an empty h8; the double step through e3 and the en passant on the next ply).

Changes:

1. **Section 1, chessvariants row, and decision 1 (setup history).** The spec said that "the 10 × 10 versions had
   the new pieces next to the king and queen" and that "one intermediate 10 × 8 version had A on d1 and C on g1".
   The source says only the *first* (10 × 10) version had A d1 / C g1, and that it "is not clear" whether the
   intermediate form was that setup on 10 × 8 or the final setup on 10 × 10. Rewritten to say exactly that. The
   chosen setup does not change. Source: chessvariants.com (archived copy above).
2. **Section 1, chessvariants row, and decision 2 (piece names).** "Marshall" and "Chancellor" (for the bishop +
   knight) were Capablanca's own earlier names, not a naming of Bill Angel's program; the program only kept them.
   Sources: chessvariants.com ("At one point Capablanca also changed the names of his pieces. The older names are
   Marshall for Chancellor, and Chancellor for Archbishop. These older names are also used in Angel's program.");
   Wikipedia ("archbishop (... originally named chancellor) and chancellor (... originally named marshall ...) were
   introduced by Capablanca himself", citing Pritchard 2007, p. 122). The chosen names do not change.
3. **Section 2.5 (classical draws).** "as in Fairy-Stockfish" made precise: stalemate, threefold repetition and the
   50-move rule are Fairy-Stockfish variant defaults, while insufficient material is its API function that pychess
   uses to adjudicate. Added that a lone archbishop or chancellor is mating material. Sources: Fairy-Stockfish
   `variant.h`, `apiutil.h` (`MAJOR_PIECES` contains `ARCHBISHOP` and `CHANCELLOR`); Muller ("The Archbishop can
   force checkmate against a bare King").
4. **Section 4.4 (castling rights after a rook split).** "If the rook splits off its square, both halves leave, so
   the right is gone in every world" is not always true: a split half that is a slide blocked by a ghost stays home
   in that world (the rule 4.2 and Q4 describe), and the right survives there. Replaced by the exact rule and an
   example run on the real core (`handoff/tmp/rev1-capablanca/splitrook.mjs`: `j1-h1|j4` with a knight ghost on j3
   gives four worlds of 0.25, one of them keeps `K`, and a later `O-O` is `miss 0.75 R | move 0.25 R`).
5. **Section 5, rules card sentence 4.** Added Black's squares (i8 / c8, h8 / d8) and the condition that neither the
   king nor that rook may have moved; the sentence gave the empty-squares condition but not this one, so it could
   be read as "castling is always allowed". Sources: Muller ("A King that has not moved before can move three
   squares in the direction of a Rook that has not moved before"); Fairy-Stockfish castling rights.
6. **Section 6 (castling UI).** Added Black's castling targets i8 and c8.
7. **Section 8, open question 2 (alternative setups).** "Most keep the king on f and castle the same way" was too
   broad. Now listed per setup from the pychess FENs: Bird, Carrera, Gothic, Schoolbook and Univers castle exactly
   like Capablanca chess; Embassy (king on e1) castles to b1 / h1 (Fairy-Stockfish `embassy_variant()`);
   Conservative and Victorian have the rooks on b1 and i1, so the j-side castling would put the king on its own
   rook's square and needs its own check. The section heading became "8. Review notes"; the open questions are
   kept above.

#### Second pass (reviewer 1, lens: rules fidelity, on the working-tree core of 2026-09-25)

Re-checked against the sources above: Wikipedia (fetched again, identical wikitext), Muller's rules page (fetched
again), the archived chessvariants.com page, Green Chess (fetched again), Fairy-Stockfish `capablanca_variant()`,
`Position::set_castling_right` and `variant.h` defaults, pychess `client/variants.ts` and `static/docs/capablanca.md`,
and `docs/rules.md` sections 4–6 (the classic Quantum Chess rules the variants follow). Every classical rule of
sections 2.1–2.5 is correct as written. Scripts: `handoff/tmp/rev1-capablanca/r2_*`.

Re-run on the current core (which already has most of `handoff/CORE-CHANGES.md`):

- Differential test against pyffish again (`diffgen.mjs` seed 7, 300 games): 43 858 positions, 0 differences.
  Perft 28 / 784 / 25 228 / 805 128 and the three `test_castling` positions still match. A pyffish spot check of
  T1, T3, T4 (castling through attack), T5, T6 and T7 agrees with section 7.
- `cases.mjs`: T1–T9 and Q3–Q9 pass; Q1 now fails on purpose (castling is certain under D1, see below).
  `r2_cases_rest.mjs` (the same checks without Q1/Q2, with the two new hooks): 64 of 64 pass. `r2_cases.mjs`
  (the new Q1, Q2, Q9, Q10, Q11 and the 4.4 example, plus the Q2 and Q10 contrast without the hooks): 43 of 43 pass.

Changes:

8. **Sections 4.3, 4.4, 5 (sentence 7), 7 (Q1, Q2) and 8 (question 1): castling follows D1.** The spec still had
   the rolled, per-world castling of the old core. The lead's binding decision D1 (`handoff/CORE-CHANGES.md`, core
   items Q2, Q3, W5) follows classic Quantum Chess: castling never rolls, is legal only when every world allows it
   (king and rook home, every square between them empty for certain), and a right is lost everywhere as soon as the
   king or that rook is not 100 % home; a Missed king or rook move keeps it. Q1 (`O-O` is now illegal, not
   `miss 0.5 R | move 0.5 R`), Q2 (rights `Q` in both worlds after the partial slide; measuring the rook home does
   not restore `K`) and the 4.4 example (item 4 of the first pass: `O-O` is now illegal, not `miss 0.75 R |
   move 0.25 R`) were recomputed; Q11 was added. Source: `docs/rules.md` section 5 ("Every square between them must
   be empty for certain", "You lose a castling right as soon as, after any move, the king or that rook is not 100 %
   on its starting square", "A king or rook move that Missed does not cost the right").
9. **Sections 3 and 4.5, new test Q10: en passant only on the very next ply.** The module builds its own spec
   (`orthodoxSpec()` is 8 × 8 only), so it did not get the `applyMiss` hook that `orthodoxSpec()` now has. On the
   current core without it, a Measure turn keeps the en passant square, and after `e2-e4`, a Black Measure and a
   White Measure, `d4-e3` is still `capture 1` three plies later. Chess allows en passant only on the move right
   after the double step. Added `applyMiss(b) { return clearEnPassant(b) }` and `unifyWorlds(bs) { return
   unifyCastling(bs) }` to the sketch and the mapping table, and test Q10. Sources: Muller ("On the move immediately
   after such a double push, they can be captured en passant"), FIDE Laws art. 3.7.3.2 ("This capture is only
   legal on the move following this advance", https://handbook.fide.com/chapter/E012023), `docs/rules.md`
   section 4 ("only on the move right after the double step. It is always certain"), CORE-CHANGES D2, Q1 and W4
   (which names capablanca among the variants that must add this hook themselves).
10. **Section 3.1.** "Core changes needed: none" now names the planned core items the variant relies on (Q1–Q3,
    W4, W5), and the two chess960 requests are identified as CORE-CHANGES W1 and W2.
11. **Section 2.5.** The quiet-move draw counts only captures and pawn moves that actually happened; a Missed attempt
    does not reset it (`docs/rules.md` section 6; CORE-CHANGES Q8, already in the core).
12. **Section 4.6.** The computer's split sampler is now `aiSplits` (CORE-CHANGES U4); `splitsFromLimited` no longer
    exists in `src/variants/core/ai.js`.
13. **Section 1, Wikipedia row.** "Edward Lasker preferred 10 × 8" made exact: Lasker wrote that he and Capablanca
    found 10 × 8 preferable, while the article's lead says Capablanca himself preferred 10 × 10 and that the game
    is usually played on 10 × 8. The chosen rule set does not change. Source:
    https://en.wikipedia.org/w/index.php?title=Capablanca_chess&action=raw
14. **Top of the file and section 7 notation.** Say which script produced which expected values, and that
    `cases.mjs` Q1/Q2 predate D1.

### 8.2 Engine review

Reviewer 2 of 2, lens: engine and quantum consistency. Read against `handoff/IMPLEMENTING.md`,
`handoff/CONTRACT.md`, `handoff/CORE-CHANGES.md`, `docs/rules.md`, `docs/variants.md` and the working-tree core
(`quantum.js`, `world.js`, `orthodox.js`, `orthodoxVariant.js`, `variant.js`, `ai.js`), plus the board and game view
(`VariantBoard.vue`, `VariantGameView.vue`, `useVariantGame.js`, `glyphs.js`, `texts.js`). Scripts:
`handoff/tmp/critic-capablanca/eng_*.mjs` (the older files in that folder belong to an earlier, stopped run against a
patched core copy and were not used).

What was run on the working-tree core:

- `eng_proto.mjs` is the section 3 sketch line for line, with seven placeholder rules strings. Reviewer 1's scripts
  pointed at it: `eng_rest.mjs` 64 of 64 (T1–T9, Q3–Q9), `eng_d1.mjs` 29 of 29 (the D1/D2 cases Q1, Q2, the 4.4
  example, Q9, Q10, Q11 with the hooks). `eng_cases.mjs`: 32 of 32 (the values the earlier scripts did not check and
  every new case below).
- `eng_fuzz.mjs`: 80 random games of up to 160 plies (about 7 s), with a split every third ply and a bias towards
  castling, en passant and promotions to A or C: 31 castlings, 19 en passant captures, 12 promotions to A or C, 616
  splits and 128 merges of an archbishop or chancellor, 1 346 rolled moves, up to 64 worlds. Invariants after every
  ply: those of `fuzz.spec.js` (weights, world bound, budget, solid pieces equal, board consistent, no move after the
  result), plus the castling rights are identical in every world and each right's king and rook stand on their
  squares in every world (the rook as one piece, 100 % there), plus the en passant square is identical in every
  world and set only right after a double step. No failure, and no outcome carried a `solid:` or `end:` note.
- `eng_aitime.mjs`: the computer on the three heaviest states of 40 random games (64 worlds, 94–96 legal moves): easy
  71–82 ms, normal 1.53 s, hard 3.7–4.0 s: easy finishes well within its 0.4 s, normal and hard stop at their limits
  (1.5 s, 4 s) give or take one candidate move. `eng_splitcost.mjs`: split targets and lists of a central queen,
  chancellor and archbishop (see 4.6).
- The sketch was linted as the module file (`npx eslint --stdin --stdin-filename src/variants/capablanca.js`, with the
  SPDX header and a file comment added): 12 errors before the fix below, 0 after.

Checked and correct as written (no change):

- The mapping of section 3 uses only what the core has: `standardBoard(10, 8)`, `orthodoxTypes` with six promotion
  choices, `standardSetup` and `castlingRights` (king to file `files − 2` = i or 2 = c, rook next to it inside),
  `pawnExtras` with the double-step rank, `castlingMoves` (kind `castle`), `orthodoxAfterMove`, and the optional hooks
  `applyMiss(b, action, side, info)` and `unifyWorlds(bs, mover)` exactly as `variant.js` documents them (the sketch
  ignores the extra arguments, as `orthodoxSpec()` does). Castling and en passant are certain by the core's default
  (`isCertain`), so nothing needs declaring. The type ids `a` and `c` are valid, and the promotion keys
  (`e7-e8=c`, `e7-e8=a`) parse as ordinary moves.
- Every quantum decision of section 4 matches `docs/rules.md` and the core: castling legal only when every world
  generates it (`table()` removes a certain key missing from some world), rights unified after every action, a
  Missed outcome keeping them, en passant only on the next ply (`orthodoxAfterMove` plus `applyMiss`), promotions
  measured because the pawn is solid, splits and merges never using castling, en passant or promotions, the budget
  (8 per side), the location bound (4) and the world bound (64).
- Section 6's board: `rectTopology(10, 8)` gives the cells, shades, labels and size described; Black's view turns by
  180° by default; `glyphOf` draws `{ text, shape: 'circle' }` as described; the promotion box lists the six moves
  in `promoteTo` order.

Changes:

1. **Top of the file.** `proto.mjs` is no longer "the module of section 3, line for line": it lacks the two hooks.
   `cases.mjs` does not "fail on Q1 and Q2" but stops with an exception at Q1, so its later checks never run. Both
   rows now say so and name `eng_proto.mjs` as the literal sketch; a paragraph lists the engine review's scripts.
2. **Section 3, the sketch.** It did not pass the repository's lint rules, which CI enforces and which the implementer
   would copy: imports out of order (`perfectionist/sort-imports`), several names per import line
   (`@stylistic/exp-list-style`), and several spaces before an end-of-line comment (`@stylistic/no-multi-spaces`).
   Replaced by ESLint's own fix of the same code; the behaviour is unchanged (every case passes on it).
3. **Section 4.2.** Added "the key tells which": no knight jump points along a rook or bishop line, so a key is a jump
   in every world or a slide in every world. This is the compound-piece form of the "one key, two meanings" problem
   that CORE-CHANGES Q2 guards against for castling, and it cannot arise here. The landing rule now names its
   exception, a part moving onto the piece's own other part, which joins it without a roll (docs/rules.md 2.1,
   CORE-CHANGES Q14); new test Q3b.
4. **Section 4.3.** "Blocks the castling until the square is empty again" did not say what happens to the right.
   Added that the right is kept (only the king and that rook matter), with the new tests Q12 (own chancellor split
   onto g1; `O-O` illegal, then `move 1` after the ghost is measured on h3) and Q12b (an enemy ghost on i1, and on b1,
   the square only the rook crosses). Added the tip that jumps clear the path for certain while a blocked slide half
   stays home.
5. **Section 4.4.** "A king or rook move that Missed keeps the right (Q11)" was tested only for the king. Added the
   rook case to Q11 (`j1-j5` rolled because it lands on a possible knight: Missed keeps `KQ`, Captured leaves `Q`) and
   the note that a Missed outcome exists only for a rolled move, while an unrolled partial slide loses the right (Q2).
6. **Section 4.6.** Added why the solid roll and the game-end roll never split a branch in this variant (the king and
   pawns only make measured or certain moves, and a solid king is on a target in all worlds or none), confirmed by the
   random games. The split sizes named only the chancellor; the queen is the largest (30 targets, 435 pairs on 10 × 8)
   and the archbishop has 22 (231). Added the measured costs and the computer's time at 64 worlds.
7. **Section 5, rules sentence 7.** The first half repeated the shared rules card (`sharedRules()` in `texts.js`:
   "Castling and en passant are only possible when they are possible in every possibility, and they are never
   rolled"), and "the king and that rook must be certainly on their squares" was misleading: in Q2 the rook is
   measured back onto j1, certainly there, and `O-O` stays illegal. The sentence now says what the shared card does
   not: a ghost anywhere between king and rook blocks castling, and the right is lost for good as soon as the king
   or that rook is not 100 % on its starting square (docs/rules.md 5). The "no check" half is unchanged.
8. **Section 6.** Two items were not in the board API: a "legend" line under the rules card (a variant has no such
   hook; the only legend is the fog legend of hidden games) and a castle badge with a tooltip on i1 / c1 (the board's
   marks are selected, target, last, part, pick and danger, with no per-target tooltip). Both are dropped: rules
   sentence 2 is the legend, and the castling targets carry the ordinary target mark. "Type names serve tooltips"
   became what the board does (the square's `aria-label` and the promotion buttons' labels). The promotion box
   already wraps, so "it may wrap onto two rows" became "no change needed". Added the last-move marks of a castling.
9. **Section 7.**
   - Notation: which script produced the new values, and what `royalDanger` means.
   - T2: the placeholder `?e4` reads like a Measure code; now "one piece on e4 (an archbishop, a chancellor or a
     queen)".
   - Exact results added where only the outcome or a summary was given: Q3 `e4-f6` (both worlds), Q5 `g7-g8=a` (both
     worlds), Q6b's Captured result.
   - King danger added to Q6 (1: the ring counts the converging capture, CORE-CHANGES Q7), Q6b (0.75) and Q7 (0.5):
     the ring is where the defender sees a jump-plus-slide converging capture coming (docs/rules.md 5).
   - Q8: the quiet counter after Missed (1) and Moved (0), the claim of section 2.5.
   - New: Q3b, the rook part of Q11, Q12 and Q12b (items 3–5).

Core changes needed:

- None. Everything the spec uses is in the working-tree core (CORE-CHANGES Q1–Q3, Q7, Q8, Q14, W3–W5, U4 among the
  items it relies on), and every expected value above was produced on it.
