<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The board of lessons and puzzles: QuantumBoard sized to its container (integer squares), the move switcher and the
  animation handshake (`play(event)` resolves when the move is shown; the caller then assigns the new state).
-->
<template>
	<div ref="root" class="qc-tboard" :style="{ '--qc-board-px': 8 * squareSize + 'px' }">
		<div class="qc-tboard__board">
			<QuantumBoard
				ref="board"
				:state="state"
				:legalMoves="moves"
				:input="input"
				:orientation="orientation"
				:squareSize="squareSize"
				:interactive="interactive"
				:movableColor="interactive ? state.turn : null"
				:lastMove="lastMove"
				:arrows="arrows"
				:highlights="highlights"
				:markers="markers"
				:preview="preview"
				:names="names"
				:lessonRoll="lessonRoll"
				hotkeys
				@move="(m) => emit('move', m)"
				@previewClose="emit('previewClose')" />
		</div>
		<BoardControls
			v-if="!noControls"
			class="qc-tboard__controls"
			:input="input"
			:compact="squareSize < 48" />
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BoardControls from '../board/BoardControls.vue'
import QuantumBoard from '../board/QuantumBoard.vue'
import { HEADER_PX } from '../../composables/useBoardSize.js'
import { useBoardInput } from '../board/useBoardInput.js'

const props = defineProps({
	/** Position */
	state: { type: Object, required: true },
	/** Moves the player may make now */
	legalMoves: { type: Array, default: () => [] },
	/** Accept input */
	interactive: { type: Boolean, default: false },
	/** 'w' or 'b' at the bottom */
	orientation: { type: String, default: 'w' },
	/** {move, key} */
	lastMove: { type: Object, default: null },
	/** Arrows */
	arrows: { type: Array, default: () => [] },
	/** Highlights */
	highlights: { type: Array, default: () => [] },
	/** Coach crosshairs */
	markers: { type: Array, default: () => [] },
	/** Read-only preview {state, kind, label} */
	preview: { type: Object, default: null },
	/** Names {w, b} */
	names: { type: Object, default: null },
	/** Tag result chips "Lesson roll" */
	lessonRoll: { type: Boolean, default: false },
	/** Hide the move switcher */
	noControls: { type: Boolean, default: false },
	/** Vertical space to keep free below the header (px) */
	reserved: { type: Number, default: 170 },
})
const emit = defineEmits(['move', 'previewClose'])

const root = ref(null)
const board = ref(null)
const squareSize = ref(56)
const moves = computed(() => (props.interactive ? props.legalMoves : []))
const input = useBoardInput({
	state: computed(() => props.state),
	legalMoves: moves,
	movableColor: computed(() => (props.interactive ? props.state.turn : null)),
	interactive: computed(() => props.interactive),
})

let observer = null
let frame = 0

/** Fit the board into the container width and the viewport height. */
function measure() {
	frame = 0
	const el = root.value
	if (!el) {
		return
	}
	const width = Math.min(el.parentElement?.clientWidth ?? el.clientWidth, window.innerWidth - 16)
	const height = window.innerHeight - HEADER_PX - props.reserved
	squareSize.value = Math.max(36, Math.floor(Math.min(width, height, 640) / 8))
}

/** Measure in the next frame. */
function schedule() {
	if (!frame) {
		frame = requestAnimationFrame(measure)
	}
}

onMounted(() => {
	measure()
	if (typeof ResizeObserver === 'function' && root.value?.parentElement) {
		observer = new ResizeObserver(schedule)
		observer.observe(root.value.parentElement)
	}
	window.addEventListener('resize', schedule)
})
onBeforeUnmount(() => {
	observer?.disconnect()
	window.removeEventListener('resize', schedule)
	if (frame) {
		cancelAnimationFrame(frame)
	}
})

defineExpose({
	/**
	 * Animate a move event (SPEC §14.4.2); resolves when it is shown.
	 *
	 * @param {object} event MoveEvent
	 * @return {Promise<void>}
	 */
	play: (event) => board.value?.play(event) ?? Promise.resolve(),
	/** Fast-forward the running animation. */
	finish: () => board.value?.finish(),
	/** The input controller. */
	input,
})
</script>

<style lang="scss" scoped>
.qc-tboard {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: var(--qc-board-px);
	max-width: 100%;
}

.qc-tboard__board {
	position: relative;
	width: var(--qc-board-px);
	height: var(--qc-board-px);
}
</style>
