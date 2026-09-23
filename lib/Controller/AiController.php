<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCA\QuantumChess\Service\SettingsService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * AI opponent and coach routes (docs/SPEC.md §7.4.7).
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
class AiController extends Controller {
	public const MAX_BODY = 65536;

	public function __construct(
		IRequest $request,
		private LlmService $llm,
		private AiSourceService $sources,
		private SettingsService $settings,
		private IL10N $l,
		private LoggerInterface $logger,
		private ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @param callable(string): (array|JSONResponse) $fn
	 */
	private function run(callable $fn): JSONResponse {
		try {
			if ($this->userId === null) {
				throw new ApiException('not_found', 'Not logged in', 404);
			}
			$length = (int)$this->request->getHeader('Content-Length');
			if ($length > self::MAX_BODY) {
				throw new ApiException('too_large', $this->l->t('The request is too large.'), 413);
			}
			$result = $fn($this->userId);
			return $result instanceof JSONResponse ? $result : new JSONResponse($result);
		} catch (ApiException $e) {
			return $e->toResponse();
		} catch (\Throwable $e) {
			return ApiException::internal($e, $this->logger);
		}
	}

	/**
	 * A `done` answer as 200, a scheduled Nextcloud AI task as 202.
	 *
	 * @param array<string, mixed> $result
	 */
	private static function answer(array $result): JSONResponse {
		return new JSONResponse($result, ($result['status'] ?? null) === 'pending' ? Http::STATUS_ACCEPTED : Http::STATUS_OK);
	}

	#[NoAdminRequired]
	public function providers(): JSONResponse {
		return $this->run(fn (string $uid): array => $this->sources->sourcesFor($uid));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 600)]
	public function models(mixed $source = null): JSONResponse {
		return $this->run(function (string $uid) use ($source): array {
			if (!is_string($source) || !in_array($source, SettingsService::SOURCES, true)) {
				throw new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => 'source']);
			}
			return $this->llm->listModels($uid, $source);
		});
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 3600)]
	public function move(
		mixed $source = null, mixed $model = null, mixed $persona = null, mixed $color = null, mixed $language = null,
		mixed $state = null, mixed $history = null, mixed $candidates = null, mixed $message = null, mixed $feedback = null,
		mixed $answerMode = null,
	): JSONResponse {
		$request = compact('source', 'model', 'persona', 'color', 'language', 'state', 'history', 'candidates', 'message', 'feedback', 'answerMode');
		return $this->run(fn (string $uid): JSONResponse => self::answer($this->llm->requestMove($uid, array_filter($request, static fn ($v) => $v !== null))));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 3600)]
	public function coach(
		mixed $source = null, mixed $model = null, mixed $language = null, mixed $state = null, mixed $history = null,
		mixed $analysis = null, mixed $context = null, mixed $player = null, mixed $chat = null, mixed $question = null,
	): JSONResponse {
		$request = compact('source', 'model', 'language', 'state', 'history', 'analysis', 'context', 'player', 'chat', 'question');
		return $this->run(fn (string $uid): JSONResponse => self::answer($this->llm->requestCoach($uid, array_filter($request, static fn ($v) => $v !== null))));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 1200, period: 3600)]
	public function task(int $taskId): JSONResponse {
		return $this->run(fn (string $uid): array => $this->llm->taskStatus($uid, $taskId));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 3600)]
	public function cancelTask(int $taskId): JSONResponse {
		return $this->run(function (string $uid) use ($taskId): array {
			$this->llm->cancelTask($uid, $taskId);
			return ['status' => 'cancelled'];
		});
	}

	#[NoAdminRequired]
	public function ackNotice(mixed $source = null): JSONResponse {
		return $this->run(function (string $uid) use ($source): array {
			if (!is_string($source) || !in_array($source, SettingsService::SOURCES, true)) {
				throw new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => 'source']);
			}
			return ['acked' => $this->settings->ackNotice($uid, $source)];
		});
	}
}
