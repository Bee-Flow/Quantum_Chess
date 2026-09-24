<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSettingsService;
use OCA\QuantumChess\Service\Ai\AiSource;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\LlmService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * The routes of the LLM opponent and of the coach: sources, models, requests, Nextcloud Assistant tasks and the
 * privacy notice.
 */
#[OpenAPI(scope: OpenAPI::SCOPE_IGNORE)]
final class AiController extends ApiController {
	public function __construct(
		IRequest $request,
		IL10N $l,
		LoggerInterface $logger,
		?string $userId,
		private readonly LlmService $llm,
		private readonly AiSourceService $sources,
		private readonly AiSettingsService $aiSettings,
	) {
		parent::__construct($request, $l, $logger, $userId);
	}

	/**
	 * A `done` answer as 200, a scheduled Nextcloud Assistant task as 202.
	 *
	 * @param array<string, mixed> $result
	 */
	private static function answer(array $result): JSONResponse {
		return new JSONResponse(
			$result,
			($result['status'] ?? null) === 'pending' ? Http::STATUS_ACCEPTED : Http::STATUS_OK,
		);
	}

	/**
	 * @throws ApiException invalid_argument
	 */
	private function source(mixed $source): AiSource {
		$valid = is_string($source) ? AiSource::tryFrom($source) : null;
		return $valid ?? throw ApiException::invalidArgument('source', $this->l->t('Invalid value'));
	}

	#[NoAdminRequired]
	public function providers(): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->sources->sourcesFor($uid));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 30, period: 600)]
	public function models(mixed $source = null): JSONResponse {
		return $this->respondWithSizeLimit(
			fn (string $uid): array => $this->llm->listModels($uid, $this->source($source)),
		);
	}

	/**
	 * Asks the LLM opponent for its move; see AiRequestValidator::move() for the fields.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 3600)]
	public function move(
		mixed $source = null, mixed $model = null, mixed $persona = null, mixed $color = null, mixed $language = null,
		mixed $state = null, mixed $history = null, mixed $candidates = null, mixed $message = null,
		mixed $feedback = null, mixed $answerMode = null,
	): JSONResponse {
		$request = compact(
			'source',
			'model',
			'persona',
			'color',
			'language',
			'state',
			'history',
			'candidates',
			'message',
			'feedback',
			'answerMode',
		);
		return $this->respondWithSizeLimit(fn (string $uid): JSONResponse => self::answer(
			$this->llm->requestMove($uid, array_filter($request, static fn ($v) => $v !== null)),
		));
	}

	/**
	 * Asks the coach a question; see AiRequestValidator::coach() for the fields.
	 */
	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 3600)]
	public function coach(
		mixed $source = null, mixed $model = null, mixed $language = null, mixed $state = null, mixed $history = null,
		mixed $analysis = null, mixed $context = null, mixed $player = null, mixed $chat = null, mixed $question = null,
	): JSONResponse {
		$request = compact(
			'source',
			'model',
			'language',
			'state',
			'history',
			'analysis',
			'context',
			'player',
			'chat',
			'question',
		);
		return $this->respondWithSizeLimit(fn (string $uid): JSONResponse => self::answer(
			$this->llm->requestCoach($uid, array_filter($request, static fn ($v) => $v !== null)),
		));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 1200, period: 3600)]
	public function task(int $taskId): JSONResponse {
		return $this->respondWithSizeLimit(fn (string $uid): array => $this->llm->taskStatus($uid, $taskId));
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 3600)]
	public function cancelTask(int $taskId): JSONResponse {
		return $this->respondWithSizeLimit(function (string $uid) use ($taskId): array {
			$this->llm->cancelTask($uid, $taskId);
			return ['status' => 'cancelled'];
		});
	}

	/**
	 * Records that the user acknowledged the privacy notice of a source.
	 */
	#[NoAdminRequired]
	public function ackNotice(mixed $source = null): JSONResponse {
		return $this->respondWithSizeLimit(
			fn (string $uid): array => ['acked' => $this->aiSettings->ackNotice($uid, $this->source($source))],
		);
	}
}
