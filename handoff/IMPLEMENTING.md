# Implementing a quantum chess variant (the API as built)

Repo: /home/tom/Projects/Quantum_Chess/Quantum_Chess. Read these files before writing code (they are the source of
truth; this guide summarises them):

- `handoff/research/<id>.md`: the spec of your variant (its section 3 lists the hooks). Section "Which new hooks each
  variant uses" below is the checklist of the core additions per variant.
- `src/variants/core/topology.js`: `makeTopology`, `rectTopology(files, ranks, opts)`, `symmetric(vec, dims)`,
  `directions(dims, k)`, `allDirections(dims)`.
- `src/variants/core/world.js`: the classical world (`sq`, `ty`, `sd`, `board`, `x`), movement descriptors,
  `generate`, `applyClassical` (castling lifts king and rook, then puts the king on `extra.kingTo ?? to` and the rook
  on `extra.rook.to`, so every Chess960 shape works), `pushMove`, `moveKey`, `dropKey`,
  `attacks(V, w, side, target, { royal })` (`royal: false` leaves out royal attackers),
  `givesCheck(V, w, side, victim, opts)`, `royalSquares`, `handOf`, `addPiece`, `emptyWorld`, `worldFrom`,
  `placePiece`, `cloneWorld`, `OFF`, `HAND`.
- `src/variants/core/orthodox.js`: orthodox piece types, `standardBoard(files, ranks, opts)`,
  `standardSetup(V, back, { pawnRank, castling })`, `castlingRights(V, w, { kingToLong, kingToShort })` (any width:
  the king goes to the c file and to the second file from the right; the rook must share every coordinate except the
  file with the king, so it works on `[file, rank, board]`), `between(topo, a, b)` (the squares strictly between two
  squares on one line, any number of coordinates), `castlingMoves(V, w, side, { toRook })` (castling along a rank or a
  file), `pawnExtras(V, w, side, canDouble, { pawn, forward, captures })` (double steps and en passant; the vectors
  are written for side 0 and turned with `V.orient`), `orthodoxAfterMove` (the en passant square is the midpoint of the
  double step in every coordinate), `clearEnPassant(b)`, `unifyCastling(bs)`, direction constants.
- `src/variants/core/orthodoxVariant.js`: `orthodoxSpec({ back, royalKing, promoteTo, boardOpts })` (8 × 8 orthodox
  chess; `boardOpts` goes to `standardBoard` and `rectTopology`: `shade`, `layout`, ...) and `whiteBlack()`.
- `src/variants/core/variant.js`: `defineVariant(spec)` completes the declaration IN PLACE (so hooks may refer to the
  declaration object) and adds `orient`, `enemies`, `sideCount`, `solidTypes`, `royalTypes`, `quietTypes`, caches. Its
  header states the exact contract of every optional hook the quantum layer reads.
- `src/variants/core/quantum.js`: the quantum layer (read the header comment). Do NOT change it without a very good
  reason; if you believe the core needs a change, describe it in your final report instead of editing core files.
  Variant modules import `isCertain(m)`, `budgetInfo(V, state, side)` and `mustCapture(V, state)` from it
  (`src/variants/index.js` exports the last two for the UI).
- `src/variants/core/ai.js`: the computer player (optional hooks `evaluate`, `materialSign`, `aiView`, `replySide`;
  exports `mightForce` and `aiSplits` for tests).
- `tests/js/variants/core.spec.js`, `core-quantum.spec.js`, `core-world.spec.js` + `tests/js/variants/helpers.js`
  (`stateOf`, `play`): how to write tests.
- `src/variants/catalog.js`: names/summaries (already written for every variant; do not edit).
- `src/variantplay/glyphs.js`: how glyphs are drawn; `src/variantplay/components/VariantBoard.vue`: how layouts are
  drawn; `src/variantplay/texts.js` and `panel.js`: where the UI hooks are read.

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

A variant built on `orthodoxSpec()` extends it IN PLACE and never spreads it into a new object:

```js
const spec = orthodoxSpec({ boardOpts: { shade } })
Object.assign(spec, { id: 'koth', category: 'rules', rules: () => [...], worldResult(w, mover) { ... } })
export default defineVariant(spec)
```

Its `extraMoves` and `afterMove` refer to that very object, which only `defineVariant` completes (`orient`,
`enemies`); a spread copy leaves them with an incomplete variant. Keep the inherited `applyMiss` and `unifyWorlds`
unless your spec replaces them; on worlds without `x.ep` or `x.castle` they return their input unchanged.

## Hooks

All optional, all called with the variant object already completed. A hook's default keeps plain behaviour.

### Rules in one world

| Field / hook | Meaning |
|---|---|
| `sides: [{ id, name: () => t(...), color, rotate? }]` | play order. `color`: 'white', 'black', 'red', 'blue', 'yellow', 'green' or '#rrggbb'. `rotate`: board rotation in degrees when this side views (default 0 for side 0, 180 otherwise; four-player uses 0/90/180/270) |
| `orient(side, vec)` | turns "oriented" vectors (written for side 0) for a side. Default: side 0 unchanged, other sides negate coordinate 1 |
| `enemies(a, b)` | default `a !== b` (teams: override) |
| `types: { [typeId]: { name: () => t(...), moves, royal, solid, splittable, value, promote, glyph, resetsQuiet } }` | see "Piece types" |
| `options: [{ id, type: 'number'\|'choice'\|'boolean', label: () => t(...), min, max, random, default, values: [{ id, label }], describe? }]` | new-game options; values arrive in `setup(options)`. `describe(value) -> string \| null`: how a value is shown under the option field of the new-game dialog (number options only while the value is valid) and in the game-info line "{label}: {value}" (Chess960: "RNBQKBNR (518)") |
| `extraMoves(w, side)` | special moves (castling, double steps, en passant, drops, ...) as ClassicalMove objects. Castling must have `kind: 'castle'` and en passant `kind: 'ep'`: they are certain moves (see "Certain moves") |
| `filterMoves(w, side, list)` | per-world filter, e.g. compulsory captures (antichess, together with `compulsoryCapture`) |
| `afterMove(next, m, prev)` | mutate the NEW world after a classical move (promotion is already done by the core; ep/castling bookkeeping, explosions, check counters...). Runs only in worlds where the move was applied |
| `onCapture(next, victimId, m)` | where a captured piece goes (default off the board; drop variants: to the capturer's hand with `placePiece(next, id, HAND)` and `next.sd[id] = capturerSide`, demote type) |
| `apply(w, m)` / `generate(w, side)` | replace the classical apply / generation completely (exotic worlds: the multiverse, trid's projected moves) |
| `measured(sampleMove)` | force a classical move into the measured class (the multiverse's playable design: `() => true`) |
| `drops: true` | show the hands in the UI |
| `worldResult(w, mover)` | per-world result `{ winner: side, reason }`, `{ winner: null, winners: [..], reason }` or `{ winner: null, reason }` (draw), or null; `mover` is the side that just moved. Default: a side without royal pieces has lost (2 sides) |
| `stateResult(state)` | result from the whole state after a move (rarely needed) |
| `noMoves(state)` | result when the side to move has no legal move (default draw 'noMoves'; xiangqi: loss; antichess: win) |
| `reasonText(reason)` | translated text for your own reason codes (return null for unknown). Generic texts exist for `king`, `resign`, `quiet` (it says "50 moves": give your own if `quietPlies` is not 100), `moveLimit`, `noMoves`, `bareKings` ("only the two kings are left") |
| `isOut(w, side)` / `nextSide(w, side)` | multi-player turn order (four-player: eliminated players) |
| `maxPly`, `quietPlies` | limits (defaults 600 and 100) |

### Quantum layer

| Field / hook | Meaning |
|---|---|
| `applyMiss(b, action, side, info) -> world` | per-ply bookkeeping in the worlds where the played action did not take effect (see "Idle worlds"). Default: those worlds stay unchanged. `orthodoxSpec()` brings `clearEnPassant` |
| `unifyWorlds(bs, mover) -> bs` | state-level facts made identical in every world of the chosen outcome (see "State-level facts"). Default none. `orthodoxSpec()` brings `unifyCastling` |
| `solidExtra(b) -> string` | the variant's own structure that must be the same in every world (three-check: the check counters; crazyhouse and shogi: the hands, as a guard; multiverse: the timelines). Worlds that differ in it are settled by the solid roll like solid pieces; the roll's note is `'solid:' + solidExtra(b)` |
| `budgetRule(b, side) -> { sides?, limit? }` | the sides whose pieces share one quantum budget (default `[side]`; with several sides one arrangement counts all their pieces together) and its limit (default 8). Read on `state.worlds[0].b`, for the mover's split legality and the pass = link fallback. Must be cheap (read `b.x` or count kings, no generation) and must never lower a limit during a game. `budgetInfo(V, state, side)` returns `{ used, limit, sides }` (the pips, your tests). Bughouse: `{ sides: [side, (side + 2) % 4], limit: 8 }`; four-player FFA: `{ limit }` by the number of kings left |
| `compulsoryCapture: true` | when some legal move key might capture (captures in at least one world), only such keys are legal, no split and no Measure, and only merges with a capturing outcome. `mustCapture(V, state)` tells; the UI says so and disables Split and Measure. A per-world rule, if any, stays in `filterMoves`. Default false |
| `passWhenStuck: true \| (state) => boolean` | a side without a legal move sits out instead of the `noMoves` result: the next side that can move is to move, `ply` does not grow for the skipped sides, every world passes through `applyMiss` with `type: 'pass'` once per skipped side, the record gets `skipped: [sides]` and the move list shows "{side} cannot move and sits out". The function is called on the new state (the stuck side to move). If no side can move, `noMoves` applies as before. Not evaluated in the computer's search. Default false |
| `recordInfo(prev, code, branch, next) -> object \| null` | JSON data stored as `info` on the history record (null stores nothing). Called once per played move at the end of `stateAfter`, after the result, `stateResult`, `noMoves` and any sit-out: `next.turn` is the side really to move and the record (`next.history.at(-1)`) already has `skipped`. `branch.worlds` are the worlds of the outcome before `unifyWorlds`. Never called in the computer's search; undo replays call it again, so keep it pure. Show it with `infoText` |

### Computer player

| Field / hook | Meaning |
|---|---|
| `evaluate(w, side)` | extra evaluation terms in centipawns (KOTH: king near the hill...). It also ranks the computer's split targets (only the best 6 targets per piece are paired, ties at random) |
| `materialSign: -1` | the computer prefers LESS material (antichess) |
| `aiView(state, side)` | the state as the computer sees it (hidden information) |
| `replySide(state, me) -> side \| null` | whose answer the normal and hard levels look at after the computer's move (`state` = after that move). Default `state.turn`. `null`: no answer; another side: its answers are searched on `{ ...state, turn: side }` (bughouse: `(s, me) => 3 - me`, the opponent on the same board); `me` (a turn of several moves): the computer's best continuation |

The normal level looks only at answers that might capture or end the game (some outcome with a capture, or with a
non-null `worldResult`), and the computer tries such moves first; a variant with its own goal (a hill, three checks)
needs no extra code for that.

### Hidden information

| Field / hook | Meaning |
|---|---|
| `hidden: true`, `visibility(state, side) -> Set<sq>` | squares the side can see. While the game runs: no undo, no danger line, the other sides' budgets show "?", a two-step hand-over in pass & play |
| `candidateMoves(state)` | the moves a player may TRY in the UI (Kriegspiel: moves as if the enemy pieces were unknown). Each `{ code, type: 'move', from, to, promo, drop }` |
| `ownView(state, side) -> state` | the state as the side knows it; the Split, Merge and Measure modes choose their squares on it, every attempt is decided on the real state (a split, merge or Measure legal on the own view but not on the real state gets the umpire's "No") |
| `hiddenStyle: 'fog' \| 'plain'` | how squares the viewer cannot see look (default `'fog'`; Kriegspiel: `'plain'`, a normal-looking board) |
| `umpire: true` | an attempt is binding (no odds preview, no odds in the results), a refused attempt gets "the umpire says no" |

### Board and texts (UI)

| Field / hook | Meaning |
|---|---|
| `layoutOf(state)` | dynamic layout (multiverse, blast marks): returns `{ size, names, cells, layout }` (size and names as `V.topology`) |
| `actions(state) -> [{ code, label }]` | extra buttons for the side to move (multiverse: "Submit turn"); a button is enabled while `code` is legal |
| `sideInfo(state, side, viewer) -> { text, title? } \| null` | a short text in a player row between the name and the budget pips, `title` as tooltip (three-check "Checks: 2/3"; antichess, horde: piece counters; makruk: the count) |
| `noteText(note) -> string \| null` | the label of a follow-up roll note (`solid:…` or `end:…`), asked before the generic text. Match the END of the note (`/checks:(\d+):(\d+)$/`): games saved before the short notes hold the whole solid key |
| `infoText(record, viewer) -> string[] \| null` | the variant's own lines under a move in the move list and in the last-move box, usually from `record.info` (Kriegspiel's announcements, "Blue is out", "White gave check 2 of 3") |
| `codeText(code) -> string \| null` | how a move code is written in the move list. Default: the code, with a one-letter drop type upper-cased (`p@e4` → `P@e4`) |
| `resignResult(state, loser)` | the result of a resignation (default: a win for every enemy of the loser) |
| `handOrder: [typeId, ...]` | the order of the pieces in hand (types missing from it come last, by id) |

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
`resetsQuiet` (default: solid and not royal, so pawns): a move of this type that happens resets the quiet counter
(antichess: `resetsQuiet: false` on its non-royal king; xiangqi: `resetsQuiet: false` on the soldier, so only captures
reset it).
Glyphs: `{ sprite: 'k'|'q'|'r'|'b'|'n'|'p', promoted?: true }` uses the cburnett set (`promoted: true` adds a small red
"+" marker: crazyhouse `+q`); otherwise `{ text: 'A' | (side) => '帥', shape: 'circle'|'shogi'|'xiangqi',
promoted?: true }`. Type ids are short strings without spaces, `-`, `|`, `?`, `@`, `=`; e.g. shogi can use `+p` for a
tokin.

## Moves and keys

A ClassicalMove: `{ key, from, to, id, capture, promo, drop, kind, extra?, certain? }`. Keys must be identical across
worlds for "the same move": use `moveKey(V, from, to, promo)` (`e2-e4`, `e7-e8=q`), `dropKey(V, type, to)` (`n@f3`),
and fixed words for special moves (`O-O`). For drops: `from: -1`, `drop: type`, `id` = the hand piece used in that
world (lowest id of that type). `capture` = the captured piece id in this world or -1. Use `pushMove(V, w, out, id,
from, to, capture, kind)` to get promotion expansion for free. Castling: `extra.rook = { id, to }`, `extra.kingTo` (the
king's destination) and `to` = the square the player clicks (the king's destination, or with
`castlingMoves(..., { toRook: true })` the rook's square, Chess960).

Square names come from the topology and must not contain `-`, `|`, `?`, `@`, `=` or spaces (use `:` or `.` to join
board and square, e.g. `B2:c3`).

## Certain moves: castling and en passant

docs/rules.md (sections 4 and 5): castling and en passant never roll and are offered only when they are really
possible. The core does this for every variant:

- A move is certain when `isCertain(m)`: `m.certain ?? (m.kind === 'castle' || m.kind === 'ep')`. `castlingMoves`
  and `pawnExtras` emit these kinds; write your own castling and en passant with them too. `certain: true` opts
  another kind in, `certain: false` opts a move out (it then rolls or links like any move).
- A key that some world generates as a certain move is legal only when EVERY world generates that key AND generates
  it as a certain move. Then every world gives the same result: no landing roll, no link, no budget change (the solid
  roll and the game-end roll still follow, as after any move). A key that is castling in one world and an ordinary
  king step in another is illegal, so a castling key may be a word (`O-O`) or the king's move (trid, multiverse).
- Castling therefore needs king and rook on their squares and every square they cross or land on empty in every
  world: a possible ghost on one of them makes castling illegal (Kriegspiel's umpire says "No"), not a roll.
- Castling rights follow the whole state: a right survives only while every world has it (`unifyWorlds`), so it is
  lost as soon as the king or that rook is not 100 % on its start square (moved, split, captured, a slide that only
  partly happened); merging back does not restore it.
- En passant only on the ply right after the double step: `orthodoxAfterMove` sets `x.ep` / `x.epVictim` where the
  double step was applied and clears them after every other applied move; `applyMiss` clears them in the worlds
  where the next ply did nothing (a miss, a link, an idle split child, a Measure, a skipped turn). So `x.ep` is the
  same in every world.
- A certain move is never the path of a split or a merge (a `castle` move never is, even with `certain: false`).

## Idle worlds: `applyMiss`

An idle world is a world in which the played action did not take effect. The core passes each idle world through
`applyMiss(b, action, side, info)` before the solid roll, the game-end roll, `unifyWorlds` and `stateAfter` see it.

| Played | Idle worlds | `info.hit` |
|---|---|---|
| move or merge with one unrolled outcome (pass = link) | the worlds where it missed | `true` |
| move or merge that rolls (measured, a merge onto a possible enemy, a link over the budget) | the worlds of the Missed outcome | `false` |
| split | worlds without the piece on `f`, and each child whose quiet move is not possible in its world | `true` |
| Measure | every world | `false` |
| a turn skipped by `passWhenStuck` | every world, once per skipped side | `false` |

A move or merge with the same result in every world (every certain move) has no idle world.

- `action`: `{ type: 'move', code, key, sample }` (`sample`: the move as generated in the first world that has the
  key), `{ type: 'split', code, id, from: [f], to: [t1, t2] }`, `{ type: 'merge', code, id, from: [f1, f2], to: [t] }`,
  `{ type: 'measure', code, id, from: [s], to: [] }` (the measured piece may stand elsewhere in each world: read
  `b.sq[action.id]`) or `{ type: 'pass', code: null, from: [], to: [] }`.
- `side`: the side whose turn it was (`state.turn`; for a pass, the skipped side).
- `info.hit` is decided before the settling rolls: a final outcome that the solid or game-end roll labels Missed may
  hold worlds built with `hit: true`.
- Pure: never mutate `b` or `b.x` (worlds are shared with earlier states and cached); return `b` itself when nothing
  changes, else a shallow copy `{ ...b, x: { ...b.x, ... } }`. Keep the key order of `x`: identical worlds are merged
  by comparing `JSON.stringify(x)`.
- Change only per-ply bookkeeping (the en passant square); pieces stay where they are (the multiverse may add boards).
- It may run twice on one world (a link over the budget is built with `hit: true`, thrown away, then rolled with
  `hit: false`) and it runs in the computer's search: keep it cheap and never count calls.
- `orthodoxSpec()` brings `applyMiss(b) { return clearEnPassant(b) }` (it ignores the other arguments). A variant
  that replaces it must still end its en passant right. `clearEnPassant` handles one square in `x.ep` / `x.epVictim`;
  another shape needs its own hook, for example bughouse (one square per board, only the board of `side`):

```js
applyMiss(b, action, side) {
	const bd = boardOf(side)
	if (b.x.ep[bd] === -1 && b.x.epVictim[bd] === -1) {
		return b
	}
	const ep = b.x.ep.slice()
	const epVictim = b.x.epVictim.slice()
	ep[bd] = -1
	epVictim[bd] = -1
	return { ...b, x: { ...b.x, ep, epVictim } }
},
```

## State-level facts: `unifyWorlds`

`unifyWorlds(bs, mover)` runs first in `stateAfter` (also in the computer's search) on the worlds of the chosen
outcome, before identical worlds are merged; `mover` is the side that just moved. Return an array of the same length
and order, unchanged worlds by reference, never mutate, and change only data that neither the solid key (solid pieces
on the board and in hand, `solidExtra`) nor `worldResult` reads: it runs after the rolls. `orthodoxSpec()` brings
`unifyWorlds(bs) { return unifyCastling(bs) }`: an `x.castle` right `{ flag, side, king, rook, kingTo, rookTo }` (all
six fields compared) is kept only if every world has it. Rights in another shape need their own hook.

## Quantum layer: what you get for free

Everything quantum is generic: split/merge/measure, land = roll / pass = link, budget, the **solid roll** (solid
pieces are re-settled by a roll if a move would leave them in different places in different worlds) and the
**game-end roll** (if `worldResult` differs between worlds after a move, a roll decides). Per-world counters (checks
given, explosions, ...) belong in `w.x` and are then automatically quantum. Keep `w.x` small and JSON-only. Also
built in, with no hook:

- After a settling roll each part is labelled by its own worlds (`capture`, `move` or `miss`; a part of a split in
  which nothing happened is `miss`). Notes: `'solid:' + (solidExtra ? solidExtra(b) : '')` and
  `'end:' + JSON.stringify(result)`.
- The quiet counter resets only when a move really happened: a capture, a drop, or a move of a `resetsQuiet` type in a
  world that played it. Missed attempts, failed captures and measurements add 1.
- The danger ring (`royalDanger`) counts captures of a royal piece, captures after which the side has no royal piece
  left (explosions), and converging captures (a merge whose parts can take the king).
- A part that moves onto another part of the same piece (same id and type) joins it without a landing roll.
- Parts with different types (a promotion in some worlds only) cannot merge; Measure is still offered.
- History records carry `from` / `to` squares (last-move marks for any code), `skipped` and `info`.
- `squareView` / `boardView` treat squares beyond the board (layout display cells) as empty.
- Drop outcomes read "Dropped" and "Missed: the square was taken".

## Which new hooks each variant uses

From `handoff/CORE-CHANGES.md` (sections 2 and 5) and the specs. "Inherited" = keep `orthodoxSpec()`'s `applyMiss`
and `unifyWorlds`; every variant gets the section above for free.

| Id | Built on | New hooks and helpers to use |
|---|---|---|
| `raumschach` | own spec | none (`x` stays `{}`, no castling, no en passant) |
| `trid` | own spec, own `generate` | castling `kind: 'castle'`, en passant `kind: 'ep'`; `applyMiss: (b) => clearEnPassant(b)`; `unifyWorlds: (bs) => unifyCastling(bs)` with rights in the `x.castle` shape (else its own `unifyWorlds`) |
| `hyper4d` | own spec | none (no castling, no en passant; reason `bareKings` has a generic text) |
| `multiverse` | own spec, `generate` / `apply` | per the final design. Playable design: none (idle worlds unchanged, `measured: () => true`, `solidExtra`, `actions`, `layout.focus` with a `key`). Faithful / quantum designs: `applyMiss` (`info.hit` is their "structural" flag), `recordInfo` + `infoText`, `replySide`, and `unifyWorlds` (faithful) or `budgetRule` (quantum). Castling and en passant on one board are certain moves |
| `kriegspiel` | `orthodoxSpec()`, inherited | `hidden`, `hiddenStyle: 'plain'`, `umpire: true`, `ownView`, `recordInfo` (`{ announce }`) + `infoText` |
| `darkchess` | `orthodoxSpec()`, inherited | `hidden` (fog is the default `hiddenStyle`), `recordInfo` + `infoText` (the square of a capture) |
| `chess960` | `orthodoxSpec()`, inherited | `castlingMoves(spec, w, side, { toRook: true })` in `extraMoves`; `options[0].describe` |
| `atomic` | `orthodoxSpec()`, inherited | nothing else (the ring counts explosions); optional blast marks through `layoutOf` with `layout.outlines` |
| `crazyhouse` | `orthodoxSpec()`, inherited | `solidExtra` (the hands), `handOrder: ['p', 'n', 'b', 'r', 'q']`, promoted types `+q` ... with `glyph: { sprite, promoted: true }` |
| `bughouse` | own spec (`[file, rank, board]`) | its own per-board `applyMiss(b, action, side)` (above), `unifyWorlds: (bs) => unifyCastling(bs)`, `budgetRule: (b, side) => ({ sides: [side, (side + 2) % 4], limit: 8 })`, `replySide: (s, me) => 3 - me`, `solidExtra`, `handOrder`, `castlingMoves` and `pawnExtras` (on a per-board view of `x.ep`); `passWhenStuck: true` only if the lead chooses it |
| `antichess` | `orthodoxSpec({ royalKing: false, ... })`, inherited | `compulsoryCapture: true` with its `filterMoves`, `resetsQuiet: false` on `k`, `sideInfo` |
| `koth` | `orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })`, inherited | `layout.outlines` for the hill; `attacks` with its default options |
| `threecheck` | `orthodoxSpec()`, inherited | `givesCheck(spec, next, side, enemy, { royal: false })`, `solidExtra` (`'checks:W:B'`), `noteText`, `sideInfo`, `recordInfo` + `infoText` |
| `horde` | `orthodoxSpec()`, inherited | `sideInfo` |
| `hexagonal` | own spec | `pawnExtras(..., { pawn, forward, captures })` with hex vectors, `applyMiss: (b) => clearEnPassant(b)` (no castling, no `unifyWorlds`) |
| `fourplayer` | own spec | `applyMiss: (b) => clearEnPassant(b)` (also runs for a skipped player), `unifyWorlds: (bs) => unifyCastling(bs)`, `budgetRule` (FFA `{ limit }` by kings left, Teams `{ limit: 2 }`), `passWhenStuck: (s) => !s.worlds[0].b.x.teams`, `recordInfo` + `infoText` ("Blue is out"), `resignResult`; `castlingMoves` along a file and `orthodoxAfterMove` (horizontal en passant square) |
| `capablanca` | own spec (10 × 8) | copy the orthodox hooks: `applyMiss: (b) => clearEnPassant(b)`, `unifyWorlds: (bs) => unifyCastling(bs)`; `castlingRights` (king to c or i) and the default `castlingMoves` |
| `shogi` | own spec | `handOrder: ['r', 'b', 'g', 's', 'n', 'l', 'p']`, `solidExtra` (the hands), optional `codeText` |
| `xiangqi` | own spec | `resetsQuiet: false` on the soldier |
| `makruk` | own spec (`whiteBlack()`) | `sideInfo` (the count) |

## UI layout

`rectTopology` gives a drawn 2D board. For other boards, build cells with
`makeTopology({ coords, name, cell, layout })`:
`cell(c) -> { x, y, w, h, shape: 'rect'|'hex'|'point', shade }` (rect: x,y = top-left; hex/point: x,y = centre),
`layout: { width, height, labels: [{ x, y, text }], lines: [{ x1, y1, x2, y2 }], boards: [{ x, y, w, h, label }],
areas: [{ x, y, w, h, shade: 'wood'|'river'|'frame' }] }`. Shades available in CSS: light, dark, mid, hill, hilldark,
camp, wood. Side 0 must be at the bottom of the layout (y grows downwards). Several boards: place them side by side
or in a grid with a gap of ~0.8 units and a `boards` entry with a short label for each. `layout.lines` are drawn under
the cells, `layout.outlines: [{ x1, y1, x2, y2 }]` above them (the hill of King of the Hill; pass them through
`orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })`). A board gets zoom controls when `width × height` is
over 200 or `layout.zoomable` is true; then a `layout.focus` (`{ x, y, zoom, key }`) zooms in on a point, and the board
recentres only when the focus changes (its `key`, or without a key its point and zoom).

## Style and checks (CI enforces all of these)

- Tabs, no semicolons, single quotes, trailing commas, JSDoc on every function (`@param {type} name description`,
  `@return {type}`), comments in plain English, no section signs, no TODO without an issue number.
- Max line length 120 (tabs count as 4). Translatable strings stay whole on one line (a longer line is allowed only
  for a string literal that cannot fit): put `t('quantumchess', '...')` on its own line if needed.
- Every user-visible text through `t('quantumchess', 'literal')` (literal strings only, placeholders `{name}`).
- Run: `npx eslint --fix src/variants/<id>.js tests/js/variants/<id>.spec.js`, then `npx eslint ...` (0 problems),
  `node tools/check-line-length.mjs` (0 findings in your files), `npx vitest run tests/js/variants/<id>.spec.js`
  and `npx vitest run tests/js/variants/fuzz.spec.js -t <id>` (random games must never throw or break an invariant).
- Test the hooks you use: after every move of a few random games, the bookkeeping your `applyMiss` / `unifyWorlds`
  keeps (`x.ep`, `x.castle`) is identical in all worlds, and `budgetInfo(V, s, side).used <= limit` for every side.
- Performance: `generate` runs in every world on every move; keep it allocation-light. A random game of 60 plies must
  run in a few seconds in the fuzz test.
