<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Display notation (GAME-DESIGN §3.7): the engine's `moveNotation` with sprite figurines (none for pawns), en dash and
  ×, the split/merge pipe in the quantum colour and the roll result as a small tag ("✓ 50%", "○ Moved 50%",
  "○ Missed 75%"). The canonical text stays available to screen readers and copy.
-->
<template>
	<span class="qc-notation" :class="{ 'qc-notation--missed': result && result.key === 'miss' }" :title="notationText">
		<span class="qc-sr-only">{{ notationText }}</span>
		<span class="qc-notation__head" aria-hidden="true">
			<template v-for="(part, i) in parts" :key="i">
				<PieceIcon
					v-if="part.piece"
					:type="part.piece"
					:color="moverColor"
					:size="size"
					decorative
					inline />
				<span v-else-if="part.pipe" class="qc-notation__pipe">|</span>
				<template v-else>{{ part.text }}</template>
			</template>
		</span>
		<span
			v-if="result"
			class="qc-notation__result"
			:class="'qc-notation__result--' + result.tone"
			aria-hidden="true">{{ result.text }}</span>
		<span v-if="mate" class="qc-notation__mark" aria-hidden="true">#</span>
	</span>
</template>

<script setup>
import { computed } from 'vue'
import PieceIcon from './PieceIcon.vue'
import { moveNotation } from '../../engine/index.js'
import { formatPercentNumber, outcomeLabel } from '../../engine/ui/index.js'

const props = defineProps({
	/** Engine notation ("Ng1-f3|h3", "Bc1xh6 {capture 50%}") */
	notation: { type: String, default: null },
	/** Or: the LegalMove / code … */
	move: { type: [Object, String], default: null },
	/** … the state before it … */
	stateBefore: { type: Object, default: null },
	/** … and its measurement record (rolled moves) */
	measurement: { type: Object, default: null },
	/** Colour of the mover (for the figurines) when only `notation` is given */
	color: { type: String, default: 'w' },
	/** Figurine size in px */
	size: { type: [Number, String], default: 16 },
})

const notationText = computed(() => {
	if (props.notation) {
		return props.notation
	}
	if (props.move && props.stateBefore) {
		try {
			return moveNotation(props.stateBefore, props.move, props.measurement)
		} catch {
			return typeof props.move === 'string' ? props.move : (props.move.code ?? '')
		}
	}
	return ''
})

const moverColor = computed(() => props.stateBefore?.turn ?? props.color)

const parsed = computed(() => {
	const m = /^(.*?)(?: \{(\S+) (\d+)%\})?( #)?$/.exec(notationText.value) ?? []
	return { head: m[1] ?? notationText.value, key: m[2] ?? null, percent: m[3] === undefined ? null : Number(m[3]), mate: Boolean(m[4]) }
})

const parts = computed(() => {
	const head = parsed.value.head
	if (head.startsWith('O-O')) {
		return [{ text: head }]
	}
	const out = []
	let buf = ''
	const flush = () => {
		if (buf !== '') {
			out.push({ text: buf })
			buf = ''
		}
	}
	for (let i = 0; i < head.length; i++) {
		const ch = head[i]
		const prev = i === 0 ? '' : head[i - 1]
		if ('KQRBN'.includes(ch) && (i === 0 || prev === '?' || prev === '=')) {
			flush()
			out.push({ piece: ch.toLowerCase() })
		} else if (ch === '|') {
			flush()
			out.push({ pipe: true })
		} else if (ch === '-') {
			buf += '–'
		} else if (ch === 'x') {
			buf += '×'
		} else {
			buf += ch
		}
	}
	flush()
	return out
})

const result = computed(() => {
	const { key, percent } = parsed.value
	if (key === null) {
		return null
	}
	const p = formatPercentNumber(percent)
	if (key === 'capture') {
		return { key, tone: 'capture', text: '✓ ' + p }
	}
	if (key === 'move' || key === 'miss') {
		return { key, tone: key, text: '○ ' + outcomeLabel(key) + ' ' + p }
	}
	return { key, tone: 'measure', text: '→ ' + key + ' ' + p }
})

const mate = computed(() => parsed.value.mate)
</script>

<style lang="scss" scoped>
.qc-notation {
	display: inline-flex;
	align-items: baseline;
	flex-wrap: wrap;
	gap: 0 4px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.qc-notation__pipe {
	color: var(--qc-quantum);
	font-weight: 700;
	padding-inline: 1px;
}

.qc-notation--missed .qc-notation__head {
	color: var(--color-text-maxcontrast);
	text-decoration: underline dotted;
}

.qc-notation__result {
	font-size: 0.85em;
	color: var(--color-text-maxcontrast);

	&--capture {
		color: var(--qc-success-strong);
		font-weight: 600;
	}

	&--measure {
		color: var(--qc-quantum);
	}
}

.qc-notation__mark {
	font-weight: 700;
}
</style>
