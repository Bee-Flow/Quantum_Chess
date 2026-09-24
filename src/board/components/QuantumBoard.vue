<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The quantum chessboard. It draws the position in six layers (components/layers/): the accessible grid of squares, the
  markers under the pieces, the pieces, their badges, the effects above them and the floating interface. It takes moves
  by click, drag and keyboard (through a useBoardInput controller), guards them with the king safety net, and plays the
  moves of a game as animations: it implements the game's Animator (play, startRoll, finish). The board is always laid
  out left to right.
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
			@pointerdown="pointer.onPointerDown"
			@pointermove="pointer.onPointerMove"
			@pointerup="pointer.onPointerUp"
			@pointercancel="pointer.onPointerCancel"
			@pointerleave="pointer.onPointerLeave">
			<BoardSquares
				ref="squares"
				:rows="rows"
				:focusSquare="keyboard.focusSquare.value"
				:readonly="!canPlay"
				@keydown="keyboard.onKeydown"
				@focusin="keyboard.onFocusIn"
				@focusout="keyboard.onFocusOut"
				@cellFocus="keyboard.onCellFocus" />
			<BoardMarkers
				:lastDashed="lastSquares.dashed"
				:whatIfChanged="whatIfChanged"
				:linkChords="linkChords"
				:threads="threads"
				:kings="kings"
				:markers="markers"
				:targetMarks="targetMarks" />
			<BoardPieces :pieces="pieces" :ringWidth="ringWidth" />
			<BoardBadges
				:badges="badges"
				:deltas="deltas"
				:coachLabels="coachLabels"
				:linkGlyphs="linkGlyphs" />
			<BoardEffects :arrows="arrowShapes" :pies="pies" />
			<BoardOverlay
				:input="input"
				:state="shown"
				:preview="preview"
				:dragging="Boolean(pointer.drag.value?.dragging)"
				:keyboardPreview="keyboard.keyboardPreview.value"
				@rejected="onRejected"
				@previewClose="emit('previewClose')"
				@promotionCancel="onPromotionCancel" />
		</div>

		<SafetyNetDialog
			:net="input.safetyNet"
			:state="shown"
			@resolve="(action, dontAsk) => input.resolveSafetyNet(action, dontAsk)" />
		<div class="hidden-visually" aria-live="polite">
			{{ announcement }}
		</div>
	</div>
</template>

<script setup>
import { useIsDarkTheme } from '@nextcloud/vue/composables/useIsDarkTheme'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import BoardBadges from './layers/BoardBadges.vue'
import BoardEffects from './layers/BoardEffects.vue'
import BoardMarkers from './layers/BoardMarkers.vue'
import BoardOverlay from './layers/BoardOverlay.vue'
import BoardPieces from './layers/BoardPieces.vue'
import BoardSquares from './layers/BoardSquares.vue'
import SafetyNetDialog from './SafetyNetDialog.vue'
import { kingDanger, T } from '../../engine/index.js'
import { identityColors, kingCaptureThreat } from '../../engine/ui/index.js'
import { reducedMotion } from '../../services/preferences.js'
import { configureSound, playSound, startSuspense } from '../../services/sound.js'
import { createAnimator } from '../animator.js'
import { kingRings, lastMoveSquares, pieceItems, viewsOf } from '../boardModel.js'
import { boardPrefs } from '../boardPreferences.js'
import {
	arrowShape,
	badgeList,
	boardCell,
	coachLabelList,
	deltaList,
	describeMoveEvent,
	linkChordList,
	linkGlyphList,
	partThreads,
	pieceSprites,
	targetMarkList,
} from '../boardScene.js'
import { isHighContrast, resolveBoardTheme } from '../boardThemes.js'
import { provideBoardContext } from '../composables/useBoardContext.js'
import { useBoardGeometry } from '../composables/useBoardGeometry.js'
import { useBoardInput } from '../composables/useBoardInput.js'
import { useBoardKeyboard } from '../composables/useBoardKeyboard.js'
import { useBoardPointer } from '../composables/useBoardPointer.js'
import { displayRows } from '../geometry.js'

import '../styles.js'

/** @typedef {import('../animator.js').MoveEvent} MoveEvent */

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
	/** Register the board's hot keys (1–4, E, W, D) on the whole page */
	hotkeys: { type: Boolean, default: false },
	/** Tag result chips "Lesson roll" */
	lessonRoll: { type: Boolean, default: false },
})

const emit = defineEmits(['move', 'select', 'illegal', 'previewClose'])

const uid = 'qcb' + Math.random().toString(36).slice(2, 8)
const frame = ref(null)
const squares = ref(null)
const isDark = useIsDarkTheme()
const announcement = ref('')

// --- Animator and geometry, shared with the layers ------------------------------------------------------------------

const anim = createAnimator({
	speed: () => boardPrefs.speedFactor,
	sound: (name) => sound(name),
	suspense: () => (boardPrefs.sound ? startSuspense({ speed: boardPrefs.animationSpeedEffective }) : () => {}),
	describe,
	announce,
})
const { geo, squareFromEvent } = useBoardGeometry({
	orientation: () => props.orientation,
	squareSize: () => props.squareSize,
	frame,
})
provideBoardContext({ uid, geo, anim })

/** The position on screen: the animation's frame, a read-only preview, or the live position. */
const shown = computed(() => toRaw(anim.state.display ?? props.preview?.state ?? props.state))

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

const keyboard = useBoardKeyboard({
	state: () => props.state,
	shown,
	orientation: () => props.orientation,
	hotkeys: () => props.hotkeys,
	input,
	anim,
	frame,
	focusCell: (square) => squares.value?.focusCell(square),
	activate,
	announce,
})
/** Stable identity colours of the ghosts over the whole game. */
const identity = computed(() => {
	const states = [...props.history.map((s) => toRaw(s)), shown.value]
	try {
		return identityColors(states)
	} catch {
		return identityColors(shown.value)
	}
})

const items = computed(() => pieceItems(shown.value, {
	whatIf: anim.state.busy ? null : input.value.whatIf,
	identity: identity.value,
}))
const pointer = useBoardPointer({
	frame,
	input,
	anim,
	squareFromEvent,
	items,
	inputMode: () => boardPrefs.inputMode,
	keyboardPreview: keyboard.keyboardPreview,
	activate,
})

/**
 * Activate a square (click, tap, Enter): select, choose a target or commit.
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

/**
 * A move was rejected: tell the parent and play the sound (the overlay shows why).
 *
 * @param {{code: string|null, square: number|null}} feedback the rejected move
 */
function onRejected(feedback) {
	emit('illegal', { code: feedback.code, square: feedback.square })
	sound('illegal')
}

/** Cancel the promotion and give the focus back to the board. */
function onPromotionCancel() {
	input.value.choosePromotion(null)
	squares.value?.focusCell(keyboard.focusSquare.value)
}

// --- Theme, size, sound and speech ----------------------------------------------------------------------------------

const theme = computed(() => resolveBoardTheme(boardPrefs.boardTheme, { highContrast: isHighContrast() }))
const ringWidth = computed(() => Math.max(2 / geo.value.S, 0.055))
const rootClasses = computed(() => ({
	'qc-board--dark': isDark.value,
	'qc-board--interactive': canPlay.value,
	'qc-board--reduced': reducedMotion.value || boardPrefs.speedFactor === 0,
	'qc-board--whatif': input.value.whatIf !== null,
	'qc-board--busy': anim.state.busy,
	'qc-board--small': geo.value.S < 44,
}))
const rootStyle = computed(() => ({
	'--S': geo.value.S + 'px',
	'--qc-speed': boardPrefs.speedFactor,
	width: 8 * geo.value.S + 'px',
	height: 8 * geo.value.S + 'px',
}))

watch(
	() => [boardPrefs.sound, boardPrefs.volume],
	([enabled, volume]) => configureSound({ enabled, volume }),
	{ immediate: true },
)

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

// --- What the layers draw -------------------------------------------------------------------------------------------

/** The ghost whose parts get outlines and threads: dragged, selected, hovered or focused. */
const focusPiece = computed(() => {
	if (anim.state.busy) {
		return null
	}
	const { view } = viewsOf(shown.value)
	const drag = pointer.drag.value
	const candidates = [
		drag?.from,
		input.value.selection,
		input.value.whatIf,
		pointer.pointerSquare.value,
		keyboard.hasFocus.value ? keyboard.focusSquare.value : null,
	]
	for (const s of candidates) {
		if (s !== null && s !== undefined && view[s] !== null) {
			return { square: s, piece: view[s].piece }
		}
	}
	return null
})

const pieces = computed(() => {
	const drag = pointer.drag.value
	const hovered = pointer.pointerSquare.value
	return pieceSprites(items.value, geo.value, {
		focus: focusPiece.value,
		drag,
		returning: pointer.returning.value,
		shaking: pointer.shaking.value,
		hoverSquare: canPlay.value && drag === null && hovered !== null && input.value.isMovablePiece(hovered)
			? hovered
			: null,
		anim: anim.state,
		prefs: boardPrefs,
	})
})

const kings = computed(() => {
	if (anim.state.busy) {
		return []
	}
	const both = boardPrefs.kingDangerBoth || props.movableColor === 'both' || props.movableColor === null
	return kingRings(shown.value, both ? ['w', 'b'] : [props.movableColor])
})

const badges = computed(() => badgeList(pieces.value, kings.value, geo.value, boardPrefs))
const markerBySquare = computed(() => new Map(props.markers.map((m) => [m.square, m])))
const coachLabels = computed(() => coachLabelList(props.markers, geo.value))
const whatIfChanged = computed(() => items.value.filter((p) => p.delta !== null && !p.chosen))
const deltas = computed(() => deltaList(whatIfChanged.value, geo.value))
const threads = computed(() => partThreads(viewsOf(shown.value), focusPiece.value, geo.value))
const linkGlyphs = computed(() => linkGlyphList(viewsOf(shown.value), focusPiece.value, geo.value))
const linkChords = computed(() => (boardPrefs.linkThreads !== 'always' || anim.state.busy
	? []
	: linkChordList(viewsOf(shown.value), geo.value)))
const lastSquares = computed(() => (boardPrefs.highlightLastMove && !props.preview
	? lastMoveSquares(props.lastMove)
	: { fill: [], dashed: [] }))
const targets = computed(() => (boardPrefs.showLegalMoves || input.value.mode !== 'move' ? input.value.targets : []))

const targetMarks = computed(() => {
	const selection = input.value.selection
	return targetMarkList(targets.value, geo.value, {
		hovered: input.value.hovered,
		selected: selection === null ? null : viewsOf(shown.value).view[selection],
		pieceSet: boardPrefs.pieceSet,
	})
})
const pies = computed(() => targetMarks.value.filter((mk) => mk.pie))

/** When a king is trapped, the capture that would take it. */
const trapArrow = computed(() => {
	const st = shown.value
	if (anim.state.busy || st.result?.reason !== 'king_trapped') {
		return null
	}
	const threat = kingCaptureThreat(st)
	return threat ? { from: threat.from[0], to: threat.to, kind: 'forced', dashed: true } : null
})

const arrowShapes = computed(() => {
	const list = [...props.arrows]
	if (anim.state.reveal) {
		list.push({ ...anim.state.reveal, kind: 'reveal', dashed: true })
	}
	if (trapArrow.value) {
		list.push(trapArrow.value)
	}
	return list.map((a) => arrowShape(a, geo.value))
})

const rows = computed(() => {
	const scene = {
		state: shown.value,
		coordinates: boardPrefs.coordinates,
		physicsNames: boardPrefs.physicsNames,
		targets: new Map(targets.value.map((tg) => [tg.square, tg])),
		markers: markerBySquare.value,
		highlights: new Map(props.highlights.map((h) => [h.square, h.kind ?? 'hint'])),
		whatIfItems: input.value.whatIf !== null && !anim.state.busy ? items.value : null,
		selection: input.value.selection,
		mergeSources: input.value.mergeSources,
		lastMove: lastSquares.value.fill,
		dragOver: pointer.drag.value?.dragging ? pointer.drag.value.over : null,
	}
	return displayRows(props.orientation).map((row) => row.map((square) => boardCell(square, geo.value, scene)))
})

// --- Animator hooks -------------------------------------------------------------------------------------------------

/**
 * The result chip, the reveal arrow and the spoken sentence of a move event.
 *
 * @param {MoveEvent} event the move
 * @return {{chip: object|null, reveal: object|null, speech: string}}
 */
function describe(event) {
	return describeMoveEvent(event, {
		names: props.names,
		lessonRoll: props.lessonRoll,
		format: boardPrefs.probabilityFormat,
	})
}

// A warning sound once per position in which the user's own king will certainly be captured.
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

// Idle animations pause while the browser tab is hidden.
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
})
watch(tabHidden, (hidden) => frame.value?.classList.toggle('qc-board--paused', hidden))

defineExpose({
	/**
	 * Animator: play a move event; resolves at the end of the Collapse phase.
	 *
	 * @param {MoveEvent} event the move
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
	focus: () => squares.value?.focusCell(keyboard.focusSquare.value),
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

// A piece: the pieces layer and the traveller of the effects layer draw the same box.
:deep(.qc-piece) {
	position: absolute;
	top: 0;
	left: 0;
	width: var(--S);
	height: var(--S);
	will-change: transform;
}

:deep(.qc-piece--traveller) {
	z-index: 4;
	opacity: 0.55;
	pointer-events: none;
}

:deep(.qc-piece__svg) {
	display: block;
	width: 100%;
	height: 100%;
	overflow: visible;
	transition: transform 120ms var(--qc-ease-out), filter 120ms ease;
}
</style>
