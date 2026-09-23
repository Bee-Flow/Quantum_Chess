<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The online sections of Home (GAME-DESIGN §2.3 items 2–5, SPEC §14.6.4): Your move, Invitations (Accept and Decline
  inline), Waiting for opponent (with outgoing invitations and own open challenges), and Open challenges to join.
  Sections without games are not shown. Home polls the lobby faster while it is open.
-->
<template>
	<div v-if="enabled" class="qc-lobby" data-test="lobby-sections">
		<section v-if="yourTurn.length" class="qc-lobby__section" data-test="lobby-your-move">
			<h2 class="qc-lobby__heading">
				{{ t('quantumchess', 'Your move') }}
				<NcCounterBubble :count="yourTurn.length" active />
			</h2>
			<ul class="qc-lobby__cards">
				<LobbyGameCard
					v-for="g in yourTurn"
					:key="g.id"
					:game="g"
					kind="turn"
					:now="now" />
			</ul>
		</section>

		<section v-if="invitations.length" class="qc-lobby__section" data-test="lobby-invitations">
			<h2 class="qc-lobby__heading">
				{{ t('quantumchess', 'Invitations') }}
				<NcCounterBubble :count="invitations.length" active />
			</h2>
			<ul class="qc-lobby__cards">
				<LobbyGameCard
					v-for="g in invitations"
					:key="g.id"
					:game="g"
					kind="invite"
					:now="now">
					<NcButton
						size="small"
						:disabled="busy === g.id"
						:data-test="'lobby-decline-' + g.id"
						@click="act(g.id, lobby.decline)">
						{{ t('quantumchess', 'Decline') }}
					</NcButton>
					<NcButton
						size="small"
						variant="primary"
						:disabled="busy === g.id"
						:data-test="'lobby-accept-' + g.id"
						@click="act(g.id, lobby.accept, true)">
						{{ t('quantumchess', 'Accept') }}
					</NcButton>
				</LobbyGameCard>
			</ul>
		</section>

		<section v-if="waiting.length" class="qc-lobby__section" data-test="lobby-waiting">
			<h2 class="qc-lobby__heading">
				{{ t('quantumchess', 'Waiting for opponent') }}
			</h2>
			<ul class="qc-lobby__cards">
				<LobbyGameCard
					v-for="w in waiting"
					:key="w.game.id"
					:game="w.game"
					:kind="w.kind"
					:now="now">
					<template v-if="w.kind === 'outgoing'">
						<NcButton v-if="w.game.status === 'open'" size="small" @click="copyLink(w.game.id)">
							{{ t('quantumchess', 'Copy link') }}
						</NcButton>
						<NcButton
							size="small"
							:disabled="busy === w.game.id"
							:data-test="'lobby-cancel-' + w.game.id"
							@click="act(w.game.id, lobby.cancel)">
							{{ t('quantumchess', 'Cancel') }}
						</NcButton>
					</template>
				</LobbyGameCard>
			</ul>
		</section>

		<section v-if="open.length" class="qc-lobby__section" data-test="lobby-open">
			<h2 class="qc-lobby__heading">
				{{ t('quantumchess', 'Open challenges') }}
			</h2>
			<ul class="qc-lobby__cards">
				<LobbyGameCard
					v-for="g in open"
					:key="g.id"
					:game="g"
					kind="open"
					:now="now">
					<NcButton
						size="small"
						variant="primary"
						:disabled="busy === g.id"
						:data-test="'lobby-join-' + g.id"
						@click="act(g.id, lobby.join, true)">
						{{ t('quantumchess', 'Join') }}
					</NcButton>
				</LobbyGameCard>
			</ul>
		</section>
	</div>
</template>

<script setup>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCounterBubble from '@nextcloud/vue/components/NcCounterBubble'
import LobbyGameCard from './LobbyGameCard.vue'
import { useLobby } from '../../online/lobby.js'
import { features } from '../../services/initialState.js'

const router = useRouter()
const lobby = useLobby()
const enabled = features.multiplayer
const busy = ref(null)

const data = computed(() => lobby.lobby.value ?? {})
const now = computed(() => data.value.now ?? Date.now() / 1000)
const yourTurn = computed(() => data.value.yourTurn ?? [])
const invitations = computed(() => data.value.invitations ?? [])
const open = computed(() => data.value.open ?? [])
const waiting = computed(() => [
	...(data.value.waiting ?? []).map((game) => ({ game, kind: 'waiting' })),
	...(data.value.outgoing ?? []).map((game) => ({ game, kind: 'outgoing' })),
])

/**
 * Run a lobby action on a game; optionally open the game afterwards.
 *
 * @param {number} id game id
 * @param {Function} fn lobby action
 * @param {boolean} [openAfter] open the game when it worked
 */
async function act(id, fn, openAfter = false) {
	busy.value = id
	try {
		const res = await fn(id)
		if (res && openAfter) {
			router.push(`/game/${id}`)
		}
	} finally {
		busy.value = null
	}
}

/**
 * Copy the share link of an open challenge.
 *
 * @param {number} id game id
 */
async function copyLink(id) {
	const url = window.location.origin + generateUrl('/apps/quantumchess/g/{id}', { id })
	try {
		await navigator.clipboard.writeText(url)
		showSuccess(t('quantumchess', 'Link copied'))
	} catch {
		showError(t('quantumchess', 'Could not copy the link: {url}', { url }))
	}
}

let release = null
onMounted(() => {
	release = lobby.watchFast()
})
onBeforeUnmount(() => release?.())
</script>

<style lang="scss" scoped>
.qc-lobby {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.qc-lobby__heading {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 0 12px;
	font-size: 20px;
	font-weight: bold;
	line-height: 34px;
}

.qc-lobby__cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}
</style>
