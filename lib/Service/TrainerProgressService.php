<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Exception\ApiException;
use OCP\Config\IUserConfig;
use OCP\IL10N;

/**
 * The trainer progress document with the server-side merge of docs/SPEC.md §14.8.4 (identical to
 * src/trainer/progress.js): commutative and idempotent, unknown keys kept (the incoming value wins).
 */
class TrainerProgressService {
	public const MAX_BYTES = 65536;
	public const KEY = 'trainer_progress';

	public function __construct(
		private IUserConfig $config,
		private IL10N $l,
	) {
	}

	/** @return array<string, mixed> */
	public function get(string $uid): array {
		$stored = json_decode($this->config->getValueString($uid, Application::APP_ID, self::KEY, '{}', true), true);
		return is_array($stored) ? $stored : [];
	}

	/**
	 * @param array<array-key, mixed> $incoming
	 * @return array<string, mixed>
	 */
	public function merge(string $uid, array $incoming): array {
		if ($incoming !== [] && array_is_list($incoming)) {
			throw new ApiException('invalid_argument', $this->l->t('The progress must be an object.'), 400, ['field' => 'progress']);
		}
		$merged = self::mergeDocs($this->get($uid), $incoming);
		$json = json_encode((object)$merged, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		if ($json === false) {
			throw new ApiException('invalid_argument', $this->l->t('The progress must be an object.'), 400, ['field' => 'progress']);
		}
		if (strlen($json) > self::MAX_BYTES) {
			throw new ApiException('too_large', $this->l->t('The progress document is too large.'), 413);
		}
		$this->config->setValueString($uid, Application::APP_ID, self::KEY, $json, true);
		return $merged;
	}

	private static function earliest(mixed $a, mixed $b): mixed {
		if (!is_numeric($a)) {
			return is_numeric($b) ? $b : null;
		}
		if (!is_numeric($b)) {
			return $a;
		}
		return min($a, $b);
	}

	private static function max(mixed $a, mixed $b): mixed {
		if (!is_numeric($a)) {
			return is_numeric($b) ? $b : $a;
		}
		return is_numeric($b) ? max($a, $b) : $a;
	}

	/**
	 * @param array<string, mixed> $a
	 * @param array<string, mixed> $b
	 * @param array<string, string> $rules field => or|max|earliest
	 * @return array<string, mixed>
	 */
	private static function mergeEntry(array $a, array $b, array $rules): array {
		$out = $a;
		foreach ($b as $k => $v) {
			$out[$k] = $v;
		}
		foreach ($rules as $field => $rule) {
			if (!array_key_exists($field, $a) && !array_key_exists($field, $b)) {
				continue;
			}
			$x = $a[$field] ?? null;
			$y = $b[$field] ?? null;
			$out[$field] = match ($rule) {
				'or' => (bool)$x || (bool)$y,
				'max' => self::max($x, $y),
				default => self::earliest($x, $y),
			};
		}
		return $out;
	}

	/**
	 * @param array<string, mixed> $a
	 * @param array<string, mixed> $b
	 * @param array<string, string> $rules
	 * @return array<string, mixed>
	 */
	private static function mergeMap(mixed $a, mixed $b, array $rules): array {
		$a = is_array($a) ? $a : [];
		$b = is_array($b) ? $b : [];
		$out = [];
		foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $id) {
			$x = is_array($a[$id] ?? null) ? $a[$id] : [];
			$y = is_array($b[$id] ?? null) ? $b[$id] : [];
			$out[$id] = self::mergeEntry($x, $y, $rules);
		}
		ksort($out);
		return $out;
	}

	private static function mergeCounters(mixed $a, mixed $b): mixed {
		if (is_array($a) && is_array($b)) {
			$out = $a;
			foreach ($b as $k => $v) {
				$out[$k] = array_key_exists($k, $a) ? self::mergeCounters($a[$k], $v) : $v;
			}
			ksort($out);
			return $out;
		}
		if (is_numeric($a) && is_numeric($b)) {
			return max($a, $b);
		}
		return $b ?? $a;
	}

	/**
	 * @param array<string, mixed> $a
	 * @param array<string, mixed> $b
	 * @return array<string, mixed>
	 */
	public static function mergeDocs(array $a, array $b): array {
		$out = $a;
		foreach ($b as $k => $v) {
			$out[$k] = $v;
		}
		if (isset($a['lessons']) || isset($b['lessons'])) {
			$out['lessons'] = self::mergeMap($a['lessons'] ?? [], $b['lessons'] ?? [], ['done' => 'or', 'stars' => 'max', 'at' => 'earliest']);
		}
		if (isset($a['puzzles']) || isset($b['puzzles'])) {
			$out['puzzles'] = self::mergeMap($a['puzzles'] ?? [], $b['puzzles'] ?? [],
				['solved' => 'or', 'stars' => 'max', 'tries' => 'max', 'hints' => 'max', 'at' => 'earliest']);
		}
		if (isset($a['achievements']) || isset($b['achievements'])) {
			$x = is_array($a['achievements'] ?? null) ? $a['achievements'] : [];
			$y = is_array($b['achievements'] ?? null) ? $b['achievements'] : [];
			$ach = [];
			foreach (array_unique(array_merge(array_keys($x), array_keys($y))) as $id) {
				$ach[$id] = self::earliest($x[$id] ?? null, $y[$id] ?? null);
			}
			ksort($ach);
			$out['achievements'] = $ach;
		}
		if (isset($a['counters']) || isset($b['counters'])) {
			$out['counters'] = self::mergeCounters($a['counters'] ?? [], $b['counters'] ?? []);
		}
		if (isset($a['xp']) || isset($b['xp'])) {
			$out['xp'] = self::max($a['xp'] ?? null, $b['xp'] ?? null);
		}
		if (is_array($a['streak'] ?? null) && is_array($b['streak'] ?? null)) {
			$sa = $a['streak'];
			$sb = $b['streak'];
			$la = $sa['last'] ?? null;
			$lb = $sb['last'] ?? null;
			$cmp = is_numeric($la) && is_numeric($lb) ? $lb <=> $la : strcmp((string)$lb, (string)$la);
			$later = $cmp >= 0 ? $sb : $sa;
			$later['best'] = self::max($sa['best'] ?? null, $sb['best'] ?? null);
			$out['streak'] = $later;
		}
		ksort($out);
		return $out;
	}
}
