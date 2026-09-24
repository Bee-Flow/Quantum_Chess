/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The fixed inputs of the parity fixtures: the specs of the seeded random games, the scripted examples (the worked
 * examples W1–W17 and the edge cases of §11), hand-picked whyIllegal cases for every reason code, parser inputs, roll
 * records and setup specs. Section numbers (§) refer to docs/engine-rules.md.
 */

import * as E from '../../../src/engine/index.js'
import { craft, withFields } from '../../js/engine/helpers.js'

const T = E.T

/**
 * Specs of the seeded random games: `{name, seed, policy, maxPlies, setup?, start?, forcedEvery?}`.
 */
export const RANDOM_GAMES = []
const policies = ['uniform', 'quantum', 'aggressive', 'merge', 'pawns']
for (let i = 0; i < 25; i++) {
	RANDOM_GAMES.push({
		name: 'start-' + policies[i % 5] + '-' + i,
		seed: 1000 + i,
		policy: policies[i % 5],
		maxPlies: 70,
		forcedEvery: 0.05,
	})
}
const MIDGAMES = [
	['r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1', []],
	['r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1', ['f3-g5|h4']],
	['4k3/1P3pp1/8/3pP3/8/8/5PP1/4K3 w - d6 0 1', []],
	['r3k3/1P6/8/8/8/8/6p1/4K2R w Kq - 0 1', []],
	['3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5', 'd8-a5|d5']],
	['2r1k3/pp3ppp/8/8/8/8/PP3PPP/2R1K3 w - - 0 1', []],
]
MIDGAMES.forEach(([fen, prelude], i) => {
	for (let k = 0; k < 2; k++) {
		RANDOM_GAMES.push({
			name: 'setup-' + i + '-' + k,
			seed: 2000 + i * 10 + k,
			policy: k === 0 ? 'quantum' : 'aggressive',
			maxPlies: 60,
			setup: { fen, prelude },
			forcedEvery: 0.05,
		})
	}
})
const ENDGAMES = [
	'6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
	'7k/8/5K2/8/8/8/8/1R6 w - - 0 1',
	'k7/8/1K6/8/8/8/8/7Q w - - 0 1',
	'4k3/8/8/3n4/4K3/8/8/8 w - - 0 1',
	'8/8/4k3/8/2N5/4K3/8/8 w - - 0 1',
	'3k4/8/3K4/8/8/8/8/6R1 w - - 0 1',
	'6rk/6pp/8/8/8/8/6PP/5RK1 w - - 0 1',
	'4k3/4p3/8/8/8/8/4P3/R3K2R w KQ - 0 1',
]
ENDGAMES.forEach((fen, i) => {
	RANDOM_GAMES.push({
		name: 'endgame-hunter-' + i,
		seed: 3000 + i,
		policy: 'hunter',
		maxPlies: 60,
		setup: { fen, prelude: [] },
	})
	RANDOM_GAMES.push({
		name: 'endgame-quantum-' + i,
		seed: 3100 + i,
		policy: 'quantum',
		maxPlies: 40,
		setup: { fen, prelude: [] },
		forcedEvery: 0.1,
	})
})
RANDOM_GAMES.push({
	name: 'shuffle-repetition',
	seed: 4001,
	policy: 'shuffle',
	maxPlies: 60,
	setup: { fen: '4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', prelude: [] },
})
RANDOM_GAMES.push({
	name: 'shuffle-repetition-quantum',
	seed: 4002,
	policy: 'shuffle',
	maxPlies: 60,
	setup: { fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', prelude: ['g1-f3|h3'] },
})
RANDOM_GAMES.push({
	name: 'fifty-moves',
	seed: 4003,
	policy: 'fifty',
	maxPlies: 150,
	setup: { fen: '4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1', prelude: [] },
})
RANDOM_GAMES.push({
	name: 'bare-kings',
	seed: 4004,
	policy: 'aggressive',
	maxPlies: 40,
	setup: { fen: '8/8/8/8/3k4/8/2n5/4K3 w - - 0 1', prelude: [] },
})
RANDOM_GAMES.push({
	name: 'max-ply',
	seed: 4005,
	policy: 'shuffle',
	maxPlies: 30,
	start: withFields(E.setupPosition({ fen: '4k3/8/8/8/8/8/8/1N2K3 w - - 0 1' }), { ply: 1190 }),
})
RANDOM_GAMES.push({
	name: 'weight-one-worlds',
	seed: 4006,
	policy: 'quantum',
	maxPlies: 40,
	start: craft([
		[{ e1: 'A', a1: 'C', g1: 'H', e8: 'a', a2: 'g', b8: 'h' }, T - 1],
		[{ e1: 'A', a1: 'C', g1: 'H', e8: 'a', h5: 'g', b8: 'h' }, 1],
	]),
	forcedEvery: 0.1,
})

/**
 * The scripted examples: `[name, {setup} or {start}, moves]`. A move is a code; `code@u=N` rolls with u, `code@key`
 * forces an outcome.
 */
const setup = (fen, prelude = []) => ({ setup: { fen, prelude } })

export const EXAMPLE_SCRIPTS = [
	['W1 split, pawn, merge', { start: E.initialState() }, ['g1-f3|h3', 'e7-e5', 'f3|h3-g1']],
	['W2 capture branch', setup('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']), ['c1-h6@u=8388608']],
	['W2 move branch', setup('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']), ['c1-h6@u=5033164']],
	['W2 boundary u = 8388607', setup('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']), ['c1-h6@u=8388607']],
	['W2 blocked lane variant', setup('4k3/8/8/8/6n1/8/8/2B1K3 w - - 0 1', ['g4-e3|h6']), ['c1-h6@u=100']],
	['W3 miss', setup('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']), ['f3-e5@u=8388607']],
	['W3 move', setup('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']), ['f3-e5@u=12582911']],
	['W3 capture', setup('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']), ['f3-e5@u=12582912']],
	['W4 link and measure a4', setup('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), ['b6-a4|c4', 'a1-a8', '?c4@u=3']],
	['W4 measure c4', setup('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), ['b6-a4|c4', 'a1-a8', '?a4@u=9000000']],
	['W5 partly blocked split', setup('4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1'), ['g3-f1|h5', 'd1-h1|d5']],
	['W6 converging capture', setup('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5']), ['d4|h5-h8']],
	['W6 half shot misses', setup('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5']), ['h5-h8@u=100']],
	[
		'W7 rescale after a miss',
		setup('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'),
		['g8-f6|h6', 'e1-e2', 'f6-d5|e4', 'd3-e4@u=3000000'],
	],
	['W7 capture', setup('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'), ['g8-f6|h6', 'e1-e2', 'f6-d5|e4', 'd3-e4@u=13000000']],
	[
		'W8 budget fallback',
		setup('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4']),
		['h1-h8@u=9000000'],
	],
	['W9 probe misses', setup('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']), ['e2-e4@u=1']],
	[
		'W9 double push and en passant',
		setup('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']),
		['e2-e4@u=16000000', 'd4-e3'],
	],
	[
		'W10 castling rights follow the state',
		setup('4k3/8/8/8/8/8/8/4K2R w K - 0 1'),
		['h1-h3|h5', 'e8-d8', 'h3|h5-h1'],
	],
	[
		'W10 missed king step keeps the right',
		setup('4k3/8/8/8/8/8/8/4K1NR w K - 0 1', ['g1-e2|f3']),
		['e1-e2@miss', 'e8-d8', 'e1-g1'],
	],
	[
		'W12 index order',
		setup('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']),
		['h4-a4|h3', 'e8-d8', '?h3@u=0'],
	],
	[
		'W12 u = 8388608',
		setup('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']),
		['h4-h3|a4', 'e8-d8', '?a4@u=8388608'],
	],
	[
		'W12 u = 8388609',
		setup('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']),
		['h4-h3|a4', 'e8-d8', '?h3@u=8388609'],
	],
	[
		'W13 budget_full position',
		setup('4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3']),
		['d1-d2'],
	],
	['W14 trapped king', setup('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'), ['a1-a8']],
	['W14 knight blocks', setup('6k1/3n1ppp/8/8/8/8/8/R3K3 w - - 0 1'), ['a1-a8', 'd7-b8']],
	['W15 no ep wrap', setup('4k3/8/8/p7/8/8/7P/4K3 w - - 0 1'), ['h2-h4']],
	['W15 mirror', setup('4k3/p7/8/8/7P/8/8/4K3 b - - 0 1'), ['a7-a5']],
	['W16 bare kings adjacent', setup('8/8/4k3/3n4/4K3/8/8/8 w - - 0 1'), ['e4-d5', 'e6-d5']],
	['W17 two queens', setup('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1'), ['c1-c8']],
	['W17 ghost and ep', setup('4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', ['g1-f3|h3']), ['d4-e3']],
	['E2 certain capture', setup('4k3/8/8/7n/8/8/8/4K2R w - - 0 1'), ['h1-h5']],
	['E5 capture through a ghost blocker', setup('r3k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', ['b6-a4|c4']), ['a1-a8@capture']],
	['E5 miss', setup('r3k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', ['b6-a4|c4']), ['a1-a8@miss']],
	['E9 own ghost on target', setup('4k3/8/8/8/8/8/8/RN2K3 w - - 0 1', ['b1-a3|c3']), ['a1-a3@u=1', 'e8-e7', 'a1-a2']],
	['E11 part onto part', setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a5']), ['a3-a5']],
	[
		'E12 enemy only where X is absent',
		setup('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'),
		['b6-a4|c4', 'a1-a8', 'e8-d8', 'a8-a4@u=12000000'],
	],
	['E15 a piece never blocks itself', setup('4k3/8/8/8/8/R7/8/4K3 w - - 0 1', ['a3-a1|a4']), ['a1-a8']],
	[
		'E20 location cap reached',
		setup('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1'),
		['g1-f3|h3', 'e8-d8', 'f3-e5|g5', 'd8-e8', 'h3-f2|f4', 'e8-d8'],
	],
	[
		'E22 weight-1 branching world',
		{
			start: craft([
				[{ e1: 'A', a1: 'C', e8: 'a', a2: 'g' }, T - 1],
				[{ e1: 'A', a1: 'C', e8: 'a', h5: 'g' }, 1],
			]),
		},
		['a1-b1|a3', 'h5-f6', 'b1-b8@capture'],
	],
	['E24 split along the lane', setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), ['a1-a3|a5']],
	[
		'E27 merge with a third part',
		setup('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'),
		['g8-f6|h6', 'e1-e2', 'f6-d5|e4', 'e2-e1', 'd5|e4-f6'],
	],
	[
		'E32 converging capture that may miss',
		{
			start: craft([
				[{ e1: 'A', h8: 'a', d4: 'B' }, T / 4],
				[{ e1: 'A', h8: 'a', h5: 'B' }, T / 4],
				[{ e1: 'A', h8: 'a', a1: 'B' }, T / 2],
			]),
		},
		['d4|h5-h8@u=8388607', 'h8-g8', 'a1-h8'],
	],
	[
		'E33 weight gathers on the third part',
		{
			start: craft([
				[{ e1: 'A', e8: 'a', a1: 'C' }, T / 4],
				[{ e1: 'A', e8: 'a', a3: 'C' }, T / 2],
				[{ e1: 'A', e8: 'a', a5: 'C' }, T / 4],
			]),
		},
		['a1|a5-a3'],
	],
	['E34 merge lane passes the other part', setup('4k3/8/8/8/8/8/R7/4K3 w - - 0 1', ['a2-a1|a3']), ['a1|a3-a5']],
	['E37 pawn probe', setup('4k3/8/8/8/6n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']), ['e2-e3@miss', 'e3-g4', 'e2-e3']],
	[
		'E44 promotion probe',
		setup('7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', ['g7-e8|f5']),
		['e7-e8=N@miss', 'e8-d6', 'e7-e8=Q'],
	],
	['E45 promotion captures the king', setup('3k4/4P3/8/8/8/8/8/K7 w - - 0 1'), ['e7-d8=R']],
	['E46 king bumps into its own ghost', setup('4k3/8/8/8/8/8/8/4K1NR w K - 0 1', ['g1-e2|f3']), ['e1-e2@u=16000000']],
	['E47 king onto an enemy ghost', setup('4k3/8/8/8/8/5n2/8/4K3 w - - 0 1', ['f3-d2|h2']), ['e1-d2@capture']],
	['E51 castling through attack', setup('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1-g1', 'e8-d8']],
	['E51 long castling', setup('r3k3/8/8/8/8/8/8/R3K3 b Qq - 0 1'), ['e8-c8', 'e1-c1']],
	['E53 castling rook captured', setup('4k3/8/8/8/8/8/1b6/R3K3 b Q - 0 1'), ['b2-a1']],
	[
		'E56 move only in a weight-1 world',
		{
			start: craft([
				[{ e1: 'A', e8: 'a', f3: 'H' }, 1],
				[{ e1: 'A', e8: 'a', h3: 'H' }, T - 1],
			]),
		},
		['f3-e5', 'e8-d8', '?e5@u=0'],
	],
	['E57 bare kings', setup('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1'), ['e1-d2']],
	[
		'E58 king capture on ply 1200',
		{ start: withFields(E.setupPosition({ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1' }), { ply: 1199 }) },
		['e1-d2'],
	],
	[
		'E59 split/merge repetition',
		{ start: E.initialState() },
		['g1-f3|h3', 'b8-a6|c6', 'f3|h3-g1', 'a6|c6-b8', 'g1-f3|h3', 'b8-a6|c6', 'f3|h3-g1', 'a6|c6-b8'],
	],
	['E60 no legal move', setup('8/8/8/8/8/8/pp1p4/krb1K3 w - - 0 1'), ['e1-d1']],
	[
		'E80 25% king shot',
		setup('k7/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|b1', 'a3-a4|c3']),
		['a4-a8@u=100', 'a8-b8', 'e1-f1'],
	],
	['E83 fifty moves suspended', setup('8/8/8/8/8/8/3k4/4K2R w - - 99 1'), ['h1-h2', 'd2-e1']],
	['E83 fifty moves', setup('8/8/8/8/k7/8/8/4K2R w - - 99 1'), ['h1-h2']],
	[
		'E83 repetition suspended',
		setup('4r2k/8/8/8/8/8/8/1N2K3 b - - 0 1'),
		['h8-g8', 'b1-c3', 'g8-h8', 'c3-b1', 'h8-g8', 'b1-c3', 'g8-h8', 'c3-b1', 'h8-g8'],
	],
	[
		'E85 a possible king capture escapes',
		setup('6k1/5ppp/8/6n1/8/8/8/R3K3 w - - 0 1', ['g5-f3|h3']),
		['a1-a8', 'f3-e1@u=16000000'],
	],
	['E85 a certain king capture escapes', setup('rr6/7k/8/8/8/8/8/K6R b - - 0 1'), ['h7-h8', 'h1-h8']],
	[
		'E86 trapping move at ply 1199',
		{ start: withFields(E.setupPosition({ fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1' }), { ply: 1198 }) },
		['a1-a8', 'g8-f8'],
	],
]

/** Positions that the hand-picked cases and the records share. */
export const START = E.initialState()
export const W2 = E.setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6'] })
const DONE = E.applyMove(E.setupPosition({ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1' }), 'e1-d2').state
/** Hand-picked whyIllegal cases: `[name, state, input]`, at least one for every reason code. */
export const HAND_WHY = [
	['game_over', DONE, 'e8-e7'],
	['game_over beats malformed objects', DONE, { type: 'bogus' }],
	['unparsable string is malformed even when the game is over', DONE, 'zz'],
	['malformed type', START, { type: 'castle', from: [4], to: [6] }],
	['malformed lengths', START, { type: 'standard', from: [12], to: [] }],
	['malformed square', START, { type: 'standard', from: [12], to: [64] }],
	['malformed float', START, { type: 'standard', from: [12.5], to: [28] }],
	['malformed pair', START, { type: 'split', from: [6], to: [21, 21] }],
	['malformed pair string', START, 'g1-f3|f3'],
	['malformed promo', START, { type: 'standard', from: [12], to: [28], promo: 'k' }],
	['malformed upper-case promo', START, { type: 'standard', from: [12], to: [28], promo: 'Q' }],
	['promo on a split', START, { type: 'split', from: [6], to: [21, 23], promo: 'q' }],
	['promo on a merge', START, { type: 'merge', from: [21, 23], to: [6], promo: 'q' }],
	['promo on a measure', START, { type: 'measure', from: [6], to: [], promo: 'q' }],
	['null promo is absent', START, { type: 'standard', from: [12], to: [28], promo: null }],
	['no_piece', START, 'e4-e5'],
	['measure of an empty square', START, '?e4'],
	['not_your_piece', START, 'e7-e5'],
	['castling by the side not to move', START, { type: 'standard', from: [60], to: [62] }],
	['piece_mismatch', W2, 'Nc1-h6'],
	['piece letter matches', W2, 'Bc1xh6 {capture 50%}'],
	['pawn with a letter', START, 'Ke2-e4'],
	['merge_mismatch', START, 'b1|g1-e2'],
	['merge of a king', START, 'e1|e2-e3'],
	['cannot_split king', START, 'e1-d1|f1'],
	['cannot_split pawn', START, 'e2-e3|e4'],
	['not_superposed', START, '?e1'],
	['castle_no_right', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K2R w Q - 0 1' }), 'O-O'],
	['castle_blocked', E.setupPosition({ fen: '4k3/8/8/8/8/6n1/8/4K2R w K - 0 1', prelude: ['g3-f1|h5'] }), 'e1-g1'],
	[
		'castling with promo',
		E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1' }),
		{ type: 'standard', from: [4], to: [2], promo: 'q' },
	],
	['castling marker with a rook on e1', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/K3R3 w - - 0 1' }), 'O-O'],
	['black king on e1 is not castling', E.setupPosition({ fen: '8/8/8/8/8/8/8/4k2K b - - 0 1' }), 'e1-g1'],
	['unreachable knight', START, 'g1-g3'],
	['unreachable pawn', START, 'e2-e5'],
	['unreachable pawn backwards', START, 'e2-e1'],
	['unreachable split', START, 'b1-a3|b3'],
	[
		'unreachable merge',
		E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', prelude: ['a1-a3|c1'] }),
		'a3|c1-a3',
	],
	['promotion_required', E.setupPosition({ fen: '7k/4P3/8/8/8/8/8/K7 w - - 0 1' }), 'e7-e8'],
	['promotion_invalid', START, 'e2-e4=Q'],
	['nothing_to_capture', START, 'e2-f3'],
	['nothing_to_capture own piece', E.setupPosition({ fen: '4k3/8/8/8/8/3N4/4P3/4K3 w - - 0 1' }), 'e2-d3'],
	['blocked slider', START, 'c1-e3'],
	['blocked pawn push', E.setupPosition({ fen: '4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1' }), 'e2-e4'],
	['own_piece', START, 'g1-e2'],
	['own_piece king', START, 'e1-e2'],
	['split_target_occupied', START, 'g1-e2|f3'],
	[
		'split_target_occupied by itself',
		E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', prelude: ['a1-a3|a5'] }),
		'a3-b3|a5',
	],
	['split_blocked', E.setupPosition({ fen: '4k3/8/8/8/8/8/P7/R3K3 w - - 0 1' }), 'a1-b1|a3'],
	[
		'split_blocked alternating',
		E.setupPosition({ fen: '4k3/8/8/8/8/2n5/8/R3K3 w - - 0 1', prelude: ['c3-a4|b1'] }),
		'a1-a5|c1',
	],
	[
		'location_cap',
		E.setupPosition({
			fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1',
			prelude: ['g1-f3|h3', 'e8-d8', 'f3-e5|g5', 'd8-e8', 'h3-f2|f4', 'e8-d8'],
		}),
		'e5-c4|c6',
	],
	[
		'budget_full W13',
		E.setupPosition({ fen: '4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', prelude: ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3'] }),
		'd1-h1|d5',
	],
	[
		'merge_target_own',
		E.setupPosition({ fen: '4k3/8/8/8/8/2P5/8/R3K3 w - - 0 1', prelude: ['a1-a3|c1'] }),
		'a3|c1-c3',
	],
	[
		'merge_part_stuck',
		E.setupPosition({ fen: '4k3/8/8/8/8/1P6/8/R3K3 w - - 0 1', prelude: ['a1-a3|c1'] }),
		'a3|c1-c3',
	],
	['legal rolled', W2, 'c1-h6'],
	[
		'legal measure by any part',
		E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', prelude: ['a1-a3|a5'] }),
		'?a5',
	],
	['legal lenient', START, '  G1-F3,H3 '],
]

/** Parser inputs: notation examples, lenient variants and malformed text. */
export const PARSER_INPUTS = [
	'Qd4|h5xh8 #',
	'?Na4 {c4 50%}',
	'Nf3xe5 {capture 25%} #',
	'Bc1xh6 {capture 50%}',
	'g1-h3|f3',
	'g1f3/h3',
	'G1-F3,H3',
	'h3/f3g1',
	'E2E4',
	'e2:e4',
	'  e2-e4+ \t',
	'\r\ne2-e4+\n',
	'e7e8q',
	'e7-e8=Q',
	'e7-e8=q!?',
	'measure A4',
	'?a4',
	'o-o-o',
	'0-0-0',
	'O-O',
	'O-o-0+',
	'B1-c3',
	'Bb1-c3',
	'e2xe4',
	'e2Xe4',
	'Ke1-g1',
	'MeAsUrE\t \ta4',
	'e2-e4 {anything',
	'g1-f3|f3',
	'N?a4',
	'e2 e4',
	'e2-e4-e5',
	'Pe2-e4',
	'e9-e4',
	'',
	'   ',
	'{e2-e4}',
	'e2-',
	'e2-e4=',
	'e2-e4=K',
	'measure',
	'measurea4',
	'?',
	'??a4',
	'O-O-O-O',
	'O--O',
	'K?a4',
	'ke1-e2',
	'e2|e4',
	'e2-e4|e5|e6',
	'g1-f3|h3=Q',
	'e2–e4',
	'e2 e4',
	'i2-i4',
	'Bc1-h6 {move 50%}',
	'd3-e4 {miss 75%}',
	'Ng1-f3|h3',
	'Ra1-a8 #',
	'O-O #',
	'e7xd8=Q #',
	'Nf3|h3-g1',
	'?Nh3 {h3 50%}',
]

/** Measurement records for the roll display vectors; a sample of the random games' records is added to them. */
export const ROLL_RECORDS = [
	{
		key: 'move',
		u: 6227703,
		outcomes: [
			{ key: 'move', weight: 8388608 },
			{ key: 'capture', weight: 8388608 },
		],
	},
	{
		key: 'move',
		u: 8388607,
		outcomes: [
			{ key: 'move', weight: 8388608 },
			{ key: 'capture', weight: 8388608 },
		],
	},
	{
		key: 'move',
		u: 10368000,
		outcomes: [
			{ key: 'miss', weight: 8388608 },
			{ key: 'move', weight: 4194304 },
			{ key: 'capture', weight: 4194304 },
		],
	},
	{
		key: 'miss',
		u: 11184810,
		outcomes: [
			{ key: 'miss', weight: 11184811 },
			{ key: 'capture', weight: 5592405 },
		],
	},
	{
		key: 'capture',
		u: 11184811,
		outcomes: [
			{ key: 'miss', weight: 11184811 },
			{ key: 'capture', weight: 5592405 },
		],
	},
	{
		key: 'capture',
		u: null,
		outcomes: [
			{ key: 'move', weight: 8388608 },
			{ key: 'capture', weight: 8388608 },
		],
	},
	{
		key: 'c4',
		u: 9000000,
		outcomes: [
			{ key: 'a4', weight: 8388608 },
			{ key: 'c4', weight: 8388608 },
		],
	},
	{
		key: 'move',
		u: 1,
		outcomes: [
			{ key: 'miss', weight: 1 },
			{ key: 'move', weight: T - 1 },
		],
	},
]

/** Dutch labels, to check that label overrides are used verbatim. */
export const LABELS_NL = {
	miss: 'Gemist',
	move: 'Verzet',
	capture: 'Geslagen',
	rolled: 'geworpen',
	forced: 'geforceerd',
}

/** Setup specs that must succeed, and specs that must fail with a setup error. */
export const SETUP_SPECS = [
	{ fen: '4k3/8/8/8/8/8/8/2QQK3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', prelude: ['g1-f3|h3'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6', 'c1-h6@capture'] },
	{ fen: '4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', prelude: ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss'] },
	{ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', prelude: [] },
	{ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 5 20', prelude: ['h1-h3|h5', 'h3|h5-h1'] },
	{ fen: '8/PPPPPPPP/8/8/8/8/pppppppp/K6k w - - 0 1', prelude: [] },
	{ fen: 'RNBQKBNR/8/8/8/8/8/8/rnbqkbnr w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/4P3/4K3 w - -', prelude: ['e2-e4'] },
]
export const SETUP_ERROR_SPECS = [
	{ fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/3KK3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/NNNNNNNN/NNNN4/4K3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/4K3 w - - 100 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/4K2 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/P3K3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/4K3 w - e6 0 1', prelude: [] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['nonsense'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['a1-a2'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['c1-c2'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6', 'c1-h6'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6', 'c1-h6@miss'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6@move'] },
	{ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1', prelude: ['e1-d2'] },
]
