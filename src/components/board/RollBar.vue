<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Roll transparency (GAME-DESIGN §3.6.3): one stretch per outcome and a marker at the roll, with the engine's
  `rollDisplay` text ("Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved").
-->
<template>
	<div class="qc-roll-bar" :class="{ 'qc-roll-bar--compact': compact }">
		<div class="qc-roll-bar__track" role="img" :aria-label="text">
			<OutcomeBar :outcomes="record.outcomes" :realised="record.key" :minLabelShare="compact ? 2 : 0.22" />
			<span
				v-if="marker !== null"
				class="qc-roll-bar__marker"
				:style="{ insetInlineStart: marker + '%' }"
				aria-hidden="true" />
		</div>
		<p v-if="showText" class="qc-roll-bar__text">
			{{ text }}
		</p>
	</div>
</template>

<script setup>
import { computed } from 'vue'
import OutcomeBar from './OutcomeBar.vue'
import { rollDisplay, T } from '../../engine/index.js'
import { rollLabels } from '../../engine/ui/index.js'

const props = defineProps({
	/** MeasurementRecord {key, u, outcomes, captured, fallback} */
	record: { type: Object, required: true },
	/** Label overrides for rollDisplay */
	labels: { type: Object, default: null },
	/** Show the rollDisplay text */
	showText: { type: Boolean, default: true },
	/** Thin bar without labels */
	compact: { type: Boolean, default: false },
})

const text = computed(() => rollDisplay(props.record, { ...rollLabels(), ...(props.labels ?? {}) }))

const marker = computed(() => {
	const u = props.record.u
	if (u === null || u === undefined) {
		return null
	}
	return Math.min(100, Math.max(0, (u / T) * 100))
})
</script>

<style lang="scss" scoped>
.qc-roll-bar__track {
	position: relative;
	padding-bottom: 8px;
}

.qc-roll-bar--compact .qc-roll-bar__track :deep(.qc-outcome-bar) {
	height: 8px;
}

.qc-roll-bar__marker {
	position: absolute;
	bottom: 0;
	width: 0;
	height: 0;
	margin-inline-start: -6px;
	border-inline: 6px solid transparent;
	border-bottom: 8px solid var(--color-main-text);
}

.qc-roll-bar__text {
	margin: 2px 0 0;
	color: var(--color-text-maxcontrast);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}
</style>
