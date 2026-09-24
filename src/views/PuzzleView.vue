<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One puzzle (route /trainer/puzzle/:id): the board, the goal, the result message, hints, stars and the actions. The
  puzzle logic lives in `usePuzzleRunner`.
-->
<template>
	<NcEmptyContent
		v-if="!puzzle"
		:name="t('quantumchess', 'Puzzle not found')">
		<template #action>
			<NcButton variant="primary" to="/trainer">
				{{ t('quantumchess', 'Back to the trainer') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<div v-else class="qc-puzzle">
		<header class="qc-puzzle__header">
			<NcButton variant="tertiary" to="/trainer" :aria-label="t('quantumchess', 'Back to the trainer')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiArrowLeft" />
				</template>
			</NcButton>
			<div class="qc-puzzle__heading">
				<h2>{{ t('quantumchess', 'Puzzle {n}', { n: number }) }} · {{ puzzle.name() }}</h2>
				<p>
					<StarRating :stars="puzzle.stars" :aria-label="t('quantumchess', 'Difficulty')" />
					<span>{{ goalText }}</span>
				</p>
			</div>
		</header>

		<div class="qc-puzzle__body">
			<div class="qc-puzzle__board">
				<StandaloneBoard
					v-if="playback.state.value"
					ref="board"
					:state="playback.state.value"
					:legalMoves="legalMoves"
					:interactive="phase === 'ready'"
					:orientation="puzzle.side"
					:lastMove="playback.lastMove.value"
					:arrows="arrows"
					:highlights="highlights"
					:preview="preview"
					:names="playback.names"
					@move="onMove"
					@previewClose="closeOther" />
			</div>

			<section class="qc-puzzle__card" aria-live="polite" data-test="puzzle-card">
				<p class="qc-puzzle__prompt">
					{{ puzzle.side === 'w' ? t('quantumchess', 'White to move.') : t('quantumchess', 'Black to move.') }}
					{{ goalText }}
				</p>
				<NcNoteCard
					v-if="message"
					:type="message.type"
					class="qc-puzzle__message"
					data-test="puzzle-message">
					<p>{{ message.text }}</p>
					<p v-if="message.detail" class="qc-puzzle__detail">
						{{ message.detail }}
					</p>
				</NcNoteCard>
				<p v-if="phase === 'solved'" class="qc-puzzle__solved">
					<StarRating :stars="earned" class="qc-puzzle__stars" />
				</p>
				<ul v-if="hintTexts.length" class="qc-puzzle__hints">
					<li v-for="(h, i) in hintTexts" :key="i">
						{{ h }}
					</li>
				</ul>
				<div class="qc-puzzle__actions">
					<NcButton v-if="phase === 'ready' && hintTier < 2" data-test="puzzle-hint" @click="nextHint">
						<template #icon>
							<NcIconSvgWrapper :path="mdiLightbulbOnOutline" />
						</template>
						{{ hintTier === 0 ? t('quantumchess', 'Hint') : t('quantumchess', 'Show the idea') }}
					</NcButton>
					<NcButton
						v-if="phase === 'failed'"
						variant="primary"
						data-test="try-again"
						@click="reset">
						{{ t('quantumchess', 'Try again') }}
					</NcButton>
					<NcButton v-if="phase === 'solved' && otherKeys.length" data-test="replay-other" @click="toggleOther">
						{{ otherIndex + 1 < otherKeys.length ? t('quantumchess', 'Replay the other result') : t('quantumchess', 'Back to what happened') }}
					</NcButton>
					<NcButton
						v-if="phase === 'solved' && next"
						variant="primary"
						data-test="next-puzzle"
						:to="'/trainer/puzzle/' + next.id">
						{{ t('quantumchess', 'Next puzzle') }}
					</NcButton>
					<NcButton v-if="phase === 'solved' && !next" variant="primary" to="/trainer">
						{{ t('quantumchess', 'Back to the trainer') }}
					</NcButton>
				</div>
			</section>
		</div>
	</div>
</template>

<script setup>
import { mdiArrowLeft, mdiLightbulbOnOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import StandaloneBoard from '../board/components/StandaloneBoard.vue'
import StarRating from '../trainer/components/StarRating.vue'
import { usePlayback } from '../trainer/composables/usePlayback.js'
import { usePuzzleRunner } from '../trainer/composables/usePuzzleRunner.js'

const route = useRoute()
const board = ref(null)
const playback = usePlayback(board)

const {
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
} = usePuzzleRunner({ puzzleId: () => route.params.id, playback })
</script>

<style lang="scss" scoped>
.qc-puzzle {
	display: flex;
	flex-direction: column;
	gap: 12px;
	max-width: 1100px;
	margin: 0 auto;
	padding: 8px 16px 24px;
	box-sizing: border-box;
}

.qc-puzzle__header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding-inline-start: 36px;

	h2 {
		margin: 0;
		font-size: 1.3em;
	}

	p {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
		color: var(--color-text-maxcontrast);
	}
}

.qc-puzzle__body {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: center;
	gap: 16px 24px;
}

.qc-puzzle__board {
	flex: 1 1 360px;
	min-width: 0;
	display: flex;
	justify-content: center;
	max-width: 640px;
}

.qc-puzzle__card {
	flex: 0 1 360px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 260px;
	padding: 16px;
	border-radius: var(--border-radius-large, 10px);
	background: var(--color-main-background);
	box-shadow: 0 0 0 1px var(--color-border);

	p {
		margin: 0;
	}
}

.qc-puzzle__prompt {
	font-weight: bold;
	font-size: 1.1em;
}

.qc-puzzle__message {
	margin: 0 !important;
}

.qc-puzzle__detail {
	margin-top: 4px !important;
	color: var(--color-text-maxcontrast);
}

.qc-puzzle__stars {
	font-size: 2em;
}

.qc-puzzle__hints {
	margin: 0;
	padding-inline-start: 20px;
	list-style: disc;
	color: var(--color-text-maxcontrast);
}

.qc-puzzle__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

@media (max-width: 600px) {
	.qc-puzzle {
		padding: 4px 8px 24px;
	}

	.qc-puzzle__card {
		flex-basis: 100%;
		min-width: 0;
	}
}
</style>
