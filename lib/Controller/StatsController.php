<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Player\StatsService;
use OCA\QuantumChess\Service\Player\TrainerProgressService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Statistics, the leaderboard and the trainer progress.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class StatsController extends ApiController {
	public function __construct(
		IRequest $request,
		IL10N $l,
		LoggerInterface $logger,
		?string $userId,
		private readonly StatsService $stats,
		private readonly TrainerProgressService $progress,
	) {
		parent::__construct($request, $l, $logger, $userId);
	}

	/**
	 * The local statistics with the per-persona results as a JSON object, also when there are none.
	 *
	 * @param array<string, mixed> $local
	 * @return array<string, mixed>
	 */
	private static function localDto(array $local): array {
		$local['llm'] = (object)$local['llm'];
		return $local;
	}

	#[NoAdminRequired]
	public function mine(): JSONResponse {
		return $this->respond(function (string $uid): array {
			$mine = $this->stats->mine($uid);
			$mine['local'] = self::localDto($mine['local']);
			return $mine;
		});
	}

	#[NoAdminRequired]
	public function leaderboard(?string $group = null): JSONResponse {
		return $this->respond(fn (string $uid) => $this->stats->leaderboard($uid, $group));
	}

	/**
	 * Records the result of a local game.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 3600)]
	public function recordLocal(mixed $opponent = null, mixed $level = null, mixed $persona = null, mixed $result = null, mixed $color = null): JSONResponse {
		return $this->respond(fn (string $uid) => ['local' => self::localDto($this->stats->recordLocal($uid, [
			'opponent' => $opponent, 'level' => $level, 'persona' => $persona, 'result' => $result, 'color' => $color,
		]))]);
	}

	#[NoAdminRequired]
	public function getProgress(): JSONResponse {
		return $this->respond(fn (string $uid) => ['progress' => (object)$this->progress->get($uid)]);
	}

	/**
	 * Merges the client's trainer progress into the stored one and returns the result.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 600)]
	public function setProgress(mixed $progress = null): JSONResponse {
		return $this->respond(function (string $uid) use ($progress): array {
			if (!is_array($progress)) {
				throw ApiException::invalidArgument('progress', 'Invalid progress');
			}
			return ['progress' => (object)$this->progress->merge($uid, $progress)];
		});
	}
}
