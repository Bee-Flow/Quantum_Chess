/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Writing the fixture files: the game fixtures go into `games-NNN.json` batches of at most 20 games and about
 * 1.8 MB; no file may exceed 2 MB and all of them together 8 MB. Existing `.json` files are removed first, so a
 * batch that is no longer produced does not linger.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_TOTAL = 8 * 1024 * 1024
const MAX_FILE = 2 * 1024 * 1024
const FILE_TARGET = 1800 * 1024

/**
 * Write every fixture file (one JSON document per line) and print the sizes.
 *
 * @param {string} dir output directory
 * @param {Record<string, unknown>} files the other files by name, written first in this order
 * @param {object[]} games the random game fixtures
 * @return {boolean} false when a size limit is exceeded
 */
export function writeFixtures(dir, files, games) {
	mkdirSync(dir, { recursive: true })
	for (const f of readdirSync(dir)) {
		if (f.endsWith('.json')) {
			rmSync(join(dir, f))
		}
	}
	const all = { ...files }
	let index = 1
	let batch = []
	let batchSize = 2
	const flush = () => {
		if (batch.length > 0) {
			all['games-' + String(index).padStart(3, '0') + '.json'] = batch
			index++
			batch = []
			batchSize = 2
		}
	}
	for (const g of games) {
		const size = JSON.stringify(g).length + 2
		if (batch.length === 20 || (batch.length > 0 && batchSize + size > FILE_TARGET)) {
			flush()
		}
		batch.push(g)
		batchSize += size
	}
	flush()

	let total = 0
	for (const [name, data] of Object.entries(all)) {
		const text = JSON.stringify(data) + '\n'
		const bytes = Buffer.byteLength(text)
		if (bytes > MAX_FILE) {
			console.error(name + ' is ' + bytes + ' bytes, more than 2 MB')
			return false
		}
		total += bytes
		writeFileSync(join(dir, name), text)
		console.log('wrote ' + name.padEnd(16) + String(bytes).padStart(9) + ' bytes')
	}
	if (total > MAX_TOTAL) {
		console.error('fixtures total ' + total + ' bytes, more than 8 MB')
		return false
	}
	console.log('total ' + total + ' bytes')
	return true
}
