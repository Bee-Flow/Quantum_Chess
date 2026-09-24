/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The runner of one puzzle: real rolls, grading against the puzzle's accepted moves, the punishing roll and reply
 * after a wrong move with the trap text, "Try again", two hint tiers (a nudge, then the idea), the stars earned, and
 * "Replay the other result" after a rolled solution. Tries and hints cost stars.
 */

import { t } from '@nextcloud/l10n'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import { findMove, generateMoves, squareName } from '../../engine/index.js'
import { outcomeLabel, resultSentence } from '../../engine/ui/index.js'
import { sleep } from '../../services/async.js'
import { progress, puzzleStars, recordPuzzle } from '../progress.js'
import { puzzleById, PUZZLES } from '../puzzles/index.js'
import { isAccepted, otherOutcomes, playMove, punishingOutcome, stepState, trapFor, wonBy } from '../runner.js'

/** Pause before the punishing reply to a wrong move, so both moves can be followed. */
const REPLY_DELAY_MS = 350

/** The level of the computer player that punishes a wrong move. */
const REPLY_LEVEL = 4

/**
 * @param {object} options the puzzle screen
 * @param {() => string} options.puzzleId the puzzle id from the route; a new id restarts the runner
 * @param {object} options.playback the board playback (`usePlayback()`)
 * @return {object} the puzzle state and actions for PuzzleView
 */
export function usePuzzleRunner({ puzzleId, playback }) {
	const puzzle = computed(() => puzzleById(String(puzzleId() ?? '').toUpperCase()))
	const number = computed(() => PUZZLES.indexOf(puzzle.value) + 1)
	const next = computed(() => PUZZLES[number.value] ?? null)
	/** ready | busy | solved | failed */
	const phase = ref('ready')
	const message = ref(null)
	const tries = ref(0)
	const hints = ref(0)
	const hintTier = ref(0)
	const earned = ref(0)
	/** The solving rolled move {before, move, key}, for "Replay the other result". */
	const played = ref(null)
	const otherIndex = ref(-1)
	const start = shallowRef(null)

	const goalText = computed(() => {
		switch (puzzle.value?.type) {
			case 'forced': return t('quantumchess', 'Win with certainty.')
			case 'max': return t('quantumchess', 'Find the best chance to capture the king.')
			case 'survive': return puzzle.value.side === 'b'
				? t('quantumchess', 'Don\'t lose by force.')
				: t('quantumchess', 'Keep your king.')
			default: return t('quantumchess', 'Save as much as you can.')
		}
	})

	const legalMoves = computed(() => (phase.value === 'ready' && playback.state.value
		? generateMoves(toRaw(playback.state.value))
		: []))

	/** Set up the puzzle (again). */
	function reset() {
		start.value = stepState(puzzle.value, null)
		playback.set(start.value)
		phase.value = 'ready'
		message.value = null
		played.value = null
		otherIndex.value = -1
	}

	watch(puzzleId, () => {
		if (!puzzle.value) {
			return
		}
		tries.value = 0
		hints.value = 0
		hintTier.value = 0
		reset()
	}, { immediate: true })

	// --- Hints: a nudge (highlight and sentence), then the idea (arrow) ---
	const solution = computed(() => (start.value && puzzle.value
		? findMove(start.value, puzzle.value.accepted[0])
		: null))
	const hintTexts = computed(() => {
		const out = []
		if (hintTier.value >= 1) {
			out.push(puzzle.value.nudge())
		}
		if (hintTier.value >= 2 && solution.value) {
			out.push(t(
				'quantumchess',
				'Look at the move to {square}.',
				{ square: solution.value.to.map(squareName).join(' / ') },
			))
		}
		return out
	})
	const highlights = computed(() => (hintTier.value >= 1 && phase.value === 'ready' && solution.value
		? solution.value.from.map((square) => ({ square, kind: 'hint' }))
		: []))
	const arrows = computed(() => (hintTier.value >= 2 && phase.value === 'ready' && solution.value
		? [{ from: solution.value.from[0], to: solution.value.to[0], kind: 'best' }]
		: []))

	/** Reveal the next hint tier. */
	function nextHint() {
		hintTier.value++
		hints.value++
	}

	// --- Replay the other result ---
	const otherKeys = computed(() => (played.value ? otherOutcomes(played.value.move, played.value.key) : []))
	const preview = computed(() => {
		if (otherIndex.value < 0 || !played.value) {
			return null
		}
		const key = otherKeys.value[otherIndex.value]
		return {
			state: playMove(played.value.before, played.value.move.code, key).state,
			kind: 'history',
			label: t('quantumchess', 'The other result: {result}', { result: outcomeLabel(key) }),
		}
	})

	/** Cycle through the other results and back. */
	function toggleOther() {
		otherIndex.value = otherIndex.value + 1 < otherKeys.value.length ? otherIndex.value + 1 : -1
	}

	/** Close the other result. */
	function closeOther() {
		otherIndex.value = -1
	}

	/**
	 * The player moved: grade the move, record the attempt, and on a wrong move play the punishing reply.
	 *
	 * @param {import('../../engine/types.js').LegalMove} move the move played
	 */
	async function onMove(move) {
		if (phase.value !== 'ready') {
			return
		}
		const p = puzzle.value
		phase.value = 'busy'
		tries.value++
		const accepted = isAccepted(p, move)
		const before = toRaw(playback.state.value)
		// Rolls are real for a right move; a wrong move gets the roll that punishes it.
		const res = await playback.play(move.code, {
			outcome: accepted ? null : punishingOutcome(before, move.code, p.side),
		})
		const sentence = res.measurement
			? resultSentence({ before, move: res.move, measurement: res.measurement })?.text
			: null
		if (accepted) {
			played.value = res.measurement ? { before, move: res.move, key: res.measurement.key } : null
			earned.value = puzzleStars(tries.value, hints.value)
			recordPuzzle(p.id, { solved: true, stars: earned.value, tries: tries.value, hints: hints.value })
			message.value = { type: 'success', text: t('quantumchess', 'Solved!') + ' ' + p.idea(), detail: sentence }
			phase.value = 'solved'
			return
		}
		recordPuzzle(p.id, {
			solved: Boolean(progress.puzzles?.[p.id]?.solved),
			tries: tries.value,
			hints: hints.value,
		})
		if (!wonBy(res.after, p.side)) {
			await sleep(REPLY_DELAY_MS)
			await playback.engineReply(REPLY_LEVEL, (s, code) => punishingOutcome(s, code, p.side))
		}
		const trap = trapFor(p, move)
		message.value = {
			type: 'error',
			text: trap
				? trap.text()
				: (wonBy(res.after, p.side)
						? t('quantumchess', 'That worked this time, but it was a gamble. There is a better move.')
						: t('quantumchess', 'Not the best move.')),
			detail: t('quantumchess', 'Try again.'),
		}
		phase.value = 'failed'
	}

	return {
		puzzle,
		number,
		next,
		phase,
		message,
		earned,
		hintTier,
		hintTexts,
		highlights,
		arrows,
		legalMoves,
		goalText,
		otherKeys,
		otherIndex,
		preview,
		nextHint,
		toggleOther,
		closeOther,
		reset,
		onMove,
	}
}
