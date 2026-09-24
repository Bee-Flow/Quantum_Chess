<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Layer 0 of the board: the 64 squares as an accessible grid. Each square is a focusable grid cell with a label that
  describes what is on it (roving tabindex: one tab stop), the coordinates, and the classes for the last move, the
  selection, highlights and the what-if view. The keyboard handling itself lives in useBoardKeyboard.
-->
<template>
	<div
		class="qc-board__grid"
		role="grid"
		:aria-label="t('quantumchess', 'Chessboard')"
		:aria-readonly="readonly"
		@keydown="(e) => emit('keydown', e)"
		@focusin="(e) => emit('focusin', e)"
		@focusout="(e) => emit('focusout', e)">
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
				@focus="emit('cellFocus', cell.square)">
				<span v-if="cell.rank" class="qc-sq__rank" aria-hidden="true">{{ cell.rank }}</span>
				<span v-if="cell.file" class="qc-sq__file" aria-hidden="true">{{ cell.file }}</span>
				<span v-if="cell.name" class="qc-sq__name" aria-hidden="true">{{ cell.name }}</span>
			</div>
		</div>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'

defineProps({
	/** Eight rows of eight cells from `boardCell()`, top row first */
	rows: { type: Array, required: true },
	/** The square that holds the tab stop */
	focusSquare: { type: Number, required: true },
	/** The board does not accept moves now */
	readonly: { type: Boolean, default: false },
})
const emit = defineEmits(['keydown', 'focusin', 'focusout', 'cellFocus'])

const cellEls = []

defineExpose({
	/**
	 * Move the keyboard focus to a square.
	 *
	 * @param {number} square the square
	 */
	focusCell: (square) => cellEls[square]?.focus(),
})
</script>

<style lang="scss" scoped>
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
</style>
