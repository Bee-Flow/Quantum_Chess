<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Exception;

use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCA\QuantumChess\Exception\GameConflictException;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The error codes of the API and their statuses.
 */
#[CoversClass(ApiError::class)]
#[CoversClass(ApiException::class)]
#[CoversClass(GameConflictException::class)]
final class ApiExceptionTest extends TestCase {
	public function testEveryCodeHasItsStatus(): void {
		$statuses = [];
		foreach (ApiError::cases() as $error) {
			$statuses[$error->value] = $error->status();
		}
		ksort($statuses);
		$this->assertSame([
			'abort_not_allowed' => 409, 'ai_busy' => 429, 'ai_rate_limited' => 429, 'ai_unavailable' => 403, 'already_taken' => 409,
			'chat_closed' => 409, 'chat_disabled' => 403, 'conflict' => 409, 'draw_not_allowed' => 409, 'game_over' => 409,
			'illegal_move' => 400, 'internal' => 500, 'invalid_argument' => 400, 'invalid_state' => 400, 'invalid_status' => 409,
			'multiplayer_disabled' => 403, 'no_draw_offer' => 409, 'not_found' => 404, 'not_your_turn' => 403,
			'open_challenges_disabled' => 403, 'own_challenge' => 400, 'rated_needs_deadline' => 400, 'rated_not_allowed' => 400,
			'too_large' => 413, 'too_many_active' => 429, 'too_many_invitations' => 429, 'too_many_open' => 429, 'upstream' => 502,
			'url_not_allowed' => 400, 'user_not_found' => 404,
		], $statuses);
	}

	public function testNamedConstructors(): void {
		$invalid = ApiException::invalidArgument('color', 'Invalid colour');
		$this->assertSame(['invalid_argument', 400, 'Invalid colour', ['field' => 'color']],
			[$invalid->getErrorCode(), $invalid->getStatus(), $invalid->getMessage(), $invalid->getExtra()]);
		$this->assertSame([404, 413], [ApiException::notFound('x')->getStatus(), ApiException::tooLarge('x')->getStatus()]);
		$this->assertSame(['invalid_status', 'game_over'], [ApiException::invalidStatus('x')->getErrorCode(), ApiException::gameOver('x')->getErrorCode()]);
		$conflict = (new GameConflictException('Changed'))->withExtra(['game' => ['id' => 7]]);
		$this->assertInstanceOf(GameConflictException::class, $conflict);
		$this->assertSame(['conflict', 409, ['game' => ['id' => 7]]], [$conflict->getErrorCode(), $conflict->getStatus(), $conflict->getExtra()]);
		$busy = (new ApiException(ApiError::AiBusy, 'Wait', [], 5))->withExtra(['reason' => 'busy']);
		$this->assertSame([ApiError::AiBusy, 5, ['reason' => 'busy']], [$busy->getError(), $busy->getRetryAfter(), $busy->getExtra()]);
	}
}
