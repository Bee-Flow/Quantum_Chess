<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Seat;
use OCA\QuantumChess\Service\Game\Seats;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The players of a variant game by seat: who sits where, the others, the teams, who still plays and whether every
 * seat is taken.
 */
#[CoversClass(Seats::class)]
#[CoversClass(Seat::class)]
final class SeatsTest extends TestCase {
	private static function seat(int $number, ?string $uid, ?int $team = null, array $fields = []): Seat {
		$seat = new Seat();
		$seat->setGameId(7);
		$seat->setSeat($number);
		$seat->setUid($uid);
		$seat->setTeam($team);
		$seat->setAcceptedAt($uid === null ? null : 1790000000);
		foreach ($fields as $field => $value) {
			$seat->{'set' . ucfirst($field)}($value);
		}
		return $seat;
	}

	private static function bughouse(): Seats {
		return new Seats([
			self::seat(2, 'cat', 0),
			self::seat(0, 'ann', 0),
			self::seat(3, 'dan', 1, ['resignedAt' => 1790000100]),
			self::seat(1, 'ben', 1),
		]);
	}

	public function testPlayersBySeat(): void {
		$seats = self::bughouse();
		$this->assertSame([0, 1, 2, 3], array_map(fn (Seat $s) => $s->getSeat(), $seats->all()));
		$this->assertSame([2, null, null], [$seats->seatOf('cat'), $seats->seatOf('eve'), $seats->seatOf('')]);
		$this->assertSame(['ben', null], [$seats->uidOf(1), $seats->uidOf(4)]);
		$this->assertSame([true, false], [$seats->isParticipant('dan'), $seats->isParticipant('eve')]);
		$this->assertSame(['ann', 'ben', 'dan'], $seats->others('cat'));
		$this->assertSame([0, 1], [$seats->teamOf(2), $seats->teamOf(3)]);
		$this->assertSame(['ann', 'ben', 'cat', 'dan'], $seats->uids());
	}

	public function testWhoStillPlays(): void {
		$seats = self::bughouse();
		$this->assertSame([0, 1, 2], $seats->playing());
		$seats->get(1)?->setOutAt(1790000200);
		$this->assertSame([0, 2], $seats->playing());
	}

	public function testFullOnlyWhenEverySeatIsTaken(): void {
		$this->assertTrue(self::bughouse()->isFull());
		$open = new Seats([self::seat(0, 'ann'), self::seat(1, null)]);
		$this->assertFalse($open->isFull());
		$this->assertSame(['ann', null], $open->uids());
		$this->assertSame([], $open->others('ann'));
		$invited = new Seats([self::seat(0, 'ann'), self::seat(1, 'ben', null, ['acceptedAt' => null])]);
		$this->assertFalse($invited->isFull());
		$this->assertFalse((new Seats([]))->isFull());
	}
}
