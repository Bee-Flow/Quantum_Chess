<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\Db\ChatMessage;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\Move;
use OCA\QuantumChess\Engine\Engine;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IL10N;
use OCP\IUserManager;

/**
 * The data transfer objects of docs/SPEC.md §7.2.
 */
class GameSerializer {
	public const CHAT_OPEN_AFTER_END = 604800;
	private const KIND_NAMES = [ChatMessage::KIND_TEXT => 'text', ChatMessage::KIND_SYSTEM => 'system', ChatMessage::KIND_PHRASE => 'phrase'];

	/** @var array<string, ?string> */
	private array $names = [];
	/** @var array<string, ?array{rating: int, provisional: bool}> */
	private array $ratings = [];

	public function __construct(
		private IUserManager $userManager,
		private Engine $engine,
		private RatingService $ratingService,
		private SettingsService $settings,
		private ITimeFactory $time,
		private IL10N $l,
	) {
	}

	/** @return array{userId: ?string, displayName: string}|null */
	public function userRef(?string $uid): ?array {
		if ($uid === null) {
			return null;
		}
		if (!array_key_exists($uid, $this->names)) {
			$this->names[$uid] = $this->userManager->getDisplayName($uid);
		}
		$name = $this->names[$uid];
		if ($name === null) {
			return $this->deletedRef();
		}
		return ['userId' => $uid, 'displayName' => $name];
	}

	/** @return array{userId: null, displayName: string} */
	public function deletedRef(): array {
		return ['userId' => null, 'displayName' => $this->l->t('Deleted user')];
	}

	/**
	 * A player reference: null while the seat is empty, "Deleted user" when its account is gone.
	 *
	 * @return array{userId: ?string, displayName: string}|null
	 */
	private function seat(Game $game, ?string $uid, bool $expected): ?array {
		if ($uid === null) {
			return $expected ? $this->deletedRef() : null;
		}
		return $this->userRef($uid);
	}

	/** @return array<string, mixed> */
	public function summary(Game $game, string $viewer): array {
		$started = $game->getStartedAt() !== null;
		$myColor = $game->colorOf($viewer);
		$status = $game->getStatus();
		$result = $game->getResult();
		$winner = match ($result) {
			'1-0' => 'w',
			'0-1' => 'b',
			default => null,
		};
		$ratingChange = null;
		if ($status === Game::STATUS_FINISHED && $game->getRated() === 1 && $game->getRatingWDelta() !== null) {
			$ratingChange = ['w' => $game->getRatingWDelta(), 'b' => (int)$game->getRatingBDelta()];
		}
		return [
			'id' => $game->getId(),
			'status' => $status,
			'timeControl' => $game->getTimeControl(),
			'rated' => $game->getRated() === 1,
			'ratedRequested' => $game->getRatedRequested() === 1,
			'unratedReason' => $game->getUnratedReason(),
			'creator' => $this->seat($game, $game->getCreatorUid(), true),
			'opponent' => $this->seat($game, $game->getOpponentUid(), $started),
			'white' => $this->seat($game, $game->getWhiteUid(), $started),
			'black' => $this->seat($game, $game->getBlackUid(), $started),
			'colorChoice' => $game->getColorChoice(),
			'myColor' => $myColor,
			'yourTurn' => $status === Game::STATUS_ACTIVE && $myColor !== null && $myColor === $game->getTurn(),
			'turn' => $game->getTurn(),
			'ply' => $game->getPly(),
			'deadlineAt' => $game->getDeadlineAt(),
			'expiresAt' => $game->getExpiresAt(),
			'result' => $result,
			'resultReason' => $game->getResultReason(),
			'winner' => $winner,
			'ratingChange' => $ratingChange,
			'inviteMessage' => $game->getInviteMessage(),
			'scopeGroup' => $game->getScopeGroup(),
			'rematchOf' => $game->getRematchOf(),
			'rematchId' => $game->getRematchId(),
			'createdAt' => $game->getCreatedAt(),
			'updatedAt' => $game->getUpdatedAt(),
			'startedAt' => $game->getStartedAt(),
			'lastMoveAt' => $game->getLastMoveAt(),
			'finishedAt' => $game->getFinishedAt(),
			'preview' => $started ? $this->preview($game) : [],
			'rev' => $game->getRev(),
		];
	}

	/** @return list<array{0: int, 1: string, 2: int}> */
	public function preview(Game $game): array {
		try {
			$state = $this->engine->parseState($game->getState());
		} catch (\Throwable) {
			return [];
		}
		$cells = [];
		foreach ($this->engine->squareView($state) as $square => $cell) {
			if ($cell === null) {
				continue;
			}
			$letter = (string)$cell['type'];
			$cells[] = [$square, $cell['color'] === 'w' ? strtoupper($letter) : $letter, $this->engine->pct((int)$cell['weight'])];
		}
		return $cells;
	}

	/** @return array{rating: int, provisional: bool}|null */
	private function rating(?string $uid): ?array {
		if ($uid === null) {
			return null;
		}
		if (!array_key_exists($uid, $this->ratings)) {
			$row = $this->ratingService->get($uid);
			$this->ratings[$uid] = $row === null ? null : ['rating' => $row['rating'], 'provisional' => $row['provisional']];
		}
		return $this->ratings[$uid];
	}

	/** Draw offers are available again 3 own moves after a declined one (SPEC §8.5). */
	public static function drawAvailableAtPly(Game $game, string $color): ?int {
		$last = $color === 'w' ? $game->getLastDrawW() : $game->getLastDrawB();
		return $last === null ? null : $last + 6;
	}

	/** @return array<string, mixed> */
	public function live(Game $game, string $viewer): array {
		$dto = $this->summary($game, $viewer);
		$status = $game->getStatus();
		$color = $game->colorOf($viewer);
		$active = $status === Game::STATUS_ACTIVE && $color !== null;
		$drawAt = $color === null ? null : self::drawAvailableAtPly($game, $color);
		$offer = $game->getDrawOffer();
		$now = $this->time->getTime();
		$state = json_decode($game->getState(), true);
		$rematch = in_array($status, [Game::STATUS_FINISHED, Game::STATUS_ABORTED], true) && $color !== null
			&& $game->opponentOf($viewer) !== null;
		$chatOpen = $this->settings->chatEnabled() && ($status === Game::STATUS_ACTIVE
			|| (in_array($status, [Game::STATUS_FINISHED, Game::STATUS_ABORTED], true) && (int)$game->getFinishedAt() + self::CHAT_OPEN_AFTER_END >= $now));
		return $dto + [
			'state' => is_array($state) ? $state : null,
			'chain' => $game->getChain(),
			'drawOffer' => $offer === null ? null : ['by' => $offer, 'ply' => $game->getDrawOfferPly()],
			'canOfferDraw' => $active && $offer !== $color && ($drawAt === null || $game->getPly() >= $drawAt),
			'drawAvailableAtPly' => $drawAt !== null && $game->getPly() < $drawAt ? $drawAt : null,
			'canAbort' => $active && $game->getPly() < 2,
			'canResign' => $active,
			'canRematch' => $rematch,
			'ratings' => ['w' => $this->rating($game->getWhiteUid()), 'b' => $this->rating($game->getBlackUid())],
			'ratingBefore' => $game->getRatingWBefore() === null ? null : ['w' => $game->getRatingWBefore(), 'b' => $game->getRatingBBefore()],
			'muted' => $color !== null && ($color === 'w' ? $game->getMuteW() : $game->getMuteB()) === 1,
			'chatCount' => $game->getChatCount(),
			'chatOpen' => $chatOpen && $color !== null,
			'now' => $now,
		];
	}

	/**
	 * @param list<Move> $moves
	 * @param list<ChatMessage> $chat
	 * @return array<string, mixed>
	 */
	public function full(Game $game, string $viewer, array $moves, array $chat): array {
		$start = $game->getStartState();
		return $this->live($game, $viewer) + [
			'startState' => $start === null ? null : json_decode($start, true),
			'moves' => array_map(fn (Move $m) => $this->move($m), $moves),
			'chat' => array_map(fn (ChatMessage $c) => $this->chat($c, $viewer), $chat),
		];
	}

	/** @return array<string, mixed> */
	public function move(Move $move): array {
		return [
			'ply' => $move->getPly(),
			'color' => $move->getColor(),
			'userId' => $move->getUid(),
			'code' => $move->getCode(),
			'notation' => $move->getNotation(),
			'measurement' => $move->getMeasurementRecord(),
			'chain' => $move->getChain(),
			'stateHash' => $move->getStateHash(),
			'createdAt' => $move->getCreatedAt(),
		];
	}

	/** @return array<string, mixed> */
	public function chat(ChatMessage $message, string $viewer): array {
		$uid = $message->getUid();
		$params = $message->getParams();
		$kind = $message->getKind();
		return [
			'id' => $message->getId(),
			'kind' => self::KIND_NAMES[$kind] ?? 'text',
			'userId' => $uid,
			'displayName' => $uid === null ? ($kind === ChatMessage::KIND_SYSTEM ? null : $this->l->t('Deleted user')) : ($this->userRef($uid)['displayName'] ?? null),
			'message' => $message->getMessage(),
			'params' => $params === null ? null : json_decode($params, true),
			'createdAt' => $message->getCreatedAt(),
		];
	}

	/**
	 * @param array<string, list<Game>> $groups
	 * @return array<string, mixed>
	 */
	public function lobby(array $groups, string $viewer, string $token): array {
		$dto = ['rev' => $token, 'now' => $this->time->getTime()];
		foreach (['yourTurn', 'waiting', 'invitations', 'outgoing', 'open', 'recent'] as $key) {
			$dto[$key] = array_map(fn (Game $g) => $this->summary($g, $viewer), $groups[$key] ?? []);
		}
		$dto['counts'] = ['yourTurn' => count($groups['yourTurn'] ?? []), 'invitations' => count($groups['invitations'] ?? [])];
		return $dto;
	}
}
