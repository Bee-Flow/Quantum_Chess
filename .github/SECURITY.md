<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Security policy

## Supported versions

Security fixes are made for the latest release of Quantum Chess. Please update through the Nextcloud app
management page before reporting.

## Reporting a vulnerability

Please **do not** open a public issue. Report the problem privately through GitHub:
[Security → Report a vulnerability](https://github.com/bee-flow/quantum_chess/security/advisories/new).

Include the Quantum Chess and Nextcloud versions, what an attacker could do, and the steps to reproduce it. You
will receive an answer within a week. We fix confirmed problems as quickly as we can, publish an advisory
together with the release that contains the fix, and credit you unless you prefer otherwise.

Especially welcome are reports about:

- access to games, moves, chat or ratings of other users (every game endpoint must answer 404 to non-participants);
- ways to predict, choose or change the result of a roll in online games, or to alter a finished game unnoticed;
- API keys that could leak to the browser, the logs or other users;
- requests the server can be tricked into sending to internal addresses (SSRF) through AI provider settings;
- anything that lets one user find out whether another user exists without being allowed to see them.
