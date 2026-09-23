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
 * One move of an online game (docs/SPEC.md §5.2). `ply` is the state ply before the move.
 *
 * @method int getGameId()
 * @method void setGameId(int $v)
 * @method int getPly()
 * @method void setPly(int $v)
 * @method string getColor()
 * @method void setColor(string $v)
 * @method string|null getUid()
 * @method void setUid(?string $v)
 * @method string getCode()
 * @method void setCode(string $v)
 * @method string getNotation()
 * @method void setNotation(string $v)
 * @method string|null getMeasurement()
 * @method void setMeasurement(?string $v)
 * @method string getChain()
 * @method void setChain(string $v)
 * @method string getStateHash()
 * @method void setStateHash(string $v)
 * @method string getSupportKey()
 * @method void setSupportKey(string $v)
 * @method string|null getClientId()
 * @method void setClientId(?string $v)
 * @method int|null getThinkMs()
 * @method void setThinkMs(?int $v)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $v)
 */
/* Properties have no defaults: Entity only inserts fields whose setter was called with a changed value. */
class Move extends Entity {
	protected $gameId;
	protected $ply;
	protected $color;
	protected $uid;
	protected $code;
	protected $notation;
	protected $measurement;
	protected $chain;
	protected $stateHash;
	protected $supportKey;
	protected $clientId;
	protected $thinkMs;
	protected $createdAt;

	public function __construct() {
		foreach (['id', 'gameId', 'ply', 'thinkMs', 'createdAt'] as $field) {
			$this->addType($field, Types::INTEGER);
		}
	}

	/** @return array<string, mixed>|null the stored measurement record */
	public function getMeasurementRecord(): ?array {
		if ($this->measurement === null || $this->measurement === '') {
			return null;
		}
		$record = json_decode($this->measurement, true);
		return is_array($record) ? $record : null;
	}
}
