<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Player;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Rating;
use OCA\QuantumChess\Db\RatingMapper;
use OCA\QuantumChess\Db\VariantRating;
use OCA\QuantumChess\Db\VariantRatingMapper;
use OCA\QuantumChess\Service\Player\RatingService;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Elo ratings and result counts, of classic Quantum Chess and per chess variant.
 */
#[CoversClass(RatingService::class)]
final class RatingServiceTest extends TestCase {
	public function testDeltaKSwitchRoundingAndFloor(): void {
		$this->assertSame(20, RatingService::delta(1200, 1200, 1.0, 0));
		$this->assertSame(-20, RatingService::delta(1200, 1200, 0.0, 9));
		$this->assertSame(10, RatingService::delta(1200, 1200, 1.0, 10), 'K = 20 from the 10th rated game on');
		$this->assertSame(0, RatingService::delta(1200, 1200, 0.5, 3));
		// E = 1/(1+10^(-200/400)) = 0.7597 → 40 * (0.5 - 0.7597) = -10.39 → -10
		$this->assertSame(-10, RatingService::delta(1400, 1200, 0.5, 0));
		$this->assertSame(0, RatingService::delta(100, 1500, 0.0, 0), 'floor at 100');
		$this->assertSame(-10, RatingService::delta(110, 110, 0.0, 0), 'a loss never goes below the floor');
	}

	public function testApplyResultUpdatesBothRowsAndTheGame(): void {
		$rows = [];
		$calls = [];
		$mapper = $this->ratingMapper($rows, $calls);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		$service = new RatingService(
			$mapper,
			$this->createMock(VariantRatingMapper::class),
			$this->createMock(GameMapper::class),
			$time,
		);

		$bob = new Rating();
		$bob->setUid('bob');
		$bob->setRating(1300);
		$bob->setPeak(1300);
		$bob->setRatedGames(12);
		$rows['bob'] = $bob;

		$game = new Game();
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(1);
		$game->setResult('1-0');
		$service->applyResult($game);

		$alice = $rows['alice'];
		// alice: K 40, E = 1/(1+10^(100/400)) = 0.3599 → +25.6 → +26; bob: K 20, → -12.8 → -13
		$this->assertSame(1226, $alice->getRating());
		$this->assertSame(1287, $bob->getRating());
		$this->assertSame([26, -13], [$game->getRatingWDelta(), $game->getRatingBDelta()]);
		$this->assertSame([1200, 1300], [$game->getRatingWBefore(), $game->getRatingBBefore()]);
		$this->assertSame(
			[1, 0, 1, 1],
			[$alice->getWins(), $alice->getLosses(), $alice->getGames(), $alice->getRatedGames()],
		);
		$this->assertSame([0, 1, 13], [$bob->getWins(), $bob->getLosses(), $bob->getRatedGames()]);
		$this->assertSame(1226, $alice->getPeak());
		$this->assertSame(['insert alice', 'lock alice', 'lock bob', 'update alice', 'update bob'], $calls);

		// Rows are locked and written in ascending uid order whatever the colours (no lock-order deadlock).
		$calls = [];
		$game = new Game();
		$game->setWhiteUid('bob');
		$game->setBlackUid('alice');
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(0);
		$game->setResult('1-0');
		$service->applyResult($game);
		$this->assertSame(['lock alice', 'lock bob', 'update alice', 'update bob'], $calls);
		$this->assertSame(
			[1, 2, 13],
			[$bob->getWins(), $bob->getGames(), $bob->getRatedGames()],
			'unrated: counts only',
		);
	}

	/**
	 * A RatingMapper over `$rows` that logs inserts, locks and updates.
	 *
	 * @param array<string, Rating> $rows
	 * @param list<string> $calls
	 */
	private function ratingMapper(array &$rows, array &$calls): RatingMapper {
		$mapper = $this->createMock(RatingMapper::class);
		$mapper->method('findByUid')->willReturnCallback(function (string $uid) use (&$rows) {
			return $rows[$uid] ?? null;
		});
		$mapper->method('insertIfMissing')->willReturnCallback(
			function (string $uid, int $start, int $now) use (&$rows, &$calls): void {
				$calls[] = 'insert ' . $uid;
				if (!isset($rows[$uid])) {
					$row = new Rating();
					$row->setUid($uid);
					$row->setRating($start);
					$row->setPeak($start);
					$row->setUpdatedAt($now);
					$rows[$uid] = $row;
				}
			},
		);
		$mapper->method('lock')->willReturnCallback(function (string $uid) use (&$calls): void {
			$calls[] = 'lock ' . $uid;
		});
		$mapper->method('update')->willReturnCallback(function (Rating $row) use (&$calls) {
			$calls[] = 'update ' . $row->getUid();
			return $row;
		});
		return $mapper;
	}

	public function testUnratedGamesOnlyCount(): void {
		$rows = [];
		$calls = [];
		$mapper = $this->ratingMapper($rows, $calls);
		$service = new RatingService(
			$mapper,
			$this->createMock(VariantRatingMapper::class),
			$this->createMock(GameMapper::class),
			$this->createMock(ITimeFactory::class),
		);
		$game = new Game();
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(0);
		$game->setResult('1/2-1/2');
		$service->applyResult($game);
		$this->assertSame(
			[1200, 1, 0],
			[$rows['alice']->getRating(), $rows['alice']->getDraws(), $rows['alice']->getRatedGames()],
		);
		$this->assertNull($game->getRatingWDelta());
	}

	/**
	 * A VariantRatingMapper over `$rows` (by `uid|variant`) that logs inserts, locks and updates.
	 *
	 * @param array<string, VariantRating> $rows
	 * @param list<string> $calls
	 */
	private function variantMapper(array &$rows, array &$calls): VariantRatingMapper {
		$mapper = $this->createMock(VariantRatingMapper::class);
		$mapper->method('find')->willReturnCallback(function (string $uid, string $variant) use (&$rows) {
			return $rows[$uid . '|' . $variant] ?? null;
		});
		$mapper->method('insertIfMissing')->willReturnCallback(
			function (string $uid, string $variant, int $start, int $now) use (&$rows, &$calls): void {
				$calls[] = 'insert ' . $uid . ' ' . $variant;
				$row = new VariantRating();
				$row->setUid($uid);
				$row->setVariant($variant);
				$row->setRating($start);
				$row->setPeak($start);
				$row->setUpdatedAt($now);
				$rows[$uid . '|' . $variant] ??= $row;
			},
		);
		$mapper->method('lock')->willReturnCallback(function (string $uid, string $variant) use (&$calls): void {
			$calls[] = 'lock ' . $uid . ' ' . $variant;
		});
		$mapper->method('update')->willReturnCallback(function (VariantRating $row) use (&$calls) {
			$calls[] = 'update ' . $row->getUid() . ' ' . $row->getVariant();
			return $row;
		});
		$mapper->method('findByUid')->willReturnCallback(function (string $uid) use (&$rows) {
			return array_values(array_filter($rows, fn (VariantRating $r) => $r->getUid() === $uid));
		});
		return $mapper;
	}

	public function testVariantGamesCountInTheVariantsOwnRatings(): void {
		$rows = [];
		$calls = [];
		$vrows = [];
		$vcalls = [];
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		$service = new RatingService(
			$this->ratingMapper($rows, $calls),
			$this->variantMapper($vrows, $vcalls),
			$this->createMock(GameMapper::class),
			$time,
		);
		$game = new Game();
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(1);
		$game->setResult('1-0');
		$game->setVariant('kriegspiel');
		$service->applyResult($game);
		$this->assertSame([[], []], [$rows, $calls], 'the classic ratings stay as they are');
		$this->assertSame(
			[1220, 1180],
			[$vrows['alice|kriegspiel']->getRating(), $vrows['bob|kriegspiel']->getRating()],
		);
		$this->assertSame([20, -20], [$game->getRatingWDelta(), $game->getRatingBDelta()]);
		$this->assertSame([
			'insert alice kriegspiel', 'lock alice kriegspiel', 'insert bob kriegspiel', 'lock bob kriegspiel',
			'update alice kriegspiel', 'update bob kriegspiel',
		], $vcalls);
		$this->assertSame(1220, $service->getVariant('alice', 'kriegspiel')['rating'] ?? null);
		$this->assertSame(
			[['variant' => 'kriegspiel', 'rating' => 1220, 'ratedGames' => 1, 'wins' => 1]],
			array_map(fn (array $v) => [
				'variant' => $v['variant'],
				'rating' => $v['rating'],
				'ratedGames' => $v['ratedGames'],
				'wins' => $v['wins'],
			], $service->variantRatings('alice')),
		);

		$atomic = new Game();
		$atomic->setWhiteUid('bob');
		$atomic->setBlackUid('alice');
		$atomic->setStatus(Game::STATUS_FINISHED);
		$atomic->setRated(0);
		$atomic->setResult('1/2-1/2');
		$atomic->setVariant('atomic');
		$service->applyResult($atomic);
		$this->assertSame([1200, 1, 0], [
			$vrows['bob|atomic']->getRating(),
			$vrows['bob|atomic']->getDraws(),
			$vrows['bob|atomic']->getRatedGames(),
		], 'an unrated variant game only counts');
	}

	public function testGamesOfFourCountNowhere(): void {
		$rows = [];
		$calls = [];
		$vrows = [];
		$vcalls = [];
		$service = new RatingService(
			$this->ratingMapper($rows, $calls),
			$this->variantMapper($vrows, $vcalls),
			$this->createMock(GameMapper::class),
			$this->createMock(ITimeFactory::class),
		);
		$game = new Game();
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setRated(0);
		$game->setResult('*');
		$game->setVariant('fourplayer');
		$game->setSeatCount(4);
		$service->applyResult($game);
		$this->assertSame([[], [], [], []], [$rows, $calls, $vrows, $vcalls]);
	}
}
