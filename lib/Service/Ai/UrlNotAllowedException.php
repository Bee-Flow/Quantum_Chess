<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

/**
 * A base URL that UrlGuard refuses (`400 url_not_allowed`). The message is `invalid`, `https_required` or `local`.
 */
class UrlNotAllowedException extends \RuntimeException {
}
