<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A running online chess variant game (OnlineGameView fills the `variant` slot of OnlineGameHost with it): the variant
  board of VariantGameView played through useOnlineVariantGame, with OnlineVariantPanel on top of its side panel. A
  game started with another version of the variant rules is not shown; the player is asked to update the app.
-->
<template>
	<NcEmptyContent
		v-if="online.problem.value === 'rules'"
		:name="t('quantumchess', 'Update Quantum Chess to play this game')"
		:description="t('quantumchess', 'This game was started with another version of the chess variants. Ask your administrator to update the app.')">
		<template #action>
			<NcButton variant="primary" :to="{ name: 'home' }">
				{{ t('quantumchess', 'Home') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<VariantGameView v-else :controller="online.game">
		<template #online>
			<OnlineVariantPanel :controller="controller" :online="online" />
		</template>
	</VariantGameView>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { onBeforeUnmount } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import OnlineVariantPanel from '../online/components/OnlineVariantPanel.vue'
import VariantGameView from './VariantGameView.vue'
import { useOnlineVariantGame } from '../online/composables/useOnlineVariantGame.js'

const props = defineProps({
	/** The online controller of the game (useOnlineGame). */
	controller: {
		type: Object,
		required: true,
	},
})

const online = useOnlineVariantGame(props.controller)
online.start()
onBeforeUnmount(() => online.stop())
</script>
