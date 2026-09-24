<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Moves, draw offers, resignation and abort, with mocked storage and the real rules engine.
 */
#[CoversClass(GameplayService::class)]
final class GameplayServiceTest extends TestCase {
	use GameServiceFixture;

	private const NOW = GameBuilder::NOW;
	private Game $game;
	/** The move that findByClientId() returns. */
	private ?Move $storedMove = null;

	protected function setUp(): void {
		$this->setUpGames();
		$this->moveMapper->method('findByClientId')->willReturnCallback(fn () => $this->storedMove);
		$this->game = GameBuilder::active();
		$this->store($this->game);
	}

	/** Plays `$codes` on the fixture game without the service (quiet moves only). */
	private function advance(array $codes): void {
		$state = $this->engine->initialState();
		foreach ($codes as $code) {
			$state = $this->engine->applyMove($state, $code)['state'];
		}
		$this->game->setState($this->engine->serializeState($state));
		$this->game->setPly($state['ply']);
		$this->game->setTurn($state['turn']);
	}

	private function assertApiError(string $code, callable $fn): ApiException {
		try {
			$fn();
		} catch (ApiException $e) {
			$this->assertSame($code, $e->getErrorCode());
			return $e;
		}
		$this->fail("expected $code");
	}

	/** How often a notification of `$method` was sent. */
	private function notified(string $method): int {
		return count(array_filter(
			$this->log,
			fn (string $entry) => str_starts_with($entry, 'notify ' . $method . '('),
		));
	}

	public function testCheckOrder(): void {
		$this->assertApiError('not_found', fn () => $this->gameplay()->move(7, 'carol', 'e2-e4', 0, null, null));
		$this->assertApiError('not_found', fn () => $this->gameplay()->move(8, 'alice', 'e2-e4', 0, null, null));
		$this->assertSame(
			403,
			$this->assertApiError(
				'not_your_turn',
				fn () => $this->gameplay()->move(7, 'bob', 'e7-e5', 0, null, null),
			)->getStatus(),
		);
		$this->assertApiError('conflict', fn () => $this->gameplay()->move(7, 'alice', 'e2-e4', 3, null, null));
		$e = $this->assertApiError(
			'illegal_move',
			fn () => $this->gameplay()->move(7, 'alice', 'e1-e3', 0, null, null),
		);
		$this->assertIsString($e->getExtra()['reason']);
		$this->game->setStatus(Game::STATUS_FINISHED);
		$this->assertApiError('game_over', fn () => $this->gameplay()->move(7, 'alice', 'e2-e4', 0, null, null));
		$this->assertSame(0, $this->random->draws);
	}

	public function testQuietMoveNeverRollsAndExtendsTheChain(): void {
		$chain0 = $this->game->getChain();
		$r = $this->gameplay()->move(7, 'alice', 'g1-f3|h3', 0, 'client-0001', 800);
		$this->assertSame(1, $this->notified('yourTurn'));
		$this->assertSame(0, $this->random->draws);
		$this->assertFalse($r['replayed']);
		$this->assertNull($r['measurement']);
		$after = $this->engine->applyMove($this->engine->initialState(), 'g1-f3|h3')['state'];
		$json = $this->engine->serializeState($after);
		$expected = $this->engine->chainNext((string)$chain0, 0, 'g1-f3|h3', null, null, $json);
		$this->assertSame($expected, $r['move']->getChain());
		$this->assertSame($expected, $this->game->getChain());
		$this->assertSame($json, $this->game->getState());
		$this->assertSame([1, 'b', 6], [$this->game->getPly(), $this->game->getTurn(), $this->game->getRev()]);
		$this->assertSame(self::NOW + 259200, $this->game->getDeadlineAt());
		$this->assertSame(66, strlen($r['move']->getSupportKey()));
		$this->assertSame('client-0001', $r['move']->getClientId());
		$this->assertSame(
			['begin', 'insert move g1-f3|h3', 'save #7 rev 5→6', 'commit', 'notify yourTurn(#7, Move, NULL)'],
			$this->log,
		);
	}

	public function testRolledMoveDrawsExactlyOnce(): void {
		$this->advance(['g1-f3|h3', 'e7-e5']);
		$this->random->nextU = 5000000;
		$r = $this->gameplay()->move(7, 'alice', 'f3-e5', 2, 'client-0002', null);
		$this->assertSame(1, $this->random->draws);
		$this->assertSame(5000000, $r['measurement']['u']);
		$key = $r['measurement']['key'];
		$this->assertContains($key, ['capture', 'miss']);
		$this->assertSame(json_encode($r['measurement'], JSON_UNESCAPED_SLASHES), $r['move']->getMeasurement());
		$this->assertStringContainsString('{' . $key . ' 50%}', $r['move']->getNotation());
		$this->random->nextU = 12000000;
		$this->game = GameBuilder::active();
		$this->store($this->game);
		$this->advance(['g1-f3|h3', 'e7-e5']);
		$other = $this->gameplay()->move(7, 'alice', 'f3-e5', 2, 'client-0003', null)['measurement']['key'];
		$this->assertNotSame($key, $other, 'the other half of the interval selects the other outcome');
	}

	public function testRetryIsReplayedWithoutRolling(): void {
		$this->storedMove = new Move();
		$this->storedMove->setCode('f3-e5');
		$this->storedMove->setMeasurement('{"key":"miss","u":9000000,"captured":null,"outcomes":[],"fallback":false}');
		$r = $this->gameplay()->move(7, 'alice', 'f3-e5', 99, 'client-0002', null);
		$this->assertTrue($r['replayed']);
		$this->assertSame(9000000, $r['measurement']['u']);
		$this->assertSame(0, $this->random->draws);
		$this->assertSame([], $this->log, 'nothing is stored again');
	}

	public function testConcurrentChangeIsAConflict(): void {
		$this->updateOk = false;
		$this->assertApiError('conflict', fn () => $this->gameplay()->move(7, 'alice', 'e2-e4', 0, null, null));
		$this->assertSame(5, $this->game->getRev());
	}

	public function testMoveDeclinesTheOpponentsDrawOffer(): void {
		$this->advance(['e2-e4', 'e7-e5']);
		$this->game->setDrawOffer('b');
		$this->game->setDrawOfferPly(1);
		$this->gameplay()->move(7, 'alice', 'd2-d4', 2, null, null);
		$this->assertSame(1, $this->notified('drawClosed'));
		$this->assertNull($this->game->getDrawOffer());
		$this->assertSame(2, $this->game->getLastDrawB());
	}

	public function testDrawCooldown(): void {
		$this->advance(['e2-e4', 'e7-e5', 'd2-d4', 'd7-d6']);
		$this->game->setLastDrawW(0);
		$e = $this->assertApiError('draw_not_allowed', fn () => $this->gameplay()->draw(7, 'alice', 'offer'));
		$this->assertSame(6, $e->getExtra()['availableAtPly']);
		$this->game->setLastDrawW(-2);
		$game = $this->gameplay()->draw(7, 'alice', 'offer');
		$this->assertSame(['w', 4], [$game->getDrawOffer(), $game->getDrawOfferPly()]);
		$this->assertApiError('draw_not_allowed', fn () => $this->gameplay()->draw(7, 'alice', 'offer'));
		$this->assertApiError('no_draw_offer', fn () => $this->gameplay()->draw(7, 'alice', 'accept'));
		$this->gameplay()->draw(7, 'bob', 'decline');
		$this->assertSame([null, 4], [$this->game->getDrawOffer(), $this->game->getLastDrawW()]);
	}

	public function testOfferWhileTheOtherOfferIsPendingAccepts(): void {
		$this->game->setDrawOffer('w');
		$game = $this->gameplay()->draw(7, 'bob', 'offer');
		$this->assertSame(
			[Game::STATUS_FINISHED, '1/2-1/2', 'agreement'],
			[$game->getStatus(), $game->getResult(), $game->getResultReason()],
		);
		$this->assertContains('chat #7 draw_accepted {"color":"b"}', $this->log);
	}

	public function testAbortOnlyBeforeBothSidesMoved(): void {
		$this->advance(['e2-e4', 'e7-e5']);
		$this->assertApiError('abort_not_allowed', fn () => $this->gameplay()->abort(7, 'bob'));
		$this->game = GameBuilder::active();
		$this->store($this->game);
		$this->advance(['e2-e4']);
		$game = $this->gameplay()->abort(7, 'bob');
		$this->assertSame(
			[Game::STATUS_ABORTED, 'aborted', 0, 'aborted'],
			[$game->getStatus(), $game->getResultReason(), $game->getRated(), $game->getUnratedReason()],
		);
	}

	public function testResign(): void {
		$this->advance(['e2-e4', 'e7-e5']);
		$game = $this->gameplay()->resign(7, 'alice');
		$this->assertSame(
			[Game::STATUS_FINISHED, '0-1', 'resignation'],
			[$game->getStatus(), $game->getResult(), $game->getResultReason()],
		);
		$this->assertSame(
			[
				'begin',
				'rate #7 0-1',
				'chat #7 resigned {"color":"w"}',
				'save #7 rev 5→6',
				'commit',
				"notify gameOver(#7, 'alice')",
			],
			$this->log,
		);
		$this->assertApiError('game_over', fn () => $this->gameplay()->resign(7, 'bob'));
	}

	public function testLazyTimeoutFinishesAtTheDeadline(): void {
		$this->advance(['e2-e4', 'e7-e5', 'd2-d4']);
		$this->game->setDeadlineAt(self::NOW - 50);
		$this->assertApiError('game_over', fn () => $this->gameplay()->move(7, 'bob', 'd7-d6', 3, null, null));
		$this->assertSame(1, $this->notified('gameOver'));
		$this->assertSame(
			[Game::STATUS_FINISHED, '1-0', 'timeout', self::NOW - 50],
			[
				$this->game->getStatus(),
				$this->game->getResult(),
				$this->game->getResultReason(),
				$this->game->getFinishedAt(),
			],
		);
	}
}
