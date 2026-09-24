<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\ChatService;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The chat of an online game: validation, when it is open, and muting.
 */
#[CoversClass(ChatService::class)]
final class ChatServiceTest extends TestCase {
	use GameServiceFixture;

	private const NOW = GameBuilder::NOW;

	protected function setUp(): void {
		$this->setUpGames();
		$this->store(GameBuilder::active());
	}

	private function errorOf(callable $fn): string {
		try {
			$fn();
		} catch (ApiException $e) {
			return $e->getErrorCode();
		}
		$this->fail('expected an error');
	}

	public function testChatValidation(): void {
		$line = $this->chat()->send(7, 'alice', "  hi\x07 there \n", null);
		$this->assertSame(['hi there', ChatMessage::KIND_TEXT], [$line->getMessage(), $line->getKind()]);
		$this->assertSame(1, $this->stored[7]->getChatCount());
		$this->assertSame('invalid_argument', $this->errorOf(fn () => $this->chat()->send(7, 'alice', str_repeat('x', 501), null)));
		$this->assertSame('invalid_argument', $this->errorOf(fn () => $this->chat()->send(7, 'alice', null, 'bad_phrase')));
		$this->assertSame('good_game', $this->chat()->send(7, 'bob', null, 'good_game')->getMessage());
		$this->assertContains('notify chat(#7, ChatMessage)', $this->log);
	}

	public function testWhenTheChatIsOpen(): void {
		$this->assertTrue(ChatService::isOpen(GameBuilder::active(), self::NOW));
		$this->assertTrue(ChatService::isOpen(GameBuilder::finished(['finishedAt' => self::NOW - ChatService::OPEN_AFTER_END]), self::NOW));
		$this->assertFalse(ChatService::isOpen(GameBuilder::finished(['finishedAt' => self::NOW - ChatService::OPEN_AFTER_END - 1]), self::NOW));
		$this->assertFalse(ChatService::isOpen(GameBuilder::pending(), self::NOW));

		$this->store(GameBuilder::finished(['finishedAt' => self::NOW - ChatService::OPEN_AFTER_END - 1]));
		$this->assertSame('chat_closed', $this->errorOf(fn () => $this->chat()->send(7, 'alice', 'hi', null)));
		$this->store(GameBuilder::pending());
		$this->assertSame('chat_closed', $this->errorOf(fn () => $this->chat()->send(7, 'alice', 'hi', null)), 'no chat before the game starts');
		$this->config['chatEnabled'] = false;
		$this->assertSame('chat_disabled', $this->errorOf(fn () => $this->chat()->send(7, 'alice', 'hi', null)));
	}

	public function testMute(): void {
		$this->assertTrue($this->chat()->setMuted(7, 'bob', true));
		$this->assertSame([0, 1], [$this->stored[7]->getMuteW(), $this->stored[7]->getMuteB()]);
		$this->assertFalse($this->chat()->setMuted(7, 'bob', false));
		$this->assertSame(0, $this->stored[7]->getMuteB());
		$this->store(GameBuilder::pending(['status' => Game::STATUS_PENDING]));
		$this->assertSame('invalid_status', $this->errorOf(fn () => $this->chat()->setMuted(7, 'bob', true)));
	}
}
