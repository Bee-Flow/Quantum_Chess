<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The post-game review (route /review/:source/:id): the board with step buttons, the evaluation graph, the analysis
  progress, the quality of the shown move, the key moments, the move list and the coach chat. The game and its analysis
  come from useGameReview.
-->
<template>
	<NcEmptyContent
		v-if="error"
		:name="error"
		data-test="review-unavailable">
		<template #action>
			<NcButton variant="primary" to="/">
				{{ t('quantumchess', 'Back to the lobby') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<NcEmptyContent v-else-if="!game" :name="t('quantumchess', 'Loading the game…')">
		<template #icon>
			<NcLoadingIcon />
		</template>
	</NcEmptyContent>
	<div v-else class="qc-review">
		<header class="qc-review__header">
			<NcButton variant="tertiary" :aria-label="t('quantumchess', 'Back')" @click="back">
				<template #icon>
					<NcIconSvgWrapper :path="mdiArrowLeft" />
				</template>
			</NcButton>
			<div>
				<h2>{{ t('quantumchess', 'Review') }} · {{ game.names.w }} – {{ game.names.b }}</h2>
				<p v-if="resultLine">
					{{ resultLine }}
				</p>
			</div>
		</header>

		<div class="qc-review__body">
			<div class="qc-review__main">
				<StandaloneBoard
					:state="states[ply]"
					:orientation="game.viewer ?? 'w'"
					:lastMove="lastMove"
					:arrows="arrows"
					:names="game.names"
					noControls
					:reserved="340" />
				<div class="qc-review__steps" role="group" :aria-label="t('quantumchess', 'Step through the game')">
					<NcButton :aria-label="t('quantumchess', 'Start')" :disabled="ply === 0" @click="go(0)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPageFirst" />
						</template>
					</NcButton>
					<NcButton
						:aria-label="t('quantumchess', 'Previous move')"
						:disabled="ply === 0"
						data-test="review-prev"
						@click="go(ply - 1)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiChevronLeft" />
						</template>
					</NcButton>
					<span class="qc-review__ply">{{
						t('quantumchess', 'Move {n} of {total}', { n: ply, total: game.moves.length })
					}}</span>
					<NcButton
						:aria-label="t('quantumchess', 'Next move')"
						:disabled="ply === game.moves.length"
						data-test="review-next"
						@click="go(ply + 1)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiChevronRight" />
						</template>
					</NcButton>
					<NcButton
						:aria-label="t('quantumchess', 'End')"
						:disabled="ply === game.moves.length"
						@click="go(game.moves.length)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPageLast" />
						</template>
					</NcButton>
				</div>
				<p v-if="rollText" class="qc-review__roll" data-test="review-roll">
					{{ rollText }}
				</p>
				<EvalGraph
					:plies="plies"
					:total="game.moves.length"
					:current="ply"
					:viewer="game.viewer ?? 'w'"
					:quantum="quantumFlags"
					@select="go" />
			</div>

			<aside class="qc-review__side">
				<section v-if="analysing" class="qc-review__progress" aria-live="polite">
					<p>
						{{ t(
							'quantumchess',
							'Analysing the game… {done} of {total} moves',
							{ done: plies.length, total: game.moves.length },
						) }}
					</p>
					<NcProgressBar
						:value="Math.round((100 * plies.length) / Math.max(1, game.moves.length))"
						:aria-label="t('quantumchess', 'Analysis progress')" />
				</section>
				<NcNoteCard v-if="analysisError" type="warning">
					{{ t('quantumchess', 'The analysis could not finish. The graph shows the moves analysed so far.') }}
				</NcNoteCard>
				<section v-if="currentQuality" class="qc-review__quality">
					<span>{{ t('quantumchess', 'Move {n}: {code}', { n: ply, code: game.moves[ply - 1].code }) }}</span>
					<QualityBadge :label="currentQuality.label" :luck="currentQuality.luck" />
				</section>
				<KeyMoments
					:moments="moments"
					:names="game.names"
					:done="!analysing && !analysisError"
					:active="activeMoment"
					@show="showMoment" />
				<section class="qc-review__moves">
					<h3>{{ t('quantumchess', 'Moves') }}</h3>
					<MoveList :moves="entries" :currentPly="ply" @selectPly="go" />
				</section>
				<CoachChat
					:state="states[ply]"
					:moves="entries.slice(0, ply)"
					:analysis="null"
					:context="{ kind: 'review', ply }"
					:playerColor="game.viewer ?? 'w'"
					@showMove="chipMove" />
			</aside>
		</div>
	</div>
</template>

<script setup>
import { mdiArrowLeft, mdiChevronLeft, mdiChevronRight, mdiPageFirst, mdiPageLast } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { useHotKey } from '@nextcloud/vue/composables/useHotKey'
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import StandaloneBoard from '../board/components/StandaloneBoard.vue'
import CoachChat from '../coach/components/CoachChat.vue'
import QualityBadge from '../coach/components/QualityBadge.vue'
import MoveList from '../game/components/MoveList.vue'
import EvalGraph from '../review/components/EvalGraph.vue'
import KeyMoments from '../review/components/KeyMoments.vue'
import { useGameReview } from '../review/composables/useGameReview.js'

const route = useRoute()
const router = useRouter()
const review = useGameReview({ source: route.params.source, id: String(route.params.id) })
const {
	game,
	error,
	ply,
	plies,
	analysing,
	analysisError,
	activeMoment,
	arrows,
	states,
	entries,
	lastMove,
	rollText,
	resultLine,
	quantumFlags,
	moments,
	currentQuality,
	go,
	showMoment,
	chipMove,
} = review

/** Leave the review. */
function back() {
	if (window.history.length > 1) {
		router.back()
	} else {
		router.push('/')
	}
}

onMounted(() => review.start())
onBeforeUnmount(() => review.stop())

useHotKey('ArrowLeft', () => go(ply.value - 1))
useHotKey('ArrowRight', () => go(ply.value + 1))
</script>

<style lang="scss" scoped>
.qc-review {
	display: flex;
	flex-direction: column;
	gap: 12px;
	max-width: 1200px;
	margin: 0 auto;
	padding: 8px 16px 24px;
	box-sizing: border-box;
}

.qc-review__header {
	display: flex;
	align-items: center;
	gap: 12px;
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

.qc-review__body {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: center;
	gap: 16px 24px;
}

.qc-review__main {
	display: flex;
	flex: 1 1 380px;
	min-width: 0;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	max-width: 640px;

	> .qc-graph {
		align-self: stretch;
	}
}

.qc-review__steps {
	display: flex;
	align-items: center;
	gap: 4px;
}

.qc-review__ply {
	min-width: 120px;
	text-align: center;
	font-variant-numeric: tabular-nums;
}

.qc-review__roll {
	margin: 0;
	color: var(--color-text-maxcontrast);
	text-align: center;
}

.qc-review__side {
	display: flex;
	flex: 1 1 320px;
	flex-direction: column;
	gap: 16px;
	max-width: 420px;
	min-width: 0;
}

.qc-review__progress p {
	margin: 0 0 4px;
}

.qc-review__quality {
	display: flex;
	align-items: center;
	gap: 8px;
}

.qc-review__moves {
	h3 {
		margin: 0 0 4px;
		font-size: 1em;
	}

	:deep(.qc-moves) {
		max-height: 260px;
		overflow-y: auto;
	}
}

@media (max-width: 600px) {
	.qc-review {
		padding: 4px 8px 24px;
	}
}
</style>
