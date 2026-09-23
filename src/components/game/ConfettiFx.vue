<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Quantum confetti (GAME-DESIGN §3.9): 80 particles that first appear as two half-opacity copies, snap into one after
  300 ms and then fall for 1500 ms. Not rendered under reduced motion (the parent decides).
-->
<template>
	<div class="qc-confetti" aria-hidden="true">
		<span
			v-for="p in particles"
			:key="p.id"
			class="qc-confetti__piece"
			:style="p.style" />
	</div>
</template>

<script setup>
const COLORS = ['#7c4dff', '#00b8d4', '#ffab00', '#ff4081', '#64dd17', '#2979ff']

const particles = Array.from({ length: 80 }, (_, id) => {
	const x = Math.random() * 100
	const drift = (Math.random() - 0.5) * 30
	const split = 6 + Math.random() * 10
	const delay = Math.random() * 250
	return {
		id,
		style: {
			left: x + '%',
			background: COLORS[id % COLORS.length],
			'--qc-drift': drift + 'vw',
			'--qc-split': split + 'px',
			'--qc-spin': (Math.random() * 720 - 360) + 'deg',
			animationDelay: delay + 'ms',
		},
	}
})
</script>

<style scoped>
.qc-confetti {
	position: fixed;
	z-index: 10001;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
}

.qc-confetti__piece {
	position: absolute;
	top: 18%;
	width: 8px;
	height: 12px;
	border-radius: 2px;
	opacity: 0;
	animation: qc-confetti-fall 1800ms cubic-bezier(0.2, 0.6, 0.4, 1) forwards;
}

.qc-confetti__piece::after {
	position: absolute;
	inset: 0;
	border-radius: inherit;
	background: inherit;
	content: '';
	opacity: 0.5;
	animation: qc-confetti-ghost 300ms ease-out forwards;
}

@keyframes qc-confetti-ghost {
	from {
		transform: translateX(var(--qc-split));
	}

	to {
		transform: translateX(0);
		opacity: 0;
	}
}

@keyframes qc-confetti-fall {
	0% {
		opacity: 0.5;
		transform: translate(0, 0) rotate(0);
	}

	16% {
		opacity: 1;
		transform: translate(0, 0) rotate(0);
	}

	100% {
		opacity: 0;
		transform: translate(var(--qc-drift), 75vh) rotate(var(--qc-spin));
	}
}
</style>
