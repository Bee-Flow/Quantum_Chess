<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A stacked bar of the outcomes of a roll in key order (GAME-DESIGN §3.5.5): Missed · Moved · Captured, or the squares
  of a Measure. Captured uses the success colour; Moved and Missed are neutral and never red.
-->
<template>
	<div class="qc-outcome-bar" role="img" :aria-label="summary">
		<div
			v-for="seg in segments"
			:key="seg.key"
			class="qc-outcome-bar__seg"
			:class="['qc-outcome-bar__seg--' + seg.tone, { 'qc-outcome-bar__seg--realised': realised === seg.key, 'qc-outcome-bar__seg--dim': realised !== null && realised !== seg.key }]"
			:style="{ flexGrow: seg.weight }"
			:title="seg.text">
			<span v-if="seg.share >= minLabelShare" class="qc-outcome-bar__text" aria-hidden="true">{{ seg.text }}</span>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue'
import { formatProbability, outcomeLabel } from '../../engine/ui/index.js'
import { boardPrefs } from './boardPreferences.js'

const props = defineProps({
	/** Outcomes [{key, weight}] in key order */
	outcomes: { type: Array, required: true },
	/** The realised key, if known */
	realised: { type: String, default: null },
	/** Hide labels on segments narrower than this share */
	minLabelShare: { type: Number, default: 0.22 },
})

const segments = computed(() => {
	const total = props.outcomes.reduce((s, o) => s + o.weight, 0) || 1
	return props.outcomes.map((o, i) => {
		const tone = o.key === 'capture' ? 'capture' : (o.key === 'move' || o.key === 'miss' ? o.key : (i % 2 === 0 ? 'move' : 'miss'))
		const p = formatProbability(o.weight, { format: boardPrefs.probabilityFormat, weight: true })
		return {
			key: o.key,
			weight: o.weight,
			share: o.weight / total,
			tone,
			text: (o.key === 'capture' ? '✓ ' : '') + outcomeLabel(o.key) + ' ' + p,
		}
	})
})

const summary = computed(() => segments.value.map((s) => s.text).join(', '))
</script>

<style lang="scss" scoped>
.qc-outcome-bar {
	display: flex;
	gap: 2px;
	height: 22px;
	border-radius: var(--border-radius-small, 4px);
	overflow: hidden;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}

.qc-outcome-bar__seg {
	flex-basis: 0;
	min-width: 4px;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	white-space: nowrap;
	color: #111;

	&--capture {
		background: var(--qc-success-strong);
		color: #fff;
	}

	&--move {
		background: var(--qc-outcome-move);
		color: #fff;
	}

	&--miss {
		background: var(--qc-outcome-miss);
	}

	&--realised {
		box-shadow: inset 0 0 0 2px var(--color-main-text);
		font-weight: 700;
	}

	&--dim {
		opacity: 0.55;
	}
}

.qc-outcome-bar__text {
	padding-inline: 4px;
	text-overflow: ellipsis;
	overflow: hidden;
}
</style>
