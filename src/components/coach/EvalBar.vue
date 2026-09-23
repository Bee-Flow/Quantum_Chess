<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The evaluation bar (GAME-DESIGN §5.3.1): White's expected score E as the fill, the fog band (min–max of E across
  the first roll on the principal line) and "♚ in N" for a proven certain win. Vertical beside the board, or a thin
  horizontal bar above it on phones. Placed absolutely next to the board by its container.
-->
<template>
	<div
		class="qc-eval"
		:class="[vertical ? 'qc-eval--vertical' : 'qc-eval--horizontal', { 'qc-eval--flipped': flipped, 'qc-eval--pending': !analysis }]"
		role="img"
		:aria-label="ariaLabel"
		:title="ariaLabel"
		data-test="eval-bar">
		<div class="qc-eval__track">
			<div class="qc-eval__white" :style="fillStyle" />
			<div v-if="fogStyle" class="qc-eval__fog" :style="fogStyle" />
		</div>
		<!-- outside the clipped track: "100", "+1.2" or "♚12" are wider than the 12 px bar and must not be cut -->
		<span
			v-if="vertical"
			class="qc-eval__label"
			:class="[E >= 0.5 ? 'qc-eval__label--white' : 'qc-eval__label--black', { 'qc-eval__label--long': shortLabel.length > 2 }]">{{ shortLabel }}</span>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import { formatPercentNumber } from '../../engine/ui/index.js'

const props = defineProps({
	/** Analysis {E, fog, mate} or null while analysing */
	analysis: { type: Object, default: null },
	/** 'w' or 'b' at the bottom */
	orientation: { type: String, default: 'w' },
	/** A thin horizontal bar above the board (phones) instead of a vertical one beside it */
	horizontal: { type: Boolean, default: false },
	/** percent | pawns */
	format: { type: String, default: 'percent' },
})

const E = computed(() => props.analysis?.E ?? 0.5)
const vertical = computed(() => !props.horizontal)
const flipped = computed(() => props.orientation === 'b')
const side = computed(() => (vertical.value ? (flipped.value ? 'top' : 'bottom') : (flipped.value ? 'right' : 'left')))
const size = computed(() => (vertical.value ? 'height' : 'width'))

const fillStyle = computed(() => ({ [size.value]: (E.value * 100).toFixed(1) + '%', [side.value]: 0 }))
const fogStyle = computed(() => {
	const f = props.analysis?.fog
	if (!f || f.max - f.min < 0.01) {
		return null
	}
	return { [side.value]: (f.min * 100).toFixed(1) + '%', [size.value]: ((f.max - f.min) * 100).toFixed(1) + '%' }
})

/**
 * Pawn units from E (inverse of the logistic leaf conversion, k = 250).
 *
 * @param {number} e expected score
 * @return {string}
 */
function pawns(e) {
	const x = Math.min(0.999, Math.max(0.001, e))
	const cp = -250 * Math.log(1 / x - 1)
	return (cp >= 0 ? '+' : '−') + Math.abs(cp / 100).toFixed(1)
}

const shortLabel = computed(() => {
	const m = props.analysis?.mate
	if (m) {
		return '♚' + m.moves
	}
	if (props.format === 'pawns') {
		return pawns(E.value)
	}
	return String(Math.round(Math.max(E.value, 1 - E.value) * 100))
})

const ariaLabel = computed(() => {
	if (!props.analysis) {
		return t('quantumchess', 'Evaluation: analysing …')
	}
	const m = props.analysis.mate
	if (m) {
		return m.winner === 'w'
			? t('quantumchess', 'White wins for certain: ♚ in {n}', { n: m.moves })
			: t('quantumchess', 'Black wins for certain: ♚ in {n}', { n: m.moves })
	}
	if (props.format === 'pawns') {
		return t('quantumchess', 'Evaluation: {value}', { value: pawns(E.value) })
	}
	const pct = formatPercentNumber(Math.round(Math.max(E.value, 1 - E.value) * 100))
	return E.value >= 0.5
		? t('quantumchess', 'Evaluation: White {pct}', { pct })
		: t('quantumchess', 'Evaluation: Black {pct}', { pct })
})
</script>

<style lang="scss" scoped>
.qc-eval {
	position: absolute;
	background: #3a3a3a;
	border-radius: var(--border-radius-small, 4px);
	box-shadow: 0 0 0 1px var(--color-border);

	&--vertical {
		inset-block: 0;
		inset-inline-end: calc(100% + 4px);
		width: 12px;
	}

	&--horizontal {
		inset-inline: 0;
		bottom: calc(100% + 1px);
		height: 5px;
	}

	&--pending {
		opacity: 0.6;
	}
}

.qc-eval__track {
	position: absolute;
	inset: 0;
	overflow: hidden;
	border-radius: inherit;
}

.qc-eval__white {
	position: absolute;
	inset-inline: 0;
	background: #f4f4f4;
	transition: height 400ms ease, width 400ms ease;

	.qc-eval--horizontal & {
		inset-inline: auto;
		inset-block: 0;
	}
}

.qc-eval__fog {
	position: absolute;
	inset-inline: 0;
	background: repeating-linear-gradient(45deg, rgba(128, 128, 128, 0.55) 0 2px, rgba(128, 128, 128, 0.2) 2px 4px);

	.qc-eval--horizontal & {
		inset-inline: auto;
		inset-block: 0;
	}
}

.qc-eval__label {
	position: absolute;
	left: 50%;
	transform: translateX(-50%);
	font-size: 8px;
	line-height: 1;
	font-weight: bold;
	white-space: nowrap;
	text-align: center;
	pointer-events: none;

	&--long {
		font-size: 7px;
		letter-spacing: -0.5px;
	}

	&--white {
		bottom: 2px;
		color: #333;
	}

	&--black {
		top: 2px;
		color: #eee;
	}

	.qc-eval--flipped &--white {
		bottom: auto;
		top: 2px;
	}

	.qc-eval--flipped &--black {
		top: auto;
		bottom: 2px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-eval__white {
		transition: none;
	}
}
</style>
