<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One piece graphic from the sprite, for captured trays, trophies and text. The sprite has the board's fixed colours
  (black body, black outline), so on a dark theme a black piece gets a light outline to keep a contrast of at least 3:1
  against the background.
-->
<template>
	<svg
		class="qc-piece-icon"
		:class="{ 'qc-piece-icon--inline': inline, 'qc-piece-icon--halo': halo }"
		:width="size"
		:height="size"
		viewBox="0 0 45 45"
		:role="decorative ? undefined : 'img'"
		:aria-hidden="decorative ? 'true' : undefined"
		:aria-label="decorative ? undefined : label">
		<use :href="'#' + symbol" />
	</svg>
</template>

<script setup>
import { useIsDarkTheme } from '@nextcloud/vue/composables/useIsDarkTheme'
import { computed } from 'vue'
import { pieceName } from '../../engine/ui/index.js'
import { boardPrefs } from '../boardPreferences.js'
import { pieceSymbolId } from '../pieceSprites.js'

const props = defineProps({
	/** Piece type: k q r b n p (either case) */
	type: { type: String, required: true },
	/** 'w' or 'b' */
	color: { type: String, required: true },
	/** Size in px */
	size: { type: [Number, String], default: 18 },
	/** Piece set (cburnett); default: the preference */
	set: { type: String, default: null },
	/** Hidden from screen readers (when the name is said next to it) */
	decorative: { type: Boolean, default: false },
	/** Align with the text baseline */
	inline: { type: Boolean, default: false },
})

const symbol = computed(() => pieceSymbolId(props.set ?? boardPrefs.pieceSet, props.color, props.type.toLowerCase()))
const label = computed(() => pieceName(props.type.toLowerCase(), props.color))
const isDark = useIsDarkTheme()
const halo = computed(() => isDark.value && props.color === 'b')
</script>

<style lang="scss" scoped>
.qc-piece-icon {
	display: inline-block;
	flex: none;
	overflow: visible;
}

// four hard 1px shadows draw a crisp outline in the text colour around the whole glyph
.qc-piece-icon--halo {
	filter: drop-shadow(1px 0 0 var(--color-main-text)) drop-shadow(-1px 0 0 var(--color-main-text))
		drop-shadow(0 1px 0 var(--color-main-text)) drop-shadow(0 -1px 0 var(--color-main-text));
}

.qc-piece-icon--inline {
	vertical-align: -0.2em;
	margin-inline: 0.05em;
}
</style>
