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
 * One move of an online variant game (docs/development/online-variants.md).
 *
 * `ply` is the number of plies played before the move and `seat` the seat that played it. `u` is the roll the server
 * drew after the move was sent, an integer in [0, 2^24). The server does not know the rules of the variants: what the
 * move leads to is claimed by the browser that settles it (`settledBy`), as the seat to move next (`nextSeat`), the
 * result code (`result`, empty while the game goes on) and the position hash (`stateHash`); these are null until the
 * move is settled. `chain` is the variant chain after the move, and `clientId` the idempotency key of the sender.
 *
 * The properties have no defaults on purpose: Entity inserts only the fields whose setter was called with a changed
 * value, so every column of a new move is written explicitly.
 *
 * @method int getGameId()
 * @method void setGameId(int $v)
 * @method int getPly()
 * @method void setPly(int $v)
 * @method int getSeat()
 * @method void setSeat(int $v)
 * @method string|null getUid()
 * @method void setUid(?string $v)
 * @method string getCode()
 * @method void setCode(string $v)
 * @method int getU()
 * @method void setU(int $v)
 * @method int|null getNextSeat()
 * @method void setNextSeat(?int $v)
 * @method string|null getResult()
 * @method void setResult(?string $v)
 * @method string|null getStateHash()
 * @method void setStateHash(?string $v)
 * @method string|null getSettledBy()
 * @method void setSettledBy(?string $v)
 * @method int|null getSettledAt()
 * @method void setSettledAt(?int $v)
 * @method string getChain()
 * @method void setChain(string $v)
 * @method string|null getClientId()
 * @method void setClientId(?string $v)
 * @method int|null getThinkMs()
 * @method void setThinkMs(?int $v)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $v)
 */
class VariantMove extends Entity {
	protected $gameId;
	protected $ply;
	protected $seat;
	protected $uid;
	protected $code;
	protected $u;
	protected $nextSeat;
	protected $result;
	protected $stateHash;
	protected $settledBy;
	protected $settledAt;
	protected $chain;
	protected $clientId;
	protected $thinkMs;
	protected $createdAt;

	public function __construct() {
		foreach (['id', 'gameId', 'ply', 'seat', 'u', 'nextSeat', 'settledAt', 'thinkMs', 'createdAt'] as $field) {
			$this->addType($field, Types::INTEGER);
		}
	}

	/** Whether a browser has said what the move leads to. */
	public function isSettled(): bool {
		return $this->settledAt !== null;
	}
}
