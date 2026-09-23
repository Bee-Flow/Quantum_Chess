<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Translations

Quantum Chess uses Nextcloud's translation tooling. The app ships its translations in `l10n/<lang>.js` and
`l10n/<lang>.json`; this directory holds the gettext files they are made from.

```
translationfiles/
├── templates/quantumchess.pot   every translatable string (generated, never edited by hand)
├── nl/quantumchess.po           Dutch
└── de/quantumchess.po           German
```

## Workflow

1. **Extract** the strings of `src/`, `lib/`, `templates/` and `appinfo/info.xml`:
   `make l10n-pot` (needs `xgettext` from GNU gettext, and PHP). It downloads Nextcloud's
   `translationtool.phar` into `build/tools/` and writes `templates/quantumchess.pot`. Paths listed in
   `.l10nignore` (built bundles in `js/`, tests, tools) are skipped.
2. **Translate**: update `<lang>/quantumchess.po` from the template, for example with
   `msgmerge --update nl/quantumchess.po templates/quantumchess.pot`, and translate the new entries in any PO
   editor (Poedit, Lokalize, or a text editor).
3. **Convert**: `make l10n` writes `l10n/<lang>.js` and `l10n/<lang>.json`. Commit the `.po` files and the
   `l10n/` files together.

## Terminology

Every language uses one word per term of the glossary in `docs/RULES.md`. Result words, "ghost", "link", "roll"
and "possibility" carry translator comments pointing there. The terms already used in `appinfo/info.xml`:

| English | Dutch | German |
|---|---|---|
| Captured / Moved / Missed | Geslagen / Verzet / Gemist | Geschlagen / Gezogen / Verfehlt |
| ghost | spookstuk | Geist |
| split / merge / measure | splitsen / samenvoegen / meten | teilen / vereinen / messen |

Move codes such as `g1-f3|h3` are never translated.

## Transifex

`.tx/config` declares the resource `quantumchess` in Nextcloud's Transifex project, the way Nextcloud's own apps
do. Nextcloud's translation bot syncs an app only after it has been added to that project; once it is, the bot
regenerates the template, pushes it to Transifex and commits the translated `l10n/` files every night. Until then
the workflow above is the way to add or update a language.
