<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Engine\InvalidStateException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * ER §2.7: validateState rejects every broken invariant with the same code as the JS engine (the cases of
 * tests/js/engine/validate.spec.js), accepts JSON text and arrays, returns a canonical copy and never lets
 * anything but InvalidStateException escape.
 */
final class ValidateStateTest extends TestCase {
	private const T = Engine::T;

	private static function engine(): Engine {
		return new Engine();
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function base(): array {
		return self::engine()->setupPosition(['fen' => '4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1']);
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function ghosty(): array {
		$e = self::engine();
		$s = $e->applyMove(self::base(), 'b6-a4|c4')['state'];
		return $e->applyMove($s, 'a1-a8')['state'];
	}

	/**
	 * Re-hash after a mutation so that only the mutated invariant fails.
	 *
	 * @param array<string, mixed> $s
	 * @return array<string, mixed>
	 */
	private static function rehash(array $s): array {
		try {
			$h = self::engine()->positionHash($s);
			$history = is_array($s['history'] ?? null) ? $s['history'] : [];
			array_pop($history);
			$history[] = $h;
			$s['history'] = $history;
		} catch (\Throwable) {
			// the mutation broke the hash input itself
		}
		return $s;
	}

	private static function code(mixed $x): string {
		try {
			self::engine()->validateState($x);
			return 'ok';
		} catch (InvalidStateException $e) {
			return $e->getInvariant();
		}
	}

	/**
	 * Build a valid state from piece maps (like craft() of the JS tests).
	 *
	 * @param list<array{0: array<string, string>, 1: int}> $worlds
	 * @param array<string, mixed> $opts
	 * @return array<string, mixed>
	 */
	private static function craft(array $worlds, array $opts = []): array {
		$e = self::engine();
		$boards = [];
		foreach ($worlds as [$pieces, $w]) {
			$b = str_repeat('.', 64);
			foreach ($pieces as $sq => $letter) {
				$b[$e->squareIndex($sq)] = $letter;
			}
			$boards[] = [$b, $w];
		}
		usort($boards, static fn (array $x, array $y): int => strcmp($x[0], $y[0]));
		$live = [];
		foreach (str_split($boards[0][0]) as $ch) {
			if ($ch !== '.') {
				$live[ctype_upper($ch) ? ord($ch) - 65 : ord($ch) - 97 + 16] = true;
			}
		}
		$captured = [];
		for ($id = 0; $id < 32; $id++) {
			if (!isset($live[$id])) {
				$captured[] = $id;
			}
		}
		$state = [
			'v' => 1, 'types' => $opts['types'] ?? 'kqrrbbnnppppppppkqrrbbnnpppppppp', 'worlds' => $boards,
			'turn' => $opts['turn'] ?? 'w', 'castling' => $opts['castling'] ?? '-', 'ep' => $opts['ep'] ?? '-',
			'halfmove' => $opts['halfmove'] ?? 0, 'fullmove' => $opts['fullmove'] ?? 1, 'ply' => $opts['ply'] ?? 0,
			'captured' => $captured, 'history' => [], 'result' => null,
		];
		$state['history'] = [$e->positionHash($state)];
		return $e->validateState($state);
	}

	public function testValidStatesAreAcceptedAndCopiedCanonically(): void {
		$e = self::engine();
		foreach ([$e->initialState(), self::base(), self::ghosty()] as $s) {
			$json = $e->serializeState($s);
			$this->assertSame($json, $e->serializeState($e->validateState($s)));
			$this->assertSame($json, $e->serializeState($e->validateState($json)));
			$this->assertSame($json, $e->serializeState($e->parseState($json)));
			$this->assertSame($json, json_encode($e->validateState($json), JSON_UNESCAPED_SLASHES), 'the copy is canonical as it is');
		}
		$reversed = array_reverse($e->initialState(), true);
		$this->assertSame(Engine::START_JSON, $e->serializeState($e->validateState($reversed)), 'keys in another order are canonicalised');
		$this->assertSame(Engine::START_JSON, json_encode($e->validateState($reversed), JSON_UNESCAPED_SLASHES));
	}

	public function testIntegralFloatsAreAcceptedLikeJavaScriptNumbers(): void {
		$e = self::engine();
		$json = str_replace(['"v":1', '"fullmove":1'], ['"v":1.0', '"fullmove":1.0'], Engine::START_JSON);
		$this->assertSame(Engine::START_JSON, $e->serializeState($e->validateState($json)));
	}

	/**
	 * @return iterable<string, array{0: mixed, 1: string}>
	 */
	public static function notAnObject(): iterable {
		yield 'null' => [null, 'shape'];
		yield 'number' => [42, 'shape'];
		yield 'list' => [[1, 2], 'shape'];
		yield 'empty' => [[], 'shape'];
		yield 'broken JSON' => ['{', 'shape'];
		yield 'JSON string' => ['"x"', 'shape'];
		yield 'huge text' => [str_repeat('x', 1000001), 'shape'];
		yield 'object' => [new \stdClass(), 'shape'];
	}

	#[DataProvider('notAnObject')]
	public function testNotAnObject(mixed $x, string $expect): void {
		$this->assertSame($expect, self::code($x));
	}

	/**
	 * @return iterable<string, array{0: callable(array<string, mixed>): array<string, mixed>, 1: string, 2?: bool}>
	 */
	public static function mutations(): iterable {
		$T = self::T;
		yield 'missing key' => [static function (array $s): array {
			unset($s['ep']);
			return $s;
		}, 'shape'];
		yield 'extra key' => [static fn (array $s): array => $s + ['extra' => 1], 'shape'];
		yield 'I12 v = 2' => [static fn (array $s): array => ['v' => 2] + $s, 'I12'];
		yield 'I12 v = "1"' => [static fn (array $s): array => ['v' => '1'] + $s, 'I12'];
		yield 'I8 short types' => [static fn (array $s): array => ['types' => substr($s['types'], 1)] + $s, 'I8'];
		yield 'I8 bad type letter' => [static fn (array $s): array => ['types' => 'x' . substr($s['types'], 1)] + $s, 'I8'];
		yield 'I8 queen id changes type' => [static fn (array $s): array => ['types' => 'kr' . substr($s['types'], 2)] + $s, 'I8'];
		yield 'I8 pawn id becomes a king' => [static fn (array $s): array => ['types' => substr($s['types'], 0, 8) . 'k' . substr($s['types'], 9)] + $s, 'I8'];
		yield 'turn' => [static fn (array $s): array => ['turn' => 'x'] + $s, 'shape'];
		yield 'castling order' => [static fn (array $s): array => ['castling' => 'QK'] + $s, 'shape'];
		yield 'castling empty' => [static fn (array $s): array => ['castling' => ''] + $s, 'shape'];
		yield 'castling with a newline' => [static fn (array $s): array => ['castling' => "K\n"] + $s, 'shape'];
		yield 'ep name' => [static fn (array $s): array => ['ep' => 'e9'] + $s, 'shape'];
		yield 'ep with a newline' => [static fn (array $s): array => ['ep' => "e3\n"] + $s, 'shape'];
		yield 'I11 ply too high' => [static fn (array $s): array => ['ply' => 1201] + $s, 'I11'];
		yield 'I11 ply float' => [static fn (array $s): array => ['ply' => 1.5] + $s, 'I11'];
		yield 'I11 halfmove above 99 + ply' => [static fn (array $s): array => ['halfmove' => 100] + $s, 'I11'];
		yield 'I11 negative halfmove' => [static fn (array $s): array => ['halfmove' => -1] + $s, 'I11'];
		yield 'I11 fullmove 0' => [static fn (array $s): array => ['fullmove' => 0] + $s, 'I11'];
		yield 'I11 empty history' => [static fn (array $s): array => ['history' => []] + $s, 'I11', true];
		yield 'I11 bad history entry' => [static fn (array $s): array => ['history' => ['XYZ']] + $s, 'I11', true];
		yield 'I11 wrong last hash' => [static fn (array $s): array => ['history' => ['0123456789abcdef']] + $s, 'I11', true];
		yield 'I11 history longer than halfmove + 1' => [static fn (array $s): array => ['history' => ['0123456789abcdef', $s['history'][0]]] + $s, 'I11'];
		yield 'I11 result shape' => [static fn (array $s): array => ['result' => ['result' => '1-0']] + $s, 'I11'];
		yield 'I11 result key order' => [static fn (array $s): array => ['result' => ['reason' => 'king_trapped', 'result' => '1-0']] + $s, 'I11'];
		yield 'I11 result value' => [static fn (array $s): array => ['result' => ['result' => '2-0', 'reason' => 'king_trapped']] + $s, 'I11'];
		yield 'I11 result reason' => [static fn (array $s): array => ['result' => ['result' => '1-0', 'reason' => 'resigned']] + $s, 'I11'];
		yield 'I11 result mismatch' => [static fn (array $s): array => ['result' => ['result' => '1/2-1/2', 'reason' => 'king_trapped']] + $s, 'I11'];
		yield 'I4 king_captured with both kings' => [static fn (array $s): array => ['result' => ['result' => '1-0', 'reason' => 'king_captured']] + $s, 'I4'];
		yield 'I7 no worlds' => [static fn (array $s): array => ['worlds' => []] + $s, 'I7'];
		yield 'I7 too many worlds' => [static fn (array $s): array => ['worlds' => array_fill(0, 65, $s['worlds'][0])] + $s, 'I7'];
		yield 'world shape' => [static fn (array $s): array => ['worlds' => [[$s['worlds'][0][0]]]] + $s, 'shape'];
		yield 'board length' => [static fn (array $s): array => ['worlds' => [[substr($s['worlds'][0][0], 1), $T]]] + $s, 'shape'];
		yield 'board character' => [static fn (array $s): array => ['worlds' => [['Z' . substr($s['worlds'][0][0], 1), $T]]] + $s, 'shape'];
		yield 'I5 weight 0' => [static fn (array $s): array => ['worlds' => [[$s['worlds'][0][0], 0]]] + $s, 'I5'];
		yield 'I5 weight float' => [static fn (array $s): array => ['worlds' => [[$s['worlds'][0][0], $T - 0.5]]] + $s, 'I5'];
		yield 'I5 weight string' => [static fn (array $s): array => ['worlds' => [[$s['worlds'][0][0], (string)$T]]] + $s, 'I5'];
		yield 'I5 weight too large' => [static fn (array $s): array => ['worlds' => [[$s['worlds'][0][0], $T + 1]]] + $s, 'I5'];
		yield 'I5 sum' => [static fn (array $s): array => ['worlds' => [[$s['worlds'][0][0], $T - 1]]] + $s, 'I5'];
		yield 'I2 captured duplicate' => [static fn (array $s): array => ['captured' => [...$s['captured'], $s['captured'][0]]] + $s, 'I2'];
		yield 'I2 captured out of range' => [static fn (array $s): array => ['captured' => [...array_slice($s['captured'], 1), 32]] + $s, 'I2'];
		yield 'I2 captured live piece' => [static fn (array $s): array => ['captured' => [...$s['captured'], 2]] + $s, 'I2'];
		yield 'I2 live piece missing' => [static fn (array $s): array => ['captured' => array_slice($s['captured'], 1)] + $s, 'I2'];
		yield 'I2 piece twice' => [static function (array $s): array {
			$b = $s['worlds'][0][0];
			$b[7] = 'C';
			$s['worlds'] = [[$b, $s['worlds'][0][1]]];
			return $s;
		}, 'I2'];
		yield 'I3 pawn on rank 1' => [static function (array $s): array {
			$b = $s['worlds'][0][0];
			$b[7] = 'I';
			$s['worlds'] = [[$b, $s['worlds'][0][1]]];
			$s['captured'] = array_values(array_filter($s['captured'], static fn (int $x): bool => $x !== 8));
			return $s;
		}, 'I3'];
		yield 'I9 castling without king and rook' => [static fn (array $s): array => ['castling' => 'K'] + $s, 'I9'];
		yield 'I10 ep without a pawn' => [static fn (array $s): array => ['ep' => 'e3'] + $s, 'I10'];
		yield 'I10 ep wrong rank' => [static fn (array $s): array => ['ep' => 'e6'] + $s, 'I10'];
	}

	/**
	 * @param callable(array<string, mixed>): array<string, mixed> $mutate
	 */
	#[DataProvider('mutations')]
	public function testBrokenInvariant(callable $mutate, string $expect, bool $keepHistory = false): void {
		$s = $mutate(self::base());
		if (!$keepHistory) {
			$s = self::rehash($s);
		}
		$this->assertSame($expect, self::code($s));
		// The same through JSON text, when it can be encoded.
		$json = json_encode($s, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
		if ($json !== false) {
			$this->assertSame($expect, self::code($json));
		}
	}

	public function testI1TwoPiecesShareASquareAcrossWorlds(): void {
		$s = self::ghosty();
		$s['worlds'] = [
			['....A.....................g.............................C...a...', 8388608],
			['C...A...................................................g...a...', 8388608],
		];
		$this->assertSame('I1', self::code(self::rehash($s)));
	}

	public function testI3AndI4PawnsAndKingsAreClassical(): void {
		foreach ([
			[[[['e1' => 'A', 'e8' => 'a', 'a2' => 'I'], self::T / 2], [['e1' => 'A', 'e8' => 'a', 'a3' => 'I'], self::T / 2]], 'I3'],
			[[[['e1' => 'A', 'e8' => 'a'], self::T / 2], [['e2' => 'A', 'e8' => 'a'], self::T / 2]], 'I4'],
		] as [$worlds, $expect]) {
			try {
				self::craft($worlds);
				$this->fail('accepted');
			} catch (InvalidStateException $e) {
				$this->assertSame($expect, $e->getInvariant());
			}
		}
	}

	public function testI6UnsortedAndDuplicateBoards(): void {
		$s = self::ghosty();
		$s['worlds'] = array_reverse($s['worlds']);
		$this->assertSame('I6', self::code(self::rehash($s)));
		$d = self::ghosty();
		$d['worlds'][1][0] = $d['worlds'][0][0];
		$this->assertSame('I6', self::code(self::rehash($d)));
	}

	public function testI7BudgetAboveEight(): void {
		$worlds = [];
		foreach (['a', 'b', 'c'] as $f1) {
			foreach (['a', 'b', 'c'] as $f2) {
				$worlds[] = [['e1' => 'A', 'e8' => 'a', $f1 . '3' => 'G', $f2 . '6' => 'H'], 1];
			}
		}
		$worlds[0][1] = self::T - 8;
		$this->expectExceptionObject(new InvalidStateException('I7', 'budget exceeds 8'));
		self::craft($worlds);
	}

	public function testI10EnPassantDetailsWithoutWrapAround(): void {
		$e = self::engine();
		$this->assertSame('e3', $e->setupPosition(['fen' => '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1'])['ep']);
		foreach (['4k3/8/8/8/p6P/8/8/4K3 b - - 0 1' => 'h3', '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1' => 'e3', '4k3/8/8/8/3pP3/4N3/8/4K3 b - - 0 1' => 'e3'] as $fen => $ep) {
			$s = $e->setupPosition(['fen' => $fen]);
			$s['ep'] = $ep;
			$this->assertSame('I10', self::code(self::rehash($s)), $fen);
		}
	}

	public function testRulesOfTheIntegrationNotes(): void {
		// engine-js decision 7: k on a pawn id (I8), result/reason mismatch (I11), king_captured with the winner's
		// king captured (I4).
		$s = self::base();
		$s['types'][9] = 'k';
		$this->assertSame('I8', self::code(self::rehash($s)));
		$s = self::base();
		$s['result'] = ['result' => '1/2-1/2', 'reason' => 'king_captured'];
		$this->assertSame('I11', self::code($s));
		$e = self::engine();
		$w = $e->setupPosition(['fen' => '8/8/8/8/8/8/3k4/4K3 b - - 0 1']);
		$won = $e->applyMove($w, 'd2-e1')['state'];
		$this->assertSame(['result' => '0-1', 'reason' => 'king_captured'], $won['result']);
		$this->assertSame('ok', self::code($won));
		$won['result'] = ['result' => '1-0', 'reason' => 'king_captured'];
		$this->assertSame('I4', self::code($won));
	}

	public function testAGameWonByCapturingTheKingAfterBareKingsIsValid(): void {
		// W16: the last defender is taken with the kings adjacent (E2 yields, D18), then the king is captured: 30
		// pieces plus a king are captured. (The JS engine caps captured at 30 here; reported to engine-js.)
		$e = self::engine();
		$s = $e->setupPosition(['fen' => '8/8/4k3/3n4/4K3/8/8/8 w - - 0 1']);
		$s = $e->applyMove($s, 'e4-d5')['state'];
		$s = $e->applyMove($s, 'e6-d5')['state'];
		$this->assertCount(31, $s['captured']);
		$this->assertSame(['result' => '0-1', 'reason' => 'king_captured'], $s['result']);
		$this->assertSame($e->serializeState($s), $e->serializeState($e->validateState($e->serializeState($s))));
		// 31 ids without a king capture: a king is in captured while the game runs (I4).
		$s['result'] = null;
		$this->assertSame('I4', self::code(self::rehash($s)));
		$this->assertSame('I2', self::code(['captured' => range(0, 31)] + $s), 'more than 31 ids');
	}

	public function testRandomMutationsNeverThrowAnythingElse(): void {
		$e = self::engine();
		$pool = [$e->initialState(), self::base(), self::ghosty(), $e->setupPosition(['fen' => '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'prelude' => ['d1-d4|h5', 'd8-a5|d5']])];
		$values = [null, 0, -1, 1, 1.5, self::T, self::T + 1, '', 'w', '-', 'e3', 'K', [], [[]], ['result' => '1-0'], true, str_repeat('x', 64), NAN, INF];
		$x = 2024;
		$rand = static function (int $n) use (&$x): int {
			$x = ($x * 1103515245 + 12345) & 0x7fffffff;
			return intdiv($x, 7) % $n;
		};
		$accepted = 0;
		for ($i = 0; $i < 3000; $i++) {
			$s = $pool[$i % count($pool)];
			$keys = array_keys($s);
			switch ($rand(5)) {
				case 0:
					$s[$keys[$rand(count($keys))]] = $values[$rand(count($values))];
					break;
				case 1:
					$wi = $rand(count($s['worlds']));
					$s['worlds'][$wi][0][$rand(64)] = '.ABCDEFGHIJKLMNOPabcdefghijklmnop0'[$rand(34)];
					break;
				case 2:
					$wi = $rand(count($s['worlds']));
					$s['worlds'][$wi][1] += $rand(5) - 2;
					break;
				case 3:
					$s['captured'][] = $rand(34) - 1;
					break;
				default:
					$s['types'][8] = 'kqrbnpx'[$rand(7)];
			}
			if ($rand(2) === 0) {
				$s = self::rehash($s);
			}
			try {
				$valid = $e->validateState($s);
				$accepted++;
				$this->assertSame($e->serializeState($valid), $e->serializeState($e->validateState($valid)));
				$this->assertIsArray($e->generateMoves($valid));
			} catch (InvalidStateException $ex) {
				$this->assertContains($ex->getInvariant(), ['shape', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10', 'I11', 'I12']);
			}
		}
		$this->assertGreaterThan(0, $accepted);
	}

	public function testFunctionsRejectShapelessStates(): void {
		$e = self::engine();
		$this->expectException(InvalidStateException::class);
		$e->generateMoves(['v' => 1, 'worlds' => 'nope']);
	}
}
