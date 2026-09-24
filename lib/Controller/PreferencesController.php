<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Player\PreferencesService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * The in-app preferences of the user.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class PreferencesController extends ApiController {
	public function __construct(
		IRequest $request,
		IL10N $l,
		LoggerInterface $logger,
		?string $userId,
		private readonly PreferencesService $preferences,
	) {
		parent::__construct($request, $l, $logger, $userId);
	}

	/**
	 * Replaces the preferences with the given object.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 600)]
	public function update(mixed $preferences = null): JSONResponse {
		return $this->respond(function (string $uid) use ($preferences): array {
			if (!is_array($preferences)) {
				throw ApiException::invalidArgument('preferences', 'Invalid preferences');
			}
			return ['preferences' => (object)$this->preferences->set($uid, $preferences)];
		});
	}
}
