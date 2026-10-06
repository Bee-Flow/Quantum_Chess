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
		$this->assertTrue(VariantEngine::supports('beeflow'));
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

	public function testBeeFlowNeedsBothArrangementNumbers(): void {
		$this->assertSame(5040, VariantEngine::BEEFLOW_ARRANGEMENTS);
		foreach ([[], ['white' => 1], ['white' => 1, 'black' => 5040], ['white' => -1, 'black' => 0],
			['white' => '1', 'black' => 2], ['white' => 1.0, 'black' => 2]] as $options) {
			try {
				VariantEngine::newGame('beeflow', $options);
				$this->fail('accepted ' . json_encode($options));
			} catch (\InvalidArgumentException) {
				$this->addToAssertionCount(1);
			}
		}
		// the stored options are the two numbers, white first
		$state = VariantEngine::newGame('beeflow', ['black' => 5039, 'white' => 0, 'other' => true]);
		$json = json_encode($state, JSON_THROW_ON_ERROR);
		$this->assertStringContainsString('"options":{"white":0,"black":5039}', $json);
		$this->assertStringContainsString('"x":{"ep":-1,"epVictim":-1,"castle":[],"seen":[]}', $json);
		$b = $state['worlds'][0]['b'];
		// backRank(0) is bbknnqrr, backRank(5039) rrqnnkbb; Black's rank is not mirrored
		$this->assertSame('bbknnqrr', implode('', array_slice($b['ty'], 0, 8)));
		$this->assertSame('rrqnnkbb', implode('', array_slice($b['ty'], 16, 8)));
		$this->assertSame([56, 57, 58, 59, 60, 61, 62, 63], array_slice($b['sq'], 16, 8));
		$text = VariantEngine::encode($state);
		$this->assertSame($text, VariantEngine::encode(VariantEngine::decode($text)));
	}

	public function testBeeFlowViewsShowUnmovedEnemyPiecesAsPlaceholders(): void {
		$state = VariantEngine::newGame('beeflow', ['white' => 4398, 'black' => 4398]);
		$this->assertFalse(VariantEngine::isLegal($state, 'O-O'));
		foreach (['e2-e4', 'g8-f6', 'g1-f3'] as $code) {
			$state = VariantEngine::apply($state, $code, 0);
			$this->assertNotNull($state, $code);
		}
		$this->assertSame([6, 12, 22], $state['worlds'][0]['b']['x']['seen']);
		$view = VariantEngine::viewFor($state, 1);
		$this->assertSame('{}', json_encode($view['options']));
		$this->assertSame(range(0, 63), $view['visible']);
		$this->assertContains('f6-e4', $view['legal']);
		$ty = $view['worlds'][0]['b']['ty'];
		// White: the knight that moved (id 6) and the pawns are known, the other pieces are placeholders
		$this->assertSame(['x', 'x', 'x', 'x', 'x', 'x', 'n', 'x'], array_slice($ty, 0, 8));
		$this->assertSame(array_fill(0, 8, 'p'), array_slice($ty, 8, 8));
		// Black's own pieces keep their types
		$this->assertSame(str_split('rnbqkbnr'), array_slice($ty, 16, 8));
		$this->assertSame([], VariantEngine::viewFor($state, 0)['legal']);
		$this->assertSame([], VariantEngine::candidateMoves($state));
	}

	public function testBeeFlowPrivacyShield(): void {
		// 1. e4 d5 2. Ke2 a6 3. Ke3: the pawn on e4 stands next to its Queen Bee
		$state = VariantEngine::newGame('beeflow', ['white' => 4398, 'black' => 4398]);
		foreach (['e2-e4', 'd7-d5', 'e1-e2', 'a7-a6', 'e2-e3'] as $code) {
			$state = VariantEngine::apply($state, $code, 0);
			$this->assertNotNull($state, $code);
		}
		// d5 cannot take the pawn on e4 while the Queen Bee stands on e3, then d3; from c3 she no longer shields it
		$this->assertFalse(VariantEngine::isLegal($state, 'd5-e4'));
		$state = VariantEngine::apply($state, 'a6-a5', 0);
		$this->assertNotNull($state);
		$state = VariantEngine::apply($state, 'e3-d3', 0);
		$this->assertNotNull($state);
		$this->assertFalse(VariantEngine::isLegal($state, 'd5-e4'));
		$state = VariantEngine::apply($state, 'a5-a4', 0);
		$this->assertNotNull($state);
		$state = VariantEngine::apply($state, 'd3-c3', 0);
		$this->assertNotNull($state);
		$this->assertTrue(VariantEngine::isLegal($state, 'd5-e4'));
	}
}
