<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A player card: avatar, name and colour swatch, rating (online), budget pips, captured tray, king danger, turn status
  and the opponent's comment bubble.
-->
<template>
	<div
		class="qc-player"
		:class="{ 'qc-player--active': active, 'qc-player--compact': compact }"
		:data-test="'player-' + player.color">
		<div class="qc-player__avatar">
			<NcAvatar
				v-if="player.kind === 'user'"
				:user="player.userId ?? undefined"
				:displayName="player.name"
				:size="avatarSize"
				:disableMenu="!player.userId" />
			<span
				v-else-if="player.kind === 'engine'"
				class="qc-player__disc qc-player__disc--engine"
				:style="discStyle">
				<NcIconSvgWrapper :path="mdiRobotOutline" :size="Math.round(avatarSize * 0.6)" />
				<span class="qc-player__level">{{ player.level }}</span>
			</span>
			<span v-else-if="player.kind === 'ai'" class="qc-player__disc qc-player__disc--ai" :style="discStyle">
				<PersonaAvatar :persona="player.persona" :expression="expression" :size="avatarSize - 4" />
			</span>
			<span v-else class="qc-player__disc" :style="discStyle">
				<PieceIcon
					type="k"
					:color="player.color"
					:size="Math.round(avatarSize * 0.8)"
					decorative />
			</span>
		</div>

		<div class="qc-player__main">
			<div class="qc-player__line">
				<span class="qc-player__name" :title="player.name">{{ player.name }}</span>
				<span
					class="qc-player__swatch"
					:class="'qc-player__swatch--' + player.color"
					role="img"
					:aria-label="player.color === 'w'
						? t('quantumchess', 'plays White')
						: t('quantumchess', 'plays Black')" />
				<span v-if="ratingText" class="qc-player__rating">{{ ratingText }}</span>
				<span v-if="player.sourceLabel && !compact" class="qc-player__source">{{ player.sourceLabel }}</span>
			</div>
			<div class="qc-player__line qc-player__line--details">
				<BudgetPips :used="budgetUsed" :color="player.color" :state="state" />
				<span
					v-if="captured.length || materialLead > 0"
					class="qc-player__captured"
					:aria-label="capturedLabel">
					<PieceIcon
						v-for="(c, i) in captured"
						:key="i"
						:type="c"
						:color="player.color === 'w' ? 'b' : 'w'"
						:size="18"
						decorative />
					<span v-if="materialLead > 0" class="qc-player__lead">+{{ materialLead }}</span>
				</span>
				<KingDangerChip v-if="!hideDanger && dangerWeight > 0" :weight="dangerWeight" :opponent="!isMe" />
			</div>
		</div>

		<div class="qc-player__status" aria-live="polite">
			<span
				v-if="statusText"
				class="qc-player__status-text"
				:class="{ 'qc-player__status-text--turn': active && !player.thinking }">{{ statusText }}</span>
			<slot name="status" />
		</div>

		<div v-if="bubble" class="qc-player__bubble" :class="{ 'qc-player__bubble--top': bubbleAbove }">
			{{ bubble }}
		</div>
	</div>
</template>

<script setup>
import { mdiRobotOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import BudgetPips from '../../board/components/BudgetPips.vue'
import KingDangerChip from '../../board/components/KingDangerChip.vue'
import PieceIcon from '../../board/components/PieceIcon.vue'
import PersonaAvatar from '../../llm/components/PersonaAvatar.vue'
import { PIECE_VALUES } from '../../ai/levels.js'
import { budget, kingDanger, otherColor } from '../../engine/index.js'
import { moodToExpression } from '../../llm/personas.js'
import { formatRating } from '../../services/format.js'

const props = defineProps({
	/** PlayerInfo */
	player: { type: Object, required: true },
	/** Engine state */
	state: { type: Object, required: true },
	/** This side is to move */
	active: { type: Boolean, default: false },
	/** Hide the king danger chip */
	hideDanger: { type: Boolean, default: false },
	/** This card is the local user's */
	isMe: { type: Boolean, default: false },
	/** Phone size */
	compact: { type: Boolean, default: false },
	/** Show the bubble above the card (bottom card) */
	bubbleAbove: { type: Boolean, default: false },
	/** Game over */
	over: { type: Boolean, default: false },
})

const avatarSize = computed(() => (props.compact ? 28 : 32))
const discStyle = computed(() => ({ width: avatarSize.value + 'px', height: avatarSize.value + 'px' }))
const budgetUsed = computed(() => budget(toRaw(props.state), props.player.color))
const dangerWeight = computed(() => (props.over ? 0 : kingDanger(toRaw(props.state), props.player.color)))
const ratingText = computed(() => formatRating(props.player.rating ?? null, props.player.provisional))

const ORDER = ['q', 'r', 'b', 'n', 'p']
/** Types of the pieces this player captured (enemy ids in `state.captured`), grouped by value. */
const captured = computed(() => {
	const s = toRaw(props.state)
	const enemyWhite = props.player.color === 'b'
	const list = s.captured
		.filter((id) => (id < 16) === enemyWhite)
		.map((id) => s.types[id])
		.filter((type) => type !== 'k')
	return list.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
})

/**
 * Material captured by a colour, in pawns.
 *
 * @param {'w'|'b'} color capturer
 * @return {number}
 */
function capturedValue(color) {
	const s = toRaw(props.state)
	return s.captured
		.filter((id) => (id < 16) === (color === 'b'))
		.reduce((sum, id) => sum + (PIECE_VALUES[s.types[id]] ?? 0), 0) / 100
}
const materialLead = computed(() => {
	const other = otherColor(props.player.color)
	return Math.round(capturedValue(props.player.color) - capturedValue(other))
})
const capturedLabel = computed(() => t('quantumchess', 'Captured pieces: {n}', { n: captured.value.length }))

// Status text.
const now = ref(Date.now())
const clock = setInterval(() => {
	now.value = Date.now()
}, 1000)
onBeforeUnmount(() => clearInterval(clock))

const statusText = computed(() => {
	const p = props.player
	if (props.over) {
		return ''
	}
	if (p.thinking) {
		if (p.kind === 'engine') {
			return p.thinking.depth
				? t('quantumchess', 'Thinking… depth {depth}', { depth: p.thinking.depth })
				: t('quantumchess', 'Thinking…')
		}
		if (p.queued && (p.elapsedMs ?? 0) >= 3000) {
			return t('quantumchess', 'Queued in your Nextcloud AI…')
		}
		const text = t('quantumchess', '{name} is thinking…', { name: p.name })
		return (p.elapsedMs ?? 0) >= 10000 ? text + ' ' + t('quantumchess', '(AI can take a minute)') : text
	}
	if (p.statusText) {
		return p.statusText
	}
	if (!props.active) {
		return ''
	}
	return props.isMe
		? '● ' + t('quantumchess', 'Your move')
		: '● ' + t('quantumchess', '{name} to move', { name: p.name })
})

// The comment bubble shows for 6 s.
const bubble = ref('')
let bubbleTimer = null
watch(() => props.player.comment, (c) => {
	clearTimeout(bubbleTimer)
	if (c?.text && Date.now() - (c.at ?? 0) < 6000) {
		bubble.value = c.text
		bubbleTimer = setTimeout(() => {
			bubble.value = ''
		}, 6000 - (Date.now() - (c.at ?? 0)))
	} else {
		bubble.value = ''
	}
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(bubbleTimer))

const expression = computed(() => moodToExpression(props.player.comment?.mood ?? null))
</script>

<style lang="scss" scoped>
.qc-player {
	position: relative;
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 52px;
	padding: 4px 10px 4px 8px;
	border-inline-start: 3px solid transparent;
	border-radius: var(--border-radius-large);
	transition: background-color 200ms ease, border-color 200ms ease;
}

.qc-player--compact {
	gap: 8px;
	min-height: 44px;
	padding: 2px 6px;
}

.qc-player--active {
	border-inline-start-color: var(--qc-accent, var(--color-primary-element));
	background: var(--qc-accent-soft, var(--color-primary-element-light));
}

.qc-player__avatar {
	flex: none;
}

.qc-player__disc {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: var(--color-background-dark);
	color: var(--color-main-text);
}

.qc-player__disc--engine {
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
}

.qc-player__disc--ai {
	box-shadow: 0 0 0 2px var(--qc-ai);
}

.qc-player__level {
	position: absolute;
	inset-block-end: -4px;
	inset-inline-end: -4px;
	min-width: 16px;
	height: 16px;
	border-radius: 8px;
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	font-size: 11px;
	font-weight: bold;
	line-height: 16px;
	text-align: center;
}

.qc-player__main {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.qc-player__line {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.qc-player__line--details {
	flex-wrap: wrap;
	gap: 4px 10px;
}

.qc-player__name {
	overflow: hidden;
	font-weight: bold;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-player__swatch {
	flex: none;
	width: 12px;
	height: 12px;
	border: 1px solid var(--color-border-dark);
	border-radius: 2px;
}

.qc-player__swatch--w {
	background: var(--qc-swatch-white);
}

.qc-player__swatch--b {
	background: var(--qc-swatch-black);
}

.qc-player__rating,
.qc-player__source {
	color: var(--color-text-maxcontrast);
	white-space: nowrap;
}

.qc-player__captured {
	display: inline-flex;
	align-items: center;
}

.qc-player__lead {
	margin-inline-start: 4px;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-player__status {
	display: flex;
	flex: none;
	flex-direction: column;
	align-items: flex-end;
	gap: 4px;
	max-width: 45%;
	text-align: end;
}

.qc-player__status-text {
	color: var(--color-text-maxcontrast);
}

.qc-player__status-text--turn {
	color: var(--color-main-text);
	font-weight: bold;
}

.qc-player__bubble {
	position: absolute;
	z-index: 5;
	inset-block-start: calc(100% + 4px);
	inset-inline-start: 44px;
	display: -webkit-box;
	overflow: hidden;
	max-width: min(360px, calc(100% - 52px));
	padding: 6px 10px;
	border: 1px solid var(--qc-ai);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	box-shadow: 0 2px 8px var(--color-box-shadow);
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-height: 1.4;
	pointer-events: none;
}

.qc-player__bubble--top {
	inset-block: auto calc(100% + 4px);
}
</style>
