<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Engine\Internal\Worlds;
use OCA\QuantumChess\Engine\SetupException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * vectors.json: start, rescale, r → u, pct, move order, whyIllegal, setup and setup errors.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */
final class VectorsTest extends TestCase {
	private Engine $engine;

	protected function setUp(): void {
		$this->engine = new Engine();
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function vectors(): array {
		/** @var array<string, mixed> */
		return FixtureLoader::load('vectors.json');
	}

	public function testStartPosition(): void {
		$v = self::vectors();
		$this->assertSame($v['start']['json'], $this->engine->serializeState($this->engine->initialState()));
		$this->assertSame($v['start']['json'], Engine::START_JSON);
		$this->assertSame($v['start']['hash'], $this->engine->positionHash($this->engine->initialState()));
		$this->assertSame($v['start']['hash'], Engine::START_HASH);
	}

	public function testLargestRemainderRescale(): void {
		foreach (self::vectors()['rescale'] as $c) {
			$this->assertSame($c['expect'], Worlds::rescale($c['weights']));
			$this->assertSame(Engine::T, array_sum($c['expect']));
		}
		$this->assertSame([11184811, 5592405], Worlds::rescale([8388608, 4194304]), '§5.3 vector');
	}

	public function testRandomToU(): void {
		// W2: c1-h6 is rolled [move 8388608, capture 8388608]; an rng result r gives u = floor(r · 2^24).
		$w2 = $this->engine->setupPosition(['fen' => '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'prelude' => ['g8-f6|h6']]);
		foreach (self::vectors()['rToU'] as $c) {
			$r = $this->engine->applyMove($w2, 'c1-h6', rng: static fn (): float => (float)$c['r']);
			$this->assertSame($c['u'], $r['measurement']['u'] ?? null, 'r = ' . $c['r']);
			$this->assertSame($c['u'] < 8388608 ? 'move' : 'capture', $r['measurement']['key'] ?? null);
		}
	}

	public function testPct(): void {
		foreach (self::vectors()['pct'] as $c) {
			$this->assertSame($c['expect'], $this->engine->pct($c['weight']), 'W = ' . $c['weight']);
		}
	}

	public function testMoveOrder(): void {
		$v = self::vectors()['moveOrder'];
		$this->assertSame($v['legal'], $this->engine->legalCodes(FixtureLoader::state($v['state'])));
		$this->assertSame(
			['e1-d1', 'e1-f1', 'e1-d2', 'e1-e2', 'e1-f2', 'g1-e2', 'g1-f3', 'g1-h3', 'g1-e2|f3', 'g1-e2|h3', 'g1-f3|h3'],
			$v['legal'],
			'§4.10 example',
		);
	}

	/**
	 * @return iterable<string, array{0: string, 1: mixed, 2: string|null}>
	 */
	public static function whyIllegalCases(): iterable {
		foreach (self::vectors()['whyIllegal'] as $i => $c) {
			yield $i . ' ' . $c['name'] => [$c['state'], $c['input'], $c['expect']];
		}
	}

	#[DataProvider('whyIllegalCases')]
	public function testWhyIllegal(string $state, mixed $input, ?string $expect): void {
		$s = FixtureLoader::state($state);
		$this->assertSame($expect, $this->engine->whyIllegal($s, $input));
		if (is_string($input) || is_array($input)) {
			$this->assertSame($expect === null, $this->engine->isLegal($s, $input));
			$found = $this->engine->findMove($s, $input);
			$this->assertSame($expect === null, $found !== null);
			if ($found !== null) {
				$this->assertContains($found['code'], $this->engine->legalCodes($s));
			}
		}
		if ($expect !== null) {
			$this->assertContains($expect, Engine::ILLEGAL_REASONS);
		}
	}

	public function testSetupVectors(): void {
		foreach (self::vectors()['setup'] as $c) {
			$this->assertSame($c['expect'], $this->engine->serializeState($this->engine->setupPosition($c['spec'])), json_encode($c['spec']) ?: '');
		}
	}

	public function testSetupErrors(): void {
		foreach (self::vectors()['setupErrors'] as $c) {
			try {
				$this->engine->setupPosition($c['spec']);
				$this->fail('no SetupException for ' . json_encode($c['spec']));
			} catch (SetupException $e) {
				$this->assertSame($c['expect'], $e->getReason(), json_encode($c['spec']) ?: '');
				$this->assertContains($e->getReason(), Engine::SETUP_ERRORS);
				if ($c['detail'] !== null) {
					$this->assertSame($c['detail'], $e->getDetail());
				}
			}
		}
	}
}
