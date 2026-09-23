<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A small, light board (SPEC §14.6.2) for lobby cards, the possibilities panel, the rules page and the trainer path:
  one SVG, ghosts drawn with opacity only (no badges). Changing `state` animates solid pieces to their new squares.
-->
<template>
	<svg class="qc-mini-board qc-scope"
		:class="{ 'qc-mini-board--interactive': interactive }"
		:data-board-theme="theme"
		:width="size"
		:height="size"
		viewBox="0 0 8 8"
		:role="interactive ? 'group' : 'img'"
		:aria-label="ariaLabel"
		shape-rendering="crispEdges">
		<g class="qc-mini-board__squares">
			<rect v-for="cell in cells"
				:key="cell.square"
				:x="cell.col"
				:y="cell.row"
				width="1"
				height="1"
				:class="cell.light ? 'qc-mini-board__light' : 'qc-mini-board__dark'"
				:role="interactive ? 'button' : undefined"
				:tabindex="interactive ? 0 : undefined"
				:aria-label="interactive ? cell.label : undefined"
				@click="interactive && emit('square-click', cell.square)"
				@keydown.enter.prevent="interactive && emit('square-click', cell.square)"
				@keydown.space.prevent="interactive && emit('square-click', cell.square)" />
		</g>
		<g class="qc-mini-board__highlights" shape-rendering="geometricPrecision">
			<rect v-for="h in highlightCells"
				:key="'h' + h.square"
				:x="h.col + 0.06"
				:y="h.row + 0.06"
				width="0.88"
				height="0.88"
				rx="0.08"
				class="qc-mini-board__highlight"
				:class="'qc-mini-board__highlight--' + h.kind" />
		</g>
		<g class="qc-mini-board__pieces" shape-rendering="geometricPrecision">
			<use v-for="p in pieceList"
				:key="p.key"
				class="qc-mini-board__piece"
				:href="'#' + p.symbol"
				x="0"
				y="0"
				width="1"
				height="1"
				:style="{ transform: `translate(${p.col}px, ${p.row}px)`, opacity: p.opacity }" />
		</g>
		<g v-if="arrowList.length > 0" class="qc-mini-board__arrows" shape-rendering="geometricPrecision">
			<g v-for="(a, i) in arrowList" :key="'a' + i" :class="'qc-mini-board__arrow--' + a.kind">
				<line :x1="a.x1"
					:y1="a.y1"
					:x2="a.x2"
					:y2="a.y2"
					:stroke-dasharray="a.dashed ? '0.18 0.14' : undefined" />
				<polygon :points="a.head" />
			</g>
		</g>
	</svg>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, toRaw } from 'vue'
import { squareName, squareView } from '../../engine/index.js'
import { boardPrefs } from './boardPreferences.js'
import { ghostOpacity, isLightSquare, squareCentre, squareXY } from './geometry.js'
import { pieceSymbolId } from './pieceSprite.js'
import './styles.js'

const props = defineProps({
	/** Engine state (or use `pieces`) */
	state: { type: Object, default: null },
	/** GameSummary.preview format: [[square, letter, pct]] (upper case = White) */
	pieces: { type: Array, default: null },
	/** Size in px */
	size: { type: Number, default: 120 },
	/** 'w' or 'b' at the bottom */
	orientation: { type: String, default: 'w' },
	/** Squares to outline: numbers, or {square, kind} with kind hint | lesson | danger | diff */
	highlights: { type: Array, default: () => [] },
	/** Arrows: [{from, to, kind, dashed?}] */
	arrows: { type: Array, default: () => [] },
	/** Squares are buttons (emits square-click) */
	interactive: { type: Boolean, default: false },
	/** Board theme; default: the preference */
	boardTheme: { type: String, default: null },
	/** Piece set; default: the preference */
	pieceSet: { type: String, default: null },
	/** Accessible label */
	label: { type: String, default: null },
})

const emit = defineEmits(['square-click'])

const theme = computed(() => props.boardTheme ?? boardPrefs.boardTheme)
const set = computed(() => props.pieceSet ?? boardPrefs.pieceSet)
const ariaLabel = computed(() => props.label ?? t('quantumchess', 'Board preview'))

const cells = computed(() => {
	const out = []
	for (let square = 0; square < 64; square++) {
		const { col, row } = squareXY(square, props.orientation)
		out.push({ square, col, row, light: isLightSquare(square), label: squareName(square) })
	}
	return out
})

const pieceList = computed(() => {
	const out = []
	if (props.state) {
		const view = squareView(toRaw(props.state))
		const count = new Map()
		for (const v of view) {
			if (v !== null) {
				count.set(v.piece, (count.get(v.piece) ?? 0) + 1)
			}
		}
		view.forEach((v, square) => {
			if (v === null) {
				return
			}
			const { col, row } = squareXY(square, props.orientation)
			out.push({
				key: count.get(v.piece) > 1 ? v.piece + '@' + square : String(v.piece),
				col,
				row,
				opacity: ghostOpacity(v.probability),
				symbol: pieceSymbolId(set.value, v.color, v.type),
			})
		})
	} else if (props.pieces) {
		for (const [square, letter, pct] of props.pieces) {
			const { col, row } = squareXY(square, props.orientation)
			const color = letter === letter.toUpperCase() ? 'w' : 'b'
			out.push({
				key: square + letter,
				col,
				row,
				opacity: ghostOpacity(pct / 100),
				symbol: pieceSymbolId(set.value, color, letter.toLowerCase()),
			})
		}
	}
	return out
})

const highlightCells = computed(() => props.highlights.map((h) => {
	const square = typeof h === 'number' ? h : h.square
	const { col, row } = squareXY(square, props.orientation)
	return { square, col, row, kind: typeof h === 'number' ? 'diff' : (h.kind ?? 'hint') }
}))

const arrowList = computed(() => props.arrows.map((a) => {
	const from = squareCentre(Array.isArray(a.from) ? a.from[0] : a.from, props.orientation)
	const to = squareCentre(a.to, props.orientation)
	const dx = to.x - from.x
	const dy = to.y - from.y
	const len = Math.hypot(dx, dy) || 1
	const ux = dx / len
	const uy = dy / len
	const tipX = to.x - ux * 0.18
	const tipY = to.y - uy * 0.18
	const baseX = tipX - ux * 0.34
	const baseY = tipY - uy * 0.34
	const w = 0.2
	return {
		kind: a.kind ?? 'hint',
		dashed: Boolean(a.dashed),
		x1: from.x + ux * 0.2,
		y1: from.y + uy * 0.2,
		x2: baseX,
		y2: baseY,
		head: `${tipX},${tipY} ${baseX - uy * w},${baseY + ux * w} ${baseX + uy * w},${baseY - ux * w}`,
	}
}))
</script>

<style lang="scss" scoped>
.qc-mini-board {
	display: block;
	border-radius: var(--border-radius-small, 4px);
	overflow: hidden;
	box-shadow: 0 0 0 1px var(--qc-board-frame);
	flex: none;
}

.qc-mini-board__light {
	fill: var(--qc-sq-light);
}

.qc-mini-board__dark {
	fill: var(--qc-sq-dark);
}

.qc-mini-board--interactive rect[role='button'] {
	cursor: pointer;

	&:focus-visible {
		outline: none;
		stroke: var(--color-main-text);
		stroke-width: 0.08;
	}
}

.qc-mini-board__piece {
	transition: transform 300ms var(--qc-ease-out, ease), opacity 250ms ease;
	pointer-events: none;
}

.qc-mini-board__highlight {
	fill: none;
	stroke-width: 0.1;
	pointer-events: none;

	&--diff {
		stroke: var(--qc-board-ring);
		stroke-dasharray: 0.2 0.12;
	}

	&--hint,
	&--lesson {
		stroke: var(--color-primary-element);
	}

	&--danger {
		stroke: var(--qc-ring-danger, #d0263a);
	}
}

.qc-mini-board__arrows {
	pointer-events: none;

	line {
		stroke-width: 0.16;
		stroke-linecap: round;
		stroke: currentColor;
	}

	polygon {
		fill: currentColor;
	}

	g {
		color: var(--color-primary-element);
		opacity: 0.85;
	}

	.qc-mini-board__arrow--threat,
	.qc-mini-board__arrow--forced {
		color: var(--qc-ring-danger, #d0263a);
	}

	.qc-mini-board__arrow--reveal {
		color: var(--qc-board-ring);
	}

	.qc-mini-board__arrow--best {
		color: #2e7d32;
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-mini-board__piece {
		transition: none;
	}
}
</style>
