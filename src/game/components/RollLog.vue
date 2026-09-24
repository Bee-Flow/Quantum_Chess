<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The roll log: one card per roll, newest first, with the roll bar, the result sentence and details (weights, the rolled
  number, budget before and after). A card opens its ply in the history view.
-->
<template>
	<div class="qc-rolls">
		<div class="qc-rolls__header">
			<span>{{ headerText }}</span>
			<NcButton
				v-if="rolls.length > 1"
				variant="tertiary"
				size="small"
				:aria-label="newestFirst ? t('quantumchess', 'Show oldest first') : t('quantumchess', 'Show newest first')"
				@click="newestFirst = !newestFirst">
				<template #icon>
					<NcIconSvgWrapper :path="mdiSwapVertical" :size="18" />
				</template>
			</NcButton>
		</div>
		<p v-if="!rolls.length" class="qc-rolls__empty">
			{{ t('quantumchess', 'No rolls yet. When a move lands on a square where a piece might be, the dice decide, and every roll appears here.') }}
		</p>
		<ol v-else class="qc-rolls__list">
			<li
				v-for="r in ordered"
				:key="r.index"
				class="qc-rolls__card"
				:class="{ 'qc-rolls__card--rare': r.rare }">
				<div class="qc-rolls__title">
					<button type="button" class="qc-rolls__open" @click="emit('selectPly', r.index + 1)">
						<span class="qc-rolls__number">{{ r.number }}</span>
						<span>{{ r.side }}</span>
						<NotationText :notation="r.entry.notation" :color="r.entry.color" />
					</button>
					<span v-if="r.entry.createdAt" class="qc-rolls__time">{{ formatRelative(r.entry.createdAt) }}</span>
				</div>
				<RollBar :record="r.entry.measurement" hideText />
				<p class="qc-rolls__sentence">
					<span class="qc-rolls__glyph" aria-hidden="true">{{ r.sentence.glyph }}</span>
					{{ r.sentence.text }}
					<span v-if="r.sentence.rarity" class="qc-rolls__rarity">{{ r.sentence.rarity }}</span>
				</p>
				<details class="qc-rolls__details">
					<summary>{{ t('quantumchess', 'Details') }}</summary>
					<RollBar :record="r.entry.measurement" compact />
					<p>{{ r.budgetText }}</p>
				</details>
			</li>
		</ol>
	</div>
</template>

<script setup>
import { mdiSwapVertical } from '@mdi/js'
import { n, t } from '@nextcloud/l10n'
import { computed, ref, toRaw } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NotationText from '../../board/components/NotationText.vue'
import RollBar from '../../board/components/RollBar.vue'
import { budget, otherColor, worldCount } from '../../engine/index.js'
import { resultSentence } from '../../engine/ui/index.js'
import { formatRelative } from '../../services/format.js'
import { RARE_BELOW, realisedProbability } from '../moveRows.js'

const props = defineProps({
	/** MoveEntry list */
	moves: { type: Array, required: true },
	/** stateAt(n) of the controller */
	stateAt: { type: Function, required: true },
	/** Names {w, b} */
	names: { type: Object, required: true },
	/** Live state (for the possibilities count) */
	state: { type: Object, required: true },
})
const emit = defineEmits(['selectPly'])

const newestFirst = ref(true)

const rolls = computed(() => {
	const out = []
	props.moves.forEach((entry, index) => {
		if (!entry.measurement) {
			return
		}
		const before = toRaw(props.stateAt(index))
		const after = toRaw(props.stateAt(index + 1))
		const mover = entry.color
		const other = otherColor(mover)
		let sentence
		try {
			sentence = resultSentence({ before, move: entry.code, measurement: entry.measurement, pov: 'mover', names: { mover: props.names[mover], opponent: props.names[other] } })
		} catch {
			sentence = null
		}
		out.push({
			index,
			entry,
			number: Math.floor(entry.ply / 2) + 1 + (mover === 'w' ? '.' : '…'),
			side: mover === 'w' ? t('quantumchess', 'White') : t('quantumchess', 'Black'),
			rare: realisedProbability(entry.measurement) < RARE_BELOW,
			sentence: sentence ?? { glyph: '', text: '', rarity: null },
			budgetText: t('quantumchess', 'Budget of {side}: {before}/8 before, {after}/8 after', {
				side: props.names[mover],
				before: budget(before, mover),
				after: budget(after, mover),
			}),
		})
	})
	return out
})

const ordered = computed(() => (newestFirst.value ? [...rolls.value].reverse() : rolls.value))

const headerText = computed(() => {
	const r = rolls.value.length
	const rare = rolls.value.filter((x) => x.rare).length
	const worlds = worldCount(toRaw(props.state))
	return [
		n('quantumchess', '%n roll', '%n rolls', r),
		n('quantumchess', '%n rare result', '%n rare results', rare),
		n('quantumchess', '%n possibility now', '%n possibilities now', worlds),
	].join(' · ')
})
</script>

<style lang="scss" scoped>
.qc-rolls__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 4px 0 8px;
	color: var(--color-text-maxcontrast);
}

.qc-rolls__empty {
	color: var(--color-text-maxcontrast);
	line-height: 1.5;
}

.qc-rolls__list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-rolls__card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
}

.qc-rolls__card--rare {
	border-color: var(--qc-quantum, var(--color-primary-element));
}

.qc-rolls__title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.qc-rolls__open {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0;
	padding: 2px 4px;
	border: none;
	background: transparent;
	color: var(--color-main-text);
	font-weight: normal;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		text-decoration: underline;
	}
}

.qc-rolls__number,
.qc-rolls__time {
	color: var(--color-text-maxcontrast);
}

.qc-rolls__sentence {
	margin: 0;
	line-height: 1.4;
}

.qc-rolls__glyph {
	font-weight: bold;
}

.qc-rolls__rarity {
	display: block;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-rolls__details summary {
	color: var(--color-text-maxcontrast);
	cursor: pointer;
}

.qc-rolls__details p {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
}
</style>
