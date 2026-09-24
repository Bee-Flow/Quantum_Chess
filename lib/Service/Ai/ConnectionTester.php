<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\Provider\ProviderConfig;
use OCA\QuantumChess\Service\Ai\Provider\ProviderConnection;
use OCA\QuantumChess\Service\Ai\Provider\ProviderException;
use OCA\QuantumChess\Service\Ai\Provider\ProviderFactory;
use OCA\QuantumChess\Service\Ai\Provider\UrlGuard;
use OCA\QuantumChess\Service\Ai\Provider\UrlNotAllowedException;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\IL10N;

/**
 * The "Test connection" button of the settings pages: lists the models of a provider that is not saved yet.
 *
 * Only a result code and the model list come back, never the provider's response or a key.
 */
class ConnectionTester {
	/** The most models the test returns. */
	private const MAX_MODELS = 500;

	public function __construct(
		private readonly AiSettingsService $aiSettings,
		private readonly AppSettings $settings,
		private readonly KeyStore $keys,
		private readonly UrlGuard $urlGuard,
		private readonly ProviderFactory $providers,
		private readonly IL10N $l,
	) {
	}

	/**
	 * Tests a provider. Without a key in the request, the stored key is used, but only when the provider still points
	 * at the address it was saved for.
	 *
	 * @param array<string, mixed> $request `scope` (personal, or shared for administrators), `preset`, `kind`,
	 *                                      `baseUrl`, `model` and `apiKey`
	 * @return array{ok: bool, code: ?string, modelCount: ?int, models: ?list<array{id: string, label: string}>}
	 * @throws ApiException invalid_argument, or not_found for the shared scope without admin rights
	 */
	public function test(string $uid, array $request, bool $admin): array {
		$scope = $request['scope'] ?? null;
		if ($scope !== AiSource::Personal->value && $scope !== AiSource::Shared->value) {
			throw $this->invalid('scope');
		}
		if ($scope === AiSource::Shared->value && !$admin) {
			throw ApiException::notFound($this->l->t('Not found'));
		}
		try {
			$provider = $this->aiSettings->checkProvider($request, $scope);
		} catch (ApiException $e) {
			if ($e->getError() === ApiError::UrlNotAllowed) {
				return self::failure('url_not_allowed');
			}
			throw $e;
		}
		$apiKey = $request['apiKey'] ?? null;
		if ($apiKey !== null && !is_string($apiKey)) {
			throw $this->invalid('apiKey');
		}
		$apiKey = is_string($apiKey) ? trim($apiKey) : '';
		if ($apiKey !== '' && !KeyStore::isValidKey($apiKey)) {
			throw $this->invalid('apiKey');
		}
		if ($apiKey === '') {
			// The saved key is only sent to the address it was saved for (a changed address needs the key again).
			$stored = $scope === AiSource::Shared->value ? $this->settings->sharedProvider() : $this->aiSettings->personalProvider($uid);
			if (ProviderConfig::sameEndpoint($stored, $provider)) {
				$apiKey = $scope === AiSource::Shared->value ? $this->keys->getShared() : $this->keys->getPersonal($uid);
			}
		}
		try {
			$allowLocal = $this->urlGuard->check($provider->baseUrl, $scope, $this->settings->sharedAllowLocal(), $this->settings->localAllowlist())['allowLocal'];
		} catch (UrlNotAllowedException) {
			return self::failure('url_not_allowed');
		}
		$connection = new ProviderConnection(AiSource::from($scope), $provider->kind, $provider->preset, $provider->baseUrl, $provider->model, $apiKey, $allowLocal, []);
		try {
			$models = $this->providers->create($uid, $connection)->listModels();
		} catch (ProviderException $e) {
			return self::failure($e->getUpstream());
		}
		return ['ok' => true, 'code' => null, 'modelCount' => count($models), 'models' => array_slice($models, 0, self::MAX_MODELS)];
	}

	/**
	 * @return array{ok: false, code: string, modelCount: null, models: null}
	 */
	private static function failure(string $code): array {
		return ['ok' => false, 'code' => $code, 'modelCount' => null, 'models' => null];
	}

	private function invalid(string $field): ApiException {
		return ApiException::invalidArgument($field, $this->l->t('Invalid value'));
	}
}
