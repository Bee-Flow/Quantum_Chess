<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Exception;

use OCP\AppFramework\Http\JSONResponse;
use Psr\Log\LoggerInterface;

/**
 * An API error with a stable code (docs/SPEC.md Appendix A), a translated message, an HTTP status and optional extra
 * body fields. Every controller of the app answers errors through this class (SPEC §6.1, §7.1).
 */
class ApiException extends \RuntimeException {
	/**
	 * @param array<string, mixed> $extra
	 */
	public function __construct(
		private string $errorCode,
		string $message,
		private int $status = 400,
		private array $extra = [],
		private ?int $retryAfter = null,
	) {
		parent::__construct($message);
	}

	public function getErrorCode(): string {
		return $this->errorCode;
	}

	public function getStatus(): int {
		return $this->status;
	}

	/** @return array<string, mixed> */
	public function getExtra(): array {
		return $this->extra;
	}

	public function getRetryAfter(): ?int {
		return $this->retryAfter;
	}

	public function toResponse(): JSONResponse {
		$response = new JSONResponse(['error' => $this->errorCode, 'message' => $this->getMessage()] + $this->extra, $this->status);
		if ($this->retryAfter !== null) {
			$response->addHeader('Retry-After', (string)$this->retryAfter);
		}
		return $response;
	}

	public static function internal(\Throwable $e, LoggerInterface $logger): JSONResponse {
		$logger->error('Quantum Chess: ' . $e->getMessage(), ['exception' => $e, 'app' => 'quantumchess']);
		return new JSONResponse(['error' => 'internal', 'message' => 'Internal error'], 500);
	}
}
