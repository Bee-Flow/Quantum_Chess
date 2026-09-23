<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The inline piece sprite (GAME-DESIGN §3.3). Mounted once by App.vue; further instances (the dev harness, settings
  pages) render nothing while another one is mounted, so symbol ids stay unique.
-->
<template>
	<!-- eslint-disable vue/no-v-html -- build-time SVG from img/pieces, no user input -->
	<div
		v-if="isOwner"
		class="qc-piece-sprite"
		aria-hidden="true"
		v-html="markup" />
	<!-- eslint-enable vue/no-v-html -->
</template>

<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { spriteRegistry as registry, spriteMarkup } from './pieceSprite.js'

const uid = registry.next++
registry.mounted.push(uid)
const isOwner = computed(() => registry.mounted[0] === uid)
const markup = spriteMarkup()

onBeforeUnmount(() => {
	const i = registry.mounted.indexOf(uid)
	if (i >= 0) {
		registry.mounted.splice(i, 1)
	}
})
</script>

<style scoped>
.qc-piece-sprite {
	position: absolute;
	width: 0;
	height: 0;
	overflow: hidden;
}
</style>
