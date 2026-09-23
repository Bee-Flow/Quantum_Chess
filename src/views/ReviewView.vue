<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The post-game review (SPEC §14.6.6, GAME-DESIGN §5.4): the game replayed with its recorded rolls, the worker
  analysis (400 ms per ply, progress, cached per game and engine version), the evaluation graph, key moments with
  Show, stepping through the moves and the AI coach chat (route /review/:source/:id).
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
	<NcEmptyContent v-else-if="!game" :name="t('quantumchess', 'Loading the game …')">
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
				<TrainerBoard
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
					<span class="qc-review__ply">{{ t('quantumchess', 'Move {n} of {total}', { n: ply, total: game.moves.length }) }}</span>
					<NcButton
						:aria-label="t('quantumchess', 'Next move')"
						:disabled="ply === game.moves.length"
						data-test="review-next"
						@click="go(ply + 1)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiChevronRight" />
						</template>
					</NcButton>
					<NcButton :aria-label="t('quantumchess', 'End')" :disabled="ply === game.moves.length" @click="go(game.moves.length)">
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
					<p>{{ t('quantumchess', 'Analysing the game … {done} of {total} moves', { done: plies.length, total: game.moves.length }) }}</p>
					<NcProgressBar :value="Math.round((100 * plies.length) / Math.max(1, game.moves.length))" :aria-label="t('quantumchess', 'Analysis progress')" />
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
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcProgressBar from '@nextcloud/vue/components/NcProgressBar'
import CoachChat from '../components/coach/CoachChat.vue'
import QualityBadge from '../components/coach/QualityBadge.vue'
import MoveList from '../components/game/MoveList.vue'
import EvalGraph from '../components/review/EvalGraph.vue'
import KeyMoments from '../components/review/KeyMoments.vue'
import TrainerBoard from '../components/trainer/TrainerBoard.vue'
import { analyzeGame, ENGINE_VERSION } from '../ai/client.js'
import { keyMoments } from '../coach/keyMoments.js'
import { isQuantumMove, qualityOfPly } from '../coach/quality.js'
import { reviewGame } from '../coach/reviewGame.js'
import { findMove, moveNotation } from '../engine/index.js'
import { resultSentence } from '../engine/ui/index.js'
import { getGame } from '../services/api.js'
import { kingCaptureContext, resultText } from '../services/format.js'
import { loadLocalGame } from '../services/localGames.js'
import { readJson, writeJson } from '../services/storage.js'

const route = useRoute()
const router = useRouter()
const game = shallowRef(null)
const error = ref(null)
const ply = ref(0)
const plies = shallowRef([])
const analysing = ref(false)
const analysisError = ref(false)
const activeMoment = ref(null)
const arrows = shallowRef([])
let ctrl = null

const states = computed(() => game.value?.states ?? [])
const entries = computed(() => {
	const g = game.value
	if (!g) {
		return []
	}
	return g.moves.map((m, i) => ({
		ply: g.states[i].ply,
		color: g.states[i].turn,
		code: m.code,
		notation: moveNotation(g.states[i], g.steps[i].move, g.steps[i].measurement),
		measurement: g.steps[i].measurement,
		u: m.u,
		by: 'human',
	}))
})
const lastMove = computed(() => {
	if (!game.value || ply.value === 0) {
		return null
	}
	const s = game.value.steps[ply.value - 1]
	return { move: s.move, key: s.measurement?.key ?? null }
})
const rollText = computed(() => {
	if (!game.value || ply.value === 0) {
		return ''
	}
	const g = game.value
	const s = g.steps[ply.value - 1]
	if (!s.measurement) {
		return ''
	}
	// The reviewer's point of view ("Your king was captured" for the loser); pass & play: the mover's.
	const mover = s.before.turn
	const other = mover === 'w' ? 'b' : 'w'
	const pov = g.viewer === null || mover === g.viewer ? 'mover' : 'opponent'
	return resultSentence({ before: s.before, move: s.move, measurement: s.measurement, pov, names: { mover: g.names[mover], opponent: g.names[other] } })?.text ?? ''
})
const resultLine = computed(() => {
	const r = game.value?.result
	if (!r) {
		return ''
	}
	const g = game.value
	const extra = r.reason === 'king_captured' && g.moves.length
		? kingCaptureContext({ code: g.moves[g.moves.length - 1].code, measurement: g.steps[g.steps.length - 1].measurement })
		: {}
	const text = resultText(r.result, r.reason, g.names, extra)
	return `${text.title} · ${text.reason}`
})
const quantumFlags = computed(() => (game.value ? game.value.steps.map((s) => isQuantumMove(s.move, s.before.types[s.move.piece])) : []))
const moments = computed(() => keyMoments(plies.value))
const currentQuality = computed(() => {
	const p = plies.value[ply.value - 1]
	return p ? qualityOfPly(p, quantumFlags.value[ply.value - 1]) : null
})

/**
 * Select a position.
 *
 * @param {number} k moves played
 */
function go(k) {
	if (!game.value) {
		return
	}
	ply.value = Math.max(0, Math.min(game.value.moves.length, k))
	arrows.value = []
	activeMoment.value = null
}

/**
 * Show a key moment: the position before the move, with the played and the best move.
 *
 * @param {object} m moment
 */
function showMoment(m) {
	const index = game.value.states.findIndex((s) => s.ply === m.ply)
	go(index < 0 ? 0 : index)
	activeMoment.value = m.ply
	const s = game.value.states[ply.value]
	const list = []
	const best = findMove(s, m.bestCode)
	const playedMove = findMove(s, m.code)
	if (playedMove && m.code !== m.bestCode) {
		list.push({ from: playedMove.from[0], to: playedMove.to[0], kind: 'played' })
	}
	if (best) {
		list.push({ from: best.from[0], to: best.to[0], kind: 'best' })
	}
	arrows.value = list
}

/**
 * Draw a move chip of the coach chat.
 *
 * @param {{code: string|null}} e event
 */
function chipMove(e) {
	const m = e?.code ? findMove(states.value[ply.value], e.code) : null
	arrows.value = m ? [{ from: m.from[0], to: m.to[0], kind: 'best' }] : []
}

/** Leave the review. */
function back() {
	if (window.history.length > 1) {
		router.back()
	} else {
		router.push('/')
	}
}

/**
 * Load the game of the route.
 *
 * @return {Promise<object|null>} reviewGame() input
 */
async function load() {
	const source = route.params.source
	const id = String(route.params.id)
	if (source === 'local') {
		const rec = loadLocalGame(id)
		if (!rec) {
			error.value = t('quantumchess', 'This game is not on this device any more.')
			return null
		}
		return { source, id, local: rec }
	}
	try {
		const g = await getGame(id)
		if (!['finished', 'aborted'].includes(g?.status)) {
			error.value = t('quantumchess', 'Available after the game.')
			return null
		}
		return { source, id, online: g }
	} catch {
		error.value = t('quantumchess', 'The game could not be loaded.')
		return null
	}
}

/** Run (or restore) the analysis. */
async function analyse() {
	const g = game.value
	const key = `quantumchess.review.v1.${g.source}.${g.id}.${ENGINE_VERSION}`
	const cached = readJson(key, null)
	if (cached?.plies?.length === g.moves.length || (cached?.complete && cached.plies)) {
		plies.value = cached.plies
		return
	}
	analysing.value = true
	ctrl = new AbortController()
	const got = []
	try {
		const res = await analyzeGame({ startState: g.startState, moves: g.moves }, {
			msPerPly: 400,
			level: 4,
			signal: ctrl.signal,
			onProgress: (p) => {
				got.push(p)
				plies.value = [...got]
			},
		})
		plies.value = res.plies
		writeJson(key, { plies: res.plies, complete: true })
	} catch (e) {
		if (e?.name !== 'AbortError') {
			analysisError.value = true
		}
	} finally {
		analysing.value = false
	}
}

onMounted(async () => {
	const input = await load()
	if (!input) {
		return
	}
	try {
		game.value = reviewGame(input)
	} catch {
		error.value = t('quantumchess', 'The game could not be replayed.')
		return
	}
	ply.value = game.value.moves.length
	import('../trainer/events.js').then((m) => m.reportGameEvent({ type: 'reviewOpened' })).catch(() => {})
	analyse()
})
onBeforeUnmount(() => ctrl?.abort())

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
