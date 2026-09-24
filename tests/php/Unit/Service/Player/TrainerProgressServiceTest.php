<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Player;

use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Player\TrainerProgressService;
use OCA\QuantumChess\Service\Player\UserDocumentStore;
use OCP\Config\IUserConfig;
use OCP\IL10N;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The trainer progress: the merge rules and the size limit.
 */
#[CoversClass(TrainerProgressService::class)]
final class TrainerProgressServiceTest extends TestCase {
	private function config(): IUserConfig {
		$store = new \ArrayObject();
		$config = $this->createMock(IUserConfig::class);
		$config->method('getValueString')->willReturnCallback(fn (string $u, string $a, string $k, string $d = '') => $store[$k] ?? $d);
		$config->method('setValueString')->willReturnCallback(function (string $u, string $a, string $k, string $v) use ($store) {
			$store[$k] = $v;
			return true;
		});
		return $config;
	}

	private function l(): IL10N {
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnArgument(0);
		return $l;
	}

	/** @return list<array<string, mixed>> */
	private function docs(): array {
		return [
			['v' => 1, 'lessons' => ['L01' => ['done' => true, 'stars' => 2, 'at' => 200]], 'puzzles' => ['P01' => ['solved' => false, 'tries' => 3, 'hints' => 1, 'stars' => 0, 'at' => null]],
				'achievements' => ['first-steps' => 500], 'counters' => ['splits' => 4, 'games' => ['won' => 1]], 'xp' => 50, 'streak' => ['last' => '2026-09-20', 'days' => 2, 'best' => 4]],
			['v' => 1, 'lessons' => ['L01' => ['done' => false, 'stars' => 3, 'at' => 100], 'L02' => ['done' => true, 'stars' => 1, 'at' => 300]], 'puzzles' => ['P01' => ['solved' => true, 'tries' => 1, 'hints' => 2, 'stars' => 2, 'at' => 700]],
				'achievements' => ['first-steps' => 400, 'healer' => 800], 'counters' => ['splits' => 2, 'games' => ['won' => 3]], 'xp' => 40, 'streak' => ['last' => '2026-09-22', 'days' => 1, 'best' => 1]],
			['v' => 1, 'extra' => 'kept', 'xp' => 70],
		];
	}

	public function testMergeRules(): void {
		[$a, $b] = $this->docs();
		$m = TrainerProgressService::mergeDocs($a, $b);
		$this->assertSame(['at' => 100, 'done' => true, 'stars' => 3], (function (array $x) {
			ksort($x);
			return $x;
		})($m['lessons']['L01']));
		$this->assertSame([true, 3, 2, 2, 700], [$m['puzzles']['P01']['solved'], $m['puzzles']['P01']['tries'], $m['puzzles']['P01']['hints'], $m['puzzles']['P01']['stars'], $m['puzzles']['P01']['at']]);
		$this->assertSame(['first-steps' => 400, 'healer' => 800], $m['achievements']);
		$this->assertSame(['games' => ['won' => 3], 'splits' => 4], $m['counters']);
		$this->assertSame(50, $m['xp']);
		$this->assertSame(['last' => '2026-09-22', 'days' => 1, 'best' => 4], $m['streak']);
	}

	public function testMergeIsCommutativeAndIdempotent(): void {
		$docs = $this->docs();
		$canon = function (array $doc): string {
			$sort = function (mixed $v) use (&$sort): mixed {
				if (!is_array($v)) {
					return $v;
				}
				ksort($v);
				return array_map($sort, $v);
			};
			return (string)json_encode($sort($doc));
		};
		foreach ($docs as $a) {
			$this->assertSame($canon(TrainerProgressService::mergeDocs($a, $a)), $canon(TrainerProgressService::mergeDocs($a, [])), 'idempotent');
			foreach ($docs as $b) {
				$ab = TrainerProgressService::mergeDocs($a, $b);
				$this->assertSame($canon($ab), $canon(TrainerProgressService::mergeDocs($ab, $b)), 'merging again changes nothing');
				// Commutative on every field with a merge rule (unknown keys: the incoming value wins by design).
				$ba = TrainerProgressService::mergeDocs($b, $a);
				foreach (['lessons', 'puzzles', 'achievements', 'counters', 'xp'] as $key) {
					$this->assertSame($canon([$ab[$key] ?? null]), $canon([$ba[$key] ?? null]), "commutative: $key");
				}
			}
		}
	}

	public function testProgressLimit(): void {
		$service = new TrainerProgressService(new UserDocumentStore($this->config()), $this->l());
		$this->assertSame(['v' => 1, 'xp' => 5], $service->merge('bob', ['xp' => 5, 'v' => 1]));
		$this->expectException(ApiException::class);
		$service->merge('bob', ['blob' => str_repeat('x', TrainerProgressService::MAX_BYTES)]);
	}
}
