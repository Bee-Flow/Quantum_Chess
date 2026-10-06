<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Service\Game\VariantCatalog;
use OCA\QuantumChess\Service\Game\VariantChain;
use OCA\QuantumChess\Service\Game\VariantResult;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * What the server checks about variant games beyond the shared fixture: teams by seat, result codes it refuses, and
 * chain values it refuses.
 */
#[CoversClass(VariantCatalog::class)]
#[CoversClass(VariantChain::class)]
#[CoversClass(VariantResult::class)]
final class VariantRulesTest extends TestCase {
	public function testTeams(): void {
		$this->assertSame([0, 1, 0, 1], array_map(
			fn (int $seat) => VariantCatalog::teamOf('bughouse', [], $seat),
			[0, 1, 2, 3],
		));
		$this->assertNull(VariantCatalog::teamOf('fourplayer', ['mode' => 'ffa'], 2));
		$this->assertSame(1, VariantCatalog::teamOf('fourplayer', ['mode' => 'teams'], 3));
		$this->assertSame([false, 0], [VariantCatalog::exists('classic'), VariantCatalog::seatCount('classic')]);
	}

	public function testResultOfWinnersInAnyOrder(): void {
		$this->assertSame('win:1,3/resign', VariantResult::of([3, 1, 3], 'resign')->code());
		$this->assertTrue(VariantResult::of([], 'quiet')->isDraw());
		$this->assertSame('draw/quiet', VariantResult::of([], 'quiet')->code());
	}

	/** @return array<string, array{string, int}> */
	public static function badResultCodes(): array {
		return [
			'no reason' => ['win:0/', 2],
			'unknown seat' => ['win:2/king', 2],
			'seats out of order' => ['win:2,0/king', 4],
			'a seat twice' => ['win:0,0/king', 4],
			'not a result' => ['1-0', 2],
			'reason with a slash' => ['draw/a/b', 2],
		];
	}

	#[DataProvider('badResultCodes')]
	public function testRefusesMalformedResultCodes(string $code, int $seats): void {
		$this->expectException(\InvalidArgumentException::class);
		VariantResult::parse($code, $seats);
	}

	public function testChainRefusesValuesThatAreNotPlain(): void {
		$this->assertSame(
			'{"a":true,"n":518,"reach":"1","timelines":"3"}',
			VariantChain::canonicalOptions(['timelines' => '3', 'reach' => '1', 'n' => 518, 'a' => true]),
		);
		$this->assertSame('{}', VariantChain::canonicalOptions([]));
		foreach ([['x' => 1.5], ['x' => null], ['x' => [1]]] as $options) {
			try {
				VariantChain::canonicalOptions($options);
				$this->fail('accepted ' . json_encode($options));
			} catch (\InvalidArgumentException) {
				$this->addToAssertionCount(1);
			}
		}
		$this->expectException(\InvalidArgumentException::class);
		VariantChain::next('c', 0, -1, 'e2-e4', 0);
	}
}
