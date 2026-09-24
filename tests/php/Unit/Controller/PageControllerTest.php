<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Controller;

use OCA\QuantumChess\Controller\PageController;
use OCA\QuantumChess\Service\InitialStateService;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The short link to a game opens the app page at the game's route.
 */
#[CoversClass(PageController::class)]
final class PageControllerTest extends TestCase {
	public function testTheShortLinkRedirectsToTheGameRouteOfTheApp(): void {
		$url = $this->createMock(IURLGenerator::class);
		$url->method('linkToRoute')->with('quantumchess.page.index')->willReturn('/apps/quantumchess/');
		$controller = new PageController(
			$this->createMock(IRequest::class),
			$this->createMock(IUserSession::class),
			$url,
			$this->createMock(InitialStateService::class),
		);

		$this->assertSame('/apps/quantumchess/#/game/42', $controller->game(42)->getRedirectURL());
	}
}
