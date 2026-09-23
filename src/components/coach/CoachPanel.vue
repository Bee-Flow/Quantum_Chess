<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The Coach tab (GAME-DESIGN §5.3, §5.5): the evaluation in words, the quality badge of the player's last move, threat
  warnings and opportunities, hints (tiers 1–2) and the AI coach chat. Under the fair-play lock it only says
  "Available after the game."
-->
<template>
	<div class="qc-coach" data-test="coach-panel">
		<p v-if="locked" class="qc-coach__locked">
			{{ t('quantumchess', 'Available after the game.') }}
		</p>
		<p v-else-if="!coach.active.value" class="qc-coach__off">
			{{ t('quantumchess', 'The coach is off. You can turn it on in the settings.') }}
		</p>
		<template v-else>
			<section class="qc-coach__section qc-coach__eval" aria-live="polite">
				<NcLoadingIcon v-if="coach.analyzing.value" :size="16" />
				<span>{{ evalText }}</span>
			</section>

			<section v-if="last" class="qc-coach__section" data-test="coach-last-move">
				<div class="qc-coach__row">
					<span>{{ lastLabel }}</span>
					<QualityBadge :label="last.label" :luck="last.luck" />
				</div>
				<p v-if="last.deltaPp > 2 && last.bestCode !== last.code" class="qc-coach__detail">
					{{ t('quantumchess', 'About {pp} % worse than {best}.', { pp: Math.round(last.deltaPp), best: last.bestCode }) }}
					<NcButton size="small" variant="tertiary" @click="emit('showMove', { code: last.bestCode, pin: true, before: last.ply })">
						{{ t('quantumchess', 'Show') }}
					</NcButton>
				</p>
			</section>

			<section v-if="warnings.length" class="qc-coach__section">
				<ul class="qc-coach__list">
					<li
						v-for="(w, i) in warnings"
						:key="i"
						class="qc-coach__warning"
						:class="'qc-coach__warning--' + w.kind"
						data-test="coach-warning">
						{{ w.text }}
					</li>
				</ul>
			</section>

			<section v-if="canHint" class="qc-coach__section">
				<p v-if="coach.hint.text" class="qc-coach__hint" data-test="coach-hint">
					{{ coach.hint.text }}
				</p>
				<NcButton
					v-if="coach.hint.tier < 2"
					:disabled="!coach.ready.value || !myTurn"
					data-test="coach-hint-button"
					@click="coach.hint.next()">
					<template #icon>
						<NcIconSvgWrapper :path="mdiLightbulbOnOutline" />
					</template>
					{{ coach.hint.tier === 0 ? t('quantumchess', 'Hint') : t('quantumchess', 'Show the idea') }}
				</NcButton>
			</section>

			<CoachChat
				v-if="!hideChat"
				:state="state"
				:moves="moves"
				:analysis="coach.analysis.value"
				:context="context"
				:playerColor="coach.side.value"
				:threats="warnings.map((w) => w.text)"
				:lastMove="last ? { code: last.code, label: last.label, deltaE: last.deltaPp / 100 } : null"
				@showMove="(e) => emit('showMove', e)" />
		</template>
	</div>
</template>

<script setup>
import { mdiLightbulbOnOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import CoachChat from './CoachChat.vue'
import QualityBadge from './QualityBadge.vue'
import { BAD_LABELS, forMover } from '../../coach/quality.js'
import { formatPercentNumber, pieceTypeName } from '../../engine/ui/index.js'
import { preferences } from '../../services/preferences.js'

const props = defineProps({
	/** useCoach result */
	coach: { type: Object, required: true },
	/** Displayed position */
	state: { type: Object, required: true },
	/** MoveEntry list */
	moves: { type: Array, default: () => [] },
	/** The player (null = pass & play) */
	myColor: { type: String, default: null },
	/** {kind: game | lesson | puzzle | review, title?, goal?, ply?} */
	context: { type: Object, default: () => ({ kind: 'game' }) },
	/** Fair-play lock */
	locked: { type: Boolean, default: false },
	/** Hide the AI coach chat */
	hideChat: { type: Boolean, default: false },
})
const emit = defineEmits(['showMove'])

const myTurn = computed(() => !props.state.result && (props.myColor === null || props.state.turn === props.myColor))
const canHint = computed(() => preferences.hints && !props.state.result)

const evalText = computed(() => {
	const a = props.coach.analysis.value
	if (props.state.result) {
		return t('quantumchess', 'The game is over. Open the review for the full analysis.')
	}
	if (!a) {
		return t('quantumchess', 'Analysing …')
	}
	if (a.mate) {
		return a.mate.winner === props.coach.side.value
			? t('quantumchess', 'You can win for certain: ♚ in {n}.', { n: a.mate.moves })
			: t('quantumchess', 'Your opponent can win for certain: ♚ in {n}.', { n: a.mate.moves })
	}
	const pct = formatPercentNumber(Math.round(forMover(a.E, props.coach.side.value) * 100))
	return t('quantumchess', 'Your winning chances: {pct}', { pct })
})

const last = computed(() => {
	const map = props.coach.qualityByPly.value
	for (let i = props.moves.length - 1; i >= 0; i--) {
		const q = map.get(props.moves[i].ply)
		if (q) {
			const hideGood = props.coach.level.value === 'standard' && !BAD_LABELS.includes(q.label)
			return hideGood ? null : { ...q, ply: props.moves[i].ply }
		}
	}
	return null
})

// In pass & play "your" is the side to move, but the graded move belongs to the player before: name its colour.
const lastLabel = computed(() => {
	const l = last.value
	if (!l || props.myColor !== null) {
		return l ? t('quantumchess', 'Your move {move}', { move: l.code }) : ''
	}
	return l.color === 'b'
		? t('quantumchess', 'Black’s move {move}', { move: l.code })
		: t('quantumchess', 'White’s move {move}', { move: l.code })
})

const warnings = computed(() => {
	const out = []
	const o = props.coach.opportunity.value
	if (o) {
		out.push({
			kind: 'opportunity',
			text: o.chance >= 1
				? t('quantumchess', 'You can capture the king for certain!')
				: (o.chance > 0
						? t('quantumchess', 'You can capture the king: {pct}!', { pct: formatPercentNumber(Math.round(o.chance * 100)) })
						: t('quantumchess', 'You can trap the enemy king.')),
		})
	}
	for (const x of props.coach.threats.value) {
		out.push({
			kind: 'threat',
			text: t('quantumchess', 'Your {piece} is {pct} capturable.', { piece: pieceTypeName(x.type), pct: formatPercentNumber(Math.round(x.pCap * 100)) }),
		})
	}
	return out
})
</script>

<style lang="scss" scoped>
.qc-coach {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 4px 2px;
}

.qc-coach__locked,
.qc-coach__off {
	margin: 16px 0;
	color: var(--color-text-maxcontrast);
	text-align: center;
}

.qc-coach__section {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.qc-coach__eval {
	flex-direction: row;
	align-items: center;
	gap: 6px;
	font-weight: bold;
}

.qc-coach__row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.qc-coach__detail {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-coach__list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-coach__warning {
	padding: 4px 8px;
	border-inline-start: 4px solid var(--color-error);
	border-radius: var(--border-radius-small, 4px);
	background: var(--color-background-hover);

	&--opportunity {
		border-color: var(--color-success);
	}
}

.qc-coach__hint {
	margin: 0;
	padding: 6px 8px;
	border-radius: var(--border-radius-small, 4px);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
}
</style>
