<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use PHPUnit\Framework\TestCase;

/**
 * describeForLlm (ER Appendix B, SPEC §3.4, §10.4): golden texts for W2, W4 and W6, links in words, the size limit.
 */
final class DescribeForLlmTest extends TestCase {
	private Engine $e;

	protected function setUp(): void {
		$this->e = new Engine();
	}

	public function testW2(): void {
		$w2 = $this->e->setupPosition(['fen' => '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'prelude' => ['g8-f6|h6']]);
		$this->assertSame(
			"Quantum Chess (rules v1). You are Black. Move 1, White to move.\n"
			. "Certain pieces (FEN, uncertain pieces removed): 4k3/8/8/8/8/8/8/2B1K3 w - - 0 1\n"
			. "Uncertain pieces:\n"
			. "- Black knight: f6 50%, h6 50%\n"
			. "Links: none\n"
			. 'Possibilities: 2. Budget: White 1/8, Black 2/8. King danger: White 0%, Black 0%.',
			$this->e->describeForLlm($w2, 'b'),
		);
	}

	public function testW4(): void {
		$s = $this->e->setupPosition(['fen' => '4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1']);
		$s = $this->e->applyMove($s, 'b6-a4|c4')['state'];
		$s = $this->e->applyMove($s, 'a1-a8')['state'];
		$this->assertSame(
			"Quantum Chess (rules v1). You are Black. Move 2, Black to move.\n"
			. "Certain pieces (FEN, uncertain pieces removed): 4k3/8/8/8/8/8/8/4K3 b - - 2 2\n"
			. "Uncertain pieces:\n"
			. "- White rook: a1 50%, a8 50%\n"
			. "- Black knight: a4 50%, c4 50%\n"
			. "Links: white rook a1 <-> black knight a4 (the rook is on a1 exactly when the knight is on a4)\n"
			. 'Possibilities: 2. Budget: White 2/8, Black 2/8. King danger: White 0%, Black 50%.',
			$this->e->describeForLlm($s, 'b'),
		);
	}

	public function testW6(): void {
		$w6 = $this->e->setupPosition(['fen' => '7k/8/8/8/8/8/8/3QK3 w - - 0 1', 'prelude' => ['d1-d4|h5']]);
		$this->assertSame(
			"Quantum Chess (rules v1). You are White. Move 1, White to move.\n"
			. "Certain pieces (FEN, uncertain pieces removed): 7k/8/8/8/8/8/8/4K3 w - - 0 1\n"
			. "Uncertain pieces:\n"
			. "- White queen: d4 50%, h5 50%\n"
			. "Links: none\n"
			. 'Possibilities: 2. Budget: White 2/8, Black 1/8. King danger: White 0%, Black 100%.',
			$this->e->describeForLlm($w6, 'w'),
		);
		$after = $this->e->applyMove($w6, 'd4|h5-h8')['state'];
		$this->assertStringEndsWith("\nGame over: 1-0 (king_captured).", $this->e->describeForLlm($after, 'b'));
	}

	public function testLinkWordings(): void {
		// W5: the rook is on d1 only where the knight is on f1 (and on h1 only where it is on h5).
		$s = $this->e->setupPosition(['fen' => '4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1']);
		$s = $this->e->applyMove($s, 'g3-f1|h5')['state'];
		$s = $this->e->applyMove($s, 'd1-h1|d5')['state'];
		$this->assertStringContainsString(
			"\nLinks: white rook d1 <-> black knight f1 (whenever the rook is on d1, the knight is on f1)\n",
			$this->e->describeForLlm($s, 'w'),
		);
		// Two rooks of different colours are named by colour.
		$s = $this->e->setupPosition(['fen' => '4k3/1r6/8/8/8/8/8/R3K3 b - - 0 1']);
		$s = $this->e->applyMove($s, 'b7-a7|b4')['state'];
		$s = $this->e->applyMove($s, 'a1-a8')['state'];
		$this->assertStringContainsString(
			"\nLinks: white rook a1 <-> black rook a7 (the white rook is on a1 exactly when the black rook is on a7)\n",
			$this->e->describeForLlm($s, 'w'),
		);
	}

	public function testStartAndPerspective(): void {
		$text = $this->e->describeForLlm($this->e->initialState(), 'w');
		$this->assertStringStartsWith('Quantum Chess (rules v1). You are White. Move 1, White to move.', $text);
		$this->assertStringContainsString("\nUncertain pieces: none\n", $text);
		$this->assertStringContainsString('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', $text);
		$this->expectException(\InvalidArgumentException::class);
		$this->e->describeForLlm($this->e->initialState(), 'white');
	}

	public function testPlainTextWithinFourKilobytesOnEveryFixtureState(): void {
		$max = 0;
		foreach (FixtureLoader::gameFiles() as $file) {
			foreach (FixtureLoader::load($file) as $game) {
				foreach ($game['steps'] as $i => $step) {
					if ($i % 3 !== 0) {
						continue;
					}
					$text = $this->e->describeForLlm(FixtureLoader::state($step['after']), 'b');
					$max = max($max, strlen($text));
					$this->assertMatchesRegularExpression('/^[\x20-\x7e\n]+$/', $text);
					$this->assertStringNotContainsString('Legal moves', $text, 'the prompt builder lists the moves');
				}
			}
		}
		$this->assertLessThanOrEqual(4096, $max);
	}
}
