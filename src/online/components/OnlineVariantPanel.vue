<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The online panel of a running chess variant game (in the `online` slot of VariantGameView, put together by
  views/OnlineVariantGame.vue): the players, whose move it is or how the game ended, what keeps this device from
  playing along (a changed history, a dispute), the draw offer, Offer draw and Abort, after the end the rematch (ask
  for one, accept or decline one, wait for the others, go to it), and the chat. Resign is the board's own button.
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
		<div v-if="ended && rematch" class="qc-vonline__offer" data-test="variant-rematch">
			<span v-if="rematch.text">{{ rematch.text }}</span>
			<span class="qc-vonline__buttons">
				<template v-if="rematch.kind === 'offered'">
					<NcButton size="small" :disabled="busy" @click="run(() => c.declineRematch())">
						{{ t('quantumchess', 'Decline') }}
					</NcButton>
					<NcButton
						size="small"
						variant="primary"
						:disabled="busy"
						@click="run(() => c.rematch())">
						{{ t('quantumchess', 'Accept rematch') }}
					</NcButton>
				</template>
				<NcButton
					v-else-if="rematch.kind === 'pending' && rematch.mine"
					size="small"
					:disabled="busy"
					@click="run(() => c.cancelRematch())">
					{{ t('quantumchess', 'Cancel') }}
				</NcButton>
				<NcButton v-else-if="rematch.kind === 'on'" size="small" :to="`/game/${rematch.id}`">
					{{ t('quantumchess', 'Go to the rematch') }}
				</NcButton>
				<NcButton
					v-else-if="rematch.kind === 'ask'"
					size="small"
					:disabled="busy"
					data-test="variant-rematch-ask"
					@click="run(() => c.rematch())">
					{{ t('quantumchess', 'Rematch') }}
				</NcButton>
			</span>
		</div>
		<GameChat v-if="c.participant.value" :controller="c" class="qc-vonline__chat" />
	</section>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import GameChat from './GameChat.vue'
import { resultText } from '../../game/resultText.js'
import { currentUser } from '../../services/initialState.js'
import { reasonText } from '../../variantplay/texts.js'
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
	const multi = Array.isArray(g.value.seats)
	return V.value.sides.map((side, seat) => {
		const color = multi ? String(seat) : seat === 0 ? 'w' : 'b'
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
	if (Array.isArray(game.seats)) {
		return seatedEnd(game)
	}
	return resultText(game.result ?? '*', game.resultReason ?? 'aborted', c.names.value)
})

/**
 * How a game with more than two seats ended: the winning players from the variant result code ("win:0,2/king"), a
 * draw, or an aborted or annulled game, with the reason.
 *
 * @param {object} game the game
 * @return {{title: string, reason: string}}
 */
function seatedEnd(game) {
	const reason = game.resultReason ?? ''
	if (game.status === 'aborted') {
		if (reason === 'disputed') {
			const why = t('quantumchess', 'The players’ devices disagreed about a move')
			return { title: t('quantumchess', 'Game annulled'), reason: why }
		}
		return { title: t('quantumchess', 'Game aborted'), reason: '' }
	}
	const match = /^win:([\d,]+)\//.exec(game.variantResult ?? '')
	const winners = match ? match[1].split(',').map((n) => c.names.value[n]) : []
	const title = winners.length
		// TRANSLATORS: the winners of a game of four, such as "Alice & Carol won"
		? n('quantumchess', '{names} won', '{names} won', winners.length, { names: winners.join(' & ') })
		: t('quantumchess', 'Draw')
	const words = {
		resignation: t('quantumchess', 'A player resigned'),
		timeout: t('quantumchess', 'A player ran out of time'),
		abandoned: t('quantumchess', 'The game was abandoned'),
		agreement: t('quantumchess', 'Draw by agreement'),
		player_deleted: t('quantumchess', 'A player’s account was deleted'),
	}
	return { title, reason: words[reason] ?? (V.value ? reasonText(V.value, reason) : reason) }
}

/**
 * The rematch after the end: `offered` (another player asks; for a game of four, while the viewer has not taken their
 * seat), `pending` (the viewer's own offer, or their seat taken, waits for the others), `on` (it started), or `ask`.
 */
const rematch = computed(() => {
	const r = c.rematchGame.value
	const state = c.rematchState.value
	if (r?.status === 'active' && r.myColor) {
		return { kind: 'on', id: r.id, text: t('quantumchess', 'The rematch is on.') }
	}
	if (state === 'offered') {
		const name = r.creator?.displayName ?? r.creator?.userId ?? ''
		return { kind: 'offered', text: t('quantumchess', '{name} wants a rematch', { name }) }
	}
	if (state === 'pending') {
		const mine = r.creator?.userId === currentUser.uid
		const other = r.opponent?.displayName ?? r.opponent?.userId ?? ''
		const text = Array.isArray(r.seats)
			? t('quantumchess', 'Rematch: waiting for the other players.')
			: t('quantumchess', 'You asked {name} for a rematch. Waiting for an answer.', { name: other })
		return { kind: 'pending', mine, text }
	}
	return c.can.value.rematch ? { kind: 'ask', text: '' } : null
})

/** The open draw offer in words. */
const drawOffer = computed(() => {
	const offer = c.drawOffer.value
	if (!offer || g.value?.status !== 'active') {
		return ''
	}
	const text = offer.by === g.value.myColor
		? t('quantumchess', 'You offered a draw.')
		: t('quantumchess', '{name} offers a draw.', { name: c.names.value[offer.by] })
	const votes = g.value.drawVotes
	if (!Array.isArray(g.value.seats) || !Array.isArray(votes)) {
		return text
	}
	// TRANSLATORS: a draw offer in a game of four: how many players agreed so far
	const count = { agreed: votes.length, all: g.value.seats.length }
	return text + ' ' + t('quantumchess', '{agreed} of {all} agree.', count)
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
