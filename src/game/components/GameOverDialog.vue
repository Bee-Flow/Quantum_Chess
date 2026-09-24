<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Game over: the tipped king (or ½), the headline from the player's point of view, the reason in plain words, the score
  line, the game summary and the actions, with variants per result and quantum confetti on a win.
-->
<template>
	<NcDialog
		:name="headline"
		size="normal"
		class="qc-game-over"
		data-test="game-over"
		@update:open="(v) => !v && emit('close')">
		<div class="qc-game-over__body">
			<div class="qc-game-over__figure" aria-hidden="true">
				<span v-if="result.winner === null" class="qc-game-over__half">½</span>
				<PieceIcon
					v-else
					type="k"
					:color="result.winner === 'w' ? 'b' : 'w'"
					:size="64"
					class="qc-game-over__king"
					decorative />
			</div>
			<p class="qc-game-over__reason">
				{{ reasonText }}
			</p>
			<div class="qc-game-over__score">
				<span class="qc-game-over__player">{{ players.w.name }}</span>
				<strong>{{ score }}</strong>
				<span class="qc-game-over__player">{{ players.b.name }}</span>
			</div>
			<p v-if="ratingLine" class="qc-game-over__rating">
				{{ ratingLine }}
			</p>
			<ul class="qc-game-over__summary">
				<li>{{ n('quantumchess', '%n move', '%n moves', summary.moves) }}</li>
				<li>{{ n('quantumchess', '%n roll', '%n rolls', summary.rolls) }}</li>
				<li>{{ n('quantumchess', '%n rare result', '%n rare results', summary.rare) }}</li>
				<li v-if="summary.converging">
					{{ t('quantumchess', 'Converging captures: {n}', { n: summary.converging }) }}
				</li>
			</ul>
			<p v-if="lossLine" class="qc-game-over__line">
				{{ lossLine }}
			</p>
		</div>
		<template #actions>
			<NcButton @click="emit('close')">
				{{ t('quantumchess', 'Close') }}
			</NcButton>
			<NcButton :variant="primary === 'new' ? 'primary' : 'secondary'" @click="emit('newGame')">
				{{ t('quantumchess', 'New game') }}
			</NcButton>
			<NcButton :variant="primary === 'review' ? 'primary' : 'secondary'" @click="emit('review')">
				{{ primary === 'review'
					? t('quantumchess', 'Review with the coach')
					: t('quantumchess', 'Review game') }}
			</NcButton>
			<NcButton
				v-if="nextLevel"
				:variant="primary === 'next' ? 'primary' : 'secondary'"
				data-test="next-level"
				@click="emit('nextLevel')">
				{{ t('quantumchess', 'Play level {n} ({name})', { n: nextLevel.level, name: nextLevel.name }) }}
			</NcButton>
			<NcButton
				:variant="primary === 'rematch' ? 'primary' : 'secondary'"
				data-test="rematch"
				@click="emit('rematch')">
				{{ rematchState === 'pending'
					? t('quantumchess', 'Rematch requested ✓')
					: t('quantumchess', 'Rematch') }}
			</NcButton>
		</template>
		<ConfettiFx v-if="celebrate" />
	</NcDialog>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import PieceIcon from '../../board/components/PieceIcon.vue'
import ConfettiFx from './ConfettiFx.vue'
import { LEVELS } from '../../ai/levels.js'
import { otherColor } from '../../engine/index.js'
import { reducedMotion } from '../../services/preferences.js'
import { reasonCopy } from '../resultText.js'

const props = defineProps({
	/** GameResult {result, reason, winner} */
	result: { type: Object, required: true },
	/** {w, b} PlayerInfo */
	players: { type: Object, required: true },
	/** The local user's colour, null in pass & play */
	myColor: { type: String, default: null },
	/** {moves, rolls, rare, converging} */
	summary: { type: Object, required: true },
	/** {w, b} rating change (online) */
	ratingChange: { type: Object, default: null },
	/** online | computer | ai | local */
	kind: { type: String, required: true },
	/** Computer level */
	level: { type: Number, default: null },
	/** Online rematch state: null | pending */
	rematchState: { type: String, default: null },
	/** Extra context for the reason copy {captureProbability, square} */
	extra: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['rematch', 'review', 'newGame', 'nextLevel', 'close'])

const names = computed(() => ({ w: props.players.w.name, b: props.players.b.name }))
const outcome = computed(() => {
	if (props.result.winner === null) {
		return 'draw'
	}
	if (props.myColor === null) {
		return 'win'
	}
	return props.result.winner === props.myColor ? 'win' : 'loss'
})

const headline = computed(() => {
	if (props.result.reason === 'aborted' || props.result.reason === 'abandoned') {
		return t('quantumchess', 'Game aborted')
	}
	if (outcome.value === 'draw') {
		return t('quantumchess', 'Draw')
	}
	if (props.myColor === null) {
		return t('quantumchess', '{name} won!', { name: names.value[props.result.winner] })
	}
	return outcome.value === 'win' ? t('quantumchess', 'You won!') : t('quantumchess', 'You lost')
})

const reasonText = computed(() => reasonCopy(props.result.reason, {
	winner: props.result.winner,
	names: names.value,
	...props.extra,
}))
const score = computed(() => (props.result.winner === null
	? '½ – ½'
	: (props.result.winner === 'w' ? '1 – 0' : '0 – 1')))

const ratingLine = computed(() => {
	if (!props.ratingChange || !props.myColor) {
		return ''
	}
	const d = props.ratingChange[props.myColor]
	const before = props.players[props.myColor].rating
	if (typeof d !== 'number' || typeof before !== 'number') {
		return ''
	}
	return t(
		'quantumchess',
		'Rating {before} → {after} ({delta})',
		{ before: before - d, after: before, delta: (d >= 0 ? '+' : '') + d },
	)
})

const nextLevel = computed(() => {
	if (props.kind !== 'computer' || outcome.value !== 'win' || !props.level || props.level >= 5) {
		return null
	}
	return LEVELS[props.level]
})

const primary = computed(() => {
	if (nextLevel.value) {
		return 'next'
	}
	if (outcome.value === 'loss') {
		return 'review'
	}
	return 'rematch'
})

const lossLine = computed(() => {
	if (outcome.value !== 'loss' || props.result.reason !== 'king_captured') {
		return ''
	}
	const other = otherColor(props.myColor)
	return t('quantumchess', '{name} captured your king. Good game.', { name: names.value[other] })
})

const celebrate = computed(() => outcome.value === 'win' && !reducedMotion.value)
</script>

<style lang="scss" scoped>
.qc-game-over__body {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding: 8px 0 16px;
	text-align: center;
}

.qc-game-over__figure {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 72px;
}

.qc-game-over__king {
	transform: rotate(90deg);
	transform-origin: 50% 50%;
	animation: qc-tip 400ms ease-in both;
}

@keyframes qc-tip {
	from {
		transform: rotate(0);
	}

	to {
		transform: rotate(90deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-game-over__king {
		animation: none;
	}
}

.qc-game-over__half {
	font-size: 56px;
	font-weight: bold;
	line-height: 1;
}

.qc-game-over__reason {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 15px;
}

.qc-game-over__score {
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 18px;
}

.qc-game-over__player {
	max-width: 14ch;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-game-over__rating,
.qc-game-over__line {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-game-over__summary {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	margin: 4px 0 0;
	padding: 0;
	list-style: none;

	li {
		padding: 4px 12px;
		border-inline-start: 1px solid var(--color-border);

		&:first-child {
			border-inline-start: none;
		}
	}
}
</style>

<style lang="scss">
// NcDialog renders its action row outside this component's scope. Up to five actions do not fit in one row: wrap
// them, and stack them on phones with the main action on top, instead of cutting their labels.
.qc-game-over .dialog__actions {
	flex-wrap: wrap;
	row-gap: 8px;
}

@media (max-width: 600px) {
	.qc-game-over .dialog__actions {
		flex-direction: column;
		align-items: stretch;

		.button-vue {
			width: 100%;
		}

		.button-vue--primary {
			order: -1;
		}
	}
}
</style>
