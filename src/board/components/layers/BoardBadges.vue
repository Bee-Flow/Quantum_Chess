<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Layer 3 of the board, above the pieces: the probability badges of ghost parts and kings (with the identity dot of a
  ghost), the change labels of the what-if view, the percentages of the coach's crosshairs and the link glyphs on the
  pieces linked to the focused ghost.
-->
<template>
	<div class="qc-board__badges" aria-hidden="true">
		<span
			v-for="b in badges"
			:key="b.key"
			class="qc-badge"
			:class="b.classes"
			:style="b.style">
			<span v-if="b.dot" class="qc-badge__dot" :style="{ background: `var(--qc-id-${b.dot})` }" />{{ b.text }}
		</span>
		<span
			v-for="d in deltas"
			:key="'d' + d.square"
			class="qc-delta"
			:class="d.up ? 'qc-delta--up' : 'qc-delta--down'"
			:style="d.style">{{ d.text }}</span>
		<span
			v-for="m in coachLabels"
			:key="'cl' + m.square"
			class="qc-coach-pct"
			:class="'qc-coach-pct--' + m.kind"
			:style="m.style">{{ m.text }}</span>
		<span
			v-for="l in linkGlyphs"
			:key="'l' + l.square"
			class="qc-link-glyph"
			:style="l.style">
			<svg viewBox="0 0 24 24" width="12" height="12"><path :d="mdiLinkVariant" /></svg>
		</span>
	</div>
</template>

<script setup>
import { mdiLinkVariant } from '@mdi/js'

defineProps({
	/** Probability badges, from `badgeList()` */
	badges: { type: Array, default: () => [] },
	/** What-if change labels, from `deltaList()` */
	deltas: { type: Array, default: () => [] },
	/** Coach percentages, from `coachLabelList()` */
	coachLabels: { type: Array, default: () => [] },
	/** Link glyphs, from `linkGlyphList()` */
	linkGlyphs: { type: Array, default: () => [] },
})
</script>

<style lang="scss" scoped>
.qc-coach-pct {
	position: absolute;
	transform: translateY(-100%);
	padding: 0 4px;
	border-radius: var(--border-radius-pill, 999px);
	background: var(--qc-ring-danger);
	color: #fff;
	font-weight: 700;
	line-height: 1.3;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	&--opportunity {
		background: var(--color-primary-element);
		color: var(--color-primary-element-text);
	}
}

.qc-board__badges {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 3;
}

.qc-badge {
	position: absolute;
	transform: translateX(-100%);
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 4px;
	border-radius: var(--border-radius-pill, 999px);
	background: rgb(255 255 255 / 0.92);
	border: 1px solid var(--qc-board-ring);
	color: #111;
	font-weight: 700;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	&--king {
		border-color: var(--qc-ring-warning);
	}

	&--danger {
		border-color: var(--qc-ring-danger);
		background: var(--qc-ring-danger);
		color: #fff;
	}

	&--chosen {
		background: var(--qc-board-ring);
		color: #fff;
	}
}

.qc-badge__dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
}

.qc-delta {
	position: absolute;
	transform: translate(-50%, -100%);
	padding: 0 4px;
	border-radius: var(--border-radius-pill, 999px);
	background: #fff;
	font-size: 11px;
	font-weight: 700;
	white-space: nowrap;

	&--up {
		color: var(--qc-corr-up);
		box-shadow: 0 0 0 1px var(--qc-corr-up);
	}

	&--down {
		color: var(--qc-corr-down);
		box-shadow: 0 0 0 1px var(--qc-corr-down);
	}
}

.qc-link-glyph {
	position: absolute;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 0 0 1px var(--qc-board-ring);

	path {
		fill: var(--qc-board-ring);
	}
}
</style>
