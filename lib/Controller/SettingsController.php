<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\AiUsageService;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCA\QuantumChess\Service\Ai\NextcloudAiProvider;
use OCA\QuantumChess\Service\Ai\Presets;
use OCA\QuantumChess\Service\GameService;
use OCA\QuantumChess\Service\SettingsService;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PasswordConfirmationRequired;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IAppConfig;
use OCP\ICacheFactory;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Personal, multiplayer and admin settings (docs/SPEC.md §7.4.8). Admin methods lack #[NoAdminRequired].
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class SettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private SettingsService $settings,
		private AiSourceService $sources,
		private LlmService $llm,
		private AiUsageService $usage,
		private NextcloudAiProvider $nextcloudAi,
		private GameService $games,
		private IGroupManager $groupManager,
		private IAppManager $appManager,
		private IAppConfig $appConfig,
		private ICacheFactory $cacheFactory,
		private IL10N $l,
		private LoggerInterface $logger,
		private ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @param callable(string): (array|JSONResponse) $fn
	 */
	private function run(callable $fn): JSONResponse {
		try {
			if ($this->userId === null) {
				throw new ApiException('not_found', 'Not logged in', 404);
			}
			if ((int)$this->request->getHeader('Content-Length') > AiController::MAX_BODY) {
				throw new ApiException('too_large', $this->l->t('The request is too large.'), 413);
			}
			$result = $fn($this->userId);
			return $result instanceof JSONResponse ? $result : new JSONResponse($result);
		} catch (ApiException $e) {
			return $e->toResponse();
		} catch (\Throwable $e) {
			return ApiException::internal($e, $this->logger);
		}
	}

	/** @return array<string, mixed> */
	private function personal(string $uid): array {
		return $this->settings->getPersonal($uid) + ['sources' => $this->sources->sourcesFor($uid)['sources']];
	}

	#[NoAdminRequired]
	public function getPersonal(): JSONResponse {
		return $this->run(fn (string $uid): array => $this->personal($uid));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 600)]
	public function setPersonal(): JSONResponse {
		return $this->run(function (string $uid): array {
			$this->settings->setPersonal($uid, $this->body(['provider', 'apiKey', 'defaultSource']));
			return $this->personal($uid);
		});
	}

	#[NoAdminRequired]
	public function getMultiplayer(): JSONResponse {
		return $this->run(fn (string $uid): array => $this->settings->getMultiplayer($uid));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 600)]
	public function setMultiplayer(): JSONResponse {
		return $this->run(fn (string $uid): array => $this->settings->setMultiplayer($uid, $this->body(['listed', 'notifications', 'invitePolicy', 'blocked'])));
	}

	public function getAdmin(): JSONResponse {
		return $this->run(fn (): array => $this->admin());
	}

	public function setAdmin(): JSONResponse {
		return $this->run(function (): array {
			$params = $this->request->getParams();
			$patch = [];
			foreach ($params as $key => $value) {
				if (is_string($key) && !str_starts_with($key, '_')) {
					$patch[$key] = $value;
				}
			}
			$this->settings->setAdmin($patch);
			return $this->admin();
		});
	}

	#[PasswordConfirmationRequired]
	public function setAdminSecret(mixed $key = null, mixed $value = null): JSONResponse {
		return $this->run(function () use ($key, $value): array {
			if (!is_string($key) || ($value !== null && !is_string($value))) {
				throw new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => 'key']);
			}
			$info = $this->settings->setAdminSecret($key, $value);
			return ['hasKey' => $info['hasKey'], 'keyHint' => $info['keyHint']];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 10, period: 600)]
	public function test(): JSONResponse {
		return $this->run(fn (string $uid): array => $this->llm->testConnection(
			$uid,
			$this->body(['scope', 'preset', 'kind', 'baseUrl', 'model', 'apiKey']),
			$this->groupManager->isAdmin($uid),
		));
	}

	/**
	 * The known body fields that were sent.
	 *
	 * @param list<string> $keys
	 * @return array<string, mixed>
	 */
	private function body(array $keys): array {
		$params = $this->request->getParams();
		$body = [];
		foreach ($keys as $key) {
			if (array_key_exists($key, $params)) {
				$body[$key] = $params[$key];
			}
		}
		foreach (array_keys($params) as $key) {
			if (is_string($key) && !str_starts_with($key, '_') && !in_array($key, $keys, true)) {
				throw new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => $key]);
			}
		}
		return $body;
	}

	/** @return array<string, mixed> */
	private function admin(): array {
		$type = $this->nextcloudAi->taskType((string)$this->userId);
		$diagnostics = $this->games->diagnostics();
		return $this->settings->getAdmin() + [
			'presets' => Presets::publicList(),
			'status' => [
				'ncAi' => [
					'providerName' => $type === null ? null : $this->nextcloudAi->providerName($type),
					'taskTypes' => $type === null ? [] : [$type],
					'medianLatencyMs' => $this->usage->medianLatency(),
				],
				'diagnostics' => [
					'activeGames' => $diagnostics['active'],
					'finishedToday' => $diagnostics['finishedToday'],
					'aiRequestsToday' => $this->usage->today(),
					'distributedCache' => $this->cacheFactory->isAvailable(),
					'notifyPush' => $this->appManager->isEnabledForUser('notify_push'),
					'backgroundJobMode' => $this->appConfig->getValueString('core', 'backgroundjobs_mode', 'ajax'),
				],
			],
		];
	}
}
