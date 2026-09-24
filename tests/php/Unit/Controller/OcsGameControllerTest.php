<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Controller;

use OCA\QuantumChess\Controller\OcsGameController;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Game\InvitationService;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCP\AppFramework\OCS\OCSBadRequestException;
use OCP\AppFramework\OCS\OCSException;
use OCP\AppFramework\OCS\OCSForbiddenException;
use OCP\AppFramework\OCS\OCSNotFoundException;
use OCP\IRequest;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The notification actions: each calls its service for the logged-in user, answers the game summary, and maps API
 * errors onto Nextcloud's OCS exceptions.
 */
#[CoversClass(OcsGameController::class)]
final class OcsGameControllerTest extends TestCase {
	private InvitationService&MockObject $invitations;
	private GameplayService&MockObject $gameplay;
	private GameSerializer&MockObject $serializer;
	private Game $game;

	protected function setUp(): void {
		$this->invitations = $this->createMock(InvitationService::class);
		$this->gameplay = $this->createMock(GameplayService::class);
		$this->serializer = $this->createMock(GameSerializer::class);
		$this->serializer->method('summary')->willReturnCallback(
			fn (Game $game, string $viewer) => ['id' => $game->getId(), 'viewer' => $viewer],
		);
		$this->game = GameBuilder::pending();
	}

	private function controller(?string $userId = 'bob'): OcsGameController {
		return new OcsGameController(
			$this->createMock(IRequest::class),
			$this->invitations,
			$this->gameplay,
			$this->serializer,
			$userId,
		);
	}

	public function testEachActionCallsItsServiceAndAnswersTheSummary(): void {
		$this->invitations->expects($this->once())->method('accept')->with(7, 'bob')->willReturn($this->game);
		$this->invitations->expects($this->once())->method('decline')->with(7, 'bob')->willReturn($this->game);
		$this->invitations->expects($this->once())->method('rematch')->with(7, 'bob')->willReturn($this->game);
		$draws = [];
		$this->gameplay->method('draw')
			->willReturnCallback(function (int $id, string $uid, string $action) use (&$draws): Game {
				$draws[] = [$id, $uid, $action];
				return $this->game;
			});

		$controller = $this->controller();
		foreach (['accept', 'decline', 'drawAccept', 'drawDecline', 'rematch'] as $action) {
			$this->assertSame(['game' => ['id' => 7, 'viewer' => 'bob']], $controller->$action(7)->getData(), $action);
		}
		$this->assertSame([[7, 'bob', 'accept'], [7, 'bob', 'decline']], $draws);
	}

	public function testWithoutAUserEveryActionIsNotFound(): void {
		$this->invitations->expects($this->never())->method('accept');
		$this->expectException(OCSNotFoundException::class);
		$this->controller(null)->accept(7);
	}

	public function testMapsApiErrorsOntoOcsExceptions(): void {
		$cases = [
			[ApiException::notFound('Gone'), OCSNotFoundException::class],
			[new ApiException(ApiError::NotYourTurn, 'Not yours'), OCSForbiddenException::class],
			[ApiException::invalidStatus('Too late'), OCSBadRequestException::class],
			[ApiException::invalidArgument('id', 'Bad'), OCSBadRequestException::class],
		];
		foreach ($cases as [$error, $expected]) {
			$invitations = $this->createMock(InvitationService::class);
			$invitations->method('accept')->willThrowException($error);
			$controller = new OcsGameController(
				$this->createMock(IRequest::class),
				$invitations,
				$this->gameplay,
				$this->serializer,
				'bob',
			);
			try {
				$controller->accept(7);
				$this->fail('expected ' . $expected);
			} catch (OCSException $e) {
				$this->assertInstanceOf($expected, $e, $error->getErrorCode());
				$this->assertSame($error->getMessage(), $e->getMessage());
			}
		}
	}
}
