<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Engine\Internal;

/**
 * Roll display (ENGINE-RULES §9.4): the half-open interval of every outcome and the roll, printed by truncation in
 * integer arithmetic. Mirrors src/engine/roll.js.
 *
 * @internal
 */
final class RollDisplay {
	private const DEFAULT_LABELS = ['miss' => 'Missed', 'move' => 'Moved', 'capture' => 'Captured', 'rolled' => 'rolled', 'forced' => 'forced'];

	/**
	 * dec_d(x): floor(x · 10^d / 2^24) printed with d decimals (truncation, never rounding).
	 */
	public static function decimal(int $x, int $d): string {
		$scale = 10 ** $d;
		$v = intdiv($x * $scale, Tables::T);
		$ip = intdiv($v, $scale);
		return (string)$ip . '.' . str_pad((string)($v - $ip * $scale), $d, '0', STR_PAD_LEFT);
	}

	private static function value(int $x, int $d): int {
		return intdiv($x * 10 ** $d, Tables::T);
	}

	/**
	 * Read and check a measurement record's outcomes and roll.
	 *
	 * @param array<string, mixed> $record
	 * @return array{0: list<array{key: string, weight: int}>, 1: string, 2: int|null}
	 */
	private static function read(array $record): array {
		$outcomes = $record['outcomes'] ?? null;
		if (!is_array($outcomes) || $outcomes === []) {
			throw new \InvalidArgumentException('a measurement record needs outcomes');
		}
		$list = [];
		$sum = 0;
		foreach ($outcomes as $o) {
			if (!is_array($o) || !is_string($o['key'] ?? null) || !is_int($o['weight'] ?? null) || $o['weight'] < 0) {
				throw new \InvalidArgumentException('outcomes must be {key, weight} with integer weights');
			}
			$sum += $o['weight'];
			$list[] = ['key' => $o['key'], 'weight' => $o['weight']];
		}
		if ($sum > Tables::T) {
			throw new \InvalidArgumentException('outcome weights exceed 2^24');
		}
		$key = $record['key'] ?? null;
		if (!is_string($key)) {
			throw new \InvalidArgumentException('a measurement record needs its key');
		}
		$u = $record['u'] ?? null;
		if ($u !== null && (!is_int($u) || $u < 0 || $u >= Tables::T)) {
			throw new \InvalidArgumentException('u must be null or an integer 0 ≤ u < 2^24');
		}
		return [$list, $key, $u];
	}

	/**
	 * Structured roll display: the decimals, every interval and the roll.
	 *
	 * @param array<string, mixed> $record measurement record
	 * @return array{decimals: int, intervals: list<array{key: string, start: int, end: int, startText: string, endText: string, chosen: bool}>, u: int|null, uText: string|null, chosen: string}
	 */
	public static function intervals(array $record): array {
		[$outcomes, $key, $u] = self::read($record);
		$bounds = [0];
		foreach ($outcomes as $i => $o) {
			$bounds[] = $bounds[$i] + $o['weight'];
		}
		$j = -1;
		foreach ($outcomes as $i => $o) {
			if ($o['key'] === $key) {
				$j = $i;
				break;
			}
		}
		$d = 4;
		$count = count($bounds);
		for ($i = 1; $i < $count; $i++) {
			if (!(self::value($bounds[$i - 1], 4) < self::value($bounds[$i], 4))) {
				$d = 8;
			}
		}
		if ($u !== null && $j >= 0 && !(self::value($u, 4) < self::value($bounds[$j + 1], 4))) {
			$d = 8;
		}
		$intervals = [];
		foreach ($outcomes as $i => $o) {
			$intervals[] = [
				'key' => $o['key'],
				'start' => $bounds[$i],
				'end' => $bounds[$i + 1],
				'startText' => self::decimal($bounds[$i], $d),
				'endText' => self::decimal($bounds[$i + 1], $d),
				'chosen' => $i === $j,
			];
		}
		return [
			'decimals' => $d,
			'intervals' => $intervals,
			'u' => $u,
			'uText' => $u === null ? null : self::decimal($u, $d),
			'chosen' => $key,
		];
	}

	/**
	 * The text form of a roll, e.g. `Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved`.
	 * Labels default to the English words of the rules; pass translated `miss`, `move`, `capture`, `rolled` and
	 * `forced` labels for the UI. Measure keys (square names) are shown as they are.
	 *
	 * @param array<string, mixed> $record measurement record
	 * @param array<string, string> $labels label overrides
	 */
	public static function text(array $record, array $labels = []): string {
		$L = self::DEFAULT_LABELS;
		foreach ($labels as $k => $v) {
			if (is_string($v)) {
				$L[$k] = $v;
			}
		}
		$label = static fn (string $k): string => ($k === 'miss' || $k === 'move' || $k === 'capture') ? $L[$k] : $k;
		$r = self::intervals($record);
		$parts = [];
		foreach ($r['intervals'] as $x) {
			$parts[] = $label($x['key']) . ' [' . $x['startText'] . ', ' . $x['endText'] . ')';
		}
		$tail = $r['uText'] === null ? ' · ' . $L['forced'] . ' → ' : ' · ' . $L['rolled'] . ' ' . $r['uText'] . ' → ';
		return implode(' · ', $parts) . $tail . $label($r['chosen']);
	}
}
