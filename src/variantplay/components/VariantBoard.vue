<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The board of every chess variant, drawn in SVG from the variant's layout: square cells, hexagons, the intersections of
  xiangqi, and several boards side by side or in a grid (3D, 4D, bughouse, the multiverse). Ghost parts are faded and
  show their percentage. Squares that the viewer cannot see are covered by fog (darker, hatched, keeping their light or
  dark shade), or, with the variant's `hiddenStyle: 'plain'` (Kriegspiel), look like ordinary empty squares. Such a
  square never names what stands there (only the viewer's own pieces) and takes keyboard focus only as a move target.
  `layout.lines` are drawn under the cells (the xiangqi grid), `layout.outlines` above them (the hill of King of the
  Hill). A `layout.focus` ({ x, y, zoom, key }) zooms in on a point; the board recentres only when its key changes.
-->
<template>
	<div class="qc-vboard-wrap">
		<div v-if="zoomable" class="qc-vboard__zoom">
			<NcButton
				size="small"
				:aria-label="t('quantumchess', 'Zoom out')"
				:disabled="zoom <= 1"
				@click="setZoom(zoom / 1.5)">
				−
			</NcButton>
			<NcButton
				size="small"
				:aria-label="t('quantumchess', 'Zoom in')"
				:disabled="zoom >= MAX_ZOOM"
				@click="setZoom(zoom * 1.5)">
				+
			</NcButton>
			<NcButton size="small" :disabled="zoom === 1" @click="setZoom(1)">
				{{ t('quantumchess', 'Whole board') }}
			</NcButton>
		</div>
		<svg
			ref="svgEl"
			class="qc-vboard qc-scope"
			:class="{ 'qc-vboard--panning': zoom > 1 }"
			:data-board-theme="theme"
			:viewBox="viewBox"
			preserveAspectRatio="xMidYMid meet"
			role="group"
			:aria-label="label"
			@pointerdown="panStart"
			@pointermove="panMove"
			@pointerup="panEnd"
			@pointercancel="panEnd"
			@click.capture="swallowClickAfterPan"
			@wheel="wheel">
			<defs>
				<filter
					v-for="tint in tints"
					:id="tint.id"
					:key="tint.id"
					color-interpolation-filters="sRGB">
					<feColorMatrix type="matrix" :values="tint.matrix" />
				</filter>
				<pattern
					:id="hatchId"
					patternUnits="userSpaceOnUse"
					width="0.18"
					height="0.18"
					patternTransform="rotate(45)">
					<line
						x1="0"
						y1="0"
						x2="0"
						y2="0.18"
						class="qc-vboard__hatch-line" />
				</pattern>
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
				:tabindex="tabIndex(c)"
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
				<template v-if="c.fog">
					<rect
						v-if="c.shape === 'rect'"
						:x="c.cx - c.w / 2"
						:y="c.cy - c.h / 2"
						:width="c.w"
						:height="c.h"
						:fill="`url(#${hatchId})`"
						class="qc-vboard__hatch" />
					<polygon
						v-else-if="c.shape === 'hex'"
						:points="hexPoints(c)"
						:fill="`url(#${hatchId})`"
						class="qc-vboard__hatch" />
					<circle
						v-else
						:cx="c.cx"
						:cy="c.cy"
						:r="c.w * 0.45"
						:fill="`url(#${hatchId})`"
						class="qc-vboard__hatch" />
				</template>
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
			<line
				v-for="(l, i) in outlines"
				:key="'o' + i"
				:x1="l.x1"
				:y1="l.y1"
				:x2="l.x2"
				:y2="l.y2"
				class="qc-vboard__outline" />
			<text
				v-for="(l, i) in labels"
				:key="'t' + i"
				:x="l.x"
				:y="l.y"
				class="qc-vboard__label"
				text-anchor="middle"
				dominant-baseline="central">{{ l.text }}</text>
		</svg>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import VariantPiece from './VariantPiece.vue'
import { boardPrefs } from '../../board/boardPreferences.js'
import { isHighContrast, resolveBoardTheme } from '../../board/boardThemes.js'
import { boardView } from '../../variants/index.js'
import { glyphOf, pieceSpin, sideFill, typeName } from '../glyphs.js'

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
const hatchId = 'qc-hatch-' + uid

const theme = computed(() => resolveBoardTheme(boardPrefs.boardTheme, { highContrast: isHighContrast() }))
const topo = computed(() => props.variant.layoutOf ? props.variant.layoutOf(props.state) : props.variant.topology)
const W = computed(() => topo.value.layout.width)
const H = computed(() => topo.value.layout.height)
const turned = computed(() => props.rotation === 90 || props.rotation === 270)
const PAD = 0.7

/** Large layouts (3D, 4D, the multiverse) can be zoomed and panned. */
const zoomable = computed(() => W.value * H.value > 200 || Boolean(topo.value.layout.zoomable))
const MAX_ZOOM = 8
const zoom = ref(1)
const centre = ref(null)
const svgEl = ref(null)

const full = computed(() => {
	const w = turned.value ? H.value : W.value
	const h = turned.value ? W.value : H.value
	return { x: -PAD, y: -PAD, w: w + 2 * PAD, h: h + 2 * PAD }
})

const viewBox = computed(() => {
	const f = full.value
	if (zoom.value <= 1) {
		return `${f.x} ${f.y} ${f.w} ${f.h}`
	}
	const w = f.w / zoom.value
	const h = f.h / zoom.value
	const c = centre.value ?? { x: f.x + f.w / 2, y: f.y + f.h / 2 }
	const x = Math.min(Math.max(c.x - w / 2, f.x), f.x + f.w - w)
	const y = Math.min(Math.max(c.y - h / 2, f.y), f.y + f.h - h)
	return `${x} ${y} ${w} ${h}`
})

/**
 * Set the zoom factor (1 shows the whole board).
 *
 * @param {number} z zoom factor
 */
function setZoom(z) {
	zoom.value = Math.min(MAX_ZOOM, Math.max(1, z))
	if (zoom.value === 1) {
		centre.value = null
	}
}

/**
 * The identity of a focus: its `key` when it has one, else its point and zoom. A layout may return a new but equal
 * focus object on every state (the multiverse does), which must not undo the player's own zoom and pan.
 *
 * @param {object|null|undefined} focus the layout's focus
 * @return {string|null}
 */
function focusKey(focus) {
	return focus ? (focus.key ?? JSON.stringify([focus.x, focus.y, focus.zoom])) : null
}

// the layout may ask to start zoomed in on a point (the present of the multiverse, the home boards of 4D chess): at
// once, and again only when the focus really changes
watch(() => focusKey(topo.value.layout.focus), () => {
	const focus = topo.value.layout.focus
	if (focus && zoomable.value) {
		const [x, y] = rot(focus.x, focus.y)
		centre.value = { x, y }
		zoom.value = Math.min(MAX_ZOOM, Math.max(1, focus.zoom ?? zoom.value))
	}
}, { immediate: true })

let pan = null
let panned = false

/**
 * Start panning a zoomed board.
 *
 * @param {PointerEvent} e event
 */
function panStart(e) {
	panned = false
	if (zoom.value <= 1 || !svgEl.value) {
		return
	}
	const f = full.value
	pan = {
		x: e.clientX,
		y: e.clientY,
		c: centre.value ?? { x: f.x + f.w / 2, y: f.y + f.h / 2 },
		scale: (f.w / zoom.value) / svgEl.value.getBoundingClientRect().width,
	}
}

/**
 * Pan while the pointer moves.
 *
 * @param {PointerEvent} e event
 */
function panMove(e) {
	if (!pan) {
		return
	}
	const dx = e.clientX - pan.x
	const dy = e.clientY - pan.y
	if (Math.abs(dx) + Math.abs(dy) > 5) {
		panned = true
	}
	if (panned) {
		centre.value = { x: pan.c.x - dx * pan.scale, y: pan.c.y - dy * pan.scale }
	}
}

/** Stop panning. */
function panEnd() {
	pan = null
}

/**
 * A click that ends a pan is not a move.
 *
 * @param {MouseEvent} e event
 */
function swallowClickAfterPan(e) {
	if (panned) {
		e.stopPropagation()
		panned = false
	}
}

/**
 * Ctrl + wheel zooms.
 *
 * @param {WheelEvent} e event
 */
function wheel(e) {
	if (!zoomable.value || !e.ctrlKey) {
		return
	}
	e.preventDefault()
	setZoom(e.deltaY < 0 ? zoom.value * 1.25 : zoom.value / 1.25)
}

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

/** Hidden squares look like ordinary squares (`hiddenStyle: 'plain'`) instead of fog. */
const plain = computed(() => props.variant.hiddenStyle === 'plain')

const cells = computed(() => {
	const V = props.variant
	return topo.value.cells.map((c) => {
		const centred = c.shape === 'rect'
		const [cx, cy] = rot(centred ? c.x + c.w / 2 : c.x, centred ? c.y + c.h / 2 : c.y)
		const w = turned.value ? c.h : c.w
		const h = turned.value ? c.w : c.h
		const size = Math.min(w, h) * (c.shape === 'hex' ? 0.84 : c.shape === 'point' ? 0.9 : 0.92)
		const hiddenHere = props.hidden?.has(c.sq) ?? false
		const occupants = (view.value[c.sq] ?? []).filter((o) => !hiddenHere || o.side === props.viewer)
		const shown = occupants.slice(0, 2)
		const pieces = shown.map((o, k) => {
			const small = shown.length > 1
			return {
				glyph: glyphOf(V, o.type, o.side),
				side: o.side,
				p: o.p,
				size: small ? size * 0.62 : size,
				dx: small ? (k === 0 ? -size * 0.2 : size * 0.2) : 0,
				dy: small ? (k === 0 ? -size * 0.2 : size * 0.2) : 0,
				spin: pieceSpin(V, o.side, props.rotation),
				name: typeName(V, o.type),
			}
		})
		const fog = hiddenHere && !plain.value
		return { ...c, cx, cy, w, h, size, pieces, hidden: hiddenHere, fog, name: topo.value.names[c.sq] }
	})
})

const boards = computed(() => (topo.value.layout.boards ?? []).map(rotRect))
const areas = computed(() => (topo.value.layout.areas ?? []).map(rotRect))
/**
 * Rotate a line segment.
 *
 * @param {object} l segment `{ x1, y1, x2, y2 }`
 * @return {object}
 */
function rotLine(l) {
	const [x1, y1] = rot(l.x1, l.y1)
	const [x2, y2] = rot(l.x2, l.y2)
	return { x1, y1, x2, y2 }
}

const lines = computed(() => (topo.value.layout.lines ?? []).map(rotLine))
const outlines = computed(() => (topo.value.layout.outlines ?? []).map(rotLine))
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
	if (c.fog) {
		out.push('qc-vboard__cell--fog')
	}
	return out
}

/**
 * The tab index of a cell: 0 for a square the keyboard may reach (`focusable`), -1 otherwise. A square the viewer
 * cannot see is reachable only as a marked move target, never as a square where a piece is picked up, so the tab order
 * never tells where a hidden piece stands.
 *
 * @param {object} c cell
 * @return {number}
 */
function tabIndex(c) {
	return props.focusable.has(c.sq) && (!c.hidden || props.marks[c.sq]?.includes('target')) ? 0 : -1
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
.qc-vboard-wrap {
	position: relative;
}

.qc-vboard__zoom {
	display: flex;
	justify-content: flex-end;
	gap: 4px;
	margin-bottom: 4px;
}

.qc-vboard--panning {
	cursor: grab;
}

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
	fill: color-mix(in srgb, var(--qc-sq-light) 40%, #5b6472);
}

.qc-vboard__cell--fog.qc-vboard__cell--dark .qc-vboard__shape,
.qc-vboard__cell--fog.qc-vboard__cell--hilldark .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-dark) 40%, #5b6472);
}

.qc-vboard__cell--fog .qc-vboard__shape--point {
	fill: color-mix(in srgb, transparent 40%, #5b6472);
}

.qc-vboard__hatch {
	pointer-events: none;
}

.qc-vboard__hatch-line {
	stroke: #ffffff;
	stroke-opacity: 0.2;
	stroke-width: 0.05;
}

// near-black: at least 5 : 1 against the light and dark squares of every board theme
.qc-vboard__outline {
	stroke: #1b1b1b;
	stroke-width: 0.05;
	stroke-linecap: round;
	pointer-events: none;
}

[data-board-theme='contrast'] .qc-vboard__outline {
	stroke: #000000;
	stroke-width: 0.07;
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
