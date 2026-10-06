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
 * One seat of an online variant game (docs/development/online-variants.md): seat `seat` plays side `seat` of the
 * variant.
 *
 * `uid` is null while an open seat waits for a player, and after the player's account was deleted. `team` is the
 * team of a team game (null when every seat plays for itself). `acceptedAt` is when the player took the seat,
 * `resignedAt` when they resigned and `outAt` when they left the game in any other way (their king was taken or their
 * time ran out in a free-for-all). `drawVote` is 1 while the seat agrees to a draw, `mute` 1 while the player mutes
 * the chat, and `lastSeenPly` the ply the player last saw.
 *
 * @method int getGameId()
 * @method void setGameId(int $v)
 * @method int getSeat()
 * @method void setSeat(int $v)
 * @method string|null getUid()
 * @method void setUid(?string $v)
 * @method int|null getTeam()
 * @method void setTeam(?int $v)
 * @method int|null getAcceptedAt()
 * @method void setAcceptedAt(?int $v)
 * @method int|null getResignedAt()
 * @method void setResignedAt(?int $v)
 * @method int|null getOutAt()
 * @method void setOutAt(?int $v)
 * @method int getDrawVote()
 * @method void setDrawVote(int $v)
 * @method int getMute()
 * @method void setMute(int $v)
 * @method int|null getLastSeenPly()
 * @method void setLastSeenPly(?int $v)
 */
class Seat extends Entity {
	protected $gameId;
	protected $seat;
	protected $uid;
	protected $team;
	protected $acceptedAt;
	protected $resignedAt;
	protected $outAt;
	protected $drawVote = 0;
	protected $mute = 0;
	protected $lastSeenPly;

	public function __construct() {
		foreach (['id', 'gameId', 'seat', 'team', 'acceptedAt', 'resignedAt', 'outAt', 'drawVote', 'mute',
			'lastSeenPly'] as $field) {
			$this->addType($field, Types::INTEGER);
		}
	}

	/** Whether the seat still plays: it has not resigned and is not out. */
	public function isPlaying(): bool {
		return $this->resignedAt === null && $this->outAt === null;
	}
}
