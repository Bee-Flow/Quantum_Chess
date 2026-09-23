<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\GameSerializer;
use OCA\QuantumChess\Service\GameService;
use OCA\QuantumChess\Service\InvitePolicy;
use OCA\QuantumChess\Service\PreferencesService;
use OCA\QuantumChess\Service\SettingsService;
use OCA\QuantumChess\Service\TrainerProgressService;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Config\IUserConfig;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\L10N\IFactory;
use OCP\Util;
use Psr\Log\LoggerInterface;

/**
 * The single page app with its initial state and CSP, and the share link redirect (docs/SPEC.md §13).
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class PageController extends Controller {
	public function __construct(
		IRequest $request,
		private IInitialState $initialState,
		private IUserSession $userSession,
		private IGroupManager $groupManager,
		private IFactory $l10nFactory,
		private IAppManager $appManager,
		private IURLGenerator $url,
		private IUserConfig $userConfig,
		private SettingsService $settings,
		private InvitePolicy $policy,
		private GameService $games,
		private GameSerializer $serializer,
		private PreferencesService $preferences,
		private TrainerProgressService $progress,
		private AiSourceService $aiSources,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		Util::addScript(Application::APP_ID, Application::APP_ID . '-main');
		$user = $this->userSession->getUser();
		if ($user !== null) {
			$this->provideInitialState($user->getUID(), $user->getDisplayName());
		}
		$response = new TemplateResponse(Application::APP_ID, 'main');
		$csp = new ContentSecurityPolicy();
		$csp->addAllowedWorkerSrcDomain("'self'");
		$response->setContentSecurityPolicy($csp);
		return $response;
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function game(int $id): RedirectResponse {
		return new RedirectResponse($this->url->linkToRoute('quantumchess.page.index') . '#/game/' . $id);
	}

	/**
	 * Wraps a document so that an empty one is encoded as `{}` (initial states accept arrays or JsonSerializable).
	 *
	 * @param array<string, mixed> $data
	 */
	private static function jsonObject(array $data): \JsonSerializable {
		return new class($data) implements \JsonSerializable {
			/** @param array<string, mixed> $data */
			public function __construct(
				private array $data,
			) {
			}

			public function jsonSerialize(): mixed {
				return (object)$this->data;
			}
		};
	}

	private function provideInitialState(string $uid, string $displayName): void {
		$multiplayer = $this->policy->isMultiplayerUser($uid);
		$ai = $this->aiSources->summary($uid);
		$ack = $this->userConfig->getValueArray($uid, Application::APP_ID, 'ai_notice_ack', []);
		$this->initialState->provideInitialState('user', [
			'uid' => $uid,
			'displayName' => $displayName,
			'isAdmin' => $this->groupManager->isAdmin($uid),
			'language' => $this->l10nFactory->getUserLanguage($this->userSession->getUser()),
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
				$this->logger->error('Quantum Chess: could not load the lobby', ['exception' => $e]);
			}
		}
		$this->initialState->provideInitialState('lobby', $lobby);
		$this->initialState->provideInitialState('trainerProgress', self::jsonObject($this->progress->get($uid)));
		$this->initialState->provideInitialState('appVersion', $this->appManager->getAppVersion(Application::APP_ID));
	}
}
