<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Personal settings → Quantum Chess: online play (the leaderboard), notifications, and the LLM sources of the AI
  opponent and the coach (the default source, the user's own provider, and what is sent).
-->
<template>
	<div class="qc-settings">
		<NcSettingsSection v-if="loading" :name="t('quantumchess', 'Quantum Chess')">
			<NcLoadingIcon :size="32" />
		</NcSettingsSection>
		<NcSettingsSection
			v-else-if="loadError"
			:name="t('quantumchess', 'Quantum Chess')">
			<NcNoteCard type="error">
				{{ loadError }}
			</NcNoteCard>
		</NcSettingsSection>
		<template v-else>
			<NcSettingsSection
				:name="t('quantumchess', 'Online play')"
				:description="t('quantumchess', 'Games against other people on this Nextcloud.')">
				<NcCheckboxRadioSwitch
					v-if="multiplayer.leaderboardMode !== 'off'"
					type="switch"
					:modelValue="listed"
					@update:modelValue="saveListed">
					{{ t('quantumchess', 'Show me on the leaderboard') }}
				</NcCheckboxRadioSwitch>
				<p v-else class="qc-settings__hint">
					{{ t('quantumchess', 'The leaderboard is turned off on this Nextcloud.') }}
				</p>
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'Notifications')"
				:description="t('quantumchess', 'Choose which game events send you a notification.')">
				<NcCheckboxRadioSwitch
					v-for="item in notificationItems"
					:key="item.key"
					type="switch"
					:modelValue="multiplayer.notifications[item.key]"
					@update:modelValue="saveNotification(item.key, $event)">
					{{ item.label }}
				</NcCheckboxRadioSwitch>
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'AI opponent and coach')"
				:description="t('quantumchess', 'AI opponents and the AI coach use a language model. Choose which one they use.')">
				<fieldset class="qc-settings__group">
					<legend class="qc-settings__legend">
						{{ t('quantumchess', 'Default AI source') }}
					</legend>
					<NcCheckboxRadioSwitch
						v-for="source in personal.sources"
						:key="source.id"
						type="radio"
						name="qc-default-source"
						:value="source.id"
						:modelValue="defaultSource ?? ''"
						:disabled="!source.available || saving"
						@update:modelValue="saveDefault">
						{{ source.label }}
						<span v-if="!source.available" class="qc-settings__reason">
							({{ sourceReason(source.reason) }})
						</span>
					</NcCheckboxRadioSwitch>
					<p v-if="defaultSource === null" class="qc-settings__hint">
						{{ t('quantumchess', 'No AI source is available yet. Add your own API key below or ask your administrator. The built-in computer opponents always work.') }}
					</p>
				</fieldset>

				<template v-if="personal.allowPersonalKeys">
					<h3 class="qc-settings__subheading">
						{{ t('quantumchess', 'My own API key') }}
					</h3>
					<p class="qc-settings__hint">
						{{ t('quantumchess', 'Use your own account at an AI service. Your key is stored encrypted on this server and never sent to your browser.') }}
					</p>
					<ProviderForm
						:provider="personal.provider"
						:presets="personal.presets"
						scope="personal"
						:localAllowlist="personal.localAllowlist"
						:keyInfo="personal"
						:disabled="saving"
						@save="saveProvider"
						@removeKey="removeKey" />
				</template>
				<NcNoteCard v-else type="info">
					{{ t('quantumchess', 'Your administrator does not allow personal API keys.') }}
				</NcNoteCard>

				<h3 class="qc-settings__subheading">
					{{ t('quantumchess', 'What is sent to the AI') }}
				</h3>
				<ul class="qc-settings__list">
					<li v-for="item in privacy.sent" :key="item">
						{{ item }}
					</li>
				</ul>
				<p class="qc-settings__hint">
					{{ privacy.notSent }}
				</p>
			</NcSettingsSection>
		</template>
	</div>
</template>

<script setup>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { computed, onMounted, ref } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSettingsSection from '@nextcloud/vue/components/NcSettingsSection'
import ProviderForm from './ProviderForm.vue'
import { getMultiplayerSettings, getPersonalSettings, saveMultiplayerSettings, savePersonalSettings } from '../../services/api.js'
import { errorText, privacyList, sourceReason } from '../messages.js'

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const personal = ref(null)
const multiplayer = ref(null)
const privacy = privacyList()

const notificationItems = [
	{ key: 'invites', label: t('quantumchess', 'Invitations, rematch offers and answers to my invitations') },
	{ key: 'yourTurn', label: t('quantumchess', 'It is my turn') },
	{ key: 'drawOffers', label: t('quantumchess', 'Draw offers') },
	{ key: 'results', label: t('quantumchess', 'Game results') },
	{ key: 'chat', label: t('quantumchess', 'Chat messages') },
	{ key: 'previews', label: t('quantumchess', 'Show message and move previews in notifications') },
]

const listed = computed(() => multiplayer.value.listed ?? multiplayer.value.leaderboardMode === 'opt-out')
const defaultSource = computed(() => {
	const available = personal.value.sources.filter((s) => s.available).map((s) => s.id)
	const chosen = personal.value.defaultSource
	return available.includes(chosen) ? chosen : (available[0] ?? null)
})

onMounted(async () => {
	try {
		const [p, m] = await Promise.all([getPersonalSettings(), getMultiplayerSettings()])
		personal.value = p
		multiplayer.value = m
	} catch (error) {
		loadError.value = errorText(error)
	} finally {
		loading.value = false
	}
})

/**
 * Save a multiplayer patch.
 *
 * @param {object} patch partial settings
 */
async function saveMultiplayer(patch) {
	try {
		multiplayer.value = await saveMultiplayerSettings(patch)
		showSuccess(t('quantumchess', 'Saved'))
	} catch (error) {
		showError(errorText(error))
	}
}

/** @param {boolean} value show me on the leaderboard */
function saveListed(value) {
	saveMultiplayer({ listed: value })
}

/**
 * @param {string} key switch
 * @param {boolean} value on or off
 */
function saveNotification(key, value) {
	saveMultiplayer({ notifications: { [key]: value } })
}

/**
 * Save a personal patch.
 *
 * @param {object} patch partial settings
 * @param {string} [message] success message
 */
async function savePersonal(patch, message = t('quantumchess', 'Saved')) {
	saving.value = true
	try {
		personal.value = await savePersonalSettings(patch)
		showSuccess(message)
	} catch (error) {
		showError(errorText(error))
	} finally {
		saving.value = false
	}
}

/** @param {string} source default source id */
function saveDefault(source) {
	savePersonal({ defaultSource: source })
}

/** @param {{provider: object, apiKey: string|null}} payload provider and optional new key */
function saveProvider({ provider, apiKey }) {
	savePersonal(apiKey === null ? { provider } : { provider, apiKey }, t('quantumchess', 'Your AI provider was saved'))
}

/** Delete the saved key. */
function removeKey() {
	savePersonal({ apiKey: '' }, t('quantumchess', 'Your API key was removed'))
}
</script>

<style scoped>
.qc-settings__hint {
	color: var(--color-text-maxcontrast);
	margin-block: calc(var(--default-grid-baseline) * 2);
	max-width: 720px;
}

.qc-settings__group {
	margin-block-end: calc(var(--default-grid-baseline) * 4);
}

.qc-settings__legend {
	font-weight: bold;
	margin-block-end: var(--default-grid-baseline);
}

.qc-settings__reason {
	color: var(--color-text-maxcontrast);
}

.qc-settings__subheading {
	font-size: 1em;
	font-weight: bold;
	margin-block: calc(var(--default-grid-baseline) * 6) calc(var(--default-grid-baseline) * 2);
}

.qc-settings__list {
	list-style: disc;
	padding-inline-start: calc(var(--default-grid-baseline) * 6);
	max-width: 720px;
}
</style>
