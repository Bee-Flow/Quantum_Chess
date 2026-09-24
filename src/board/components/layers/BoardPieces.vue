<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Layer 2 of the board: the pieces. A ghost part is drawn faded by its probability, with a probability ring and a soft
  glow; a part that cannot be there in the what-if view is hatched. Pieces that enter slide in from the square the
  animator names as their origin, or fade in; pieces that leave during an animation shrink and fade out.
-->
<template>
	<TransitionGroup
		tag="div"
		class="qc-board__pieces"
		:css="false"
		@enter="onEnter"
		@leave="onLeave">
		<div
			v-for="p in pieces"
			:key="p.key"
			:data-key="p.key"
			class="qc-piece"
			:class="p.classes"
			:style="p.style">
			<svg viewBox="0 0 1 1" class="qc-piece__svg">
				<circle
					v-if="p.ghost && !p.impossible"
					cx="0.5"
					cy="0.5"
					r="0.46"
					:fill="`url(#${uid}-glow)`"
					class="qc-piece__glow"
					:style="{ animationDelay: (p.piece % 8) * 300 + 'ms' }" />
				<template v-if="p.ring">
					<circle
						cx="0.5"
						cy="0.5"
						r="0.44"
						class="qc-piece__track"
						:stroke-width="ringWidth" />
					<path :d="p.ring" class="qc-piece__halo" :stroke-width="ringWidth + 0.03" />
					<path :d="p.ring" class="qc-piece__arc" :stroke-width="ringWidth" />
				</template>
				<use
					:href="'#' + p.symbol"
					x="0.05"
					y="0.05"
					width="0.9"
					height="0.9"
					:opacity="p.opacity" />
				<rect
					v-if="p.impossible"
					x="0.04"
					y="0.04"
					width="0.92"
					height="0.92"
					:fill="`url(#${uid}-hatch)`" />
			</svg>
		</div>
	</TransitionGroup>
</template>

<script setup>
import { useBoardContext } from '../../composables/useBoardContext.js'

defineProps({
	/** Pieces from `pieceSprites()` */
	pieces: { type: Array, required: true },
	/** Stroke width of the probability rings in board units */
	ringWidth: { type: Number, required: true },
})

const { uid, geo, anim } = useBoardContext()

/**
 * A piece appears: it slides in from its origin square during a move, else it fades in.
 *
 * @param {HTMLElement} el entering piece
 * @param {() => void} done callback
 */
function onEnter(el, done) {
	const key = el.dataset.key
	const origin = anim.state.origins[key]
	const d = anim.state.moveDuration
	if (!el.animate || d <= 0) {
		done()
		return
	}
	let a
	if (origin !== undefined) {
		const from = geo.value.pixelOf(origin)
		a = el.animate(
			[{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: el.style.transform }],
			{ duration: d, easing: 'cubic-bezier(.2,.8,.2,1)' },
		)
	} else {
		a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(d, 200), easing: 'ease-out' })
	}
	a.onfinish = done
	a.oncancel = done
}

/**
 * A piece disappears: it shrinks and fades during an animation, else it is removed at once.
 *
 * @param {HTMLElement} el leaving piece
 * @param {() => void} done callback
 */
function onLeave(el, done) {
	const d = anim.state.fade
	if (!el.animate || d <= 0 || anim.state.instantLeave.includes(el.dataset.key) || !anim.state.busy) {
		done()
		return
	}
	const base = el.style.transform
	const a = el.animate([
		{ opacity: 1, transform: base },
		{ opacity: 0, transform: base + ' scale(0.6)' },
	], { duration: d, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' })
	a.onfinish = done
	a.oncancel = done
}
</script>

<style lang="scss" scoped>
.qc-board__pieces {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 2;
}

.qc-piece {
	&--return {
		transition: transform 200ms var(--qc-ease-out);
	}

	&--dragging {
		filter: drop-shadow(0 6px 6px rgb(0 0 0 / 0.35));
	}

	&--source {
		opacity: 0.35;
	}

	&--crossfade {
		transition: opacity 150ms ease;
	}
}

.qc-piece--hover .qc-piece__svg {
	transform: translateY(-2px);
	filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3));
}

.qc-piece--shake .qc-piece__svg {
	animation: qc-shake 300ms ease;
}

.qc-piece--pop .qc-piece__svg {
	animation: qc-pop calc(300ms * max(var(--qc-speed), 0.5)) var(--qc-ease-pop);
}

.qc-piece__glow {
	opacity: 0.45;
	animation: qc-breathe 2400ms ease-in-out infinite alternate;
}

.qc-piece__track {
	fill: none;
	stroke: rgb(11 22 34 / 0.18);
}

.qc-piece__halo {
	fill: none;
	stroke: var(--qc-quantum-halo);
	stroke-linecap: round;
}

.qc-piece__arc {
	fill: none;
	stroke: var(--qc-board-ring);
	stroke-linecap: round;
}

.qc-board--reduced .qc-piece__glow,
.qc-board__frame.qc-board--paused .qc-piece__glow {
	animation: none;
}

@keyframes qc-breathe {
	from {
		opacity: 0.45;
	}

	to {
		opacity: 0.9;
	}
}

@keyframes qc-shake {
	25% {
		transform: translateX(-4px);
	}

	50% {
		transform: translateX(4px);
	}

	75% {
		transform: translateX(-2px);
	}
}

@keyframes qc-pop {
	0% {
		transform: scale(1);
		filter: drop-shadow(0 0 0 #fff);
	}

	45% {
		transform: scale(1.08);
		filter: drop-shadow(0 0 5px #fff);
	}

	100% {
		transform: scale(1);
		filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-piece__glow {
		animation: none;
	}
}
</style>
