<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One lesson (GAME-DESIGN §5.1): explain, task, quiz, watch and game steps; lesson rolls with "Show the other result";
  hints; "Try again" after a failed task; stars at the end (route /trainer/lesson/:id).
-->
<template>
	<NcEmptyContent
		v-if="!lesson"
		:name="t('quantumchess', 'Lesson not found')">
		<template #action>
			<NcButton variant="primary" to="/trainer">
				{{ t('quantumchess', 'Back to the trainer') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<div v-else class="qc-lesson" :class="{ 'qc-lesson--no-board': !playback.state.value }">
		<header class="qc-lesson__header">
			<NcButton variant="tertiary" to="/trainer" :aria-label="t('quantumchess', 'Back to the trainer')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiArrowLeft" />
				</template>
			</NcButton>
			<div class="qc-lesson__heading">
				<h2>{{ t('quantumchess', 'Lesson {n}', { n: lesson.order }) }} · {{ lesson.title() }}</h2>
				<p>{{ lesson.goal() }}</p>
			</div>
			<ol class="qc-lesson__dots" :aria-label="t('quantumchess', 'Step {n} of {total}', { n: index + 1, total: lesson.steps.length })">
				<li
					v-for="(s, i) in lesson.steps"
					:key="i"
					class="qc-lesson__dot"
					:class="{ 'qc-lesson__dot--done': i < index || finished, 'qc-lesson__dot--current': i === index && !finished }" />
			</ol>
		</header>

		<div class="qc-lesson__body">
			<div v-if="playback.state.value" class="qc-lesson__board">
				<TrainerBoard
					ref="board"
					:state="playback.state.value"
					:legalMoves="legalMoves"
					:interactive="interactive"
					:orientation="orientation"
					:lastMove="playback.lastMove.value"
					:arrows="arrows"
					:highlights="highlights"
					:preview="preview"
					:names="playback.names"
					:noControls="step?.type !== 'task'"
					lessonRoll
					@move="onMove"
					@previewClose="otherIndex = -1" />
			</div>

			<section class="qc-lesson__card" aria-live="polite" data-test="lesson-card">
				<template v-if="finished">
					<h3>{{ t('quantumchess', 'Lesson complete!') }}</h3>
					<StarRating class="qc-lesson__stars" :stars="stars" />
					<p>{{ starsText }}</p>
					<div class="qc-lesson__actions">
						<NcButton
							v-if="next"
							variant="primary"
							data-test="next-lesson"
							:to="'/trainer/lesson/' + next.id">
							{{ t('quantumchess', 'Next lesson: {title}', { title: next.title() }) }}
						</NcButton>
						<NcButton :variant="next ? 'secondary' : 'primary'" to="/trainer">
							{{ t('quantumchess', 'Back to the trainer') }}
						</NcButton>
					</div>
				</template>

				<template v-else-if="step">
					<p class="qc-lesson__step-no">
						{{ t('quantumchess', 'Step {n} of {total}', { n: index + 1, total: lesson.steps.length }) }}
					</p>

					<template v-if="step.type === 'explain' || step.type === 'game'">
						<p v-for="(p, i) in step.text" :key="i">
							{{ p() }}
						</p>
					</template>

					<template v-else-if="step.type === 'task'">
						<p class="qc-lesson__prompt">
							{{ step.prompt() }}
						</p>
					</template>

					<template v-else-if="step.type === 'quiz'">
						<p class="qc-lesson__prompt">
							{{ step.question() }}
						</p>
						<div class="qc-lesson__answers" role="group" :aria-label="t('quantumchess', 'Answers')">
							<NcButton
								v-for="(a, i) in step.answers"
								:key="i"
								wide
								:variant="answerVariant(i)"
								:disabled="phase === 'success' || wrongAnswers.includes(i)"
								:data-test="'answer-' + i"
								@click="answer(i)">
								{{ a() }}
							</NcButton>
						</div>
					</template>

					<template v-else-if="step.type === 'watch'">
						<p class="qc-lesson__prompt">
							{{ step.narration() }}
						</p>
					</template>

					<NcNoteCard
						v-if="message"
						:type="message.type"
						class="qc-lesson__message"
						data-test="lesson-message">
						{{ message.text }}
					</NcNoteCard>
					<p v-if="otherText" class="qc-lesson__other" data-test="other-result-text">
						{{ otherText }}
					</p>
					<ul v-if="hintTexts.length" class="qc-lesson__hints">
						<li v-for="(h, i) in hintTexts" :key="i">
							{{ h }}
						</li>
					</ul>

					<div class="qc-lesson__actions">
						<NcButton
							v-if="step.type === 'task' && phase === 'ready' && hintTier < (step.hints?.length ?? 0)"
							data-test="lesson-hint"
							@click="nextHint">
							<template #icon>
								<NcIconSvgWrapper :path="mdiLightbulbOnOutline" />
							</template>
							{{ t('quantumchess', 'Hint') }}
						</NcButton>
						<NcButton
							v-if="otherKeys.length && phase === 'success'"
							data-test="show-other-result"
							@click="toggleOther">
							{{ otherIndex + 1 < otherKeys.length ? t('quantumchess', 'Show the other result') : t('quantumchess', 'Back to what happened') }}
						</NcButton>
						<NcButton
							v-if="step.type === 'watch' && phase === 'ready'"
							variant="primary"
							data-test="watch-play"
							@click="watch">
							{{ t('quantumchess', 'Play the move') }}
						</NcButton>
						<NcButton
							v-if="step.type === 'game'"
							variant="primary"
							data-test="start-game"
							@click="startGame">
							{{ t('quantumchess', 'Start the game') }}
						</NcButton>
						<NcButton
							v-if="phase === 'failed'"
							variant="primary"
							data-test="try-again"
							@click="retry">
							{{ t('quantumchess', 'Try again') }}
						</NcButton>
						<NcButton
							v-if="phase === 'success' || step.type === 'explain'"
							variant="primary"
							data-test="lesson-next"
							@click="advance">
							{{ index + 1 < lesson.steps.length ? t('quantumchess', 'Next') : t('quantumchess', 'Finish') }}
						</NcButton>
					</div>
				</template>
			</section>
		</div>
	</div>
</template>

<script setup>
import { mdiArrowLeft, mdiLightbulbOnOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, ref, toRaw, watch as watchRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import StarRating from '../components/trainer/StarRating.vue'
import TrainerBoard from '../components/trainer/TrainerBoard.vue'
import { findMove, generateMoves, squareIndex } from '../engine/index.js'
import { outcomeLabel } from '../engine/ui/index.js'
import { createLocalGame } from '../services/localGames.js'
import { markGraduationGame } from '../trainer/events.js'
import { lessonById, LESSONS } from '../trainer/lessons/index.js'
import { check } from '../trainer/predicates.js'
import { lessonStars, recordLesson } from '../trainer/progress.js'
import { arrowsOf, lessonOutcome, movesForModes, otherOutcomes, playMove, scriptedReply, stepState } from '../trainer/runner.js'
import { usePlayback } from '../trainer/usePlayback.js'

const route = useRoute()
const router = useRouter()
const board = ref(null)
const playback = usePlayback(board)

const lesson = computed(() => lessonById(String(route.params.id ?? '').toUpperCase()))
const index = ref(0)
const step = computed(() => lesson.value?.steps[index.value] ?? null)
const phase = ref('ready') // ready | busy | success | failed
const message = ref(null)
const finished = ref(false)
const stars = ref(0)
const hints = ref(0)
const retries = ref(0)
const hintTier = ref(0)
const wrongAnswers = ref([])
const played = ref(null) // {before, move, key} of the step's own move (for the other result)
const otherIndex = ref(-1)
let stepStart = null

const orientation = computed(() => 'w')
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
watchRef(() => route.params.id, begin, { immediate: true })

/** Next step or finish. */
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
 * Play a reply ({scripted} or {engine}).
 *
 * @param {object|undefined} reply reply descriptor
 * @return {Promise<void>}
 */
async function reply(reply) {
	if (!reply || playback.state.value.result) {
		return
	}
	await new Promise((resolve) => setTimeout(resolve, 350))
	const code = scriptedReply(reply, toRaw(playback.state.value))
	if (code) {
		const m = findMove(toRaw(playback.state.value), code)
		await playback.play(code, { outcome: lessonOutcome(m), actor: 'opponent', lessonRoll: true })
	} else if (reply.engine) {
		await playback.engineReply(reply.engine)
	}
}

/**
 * The player moved in a task.
 *
 * @param {object} move LegalMove
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
async function watch() {
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

/** Start the graduation game (lesson 11). */
function startGame() {
	const record = createLocalGame({
		mode: 'computer',
		players: { w: { kind: 'human' }, b: { kind: 'engine', level: step.value.level ?? 1 } },
		humanColor: 'w',
		options: { coach: 'beginner', lesson: lesson.value.id },
	})
	markGraduationGame(record.id)
	router.push(`/play/computer/${record.id}`)
}
</script>

<style lang="scss" scoped>
.qc-lesson {
	display: flex;
	flex-direction: column;
	gap: 12px;
	max-width: 1100px;
	margin: 0 auto;
	padding: 8px 16px 24px;
	box-sizing: border-box;
}

.qc-lesson__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	padding-inline-start: 36px;

	h2 {
		margin: 0;
		font-size: 1.3em;
	}

	p {
		margin: 0;
		color: var(--color-text-maxcontrast);
	}
}

.qc-lesson__heading {
	flex: 1 1 240px;
}

.qc-lesson__dots {
	display: flex;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-lesson__dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--color-border-dark);

	&--done {
		background: var(--color-success);
	}

	&--current {
		background: var(--color-primary-element);
		box-shadow: 0 0 0 3px var(--color-primary-element-light);
	}
}

.qc-lesson__body {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: center;
	gap: 16px 24px;
}

.qc-lesson__board {
	flex: 1 1 360px;
	min-width: 0;
	display: flex;
	justify-content: center;
	max-width: 640px;
}

.qc-lesson__card {
	flex: 0 1 360px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 260px;
	padding: 16px;
	border-radius: var(--border-radius-large, 10px);
	background: var(--color-main-background);
	box-shadow: 0 0 0 1px var(--color-border);

	h3 {
		margin: 0;
	}

	p {
		margin: 0;
	}
}

.qc-lesson--no-board .qc-lesson__card {
	flex-basis: 520px;
}

.qc-lesson__step-no {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}

.qc-lesson__prompt {
	font-weight: bold;
	font-size: 1.1em;
}

.qc-lesson__answers {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.qc-lesson__message {
	margin: 0 !important;
}

.qc-lesson__other {
	padding: 6px 8px;
	border-inline-start: 4px solid var(--color-primary-element);
	background: var(--color-background-hover);
}

.qc-lesson__hints {
	margin: 0;
	padding-inline-start: 20px;
	list-style: disc;
	color: var(--color-text-maxcontrast);
}

.qc-lesson__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.qc-lesson__stars {
	font-size: 2em;
}

@media (max-width: 600px) {
	.qc-lesson {
		padding: 4px 8px 24px;
	}

	.qc-lesson__card {
		flex-basis: 100%;
		min-width: 0;
	}
}
</style>
