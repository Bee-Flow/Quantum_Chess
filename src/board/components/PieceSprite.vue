<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The inline piece sprite: one hidden SVG with a <symbol> per piece, which every board and piece icon references with
  <use>. App.vue mounts it exactly once, so the symbol ids stay unique on the page.
-->
<template>
	<!-- eslint-disable vue/no-v-html -- build-time SVG from img/pieces, no user input -->
	<div
		class="qc-piece-sprite"
		aria-hidden="true"
		v-html="markup" />
	<!-- eslint-enable vue/no-v-html -->
</template>

<script setup>
import { spriteMarkup } from '../pieceSprites.js'

const markup = spriteMarkup()
</script>

<style scoped>
.qc-piece-sprite {
	position: absolute;
	width: 0;
	height: 0;
	overflow: hidden;
}
</style>
