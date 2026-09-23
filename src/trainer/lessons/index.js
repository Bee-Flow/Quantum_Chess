/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** The curriculum in order (GAME-DESIGN §5.1.2). */

import L01 from './L01-capture-king.js'
import L02 from './L02-split.js'
import L03 from './L03-merge.js'
import L04 from './L04-land-roll.js'
import L05 from './L05-pass-link.js'
import L06 from './L06-odds.js'
import L07 from './L07-solid.js'
import L08 from './L08-measure.js'
import L09 from './L09-gamble.js'
import L10 from './L10-split-survive.js'
import L11 from './L11-first-game.js'

export const LESSONS = Object.freeze([L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11])

/**
 * A lesson by id.
 *
 * @param {string} id e.g. 'L04'
 * @return {object|null}
 */
export function lessonById(id) {
	return LESSONS.find((l) => l.id === id) ?? null
}
