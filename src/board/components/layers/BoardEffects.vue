<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Layer 4 of the board, above the badges: arrows (coach hints, move chips, the reveal of a roll, the capture that traps
  a king), the chance-of-capture pies of rolled captures, the outcome ring of a roll while it spins and settles, and the
  traveller: the moving piece of a roll, drawn above everything while it flies to its target.
-->
<template>
	<svg class="qc-board__fx" viewBox="0 0 8 8" aria-hidden="true">
		<g
			v-for="(a, i) in arrows"
			:key="'a' + i"
			class="qc-arrow"
			:class="'qc-arrow--' + a.kind">
			<line
				:x1="a.x1"
				:y1="a.y1"
				:x2="a.x2"
				:y2="a.y2"
				:stroke-dasharray="a.dashed ? '0.2 0.14' : undefined" />
			<polygon :points="a.head" />
		</g>
		<!-- P(Captured) pies of rolled captures, above the piece that may be captured -->
		<g
			v-for="mk in pies"
			:key="'pie' + mk.square"
			class="qc-mk-target"
			:transform="mk.transform">
			<circle
				:cx="mk.px"
				:cy="mk.py"
				r="0.13"
				class="qc-mk-pie-bg" />
			<path :d="mk.pie" class="qc-mk-pie" />
		</g>
		<g v-if="ring" class="qc-roll-ring" :class="{ 'qc-roll-ring--settled': ring.settled !== null }">
			<circle
				:cx="ring.x"
				:cy="ring.y"
				r="0.55"
				class="qc-roll-ring__ripple" />
			<circle
				:cx="ring.x"
				:cy="ring.y"
				r="0.55"
				class="qc-roll-ring__ripple qc-roll-ring__ripple--late" />
			<circle
				v-for="(seg, i) in ring.segments"
				:key="seg.key"
				:cx="ring.x"
				:cy="ring.y"
				:r="RING_R"
				class="qc-roll-ring__seg"
				:class="['qc-roll-ring__seg--' + seg.tone, { 'qc-roll-ring__seg--chosen': ring.settled === seg.key, 'qc-roll-ring__seg--gone': ring.settled !== null && ring.settled !== seg.key }]"
				:style="seg.style"
				:transform="`rotate(-90 ${ring.x} ${ring.y})`"
				:data-i="i" />
		</g>
	</svg>
	<div
		v-if="traveller"
		ref="travellerEl"
		class="qc-piece qc-piece--traveller"
		:style="traveller.style">
		<svg viewBox="0 0 1 1" class="qc-piece__svg">
			<use
				:href="'#' + traveller.symbol"
				x="0.05"
				y="0.05"
				width="0.9"
				height="0.9" />
		</svg>
	</div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { boardPrefs } from '../../boardPreferences.js'
import { RING_R, rollRing } from '../../boardScene.js'
import { useBoardContext } from '../../composables/useBoardContext.js'
import { pieceSymbolId } from '../../pieceSprites.js'

defineProps({
	/** Arrow shapes, from `arrowShape()` */
	arrows: { type: Array, default: () => [] },
	/** Target markers of rolled captures with their pie (`targetMarkList()` entries that have `pie`) */
	pies: { type: Array, default: () => [] },
})

const { geo, anim } = useBoardContext()
const travellerEl = ref(null)

const ring = computed(() => rollRing(anim.state.ring, geo.value))

const traveller = computed(() => {
	const tr = anim.state.travel
	if (!tr) {
		return null
	}
	const px = geo.value.pixelOf(tr.to)
	return {
		...tr,
		symbol: pieceSymbolId(boardPrefs.pieceSet, tr.color, tr.type),
		style: { transform: `translate(${px.x}px, ${px.y - 2}px)` },
	}
})

// Fly the traveller from its square to its target.
watch(() => anim.state.travel, async (tr) => {
	if (!tr) {
		return
	}
	await nextTick()
	const el = travellerEl.value
	if (el?.animate) {
		const a = geo.value.pixelOf(tr.from)
		const b = geo.value.pixelOf(tr.to)
		el.animate([
			{ transform: `translate(${a.x}px, ${a.y}px)`, opacity: 1 },
			{ transform: `translate(${b.x}px, ${b.y - 2}px)`, opacity: 0.55 },
		], { duration: tr.duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
	}
})
</script>

<style lang="scss" scoped>
.qc-board__fx {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	overflow: visible;
	z-index: 3;
}

.qc-mk-target {
	transition: transform 120ms var(--qc-ease-out);
}

.qc-mk-pie-bg {
	fill: rgb(255 255 255 / 0.7);
	stroke: var(--qc-target-rim);
	stroke-width: 0.02;
}

.qc-mk-pie {
	fill: var(--qc-success);
}

.qc-arrow {
	opacity: 0.8;
	color: var(--color-primary-element);

	line {
		stroke: currentColor;
		stroke-width: 0.15;
		stroke-linecap: round;
	}

	polygon {
		fill: currentColor;
	}

	&--best {
		color: #2e7d32;
	}

	&--played {
		color: #5f6b7a;
	}

	&--threat,
	&--forced {
		color: var(--qc-ring-danger);
	}

	&--reveal {
		color: var(--qc-board-ring);
		opacity: 0.9;
	}
}

.qc-roll-ring__seg {
	fill: none;
	stroke-width: 0.13;
	transition:
		stroke-dasharray calc(200ms * var(--qc-speed)) var(--qc-ease-io),
		stroke-dashoffset calc(200ms * var(--qc-speed)) var(--qc-ease-io),
		opacity calc(200ms * var(--qc-speed)) ease;
	animation: qc-seg-breathe 600ms ease-in-out infinite alternate;

	&--capture {
		stroke: var(--qc-success);
	}

	&--move {
		stroke: var(--qc-outcome-move);
	}

	&--miss {
		stroke: var(--qc-outcome-miss);
	}

	&--chosen {
		animation: none;
	}

	&--gone {
		opacity: 0;
		animation: none;
	}
}

.qc-roll-ring__ripple {
	fill: none;
	stroke: var(--qc-board-ring);
	stroke-width: 0.04;
	transform-box: fill-box;
	transform-origin: center;
	animation: qc-ripple 900ms ease-out infinite;

	&--late {
		animation-delay: 300ms;
	}
}

.qc-roll-ring--settled .qc-roll-ring__ripple {
	display: none;
}

@keyframes qc-seg-breathe {
	from {
		opacity: 0.7;
	}

	to {
		opacity: 1;
	}
}

@keyframes qc-ripple {
	from {
		transform: scale(0.6);
		opacity: 0.8;
	}

	to {
		transform: scale(1.5);
		opacity: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-roll-ring__ripple,
	.qc-roll-ring__seg {
		animation: none;
	}
}
</style>
