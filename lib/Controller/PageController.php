<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Service\InitialStateService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;

/**
 * The app page, which hosts the web app, and the short links to a game.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class PageController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly IUserSession $userSession,
		private readonly IURLGenerator $url,
		private readonly InitialStateService $initialState,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * The app page with its initial state. The content security policy allows the computer player's Web Worker.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		Util::addScript(Application::APP_ID, Application::APP_ID . '-main');
		$user = $this->userSession->getUser();
		if ($user !== null) {
			$this->initialState->provide($user);
		}
		$response = new TemplateResponse(Application::APP_ID, 'main');
		$csp = new ContentSecurityPolicy();
		$csp->addAllowedWorkerSrcDomain("'self'");
		$response->setContentSecurityPolicy($csp);
		return $response;
	}

	/**
	 * A short link to a game (`/g/42`), which opens it in the app (the app routes with the URL hash).
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function game(int $id): RedirectResponse {
		return new RedirectResponse($this->url->linkToRoute('quantumchess.page.index') . '#/game/' . $id);
	}
}
