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
use PHPUnit\Framework\TestCase;

/**
 * The server's half of online variant play agrees with the browser's: the catalogue, the result codes and the
 * variant chain against tests/fixtures/online-variants.json, which src/variants/online.js and src/online/vchain.js
 * wrote and check too.
 */
#[CoversClass(VariantCatalog::class)]
#[CoversClass(VariantChain::class)]
#[CoversClass(VariantResult::class)]
final class OnlineVariantFixtureTest extends TestCase {
	private const FIXTURE = __DIR__ . '/../../../../fixtures/online-variants.json';

	/** @return array<string, mixed> */
	private static function fixture(): array {
		$json = file_get_contents(self::FIXTURE);
		self::assertIsString($json);
		$data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
		self::assertIsArray($data);
		return $data;
	}

	public function testCatalogue(): void {
		$fixture = self::fixture();
		$this->assertSame($fixture['rulesVersion'], VariantCatalog::RULES_VERSION);
		$this->assertSame(array_column($fixture['catalog'], 'id'), VariantCatalog::ids());
		foreach ($fixture['catalog'] as $entry) {
			$id = $entry['id'];
			$this->assertSame($entry['seats'], VariantCatalog::seatCount($id), $id);
			$this->assertSame($entry['online'], VariantCatalog::isOnline($id), $id);
			$this->assertSame($entry['teams'], VariantCatalog::teams($id), $id);
			if (isset($entry['teamOptions'])) {
				$this->assertSame($entry['teamsWithOptions'], VariantCatalog::teams($id, $entry['teamOptions']), $id);
			}
		}
	}

	public function testResultCodes(): void {
		foreach (self::fixture()['results'] as $case) {
			$parsed = VariantResult::parse($case['code'], 4);
			if ($case['result'] === null) {
				$this->assertNull($parsed);
				continue;
			}
			$this->assertNotNull($parsed);
			$winner = $case['result']['winner'];
			$winners = $case['result']['winners'] ?? ($winner === null ? [] : [$winner]);
			sort($winners);
			$this->assertSame($winners, $parsed->winners, $case['code']);
			$this->assertSame($case['result']['reason'], $parsed->reason);
			$this->assertSame($case['code'], $parsed->code());
		}
	}

	public function testRecordedGamesSettleWithValidResultCodes(): void {
		foreach (self::fixture()['replays'] as $game) {
			$seats = VariantCatalog::seatCount($game['variant']);
			foreach ($game['moves'] as $move) {
				$this->assertLessThan($seats, $move['nextSeat']);
				$result = VariantResult::parse($move['result'], $seats);
				$this->assertSame($move['result'], $result?->code() ?? '');
				$this->assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $move['stateHash']);
			}
		}
	}

	public function testChains(): void {
		foreach (self::fixture()['chains'] as $case) {
			$chain = VariantChain::start(
				$case['gameId'], $case['variant'], $case['options'], $case['seats'], $case['createdAt'],
			);
			$this->assertSame($case['start'], $chain, $case['variant']);
			foreach ($case['moves'] as $move) {
				$chain = VariantChain::next($chain, $move['ply'], $move['seat'], $move['code'], $move['u']);
				$this->assertSame($move['chain'], $chain, $case['variant'] . ' ply ' . $move['ply']);
			}
		}
	}
}
