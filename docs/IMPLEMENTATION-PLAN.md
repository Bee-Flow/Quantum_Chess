# Quantum Chess 1.0: implementation plan

This plan splits **all P0 work** of [`GAME-DESIGN.md`](GAME-DESIGN.md) §11 into twelve modules that are built in
parallel against the contract in [`SPEC.md`](SPEC.md). The rules are [`ENGINE-RULES.md`](ENGINE-RULES.md). Section
references: "SPEC §x", "GD §x", "ER §x".

- Every path has exactly one owner (§1 and SPEC §2). Owned paths are **disjoint**.
- Every P0 row of GD §11 has exactly one **owner** module (§2). Other modules may *contribute* parts through the
  interfaces of the SPEC; the owner is accountable for the row's acceptance.
- Engineers do **not** commit; the lead commits after reviewing a module's report.

---

## 1. Modules at a glance

| # | Module | Scope | Owned P0 rows | Depends on |
|---|---|---|---|---|
| 1 | **engine-js** | JS rules engine, parity fixtures and their generator | R1 | – |
| 2 | **engine-php** | PHP twin engine, fixture replay | – (contributes R1) | engine-js fixtures |
| 3 | **ai-js** | Built-in engine: levels, search, solver, analysis, candidates, worker | M2 | engine-js |
| 4 | **backend-games** | DB, entities, GameService, invite policy, time control, chain, ratings, game controllers, poll cache, maintenance job, deletion listener, export | R2, M1, N4, N7 | engine-php; skeletons of 5, 6 |
| 5 | **backend-integration** | Notifications, dashboard, stats and leaderboard, preferences, trainer progress, data deletion, page + initial state + CSP, app registration | N2, N3, X3 | backend-games, backend-ai (skeleton) |
| 6 | **backend-ai** | LLM sources and providers, prompts, AI and settings controllers, settings service, admin/personal settings pages | M3, N6, X1, X2 | engine-php, backend-games |
| 7 | **frontend-board** | QuantumBoard and all board components, JS UI helpers, board themes and tokens, sound and haptics | G2–G8, G11 | engine-js, frontend-app (preferences) |
| 8 | **frontend-app** | App shell, navigation, router, services (api, preferences, local games), local game flows incl. LLM opponent, home, new game dialog, in-app settings, shared game components, rules page | S1, S2, G1, G9, G10, M4 | engine-js, frontend-board, ai-js |
| 9 | **frontend-online** | Online game view and controller, polling, BroadcastChannel, chain check, chat, lobby components and store, history, stats and leaderboard | N1, N5, N8 | frontend-app, backend-games |
| 10 | **trainer** | Lessons, puzzles, validator and puzzles.json, lab, trainer home, achievements and trophies | T1, T2, T3, T7 | engine-js, ai-js, frontend-board, frontend-app |
| 11 | **coach-review** | Coach (eval bar with fog band, hints, threats, move quality), AI coach chat, post-game review with Verify | T4, T5, T6 | ai-js, frontend-board, frontend-app, backend-ai |
| 12 | **packaging** | Dependencies and scripts, CI, release, README/CHANGELOG/RELEASING, icons, screenshots, l10n, e2e scaffolding, accessibility and performance gates | Q1, Q2, Q3 | all (final) |

---

## 2. P0 coverage matrix (GD §11)

Every P0 row appears exactly once with one owner. IDs are used in the module sheets.

| ID | Area | P0 item (GD §11) | Owner | Contributors |
|---|---|---|---|---|
| R1 | Rules | JS and PHP engines to ENGINE-RULES v1, byte-identical on all fixtures, vectors and property tests | engine-js | engine-php (PHP twin and replay) |
| R2 | Rules | Roll memo for local games; server CSPRNG at apply time; the hash chain | backend-games | frontend-app (roll memo), engine-js and engine-php (chain, `rollIdentity`) |
| S1 | Shell | Navigation with game lists and counters; lobby with initial state; New game dialog; empty states | frontend-app | frontend-online (`useLobby`, lobby sections), backend-integration (initial state) |
| S2 | Shell | Rules page with live mini-boards | frontend-app | frontend-board (`MiniBoard`) |
| G1 | Game screen | Responsive layout (phone, tablet, desktop, landscape phone), integer board sizing | frontend-app | frontend-board |
| G2 | Game screen | Ghost rendering (opacity, ring, badge, glow), identity dots, part threads, link glyphs | frontend-board | – |
| G3 | Game screen | What-if view (conditional view) | frontend-board | – |
| G4 | Game screen | King ring (amber/red with percentage) and the king safety net | frontend-board | – |
| G5 | Game screen | Budget pips; possibilities chip and panel; view one possibility | frontend-board | frontend-app (placement in cards and controls row) |
| G6 | Game screen | Move switcher with Measure; all target markers; click, drag, keyboard, type-a-move | frontend-board | – |
| G7 | Game screen | Move preview (odds card) with resolution icons and `explainOutcome` | frontend-board | – |
| G8 | Game screen | Roll animation, result chip and copy, reveal arrow, "Show the other result" | frontend-board | frontend-app (`RollLog` trigger, `GameScreen` preview wiring) |
| G9 | Game screen | Move list, roll log with roll bar and `rollDisplay`, move strip | frontend-app | frontend-board (`RollBar`, `NotationText`) |
| G10 | Game screen | Game-over dialog with every reason, result bar, confetti | frontend-app | – |
| G11 | Game screen | Sound set and haptics; six board themes; cburnett and Letters pieces | frontend-board | – |
| M1 | Modes | Online correspondence games (invite, open challenge, deadlines, draw, resign, abort, rematch, chat) | backend-games | frontend-online (UI), backend-integration (notifications) |
| M2 | Modes | Computer (5 levels) | ai-js | frontend-app (game flow) |
| M3 | Modes | AI opponent with 4 personas (3 expressions each), all three AI sources, index mode, fallback | backend-ai | frontend-app (`useLlmOpponent`, persona catalogue and avatars), ai-js (`candidates`) |
| M4 | Modes | Pass & play (names, auto-flip, tabletop mode) | frontend-app | frontend-board (tabletop rendering) |
| T1 | Trainer | Lessons L1–L11 with lesson rolls, stars and the Lab | trainer | – |
| T2 | Trainer | Puzzles P01–P11 with real rolls, stars and "Replay the other result" | trainer | – |
| T3 | Trainer | Build-time validator and `puzzles.json` | trainer | ai-js (`solve`) |
| T4 | Trainer | Coach: eval bar with fog band, hints (4 tiers), threat warnings, move-quality badges | coach-review | ai-js (`analyze`, fog band) |
| T5 | Trainer | Post-game review: graph, accuracy, luck ledger, key moments, Verify | coach-review | ai-js (`analyzeGame`) |
| T6 | Trainer | AI coach chat with move chips | coach-review | backend-ai (`/api/ai/coach`) |
| T7 | Trainer | Achievements (P0 set of §5.6), trophy cabinet, trainer home | trainer | all game modules report events; frontend-online (Stats page placement) |
| N1 | Multiplayer | `rev` + cache polling, BroadcastChannel, idempotent moves, conflict handling | frontend-online | backend-games (rev, cache, idempotency) |
| N2 | Multiplayer | Notifications with OCS actions, reminders with quiet hours | backend-integration | backend-games (OCS controller, reminder scheduling) |
| N3 | Multiplayer | Dashboard widget, tab-title and navigation counters | backend-integration | frontend-app (tab title, navigation), frontend-online (counts), packaging (overlay icons) |
| N4 | Multiplayer | Elo (40/10 → 20), pair cap, provisional marker, leaderboard (opt-in, filtered) | backend-games | backend-integration (leaderboard endpoint), frontend-online (views), frontend-app (PlayerCard) |
| N5 | Multiplayer | Hash-chain check, Verify, altered-history banner, admin badge | frontend-online | coach-review (Verify), backend-games (chain, `adminBadge`), frontend-app (PlayerCard chip) |
| N6 | Multiplayer | Fair play: UI lock in own online games; server refusal for rated positions | backend-ai | backend-games (`FairPlayService`), frontend-app (`fairPlayLock`), coach-review (locked panel) |
| N7 | Multiplayer | Invite policy, block list, identical failure answers | backend-games | backend-ai (personal settings UI) |
| N8 | Multiplayer | History with filters; export `.qcg.json` | frontend-online | backend-games (history, export), frontend-app (local export/import) |
| X1 | Settings | In-app settings dialog, personal and admin settings, AI provider presets, model lists | backend-ai | frontend-app (in-app dialog) |
| X2 | Security | Encrypted keys, SSRF allow-list, rate limits, first-use AI notice, data inventory | backend-ai | backend-games (game route limits), frontend-app (`AiNoticeDialog`), packaging (README inventory) |
| X3 | Security | *Delete my Quantum Chess data*; `UserDeletedListener` | backend-integration | backend-games (`removeUser`, listener) |
| Q1 | Quality | Accessibility (grid semantics, live region, describe, contrast tests, axe), EN/NL/DE | packaging | frontend-board (board a11y), every UI module (own components, strings) |
| Q2 | Quality | Performance budgets of §9.3 with CI checks; k6 poll test | packaging | engine-js, ai-js (benchmarks), backend-games (poll path) |
| Q3 | Quality | Screenshots script; App Store signing and release workflow | packaging | – |

Count: 40 P0 rows; engine-js 1, engine-php 0, ai-js 1, backend-games 4, backend-integration 3, backend-ai 4,
frontend-board 8, frontend-app 6, frontend-online 3, trainer 4, coach-review 3, packaging 3.

---

## 3. Dependency order and schedule

```
                         ┌──────────────▶ ai-js ───────────────┬──────────▶ trainer
 engine-js ──────────────┤                                      ├──────────▶ coach-review
    │ fixtures           └──▶ frontend-board ──▶ frontend-app ──┴──▶ frontend-online
    ▼                                                  ▲
 engine-php ──▶ backend-games ──┬──▶ backend-ai ──────┘ (API)
                                └──▶ backend-integration ─────────▶ (API, initial state)
 packaging: day 0 (deps, scripts, e2e scaffold) ……………………………… final (l10n, screenshots, release, gates)
```

All modules start at the same time and code against the SPEC; a module that needs something not yet delivered mocks
it in its tests (JS `vi.mock`, PHP `createMock`) and never writes into another module's paths. To make that possible,
these **day-0/day-1 obligations** come first:

| Who | Delivers first (exact SPEC signatures, minimal behaviour) |
|---|---|
| packaging | `@nextcloud/password-confirmation` and `@playwright/test` in `package.json`, the npm scripts of SPEC §2.1, `vitest bench` support, `tests/e2e/playwright.config.mjs` + login helper |
| engine-js | `src/engine/index.js` exporting every SPEC §3.2 name (unfinished functions may throw `Error('not implemented')`), then the real functions in the order: state/hash → moves → apply → views → notation/parser → setup → chain |
| backend-games | `lib/Exception/ApiException.php`, entities and the migration |
| backend-integration | `NotificationService` skeleton (all methods, no-ops) |
| backend-ai | `SettingsService` skeleton (defaults of SPEC §11), `AiSourceService::summary()`, `AiMaintenance::cleanup()` no-op |
| frontend-app | `src/services/api.js` (all functions of SPEC §14.3.1), `src/services/preferences.js`, `src/composables/gameController.js` (typedef), `src/router.js` with every route (placeholder components where the view file does not exist yet, the `/dev/board` route) |
| frontend-board | `QuantumBoard.vue` and `MiniBoard.vue` with the SPEC props (static rendering first) |
| trainer | `src/trainer/events.js` with `reportGameEvent` (no-op queue) |

**Acceptance order** (a module is accepted when its consumers can build on it): engine-js → engine-php →
backend-games → backend-ai → backend-integration → frontend-board → ai-js → frontend-app → frontend-online →
coach-review → trainer → packaging (final gates).

---

## 4. Working agreements

- **Only touch owned paths.** Requests to another module go to `.integration-notes/<receiving-module>.md` (create the
  file if needed) as an entry: `## <date> from <module>: <title>`, the request, the SPEC section, and later the
  receiver's answer (`Status: done | declined (reason)`). Contract questions go to
  `.integration-notes/spec-integrator.md`; until answered, implement the current SPEC.
- **Conventions**: SPDX header on every file, tabs, `t('quantumchess', …)` for every user-visible string, no
  `console.log`, Nextcloud components and CSS variables, no new dependencies (SPEC §2.2).
- **Gates** before handing over (SPEC §15.1): `npm run lint`, `npm test`, `npm run build`; `composer cs:check`,
  `composer psalm`, `composer test:unit` (composer needs `COMPOSER_ALLOW_SUPERUSER=1` here); `xmllint` for
  `info.xml`. Plus the module's acceptance checks below, run against the development Nextcloud (SPEC §15.2).
- **Definition of done**: all owned P0 rows meet GD (copy, timings, states: empty, loading, error), every interface
  the module provides matches the SPEC, gates green, acceptance evidence (commands, outputs, screenshots) in the final
  report, integration notes addressed to the module answered.
- **Final report** (every module): files, APIs provided, tests and results, deviations from the SPEC (with reason),
  open issues.

---

## 5. Module sheets

### 5.1 engine-js

**Owned paths**: `src/engine/**` except `src/engine/ui/**`; `tests/js/engine/**`; `tests/fixtures/engine/**`;
`tests/fixtures/generate-engine-fixtures.mjs`.

**Owned P0**: R1. **Contributes**: R2 (`sha256hex`, `chainStart`, `chainNext`, `rollIdentity`), Q2 (benchmarks).

**Provides**: the JS API of SPEC §3.2 (all constants, errors and functions, including `supportKey`/`supportKeyMirror`
and the AI-only `applyForSearch`/`outcomesForSearch`); the fixture files and format of SPEC §3.5.
**Consumes**: ENGINE-RULES only.

**Deliverables**
- The complete rules of ER §1–§9 and App. A: validation (I1–I12), move generation in total order, lenient parser and
  `whyIllegal` with the exact check order, `applyMove` pipeline A1–A9 with sampling precedence outcome > u > rng >
  crypto, rescaling, bookkeeping, position hash, end checks E1–E6 with D18, `kingTrapped` without recursion, derived
  views, `pct`, `rollDisplay`, notation, setup positions.
- Pure-JS synchronous SHA-256, the chain functions and the roll-memo identity.
- The fixture generator (deterministic per seed) and the fixture files; ≤ 8 MB in total.

**Tests** (`tests/js/engine/`): every vector of ER §12 (start, W1–W17, rescale, move order, `r → u`, parser table,
notation round trips, chain, roll display, roll-memo identity, support keys), the property tests of ER §12 after every
step of every generated game, exception behaviour (`game_over`, bad `u`/`outcome`, `whyIllegal` never throws), purity
(no `Math.random`, `Date`, DOM or network in `src/engine`, checked by a test that scans the sources), benchmarks
(`*.bench.js`) for SPEC §3.6.

**Acceptance**
- `npm test`, `npm run lint` green; `npm run fixtures` twice produces identical files (`git diff --exit-code`).
- `npm run bench` within budget (generateMoves < 5 ms on a 64-world state, applyMove/getOutcomes < 2 ms,
  kingDanger + moveRisk for the full list < 8 ms).
- Joint gate with engine-php: every fixture replays byte-identically in PHPUnit.
- In the running Nextcloud: the production build loads without errors (`npm run build`, open the app).

### 5.2 engine-php

**Owned paths**: `lib/Engine/**`; `tests/php/Unit/Engine/**`.

**Owned P0**: none. **Contributes**: R1 (the PHP twin and the byte-parity proof), R2 (chain functions).

**Provides**: `OCA\QuantumChess\Engine\Engine` and its exceptions exactly as SPEC §3.4, including `describeForLlm`,
`certainFen`, `supportKey`, `supportKeyMirror`, `chainStart`, `chainNext`, `setupPosition`.
**Consumes**: the fixtures of engine-js (SPEC §3.5); before they exist, the vectors of ER §10–§12 typed into the tests.

**Deliverables**: the engine (64-bit integer arithmetic, `intdiv`, `strcmp`/`SORT_STRING`, `hash('fnv1a64')`,
`hash('sha256')`, canonical `json_encode` flags of ER §2.6, lists stay lists); single-move validation through
`whyIllegal` without generating the full list; `describeForLlm` per ER App. B.

**Tests**: replay of every fixture file (codes list, `after` bytes, measurement bytes, notation, hash, views), the
parser fixtures, the property tests, `describeForLlm` golden texts for W2, W4, W6, a performance test (apply + validate
≤ 10 ms p95 on a 64-world state, generous margin in CI).

**Acceptance**: `composer test:unit`, `composer psalm`, `composer cs:check` green; the parity gate green on the current
fixtures; no `\OC\` usage.

### 5.3 ai-js

**Owned paths**: `src/ai/**`; `tests/js/ai/**`.

**Owned P0**: M2. **Contributes**: M3 (`candidates` with tags), T3 (`solve`), T4 (`analyze` with fog band, mate
detection), T5 (`analyzeGame`), Q2 (benchmarks).

**Provides**: SPEC §4 (files, `LEVELS`, `STRENGTHS`, `PIECE_VALUES`, client API, shapes, worker protocol).
**Consumes**: engine-js public API and AI-only exports.

**Deliverables**: the five levels exactly as GD §6.1 (depth, softmax temperatures, random rates, split/merge/measure
policies, king-shot thresholds, defend rates, think and display times, solver use at level 5); expectimax in E-space
with Star1/Star2, transposition table by `positionHash`, killer/history ordering, quiescence on rolls ≥ 25 % and king
shots, split pruning, E1b-skipping search; evaluation of GD §6.1; exact solver with the four goals; candidates with
the tag grammar of SPEC §4.3; analysis with multiPV, `include`, fog band and "♚ in N"; per-ply game analysis; worker +
client with cancellation and main-thread fallback; first-launch benchmark.

**Tests**: deterministic (injected RNG, node budgets): certain king captures are always taken; level 5 finds W6's
converging capture and W14's trap; no level plays an illegal move over 200 random positions; solver accepted sets for
GD §5.2.2 P01, P02, P05, P08, P09, P10 and lesson step L1.3; candidate tags on crafted positions; fog band is `null`
without a roll and spans the outcomes otherwise; worker protocol with a fake Worker; a short self-play check that level
n+1 beats level n more often than not (small sample, marked slow).

**Acceptance**: `npm test`/`lint` green; `npm run bench` shows think times within ±10 % of GD §6.1 on this machine; the
production build emits the worker chunk; in the running Nextcloud (joint with frontend-app) a computer game at each
level replies with a legal move and the "Thinking… depth n" status.

### 5.4 backend-games

**Owned paths**: `lib/Db/**`, `lib/Migration/**`, `lib/Exception/**`, `lib/Event/**`, `lib/Command/**` [P1],
`lib/Service/GameService.php`, `GameSerializer.php`, `InvitePolicy.php`, `TimeControl.php`, `RatingService.php`,
`GameCache.php`, `FairPlayService.php`, `ExportService.php`, `lib/Controller/GameController.php`,
`lib/Controller/OcsGameController.php`, `lib/BackgroundJob/**`, `lib/Listener/UserDeletedListener.php`;
`tests/php/Unit/Games/**`; `tests/api/games.mjs`.

**Owned P0**: R2, M1, N4, N7. **Contributes**: N1 (rev, cache, idempotency), N2 (OCS controller, reminder
scheduling), N5 (chain, `adminBadge`), N6 (`FairPlayService`), N8 (history and export endpoints), X2 (rate limits of game
routes), X3 (`removeUser`, listener).

**Provides**: SPEC §5 (schema), §6.1 (`ApiException`), §6.3 (all services), §7.3–§7.4.5 (game routes and OCS routes),
§8 (game flow), `GameMaintenanceJob`, `UserDeletedListener`.
**Consumes**: engine-php; `NotificationService` (backend-integration) and `SettingsService` (backend-ai) by their
signatures; `AiMaintenance::cleanup` (backend-ai).

**Deliverables**: the migration with every table, column and index of SPEC §5; entities and mappers; the complete
lifecycle of SPEC §8.1 (start: colours, rated decision, deadline, `chain_0`); invite policy with identical `404`s and
limits; the move pipeline of SPEC §8.4 (check order, CSPRNG `u` drawn at apply time, chain, one transaction,
optimistic `rev`, unique keys, idempotent replays); draw offers with cool-down, resign, abort window, rematch
(idempotent, colours swapped, OCS action); time control, deadline reminders with quiet hours, timeouts
(`timeout`/`timeout_draw`/`aborted_timeout`, `finished_at = deadline`), abandonment, lazy resolution; Elo 40/10 → 20
with floor, pair cap and provisional flag; the poll hot path with zero queries on a cache hit; lobby token and
summary ETag; chat with keys and mute; history with cursor; `.qcg.json` export; fair-play lookup; maintenance job;
account deletion and erasure (SPEC §8.12); serializer DTOs exactly as SPEC §7.2.

**Tests**: move check order and error bodies; idempotent retry never rolls twice; conflict on stale ply and on a
concurrent `rev`; CSPRNG called only for rolled moves (mock the random source); chain values equal the engine's;
draw cool-down arithmetic; abort only while `ply < 2`; timeout outcomes including `timeout_draw` and first-move abort;
reminder bits, quiet-hours holding across time zones and the deadline exception; Elo (K switch at 10 rated games,
rounding, floor, both rows); pair cap boundary (3rd rated game rated, 4th unrated); invite policy each step (share
settings mocked) with identical errors; open-challenge visibility and group scope; fair-play window (`p ≥ 10`, 20
plies, mirror); serializer golden JSON for summary/live/full; export replays to `finalHash`; `removeUser` for both
modes.

**Acceptance (running Nextcloud)**
- `php occ migrations:migrate quantumchess` creates the four tables and seven + three + two + two indexes.
- `node tests/api/games.mjs` passes a scenario with bob and carol: invite (rated, `corr:3d`) → accept (colours, chain)
  → several moves including a rolled one (stored measurement with integer `u`) → retry with the same `clientId`
  (`replayed: true`) → stale ply (`409 conflict`) → poll unchanged (`changed: false`) and changed → draw offer, decline,
  cool-down (`409 draw_not_allowed`) → resign → both rating rows updated with K = 40 → rematch through the OCS route →
  open challenge joined concurrently by two users (one `409 already_taken`) → a non-participant gets `404`.
- A deadline moved into the past in the database is resolved by the next poll (`timeout`, `finished_at` = deadline)
  and by `php occ background-job:execute <id> --force-execute` for another game.
- Deleting a temporary user finishes their active game as `player_deleted`.

### 5.5 backend-integration

**Owned paths**: `lib/AppInfo/Application.php`, `lib/Service/NotificationService.php`, `StatsService.php`,
`PreferencesService.php`, `TrainerProgressService.php`, `DataDeletionService.php`, `lib/Notification/**`,
`lib/Dashboard/**`, `lib/Controller/PageController.php`, `StatsController.php`, `PreferencesController.php`,
`MeController.php`, `templates/main.php`; `tests/php/Unit/Integration/**`; `tests/api/integration.mjs`.

**Owned P0**: N2, N3, X3. **Contributes**: S1 (initial state), N4 (leaderboard endpoint), T7 (progress endpoint), M2/M3
(local statistics endpoint).

**Provides**: SPEC §6.4 (services), §7.4.6 (routes), §9 (notifications, dashboard), §13 (page, initial state, CSP),
application registration.
**Consumes**: backend-games (`GameService`, `GameSerializer`, `RatingService`, `InvitePolicy`, entities), backend-ai
(`SettingsService`, `AiSourceService::summary`), engine-php (`MoveDescriber`).

**Deliverables**: `NotificationService` with families, switches and after-commit use; `Notifier` for every subject of
SPEC §9.1 (rich subjects, messages, "last move in words", OCS actions, `AlreadyProcessedException` for obsolete
notifications, preloading), rendered in the recipient's language; the dashboard widget (items, overlay icons, empty
text, buttons, reload); stats, local stats and the leaderboard with modes, eligibility, visibility filtering, group
filter, pinned own row and 5-minute cache; preferences and trainer progress (size limits, server-side merge of SPEC
§14.8.4); *Delete my Quantum Chess data*; `PageController` (initial state keys of SPEC §13, CSP `worker-src 'self'`,
`/g/{id}` redirect); `Application::register`.

**Tests**: `Notifier::prepare` for every subject and both outcomes of each (English and German `IL10N` mocks), action
URLs and methods, unknown app and obsolete game; family replacement and `markSeen`; switches suppress creation;
`MoveDescriber` sentences for split, merge, Measure, captured, moved, missed and trapped king; widget item order and
texts; leaderboard filtering (off/opt-in/opt-out, minimum games, activity window, enumeration off → past opponents
only, group filter, ranks); local stats validation; preference and progress limits; progress merge is commutative and
idempotent (property test); data deletion calls every part; initial state keys and CSP.

**Acceptance (running Nextcloud)**
- After bob invites carol (via `tests/api/games.mjs` or the UI), carol's
  `GET /ocs/v2.php/apps/notifications/api/v2/notifications` contains the `invite` notification with Accept/Decline
  actions pointing to the OCS routes; POSTing the Accept action link starts the game; the `your_turn` notification is
  replaced on each move; opening the game clears it.
- `GET /ocs/v2.php/apps/dashboard/api/v2/widget-items?widgets[]=quantumchess` returns the expected items.
- The app page HTML contains the initial states `user`, `features`, `preferences`, `lobby`, `trainerProgress`,
  `appVersion`, and the CSP header contains `worker-src 'self'`.
- Leaderboard and stats endpoints answer for bob and carol; `DELETE /api/me/data` (session login with password
  confirmation) removes a test user's data.

### 5.6 backend-ai

**Owned paths**: `lib/Service/Ai/**`, `lib/Service/SettingsService.php`, `lib/Controller/AiController.php`,
`lib/Controller/SettingsController.php`, `lib/Settings/**`, `templates/settings/**`, `src/settings/**`,
`src/settings-admin.js`, `src/settings-personal.js`; `tests/php/Unit/Ai/**`; `tests/js/settings/**`;
`tests/api/ai.mjs`; `tests/e2e/backend-ai.spec.mjs`.

**Owned P0**: M3, N6, X1, X2. **Contributes**: T6 (`/api/ai/coach`), N7 (personal settings for invite policy and
block list).

**Provides**: SPEC §6.5 (`SettingsService`, `AiSourceService`, `LlmService`, `AiMaintenance`), §7.4.7 and §7.4.8
(routes), §10 (LLM integration), §11.1–§11.2 (settings keys), §12.2 (SSRF), the admin and personal settings pages
(§13).
**Consumes**: engine-php (`validateState`, `generateMoves`, `describeForLlm`, `moveNotation`, `pct`), backend-games
(`FairPlayService`, `ApiException`, `RatingService::setListed`, `GameService::diagnostics`), frontend-app (`api.js` in
the settings apps, `@nextcloud/password-confirmation`).

**Deliverables**: the three sources with availability rules and the default; OpenAI-compatible, Anthropic and
Nextcloud AI providers (TaskProcessing `core:text2text:chat` with `core:text2text` fallback, task ownership, deletion
after reading, latency tracking); presets; personas (P0 four, prompt blocks of GD §6.2); `PromptBuilder` (move prompt
of GD §6.4 with truncation, retry line and index mode; coach prompt of GD §5.5; rules summary; privacy of GD §8.5);
`AnswerParser`; `AiUsageService` (hourly limit, concurrency, daily cap, counters); `KeyStore` (ICrypto, sensitive,
never returned); `UrlGuard`; `AiController` (validation, fair-play refusal first, `202` tasks, cancel, notice
acknowledgement); `SettingsController` (personal, multiplayer, admin with secret and password confirmation, test
connection); `SettingsService` with every key, default and range of SPEC §11; the admin settings app (all groups of
GD §8.3 with status card and diagnostics) and the personal settings app (GD §8.2: online play, notifications, AI, my
data with export link and *Delete my data*).

**Tests**: golden prompts (move, retry, index mode, > 120 legal moves, coach, each language name); the rules summary
contains the key phrases of RULES.md; `AnswerParser` table (plain JSON, fenced, trailing text, `pick`, bad mood,
regex fallback, nothing); providers against a mocked `IClientService` (OpenAI body and `max_completion_tokens` retry,
OpenRouter headers, Anthropic headers, no temperature, effort retry, refusal and `max_tokens` mapping, error codes);
Nextcloud AI (task type choice, ownership, `pending`/`done`/`error`, deletion); `UrlGuard` matrix; keys never appear in
any response or log call; limits and concurrency; source availability matrix; settings validation; the fair-play
refusal is checked before any provider call; Vue settings components (Vitest).

**Acceptance (running Nextcloud)**
- The admin settings page (*Administration settings → Quantum Chess*) and the personal settings page render all
  sections without console errors (Playwright screenshots); saved values persist (`php occ config:app:get quantumchess
  <key>`); saving the shared key asks for the password and `php occ config:list quantumchess` does not show it.
- `GET /api/ai/providers` for bob reflects the instance (Nextcloud AI unavailable with a reason when no provider is
  installed).
- A personal provider pointing to `http://localhost:<port>/v1` is refused until the admin adds it to
  `local_allowlist`; with a mock OpenAI-compatible server started by `tests/api/ai.mjs`, `POST /api/ai/move` returns
  `done` with a parsed move, comment and mood, and `POST /api/ai/coach` returns an answer.
- `POST /api/ai/move` with a position from bob's active rated game (ply ≥ 10) returns `403 rated_game_in_progress`.

### 5.7 frontend-board

**Owned paths**: `src/components/board/**` (including `dev/BoardPlayground.vue` and `useBoardInput.js`),
`src/engine/ui/**`, `src/sound/**`, `src/styles/tokens.scss`, `src/styles/board-themes.scss`; `tests/js/board/**`,
`tests/js/engine-ui/**`; `tests/e2e/frontend-board.spec.mjs`.

**Owned P0**: G2, G3, G4, G5, G6, G7, G8, G11. **Contributes**: S2 (`MiniBoard`), G9 (`RollBar`, `NotationText`),
M4 (tabletop rendering), Q1 (board accessibility).

**Provides**: SPEC §3.3 (UI helpers), §14.6.1 (`QuantumBoard`, `useBoardInput`, `BoardControls`,
`PossibilitiesChip`, the `Animator` methods), §14.6.2 (building blocks), sound and haptics (§14.3.2), design tokens.
**Consumes**: engine-js; `preferences` from frontend-app.

**Deliverables**: all of GD §3.2–§3.6 and §3.10 for the board: layers, sprite (cburnett and generated Letters),
coordinates, square states, ghost rendering (opacity, ring, badge with percent/fraction, glow), identity dots, part
threads, link glyphs and threads, what-if view (all entry gestures and keys), budget pips with popover, possibilities
chip/panel and "view one possibility", king ring and `KingDangerChip`, move switcher and every target marker, click /
drag (touch loupe, spring-back with `whyIllegal` tooltip) / keyboard (roving tabindex, keys of GD §3.5.4 that belong to
the board) / type-a-move, split, merge and Measure flows, promotion picker, odds card, confirmation and the king safety
net, the full roll timeline (suspense, settle, collapse, reveal arrow, result chip with GD §3.6.2 copy and rarity
lines, fast-forward, reduced motion, online `startRoll`), game-end effects on the board (king tip-over, trap arrow),
six board themes with the `nextcloud` primary-colour theme and automatic `contrast`, sound synthesis and haptics,
the live region and **D** description, and the dev playground at `/dev/board`.

**Tests**: UI helpers on ER worked examples (`explainOutcome` on W3/W7/W9, `diffViews` on W4 Measure, `splitTargets`
reasons on W5/W13, `resultSentence` for every row of GD §3.6.2 from both points of view); `useBoardInput` (mode
availability and tooltips, click/split/merge/Measure/promotion flows, type-a-move parsing, safety net thresholds:
asks at risk ≥ 10 % only when a move ≥ 10 points safer exists, confirm modes); component tests (marker per resolution,
badge formats, aria labels "f3, white knight, 50 percent, also on h3", roving focus, DOM budget ≤ 64 pieces); the
contrast palette test (every theme × marker ≥ 3:1, badges ≥ 7:1); `play()` resolves immediately at speed Off.

**Acceptance**: in the running Nextcloud with a development build (`npm run dev`), `#/dev/board` shows ghosts, links,
what-if, possibilities, every marker type and a replayed roll in all six themes, light and dark (Playwright screenshots
at 360 × 740 and 1440 × 900); once frontend-app's game screen exists, a computer game shows the same behaviour with no
console errors; keyboard-only split, merge, Measure and a rolled capture work.

### 5.8 frontend-app

**Owned paths**: `src/main.js`, `src/App.vue`, `src/router.js`, `src/components/app/**`, `src/components/game/**`,
`src/components/settings/**`, `src/components/ai/**`, `src/components/home/**`, `src/composables/**`,
`src/services/**`, `src/personas/**`, `src/rules/**`, `src/styles/app.scss`, `src/views/HomeView.vue`,
`src/views/LocalGameView.vue`, `src/views/RulesView.vue`; `tests/js/app/**`; `tests/e2e/frontend-app.spec.mjs`.

**Owned P0**: S1, S2, G1, G9, G10, M4. **Contributes**: R2 (roll memo), M2 (computer game flow), M3
(`useLlmOpponent`, persona catalogue with four personas × three drawings), N3 (tab title, navigation counters), N5
(PlayerCard admin chip), N6 (`fairPlayLock`), X1 (in-app settings dialog), X2 (`AiNoticeDialog`), G8 (`RollLog`
trigger and preview wiring), N8 (local export and import).

**Provides**: SPEC §14.1 (entry and router), §14.2 (shell), §14.3 (`api.js`, `preferences.js`, `localGames.js`,
`aiTasks.js`, `format.js`, `ids.js`, `storage.js`), §14.4.1–§14.4.4 and §14.4.8 (controller interface, handshake,
`useLocalGame`, `useLlmOpponent`, composables), §14.6.3 (game components, `GameScreen`), §14.7 (local record), §14.10
(rules content, personas).
**Consumes**: engine-js, frontend-board, ai-js (`bestMove`, `candidates`), frontend-online (`useLobby`,
`LobbyOnlineSections`, `RecentGames`), trainer (`TrainerCard`, `AchievementToasts`, `reportGameEvent`), coach-review
(`EvalBar`, `CoachPanel`, `useCoach`), the backend routes.

**Deliverables**: app shell and navigation (GD §2.2, collapse rule, swipe guard), home with the four play tiles,
trainer card, lobby sections and empty state (first paint from initial state), New game dialog for all four modes with
remembered values, rated check and user search, in-app settings dialog (GD §8.1 with live preview), the game screen
(GD §3.1 layouts for phone, landscape phone, tablet, desktop, wide; integer board size; banners; player cards with
budget pips, captured tray, turn status, AI bubble, admin chip; controls row; panel tabs; move list, move strip, roll
log with roll bars and details; game-over dialog for every reason with variants and confetti; result bar), local game
flows (computer with display delay, AI opponent per GD §6.4 including Nextcloud AI polling, *Let the engine move*,
index mode and fallback, pass & play with names, auto-flip and tabletop, undo with the roll memo and "assisted",
resignation, local statistics), `.qcg.json` local export/import, the rules page with live mini-boards, the persona
catalogue and avatars, the AI privacy notice.

**Tests**: every `api.js` function (URL, verb, body; `ApiError` mapping incl. `Retry-After`); preferences defaults,
merge and debounce; roll memo (persisted before apply, undo gives the same result, promotions share one `u`, a later
ply is a fresh roll); local record pruning and import/export round trip; `useLocalGame` (computer reply with a mocked
AI client, pass & play turn handling, statistics only for unassisted games); `useLlmOpponent` (retry with feedback,
Balanced rejects non-✓ moves, fallback marking, switch to index mode after 3 fallbacks in 5 moves, Nextcloud AI timing
with fake timers); `useBoardSize` formula; `GameScreen` with a fake controller (tabs, fair-play lock hides coach and
eval, history and other-result previews); game-over copy for every reason.

**Acceptance (running Nextcloud, Playwright at 360 × 740, 768 × 1024 and 1440 × 900)**: the lobby paints without an API
request; the New game dialog creates each mode; a level-1 computer game plays several moves including a split and a
rolled move with the full roll animation; undo marks the game assisted and replays identically; pass & play with
tabletop mode; an AI game against a mock provider (joint with backend-ai); the rules page renders its mini-boards; a
settings change applies live and survives a reload; no console errors; screenshots attached to the report.

### 5.9 frontend-online

**Owned paths**: `src/online/**`, `src/components/online/**`, `src/components/lobby/**`, `src/components/stats/**`,
`src/views/OnlineGameView.vue`, `src/views/HistoryView.vue`, `src/views/StatsView.vue`; `tests/js/online/**`;
`tests/e2e/frontend-online.spec.mjs`.

**Owned P0**: N1, N5, N8. **Contributes**: M1 (online UI flows), S1 (`useLobby`, lobby sections), N3 (counts), N4
(stats and leaderboard views), T7 (Stats page hosts `TrophyCabinet`).

**Provides**: SPEC §14.4.5 (`useOnlineGame`, `usePoller`, chain check, BroadcastChannel), §14.4.6 (`useLobby`), §14.6.4
(chat, lobby, stats components), the three views.
**Consumes**: frontend-app (`api.js`, `GameScreen`, controller typedef, `format.js`, `ids.js`), frontend-board, engine-js
(replay, chain functions), trainer (`TrophyCabinet`, `reportGameEvent`), backend-games routes.

**Deliverables**: the online game view for every status (invitation panel, waiting state, join screen, live game,
finished game with result bar and rematch, declined/cancelled/expired states, "This challenge is not available");
optimistic certain/quantum moves and server-driven rolls; retries with the same `clientId`, sticky failure banner;
conflict and illegal-move handling; polling with the GD §7.10 intervals, visibility and network handling, backoff and
banners; multi-tab sync; the chain check with the altered-history banner and the deleted-player case; draw offer
banner and actions; resign/abort with confirmation; chat (plain text, quick phrases, emoji picker, mute with
collapsed messages, system lines, unread count); lobby sections and store (ETag summary polling, counts for navigation
and tab title); history with filters, paging, review and export links; stats page (record, rating graph,
leaderboard with the one-time listing question and group filter, trophy cabinet).

**Tests**: `usePoller` intervals, backoff, `Retry-After` and visibility with fake timers; `useOnlineGame` (optimistic
reconciliation with byte comparison, rolled moves via `startRoll`, retries keep the `clientId`, conflict adoption,
polled moves replayed with the recorded `u`, chain mismatch → altered, deleted player → no alarm); BroadcastChannel
adoption; lobby ETag handling; chat renders text only (an HTML payload stays text); history paging.

**Acceptance (running Nextcloud, two browser contexts bob and carol)**: invitation appears in carol's lobby and
navigation → accept → both play, including a rolled capture that the opponent sees within the polling interval with
the full roll animation; draw offer banner and decline; chat both ways and mute; resign → game-over dialog with rating
change on both sides; rematch; open challenge and join; editing a stored move's measurement in the database makes the
altered-history banner appear; history filters and export download; stats page with leaderboard.

### 5.10 trainer

**Owned paths**: `src/trainer/**` (including `lessons/`, `puzzles/`, `puzzles.json`, `i18n.js`, `events.js`),
`src/components/trainer/**`, `src/views/TrainerHomeView.vue`, `LessonView.vue`, `PuzzleView.vue`, `LabView.vue`,
`tools/trainer-validate.mjs`, `tools/puzzles-build.mjs`; `tests/js/trainer/**`; `tests/e2e/trainer.spec.mjs`.

**Owned P0**: T1, T2, T3, T7.

**Provides**: SPEC §14.8 (lesson and puzzle data, `puzzles.json`, predicates, progress document and merge,
achievements, `reportGameEvent`), `TrainerCard`, `TrophyCabinet`, `AchievementToasts`.
**Consumes**: engine-js (`setupPosition`, `applyMove` with `outcome`, views), ai-js (`solve`, level 3/4 replies,
Wobbles for L11), frontend-board (`QuantumBoard`, `useBoardInput`, `BoardControls`, `MiniBoard`, `RollBar`,
`OutcomeBar`), frontend-app (`api.js` progress, `preferences`, `PlayerCard`), coach-review (`useCoach`/`CoachPanel` for
puzzle hints and the L11 Beginner coach), the progress endpoint.

**Deliverables**: lessons L1–L11 exactly as GD §5.1 (setups, prompts, success predicates, hint tiers, scripted/engine
replies, lesson rolls with "Show the other result", quizzes, watch steps, stars, "Try it in the Lab"); puzzles P01–P11
exactly as GD §5.2.2 (real rolls per attempt, grading from `puzzles.json`, refutations, trap texts, stars, "Replay the
other result"); the Lab (setup from FEN + prelude, undo, what-if, possibilities); the trainer home (continue card,
lesson path with stars, puzzle grid, Lab, latest achievements); the P0 achievements of GD §5.6 with unlock toast and
trophy cabinet; progress sync with merge; the build-time validator and `puzzles.json` builder.

**Tests**: the validator in CI (`npm run trainer:validate`), predicates, the lesson step machine (forced outcome order,
other-result replay, stars from hints and retries), puzzle grading (accepted sets and trap values), progress merge,
each P0 achievement from its event, `reportGameEvent` lazy loading.

**Acceptance**: `npm run trainer:validate` and `npm run puzzles:build` pass with no diff; in the running Nextcloud,
Playwright completes L1–L3 and P01 by clicking, stars and achievements persist across a reload and another browser
(server progress), the trainer card on Home shows the next lesson, and the trophy cabinet appears on the Stats page.

### 5.11 coach-review

**Owned paths**: `src/coach/**`, `src/components/coach/**`, `src/components/review/**`, `src/views/ReviewView.vue`;
`tests/js/coach/**`; `tests/e2e/coach-review.spec.mjs`.

**Owned P0**: T4, T5, T6. **Contributes**: N5 (`VerifyPanel`), N6 (locked coach panel).

**Provides**: SPEC §14.4.7 (`useCoach`), §14.6.5 (`EvalBar`, `CoachPanel`, `CoachChat`), §14.6.6 (review).
**Consumes**: ai-js (`analyze`, `evaluateMove`, `analyzeGame`), engine-js, frontend-board, frontend-app (`api.js`
`requestCoach`, `aiTasks.js`, `useAiSources`/`AiNoticeDialog`, `MoveList`, `RollLog`, `NotationText` via board),
trainer (`reportGameEvent`), backend-ai (`/api/ai/coach`).

**Deliverables**: coach levels (Beginner/Standard/Off with the defaults of SPEC §11.3); eval bar (percent or pawns,
fog band, "♚ in N", luck jumps, phone variant); four hint tiers with deterministic themes; threat warnings and
opportunities with linked-piece notes and "free king shot"; move-quality badges (GD §5.3.4 incl. brilliancy, only move,
caps, Lucky/Unlucky tags); the AI coach chat (suggested questions, move chips validated with `findMove`, safe Markdown,
2000-character cap, failure fallback text, privacy notice, fair-play refusal message); the review (analysis with
progress and cache, evaluation graph with roll segments and quality dots, accuracy, luck ledger, quantum style, key
moments with Show and Explain (AI), Verify for online games with `rollDisplay` lines and chain status).

**Tests**: quality labels for every threshold and cap; accuracy formula; the luck ledger is zero-sum between the
players; themes on GD positions (P03 `converge`, P05 `shootThrough`, L4.2 `probe`, P09 `defendKing`); threat `pCap` on
W2/W3; hint tiers; move chips (illegal codes stay plain text); `EvalBar` fog band rendering; Verify detects a tampered
`u` and accepts a clean game.

**Acceptance (running Nextcloud)**: a computer game with the Beginner coach shows the eval bar with fog band, a threat
badge, hint tiers and quality badges; in an active online game the coach tab shows "Available after the game." and the
eval bar is hidden; the review of a finished local game shows graph, accuracy, luck ledger and key moments; the review
of a finished online game passes Verify; with a mock provider (joint with backend-ai) the AI coach answers with move
chips.

### 5.12 packaging

**Owned paths**: `package.json`, `package-lock.json`, `composer.json`, `composer.lock`, `vite.config.js`,
`vitest.config.js`, `eslint.config.js`, `psalm.xml`, `.php-cs-fixer.dist.php`, `.gitignore`, `.npmrc`,
`tests/php/bootstrap.php`, `tests/php/phpunit.xml`, `.github/**`, `README.md`, `CHANGELOG.md`, `RELEASING.md`,
`l10n/**`, `.l10nignore`, `translationfiles/**`, `img/app.svg`, `img/app-dark.svg`, `img/overlay-king-w.svg`,
`img/overlay-king-b.svg`, `screenshots/**`, `tools/**` except the two trainer tools, `tests/e2e/**` except the module
spec files, `tests/load/**`. After this plan, change requests for `appinfo/info.xml` and `appinfo/routes.php` go to
`.integration-notes/packaging.md` and packaging applies them.

**Owned P0**: Q1, Q2, Q3. **Contributes**: X2 (README data inventory), N3 (overlay icons).

**Deliverables**
- Day 0: dependencies and scripts (§3); e2e scaffolding (`tests/e2e/playwright.config.mjs` reading `QC_BASE_URL` and
  `QC_CHROMIUM`, a login helper, a console-error collector, a two-user helper); `tools/check-bundle-size.mjs`.
- CI workflows of SPEC §15.3 (lint incl. SPDX header check, JS tests, build and size, trainer validation, fixture
  drift, PHP matrix 8.1–8.4, Psalm, e2e against Nextcloud 32 and 35) and the tag-triggered release workflow (build,
  package without sources and dev files, sign, upload to the App Store).
- App icons (`app.svg` white, `app-dark.svg`: a knight with a dashed ghost twin, no text) and the dashboard overlay
  icons.
- Accessibility gate: axe checks on the game screen, the lobby, a lesson and the settings dialog; the keyboard-only
  e2e game (split, merge, Measure, rolled capture).
- Translations: extraction of every `t`/`n`/`IL10N` string, hand translations to Dutch and German (`l10n/nl.*`,
  `l10n/de.*`) using one term per glossary entry of RULES.md (for example NL Geslagen/Verzet/Gemist, DE
  Geschlagen/Gezogen/Verfehlt, as in `info.xml`), `.l10nignore` excluding `js/`.
- Performance gates: bundle size, benchmark job, the k6 poll script (`tests/load/poll.k6.js`, 500 watchers every
  2 s, p95 ≤ 5 ms PHP time).
- `npm run screenshots`: a seeded demo (`tests/e2e/seed-demo.mjs` via the API) and the seven screenshots named in
  `info.xml` (`01-game-ghosts` + `-small`, `02-roll`, `03-lobby-dashboard`, `04-trainer`, `05-ai-opponent`, `06-dark`,
  `07-phone`).
- README (features, installation, admin guide incl. background jobs in Cron mode, TaskProcessing worker advice, AI
  providers, privacy data inventory of GD §8.5, honest note that server admins could decrypt keys), CHANGELOG 1.0.0,
  RELEASING.

**Acceptance**: all gates of SPEC §15.1 green in CI and locally; `npm run size` ≤ 250 KB gzip for the main entry; axe
reports no serious violations; the NL and DE translations cover every string; `npm run screenshots` produces the seven
files from the running Nextcloud; a release dry run produces a signed tarball with a dummy key; the GD §8.6 release
gate checklist and the GD §10 polish checklist are walked through with evidence.

---

## 6. Final integration acceptance (lead)

Run on the development Nextcloud after all modules are accepted, with evidence per P0 row of §2:

1. **Fresh install path**: disable/enable the app, `occ migrations:migrate`, background job registered, admin and
   personal settings pages load.
2. **Learn**: a new user finishes L1–L5 (about 10 minutes), solves P01, earns First Steps; the trainer card updates.
3. **Local play**: a computer game at level 1 and level 5, an AI-opponent game (mock provider and, if available,
   Nextcloud AI), pass & play in tabletop mode; undo never re-rolls; results appear in local statistics only when
   unassisted.
4. **Online play**: bob and carol play a rated correspondence game with rolls, links, a converging capture and a draw
   offer; notifications with actions work (web; mobile/desktop through the OCS routes); the dashboard widget lists the
   game; ratings change with K = 40; rematch; a timeout and an abort; the chain check and Verify pass; tampering is
   detected.
5. **Fair play**: coach and analysis hidden in the active online game; AI requests for its positions refused.
6. **Privacy and security**: keys never returned, local URLs refused without the allow-list, *Delete my data* and
   account deletion behave as SPEC §8.12.
7. **Quality**: phone, tablet and desktop layouts; light, dark and high contrast; keyboard-only game; EN/NL/DE; no
   console errors; performance budgets.
