<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Player;

/**
 * A user document is larger than its size limit and was not stored.
 */
class DocumentTooLargeException extends \RuntimeException {
}
