<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Engine\InvalidStateException;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\SettingsService;
use OCP\Http\Client\IClientService;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

/**
 * The LLM endpoints (docs/SPEC.md §7.4.7, §10): request validation, source resolution, limits, prompts, provider calls
 * and answer parsing. The server never retries a model answer; the client retries once with `feedback`.
 */
class LlmService {
	public const LANGUAGE_REGEX = '/^[a-z]{2,3}([_-][A-Za-z0-9]{2,8}){0,2}$/';
	private const CODE_REGEX = '/^[A-Za-z0-9|?=:\/,x+-]{1,32}$/';
	private const TAG_REGEX = '/^[a-z-]{1,24}(:[a-z0-9]{1,4}){0,2}$/';

	private ICache $cache;

	public function __construct(
		private Engine $engine,
		private PromptBuilder $prompts,
		private AiSourceService $sources,
		private AiUsageService $usage,
		private SettingsService $settings,
		private NextcloudAiProvider $nextcloudAi,
		private KeyStore $keys,
		private UrlGuard $urlGuard,
		private IClientService $clients,
		ICacheFactory $cacheFactory,
		private IL10N $l,
		private LoggerInterface $logger,
	) {
		$this->cache = $cacheFactory->createDistributed(Application::APP_ID . '-ai');
	}

	// ------------------------------------------------------------------ endpoints

	/**
	 * @param array<string, mixed> $request SPEC §7.4.7 `POST /api/ai/move`
	 * @return array<string, mixed> `{status: 'done', move, pick, comment, mood}` or `{status: 'pending', taskId}`
	 * @throws ApiException
	 */
	public function requestMove(string $uid, array $request): array {
		$source = $this->source($request);
		$model = $this->model($request);
		$persona = $request['persona'] ?? null;
		if (!is_string($persona) || !Personas::exists($persona)) {
			throw $this->invalid('persona');
		}
		$color = $request['color'] ?? null;
		if ($color !== 'w' && $color !== 'b') {
			throw $this->invalid('color');
		}
		$language = $this->language($request);
		$state = $this->state($request);
		if ($state['result'] !== null || $state['turn'] !== $color) {
			throw $this->invalid('state');
		}
		$candidates = $this->candidates($state, $request['candidates'] ?? null);
		$message = $request['message'] ?? null;
		if ($message !== null && (!is_string($message) || mb_strlen($message) > 200)) {
			throw $this->invalid('message');
		}
		$feedback = $request['feedback'] ?? null;
		if ($feedback !== null) {
			if (!is_array($feedback) || !is_string($feedback['answer'] ?? null) || !is_string($feedback['reason'] ?? null)
				|| !isset(PromptBuilder::REASON_TEXT[$feedback['reason']])) {
				throw $this->invalid('feedback');
			}
			$feedback = ['answer' => mb_substr($feedback['answer'], 0, 64), 'reason' => $feedback['reason']];
		}
		$answerMode = $request['answerMode'] ?? 'code';
		if ($answerMode !== 'code' && $answerMode !== 'index') {
			throw $this->invalid('answerMode');
		}
		$connection = $this->sources->resolve($uid, $source);
		$prompt = $this->prompts->movePrompt($state, [
			'persona' => $persona,
			'color' => $color,
			'language' => $language,
			'history' => $this->history($request['history'] ?? [], 20),
			'candidates' => $candidates,
			'message' => $message,
			'feedback' => $feedback,
			'answerMode' => $answerMode,
		]);
		$result = $this->call($uid, $connection, $prompt, 'move', $model);
		if ($result['status'] === 'pending') {
			return $result;
		}
		return ['status' => 'done'] + AnswerParser::parseMove($result['text']);
	}

	/**
	 * @param array<string, mixed> $request SPEC §7.4.7 `POST /api/ai/coach`
	 * @return array<string, mixed> `{status: 'done', answer}` or `{status: 'pending', taskId}`
	 * @throws ApiException
	 */
	public function requestCoach(string $uid, array $request): array {
		$source = $this->source($request);
		$model = $this->model($request);
		$language = $this->language($request);
		$state = $this->state($request);
		$question = $request['question'] ?? null;
		if (!is_string($question) || trim($question) === '' || mb_strlen($question) > 500) {
			throw $this->invalid('question');
		}
		$player = $request['player'] ?? null;
		if (!is_array($player) || !in_array($player['color'] ?? null, ['w', 'b'], true)
			|| !in_array($player['skill'] ?? null, ['beginner', 'intermediate', 'advanced'], true)) {
			throw $this->invalid('player');
		}
		$connection = $this->sources->resolve($uid, $source);
		$prompt = $this->prompts->coachPrompt($state, [
			'language' => $language,
			'history' => $this->history($request['history'] ?? [], 16),
			'analysis' => $this->analysis($request['analysis'] ?? null),
			'context' => $this->context($request['context'] ?? null),
			'player' => ['color' => (string)$player['color'], 'skill' => (string)$player['skill']],
			'chat' => $this->chat($request['chat'] ?? []),
			'question' => $question,
		]);
		$result = $this->call($uid, $connection, $prompt, 'coach', $model);
		if ($result['status'] === 'pending') {
			return $result;
		}
		return ['status' => 'done', 'answer' => AnswerParser::parseCoach($result['text'])];
	}

	/**
	 * @return array<string, mixed> `{status: 'pending'}`, `{status: 'done', kind, …}` or `{status: 'error', error, message}`
	 * @throws ApiException 404 not_found
	 */
	public function taskStatus(string $uid, int $taskId): array {
		$status = $this->nextcloudAi->status($uid, $taskId);
		if ($status === null) {
			throw new ApiException('not_found', $this->l->t('Not found'), 404);
		}
		if ($status['status'] === 'pending') {
			return ['status' => 'pending'];
		}
		if ($status['status'] === 'error') {
			return ['status' => 'error', 'error' => $status['error'], 'message' => $this->upstreamMessage($status['error'])];
		}
		if ($status['durationMs'] !== null) {
			$this->usage->recordLatency($status['durationMs']);
		}
		if ($status['purpose'] === 'coach') {
			return ['status' => 'done', 'kind' => 'coach', 'answer' => AnswerParser::parseCoach($status['text'])];
		}
		return ['status' => 'done', 'kind' => 'move'] + AnswerParser::parseMove($status['text']);
	}

	/**
	 * @throws ApiException 404 not_found
	 */
	public function cancelTask(string $uid, int $taskId): void {
		if (!$this->nextcloudAi->cancel($uid, $taskId)) {
			throw new ApiException('not_found', $this->l->t('Not found'), 404);
		}
	}

	/**
	 * @return array{models: list<array{id: string, label: string}>, chosenByAdmin: bool}
	 * @throws ApiException
	 */
	public function listModels(string $uid, string $source): array {
		$connection = $this->sources->resolve($uid, $source);
		$cacheKey = 'models:' . md5($uid . '|' . $source . '|' . ($connection['preset'] ?? '') . '|' . ($connection['baseUrl'] ?? ''));
		$cached = $this->cache->get($cacheKey);
		if (is_array($cached) && isset($cached['models'], $cached['chosenByAdmin'])) {
			/** @var array{models: list<array{id: string, label: string}>, chosenByAdmin: bool} $cached */
			return $cached;
		}
		if ($source === 'nextcloud') {
			$models = $this->nextcloudAi->forUser($uid)->listModels();
			$result = ['models' => $models, 'chosenByAdmin' => $models === []];
		} elseif ($source === 'shared') {
			$list = $connection['modelAllowlist'] !== [] ? $connection['modelAllowlist'] : array_filter([$connection['model']]);
			$result = ['models' => array_map(static fn (string $id): array => ['id' => $id, 'label' => $id], array_values($list)), 'chosenByAdmin' => $connection['modelAllowlist'] === []];
		} else {
			try {
				$models = $this->provider($uid, $connection)->listModels();
			} catch (ProviderException $e) {
				throw $this->upstream($e);
			}
			$result = ['models' => $models, 'chosenByAdmin' => false];
		}
		$this->cache->set($cacheKey, $result, 3600);
		return $result;
	}

	/**
	 * *Test connection*: only a code and the model list come back, never upstream bodies or keys.
	 *
	 * @param array<string, mixed> $request {scope, preset, kind, baseUrl, model, apiKey}
	 * @return array{ok: bool, code: ?string, modelCount: ?int, models: ?list<array{id: string, label: string}>}
	 * @throws ApiException
	 */
	public function testConnection(string $uid, array $request, bool $admin): array {
		$scope = $request['scope'] ?? null;
		if ($scope !== 'personal' && $scope !== 'shared') {
			throw $this->invalid('scope');
		}
		if ($scope === 'shared' && !$admin) {
			throw new ApiException('not_found', $this->l->t('Not found'), 404);
		}
		try {
			$provider = $this->settings->checkProvider($request, $scope);
		} catch (ApiException $e) {
			if ($e->getErrorCode() === 'url_not_allowed') {
				return ['ok' => false, 'code' => 'url_not_allowed', 'modelCount' => null, 'models' => null];
			}
			throw $e;
		}
		$apiKey = $request['apiKey'] ?? null;
		if ($apiKey !== null && !is_string($apiKey)) {
			throw $this->invalid('apiKey');
		}
		$apiKey = is_string($apiKey) ? trim($apiKey) : '';
		if ($apiKey !== '' && !KeyStore::isValidKey($apiKey)) {
			throw $this->invalid('apiKey');
		}
		if ($apiKey === '') {
			// The saved key is only sent to the address it was saved for (a changed address needs the key again).
			$stored = $scope === 'shared' ? $this->settings->sharedProvider() : $this->settings->personalProvider($uid);
			if (SettingsService::sameEndpoint($stored, $provider)) {
				$apiKey = $scope === 'shared' ? $this->keys->getShared() : $this->keys->getPersonal($uid);
			}
		}
		try {
			$guard = $this->urlGuard->check($provider['baseUrl'], $scope, $this->settings->sharedAllowLocal(), $this->settings->localAllowlist())['allowLocal'];
		} catch (UrlNotAllowedException) {
			return ['ok' => false, 'code' => 'url_not_allowed', 'modelCount' => null, 'models' => null];
		}
		$connection = ['source' => $scope, 'kind' => $provider['kind'], 'preset' => $provider['preset'], 'baseUrl' => $provider['baseUrl'], 'model' => $provider['model'], 'apiKey' => $apiKey, 'allowLocal' => $guard, 'modelAllowlist' => []];
		try {
			$models = $this->provider($uid, $connection)->listModels();
		} catch (ProviderException $e) {
			return ['ok' => false, 'code' => $e->getUpstream(), 'modelCount' => null, 'models' => null];
		}
		return ['ok' => true, 'code' => null, 'modelCount' => count($models), 'models' => array_slice($models, 0, 500)];
	}

	// ------------------------------------------------------------------ calling a provider

	/**
	 * @param array{source: string, kind: string, preset: ?string, baseUrl: ?string, model: ?string, apiKey: ?string, allowLocal: bool, modelAllowlist: list<string>} $connection
	 * @param array{system: string, user: string} $prompt
	 * @param 'move'|'coach' $purpose
	 * @return array{status: 'done', text: string}|array{status: 'pending', taskId: int}
	 * @throws ApiException
	 */
	private function call(string $uid, array $connection, array $prompt, string $purpose, ?string $requestedModel): array {
		$kind = $connection['kind'];
		$model = $connection['model'];
		if ($requestedModel !== null) {
			if ($kind === 'nextcloud' || $connection['source'] === 'personal' || in_array($requestedModel, $connection['modelAllowlist'], true)) {
				$model = $requestedModel;
			}
		}
		$maxTokens = $this->settings->aiMaxOutputTokens();
		if ($kind === 'anthropic' || ($kind === 'openai' && $model !== null && preg_match('/^(o\d|gpt-5)/', $model) === 1)) {
			$maxTokens *= 4;
		}
		$options = [
			'model' => $model,
			'maxTokens' => $maxTokens,
			'temperature' => $kind === 'anthropic' ? null : ($purpose === 'move' ? 0.7 : 0.3),
			'effort' => $kind === 'anthropic' ? ($purpose === 'move' ? 'low' : 'medium') : null,
			'safetyId' => $this->settings->aiSafetyIdentifier() ? substr(hash_hmac('sha256', $uid, $this->settings->appSecret()), 0, 32) : null,
			'purpose' => $purpose,
		];
		$messages = [
			['role' => 'system', 'content' => $prompt['system']],
			['role' => 'user', 'content' => $prompt['user']],
		];
		$this->usage->begin($uid);
		try {
			$this->usage->count($connection['source']);
			return $this->provider($uid, $connection)->chat($messages, $options);
		} catch (ProviderException $e) {
			throw $this->upstream($e);
		} finally {
			$this->usage->end($uid);
		}
	}

	/**
	 * @param array{source: string, kind: string, preset: ?string, baseUrl: ?string, model: ?string, apiKey: ?string, allowLocal: bool, modelAllowlist: list<string>} $connection
	 */
	private function provider(string $uid, array $connection): ProviderInterface {
		if ($connection['kind'] === 'nextcloud') {
			return $this->nextcloudAi->forUser($uid);
		}
		$config = [
			'preset' => (string)$connection['preset'],
			'baseUrl' => (string)$connection['baseUrl'],
			'apiKey' => $connection['apiKey'],
			'allowLocal' => $connection['allowLocal'],
		];
		return $connection['kind'] === 'anthropic'
			? new AnthropicProvider($this->clients, $this->cache, $this->logger, $config)
			: new OpenAiProvider($this->clients, $this->cache, $this->logger, $config);
	}

	private function upstream(ProviderException $e): ApiException {
		$this->logger->debug('Quantum Chess AI: upstream error {code}: {message}', ['app' => Application::APP_ID, 'code' => $e->getUpstream(), 'message' => $e->getMessage()]);
		return new ApiException('upstream', $this->upstreamMessage($e->getUpstream()), 502, ['upstream' => $e->getUpstream()]);
	}

	public function upstreamMessage(string $code): string {
		return match ($code) {
			'invalid_key' => $this->l->t('The AI service did not accept the API key.'),
			'model_not_found' => $this->l->t('The AI service does not know this model.'),
			'rate_limited' => $this->l->t('The AI service is busy. Please try again in a moment.'),
			'quota_exceeded' => $this->l->t('The AI service quota is used up.'),
			'timeout' => $this->l->t('The AI service took too long to answer.'),
			'unreachable' => $this->l->t('The AI service could not be reached.'),
			'refused' => $this->l->t('The AI service declined to answer.'),
			default => $this->l->t('The AI service sent an answer that could not be read.'),
		};
	}

	// ------------------------------------------------------------------ validation

	/** @param array<string, mixed> $request */
	private function source(array $request): string {
		$source = $request['source'] ?? null;
		if (!is_string($source) || !in_array($source, SettingsService::SOURCES, true)) {
			throw $this->invalid('source');
		}
		return $source;
	}

	/** @param array<string, mixed> $request */
	private function model(array $request): ?string {
		$model = $request['model'] ?? null;
		if ($model === null || $model === '') {
			return null;
		}
		if (!is_string($model) || !SettingsService::isValidModel($model)) {
			throw $this->invalid('model');
		}
		return $model;
	}

	/** @param array<string, mixed> $request */
	private function language(array $request): string {
		$language = $request['language'] ?? 'en';
		if (!is_string($language) || preg_match(self::LANGUAGE_REGEX, $language) !== 1) {
			throw $this->invalid('language');
		}
		return $language;
	}

	/**
	 * @param array<string, mixed> $request
	 * @return array<string, mixed>
	 */
	private function state(array $request): array {
		try {
			return $this->engine->validateState($request['state'] ?? null);
		} catch (InvalidStateException $e) {
			throw new ApiException('invalid_state', $this->l->t('The position is not valid.'), 400, ['invariant' => $e->getInvariant()]);
		}
	}

	/**
	 * 1–6 legal candidates with their canonical codes.
	 *
	 * @param array<string, mixed> $state
	 * @return list<array{code: string, E: float, tags: list<string>, ok: bool}>
	 */
	private function candidates(array $state, mixed $value): array {
		if (!is_array($value) || count($value) < 1 || count($value) > 6) {
			throw $this->invalid('candidates');
		}
		$list = [];
		foreach (array_values($value) as $candidate) {
			if (!is_array($candidate) || !is_string($candidate['code'] ?? null) || !is_numeric($candidate['E'] ?? null)) {
				throw $this->invalid('candidates');
			}
			$move = strlen($candidate['code']) <= 32 ? $this->engine->findMove($state, $candidate['code']) : null;
			if ($move === null) {
				throw $this->invalid('candidates');
			}
			$tags = [];
			foreach (is_array($candidate['tags'] ?? null) ? array_slice($candidate['tags'], 0, 12) : [] as $tag) {
				if (is_string($tag) && preg_match(self::TAG_REGEX, $tag) === 1) {
					$tags[] = $tag;
				}
			}
			$list[] = [
				'code' => (string)$move['code'],
				'E' => max(0.0, min(1.0, (float)$candidate['E'])),
				'tags' => $tags,
				'ok' => ($candidate['ok'] ?? false) === true,
			];
		}
		return $list;
	}

	/**
	 * History entries (invalid ones are dropped), the last `$max`.
	 *
	 * @return list<array{ply: int, code: string, key: ?string, weight: ?int}>
	 */
	private function history(mixed $value, int $max): array {
		if (!is_array($value)) {
			return [];
		}
		$list = [];
		foreach (array_slice(array_values($value), -$max) as $entry) {
			if (!is_array($entry) || !is_int($entry['ply'] ?? null) || $entry['ply'] < 0 || $entry['ply'] > Engine::MAX_PLY
				|| !is_string($entry['code'] ?? null) || preg_match(self::CODE_REGEX, $entry['code']) !== 1) {
				continue;
			}
			$key = $entry['key'] ?? null;
			$weight = $entry['weight'] ?? null;
			$valid = is_string($key) && in_array($key, Engine::OUTCOME_KEYS, true) && is_int($weight) && $weight >= 0 && $weight <= Engine::T;
			$list[] = ['ply' => $entry['ply'], 'code' => $entry['code'], 'key' => $valid ? $key : null, 'weight' => $valid ? $weight : null];
		}
		return $list;
	}

	/**
	 * @return array{E: ?float, best: list<array{code: string, E: ?float, line: list<string>}>, threats: list<string>, lastMove: ?array{code: string, label: ?string, deltaE: ?float}}
	 */
	private function analysis(mixed $value): array {
		$value = is_array($value) ? $value : [];
		$number = static fn (mixed $x): ?float => is_int($x) || is_float($x) ? max(-1.0, min(1.0, (float)$x)) : null;
		$code = static fn (mixed $x): ?string => is_string($x) && preg_match(self::CODE_REGEX, $x) === 1 ? $x : null;
		$best = [];
		foreach (self::listOf($value['best'] ?? null, 3) as $entry) {
			if (!is_array($entry) || ($c = $code($entry['code'] ?? null)) === null) {
				continue;
			}
			$line = [];
			foreach (self::listOf($entry['line'] ?? null, 6) as $step) {
				if (($s = $code($step)) !== null) {
					$line[] = $s;
				}
			}
			$best[] = ['code' => $c, 'E' => $number($entry['E'] ?? null), 'line' => $line];
		}
		$threats = [];
		foreach (self::listOf($value['threats'] ?? null, 8) as $threat) {
			if (is_string($threat) && trim($threat) !== '') {
				$threats[] = mb_substr($threat, 0, 120);
			}
		}
		$lastMove = null;
		$last = $value['lastMove'] ?? null;
		if (is_array($last) && ($c = $code($last['code'] ?? null)) !== null) {
			$label = $last['label'] ?? null;
			$lastMove = [
				'code' => $c,
				'label' => is_string($label) && preg_match('/^[a-z-]{1,24}$/', $label) === 1 ? $label : null,
				'deltaE' => $number($last['deltaE'] ?? null),
			];
		}
		$e = $number($value['E'] ?? null);
		return ['E' => $e === null ? null : max(0.0, $e), 'best' => $best, 'threats' => $threats, 'lastMove' => $lastMove];
	}

	/**
	 * @return array{kind: string, title: ?string, goal: ?string, ply: ?int}
	 */
	private function context(mixed $value): array {
		$value = is_array($value) ? $value : [];
		$kind = $value['kind'] ?? 'game';
		if (!in_array($kind, ['game', 'lesson', 'puzzle', 'review'], true)) {
			throw $this->invalid('context');
		}
		$text = function (string $field) use ($value): ?string {
			$x = $value[$field] ?? null;
			if ($x === null) {
				return null;
			}
			if (!is_string($x) || mb_strlen($x) > 200) {
				throw $this->invalid('context');
			}
			return $x;
		};
		$ply = $value['ply'] ?? null;
		return ['kind' => $kind, 'title' => $text('title'), 'goal' => $text('goal'), 'ply' => is_int($ply) && $ply >= 0 ? $ply : null];
	}

	/**
	 * @return list<array{role: string, text: string}>
	 */
	private function chat(mixed $value): array {
		if (!is_array($value)) {
			return [];
		}
		$turns = [];
		foreach (array_slice(array_values($value), -4) as $turn) {
			if (is_array($turn) && in_array($turn['role'] ?? null, ['user', 'coach'], true) && is_string($turn['text'] ?? null)) {
				$turns[] = ['role' => (string)$turn['role'], 'text' => mb_substr($turn['text'], 0, 600)];
			}
		}
		return $turns;
	}

	/**
	 * The first `$max` values of a list, or [] when it is not an array.
	 *
	 * @return list<mixed>
	 */
	private static function listOf(mixed $value, int $max): array {
		return is_array($value) ? array_slice(array_values($value), 0, $max) : [];
	}

	private function invalid(string $field): ApiException {
		return new ApiException('invalid_argument', $this->l->t('Invalid value'), 400, ['field' => $field]);
	}
}
