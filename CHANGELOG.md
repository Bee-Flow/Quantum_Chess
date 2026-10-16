<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

All notable changes to Quantum Chess are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The Nextcloud App Store shows the section of each
release as its release notes.

## [Unreleased]

## [2.3.1] - 2026-10-16

### Changed

- New App Store screenshots, among them an online game of Four-player chess and Bee Flow Chess.

### Fixed

- The app's navigation names every opponent of a game of four under *Your move*, not only the first.

## [2.3.0] - 2026-10-16

Online games with three or four players, played live, after the feedback in issue #23.

### Added

- **Instant moves with notify_push**: when the Nextcloud app *Client Push* (notify_push) is installed, a move, a chat
  line or any other change shows on the other players' screens at once. Without it, a game that is being played live
  now checks every few seconds instead of slowing down to half a minute.
- **Sounds in the chess variants**: moves, captures and the end of the game sound as in classic Quantum Chess, online
  and on this device, following the sound setting.
- **Every player is told when a game of four starts**, and the player who moves first gets *It's your move*.

### Changed

- **No notification of your turn or of chat while the game is open** in a visible tab. It still comes when you are
  elsewhere.
- **Resigning a chess variant game asks first**, online and on this device (as the classic game does), and so does
  aborting an online variant game.
- **Declining a seat of an open challenge for four** frees the seat for someone else instead of cancelling the game.
  When a declined game is cancelled, every player who had taken a seat is told.
- **The lobby, Recent games and the dashboard** name the creator of an invitation and all opponents of a game of four,
  instead of one of them. A game you joined shows under your own games while it waits for players.

### Fixed

- The players next to the board of an online variant game all read *You*; each seat now shows its player's name.
- In a free-for-all of four, a player who was already out shared in the win when another resigned or ran out of time;
  the player who was out could also still resign, and a draw needed their vote.
- Every finished game of four showed as *Draw* in Recent games.
- Open challenges you already joined showed under *Open challenges*, where joining again failed.
- Deleting the account of the creator of a game of four deleted the game for every other player.
- The end of a game of four names who resigned or ran out of time.
- Accept and decline of a draw offer stayed visible after you agreed.
- A move that another player's move overtook now says so and updates the board, instead of *The move could not be
  sent*.
- In the chat of a game of four, your own messages showed under your name instead of *You*.
- Spectators of a variant game no longer read *Your king is in danger*.

## [2.2.0] - 2026-10-06

### Added

- **Bee Flow Chess**, a new chess variant named after Bee-Flow, the private AI workspace, at the top of the variants
  list: protect your Queen Bee. Each back rank is shuffled on its own, enemy pieces show as honeycomb cells until they
  move, and a privacy shield keeps the pieces next to the Queen Bee from being captured. Against the computer, as pass
  & play, and online with the server as the umpire and a rating of its own.

## [2.1.1] - 2026-10-06

Maintenance release.

## [2.1.0] - 2026-10-06

The chess variants go online.

### Added

- **Online play for the two-player chess variants**: 3D, 4D and 5D chess, Tri-Dimensional chess, Chess960, Atomic,
  Crazyhouse, Antichess, King of the Hill, Three-check, Horde, Hexagonal chess, Capablanca chess, Shogi, Xiangqi and
  Makruk. Choose *Online* as the opponent in a variant's New game dialog and invite someone or open a challenge. The
  server draws the dice of every move; both players' devices check every move against the rules, and if they ever
  disagree, the game is annulled.
- **Four-player chess and Bughouse online**: choose a player for every seat, or leave seats open for anyone to join,
  optionally with random seats. Each invited player answers on their own, and the game starts when every seat is taken.
  Resigning or running out of time ends the game for everyone (the other team wins, or the others share the win); a
  draw needs every player.
- **Kriegspiel and Fog of war online**, with the server as the umpire: it keeps the whole board, decides every move and
  sends each player only what they may see. In Kriegspiel a move the umpire refuses uses no turn and is not told to
  your opponent; in Fog of war you see the odds of a move before you confirm it. The whole board and every move are
  shown when the game ends. With this, all twenty chess variants can be played online.
- **A rating for every two-player variant**: rated variant games count in a rating of that variant, shown on the
  Statistics page with the leaderboard of each variant. Kriegspiel and Fog of war are rated by default; the other
  variants when you ask for it and your opponent accepts. Games of four are not rated.
- **Rematches of variant games**: the Rematch button after an online variant game; in a game of four every player
  moves on by one seat.

## [2.0.1] - 2026-10-06

Maintenance release, and the first step towards playing the chess variants online, four-player games included.

### Changed

- The database gets the tables that online games of the chess variants will use. Nothing uses them yet: the variants
  are still played on your own device, and online games of classic Quantum Chess are unchanged.
- Updated the Nextcloud components of the app.

## [2.0.0] - 2026-09-26

Quantum Chess 2: twenty chess variants with the quantum element of the classic game, led by 5D chess with multiverse
time travel. The variants are played on your own device; online play, ratings and the rules engine of classic Quantum
Chess are unchanged.

### Added

- **Multiverse chess (5D)**, the quantum version of *5D Chess With Multiverse Time Travel*: timelines as rows and time
  as columns; pieces that travel back in time and to other timelines, where a move onto an older board opens a new
  timeline (up to three per player, or four on a laptop: an option); turns with a move on every must-move board of the present, ended by
  *Submit turn*; every official piece (unicorn, dragon, princess, brawn, common king and royal queen) and 44
  official start positions, *Small* (5 × 5) by default. Boards are certain and pieces are quantum: ghosts, twins and
  links on every board, the past included. A turn that cannot be finished ends the game as checkmate or stalemate, and a
  move that would strand your own turn asks first.
- **Nineteen more chess variants**, grouped as in the app:
  - *Other dimensions*: 3D chess (Raumschach), Tri-Dimensional chess with movable attack boards and 4D chess.
  - *Hidden information*: Kriegspiel and Fog of war.
  - *Different rules*: Chess960, Atomic, Crazyhouse, Bughouse, Antichess, King of the Hill, Three-check and Horde.
  - *Different boards and more players*: Hexagonal chess, Four-player chess and Capablanca chess.
  - *Regional relatives*: Shogi, Xiangqi and Makruk.
- **The quantum rules on every board**: split, merge, Measure and ordinary moves; "land = roll, pass = link", drops
  included; kings, pawns and the pieces a variant names always solid; castling and en passant only when they are
  certain; a roll whenever the game would end in some possibilities but not in others; a budget of 8 arrangements per
  side.
- **The classic end rules** in the two-player variants with a king and one move per turn: capture the king instead of
  check, "your king cannot escape", and the bare-kings and 50-move draws, which wait while a king can be captured for
  certain; a variant with its own goal keeps it.
- **Computer player** for every variant with three levels (Easy, Normal and Hard), running in your browser and keeping
  the board responsive while it thinks. It plays the quantum moves too: splits that fork, dodge or block, merges that
  capture and measurements that settle a danger. In the hidden-information variants it sees only what its own side
  may see.
- **Pass & play** for two players, or four in Bughouse and Four-player chess, on one device; against the computer you
  take one seat and the computer plays all the others. In Kriegspiel and Fog of war each player sees only their own
  view: a hand-over screen covers the board between turns, and the whole board is revealed when the game ends.
- **Variant screens**: *Chess variants* in the navigation and on the home page, with the catalogue by category and
  your games on this device; a New game dialog for the opponent, level, side and the variant's options; a game screen
  for any board shape with the variant's rules next to the shared quantum rules, pieces in hand, the odds of every roll
  before you confirm, a numbered move list, and undo that never rolls a result again.
- **Phones and tablets**: large boards zoom with the buttons, a pinch or Ctrl + wheel and pan with a finger; 4D chess,
  Bughouse and 5D chess open on the boards you play, and the move controls stay at the bottom of the screen.
- **Languages**: the variants are in English, Dutch, German and French, like the rest of the app.

## [1.0.3] - 2026-09-25

### Changed

- The App Store page is in English only. The app itself is still in English, Dutch, German and French.

## [1.0.2] - 2026-09-25

Maintenance release.

## [1.0.1] - 2026-09-25

Maintenance release.

## [1.0.0] - 2026-09-23

The first release: chess with superposition, measurement and entanglement, inside Nextcloud.

### Added

- **Rules version 1**: split, merge, Measure and ordinary moves; "land = roll, pass = link"; kings and pawns always
  solid; a budget of 8 arrangements per side; capture the king to win, including the "king cannot escape" rule;
  draws by agreement, bare kings, threefold repetition, the 50-move rule, no legal move and the move limit.
  Identical JavaScript and PHP rules engines, checked against shared test fixtures.
- **Game screen**: ghosts with exact percentages, part threads and link glyphs, the what-if view, the king-danger
  ring and the king safety net, budget pips and the possibilities count, a move preview with the odds of every
  result, the roll animation with a plain-language explanation, a move list and roll log; click, drag and keyboard
  input; three board themes (Classic, Blue, Quantum), the cburnett pieces and synthesised sound.
- **Online correspondence games** with other users: invitations and open challenges, 1, 3 or 7 days per move, draw
  offers, resignation, abort, rematch, chat with quick phrases and mute, Elo ratings with a provisional period and an
  opt-in leaderboard, recent games on the home page.
- **Fair online play**: rolls drawn by the server when a move is applied and recorded in a hash chain, a check in
  every client with a warning when history was altered, and the coach switched off in your own running online games.
- **Computer player** with five levels, from Wobbles to The Observer, running in the browser.
- **AI opponents** with four personalities (Professor Qubit, Captain Collapse, Madame Superposa, Q-7) through
  Nextcloud AI (TaskProcessing), an organisation provider or a personal API key (OpenAI-compatible services and
  Anthropic), with the built-in computer player as a fallback.
- **Pass & play** on one device, with player names and optional automatic board flipping.
- **Trainer**: eleven interactive lessons and eleven puzzles, all verified against the real rules engine by the test
  suite.
- **Coach and review**: evaluation bar, hints, threat warnings and move-quality badges; an AI coach for questions
  about the position; a post-game review with an evaluation graph and key moments.
- **Nextcloud integration**: notifications with Accept, Decline and Rematch actions for the web, mobile and desktop
  clients; a dashboard widget; navigation and tab-title counters; light, dark and high-contrast themes.
- **Settings**: in-app settings for the board, quantum display, moves, animation, sound and coach; personal settings
  for online play, notifications and AI; admin settings for multiplayer, the leaderboard, AI sources, local AI
  servers and limits.
- **Privacy and security**: encrypted API keys that never reach the browser, protection against requests to internal
  addresses, rate limits, a first-use notice before any AI request, and clean-up when an account is deleted.
- **Languages**: English, Dutch, German and French.

[Unreleased]: https://github.com/bee-flow/quantum_chess/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.3.1
[2.3.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.3.0
[2.2.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.2.0
[2.1.1]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.1.1
[2.1.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.1.0
[2.0.1]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.0.1
[2.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.0.0
[1.0.3]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.3
[1.0.2]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.2
[1.0.1]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.1
[1.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.0
