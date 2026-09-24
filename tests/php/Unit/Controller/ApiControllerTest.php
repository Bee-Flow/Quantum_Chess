<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Controller;

use OCA\QuantumChess\Controller\AiController;
use OCA\QuantumChess\Controller\ApiController;
use OCA\QuantumChess\Controller\GameController;
use OCA\QuantumChess\Controller\PreferencesController;
use OCA\QuantumChess\Controller\SettingsController;
use OCA\QuantumChess\Controller\StatsController;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use OCA\QuantumChess\Service\Ai\AiSettingsService;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\ConnectionTester;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCA\QuantumChess\Service\Game\ChatService;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Game\InvitationService;
use OCA\QuantumChess\Service\Player\PreferencesService;
use OCA\QuantumChess\Service\Player\StatsService;
use OCA\QuantumChess\Service\Player\TrainerProgressService;
use OCA\QuantumChess\Service\Settings\AdminStatusService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Service\Settings\MultiplayerSettingsService;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IRequest;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * How the JSON controllers answer: the error body, the status, the `Retry-After` header, the request size limit and
 * the unexpected-error fallback.
 */
#[CoversClass(ApiController::class)]
#[CoversClass(ApiException::class)]
#[CoversClass(ApiError::class)]
final class ApiControllerTest extends TestCase {
	/** @var list<string> */
	private array $logged = [];
	/** @var array<string, mixed> */
	private array $params = [];
	private int $contentLength = 0;
	private GameQueryService&MockObject $queries;
	private InvitationService&MockObject $invitations;
	private GameplayService&MockObject $gameplay;
	private GameSerializer&MockObject $serializer;

	protected function setUp(): void {
		$this->queries = $this->createMock(GameQueryService::class);
		$this->invitations = $this->createMock(InvitationService::class);
		$this->gameplay = $this->createMock(GameplayService::class);
		$this->serializer = $this->createMock(GameSerializer::class);
	}

	private function request(): IRequest {
		$request = $this->createMock(IRequest::class);
		$request->method('getHeader')->willReturnCallback(
			fn (string $name) => $name === 'Content-Length' ? (string)$this->contentLength : '',
		);
		$request->method('getParams')->willReturnCallback(fn () => $this->params);
		return $request;
	}

	private function logger(): LoggerInterface {
		$logger = $this->createMock(LoggerInterface::class);
		$logger->method('error')->willReturnCallback(function (string $message, array $context = []): void {
			$this->logged[] = $message;
		});
		return $logger;
	}

	private function l10n(): IL10N {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnArgument(0);
		return $l;
	}

	private function gameController(?string $userId = 'alice'): GameController {
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(GameBuilder::NOW);
		return new GameController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			$userId,
			$this->queries,
			$this->invitations,
			$this->gameplay,
			$this->createMock(ChatService::class),
			$this->serializer,
			new GameClock($time),
		);
	}

	private function aiController(?string $userId = 'alice'): AiController {
		return new AiController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			$userId,
			$this->createMock(LlmService::class),
			$this->createMock(AiSourceService::class),
			$this->createMock(AiSettingsService::class),
		);
	}

	private function settingsController(?string $userId = 'alice'): SettingsController {
		return new SettingsController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			$userId,
			$this->createMock(AppSettings::class),
			$this->createMock(AiSettingsService::class),
			$this->createMock(MultiplayerSettingsService::class),
			$this->createMock(AiSourceService::class),
			$this->createMock(ConnectionTester::class),
			$this->createMock(AdminStatusService::class),
			$this->createMock(IGroupManager::class),
		);
	}

	/**
	 * @return array{0: int, 1: mixed, 2: array<string, string>}
	 */
	private static function answer(JSONResponse $response): array {
		$headers = (new \ReflectionProperty(Response::class, 'headers'))->getValue($response);
		return [$response->getStatus(), $response->getData(), array_intersect_key($headers, ['Retry-After' => 0])];
	}

	public function testAnswersWithTheResultAndItsStatus(): void {
		$this->invitations->method('create')->willReturn(GameBuilder::pending());
		$this->serializer->method('live')->willReturn(['id' => 7]);
		$this->assertSame([201, ['game' => ['id' => 7]], []], self::answer($this->gameController()->create('bob')));
	}

	public function testApiErrors(): void {
		$this->invitations->method('accept')
			->willThrowException(new ApiException(ApiError::TooManyActive, 'Too many games'));
		$this->gameplay->method('draw')
			->willThrowException(new ApiException(ApiError::DrawNotAllowed, 'Not now', ['availableAtPly' => 6]));
		$this->invitations->method('cancel')->willThrowException(new ApiException(ApiError::AiBusy, 'Wait', [], 5));
		$controller = $this->gameController();
		$this->assertSame(
			[429, ['error' => 'too_many_active', 'message' => 'Too many games'], []],
			self::answer($controller->accept(7)),
		);
		$this->assertSame(
			[409, ['error' => 'draw_not_allowed', 'message' => 'Not now', 'availableAtPly' => 6], []],
			self::answer($controller->draw(7, 'offer')),
		);
		$this->assertSame(
			[429, ['error' => 'ai_busy', 'message' => 'Wait'], ['Retry-After' => '5']],
			self::answer($controller->cancel(7)),
		);
	}

	public function testUnexpectedErrorsAreLoggedAndHidden(): void {
		$this->gameplay->method('resign')->willThrowException(new \RuntimeException('database down'));
		$this->assertSame(
			[500, ['error' => 'internal', 'message' => 'Internal error'], []],
			self::answer($this->gameController()->resign(7)),
		);
		$this->assertCount(1, $this->logged);
		$this->assertStringContainsString('database down', $this->logged[0]);
	}

	public function testWithoutAUser(): void {
		$this->contentLength = 100000;
		$expected = [404, ['error' => 'not_found', 'message' => 'Not logged in'], []];
		$this->assertSame($expected, self::answer($this->gameController(null)->index()));
		$this->assertSame($expected, self::answer($this->aiController(null)->providers()));
		$this->assertSame($expected, self::answer($this->settingsController(null)->getPersonal()));
		$stats = new StatsController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			null,
			$this->createMock(StatsService::class),
			$this->createMock(TrainerProgressService::class),
		);
		$this->assertSame($expected, self::answer($stats->mine()));
		$preferences = new PreferencesController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			null,
			$this->createMock(PreferencesService::class),
		);
		$this->assertSame($expected, self::answer($preferences->update([])));
	}

	public function testRequestSizeLimit(): void {
		$this->contentLength = 65537;
		$expected = [413, ['error' => 'too_large', 'message' => 'The request is too large.'], []];
		$this->assertSame($expected, self::answer($this->aiController()->providers()));
		$this->assertSame($expected, self::answer($this->settingsController()->getMultiplayer()));
		$this->contentLength = 65536;
		$this->assertSame(200, $this->aiController()->providers()->getStatus());
	}

	public function testUnknownSettingsFieldsAreRejected(): void {
		$this->params = ['_route' => 'x', 'listed' => true, 'color' => 'blue'];
		$this->assertSame([400, ['error' => 'invalid_argument', 'message' => 'Invalid value', 'field' => 'color'], []],
			self::answer($this->settingsController()->setMultiplayer()));
	}

	public function testDocumentsMustBeObjects(): void {
		$preferences = new PreferencesController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			'alice',
			$this->createMock(PreferencesService::class),
		);
		$this->assertSame(
			[400, ['error' => 'invalid_argument', 'message' => 'Invalid preferences', 'field' => 'preferences'], []],
			self::answer($preferences->update('dark')),
		);
		$stats = new StatsController(
			$this->request(),
			$this->l10n(),
			$this->logger(),
			'alice',
			$this->createMock(StatsService::class),
			$this->createMock(TrainerProgressService::class),
		);
		$this->assertSame(
			[400, ['error' => 'invalid_argument', 'message' => 'Invalid progress', 'field' => 'progress'], []],
			self::answer($stats->setProgress(5)),
		);
	}

	public function testAMoveConflictCarriesTheCurrentGame(): void {
		$game = GameBuilder::active();
		$this->queries->method('getFull')->willReturn(['game' => $game, 'moves' => [], 'chat' => []]);
		$this->serializer->method('full')->willReturn(['full' => true]);
		$this->serializer->method('live')->willReturn(['live' => true]);
		$this->gameplay->method('move')->willReturnOnConsecutiveCalls(
			$this->throwException(new GameConflictException('Changed')),
			$this->throwException(new ApiException(ApiError::NotYourTurn, 'Wait')),
			$this->throwException(new ApiException(ApiError::IllegalMove, 'No', ['reason' => 'blocked'])),
		);
		$controller = $this->gameController();
		$this->assertSame(
			[409, ['error' => 'conflict', 'message' => 'Changed', 'game' => ['full' => true]], []],
			self::answer($controller->move(7, 'e2-e4', 0)),
		);
		$this->assertSame(
			[403, ['error' => 'not_your_turn', 'message' => 'Wait', 'game' => ['live' => true]], []],
			self::answer($controller->move(7, 'e2-e4', 0)),
		);
		$this->assertSame(
			[400, ['error' => 'illegal_move', 'message' => 'No', 'reason' => 'blocked'], []],
			self::answer($controller->move(7, 'e2-e4', 0)),
		);
		$this->assertSame(
			[400, ['error' => 'invalid_argument', 'message' => 'Invalid move', 'field' => 'code'], []],
			self::answer($controller->move(7, str_repeat('a', 33), 0)),
		);
		$this->assertSame(
			[400, ['error' => 'invalid_argument', 'message' => 'Invalid ply', 'field' => 'ply'], []],
			self::answer($controller->move(7, 'e2-e4', '1')),
		);
	}

	public function testSummaryCarriesAnETag(): void {
		$this->queries->method('lobbyToken')->willReturn('u1.o2');
		$this->queries->method('countActionNeeded')->willReturn(['yourTurn' => 1, 'invitations' => 0]);
		$response = $this->gameController()->summary();
		$this->assertSame(
			[200, ['rev' => 'u1.o2', 'yourTurn' => 1, 'invitations' => 0, 'now' => GameBuilder::NOW], []],
			self::answer($response),
		);
		$this->assertSame('u1.o2', $response->getETag());
	}
}
