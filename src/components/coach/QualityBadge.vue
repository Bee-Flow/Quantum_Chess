<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- A move-quality badge (GAME-DESIGN §5.3.4) with an optional Lucky / Unlucky tag. -->
<template>
	<span class="qc-quality" :class="'qc-quality--' + label" data-test="quality-badge">
		{{ labelText(label) }}
		<span v-if="luck" class="qc-quality__luck">{{ luckText(luck) }}</span>
	</span>
</template>

<script setup>
import { labelText, luckText } from '../../coach/quality.js'

defineProps({
	/** Quality label */
	label: { type: String, required: true },
	/** lucky | unlucky | null */
	luck: { type: String, default: null },
})
</script>

<style lang="scss" scoped>
.qc-quality {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 1px 8px;
	border-radius: var(--border-radius-pill, 12px);
	font-weight: bold;
	font-size: 0.9em;
	background: var(--color-background-dark);
	color: var(--color-main-text);

	&--best,
	&--excellent {
		background: var(--color-success);
		color: var(--color-success-text, #fff);
	}

	&--brilliant,
	&--only {
		background: #00796b;
		color: #fff;
	}

	&--inaccuracy {
		background: var(--color-warning);
		color: var(--color-warning-text, #000);
	}

	&--mistake {
		background: #e65100;
		color: #fff;
	}

	&--blunder {
		background: var(--color-error);
		color: var(--color-error-text, #fff);
	}
}

.qc-quality__luck {
	font-weight: normal;
}
</style>
