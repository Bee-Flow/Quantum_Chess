<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai\Prompt;

use OCA\QuantumChess\Service\Ai\Prompt\AnswerParser;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Reading the answers of LLMs: JSON with or without fences, fallbacks, and the length limits.
 */
#[CoversClass(AnswerParser::class)]
final class AnswerParserTest extends TestCase {
	/** @return array<string, array{string, ?string, ?int, string, string}> */
	public static function answers(): array {
		return [
			'plain JSON' => ['{"move":"e7-e5","comment":"Hello!","mood":"happy"}', 'e7-e5', null, 'Hello!', 'happy'],
			'fenced' => [
				"```json\n{\"move\": \"b8-a6|c6\", \"comment\": \"Split!\", \"mood\": \"playful\"}\n```",
				'b8-a6|c6',
				null,
				'Split!',
				'playful',
			],
			'trailing text' => [
				'Sure! {"move":"g8-f6","comment":"A {brace} in \"text\"","mood":"worried"} Good luck.',
				'g8-f6',
				null,
				'A {brace} in "text"',
				'worried',
			],
			'pick' => ['{"pick": 2, "comment": "Two.", "mood": "confident"}', null, 2, 'Two.', 'confident'],
			'pick as string' => ['{"pick": "3"}', null, 3, '', 'thinking'],
			'bad mood' => ['{"move":"e7-e5","comment":"x","mood":"furious"}', 'e7-e5', null, 'x', 'thinking'],
			'regex fallback' => ['I think Nb8-c6 is best here.', 'Nb8-c6', null, '', 'thinking'],
			'castling fallback' => ['Let us castle: O-O', 'O-O', null, '', 'thinking'],
			'measure fallback' => ['I measure ?a3 now', '?a3', null, '', 'thinking'],
			'nothing' => ['I resign, this is too hard.', null, null, '', 'thinking'],
			'comment cleaned' => [
				'{"move":"e7-e5","comment":"line1\nline2\t\u0007end' . str_repeat('x', 300) . '"}',
				'e7-e5',
				null,
				'',
				'thinking',
			],
		];
	}

	#[DataProvider('answers')]
	public function testAnswerParser(string $text, ?string $move, ?int $pick, string $comment, string $mood): void {
		$parsed = AnswerParser::parseMove($text);
		$this->assertSame($move, $parsed['move']);
		$this->assertSame($pick, $parsed['pick']);
		$this->assertSame($mood, $parsed['mood']);
		if ($comment !== '' || !str_contains($text, 'line1')) {
			$this->assertSame($comment, $parsed['comment']);
		} else {
			$this->assertStringStartsWith('line1 line2 end', $parsed['comment']);
			$this->assertSame(200, mb_strlen($parsed['comment']));
		}
	}

	public function testCoachAnswer(): void {
		$this->assertSame("**Hi**\n- `e2-e4`", AnswerParser::parseCoach("  **Hi**\r\n- `e2-e4`\x07  "));
		$this->assertSame(2000, mb_strlen(AnswerParser::parseCoach(str_repeat('ab ', 1000))));
	}
}
