/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Parity fixture generator (docs/engine-rules.md §12). `npm run fixtures` writes tests/fixtures/engine/:
 *
 *   vectors.json   hand-written vectors: start, rescale, r → u, pct, W1–W17 and §11 edge cases as scripted games,
 *                  whyIllegal cases (inputs → reason codes), setup vectors and setup errors
 *   parser.json    lenient parser cases (§4.12) and notation round trips: [{input, expect}]
 *   views.json     derived views per state
 *   records.json   chain, roll display, roll memo, support keys, certainFen, sha256
 *   games-NNN.json seeded random games (arrays of up to 20 games)
 *
 * Deterministic: the same code gives the same bytes (seeded PRNG for move choice and u, no clock, no Math.random).
 * The generator asserts that every feature §12 lists occurs, prints the coverage counts, and refuses to write more
 * than 8 MB (2 MB per file). The parts live in tests/fixtures/generator/.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXAMPLE_SCRIPTS, HAND_WHY, RANDOM_GAMES } from './generator/cases.mjs'
import { reportCoverage } from './generator/coverage.mjs'
import { playGame, scripted, why, whyCases } from './generator/play.mjs'
import { parserFixtures, recordFixtures, vectorFixtures, viewFixtures } from './generator/vectors.mjs'
import { writeFixtures } from './generator/write.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'engine')

// The order matters for the bytes: the scripted examples, then the hand-picked whyIllegal cases, then the random
// games (which record more whyIllegal cases as they are played).
const examples = EXAMPLE_SCRIPTS.map(([name, from, moves]) => scripted(name, from, moves))
for (const [name, state, input] of HAND_WHY) {
	why(name, state, input)
}
const games = RANDOM_GAMES.map(playGame)

const files = {
	'vectors.json': vectorFixtures(examples, whyCases),
	'parser.json': parserFixtures(examples, games),
	'views.json': viewFixtures(examples, games),
	'records.json': recordFixtures(examples, games),
}
if (!reportCoverage(games.length + examples.length) || !writeFixtures(OUT, files, games)) {
	process.exit(1)
}
