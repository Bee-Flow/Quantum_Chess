<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The quality badge of the player's latest move, shown for a few seconds next to that move's target square and naming
  the move ("d2-d4 Good"), so it never reads as a verdict on the reply or on the piece under it (Beginner: every move;
  Standard: mistakes only). It sits below the square (above it on the bottom rank), so the square's own probability
  badge in its top corner stays visible.
-->
<template>
	<Transition name="qc-qtoast">
		<div
			v-if="shown"
			class="qc-qtoast"
			:style="place"
			role="status"
			data-test="quality-toast">
			<span class="qc-qtoast__move">{{ shown.code }}</span>
			<QualityBadge :label="shown.label" :luck="shown.luck" />
		</div>
	</Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QualityBadge from './QualityBadge.vue'
import { squareIndex } from '../../engine/index.js'
import { BAD_LABELS } from '../quality.js'

const props = defineProps({
	/** useCoach result */
	coach: { type: Object, required: true },
	/** Board orientation: the colour at the bottom */
	orientation: { type: String, default: 'w' },
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

/**
 * The square a move code ends on (a split: its first target; a measurement: the measured square).
 *
 * @param {string} code canonical move code
 * @return {number} square index, -1 if unknown
 */
function targetOf(code) {
	const c = String(code ?? '')
	const name = c.startsWith('?') ? c.slice(1) : c.split('-').pop().split('|')[0].replace(/=.*/, '')
	return squareIndex(name)
}

/** Position over the board, in % of its size: below the target square, clamped to the board's edges. */
const place = computed(() => {
	const sq = shown.value ? targetOf(shown.value.code) : -1
	if (sq < 0) {
		return { top: '6px', insetInlineEnd: '6px' }
	}
	const white = props.orientation !== 'b'
	const col = white ? sq & 7 : 7 - (sq & 7)
	const row = white ? 7 - (sq >> 3) : sq >> 3
	const style = {}
	if (row === 7) {
		style.bottom = '12.5%'
	} else {
		style.top = `${(row + 1) * 12.5}%`
	}
	if (col <= 1) {
		style.left = `${col * 12.5}%`
	} else if (col >= 6) {
		style.right = `${(7 - col) * 12.5}%`
	} else {
		style.left = `${col * 12.5 + 6.25}%`
		style.transform = 'translateX(-50%)'
	}
	return style
})
</script>

<style lang="scss" scoped>
.qc-qtoast {
	position: absolute;
	z-index: 5;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin-block: 2px;
	padding: 2px 2px 2px 6px;
	border-radius: var(--border-radius-pill, 12px);
	background: var(--color-main-background);
	color: var(--color-main-text);
	white-space: nowrap;
	pointer-events: none;
	filter: drop-shadow(0 1px 3px var(--qc-toast-shadow));
}

.qc-qtoast__move {
	font-size: 0.85em;
	font-weight: bold;
	font-variant-numeric: tabular-nums;
}

.qc-qtoast-enter-active,
.qc-qtoast-leave-active {
	transition: opacity 250ms ease;
}

.qc-qtoast-enter-from,
.qc-qtoast-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.qc-qtoast-enter-active,
	.qc-qtoast-leave-active {
		transition: none;
	}
}
</style>
