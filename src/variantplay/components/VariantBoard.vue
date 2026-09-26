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
  Hill); an outline with `kind: 'threat'` is drawn in the danger colour on a light halo, with an arrowhead at its end
  (the threatened royal square), so the glyphs under it stay legible (the threat lines of the multiverse), and one
  with `kind: 'hill'` thinner, in a warm dark brown. A label with `strong: true` is bold and a little larger (the
  players' names of bughouse).

  The drawing fits the layout's rectangle plus whatever is drawn outside it (the coordinates), with a thin margin, so a
  board uses the width of a phone. Large layouts can be zoomed (buttons, Ctrl + wheel, a two-finger pinch) and panned
  (drag with a mouse or one finger). While zoomed in the board takes every touch gesture (`touch-action: none`); at
  zoom 1 the page still scrolls over it. A `layout.focus` ({ x, y, zoom, key, box }) zooms in on a point; the board
  recentres only when its key changes, or with "Recentre" (shown while the focus zooms in). `zoom` is the zoom for a
  fine pointer; with a `box` ({ w, h } in layout units) and without a `zoom` the board zooms to fit the box, and on a
  touch screen (coarse pointer) it zooms in to at least 28 px per unit. The zoom cap is 8, or more for wide layouts,
  up to 40 px per unit. Zoomed in, a board whose name is above the part shown gets its name pinned to the top edge of
  that part, so the boards in view are always named. Turning the board (Flip board) keeps the part shown in view.
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
				:disabled="zoom >= maxZoom"
				@click="setZoom(zoom * 1.5)">
				+
			</NcButton>
			<NcButton size="small" :disabled="zoom === 1" @click="setZoom(1)">
				{{ t('quantumchess', 'Whole board') }}
			</NcButton>
			<NcButton
				v-if="canRecentre"
				size="small"
				:disabled="atFocus"
				@click="applyFocus">
				{{ t('quantumchess', 'Recentre') }}
			</NcButton>
		</div>
		<svg
			ref="svgEl"
			class="qc-vboard qc-scope"
			:class="{ 'qc-vboard--panning': zoom > 1 }"
			:style="{ touchAction }"
			:data-board-theme="theme"
			:viewBox="viewBox"
			preserveAspectRatio="xMidYMid meet"
			role="group"
			:aria-label="label"
			@pointerdown="pointerDown"
			@pointermove="pointerMove"
			@pointerup="pointerUp"
			@pointercancel="pointerUp"
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
						:spin="pc.spin"
						:unit="unitSize" />
				</g>
			</g>
			<template v-for="(l, i) in outlines" :key="'o' + i">
				<line
					v-if="l.kind === 'threat'"
					:x1="l.x1"
					:y1="l.y1"
					:x2="l.head ? l.head.tip.x : l.x2"
					:y2="l.head ? l.head.tip.y : l.y2"
					class="qc-vboard__halo" />
				<line
					:x1="l.x1"
					:y1="l.y1"
					:x2="l.head ? l.head.x : l.x2"
					:y2="l.head ? l.head.y : l.y2"
					class="qc-vboard__outline"
					:class="l.kind === 'threat' || l.kind === 'hill' ? 'qc-vboard__outline--' + l.kind : null" />
				<polygon v-if="l.head" :points="l.head.points" class="qc-vboard__head" />
			</template>
			<text
				v-for="(l, i) in labels"
				:key="'t' + i"
				:x="l.x"
				:y="l.y"
				class="qc-vboard__label"
				:class="{ 'qc-vboard__label--strong': l.strong }"
				text-anchor="middle"
				dominant-baseline="central">{{ l.text }}</text>
			<text
				v-for="(p, i) in pins"
				:key="'p' + i"
				:x="p.x"
				:y="p.y"
				:font-size="p.font"
				class="qc-vboard__pin"
				text-anchor="start"
				dominant-baseline="central">{{ p.text }}</text>
		</svg>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
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
/** The margin around everything drawn, in layout units (a focus outline on an edge square stays visible). */
const MARGIN = 0.12

/** Large layouts (3D, 4D, the multiverse) can be zoomed and panned. */
const zoomable = computed(() => W.value * H.value > 200 || Boolean(topo.value.layout.zoomable))
/** The zoom cap of a layout that is not too wide for it. */
const MAX_ZOOM = 8
/** The most pixels per layout unit that the lifted zoom cap allows. */
const MAX_UNIT_PX = 40
/** The fewest pixels per layout unit on a touch screen when the focus has a box. */
const TOUCH_UNIT_PX = 28
const zoom = ref(1)
const centre = ref(null)
const svgEl = ref(null)
/** The size of the drawing on screen in CSS pixels (0 until it is measured). */
const screen = shallowRef({ w: 0, h: 0 })

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
	return { x1, y1, x2, y2, kind: l.kind ?? null }
}

/** The length of the arrowhead of a threat line, in layout units. */
const HEAD = 0.34
/** How far before the threatened square's centre the arrowhead ends, in layout units (clear of the glyph's middle). */
const HEAD_GAP = 0.22

/**
 * A threat line with its arrowhead: the shaft ends where the head begins, and the head's tip stops a little before the
 * end point (the threatened royal square), pointing at it. A line too short for a head keeps none.
 *
 * @param {object} l rotated line
 * @return {object}
 */
function withHead(l) {
	const dx = l.x2 - l.x1
	const dy = l.y2 - l.y1
	const len = Math.hypot(dx, dy)
	if (len < HEAD + HEAD_GAP + 0.1) {
		return l
	}
	const ux = dx / len
	const uy = dy / len
	const tip = { x: l.x2 - ux * HEAD_GAP, y: l.y2 - uy * HEAD_GAP }
	const base = { x: tip.x - ux * HEAD, y: tip.y - uy * HEAD }
	const half = HEAD * 0.55
	const points = [
		[tip.x, tip.y],
		[base.x - uy * half, base.y + ux * half],
		[base.x + uy * half, base.y - ux * half],
	].map((pt) => pt.map((v) => v.toFixed(3)).join(',')).join(' ')
	return { ...l, head: { x: base.x + ux * 0.02, y: base.y + uy * 0.02, tip, points } }
}

const lines = computed(() => (topo.value.layout.lines ?? []).map(rotLine))
const outlines = computed(() => (topo.value.layout.outlines ?? []).map((l) => {
	const r = rotLine(l)
	return r.kind === 'threat' ? withHead(r) : r
}))
const labels = computed(() => (topo.value.layout.labels ?? []).map((l) => {
	const [x, y] = rot(l.x, l.y)
	return { ...l, x, y, strong: Boolean(l.strong) }
}))

/**
 * The rectangle that shows the whole drawing (zoom 1): the layout's rectangle and everything drawn outside it (the
 * coordinates, board labels), plus a thin margin.
 */
const full = computed(() => {
	let x1 = 0
	let y1 = 0
	let x2 = turned.value ? H.value : W.value
	let y2 = turned.value ? W.value : H.value
	/**
	 * Grow the rectangle by a box.
	 *
	 * @param {number} a left
	 * @param {number} b top
	 * @param {number} c right
	 * @param {number} d bottom
	 */
	const grow = (a, b, c, d) => {
		x1 = Math.min(x1, a)
		y1 = Math.min(y1, b)
		x2 = Math.max(x2, c)
		y2 = Math.max(y2, d)
	}
	for (const c of cells.value) {
		const r = c.shape === 'rect' ? 0 : 0.04
		grow(c.cx - c.w / 2 - r, c.cy - c.h / 2 - r, c.cx + c.w / 2 + r, c.cy + c.h / 2 + r)
	}
	for (const b of boards.value) {
		grow(b.x - 0.06, b.y - (b.label ? 0.6 : 0.06), b.x + b.w + 0.06, b.y + b.h + 0.06)
	}
	for (const a of areas.value) {
		grow(a.x, a.y, a.x + a.w, a.y + a.h)
	}
	for (const l of [...lines.value, ...outlines.value]) {
		grow(Math.min(l.x1, l.x2), Math.min(l.y1, l.y2), Math.max(l.x1, l.x2), Math.max(l.y1, l.y2))
	}
	for (const l of labels.value) {
		const half = 0.08 + (l.strong ? 0.12 : 0.1) * String(l.text).length
		grow(l.x - half, l.y - (l.strong ? 0.22 : 0.2), l.x + half, l.y + (l.strong ? 0.22 : 0.2))
	}
	return { x: x1 - MARGIN, y: y1 - MARGIN, w: x2 - x1 + 2 * MARGIN, h: y2 - y1 + 2 * MARGIN }
})

/** CSS pixels per layout unit at zoom 1 (0 until the drawing is measured). */
const unitPx = computed(() => {
	const { w, h } = screen.value
	return w > 0 && h > 0 ? Math.min(w / full.value.w, h / full.value.h) : 0
})

/** The zoom cap: 8, or more for a layout so wide that zoom 8 gives fewer than 40 px per unit. */
const maxZoom = computed(() => (unitPx.value > 0 ? Math.max(MAX_ZOOM, MAX_UNIT_PX / unitPx.value) : MAX_ZOOM))

/** The size of one CSS pixel in layout units at the current zoom (0 while unknown). */
const unitSize = computed(() => (unitPx.value > 0 ? 1 / (unitPx.value * zoom.value) : 0))

/** The shown part of the drawing: `{ x, y, w, h }` in layout units. */
const shown = computed(() => {
	const f = full.value
	if (zoom.value <= 1) {
		return f
	}
	const w = f.w / zoom.value
	const h = f.h / zoom.value
	const c = centre.value ?? { x: f.x + f.w / 2, y: f.y + f.h / 2 }
	const x = Math.min(Math.max(c.x - w / 2, f.x), f.x + f.w - w)
	const y = Math.min(Math.max(c.y - h / 2, f.y), f.y + f.h - h)
	return { x, y, w, h }
})

const viewBox = computed(() => {
	const v = shown.value
	return [v.x, v.y, v.w, v.h].map((n) => Number(n.toFixed(4))).join(' ')
})

/** The font size of a pinned board name, in layout units (a board label's). */
const PIN_FONT = 0.36

/**
 * Zoomed in: the names of the boards in view whose own name is above the part shown (cut off or out of sight), pinned
 * to the top left corner of the board's visible part, as text on a light halo (no box, so it hides as little of the
 * pieces under it as it can). A board shows at least one unit of its width and two of its height (half of a small
 * board) to get one: a sliver of a board needs no name.
 */
const pins = computed(() => {
	if (zoom.value <= 1) {
		return []
	}
	const v = shown.value
	const out = []
	for (const b of boards.value) {
		const left = Math.max(b.x, v.x)
		const right = Math.min(b.x + b.w, v.x + v.w)
		const text = String(b.label ?? '')
		// the name is drawn at b.y - 0.22 (its baseline): its top is about 0.5 above the frame
		const tall = Math.min(2, b.h / 2)
		if (!text || b.y - 0.5 >= v.y || right - left < 1 || b.y + b.h < v.y + tall || b.y > v.y + v.h - tall) {
			continue
		}
		out.push({ text, x: left + 0.08, y: v.y + 0.26, font: PIN_FONT })
	}
	return out
})

/**
 * The browser's own touch gestures: none while zoomed in (the board pans and pinches), else the page may scroll over
 * the board (a zoomable board takes the pinch itself).
 */
const touchAction = computed(() => {
	if (zoom.value > 1) {
		return 'none'
	}
	return zoomable.value ? 'pan-x pan-y' : 'manipulation'
})

/**
 * Set the zoom factor (1 shows the whole board).
 *
 * @param {number} z zoom factor
 */
function setZoom(z) {
	zoom.value = Math.min(maxZoom.value, Math.max(1, z))
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

/**
 * Whether the main pointer is coarse (a touch screen).
 *
 * @return {boolean}
 */
function coarsePointer() {
	try {
		return Boolean(window.matchMedia?.('(pointer: coarse)').matches)
	} catch {
		return false
	}
}

/**
 * The zoom a focus asks for: its own `zoom` (a fine pointer), else the zoom that fits its `box`; with a box on a touch
 * screen at least 28 px per unit.
 *
 * @param {object} focus the layout's focus
 * @return {number}
 */
function focusZoom(focus) {
	const s1 = unitPx.value
	let z = focus.zoom ?? zoom.value
	if (focus.box && focus.zoom === undefined && s1 > 0) {
		const { w, h } = screen.value
		z = Math.min(w / focus.box.w, h / focus.box.h) / s1
	}
	if (focus.box && s1 > 0 && coarsePointer()) {
		z = Math.max(z, TOUCH_UNIT_PX / s1)
	}
	return z
}

/** Zoom in on the layout's focus, if it has one. */
function applyFocus() {
	const focus = topo.value.layout.focus
	if (focus && zoomable.value) {
		const [x, y] = rot(focus.x, focus.y)
		centre.value = { x, y }
		zoom.value = Math.min(maxZoom.value, Math.max(1, focusZoom(focus)))
	}
}

/** Whether "Recentre" is offered: the layout's focus zooms in (on a touch screen, or with its own zoom). */
const canRecentre = computed(() => {
	const focus = topo.value.layout.focus
	return Boolean(focus && zoomable.value && unitPx.value > 0 && focusZoom(focus) > 1.01)
})

/** Whether the view is where the focus puts it (then "Recentre" has nothing to do). */
const atFocus = computed(() => {
	const focus = topo.value.layout.focus
	if (!focus || !centre.value) {
		return false
	}
	const [x, y] = rot(focus.x, focus.y)
	const z = Math.min(maxZoom.value, Math.max(1, focusZoom(focus)))
	return Math.abs(centre.value.x - x) < 1e-6 && Math.abs(centre.value.y - y) < 1e-6 && Math.abs(zoom.value - z) < 1e-6
})

/** Measure the drawing on screen. */
function measure() {
	const r = svgEl.value?.getBoundingClientRect()
	if (r && (r.width !== screen.value.w || r.height !== screen.value.h)) {
		screen.value = { w: r.width, h: r.height }
	}
}

let observer = null
onMounted(() => {
	measure()
	if (typeof ResizeObserver === 'function' && svgEl.value) {
		observer = new ResizeObserver(measure)
		observer.observe(svgEl.value)
	}
	if (unitPx.value > 0) {
		applyFocus()
	}
})
onBeforeUnmount(() => observer?.disconnect())

/** The pointers down on the board: id → `{ x, y }` in client pixels. */
const pointers = new Map()
/** The gesture in progress: `{ kind: 'pan', id, x, y, c }`, `{ kind: 'pinch', d, z, anchor }` or null. */
let gesture = null
/** Whether the gesture moved the view: the click that ends it is not a move. */
let moved = false

/**
 * The layout point under a point of the screen, for a shown part of the drawing.
 *
 * @param {number} px client x
 * @param {number} py client y
 * @param {object} v the shown part `{ x, y, w, h }`
 * @return {{x: number, y: number}}
 */
function layoutPoint(px, py, v) {
	const r = svgEl.value.getBoundingClientRect()
	const s = Math.min(r.width / v.w, r.height / v.h)
	return {
		x: v.x + (px - r.left - (r.width - v.w * s) / 2) / s,
		y: v.y + (py - r.top - (r.height - v.h * s) / 2) / s,
	}
}

/**
 * The midpoint and distance of the first two pointers.
 *
 * @return {{x: number, y: number, d: number}}
 */
function pinchPoints() {
	const [a, b] = [...pointers.values()]
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }
}

/**
 * Start a one-pointer pan of a zoomed board.
 *
 * @param {number} id pointer id
 */
function startPan(id) {
	const p = pointers.get(id)
	// from the centre of what is shown (a centre beyond the edge is clamped there), so the drag moves at once
	const v = shown.value
	const c = { x: v.x + v.w / 2, y: v.y + v.h / 2 }
	gesture = zoom.value > 1 && p ? { kind: 'pan', id, x: p.x, y: p.y, c } : null
}

/**
 * Capture a pointer, so that a drag goes on outside the board (a mouse) and no square takes the gesture.
 *
 * @param {number} id pointer id
 */
function capture(id) {
	try {
		svgEl.value?.setPointerCapture?.(id)
	} catch {
		// the pointer is already gone
	}
}

/**
 * A pointer goes down: one pointer pans a zoomed board, a second one starts a pinch.
 *
 * @param {PointerEvent} e event
 */
function pointerDown(e) {
	if (!zoomable.value || !svgEl.value || (e.pointerType === 'mouse' && e.button !== 0)) {
		return
	}
	if (e.isPrimary) {
		// a new gesture: forget pointers whose end the board never saw
		pointers.clear()
		moved = false
	}
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
	if (pointers.size === 1) {
		startPan(e.pointerId)
	} else if (pointers.size === 2) {
		const m = pinchPoints()
		gesture = { kind: 'pinch', d: m.d, z: zoom.value, anchor: layoutPoint(m.x, m.y, shown.value) }
		moved = true
		for (const id of pointers.keys()) {
			capture(id)
		}
	}
}

/**
 * A pointer moves: pan the board (after 5 px), or pinch it around the midpoint of the two fingers.
 *
 * @param {PointerEvent} e event
 */
function pointerMove(e) {
	const p = pointers.get(e.pointerId)
	if (!p || !gesture) {
		return
	}
	// a mouse whose button was let go outside the board (before the drag captured it): the gesture is over
	if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
		pointers.delete(e.pointerId)
		if (!pointers.size) {
			gesture = null
		}
		return
	}
	p.x = e.clientX
	p.y = e.clientY
	if (gesture.kind === 'pinch') {
		pinch()
		return
	}
	if (gesture.id !== e.pointerId) {
		return
	}
	const dx = p.x - gesture.x
	const dy = p.y - gesture.y
	if (!moved && Math.abs(dx) + Math.abs(dy) > 5) {
		moved = true
		capture(e.pointerId)
	}
	if (moved) {
		const r = svgEl.value.getBoundingClientRect()
		const v = shown.value
		const scale = 1 / Math.max(1e-6, Math.min(r.width / v.w, r.height / v.h))
		centre.value = { x: gesture.c.x - dx * scale, y: gesture.c.y - dy * scale }
	}
}

/** Zoom by the change of the fingers' distance, keeping the layout point under their midpoint. */
function pinch() {
	const m = pinchPoints()
	setZoom(gesture.z * (m.d / gesture.d))
	if (zoom.value <= 1) {
		return
	}
	const f = full.value
	const w = f.w / zoom.value
	const h = f.h / zoom.value
	// the shown part of that size whose point under the midpoint is the anchor
	const at = layoutPoint(m.x, m.y, { x: 0, y: 0, w, h })
	centre.value = { x: gesture.anchor.x - at.x + w / 2, y: gesture.anchor.y - at.y + h / 2 }
}

/**
 * A pointer goes up or is cancelled: a pinch left with one finger goes on as a pan.
 *
 * @param {PointerEvent} e event
 */
function pointerUp(e) {
	if (!pointers.delete(e.pointerId)) {
		return
	}
	if (pointers.size === 1 && gesture?.kind === 'pinch') {
		startPan([...pointers.keys()][0])
	} else if (!pointers.size) {
		gesture = null
	}
}

/**
 * A click that ends a pan or a pinch is not a move.
 *
 * @param {MouseEvent} e event
 */
function swallowClickAfterPan(e) {
	if (moved) {
		e.stopPropagation()
		moved = false
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
 * Rotate a layout point by the board's rotation.
 *
 * @param {number} x x
 * @param {number} y y
 * @return {[number, number]}
 */
function rot(x, y) {
	return rotBy(props.rotation, x, y)
}

/**
 * Rotate a layout point by a rotation.
 *
 * @param {number} rotation 0, 90, 180 or 270
 * @param {number} x x
 * @param {number} y y
 * @return {[number, number]}
 */
function rotBy(rotation, x, y) {
	switch (rotation) {
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
 * The layout point of a drawn point under a rotation (the inverse of `rotBy`).
 *
 * @param {number} rotation 0, 90, 180 or 270
 * @param {number} x drawn x
 * @param {number} y drawn y
 * @return {[number, number]}
 */
function unrotBy(rotation, x, y) {
	switch (rotation) {
		case 180:
			return [W.value - x, H.value - y]
		case 90:
			return [y, H.value - x]
		case 270:
			return [W.value - y, x]
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

// the layout may ask to start zoomed in on a point (the present of the multiverse, the home boards of 4D chess): at
// once, again once the drawing is measured (on mount), and then only when the focus really changes
watch(() => focusKey(topo.value.layout.focus), applyFocus, { immediate: true })

// the centre of a zoomed view is kept in drawn coordinates: when the board turns, it turns with it, so the same part
// of the game stays in view
watch(() => props.rotation, (now, before) => {
	if (centre.value) {
		const [x, y] = unrotBy(before, centre.value.x, centre.value.y)
		const [cx, cy] = rotBy(now, x, y)
		centre.value = { x: cx, y: cy }
	}
})

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
	// the screen's height less the page around the board (the view sets the reserve), never below 280 px (a phone
	// held sideways scrolls instead)
	max-height: max(280px, calc(100vh - var(--qc-vboard-reserve, 150px)));
	user-select: none;
}

// the height the browser shows now (a phone's address bar takes some of 100vh)
@supports (height: 100dvh) {
	.qc-vboard {
		max-height: max(280px, calc(100dvh - var(--qc-vboard-reserve, 150px)));
	}
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

// the hill is green terrain: yellow belongs to the last move
.qc-vboard__cell--hill .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 50%, #8cc47a);
}

.qc-vboard__cell--hilldark .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-dark) 55%, #4f9a45);
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

// fog is far darker than any visible square (every theme's dark square is at least 60 luminance points lighter), with
// only a faint checker left, and a clear hatch
.qc-vboard__cell--fog .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 18%, #36404b);
}

.qc-vboard__cell--fog.qc-vboard__cell--dark .qc-vboard__shape,
.qc-vboard__cell--fog.qc-vboard__cell--hilldark .qc-vboard__shape,
.qc-vboard__cell--fog.qc-vboard__cell--mid .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-dark) 18%, #2b333d);
}

.qc-vboard__cell--fog .qc-vboard__shape--point {
	fill: color-mix(in srgb, transparent 30%, #36404b);
}

.qc-vboard__hatch {
	pointer-events: none;
}

.qc-vboard__hatch-line {
	stroke: #ffffff;
	stroke-opacity: 0.3;
	stroke-width: 0.045;
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

// the hill of King of the Hill: a thin warm border that does not outweigh the board
.qc-vboard__outline--hill {
	stroke: #6b4f2c;
	stroke-width: 0.03;
}

[data-board-theme='contrast'] .qc-vboard__outline--hill {
	stroke: #000000;
	stroke-width: 0.05;
}

// a threat (the multiverse's 5D check): the danger colour on a light halo, drawn above the cells, with an arrowhead
// at the threatened royal square
.qc-vboard__outline--threat,
[data-board-theme='contrast'] .qc-vboard__outline--threat {
	stroke: var(--qc-ring-danger, #d0263a);
	stroke-width: 0.07;
}

.qc-vboard__halo {
	stroke: #ffffff;
	stroke-opacity: 0.75;
	stroke-width: 0.17;
	stroke-linecap: round;
	pointer-events: none;
}

.qc-vboard__head {
	fill: var(--qc-ring-danger, #d0263a);
	stroke: #ffffff;
	stroke-opacity: 0.75;
	stroke-width: 0.04;
	stroke-linejoin: round;
	pointer-events: none;
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

.qc-vboard__board-label,
.qc-vboard__label--strong {
	font-size: 0.36px;
	font-weight: bold;
}

// a board's name pinned to the top of a zoomed view: dark text on a light halo, readable on any square or piece
.qc-vboard__pin {
	fill: #1b1b1b;
	stroke: #ffffff;
	stroke-opacity: 0.9;
	stroke-width: 0.09;
	stroke-linejoin: round;
	paint-order: stroke;
	font-weight: bold;
	pointer-events: none;
}
</style>
