<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * A base URL that UrlGuard refuses. The message says why: `invalid`, `https_required` or `local`.
 */
class UrlNotAllowedException extends \RuntimeException {
}
