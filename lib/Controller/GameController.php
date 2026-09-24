<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use OCA\QuantumChess\Service\Game\ChatService;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\GameplayService;
use OCA\QuantumChess\Service\Game\GameQueryService;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Game\InvitationService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * The routes of online games: the lobby, invitations and open challenges, playing, polling and chat.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class GameController extends ApiController {
	public function __construct(
		IRequest $request,
		IL10N $l,
		LoggerInterface $logger,
		?string $userId,
		private readonly GameQueryService $queries,
		private readonly InvitationService $invitations,
		private readonly GameplayService $gameplay,
		private readonly ChatService $chat,
		private readonly GameSerializer $serializer,
		private readonly GameClock $clock,
	) {
		parent::__construct($request, $l, $logger, $userId);
	}

	#[NoAdminRequired]
	public function index(): JSONResponse {
		return $this->respond(fn (string $uid) => $this->serializer->lobby(
			$this->queries->getLobby($uid),
			$uid,
			$this->queries->lobbyToken($uid),
		));
	}

	/**
	 * The lobby's change token and the counts of games that need the user. The ETag lets clients poll it cheaply.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 3000, period: 600)]
	public function summary(): JSONResponse {
		return $this->respond(function (string $uid): JSONResponse {
			$token = $this->queries->lobbyToken($uid);
			$response = new JSONResponse(
				['rev' => $token] + $this->queries->countActionNeeded($uid) + ['now' => $this->clock->now()],
			);
			$response->setETag($token);
			return $response;
		});
	}

	#[NoAdminRequired]
	public function open(): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'games' => array_map(
				fn (Game $g) => $this->serializer->summary($g, $uid),
				$this->queries->getLobby($uid)['open'],
			),
		]);
	}

	#[NoAdminRequired]
	public function history(string $status = 'finished', ?string $cursor = null, int $limit = 20): JSONResponse {
		return $this->respond(function (string $uid) use ($status, $cursor, $limit): array {
			$page = $this->queries->history($uid, ['status' => $status, 'cursor' => $cursor, 'limit' => $limit]);
			return [
				'games' => array_map(fn (Game $g) => $this->serializer->summary($g, $uid), $page['games']),
				'next' => $page['next'],
			];
		});
	}

	/**
	 * Whether a new game may be rated. The opponent does not change the answer.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 600)]
	public function ratedCheck(string $opponent = ''): JSONResponse {
		return $this->respond(fn (string $uid) => $this->queries->ratedCheck());
	}

	#[NoAdminRequired]
	public function recentOpponents(): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'users' => array_values(array_filter(array_map(
				fn (string $o) => $this->serializer->userRef($o),
				$this->queries->recentOpponents($uid),
			))),
		]);
	}

	/**
	 * Creates an invitation, or an open challenge when no opponent is given.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 3600)]
	public function create(
		?string $opponent = null,
		mixed $color = 'r',
		mixed $rated = true,
		mixed $timeControl = 'corr:3d',
		mixed $message = null,
		mixed $scopeGroup = null,
	): JSONResponse {
		return $this->respond(function (string $uid) use (
			$opponent,
			$color,
			$rated,
			$timeControl,
			$message,
			$scopeGroup,
		): array {
			$game = $this->invitations->create($uid, [
				'opponent' => $opponent === '' ? null : $opponent,
				'color' => $color,
				'rated' => $rated,
				'timeControl' => $timeControl,
				'message' => $message,
				'scopeGroup' => $scopeGroup === '' ? null : $scopeGroup,
			]);
			return ['game' => $this->serializer->live($game, $uid)];
		}, Http::STATUS_CREATED);
	}

	/**
	 * A game with all its moves and chat. Opening it clears its informational notifications.
	 */
	#[NoAdminRequired]
	public function show(int $id): JSONResponse {
		return $this->respond(function (string $uid) use ($id): array {
			$full = $this->queries->getFull($id, $uid);
			$this->queries->markSeen($id, $uid);
			return ['game' => $this->serializer->full($full['game'], $uid, $full['moves'], $full['chat'])];
		});
	}

	/**
	 * What changed since the client's revision `$rev`: the game, the moves from `$ply` and the chat lines after the
	 * chat line id `$chat`.
	 *
	 * @param int $watching whether the client shows the game (clients send it; it does not change the answer)
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 3000, period: 600)]
	public function poll(int $id, int $rev = 0, int $ply = 0, int $chat = 0, int $watching = 0): JSONResponse {
		return $this->respond(function (string $uid) use ($id, $rev, $ply, $chat): array {
			$result = $this->queries->poll($id, $uid, $rev, $ply, $chat);
			if (!$result['changed'] || !isset($result['game'])) {
				return ['changed' => false, 'rev' => $result['rev'], 'now' => $result['now']];
			}
			return [
				'changed' => true,
				'rev' => $result['rev'],
				'now' => $result['now'],
				'game' => $this->serializer->live($result['game'], $uid),
				'moves' => array_map(fn (Move $m) => $this->serializer->move($m), $result['moves'] ?? []),
				'chat' => array_map(fn ($c) => $this->serializer->chat($c), $result['chat'] ?? []),
			];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function accept(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->live($this->invitations->accept($id, $uid), $uid),
		]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function decline(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->summary($this->invitations->decline($id, $uid), $uid),
		]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function cancel(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->summary($this->invitations->cancel($id, $uid), $uid),
		]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 600)]
	public function join(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->live($this->invitations->join($id, $uid), $uid),
		]);
	}

	/**
	 * Plays a move. A `conflict` answer carries the whole current game and a `not_your_turn` answer the live game, so
	 * the client can catch up without another request.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 60)]
	public function move(
		int $id,
		mixed $code = null,
		mixed $ply = null,
		mixed $clientId = null,
		mixed $thinkMs = null,
	): JSONResponse {
		return $this->respond(function (string $uid) use ($id, $code, $ply, $clientId, $thinkMs): array {
			if (!is_string($code) || $code === '' || strlen($code) > 32) {
				throw ApiException::invalidArgument('code', 'Invalid move');
			}
			if (!is_int($ply) || $ply < 0) {
				throw ApiException::invalidArgument('ply', 'Invalid ply');
			}
			try {
				$result = $this->gameplay->move(
					$id,
					$uid,
					$code,
					$ply,
					is_string($clientId) ? $clientId : null,
					is_int($thinkMs) ? $thinkMs : null,
				);
			} catch (GameConflictException $e) {
				$full = $this->queries->getFull($id, $uid);
				throw $e->withExtra([
					'game' => $this->serializer->full($full['game'], $uid, $full['moves'], $full['chat']),
				]);
			} catch (ApiException $e) {
				if ($e->getError() !== ApiError::NotYourTurn) {
					throw $e;
				}
				$full = $this->queries->getFull($id, $uid);
				throw $e->withExtra(['game' => $this->serializer->live($full['game'], $uid)]);
			}
			$game = $result['game'];
			return [
				'game' => $this->serializer->live($game, $uid),
				'move' => $this->serializer->move($result['move']),
				'measurement' => $result['measurement'],
				'chain' => $game->getChain(),
				'rev' => $game->getRev(),
				'now' => $this->clock->now(),
				'replayed' => $result['replayed'],
			];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function resign(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->live($this->gameplay->resign($id, $uid), $uid),
		]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function abort(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->live($this->gameplay->abort($id, $uid), $uid),
		]);
	}

	/**
	 * @param mixed $action `offer`, `accept` or `decline`
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function draw(int $id, mixed $action = null): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->live(
				$this->gameplay->draw($id, $uid, is_string($action) ? $action : ''),
				$uid,
			),
		]);
	}

	/**
	 * Sends a text message, or with `$phrase` a predefined phrase.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 60)]
	public function chat(int $id, mixed $message = null, mixed $phrase = null): JSONResponse {
		return $this->respond(function (string $uid) use ($id, $message, $phrase): array {
			$line = $this->chat->send(
				$id,
				$uid,
				is_string($message) ? $message : null,
				is_string($phrase) ? $phrase : null,
			);
			return ['message' => $this->serializer->chat($line), 'rev' => $this->queries->get($id, $uid)->getRev()];
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 60)]
	public function mute(int $id, mixed $muted = true): JSONResponse {
		return $this->respond(fn (string $uid) => ['muted' => $this->chat->setMuted($id, $uid, $muted === true)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 3600)]
	public function rematch(int $id): JSONResponse {
		return $this->respond(fn (string $uid) => [
			'game' => $this->serializer->live($this->invitations->rematch($id, $uid), $uid),
		]);
	}
}
