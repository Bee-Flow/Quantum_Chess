<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Engine\Engine;
use OCA\QuantumChess\Service\Game\GameClock;
use OCA\QuantumChess\Service\Game\GameSerializer;
use OCA\QuantumChess\Service\Player\RatingService;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IL10N;
use OCP\IUserManager;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Snapshots of every JSON shape the serializer produces. The keys, their order and the values are part of the HTTP
 * API, so these tests pin them exactly.
 */
#[CoversClass(GameSerializer::class)]
final class GameSerializerTest extends TestCase {
	private const NOW = GameBuilder::NOW;
	private const WEEK = 604800;

	private bool $chatEnabled = true;

	private function serializer(): GameSerializer {
		$users = $this->createMock(IUserManager::class);
		$users->method('getDisplayName')->willReturnCallback(fn (string $uid) => [
			'alice' => 'Alice A.',
			'bob' => 'Bob B.',
			'carol' => 'Carol',
		][$uid] ?? null);
		$ratings = $this->createMock(RatingService::class);
		$ratings->method('get')->willReturnCallback(fn (string $uid) => match ($uid) {
			'alice' => [
				'rating' => 1234,
				'provisional' => false,
				'ratedGames' => 12,
				'peak' => 1300,
				'games' => 14,
				'wins' => 8,
				'losses' => 5,
				'draws' => 1,
				'listed' => true,
				'lastRatedAt' => self::NOW - 50,
			],
			'bob' => [
				'rating' => 1180,
				'provisional' => true,
				'ratedGames' => 3,
				'peak' => 1210,
				'games' => 3,
				'wins' => 1,
				'losses' => 2,
				'draws' => 0,
				'listed' => null,
				'lastRatedAt' => null,
			],
			default => null,
		});
		$settings = $this->createMock(AppSettings::class);
		$settings->method('chatEnabled')->willReturnCallback(fn () => $this->chatEnabled);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(self::NOW);
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnArgument(0);
		return new GameSerializer($users, new Engine(), $ratings, $settings, new GameClock($time), $l);
	}

	/** Alice (White) split her knight, bob answered, alice moved again and offered a draw at ply 2. */
	private static function active(array $fields = []): Game {
		$engine = new Engine();
		$state = $engine->initialState();
		foreach (['g1-f3|h3', 'e7-e5', 'd2-d4'] as $code) {
			$state = $engine->applyMove($state, $code)['state'];
		}
		return GameBuilder::active($fields + [
			'state' => $engine->serializeState($state),
			'ply' => 3,
			'turn' => 'b',
			'drawOffer' => 'w',
			'drawOfferPly' => 2,
			'chatCount' => 2,
			'muteB' => 1,
			'lastMoveAt' => self::NOW - 100,
		]);
	}

	/**
	 * @return array<string, array{0: callable(GameSerializer): mixed, 1: mixed}>
	 */
	public static function snapshots(): array {
		$tables = [];
		foreach (self::cases() as $name => $case) {
			$tables[$name] = [$case, self::EXPECTED[$name] ?? null];
		}
		return $tables;
	}

	/**
	 * The serializer calls of the snapshot table, by name.
	 *
	 * @return array<string, callable(GameSerializer): mixed>
	 */
	public static function cases(): array {
		// The preview of the start position is pinned once, by the first case; the others only count its cells.
		$short = static fn (array $dto): array => array_replace($dto, ['preview' => count($dto['preview'])]);
		$withoutState = static function (array $dto) use ($short): array {
			unset($dto['state']);
			return $short($dto);
		};
		return [
			'summary of an active game' => fn (GameSerializer $s) => $s->summary(self::active(), 'alice'),
			'summary of a pending invitation' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::pending(),
				'bob',
			)),
			'summary of an open challenge' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::open(),
				'carol',
			)),
			'summary of a finished game' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::finished(),
				'bob',
			)),
			'summary of a draw' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::finished(['result' => '1/2-1/2', 'resultReason' => 'agreement']),
				'alice',
			)),
			'summary of a loss for White' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::finished([
					'result' => '0-1',
					'rated' => 0,
					'ratingWDelta' => null,
					'ratingBDelta' => null,
				]),
				'alice',
			)),
			'summary of an aborted game' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::finished([
					'status' => Game::STATUS_ABORTED,
					'result' => null,
					'resultReason' => 'aborted',
					'rated' => 0,
					'unratedReason' => 'aborted',
				]),
				'alice',
			)),
			'summary with deleted accounts' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::finished(['blackUid' => null, 'opponentUid' => 'ghost']),
				'alice',
			)),
			'summary of a rematch offer' => fn (GameSerializer $s) => $short($s->summary(
				GameBuilder::pending(['rematchOf' => 3, 'scopeGroup' => null, 'inviteMessage' => null]),
				'bob',
			)),
			'live for White' => fn (GameSerializer $s) => $withoutState($s->live(self::active(), 'alice')),
			'live for Black' => fn (GameSerializer $s) => $withoutState($s->live(self::active(), 'bob')),
			'live for a spectator' => fn (GameSerializer $s) => $withoutState($s->live(GameBuilder::open(), 'carol')),
			'live of a finished game' => fn (GameSerializer $s) => $withoutState($s->live(
				GameBuilder::finished(),
				'bob',
			)),
			'full' => function (GameSerializer $s) use ($withoutState): array {
				$move = new Move();
				$move->setId(1);
				$move->setPly(0);
				$move->setColor('w');
				$move->setUid('alice');
				$move->setCode('g1-f3|h3');
				$move->setNotation('Ng1-f3|h3');
				$move->setChain(str_repeat('a', 64));
				$move->setStateHash('0123456789abcdef');
				$move->setCreatedAt(self::NOW - 300);
				$line = new ChatMessage();
				$line->setId(4);
				$line->setUid('bob');
				$line->setKind(ChatMessage::KIND_PHRASE);
				$line->setMessage('good_luck');
				$line->setCreatedAt(self::NOW - 250);
				return $withoutState($s->full(
					self::active(['startState' => '{"custom":true}']),
					'alice',
					[$move],
					[$line],
				));
			},
			'full without start state' => fn (GameSerializer $s) => array_intersect_key(
				$s->full(self::active(), 'bob', [], []),
				['startState' => 0, 'moves' => 0, 'chat' => 0],
			),
			'move with a roll' => function (GameSerializer $s): array {
				$move = new Move();
				$move->setId(9);
				$move->setPly(2);
				$move->setColor('w');
				$move->setUid(null);
				$move->setCode('f3-e5');
				$move->setNotation('Nf3xe5 {capture 50%}');
				$move->setMeasurement('{"key":"capture","u":5000000,"captured":17,"outcomes":[{"key":"capture","weight":8388608},{"key":"miss","weight":8388608}],"fallback":false}');
				$move->setChain(str_repeat('b', 64));
				$move->setStateHash('fedcba9876543210');
				$move->setCreatedAt(self::NOW - 30);
				return $s->move($move);
			},
			'chat lines' => function (GameSerializer $s): array {
				$lines = [];
				foreach ([
					[1, null, ChatMessage::KIND_SYSTEM, 'draw_offered', '{"color":"w"}'],
					[2, null, ChatMessage::KIND_TEXT, 'hello', null],
					[3, 'alice', ChatMessage::KIND_TEXT, 'Good luck!', null],
					[4, 'bob', ChatMessage::KIND_PHRASE, 'well_played', null],
					[5, 'ghost', 9, 'odd', null],
				] as [$id, $uid, $kind, $text, $params]) {
					$line = new ChatMessage();
					$line->setId($id);
					$line->setUid($uid);
					$line->setKind($kind);
					$line->setMessage($text);
					$line->setParams($params);
					$line->setCreatedAt(self::NOW - 100 + $id);
					$lines[] = $s->chat($line);
				}
				return $lines;
			},
			'lobby' => fn (GameSerializer $s) => array_map(
				fn ($value) => is_array($value) && array_is_list($value) ? array_column($value, 'id') : $value,
				$s->lobby([
					'yourTurn' => [GameBuilder::active(['id' => 1])],
					'invitations' => [GameBuilder::pending(['id' => 2])],
					'open' => [GameBuilder::open(['id' => 3]), GameBuilder::open(['id' => 4])],
					'recent' => [GameBuilder::finished(['id' => 5])],
				], 'bob', 'u0123456789.oabcdef'),
			),
			'preview of a broken state' => fn (GameSerializer $s) => $s->preview(
				GameBuilder::active(['state' => '{"v":1}']),
			),
			'user references' => fn (GameSerializer $s) => [
				$s->userRef('alice'),
				$s->userRef(null),
				$s->userRef('ghost'),
				$s->deletedRef(),
			],
		];
	}

	#[DataProvider('snapshots')]
	public function testSnapshot(callable $case, mixed $expected): void {
		$this->assertSame($expected, $case($this->serializer()));
	}

	public function testLiveCarriesTheDecodedState(): void {
		$game = self::active();
		$this->assertSame(json_decode($game->getState(), true), $this->serializer()->live($game, 'alice')['state']);
		$this->assertNull($this->serializer()->live(GameBuilder::active(['state' => 'not json']), 'alice')['state']);
	}

	/**
	 * @return array<string, array{array<string, mixed>, string, array{bool, ?int}}>
	 */
	public static function drawAvailability(): array {
		return [
			'no earlier offer' => [['ply' => 10], 'alice', [true, null]],
			'cool-down just over' => [['ply' => 10, 'lastDrawW' => 4], 'alice', [true, null]],
			'cool-down running' => [['ply' => 10, 'lastDrawW' => 5], 'alice', [false, 11]],
			'the other side declined' => [['ply' => 10, 'lastDrawB' => 9], 'alice', [true, null]],
			'Black in cool-down' => [['ply' => 10, 'lastDrawB' => 9], 'bob', [false, 15]],
			'own offer pending' => [['ply' => 10, 'drawOffer' => 'w'], 'alice', [false, null]],
			'opponent offer pending' => [['ply' => 10, 'drawOffer' => 'b'], 'alice', [true, null]],
			'game over' => [['ply' => 10, 'lastDrawW' => 5, 'status' => Game::STATUS_FINISHED], 'alice', [false, 11]],
			'spectator' => [['ply' => 10, 'lastDrawW' => 5], 'carol', [false, null]],
		];
	}

	#[DataProvider('drawAvailability')]
	public function testDrawAvailability(array $fields, string $viewer, array $expected): void {
		$live = $this->serializer()->live(GameBuilder::active($fields), $viewer);
		$this->assertSame($expected, [$live['canOfferDraw'], $live['drawAvailableAtPly']]);
	}

	/**
	 * @return array<string, array{bool, array<string, mixed>, string, bool}>
	 */
	public static function chatOpen(): array {
		return [
			'active game' => [true, [], 'alice', true],
			'chat turned off' => [false, [], 'alice', false],
			'spectator' => [true, [], 'carol', false],
			'finished a week ago' => [
				true,
				['status' => Game::STATUS_FINISHED, 'finishedAt' => self::NOW - self::WEEK],
				'bob',
				true,
			],
			'finished a week and a second ago' => [
				true,
				['status' => Game::STATUS_FINISHED, 'finishedAt' => self::NOW - self::WEEK - 1],
				'bob',
				false,
			],
			'aborted today' => [
				true,
				['status' => Game::STATUS_ABORTED, 'finishedAt' => self::NOW - 10],
				'alice',
				true,
			],
			'declined' => [true, ['status' => Game::STATUS_DECLINED, 'finishedAt' => self::NOW - 10], 'alice', false],
		];
	}

	#[DataProvider('chatOpen')]
	public function testChatOpen(bool $enabled, array $fields, string $viewer, bool $open): void {
		$this->chatEnabled = $enabled;
		$this->assertSame($open, $this->serializer()->live(GameBuilder::active($fields), $viewer)['chatOpen']);
	}

	/** The expected result of every case of cases(), by name. */
	private const EXPECTED = [
		'summary of an active game' => [
			'id' => 7,
			'status' => 'active',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'b',
			'ply' => 3,
			'deadlineAt' => 1790001000,
			'expiresAt' => null,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999900,
			'finishedAt' => null,
			'preview' => [
				[0, 'R', 100],
				[1, 'N', 100],
				[2, 'B', 100],
				[3, 'Q', 100],
				[4, 'K', 100],
				[5, 'B', 100],
				[7, 'R', 100],
				[8, 'P', 100],
				[9, 'P', 100],
				[10, 'P', 100],
				[12, 'P', 100],
				[13, 'P', 100],
				[14, 'P', 100],
				[15, 'P', 100],
				[21, 'N', 50],
				[23, 'N', 50],
				[27, 'P', 100],
				[36, 'p', 100],
				[48, 'p', 100],
				[49, 'p', 100],
				[50, 'p', 100],
				[51, 'p', 100],
				[53, 'p', 100],
				[54, 'p', 100],
				[55, 'p', 100],
				[56, 'r', 100],
				[57, 'n', 100],
				[58, 'b', 100],
				[59, 'q', 100],
				[60, 'k', 100],
				[61, 'b', 100],
				[62, 'n', 100],
				[63, 'r', 100],
			],
			'rev' => 5,
		],
		'summary of a pending invitation' => [
			'id' => 7,
			'status' => 'pending',
			'timeControl' => 'corr:3d',
			'rated' => false,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => null,
			'black' => null,
			'colorChoice' => 'w',
			'myColor' => null,
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 0,
			'deadlineAt' => null,
			'expiresAt' => 1790086400,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => 'Fancy a game?',
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789999400,
			'updatedAt' => 1789999400,
			'startedAt' => null,
			'lastMoveAt' => null,
			'finishedAt' => null,
			'preview' => 0,
			'rev' => 1,
		],
		'summary of an open challenge' => [
			'id' => 7,
			'status' => 'open',
			'timeControl' => 'corr:3d',
			'rated' => false,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => null,
			'white' => null,
			'black' => null,
			'colorChoice' => 'r',
			'myColor' => null,
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 0,
			'deadlineAt' => null,
			'expiresAt' => 1790086400,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789999400,
			'updatedAt' => 1789999400,
			'startedAt' => null,
			'lastMoveAt' => null,
			'finishedAt' => null,
			'preview' => 0,
			'rev' => 1,
		],
		'summary of a finished game' => [
			'id' => 7,
			'status' => 'finished',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'b',
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 12,
			'deadlineAt' => null,
			'expiresAt' => null,
			'result' => '1-0',
			'resultReason' => 'resignation',
			'winner' => 'w',
			'ratingChange' => ['w' => 22, 'b' => -22],
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999100,
			'finishedAt' => 1789999400,
			'preview' => 32,
			'rev' => 5,
		],
		'summary of a draw' => [
			'id' => 7,
			'status' => 'finished',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 12,
			'deadlineAt' => null,
			'expiresAt' => null,
			'result' => '1/2-1/2',
			'resultReason' => 'agreement',
			'winner' => null,
			'ratingChange' => ['w' => 22, 'b' => -22],
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999100,
			'finishedAt' => 1789999400,
			'preview' => 32,
			'rev' => 5,
		],
		'summary of a loss for White' => [
			'id' => 7,
			'status' => 'finished',
			'timeControl' => 'corr:3d',
			'rated' => false,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 12,
			'deadlineAt' => null,
			'expiresAt' => null,
			'result' => '0-1',
			'resultReason' => 'resignation',
			'winner' => 'b',
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999100,
			'finishedAt' => 1789999400,
			'preview' => 32,
			'rev' => 5,
		],
		'summary of an aborted game' => [
			'id' => 7,
			'status' => 'aborted',
			'timeControl' => 'corr:3d',
			'rated' => false,
			'ratedRequested' => true,
			'unratedReason' => 'aborted',
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 12,
			'deadlineAt' => null,
			'expiresAt' => null,
			'result' => null,
			'resultReason' => 'aborted',
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999100,
			'finishedAt' => 1789999400,
			'preview' => 32,
			'rev' => 5,
		],
		'summary with deleted accounts' => [
			'id' => 7,
			'status' => 'finished',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => null, 'displayName' => 'Deleted user'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => null, 'displayName' => 'Deleted user'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 12,
			'deadlineAt' => null,
			'expiresAt' => null,
			'result' => '1-0',
			'resultReason' => 'resignation',
			'winner' => 'w',
			'ratingChange' => ['w' => 22, 'b' => -22],
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999100,
			'finishedAt' => 1789999400,
			'preview' => 32,
			'rev' => 5,
		],
		'summary of a rematch offer' => [
			'id' => 7,
			'status' => 'pending',
			'timeControl' => 'corr:3d',
			'rated' => false,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => null,
			'black' => null,
			'colorChoice' => 'w',
			'myColor' => null,
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 0,
			'deadlineAt' => null,
			'expiresAt' => 1790086400,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => 3,
			'rematchId' => null,
			'createdAt' => 1789999400,
			'updatedAt' => 1789999400,
			'startedAt' => null,
			'lastMoveAt' => null,
			'finishedAt' => null,
			'preview' => 0,
			'rev' => 1,
		],
		'live for White' => [
			'id' => 7,
			'status' => 'active',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'b',
			'ply' => 3,
			'deadlineAt' => 1790001000,
			'expiresAt' => null,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999900,
			'finishedAt' => null,
			'preview' => 33,
			'rev' => 5,
			'chain' => '62148aa205f477589daef0514105b2497f2c03d2a91b39c4ce76789a50346683',
			'drawOffer' => ['by' => 'w', 'ply' => 2],
			'canOfferDraw' => false,
			'drawAvailableAtPly' => null,
			'canAbort' => false,
			'canResign' => true,
			'canRematch' => false,
			'ratings' => [
				'w' => ['rating' => 1234, 'provisional' => false],
				'b' => ['rating' => 1180, 'provisional' => true],
			],
			'ratingBefore' => null,
			'muted' => false,
			'chatCount' => 2,
			'chatOpen' => true,
			'now' => 1790000000,
		],
		'live for Black' => [
			'id' => 7,
			'status' => 'active',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'b',
			'yourTurn' => true,
			'turn' => 'b',
			'ply' => 3,
			'deadlineAt' => 1790001000,
			'expiresAt' => null,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999900,
			'finishedAt' => null,
			'preview' => 33,
			'rev' => 5,
			'chain' => '62148aa205f477589daef0514105b2497f2c03d2a91b39c4ce76789a50346683',
			'drawOffer' => ['by' => 'w', 'ply' => 2],
			'canOfferDraw' => true,
			'drawAvailableAtPly' => null,
			'canAbort' => false,
			'canResign' => true,
			'canRematch' => false,
			'ratings' => [
				'w' => ['rating' => 1234, 'provisional' => false],
				'b' => ['rating' => 1180, 'provisional' => true],
			],
			'ratingBefore' => null,
			'muted' => true,
			'chatCount' => 2,
			'chatOpen' => true,
			'now' => 1790000000,
		],
		'live for a spectator' => [
			'id' => 7,
			'status' => 'open',
			'timeControl' => 'corr:3d',
			'rated' => false,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => null,
			'white' => null,
			'black' => null,
			'colorChoice' => 'r',
			'myColor' => null,
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 0,
			'deadlineAt' => null,
			'expiresAt' => 1790086400,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789999400,
			'updatedAt' => 1789999400,
			'startedAt' => null,
			'lastMoveAt' => null,
			'finishedAt' => null,
			'preview' => 0,
			'rev' => 1,
			'chain' => null,
			'drawOffer' => null,
			'canOfferDraw' => false,
			'drawAvailableAtPly' => null,
			'canAbort' => false,
			'canResign' => false,
			'canRematch' => false,
			'ratings' => ['w' => null, 'b' => null],
			'ratingBefore' => null,
			'muted' => false,
			'chatCount' => 0,
			'chatOpen' => false,
			'now' => 1790000000,
		],
		'live of a finished game' => [
			'id' => 7,
			'status' => 'finished',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'b',
			'yourTurn' => false,
			'turn' => 'w',
			'ply' => 12,
			'deadlineAt' => null,
			'expiresAt' => null,
			'result' => '1-0',
			'resultReason' => 'resignation',
			'winner' => 'w',
			'ratingChange' => ['w' => 22, 'b' => -22],
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999100,
			'finishedAt' => 1789999400,
			'preview' => 32,
			'rev' => 5,
			'chain' => '62148aa205f477589daef0514105b2497f2c03d2a91b39c4ce76789a50346683',
			'drawOffer' => null,
			'canOfferDraw' => false,
			'drawAvailableAtPly' => null,
			'canAbort' => false,
			'canResign' => false,
			'canRematch' => true,
			'ratings' => [
				'w' => ['rating' => 1234, 'provisional' => false],
				'b' => ['rating' => 1180, 'provisional' => true],
			],
			'ratingBefore' => ['w' => 1200, 'b' => 1250],
			'muted' => false,
			'chatCount' => 0,
			'chatOpen' => true,
			'now' => 1790000000,
		],
		'full' => [
			'id' => 7,
			'status' => 'active',
			'timeControl' => 'corr:3d',
			'rated' => true,
			'ratedRequested' => true,
			'unratedReason' => null,
			'creator' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'opponent' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'white' => ['userId' => 'alice', 'displayName' => 'Alice A.'],
			'black' => ['userId' => 'bob', 'displayName' => 'Bob B.'],
			'colorChoice' => 'w',
			'myColor' => 'w',
			'yourTurn' => false,
			'turn' => 'b',
			'ply' => 3,
			'deadlineAt' => 1790001000,
			'expiresAt' => null,
			'result' => null,
			'resultReason' => null,
			'winner' => null,
			'ratingChange' => null,
			'inviteMessage' => null,
			'scopeGroup' => null,
			'rematchOf' => null,
			'rematchId' => null,
			'createdAt' => 1789995000,
			'updatedAt' => 1789996000,
			'startedAt' => 1789996000,
			'lastMoveAt' => 1789999900,
			'finishedAt' => null,
			'preview' => 33,
			'rev' => 5,
			'chain' => '62148aa205f477589daef0514105b2497f2c03d2a91b39c4ce76789a50346683',
			'drawOffer' => ['by' => 'w', 'ply' => 2],
			'canOfferDraw' => false,
			'drawAvailableAtPly' => null,
			'canAbort' => false,
			'canResign' => true,
			'canRematch' => false,
			'ratings' => [
				'w' => ['rating' => 1234, 'provisional' => false],
				'b' => ['rating' => 1180, 'provisional' => true],
			],
			'ratingBefore' => null,
			'muted' => false,
			'chatCount' => 2,
			'chatOpen' => true,
			'now' => 1790000000,
			'startState' => ['custom' => true],
			'moves' => [
				[
					'ply' => 0,
					'color' => 'w',
					'userId' => 'alice',
					'code' => 'g1-f3|h3',
					'notation' => 'Ng1-f3|h3',
					'measurement' => null,
					'chain' => 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'stateHash' => '0123456789abcdef',
					'createdAt' => 1789999700,
				],
			],
			'chat' => [
				[
					'id' => 4,
					'kind' => 'phrase',
					'userId' => 'bob',
					'displayName' => 'Bob B.',
					'message' => 'good_luck',
					'params' => null,
					'createdAt' => 1789999750,
				],
			],
		],
		'full without start state' => ['startState' => null, 'moves' => [], 'chat' => []],
		'move with a roll' => [
			'ply' => 2,
			'color' => 'w',
			'userId' => null,
			'code' => 'f3-e5',
			'notation' => 'Nf3xe5 {capture 50%}',
			'measurement' => [
				'key' => 'capture',
				'u' => 5000000,
				'captured' => 17,
				'outcomes' => [
					['key' => 'capture', 'weight' => 8388608],
					['key' => 'miss', 'weight' => 8388608],
				],
				'fallback' => false,
			],
			'chain' => 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			'stateHash' => 'fedcba9876543210',
			'createdAt' => 1789999970,
		],
		'chat lines' => [
			[
				'id' => 1,
				'kind' => 'system',
				'userId' => null,
				'displayName' => null,
				'message' => 'draw_offered',
				'params' => ['color' => 'w'],
				'createdAt' => 1789999901,
			],
			[
				'id' => 2,
				'kind' => 'text',
				'userId' => null,
				'displayName' => 'Deleted user',
				'message' => 'hello',
				'params' => null,
				'createdAt' => 1789999902,
			],
			[
				'id' => 3,
				'kind' => 'text',
				'userId' => 'alice',
				'displayName' => 'Alice A.',
				'message' => 'Good luck!',
				'params' => null,
				'createdAt' => 1789999903,
			],
			[
				'id' => 4,
				'kind' => 'phrase',
				'userId' => 'bob',
				'displayName' => 'Bob B.',
				'message' => 'well_played',
				'params' => null,
				'createdAt' => 1789999904,
			],
			[
				'id' => 5,
				'kind' => 'text',
				'userId' => 'ghost',
				'displayName' => 'Deleted user',
				'message' => 'odd',
				'params' => null,
				'createdAt' => 1789999905,
			],
		],
		'lobby' => [
			'rev' => 'u0123456789.oabcdef',
			'now' => 1790000000,
			'yourTurn' => [1],
			'waiting' => [],
			'invitations' => [2],
			'outgoing' => [],
			'open' => [3, 4],
			'recent' => [5],
			'counts' => ['yourTurn' => 1, 'invitations' => 1],
		],
		'preview of a broken state' => [],
		'user references' => [
			['userId' => 'alice', 'displayName' => 'Alice A.'],
			null,
			['userId' => null, 'displayName' => 'Deleted user'],
			['userId' => null, 'displayName' => 'Deleted user'],
		],
	];
}
