<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The quantum chessboard (SPEC §14.6.1, GAME-DESIGN §3.3–§3.6): squares, target markers, pieces with ghost opacity,
  probability rings, badges and identity dots, part threads and link glyphs, the what-if view, king rings, the odds
  card, the promotion picker, the king safety net and the roll animation (it implements the Animator of SPEC §14.4.2).
  Input: click, drag and keyboard (roving tabindex). Always `dir="ltr"`.
-->
<template>
	<div
		class="qc-board qc-scope"
		:class="rootClasses"
		:data-board-theme="theme"
		:style="rootStyle"
		dir="ltr">
		<div
			ref="frame"
			class="qc-board__frame"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerCancel"
			@pointerleave="onPointerLeave">
			<!-- 0: squares (the accessible grid) -->
			<div
				class="qc-board__grid"
				role="grid"
				:aria-label="t('quantumchess', 'Chessboard')"
				:aria-readonly="!canPlay"
				@keydown="onKeydown"
				@focusin="hasFocus = true"
				@focusout="onFocusOut">
				<div
					v-for="(row, r) in rows"
					:key="r"
					class="qc-board__row"
					role="row">
					<div
						v-for="cell in row"
						:key="cell.square"
						:ref="(el) => (cellEls[cell.square] = el)"
						class="qc-sq"
						:class="cell.classes"
						role="gridcell"
						:tabindex="cell.square === focusSquare ? 0 : -1"
						:aria-label="cell.label"
						:aria-selected="cell.selected ? 'true' : 'false'"
						:title="cell.title"
						@focus="onCellFocus(cell.square)">
						<span v-if="cell.rank" class="qc-sq__rank" aria-hidden="true">{{ cell.rank }}</span>
						<span v-if="cell.file" class="qc-sq__file" aria-hidden="true">{{ cell.file }}</span>
						<span v-if="cell.name" class="qc-sq__name" aria-hidden="true">{{ cell.name }}</span>
					</div>
				</div>
			</div>

			<!-- 1: markers under the pieces -->
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
					v-for="s in lastSquares.dashed"
					:key="'lm' + s"
					v-bind="rectOf(s, 0.04)"
					class="qc-mk-attempted" />
				<!-- what-if outlines on changed squares -->
				<rect
					v-for="p in whatIfChanged"
					:key="'wi' + p.square"
					v-bind="rectOf(p.square, 0.04)"
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
					v-for="s in thread.outlines"
					:key="'po' + s"
					v-bind="rectOf(s, 0.06)"
					class="qc-mk-part" />
				<path
					v-for="(d, i) in thread.paths"
					:key="'pt' + i"
					:d="d"
					class="qc-mk-thread" />
				<!-- king rings -->
				<circle
					v-for="k in kings"
					:key="'k' + k.color"
					:cx="centre(k.square).x"
					:cy="centre(k.square).y"
					r="0.47"
					class="qc-mk-king"
					:class="{ 'qc-mk-king--certain': k.certain }" />
				<!-- coach markers -->
				<g v-for="(m, i) in markers" :key="'cm' + i" :class="'qc-mk-coach qc-mk-coach--' + m.kind">
					<circle :cx="centre(m.square).x" :cy="centre(m.square).y" r="0.3" />
					<line
						:x1="centre(m.square).x - 0.42"
						:y1="centre(m.square).y"
						:x2="centre(m.square).x + 0.42"
						:y2="centre(m.square).y" />
					<line
						:x1="centre(m.square).x"
						:y1="centre(m.square).y - 0.42"
						:x2="centre(m.square).x"
						:y2="centre(m.square).y + 0.42" />
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

			<!-- 2: pieces -->
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

			<!-- 3: badges, identity dots, what-if deltas, link glyphs -->
			<div class="qc-board__badges" aria-hidden="true">
				<span
					v-for="b in badges"
					:key="b.key"
					class="qc-badge"
					:class="b.classes"
					:style="b.style">
					<span v-if="b.dot" class="qc-badge__dot" :style="{ background: `var(--qc-id-${b.dot})` }" />{{ b.text }}
				</span>
				<span
					v-for="d in deltas"
					:key="'d' + d.square"
					class="qc-delta"
					:class="d.up ? 'qc-delta--up' : 'qc-delta--down'"
					:style="d.style">{{ d.text }}</span>
				<span
					v-for="m in coachLabels"
					:key="'cl' + m.square"
					class="qc-coach-pct"
					:class="'qc-coach-pct--' + m.kind"
					:style="m.style">{{ m.text }}</span>
				<span
					v-for="l in linkGlyphs"
					:key="'l' + l.square"
					class="qc-link-glyph"
					:style="l.style">
					<svg viewBox="0 0 24 24" width="12" height="12"><path :d="mdiLinkVariant" /></svg>
				</span>
			</div>

			<!-- 4: effects above the pieces: arrows, outcome ring, traveller -->
			<svg class="qc-board__fx" viewBox="0 0 8 8" aria-hidden="true">
				<g
					v-for="(a, i) in arrowShapes"
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

			<!-- 5: floating UI -->
			<div v-if="banner" class="qc-board__banner" @pointerdown.stop>
				<FigurineText :text="banner.text" :size="16" />
				<NcButton
					v-if="banner.close"
					variant="tertiary"
					size="small"
					:aria-label="t('quantumchess', 'Close')"
					@click="banner.close">
					<template #icon>
						<NcIconSvgWrapper :path="mdiClose" :size="18" />
					</template>
				</NcButton>
			</div>
			<div
				v-if="chip"
				class="qc-board__chip"
				:class="'qc-board__chip--' + (chip.tone ?? 'neutral')"
				@pointerdown.stop="anim.dismissChip()">
				<template v-if="chip.waiting">
					<NcLoadingIcon :size="18" />
					<span>{{ t('quantumchess', 'Waiting for the server…') }}</span>
				</template>
				<template v-else>
					<span class="qc-board__chip-text">
						<span class="qc-board__chip-glyph">{{ chip.glyph }}</span>
						<FigurineText :text="chip.text" :size="17" />
					</span>
					<span v-if="chip.rarity" class="qc-board__chip-rarity">{{ chip.rarity }}</span>
					<span v-if="chip.lessonRoll" class="qc-board__chip-tag">{{ t('quantumchess', 'Lesson roll') }}</span>
				</template>
			</div>
			<div
				v-if="card"
				class="qc-board__card"
				:style="card.style"
				@pointerdown.stop>
				<MovePreview :info="card.info" @whatIf="(s) => input.setWhatIf(s)" />
			</div>
			<div
				v-if="tooltip"
				class="qc-board__tooltip"
				:style="tooltip.style"
				role="status">
				{{ tooltip.text }}
			</div>
			<PromotionPicker
				v-if="input.promotion"
				:square="input.promotion.square"
				:color="input.promotion.color"
				:orientation="orientation"
				:size="squareSize"
				@pointerdown.stop
				@choose="(type) => input.choosePromotion(type)"
				@cancel="onPromotionCancel" />
		</div>

		<SafetyNetDialog :net="input.safetyNet" :state="shown" @resolve="(action, dontAsk) => input.resolveSafetyNet(action, dontAsk)" />
		<div class="qc-sr-only" aria-live="polite">
			{{ announcement }}
		</div>
	</div>
</template>

<script setup>
import { mdiCallMerge, mdiClose, mdiLinkVariant } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { useHotKey } from '@nextcloud/vue/composables/useHotKey'
import { useIsDarkTheme } from '@nextcloud/vue/composables/useIsDarkTheme'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FigurineText from './FigurineText.vue'
import MovePreview from './MovePreview.vue'
import PromotionPicker from './PromotionPicker.vue'
import SafetyNetDialog from './SafetyNetDialog.vue'
import { kingDanger, squareName, T } from '../../engine/index.js'
import {
	describePosition,
	figurine,
	formatPercentNumber,
	formatProbability,
	identityColours,
	kingCaptureThreat,
	moveSentence,
	resolutionLabel,
	resolutionText,
	resultSentence,
	TEXT,
} from '../../engine/ui/index.js'
import { configureSound, playSound, startSuspense, unlockAudio } from '../../sound/sound.js'
import { createAnimator } from './animator.js'
import { kingRings, lastMoveSquares, pieceItems, revealArrow, squareLabel, viewsOf } from './boardModel.js'
import { boardPrefs, coarsePointer, reducedMotion } from './boardPreferences.js'
import { arcPath, displayRows, ghostOpacity, isLightSquare, piePath, squareAt, squareCentre, squareXY, stepSquare } from './geometry.js'
import { pieceSymbolId } from './pieceSprite.js'
import { isHighContrast, resolveBoardTheme } from './themes.js'
import { MODES, useBoardInput } from './useBoardInput.js'

import './styles.js'

const props = defineProps({
	/** Position to draw */
	state: { type: Object, required: true },
	/** Moves the local user may play now (targets come only from this list) */
	legalMoves: { type: Array, default: () => [] },
	/** Shared input controller (useBoardInput); internal when omitted */
	input: { type: Object, default: null },
	/** 'w' or 'b' at the bottom */
	orientation: { type: String, default: 'w' },
	/** Square size S in px (integer) */
	squareSize: { type: Number, default: 64 },
	/** Accept input */
	interactive: { type: Boolean, default: false },
	/** 'w' | 'b' | 'both' | null */
	movableColor: { type: String, default: null },
	/** {move, key} of the last move; key 'miss' draws the dashed "attempted" outline */
	lastMove: { type: Object, default: null },
	/** Earlier states of the game (stable identity colours) */
	history: { type: Array, default: () => [] },
	/** Arrows [{from, to, kind, dashed?}] */
	arrows: { type: Array, default: () => [] },
	/** Highlights [{square, kind: hint | lesson | danger}] */
	highlights: { type: Array, default: () => [] },
	/** Coach crosshairs [{square, kind: threat | opportunity, pct}] */
	markers: { type: Array, default: () => [] },
	/** Read-only view {state, kind, label} with an in-board banner */
	preview: { type: Object, default: null },
	/** Names {w, b} for result sentences */
	names: { type: Object, default: null },
	/** Register the board's hot keys (1–4, E, W, D) */
	hotkeys: { type: Boolean, default: false },
	/** Tag result chips "Lesson roll" */
	lessonRoll: { type: Boolean, default: false },
})

const emit = defineEmits(['move', 'select', 'illegal', 'previewClose'])

const RING_R = 0.62
const RING_C = 2 * Math.PI * RING_R
const uid = 'qcb' + Math.random().toString(36).slice(2, 8)

const frame = ref(null)
const travellerEl = ref(null)
const cellEls = []
const isDark = useIsDarkTheme()
const hasFocus = ref(false)
const announcement = ref('')

// --- Animator -------------------------------------------------------------------------------------------------------

const anim = createAnimator({
	speed: () => boardPrefs.speedFactor,
	sound: (name) => sound(name),
	suspense: () => (boardPrefs.sound ? startSuspense({ speed: boardPrefs.animationSpeedEffective }) : () => {}),
	describe,
	announce,
})

const shown = computed(() => toRaw(anim.state.display ?? props.preview?.state ?? props.state))
const S = computed(() => props.squareSize)

watch(() => props.state, () => {
	if (!anim.state.busy) {
		anim.state.display = null
	}
})

// --- Input ----------------------------------------------------------------------------------------------------------

const canPlay = computed(() => props.interactive && !props.preview && props.state.result === null)
const internalInput = props.input
	? null
	: useBoardInput({
			state: () => props.state,
			legalMoves: () => props.legalMoves,
			movableColor: () => props.movableColor,
			interactive: () => canPlay.value && !anim.state.busy,
		})
const input = computed(() => props.input ?? internalInput)

const unsubscribe = input.value.onCommit((move) => emit('move', move))
onBeforeUnmount(() => {
	unsubscribe()
	anim.dispose()
})

watch(() => input.value.selection, (s) => emit('select', s))

// --- Theme, sizes, preferences --------------------------------------------------------------------------------------

const theme = computed(() => resolveBoardTheme(boardPrefs.boardTheme, { highContrast: isHighContrast() }))
const ringWidth = computed(() => Math.max(2 / S.value, 0.055))
const rootClasses = computed(() => ({
	'qc-board--dark': isDark.value,
	'qc-board--interactive': canPlay.value,
	'qc-board--reduced': reducedMotion.value || boardPrefs.speedFactor === 0,
	'qc-board--whatif': input.value.whatIf !== null,
	'qc-board--busy': anim.state.busy,
	'qc-board--small': S.value < 44,
}))
const rootStyle = computed(() => ({
	'--S': S.value + 'px',
	'--qc-speed': boardPrefs.speedFactor,
	width: 8 * S.value + 'px',
	height: 8 * S.value + 'px',
}))

watch(() => [boardPrefs.sound, boardPrefs.volume], ([enabled, volume]) => configureSound({ enabled, volume }), { immediate: true })

/**
 * Play a sound effect with the current speed.
 *
 * @param {string} name sound name
 */
function sound(name) {
	if (boardPrefs.sound) {
		playSound(name, { speed: boardPrefs.animationSpeedEffective })
	}
}

/**
 * Say something in the live region.
 *
 * @param {string} text text
 */
function announce(text) {
	announcement.value = ''
	nextTick(() => {
		announcement.value = text
	})
}

// --- Geometry helpers -----------------------------------------------------------------------------------------------

const rows = computed(() => displayRows(props.orientation).map((row) => row.map((square) => cellOf(square))))

/**
 * Board-unit centre of a square.
 *
 * @param {number} square square
 * @return {{x: number, y: number}}
 */
function centre(square) {
	return squareCentre(square, props.orientation)
}

/**
 * An inset rectangle of a square in board units.
 *
 * @param {number} square square
 * @param {number} inset inset
 * @return {object}
 */
function rectOf(square, inset) {
	const { col, row } = squareXY(square, props.orientation)
	return { x: col + inset, y: row + inset, width: 1 - 2 * inset, height: 1 - 2 * inset, rx: 0.06 }
}

/**
 * Pixel position of a square's top-left corner.
 *
 * @param {number} square square
 * @return {{x: number, y: number}}
 */
function pixelOf(square) {
	const { col, row } = squareXY(square, props.orientation)
	return { x: col * S.value, y: row * S.value }
}

/**
 * The square under a pointer event, or null outside the board.
 *
 * @param {PointerEvent} e event
 * @return {number|null}
 */
function squareFromEvent(e) {
	const rect = frame.value.getBoundingClientRect()
	const x = e.clientX - rect.left
	const y = e.clientY - rect.top
	if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) {
		return null
	}
	const col = Math.min(7, Math.floor(x / (rect.width / 8)))
	const row = Math.min(7, Math.floor(y / (rect.height / 8)))
	return squareAt(col, row, props.orientation)
}

// --- Derived display data -------------------------------------------------------------------------------------------

const identity = computed(() => {
	const states = [...props.history.map((s) => toRaw(s)), shown.value]
	try {
		return identityColours(states)
	} catch {
		return identityColours(shown.value)
	}
})

const pointerSquare = ref(null)
const focusSquare = ref(defaultFocus())
const drag = shallowRef(null)
const returning = ref(null)
const shaking = ref(null)

/**
 * The first focused square: the king of the side at the bottom.
 *
 * @return {number}
 */
function defaultFocus() {
	const locs = viewsOf(toRaw(props.state)).locs[props.orientation === 'w' ? 0 : 16]
	return locs.length > 0 ? locs[0].square : squareAt(4, 7, props.orientation)
}

const items = computed(() => pieceItems(shown.value, { whatIf: anim.state.busy ? null : input.value.whatIf, identity: identity.value }))

/** The ghost whose parts get outlines and threads: dragged, selected, hovered or focused. */
const focusPiece = computed(() => {
	if (anim.state.busy) {
		return null
	}
	const { view } = viewsOf(shown.value)
	const candidates = [drag.value?.from, input.value.selection, input.value.whatIf, pointerSquare.value, hasFocus.value ? focusSquare.value : null]
	for (const s of candidates) {
		if (s !== null && s !== undefined && view[s] !== null) {
			return { square: s, piece: view[s].piece }
		}
	}
	return null
})

const pieces = computed(() => {
	const f = focusPiece.value
	const forced = f !== null && !boardPrefs.showPercentages
	return items.value.map((p) => {
		const px = pixelOf(p.square)
		const dragging = drag.value?.dragging && drag.value.key === p.key
		const transform = dragging
			? `translate(${drag.value.x - S.value / 2}px, ${drag.value.y - S.value / 2 - (drag.value.touch ? S.value / 2 : 0)}px) scale(1.1)`
			: `translate(${px.x}px, ${px.y}px)`
		const solidStyle = boardPrefs.ghostStyle === 'solid'
		let opacity = solidStyle ? 1 : ghostOpacity(p.probability)
		if (p.impossible) {
			opacity = 0.1
		}
		const ringP = p.chosen ? 1 : (p.ghost && !p.impossible ? p.probability : 0)
		return {
			...p,
			symbol: pieceSymbolId(boardPrefs.pieceSet, p.color, p.type),
			opacity,
			ring: ringP > 0 ? arcPath(ringP, 0.44) : '',
			forcedBadge: forced && f.piece === p.piece,
			style: { transform, zIndex: dragging ? 30 : undefined },
			classes: {
				'qc-piece--dragging': dragging,
				'qc-piece--return': returning.value === p.key,
				'qc-piece--shake': shaking.value === p.square,
				'qc-piece--pop': anim.state.pops.includes(p.key),
				'qc-piece--source': anim.state.sourceDim !== null && anim.state.sourceDim.piece === p.piece && anim.state.sourceDim.squares.includes(p.square),
				'qc-piece--hover': canPlay.value && pointerSquare.value === p.square && drag.value === null && input.value.isMovablePiece(p.square),
				'qc-piece--ghost': p.ghost,
				'qc-piece--crossfade': anim.state.crossfade,
			},
		}
	})
})

const kings = computed(() => {
	if (anim.state.busy) {
		return []
	}
	const both = boardPrefs.kingDangerBoth || props.movableColor === 'both' || props.movableColor === null
	const colors = both ? ['w', 'b'] : [props.movableColor]
	return kingRings(shown.value, colors)
})

const badges = computed(() => {
	const out = []
	const fontPx = Math.min(12, Math.max(10, Math.round(0.2 * S.value)))
	for (const p of pieces.value) {
		if (!(p.ghost && !p.impossible) && !p.chosen) {
			continue
		}
		if (!boardPrefs.showPercentages && !p.forcedBadge) {
			continue
		}
		const px = pixelOf(p.square)
		out.push({
			key: p.key,
			text: formatProbability(p.chosen ? T : p.weight, { format: boardPrefs.probabilityFormat, weight: true }),
			dot: p.idColour,
			classes: { 'qc-badge--chosen': p.chosen },
			style: { left: px.x + S.value - 2 + 'px', top: px.y + 2 + 'px', fontSize: fontPx + 'px' },
		})
	}
	for (const k of kings.value) {
		const px = pixelOf(k.square)
		out.push({
			key: 'king' + k.color,
			text: formatProbability(k.weight, { weight: true }),
			dot: null,
			classes: { 'qc-badge--king': true, 'qc-badge--danger': k.certain },
			style: { left: px.x + S.value - 2 + 'px', top: px.y + 2 + 'px', fontSize: fontPx + 'px' },
		})
	}
	return out
})

/** Coach markers by square (their explanation goes into the square's label and tooltip). */
const markerBySquare = computed(() => new Map(props.markers.map((m) => [m.square, m])))

/** The percentage of each coach marker, at the bottom-left corner of its square above the pieces. */
const coachLabels = computed(() => props.markers.filter((m) => Number.isFinite(m.pct)).map((m) => {
	const px = pixelOf(m.square)
	return {
		square: m.square,
		kind: m.kind,
		text: formatPercentNumber(m.pct),
		style: { left: px.x + 2 + 'px', top: px.y + S.value - 2 + 'px', fontSize: Math.min(12, Math.max(10, Math.round(0.2 * S.value))) + 'px' },
	}
}))

const whatIfChanged = computed(() => items.value.filter((p) => p.delta !== null && !p.chosen))
const deltas = computed(() => whatIfChanged.value.map((p) => {
	const px = pixelOf(p.square)
	return {
		square: p.square,
		up: p.delta.up,
		text: (p.delta.up ? '▲ ' : '▼ ') + formatProbability(p.delta.percent / 100),
		style: { left: px.x + S.value / 2 + 'px', top: px.y + S.value - 3 + 'px' },
	}
}))

const thread = computed(() => {
	const f = focusPiece.value
	const out = { outlines: [], paths: [] }
	if (f === null) {
		return out
	}
	const parts = viewsOf(shown.value).locs[f.piece].map((l) => l.square)
	if (parts.length < 2) {
		return out
	}
	const a = centre(f.square)
	for (const s of parts) {
		if (s === f.square) {
			continue
		}
		out.outlines.push(s)
		const b = centre(s)
		const mx = (a.x + b.x) / 2
		const my = (a.y + b.y) / 2
		const dx = b.x - a.x
		const dy = b.y - a.y
		const len = Math.hypot(dx, dy) || 1
		const bend = Math.min(0.9, len * 0.25)
		out.paths.push(`M ${a.x} ${a.y} Q ${mx - (dy / len) * bend} ${my + (dx / len) * bend} ${b.x} ${b.y}`)
	}
	return out
})

const linkGlyphs = computed(() => {
	const f = focusPiece.value
	if (f === null) {
		return []
	}
	const { links, locs } = viewsOf(shown.value)
	const linked = new Set()
	for (const [x, y] of links) {
		if (x === f.piece) {
			linked.add(y)
		} else if (y === f.piece) {
			linked.add(x)
		}
	}
	const out = []
	for (const id of linked) {
		for (const l of locs[id]) {
			const px = pixelOf(l.square)
			out.push({ square: l.square, style: { left: px.x + 2 + 'px', top: px.y + S.value - 18 + 'px' } })
		}
	}
	return out
})

const linkChords = computed(() => {
	if (boardPrefs.linkThreads !== 'always' || anim.state.busy) {
		return []
	}
	const { links, locs } = viewsOf(shown.value)
	const best = (id) => locs[id].slice().sort((x, y) => y.weight - x.weight)[0]?.square
	return links.map(([x, y]) => {
		const a = centre(best(x))
		const b = centre(best(y))
		return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
	})
})

const lastSquares = computed(() => (boardPrefs.highlightLastMove && !props.preview ? lastMoveSquares(props.lastMove) : { fill: [], dashed: [] }))

const targets = computed(() => (boardPrefs.showLegalMoves || input.value.mode !== 'move' ? input.value.targets : []))

/**
 * Four corner triangles of a square in board units.
 *
 * @param {number} x centre x
 * @param {number} y centre y
 * @return {string[]}
 */
function corners(x, y) {
	const h = 0.5
	const k = 0.24
	return [
		[[x - h, y - h], [x - h + k, y - h], [x - h, y - h + k]],
		[[x + h, y - h], [x + h - k, y - h], [x + h, y - h + k]],
		[[x - h, y + h], [x - h + k, y + h], [x - h, y + h - k]],
		[[x + h, y + h], [x + h - k, y + h], [x + h, y + h - k]],
	].map((tri) => tri.map((p) => p.join(',')).join(' '))
}

const targetMarks = computed(() => {
	const hovered = input.value.hovered
	const shownState = shown.value
	return targets.value.map((tg) => {
		const { x, y } = centre(tg.square)
		const hover = hovered === tg.square
		const mk = {
			square: tg.square,
			kind: tg.kind,
			x,
			y,
			hover,
			transform: hover ? `translate(${x} ${y}) scale(1.15) translate(${-x} ${-y})` : undefined,
		}
		if (tg.kind === 'roll-capture' || tg.kind === 'certain-capture' || tg.kind === 'converging' || tg.kind === 'converging-roll') {
			mk.corners = corners(x, y)
		}
		if (tg.kind === 'roll-capture' || tg.kind === 'converging-roll') {
			mk.px = x + 0.3
			mk.py = y + 0.3
			mk.pie = piePath(tg.pCapture ?? 0, 0.13, mk.px, mk.py)
		}
		if (tg.kind === 'split-chosen') {
			const sel = input.value.selection
			const v = sel === null ? null : viewsOf(shownState).view[sel]
			mk.symbol = v ? pieceSymbolId(boardPrefs.pieceSet, v.color, v.type) : ''
			mk.half = `M ${x} ${y - 0.2} A 0.2 0.2 0 0 1 ${x} ${y + 0.2} Z`
		}
		return mk
	})
})

const trapArrow = computed(() => {
	const st = shown.value
	if (anim.state.busy || st.result?.reason !== 'king_trapped') {
		return null
	}
	const threat = kingCaptureThreat(st)
	return threat ? { from: threat.from[0], to: threat.to, kind: 'forced', dashed: true } : null
})

const pies = computed(() => targetMarks.value.filter((mk) => mk.pie))

const arrowShapes = computed(() => {
	const list = [...props.arrows]
	if (anim.state.reveal) {
		list.push({ ...anim.state.reveal, kind: 'reveal', dashed: true })
	}
	if (trapArrow.value) {
		list.push(trapArrow.value)
	}
	return list.map((a) => {
		const from = centre(Array.isArray(a.from) ? a.from[0] : a.from)
		const to = centre(Array.isArray(a.to) ? a.to[0] : a.to)
		const dx = to.x - from.x
		const dy = to.y - from.y
		const len = Math.hypot(dx, dy) || 1
		const ux = dx / len
		const uy = dy / len
		const tipX = to.x - ux * 0.12
		const tipY = to.y - uy * 0.12
		const baseX = tipX - ux * 0.36
		const baseY = tipY - uy * 0.36
		const w = 0.22
		return {
			kind: a.kind ?? 'hint',
			dashed: Boolean(a.dashed),
			x1: from.x + ux * 0.18,
			y1: from.y + uy * 0.18,
			x2: baseX + ux * 0.02,
			y2: baseY + uy * 0.02,
			head: `${tipX},${tipY} ${baseX - uy * w},${baseY + ux * w} ${baseX + uy * w},${baseY - ux * w}`,
		}
	})
})

const ring = computed(() => {
	const r = anim.state.ring
	if (!r) {
		return null
	}
	const { x, y } = centre(r.square)
	return {
		x,
		y,
		settled: r.settled,
		segments: r.segments.map((seg, i) => {
			const chosen = r.settled === seg.key
			const len = chosen ? RING_C : Math.max(0, seg.length * RING_C - 0.04)
			return {
				...seg,
				style: {
					strokeDasharray: `${len} ${RING_C}`,
					strokeDashoffset: chosen ? 0 : -seg.start * RING_C,
					animationDelay: i * 200 + 'ms',
				},
			}
		}),
	}
})

const traveller = computed(() => {
	const tr = anim.state.travel
	if (!tr) {
		return null
	}
	const px = pixelOf(tr.to)
	return {
		...tr,
		symbol: pieceSymbolId(boardPrefs.pieceSet, tr.color, tr.type),
		style: { transform: `translate(${px.x}px, ${px.y - 2}px)` },
	}
})

watch(() => anim.state.travel, async (tr) => {
	if (!tr) {
		return
	}
	await nextTick()
	const el = travellerEl.value
	if (el?.animate) {
		const a = pixelOf(tr.from)
		const b = pixelOf(tr.to)
		el.animate([
			{ transform: `translate(${a.x}px, ${a.y}px)`, opacity: 1 },
			{ transform: `translate(${b.x}px, ${b.y - 2}px)`, opacity: 0.55 },
		], { duration: tr.duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
	}
})

const chip = computed(() => anim.state.chip)

// --- Squares (layer 0) ----------------------------------------------------------------------------------------------

const highlightBySquare = computed(() => {
	const m = new Map()
	for (const h of props.highlights) {
		m.set(h.square, h.kind ?? 'hint')
	}
	return m
})

const targetBySquare = computed(() => {
	const m = new Map()
	for (const tg of targets.value) {
		m.set(tg.square, tg)
	}
	return m
})

/**
 * The accessible description of a target.
 *
 * @param {object} tg target descriptor
 * @return {string}
 */
function targetText(tg) {
	if (tg.disabled) {
		return tg.reason ?? ''
	}
	if (tg.move) {
		return resolutionText(resolutionLabel(tg.move), { physics: boardPrefs.physicsNames })
	}
	return tg.kind === 'merge-part' ? t('quantumchess', 'merge') : t('quantumchess', 'target')
}

/**
 * Display data of one square cell.
 *
 * @param {number} square square
 * @return {object}
 */
function cellOf(square) {
	const { col, row } = squareXY(square, props.orientation)
	const light = isLightSquare(square)
	const coords = boardPrefs.coordinates
	const name = squareName(square)
	const tg = targetBySquare.value.get(square)
	const inWhatIf = input.value.whatIf !== null && !anim.state.busy
	const item = inWhatIf ? items.value.find((p) => p.square === square) : null
	let label = squareLabel(shown.value, square)
	if (tg) {
		label += ', ' + targetText(tg)
	}
	const marker = markerBySquare.value.get(square)
	if (marker?.text) {
		label += '. ' + marker.text
	}
	return {
		square,
		label,
		selected: input.value.selection === square || input.value.mergeSources.includes(square),
		title: tg?.disabled ? tg.reason : marker?.text,
		rank: coords !== 'off' && coords !== 'all' && col === 0 ? name[1] : '',
		file: coords !== 'off' && coords !== 'all' && row === 7 ? name[0] : '',
		name: coords === 'all' ? name : '',
		classes: {
			'qc-sq--light': light,
			'qc-sq--dark': !light,
			'qc-sq--last': lastSquares.value.fill.includes(square),
			'qc-sq--selected': input.value.selection === square || input.value.mergeSources.includes(square),
			'qc-sq--dragover': drag.value?.dragging && drag.value.over === square,
			'qc-sq--dim': inWhatIf && (item === undefined || item === null || (item.delta === null && !item.chosen)),
			['qc-sq--hl-' + highlightBySquare.value.get(square)]: highlightBySquare.value.has(square),
		},
	}
}

// --- Floating UI ----------------------------------------------------------------------------------------------------

const cardDelayPassed = ref(false)
const keyboardPreview = ref(false)
let cardTimer = null
watch(() => input.value.hovered, () => {
	cardDelayPassed.value = false
	clearTimeout(cardTimer)
	cardTimer = setTimeout(() => {
		cardDelayPassed.value = true
	}, 250)
})

const card = computed(() => {
	const info = input.value.previewInfo
	if (!info || anim.state.busy || coarsePointer.value || S.value < 44 || drag.value?.dragging || input.value.promotion) {
		return null
	}
	const i = input.value
	const anchor = i.pending ? info.move.to[info.move.to.length - 1] ?? info.move.from[0] : (i.hovered ?? i.selection)
	if (anchor === null || anchor === undefined) {
		return null
	}
	if (!i.pending && i.mode !== 'measure' && !cardDelayPassed.value && !keyboardPreview.value) {
		return null
	}
	const { col, row } = squareXY(anchor, props.orientation)
	const width = Math.min(290, 8 * S.value - 8)
	const left = Math.max(4, Math.min(8 * S.value - width - 4, col * S.value + S.value / 2 - width / 2))
	const style = { left: left + 'px', width: width + 'px' }
	if (row >= 3) {
		style.bottom = (8 - row) * S.value + 6 + 'px'
	} else {
		style.top = (row + 1) * S.value + 6 + 'px'
	}
	return { info, style }
})

const tooltip = ref(null)
let tooltipTimer = null
watch(() => input.value.feedback, (fb) => {
	if (!fb) {
		return
	}
	emit('illegal', { code: fb.code, square: fb.square })
	sound('illegal')
	const sq = fb.square ?? input.value.selection
	if (sq === null || sq === undefined) {
		return
	}
	const px = pixelOf(sq)
	const width = Math.min(240, 8 * S.value - 8)
	const left = Math.max(4, Math.min(8 * S.value - width - 4, px.x + S.value / 2 - width / 2))
	tooltip.value = {
		text: fb.text,
		style: { left: left + 'px', width: width + 'px', ...(px.y >= 2 * S.value ? { bottom: 8 * S.value - px.y + 4 + 'px' } : { top: px.y + S.value + 4 + 'px' }) },
	}
	clearTimeout(tooltipTimer)
	tooltipTimer = setTimeout(() => {
		tooltip.value = null
	}, 2000)
})

const banner = computed(() => {
	const w = input.value.whatIf
	if (w !== null && !anim.state.busy) {
		const v = viewsOf(shown.value).view[w]
		if (v) {
			return {
				text: t('quantumchess', 'If {piece} is on {square} ({p})… · Tab: other part · Esc', {
					piece: figurine(v.type, v.color),
					square: squareName(w),
					p: formatProbability(v.weight, { format: boardPrefs.probabilityFormat, weight: true }),
				}, undefined, TEXT),
				close: () => input.value.setWhatIf(null),
			}
		}
	}
	if (props.preview) {
		return { text: props.preview.label ?? '', close: () => emit('previewClose') }
	}
	return null
})

// --- Pointer input --------------------------------------------------------------------------------------------------

let press = null
let altWhatIf = false

/**
 * @param {PointerEvent} e event
 */
function onPointerDown(e) {
	unlockAudio()
	if (e.button !== undefined && e.button !== 0) {
		return
	}
	if (anim.state.busy) {
		anim.finish()
		return
	}
	const square = squareFromEvent(e)
	if (square === null) {
		return
	}
	const draggable = boardPrefs.inputMode !== 'click' && input.value.isMovablePiece(square)
	press = { square, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', draggable, shift: e.shiftKey }
	if (draggable) {
		frame.value.setPointerCapture?.(e.pointerId)
	}
}

/**
 * @param {PointerEvent} e event
 */
function onPointerMove(e) {
	const square = squareFromEvent(e)
	if (press && press.draggable) {
		const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y)
		if (drag.value === null && dist > (press.touch ? 8 : 4)) {
			if (input.value.selection !== press.square) {
				input.value.select(press.square)
			}
			const item = items.value.find((p) => p.square === press.square)
			drag.value = { from: press.square, key: item?.key, dragging: true, touch: press.touch, x: 0, y: 0, over: null }
		}
		if (drag.value) {
			const rect = frame.value.getBoundingClientRect()
			drag.value = { ...drag.value, x: e.clientX - rect.left, y: e.clientY - rect.top, over: square }
			input.value.hover(square)
			keyboardPreview.value = false
			return
		}
	}
	if (pointerSquare.value !== square) {
		pointerSquare.value = square
		if (!press && square !== null) {
			input.value.hover(square)
			keyboardPreview.value = false
		}
	}
	if (e.altKey && square !== null && input.value.isGhostPart(square)) {
		if (input.value.whatIf !== square) {
			input.value.setWhatIf(square)
		}
		altWhatIf = true
	} else if (altWhatIf && !e.altKey) {
		altWhatIf = false
		input.value.setWhatIf(null)
	}
}

/**
 * @param {PointerEvent} e event
 */
function onPointerUp(e) {
	const p = press
	press = null
	if (!p) {
		return
	}
	const square = squareFromEvent(e)
	if (drag.value) {
		const d = drag.value
		drag.value = null
		const result = square === null ? 'illegal' : input.value.drop(d.from, square)
		if (result === 'illegal' || result === 'none') {
			springBack(d.key, d.from)
		}
		return
	}
	if (square === null || boardPrefs.inputMode === 'drag') {
		if (square !== null && !input.value.isMovablePiece(square) && input.value.selection !== null) {
			input.value.clearSelection()
		}
		return
	}
	activate(square, { shift: p.shift })
}

/** Pointer cancelled: drop the drag. */
function onPointerCancel() {
	if (drag.value) {
		springBack(drag.value.key, drag.value.from)
	}
	drag.value = null
	press = null
}

/** The pointer left the board. */
function onPointerLeave() {
	if (!press) {
		pointerSquare.value = null
		if (!keyboardPreview.value) {
			input.value.hover(null)
		}
	}
	if (altWhatIf) {
		altWhatIf = false
		input.value.setWhatIf(null)
	}
}

/**
 * Animate a dragged piece back to its square with a small shake.
 *
 * @param {string} key piece key
 * @param {number} square its square
 */
function springBack(key, square) {
	returning.value = key
	shaking.value = square
	setTimeout(() => {
		returning.value = null
		shaking.value = null
	}, 320)
}

/**
 * Activate a square (click, tap, Enter).
 *
 * @param {number} square square
 * @param {object} [options] options
 * @param {boolean} [options.shift] Shift held
 */
function activate(square, { shift = false } = {}) {
	const result = input.value.activate(square, { shift })
	if (result === 'select' || result === 'split-first' || result === 'merge') {
		sound('select')
	}
}

// --- Keyboard -------------------------------------------------------------------------------------------------------

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

/**
 * @param {KeyboardEvent} e event
 */
function onKeydown(e) {
	unlockAudio()
	if (anim.state.busy && !['Tab', 'Shift'].includes(e.key)) {
		anim.finish()
	}
	if (ARROWS.includes(e.key)) {
		e.preventDefault()
		moveFocus(stepSquare(focusSquare.value, e.key, props.orientation))
		return
	}
	if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault()
		activate(focusSquare.value)
		return
	}
	if (e.key === 'Escape') {
		if (input.value.cancel() !== null) {
			e.preventDefault()
			e.stopPropagation()
		}
		return
	}
	if (e.key === 'Tab' && input.value.whatIf !== null) {
		e.preventDefault()
		const s = input.value.cycleWhatIf(e.shiftKey ? -1 : 1)
		if (s !== null) {
			moveFocus(s)
		}
		return
	}
	if (props.hotkeys || e.ctrlKey || e.metaKey || e.altKey) {
		return
	}
	if (handleLetter(e.key)) {
		e.preventDefault()
	}
}

/**
 * The board's letter and number keys (1–4, E, W, D).
 *
 * @param {string} key the key
 * @return {boolean} handled
 */
function handleLetter(key) {
	const k = key.toLowerCase()
	if (['1', '2', '3', '4'].includes(k)) {
		input.value.setMode(MODES[Number(k) - 1])
		return true
	}
	if (k === 'e') {
		if (input.value.whatIf !== null) {
			input.value.setWhatIf(null)
		} else {
			const s = [focusSquare.value, input.value.selection].find((x) => x !== null && input.value.isGhostPart(x))
			input.value.setWhatIf(s ?? null)
		}
		return true
	}
	if (k === 'w') {
		input.value.togglePanel()
		return true
	}
	if (k === 'd') {
		announce(describePosition(shown.value, { orientation: props.orientation }))
		return true
	}
	return false
}

useHotKey(['1', '2', '3', '4', 'e', 'w', 'd'], (e) => {
	if (props.hotkeys) {
		handleLetter(e.key)
	}
})

/**
 * Move the roving focus.
 *
 * @param {number} square new focus square
 */
function moveFocus(square) {
	focusSquare.value = square
	keyboardPreview.value = true
	input.value.hover(square)
	cellEls[square]?.focus()
}

/**
 * A cell got focus (Tab into the board or a click).
 *
 * @param {number} square square
 */
function onCellFocus(square) {
	focusSquare.value = square
}

/**
 * @param {FocusEvent} e event
 */
function onFocusOut(e) {
	if (!e.relatedTarget || !frame.value?.contains(e.relatedTarget)) {
		hasFocus.value = false
		keyboardPreview.value = false
	}
}

/** Cancel the promotion and give the focus back to the board. */
function onPromotionCancel() {
	input.value.choosePromotion(null)
	cellEls[focusSquare.value]?.focus()
}

// --- Piece enter / leave animations ---------------------------------------------------------------------------------

/**
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
		const from = pixelOf(origin)
		a = el.animate([{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: el.style.transform }], { duration: d, easing: 'cubic-bezier(.2,.8,.2,1)' })
	} else {
		a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(d, 200), easing: 'ease-out' })
	}
	a.onfinish = done
	a.oncancel = done
}

/**
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

// --- Animator hooks -------------------------------------------------------------------------------------------------

/**
 * Chip, reveal arrow and speech of a move event.
 *
 * @param {object} event MoveEvent
 * @return {{chip: object|null, reveal: object|null, speech: string}}
 */
function describe(event) {
	const before = toRaw(event.before)
	const after = toRaw(event.after)
	const moverColor = event.move.piece < 16 ? 'w' : 'b'
	const other = moverColor === 'w' ? 'b' : 'w'
	const pov = event.actor === 'opponent' ? 'opponent' : 'mover'
	const names = event.names ?? (props.names ? { mover: props.names[moverColor], opponent: props.names[other] } : {})
	const measurement = event.measurement ?? null
	let chip = null
	if (measurement) {
		const s = resultSentence({ before, move: event.move, measurement, pov, names, format: boardPrefs.probabilityFormat })
		chip = s ? { ...s, lessonRoll: Boolean(event.lessonRoll || props.lessonRoll) } : null
	}
	return {
		chip,
		reveal: revealArrow(before, event.move, measurement),
		speech: moveSentence({ before, after, move: event.move, measurement, pov, names }),
	}
}

let dangerSeen = null
watch(() => props.state, (st) => {
	const own = props.movableColor === 'w' || props.movableColor === 'b' ? props.movableColor : null
	const raw = toRaw(st)
	if (own === null || raw.turn !== own || raw.result !== null) {
		return
	}
	if (kingDanger(raw, own) >= T && dangerSeen !== raw) {
		dangerSeen = raw
		sound('kingDanger')
	}
})

let visibilityHandler = null
const tabHidden = ref(false)
onMounted(() => {
	visibilityHandler = () => {
		tabHidden.value = document.hidden
	}
	document.addEventListener('visibilitychange', visibilityHandler)
})
onBeforeUnmount(() => {
	document.removeEventListener('visibilitychange', visibilityHandler)
	clearTimeout(cardTimer)
	clearTimeout(tooltipTimer)
})
watch(tabHidden, (hidden) => frame.value?.classList.toggle('qc-board--paused', hidden))

defineExpose({
	/**
	 * Animator: play a move event (SPEC §14.4.2); resolves at the end of the Collapse phase.
	 *
	 * @param {object} event MoveEvent
	 * @return {Promise<void>}
	 */
	play: (event) => anim.play(event),
	/**
	 * Animator: start an online roll; resolve it with the server's result.
	 *
	 * @param {object} input {before, move, actor}
	 * @return {object} RollHandle
	 */
	startRoll: (input) => anim.startRoll(input),
	/** Animator: fast-forward. */
	finish: () => anim.finish(),
	/** Focus the board (the roving focus square). */
	focus: () => cellEls[focusSquare.value]?.focus(),
	/** The input controller in use. */
	input,
})
</script>

<style lang="scss" scoped>
.qc-board {
	position: relative;
	flex: none;
	user-select: none;
	-webkit-user-select: none;
	touch-action: none;
	-webkit-tap-highlight-color: transparent;
}

.qc-board__frame {
	position: relative;
	width: 100%;
	height: 100%;
	border-radius: var(--border-radius-small, 4px);
	box-shadow: 0 0 0 1px var(--qc-board-frame);
}

.qc-board--interactive .qc-board__frame {
	cursor: pointer;
}

// Layer 0: squares
.qc-board__grid {
	position: absolute;
	inset: 0;
	display: grid;
	grid-template-rows: repeat(8, 1fr);
	border-radius: inherit;
	overflow: hidden;
}

.qc-board--dark .qc-board__grid {
	filter: brightness(0.86) saturate(0.9);
}

.qc-board__row {
	display: grid;
	grid-template-columns: repeat(8, 1fr);
}

.qc-sq {
	position: relative;
	outline: none;
	box-shadow: inset 0 0 0 0.5px var(--qc-square-border);

	&--light {
		background: var(--qc-sq-light);
		color: var(--qc-sq-light-text);
	}

	&--dark {
		background: var(--qc-sq-dark);
		color: var(--qc-sq-dark-text);
	}

	&--last::before,
	&--selected::before,
	&--hl-hint::before,
	&--hl-lesson::before,
	&--hl-danger::before {
		content: '';
		position: absolute;
		inset: 0;
	}

	&--last::before {
		background: var(--qc-last-move);
	}

	&--selected::before {
		background: var(--qc-select);
	}

	&--hl-hint::before,
	&--hl-lesson::before {
		box-shadow: inset 0 0 0 3px var(--color-primary-element);
		background: color-mix(in srgb, var(--color-primary-element) 18%, transparent);
	}

	&--hl-danger::before {
		box-shadow: inset 0 0 0 3px var(--qc-ring-danger);
	}

	&--dragover {
		box-shadow: inset 0 0 0 3px rgb(255 255 255 / 0.9);
	}

	&--dim::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgb(20 20 30 / 0.3);
	}

	&:focus-visible {
		box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 5px #111;
	}
}

.qc-sq__rank,
.qc-sq__file,
.qc-sq__name {
	position: absolute;
	font-size: clamp(9px, calc(var(--S) * 0.2), 13px);
	font-weight: 600;
	line-height: 1;
	pointer-events: none;
}

.qc-sq__rank {
	top: 3px;
	left: 3px;
}

.qc-sq__file {
	right: 3px;
	bottom: 2px;
}

.qc-sq__name {
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0.3;
}

// Layers 1 and 4: SVG overlays
.qc-board__markers,
.qc-board__fx {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	overflow: visible;
}

.qc-board__fx {
	z-index: 3;
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

.qc-mk-pie-bg {
	fill: rgb(255 255 255 / 0.7);
	stroke: var(--qc-target-rim);
	stroke-width: 0.02;
}

.qc-mk-pie {
	fill: var(--qc-success);
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

// Layer 2: pieces
.qc-board__pieces {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 2;
}

.qc-piece {
	position: absolute;
	top: 0;
	left: 0;
	width: var(--S);
	height: var(--S);
	will-change: transform;

	&--return {
		transition: transform 200ms var(--qc-ease-out);
	}

	&--dragging {
		filter: drop-shadow(0 6px 6px rgb(0 0 0 / 0.35));
	}

	&--source {
		opacity: 0.35;
	}

	&--traveller {
		z-index: 4;
		opacity: 0.55;
		pointer-events: none;
	}

	&--crossfade {
		transition: opacity 150ms ease;
	}
}

.qc-piece__svg {
	display: block;
	width: 100%;
	height: 100%;
	overflow: visible;
	transition: transform 120ms var(--qc-ease-out), filter 120ms ease;
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
.qc-board--reduced .qc-mk-thread,
.qc-board__frame.qc-board--paused .qc-piece__glow {
	animation: none;
}

// Layer 3: badges
.qc-coach-pct {
	position: absolute;
	transform: translateY(-100%);
	padding: 0 4px;
	border-radius: var(--border-radius-pill, 999px);
	background: var(--qc-ring-danger);
	color: #fff;
	font-weight: 700;
	line-height: 1.3;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	&--opportunity {
		background: var(--color-primary-element);
		color: var(--color-primary-element-text);
	}
}

.qc-board__badges {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 3;
}

.qc-badge {
	position: absolute;
	transform: translateX(-100%);
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 4px;
	border-radius: var(--border-radius-pill, 999px);
	background: rgb(255 255 255 / 0.92);
	border: 1px solid var(--qc-board-ring);
	color: #111;
	font-weight: 700;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	&--king {
		border-color: var(--qc-ring-warning);
	}

	&--danger {
		border-color: var(--qc-ring-danger);
		background: var(--qc-ring-danger);
		color: #fff;
	}

	&--chosen {
		background: var(--qc-board-ring);
		color: #fff;
	}
}

.qc-badge__dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
}

.qc-delta {
	position: absolute;
	transform: translate(-50%, -100%);
	padding: 0 4px;
	border-radius: var(--border-radius-pill, 999px);
	background: #fff;
	font-size: 11px;
	font-weight: 700;
	white-space: nowrap;

	&--up {
		color: var(--qc-corr-up);
		box-shadow: 0 0 0 1px var(--qc-corr-up);
	}

	&--down {
		color: var(--qc-corr-down);
		box-shadow: 0 0 0 1px var(--qc-corr-down);
	}
}

.qc-link-glyph {
	position: absolute;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 0 0 1px var(--qc-board-ring);

	path {
		fill: var(--qc-board-ring);
	}
}

// Layer 4: arrows and the outcome ring
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
	transition: stroke-dasharray calc(200ms * var(--qc-speed)) var(--qc-ease-io), stroke-dashoffset calc(200ms * var(--qc-speed)) var(--qc-ease-io), opacity calc(200ms * var(--qc-speed)) ease;
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

// Layer 5: floating UI
.qc-board__banner {
	position: absolute;
	top: 6px;
	left: 6px;
	right: 6px;
	width: max-content;
	margin-inline: auto;
	z-index: 6;
	display: flex;
	align-items: center;
	gap: 4px;
	max-width: calc(100% - 12px);
	padding: 2px 4px 2px 12px;
	border-radius: var(--border-radius-pill, 999px);
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
	font-size: 14px;
}

.qc-board__chip {
	position: absolute;
	top: 12%;
	left: 50%;
	transform: translateX(-50%);
	z-index: 7;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	width: max-content;
	max-width: calc(100% - 16px);
	padding: 8px 14px;
	border-radius: var(--border-radius-container, 12px);
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
	border-inline-start: 4px solid var(--qc-neutral-outcome);
	font-size: 15px;
	text-align: center;
	animation: qc-chip-in 250ms var(--qc-ease-out);
	cursor: pointer;

	&--capture {
		border-inline-start-color: var(--qc-success);
	}
}

.qc-board__chip-text {
	display: inline;
}

.qc-board__chip-glyph {
	margin-inline-end: 6px;
	font-weight: 700;
}

.qc-board__chip--capture .qc-board__chip-glyph {
	color: var(--qc-success);
}

.qc-board__chip-rarity {
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-board__chip-tag {
	font-size: 12px;
	padding: 0 6px;
	border-radius: var(--border-radius-pill, 999px);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
}

.qc-board__card {
	position: absolute;
	z-index: 8;
}

.qc-board__tooltip {
	position: absolute;
	z-index: 9;
	padding: 6px 10px;
	border-radius: var(--border-radius-element, 8px);
	background: #222;
	color: #fff;
	font-size: 13px;
	text-align: center;
	pointer-events: none;
}

@keyframes qc-breathe {
	from {
		opacity: 0.45;
	}

	to {
		opacity: 0.9;
	}
}

@keyframes qc-flow {
	to {
		stroke-dashoffset: -0.26;
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

@keyframes qc-chip-in {
	from {
		transform: translate(-50%, -8px);
		opacity: 0;
	}

	to {
		transform: translate(-50%, 0);
		opacity: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-board__chip,
	.qc-roll-ring__ripple,
	.qc-roll-ring__seg,
	.qc-piece__glow {
		animation: none;
	}
}
</style>
