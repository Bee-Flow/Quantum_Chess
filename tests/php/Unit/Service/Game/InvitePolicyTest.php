<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Service\Game\InvitePolicy;
use OCA\QuantumChess\Service\Settings\AppSettings;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCP\App\IAppManager;
use OCP\IGroupManager;
use OCP\IL10N;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Share\IManager as IShareManager;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Who may invite whom, who sees which open challenge, and the invitation limits.
 */
#[CoversClass(InvitePolicy::class)]
final class InvitePolicyTest extends TestCase {
	/** @var array<string, bool> enabled state of the existing accounts */
	private array $accounts = ['alice' => true, 'bob' => true, 'carol' => true, 'dave' => false];
	/** @var array<string, list<string>> */
	private array $groups = [
		'alice' => ['staff', 'chess'],
		'bob' => ['staff'],
		'carol' => ['guests'],
		'dave' => ['staff'],
	];
	/** @var list<string> users who may play online */
	private array $multiplayer = ['alice', 'bob', 'carol', 'dave'];
	/** @var list<string> users who have the app enabled */
	private array $appUsers = ['alice', 'bob', 'carol', 'dave'];
	/** @var array<string, mixed> sharing settings */
	private array $sharing = [
		'groupsOnly' => false,
		'excluded' => [],
		'enumeration' => true,
		'limitToGroups' => false,
		'fullMatch' => false,
	];
	private bool $havePlayed = false;
	/** @var array<string, int> */
	private array $counts = ['open' => 0, 'pending' => 0, 'pair' => 0, 'active' => 0];
	private int $maxActive = 30;

	private function policy(): InvitePolicy {
		$users = $this->createMock(IUserManager::class);
		$users->method('get')->willReturnCallback(function (string $uid): ?IUser {
			$canonical = strtolower($uid);
			if (!isset($this->accounts[$canonical])) {
				return null;
			}
			$user = $this->createMock(IUser::class);
			$user->method('getUID')->willReturn($canonical);
			$user->method('isEnabled')->willReturn($this->accounts[$canonical]);
			return $user;
		});
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('getUserGroupIds')->willReturnCallback(
			fn (IUser $user) => $this->groups[$user->getUID()] ?? [],
		);
		$groups->method('isInGroup')->willReturnCallback(
			fn (string $uid, string $gid) => in_array($gid, $this->groups[$uid] ?? [], true),
		);
		$apps = $this->createMock(IAppManager::class);
		$apps->method('isEnabledForUser')->willReturnCallback(
			fn (string $app, IUser $user) => in_array($user->getUID(), $this->appUsers, true),
		);
		$share = $this->createMock(IShareManager::class);
		$share->method('shareWithGroupMembersOnly')->willReturnCallback(fn () => $this->sharing['groupsOnly']);
		$share->method('shareWithGroupMembersOnlyExcludeGroupsList')->willReturnCallback(
			fn () => $this->sharing['excluded'],
		);
		$share->method('allowEnumeration')->willReturnCallback(fn () => $this->sharing['enumeration']);
		$share->method('limitEnumerationToGroups')->willReturnCallback(fn () => $this->sharing['limitToGroups']);
		$share->method('allowEnumerationFullMatch')->willReturnCallback(fn () => $this->sharing['fullMatch']);
		$settings = $this->createMock(AppSettings::class);
		$settings->method('isMultiplayerEnabledFor')->willReturnCallback(
			fn (string $uid) => in_array(strtolower($uid), $this->multiplayer, true),
		);
		$settings->method('maxActiveGames')->willReturnCallback(fn () => $this->maxActive);
		$games = $this->createMock(GameMapper::class);
		$games->method('havePlayed')->willReturnCallback(fn () => $this->havePlayed);
		$games->method('countCreated')->willReturnCallback(
			fn (string $uid, string $status) => $status === Game::STATUS_OPEN
				? $this->counts['open']
				: $this->counts['pending'],
		);
		$games->method('countPendingPair')->willReturnCallback(fn () => $this->counts['pair']);
		$games->method('countActive')->willReturnCallback(fn () => $this->counts['active']);
		$l = $this->createMock(IL10N::class);
		$l->method('t')->willReturnCallback(fn (string $text, array $parameters = []) => vsprintf($text, $parameters));
		return new InvitePolicy($users, $groups, $apps, $share, $settings, $games, $l);
	}

	public function testMultiplayerUsers(): void {
		$this->multiplayer = ['alice', 'dave'];
		$policy = $this->policy();
		$this->assertSame([true, false, false, false], [
			$policy->isMultiplayerUser('alice'),
			$policy->isMultiplayerUser('bob'),
			$policy->isMultiplayerUser('dave'),
			$policy->isMultiplayerUser('nobody'),
		]);
	}

	/**
	 * @return array<string, array{array<string, mixed>, string, string, bool}>
	 */
	public static function invitations(): array {
		return [
			'anyone with enumeration' => [[], 'alice', 'carol', true],
			'yourself' => [[], 'alice', 'alice', false],
			'yourself in other case' => [[], 'alice', 'ALICE', false],
			'nobody' => [[], 'alice', '', false],
			'unknown account' => [[], 'alice', 'zoe', false],
			'disabled account' => [[], 'alice', 'dave', false],
			'app disabled for the invitee' => [['appUsers' => ['alice', 'bob']], 'alice', 'carol', false],
			'invitee may not play online' => [['multiplayer' => ['alice', 'bob']], 'alice', 'carol', false],
			'inviter may not play online' => [['multiplayer' => ['bob', 'carol']], 'alice', 'carol', false],
			'sharing within groups: shared group' => [['sharing' => ['groupsOnly' => true]], 'alice', 'bob', true],
			'sharing within groups: no shared group' => [
				['sharing' => ['groupsOnly' => true]],
				'alice',
				'carol',
				false,
			],
			'sharing within groups: shared group excluded' => [
				['sharing' => ['groupsOnly' => true, 'excluded' => ['staff']]],
				'alice',
				'bob',
				false,
			],
			'enumeration limited to groups: shared group' => [
				['sharing' => ['limitToGroups' => true]],
				'alice',
				'bob',
				true,
			],
			'enumeration limited to groups: stranger' => [
				['sharing' => ['limitToGroups' => true]],
				'alice',
				'carol',
				false,
			],
			'enumeration limited to groups: played before' => [
				['sharing' => ['limitToGroups' => true], 'havePlayed' => true],
				'alice',
				'carol',
				true,
			],
			'no enumeration' => [['sharing' => ['enumeration' => false]], 'alice', 'bob', false],
			'no enumeration, full match' => [
				['sharing' => ['enumeration' => false, 'fullMatch' => true]],
				'alice',
				'carol',
				true,
			],
			'no enumeration, played before' => [
				['sharing' => ['enumeration' => false], 'havePlayed' => true],
				'alice',
				'carol',
				true,
			],
		];
	}

	#[DataProvider('invitations')]
	public function testCanInvite(array $setup, string $from, string $to, bool $expected): void {
		foreach ($setup as $property => $value) {
			$this->$property = is_array($value) && $property === 'sharing' ? $value + $this->sharing : $value;
		}
		$this->assertSame($expected, $this->policy()->canInvite($from, $to));
	}

	public function testAssertCanInviteReturnsTheCanonicalUserId(): void {
		$this->assertSame('bob', $this->policy()->assertCanInvite('alice', 'Bob'));
		try {
			$this->policy()->assertCanInvite('alice', 'dave');
			$this->fail('dave is disabled');
		} catch (ApiException $e) {
			$this->assertSame(
				['user_not_found', 404, 'You can\'t invite this user'],
				[$e->getErrorCode(), $e->getStatus(), $e->getMessage()],
			);
		}
	}

	/**
	 * @return array<string, array{array<string, int>, ?string, ?array{string, int, string}}>
	 */
	public static function limits(): array {
		return [
			'open challenge' => [['open' => 2], null, null],
			'too many open challenges' => [
				['open' => 3],
				null,
				['too_many_open', 429, 'You already have 3 open challenges.'],
			],
			'invitation' => [['pending' => 9], 'bob', null],
			'too many invitations' => [
				['pending' => 10],
				'bob',
				['too_many_invitations', 429, 'You have too many open invitations.'],
			],
			'already invited' => [
				['pair' => 1],
				'bob',
				['too_many_invitations', 429, 'You have too many open invitations.'],
			],
			'pending invitations do not limit open challenges' => [['pending' => 10, 'pair' => 1], null, null],
			'too many running games' => [
				['active' => 30],
				'bob',
				['too_many_active', 429, 'You have reached the maximum number of running games.'],
			],
		];
	}

	#[DataProvider('limits')]
	public function testLimits(array $counts, ?string $to, ?array $expected): void {
		$this->counts = $counts + $this->counts;
		try {
			$this->policy()->assertWithinLimits('alice', $to);
			$this->assertNull($expected);
		} catch (ApiException $e) {
			$this->assertSame($expected, [$e->getErrorCode(), $e->getStatus(), $e->getMessage()]);
		}
	}

	public function testActiveLimitFollowsTheSetting(): void {
		$this->counts['active'] = 4;
		$this->maxActive = 5;
		$this->policy()->assertActiveLimit('alice');
		$this->maxActive = 4;
		$this->expectException(ApiException::class);
		$this->policy()->assertActiveLimit('alice');
	}

	public function testOpenChallengeVisibility(): void {
		$policy = $this->policy();
		$open = GameBuilder::open();
		$this->assertSame([true, false, false], [
			$policy->canSeeOpenChallenge('bob', $open),
			$policy->canSeeOpenChallenge('alice', $open),
			$policy->canSeeOpenChallenge('dave', $open),
		]);
		$this->assertFalse($policy->canSeeOpenChallenge('bob', GameBuilder::pending()), 'only open challenges');
		$this->assertFalse(
			$policy->canSeeOpenChallenge('bob', GameBuilder::open(['creatorUid' => null])),
			'the creator was deleted',
		);
		$scoped = GameBuilder::open(['scopeGroup' => 'guests']);
		$this->assertSame(
			[false, true],
			[$policy->canSeeOpenChallenge('bob', $scoped), $policy->canSeeOpenChallenge('carol', $scoped)],
			'a group challenge is visible to the group only',
		);
		$this->multiplayer = ['alice'];
		$this->assertFalse($this->policy()->canSeeOpenChallenge('carol', $scoped));
		$this->assertTrue($policy->isInGroup('alice', 'chess'));
	}
}
