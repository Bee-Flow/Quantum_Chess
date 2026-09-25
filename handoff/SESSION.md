# Session hand-over: Quantum Chess 2.0 (chess variants)

Snapshot of a Claude Code cloud session, so the work can continue on a local machine with more parallel agents.
Branch: `claude/quantum-chess-4d-mode-2d5v1o` (never push to another branch without the owner's permission).
Snapshot date: 2026-09-25.

---

## Snel hervatten (kopiëren en plakken)

**1. In een terminal op je laptop** (Node 22 en npm 10, zoals in `package.json`):

```sh
git clone https://github.com/Bee-Flow/Quantum_Chess.git
cd Quantum_Chess
git checkout claude/quantum-chess-4d-mode-2d5v1o
git pull
npm ci
claude
```

Tip: zet in Claude Code via `/config` de optie **Dynamic workflow size** hoger (of uit), zodat workflows meer agents
tegelijk mogen draaien. Per workflow draaien er tot `min(16, aantal CPU's - 2)` agents tegelijk; meerdere workflows
mogen naast elkaar lopen.

**2. Plak dan deze prompt in Claude Code:**

```text
ultracode. We hervatten een sessie. Lees eerst handoff/SESSION.md volledig, daarna handoff/IMPLEMENTING.md en
handoff/CONTRACT.md. Voer daarna het "Resume plan" uit handoff/SESSION.md uit, stap voor stap, met zoveel
parallelle workflows als de machine aankan: stap 1 (onderzoek afmaken) en stap 2 (5D multiverse) tegelijk, en stap 3
(implementatie van de andere 18 varianten) zodra de specificaties klaar zijn. Gebruik als scratchpad de absolute
map <repo>/handoff. Werk op branch claude/quantum-chess-4d-mode-2d5v1o, commit en push na elke afgeronde stap, en
geef in het Nederlands een korte statusupdate na elke stap. Het doel: versie 2.0.0 met alle varianten uit de lijst
van de gebruiker, elk met het quantum-element, en 5D Chess with Multiverse Time Travel extra goed uitgewerkt.
```

---

## 1. What the user asked (in order)

1. "Make a version 2, with quantum chess 4d new game mode."
2. (Dutch) Research well and support **all** of these chess types, as long as there is a quantum chess element:
   3D chess (Star Trek Tri-Dimensional Chess), 5D Chess with Multiverse Time Travel, 4D chess (grid of 4 × 4 boards),
   Quantum Chess (exists), Kriegspiel, Fog of War / Dark Chess, Chess960, Atomic, Crazyhouse / Bughouse,
   Antichess, King of the Hill, Three-check, Horde, Hexagonal (Gliński), Four-player chess, Capablanca chess, Shogi,
   Xiangqi, Makruk.
3. (Dutch) Work out **5D Chess with Multiverse Time Travel and quantum** very well.
4. Save the status into a session hand-over file in GitHub with copy-paste instructions to resume locally with more
   hardware (this file).

The user communicates in Dutch; answer in Dutch. Code, comments and repository documents are in English.

## 2. Decisions taken

- **Scope**: the variants are played on this device only (pass & play and against a built-in computer player with
  three levels). Online play, ratings and the PHP rules engine stay with classic Quantum Chess (v1 engine untouched).
- **One generic quantum layer** for all variants (`src/variants/core/quantum.js`), with the rules of classic Quantum
  Chess generalised: a state is a list of weighted worlds (integer weights summing to 2^24); each world is an
  ordinary classical position of the variant. Moves: ordinary move, split, merge, measure. "Land = roll, pass =
  link"; the measured class (rolled) = solid mover, drop, or target that might hold another piece; budget 8
  arrangements per side; at most 64 worlds; at most 4 locations per piece.
- **Two generic safety nets** after every move: the **solid roll** (solid pieces such as kings and pawns, and any
  variant structure from the `solidExtra` hook, must be identical in every world; otherwise a roll settles it) and the
  **game-end roll** (if `worldResult` differs between worlds, a roll decides). This makes three-check, atomic, KOTH,
  antichess, horde, four-player elimination, etc. quantum without special code.
- **Capture the king** instead of check/checkmate (as in classic Quantum Chess). Variants that count checks count
  "the king could be captured next move" per world.
- **Hidden information** (Kriegspiel, Fog of War): `visibility(state, side)`, `candidateMoves(state)` (moves a player
  may try; an illegal try gives the umpire's "not possible" without losing the turn), `aiView(state, side)` so the
  computer does not cheat. Pass & play shows a hand-over curtain.
- **Multiverse (5D)**: the timeline structure (which boards/timelines exist, the present) is kept classical with
  `solidExtra`, pieces on the boards can be superposed; multi-move turns via `nextSide` and a "Submit turn" action
  (`actions(state)`); dynamic drawing via `layoutOf(state)`; zoom/pan in the board. The full design is being produced
  by `handoff/workflows/multiverse.workflow` (research → 3 competing designs → 2 judges → final spec → implement → UI
  with screenshots → 3 verification lenses → fixes).
- **Version**: 2.0.0 (set with `node tools/set-version.mjs 2.0.0 --date <yyyy-mm-dd>` at the end; CHANGELOG notes go
  under `## [Unreleased]` first).
- **Undo** uses a roll memo (`<ply>:<code>` → random number) so undoing never rerolls a result already seen.

## 3. What is done (committed on the branch)

| Area | Files | Status |
|---|---|---|
| Core: topology (n-D grids, hex, points, layouts) | `src/variants/core/topology.js` | done |
| Core: classical world, movement descriptors (leap, ride, hop, lame leaper, oriented, regions), generate/apply | `src/variants/core/world.js` | done |
| Core: orthodox pieces, castling incl. 960, double step, en passant, promotion | `src/variants/core/orthodox.js`, `orthodoxVariant.js` | done |
| Core: `defineVariant` defaults and caches | `src/variants/core/variant.js` | done |
| Core: quantum layer (`branches`, `applyMove`, `outcomes`, splits, merges, measures, budget, solid and game-end rolls, `royalDanger`, views) | `src/variants/core/quantum.js` | done |
| Core: computer player (expectimax over rolls, reply search, `aiView`, `evaluate`, `materialSign`) | `src/variants/core/ai.js` | done |
| Catalogue (names, summaries, categories) and lazy loader | `src/variants/catalog.js`, `src/variants/index.js` | done |
| Variant modules | `src/variants/<id>.js` (20 files) | **placeholders** (orthodox chess) |
| UI: SVG board for any layout, pieces (cburnett sprites, tinted sprites, shogi/xiangqi/text tokens), zoom/pan | `src/variantplay/components/VariantBoard.vue`, `VariantPiece.vue`, `src/variantplay/glyphs.js` | done |
| UI: game logic (move modes, drops, promotions, confirm rolled moves, computer turns, undo + roll memo, resign, curtain) | `src/variantplay/composables/useVariantGame.js` | done |
| UI: storage, texts | `src/variantplay/variantGames.js`, `src/variantplay/texts.js` | done |
| Views and routes | `src/views/VariantsView.vue` (catalogue + New game dialog), `src/views/VariantGameView.vue`, routes `/variants` and `/variants/:variant/:id`, navigation item, home tile | done |
| Tests | `tests/js/variants/core.spec.js`, `VariantBoard.vue.spec.js`, `fuzz.spec.js` (random games in every variant with invariant checks), `helpers.js` | 38 passing |
| Docs | `docs/variants.md` (shared quantum rules; per-variant sections still to add), `docs/development/architecture.md` section 5.6 | partly |
| Lint config | ESLint entry-point rule for `variants/index.js`; `handoff/` excluded from ESLint, SPDX and line-length checks | done |

All checks passed at the snapshot: `npx eslint .`, `npm run lint:refs`, `npm run lint:lines`,
`npx vitest run tests/js/variants`.

## 4. In progress at the snapshot (cloud session)

- **Research workflow** (`handoff/workflows/research.workflow`): specs written for 15 variants
  (`handoff/research/<id>.md`), **none reviewed yet** (a reviewed spec ends with a section "8. Review notes").
  Missing: `capablanca`, `makruk`, `shogi`, `xiangqi`.
- **Multiverse workflow** (`handoff/workflows/multiverse.workflow`): the three research files are written
  (`handoff/research/multiverse-rules.md`, `-pieces.md`, `-engines.md`); next phase: the three designs.
  `handoff/research/multiverse.md` is an earlier simplified spec from the general research.
- The cloud session may still push results later: always `git pull` before starting.

## 5. Resume plan

Use the absolute path of `handoff/` as the workflow `scratchpad` argument (the scripts read and write
`<scratchpad>/research`, `<scratchpad>/docs`, `<scratchpad>/IMPLEMENTING.md`, `<scratchpad>/CONTRACT.md`).
Workflow scripts can be started with the Workflow tool: `{ scriptPath: "<repo>/handoff/workflows/<name>.workflow",
args: {...} }`.

**Stap 0: optional reference sources.** The researchers cloned these (ignored by git; clone into `handoff/ext/` or
`handoff/5dsrc/` if an agent needs them):
- 5D: gitlab.com/5d-chess/5d-chess-js, gitlab.com/5d-chess/5d-chess-renderer, gitlab.com/5d-chess/5d-chess-db,
  github.com/adri326/5dchess-tools, github.com/adri326/5dchess-notation, github.com/adri326/5dchess-variants,
  github.com/ftxi/5dchess_engine, github.com/Hexicube/5D-Chess-Game-Viewer, github.com/Slavrick/5dChessGUI,
  github.com/penteract/cwmtt.
- Others: github.com/fairy-stockfish/Fairy-Stockfish, github.com/gbtami/pychess-variants,
  github.com/obryanlouis/4pchess, github.com/saFilipJohansson/4D-Chess, github.com/lukajk1/4D-chess, and the
  lichess scalachess sources (github.com/lichess-org/scalachess).
- `handoff/tools/` holds the researchers' small reference generators (Python and `.mjs`) used to compute move counts.

**Stap 1: finish the research** (parallel with step 2).
Run `research.workflow` with
`args: { scratchpad: "<repo>/handoff", skip: [<ids that already have handoff/research/<id>.md>], done: [<ids whose spec
already has "8. Review notes">] }`. At the snapshot: `skip` = antichess, atomic, bughouse, chess960, crazyhouse,
darkchess, fourplayer, hexagonal, horde, hyper4d, koth, kriegspiel, raumschach, threecheck, trid;
`done` = multiverse (the multiverse workflow of step 2 replaces its simplified spec). It researches capablanca,
makruk, shogi, xiangqi and critiques every other spec.

**Stap 2: the 5D multiverse** (parallel with step 1).
Run `multiverse.workflow` with `args: { scratchpad: "<repo>/handoff", skipResearch: true }`. It writes
`handoff/research/multiverse-design-*.md`, `multiverse-final.md`, implements `src/variants/multiverse.js` and its
tests, improves the UI (layout arrows, present, submit, boards still to move) with Playwright screenshots in
`handoff/screens/`, verifies with three lenses and applies the fixes. Afterwards: read the result, run all checks,
look at the screenshots, commit.

**Stap 3: implement the other 18 variants** (as soon as their specs are reviewed; batches are fine).
Run `implement.workflow` with `args: { scratchpad: "<repo>/handoff", ids: [...] }` where ids are from: raumschach,
trid, hyper4d, kriegspiel, darkchess, chess960, atomic, crazyhouse, bughouse, antichess, koth, threecheck, horde,
hexagonal, fourplayer, capablanca, shogi, xiangqi, makruk. One implementer per variant (module
`src/variants/<id>.js`, tests `tests/js/variants/<id>.spec.js`, docs snippet `handoff/docs/<id>.md`), then an
adversarial verifier per variant that probes the rules by running code and fixes defects.

**Stap 4: integrate.**
- Read every report; apply requested core changes carefully in `src/variants/core/` (with tests), then rerun
  `npx vitest run tests/js/variants`.
- Merge the snippets `handoff/docs/*.md` into `docs/variants.md` (section "The variants", ordered by the categories of
  `src/variants/catalog.js`).
- Run the whole suite: `npm run lint`, `npm run lint:refs`, `npm run lint:lines`, `npm test`, `npm run build`.

**Stap 5: translations** (nl, de, de_DE, fr; `translationfiles/README.md`, glossary `translationfiles/GLOSSARY.md`).
`npm run l10n:extract && npm run l10n:merge`, then translate every empty `msgstr` (one agent per language in
parallel; `de_DE` gets the same text as `de`), `npm run l10n:build`, `npm run l10n:check`, `npm run l10n:verify`.
New game terms (unicorn, timeline, present, submit turn, umpire, drop, hand, hill, check, explosion, ...) should be
added to the glossary.

**Stap 6: release 2.0.0.**
README (features: the variants, screenshots if possible), `CHANGELOG.md` (notes under `## [Unreleased]`, then
`node tools/set-version.mjs 2.0.0 --date <today>`), App Store description in `appinfo/info.xml` (English only),
`make version-check`. Consider new screenshots (`npm run screenshots` needs a Nextcloud; otherwise skip).

**Stap 7: final verification and hand-over.**
Everything green (`npm run lint`, `lint:refs`, `lint:lines`, `npm test`, `npm run build`, `npm run l10n:check`,
`make version-check`, `make lint-spdx`; the PHP checks are unaffected but can be run with `composer run lint`,
`composer run test:unit`). Try the app in a real Nextcloud if one is available (every variant: start a game, a
split, a roll, a computer move, undo). Delete `handoff/` in the final commit before merging (it is not shipped in
the App Store package, but it is session material). Only open a pull request when the owner asks for one.

## 6. Conventions that CI enforces

- Tabs, no semicolons, single quotes, trailing commas, JSDoc on every function, BEM class names with `qc-`.
- Max line length 120 (tabs count 4); translatable strings stay whole on one line.
- SPDX header in every source file (`.js`, `.mjs`, `.vue`, `.scss`, `.php`, `.yml`).
- User-visible text only through `t('quantumchess', 'literal')` / `n(...)`; translations must be complete for nl,
  de, de_DE and fr (`npm run l10n:check` in CI).
- No section sign in comments outside the rules engine unless the line names `docs/engine-rules.md`; no TODO without
  an issue number; `docs/….md` paths named in code must exist; relative Markdown links must resolve.
- Outside `src/variants/`, import the variants only through `src/variants/index.js` (ESLint rule).
- Commit messages end with the Claude attribution lines used in the existing commits of this branch.

## 7. Known risks and open points

- Speed of the computer player on large boards (4D has 256 squares, the multiverse many boards): the AI is
  time-sliced (easy 0.4 s, normal 1.5 s, hard 4 s) but move generation per world must stay light.
- Four-player chess and bughouse have four sides: the board rotates per viewer (`sides[i].rotate`), turn order skips
  eliminated players (`isOut`), results can name several winners (`winners`).
- Kriegspiel/Fog of War: check that the UI never leaks hidden information (move list, last-move marks, roll box,
  targets) and that the computer uses `aiView`.
- `docs/variants.md` still needs the per-variant sections, and the in-app texts need translations before CI is green
  (`npm run l10n:check` fails until step 5 is done).
- The placeholders in `src/variants/<id>.js` play orthodox chess until each variant is implemented.
