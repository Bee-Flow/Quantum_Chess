<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSettingsService;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\ConnectionTester;
use OCA\QuantumChess\Service\Ai\Provider\Presets;
use OCA\QuantumChess\Service\Settings\AdminStatusService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PasswordConfirmationRequired;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * The routes of the settings pages: the user's LLM and online game settings, the admin settings, and the connection
 * test. The admin actions have no #[NoAdminRequired], so only administrators reach them.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class SettingsController extends ApiController {
	public function __construct(
		IRequest $request,
		IL10N $l,
		LoggerInterface $logger,
		?string $userId,
		private readonly AppSettings $settings,
		private readonly AiSettingsService $aiSettings,
		private readonly MultiplayerSettingsService $multiplayer,
		private readonly AiSourceService $sources,
		private readonly ConnectionTester $tester,
		private readonly AdminStatusService $status,
		private readonly IGroupManager $groupManager,
	) {
		parent::__construct($request, $l, $logger, $userId);
	}

	/** @return array<string, mixed> */
	private function personal(string $uid): array {
		return $this->aiSettings->getPersonal($uid) + ['sources' => $this->sources->sourcesFor($uid)['sources']];
	}

	#[NoAdminRequired]
	public function getPersonal(): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->personal($uid));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 600)]
	public function setPersonal(): JSONResponse {
		return $this->respondWithSizeLimit(function (string $uid): array {
			$this->aiSettings->setPersonal($uid, $this->requestBody(['provider', 'apiKey', 'defaultSource']));
			return $this->personal($uid);
		});
	}

	#[NoAdminRequired]
	public function getMultiplayer(): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->multiplayer->getMultiplayer($uid));
	}

	/**
	 * Changes the online game settings. `invitePolicy` and `blocked` are accepted as fields but refused by the
	 * service, so they report their own name as the invalid field.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 600)]
	public function setMultiplayer(): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->multiplayer->setMultiplayer($uid, $this->requestBody(['listed', 'notifications', 'invitePolicy', 'blocked'])));
	}

	public function getAdmin(): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->admin($uid));
	}

	public function setAdmin(): JSONResponse {
		return $this->respondWithSizeLimit(function (string $uid): array {
			$this->settings->setAdmin($this->bodyParams());
			return $this->admin($uid);
		});
	}

	/**
	 * Stores or deletes the organisation provider's API key; this needs the administrator's password.
	 */
	#[PasswordConfirmationRequired]
	public function setAdminSecret(mixed $key = null, mixed $value = null): JSONResponse {
		return $this->respondWithSizeLimit(function () use ($key, $value): array {
			if (!is_string($key) || ($value !== null && !is_string($value))) {
				throw ApiException::invalidArgument('key', $this->l->t('Invalid value'));
			}
			$info = $this->aiSettings->setAdminSecret($key, $value);
			return ['hasKey' => $info['hasKey'], 'keyHint' => $info['keyHint']];
		});
	}

	/**
	 * Tests a provider that is not saved yet. Only administrators may test the organisation provider.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 10, period: 600)]
	public function test(): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->tester->test(
			$uid,
			$this->requestBody(['scope', 'preset', 'kind', 'baseUrl', 'model', 'apiKey']),
			$this->groupManager->isAdmin($uid),
		));
	}

	/**
	 * The admin settings with the provider presets and the status card.
	 *
	 * @return array<string, mixed>
	 */
	private function admin(string $uid): array {
		$status = $this->status->status($uid);
		return $this->settings->getAdmin() + [
			'presets' => Presets::publicList(),
			'status' => $status,
		];
	}
}
