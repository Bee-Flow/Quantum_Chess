<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The trainer card on Home: "Continue: Lesson 5 · Pass = link", path progress and the next puzzle. -->
<template>
	<section class="qc-trainer-card" :aria-label="t('quantumchess', 'Trainer')" data-test="trainer-card">
		<div class="qc-trainer-card__text">
			<h3>{{ t('quantumchess', 'Trainer') }}</h3>
			<p v-if="upcoming">
				{{ t('quantumchess', 'Continue: Lesson {n} · {title}', { n: upcoming.order, title: upcoming.title() }) }}
			</p>
			<p v-else-if="puzzle">
				{{ t('quantumchess', 'Next puzzle: {name}', { name: puzzle.name() }) }}
			</p>
			<p v-else>
				{{ t('quantumchess', 'Every lesson and puzzle done. Well played!') }}
			</p>
			<NcProgressBar :value="Math.round((100 * doneCount) / LESSONS.length)" :aria-label="t('quantumchess', 'Lessons done')" />
			<p class="qc-trainer-card__meta">
				{{ n('quantumchess', '{done} of {total} lesson done', '{done} of {total} lessons done', doneCount, { done: doneCount, total: LESSONS.length }) }}
			</p>
		</div>
		<NcButton variant="primary" :to="target">
			{{ upcoming || puzzle ? t('quantumchess', 'Continue') : t('quantumchess', 'Open the trainer') }}
		</NcButton>
	</section>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import { LESSONS } from '../lessons/index.js'
import { nextLesson, progress } from '../progress.js'
import { PUZZLES } from '../puzzles/index.js'

const doneCount = computed(() => LESSONS.filter((l) => progress.lessons?.[l.id]?.done).length)
const upcoming = computed(() => nextLesson(LESSONS))
const puzzle = computed(() => PUZZLES.find((p) => !progress.puzzles?.[p.id]?.solved) ?? null)
const target = computed(() => {
	if (upcoming.value) {
		return '/trainer/lesson/' + upcoming.value.id
	}
	return puzzle.value ? '/trainer/puzzle/' + puzzle.value.id : '/trainer'
})
</script>

<style lang="scss" scoped>
.qc-trainer-card {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 16px;
	border-radius: var(--border-radius-large, 10px);
	box-shadow: 0 0 0 1px var(--color-border);
	background: var(--color-main-background);

	h3,
	p {
		margin: 0;
	}
}

.qc-trainer-card__text {
	display: flex;
	flex: 1 1 240px;
	flex-direction: column;
	gap: 6px;
}

.qc-trainer-card__meta {
	font-size: 0.85em;
	color: var(--color-text-maxcontrast);
}
</style>
