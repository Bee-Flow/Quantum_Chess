# Implementing a quantum chess variant (the API as built)

Repo: /home/tom/Projects/Quantum_Chess/Quantum_Chess. Read these files before writing code (they are the source of
truth; this guide summarises them):

- `handoff/LEAD-DECISIONS.md`: the lead's binding decisions (L1-L5). They override the specs: where a spec says
  "there is no 'your king cannot escape'" or "no waiting draws", the core now has both (section "Classic end rules"
  below).
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
  exports `mightForce` and `aiSplits` for tests). It sees the escape rule (section "Computer player" below).
- `handoff/CORE-CHANGES.md` section 8 ("Follow-up pass"): what changed in the core after the first pass (the classic
  end rules, merge and Measure fixes, the computer's time budget and hidden-information fallback, texts); section 9
  ("Third pass"): the computer sees the escape rule and looks a move deeper at the hard level, the outcomes of the
  preview carry their game result, the board hides targets and focus in hidden games, and the escape check is faster
  for splits.
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

The shared rules card (`sharedRules(V)` in `src/variantplay/texts.js`) already says: split, merge, land = roll and
pass = link, solid pieces, Measure, castling and en passant (left out with `specialMoves: false`), the game-end roll,
the budget of 8, and for a variant with royal pieces "Check does not limit your moves: you win by capturing the enemy
king, unless the variant has its own goal." plus, with `escapeRule`, "Your king cannot escape: …". Your `rules()`
must neither repeat nor contradict it (LEAD-DECISIONS L1): never write "there is no checkmate" or "you win only by
capturing the king".

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
| `worldResult(w, mover)` | per-world result `{ winner: side, reason }`, `{ winner: null, winners: [..], reason }` or `{ winner: null, reason }` (draw), or null; `mover` is the side that just moved. Default: a side without royal pieces has lost (2 sides). Do not return `'bareKings'` while `bareKingsDraw` is on (see "Classic end rules") |
| `stateResult(state)` | result from the whole state after a move (rarely needed) |
| `noMoves(state)` | result when the side to move has no legal move (default draw 'noMoves'; xiangqi: loss; antichess: win). A side whose every move leaves its king to be taken has moves: with `escapeRule` that game ends as `cannotEscape` first |
| `reasonText(reason)` | translated text for your own reason codes (return null for unknown; it is asked before the generic texts). Generic texts exist for `king`, `resign`, `quiet` (it says "50 moves": give your own if `quietPlies` is not 100), `moveLimit`, `noMoves`, `bareKings` ("only the two kings are left"), `cannotEscape` ("the king could not escape") |
| `escapeRule`, `bareKingsDraw`, `drawsWait`, `specialMoves` | declaration flags: the classic end rules and the castling / en passant sentence of the shared card. See "Classic end rules" below |
| `isOut(w, side)` / `nextSide(w, side)` | multi-player turn order (four-player: eliminated players) |
| `maxPly`, `quietPlies` | limits (defaults 600 and 100) |

### Classic end rules

docs/rules.md sections 5 and 6 apply to every variant (LEAD-DECISIONS L1). `defineVariant` fills in three flags for
them, plus one for the rules card. The three rule flags default to true for a *classic* variant: exactly two sides,
at least one royal type, no `compulsoryCapture`, and neither `nextSide` nor `actions` (one move per turn); otherwise
they default to false. Set a flag to opt out, to opt in (`drawsWait` with four seats), or to state a default on
purpose, and say why in a code comment.

| Flag | Default | Meaning |
|---|---|---|
| `escapeRule` | classic | "Your king cannot escape" (docs/rules.md 5): after a move, the side to move has at least one legal action; every one of them (moves, splits, merges, measurements) leads only to outcomes where the game goes on and one of its royal pieces can be captured **for certain** by the side that moves next; and none of its actions might capture an enemy royal piece, with any chance. Then the mover wins at once: `{ winner: mover, reason: 'cannotEscape' }`. For certain means that one legal move key takes a royal piece in every world, or one merge does (a converging capture). A take counts the way the danger ring counts it: the royal piece is captured, or the side has no royal piece left afterwards (atomic's explosions). A key that is a certain move in some worlds and an ordinary move in others is not legal, so it does not count. An outcome that ends the game is an escape. A side without any legal action gets `noMoves` instead. The light states of the computer's search leave the rule out, but the computer applies it where it uses real states: the outcomes of its own candidate moves and the answers after which the side to move might be mated (section "Computer player"). |
| `bareKingsDraw` | classic | A draw (`reason: 'bareKings'`, generic text "only the two kings are left") when only royal pieces stand on the board in every world and no hand holds a piece. It is checked after `worldResult`, `stateResult` and the escape rule. It needs every world, so a variant whose condition differs (decided world by world and settled by the game-end roll: atomic, makruk; or a four-player rule) keeps its own `worldResult` rule and sets this flag to false, so that the draw is not applied twice. "Only if the kings do not touch" needs no own rule in a two-player game: with solid kings that is what `drawsWait` gives (raumschach, hyper4d and hexagonal use the core flag) |
| `drawsWait` | classic | The core's generic draws, the quiet-move draw and the bare-kings draw, wait while the side to move can capture an enemy royal piece for certain. A converging capture counts; a capture that is not legal does not, even at 100 % king danger. The move limit does not wait, and "no legal move" can never meet a certain capture. Draws that the variant returns itself (`worldResult`, `stateResult`, `noMoves`) are not affected: a variant draw that must wait checks this itself (makruk does). |
| `specialMoves` | true | false when the variant has neither castling nor en passant. Only the UI reads it: the shared rules card then leaves out its castling and en passant sentence (L2). |

After a move, `stateAfter` decides the result in this order: `worldResult` (with the game-end roll), `stateResult`,
`escapeRule` (not in light mode), the generic draws (bare kings, then the quiet-move draw, both held back by
`drawsWait`), the move limit, then no legal move (`passWhenStuck`, else `noMoves`), and finally `recordInfo`.

What the rules mean for your module:

- **Tests (L5).** A test position in which the side to move cannot escape now ends at once with `cannotEscape`, and a
  quiet-move or bare-kings draw with the kings side by side waits. Fix the test position or the expectation, not the
  core. Where your variant makes the rule special, add a test of it: a blow-up next to the king is a take (atomic), a
  hill step is an escape (koth), the last White piece that Black might capture is an escape (horde).
- **Pure world hooks.** The escape search builds the outcomes of every action as the light `stateAfter` does, but
  without `unifyWorlds`. So `generate`, `applyClassical` (with `afterMove`) and `applyMiss` must be pure functions of
  the world, and `unifyWorlds` must not change anything the captures of the next move depend on. Never change a world
  after it is built: `worldKey` is also remembered per world object.
- **Cost.** In a normal position the first action tried is already an escape (well under 1 ms). Worst cases measured
  on trapped positions (`handoff/tmp/fix-core2/worst-after.txt`): 8 × 8 at 8 worlds 1.5–4.6 ms, 5 × 5 × 5 at 8
  worlds about 9 ms, 4 × 4 × 4 × 4 at 8 worlds about 29 ms, 64 worlds up to about 140 ms (4D). Since the third pass
  (CORE-CHANGES 9.2, U3) the splits of a piece are checked per target: the median of one real move on mate positions
  with 8 worlds is about 7 ms on the hexagonal board, 10 ms on 5 × 5 × 5 and 37–50 ms in 4D, and 93 ms in 4D at 64
  worlds (was 255). The rule also runs inside the computer's search now (section "Computer player"), so a slow
  `generate`, `afterMove` or `applyMiss` means fewer candidates searched within a level's time.
- **Hidden information.** The rule is decided on the real state, like the umpire who announces checkmate; the whole
  board is shown when the game ends.

The flags per variant (LEAD-DECISIONS L1 and L2, and the modules as they stand; **bold** = written in the module, the
rest are defaults):

| Id | `escapeRule` | `bareKingsDraw` | `drawsWait` | `specialMoves` | Why |
|---|---|---|---|---|---|
| `raumschach` | on | on (no own rule) | on | **false** | no castling, no en passant (L2) |
| `trid` | on | on | on | true | |
| `hyper4d` | on | on (no own rule) | on | **false** | no castling, no en passant (L2) |
| `multiverse` | false (off by default: `nextSide`, `actions`) | false | true | true | the values of the final spec (multiverse-final.md F18, written out there): the 5D stuck test takes the place of the escape rule, and kings can still take each other through time. The placeholder module is plain orthodox chess with the defaults until then |
| `kriegspiel` | on | on | on | true | decided on the real board |
| `darkchess` | on | **false** | on | true | bare kings are no draw, as on chess.com: the kings cannot see each other (darkchess.md) |
| `chess960` | on | on (no own rule) | on | true | |
| `atomic` | **true** | **false** | on | true | an explosion is a take for the escape test. The bare-kings draw stays as atomic's own `worldResult` rule, decided world by world (game-end roll, T14): L1's exception |
| `crazyhouse` | on | on | on | true | the bare-kings draw never comes: captured pieces go to a hand |
| `bughouse` | **false** (off by default: four seats) | **false** | **true** | true | a team wins, and the other board's moves come first; bare kings cannot happen |
| `antichess` | **false** | **false** | **false** | true (en passant) | losing chess: kings are ordinary pieces (off by default already: no royal type, compulsory capture) |
| `koth` | on | **false** | on | true | a bare king can still walk to the hill and win (L1) |
| `threecheck` | on | on (no own rule) | on | true | its `worldResult` must not return `'bareKings'` too |
| `horde` | on (Black's king) | **false** | on | true | White has no king; the horde wins by taking the king, Black by taking every White piece (L1) |
| `hexagonal` | on | on (no own rule) | on | true (en passant) | |
| `fourplayer` | **false** (off by default: four seats) | **false** | **true** | true | several players may capture, and a Teams game is won by a team; its own FFA bare-kings rule in `worldResult` |
| `capablanca` | on | on | on | true | |
| `shogi` | on | on (never reached: captures go to a hand) | on | **false** | no castling, no en passant (L2); the escape rule covers checkmate and stalemate |
| `xiangqi` | on | on | on | **false** | no castling, no en passant (L2); its own `noAttackers` draw leaves the core's bare-kings draw only the case of facing generals, where it waits |
| `makruk` | on | **false** | on | **false** | no castling, no en passant (L2); the bare-Khuns draw is its own `worldResult` rule, decided world by world, and its own draws wait themselves |

### Quantum layer

| Field / hook | Meaning |
|---|---|
| `applyMiss(b, action, side, info) -> world` | per-ply bookkeeping in the worlds where the played action did not take effect (see "Idle worlds"). Default: those worlds stay unchanged. `orthodoxSpec()` brings `clearEnPassant` |
| `unifyWorlds(bs, mover) -> bs` | state-level facts made identical in every world of the chosen outcome (see "State-level facts"). Default none. `orthodoxSpec()` brings `unifyCastling`. It must not change anything the captures of the next move depend on: the escape rule builds outcomes without it |
| `solidExtra(b) -> string` | the variant's own structure that must be the same in every world (three-check: the check counters; crazyhouse and shogi: the hands, as a guard; multiverse: the timelines). Worlds that differ in it are settled by the solid roll like solid pieces; the roll's note is `'solid:' + solidExtra(b)` |
| `budgetRule(b, side) -> { sides?, limit? }` | the sides whose pieces share one quantum budget (default `[side]`; with several sides one arrangement counts all their pieces together) and its limit (default 8). Read on `state.worlds[0].b`, for the mover's split legality and the pass = link fallback. Must be cheap (read `b.x` or count kings, no generation) and must never lower a limit during a game. `budgetInfo(V, state, side)` returns `{ used, limit, sides }` (the pips, your tests). At `used >= limit` no split is possible: `splitsFrom` and the computer's `aiSplits` return nothing at once, and the UI greys out Split ("Budget full: merge or measure a piece first."). Bughouse: `{ sides: [side, (side + 2) % 4], limit: 8 }`; four-player FFA: `{ limit }` by the number of kings left |
| `compulsoryCapture: true` | when some legal move key might capture (captures in at least one world), only such keys are legal, no split and no Measure, and only merges with a capturing outcome. `mustCapture(V, state)` tells; the UI says so and disables Split and Measure. A per-world rule, if any, stays in `filterMoves`. Default false |
| `passWhenStuck: true \| (state) => boolean` | a side without a legal move sits out instead of the `noMoves` result: the next side that can move is to move, `ply` does not grow for the skipped sides, every world passes through `applyMiss` with `type: 'pass'` once per skipped side, the record gets `skipped: [sides]` and the move list shows "{side} cannot move and sits out". The function is called on the new state (the stuck side to move). If no side can move, `noMoves` applies as before. Not evaluated on the light states of the computer's search, but on the real states it builds (the outcomes of its own candidates, answers that might mate, the hard level's third move). Default false |
| `recordInfo(prev, code, branch, next) -> object \| null` | JSON data stored as `info` on the history record (null stores nothing). Called once per real state at the end of `stateAfter`, after the result, `stateResult`, `noMoves` and any sit-out: `next.turn` is the side really to move and the record (`next.history.at(-1)`) already has `skipped`. `branch.worlds` are the worlds of the outcome before `unifyWorlds`. Called for every played move, and also inside the computer's search wherever it builds real states (the outcomes of its own candidates, answers that might mate, the hard level's third move), never for its light states; undo replays call it again, so keep it pure and cheap. Show it with `infoText` |

### Computer player

| Field / hook | Meaning |
|---|---|
| `evaluate(w, side)` | extra evaluation terms in centipawns (KOTH: king near the hill...). It also ranks the computer's split targets (only the best 6 targets per piece are paired, ties at random) |
| `materialSign: -1` | the computer prefers LESS material (antichess) |
| `aiView(state, side, level)` | the state as the computer sees it (hidden information). `level` is the id of the computer's level (`'easy'`, `'normal'` or `'hard'`), an optional third argument that a hook may ignore. The computer plays the best move of its view that is legal on the real state. When none is, it tries what a player in its seat could attempt, shuffled with the search's random numbers, until `branches` accepts one: `candidateMoves(real)` (else the legal moves of the real state) plus the merges and measurements of `ownView(real, me)`. It returns null only when none of them is legal |
| `replySide(state, me) -> side \| null` | whose answer the normal and hard levels look at after the computer's move (`state` = after that move). Default `state.turn`. `null`: no answer; another side: its answers are searched on `{ ...state, turn: side }` (bughouse: `(s, me) => 3 - me`, the opponent on the same board); `me` (a turn of several moves): the computer's best continuation |

The levels: easy judges the positions right after its own move (noise ±120 centipawns); normal also looks at the
other side's forcing answers (noise ±25); hard looks at every answer, adds no noise and, with time left, looks a move
deeper (below).

**Forcing moves** (`mightForce`): the moves the computer tries first, the only answers the normal level looks at,
and the hard level's third moves. A move is forcing when some outcome captures something, ends the game by
`worldResult`, or, with `escapeRule`, leaves an enemy royal piece capturable for certain by the mover (a king danger
of 100 %: what chess players call check) or might box it in (see below). Every outcome counts, a Missed one too: its
worlds are unchanged, but the other side is to move there, and in antichess a side left without a move wins, in horde
it draws. A variant with its own goal (a hill, three checks) needs no extra code for that. The normal level lets the
answering side decline every forcing answer: the answering side's best value starts at the value of the position
after the computer's move, as if it made a quiet move (horde: the computer takes a free knight although Black could
block with a stalemating move).

**The escape rule in the search.** The search judges most positions on light states (no escape rule, no "no legal
move", no sit-out, no history record), with three exceptions:

- The outcomes of the computer's own candidate moves are the real states of the game (`stateAfter` without light
  mode), at every level: a move after which the enemy cannot escape scores as a win, a move whose outcome ends the game
  against the computer as a loss. Only the quick judgement made when the time runs out before any candidate has a
  value stays light.
- After the computer's move or an answer, a side to move that can capture an enemy royal piece for certain counts as
  having won one ply later (reason `king`), without a further search. The test is the core's `certainCapture`
  (exported from quantum.js), behind a cheap filter in ai.js that looks only at captures and needs a move key or a
  piece common to every world.
- After an answer, when the side to move might be mated, the real state of that answer is used, so that the escape
  rule decides whether the answer was a mate in one. "Might be mated": one of its royal pieces can be captured for
  certain, or it might be boxed in (a quiet mate, the king not attacked: it has a royal piece, at most three other
  pieces on the board and in hand, and no step of a royal piece that is proven safe). This also holds when the light
  state would be drawn by the quiet-move or bare-kings rule, since a played move applies the escape rule first.

So every level finds a mate in one (shogi's `g@1b`, horde's quiet `a4-c6`, atomic's quiet `f3-e5` after 1.Nf3 a6),
and the normal and hard levels do not step into one. The hooks that real states run (`stateResult`, `noMoves`,
`passWhenStuck`, `recordInfo`, and the world hooks of the escape rule) run inside the search too: keep them pure and
cheap.

**Ties and the hard level.** A level without noise (hard) adds a tiny random amount (`rng() * 1e-3` centipawns) to
each value, so that exact ties are broken at random: it does not move one rook back and forth, and it opens with
different moves for different seeds (the same move for the same seed). With time left after its two-move pass, in a
variant of two sides and unless it has found a sure win, the hard level re-scores its best candidates (`deep: 8` in
`LEVELS`) with a third move: after each answer of the other side, the computer's best forcing move or none. The
candidates are taken in the order of their value (rounded to a centipawn, forcing moves first among equals) while the
remaining budget, less a tenth of the level's time, lasts; the best candidate whose whole evaluation fitted is
played, else the two-move choice stands. It finds a knight fork of king and rook, where the rook falls on the third
move.

The time budget of a level (easy 0.4 s, normal 1.5 s, hard 4 s) runs from the call of `chooseMove` and is also
checked inside the evaluation of each candidate (before each outcome and each answer), so the computer keeps to it
at 64 worlds too. When the time is spent before any candidate has a value, that candidate is judged by the positions
right after it, without an answer, so there is always a move. A slow `evaluate` therefore means fewer candidates
searched, not a late move. The escape checks of the real states cost time too: on 4D boards at 8 worlds and more,
easy and normal now use their whole budget and search fewer candidates than before the third pass.

### Hidden information

| Field / hook | Meaning |
|---|---|
| `hidden: true`, `visibility(state, side) -> Set<sq>` | squares the side can see. While the game runs: no undo, no danger line, the other sides' budgets show "?", a two-step hand-over in pass & play |
| `candidateMoves(state)` | the moves a player may TRY in the UI (Kriegspiel: moves as if the enemy pieces were unknown). Each `{ code, type: 'move', from, to, promo, drop }`. The computer's fallback (see `aiView`) tries them too, so they must depend only on what the side to move knows |
| `ownView(state, side) -> state` | the state as the side knows it; the Split, Merge and Measure modes choose their squares on it, every attempt is decided on the real state (a split, merge or Measure legal on the own view but not on the real state gets the umpire's "No") |
| `hiddenStyle: 'fog' \| 'plain'` | how squares the viewer cannot see look (default `'fog'`; Kriegspiel: `'plain'`, a normal-looking board) |
| `umpire: true` | an attempt is binding (no odds preview, no odds in the results), a refused attempt gets "the umpire says no" |

What the board shows in a hidden game is generic (`src/variantplay/marks.js`, the composable and `VariantBoard`):

- **Only for the player to move.** The board takes input and shows the selection, the move targets and keyboard
  focus only while it is interactive (`boardInteractive`): the game goes on, a human is to move, neither the first
  step of the hand-over nor the curtain is shown, and in a hidden game the viewer is the side to move. On the
  computer's turn, during the hand-over and behind the curtain no square can be focused.
- **Focus.** The keyboard reaches the from squares of the viewer's moves that the viewer can see, and the marked
  targets (`focusSquares`). The board gives a square the viewer cannot see tabindex 0 only when it is a marked target,
  and its label names only the viewer's own pieces.
- **Targets on hidden squares.** A target on a square the viewer cannot see is marked only when it comes from what the
  viewer knows (`blindTargetAllowed`): moves and drops from `candidateMoves`, Split and Merge targets from `ownView`.
  Otherwise the targets come from the real state, so such a square gets no target mark (Dark chess). Kriegspiel sees
  only the squares of its own pieces, so its move dots stand on hidden squares; they come from `candidateMoves`, which
  is why `candidateMoves` and `ownView` must depend only on what the side to move knows.
- **Tests** (`tests/js/variants/core-ui2.vue.spec.js`, on the real Kriegspiel and Dark chess modules, pass & play
  and against the computer): the tab order, the labels, the classes and the dots are the same whatever stands on the
  squares the viewer cannot see.
- **Preview.** While a hidden game runs, the outcomes of the odds preview carry no `result` (whether an outcome ends
  the game depends on hidden pieces, for example a quiet-move draw that waits for a certain capture); an umpire game
  has no preview at all.

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
  left (explosions), and converging captures (a merge whose parts can take the king). Every merge onto a square that
  may hold a piece the merging side can capture is weighed, so a converging capture next to the king counts in
  atomic too.
- A part that moves onto another part of the same piece (same id and type) joins it without a landing roll.
- Parts with different types (a promotion in some worlds only) cannot merge: a merge is refused when the piece has
  more than one type over the worlds where it stands on either part or on the target. Measure is still offered.
- A superposed piece can be handled from each of its squares that no other piece may occupy: the Measure is offered
  on the first of them, merges and splits from all of them. A part on a square that may also hold another piece
  cannot be picked up, but the other parts still can.
- A merging piece need not stand in the first world (a 5D twin): its type is read in a world where it stands on the
  from square.
- History records carry `from` / `to` squares (last-move marks for any code), `skipped` and `info`.
- `squareView` / `boardView` treat squares beyond the board (layout display cells) as empty.
- Drop outcomes read "Dropped" and "Missed: the piece stays in hand" (LEAD-DECISIONS L3: in shogi a drop also misses
  where a pawn drop would mate).
- The odds preview says which outcome ends the game. `outcomes(V, state, code)` gives each outcome
  `{ key, notes, p, captures, rolled }` and, only when that outcome ends the game, `result`: the result of the state
  after it as the light `stateAfter` decides it (`worldResult`, the same in every world of the outcome after the
  game-end roll, then `stateResult`, the bare-kings and quiet-move draws and the move limit). When a generic draw or
  the move limit would end it, the escape rule is checked first, as for a played move, so the preview never shows a
  draw where the move wins; otherwise "your king cannot escape" and "no legal move" are decided only when the move is
  played. When the game goes on the field is left out (not `null`). The pending box and the roll box add "The game
  ends: {result}" (`endText` in texts.js) unless an `end:` note of the game-end roll already says so; the roll box uses
  the result of the played move, so it includes "the king could not escape". `unifyWorlds` and `stateResult` also run
  for every outcome of the preview: keep them cheap. The hidden-information preview is in section "Hidden information".
- The pieces in hand and the promotion choice are turned like their side's pieces on the board (`pieceSpin` in
  glyphs.js: `sides[i].rotate` plus the board's rotation), so Gote's shogi pieces point down in Sente's view.
- The classic end rules (section "Classic end rules"): "your king cannot escape", the bare-kings draw, and draws that
  wait for a certain royal capture.
- Rolls of local games are remembered under `ply:positionHash:code` with a trailing promotion suffix stripped
  (`src/variantplay/rolls.js`, L3): undo followed by the same move in the same position replays the same roll,
  whatever the pawn promotes to, and the same move in another position rolls anew. The hash covers the side to move
  and every world (`worldKey` and weight, in stored order), so `x` must hold only JSON data.

## Which new hooks each variant uses

From `handoff/CORE-CHANGES.md` (sections 2, 5 and 8) and the specs. "Inherited" = keep `orthodoxSpec()`'s `applyMiss`
and `unifyWorlds`; every variant gets the section above for free. The flags of the classic end rules and
`specialMoves` of each variant are in the table of section "Classic end rules".

| Id | Built on | New hooks and helpers to use |
|---|---|---|
| `raumschach` | own spec | `specialMoves: false` (`x` stays `{}`, no castling, no en passant); no own `worldResult` (the core's bare-kings draw) |
| `trid` | own spec, own `generate` | castling `kind: 'castle'`, en passant `kind: 'ep'`; `applyMiss: (b) => clearEnPassant(b)`; `unifyWorlds: (bs) => unifyCastling(bs)` with rights in the `x.castle` shape (else its own `unifyWorlds`) |
| `hyper4d` | own spec | `specialMoves: false` (no castling, no en passant); no own `worldResult` (the core's bare-kings draw) |
| `multiverse` | own spec, `generate` / `apply` | per the final design. Playable design: none (idle worlds unchanged, `measured: () => true`, `solidExtra`, `actions`, `layout.focus` with a `key`). Faithful / quantum designs: `applyMiss` (`info.hit` is their "structural" flag), `recordInfo` + `infoText`, `replySide`, and `unifyWorlds` (faithful) or `budgetRule` (quantum). Castling and en passant on one board are certain moves |
| `kriegspiel` | `orthodoxSpec()`, inherited | `hidden`, `hiddenStyle: 'plain'`, `umpire: true`, `ownView`, `recordInfo` (`{ announce }`) + `infoText` |
| `darkchess` | `orthodoxSpec()`, inherited | `hidden` (fog is the default `hiddenStyle`), `recordInfo` + `infoText` (the square of a capture); `bareKingsDraw: false` |
| `chess960` | `orthodoxSpec()`, inherited | `castlingMoves(spec, w, side, { toRook: true })` in `extraMoves`; `options[0].describe` |
| `atomic` | `orthodoxSpec()`, inherited | nothing else (the ring counts explosions); optional blast marks through `layoutOf` with `layout.outlines`; `escapeRule: true` and `bareKingsDraw: false` (its own bare-kings rule in `worldResult`) |
| `crazyhouse` | `orthodoxSpec()`, inherited | `solidExtra` (the hands), `handOrder: ['p', 'n', 'b', 'r', 'q']`, promoted types `+q` ... with `glyph: { sprite, promoted: true }` |
| `bughouse` | own spec (`[file, rank, board]`) | its own per-board `applyMiss(b, action, side)` (above), `unifyWorlds: (bs) => unifyCastling(bs)`, `budgetRule: (b, side) => ({ sides: [side, (side + 2) % 4], limit: 8 })`, `replySide: (s, me) => 3 - me`, `solidExtra`, `handOrder`, `castlingMoves` and `pawnExtras` (on a per-board view of `x.ep`); `passWhenStuck: true` only if the lead chooses it; `escapeRule: false`, `bareKingsDraw: false`, `drawsWait: true` |
| `antichess` | `orthodoxSpec({ royalKing: false, ... })`, inherited | `compulsoryCapture: true` with its `filterMoves`, `resetsQuiet: false` on `k`, `sideInfo`; `escapeRule: false`, `bareKingsDraw: false`, `drawsWait: false` |
| `koth` | `orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })`, inherited | `layout.outlines` for the hill; `attacks` with its default options; `bareKingsDraw: false` |
| `threecheck` | `orthodoxSpec()`, inherited | `givesCheck(spec, next, side, enemy, { royal: false })`, `solidExtra` (`'checks:W:B'`), `noteText`, `sideInfo`, `recordInfo` + `infoText` |
| `horde` | `orthodoxSpec()`, inherited | `sideInfo`; `bareKingsDraw: false` |
| `hexagonal` | own spec | `pawnExtras(..., { pawn, forward, captures })` with hex vectors, `applyMiss: (b) => clearEnPassant(b)` (no castling, no `unifyWorlds`) |
| `fourplayer` | own spec | `applyMiss: (b) => clearEnPassant(b)` (also runs for a skipped player), `unifyWorlds: (bs) => unifyCastling(bs)`, `budgetRule` (FFA `{ limit }` by kings left, Teams `{ limit: 2 }`), `passWhenStuck: (s) => !s.worlds[0].b.x.teams`, `recordInfo` + `infoText` ("Blue is out"), `resignResult`; `castlingMoves` along a file and `orthodoxAfterMove` (horizontal en passant square); `escapeRule: false`, `bareKingsDraw: false` (its own FFA rule), `drawsWait: true` |
| `capablanca` | own spec (10 × 8) | copy the orthodox hooks: `applyMiss: (b) => clearEnPassant(b)`, `unifyWorlds: (bs) => unifyCastling(bs)`; `castlingRights` (king to c or i) and the default `castlingMoves` |
| `shogi` | own spec | `handOrder: ['r', 'b', 'g', 's', 'n', 'l', 'p']`, `solidExtra` (the hands), optional `codeText`; `specialMoves: false` |
| `xiangqi` | own spec | `resetsQuiet: false` on the soldier; `specialMoves: false` |
| `makruk` | own spec (`whiteBlack()`) | `sideInfo` (the count); `specialMoves: false`, `bareKingsDraw: false` (its own bare-Khuns rule) |

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
  and `npx vitest run tests/js/variants/fuzz.spec.js -t <id>` (random games must never throw or break an invariant;
  options marked `random` get values drawn with the game's seed, so Chess960 plays random start positions).
- Test the hooks you use: after every move of a few random games, the bookkeeping your `applyMiss` / `unifyWorlds`
  keeps (`x.ep`, `x.castle`) is identical in all worlds, and `budgetInfo(V, s, side).used <= limit` for every side.
- Performance: `generate` runs in every world on every move; keep it allocation-light. A random game of 60 plies must
  run in a few seconds in the fuzz test.
- Test positions follow the classic end rules (L5, section "Classic end rules"): a king that cannot escape ends the
  game at once, and the draws wait while the side to move can take the enemy king for certain.
