/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The chess variants in the browser: the saved record of the variant game open on the page, the names of the board's
 * squares, moves played through the board, and games written straight into the browser storage (for screenshots of a
 * position that takes many moves to reach). The rules modules run here in Node, as they run in the page, so a test
 * picks its moves from the same legal moves the board offers.
 */
import { expect } from '@playwright/test'
import { localGameId } from '../../../src/services/ids.js'
import { moveSquares, sidePieceType } from '../../../src/variantplay/marks.js'
import {
	INDEX_KEY,
	packWorlds,
	RECORD_PREFIX,
	RECORD_VERSION,
	unpackWorlds,
} from '../../../src/variantplay/variantGames.js'
import {
	applyOutcome,
	branches,
	isLegal,
	legalMoves,
	loadVariant,
	newGame,
	optionValues,
} from '../../../src/variants/index.js'

/** The move modes of the game screen by move type (the labels of their buttons). */
const MODE_LABELS = { move: 'Move', split: 'Split', merge: 'Merge', measure: 'Measure' }

/**
 * A storage key of the app without its `quantumchess.` prefix: the page stores it as `quantumchess/<uid>/<rest>`
 * (services/storage.js).
 *
 * @param {string} key logical key, starting with `quantumchess.`
 * @return {string}
 */
function perUser(key) {
	return key.slice('quantumchess.'.length)
}

/**
 * A state as it is used, from its saved form (the worlds packed or in full).
 *
 * @param {object} state saved state
 * @return {object}
 */
function unpacked(state) {
	return { ...state, worlds: unpackWorlds(state.worlds) }
}

/**
 * The saved record of the variant game open on the page (route /variants/:variant/:id), with its states unpacked, or
 * null when the page shows no stored game.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<object|null>}
 */
export async function variantRecord(page) {
	const rec = await page.evaluate((prefix) => {
		const match = window.location.hash.match(/^#\/variants\/[^/]+\/([^/?]+)/)
		if (!match) {
			return null
		}
		const key = `quantumchess/${document.head.dataset.user}/${prefix}${decodeURIComponent(match[1])}`
		return JSON.parse(window.localStorage.getItem(key) ?? 'null')
	}, perUser(RECORD_PREFIX))
	return rec ? { ...rec, initial: unpacked(rec.initial), current: unpacked(rec.current) } : null
}

/**
 * The name of a square as the board names its cell (`data-square`): the layout's name when the variant draws its
 * board per state (the multiverse: "Timeline 0, turn 2, White to move: d1"), else the topology's.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} sq square
 * @return {string}
 */
export function squareName(V, state, sq) {
	return (V.layoutOf ? V.layoutOf(state).names : V.topology.names)[sq]
}

/**
 * The cell of a square on the board.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name the square's name (`squareName`)
 * @return {import('@playwright/test').Locator}
 */
export function boardCell(page, name) {
	return page.locator(`.qc-vboard__cell[data-square="${name.replace(/(["\\])/g, '\\$1')}"]`)
}

/**
 * Click a cell of the board. A board that is zoomed in on the boards to play (the multiverse) may have the cell
 * outside the part in view: then "Whole board" shows everything first, as a player would do.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name the square's name (`squareName`)
 * @return {Promise<void>}
 */
export async function clickCell(page, name) {
	const cell = boardCell(page, name)
	const [box, frame] = await Promise.all([cell.boundingBox(), page.locator('svg.qc-vboard').first().boundingBox()])
	const x = box ? box.x + box.width / 2 : -1
	const y = box ? box.y + box.height / 2 : -1
	const inView = frame && x > frame.x && x < frame.x + frame.width && y > frame.y && y < frame.y + frame.height
	const whole = page.getByRole('button', { name: 'Whole board' })
	if (!inView && await whole.isVisible() && await whole.isEnabled()) {
		await whole.click()
	}
	await cell.click()
}

/**
 * Wait until `side` is to move in the game on the page, with at least `minMoves` moves saved, and the board takes
 * input. Fails at once when the game has ended.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {number} side the side that should move
 * @param {object} [options] options
 * @param {number} [options.minMoves] moves the record must hold at least
 * @param {number} [options.timeout] how long to wait, in milliseconds
 * @return {Promise<object>} the record
 */
export async function waitForVariantTurn(page, side, { minMoves = 0, timeout = 60_000 } = {}) {
	let rec = null
	await expect.poll(async () => {
		rec = await variantRecord(page)
		if (rec?.current.result) {
			return 'the game ended: ' + JSON.stringify(rec.current.result)
		}
		return rec && rec.current.turn === side && rec.moves.length >= minMoves ? 'to move' : 'waiting'
	}, { timeout, message: `side ${side} is to move after ${minMoves} moves` }).toBe('to move')
	// the board takes input: the from squares of the player's moves can be reached with the keyboard
	await expect(page.locator('.qc-vboard__cell[tabindex="0"]').first()).toBeAttached()
	return rec
}

/**
 * Play a move through the board as a player does: the move type, then the squares (a split: the piece and its two
 * targets), then "Play and roll" or "Play anyway" when the move waits for confirmation. Returns once the record holds
 * the move.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {object} V variant
 * @param {object} state the state on the board
 * @param {{code: string, type: string, from: number, to: number|number[]}} move a legal move of `legalMoves` (an
 *   ordinary move or a split)
 * @return {Promise<object>} the record after the move
 */
export async function playVariantMove(page, V, state, move) {
	const before = (await variantRecord(page)).moves.length
	const mode = move.type === 'split' ? 'split' : 'move'
	const modeButton = page.locator('.qc-vgame__modes').getByRole('button', { name: MODE_LABELS[mode], exact: true })
	if (await modeButton.getAttribute('aria-pressed') !== 'true') {
		await modeButton.click()
	}
	for (const sq of [move.from, move.to].flat()) {
		await clickCell(page, squareName(V, state, sq))
	}
	const confirm = page.locator('.qc-vgame__box--pending')
		.getByRole('button', { name: /^(Play and roll|Play anyway)$/ })
	let rec = null
	await expect.poll(async () => {
		rec = await variantRecord(page)
		if (rec.moves.length > before) {
			return rec.moves[before].code
		}
		if (await confirm.isVisible()) {
			await confirm.click()
		}
		return null
	}, { message: `the move ${move.code} is saved` }).toBe(move.code)
	return rec
}

/**
 * Replay moves from a start state, each with the index of its outcome, as the game screen saves them.
 *
 * @param {object} V variant
 * @param {object} initial start state
 * @param {Array<string|[string, number]>} codes move codes, or `[code, outcome index]` (default outcome 0)
 * @return {{state: object, moves: Array<{code: string, i: number, t?: string}>}}
 */
export function replayVariant(V, initial, codes) {
	let state = initial
	const moves = []
	for (const entry of codes) {
		const [code, i] = Array.isArray(entry) ? entry : [entry, 0]
		if (state.result || !isLegal(V, state, code) || !branches(V, state, code)?.[i]) {
			throw new Error(`${V.id}: ${code} (outcome ${i}) cannot be played here`)
		}
		// the type of the piece that moves, for the move list's letter (splits and merges tell it by their code)
		const ordinary = legalMoves(V, state).filter((m) => m.type === 'move')
		const { from } = moveSquares(V, code, ordinary)
		const t = from.length ? sidePieceType(state, from[0], state.turn) : null
		state = applyOutcome(V, state, code, i)
		moves.push(t ? { code, i, t } : { code, i })
	}
	return { state, moves }
}

/**
 * A small deterministic random source (mulberry32), for the setups that draw a random position.
 *
 * @param {number} seed seed
 * @return {() => number}
 */
export function seededRandom(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let r = Math.imul(a ^ (a >>> 15), a | 1)
		r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Store a variant game in the browser storage of the logged-in user of `page`, as the game screen saves one (record
 * version 2, listed under "Continue on this device"), and return its id. The page must show the app already.
 *
 * @param {import('@playwright/test').Page} page a page of the app
 * @param {object} game the game
 * @param {string} game.variant variant id
 * @param {object} [game.options] option values (the variant's defaults for the others)
 * @param {Array<{kind: 'human'|'computer', level?: string}>} [game.players] one per side (default: all human)
 * @param {Array<string|[string, number]>} [game.moves] the moves (`replayVariant`)
 * @param {number} [game.seed] seed of a random setup
 * @return {Promise<string>} the game id
 */
export async function seedVariantGame(page, { variant, options = {}, players, moves = [], seed = 7 }) {
	const V = await loadVariant(variant)
	const values = optionValues(V, options)
	const initial = newGame(V, values, seededRandom(seed))
	const { state, moves: played } = replayVariant(V, initial, moves)
	const now = Date.now()
	const id = localGameId()
	const rec = {
		v: RECORD_VERSION,
		id,
		variant,
		options: values,
		players: players ?? V.sides.map(() => ({ kind: 'human' })),
		autoFlip: false,
		initial: { ...initial, worlds: packWorlds(initial.worlds) },
		moves: played,
		rolls: {},
		current: { ...state, worlds: packWorlds(state.worlds) },
		created: now,
		updated: now,
	}
	const entry = {
		id,
		variant,
		updated: now,
		result: state.result ?? null,
		ply: state.ply,
		players: rec.players.map((p) => p.kind),
	}
	await page.evaluate(({ rec, entry, recordKey, indexKey }) => {
		const uid = document.head.dataset.user
		const at = (key) => `quantumchess/${uid}/${key}`
		const index = JSON.parse(window.localStorage.getItem(at(indexKey)) ?? '[]')
		window.localStorage.setItem(at(recordKey), JSON.stringify(rec))
		window.localStorage.setItem(at(indexKey), JSON.stringify([entry, ...index.filter((e) => e.id !== entry.id)]))
	}, {
		rec,
		entry,
		recordKey: perUser(RECORD_PREFIX + id),
		indexKey: perUser(INDEX_KEY),
	})
	return id
}
