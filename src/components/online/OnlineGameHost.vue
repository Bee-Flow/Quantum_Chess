<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One online game (keyed by its id in OnlineGameView): the useOnlineGame controller rendered by GameScreen, with the
  invitation panel over the board before the start, the draw-offer and rematch banners, the chat tab, the game
  actions (Offer draw, Abort or Resign) and the fair-play lock of the coach tab (GAME-DESIGN §7.5–7.11).
  The game screen is keyed on the start of the game: the panel reads its tabs from the slots when it mounts.
-->
<template>
	<NcEmptyContent
		v-if="notFound"
		:name="t('quantumchess', 'This challenge is not available')"
		:description="t('quantumchess', 'The game does not exist, or you are not allowed to see it.')"
		data-test="not-available">
		<template #action>
			<NcButton variant="primary" :to="{ name: 'home' }">
				{{ t('quantumchess', 'Home') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<NcEmptyContent
		v-else-if="c.error.value && !g"
		:name="t('quantumchess', 'The game could not be loaded')"
		:description="c.error.value.message">
		<template #action>
			<NcButton variant="primary" @click="c.load()">
				{{ t('quantumchess', 'Try again') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<div v-else-if="!g" class="qc-online__loading">
		<NcLoadingIcon :size="44" :name="t('quantumchess', 'Loading the game…')" />
	</div>
	<GameScreen
		v-else
		:key="started ? 'live' : 'waiting'"
		:controller="c"
		:ratingChange="g.ratingChange"
		:rematchState="c.rematchState.value === 'pending' ? 'pending' : null"
		:chatCount="c.unread.value"
		@rematch="c.rematch()"
		@review="review"
		@newGame="router.push({ name: 'new-game', query: { mode: 'online' } })">
		<template v-if="offerBanner || rematchBanner || rematchLink || c.rematchState.value === 'pending'" #banners>
			<NcNoteCard
				v-if="offerBanner"
				type="info"
				class="qc-online__banner"
				data-test="draw-offer">
				<div class="qc-online__banner-row">
					<span>{{ offerBanner }}</span>
					<span v-if="c.can.value.answerDraw" class="qc-online__banner-actions">
						<NcButton
							size="small"
							:disabled="busy"
							data-test="draw-decline"
							@click="run(() => c.answerDraw(false))">
							{{ t('quantumchess', 'Decline') }}
						</NcButton>
						<NcButton
							size="small"
							variant="primary"
							:disabled="busy"
							data-test="draw-accept"
							@click="run(() => c.answerDraw(true))">
							{{ t('quantumchess', 'Accept draw') }}
						</NcButton>
					</span>
				</div>
			</NcNoteCard>
			<NcNoteCard
				v-if="rematchBanner"
				type="info"
				class="qc-online__banner"
				data-test="rematch-offer">
				<div class="qc-online__banner-row">
					<span>{{ rematchBanner }}</span>
					<span class="qc-online__banner-actions">
						<NcButton
							size="small"
							:disabled="busy"
							data-test="rematch-decline"
							@click="run(() => c.declineRematch())">
							{{ t('quantumchess', 'Decline') }}
						</NcButton>
						<NcButton
							size="small"
							variant="primary"
							:disabled="busy"
							data-test="rematch-accept"
							@click="run(() => c.rematch())">
							{{ t('quantumchess', 'Accept rematch') }}
						</NcButton>
					</span>
				</div>
			</NcNoteCard>
			<NcNoteCard
				v-if="c.rematchState.value === 'pending'"
				type="info"
				class="qc-online__banner"
				data-test="rematch-pending">
				<div class="qc-online__banner-row">
					<span>{{ t('quantumchess', 'You asked {name} for a rematch. Waiting for an answer.', { name: c.names.value[other] }) }}</span>
					<NcButton
						size="small"
						:disabled="busy"
						data-test="rematch-cancel"
						@click="run(() => c.cancelRematch())">
						{{ t('quantumchess', 'Cancel') }}
					</NcButton>
				</div>
			</NcNoteCard>
			<NcNoteCard v-if="rematchLink" type="success" class="qc-online__banner">
				<div class="qc-online__banner-row">
					<span>{{ t('quantumchess', 'The rematch is on.') }}</span>
					<NcButton size="small" :to="`/game/${rematchLink}`">
						{{ t('quantumchess', 'Go to the rematch') }}
					</NcButton>
				</div>
			</NcNoteCard>
		</template>

		<template v-if="!started" #overlay>
			<InvitationPanel :controller="c" :me="me" />
		</template>

		<template v-if="started && c.participant.value" #chat>
			<GameChat :controller="c" />
		</template>

		<template v-if="hasCoach && started && c.participant.value" #coach>
			<div class="qc-online__coach">
				<p v-if="c.fairPlayLock.value">
					{{ t('quantumchess', 'Available after the game.') }}
				</p>
				<template v-else>
					<p>{{ t('quantumchess', 'The game is over: the coach can go through it with you.') }}</p>
					<NcButton v-if="canReview" variant="primary" @click="review">
						{{ t('quantumchess', 'Review with the coach') }}
					</NcButton>
				</template>
			</div>
		</template>

		<template v-if="active && c.participant.value" #actions>
			<NcButton
				v-if="!ownOffer"
				variant="tertiary"
				:disabled="!c.can.value.offerDraw || busy"
				:title="drawTitle"
				data-test="offer-draw"
				@click="run(() => c.offerDraw())">
				<template #icon>
					<NcIconSvgWrapper :path="mdiHandshakeOutline" />
				</template>
				{{ t('quantumchess', 'Offer draw') }}
			</NcButton>
			<NcButton
				v-if="c.can.value.abort"
				variant="tertiary"
				:disabled="busy"
				data-test="abort"
				@click="confirm = 'abort'">
				<template #icon>
					<NcIconSvgWrapper :path="mdiCloseCircleOutline" />
				</template>
				{{ t('quantumchess', 'Abort') }}
			</NcButton>
			<NcButton
				v-else
				variant="tertiary"
				:disabled="!c.can.value.resign || busy"
				data-test="resign"
				@click="confirm = 'resign'">
				<template #icon>
					<NcIconSvgWrapper :path="mdiFlagOutline" />
				</template>
				{{ t('quantumchess', 'Resign') }}
			</NcButton>
		</template>
	</GameScreen>

	<NcDialog
		v-if="confirm"
		:name="confirm === 'abort' ? t('quantumchess', 'Abort this game?') : t('quantumchess', 'Resign this game?')"
		size="small"
		@update:open="(v) => !v && (confirm = null)">
		<p>
			{{ confirm === 'abort'
				? t('quantumchess', 'Nobody wins and the game is not rated.')
				: t('quantumchess', 'This counts as a loss.') }}
		</p>
		<template #actions>
			<NcButton @click="confirm = null">
				{{ t('quantumchess', 'Keep playing') }}
			</NcButton>
			<NcButton variant="error" data-test="confirm-action" @click="confirmAction">
				{{ confirm === 'abort' ? t('quantumchess', 'Abort') : t('quantumchess', 'Resign') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<script setup>
import { mdiCloseCircleOutline, mdiFlagOutline, mdiHandshakeOutline } from '@mdi/js'
import { n, t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import GameScreen from '../game/GameScreen.vue'
import GameChat from './GameChat.vue'
import InvitationPanel from './InvitationPanel.vue'
import { hasView, optionalComponent } from '../../composables/modules.js'
import { useLobby } from '../../online/lobby.js'
import { useOnlineGame } from '../../online/useOnlineGame.js'
import { currentUser } from '../../services/initialState.js'

const props = defineProps({
	/** Online game id */
	id: { type: Number, required: true },
})

const router = useRouter()
const me = currentUser.uid
const lobby = useLobby()
const c = useOnlineGame(props.id, {
	onRematchStarted: (rid) => router.push(`/game/${rid}`),
	onLobbyChange: () => lobby.poke(),
})
const g = computed(() => c.game.value)
const started = computed(() => !!g.value && !['pending', 'open', 'declined', 'cancelled', 'expired'].includes(g.value.status))
const active = computed(() => g.value?.status === 'active')
const notFound = computed(() => c.error.value?.status === 404 && !g.value)
const canReview = hasView('ReviewView')
const hasCoach = optionalComponent('coach', 'CoachPanel') !== null
const busy = ref(false)
const confirm = ref(null)

const other = computed(() => (c.myColor.value === 'w' ? 'b' : 'w'))
const ownOffer = computed(() => !!c.drawOffer.value && c.drawOffer.value.by === c.myColor.value)
const offerBanner = computed(() => {
	const offer = c.drawOffer.value
	if (!offer || !active.value) {
		return ''
	}
	return offer.by === c.myColor.value
		? t('quantumchess', 'You offered a draw. Waiting for {name}.', { name: c.names.value[other.value] })
		: t('quantumchess', '{name} offers a draw', { name: c.names.value[offer.by] })
})
const drawTitle = computed(() => {
	const at = g.value?.drawAvailableAtPly
	if (c.can.value.offerDraw || !at) {
		return t('quantumchess', 'Offer a draw')
	}
	const own = Math.max(1, Math.ceil((at - g.value.ply) / 2))
	return n('quantumchess', 'You can offer a draw again in %n move', 'You can offer a draw again in %n moves', own)
})
const rematchBanner = computed(() => (c.rematchState.value === 'offered'
	? t('quantumchess', '{name} wants a rematch', { name: c.names.value[other.value] })
	: ''))
const rematchLink = computed(() => (c.rematchGame.value?.status === 'active' ? c.rematchGame.value.id : null))

/**
 * Run an action once at a time.
 *
 * @param {Function} fn action
 */
async function run(fn) {
	busy.value = true
	try {
		await fn()
	} finally {
		busy.value = false
	}
}

/** The confirmed resign or abort. */
function confirmAction() {
	const action = confirm.value
	confirm.value = null
	run(() => (action === 'abort' ? c.abort() : c.resign()))
}

/** Open the review of this game. */
function review() {
	if (canReview) {
		router.push(`/review/online/${props.id}`)
	}
}

onMounted(() => c.start())
onBeforeUnmount(() => c.dispose())
</script>

<style lang="scss" scoped>
.qc-online__loading {
	display: flex;
	justify-content: center;
	padding: 64px 0;
}

.qc-online__banner {
	margin: 0 !important;
}

.qc-online__banner-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.qc-online__banner-actions {
	display: inline-flex;
	gap: 6px;
}

.qc-online__coach {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	color: var(--color-text-maxcontrast);

	p {
		margin: 0;
	}
}
</style>
