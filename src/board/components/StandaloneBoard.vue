<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A board outside the game screen, for lessons, puzzles and the review: QuantumBoard sized to its container (integer
  squares), with its own input controller and move switcher, and the animation handshake (`play(event)` resolves when
  the move is shown; the caller then assigns the new state).
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
import { computed, ref } from 'vue'
import BoardControls from './BoardControls.vue'
import QuantumBoard from './QuantumBoard.vue'
import { useResizeMeasure } from '../../composables/useResizeMeasure.js'
import { useBoardInput } from '../composables/useBoardInput.js'
import { HEADER_PX } from '../composables/useBoardSize.js'

/** @typedef {import('../animator.js').MoveEvent} MoveEvent */

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

// Fit the board into the parent's width and the viewport height.
useResizeMeasure(() => root.value?.parentElement, () => {
	const el = root.value
	if (!el) {
		return
	}
	const width = Math.min(el.parentElement?.clientWidth ?? el.clientWidth, window.innerWidth - 16)
	const height = window.innerHeight - HEADER_PX - props.reserved
	squareSize.value = Math.max(36, Math.floor(Math.min(width, height, 640) / 8))
})

defineExpose({
	/**
	 * Animate a move event; resolves when it is shown.
	 *
	 * @param {MoveEvent} event the move
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
