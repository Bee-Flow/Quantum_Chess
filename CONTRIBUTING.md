<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Contributing to Quantum Chess

Thank you for helping! Bug reports, translations, lessons, puzzles and code are all welcome. This project follows
the [Nextcloud Code of Conduct](https://nextcloud.com/contribute/code-of-conduct/). Please report security problems
privately, as described in the [security policy](.github/SECURITY.md).

Before you start on a larger change, open an issue so that we can agree on the approach. That applies in particular
to **new dependencies** (npm or Composer): discuss them in an issue first. The app ships no Composer runtime
dependencies.

## Setting up

You need Node.js 22 with npm 10, PHP 8.1 or later with Composer, GNU make, and a Nextcloud server (32 to 35) for
development.

```sh
# inside your Nextcloud's apps directory (or symlink the clone there)
git clone https://github.com/bee-flow/quantum_chess.git quantumchess
cd quantumchess
npm ci                      # JavaScript dependencies
composer install            # PHP development tools: PHPUnit, Psalm, php-cs-fixer, the OCP stubs
make build                  # or: npm run dev, npm run watch
php ../../occ app:enable quantumchess
```

[`docs/development/architecture.md`](docs/development/architecture.md) explains how the code is organised. Read
it before your first change; it is the map of the repository.

## Everyday commands

| Command | What it does |
|---|---|
| `make build` | Production build of the web app into `js/` and `assets/` (`npm ci` runs only when the lock file changed) |
| `npm run dev`, `npm run watch` | Development build with source maps, once or on every change |
| `make test` | The unit tests: Vitest (`npm test`) and PHPUnit (`composer test:unit`) |
| `make lint` | ESLint, the comment-reference check, `php -l`, php-cs-fixer, Psalm, `info.xml` against the App Store schema and the SPDX headers |
| `npm run lint:fix`, `composer cs:fix` | Fix what the JavaScript and PHP linters can fix automatically |
| `npm run fixtures` | Regenerate the rules engine's parity fixtures (see below) |
| `npm run bench` | Benchmarks of the rules engine and the computer player |
| `make e2e` | The end-to-end tests against a running Nextcloud (see below) |
| `make appstore` | The App Store package `build/artifacts/quantumchess.tar.gz`, with runtime files only |
| `make help` | Every target |

ESLint runs with `--max-warnings 0`, so a warning fails the build just like an error.

## Tests

| Folder | Tool | What it covers |
|---|---|---|
| `tests/js/` | Vitest | The web app, the rules engine and the computer player. The folders mirror `src/`. |
| `tests/php/` | PHPUnit | The backend and the PHP rules engine, with mocked Nextcloud interfaces. The folders mirror `lib/`. |
| `tests/fixtures/` | both | The parity fixtures of the two rules engines and their generator |
| `tests/e2e/` | Playwright | User journeys in a real Nextcloud: local and online games, trainer, coach and review, settings, notifications |
| `tests/e2e/api/` | Playwright | The HTTP API against a real Nextcloud: routes, JSON shapes and error codes |

Test behaviour through the public API of a module, give composables and components their dependencies instead of
mocking modules, and use a seed and a node budget (never wall-clock limits) in tests of the computer player. Test
titles describe behaviour.

Some slow tests are opt-in through environment variables:

| Variable | Effect |
|---|---|
| `QC_SLOW=1` | Also run the self-play tournament of the computer player's levels (`tests/js/ai/tournament.spec.js`) |
| `QC_GAMES=<n>` | The number of games per pairing in that tournament (default 4) |
| `QC_PERF_REPORT=1` | Print the timing table of the rules engine's performance tests |

### End-to-end tests

The end-to-end tests run against a real Nextcloud with the app enabled. **Use a test server**: the tests create
users, reset their passwords and delete all Quantum Chess data.

```sh
npx playwright install chromium          # once, or point QC_CHROMIUM at an installed Chromium
QC_BASE_URL=http://localhost:8080 QC_NC_ROOT=/path/to/nextcloud make e2e
```

`QC_NC_ROOT` is the server directory that contains `occ`. The global setup creates the test users `admin`, `bob`
and `carol` and logs them in once. [`tests/e2e/README.md`](tests/e2e/README.md) lists every variable and explains how
to write a spec.

## The two rules engines

The game rules exist twice: in JavaScript (`src/engine/`, used by the browser) and in PHP (`lib/Engine/`, used by the
server for online games). Both implement [`docs/engine-rules.md`](docs/engine-rules.md) and must produce
**byte-identical** results. Shared fixtures prove it:

1. `npm run fixtures` runs the JavaScript engine over generated games, parser cases and hand-written vectors and
   writes `tests/fixtures/engine/*.json`.
2. Vitest and PHPUnit replay every fixture and compare states, hashes, notation and measurement records byte for
   byte.
3. CI regenerates the fixtures and fails if the committed files differ.

So a rules change always touches both engines in the same pull request, regenerates the fixtures, and updates
`docs/engine-rules.md` if the rule itself changes.

## Translations

English is the source language. Every user-visible text goes through `t('quantumchess', …)` or `n('quantumchess', …)`
in JavaScript and `IL10N::t()` / `IL10N::n()` in PHP, with a string literal as the text. Changing the wording of a
source string invalidates its translations, so treat it as a product decision.

| Command | What it does |
|---|---|
| `npm run l10n:extract` | Write `translationfiles/templates/quantumchess.pot` from the sources |
| `npm run l10n:merge` | Add new strings to the `.po` files of every language |
| `npm run l10n:build` | Convert the `.po` files into `l10n/<lang>.js` and `l10n/<lang>.json` |
| `npm run l10n:check` | Fail on untranslated strings or placeholder mismatches |
| `npm run l10n:verify` | Fail if the source strings differ from the committed template |

[`translationfiles/README.md`](translationfiles/README.md) describes the workflow, and
[`translationfiles/GLOSSARY.md`](translationfiles/GLOSSARY.md) the game terms in every language.

## Conventions

- Every file starts with an SPDX licence header (`make lint-spdx` checks it) and a short doc block that says what
  the file is responsible for.
- JavaScript follows `@nextcloud/eslint-config`, PHP the Nextcloud coding standard. Indent with tabs.
- Use Nextcloud's components (`@nextcloud/vue`) and CSS variables; the app's own design tokens are in
  `src/styles/tokens.scss`.
- Comments explain **why** and state contracts. They never refer to planning documents, work packages or release
  scoping, and TODOs name an issue (`TODO(#123): …`). The full policy is in section 9 of
  [`architecture.md`](docs/development/architecture.md#9-comment-policy); `npm run lint:refs` checks the most common
  slips.
- PHP code must run on PHP 8.1, the minimum `appinfo/info.xml` declares.
- Keep changes behaviour-neutral unless the pull request says otherwise, and keep the stable contracts of section 10
  of the architecture document (routes, JSON shapes, the database schema, stored keys, translation strings).

## Pull requests

- Keep a pull request focused on one change, and describe what it changes and why.
- Run `make lint` and `make test` before you push, `npm run build` for frontend changes, and the end-to-end tests
  when you touch a user journey.
- Add or update tests, and an entry under *Unreleased* in [`CHANGELOG.md`](CHANGELOG.md) for user-facing changes.
- For visible changes, add screenshots in the light and dark theme, and at phone width where it matters.

Releases are made by the maintainers, as described in
[`RELEASING.md`](RELEASING.md).
