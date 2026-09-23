<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\PreferencesService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * In-app preferences (docs/SPEC.md §7.4.6, §11.3).
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class PreferencesController extends Controller {
	public function __construct(
		IRequest $request,
		private PreferencesService $preferences,
		private LoggerInterface $logger,
		private ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 600)]
	public function update(mixed $preferences = null): JSONResponse {
		try {
			if ($this->userId === null) {
				throw new ApiException('not_found', 'Not logged in', 404);
			}
			if (!is_array($preferences)) {
				throw new ApiException('invalid_argument', 'Invalid preferences', 400, ['field' => 'preferences']);
			}
			return new JSONResponse(['preferences' => (object)$this->preferences->set($this->userId, $preferences)]);
		} catch (ApiException $e) {
			return $e->toResponse();
		} catch (\Throwable $e) {
			return ApiException::internal($e, $this->logger);
		}
	}
}
