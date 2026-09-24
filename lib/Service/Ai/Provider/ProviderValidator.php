<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

use OCA\QuantumChess\Exception\ApiError;
use OCA\QuantumChess\Exception\ApiException;
use OCP\IL10N;

/**
 * Checks a provider that an administrator or a user wants to configure.
 *
 * The preset decides the API and, for hosted services, the base URL. Other base URLs must pass UrlGuard.
 */
class ProviderValidator {
	public function __construct(
		private readonly UrlGuard $urlGuard,
		private readonly IL10N $l,
	) {
	}

	/**
	 * The provider described by `$value` (`preset`, `baseUrl`, `model`).
	 *
	 * @param string $field the request field that errors name
	 * @param array<array-key, mixed> $value
	 * @param 'shared'|'personal' $scope who configures the provider
	 * @param bool $sharedAllowLocal whether the organisation provider may use a local address
	 * @param list<string> $allowlist the local addresses personal providers may use
	 * @throws ApiException invalid_argument or url_not_allowed
	 */
	public function validate(
		string $field,
		array $value,
		string $scope,
		bool $sharedAllowLocal,
		array $allowlist,
	): ProviderConfig {
		$presetId = $value['preset'] ?? null;
		if (!is_string($presetId) || !Presets::exists($presetId)) {
			throw $this->invalid($field);
		}
		$preset = Presets::get($presetId);
		$model = $value['model'] ?? '';
		if (!is_string($model) || ($model !== '' && !self::isValidModel($model))) {
			throw $this->invalid($field);
		}
		if ($preset['fixedUrl']) {
			$baseUrl = $preset['baseUrl'];
		} else {
			$url = $value['baseUrl'] ?? '';
			if (!is_string($url) || trim($url) === '') {
				throw $this->invalid($field);
			}
			try {
				$baseUrl = $this->urlGuard->check($url, $scope, $sharedAllowLocal, $allowlist)['url'];
			} catch (UrlNotAllowedException $e) {
				throw new ApiException(
					ApiError::UrlNotAllowed,
					$this->urlMessage($e->getMessage()),
					['field' => $field],
				);
			}
		}
		return new ProviderConfig($presetId, ProviderKind::from($preset['kind']), $baseUrl, $model);
	}

	/** Whether a model id is acceptable: letters, digits and `._:/@+-`, at most 128 characters. */
	public static function isValidModel(string $model): bool {
		return preg_match('/^[A-Za-z0-9][A-Za-z0-9._:\/@+-]{0,127}$/', $model) === 1;
	}

	/**
	 * The message that explains why UrlGuard refused an address.
	 *
	 * @param string $reason the UrlNotAllowedException message: `invalid`, `https_required` or `local`
	 */
	public function urlMessage(string $reason): string {
		return match ($reason) {
			'https_required' => $this->l->t('The address must start with https://.'),
			'local' => $this->l->t(
				'This local address is not allowed. Ask your administrator to add it to the list of allowed local servers.',
			),
			default => $this->l->t('This is not a valid server address.'),
		};
	}

	private function invalid(string $field): ApiException {
		return ApiException::invalidArgument($field, $this->l->t('Invalid value'));
	}
}
