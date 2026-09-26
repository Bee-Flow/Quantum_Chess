<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One piece of a variant board, drawn in SVG user units around (0, 0): a cburnett sprite (possibly smaller, or a knight
  with a unicorn's horn), a compound of two sprites side by side (Capablanca's archbishop and chancellor), or a text
  token (round, shogi pentagon or xiangqi disc). A promoted sprite piece carries a small red disc with a white "+" at
  its top right. A ghost part is faded and carries a probability ring (a track with an arc of its chance, as on the
  Quantum Chess board) and its percentage in a badge at its bottom right. The ring and the badge are drawn above the
  fade, so they stay sharp. With `unit` (the size of one CSS pixel in user units, from the board) the badge text is at
  least 11 px and the ring at least 2 px on screen; on a raised badge the "%" sign is left out, and a piece smaller
  than 30 px on screen shows only its ring (a badge would cover it). On a text token (its character fills the middle)
  the badge sits in the corner of the square, below and right of the character, and never carries the "%" sign. The
  accessible name of the square always says the percentage. Pieces of a side drawn in its own colour (four-player
  chess) fade only a little, so their hue stays recognisable.
-->
<template>
	<g class="qc-vpiece">
		<g :opacity="opacity">
			<template v-if="glyph.kind === 'sprite' || glyph.kind === 'compound'">
				<use
					v-for="(part, i) in sprites"
					:key="i"
					:href="'#' + part.symbol"
					:x="part.x - part.w / 2"
					:y="part.y - part.w / 2"
					:width="part.w"
					:height="part.w"
					:filter="glyph.tint ? `url(#${tintId})` : undefined" />
				<g
					v-if="glyph.horn"
					class="qc-vpiece__horn"
					:transform="`translate(${-size / 2}, ${-size / 2}) scale(${size / 45})`">
					<path
						d="M13.9 13.6 L5.2 3.6 L11.7 15.4 Z"
						:fill="glyph.horn === 'black' ? '#000' : '#fff'"
						stroke="#000"
						stroke-width="1.2"
						stroke-linejoin="round" />
					<path
						d="M8.3 8.9 L10.2 7.9 M10.1 11.5 L12.2 10.3"
						:stroke="glyph.horn === 'black' ? '#ececec' : '#000'"
						stroke-width="0.8"
						stroke-linecap="round" />
				</g>
				<g
					v-if="glyph.promoted"
					class="qc-vpiece__promoted"
					:transform="`translate(${size * 0.33}, ${-size * 0.33})`">
					<circle :r="size * 0.11" fill="#b71c1c" />
					<path
						:d="plusPath"
						stroke="#ffffff"
						:stroke-width="size * 0.035"
						stroke-linecap="round" />
				</g>
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
		</g>
		<g v-if="ghost" class="qc-vpiece__ring">
			<circle :r="ringRadius" class="qc-vpiece__track" :stroke-width="ringWidth" />
			<path :d="arc" class="qc-vpiece__halo" :stroke-width="ringWidth * 1.6" />
			<path :d="arc" class="qc-vpiece__arc" :stroke-width="ringWidth" />
		</g>
		<g v-if="badge" :transform="`translate(${badge.x}, ${badge.y})`" class="qc-vpiece__badge">
			<rect
				:x="-badge.w / 2"
				:y="-badge.h / 2"
				:width="badge.w"
				:height="badge.h"
				:rx="badge.h * 0.3" />
			<text
				:font-size="badge.font"
				text-anchor="middle"
				dominant-baseline="central">
				{{ badge.text }}
			</text>
		</g>
	</g>
</template>

<script setup>
import { computed } from 'vue'
import { arcPath } from '../../board/geometry.js'

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
	/** The size of one CSS pixel in user units (0: unknown, the badge and the ring scale with the piece) */
	unit: { type: Number, default: 0 },
})

/** The smallest badge text on screen, in CSS pixels. */
const BADGE_MIN_PX = 11
/** The smallest piece on screen that carries a badge, in CSS pixels. */
const BADGE_PIECE_PX = 30
/** The thinnest ring on screen, in CSS pixels. */
const RING_MIN_PX = 2
/** The bottom-right corner of the square from the middle of a piece, in piece sizes (a square is about 1.08). */
const CORNER = 0.53

/**
 * The sprites drawn, `{ symbol, x, y, w }` in user units: one sprite (smaller with `scale`), or the two sprites of a
 * compound piece side by side, the first a little behind and to the left, the second in front and to the right.
 */
const sprites = computed(() => {
	const g = props.glyph
	const s = props.size
	if (g.kind === 'compound') {
		// both keep their base on the base line of the full-size pieces (0.37 of a piece below the middle)
		return [
			{ symbol: g.parts[0].symbol, x: -0.2 * s, y: 0.066 * s, w: 0.82 * s },
			{ symbol: g.parts[1].symbol, x: 0.16 * s, y: 0.051 * s, w: 0.86 * s },
		]
	}
	// a smaller piece keeps its base on the base line of the full-size pieces
	const w = s * (g.scale ?? 1)
	return [{ symbol: g.symbol, x: 0, y: (s - w) * 0.37, w }]
})

const ghost = computed(() => props.p < 0.995)
const opacity = computed(() => {
	if (!ghost.value) {
		return 1
	}
	// a side in its own colour keeps its hue: the ring and the badge tell the chance
	return props.glyph.tint ? 0.8 + 0.2 * props.p : 0.38 + 0.5 * props.p
})
const ringRadius = computed(() => props.size * 0.48)
const ringWidth = computed(() => Math.max(props.size * 0.06, RING_MIN_PX * props.unit))
const arc = computed(() => arcPath(props.p, ringRadius.value, 0, 0))

/**
 * The badge of a ghost, or null: its text, font size, pill size and centre. It sits at the bottom right of the piece;
 * its text is 0.2 of the piece, raised to 11 CSS px when the board is small. A piece under 30 px has none.
 */
const badge = computed(() => {
	if (!ghost.value || (props.unit > 0 && props.size < BADGE_PIECE_PX * props.unit)) {
		return null
	}
	const percent = Math.max(1, Math.round(props.p * 100))
	const token = props.glyph.kind === 'text'
	const natural = props.size * (token ? 0.17 : 0.2)
	const floor = BADGE_MIN_PX * props.unit
	const raised = floor > natural
	const font = raised ? floor : natural
	const text = raised || token ? String(percent) : percent + '%'
	const w = font * (0.62 * text.length + 0.85)
	const h = font * 1.3
	if (token) {
		// in the corner of the square, clear of the character in the middle as far as the badge's size allows
		return { text, font, w, h, x: props.size * CORNER - w / 2, y: props.size * CORNER - h / 2 }
	}
	return { text, font, w, h, x: props.size * 0.47 - w / 2, y: props.size * 0.45 - h / 2 }
})
const fontSize = computed(() => {
	const len = [...(props.glyph.text ?? '')].length
	return props.size * (len <= 1 ? 0.5 : len === 2 ? 0.36 : 0.26)
})
const plusPath = computed(() => {
	const a = props.size * 0.06
	return `M ${-a} 0 H ${a} M 0 ${-a} V ${a}`
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

.qc-vpiece__promoted,
.qc-vpiece__horn,
.qc-vpiece__ring {
	pointer-events: none;
}

.qc-vpiece__track {
	fill: none;
	stroke: rgb(11 22 34 / 0.18);
}

.qc-vpiece__halo {
	fill: none;
	stroke: var(--qc-quantum-halo, rgb(255 255 255 / 0.75));
	stroke-linecap: round;
}

.qc-vpiece__arc {
	fill: none;
	stroke: var(--qc-board-ring, #3f1ca0);
	stroke-linecap: round;
}

.qc-vpiece__badge rect {
	fill: var(--qc-quantum-board, #3f1ca0);
	stroke: #ffffff;
	stroke-width: 0.02;
}

.qc-vpiece__badge text {
	fill: #fff;
	font-weight: bold;
	font-variant-numeric: tabular-nums;
	pointer-events: none;
}
</style>
