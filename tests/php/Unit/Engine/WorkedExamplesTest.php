<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;
use PHPUnit\Framework\TestCase;

/**
 * The worked examples W1–W17 of docs/engine-rules.md §10 with the numbers the document states (typed in,
 * independent of the generated fixtures).
 */
final class WorkedExamplesTest extends TestCase {
	private const T = Engine::T;

	private Engine $e;

	protected function setUp(): void {
		$this->e = new Engine();
	}

	/**
	 * @param list<string> $prelude
	 * @return array<string, mixed>
	 */
	private function pos(string $fen, array $prelude = []): array {
		return $this->e->setupPosition(['fen' => $fen, 'prelude' => $prelude]);
	}

	/**
	 * @param array<string, mixed> $state
	 * @return array<string, mixed>
	 */
	private function play(array $state, string $code, ?int $u = null, ?string $outcome = null): array {
		return $this->e->applyMove($state, $code, $u, $outcome)['state'];
	}

	/**
	 * @param array<string, mixed> $state
	 */
	private static function lastHash(array $state): string {
		return $state['history'][count($state['history']) - 1];
	}

	/**
	 * Locations of a piece as [square name => weight].
	 *
	 * @param array<string, mixed> $state
	 * @return array<string, int>
	 */
	private function loc(array $state, int $id): array {
		$out = [];
		foreach ($this->e->pieceLocations($state)[$id] as $l) {
			$out[$this->e->squareName($l['square'])] = $l['weight'];
		}
		return $out;
	}

	public function testW1SplitAndMergeBack(): void {
		$s = $this->e->initialState();
		$m = $this->e->findMove($s, 'g1-f3|h3');
		$this->assertSame('quantum', $m['resolution'] ?? null);
		$s1 = $this->play($s, 'g1-f3|h3');
		$this->assertSame('{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["CGEBAF.DIJKLMNOP.......H........................ijklmnopcgebafhd",8388608],["CGEBAF.DIJKLMNOP.....H..........................ijklmnopcgebafhd",8388608]],"turn":"b","castling":"KQkq","ep":"-","halfmove":1,"fullmove":1,"ply":1,"captured":[],"history":["80c209d9560802c2","483a99c829aee5ce"],"result":null}', $this->e->serializeState($s1));
		$this->assertSame([2, 1], [$this->e->budget($s1, 'w'), $this->e->budget($s1, 'b')]);
		$s2 = $this->play($s1, 'e7-e5');
		$this->assertSame(['62e1e066b0926df1'], $s2['history']);
		$this->assertSame('-', $s2['ep']);
		$this->assertSame('certain', $this->e->findMove($s2, 'f3|h3-g1')['resolution'] ?? null);
		$s3 = $this->play($s2, 'f3|h3-g1');
		$this->assertSame('49192f86bee5e059', self::lastHash($s3));
		$this->assertSame('KQkq', $s3['castling']);
		$this->assertCount(1, $s3['worlds']);
	}

	public function testW2SolidPieceAttacksAGhost(): void {
		$w2 = $this->pos('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']);
		$m = $this->e->findMove($w2, 'c1-h6');
		$this->assertSame(
			[['key' => 'move', 'weight' => 8388608], ['key' => 'capture', 'weight' => 8388608]],
			$m['outcomes'] ?? null,
		);
		$this->assertSame('rolled', $m['resolution'] ?? null);
		$move = $this->e->applyMove($w2, 'c1-h6', 5033164);
		$this->assertSame(
			[['....A........................................h.E............a...', self::T]],
			$move['state']['worlds'],
		);
		$this->assertSame('move', $move['measurement']['key'] ?? null);
		$cap = $this->e->applyMove($w2, 'c1-h6', 8388608);
		$this->assertSame(
			[['....A..........................................E............a...', self::T]],
			$cap['state']['worlds'],
		);
		$this->assertSame('{"key":"capture","u":8388608,"captured":23,"outcomes":[{"key":"move","weight":8388608},{"key":"capture","weight":8388608}],"fallback":false}', json_encode($cap['measurement']));
		$this->assertSame('Bc1xh6 {capture 50%}', $this->e->moveNotation($w2, 'c1-h6', $cap['measurement']));
		$this->assertSame(0, $cap['state']['halfmove']);
		// With the knight split g4-e3|h6 instead, the e3 part blocks the lane.
		$alt = $this->pos('4k3/8/8/8/6n1/8/8/2B1K3 w - - 0 1', ['g4-e3|h6']);
		$this->assertSame(
			[['key' => 'miss', 'weight' => 8388608], ['key' => 'capture', 'weight' => 8388608]],
			$this->e->findMove($alt, 'c1-h6')['outcomes'] ?? null,
		);
	}

	public function testW3GhostAttacksGhost(): void {
		$s = $this->pos('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']);
		$this->assertCount(4, $s['worlds']);
		$this->assertSame([
			['key' => 'miss', 'weight' => 8388608],
			['key' => 'move', 'weight' => 4194304],
			['key' => 'capture', 'weight' => 4194304],
		], $this->e->findMove($s, 'f3-e5')['outcomes'] ?? null);
		$miss = $this->play($s, 'f3-e5', 0);
		$this->assertSame(['h3' => self::T], $this->loc($miss, 7));
		$this->assertSame(['e5' => 8388608, 'c7' => 8388608], $this->loc($miss, 20));
		$this->assertSame(['c7' => self::T], $this->loc($this->play($s, 'f3-e5', 8388608), 20));
		$cap = $this->play($s, 'f3-e5', 12582912);
		$this->assertContains(20, $cap['captured']);
	}

	public function testW4BlockedSlideLinkThenMeasure(): void {
		$s = $this->play($this->pos('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4');
		$this->assertSame('quantum', $this->e->findMove($s, 'a1-a8')['resolution'] ?? null);
		$s = $this->play($s, 'a1-a8');
		// The b6 knight gets id 22 (pass 2 of the FEN id assignment: the lowest free knight id).
		$this->assertSame([2, 22], $this->e->links($s)[0] ?? null);
		$this->assertSame([[2, 22]], $this->e->linkGroups($s));
		$cvA4 = $this->e->conditionalView($s, 24);
		$this->assertSame(
			['piece' => 2, 'weight' => 8388608, 'probability' => 1.0],
			$cvA4[0] ?? null,
			'the rook 100% on a1',
		);
		$cvA8 = $this->e->conditionalView($s, 56);
		$this->assertSame(
			['piece' => 22, 'weight' => 8388608, 'probability' => 1.0],
			$cvA8[26] ?? null,
			'the knight 100% on c4',
		);
		$this->assertNull($this->e->conditionalView($s, 35), 'd5 is certainly empty');
		$this->assertSame('?a4', $this->e->findMove($s, '?c4')['code'] ?? null, 'a Measure may name any square');
		$this->assertSame(
			[['key' => 'a4', 'weight' => 8388608], ['key' => 'c4', 'weight' => 8388608]],
			$this->e->findMove($s, '?a4')['outcomes'] ?? null,
		);
		$a4 = $this->play($s, '?a4', 3);
		$this->assertSame(['a1' => self::T], $this->loc($a4, 2), 'the rook collapses with the knight');
		$c4 = $this->play($s, '?a4', 9000000);
		$this->assertSame(['a8' => self::T], $this->loc($c4, 2));
		$this->assertSame($s['halfmove'] + 1, $c4['halfmove']);
	}

	public function testW5SplitWithOneLaneBlockedInSomeWorlds(): void {
		$s = $this->play($this->pos('4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1'), 'g3-f1|h5');
		$this->assertSame(
			'd1-h1|d5',
			$this->e->findMove($s, 'd1-d5|h1')['code'] ?? null,
			'index order h1 = 7 < d5 = 35',
		);
		$s = $this->play($s, 'd1-h1|d5');
		$this->assertSame([
			['.A.................................C...g....................a...', 4194304],
			['.A.....C...............................g....................a...', 4194304],
			['.A...g.............................C........................a...', 4194304],
			['.A.C.g......................................................a...', 4194304],
		], $s['worlds']);
		$this->assertSame(['d1' => 4194304, 'h1' => 4194304, 'd5' => 8388608], $this->loc($s, 2));
		$this->assertSame([3, 2], [$this->e->budget($s, 'w'), $this->e->budget($s, 'b')]);
		$this->assertSame([[2, 22]], $this->e->links($s));
	}

	public function testW6ConvergingCaptureAndCertainDanger(): void {
		$w6 = $this->pos('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5']);
		$this->assertSame(self::T, $this->e->kingDanger($w6, 'b'));
		$merge = $this->e->findMove($w6, 'd4|h5-h8');
		$this->assertSame('certain', $merge['resolution'] ?? null);
		$this->assertSame([['key' => 'capture', 'weight' => self::T]], $merge['outcomes'] ?? null);
		$r = $this->e->applyMove($w6, 'd4|h5-h8', null, 'miss');
		$this->assertNull($r['measurement'], 'a certain move ignores a forced outcome');
		$this->assertSame(
			[['....A..........................................................B', self::T]],
			$r['state']['worlds'],
		);
		$this->assertSame(['result' => '1-0', 'reason' => 'king_captured'], $r['state']['result']);
		$this->assertSame('Qd4|h5xh8 #', $this->e->moveNotation($w6, 'd4|h5-h8'));
		$this->assertSame(
			[['key' => 'miss', 'weight' => 8388608], ['key' => 'capture', 'weight' => 8388608]],
			$this->e->findMove($w6, 'h5-h8')['outcomes'] ?? null,
		);
		$miss = $this->play($w6, 'h5-h8', 100);
		$this->assertSame(['d4' => self::T], $this->loc($miss, 1));
	}

	public function testW7LargestRemainderRescale(): void {
		$s = $this->pos('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1', ['g8-f6|h6', 'e1-e2', 'f6-d5|e4']);
		$s['turn'] = 'w';
		$s['history'] = [$this->e->positionHash($s)];
		$s = $this->e->validateState($s);
		$this->assertSame(
			[['key' => 'miss', 'weight' => 12582912], ['key' => 'capture', 'weight' => 4194304]],
			$this->e->findMove($s, 'd3-e4')['outcomes'] ?? null,
		);
		$miss = $this->play($s, 'd3-e4', 3000000);
		$this->assertSame(['d5' => 5592405, 'h6' => 11184811], $this->loc($miss, 23));
		// The d3 pawn is not on a start square: it gets the lowest free pawn id, 8.
		$this->assertSame(['d3' => self::T], $this->loc($miss, 8));
		$cap = $this->play($s, 'd3-e4', 13000000);
		$this->assertContains(23, $cap['captured']);
		$this->assertSame(0, $cap['halfmove']);
	}

	public function testW8BudgetFallback(): void {
		$s = $this->pos('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4']);
		$this->assertSame([8, 2, 16], [$this->e->budget($s, 'w'), $this->e->budget($s, 'b'), $this->e->worldCount($s)]);
		$m = $this->e->findMove($s, 'h1-h8');
		$this->assertTrue($m['fallback'] ?? null);
		$this->assertSame('rolled', $m['resolution'] ?? null);
		$this->assertSame(
			[['key' => 'miss', 'weight' => 8388608], ['key' => 'move', 'weight' => 8388608]],
			$m['outcomes'] ?? null,
		);
		$r = $this->e->applyMove($s, 'h1-h8', 9000000);
		$this->assertTrue($r['measurement']['fallback'] ?? null);
		$this->assertCount(8, $r['state']['worlds']);
		$this->assertSame([2097152], array_values(array_unique(array_column($r['state']['worlds'], 1))));
		$this->assertSame([8, 1], [$this->e->budget($r['state'], 'w'), $this->e->budget($r['state'], 'b')]);
	}

	public function testW9PawnProbeDoublePushAndEnPassant(): void {
		$s = $this->pos('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']);
		$this->assertSame(
			[['key' => 'miss', 'weight' => 8388608], ['key' => 'move', 'weight' => 8388608]],
			$this->e->findMove($s, 'e2-e4')['outcomes'] ?? null,
		);
		$miss = $this->play($s, 'e2-e4', 1);
		$this->assertSame(['e2' => self::T], $this->loc($miss, 12));
		$this->assertSame(['e3' => self::T], $this->loc($miss, 22));
		$this->assertSame('-', $miss['ep']);
		$move = $this->play($s, 'e2-e4', 16000000);
		$this->assertSame('e3', $move['ep']);
		$this->assertSame(0, $move['halfmove']);
		$ep = $this->e->findMove($move, 'd4-e3');
		$this->assertSame('certain', $ep['resolution'] ?? null);
		$after = $this->play($move, 'd4-e3');
		$this->assertContains(12, $after['captured']);
	}

	public function testW10CastlingRightsFollowTheState(): void {
		$s = $this->pos('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
		$split = $this->play($s, 'h1-h3|h5');
		$this->assertSame('-', $split['castling']);
		$split = $this->play($split, 'e8-d8');
		$back = $this->play($split, 'h3|h5-h1');
		$this->assertSame('-', $back['castling'], 'merging back does not restore the right');
		$this->assertSame('e1-g1', $this->e->findMove($s, 'O-O')['code'] ?? null);
		$this->assertSame('O-O', $this->e->moveNotation($s, 'e1-g1'));
	}

	public function testW11RandomnessVectors(): void {
		$w2 = $this->pos('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']);
		$this->assertSame(
			8388608,
			$this->e->applyMove($w2, 'c1-h6', rng: static fn (): float => 0.5)['measurement']['u'] ?? null,
		);
		$this->assertSame(
			16777215,
			$this->e->applyMove($w2, 'c1-h6', rng: static fn (): float => 0.999999999)['measurement']['u'] ?? null,
		);
	}

	public function testW12IndexOrderWithOddWeights(): void {
		$s = $this->pos('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']);
		$this->assertSame('1059583f07581935', self::lastHash($s));
		$this->assertSame('h4-h3|a4', $this->e->findMove($s, 'h4-a4|h3')['code'] ?? null);
		$s = $this->play($s, 'h4-h3|a4');
		$this->assertSame(['h3' => 8388609, 'a4' => 8388607], $this->loc($s, 2));
		$this->assertSame('e64c1d334ceeb8af', self::lastHash($s));
		$s = $this->play($s, 'e8-d8');
		$this->assertSame('fa1e4e870feb98ca', self::lastHash($s));
		$this->assertSame('?h3', $this->e->findMove($s, '?a4')['code'] ?? null);
		$this->assertSame(
			[['key' => 'h3', 'weight' => 8388609], ['key' => 'a4', 'weight' => 8388607]],
			$this->e->findMove($s, '?h3')['outcomes'] ?? null,
		);
		$this->assertSame('221bc0511bf8b8f6', self::lastHash($this->play($s, '?h3', 0)));
		$this->assertSame('221bc0511bf8b8f6', self::lastHash($this->play($s, '?h3', 8388608)));
		$this->assertSame('c8c6e6a2d75059ea', self::lastHash($this->play($s, '?h3', 8388609)));
	}

	public function testW13FastAcceptMustCountBlockedLanes(): void {
		$s = $this->pos('4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3']);
		$this->assertSame('0c9886eceb87b80e', self::lastHash($s));
		$this->assertSame([4, 2, 8], [$this->e->budget($s, 'w'), $this->e->budget($s, 'b'), $this->e->worldCount($s)]);
		$this->assertSame('budget_full', $this->e->whyIllegal($s, 'd1-h1|d5'));
	}

	public function testW14TrappedKingEndsTheGame(): void {
		$s = $this->pos('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
		$r = $this->e->applyMove($s, 'a1-a8');
		$this->assertSame(['result' => '1-0', 'reason' => 'king_trapped'], $r['state']['result']);
		$this->assertSame('7166d3cef5551f3c', self::lastHash($r['state']));
		$this->assertSame('Ra1-a8 #', $this->e->moveNotation($s, 'a1-a8'));
		$this->assertSame([], $this->e->generateMoves($r['state']));
		$this->assertFalse($this->e->kingTrapped($r['state']), 'a finished game is not trapped');
		$escape = $this->pos('6k1/3n1ppp/8/8/8/8/8/R3K3 w - - 0 1');
		$this->assertNull($this->play($escape, 'a1-a8')['result'], 'the knight can block the rank');
	}

	public function testW15EnPassantAdjacencyUsesFiles(): void {
		$s = $this->play($this->pos('4k3/8/8/p7/8/8/7P/4K3 w - - 0 1'), 'h2-h4');
		$this->assertSame('-', $s['ep']);
		$this->assertSame('7630184fdd9223c9', self::lastHash($s));
		$m = $this->play($this->pos('4k3/p7/8/8/7P/8/8/4K3 b - - 0 1'), 'a7-a5');
		$this->assertSame('-', $m['ep']);
		$this->assertSame('67d9307690c4f1b5', self::lastHash($m));
	}

	public function testW16DrawsYieldToACertainKingCapture(): void {
		$s = $this->pos('8/8/4k3/3n4/4K3/8/8/8 w - - 0 1');
		$s = $this->play($s, 'e4-d5');
		$this->assertNull($s['result']);
		$this->assertSame('3bdffd05d877049c', self::lastHash($s));
		$this->assertSame(self::T, $this->e->kingDanger($s, 'w'));
		$this->assertSame(['result' => '0-1', 'reason' => 'king_captured'], $this->play($s, 'e6-d5')['result']);
		// Not adjacent: bare kings.
		$far = $this->play($this->pos('8/8/8/3k4/8/1n6/8/K7 w - - 0 1'), 'a1-b1');
		$far = $this->play($far, 'b3-d2');
		$this->assertNull($far['result']);
		$bare = $this->play($this->pos('7k/8/8/8/8/8/1n6/K7 w - - 0 1'), 'a1-b2');
		$this->assertSame(['result' => '1/2-1/2', 'reason' => 'bare_kings'], $bare['result']);
	}

	public function testW17SetupVectors(): void {
		$q = $this->pos('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1');
		$this->assertSame('..IBA.......................................................a...', $q['worlds'][0][0]);
		$this->assertSame('kqrrbbnnqpppppppkqrrbbnnpppppppp', $q['types']);
		$this->assertSame(
			[2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
			$q['captured'],
		);
		$this->assertSame('3a386523ce53fad7', self::lastHash($q));
		$ep = $this->pos('4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', ['g1-f3|h3']);
		$this->assertSame(['b', 'e3', 'e2f094948d875644'], [$ep['turn'], $ep['ep'], self::lastHash($ep)]);
		$this->assertTrue($this->e->isLegal($ep, 'd4-e3'));
		$this->assertSame(
			['result' => null],
			['result' => $this->pos('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6', 'c1-h6@capture'])['result']],
		);
	}
}
