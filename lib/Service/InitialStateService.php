<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Game\InvitePolicy;
use OCA\QuantumChess\Service\Player\PreferencesService;
use OCA\QuantumChess\Service\Player\TrainerProgressService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\App\IAppManager;
use OCP\AppFramework\Services\IInitialState;
use OCP\Config\IUserConfig;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\L10N\IFactory;
use Psr\Log\LoggerInterface;

/**
 * The initial state of the app page, so that the first screen renders without an API request.
 *
 * It provides `user`, `features`, `preferences`, `lobby`, `trainerProgress` and `appVersion`; the web app reads them
 * by these names. It brings together what the first screen shows, so it depends on many services.
 */
class InitialStateService {
	public function __construct(
		private readonly IInitialState $initialState,
		private readonly IGroupManager $groupManager,
		private readonly IFactory $l10nFactory,
		private readonly IAppManager $appManager,
		private readonly IUserConfig $userConfig,
		private readonly AppSettings $settings,
		private readonly InvitePolicy $policy,
		private readonly AiSourceService $aiSources,
		private readonly PreferencesService $preferences,
		private readonly TrainerProgressService $progress,
		private readonly GameQueryService $games,
		private readonly GameSerializer $serializer,
		private readonly LoggerInterface $logger,
	) {
	}

	/**
	 * Provides the initial state for the logged-in user. A lobby that cannot be loaded is left out, so the page still
	 * renders.
	 */
	public function provide(IUser $user): void {
		$uid = $user->getUID();
		$multiplayer = $this->policy->isMultiplayerUser($uid);
		$ai = $this->aiSources->summary($uid);
		$ack = $this->userConfig->getValueArray($uid, Application::APP_ID, 'ai_notice_ack', []);
		$this->initialState->provideInitialState('user', [
			'uid' => $uid,
			'displayName' => $user->getDisplayName(),
			'isAdmin' => $this->groupManager->isAdmin($uid),
			'language' => $this->l10nFactory->getUserLanguage($user),
			'locale' => $this->l10nFactory->findLocale(),
		]);
		$this->initialState->provideInitialState('features', [
			'multiplayer' => $multiplayer,
			'openChallenges' => $multiplayer && $this->settings->openChallengesEnabled(),
			'rated' => $this->settings->ratedEnabled(),
			'chat' => $this->settings->chatEnabled(),
			'leaderboardMode' => $this->settings->leaderboardMode(),
			'ai' => $ai + ['noticeAcked' => array_values(array_filter($ack, 'is_string'))],
			'distributedCache' => false,
			'notifyPush' => false,
		]);
		$this->initialState->provideInitialState('preferences', self::jsonObject($this->preferences->get($uid)));
		$lobby = null;
		if ($multiplayer) {
			try {
				$lobby = $this->serializer->lobby($this->games->getLobby($uid), $uid, $this->games->lobbyToken($uid));
			} catch (\Throwable $e) {
				$this->logger->error('Could not load the lobby for the initial state.', ['exception' => $e]);
			}
		}
		// Without multiplayer, or when the lobby cannot be loaded, the client gets `null` and loads the lobby itself.
		/** @psalm-suppress PossiblyNullArgument the state is JSON-encoded, and null is a valid value */
		$this->initialState->provideInitialState('lobby', $lobby);
		$this->initialState->provideInitialState('trainerProgress', self::jsonObject($this->progress->get($uid)));
		$this->initialState->provideInitialState('appVersion', $this->appManager->getAppVersion(Application::APP_ID));
	}

	/**
	 * Wraps a document so that an empty one is encoded as `{}`, not `[]`.
	 *
	 * @param array<string, mixed> $data
	 */
	private static function jsonObject(array $data): \JsonSerializable {
		return new class($data) implements \JsonSerializable {
			/** @param array<string, mixed> $data */
			public function __construct(
				private readonly array $data,
			) {
			}

			public function jsonSerialize(): mixed {
				return (object)$this->data;
			}
		};
	}
}
