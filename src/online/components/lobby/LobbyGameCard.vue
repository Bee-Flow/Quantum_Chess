<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One game of the lobby: a small board, the other player with avatar and status, a status line and badges; the board and
  the title open the game, the actions slot holds the inline buttons.
-->
<template>
	<li class="qc-lobby-card" :class="{ 'qc-lobby-card--turn': highlight }" :data-test="'lobby-game-' + game.id">
		<router-link
			class="qc-lobby-card__board"
			:to="`/game/${game.id}`"
			tabindex="-1"
			aria-hidden="true">
			<MiniBoard
				v-if="game.preview?.length"
				:pieces="game.preview"
				:size="boardSize"
				:orientation="game.myColor ?? 'w'" />
			<span v-else class="qc-lobby-card__placeholder" :style="{ width: boardSize + 'px', height: boardSize + 'px' }">
				<NcAvatar
					v-if="other?.userId"
					:user="other.userId"
					:displayName="other.displayName"
					:size="Math.round(boardSize / 2)"
					disableMenu />
				<NcIconSvgWrapper v-else :path="mdiAccountQuestionOutline" :size="Math.round(boardSize / 2)" />
			</span>
		</router-link>
		<div class="qc-lobby-card__main">
			<router-link class="qc-lobby-card__title" :to="`/game/${game.id}`">
				<NcAvatar
					v-if="other?.userId && game.preview?.length"
					:user="other.userId"
					:displayName="other.displayName"
					:size="24"
					disableMenu />
				<span class="qc-lobby-card__name">{{ title }}</span>
			</router-link>
			<span class="qc-lobby-card__line">{{ line }}</span>
			<span class="qc-lobby-card__badges">
				<span v-if="game.rated || game.ratedRequested" class="qc-lobby-card__badge">{{ t('quantumchess', 'Rated') }}</span>
				<span class="qc-lobby-card__badge qc-lobby-card__badge--plain" :title="timeControlText(game.timeControl)">
					<NcIconSvgWrapper :path="game.timeControl === 'corr:none' ? mdiInfinity : mdiTimerSandComplete" :size="14" />
					{{ timeControlText(game.timeControl) }}
				</span>
			</span>
			<p v-if="game.inviteMessage && (kind === 'invite' || kind === 'open')" class="qc-lobby-card__message">
				“{{ game.inviteMessage }}”
			</p>
			<div v-if="$slots.default" class="qc-lobby-card__actions">
				<slot />
			</div>
		</div>
	</li>
</template>

<script setup>
import { mdiAccountQuestionOutline, mdiInfinity, mdiTimerSandComplete } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import MiniBoard from '../../../board/components/MiniBoard.vue'
import { formatRelative } from '../../../services/format.js'
import { currentUser } from '../../../services/initialState.js'
import { colorText, otherPlayer, progressText, timeControlText } from '../../summaryText.js'

const props = defineProps({
	/** GameSummary */
	game: { type: Object, required: true },
	/** turn | waiting | invite | outgoing | open */
	kind: { type: String, required: true },
	/** Server time (Unix seconds) */
	now: { type: Number, default: () => Date.now() / 1000 },
	/** Board size in px */
	boardSize: { type: Number, default: 96 },
})

const me = currentUser.uid
const other = computed(() => otherPlayer(props.game, me))
const highlight = computed(() => props.kind === 'turn' || props.kind === 'invite')

const title = computed(() => {
	const name = other.value?.displayName ?? ''
	switch (props.kind) {
		case 'invite':
			return props.game.rematchOf
				? t('quantumchess', '{name} wants a rematch', { name })
				: t('quantumchess', '{name} invites you', { name })
		case 'open':
			return t('quantumchess', 'Open challenge by {name}', { name })
		case 'outgoing':
			return props.game.status === 'open'
				? t('quantumchess', 'Your open challenge')
				: t('quantumchess', 'Invitation to {name}', { name })
		default:
			return t('quantumchess', 'vs {name}', { name })
	}
})

const line = computed(() => {
	const g = props.game
	if (props.kind === 'invite' || props.kind === 'open') {
		return colorText(g, me)
	}
	if (props.kind === 'outgoing') {
		return g.expiresAt
			? t('quantumchess', 'Waiting for an answer · expires {when}', { when: new Date(g.expiresAt * 1000).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) })
			: t('quantumchess', 'Waiting for an answer')
	}
	if (props.kind === 'waiting') {
		const moved = g.lastMoveAt ? formatRelative(g.lastMoveAt, props.now) : ''
		return moved ? `${progressText(g, props.now)} · ${t('quantumchess', 'you moved {when}', { when: moved })}` : progressText(g, props.now)
	}
	return progressText(g, props.now)
})
</script>

<style lang="scss" scoped>
.qc-lobby-card {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
}

.qc-lobby-card--turn {
	border-inline-start: 3px solid var(--color-primary-element);
}

.qc-lobby-card__board {
	flex: 0 0 auto;
	line-height: 0;
}

.qc-lobby-card__placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--border-radius);
	background: var(--color-background-dark);
	color: var(--color-text-maxcontrast);
}

.qc-lobby-card__main {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.qc-lobby-card__title {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--color-main-text);
	font-weight: bold;

	&:hover,
	&:focus-visible {
		text-decoration: underline;
	}
}

.qc-lobby-card__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-lobby-card__line {
	color: var(--color-text-maxcontrast);
}

.qc-lobby-card__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.qc-lobby-card__badge {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 0 8px;
	border-radius: var(--border-radius-pill);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-size: 12px;
	line-height: 20px;
}

.qc-lobby-card__badge--plain {
	background: var(--color-background-dark);
	color: var(--color-text-maxcontrast);
}

.qc-lobby-card__message {
	margin: 0;
	font-style: italic;
	overflow-wrap: anywhere;
}

.qc-lobby-card__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 4px;
}
</style>
