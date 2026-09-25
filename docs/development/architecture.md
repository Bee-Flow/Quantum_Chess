<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Architecture

This document describes how Quantum Chess is built: how the code is organised, how the parts talk to each other, and
the conventions that keep it consistent. It is written for contributors. For the game rules, read
[`docs/rules.md`](../rules.md) (for players) and [`docs/engine-rules.md`](../engine-rules.md) (the normative
specification of the rules engine). The HTTP API is documented in [`api.md`](api.md).

## Contents

1. [Overview](#1-overview)
2. [Repository layout](#2-repository-layout)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Rules engine and computer player](#5-rules-engine-and-computer-player)
6. [Data flow](#6-data-flow)
7. [Testing strategy](#7-testing-strategy)
8. [Conventions](#8-conventions)
9. [Comment policy](#9-comment-policy)
10. [Stable contracts](#10-stable-contracts)

## 1. Overview

Quantum Chess is a Nextcloud app. It has four main parts:

| Part | Where | Runs in | Responsibility |
|---|---|---|---|
| Web app | `src/` | Browser | Vue 3 single-page app: board, local games, online games, trainer, coach, review, statistics, settings |
| Backend | `lib/` | Nextcloud server | HTTP API, online games, ratings, notifications, dashboard widget, settings, LLM integration |
| Rules engine | `src/engine/`, `lib/Engine/` | Browser and server | The game rules, implemented twice (JavaScript and PHP) with byte-identical results |
| Computer player | `src/ai/` | Browser (Web Worker) | The built-in opponent, the coach's analysis, the post-game review and the puzzle solver |

Some principles shape the whole design:

- **The server is authoritative for online games.** A client proposes a move. The server checks that the move is
  legal, draws any random roll with a CSPRNG, applies the move with the PHP engine, and records it in a hash chain.
  Clients replay every stored move with the JavaScript engine and check the chain, so if a move they have already
  seen is changed later, they notice.
- **Two engines, one set of rules.** Both engines implement [`docs/engine-rules.md`](../engine-rules.md). Shared
  fixtures prove that they produce the same bytes (section 5.2).
- **Heavy computation stays in the browser.** Search, analysis and review run in a Web Worker. The server never
  runs the computer player.
- **Nextcloud-native.** The app uses the Nextcloud app framework (OCP APIs only), `@nextcloud/vue` components,
  Nextcloud notifications, the dashboard, user and app configuration, and Nextcloud Assistant (TaskProcessing) for
  LLM features.
- **No runtime Composer dependencies.** Nextcloud autoloads `lib/` from the `<namespace>` in `appinfo/info.xml`.
  `vendor/` holds development tools only and is never shipped.

### Vocabulary

Three different things could be called "the engine" or "the AI". This documentation and the code comments keep
them apart with these terms:

| Term | Means | Code |
|---|---|---|
| **rules engine** | The game rules: move generation, applying moves, game end | `src/engine/`, `lib/Engine/` |
| **computer player** | The built-in opponent and its search, evaluation and analysis. The UI calls it "Computer". | `src/ai/` |
| **LLM opponent** | An opponent with a personality whose moves are chosen by a large language model. The UI calls it "AI opponent". | `src/llm/`, `lib/Service/Ai/`, `/api/ai/*` |

The backend has no computer player. In `lib/`, `Ai` always means the LLM integration.

## 2. Repository layout

```text
appinfo/            info.xml (app metadata) and routes.php (HTTP routes)
docs/               rules.md, engine-rules.md, development/ (this document, api.md); RELEASING.md lives in the root
img/                app icons, dashboard icons, piece set (cburnett, with its own licence file)
l10n/               generated translations (nl, de, de_DE, fr); never edited by hand
lib/                PHP backend, PSR-4 namespace OCA\QuantumChess
screenshots/        App Store screenshots (URLs referenced from info.xml)
src/                web app, JavaScript rules engine, computer player
templates/          PHP templates of the app page and the two settings pages
tests/              js/ (Vitest), php/ (PHPUnit), e2e/ (Playwright), fixtures/ (engine parity fixtures)
tools/              development tools: l10n.mjs (string extraction and conversion), check-references.mjs (the
                    comment and link check), set-version.mjs (the release version, see RELEASING.md),
                    screenshots/ (the App Store screenshots)
translationfiles/   gettext template and .po files, translator README and glossary
```

The build writes `js/` (Vite bundles) and `assets/` (the Web Worker). Both are git-ignored and shipped only in the App
Store package (`make appstore`). Root files: `README.md` (players and administrators), `CONTRIBUTING.md` (development
workflow), `CHANGELOG.md`, `LICENSE`, and the build and lint configuration.

## 3. Backend

### 3.1 Layers

The backend follows the usual Nextcloud app layering. Dependencies point downwards only:

```text
Controller  (HTTP: parameters, attributes, JSON responses)
    │
Service     (use cases, domain rules, transactions)          Notification, Dashboard, BackgroundJob, Listener
    │                                                         call into services as well
Db          (entities and QBMapper mappers)     Engine (rules engine facade)
```

- **Controllers** are thin. They read the request, call one service method, and turn the result into JSON with
  `GameSerializer` or a small array. Security attributes (`#[NoAdminRequired]`, `#[UserRateLimit]`,
  `#[PasswordConfirmationRequired]`, …) live on the controller actions.
- **Services** hold the logic. They are autowired by the Nextcloud DI container, need no registration, and receive
  every dependency through the constructor.
- **Db** holds entities (`Game`, `Move`, `ChatMessage`, `Rating`) and their mappers. Small domain questions whose
  answer depends only on the entity live on the entity, for example `Game::hasEnded()` and
  `Game::drawAvailableAtPly()`.
- **Engine** (`lib/Engine/Engine.php`) is the only entry point into the PHP rules engine. Other backend code never
  uses `OCA\QuantumChess\Engine\Internal\*`.

### 3.2 Namespaces

| Namespace | Contents |
|---|---|
| `AppInfo` | `Application`: registers the notifier, the dashboard widget and the user-deletion listener |
| `BackgroundJob` | `GameMaintenanceJob` (every 15 minutes): expires invitations, times out and abandons games, purges old chat and finished games, deletes finished LLM tasks and old usage counters |
| `Controller` | `ApiController` (abstract base) and one controller per route group: `Page`, `Game`, `OcsGame`, `Stats`, `Preferences`, `Ai`, `Settings` |
| `Dashboard` | `GamesWidget`: the "Quantum Chess" dashboard widget |
| `Db` | Entities and mappers for the tables `qchess_games`, `qchess_moves`, `qchess_chat`, `qchess_ratings` |
| `Engine` | The PHP rules engine: the `Engine` facade, its exceptions, and `Internal\*` (section 5) |
| `Exception` | `ApiException` (the error type of every API response), `ApiError` (the enum of public error codes), `GameConflictException` |
| `Listener` | `UserDeletedListener`: ends or deletes a removed user's games and rating |
| `Migration` | The database schema |
| `Notification` | `Notifier` (renders notifications and their actions), `NotificationService` (sends and removes them), `MoveDescriber` |
| `Service` | `InitialStateService`, which provides the initial state of the app page |
| `Service\Game` | Online games: queries (`GameQueryService`), invitations, open challenges and rematches (`InvitationService`), moves, draws, resignations and aborts (`GameplayService`), chat (`ChatService`), maintenance and account removal (`GameMaintenanceService`), plus the shared building blocks `GameRepository`, `GameTransaction`, `GameLifecycle`, `GameClock` (with the `DAY` and `HOUR` constants), `GameErrors`, `RandomSource`, `InvitePolicy` and the JSON `GameSerializer` |
| `Service\Player` | Ratings, statistics and the leaderboard, in-app preferences, trainer progress, and the JSON documents stored per user |
| `Service\Settings` | Admin settings (`AppSettings`, with the `AdminSetting` enum as the typed registry of every key), per-user multiplayer settings, admin status and diagnostics |
| `Service\Ai` | LLM integration: `LlmService` (move and coach requests), source availability and usage limits, `KeyStore` (encrypted API keys), `ConnectionTester`, and the subnamespaces `Provider\*` (OpenAI-compatible, Anthropic and Nextcloud Assistant providers, `ProviderFactory`, `UrlGuard`), `Prompt\*` (prompt building, personas, answer parsing) and `Request\*` (request validation) |
| `Settings` | The admin and personal settings pages and their section (registered in info.xml) |

### 3.3 Requests and errors

Every JSON controller extends `ApiController`. An action wraps its body in `respond()`, which:

- returns the result with the given status;
- turns an `ApiException` into `{"error": <code>, "message": <translated text>, ...extra}` with the exception's HTTP
  status, plus a `Retry-After` header when the exception sets one;
- logs any other `Throwable` and answers `500 {"error": "internal"}`.

Error codes are part of the public API. They are listed in the `ApiError` enum and in [`api.md`](api.md), and the
frontend dispatches on them. Services throw `ApiException` through its named constructors (`invalidArgument()`,
`notFound()`, `invalidStatus()`, …), so a code is never a free-form string. The errors about an online game that is
missing or not in a suitable state (`not_found`, `invalid_status`, `game_over`, `conflict`) come from `GameErrors`,
so the same situation always has the same translated message. The OCS controller, which serves notification
actions, uses Nextcloud's OCS exceptions instead.

### 3.4 Persistence and concurrency

- **Online games** are rows in `qchess_games`, with their moves in `qchess_moves` and their chat in `qchess_chat`.
  A game row carries a revision counter, `rev`. `GameRepository::save()` updates a row only when `rev` still has the
  value that was read, and throws `GameConflictException` (HTTP 409, `conflict`) otherwise. Clients resolve a
  conflict by polling and retrying.
- **Transactions.** `GameTransaction` runs a unit of work in one database transaction and collects after-commit
  callbacks, typically notifications. The callbacks run only after a successful commit. A failing callback is logged
  as a warning and never undoes the move. Transactions do not nest.
- **Idempotent moves.** The client sends a `clientId` with each move. Resending the same `clientId` returns the
  stored move instead of playing it twice. A unique index on `(game, ply)` makes concurrent moves for the same ply
  fail cleanly.
- **Admin settings** live in `IAppConfig`. `AdminSetting` defines the type, default, range and lazy/sensitive flags
  of every key. **Per-user data** (preferences, trainer progress, multiplayer switches, notice acknowledgements)
  lives in `IUserConfig`. Settings that hold JSON documents go through `UserDocumentStore`, which enforces a size
  limit. **API keys** are encrypted with `ICrypto` and stored as sensitive values. They are never sent to the browser.

### 3.5 LLM integration

The app can reach three kinds of LLM source: Nextcloud Assistant (TaskProcessing), a provider configured by the
administrator ("shared"), and a user's own API key ("personal"). `AiSourceService` decides which sources a user may
use. `ProviderFactory` builds a provider for a source: `OpenAiProvider` (any OpenAI-compatible API),
`AnthropicProvider` or `NextcloudAiProvider`. Direct providers make outgoing requests only through `UrlGuard`, which
blocks private and local addresses unless the administrator allows them. Nextcloud Assistant tasks run
asynchronously. The API answers `pending` with a task id, and the client polls `/api/ai/task/{id}`. Finished tasks
are deleted as soon as they have been read, so no prompts are kept.

Prompts describe the position with `Engine::describeForLlm()` and offer the model a list of legal candidate moves.
The server validates the model's answer but never retries it. The client may retry once, sending the reason the
answer was rejected.

## 4. Frontend

### 4.1 Entry points and shell

Vite (`@nextcloud/vite-config`) builds three entries: `main` (the app page), `settings-admin` and
`settings-personal`. They become `js/quantumchess-main.mjs`, `js/quantumchess-settings-admin.mjs` and
`js/quantumchess-settings-personal.mjs`. The computer player's Web Worker is a separate module in `assets/`.

`src/main.js` mounts `App.vue`. `App.vue` is the shell: navigation, the routed view, the "New game" and settings
dialogs, the LLM privacy notice and the piece sprite, which is mounted once. `src/router.js` uses hash history
(`/apps/quantumchess/#/game/42`). Every route except Home loads its view lazily. The server fills the initial state
(`user`, `features`, `preferences`, `lobby`, `trainerProgress`, `appVersion`), so the first screen renders without
an API request.

### 4.2 Folder structure

The frontend is organised by feature. Every feature folder has the same shape:

```text
src/<feature>/
  components/     Vue single-file components of the feature
  composables/    use*() functions with reactive state; a large one is assembled from smaller use*() parts
  *.js            pure modules: logic without Vue reactivity, easy to unit-test
```

| Folder | Contents |
|---|---|
| `main.js`, `App.vue`, `router.js` | Entry point, shell, routes |
| `settings-admin.js`, `settings-personal.js` | Entry points of the Nextcloud settings pages |
| `views/` | Route components only: thin, they wire features together |
| `app/` | Shell components: navigation, the New game dialog, the in-app settings dialog |
| `board/` | The quantum board and everything around it: rendering layers, input (pointer, keyboard, move modes, safety net), animation, board preferences and themes, piece sprites, mini and standalone boards |
| `game/` | The game screen shared by local and online games, the `GameController` contract, local games (`useLocalGame`, persistence, the opponent's turn), result texts |
| `online/` | Online games: the host component, invitations, chat, the lobby, polling, replay and hash-chain verification, optimistic move sending |
| `coach/` | In-game coach: evaluation bar, move quality, hints, threats, coach chat |
| `review/` | Post-game review: key moments, the evaluation graph |
| `trainer/` | Lessons, puzzles, the lesson and puzzle runners, progress, and `report.js`, through which other features report game events |
| `llm/` | LLM opponents: personas, LLM source selection, the move protocol, the privacy notice |
| `variantplay/` | Chess variant games on this device: the variant board, the move modes, saving and replaying games |
| `home/`, `rules/`, `stats/` | Home screen tiles, the in-app rules page, statistics and the leaderboard |
| `settings/` | The Nextcloud admin and personal settings pages (not the in-app settings dialog, which lives in `app/`), and their messages |
| `services/` | Infrastructure shared by all features: `api.js` (one function per HTTP route), `initialState.js`, `storage.js` (`localStorage` that never throws, scoped per user), `preferences.js`, `format.js` (generic number and date formatting), `async.js` (abortable waits), `sound.js`, `ids.js` |
| `composables/` | Composables shared by several features (`useMediaQuery`, `useBusyAction`, `useResizeMeasure`) |
| `styles/` | Design tokens (`tokens.scss`), global app styles, board themes |
| `engine/` | JavaScript rules engine (section 5) |
| `ai/` | Computer player (section 5) |
| `variants/` | The chess variants: their quantum layer, rules modules and computer player (section 5.6) |

### 4.3 Dependency rules

Layers, from top to bottom. A module may import from its own layer and the layers below it, never from a layer
above:

1. `App.vue`, `router.js`, `views/`, `app/`
2. Feature folders: `home`, `rules`, `stats`, `trainer`, `review`, `online`, `game`, `coach`, `llm`, `variantplay`
3. `board/`
4. `services/`, `composables/`, `styles/`
5. `engine/`, `ai/` and `variants/`

Features may use each other where one composes the other, as long as there are no cycles. For example, the online
host renders the game screen, the local game host embeds the coach and the LLM chat, the review reuses the coach's
quality badges, and local games report finished games to the trainer. `board/` and the shared layers never import
from a feature.

Outside the rules engine and the computer player, code imports those packages only through their entry points:

- `engine/index.js`: the rules engine API (mirrored by `lib/Engine/Engine.php`);
- `engine/ui/index.js`: presentation helpers built on the rules (section 5.4);
- `ai/client.js`: the promise API of the computer player, which runs in the Web Worker;
- `ai/levels.js`: the level table (names, strengths), which is cheap to import on the main thread;
- `variants/index.js`: the chess variants (catalogue, loader, quantum layer and their computer player).

ESLint enforces these entry points with `no-restricted-imports`.

### 4.4 The GameController contract

Local and online games share one game screen (`game/components/GameScreen.vue`). The screen does not know where a
game comes from. It talks to a **GameController**, an object of refs, computed values and actions that is
documented as a typedef in `game/gameController.js`. Two composables produce it:

- `useLocalGame` (`game/composables/`) for games against the computer player, against an LLM opponent, and pass &
  play;
- `useOnlineGame` (`online/composables/`) for online games.

Each producer documents what it adds for its host as a typedef (`LocalGameController`, `OnlineGameController`).

The controller exposes the displayed state, the legal moves, the move list, the players, the result, a pending move,
capability flags (`can.undo`, `can.resign`, `can.offerDraw`, `can.chat`, …) and actions (`submitMove`, `resign`, …).
New game types plug in by producing a GameController. They need no changes to the game screen.

### 4.5 State

- **Module-level stores.** A few singletons hold state that several screens share: the lobby
  (`online/composables/useLobby.js`), the preferences (`services/preferences.js`) and the LLM sources
  (`llm/composables/useAiSources.js`). Each store is created lazily and can be recreated in tests through a
  `create*()` factory that accepts injected dependencies. The app uses no global state library.
- **Preferences** are one JSON document per user. It is loaded from the initial state, merged over
  `PREFERENCE_DEFAULTS`, and saved with a debounce through `PUT /api/settings/preferences`. The board reads them
  through `board/boardPreferences.js`, which tests can override.
- **Browser storage.** Local games, trainer progress and the last verified hash chain of each online game are kept
  in `localStorage` through `services/storage.js`. Keys are versioned (`quantumchess.localGames.v1`) and scoped to the
  logged-in user.

### 4.6 Styling

- Components use `<style scoped lang="scss">`. Global styles are limited to `styles/`.
- Class names follow BEM with the `qc-` prefix (`qc-board__square--selected`).
- Colours, spacing and radii come from Nextcloud's CSS variables (`--color-main-text`, `--default-grid-baseline`, …)
  or from the app's own `--qc-*` tokens in `styles/tokens.scss`. Components contain no literal colours, except inside
  the board themes and the illustrations (the persona avatars, the confetti and the home illustration). Light, dark
  and high-contrast themes follow Nextcloud's theming automatically.
- `.qc-scope` provides the tokens to content that Nextcloud teleports out of the app container, such as dialogs.
- Use Nextcloud's `hidden-visually` class for text meant only for screen readers.

## 5. Rules engine and computer player

### 5.1 The rules engine

The rules engine is **pure and synchronous**. It has no DOM, no network, no clock and no `Math.random`. A game state
is a plain JSON object and is treated as immutable. Derived data, such as the analysis of the possible worlds, is
cached per state object. All probabilities are integer weights that sum to `T = 2^24`, so both languages compute
exactly the same numbers without floating-point rounding. Randomness comes in from outside as an integer roll `u`.

The public API is `src/engine/index.js` in JavaScript and `lib/Engine/Engine.php` in PHP. Its main parts are:

- **state:** `initialState`, `parseState`, `serializeState`, `validateState`, `positionHash`, `gameResult`;
- **moves:** `generateMoves`, `findMove`, `isLegal`, `whyIllegal`, `hasAnyLegalMove`, `moveNotation`;
- **applying moves:** `applyMove`, `getOutcomes`;
- **derived views:** `budget`, `worldCount`, `kingDanger`, `kingTrapped`, `moveRisk`, `links`, `squareView`,
  `pieceLocations`, `rollDisplay`;
- **record:** `chainStart`, `chainNext`, `rollIdentity`, `supportKey`.

`index.js` groups its exports under two headings: the **twin API**, which the PHP facade mirrors, and
**JavaScript-only helpers**, such as seeded random numbers for the computer player, setup positions for the trainer,
FEN import, and search hooks.

### 5.2 The parity contract

The two engines must produce **byte-identical** results. The contract is checked by fixtures:

1. `tests/fixtures/generate-engine-fixtures.mjs` runs the JavaScript engine over generated games, parser cases,
   move records, derived views and hand-written vectors. It writes `tests/fixtures/engine/*.json`.
2. `tests/js/engine/fixtures.spec.js` (Vitest) and `tests/php/Unit/Engine/*` (PHPUnit) replay every fixture and
   compare serialized states, hashes, notation, measurement records and views byte for byte.
3. CI regenerates the fixtures and fails if the committed files differ (`npm run fixtures && git diff --exit-code
   tests/fixtures/engine`).

A missing fixture file fails the tests. It is never skipped.

Rules for changing the engine:

- Change both engines in the same pull request, regenerate the fixtures, and update
  [`docs/engine-rules.md`](../engine-rules.md) when the rule itself changes.
- Worked examples (`W1`…) and the edge-case table of the rules document have their own tests in both languages
  (`workedExamples.spec.js`, `WorkedExamplesTest.php`, `edgeCases.spec.js`).
- `describeForLlm` exists in both engines but is **not** a parity pair. It is non-normative text for prompts, and
  each header documents how the two outputs differ.
- `src/engine/ui/` is JavaScript only and never parity-tested.

### 5.3 Twin map

Each JavaScript module names its PHP twin in its header, and each PHP class names its JavaScript twin.

| JavaScript (`src/engine/`) | PHP (`lib/Engine/`) |
|---|---|
| `index.js` | `Engine.php` (facade) |
| `constants.js`, `geometry.js`, `squares.js` | `Internal/Tables.php` and the constants of `Engine` |
| `state.js` | `Engine.php` (state functions) and `Internal/StateValidator.php` |
| `parser.js` | `Internal/Parser.php` |
| `analysis.js` | `Internal/Analysis.php` |
| `moveRecord.js` | `Internal/MoveRecord.php` |
| `moveRules.js` | `Internal/MoveRules.php` |
| `quantumMoves.js` | `Internal/QuantumMoves.php` |
| `moveGenerator.js` | `Internal/MoveGenerator.php` |
| `moveInput.js` | `Internal/MoveInput.php` |
| `legality.js` | `Engine.php` (`generateMoves`, `findMove`, `isLegal`, `whyIllegal`, `hasAnyLegalMove`) |
| `apply.js` | `Internal/Pipeline.php` |
| `outcomes.js`, `rescale.js`, `bookkeeping.js`, `hash.js` | `Internal/Worlds.php` |
| `danger.js` | `Internal/Danger.php` |
| `views.js`, `fairplay.js` | `Internal/Views.php` |
| `notation.js` | `Internal/Notation.php` |
| `roll.js` | `Internal/RollDisplay.php` |
| `rng.js` | `Engine::keyForU()` (the server draws rolls with `random_int`) |
| `chain.js`, `sha256.js` | `Engine` chain functions and PHP's `hash('sha256')` |
| `setup.js` | `Internal/Setup.php` (`certainFen` is in `Internal/Views.php`) |
| `describe.js` | `Internal/Describer.php` (not a parity pair) |
| `errors.js` | `IllegalMoveException`, `InvalidStateException`, `SetupException` |
| `types.js` | Psalm type aliases on `Engine.php` |

### 5.4 Presentation helpers (`src/engine/ui/`)

`src/engine/ui/` turns engine data into what the UI shows: sentences that explain a roll or a result, piece and
colour names, number formatting for probabilities, identity colours, split targets, and the possibilities view. It
lives inside the engine package because it builds on engine internals (the world analysis and move resolution) that
the public API deliberately does not expose. Two things set it apart from the rest of the engine:

- It is the only part of `src/engine/` that may import `@nextcloud/l10n`. The rest of the engine is locale-free, and
  a test checks this.
- It has no PHP twin and is not parity-tested. The rules, the computer player and the server never use it.

### 5.5 The computer player (`src/ai/`)

| Module | Responsibility |
|---|---|
| `client.js` | Promise API for the UI: one lazily created Web Worker, a priority queue (the computer's move goes before coach analyses, and the review goes last), cancellation with `AbortSignal`, and a time-sliced main-thread fallback when workers are unavailable |
| `worker.js`, `jobs.js`, `tasks.js` | The worker entry, the job table, and the helpers that drive search tasks in slices |
| `levels.js` | The five levels and their strengths, piece values, and `ENGINE_VERSION` (part of the cache key of stored reviews; bump it when evaluation or levels change) |
| `search.js`, `moveOrdering.js`, `transposition.js`, `searchValues.js` | Expectimax search with chance nodes for rolls: iterative deepening, quiescence, a transposition table, killer and history move ordering |
| `evaluate.js`, `features.js`, `pieceSquareTables.js` | Static evaluation: material, piece-square tables, the probabilistic attack map, king danger |
| `bestMove.js` | Move choice per level, including controlled randomness for the weaker levels |
| `candidates.js` | Ranked candidate moves offered to an LLM opponent |
| `analyze.js` | Coach analysis, move evaluation and whole-game review |
| `solver.js` | Proves forced wins, which is how the trainer's puzzles are verified |
| `benchmark.js` | Measures the device's speed once, so time budgets translate to comparable node budgets |
| `geometry.js` | The computer player's own board tables. They are kept separate from the engine's on purpose: their iteration order sets move ordering, and with it the moves the computer chooses. |

The computer player uses only the engine's public API (`engine/index.js`). Given a seed and a node budget, a search
is deterministic, and tests rely on that. Searches bounded by wall-clock time are not.

### 5.6 The chess variants (`src/variants/`)

Version 2 adds twenty chess variants, from 3D and 4D chess to shogi and xiangqi, played on this device (pass & play
and against a computer player). They do not use the rules engine of section 5.1: that engine is specified byte for
byte for classic Quantum Chess and mirrored in PHP for online games. The variants share one generic quantum layer
instead, which is JavaScript only. The player-facing rules are in [`docs/variants.md`](../variants.md).

| Module | Responsibility |
|---|---|
| `index.js` | The public API: catalogue, `loadVariant(id)` (one lazily loaded chunk per variant), the quantum layer and the computer player |
| `catalog.js` | Names, summaries and categories of the variants, cheap to import on every page |
| `core/topology.js` | Boards as squares with integer coordinates in any number of dimensions, their names and their drawing (square, hexagon or intersection cells, several boards) |
| `core/world.js` | One **world**: an ordinary position (piece list, board, the variant's extra state). Movement descriptors (leap, ride, hop, lame leaper, oriented vectors, regions), move generation and application |
| `core/orthodox.js`, `core/orthodoxVariant.js` | The orthodox pieces, castling (including Chess960), double steps, en passant and promotion, and a ready-made 8 × 8 declaration |
| `core/variant.js` | `defineVariant()`: the defaults and caches of a variant declaration |
| `core/quantum.js` | The quantum layer: weighted worlds (integer weights summing to 2^24), split, merge, measure, "land = roll, pass = link", the budget, the solid roll and the game-end roll. `branches()` lists every outcome of a move with its weight; playing a move samples one |
| `core/ai.js` | The computer player of the variants: expectimax over the outcomes of each roll, with a reply search at the higher levels |
| `<id>.js` | One module per variant: its board, pieces, setup, special moves and win conditions, declared through hooks (`extraMoves`, `afterMove`, `worldResult`, `visibility`, ...) |

A variant only describes ordinary chess in one world. The quantum layer plays each move in every world at once, and
two generic checks make every rule quantum without variant code: the **solid roll** keeps kings, pawns and other
solid pieces in one place, and the **game-end roll** settles a result that holds in only some worlds (a third check,
an explosion, a king on the hill). Hidden-information variants add `visibility()` and the moves a player may try.

`src/variantplay/` holds the UI: `VariantBoard.vue` draws any layout in SVG, `useVariantGame` runs a game (move
modes, the confirmation of rolled moves, the computer's turns, undo with a roll memo, the hand-over curtain of the
hidden-information variants), and `variantGames.js` stores the games in the browser. The variant tests are in
`tests/js/variants/`; `fuzz.spec.js` plays random games in every variant and checks the invariants of the quantum
layer after every move.

## 6. Data flow

### 6.1 Local games (computer, LLM opponent, pass & play)

```text
LocalGameView ─▶ LocalGameHost ─▶ useLocalGame (GameController) ─▶ GameScreen ─▶ QuantumBoard
                                    │
                                    ├─ engine applyMove(state, code, {u})
                                    │     u: a fresh CSPRNG roll, kept in the game's roll memo
                                    ├─ ai/client bestMove(...)
                                    │     the computer's turn, computed in the Web Worker
                                    ├─ llm/useLlmOpponent
                                    │     the LLM opponent's turn: candidates from the worker
                                    │     → POST /api/ai/move (pending? poll /api/ai/task/{id})
                                    │     → validate with findMove → at most one retry with feedback
                                    │     → otherwise play the best candidate
                                    ├─ game/localGames.js
                                    │     localStorage: an index plus one record per game
                                    └─ POST /api/stats/local
                                          finished results, for the statistics page
```

The game is saved together with its **roll memo**, the rolls already drawn. Reloading the page or undoing a move
therefore never gives a different result for a roll the player has already seen.

### 6.2 Online games

```text
Browser (useOnlineGame)                                   Server
───────────────────────                                   ──────
POST /api/games (invite or open challenge)  ───────────▶  InvitationService → notification to the opponent
POST /api/games/{id}/accept | join          ───────────▶  InvitationService → colours, start state, chain start
POST /api/games/{id}/moves {code, ply, clientId}
      optimistic display, retry with backoff ─────────▶  GameplayService.move():
                                                            participant → idempotent retry → lazy deadline →
                                                            status → turn → ply → legality (Engine::findMove)
                                                            u = RandomSource (random_int) if the move rolls
                                                            Engine::applyMove, moveNotation, chainNext
                                                            one transaction: insert move, save game (rev check)
                                                            after commit: notifications
        ◀──────────────────────────────────────────────  {game, move, measurement}
GET /api/games/{id}/poll?rev&ply&chat       ───────────▶  GameQueryService.poll(): only what changed
replay each new move with the JS engine and the recorded u;
check the hash chain (online/chainCheck.js) against the game head
and against the last chain this browser saw
```

- **Polling.** `usePoller` sends one request at a time. The interval adapts to the game: fast right after a move,
  slowing down while the player waits for the opponent, and rare in a hidden tab. After an error it backs off
  exponentially with jitter, respects `Retry-After`, and exposes a connection state for the banners. The lobby
  polls a cheap summary with an ETag and loads the full lobby only when its token changes.
- **Hash chain.** Each move stores `chain = H(previous chain, ply, code, u, key, state)`. The client recomputes the
  chain for every move and remembers the last `(ply, chain)` it saw for each game. If an earlier move changes later,
  the client shows a warning banner.
- **Notifications.** `NotificationService` sends Nextcloud notifications (invitations and their answers, your turn,
  draw offers, chat, game over). Their Accept, Decline and Rematch actions call the OCS routes, so they also work
  in the mobile and desktop clients. The dashboard widget lists games that need the user's attention.
- **Maintenance.** `GameMaintenanceJob` expires invitations, applies timeouts and abandonment, and purges old data.
  Deadlines are also resolved lazily when a game is read, so the job's schedule never decides a result.
- **Fair play.** The coach and the analysis tools are not offered in the user's own active online games. Every
  stored move records the support key of the position it produced (`docs/engine-rules.md` Appendix D).

### 6.3 Trainer, coach and review

- **Trainer.** Lessons are step machines (`trainer/composables/useLessonRunner.js`) over setup positions, with
  predicates that check the player's move. The puzzle screen runs `usePuzzleRunner`; the puzzles themselves are
  verified by the solver in the unit tests. Progress is stored locally and synchronised through
  `/api/trainer/progress`. Local games report a finished game through `trainer/report.js`, which loads the trainer's
  event handling on demand; winning the graduation game of lesson 11 without help completes the lesson.
- **Coach.** `useCoach` runs analyses in the worker and turns them into an evaluation, move-quality badges, hints and
  threat warnings. The LLM coach chat sends the position and the question to `POST /api/ai/coach`.
- **Review.** `review/composables/useGameReview.js` runs `analyzeGame` in the worker, caches the result under a key
  that includes `ENGINE_VERSION`, and derives key moments and the evaluation graph.

## 7. Testing strategy

| Layer | Tool | Location | What it guards |
|---|---|---|---|
| Rules engine (JS) | Vitest | `tests/js/engine/` | Rules, worked examples, the edge-case table, property tests (random playouts keep every invariant), purity, performance budgets |
| Rules engine (PHP) | PHPUnit | `tests/php/Unit/Engine/` | The same, plus replay of every parity fixture |
| Parity | Both, plus CI | `tests/fixtures/` | Byte-identical results of both engines; fixtures cannot drift from the generator |
| Computer player | Vitest | `tests/js/ai/` | Search and evaluation, level behaviour, the solver, the worker protocol, deterministic seeded results |
| Frontend units and components | Vitest (+ happy-dom, `@vue/test-utils`) | `tests/js/<feature>/` (mirrors `src/`) | Pure modules, composables with injected dependencies, key components |
| Backend | PHPUnit | `tests/php/Unit/` (mirrors `lib/`) | Services with mocked OCP interfaces, serializer JSON shapes, validation order and error codes |
| HTTP API | Playwright, without a browser | `tests/e2e/api/` | Routes, JSON shapes, error codes and notifications against a real Nextcloud |
| End to end | Playwright | `tests/e2e/` | User journeys in a real Nextcloud: local games, online games between two users, trainer, coach and review, settings, notifications |
| Benchmarks | `vitest bench` | `*.bench.js` | Speed of hot paths (advisory in CI) |

Guidelines:

- Test behaviour through the public API of a module. Components and composables accept injected dependencies
  (`deps`, `create*()` factories), so tests do not need module mocks.
- DOM tests declare `// @vitest-environment happy-dom` in their header. All other tests run in Node.
- Search tests use a seed and a node budget, never wall-clock limits.
- End-to-end tests prefer `data-test` attributes and accessible roles over CSS classes and text. They share server
  state and therefore run with a single worker; every file sets up its own data.
- Test titles describe behaviour ("rejects a merge onto a friendly piece"). They never cite document sections.

## 8. Conventions

### 8.1 Naming

| Kind | Convention | Example |
|---|---|---|
| Vue components | PascalCase, one component per file | `GameScreen.vue` |
| Composables | `use` + PascalCase, in `composables/`, named after their export | `useOnlineGame.js` |
| Other JS modules | camelCase, named after their main export or concept | `chainCheck.js`, `boardThemes.js` |
| PHP classes | PascalCase, PSR-4; services end in `Service` when they are use-case facades | `GameplayService`, `GameRepository` |
| PHP enums | Singular nouns | `ApiError`, `AdminSetting`, `TimeControl` |
| Tests | None in `src/`; `tests/js/<path of the module>/<module>.spec.js` (camelCase like the module), `*.vue.spec.js` for component tests; `tests/php/Unit/<Namespace>/<Class>Test.php`. The rules document's worked examples and edge cases have their own specs (`workedExamples.spec.js`, `edgeCases.spec.js`) | `tests/js/online/usePoller.spec.js` |
| CSS classes | BEM with the `qc-` prefix | `qc-player-card__name` |
| Storage keys | `quantumchess.<name>.v<version>` | `quantumchess.chain.v1` |

Identifiers use American English (`color`, `center`, `analyze`). Translated text and comments keep their own style.
Names that are part of a stable contract (section 10) are never renamed just for spelling; the one British-spelled
name among them is `normaliseCode`, an export of the rules engine's public API.

### 8.2 File size

Aim for components, composables and classes of **about 400 lines or fewer**. When a file grows past that, look for a
seam: a pure module, a child component, a composable, a collaborator class. Larger files are acceptable when they
are declarative (data tables, lesson content, fixtures and test tables) or when splitting would scatter one cohesive
algorithm, such as the search's tree walk or the thin methods of the engine facade.

### 8.3 Doc blocks

- Every file starts with the SPDX header, followed by one short doc block that says what the file is responsible for.
- Exported functions, classes, public methods and component props carry JSDoc or PHPDoc with types and a short
  description. ESLint's `jsdoc` rules run with zero warnings, and Psalm checks the PHP types.
- Prefer named typedefs (`@typedef`, `@psalm-type`) over `{object}` and `array<string, mixed>` for shapes that cross
  module boundaries: engine states, legal moves, API payloads, the GameController.
- Do not use `any` or `Function` as types. Write `unknown` or a signature such as `(move: string) => void`.

### 8.4 Internationalisation

- Every user-visible string goes through `t('quantumchess', …)` or `n('quantumchess', …)` in JavaScript, and through
  `IL10N::t()` / `IL10N::n()` in PHP. Never build a sentence by concatenating fragments. Use placeholders
  (`{name}`, `%s`).
- The first argument must be a string literal, so the extractor (`tools/l10n.mjs`) can find it. Module-level data
  that contains text stores functions (`() => t(...)`), so each string is translated when it is shown.
- Add a `// TRANSLATORS:` comment wherever a string needs context. Game terms follow
  `translationfiles/GLOSSARY.md`.
- Changing the wording of a source string invalidates every existing translation of it. Treat such a change as a
  product decision, not as a refactor. `npm run l10n:verify` fails if the set of source strings changes without an
  updated template.

### 8.5 Error handling

- **Backend:** throw `ApiException` with an `ApiError` code from services. Let `ApiController::respond()` produce
  the response. Never return an error array by hand. Log unexpected exceptions with `['exception' => $e]`, without a
  hand-written app prefix; the app logger adds one.
- **Frontend:** `services/api.js` turns every failure into an `ApiError` with `status`, `code`, `data` and
  `retryAfter`, and turns cancellations into `AbortError`. Features branch on `code`, never on message text. Show
  user-facing errors with Nextcloud dialogs (`showError`) or with a banner in context. The only place that swallows
  errors on purpose is the storage wrapper, where a failed write must never break a game.
- **Engine:** invalid input throws `IllegalMoveError` / `IllegalMoveException`, `InvalidStateError` /
  `InvalidStateException`, or `SetupError` / `SetupException`. Those are programming errors or tampered data, never
  normal flow. `whyIllegal()` exists to explain a rejected move to the user.

### 8.6 Dependencies and compatibility

- PHP code must run on PHP 8.1, the minimum declared in `info.xml`. Enums and readonly properties are fine. Readonly
  classes, DNF types and `#[\Override]` are not.
- Only OCP APIs; no `OC\` classes.
- Discuss any new npm or Composer dependency in an issue before adding it. The app ships no Composer runtime
  dependencies.

## 9. Comment policy

Comments explain **why**, and state contracts. They do not narrate what the code visibly does, and they do not
record where an idea came from.

1. **Explain intent and constraints.** Good comments say why a non-obvious choice was made ("the order of the checks
   matters: an idempotent retry must succeed even after the game ended"), what a caller may rely on, or which
   invariant a block maintains.
2. **State rules; don't cite planning.** Never reference internal planning or design documents, work packages,
   module owners, review rounds or release scoping. That includes phrases such as "deferred to a later version",
   "in 1.0" and "P0". If a comment depends on a rule, write the rule itself. The roadmap belongs in issues, milestones
   and `CHANGELOG.md`.
3. **Allowed references:**
   - The normative rules document. Inside the engine packages (`src/engine`, `lib/Engine`, `src/ai`, engine tests
     and fixtures), each file header states once that "section numbers (§) refer to docs/engine-rules.md". The body
     then uses bare `§4.11`, `Appendix A`, and the rule, invariant and example ids defined there (`S4`, `I2`, `W16`).
     Everywhere else, write the full form: `docs/engine-rules.md §9.4`.
   - `docs/development/api.md` in controllers and routes; `docs/rules.md` where UI text mirrors the player rules.
   - Upstream documentation and RFCs, by URL. Issues, as `#123`.
4. **One header doc block per file.** It says what the file is responsible for, and for engine modules, its twin.
5. **TODOs** are allowed only as `TODO(#issue): …`.
6. **Test titles** describe behaviour and never cite document sections.
7. **`TRANSLATORS:` comments** end up in the translation template. They point to the glossary, never to design
   documents.
8. **No machine-specific paths or credentials** in code or docs, apart from the documented test defaults.

CI checks for forbidden references with `npm run lint:refs`.

## 10. Stable contracts

Refactoring must never change these without an explicit, versioned decision:

| Contract | Defined by |
|---|---|
| HTTP routes, parameter names, JSON shapes, error codes, status codes | `appinfo/routes.php`, controller signatures, `GameSerializer`, `ApiError`, [`api.md`](api.md) |
| Controller class names and action names (they determine the route names and notification action URLs) | `lib/Controller/*` |
| Database schema, table and column names | `lib/Migration/*` |
| Class names recorded by Nextcloud: background job, settings classes, migration | `appinfo/info.xml`, `oc_jobs`, `oc_migrations` |
| App config keys, user config keys and their value formats | `AdminSetting`, `Service\Player`, `Service\Settings` |
| Rules engine API and its byte-identical parity | `src/engine/index.js`, `lib/Engine/Engine.php`, `tests/fixtures/engine/` |
| Stored client data: `localStorage` keys and formats, `ENGINE_VERSION`, `BENCH_KEY` | `services/storage.js`, `game/localGames.js`, `ai/levels.js`, `ai/benchmark.js` |
| Translation source strings | every `t()` / `n()` / `IL10N` call; `translationfiles/templates/quantumchess.pot` |
| Bundle entry names | `vite.config.js`, `templates/*.php` |
