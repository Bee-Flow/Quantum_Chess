<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Engine;

use OCA\QuantumChess\Engine\Engine;

/**
 * Loads the parity fixtures of tests/fixtures/engine and offers the comparisons the replay needs.
 */
final class FixtureLoader {
	public const DIR = __DIR__ . '/../../../fixtures/engine';

	/** @var array<string, mixed> */
	private static array $cache = [];

	/**
	 * Decoded fixture file (cached per process).
	 */
	public static function load(string $name): mixed {
		if (!array_key_exists($name, self::$cache)) {
			$text = file_get_contents(self::DIR . '/' . $name);
			if ($text === false) {
				throw new \RuntimeException('missing fixture ' . $name);
			}
			self::$cache[$name] = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
		}
		return self::$cache[$name];
	}

	/**
	 * The game fixture files (games-NNN.json), sorted.
	 *
	 * @return list<string>
	 */
	public static function gameFiles(): array {
		$files = glob(self::DIR . '/games-*.json') ?: [];
		sort($files, SORT_STRING);
		return array_map('basename', $files);
	}

	/**
	 * Decode a canonical state JSON string.
	 *
	 * @return array<string, mixed>
	 */
	public static function state(string $json): array {
		/** @var array<string, mixed> */
		return json_decode($json, true, 64, JSON_THROW_ON_ERROR);
	}

	/**
	 * Numbers as floats, recursively: fixtures store exact dyadic floats that JSON may print as integers (`1`), and
	 * the PHP engine returns probabilities as floats.
	 */
	public static function numbersAsFloats(mixed $x): mixed {
		if (is_array($x)) {
			return array_map([self::class, 'numbersAsFloats'], $x);
		}
		if (is_int($x)) {
			return (float)$x;
		}
		return $x;
	}

	/**
	 * Replay one game fixture with the procedure of tests/fixtures/README.md. Returns a list of failures (empty
	 * when the game replays byte-identically).
	 *
	 * @param array<string, mixed> $game
	 * @return list<string>
	 */
	public static function replay(Engine $engine, array $game): array {
		$fail = [];
		$name = (string)$game['name'];
		$s = self::state((string)$game['start']);
		if ($engine->serializeState($engine->validateState($s)) !== $game['start']) {
			return [$name . ': start is not a canonical valid state'];
		}
		if ($game['setup'] !== null && $engine->serializeState($engine->setupPosition($game['setup'])) !== $game['start']) {
			$fail[] = $name . ': setupPosition does not give start';
		}
		foreach ($game['steps'] as $i => $step) {
			$where = $name . ' step ' . $i . ' ' . $step['code'];
			if ($engine->legalCodes($s) !== $step['legal']) {
				$fail[] = $where . ': legal list differs';
				break;
			}
			$r = $engine->applyMove($s, $step['code'], $step['outcome'] === null ? $step['u'] : null, $step['outcome']);
			$after = $engine->serializeState($r['state']);
			if ($after !== $step['after']) {
				$fail[] = $where . ": state differs\n  php " . $after . "\n  js  " . $step['after'];
				break;
			}
			if (json_encode($r['measurement'], JSON_UNESCAPED_SLASHES) !== json_encode($step['measurement'], JSON_UNESCAPED_SLASHES)) {
				$fail[] = $where . ': measurement differs ' . json_encode($r['measurement']);
			}
			$notation = $engine->moveNotation($s, $step['code'], $r['measurement']);
			if ($notation !== $step['notation']) {
				$fail[] = $where . ': notation ' . $notation . ' vs ' . $step['notation'];
			}
			if ($engine->positionHash($r['state']) !== $step['hash']) {
				$fail[] = $where . ': hash differs';
			}
			$views = [
				'kd' => [$engine->kingDanger($r['state'], 'w'), $engine->kingDanger($r['state'], 'b')],
				'budget' => [$engine->budget($r['state'], 'w'), $engine->budget($r['state'], 'b')],
				'worlds' => $engine->worldCount($r['state']),
				'links' => $engine->links($r['state']),
				'trapped' => $engine->kingTrapped($r['state']),
			];
			if ($views !== $step['views']) {
				$fail[] = $where . ': views ' . json_encode($views) . ' vs ' . json_encode($step['views']);
			}
			// The next input is the fixture's own bytes (not our result), exactly as the README says.
			$s = self::state((string)$step['after']);
		}
		return $fail;
	}
}
