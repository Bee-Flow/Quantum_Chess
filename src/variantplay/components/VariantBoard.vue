<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The board of every chess variant, drawn in SVG from the variant's layout: square cells, hexagons, the intersections of
  xiangqi, and several boards side by side or in a grid (3D, 4D, bughouse, the multiverse). Ghost parts are faded and
  show their percentage. Squares that the viewer cannot see (fog of war, Kriegspiel) are covered.
-->
<template>
	<svg
		class="qc-vboard qc-scope"
		:data-board-theme="theme"
		:viewBox="viewBox"
		preserveAspectRatio="xMidYMid meet"
		role="group"
		:aria-label="label">
		<defs>
			<filter
				v-for="tint in tints"
				:id="tint.id"
				:key="tint.id"
				color-interpolation-filters="sRGB">
				<feColorMatrix type="matrix" :values="tint.matrix" />
			</filter>
		</defs>
		<rect
			v-for="(a, i) in areas"
			:key="'a' + i"
			:x="a.x"
			:y="a.y"
			:width="a.w"
			:height="a.h"
			class="qc-vboard__area"
			:class="['qc-vboard__area--' + (a.shade ?? 'frame')]" />
		<g v-for="(b, i) in boards" :key="'b' + i">
			<rect
				:x="b.x - 0.06"
				:y="b.y - 0.06"
				:width="b.w + 0.12"
				:height="b.h + 0.12"
				class="qc-vboard__frame" />
			<text
				v-if="b.label"
				:x="b.x + b.w / 2"
				:y="b.y - 0.22"
				class="qc-vboard__board-label"
				text-anchor="middle">{{ b.label }}</text>
		</g>
		<line
			v-for="(l, i) in lines"
			:key="'l' + i"
			:x1="l.x1"
			:y1="l.y1"
			:x2="l.x2"
			:y2="l.y2"
			class="qc-vboard__line" />
		<g
			v-for="c in cells"
			:key="c.sq"
			class="qc-vboard__cell"
			:class="cellClasses(c)"
			role="button"
			:tabindex="focusable.has(c.sq) ? 0 : -1"
			:aria-label="cellLabel(c)"
			:data-square="c.name"
			@click="emit('square', c.sq)"
			@keydown.enter.prevent="emit('square', c.sq)"
			@keydown.space.prevent="emit('square', c.sq)">
			<rect
				v-if="c.shape === 'rect'"
				:x="c.cx - c.w / 2"
				:y="c.cy - c.h / 2"
				:width="c.w"
				:height="c.h"
				class="qc-vboard__shape" />
			<polygon v-else-if="c.shape === 'hex'" :points="hexPoints(c)" class="qc-vboard__shape" />
			<circle
				v-else
				:cx="c.cx"
				:cy="c.cy"
				:r="c.w * 0.45"
				class="qc-vboard__shape qc-vboard__shape--point" />
			<circle
				v-if="marks[c.sq]?.includes('target')"
				:cx="c.cx"
				:cy="c.cy"
				:r="c.size * (c.pieces.length ? 0.46 : 0.16)"
				:class="c.pieces.length ? 'qc-vboard__ring' : 'qc-vboard__dot'" />
			<g v-for="(pc, k) in c.pieces" :key="k" :transform="`translate(${c.cx + pc.dx}, ${c.cy + pc.dy})`">
				<VariantPiece
					:glyph="pc.glyph"
					:size="pc.size"
					:p="pc.p"
					:tintId="'qc-tint-' + uid + '-' + pc.side"
					:spin="pc.spin" />
			</g>
		</g>
		<text
			v-for="(l, i) in labels"
			:key="'t' + i"
			:x="l.x"
			:y="l.y"
			class="qc-vboard__label"
			text-anchor="middle"
			dominant-baseline="central">{{ l.text }}</text>
	</svg>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import VariantPiece from './VariantPiece.vue'
import { boardPrefs } from '../../board/boardPreferences.js'
import { isHighContrast, resolveBoardTheme } from '../../board/boardThemes.js'
import { boardView } from '../../variants/index.js'
import { glyphOf, sideFill, typeName } from '../glyphs.js'

const props = defineProps({
	/** The variant */
	variant: { type: Object, required: true },
	/** The game state */
	state: { type: Object, required: true },
	/** Rotation of the board in degrees: 0, 90, 180 or 270 */
	rotation: { type: Number, default: 0 },
	/** Marks per square: selected, target, last, part, pick, danger */
	marks: { type: Object, default: () => ({}) },
	/** Squares the viewer cannot see, or null */
	hidden: { type: Object, default: null },
	/** The side whose pieces are always visible (hidden-information variants), or null */
	viewer: { type: Number, default: null },
	/** Squares that take keyboard focus */
	focusable: { type: Object, default: () => new Set() },
	/** Accessible name of the board */
	label: { type: String, default: '' },
})

const emit = defineEmits(['square'])

const uid = 'vb' + Math.floor(Math.random() * 1e9).toString(36)

const theme = computed(() => resolveBoardTheme(boardPrefs.boardTheme, { highContrast: isHighContrast() }))
const topo = computed(() => props.variant.layoutOf ? props.variant.layoutOf(props.state) : props.variant.topology)
const W = computed(() => topo.value.layout.width)
const H = computed(() => topo.value.layout.height)
const turned = computed(() => props.rotation === 90 || props.rotation === 270)
const PAD = 0.7

const viewBox = computed(() => {
	const w = turned.value ? H.value : W.value
	const h = turned.value ? W.value : H.value
	return `${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`
})

/**
 * Rotate a layout point.
 *
 * @param {number} x x
 * @param {number} y y
 * @return {[number, number]}
 */
function rot(x, y) {
	switch (props.rotation) {
		case 180:
			return [W.value - x, H.value - y]
		case 90:
			return [H.value - y, x]
		case 270:
			return [y, W.value - x]
		default:
			return [x, y]
	}
}

/**
 * Rotate a rectangle given by its top-left corner and size.
 *
 * @param {object} r rectangle `{ x, y, w, h }`
 * @return {object}
 */
function rotRect(r) {
	const [cx, cy] = rot(r.x + r.w / 2, r.y + r.h / 2)
	const w = turned.value ? r.h : r.w
	const h = turned.value ? r.w : r.h
	return { ...r, x: cx - w / 2, y: cy - h / 2, w, h }
}

const tints = computed(() => props.variant.sides.map((s, i) => {
	const hex = sideFill(s).replace('#', '')
	const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
	return {
		id: 'qc-tint-' + uid + '-' + i,
		matrix: `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`,
	}
}))

const view = computed(() => boardView(props.state, topo.value.size))

const cells = computed(() => {
	const V = props.variant
	return topo.value.cells.map((c) => {
		const centred = c.shape === 'rect'
		const [cx, cy] = rot(centred ? c.x + c.w / 2 : c.x, centred ? c.y + c.h / 2 : c.y)
		const w = turned.value ? c.h : c.w
		const h = turned.value ? c.w : c.h
		const size = Math.min(w, h) * (c.shape === 'hex' ? 0.84 : c.shape === 'point' ? 0.9 : 0.92)
		const hiddenHere = props.hidden?.has(c.sq) ?? false
		const occupants = view.value[c.sq].filter((o) => !hiddenHere || o.side === props.viewer)
		const shown = occupants.slice(0, 2)
		const pieces = shown.map((o, k) => {
			const small = shown.length > 1
			const sideAngle = V.sides[o.side].rotate ?? (o.side === 0 ? 0 : 180)
			return {
				glyph: glyphOf(V, o.type, o.side),
				side: o.side,
				p: o.p,
				size: small ? size * 0.62 : size,
				dx: small ? (k === 0 ? -size * 0.2 : size * 0.2) : 0,
				dy: small ? (k === 0 ? -size * 0.2 : size * 0.2) : 0,
				spin: (sideAngle + props.rotation) % 360,
				name: typeName(V, o.type),
			}
		})
		return { ...c, cx, cy, w, h, size, pieces, hidden: hiddenHere, name: topo.value.names[c.sq] }
	})
})

const boards = computed(() => (topo.value.layout.boards ?? []).map(rotRect))
const areas = computed(() => (topo.value.layout.areas ?? []).map(rotRect))
const lines = computed(() => (topo.value.layout.lines ?? []).map((l) => {
	const [x1, y1] = rot(l.x1, l.y1)
	const [x2, y2] = rot(l.x2, l.y2)
	return { x1, y1, x2, y2 }
}))
const labels = computed(() => (topo.value.layout.labels ?? []).map((l) => {
	const [x, y] = rot(l.x, l.y)
	return { ...l, x, y }
}))

/**
 * The corner points of a hexagonal cell (flat-topped; pointy-topped when the board is turned a quarter).
 *
 * @param {object} c cell
 * @return {string}
 */
function hexPoints(c) {
	const R = c.w / 2
	const offset = turned.value ? 30 : 0
	const pts = []
	for (let i = 0; i < 6; i++) {
		const a = ((60 * i + offset) * Math.PI) / 180
		pts.push([(c.cx + R * Math.cos(a)).toFixed(3), (c.cy + R * Math.sin(a)).toFixed(3)].join(','))
	}
	return pts.join(' ')
}

/**
 * CSS classes of a cell.
 *
 * @param {object} c cell
 * @return {string[]}
 */
function cellClasses(c) {
	const out = ['qc-vboard__cell--' + (c.shade ?? 'light')]
	for (const m of props.marks[c.sq] ?? []) {
		out.push('qc-vboard__cell--' + m)
	}
	if (c.hidden) {
		out.push('qc-vboard__cell--fog')
	}
	return out
}

/**
 * The accessible name of a cell: its name and what may stand there.
 *
 * @param {object} c cell
 * @return {string}
 */
function cellLabel(c) {
	if (c.hidden && !c.pieces.length) {
		return t('quantumchess', '{square}: hidden', { square: c.name })
	}
	if (!c.pieces.length) {
		return c.name
	}
	const parts = c.pieces.map((pc) => (pc.p >= 0.995
		? pc.name
		: t('quantumchess', '{piece} ({percent} %)', { piece: pc.name, percent: Math.round(pc.p * 100) })))
	return c.name + ': ' + parts.join(', ')
}
</script>

<style lang="scss" scoped>
.qc-vboard {
	display: block;
	width: 100%;
	height: auto;
	max-height: calc(100vh - 150px);
	user-select: none;
	touch-action: manipulation;
}

.qc-vboard__cell {
	cursor: pointer;
	outline: none;

	&:focus-visible .qc-vboard__shape {
		stroke: var(--color-primary-element);
		stroke-width: 0.08;
	}
}

.qc-vboard__shape {
	fill: var(--qc-sq-light);
	stroke: var(--qc-square-border, transparent);
	stroke-width: 0.02;
}

.qc-vboard__cell--dark .qc-vboard__shape {
	fill: var(--qc-sq-dark);
}

.qc-vboard__cell--mid .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 50%, var(--qc-sq-dark));
}

.qc-vboard__cell--hill .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 45%, #e0b43a);
}

.qc-vboard__cell--hilldark .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-dark) 55%, #c7931a);
}

.qc-vboard__cell--camp .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 80%, #e8b04a);
}

.qc-vboard__cell--wood .qc-vboard__shape {
	fill: #eecb8c;
	stroke: #7a5a2a;
	stroke-width: 0.025;
}

.qc-vboard__shape--point {
	fill: transparent;
	stroke: none;
}

.qc-vboard__cell--selected .qc-vboard__shape,
.qc-vboard__cell--pick .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 40%, var(--color-primary-element));
}

.qc-vboard__cell--selected .qc-vboard__shape--point,
.qc-vboard__cell--pick .qc-vboard__shape--point {
	fill: color-mix(in srgb, transparent 55%, var(--color-primary-element));
}

.qc-vboard__cell--part .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 60%, var(--qc-quantum, #6b3fd4));
}

.qc-vboard__cell--last .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 55%, #f7cb4d);
}

.qc-vboard__cell--danger .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 45%, var(--qc-ring-danger, #d0263a));
}

.qc-vboard__cell--fog .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-dark) 45%, #4b4f58);
}

.qc-vboard__dot {
	fill: var(--qc-target);
	pointer-events: none;
}

.qc-vboard__ring {
	fill: none;
	stroke: var(--qc-target-rim);
	stroke-width: 0.07;
	pointer-events: none;
}

.qc-vboard__frame {
	fill: none;
	stroke: var(--qc-board-frame, rgb(0 0 0 / 0.2));
	stroke-width: 0.05;
}

.qc-vboard__area--frame {
	fill: var(--qc-sq-light);
}

.qc-vboard__area--wood {
	fill: #eecb8c;
}

.qc-vboard__area--river {
	fill: #cfe3ea;
}

.qc-vboard__line {
	stroke: #5d4222;
	stroke-width: 0.035;
}

.qc-vboard__label,
.qc-vboard__board-label {
	fill: var(--color-text-maxcontrast);
	font-size: 0.32px;
	pointer-events: none;
}

.qc-vboard__board-label {
	font-size: 0.36px;
	font-weight: bold;
}
</style>
