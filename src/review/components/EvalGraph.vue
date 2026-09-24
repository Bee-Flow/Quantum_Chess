<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The evaluation graph of a review: White's E over the game as a light area, a dashed segment at each roll from the
  expected to the realised E (🎲), and quality dots (?! yellow, ? orange, ?? red, ✦ teal). Clicking a point selects that
  position.
-->
<template>
	<figure class="qc-graph">
		<svg
			class="qc-graph__svg"
			:viewBox="`0 0 ${W} ${H}`"
			preserveAspectRatio="none"
			role="img"
			:aria-label="t('quantumchess', 'Evaluation graph: White\'s winning chances over the game')"
			data-test="eval-graph"
			@click="onClick">
			<rect
				class="qc-graph__bg"
				x="0"
				y="0"
				:width="W"
				:height="H" />
			<path v-if="points.length > 1" class="qc-graph__area" :d="areaPath" />
			<line
				class="qc-graph__mid"
				x1="0"
				:y1="H / 2"
				:x2="W"
				:y2="H / 2" />
			<line
				v-for="r in rolls"
				:key="'r' + r.x"
				class="qc-graph__roll"
				:class="{ 'qc-graph__roll--good': r.good }"
				:x1="r.x"
				:x2="r.x"
				:y1="r.y1"
				:y2="r.y2" />
			<line
				v-if="current !== null"
				class="qc-graph__cursor"
				:x1="xOf(current)"
				:x2="xOf(current)"
				y1="0"
				:y2="H" />
			<circle
				v-for="d in dots"
				:key="'d' + d.x"
				class="qc-graph__dot"
				:class="'qc-graph__dot--' + d.label"
				:cx="d.x"
				:cy="d.y"
				r="3.2" />
		</svg>
		<figcaption class="qc-graph__legend">
			<span><i class="qc-graph__key qc-graph__key--inaccuracy" />{{ t('quantumchess', 'Inaccuracy') }}</span>
			<span><i class="qc-graph__key qc-graph__key--mistake" />{{ t('quantumchess', 'Mistake') }}</span>
			<span><i class="qc-graph__key qc-graph__key--blunder" />{{ t('quantumchess', 'Blunder') }}</span>
			<span><i class="qc-graph__key qc-graph__key--roll" />{{
				t('quantumchess', 'Roll: expected → result')
			}}</span>
		</figcaption>
	</figure>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import { qualityOfPly } from '../../coach/quality.js'

const props = defineProps({
	/** PlyAnalysis list (may still be growing) */
	plies: { type: Array, required: true },
	/** Number of moves in the game */
	total: { type: Number, required: true },
	/** Selected position (moves played), or null */
	current: { type: Number, default: null },
	/** The viewer's colour (green roll segments when a roll favoured them) */
	viewer: { type: String, default: 'w' },
	/** Quantum-move flags by ply index (for ✦) */
	quantum: { type: Array, default: () => [] },
})
const emit = defineEmits(['select'])

const W = 600
const H = 120
const PAD = 4

const xOf = (k) => PAD + (props.total ? (k * (W - 2 * PAD)) / props.total : 0)
const yOf = (E) => PAD + (1 - E) * (H - 2 * PAD)

const points = computed(() => {
	const out = []
	props.plies.forEach((p, i) => {
		if (i === 0) {
			out.push({ x: xOf(0), y: yOf(p.EBefore) })
		}
		const nextE = props.plies[i + 1]?.EBefore ?? p.realisedE
		out.push({ x: xOf(i + 1), y: yOf(nextE) })
	})
	return out
})

const areaPath = computed(() => {
	const pts = points.value
	const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
	return `${line} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
})

const rolls = computed(() => props.plies
	.map((p, i) => (p.outcomes
		? {
				x: xOf(i + 1),
				y1: yOf(p.playedE),
				y2: yOf(p.realisedE),
				good: (props.viewer === 'w' ? 1 : -1) * (p.realisedE - p.playedE) > 0,
			}
		: null))
	.filter((r) => r && Math.abs(r.y1 - r.y2) > 1))

const dots = computed(() => props.plies
	.map((p, i) => {
		const label = qualityOfPly(p, props.quantum[i]).label
		return ['inaccuracy', 'mistake', 'blunder', 'brilliant'].includes(label)
			? { x: xOf(i + 1), y: yOf(p.realisedE), label }
			: null
	})
	.filter(Boolean))

/**
 * Select the position nearest to the click.
 *
 * @param {MouseEvent} e click
 */
function onClick(e) {
	const rect = e.currentTarget.getBoundingClientRect()
	const x = ((e.clientX - rect.left) / rect.width) * W
	const k = Math.round(((x - PAD) / (W - 2 * PAD)) * props.total)
	emit('select', Math.max(0, Math.min(props.total, k)))
}
</script>

<style lang="scss" scoped>
.qc-graph {
	margin: 0;
}

.qc-graph__svg {
	display: block;
	width: 100%;
	height: 120px;
	border-radius: var(--border-radius-small, 4px);
	cursor: pointer;
}

.qc-graph__bg {
	fill: var(--qc-graph-black);
}

.qc-graph__area {
	fill: var(--qc-graph-white);
}

.qc-graph__mid {
	stroke: var(--qc-graph-midline);
	stroke-width: 1;
	stroke-dasharray: 3 3;
	vector-effect: non-scaling-stroke;
}

.qc-graph__roll {
	stroke: var(--qc-graph-roll);
	stroke-width: 2;
	stroke-dasharray: 3 2;
	vector-effect: non-scaling-stroke;

	&--good {
		stroke: var(--qc-graph-roll-good);
	}
}

.qc-graph__cursor {
	stroke: var(--color-primary-element);
	stroke-width: 2;
	vector-effect: non-scaling-stroke;
}

.qc-graph__dot {
	stroke: var(--qc-graph-dot-rim);
	stroke-width: 1;
	vector-effect: non-scaling-stroke;

	&--inaccuracy {
		fill: var(--qc-graph-inaccuracy);
	}

	&--mistake {
		fill: var(--qc-graph-mistake);
	}

	&--blunder {
		fill: var(--qc-graph-blunder);
	}

	&--brilliant {
		fill: var(--qc-graph-brilliant);
	}
}

.qc-graph__legend {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	margin-top: 4px;
	font-size: 0.85em;
	color: var(--color-text-maxcontrast);

	span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
}

.qc-graph__key {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;

	&--inaccuracy {
		background: var(--qc-graph-inaccuracy);
	}

	&--mistake {
		background: var(--qc-graph-mistake);
	}

	&--blunder {
		background: var(--qc-graph-blunder);
	}

	&--roll {
		width: 2px;
		height: 12px;
		border-radius: 0;
		background: var(--qc-graph-roll);
	}
}
</style>
