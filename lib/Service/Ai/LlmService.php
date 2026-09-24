<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\Prompt\AnswerParser;
use OCA\QuantumChess\Service\Ai\Prompt\PromptBuilder;
use OCA\QuantumChess\Service\Ai\Provider\ChatResult;
use OCA\QuantumChess\Service\Ai\Provider\NextcloudAiProvider;
use OCA\QuantumChess\Service\Ai\Provider\ProviderException;
use OCA\QuantumChess\Service\Ai\Provider\ProviderFactory;
use OCA\QuantumChess\Service\Ai\Provider\ProviderKind;
use OCA\QuantumChess\Service\Ai\Provider\TaskStatus;
use OCA\QuantumChess\Service\Ai\Provider\UpstreamError;
use OCA\QuantumChess\Service\Ai\Request\AiRequestValidator;
use OCA\QuantumChess\Service\Ai\Request\LlmRequest;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

/**
 * The requests of the LLM opponent and of the coach, the Nextcloud Assistant tasks they start, and the model lists.
 *
 * The server never retries a model's answer; the client may retry once and tell the model why its answer was
 * rejected. A Nextcloud Assistant request answers `pending` with a task id, and the client polls the task.
 */
class LlmService {
	/** Seconds a model list is cached. */
	private const MODELS_TTL = 3600;

	private ICache $cache;

	public function __construct(
		private readonly AiRequestValidator $validator,
		private readonly PromptBuilder $prompts,
		private readonly AiSourceService $sources,
		private readonly AiUsageService $usage,
		private readonly AppSettings $settings,
		private readonly NextcloudAiProvider $nextcloudAi,
		private readonly ProviderFactory $providers,
		ICacheFactory $cacheFactory,
		private readonly IL10N $l,
		private readonly LoggerInterface $logger,
	) {
		$this->cache = $cacheFactory->createDistributed(Application::APP_ID . '-ai');
	}

	/**
	 * Asks the LLM opponent for its move.
	 *
	 * @param array<string, mixed> $request see AiRequestValidator::move()
	 * @return array<string, mixed> `{status: 'done', move, pick, comment, mood}` or `{status: 'pending', taskId}`
	 * @throws ApiException
	 */
	public function requestMove(string $uid, array $request): array {
		$input = $this->validator->move($uid, $request);
		$result = $this->call($uid, $input, $this->prompts->movePrompt($input->state, $input->prompt), 'move');
		if ($result->isPending()) {
			return self::pending($result);
		}
		return ['status' => 'done'] + AnswerParser::parseMove((string)$result->text);
	}

	/**
	 * Asks the coach a question.
	 *
	 * @param array<string, mixed> $request see AiRequestValidator::coach()
	 * @return array<string, mixed> `{status: 'done', answer}` or `{status: 'pending', taskId}`
	 * @throws ApiException
	 */
	public function requestCoach(string $uid, array $request): array {
		$input = $this->validator->coach($uid, $request);
		$result = $this->call($uid, $input, $this->prompts->coachPrompt($input->state, $input->prompt), 'coach');
		if ($result->isPending()) {
			return self::pending($result);
		}
		return ['status' => 'done', 'answer' => AnswerParser::parseCoach((string)$result->text)];
	}

	/**
	 * The state of one of the user's Nextcloud Assistant tasks. A finished task is deleted once read.
	 *
	 * @return array<string, mixed> `{status: 'pending'}`, `{status: 'done', kind, …}` or `{status: 'error', error, message}`
	 * @throws ApiException not_found
	 */
	public function taskStatus(string $uid, int $taskId): array {
		$status = $this->nextcloudAi->status($uid, $taskId);
		if ($status === null) {
			throw ApiException::notFound($this->l->t('Not found'));
		}
		if ($status->state === TaskStatus::PENDING) {
			return ['status' => 'pending'];
		}
		if ($status->state === TaskStatus::ERROR) {
			$error = UpstreamError::tryFrom($status->error) ?? UpstreamError::BadResponse;
			return ['status' => 'error', 'error' => $status->error, 'message' => $error->message($this->l)];
		}
		if ($status->durationMs !== null) {
			$this->usage->recordLatency($status->durationMs);
		}
		if ($status->purpose === 'coach') {
			return ['status' => 'done', 'kind' => 'coach', 'answer' => AnswerParser::parseCoach($status->text)];
		}
		return ['status' => 'done', 'kind' => 'move'] + AnswerParser::parseMove($status->text);
	}

	/**
	 * Cancels and deletes one of the user's Nextcloud Assistant tasks.
	 *
	 * @throws ApiException not_found
	 */
	public function cancelTask(string $uid, int $taskId): void {
		if (!$this->nextcloudAi->cancel($uid, $taskId)) {
			throw ApiException::notFound($this->l->t('Not found'));
		}
	}

	/**
	 * The models the user may choose for a source. `chosenByAdmin` means the administrator fixed the model.
	 *
	 * @return array{models: list<array{id: string, label: string}>, chosenByAdmin: bool}
	 * @throws ApiException
	 */
	public function listModels(string $uid, AiSource $source): array {
		$connection = $this->sources->resolve($uid, $source);
		$cacheKey = 'models:' . md5($uid . '|' . $source->value . '|' . ($connection->preset ?? '') . '|' . ($connection->baseUrl ?? ''));
		$cached = $this->cache->get($cacheKey);
		if (is_array($cached) && isset($cached['models'], $cached['chosenByAdmin'])) {
			/** @var array{models: list<array{id: string, label: string}>, chosenByAdmin: bool} $cached */
			return $cached;
		}
		if ($source === AiSource::Nextcloud) {
			$models = $this->nextcloudAi->forUser($uid)->listModels();
			$result = ['models' => $models, 'chosenByAdmin' => $models === []];
		} elseif ($source === AiSource::Shared) {
			$list = $connection->modelAllowlist !== [] ? $connection->modelAllowlist : array_filter([$connection->model]);
			$result = ['models' => array_map(static fn (string $id): array => ['id' => $id, 'label' => $id], $list), 'chosenByAdmin' => $connection->modelAllowlist === []];
		} else {
			try {
				$models = $this->providers->create($uid, $connection)->listModels();
			} catch (ProviderException $e) {
				throw $this->upstream($e);
			}
			$result = ['models' => $models, 'chosenByAdmin' => false];
		}
		$this->cache->set($cacheKey, $result, self::MODELS_TTL);
		return $result;
	}

	/**
	 * Sends a prompt to the request's provider under the user's limits.
	 *
	 * The client's model choice applies to Nextcloud Assistant, to the user's own provider, and to the organisation
	 * provider when the administrator allows that model. Reasoning models get four times the output token limit.
	 *
	 * @param LlmRequest<array<string, mixed>> $input
	 * @param array{system: string, user: string} $prompt
	 * @param 'move'|'coach' $purpose
	 * @throws ApiException
	 */
	private function call(string $uid, LlmRequest $input, array $prompt, string $purpose): ChatResult {
		$connection = $input->connection;
		$kind = $connection->kind;
		$model = $connection->model;
		$requestedModel = $input->model;
		if ($requestedModel !== null) {
			if ($kind === ProviderKind::Nextcloud || $connection->source === AiSource::Personal || in_array($requestedModel, $connection->modelAllowlist, true)) {
				$model = $requestedModel;
			}
		}
		$maxTokens = $this->settings->aiMaxOutputTokens();
		if ($kind === ProviderKind::Anthropic || ($kind === ProviderKind::OpenAi && $model !== null && preg_match('/^(o\d|gpt-5)/', $model) === 1)) {
			$maxTokens *= 4;
		}
		$options = [
			'model' => $model,
			'maxTokens' => $maxTokens,
			'temperature' => $kind === ProviderKind::Anthropic ? null : ($purpose === 'move' ? 0.7 : 0.3),
			'effort' => $kind === ProviderKind::Anthropic ? ($purpose === 'move' ? 'low' : 'medium') : null,
			'safetyId' => $this->settings->aiSafetyIdentifier() ? substr(hash_hmac('sha256', $uid, $this->settings->appSecret()), 0, 32) : null,
			'purpose' => $purpose,
		];
		$messages = [
			['role' => 'system', 'content' => $prompt['system']],
			['role' => 'user', 'content' => $prompt['user']],
		];
		$this->usage->begin($uid);
		try {
			$this->usage->count($connection->source->value);
			return $this->providers->create($uid, $connection)->chat($messages, $options);
		} catch (ProviderException $e) {
			throw $this->upstream($e);
		} finally {
			$this->usage->end($uid);
		}
	}

	/**
	 * @return array{status: 'pending', taskId: ?int}
	 */
	private static function pending(ChatResult $result): array {
		return ['status' => 'pending', 'taskId' => $result->taskId];
	}

	private function upstream(ProviderException $e): ApiException {
		$this->logger->debug('The LLM provider failed with {code}: {message}', ['code' => $e->getUpstream(), 'message' => $e->getMessage()]);
		return new ApiException(ApiError::Upstream, $e->getError()->message($this->l), ['upstream' => $e->getUpstream()]);
	}
}
