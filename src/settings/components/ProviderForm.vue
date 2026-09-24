<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The form of an LLM provider: service preset, base URL (only for custom and local servers), model picker, API key and
  *Test connection*. Used for the organisation provider (admin) and for "My own API key". The parent saves; keys never
  come back from the server, only {hasKey, keyHint}.
-->
<template>
	<div class="qc-provider">
		<NcSelect
			v-model="presetOption"
			class="qc-provider__field"
			:inputLabel="t('quantumchess', 'Service')"
			:options="presetOptions"
			:clearable="false"
			:disabled="disabled" />

		<p v-if="preset && preset.fixedUrl" class="qc-provider__hint">
			{{ t('quantumchess', 'Address: {url}', { url: preset.baseUrl }) }}
		</p>
		<template v-else-if="preset && preset.local && scope === 'personal'">
			<NcNoteCard v-if="localAllowlist.length === 0" type="warning">
				{{ t('quantumchess', 'Your administrator has not allowed any local AI server yet.') }}
			</NcNoteCard>
			<NcSelect
				v-else
				v-model="draft.baseUrl"
				class="qc-provider__field"
				:inputLabel="t('quantumchess', 'Server address')"
				:options="localAllowlist"
				:clearable="false"
				:disabled="disabled" />
		</template>
		<NcTextField
			v-else-if="preset"
			v-model="draft.baseUrl"
			class="qc-provider__field"
			type="url"
			:label="t('quantumchess', 'Server address')"
			:placeholder="preset.baseUrl || 'https://ai.example.com/v1'"
			:helperText="scope === 'personal' ? t('quantumchess', 'Use https://. A local server works only if your administrator allowed its exact address.') : ''"
			:disabled="disabled" />

		<NcSelect
			v-model="draft.model"
			class="qc-provider__field"
			:inputLabel="t('quantumchess', 'Model')"
			:placeholder="t('quantumchess', 'Choose or type a model')"
			:options="modelOptions"
			:taggable="true"
			:pushTags="true"
			:disabled="disabled" />

		<NcTextField
			v-if="scope === 'shared'"
			v-model="draft.label"
			class="qc-provider__field"
			:label="t('quantumchess', 'Name shown to users (optional)')"
			:placeholder="preset ? preset.label : ''"
			:maxlength="64"
			:disabled="disabled" />

		<div class="qc-provider__key">
			<NcPasswordField
				v-model="draft.apiKey"
				class="qc-provider__field"
				:label="keyLabel"
				:helperText="keyHelp"
				:error="keyInfo.keyUnreadable"
				autocomplete="new-password"
				:disabled="disabled" />
			<NcButton
				v-if="keyInfo.hasKey"
				variant="tertiary"
				:disabled="disabled"
				@click="$emit('removeKey')">
				{{ t('quantumchess', 'Remove key') }}
			</NcButton>
		</div>

		<div class="qc-provider__actions">
			<NcButton
				variant="primary"
				:disabled="disabled || !canSave"
				@click="save">
				{{ t('quantumchess', 'Save') }}
			</NcButton>
			<NcButton
				variant="secondary"
				:disabled="disabled || testing || !canTest"
				@click="test">
				<template #icon>
					<NcLoadingIcon v-if="testing" :size="20" />
				</template>
				{{ t('quantumchess', 'Test connection') }}
			</NcButton>
		</div>
		<NcNoteCard
			v-if="result"
			:type="result.ok ? 'success' : 'error'"
			role="status">
			{{ result.ok
				? n('quantumchess', 'Connected. The server offers {count} chat model.', 'Connected. The server offers {count} chat models.', result.modelCount ?? 0, { count: result.modelCount ?? 0 })
				: connectionError(result.code) }}
		</NcNoteCard>
	</div>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
import { computed, reactive, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcPasswordField from '@nextcloud/vue/components/NcPasswordField'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { testAiConnection } from '../../services/api.js'
import { connectionError } from '../messages.js'

const props = defineProps({
	/** Saved provider {preset, kind, baseUrl, model, label?} or null */
	provider: { type: Object, default: null },
	/** Presets from the server */
	presets: { type: Array, required: true },
	/** 'shared' (organisation provider) or 'personal' */
	scope: { type: String, required: true },
	/** Exact local base URLs the admin allowed */
	localAllowlist: { type: Array, default: () => [] },
	/** {hasKey, keyHint, keyUnreadable} */
	keyInfo: { type: Object, default: () => ({ hasKey: false, keyHint: null, keyUnreadable: false }) },
	/** Disable every control (saving) */
	disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'removeKey'])

const draft = reactive({ preset: null, baseUrl: '', model: null, label: '', apiKey: '' })
const testing = ref(false)
const result = ref(null)
const loadedModels = ref([])

/** Copy the saved provider into the draft. */
function reset() {
	const p = props.provider
	draft.preset = p?.preset ?? (props.scope === 'personal' ? 'openai' : 'openai')
	draft.baseUrl = p?.baseUrl ?? ''
	draft.model = p?.model || null
	draft.label = p?.label ?? ''
	draft.apiKey = ''
}
reset()
watch(() => props.provider, reset)

const preset = computed(() => props.presets.find((x) => x.id === draft.preset) ?? null)
const presetOptions = computed(() => props.presets.map((x) => ({ id: x.id, label: x.label })))
const presetOption = computed({
	get: () => presetOptions.value.find((x) => x.id === draft.preset) ?? null,
	set: (option) => {
		if (!option || option.id === draft.preset) {
			return
		}
		draft.preset = option.id
		const next = preset.value
		draft.baseUrl = next?.local && props.scope === 'personal' ? (props.localAllowlist[0] ?? '') : (next?.baseUrl ?? '')
		draft.model = next?.suggestedModels?.[0] ?? null
		loadedModels.value = []
		result.value = null
	},
})

const modelOptions = computed(() => {
	const list = [...loadedModels.value.map((m) => m.id), ...(preset.value?.suggestedModels ?? [])]
	if (draft.model && !list.includes(draft.model)) {
		list.unshift(draft.model)
	}
	return [...new Set(list)]
})

const baseUrl = computed(() => preset.value?.fixedUrl ? preset.value.baseUrl : (draft.baseUrl ?? '').trim())
// The server drops the saved key when the service or its address changes (it is never sent anywhere else).
const endpointChanged = computed(() => !props.provider || props.provider.preset !== draft.preset || props.provider.baseUrl !== baseUrl.value)
const keyLabel = computed(() => props.keyInfo.hasKey ? t('quantumchess', 'Replace API key') : t('quantumchess', 'API key'))
const keyHelp = computed(() => {
	if (props.keyInfo.keyUnreadable) {
		return t('quantumchess', 'Your saved key can\'t be read any more. Please enter it again.')
	}
	if (props.keyInfo.hasKey && endpointChanged.value) {
		return t('quantumchess', 'The saved key is only sent to the saved address. Enter the key again for this service.')
	}
	if (props.keyInfo.hasKey) {
		return props.keyInfo.keyHint
			? t('quantumchess', 'Saved key ends in …{hint}. Leave empty to keep it.', { hint: props.keyInfo.keyHint })
			: t('quantumchess', 'A key is saved. Leave empty to keep it.')
	}
	return preset.value?.keyRequired ? t('quantumchess', 'Required for this service.') : t('quantumchess', 'Optional for this service.')
})

const canTest = computed(() => preset.value !== null && baseUrl.value !== '')
const canSave = computed(() => canTest.value && typeof draft.model === 'string' && draft.model.trim() !== '')

/** The provider object of the draft. */
function current() {
	const provider = { preset: draft.preset, kind: preset.value?.kind ?? 'openai', baseUrl: baseUrl.value, model: (draft.model ?? '').trim() }
	if (props.scope === 'shared') {
		provider.label = draft.label.trim()
	}
	return provider
}

/** Save the provider (and the key when one was typed). */
function save() {
	const key = draft.apiKey.trim()
	emit('save', { provider: current(), apiKey: key === '' ? null : key })
	draft.apiKey = ''
}

/** Test the draft connection: only a code and the model list come back. */
async function test() {
	testing.value = true
	result.value = null
	try {
		const key = draft.apiKey.trim()
		const res = await testAiConnection({ scope: props.scope, ...current(), apiKey: key === '' ? null : key })
		result.value = res
		loadedModels.value = res.ok ? (res.models ?? []) : []
	} catch (error) {
		result.value = { ok: false, code: error?.code === 'url_not_allowed' ? 'url_not_allowed' : (error?.data?.upstream ?? 'bad_response') }
	} finally {
		testing.value = false
	}
}

defineExpose({ reset })
</script>

<style scoped>
.qc-provider {
	display: flex;
	flex-direction: column;
	gap: calc(var(--default-grid-baseline) * 3);
	max-width: 520px;
}

.qc-provider__field {
	width: 100%;
}

.qc-provider__hint {
	color: var(--color-text-maxcontrast);
	margin: 0;
}

.qc-provider__key {
	display: flex;
	align-items: flex-start;
	gap: calc(var(--default-grid-baseline) * 2);
}

.qc-provider__key > :first-child {
	flex: 1 1 auto;
	min-width: 0;
}

.qc-provider__key > :not(:first-child) {
	flex: 0 0 auto;
}

.qc-provider__actions {
	display: flex;
	flex-wrap: wrap;
	gap: calc(var(--default-grid-baseline) * 2);
}
</style>
