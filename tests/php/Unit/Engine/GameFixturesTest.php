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
 * The parity gate (SPEC §3.5, ER §12): every step of every game fixture and scripted example replays
 * byte-identically — legal code order, state bytes, measurement record, notation, hash and the per-step views.
 */
final class GameFixturesTest extends TestCase {
	/**
	 * @return iterable<string, array{0: array<string, mixed>}>
	 */
	public static function games(): iterable {
		foreach (FixtureLoader::gameFiles() as $file) {
			foreach (FixtureLoader::load($file) as $game) {
				yield $file . ' ' . $game['name'] => [$game];
			}
		}
	}

	/**
	 * @return iterable<string, array{0: array<string, mixed>}>
	 */
	public static function examples(): iterable {
		foreach (FixtureLoader::load('vectors.json')['examples'] as $game) {
			yield $game['name'] => [$game];
		}
	}

	/**
	 * @param array<string, mixed> $game
	 */
	#[DataProvider('games')]
	public function testRandomGameReplaysByteIdentically(array $game): void {
		$this->assertSame([], FixtureLoader::replay(new Engine(), $game));
	}

	/**
	 * @param array<string, mixed> $game
	 */
	#[DataProvider('examples')]
	public function testScriptedExampleReplaysByteIdentically(array $game): void {
		$this->assertSame([], FixtureLoader::replay(new Engine(), $game));
	}

	public function testTheFixturesAreComplete(): void {
		$files = FixtureLoader::gameFiles();
		$this->assertNotEmpty($files);
		$steps = 0;
		$games = 0;
		foreach ($files as $file) {
			$list = FixtureLoader::load($file);
			$this->assertIsArray($list);
			$this->assertGreaterThanOrEqual(1, count($list));
			$this->assertLessThanOrEqual(20, count($list));
			foreach ($list as $game) {
				$games++;
				$steps += count($game['steps']);
			}
		}
		$this->assertGreaterThan(1500, $steps, 'the generator promises more than 1500 steps');
		$this->assertGreaterThan(40, $games);
		$this->assertGreaterThanOrEqual(60, count(FixtureLoader::load('vectors.json')['examples']));
	}

	public function testOneEngineInstanceReplaysEverythingInSequence(): void {
		// The analysis cache must never leak between states: replay all games through one shared instance.
		$engine = new Engine();
		$fail = [];
		foreach (self::games() as [$game]) {
			array_push($fail, ...FixtureLoader::replay($engine, $game));
		}
		foreach (self::examples() as [$game]) {
			array_push($fail, ...FixtureLoader::replay($engine, $game));
		}
		$this->assertSame([], $fail);
	}
}
