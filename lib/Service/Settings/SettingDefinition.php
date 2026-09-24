<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Settings;

/**
 * The type, default and range of one admin setting.
 *
 * Types: `bool`, `int` (from `min` to `max`), `enum` (one of `values`), `text` (at most `maxLength` characters),
 * `groups` (group ids), `models` (model ids), `urls` (normalised base URLs) and `provider` (an LLM provider object).
 */
final class SettingDefinition {
	public const BOOL = 'bool';
	public const INT = 'int';
	public const ENUM = 'enum';
	public const TEXT = 'text';
	public const GROUPS = 'groups';
	public const MODELS = 'models';
	public const URLS = 'urls';
	public const PROVIDER = 'provider';

	/**
	 * @param bool|int|string|list<string> $default
	 * @param list<string> $values the allowed values of an enum setting
	 * @param bool $zeroDisables for an int setting: 0 is allowed below `min` and turns the feature off
	 * @param bool $lazy whether the value is stored as a lazy app config value, loaded only when read
	 */
	private function __construct(
		public readonly string $type,
		public readonly bool|int|string|array $default,
		public readonly int $min = 0,
		public readonly int $max = PHP_INT_MAX,
		public readonly array $values = [],
		public readonly int $maxLength = 0,
		public readonly bool $zeroDisables = false,
		public readonly bool $lazy = false,
	) {
	}

	public static function bool(bool $default): self {
		return new self(self::BOOL, $default);
	}

	public static function int(int $default, int $min, int $max, bool $zeroDisables = false): self {
		return new self(self::INT, $default, $min, $max, zeroDisables: $zeroDisables);
	}

	/**
	 * @param list<string> $values
	 */
	public static function enum(string $default, array $values): self {
		return new self(self::ENUM, $default, values: $values);
	}

	public static function text(int $maxLength): self {
		return new self(self::TEXT, '', maxLength: $maxLength, lazy: true);
	}

	public static function groups(): self {
		return new self(self::GROUPS, []);
	}

	public static function models(): self {
		return new self(self::MODELS, []);
	}

	public static function urls(): self {
		return new self(self::URLS, []);
	}

	public static function provider(): self {
		return new self(self::PROVIDER, [], lazy: true);
	}
}
