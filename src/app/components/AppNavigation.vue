<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The app navigation: New game, the main sections, the online games that need attention (when online games are enabled),
  the local games on this device and the Settings footer.
-->
<template>
	<NcAppNavigation :aria-label="t('quantumchess', 'Quantum Chess navigation')">
		<template #list>
			<NcAppNavigationNew :text="t('quantumchess', 'New game')" @click="router.push('/new')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiPlus" />
				</template>
			</NcAppNavigationNew>
			<NcAppNavigationItem :name="t('quantumchess', 'Home')" :to="{ name: 'home' }">
				<template #icon>
					<NcIconSvgWrapper :path="mdiHomeOutline" />
				</template>
			</NcAppNavigationItem>
			<NcAppNavigationItem :name="t('quantumchess', 'Chess variants')" :to="{ name: 'variants' }">
				<template #icon>
					<NcIconSvgWrapper :path="mdiCubeOutline" />
				</template>
			</NcAppNavigationItem>
			<NcAppNavigationItem :name="t('quantumchess', 'Trainer')" to="/trainer">
				<template #icon>
					<NcIconSvgWrapper :path="mdiSchoolOutline" />
				</template>
			</NcAppNavigationItem>
			<NcAppNavigationItem :name="t('quantumchess', 'Rules')" :to="{ name: 'rules' }">
				<template #icon>
					<NcIconSvgWrapper :path="mdiBookOpenPageVariantOutline" />
				</template>
			</NcAppNavigationItem>
			<NcAppNavigationItem :name="t('quantumchess', 'Statistics')" to="/stats">
				<template #icon>
					<NcIconSvgWrapper :path="mdiChartLine" />
				</template>
			</NcAppNavigationItem>

			<template v-if="features.multiplayer">
				<template v-if="yourTurn.length">
					<NcAppNavigationCaption :name="t('quantumchess', 'Your move')" />
					<NcAppNavigationItem
						v-for="g in yourTurn"
						:key="'y' + g.id"
						:name="opponentName(g)"
						:to="`/game/${g.id}`">
						<template #icon>
							<NcAvatar
								:user="otherPlayer(g)?.userId ?? undefined"
								:displayName="opponentName(g)"
								:size="24" />
						</template>
						<template #counter>
							<NcCounterBubble :count="1" active />
						</template>
					</NcAppNavigationItem>
				</template>
				<template v-if="invitations.length">
					<NcAppNavigationCaption :name="t('quantumchess', 'Invitations')" />
					<NcAppNavigationItem
						v-for="g in invitations"
						:key="'i' + g.id"
						:name="opponentName(g)"
						:to="`/game/${g.id}`">
						<template #icon>
							<NcAvatar
								:user="otherPlayer(g)?.userId ?? undefined"
								:displayName="opponentName(g)"
								:size="24" />
						</template>
					</NcAppNavigationItem>
				</template>
				<template v-if="waiting.length">
					<NcAppNavigationCaption :name="t('quantumchess', 'Waiting for opponent')" />
					<NcAppNavigationItem
						v-for="g in waiting"
						:key="'w' + g.id"
						class="qc-nav__muted"
						:name="opponentName(g)"
						:to="`/game/${g.id}`">
						<template #icon>
							<NcAvatar
								:user="otherPlayer(g)?.userId ?? undefined"
								:displayName="opponentName(g)"
								:size="24" />
						</template>
					</NcAppNavigationItem>
				</template>
			</template>

			<template v-if="localGames.length">
				<NcAppNavigationCaption :name="t('quantumchess', 'On this device')" />
				<NcAppNavigationItem
					v-for="g in localGames"
					:key="g.id"
					:class="{ 'qc-nav__muted': g.result }"
					:name="localGameTitle(g)"
					:title="localTitle(g)"
					:to="`/play/${g.mode}/${g.id}`">
					<template #icon>
						<NcIconSvgWrapper :path="modeIcon(g.mode)" />
					</template>
					<template #actions>
						<NcActionButton closeAfterClick @click="remove(g.id)">
							<template #icon>
								<NcIconSvgWrapper :path="mdiTrashCanOutline" />
							</template>
							{{ t('quantumchess', 'Delete from this device') }}
						</NcActionButton>
					</template>
				</NcAppNavigationItem>
			</template>
		</template>
		<template #footer>
			<ul class="qc-nav__footer">
				<NcAppNavigationItem :name="t('quantumchess', 'Settings')" @click.prevent="emit('openSettings')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiCogOutline" />
					</template>
				</NcAppNavigationItem>
			</ul>
		</template>
	</NcAppNavigation>
</template>

<script setup>
import {
	mdiAccountMultipleOutline,
	mdiBookOpenPageVariantOutline,
	mdiChartLine,
	mdiCogOutline,
	mdiCreationOutline,
	mdiCubeOutline,
	mdiHomeOutline,
	mdiPlus,
	mdiRobotOutline,
	mdiSchoolOutline,
	mdiTrashCanOutline,
} from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcAppNavigation from '@nextcloud/vue/components/NcAppNavigation'
import NcAppNavigationCaption from '@nextcloud/vue/components/NcAppNavigationCaption'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcAppNavigationNew from '@nextcloud/vue/components/NcAppNavigationNew'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcCounterBubble from '@nextcloud/vue/components/NcCounterBubble'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { deleteLocalGame, listLocalGames } from '../../game/localGames.js'
import { localGameTitle } from '../../game/localPlayers.js'
import { useLobby } from '../../online/composables/useLobby.js'
import { otherPlayer as otherPlayerOf } from '../../online/summaryText.js'
import { currentUser, features } from '../../services/initialState.js'

/** @typedef {import('../../services/api.js').GameSummary} GameSummary */
/** @typedef {import('../../services/api.js').UserRef} UserRef */

const emit = defineEmits(['openSettings'])

const route = useRoute()
const router = useRouter()
const lobbyState = useLobby()

const lobby = computed(() => lobbyState.lobby.value)
const yourTurn = computed(() => lobby.value?.yourTurn ?? [])
const invitations = computed(() => lobby.value?.invitations ?? [])
const waiting = computed(() => lobby.value?.waiting ?? [])

const localGames = ref(listLocalGames().slice(0, 10))
watch(() => route.fullPath, () => {
	localGames.value = listLocalGames().slice(0, 10)
})

/**
 * The other player of an online game.
 *
 * @param {GameSummary} g the game
 * @return {string}
 */
function opponentName(g) {
	return otherPlayer(g)?.displayName ?? t('quantumchess', 'Open challenge')
}

/**
 * The other player of an online game from the viewer's side.
 *
 * @param {GameSummary} g the game
 * @return {UserRef|null}
 */
function otherPlayer(g) {
	return otherPlayerOf(g, currentUser.uid)
}

/**
 * Tooltip of a local game.
 *
 * @param {object} g index entry
 * @return {string}
 */
function localTitle(g) {
	return g.result ? t('quantumchess', 'Finished') : t('quantumchess', 'In progress')
}

/**
 * Icon of a local mode.
 *
 * @param {string} mode computer | ai | local
 * @return {string}
 */
function modeIcon(mode) {
	return mode === 'computer' ? mdiRobotOutline : (mode === 'ai' ? mdiCreationOutline : mdiAccountMultipleOutline)
}

/**
 * Delete a local game.
 *
 * @param {string} id game id
 */
function remove(id) {
	deleteLocalGame(id)
	localGames.value = listLocalGames().slice(0, 10)
	if (route.params.id === id) {
		router.push('/')
	}
}
</script>

<style scoped>
.qc-nav__footer {
	padding: calc(var(--default-grid-baseline, 4px) * 2);
}

.qc-nav__muted {
	opacity: 0.75;
}
</style>
