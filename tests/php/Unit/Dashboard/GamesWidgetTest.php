<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Dashboard;

use OCA\QuantumChess\Dashboard\GamesWidget;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Dashboard\Model\WidgetItem;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The dashboard widget: invitations and rematch offers, the games waiting for the user's move with the time left,
 * deleted opponents, the empty message, and who sees the widget.
 */
#[CoversClass(GamesWidget::class)]
final class GamesWidgetTest extends TestCase {
	private const NOW = GameBuilder::NOW;

	/** @var list<Game> */
	private array $games = [];
	private bool $multiplayer = true;
	private ?IUser $user = null;

	private function widget(): GamesWidget {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnCallback(fn (string $text, array $parameters = []) => vsprintf($text, $parameters));
		$l->method('n')->willReturnCallback(
			fn (string $singular, string $plural, int $count) => str_replace(
				'%n',
				(string)$count,
				$count === 1 ? $singular : $plural,
			),
		);
		$url = $this->createMock(IURLGenerator::class);
		$url->method('linkToRouteAbsolute')->willReturnCallback(
			fn (string $route, array $parameters = []) => match ($route) {
				'quantumchess.page.index' => 'https://cloud.example/apps/quantumchess/',
				default => 'https://cloud.example/avatar/' . $parameters['userId'],
			},
		);
		$url->method('imagePath')->willReturnCallback(
			fn (string $app, string $image) => '/apps/' . $app . '/img/' . $image,
		);
		$url->method('getAbsoluteURL')->willReturnCallback(fn (string $path) => 'https://cloud.example' . $path);
		$users = $this->createMock(IUserManager::class);
		$users->method('getDisplayName')->willReturnCallback(
			fn (string $uid) => ['alice' => 'Alice', 'bob' => 'Bob'][$uid] ?? null,
		);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturnCallback(fn () => $this->user);
		$queries = $this->createMock(GameQueryService::class);
		$queries->method('listDashboard')->willReturnCallback(fn () => $this->games);
		$settings = $this->createMock(AppSettings::class);
		$settings->method('isMultiplayerEnabledFor')->willReturnCallback(fn () => $this->multiplayer);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(self::NOW);
		return new GamesWidget($l, $url, $users, $session, $queries, $settings, $time);
	}

	/**
	 * The widget items for bob, as `[title, subtitle, link, icon, overlay]`.
	 *
	 * @return list<array{0: string, 1: string, 2: string, 3: string, 4: string}>
	 */
	private function items(): array {
		return array_map(
			fn (WidgetItem $item) => [
				$item->getTitle(),
				$item->getSubtitle(),
				$item->getLink(),
				$item->getIconUrl(),
				$item->getOverlayIconUrl(),
			],
			$this->widget()->getItemsV2('bob')->getItems(),
		);
	}

	public function testListsInvitationsAndRematchOffers(): void {
		$this->games = [
			GameBuilder::pending(),
			GameBuilder::pending(['id' => 8, 'rematchOf' => 3, 'ratedRequested' => 0, 'timeControl' => 'corr:1d']),
		];
		$this->assertSame([
			[
				'Alice invited you',
				'3 days per move · Rated',
				'https://cloud.example/apps/quantumchess/#/game/7',
				'https://cloud.example/avatar/alice',
				'',
			],
			[
				'Alice wants a rematch',
				'1 day per move · Unrated',
				'https://cloud.example/apps/quantumchess/#/game/8',
				'https://cloud.example/avatar/alice',
				'',
			],
		], $this->items());
	}

	public function testShowsTheMoveNumberAndTheTimeLeft(): void {
		$this->games = [
			GameBuilder::active(['ply' => 3, 'turn' => 'b', 'deadlineAt' => self::NOW + 3 * 86400 + 5]),
			GameBuilder::active(['id' => 8, 'ply' => 5, 'turn' => 'b', 'deadlineAt' => self::NOW + 5 * 3600 + 5]),
			GameBuilder::active(['id' => 9, 'ply' => 1, 'turn' => 'b', 'deadlineAt' => self::NOW - 10]),
			GameBuilder::active([
				'id' => 10,
				'ply' => 7,
				'turn' => 'b',
				'deadlineAt' => null,
				'timeControl' => 'corr:none',
			]),
		];
		$items = $this->items();
		$this->assertSame(
			['Move 2 · 3 days left', 'Move 3 · 5 hours left', 'Move 1 · 1 hour left', 'Move 4'],
			array_column($items, 1),
		);
		$this->assertSame('Your move against Alice', $items[0][0]);
		$this->assertSame(
			'https://cloud.example/apps/quantumchess/img/overlay-king-b.svg',
			$items[0][4],
			'bob plays Black',
		);
	}

	public function testNamesADeletedOpponent(): void {
		$this->games = [GameBuilder::active(['whiteUid' => null, 'creatorUid' => null, 'turn' => 'b', 'ply' => 1])];
		$items = $this->items();
		$this->assertSame(['Your move against Deleted user', ''], [$items[0][0], $items[0][3]]);
	}

	public function testHasAnEmptyMessageAndIsShownToOnlinePlayersOnly(): void {
		$this->assertSame(
			'No games waiting for your move',
			$this->widget()->getItemsV2('bob')->getEmptyContentMessage(),
		);
		$this->assertFalse($this->widget()->isEnabled(), 'nobody logged in');
		$this->user = $this->createMock(IUser::class);
		$this->user->method('getUID')->willReturn('bob');
		$this->assertTrue($this->widget()->isEnabled());
		$this->multiplayer = false;
		$this->assertFalse($this->widget()->isEnabled());
	}
}
