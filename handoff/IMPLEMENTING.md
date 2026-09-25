# Implementing a quantum chess variant (the API as built)

Repo: /home/user/Quantum_Chess. Read these files before writing code (they are the source of truth; this guide
summarises them):

- `src/variants/core/topology.js`: `makeTopology`, `rectTopology(files, ranks, opts)`, `symmetric(vec, dims)`,
  `directions(dims, k)`, `allDirections(dims)`.
- `src/variants/core/world.js`: the classical world (`sq`, `ty`, `sd`, `board`, `x`), movement descriptors,
  `generate`, `applyClassical`, `pushMove`, `moveKey`, `dropKey`, `attacks`, `givesCheck`, `royalSquares`,
  `handOf`, `addPiece`, `emptyWorld`, `worldFrom`, `placePiece`, `cloneWorld`, `OFF`, `HAND`.
- `src/variants/core/orthodox.js`: orthodox piece types, `standardBoard`, `standardSetup`, `castlingRights`,
  `castlingMoves`, `pawnExtras` (double steps + en passant), `orthodoxAfterMove`, direction constants.
- `src/variants/core/orthodoxVariant.js`: `orthodoxSpec()` (8×8 orthodox chess declaration) and `whiteBlack()`.
- `src/variants/core/variant.js`: `defineVariant(spec)` completes the declaration IN PLACE (so hooks may refer to the
  declaration object) and adds `orient`, `enemies`, `sideCount`, `solidTypes`, `royalTypes`, caches.
- `src/variants/core/quantum.js`: the quantum layer (read the header comment). Do NOT change it without a very good
  reason; if you believe the core needs a change, describe it in your final report instead of editing core files.
- `src/variants/core/ai.js`: the computer player (uses optional hooks `evaluate`, `materialSign`, `aiView`).
- `tests/js/variants/core.spec.js` + `tests/js/variants/helpers.js` (`stateOf`, `play`): how to write tests.
- `src/variants/catalog.js`: names/summaries (already written for every variant; do not edit).
- `src/variantplay/glyphs.js`: how glyphs are drawn; `src/variantplay/components/VariantBoard.vue`: how layouts are
  drawn.

## Module shape

File `src/variants/<id>.js`, default export `defineVariant({...})`. SPDX header like every other file:

```js
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * <What this variant is, 2-6 lines. Player-facing rules are in docs/variants.md.>
 */

import { t } from '@nextcloud/l10n'
import { defineVariant } from './core/variant.js'
...

const spec = { ... }
export default defineVariant(spec)
```

Required fields: `id` (catalog id), `category` (as in catalog.js), `sides`, `topology`, `types`, `setup(options, rng)`
(returns the classical start world; `rng()` in [0,1) for random setups), `rules()` (returns an array of 3–8 short
translated sentences: what is special in this variant, the shared quantum rules are shown separately).

Optional fields and hooks (all called with the variant object already completed):

| Field / hook | Meaning |
|---|---|
| `sides: [{ id, name: () => t(...), color, rotate? }]` | play order. `color`: 'white', 'black', 'red', 'blue', 'yellow', 'green' or '#rrggbb'. `rotate`: board rotation in degrees when this side views (default 0 for side 0, 180 otherwise; four-player uses 0/90/180/270) |
| `orient(side, vec)` | turns "oriented" vectors (written for side 0) for a side. Default: side 0 unchanged, other sides negate coordinate 1 |
| `enemies(a, b)` | default `a !== b` (teams: override) |
| `types: { [typeId]: { name: () => t(...), moves, royal, solid, splittable, value, promote, glyph } }` | see below |
| `options: [{ id, type: 'number'\|'choice'\|'boolean', label: () => t(...), min, max, random, default, values: [{ id, label }] }]` | new-game options; values arrive in `setup(options)` |
| `extraMoves(w, side)` | special moves (castling, double steps, en passant, drops, ...) as ClassicalMove objects |
| `filterMoves(w, side, list)` | e.g. compulsory captures (antichess) |
| `afterMove(next, m, prev)` | mutate the NEW world after a classical move (promotion is already done by the core; ep/castling bookkeeping, explosions, check counters...) |
| `onCapture(next, victimId, m)` | where a captured piece goes (default off the board; drop variants: to the capturer's hand with `placePiece(next, id, HAND)` and `next.sd[id] = capturerSide`, demote type) |
| `apply(w, m)` / `generate(w, side)` | replace the classical apply / generation completely (only for exotic worlds such as the multiverse) |
| `worldResult(w, mover)` | per-world result `{ winner: side, reason }`, `{ winner: null, winners: [..], reason }` or `{ winner: null, reason }` (draw), or null. Default: a side without royal pieces has lost (2 sides) |
| `stateResult(state)` | result from the whole state after a move (rarely needed) |
| `noMoves(state)` | result when the side to move has no legal move (default draw 'noMoves'; xiangqi: loss; antichess: win) |
| `reasonText(reason)` | translated text for your own reason codes (return null for unknown) |
| `isOut(w, side)` / `nextSide(w, side)` | multi-player turn order (four-player: eliminated players) |
| `measured(sampleMove)` | force a classical move into the measured class |
| `drops: true` | show the hands in the UI |
| `hidden: true`, `visibility(state, side) -> Set<sq>` | hidden information: squares the side can see |
| `candidateMoves(state)` | the moves a player may TRY in the UI (Kriegspiel: moves as if the enemy pieces were unknown). Each `{ code, type: 'move', from, to, promo, drop }` |
| `aiView(state, side)` | the state as the computer sees it (hidden information) |
| `evaluate(w, side)` | extra evaluation terms in centipawns for the computer (KOTH: king near the hill...) |
| `materialSign: -1` | the computer prefers LESS material (antichess) |
| `layoutOf(state)` | dynamic layout (multiverse): returns `{ size, names, cells, layout }` (size and names as `V.topology`) |
| `maxPly`, `quietPlies` | limits (defaults 600 and 100) |

## Piece types

```js
types: {
  k: { name: () => t('quantumchess', 'King'), moves: [{ leap: KING_STEPS }], royal: true, value: 400, glyph: { sprite: 'k' } },
  u: { name: () => t('quantumchess', 'Unicorn'), moves: [{ ride: directions(3, 3) }], value: 250,
       glyph: { text: 'U', shape: 'circle' } },
  p: { moves: [{ leap: [[0, 1, 0]], oriented: true, mode: 'move' }, ...], solid: true, value: 100,
       promote: { zone: (side, to, from, w) => bool, to: ['q', 'r'], optional: false, forced: (side, to, w) => bool },
       glyph: { sprite: 'p' } },
}
```

Descriptors: `{ leap: vectors }`, `{ ride: vectors, range? }`, `{ hop: vectors }` (cannon capture over exactly one
screen), options `mode: 'both'|'move'|'capture'`, `oriented: true`, `region(side, to, from) -> bool`,
`when(side, from) -> bool`, `via: (vec) => [legVectors]` (lame leapers; the leg squares must be empty).
`royal` pieces are captured to win (default rule) and are solid. `solid` pieces never become ghosts (kings, pawns,
and whatever the research spec decides). `splittable` defaults to `!solid`. `value` in centipawns for the AI.
Glyphs: `{ sprite: 'k'|'q'|'r'|'b'|'n'|'p' }` uses the cburnett set; otherwise `{ text: 'A' | (side) => '帥',
shape: 'circle'|'shogi'|'xiangqi', promoted?: true }`. Type ids are short strings without spaces, `-`, `|`, `?`, `@`,
`=`; e.g. shogi can use `+p` for a tokin.

## Moves and keys

A ClassicalMove: `{ key, from, to, id, capture, promo, drop, kind, extra? }`. Keys must be identical across worlds
for "the same move": use `moveKey(V, from, to, promo)` (`e2-e4`, `e7-e8=q`), `dropKey(V, type, to)` (`n@f3`), and
fixed words for special moves (`O-O`). For drops: `from: -1`, `drop: type`, `id` = the hand piece used in that world
(lowest id of that type). `capture` = the captured piece id in this world or -1. Use `pushMove(V, w, out, id, from,
to, capture, kind)` to get promotion expansion for free.

Square names come from the topology and must not contain `-`, `|`, `?`, `@`, `=` or spaces (use `:` or `.` to join
board and square, e.g. `B2:c3`).

## Quantum layer: what you get for free

Everything quantum is generic: split/merge/measure, land = roll / pass = link, budget, the **solid roll** (solid
pieces are re-settled by a roll if a move would leave them in different places in different worlds) and the
**game-end roll** (if `worldResult` differs between worlds after a move, a roll decides). Per-world counters (checks
given, explosions, ...) belong in `w.x` and are then automatically quantum. Keep `w.x` small and JSON-only.

## UI layout

`rectTopology` gives a drawn 2D board. For other boards, build cells with `makeTopology({ coords, name, cell, layout })`:
`cell(c) -> { x, y, w, h, shape: 'rect'|'hex'|'point', shade }` (rect: x,y = top-left; hex/point: x,y = centre),
`layout: { width, height, labels: [{ x, y, text }], lines: [{ x1, y1, x2, y2 }], boards: [{ x, y, w, h, label }],
areas: [{ x, y, w, h, shade: 'wood'|'river'|'frame' }] }`. Shades available in CSS: light, dark, mid, hill, hilldark,
camp, wood. Side 0 must be at the bottom of the layout (y grows downwards). Several boards: place them side by side
or in a grid with a gap of ~0.8 units and a `boards` entry with a short label for each.

## Style and checks (CI enforces all of these)

- Tabs, no semicolons, single quotes, trailing commas, JSDoc on every function (`@param {type} name description`,
  `@return {type}`), comments in plain English, no section signs, no TODO without an issue number.
- Max line length 120 (tabs count as 4). Translatable strings stay whole on one line (a longer line is allowed only
  for a string literal that cannot fit): put `t('quantumchess', '...')` on its own line if needed.
- Every user-visible text through `t('quantumchess', 'literal')` (literal strings only, placeholders `{name}`).
- Run: `npx eslint --fix src/variants/<id>.js tests/js/variants/<id>.spec.js`, then `npx eslint ...` (0 problems),
  `node tools/check-line-length.mjs` (0 findings in your files), `npx vitest run tests/js/variants/<id>.spec.js`
  and `npx vitest run tests/js/variants/fuzz.spec.js -t <id>` (random games must never throw or break an invariant).
- Performance: `generate` runs in every world on every move; keep it allocation-light. A random game of 60 plies must
  run in a few seconds in the fuzz test.
