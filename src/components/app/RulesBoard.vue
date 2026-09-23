<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A live board of the Rules page: a position, or a move shown before and after with one toggle per possible result.
-->
<template>
	<figure class="qc-rules-board">
		<div class="qc-rules-board__boards">
			<MiniBoard
				:state="before"
				:size="size"
				:arrows="arrows"
				:label="caption" />
			<template v-if="outcomes.length">
				<span class="qc-rules-board__arrow" aria-hidden="true">→</span>
				<MiniBoard :state="after" :size="size" :label="afterLabel" />
			</template>
		</div>
		<div
			v-if="outcomes.length > 1"
			class="qc-rules-board__outcomes"
			role="group"
			:aria-label="t('quantumchess', 'Result')">
			<NcButton
				v-for="o in outcomes"
				:key="o.key"
				size="small"
				:variant="o.key === chosen ? 'primary' : 'secondary'"
				:pressed="o.key === chosen"
				@click="chosen = o.key">
				{{ o.label }} · {{ o.percent }}
			</NcButton>
		</div>
		<figcaption class="qc-rules-board__caption">
			<NotationText v-if="block.play" :move="block.play.code" :stateBefore="before" />
			{{ caption }}
		</figcaption>
	</figure>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import MiniBoard from '../board/MiniBoard.vue'
import NotationText from '../board/NotationText.vue'
import { findMove, getOutcomes, setupPosition } from '../../engine/index.js'
import { formatProbability, outcomeLabel } from '../../engine/ui/index.js'

const props = defineProps({
	/** Board block of src/rules/sections.js */
	block: { type: Object, required: true },
})

const size = 168
const before = setupPosition(props.block.setup)
const caption = props.block.caption()
const move = props.block.play ? findMove(before, props.block.play.code) : null
const outcomes = move
	? getOutcomes(before, move.code).map((o) => ({
			key: o.key,
			state: o.state,
			label: ['miss', 'move', 'capture'].includes(o.key) ? outcomeLabel(o.key) : (o.key === 'certain' || o.key === 'quantum' ? '' : t('quantumchess', 'On {square}', { square: o.key })),
			percent: formatProbability(o.probability),
		}))
	: []
const chosen = ref(outcomes.find((o) => o.key === 'capture')?.key ?? outcomes[0]?.key ?? null)
const after = computed(() => outcomes.find((o) => o.key === chosen.value)?.state ?? before)
const arrows = move ? move.to.map((to) => ({ from: move.from[0], to, kind: 'played' })) : []
const afterLabel = computed(() => {
	const o = outcomes.find((x) => x.key === chosen.value)
	return o?.label ? t('quantumchess', 'After the move: {result}', { result: o.label }) : t('quantumchess', 'After the move')
})
</script>

<style lang="scss" scoped>
.qc-rules-board {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	margin: 12px 0 16px;
}

.qc-rules-board__boards {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}

.qc-rules-board__arrow {
	color: var(--color-text-maxcontrast);
	font-size: 24px;
}

.qc-rules-board__outcomes {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.qc-rules-board__caption {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	color: var(--color-text-maxcontrast);
}
</style>
