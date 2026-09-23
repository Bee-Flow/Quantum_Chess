<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\GameSerializer;
use OCA\QuantumChess\Service\GameService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Online game routes (docs/SPEC.md §7.3, §7.4.1–7.4.4).
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class GameController extends Controller {
	public function __construct(
		IRequest $request,
		private GameService $service,
		private GameSerializer $serializer,
		private ITimeFactory $time,
		private LoggerInterface $logger,
		private ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @param callable(string): (array|JSONResponse) $fn
	 */
	private function run(callable $fn, int $status = 200): JSONResponse {
		try {
			if ($this->userId === null) {
				throw new ApiException('not_found', 'Not logged in', 404);
			}
			$result = $fn($this->userId);
			return $result instanceof JSONResponse ? $result : new JSONResponse($result, $status);
		} catch (ApiException $e) {
			return $e->toResponse();
		} catch (\Throwable $e) {
			return ApiException::internal($e, $this->logger);
		}
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		return $this->run(fn (string $uid) => $this->serializer->lobby($this->service->getLobby($uid), $uid, $this->service->lobbyToken($uid)));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 3000, period: 600)]
	public function summary(): JSONResponse {
		return $this->run(function (string $uid): JSONResponse {
			$token = $this->service->lobbyToken($uid);
			$response = new JSONResponse(['rev' => $token] + $this->service->countActionNeeded($uid) + ['now' => $this->time->getTime()]);
			$response->setETag($token);
			return $response;
		});
	}

	#[NoAdminRequired]
	public function open(): JSONResponse {
		return $this->run(fn (string $uid) => [
			'games' => array_map(fn ($g) => $this->serializer->summary($g, $uid), $this->service->getLobby($uid)['open']),
		]);
	}

	#[NoAdminRequired]
	public function history(string $status = 'finished', ?string $cursor = null, int $limit = 20): JSONResponse {
		return $this->run(function (string $uid) use ($status, $cursor, $limit): array {
			$page = $this->service->history($uid, ['status' => $status, 'cursor' => $cursor, 'limit' => $limit]);
			return ['games' => array_map(fn ($g) => $this->serializer->summary($g, $uid), $page['games']), 'next' => $page['next']];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 600)]
	public function ratedCheck(string $opponent = ''): JSONResponse {
		return $this->run(fn (string $uid) => $this->service->ratedCheck($uid, $opponent));
	}

	#[NoAdminRequired]
	public function recentOpponents(): JSONResponse {
		return $this->run(fn (string $uid) => [
			'users' => array_values(array_filter(array_map(fn (string $o) => $this->serializer->userRef($o), $this->service->recentOpponents($uid)))),
		]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 3600)]
	public function create(?string $opponent = null, mixed $color = 'r', mixed $rated = true, mixed $timeControl = 'corr:3d', mixed $message = null, mixed $scopeGroup = null): JSONResponse {
		return $this->run(function (string $uid) use ($opponent, $color, $rated, $timeControl, $message, $scopeGroup): array {
			$game = $this->service->create($uid, [
				'opponent' => $opponent === '' ? null : $opponent,
				'color' => $color,
				'rated' => $rated,
				'timeControl' => $timeControl,
				'message' => $message,
				'scopeGroup' => $scopeGroup === '' ? null : $scopeGroup,
			]);
			return ['game' => $this->serializer->live($game, $uid)];
		}, 201);
	}

	#[NoAdminRequired]
	public function show(int $id): JSONResponse {
		return $this->run(function (string $uid) use ($id): array {
			$full = $this->service->getFull($id, $uid);
			$this->service->markSeen($id, $uid);
			return ['game' => $this->serializer->full($full['game'], $uid, $full['moves'], $full['chat'])];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 3000, period: 600)]
	public function poll(int $id, int $rev = 0, int $ply = 0, int $chat = 0, int $watching = 0): JSONResponse {
		return $this->run(function (string $uid) use ($id, $rev, $ply, $chat, $watching): array {
			$result = $this->service->poll($id, $uid, $rev, $ply, $chat, $watching === 1);
			if (!$result['changed'] || !isset($result['game'])) {
				return ['changed' => false, 'rev' => $result['rev'], 'now' => $result['now']];
			}
			return [
				'changed' => true,
				'rev' => $result['rev'],
				'now' => $result['now'],
				'game' => $this->serializer->live($result['game'], $uid),
				'moves' => array_map(fn (Move $m) => $this->serializer->move($m), $result['moves'] ?? []),
				'chat' => array_map(fn ($c) => $this->serializer->chat($c, $uid), $result['chat'] ?? []),
			];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function accept(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->live($this->service->accept($id, $uid), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function decline(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->summary($this->service->decline($id, $uid), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function cancel(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->summary($this->service->cancel($id, $uid), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 600)]
	public function join(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->live($this->service->join($id, $uid), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 60)]
	public function move(int $id, mixed $code = null, mixed $ply = null, mixed $clientId = null, mixed $thinkMs = null): JSONResponse {
		return $this->run(function (string $uid) use ($id, $code, $ply, $clientId, $thinkMs): array {
			if (!is_string($code) || $code === '' || strlen($code) > 32) {
				throw new ApiException('invalid_argument', 'Invalid move', 400, ['field' => 'code']);
			}
			if (!is_int($ply) || $ply < 0) {
				throw new ApiException('invalid_argument', 'Invalid ply', 400, ['field' => 'ply']);
			}
			try {
				$result = $this->service->move($id, $uid, $code, $ply, is_string($clientId) ? $clientId : null, is_int($thinkMs) ? $thinkMs : null);
			} catch (ApiException $e) {
				if ($e->getErrorCode() === 'conflict' || $e->getErrorCode() === 'not_your_turn') {
					$full = $this->service->getFull($id, $uid);
					$game = $e->getErrorCode() === 'conflict'
						? $this->serializer->full($full['game'], $uid, $full['moves'], $full['chat'])
						: $this->serializer->live($full['game'], $uid);
					throw new ApiException($e->getErrorCode(), $e->getMessage(), $e->getStatus(), ['game' => $game]);
				}
				throw $e;
			}
			$game = $result['game'];
			return [
				'game' => $this->serializer->live($game, $uid),
				'move' => $this->serializer->move($result['move']),
				'measurement' => $result['measurement'],
				'chain' => $game->getChain(),
				'rev' => $game->getRev(),
				'now' => $this->time->getTime(),
				'replayed' => $result['replayed'],
			];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function resign(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->live($this->service->resign($id, $uid), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function abort(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->live($this->service->abort($id, $uid), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function draw(int $id, mixed $action = null): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->live($this->service->draw($id, $uid, is_string($action) ? $action : ''), $uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 60)]
	public function chat(int $id, mixed $message = null, mixed $phrase = null): JSONResponse {
		return $this->run(function (string $uid) use ($id, $message, $phrase): array {
			$line = $this->service->chat($id, $uid, is_string($message) ? $message : null, is_string($phrase) ? $phrase : null);
			return ['message' => $this->serializer->chat($line, $uid), 'rev' => $this->service->get($id, $uid)->getRev()];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function mute(int $id, mixed $muted = true): JSONResponse {
		return $this->run(fn (string $uid) => ['muted' => $this->service->setMuted($id, $uid, $muted === true)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 3600)]
	public function rematch(int $id): JSONResponse {
		return $this->run(fn (string $uid) => ['game' => $this->serializer->live($this->service->rematch($id, $uid), $uid)]);
	}
}
