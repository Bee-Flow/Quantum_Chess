/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** The 1.0 puzzle set (GAME-DESIGN §5.2.2), in order. */

import P01 from './P01.js'
import P02 from './P02.js'
import P03 from './P03.js'
import P04 from './P04.js'
import P05 from './P05.js'
import P06 from './P06.js'
import P07 from './P07.js'
import P08 from './P08.js'
import P09 from './P09.js'
import P10 from './P10.js'
import P11 from './P11.js'

export const PUZZLES = Object.freeze([P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11])

/**
 * A puzzle by id.
 *
 * @param {string} id e.g. 'P05'
 * @return {object|null}
 */
export function puzzleById(id) {
	return PUZZLES.find((p) => p.id === id) ?? null
}
