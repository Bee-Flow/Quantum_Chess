<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The lenient parser (§4.12): parser.json, the table of §4.12, canonical codes (§4.1).
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */
final class ParserTest extends TestCase {
	private Engine $engine;

	protected function setUp(): void {
		$this->engine = new Engine();
	}

	/**
	 * @return iterable<string, array{0: string, 1: array<string, mixed>|null}>
	 */
	public static function fixtureCases(): iterable {
		foreach (FixtureLoader::load('parser.json') as $i => $c) {
			yield $i . ' ' . json_encode($c['input']) => [$c['input'], $c['expect']];
		}
	}

	/**
	 * @param array<string, mixed>|null $expect
	 */
	#[DataProvider('fixtureCases')]
	public function testParserFixture(string $input, ?array $expect): void {
		// Same values, same key order (type, from, to, promo?, letter?).
		$this->assertSame($expect, $this->engine->parseMoveCode($input));
	}

	/**
	 * @return iterable<string, array{0: string, 1: array<string, mixed>|null}>
	 */
	public static function tableCases(): iterable {
		$merge = ['type' => 'merge', 'from' => [27, 39], 'to' => [63], 'letter' => 'Q'];
		$split = ['type' => 'split', 'from' => [6], 'to' => [21, 23]];
		$e2e4 = ['type' => 'standard', 'from' => [12], 'to' => [28]];
		$e8q = ['type' => 'standard', 'from' => [52], 'to' => [60], 'promo' => 'q'];
		$cases = [
			'Qd4|h5xh8 #' => $merge,
			'?Na4 {c4 50%}' => ['type' => 'measure', 'from' => [24], 'to' => [], 'letter' => 'N'],
			'Nf3xe5 {capture 25%} #' => ['type' => 'standard', 'from' => [21], 'to' => [36], 'letter' => 'N'],
			'Bc1xh6 {capture 50%}' => ['type' => 'standard', 'from' => [2], 'to' => [47], 'letter' => 'B'],
			'g1-h3|f3' => $split,
			'g1f3/h3' => $split,
			'G1-F3,H3' => $split,
			'h3/f3g1' => ['type' => 'merge', 'from' => [21, 23], 'to' => [6]],
			'E2E4' => $e2e4,
			'e2:e4' => $e2e4,
			'  e2-e4+  ' => $e2e4,
			'e7e8q' => $e8q,
			'e7-e8=Q' => $e8q,
			'e7-e8=q!?' => $e8q,
			'measure A4' => ['type' => 'measure', 'from' => [24], 'to' => []],
			'?a4' => ['type' => 'measure', 'from' => [24], 'to' => []],
			'o-o-o' => ['castle' => 'O-O-O'],
			'0-0-0' => ['castle' => 'O-O-O'],
			'O-O' => ['castle' => 'O-O'],
			'B1-c3' => ['type' => 'standard', 'from' => [1], 'to' => [18]],
			'N?a4' => null,
			'e2 e4' => null,
			'e2-e4-e5' => null,
			'Pe2-e4' => null,
			'e9-e4' => null,
			'' => null,
			'e2–e4' => null,
			'measurea4' => null,
			'?' => null,
		];
		foreach ($cases as $input => $expect) {
			yield json_encode((string)$input) => [(string)$input, $expect];
		}
	}

	/**
	 * @param array<string, mixed>|null $expect
	 */
	#[DataProvider('tableCases')]
	public function testParserTableOfTheRules(string $input, ?array $expect): void {
		$this->assertSame($expect, $this->engine->parseMoveCode($input));
	}

	public function testEveryWorkedExampleNotationParsesBack(): void {
		// The notation examples of §5.7 and the notation strings of the worked examples (§10).
		foreach (['Bc1xh6 {capture 50%}', 'd3-e4 {miss 75%}', '?Na4 {c4 50%}', 'Qd4|h5xh8 #', 'Ng1-f3|h3', 'Nf3xe5 {capture 25%} #', 'Ra1-a8 #'] as $text) {
			$this->assertNotNull($this->engine->parseMoveCode($text), $text);
		}
	}

	public function testMoveCode(): void {
		$this->assertSame('e2-e4', $this->engine->moveCode(['type' => 'standard', 'from' => [12], 'to' => [28]]));
		$this->assertSame('e7-e8=Q', $this->engine->moveCode(['type' => 'standard', 'from' => [52], 'to' => [60], 'promo' => 'q']));
		$this->assertSame('h4-h3|a4', $this->engine->moveCode(['type' => 'split', 'from' => [31], 'to' => [24, 23]]), 'index order, not name order (W12)');
		$this->assertSame('d1-h1|d5', $this->engine->moveCode(['type' => 'split', 'from' => [3], 'to' => [35, 7]]));
		$this->assertSame('f3|h3-g1', $this->engine->moveCode(['type' => 'merge', 'from' => [23, 21], 'to' => [6]]));
		$this->assertSame('?a3', $this->engine->moveCode(['type' => 'measure', 'from' => [16], 'to' => []]));
		$this->expectException(\InvalidArgumentException::class);
		$this->engine->moveCode(['type' => 'standard', 'from' => [64], 'to' => [0]]);
	}

	public function testMoveCodeRejectsUnknownTypes(): void {
		$this->expectException(\InvalidArgumentException::class);
		$this->engine->moveCode(['type' => 'castle', 'from' => [4], 'to' => [6]]);
	}

	public function testSquareNamesAndIndices(): void {
		$this->assertSame('a1', $this->engine->squareName(0));
		$this->assertSame('e4', $this->engine->squareName(28));
		$this->assertSame('h8', $this->engine->squareName(63));
		$this->assertSame(28, $this->engine->squareIndex('e4'));
		$this->assertSame(28, $this->engine->squareIndex('E4'));
		foreach (['', 'e', 'e9', 'i1', 'e44', 'E0', '4e'] as $bad) {
			$this->assertSame(-1, $this->engine->squareIndex($bad), $bad);
		}
		for ($s = 0; $s < 64; $s++) {
			$this->assertSame($s, $this->engine->squareIndex($this->engine->squareName($s)));
		}
		$this->expectException(\InvalidArgumentException::class);
		$this->engine->squareName(64);
	}
}
