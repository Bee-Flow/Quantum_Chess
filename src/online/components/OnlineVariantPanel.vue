<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The online panel of a running chess variant game (in the `online` slot of VariantGameView, put together by
  views/OnlineVariantGame.vue): the players, whose move it is or how the game ended, what keeps this device from
  playing along (a changed history, a dispute), the draw offer, Offer draw and Abort, and the chat. Resign is the
  board's own button.
-->
<template>
	<section class="qc-vonline" data-test="variant-online">
		<ul class="qc-vonline__players">
			<li v-for="p in players" :key="p.seat" :class="{ 'qc-vonline__player--turn': p.toMove }">
				<!-- TRANSLATORS: an online variant game's player: {side} is White, Black, Sente…; {name} the user -->
				{{ t('quantumchess', '{side}: {name}', { side: p.side, name: p.name }) }}
				<small v-if="p.me">{{ t('quantumchess', '(you)') }}</small>
			</li>
		</ul>
		<p class="qc-vonline__status" role="status">
			<template v-if="ended">
				<strong>{{ ended.title }}</strong>
				<span v-if="ended.reason"> · {{ ended.reason }}</span>
			</template>
			<template v-else-if="yourMove">
				{{ t('quantumchess', 'Your move') }}
			</template>
			<template v-else-if="waitingFor">
				{{ t('quantumchess', 'Waiting for {name}', { name: waitingFor }) }}
			</template>
		</p>
		<p v-if="online.problem.value === 'disputed'" class="qc-vonline__warning">
			{{ t('quantumchess', 'A move did not agree with the rules on this device. The game was annulled.') }}
		</p>
		<p v-else-if="online.problem.value === 'altered'" class="qc-vonline__warning">
			{{ t('quantumchess', 'The stored history of this game was changed after it was played.') }}
		</p>
		<div v-if="drawOffer" class="qc-vonline__offer" data-test="draw-offer">
			<span>{{ drawOffer }}</span>
			<span v-if="c.can.value.answerDraw" class="qc-vonline__buttons">
				<NcButton size="small" :disabled="busy" @click="run(() => c.answerDraw(false))">
					{{ t('quantumchess', 'Decline') }}
				</NcButton>
				<NcButton
					size="small"
					variant="primary"
					:disabled="busy"
					@click="run(() => c.answerDraw(true))">
					{{ t('quantumchess', 'Accept draw') }}
				</NcButton>
			</span>
		</div>
		<div v-if="c.can.value.offerDraw || c.can.value.abort" class="qc-vonline__buttons">
			<NcButton
				v-if="c.can.value.offerDraw"
				size="small"
				:disabled="busy"
				@click="run(() => c.offerDraw())">
				{{ t('quantumchess', 'Offer draw') }}
			</NcButton>
			<NcButton
				v-if="c.can.value.abort"
				size="small"
				:disabled="busy"
				@click="run(() => c.abort())">
				{{ t('quantumchess', 'Abort') }}
			</NcButton>
		</div>
		<GameChat v-if="c.participant.value" :controller="c" class="qc-vonline__chat" />
	</section>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import GameChat from './GameChat.vue'
import { resultText } from '../../game/resultText.js'
import { sideName } from '../../variants/index.js'

const props = defineProps({
	/** The online controller of the game (useOnlineGame). */
	controller: {
		type: Object,
		required: true,
	},
	/** The board of the game (useOnlineVariantGame). */
	online: {
		type: Object,
		required: true,
	},
})

const c = props.controller
const online = props.online

const busy = ref(false)

/**
 * Run an action of the online controller once at a time.
 *
 * @param {() => Promise<unknown>} fn the action
 */
async function run(fn) {
	busy.value = true
	try {
		await fn()
	} finally {
		busy.value = false
	}
}

const g = computed(() => c.game.value)
const V = computed(() => online.game.V.value)

/** The players by seat: side name, display name, whether it is the viewer and whether it is their move. */
const players = computed(() => {
	if (!V.value || !g.value) {
		return []
	}
	return [0, 1].map((seat) => {
		const color = seat === 0 ? 'w' : 'b'
		return {
			seat,
			side: sideName(V.value, seat),
			name: c.names.value[color],
			me: online.mySeat.value === seat,
			toMove: g.value.status === 'active' && g.value.turn === color,
		}
	})
})

const yourMove = computed(() => g.value?.status === 'active' && g.value.turn === g.value.myColor)

const waitingFor = computed(() => (g.value?.status === 'active' ? c.names.value[g.value.turn] : ''))

/** How the game ended on the server: the headline and the reason. */
const ended = computed(() => {
	const game = g.value
	if (!game || (game.status !== 'finished' && game.status !== 'aborted')) {
		return null
	}
	return resultText(game.result ?? '*', game.resultReason ?? 'aborted', c.names.value)
})

/** The open draw offer in words. */
const drawOffer = computed(() => {
	const offer = c.drawOffer.value
	if (!offer || g.value?.status !== 'active') {
		return ''
	}
	return offer.by === g.value.myColor
		? t('quantumchess', 'You offered a draw.')
		: t('quantumchess', '{name} offers a draw.', { name: c.names.value[offer.by] })
})
</script>

<style scoped>
.qc-vonline {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 8px 0 12px;
	border-bottom: 1px solid var(--color-border);
	margin-bottom: 8px;
}

.qc-vonline__players {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 16px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-vonline__player--turn {
	font-weight: bold;
}

.qc-vonline__status {
	margin: 0;
}

.qc-vonline__warning {
	margin: 0;
	padding: 6px 8px;
	border-radius: var(--border-radius);
	background: var(--color-warning-element-light, var(--color-background-dark));
}

.qc-vonline__offer {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.qc-vonline__buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.qc-vonline__chat {
	max-height: 320px;
}
</style>
