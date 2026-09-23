<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\StatsService;
use OCA\QuantumChess\Service\TrainerProgressService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Statistics, leaderboard and trainer progress (docs/SPEC.md §7.4.6).
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class StatsController extends Controller {
	public function __construct(
		IRequest $request,
		private StatsService $stats,
		private TrainerProgressService $progress,
		private LoggerInterface $logger,
		private ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @param callable(string): array $fn
	 */
	private function run(callable $fn): JSONResponse {
		try {
			if ($this->userId === null) {
				throw new ApiException('not_found', 'Not logged in', 404);
			}
			return new JSONResponse($fn($this->userId));
		} catch (ApiException $e) {
			return $e->toResponse();
		} catch (\Throwable $e) {
			return ApiException::internal($e, $this->logger);
		}
	}

	/**
	 * @param array<string, mixed> $local
	 * @return array<string, mixed>
	 */
	private static function localDto(array $local): array {
		$local['llm'] = (object)$local['llm'];
		return $local;
	}

	#[NoAdminRequired]
	public function mine(): JSONResponse {
		return $this->run(function (string $uid): array {
			$mine = $this->stats->mine($uid);
			$mine['local'] = self::localDto($mine['local']);
			return $mine;
		});
	}

	#[NoAdminRequired]
	public function leaderboard(?string $group = null): JSONResponse {
		return $this->run(fn (string $uid) => $this->stats->leaderboard($uid, $group));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 60, period: 3600)]
	public function recordLocal(mixed $opponent = null, mixed $level = null, mixed $persona = null, mixed $result = null, mixed $color = null): JSONResponse {
		return $this->run(fn (string $uid) => ['local' => self::localDto($this->stats->recordLocal($uid, [
			'opponent' => $opponent, 'level' => $level, 'persona' => $persona, 'result' => $result, 'color' => $color,
		]))]);
	}

	#[NoAdminRequired]
	public function getProgress(): JSONResponse {
		return $this->run(fn (string $uid) => ['progress' => (object)$this->progress->get($uid)]);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 600)]
	public function setProgress(mixed $progress = null): JSONResponse {
		return $this->run(function (string $uid) use ($progress): array {
			if (!is_array($progress)) {
				throw new ApiException('invalid_argument', 'Invalid progress', 400, ['field' => 'progress']);
			}
			return ['progress' => (object)$this->progress->merge($uid, $progress)];
		});
	}
}
