<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Game;

use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Service\Game\GameErrors;
use OCA\QuantumChess\Service\Game\GameLifecycle;
use OCA\QuantumChess\Service\Game\GameRepository;
use OCA\QuantumChess\Service\Game\InvitationService;
use OCA\QuantumChess\Tests\Support\GameBuilder;
use OCA\QuantumChess\Tests\Support\GameServiceFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * Invitations, open challenges and rematches: the order of the checks, the stored fields, the transactions and the
 * notifications they send.
 */
#[CoversClass(InvitationService::class)]
#[CoversClass(GameLifecycle::class)]
#[CoversClass(GameRepository::class)]
#[CoversClass(GameErrors::class)]
final class InvitationServiceTest extends TestCase {
	use GameServiceFixture;

	private const NOW = GameBuilder::NOW;

	protected function setUp(): void {
		$this->setUpGames();
	}

	public function testCreateChecksTheRequestInOrder(): void {
		$request = ['opponent' => '', 'color' => 'x', 'rated' => 'yes', 'timeControl' => 'corr:2d', 'message' => 5, 'scopeGroup' => 7];
		$steps = [
			[fn () => $this->allow['multiplayer'] = false, ['multiplayer_disabled', 403, []]],
			[fn () => $this->allow['multiplayer'] = true, ['invalid_argument', 400, ['field' => 'opponent']]],
			[function () use (&$request): void {
				$request['opponent'] = null;
			}, ['invalid_argument', 400, ['field' => 'color']]],
			[function () use (&$request): void {
				$request['color'] = 'b';
			}, ['invalid_argument', 400, ['field' => 'rated']]],
			[function () use (&$request): void {
				$request['rated'] = true;
			}, ['invalid_argument', 400, ['field' => 'timeControl']]],
			[function () use (&$request): void {
				$request['timeControl'] = 'corr:none';
			}, ['invalid_argument', 400, ['field' => 'message']]],
			[function () use (&$request): void {
				$request['message'] = 'hi';
			}, ['invalid_argument', 400, ['field' => 'scopeGroup']]],
			[function () use (&$request): void {
				$request['scopeGroup'] = 'staff';
			}, ['rated_needs_deadline', 400, []]],
			[function () use (&$request): void {
				$request['timeControl'] = 'corr:1d';
				$this->config['ratedEnabled'] = false;
			}, ['rated_not_allowed', 400, []]],
			[function (): void {
				$this->config['ratedEnabled'] = true;
				$this->config['openChallengesEnabled'] = false;
			}, ['open_challenges_disabled', 403, []]],
			[function (): void {
				$this->config['openChallengesEnabled'] = true;
				$this->allow['inGroup'] = false;
			}, ['invalid_argument', 400, ['field' => 'scopeGroup']]],
			[function (): void {
				$this->allow['inGroup'] = true;
				$this->allow['limits'] = 'too_many_open';
			}, ['too_many_open', 429, []]],
			[function () use (&$request): void {
				$request['opponent'] = 'Bob';
				$this->allow['limits'] = null;
			}, ['invalid_argument', 400, ['field' => 'scopeGroup']]],
			[function () use (&$request): void {
				$request['scopeGroup'] = null;
				$this->allow['invite'] = 'user_not_found';
			}, ['user_not_found', 404, []]],
			[function (): void {
				$this->allow['invite'] = null;
				$this->allow['limits'] = 'too_many_invitations';
			}, ['too_many_invitations', 429, []]],
		];
		foreach ($steps as $i => [$change, $expected]) {
			$change();
			$this->assertSame($expected, $this->apiError(fn () => $this->invitations()->create('alice', $request)), "step $i");
		}
		$this->assertSame([], $this->log, 'a rejected request stores nothing');
	}

	public function testCreateAnOpenChallenge(): void {
		$game = $this->invitations()->create('alice', ['rated' => false, 'color' => 'b', 'timeControl' => 'corr:7d',
			'message' => "  Let's\x07play\n ", 'scopeGroup' => 'staff']);
		$this->assertSame([
			'creatorUid' => 'alice', 'opponentUid' => null, 'colorChoice' => 'b', 'status' => Game::STATUS_OPEN,
			'state' => $this->engine->serializeState($this->engine->initialState()), 'ply' => 0, 'turn' => 'w', 'rev' => 1,
			'ratedRequested' => 0, 'rated' => 0, 'timeControl' => 'corr:7d', 'expiresAt' => self::NOW + 7 * 86400,
			'inviteMessage' => "Let's play", 'scopeGroup' => 'staff', 'createdAt' => self::NOW, 'updatedAt' => self::NOW,
		], $this->fields($game, ['creatorUid', 'opponentUid', 'colorChoice', 'status', 'state', 'ply', 'turn', 'rev', 'ratedRequested',
			'rated', 'timeControl', 'expiresAt', 'inviteMessage', 'scopeGroup', 'createdAt', 'updatedAt']));
		$this->assertSame(['insert game #100'], $this->log, 'an open challenge notifies nobody');
	}

	public function testCreateAnInvitation(): void {
		$game = $this->invitations()->create('alice', ['opponent' => 'Bob', 'color' => 'w', 'message' => '']);
		$this->assertSame(['bob', 'r', Game::STATUS_PENDING, 1, 'corr:3d', self::NOW + 14 * 86400, null],
			[$game->getOpponentUid(), $game->getColorChoice(), $game->getStatus(), $game->getRatedRequested(), $game->getTimeControl(),
				$game->getExpiresAt(), $game->getInviteMessage()], 'rated games always get random colours');
		$this->assertSame(['insert game #100', 'notify invite(#100)'], $this->log);
		$long = $this->invitations()->create('alice', ['opponent' => 'bob', 'message' => str_repeat('é', 250)]);
		$this->assertSame(200, mb_strlen((string)$long->getInviteMessage()));
	}

	public function testAcceptStartsTheGame(): void {
		$this->store(GameBuilder::pending());
		$game = $this->invitations()->accept(7, 'bob');
		$this->assertSame([Game::STATUS_ACTIVE, 'alice', 'bob', 1, null, self::NOW + 259200, self::NOW, null],
			[$game->getStatus(), $game->getWhiteUid(), $game->getBlackUid(), $game->getRated(), $game->getUnratedReason(),
				$game->getDeadlineAt(), $game->getStartedAt(), $game->getExpiresAt()]);
		$this->assertSame($this->engine->chainStart(7, 'alice', 'bob', self::NOW - 600), $game->getChain());
		$this->assertSame(['begin', 'save #7 rev 1→2', 'commit', 'notify inviteClosed(#7)', 'notify inviteAccepted(#7, false)'], $this->log);
	}

	public function testAcceptDecidesColoursAndRating(): void {
		$this->store(GameBuilder::pending(['colorChoice' => 'b', 'timeControl' => 'corr:none']));
		$game = $this->invitations()->accept(7, 'bob');
		$this->assertSame(['bob', 'alice', 0, 'admin', null], [$game->getWhiteUid(), $game->getBlackUid(), $game->getRated(),
			$game->getUnratedReason(), $game->getDeadlineAt()]);

		$this->store(GameBuilder::pending(['colorChoice' => 'r']));
		$this->config['ratedEnabled'] = false;
		$game = $this->invitations()->accept(7, 'bob');
		$players = [$game->getWhiteUid(), $game->getBlackUid()];
		sort($players);
		$this->assertSame(['alice', 'bob'], $players);
		$this->assertSame([0, 'admin'], [$game->getRated(), $game->getUnratedReason()]);

		$this->store(GameBuilder::pending(['ratedRequested' => 0]));
		$game = $this->invitations()->accept(7, 'bob');
		$this->assertSame([0, null], [$game->getRated(), $game->getUnratedReason()], 'an unrated request keeps no reason');
	}

	public function testOnlyTheInviteeAcceptsOrDeclines(): void {
		$this->store(GameBuilder::pending());
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->accept(7, 'alice')));
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->decline(7, 'alice')));
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->accept(7, 'carol')));
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->accept(8, 'bob')));
		$this->allow['active'] = 'too_many_active';
		$this->assertSame(['too_many_active', 429, []], $this->apiError(fn () => $this->invitations()->accept(7, 'bob')));
		$this->store(GameBuilder::active());
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->accept(7, 'bob')));
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->decline(7, 'bob')));
		$this->assertSame([], $this->log);
	}

	public function testDecline(): void {
		$this->store(GameBuilder::pending());
		$game = $this->invitations()->decline(7, 'bob');
		$this->assertSame([Game::STATUS_DECLINED, self::NOW], [$game->getStatus(), $game->getFinishedAt()]);
		$this->assertSame(['begin', 'save #7 rev 1→2', 'commit', 'notify inviteClosed(#7)', 'notify inviteDeclined(#7)'], $this->log);
	}

	public function testCancel(): void {
		$this->store(GameBuilder::open());
		$game = $this->invitations()->cancel(7, 'alice');
		$this->assertSame([Game::STATUS_CANCELLED, self::NOW], [$game->getStatus(), $game->getFinishedAt()]);
		$this->assertSame(['begin', 'save #7 rev 1→2', 'commit', 'notify inviteClosed(#7)'], $this->log);
		$this->store(GameBuilder::pending());
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->cancel(7, 'bob')));
		$this->store(GameBuilder::active());
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->cancel(7, 'alice')));
	}

	public function testJoinChecks(): void {
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->join(7, 'carol')));
		$this->store(GameBuilder::open());
		$this->assertSame(['own_challenge', 400, []], $this->apiError(fn () => $this->invitations()->join(7, 'alice')));
		$this->allow['seeOpen'] = false;
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->join(7, 'carol')));
		$this->allow['seeOpen'] = true;
		$this->allow['active'] = 'too_many_active';
		$this->assertSame(['too_many_active', 429, []], $this->apiError(fn () => $this->invitations()->join(7, 'carol')));
		$this->store(GameBuilder::pending());
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->join(7, 'alice')));
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->join(7, 'carol')), 'a taken challenge cannot be probed');
		$this->assertSame([], $this->log);
	}

	public function testJoinAnExpiredChallenge(): void {
		$this->store(GameBuilder::open(['expiresAt' => self::NOW]));
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->join(7, 'carol')));
		$this->assertSame([Game::STATUS_EXPIRED, self::NOW], [$this->stored[7]->getStatus(), $this->stored[7]->getFinishedAt()]);
		$this->assertSame(['begin', 'save #7 rev 1→2', 'commit', 'notify inviteClosed(#7)'], $this->log);
	}

	public function testJoin(): void {
		$this->store(GameBuilder::open(['colorChoice' => 'w', 'ratedRequested' => 0]));
		$game = $this->invitations()->join(7, 'carol');
		$this->assertSame([Game::STATUS_ACTIVE, 'carol', 'alice', 'carol'], [$game->getStatus(), $game->getOpponentUid(), $game->getWhiteUid(), $game->getBlackUid()]);
		$this->assertSame(['begin', 'save #7 rev 1→2', 'commit', 'notify inviteAccepted(#7, true)'], $this->log);
	}

	public function testJoinThatLosesTheRace(): void {
		$this->store(GameBuilder::open());
		$this->updateOk = false;
		$this->assertSame(['already_taken', 409, []], $this->apiError(fn () => $this->invitations()->join(7, 'carol')));
		$this->assertSame(['begin', 'conflict #7', 'rollback'], $this->log);
	}

	public function testRematchOffer(): void {
		$this->store(GameBuilder::finished(['ratedRequested' => 1, 'timeControl' => 'corr:7d']));
		$game = $this->invitations()->rematch(7, 'bob');
		$this->assertSame(['bob', 'alice', 'w', Game::STATUS_PENDING, 1, 1, 'corr:7d', self::NOW + 86400, 7],
			[$game->getCreatorUid(), $game->getOpponentUid(), $game->getColorChoice(), $game->getStatus(), $game->getRev(),
				$game->getRatedRequested(), $game->getTimeControl(), $game->getExpiresAt(), $game->getRematchOf()]);
		$this->assertSame(100, $this->stored[7]->getRematchId());
		$this->assertSame(['begin', 'insert game #100', 'chat #7 rematch_offered {"color":"b"}', 'save #7 rev 5→6', 'commit',
			'notify invite(#100)'], $this->log);
	}

	public function testRematchIsIdempotent(): void {
		$this->store(GameBuilder::finished(['rematchId' => 8]), GameBuilder::pending(['id' => 8, 'creatorUid' => 'bob', 'opponentUid' => 'alice']));
		$this->assertSame(8, $this->invitations()->rematch(7, 'bob')->getId(), 'the requester gets the pending offer');
		$this->assertSame([], $this->log);
		$accepted = $this->invitations()->rematch(7, 'alice');
		$this->assertSame([8, Game::STATUS_ACTIVE], [$accepted->getId(), $accepted->getStatus()], 'the other player accepts it');
		$this->log = [];
		$this->assertSame(8, $this->invitations()->rematch(7, 'bob')->getId(), 'a running rematch is returned');
		$this->assertSame([], $this->log);
	}

	public function testRematchChecks(): void {
		$this->store(GameBuilder::active());
		$this->assertSame(['invalid_status', 409, []], $this->apiError(fn () => $this->invitations()->rematch(7, 'bob')));
		$this->assertSame(['not_found', 404, []], $this->apiError(fn () => $this->invitations()->rematch(7, 'carol')));
		$this->store(GameBuilder::finished(['blackUid' => null, 'opponentUid' => null]));
		$this->assertSame(['user_not_found', 404, []], $this->apiError(fn () => $this->invitations()->rematch(7, 'alice')));
		$this->store(GameBuilder::finished());
		$this->allow['limits'] = 'too_many_invitations';
		$this->assertSame(['too_many_invitations', 429, []], $this->apiError(fn () => $this->invitations()->rematch(7, 'alice')));
		$this->assertSame([], $this->log);
	}

	public function testSimultaneousRematchRequestsAreIdempotent(): void {
		$this->store(GameBuilder::finished(), GameBuilder::pending(['id' => 8, 'creatorUid' => 'bob', 'opponentUid' => 'alice']));
		// bob's first request loses the race against his own second request, which created game 8 meanwhile
		$this->updateOk = false;
		$this->onConflict = fn () => $this->stored[7]->setRematchId(8);
		$this->assertSame(8, $this->invitations()->rematch(7, 'bob')->getId());
	}

	/**
	 * @param list<string> $names
	 * @return array<string, mixed>
	 */
	private function fields(Game $game, array $names): array {
		$fields = [];
		foreach ($names as $name) {
			$fields[$name] = $game->{'get' . ucfirst($name)}();
		}
		return $fields;
	}
}
