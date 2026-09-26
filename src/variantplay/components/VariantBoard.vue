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
  `layout.lines` are drawn under the cells (the xiangqi grid; a line may carry its `color`), `layout.outlines` above
  them (the hill of King of the Hill); an outline with `kind: 'threat'` is drawn in the danger colour on a light halo,
  with an arrowhead that stops before its end (the threatened royal square), and its start a little after the
  attacker's centre, so the glyphs under it stay legible (the threat lines of the multiverse); `kind: 'travel'` is a
  blue, half-transparent arrow on a white casing, bowed through the control point (`cx`, `cy`) when it has one, both
  ends kept clear of the pieces; `kind: 'next'` a dashed grey outline (a placeholder); `kind: 'hill'` thinner, in a
  warm dark brown. A label with `strong: true` is bold and a little larger (the players' names of bughouse), and a
  zoomed view moves it inwards when it would be cut at its edge. A label with `fit` (the width it has, in layout units)
  keeps at least 11 px on screen as far as that width allows; a label's `kind` gives it a class of its own (`river`:
  the inscription of the xiangqi river). The last move marks an empty point (xiangqi) with a ring. A board's label is
  drawn on a light chip above the outlines; on a board that fills the screen (`fill`) it keeps 11 to 15 px on screen
  and is left out when it no longer fits over its board (a whole view of many small boards). A board with
  `frame: 'light'` or `'dark'` gets a band of that colour (whose move it is on that board in the multiverse), and one
  with `lift` has its label that much higher (above a halo). `layout.caption` is a line of text above the drawing (the
  multiverse's header). Area shades: `frame`, `wood`, `river`, and the multiverse's halos `must` (gold) and `optional`
  (blue) and the hatched band of an `inactive` timeline.

  The drawing fits the layout's rectangle plus whatever is drawn outside it (the coordinates), with a thin margin, so a
  board uses the width of a phone. With `layout.fill` the board takes the height of the screen (less the page around
  it) instead of the drawing's aspect ratio, and a zoomed view uses all of it. Large layouts can be zoomed (buttons,
  Ctrl + wheel, a two-finger pinch) and panned (drag with a mouse or one finger). While zoomed in the board takes every
  touch gesture (`touch-action: none`); at zoom 1 the page still scrolls over it. A `layout.focus` ({ x, y, zoom, key,
  box, alt, minPx, fineMinPx, maxPx, stops }) zooms in on a point; the board recentres only when its key changes, or
  with "Recentre" (shown while the focus zooms in), and while `hold` is true (the computer plays) it waits until it is
  false again. `zoom` is the zoom for a fine pointer; with a `box` ({ w, h } in layout units) and without a `zoom` the
  board zooms to fit the box, falling back to the smaller frame `alt` ({ x, y, box }) when the box would give fewer
  than `minPx` pixels per unit (with a mouse `fineMinPx` when the focus has it); on a touch screen it zooms in to at
  least `minPx` (default 28) px per unit, with a mouse (when the focus has `minPx`) to at least 24, and to at most
  `maxPx`, starting at the top left of the frame when it does not fit. `stops` (points) add "previous / next board"
  buttons after the caption that move the view from one to the next. The zoom cap is 8, or more for wide layouts, up
  to 40 px per unit. Zoomed in, every board says its `pin` (its full name) when it has one, over the part of it in
  view; a board whose label's top is above the part shown gets its name pinned to the top edge of that part, on a
  chip, and its own label is left out, so the boards in view are always named once; move targets outside the view are
  counted at the edge they lie beyond ("← 2"), and a tap there pans to the nearest. Turning the board (Flip board)
  keeps the part shown in view.
-->
<template>
	<div class="qc-vboard-wrap">
		<div v-if="caption || stops.length > 1" class="qc-vboard__top">
			<p class="qc-vboard__caption">
				{{ caption }}
			</p>
			<NcButton
				v-if="stops.length > 1"
				size="small"
				:aria-label="t('quantumchess', 'Previous board to play')"
				:title="t('quantumchess', 'Previous board to play')"
				@click="goStop(-1)">
				‹
			</NcButton>
			<NcButton
				v-if="stops.length > 1"
				size="small"
				:aria-label="t('quantumchess', 'Next board to play')"
				:title="t('quantumchess', 'Next board to play')"
				@click="goStop(1)">
				›
			</NcButton>
		</div>
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
			:class="{ 'qc-vboard--zoomable': zoomable, 'qc-vboard--fill': fill }"
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
				<pattern
					:id="stripeId"
					patternUnits="userSpaceOnUse"
					width="0.5"
					height="0.5"
					patternTransform="rotate(45)">
					<rect width="0.5" height="0.5" class="qc-vboard__stripe-ground" />
					<line
						x1="0"
						y1="0"
						x2="0"
						y2="0.5"
						class="qc-vboard__stripe-line" />
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
				:class="['qc-vboard__area--' + (a.shade ?? 'frame')]"
				:fill="a.shade === 'inactive' ? `url(#${stripeId})` : undefined" />
			<g v-for="(b, i) in boards" :key="'b' + i">
				<rect
					v-if="b.frame"
					:x="b.x - BAND_W"
					:y="b.y - BAND_W"
					:width="b.w + 2 * BAND_W"
					:height="b.h + 2 * BAND_W"
					class="qc-vboard__band"
					:class="'qc-vboard__band--' + b.frame" />
				<rect
					:x="b.x - 0.06"
					:y="b.y - 0.06"
					:width="b.w + 0.12"
					:height="b.h + 0.12"
					class="qc-vboard__frame" />
			</g>
			<line
				v-for="(l, i) in lines"
				:key="'l' + i"
				:x1="l.x1"
				:y1="l.y1"
				:x2="l.x2"
				:y2="l.y2"
				class="qc-vboard__line"
				:style="l.color ? { stroke: l.color } : undefined" />
			<g
				v-for="c in cells"
				:key="c.sq"
				v-memo="[c.memo, marksKey(c.sq), tabIndex(c), c.ghost ? unitStep : 0]"
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
						:unit="pc.p < 0.995 ? unitStep : 0" />
				</g>
			</g>
			<template v-for="(l, i) in outlines" :key="'o' + i">
				<g v-if="l.kind === 'travel'" class="qc-vboard__travel">
					<path :d="l.path" class="qc-vboard__casing" />
					<path :d="l.path" class="qc-vboard__outline qc-vboard__outline--travel" />
					<polygon v-if="l.head" :points="l.head.points" class="qc-vboard__head qc-vboard__head--travel" />
				</g>
				<template v-else>
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
						:class="OUTLINE_KINDS.includes(l.kind) ? 'qc-vboard__outline--' + l.kind : null" />
					<polygon v-if="l.head" :points="l.head.points" class="qc-vboard__head" />
				</template>
			</template>
			<text
				v-for="(l, i) in labels"
				:key="'t' + i"
				:x="l.x"
				:y="l.y"
				:style="l.sized ? { fontSize: l.font + 'px' } : undefined"
				class="qc-vboard__label"
				:class="{ 'qc-vboard__label--strong': l.strong, ['qc-vboard__label--' + l.kind]: l.kind }"
				text-anchor="middle"
				dominant-baseline="central">{{ l.text }}</text>
			<g v-for="(b, i) in boardLabels" :key="'bl' + i">
				<rect
					:x="b.chip.x"
					:y="b.chip.y"
					:width="b.chip.w"
					:height="b.chip.h"
					:rx="b.chip.r"
					class="qc-vboard__chip" />
				<text
					:x="b.x"
					:y="b.y"
					:style="{ fontSize: b.font + 'px' }"
					class="qc-vboard__board-label"
					:text-anchor="b.anchor">{{ b.text }}</text>
			</g>
			<g v-for="(p, i) in pins" :key="'p' + i">
				<rect
					:x="p.chip.x"
					:y="p.chip.y"
					:width="p.chip.w"
					:height="p.chip.h"
					:rx="p.chip.r"
					class="qc-vboard__chip qc-vboard__chip--pin" />
				<text
					:x="p.x"
					:y="p.y"
					:style="{ fontSize: p.font + 'px' }"
					class="qc-vboard__pin"
					text-anchor="start"
					dominant-baseline="central">{{ p.text }}</text>
			</g>
			<g
				v-for="m in offTargets"
				:key="'m' + m.side"
				class="qc-vboard__offscreen"
				role="button"
				:aria-label="m.name"
				@click.stop="panTo(m.to)">
				<rect
					:x="m.chip.x"
					:y="m.chip.y"
					:width="m.chip.w"
					:height="m.chip.h"
					:rx="m.chip.r"
					class="qc-vboard__offscreen-chip" />
				<text
					:x="m.x"
					:y="m.y"
					:style="{ fontSize: m.font + 'px' }"
					class="qc-vboard__offscreen-text"
					text-anchor="middle"
					dominant-baseline="central">{{ m.text }}</text>
			</g>
		</svg>
	</div>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
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
	/** Marks per square: selected, target, last, turn, part, pick, danger */
	marks: { type: Object, default: () => ({}) },
	/** Squares the viewer cannot see, or null */
	hidden: { type: Object, default: null },
	/** The side whose pieces are always visible (hidden-information variants), or null */
	viewer: { type: Number, default: null },
	/** Squares that take keyboard focus */
	focusable: { type: Object, default: () => new Set() },
	/** Accessible name of the board */
	label: { type: String, default: '' },
	/** Whether a new focus of the layout waits (the computer plays its turn) until this is false again */
	hold: { type: Boolean, default: false },
})

const emit = defineEmits(['square'])

const uid = 'vb' + Math.floor(Math.random() * 1e9).toString(36)
const hatchId = 'qc-hatch-' + uid
const stripeId = 'qc-stripe-' + uid

/** The width of the coloured band of a board with a `frame` (whose move it is there), in layout units. */
const BAND_W = 0.16
/** The outline kinds with their own look (the others are near-black lines). */
const OUTLINE_KINDS = ['threat', 'hill', 'next']

const theme = computed(() => resolveBoardTheme(boardPrefs.boardTheme, { highContrast: isHighContrast() }))
const topo = computed(() => props.variant.layoutOf ? props.variant.layoutOf(props.state) : props.variant.topology)
const W = computed(() => topo.value.layout.width)
const H = computed(() => topo.value.layout.height)
const turned = computed(() => props.rotation === 90 || props.rotation === 270)
/** The margin around everything drawn, in layout units (a focus outline on an edge square stays visible). */
const MARGIN = 0.12

/** Large layouts (3D, 4D, the multiverse) can be zoomed and panned. */
const zoomable = computed(() => W.value * H.value > 200 || Boolean(topo.value.layout.zoomable))
/** The board takes the height of the screen, not the drawing's aspect ratio (`layout.fill`, the multiverse). */
const fill = computed(() => Boolean(topo.value.layout.fill))
/** The line of text above the drawing (`layout.caption`). */
const caption = computed(() => (typeof topo.value.layout.caption === 'string' ? topo.value.layout.caption : ''))
/** The zoom cap of a layout that is not too wide for it. */
const MAX_ZOOM = 8
/** The most pixels per layout unit that the lifted zoom cap allows. */
const MAX_UNIT_PX = 40
/** The fewest pixels per layout unit on a touch screen when the focus has a box (and no `minPx` of its own). */
const TOUCH_UNIT_PX = 28
/** The fewest pixels per layout unit with a mouse, for a focus with `minPx`. */
const FINE_UNIT_PX = 24
/** The smallest text of the labels on screen, in CSS pixels. */
const LABEL_MIN_PX = 11
/** The smallest text of a long board name on a filling board, in CSS pixels, before it is left out. */
const LABEL_SMALL_PX = 8
/** The largest text of the labels on screen, in CSS pixels (a board zoomed in far keeps its names small). */
const LABEL_MAX_PX = 15
/** How wide a character of a label is, in font sizes (a bold sans serif, estimated). */
const CHAR_W = 0.6
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
	// the name of a piece type is translated once per drawing, not once per square
	const names = new Map()
	const nameOf = (type) => {
		if (!names.has(type)) {
			names.set(type, typeName(V, type))
		}
		return names.get(type)
	}
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
				name: nameOf(o.type),
				type: o.type,
			}
		})
		const fog = hiddenHere && !plain.value
		const name = topo.value.names[c.sq]
		// what the square shows, so that an unchanged square is not drawn again (`v-memo`)
		const memo = [cx, cy, w, h, c.shape, c.shade, fog, hiddenHere, name]
			.concat(pieces.map((pc) => pc.type + pc.side + ':' + pc.p + ':' + pc.spin)).join('|')
		const ghost = pieces.some((pc) => pc.p < 0.995)
		return { ...c, cx, cy, w, h, size, pieces, hidden: hiddenHere, fog, name, memo, ghost }
	})
})

const boards = computed(() => (topo.value.layout.boards ?? []).map(rotRect))
const areas = computed(() => (topo.value.layout.areas ?? []).map(rotRect))
/**
 * Rotate a line segment (and the control point of a bowed one).
 *
 * @param {object} l segment `{ x1, y1, x2, y2, cx?, cy?, kind?, color? }`
 * @return {object}
 */
function rotLine(l) {
	const [x1, y1] = rot(l.x1, l.y1)
	const [x2, y2] = rot(l.x2, l.y2)
	const out = { x1, y1, x2, y2, kind: l.kind ?? null }
	if (l.color) {
		out.color = l.color
	}
	if (Number.isFinite(l.cx) && Number.isFinite(l.cy)) {
		const [cx, cy] = rot(l.cx, l.cy)
		out.cx = cx
		out.cy = cy
	}
	return out
}

/** The length of the arrowhead of a threat line, in layout units. */
const HEAD = 0.34
/** How far before the threatened square's centre the arrowhead ends, in layout units (at the edge of the glyph). */
const HEAD_GAP = 0.35
/** How far after the attacker's centre a threat line starts, in layout units (the glyph stays clear). */
const START_GAP = 0.35
/** The length of the arrowhead of a travel arrow. */
const TRAVEL_HEAD = 0.4
/** How far before the arrival square's centre a travel arrow ends. */
const TRAVEL_GAP = 0.35
/** How far after the departure square's centre a travel arrow starts. */
const TRAVEL_START = 0.25

/**
 * An arrowhead: its tip `gap` before the end point, pointing along `(ux, uy)`, as polygon points, with the point where
 * the shaft ends (a little inside the head).
 *
 * @param {number} x2 end x
 * @param {number} y2 end y
 * @param {number} ux direction x (unit)
 * @param {number} uy direction y (unit)
 * @param {number} gap how far before the end the tip is
 * @param {number} len the head's length
 * @return {object}
 */
function arrowHead(x2, y2, ux, uy, gap, len) {
	const tip = { x: x2 - ux * gap, y: y2 - uy * gap }
	const base = { x: tip.x - ux * len, y: tip.y - uy * len }
	const half = len * 0.55
	const points = [
		[tip.x, tip.y],
		[base.x - uy * half, base.y + ux * half],
		[base.x + uy * half, base.y - ux * half],
	].map((pt) => pt.map((v) => v.toFixed(3)).join(',')).join(' ')
	return { x: base.x + ux * 0.02, y: base.y + uy * 0.02, tip, points }
}

/**
 * A threat line with its arrowhead: it starts a little after the attacker's centre, the shaft ends where the head
 * begins, and the head's tip stops at the edge of the threatened royal square's glyph, pointing at it. A line too short
 * for a head keeps none.
 *
 * @param {object} l rotated line
 * @return {object}
 */
function withHead(l) {
	const dx = l.x2 - l.x1
	const dy = l.y2 - l.y1
	const len = Math.hypot(dx, dy)
	if (len < START_GAP + HEAD + HEAD_GAP + 0.1) {
		return l
	}
	const ux = dx / len
	const uy = dy / len
	const head = arrowHead(l.x2, l.y2, ux, uy, HEAD_GAP, HEAD)
	return { ...l, x1: l.x1 + ux * START_GAP, y1: l.y1 + uy * START_GAP, head }
}

/**
 * A travel arrow: its path (straight, or a quadratic curve through the control point), both ends kept clear of the
 * pieces, and its head, pointing the way the curve arrives.
 *
 * @param {object} l rotated outline
 * @return {object}
 */
function travelPath(l) {
	const curved = Number.isFinite(l.cx)
	const [ax, ay] = curved ? [l.cx, l.cy] : [l.x2, l.y2]
	const [bx, by] = curved ? [l.cx, l.cy] : [l.x1, l.y1]
	const unit = (dx, dy) => {
		const d = Math.hypot(dx, dy) || 1
		return [dx / d, dy / d]
	}
	const [sx, sy] = unit(ax - l.x1, ay - l.y1)
	const [ex, ey] = unit(l.x2 - bx, l.y2 - by)
	const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1)
	if (len < TRAVEL_START + TRAVEL_GAP + TRAVEL_HEAD + 0.1) {
		return { ...l, path: `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`, head: null }
	}
	const head = arrowHead(l.x2, l.y2, ex, ey, TRAVEL_GAP, TRAVEL_HEAD)
	const x1 = l.x1 + sx * TRAVEL_START
	const y1 = l.y1 + sy * TRAVEL_START
	const f = (v) => v.toFixed(3)
	const path = curved
		? `M ${f(x1)} ${f(y1)} Q ${f(l.cx)} ${f(l.cy)} ${f(head.x)} ${f(head.y)}`
		: `M ${f(x1)} ${f(y1)} L ${f(head.x)} ${f(head.y)}`
	return { ...l, path, head }
}

const lines = computed(() => (topo.value.layout.lines ?? []).map(rotLine))
const outlines = computed(() => (topo.value.layout.outlines ?? []).map((l) => {
	const r = rotLine(l)
	if (r.kind === 'travel') {
		return travelPath(r)
	}
	return r.kind === 'threat' ? withHead(r) : r
}))

/** The labels where they are drawn (their size comes later: it depends on the zoom, which depends on these). */
const labelSpots = computed(() => (topo.value.layout.labels ?? []).map((l) => {
	const [x, y] = rot(l.x, l.y)
	return { ...l, x, y, strong: Boolean(l.strong), kind: typeof l.kind === 'string' ? l.kind : null }
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
		const e = b.frame ? BAND_W : 0.06
		grow(b.x - e, b.y - (b.label ? 0.6 + (b.lift ?? 0) : e), b.x + b.w + e, b.y + b.h + e)
	}
	for (const a of areas.value) {
		grow(a.x, a.y, a.x + a.w, a.y + a.h)
	}
	for (const l of [...lines.value, ...outlines.value]) {
		grow(Math.min(l.x1, l.x2), Math.min(l.y1, l.y2), Math.max(l.x1, l.x2), Math.max(l.y1, l.y2))
	}
	for (const l of labelSpots.value) {
		const half = 0.08 + (l.strong ? 0.12 : 0.1) * String(l.text).length
		grow(l.x - half, l.y - (l.strong ? 0.22 : 0.2), l.x + half, l.y + (l.strong ? 0.22 : 0.2))
	}
	return { x: x1 - MARGIN, y: y1 - MARGIN, w: x2 - x1 + 2 * MARGIN, h: y2 - y1 + 2 * MARGIN }
})

/**
 * The part shown at zoom 1: the whole drawing, widened (centred) to the aspect of the board on screen when the board
 * fills the screen's height (`fill`); otherwise the drawing itself, whose aspect the board keeps.
 */
const base = computed(() => {
	const f = full.value
	const { w, h } = screen.value
	if (!fill.value || !(w > 0 && h > 0)) {
		return f
	}
	const a = h / w
	const bw = Math.max(f.w, f.h / a)
	const bh = bw * a
	return { x: f.x + (f.w - bw) / 2, y: f.y + (f.h - bh) / 2, w: bw, h: bh }
})

/** CSS pixels per layout unit at zoom 1 (0 until the drawing is measured). */
const unitPx = computed(() => {
	const { w, h } = screen.value
	return w > 0 && h > 0 ? Math.min(w / base.value.w, h / base.value.h) : 0
})

/** The zoom cap: 8, or more for a layout so wide that zoom 8 gives fewer than 40 px per unit. */
const maxZoom = computed(() => (unitPx.value > 0 ? Math.max(MAX_ZOOM, MAX_UNIT_PX / unitPx.value) : MAX_ZOOM))

/** The size of one CSS pixel in layout units at the current zoom (0 while unknown). */
const unitSize = computed(() => (unitPx.value > 0 ? 1 / (unitPx.value * zoom.value) : 0))

/**
 * `unitSize` for the ghost pieces, with the zoom taken in steps of about 9 % (rounded down, so a badge keeps at least
 * its size on screen): a pinch then redraws them a few times, not at every step. Exact at zoom 1.
 */
const unitStep = computed(() => {
	if (!(unitPx.value > 0)) {
		return 0
	}
	const z = 2 ** (Math.floor(Math.log2(zoom.value) * 8 + 1e-9) / 8)
	return 1 / (unitPx.value * z)
})

/**
 * The font size of a label: its own size, raised to 11 px on screen as far as its `fit` allows (a label without `fit`
 * keeps its size).
 *
 * @param {object} l label
 * @param {number} base its own font size in layout units
 * @return {number}
 */
function labelFont(l, base) {
	if (!(l.fit > 0) || unitSize.value <= 0) {
		return base
	}
	const wanted = LABEL_MIN_PX * unitSize.value
	const room = l.fit / (CHAR_W * Math.max(1, [...String(l.text)].length))
	return Math.min(Math.max(base, Math.min(wanted, room)), LABEL_MAX_PX * unitSize.value)
}

/**
 * Place a length of the view along one axis: centred on the drawing when it is larger, else inside it.
 *
 * @param {number} c the wanted centre
 * @param {number} size the length shown
 * @param {number} start the drawing's start
 * @param {number} length the drawing's length
 * @return {number} the start of the part shown
 */
function place(c, size, start, length) {
	if (size >= length) {
		return start + (length - size) / 2
	}
	return Math.min(Math.max(c - size / 2, start), start + length - size)
}

/** The shown part of the drawing: `{ x, y, w, h }` in layout units. */
const shown = computed(() => {
	const f = full.value
	const b = base.value
	if (zoom.value <= 1) {
		return b
	}
	const w = b.w / zoom.value
	const h = b.h / zoom.value
	const c = centre.value ?? { x: f.x + f.w / 2, y: f.y + f.h / 2 }
	return { x: place(c.x, w, f.x, f.w), y: place(c.y, h, f.y, f.h), w, h }
})

const viewBox = computed(() => {
	const v = shown.value
	return [v.x, v.y, v.w, v.h].map((e) => Number(e.toFixed(4))).join(' ')
})

/**
 * The x of a bold label (a player's name) in a zoomed view: moved inwards as far as it sticks out of the part shown,
 * when a part of it is in view, so that a name at the edge of the view is not cut ("A" of "Black A"). Its width is
 * the estimate of the drawing's extent (`full`), with a little room.
 *
 * @param {object} l label (drawn coordinates)
 * @return {number}
 */
function keptInView(l) {
	if (!l.strong || zoom.value <= 1) {
		return l.x
	}
	const v = shown.value
	const half = 0.08 + 0.12 * String(l.text).length + 0.05
	const lo = v.x + half
	const hi = v.x + v.w - half
	if (l.x + half <= v.x || l.x - half >= v.x + v.w || lo > hi) {
		return l.x
	}
	return Math.min(Math.max(l.x, lo), hi)
}

const labels = computed(() => labelSpots.value.map((l) => {
	const font = labelFont(l, l.strong ? 0.36 : 0.32)
	return { ...l, x: keptInView(l), font: Number(font.toFixed(4)), sized: l.fit > 0 }
}))

/** The font size of a pinned board name, in layout units (a board label's). */
const PIN_FONT = 0.36

/**
 * The font size of the boards' names: a board label's; on a board that fills the screen (the multiverse, whose boards
 * are small in a whole view and large when zoomed in) kept between 11 and 15 px on screen.
 */
const nameFont = computed(() => {
	const u = unitSize.value
	return u > 0 && fill.value ? Math.min(Math.max(PIN_FONT, LABEL_MIN_PX * u), LABEL_MAX_PX * u) : PIN_FONT
})
/** How far a board's label stands above its board (its baseline), without a `lift`. */
const LABEL_GAP = 0.22

/**
 * A light chip behind a text: its rectangle for an estimated text width.
 *
 * @param {number} x the text's anchor x
 * @param {number} y the text's baseline, or its middle with `middle`
 * @param {number} width the estimated text width
 * @param {number} font the font size
 * @param {string} anchor start or middle
 * @param {boolean} [middle] whether `y` is the middle of the text
 * @return {{x: number, y: number, w: number, h: number, r: number}}
 */
function chipOf(x, y, width, font, anchor, middle = false) {
	const pad = font * 0.25
	const left = anchor === 'middle' ? x - width / 2 : x
	const top = middle ? y - font * 0.62 : y - font * 0.9
	return { x: left - pad, y: top, w: width + 2 * pad, h: font * 1.24, r: font * 0.3 }
}

/**
 * The boards whose label is pinned to the top of a zoomed view instead (the top of their own label is above the part
 * shown), with the pin: the board's `pin` (the multiverse names the timeline, since the row labels are then out of
 * sight) or its label, on a chip at the top left of the board's visible part. A board shows at least one unit of its
 * width and two of its height (half of a small board) to get one: a sliver of a board needs no name.
 */
const pinned = computed(() => {
	const out = new Map()
	if (zoom.value <= 1) {
		return out
	}
	const v = shown.value
	const font = nameFont.value
	boards.value.forEach((b, i) => {
		const left = Math.max(b.x, v.x)
		const right = Math.min(b.x + b.w, v.x + v.w)
		const text = String(b.pin ?? b.label ?? '')
		// the label's top: once it is cut, the name is pinned (and the label itself left out)
		const top = b.y - LABEL_GAP - (b.lift ?? 0) - font * 0.8
		const tall = Math.min(2, b.h / 2)
		if (!text || top >= v.y || right - left < 1 || b.y + b.h < v.y + tall || b.y > v.y + v.h - tall) {
			return
		}
		const x = Math.max(left + 0.08, v.x + 0.1)
		const y = v.y + 0.12 + font * 0.62
		out.set(i, { text, x, y, font, chip: chipOf(x, y, estimate(text, font), font, 'start', true) })
	})
	return out
})

const pins = computed(() => [...pinned.value.values()])

/**
 * The estimated width of a text.
 *
 * @param {string} text text
 * @param {number} font font size
 * @return {number}
 */
function estimate(text, font) {
	return font * CHAR_W * [...text].length
}

/**
 * The boards' labels, drawn above the outlines on a light chip, at least 11 px on screen: centred over the board, but
 * kept inside a zoomed view; left out when pinned, or when they no longer fit over their board (a whole view of many
 * small boards).
 */
const boardLabels = computed(() => {
	const out = []
	const v = shown.value
	const zoomed = zoom.value > 1
	const baseFont = nameFont.value
	boards.value.forEach((b, i) => {
		if (!b.label || pinned.value.has(i)) {
			return
		}
		// zoomed in, the row names may be out of sight: a board then says its full name (`pin`: with its timeline)
		const text = String(zoomed ? (b.pin ?? b.label) : b.label)
		let font = baseFont
		let width = estimate(text, font)
		const room = b.w + 1.2
		// a long name on a filling board gets smaller, down to 8 px, rather than left out
		if (width > room && fill.value && unitSize.value > 0) {
			font = room / (CHAR_W * [...text].length)
			width = room
			if (font < LABEL_SMALL_PX * unitSize.value) {
				return
			}
		}
		// no room over the board, or (a filling board, whose rows are 1.6 apart) above it
		if (width > room || (fill.value && font > 0.9)) {
			return
		}
		let x = b.x + b.w / 2
		if (zoomed) {
			// over the part of its board in view: a board mostly out of view keeps its name to itself
			const left = Math.max(b.x, v.x + 0.1)
			const right = Math.min(b.x + b.w, v.x + v.w - 0.1)
			if (right - left < Math.min(width, b.w / 2)) {
				return
			}
			x = right - left >= width ? Math.min(Math.max(x, left + width / 2), right - width / 2) : (left + right) / 2
		}
		const y = b.y - LABEL_GAP - (b.lift ?? 0)
		out.push({ text, x, y, font, anchor: 'middle', chip: chipOf(x, y, width, font, 'middle') })
	})
	return out
})

/**
 * Zoomed in: the move targets outside the part shown, counted per edge they lie beyond (`← 2`), each marker at the
 * middle of its edge; a tap on it pans to the nearest of them.
 */
const offTargets = computed(() => {
	if (zoom.value <= 1) {
		return []
	}
	const v = shown.value
	const mx = v.x + v.w / 2
	const my = v.y + v.h / 2
	const sides = {}
	for (const c of cells.value) {
		if (!props.marks[c.sq]?.includes('target')) {
			continue
		}
		if (c.cx >= v.x && c.cx <= v.x + v.w && c.cy >= v.y && c.cy <= v.y + v.h) {
			continue
		}
		const dx = (c.cx - mx) / v.w
		const dy = (c.cy - my) / v.h
		const side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
		const d = Math.hypot(c.cx - mx, c.cy - my)
		const s = (sides[side] ??= { count: 0, to: null, d: Infinity })
		s.count++
		if (d < s.d) {
			s.d = d
			s.to = { x: c.cx, y: c.cy }
		}
	}
	const font = Math.max(0.3, 13 * unitSize.value)
	const arrows = { left: '←', right: '→', up: '↑', down: '↓' }
	return Object.entries(sides).map(([side, s]) => {
		const text = arrows[side] + ' ' + s.count
		const w = estimate(text, font)
		const inset = font * 0.9
		const x = side === 'left' ? v.x + inset + w / 2 : side === 'right' ? v.x + v.w - inset - w / 2 : mx
		const y = side === 'up' ? v.y + inset + font : side === 'down' ? v.y + v.h - inset - font : my
		return {
			side,
			text,
			x,
			y,
			font,
			to: s.to,
			chip: chipOf(x, y, w, font, 'middle', true),
			name: n('quantumchess', '{count} target outside the view', '{count} targets outside the view', s.count, {
				count: s.count,
			}),
		}
	})
})

/**
 * The browser's own touch gestures: none while zoomed in (the board pans and pinches), else the page may scroll over
 * the board (a zoomable board takes the pinch itself). A board that fills the screen (the multiverse, thousands of
 * squares) always takes every gesture and scrolls the page itself at zoom 1: a change of `touch-action` restyles every
 * square (about 0.3 s on a desktop).
 */
const touchAction = computed(() => {
	if (zoom.value > 1 || fill.value) {
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
 * Centre the view on a point of the drawing (drawn coordinates), keeping the zoom.
 *
 * @param {{x: number, y: number}} to point
 */
function panTo(to) {
	if (to) {
		centre.value = { x: to.x, y: to.y }
	}
}

/** The layout's stops: the boards to play one by one (drawn coordinates). */
const stops = computed(() => (zoomable.value ? (topo.value.layout.focus?.stops ?? []) : [])
	.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
	.map((p) => {
		const [x, y] = rot(p.x, p.y)
		return { x, y }
	}))

/** The stop shown last by "previous / next board", or -1. */
const stopAt = ref(-1)

/**
 * Show the next (1) or previous (-1) board to play, zoomed in as the focus asks when the view shows the whole board.
 *
 * @param {number} step 1 or -1
 */
function goStop(step) {
	const list = stops.value
	if (!list.length) {
		return
	}
	stopAt.value = ((stopAt.value < 0 ? (step > 0 ? -1 : 0) : stopAt.value) + step + list.length) % list.length
	if (zoom.value <= 1) {
		const focus = topo.value.layout.focus
		zoom.value = Math.min(maxZoom.value, Math.max(1, focusTarget(focus).z))
	}
	panTo(list[stopAt.value])
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
 * Where a focus puts the view: `{ x, y, z }` (drawn coordinates, zoom). The zoom is its own `zoom` (a fine pointer),
 * else the zoom that fits its `box`, or the smaller frame `alt` when the box would give fewer than `minPx` px per
 * unit (with a mouse `fineMinPx`, when the focus has it); with a box on a touch screen at least `minPx` (default 28)
 * px per unit, and with `minPx` and a mouse at least 24; never more than `maxPx` px per unit when the focus has it (a
 * single board is not blown up). Zoomed in further than the frame fits, a focus with `minPx` starts at the frame's
 * top left corner (its first boards) instead of its middle.
 *
 * @param {object} focus the layout's focus
 * @return {{x: number, y: number, z: number}}
 */
function focusTarget(focus) {
	const s1 = unitPx.value
	const touch = coarsePointer()
	const floor = focus.minPx ?? TOUCH_UNIT_PX
	const { w, h } = screen.value
	const fit = (frame) => {
		const bw = turned.value ? frame.box.h : frame.box.w
		const bh = turned.value ? frame.box.w : frame.box.h
		return Math.min(w / bw, h / bh) / s1
	}
	let frame = focus
	let z = focus.zoom ?? zoom.value
	let fitted = z
	if (focus.box && focus.zoom === undefined && s1 > 0) {
		z = fit(focus)
		// the smaller frame when the large one would be too small: with a mouse the focus may accept less
		if (focus.alt?.box && z * s1 < (touch ? floor : (focus.fineMinPx ?? floor))) {
			frame = focus.alt
			z = fit(frame)
		}
		fitted = z
		if (!touch && focus.minPx) {
			z = Math.max(z, FINE_UNIT_PX / s1)
		}
		if (focus.maxPx) {
			z = Math.min(z, Math.max(focus.maxPx, floor) / s1)
			fitted = Math.min(fitted, z)
		}
	}
	if (focus.box && s1 > 0 && touch) {
		z = Math.max(z, floor / s1)
	}
	let [x, y] = rot(frame.x, frame.y)
	if (focus.minPx && frame.box && z > fitted * 1.001 && s1 > 0) {
		const f = full.value
		const vw = base.value.w / z
		const vh = base.value.h / z
		const bw = turned.value ? frame.box.h : frame.box.w
		const bh = turned.value ? frame.box.w : frame.box.h
		if (bw > vw) {
			x = Math.max(x - bw / 2 + vw / 2, f.x + vw / 2)
		}
		if (bh > vh) {
			y = Math.max(y - bh / 2 + vh / 2, f.y + vh / 2)
		}
	}
	return { x, y, z }
}

/** The focus key the view was last put on. */
let appliedKey = null

/** Zoom in on the layout's focus, if it has one. */
function applyFocus() {
	const focus = topo.value.layout.focus
	if (focus && zoomable.value) {
		const target = focusTarget(focus)
		centre.value = { x: target.x, y: target.y }
		zoom.value = Math.min(maxZoom.value, Math.max(1, target.z))
		appliedKey = focusKey(focus)
		stopAt.value = -1
	}
}

/** Whether "Recentre" is offered: the layout's focus zooms in (on a touch screen, or with its own zoom). */
const canRecentre = computed(() => {
	const focus = topo.value.layout.focus
	return Boolean(focus && zoomable.value && unitPx.value > 0 && focusTarget(focus).z > 1.01)
})

/** Whether the view is where the focus puts it (then "Recentre" has nothing to do). */
const atFocus = computed(() => {
	const focus = topo.value.layout.focus
	if (!focus || !centre.value) {
		return false
	}
	const target = focusTarget(focus)
	const z = Math.min(maxZoom.value, Math.max(1, target.z))
	return Math.abs(centre.value.x - target.x) < 1e-6 && Math.abs(centre.value.y - target.y) < 1e-6
		&& Math.abs(zoom.value - z) < 1e-6
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
/**
 * The gesture in progress: `{ kind: 'pan', id, x, y, c }`, `{ kind: 'pinch', d, z, anchor }`, `{ kind: 'scroll', id, x,
 * y, last, box }` (the page, from a board that fills the screen at zoom 1) or null.
 */
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
 * The element whose scrolling moves the page: the nearest ancestor that scrolls, else the document.
 *
 * @param {Element} el element
 * @return {Element}
 */
function scrollerOf(el) {
	for (let e = el?.parentElement; e; e = e.parentElement) {
		const y = getComputedStyle(e).overflowY
		if ((y === 'auto' || y === 'scroll') && e.scrollHeight > e.clientHeight) {
			return e
		}
	}
	return document.scrollingElement ?? document.documentElement
}

/**
 * Start a one-pointer pan of a zoomed board; on a board that fills the screen at zoom 1, a touch drag scrolls the page
 * instead (the board keeps `touch-action: none`).
 *
 * @param {number} id pointer id
 * @param {string} [type] pointer type
 */
function startPan(id, type = 'touch') {
	const p = pointers.get(id)
	// from the centre of what is shown (a centre beyond the edge is clamped there), so the drag moves at once
	const v = shown.value
	const c = { x: v.x + v.w / 2, y: v.y + v.h / 2 }
	if (zoom.value > 1 && p) {
		gesture = { kind: 'pan', id, x: p.x, y: p.y, c }
	} else if (fill.value && p && type === 'touch') {
		gesture = { kind: 'scroll', id, x: p.x, y: p.y, last: p.y, box: scrollerOf(svgEl.value) }
	} else {
		gesture = null
	}
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
		startPan(e.pointerId, e.pointerType)
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
	if (moved && gesture.kind === 'scroll') {
		gesture.box.scrollBy?.(0, gesture.last - p.y)
		gesture.last = p.y
		return
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
	const w = base.value.w / zoom.value
	const h = base.value.h / zoom.value
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
		startPan([...pointers.keys()][0], e.pointerType)
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
// once, again once the drawing is measured (on mount), and then only when the focus really changes; while the view
// does not follow (the computer plays its turn of several moves) a new focus waits until it does
watch(() => focusKey(topo.value.layout.focus), () => {
	if (!props.hold) {
		applyFocus()
	}
}, { immediate: true })

watch(() => props.hold, (now) => {
	if (!now && focusKey(topo.value.layout.focus) !== appliedKey) {
		applyFocus()
	}
})

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
 * The marks of a square as one string (for `v-memo`).
 *
 * @param {number} sq square
 * @return {string}
 */
function marksKey(sq) {
	return (props.marks[sq] ?? []).join()
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
	// an empty point (xiangqi): the last move's mark is a ring there, not a disc that would read as a faded piece
	if (c.shape === 'point' && !c.pieces.length) {
		out.push('qc-vboard__cell--vacant')
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
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 4px;
	margin-bottom: 4px;
}

// the layout's header, as text above the drawing (the multiverse: new timelines and travel reach), with the buttons
// that step through the boards to play at its end (the navigation toggle sits at the start on a wide screen)
.qc-vboard__top {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 4px;
}

.qc-vboard__caption {
	flex: 1;
	min-width: 0;
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
	line-height: 1.35;
	text-align: center;
}

// a board that can be panned shows the grab cursor between its squares; it never changes with the zoom: the cursor
// is inherited, and changing it on the drawing would restyle every square of the multiverse (a third of a second)
.qc-vboard--zoomable {
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

// a board that takes the screen's height (the multiverse): the view shows as much of the drawing as that allows
.qc-vboard--fill {
	height: max(280px, calc(100vh - var(--qc-vboard-reserve, 150px)));
}

@supports (height: 100dvh) {
	.qc-vboard--fill {
		height: max(280px, calc(100dvh - var(--qc-vboard-reserve, 150px)));
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

// on a board of points (xiangqi) an empty point of the last move gets an amber ring: a filled disc there would read
// as a faded piece (under a piece the disc shows as a halo)
.qc-vboard__cell--last.qc-vboard__cell--vacant .qc-vboard__shape--point {
	fill: transparent;
	stroke: #c08a00;
	stroke-width: 0.06;
}

// the ring gives way to a point being chosen (the first target of a split) and to the keyboard focus
.qc-vboard__cell--vacant.qc-vboard__cell--selected .qc-vboard__shape--point,
.qc-vboard__cell--vacant.qc-vboard__cell--pick .qc-vboard__shape--point {
	fill: color-mix(in srgb, transparent 55%, var(--color-primary-element));
}

.qc-vboard__cell--vacant:focus-visible .qc-vboard__shape--point {
	stroke: var(--color-primary-element);
	stroke-width: 0.08;
}

// the moves of the turn in progress (a turn of several moves, the multiverse): mint, apart from the opponent's yellow
.qc-vboard__cell--turn .qc-vboard__shape {
	fill: color-mix(in srgb, var(--qc-sq-light) 50%, #7fcf9a);
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

// a placeholder (the multiverse's next boards): dashed and grey, lighter than any board
.qc-vboard__outline--next {
	stroke: #9aa5ab;
	stroke-width: 0.04;
	stroke-dasharray: 0.3 0.2;
	stroke-linecap: butt;
}

// a travel arrow (the multiverse): blue on a white casing, half transparent, so the pieces under it stay legible
.qc-vboard__travel {
	opacity: 0.7;
}

.qc-vboard__casing {
	fill: none;
	stroke: #ffffff;
	stroke-width: 0.22;
	stroke-linecap: round;
	pointer-events: none;
}

.qc-vboard__outline--travel {
	fill: none;
	stroke: #1f6fb2;
	stroke-width: 0.1;
}

.qc-vboard__travel .qc-vboard__head--travel {
	fill: #1f6fb2;
	stroke: #ffffff;
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

// the band around a board in the colour of the side to move there: time reads along a row (○ light, ● dark)
.qc-vboard__band--light {
	fill: #f5f5f5;
	stroke: #b0b8bc;
	stroke-width: 0.03;
}

.qc-vboard__band--dark {
	fill: #3a3f44;
	stroke: #3a3f44;
	stroke-width: 0.03;
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

// the halos of the multiverse: gold around a board you must move on, blue (at least 3 : 1 on white) around an
// optional one
.qc-vboard__area--must {
	fill: #e9b949;
	stroke: #9a6b00;
	stroke-width: 0.05;
}

.qc-vboard__area--optional {
	fill: #9cc7e2;
	stroke: #2a7ab0;
	stroke-width: 0.07;
}

// an inactive timeline: a hatched band behind its row
.qc-vboard__stripe-ground {
	fill: #f1f3f4;
}

.qc-vboard__stripe-line {
	stroke: #c9d0d4;
	stroke-width: 0.16;
}

.qc-vboard__line {
	stroke: #5d4222;
	stroke-width: 0.035;
}

// the branch connectors of the multiverse carry their colour: a little wider, so they read as connectors
.qc-vboard__line[style] {
	stroke-width: 0.09;
	stroke-linecap: round;
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

.qc-vboard__board-label {
	fill: #2b2f33;
}

// a timeline's name in the left margin of the multiverse
.qc-vboard__label--row {
	fill: #2b2f33;
	font-weight: bold;
}

// the label of a placeholder: grey like its dashed outline, still readable
.qc-vboard__label--next {
	fill: #6f7a80;
}

// the inscription in the river of xiangqi: large, faint, in the characters' serif; the space after the last character
// counts in the centring, so the text moves back by half of it to stand centred on its x
.qc-vboard__label--river {
	fill: #4b6b7a;
	fill-opacity: 0.55;
	font-family: 'Noto Serif CJK TC', 'Noto Serif CJK JP', 'Noto Serif SC', 'Songti TC', 'Songti SC', serif;
	font-size: 0.56px;
	font-weight: bold;
	letter-spacing: 0.4px;
	transform: translateX(0.2px);
}

// a light chip behind a board's label or pin, so lines and pieces under it do not cut it
.qc-vboard__chip {
	fill: var(--color-main-background, #ffffff);
	fill-opacity: 0.9;
	stroke: rgb(0 0 0 / 0.12);
	stroke-width: 0.02;
	pointer-events: none;
}

// a board's name pinned to the top of a zoomed view: dark text on a light chip, readable on any square or piece
.qc-vboard__pin {
	fill: #1b1b1b;
	font-weight: bold;
	pointer-events: none;
}

// the move targets beyond an edge of a zoomed view: a tap pans there
.qc-vboard__offscreen {
	cursor: pointer;
}

.qc-vboard__offscreen-chip {
	fill: var(--color-primary-element, #00679e);
	fill-opacity: 0.92;
}

.qc-vboard__offscreen-text {
	fill: var(--color-primary-element-text, #ffffff);
	font-weight: bold;
	pointer-events: none;
}
</style>
