# Quantum Chess for Nextcloud: technical specification (v2)

This document is the **implementation contract** for Quantum Chess 1.0: architecture, file layout and ownership,
engine and AI APIs, database schema, HTTP API, server game flow, integrations, settings, security, the frontend
structure and, above all, the **interfaces between modules**, so that twelve engineers can build the app in parallel
without guessing. The work split itself is in [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md).

## 0. How to read this document

### 0.1 Precedence

| Topic | Authoritative document |
|---|---|
| Game rules, engine semantics, randomness, the game record | [`ENGINE-RULES.md`](ENGINE-RULES.md) (normative). It wins over this file on anything about rules. |
| Product, UX, trainer content, AI behaviour, copy, timings, priorities | [`GAME-DESIGN.md`](GAME-DESIGN.md). This file references its sections instead of repeating copy, timings and layouts. |
| Architecture, APIs, data model, file layout, module interfaces, quality gates | **This file.** Where GAME-DESIGN names a file, route or field differently, this file wins. |
| The rules as players read them | [`RULES.md`](RULES.md) |

"ER §x" means ENGINE-RULES.md §x, "GD §x" means GAME-DESIGN.md §x.

### 0.2 Priority markers

Everything in this document is **P0** (required for 1.0) unless it is marked **[P1]** or **[P2]**. P1/P2 items are
listed so that names, columns and hooks are reserved now; they are **not** implemented in 1.0 unless a module's plan
says so. Reserved database columns are created by the 1.0 migration even when their feature is P1.

### 0.3 Ownership markers

Every file path, class, route and component has exactly one owning module (IMPLEMENTATION-PLAN §1). In this document
the owner is written as `‹module›`, for example `‹backend-games›`. A module changes only its own paths. Requests to
other modules go to `.integration-notes/<module>.md` (IMPLEMENTATION-PLAN §4).

### 0.4 Conventions used everywhere

- Every source file starts with the SPDX header used by the existing files (`SPDX-FileCopyrightText: 2026 BeeFlow`,
  `SPDX-License-Identifier: AGPL-3.0-or-later`). Indentation is tabs. No `console.log` in shipped code.
- User-visible strings: `t('quantumchess', '…')` / `n('quantumchess', …)` in JS, `IL10N` in PHP, placeholders
  (`{name}`) instead of concatenation.
- Timestamps in the database, the API and the chain are **Unix seconds** (integers). JS-internal durations are ms.
- Colours are `'w'` and `'b'` everywhere in code and JSON. Squares are integer indices 0–63 in JSON (ER §2.1), names
  (`e4`) only in codes, notation and copy.
- Engine states cross every boundary (API, storage, worker) as the canonical state object of ER §2.5; when bytes
  matter (chain, fixtures, idempotency) as its canonical JSON string (ER §2.6).
- JSON field names in the HTTP API are camelCase. Database columns are snake_case.

---

## 1. Overview

| | |
|---|---|
| App id | `quantumchess` (folder name, `info.xml` `<id>`, signing certificate CN) |
| PHP namespace | `OCA\QuantumChess` (`lib/`), PSR-4; tests `OCA\QuantumChess\Tests` (`tests/php/`) |
| Nextcloud | 32 – 35 (`info.xml`), PHP ≥ 8.1, 64-bit PHP required (ER §12) |
| Frontend | Vue 3.5 + `@nextcloud/vue` 9 + `vue-router` 5 (hash history), plain JavaScript ES modules with JSDoc types |
| Build | Vite 7 via `@nextcloud/vite-config` (`npm run build` → `js/quantumchess-*.mjs`; CSS injected by JS) |
| Tests | Vitest (`npm test`), PHPUnit 10 (`composer test:unit`), Playwright e2e against a real Nextcloud |
| Lint | ESLint 10 + `@nextcloud/eslint-config` (`npm run lint`), php-cs-fixer with `nextcloud/coding-standard` (`composer cs:check`), Psalm (`composer psalm`) |
| License | AGPL-3.0-or-later |

Not an ExApp: everything runs inside Nextcloud's PHP process and the browser. The app makes **no external requests**
except to an AI provider that an administrator or the user configured.

### 1.1 Architecture at a glance

```
Browser (Vue SPA in #content)                                      Nextcloud server (PHP)
┌───────────────────────────────────────────────┐   JSON (axios)  ┌──────────────────────────────────────────────┐
│ App shell · views · game screen · trainer      │ ──────────────▶ │ Controllers (appinfo/routes.php)             │
│   │ composables (GameController interface)     │                 │  Page · Game · OcsGame · Stats · Preferences │
│   ├─ src/engine        JS rules engine (twin)  │                 │  Me · Ai · Settings                          │
│   ├─ src/engine/ui     display helpers         │                 │ Services                                     │
│   ├─ src/ai            Web Worker: search,     │                 │  GameService ── lib/Engine (PHP twin)        │
│   │                    analysis, solver        │                 │  InvitePolicy · TimeControl · RatingService  │
│   ├─ src/coach         coach + review logic    │                 │  GameCache (distributed cache) · FairPlay    │
│   ├─ src/trainer       lessons, puzzles,       │                 │  NotificationService · StatsService          │
│   │                    achievements            │                 │  PreferencesService · DataDeletionService    │
│   └─ localStorage: local games + roll memo,    │                 │  Ai: LlmService → TaskProcessing |           │
│      chain cache, review cache, progress copy  │                 │      OpenAI-compatible | Anthropic           │
└───────────────────────────────────────────────┘                 │ DB: qchess_games · qchess_moves ·            │
     ▲ Notifications (web, mobile, desktop via OCS actions)        │     qchess_chat · qchess_ratings             │
     ▲ Dashboard widget                                            │ Notifier · Dashboard widget ·                │
                                                                   │ GameMaintenanceJob · UserDeletedListener     │
                                                                   └──────────────────────────────────────────────┘
```

- **Online games are server-authoritative.** The browser proposes a move; PHP validates it with the PHP engine,
  draws `u = random_int(0, 2^24 − 1)` only if the move is rolled (ER §9.2), applies it, extends the hash chain
  (ER §9.4), stores everything in one transaction and returns the result.
- **Local games** (computer, AI opponent, pass & play), lessons, puzzles and the lab run entirely in the browser with
  the JS engine. Local games use the **roll memo** (ER §9.3). The LLM is reached through the server; API keys never
  leave the server.
- **The JS and PHP engines are twins**: same state bytes, codes, legal-move order, sampling and derived views, proven
  by shared fixtures generated by the JS engine and replayed by PHPUnit (§3.5).

---

## 2. Repository layout and ownership

Ownership is by path. A directory marked with a module belongs to it entirely, unless a more specific entry says
otherwise. Files not listed belong to **packaging**.

```
appinfo/info.xml, appinfo/routes.php          spec-integrator (this contract); later changes via packaging
docs/SPEC.md, docs/IMPLEMENTATION-PLAN.md     spec-integrator
docs/RULES.md                                 spec-integrator (wording only); docs/ENGINE-RULES.md, docs/GAME-DESIGN.md: lead

lib/AppInfo/Application.php                   backend-integration
lib/Engine/**                                 engine-php
lib/Db/**, lib/Migration/**                   backend-games
lib/Exception/**                              backend-games   (ApiException, shared by all controllers)
lib/Event/**                                  backend-games   [P1: typed events for notify_push]
lib/Service/GameService.php                   backend-games
lib/Service/GameSerializer.php                backend-games
lib/Service/InvitePolicy.php                  backend-games
lib/Service/TimeControl.php                   backend-games
lib/Service/RatingService.php                 backend-games
lib/Service/GameCache.php                     backend-games
lib/Service/FairPlayService.php               backend-games
lib/Service/ExportService.php                 backend-games
lib/Controller/GameController.php             backend-games
lib/Controller/OcsGameController.php          backend-games
lib/BackgroundJob/**                          backend-games   (GameMaintenanceJob)
lib/Listener/UserDeletedListener.php          backend-games
lib/Command/**                                backend-games   [P1 occ commands]
lib/Service/NotificationService.php           backend-integration
lib/Notification/**                           backend-integration (Notifier, MoveDescriber)
lib/Dashboard/**                              backend-integration
lib/Service/StatsService.php                  backend-integration
lib/Service/PreferencesService.php            backend-integration
lib/Service/TrainerProgressService.php        backend-integration
lib/Service/DataDeletionService.php           backend-integration
lib/Controller/PageController.php             backend-integration
lib/Controller/StatsController.php            backend-integration
lib/Controller/PreferencesController.php      backend-integration
lib/Controller/MeController.php               backend-integration
templates/main.php                            backend-integration
lib/Service/Ai/**                             backend-ai
lib/Service/SettingsService.php               backend-ai      (typed access to every app/user setting)
lib/Controller/AiController.php               backend-ai
lib/Controller/SettingsController.php         backend-ai
lib/Settings/**                               backend-ai      (AdminSettings, PersonalSettings, Section)
templates/settings/**                         backend-ai

src/main.js, src/App.vue, src/router.js       frontend-app
src/engine/** (except src/engine/ui/**)       engine-js
src/engine/ui/**                              frontend-board  (JS-only display helpers, §3.3)
src/ai/**                                     ai-js
src/components/board/**                       frontend-board
src/sound/**                                  frontend-board  (sound.js, haptics.js)
src/styles/tokens.scss, src/styles/board-themes.scss   frontend-board
src/styles/app.scss                           frontend-app
src/components/app/**                         frontend-app    (navigation, dialogs, empty states)
src/components/game/**                        frontend-app    (game screen and shared game components)
src/components/settings/**                    frontend-app    (in-app settings dialog)
src/components/ai/**                          frontend-app    (AI notice dialog, AI opponent chat)
src/components/home/**                        frontend-app    (play tiles, home layout)
src/composables/**                            frontend-app
src/services/**                               frontend-app    (api.js, preferences.js, localGames.js, format.js, aiTasks.js, ids.js, storage.js)
src/personas/**                               frontend-app    (persona catalogue, avatars, canned lines)
src/rules/**                                  frontend-app    (Rules page content)
src/online/**                                 frontend-online (useOnlineGame, usePoller, lobby store, broadcast, chain check)
src/components/online/**                      frontend-online
src/components/lobby/**                       frontend-online
src/components/stats/**                       frontend-online
src/coach/**                                  coach-review
src/components/coach/**                       coach-review
src/components/review/**                      coach-review
src/trainer/**                                trainer         (lessons, puzzles, puzzles.json, predicates, progress, achievements, events)
src/components/trainer/**                     trainer
src/settings/**, src/settings-admin.js, src/settings-personal.js   backend-ai
src/views/HomeView.vue, LocalGameView.vue, RulesView.vue            frontend-app
src/views/OnlineGameView.vue, HistoryView.vue, StatsView.vue        frontend-online
src/views/ReviewView.vue                                            coach-review
src/views/TrainerHomeView.vue, LessonView.vue, PuzzleView.vue, LabView.vue   trainer

tools/trainer-validate.mjs, tools/puzzles-build.mjs   trainer
tools/** (everything else)                    packaging
tests/fixtures/engine/**, tests/fixtures/generate-engine-fixtures.mjs   engine-js
tests/js/engine/**                            engine-js
tests/js/board/**, tests/js/engine-ui/**      frontend-board
tests/js/ai/**                                ai-js
tests/js/app/**                               frontend-app
tests/js/online/**                            frontend-online
tests/js/coach/**                             coach-review
tests/js/trainer/**                           trainer
tests/js/settings/**                          backend-ai
tests/php/Unit/Engine/**                      engine-php
tests/php/Unit/Games/**                       backend-games
tests/php/Unit/Integration/**                 backend-integration
tests/php/Unit/Ai/**                          backend-ai
tests/php/bootstrap.php, phpunit.xml          packaging
tests/api/<module>.mjs                        each backend module its own file (HTTP smoke scripts, §15.3)
tests/e2e/<module>.spec.mjs                   each module its own spec file
tests/e2e/** (config, helpers, screenshots)   packaging
tests/load/**                                 packaging (k6)
img/app.svg, img/app-dark.svg, img/overlay-*.svg, img/pieces/**   packaging (icons); piece sets are read by frontend-board
l10n/**, .l10nignore, screenshots/**, README.md, CHANGELOG.md, RELEASING.md, .github/**   packaging
package.json, package-lock.json, composer.json, vite.config.js, vitest.config.js, eslint.config.js, psalm.xml   packaging
```

### 2.1 npm and composer scripts

`package.json` is packaging's; these script names are fixed so that every module can rely on them. Packaging adds
the missing ones on day 0; the module named in brackets delivers the file the script runs.

| Script | Command | Delivers |
|---|---|---|
| `build`, `dev`, `watch`, `test`, `test:watch`, `lint`, `lint:fix` | as today | – |
| `fixtures` | `node tests/fixtures/generate-engine-fixtures.mjs` | engine-js |
| `bench` | `vitest bench --run` (files `tests/js/**/*.bench.js`) | engine-js, ai-js |
| `trainer:validate` | `node tools/trainer-validate.mjs` | trainer |
| `puzzles:build` | `node tools/puzzles-build.mjs` | trainer |
| `size` | `node tools/check-bundle-size.mjs` (after `build`) | packaging |
| `test:e2e` | `playwright test -c tests/e2e/playwright.config.mjs` | packaging |
| `screenshots` | `node tests/e2e/screenshots.mjs` | packaging |

`tools/*.mjs` and the fixture generator run in plain Node 22: code they import (engine, AI, trainer data) must not
import `.vue` files, `@nextcloud/vue` or touch `window`/`document` at import time. Trainer data modules therefore wrap
translated text in thunks (`() => t('quantumchess', '…')`) and import `t` only through `src/trainer/i18n.js`, which
the Node tools can load without a browser (§14.8).

Composer scripts stay: `lint`, `cs:check`, `cs:fix`, `psalm`, `test:unit`.

### 2.2 Dependencies

Runtime dependencies are frozen to the current `package.json` plus **`@nextcloud/password-confirmation` ^6.1.0**
(password confirmation for admin secrets and *Delete my data*). Dev: **`@playwright/test`** (e2e; browsers are not
downloaded, the executable comes from `QC_CHROMIUM`). No other dependency may be added without a SPEC change: no chart,
Markdown, UUID, date or state-management libraries. Charts are hand-written SVG; Markdown is rendered by `NcRichText`;
ids come from `crypto.getRandomValues` (`crypto.randomUUID` and `crypto.subtle` do not exist on plain-HTTP instances).
PHP has no runtime composer dependencies (the app ships without `vendor/`).

---

## 3. Rules engine

Both engines are **pure and synchronous**: no DOM, network, clock, locale or `Math.random` (ER §9.1). States are
immutable: functions return new objects and never mutate inputs; implementations MAY cache derived data per state
object (JS `WeakMap`) because states never change. Everything normative lives in ER; this section fixes names,
signatures and return shapes.

### 3.1 Shared data shapes

| Shape | Definition |
|---|---|
| `State` | ER §2.5, keys in that order. Serialised canonically per ER §2.6. |
| `MoveObject` | `{type: 'standard'\|'split'\|'merge'\|'measure', from: number[], to: number[], promo?: 'q'\|'r'\|'b'\|'n'}` (ER §4.1) |
| `LegalMove` | ER §4.10, keys in this order: `type, from, to, promo?, code, piece, resolution, measured, fallback, capture, happenWeight, outcomes, successProbability`. `outcomes` is `[{key, weight}]`. |
| `MeasurementRecord` | ER §5.5: `{key, u, captured, outcomes: [{key, weight}], fallback}` (canonical key order). |
| `Outcome` | ER §5.6: `{key, weight, probability, happened, captured, state}` |
| `ReasonCode` | the 23 `whyIllegal` codes of ER §4.11, exported as `ILLEGAL_REASONS` in check order |
| `EngineResultReason` | `king_captured`, `king_trapped`, `bare_kings`, `repetition`, `fifty_moves`, `max_ply`, `no_moves` |
| `ParsedMove` | `null`, `{castle: 'O-O' \| 'O-O-O'}`, or `{type, from, to, promo?, letter?}` (split targets / merge sources sorted by index, `promo` lower case, `letter` ∈ `K Q R B N` only when given) (ER §4.12) |
| `SetupSpec` | `{state}` or `{fen, prelude?: string[]}`; prelude items are canonical codes with optional `@key` (ER App. A) |

### 3.2 JavaScript API (`src/engine/index.js`) ‹engine-js›

Other modules import **only** from `src/engine/index.js` (and `src/engine/ui/index.js`, §3.3). Internal files may
change freely.

**Constants.** `V, T, BUDGET, MAX_WORLDS, MAX_LOCATIONS, FIFTY_MOVE_PLIES, REPETITION_COUNT, MAX_PLY,
LINK_THRESHOLD, PIECE_TYPES, PROMOTION_TYPES, INITIAL_TYPES, START_SQUARES, WHITE_KING, BLACK_KING, START_JSON,
START_HASH, CASTLING, CASTLING_FLAGS, RESULT_REASONS, WIN_REASONS, ILLEGAL_REASONS, SETUP_ERRORS, OUTCOME_KEYS`.
There is no `MIN_BRANCH_WEIGHT`.

**Errors.** `IllegalMoveError` (`.code` = reason code, `.move` = input), `EngineArgumentError` (bad `u`, `rng`
result or forced `outcome`, ER §5.2; never an illegal move), `SetupError` (`.code` ∈ `SETUP_ERRORS`, `.detail`),
`InvalidStateError` (`.code` = `shape` or `I1`…`I12`; thrown by functions that require a valid state and detect
otherwise).

| Function | Returns / behaviour |
|---|---|
| `initialState()` | the start `State` (equals `JSON.parse(START_JSON)`) |
| `validateState(input)` | `{ok: true, state}` (fresh canonical copy) or `{ok: false, error, message}` with `error` ∈ `shape`, `I1`…`I12`. Accepts an object or a JSON string. Never throws. Strict: for all untrusted input. |
| `parseState(json)` | same as `validateState(json)` |
| `serializeState(state)` | canonical JSON string (ER §2.6) |
| `canonicalCopy(state)` | deep copy with canonical key order |
| `positionHash(state)` | 16 lowercase hex digits (ER §5.4) |
| `gameResult(state)` | `null` or `{result, reason}` (a copy of `state.result`) |
| `generateMoves(state)` | `LegalMove[]` in ER §4.10 order; `[]` when `result ≠ null` |
| `hasAnyLegalMove(state)` | `boolean`, stops at the first legal move |
| `findMove(state, moveOrCode)` | the matching `LegalMove` or `null` (lenient parser, piece-letter check, castling markers, Measure on any part) |
| `isLegal(state, moveOrCode)` | `whyIllegal(...) === null` |
| `whyIllegal(state, moveOrCode)` | `ReasonCode` or `null`; never throws for a valid state |
| `getOutcomes(state, moveOrCode)` | `Outcome[]` (ER §5.6); throws `IllegalMoveError` for an illegal move |
| `applyMove(state, moveOrCode, opts = {})` | `{state, move: LegalMove, measurement: MeasurementRecord \| null}`. `opts.outcome` (key) > `opts.u` (int 0 ≤ u < 2^24) > `opts.rng()` (double in [0,1)) > `crypto.getRandomValues(new Uint32Array(1))[0] >>> 8`. Options are ignored for moves that are not rolled. Throws `IllegalMoveError` / `EngineArgumentError`. |
| `moveCode(move)` | canonical code (ER §4.1) |
| `parseMoveCode(text)` | `ParsedMove` (ER §4.12 pipeline) |
| `moveNotation(stateBefore, moveOrCode, measurement = null)` | notation string (ER §5.7). `measurement` is required for rolled moves (throws `EngineArgumentError` otherwise); the `#` mark is derived by replaying the move. |
| `squareName(i)` / `squareIndex(name)` | `'e4'` / `28`; `squareIndex` returns `-1` for anything invalid |
| `worldCount(state)` | integer |
| `budget(state, color)` | `B(color)`, 1–8 |
| `squareView(state)` | `Array(64)` of `null` or `{piece, type, color, weight, probability}` |
| `pieceLocations(state)` | `Array(32)`, index = piece id, each `[{square, weight, probability}]` ascending; `[]` for captured ids |
| `conditionalView(state, square)` | `Array(64)` of `null` or `{piece, weight, probability}` (ER §8); `null` (instead of an array) if the square is certainly empty |
| `links(state)` | `[[x, y], …]` with `x < y`, sorted |
| `linkGroups(state)` | `number[][]`, each group sorted, groups sorted by first id |
| `kingDanger(state, color)` | integer weight 0…T (the probability is `weight / T`; `T` = certain danger) |
| `moveRisk(state, moveOrCode)` | a double in [0, 1], computed as `(Σ_o W_o · KD_o) / 2^48` (exact, parity-tested) |
| `kingTrapped(state)` | `boolean` (ER §6) |
| `pct(weight)` | integer 0–100 (ER §8) |
| `rollDisplay(record, labels?)` | the text form of ER §9.4 (string). `labels` maps `miss`/`move`/`capture` to display words; default `Missed`/`Moved`/`Captured` (the ER §9.4 vectors use the defaults); Measure labels are square names; `forced` replaces the roll when `u = null` |
| `rollIntervals(record)` | `{decimals: 4\|8, intervals: [{key, start, end, startText, endText, chosen}], u, uText, chosen}` — the same numbers for the roll bar (`start`/`end` are cumulative weights) |
| `setupPosition(spec)` | `State`; throws `SetupError` (ER App. A) |
| `rollIdentity(stateBefore, code)` | `'<ply>/<positionHash>/<code without =Q|=R|=B|=N>'` (ER §9.3) |
| `sha256hex(text)` | lowercase hex SHA-256 of the UTF-8 bytes; **pure JS, synchronous** (no `crypto.subtle`, which is missing on plain-HTTP instances and async) |
| `chainStart(gameId, whiteUid, blackUid, createdAt)` | `chain_0` (ER §9.4) |
| `chainNext(prev, ply, code, u, key, stateAfter)` | `chain_n`; `ply` = state ply before the move; `stateAfter` is a `State` or its canonical JSON; `u`/`key` may be `null` (written `-`) |
| `supportKey(state)` / `supportKeyMirror(state)` | fair-play support key and its colour mirror (ER App. D, §8.8) |

**AI-only exports** (ER App. C; never used by UI code, results never stored, shown or sent):
`applyForSearch(state, move, key = null)` → `State` (the outcome `key` is required for a rolled move and ignored
otherwise) and `outcomesForSearch(state, move)` → `Outcome[]`; both skip the E1b check (ER §6, App. C) and are fastest
with a `LegalMove` of the same state.

engine-js may export further helpers (for example `seededRng`, `legalCodes`, `certainFen`, `parseFen`,
`describeForLlm`, `SQUARE_NAMES`); only the names in this section are the cross-module contract. `src/engine/index.js`
does **not** re-export `src/engine/ui/` (different owner, and the Node tools must not load UI code).

Support key (ER App. D): `turn + '|' + 64 chars`, each the type letter of `occ(s)` (upper case White, lower case
Black) or `.`. Mirror: rank `r` ↔ `7 − r`, colours (letter case) swapped, `turn` swapped. Vector: the start position
has key `w|RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr` and mirror key
`b|RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr`.

### 3.3 JS-only UI helpers (`src/engine/ui/index.js`) ‹frontend-board›

Display helpers built on the public engine API. They are **not** rules, never parity-tested and never used by the
engine, the AI search or the server. Other modules (frontend-app, coach-review, trainer, frontend-online) may import
them.

| Function | Returns |
|---|---|
| `explainOutcome(state, move, key)` | why an outcome happens, by weight: for `miss` the causes `absent`, `blocked`, `own_piece`, `occupied`, `no_enemy` (`MISS_CAUSES`) with their weights and the main one (the largest; ties in that order); for other keys the pieces the outcome reveals. Exact shape in the file's JSDoc |
| `diffViews(before, after)` | `{squares: Array(64) of null \| {change: 'appear'\|'vanish'\|'solidify'\|'fade'\|'strengthen'\|…, piece, pBefore, pAfter}, pieces, captured, settled, ghosts}` for the collapse and move animations |
| `splitTargets(state, from)` | `{from, piece, reason, targets, pairs}`: every geometric target and pair with its `whyIllegal` code (`split_target_occupied`, `split_blocked`, `location_cap`, `budget_full`) or `null` |
| `identityColours(history, previous = {})` | `{[pieceId]: 1..6}` for the ghosts of the last state of `history` (a state or the list of states), in the order pieces became ghosts, recycled when solid (GD §3.4.2); `IDENTITY_COLOURS = 6` |
| `resultSentence({before, after, move, measurement, pov, names})` | `{glyph: '✓'\|'○', text, rarity: string\|null}` implementing GD §3.6.2 (translated); `pov` ∈ `mover`, `opponent`; `names = {mover, opponent}` |
| `reasonText(code)` | translated tooltip text for a `ReasonCode` (GD §3.5.3 examples) |
| `resolutionLabel(legalMove)` | `'certain'\|'quantum'\|'roll'\|'roll-budget'` for icons and copy |
| `describePosition(state, {orientation})` | the screen-reader description of GD §9.1 (**D** key) |
| `pieceName(type, color)` | translated piece name ("white knight") |
| `formatProbability(weightOrProb, {format: 'percent'\|'fraction'})` | locale-aware text via `pct()` and `Intl.NumberFormat` (GD §3.4.1) |
| `memoByHash(fn)` | memoises `fn(state, …)` per `positionHash` (LRU 64) |

### 3.4 PHP API (`OCA\QuantumChess\Engine\Engine`) ‹engine-php›

A stateless, final service class without constructor dependencies (inject it or `new Engine()`). Arrays mirror the JS
shapes exactly (lists are PHP lists, objects are string-keyed arrays in canonical key order).

```php
final class Engine {
	public const V = 1; public const T = 16777216; public const BUDGET = 8; public const MAX_WORLDS = 64;
	public const MAX_LOCATIONS = 4; public const FIFTY_MOVE_PLIES = 100; public const REPETITION_COUNT = 3;
	public const MAX_PLY = 1200;

	public function initialState(): array;
	public function validateState(mixed $data): array;              // canonical copy; throws InvalidStateException
	public function parseState(string $json): array;                // json_decode + validateState
	public function serializeState(array $state): string;           // canonical JSON (ER §2.6)
	public function positionHash(array $state): string;
	public function gameResult(array $state): ?array;
	public function generateMoves(array $state): array;             // list<LegalMove>
	public function hasAnyLegalMove(array $state): bool;
	public function findMove(array $state, array|string $move): ?array;
	public function isLegal(array $state, array|string $move): bool;
	public function whyIllegal(array $state, mixed $move): ?string;
	public function getOutcomes(array $state, array|string $move): array;
	/** @return array{state: array, move: array, measurement: ?array} */
	public function applyMove(array $state, array|string $move, ?int $u = null, ?string $outcome = null, ?callable $rng = null): array;
	public function moveCode(array $move): string;
	public function parseMoveCode(string $text): ?array;            // ParsedMove
	public function moveNotation(array $stateBefore, array|string $move, ?array $measurement = null): string;
	public function squareName(int $index): string;
	public function squareIndex(string $name): int;                 // -1 if invalid
	public function worldCount(array $state): int;
	public function budget(array $state, string $color): int;
	public function squareView(array $state): array;                // list of 64 (null|array)
	public function pieceLocations(array $state): array;            // list of 32
	public function conditionalView(array $state, int $square): array;
	public function links(array $state): array;
	public function linkGroups(array $state): array;
	public function kingDanger(array $state, string $color): int;               // weight 0…T
	public function moveRisk(array $state, array|string $move): float;
	public function kingTrapped(array $state): bool;
	public function pct(int $weight): int;
	public function rollDisplay(array $record, array $labels = []): string;
	public function rollIntervals(array $record): array;
	public function setupPosition(array $spec): array;              // throws SetupException
	public function chainStart(int $gameId, string $whiteUid, string $blackUid, int $createdAt): string;
	public function chainNext(string $prev, int $ply, string $code, ?int $u, ?string $key, string $canonicalStateJsonAfter): string;
	public function supportKey(array $state): string;
	public function supportKeyMirror(array $state): string;
	public function certainFen(array $state): string;               // FEN of the certain pieces only (ER App. B)
	public function describeForLlm(array $state, string $perspective): string;   // §10.4
}
```

Exceptions (namespace `OCA\QuantumChess\Engine`): `IllegalMoveException` (`getReason(): string`),
`InvalidStateException` (`getInvariant(): string`, `shape` or `I1`…`I12`), `SetupException` (`getReason(): string`,
`getDetail(): ?string`); bad `u`/`outcome`/`rng` values throw `\InvalidArgumentException`.

- The default random source is `random_int(0, 16777215)` (ER §9.1). `GameService` always passes an explicit `u` drawn
  with `random_int(0, 2**24 - 1)` so that it can record it (ER §9.2).
- `describeForLlm()` produces the POSITION block of ER App. B for `$perspective` (`'w'`/`'b'`, "You are Black"):
  header, certain FEN, uncertain pieces with percentages, links in words, possibilities, budgets, king danger. It
  does **not** list legal moves (the prompt builder does, §10.4). Output is ASCII/UTF-8 English, ≤ 4 KB.
- Performance: validating and applying one move ≤ 10 ms p95 on a 64-world state (the move request budget is 80 ms,
  GD §9.3). PHP validates a single move with `whyIllegal` without generating the full list (ER §4.11).

### 3.5 Fixtures and parity ‹engine-js› (generator, files) ‹engine-php› (replay)

All files live in `tests/fixtures/engine/`, are generated or hand-written by engine-js, are committed, and are
replayed by both engines. States and records are compared as **canonical JSON bytes** without tolerance; the derived
floats `successProbability` and `probability` are excluded (ER §12). Total size ≤ 8 MB; each file ≤ 2 MB.

| File | Content |
|---|---|
| `vectors.json` | hand-written vectors from ER: start JSON/hash, W1–W17, rescale vector, move-order example, `r → u` vectors, `budget_full`, trapped king, `ep` wrap, D18, setup vectors and setup errors |
| `parser.json` | ER §4.12 parser fixtures plus the round trip of every notation string of ER §10: `[{input, expect}]`, `expect` = `ParsedMove` (compared as decoded JSON) |
| `views.json` | derived-view vectors: per state `{state, kingDanger: {w, b}, budget: {w, b}, worlds, links, linkGroups, kingTrapped, squareView, moveRisk: {code: value}}` (floats compared exactly: they are exact dyadic values) |
| `records.json` | chain vector (ER §9.4), roll-display vectors (ER §9.4 table), roll-memo identity (JS only), support-key vectors |
| `games-NNN.json` | seeded random games (below) |

Game fixture format (one game per file or up to 20 games per file):

```json
{ "v": 1, "name": "random-0007", "seed": 7,
  "setup": null,
  "start": "<canonical state JSON>",
  "steps": [
    { "legal": ["a2-a3", "…"],
      "code": "g1-f3|h3", "u": null, "outcome": null,
      "after": "<canonical state JSON>",
      "measurement": null,
      "notation": "Ng1-f3|h3",
      "hash": "483a99c829aee5ce",
      "views": { "kd": [0, 0], "budget": [2, 1], "worlds": 2, "links": [], "trapped": false } } ] }
```

- The input state of step *n* is the `after` of step *n − 1* (or `start`); this is how "each step records the input
  state" (ER §12) is met without doubling the size. `setup` is a `SetupSpec` when `start` came from one.
- `u` is an integer for rolled moves, `null` otherwise; `outcome` is used instead of `u` only for forced steps.
- The generator (`npm run fixtures`, deterministic for a seed) covers everything ER §12 lists: splits, merges,
  converging captures, Measures, promotions, castling, en passant, budget-full positions, fallbacks, trapped kings,
  suspended draws and crafted weight-1 worlds. It is committed with its output; CI fails when regenerating changes
  the files.
- PHPUnit (`tests/php/Unit/Engine/`) replays every step: `generateMoves` codes equal `legal`; `applyMove(state, code,
  u: …, outcome: …)` gives exactly `after` and `measurement` (bytes); `moveNotation` equals `notation`;
  `positionHash` equals `hash`; `views` equal. The property tests of ER §12 run in both engines after every step.

### 3.6 Performance budgets (checked by `npm run bench`)

`generateMoves` on a 64-world midgame state < 5 ms; `applyMove` and `getOutcomes` < 2 ms each; `kingDanger` +
`moveRisk` for the whole legal list < 8 ms (GD §9.3). Benchmarks live in `tests/js/engine/*.bench.js`; CI warns at
+20 %.

---

## 4. Built-in AI (`src/ai/`) ‹ai-js›

The AI evaluates in **E-space** (White's expected score: win 1, draw ½, loss 0) with floats; only rules state is bound
by parity (ER App. C). It uses the engine's public API plus the AI-only exports of §3.2. The level-noise RNG is
injected and is **never** the roll source.

### 4.1 Files

| File | Exports |
|---|---|
| `src/ai/levels.js` | `LEVELS` (below), `LEAF_K = 250`, `STRENGTHS` (`relaxed`, `balanced`, `sharp`: `{level, timeMs, toleranceFactor}` = `{3, 400, 2.5}`, `{4, 800, 1}`, `{5, 1500, 0.4}`), `PIECE_VALUES` (`p 100, n 300, b 300, r 500, q 900` centipawns) |
| `src/ai/evaluate.js` | `evaluate(state, params?) → cp` (White POV), `toE(cp, k = LEAF_K)`, `materialOf(state, color)` |
| `src/ai/search.js` | `search(state, options) → SearchResult` (iterative-deepening expectimax, Star1/Star2, TT by `positionHash`, killer/history, quiescence, split pruning) |
| `src/ai/solver.js` | `solve(state, {goal, horizon, side, nodeLimit}) → SolveResult` (exact; small positions) |
| `src/ai/candidates.js` | `candidates(state, {strength, tolerance, multiPv = 6}) → Candidate[]` (GD §6.4 step 1) |
| `src/ai/analyze.js` | `analyze(state, options) → Analysis`, `evaluateMove(state, code, options) → MoveEval`, `analyzeGame(record, options)` |
| `src/ai/worker.js` | Web Worker entry (protocol §4.4) |
| `src/ai/client.js` | promise API for the UI (§4.3); runs the worker, falls back to main-thread time slices if Workers fail |
| `src/ai/benchmark.js` | `benchmark() → {nodesPerSecond, slow: boolean}` (300 ms, cached in `localStorage` key `quantumchess.engine.v1.bench`) |

### 4.2 Levels

`LEVELS` is an array of five frozen objects, index = level − 1, implementing GD §6.1 exactly:

```js
{ level: 1, id: 'wobbles', name: 'Wobbles', label: 'beginner',   // label keys: beginner|casual|club|strong|expert (translated by the UI)
  depth: 1, quiescence: 'captures', timeMs: 50, displayMs: [700, 1200], nodeBudget: 5000,
  softmaxT: 0.25, randomRate: 0.30, topHalfRate: 0, splitRate: 0.20, splitTypes: ['n', 'b'],
  merges: false, measures: false, kingShotMin: 0.5, defendRate: 0.5, rollBonus: 0, useSolver: false,
  cannedLine: 'wobbles' }
```

Names are proper names and are not translated; `label` keys are translated by the UI ("Wobbles · Beginner").
Level 5 uses the solver when ≤ 8 pieces and ≤ 16 possibilities remain. Tests use `nodeBudget` and an injected RNG.

### 4.3 Client API (`src/ai/client.js`)

All functions return promises, accept `{signal}` (an `AbortSignal`) and reject with `DOMException('AbortError')` on
abort. States are passed as `State` objects (structured clone).

| Function | Result |
|---|---|
| `bestMove(state, {level, rng?, fast?, signal?, onProgress?})` | `{code, E, depth, nodes, candidates: [{code, E}], displayMs}` — `code` is legal in `state`; `displayMs` is the level's display delay, `0` when `fast` (the *Fast engine* preference); the caller waits it out before playing |
| `analyze(state, {timeMs = 600, multiPv = 3, include = [], fogPlies = 2, signal?, onProgress?})` | `Analysis` |
| `evaluateMove(state, code, {timeMs = 400, signal?})` | `MoveEval` |
| `candidates(state, {strength, tolerance, signal?})` | `Candidate[]` |
| `solve(state, {goal, horizon, side, nodeLimit?, signal?})` | `SolveResult` |
| `analyzeGame(record, {msPerPly = 400, level = 4, signal?, onProgress})` | `GameAnalysis` (progress callback receives each `PlyAnalysis` as it arrives) |
| `cancelAll()` | aborts every running job |
| `getBenchmark()` | `{nodesPerSecond, slow}` |

Shapes (all E values are **White's** expected score in [0, 1]; `mate` is set when the solver proves a certain win):

```js
Analysis   = { E, fog: {min, max} | null, mate: {winner: 'w'|'b', moves: n} | null,
               best: [{code, E, pv: string[], resolution}],          // ≤ multiPv, best first for the side to move
               included: [{code, E}],                                // for options.include
               depth, nodes, timeMs }
MoveEval   = { code, E,                                              // ex-ante value of playing `code`
               outcomes: [{key, weight, E}] }                        // E after each outcome (1 entry if not rolled)
Candidate  = { code, E /* for the side to move */, tags: string[], ok: boolean }
SolveResult= { value, moves: [{code, value}], accepted: string[], exact: boolean }
PlyAnalysis= { ply, color, code, forced /* only one legal move */, EBefore /* best */, bestCode, bestE, secondBestE,
               bestClassicalE, playedE /* ex-ante */, outcomes: [{key, weight, E}] | null, realisedE, allowsKingShot }
GameAnalysis = { engineVersion, plies: PlyAnalysis[] }
record     = { startState: State | null, moves: [{code, u, outcome?}] }   // replayed with the recorded u
```

**Candidate tags** (machine strings, rendered to English by the server prompt builder): `king-capture:<pct>`,
`certain-capture`, `converging`, `traps-king`, `capture:<pct>:<type>` (`type` ∈ `q r b n p`), `threatens-king:<pct>`,
`probe`, `split`, `merge`, `measure`, `defends-king`, `saves:<type>`, `hangs:<type>`, `risky` (outcome spread ≥ 30 pp),
`safe` (< 5 pp), `trap` (the opponent's most natural reply loses ≥ 10 pp). `ok` = within `tolerance ×
STRENGTHS[strength].toleranceFactor` of the best E.

**Solver goals** (trainer, GD §5.2.1): `forced` (value 1 when every outcome wins within the horizon), `max` (maximum
probability of capturing the king), `survive` (minimum probability that the opponent wins within the horizon),
`material` (minimum expected material loss against the best reply, values of `PIECE_VALUES` / 100).

### 4.4 Worker protocol

Request `{id: number, type, payload}` with `type` ∈ `bestMove, analyze, evaluateMove, candidates, solve,
analyzeGame, benchmark, cancel` (payload `{id}` for `cancel`). Responses `{id, type: 'progress' | 'result' | 'error',
payload}`; errors carry `{name, message}`. One worker per page, created lazily with
`new Worker(new URL('./worker.js', import.meta.url), {type: 'module'})`; the client queues jobs and cancels superseded
coach analyses.

---

## 5. Database ‹backend-games›

One migration, `lib/Migration/Version1000Date20260923000000.php`, creates all four tables (including reserved P1
columns). Rules: table names ≤ 27 characters without prefix; index names ≤ 27 characters and unique across the
schema (prefix `qc_`); every table has a primary key; **no NOT NULL booleans** (flags are `smallint`); NOT NULL string
columns never default to `''`; strings ≤ 4000 characters (longer data is `text`). All times are Unix seconds
(`bigint`). User ids are `string(64)` and become `NULL` when the account is deleted (§8.12).

### 5.1 `qchess_games`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | bigint, autoincrement | no | | primary key |
| `creator_uid` | string(64) | yes | | who created the invitation / challenge / rematch |
| `opponent_uid` | string(64) | yes | | invitee; for open challenges the joiner |
| `white_uid`, `black_uid` | string(64) | yes | | set when the game starts (colours are assigned at acceptance, §8.2) |
| `color_choice` | string(1) | no | `r` | the creator's colour: `w`, `b` or `r` (random) |
| `status` | string(16) | no | `pending` | `pending`, `open`, `active`, `finished`, `declined`, `cancelled`, `expired`, `aborted` |
| `result` | string(8) | yes | | `1-0`, `0-1`, `1/2-1/2` |
| `result_reason` | string(32) | yes | | engine reason (ER §6) or server reason (§8.1) |
| `state` | text | no | | canonical engine state JSON (≤ 28 KB, ER §7) |
| `start_state` | text | yes | | reserved for custom starts; `NULL` = standard start |
| `ply` | integer | no | 0 | `= state.ply` |
| `turn` | string(1) | no | `w` | `= state.turn` |
| `rev` | integer | no | 0 | bumped on **every** change of the row or its moves/chat (§8.9) |
| `rated_requested` | smallint | no | 0 | the creator asked for a rated game |
| `rated` | smallint | no | 0 | the effective flag, decided at acceptance |
| `unrated_reason` | string(16) | yes | | `pair_cap`, `admin`, `aborted`, `deleted` |
| `time_control` | string(16) | no | `corr:3d` | `corr:1d`, `corr:3d`, `corr:7d`, `corr:none` |
| `deadline_at` | bigint | yes | | deadline for the side to move (`NULL` for `corr:none`) |
| `expires_at` | bigint | yes | | expiry of a pending/open game |
| `reminders` | smallint | no | 0 | bit mask of reminders sent for the current turn (§8.3) |
| `ext_days` | smallint | no | 0 | [P1] out-of-office extension days used |
| `invite_message` | string(200) | yes | | optional invitation text |
| `scope_group` | string(64) | yes | | group of a group-scoped open challenge |
| `draw_offer` | string(1) | yes | | colour that offered a pending draw |
| `draw_offer_ply` | integer | yes | | ply at which the pending offer was made |
| `last_draw_w`, `last_draw_b` | integer | yes | | ply at which that colour's last offer was declined (cool-down, §8.5) |
| `rating_w_before`, `rating_b_before` | integer | yes | | ratings before a rated result |
| `rating_w_delta`, `rating_b_delta` | smallint | yes | | applied rating changes |
| `rematch_of`, `rematch_id` | bigint | yes | | rematch links |
| `chain` | string(64) | yes | | head of the hash chain (`chain_0` at start, then `chain_n`) |
| `chat_count` | integer | no | 0 | number of chat rows |
| `mute_w`, `mute_b` | smallint | no | 0 | that player muted the opponent's chat |
| `visibility` | smallint | no | 0 | reserved for spectating [P2] |
| `created_at`, `updated_at` | bigint | no | | |
| `started_at`, `last_move_at`, `finished_at` | bigint | yes | | `finished_at` of a timeout is the deadline (§8.3) |

Indexes: `qc_g_white_status (white_uid, status)`, `qc_g_black_status (black_uid, status)`,
`qc_g_creator_status (creator_uid, status)`, `qc_g_opp_status (opponent_uid, status)`,
`qc_g_status_deadline (status, deadline_at)`, `qc_g_status_expires (status, expires_at)`,
`qc_g_status_finished (status, finished_at)`.

### 5.2 `qchess_moves`

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | bigint, autoincrement | no | primary key |
| `game_id` | bigint | no | |
| `ply` | integer | no | `state.ply` **before** the move (the first move has ply 0, as in the chain, ER §9.4) |
| `color` | string(1) | no | the mover |
| `uid` | string(64) | yes | the mover's user id (`NULL` after deletion) |
| `code` | string(16) | no | canonical code |
| `notation` | string(64) | no | `Engine::moveNotation` |
| `measurement` | text | yes | canonical JSON of the ER §5.5 record, `NULL` if not rolled |
| `chain` | string(64) | no | `chain_n` |
| `state_hash` | string(16) | no | `positionHash` of the state after the move |
| `support_key` | string(66) | no | `Engine::supportKey` of the state after the move (fair play, §8.8) |
| `client_id` | string(36) | yes | idempotency key from the client |
| `think_ms` | integer | yes | client-reported thinking time |
| `created_at` | bigint | no | |

Indexes: unique `qc_m_game_ply (game_id, ply)`, unique `qc_m_game_client (game_id, client_id)` (NULLs are distinct),
`qc_m_uid (uid)`.

### 5.3 `qchess_chat`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | bigint, autoincrement | no | | primary key |
| `game_id` | bigint | no | | |
| `uid` | string(64) | yes | | author; `NULL` for system lines and deleted users |
| `kind` | smallint | no | 0 | 0 text, 1 system line, 2 quick phrase |
| `message` | string(1000) | no | | text (kind 0), or the key (kinds 1 and 2) |
| `params` | string(255) | yes | | JSON parameters of a system line (for example `{"color":"w"}`) |
| `created_at` | bigint | no | | |

Indexes: `qc_c_game (game_id, id)`, `qc_c_uid (uid)`.

### 5.4 `qchess_ratings`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | bigint, autoincrement | no | | primary key |
| `uid` | string(64) | no | | unique |
| `rating` | integer | no | 1200 | current Elo |
| `peak` | integer | no | 1200 | highest rating |
| `rated_games` | integer | no | 0 | rated games played (drives K and "provisional") |
| `games`, `wins`, `losses`, `draws` | integer | no | 0 | all finished online games, rated or not, excluding aborted |
| `listed` | smallint | yes | | leaderboard choice: `NULL` not asked, 1 listed, 0 not listed |
| `last_rated_at` | bigint | yes | | |
| `updated_at` | bigint | no | | |

Indexes: unique `qc_r_uid (uid)`, `qc_r_rating (rating)`.

Local statistics, preferences and trainer progress are **user config**, not tables (§11.2).

### 5.5 Entities and mappers (`lib/Db/`)

Entities `Game`, `Move`, `ChatMessage`, `Rating` extend `OCP\AppFramework\Db\Entity` with camelCase properties
(`ratingWBefore` ↔ `rating_w_before`). `Game` adds `STATUS_*` constants and helpers `isParticipant(string $uid)`,
`colorOf(string $uid): ?string`, `uidOf(string $color): ?string`, `opponentOf(string $uid): ?string`,
`isFinal(): bool`. Mappers `GameMapper`, `MoveMapper`, `ChatMapper`, `RatingMapper` extend `QBMapper`. Mappers are
internal to backend-games: **other modules call the services of §6, never the mappers.**

Required mapper capabilities (names free): optimistic update `UPDATE … WHERE id = ? AND rev = ?`; atomic open-challenge
claim `UPDATE … SET status = 'active', opponent_uid = ? … WHERE id = ? AND status = 'open'`; the lobby queries (each
≤ 20 rows, indexed); history with cursor paging; the maintenance scans (`status, deadline_at|expires_at|finished_at`
in batches); pair-cap count; fair-play lookup (moves of the user's active rated games by `(game_id, ply)` and
`support_key`).

---

## 6. Backend services and module interfaces (PHP)

This section is the contract between the three backend modules and the engine. Signatures are binding (names,
parameters, return shapes); implementations may add private helpers. All classes are autowired by Nextcloud's DI
container. "After commit" means after the database transaction that made the change has committed.

### 6.1 Shared: `OCA\QuantumChess\Exception\ApiException` ‹backend-games›

Every controller of every module reports errors through this class (§7.1).

```php
class ApiException extends \RuntimeException {
	public function __construct(string $errorCode, string $message, int $status = 400, array $extra = [], ?int $retryAfter = null);
	public function getErrorCode(): string;
	public function getStatus(): int;
	public function getExtra(): array;
	public function getRetryAfter(): ?int;
	public function toResponse(): JSONResponse;   // {error, message, ...extra} + Retry-After header
	public static function internal(\Throwable $e, LoggerInterface $logger): JSONResponse;   // logs, 500 {error: 'internal'}
}
```

`$message` is already translated (`IL10N`) by the thrower.

### 6.2 Engine ‹engine-php›

`OCA\QuantumChess\Engine\Engine` (§3.4). Consumers: GameService, GameSerializer, FairPlayService, ExportService
(backend-games), MoveDescriber (backend-integration), AiController/PromptBuilder (backend-ai).

### 6.3 Games ‹backend-games›

```php
namespace OCA\QuantumChess\Service;

class GameService {
	// Reads (apply lazy maintenance to the games they load: expiry, timeout, abandonment, §8.3)
	/** @return array{yourTurn: list<Game>, waiting: list<Game>, invitations: list<Game>, outgoing: list<Game>, open: list<Game>, recent: list<Game>} */
	public function getLobby(string $uid): array;
	public function lobbyToken(string $uid): string;                          // opaque; changes whenever the lobby may have changed
	/** @return array{yourTurn: int, invitations: int} */
	public function countActionNeeded(string $uid): array;
	/** @return list<Game> invitations (incl. rematch offers) first, then your-move games by nearest deadline */
	public function listDashboard(string $uid, int $limit = 7): array;
	/** @return array{games: list<Game>, next: ?string} */
	public function history(string $uid, array $query): array;                 // query keys of §7.4.1
	public function get(int $id, string $uid): Game;                          // participant, or a visible open challenge; else ApiException 404
	/** @return array{game: Game, moves: list<Move>, chat: list<ChatMessage>} */
	public function getFull(int $id, string $uid): array;
	public function poll(int $id, string $uid, int $rev, int $ply, int $chatId, bool $watching): array;   // §7.4.3 shape, entities not serialised
	/** @return list<string> user ids, most recent first */
	public function recentOpponents(string $uid, int $limit = 8): array;
	/** @return array{rated: bool, reason: ?string} */
	public function ratedCheck(string $uid, string $opponent): array;
	/** @return array{active: int, finishedToday: int} admin diagnostics */
	public function diagnostics(): array;

	// Writes (each in one transaction; cache, notifications after commit)
	public function create(string $uid, array $request): Game;               // request keys of §7.4.2
	public function accept(int $id, string $uid): Game;
	public function decline(int $id, string $uid): Game;
	public function cancel(int $id, string $uid): Game;
	public function join(int $id, string $uid): Game;
	/** @return array{game: Game, move: Move, measurement: ?array, replayed: bool} */
	public function move(int $id, string $uid, string $code, int $ply, ?string $clientId, ?int $thinkMs): array;
	public function resign(int $id, string $uid): Game;
	public function abort(int $id, string $uid): Game;
	public function draw(int $id, string $uid, string $action): Game;         // offer|accept|decline
	public function chat(int $id, string $uid, ?string $text, ?string $phrase): ChatMessage;
	public function setMuted(int $id, string $uid, bool $muted): bool;
	public function rematch(int $id, string $uid): Game;                      // the rematch game
	public function markSeen(int $id, string $uid): void;                      // called by GET /api/games/{id}
	/** @return array{expired: int, timedOut: int, abandoned: int, reminders: int, chatPurged: int, gamesPurged: int} */
	public function runMaintenance(int $now, int $batch = 200): array;
	public function removeUser(string $uid, bool $accountDeleted): void;      // §8.12
}

class GameSerializer {                                                          // DTOs of §7.2
	public function userRef(?string $uid): ?array;
	public function summary(Game $game, string $viewer): array;
	public function live(Game $game, string $viewer): array;
	public function full(Game $game, string $viewer, array $moves, array $chat): array;
	public function move(Move $move): array;
	public function chat(ChatMessage $message, string $viewer): array;
	public function lobby(array $groups, string $viewer, string $token): array;
}

class InvitePolicy {                                                            // §8.2
	public function isMultiplayerUser(string $uid): bool;
	public function canInvite(string $from, string $to): bool;
	public function assertCanInvite(string $from, string $to): void;          // ApiException 404 user_not_found
	public function assertWithinLimits(string $from, ?string $to): void;      // ApiException 429 too_many_*
	public function canSeeOpenChallenge(string $viewer, Game $game): bool;
}

class TimeControl {                                                             // §8.3
	public const CONTROLS = ['corr:1d' => 86400, 'corr:3d' => 259200, 'corr:7d' => 604800, 'corr:none' => null];
	public const ABANDON_AFTER = 2592000;          // 30 days
	public const NO_DEADLINE_REMINDERS = [259200, 864000];   // 3 and 10 days
	public function isValid(string $timeControl): bool;
	public function period(string $timeControl): ?int;
	public function deadlineFrom(string $timeControl, int $from): ?int;
	public function dueReminder(Game $game, int $now): ?int;                  // bit to send (1 or 2) or null
	public function isQuietHours(?string $uid, int $now): bool;               // 21:00–08:00 in the user's time zone
	public function nextQuietEnd(?string $uid, int $now): int;
	/** @return array{status: string, result: ?string, reason: string} */
	public function resolveTimeout(Game $game, array $state): array;
}

class RatingService {                                                           // §8.6
	public const START = 1200; public const FLOOR = 100; public const PROVISIONAL_GAMES = 10;
	public const K_PROVISIONAL = 40; public const K = 20; public const PAIR_CAP = 3; public const PAIR_WINDOW = 86400;
	/** @return array{rating: int, provisional: bool, ratedGames: int, peak: int, games: int, wins: int, losses: int, draws: int, listed: ?bool, lastRatedAt: ?int}|null */
	public function get(string $uid): ?array;
	public function isPairCapped(string $a, string $b, int $now): bool;
	public function applyResult(Game $game): void;       // inside the finishing transaction; records counts, and Elo when rated
	/** @return list<array{gameId: int, t: int, rating: int}> oldest first */
	public function history(string $uid, int $limit = 100): array;
	/** @return list<array{uid: string, rating: int, provisional: bool, ratedGames: int, wins: int, losses: int, draws: int, listed: ?bool}> */
	public function leaderboardRows(int $minGames, int $activeSince): array;
	public function setListed(string $uid, ?bool $listed): void;          // creates the row if needed
	public function deleteUser(string $uid): void;
}

class FairPlayService {                                                         // §8.8
	public const WINDOW_PLIES = 20; public const MIN_PLY = 10;
	public function isRatedPositionInProgress(string $uid, array $state): bool;
}

class GameCache {                                                               // §8.9
	public function getMeta(int $gameId): ?array;
	public function putMeta(Game $game): void;
	public function forget(int $gameId): void;
	public function bumpUser(string $uid): void;
	public function userToken(string $uid): string;
	public function bumpOpen(): void;
	public function openToken(): string;
}

class ExportService {                                                           // §8.13
	public function exportGame(Game $game, array $moves, string $viewer): array;
	public function exportAll(string $uid): array;
}
```

Also ‹backend-games›: `Controller\GameController`, `Controller\OcsGameController`,
`BackgroundJob\GameMaintenanceJob` (`TimedJob`, interval 900 s, time-sensitive, no parallel runs; calls
`GameService::runMaintenance(time())`, then `Ai\AiMaintenance::cleanup(time())`), `Listener\UserDeletedListener`
(`UserDeletedEvent` → `GameService::removeUser($uid, true)` and `RatingService::deleteUser($uid)`).

### 6.4 Integration ‹backend-integration›

```php
namespace OCA\QuantumChess\Service;

class NotificationService {                                     // §9.1; called by GameService after commit
	public function invite(Game $game): void;                   // 'invite', or 'rematch' when rematchOf is set; to the opponent
	public function inviteAccepted(Game $game): void;           // 'invite_accepted' / 'open_joined'; to the creator
	public function inviteDeclined(Game $game): void;           // 'invite_declined'; to the creator
	public function inviteClosed(Game $game): void;             // removes the 'invite'/'rematch' notification (answered, cancelled, expired)
	public function yourTurn(Game $game, Move $lastMove): void; // 'your_turn'; to the side to move; replaces the turn family
	public function reminder(Game $game): void;                 // 'reminder'; to the side to move; replaces the turn family
	public function drawOffered(Game $game): void;              // 'draw_offer'; to the player who did not offer
	public function drawClosed(Game $game): void;               // removes 'draw_offer'
	public function gameOver(Game $game): void;                 // 'game_over'; to both; clears turn, draw and invite families
	public function chat(Game $game, ChatMessage $message): void;
	public function gameEndedDeleted(Game $game, string $remainingUid): void;
	public function markSeen(Game $game, string $uid): void;    // clears informational families for $uid
	public function removeForGame(int $gameId): void;
	public function removeForUser(string $uid): void;
}

class StatsService {                                            // §7.4.6
	public function mine(string $uid): array;
	public function leaderboard(string $viewer, ?string $group): array;
	public function localStats(string $uid): array;
	public function recordLocal(string $uid, array $payload): array;   // returns the new LocalStats
}

class PreferencesService {                                      // §11.3
	public const MAX_BYTES = 16384;
	public function get(string $uid): array;                    // stored object, [] if none
	public function set(string $uid, array $preferences): array;     // ApiException 413 too_large / 400 invalid_argument
}

class TrainerProgressService {                                  // §14.8.4
	public const MAX_BYTES = 65536;
	public function get(string $uid): array;
	public function merge(string $uid, array $incoming): array;      // stores and returns the merged document
}

class DataDeletionService {                                     // §8.12
	public function deleteUserData(string $uid): void;          // "Delete my Quantum Chess data" (account stays)
}
```

Also ‹backend-integration›: `Notification\Notifier` (`INotifier`, `IPreloadableNotifier`),
`Notification\MoveDescriber` ("last move in words", GD §7.12), `Dashboard\GamesWidget`, `Controller\PageController`,
`StatsController`, `PreferencesController`, `MeController`, and `AppInfo\Application::register()`, which registers:
`registerNotifierService(Notifier::class)`, `registerDashboardWidget(GamesWidget::class)`,
`registerEventListener(UserDeletedEvent::class, UserDeletedListener::class)`.

### 6.5 AI and settings ‹backend-ai›

```php
namespace OCA\QuantumChess\Service;

class SettingsService {                                         // typed access to every key of §11 (defaults applied)
	public function getAdmin(): array;                          // all admin keys; secrets as {hasKey, keyHint}
	public function setAdmin(array $patch): array;              // validated; returns getAdmin()
	public function setAdminSecret(string $key, ?string $value): void;
	public function isMultiplayerEnabledFor(string $uid): bool; // mp_enabled && (mp_groups empty || member)
	public function openChallengesEnabled(): bool;
	public function ratedEnabled(): bool;
	public function chatEnabled(): bool;
	public function inviteExpiryDays(): int;
	public function openExpiryDays(): int;
	public function maxActiveGames(): int;
	public function chatRetentionDays(): int;
	public function purgeFinishedDays(): int;
	public function leaderboardMode(): string;                  // off|opt-in|opt-out
	public function leaderboardMinGames(): int;
	public function leaderboardActiveDays(): int;
	/** @return list<string> */
	public function leaderboardGroups(): array;
	public function invitePolicy(string $uid): string;          // everyone|groups|nobody
	/** @return list<string> */
	public function blockedUsers(string $uid): array;
	/** @return array{invites: bool, yourTurn: bool, reminders: bool, drawOffers: bool, results: bool, chat: bool, previews: bool} */
	public function notificationSwitches(string $uid): array;
	public function getMultiplayer(string $uid): array;         // §7.4.8
	public function setMultiplayer(string $uid, array $patch): array;
	public function getPersonal(string $uid): array;            // §7.4.8
	public function setPersonal(string $uid, array $patch): array;
}

namespace OCA\QuantumChess\Service\Ai;

class AiSourceService {                                         // §10.1
	/** @return array{sources: list<array>, default: ?string, privacyNotice: string} */
	public function sourcesFor(string $uid): array;
	/** @return array{nextcloud: bool, shared: bool, personal: bool, any: bool, default: ?string} */
	public function summary(string $uid): array;               // for the initial state
}

class LlmService {                                              // §10
	public function requestMove(string $uid, array $request): array;     // §7.4.7 response shapes
	public function requestCoach(string $uid, array $request): array;
	public function taskStatus(string $uid, int $taskId): array;
	public function cancelTask(string $uid, int $taskId): void;
	public function listModels(string $uid, string $source): array;
	public function testConnection(string $uid, array $request, bool $admin): array;
}

class AiMaintenance {
	public function cleanup(int $now): void;                    // deletes the app's finished TaskProcessing tasks > 1 h old and usage counters > 30 days
}
```

Also ‹backend-ai›: `Ai\ProviderInterface`, `Ai\OpenAiProvider`, `Ai\AnthropicProvider`, `Ai\NextcloudAiProvider`,
`Ai\PromptBuilder`, `Ai\AnswerParser`, `Ai\Presets`, `Ai\Personas`, `Ai\UrlGuard`, `Ai\KeyStore` (ICrypto),
`Ai\AiUsageService` (limits and counters), `Controller\AiController`, `Controller\SettingsController`,
`Settings\AdminSettings`, `Settings\PersonalSettings`, `Settings\Section`.

### 6.6 Call graph (who calls whom)

```
GameController / OcsGameController ─▶ GameService ─▶ Engine, InvitePolicy, TimeControl, RatingService,
                                                    GameCache, NotificationService*, SettingsService
GameMaintenanceJob ─▶ GameService::runMaintenance, AiMaintenance::cleanup
UserDeletedListener ─▶ GameService::removeUser, RatingService::deleteUser
NotificationService ─▶ SettingsService (switches), INotificationManager      (* after commit)
Notifier ─▶ MoveDescriber ─▶ Engine; IUserManager; RatingService (game_over text)
GamesWidget ─▶ GameService::listDashboard, GameSerializer
PageController ─▶ GameService::getLobby + GameSerializer::lobby, PreferencesService, TrainerProgressService,
                  SettingsService, AiSourceService::summary, InvitePolicy::isMultiplayerUser
StatsService ─▶ RatingService, SettingsService, IShareManager/IGroupManager (visibility)
DataDeletionService ─▶ GameService::removeUser(uid, false), RatingService::deleteUser, NotificationService::removeForUser,
                       IUserConfig (delete app keys)
AiController ─▶ FairPlayService, LlmService, AiSourceService, AiUsageService, Engine (validateState)
SettingsController ─▶ SettingsService, LlmService (test/models), RatingService::setListed, GameService (diagnostics)
```

No cycles between classes. At module level backend-games calls two classes owned by other modules
(`NotificationService`, `SettingsService`); to keep the build order engine-php → backend-games → {backend-integration,
backend-ai}, those two modules commit **skeletons** of these classes with the exact public signatures above (safe
defaults, no-op notifications) on day 1 (IMPLEMENTATION-PLAN §3). backend-games' unit tests mock them.

---

## 7. HTTP API

### 7.1 Conventions

- **Web routes** (`routes` key of `appinfo/routes.php`) are served under `/index.php/apps/quantumchess/…` by
  `OCP\AppFramework\Controller` subclasses returning `JSONResponse`. The frontend builds URLs with
  `generateUrl('/apps/quantumchess/api/…')` and calls them with `@nextcloud/axios` (which sends the request token).
- **OCS routes** (`ocs` key) are served under `/ocs/v2.php/apps/quantumchess/api/v1/…` by `OCSController` subclasses
  returning `DataResponse`; they need the `OCS-APIRequest: true` header. They exist only for notification actions.
- Every method is `#[NoAdminRequired]` except the admin settings methods. `page#index`, `page#game`, `game#export`
  and `game#exportAll` are `#[NoCSRFRequired]` (browser navigations and download links, read-only). No method uses
  `#[UseSession]`, so the session is closed early and parallel polls never block each other.
- Request bodies are JSON (`Content-Type: application/json`); Nextcloud maps top-level keys to method parameters.
  Bodies above 64 KiB (96 KiB for trainer progress) are rejected with `413 too_large`.
- **Errors**: HTTP status + `{"error": "<code>", "message": "<translated text>", …extra}` via `ApiException`
  (§6.1). The full code list is Appendix A. `429` responses carry `Retry-After` (seconds). Clients switch on `error`,
  never on `message`.
- **Rate limits** use `#[UserRateLimit(limit: …, period: …)]` unless stated; dynamic limits use
  `OCP\Security\RateLimiting\ILimiter::registerUserRequest()`.
- Responses that describe time-dependent state include `now` (server time, Unix seconds) so the client can correct
  its clock for deadlines.
- Manual testing with curl works with basic auth plus the header `OCS-APIRequest: true` (it satisfies the CSRF check
  of web routes as well), for example
  `curl -u bob:QuantumBob!2026 -H 'OCS-APIRequest: true' -H 'Content-Type: application/json' http://127.0.0.1:8080/index.php/apps/quantumchess/api/games`.

### 7.2 Data transfer objects

**UserRef** — `{"userId": "bob", "displayName": "Bob"}`; a deleted user is `{"userId": null, "displayName": "<t('Deleted user')>"}`.

**GameSummary** (lists, lobby, dashboard) — `GameSerializer::summary()`:

```json
{
  "id": 42, "status": "active", "timeControl": "corr:3d",
  "rated": true, "ratedRequested": true, "unratedReason": null,
  "creator": {"userId": "alice", "displayName": "Alice"},
  "opponent": {"userId": "bob", "displayName": "Bob"},
  "white": {"userId": "alice", "displayName": "Alice"}, "black": {"userId": "bob", "displayName": "Bob"},
  "colorChoice": "r", "myColor": "w", "yourTurn": true,
  "turn": "w", "ply": 12,
  "deadlineAt": 1790259200, "expiresAt": null,
  "result": null, "resultReason": null, "winner": null,
  "ratingChange": null,
  "inviteMessage": null, "scopeGroup": null,
  "rematchOf": null, "rematchId": null,
  "createdAt": 1790000000, "updatedAt": 1790000100, "startedAt": 1790000010, "lastMoveAt": 1790000100, "finishedAt": null,
  "preview": [[4, "K", 100], [21, "N", 50], [23, "N", 50], [60, "k", 100]],
  "rev": 17
}
```

- `white`/`black`/`myColor` are `null` until the game starts. `opponent` is `null` for an unjoined open challenge.
- `rated` is the effective flag and stays `false` until the game starts; invitations and open challenges show
  `ratedRequested` ("Rated" badge), and `unratedReason` explains a requested game that ended up unrated.
- `yourTurn` is true only for an `active` game in which the viewer is the side to move.
- `winner`: `'w'`, `'b'` or `null`. `ratingChange`: `{"w": 12, "b": -12}` for rated finished games, else `null`.
- `preview`: every occupied square as `[square, letter, pct]` (letter upper case = White, type letters `KQRBNP`),
  computed from `Engine::squareView`; `[]` before the game starts. `MiniBoard` renders it (§14.6).

**GameLive** (show, poll, move and action responses) — `GameSerializer::live()` = GameSummary plus:

```json
{
  "state": { "v": 1, "…": "engine state (ER §2.5)" },
  "chain": "23c8…6608",
  "drawOffer": {"by": "b", "ply": 22} ,
  "canOfferDraw": false, "drawAvailableAtPly": 26,
  "canAbort": false, "canResign": true, "canRematch": false,
  "adminBadge": {"w": false, "b": true},
  "ratings": {"w": {"rating": 1284, "provisional": false}, "b": {"rating": 1312, "provisional": true}},
  "ratingBefore": null,
  "muted": false, "chatCount": 5, "chatOpen": true,
  "now": 1790000200
}
```

`adminBadge` is only ever true in rated games (member of the `admin` group, GD §3.8). `ratings` is `null` per side for
users without a rating row. `chatOpen` is false when chat is disabled or the game ended more than 7 days ago.

**GameFull** (`GET /api/games/{id}`, conflict bodies) = GameLive plus `startState` (`null` = standard start),
`moves: MoveDTO[]` (all moves, ply order) and `chat: ChatDTO[]` (the last 200 messages, oldest first).

**MoveDTO**

```json
{"ply": 0, "color": "w", "userId": "alice", "code": "c1-h6", "notation": "Bc1xh6 {capture 50%}",
 "measurement": {"key": "capture", "u": 8388608, "captured": 23, "outcomes": [{"key": "move", "weight": 8388608}, {"key": "capture", "weight": 8388608}], "fallback": false},
 "chain": "23c8…6608", "stateHash": "15ec044c3e248721", "createdAt": 1790000050}
```

`ply` is the state ply **before** the move (0-based). `measurement` is the stored record, unchanged (clients recompute
the chain from it).

**ChatDTO** — `{"id": 305, "kind": "text"|"system"|"phrase", "userId": "bob"|null, "displayName": "Bob"|null,
"message": "nice split!" | "<key>", "params": {…}|null, "createdAt": 1790000090}`. System keys: `draw_offered`,
`draw_declined`, `draw_accepted`, `rematch_offered`, `aborted`, `resigned`, `timeout`. Phrase keys: `good_luck`,
`nice_split`, `well_played`, `oops`, `thanks`, `good_game`. Clients translate keys; text is rendered as plain text.

**LobbyDTO** — `GameSerializer::lobby()`; also the `lobby` initial state:

```json
{"rev": "u17.o4", "now": 1790000200,
 "yourTurn": [GameSummary], "waiting": [GameSummary], "invitations": [GameSummary],
 "outgoing": [GameSummary], "open": [GameSummary], "recent": [GameSummary],
 "counts": {"yourTurn": 2, "invitations": 1}}
```

`yourTurn` (sorted by nearest deadline, then oldest last move), `waiting` (active, opponent to move), `invitations`
(incoming pending, including rematch offers), `outgoing` (own pending invitations and own open challenges), `open`
(joinable open challenges of others that the viewer may see), `recent` (last 5 finished or aborted). At most 20 per
group. `rev` is the opaque lobby token (`GameService::lobbyToken`).

### 7.3 Route table

Rate limits are per user. "poll" means the shared `ILimiter` bucket `quantumchess-poll` of 3000 requests per 10 min.

| Verb | URL (web: `/apps/quantumchess` prefix) | Route name | Owner | Notes / rate limit |
|---|---|---|---|---|
| GET | `/` | `page#index` | integration | SPA, NoCSRF |
| GET | `/g/{id}` | `page#game` | integration | redirect to `/#/game/{id}`, NoCSRF |
| GET | `/api/games` | `game#index` | games | LobbyDTO |
| GET | `/api/games/summary` | `game#summary` | games | ETag, poll |
| GET | `/api/games/open` | `game#open` | games | |
| GET | `/api/games/history` | `game#history` | games | |
| GET | `/api/games/export` | `game#exportAll` | games | NoCSRF, 10/h |
| GET | `/api/games/rated-check` | `game#ratedCheck` | games | 120/10 min |
| POST | `/api/games` | `game#create` | games | 30/h |
| GET | `/api/games/{id}` | `game#show` | games | |
| GET | `/api/games/{id}/poll` | `game#poll` | games | poll |
| POST | `/api/games/{id}/accept` | `game#accept` | games | 60/min |
| POST | `/api/games/{id}/decline` | `game#decline` | games | 60/min |
| POST | `/api/games/{id}/cancel` | `game#cancel` | games | 60/min |
| POST | `/api/games/{id}/join` | `game#join` | games | 30/10 min |
| POST | `/api/games/{id}/moves` | `game#move` | games | 120/min |
| POST | `/api/games/{id}/resign` | `game#resign` | games | 60/min |
| POST | `/api/games/{id}/abort` | `game#abort` | games | 60/min |
| POST | `/api/games/{id}/draw` | `game#draw` | games | 60/min |
| POST | `/api/games/{id}/chat` | `game#chat` | games | 30/min |
| PUT | `/api/games/{id}/mute` | `game#mute` | games | 60/min |
| POST | `/api/games/{id}/rematch` | `game#rematch` | games | 30/h |
| GET | `/api/games/{id}/export` | `game#export` | games | NoCSRF, 60/h |
| GET | `/api/users/recent` | `game#recentOpponents` | games | |
| GET | `/api/stats` | `stats#mine` | integration | |
| GET | `/api/leaderboard` | `stats#leaderboard` | integration | |
| POST | `/api/stats/local` | `stats#recordLocal` | integration | 60/h |
| GET | `/api/trainer/progress` | `stats#getProgress` | integration | |
| PUT | `/api/trainer/progress` | `stats#setProgress` | integration | 120/10 min |
| PUT | `/api/settings/preferences` | `preferences#update` | integration | 120/10 min |
| DELETE | `/api/me/data` | `me#deleteData` | integration | password confirmation, 5/h |
| GET | `/api/ai/providers` | `ai#providers` | ai | |
| GET | `/api/ai/models` | `ai#models` | ai | 30/10 min |
| POST | `/api/ai/move` | `ai#move` | ai | 120/h + `ai_requests_per_hour` (§10.6) |
| POST | `/api/ai/coach` | `ai#coach` | ai | as `ai#move` (same budget) |
| GET | `/api/ai/task/{taskId}` | `ai#task` | ai | 1200/h |
| DELETE | `/api/ai/task/{taskId}` | `ai#cancelTask` | ai | 120/h |
| POST | `/api/ai/notice` | `ai#ackNotice` | ai | |
| GET | `/api/settings/personal` | `settings#getPersonal` | ai | |
| PUT | `/api/settings/personal` | `settings#setPersonal` | ai | 30/10 min |
| GET | `/api/settings/multiplayer` | `settings#getMultiplayer` | ai | |
| PUT | `/api/settings/multiplayer` | `settings#setMultiplayer` | ai | 60/10 min |
| GET | `/api/settings/admin` | `settings#getAdmin` | ai | admin only |
| PUT | `/api/settings/admin` | `settings#setAdmin` | ai | admin only |
| PUT | `/api/settings/admin/secret` | `settings#setAdminSecret` | ai | admin only, password confirmation |
| POST | `/api/settings/test` | `settings#test` | ai | 10/10 min (scope `shared` admin only) |

OCS routes (`/ocs/v2.php/apps/quantumchess` prefix), all ‹backend-games›, `OcsGameController`, 60/min:

| Verb | URL | Route name | Effect |
|---|---|---|---|
| POST | `/api/v1/games/{id}/accept` | `ocs_game#accept` | `GameService::accept` (invitations and rematch offers) |
| POST | `/api/v1/games/{id}/decline` | `ocs_game#decline` | `GameService::decline` |
| POST | `/api/v1/games/{id}/draw-accept` | `ocs_game#drawAccept` | `GameService::draw($id, $uid, 'accept')` |
| POST | `/api/v1/games/{id}/draw-decline` | `ocs_game#drawDecline` | `GameService::draw($id, $uid, 'decline')` |
| POST | `/api/v1/games/{id}/rematch` | `ocs_game#rematch` | `GameService::rematch` |

OCS responses are `DataResponse(['game' => GameSummary])`; errors are `OCSException` subclasses with the
`ApiException` status (`OCSNotFoundException` for 404, `OCSForbiddenException` for 403, `OCSBadRequestException`
otherwise, message = translated text).

Reserved names (not registered in 1.0): [P1] `POST /api/settings/admin/new-season` (`settings#newSeason`), [P1]
`GET /api/games/{id}/reference` (link previews). All `{id}` and `{taskId}` placeholders require `\d+`.

### 7.4 Route details

#### 7.4.1 Lobby and lists ‹backend-games›

- `GET /api/games` → `LobbyDTO`. Applies lazy maintenance to the returned games.
- `GET /api/games/summary` → `{"rev": "u17.o4", "yourTurn": 2, "invitations": 1, "now": …}` with
  `ETag: "u17.o4"`; `If-None-Match` with the same token → `304` without a body. Cheap: reads `GameCache` tokens and
  only counts rows on a token change (cached per token).
- `GET /api/games/open` → `{"games": GameSummary[]}` (same as `LobbyDTO.open`).
- `GET /api/games/history?status=finished|aborted|all&opponent=<uid>&result=win|loss|draw&rated=0|1&cursor=<c>&limit=<n>`
  → `{"games": GameSummary[], "next": "<cursor>"|null}`. Defaults: `status=finished` (aborted games are hidden by
  default), `limit=20` (max 50). Sorted by `finished_at` descending, then id; the cursor is opaque
  (`base64("<finishedAt>:<id>")`). Only games of the viewer.
- `GET /api/users/recent` → `{"users": UserRef[]}` (≤ 8 most recent opponents, existing users only).
- `GET /api/games/rated-check?opponent=<uid>` → `{"rated": bool, "reason": null|"admin"|"pair_cap"}` for the New game
  dialog. Returns `rated: true, reason: null` for users the viewer may not invite (no probing, §8.2).

#### 7.4.2 Creating and answering games ‹backend-games›

`POST /api/games`

```json
{"opponent": "bob" | null, "color": "w"|"b"|"r", "rated": true, "timeControl": "corr:3d",
 "message": "Rematch of last week?" | null, "scopeGroup": "chess-club" | null}
```

→ `201 {"game": GameLive}`. Rules (§8.2): `opponent: null` creates an open challenge (`scopeGroup` allowed only then,
and the creator must be a member); `color` defaults to `r` and is forced to `r` for rated games; `rated` defaults to
true; `timeControl` defaults to `corr:3d`; `message` is trimmed, control characters removed, ≤ 200 characters, `null`
if empty. Errors: `400 invalid_argument`, `400 rated_needs_deadline` (`rated` with `corr:none`), `400
rated_not_allowed` (admin disabled rated games), `403 multiplayer_disabled`, `403 open_challenges_disabled`,
`404 user_not_found` (any policy failure), `429 too_many_invitations`, `429 too_many_open`, `429 too_many_active`.

`POST /api/games/{id}/accept` (invitee of a pending game, including a rematch offer) → `{"game": GameLive}`; the game
becomes `active`. Errors: `404 not_found`, `409 invalid_status`, `429 too_many_active`.
`POST /api/games/{id}/decline` (invitee) → `{"game": GameSummary}` (`declined`).
`POST /api/games/{id}/cancel` (creator of a pending or open game) → `{"game": GameSummary}` (`cancelled`).
`POST /api/games/{id}/join` (an open challenge the viewer may see, not their own) → `{"game": GameLive}`. Errors:
`404 not_found`, `409 already_taken` ("Someone was faster. The challenge is gone."), `409 invalid_status`,
`400 own_challenge`, `429 too_many_active`.
`POST /api/games/{id}/rematch` (participant of a `finished` or `aborted` game) → `{"game": GameLive}` of the rematch
game; idempotent (§8.5). Errors: `409 invalid_status`, `404 user_not_found`.

#### 7.4.3 Reading a game and polling ‹backend-games›

`GET /api/games/{id}` → `{"game": GameFull}`. Participants see every status; other users see only an `open`
challenge they may join (with `moves: []`, `chat: []`); everyone else gets `404 not_found`. Marks the viewer's
informational notifications of the game as seen (`GameService::markSeen`).

`GET /api/games/{id}/poll?rev=17&ply=12&chat=305&watching=0`

- `rev` (required): the client's game `rev`; `ply`: the number of moves the client has; `chat`: the last chat id the
  client has (0 = none); `watching` [P1]: visible tab.
- Unchanged: `{"changed": false, "rev": 17, "now": …}` (≈ 150 bytes, **zero database queries** when the distributed
  cache holds the game meta and no deadline has passed, §8.9).
- Changed: `{"changed": true, "rev": 18, "now": …, "game": GameLive, "moves": MoveDTO[] (ply ≥ the requested ply),
  "chat": ChatDTO[] (id > the requested chat id)}`.
- Errors: `404 not_found`, `429` (poll bucket, `Retry-After`).

#### 7.4.4 Moves and in-game actions ‹backend-games›

`POST /api/games/{id}/moves` — `{"code": "g1-f3|h3", "ply": 12, "clientId": "5f0c…", "thinkMs": 8200}`

- `code`: any input `findMove` accepts (canonical codes recommended); `ply`: the game ply the client moved from;
  `clientId`: 8–36 characters `[A-Za-z0-9-]` (required from the web client, generated per move attempt and reused on
  retries); `thinkMs`: optional, 0 … 30 days.
- `200 {"game": GameLive, "move": MoveDTO, "measurement": Record|null, "chain": "…", "rev": 18, "now": …,
  "replayed": false}`. A retry with a known `(game, clientId)` returns the stored move with `"replayed": true` and never
  rolls again.
- Check order (deviates from the listing in GD §7.5 so that retries work): participant (else 404) → idempotency →
  lazy deadline check (may finish the game) → status `active` (else `409 game_over` if finished, `409
  invalid_status` otherwise) → side to move (else `403 not_your_turn` with `game: GameLive`) → `ply == game.ply` (else
  `409 conflict` with `game: GameFull`) → legality (else `400 illegal_move` with `reason: <ReasonCode>`).

`POST /api/games/{id}/resign` → `{"game": GameLive}` (any time while active; a loss for the resigner).
`POST /api/games/{id}/abort` → `{"game": GameLive}` while fewer than 2 plies were played (§8.5); else `409
abort_not_allowed`.
`POST /api/games/{id}/draw` — `{"action": "offer"|"accept"|"decline"}` → `{"game": GameLive}`. Errors: `409
draw_not_allowed` (`availableAtPly` in the body), `409 no_draw_offer`, `409 invalid_status`.
`POST /api/games/{id}/chat` — `{"message": "…"}` (1–500 characters after trimming) or `{"phrase": "<key>"}` →
`{"message": ChatDTO, "rev": 19}`. Errors: `403 chat_disabled`, `409 chat_closed`, `400 invalid_argument`.
`PUT /api/games/{id}/mute` — `{"muted": true}` → `{"muted": true}`.

#### 7.4.5 Export ‹backend-games›

`GET /api/games/{id}/export` → the `.qcg.json` document of §8.13 with `Content-Disposition: attachment;
filename="quantum-chess-<id>.qcg.json"`. Only for `finished`/`aborted` games (`409 export_unavailable` otherwise, fair
play GD §7.9). `GET /api/games/export` → `{"format": "qcg-collection", "v": 1, "games": [qcg…]}` of every finished or
aborted game of the viewer, `filename="quantum-chess-games.qcg.json"`.

#### 7.4.6 Stats, trainer progress, preferences, data ‹backend-integration›

`GET /api/stats` →

```json
{"online": {"rating": 1284, "provisional": false, "ratedGames": 14, "peak": 1301,
            "games": 20, "wins": 9, "losses": 8, "draws": 3, "rank": 4, "listed": true, "askListing": false},
 "local": LocalStats,
 "ratingHistory": [{"gameId": 40, "t": 1789990000, "rating": 1270}]}
```

`online` is present with zeros and `rating: 1200` for users without a rating row. `askListing` is true once when the
user has ≥ 5 rated games, the mode is `opt-in`/`opt-out` and `listed` is `null` (GD §7.7).
**LocalStats** = `{"engine": {"1": {"w": 3, "l": 0, "d": 0}, …, "5": {…}}, "llm": {"<persona>": {"w", "l", "d"}},
"hotseat": {"games": 4}}`.

`GET /api/leaderboard?group=<gid>` →

```json
{"mode": "opt-in", "minGames": 5,
 "entries": [{"rank": 1, "userId": "carol", "displayName": "Carol", "rating": 1402, "provisional": false,
              "ratedGames": 31, "wins": 20, "losses": 9, "draws": 2}],
 "me": {"rank": 4, "…": "…", "listed": true} | null,
 "groups": [{"id": "chess-club", "displayName": "Chess club"}]}
```

`mode: "off"` returns `entries: []`. Entries are filtered to users the viewer may see (§8.6); `me` is always
returned for a rated viewer (with `rank: null` when unlisted). Cached per viewer and group for 5 minutes.

`POST /api/stats/local` — `{"opponent": "engine"|"llm"|"hotseat", "level": 1-5, "persona": "<id>", "result":
"win"|"loss"|"draw", "color": "w"|"b"}` (`level` for engine, `persona` for llm) → `{"local": LocalStats}`. Assisted
games are never reported (§14.7).

`GET /api/trainer/progress` → `{"progress": ProgressDoc}` (`{}` initially). `PUT /api/trainer/progress` —
`{"progress": ProgressDoc}` (≤ 64 KiB) → `{"progress": merged}` (§14.8.4). Errors: `413 too_large`,
`400 invalid_argument`.

`PUT /api/settings/preferences` — `{"preferences": {…}}` (JSON object ≤ 16 KiB, stored verbatim) →
`{"preferences": {…}}`.

`DELETE /api/me/data` (`#[PasswordConfirmationRequired]`) → `{"deleted": true}` (§8.12).

#### 7.4.7 AI ‹backend-ai›

`GET /api/ai/providers` →

```json
{"sources": [
   {"id": "nextcloud", "label": "Nextcloud AI", "available": true, "reason": null,
    "providerName": "OpenAI and LocalAI integration", "taskType": "core:text2text:chat", "models": null, "noticeAcked": true},
   {"id": "shared", "label": "<organisation provider label>", "available": false, "reason": "not_configured",
    "preset": "anthropic", "model": "claude-opus-5", "noticeAcked": false},
   {"id": "personal", "label": "My own API key", "available": false, "reason": "no_key",
    "preset": null, "model": null, "keyHint": null, "noticeAcked": false}],
 "default": "nextcloud", "privacyNotice": ""}
```

`reason` ∈ `null, disabled, not_allowed, no_provider, not_configured, no_key, cap_reached`.

`GET /api/ai/models?source=nextcloud|shared|personal` → `{"models": [{"id", "label"}], "chosenByAdmin": bool}`
(cached 1 h per user and source; errors `502 upstream` with `upstream` code).

`POST /api/ai/move`

```json
{"source": "personal", "model": "claude-opus-5" | null, "persona": "professor", "color": "b", "language": "nl",
 "state": State,
 "history": [{"ply": 22, "code": "e2-e4", "key": null, "weight": null}, {"ply": 23, "code": "d1-h5", "key": "move", "weight": 8388608}],
 "candidates": [{"code": "d8-h4", "E": 0.61, "tags": ["threatens-king:50"], "ok": true}],
 "message": "nice split!" | null,
 "feedback": {"answer": "e7-e5", "reason": "blocked"} | null,
 "answerMode": "code" | "index"}
```

- Validation: `state` through `Engine::validateState` (`400 invalid_state`), `result` must be `null` and `turn` must
  equal `color`; `history` ≤ 20 entries (invalid entries dropped); `candidates` 1–6 legal codes; `message` ≤ 200
  characters; `persona` ∈ §10.3; `language` a Nextcloud language code.
- Fair play first: `403 rated_game_in_progress` when `FairPlayService::isRatedPositionInProgress` (§8.8).
- `200 {"status": "done", "move": "d8-h4"|null, "pick": 2|null, "comment": "…", "mood": "confident"}` for direct
  providers; `202 {"status": "pending", "taskId": 1234}` for Nextcloud AI. `move` is the model's raw code text and is
  **not** validated by the server (the client validates with `findMove` and retries once with `feedback`, GD §6.4).
- Errors: `403 ai_unavailable` (source not available), `429 ai_rate_limited` (`Retry-After`), `429 ai_busy` (one
  request per user at a time), `502 upstream` (`upstream` ∈ `invalid_key, model_not_found, rate_limited,
  quota_exceeded, timeout, unreachable, bad_response, refused`).

`POST /api/ai/coach`

```json
{"source": "nextcloud", "model": null, "language": "de", "state": State,
 "history": [{"ply", "code", "key", "weight"}],
 "analysis": {"E": 0.64, "best": [{"code": "d4|h5-h8", "E": 1.0, "line": ["d4|h5-h8"]}],
              "threats": ["Your queen is 50 % capturable"], "lastMove": {"code": "e2-e4", "label": "mistake", "deltaE": 0.12}},
 "context": {"kind": "game"|"lesson"|"puzzle"|"review", "title": "…", "goal": "…", "ply": 12},
 "player": {"color": "w", "skill": "beginner"|"intermediate"|"advanced"},
 "chat": [{"role": "user"|"coach", "text": "…"}],
 "question": "Why was my last move a mistake?"}
```

Limits: `history` ≤ 16, `best` ≤ 3 (lines ≤ 6 codes), `threats` ≤ 8 × 120 characters, `chat` ≤ 4 turns × 600
characters, `question` 1–500 characters, `title`/`goal` ≤ 200. Response `200 {"status": "done", "answer": "<Markdown,
≤ 2000 characters>"}` or `202 {"status": "pending", "taskId": …}`; errors as `ai#move`.

`GET /api/ai/task/{taskId}` → `{"status": "pending"}` | `{"status": "done", "kind": "move", "move", "pick",
"comment", "mood"}` | `{"status": "done", "kind": "coach", "answer"}` | `{"status": "error", "error": "<upstream
code>", "message"}`. Only tasks of the viewer scheduled by this app (`404 not_found` otherwise). A finished task is
deleted after its result was returned once.

`DELETE /api/ai/task/{taskId}` → `{"status": "cancelled"}`.
`POST /api/ai/notice` — `{"source": "shared"}` → `{"acked": ["nextcloud", "shared"]}` (first-use privacy notice,
GD §8.5).

#### 7.4.8 Settings ‹backend-ai›

`GET /api/settings/personal` →

```json
{"allowPersonalKeys": true,
 "provider": {"preset": "openai", "kind": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-…"} | null,
 "hasKey": true, "keyHint": "a1B2", "keyUnreadable": false,
 "defaultSource": "personal" | null,
 "sources": [same as /api/ai/providers.sources],
 "presets": [{"id": "openai", "label": "OpenAI", "kind": "openai", "baseUrl": "…", "keyRequired": true, "local": false, "suggestedModels": ["…"]}],
 "localAllowlist": ["http://localhost:11434/v1"]}
```

`PUT /api/settings/personal` — `{"provider"?: {preset, kind, baseUrl, model} | null, "apiKey"?: string|null,
"defaultSource"?: string|null}`; `apiKey: null` or absent = unchanged, `""` = delete. Base URLs are checked by
`UrlGuard` (`400 url_not_allowed`). Returns the GET shape.

`GET /api/settings/multiplayer` →
`{"invitePolicy": "everyone"|"groups"|"nobody", "blocked": UserRef[], "listed": true|false|null,
"leaderboardMode": "opt-in", "notifications": {"invites": true, "yourTurn": true, "reminders": true, "drawOffers":
true, "results": true, "chat": true, "previews": true}}`. `PUT` takes any subset (`blocked` as a list of user ids,
max 200) and returns the GET shape.

`GET /api/settings/admin` (admin) → every admin key of §11.1 with its value (secrets as `{"hasKey", "keyHint"}`),
plus `"status": {"ncAi": {"providerName": "…"|null, "taskTypes": ["core:text2text:chat"], "medianLatencyMs": 8400|null},
"diagnostics": {"activeGames", "finishedToday", "aiRequestsToday": {"nextcloud": 3, "shared": 12, "personal": 1},
"distributedCache": true, "notifyPush": false, "backgroundJobMode": "cron"}}`.
`PUT /api/settings/admin` — a partial object of non-secret keys → the GET shape (`400 invalid_argument` with
`field`). `PUT /api/settings/admin/secret` (`#[PasswordConfirmationRequired]`) — `{"key": "shared_api_key", "value":
"sk-…" | ""}` → `{"hasKey": bool, "keyHint": "…"|null}`.

`POST /api/settings/test` — `{"scope": "personal"|"shared", "preset", "kind", "baseUrl", "model", "apiKey": string|null}`
(`null` = use the saved key) → `{"ok": true|false, "code": null|"<upstream code>"|"url_not_allowed", "modelCount":
12|null, "models": [{"id", "label"}]|null}`. Never returns upstream bodies or keys.

---

## 8. Game flow (server rules) ‹backend-games›

### 8.1 Lifecycle

```
                 create(opponent)                     accept
   ┌──────────────────────────────▶ pending ──────────────────────────┐
   │                                 │ decline ▶ declined              │
   │                                 │ cancel  ▶ cancelled             │
   │                                 │ expiry  ▶ expired               ▼
 (user)                                                              active ─ abort (ply < 2) ───────────▶ aborted
   │           create(no opponent)          join                       │  ─ timeout / abandonment before
   └──────────────────────────────▶ open ───────────────────────────▶ │    the late side's first move ────▶ aborted
                                     │ cancel ▶ cancelled                └─ result ────────────────────────▶ finished
                                     │ expiry ▶ expired
```

| Transition | Actor | Preconditions | Effects (one transaction) | After commit |
|---|---|---|---|---|
| create (invite) | user | §8.2 policy and limits | `pending`, `expires_at = now + invite_expiry_days·86400`, initial state, `rev = 1` | notify `invite`; bump both users |
| create (open) | user | `open_challenges` on; ≤ 3 open | `open`, `expires_at = now + open_expiry_days·86400` | bump creator, bump open |
| accept | opponent | `pending` | **start** (below) | notify `invite_accepted`, close `invite`; bump |
| decline | opponent | `pending` | `declined` | notify `invite_declined`, close `invite` |
| cancel | creator | `pending`/`open` | `cancelled` | close `invite`; bump |
| expire | job / lazy | `expires_at ≤ now` | `expired` | close `invite`; bump |
| join | visible user ≠ creator | `open`, atomic claim | `opponent_uid`, **start** | notify `open_joined`; bump, bump open |
| move | side to move | §8.4 | new state, move row, maybe finish | `your_turn` or `game_over` |
| resign | participant | `active` | finish: opponent wins, `resignation` | `game_over` |
| draw accept | offer recipient | pending offer | finish `1/2-1/2`, `agreement` | `game_over`, close `draw_offer` |
| abort | participant | `active`, `ply < 2` | `aborted`, reason `aborted` | `game_over` (reason aborted) to the other player |
| timeout | job / lazy | `deadline_at ≤ now` | §8.3 | `game_over` |
| abandonment | job / lazy | `corr:none`, 30 days without a move | §8.3 | `game_over` |
| account deleted | listener | `active` | finish `player_deleted` | `game_ended_deleted` |
| rematch | participant | `finished`/`aborted` | §8.5 | `rematch` |

**start(game, now)**: colours (`color_choice` `w`/`b` for the creator, `r` → `random_int(0, 1)`); rated decision
(`rated = rated_requested ∧ rated_enabled ∧ time_control ≠ corr:none ∧ ¬pairCapped(white, black)`, otherwise `rated =
0` with `unrated_reason` `admin` or `pair_cap` when it was requested); `deadline_at = deadlineFrom(time_control, now)`;
`chain = Engine::chainStart(id, white_uid, black_uid, created_at)`; `status = active`, `started_at = now`,
`expires_at = NULL`, `reminders = 0`, `rev + 1`.

**Result reasons.** Engine reasons (ER §6) are copied from the state; the server writes `resignation`, `agreement`,
`timeout`, `timeout_draw`, `abandoned`, `player_deleted` for `finished` games and `aborted`, `aborted_timeout` for
`aborted` games. Aborted games are never rated (`unrated_reason = aborted`) and hidden from the default history.
**finish(game, result, reason, finishedAt)** sets `status = finished`, `result`, `result_reason`, `finished_at`,
clears `deadline_at`, `draw_offer`, calls `RatingService::applyResult($game)` in the same transaction and adds a
system chat line where GD §7.11 lists one.

### 8.2 Invitations, open challenges and colours

`InvitePolicy::canInvite($from, $to)` is true only if **all** hold (GD §7.2):

1. `$to` exists, is enabled and is not `$from`;
2. the app is enabled for `$to` (`IAppManager::isEnabledForUser`) and both are multiplayer users
   (`SettingsService::isMultiplayerEnabledFor`);
3. with *share with group members only* (`IShareManager::shareWithGroupMembersOnly()`), they share a group that is not
   on the excluded list;
4. `$from` may find `$to`: enumeration allowed (limited to shared groups when `limitEnumerationToGroups()`), **or**
   `allowEnumerationFullMatch()`, **or** the two have played before;
5. `$to`'s invite policy allows it (`everyone`; `groups` = they share a group; `nobody` = never) and `$from` is not on
   `$to`'s block list.

`assertCanInvite` throws `404 user_not_found` ("You can't invite this user") for **every** failure, so nothing about
policies or block lists leaks. It runs on create, rematch and join (join: `canSeeOpenChallenge`). Limits
(`assertWithinLimits`, `429`): ≤ 10 own pending invitations and ≤ 1 pending invitation per pair
(`too_many_invitations`), ≤ 3 own open challenges (`too_many_open`), ≤ `max_active_games` own active games, checked for
the creator at creation and for the acceptor/joiner at start (`too_many_active`).

`canSeeOpenChallenge($viewer, $game)`: the viewer is a multiplayer user and not the creator; for a group-scoped
challenge the viewer is a member of `scope_group`; otherwise checks 1–4 hold with (`$from = $viewer`, `$to = creator`)
and the viewer is not on the creator's block list. The creator's invite policy does not apply (an open challenge is
addressed to everyone who may see them).

Colours: rated games always use `r` (server-assigned at start); a rematch fixes the swapped colours (§8.5); unrated
games use the creator's choice. The share URL `/apps/quantumchess/g/{id}` redirects to `#/game/{id}`, where the SPA
shows the join screen or "This challenge is not available" (`404`).

### 8.3 Time control, deadlines, reminders and quiet hours

- Time controls: `corr:1d`, `corr:3d` (default), `corr:7d` per move; `corr:none` only for unrated games.
- `deadline_at = now + P` at start and after every move; `reminders = 0` after every move.
- **Deadline reminders** (bit mask `reminders`): bit 1 at `deadline − P/2`, bit 2 at `deadline − P/10`. When both are
  due, only the second is sent and both bits are set. **No-deadline reminders**: bit 1 at 3 days, bit 2 at 10 days
  after the last move (or the start).
- **Quiet hours**: 21:00–08:00 in the recipient's time zone (core user preference `core`/`timezone`, else the server
  default, else UTC). A due reminder is held while the recipient is in quiet hours, unless the end of the quiet hours
  is at or after the deadline, in which case it is sent at once ("never held past the deadline").
- **Timeout** (`TimeControl::resolveTimeout`): the late side is `turn`. If the late side has not made a move in this
  game → `aborted`, reason `aborted_timeout`. Else if the waiting side has only its king left (all 15 other ids of its
  colour are in `state.captured`) → `finished`, `1/2-1/2`, `timeout_draw`. Else → `finished`, the waiting side wins,
  `timeout`. `finished_at = deadline_at` (not the time of detection).
- **Abandonment** (`corr:none`): 30 days after the last move (or the start) the game is resolved exactly like a
  timeout, with reason `abandoned` (or `aborted_timeout` before the late side's first move) and `finished_at` = last
  activity + 30 days.
- **Lazy resolution**: every `GameService` method that loads a game first resolves a passed expiry, deadline or
  abandonment (own transaction, rev-checked), so instances without system cron behave correctly. The poll hot path
  compares `now` with the cached `deadline`/`expires` values and only then takes the slow path.
- [P1] Out-of-office extension (GD §7.4) uses `ext_days`; not in 1.0.

### 8.4 Moves (idempotent, optimistic concurrency)

`GameService::move($id, $uid, $code, $ply, $clientId, $thinkMs)`:

1. Load the game; `404` unless `$uid` is a participant.
2. If `$clientId` is set and a move row `(game_id, client_id)` exists → return it (`replayed: true`, nothing changes).
3. Lazy deadline resolution (§8.3); then status checks, turn check, `ply` check (error codes §7.4.4).
4. `$legal = Engine::findMove($state, $code)`; if `null` → `400 illegal_move` with `reason = whyIllegal`.
5. `$u = $legal['resolution'] === 'rolled' ? random_int(0, 16777215) : null` — drawn **now**; no seed or future value
   exists anywhere (ER §9.2).
6. `$r = Engine::applyMove($state, $legal['code'], u: $u)`; `$notation = Engine::moveNotation($state, $legal['code'],
   $r['measurement'])`; `$json = Engine::serializeState($r['state'])`;
   `$chain = Engine::chainNext($game->chain, $ply, $legal['code'], $r['measurement']['u'] ?? null,
   $r['measurement']['key'] ?? null, $json)`.
7. Transaction: insert the move row (`ply`, `color`, `uid`, canonical `code`, `notation`, canonical measurement JSON,
   `chain`, `state_hash`, `support_key`, `client_id`, `think_ms`, `created_at`); update the game (`state`, `ply`,
   `turn`, `chain`, `last_move_at`, `updated_at`, `deadline_at`, `reminders = 0`, `rev + 1`) with `WHERE id = ? AND
   rev = ?`; a pending draw offer by the **other** player is declined (§8.5); if `$r['state']['result']` is set →
   finish with the engine result. Zero updated rows or a `(game_id, ply)` violation → rollback and `409 conflict`; a
   `(game_id, client_id)` violation (two concurrent retries) → rollback, re-read and return the stored move (`replayed`).
8. After commit: `GameCache::putMeta`, bump both users, then `NotificationService::yourTurn` (or `gameOver`), and
   `drawClosed` if an offer was declined.

### 8.5 Draw offers, resignation, abort and rematch

- **Draw offer**: while `active`, by a participant, when no offer is pending and the cool-down allows it
  (`last_draw_<me>` is `NULL` or `ply ≥ last_draw_<me> + 6`, that is 3 more own moves, GD §7.6; otherwise `409
  draw_not_allowed` with `availableAtPly`). Sets `draw_offer`, `draw_offer_ply`, adds system line `draw_offered`,
  notifies the other player. Offering while the **other** player's offer is pending accepts it; offering while one's own
  offer is pending is `409 draw_not_allowed`. **Accept** (by the other player) → finish `agreement`. **Decline** (by the other player),
  or **a move by the other player** → clears the offer, sets `last_draw_<offerer> = ply`, system line `draw_declined`.
  The offerer's own move does not withdraw the offer.
- **Resign**: any time while `active`; the opponent wins (`resignation`). The UI shows *Abort* instead while `ply < 2`.
- **Abort**: while `active` and `ply < 2` ("until both sides have moved"), by either participant; `aborted`, unrated.
- **Rematch** (`POST …/rematch` on a `finished`/`aborted` game, or the OCS action): if the game's `rematch_id` points
  to a `pending` game, the other player's rematch **accepts** it and the requester's own repeated rematch returns it
  unchanged (idempotent). Otherwise a new `pending` game is created: creator = requester, opponent = the other player
  (`InvitePolicy` applies), `color_choice` = the requester's opposite colour of the old game (colours swapped, also in
  rated games), same `time_control` and `rated_requested` (the pair cap is applied at acceptance), `expires_at = now +
  86400`, `rematch_of = old id`, and `old.rematch_id = new id`. Notifies `rematch` (Accept / Decline).
- No takebacks online.

### 8.6 Ratings and leaderboard

- **Elo** (`RatingService::applyResult`, inside the finishing transaction, rated games only): `E = 1/(1 + 10^((R_opp −
  R)/400))`, `S` ∈ {1, ½, 0}, `K = 40` while the player's `rated_games < 10` (before this game), else `20`;
  `delta = round(K·(S − E))` (half away from zero); `R' = max(100, R + delta)`; the stored delta is `R' − R`. Each side
  uses its own K. Updates `rating`, `peak`, `rated_games + 1`, `last_rated_at`, and the game's `rating_*_before` and
  `rating_*_delta`. Both rows are locked by updating them in ascending uid order before reading. Rows are created at
  1200 when missing.
- Counts (`games`, `wins`, `losses`, `draws`) are updated for every finished game (rated or not) of existing users;
  aborted games count nowhere; `player_deleted` counts as a win for the remaining player and is unrated.
- **Provisional**: `rated_games < 10`, shown as "1340?".
- **Pair cap**: at start, if ≥ 3 rated games between the same two users started within the last 24 h (status `active` or
  `finished`), the new game is unrated with `unrated_reason = pair_cap` (shown to both).
- **Leaderboard** (`StatsService`, ‹backend-integration›): mode `off` / `opt-in` (default: listed only if `listed =
  1`) / `opt-out` (listed unless `listed = 0`); eligible when `rated_games ≥ leaderboard_min_games` and `last_rated_at ≥
  now − leaderboard_active_days·86400`; restricted to members of `leaderboard_groups` when set; **filtered to users the
  viewer may see** (same rules as `InvitePolicy` step 3–4 from the viewer's side; with enumeration off only past
  opponents and the viewer); optional `group` filter among the viewer's own groups. Sorted by rating, then rated
  games, then display name; `rank` is the position in the filtered list. Cached per viewer and group for 5 minutes in
  the distributed cache (`lb:` keys).
- [P1] New season (reset to 1200, archive as JSON in app data).

### 8.7 Integrity of the game record

Every move row stores `chain` and the game row the head (ER §9.4). The server never rewrites stored moves. Clients
check the chain (§14.4.5); the Verify view replays the whole game (§14.6.6). `adminBadge` marks members of the
`admin` group in rated games only. When a player's account was deleted, `chain_0` can no longer be recomputed (the uid
is gone); the client shows "Can't be verified: a player's account was deleted" instead of an alarm.

### 8.8 Fair play (server refusal)

`FairPlayService::isRatedPositionInProgress($uid, $state)` (ER App. D): let `K = {supportKey($state),
supportKeyMirror($state)}`. For every `active`, `rated` game of `$uid`, look at the positions with state ply `p` in
`[max(10, game.ply − 19), game.ply]` (the last 20 plies, only `p ≥ 10`), which are the `support_key` values of the move
rows with `ply` (before) in `[p_min − 1, game.ply − 1]`. Return true if any is in `K`. `AiController` calls it for
`/api/ai/move` and `/api/ai/coach` right after `validateState` and answers `403 rated_game_in_progress`. The UI lock of
GD §7.9 is client-side (§14.4.3).

### 8.9 Revisions, polling and the distributed cache

- `rev` increases by exactly 1 with every committed change of the game row, its moves or its chat.
- `GameCache` uses `ICacheFactory::createDistributed('quantumchess')`. Keys (namespaced per module): `g:<id>` →
  `{"rev", "w", "b", "c", "o", "s", "t", "p", "d", "e", "a"}` (rev, white, black, creator, opponent, status, turn, ply,
  deadline, expires, last activity; TTL 1 day), `u:<uid>` (user revision counter), `open` (open-challenge revision
  counter); ‹backend-integration› uses `lb:`; ‹backend-ai› uses `ai:`.
- `putMeta` runs after every commit that changes a game; `bumpUser` for both participants (and the creator and
  opponent of pending/open games); `bumpOpen` whenever an open challenge appears or disappears. A missing counter is
  initialised with a random integer so that tokens never repeat after a cache flush.
- **Poll hot path**: cache hit, viewer ∈ {w, b, c, o}, `rev` equal, and no deadline/expiry passed → `{changed: false}`
  without touching the database. Otherwise the slow path loads the game (lazy maintenance) and returns the changes.
- Without a distributed cache every poll uses the slow path (one indexed query); lobby tokens are then computed from
  the database (`max(updated_at)`, `count`, `sum(rev)` of the user's non-final games and the visible open challenges).
- [P1] presence (`watch:<id>:<uid>`, 45 s) and notify_push (`quantumchess_update {game, rev}`).

### 8.10 Chat

Participants only; enabled by `chat_enabled`; open while the game is `active`, and for 7 days after `finished_at`
(`409 chat_closed` afterwards). Text 1–500 characters after trimming, control characters except `\n` removed, stored
and returned as plain text. Quick phrases and system lines are stored as keys (§7.2). Each message increments
`chat_count` and `rev`. The other player is notified (`chat`) unless they muted the chat of this game
(`mute_<color> = 1`); muted messages are still delivered and collapsed by the client. Rows are deleted
`chat_retention_days` (default 90) after the game finished.

### 8.11 Maintenance (`GameMaintenanceJob`)

Every 15 minutes (`TimedJob`, `IJob::TIME_SENSITIVE`, no parallel runs), `GameService::runMaintenance(now, 200)` runs
these steps, each in batches of ≤ 200 games, each game in its own rev-checked transaction (idempotent):

1. expire `pending`/`open` games with `expires_at ≤ now`;
2. resolve timeouts (`active`, `deadline_at ≤ now`);
3. resolve abandonment (`corr:none`, 30 days without a move);
4. send due reminders (§8.3), respecting quiet hours;
5. delete chat rows of games that finished more than `chat_retention_days` ago;
6. when `purge_finished_days > 0`, delete final games (and their moves and chat) older than that.

Then `AiMaintenance::cleanup(now)` ‹backend-ai›. Steps 1–3 also run lazily (§8.3). The admin page warns when
background jobs do not run in *Cron* mode (§7.4.8 diagnostics).

### 8.12 Account deletion and data erasure

`GameService::removeUser($uid, $accountDeleted)`, one transaction per game:

- `pending`/`open` games created by or addressed to the user are **deleted** (with their notifications).
- `active` games: on account deletion they finish as `player_deleted` (remaining player wins, `rated = 0`,
  `unrated_reason = deleted`) and the other player gets `game_ended_deleted` without the deleted name; on erasure
  (*Delete my Quantum Chess data*, account kept) they are **resigned** normally (GD §8.2).
- In all remaining games the user's uid becomes `NULL` (`white_uid`, `black_uid`, `creator_uid`, `opponent_uid`,
  `qchess_moves.uid`); the user's own chat messages (kinds 0 and 2) are deleted, system lines stay.
- Games in which both players are `NULL` are deleted with their moves and chat.

`UserDeletedListener` calls `removeUser($uid, true)` and `RatingService::deleteUser($uid)`; core removes the user's
config and TaskProcessing tasks, and the Notifications app removes their notifications.
`DataDeletionService::deleteUserData($uid)` ‹backend-integration› calls `removeUser($uid, false)`,
`RatingService::deleteUser`, `NotificationService::removeForUser` and deletes every user config key of the app
(§11.2), including the encrypted API key.

### 8.13 Export format (`.qcg.json`)

Shared by online export (server) and local export/import (client, §14.7).

```json
{"format": "qcg", "v": 1, "app": "quantumchess", "appVersion": "1.0.0", "rules": 1,
 "source": "online", "id": "42", "mode": "online",
 "white": {"kind": "user", "name": "Alice", "userId": "alice"},
 "black": {"kind": "user", "name": "Bob", "userId": "bob"},
 "timeControl": "corr:3d", "rated": true,
 "createdAt": 1790000000, "startedAt": 1790000010, "finishedAt": 1790400000,
 "result": {"result": "1-0", "reason": "king_captured"},
 "startState": null,
 "chain0": "049816ae…3c75",
 "moves": [{"ply": 0, "color": "w", "code": "c1-h6", "notation": "Bc1xh6 {capture 50%}",
            "u": 8388608, "key": "capture", "measurement": {…}, "chain": "23c8…6608", "createdAt": 1790000050}],
 "finalHash": "15ec044c3e248721"}
```

- Player `kind`: `user` (online), `engine` (`level`), `ai` (`persona`, no source or model), `local` (`name`).
- Local exports use `source: "local"`, `mode` ∈ `computer`, `ai`, `local`, and have no `chain0`/`chain`/`userId`.
- Chat is never exported. Importers replay the moves from `startState ?? initialState()` with the recorded `u`
  (`outcome` = `key` when `u` is `null` and the move is rolled) and reject files whose replay does not reach
  `finalHash`.

---

## 9. Notifications, dashboard and background work ‹backend-integration›

### 9.1 Notifications

`Notifier` (`INotifier`, `IPreloadableNotifier`): id `quantumchess`, name "Quantum Chess"; object `('game', '<id>')`;
icon `app-dark.svg` (absolute URL); link `…/apps/quantumchess/#/game/<id>`; rendered in the **recipient's** language
with rich subject parameter `{user}` (`type: user`, `id`, `name`); `prepare()` throws `UnknownNotificationException`
for other apps and `AlreadyProcessedException` when the game no longer needs the notification (for example an
`invite` whose game is no longer `pending`). `preloadDataForParsing()` batch-loads games.

| Subject | Family | To | Stored parameters | Rich subject (GD §7.12) | Actions (OCS, POST) | Switch |
|---|---|---|---|---|---|---|
| `invite` | invite | opponent | `actor, timeControl, rated, color` (recipient's colour or `r`), `message` | `{user} invited you to a game of Quantum Chess` | Accept (primary) → `ocs_game#accept`; Decline → `ocs_game#decline` | invites |
| `rematch` | invite | opponent | same as `invite` | `{user} wants a rematch` | Accept, Decline (on the rematch game) | invites |
| `invite_accepted` / `open_joined` | info | creator | `actor, yourMove` | `{user} accepted your invitation` / `{user} joined your open challenge` | – | invites |
| `invite_declined` | info | creator | `actor` | `{user} declined your invitation` | – | invites |
| `your_turn` | turn | side to move | `actor, moveNumber, lastMove {code, notation, color, key, weight, capturedType}` | `Your move against {user}` | – | yourTurn |
| `reminder` | turn | side to move | `actor, deadlineAt` | `Your move against {user}` (message "18 hours left", computed at render time) | – | reminders |
| `draw_offer` | draw | other player | `actor, moveNumber` | `{user} offers a draw` | Accept → `ocs_game#drawAccept`; Decline → `ocs_game#drawDecline` | drawOffers |
| `game_over` | result | both | `actor, outcome (win\|loss\|draw), reason, rating, delta` | `You won against {user}` / `You lost against {user}` / `Your game against {user} ended in a draw` | Rematch → `ocs_game#rematch` | results |
| `chat` | chat | other player | `actor, excerpt` (≤ 80 characters, `null` when previews are off) | `{user} sent a message` | – | chat |
| `game_ended_deleted` | info | remaining player | – | `Your game ended because your opponent's account was deleted` | – | results |

- The `your_turn` message is "the last move in words" from `MoveDescriber` (GD §7.12), built from the stored
  parameters (move type from the notation, realised key and weight, captured type).
- **At most one notification per (user, game, family)**: before adding one, the previous notifications of that family
  are marked processed (`INotificationManager::markProcessed` with app, user, object and subject).
- `markSeen` (opening a game) clears the `info`, `turn`, `result` and `chat` families for that user; `invite` and
  `draw` stay until answered or obsolete. Multi-recipient events use `defer()`/`flush()`. Never priority
  notifications. Disabled switches (§11.2) suppress creation only.
- Action links use `IURLGenerator::linkToOCSRouteAbsolute('quantumchess.ocs_game.<method>', ['id' => $id])`.

### 9.2 Dashboard widget

`Dashboard\GamesWidget` implements `IAPIWidgetV2`, `IIconWidget`, `IButtonWidget`, `IOptionWidget`,
`IReloadableWidget` (60 s) and `IConditionalWidget` (enabled when `SettingsService::isMultiplayerEnabledFor`). Id
`quantumchess`, title "Quantum Chess", order 30, icon `app-dark.svg`. `getItemsV2($uid, $since, $limit = 7)` uses
`GameService::listDashboard`: invitations first ("Alice invited you" · "3 days per move · Rated"), then your-move
games by urgency ("Your move against Bob" · "Move 14 · 18 h left"), item icon = the opponent's avatar URL
(`core.avatar.getAvatar`, 64 px), overlay icon `img/overlay-king-w.svg` / `img/overlay-king-b.svg` (your colour),
link to `#/game/<id>`. Empty text "No games waiting for your move". Buttons: *New game* (`#/new`) and *More* (`#/`).
Options: round item icons.

### 9.3 Navigation counters and tab title

Client-side (‹frontend-app›, fed by the lobby store ‹frontend-online›): see §14.2.

---

## 10. LLM integration ‹backend-ai›

### 10.1 Sources and availability

| Source | Available when | Default order |
|---|---|---|
| `nextcloud` | `nc_ai_enabled` and `IManager::getAvailableTaskTypeIds(false, $uid)` contains `core:text2text:chat` or `core:text2text` | 1 |
| `shared` (organisation provider) | `shared_enabled`, a provider is configured (and a key unless the preset is keyless), the user is in `shared_groups` (or it is empty), and the daily cap is not reached | 2 |
| `personal` | `allow_personal_keys` and the user configured a provider (with a key when the preset requires one) | 3 |

The default source is the user's `ai_default_source` when available, else the first available in the order above.
`AiSourceService::summary()` feeds the initial state (§13).

### 10.2 Providers (`ProviderInterface`)

```php
interface ProviderInterface {
	/**
	 * @param list<array{role: 'system'|'user'|'assistant', content: string}> $messages
	 * @param array{model: ?string, maxTokens: int, temperature: ?float, effort: ?string, safetyId: ?string, purpose: 'move'|'coach'} $options
	 * @return array{status: 'done', text: string}|array{status: 'pending', taskId: int}
	 * @throws ProviderException with an upstream code (§10.8)
	 */
	public function chat(array $messages, array $options): array;
	/** @return list<array{id: string, label: string}> */
	public function listModels(): array;
}
```

All HTTP goes through `OCP\Http\Client\IClientService` with `timeout` 90 s (60 s for moves), `connect_timeout` 10 s,
`allow_redirects => false`, and `'nextcloud' => ['allow_local_address' => $allowed]` from `UrlGuard` (§12.2).
Direct providers are called synchronously inside the request.

- **OpenAI-compatible** (`kind: openai`; presets OpenAI, Mistral, OpenRouter, Groq, Google Gemini, Ollama, LocalAI,
  LM Studio, Custom): `POST {baseUrl}/chat/completions` with `Authorization: Bearer <key>` (when a key is set),
  body `{model, messages, temperature, max_completion_tokens}` (`max_tokens` for presets that need it; on a `400` naming
  an unsupported parameter the call is retried once without it and that is remembered per model in the cache);
  answer `choices[0].message.content`. `GET {baseUrl}/models` → `data[].id`, filtered by
  `/embed|whisper|tts|dall-e|image|audio|moderation|transcribe|realtime|rerank|guard/i`. OpenRouter adds
  `X-Title: Quantum Chess` and never `HTTP-Referer`.
- **Anthropic** (`kind: anthropic`): `POST https://api.anthropic.com/v1/messages` with headers `x-api-key`,
  `anthropic-version: 2023-06-01`, `content-type: application/json`; body `{model, max_tokens, system, messages,
  output_config: {effort: 'low'}}` (`effort` `low` for moves, `medium` for the coach). No `temperature`: current
  models reject sampling parameters. On a `400` naming `output_config`/`effort` the call is retried once without it
  (remembered per model). The answer is the concatenation of the `text` content blocks; `stop_reason: "refusal"` →
  upstream `refused`, `max_tokens` → `bad_response`. `GET /v1/models?limit=1000` → `data[].id` / `display_name`.
  Suggested models (per release, the live list wins): `claude-opus-5` (default), `claude-sonnet-5`,
  `claude-haiku-4-5`.
- **Nextcloud AI** (`NextcloudAiProvider`, asynchronous): prefers `core:text2text:chat` (input `system_prompt`,
  `input` = the user message, `history` = `[]`), else `core:text2text` (input `input` = system prompt + `"\n\n"` + user
  message). `new Task($type, $input, 'quantumchess', $uid, 'quantumchess:<purpose>:<random>')`,
  `IManager::scheduleTask()`, returns `{status: 'pending', taskId}`. `taskStatus` uses `getUserTask($id, $uid)` and
  checks the app id; scheduled/running → `pending`; successful → parse `output`, then `deleteTask()` (the app keeps no
  prompts); failed/cancelled → `error`. The durations of the last 10 tasks are kept (`nc_ai_latencies`) for the admin
  status card. If the task type declares an optional `model` input with enum values, those are the model list;
  otherwise "Chosen by your administrator (<provider>)". Models (`ai#models`) for Nextcloud AI come from there.
- **Token limits**: `maxTokens = ai_max_output_tokens` (default 800) for plain chat models; × 4 for providers/models
  that spend output tokens on reasoning (all Anthropic calls; OpenAI model ids matching `/^(o\d|gpt-5)/`).
- **Safety identifier** (`ai_safety_identifier`): `hash_hmac('sha256', $uid, <app secret>)` truncated to 32 hex digits,
  sent as OpenAI `safety_identifier` or Anthropic `metadata.user_id`; never the user id itself.

### 10.3 Personas

| Id | Name | Priority | Tolerance (pp) | Style tags |
|---|---|---|---|---|
| `professor` | Professor Qubit | P0 | 4 | instructive, solid |
| `captain` | Captain Collapse | P0 | 10 | rolls, king hunts |
| `superposa` | Madame Superposa | P0 | 8 | split, merge, measure |
| `q7` | Q-7 | P0 | 1 | strongest, one number |
| `grandpa`, `luna`, `ko`, `tock` | Grandpa Gambit, Luna, Master Ko, Tock the Trickster | P1 | 6, 12, 5, 10 | GD §6.2 |

`Ai\Personas::block(string $id): string` returns the GD §6.2 prompt block; `Personas::exists()`. The JS catalogue
(`src/personas/`, ‹frontend-app›) uses the same ids, names, tolerances and style bonuses. Names are not translated.

### 10.4 Prompts (`PromptBuilder`)

- `RULES_SUMMARY` is the text of GD §6.3, verbatim; a unit test checks its key phrases against `docs/RULES.md`.
- **Move prompt** = the GD §6.4 template. Substitutions: `{name}`, `{persona block}`, `{language}` (English name of
  the language code, e.g. "Dutch"), the colour and move number, POSITION = `Engine::describeForLlm($state, $color)`,
  RECENT MOVES from `history` (`12. e2-e4 · 12… g8-f6|h6 · 13. d1-h5 {move 50%}`, using `pct`), OPPONENT SAYS =
  `«message»`, ENGINE CANDIDATES (rank, `✓` when `ok`, code, E as the AI side's percentage, tags rendered in English:
  `king-capture:50` → "king capture 50%", `capture:50:p` → "capture 50% pawn", …), LEGAL MOVES from
  `Engine::generateMoves` (above 120 moves: every standard move, Measure and merge, then candidate splits, then other
  splits in canonical order up to 40 splits, with "(+N split moves not listed)"), the retry line when `feedback` is
  set ("Your answer «e7-e5» was not accepted: blocked (every path is blocked). Choose exactly one code from LEGAL
  MOVES."; the English `whyIllegal` texts are in `PromptBuilder::REASON_TEXT`). Index mode replaces the ANSWER block
  with `{"pick": <candidate number>, "comment": …, "mood": …}`. Temperature 0.7 where supported.
- **Coach prompt** = the GD §5.5 system prompt; the user part contains POSITION, RECENT MOVES, ENGINE ANALYSIS
  (E as White's percentage, best moves with lines, threats, the last move's label and ΔE), CONTEXT, the last chat
  turns and the question. Temperature 0.3.
- For task types without a system prompt, the system part is prepended to the user part under a `SYSTEM:` header.
- **User text** (`message`, `question`, chat, lesson titles) is stripped of control characters and of `«`/`»`, cut
  to its limit and wrapped in `«…»`. Only the fields of GD §8.5 are ever sent: no user ids, names, e-mail addresses,
  opponent identities, player chat or instance URLs.

### 10.5 Answer parsing (`AnswerParser`)

Moves: strip whitespace and Markdown code fences; take the first balanced `{…}` (string-aware scan) and `json_decode`
it; read `move` (string ≤ 32), `pick` (integer 1–6), `comment` (control characters removed, whitespace collapsed,
≤ 200 characters) and `mood` (one of `happy, confident, playful, thinking, worried, surprised`, default
`thinking`). If there is no valid JSON, the first token matching
`[KQRBN]?[a-hA-H][1-8][-x:]?[a-hA-H][1-8]([|/,][a-hA-H][1-8])?(=?[QRBNqrbn])?|\?[KQRBN]?[a-h][1-8]|[O0o]-[O0o](-[O0o])?`
becomes `move` with an empty comment. Nothing found → `move: null, pick: null` (the client counts it as a failed
answer). Coach: the text with control characters removed, cut at 2000 characters, returned as Markdown.

### 10.6 Limits, usage and retries (`AiUsageService`)

- Per user and hour across sources: `ai_requests_per_hour` (default 60) via `ILimiter::registerUserRequest
  ('quantumchess-ai', …)` → `429 ai_rate_limited`; the static `#[UserRateLimit(limit: 120, period: 3600)]` is the hard
  ceiling. One concurrent request per user (`ai:busy:<uid>` added with `IMemcache::add`, TTL 120 s) → `429 ai_busy`.
  The organisation provider has a daily cap (`shared_daily_cap`) → the source becomes unavailable (`cap_reached`).
- Usage counters per day and source, aggregated only (app config `usage_<yyyymmdd>` = `{"nextcloud": n, "shared": n,
  "personal": n}`), kept 30 days.
- The server never retries a model answer; the client does (one retry with `feedback`, then the engine fallback,
  GD §6.4). The server retries a request once only for the unsupported-parameter cases above.
- Timeouts: direct providers 60 s for moves and 90 s for the coach; Nextcloud tasks are polled by the client (1, 2,
  3 s, then every 5 s; *Let the engine move* after 20 s; automatic engine move after 120 s).

### 10.7 Keys

`Ai\KeyStore`: keys are encrypted with `ICrypto::encrypt()` and stored as sensitive values (app config
`shared_api_key` with `sensitive: true`; user config `ai_api_key` with `IUserConfig::FLAG_SENSITIVE`). They are never
returned by any API (`hasKey`, `keyHint` = the last 4 characters), never logged and never sent to the browser. A key
that cannot be decrypted yields `keyUnreadable: true` ("Your saved key can't be read any more. Please enter it
again.").

### 10.8 Error mapping

Upstream failures become `502 {"error": "upstream", "upstream": <code>}` with `<code>` ∈ `invalid_key` (401/403),
`model_not_found` (404 or a model error), `rate_limited` (429), `quota_exceeded` (402 or quota messages), `timeout`,
`unreachable` (connection errors, blocked addresses), `bad_response` (unparseable body, `max_tokens`), `refused`
(provider refusal). Upstream bodies never reach the browser; they are logged at debug level without keys.

---

## 11. Settings

### 11.1 Admin settings (app config, `IAppConfig`) ‹backend-ai›

Read and written only through `SettingsService` (§6.5). Booleans are typed `bool`, lists `array`. Values outside
the range are rejected with `400 invalid_argument` and `field`.

| Key | Type | Default | Range / values | Notes |
|---|---|---|---|---|
| `mp_enabled` | bool | true | | multiplayer on/off |
| `mp_groups` | array | `[]` | group ids | empty = everyone |
| `open_challenges` | bool | true | | |
| `rated_enabled` | bool | true | | |
| `invite_expiry_days` | int | 14 | 1–60 | |
| `open_expiry_days` | int | 7 | 1–30 | |
| `max_active_games` | int | 30 | 1–200 | |
| `chat_enabled` | bool | true | | |
| `chat_retention_days` | int | 90 | 1–3650 | |
| `purge_finished_days` | int | 0 | 0 or 30–3650 | 0 = keep |
| `leaderboard_mode` | string | `opt-in` | `off`, `opt-in`, `opt-out` | replaces v1 `leaderboard_enabled` |
| `leaderboard_min_games` | int | 5 | 1–100 | |
| `leaderboard_active_days` | int | 90 | 1–3650 | |
| `leaderboard_groups` | array | `[]` | group ids | |
| `nc_ai_enabled` | bool | true | | Nextcloud AI source |
| `shared_enabled` | bool | false | | organisation provider |
| `shared_provider` | array (lazy) | `{}` | `{preset, kind, baseUrl, model, label}` | |
| `shared_api_key` | string (lazy, **sensitive**, encrypted) | `''` | | only via `PUT …/admin/secret` |
| `shared_groups` | array | `[]` | group ids | empty = everyone |
| `shared_daily_cap` | int | 1000 | 0–1 000 000 | 0 = no cap |
| `shared_model_allowlist` | array | `[]` | model ids | when set, users may pick one of these models |
| `allow_personal_keys` | bool | true | | |
| `shared_allow_local` | bool | false | | the organisation provider may use a local address |
| `local_allowlist` | array | `[]` | exact base URLs | users may pick a local base URL only on an exact match (replaces v1 `allow_local_servers`) |
| `ai_requests_per_hour` | int | 60 | 1–1000 | per user, all sources |
| `ai_max_output_tokens` | int | 800 | 100–4000 | |
| `ai_safety_identifier` | bool | false | | HMAC pseudonym, §10.2 |
| `ai_privacy_notice` | string (lazy) | `''` | ≤ 1000 characters | appended to the first-use notice |
| `app_secret` | string (lazy, sensitive) | generated | 64 hex | internal: HMAC key |
| `nc_ai_latencies` | array (lazy) | `[]` | last 10 durations (ms) | internal |
| `usage_<yyyymmdd>` | array (lazy) | | per-source counts | internal, 30 days |

### 11.2 User settings (user config, `IUserConfig`, app `quantumchess`)

| Key | Type | Default | Owner (writes) | Readers |
|---|---|---|---|---|
| `preferences` | string, lazy (JSON ≤ 16 KiB) | `{}` | backend-integration (`PreferencesService`) | PageController |
| `trainer_progress` | string, lazy (JSON ≤ 64 KiB) | `{}` | backend-integration (`TrainerProgressService`) | PageController |
| `local_stats` | string, lazy (JSON) | `{}` | backend-integration (`StatsService`) | |
| `invite_policy` | string | `everyone` | backend-ai (`SettingsService`) | InvitePolicy |
| `blocked_users` | array | `[]` | backend-ai | InvitePolicy |
| `notify_invites`, `notify_your_turn`, `notify_reminders`, `notify_draw_offers`, `notify_results`, `notify_chat`, `notify_previews` | bool | true | backend-ai | NotificationService |
| `ai_provider` | array, lazy | `{}` | backend-ai | |
| `ai_api_key` | string, lazy, **sensitive**, encrypted | `''` | backend-ai (`KeyStore`) | |
| `ai_default_source` | string | `''` | backend-ai | |
| `ai_notice_ack` | array | `[]` | backend-ai | PageController (features) |

The leaderboard choice is `qchess_ratings.listed` (§5.4), written through `RatingService::setListed`.

### 11.3 In-app preferences ‹frontend-app›

One JSON document per user, loaded from the `preferences` initial state, merged over `PREFERENCE_DEFAULTS` by
`src/services/preferences.js`, changed live and saved debounced (500 ms) through `PUT /api/settings/preferences`.
Unknown keys are preserved (forward compatibility). The server stores it verbatim.

```js
export const PREFERENCE_DEFAULTS = Object.freeze({
	v: 1,
	// Board
	boardTheme: 'nextcloud',        // nextcloud | wood | green | slate | quantum | contrast
	pieceSet: 'cburnett',           // cburnett | letters
	coordinates: 'inside',          // inside | outside | all | off
	highlightLastMove: true,
	showLegalMoves: true,
	// Quantum display
	showPercentages: true,
	probabilityFormat: 'percent',   // percent | fraction
	ghostStyle: 'fade',             // fade | solid
	linkThreads: 'selection',       // off | selection | always
	kingDangerBoth: true,           // show king danger for both sides
	showPossibilities: true,
	physicsNames: false,
	// Moves
	inputMode: 'both',              // both (click & drag) | click | drag
	confirmMoves: null,             // null = by pointer (coarse → 'rolled', fine → 'never') | never | rolled | always
	safetyNet: true,                // "Warn before risking my king"
	autoQueen: false,
	confirmResign: true,
	// Animation and sound
	animationSpeed: null,           // null = normal, or off under reduced motion | slow | normal | fast | off
	sound: true,
	volume: 40,                     // 0–100, step 5
	moveChime: true,
	vibration: true,
	// Coach
	coachLevel: null,               // null = beginner until 6 lessons are done, then standard | beginner | standard | off
	evalBar: true,
	evalFormat: 'percent',          // percent | pawns
	hints: true,
	engineLines: true,              // canned engine lines
	fastEngine: false,
	// Pass & play
	autoFlip: false,
	tabletop: false,
	// Remembered UI state
	seenTips: [],                   // ghost | rolled-target | link | king-ring | budget
	lastNewGame: {},                // { online: {...}, computer: {level, color, coach}, ai: {persona, source, model, strength, color}, local: {white, black, tabletop, autoFlip} }
	navCollapsed: {},               // { phone: bool, tablet: bool, desktop: bool }
})
```

---

## 12. Privacy and security

### 12.1 Privacy

- The data inventory of GD §8.5 is normative; packaging copies it into the README for administrators' records of
  processing.
- Sent to an AI provider: exactly the fields of GD §8.5 (§10.4). Online games appear as "White"/"Black" in prompts.
- Privacy by default: leaderboard opt-in, chat previews switchable, no external requests besides the configured AI
  provider, no CDNs or external fonts, no per-user tracking or telemetry.
- The first-use notice (GD §8.5) is shown once per source before the first AI request (`POST /api/ai/notice`).

### 12.2 SSRF and outbound requests (`Ai\UrlGuard`)

1. Base URLs are normalised (lower-case scheme and host, no trailing slash) and must be `http`/`https` without
   credentials, query or fragment.
2. A URL is *local* when its host is `localhost`, a single-label name, `*.local`, or an IP literal / resolved address
   that is loopback, private, link-local or unique-local.
3. Non-local URLs must use `https`; requests go out with the default local-address block.
4. Local URLs are allowed only (a) for the organisation provider when `shared_allow_local` is on, or (b) for a personal
   provider whose normalised base URL **exactly equals** an entry of `local_allowlist`. Only then is
   `allow_local_address` set on the request. Otherwise `400 url_not_allowed`.
5. No redirects are followed. *Test connection* returns only a code and a model count.

### 12.3 Other rules

- **Keys**: §10.7. **Password confirmation** (`#[PasswordConfirmationRequired]` on the server, `confirmPassword()`
  from `@nextcloud/password-confirmation` on the client): saving an admin secret, *Delete my data*, [P1] new season.
- **Authorisation**: every game endpoint checks participation; non-participants get `404` (never `403`), so game ids
  cannot be probed. Admin routes lack `#[NoAdminRequired]`.
- **Input**: every body field validated for type, length and range; engine states from clients only through
  `validateState`; moves only through the PHP engine; bodies capped (§7.1).
- **Output**: chat, names and invitation messages are rendered as text; AI comments and coach answers through
  `NcRichText` with Markdown on, autolinks off and no raw HTML (GD G18); AI output truncated (§10.5).
- **Concurrency**: optimistic `rev` and `ply` checks; unique `(game_id, ply)` and `(game_id, client_id)`.
- **Randomness**: CSPRNG at apply time, recorded with its weights; the chain on every move.
- **No user probing** (§8.2); presence only between game partners [P1]; the leaderboard filtered by visibility.
- **Code**: no private `\OC\` API (Psalm clean); notify_push only through soft detection [P1].
- The release gate checklist of GD §8.6 is part of the packaging acceptance.

---

## 13. Page, initial state and CSP ‹backend-integration›

`PageController::index()` (`#[NoAdminRequired]`, `#[NoCSRFRequired]`) adds the script `quantumchess-main`, provides
the initial state below and returns `TemplateResponse('quantumchess', 'main')` with a CSP that adds
`addAllowedWorkerSrcDomain("'self'")` (the engine worker is a same-origin module script). `templates/main.php` renders
nothing (the SPA mounts on `#content`). `PageController::game(int $id)` redirects to
`linkToRoute('quantumchess.page.index') . '#/game/' . $id`.

| Initial state key | Shape | Built from |
|---|---|---|
| `user` | `{uid, displayName, isAdmin, language, locale}` | `IUserSession`, `IGroupManager`, `IFactory` |
| `features` | `{multiplayer, openChallenges, rated, chat, leaderboardMode, ai: {nextcloud, shared, personal, any, default, noticeAcked: string[]}, distributedCache, notifyPush: false}` | `SettingsService`, `InvitePolicy::isMultiplayerUser`, `AiSourceService::summary` |
| `preferences` | the stored object or `{}` | `PreferencesService::get` |
| `lobby` | `LobbyDTO` (§7.2), or `null` when multiplayer is off for the user | `GameService::getLobby` + `GameSerializer::lobby` |
| `trainerProgress` | the progress document or `{}` | `TrainerProgressService::get` |
| `appVersion` | string | `IAppManager::getAppVersion('quantumchess')` |

Settings pages ‹backend-ai›: `Settings\Section` (id `quantumchess`, name "Quantum Chess", icon `app-dark.svg`,
priority 80) is used for both admin and personal settings. `AdminSettings::getForm()` adds the script
`quantumchess-settings-admin`, the initial state `admin-settings` (the `GET /api/settings/admin` payload) and renders
`templates/settings/admin.php` (`<div id="quantumchess-admin-settings"></div>`). `PersonalSettings::getForm()` adds
`quantumchess-settings-personal`, the initial state `personal-settings` = `{personal: <GET /api/settings/personal>,
multiplayer: <GET /api/settings/multiplayer>}` and renders `templates/settings/personal.php`
(`<div id="quantumchess-personal-settings"></div>`).

---

## 14. Frontend

### 14.1 Entry points and router ‹frontend-app›

- `src/main.js` creates the app, installs the router, adds class `qc-app` to the root and mounts `App.vue` on
  `#content`. Styles: `src/styles/tokens.scss` (board tokens, ‹frontend-board›) and `src/styles/app.scss` are imported
  once by `App.vue`.
- `src/router.js` uses `createWebHashHistory()`. Views are fixed paths so that the router can import them before they
  exist; views marked *lazy* are loaded with dynamic `import()` (separate chunks, §14.9).

| Path | Name | View (owner) | Notes |
|---|---|---|---|
| `/` | `home` | `HomeView` ‹frontend-app› | first paint from the `lobby` initial state |
| `/new` | `new-game` | `HomeView` with `NewGameDialog` open ‹frontend-app› | query `mode=online\|computer\|ai\|local`, `opponent=<uid>` prefill; closing goes back (or to `/`) |
| `/game/:id(\d+)` | `online-game` | `OnlineGameView` ‹frontend-online› | invitation, join, live and finished states |
| `/play/:mode(computer\|ai\|local)/:id?` | `local-game` | `LocalGameView` ‹frontend-app› | without `id`: creates a game from `preferences.lastNewGame[mode]` and replaces the URL |
| `/review/:source(local\|online)/:id` | `review` | `ReviewView` ‹coach-review›, lazy | |
| `/trainer` | `trainer` | `TrainerHomeView` ‹trainer›, lazy | |
| `/trainer/lesson/:id` | `lesson` | `LessonView` ‹trainer›, lazy | `id` like `L04` |
| `/trainer/puzzle/:id` | `puzzle` | `PuzzleView` ‹trainer›, lazy | `id` like `P05` |
| `/trainer/lab` | `lab` | `LabView` ‹trainer›, lazy | query `setup=<base64url JSON SetupSpec>` optional |
| `/rules` | `rules` | `RulesView` ‹frontend-app›, lazy | |
| `/stats` | `stats` | `StatsView` ‹frontend-online›, lazy | |
| `/history` | `history` | `HistoryView` ‹frontend-online›, lazy | |
| `/dev/board` | `dev-board` | `src/components/board/dev/BoardPlayground.vue` ‹frontend-board›, lazy | registered only when `import.meta.env.DEV` (`npm run dev`); never in production builds |
| anything else | – | redirect to `/` | |

Browser back closes dialogs, the what-if view and the possibility view before it leaves a game (GD §10): dialogs
that should close on back push a `?dialog=` query entry.

### 14.2 App shell ‹frontend-app›

`App.vue` = `NcContent app-name="quantumchess"` → `AppNavigation.vue` + `NcAppContent` (`<router-view>`) +
`NewGameDialog` + `AppSettingsDialog` + `<PieceSprite />` ‹frontend-board› (mounted **once**; every piece graphic uses
its symbols) + `<AchievementToasts />` ‹trainer›. The navigation (GD §2.2) lists the lobby groups from `useLobby()`
‹frontend-online›: *Your move* (avatar, name, `NcCounterBubble`, actions Open/Resign), *Waiting for opponent*,
*Invitations* (inline Accept/Decline), *On this device* (`listLocalGames()`), footer *Settings*. It collapses on game
routes when the board would be smaller than 560 px (manual toggles remembered per breakpoint in
`preferences.navCollapsed`). **Tab title** (`useTabTitle`): `(n) Quantum Chess` with `n = counts.yourTurn +
counts.invitations`; in an open online game where it is your move and the tab is hidden: `● Your move · Quantum
Chess`.

### 14.3 Services (`src/services/`) ‹frontend-app›

#### 14.3.1 `api.js` — one function per route

Every function returns the response body (`response.data`) and throws `ApiError` on failure. Other modules call these
functions by name and never use axios directly (settings bundles included).

```js
export class ApiError extends Error {   // name 'ApiError'
	status        // HTTP status, 0 for network errors
	code          // body.error, or 'network' | 'timeout' | 'http_<status>'
	data          // the parsed body (e.g. {game} on conflicts, {reason} on illegal_move)
	retryAfter    // seconds or null
}
```

| Function | Route |
|---|---|
| `getLobby()` | `GET /api/games` → LobbyDTO |
| `getSummary(etag)` | `GET /api/games/summary` → `{status: 200 \| 304, data, etag}` (does not throw on 304) |
| `getOpenChallenges()` | `GET /api/games/open` → `GameSummary[]` |
| `getHistory(query)` | `GET /api/games/history` → `{games, next}` |
| `getRecentOpponents()` | `GET /api/users/recent` → `UserRef[]` |
| `checkRated(opponent)` | `GET /api/games/rated-check` → `{rated, reason}` |
| `searchUsers(term, {limit = 10})` | core `GET /ocs/v2.php/core/autocomplete/get?search=…&itemType=quantumchess&itemId=new&shareTypes[]=0&limit=…` → `[{userId, displayName, subline, status}]` (current user removed) |
| `createGame(body)` | `POST /api/games` → `GameLive` |
| `getGame(id)` | `GET /api/games/{id}` → `GameFull` |
| `pollGame(id, {rev, ply, chat, watching}, {signal})` | `GET /api/games/{id}/poll` → poll body |
| `acceptGame(id)`, `declineGame(id)`, `cancelGame(id)`, `joinGame(id)` | → `GameLive` / `GameSummary` |
| `sendMove(id, {code, ply, clientId, thinkMs})` | `POST /api/games/{id}/moves` → move response |
| `resignGame(id)`, `abortGame(id)` | → `GameLive` |
| `drawAction(id, action)` | `POST /api/games/{id}/draw` → `GameLive` |
| `sendChat(id, {message} \| {phrase})` | `POST /api/games/{id}/chat` → `{message, rev}` |
| `muteChat(id, muted)` | `PUT /api/games/{id}/mute` → `{muted}` |
| `requestRematch(id)` | `POST /api/games/{id}/rematch` → `GameLive` |
| `exportGameUrl(id)`, `exportAllGamesUrl()` | URL strings for download links |
| `getStats()` | `GET /api/stats` |
| `getLeaderboard({group})` | `GET /api/leaderboard` |
| `recordLocalResult(body)` | `POST /api/stats/local` → `{local}` |
| `getTrainerProgress()`, `saveTrainerProgress(doc)` | `GET`/`PUT /api/trainer/progress` → progress |
| `savePreferences(prefs)` | `PUT /api/settings/preferences` |
| `deleteMyData()` | `DELETE /api/me/data` (calls `confirmPassword()` first) |
| `getAiSources()` | `GET /api/ai/providers` |
| `getAiModels(source)` | `GET /api/ai/models` |
| `requestAiMove(body, {signal})`, `requestCoach(body, {signal})` | `POST /api/ai/move` / `coach` → `{status, …}` |
| `getAiTask(taskId, {signal})`, `cancelAiTask(taskId)` | `GET`/`DELETE /api/ai/task/{taskId}` |
| `ackAiNotice(source)` | `POST /api/ai/notice` |
| `getPersonalSettings()`, `savePersonalSettings(patch)` | `GET`/`PUT /api/settings/personal` |
| `getMultiplayerSettings()`, `saveMultiplayerSettings(patch)` | `GET`/`PUT /api/settings/multiplayer` |
| `getAdminSettings()`, `saveAdminSettings(patch)`, `saveAdminSecret(key, value)` | admin settings (`saveAdminSecret` calls `confirmPassword()` first) |
| `testAiConnection(body)` | `POST /api/settings/test` |

#### 14.3.2 Other services

| File | Exports |
|---|---|
| `preferences.js` | `PREFERENCE_DEFAULTS` (§11.3), `preferences` (reactive, defaults merged, effective values resolved: `effective.confirmMoves`, `effective.animationSpeed`, `effective.coachLevel`), `setPreference(key, value)`, `updatePreferences(patch)`, `markTipSeen(id)` |
| `localGames.js` | §14.7: `listLocalGames()`, `loadLocalGame(id)`, `saveLocalGame(record)`, `deleteLocalGame(id)`, `createLocalGame(options)`, `rollFor(record, stateBefore, code)`, `replayLocalGame(record, n?)`, `exportLocalGame(record)`, `importQcg(json)` |
| `aiTasks.js` | `waitForAiTask(taskId, {signal, onTick})` — polls `getAiTask` at 1, 2, 3 s, then every 5 s; resolves with the done payload, rejects with `ApiError`/`AbortError` |
| `format.js` | `formatPercent(weightOrProbability)`, `formatDeadline(deadlineAt, now)`, `formatRelative(ts)`, `formatRating(rating, provisional)`, `resultText(result, reason, names)` (GD §3.9 reason copy) |
| `ids.js` | `uuid()` (v4 from `crypto.getRandomValues`), `localGameId()` (`lg_<base36 time><8 random base36>`) |
| `storage.js` | `readJson(key, fallback)`, `writeJson(key, value)` — `localStorage` wrappers that swallow quota and privacy-mode errors |

`src/sound/sound.js` ‹frontend-board›: `playSound(name, {speed})` with names `select, move, capture, split, merge,
measure, captured, moved, missed, win, loss, yourMove, kingDanger, illegal`; `startSuspense({speed}) → stop()`;
`unlockAudio()` (called on the first user gesture); `configureSound({enabled, volume})`. `src/sound/haptics.js`:
`vibrate(name)` with `select, captured, moved, missed, kingCapture` (GD §3.10).

### 14.4 The game controller interface and composables

#### 14.4.1 `GameController` (the contract between game views and the game screen)

Produced by `useLocalGame` ‹frontend-app› and `useOnlineGame` ‹frontend-online›; consumed by `GameScreen`
‹frontend-app›, `CoachPanel` ‹coach-review› and the chat components. Documented as a JSDoc typedef in
`src/composables/gameController.js` ‹frontend-app›.

```js
/**
 * @typedef {object} GameController
 * @property {'online'|'computer'|'ai'|'local'} kind
 * @property {Ref<string|number>} id
 * @property {Ref<boolean>} loading
 * @property {Ref<Error|null>} error
 * @property {Ref<State>} state                  the displayed live state; replaced only after an animation finished
 * @property {Ref<State|null>} startState        null = standard start
 * @property {ComputedRef<LegalMove[]>} legalMoves   what the local user may play now; [] when not interactive
 * @property {Ref<MoveEntry[]>} moves
 * @property {ComputedRef<{w: PlayerInfo, b: PlayerInfo}>} players
 * @property {ComputedRef<'w'|'b'|null>} myColor       null in pass & play and for spectators
 * @property {ComputedRef<'w'|'b'|'both'|null>} movableColor
 * @property {Ref<'w'|'b'>} orientation
 * @property {ComputedRef<boolean>} interactive
 * @property {ComputedRef<GameResult|null>} result     {result, reason, winner: 'w'|'b'|null, source: 'engine'|'server'}
 * @property {Ref<PendingMove|null>} pending           {code, phase: 'sending'|'retrying'|'failed', attempt}
 * @property {ComputedRef<Capabilities>} can
 * @property {ComputedRef<boolean>} fairPlayLock       own active online game: coach, hints, eval, analysis, export hidden
 * @property {Ref<Banner[]>} banners                   [{id, type: 'info'|'warning'|'error', text, actions: [{label, handler}]}]
 * @property {(move: LegalMove) => Promise<void>} submitMove
 * @property {(n: number) => State} stateAt            state after n moves (0 = start), memoised
 * @property {(animator: Animator) => () => void} attachAnimator
 * @property {() => void} flip
 * @property {() => Promise<void>} undo, resign, abort, offerDraw, rematch, retryPending, discardPending
 * @property {(accept: boolean) => Promise<void>} answerDraw
 * @property {() => object} exportRecord                .qcg.json document (§8.13)
 * @property {() => void} dispose
 */
// MoveEntry  = {ply, color, code, notation, measurement: MeasurementRecord|null, u: number|null,
//               by: 'human'|'engine'|'ai'|'ai-fallback'|'opponent', comment?: string, mood?: string,
//               createdAt?: number, chain?: string}
// PlayerInfo = {color, kind: 'user'|'engine'|'ai'|'local', name, userId?, level?, persona?, sourceLabel?,
//               rating?, provisional?, adminBadge?, deadlineAt?, now?, statusText?, thinking?: {depth?, since},
//               comment?: {text, mood, at}}
// Capabilities = {undo, resign, abort, offerDraw, answerDraw, rematch, chat, coach, analysis, export,
//                 showOtherResult, typeMove}
```

#### 14.4.2 The animation handshake

`QuantumBoard` implements `Animator` (exposed methods, §14.6.1). The controller never changes `state` while an
animation runs: for every new move (own, engine, AI, opponent, replayed) it calls `await animator.play(event)` and only
then assigns `state.value = event.after` (GD §3.11). Without an attached animator the state is assigned at once.

```js
// Animator     = {play(event): Promise<void>, startRoll({before, move, actor}): RollHandle, finish(): void}
// MoveEvent    = {before: State, after: State, move: LegalMove, measurement: MeasurementRecord|null,
//                 actor: 'self'|'opponent', names: {mover, opponent}, lessonRoll?: boolean}
// RollHandle   = {resolve({after, measurement}): Promise<void>, fail(): Promise<void>}   (online own rolled moves)
```

`play()` resolves at the end of the Collapse phase (≈ 1.3 s at Normal speed, GD §3.6.1); a click or key press
fast-forwards (`finish()`). Result chips, the reveal arrow and sounds continue after `play()` resolved.

#### 14.4.3 Fair-play lock and capabilities

`fairPlayLock` is true for `kind === 'online'`, a participant viewer and `status === 'active'` (rated or not,
GD G11). While locked: no eval bar, hints, threat warnings, coach tab content ("Available after the game."), analysis,
export, "Show the other result" or review link; the king ring and the safety net stay.

#### 14.4.4 `useLocalGame(id)` ‹frontend-app›

`src/composables/useLocalGame.js` returns a `GameController` plus `{record, engine: {thinking, depth}, ai: {thinking,
elapsedMs, canLetEngineMove, letEngineMove(), cancel(), answerMode, say(text)}}`.

- `submitMove(move)`: for a rolled move `u = rollFor(record, state, move.code)` (drawn and **persisted before**
  applying, ER §9.3); `applyMove(state, move.code, {u})`; append `{code, u, …}`; save; `reportGameEvent`
  ‹trainer›; `animator.play`; then the reply.
- **Computer**: `bestMove(state, {level, rng, fast})` ‹ai-js›, wait `displayMs`, apply through the roll memo.
- **AI opponent**: `useLlmOpponent` (below); its moves also use the roll memo.
- **Pass & play**: both sides local; `movableColor = state.turn`; orientation follows the side to move only with
  `autoFlip`; `tabletop` rotates the top player's pieces (board preference).
- **Undo**: removes the last own move (and the reply after it), replays from the record with the recorded `u`, marks
  `assisted = true`; the roll memo is kept.
- **End**: engine result, or resignation (`reason: 'resignation'`, recorded in the record, never in the state). An
  unassisted finished game is reported once with `recordLocalResult` (not for pass & play: `hotseat` counts games
  only). `gameOver` event to the trainer.

`useLlmOpponent({record, persona, source, model, strength})` ‹frontend-app›: implements GD §6.4. Steps: `candidates()`
‹ai-js› with the persona tolerance; `requestAiMove` (pending → `waitForAiTask`; *Let the engine move* after 20 s, the
engine moves automatically after 120 s); validate with `findMove` (index mode: `pick` → candidate); under Balanced and
Sharp a legal move without `ok` counts as not accepted; one retry with `feedback: {answer, reason}`; fallback = the
`ok` candidate with the highest `E + style bonus`, marked `by: 'ai-fallback'` (⚙ badge) with a canned persona line;
after 3 fallbacks within 5 AI moves `record.ai.answerMode = 'index'`. Errors (`ai_unavailable`, `upstream`,
`ai_rate_limited`, `rated_game_in_progress` cannot happen locally) → fallback plus a toast.

#### 14.4.5 `useOnlineGame(id)` ‹frontend-online›

`src/online/useOnlineGame.js` returns a `GameController` plus `{game: Ref<GameLive|null>, chat: Ref<ChatDTO[]>,
sendChat(textOrPhrase), setMuted(bool), connection: Ref<'ok'|'retrying'|'offline'|'maintenance'|'expired'>,
altered: Ref<null|{ply}>, accept(), decline(), cancel(), join(), shareUrl}`.

- **Own move** (GD §7.5): `clientId = uuid()`. Certain and quantum moves are applied optimistically with the JS engine
  and animated; rolled moves call `animator.startRoll()` and animate the result only when the server answered. The
  response is reconciled: replay the move with the recorded `u`, compare `serializeState` with the server `state`
  (byte equality; the server state wins on mismatch) and recompute the chain.
- **Errors**: network/5xx → retry with the same `clientId` after 1, 3 and 9 s, then `pending.phase = 'failed'` with a
  sticky banner (*Retry*, *Undo*); `409 conflict` / `403 not_your_turn` → roll back, adopt `data.game`, animate the
  opponent's move, toast "Your opponent moved first"; `400 illegal_move` → reload, toast "That move is no longer
  possible"; `409 game_over` → reload and show the result; `429` → wait `Retry-After`.
- **Polling** through `usePoller` with the GD §7.10 intervals; new moves are replayed in order with their recorded `u`
  (only the last one is animated), chat is appended, `rev` stored.
- **Chain check** (ER §9.4, ‹frontend-online›'s `src/online/chainCheck.js`): on load and on every fetch the whole game
  is replayed from `startState ?? initialState()` with the recorded `u`, recomputing `chainStart`/`chainNext`;
  every recomputed chain must equal the server's, and the stored `(ply, chain)` of `localStorage` key
  `quantumchess.chain.v1` must match the server's move at that ply. A mismatch sets `altered` and shows the persistent
  error banner "Game history was altered on the server" linking to Verify. Deleted players: §8.7.
- `BroadcastChannel('quantumchess')` messages: `{type: 'game', id, rev, payload}` (a poll or move result, adopted by
  other tabs, which postpone their next poll) and `{type: 'lobby', rev}`.

`src/online/usePoller.js`: `usePoller(fetchFn, {interval: () => ms})` with `visibilitychange`/`online` handling,
exponential backoff (×2, ±20 % jitter, cap 120 s), `Retry-After`, and `connection` state (banner after 2 failures;
`503` maintenance; `401` "Your session expired. Reload the page.").

#### 14.4.6 `useLobby()` ‹frontend-online›

`src/online/lobby.js`, a singleton seeded from the `lobby` initial state:
`{lobby: Ref<LobbyDTO|null>, counts: ComputedRef<{yourTurn, invitations, total}>, loading, error, refresh(),
start(), stop(), accept(id), decline(id), cancel(id), join(id)}`. `start()` (idempotent, called by `App.vue`) polls
`getSummary(etag)` every 30 s (15 s on Home, 60–120 s when hidden) and calls `getLobby()` when the token changes.

#### 14.4.7 `useCoach(options)` ‹coach-review›

`src/coach/useCoach.js`:

```js
useCoach({state, moves, myColor, enabled, context}) → {
	level,                 // ComputedRef<'beginner'|'standard'|'off'>
	analysis, analyzing,   // Ref<Analysis|null>, Ref<boolean> (600 ms, deepening while idle, GD §5.3.1)
	threats,               // ComputedRef<[{square, piece, pCap, expectedLoss, linked: number[]}]>
	markers,               // ComputedRef<[{square, kind: 'threat'|'opportunity', pct}]>  → QuantumBoard.markers
	arrows, highlights,    // → QuantumBoard.arrows / highlights (hints)
	qualityByPly,          // Ref<Map<number, QualityLabel>>
	hint: {tier, text, next(), reset()},   // four tiers, GD §5.3.2
	used,                  // Ref<boolean>: hints or coach used (sets coachUsed on local records)
}
```

`enabled` is false under the fair-play lock and when the coach level is `off`.

#### 14.4.8 Other composables ‹frontend-app›

| Composable | Returns |
|---|---|
| `useBoardSize(containerRef, {reserved})` | `{squareSize, boardPx, layout: 'phone'\|'phone-landscape'\|'tablet'\|'desktop'\|'wide'}` (GD §3.1 formula, integer `S ≥ 36`, rAF-throttled `ResizeObserver`) |
| `useAiSources()` | `{sources, defaultSource, anyAvailable, refresh(), ensureNotice(source): Promise<boolean>}` (shows `AiNoticeDialog` once per source) |
| `useTabTitle()` | installs the tab-title behaviour of §14.2 |
| `useGameHotkeys(controller, board)` | registers F, P, M, `,`, `.`, L and `?` with `useHotKey` (the board registers its own keys, §14.6.1) |

### 14.5 Component tree and ownership

```
App.vue ‹app›
├─ AppNavigation.vue ‹app› (uses useLobby ‹online›, listLocalGames)
├─ <router-view>
│  ├─ HomeView ‹app›: PlayTiles ‹app› · LobbyOnlineSections ‹online› · TrainerCard ‹trainer› · RecentGames ‹online› · EmptyState ‹app›
│  ├─ LocalGameView ‹app› → GameScreen
│  ├─ OnlineGameView ‹online› → GameScreen (slots: chat → GameChat ‹online›; overlay → InvitationPanel / JoinPanel ‹online›;
│  │                                        banners → DrawOfferBanner, AlteredHistoryBanner, ConnectionBanner ‹online›)
│  ├─ ReviewView ‹coach› (QuantumBoard, MoveList, RollLog, EvalGraph, ReportCard, KeyMoments, LuckLedger, VerifyPanel)
│  ├─ TrainerHomeView · LessonView · PuzzleView · LabView ‹trainer› (QuantumBoard, BoardControls, PlayerCard, CoachPanel)
│  ├─ RulesView ‹app› (MiniBoard, rules content from src/rules/)
│  ├─ StatsView ‹online› (TrophyCabinet ‹trainer›, LeaderboardTable, RatingGraph) · HistoryView ‹online›
├─ NewGameDialog ‹app› · AppSettingsDialog ‹app› · AiNoticeDialog ‹app›
├─ PieceSprite ‹board› · AchievementToasts ‹trainer›

GameScreen.vue ‹app›  (props: controller; slots: banners, chat, overlay)
├─ GameLayout ‹app› (grid + container queries; slots eval/board/panel; useBoardSize)
│  ├─ EvalBar ‹coach› (hidden under the fair-play lock or when the preference is off)
│  ├─ StatusBanner ‹app› (history view, controller.banners, slot banners)
│  ├─ PlayerCard ‹app› ×2 (BudgetPips ‹board›, KingDangerChip ‹board›, CapturedTray ‹app›, TurnStatus ‹app›, AiBubble ‹app›, admin chip)
│  ├─ QuantumBoard ‹board› (+ internal layers, MovePreview, PromotionPicker, PartPopover, MeasurementToast,
│  │                        SafetyNetDialog, TypeMoveDialog, PossibilitiesPanel, SrAnnouncer)
│  ├─ ControlsRow ‹app› (BoardControls ‹board›, PossibilitiesChip ‹board›, quick toggles, NcActions ⋮)
│  └─ GamePanel ‹app› (tabs Moves · Log · Chat · Coach: MoveList/MoveStrip ‹app›, RollLog ‹app›, slot chat, CoachPanel ‹coach›, GameActions ‹app›)
├─ GameOverDialog ‹app› (+ ConfettiFx ‹app›) · ResultBar ‹app› · ConfirmDialog ‹app›
```

### 14.6 Component contracts

#### 14.6.1 `QuantumBoard.vue`, `useBoardInput`, `BoardControls.vue` ‹frontend-board›

`QuantumBoard` props:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `state` | `State` | required | position to draw |
| `legalMoves` | `LegalMove[]` | `[]` | targets come only from this list |
| `input` | `BoardInput` | internal | shared input controller (below); pass the same object to `BoardControls` |
| `orientation` | `'w'\|'b'` | `'w'` | |
| `squareSize` | integer px | 64 | `S`; the board is `8·S` |
| `interactive` | boolean | false | |
| `movableColor` | `'w'\|'b'\|'both'\|null` | null | |
| `lastMove` | `{move, key}\|null` | null | `key === 'miss'` draws the dashed "attempted" outline |
| `history` | `State[]` | `[]` | earlier states of the game (e.g. `controller.stateAt(0 … n−1)`, memoised) for stable identity colours; without it colours are derived from `state` alone |
| `arrows` | `[{from, to, kind: 'best'\|'played'\|'threat'\|'hint'\|'forced'\|'reveal', dashed?}]` | `[]` | |
| `highlights` | `[{square, kind: 'hint'\|'lesson'\|'danger'}]` | `[]` | |
| `markers` | `[{square, kind: 'threat'\|'opportunity', pct}]` | `[]` | coach crosshairs |
| `preview` | `{state, kind: 'history'\|'other-result'\|'lesson', label}\|null` | null | read-only view with in-board banner |
| `names` | `{w, b}` | `{w: 'White', b: 'Black'}` (translated) | for result sentences |
| `hotkeys` | boolean | false | register the board's `useHotKey` keys (1–4, E, W, D, `/`) |
| `lessonRoll` | boolean | false | tag result chips "Lesson roll" |

Display preferences (theme, pieces, coordinates, percentages, format, ghost style, link threads, danger for both
sides, speed, sound) are read from `preferences` ‹frontend-app› inside the board.

Events: `move(legalMove)` — a committed move, **after** the safety net and the confirmation;
`select(square|null)`; `illegal({code, square})`; `preview-close()`.

Exposed methods (`Animator`, §14.4.2): `play(event)`, `startRoll({before, move, actor})`, `finish()`; plus `focus()`.

`useBoardInput({state, legalMoves, movableColor, interactive})` (`src/components/board/useBoardInput.js`) returns
`BoardInput`:

```js
{
	mode, setMode(m),                         // 'move'|'split'|'merge'|'measure'; resets to 'move' after a commit
	modes,                                     // {split: {enabled, reason}, merge: {…}, measure: {…}} (GD §3.5.1 tooltips)
	selection, splitFirst, mergeSources,
	targets,                                   // marker descriptors (GD §3.5.2)
	hovered, previewInfo,                      // odds-card data (GD §3.5.5)
	pending, confirm(), cancel(),              // confirmation (Confirm moves preference)
	safetyNet, resolveSafetyNet(action, dontAskAgain),   // action: 'play'|'show'|'cancel'
	whatIf, setWhatIf(square|null),
	possibility, viewPossibility(index|null),
	typeMove(text),                            // → {ok, move?, reason?} through findMove
	onCommit(callback) → unsubscribe,
	reset(),
}
```

`BoardControls.vue` props `input`, `compact` (phone): move switcher (`NcRadioGroup`, keys 1–4), preview text, and the
pending *Cancel* / *Play* buttons. `PossibilitiesChip.vue` props `state`, `input`: the chip, the possibilities panel
and "View one possibility" (GD §3.4.4).

#### 14.6.2 Board building blocks for other modules ‹frontend-board›

| Component | Props | Used by |
|---|---|---|
| `MiniBoard.vue` | `state` or `pieces` (`GameSummary.preview` format), `size` (px, 120), `orientation`, `highlights` (squares), `arrows`, `interactive` (false) — emits `square-click(square)` | lobby cards, possibilities panel, rules page, trainer path |
| `BudgetPips.vue` | `used` (1–8), `color`, `state` (names the ghosts in the popover) | PlayerCard, lessons |
| `KingDangerChip.vue` | `weight` | PlayerCard |
| `RollBar.vue` | `record` (MeasurementRecord), `labels?`, `showText` (true), `compact` | RollLog, VerifyPanel, lessons |
| `OutcomeBar.vue` | `outcomes` (`[{key, weight}]`), `realised?` | preview card, lessons |
| `NotationText.vue` | `notation` (engine notation) or `{move, stateBefore, measurement}`; `size` (16) | MoveList, MoveStrip, RollLog, coach chips, review |
| `PieceIcon.vue` | `type`, `color`, `size`, `set?` | captured trays, trophies, copy |
| `PieceSprite.vue` | – | mounted once by App.vue (and by the settings apps if they show pieces) |

#### 14.6.3 Game components ‹frontend-app›

| Component | Props | Events |
|---|---|---|
| `GameScreen.vue` | `controller` | `review`, `new-game` |
| `PlayerCard.vue` | `player` (PlayerInfo), `state`, `active`, `showDanger` | – |
| `MoveList.vue` / `MoveStrip.vue` | `moves`, `startState`, `currentPly` (`null` = live) | `select-ply(n)`, `copy-codes`, `export`, `review` |
| `RollLog.vue` | `moves`, `stateAt`, `canShowOther`, `names` | `show-other({index, key})`, `select-ply(n)` |
| `GameOverDialog.vue` | `result`, `players`, `myColor`, `summary` (`{moves, rolls, rare, converging}`), `ratingChange`, `kind`, `level?`, `rematchState?` | `rematch`, `review`, `new-game`, `next-level`, `close` |
| `ResultBar.vue` | `result`, `names`, `can` | `review`, `rematch` |
| `ControlsRow.vue` | `controller`, `input`, `state` | – |

"Show the other result": `RollLog` emits `show-other`; `GameScreen` computes the alternative outcome with
`getOutcomes(stateAt(index), code)` and passes `preview: {state, kind: 'other-result', label}` to the board (only when
`can.showOtherResult`). History view: `select-ply(n)` → `preview: {state: stateAt(n), kind: 'history'}`.

#### 14.6.4 Online, lobby and stats components ‹frontend-online›

`GameChat.vue` (props `controller`: the online controller) — plain-text messages, quick phrases, `NcEmojiPicker`,
mute. `LobbyOnlineSections.vue` (no props; `useLobby`) — Your move, Invitations, Waiting, Open challenges (GD §2.3
items 2–5). `RecentGames.vue` (no props). `InvitationPanel.vue`, `JoinPanel.vue`, banners. `StatsView` shows the
online record, `RatingGraph.vue` (SVG), `LeaderboardTable.vue` (with the one-time listing question) and
`<TrophyCabinet />` ‹trainer›. `HistoryView` pages `getHistory` with filters, links to review and export.

#### 14.6.5 Coach ‹coach-review›

| Component | Props | Events |
|---|---|---|
| `EvalBar.vue` | `analysis`, `orientation`, `vertical`, `format`, `luckJump?` (`{delta}`) | – |
| `CoachPanel.vue` | `coach` (useCoach result), `state`, `moves`, `myColor`, `context` (`{kind: 'game'\|'lesson'\|'puzzle'\|'review', title?, goal?, ply?}`), `locked` | `show-move({code})` |
| `CoachChat.vue` | `state`, `moves`, `analysis`, `context`, `playerColor` | `show-move({code})` |

Pure logic (`src/coach/`): `quality.js` (GD §5.3.4 labels from a `PlyAnalysis`), `accuracy.js`, `luck.js` (luck
ledger), `themes.js` (GD §5.3.2), `threats.js` (GD §5.3.3), `hints.js`, `keyMoments.js`, `chips.js` (move codes in
answers → validated move chips via `findMove`).

#### 14.6.6 Review ‹coach-review›

`ReviewView` loads the game (`getGame` for online — only `finished`/`aborted`, otherwise "Available after the game.";
`loadLocalGame` for local), replays it with the recorded `u`, runs `analyzeGame` ‹ai-js› (400 ms per ply, progress
bar, cached in `localStorage` key `quantumchess.review.v1.<source>.<id>.<engineVersion>`), and shows `EvalGraph`,
`ReportCard` (accuracy, luck ledger, quantum style), `KeyMoments` (Show / Explain (AI) / Practice this [P1]) and, for
online games, `VerifyPanel` (full replay: every roll with `u`, weights and `rollDisplay`; the chain from `chain_0`).
Opening a review reports `{type: 'reviewOpened'}` to the trainer.

#### 14.6.7 Trainer components ‹trainer›

`TrainerCard.vue` (Home: "Continue: Lesson 5 · Pass = link", path progress, next puzzle), `TrophyCabinet.vue`
(Stats), `AchievementToasts.vue` (App), lesson/puzzle/lab components under `src/components/trainer/`.

### 14.7 Local game record ‹frontend-app›

Stored in `localStorage` under `quantumchess.localGames.v1` (index: `[{id, mode, updatedAt, result, players}]`) and
`quantumchess.localGame.v1.<id>` (the record). At most 50 records; the oldest finished ones are pruned first.

```js
{
	v: 1, id: 'lg_mf3k2j1a8x0c', mode: 'computer' | 'ai' | 'local',
	createdAt: 1790000000, updatedAt: 1790000500,          // seconds
	players: { w: {kind: 'human', name}, b: {kind: 'engine', level: 3} },   // or {kind: 'ai', persona, source, model, strength}
	humanColor: 'w' | 'b' | null,                          // null = pass & play
	startState: null,                                      // or a State (lab / imported games)
	moves: [{code: 'c1-h6', u: 8388608, key: 'capture', by: 'human', t: 1790000100, comment?: '…', mood?: 'happy', fallback?: true}],
	rolls: {'0/8f9af7718bec3d8a/c1-h6': 8388608},          // the roll memo (ER §9.3)
	state: State,                                          // cache of the current state (must equal the replay)
	result: null | {result, reason},                       // engine reasons, or 'resignation'
	assisted: false, coachUsed: false, undoCount: 0,
	ai: {answerMode: 'code', fallbackPlies: [], chat: [{from: 'ai' | 'me', text, ply}]},
	options: {coach: 'beginner' | 'standard' | 'off', autoFlip: false, tabletop: false},
	imported: false,
}
```

`rollFor(record, stateBefore, code)`: identity = `rollIdentity(stateBefore, code)`; if present return it, else draw
`crypto.getRandomValues(new Uint32Array(1))[0] >>> 8`, store it in `record.rolls`, **save the record**, return it.
Replays always use each move's `u` (or `key` as `outcome` when `u` is `null`). Imported `.qcg.json` files become
records with `imported: true`, `assisted: true`.

### 14.8 Trainer data ‹trainer›

#### 14.8.1 Lessons (`src/trainer/lessons/Lnn-<slug>.js`)

```js
export default {
	id: 'L04', slug: 'land-roll', order: 4, group: 'essentials' | 'deeper' | 'graduation', minutes: 2,
	title: () => t('quantumchess', 'Land = roll'),
	goal: () => t('quantumchess', '…'),
	steps: [
		{type: 'explain', text: [() => t(…)], setup?: SetupSpec, highlights?, arrows?, animation?},
		{type: 'task', setup: {fen, prelude: ['e7-d5|f5']}, prompt: () => t(…), modes: ['move'],
		 success: {moveIs: ['d1-d5']},                    // predicate descriptor, see predicates.js
		 accepted: ['d1-d5'],                             // for the validator
		 hints: [() => t(…), () => t(…), {arrow: ['d1', 'd5']}],
		 reply: 'none' | {scripted: 'e7-e6'} | {engine: 3},
		 roll: ['capture', 'move'],                       // forced outcome order ("Lesson roll")
		 branches: {capture: {text: () => t(…)}, move: {text: () => t(…)}},
		 claims: [{code: 'd1-d5', outcomes: {move: 50, capture: 50}}],   // quoted numbers, checked by the validator
		 fail: () => t(…)},
		{type: 'quiz', question: () => t(…), answers: [() => t(…)], correct: 1, explanation: () => t(…)},
		{type: 'watch', setup?, code: '?a4', roll: ['a4', 'c4'], narration: () => t(…)},
	],
}
```

Predicates (`src/trainer/predicates.js`) are pure functions of `(before, move, after)`: `moveIs`, `moveType`,
`fromSquare`, `pieceSolid`, `captureRisk` (≤ p), `kingRisk` (`moveRisk` ≤ p), `nearBest` (against the solver value),
`gameWon`. Step descriptors name them declaratively (`{kingRisk: 0}`) so the validator can check them.

#### 14.8.2 Puzzles (`src/trainer/puzzles/Pnn.js`, `src/trainer/puzzles.json`)

```js
export default {
	id: 'P05', name: () => t('quantumchess', 'Hit or Miss'), stars: 2,
	type: 'forced' | 'max' | 'survive' | 'material', side: 'w' | 'b', horizon: 1,
	setup: {fen: 'R6k/1n4pp/8/8/8/8/2K5/8 w - - 0 1', prelude: ['b7-c5|d8']},
	accepted: ['a8-d8'], value: null,                     // value for max/survive/material (percent or pawns)
	traps: [{code: 'a8-h8', value: 50, text: () => t(…)}],
	idea: () => t(…),
}
```

`npm run puzzles:build` (`tools/puzzles-build.mjs`) writes `src/trainer/puzzles.json`:
`{"v": 1, "rules": 1, "generatedAt": "<ISO>", "puzzles": {"P05": {"accepted": [...], "value": …, "tree": {"<positionHash>":
["<code>", …]}}}}` (the accepted set at every node of the solution tree), so runtime grading is a lookup; the worker
solver is only a fallback. `npm run trainer:validate` (`tools/trainer-validate.mjs`) checks GD §5.2.4 against the
real JS engine and `solve()` ‹ai-js›, and fails on any difference.

#### 14.8.3 Achievements and game events

`src/trainer/events.js` is the only entry point other modules use; it is tiny and lazy-loads the rest:

```js
reportGameEvent(event)   // fire and forget
// {type: 'move', mode: 'online'|'computer'|'ai'|'local'|'lesson'|'puzzle'|'lab', mine: boolean,
//  move: LegalMove, measurement, before, after, assisted: boolean}
// {type: 'gameOver', mode, level?, persona?, myColor, result: {result, reason}, won: boolean, assisted: boolean}
// {type: 'reviewOpened'}  |  {type: 'coachQuestion'}
```

Callers: `useLocalGame`, `useLlmOpponent` (frontend-app), `useOnlineGame` (frontend-online; `mine` moves and
`gameOver`), `ReviewView` and `CoachChat` (coach-review), lessons and puzzles (trainer). P0 achievement ids
(GD §5.6): `first-steps`, `quantum-graduate`, `puzzle-solver-1`, `puzzle-solver-2`, `split-personality`, `healer`,
`look-closer`, `preparation-beats-dice`, `linked`, `nowhere-to-run`, `beat-level-1` … `beat-level-5`,
`first-online-game`, `know-thyself`. Pass & play and assisted games update counters but unlock nothing.

#### 14.8.4 Progress document

GD §5.6 shape (`v: 1`), mirrored in `localStorage` (`quantumchess.trainer.v1`) and synced with
`PUT /api/trainer/progress` (debounced 2 s). **Merge** (implemented identically by `src/trainer/progress.js` and
`TrainerProgressService::merge`): `lessons[id]`: `done` = OR, `stars` = max, `at` = earliest non-null; `puzzles[id]`:
`solved` = OR, `stars`, `tries`, `hints` = max, `at` = earliest; `achievements[id]` = earliest timestamp; every numeric
leaf of `counters` = max; `xp` = max; `streak`: the side with the later `last` wins, `best` = max. Unknown keys are kept
(the incoming value wins).

### 14.9 Styling, i18n, accessibility, performance

- **Styling**: tokens of GD §3.2 in `src/styles/tokens.scss` ‹frontend-board›, scoped to `.qc-app`; board themes in
  `src/styles/board-themes.scss`; everything else uses Nextcloud CSS variables and scoped styles; light, dark and
  high-contrast themes; no external fonts.
- **i18n**: GD §9.2. Every string through `t`/`n` with placeholders; percentages through `formatProbability` /
  `Intl.NumberFormat`; move codes are never translated. Result words, "ghost", "link", "roll" and "possibility" carry a
  translator comment pointing to the RULES.md glossary. PHP strings through `IL10N`; notifications render in the
  recipient's language.
- **Accessibility**: GD §9.1 (grid semantics, roving tabindex, live region, **D** describe, contrast test, never colour
  alone, reduced motion, keyboard-complete play). ‹frontend-board› owns the board parts; every module owns the a11y of
  its components.
- **Performance and bundles**: main entry ≤ 250 KB gzip (`npm run size`); lazy chunks for trainer views, review,
  stats/history, rules, the settings dialog and the AI worker. Only `transform`/`opacity` animate. Idle: only the
  ghost glow animates, paused in hidden tabs.
- **`localStorage` keys** (all wrapped in `storage.js`, all optional): `quantumchess.localGames.v1`,
  `quantumchess.localGame.v1.<id>` (frontend-app), `quantumchess.chain.v1`, `quantumchess.chatSeen.v1`
  (frontend-online), `quantumchess.review.v1.*` (coach-review), `quantumchess.trainer.v1` (trainer),
  `quantumchess.engine.v1.bench` (ai-js).

### 14.10 Rules page and persona catalogue ‹frontend-app›

- **Rules page**: RULES.md is English-only, so the page is not rendered from the Markdown file at runtime. Its content
  lives in `src/rules/sections.js` as translatable structured data that follows RULES.md section by section (60-second
  summary, sections 1–10, FAQ, glossary): `[{id, title: () => t(…), blocks: [{type: 'p' | 'list' | 'table', …},
  {type: 'board', setup: SetupSpec, caption: () => t(…), highlights?, arrows?, play?: {code, outcome}}]}]`.
  Live mini-boards are `MiniBoard` ‹frontend-board›; a `play` block animates one move with a forced outcome and a
  "Show the other result" toggle. Wording changes to RULES.md must be mirrored here (packaging checks the section list
  in a unit test).
- **Personas** (`src/personas/index.js`): `PERSONAS = [{id, name, priority: 'P0'|'P1', tolerance, styleTags,
  styleBonus: {split, merge, measure, roll, standard}, avatar: {calm, happy, worried} (SVG components),
  canned: {start, opponentLucky, opponentUnlucky, kingDanger, win, loss, fallback} (arrays of thunks returning
  translated lines)}]`; `moodToExpression(mood)` maps the six moods onto the three drawings (GD §6.2). Ids and
  tolerances equal §10.3. Level lines for the built-in engine (`LEVELS[].cannedLine`) live in
  `src/personas/engineLines.js`.

---

## 15. Quality gates, tests and verification

### 15.1 Gates (every module, before handing over)

| Gate | Command |
|---|---|
| JS lint | `npm run lint` |
| JS unit tests | `npm test` |
| Build | `npm run build` (and `npm run size` once packaging added it) |
| Trainer data | `npm run trainer:validate` (trainer, and anyone touching the engine) |
| Fixtures unchanged | `npm run fixtures && git diff --exit-code tests/fixtures/engine` (engine-js, engine-php) |
| PHP style | `composer cs:check` |
| PHP static analysis | `composer psalm` |
| PHP unit tests | `composer test:unit` |
| App metadata | `xmllint --noout --schema <server>/resources/app-info.xsd appinfo/info.xml` |
| End-to-end | `npm run test:e2e` against the development Nextcloud (packaging scaffolding; each module its own spec) |

Tests follow the ownership of §2: `tests/js/<area>/**/*.spec.js` (Vue component tests end in `.vue.spec.js` and run in
happy-dom), `tests/php/Unit/<Area>/**Test.php` (namespace `OCA\QuantumChess\Tests\Unit\<Area>`), benchmarks
`tests/js/**/*.bench.js`. PHP unit tests run without a Nextcloud (OCP interfaces are mocked); anything needing a real
database or HTTP is verified in the running instance (§15.2).

### 15.2 Verification in the running Nextcloud

The development server runs at `http://127.0.0.1:8080` (no pretty URLs: `/index.php/apps/quantumchess/`) with this
repository symlinked as app `quantumchess`; users `admin`/`QuantumAdmin!2026`, `bob`/`QuantumBob!2026`,
`carol`/`QuantumCarol!2026`; `php /tmp/claude-0/nc/server/occ …`.

- Schema: `php occ migrations:migrate quantumchess` (the installed version stays 1.0.0 during development), then
  `php occ db:add-missing-indices`; inspect with the database of the instance.
- Background job: after `GameMaintenanceJob` exists, `php occ app:disable quantumchess && php occ app:enable
  quantumchess` re-registers the jobs of `info.xml`; `php occ background-job:list | grep QuantumChess`, run one with
  `php occ background-job:execute <id> --force-execute`.
- HTTP: `tests/api/<module>.mjs` (Node 22 `fetch`, basic auth, header `OCS-APIRequest: true`, base URL from
  `QC_BASE_URL`, default `http://127.0.0.1:8080`) exercise the module's routes end to end and exit non-zero on
  failure.
- Browser: Playwright specs `tests/e2e/<module>.spec.mjs` (executable from `QC_CHROMIUM`, in this environment
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; the library is installed in `/tmp/claude-0/e2e`); log in through
  `/index.php/login`, assert no console errors, take a screenshot for the report.

### 15.3 CI and release ‹packaging›

GitHub workflows: lint (JS, PHP, SPDX headers, `info.xml` schema), JS tests + build + bundle size, trainer validation,
fixture drift, PHP tests on PHP 8.1–8.4, Psalm, e2e against Nextcloud 32 and 35 (matrix up to the `max-version` of
`info.xml`), and a tag-triggered release workflow that builds, packages (excluding sources and dev files), signs with
the App Store certificate (secrets) and uploads. `README.md`, `CHANGELOG.md`, `RELEASING.md`, the icons, the
`npm run screenshots` script (seven screenshots, GD §10) and the EN/NL/DE translations (`l10n/`) complete the release.

---

## Appendix A. Error codes

| Code | HTTP | Raised by | Extra body fields |
|---|---|---|---|
| `invalid_argument` | 400 | any | `field` (optional) |
| `invalid_state` | 400 | AI endpoints (`validateState` failed) | `invariant` |
| `illegal_move` | 400 | moves | `reason` (ReasonCode) |
| `rated_needs_deadline`, `rated_not_allowed` | 400 | create | |
| `own_challenge` | 400 | join | |
| `url_not_allowed` | 400 | settings | |
| `not_found` | 404 | any game or task | |
| `user_not_found` | 404 | create, rematch, join (every policy failure) | |
| `multiplayer_disabled`, `open_challenges_disabled`, `chat_disabled` | 403 | games | |
| `not_your_turn` | 403 | moves | `game` (GameLive) |
| `rated_game_in_progress` | 403 | AI move and coach | |
| `ai_unavailable` | 403 | AI | `reason` |
| `conflict` | 409 | moves, actions | `game` (GameFull) |
| `game_over`, `invalid_status`, `already_taken`, `abort_not_allowed`, `no_draw_offer`, `chat_closed`, `export_unavailable` | 409 | games | |
| `draw_not_allowed` | 409 | draw | `availableAtPly` |
| `too_large` | 413 | any body | |
| `too_many_invitations`, `too_many_open`, `too_many_active` | 429 | create, accept, join | |
| `ai_rate_limited`, `ai_busy` | 429 | AI | (`Retry-After`) |
| `upstream` | 502 | AI, settings test, models | `upstream` (§10.8) |
| `internal` | 500 | any | |

Nextcloud's own `#[UserRateLimit]` answers `429` with its own body; clients treat every `429` alike.

## Appendix B. Changes from SPEC v1

- Engine API per ER App. F: `applyMove` takes `u` (precedence outcome > u > rng); LegalMove and Measurement shapes of
  ER §4.10/§5.5; new `isLegal`, `whyIllegal`, `hasAnyLegalMove`, `positionHash`, `budget`, `kingDanger`,
  `kingTrapped`, `moveRisk`, `links`, `linkGroups`, `rollDisplay`, `pct`, `serializeState`, chain functions,
  `rollIdentity`, `supportKey`; constants `T`, `BUDGET`, `MAX_LOCATIONS`, `MAX_WORLDS`; no `MIN_BRANCH_WEIGHT`;
  result reason `king_trapped`. JS-only UI helpers in `src/engine/ui/`.
- Fixtures store `u`, compare canonical bytes (the 1e-12 tolerance is gone) and include parser fixtures.
- AI: five named levels, `analyze` with E and the fog band, `solve`, `candidates`, `analyzeGame`.
- Database: `qchess_games` gains `opponent_uid`, `color_choice`, `rev`, `time_control`, deadlines, expiry,
  reminders, draw cool-down, rating snapshots, `unrated_reason`, `chain`, mute flags and reserved columns (the composite
  `version` string is replaced by `rev`); statuses `aborted`, `expired`; `qchess_moves` gains `color`, `chain`,
  `state_hash`, `support_key`, `client_id`, `think_ms`, and `ply` is 0-based (state ply before the move);
  `qchess_chat` gains `kind`, `params`; `qchess_ratings` gains `peak`, `rated_games`, `listed`, `last_rated_at` and
  loses `local_stats` (now user config).
- API: lobby/summary/history/export/recent/rated-check routes, abort, mute, OCS notification actions, AI task cancel
  and notice, multiplayer and admin-secret settings, `DELETE /api/me/data`, `GET /g/{id}`; `POST /api/games` takes
  `timeControl`, `message`, `scopeGroup` and ignores `color` for rated games; `POST …/moves` takes `clientId` and
  returns `chain`; polling uses `rev`; `/api/ai/move` takes `answerMode` and `candidates` (was `hints`), returns
  `mood`; both AI endpoints refuse rated positions.
- Game flow: correspondence deadlines, automatic timeout, reminders with quiet hours, abort rules, Elo K 40/10 → 20
  with the pair cap (replacing K = 32 and the 30-day auto-finish for deadline games), `GameMaintenanceJob` replacing
  `CleanupJob`.
- LLM: `core:text2text:chat` preferred with `core:text2text` fallback; prompts per GD §6.4/§5.5 with
  `describeForLlm`; JSON answers with `mood`; SSRF allow-list instead of `allow_local_servers`.
- Settings: `leaderboard_mode` replaces `leaderboard_enabled`; `local_allowlist` and `shared_allow_local` replace
  `allow_local_servers`; full preference defaults.
- Frontend: routes `/new`, `/trainer/lab`, `/history`; the GameController interface and animation handshake; module
  ownership of every file.
