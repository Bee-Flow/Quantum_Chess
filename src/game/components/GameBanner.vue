<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A banner above the board: a note card with one line of text and, in the default slot, its buttons. Used for the game's
  own banners (history view, connection, sending moves) and for the offers of online games.
-->
<template>
	<NcNoteCard :type="type" class="qc-game__banner">
		<div class="qc-game__banner-row">
			<span>{{ text }}</span>
			<slot />
		</div>
	</NcNoteCard>
</template>

<script setup>
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'

defineProps({
	/** Severity: info, success, warning or error */
	type: { type: String, default: 'info' },
	/** The message */
	text: { type: String, required: true },
})
</script>

<style lang="scss" scoped>
.qc-game__banner {
	margin: 0 !important;
}

.qc-game__banner-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
</style>
