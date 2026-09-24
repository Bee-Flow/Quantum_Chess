<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The rating over time: one point per rated game, a line and the latest value, drawn in SVG. -->
<template>
	<figure class="qc-rating-graph" data-test="rating-graph">
		<svg
			v-if="points.length > 1"
			:viewBox="`0 0 ${W} ${H}`"
			class="qc-rating-graph__svg"
			role="img"
			:aria-label="label">
			<line
				v-for="tick in ticks"
				:key="tick.value"
				:x1="PAD_L"
				:x2="W - PAD_R"
				:y1="tick.y"
				:y2="tick.y"
				class="qc-rating-graph__grid" />
			<text
				v-for="tick in ticks"
				:key="'l' + tick.value"
				:x="PAD_L - 6"
				:y="tick.y + 4"
				text-anchor="end"
				class="qc-rating-graph__tick">{{ tick.value }}</text>
			<polyline :points="line" class="qc-rating-graph__line" />
			<circle
				v-for="(p, i) in points"
				:key="i"
				:cx="p.x"
				:cy="p.y"
				:r="i === points.length - 1 ? 4 : 2.5"
				class="qc-rating-graph__dot">
				<title>{{ p.title }}</title>
			</circle>
		</svg>
		<p v-else class="qc-rating-graph__empty">
			{{ t('quantumchess', 'Play rated games to see your rating over time.') }}
		</p>
	</figure>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'

const props = defineProps({
	/** [{gameId, t, rating}] oldest first */
	history: { type: Array, default: () => [] },
})

const W = 480
const H = 160
const PAD_L = 44
const PAD_R = 12
const PAD_Y = 14

const range = computed(() => {
	const values = props.history.map((h) => h.rating)
	let min = Math.min(...values)
	let max = Math.max(...values)
	if (max - min < 40) {
		min -= 20
		max += 20
	}
	return { min: Math.floor(min / 10) * 10, max: Math.ceil(max / 10) * 10 }
})

/**
 * The y coordinate of a rating.
 *
 * @param {number} r rating
 * @return {number}
 */
function y(r) {
	const { min, max } = range.value
	return PAD_Y + (H - 2 * PAD_Y) * (1 - (r - min) / (max - min))
}

const points = computed(() => {
	const n = props.history.length
	return props.history.map((h, i) => ({
		x: PAD_L + (W - PAD_L - PAD_R) * (n === 1 ? 0.5 : i / (n - 1)),
		y: y(h.rating),
		title: `${h.rating} · ${new Date(h.t * 1000).toLocaleDateString()}`,
	}))
})
const line = computed(() => points.value.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
const ticks = computed(() => {
	const { min, max } = range.value
	return [min, Math.round((min + max) / 2), max].map((value) => ({ value, y: y(value) }))
})
const label = computed(() => {
	const h = props.history
	return t(
		'quantumchess',
		'Rating after each rated game, from {first} to {last}',
		{ first: h[0]?.rating ?? '', last: h[h.length - 1]?.rating ?? '' },
	)
})
</script>

<style lang="scss" scoped>
.qc-rating-graph {
	margin: 0;
}

.qc-rating-graph__svg {
	display: block;
	width: 100%;
	max-width: 560px;
	height: auto;
}

.qc-rating-graph__grid {
	stroke: var(--color-border);
	stroke-width: 1;
}

.qc-rating-graph__tick {
	fill: var(--color-text-maxcontrast);
	font-size: 11px;
}

.qc-rating-graph__line {
	fill: none;
	stroke: var(--color-primary-element);
	stroke-width: 2.5;
	stroke-linejoin: round;
}

.qc-rating-graph__dot {
	fill: var(--color-primary-element);
}

.qc-rating-graph__empty {
	margin: 0;
	color: var(--color-text-maxcontrast);
}
</style>
