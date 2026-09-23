<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Plain text in which Unicode chess figurines (♔…♟, as produced by resultSentence and the preview) are drawn with the
  piece sprite, so copy matches the board's piece set. The text is never interpreted as HTML.
-->
<template>
	<span class="qc-figurine-text">
		<template v-for="(part, i) in parts" :key="i">
			<PieceIcon v-if="part.piece"
				:type="part.piece.type"
				:color="part.piece.color"
				:size="size"
				inline />
			<span v-else>{{ part.text }}</span>
		</template>
	</span>
</template>

<script setup>
import { computed } from 'vue'
import PieceIcon from './PieceIcon.vue'

const props = defineProps({
	/** The text */
	text: { type: String, default: '' },
	/** Figurine size in px (default: 1.15 em at 14 px) */
	size: { type: [Number, String], default: 16 },
})

const FIG = {
	'♔': ['k', 'w'], '♕': ['q', 'w'], '♖': ['r', 'w'], '♗': ['b', 'w'], '♘': ['n', 'w'], '♙': ['p', 'w'],
	'♚': ['k', 'b'], '♛': ['q', 'b'], '♜': ['r', 'b'], '♝': ['b', 'b'], '♞': ['n', 'b'], '♟': ['p', 'b'],
}

const parts = computed(() => {
	const out = []
	let buf = ''
	for (const ch of props.text.replace(/︎/g, '')) {
		if (FIG[ch]) {
			if (buf !== '') {
				out.push({ text: buf })
				buf = ''
			}
			out.push({ piece: { type: FIG[ch][0], color: FIG[ch][1] } })
		} else {
			buf += ch
		}
	}
	if (buf !== '') {
		out.push({ text: buf })
	}
	return out
})
</script>
