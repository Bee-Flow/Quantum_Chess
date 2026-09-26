<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# End-to-end tests

[Playwright](https://playwright.dev) tests against a **running Nextcloud** with Quantum Chess enabled:

| File | What it tests |
|---|---|
| `smoke.spec.mjs` | The app is installed, its icons are served, every test user can open it |
| `app-shell.spec.mjs` | The tab title and the page in another language |
| `local-games.spec.mjs` | The lobby, a computer game with undo, pass & play with every move type, the rules page, a settings change |
| `ai-opponent.spec.mjs` | A game against an LLM opponent answered by a fake provider |
| `online-game.spec.mjs` | A whole online game between two users in two browsers: invitation, moves, chat, draw offer, resignation, rematch |
| `notifications.spec.mjs` | An invitation accepted from the Nextcloud notification panel |
| `trainer.spec.mjs` | Lessons and a puzzle solved by clicking; the progress survives a reload |
| `coach-review.spec.mjs` | The coach during a computer game, then the post-game review |
| `settings.spec.mjs` | The admin and personal settings pages |
| `variants.spec.mjs` | The catalogue of the twenty chess variants; a multiverse (5D) game against the computer with a turn ended by Submit turn, a reload and "Continue on this device"; every variant tile starts a game against the computer in which the player splits a piece and the computer answers |
| `api/*.spec.mjs` | The HTTP API without a browser: online games and notifications (`games`), the LLM and settings routes (`ai`), the app page and the per-user routes (`pages`) |

The shared configuration is `playwright.config.mjs`, the shared code is in `helpers/`.

## Running them

```sh
npm ci                                   # includes @playwright/test
npx playwright install chromium          # once; or point QC_CHROMIUM at an installed Chromium
QC_BASE_URL=http://127.0.0.1:8080 QC_NC_ROOT=/path/to/nextcloud npm run test:e2e
```

`npm run test:e2e` and `make e2e` both run `playwright test -c tests/e2e/playwright.config.mjs`. Useful variants:

```sh
npm run test:e2e -- tests/e2e/online-game.spec.mjs      # one file
npm run test:e2e -- tests/e2e/api                       # only the API specs
npm run test:e2e -- -g "split"                          # tests whose title matches
npm run test:e2e -- --headed --project=desktop          # watch it
npx playwright show-report playwright-report            # the HTML report of the last run
```

## What the setup does

Before the first test, `global-setup.mjs`

1. waits until `status.php` reports an installed Nextcloud that is not in maintenance mode;
2. when `occ` is reachable, creates the test users or resets their passwords (`admin`, `bob`, `carol`) and checks
   that the app is enabled;
3. logs every test user in once and stores the browser state in `test-results/.auth/<uid>.json`, so tests start
   logged in without going through the login form.

Tests run one after the other (one worker), because they share the server's users and games. Every browser test
runs at desktop size; tests tagged `@phone` also run at phone size. The API specs run once, without a browser.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `QC_BASE_URL` (or `NC_URL`) | `http://127.0.0.1:8080` | Base URL of Nextcloud, without `/index.php` |
| `QC_PRETTY_URLS` | `0` | `1` when the server has pretty URLs (no `/index.php` in app links) |
| `QC_CHROMIUM` | Playwright's own Chromium | Path of the Chromium or Chrome executable to use |
| `QC_NC_ROOT` (or `NC_ROOT`) | the server this app sits in (`../..`) | Nextcloud directory containing `occ`, for creating users and resetting data |
| `QC_OCC` | `php $QC_NC_ROOT/occ` | Full occ command, split at spaces, e.g. `docker exec -u www-data nextcloud php occ` |
| `QC_SETUP_USERS` | `1` | `0` skips creating the users with occ (they must exist already) |
| `QC_ADMIN_USER`, `QC_ADMIN_PASSWORD` | `admin`, `QuantumAdmin!2026` | The administrator |
| `QC_BOB_USER`, `QC_BOB_PASSWORD` | `bob`, `QuantumBob!2026` | First player |
| `QC_CAROL_USER`, `QC_CAROL_PASSWORD` | `carol`, `QuantumCarol!2026` | Second player |
| `CI` | – | Set by CI: GitHub annotations, one retry, `test.only` forbidden |

Use a **test server**: the helpers create users, reset passwords and can delete all Quantum Chess data.

## Writing a spec

Import `test` and `expect` from the helpers instead of `@playwright/test`:

```js
// tests/e2e/example.spec.mjs
import { expect, openApp, resetAppData, test } from './helpers/index.mjs'

test.beforeAll(async () => {
	await resetAppData()                       // a clean slate: no games, no settings
})

test('bob invites carol and she accepts', async ({ twoUsers }) => {
	const { bob, carol } = twoUsers            // two logged-in pages in separate contexts
	await openApp(bob.page, '/new?mode=online&opponent=carol')
	// …
	await openApp(carol.page)
	// …
})

test.describe('as bob', () => {
	test.use({ user: 'bob' })                  // the built-in `page` is logged in as bob (default: admin)

	test('the lobby opens @phone', async ({ page }) => {      // @phone: also runs at phone size
		await openApp(page)
		await expect(page.getByRole('main')).toBeVisible()
	})
})
```

Every page opened through these fixtures collects console errors, uncaught exceptions and HTTP 5xx answers of the
app, and the test fails if any remain when it ends. After a step that is expected to log an error, call
`consoleErrors.clear()` (for the built-in `page`) or `bob.consoleErrors.clear()`.

API specs import `apiTest` instead of `test`: it opens no browser. They call the routes with `api()` and `ocs()` and
check error answers with `expectApiError()`. When the tests of a file build on each other, the file declares
`test.describe.configure({ mode: 'serial' })`. Every file sets up its own data, so files never depend on each other.

### Helpers (`helpers/index.mjs`)

| Helper | Purpose |
|---|---|
| `test` fixtures `user`, `consoleErrors`, `openAs(user, contextOptions?)`, `twoUsers` | Logged-in pages with console error checks |
| `apiTest` | Playwright's plain `test`, for the API specs |
| `openApp(page, route?, { ready? })` | Open the app at a client-side route (`'/game/42'`, `'/trainer'`) and wait until it has mounted |
| `appMenuIcon(page)` | The app's icon in the Nextcloud header |
| `waitForSave(page, route, matches?)` | Wait for a debounced save, such as `PUT /api/settings/preferences`; start waiting before the action |
| `clickSquare(page, square, orientation?)`, `waitForTurn(page, timeout?)` | Play on the board: click a square such as `'e2'`, wait until the board accepts input |
| `byTestId(page, id)` | An element by its `data-test` attribute |
| `localGameRecord(page)` | The stored record of the local game open on the page |
| `installRollQueue(page)`, `rollFor(state, code, key)` | Force the rolls of local games: queue roll values, and compute the value that gives an outcome |
| `login(page, user)`, `newUserPage(browser, user, options?)` | Log in through the login form; a new logged-in context |
| `api(user, method, path, body?)`, `ocs(user, method, path, body?)`, `authHeaders(user)` | Call the app's API or OCS routes as a user |
| `expectApiError(promise, status, code?, what?)` | Expect an API call to fail with a status and an error code |
| `startFakeOpenAi(options?)` | A local fake OpenAI-compatible server for the LLM tests (`helpers/fake-openai.mjs`) |
| `occ(args, { env?, allowFailure? })` | Run an occ command |
| `ensureUser(user)`, `ensureUsers()` | Create a test user or reset its password |
| `resetAppData({ adminSettings? })` | Delete all games, moves, chat, ratings, user settings, notifications and cache of the app (needs the server on this machine) |
| `setUserSetting(user, key, value)`, `setAppConfig(key, value, type?)` | Change a user setting or an admin setting of the app |
| `env`, `getUser(user)`, `appUrl(suffix)` | The configuration above |
| `variantRecord(page)`, `waitForVariantTurn(page, side, options?)` | The saved record of the variant game on the page (its states unpacked); wait until a side is to move |
| `squareName(V, state, sq)`, `boardCell(page, name)`, `clickCell(page, name)` | The cells of a variant board |
| `playVariantMove(page, V, state, move)` | Play a legal move or split of the rules module through the board, confirming a roll |
| `seedVariantGame(page, game)`, `replayVariant(V, initial, codes)` | Store a variant game in the browser storage as the game screen saves one |

The last four rows are the chess variants' helpers in `helpers/variants.mjs`, imported from there: they load the rules
modules of `src/variants/`, which pick the moves a test plays through the board.

### Tips

- Select elements by their `data-test` attributes or by roles and accessible names
  (`page.getByRole('gridcell', { name: /e4/ })`), not by CSS classes. The board is a grid with labelled cells, and
  this also keeps its accessibility honest.
- Rolls in online games are random. To test a specific result, set up the position through the API and assert on
  what the UI shows for either result, or use a local game or lesson, which can force outcomes.
- Wait for state, never for time: `await expect(locator).toBeVisible()` instead of `waitForTimeout`, and
  `waitForSave()` for a debounced save.
- Attach a screenshot where a picture helps to understand a failure:
  `await testInfo.attach('lobby', { body: await page.screenshot(), contentType: 'image/png' })`.
