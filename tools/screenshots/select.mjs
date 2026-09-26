/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The command line of screenshots.mjs: which images a run makes and where it writes them. Kept apart from the tool,
 * which starts a browser as soon as it is loaded, so that the unit tests can check it.
 */
import { resolve } from 'node:path'

/** The images the tool makes (file names without extension), as screenshots/README.md lists them. */
export const IMAGES = Object.freeze([
	'01-game-ghosts',
	'01-game-ghosts-small',
	'02-roll',
	'03-lobby-dashboard',
	'04-trainer',
	'05-ai-opponent',
	'06-dark',
	'07-phone',
	'08-variants',
	'09-multiverse',
	'10-variant-boards',
])

/** Names that stand for several images. */
const GROUPS = Object.freeze({ variants: ['08', '09', '10'] })

/**
 * Read the arguments of a run: names limit it to the images whose file names start with them (`variants` stands for
 * 08 to 10; none given means all), and `--out=<dir>` writes the images into another directory than `defaultOut`.
 *
 * @param {string[]} args the command-line arguments
 * @param {string} defaultOut the directory the images go to by default
 * @return {{out: string, wanted: (...names: string[]) => boolean}} the directory, and whether the run makes one of the
 *   images named (file names without extension)
 * @throws {Error} for an unknown option, or a name that starts no image's file name
 */
export function parseScreenshotArgs(args, defaultOut) {
	let out = defaultOut
	const prefixes = []
	for (const arg of args) {
		if (arg.startsWith('--out=') && arg.length > '--out='.length) {
			out = resolve(arg.slice('--out='.length))
		} else if (arg.startsWith('-')) {
			throw new Error(`Unknown option ${arg}: the options are image names and --out=<dir>`)
		} else {
			const group = GROUPS[arg] ?? [arg]
			if (!group.every((prefix) => IMAGES.some((name) => name.startsWith(prefix)))) {
				throw new Error(`No image starts with "${arg}": the images are ${IMAGES.join(', ')}`)
			}
			prefixes.push(...group)
		}
	}
	const wanted = (...names) => !prefixes.length
		|| names.some((name) => prefixes.some((prefix) => name.startsWith(prefix)))
	return { out, wanted }
}
