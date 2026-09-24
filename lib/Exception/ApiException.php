<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Exception;

use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;

/**
 * An error the API reports to the client.
 *
 * The response body is `{"error": <code>, "message": <text>, ...extra}` with the status of the error code, plus a
 * `Retry-After` header when the exception names a delay. The message is shown to the user, so services pass it
 * translated.
 */
class ApiException extends \RuntimeException {
	/**
	 * @param array<string, mixed> $extra additional fields of the response body
	 * @param int|null $retryAfter seconds the client should wait before it tries again
	 */
	public function __construct(
		private readonly ApiError $error,
		string $message,
		private readonly array $extra = [],
		private readonly ?int $retryAfter = null,
	) {
		parent::__construct($message);
	}

	/**
	 * A request field has a value the API does not accept.
	 */
	public static function invalidArgument(string $field, string $message): self {
		return new self(ApiError::InvalidArgument, $message, ['field' => $field]);
	}

	/**
	 * The object does not exist or the user may not see it.
	 */
	public static function notFound(string $message): self {
		return new self(ApiError::NotFound, $message);
	}

	/**
	 * The action does not fit the current status of the object, for example accepting a game that already started.
	 */
	public static function invalidStatus(string $message): self {
		return new self(ApiError::InvalidStatus, $message);
	}

	/**
	 * The game has ended, so it takes no more moves or offers.
	 */
	public static function gameOver(string $message): self {
		return new self(ApiError::GameOver, $message);
	}

	/**
	 * The request or the document it stores exceeds its size limit.
	 */
	public static function tooLarge(string $message): self {
		return new self(ApiError::TooLarge, $message);
	}

	/**
	 * The same error with other extra fields.
	 *
	 * @param array<string, mixed> $extra
	 */
	public function withExtra(array $extra): self {
		return new self($this->error, $this->getMessage(), $extra, $this->retryAfter);
	}

	public function getError(): ApiError {
		return $this->error;
	}

	/**
	 * The error code, for example `not_found`.
	 */
	public function getErrorCode(): string {
		return $this->error->value;
	}

	/** @return Http::STATUS_* */
	public function getStatus(): int {
		return $this->error->status();
	}

	/** @return array<string, mixed> */
	public function getExtra(): array {
		return $this->extra;
	}

	public function getRetryAfter(): ?int {
		return $this->retryAfter;
	}

	public function toResponse(): JSONResponse {
		$response = new JSONResponse(
			['error' => $this->getErrorCode(), 'message' => $this->getMessage()] + $this->extra,
			$this->getStatus(),
		);
		if ($this->retryAfter !== null) {
			$response->addHeader('Retry-After', (string)$this->retryAfter);
		}
		return $response;
	}
}
