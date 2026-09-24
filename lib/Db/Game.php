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
 * An online game: its players, status, current position, clock, draw offers, rating snapshot and chat counters.
 *
 * `rev` is the optimistic-locking revision; every change of the row increments it (see GameRepository::save()).
 * Colours are stored as `'w'` and `'b'`.
 *
 * Reserved columns, part of the schema but not used by the current version: `start_state` (a custom start position,
 * always null), `reminders` and `ext_days` (deadline reminders and extensions, always 0) and `visibility`
 * (always 0).
 *
 * @method string|null getCreatorUid()
 * @method void setCreatorUid(?string $v)
 * @method string|null getOpponentUid()
 * @method void setOpponentUid(?string $v)
 * @method string|null getWhiteUid()
 * @method void setWhiteUid(?string $v)
 * @method string|null getBlackUid()
 * @method void setBlackUid(?string $v)
 * @method string getColorChoice()
 * @method void setColorChoice(string $v)
 * @method string getStatus()
 * @method void setStatus(string $v)
 * @method string|null getResult()
 * @method void setResult(?string $v)
 * @method string|null getResultReason()
 * @method void setResultReason(?string $v)
 * @method string getState()
 * @method void setState(string $v)
 * @method string|null getStartState()
 * @method void setStartState(?string $v)
 * @method int getPly()
 * @method void setPly(int $v)
 * @method string getTurn()
 * @method void setTurn(string $v)
 * @method int getRev()
 * @method void setRev(int $v)
 * @method int getRatedRequested()
 * @method void setRatedRequested(int $v)
 * @method int getRated()
 * @method void setRated(int $v)
 * @method string|null getUnratedReason()
 * @method void setUnratedReason(?string $v)
 * @method string getTimeControl()
 * @method void setTimeControl(string $v)
 * @method int|null getDeadlineAt()
 * @method void setDeadlineAt(?int $v)
 * @method int|null getExpiresAt()
 * @method void setExpiresAt(?int $v)
 * @method int getReminders()
 * @method void setReminders(int $v)
 * @method int getExtDays()
 * @method void setExtDays(int $v)
 * @method string|null getInviteMessage()
 * @method void setInviteMessage(?string $v)
 * @method string|null getScopeGroup()
 * @method void setScopeGroup(?string $v)
 * @method string|null getDrawOffer()
 * @method void setDrawOffer(?string $v)
 * @method int|null getDrawOfferPly()
 * @method void setDrawOfferPly(?int $v)
 * @method int|null getLastDrawW()
 * @method void setLastDrawW(?int $v)
 * @method int|null getLastDrawB()
 * @method void setLastDrawB(?int $v)
 * @method int|null getRatingWBefore()
 * @method void setRatingWBefore(?int $v)
 * @method int|null getRatingBBefore()
 * @method void setRatingBBefore(?int $v)
 * @method int|null getRatingWDelta()
 * @method void setRatingWDelta(?int $v)
 * @method int|null getRatingBDelta()
 * @method void setRatingBDelta(?int $v)
 * @method int|null getRematchOf()
 * @method void setRematchOf(?int $v)
 * @method int|null getRematchId()
 * @method void setRematchId(?int $v)
 * @method string|null getChain()
 * @method void setChain(?string $v)
 * @method int getChatCount()
 * @method void setChatCount(int $v)
 * @method int getMuteW()
 * @method void setMuteW(int $v)
 * @method int getMuteB()
 * @method void setMuteB(int $v)
 * @method int getVisibility()
 * @method void setVisibility(int $v)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $v)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $v)
 * @method int|null getStartedAt()
 * @method void setStartedAt(?int $v)
 * @method int|null getLastMoveAt()
 * @method void setLastMoveAt(?int $v)
 * @method int|null getFinishedAt()
 * @method void setFinishedAt(?int $v)
 */
class Game extends Entity {
	public const STATUS_PENDING = 'pending';
	public const STATUS_OPEN = 'open';
	public const STATUS_ACTIVE = 'active';
	public const STATUS_FINISHED = 'finished';
	public const STATUS_DECLINED = 'declined';
	public const STATUS_CANCELLED = 'cancelled';
	public const STATUS_EXPIRED = 'expired';
	public const STATUS_ABORTED = 'aborted';
	public const FINAL_STATUSES = [self::STATUS_FINISHED, self::STATUS_DECLINED, self::STATUS_CANCELLED, self::STATUS_EXPIRED, self::STATUS_ABORTED];

	/** After a declined draw offer, the same player may offer again once this many plies have been played. */
	public const DRAW_COOLDOWN_PLIES = 6;

	protected $creatorUid;
	protected $opponentUid;
	protected $whiteUid;
	protected $blackUid;
	protected $colorChoice = 'r';
	protected $status = self::STATUS_PENDING;
	protected $result;
	protected $resultReason;
	protected $state = '';
	protected $startState;
	protected $ply = 0;
	protected $turn = 'w';
	protected $rev = 0;
	protected $ratedRequested = 0;
	protected $rated = 0;
	protected $unratedReason;
	protected $timeControl = 'corr:3d';
	protected $deadlineAt;
	protected $expiresAt;
	protected $reminders = 0;
	protected $extDays = 0;
	protected $inviteMessage;
	protected $scopeGroup;
	protected $drawOffer;
	protected $drawOfferPly;
	protected $lastDrawW;
	protected $lastDrawB;
	protected $ratingWBefore;
	protected $ratingBBefore;
	protected $ratingWDelta;
	protected $ratingBDelta;
	protected $rematchOf;
	protected $rematchId;
	protected $chain;
	protected $chatCount = 0;
	protected $muteW = 0;
	protected $muteB = 0;
	protected $visibility = 0;
	protected $createdAt = 0;
	protected $updatedAt = 0;
	protected $startedAt;
	protected $lastMoveAt;
	protected $finishedAt;

	public function __construct() {
		foreach (['ply', 'rev', 'ratedRequested', 'rated', 'deadlineAt', 'expiresAt', 'reminders', 'extDays', 'drawOfferPly',
			'lastDrawW', 'lastDrawB', 'ratingWBefore', 'ratingBBefore', 'ratingWDelta', 'ratingBDelta', 'rematchOf',
			'rematchId', 'chatCount', 'muteW', 'muteB', 'visibility', 'createdAt', 'updatedAt', 'startedAt', 'lastMoveAt',
			'finishedAt'] as $field) {
			$this->addType($field, Types::INTEGER);
		}
		$this->addType('id', Types::INTEGER);
	}

	public function isParticipant(string $uid): bool {
		return $uid !== '' && in_array($uid, [$this->whiteUid, $this->blackUid, $this->creatorUid, $this->opponentUid], true);
	}

	/** The colour of `$uid` once the game has started, else null. */
	public function colorOf(string $uid): ?string {
		if ($uid === '') {
			return null;
		}
		if ($this->whiteUid === $uid) {
			return 'w';
		}
		if ($this->blackUid === $uid) {
			return 'b';
		}
		return null;
	}

	public function uidOf(string $color): ?string {
		return $color === 'w' ? $this->whiteUid : $this->blackUid;
	}

	/** The other player: by colour once the game has started, else the creator or the invited opponent. */
	public function opponentOf(string $uid): ?string {
		$color = $this->colorOf($uid);
		if ($color !== null) {
			return $this->uidOf(self::otherColor($color));
		}
		if ($this->creatorUid === $uid) {
			return $this->opponentUid;
		}
		if ($this->opponentUid === $uid) {
			return $this->creatorUid;
		}
		return null;
	}

	public function isFinal(): bool {
		return in_array($this->status, self::FINAL_STATUSES, true);
	}

	/** Whether the game was played and is over: finished with a result, or aborted. */
	public function hasEnded(): bool {
		return $this->status === self::STATUS_FINISHED || $this->status === self::STATUS_ABORTED;
	}

	/** Whether the game waits for an opponent: an invitation or an open challenge. */
	public function isAwaitingOpponent(): bool {
		return $this->status === self::STATUS_PENDING || $this->status === self::STATUS_OPEN;
	}

	/** The opposite colour. */
	public static function otherColor(string $color): string {
		return $color === 'w' ? 'b' : 'w';
	}

	/**
	 * The ply from which `$color` may offer a draw again after a declined offer, or null when nothing limits it.
	 */
	public function drawAvailableAtPly(string $color): ?int {
		$last = $color === 'w' ? $this->lastDrawW : $this->lastDrawB;
		return $last === null ? null : $last + self::DRAW_COOLDOWN_PLIES;
	}
}
