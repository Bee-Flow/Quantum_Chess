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

## [2.0.0] - 2026-09-26

Quantum Chess 2: twenty chess variants with the quantum element of the classic game, led by 5D chess with multiverse
time travel. The variants are played on your own device; online play, ratings and the rules engine of classic Quantum
Chess are unchanged.

### Added

- **Multiverse chess (5D)**, the quantum version of *5D Chess With Multiverse Time Travel*: timelines as rows and time
  as columns; pieces that travel back in time and to other timelines, where a move onto an older board opens a new
  timeline (up to three per player, an option); turns with a move on every must-move board of the present, ended by
  *Submit turn*; every official piece (unicorn, dragon, princess, brawn, common king and royal queen) and all 21
  official start positions, *Small* (5 × 5) by default. Boards are certain and pieces are quantum: ghosts, twins and
  links on every board, the past included. A turn that cannot be finished ends the game as checkmate or stalemate, and a
  move that would strand your own turn asks first.
- **Nineteen more chess variants**, grouped as in the app:
  - *Other dimensions*: 3D chess (Raumschach), Tri-Dimensional chess and 4D chess.
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
  the board responsive while it thinks. In the hidden-information variants it sees only what its own side may see.
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

[Unreleased]: https://github.com/bee-flow/quantum_chess/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v2.0.0
[1.0.3]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.3
[1.0.2]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.2
[1.0.1]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.1
[1.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.0
