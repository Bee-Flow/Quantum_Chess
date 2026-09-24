<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Request;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Engine\InvalidStateException;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\AiSource;
use OCA\QuantumChess\Service\Ai\AiSourceService;
use OCA\QuantumChess\Service\Ai\Prompt\Personas;
use OCA\QuantumChess\Service\Ai\Prompt\PromptBuilder;
use OCA\QuantumChess\Service\Ai\Provider\ProviderValidator;
use OCP\IL10N;

/**
 * Validates the requests of the LLM opponent and of the coach, and resolves their source.
 *
 * Every field the client sends ends up in a prompt, so each one is checked and bounded. Required fields must be
 * valid; optional lists are cut to their limits and invalid entries are dropped. The checks run in a fixed order, so
 * a request with several problems always reports the same one.
 */
class AiRequestValidator {
	/** The language of the answer, as a locale code such as `nl` or `pt_BR`. */
	private const LANGUAGE_REGEX = '/^[a-z]{2,3}([_-][A-Za-z0-9]{2,8}){0,2}$/';
	private const CODE_REGEX = '/^[A-Za-z0-9|?=:\/,x+-]{1,32}$/';
	private const TAG_REGEX = '/^[a-z-]{1,24}(:[a-z0-9]{1,4}){0,2}$/';

	public function __construct(
		private readonly Engine $engine,
		private readonly AiSourceService $sources,
		private readonly IL10N $l,
	) {
	}

	/**
	 * The request of the LLM opponent for its next move.
	 *
	 * @param array<string, mixed> $request `source`, `model`, `persona`, `color`, `language`, `state`, `history`,
	 *                                      `candidates` (1 to 6 legal moves ranked by the computer player),
	 *                                      `message`, `feedback` (the rejected answer of a retry) and `answerMode`
	 *                                      (`code` or `index`)
	 * @return LlmRequest<array{
	 *     persona: string,
	 *     color: string,
	 *     language: string,
	 *     history: list<array{ply: int, code: string, key: ?string, weight: ?int}>,
	 *     candidates: list<array{code: string, E: float, tags: list<string>, ok: bool}>,
	 *     message: ?string,
	 *     feedback: ?array{answer: string, reason: string},
	 *     answerMode: string,
	 * }>
	 * @throws ApiException invalid_argument, invalid_state, or the errors of AiSourceService::resolve()
	 */
	public function move(string $uid, array $request): LlmRequest {
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
			if (!is_array($feedback) || !is_string($feedback['answer'] ?? null)
				|| !is_string($feedback['reason'] ?? null)
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
		return new LlmRequest($connection, $model, $state, [
			'persona' => $persona,
			'color' => $color,
			'language' => $language,
			'history' => $this->history($request['history'] ?? [], 20),
			'candidates' => $candidates,
			'message' => $message,
			'feedback' => $feedback,
			'answerMode' => $answerMode,
		]);
	}

	/**
	 * A question to the coach.
	 *
	 * @param array<string, mixed> $request `source`, `model`, `language`, `state`, `history`, `analysis` (of the
	 *                                      computer player), `context`, `player` (`color` and `skill`), `chat` (the
	 *                                      last turns) and `question`
	 * @return LlmRequest<array{
	 *     language: string,
	 *     history: list<array{ply: int, code: string, key: ?string, weight: ?int}>,
	 *     analysis: array{
	 *         E: ?float,
	 *         best: list<array{code: string, E: ?float, line: list<string>}>,
	 *         threats: list<string>,
	 *         lastMove: ?array{code: string, label: ?string, deltaE: ?float},
	 *     },
	 *     context: array{kind: string, title: ?string, goal: ?string, ply: ?int},
	 *     player: array{color: string, skill: string},
	 *     chat: list<array{role: string, text: string}>,
	 *     question: string,
	 * }>
	 * @throws ApiException invalid_argument, invalid_state, or the errors of AiSourceService::resolve()
	 */
	public function coach(string $uid, array $request): LlmRequest {
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
		return new LlmRequest($connection, $model, $state, [
			'language' => $language,
			'history' => $this->history($request['history'] ?? [], 16),
			'analysis' => $this->analysis($request['analysis'] ?? null),
			'context' => $this->context($request['context'] ?? null),
			'player' => ['color' => (string)$player['color'], 'skill' => (string)$player['skill']],
			'chat' => $this->chat($request['chat'] ?? []),
			'question' => $question,
		]);
	}

	/**
	 * @param array<string, mixed> $request
	 * @throws ApiException
	 */
	private function source(array $request): AiSource {
		$source = $request['source'] ?? null;
		$valid = is_string($source) ? AiSource::tryFrom($source) : null;
		if ($valid === null) {
			throw $this->invalid('source');
		}
		return $valid;
	}

	/**
	 * The requested model, or null for the source's default.
	 *
	 * @param array<string, mixed> $request
	 * @throws ApiException
	 */
	private function model(array $request): ?string {
		$model = $request['model'] ?? null;
		if ($model === null || $model === '') {
			return null;
		}
		if (!is_string($model) || !ProviderValidator::isValidModel($model)) {
			throw $this->invalid('model');
		}
		return $model;
	}

	/**
	 * @param array<string, mixed> $request
	 * @throws ApiException
	 */
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
	 * @throws ApiException invalid_state with the invariant the state breaks
	 */
	private function state(array $request): array {
		try {
			return $this->engine->validateState($request['state'] ?? null);
		} catch (InvalidStateException $e) {
			throw new ApiException(
				ApiError::InvalidState,
				$this->l->t('The position is not valid.'),
				['invariant' => $e->getInvariant()],
			);
		}
	}

	/**
	 * 1 to 6 legal candidate moves, with their canonical codes.
	 *
	 * @param array<string, mixed> $state
	 * @return list<array{code: string, E: float, tags: list<string>, ok: bool}>
	 * @throws ApiException
	 */
	private function candidates(array $state, mixed $value): array {
		if (!is_array($value) || count($value) < 1 || count($value) > 6) {
			throw $this->invalid('candidates');
		}
		$list = [];
		foreach (array_values($value) as $candidate) {
			if (!is_array($candidate) || !is_string($candidate['code'] ?? null)
				|| !is_numeric($candidate['E'] ?? null)) {
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
	 * The last `$max` valid history entries; invalid entries are dropped.
	 *
	 * @return list<array{ply: int, code: string, key: ?string, weight: ?int}>
	 */
	private function history(mixed $value, int $max): array {
		if (!is_array($value)) {
			return [];
		}
		$list = [];
		foreach (array_slice(array_values($value), -$max) as $entry) {
			if (!is_array($entry) || !is_int($entry['ply'] ?? null)
				|| $entry['ply'] < 0 || $entry['ply'] > Engine::MAX_PLY
				|| !is_string($entry['code'] ?? null) || preg_match(self::CODE_REGEX, $entry['code']) !== 1) {
				continue;
			}
			$key = $entry['key'] ?? null;
			$weight = $entry['weight'] ?? null;
			$valid = is_string($key) && in_array($key, Engine::OUTCOME_KEYS, true)
				&& is_int($weight) && $weight >= 0 && $weight <= Engine::T;
			$list[] = [
				'ply' => $entry['ply'],
				'code' => $entry['code'],
				'key' => $valid ? $key : null,
				'weight' => $valid ? $weight : null,
			];
		}
		return $list;
	}

	/**
	 * The computer player's analysis; numbers are clamped and invalid entries dropped.
	 *
	 * @return array{
	 *     E: ?float,
	 *     best: list<array{code: string, E: ?float, line: list<string>}>,
	 *     threats: list<string>,
	 *     lastMove: ?array{code: string, label: ?string, deltaE: ?float},
	 * }
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
		return [
			'E' => $e === null ? null : max(0.0, $e),
			'best' => $best,
			'threats' => $threats,
			'lastMove' => $lastMove,
		];
	}

	/**
	 * Where the question is asked: a game, a lesson, a puzzle or a review.
	 *
	 * @return array{kind: string, title: ?string, goal: ?string, ply: ?int}
	 * @throws ApiException
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
		return [
			'kind' => $kind,
			'title' => $text('title'),
			'goal' => $text('goal'),
			'ply' => is_int($ply) && $ply >= 0 ? $ply : null,
		];
	}

	/**
	 * The last four turns of the coach chat.
	 *
	 * @return list<array{role: string, text: string}>
	 */
	private function chat(mixed $value): array {
		if (!is_array($value)) {
			return [];
		}
		$turns = [];
		foreach (array_slice(array_values($value), -4) as $turn) {
			if (is_array($turn) && in_array($turn['role'] ?? null, ['user', 'coach'], true)
				&& is_string($turn['text'] ?? null)) {
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
		return ApiException::invalidArgument($field, $this->l->t('Invalid value'));
	}
}
