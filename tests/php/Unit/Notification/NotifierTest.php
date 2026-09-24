<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Notification;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Notification\MoveDescriber;
use OCA\QuantumChess\Notification\Notifier;
use OCA\QuantumChess\Tests\Support\FakeNotification;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\IAction;
use OCP\Notification\INotification;
use OCP\Notification\UnknownNotificationException;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Rendering notifications in the recipient's language, their actions, and the last move in words.
 */
#[CoversClass(Notifier::class)]
#[CoversClass(MoveDescriber::class)]
final class NotifierTest extends TestCase {
	private function l10n(array $dictionary = []): IL10N {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnCallback(fn (string $text, array $p = []) => vsprintf($dictionary[$text] ?? $text, $p));
		$l->method('n')->willReturnCallback(fn (string $s, string $pl, int $n, array $p = []) => str_replace('%n', (string)$n, $n === 1 ? $s : $pl));
		return $l;
	}

	private function game(): Game {
		$game = new Game();
		$game->setId(42);
		$game->setCreatorUid('alice');
		$game->setOpponentUid('bob');
		$game->setWhiteUid('alice');
		$game->setBlackUid('bob');
		$game->setStatus(Game::STATUS_ACTIVE);
		$game->setPly(3);
		$game->setTurn('b');
		$game->setTimeControl('corr:3d');
		$game->setRatedRequested(1);
		return $game;
	}

	private function notifier(Game $game, ?IL10N $l = null): Notifier {
		$factory = $this->createMock(IFactory::class);
		$factory->method('get')->willReturn($l ?? $this->l10n());
		$url = $this->createMock(IURLGenerator::class);
		$url->method('linkToOCSRouteAbsolute')->willReturnCallback(fn (string $route, array $p) => 'https://cloud/ocs/' . $route . '/' . $p['id']);
		$url->method('linkToRouteAbsolute')->willReturn('https://cloud/apps/quantumchess/');
		$url->method('imagePath')->willReturn('/img/app-dark.svg');
		$url->method('getAbsoluteURL')->willReturnArgument(0);
		$users = $this->createMock(IUserManager::class);
		$users->method('getDisplayName')->willReturnCallback(fn (string $uid) => $uid === 'zed' ? null : ucfirst($uid));
		$mapper = $this->createMock(GameMapper::class);
		$mapper->method('findById')->willReturnCallback(fn (int $id) => $id === 42 ? $game : null);
		return new Notifier($factory, $url, $users, $mapper, new MoveDescriber(new Engine()));
	}

	private function incoming(string $subject, array $params, string $app = 'quantumchess', string $id = '42'): INotification {
		return (new FakeNotification())->setApp($app)->setUser('bob')->setObject('game', $id)->setSubject($subject, $params);
	}

	public function testInviteHasAcceptAndDeclineActions(): void {
		$game = $this->game();
		$game->setStatus(Game::STATUS_PENDING);
		$n = $this->notifier($game)->prepare($this->incoming('invite', ['actor' => 'alice', 'timeControl' => 'corr:1d', 'rated' => true, 'color' => 'b', 'message' => 'Hi']), 'en');
		$this->assertSame('{user} invited you to a game of Quantum Chess', $n->getRichSubject());
		$this->assertSame(['type' => 'user', 'id' => 'alice', 'name' => 'Alice'], $n->getRichSubjectParameters()['user']);
		$this->assertSame('Alice invited you to a game of Quantum Chess', $n->getParsedSubject());
		$this->assertSame('1 day per move · Rated · You play Black · “Hi”', $n->getParsedMessage());
		$actions = $n->getParsedActions();
		$this->assertSame(['Accept', 'Decline'], array_map(fn (IAction $a) => $a->getParsedLabel(), $actions));
		$this->assertSame('https://cloud/ocs/quantumchess.ocs_game.accept/42', $actions[0]->getLink());
		$this->assertSame(['POST', true], [$actions[0]->getRequestType(), $actions[0]->isPrimary()]);
		$this->assertSame('https://cloud/apps/quantumchess/#/game/42', $n->getLink());
	}

	public function testRecipientLanguage(): void {
		$game = $this->game();
		$l = $this->l10n(['{user} offers a draw' => '{user} bietet Remis an', 'Move %d' => 'Zug %d']);
		$game->setDrawOffer('w');
		$n = $this->notifier($game, $l)->prepare($this->incoming('draw_offer', ['actor' => 'alice', 'moveNumber' => 23]), 'de');
		$this->assertSame(['Alice bietet Remis an', 'Zug 23'], [$n->getParsedSubject(), $n->getParsedMessage()]);
	}

	public function testObsoleteAndUnknownNotifications(): void {
		$game = $this->game();
		$notifier = $this->notifier($game);
		$this->expectNotToPerformAssertions();
		try {
			$notifier->prepare($this->incoming('invite', ['actor' => 'alice']), 'en');
			$this->fail('an invite of an active game is obsolete');
		} catch (AlreadyProcessedException) {
		}
		try {
			$notifier->prepare($this->incoming('your_turn', ['actor' => 'alice', 'ply' => 1]), 'en');
			$this->fail('your_turn for an older ply is obsolete');
		} catch (AlreadyProcessedException) {
		}
		try {
			$notifier->prepare($this->incoming('invite', [], 'files'), 'en');
			$this->fail('other apps are unknown');
		} catch (UnknownNotificationException) {
		}
		try {
			$notifier->prepare($this->incoming('chat', [], 'quantumchess', '99'), 'en');
			$this->fail('deleted games are processed');
		} catch (AlreadyProcessedException) {
		}
	}

	public function testGameOverMessage(): void {
		$game = $this->game();
		$game->setStatus(Game::STATUS_FINISHED);
		$n = $this->notifier($game)->prepare($this->incoming('game_over', ['actor' => 'alice', 'outcome' => 'loss', 'reason' => 'king_captured', 'rating' => 1188, 'delta' => -12]), 'en');
		$this->assertSame('You lost against Alice', $n->getParsedSubject());
		$this->assertSame('King captured · Rating 1188 (−12)', $n->getParsedMessage());
		$this->assertSame(['Rematch'], array_map(fn (IAction $a) => $a->getParsedLabel(), $n->getParsedActions()));
	}

	public function testDeletedAccountsAreNeitherNamedNorOfferedARematch(): void {
		$game = $this->game();
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setWhiteUid(null);
		$game->setCreatorUid(null);
		$notifier = $this->notifier($game);
		$n = $notifier->prepare($this->incoming('game_over', ['actor' => 'zed', 'outcome' => 'win', 'reason' => 'resignation']), 'en');
		$this->assertSame('You won against Deleted user', $n->getParsedSubject());
		$this->assertStringNotContainsString('zed', json_encode($n->getRichSubjectParameters()));
		$this->assertSame([], $n->getParsedActions(), 'no rematch against a deleted account');
		try {
			$notifier->prepare($this->incoming('chat', ['actor' => 'zed', 'excerpt' => 'my phone number is 555-0199']), 'en');
			$this->fail('the chat of a deleted account is gone');
		} catch (AlreadyProcessedException) {
		}
		// an opponent who left the game (data erased) gets no rematch offer either
		$game->setWhiteUid(null);
		$n = $notifier->prepare($this->incoming('game_over', ['actor' => 'alice', 'outcome' => 'win', 'reason' => 'resignation']), 'en');
		$this->assertSame([], $n->getParsedActions());
	}

	public function testLastMoveInWords(): void {
		$d = new MoveDescriber(new Engine());
		$l = $this->l10n();
		$this->assertSame('They split their knight: g1 → f3 | h3', $d->describe($l, ['notation' => 'Ng1-f3|h3']));
		$this->assertSame('They merged their bishop on d5', $d->describe($l, ['notation' => 'Bc4|e6-d5']));
		$this->assertSame("They measured their knight: it's on c4", $d->describe($l, ['notation' => '?Na4 {c4 50%}', 'key' => 'c4', 'weight' => 8388608]));
		$this->assertSame('They captured your bishop on e5 (58 % chance)', $d->describe($l, ['notation' => 'Qd4xe5 {capture 58%}', 'key' => 'capture', 'weight' => 9730785, 'capturedType' => 'b']));
		$this->assertSame('They captured your pawn on e5', $d->describe($l, ['notation' => 'Nf3xe5', 'capturedType' => 'p']));
		$this->assertSame('Their move to e5 missed (42 %)', $d->describe($l, ['notation' => 'Nf3-e5 {miss 42%}', 'key' => 'miss', 'weight' => 7046431]));
		$this->assertSame('Their bishop landed on e5 (42 %)', $d->describe($l, ['notation' => 'Bc3-e5 {move 42%}', 'key' => 'move', 'weight' => 7046431]));
		$this->assertSame('They moved their pawn to e4', $d->describe($l, ['notation' => 'e2-e4']));
		$this->assertSame('They castled.', $d->describe($l, ['notation' => 'O-O']));
	}
}
