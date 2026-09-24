/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Generic formatting: ratings and deadlines.
 */

import { describe, expect, it } from 'vitest'
import { formatDeadline, formatRating } from '../../../src/services/format.js'

describe('formatting', () => {
	it('formats ratings and deadlines', () => {
		expect(formatRating(1284.4, true)).toBe('1284?')
		expect(formatRating(null)).toBe('')
		expect(formatDeadline(1000 + 18 * 3600, 1000)).toBe('18 h left')
		expect(formatDeadline(1000 + 3 * 86400, 1000)).toBe('3 days left')
		expect(formatDeadline(null, 0)).toBe('')
	})
})
