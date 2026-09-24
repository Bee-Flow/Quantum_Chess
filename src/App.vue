<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The app shell: navigation, the routed view, the New game and settings dialogs, the privacy notice of the LLM sources
  and the piece sprite (mounted once).
-->
<template>
	<NcContent appName="quantumchess" class="qc-app">
		<AppNavigation @openSettings="openSettings" />
		<NcAppContent :pageHeading="t('quantumchess', 'Quantum Chess')" :pageTitle="pageTitle">
			<router-view />
		</NcAppContent>
		<NewGameDialog
			v-if="newGameOpen"
			:initialMode="String(route.query.mode ?? '')"
			:opponent="String(route.query.opponent ?? '')"
			@close="closeNewGame" />
		<AppSettingsDialog v-if="settingsOpen" :open="settingsOpen" @update:open="onSettingsOpen" />
		<AiNoticeDialog />
		<PieceSprite />
	</NcContent>
</template>

<script setup>
import { emit } from '@nextcloud/event-bus'
import { t } from '@nextcloud/l10n'
import { computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import AppNavigation from './app/components/AppNavigation.vue'
import PieceSprite from './board/components/PieceSprite.vue'
import AiNoticeDialog from './llm/components/AiNoticeDialog.vue'
import { useLobby } from './online/composables/useLobby.js'
import { unlockAudio } from './services/sound.js'

import './styles/tokens.scss'
import './styles/app.scss'

const NewGameDialog = defineAsyncComponent(() => import('./app/components/NewGameDialog.vue'))
const AppSettingsDialog = defineAsyncComponent(() => import('./app/components/AppSettingsDialog.vue'))

const route = useRoute()
const router = useRouter()
const lobby = useLobby()

const newGameOpen = computed(() => route.name === 'new-game')
const settingsOpen = computed(() => route.query.dialog === 'settings')

/** Close the New game dialog: back when it was opened from the app, else home. */
function closeNewGame() {
	if (window.history.state?.back) {
		router.back()
	} else {
		router.replace('/')
	}
}

/** Open the settings dialog (a `?dialog=` entry, so browser back closes it). */
function openSettings() {
	router.push({ query: { ...route.query, dialog: 'settings' } })
}

/**
 * The settings dialog opened or closed itself.
 *
 * @param {boolean} open new state
 */
function onSettingsOpen(open) {
	if (open) {
		openSettings()
	} else if (settingsOpen.value) {
		const query = { ...route.query }
		delete query.dialog
		if (window.history.state?.back) {
			router.back()
		} else {
			router.replace({ query })
		}
	}
}

// Tab title: "(2) Quantum Chess - Nextcloud" while games wait for the user. Passed as pageTitle,
// because NcAppContent otherwise adds the app name from an injected ref and shows "[object Object]".
const pageTitle = computed(() => {
	const n = lobby.counts.value.total
	const name = t('quantumchess', 'Quantum Chess')
	return n > 0 ? `(${n}) ${name}` : name
})

// The navigation collapses on game routes when the board would get too small.
watch(() => route.name, (name) => {
	if ((name === 'local-game' || name === 'online-game') && window.innerWidth < 1280) {
		emit('toggle-navigation', { open: false })
	}
})

onMounted(() => {
	lobby.start()
	const unlock = () => {
		unlockAudio()
		window.removeEventListener('pointerdown', unlock)
		window.removeEventListener('keydown', unlock)
	}
	window.addEventListener('pointerdown', unlock)
	window.addEventListener('keydown', unlock)
})
</script>
