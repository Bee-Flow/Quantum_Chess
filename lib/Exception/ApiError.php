<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Exception;

use OCP\AppFramework\Http;

/**
 * The error codes of the HTTP API.
 *
 * An error response carries the code as its `error` field, and the web app dispatches on it, so the values are part of
 * the public API and never change. Each code always comes with the same HTTP status.
 */
enum ApiError: string {
	// Requests in general
	case InvalidArgument = 'invalid_argument';
	case NotFound = 'not_found';
	case TooLarge = 'too_large';
	case Internal = 'internal';

	// Online games
	case MultiplayerDisabled = 'multiplayer_disabled';
	case OpenChallengesDisabled = 'open_challenges_disabled';
	case UserNotFound = 'user_not_found';
	case RatedNeedsDeadline = 'rated_needs_deadline';
	case RatedNotAllowed = 'rated_not_allowed';
	case TooManyOpen = 'too_many_open';
	case TooManyInvitations = 'too_many_invitations';
	case TooManyActive = 'too_many_active';
	case OwnChallenge = 'own_challenge';
	case AlreadyTaken = 'already_taken';
	case InvalidStatus = 'invalid_status';
	case Conflict = 'conflict';
	case GameOver = 'game_over';
	case NotYourTurn = 'not_your_turn';
	case IllegalMove = 'illegal_move';
	case AbortNotAllowed = 'abort_not_allowed';
	case DrawNotAllowed = 'draw_not_allowed';
	case NoDrawOffer = 'no_draw_offer';
	case ChatDisabled = 'chat_disabled';
	case ChatClosed = 'chat_closed';

	// LLM opponents and the coach
	case InvalidState = 'invalid_state';
	case AiUnavailable = 'ai_unavailable';
	case AiRateLimited = 'ai_rate_limited';
	case AiBusy = 'ai_busy';
	case UrlNotAllowed = 'url_not_allowed';
	case Upstream = 'upstream';

	/**
	 * The HTTP status of a response with this code.
	 *
	 * @return Http::STATUS_*
	 */
	public function status(): int {
		return match ($this) {
			self::InvalidArgument, self::RatedNeedsDeadline, self::RatedNotAllowed, self::OwnChallenge, self::IllegalMove,
			self::InvalidState, self::UrlNotAllowed => Http::STATUS_BAD_REQUEST,
			self::MultiplayerDisabled, self::OpenChallengesDisabled, self::NotYourTurn, self::ChatDisabled,
			self::AiUnavailable => Http::STATUS_FORBIDDEN,
			self::NotFound, self::UserNotFound => Http::STATUS_NOT_FOUND,
			self::AlreadyTaken, self::InvalidStatus, self::Conflict, self::GameOver, self::AbortNotAllowed,
			self::DrawNotAllowed, self::NoDrawOffer, self::ChatClosed => Http::STATUS_CONFLICT,
			self::TooLarge => Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
			self::TooManyOpen, self::TooManyInvitations, self::TooManyActive, self::AiRateLimited,
			self::AiBusy => Http::STATUS_TOO_MANY_REQUESTS,
			self::Internal => Http::STATUS_INTERNAL_SERVER_ERROR,
			self::Upstream => Http::STATUS_BAD_GATEWAY,
		};
	}
}
