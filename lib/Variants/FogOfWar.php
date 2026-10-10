<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Variants;

/**
 * Fog of war: the squares a side sees (its pieces, every square they could move to, and a pawn it could take en
 * passant), the record info of a capture (`{ taken, types }`), and the fog view of a state (src/variants/referee.js:
 * every enemy piece on a hidden square off the board as a pawn, only the side's castling rights, identical worlds
 * merged).
 *
 * JavaScript twin: src/variants/darkchess.js (`visibility`, `recordInfo`) and `fogWorld`, `fogWorlds` of
 * src/variants/referee.js.
 *
 * @psalm-import-type Branch from Quantum
 *
 * @internal
 */
final class FogOfWar {
	/**
	 * The squares a side can see (`visibility`).
	 *
	 * @return array<int, true>
	 */
	public static function visibility(State $state, int $side): array {
		$out = Quantum::reachable($state, $side);
		foreach ($state->worlds as $e) {
			$b = $e['b'];
			foreach ($b->sq as $id => $s) {
				if ($s >= 0 && $b->sd[$id] === $side) {
					$out[$s] = true;
				}
			}
			if ($b->ep() >= 0) {
				foreach (World::generate($b, $side) as $m) {
					if ($m->kind === 'ep') {
						$out[$b->sq[$m->capture]] = true;
					}
				}
			}
		}
		return $out;
	}

	/**
	 * What a capture tells (`recordInfo`): `{ taken, types }`, or null for a move without captures.
	 *
	 * @param Branch $branch
	 * @return array{taken: array<int, int>, types: array<int, array<int, string>>}|null
	 */
	public static function recordInfo(State $prev, string $code, array $branch): ?array {
		if ($branch['captures'] === []) {
			return null;
		}
		$b = $prev->worlds[0]['b'];
		$m = World::generate($b, $prev->turn)[$code] ?? null;
		if ($m !== null && $m->kind === 'ep') {
			return ['taken' => [$b->epVictim()], 'types' => [['p']]];
		}
		$types = [];
		foreach ($branch['captures'] as $sq) {
			$found = [];
			foreach ($prev->worlds as $e) {
				$pb = $e['b'];
				$occ = $pb->board[$sq];
				if ($occ >= 0 && $pb->sd[$occ] !== $prev->turn) {
					$found[$pb->ty[$occ]] = true;
				}
			}
			$list = array_map('strval', array_keys($found));
			sort($list, SORT_STRING);
			$types[] = $list;
		}
		return ['taken' => $branch['captures'], 'types' => $types];
	}

	/**
	 * A world in the fog (`fogWorld` of referee.js).
	 *
	 * @param array<int, true> $visible
	 */
	private static function fogWorld(World $b, int $side, array $visible): World {
		$c = $b->copy();
		foreach ($c->sq as $id => $s) {
			if ($c->sd[$id] !== $side && !($s >= 0 && isset($visible[$s]))) {
				if ($s !== World::OFF) {
					$c->place($id, World::OFF);
				}
				$c->ty[$id] = 'p';
			}
		}
		$x = $c->x;
		$x['castle'] = array_values(array_filter($c->castle(), static fn (array $r): bool => $r['side'] === $side));
		$c->x = $x;
		return $c;
	}

	/**
	 * The worlds of the fog view, identical worlds merged in first-seen order (`fogWorlds` of referee.js).
	 *
	 * @param array<int, true> $visible
	 * @return array<int, array{b: World, w: int}>
	 */
	public static function fogWorlds(State $state, int $side, array $visible): array {
		$bs = [];
		foreach ($state->worlds as $e) {
			$bs[] = self::fogWorld($e['b'], $side, $visible);
		}
		return Quantum::mergeWorlds($bs, array_column($state->worlds, 'w'));
	}
}
