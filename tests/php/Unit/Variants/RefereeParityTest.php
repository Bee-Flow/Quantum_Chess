<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Variants;

use OCA\QuantumChess\Variants\VariantEngine;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Replays the referee fixtures of tests/fixtures/referee/ (written by tests/fixtures/generate-referee-fixtures.mjs
 * with the JavaScript layer) with lib/Variants/ and compares every step: refused tries, the preview, what the move
 * leads to, its history record, both players' views, the full views and the end of every game.
 */
final class RefereeParityTest extends TestCase {
	public const DIR = __DIR__ . '/../../../fixtures/referee';

	/** @var array<string, array<string, mixed>> */
	private static array $cache = [];

	/**
	 * The decoded fixture of a variant.
	 *
	 * @return array<string, mixed>
	 */
	public static function fixture(string $variant): array {
		if (!isset(self::$cache[$variant])) {
			// REFEREE_FIXTURES replays another set written by the same generator (for a wider local check)
			$dir = getenv('REFEREE_FIXTURES') ?: self::DIR;
			$text = file_get_contents($dir . '/' . $variant . '.json');
			if ($text === false) {
				throw new \RuntimeException('missing fixture ' . $variant);
			}
			self::$cache[$variant] = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
		}
		return self::$cache[$variant];
	}

	/**
	 * Data as the JSON text of a response would carry it.
	 */
	private static function plain(mixed $v): mixed {
		return json_decode(json_encode($v, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
	}

	/**
	 * @return iterable<string, array{0: string, 1: int}>
	 */
	public static function games(): iterable {
		foreach (['kriegspiel', 'darkchess'] as $variant) {
			foreach (self::fixture($variant)['games'] as $i => $game) {
				yield $variant . ' seed ' . $game['seed'] => [$variant, $i];
			}
		}
	}

	#[DataProvider('games')]
	public function testGameReplaysStepByStep(string $variant, int $index): void {
		$fixture = self::fixture($variant);
		$this->assertSame(VariantEngine::T, $fixture['T']);
		$game = $fixture['games'][$index];
		$state = VariantEngine::newGame($variant);
		$full = [];
		foreach ($game['fullViews'] as $fv) {
			$full[$fv['ply']] = $fv['views'];
		}
		foreach ($game['steps'] as $n => $step) {
			$at = $variant . ' seed ' . $game['seed'] . ' step ' . $n . ' (' . $step['code'] . ')';
			$this->assertSame($step['ply'], $state['ply'], $at);
			$this->assertSame($step['turn'], $state['turn'], $at);
			foreach ($step['refused'] as $code) {
				$this->assertFalse(VariantEngine::isLegal($state, $code), $at . ': refuses ' . $code);
			}
			$this->assertTrue(VariantEngine::isLegal($state, $step['code']), $at);
			$this->assertEquals($step['preview'], self::plain(VariantEngine::preview($state, $step['code'])),
				$at . ': preview');
			// a stored state is read back before every move, as the server does
			$state = VariantEngine::decode(VariantEngine::encode($state));
			$next = VariantEngine::apply($state, $step['code'], $step['u']);
			$this->assertNotNull($next, $at);
			$state = $next;
			$this->assertSame(
				['nextSeat' => $step['nextSeat'], 'result' => $step['result'], 'stateHash' => $step['stateHash']],
				VariantEngine::settlement($state),
				$at . ': settlement',
			);
			$this->assertEquals($step['record'], self::plain($state['history'][count($state['history']) - 1]),
				$at . ': record');
			foreach ([0, 1] as $seat) {
				$view = VariantEngine::viewFor($state, $seat);
				$expected = $step['views'][$seat];
				$this->assertSame($expected['hash'], VariantEngine::positionHash($view), $at . ': view hash ' . $seat);
				$this->assertSame($expected['worlds'], count($view['worlds']), $at . ': view worlds ' . $seat);
				$this->assertSame($expected['visible'], $view['visible'], $at . ': visible ' . $seat);
				$this->assertSame($expected['legal'], $view['legal'], $at . ': legal ' . $seat);
				$history = $view['history'];
				$last = $history === [] ? null : $history[count($history) - 1];
				$this->assertEquals($expected['last'], self::plain($last), $at . ': last record ' . $seat);
				if (isset($full[$state['ply']])) {
					$this->assertEquals($full[$state['ply']][$seat], self::plain($view), $at . ': full view ' . $seat);
				}
			}
		}
		$this->assertEquals($game['result'], self::plain($state['result']));
		$this->assertEquals($game['history'], self::plain($state['history']));
	}
}
