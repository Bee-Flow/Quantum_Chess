// Prototype of the capablanca variant on the real variants core (research only, not the module).
// It follows handoff/research/capablanca.md section 3 exactly; the test cases of section 7 run in cases.mjs.
import { t } from '@nextcloud/l10n'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { whiteBlack } from '../../../src/variants/core/orthodoxVariant.js'
import {
	BISHOP_DIRS,
	castlingMoves,
	KNIGHT_JUMPS,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	ROOK_DIRS,
	standardBoard,
	standardSetup,
} from '../../../src/variants/core/orthodox.js'

const board = standardBoard(10, 8)
const types = orthodoxTypes({ lastRank: board.lastRank, promoteTo: ['q', 'c', 'a', 'r', 'b', 'n'] })
types.a = {
	name: () => t('quantumchess', 'Archbishop'),
	moves: [{ ride: BISHOP_DIRS }, { leap: KNIGHT_JUMPS }],
	value: 875,
	glyph: { text: 'A', shape: 'circle' },
}
types.c = {
	name: () => t('quantumchess', 'Chancellor'),
	moves: [{ ride: ROOK_DIRS }, { leap: KNIGHT_JUMPS }],
	value: 900,
	glyph: { text: 'C', shape: 'circle' },
}
// H. G. Muller's Capablanca values (Q 950, C 900, A 875, R 500, B 350, N 300, P 100)
types.q.value = 950
types.b.value = 350
types.n.value = 300

const spec = {
	id: 'capablanca',
	category: 'boards',
	rules: () => [],
	sides: whiteBlack(),
	topology: board.topology,
	board,
	types,
	setup() {
		return standardSetup(spec, 'rnabqkbcnr')
	},
	extraMoves(w, side) {
		return [
			...pawnExtras(spec, w, side, (s, sq) => board.rankOf(sq) === (s === 0 ? 1 : 6)),
			...castlingMoves(spec, w, side),
		]
	},
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
	},
}

export const CAPA = defineVariant(spec)
