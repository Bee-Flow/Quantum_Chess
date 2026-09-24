<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Screenshots

The App Store listing (`appinfo/info.xml`) and the README show these images. They are produced, not drawn: a script
seeds a demo on a running Nextcloud and captures every screen with Playwright, so they always show the current app.

| File | Shows | Viewport |
|---|---|---|
| `01-game-ghosts.png` | Mid-game in the light theme: a split knight with its percentages, a link thread, the king ring and budget pips | desktop |
| `01-game-ghosts-small.png` | The same, as the App Store's small thumbnail | thumbnail |
| `02-roll.png` | The roll: the odds card, the roll animation and the result chip with its explanation | desktop |
| `03-lobby-dashboard.png` | The lobby with games, an invitation and an open challenge, next to the dashboard widget | desktop |
| `04-trainer.png` | A trainer lesson with its board, task and hint | desktop |
| `05-ai-opponent.png` | A game against an AI opponent with a persona comment | desktop |
| `06-dark.png` | A game in the dark theme | desktop |
| `07-phone.png` | The game screen on a phone | phone |

## Producing them

```sh
QC_BASE_URL=http://127.0.0.1:8080 QC_NC_ROOT=/path/to/nextcloud npm run screenshots
```

`npm run screenshots` runs `tools/screenshots/screenshots.mjs` (set `QC_CHROMIUM` to use an installed Chromium). It
plays the local games through the board with forced rolls, seeds the online lobby through the API
(`tools/screenshots/seed-demo.mjs`: it ends the pending invitations and running games of the demo users from
`tests/e2e/README.md` and creates a fresh set), lets a local fake OpenAI-compatible server answer as the AI opponent,
and writes the eight files above into this directory, replacing the old ones. Review the images before committing
them.

## Rules for the images

- **Sizes**: desktop 1440 × 900 CSS pixels at device scale factor 1; phone 390 × 844 at scale 2; the small thumbnail
  720 × 450 (the desktop image scaled down).
- **Content**: the default theme and board theme, English, no personal names other than the demo users, no real API
  keys or server addresses, no browser chrome.
- **Format**: PNG, losslessly optimised (for example `oxipng -o 4 --strip safe *.png`), under 1 MB each.
- The App Store loads them from `raw.githubusercontent.com/bee-flow/quantum_chess/main/screenshots/…`, so a change
  becomes visible there as soon as it is on `main`, without a release. Keep the file names: they are referenced by
  `info.xml`.
