<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Controller;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * The base of the app's JSON controllers: runs an action for the logged-in user and turns its result or its error
 * into the response.
 *
 * An ApiException becomes `{"error": <code>, "message": <text>, ...extra}` with the status of its code. Any other
 * exception is logged and answers `500 {"error": "internal"}`, without details. The routes are documented in
 * docs/development/api.md.
 */
abstract class ApiController extends Controller {
	/** The largest request body that the settings and LLM routes accept, in bytes. */
	public const MAX_BODY = 65536;

	public function __construct(
		IRequest $request,
		protected readonly IL10N $l,
		protected readonly LoggerInterface $logger,
		protected readonly ?string $userId,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Runs `$action` for the logged-in user and answers with its result.
	 *
	 * @param callable(string): (array|JSONResponse) $action receives the user id
	 * @param Http::STATUS_* $status the status of a successful answer
	 */
	protected function respond(callable $action, int $status = Http::STATUS_OK): JSONResponse {
		try {
			if ($this->userId === null) {
				// The framework only lets logged-in users through; this keeps the user id non-null for the actions.
				throw ApiException::notFound('Not logged in');
			}
			$result = $action($this->userId);
			return $result instanceof JSONResponse ? $result : new JSONResponse($result, $status);
		} catch (ApiException $e) {
			return $e->toResponse();
		} catch (\Throwable $e) {
			$this->logger->error($e->getMessage(), ['exception' => $e]);
			return new JSONResponse(['error' => ApiError::Internal->value, 'message' => 'Internal error'], ApiError::Internal->status());
		}
	}

	/**
	 * Like respond(), but refuses a request body larger than MAX_BODY.
	 *
	 * @param callable(string): (array|JSONResponse) $action receives the user id
	 */
	protected function respondWithSizeLimit(callable $action): JSONResponse {
		return $this->respond(function (string $uid) use ($action): array|JSONResponse {
			if ((int)$this->request->getHeader('Content-Length') > self::MAX_BODY) {
				throw ApiException::tooLarge($this->l->t('The request is too large.'));
			}
			return $action($uid);
		});
	}

	/**
	 * The fields the client sent, without the framework's own parameters (such as `_route`).
	 *
	 * @return array<string, mixed>
	 */
	protected function bodyParams(): array {
		$body = [];
		foreach ($this->request->getParams() as $key => $value) {
			if (is_string($key) && !str_starts_with($key, '_')) {
				$body[$key] = $value;
			}
		}
		return $body;
	}

	/**
	 * The fields of `$keys` that the client sent. Any other field is refused.
	 *
	 * @param list<string> $keys
	 * @return array<string, mixed>
	 * @throws ApiException invalid_argument naming the first unknown field
	 */
	protected function requestBody(array $keys): array {
		$params = $this->request->getParams();
		$body = [];
		foreach ($keys as $key) {
			if (array_key_exists($key, $params)) {
				$body[$key] = $params[$key];
			}
		}
		foreach (array_keys($this->bodyParams()) as $key) {
			if (!in_array($key, $keys, true)) {
				throw ApiException::invalidArgument($key, $this->l->t('Invalid value'));
			}
		}
		return $body;
	}
}
