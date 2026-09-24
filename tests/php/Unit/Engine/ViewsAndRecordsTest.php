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
 * views.json (derived views, §8) and records.json (chain, roll display, roll identity, support keys, certain
 * FEN, SHA-256).
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */
final class ViewsAndRecordsTest extends TestCase {
	private Engine $engine;

	protected function setUp(): void {
		$this->engine = new Engine();
	}

	/**
	 * @return iterable<string, array{0: array<string, mixed>}>
	 */
	public static function viewCases(): iterable {
		foreach (FixtureLoader::load('views.json') as $i => $c) {
			yield 'state ' . $i => [$c];
		}
	}

	/**
	 * @param array<string, mixed> $c
	 */
	#[DataProvider('viewCases')]
	public function testViews(array $c): void {
		$e = $this->engine;
		$s = FixtureLoader::state($c['state']);
		$this->assertSame($c['kingDanger'], ['w' => $e->kingDanger($s, 'w'), 'b' => $e->kingDanger($s, 'b')]);
		$this->assertSame($c['budget'], ['w' => $e->budget($s, 'w'), 'b' => $e->budget($s, 'b')]);
		$this->assertSame($c['worlds'], $e->worldCount($s));
		$this->assertSame($c['links'], $e->links($s));
		$this->assertSame($c['linkGroups'], $e->linkGroups($s));
		$this->assertSame($c['kingTrapped'], $e->kingTrapped($s));
		// Probabilities are exact dyadic doubles; JSON prints 1 and 0 without a fraction.
		$this->assertSame(
			FixtureLoader::numbersAsFloats($c['squareView']),
			FixtureLoader::numbersAsFloats($e->squareView($s)),
		);
		$risks = [];
		foreach ($e->generateMoves($s) as $m) {
			$risks[$m['code']] = $e->moveRisk($s, $m['code']);
		}
		$this->assertSame(FixtureLoader::numbersAsFloats($c['moveRisk']), $risks);
		// The same numbers through a LegalMove array instead of the code.
		foreach (array_slice($e->generateMoves($s), 0, 5) as $m) {
			$this->assertSame($risks[$m['code']], $e->moveRisk($s, $m));
		}
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function records(): array {
		/** @var array<string, mixed> */
		return FixtureLoader::load('records.json');
	}

	public function testChain(): void {
		foreach (self::records()['chain'] as $c) {
			$prev = $this->engine->chainStart($c['gameId'], $c['whiteUid'], $c['blackUid'], $c['createdAt']);
			$this->assertSame($c['chain0'], $prev);
			$state = FixtureLoader::state($c['start']);
			foreach ($c['moves'] as $m) {
				$this->assertSame($m['afterSha256'], hash('sha256', $m['after']));
				$this->assertSame($m['ply'], $state['ply']);
				$prev = $this->engine->chainNext($prev, $m['ply'], $m['code'], $m['u'], $m['key'], $m['after']);
				$this->assertSame($m['chain'], $prev);
				// The moves replay to the recorded states with the recorded u.
				$r = $this->engine->applyMove($state, $m['code'], $m['u'], $m['u'] === null ? $m['key'] : null);
				$this->assertSame($m['after'], $this->engine->serializeState($r['state']));
				$this->assertSame($m['key'], $r['measurement']['key'] ?? null);
				$state = $r['state'];
			}
		}
	}

	public function testChainVectorOfTheRules(): void {
		// The chain vector of §9.4: W2 played as game 42, alice vs bob, created at 1790000000.
		$c0 = $this->engine->chainStart(42, 'alice', 'bob', 1790000000);
		$this->assertSame('049816ae57365c0bfe28b2358e4ff9b460d91765ee10fcbc8714a3a0d2163c75', $c0);
		$w2 = $this->engine->setupPosition(['fen' => '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'prelude' => ['g8-f6|h6']]);
		$r = $this->engine->applyMove($w2, 'c1-h6', 8388608);
		$json = $this->engine->serializeState($r['state']);
		$this->assertSame('b4b4d83ee34de58f4039ea6b4a6ffe08c84f95a850b2396bc18f0d23ed6234eb', hash('sha256', $json));
		$c1 = $this->engine->chainNext(
			$c0,
			0,
			'c1-h6',
			$r['measurement']['u'] ?? null,
			$r['measurement']['key'] ?? null,
			$json,
		);
		$this->assertSame('23c84483be0638e3765cec8a1f46c3ed84d01806ad05c3598ebd9355fa8d6608', $c1);
	}

	public function testChainRejectsNegativeNumbers(): void {
		$this->expectException(\InvalidArgumentException::class);
		$this->engine->chainNext(str_repeat('0', 64), -1, 'e2-e4', null, null, Engine::START_JSON);
	}

	public function testRollDisplay(): void {
		foreach (self::records()['rollDisplay'] as $c) {
			$this->assertSame($c['text'], $this->engine->rollDisplay($c['record'], $c['labels'] ?? []));
			$this->assertSame($c['intervals'], $this->engine->rollIntervals($c['record']));
		}
	}

	public function testRollDisplayVectorsOfTheRules(): void {
		$w2 = [['key' => 'move', 'weight' => 8388608], ['key' => 'capture', 'weight' => 8388608]];
		$cases = [
			[$w2, 'move', 6227703, 'Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved'],
			[$w2, 'move', 8388607, 'Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.4999 → Moved'],
			[
				[
					['key' => 'miss', 'weight' => 8388608],
					['key' => 'move', 'weight' => 4194304],
					['key' => 'capture', 'weight' => 4194304],
				],
				'move',
				10368000,
				'Missed [0.0000, 0.5000) · Moved [0.5000, 0.7500) · Captured [0.7500, 1.0000) · rolled 0.6179 → Moved',
			],
			[
				[['key' => 'miss', 'weight' => 11184811], ['key' => 'capture', 'weight' => 5592405]],
				'miss',
				11184810,
				'Missed [0.00000000, 0.66666668) · Captured [0.66666668, 1.00000000) · rolled 0.66666662 → Missed',
			],
			[
				[['key' => 'miss', 'weight' => 11184811], ['key' => 'capture', 'weight' => 5592405]],
				'capture',
				11184811,
				'Missed [0.0000, 0.6666) · Captured [0.6666, 1.0000) · rolled 0.6666 → Captured',
			],
			[$w2, 'capture', null, 'Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · forced → Captured'],
			[
				[['key' => 'a4', 'weight' => 8388608], ['key' => 'c4', 'weight' => 8388608]],
				'c4',
				9000000,
				'a4 [0.0000, 0.5000) · c4 [0.5000, 1.0000) · rolled 0.5364 → c4',
			],
		];
		foreach ($cases as [$outcomes, $key, $u, $text]) {
			$this->assertSame($text, $this->engine->rollDisplay([
				'key' => $key,
				'u' => $u,
				'captured' => null,
				'outcomes' => $outcomes,
				'fallback' => false,
			]));
		}
	}

	public function testRollDisplayRejectsMalformedRecords(): void {
		$this->expectException(\InvalidArgumentException::class);
		$this->engine->rollDisplay(['key' => 'move', 'u' => 1]);
	}

	public function testRollIdentity(): void {
		foreach (self::records()['rollIdentity'] as $c) {
			$this->assertSame($c['expect'], $this->engine->rollIdentity(FixtureLoader::state($c['state']), $c['code']));
		}
		$w2 = $this->engine->setupPosition(['fen' => '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'prelude' => ['g8-f6|h6']]);
		$this->assertSame('0/8f9af7718bec3d8a/c1-h6', $this->engine->rollIdentity($w2, 'c1-h6'));
	}

	public function testSupportKeys(): void {
		foreach (self::records()['supportKey'] as $c) {
			$s = FixtureLoader::state($c['state']);
			$this->assertSame($c['key'], $this->engine->supportKey($s));
			$this->assertSame($c['mirror'], $this->engine->supportKeyMirror($s));
			$this->assertSame(66, strlen($this->engine->supportKey($s)), 'fits the support_key column (string 66)');
		}
		$start = $this->engine->initialState();
		$this->assertSame(
			'w|RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr',
			$this->engine->supportKey($start),
		);
		$this->assertSame(
			'b|RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr',
			$this->engine->supportKeyMirror($start),
		);
	}

	public function testCertainFen(): void {
		foreach (self::records()['certainFen'] as $c) {
			$this->assertSame($c['fen'], $this->engine->certainFen(FixtureLoader::state($c['state'])));
		}
		$this->assertSame(
			'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
			$this->engine->certainFen($this->engine->initialState()),
		);
	}

	public function testSha256(): void {
		foreach (self::records()['sha256'] as $c) {
			$this->assertSame($c['hex'], hash('sha256', $c['text']));
		}
	}
}
