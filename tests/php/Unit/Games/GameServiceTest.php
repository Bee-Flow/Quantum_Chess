<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Games;

use OCA\QuantumChess\Db\ChatMapper;
use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Db\MoveMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\GameService;
use OCA\QuantumChess\Service\InvitePolicy;
use OCA\QuantumChess\Service\NotificationService;
use OCA\QuantumChess\Service\RatingService;
use OCA\QuantumChess\Service\SettingsService;
use OCA\QuantumChess\Service\TimeControl;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IL10N;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * A GameService whose CSPRNG draws are observable.
 */
class CountingGameService extends GameService {
	public int $draws = 0;
	public int $nextU = 123;

	protected function drawU(): int {
		$this->draws++;
		return $this->nextU;
	}
}

/**
 * The move pipeline and in-game actions of SPEC §8.4–8.5 with mocked storage and the real engine.
 */
final class GameServiceTest extends TestCase {
	private const NOW = 1790000000;
	private Engine $engine;
	private Game $game;
	private GameMapper&MockObject $games;
	private MoveMapper&MockObject $moves;
	private NotificationService&MockObject $notifications;
	private CountingGameService $service;
	private bool $updateOk = true;
	private ?Move $stored = null;
	/** @var list<Move> */
	private array $inserted = [];

	protected function setUp(): void {
		$this->engine = new Engine();
		$this->game = $this->activeGame();
		$this->games = $this->createMock(GameMapper::class);
		$this->games->method('findById')->willReturnCallback(fn (int $id) => $id === 7 ? $this->game : null);
		$this->games->method('updateChecked')->willReturnCallback(fn () => $this->updateOk);
		$this->moves = $this->createMock(MoveMapper::class);
		$this->moves->method('findByClientId')->willReturnCallback(fn () => $this->stored);
		$this->moves->method('insert')->willReturnCallback(function (Move $m) {
			$this->inserted[] = $m;
			return $m;
		});
		$chat = $this->createMock(ChatMapper::class);
		$chat->method('insert')->willReturnArgument(0);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(self::NOW);
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnCallback(fn (string $text, array $p = []) => vsprintf($text, $p));
		$this->notifications = $this->createMock(NotificationService::class);
		$this->service = new CountingGameService(
			$this->games, $this->moves, $chat, $this->engine, $this->createMock(InvitePolicy::class), new TimeControl(),
			$this->createMock(RatingService::class), $this->notifications, $this->createMock(SettingsService::class),
			$this->createMock(IDBConnection::class), $time, $this->createMock(IUserManager::class), $l,
			$this->createMock(LoggerInterface::class),
		);
	}

	private function activeGame(): Game {
		$game = new Game();
		$game->setId(7);
		$game->setCreatorUid('alice');
		$game->setOpponentUid('bob');
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setState($this->engine->serializeState($this->engine->initialState()));
		$game->setPly(0);
		$game->setTurn('w');
		$game->setRev(5);
		$game->setRated(1);
		$game->setRatedRequested(1);
		$game->setTimeControl('corr:3d');
		$game->setDeadlineAt(self::NOW + 1000);
		$game->setCreatedAt(self::NOW - 5000);
		$game->setStartedAt(self::NOW - 4000);
		$game->setChain($this->engine->chainStart(7, 'alice', 'bob', self::NOW - 5000));
		$game->resetUpdatedFields();
		return $game;
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

	public function testCheckOrder(): void {
		$this->assertApiError('not_found', fn () => $this->service->move(7, 'carol', 'e2-e4', 0, null, null));
		$this->assertApiError('not_found', fn () => $this->service->move(8, 'alice', 'e2-e4', 0, null, null));
		$this->assertSame(403, $this->assertApiError('not_your_turn', fn () => $this->service->move(7, 'bob', 'e7-e5', 0, null, null))->getStatus());
		$this->assertApiError('conflict', fn () => $this->service->move(7, 'alice', 'e2-e4', 3, null, null));
		$e = $this->assertApiError('illegal_move', fn () => $this->service->move(7, 'alice', 'e1-e3', 0, null, null));
		$this->assertIsString($e->getExtra()['reason']);
		$this->game->setStatus(Game::STATUS_FINISHED);
		$this->assertApiError('game_over', fn () => $this->service->move(7, 'alice', 'e2-e4', 0, null, null));
		$this->assertSame(0, $this->service->draws);
	}

	public function testQuietMoveNeverRollsAndExtendsTheChain(): void {
		$chain0 = $this->game->getChain();
		$this->notifications->expects($this->once())->method('yourTurn');
		$r = $this->service->move(7, 'alice', 'g1-f3|h3', 0, 'client-0001', 800);
		$this->assertSame(0, $this->service->draws);
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
	}

	public function testRolledMoveDrawsExactlyOnce(): void {
		$this->advance(['g1-f3|h3', 'e7-e5']);
		$this->service->nextU = 5000000;
		$r = $this->service->move(7, 'alice', 'f3-e5', 2, 'client-0002', null);
		$this->assertSame(1, $this->service->draws);
		$this->assertSame(5000000, $r['measurement']['u']);
		$key = $r['measurement']['key'];
		$this->assertContains($key, ['capture', 'miss']);
		$this->assertSame(json_encode($r['measurement'], JSON_UNESCAPED_SLASHES), $r['move']->getMeasurement());
		$this->assertStringContainsString('{' . $key . ' 50%}', $r['move']->getNotation());
		$this->service->nextU = 12000000;
		$this->game = $this->activeGame();
		$this->advance(['g1-f3|h3', 'e7-e5']);
		$other = $this->service->move(7, 'alice', 'f3-e5', 2, 'client-0003', null)['measurement']['key'];
		$this->assertNotSame($key, $other, 'the other half of the interval selects the other outcome');
	}

	public function testRetryIsReplayedWithoutRolling(): void {
		$this->stored = new Move();
		$this->stored->setCode('f3-e5');
		$this->stored->setMeasurement('{"key":"miss","u":9000000,"captured":null,"outcomes":[],"fallback":false}');
		$r = $this->service->move(7, 'alice', 'f3-e5', 99, 'client-0002', null);
		$this->assertTrue($r['replayed']);
		$this->assertSame(9000000, $r['measurement']['u']);
		$this->assertSame(0, $this->service->draws);
		$this->assertSame([], $this->inserted);
	}

	public function testConcurrentChangeIsAConflict(): void {
		$this->updateOk = false;
		$this->assertApiError('conflict', fn () => $this->service->move(7, 'alice', 'e2-e4', 0, null, null));
		$this->assertSame(5, $this->game->getRev());
	}

	public function testMoveDeclinesTheOpponentsDrawOffer(): void {
		$this->advance(['e2-e4', 'e7-e5']);
		$this->game->setDrawOffer('b');
		$this->game->setDrawOfferPly(1);
		$this->notifications->expects($this->once())->method('drawClosed');
		$this->service->move(7, 'alice', 'd2-d4', 2, null, null);
		$this->assertNull($this->game->getDrawOffer());
		$this->assertSame(2, $this->game->getLastDrawB());
	}

	public function testDrawCooldown(): void {
		$this->advance(['e2-e4', 'e7-e5', 'd2-d4', 'd7-d6']);
		$this->game->setLastDrawW(0);
		$e = $this->assertApiError('draw_not_allowed', fn () => $this->service->draw(7, 'alice', 'offer'));
		$this->assertSame(6, $e->getExtra()['availableAtPly']);
		$this->game->setLastDrawW(-2);
		$game = $this->service->draw(7, 'alice', 'offer');
		$this->assertSame(['w', 4], [$game->getDrawOffer(), $game->getDrawOfferPly()]);
		$this->assertApiError('draw_not_allowed', fn () => $this->service->draw(7, 'alice', 'offer'));
		$this->assertApiError('no_draw_offer', fn () => $this->service->draw(7, 'alice', 'accept'));
		$this->service->draw(7, 'bob', 'decline');
		$this->assertSame([null, 4], [$this->game->getDrawOffer(), $this->game->getLastDrawW()]);
	}

	public function testOfferWhileTheOtherOfferIsPendingAccepts(): void {
		$this->game->setDrawOffer('w');
		$game = $this->service->draw(7, 'bob', 'offer');
		$this->assertSame([Game::STATUS_FINISHED, '1/2-1/2', 'agreement'], [$game->getStatus(), $game->getResult(), $game->getResultReason()]);
	}

	public function testAbortOnlyBeforeBothSidesMoved(): void {
		$this->advance(['e2-e4', 'e7-e5']);
		$this->assertApiError('abort_not_allowed', fn () => $this->service->abort(7, 'bob'));
		$this->game = $this->activeGame();
		$this->advance(['e2-e4']);
		$game = $this->service->abort(7, 'bob');
		$this->assertSame([Game::STATUS_ABORTED, 'aborted', 0, 'aborted'], [$game->getStatus(), $game->getResultReason(), $game->getRated(), $game->getUnratedReason()]);
	}

	public function testLazyTimeoutFinishesAtTheDeadline(): void {
		$this->advance(['e2-e4', 'e7-e5', 'd2-d4']);
		$this->game->setDeadlineAt(self::NOW - 50);
		$this->notifications->expects($this->once())->method('gameOver');
		$this->assertApiError('game_over', fn () => $this->service->move(7, 'bob', 'd7-d6', 3, null, null));
		$this->assertSame([Game::STATUS_FINISHED, '1-0', 'timeout', self::NOW - 50], [$this->game->getStatus(), $this->game->getResult(), $this->game->getResultReason(), $this->game->getFinishedAt()]);
	}

	public function testChatValidation(): void {
		$settings = (new \ReflectionProperty(GameService::class, 'settings'))->getValue($this->service);
		$settings->method('chatEnabled')->willReturn(true);
		$line = $this->service->chat(7, 'alice', "  hi\x07 there \n", null);
		$this->assertSame(['hi there', ChatMessage::KIND_TEXT], [$line->getMessage(), $line->getKind()]);
		$this->assertSame(1, $this->game->getChatCount());
		$this->assertApiError('invalid_argument', fn () => $this->service->chat(7, 'alice', str_repeat('x', 501), null));
		$this->assertApiError('invalid_argument', fn () => $this->service->chat(7, 'alice', null, 'bad_phrase'));
		$this->assertSame('good_game', $this->service->chat(7, 'bob', null, 'good_game')->getMessage());
	}
}
