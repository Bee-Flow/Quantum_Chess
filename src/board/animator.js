/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board's move and roll timeline: travel, suspense with the outcome ring, settle, collapse, then the reveal arrow
 * and the result chip. It only drives reactive state; the layers of `QuantumBoard` draw it.
 *
 * `play()` resolves at the end of the Collapse phase; `finish()` fast-forwards whatever runs; at speed Off (and under
 * reduced motion) the final state is shown at once and `play()` resolves immediately.
 */

import { shallowReactive } from 'vue'
import { diffViews } from '../engine/ui/index.js'
import { ringSegments, ringSquare, travelPlan } from './boardModel.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/**
 * A move to animate on the board.
 *
 * @typedef {object} MoveEvent
 * @property {EngineState} before the position before the move
 * @property {EngineState} after the position after the move
 * @property {LegalMove} move the move
 * @property {import('../engine/types.js').Measurement|null} measurement the roll, for a rolled move
 * @property {'self'|'opponent'} actor who moved, seen from the local user
 * @property {{mover: string, opponent: string}} [names] display names for the result sentence
 * @property {boolean} [lessonRoll] the roll was scripted by a lesson
 */

/** Base durations in ms, multiplied by the speed factor. */
export const DURATIONS = Object.freeze({
	move: 220,
	split: 320,
	merge: 320,
	travel: 220,
	suspense: 600,
	settle: 200,
	collapse: 250,
	reveal: 900,
	chip: 3000,
	chipReduced: 4000,
	revealStatic: 1500,
	serverWait: 8000,
})

/**
 * Create an animator.
 *
 * @param {object} hooks hooks
 * @param {() => number} hooks.speed speed factor (Slow 1.5, Normal 1, Fast 0.5, Off 0)
 * @param {(name: string) => void} [hooks.sound] play a sound effect
 * @param {() => (() => void)} [hooks.suspense] start the suspense sound, returns stop()
 * @param {(event: MoveEvent) => {chip: object|null, reveal: object|null, speech: string}} [hooks.describe] result chip,
 *   reveal arrow and spoken sentence of a move event
 * @param {(text: string) => void} [hooks.announce] live-region text
 * @return {object} `{state, play, startRoll, finish, dismissChip, dispose}`
 */
export function createAnimator({ speed, sound = () => {}, suspense = () => () => {}, describe = () => ({ chip: null, reveal: null, speech: '' }), announce = () => {} }) {
	const state = shallowReactive({
		busy: false,
		display: null,
		origins: {},
		instantLeave: [],
		moveDuration: 0,
		fade: 0,
		travel: null,
		ring: null,
		pops: [],
		reveal: null,
		chip: null,
		crossfade: false,
		sourceDim: null,
	})

	let skipping = false
	const timers = new Set()
	let chipTimer = null
	let revealTimer = null
	let waitingTimer = null
	let stopSuspense = null

	/**
	 * Wait for `ms`, or less when fast-forwarding.
	 *
	 * @param {number} ms milliseconds
	 * @return {Promise<void>}
	 */
	function wait(ms) {
		if (skipping || ms <= 0) {
			return Promise.resolve()
		}
		return new Promise((resolve) => {
			const entry = { resolve }
			entry.id = setTimeout(() => {
				timers.delete(entry)
				resolve()
			}, ms)
			timers.add(entry)
		})
	}

	/** Fast-forward the running phases. The chip and the reveal arrow still appear. */
	function finish() {
		skipping = true
		for (const entry of timers) {
			clearTimeout(entry.id)
			entry.resolve()
		}
		timers.clear()
	}

	/**
	 * Show the result chip for its dwell time.
	 *
	 * @param {object|null} chip chip data
	 * @param {boolean} reduced reduced motion (longer dwell)
	 */
	function showChip(chip, reduced) {
		clearTimeout(chipTimer)
		state.chip = chip
		if (chip !== null) {
			chipTimer = setTimeout(() => {
				state.chip = null
			}, reduced ? DURATIONS.chipReduced : DURATIONS.chip)
		}
	}

	/**
	 * Show the reveal arrow.
	 *
	 * @param {object|null} reveal {from, to}
	 * @param {number} ms how long
	 */
	function showReveal(reveal, ms) {
		clearTimeout(revealTimer)
		state.reveal = reveal
		if (reveal !== null) {
			revealTimer = setTimeout(() => {
				state.reveal = null
			}, ms)
		}
	}

	/** Clear every transient part of an animation. */
	function clearPhase() {
		state.travel = null
		state.ring = null
		state.pops = []
		state.origins = {}
		state.instantLeave = []
		state.sourceDim = null
		state.crossfade = false
		clearTimeout(waitingTimer)
		if (stopSuspense) {
			stopSuspense()
			stopSuspense = null
		}
	}

	/**
	 * After the collapse: reveal arrow, chip, live region.
	 *
	 * @param {MoveEvent} event the move
	 * @param {number} f speed factor
	 */
	function aftermath(event, f) {
		let info = { chip: null, reveal: null, speech: '' }
		try {
			info = describe(event) ?? info
		} catch {
			// display only: a failing description never breaks the game
		}
		showReveal(info.reveal, f === 0 ? DURATIONS.revealStatic : DURATIONS.reveal * f)
		showChip(info.chip, f === 0)
		if (info.speech) {
			announce(info.speech)
		}
	}

	/**
	 * The sound of a move that does not roll.
	 *
	 * @param {MoveEvent} event the move
	 * @return {string}
	 */
	function plainSound(event) {
		const m = event.move
		if (m.type === 'split') {
			return 'split'
		}
		if (m.type === 'merge' && !m.capture) {
			return 'merge'
		}
		return event.after.captured.length > event.before.captured.length ? 'capture' : 'move'
	}

	/**
	 * Animate a move that does not roll (or any move at speed Off).
	 *
	 * @param {MoveEvent} event the move
	 * @param {number} f speed factor
	 */
	async function playPlain(event, f) {
		const m = event.move
		const dur = (m.type === 'split' || m.type === 'merge' ? DURATIONS.split : DURATIONS.move) * f
		if (f > 0) {
			const plan = travelPlan(event.before, event.after, m)
			state.origins = plan.origins
			state.instantLeave = plan.instantLeave
		} else {
			state.crossfade = true
		}
		state.moveDuration = f > 0 ? dur : 150
		state.fade = f > 0 ? dur : 150
		state.display = event.after
		if (event.measurement) {
			sound(event.move.type === 'measure' ? 'measure' : 'move')
			sound(event.measurement.key === 'capture' ? 'captured' : (event.measurement.key === 'miss' ? 'missed' : 'moved'))
		} else {
			sound(plainSound(event))
		}
		await wait(dur)
		clearPhase()
		aftermath(event, f)
	}

	/**
	 * Start a rolled move: travel and suspense run until `resolve()` gives the result (online own moves).
	 *
	 * @param {object} input input
	 * @param {EngineState} input.before state before
	 * @param {LegalMove} input.move the move
	 * @param {'self'|'opponent'} [input.actor] who moved (the opponent's rolls have no travel)
	 * @return {{resolve: (result: {after: object, measurement: object, names?: object, lessonRoll?: boolean}) => Promise<void>,
	 *   fail: () => Promise<void>}}
	 */
	function startRoll({ before, move, actor = 'self' }) {
		skipping = false
		clearPhase()
		state.busy = true
		state.display = before
		const f = speed()
		let settled = false
		const started = (async () => {
			if (f === 0) {
				return
			}
			if (actor === 'self' && move.type !== 'measure') {
				state.sourceDim = { piece: move.piece, squares: move.from.slice() }
				state.travel = { piece: move.piece, type: before.types[move.piece], color: move.piece < 16 ? 'w' : 'b', from: move.from[0], to: move.to[move.to.length - 1], duration: DURATIONS.travel * f }
				sound('move')
				await wait(DURATIONS.travel * f)
			} else if (move.type === 'measure') {
				sound('measure')
			}
			state.ring = { square: ringSquare(move), segments: ringSegments(move.outcomes), settled: null }
			stopSuspense = suspense()
			waitingTimer = setTimeout(() => {
				if (!settled) {
					state.chip = { waiting: true }
				}
			}, DURATIONS.serverWait)
			await wait(DURATIONS.suspense * f)
		})()

		return {
			async resolve({ after, measurement, ...rest }) {
				await started
				settled = true
				clearTimeout(waitingTimer)
				if (state.chip?.waiting) {
					state.chip = null
				}
				const event = { before, after, move, measurement, actor, ...rest }
				if (f === 0) {
					await playPlain(event, 0)
					state.busy = false
					return
				}
				if (stopSuspense) {
					stopSuspense()
					stopSuspense = null
				}
				if (state.ring) {
					state.ring = { ...state.ring, settled: measurement.key }
				}
				await wait(DURATIONS.settle * f)
				// Collapse
				const diff = diffViews(before, after)
				const pops = []
				diff.pieces.forEach((p) => {
					if (p.kind === 'settled' || p.piece === move.piece) {
						for (const s of p.to ?? []) {
							pops.push(p.piece + ':' + s)
						}
					}
				})
				const plan = travelPlan(before, after, move, { skipMover: actor === 'self' })
				state.origins = plan.origins
				state.instantLeave = actor === 'self' ? [] : plan.instantLeave
				state.moveDuration = DURATIONS.collapse * f
				state.fade = DURATIONS.collapse * f
				state.pops = pops
				state.travel = null
				state.sourceDim = null
				state.ring = null
				state.display = after
				sound(measurement.key === 'capture' ? 'captured' : (measurement.key === 'miss' ? 'missed' : 'moved'))
				await wait(DURATIONS.collapse * f)
				clearPhase()
				aftermath(event, f)
				state.busy = false
			},
			async fail() {
				finish()
				await started
				settled = true
				clearPhase()
				state.display = null
				state.busy = false
			},
		}
	}

	/**
	 * Play a move event; resolves at the end of the Collapse phase.
	 *
	 * @param {MoveEvent} event the move
	 * @return {Promise<void>}
	 */
	async function play(event) {
		const f = speed()
		if (!event.measurement || f === 0) {
			skipping = false
			clearPhase()
			state.busy = true
			try {
				await playPlain(event, event.measurement ? 0 : f)
			} finally {
				state.busy = false
			}
			return
		}
		const handle = startRoll(event)
		await handle.resolve(event)
	}

	/** Hide the result chip. */
	function dismissChip() {
		clearTimeout(chipTimer)
		state.chip = null
	}

	/** Stop every timer (unmount). */
	function dispose() {
		finish()
		clearPhase()
		clearTimeout(chipTimer)
		clearTimeout(revealTimer)
	}

	return { state, play, startRoll, finish, dismissChip, dispose }
}
