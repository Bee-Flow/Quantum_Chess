<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The compact move list for phones: one scrolling line, latest move on the right. -->
<template>
	<ol ref="strip" class="qc-strip" :aria-label="t('quantumchess', 'Moves')">
		<li v-for="(m, i) in moves" :key="i">
			<button
				type="button"
				class="qc-strip__move"
				:class="{ 'qc-strip__move--current': currentPly === null ? i === moves.length - 1 : i === currentPly - 1 }"
				@click="emit('selectPly', i + 1)">
				<span v-if="m.color === 'w' || i === 0" class="qc-strip__number">{{ Math.floor(m.ply / 2) + 1 }}{{ m.color === 'w' ? '.' : '…' }}</span>
				<NotationText :notation="m.notation" :color="m.color" />
			</button>
		</li>
	</ol>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { nextTick, ref, watch } from 'vue'
import NotationText from '../../board/components/NotationText.vue'

const props = defineProps({
	/** MoveEntry list */
	moves: { type: Array, required: true },
	/** Moves shown in the history view, null = live */
	currentPly: { type: Number, default: null },
})
const emit = defineEmits(['selectPly'])

const strip = ref(null)
watch(() => props.moves.length, async () => {
	await nextTick()
	if (strip.value) {
		strip.value.scrollLeft = strip.value.scrollWidth
	}
}, { immediate: true })
</script>

<style lang="scss" scoped>
.qc-strip {
	display: flex;
	gap: 2px;
	min-height: 36px;
	margin: 0;
	padding: 0 4px;
	overflow-x: auto;
	list-style: none;
	scrollbar-width: thin;
}

.qc-strip__move {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	min-height: 34px;
	margin: 0;
	padding: 0 6px;
	border: none;
	border-radius: var(--border-radius-small);
	background: transparent;
	color: var(--color-main-text);
	font-weight: normal;
	white-space: nowrap;
}

.qc-strip__move--current {
	background: var(--qc-accent-soft, var(--color-primary-element-light));
}

.qc-strip__number {
	color: var(--color-text-maxcontrast);
}
</style>
