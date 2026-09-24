<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service;

use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Game\InvitePolicy;
use OCA\QuantumChess\Service\InitialStateService;
use OCA\QuantumChess\Service\Player\PreferencesService;
use OCA\QuantumChess\Service\Player\TrainerProgressService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\App\IAppManager;
use OCP\AppFramework\Services\IInitialState;
use OCP\Config\IUserConfig;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\L10N\IFactory;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The initial state of the app page: its keys, their order and their values.
 */
#[CoversClass(InitialStateService::class)]
final class InitialStateServiceTest extends TestCase {
	private bool $multiplayer = true;
	private bool $lobbyFails = false;
	/** @var list<mixed> the stored acknowledgements of the LLM privacy notice */
	private array $acks = ['shared', 7, 'unknown'];
	/** @var list<string> */
	private array $logged = [];

	/**
	 * @return array<string, mixed> the provided states, JSON-encoded and decoded as the browser sees them
	 */
	private function provide(): array {
		$provided = [];
		$initialState = $this->createMock(IInitialState::class);
		$initialState->method('provideInitialState')->willReturnCallback(
			function (string $key, mixed $data) use (&$provided): void {
				$provided[$key] = json_encode($data);
			},
		);
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('bob');
		$user->method('getDisplayName')->willReturn('Bob B.');
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('isAdmin')->willReturn(true);
		$l10n = $this->createMock(IFactory::class);
		$l10n->method('getUserLanguage')->willReturn('nl');
		$l10n->method('findLocale')->willReturn('nl_NL');
		$apps = $this->createMock(IAppManager::class);
		$apps->method('getAppVersion')->willReturn('1.0.0');
		$userConfig = $this->createMock(IUserConfig::class);
		$userConfig->method('getValueArray')->willReturnCallback(
			fn (string $uid, string $app, string $key) => $key === 'ai_notice_ack' ? $this->acks : [],
		);
		$settings = $this->createMock(AppSettings::class);
		$settings->method('openChallengesEnabled')->willReturn(true);
		$settings->method('ratedEnabled')->willReturn(false);
		$settings->method('chatEnabled')->willReturn(true);
		$settings->method('leaderboardMode')->willReturn('opt-out');
		$policy = $this->createMock(InvitePolicy::class);
		$policy->method('isMultiplayerUser')->willReturnCallback(fn () => $this->multiplayer);
		$games = $this->createMock(GameQueryService::class);
		$games->method('getLobby')->willReturnCallback(
			fn () => $this->lobbyFails ? throw new \RuntimeException('database down') : [],
		);
		$games->method('lobbyToken')->willReturn('u1.o2');
		$serializer = $this->createMock(GameSerializer::class);
		$serializer->method('lobby')->willReturnCallback(
			fn (array $groups, string $viewer, string $token) => ['rev' => $token, 'viewer' => $viewer],
		);
		$preferences = $this->createMock(PreferencesService::class);
		$preferences->method('get')->willReturn([]);
		$progress = $this->createMock(TrainerProgressService::class);
		$progress->method('get')->willReturn(['xp' => 40]);
		$sources = $this->createMock(AiSourceService::class);
		$sources->method('summary')->willReturn([
			'nextcloud' => true,
			'shared' => false,
			'personal' => false,
			'any' => true,
			'default' => 'nextcloud',
		]);
		$logger = $this->createMock(LoggerInterface::class);
		$logger->method('error')->willReturnCallback(function (string $message): void {
			$this->logged[] = $message;
		});
		$service = new InitialStateService(
			$initialState,
			$groups,
			$l10n,
			$apps,
			$userConfig,
			$settings,
			$policy,
			$sources,
			$preferences,
			$progress,
			$games,
			$serializer,
			$logger,
		);
		$service->provide($user);
		return $provided;
	}

	public function testInitialState(): void {
		$this->assertSame([
			'user' => '{"uid":"bob","displayName":"Bob B.","isAdmin":true,"language":"nl","locale":"nl_NL"}',
			'features'
				=> '{"multiplayer":true,"openChallenges":true,"rated":false,"chat":true,"leaderboardMode":"opt-out",'
				. '"ai":{"nextcloud":true,"shared":false,"personal":false,"any":true,"default":"nextcloud","noticeAcked":["shared","unknown"]},'
				. '"distributedCache":false,"notifyPush":false}',
			'preferences' => '{}',
			'lobby' => '{"rev":"u1.o2","viewer":"bob"}',
			'trainerProgress' => '{"xp":40}',
			'appVersion' => '"1.0.0"',
		], $this->provide());
	}

	public function testWithoutOnlineGames(): void {
		$this->multiplayer = false;
		$state = $this->provide();
		$this->assertSame('null', $state['lobby']);
		$this->assertStringContainsString('"multiplayer":false,"openChallenges":false,', $state['features']);
	}

	public function testALobbyFailureStillRendersThePage(): void {
		$this->lobbyFails = true;
		$this->assertSame('null', $this->provide()['lobby']);
		$this->assertCount(1, $this->logged);
	}
}
