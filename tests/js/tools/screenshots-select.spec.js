/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The command line of the screenshot tool (tools/screenshots/select.mjs): which images a run makes and where it
 * writes them.
 */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IMAGES, parseScreenshotArgs } from '../../../tools/screenshots/select.mjs'

const DEFAULT = '/srv/app/screenshots'

/**
 * The images a run with these arguments makes.
 *
 * @param {string[]} args command-line arguments
 * @return {string[]}
 */
function made(args) {
	const { wanted } = parseScreenshotArgs(args, DEFAULT)
	return IMAGES.filter((name) => wanted(name))
}

describe('parseScreenshotArgs', () => {
	it('makes every image into screenshots/ without arguments', () => {
		const { out } = parseScreenshotArgs([], DEFAULT)
		expect(out).toBe(DEFAULT)
		expect(made([])).toEqual(IMAGES)
	})

	it('makes only the images whose names start with the names given', () => {
		expect(made(['02', '09'])).toEqual(['02-roll', '09-multiverse'])
		expect(made(['01'])).toEqual(['01-game-ghosts', '01-game-ghosts-small'])
	})

	it('keeps 03 and 05 apart: they share the fake AI server, not the selection', () => {
		// 03 seeds the demo lobby (ending the demo users' games): a run for 05 alone must not do that
		expect(made(['05'])).toEqual(['05-ai-opponent'])
		expect(made(['03'])).toEqual(['03-lobby-dashboard'])
		const { wanted } = parseScreenshotArgs(['05'], DEFAULT)
		expect(wanted('03-lobby-dashboard', '05-ai-opponent')).toBe(true)
		expect(wanted('03-lobby-dashboard')).toBe(false)
	})

	it('reads "variants" as 08 to 10', () => {
		expect(made(['variants'])).toEqual(['08-variants', '09-multiverse', '10-variant-boards'])
	})

	it('writes into the directory of --out', () => {
		expect(parseScreenshotArgs(['--out=shots', '08'], DEFAULT).out).toBe(resolve('shots'))
	})

	it('stops at a name that matches no image or an unknown option, instead of making nothing', () => {
		expect(() => parseScreenshotArgs(['5'], DEFAULT)).toThrow(/No image starts with "5"/)
		expect(() => parseScreenshotArgs(['--out', '/tmp/shots'], DEFAULT)).toThrow(/Unknown option --out/)
		expect(() => parseScreenshotArgs(['--help'], DEFAULT)).toThrow(/Unknown option/)
	})
})
