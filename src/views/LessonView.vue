<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One lesson (route /trainer/lesson/:id): the board, the step card with its text, task, quiz answers or narration,
  hints, "Try again" after a failed task, "Show the other result" after a lesson roll, and the stars at the end. The
  step machine lives in useLessonRunner.
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
				<StandaloneBoard
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
							@click="playWatchStep">
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
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import StandaloneBoard from '../board/components/StandaloneBoard.vue'
import StarRating from '../trainer/components/StarRating.vue'
import { createLocalGame } from '../game/localGames.js'
import { useLessonRunner } from '../trainer/composables/useLessonRunner.js'
import { usePlayback } from '../trainer/composables/usePlayback.js'

const route = useRoute()
const router = useRouter()
const board = ref(null)
const playback = usePlayback(board)
const orientation = 'w'

const {
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
} = useLessonRunner({
	lessonId: () => route.params.id,
	playback,
	createGame: createLocalGame,
	openGame: (id) => router.push(`/play/computer/${id}`),
})
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
	align-items: flex-start;
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
	align-self: center;
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
