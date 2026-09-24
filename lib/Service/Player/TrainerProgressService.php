<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Player;

use OCA\QuantumChess\Exception\ApiException;
use OCP\IL10N;

/**
 * The trainer progress of a user: lessons, puzzles, achievements, counters, experience points and the streak.
 *
 * The web app keeps the progress in the browser and synchronises it with the server. Both sides merge with the same
 * rules (the web app's `trainer/progress.js`), so merging is commutative and idempotent: a flag once set stays set,
 * scores keep their maximum, and dates keep their earliest value. Keys the server does not know are kept, and the
 * incoming value wins.
 */
class TrainerProgressService {
	/** The size limit of the encoded document. */
	public const MAX_BYTES = 65536;
	/** The user config key of the document. */
	public const KEY = 'trainer_progress';

	public function __construct(
		private readonly UserDocumentStore $documents,
		private readonly IL10N $l,
	) {
	}

	/** @return array<string, mixed> */
	public function get(string $uid): array {
		return $this->documents->get($uid, self::KEY);
	}

	/**
	 * Merges the client's progress into the stored progress.
	 *
	 * @param array<array-key, mixed> $incoming
	 * @return array<string, mixed> the merged progress
	 * @throws ApiException invalid_argument or too_large
	 */
	public function merge(string $uid, array $incoming): array {
		if ($incoming !== [] && array_is_list($incoming)) {
			throw $this->notAnObject();
		}
		$merged = self::mergeDocs($this->get($uid), $incoming);
		try {
			$this->documents->set($uid, self::KEY, $merged, self::MAX_BYTES);
		} catch (\JsonException) {
			throw $this->notAnObject();
		} catch (DocumentTooLargeException) {
			throw ApiException::tooLarge($this->l->t('The progress document is too large.'));
		}
		return $merged;
	}

	private function notAnObject(): ApiException {
		return ApiException::invalidArgument('progress', $this->l->t('The progress must be an object.'));
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
	 * Merges two entries of a lesson or puzzle map: `$b` wins, except for the fields that `$rules` merges.
	 *
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
	 * Merges two progress documents.
	 *
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
			$out['lessons'] = self::mergeMap(
				$a['lessons'] ?? [],
				$b['lessons'] ?? [],
				['done' => 'or', 'stars' => 'max', 'at' => 'earliest'],
			);
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
