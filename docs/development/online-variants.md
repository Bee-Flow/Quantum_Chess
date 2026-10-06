<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Online play for the chess variants

**Status:** proposed, tracked in [issue #12](https://github.com/Bee-Flow/Quantum_Chess/issues/12). Phase 1 is in
progress.

This document is the plan for playing the chess variants online, the four-player ones included, instead of only as
pass & play or against the computer. It describes the trust model, the data model, the changes to the backend and
the web app, and the phases in which the work ships. Once a phase is done, its part moves into
[`architecture.md`](architecture.md) and [`api.md`](api.md), and this document keeps only what is still open.

## 1. Where we start

- **Online play is classic only.** The server is authoritative: it checks a move with the PHP rules engine
  (`lib/Engine/Engine.php`), draws its roll `u` in `[0, 2^24)` with a CSPRNG (`RandomSource::drawU`), applies it and
  extends a hash chain. Clients replay the moves with the JavaScript engine and check the chain
  (`src/online/chainCheck.js`).
- **The variants are local only.** They run on a quantum layer that exists in JavaScript only
  (`src/variants/core/quantum.js`, section 5.6 of [`architecture.md`](architecture.md)). Porting about 14,000 lines
  of variant rules to PHP, and keeping two copies byte for byte identical as the classic engine does, is not
  realistic.
- **Online play assumes two seats.** The `white_uid`/`black_uid` columns and the paired `_w`/`_b` columns, a one-letter
  `turn`, the `1-0`/`0-1` results, `Game::colorOf`, `opponentOf` and `otherColor`, the chain seed made from two user
  ids, pairwise Elo, the notifications, the dashboard widget, the serializer and `src/online/onlinePlayers.js`.

Three properties of the quantum layer make online play possible without a server copy of the rules:

1. A move is one JSON-safe string (`e2-e4`, `f-t1|t2`, `?s`, `submit`).
2. Every function is pure. Given a state, a move and a number `r` in `[0, 1)`, `applyMove` always gives the same
   outcome (`pickBranch` takes `floor(r * T)` with `T = 2^24`).
3. The layer runs in Node as well as in the browser, which the unit tests already rely on.

So the server can draw the dice while the browsers compute the rules.

## 2. Trust model: the server rolls, the clients rule

The server stays authoritative for **who moves, when, and what the dice say**. Every client replays the whole game and
checks the rules.

1. A player sends a move: `{ply, code, clientId, thinkMs}`.
2. The server checks the seat to move, the ply and the `rev` lock, and only then draws `u`. The mover cannot choose
   its dice, because it has committed to the move before they are drawn.
3. The server stores the move with `u` and extends the variant chain (section 3.3), then answers with `u`.
4. The mover's browser plays `applyMove(V, state, code, u / T)` and settles the move:
   `{nextSeat, result, stateHash}`. The server cannot check that claim; it records it, and only then does the turn pass
   to `nextSeat`. If the mover leaves between the two calls, any other seat can settle the move, because the outcome is
   the same for everyone. A settlement that differs from an earlier one opens a dispute.
5. Every other browser replays the move and compares: the move must be legal, and the state hash, the next seat and
   the result must match. On a mismatch it opens a dispute, which ends the game as **annulled**: unrated, with a
   system line in the chat and a mark that administrators can see.

Cheating with the rules is therefore detected rather than prevented. Variant games stay unrated until a server-side
referee exists (phase 5). Cheating with the dice, the main way to cheat in quantum chess, is impossible as before.

### Which variants

| Group | Variants | Online |
|---|---|---|
| Two players, open information | Chess960, Atomic, Crazyhouse, Antichess, King of the Hill, Three-check, Horde, Hexagonal, Capablanca, Shogi, Xiangqi, Makruk, Raumschach, Tri-Dimensional, 4D | Phase 2 |
| Several moves per turn | 5D chess with multiverse time travel | Phase 2: every move is its own ply, and only *Submit turn* passes the turn |
| Four players | Four-player chess (free for all and teams), Bughouse | Phase 3 |
| Hidden information | Kriegspiel, Dark chess | Not before phase 5. Replaying needs the full state, which would show every hidden piece. They stay pass & play and against the computer, and the New game dialog says why. |

## 3. Data model

The migration adds tables and columns and renames nothing, so the stable contracts of section 10 of
[`architecture.md`](architecture.md) hold. Classic games do not change.

### 3.1 `qchess_games`

New columns: `variant` (string, 32; null for classic Quantum Chess), `variant_options` (text, JSON) and `seat_count`
(small integer, default 2). Every classic code path refuses a game whose `variant` is not null. In a two-player
variant game, `white_uid` and `black_uid` also hold seats 0 and 1, so `havePlayed`, the lobby queries and `removeUser`
keep working. The `state` column holds only what the server needs (the seat to move), never a board.

### 3.2 `qchess_seats`

One row per seat of a variant game, and the source of truth for its players: `game_id`, `seat`, `uid`, `team`,
`accepted_at`, `resigned_at`, `out_at`, `draw_vote`, `mute`, `last_seen_ply`. Unique on `(game_id, seat)`, indexed on
`uid`.

### 3.3 `qchess_vmoves` and the variant chain

The moves of a variant game: `game_id`, `ply`, `seat`, `uid`, `code` (text), `u`, `next_seat`, `result`,
`state_hash`, `settled_by`, `chain`, `client_id`, `think_ms`, `created_at`. Unique on `(game_id, ply)` and
`(game_id, client_id)`. It is separate from `qchess_moves`, whose `code` holds 16 characters and whose rows the server
has applied.

The chain has its own versioned format, so the classic `chainStart` stays as it is:

```
chain_0 = sha256("qchess-vchain|v1|" + id + "|" + variant + "|" + options + "|" + uid_0 + "|" + … + "|" + createdAt)
chain_n = sha256(chain_(n-1) + "|" + ply + "|" + seat + "|" + code + "|" + u)
```

`options` is the canonical JSON of the variant options (keys sorted). A seat without a player contributes an empty
string.

## 4. Backend

| Piece | Change |
|---|---|
| `lib/Db/Seat.php`, `SeatMapper.php`, `VariantMove.php`, `VariantMoveMapper.php` | New entities and mappers, in the style of `GameMapper` and `MoveMapper` |
| `lib/Service/Game/Seats.php` | The seat helpers that replace the white/black ones in variant games: `seatOf`, `uidOf`, `others`, `teamOf`, `isParticipant` |
| `lib/Service/Game/VariantCatalog.php` | The data of `src/variants/catalog.js` that the server needs (id, seats, online or not, teams), with a parity test |
| `lib/Service/Game/VariantChain.php` | The chain of section 3.3, with a parity test against `src/online/vchain.js` |
| `lib/Service/Game/VariantGameplayService.php` | `move` (draws `u`), `settle`, `dispute`, `resign`, `drawVote` (a draw when every seat still playing agrees) and `abort` (before every seat has moved), on `GameTransaction`, `GameRepository::save`, `RandomSource` and `GameConflictException` |
| `InvitationService`, `InvitePolicy` | A variant, its options and one invitee per extra seat, or open seats. Each invitee answers on their own, and the game starts when every seat is taken. Seats are drawn at random unless the creator chose one. |
| `GameClock`, `GameLifecycle`, `GameMaintenanceService` | The seat to move times out. With two seats the other one wins; in a free-for-all the seat is out and play goes on while two remain; in teams the team loses. A deleted user resigns their seat. |
| `NotificationService`, `Notifier`, `GamesWidget` | Through `Seats`: the variant name and every other player ("Your move in Bughouse against A, B and C") |
| `GameSerializer`, routes, controllers | `variant`, `options`, `seats`, `mySeat`, `seatToMove` and `vmoves`; new routes under `/api/games/{id}/v/` for `moves`, `moves/{ply}/settle`, `dispute` and `draw-vote`, while show, poll, chat, mute, accept, decline, cancel, join and resign are shared |
| Ratings | Variant games are unrated: `RatingService` and `StatsService` skip them |

## 5. Web app

| Piece | Change |
|---|---|
| `src/variants/replay.js` | `replayOnline(V, start, moves)`: plays every stored move with its `u` and reports the first claim that does not match. Snapshots every few plies keep long 5D games from replaying from the start. |
| `src/online/vchain.js` | The variant chain in the browser, and its check (the counterpart of `chainCheck.js`, with its own storage key) |
| `src/online/composables/useOnlineVariantGame.js` | Polling as in `useOnlineGame`, and a sender for move, `u` and settlement, with idempotent `clientId`, settling for a player who left, and disputes |
| `useVariantGame`, `VariantGameView.vue` | A host seam, as `LocalGameHost` and `OnlineGameHost` have for classic games. The local host keeps `Math.random` and the roll memo. The online host sends the move and waits for `u`, and has no undo. The board turns to the player's seat. |
| `VariantsView.vue` | *Online* as an opponent, an opponent picker per extra seat (or an open seat), and the teams |
| Lobby | Variant games with the variant's name and every player, linking to `/variants/:variant/online/:id` |

## 6. Phases

Each phase is its own pull request and can ship on its own.

1. **Foundations.** The migration, entities and mappers, `Seats`, `VariantCatalog` and `VariantChain` with their
   parity tests, and `replayOnline` with its tests. No routes and no screens yet.
2. **Two-player variants online**, 5D chess included: invitations with one opponent, move, settlement, dispute,
   resignation, draws, abort, time-outs, notifications, the lobby, the dashboard and the online game screen.
3. **Four seats**, for Four-player chess and Bughouse: several invitees and open seats, choosing seats and teams,
   results per team, players out in a free-for-all, draws by vote of every seat, and who is to move in the lobby, the
   notifications and the widget.
4. **Ratings and rematches**: an Elo rating per player and variant for the two-player variants, a variant filter on
   the leaderboard, and rematches that rotate the seats.
5. **A referee on the server** (optional): the JavaScript quantum layer running on the server, for example as a
   Nextcloud AppAPI external app. It would hold the real state, check every move and send each player only their own
   view. That opens online play to Kriegspiel and Dark chess and makes rated multiplayer games fair. It is the first
   runtime dependency beyond PHP, so it needs its own issue first ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)).

## 7. Risks

- **Replay time.** A 5D state with 64 worlds is about 3.4 MB of JSON, and a move can take tens of milliseconds. The
  snapshots make catching up incremental, and `npm run bench` gets a 200-ply 5D replay.
- **The same result in every browser.** The layer counts in integers (`T = 2^24`) and keeps the worlds in a canonical
  order, and `u / T` is exact in a double. A fixture of fixed games with their `u` and the state hash after every ply
  guards it.
- **Different app versions.** Two browsers with different rules would disagree. The game stores the rules version of
  the app that created it, and a browser with another version asks the player to update instead of settling or
  disputing.

## 8. Verification

- `make lint` and `make test` for every phase, with PHP tests of seats, the catalog, the chain and the gameplay service
  (turn order through settlement, `u` drawn after the move, conflicts on `rev`, time-outs for two seats, a free-for-all
  and teams, disputes), and JavaScript tests of the replay (fixtures, snapshots, a mismatch found at the right ply),
  the chain and the catalog parity.
- `make e2e`: two players finish an Atomic game; four players play a free-for-all in which one resigns and the game
  goes on; a forged settlement annuls the game; and the API tests cover the new routes.
