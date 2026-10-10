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
 * The public API of the referee: supported variants, the JSON shape of states and views, storage round trips,
 * refusals, the end of a game, and that a view never holds an enemy piece the player may not see.
 */
final class VariantEngineTest extends TestCase {
	/**
	 * @return iterable<string, array{0: string}>
	 */
	public static function variants(): iterable {
		yield 'kriegspiel' => ['kriegspiel'];
		yield 'darkchess' => ['darkchess'];
	}

	public function testSupportsOnlyTheServerRuledVariants(): void {
		$this->assertTrue(VariantEngine::supports('kriegspiel'));
		$this->assertTrue(VariantEngine::supports('darkchess'));
		$this->assertFalse(VariantEngine::supports('classic'));
		$this->assertFalse(VariantEngine::supports('atomic'));
		$this->expectException(\InvalidArgumentException::class);
		VariantEngine::newGame('atomic');
	}

	#[DataProvider('variants')]
	public function testNewGameHasTheJsonShapeOfTheJavaScriptLayer(string $variant): void {
		$state = VariantEngine::newGame($variant);
		$json = json_encode($state, JSON_THROW_ON_ERROR);
		$this->assertStringContainsString('"options":{}', $json);
		$this->assertStringContainsString('"x":{"ep":-1,"epVictim":-1,"castle":[{"flag":"K"', $json);
		$data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame(['v', 'variant', 'options', 'worlds', 'turn', 'ply', 'quiet', 'result', 'history'],
			array_keys($data));
		$this->assertSame($variant, $data['variant']);
		$this->assertSame([['b', 'w']], array_map('array_keys', array_map(null, $data['worlds'])));
		$this->assertSame(VariantEngine::T, $data['worlds'][0]['w']);
		$this->assertSame(['nextSeat' => 0, 'result' => ''], array_slice(VariantEngine::settlement($state), 0, 2));
		$this->assertMatchesRegularExpression('/^[0-9a-f]{16}$/', VariantEngine::positionHash($state));
	}

	#[DataProvider('variants')]
	public function testStoredStatesReadBackUnchanged(string $variant): void {
		$state = VariantEngine::newGame($variant);
		foreach (['e2-e4', 'b8-c6', 'g1-f3', 'c6-b4|d4'] as $code) {
			$state = VariantEngine::apply($state, $code, 123456);
			$this->assertNotNull($state);
		}
		$text = VariantEngine::encode($state);
		$back = VariantEngine::decode($text);
		$this->assertSame($text, VariantEngine::encode($back));
		$this->assertSame($text, json_encode($back, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
		$this->assertSame(VariantEngine::positionHash($state), VariantEngine::positionHash($back));
		// a plain assoc decode (options as []) is accepted and stored with {} again
		$plain = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame([], $plain['options']);
		$this->assertSame($text, VariantEngine::encode($plain));
		$this->assertSame(VariantEngine::settlement($state), VariantEngine::settlement($plain));
		$view = json_encode(VariantEngine::viewFor($plain, 1), JSON_THROW_ON_ERROR);
		$this->assertStringContainsString('"options":{}', $view);
	}

	#[DataProvider('variants')]
	public function testRefusals(string $variant): void {
		$state = VariantEngine::newGame($variant);
		foreach (['', 'e2-e5', 'e7-e5', '?e2', 'b1-a3|d2', 'a1|b1-c3', 'z9-z8', 'O-O'] as $code) {
			$this->assertFalse(VariantEngine::isLegal($state, $code), $code);
			$this->assertNull(VariantEngine::apply($state, $code, 0), $code);
			$this->assertNull(VariantEngine::preview($state, $code), $code);
		}
		$this->assertSame(
			[['key' => 'move', 'notes' => [], 'p' => 1, 'captures' => [], 'rolled' => false]],
			VariantEngine::preview($state, 'e2-e4'),
		);
		$this->expectException(\InvalidArgumentException::class);
		VariantEngine::apply($state, 'e2-e4', VariantEngine::T);
	}

	#[DataProvider('variants')]
	public function testTheEndRevealsEverything(string $variant): void {
		$game = RefereeParityTest::fixture($variant)['games'][0];
		$state = VariantEngine::newGame($variant);
		foreach ($game['steps'] as $step) {
			$state = VariantEngine::apply($state, $step['code'], $step['u']);
			$this->assertNotNull($state);
		}
		$this->assertNotNull($state['result']);
		$this->assertFalse(VariantEngine::isLegal($state, $game['steps'][0]['code']));
		$this->assertNull(VariantEngine::apply($state, $game['steps'][0]['code'], 0));
		$this->assertStringStartsWith('win:', VariantEngine::settlement($state)['result']);
		$view = VariantEngine::viewFor($state, 0);
		$this->assertNull($view['visible']);
		$this->assertNull($view['legal']);
		$this->assertEquals($state['worlds'], $view['worlds']);
		$this->assertEquals($state['history'], $view['history']);
	}

	#[DataProvider('variants')]
	public function testViewsHoldNoEnemyPieceThePlayerCannotSee(string $variant): void {
		foreach (RefereeParityTest::fixture($variant)['games'] as $game) {
			$state = VariantEngine::newGame($variant);
			foreach ($game['steps'] as $step) {
				$state = VariantEngine::apply($state, $step['code'], $step['u']);
				$this->assertNotNull($state);
				if ($state['result'] !== null) {
					break;
				}
				foreach ([0, 1] as $seat) {
					$view = VariantEngine::viewFor($state, $seat);
					$visible = array_flip($view['visible']);
					foreach ($view['worlds'] as $e) {
						$b = $e['b'];
						foreach ($b['sq'] as $id => $sq) {
							if ($b['sd'][$id] === $seat) {
								continue;
							}
							$this->assertTrue($variant === 'darkchess' ? $sq < 0 || isset($visible[$sq]) : $sq < 0);
							if ($sq < 0) {
								$this->assertSame('p', $b['ty'][$id]);
							}
						}
						foreach ($b['x']['castle'] as $right) {
							$this->assertSame($seat, $right['side']);
						}
					}
					$this->assertSame(VariantEngine::T, array_sum(array_column($view['worlds'], 'w')));
					foreach ($view['history'] as $h) {
						if ($h['side'] !== $seat) {
							$this->assertSame('', $h['code']);
							$this->assertArrayNotHasKey('from', $h);
						}
					}
				}
			}
		}
	}
}
