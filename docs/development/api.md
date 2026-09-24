<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# HTTP API

This document describes the HTTP API of Quantum Chess: the routes of [`appinfo/routes.php`](../../appinfo/routes.php),
their parameters and JSON shapes, the error codes, and the database schema behind them. The web app is the only
client the API is designed for, but everything here is stable: routes, parameter names, JSON field names and error
codes do not change without a versioned decision (see [`architecture.md`](architecture.md), section 10).

## Contents

1. [Conventions](#1-conventions)
2. [Errors](#2-errors)
3. [Data objects](#3-data-objects)
4. [Routes](#4-routes)
5. [Notification actions (OCS)](#5-notification-actions-ocs)
6. [Database schema](#6-database-schema)

## 1. Conventions

- **Web routes** live under `/index.php/apps/quantumchess/` (or `/apps/quantumchess/` with pretty URLs). The web
  app builds their URLs with `generateUrl('/apps/quantumchess/api/…')` and calls them with `@nextcloud/axios`, which
  sends the CSRF request token.
- **OCS routes** live under `/ocs/v2.php/apps/quantumchess/api/v1/`. They exist only for the actions of notifications
  (section 5) and need the header `OCS-APIRequest: true`.
- Every route needs a logged-in user. All routes except the admin settings are available to every user
  (`#[NoAdminRequired]`). Only the app page and the share link skip the CSRF check (`#[NoCSRFRequired]`), because
  they are browser navigations.
- Request bodies are JSON (`Content-Type: application/json`). Nextcloud maps the top-level keys of the body and the
  query parameters to the parameters of the controller action, so **parameter names are part of the API**.
- Times are Unix seconds. Responses that describe time-dependent state include `now` (the server time), so that
  clients can correct their clock for deadlines.
- Colours are `"w"` and `"b"`. Squares in engine data are indices 0–63 (`a1` = 0, `h8` = 63), as defined in
  [`docs/engine-rules.md`](../engine-rules.md) §2.1.
- **Rate limits** are per user and use `#[UserRateLimit]`. Nextcloud answers a request over the limit with `429` and
  its own body; the app's own limits (LLM requests) answer `429` with an app error code and a `Retry-After` header.
  Clients treat every `429` alike.
- For manual testing, basic auth plus `OCS-APIRequest: true` also satisfies the CSRF check of web routes:

  ```sh
  curl -u bob:password -H 'OCS-APIRequest: true' http://localhost:8080/index.php/apps/quantumchess/api/games
  ```

## 2. Errors

An error answers with an HTTP status and this body:

```json
{"error": "not_your_turn", "message": "It is not your turn.", "…": "extra fields of the code"}
```

`error` is a stable code from the list below; `message` is a translated text for the user. Clients branch on
`error`, never on `message`. The codes are defined by the `ApiError` enum (`lib/Exception/ApiError.php`), and each
code always comes with the same HTTP status.

| Code | Status | Used by | Extra fields |
|---|---|---|---|
| `invalid_argument` | 400 | any route with parameters | `field`: the parameter that was refused |
| `rated_needs_deadline` | 400 | create a game | |
| `rated_not_allowed` | 400 | create a game | |
| `own_challenge` | 400 | join an open challenge | |
| `illegal_move` | 400 | play a move | `reason`: a reason code of `whyIllegal()` ([`docs/engine-rules.md`](../engine-rules.md) §4.11), or `malformed` |
| `invalid_state` | 400 | LLM move and coach | `invariant`: the invariant the position breaks |
| `url_not_allowed` | 400 | provider settings, connection test | `field` |
| `multiplayer_disabled` | 403 | online game routes | |
| `open_challenges_disabled` | 403 | create or join an open challenge | |
| `not_your_turn` | 403 | play a move | `game`: the current GameLive |
| `chat_disabled` | 403 | chat | |
| `ai_unavailable` | 403 | LLM routes | `reason`: why the source is unavailable (see `GET /api/ai/providers`) |
| `not_found` | 404 | any game, task or admin-only resource | |
| `user_not_found` | 404 | create a game, rematch | |
| `already_taken` | 409 | join an open challenge | |
| `invalid_status` | 409 | game actions in the wrong status | |
| `conflict` | 409 | play a move, game actions | `game`: the current GameFull |
| `game_over` | 409 | play a move, game actions | |
| `abort_not_allowed` | 409 | abort | |
| `draw_not_allowed` | 409 | offer a draw | `availableAtPly`: the first ply at which an offer is possible again, or null |
| `no_draw_offer` | 409 | accept or decline a draw | |
| `chat_closed` | 409 | chat | |
| `too_large` | 413 | request bodies, preferences, trainer progress | |
| `too_many_open` | 429 | create an open challenge | |
| `too_many_invitations` | 429 | create an invitation | |
| `too_many_active` | 429 | create, accept, join | |
| `ai_rate_limited` | 429 | LLM move and coach | `Retry-After` header |
| `ai_busy` | 429 | LLM move and coach | `Retry-After` header |
| `upstream` | 502 | LLM routes, connection test, model list | `upstream`: the provider error class, for example `invalid_key` |
| `internal` | 500 | any route | |

A game the user does not take part in answers `404 not_found`, exactly like a game that does not exist, so game ids
cannot be probed. An unexpected server error answers `500 {"error": "internal", "message": "Internal error"}` and is
logged.

## 3. Data objects

These objects are produced by `GameSerializer` (`lib/Service/Game/GameSerializer.php`) for one viewer: `myColor`,
`yourTurn` and the `can*` flags depend on who asks. The key order is stable.

### UserRef

```json
{"userId": "bob", "displayName": "Bob Builder"}
```

A deleted account is `{"userId": null, "displayName": "Deleted user"}` (translated).

### GameSummary

Used in lists: the lobby, the history, the answers to invitations.

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
  "result": null, "resultReason": null, "winner": null, "ratingChange": null,
  "inviteMessage": null, "scopeGroup": null, "rematchOf": null, "rematchId": null,
  "createdAt": 1790000000, "updatedAt": 1790000100, "startedAt": 1790000010, "lastMoveAt": 1790000100,
  "finishedAt": null,
  "preview": [[4, "K", 100], [21, "N", 50], [23, "N", 50], [60, "k", 100]],
  "rev": 17
}
```

- `status`: `pending` (an invitation), `open` (an open challenge), `active`, `finished` or `aborted`, and for an
  invitation or challenge that never started `declined`, `cancelled` or `expired`.
- `timeControl`: `corr:1d`, `corr:3d`, `corr:7d` or `corr:none` (days per move, or no deadline).
- `colorChoice`: `w`, `b` or `r` (random), as chosen by the creator.
- `white`, `black` and `myColor` are `null` until the game starts. `opponent` is `null` for an open challenge nobody
  has joined.
- `rated` is the effective flag and stays `false` until the game starts. Invitations show `ratedRequested`;
  `unratedReason` explains a requested rated game that ended up unrated.
- `yourTurn` is true only for an `active` game in which the viewer is the side to move.
- `result`: `1-0`, `0-1`, `1/2-1/2` or `null`; `winner`: `w`, `b` or `null`; `resultReason` names the rule that
  ended the game (for example `king_captured`, `resignation`, `timeout`, `agreement`).
- `ratingChange`: `{"w": 12, "b": -12}` for a rated finished game, else `null`.
- `preview`: every occupied square as `[square, letter, percent]` (upper case for White, letters `KQRBNP`), `[]`
  before the game starts.
- `rev`: the revision of the game row. It increases with every change (section 6).

### GameLive

The game screen's view of a game: a GameSummary plus

```json
{
  "state": {"v": 1, "…": "engine state"},
  "chain": "23c8…6608",
  "drawOffer": {"by": "b", "ply": 22},
  "canOfferDraw": false, "drawAvailableAtPly": 26,
  "canAbort": false, "canResign": true, "canRematch": false,
  "ratings": {"w": {"rating": 1284, "provisional": false}, "b": {"rating": 1312, "provisional": true}},
  "ratingBefore": null,
  "muted": false, "chatCount": 5, "chatOpen": true,
  "now": 1790000200
}
```

- `state` is the engine state ([`docs/engine-rules.md`](../engine-rules.md) §2.5); `chain` is the head of the hash
  chain (§9.4).
- `drawOffer` is `null` when no draw is offered. After a declined offer, a player may offer again from
  `drawAvailableAtPly` on.
- `ratings` is `null` per side for a player without a rating. `ratingBefore` holds the ratings before a rated game
  was scored.
- `chatOpen` is false when chat is disabled, for viewers who do not play, and some days after the game ended.

### GameFull

The complete game, answered by `GET /api/games/{id}` and in `conflict` errors: a GameLive plus `startState`
(`null` for the standard start), `moves` (every MoveDTO in ply order) and `chat` (the recent ChatDTOs, oldest first).

### MoveDTO

```json
{
  "ply": 0, "color": "w", "userId": "alice", "code": "c1-h6", "notation": "Bc1xh6 {capture 50%}",
  "measurement": {"key": "capture", "u": 8388608, "captured": 23,
    "outcomes": [{"key": "move", "weight": 8388608}, {"key": "capture", "weight": 8388608}], "fallback": false},
  "chain": "23c8…6608", "stateHash": "15ec044c3e248721", "createdAt": 1790000050
}
```

`ply` is the ply **before** the move, starting at 0. `measurement` is the stored measurement record
([`docs/engine-rules.md`](../engine-rules.md) §5.5), or `null` for a move without a roll. Clients replay the moves
and recompute the chain from these fields.

### ChatDTO

```json
{"id": 305, "kind": "text", "userId": "bob", "displayName": "Bob", "message": "nice split!", "params": null,
 "createdAt": 1790000090}
```

`kind` is `text` (what the player typed), `phrase` (the key of a quick phrase: `good_luck`, `nice_split`,
`well_played`, `oops`, `thanks`, `good_game`) or `system` (the key of an event, such as `draw_offered`,
`draw_declined` or `resigned`, with `params`). Clients translate keys and show text as plain text.

### LobbyDTO

```json
{
  "rev": "u17.o4", "now": 1790000200,
  "yourTurn": [], "waiting": [], "invitations": [], "outgoing": [], "open": [], "recent": [],
  "counts": {"yourTurn": 2, "invitations": 1}
}
```

The groups hold GameSummaries: `yourTurn` (active games where the user moves, nearest deadline first), `waiting`
(active games where the opponent moves), `invitations` (incoming invitations and rematch offers), `outgoing` (the
user's own invitations and open challenges), `open` (open challenges of others the user may join) and `recent` (the
last finished or aborted games). `rev` is an opaque token that changes whenever anything in the lobby changes. The
lobby is also part of the initial state of the app page.

## 4. Routes

Paths are relative to `/index.php/apps/quantumchess`. `{id}` and `{taskId}` are integers.

### App page

| Verb | Path | Name | Description |
|---|---|---|---|
| GET | `/` | `page#index` | The single-page app. The page carries the initial states `user`, `features`, `preferences`, `lobby`, `trainerProgress` and `appVersion`, and a content security policy that allows same-origin workers. |
| GET | `/g/{id}` | `page#game` | Share link of a game: `303` redirect to `/apps/quantumchess/#/game/{id}`. |

### Online games

| Verb | Path | Name | Rate limit | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/games` | `game#index` | | | LobbyDTO |
| GET | `/api/games/summary` | `game#summary` | 3000 / 10 min | | `{rev, yourTurn, invitations, now}` with an `ETag` of `rev` |
| GET | `/api/games/open` | `game#open` | | | `{games: GameSummary[]}` |
| GET | `/api/games/history` | `game#history` | | `status` (`finished`, `aborted` or `all`), `cursor`, `limit` (1–50, default 20) | `{games: GameSummary[], next: ?string}` |
| GET | `/api/games/rated-check` | `game#ratedCheck` | 120 / 10 min | `opponent` (ignored) | `{rated: bool, reason: ?string}` |
| GET | `/api/users/recent` | `game#recentOpponents` | | | `{users: UserRef[]}` |
| POST | `/api/games` | `game#create` | 30 / h | `opponent` (user id, or `null` for an open challenge), `color` (`w`, `b`, `r`), `rated`, `timeControl`, `message`, `scopeGroup` | `{game: GameLive}` |
| GET | `/api/games/{id}` | `game#show` | | | `{game: GameFull}` |
| GET | `/api/games/{id}/poll` | `game#poll` | 3000 / 10 min | `rev`, `ply`, `chat` (the last revision, ply and chat id the client has) | `{changed: false, rev, now}` or `{changed: true, rev, now, game: GameLive, moves: MoveDTO[], chat: ChatDTO[]}` |
| POST | `/api/games/{id}/accept` | `game#accept` | 60 / min | | `{game: GameLive}` |
| POST | `/api/games/{id}/decline` | `game#decline` | 60 / min | | `{game: GameSummary}` |
| POST | `/api/games/{id}/cancel` | `game#cancel` | 60 / min | | `{game: GameSummary}` |
| POST | `/api/games/{id}/join` | `game#join` | 30 / 10 min | | `{game: GameLive}` |
| POST | `/api/games/{id}/moves` | `game#move` | 120 / min | `code`, `ply`, `clientId`, `thinkMs` | `{game: GameLive, move: MoveDTO, measurement, chain, rev, now, replayed}` |
| POST | `/api/games/{id}/resign` | `game#resign` | 60 / min | | `{game: GameLive}` |
| POST | `/api/games/{id}/abort` | `game#abort` | 60 / min | | `{game: GameLive}` |
| POST | `/api/games/{id}/draw` | `game#draw` | 60 / min | `action`: `offer`, `accept` or `decline` | `{game: GameLive}` |
| POST | `/api/games/{id}/chat` | `game#chat` | 30 / min | `message` (text) or `phrase` (a phrase key) | `{message: ChatDTO, rev}` |
| PUT | `/api/games/{id}/mute` | `game#mute` | 60 / min | `muted` | `{muted: bool}` |
| POST | `/api/games/{id}/rematch` | `game#rematch` | 30 / h | | `{game: GameLive}` |

Notes:

- **Moves are idempotent.** `ply` must equal the game's current ply, otherwise the answer is `409 conflict` with the
  current GameFull. `clientId` identifies the attempt: sending the same `clientId` again returns the stored move with
  `replayed: true` and never rolls again. The server checks, in this order: participant, idempotent retry, lazy
  deadline, status, turn, ply, legality.
- **Rolls.** For a rolled move, the server draws `u` with a CSPRNG while it applies the move. `measurement` in the
  answer is the stored record.
- **Draw offers.** Offering when the opponent has already offered accepts their offer. After a declined offer the
  same player may offer again after three of their own moves (`drawAvailableAtPly`).
- **Rematch.** The first player to ask creates an invitation with swapped colours; asking again returns the same
  invitation; when the other player asks, the rematch starts.
- **Polling.** `summary` is cheap and answers with an `ETag`, so the lobby can poll it and load `GET /api/games` only
  when `rev` changes. `poll` returns only the moves after `ply` and the chat after `chat`.

### Statistics, trainer progress and preferences

| Verb | Path | Name | Rate limit | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/stats` | `stats#mine` | | | `{online, local, ratingHistory}` |
| GET | `/api/leaderboard` | `stats#leaderboard` | | `group` | `{mode, minGames, entries, me, groups}` |
| POST | `/api/stats/local` | `stats#recordLocal` | 60 / h | `opponent` (`engine`, `llm` or `hotseat`), `level`, `persona`, `result` (`win`, `loss`, `draw`), `color` | `{local}` |
| GET | `/api/trainer/progress` | `stats#getProgress` | | | `{progress}` |
| PUT | `/api/trainer/progress` | `stats#setProgress` | 120 / 10 min | `progress` | `{progress}`: the stored progress merged with the client's |
| PUT | `/api/settings/preferences` | `preferences#update` | 120 / 10 min | `preferences` (a JSON object, stored as it is) | `{preferences}` |

- `online` holds `rating`, `provisional`, `ratedGames`, `peak`, `games`, `wins`, `losses`, `draws`, `listed`, `rank`
  and `askListing`. `local` holds `engine` (results per level, `{w, l, d}`), `llm` (results per persona) and
  `hotseat` (`{games}`).
- The leaderboard `mode` is `off`, `opt-in` or `opt-out`. Each entry has `rank`, `userId`, `displayName`, `rating`,
  `provisional`, `ratedGames`, `wins`, `losses` and `draws`.
- Trainer progress merges per lesson and puzzle: `done` is kept once set, the best `stars` and the earliest `at` win,
  `xp` takes the maximum and the later streak wins. The stored preferences are limited to 16 KiB and the trainer
  progress to 64 KiB (`413 too_large`).

### LLM opponents and the coach

| Verb | Path | Name | Rate limit | Request | Response |
|---|---|---|---|---|---|
| GET | `/api/ai/providers` | `ai#providers` | | | `{sources, default, privacyNotice}` |
| GET | `/api/ai/models` | `ai#models` | 30 / 10 min | `source` | `{models: [{id, label}], chosenByAdmin}` |
| POST | `/api/ai/move` | `ai#move` | 120 / h, plus the admin's hourly limit | see below | `200 {status: "done", move, pick, comment, mood}` or `202 {status: "pending", taskId}` |
| POST | `/api/ai/coach` | `ai#coach` | as `ai#move` | see below | `200 {status: "done", answer}` or `202 {status: "pending", taskId}` |
| GET | `/api/ai/task/{taskId}` | `ai#task` | 1200 / h | | `{status: "pending"}`, `{status: "done", kind: "move", …}`, `{status: "done", kind: "coach", answer}` or `{status: "error", error, message}` |
| DELETE | `/api/ai/task/{taskId}` | `ai#cancelTask` | 120 / h | | `{status: "cancelled"}` |
| POST | `/api/ai/notice` | `ai#ackNotice` | | `source` | `{acked}` |

- **Sources** are `nextcloud` (Nextcloud Assistant), `shared` (the organisation provider) and `personal` (the
  user's own key), always in this order. Each source object has `id`, `label`, `available` and `reason` (`disabled`,
  `no_provider`, `not_allowed`, `not_configured`, `no_key` or `cap_reached` when it is unavailable), plus details of
  the provider.
- **Move request:** `source`, `model`, `persona`, `color`, `language`, `state` (the engine state; its `turn` must
  equal `color`), `history` (`[{ply, code, key, weight}]`), `candidates` (legal moves ranked by the computer player:
  `[{code, E, tags, ok}]`), `message` (what the human said, optional), `feedback` (`{answer, reason}` when the
  previous answer was refused) and `answerMode` (`code` or `index`). The answer's `move` is a move code (or `pick` a
  1-based candidate index in `index` mode), with a `comment` and a `mood`. The server does not retry a refused
  answer; the client may retry once with `feedback`.
- **Coach request:** `source`, `model`, `language`, `state`, `history`, `analysis` (`{E, best, threats, lastMove}`
  from the computer player), `context` (`{kind, title, goal, ply}`), `player` (`{color, skill}`), `chat` (the
  conversation so far) and `question`. `answer` is Markdown.
- **Nextcloud Assistant** runs tasks asynchronously: the answer is `202 pending` with a `taskId`, and the client
  polls `GET /api/ai/task/{taskId}`. A finished task is deleted once it has been read.
- Request bodies of the LLM and settings routes are limited to 64 KiB (`413 too_large`). No user ids, names or
  server addresses are sent to a provider.

### Settings

| Verb | Path | Name | Access | Rate limit | Request | Response |
|---|---|---|---|---|---|---|
| GET | `/api/settings/personal` | `settings#getPersonal` | user | | | personal LLM settings |
| PUT | `/api/settings/personal` | `settings#setPersonal` | user | 30 / 10 min | `provider`, `apiKey`, `defaultSource` | personal LLM settings |
| GET | `/api/settings/multiplayer` | `settings#getMultiplayer` | user | | | `{invitePolicy, blocked, listed, leaderboardMode, notifications}` |
| PUT | `/api/settings/multiplayer` | `settings#setMultiplayer` | user | 60 / 10 min | `listed`, `notifications` | as GET |
| GET | `/api/settings/admin` | `settings#getAdmin` | admin | | | every admin setting, plus `presets` and `status` |
| PUT | `/api/settings/admin` | `settings#setAdmin` | admin | | any admin settings | as GET |
| PUT | `/api/settings/admin/secret` | `settings#setAdminSecret` | admin, password confirmation | | `key` (`shared_api_key`), `value` (`null` or `""` removes it) | `{hasKey, keyHint}` |
| POST | `/api/settings/test` | `settings#test` | user (scope `shared`: admin) | 10 / 10 min | `scope` (`personal` or `shared`), `preset`, `kind`, `baseUrl`, `model`, `apiKey` | `{ok, code, modelCount, models}` |

- The personal LLM settings are `allowPersonalKeys`, `provider` (`{preset, kind, baseUrl, model}`), `hasKey`,
  `keyHint` (the last four characters), `keyUnreadable`, `defaultSource`, `presets`, `localAllowlist` and `sources`.
  API keys are never returned.
- The admin settings use the keys of the `AdminSetting` enum (`lib/Service/Settings/AdminSetting.php`), for example
  `mp_enabled`, `invite_expiry_days`, `leaderboard_mode`, `shared_provider` or `local_allowlist`. An unknown key or a
  value out of range answers `400 invalid_argument` with the key as `field`. Changing the organisation provider's
  address removes its saved key.
- `invitePolicy` is always `everyone` and `blocked` is always empty; a request that tries to change them is refused
  with `400 invalid_argument`.

## 5. Notification actions (OCS)

The Accept, Decline and Rematch buttons of the app's notifications call these routes, so they also work in the
mobile and desktop clients. Paths are relative to `/ocs/v2.php/apps/quantumchess`; every route allows 60 requests
per minute.

| Verb | Path | Name | Effect |
|---|---|---|---|
| POST | `/api/v1/games/{id}/accept` | `ocs_game#accept` | Accept an invitation or a rematch offer |
| POST | `/api/v1/games/{id}/decline` | `ocs_game#decline` | Decline an invitation |
| POST | `/api/v1/games/{id}/draw-accept` | `ocs_game#drawAccept` | Accept a draw offer |
| POST | `/api/v1/games/{id}/draw-decline` | `ocs_game#drawDecline` | Decline a draw offer |
| POST | `/api/v1/games/{id}/rematch` | `ocs_game#rematch` | Ask for a rematch |

The answer is the OCS envelope with `{"game": GameSummary}` as `ocs.data`. Errors use Nextcloud's OCS exceptions
with the status of the error code and its translated message.

## 6. Database schema

The schema is created by `lib/Migration/Version1000Date20260923000000.php`. Table and column names are part of the
stable contract.

| Table | Holds | Keys and indexes |
|---|---|---|
| `qchess_games` | One row per online game: players (`creator_uid`, `opponent_uid`, `white_uid`, `black_uid`), `status`, `result`, `result_reason`, the current `state` (JSON), `ply`, `turn`, the revision `rev`, rating flags and snapshots, `time_control`, `deadline_at`, `expires_at`, the draw offer, rematch links, the head of the hash `chain`, chat counters and mute flags, and timestamps | primary key `id`; indexes on each player column with `status`, and on `status` with `deadline_at`, `expires_at` and `finished_at` |
| `qchess_moves` | One row per move: `game_id`, `ply`, `color`, `uid`, `code`, `notation`, the `measurement` record (JSON), `chain`, `state_hash`, `support_key`, `client_id`, `think_ms`, `created_at` | unique `(game_id, ply)` and `(game_id, client_id)`; index on `uid` |
| `qchess_chat` | Chat lines: `game_id`, `uid`, `kind` (text, system, phrase), `message`, `params` (JSON), `created_at` | index on `(game_id, id)` and on `uid` |
| `qchess_ratings` | One row per rated player: `rating`, `peak`, `rated_games`, `games`, `wins`, `losses`, `draws`, `listed` (leaderboard choice), `last_rated_at` | unique `uid`; index on `rating` |

- **Concurrency.** Every change to a game row increments `rev`, and a save succeeds only if `rev` still has the value
  that was read (`409 conflict` otherwise). The unique index on `(game_id, ply)` makes two concurrent moves for the
  same ply fail cleanly; the one on `(game_id, client_id)` backs the idempotent retry.
- **Reserved columns.** `start_state` (always null), `reminders` and `ext_days` (always 0) and `visibility` (always 0)
  are part of the schema but not used.
- **Per-user data** (preferences, trainer progress, local statistics, LLM settings, notification switches) lives in
  Nextcloud's user configuration of the app, and admin settings in its app configuration, not in these tables.
