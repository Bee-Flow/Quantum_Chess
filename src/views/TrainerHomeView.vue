<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The trainer home (GAME-DESIGN §5.6): the continue card, the lesson path with stars and the puzzle grid. Progress
  comes from the synced progress document (route /trainer).
-->
<template>
	<div class="qc-trainer">
		<header class="qc-trainer__header">
			<h2>{{ t('quantumchess', 'Trainer') }}</h2>
			<p>{{ t('quantumchess', 'Learn Quantum Chess by doing: short lessons, then puzzles.') }}</p>
		</header>

		<section class="qc-trainer__continue" data-test="trainer-continue">
			<template v-if="upcoming">
				<div>
					<p class="qc-trainer__eyebrow">
						{{ doneCount ? t('quantumchess', 'Continue') : t('quantumchess', 'Start here') }}
					</p>
					<h3>{{ t('quantumchess', 'Lesson {n}', { n: upcoming.order }) }} · {{ upcoming.title() }}</h3>
					<p>{{ upcoming.goal() }}</p>
				</div>
				<NcButton variant="primary" :to="'/trainer/lesson/' + upcoming.id" data-test="continue-lesson">
					{{ doneCount ? t('quantumchess', 'Continue') : t('quantumchess', 'Start lesson 1') }}
				</NcButton>
			</template>
			<template v-else>
				<div>
					<p class="qc-trainer__eyebrow">
						{{ t('quantumchess', 'All lessons done') }}
					</p>
					<h3>{{ t('quantumchess', 'You are a Quantum Graduate!') }}</h3>
					<p>{{ t('quantumchess', 'Sharpen your skills with the puzzles below.') }}</p>
				</div>
			</template>
			<NcProgressBar :value="Math.round((100 * doneCount) / LESSONS.length)" size="medium" :aria-label="t('quantumchess', 'Lessons done')" />
			<p class="qc-trainer__summary">
				{{ n('quantumchess', '{done} of {total} lesson done', '{done} of {total} lessons done', doneCount, { done: doneCount, total: LESSONS.length }) }}
				· {{ n('quantumchess', '{done} of {total} puzzle solved', '{done} of {total} puzzles solved', solvedCount, { done: solvedCount, total: PUZZLES.length }) }}
			</p>
		</section>

		<section v-for="g in groups" :key="g.id" class="qc-trainer__section">
			<h3>{{ g.title }} <span class="qc-trainer__minutes">{{ g.subtitle }}</span></h3>
			<ol class="qc-trainer__path">
				<li v-for="l in g.lessons" :key="l.id">
					<router-link
						class="qc-trainer__lesson"
						:class="{ 'qc-trainer__lesson--done': lessonDone(l.id), 'qc-trainer__lesson--next': upcoming && upcoming.id === l.id }"
						:to="'/trainer/lesson/' + l.id"
						:data-test="'lesson-' + l.id">
						<span class="qc-trainer__node" aria-hidden="true">
							<NcIconSvgWrapper v-if="lessonDone(l.id)" :path="mdiCheck" :size="18" />
							<template v-else>{{ l.order }}</template>
						</span>
						<span class="qc-trainer__lesson-text">
							<span class="qc-trainer__lesson-title">{{ l.title() }}</span>
							<span class="qc-trainer__lesson-meta">{{ n('quantumchess', '{n} minute', '{n} minutes', l.minutes, { n: l.minutes }) }}</span>
						</span>
						<StarRating v-if="lessonDone(l.id)" :stars="progress.lessons[l.id].stars ?? 1" />
					</router-link>
				</li>
			</ol>
		</section>

		<section class="qc-trainer__section">
			<h3>{{ t('quantumchess', 'Puzzles') }}</h3>
			<ul class="qc-trainer__puzzles">
				<li v-for="(p, i) in PUZZLES" :key="p.id">
					<router-link
						class="qc-trainer__puzzle"
						:class="{ 'qc-trainer__puzzle--solved': puzzleSolved(p.id) }"
						:to="'/trainer/puzzle/' + p.id"
						:data-test="'puzzle-' + p.id">
						<MiniBoard :state="boardOf(p)" :size="112" :orientation="p.side" />
						<span class="qc-trainer__puzzle-name">{{ i + 1 }}. {{ p.name() }}</span>
						<span class="qc-trainer__puzzle-meta">
							<template v-if="puzzleSolved(p.id)">
								<StarRating :stars="progress.puzzles[p.id].stars ?? 1" />
							</template>
							<template v-else>
								{{ t('quantumchess', 'Difficulty') }} <StarRating :stars="p.stars" />
							</template>
						</span>
					</router-link>
				</li>
			</ul>
		</section>
	</div>
</template>

<script setup>
import { mdiCheck } from '@mdi/js'
import { n, t } from '@nextcloud/l10n'
import { computed, onMounted } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import MiniBoard from '../components/board/MiniBoard.vue'
import StarRating from '../components/trainer/StarRating.vue'
import { setupPosition } from '../engine/index.js'
import { LESSONS } from '../trainer/lessons/index.js'
import { nextLesson, progress, refreshProgress } from '../trainer/progress.js'
import { PUZZLES } from '../trainer/puzzles/index.js'

const lessonDone = (id) => Boolean(progress.lessons?.[id]?.done)
const puzzleSolved = (id) => Boolean(progress.puzzles?.[id]?.solved)
const doneCount = computed(() => LESSONS.filter((l) => lessonDone(l.id)).length)
const solvedCount = computed(() => PUZZLES.filter((p) => puzzleSolved(p.id)).length)
const upcoming = computed(() => nextLesson(LESSONS))

const groups = computed(() => [
	{ id: 'essentials', title: t('quantumchess', 'Essentials'), subtitle: t('quantumchess', 'about 10 minutes'), lessons: LESSONS.filter((l) => l.group === 'essentials') },
	{ id: 'deeper', title: t('quantumchess', 'Deeper'), subtitle: t('quantumchess', 'about 15 minutes'), lessons: LESSONS.filter((l) => l.group === 'deeper') },
	{ id: 'graduation', title: t('quantumchess', 'Graduation'), subtitle: t('quantumchess', 'one full game'), lessons: LESSONS.filter((l) => l.group === 'graduation') },
])

const boards = new Map()

/**
 * The start position of a puzzle (memoised).
 *
 * @param {object} p puzzle
 * @return {object}
 */
function boardOf(p) {
	if (!boards.has(p.id)) {
		boards.set(p.id, setupPosition(p.setup))
	}
	return boards.get(p.id)
}

onMounted(() => {
	refreshProgress().catch(() => {})
})
</script>

<style lang="scss" scoped>
.qc-trainer {
	display: flex;
	flex-direction: column;
	gap: 20px;
	max-width: 960px;
	margin: 0 auto;
	padding: 12px 16px 32px;
	box-sizing: border-box;

	h2,
	h3 {
		margin: 0;
	}

	p {
		margin: 0;
	}
}

.qc-trainer__header {
	padding-inline-start: 36px;

	p {
		color: var(--color-text-maxcontrast);
	}
}

.qc-trainer__continue {
	display: grid;
	grid-template-columns: 1fr auto;
	align-items: center;
	gap: 10px 16px;
	padding: 16px;
	border-radius: var(--border-radius-large, 10px);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);

	> :nth-child(n + 3) {
		grid-column: 1 / -1;
	}
}

.qc-trainer__eyebrow {
	font-size: 0.85em;
	font-weight: bold;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.8;
}

.qc-trainer__summary {
	font-size: 0.9em;
}

.qc-trainer__section {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.qc-trainer__minutes {
	font-weight: normal;
	font-size: 0.8em;
	color: var(--color-text-maxcontrast);
}

.qc-trainer__path {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-trainer__lesson {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 52px;
	padding: 6px 10px;
	border-radius: var(--border-radius-large, 10px);
	box-shadow: 0 0 0 1px var(--color-border);
	color: var(--color-main-text);

	&:hover,
	&:focus-visible {
		background: var(--color-background-hover);
	}

	&--next {
		box-shadow: 0 0 0 2px var(--color-primary-element);
	}
}

.qc-trainer__node {
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	background: var(--color-background-dark);
	font-weight: bold;

	.qc-trainer__lesson--done & {
		background: var(--color-success);
		color: var(--color-success-text, #fff);
	}

	.qc-trainer__lesson--next & {
		background: var(--color-primary-element);
		color: var(--color-primary-element-text);
	}
}

.qc-trainer__lesson-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
}

.qc-trainer__lesson-title {
	font-weight: bold;
}

.qc-trainer__lesson-meta,
.qc-trainer__puzzle-meta {
	font-size: 0.85em;
	color: var(--color-text-maxcontrast);
}

.qc-trainer__puzzles {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-trainer__puzzle {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 10px 6px;
	border-radius: var(--border-radius-large, 10px);
	box-shadow: 0 0 0 1px var(--color-border);
	color: var(--color-main-text);
	text-align: center;

	&:hover,
	&:focus-visible {
		background: var(--color-background-hover);
	}

	&--solved {
		box-shadow: 0 0 0 2px var(--color-success);
	}
}

.qc-trainer__puzzle-name {
	font-weight: bold;
	font-size: 0.9em;
}

@media (max-width: 600px) {
	.qc-trainer {
		padding: 8px 8px 24px;
	}

	.qc-trainer__continue {
		grid-template-columns: 1fr;
	}
}
</style>
