<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Administration settings → Quantum Chess (GAME-DESIGN §8.3, SPEC §11.1): online play, ratings, Nextcloud AI with
  its status card, the organisation provider (key behind the password confirmation), personal keys and local
  servers, limits and notices, and read-only diagnostics. Plain values are saved as they change.
-->
<template>
	<div class="qc-admin">
		<NcSettingsSection v-if="loading" :name="t('quantumchess', 'Quantum Chess')">
			<NcLoadingIcon :size="32" />
		</NcSettingsSection>
		<NcSettingsSection v-else-if="loadError" :name="t('quantumchess', 'Quantum Chess')">
			<NcNoteCard type="error">
				{{ loadError }}
			</NcNoteCard>
		</NcSettingsSection>
		<template v-else>
			<NcSettingsSection
				:name="t('quantumchess', 'Online play')"
				:description="t('quantumchess', 'Correspondence games between people on this Nextcloud.')">
				<NcCheckboxRadioSwitch type="switch" :modelValue="v.mp_enabled" @update:modelValue="set('mp_enabled', $event)">
					{{ t('quantumchess', 'Allow online games') }}
				</NcCheckboxRadioSwitch>
				<div v-if="v.mp_enabled" class="qc-admin__block">
					<div class="qc-admin__field">
						<span class="qc-admin__caption" aria-hidden="true">{{ t('quantumchess', 'Limit online play to these groups') }}</span>
						<NcSettingsSelectGroup
							:modelValue="v.mp_groups"
							:label="t('quantumchess', 'Limit online play to these groups')"
							:placeholder="t('quantumchess', 'Everyone')"
							@update:modelValue="set('mp_groups', $event)" />
					</div>
					<NcCheckboxRadioSwitch type="switch" :modelValue="v.open_challenges" @update:modelValue="set('open_challenges', $event)">
						{{ t('quantumchess', 'Allow open challenges') }}
					</NcCheckboxRadioSwitch>
					<NcCheckboxRadioSwitch type="switch" :modelValue="v.rated_enabled" @update:modelValue="set('rated_enabled', $event)">
						{{ t('quantumchess', 'Allow rated games') }}
					</NcCheckboxRadioSwitch>
					<NcCheckboxRadioSwitch type="switch" :modelValue="v.chat_enabled" @update:modelValue="set('chat_enabled', $event)">
						{{ t('quantumchess', 'Allow chat in games') }}
					</NcCheckboxRadioSwitch>
					<div class="qc-admin__numbers">
						<NcTextField
							v-for="field in numberFields.online"
							:key="field.key"
							type="number"
							:label="field.label"
							:helperText="field.help"
							:min="field.min"
							:max="field.max"
							:modelValue="String(v[field.key])"
							@update:modelValue="setNumber(field.key, $event)" />
					</div>
				</div>
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'Ratings and leaderboard')"
				:description="t('quantumchess', 'Rated online games change an Elo rating. The leaderboard only shows people who may see each other.')">
				<fieldset class="qc-admin__block">
					<legend class="qc-admin__legend">
						{{ t('quantumchess', 'Leaderboard') }}
					</legend>
					<NcCheckboxRadioSwitch
						v-for="mode in leaderboardModes"
						:key="mode.id"
						type="radio"
						name="qc-leaderboard-mode"
						:value="mode.id"
						:modelValue="v.leaderboard_mode"
						@update:modelValue="set('leaderboard_mode', $event)">
						{{ mode.label }}
					</NcCheckboxRadioSwitch>
				</fieldset>
				<div v-if="v.leaderboard_mode !== 'off'" class="qc-admin__block">
					<div class="qc-admin__numbers">
						<NcTextField
							v-for="field in numberFields.leaderboard"
							:key="field.key"
							type="number"
							:label="field.label"
							:helperText="field.help"
							:min="field.min"
							:max="field.max"
							:modelValue="String(v[field.key])"
							@update:modelValue="setNumber(field.key, $event)" />
					</div>
					<div class="qc-admin__field">
						<span class="qc-admin__caption" aria-hidden="true">{{ t('quantumchess', 'Only list members of these groups') }}</span>
						<NcSettingsSelectGroup
							:modelValue="v.leaderboard_groups"
							:label="t('quantumchess', 'Only list members of these groups')"
							:placeholder="t('quantumchess', 'Everyone')"
							@update:modelValue="set('leaderboard_groups', $event)" />
					</div>
				</div>
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'Nextcloud AI')"
				:description="t('quantumchess', 'AI opponents and the coach can use the text generation provider of this Nextcloud (Nextcloud Assistant).')">
				<NcCheckboxRadioSwitch type="switch" :modelValue="v.nc_ai_enabled" @update:modelValue="set('nc_ai_enabled', $event)">
					{{ t('quantumchess', 'Use Nextcloud AI') }}
				</NcCheckboxRadioSwitch>
				<NcNoteCard v-if="status.ncAi.providerName" type="success">
					{{ t('quantumchess', 'Text generation provider: {name}', { name: status.ncAi.providerName }) }}
					<template v-if="status.ncAi.medianLatencyMs !== null">
						<br>
						{{ t('quantumchess', 'Median answer time of the last tasks: {seconds} s', { seconds: Math.round(status.ncAi.medianLatencyMs / 100) / 10 }) }}
					</template>
					<template v-if="status.ncAi.medianLatencyMs > 20000">
						<br>
						{{ t('quantumchess', 'Answers are slow. Running a dedicated TaskProcessing worker makes AI tasks start right away.') }}
					</template>
				</NcNoteCard>
				<NcNoteCard v-else type="warning">
					{{ t('quantumchess', 'No text generation provider is installed. Install one, for example "Nextcloud Assistant" with "OpenAI and LocalAI integration" or a local model, to use Nextcloud AI.') }}
				</NcNoteCard>
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'Organisation AI provider')"
				:description="t('quantumchess', 'An AI service paid by your organisation that users can pick without their own key.')">
				<NcCheckboxRadioSwitch type="switch" :modelValue="v.shared_enabled" @update:modelValue="set('shared_enabled', $event)">
					{{ t('quantumchess', 'Offer the organisation provider') }}
				</NcCheckboxRadioSwitch>
				<div class="qc-admin__block">
					<ProviderForm
						:provider="v.shared_provider"
						:presets="presets"
						scope="shared"
						:keyInfo="v.shared_api_key"
						:disabled="savingProvider"
						@save="saveProvider"
						@removeKey="removeKey" />
					<div class="qc-admin__field">
						<span class="qc-admin__caption" aria-hidden="true">{{ t('quantumchess', 'Only for members of these groups') }}</span>
						<NcSettingsSelectGroup
							:modelValue="v.shared_groups"
							:label="t('quantumchess', 'Only for members of these groups')"
							:placeholder="t('quantumchess', 'Everyone')"
							@update:modelValue="set('shared_groups', $event)" />
					</div>
					<div class="qc-admin__numbers">
						<NcTextField
							type="number"
							:label="t('quantumchess', 'Requests per day')"
							:helperText="t('quantumchess', 'For all users together; 0 means no limit.')"
							:min="0"
							:max="1000000"
							:modelValue="String(v.shared_daily_cap)"
							@update:modelValue="setNumber('shared_daily_cap', $event)" />
					</div>
					<NcSelect
						:modelValue="v.shared_model_allowlist"
						class="qc-admin__wide"
						:inputLabel="t('quantumchess', 'Models users may choose (empty: only the model above)')"
						:options="v.shared_model_allowlist"
						:multiple="true"
						:taggable="true"
						:pushTags="true"
						@update:modelValue="set('shared_model_allowlist', $event)" />
				</div>
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'Personal keys and local servers')"
				:description="t('quantumchess', 'Users may connect their own AI account. Local servers (like Ollama) need an exact entry in the allow-list.')">
				<NcCheckboxRadioSwitch type="switch" :modelValue="v.allow_personal_keys" @update:modelValue="set('allow_personal_keys', $event)">
					{{ t('quantumchess', 'Allow users to use their own API key') }}
				</NcCheckboxRadioSwitch>
				<NcCheckboxRadioSwitch type="switch" :modelValue="v.shared_allow_local" @update:modelValue="set('shared_allow_local', $event)">
					{{ t('quantumchess', 'The organisation provider may use a local address') }}
				</NcCheckboxRadioSwitch>
				<NcTextArea
					v-model="allowlistText"
					class="qc-admin__wide"
					:label="t('quantumchess', 'Allowed local servers for personal providers')"
					:helperText="t('quantumchess', 'One base URL per line, for example http://localhost:11434/v1. Users may pick only these exact addresses.')"
					resize="vertical"
					@blur="saveAllowlist" />
			</NcSettingsSection>

			<NcSettingsSection
				:name="t('quantumchess', 'Limits and notices')"
				:description="t('quantumchess', 'Limits apply per user across all AI sources.')">
				<div class="qc-admin__numbers">
					<NcTextField
						v-for="field in numberFields.limits"
						:key="field.key"
						type="number"
						:label="field.label"
						:helperText="field.help"
						:min="field.min"
						:max="field.max"
						:modelValue="String(v[field.key])"
						@update:modelValue="setNumber(field.key, $event)" />
				</div>
				<NcCheckboxRadioSwitch type="switch" :modelValue="v.ai_safety_identifier" @update:modelValue="set('ai_safety_identifier', $event)">
					{{ t('quantumchess', 'Send a pseudonymous safety identifier to the provider (never the user name)') }}
				</NcCheckboxRadioSwitch>
				<NcTextArea
					v-model="notice"
					class="qc-admin__wide"
					:label="t('quantumchess', 'Extra privacy notice')"
					:helperText="t('quantumchess', 'Shown to users before their first AI request, after the standard notice. At most 1000 characters.')"
					:maxlength="1000"
					resize="vertical"
					@blur="saveNotice" />
			</NcSettingsSection>

			<NcSettingsSection :name="t('quantumchess', 'Diagnostics')">
				<ul class="qc-admin__diagnostics">
					<li v-for="row in diagnosticRows" :key="row.label">
						<span class="qc-admin__caption">{{ row.label }}</span>
						<span>{{ row.value }}</span>
					</li>
				</ul>
			</NcSettingsSection>
		</template>
	</div>
</template>

<script setup>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { computed, onMounted, reactive, ref } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcSettingsSection from '@nextcloud/vue/components/NcSettingsSection'
import NcSettingsSelectGroup from '@nextcloud/vue/components/NcSettingsSelectGroup'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import ProviderForm from './ProviderForm.vue'
import { getAdminSettings, saveAdminSecret, saveAdminSettings } from '../services/api.js'
import { errorText } from './messages.js'

/** Delay before a typed value is saved. */
const SAVE_DELAY_MS = 800

const loading = ref(true)
const loadError = ref('')
const savingProvider = ref(false)
const v = reactive({})
const presets = ref([])
const status = ref(null)
const allowlistText = ref('')
const notice = ref('')
const pending = {}
let timer = null

const leaderboardModes = [
	{ id: 'opt-in', label: t('quantumchess', 'People choose to be listed (recommended)') },
	{ id: 'opt-out', label: t('quantumchess', 'Everyone is listed unless they opt out') },
	{ id: 'off', label: t('quantumchess', 'No leaderboard') },
]

const numberFields = computed(() => ({
	online: [
		{ key: 'invite_expiry_days', min: 1, max: 60, label: t('quantumchess', 'Invitation expiry (days)'), help: '1–60' },
		{ key: 'open_expiry_days', min: 1, max: 30, label: t('quantumchess', 'Open challenge expiry (days)'), help: '1–30' },
		{ key: 'max_active_games', min: 1, max: 200, label: t('quantumchess', 'Active games per person'), help: '1–200' },
		{ key: 'chat_retention_days', min: 1, max: 3650, label: t('quantumchess', 'Keep chat (days)'), help: t('quantumchess', '1–3650 days after the game ends') },
		{ key: 'purge_finished_days', min: 0, max: 3650, label: t('quantumchess', 'Delete finished games (days)'), help: t('quantumchess', '0 keeps them, otherwise 30–3650') },
	],
	leaderboard: [
		{ key: 'leaderboard_min_games', min: 1, max: 100, label: t('quantumchess', 'Rated games to be listed'), help: '1–100' },
		{ key: 'leaderboard_active_days', min: 1, max: 3650, label: t('quantumchess', 'Listed while active (days)'), help: '1–3650' },
	],
	limits: [
		{ key: 'ai_requests_per_hour', min: 1, max: 1000, label: t('quantumchess', 'AI requests per hour'), help: t('quantumchess', '1–1000 per person') },
		{ key: 'ai_max_output_tokens', min: 100, max: 4000, label: t('quantumchess', 'Answer length (tokens)'), help: '100–4000' },
	],
}))

const diagnosticRows = computed(() => {
	const d = status.value?.diagnostics ?? {}
	return [
		{ label: t('quantumchess', 'Active games'), value: d.activeGames },
		{ label: t('quantumchess', 'Games finished today'), value: d.finishedToday },
		{ label: t('quantumchess', 'AI requests today'), value: t('quantumchess', 'Nextcloud AI {nextcloud} · organisation {shared} · personal keys {personal}', d.aiRequestsToday ?? {}) },
		{ label: t('quantumchess', 'Distributed cache'), value: d.distributedCache ? t('quantumchess', 'Available') : t('quantumchess', 'Not configured') },
		{ label: t('quantumchess', 'Background jobs'), value: d.backgroundJobMode },
	]
})

/**
 * Take the server's values, keeping fields that still have unsaved changes.
 *
 * @param {object} data GET /api/settings/admin
 */
function apply(data) {
	const { presets: list, status: s, ...values } = data
	for (const [key, value] of Object.entries(values)) {
		if (!(key in pending)) {
			v[key] = value
		}
	}
	if (list) {
		presets.value = list
	}
	if (s) {
		status.value = s
	}
	allowlistText.value = (v.local_allowlist ?? []).join('\n')
	notice.value = v.ai_privacy_notice ?? ''
}

onMounted(async () => {
	try {
		apply(await getAdminSettings())
	} catch (error) {
		loadError.value = errorText(error)
	} finally {
		loading.value = false
	}
})

/** Send the queued changes. */
async function flush() {
	clearTimeout(timer)
	timer = null
	const patch = { ...pending }
	for (const key of Object.keys(patch)) {
		delete pending[key]
	}
	if (Object.keys(patch).length === 0) {
		return
	}
	try {
		apply(await saveAdminSettings(patch))
		showSuccess(t('quantumchess', 'Saved'))
	} catch (error) {
		showError(errorText(error))
		try {
			apply(await getAdminSettings())
		} catch {
			// keep the local values
		}
	}
}

/**
 * Change a value and save it (switches and selections at once, typed values after a pause).
 *
 * @param {string} key setting key
 * @param {boolean|number|string|string[]} value new value
 * @param {boolean} [later] wait for more typing
 */
function set(key, value, later = false) {
	v[key] = value
	pending[key] = value
	clearTimeout(timer)
	timer = setTimeout(flush, later ? SAVE_DELAY_MS : 0)
}

/**
 * @param {string} key setting key
 * @param {string} text typed number
 */
function setNumber(key, text) {
	const value = Number.parseInt(text, 10)
	if (Number.isInteger(value)) {
		set(key, value, true)
	}
}

/** Save the allow-list textarea. */
function saveAllowlist() {
	const list = allowlistText.value.split('\n').map((line) => line.trim()).filter((line) => line !== '')
	if (JSON.stringify(list) !== JSON.stringify(v.local_allowlist)) {
		set('local_allowlist', list)
	}
}

/** Save the privacy notice. */
function saveNotice() {
	if (notice.value !== v.ai_privacy_notice) {
		set('ai_privacy_notice', notice.value)
	}
}

/** @param {{provider: object, apiKey: string|null}} payload provider and optional new key */
async function saveProvider({ provider, apiKey }) {
	savingProvider.value = true
	try {
		if (apiKey !== null) {
			v.shared_api_key = await saveAdminSecret('shared_api_key', apiKey)
		}
		apply(await saveAdminSettings({ shared_provider: provider }))
		showSuccess(t('quantumchess', 'The organisation provider was saved'))
	} catch (error) {
		showError(errorText(error))
	} finally {
		savingProvider.value = false
	}
}

/** Remove the organisation key (password confirmation). */
async function removeKey() {
	savingProvider.value = true
	try {
		v.shared_api_key = await saveAdminSecret('shared_api_key', '')
		showSuccess(t('quantumchess', 'The key was removed'))
	} catch (error) {
		showError(errorText(error))
	} finally {
		savingProvider.value = false
	}
}
</script>

<style scoped>
.qc-admin__block {
	display: flex;
	flex-direction: column;
	gap: calc(var(--default-grid-baseline) * 3);
	margin-block: calc(var(--default-grid-baseline) * 3);
}

.qc-admin__legend {
	font-weight: bold;
}

.qc-admin__numbers {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
	gap: calc(var(--default-grid-baseline) * 3);
	max-width: 760px;
}

.qc-admin__wide {
	max-width: 520px;
}

.qc-admin__field {
	display: flex;
	flex-direction: column;
	gap: var(--default-grid-baseline);
	max-width: 520px;
}

.qc-admin__field :deep(.v-select) {
	width: 100%;
}

.qc-admin__caption {
	color: var(--color-text-maxcontrast);
}

.qc-admin__diagnostics li {
	display: flex;
	flex-wrap: wrap;
	gap: 0 calc(var(--default-grid-baseline) * 4);
	padding-block: var(--default-grid-baseline);
}

.qc-admin__diagnostics li > :first-child {
	flex: 0 0 200px;
}
</style>
