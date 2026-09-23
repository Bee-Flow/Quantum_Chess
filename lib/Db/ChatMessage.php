<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

/**
 * A chat line of an online game (docs/SPEC.md §5.3).
 *
 * @method int getGameId()
 * @method void setGameId(int $v)
 * @method string|null getUid()
 * @method void setUid(?string $v)
 * @method int getKind()
 * @method void setKind(int $v)
 * @method string getMessage()
 * @method void setMessage(string $v)
 * @method string|null getParams()
 * @method void setParams(?string $v)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $v)
 */
class ChatMessage extends Entity {
	public const KIND_TEXT = 0;
	public const KIND_SYSTEM = 1;
	public const KIND_PHRASE = 2;

	protected $gameId;
	protected $uid;
	protected $kind;
	protected $message;
	protected $params;
	protected $createdAt;

	public function __construct() {
		foreach (['id', 'gameId', 'kind', 'createdAt'] as $field) {
			$this->addType($field, Types::INTEGER);
		}
	}
}
