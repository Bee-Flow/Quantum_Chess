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

## [1.0.0] - 2026-09-23

The first release: chess with superposition, measurement and entanglement, inside Nextcloud.

### Added

- **Rules version 1**: split, merge, Measure and ordinary moves; "land = roll, pass = link"; kings and pawns always
  solid; a budget of 8 arrangements per side; capture the king to win, including the "king cannot escape" rule;
  draws by agreement, bare kings, threefold repetition, the 50-move rule, no legal move and the move limit.
  Identical JavaScript and PHP engines, checked against shared test fixtures.
- **Game screen**: ghosts with exact percentages, part threads and link glyphs, the what-if view, the king-danger
  ring and the king safety net, budget pips and the possibilities panel, a move preview with the odds of every
  result, the roll animation with a plain-language explanation and "Show the other result", a move list and roll
  log; click, drag, keyboard and typed moves; six board themes, the cburnett and Letters piece sets, synthesised
  sound and haptics.
- **Online correspondence games** with other users: invitations and open challenges, 1, 3 or 7 days per move with
  reminders and quiet hours, draw offers, resignation, abort, rematch, chat with quick phrases, Elo ratings with a
  provisional period and an opt-in leaderboard, history with filters and `.qcg.json` export.
- **Fair and verifiable online play**: rolls drawn by the server when a move is applied and recorded in a hash chain,
  a check in every client, *Verify* in the review, and fair-play protection in rated games.
- **Computer opponent** with five levels, from Wobbles to The Observer, running in the browser.
- **AI opponents** with four personalities (Professor Qubit, Captain Collapse, Madame Superposa, Q-7) through
  Nextcloud AI (TaskProcessing), an organisation provider or a personal API key, with the built-in engine as a
  fallback.
- **Pass & play** with player names, automatic board flipping and a tabletop mode.
- **Trainer**: eleven interactive lessons, eleven machine-verified puzzles, a lab and achievements.
- **Coach and review**: evaluation bar, hints, threat warnings and move-quality badges; an AI coach for questions
  about the position; a post-game review with an evaluation graph, accuracy, a luck ledger and key moments.
- **Nextcloud integration**: notifications with Accept, Decline and Rematch actions for the web, mobile and desktop
  clients; a dashboard widget; navigation and tab-title counters; light, dark and high-contrast themes.
- **Settings**: in-app settings for the board, quantum display, moves, animation, sound and coach; personal settings
  for online play, notifications, AI and your data; admin settings for multiplayer, the leaderboard, AI sources,
  local AI servers and limits.
- **Privacy and security**: encrypted API keys that never reach the browser, protection against requests to internal
  addresses, rate limits, a first-use notice before any AI request, *Export my games* and *Delete my Quantum Chess
  data*, and clean-up when an account is deleted.

[Unreleased]: https://github.com/bee-flow/quantum_chess/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.0
