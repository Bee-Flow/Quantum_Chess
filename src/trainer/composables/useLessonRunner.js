/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The step machine of a lesson. A lesson is a list of steps: explain (text, sometimes with arrows), task (the player
 * makes a move that a predicate checks), quiz, watch (a scripted move with narration) and game (the graduation game
 * against the computer player). Rolls in a lesson are lesson rolls: their outcome is scripted, and afterwards the
 * player can look at the other result. Hints and retries cost stars.
 */

import { t } from '@nextcloud/l10n'
import { computed, ref, toRaw, watch } from 'vue'
import { findMove, generateMoves, squareIndex } from '../../engine/index.js'
import { outcomeLabel } from '../../engine/ui/index.js'
import { sleep } from '../../services/async.js'
import { markGraduationGame } from '../events.js'
import { lessonById, LESSONS } from '../lessons/index.js'
import { check } from '../predicates.js'
import { lessonStars, recordLesson } from '../progress.js'
import { arrowsOf, lessonOutcome, movesForModes, otherOutcomes, playMove, scriptedReply, stepState } from '../runner.js'

/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

/** Pause before the scripted or computer reply to the player's move, so both moves can be followed. */
const REPLY_DELAY_MS = 350

/**
 * @param {object} options the lesson screen
 * @param {() => string} options.lessonId the lesson id from the route; a new id restarts the runner
 * @param {object} options.playback the board playback (`usePlayback()`)
 * @param {(options: object) => {id: string}} options.createGame creates the graduation game (`createLocalGame`)
 * @param {(id: string) => void} options.openGame opens a local game
 * @return {object} the lesson state and actions for LessonView
 */
export function useLessonRunner({ lessonId, playback, createGame, openGame }) {
	const lesson = computed(() => lessonById(String(lessonId() ?? '').toUpperCase()))
	const index = ref(0)
	const step = computed(() => lesson.value?.steps[index.value] ?? null)
	/** ready | busy | success | failed */
	const phase = ref('ready')
	const message = ref(null)
	const finished = ref(false)
	const stars = ref(0)
	const hints = ref(0)
	const retries = ref(0)
	const hintTier = ref(0)
	const wrongAnswers = ref([])
	/** The step's own rolled move {before, move, key}, for "Show the other result". */
	const played = ref(null)
	const otherIndex = ref(-1)
	let stepStart = null

	const next = computed(() => {
		const i = LESSONS.findIndex((l) => l.id === lesson.value?.id)
		return i >= 0 ? LESSONS[i + 1] ?? null : null
	})
	const interactive = computed(() => step.value?.type === 'task' && phase.value === 'ready')
	const legalMoves = computed(() => {
		const s = playback.state.value
		return interactive.value && s ? movesForModes(generateMoves(toRaw(s)), step.value.modes) : []
	})

	// --- Hints and decorations ---
	const shownHints = computed(() => (step.value?.hints ?? []).slice(0, hintTier.value))
	const hintTexts = computed(() => shownHints.value.filter((h) => typeof h === 'function').map((h) => h()))
	const arrows = computed(() => [
		...arrowsOf(step.value?.type === 'explain' ? step.value.arrows : []),
		...arrowsOf(shownHints.value.filter((h) => h.arrow).map((h) => h.arrow)),
	])
	const highlights = computed(() => shownHints.value.filter((h) => h.highlight).map((h) => ({ square: squareIndex(h.highlight), kind: 'hint' })))

	/** Reveal the next hint tier. */
	function nextHint() {
		hintTier.value++
		hints.value++
	}

	// --- The other result of a lesson roll ---
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
	const otherText = computed(() => {
		if (otherIndex.value < 0 || !played.value) {
			return ''
		}
		return branchText(otherKeys.value[otherIndex.value]) ?? ''
	})

	/** Cycle through the other results and back. */
	function toggleOther() {
		otherIndex.value = otherIndex.value + 1 < otherKeys.value.length ? otherIndex.value + 1 : -1
	}

	/**
	 * The branch text of an outcome.
	 *
	 * @param {string|null} key outcome key
	 * @return {string|null}
	 */
	function branchText(key) {
		const b = key ? step.value?.branches?.[key] : null
		return b ? b() : null
	}

	// --- Steps ---

	/**
	 * Enter a step.
	 *
	 * @param {number} i step index
	 */
	function enter(i) {
		index.value = i
		const s = step.value
		const start = stepState(s, toRaw(playback.state.value))
		if (s.setup || !playback.state.value) {
			playback.set(start)
		}
		stepStart = start
		phase.value = 'ready'
		message.value = null
		hintTier.value = 0
		wrongAnswers.value = []
		played.value = null
		otherIndex.value = -1
	}

	/** Start the lesson from its first step. */
	function begin() {
		finished.value = false
		hints.value = 0
		retries.value = 0
		playback.set(null)
		if (lesson.value) {
			enter(0)
		}
	}
	watch(lessonId, begin, { immediate: true })

	/** Next step, or finish the lesson and record its stars. */
	function advance() {
		if (index.value + 1 < lesson.value.steps.length) {
			enter(index.value + 1)
			return
		}
		stars.value = lessonStars(hints.value, retries.value)
		recordLesson(lesson.value.id, stars.value)
		finished.value = true
	}

	const starsText = computed(() => {
		if (stars.value === 3) {
			return t('quantumchess', 'Perfect: no hints and no retries.')
		}
		return t('quantumchess', 'Replay the lesson without hints and retries for three stars.')
	})

	/**
	 * Play a reply: a scripted move, or a move of the computer player.
	 *
	 * @param {{scripted?: object, engine?: number}|undefined} reply reply descriptor
	 * @return {Promise<void>}
	 */
	async function reply(reply) {
		if (!reply || playback.state.value.result) {
			return
		}
		await sleep(REPLY_DELAY_MS)
		const code = scriptedReply(reply, toRaw(playback.state.value))
		if (code) {
			const m = findMove(toRaw(playback.state.value), code)
			await playback.play(code, { outcome: lessonOutcome(m), actor: 'opponent', lessonRoll: true })
		} else if (reply.engine) {
			await playback.engineReply(reply.engine)
		}
	}

	/**
	 * The player moved in a task: check it, show the result and play the reply.
	 *
	 * @param {LegalMove} move the move
	 */
	async function onMove(move) {
		const s = step.value
		if (s?.type !== 'task' || phase.value !== 'ready') {
			return
		}
		phase.value = 'busy'
		message.value = null
		const outcome = lessonOutcome(move, s.roll)
		const res = await playback.play(move.code, { outcome, lessonRoll: true })
		const ok = check(s.success, res.before, res.move, res.after)
		if (ok) {
			const key = res.measurement?.key ?? null
			played.value = res.measurement ? { before: res.before, move: res.move, key } : null
			const text = branchText(key) ?? s.done?.() ?? t('quantumchess', 'Well done!')
			message.value = { type: 'success', text }
			await reply(s.reply)
			phase.value = 'success'
		} else {
			retries.value++
			await reply(s.failReply ?? s.reply)
			message.value = { type: 'error', text: s.fail?.() ?? t('quantumchess', 'Not quite.') }
			phase.value = 'failed'
		}
	}

	/** Reset the task. */
	function retry() {
		playback.set(stepStart)
		phase.value = 'ready'
		message.value = null
		played.value = null
		otherIndex.value = -1
	}

	/**
	 * Answer a quiz.
	 *
	 * @param {number} i answer index
	 */
	function answer(i) {
		const s = step.value
		if (i === s.correct) {
			phase.value = 'success'
			message.value = { type: 'success', text: s.explanation() }
		} else {
			retries.value++
			wrongAnswers.value = [...wrongAnswers.value, i]
			message.value = { type: 'warning', text: t('quantumchess', 'Not quite. Try another answer.') }
		}
	}

	/**
	 * The button variant of a quiz answer.
	 *
	 * @param {number} i answer index
	 * @return {string}
	 */
	function answerVariant(i) {
		if (phase.value === 'success' && i === step.value.correct) {
			return 'success'
		}
		return wrongAnswers.value.includes(i) ? 'error' : 'secondary'
	}

	/** Play the scripted move of a watch step. */
	async function playWatchStep() {
		const s = step.value
		const m = findMove(toRaw(playback.state.value), s.code)
		if (!m) {
			return
		}
		phase.value = 'busy'
		const res = await playback.play(m.code, { outcome: lessonOutcome(m, s.roll), actor: 'opponent', lessonRoll: true })
		const key = res.measurement?.key ?? null
		played.value = res.measurement ? { before: res.before, move: res.move, key } : null
		message.value = { type: 'info', text: branchText(key) ?? '' }
		phase.value = 'success'
	}

	/** Start the graduation game against the computer player. */
	function startGame() {
		const record = createGame({
			mode: 'computer',
			players: { w: { kind: 'human' }, b: { kind: 'engine', level: step.value.level ?? 1 } },
			humanColor: 'w',
			options: { coach: 'beginner', lesson: lesson.value.id },
		})
		markGraduationGame(record.id)
		openGame(record.id)
	}

	return {
		lesson,
		index,
		step,
		phase,
		message,
		finished,
		stars,
		starsText,
		hintTier,
		hintTexts,
		wrongAnswers,
		otherIndex,
		otherKeys,
		otherText,
		next,
		interactive,
		legalMoves,
		arrows,
		highlights,
		preview,
		nextHint,
		toggleOther,
		advance,
		onMove,
		retry,
		answer,
		answerVariant,
		playWatchStep,
		startGame,
	}
}
