# Variant spec: `raumschach` (Raumschach, 5x5x5 space chess, Maack 1907)

Category: `dimensions`. UI name and summary line as already fixed in `src/variants/catalog.js` (do not change them
there): name "3D chess (Raumschach)", summary "Five boards stacked into a 5 × 5 × 5 cube, with the unicorn flying
through space."

---

## 1. Sources and chosen rule set

Research note: the original research session could not open web pages and worked from search-engine extracts. The
source review (section 8.1) later fetched the pages below and read Maack's 1919 book in the Internet Archive scan;
the table now says what each source really gives. Every move count below was computed with two independent move
generators: `handoff/tools/raum.py` and a prototype on the real `src/variants/core`
(`handoff/tmp/rev-raum1/proto.mjs` and `check.mjs`). They agree on every number.

| Source | What it gives |
|---|---|
| Ferdinand Maack, *Raumschach: Einführung in die Spielpraxis* (Hamburg 1919), scan: https://archive.org/details/space-chess-introduction-to-game-practice-ferdinand-maack | The primary source, read in the scan. p. 28: "Der initiale Doppelschritt der Bauern sowie die Rochade fallen im Raum fort" (no double step, no castling). Black pawns promote on line α1 and White pawns on the diagonally opposite line, ε5 in the 5×5×5 game. pp. 40-41: four pawn gaits A-D. **Gait C ("neue" Gangart)**: a White pawn on γc3 moves to γc4 and δc3 and captures on γb4, γd4, δb3, δc4 and δd3, "also wie B, aber ausserdem noch seitwärts nach oben schlagen". Fig. 14, start position C: Black's level δ rank 5 is **U B Q U B** (unicorns δa5, δd5). p. 43: the new method is called the "Normalspiel". Maack names the levels α-ε, where this spec uses A-E. |
| Ferdinand Maack, *Spielregeln zum Raumschach* (1907, revised 1913) | Earlier rules. Not consulted. |
| International Raumschach Federation (IRF): https://www.raumschach.org/tutorial, https://www.raumschach.org/misconceptions, https://www.raumschach.org/theory1 (piece monographs), https://www.raumschach.org/theory3 | Notation (level A-E, file a-e, rank 1-5). The full setup, including **Black unicorns Da5, Dd5** ("note these are not the mirror of White's files; the asymmetry is correct by the original rules") and Black bishops Db5, De5. The pawn "moves rookwise … but captures bishopwise": 2 moves and **5 captures**, with the example "A White Pawn on Cc3 can move to Cc4 … or Dc3 …, and capture on Cb4, Cd4, Db3, Dc4, or Dd3". Promotion on **rank 5 of level E** (Black: rank 1 of level A) to Q, R, B, U or N. No double step and no en passant. "Check, checkmate, stalemate, and draws by repetition or the 50-move rule all work exactly as in standard chess." Theory Vol. I, section IX gives the value ordering Q > B > N > R > U > P. |
| Chess Variant Pages, "Raumschach": https://www.chessvariants.com/3d.dir/3d5.html (text by Bruce Balden 1990, edited by Hans Bodlaender and John William Brown; read in the Wayback copy of 2026-03-09, because the live page returns 403 to automated clients) | The same board and the same piece moves. Bishop example: from Dc4 an empty board gives 18 cells. Unicorn example: from Cc3, 16 cells. Pawn: a White pawn on Ac2 moves to Ac3 or Bc2 and captures on Ab3, Ad3, Bb2, Bd2, "and (according to some) at Bc3"; the page notes that Dickins supports Bc3. No 2-step move, so no en passant. **Its setup differs:** Black **bishops** on Da5 and Dd5, **unicorns** on Db5 and De5 (a mirror of White's files). Its promotion sentence is garbled ("the far side of level A and level B for White"). It says nothing about castling or stalemate. |
| Wikipedia, "Three-dimensional chess", Raumschach section: https://en.wikipedia.org/wiki/Three-dimensional_chess | The standard rules settled by the Hamburg club after WWI (Maack 1919). White moves first and checkmate is the goal. The pawn "moves one step as a rook and captures edge-wise as a bishop, but only towards its corresponding promotion rank"; there is no two-step move, no en passant and no castling. It describes Maack's pawn sets A-D, with C the "new" set adopted by the club. The start diagram (after Dickins 1971, p. 17) puts the unicorns on Bb1, Be1, **Da5, Dd5**. It shows White's Bd2 pawn moving to Bd3 and Cd2 and threatening Bc3, Be3, Cc2, Cd3 and Ce2 (5 captures), and Black's Dd5 unicorn reaching Cc4, Bb3, Ce4 and capturing on Aa2. |
| A. Dickins, *A Guide to Fairy Chess* (1969/1971), pp. 16-18 | Cited by Wikipedia (setup) and chessvariants.com (the Bc3 capture). Not consulted directly. |
| D. B. Pritchard, *The Classified Encyclopedia of Chess Variants* (2007), entry "Raumschach" | Not consulted directly. |

**Chosen rule set: Maack's "Normalspiel" of 1919 (pawn gait C), with the 10-pawn start array of Dickins and the IRF.**

- **Pawn captures: 5 directions.** This is Maack's own gait C, the pawn of his "Normalspiel" (1919, pp. 41 and 43).
  Wikipedia (the Hamburg club's standard rules), Dickins (via chessvariants.com) and the IRF give the same 5
  directions. chessvariants.com lists 4 and mentions the fifth, Bc3, only as a rule some players use. Stated as one
  rule: a pawn moves one rook step forward or up, and captures one bishop step that has a forward or up component and
  no backward or down component.
- **Black's minor pieces sit point-symmetric to White's:** Black unicorns on Da5 and Dd5, Black bishops on Db5 and
  De5. Maack's Fig. 14, the Dickins diagram on Wikipedia and the IRF all say so. chessvariants.com mirrors them the
  other way (bishops Da5/Dd5); that setup is not used.
  - Check: each side gets one bishop of each cell colour.
  - Check: White's Be1 unicorn and Black's Da5 unicorn share a colour complex, and so do White's Bb1 and Black's
    Dd5. The IRF (theory Vol. I, unicorn monograph) states both facts.
- **10 pawns per side** (5 on each of the two home levels), as in Dickins, Wikipedia, chessvariants.com and the IRF
  "Normal Form". Maack's own Fig. 14 shows only 8: Ab2-Ad2 plus Ba2-Be2, and the mirror for Black. He calls that
  array C⁴ and the 10-pawn array C³ (p. 42). The modern standard is followed.

---

## 2. Classical rules (complete)

### 2.1 Board and topology

- **Cells.** A 5x5x5 cube: 125 cells, all of which exist.
- **Levels.** Five 5x5 levels, named `A` (bottom, White's home) to `E` (top, Black's home).
- **Files and ranks.** Files `a`-`e` (left to right from White's side). Ranks `1`-`5` (from White's side towards
  Black's).
- **Cell names** are level, then file, then rank: `Aa1` is White's bottom-left-near corner, `Cc3` is the centre and
  `Ee5` is the far top corner.
- **Coordinates** (0-based): `x` = file (a=0 … e=4), `y` = rank - 1 (0 … 4), `z` = level (A=0 … E=4). So
  `Aa1 = (0,0,0)`, `Cc3 = (2,2,2)` and `Ee5 = (4,4,4)`.
- **Cell colour.** Dark if `(x + y + z)` is even (so `Aa1` is dark, as a1 is in chess), light otherwise. Bishops never
  change colour. This matches chessvariants.com ("Board A has black in the corner, Board B has white in the corner")
  and the IRF, which counts from 1 and calls a cell White when level + file + rank is even.
- **Unicorn classes.** Unicorns are bound to one of 4 classes by parity: `(x, y, z) mod 2`, up to flipping all three
  bits. The classes hold 35 cells ({000,111}) and 30, 30 and 30 cells.

### 2.2 Pieces and movement

Vectors are `(dx, dy, dz)` in the coordinates above. "Ride" means slide any distance until blocked; a slider can
capture the first enemy piece on its line.

| Piece | Letter | Descriptor | Directions |
|---|---|---|---|
| King | K | `leap` over all 26 vectors with each component in {-1, 0, 1}, not all zero | 26 neighbours (6 face, 12 edge, 8 corner) |
| Queen | Q | `ride` over the same 26 vectors | rook + bishop + unicorn |
| Rook | R | `ride` over the 6 vectors with exactly one non-zero component (±1) | through the faces of the cell |
| Bishop | B | `ride` over the 12 vectors with exactly two non-zero components (±1, ±1) | through the edges; a flat diagonal in any of the three plane orientations |
| Unicorn | U | `ride` over the 8 vectors (±1, ±1, ±1) | through the corners ("triagonals"); all three coordinates change at once |
| Knight | N | `leap` over the 24 vectors that are a permutation of (0, ±1, ±2) | 2 steps along one axis and 1 along another; the third coordinate stays the same |
| Pawn | P | see below | |

**Pawn** (vectors oriented: White as written; Black multiplies each vector by `(1, -1, -1)`, so its forward is
towards rank 1 and its "up" is towards level A):

- **Move** (`mode: 'move'`, target must be empty): `leap [(0,1,0), (0,0,1)]`. One step forward (same level, next
  rank) or one step up (next level, same rank).
- **Capture** (`mode: 'capture'`, target must hold an enemy):
  `leap [(1,1,0), (-1,1,0), (1,0,1), (-1,0,1), (0,1,1)]`.
  - Diagonally forward on the same level (2 vectors).
  - Diagonally up and sideways (2 vectors).
  - Forward and up (1 vector).
- There is **no** double step, **no** en passant and **no** capture straight ahead or straight up.
- A pawn never moves or captures backwards or down. For example, `(0,-1,+1)` is not a pawn capture.

**Mobility on an empty board** (a check for the move generator):

- Rook: always 12.
- Bishop: 12 on `Aa1`, 24 on `Cc3`.
- Unicorn: 4 on `Aa1`, 16 on `Cc3`.
- Queen: 28 on `Aa1`, 52 on `Cc3`.
- King: 7 on `Aa1`, 26 on `Cc3`.
- Knight: 6 on `Aa1`, 24 on `Cc3`.
- Averages over all 125 cells: R 12.0, B 14.4, N 11.5, U 6.4, Q 32.8.

### 2.3 Setup (40 pieces, 20 per side)

| Side | Level | Cells |
|---|---|---|
| White | A, rank 1 | R `Aa1`, N `Ab1`, K `Ac1`, N `Ad1`, R `Ae1` |
| White | A, rank 2 | P `Aa2`, `Ab2`, `Ac2`, `Ad2`, `Ae2` |
| White | B, rank 1 | B `Ba1`, U `Bb1`, Q `Bc1`, B `Bd1`, U `Be1` |
| White | B, rank 2 | P `Ba2`, `Bb2`, `Bc2`, `Bd2`, `Be2` |
| Black | E, rank 5 | R `Ea5`, N `Eb5`, K `Ec5`, N `Ed5`, R `Ee5` |
| Black | E, rank 4 | P `Ea4`, `Eb4`, `Ec4`, `Ed4`, `Ee4` |
| Black | D, rank 5 | U `Da5`, B `Db5`, Q `Dc5`, U `Dd5`, B `De5` |
| Black | D, rank 4 | P `Da4`, `Db4`, `Dc4`, `Dd4`, `De4` |

- Sources: the IRF tutorial, the Dickins diagram on Wikipedia and, for the officers, Maack 1919 Fig. 14. For the
  10 pawns and chessvariants.com's different Black level D, see section 1.
- Black's array is White's turned through the centre of the cube (point symmetry), not mirrored across the middle
  rank. Black's unicorns stand on files a and d, White's on files b and e.
- Bishop colours: White `Ba1` is light and `Bd1` is dark. Black `Db5` is dark and `De5` is light.
- Kings face each other on the c-file (`Ac1` and `Ec5`), and so do the queens (`Bc1` and `Dc5`).

### 2.4 Special moves

- No castling.
- No double step.
- No en passant.
- Sources: Maack 1919, p. 28 ("Der initiale Doppelschritt der Bauern sowie die Rochade fallen im Raum fort"), the IRF
  tutorial and Wikipedia.

### 2.5 Promotion

- A White pawn that arrives on **rank 5 of level E** (`Ea5`-`Ee5`) must promote. For Black, this is **rank 1 of
  level A** (`Aa1`-`Ae1`).
  - These are the only cells where a pawn has no forward move left.
  - A pawn on rank 5 of a lower level still moves up. A pawn on level E below rank 5 still moves forward.
- The pawn may promote to a Q, R, B, N or **U** (unicorn), never a K. Source: the IRF tutorial ("Promoted Pawns may
  become any piece — Queen, Rook, Bishop, Unicorn, or Knight"). Maack's 1919 wording (p. 28, "gehen … in die Dame")
  names only the queen. The IRF's full choice is used.
- A pawn can arrive by a move (forward or up) or by a capture. Example: White `Dd4xEd5=Q` via `(0,1,1)`. Its move key
  is `Dd4-Ed5=q` (section 3).
- Sources for the promotion cells: Maack 1919, p. 28 (Black on α1, White on the diagonally opposite line, ε5) and the
  IRF tutorial.

### 2.6 Win, draw, turn order

- **Turn order.** White moves first, then the sides alternate (Wikipedia).
- **Classically**, a game is won by checkmate. Stalemate, threefold repetition and the 50-move rule are draws. Source:
  the IRF tutorial, "Check, checkmate, stalemate, and draws by repetition or the 50-move rule all work exactly as in
  standard chess".
- **In Quantum Chess 2.0**, the shared rules of the variants core (`src/variants/core/quantum.js`) replace check and
  mate. There is no check rule, so a king may step into danger.
  - You win by **capturing the enemy king**: the default `worldResult`, reason `king`.
  - A side to move with **no legal move** draws (`noMoves`). Because there is no check rule, this needs every piece
    of that side to be blocked. Classical stalemate positions are usually not draws here: the king must move into
    capture.
  - **Bare kings** (this variant's own `worldResult`, reason `bareKings`): when only the two kings are left on the
    board and the side to move next cannot capture the other king, the game is a draw. If the kings touch (share a
    face, an edge or a corner), the game goes on and the side to move takes the king. This is the draw of
    `docs/rules.md` section 6 ("only the two kings are left", which waits while the king can be captured for certain),
    in the form the 4D sibling `hyper4d.md` uses. `handoff/CORE-CHANGES.md` item 40 leaves this draw to each variant.
  - **Quiet rule**, the analogue of the 50-move rule: after 100 plies without a capture or a pawn move, the game is a
    draw (`quiet`, `quietPlies` 100). Only a pawn move that really happened resets the count, as `docs/rules.md`
    section 6 says: a Missed pawn move adds 1 like any other move (CORE-CHANGES Q8, now in the core; see RQ3).
  - **Ply cap**: after 600 plies the game is a draw (`moveLimit`).
  - The variants core has **no** `king_trapped` (mate) test and no repetition draw, and CORE-CHANGES does not add
    them (item 60 rejects repetition draws). A mated king is simply captured on the next move.

---

## 3. Engine mapping (contract)

The declaration below uses the API as built (`handoff/IMPLEMENTING.md`, `src/variants/core/`), including the
CORE-CHANGES items that are now in the working tree (Q1-Q14, U4, U7). A prototype written from it runs every case of
section 7 on the real core: `handoff/tmp/critic-raumschach/proto.mjs`, with `check.mjs` (R1-R10, RQ1-RQ6) and
`check3.mjs` (R11, RQ2, RQ3, RQ7-RQ13).

```js
import { t } from '@nextcloud/l10n'
import { allDirections, directions, makeTopology, symmetric } from './core/topology.js'
import { attacks, hasRoyal, royalSquares, worldFrom } from './core/world.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'

const FACE6 = directions(3, 1)       // rook: 6 vectors
const EDGE12 = directions(3, 2)      // bishop: 12 vectors
const CORNER8 = directions(3, 3)     // unicorn: 8 vectors
const ALL26 = allDirections(3)       // king and queen: 26 vectors
const KNIGHT24 = symmetric([1, 2], 3) // knight: the 24 permutations of (0, ±1, ±2)

const spec = {
  id: 'raumschach',
  category: 'dimensions',          // the placeholder module says 'rules'; the catalogue says 'dimensions'
  // name and summary: as in src/variants/catalog.js ('3D chess (Raumschach)'), not repeated in the module
  sides: whiteBlack(),
  topology: makeTopology({ coords, name, cell, layout }),   // section 6; coords [x, y, z], z outermost, x innermost
  //   name: ([x, y, z]) => 'ABCDE'[z] + 'abcde'[x] + (y + 1)
  // Black's pawns go towards rank 1 AND towards level A. The core's default `orient` only negates coordinate 1
  // (the rank), so this variant MUST override it (NOT a 180° turn: x is kept):
  orient: (side, v) => (side === 0 ? v : [v[0], -v[1], -v[2]]),
  types: {
    k: { name: () => t('quantumchess', 'King'), moves: [{ leap: ALL26 }], royal: true, value: 0,
         glyph: { sprite: 'k' } },
    q: { name: () => t('quantumchess', 'Queen'), moves: [{ ride: ALL26 }], value: 1100, glyph: { sprite: 'q' } },
    r: { name: () => t('quantumchess', 'Rook'), moves: [{ ride: FACE6 }], value: 450, glyph: { sprite: 'r' } },
    b: { name: () => t('quantumchess', 'Bishop'), moves: [{ ride: EDGE12 }], value: 520, glyph: { sprite: 'b' } },
    u: { name: () => t('quantumchess', 'Unicorn'), moves: [{ ride: CORNER8 }], value: 170,
         glyph: { text: 'U', shape: 'circle' } },
    n: { name: () => t('quantumchess', 'Knight'), moves: [{ leap: KNIGHT24 }], value: 470, glyph: { sprite: 'n' } },
    p: {
      name: () => t('quantumchess', 'Pawn'),
      moves: [
        { leap: [[0, 1, 0], [0, 0, 1]], oriented: true, mode: 'move' },
        { leap: [[1, 1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, 1], [0, 1, 1]], oriented: true, mode: 'capture' },
      ],
      solid: true, value: 100, glyph: { sprite: 'p' },
      // pushMove expands every pawn move or capture onto a zone cell into the five keys =q/=r/=b/=n/=u and, as
      // `optional` is not set, offers no plain key
      promote: {
        zone: (side, to) => {
          const [, y, z] = spec.topology.coords[to]
          return side === 0 ? y === 4 && z === 4 : y === 0 && z === 0
        },
        to: ['q', 'r', 'b', 'n', 'u'],
      },
    },
  },
  // START: the placement map of section 2.3, { Aa1: '0:r', Ab1: '0:n', ..., Ee5: '1:r' } (40 entries)
  setup() { return worldFrom(spec, START) },   // a fresh world per game; no options, no rng
  // no extraMoves (no castling, double step or en passant), no afterMove (the core applies the promotion), no
  // filterMoves, no visibility, no options, no applyMiss / unifyWorlds (CORE-CHANGES Q1, Q3: `x` stays {}, so there
  // is nothing per world to expire or unify), no measured hook, no budgetRule (the default 8 per side)
  worldResult(b, mover) {
    // the default king rule
    const alive = [0, 1].map((s) => hasRoyal(spec, b, s))
    if (!alive[0] || !alive[1]) {
      return { winner: alive[0] ? 0 : alive[1] ? 1 : null, reason: 'king' }
    }
    // bare kings (section 2.6): only the kings are left and the side to move next cannot take the mover's king
    for (let id = 0; id < b.sq.length; id++) {
      if (b.sq[id] >= 0 && !spec.royalTypes.has(b.ty[id])) {
        return null
      }
    }
    return attacks(spec, b, 1 - mover, royalSquares(spec, b, mover)[0]) ? null : { winner: null, reason: 'bareKings' }
  },
  // no reasonText: the app's generic text for 'bareKings' is "only the two kings are left" (CORE-CHANGES U7, in
  // src/variantplay/texts.js), and 'king', 'quiet', 'moveLimit' and 'noMoves' have generic texts too
  // computer player only: minor pieces and the queen towards the centre Cc3 (0 to 36 centipawns each, see below)
  evaluate(b, side) {
    let s = 0
    for (let id = 0; id < b.sq.length; id++) {
      if (b.sq[id] >= 0 && CENTRAL.has(b.ty[id])) {
        s += (b.sd[id] === side ? 6 : -6) * (6 - DIST[b.sq[id]])   // DIST: Manhattan distance to Cc3, per cell
      }
    }
    return s
  },
  rules: () => [ /* the translated sentences of section 5 */ ],
}
// const CENTRAL = new Set(['n', 'b', 'u', 'q'])
// const DIST = topology.coords.map(([x, y, z]) => Math.abs(x - 2) + Math.abs(y - 2) + Math.abs(z - 2))
export default defineVariant(spec)
```

- **Checked on the core:** the vector helpers give 6, 12, 8, 26 and 24 vectors. The topology orders the cells
  z, y, x, so `Aa1` is square 0, `Cc3` square 62 and `Ee5` square 124.
- **Fields that do not exist in the API:** `pieceTypes` is `types`, a text glyph is `{ text, shape }` (not a
  string), side names are functions (`whiteBlack()`), and the layout lives inside the topology (there is no
  `layout` field). `enemies` is left at its default (`a !== b`). `rules()` is required.
- **Sides and teams.** Two sides, no teams.
- **Royal.** `k`.
- **Solid.** `k` and `p`.
- **Splittable.** `q`, `r`, `b`, `u` and `n`, including promoted pieces.
- **Move keys.** Cell-based, built by the core's `moveKey`. A capture is written with `-` like any other move, and
  the promotion letter is the lower-case type id:
  - moves: `Bc1-Dc3`, `Dd4-Ed5=q`, `Dc5-Ec5=u`;
  - splits: `Bb1-Ca2|Cc2`;
  - merges: `Ca2|Cc2-Db3` (after that split, both unicorn parts reach `Db3`, `Db1`, `Bb3` and `Bb1`).
  - Cell names match `/^[A-E][a-e][1-5]$/`. The core parses codes with `topology.byName`, so the variant needs no
    parser of its own.
  - The display notation may still show `x` for a capture and a capital letter (`Dd4xEd5=Q`), as sections 2 and 4
    do.
- **Piece values** (centipawns, for the generic AI):

  | Piece | P | U | R | N | B | Q |
  |---|---|---|---|---|---|---|
  | Value | 100 | 170 | 450 | 470 | 520 | 1100 |

  - The ordering Q > B > N > R > U > P follows the IRF (theory Vol. I, section IX).
  - The magnitudes are scaled roughly from empty-board mobility (§2.2). They are a playtesting estimate, not a rule.
  - For reference, the IRF is not consistent about the unicorn. The misconceptions page calls it "worth roughly as
    much as a pawn". Theory Vol. I, section IX gives P 1.0, U 3.0, R 4.5, N 5.0, B 5.5, Q 15.0, and the site's engine
    Raumcapa uses 100, 290, 460, 510, 560 and 1620 centipawns. The values above keep the IRF ordering. Against Vol. I they
    are equal for the rook, a little lower for the knight and bishop, and much lower for the unicorn and the queen.
  - Positional term: the `evaluate` hook in the declaration above, a centralisation bonus of
    `6 × (6 - Manhattan distance to Cc3)` for each N, B, U and Q, added for the side's own pieces and subtracted for
    the enemy's. It matters for more than style: `aiSplits` (CORE-CHANGES U4) ranks split targets by the world value,
    which changes on a quiet move only through `evaluate`, so without it the 6 targets are picked at random. Measured
    with `handoff/tmp/critic-raumschach/ai2.mjs` for the start queen `Bc1`: without the term `aiSplits` gave
    `Cc1|Ec1`, `Cc1|De1`, `Cc1|De3` and the like; with it, every pair uses `Dc3` or `Cc2`, the queen's two targets
    next to the centre.
  - The mobility term the first version suggested (`+4` per attacked cell) is left out. It needs a full move
    generation per world at every leaf. Measured: the hard level took 170 ms instead of 44 ms at the start and 1.5 s
    instead of 0.39 s in a 4-world middlegame. At 64 worlds it would eat the 4-second thinking time.
- **AI performance note.**
  - White has 61 classical moves at the start (perft 1), perft 2 is 3,735 and perft 3 is 253,705 (no check).
  - In the middlegame, a centralised queen alone has up to 52 targets, which gives C(52,2) = 1,326 split pairs
    (1,225 on an otherwise empty board with the two kings, where 50 of its targets are certainly empty).
  - Split pruning for the AI is generic, with no variant hook: CORE-CHANGES U4 (`aiSplits`, now in `ai.js`) takes the
    6 best quiet targets per piece, pairs them, and keeps at most 6 legal splits. The split list offered to humans
    stays complete.
  - Measured on the current core (`handoff/tmp/critic-raumschach/ai.mjs`, `ai2.mjs`, `fuzz.mjs`): `splitsFrom` for
    that queen takes 17 ms with 1 world, and 50 ms with 8 worlds and a full budget. `chooseMove` takes 3, 19-34 and
    44 ms at the start (easy, normal, hard), and 8, 137-156 and 376-391 ms in a 4-world middlegame, with or without
    the centralisation term. A random game of 60 plies takes well under 100 ms. Nothing variant-specific is needed.

---

## 4. Quantum adaptation

The shared quantum rules apply unchanged: worlds, split, merge, measure, "land = roll, pass = link", the solid roll,
the game-end roll, a budget of 8 per side and at most 4 cells per split. Here is how they meet this variant's rules.
Every example below is a test case of section 7 and was run on the real core.

1. **Lines are 3D, and the rule is the same.**
   - A rook, bishop, unicorn or queen that passes a cell where a piece *might* be gets linked, not rolled, as long
     as its target is empty in every world (RQ1: a rook sliding up the column `Aa1`-`Ea1` past a 50% knight on
     `Ca1`). If that link would push the mover's budget over 8, the move is rolled instead ("Roll (budget full)",
     RQ12).
   - A move whose target might hold another piece in any world, even a world where the mover is elsewhere, is
     measured: if the worlds disagree on its result, a roll decides (`docs/rules.md` 3.1). Another part of the moving
     piece itself does not count as "another piece" (item 10).
   - Knights leap, so they are never blocked and never linked: a knight move is only rolled if its target might be
     occupied (RQ10).
2. **Split targets can be on different levels.** Any two cells the piece could reach with a quiet move qualify,
   provided both are certainly empty. For example, `Bb1-Ca2|Cc2` (unicorn) or `Bc1-Cc1|Ec1` (queen, straight up).
   The parts of one split may even lie on one line (`Bb1-Cc2|Dd3`). As usual, each half needs its own lane to be
   clear in its world; where a ghost blocks one lane, that half stays home in those worlds (RQ8).
3. **Pawns.** They are solid, and every pawn move is in the measured class M.
   - **Push forward or push up** onto a cell that might be occupied: roll. `Moved` means the cell was free; `Missed`
     means it was occupied (by any piece, your own included, which then is 100% there: RQ3). A pawn never captures
     straight ahead or straight up.
   - **Capture** (5 directions) onto a ghost: roll, `Captured` or `Missed` (RQ4; for Black, forward-and-down: RQ7).
   - A `Missed` pawn move does not reset the quiet counter; a `Moved` one does (RQ3, section 2.6).
   - There is no double step or en passant, so none of the classic special cases arise.
4. **Promotion.**
   - The piece is chosen as part of the move key (`=q`, `=r`, `=b`, `=n` or `=u`).
   - It happens only in the worlds where the pawn really arrives on its promotion cell. The pawn is solid, so a roll
     settles this at once (RQ5; by a capture onto a ghost: RQ7).
   - A promoted piece, the unicorn included, can split and merge.
5. **No castling.** So no castling-rights bookkeeping and no "castling through ghosts" cases. The CORE-CHANGES items
   for castling and en passant (Q1-Q3, W4, W5) do not concern this variant.
6. **Kings.**
   - The king is solid. A king step onto a cell that might be occupied is a roll.
   - King danger (`royalDanger`, the ring) is the largest weight of the worlds in which one enemy move captures the
     king: an ordinary move along the 26 lines, the 24 knight leaps or the pawns' 5 capture cells, or a merge (a
     converging capture), as `docs/rules.md` section 5 says. A king that a split unicorn can take for certain by a
     merge shows 100%, although each single part would only hit it with 50% (RQ9). Where a ghost blocks one part's
     lane, that part cannot merge onto the king, and the ring shows the other part's chance (RQ9). The merge part is
     CORE-CHANGES Q7, now in the core; before it the ring showed 50%.
   - Mate is not detected: the variants core has no `king_trapped` test (section 2.6). A king that cannot escape is
     captured on the next move. The draw rules are those of section 2.6.
7. **The solid roll** is only a safety net here. Kings and pawns move only by measured moves, and every capture of a
   solid piece is measured, so solid pieces never disagree between worlds. It never fired in 400 random games, half
   of them from sparse random positions, with splits, merges and measurements (66,384 plies, up to 64 worlds;
   `handoff/tmp/critic-raumschach/fuzz2.mjs`). The script also checked after every ply that the kings and pawns
   stand on the same cells in every world.
8. **The game-end roll.** `worldResult` reports a missing king or bare kings (section 2.6). Neither can differ
   between the worlds of one outcome:
   - a king capture is always measured (the king is on the target in every world);
   - an unmeasured move or merge captures nothing, and a measured one is split into outcomes by its per-world result,
     so within one outcome either every world captured one enemy piece or none did. Both sides therefore have the
     same number of pieces in every world, and "only the two kings are left" holds in all worlds or in none;
   - the kings are solid, so "the kings touch" is the same in every world.
   So this roll is never needed. It never fired in the same 400 games, and those checked after every ply that the
   piece counts and `worldResult` agree in every world. Bare kings can still arrive through a roll, for example when
   a king captures the last enemy piece where it is a ghost: that outcome is a draw, the other one plays on (RQ13).
9. **Budget 8, location cap 4, Measure.** Unchanged. A unicorn part can only ever stand on cells of its own parity
   class, which the what-if view shows naturally. With the budget full, a slide past a ghost is rolled instead of
   linked (RQ12).
10. **Moving one part onto another part of the same piece.** `docs/rules.md` 2.1: the part joins the other part
    wherever its path is clear, with no roll. The core does this (CORE-CHANGES Q14, now in the core): the piece's own
    part on the target, with the same type, is not "another piece", so the move is not measured. Worlds where the
    path is blocked keep the part where it was, linked to the blocker; a piece linked to the ghost is not settled
    (RQ11). A merge whose target is one of the two parts' own cells is refused; the ordinary move does the same job.

Nothing in this variant needs a new quantum rule.

---

## 5. Player-facing rules text (rules card)

`rules()` returns these 8 entries, in this order, each through `t('quantumchess', '…')`. The view shows each entry as
one bullet. The shared quantum rules (`sharedRules()` in `src/variantplay/texts.js`: split, merge, land = roll /
pass = link, solid kings and pawns, measure, castling and en passant, the game-end roll, the budget) are shown
separately, so they are not repeated here. They do not say how a game is won, so entry 7 does.

1. The board is a cube of five levels, from A at the bottom (White's home) to E at the top (Black's home); a cell is
   named level, file, rank, so Cc3 is the centre.
2. Rooks move straight, also up and down; bishops move diagonally within any flat slice of the cube; unicorns move
   through the corners, changing level, file and rank at once.
3. The queen moves like a rook, bishop or unicorn, the king steps to any of the 26 touching cells, and the knight
   jumps 2 cells one way and 1 another, also across levels.
4. Pawns step one cell forward or one level up, and capture one cell forward and sideways, up and sideways, or forward
   and up, never straight ahead or straight up. For Black, forward is towards rank 1 and up is towards level A.
5. A pawn that reaches the far rank of the opponent's home level (White: rank 5 of E; Black: rank 1 of A) must become
   a queen, rook, bishop, knight or unicorn.
6. There is no castling, no double step and no en passant.
7. There is no check or checkmate: you win by capturing the enemy king, and you may move into danger.
8. If only the two kings are left and they do not touch, the game is drawn.

---

## 6. UI layout

The layout API as built: `topology.cells` and `topology.layout` (`boards`, `labels`, `lines`, `areas`, `zoomable`)
are static, and `layoutOf(state)` sees only the state (not the container size, not the viewer). `VariantBoard.vue`
turns the whole drawing by 180° for Black, turns the labels with it, and draws each `boards[].label` above the
*turned* board. CORE-CHANGES item 38 rejects wide and compact layouts for now ("one layout plus zoom"). So the variant
ships **one** layout: the grid below.

- **Cells.** Squares (`shape: 'rect'`, `w = h = 1`). Shade `dark` when `(x+y+z)` is even, `light` otherwise.
- **Grid** (every screen, every viewer): three rows read bottom-up, with a column gap of 0.6 and a row gap of 1.0.
  - Bottom row: `A` (left), `B` (right). Middle row: `C`, `D`. Top row: `E`, centred.
  - Board offsets (top-left corner): A `(0, 12)`, B `(5.6, 12)`, C `(0, 6)`, D `(5.6, 6)`, E `(2.8, 0)`.
  - Cell `(x, y, z)` is at `X = ox(z) + x`, `Y = oy(z) + 4 - y` (rank 5 at the top of each board).
  - The drawing is 10.6 × 17 cells (the core computes it from the cells). On a phone 360 px wide that gives about
    30 px per cell. On a desktop the board is limited by its maximum height (the viewport minus 150 px): about 40 px
    per cell at a 900 px high window.
  - `layout.zoomable: true`. The board offers zoom on its own only when width × height > 200, and this drawing is
    180.2.
- **Labels** (all as `layout.labels`, which turn with the drawing):
  - the level letter `A` … `E` centred 0.35 above each board, at `(ox + 2.5, oy - 0.35)`. Plain letters, because a
    label's text is fixed when the module loads; the rules card says that A is the bottom and E the top;
  - the file letters `a` … `e` under each board, at `(ox + x + 0.5, oy + 5.32)`;
  - the rank numbers `1` … `5` left of each board, at `(ox - 0.3, oy + 4 - y + 0.5)`.
- **Board frames.** One `layout.boards` entry `{ x: ox, y: oy, w: 5, h: 5 }` per level, **without** `label`. A board
  label is always drawn above the turned board, so in Black's view it would sit on top of the file letters, which the
  turn moves above each board. `handoff/tmp/critic-raumschach/layout.mjs` checks every label box in both views. It
  finds no overlap for this recipe (grid and wide row alike). The old recipe (board labels, row gap 0.6) overlaps in
  both views for the grid, and in Black's view for the wide row.
- **Black's view.** The default 180° turn for side 1: `E` is at the bottom centre, then `D` (left) and `C` (right),
  then `B` (left) and `A` (right) at the top. Each board is turned too. For both players, their own pawns move up the
  screen, both forward (within a board) and up a level (to the next row).
- **Later, with a UI change** (not in v1):
  - **Wide row** for landscape screens: the five levels in one row, `A` to `E` left to right, gap 0.6.
    - Cell `(x, y, z)` at `X = z·5.6 + x`, `Y = 4 - y`.
    - The drawing is 27.4 × 5 cells.
    - Same label recipe, with the rank numbers only left of board `A`.
    - The UI must pass the container shape to `layoutOf` (CORE-CHANGES item 38, deferred).
  - **Column hint**: hovering or selecting a cell outlines the cells with the same file and rank on the other four
    levels. The board has no hover marks, and `layout.lines` are painted under the opaque cells, so this needs a UI
    change.
  - **Unicorn sprite**: a cburnett-style knight head with a straight horn, white and black versions. It needs new
    symbols in the sprite sheet and a `sprite: 'u'` mapping in `glyphs.js`.
- **Move targets** appear on every level at once, with the usual previews (Certain / Quantum / Roll). This is the
  generic board behaviour.
- **Glyphs.**
  - Orthodox pieces use the cburnett sprites (`{ sprite: 'k' }` and so on).
  - **Unicorn:** `{ text: 'U', shape: 'circle' }`. `glyphOf` draws a round token in the side's colour, with dark ink
    on White's white token and white ink on Black's dark token.
  - The notation letter is `U`, and the promotion picker shows the unicorn token. Ghost parts fade and carry a
    percentage badge, as for every piece.
- **Colour is never the only cue.** Every board shows its level letter. Every cell's accessible name (the
  `aria-label` that `VariantBoard.vue` builds) is its name plus its possible occupants, for example
  `Cc3: Queen (50 %)`. There is no visible hover tooltip today.

---

## 7. Test cases

Unless stated otherwise, positions add White K `Ae3` and Black K `Ee3` (the "default kings"). They take no part in
the tested moves, except where a case says so. "Classical moves" means the classical generator's keys for one world,
with no check rule. Keys are the core's `moveKey` keys (section 3). Every classical expectation below (R1-R10) was
run on the real core (`handoff/tmp/rev-raum1/check.mjs`), and R1 also with `handoff/tools/raum.py`.

For the quantum cases (RQ), "50% on X and 50% on Y" means a state of two worlds of equal weight that differ only in
that piece; several such pieces in one case are in the same two worlds (linked) unless the case says "independent".
White is to move unless the case says otherwise. Outcomes are listed with their chance; "roll" means the outcomes are
rolled, "no roll" means a single unrolled outcome. Every R11 and RQ expectation was run on the current core
(`handoff/tmp/critic-raumschach/check.mjs` and `check3.mjs`, which build such states with `stateOf` as
`tests/js/variants/helpers.js` does).

**R1. Start position.**
- The board has 125 cells and 40 pieces.
- White has exactly **61** classical moves: 15 pawn, 14 queen, 13 bishop, 12 knight, 7 unicorn, 0 king, 0 rook.
- Black also has 61.
- Perft 2 (White then Black, pseudo-legal) = **3,735**. Perft 3 = **253,705**.

**R2. Start-position detail.**
- `Ac2` (White pawn) has exactly one move, `Ac2-Ac3`: `Bc2` holds its own pawn and nothing is capturable.
- `Bc2` has `Bc3` and `Cc2`. `Bd2` has exactly `Bd3` and `Cd2`, as in the Dickins diagram on Wikipedia.
- Knight `Ab1` → {`Aa3`, `Ac3`, `Bb3`, `Ca1`, `Cb2`, `Cc1`}.
- Unicorn `Bb1` → {`Ca2`, `Cc2`, `Dd3`, `Ee4`}. `Ee4` is a capture of Black's pawn.
- Unicorn `Be1` → {`Cd2`, `Dc3`, `Eb4`}. `Eb4` is a capture.
- Black's unicorn `Dd5` (Black to move) → exactly {`Aa2`, `Bb3`, `Cc4`, `Ce4`}. `Aa2` is a capture of White's pawn,
  as in the Wikipedia diagram.
- King `Ac1` and both rooks have no moves.

**R3. Knight geometry.** No pieces other than the default kings:
- White knight `Aa1` → exactly {`Ab3`, `Ac2`, `Ba3`, `Bc1`, `Ca2`, `Cb1`}.
- A knight on `Cc3` has 24 moves.

**R4. Unicorn geometry.** White unicorn `Cc3`, no other pieces than the default kings (no unicorn line from `Cc3` meets
`Ae3` or `Ee3`):
- exactly 16 moves: {`Aa1`, `Aa5`, `Ae1`, `Ae5`, `Bb2`, `Bb4`, `Bd2`, `Bd4`, `Db2`, `Db4`, `Dd2`, `Dd4`, `Ea1`, `Ea5`,
  `Ee1`, `Ee5`};
- `Cc3-Cc4` (a rook step), `Cc3-Cd4` (a bishop step) and `Cc3-Dc4` are illegal.

**R5. Bishop, rook, queen and king geometry.** White piece, default kings unless stated:
- Bishop `Aa1` → exactly {`Ab2`, `Ac3`, `Ad4`, `Ae5`, `Ba2`, `Bb1`, `Ca3`, `Cc1`, `Da4`, `Dd1`, `Ea5`, `Ee1`}.
- Bishop `Dc4` → exactly the 18 cells of the chessvariants.com example: {`Da2`, `Db3`, `Dd5`, `De2`, `Dd3`, `Db5`,
  `Eb4`, `Ed4`, `Cb4`, `Cd4`, `Ba4`, `Be4`, `Ec3`, `Ec5`, `Cc3`, `Cc5`, `Bc2`, `Ac1`}.
- Rook `Aa1` → {`Aa2`-`Aa5`, `Ab1`-`Ae1`, `Ba1`-`Ea1`}: 12 moves.
- Queen `Aa1`: 28 moves.
- Queen `Cc3`: **51** moves with the default kings. The bishop line `(1,0,-1)` runs `Cc3`-`Bd3`-`Ae3` and ends on
  White's own king, while the line `(1,0,1)` ends with the capture of Black's king on `Ee3`. With no kings at all
  (a bare world, generation only) the queen has 52.
- King on `Cc3`: 26 moves. White's king stands on `Cc3` instead of `Ae3`, and Black's king stays on `Ee3`.

**R6. Pawn directions.**
- White pawn `Cc3`, Black knights on `Cb4`, `Cd4`, `Db3`, `Dd3` and `Dc4`, with `Cc4` and `Dc3` empty. Moves:
  - pushes: `Cc4`, `Dc3`;
  - captures: `Cb4`, `Cd4`, `Db3`, `Dd3`, `Dc4`;
  - 7 moves in total.
  - This is exactly the example of Maack's gait C (1919, p. 41: γc3 to γc4, δc3; captures γb4, γd4, δb3, δc4, δd3)
    and of the IRF tutorial.
- Mirrored: Black pawn `Cc3`, White knights on `Cb2`, `Cd2`, `Bb3`, `Bd3` and `Bc2`. Moves:
  - pushes: `Cc2`, `Bc3`;
  - captures: `Cb2`, `Cd2`, `Bb3`, `Bd3`, `Bc2`.

**R7. What a pawn cannot do.**
- White pawn `Ac2` with Black knights on `Ac3`, `Bc2` and `Bc1`: **no moves**.
  - It cannot capture straight ahead (`Ac3`) or straight up (`Bc2`).
  - `Bc1` is up-and-backward, so it cannot capture there either.
- White pawn `Ac2` on an otherwise empty board: exactly `Ac3` and `Bc2`. `Ac2-Ac4` (a double step) is illegal.

**R8. Promotion.**
- White pawn `Dc5`, empty `Ec5`: the moves are exactly `Dc5-Ec5=q`, `=r`, `=b`, `=n` and `=u` (5 keys). `Dc5-Ec5`
  without a piece letter is illegal: no world generates that key. The core has no separate reason code for it.
- White pawn `Cc5`, empty `Dc5`: exactly `Cc5-Dc5`, a plain move (level D is not the promotion level).
- White pawn `Dd4`, Black knight `Ed5`: exactly 7 keys. They are `Dd4-Ed5=q`, `=r`, `=b`, `=n` and `=u` (the
  forward-up capture onto a promotion cell), plus the plain moves `Dd4-Ed4` (up) and `Dd4-Dd5` (forward, level D).
- White pawn `Ec4`: `Ec4-Ec5=k` is illegal (a king is not a promotion choice).
- Black pawn `Ba2`: exactly `Ba2-Aa2` (down) and `Ba2-Ba1` (forward), both plain moves. `Ba1` is rank 1 of level B,
  not of level A.
- Black pawn `Ab2`: exactly `Ab2-Ab1=q`, `=r`, `=b`, `=n` and `=u`.

**R9. No castling.**
- Position: White K `Ac1`, R `Aa1`, R `Ae1`, Black K `Ee3`, and nothing else (no White king on `Ae3`).
- **Expected:** the king has exactly 11 moves, its in-board neighbours: {`Ab1`, `Ab2`, `Ac2`, `Ad1`, `Ad2`, `Bb1`,
  `Bb2`, `Bc1`, `Bc2`, `Bd1`, `Bd2`}.
- No key moves the king two cells or swaps it with a rook.

**R10. Colours.**
- The bishop on `Ba1` stands on a light cell (`x+y+z = 1`); every cell it can ever reach is light.
- The bishop on `Bd1` stands on a dark cell (sum 4).
- A unicorn from `Bb1` (class {010,101}) can never reach `Be1`'s class {001,110}.

**R11. Bare kings** (no default kings; one world).
- White K `Cc3`, Black K `Ee5`, Black N `Dc3`. White plays `Cc3-Dc3` (Captured, no roll). **Expected:** the game is
  drawn, `{ winner: null, reason: 'bareKings' }`: only the kings are left, and `Dc3` and `Ee5` do not touch.
- The same with the Black king on `Ed4`, which touches `Dc3` (a corner): no result, Black to move. Black then plays
  `Ed4-Dc3` and wins, `{ winner: 1, reason: 'king' }`.
- The same as the first case plus a White pawn on `Aa2`: no result (a pawn is left).

**RQ1. Pass = link along a vertical line** (quantum).
- White R `Aa1`. Black N is 50% on `Ca1` and 50% on `Ce4` (2 worlds). `Ba1`, `Da1` and `Ea1` are empty.
- White plays `Aa1-Ea1`.
- **Expected:**
  - No roll: the rook is not solid and `Ea1` is certainly empty.
  - In the world with the knight on `Ca1`, the move is blocked and the rook stays on `Aa1`. In the other world, the
    rook reaches `Ea1`.
  - The rook is now 50% `Aa1` / 50% `Ea1`, linked: the rook is on `Aa1` exactly when the knight is on `Ca1`.
  - White's budget is 2/8.

**RQ2. Unicorn splits and the budget** (quantum). From the start position, White plays three splits:
1. `Bb1-Ca2|Cc2`. Both cells are certainly empty and reachable. The unicorn is 50/50. No roll. Budget 2. Black
   replies `Ea4-Ea3` (no roll).
2. `Be1-Cd2|Dc3`. Legal: the half going to `Dc3` passes `Cd2`, which is empty in the world the split starts from.
   Budget 4. Black replies `Eb4-Eb3`.
3. `Bd1-Ce1|Db1`. Legal, budget 8, 8 worlds. Black replies `Ec4-Ec3`.
- A fourth split is illegal because White's budget would exceed 8: `Bc1-Cc1|Dc1` has no outcome, and `splitsFrom`
  offers the queen no split at all. The core simply finds no outcome (`branches` returns null); it has no reason code
  such as `budget_full`.
- `Bd1-Cd2|Ce1` would have been illegal at step 3, because `Cd2` is not certainly empty.

**RQ3. Pawn probe, forward or up** (quantum).
- White P `Bc2`. Black N is 50% on `Bc3` and 50% on `Cc2`.
- White plays `Bc2-Cc2` (push up). **Expected:** a roll.
  - 50% **Moved**: the pawn is on `Cc2`, and the knight is 100% on `Bc3`.
  - 50% **Missed**: the pawn stays on `Bc2`, and the knight is 100% on `Cc2`.
- `Bc2-Bc3` gives the mirror result.
- Quiet counter (section 2.6): starting from 40, **Missed** gives 41 and **Moved** gives 0.
- Probing your own ghost: White P `Bc2`, White U 50% on `Cc2` and 50% on `Aa4` (White's budget 2). `Bc2-Cc2` is a
  roll:
  - 50% **Missed**: the pawn stays on `Bc2`, and the unicorn is 100% on `Cc2`;
  - 50% **Moved**: the pawn is on `Cc2`, and the unicorn is 100% on `Aa4`.
  - Either way White's budget drops to 1.

**RQ4. Forward-and-up capture onto a ghost** (quantum).
- White P `Bc2`. Black B is 50% on `Cc3` and 50% on `Ce5`.
- White plays `Bc2-Cc3` (shown as `Bc2xCc3`), the `(0,1,1)` capture. **Expected:** a roll.
  - 50% **Captured**: the bishop is gone.
  - 50% **Missed**: the pawn stays on `Bc2`, and the bishop is 100% on `Ce5`.
- Under the 4-direction rule that chessvariants.com prefers, this move would not exist. This test pins the chosen rule
  (Maack's gait C and the IRF).

**RQ5. Promotion only if the pawn arrives** (quantum).
- White P `Dc5`. Black N is 50% on `Ec5` and 50% on `Eb3`.
- White plays `Dc5-Ec5=u`. **Expected:** a roll.
  - 50% **Moved**: a White unicorn stands 100% on `Ec5`, and the knight is 100% on `Eb3`.
  - 50% **Missed**: a White pawn (not promoted) stays on `Dc5`, and the knight is 100% on `Ec5`.
- `Dc5-Ec5` without a piece letter is illegal.
- Undo (UI, not the variant module): `docs/rules.md` section 8 says that playing the same move again in the same
  position gives the same result "even if you pick a different piece to promote to". So undo followed by
  `Dc5-Ec5=u` or by `Dc5-Ec5=q` must replay the same roll. Today's UI keys its roll memo `<ply>:<code>`
  (`src/variantplay/composables/useVariantGame.js`), so `=q` after an undo gets a fresh roll. That is a UI bug for
  every variant with promotion; see "UI change" in 8.2.

**RQ6. A converging capture in 3D** (quantum).
- White Q is 50% on `Aa1` and 50% on `Ee1`. Black R stands solid on `Cc1`. `Bb1` and `Dd1` are empty.
- White plays the merge `Aa1|Ee1-Cc1`.
  - `Aa1` to `Cc1` is the bishop line `(1,0,1)` through `Bb1`.
  - `Ee1` to `Cc1` is the bishop line `(-1,0,-1)` through `Dd1`.
- **Expected:** both lanes are certainly clear and the queen has no other part, so the capture is **certain**. No
  roll. The queen is 100% on `Cc1` and the rook is gone.
- Variant: add a Black knight that is 50% on `Bb1` and 50% on `Ab3`, independent of the queen (4 worlds of 25%).
  - The merge is now **rolled**: **75% Captured**, **25% Missed**.
  - It misses only in the world where the queen is on `Aa1` and the knight blocks `Bb1`. The `Ee1` part is never
    blocked.
  - After **Missed**: the queen is 100% on `Aa1`, the knight 100% on `Bb1` and the rook still on `Cc1`.

**RQ7. Black promotes by capturing a ghost, forward and down** (quantum; Black to move).
- Black P `Bb2`. White N is 50% on `Ab1` and 50% on `Cc3`.
- Black's pawn has exactly these keys: `Bb2-Ab1=q`, `=r`, `=b`, `=n`, `=u` (the capture `(0,-1,-1)` for Black onto
  rank 1 of level A), `Bb2-Ab2` (down) and `Bb2-Bb1` (forward). `Bb2-Ab1` without a letter is illegal.
- Black plays `Bb2-Ab1=q`. **Expected:** a roll.
  - 50% **Captured**: a Black queen stands 100% on `Ab1`, no Black pawn is left, the knight is gone; White to move.
  - 50% **Missed**: the pawn stays on `Bb2` (not promoted), and the knight is 100% on `Cc3`.
- This case pins the orientation override `(x, -y, -z)` of section 3: with the core's default `orient`, Black's pawn
  would capture upwards and the keys would differ.

**RQ8. A split along one line, blocked in one world** (quantum).
- White U `Bb1`. Black N is 50% on `Cc2` and 50% on `Ea5`.
- The unicorn's split targets are exactly `Aa2`, `Ac2`, `Ca2`, `Dd3` and `Ee4`: `Cc2` is not certainly empty, while
  `Dd3` and `Ee4` count because the knight is not on `Cc2` in one world.
- White plays `Bb1-Ca2|Dd3`. **Expected:** legal, no roll. In the world with the knight on `Cc2`, the half going to
  `Dd3` is blocked and stays home.
  - The unicorn is 25% `Bb1`, 50% `Ca2`, 25% `Dd3`.
  - Four worlds of 25% (unicorn / knight): `Bb1`/`Cc2`, `Ca2`/`Cc2`, `Ca2`/`Ea5`, `Dd3`/`Ea5`.
  - Budgets: White 3, Black 2.
- With the knight solid on `Cc2` (one world), the same split is illegal: no world has both lanes clear.

**RQ9. A ghost unicorn against the king, across levels** (quantum).
- White U is 50% on `Cc1` and 50% on `Cc5`. Both parts attack Black's king on `Ee3`: `Cc1`-`Dd2`-`Ee3` and
  `Cc5`-`Dd4`-`Ee3`.
- King danger of Black's king: **100%**, with White or with Black to move. The merge `Cc1|Cc5-Ee3` captures in both
  worlds (CORE-CHANGES Q7; before it the ring showed 50%).
- White plays `Cc1-Ee3`: a roll, 50% **Captured** (White wins, `reason: 'king'`) and 50% **Missed** (the unicorn is
  100% on `Cc5`, the game goes on, Black to move).
- White plays the merge `Cc1|Cc5-Ee3` instead: **Captured, no roll**; White wins.
- A blocked lane: a Black knight is on `Dd2` in the world with the unicorn on `Cc1`, and on `Ab3` in the other
  world.
  - King danger: **50%** (only the `Cc5` part can reach the king).
  - The merge `Cc1|Cc5-Ee3` is illegal: the `Cc1` part reaches `Ee3` in no world.
  - `Cc5-Ee3` is a roll, 50% Missed / 50% Captured. `Cc1-Dd2` is a roll too, 50% Missed / 50% Captured (the knight).

**RQ10. Knights leap past ghosts** (quantum).
- White N `Aa1`. Black R is 50% on `Ba1` and 50% on `Ee5`.
- White plays `Aa1-Ca2` (the leap `(0,1,2)`, straight over `Ba1`). **Expected:** Moved, no roll. The knight is 100% on
  `Ca2`, the rook stays 50% `Ba1` / 50% `Ee5`, White's budget is 1.

**RQ11. A part moves onto another part of the same piece** (quantum).
- White Q is 50% on `Aa1` and 50% on `Ae1`. A Black knight is on `Ca1` in the world with the queen on `Aa1` and on
  `Ce4` in the other world.
- White plays `Aa1-Ae1` (along rank 1 of level A). **Expected:** Moved, **no roll** (CORE-CHANGES Q14,
  `docs/rules.md` 2.1).
  - The queen is 100% on `Ae1`. The knight stays 50% `Ca1` / 50% `Ce4`: nothing was measured.
  - Two worlds remain; budgets: White 1, Black 2.
- The merge `Aa1|Ae1-Ae1` is illegal (its target is one of the two parts' own cells).
- Path blocked in one world: three worlds of 1/3, (queen `Aa1`, knight `Ac1`), (queen `Aa1`, knight `Ce4`) and
  (queen `Ae1`, knight `Ce4`). `Aa1-Ae1` is again Moved with no roll: the queen is 1/3 `Aa1` (where the knight blocks
  `Ac1`) and 2/3 `Ae1`, linked to the knight (1/3 `Ac1`, 2/3 `Ce4`); two worlds remain.

**RQ12. Budget full: a slide is rolled instead of linked** (quantum).
- White R `Aa1`. Four independent 50/50 pieces, so 16 worlds of 1/16: White N on `Bb2` or `Bd2`, White B on `Db2`
  or `Dd2`, White U on `Cb1` or `Cd1`, Black N on `Ca1` or `Ce5`. White's budget is 8, Black's 2.
- White plays `Aa1-Ea1`. A link would give White 16 arrangements, so **a roll** ("Roll (budget full)"):
  - 50% **Missed**: the rook is 100% on `Aa1`, the Black knight 100% on `Ca1`; 8 worlds, White's budget 8.
  - 50% **Moved**: the rook is 100% on `Ea1`, the Black knight 100% on `Ce5`; 8 worlds, White's budget 8.
- The same with the unicorn solid on `Cc1` (8 worlds, White's budget 4): `Aa1-Ea1` links (Moved, no roll) and White's
  budget becomes 8.

**RQ13. Bare kings through a roll** (quantum; no default kings; Black to move).
- White K `Ac1`, Black K `Ee5`. White Q is 50% on `Dd4` and 50% on `Aa5`.
- Black plays `Ee5-Dd4` (a king step onto a cell that might be occupied). **Expected:** a roll, with no solid or
  game-end roll after it.
  - 50% **Moved**: the queen was on `Aa5` and is now 100% there, the Black king is on `Dd4`, no result, White to move.
  - 50% **Captured**: only the two kings are left and `Ac1` does not touch `Dd4`: a draw, `reason: 'bareKings'`.
- With the White king on `Cc3` instead (it touches `Dd4`), the Captured outcome has no result, White is to move, and
  `Cc3-Dd4` wins for White (`reason: 'king'`).

---

## 8. Review notes

### 8.1 Source review

Reviewer lens: fidelity to the classical rules. The pages were fetched directly this time. chessvariants.com returns
403 to automated clients, so its page was read in the Wayback Machine copy of 2026-03-09. Maack's 1919 book was read
in the Internet Archive scan: the OCR text, plus pages 28-29 and 40-43 viewed as images. No engine in `handoff/ext/`
implements Raumschach. The scripts are in `handoff/tmp/rev-raum1/`: `proto.mjs` is a Raumschach declaration on the
real `src/variants/core`, and `check.mjs` and `check2.mjs` run the section 7 cases. `handoff/tools/raum.py` was run
again as an independent second generator.

Checked and correct as written (no change):

- Board, level letters A-E (Maack uses α-ε), cell names level-file-rank, `Aa1` and `Ee5` as the corners, `Cc3` as the
  centre. Sources: https://www.raumschach.org/tutorial and https://www.chessvariants.com/3d.dir/3d5.html.
- Rook (faces), bishop (edges), unicorn (corners), queen (all 26), king (26 neighbours) and knight ((0,1,2) leaper,
  24 targets from the centre). Sources: the IRF tutorial, Wikipedia
  (https://en.wikipedia.org/wiki/Three-dimensional_chess) and chessvariants.com. The chessvariants.com unicorn
  example from `Cc3` (16 cells) is the R4 list exactly, and its bishop example from `Dc4` gives the same 18 cells on
  the core (added to R5).
- The pawn: moves one step forward or up, captures in 5 directions, no capture straight ahead or up, never backward
  or down. Matches Maack 1919 p. 41 (gait C), the IRF example from `Cc3` and the Wikipedia diagram for `Bd2`.
- The White setup, Black's officers on level E, and Black's level D **U B Q U B** (unicorns `Da5` and `Dd5`). Matches
  Maack 1919 Fig. 14 (p. 41), the IRF tutorial and the Dickins diagram on Wikipedia.
- Promotion cells (White `Ea5`-`Ee5`, Black `Aa1`-`Ae1`), no castling, no double step, no en passant, White moves
  first. Sources: Maack 1919 p. 28, the IRF tutorial and Wikipedia.
- The colour and unicorn-class facts (bishop colours, 35/30/30/30 cells, the shared unicorn complexes). Source: IRF
  theory Vol. I (https://www.raumschach.org/theory1).
- Every empty-board mobility figure and average in 2.2, and the expected results of R1-R4, R6, R7, R9, R10 and RQ1-RQ6.
  They were reproduced on the core (the quantum cases with `outcomes`/`applyOutcome` on two- and four-world states).
  61 moves for each side and perft 2 = 3,735 also come out of `raum.py`.

Changes:

1. **Header and section 3, name and summary.** Now as fixed in `src/variants/catalog.js`: "3D chess (Raumschach)" and
   "Five boards stacked into a 5 × 5 × 5 cube, with the unicorn flying through space." The spec had its own
   "Raumschach" and "Chess in a 5x5x5 cube…", but IMPLEMENTING.md says the catalogue is already written and must not
   be edited.
2. **Section 1, chessvariants.com row.** Rewritten from the page itself:
   - The text is by Bruce Balden (1990), edited by Hans Bodlaender and John William Brown, not "Bodlaender / Cazaux".
   - It lists 4 pawn captures and names the fifth (Bc3) as a rule "according to some", which Dickins supports.
   - **Its setup is not the same:** Black bishops on Da5 and Dd5, unicorns on Db5 and De5. The old spec said
     chessvariants.com gives the unicorns on Da5 and Dd5. That was wrong.
   - It says nothing about castling or stalemate (the old row claimed both), and its promotion sentence is garbled.
   - Source: https://web.archive.org/web/20260309170137/https://www.chessvariants.com/3d.dir/3d5.html
3. **Section 1, Maack 1919 now consulted.** Quoted: no double step and no castling (p. 28), the promotion lines (p. 28),
   pawn gait C with exactly the 5 capture cells (p. 41), Fig. 14 with Black's level D **U B Q U B** (p. 41), and the
   name "Normalspiel" (p. 43).
   - The rationale for 5 capture directions now rests on Maack's own "Normalspiel" pawn, the Hamburg club's standard
     (Wikipedia), Dickins and the IRF. The old rationale was "no version is the original" plus the IRF alone.
   - Source: https://archive.org/details/space-chess-introduction-to-game-practice-ferdinand-maack
4. **Section 1, Wikipedia and IRF rows.** Filled in what the pages actually give:
   - Wikipedia: the standard rules, pawn sets A-D, and the Dickins start diagram with the `Bd2` pawn and `Dd5` unicorn
     examples (used in R2).
   - IRF: its exact pawn example and its draw rules.
   - Pritchard and Dickins are marked "not consulted directly".
5. **Section 1 and 2.3, pawn count.** Documented that Maack's Fig. 14 shows 8 pawns per side (his array C⁴). The spec
   keeps the 10-pawn array (his C³), which Dickins, Wikipedia, chessvariants.com and the IRF all use. Source: Maack
   1919 pp. 41-42 (scan above).
6. **Section 2.1, colour convention.** Noted that the dark-if-even rule matches chessvariants.com and the IRF, which
   uses 1-based coordinates and the opposite parity wording. Sources: chessvariants.com (as above) and
   https://www.raumschach.org/misconceptions.
7. **Section 2.3 and 2.4, sources and symmetry.** Added the sources and an explicit sentence that Black's array is
   White's turned through the centre of the cube, not mirrored across the middle rank.
8. **Section 2.5, promotion choice.** Maack's wording names only the queen ("in die Dame"). The IRF allows Q, R, B, U
   or N, and that choice is kept, now with its source. Added the move key `Dd4-Ed5=q`. Source:
   https://www.raumschach.org/tutorial.
9. **Section 2.6, classical draws.** These are now attributed to the IRF ("Check, checkmate, stalemate, and draws by
   repetition or the 50-move rule all work exactly as in standard chess"), not to chessvariants.com, which says
   nothing about them. White moves first: Wikipedia.
10. **Section 2.6 and 4.6, the quantum end rules.** The old text promised `king_trapped`, a bare-kings draw and
    repetition "as in the classic game". Those exist in the classic engine (`src/engine/constants.js`), but not in
    the variants core. `src/variants/core/quantum.js` ends a game only by king capture (default `worldResult`,
    reason `king`), `noMoves` (draw), `quiet` (100 plies without a capture or pawn move) and `moveLimit` (600 plies).
    The text now says exactly that. It also notes that classical stalemate is usually not a draw here, and that rules
    added by the core team would apply unchanged.
11. **Section 3, orientation.** The core's default `orient` negates only coordinate 1. Black's pawns must also go
    down a level, so the variant must override `orient` with `(x, -y, -z)`. With the default, Black's pawns would
    move and capture upwards: a rules bug. Checked on the core: R6 (mirrored) passes only with the override.
12. **Section 3, promotion, keys and results in the real API.** Promotion goes through `types.p.promote` (`zone`,
    `to`, not optional), which `pushMove` expands; `afterMove` and a custom `worldResult` are not needed. Move keys
    use `-` for captures and lower-case promotion letters (`Dd4-Ed5=q`), as `moveKey` builds them. Source:
    `src/variants/core/world.js` (`pushMove`, `moveKey`).
13. **Section 3, piece values.** The rationale misquoted the IRF. The misconceptions page says the unicorn is "worth
    roughly as much as a pawn", but theory Vol. I section IX gives U 3.0 (P 1.0, R 4.5, N 5.0, B 5.5, Q 15.0), and
    Raumcapa gives 290 centipawns. Both are now quoted. The spec's own numbers stay as a playtesting estimate. Source:
    https://www.raumschach.org/theory1.
14. **Section 5, rules card.** Black's captures go down, not up. Said explicitly, plus "never straight ahead or up".
    "The far rank of the top level" was wrong for Black; it is now "the far rank of the opponent's home level".
    Promotion is compulsory ("must become").
15. **Section 7, R5, queen on `Cc3`.** With the default kings (which R5 did not exclude) the queen has **51** moves,
    not 52. The bishop line `Cc3`-`Bd3`-`Ae3` ends on White's own king. The case now states 51 with the default kings
    and 52 with no kings, and says where White's king stands for the king test. Checked on the core.
16. **Section 7, R8, keys and complete lists.**
    - The keys now use the core format (`Dc5-Ec5=u`, `Dd4-Ed5=q`), and each case gives its full key list.
    - The `Dd4` case has 7 keys, including the plain forward move `Dd4-Dd5`, which the old text left out.
    - Black's `Ba2` pawn also has the plain move `Ba2-Ba1`, which the old text left out.
    - `promotion_required` and (RQ2) `budget_full` are not codes the core produces. An illegal code simply has no
      outcomes.
17. **Section 7, additions.**
    - R1: perft 3 = 253,705 (core and `raum.py` agree).
    - R2: `Bd2` → {`Bd3`, `Cd2`} and Black's unicorn `Dd5` → {`Aa2`, `Bb3`, `Cc4`, `Ce4`}, both from the Wikipedia
      diagram.
    - R5: bishop `Dc4` (the chessvariants.com example).
    - R6: marked as Maack's and the IRF's own example.
18. **Section 7, RQ5, roll memo.** The old text said that undo followed by `Dc5-Ec5=Q` replays the roll of
    `Dc5-Ec5=U`. The memo is keyed `<ply>:<code>`, so only the same code replays the roll; a different promotion
    letter rolls fresh. Source: `src/variantplay/composables/useVariantGame.js`.

Open points for the lead (no rule change made):

- **Undo re-roll through the promotion letter.** Because of change 18, a player can undo a missed `Dc5-Ec5=u` and try
  `Dc5-Ec5=q` for a new roll. This works in every variant with promotion. A memo key without the `=x` suffix would
  close it. That is a UI decision, outside this spec.
- **Mate and dead draws.** Without `king_trapped` and a bare-kings or repetition draw in the variants core, games
  with two bare kings last until the quiet rule (100 plies). If the core team adds these rules for the other
  variants, Raumschach needs nothing extra.

### 8.2 Engine review

Reviewer lens: engine and quantum consistency. Read against `handoff/IMPLEMENTING.md`, `handoff/CONTRACT.md`,
`handoff/CORE-CHANGES.md`, the core in `src/variants/core/` as it stands in the working tree on 2026-09-25 (the core
team has implemented CORE-CHANGES Q1-Q14 and, in the UI package, U4 and U7), `src/variantplay/` (`texts.js`,
`glyphs.js`, `VariantBoard.vue`, `useVariantGame.js`) and `docs/rules.md`. Scripts, all in
`handoff/tmp/critic-raumschach/`:

- `proto.mjs`: the section 3 declaration on the real core;
- `check.mjs`: R1-R10 and RQ1-RQ6; `check3.mjs`: R11, RQ2, RQ3 and RQ7-RQ13. All pass;
- `fuzz2.mjs`: 400 random games, half of them from sparse random positions, with splits, merges and measurements;
- `ai.mjs`, `ai2.mjs`: computer-player timings, with and without the `evaluate` terms;
- `layout.mjs`: the label boxes of section 6 in both views;
- `orient.mjs`: Black's pawn with the core's default `orient`;
- `mergekey.mjs`: the key examples of section 3.

A first run of this review was stopped before it wrote this section. Its edits are in the file but not in 8.1, and
this run re-checked each of them on the current core:

- section 6: one static layout (the grid) with a row gap of 1.0, board frames without `label`, and the level letters
  as `layout.labels`, so nothing overlaps in either view (`layout.mjs`). The old "two layouts" needed a UI change
  that CORE-CHANGES item 38 rejects;
- a bare-kings draw in the variant's own `worldResult` (2.6, section 3, rules card, R11). This is the draw of
  `docs/rules.md` section 6, in the form `hyper4d.md` uses, and CORE-CHANGES item 40 leaves it to each variant;
- section 4 items 6 and 10: the core issues C1 and C2 (below), found then and now implemented;
- the section 3 AI and fuzz numbers, and the prototype paths.

Checked and correct as written (no change):

- **Section 3 is implementable with the hooks as built.** Every field and helper exists (`types`, `promote`, `orient`,
  `worldResult`, `hasRoyal`, `attacks`, `royalSquares`, `worldFrom`, `directions`, `allDirections`, `symmetric`,
  `makeTopology`), and the prototype runs every case of section 7. The `orient` override is required: with the
  default, Black's pawn on `Bb2` gets `Bb2-Cb2` and `Bb2-Cb1` instead of `Bb2-Ab2` and `Bb2-Ab1=…` (`orient.mjs`).
  `promote` without `optional` gives exactly the 5 promotion keys and no plain key (R8, RQ5, RQ7). The world's `x`
  stays `{}`, so no `applyMiss` or `unifyWorlds` is needed.
- **Section 6 fits the layout API.** Cells, frames and labels are static topology data, and the 180° turn,
  `zoomable` (10.6 × 17 = 180.2 < 200, so the flag is needed) and the accessible names (`Cc3: Queen (50 %)`) are
  exactly what `VariantBoard.vue` does.
- **Section 4 items 1-5 and 9** agree with `docs/rules.md` sections 2-4 and 7 and with the core (`isMeasured`,
  `linkOrRoll`, `splitBranches`, `perWorldMerge`, the budget fallback).
- **The glyph** `{ text: 'U', shape: 'circle' }` gives a white token with dark ink for White and a dark token with
  white ink for Black (`glyphOf`).

Changes:

1. **Section 2.6 and 4.3, quiet counter.** CORE-CHANGES Q8 is now in the core: a Missed pawn move adds 1 and does
   not reset the count. The old text said that today's core resets it. RQ3 now pins it (40 gives 41 on Missed and 0
   on Moved).
2. **Section 3, code.** Removed the `reasonText` override: U7's generic `bareKings` text ("only the two kings are
   left") is now in `src/variantplay/texts.js`. `START` is now described. The hooks that are not needed are listed
   (`measured`, `budgetRule`, `applyMiss`, `unifyWorlds`).
3. **Section 3, `evaluate`.** The positional term is now part of the declaration: centralisation only. Without an
   `evaluate` hook, `aiSplits` (U4) ranks every quiet split target equally and picks at random, so the AI's splits had
   no purpose. The mobility term is dropped: it made the hard level about 4 times slower (1.5 s in a 4-world
   middlegame), and it would not fit the thinking time at 64 worlds (`ai2.mjs`).
4. **Section 3, numbers.** Timings re-measured on the current core; U4 is now in `ai.js`.
5. **Section 3, merge key example.** `Ca2|Cc2-Dd3` is illegal: `Ca2`-`Dd3` is not a unicorn line. It is now
   `Ca2|Cc2-Db3`, one of the four merges the core offers after `Bb1-Ca2|Cc2` (`mergekey.mjs`).
6. **Section 4.6, king danger (C2 = CORE-CHANGES Q7).** The ring now counts converging captures, as `docs/rules.md`
   section 5 says. RQ9 changes from 50% to **100%**, and a blocked-lane case (50%) is added.
7. **Section 4.10, own part (C1 = CORE-CHANGES Q14).** A part moving onto another part of the same piece now joins it
   with no roll, as `docs/rules.md` 2.1 says. New test RQ11 covers it, including a path blocked in one world.
8. **Section 4.7 and 4.8, safety-net rolls.** The argument that neither the solid roll nor the game-end roll can fire
   is now exact:
   - an unmeasured move or merge captures nothing;
   - a measured one is split into outcomes by its per-world result;
   - so piece counts and `worldResult` agree in every world of an outcome.

   The evidence is now `fuzz2.mjs`: 400 games, 66,384 plies, up to 64 worlds and 5 bare-kings draws, with these
   invariants checked after every ply. Neither roll fired. RQ13 shows bare kings reached through an ordinary roll.
9. **Section 4.1 and 4.9.** Added the own-part exception to "land = roll", and the budget-full fallback as a test
   (RQ12).
10. **Section 5, rules card.**
    - The intro said the shared rules cover "capture the king". `sharedRules()` in `texts.js` says nothing about how
      a game is won. That matters here: the IRF, the source of the classical rules, says check, checkmate and
      stalemate work as in chess.
    - Entries 4 and 5 (both about pawn directions) are now one entry, and the new entry 7 reads "There is no check or
      checkmate: you win by capturing the enemy king, and you may move into danger." The card still has 8 entries.
11. **Section 7, header.** It now says what "50% on X and 50% on Y" means (two linked worlds unless "independent"),
    who moves, and how outcomes are written, so every quantum position is exact.
12. **RQ2.** "Any Black reply" is now the exact replies (`Ea4-Ea3`, `Eb4-Eb3`, `Ec4-Ec3`). After the fourth split
    attempt, `splitsFrom` offers the queen nothing, and the state has 8 worlds.
13. **RQ3.** Added the quiet counter and a probe of one's own ghost (the pawn settles its own unicorn, and the budget
    drops from 2 to 1).
14. **RQ5.** The undo bullet now follows `docs/rules.md` section 8 ("even if you pick a different piece to promote
    to"). Undo followed by any promotion letter must replay the same roll. Today's UI does not (its memo key is
    `<ply>:<code>`), so this is a UI bug to fix, not a UI choice as the open point in 8.1 put it. See "UI change"
    below. Also added: the plain key is illegal.
15. **RQ6.** Added the state after Missed.
16. **New tests** for the riskiest rules, each run on the core:
    - R11: the bare-kings draw, classical;
    - RQ7: a Black promotion by a forward-and-down capture onto a ghost, which pins the `orient` override;
    - RQ8: a split along one unicorn line with one lane blocked in one world;
    - RQ9: the danger ring and a converging capture across levels;
    - RQ10: a knight leaping past a ghost;
    - RQ11: an own-part join;
    - RQ12: the budget-full fallback of a vertical slide;
    - RQ13: bare kings through a roll.
17. **8.1's open point "Mate and dead draws"** is partly outdated. The variant now has its own bare-kings draw
    (2.6, R11, RQ13), so a bare-kings game ends at once. Mate ("king cannot escape") and repetition stay absent
    (CORE-CHANGES items 72 and 60).

Core changes needed: none. For the record, C1 and C2, which CORE-CHANGES cites from this section, are both in the
core of the working tree:

- **C1 (= CORE-CHANGES Q14).** In `isMeasured`, a target occupant that is the moving piece itself does not count as
  "another piece". "Itself" means the same id and the same type as the mover, in every world that generates the key.
  Worlds where the path is blocked keep the part where it was (pass = link); the budget fallback still applies.
  Verified by RQ11.
- **C2 (= CORE-CHANGES Q7, converging captures).** `royalDanger` also counts every merge of an enemy's superposed
  piece whose target may hold a royal piece of the side. Its weight is the weight of the worlds in which the merge
  (from either part, with the per-world rules of `mergeBranches`) captures that royal piece. The result is the
  largest such weight or single-move weight. Verified by RQ9.

UI change needed (package ai-ui; generic, does not block this variant):

- **Roll memo without the promotion letter.**
  - What: in `play(code)` of `src/variantplay/composables/useVariantGame.js`, use
    `memoKey = state.value.ply + ':' + code.split('=')[0]`. Square names and type ids cannot contain `=`, so the
    suffix is exactly the promotion choice.
  - Why: `docs/rules.md` section 8.
  - Why the same number gives the same outcome: in Raumschach, `Dc5-Ec5=q` … `=u` have outcome lists with the same
    keys and weights (no promotion type is solid or ends the game).
  - Test: RQ5, undo bullet.
  - A related gap, noted only: the memo survives an undo followed by a different move. The same code at the same
    later ply then reuses its old random number, although `docs/rules.md` section 8 says that "later rolls are new
    ones" once the game has changed.

Open for the lead:

- Whether "There is no check or checkmate: you win by capturing the enemy king" belongs in `sharedRules()` for every
  variant. Several cards already say it in their own words (crazyhouse, darkchess, kriegspiel, horde, koth; chess960
  and capablanca for castling), and others (hyper4d, trid, hexagonal) do not. If it moves there, entry 7 of section 5
  can go.
