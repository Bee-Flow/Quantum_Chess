<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The empty-state illustration (GAME-DESIGN §2.3): a knight shown twice at 50 % joined by a dotted thread. -->
<template>
	<svg
		class="qc-knight-illustration"
		viewBox="0 0 160 80"
		width="160"
		height="80"
		aria-hidden="true">
		<path
			d="M44 44 C 64 20, 96 20, 116 44"
			fill="none"
			stroke="var(--qc-quantum, #7c4dff)"
			stroke-width="2"
			stroke-dasharray="3 5"
			stroke-linecap="round" />
		<use
			href="#qc-piece-cburnett-wN"
			x="12"
			y="30"
			width="48"
			height="48"
			opacity="0.5" />
		<use
			href="#qc-piece-cburnett-wN"
			x="100"
			y="30"
			width="48"
			height="48"
			opacity="0.5" />
		<text
			x="36"
			y="24"
			text-anchor="middle"
			font-size="12"
			fill="var(--color-text-maxcontrast)">50%</text>
		<text
			x="124"
			y="24"
			text-anchor="middle"
			font-size="12"
			fill="var(--color-text-maxcontrast)">50%</text>
	</svg>
</template>

<style scoped>
.qc-knight-illustration {
	display: block;
	width: 160px;
	height: 80px;
}
</style>
