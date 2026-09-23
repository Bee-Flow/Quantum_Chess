<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Integration;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Notification\MoveDescriber;
use OCA\QuantumChess\Notification\Notifier;
use OCA\QuantumChess\Service\NotificationService;
use OCA\QuantumChess\Service\SettingsService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\IAction;
use OCP\Notification\IManager;
use OCP\Notification\INotification;
use OCP\Notification\UnknownNotificationException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * NotificationService (families, switches) and Notifier/MoveDescriber rendering (SPEC §9.1, GD §7.12).
 */
final class NotificationsTest extends TestCase {
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

	/** @return array{0: NotificationService, 1: list<array{string, array}>, 2: list<string>} */
	private function service(array $switches = []): array {
		$log = new \ArrayObject();
		$manager = $this->createMock(IManager::class);
		$manager->method('createNotification')->willReturnCallback(fn () => $this->fakeNotification());
		$manager->method('markProcessed')->willReturnCallback(function (INotification $n) use ($log) {
			$log[] = ['processed', $n->getUser() . ':' . $n->getSubject()];
		});
		$manager->method('notify')->willReturnCallback(function (INotification $n) use ($log) {
			$log[] = ['notify', $n->getUser() . ':' . $n->getSubject(), $n->getSubjectParameters()];
		});
		$settings = $this->createMock(SettingsService::class);
		$settings->method('notificationSwitches')->willReturnCallback(fn (string $uid) => ($switches[$uid] ?? []) + [
			'invites' => true, 'yourTurn' => true, 'reminders' => true, 'drawOffers' => true, 'results' => true, 'chat' => true, 'previews' => true,
		]);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1790000000);
		return [new NotificationService($manager, $settings, $time, $this->createMock(LoggerInterface::class)), $log];
	}

	private function fakeNotification(): INotification {
		return new class() implements INotification {
			private array $f = ['app' => '', 'user' => '', 'subject' => '', 'params' => [], 'otype' => '', 'oid' => ''];
			public array $actions = [];
			public function setApp(string $app): INotification {
				$this->f['app'] = $app;
				return $this;
			}
			public function getApp(): string {
				return $this->f['app'];
			}
			public function setUser(string $user): INotification {
				$this->f['user'] = $user;
				return $this;
			}
			public function getUser(): string {
				return $this->f['user'];
			}
			public function setDateTime(\DateTime $dateTime): INotification {
				return $this;
			}
			public function getDateTime(): \DateTime {
				return new \DateTime();
			}
			public function setObject(string $type, string $id): INotification {
				$this->f['otype'] = $type;
				$this->f['oid'] = $id;
				return $this;
			}
			public function getObjectType(): string {
				return $this->f['otype'];
			}
			public function getObjectId(): string {
				return $this->f['oid'];
			}
			public function setSubject(string $subject, array $parameters = []): INotification {
				$this->f['subject'] = $subject;
				$this->f['params'] = $parameters;
				return $this;
			}
			public function getSubject(): string {
				return $this->f['subject'];
			}
			public function getSubjectParameters(): array {
				return $this->f['params'];
			}
			public function setParsedSubject(string $subject): INotification {
				$this->f['parsed'] = $subject;
				return $this;
			}
			public function getParsedSubject(): string {
				return $this->f['parsed'] ?? '';
			}
			public function setRichSubject(string $subject, array $parameters = []): INotification {
				$this->f['rich'] = [$subject, $parameters];
				return $this;
			}
			public function getRichSubject(): string {
				return $this->f['rich'][0] ?? '';
			}
			public function getRichSubjectParameters(): array {
				return $this->f['rich'][1] ?? [];
			}
			public function setMessage(string $message, array $parameters = []): INotification {
				return $this;
			}
			public function getMessage(): string {
				return '';
			}
			public function getMessageParameters(): array {
				return [];
			}
			public function setParsedMessage(string $message): INotification {
				$this->f['message'] = $message;
				return $this;
			}
			public function getParsedMessage(): string {
				return $this->f['message'] ?? '';
			}
			public function setRichMessage(string $message, array $parameters = []): INotification {
				return $this;
			}
			public function getRichMessage(): string {
				return '';
			}
			public function getRichMessageParameters(): array {
				return [];
			}
			public function setLink(string $link): INotification {
				$this->f['link'] = $link;
				return $this;
			}
			public function getLink(): string {
				return $this->f['link'] ?? '';
			}
			public function setIcon(string $icon): INotification {
				return $this;
			}
			public function getIcon(): string {
				return '';
			}
			public function setPriorityNotification(bool $priorityNotification): INotification {
				return $this;
			}
			public function isPriorityNotification(): bool {
				return false;
			}
			public function createAction(): IAction {
				return new class() implements IAction {
					public array $f = [];
					public function setLabel(string $label): IAction {
						$this->f['label'] = $label;
						return $this;
					}
					public function getLabel(): string {
						return $this->f['label'] ?? '';
					}
					public function setParsedLabel(string $label): IAction {
						$this->f['parsed'] = $label;
						return $this;
					}
					public function getParsedLabel(): string {
						return $this->f['parsed'] ?? '';
					}
					public function setPrimary(bool $primary): IAction {
						$this->f['primary'] = $primary;
						return $this;
					}
					public function isPrimary(): bool {
						return $this->f['primary'] ?? false;
					}
					public function setLink(string $link, string $requestType): IAction {
						$this->f['link'] = $link;
						$this->f['type'] = $requestType;
						return $this;
					}
					public function getLink(): string {
						return $this->f['link'] ?? '';
					}
					public function getRequestType(): string {
						return $this->f['type'] ?? '';
					}
					public function isValid(): bool {
						return true;
					}
					public function isValidParsed(): bool {
						return true;
					}
				};
			}
			public function addAction(IAction $action): INotification {
				return $this;
			}
			public function getActions(): array {
				return [];
			}
			public function addParsedAction(IAction $action): INotification {
				$this->actions[] = $action;
				return $this;
			}
			public function getParsedActions(): array {
				return $this->actions;
			}
			public function isValid(): bool {
				return true;
			}
			public function isValidParsed(): bool {
				return true;
			}
		};
	}

	public function testYourTurnReplacesTheFamilyAndCarriesTheMove(): void {
		[$service, $log] = $this->service();
		$move = new Move();
		$move->setPly(2);
		$move->setColor('w');
		$move->setCode('f3-e5');
		$move->setNotation('Nf3xe5 {capture 50%}');
		$move->setMeasurement('{"key":"capture","u":1,"captured":28,"outcomes":[{"key":"miss","weight":8388608},{"key":"capture","weight":8388608}],"fallback":false}');
		$service->yourTurn($this->game(), $move, 'p');
		$entries = $log->getArrayCopy();
		$this->assertSame([['processed', 'bob:your_turn'], ['processed', 'bob:reminder']], array_map(fn ($e) => [$e[0], $e[1]], array_slice($entries, 0, 2)));
		$this->assertSame('notify', $entries[2][0]);
		$this->assertSame('bob:your_turn', $entries[2][1]);
		$this->assertSame(['code' => 'f3-e5', 'notation' => 'Nf3xe5 {capture 50%}', 'color' => 'w', 'key' => 'capture', 'weight' => 8388608, 'capturedType' => 'p'], $entries[2][2]['lastMove']);
		$this->assertSame(['alice', 2, 3], [$entries[2][2]['actor'], $entries[2][2]['moveNumber'], $entries[2][2]['ply']]);
	}

	public function testSwitchesSuppressCreationOnly(): void {
		[$service, $log] = $this->service(['bob' => ['drawOffers' => false]]);
		$game = $this->game();
		$game->setDrawOffer('w');
		$service->drawOffered($game);
		$this->assertSame(['processed'], array_unique(array_column($log->getArrayCopy(), 0)), 'cleared but not created');
	}

	public function testMutedChatAndPreviews(): void {
		[$service, $log] = $this->service(['bob' => ['previews' => false]]);
		$game = $this->game();
		$message = new \OCA\QuantumChess\Db\ChatMessage();
		$message->setUid('alice');
		$message->setKind(0);
		$message->setMessage('hello there');
		$service->chat($game, $message);
		$notify = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertNull($notify[0][2]['excerpt'], 'previews off: no excerpt');
		$game->setMuteB(1);
		$service->chat($game, $message);
		$this->assertCount(1, array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'), 'muted: no notification');
	}

	public function testGameOverSkipsTheResigner(): void {
		[$service, $log] = $this->service();
		$game = $this->game();
		$game->setStatus(Game::STATUS_FINISHED);
		$game->setResult('0-1');
		$game->setResultReason('resignation');
		$service->gameOver($game, 'alice');
		$notify = array_values(array_filter($log->getArrayCopy(), fn ($e) => $e[0] === 'notify'));
		$this->assertCount(1, $notify);
		$this->assertSame('bob:game_over', $notify[0][1]);
		$this->assertSame('win', $notify[0][2]['outcome']);
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
		return $this->fakeNotification()->setApp($app)->setUser('bob')->setObject('game', $id)->setSubject($subject, $params);
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
