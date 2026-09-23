<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# End-to-end tests

Browser tests with [Playwright](https://playwright.dev) against a **running Nextcloud** with Quantum Chess enabled
(docs/SPEC.md §15.2). Each module owns one spec file, `tests/e2e/<module>.spec.mjs`; this directory also holds the
shared configuration and helpers.

## Running them

```sh
npm ci                                   # includes @playwright/test
npx playwright install chromium          # once; or point QC_CHROMIUM at an installed Chromium
QC_BASE_URL=http://127.0.0.1:8080 QC_NC_ROOT=/path/to/nextcloud npm run test:e2e
```

`npm run test:e2e` and `make e2e` both run `playwright test -c tests/e2e/playwright.config.mjs`. Useful variants:

```sh
npm run test:e2e -- tests/e2e/frontend-board.spec.mjs   # one module
npm run test:e2e -- -g "split"                          # tests whose title matches
npm run test:e2e -- --headed --project=desktop           # watch it
npx playwright show-report playwright-report             # the HTML report of the last run
```

In the development container of this project:

```sh
QC_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

## What the setup does

Before the first test, `global-setup.mjs`

1. waits until `status.php` reports an installed Nextcloud that is not in maintenance mode;
2. when `occ` is reachable, creates the test users or resets their passwords (`admin`, `bob`, `carol`) and checks
   that the app is enabled;
3. logs every test user in once and stores the browser state in `test-results/.auth/<uid>.json`, so tests start
   logged in without going through the login form.

Tests run one after the other (one worker), because they share the server's users and games.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `QC_BASE_URL` (or `NC_URL`) | `http://127.0.0.1:8080` | Base URL of Nextcloud, without `/index.php` |
| `QC_PRETTY_URLS` | `0` | `1` when the server has pretty URLs (no `/index.php` in app links) |
| `QC_CHROMIUM` | Playwright's own Chromium | Path of the Chromium or Chrome executable to use |
| `QC_NC_ROOT` (or `NC_ROOT`) | the server this app sits in (`../..`), else `/tmp/claude-0/nc/server` | Nextcloud directory containing `occ`, for creating users and resetting data |
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
// tests/e2e/frontend-online.spec.mjs
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
app, and the test fails if any remain when it ends (SPEC §15.2). After a step that is expected to log an error,
call `consoleErrors.clear()` (for the built-in `page`) or `bob.consoleErrors.clear()`.

### Helpers (`helpers/index.mjs`)

| Helper | Purpose |
|---|---|
| `test` fixtures `user`, `consoleErrors`, `openAs(user, contextOptions?)`, `twoUsers` | Logged-in pages with console error checks |
| `openApp(page, route?, { ready? })` | Open the app at a client-side route (`'/game/42'`, `'/trainer'`) and wait until it has mounted |
| `appMenuIcon(page)` | The app's icon in the Nextcloud header |
| `login(page, user)`, `newUserPage(browser, user, options?)` | Log in through the login form; a new logged-in context |
| `api(user, method, path, body?)`, `ocs(user, method, path, body?)` | Call the app's API or OCS routes as a user (for seeding) |
| `occ(args, { env?, allowFailure? })` | Run an occ command |
| `ensureUser(user)`, `ensureUsers()` | Create a test user or reset its password |
| `resetAppData({ adminSettings? })` | Delete all games, moves, chat, ratings, user settings, notifications and cache of the app (needs the server on this machine) |
| `setUserSetting(user, key, value)`, `setAppConfig(key, value, type?)` | Change a setting of SPEC §11 |
| `env`, `getUser(user)`, `appUrl(suffix)` | The configuration above |

### Tips

- Prefer roles and accessible names (`page.getByRole('gridcell', { name: /e4/ })`) over CSS classes: the board is
  a grid with labelled cells, and this also keeps its accessibility honest.
- Rolls in online games are random. To test a specific result, set up the position through the API and assert on
  what the UI shows for either result, or use a local game or lesson, which can force outcomes.
- Wait for state, never for time: `await expect(locator).toBeVisible()` instead of `waitForTimeout`.
- Attach a screenshot for the module report:
  `await testInfo.attach('lobby', { body: await page.screenshot(), contentType: 'image/png' })`.
