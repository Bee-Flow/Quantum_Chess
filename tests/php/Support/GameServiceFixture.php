<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Support;

use OCA\QuantumChess\Db\ChatMapper;
use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Db\MoveMapper;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Notification\NotificationService;
use OCA\QuantumChess\Service\Game\ChatService;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\GameErrors;
use OCA\QuantumChess\Service\Game\GameLifecycle;
use OCA\QuantumChess\Service\Game\GameMaintenanceService;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Service\Game\GameRepository;
use OCA\QuantumChess\Service\Game\GameTransaction;
use OCA\QuantumChess\Service\Game\InvitationService;
use OCA\QuantumChess\Service\Game\InvitePolicy;
use OCA\QuantumChess\Service\Player\RatingService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IL10N;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use Psr\Log\LoggerInterface;

/**
 * The online game services on top of mocked storage, policy, settings and notifications, with the real rules engine.
 *
 * Games live in `$stored` by id. Every storage write, transaction step and notification is appended to `$log`, so
 * tests can assert the order of the steps, for example that notifications are sent only after the commit.
 *
 * @psalm-require-extends \PHPUnit\Framework\TestCase
 */
trait GameServiceFixture {
	protected Engine $engine;
	/** @var array<int, Game> */
	protected array $stored = [];
	protected int $nextId = 100;
	/** Whether the next optimistic update succeeds. */
	protected bool $updateOk = true;
	/** @var (callable(): void)|null runs when an update fails (the concurrent request's commit) */
	protected $onConflict = null;
	/** @var list<int> games whose every update fails, as if they were changed concurrently each time */
	protected array $conflicting = [];
	/** @var list<string> */
	protected array $log = [];
	/** @var array<string, bool|int> values of the admin settings the services read */
	protected array $config = [
		'ratedEnabled' => true,
		'openChallengesEnabled' => true,
		'chatEnabled' => true,
		'inviteExpiryDays' => 14,
		'openExpiryDays' => 7,
		'chatRetentionDays' => 90,
		'purgeFinishedDays' => 0,
	];
	/** @var array<string, bool|string|null> policy answers; a string is the error code the check throws */
	protected array $allow = [
		'multiplayer' => true,
		'seeOpen' => true,
		'inGroup' => true,
		'invite' => null,
		'limits' => null,
		'active' => null,
	];
	protected GameMapper&MockObject $gameMapper;
	protected MoveMapper&MockObject $moveMapper;
	protected ChatMapper&MockObject $chatMapper;
	protected NotificationService&MockObject $notifications;
	protected RatingService&MockObject $ratings;
	protected IUserManager&MockObject $userManager;
	protected FakeRandomSource $random;
	/** @var array<string, mixed>|null */
	private ?array $parts = null;

	protected function setUpGames(): void {
		$this->engine = new Engine();
		$this->gameMapper = $this->createMock(GameMapper::class);
		$this->gameMapper->method('findById')->willReturnCallback(fn (int $id) => $this->stored[$id] ?? null);
		$this->gameMapper->method('insert')->willReturnCallback(function (Game $game): Game {
			$game->setId($this->nextId++);
			$this->stored[$game->getId()] = $game;
			$this->log[] = 'insert game #' . $game->getId();
			return $game;
		});
		$this->gameMapper->method('updateChecked')->willReturnCallback(function (Game $game, int $expectedRev): bool {
			if (in_array($game->getId(), $this->conflicting, true)) {
				$this->log[] = 'conflict #' . $game->getId();
				return false;
			}
			if (!$this->updateOk) {
				$this->updateOk = true;
				if ($this->onConflict !== null) {
					($this->onConflict)();
					$this->onConflict = null;
				}
				$this->log[] = 'conflict #' . $game->getId();
				return false;
			}
			$this->log[] = 'save #' . $game->getId() . ' rev ' . $expectedRev . '→' . $game->getRev();
			return true;
		});
		$this->gameMapper->method('deleteWithChildren')->willReturnCallback(function (int $id): void {
			$this->log[] = 'delete #' . $id;
			unset($this->stored[$id]);
		});
		$this->gameMapper->method('clearUser')->willReturnCallback(function (int $id, string $uid): void {
			$this->log[] = 'clear games #' . $id . ' ' . $uid;
			$game = $this->stored[$id] ?? null;
			if ($game !== null) {
				foreach (['White', 'Black', 'Creator', 'Opponent'] as $seat) {
					if ($uid === $game->{'get' . $seat . 'Uid'}()) {
						$game->{'set' . $seat . 'Uid'}(null);
					}
				}
			}
		});
		$this->moveMapper = $this->createMock(MoveMapper::class);
		$this->moveMapper->method('insert')->willReturnCallback(function (Move $move): Move {
			$this->log[] = 'insert move ' . $move->getCode();
			return $move;
		});
		$this->moveMapper->method('clearUser')->willReturnCallback(function (int $id, string $uid): void {
			$this->log[] = 'clear moves #' . $id . ' ' . $uid;
		});
		$this->chatMapper = $this->createMock(ChatMapper::class);
		$this->chatMapper->method('insert')->willReturnCallback(function (ChatMessage $line): ChatMessage {
			$this->log[] = 'chat #' . $line->getGameId() . ' ' . $line->getMessage() . ($line->getParams() === null ? '' : ' ' . $line->getParams());
			return $line;
		});
		$this->chatMapper->method('deleteByGame')->willReturnCallback(function (int $id): int {
			$this->log[] = 'purge chat #' . $id;
			return 1;
		});
		$this->chatMapper->method('deleteOwn')->willReturnCallback(function (int $id, string $uid): void {
			$this->log[] = 'delete own chat #' . $id . ' ' . $uid;
		});
		$this->notifications = $this->createMock(NotificationService::class);
		foreach (['invite', 'inviteAccepted', 'inviteDeclined', 'inviteClosed', 'yourTurn', 'drawOffered', 'drawClosed', 'gameOver',
			'chat', 'gameEndedDeleted', 'markSeen', 'removeForGame'] as $method) {
			$this->notifications->method($method)->willReturnCallback(function (mixed ...$args) use ($method): void {
				$this->log[] = 'notify ' . $method . '(' . implode(', ', array_map(static fn (mixed $arg): string => match (true) {
					$arg instanceof Game => '#' . $arg->getId(),
					is_object($arg) => (new \ReflectionClass($arg))->getShortName(),
					default => var_export($arg, true),
				}, $args)) . ')';
			});
		}
		$this->ratings = $this->createMock(RatingService::class);
		$this->ratings->method('applyResult')->willReturnCallback(function (Game $game): void {
			$this->log[] = 'rate #' . $game->getId() . ' ' . $game->getResult();
		});
		$this->userManager = $this->createMock(IUserManager::class);
		$this->random = new FakeRandomSource();
	}

	private function settingsMock(): AppSettings&MockObject {
		$settings = $this->createMock(AppSettings::class);
		foreach (array_keys($this->config) as $method) {
			$settings->method($method)->willReturnCallback(fn () => $this->config[$method]);
		}
		return $settings;
	}

	private function policyMock(): InvitePolicy&MockObject {
		$error = fn (string $code): ApiException => new ApiException(ApiError::from($code), $code);
		$policy = $this->createMock(InvitePolicy::class);
		$policy->method('isMultiplayerUser')->willReturnCallback(fn () => $this->allow['multiplayer']);
		$policy->method('canSeeOpenChallenge')->willReturnCallback(fn () => $this->allow['seeOpen']);
		$policy->method('isInGroup')->willReturnCallback(fn () => $this->allow['inGroup']);
		$policy->method('assertCanInvite')->willReturnCallback(function (string $from, string $to) use ($error): string {
			if (is_string($this->allow['invite'])) {
				throw $error($this->allow['invite']);
			}
			return strtolower($to);
		});
		$policy->method('assertWithinLimits')->willReturnCallback(function () use ($error): void {
			if (is_string($this->allow['limits'])) {
				throw $error($this->allow['limits']);
			}
		});
		$policy->method('assertActiveLimit')->willReturnCallback(function () use ($error): void {
			if (is_string($this->allow['active'])) {
				throw $error($this->allow['active']);
			}
		});
		return $policy;
	}

	private function database(): IDBConnection {
		$db = $this->createMock(IDBConnection::class);
		$db->method('beginTransaction')->willReturnCallback(function (): void {
			$this->log[] = 'begin';
		});
		$db->method('commit')->willReturnCallback(function (): void {
			$this->log[] = 'commit';
		});
		$db->method('rollBack')->willReturnCallback(function (): void {
			$this->log[] = 'rollback';
		});
		return $db;
	}

	private function clock(): ITimeFactory {
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(GameBuilder::NOW);
		return $time;
	}

	private function l10n(): IL10N {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnCallback(fn (string $text, array $parameters = []) => vsprintf($text, $parameters));
		return $l;
	}

	/** Stores games so that the services find them by id. */
	protected function store(Game ...$games): void {
		foreach ($games as $game) {
			$this->stored[(int)$game->getId()] = $game;
		}
	}

	/**
	 * The shared building blocks of the services, created once per test so that all services share one transaction.
	 *
	 * @return array{repository: GameRepository, transaction: GameTransaction, lifecycle: GameLifecycle, clock: GameClock, policy: InvitePolicy, settings: AppSettings, errors: GameErrors}
	 */
	private function parts(): array {
		if ($this->parts === null) {
			$clock = new GameClock($this->clock());
			$policy = $this->policyMock();
			$settings = $this->settingsMock();
			$errors = new GameErrors($this->l10n());
			$repository = new GameRepository($this->gameMapper, $policy, $this->engine, $clock, $errors);
			$transaction = new GameTransaction($this->database(), $this->createMock(LoggerInterface::class));
			$lifecycle = new GameLifecycle($repository, $transaction, $clock, $this->random, $this->ratings, $this->notifications,
				$this->chatMapper, $settings, $this->engine, $errors);
			$this->parts = compact('repository', 'transaction', 'lifecycle', 'clock', 'policy', 'settings', 'errors');
		}
		return $this->parts;
	}

	protected function invitations(): InvitationService {
		$p = $this->parts();
		return new InvitationService($p['repository'], $p['lifecycle'], $p['transaction'], $p['policy'], $p['settings'], $p['clock'],
			$this->engine, $this->notifications, $this->l10n(), $p['errors']);
	}

	protected function gameplay(): GameplayService {
		$p = $this->parts();
		return new GameplayService($p['repository'], $p['lifecycle'], $p['transaction'], $this->moveMapper, $this->engine, $this->random,
			$p['clock'], $this->notifications, $this->l10n(), $p['errors']);
	}

	protected function chat(): ChatService {
		$p = $this->parts();
		return new ChatService($p['lifecycle'], $p['repository'], $p['transaction'], $this->chatMapper, $p['settings'], $this->notifications,
			$p['clock'], $this->l10n(), $p['errors']);
	}

	protected function queries(): GameQueryService {
		$p = $this->parts();
		return new GameQueryService($this->gameMapper, $this->moveMapper, $this->chatMapper, $p['lifecycle'], $p['policy'], $p['clock'],
			$p['settings'], $this->notifications, $this->userManager, $this->l10n());
	}

	protected function maintenance(): GameMaintenanceService {
		$p = $this->parts();
		return new GameMaintenanceService($this->gameMapper, $this->moveMapper, $this->chatMapper, $p['repository'], $p['lifecycle'],
			$p['transaction'], $p['settings'], $this->notifications, $p['clock']);
	}

	/**
	 * Runs `$fn` and returns the error it throws as `[code, status, extra]`.
	 *
	 * @return array{0: string, 1: int, 2: array<string, mixed>}
	 */
	protected function apiError(callable $fn): array {
		try {
			$fn();
		} catch (ApiException $e) {
			return [$e->getErrorCode(), $e->getStatus(), $e->getExtra()];
		}
		$this->fail('expected an ApiException');
	}
}
