<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One piece of a variant board, drawn in SVG user units around (0, 0): a cburnett sprite or a text token (round, shogi
  pentagon or xiangqi disc). A ghost part is faded and carries its percentage.
-->
<template>
	<g class="qc-vpiece" :opacity="opacity">
		<template v-if="glyph.kind === 'sprite'">
			<use
				:href="'#' + glyph.symbol"
				:x="-size / 2"
				:y="-size / 2"
				:width="size"
				:height="size"
				:filter="glyph.tint ? `url(#${tintId})` : undefined" />
		</template>
		<template v-else>
			<polygon
				v-if="glyph.shape === 'shogi'"
				:points="pentagon"
				:fill="glyph.fill"
				stroke="#5d4222"
				:stroke-width="size * 0.04"
				:transform="spin ? `rotate(${spin})` : undefined" />
			<circle
				v-else
				:r="size * 0.42"
				:fill="glyph.fill"
				:stroke="glyph.shape === 'xiangqi' ? glyph.ink : '#1b1b1b'"
				:stroke-width="size * (glyph.shape === 'xiangqi' ? 0.05 : 0.04)" />
			<circle
				v-if="glyph.shape === 'xiangqi'"
				:r="size * 0.34"
				fill="none"
				:stroke="glyph.ink"
				:stroke-width="size * 0.02" />
			<text
				class="qc-vpiece__text"
				:fill="glyph.ink"
				:font-size="fontSize"
				text-anchor="middle"
				dominant-baseline="central"
				:transform="glyph.shape === 'shogi' && spin ? `rotate(${spin})` : undefined">
				{{ glyph.text }}
			</text>
		</template>
		<g v-if="badge" :transform="`translate(${size * 0.2}, ${size * 0.3})`" class="qc-vpiece__badge">
			<rect
				:x="-size * 0.27"
				:y="-size * 0.13"
				:width="size * 0.54"
				:height="size * 0.26"
				:rx="size * 0.08" />
			<text
				:font-size="size * 0.2"
				text-anchor="middle"
				dominant-baseline="central">
				{{ badge }}
			</text>
		</g>
	</g>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
	/** Glyph from glyphs.js `glyphOf` */
	glyph: { type: Object, required: true },
	/** Size in user units */
	size: { type: Number, required: true },
	/** Probability that the piece is here (0..1) */
	p: { type: Number, default: 1 },
	/** Id of the tint filter of this side */
	tintId: { type: String, default: '' },
	/** Rotation of a shogi pentagon in degrees, so that it points at the opponent */
	spin: { type: Number, default: 0 },
})

const opacity = computed(() => (props.p >= 0.995 ? 1 : 0.38 + 0.5 * props.p))
const badge = computed(() => (props.p >= 0.995 ? '' : Math.max(1, Math.round(props.p * 100)) + '%'))
const fontSize = computed(() => {
	const len = [...(props.glyph.text ?? '')].length
	return props.size * (len <= 1 ? 0.5 : len === 2 ? 0.36 : 0.26)
})
const pentagon = computed(() => {
	const s = props.size
	return [
		[0, -0.46 * s],
		[0.3 * s, -0.3 * s],
		[0.38 * s, 0.44 * s],
		[-0.38 * s, 0.44 * s],
		[-0.3 * s, -0.3 * s],
	].map((p) => p.join(',')).join(' ')
})
</script>

<style scoped>
.qc-vpiece__text {
	font-family: 'Noto Serif CJK JP', 'Noto Serif SC', 'Hiragino Mincho ProN', 'Songti SC', serif;
	font-weight: bold;
	pointer-events: none;
	user-select: none;
}

.qc-vpiece__badge rect {
	fill: var(--qc-quantum-board, #3f1ca0);
}

.qc-vpiece__badge text {
	fill: #fff;
	font-weight: bold;
	pointer-events: none;
}
</style>
