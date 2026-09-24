<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Translations

Quantum Chess uses Nextcloud's translation tooling. The app ships its translations in `l10n/<lang>.js` and
`l10n/<lang>.json`; this directory holds the gettext files they are made from.

```
translationfiles/
├── GLOSSARY.md                  the game terms in every language
├── templates/quantumchess.pot   every translatable string (generated, never edited by hand)
├── nl/quantumchess.po           Dutch
├── de/quantumchess.po           German (du)
├── de_DE/quantumchess.po        German, formal (Nextcloud's "Deutsch (Förmlich: Sie)"; for now the de texts)
└── fr/quantumchess.po           French
```

English is the source language: every user-visible text in `src/`, `lib/` and `templates/` is written in English
and wrapped in `t()`/`n()` (JavaScript) or `IL10N::t()`/`n()` (PHP).

## Workflow

Without extra tools (Node only):

1. `node tools/l10n.mjs extract` writes `templates/quantumchess.pot` from every `t()`/`n()` call in `src/` and every
   `IL10N` call in `lib/` and `templates/`, and lists calls whose text is not a string literal (they cannot be
   translated and must be fixed).
2. `node tools/l10n.mjs merge` adds new strings to each `<lang>/quantumchess.po` (untranslated) and keeps removed
   ones as obsolete `#~` entries.
3. Translate the empty `msgstr` entries in any PO editor (Poedit, Lokalize, or a text editor).
4. `node tools/l10n.mjs check` lists untranslated entries and placeholder mismatches; `node tools/l10n.mjs build`
   writes `l10n/<lang>.js` and `l10n/<lang>.json`. Commit the `.po` files and the `l10n/` files together.

With Nextcloud's own tool: `make l10n-pot` (needs `xgettext` from GNU gettext; downloads `translationtool.phar` into
`build/tools/`) and `make l10n` produce the same files. Paths listed in `.l10nignore` (built bundles in `js/`, tests,
tools) are skipped.

Nextcloud does not fall back from `de_DE` to `de` for apps, so both German files must stay complete
(`node tools/l10n.mjs check` checks every language, `de_DE` included).

Plural forms follow Nextcloud: Dutch and German `nplurals=2; plural=(n != 1);`, French
`nplurals=3; plural=(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;`.

## Terminology

Every language uses one word per game term. The glossary with all terms, the form of address and typography rules
is [`GLOSSARY.md`](GLOSSARY.md); `appinfo/info.xml` uses the same terms. Move codes such as `g1-f3|h3`
are never translated.

## Transifex

`.tx/config` declares the resource `quantumchess` in Nextcloud's Transifex project, the way Nextcloud's own apps
do. Nextcloud's translation bot syncs an app only after it has been added to that project; once it is, the bot
regenerates the template, pushes it to Transifex and commits the translated `l10n/` files every night. Until then
the workflow above is the way to add or update a language.
