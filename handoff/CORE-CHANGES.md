# Core changes for the variants (plan of the core architect)

Status: plan, 2026-09-25, revised by the adversarial review (section 7, "Review notes"). Written from every core
request in `handoff/status-research.md`, `handoff/status-multiverse.md`, the specs in `handoff/research/*.md`
(including the reviewers' edits that were in the working tree at the time, and the later specs capablanca.md,
makruk.md, shogi.md, xiangqi.md and the koth, raumschach and crazyhouse review edits), the prototypes with patched core
copies (`handoff/prototypes/zh/quantum_team.js`, `handoff/prototypes/fp/quantum_fp.js`) and the lead's binding
decisions D1-D6 below.

**Follow-up pass** (section 8, after the lead's decisions in `handoff/LEAD-DECISIONS.md`): the classic end rules are
now in the core. That supersedes rows 30 (the missed-drop text), 40 (bare kings per variant) and 72 ("your king
cannot escape" and the waiting draws rejected) of section 1, their entries in section 4, and the drop text of U7.

Every item is generic and backwards compatible: a new hook is optional and its default keeps today's behaviour, except
where today's behaviour is a bug (marked **bug fix**). All existing tests (`tests/js/variants/*`, the rest of
`npm test`) must keep passing.

The lead's binding decisions:

| # | Decision |
|---|---|
| D1 | Castling follows docs/rules.md section 5: it never rolls; king and rook solid on their start squares, every square between them empty for certain, so it is legal only if it is available in **every** world. The right is lost as soon as the king or that rook is not 100 % on its start square. |
| D2 | En passant follows docs/rules.md section 4: always certain (legal only if available in every world) and only on the ply right after the double step, also in worlds where that ply's move missed and on Measure turns (fix the stale en passant square). |
| D3 | A generic hook for worlds where a move misses (`applyMiss`), as in multiverse-engines.md recommendation R4. Measure turns advance the per-ply bookkeeping too. |
| D4 | Fix the Chess960 castling bug in `applyClassical` (king placed on the rook square). |
| D5 | Fix the outcome label after the extra settling roll. |
| D6 | Everything generic and backwards compatible; all existing tests keep passing. |

Verified on the current core (scripts in `handoff/tmp/core-architect/probe*.mjs`):

- stale en passant: after `d2-d4`, a partly missed Black move and a partly missed White move, `e4-d3` is still legal
  (miss 0.75 / capture 0.25); after `d2-d4`, `?f6`, `?f3` it is legal too;
- castling past a ghost is rolled (miss 0.5 / move 0.5), and after a partial rook slide plus a measurement `O-O` is
  legal again;
- `O-O` with Ra1 Kg1 Rh1 gives Kh1 Rf1;
- a solid roll after an unrolled move labels both parts `move`, and the note holds the whole solid key;
- `squareView(state, 70)` on an 8 × 8 board returns a bogus occupant;
- a mini-atomic capture next to the king gives `royalDanger` 0;
- a missed pawn push resets the quiet counter to 0;
- (review, `handoff/tmp/plan-review/c1c2.mjs`) a knight 50 % f3 / 50 % e5 playing `f3-e5` (onto its own other part) is
  rolled (miss 0.5 / move 0.5), although docs/rules.md 2.1 says the part simply joins;
- (review, same script) a queen 50 % d4 / 50 % h5 whose merge `d4|h5-h8` captures the king on h8 for certain gives
  `royalDanger` 0.5 for that king, although docs/rules.md 5 says the ring counts converging captures.

---

## 1. Decisions table

Verdicts: **DO** (item id in section 2), **VARIANT** (the variant does it with existing hooks; workaround in section
4), **REJECT** (reason in section 4), **MERGED** (served by another DO item).

| # | Request | Source(s) | Verdict |
|---|---|---|---|
| 1 | Hook for worlds where a move misses: `applyMiss(world, action)` | multiverse-engines.md 0.8, 9.5 (R4), 11.11; status-multiverse (engines 6, design 7); multiverse.md 3.6.2; D3 | DO Q1 (+ W4) |
| 2 | Stale en passant square in missed worlds and on Measure turns; `afterIdle(next)` | hexagonal.md 4 "Open core issue"; D2, D3 | MERGED into Q1 + W4 |
| 3 | `pass(world, bid)` for Measure (the board holding the measured part passes) | multiverse.md 3.6.3; multiverse-engines.md 9.5 "Measure" | MERGED into Q1 (`action.type === 'measure'`) |
| 4 | `applyMiss(..., structural)`: a rolled Missed builds nothing, a link builds the boards | multiverse.md 3.6.2 | MERGED into Q1 (`info.hit`) |
| 5 | Castling never rolls, legal only when available in every world | D1; kriegspiel.md open question 6; chess960.md 8.2; docs/rules.md 5; trid.md 8.1 item 9 ("one key, two meanings") | DO Q2 (strict: every world, and certain in every world) |
| 6 | En passant always certain | D2; docs/rules.md 4 | DO Q2 |
| 7 | Castling rights follow the state (lost everywhere as soon as not 100 % home) | D1; trid.md 3 "Castling rights follow the state", open question 3; docs/rules.md 5 | DO Q3 + W5 |
| 8 | Chess960 castling bug in `applyClassical` | chess960.md 3 fix 1, 8.1(a); status-research (chess960 core change 1); D4 | DO W1 (bug fix) |
| 9 | `castlingMoves(..., { toRook })` (king onto rook input) | chess960.md 3 fix 2, 8.1(b) | DO W2 |
| 10 | Outcome label after the solid / game-end roll | threecheck.md 3 "Core issue", T6, 8.3; status-research (chess960 core change 2); D5 | DO Q4 (bug fix) |
| 11 | Short roll notes instead of the whole solid key | multiverse-engines.md 9.5 "Also recommended" | DO Q4 |
| 12 | `V.noteText(note)` for the counter roll | threecheck.md 3, 8.3; fourplayer.md 6 | DO U7 |
| 13 | `V.sideInfo(state, side)` in the player row | threecheck.md 6, 8.3; antichess.md 6, 8.5; horde.md 6, open question 4 | DO U6 |
| 14 | `attacks(..., { royal: false })` | threecheck.md 3 "Attack test", 8.3 | DO W6 |
| 15 | Board options on `orthodoxSpec` (hill shading) | koth.md open question 2; status-research (small hooks) | DO W7 |
| 16 | State-level compulsory capture (`compulsoryCapture`, `mustCapture`) | antichess.md 3 "Required core change", 4.1, 8.1 | DO Q5 (+ U8) |
| 17 | Per-type flag for what resets the quiet counter (`resetsQuiet`) | antichess.md 3 "Known core deviation", 8.3 and review item 6; xiangqi.md 3.2 (2) (soldiers, optional `resetsQuiet(sample, branch)` hook) | DO Q8 (the type flag covers xiangqi: `resetsQuiet: false` on the soldier) |
| 18 | Missed attempts must not reset the quiet counter | docs/rules.md 6 ("Missed attempts and failed captures do not reset the count"); makruk.md 3.1 item 3; threecheck.md 8.2; koth.md 8 item 8 | DO Q8 (bug fix) |
| 19 | Team budget `budgetSides(side)` | bughouse.md 3 "Required core change", 4.4, open question 1; `prototypes/zh/quantum_team.js` | MERGED into Q6 |
| 20 | Per-player budget limit `budgetLimit(world)` | fourplayer.md 3.4 hook 1, Q3, 8.1; `prototypes/fp/quantum_fp.js` | MERGED into Q6 |
| 21 | Budget pips showing the limit and the team number | bughouse.md 6; fourplayer.md 6 | DO U5 |
| 22 | `passWhenStuck` (a side without a move sits out) | fourplayer.md 3.4 hook 2 (`passWhenStuck(state)`: FFA sits out, Teams draws, S1), 8 item 4; bughouse.md review item 5 | DO Q10 (flag **or** function of the state) |
| 23 | `resign(state, side)` (Teams winners; elimination in FFA pass & play) | fourplayer.md 3.4 hook 3, 8.1 | DO U12 (result only); elimination REJECT |
| 24 | `enemies(a, b, w)` with the world | fourplayer.md 3.4 "Optional", 8.1 | REJECT |
| 25 | AI reply side `replySide(state, me)` | bughouse.md 3 "Optional core change", open question 3 | DO U3 |
| 26 | AI `replyValue` with multi-move turns | multiverse-engines.md 9.7; multiverse-design-playable.md 4.10 | DO U3 |
| 27 | King danger must count explosions (`royalDanger` generic test or `royalLoss` hook) | atomic.md 3.1, T13, T15, open question 1 | DO Q7 (generic, no hook) |
| 27b | King danger must count converging captures (merges), as docs/rules.md 5 says | raumschach.md 4.6 (RQ9, "core change C2") | DO Q7 (bug fix) |
| 28 | Blast marks `V.blastArea` | atomic.md 6, open question 2 | VARIANT (optional) |
| 29 | `outcomeText` hook ("Captured (explodes)") | atomic.md open question 3 | REJECT |
| 30 | "Dropped" / "Missed: the square was taken" for drops | crazyhouse.md 6; bughouse.md 6 | DO U7 |
| 31 | Promoted marker on sprite pieces | crazyhouse.md 6 | DO U13 |
| 32 | Hand pieces at full value in the AI | crazyhouse.md 3 `evaluate`, open question 5; bughouse.md 3 | VARIANT |
| 33 | Orthodox helpers for extra coordinates (castling, en passant) | bughouse.md 3 "`core/orthodox.js` assumes two coordinates", open question 2 | DO W3 |
| 34 | Castling along a file, en passant midpoint in both coordinates | fourplayer.md 3.3 | DO W3 |
| 35 | `pawnExtras` with forward and capture vectors | hexagonal.md 3 `hexPawnExtras`, 4 engine tweaks | DO W3 |
| 36 | Tri-D column blocking / projected move generation in the core (`movegen.js`) | trid.md 3 "Projected move generation"; status-research (raumschach+trid) open question 2 | VARIANT (`V.generate`) |
| 37 | AI: only the best 6 quiet targets per piece for splits | raumschach.md 3; hexagonal.md 3; hyper4d.md 3; trid.md 3; status-research (raumschach+trid) open question 6 | DO U4 |
| 38 | Wide and compact layouts | raumschach.md 6; status-research (raumschach+trid) open question 7 | REJECT (deferred) |
| 39 | Start zoomed on the side's home boards | hyper4d.md 6, open question 5 | VARIANT (`layout.focus` + U2) |
| 40 | Bare-kings draw for all variants | hyper4d.md open question 3; threecheck.md 3 and review item 7; chess960/threecheck status | VARIANT (+ generic reason text in U7) |
| 41 | Kriegspiel announcements stored on the history record (`announce`) | kriegspiel.md 3.5; status-research (kriegspiel) open question 1 | DO Q9 (`recordInfo`) + U9 |
| 42 | `hiddenStyle`, `umpire`, `ownView` flags and the UI leak fixes | kriegspiel.md 3, 6 leak checklist; darkchess.md 6 leak checklist; status-research open questions 2-3 | DO U10 |
| 43 | Undo off, opponent budget "?", no danger line, two-step hand-over in hidden games | darkchess.md D-8, D-11, D-13, D12; kriegspiel.md K-12, K-13, 6 | DO U10 |
| 44 | `squareView` guard for squares beyond `board.length` | multiverse-engines.md 9.7 | DO Q11 (bug fix) |
| 45 | Last-move marks for any move code | multiverse-engines.md 9.7 (`legalFromHistory`) | DO Q9 + U1 |
| 46 | Focus recentres only when it really changes | multiverse-engines.md 9.7, 10.6; multiverse-design-playable.md 6.8 | DO U2 |
| 47 | Defaults `maxPly` 1200, `quietPlies` 300 | multiverse-engines.md 9.1, 9.7 | REJECT (variant fields) |
| 48 | Layout extensions: board `kind`, `arrows`, `views`, viewer-aware `layoutOf` | multiverse-engines.md 0.10, 9.7, 10.1-10.5, 11.11 | REJECT (deferred) |
| 49 | `boardView` over history display cells (`views`) | multiverse-engines.md 9.7 | REJECT (deferred; Q11 makes it safe) |
| 50 | `aiCandidates(state)` pruning hook | multiverse-engines.md 9.8 | VARIANT (`aiView`) |
| 51 | Black's view without a 180 degree turn | multiverse-engines.md 9.7, 10.1 | VARIANT (`sides[1].rotate = 0`) |
| 52 | Skeleton invariant I-5D | multiverse.md 3.6.1 | VARIANT (tests) |
| 53 | Measuring costs a board's move | multiverse-engines.md 9.5 | VARIANT (via Q1) |
| 54 | Hint for a refused hill step | koth.md 6, open question 3 | REJECT |
| 55 | `options[i].describe(value)` and a game-info line | chess960.md 6 | DO U11 |
| 56 | Highlight the board whose seat is to move | bughouse.md 6 | VARIANT (`layoutOf` + `areas`) |
| 57 | "X is out" / "X cannot move and sits out" notes | fourplayer.md 6 | DO Q9, Q10 + U9 |
| 58 | Per-seat human or computer in the new-game dialog | fourplayer.md 6, open question 6 | REJECT (later) |
| 59 | Stacked two-board layout on phones | bughouse.md 6 | REJECT (zoom) |
| 60 | Repetition draws (also xiangqi's perpetual-check hook and shogi's sennichite) | crazyhouse.md 1; antichess.md, atomic.md, koth.md, darkchess.md reviews; xiangqi.md 3.2 (1), open question 1; shogi.md 3.2 (2) | REJECT (documented deviation; see section 4) |
| 61 | Placeholder `category` fields that differ from the catalogue | hyper4d, hexagonal, fourplayer status notes | VARIANT (module field) |
| 62 | "Missed is free" and "a missed world is kept unchanged" | multiverse-design-playable.md 4.11, 5.2 | kept: Q1's default is the identity |
| 63 | AI: forcing replies include game-ending moves (`mightCapture` → `mightForce`) | koth.md 8 "Core changes needed" 1, K18 | DO U14 |
| 64 | `layout.outlines` drawn above the cells (the hill outline) | koth.md 6, 8 "UI changes needed" 1 | DO U15 |
| 65 | Moving one part onto another part of the same piece joins it (no landing roll) | raumschach.md 4.10 ("core change C1"); docs/rules.md 2.1 | DO Q14 (bug fix) |
| 66 | Parts with different types ("faces") cannot merge | shogi.md 3.2 (1), test Q1 | DO Q13 |
| 67 | Hand order in the hands panel (`handOrder`) | crazyhouse.md 6 (its "U1"); shogi.md 3.2 (UI nice-to-have) | DO U16 |
| 68 | Drop codes upper-cased in the move list, optional `codeText(code)` | crazyhouse.md 6 (its "U3") | DO U17 |
| 69 | Full notations (shogi Hodges, xiangqi WXF), letter glyphs for xiangqi (`glyph.alt`) | shogi.md 3.2; xiangqi.md open questions 4, 5 | REJECT (later; they need the position, not only the code) |
| 70 | `V.statusText(state)` line under the board (makruk count) | makruk.md 3.1 item 1 | REJECT (later; the result text says why the game ended) |
| 71 | Per-state variant counter `state.vx` + `stateAfterHook` (makruk count start) | makruk.md 3.1 item 2 | REJECT (the spec's fallback: the count restarts after every capture) |
| 72 | Classic "your king cannot escape" loss and "draws wait while the king can be taken for certain" | docs/rules.md 5, 6; raumschach.md 2.6, 4.6; xiangqi.md open question 3 | REJECT (documented deviation in each spec) |
| 73 | Three-check `+` mark in the move list (`historyMark`) and `attacks(..., skip)` | threecheck.md 8.2 optional items 3, 4 | MERGED into Q9 + U9 (`recordInfo`, `infoText`) and W6 |
| 74 | A skipped turn (Q10) must expire per-ply bookkeeping like a missed one | D3 (review finding; fourplayer.md 2.5 en passant "next player only") | DO Q10 (skipped sides get `applyMiss` with `type: 'pass'`) |

---

## 2. The packages

Three packages with disjoint files, implemented in parallel. Section 3 lists the exact interfaces between them.

### 2.1 Package "quantum"

Files: `src/variants/core/quantum.js`, `src/variants/core/variant.js`, `src/variants/index.js` (the public API; the
new exports must reach the UI, which may only import `src/variants/index.js`). Tests:
`tests/js/variants/core-quantum.spec.js`.

**First step** (the ai-ui package imports these): implement `budgetInfo` (Q6) and `mustCapture` (Q5) with their final
signatures and add them to `src/variants/index.js` before the other items.

Test variants in this package must set or delete `applyMiss` and `unifyWorlds` explicitly
(`const spec = orthodoxSpec(); delete spec.applyMiss; delete spec.unifyWorlds`), because package "world" adds both
hooks to `orthodoxSpec()` at the same time (W4, W5).

#### Q1. Idle worlds and the `applyMiss` hook (D3; serves D2)

- **Signature**: `V.applyMiss(b, action, side, info) -> world` (optional).
  - `b`: a world in which the played action did not take effect (an **idle world**).
  - `action`: `{ type: 'move', code, key, sample }` (`sample` = the move of that key in `table().union`),
    `{ type: 'split', code, id, from: [f], to: [t1, t2] }`, `{ type: 'merge', code, id, from: [f1, f2], to: [t] }`,
    `{ type: 'measure', code, id, from: [s], to: [] }` (`id` = the piece X; a measured piece may stand on another
    square in each world, so a hook that needs "the board of the part" reads `b.sq[action.id]`) or
    `{ type: 'pass', code: null, from: [], to: [] }` (a turn skipped by Q10; `side` is then the skipped side).
  - `side`: the side whose turn it was (`state.turn`, or the skipped side for `pass`).
  - `info`: `{ hit }`. `hit` is true when at least one world of the same outcome branch (before the solid and game-end
    rolls) took the action; false for the worlds of a rolled Missed branch, for every world of a Measure and for a
    `pass`. (multiverse.md 3.6.2 asks for "some *surviving* world"; the hook must run before the solid roll, which
    depends on its result, so "before the rolls" is the only definable version. With a hook that builds the same
    structure in every world the two agree.)
  - Returns a world. It must not mutate `b`, and it returns `b` itself when nothing changes (keeps the generation
    cache and makes `dedupe` cheap).
- **Idle worlds** (today they are kept unchanged): (a) ordinary move: every world whose generator has no move with
  that key (`k: 'miss'`); (b) split: every world without X on `f`, and every child whose quiet move to `t1` / `t2` is
  not generated in that world; (c) merge: every world where neither part reaches `t` (`k: 'miss'`); (d) measure:
  every world.
- **Default** (no hook): idle worlds stay unchanged, exactly as today (the multiverse playable design relies on it).
- **Where**: mark the per-world entries with `idle: true` in `perWorldMove`, `splitBranches`, `mergeBranches` and
  `measureBranches`, and apply the hook with one helper (for example `idleApply(V, state, action, entries, hit)`):
  - `moveBranches` and `mergeBranches`: on the unrolled path apply it with `hit = true` **before** the budget-fallback
    check, so the check sees the final worlds; on the rolled path (measured, budget fallback, merge onto a possible
    enemy) apply it to the `miss` group with `hit = false` (the other groups have no idle worlds). When the fallback
    rolls, the `hit = true` results are thrown away and the hook runs again on the original idle worlds with
    `hit = false` (so it may be called twice for one world; it is pure, so that is safe). A key that gives the same
    result in every world (`keys.size === 1`) has no idle world;
  - `splitBranches`: `hit = true`, before the `dedupe` / `MAX_WORLDS` / budget / location checks;
  - `measureBranches`: every location group with `hit = false`;
  - `settle` (solid roll, game-end roll) and `stateAfter` see the worlds after the hook. It also runs in light mode
    (the computer player's search).
- **Needed by**: every orthodox-based variant through `orthodoxSpec().applyMiss` (W4: en passant expiry, D2);
  hexagonal, fourplayer, trid, capablanca (their own spec: `applyMiss: (b) => clearEnPassant(b)`); bughouse (a
  per-board version: clear only the en passant of the mover's board, which is why `side` is passed); multiverse (the
  missed worlds get the same new boards; `info.hit` is the 5D-lite `structural` flag; `action.type === 'measure'`
  lets measuring cost a board if the final design wants that).
- **Tests** (stub hook: return a clone with `x.idle = [...(b.x.idle ?? []), action.type + ':' + info.hit]`):
  - Q1-a pass = link: 2 worlds, White knight on f3 / h3 (kings e1, e8): `f3-e5` has one branch; the world with the
    knight on h3 has `x.idle` `['move:true']`, the other world has none.
  - Q1-b rolled Missed: 2 worlds, White pawn e2, Black knight on e3 (A) / a6 (B): `e2-e3` gives `miss` (A) and
    `move` (B); the `miss` branch's world has `['move:false']`, the `move` branch has no idle world.
  - Q1-c measure: on the Q1-a ghost, `?f3`: every world of both outcomes has `['measure:false']`.
  - Q1-d split with a blocked child: White rook a1, Black knight on a4 (A) / c6 (B): `a1-a3|a5` is legal; in A the
    `a5` child is idle (`['split:true']`), the `a3` child and both B children are not.
  - Q1-e the hook returning `b` keeps the world objects (`toBe`), and without the hook `outcomes` are exactly those of
    today for Q1-a and Q1-b.
  - Q1-f the budget fallback uses the worlds after the hook. Three worlds with White Ke1, Ra1 and Black Ke8 plus a
    Black knight on a4 (A1), a3 (A2) or c6 (B), and `budgetRule: () => ({ limit: 2 })` (Q6, same package): without
    the hook `a1-a6` is one unrolled branch (White arrangements: rook a1 in A1 and A2, a6 in B = 2). With a stub hook
    that, for `hit = true`, adds a White bishop on the square above the Black knight in idle worlds (a5 in A1, a4 in
    A2), White has 3 arrangements, so the move is rolled (`miss` 2/3, `move` 1/3) and the `miss` branch holds the
    worlds of the `hit = false` call (no bishop).
  - Q1-g Q10's skipped turn: see Q10.
  - All test positions of this package include both kings (e1, e8) unless a test says otherwise: a world without
    royal pieces ends the game (`worldResult` gives `{ winner: null, reason: 'king' }`).

#### Q2. Certain moves: castling and en passant never roll (D1, D2)

- **Move field**: a ClassicalMove may carry `certain: boolean`. A move is certain when
  `m.certain ?? (m.kind === 'castle' || m.kind === 'ep')`.
- **Rule**: a key is *certain-only* when the move generated for it is certain in at least one world. A certain-only
  key is legal only when **every** world of the state generates that key **and** the move generated for it is
  certain in every world. (Strict version, review: trid.md 8.1 item 9 and the multiverse use the king's move as the
  castling key, so one key could be castling in one world and an ordinary king move or capture in another: "one key,
  two meanings". Such a key is illegal. With the rights unified by Q3/W5 the case cannot arise for `x.castle`
  castling, so the strict and the loose version agree on orthodox play: on the review prototype they gave identical
  move lists and states over 60 seeded random games, 6,215 plies, `handoff/tmp/plan-review/strictloose.mjs`.) The move is then played in every world by the usual per-world rules: for castling and en
  passant every world gives the same result (all `move`, all `capture`), so there is no landing roll, no link and no
  budget change. The solid roll and the game-end roll still apply after it, as after any move.
- **Where**: `table(V, state)`: while building `union`, note for every key whether some world generates a certain
  move for it; then delete every certain-only key that is missing from some `gens[i]` or that some `gens[i]`
  generates as a non-certain move. `gens` (the cached per-world maps) are never changed. Everything that reads the
  union follows automatically: `ordinaryMoves`, `legalMoves`, `perWorldMove` and `branches` (null, so illegal),
  `isLegal`, `hasLegalMove`, the computer player and the UI targets. `royalDanger`, `reachable` and variant
  `visibility` read `generate` directly and are unchanged.
- **Split and merge**: `quietTargets`, `mergesFrom` and the `find` of `mergeBranches` skip certain moves (today they
  skip `kind === 'castle'`; use one exported helper `isCertain(m) = m.certain ?? (m.kind === 'castle' ||
  m.kind === 'ep')`), so an opted-in certain move of a splittable piece never becomes a split or merge path. The
  multiverse design's pinned behaviour "not `castle`" (multiverse-design-playable.md 4.11) still holds.
- **Default**: kinds `castle` and `ep` are certain (bug fix, D1 and D2). A variant opts out per move with
  `certain: false` or opts in any other kind with `certain: true`. Castling keys may be words (`O-O`, `O-O-O`) or the
  king's move (trid, multiverse); the strict rule above makes both safe.
- **Cost**: one flag per union key while the union is built, and one lookup per world for the (few) certain keys.
- **Needed by**: every variant with castling or en passant: the orthodox-based ones, chess960, crazyhouse, bughouse,
  fourplayer, hexagonal (en passant), trid, capablanca, multiverse (board-only castling and en passant).
- **Tests**:
  - Q2-a castling blocked by a ghost: right K (e1, h1, g1, f1); world A has a White knight on g1, world B on e3:
    `O-O` is not in `legalMoves` and `branches` is null (today: miss 0.5 / move 0.5).
  - Q2-b castling certain: the same with the knight on e3 / c3 (never on f1 or g1): `O-O` has one outcome `move`,
    p 1, `rolled: false`.
  - Q2-c en passant: White pawn e5, Black pawn d5, `x.ep = d6`, `x.epVictim = d5` in world A only (a hand-built stale
    square; the worlds differ by a knight ghost): `e5-d6` is illegal; with the square set in both worlds it has one
    outcome `capture`, p 1.
  - Q2-d opt-out: a test variant whose `extraMoves` emits a `kind: 'castle'` move with `certain: false` available in
    one of two worlds: rolled as today.
  - Q2-e opt-in: a `kind: 'special'` move with `certain: true` available in one of two worlds is illegal.
  - Q2-f one key, two meanings: a test variant whose `extraMoves` emits a swap castling
    `{ key: 'e1-f1', kind: 'castle', extra: { rook: { id, to: e1 }, kingTo: f1 } }` when a White rook stands on f1.
    World A: Ke1, Rf1 (castling `e1-f1` only; the king cannot step onto its own rook); world B: Ke1, Rh1 (the
    ordinary king step `e1-f1` only). `e1-f1` is illegal (today, and under the loose rule, it is legal with one
    unrolled `move`: a swap in A and a king step in B; `handoff/tmp/plan-review/q2fg.mjs`). With the rook on f1 in both
    worlds it has one outcome `move`, p 1.
  - Q2-g a certain move is never a split path: a test variant whose `extraMoves` adds a quiet `certain: true` move of
    the knight from g1 to g3 (key `g1>g3`, kind `special`; not a knight jump, so no ordinary move has that target);
    White Ka1, Ng1, Black Ka8: `splitTargets(g1)` is exactly e2, f3, h3 (today it also contains g3).

#### Q3. `unifyWorlds` hook: state-level facts identical in every world (D1)

- **Signature**: `V.unifyWorlds(bs, mover) -> bs` (optional). `bs` = the worlds of the chosen branch (an array of
  world objects), `mover` = the side that just moved. Returns an array of the same length and order; an entry may be
  the same object (unchanged) or a new world. It must not mutate, and it may only change bookkeeping that neither
  `solidKey` nor `worldResult` reads (it runs after the rolls).
- **Where**: first step of `stateAfter`, before `dedupe`, rescaling and sorting (worlds that become identical merge).
  Also in light mode.
- **Default**: none (worlds unchanged).
- **Needed by**: every variant with castling rights (the orthodox implementation is W5: a right is kept only if every
  world still has it, which is exactly "lost as soon as the king or that rook is not 100 % on its start square");
  trid (state-level castling flags); bughouse, fourplayer, capablanca, chess960 via the orthodox helper.
- **Tests**:
  - Q3-a merge after unify: 2 worlds identical except `x.tag` `'a'` / `'b'`; a stub that sets `x.tag = 'z'` in every
    world: after any certain move the state has 1 world with weight T.
  - Q3-b only the chosen branch: a rolled move (Q1-b position); a spy records `bs.length` and the side: the hook is
    called once per `stateAfter` with the worlds of that branch only, and with `mover` 0.
  - Q3-c without the hook, `stateAfter` is unchanged (existing tests).

#### Q4. Outcome labels and notes after the settling rolls (D5)

- In `settle`, when the solid roll or the game-end roll splits a branch, each part gets:
  - parent key `miss`, `move` or `capture`: the key recomputed from its own worlds (`capture` if a world has
    `k: 'capture'`, else `move` if a world has `k: 'move'`, else `miss`) and `captures` recomputed from its own worlds;
  - parent key `split`: `miss` when every world of the part is idle (Q1), else `split`;
  - other keys (a measured square, `gone`): unchanged. `rolled: true` as today.
- **Notes**: the solid-roll note becomes `'solid:' + (V.solidExtra ? V.solidExtra(b) : '')` for a world `b` of the
  part (no more full solid keys in saved games); the game-end note stays `'end:' + JSON.stringify(result)`. Two parts
  that differ only in solid pieces (not in `solidExtra`) now carry the same note `solid:…`; notes are display only
  (replays use the outcome index), so that is fine. A variant's `noteText` should match the end of the note (for
  example three-check's `/checks:(\d+):(\d+)$/`), which reads both the old and the new format.
- Branch order, weights and the number of branches do not change, so records replayed by outcome index (undo) are
  unaffected.
- **Needed by**: threecheck (T6), atomic, multiverse (short notes), every variant whose unrolled move can trigger a
  solid roll through `solidExtra`.
- **Tests**:
  - Q4-a a test variant with `solidExtra: (b) => 'e5:' + (b.board[e5] >= 0)`; 2 worlds, White knight on f3 / h3:
    `outcomes('f3-e5')` = `[{ key: 'move', notes: ['solid:e5:true'], p: 0.5 }, { key: 'miss', notes:
    ['solid:e5:false'], p: 0.5 }]` in state order (today: both `move`, notes with the whole solid key).
  - Q4-b a split part made only of idle worlds is `miss`: a variant whose `afterMove` counts moves in `x.n` and whose
    `solidExtra` is `'n' + (x.n ?? 0)`; knight ghost f3 / h3; `f3-e5|g5`: the part of the h3 worlds is `miss`, the
    other `split`.
  - Q4-c the existing game-end test (`'outpost'` in an `end:` note) and the pawn-capture roll (notes `[]`) pass
    unchanged.

#### Q5. Compulsory capture over the whole state

- **Flag**: `V.compulsoryCapture: true` (default false; `defineVariant` fills in false).
- `table()` also collects `captureKeys`: the keys of the (Q2-filtered) union whose move captures (`m.capture >= 0`) in
  at least one world.
- **New export** `mustCapture(V, state) -> boolean` =
  `Boolean(V.compulsoryCapture) && !state.result && table(V, state).captureKeys.size > 0`.
- When `mustCapture`: `ordinaryMoves` keeps only `captureKeys`; `splitTargets` returns `[]`; `mergesFrom` keeps only
  merges whose `branches` contain a capture; `legalMoves` offers no measure; `branches` returns null for a split, a
  measure, a move key outside `captureKeys` and a merge without a capturing branch. `hasLegalMove` needs no change.
- **Needed by**: antichess (together with its per-world `filterMoves`).
- **Tests**:
  - Q5-a test variant `orthodoxSpec({ royalKing: false })` + `filterMoves` (captures only when a capture exists) +
    `compulsoryCapture: true`; worlds A `{ h1: '0:k', a1: '0:r', c2: '0:p', h8: '1:k', a8: '1:n' }` and B (the same with
    the knight on c6): `legalMoves` = `['a1-a8']`, outcomes `move` 0.5 (B) / `capture` 0.5 (A), `mustCapture` true,
    `branches('c2-c3')` null, `splitsFrom(a1)` `[]`.
  - Q5-b the same without `compulsoryCapture`: `c2-c3` legal (today's behaviour), `mustCapture` false.
  - Q5-c with a White ghost present, its measure is not offered while a capture is compulsory; a merge onto an enemy
    stays legal, a quiet merge does not.

#### Q6. Budget rule: team budgets and per-player limits

- **Signature**: `V.budgetRule(b, side) -> { sides?: number[], limit?: number }` (optional), evaluated on
  `state.worlds[0].b` (kings and structure are certain there). Defaults: `sides: [side]`, `limit: BUDGET` (8).
- The budget used = the number of distinct arrangements of the pieces of all `sides` together over the worlds. With
  more than one side in `sides`, each piece's part of the arrangement key must include its side
  (`sq + ':' + sd + ty`): today's key (`sq + ty`) cannot tell a partner's hand knight from one's own (both `-2n`).
  With `sides: [side]` keep today's key, so `budgetOf` / `budget` do not change.
- **Where**: every comparison with `BUDGET` for the mover: the pass = link fallback in `moveBranches` and
  `mergeBranches`, and the legality check in `splitBranches` (rule of `state.turn`).
- **New export** `budgetInfo(V, state, side) -> { used, limit, sides }` for the UI and for fuzz invariants.
  `budget(state, side)` and `budgetOf(worlds, side)` keep their meaning (one side, no variant) for compatibility.
- **Needed by**: bughouse (`{ sides: [side, (side + 2) % 4], limit: 8 }`), fourplayer (FFA `{ limit: 2 | 4 | 8 }` by the
  number of kings left; Teams `{ limit: 2 }`, or a shared team budget if the lead prefers). The rule must never
  lower a limit during a game (fourplayer's only grows as kings fall), otherwise `used <= limit` (IT8) can break and
  every pass = link move of that side is rolled; a variant that needs a shrinking limit must say so in its spec.
- `budgetRule` is called once per `branches` call of a move, merge or split (the AI calls `branches` for up to 15
  split pairs per piece, U4); it must be cheap (read `b.x` or count kings, no generation).
- **Tests**:
  - Q6-a limit 1: White rook a1, Black knight on a4 (A) / c6 (B): with `budgetRule: () => ({ limit: 1 })`, `a1-a8` is
    rolled (`miss` 0.5, `move` 0.5); without the rule it is one unrolled `move` branch (today).
  - Q6-b team: `budgetRule: () => ({ sides: [0, 1], limit: 2 })` from the start: `g1-f3|h3` is legal, then Black's
    `g8-f6|h6` is illegal (legal without the rule); `budgetInfo(V, s, 1)` = `{ used: 2, limit: 2, sides: [0, 1] }`.
  - Q6-c default: `budgetInfo(V, newGame(V), 0)` = `{ used: 1, limit: 8, sides: [0] }`.

#### Q7. King danger counts every loss of a royal piece

- `royalDanger`: an enemy move `m` in world `b` counts when it captures a royal piece of `side` (as today), or when
  `m.capture >= 0`, `side` has a royal piece in `b` and has none after `applyClassical(V, b, m)`. Only capturing moves
  are tried; weights are summed per key as today. No new hook (a `royalLoss` hook would only be a speed-up).
- **Converging captures** (bug fix, docs/rules.md 5: "This counts converging captures"; raumschach.md RQ9): for each
  enemy `e`, with `se = state.turn === e ? state : { ...state, turn: e }` (a new object, because the move table is
  cached per state object; generation is cached per world, so this costs no new `generate`), every merge of `e` whose
  target may hold a royal piece of `side` counts too: its danger is the weight of the worlds in which the merge move
  (from either part) captures a royal piece of `side` or, as above, leaves `side` without one. Factor the per-world
  part of `mergeBranches` out as `perWorldMerge(V, state, mv)` (entries with the move `m` of each world) and use it
  here, so the merge rules (same piece, reachable, not friendly) are shared. Merges are found with `mergesFrom` on
  the superposed pieces of `e`; only merges whose target holds a royal piece of `side` in some world are evaluated.
- **Cost** (measured on the review prototype, `handoff/tmp/plan-review/q7perf.mjs`): 0.1-0.2 ms for 16 orthodox
  worlds, the same order as today; captures are few. It runs only in the UI (the ring) and in kriegspiel's
  announcement, never in the AI search.
- **Needed by**: atomic (explosions); raumschach and every variant with ghosts (converging captures); kriegspiel's
  check announcement uses `royalDanger` too.
- **Tests**:
  - Q7-a mini-atomic test variant (`afterMove` removes the capturer and every non-pawn piece next to the capture
    square): `{ e1: '0:k', d2: '0:n', e8: '1:k', d8: '1:r' }`, Black to move: `royalDanger(V, s, 0)` = 1 (today 0).
  - Q7-b the same with the rook on d8 (A) / h8 (B): 0.5.
  - Q7-c the existing danger test (1 and 0) and a variant without royal types (0) are unchanged.
  - Q7-d converging capture: worlds `{ a1: '0:k', d4: '0:q', h8: '1:k' }` and the same with the queen on h5 (one
    queen id), Black to move: `royalDanger(V, s, 1)` = 1 (today 0.5); with White to move it is 1 too. With a third
    world where the queen is on a2 (cannot reach h8): 2/3 (today 1/3; `d4|h5-h8` has outcomes miss 1/3, capture 2/3,
    checked in `handoff/tmp/plan-review/q7d.mjs`).

#### Q8. The quiet-move counter

- **Type flag** `resetsQuiet` (default `solid && !royal`, today's rule). `defineVariant` computes
  `V.quietTypes = new Set(types whose resetsQuiet ?? (solid && !royal) is true)`.
- **Rule** (bug fix, docs/rules.md 6): `stateAfter` resets `quiet` to 0 only when the move really happened: the chosen
  branch captured something, or a non-idle world of the branch applied a drop or a classical move whose mover type
  (the type of the piece on `m.from` in that world before the move, as today's code reads it; not `b.ty[m.id]`:
  the multiverse's travel moves carry `id: -1`) is in `V.quietTypes`. Missed attempts, failed captures, measures,
  and splits and merges of types outside `quietTypes` add 1.
- **Where**: every per-world entry that applies a classical move gets `rq: true` under that test: `perWorldMove`
  (hit entries), the moved children of `splitBranches` and the hit entries of `mergeBranches` (with the default flag
  splittable types are never in `quietTypes`, so splits and merges add 1 exactly as the sentence above says, but a
  variant that declares a splittable type with `resetsQuiet: true` gets consistent behaviour). `stateAfter` uses
  `branch.captures.length > 0 || branch.worlds.some((e) => e.rq)` instead of today's sample-based test. Q1's hook
  keeps the entry flags (it replaces only `b`).
- **Needed by**: antichess (`k: { resetsQuiet: false }`), every variant (missed pawn pushes), crazyhouse and bughouse
  (drops that happened), horde, xiangqi (optional `resetsQuiet: false` on the soldier, WXF), makruk.
- **Tests**: Q8-a two worlds (Black knight on e3 / a6), `quiet: 7`, `e2-e3`: the `miss` branch gives 8, the `move`
  branch 0 (today both 0). Q8-b a non-royal king with `resetsQuiet: false`: a king move gives `quiet + 1`. Q8-c a
  capture resets; a pass = link rook move adds 1.

#### Q9. History record: squares and variant info

- Every history record (not in light mode) gets `from: number[]` and `to: number[]`: a move gives `[sample.from]` and
  `[sample.to]` of the union sample (each only if >= 0; castling: the king's square and the move's `to`); a split
  `[f]`, `[t1, t2]`; a merge `[f1, f2]`, `[t]`; a measure `[s]`, `[]`.
- **Hook** `V.recordInfo(prev, code, branch, next) -> object | null` (optional, JSON data only), called at the end of
  `stateAfter` when not light, after the result and Q10 are settled. A non-null value is stored as `record.info`.
  So `next.turn` is the side really to move and the record (`next.history.at(-1)`) already has `skipped`;
  `branch.worlds` are the worlds before `unifyWorlds`.
- **Needed by**: the UI's last-move marks for every code (multiverse keys, U1); kriegspiel's umpire announcements
  (`info.announce`); fourplayer ("Blue is out"); threecheck ("+" after a check).
- **Tests**: Q9-a `from` / `to` after `e2-e4`, `g1-f3|h3`, a merge, a measure and `O-O` (e1, g1). Q9-b a stub
  `recordInfo` is stored; it is not called by `stateAfter(..., { light: true })`; `null` stores no `info` field.

#### Q10. A side that cannot move sits out (`passWhenStuck`)

- **Field**: `V.passWhenStuck`: `true`, or a function `(state) -> boolean` evaluated on the new state (default
  false). The function form is required by fourplayer (3.4 hook 2 as revised, S1): FFA sits out
  (`(s) => !s.worlds[0].b.x.teams`), Teams keeps the `noMoves` draw.
- In `stateAfter` (not light), when there is no result, the side to move has no legal move and `passWhenStuck` holds:
  probe the next sides in turn order (`nextSide` on the first world), with a new state object per probe (the move
  table is cached per state object), and stop when the probe comes back to the stuck side. The first side with a
  legal move gets the turn, and the record gets `skipped: [the sides passed over]`. If no side can move, `noMoves`
  applies as today.
- **A skipped turn is an idle turn** (D3, review): each skipped side's turn passes every world through Q1's hook
  (`V.applyMiss(b, { type: 'pass', code: null, from: [], to: [] }, skipped, { hit: false })`), in turn order, before
  the next probe; the worlds are then deduplicated, rescaled and sorted as at the start of `stateAfter` (use the same
  helper). Otherwise a one-ply right such as fourplayer's en passant ("next player only") would survive into the turn
  after a skipped player. Without `applyMiss` nothing changes. `ply` counts moves played, so it is not increased for a
  skipped side. The probe of the next side uses the worlds after the previous side's pass. If no side can move, the
  state as it was before the first pass gets the `noMoves` result, as today.
- **Needed by**: fourplayer (S1), bughouse (the reviewer: "the seat passes" is more faithful than a draw).
- **Tests**: a toy variant on `rectTopology(4, 1)`: side 0 has a solid `k` (`leap [[1, 0], [-1, 0]]`) on a1, side 1 a
  solid `w` without moves on d1, no royal types. After `a1-b1`: with the flag, `turn` 0, `result` null, last record
  `skipped: [1]`; with `passWhenStuck: () => false` and without the field, `{ winner: null, reason: 'noMoves' }`
  (checked on today's core, `handoff/tmp/plan-review/q10.mjs`). With a stub `applyMiss` that counts `type: 'pass'`
  calls in `x.passes`: every world of the new state has `x.passes === 1`, and the stub saw side 1.

#### Q11. `squareView` guard (bug fix)

- `squareView` skips an id that is not a number >= 0 (`if (!(id >= 0)) continue`), so squares beyond
  `board.length` (layout display cells) are empty.
- **Test**: `squareView(s, V.topology.size + 5)` = `[]`; `boardView(s, size + 10)` ends with empty entries.

#### Q12. Public API and declaration defaults

- `src/variants/index.js` also exports `budgetInfo` and `mustCapture`.
- `variant.js`: fills in `compulsoryCapture: false`, `passWhenStuck: false`, computes `quietTypes`, and its header
  lists the new optional hooks (`applyMiss`, `unifyWorlds`, `budgetRule`, `recordInfo`, `compulsoryCapture`,
  `passWhenStuck` (boolean or function), the type flag `resetsQuiet`, the move field `certain`). The `certain` field
  is also added to the `ClassicalMove` typedef in `world.js`, but by package "world" (W1), so that only one package
  edits `world.js`.

#### Q13. Parts with different faces cannot merge (shogi.md 3.2 (1))

- In `mergeBranches` return null, and in `mergesFrom` skip the pair, when piece X has more than one type over the
  worlds where it stands on `f1` or `f2` (shogi's exact `facesOf` helper). Measure is still offered.
- Why generic: promotion per possibility (shogi, any variant whose splittable pieces promote) can give one piece
  different types in different worlds; merged onto one square it becomes a piece with two faces that Measure cannot
  settle (Measure settles only where a piece is). No orthodox-based variant is affected (pawns are solid, so their
  promotion is certain). In the multiverse design a rook's "never moved" state is its type (`r0` / `r`); a merge of
  an `r0` part with an `r` part is then refused, which is harmless (castling with it would need the rook `r0` in
  every world anyway, Q2).
- Q14's join is limited the same way (same id **and** same type), so an ordinary move cannot make two faces either.
- **Tests**: shogi's Q1 shape on a test variant with a splittable type `s` that may promote to `+s`
  (`promote.optional`): after the promotion in one part, the merge of the two parts is not in `mergesFrom` and
  `branches` is null; `?` measure is still legal; a merge of two same-type parts still works (existing test).

#### Q14. A part that moves onto another part of the same piece joins it (bug fix, docs/rules.md 2.1)

- Today `isMeasured` treats the piece's own other part on the target as "another piece", so `f3-e5` for a knight
  50 % f3 / 50 % e5 is rolled (miss 0.5 / move 0.5; verified). docs/rules.md 2.1: "You may also move one part onto
  another part of the same piece. The part joins it wherever its path is clear." raumschach.md 4.10 ("core change
  C1") reports it.
- Change: in `isMeasured`, let `self` be the piece id that makes the move in **every** world that generates the key
  (from `table(V, state).gens`; −1 when two worlds move different ids); an occupant of the target that is `self` and
  has the same type as the mover is not "another piece". Everything else is unchanged: a world where another piece
  might be on the target still makes the move a landing roll, a solid mover is still measured, and the budget
  fallback still applies.
- Effect: the worlds where the part moved and the worlds where it already stood there become identical and merge in
  `stateAfter`, so "if the piece had only those two parts and nothing can block the path, the piece is solid again".
- **Tests** (prototyped in `handoff/tmp/plan-review/q14.mjs`): knight 50 % f3 / 50 % e5, `f3-e5`: one outcome `move`,
  p 1, not rolled, one world after it (today miss 0.5 / move 0.5); three parts f3 / e5 / a4: one unrolled branch, the
  knight 2/3 e5 and 1/3 a4; with a Black bishop on e5 in a third world, still rolled (miss / move / capture, 1/3
  each).

### 2.2 Package "world"

Files: `src/variants/core/world.js`, `src/variants/core/orthodox.js`, `src/variants/core/orthodoxVariant.js`,
`src/variants/core/topology.js` (no change planned). Tests: `tests/js/variants/core-world.spec.js`.

#### W1. Castling placement in `applyClassical` (D4, bug fix)

- For a move with `extra.rook`: `kingTo = m.extra.kingTo ?? m.to`. Lift the king and the rook off the board first,
  then place the king on `kingTo` and the rook on `extra.rook.to`; throw if either target holds another piece. This
  covers king onto rook (`to` = the rook's square), swap, king stays, rook stays and orthodox castling.
- **Needed by**: chess960 (and any variant whose king may stay or swap: trid's king-rook swap, capablanca).
- **JSDoc** (package "world" owns `world.js`): the `ClassicalMove` typedef says that for `kind: 'castle'` `to` is the
  square the player clicks and `extra.kingTo` the king's destination (chess960.md 3 fix 1), and gains
  `@property {boolean} [certain]` (Q2's field: "legal only when generated, as a certain move, in every world";
  default true for kinds `castle` and `ep`).
- **Tests**: with rights from `castlingRights`: Ra1 Kg1 Rh1 `O-O` gives Kg1 Rf1 (today Kh1 Rf1); Kf1 Rg1 `O-O` gives
  Kg1 Rf1 (swap); Kd1 Rc1 `O-O-O` gives Kc1 Rd1 (swap); Ra1 Kc1 `O-O-O` gives Kc1 Rd1 (king stays); Ke1 Rd1 `O-O-O`
  gives Kc1 Rd1 (rook stays); orthodox e1/h1 and e1/a1 unchanged.

#### W2. `castlingMoves(V, w, side, opts = {})` with `opts.toRook`

- `toRook: true` sets `to: c.rook` on every castling move (`extra.kingTo` unchanged). Default unchanged
  (`to: c.kingTo === c.king ? c.rook : c.kingTo`). Keys stay `O-O` / `O-O-O`; the kind stays `castle` (Q2 relies on it).
- **Needed by**: chess960 (the king is moved onto its rook in the UI; `useVariantGame` already matches `from`/`to`).
- **Test**: every castling move has `to === c.rook` with the option and today's `to` without it.

#### W3. Orthodox helpers for more boards (backwards compatible)

- `between(topo, a, b)`: the squares strictly between two squares on one straight line in any number of coordinates
  (unit step = the sign of each coordinate difference; `[]` when not on a line), so `castlingMoves` works along a
  file and on multi-board topologies.
- `castlingRights(V, w, opts)`: builds squares with the king's other coordinates kept
  (`[f, kr, ...coords[ks].slice(2)]`), so it works on bughouse's `[file, rank, board]` topology. The rook filter
  must then compare every coordinate except the file with the king's (today it compares only the rank), otherwise a
  rook on the same rank of another board is taken as the castling rook.
- `orthodoxAfterMove`: the en passant square is the midpoint of `from` and `to` in every coordinate (same result for
  vertical double steps; right for fourplayer's horizontal ones, hexagonal's doubled coordinates, extra coordinates).
- `pawnExtras(V, w, side, canDouble, opts)`: the fifth argument may be the pawn type (today) or an object
  `{ pawn = 'p', forward = [0, 1], captures = [[1, 1], [-1, 1]] }` (vectors for side 0, turned with `V.orient`).
  Moves keep kinds `double` and `ep`.
- **Needed by**: bughouse (three coordinates), fourplayer (castling along a file, horizontal double steps),
  hexagonal (hex vectors), capablanca (wider board: already works).
- **Tests**: castling along a file on a custom topology; `castlingRights` on a two-board `[f, r, board]` topology,
  with a two-sided setup on board 1, returns rights whose `king`, `rook`, `kingTo` and `rookTo` all lie on board 1
  (it still builds rights for sides 0 and 1 only; bughouse builds its 8 seat rights from its own table); the en
  passant square of a horizontal double step and of a 3-coordinate one; `pawnExtras` with custom vectors; the
  orthodox start still has 20 moves and the existing core tests pass.

#### W4. En passant expiry for orthodox variants (D2, with Q1)

- **Export** `clearEnPassant(b) -> world`: returns `b` itself when `x.ep` and `x.epVictim` are both -1 or absent;
  otherwise a copy with both -1 (never mutates).
- `orthodoxSpec()` gains `applyMiss(b) { return clearEnPassant(b) }` (the Q1 signature; the other arguments are
  ignored).
- **Needed by**: all variants built on `orthodoxSpec()`; hexagonal, fourplayer, trid, capablanca add
  `applyMiss: (b) => clearEnPassant(b)` to their own spec; bughouse writes a per-board version.
- **Tests**: pure-function tests (same object when nothing to clear, a cleared copy otherwise, input unchanged);
  `orthodoxSpec().applyMiss` exists.

#### W5. Castling rights follow the state (D1, with Q3)

- **Export** `unifyCastling(bs) -> bs`: keeps in every world only the rights (entries of `x.castle`, compared by
  `flag`, `side`, `king`, `rook`, `kingTo`, `rookTo`) present in every world; a world without `x.castle` has no rights.
  Returns the input array (same objects) when all worlds already agree; copies only the worlds whose rights change.
- `orthodoxSpec()` gains `unifyWorlds(bs) { return unifyCastling(bs) }`.
- **Needed by**: every variant with castling (the orthodox-based ones, chess960, crazyhouse, bughouse, fourplayer,
  capablanca, trid if it uses the `x.castle` array shape).
- **Tests**: intersection over three worlds; the identity fast path returns the same array; order kept; input not
  mutated; `orthodoxSpec().unifyWorlds` exists.

#### W6. `attacks(V, w, side, target, opts = {})` with `opts.royal === false`

- Skips attackers of a royal type. `givesCheck(V, w, side, victim, opts)` passes `opts` on.
- **Needed by**: threecheck (a check is given by a piece other than the king); atomic's optional king-safety term.
- **Test**: a king next to the enemy king attacks it by default and not with `{ royal: false }`; a rook still does.

#### W7. Board options on `orthodoxSpec`

- `orthodoxSpec({ back, royalKing, promoteTo, boardOpts })`: `boardOpts` goes to `standardBoard(8, 8, boardOpts)`
  (`shade`, `layout`, ...; `rectTopology` spreads `opts.layout` into the layout).
- **Needed by**: koth (hill shading without replacing `topology` afterwards; the hill outline also needs U15, because
  `layout.lines` are drawn under the opaque cells, koth.md 8 item 10).
- **Test**: a `shade` option shows up in the cells; `lastRank`, the setup and the 20 start moves are unchanged.

### 2.3 Package "ai-ui"

Files: `src/variants/core/ai.js`, `src/variantplay/**` (including `texts.js`, `glyphs.js`,
`components/VariantBoard.vue`, `components/VariantPiece.vue`, `composables/useVariantGame.js`; new helper modules may
be added here), `src/views/VariantsView.vue`, `src/views/VariantGameView.vue`. Tests:
`tests/js/variants/core-ai-ui.spec.js`. Pure helpers are easier to test than the composable: move logic that needs
tests into small modules under `src/variantplay/`. Component tests (U2, U10(c), U13, U15) need
`// @vitest-environment happy-dom` in the file header, as `tests/js/variants/VariantBoard.vue.spec.js` does; put them
in a separate file (`core-ai-ui.vue.spec.js`) so the pure tests keep the fast node environment.

#### U1. Last-move marks for every move code

- The marks use the record's `from` / `to` (Q9) when present, else today's parsing (games saved before the change).
  Put it in a pure helper, for example `lastMoveSquares(V, record)` in `src/variantplay/marks.js`. The hidden-variant
  rule (no marks for the opponent's move) is unchanged.
- **Needed by**: multiverse (keys such as `(0T5)b1>>(0T3)b3`), every variant with drops or special keys.
- **Tests**: a record with `from`/`to` gives those squares; a legacy record `e2-e4` still gives e2, e4; `n@f3` gives
  f3; an unparsable legacy code gives nothing and does not throw.

#### U2. Focus recentres only when it changes

- `VariantBoard.vue` watches a key: `focus ? (focus.key ?? JSON.stringify([focus.x, focus.y, focus.zoom])) : null`,
  and recentres (immediately on mount, then only when the key changes).
- **Needed by**: multiverse (`layoutOf` returns a new focus object on every state), hyper4d (start zoomed on the home
  boards through `layout.focus`).
- **Test**: mount with a `layoutOf` that returns an equal but new focus object per state; after a zoom change, a new
  state keeps the view box; a focus with another `key` recentres.

#### U3. AI reply side (multi-move turns, four seats)

- **Hook** `V.replySide(s, me) -> number | null` (optional; `s` = the state after my move). Default `s.turn`.
  - `null`: no reply search (`evaluateState`).
  - a side other than `s.turn`: search that side's replies in `{ ...s, turn: side }`.
  - `me` (multi-move turns, for example the multiverse before Submit): my best continuation, which is today's code
    path when `s.turn === me`; keep it and document it.
- **Needed by**: bughouse (`(s, me) => 3 - me`, the opponent on the same board), multiverse (default), fourplayer
  (optional).
- **Tests**: orthodox `{ e1: '0:k', d1: '0:q', e8: '1:k', d8: '1:r', d5: '1:p' }`, level normal, `rng: () => 0.5`: the
  default still plays `e1-f1`, exactly as today (it avoids `d1-d5` because the rook takes back; checked with
  `handoff/tmp/core-architect/probe3.mjs`: easy plays `d1-d5`, normal and hard `e1-f1`); with `replySide: () => null`
  normal plays `d1-d5`.

#### U4. AI split candidates on large boards

- For each splittable piece, take at most 6 split targets, ranked by `worldValue` of the first world where the piece
  stands on `f` after its quiet move to that target, pair them (at most 15 pairs), keep the legal pairs (`branches`),
  at most 6 per piece. Ties are broken with the search's `rng`, **not by square**: `worldValue` is material plus
  `V.evaluate`, so a quiet move changes nothing in every variant without `evaluate` and a square order would always
  pick the 6 lowest squares (for White, the squares towards its own back rank). Export it for tests as
  `aiSplits(V, state, f, rng, max = 6) -> string[]`. The split list for humans (`splitsFrom`) stays complete.
- **Needed by**: raumschach (up to 1,326 pairs), hexagonal (861), hyper4d, trid, capablanca.
- **Test**: an orthodox queen alone on d4 (27 targets, 351 splits today): `aiSplits` returns at most 6 legal codes that
  use at most 6 distinct targets; the same seed gives the same codes, and over seeds 1-5 more than 6 distinct targets
  appear (so the choice is not the 6 lowest squares); `chooseMove` still takes a free queen (existing test).

#### U5. Budget pips from `budgetInfo`

- Pips = `limit`, filled = `used`, tooltip "Quantum budget: {used} of {max}" with `max = limit`; partners with the
  same `sides` show the same number. In hidden-information variants every side except the viewer shows "?" while the
  game runs.
- **Needed by**: bughouse (team budget), fourplayer (limit 2 / 4 / 8), darkchess and kriegspiel ("?").

#### U6. `V.sideInfo(state, side, viewer) -> { text, title } | null`

- Rendered in the player row between the name and the pips (text visible, `title` as tooltip).
- **Needed by**: threecheck ("2/3" checks), antichess and horde (piece counters).

#### U7. Texts

- `noteText(V, note)`: calls `V.noteText(note)` first (optional hook; a non-null string wins), then today's texts
  (`solid:` prefix, `end:` prefix).
- `outcomeText(key, code)`: for a drop code (contains `@`), `move` reads "Dropped" and `miss` reads "Missed: the
  square was taken". Call sites pass the code.
- `reasonText`: a generic `bareKings` text, "only the two kings are left" (atomic, threecheck, hyper4d, chess960 use
  that reason code).
- `sharedRules()`: one more sentence: castling and en passant are only possible when they are possible in every
  possibility, and they are never rolled.
- **Needed by**: threecheck, fourplayer (`noteText`); crazyhouse, bughouse (drops); atomic, threecheck, hyper4d
  (`bareKings`); every orthodox variant (castling sentence).

#### U8. Compulsory capture in the UI

- When `mustCapture(V, state)`: the status line says "You must capture: only moves that might capture are allowed.",
  and the Split and Measure buttons are disabled with the tooltip "Not now: a capture is compulsory." Merge stays
  (capturing merges are allowed).
- **Needed by**: antichess.

#### U9. Record info in the move list

- `V.infoText(record, viewer) -> string[] | null` (optional): lines shown under that move in the move list and in the
  last-move / roll box. A record with `skipped` (Q10) shows "{side} cannot move and sits out" for each skipped side.
- **Needed by**: kriegspiel (the umpire's lines from `record.info.announce`), fourplayer ("Blue is out", skipped
  turns), threecheck ("+").

#### U10. Hidden-information UI (generic for `V.hidden`)

- (a) `pieceAt(sq)` returns only a piece of the side to move (the first world where a piece of `state.turn` stands
  on `sq`), so selecting a square never marks the parts of an enemy ghost (leak fix).
- (b) `V.ownView(state, side) -> state` (optional): Split, Merge and Measure targets and checks (`splitTargets`,
  `mergesFrom`, `ownPieceAt`, the measure check) use `V.ownView(state, viewer)`. If an attempt is legal there but
  illegal on the real state, the notice is the umpire's "No". Compute the view once per state and viewer (a
  `computed`), not per click or per mark: it rebuilds and deduplicates every world, and the move table is cached per
  state object, so a fresh view on every call regenerates every world.
- (c) `V.hiddenStyle`: `'fog'` (default, today) or `'plain'` (no fog class; hidden squares look like normal squares;
  the accessible name stays "{square}: hidden").
- (d) `V.umpire: true`: `attempt` plays a legal move at once (no pending box, no odds preview); the own roll box and
  own history rows show the result without percentage and notes.
- (e) While a hidden game runs: Undo disabled, the danger line hidden, other sides' budgets "?" (U5).
- (f) Hidden pass & play: two-step hand-over. After a move the mover still sees the board and a box "Your move:
  {result}" with a "Pass the device" button; then the curtain as today.
- **Needed by**: darkchess (a, c, e, f), kriegspiel (all).
- **Tests**: the `pieceAt` helper ignores an enemy ghost; `VariantBoard` with `hiddenStyle: 'plain'` draws no fog
  class; the umpire flag skips the pending box (helper or composable test).

#### U11. Option descriptions and game info

- `options[i].describe(value) -> string` (optional): shown under the option field in the new-game dialog (chess960:
  "RNBQKBNR"). The game view shows one line per option with its label and value (`describe` if present, the choice
  label for choices), for example "Start position (0–959): 518".
- **Needed by**: chess960, fourplayer (mode), multiverse (board size, timelines).

#### U12. Resign result

- `V.resignResult(state, loser) -> result` (optional). Default today's: every enemy of the loser wins.
- **Needed by**: fourplayer Teams (the other team wins, not the partner).

#### U13. Promoted marker on sprite pieces

- `glyphOf` passes `promoted` through for sprite glyphs; `VariantPiece.vue` draws a small red disc (`#b71c1c`,
  r about 0.11 × size) with a white "+" at the top right.
- **Needed by**: crazyhouse and bughouse (`+q`, `+r`, `+b`, `+n`).
- **Test**: `glyphOf` returns `promoted: true` for such a type; `VariantPiece` renders the marker.

#### U14. The computer's forcing replies include game-ending moves (koth.md 8, core change 1)

- `mightCapture(V, state, code)` becomes `mightForce`: true when some branch of `branches(V, state, code)` has
  `captures.length > 0` **or** `worldResult(V, branch.worlds[0].b, state.turn) !== null` (after `settle` all worlds
  of a branch agree on the result; a Missed branch keeps the old world and gives null). It keeps both of its jobs:
  the only replies the normal level looks at, and the moves `chooseMove` tries first. `worldResult` is already
  exported by `quantum.js` (I9).
- Combines with U3: U3 decides who replies, U14 which replies the normal level sees.
- **Needed by**: koth (a one-move hill threat, K18: 20 of 20 defended against 1 of 20 today), threecheck, horde,
  antichess, every variant whose goal is not only a king capture.
- **Test**: export `mightForce` for tests. On a test variant whose `worldResult` gives side 0 the win when its king
  stands on e4 (`{ e3: '0:k', e8: '1:k', a2: '0:p' }`), `mightForce('e3-e4')` is true and `mightForce('a2-a3')`
  false; a capture is still true. The game-level effect is koth.md's K18 (in the koth spec's own tests).

#### U15. `layout.outlines` above the cells (koth.md 6, "UI changes needed" 1)

- `VariantBoard.vue` draws an optional `layout.outlines: [{ x1, y1, x2, y2 }]` (layout units, turned with `rot()`
  like `lines`) **after** the cells and before the labels, with its own class (stroke about 0.05, contrast in every
  board theme). `layout.lines` keep their place under the cells (xiangqi's grid needs that). `rectTopology` already
  passes `opts.layout` through, so `orthodoxSpec({ boardOpts: { shade, layout: { outlines } } })` (W7) reaches it.
- **Needed by**: koth (hill outline; without it the shading alone marks the hill).
- **Test**: a layout with one outline renders one element of the outline class after the last cell.

#### U16. Hand order (crazyhouse.md 6, its "U1")

- Optional variant field `handOrder: string[]`; the `hands` computed of `VariantGameView.vue` sorts `handView`'s list
  by it (types missing from the list last, by id). Crazyhouse and bughouse `['p', 'n', 'b', 'r', 'q']`, shogi its
  own order.

#### U17. Move codes in the move list (crazyhouse.md 6, its "U3")

- `historyRows` shows a code through a formatter: an optional `V.codeText(code) -> string | null` first, else a
  drop whose type is one lower-case letter is upper-cased before `@` (`p@e4` → `P@e4`); everything else unchanged.
  Stored codes and tests keep the lower-case keys. Full notations that need the position (shogi Hodges, xiangqi WXF)
  are not in scope (item 69).

---

## 3. Interfaces between the packages

| Id | Interface | Producer | Consumer | Exact contract |
|---|---|---|---|---|
| I1 | `V.applyMiss(b, action, side, info)` | W4 (`orthodoxSpec().applyMiss` via `clearEnPassant`) | Q1, Q10 (`type: 'pass'`) | Signature and `action` / `info` shapes of Q1 (five action types: move, split, merge, measure, pass); returns `b` itself when unchanged; never mutates. W4's hook ignores the action, so it clears en passant on every idle turn, which is what D2 wants. |
| I2 | `V.unifyWorlds(bs, mover)` | W5 (`orthodoxSpec().unifyWorlds` via `unifyCastling`) | Q3 | Same length and order; unchanged worlds by reference; only bookkeeping that `solidKey` and `worldResult` do not read. |
| I3 | Certain moves | W1-W3 keep emitting `kind: 'castle'` (castlingMoves) and `kind: 'ep'` (pawnExtras) | Q2 | Certain = `m.certain ?? (m.kind === 'castle' \|\| m.kind === 'ep')`. |
| I4 | Type flag `resetsQuiet` | variant modules; `normaliseType` (world.js) must keep spreading unknown type fields (it does: `...type`) | Q8 (`V.quietTypes` in variant.js) | Default `solid && !royal`. |
| I5 | History record fields `from`, `to`, `info`, `skipped` | Q9, Q10 | U1, U9 | Arrays of square indexes; `info` any JSON; `skipped` an array of sides. Absent in games saved before the change: the UI falls back. |
| I6 | Roll notes | Q4 | U7 | `'solid:' + (V.solidExtra ? V.solidExtra(b) : '')` and `'end:' + JSON`. `V.noteText(note)` is consulted first. |
| I7 | Public exports | Q12 (`src/variants/index.js`) | U5, U8 | `budgetInfo(V, state, side) -> { used, limit, sides }`, `mustCapture(V, state) -> boolean`. Added first (section 2.1). |
| I8 | Outcome keys | Q4 | U7 | Still `miss`, `move`, `capture`, `split`, a square name, `gone`. |
| I9 | `ai.js` imports | Q (quantum.js exports `branches`, `legalMoves`, `splitsFrom`, `splitTargets`, `stateAfter`, `worldResult`, `T`) and W (world.js `applyClassical`, `HAND`) | U3, U4, U14 | No new core export needed; `ai.js` may import from `./quantum.js` and `./world.js` directly. |
| I10 | `isCertain(m)` | Q2 (exported by `quantum.js`) | variant modules and tests | `m.certain ?? (m.kind === 'castle' \|\| m.kind === 'ep')`. The `ClassicalMove` JSDoc (world.js) is written by W1. |
| I11 | `layout.outlines`, `handOrder`, `codeText` | variant modules (koth via W7's `boardOpts.layout`) | U15, U16, U17 | All optional; absent means today's drawing and texts. |

**Order.** Q and W are independent (each has defaults). U depends on I7 (add first) and reads I5 with a fallback. An
ai-ui test that imports `budgetInfo` or `mustCapture` fails until Q12 is in the tree: that is expected while the
packages are in progress.

**Saved games.** Undo replays a record by outcome index (`useVariantGame.replay`, `applyOutcome(V, s, code, i)`).
Q2, Q3, Q8, Q10, Q13 and Q14 change legality, outcomes or counters, so a record saved before the change can replay
differently, and a move that became illegal is skipped (`?? s`). The variants are unreleased (work-in-progress
branch), so no migration is planned; the lead should clear the test games on the development devices after merging.
Q4 changes only labels and notes (branch order and count stay), so it alone would not affect replays.

**Integration tests for the lead** (after all three packages land; for example in `tests/js/variants/core.spec.js`
or a new `core-integration.spec.js`, all on `orthodoxSpec()`):

- IT1 stale en passant: 4 worlds from `{ e1: '0:k', e8: '1:k', d2: '0:p', e4: '1:p' }` with a White knight on f3 / h3
  and a Black knight on f6 / h6 (all combinations): `d2-d4`, `f6-g4`, `f3-g5`: then `e4-d3` is illegal (today: legal,
  miss 0.75 / capture 0.25).
- IT2 Measure turns: the same start, `d2-d4`, `?f6` (outcome 0), `?f3` (outcome 0): `e4-d3` is illegal (today legal).
- IT3 right after the double step: `d2-d4`, then `e4-d3` has one outcome `capture`, p 1.
- IT4 castling past a ghost: Q2-a on `orthodoxSpec()`: `O-O` illegal.
- IT5 right lost after a partial slide: right K; worlds `{ e1: '0:k', h1: '0:r', e8: '1:k' }` + Black knight on h3 (A)
  / a6 (B): `h1-h5` (one unrolled branch), then Black `?h3`, outcome h3: `O-O` is illegal (today legal).
- IT6 a Missed rook move keeps the right: Black knight on h2 (A) / h3 (B): `h1-h3` gives `miss` 0.5 / `capture` 0.5;
  then Black plays `e8-d8` (it is Black's turn after `h1-h3`); after `miss`, `O-O` is legal with one outcome `move`,
  p 1; after `capture`, it is illegal.
- IT7 Chess960 `O-O` with Ra1 Kg1 Rh1 gives Kg1 Rf1.
- IT8 fuzz invariants (`fuzz.spec.js`): in every state `x.castle`, `x.ep` and `x.epVictim` are identical in all
  worlds of the orthodox-shaped variants; `budgetInfo(V, s, side).used <= budgetInfo(V, s, side).limit` for every
  side.
- IT9 own part: Q14's knight case on `orthodoxSpec()`; IT10 converging danger: Q7-d on `orthodoxSpec()`.

All of IT1-IT8 were run by the review on a prototype of Q1-Q4, Q8, W4 and W5 (`handoff/tmp/plan-review/core/`,
`it.mjs`): they pass as written above (IT6 only with the Black move), the 13 existing core tests pass unchanged, and
60 random orthodox games with splits (6,215 plies, up to 64 worlds) never had `x.ep` or `x.castle` differ between
worlds.

---

## 4. Rejected and variant-level items, with the workaround

| # | Item | Verdict | Workaround / reason |
|---|---|---|---|
| 24 | `enemies(a, b, w)` | REJECT | Touches all three packages for one game mode. Fourplayer Teams keeps its `filterMoves` (no partner captures), its `evaluate` correction and U12 `resignResult`. |
| 23 | Elimination by resignation in FFA pass & play | REJECT | Needs state surgery (remove an army, dedupe, rescale) outside the quantum layer. Resigning ends the game (U12); the lead may revisit. |
| 29 | `outcomeText` hook for atomic | REJECT | The rules card says every capture explodes. The generic wording stays "Captured". |
| 28 | Blast marks (`V.blastArea`) | VARIANT | Optional: atomic's `layoutOf(state)` returns its static topology with the cells of the last blast re-shaded (`hill` / `hilldark`), from `state.history.at(-1).captures`. |
| 32 | Hand value in the AI | VARIANT | `evaluate(w, side)`: +0.2 × value per own hand piece, −0.2 × value per enemy hand piece (crazyhouse.md 3); bughouse's team version (bughouse.md 3). |
| 36 | Tri-D projected moves / column blocking | VARIANT | `V.generate(w, side)` in `trid.js` with the projected generator of trid.md 3 (a rider stops at a column occupied on any level; destinations are every existing square of the target column); `pushMove` for promotions; its own extras. `royalDanger`, the AI and the UI all go through `generate`. Castling: kind `castle` (Q2; its king-move key is safe under Q2's strict rule), rights in the `x.castle` array shape with `unifyWorlds: unifyCastling` (W5), or its own `unifyWorlds` for another rights shape; en passant: kind `ep` with an `applyMiss` that clears its own `x.ep`. There is no `core/movegen.js`. |
| 38 | Wide and compact layouts | REJECT (deferred) | One layout plus zoom for now; a later UI change can pass the container shape to `layoutOf`. |
| 39 | Start zoomed on the home boards | VARIANT | hyper4d: `layoutOf(state)` returns the topology with `layout.focus = { x, y, zoom, key }`; U2 keeps it from recentring on every ply. |
| 40 | Bare-kings draw in the core | VARIANT | `worldResult` (or `stateResult`) returns `{ winner: null, reason: 'bareKings' }` in atomic, threecheck, chess960, hyper4d; the game-end roll settles disagreement; U7 gives the text. King of the Hill must not have it. |
| 47 | `maxPly` / `quietPlies` defaults | REJECT | The multiverse declares `maxPly: 1200`, `quietPlies: 300` (existing fields); other variants keep 600 / 100. |
| 48, 49 | Layout extensions (`kind`, `arrows`, `views`, viewer-aware `layoutOf`), history cells in `boardView` | REJECT (deferred) | The multiverse design is not final; the playable design needs only `areas`, `lines`, real history squares and `layout.focus`. The multiverse workflow's UI step adds what the final design needs. Q11 makes extra display cells safe. |
| 50 | `aiCandidates(state)` | VARIANT | `aiView(state, side)` prunes the search (multiverse-design-playable.md 4.10). |
| 51 | Black's multiverse view | VARIANT | `sides[1].rotate = 0` and a board option or `blackView` in `layoutOf`. |
| 52 | Skeleton invariant I-5D | VARIANT | `solidExtra` holds the skeleton; the multiverse tests assert it. |
| 53 | Measuring costs a board | VARIANT | Q1: `applyMiss(b, { type: 'measure', ... })` passes that board, if the final design wants it. |
| 54 | Hint for a refused hill step | REJECT | Only one variant; the rules card explains the hill rule. |
| 56 | Active board highlight in bughouse | VARIANT | `layoutOf(state)`: the static topology plus an `areas` halo (shade `wood`, 0.3 around the board) for the board of `state.turn`. |
| 58 | Per-seat human / computer choice | REJECT (later) | The dialog offers one human seat or pass & play; fourplayer plays against three computers. |
| 59 | Stacked bughouse layout on phones | REJECT | The existing zoom and pan are enough for v1. |
| 60 | Repetition draws | REJECT | The variants core has no repetition rule; each spec lists it as a known deviation. xiangqi's perpetual-check rule (3.2 (1)) and shogi's sennichite (3.2 (2)) fall back to the quiet draw and `maxPly`, as their specs say. Reason: a position key is the side to move plus every `worldKey` with its weight, up to 64 × ~300 characters per record (about 20 KB per ply in localStorage for a 64-world game); a later change could store a hash. docs/rules.md 6 has the threefold rule for classic Quantum Chess only. |
| 61 | Wrong placeholder `category` | VARIANT | Each implementer sets the catalogue's category in `src/variants/<id>.js`. |
| 69 | Hodges / WXF notation, `glyph.alt` letters | REJECT (later) | U17's `codeText(code)` covers formatting that needs only the code; the full notations need the moving piece and the position. |
| 70 | `statusText(state)` | REJECT (later) | makruk shows the reason in the result text; `sideInfo` (U6) can show a short counter per player meanwhile. |
| 71 | `state.vx` + `stateAfterHook` | REJECT | makruk's fallback: the count restarts after every capture, which only gives the chaser more time. |
| 72 | "Your king cannot escape" and the waiting draws | REJECT | The variants core has neither; each spec lists them as deviations (xiangqi and hexagonal end stalemates through `noMoves`). |
| — | Fourplayer en passant window "until the pawn's owner moves again" | VARIANT | The default (next player only) is kept; a variant can keep `x.ep` longer in its own `afterMove` and `applyMiss` (its `applyMiss` also sees Q10's skipped turns as `type: 'pass'`). |
| — | Darkchess: the quiet counter is not public | no change | The UI shows no quiet counter; `aiView` returns `quiet: 0` (darkchess.md review 13). |

## 5. Spec updates caused by the decisions (for the variant implementers)

- **chess960.md**: 3 fixes (a) and (b) are W1 and W2; 4.2, 4.3, the last rules-card sentence and tests C10-C12 change:
  castling past a ghost is illegal (not a roll), and a rook that is not 100 % home loses the right in every world
  (C11: `O-O` illegal instead of a roll with the rook's odds).
- **kriegspiel.md**: K13 second case: `O-O` is "No" (the umpire), not a roll; 6 "a ghost that might block the path
  makes castling a roll" becomes "No". Announcements go in `recordInfo` (Q9) as `info.announce`.
- **crazyhouse.md** 4 ("castling is a king move, so it is rolled when it is possible in some possibilities only"):
  castling is legal only when possible in every possibility.
- **trid.md** 4 (castling rolled like a king move), TQ7 and TQ8 (queenside castling past a possible ghost on
  `a0QL1`): castling is certain-only (illegal while a ghost might stand there); rights via W5 or its own
  `unifyWorlds`.
- **threecheck.md** T6, T8, T20, T23: the second outcome is now `miss`; notes read `solid:checks:W:B`, so the
  `noteText` regex must match the end of the note (`/checks:(\d+):(\d+)$/`, not `/\|checks:…/`). Section 3's row "Not
  used" must change: three-check inherits `orthodoxSpec()`'s `applyMiss` (W4), which only clears the en passant
  square and never counts a check, so "a missed world counts no check" still holds.
- **antichess.md**: set `resetsQuiet: false` on `k`; `compulsoryCapture: true`; the 50-move rule is exact.
- **hexagonal.md** 4 "Open core issue": resolved by Q1 + W4; add `applyMiss: (b) => clearEnPassant(b)`; use
  `pawnExtras` with vectors (W3).
- **fourplayer.md**: `budgetRule` instead of `budgetLimit`; `passWhenStuck: (s) => !s.worlds[0].b.x.teams` (the
  function form of Q10, so Teams keeps the draw of S1); `resignResult`; castling may use `castlingMoves` (W3);
  `orthodoxAfterMove` gives the horizontal en passant square; add `applyMiss` (it also runs for a skipped player's
  turn) and `unifyWorlds`.
- **bughouse.md**: `budgetRule` instead of `budgetSides`; `replySide: (s, me) => 3 - me`; a per-board `applyMiss`;
  `unifyWorlds: unifyCastling`; W3 helpers instead of local copies; `passWhenStuck` if the lead prefers "the seat
  passes" to a draw.
- **atomic.md**: T13 and T15 danger values hold on the core after Q7.
- **raumschach.md**: 4.6 (RQ9) and 4.10: the ring counts converging captures (Q7) and a part moving onto another
  part of the same piece joins it without a roll (Q14); its "core changes C1, C2" are Q14 and Q7.
- **koth.md**: its core change 1 is U14 and its UI change 1 is U15; the outline passes through
  `boardOpts: { shade, layout: { outlines } }` (W7).
- **crazyhouse.md** 6: its UI changes U1-U4 are this plan's U16 (hand order), U7 (drop wording), U17 (drop codes)
  and U13 (promoted marker).
- **shogi.md** 3.2: optional change 1 is Q13 (planned); change 2 (repetition) is rejected (item 60); `handOrder` is
  U16; Hodges notation is item 69 (later).
- **xiangqi.md** 3.2: (1) repetition is rejected (item 60), so sentence 7 of its rules card takes the fallback; (2)
  is the type flag `resetsQuiet: false` on the soldier (Q8), if the lead wants the WXF counter.
- **makruk.md** 3.1: item 3 is Q8; items 1 and 2 are rejected (items 70, 71).
- **multiverse** designs: castling and en passant on one board are certain-only (Q2); `applyMiss` exists (Q1), so the
  final design may choose pass = link with "the structure follows the key"; the playable design keeps working
  unchanged (default identity). Its pinned core behaviours (multiverse-design-playable.md 4.11) change only as
  follows: split and merge paths skip every certain move, not only `castle` (Q2); `royalDanger` also counts a royal
  loss after a capture and converging captures (Q7; the `†` danger move still counts as before, and the extra
  `apply` calls cost about 20 µs each on the mover's captures only); `layout.focus` recentres when its key changes
  rather than its object (U2; returning the same object still never recentres); a merge of an `r0` part with an `r`
  part is refused (Q13); a part that a settling roll separates is labelled by its own worlds (Q4): a part of a split
  made only of idle worlds is `miss`, not `split`, also without `applyMiss` (playable design 5.4 E1-E3 and test 25:
  "the outcome label Split, or Missed for the part in which nothing happened"; test 25 expects keys `split` and
  `miss`). `measured: () => true` keeps Q14 out of the multiverse.

## 6. Documentation follow-up (lead, after merging)

Add to the hooks table of `handoff/IMPLEMENTING.md` and to `docs/development/architecture.md` (section 5.6):
`applyMiss(b, action, side, info)`, `unifyWorlds(bs, mover)`, `budgetRule(b, side)`, `recordInfo(prev, code, branch,
next)`, `compulsoryCapture`, `passWhenStuck`, `replySide(s, me)`, `sideInfo(state, side, viewer)`, `noteText(note)`,
`infoText(record, viewer)`, `resignResult(state, loser)`, `ownView(state, side)`, `hiddenStyle`, `umpire`,
`options[i].describe(value)`, `handOrder`, `codeText(code)`, `layout.outlines`, the type flag `resetsQuiet`, the move
field `certain` (and `isCertain`), and the helpers `clearEnPassant`, `unifyCastling`, `castlingMoves(..., { toRook })`,
`pawnExtras(..., { pawn, forward, captures })`, `attacks(..., { royal: false })`, `orthodoxSpec({ boardOpts })`; also
`solidExtra`, which the core reads today but the hooks table does not list (threecheck.md 8.2, crazyhouse.md 3). In
`docs/variants.md`, the shared rules say that castling and en passant never roll, that a castling right is lost as
soon as the king or rook is not 100 % home, that a part moving onto another part of the same piece joins it, that
parts with different faces do not merge, and that the danger ring counts converging captures.

Done: the hooks table of `handoff/IMPLEMENTING.md` lists all of the above (with the line that `orthodoxSpec()` brings
`applyMiss: clearEnPassant` and `unifyWorlds: unifyCastling`, and that a variant whose `x.ep` has another shape, such
as bughouse's per-board arrays, replaces `applyMiss`), and the header of `src/variants/core/variant.js` states the
exact contracts: `info.hit` is decided before the solid and game-end rolls (so a final Missed outcome can hold worlds
built with `hit: true`), the hook runs twice on one world when the budget fallback rolls (the first result is
discarded), and `recordInfo` runs once per played move, after the result and any sit-out, never in light mode.
`docs/development/architecture.md` is still open.

## 7. Review notes

Adversarial review of this plan, 2026-09-25, against the code in `src/variants/core` and `src/variantplay`, the
status files, every spec in `handoff/research/` (including the specs and review edits that appeared after the plan
was written) and docs/rules.md. Scratch scripts: `handoff/tmp/plan-review/`. A prototype of Q1-Q4, Q8, W4, W5 (and
Q14, plus a `budgetRule` limit for Q1-f) as a patched copy of the core is in `handoff/tmp/plan-review/core/`
(`patch.py` made most of it; flags `Q4=1 Q8=1 Q14=1 MODE=loose` switch parts on); on it the 13
existing core tests pass unchanged (`npx vitest run --config vitest.config.mjs --root handoff/tmp/plan-review`),
IT1-IT8 pass (`it.mjs`), and 60 seeded random orthodox games (6,215 plies, up to 64 worlds) keep `x.ep` and
`x.castle` identical in all worlds.

What was changed, and why:

1. **Q2, "one key, two meanings" (wrong rule).** The plan made a key legal when every world generates it, and asked
   castling keys never to coincide with ordinary keys. trid (8.1 item 9, `O-O` now, king-move keys before) and the
   multiverse (castling = the king's move key) do not follow that, and on today's core a key that is a swap castling
   in one world and a king step in another is legal and applied with both meanings (`q2fg.mjs`). Q2 now requires the
   key to be generated **as a certain move** in every world. The strict and the loose rule gave identical games on
   orthodox play (`strictloose.mjs`). Also: split and merge paths skip every certain move (`isCertain`), "never
   rolled" was reworded (the solid and game-end rolls still apply), tests Q2-f and Q2-g added.
2. **Q10, fourplayer's Teams draw (hook did not solve the spec's scenario).** A flag cannot give FFA the sit-out and
   Teams the `noMoves` draw (fourplayer.md 3.4 hook 2 as revised, S1). `passWhenStuck` may now be a function of the
   state. A skipped turn now passes every world through `applyMiss` with `type: 'pass'`, so a one-ply right cannot
   outlive a skipped player (D3 asks for consistent per-ply bookkeeping); `noMoves` still uses the state before any
   pass.
3. **Missed requests, now in the table with a verdict:** koth's `mightForce` (U14) and `layout.outlines` (U15, W7
   alone cannot show the outline: lines are drawn under the opaque cells); raumschach's C1 (Q14: a part moving onto
   another part of the same piece is rolled today, docs/rules.md 2.1 says it joins; verified and prototyped) and C2
   (Q7: the danger ring ignores converging captures, docs/rules.md 5 says it counts them; verified 0.5 instead of 1);
   shogi's same-face merge (Q13); crazyhouse's hand order and drop codes (U16, U17); xiangqi's repetition hook and
   soldier counter, shogi's sennichite and notation, makruk's status line and state counter, the classic "king cannot
   escape" and waiting draws, three-check's optional `historyMark` and `attacks` skip (items 60, 69-73, with reasons).
4. **Q8** now marks every applied classical move (split children and merges too, for types with `resetsQuiet: true`)
   and reads the mover's type from `m.from`, as today's code does (`m.id` is −1 for multiverse travel moves).
5. **Q6**: with several `sides` the arrangement key must include the side (`-2n` in a hand is otherwise the same for
   both partners); a limit must never shrink (IT8); `budgetRule` must be cheap.
6. **Q1**: action type `pass` (for Q10); the measure action carries the piece id because the measured part stands on
   different squares in different worlds; the difference between `hit` ("before the rolls") and multiverse.md's
   "surviving world" is stated; the double call on the budget fallback is explicit; Q1-f named no position (with the
   default budget of 8 it needs at least 9 worlds), it is now a concrete three-world case with a limit of 2, checked
   on the prototype (`q1f.mjs`).
7. **U4** broke ties by square: on a quiet move `worldValue` changes only through `V.evaluate`, so most variants would
   always split towards the 6 lowest squares. Ties now use the search `rng`.
8. **Package conflict:** Q12 asked package "quantum" to document the `certain` field, which lives in the
   `ClassicalMove` typedef of `world.js` (package "world"). W1 now owns that JSDoc; `isCertain` is interface I10.
   I1 and I9 list the new consumers (Q10, U14).
9. **W3**: `castlingRights` must compare every non-file coordinate when it looks for the rook, or a rook of another
   board is taken on a multi-board topology. **U10(b)**: compute `ownView` once per state (it regenerates every
   world otherwise).
10. **Tests fixed:** IT6 omitted Black's move after `h1-h3` (White cannot castle on Black's turn); U3's wording
    ("does not play `d1-d5` (today `e1-f1`)") now says the default is unchanged, confirmed with probe3; Q7-d, Q10's
    function case and the pass case, Q13, Q14, IT9, IT10 added; component tests need the happy-dom header.
11. **Saved games:** undo replays by outcome index, so the rule fixes can replay old test records differently; noted
    in section 3 (no migration: the variants are unreleased).
12. **Spec updates (section 5)** extended: trid TQ8, three-check's note regex and its "Not used" row (it inherits
    W4's `applyMiss`, which counts no check), fourplayer's `passWhenStuck` function, raumschach, koth, crazyhouse,
    shogi, xiangqi, makruk and the multiverse's pinned core behaviours.

Checked and left unchanged: D1-D6 are all covered (D1 by Q2 + Q3/W5, D2 by Q2 + Q1/W4, D3 by Q1/W4 and now Q10,
D4 by W1, D5 by Q4, D6 by the defaults and the prototype run); every other claim of "Verified on the current core" was
re-run and holds; Q7's extra `applyClassical` calls cost about as much as today's danger computation (0.1-0.2 ms at
16 worlds, `q7perf.mjs`) and run outside the AI search; Q2's filter adds one flag per key; the packages touch
disjoint files after item 8.

Open for the lead: Q13 is on by default (it refuses a multiverse `r0` + `r` merge, harmless); Q14 and Q7's
converging captures change what players see (fewer rolls, higher danger numbers) as bug fixes against docs/rules.md;
raumschach.md section 8.2, which it cites for C1 and C2, was not yet written at review time.

---

## 8. Follow-up pass

Status: implemented and verified, 2026-09-25, uncommitted on top of commit cb833fd (the first pass). Two packages,
"rules" (`src/variants/core/quantum.js`, `variant.js`; tests `tests/js/variants/core-rules.spec.js`) and "ui-ai"
(`src/variants/core/ai.js`, `src/variantplay/**`, `src/views/VariantGameView.vue`; tests
`tests/js/variants/core-ui-ai.spec.js` and `core-ui-ai.vue.spec.js`), then a verification of each and one fix pass
(8.4), which also touched `src/variants/core/world.js`. The requests came from the spec reviews (section 8.2 of
`handoff/research/<id>.md`) and the critics' scripts in `handoff/tmp/critic-*/`. The U items below are numbered for
this pass; they are not the U1-U17 of section 2.3.

### 8.1 Decisions

The lead's binding decisions are in `handoff/LEAD-DECISIONS.md`:

- **L1** the classic end rules of docs/rules.md 5 and 6 apply to every variant: "your king cannot escape", the
  bare-kings draw, and draws that wait while the player to move can capture an enemy king for certain. A variant
  opts out only where its own rules make the classic rule wrong, with a code comment. A variant that returns
  `'bareKings'` from its own `worldResult` drops it for the core flag, unless its condition differs (then it keeps its
  own and sets `bareKingsDraw: false`). The shared rules card explains capture-the-king and the escape rule, and a
  variant card must not contradict it.
- **L2** `specialMoves: false` in raumschach, hyper4d, shogi, xiangqi and makruk.
- **L3** a missed drop reads "Missed: the piece stays in hand"; the roll memo key is `ply:positionHash:code` without a
  trailing promotion suffix.
- **L4** castling never rolls, and en passant is certain (as built in the first pass, Q2).
- **L5** when a variant test fails because of L1-L4, the test changes, not the core.

Decided while building:

- R3 became a flag of its own, `drawsWait`, with the same default as `escapeRule`, so that four-seat variants can opt
  in (bughouse and fourplayer do, and the multiverse's final spec does too).
- Only the quiet-move and bare-kings draws wait. The move limit does not wait, and "no legal move" can never occur
  together with a certain capture (docs/rules.md 6 names the bare-kings, repetition and 50-move draws; the variants
  have no repetition draw, row 60).
- A capture counts as certain only when it is legal: a key that is a certain move in some worlds and an ordinary move
  in others (Q2) never counts, even at 100 % king danger. Only the side that moves next counts as the attacker (the
  same answer as "any enemy" in two-player games).
- The per-variant values of the flags are in `handoff/IMPLEMENTING.md`, section "Classic end rules".

### 8.2 Package "rules"

- **R1 "your king cannot escape"** (flag `escapeRule`, reason `cannotEscape`). After a move, not in light mode: the
  side to move has at least one legal action, every action (moves, splits, merges, measurements) leads only to
  outcomes where the game goes on with one of its royal pieces capturable for certain by the next side (one legal
  move key or one merge takes it in every world, "takes" as `royalDanger` counts it), and no action might capture an
  enemy royal piece. Then the mover wins at once. An outcome that ends the game is an escape; a side without any
  legal action gets `noMoves`. Default true for exactly two sides, a royal type, no `compulsoryCapture`, no
  `nextSide` and no `actions`.
  - How it stays fast: the outcomes are built as the light `stateAfter` builds them, without `unifyWorlds`, so the
    rule never recurses. Moves of the royal pieces and captures come first, splits last, and none at a full budget.
    One search remembers each classical move's resulting world and the facts of each world, so a split's children
    are worlds already met. A split is skipped without building its outcomes when one enemy move or merge takes the
    king in every world it can lead to and no world ends the game. When the variant has no `generate` or
    `filterMoves`, only the attacking piece's moves are generated.
  - Checks: compared with a plain search over every action and outcome on random 4 × 4 to 8 × 8 positions in four
    kinds of variant (plain, `filterMoves`, two kings per side, atomic explosions): no mismatch in over 200,000
    outcomes. The verifier's independent oracle agreed on about 75,000 more states (castling, en passant,
    `filterMoves`, `stateResult`, explosions). Four deliberate breakages of the code were each caught by the tests.
  - Tests R1 a-l: the back-rank trap and a blocking piece (a); never in light mode or without the flag (b); every
    kind of action at 8 worlds (c); a split that meets two threats half each escapes (d); an outcome that ends the
    game escapes (e); a move or a ghost that might take the enemy king escapes (f); no legal action gives `noMoves`
    (g); an escape in one outcome of a roll (h); before the quiet-move draw, and never when every answer reaches the
    move limit (i); a smothered king with a big army at 8 worlds (j); the random comparison, seeded (k); the
    converging-capture trap of 8.4 (l).
- **R2 bare kings** (flag `bareKingsDraw`, reason `bareKings`): only royal pieces on the board in every world and no
  piece in any hand. Checked after `worldResult`, `stateResult` and R1. chess960, raumschach, trid, threecheck,
  hyper4d and hexagonal now use the core flag instead of their own copy. atomic and makruk keep their own rule,
  decided world by world through the game-end roll, with `bareKingsDraw: false`; fourplayer keeps its FFA rule with
  the flag off. Tests: the draw, every world and no piece in hand needed, agreement with a `worldResult` version.
- **R3 draws wait** (flag `drawsWait`): the quiet-move and bare-kings draws wait while the side to move can capture an
  enemy royal piece for certain; a converging capture counts. Tests: bare kings side by side, the quiet draw waits
  only while the capture is certain, a converging capture (`d4|f4-e2`) makes it wait, an illegal capture does not,
  the move limit does not wait.
- **R4 atomic danger** (atomic.md 8.2, T24): `mergeDanger` weighs every merge whose target may hold a piece that the
  merging side can capture, not only a royal piece. Tests: the atomic cases a-c, and brute-force equality on a
  mini-atomic variant and on orthodox chess. The committed and the new core gave identical king danger on 9,368
  values (1,807 above zero) over 60 orthodox games, and on 10,124 more in the verifier's soak.
- **R5 faces over the target** (shogi.md 8.2, Q13): `perWorldMerge` and `mergeCandidates` refuse a merge when the piece
  has more than one type over the worlds where it stands on `f1`, `f2` or the target. Test: types `s` and `+s`.
- **R6 a merging piece absent from world 0**: `perWorldMerge` reads the type in a world where the piece stands on the
  from square (a 5D twin threw before). Test.
- **R7 makruk review bug**: `legalMoves` uses the piece's home squares (its squares where `ownPieceAt` is the piece),
  skips the piece only when there is none, offers the Measure on the first and merges and splits from every one.
  Tests: the Measure on the other square; only legal codes, splits from the other square too.
- **R8 split budget**: `splitsFrom` (quantum.js) and `aiSplits` (ai.js) return `[]` at once when `budgetInfo` says the
  budget is full; the result is the same as the full check. Tests in both test files.
- **R9 `specialMoves`** (default true; false: neither castling nor en passant), documented in `variant.js` and read by
  the UI only. Tests: the defaults of all four flags, and each opt-out.

Contracts that became tighter (written in the `variant.js` header): `unifyWorlds` must not change anything the next
move's captures depend on, because the escape search leaves it out; `generate`, `applyClassical` (with `afterMove`)
and `applyMiss` must be pure functions of the world.

### 8.3 Package "ui-ai"

- **U1 Kriegspiel fallback** (kriegspiel.md 8.2): with `V.aiView`, when no candidate of the view is legal on the real
  state, `chooseMove` tries `V.candidateMoves(real)` (else the legal moves of the real state) plus the merges and
  measurements of `legalMoves(V, V.ownView(real, me))`, shuffled with the search rng, and plays the first code whose
  `branches` is not null; null only when none is legal. Variants without `aiView` are unchanged. 4 tests.
- **U2 deadline**: the level's budget runs from the call and is checked inside the evaluation of every candidate,
  before each outcome and each reply, the first candidate included. When the time runs out before any candidate has
  a value, that candidate is judged by the positions right after it, without the reply, so there is always a move.
  4 tests. Measured at 36-64 worlds (easy / normal / hard, budgets 0.4 / 1.5 / 4 s): hyper4d went from up to 397 /
  1679 / 4236 ms to at most 314 / 1501 / 4001 ms; raumschach, hexagonal and capablanca now stop at 1501 / 4001 ms.
  Across all 20 variants no search goes more than 1 ms over its budget.
- **U3 roll memo key** (docs/rules.md 8): `rollMemoKey(state, code)` in the new `src/variantplay/rolls.js` gives
  `ply:positionHash:code`, the code without a trailing promotion suffix (`/=[^-|?@=\s]+$/`). The hash (FNV-1a-64)
  covers `state.turn` and every world as its `worldKey` text and weight, in stored order. `rolls.js` has its own copy
  of the `worldKey` text, since `src/variants/index.js` does not export it; a test keeps the two equal. Old keys
  (`ply:code`) are simply not found. 4 unit tests and 3 composable tests.
- **U4 missed drop**: "Missed: the piece stays in hand". The expectations in `core-ai-ui.spec.js` and
  `crazyhouse.spec.js` follow it.
- **U5 rules card**: `sharedRules(V)` leaves the castling and en passant sentence out when `V.specialMoves === false`.
- **U6 full budget**: the composable's `budgetFull` (from `budgetInfo`) closes the Split mode: Split cannot be chosen,
  a Split mode left over selects nothing, and after a move or an undo the mode falls back to Move. The button is greyed
  out with the tooltip "Budget full: merge or measure a piece first." (already translated for the classic app).
  3 tests, plus 3 for the hidden hand-over (8.4).
- **U7 reason text**: `cannotEscape` reads "the king could not escape" ("White wins (the king could not escape)"); a
  variant's own `reasonText` still comes first.
- **Addition (L1)**: for a variant with royal pieces the shared card also says "Check does not limit your moves: you
  win by capturing the enemy king, unless the variant has its own goal.", and with `escapeRule` "Your king cannot
  escape: if every move you could make would leave your king to be captured for certain, you lose at once, unless one
  of your moves could still capture the enemy king." 2 tests.

### 8.4 Verification and fixes

Each package was verified against its items with probes (`handoff/tmp/verify-core2-rules/`,
`handoff/tmp/verify-core2-ui-ai/`); one fix pass (`handoff/tmp/fix-core2/`) then settled the findings:

- **R1 was slow on converging-capture traps** (a White knight ghost on f7|g6 against a smothered h8 king): every Black
  action ended in a merge threat that only the whole state could decide, about 50-70 ms on 8 × 8 at 8 worlds (the
  target is 50 ms), 173 ms on 5 × 5 × 5 at 8 worlds, and the first report's worst cases had left this case out. Now
  a merge threat is decided from single worlds (the merge move of each world is remembered), and `worldKey` is
  remembered per world object (`world.js`). Test R1 l.
- **U6 leaked the opponent's budget** in hidden pass & play: the Split tooltip and the mode switch showed whether the
  next player's budget was full while the mover still looked at the panel. Now the mode follows the next player's
  budget only behind the curtain, and the tooltips and the compulsory line speak only while the player to move looks.
- **The keyboard focus** reached the opponent's hidden pieces during the hand-over; it now reaches only the squares
  of the player to move, and a hidden from square only where the viewer's own piece may stand.
- **The shared card** said "There is no check", beside three-check and Kriegspiel cards that are about checks; it now
  says "Check does not limit your moves".

The verifier's soaks, run again after the fix (long random orthodox games, and quantum-heavy games up to 48 worlds),
kept every invariant,
never threw, and ended in `king`, `cannotEscape`, `moveLimit`, `quiet` and `bareKings` results; the slowest single
move was 3.2 ms.

Time of one move with the escape rule on trapped positions after the fix (the same move without the rule takes
0.1-7 ms; scripts `handoff/tmp/core-rules/worst.mjs`, `worst3d.mjs` and `handoff/tmp/fix-core2/worst-all.mjs`,
results in `handoff/tmp/fix-core2/worst-after.txt`):

| Board | 1 world | 8 worlds | 16 worlds | 64 worlds |
|---|---|---|---|---|
| 8 × 8, smothered king | 0.6 ms | 1.5 ms | 2.7 ms | 11 ms |
| 8 × 8, converging-capture trap | – | 3.5-4.6 ms (was 49-72) | – | 16.5-30 ms (was 92-184) |
| 5 × 5 × 5, raumschach trap | – | 8.8 ms (was 173) | 15 ms | – |
| 5 × 5 × 5, big army | 2.5 ms | 7.7 ms | 13 ms | 52 ms |
| 4 × 4 × 4 × 4, big army | 7 ms | 29 ms | 53 ms | 141 ms |

The big-army cases at 16 worlds are stress tests (their budget is over 8, so normal play cannot reach them). In
random games the average cost is 0.04-0.4 ms per move on 8 × 8 and up to 1.6 ms on 4D.

### 8.5 Tests

The core files (`tests/js/variants/core*.spec.js` and `VariantBoard.vue.spec.js`, 9 files) have 210 tests, all
passing: 34 in `core-rules.spec.js`, 17 in `core-ui-ai.spec.js`, 11 in `core-ui-ai.vue.spec.js` and 33 in
`core-ai-ui.spec.js`. The 19 variant spec files, `fuzz.spec.js` and `VariantBoard.vue.spec.js` pass on the final
core (686 tests, the same before and after the fix pass, `handoff/tmp/fix-core2/after.json`). In the rules package's
run, 68 variant tests failed on the committed core because they already expected the new rules.

### 8.6 Open for the lead

- The new texts are not yet in `translationfiles/templates`: run `node tools/l10n.mjs extract`.
- The flag table of L1 says "keep" for atomic's bare-kings draw. The module keeps the draw as its own world-by-world
  `worldResult` rule and sets `bareKingsDraw: false` (L1's exception clause). darkchess, which L1 does not list, sets
  `bareKingsDraw: false` because its spec follows chess.com (bare kings are no draw). Both are commented in the
  module; confirm or overrule.
- Saved games replay by outcome index, and their roll memo keys are no longer found (a new roll where the old key
  would have replayed one); the variants are unreleased, so no migration.
- `docs/development/architecture.md` (section 5.6, see section 6) still lacks the new hooks, now including
  `escapeRule`, `bareKingsDraw`, `drawsWait` and `specialMoves`.
- `npm run lint:refs` reports one finding outside the core: `tests/js/variants/horde.spec.js:491` names
  `docs/horde.md`, which does not exist.

---

## 9. Third pass

Status: implemented and verified, 2026-09-25, uncommitted on top of commit 61c4c15 (the core files are as committed
in 868c94a). The requests came from the final reviews of the 19 variants (reports in `handoff/tmp/e-state/`, probes
in `handoff/tmp/final-<variant>/`), and the lead decided every item (binding). Two packages: "ai"
(`src/variants/core/ai.js`; tests `tests/js/variants/core-ai2.spec.js`) and "ui" (`src/variants/core/quantum.js`,
`src/variantplay/**`, `src/views/VariantGameView.vue`, `tests/js/variants/fuzz.spec.js`; tests `core-ui2.spec.js`
and `core-ui2.vue.spec.js`), then a verification and fix round. Scratch files: `handoff/tmp/ai-pkg/`,
`handoff/tmp/ui2/`, `handoff/tmp/verify-core3-ui/`, `handoff/tmp/core3-ai/` and `handoff/tmp/core4-fix/`. The A and
U items are numbered for this pass; they are not the U items of sections 2.3 and 8.3. For variant authors,
`handoff/IMPLEMENTING.md` describes the result (sections "Classic end rules", "Computer player", "Hidden
information" and "Quantum layer: what you get for free").

### 9.1 Package "ai"

- **A1 the computer sees the escape rule** (shogi, horde, atomic and xiangqi reports: it never played a "cannot
  escape" win on purpose and could walk into one).
  - (a) The outcomes of each candidate at the root are the real states (`stateAfter` without light mode), at every
    level: a move after which the enemy cannot escape scores as a win, one whose outcome ends the game against the
    mover as a loss. Only the quick judgement made when the time runs out before any candidate has a value stays
    light.
  - (b) After my move or an answer, a side to move that can capture an enemy royal piece for certain has won, one
    ply later (`certainEnd`, reason `king`), without a further search. The test is the core's `certainCapture`, now
    exported from quantum.js, behind a filter in ai.js (`certainTake`): the captures of each world (`capturesOf`: the
    capture branches of the movement descriptors, walked as `pieceMoves` walks them, plus the captures of
    `extraMoves`; remembered per world) must share a move key or a piece, and a shared key decides at once when the
    variant has no `filterMoves`. The filter only rejects states that cannot be certain; without it the normal level
    was up to about 10 times slower in 4D.
  - (c) With the escape rule, `mightForce` counts an outcome that leaves an enemy royal piece capturable for certain
    by the mover (a check) as forcing, so the normal level sees such answers and every level tries such moves first.
  - Addition: (b) alone cannot see the other side mate me. After an answer that may leave the side to move mated (one
    of its royal pieces capturable for certain, or `mayBeBoxed`), the search uses the answer's real state
    (`answerState`); also when the light state is a quiet-move or bare-kings draw, since a played move applies the
    escape rule first. `mayBeBoxed` covers quiet mates (the king not attacked, every move walks into a capture): the
    side has a royal piece, at most three other pieces on the board and in hand, and no step of a royal piece that
    `safeStep` proves safe (a quiet step onto a square empty in every world, the same move in every world, after
    which no enemy capture takes a royal piece in any world). A move that might box the enemy in is forcing too.
- **A2 ties** (koth report): a level without noise adds `rng() * 1e-3` to each value, so exact ties are broken at
  random. Hard against hard no longer shuffles a rook back and forth; hard's first move varies by seed and repeats
  for the same seed.
- **A3 stand pat** (horde report): below the hard level the replying side's best value starts at
  `evaluateState(V, s, them)`, so it may decline every forcing answer. The `it.todo` of `horde.spec.js` is now a real
  test (the normal level takes the free knight, `e4-d5`); it fails without A3.
- **A4** the `mightForce` comment: every outcome counts, a Missed one too (in antichess a side left without a move
  wins, in horde it draws, and with the escape rule the side to move may be boxed in).
- **A5** `aiView(state, side, level)`: the level id (`'easy'`, `'normal'` or `'hard'`) as a third argument. The
  existing hooks (Kriegspiel, Dark chess, the multiverse) ignore it.
- **Addition: a third move at the hard level** (`deep: 8` in `LEVELS`; `deepen`, `deepValue`, `myBest`). Once the
  two-move pass is complete, in a variant of two sides, with more than one scored candidate and no sure win, the hard
  level re-scores its best 8 candidates (by value rounded to a centipawn, forcing moves first among equals): after
  each answer, my best forcing move or none. It uses the time left less a tenth of the level's budget, keeps a
  re-scored move only when its whole evaluation fitted, and yields to the browser every 12 ms (`pacer`). The answers
  are taken in the order of their two-move value, and the scan stops as soon as that value alone is no better for
  the other side than the best answer found (a third move never lowers my value). It finds a knight fork of king and
  rook with every seed.
- **Variant tests that pinned the old behaviour** (L5; each now follows the rules):
  - `atomic.spec.js` T1: a quiet move after which Black cannot escape the blow-up also wins at once; the test accepts
    `exploded` or `cannotEscape`.
  - `crazyhouse.spec.js` "takes a king it can take": the queen drop `q@d8` also wins at once; the test asserts a
    certain immediate win instead of `f7-h8`.
  - `threecheck.spec.js` T8: a first check (`d1-h5`) is now forcing by (c); a quiet move that is not forcing was
    added.
  - `core-ai-ui.spec.js`, two U3 tests: they pinned the tie order `e1-f1`; the check `d1-e2` is now tried first and
    ties, so they assert "not `d1-d5`".

### 9.2 Package "ui"

- **U1 hidden information** (kriegspiel report). `src/variantplay/marks.js` gains three pure helpers:
  `boardInteractive` (a human to move, no hand-over step, no curtain, and in a hidden variant the viewer to move),
  `blindTargetAllowed` (a target on a square the viewer cannot see only from `candidateMoves` for moves and drops, or
  from `ownView` for Split and Merge) and `focusSquares` (the visible from squares of the viewer's moves and the
  marked targets). The composable's new `interactive` gates clicks, drops, the selection and the target marks; the
  view's `moverLooks` and `focusable` use it; `VariantBoard` gives a hidden cell tabindex 0 only as a marked target
  and names only the viewer's own pieces on it. A from square the viewer cannot see is no longer focusable at all
  (before: when the viewer's own piece might stand there).
  - Decision taken while building: "never a target mark on a square the viewer cannot see" is not applied literally
    to Kriegspiel. Its visibility is only the squares of its own pieces, so the literal rule would remove every move
    dot and make it unplayable by keyboard. Its targets come from `candidateMoves` and `ownView`, which use only the
    viewer's own pieces, and the component tests check that the board is identical whatever stands on the hidden
    squares. Dark chess never has such targets.
- **U2 outcome results** (threecheck report). `outcomes()` adds `result` to an outcome that ends the game, as the
  light `stateAfter` decides it (`buildState` with a new `preview` flag): `worldResult` (the same in every world
  after the game-end roll), `stateResult`, the bare-kings and quiet-move draws and the move limit. When a generic draw
  or the move limit would end it, the escape rule is checked first (fix round: a played move applies the escape rule
  before them, so the preview showed a draw where the move wins); otherwise "cannot escape" and "no legal move" are
  left to the played move. When the game goes on the field is left out rather than set to `null`, since existing
  tests compare outcome objects exactly (`bughouse.spec.js`, `core-quantum.spec.js`). `endText(V, result, notes)` in
  texts.js gives "The game ends: {result}" (an existing, translated string) unless an `end:` note with a result says
  it already. The pending box shows it per outcome; the roll box shows it from the real result of the played move, so
  also for "the king could not escape". In a running hidden game the pending outcomes carry no `result` (fix round:
  whether an outcome ends the game depends on hidden pieces, for example a quiet-move draw that waits).
- **U3 escape speed, exact** (hexagonal report: a mate on the hex board could freeze the app for up to 0.8 s).
  `splitThreats` works out, once per target, the threats over the worlds of the split's quiet move to that target
  (`commonThreats`, `keepThreats`). A pair of targets is skipped only when a threat key is common to both halves and
  to the idle worlds, which are built with that split's own action (`applyMiss`): exactly when `splitTrapped` would
  skip it by a certain key. Every other pair falls back to `splitTrapped`. The single moves never decide alone: a
  split can escape where neither of its quiet moves does (each half blocks another line). `movesOnto(V, b, id, to)`
  (exported) finds a piece's descriptor moves onto one square by following only the lines through it, in
  `pieceMoves` order; `keyMove` and `mergeMove` use it. Median ms per real move, committed core and new core in the
  same run (a machine loaded by other agents):

| Position | Committed | New |
|---|---|---|
| hyper4d, 8 worlds, 7029 actions | 39 | 37 |
| hyper4d, 8 worlds, 3844 actions | 53 | 50 |
| hexagonal, 8 worlds, 1362 actions | 10 | 7 |
| raumschach, 8 worlds, 809 actions | 20 | 10 |
| hyper4d, 32 worlds | 135 | 86 |
| hyper4d, 64 worlds | 255 | 93 |
| raumschach, 64 worlds | 40 | 20 |

  The target of under 150 ms at 8 worlds is met. The reported 0.8 s was not reproduced: the review's own probe
  (`handoff/tmp/final-hexagonal/matecost.mjs`, 10 seeds) takes at most 51 ms on the committed core and 33 ms now.
- **U4 five squares** (antichess and hexagonal reports): the classic engine allows it too (`docs/engine-rules.md`
  7.5). After the same moves, the link `a1-a8` is one unrolled outcome with the rook on 5 squares, and the classic
  engine refuses the matching split with `location_cap`. So the core is unchanged, and `docs/variants.md` item 8 now
  says that a split never spreads a piece over more than 4 squares and that a blocked slide can add one more (in
  commit 4ec4e9f). Two tests play the same moves in the variants core and in the classic engine: both link the rook
  onto a fifth square (the same five squares and chances) and both refuse the split `a1-b1|c1`.
- **U5 shogi spin**: `pieceSpin(V, side, rotation)` in glyphs.js (the side's `rotate` plus the board's rotation) is
  used by the board, the hands and the promotion box, so Gote's pieces point down in Sente's view off the board too.
- **U6 fuzz**: `randomOptions` in `fuzz.spec.js` draws seeded values for the options marked `random` (a whole number
  within the bounds, a choice or a boolean), so the Chess960 fuzz games start from random, reproducible positions.

### 9.3 Verification and measurements

- **Escape rule (U3).** A brute-force oracle over every action and outcome (`handoff/tmp/verify-core3-ui/oracle.mjs`)
  found no mismatch on random quantum positions with ghosts of both sides: 8,755 orthodox positions (191 mates),
  2,082 hexagonal (54) and 1,935 raumschach (8). The tests add four positions where only a split escapes (idle worlds
  and a three-line case included), mates on hexagonal, 5 × 5 × 5 and 4D compared with a plain search, a variant whose
  `applyMiss` depends on the action, and `movesOnto` against `pieceMoves` in all 20 variants; three deliberately
  broken copies of the code were each caught. Mates with a big army at 8 worlds took 6–10 ms (hexagonal), 8–12 ms
  (raumschach) and 22–42 ms (4D) per real move, converging-capture mates at 8 worlds 5–28 ms.
- **Certain captures (A1 b).** `certainTake` agreed with the core's `certainCapture` on about 2.2 million random
  quantum states in 12 variants (145,364 of them certain), without a mismatch (`handoff/tmp/core3-ai/par-*.log`).
- **Wins at once.** In positions with a move that wins in every outcome, found by random play in atomic, hexagonal,
  horde, hyper4d, orthodox chess, raumschach, shogi and xiangqi (with several worlds too), every level found the win
  with both seeds, within its budget (`handoff/tmp/core3-ai/wf*-*.log`).
- **Strength.** Hard against normal, 20 games per variant with both colours (`handoff/tmp/core4-fix/final/`): in
  orthodox chess hard won 18 and normal none (1 even and 1 with normal ahead at the ply limit); in atomic hard won 17
  and normal 2 (1 with hard ahead). Kriegspiel and Dark chess games at every level stayed legal and within the budgets.
- **Budgets.** On 8 × 8, 5 × 5 × 5, hexagonal and 4D positions of 4 to 64 worlds (`handoff/tmp/core4-fix/t-*.log`), no
  search went more than 6 ms over its budget (at most easy 406, normal 1506, hard 4003 ms). The escape checks cost
  time: in 4D at 8 worlds easy went from 32–58 ms to 124–194 ms, and from 24 worlds on it uses its whole 0.4 s, so it
  searches fewer candidates there (normal and hard already used their whole budgets in 4D).

### 9.4 Tests

New: `core-ai2.spec.js` 15 tests (the shogi, horde and atomic probes at every level, a real outcome that loses, a
mate in one found by hard with 5 of 5 seeds and by the other levels, no step into a mate in one, (b) with a pinned
knight, (c), quiet mates found and not walked into, the third move and its budget at 64 worlds, the two A2 tests and
A5), `core-ui2.spec.js` 16 (U1 helpers, U2, U3, U4, U5), `core-ui2.vue.spec.js` 9 (U1 on the real Kriegspiel and
Dark chess modules, U2 boxes, U5), 2 in `fuzz.spec.js`, and the horde test that replaced the `it.todo`. The variant
suite passes: 36 files, 1077 tests passed and 1 expected failure (an `it.fails` in `multiverse.spec.js`), counting
the multiverse team's new files.

### 9.5 Open for the lead

- Commit `src/variants/core/ai.js` together with `src/variants/core/quantum.js`: ai.js imports `certainCapture`,
  which only the new quantum.js exports.
- The header of `src/variants/core/variant.js` is out of date on two points: `recordInfo` is "Never called in light
  mode (the computer player's search)" and `escapeRule` applies "not in the computer player's search". Light states
  still skip both, but the computer's search now also builds real states (root outcomes, answers that might mate, the
  hard level's third move), where both run. `handoff/IMPLEMENTING.md` already says so.
- `allowQuantum(state, action)` (quantum.js and the variant.js header, in the working tree) is the multiverse team's
  generic hook, not part of this pass; `handoff/IMPLEMENTING.md` does not list it yet.
- Responsiveness on the largest boards: the longest stretch without a yield to the browser grew. In 4D at 64 worlds
  it reached 409–468 ms at the hard level (was 273–334 ms), and at 8 worlds 59–166 ms (was 36–45 ms); raumschach at
  64 worlds reached 379 ms (`handoff/tmp/core3-ai/tm-hyper4d-base.log`, `handoff/tmp/core4-fix/t-*.log`).
- U1: confirm the Kriegspiel exception (move dots on squares the viewer cannot see, built from its own pieces only).
- `docs/variants.md` rule 9 still opens with "There is no check in Quantum Chess", while the shared rules card says
  "Check does not limit your moves" (8.4) and the computer now treats a check as a forcing move.
