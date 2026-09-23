<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Ai;

use OCP\IMemcache;

/**
 * An in-memory IMemcache for unit tests.
 */
final class ArrayMemcache implements IMemcache {
	/** @var array<string, mixed> */
	public array $data = [];

	public function get($key) {
		return $this->data[$key] ?? null;
	}

	public function set($key, $value, $ttl = 0) {
		$this->data[$key] = $value;
		return true;
	}

	public function hasKey($key) {
		return array_key_exists($key, $this->data);
	}

	public function remove($key) {
		unset($this->data[$key]);
		return true;
	}

	public function clear($prefix = '') {
		$this->data = [];
		return true;
	}

	public static function isAvailable(): bool {
		return true;
	}

	public function add($key, $value, $ttl = 0) {
		if ($this->hasKey($key)) {
			return false;
		}
		$this->data[$key] = $value;
		return true;
	}

	public function inc($key, $step = 1) {
		$this->data[$key] = (int)($this->data[$key] ?? 0) + $step;
		return $this->data[$key];
	}

	public function dec($key, $step = 1) {
		$this->data[$key] = (int)($this->data[$key] ?? 0) - $step;
		return $this->data[$key];
	}

	public function cas($key, $old, $new) {
		if (($this->data[$key] ?? null) === $old) {
			$this->data[$key] = $new;
			return true;
		}
		return false;
	}

	public function cad($key, $old) {
		if (($this->data[$key] ?? null) === $old) {
			unset($this->data[$key]);
			return true;
		}
		return false;
	}

	public function ncad(string $key, mixed $old): bool {
		if (($this->data[$key] ?? null) !== $old) {
			unset($this->data[$key]);
			return true;
		}
		return false;
	}
}
