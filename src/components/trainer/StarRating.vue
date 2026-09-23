<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- Up to three stars (earned ones filled). -->
<template>
	<span class="qc-stars" role="img" :aria-label="n('quantumchess', '{count} star of {max}', '{count} stars of {max}', stars, { count: stars, max })">
		<span
			v-for="i in max"
			:key="i"
			class="qc-stars__star"
			:class="{ 'qc-stars__star--on': i <= stars }"
			aria-hidden="true">★</span>
	</span>
</template>

<script setup>
import { n } from '@nextcloud/l10n'

defineProps({
	/** Earned stars */
	stars: { type: Number, default: 0 },
	/** Maximum */
	max: { type: Number, default: 3 },
})
</script>

<style lang="scss" scoped>
.qc-stars {
	display: inline-flex;
	gap: 1px;
	line-height: 1;
}

.qc-stars__star {
	color: var(--color-border-dark);

	&--on {
		color: #f5a623;
	}
}
</style>
