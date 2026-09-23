# Quantum Chess 1.0: lean delivery plan

This plan replaces the schedule in [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) to reach a complete, playable
and polished 1.0 sooner. The contract in [`SPEC.md`](SPEC.md) and the rules in [`ENGINE-RULES.md`](ENGINE-RULES.md)
stay valid; this document only **narrows the 1.0 scope** and **merges modules** into fewer work packages.

Principles:

- **Playable first, polish second, extras later.** Every mode must work end to end and look native before any
  "delight" extra is built.
- **Read only what you need.** Each package lists the SPEC and GAME-DESIGN (GD) sections that matter for it.
- **Time-box.** Aim for about 60–90 minutes of work per package. At most three screenshot/polish rounds.
- **Focused tests.** Unit tests for logic and one end-to-end check of the main flow; no exhaustive property suites.
- Deferred items are **not built and not stubbed in the UI** (no dead buttons). Keep SPEC names for everything that
  is built, so the deferred parts can be added in 1.1 without breaking changes.

## Done

| Module | State |
|---|---|
| engine-js | Done: `src/engine`, 324 tests, parity fixtures |
| engine-php | Done: `lib/Engine`, byte-identical on all fixtures (1789 tests) |
| ai-js | Done: `src/ai` (levels, search, analyze, candidates, analyzeGame, solve, worker, client), 92 tests |
| packaging | Done: Makefile, CI, release workflow, README, RELEASING, icons, e2e scaffolding |

## Deferred to 1.1 (not built in 1.0)

- **Board:** "view one possibility", "Show the other result", type-a-move input, Letters piece set, haptics, tabletop
  mode, heat maps. Three board themes instead of six.
- **Online:** distributed-cache poll path and BroadcastChannel (a plain `rev` check is enough), reminders and quiet
  hours, admin badge, server-side fair-play refusal (the UI lock stays), `.qcg.json` export, history filters, block
  list and personal invite policy, *Delete my data* button (the `UserDeletedListener` stays), rating pair cap.
- **Trainer and coach:** the Lab, achievements, trophy cabinet and XP, the `tools/` validator scripts (a Vitest test
  checks lessons and puzzles instead), hint tiers 3–4, luck ledger, accuracy score and the Verify view (the server
  still stores the chain and the client still shows the altered-history banner).
- **Other:** k6 load test, axe CI, bundle-size CI, Transifex sync.

## Work packages

| # | Package | Merges | Depends on |
|---|---|---|---|
| A1 | board | frontend-board | – (continue from the existing files) |
| A2 | backend | backend-games + backend-integration | – |
| B1 | app | frontend-app | A1 |
| B2 | ai-backend | backend-ai | A2 |
| C1 | online | frontend-online | A2, B1 |
| C2 | trainer-coach | trainer + coach-review | B1 |
| D1 | qa | integration, e2e, fixes, screenshots, Dutch translation | all |

Owned paths are the union of the merged modules' paths in IMPLEMENTATION-PLAN §5.

### A1 board (SPEC §3.3, §14.5–14.6 board components, §14.9; GD §3.2–3.6, §3.10)
Build: QuantumBoard + MiniBoard, ghost rendering (opacity, ring, badge, glow), identity dots, simple part threads and
link glyphs, what-if (conditional) view on hover/focus, king ring with percentage and the confirmation safety net,
budget pips + possibilities count, move switcher (Move / Split / Merge / Measure), all target markers, click + drag +
keyboard input, promotion picker, odds card with resolution icons and `explainOutcome`, roll animation with result
chip and reveal arrow, last-move highlight, arrows for hints, `RollBar` and `NotationText`, sounds (WebAudio),
three themes (classic, blue, quantum), cburnett pieces, reduced motion, ARIA. Dev playground route `/dev/board`.

### A2 backend (SPEC §5, §6.1, §6.3, §6.4, §7, §8 without the deferred parts, §9.1–9.2, §13)
Build: migration + entities + mappers, `ApiException`, GameService (invite, open challenge, join, accept, decline,
cancel, idempotent `clientId` moves with `rev` optimistic concurrency, lazy deadline timeout, abort, draw offer /
accept / decline, resign, rematch, chat), basic InvitePolicy (user exists, enabled, not self, Nextcloud sharing
group restriction; identical 404 answers), chain storage (ER §9.4), Elo 40/10 → 20, GameController + OcsGameController
(notification actions), simple poll (`rev` compare, one cheap query), GameMaintenanceJob (expire invitations, time
out games, abandon no-deadline games, purge old chat), UserDeletedListener, NotificationService + Notifier (all
subjects, rich `{user}`, recipient language, Accept/Decline actions, one live notification per game),
Dashboard widget, StatsService + StatsController (stats, leaderboard with an admin on/off switch and a personal
"show me" preference), PreferencesService, trainer progress, PageController initial state + CSP (workers) + share
route, Application registration. `SettingsService` and `AiSourceService` belong to B2: use the SPEC signatures and
create a minimal skeleton only if B2 has not delivered it yet (B2 replaces it).

### B1 app (SPEC §14.1–14.7, §14.10, §11.3; GD §2, §3.1, §3.7–3.9, §4)
Build: App shell + navigation (game lists and counters), router (all SPEC routes, deferred ones omitted),
services (`api.js`, preferences, localGames with the roll memo), `useLocalGame` (computer levels 1–5, pass & play with
auto-flip, AI opponent: provider/persona selection, task polling, `whyIllegal` feedback retry, engine fallback,
4 personas with SVG avatars), Home/lobby with first paint from initial state and empty states, New game dialog (all
four modes), in-app settings dialog, LocalGameView/GameScreen (responsive, integer board sizing), move list + roll log,
player cards, captured pieces, game-over dialog (every reason, result bar, confetti), Rules page with live
mini-boards (translatable content in `src/rules/`), first-use AI notice. Undo in local games (roll memo).

### B2 ai-backend (SPEC §6.5, §10, §11.1–11.2, §12; GD §6.2–6.4, §8)
Build: SettingsService, AiSourceService, providers (Nextcloud TaskProcessing: `core:text2text:chat` with
`core:text2text` fallback, async schedule + poll; OpenAI-compatible with presets; Anthropic Messages API), keys
encrypted with `ICrypto` and never returned, UrlGuard (SSRF, local allow-list), usage limits, PromptBuilder
(personas, ER Appendix B/E), AnswerParser with `whyIllegal` feedback, AiController (providers, models, move, coach,
task), SettingsController, admin + personal settings pages (Vue, native look, password confirmation for secrets,
test connection, model lists). Verify end to end with a small local fake OpenAI-compatible server.

### C1 online (SPEC §14.4 online parts, §7.4 poll/move routes; GD §7.5–7.11)
Build: `useOnlineGame` + `usePoller` (adaptive intervals, hidden-tab slowdown, backoff), idempotent submit with
retries and 409 recovery, opponent roll animation, chain check with the altered-history banner, OnlineGameView,
chat (quick phrases, mute), lobby sections (your move, invitations, waiting, open challenges, recent games), draw /
resign / abort / rematch UI, fair-play UI lock (coach hidden in your running online games), Stats page with
leaderboard. Two-user end-to-end check (admin + bob).

### C2 trainer-coach (SPEC §14.8; GD §5.1–5.5)
Build: lessons L1–L11 and puzzles P01–P11 from GD §5 (exact positions via `setupPosition`, goals, lesson rolls,
stars, "try again"), trainer home with the curriculum and progress sync, CoachPanel (eval bar, hints tiers 1–2 with
arrows, threat warnings, move-quality badges), AI coach chat with move chips (graceful when AI is unavailable),
ReviewView (evaluation graph in SVG, key moments, step through moves with recorded rolls). A Vitest test proves every
lesson goal and puzzle solution with the real engine.

### D1 qa
Run every gate, write the Playwright e2e specs for the main flows (local vs computer, pass & play, AI opponent with
the fake provider, online game between two users, trainer lesson, settings pages), fix what breaks (any module),
add the Dutch translation (`l10n/nl.js` + `l10n/nl.json`), generate the App Store screenshots, and update README and
CHANGELOG to the delivered scope.
