<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The quality badge of the player's latest move, shown over the board corner for a few seconds (Beginner: every
  move; Standard: mistakes only, GAME-DESIGN §5.3).
-->
<template>
	<Transition name="qc-qtoast">
		<div v-if="shown" class="qc-qtoast" role="status">
			<QualityBadge :label="shown.label" :luck="shown.luck" />
		</div>
	</Transition>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import QualityBadge from './QualityBadge.vue'
import { BAD_LABELS } from '../../coach/quality.js'

const props = defineProps({
	/** useCoach result */
	coach: { type: Object, required: true },
})

/** Visible time in ms. */
const VISIBLE_MS = 4000
const shown = ref(null)
let timer = null

watch(() => props.coach.qualityByPly.value, (map, old) => {
	const fresh = [...map.entries()].filter(([ply]) => !old?.has(ply))
	if (!fresh.length) {
		return
	}
	const q = fresh[fresh.length - 1][1]
	if (props.coach.level.value === 'standard' && !BAD_LABELS.includes(q.label) && !q.luck) {
		return
	}
	shown.value = q
	clearTimeout(timer)
	timer = setTimeout(() => {
		shown.value = null
	}, VISIBLE_MS)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style lang="scss" scoped>
.qc-qtoast {
	position: absolute;
	top: 6px;
	inset-inline-end: 6px;
	z-index: 5;
	pointer-events: none;
	filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35));
}

.qc-qtoast-enter-active,
.qc-qtoast-leave-active {
	transition: opacity 250ms ease, transform 250ms ease;
}

.qc-qtoast-enter-from,
.qc-qtoast-leave-to {
	opacity: 0;
	transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
	.qc-qtoast-enter-active,
	.qc-qtoast-leave-active {
		transition: none;
	}
}
</style>
