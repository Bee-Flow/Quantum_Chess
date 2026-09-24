<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Promotion picker: Q, R, N, B in a column over the target file, opened before the move is sent. Arrow keys move between
  the choices, Esc cancels.
-->
<template>
	<div
		class="qc-promotion"
		role="dialog"
		:aria-label="t('quantumchess', 'Promote to')"
		:style="position"
		@keydown="onKeydown">
		<button
			v-for="(type, i) in TYPES"
			:key="type"
			ref="buttons"
			type="button"
			class="qc-promotion__choice"
			:style="{ width: size + 'px', height: size + 'px' }"
			:aria-label="pieceName(type, color)"
			:tabindex="i === 0 ? 0 : -1"
			@click="emit('choose', type)">
			<PieceIcon
				:type="type"
				:color="color"
				:size="Math.round(size * 0.86)"
				decorative />
		</button>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, onMounted, useTemplateRef } from 'vue'
import PieceIcon from './PieceIcon.vue'
import { pieceName } from '../../engine/ui/index.js'
import { squareXY } from '../geometry.js'

const props = defineProps({
	/** Target square */
	square: { type: Number, required: true },
	/** Colour of the pawn */
	color: { type: String, required: true },
	/** Board orientation */
	orientation: { type: String, default: 'w' },
	/** Square size in px */
	size: { type: Number, required: true },
})

const emit = defineEmits(['choose', 'cancel'])

const TYPES = ['q', 'r', 'n', 'b']
const buttons = useTemplateRef('buttons')

const position = computed(() => {
	const { col, row } = squareXY(props.square, props.orientation)
	const top = row < 4 ? row * props.size : (row - 3) * props.size
	return { left: col * props.size + 'px', top: top + 'px', flexDirection: row < 4 ? 'column' : 'column-reverse' }
})

/**
 * Keyboard: arrows move, Esc cancels.
 *
 * @param {KeyboardEvent} e event
 */
function onKeydown(e) {
	const list = buttons.value ?? []
	const i = list.indexOf(document.activeElement)
	if (e.key === 'Escape') {
		e.preventDefault()
		e.stopPropagation()
		emit('cancel')
	} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		e.preventDefault()
		const step = e.key === 'ArrowDown' ? 1 : -1
		list[(i + step + list.length) % list.length]?.focus()
	}
}

onMounted(() => buttons.value?.[0]?.focus())
</script>

<style lang="scss" scoped>
.qc-promotion {
	position: absolute;
	z-index: 20;
	display: flex;
	border-radius: var(--border-radius-small, 4px);
	background: var(--color-main-background);
	box-shadow: 0 3px 14px rgb(0 0 0 / 0.35);
	overflow: hidden;
}

.qc-promotion__choice {
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0;
	padding: 0;
	border: none;
	border-radius: 0;
	background: transparent;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background: var(--color-primary-element-light);
		outline: none;
	}

	&:focus-visible {
		box-shadow: inset 0 0 0 3px var(--color-primary-element);
	}
}
</style>
