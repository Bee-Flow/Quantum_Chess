<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The possibilities chip: the number of complete chessboards the position could be (worldCount), muted "1" when
  everything is solid. Click or W opens the panel: the most likely possibilities as mini-boards with their chance
  (differing squares outlined), then "and N more".
-->
<template>
	<NcPopover
		:shown="open"
		:aria-label="t('quantumchess', 'Possibilities')"
		@update:shown="onShown">
		<template #trigger>
			<NcButton
				variant="tertiary"
				:aria-label="ariaLabel"
				:title="ariaLabel">
				<template #icon>
					<NcIconSvgWrapper :path="mdiLayersTripleOutline" :size="20" />
				</template>
				<span class="qc-poss__count" :class="{ 'qc-poss__count--muted': count === 1 }">{{ count }}</span>
			</NcButton>
		</template>
		<!-- focusable, so the popover's focus trap has a tabbable node (the mini-boards are pictures) -->
		<div class="qc-poss" tabindex="0">
			<p class="qc-poss__title">
				{{ n(
					'quantumchess',
					'This position could be %n chessboard:',
					'This position could be %n different chessboards:',
					count,
				) }}
			</p>
			<ul class="qc-poss__list">
				<li v-for="item in list.items" :key="item.index" class="qc-poss__item">
					<MiniBoard
						:state="item.board"
						:size="72"
						:orientation="orientation"
						:highlights="list.differing"
						:label="t('quantumchess', 'Possibility with {p}', { p: item.text })" />
					<span class="qc-poss__bar" aria-hidden="true">
						<span :style="{ width: Math.max(4, item.probability * 100) + '%' }" />
					</span>
					<span class="qc-poss__p">{{ item.text }}</span>
				</li>
			</ul>
			<p v-if="list.rest > 0" class="qc-poss__rest">
				{{ n('quantumchess', 'and %n more ({p})', 'and %n more ({p})', list.rest, { p: restText }) }}
			</p>
		</div>
	</NcPopover>
</template>

<script setup>
import { mdiLayersTripleOutline } from '@mdi/js'
import { n, t } from '@nextcloud/l10n'
import { computed, ref, toRaw } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcPopover from '@nextcloud/vue/components/NcPopover'
import MiniBoard from './MiniBoard.vue'
import { T, worldCount } from '../../engine/index.js'
import { formatProbability, possibilities } from '../../engine/ui/index.js'
import { boardPrefs } from '../boardPreferences.js'

const props = defineProps({
	/** Engine state */
	state: { type: Object, required: true },
	/** The shared BoardInput (W toggles the panel) */
	input: { type: Object, default: null },
	/** Board orientation for the mini-boards */
	orientation: { type: String, default: 'w' },
})

const localOpen = ref(false)
const open = computed(() => (props.input ? props.input.panelOpen : localOpen.value))

const count = computed(() => worldCount(toRaw(props.state)))
const ariaLabel = computed(() => n('quantumchess', '%n possibility', '%n possibilities', count.value))

const list = computed(() => {
	if (!open.value) {
		return { items: [], rest: 0, restWeight: 0, differing: [] }
	}
	const raw = toRaw(props.state)
	const p = possibilities(raw, { limit: 6 })
	return {
		...p,
		items: p.items.map((item) => ({
			...item,
			board: { ...raw, worlds: [[item.board, T]] },
			text: formatProbability(item.weight, { format: boardPrefs.probabilityFormat, weight: true }),
		})),
	}
})

/**
 * The popover opened or closed.
 *
 * @param {boolean} shown new state
 */
function onShown(shown) {
	if (props.input) {
		props.input.togglePanel(shown)
	} else {
		localOpen.value = shown
	}
}

const restText = computed(() => formatProbability(list.value.restWeight, { weight: true }))
</script>

<style lang="scss" scoped>
.qc-poss__count {
	font-variant-numeric: tabular-nums;
	font-weight: 600;

	&--muted {
		color: var(--color-text-maxcontrast);
		font-weight: 400;
	}
}

.qc-poss {
	padding: 12px;
	max-width: 360px;
	border-radius: var(--border-radius-large);

	&:focus-visible {
		outline: 2px solid var(--color-main-text);
		outline-offset: -2px;
	}
}

.qc-poss__title {
	margin-bottom: 8px;
}

.qc-poss__list {
	display: grid;
	grid-template-columns: repeat(3, 72px);
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-poss__item {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}

.qc-poss__bar {
	display: block;
	height: 4px;
	border-radius: 2px;
	background: var(--color-background-darker);

	span {
		display: block;
		height: 100%;
		border-radius: 2px;
		background: var(--qc-quantum);
	}
}

.qc-poss__rest {
	margin-top: 8px;
	color: var(--color-text-maxcontrast);
}
</style>
