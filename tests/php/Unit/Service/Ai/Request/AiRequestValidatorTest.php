<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai\Request;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Ai\Request\AiRequestValidator;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The validation of LLM requests and the order of their checks.
 */
#[CoversClass(AiRequestValidator::class)]
final class AiRequestValidatorTest extends TestCase {
	use SettingsFixture;

	/** @return array<string, mixed> */
	private static function validMove(): array {
		return ['source' => 'personal', 'persona' => 'professor', 'color' => 'w', 'language' => 'en', 'state' => (new Engine())->initialState(),
			'candidates' => [['code' => 'e2-e4', 'E' => 0.5, 'tags' => [], 'ok' => true]]];
	}

	/**
	 * @return array{0: string, 1: int, 2: array<string, mixed>}
	 */
	private function error(callable $fn): array {
		try {
			$fn();
		} catch (ApiException $e) {
			return [$e->getErrorCode(), $e->getStatus(), $e->getExtra()];
		}
		$this->fail('expected an error');
	}

	public function testMoveRequestValidation(): void {
		$validator = $this->validator();
		$cases = [
			'source' => ['source' => 'openai'],
			'persona' => ['persona' => 'grandpa'],
			'color' => ['color' => 'b'],
			'state' => ['state' => ['v' => 1]],
			'candidates' => ['candidates' => [['code' => 'e2-e5', 'E' => 0.5]]],
			'no candidates' => ['candidates' => []],
			'message' => ['message' => str_repeat('x', 201)],
			'feedback' => ['feedback' => ['answer' => 'x', 'reason' => 'whatever']],
			'language' => ['language' => '../etc'],
			'model' => ['model' => 'bad model!'],
		];
		foreach ($cases as $name => $patch) {
			[$code, $status] = $this->error(fn () => $validator->move('bob', $patch + self::validMove()));
			$this->assertContains($code, ['invalid_argument', 'invalid_state'], $name);
			$this->assertSame(400, $status, $name);
		}
		$this->assertSame(['ai_unavailable', 403, ['reason' => 'not_configured']], $this->error(fn () => $validator->move('bob', self::validMove())),
			'the source is checked after the fields');
	}

	public function testAValidMoveRequest(): void {
		$this->taskType = 'core:text2text:chat';
		$request = $this->validator()->move('bob', ['source' => 'nextcloud', 'model' => 'm1', 'feedback' => ['answer' => str_repeat('a', 80), 'reason' => 'blocked'],
			'history' => [['ply' => 0, 'code' => 'e2-e4'], 'junk', ['ply' => 1, 'code' => 'bad code!'], ['ply' => 1, 'code' => 'e7-e5', 'key' => 'move', 'weight' => 5]],
			'candidates' => [['code' => 'e2e4', 'E' => 1.5, 'tags' => ['safe', 'BAD'], 'ok' => 1]]] + self::validMove());
		$this->assertSame(['nextcloud', 'm1'], [$request->connection->source->value, $request->model]);
		$this->assertSame([
			'persona' => 'professor',
			'color' => 'w',
			'language' => 'en',
			'history' => [['ply' => 0, 'code' => 'e2-e4', 'key' => null, 'weight' => null], ['ply' => 1, 'code' => 'e7-e5', 'key' => 'move', 'weight' => 5]],
			'candidates' => [['code' => 'e2-e4', 'E' => 1.0, 'tags' => ['safe'], 'ok' => false]],
			'message' => null,
			'feedback' => ['answer' => str_repeat('a', 64), 'reason' => 'blocked'],
			'answerMode' => 'code',
		], $request->prompt);
	}

	public function testCoachRequestOrder(): void {
		$validator = $this->validator();
		$valid = ['source' => 'personal', 'state' => (new Engine())->initialState(), 'question' => 'Why?', 'player' => ['color' => 'w', 'skill' => 'beginner']];
		$this->assertSame(['invalid_argument', 400, ['field' => 'player']], $this->error(fn () => $validator->coach('bob', ['player' => ['color' => 'w']] + $valid)));
		$this->assertSame(['invalid_argument', 400, ['field' => 'question']], $this->error(fn () => $validator->coach('bob', ['question' => ' '] + $valid)));
		$this->assertSame('ai_unavailable', $this->error(fn () => $validator->coach('bob', ['context' => ['kind' => 'chess club']] + $valid))[0],
			'the context is checked after the source');
		$this->taskType = 'core:text2text';
		$this->assertSame(['invalid_argument', 400, ['field' => 'context']],
			$this->error(fn () => $validator->coach('bob', ['source' => 'nextcloud', 'context' => ['kind' => 'lesson', 'title' => 5]] + $valid)));
		$request = $validator->coach('bob', ['source' => 'nextcloud', 'chat' => [['role' => 'user', 'text' => 'hi'], ['role' => 'robot', 'text' => 'x']],
			'analysis' => ['E' => -0.5, 'best' => [['code' => 'e2-e4', 'E' => 2, 'line' => ['e7-e5', 7]]], 'threats' => ['', 'mate'], 'lastMove' => ['code' => 'd2-d4', 'label' => 'Blunder!', 'deltaE' => -0.2]]] + $valid);
		$this->assertSame([
			'language' => 'en',
			'history' => [],
			'analysis' => ['E' => 0.0, 'best' => [['code' => 'e2-e4', 'E' => 1.0, 'line' => ['e7-e5']]], 'threats' => ['mate'], 'lastMove' => ['code' => 'd2-d4', 'label' => null, 'deltaE' => -0.2]],
			'context' => ['kind' => 'game', 'title' => null, 'goal' => null, 'ply' => null],
			'player' => ['color' => 'w', 'skill' => 'beginner'],
			'chat' => [['role' => 'user', 'text' => 'hi']],
			'question' => 'Why?',
		], $request->prompt);
	}
}
