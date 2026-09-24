<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Layer 1 of the board, under the pieces: the dashed outline of a missed last move, the what-if outlines, link chords,
  the outlines and threads of the focused ghost's other parts, king rings, the coach's crosshairs and the target markers
  of the selected piece (one shape per kind of target). It also defines the hatch pattern and the glow gradient that the
  pieces reference.
-->
<template>
	<svg class="qc-board__markers" viewBox="0 0 8 8" aria-hidden="true">
		<defs>
			<pattern
				:id="uid + '-hatch'"
				width="0.16"
				height="0.16"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)">
				<line
					x1="0"
					y1="0"
					x2="0"
					y2="0.16"
					class="qc-hatch" />
			</pattern>
			<radialGradient :id="uid + '-glow'">
				<stop offset="0%" stop-color="#b39bff" stop-opacity="0.85" />
				<stop offset="100%" stop-color="#b39bff" stop-opacity="0" />
			</radialGradient>
		</defs>
		<!-- last move: Missed = dashed "attempted" outline -->
		<rect
			v-for="s in lastDashed"
			:key="'lm' + s"
			v-bind="geo.rectOf(s, 0.04)"
			class="qc-mk-attempted" />
		<!-- what-if outlines on changed squares -->
		<rect
			v-for="p in whatIfChanged"
			:key="'wi' + p.square"
			v-bind="geo.rectOf(p.square, 0.04)"
			class="qc-mk-whatif"
			:class="p.delta.up ? 'qc-mk-whatif--up' : 'qc-mk-whatif--down'" />
		<!-- link chords (Link threads: Always) -->
		<line
			v-for="(c, i) in linkChords"
			:key="'lc' + i"
			v-bind="c"
			class="qc-mk-chord" />
		<!-- other parts of the focused ghost: dashed outline and a flowing thread -->
		<rect
			v-for="s in threads.outlines"
			:key="'po' + s"
			v-bind="geo.rectOf(s, 0.06)"
			class="qc-mk-part" />
		<path
			v-for="(d, i) in threads.paths"
			:key="'pt' + i"
			:d="d"
			class="qc-mk-thread" />
		<!-- king rings -->
		<circle
			v-for="k in kings"
			:key="'k' + k.color"
			:cx="geo.center(k.square).x"
			:cy="geo.center(k.square).y"
			r="0.47"
			class="qc-mk-king"
			:class="{ 'qc-mk-king--certain': k.certain }" />
		<!-- coach markers -->
		<g v-for="(m, i) in markers" :key="'cm' + i" :class="'qc-mk-coach qc-mk-coach--' + m.kind">
			<circle :cx="geo.center(m.square).x" :cy="geo.center(m.square).y" r="0.3" />
			<line
				:x1="geo.center(m.square).x - 0.42"
				:y1="geo.center(m.square).y"
				:x2="geo.center(m.square).x + 0.42"
				:y2="geo.center(m.square).y" />
			<line
				:x1="geo.center(m.square).x"
				:y1="geo.center(m.square).y - 0.42"
				:x2="geo.center(m.square).x"
				:y2="geo.center(m.square).y + 0.42" />
		</g>
		<!-- target markers -->
		<g
			v-for="mk in targetMarks"
			:key="'t' + mk.square"
			class="qc-mk-target"
			:class="['qc-mk--' + mk.kind, { 'qc-mk-target--hover': mk.hover }]"
			:transform="mk.transform">
			<template v-if="mk.kind === 'certain'">
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.14"
					class="qc-mk-dot" />
			</template>
			<template v-else-if="mk.kind === 'quantum'">
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.14"
					class="qc-mk-hollow" />
				<circle
					:cx="mk.x + 0.24"
					:cy="mk.y - 0.24"
					r="0.13"
					class="qc-mk-disc" />
				<path :d="mdiLinkVariant" :transform="`translate(${mk.x + 0.15} ${mk.y - 0.33}) scale(0.0075)`" class="qc-mk-glyph" />
			</template>
			<template v-else-if="mk.kind === 'roll' || mk.kind === 'roll-budget'">
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.12"
					class="qc-mk-dot" />
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.21"
					class="qc-mk-dashed" />
				<text
					v-if="mk.kind === 'roll-budget'"
					:x="mk.x"
					:y="mk.y + 0.4"
					class="qc-mk-text">8/8</text>
			</template>
			<template v-else-if="mk.kind === 'roll-capture' || mk.kind === 'certain-capture'">
				<polygon
					v-for="(pts, i) in mk.corners"
					:key="i"
					:points="pts"
					class="qc-mk-corner" />
			</template>
			<template v-else-if="mk.kind === 'split' || mk.kind === 'split-disabled'">
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.2"
					class="qc-mk-split" />
				<line
					v-if="mk.kind === 'split-disabled'"
					:x1="mk.x - 0.2"
					:y1="mk.y + 0.2"
					:x2="mk.x + 0.2"
					:y2="mk.y - 0.2"
					class="qc-mk-strike" />
			</template>
			<template v-else-if="mk.kind === 'split-chosen'">
				<use
					:href="'#' + mk.symbol"
					:x="mk.x - 0.45"
					:y="mk.y - 0.45"
					width="0.9"
					height="0.9"
					opacity="0.5" />
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.2"
					class="qc-mk-split" />
				<path :d="mk.half" class="qc-mk-split-fill" />
			</template>
			<template v-else-if="mk.kind === 'merge' || mk.kind === 'converging' || mk.kind === 'converging-roll'">
				<polygon
					v-for="(pts, i) in mk.corners"
					:key="i"
					:points="pts"
					class="qc-mk-corner" />
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.2"
					class="qc-mk-split"
					:class="{ 'qc-mk-split--dashed': mk.kind === 'converging-roll' }" />
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.13"
					class="qc-mk-split" />
			</template>
			<template v-else-if="mk.kind === 'merge-part'">
				<circle
					:cx="mk.x + 0.24"
					:cy="mk.y + 0.24"
					r="0.15"
					class="qc-mk-disc" />
				<path :d="mdiCallMerge" :transform="`translate(${mk.x + 0.14} ${mk.y + 0.14}) scale(0.0085)`" class="qc-mk-glyph" />
			</template>
			<template v-else-if="mk.kind === 'measure'">
				<circle
					:cx="mk.x"
					:cy="mk.y"
					r="0.44"
					class="qc-mk-measure" />
			</template>
		</g>
	</svg>
</template>

<script setup>
import { mdiCallMerge, mdiLinkVariant } from '@mdi/js'
import { useBoardContext } from '../../composables/useBoardContext.js'

defineProps({
	/** Squares of a missed last move */
	lastDashed: { type: Array, default: () => [] },
	/** Pieces whose probability changes in the what-if view */
	whatIfChanged: { type: Array, default: () => [] },
	/** Chords between linked pieces, from `linkChordList()` */
	linkChords: { type: Array, default: () => [] },
	/** Outlines and threads of the focused ghost, from `partThreads()` */
	threads: { type: Object, required: true },
	/** King rings, from `kingRings()` */
	kings: { type: Array, default: () => [] },
	/** Coach crosshairs [{square, kind: threat | opportunity}] */
	markers: { type: Array, default: () => [] },
	/** Target markers, from `targetMarkList()` */
	targetMarks: { type: Array, default: () => [] },
})

const { uid, geo } = useBoardContext()
</script>

<style lang="scss" scoped>
.qc-board__markers {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	overflow: visible;
}

.qc-hatch {
	stroke: #111;
	stroke-width: 0.05;
	opacity: 0.5;
}

.qc-mk-attempted {
	fill: none;
	stroke: rgb(40 40 40 / 0.7);
	stroke-width: 0.05;
	stroke-dasharray: 0.12 0.09;
}

.qc-mk-whatif {
	fill: none;
	stroke-width: 0.05;

	&--up {
		stroke: var(--qc-corr-up);
	}

	&--down {
		stroke: var(--qc-corr-down);
	}
}

.qc-mk-chord {
	stroke: var(--qc-board-ring);
	stroke-width: 0.04;
	stroke-dasharray: 0.1 0.1;
	opacity: 0.45;
}

.qc-mk-part {
	fill: none;
	stroke: var(--qc-board-ring);
	stroke-width: 0.05;
	stroke-dasharray: 0.12 0.08;
}

.qc-mk-thread {
	fill: none;
	stroke: var(--qc-board-ring);
	stroke-width: 0.055;
	stroke-linecap: round;
	stroke-dasharray: 0.02 0.11;
	animation: qc-flow calc(1200ms / max(var(--qc-speed), 0.5)) linear infinite;
}

.qc-board--reduced .qc-mk-thread {
	animation: none;
}

.qc-mk-king {
	fill: none;
	stroke: var(--qc-ring-warning);
	stroke-width: 0.06;

	&--certain {
		stroke: var(--qc-ring-danger);
		stroke-width: 0.1;
	}
}

.qc-mk-coach {
	fill: none;
	stroke-width: 0.05;
	stroke: var(--color-primary-element);

	&--threat {
		stroke: var(--qc-ring-danger);
	}
}

.qc-mk-target {
	transition: transform 120ms var(--qc-ease-out);
}

.qc-mk-dot {
	fill: var(--qc-target);
	stroke: var(--qc-target-rim);
	stroke-width: 0.012;
}

.qc-mk-hollow {
	fill: none;
	stroke: var(--qc-target-rim);
	stroke-width: 0.05;
}

.qc-mk-dashed {
	fill: none;
	stroke: var(--qc-target-rim);
	stroke-width: 0.035;
	stroke-dasharray: 0.07 0.05;
}

.qc-mk-disc {
	fill: #fff;
	stroke: var(--qc-board-ring);
	stroke-width: 0.02;
}

.qc-mk-glyph {
	fill: var(--qc-board-ring);
}

.qc-mk-text {
	font-size: 0.2px;
	font-weight: 700;
	text-anchor: middle;
	fill: var(--qc-board-ring);
	paint-order: stroke;
	stroke: #fff;
	stroke-width: 0.05;
}

.qc-mk-corner {
	fill: var(--qc-target-capture);
}

.qc-mk-split {
	fill: none;
	stroke: var(--qc-board-ring);
	stroke-width: 0.06;
	paint-order: stroke;

	&--dashed {
		stroke-dasharray: 0.08 0.06;
	}
}

.qc-mk-split-fill {
	fill: var(--qc-board-ring);
	opacity: 0.6;
}

.qc-mk--split-disabled {
	opacity: 0.3;
}

.qc-mk-strike {
	stroke: var(--qc-board-ring);
	stroke-width: 0.05;
}

.qc-mk-measure {
	fill: none;
	stroke: var(--qc-board-ring);
	stroke-width: 0.05;
	stroke-dasharray: 0.1 0.07;
}

@keyframes qc-flow {
	to {
		stroke-dashoffset: -0.26;
	}
}
</style>
