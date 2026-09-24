<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Game\InvitationService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCS\OCSBadRequestException;
use OCP\AppFramework\OCS\OCSForbiddenException;
use OCP\AppFramework\OCS\OCSNotFoundException;
use OCP\AppFramework\OCSController;
use OCP\IRequest;

/**
 * The actions of the app's notifications (Accept, Decline, Rematch), as OCS routes so that the web, mobile and
 * desktop clients can call them.
 *
 * Errors use Nextcloud's OCS exceptions: 404 and 403 keep their status, everything else is a 400.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class OcsGameController extends OCSController {
	public function __construct(
		IRequest $request,
		private readonly InvitationService $invitations,
		private readonly GameplayService $gameplay,
		private readonly GameSerializer $serializer,
		private readonly ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @param callable(string): Game $action receives the user id
	 * @throws OCSNotFoundException|OCSForbiddenException|OCSBadRequestException
	 */
	private function run(callable $action): DataResponse {
		if ($this->userId === null) {
			throw new OCSNotFoundException();
		}
		try {
			$game = $action($this->userId);
		} catch (ApiException $e) {
			throw match ($e->getStatus()) {
				404 => new OCSNotFoundException($e->getMessage()),
				403 => new OCSForbiddenException($e->getMessage()),
				default => new OCSBadRequestException($e->getMessage()),
			};
		}
		return new DataResponse(['game' => $this->serializer->summary($game, $this->userId)]);
	}

	/**
	 * @throws OCSNotFoundException|OCSForbiddenException|OCSBadRequestException
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function accept(int $id): DataResponse {
		return $this->run(fn (string $uid) => $this->invitations->accept($id, $uid));
	}

	/**
	 * @throws OCSNotFoundException|OCSForbiddenException|OCSBadRequestException
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function decline(int $id): DataResponse {
		return $this->run(fn (string $uid) => $this->invitations->decline($id, $uid));
	}

	/**
	 * @throws OCSNotFoundException|OCSForbiddenException|OCSBadRequestException
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function drawAccept(int $id): DataResponse {
		return $this->run(fn (string $uid) => $this->gameplay->draw($id, $uid, 'accept'));
	}

	/**
	 * @throws OCSNotFoundException|OCSForbiddenException|OCSBadRequestException
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function drawDecline(int $id): DataResponse {
		return $this->run(fn (string $uid) => $this->gameplay->draw($id, $uid, 'decline'));
	}

	/**
	 * @throws OCSNotFoundException|OCSForbiddenException|OCSBadRequestException
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function rematch(int $id): DataResponse {
		return $this->run(fn (string $uid) => $this->invitations->rematch($id, $uid));
	}
}
