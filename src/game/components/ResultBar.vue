<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The persistent result bar above the board: "White won · King captured · Review · Rematch". -->
<template>
	<div class="qc-result-bar" role="status" data-test="result-bar">
		<span class="qc-result-bar__text">
			<strong>{{ text.title }}</strong>
			<span v-if="text.reason"> · {{ text.reason }}</span>
		</span>
		<span class="qc-result-bar__actions">
			<NcButton
				variant="tertiary"
				size="small"
				@click="emit('review')">
				{{ t('quantumchess', 'Review') }}
			</NcButton>
			<NcButton
				v-if="can.rematch"
				variant="secondary"
				size="small"
				@click="emit('rematch')">
				{{ t('quantumchess', 'Rematch') }}
			</NcButton>
			<NcButton variant="tertiary" size="small" @click="emit('details')">
				{{ t('quantumchess', 'Summary') }}
			</NcButton>
		</span>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import { resultText } from '../resultText.js'

const props = defineProps({
	/** GameResult */
	result: { type: Object, required: true },
	/** Names {w, b} */
	names: { type: Object, required: true },
	/** Capabilities */
	can: { type: Object, required: true },
	/** Extra context for the reason copy */
	extra: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['review', 'rematch', 'details'])

const text = computed(() => resultText(props.result.result, props.result.reason, props.names, props.extra))
</script>

<style scoped>
.qc-result-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 4px 8px;
	min-height: 40px;
	padding: 2px 4px 2px 12px;
	border-radius: var(--border-radius-large);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
}

.qc-result-bar__actions {
	display: flex;
	gap: 4px;
}
</style>
