/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Three-check (lichess rules): orthodox chess in which the side that gives its third check wins at once. A move gives
 * check when, after it, a piece of the mover other than its king attacks the enemy king; a double check counts once.
 * The counters of checks given (`x.checks`, White first) are part of the solid structure (`solidExtra`), so a check
 * that happened in some possibilities only is settled by the solid roll at once and the counters are always certain.
 * The classic end rules of the core stay on (docs/rules.md 5 and 6): "your king cannot escape" wins, and only
 * the two kings left is a draw, which waits while the side to move can take the other king. Player-facing rules are in
 * docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { orthodoxAfterMove, standardSetup } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant, sideName } from './core/variant.js'
import { givesCheck, hasRoyal, linesOf } from './core/world.js'

/** The number of checks that wins. */
export const CHECKS_TO_WIN = 3

/**
 * What a side's own checks are worth to the computer, by the number given (0, 1, 2; the third check is a win and is
 * scored by the search from the result).
 */
const CHECK_VALUE = [0, 180, 500]

/**
 * What one piece that attacks the enemy king or a square next to it is worth to the computer, by the number of checks
 * its side has already given: the closer to the third check, the more a possible check matters.
 */
const PRESSURE_VALUE = [20, 30, 45]

/**
 * The check counters of a world: `[given by White, given by Black]`. Worlds built without them (tests, old saves)
 * count as `[0, 0]`.
 *
 * @param {object} w world
 * @return {number[]}
 */
export function checksOf(w) {
	return w.x?.checks ?? [0, 0]
}

/**
 * The counters written in a roll note (`solid:checks:W:B`, or the longer note of games saved before the notes were
 * shortened, which ends the same way), or null when the note is not a counter roll.
 *
 * @param {string} note roll note
 * @return {number[]|null}
 */
function noteChecks(note) {
	const m = /checks:(\d+):(\d+)$/.exec(note)
	return note.startsWith('solid:') && m ? [Number(m[1]), Number(m[2])] : null
}

const spec = orthodoxSpec()

/** The movement lines of each piece type by `side * size + square` (a numeric cache in front of `linesOf`). */
const lineTable = new Map()

/**
 * The movement lines of a piece type for a side on a square.
 *
 * @param {string} type piece type
 * @param {number} side side index
 * @param {number} sq square
 * @return {object[]}
 */
function linesAt(type, side, sq) {
	let table = lineTable.get(type)
	if (table === undefined) {
		table = []
		lineTable.set(type, table)
	}
	const i = side * spec.topology.size + sq
	return table[i] ?? (table[i] = linesOf(spec, type, side, sq))
}

/** The king zone of each square: flags for the square itself and the squares a king could step to from it. */
const zoneTable = []

/**
 * The king zone around a square, as flags by square.
 *
 * @param {number} k the king's square
 * @param {string} type the king's type
 * @return {Uint8Array}
 */
function zoneAround(k, type) {
	let zone = zoneTable[k]
	if (zone === undefined) {
		zone = new Uint8Array(spec.topology.size)
		zone[k] = 1
		for (const line of linesOf(spec, type, 0, k)) {
			zone[line.squares[0]] = 1
		}
		zoneTable[k] = zone
	}
	return zone
}

/**
 * Whether a piece attacks a square of a king zone (its capturing lines only; sliders stop at the first piece).
 *
 * @param {object} w world
 * @param {number} id piece id
 * @param {Uint8Array} zone flags by square
 * @return {boolean}
 */
function hitsZone(w, id, zone) {
	for (const line of linesAt(w.ty[id], w.sd[id], w.sq[id])) {
		if (line.d.mode === 'move') {
			continue
		}
		if (line.kind === 'leap') {
			if (zone[line.squares[0]] && !line.via.some((s) => w.board[s] !== -1)) {
				return true
			}
			continue
		}
		for (const s of line.squares) {
			if (zone[s]) {
				return true
			}
			if (w.board[s] !== -1) {
				break
			}
		}
	}
	return false
}

/**
 * How many pieces of `attacker`, other than its king, attack the king of `defender` or a square next to it: the
 * pieces that are close to giving a check (for the computer).
 *
 * @param {object} w world
 * @param {number} attacker attacking side
 * @param {number} defender side whose king is looked at
 * @return {number}
 */
export function kingPressure(w, attacker, defender) {
	let zone = null
	for (let id = 0; id < w.sq.length && !zone; id++) {
		if (w.sd[id] === defender && w.sq[id] >= 0 && spec.royalTypes.has(w.ty[id])) {
			zone = zoneAround(w.sq[id], w.ty[id])
		}
	}
	if (!zone) {
		return 0
	}
	let count = 0
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === attacker && w.sq[id] >= 0 && !spec.royalTypes.has(w.ty[id]) && hitsZone(w, id, zone)) {
			count++
		}
	}
	return count
}

Object.assign(spec, {
	id: 'threecheck',
	category: 'rules',

	setup() {
		const w = standardSetup(spec, 'rnbqkbnr')
		w.x.checks = [0, 0]
		return w
	},

	// Runs only in the worlds where a move, a split half or a merge is really played: a move that misses, a split
	// half that stays home and a measurement count no check (idle worlds only pass through `applyMiss`).
	afterMove(next, m, prev) {
		orthodoxAfterMove(spec, next, m)
		const side = prev.sd[m.id]
		if (givesCheck(spec, next, side, 1 - side, { royal: false })) {
			const checks = checksOf(next).slice()
			checks[side]++
			next.x.checks = checks
		}
	},

	// The counters are solid: worlds that disagree about a check are settled by the solid roll at once.
	solidExtra(w) {
		return 'checks:' + checksOf(w).join(':')
	},

	// A captured king loses, the third check wins. The escape rule and the bare-kings draw (which waits while the side
	// to move can take the other king) are the core's classic flags (`escapeRule`, `bareKingsDraw`, `drawsWait`),
	// left at their defaults: this hook must not return 'bareKings' as well.
	worldResult(w) {
		const alive = [hasRoyal(spec, w, 0), hasRoyal(spec, w, 1)]
		if (!alive[0] || !alive[1]) {
			return { winner: alive[0] ? 0 : alive[1] ? 1 : null, reason: 'king' }
		}
		const checks = checksOf(w)
		for (const side of [0, 1]) {
			if (checks[side] >= CHECKS_TO_WIN) {
				return { winner: side, reason: 'checks' }
			}
		}
		return null
	},

	reasonText(reason) {
		return reason === 'checks' ? t('quantumchess', 'three checks') : null
	},

	noteText(note) {
		const checks = noteChecks(note)
		if (!checks) {
			return null
		}
		const won = checks.findIndex((c) => c >= CHECKS_TO_WIN)
		return won >= 0
			// TRANSLATORS: Three-check, the result of a roll that ended the game; {side} is White or Black
			? t('quantumchess', 'Third check: {side} wins', { side: sideName(spec, won) })
			// TRANSLATORS: Three-check, the result of a roll that decided a check: how many checks each side has given
			: t('quantumchess', 'Checks: White {white}, Black {black}', { white: checks[0], black: checks[1] })
	},

	sideInfo(state, side) {
		const count = checksOf(state.worlds[0].b)[side]
		return {
			text: t('quantumchess', 'Checks: {count}/3', { count }),
			title: t('quantumchess', 'Checks given: {count} of 3', { count }),
		}
	},

	recordInfo(prev, code, branch, next) {
		const side = prev.turn
		const after = checksOf(next.worlds[0].b)[side]
		return after > checksOf(prev.worlds[0].b)[side] ? { check: after } : null
	},

	infoText(record) {
		const count = record.info?.check
		// TRANSLATORS: Three-check, a line of the move list, "White gave check (2 of 3)"; {side} is White or Black
		return count
			? [t('quantumchess', '{side} gave check ({count} of 3)', { side: sideName(spec, record.side), count })]
			: null
	},

	evaluate(w, side) {
		const enemy = 1 - side
		const checks = checksOf(w)
		const own = Math.min(checks[side], 2)
		const their = Math.min(checks[enemy], 2)
		return CHECK_VALUE[own] - CHECK_VALUE[their]
			+ PRESSURE_VALUE[own] * kingPressure(w, side, enemy)
			- PRESSURE_VALUE[their] * kingPressure(w, enemy, side)
	},

	rules: () => [
		t('quantumchess', 'Give check three times to win. Capturing the king also wins.'),
		t(
			'quantumchess',
			'A check is a move after which one of your pieces (not your king) attacks the enemy king; a double check counts once.',
		),
		t(
			'quantumchess',
			'Checks are always certain: if a move gives check in only some possibilities, a roll settles it at once, even after castling or en passant.',
		),
		t(
			'quantumchess',
			'A move that misses gives no check, even if the enemy king is attacked. Measuring never gives check.',
		),
		t(
			'quantumchess',
			'A check left standing counts again after each of your moves, as long as the enemy king is still attacked.',
		),
		t('quantumchess', 'The game is a draw when only the two kings are left.'),
		t('quantumchess', 'The counters next to the player names show how many checks each side has given.'),
	],
})

export default defineVariant(spec)
