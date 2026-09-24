<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

use OCP\IL10N;

/**
 * Why an LLM provider failed. The value is sent to the client as `upstream` and chooses the message it shows.
 */
enum UpstreamError: string {
	case InvalidKey = 'invalid_key';
	case ModelNotFound = 'model_not_found';
	case RateLimited = 'rate_limited';
	case QuotaExceeded = 'quota_exceeded';
	case Timeout = 'timeout';
	case Unreachable = 'unreachable';
	case BadResponse = 'bad_response';
	case Refused = 'refused';

	/** The message shown to the user. */
	public function message(IL10N $l): string {
		return match ($this) {
			self::InvalidKey => $l->t('The AI service did not accept the API key.'),
			self::ModelNotFound => $l->t('The AI service does not know this model.'),
			self::RateLimited => $l->t('The AI service is busy. Please try again in a moment.'),
			self::QuotaExceeded => $l->t('The AI service quota is used up.'),
			self::Timeout => $l->t('The AI service took too long to answer.'),
			self::Unreachable => $l->t('The AI service could not be reached.'),
			self::Refused => $l->t('The AI service declined to answer.'),
			self::BadResponse => $l->t('The AI service sent an answer that could not be read.'),
		};
	}
}
