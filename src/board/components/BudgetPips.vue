<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Quantum budget pips: 8 small squares filled to `budget(state, colour)`. The first pip is muted while nothing is a
  ghost; at 8/8 the pips pulse once. The button opens a popover that explains the budget and names the ghosts that use
  it.
-->
<template>
	<NcPopover class="qc-budget" :aria-label="t('quantumchess', 'Quantum budget')">
		<template #trigger>
			<button
				type="button"
				class="qc-budget__button"
				:class="{ 'qc-budget__button--full': used >= 8, 'qc-budget__button--pulse': pulse }"
				:title="tooltip"
				:aria-label="ariaLabel">
				<span
					v-for="i in 8"
					:key="i"
					class="qc-budget__pip"
					:class="{ 'qc-budget__pip--on': i <= used, 'qc-budget__pip--muted': used <= 1 && i === 1 }"
					aria-hidden="true" />
				<span class="qc-budget__count" aria-hidden="true">{{ used }}/8</span>
			</button>
		</template>
		<div class="qc-budget__popover">
			<p>{{ tooltip }}</p>
			<p v-if="ghostNames.length > 0" class="qc-budget__ghosts">
				{{ t('quantumchess', 'Ghosts: {list}', { list: ghostNames.join(', ') }) }}
			</p>
			<p v-else class="qc-budget__ghosts">
				{{ t('quantumchess', 'No ghosts: every piece stands on one square.') }}
			</p>
		</div>
	</NcPopover>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref, toRaw, watch } from 'vue'
import NcPopover from '@nextcloud/vue/components/NcPopover'
import { pieceLocations, squareName } from '../../engine/index.js'
import { pieceName } from '../../engine/ui/index.js'
import { reducedMotion } from '../../services/preferences.js'

const props = defineProps({
	/** budget(state, color), 1..8 */
	used: { type: Number, required: true },
	/** 'w' or 'b' */
	color: { type: String, required: true },
	/** Engine state (names the ghosts in the popover) */
	state: { type: Object, default: null },
})

const tooltip = computed(() => t('quantumchess', 'Quantum budget: your pieces could be standing in {n} different ways. At 8/8 you can\'t split, and quantum moves become rolls.', { n: props.used }))
const ariaLabel = computed(() => t('quantumchess', 'Quantum budget {used} of 8', { used: props.used }))

const ghostNames = computed(() => {
	if (!props.state) {
		return []
	}
	const locs = pieceLocations(toRaw(props.state))
	const out = []
	for (let id = props.color === 'w' ? 0 : 16, end = id + 16; id < end; id++) {
		if (locs[id].length > 1) {
			out.push(pieceName(props.state.types[id], props.color) + ' (' + locs[id].map((l) => squareName(l.square)).join(' | ') + ')')
		}
	}
	return out
})

const pulse = ref(false)
watch(() => props.used, (now, before) => {
	if (now >= 8 && before < 8 && !reducedMotion.value) {
		pulse.value = true
		setTimeout(() => {
			pulse.value = false
		}, 700)
	}
})
</script>

<style lang="scss" scoped>
.qc-budget__button {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	min-height: 32px;
	padding: 4px 6px;
	margin: 0;
	border: none;
	border-radius: var(--border-radius-element, 8px);
	background: transparent;
	color: var(--color-main-text);
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background: var(--color-background-hover);
	}

	&--pulse {
		animation: qc-budget-pulse 700ms var(--qc-ease-pop);
	}
}

.qc-budget__pip {
	width: 7px;
	height: 7px;
	border-radius: 2px;
	border: 1px solid var(--qc-quantum);
	background: transparent;

	&--on {
		background: var(--qc-quantum);
	}

	&--muted {
		opacity: 0.4;
	}
}

.qc-budget__button--full .qc-budget__pip--on {
	background: var(--qc-ring-warning);
	border-color: var(--qc-ring-warning);
}

.qc-budget__count {
	margin-inline-start: 4px;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
}

.qc-budget__popover {
	max-width: 300px;
	padding: 12px;

	p + p {
		margin-top: 8px;
	}
}

.qc-budget__ghosts {
	color: var(--color-text-maxcontrast);
}

@keyframes qc-budget-pulse {
	50% {
		transform: scale(1.12);
	}
}
</style>
