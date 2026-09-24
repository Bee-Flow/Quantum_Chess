<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

## Summary

<!-- What does this change and why? Link the issue it resolves, e.g. "Fixes #123". -->

## Screenshots

<!-- For visible changes: before and after, light and dark theme, and a phone width where it matters. -->

## Checklist

- [ ] `make lint` and `make test` pass locally (`npm run build` too for frontend changes), see `CONTRIBUTING.md`
- [ ] Rules behaviour follows `docs/engine-rules.md`; engine changes keep the JS and PHP engines identical on the fixtures
  (`npm run fixtures` leaves no diff)
- [ ] New or changed user-visible text uses `t('quantumchess', …)` / `n(…)` (JS) or `IL10N` (PHP), in sentence case
- [ ] Keyboard, screen reader and reduced motion still work for the changed UI
- [ ] New files carry an SPDX header; new dependencies were discussed in an issue first
- [ ] `CHANGELOG.md` has an entry under *Unreleased* for user-facing changes
- [ ] Tests added or updated
