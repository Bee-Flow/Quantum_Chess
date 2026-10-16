/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The sounds of a variant game, as the classic board plays them (services/sound.js): a move or a capture when a move is
 * played (the player's own, the computer's and an online opponent's), and at the end a win or a loss. They honour the
 * user's sound preference and volume (`boardPrefs`), which are applied here too, since a variant game shows no
 * classic board that would apply them.
 */

import { boardPrefs } from '../board/boardPreferences.js'
import { configureSound, playSound } from '../services/sound.js'

/**
 * Play a sound effect with the user's sound preference, volume and animation speed.
 *
 * @param {string|null} name one of SOUND_NAMES, or null for none
 * @return {boolean} whether something was scheduled
 */
export function variantSound(name) {
	if (!name || !boardPrefs.sound) {
		return false
	}
	configureSound({ enabled: true, volume: boardPrefs.volume })
	return playSound(name, { speed: boardPrefs.animationSpeedEffective })
}

/**
 * The sound of the moves played between two states: `capture` when one of the new history records captured, `move`
 * for any other new move, null when no move was added (the same position, a reload, a take-back).
 *
 * @param {object|null} before the state before
 * @param {object|null} after the state after
 * @return {'move'|'capture'|null}
 */
export function moveSound(before, after) {
	const from = before?.history?.length
	const list = after?.history ?? []
	if (!Number.isInteger(from) || list.length <= from) {
		return null
	}
	return list.slice(from).some((h) => h?.captures?.length) ? 'capture' : 'move'
}

/**
 * The sound of a game's end for the human sides on this device: `loss` when the only human side did not win (a draw
 * sounds like a win, as in the classic game), otherwise `win` (pass & play, a spectator).
 *
 * @param {object|null} result the game's result (`{ winner }` or `{ winners }`, neither for a draw)
 * @param {number[]} humans the human sides
 * @return {'win'|'loss'|null}
 */
export function endSound(result, humans) {
	if (!result) {
		return null
	}
	if (humans.length !== 1) {
		return 'win'
	}
	const winners = Number.isInteger(result.winner)
		? [result.winner]
		: (Array.isArray(result.winners) ? result.winners : [])
	return winners.length && !winners.includes(humans[0]) ? 'loss' : 'win'
}
