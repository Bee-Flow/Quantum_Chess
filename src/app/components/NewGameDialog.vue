<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  New game: the four modes as a radio group, then the options of the chosen mode (the LLM opponent's in PersonaPicker,
  the online game's in OpponentPicker). The last-used values are remembered per mode in the preferences.
-->
<template>
	<NcDialog
		:name="t('quantumchess', 'New game')"
		size="normal"
		class="qc-new-game"
		@update:open="(v) => !v && emit('close')">
		<div class="qc-new-game__body">
			<div
				class="qc-new-game__modes"
				role="radiogroup"
				:aria-label="t('quantumchess', 'Mode')"
				:style="{ '--qc-mode-count': modes.length }">
				<button
					v-for="m in modes"
					:key="m.id"
					type="button"
					role="radio"
					class="qc-new-game__mode"
					:class="{ 'qc-new-game__mode--active': mode === m.id }"
					:aria-checked="mode === m.id ? 'true' : 'false'"
					:aria-disabled="m.disabled ? 'true' : undefined"
					:title="m.disabled ? m.reason : undefined"
					:tabindex="mode === m.id ? 0 : -1"
					:data-test="'mode-' + m.id"
					@click="!m.disabled && (mode = m.id)"
					@keydown.left.prevent="stepMode(-1, $event)"
					@keydown.right.prevent="stepMode(1, $event)"
					@keydown.up.prevent="stepMode(-1, $event)"
					@keydown.down.prevent="stepMode(1, $event)">
					<NcIconSvgWrapper :path="m.icon" :size="28" />
					<span>{{ m.label }}</span>
				</button>
			</div>

			<!-- Computer -->
			<template v-if="mode === 'computer'">
				<fieldset class="qc-new-game__group">
					<legend>{{ t('quantumchess', 'Level') }}</legend>
					<NcCheckboxRadioSwitch
						v-for="l in LEVELS"
						:key="l.level"
						v-model="computer.level"
						type="radio"
						name="qc-level"
						:value="String(l.level)"
						:data-test="'level-' + l.level">
						{{ l.level }} · {{ l.name }} · {{ levelLabel(l.label) }}
					</NcCheckboxRadioSwitch>
				</fieldset>
				<ColorChoice v-model="computer.color" name="qc-computer-color" />
			</template>

			<!-- AI opponent -->
			<template v-else-if="mode === 'ai'">
				<PersonaPicker
					v-model:persona="aiOpts.persona"
					v-model:source="aiOpts.source"
					v-model:strength="aiOpts.strength"
					:availableSources="availableSources" />
				<ColorChoice v-model="aiOpts.color" name="qc-ai-color" />
			</template>

			<!-- Pass & play -->
			<template v-else-if="mode === 'local'">
				<div class="qc-new-game__names">
					<NcTextField
						v-model="local.white"
						:label="t('quantumchess', 'Name for White')"
						:placeholder="t('quantumchess', 'White')"
						:maxlength="40" />
					<NcTextField
						v-model="local.black"
						:label="t('quantumchess', 'Name for Black')"
						:placeholder="t('quantumchess', 'Black')"
						:maxlength="40" />
				</div>
				<NcCheckboxRadioSwitch v-model="local.autoFlip" type="switch">
					{{ t('quantumchess', 'Turn the board to the side to move') }}
				</NcCheckboxRadioSwitch>
			</template>

			<!-- Online -->
			<template v-else-if="mode === 'online'">
				<OpponentPicker
					v-model:open="online.open"
					v-model:opponent="online.opponent"
					v-model:timeControl="online.timeControl"
					v-model:rated="online.rated"
					:ratedBlocked="ratedBlocked" />
				<ColorChoice v-if="!ratedEffective" v-model="online.color" name="qc-online-color" />
				<NcTextArea
					v-model="online.message"
					:label="t('quantumchess', 'Message (optional)')"
					:maxlength="200"
					resize="vertical" />
			</template>

			<NcNoteCard v-if="errorText" type="error">
				{{ errorText }}
			</NcNoteCard>
		</div>
		<template #actions>
			<NcButton @click="emit('close')">
				{{ t('quantumchess', 'Cancel') }}
			</NcButton>
			<NcButton
				variant="primary"
				:disabled="!canStart || busy"
				data-test="start-game"
				@click="start">
				{{ primaryLabel }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<script setup>
import { mdiAccountMultipleOutline, mdiCreationOutline, mdiEarth, mdiRobotOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import PersonaPicker from '../../llm/components/PersonaPicker.vue'
import OpponentPicker from '../../online/components/OpponentPicker.vue'
import ColorChoice from './ColorChoice.vue'
import { LEVELS } from '../../ai/levels.js'
import { levelLabel } from '../../game/computerLines.js'
import { createLocalGame } from '../../game/localGames.js'
import { unavailableText, useAiSources } from '../../llm/composables/useAiSources.js'
import { useRatedCheck } from '../../online/composables/useRatedCheck.js'
import { createGame } from '../../services/api.js'
import { features } from '../../services/initialState.js'
import { preferences, rememberNewGame } from '../../services/preferences.js'

const props = defineProps({
	/** Preselected mode (query `mode`) */
	initialMode: { type: String, default: '' },
	/** Prefilled online opponent (query `opponent`) */
	opponent: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const router = useRouter()
const ai = useAiSources()
ai.refresh()
const onlineAvailable = features.multiplayer

const modes = computed(() => [
	...(onlineAvailable ? [{ id: 'online', icon: mdiEarth, label: t('quantumchess', 'Online') }] : []),
	{ id: 'computer', icon: mdiRobotOutline, label: t('quantumchess', 'Computer') },
	{
		id: 'ai',
		icon: mdiCreationOutline,
		label: t('quantumchess', 'AI opponent'),
		disabled: !ai.anyAvailable.value,
		reason: unavailableText(null),
	},
	{ id: 'local', icon: mdiAccountMultipleOutline, label: t('quantumchess', 'Pass & play') },
])

const last = preferences.lastNewGame ?? {}
const wanted = ['online', 'computer', 'ai', 'local'].includes(props.initialMode) ? props.initialMode : 'computer'
const mode = ref((wanted === 'online' && !onlineAvailable) || (wanted === 'ai' && !ai.anyAvailable.value)
	? 'computer'
	: wanted)
const busy = ref(false)
const errorText = ref('')

const computer = reactive({ level: String(last.computer?.level ?? 1), color: last.computer?.color ?? 'w' })
const availableSources = computed(() => ai.sources.value.filter((s) => s.available))
const aiOpts = reactive({
	persona: last.ai?.persona ?? 'professor',
	source: last.ai?.source ?? ai.defaultSource.value ?? 'nextcloud',
	strength: last.ai?.strength ?? 'balanced',
	color: last.ai?.color ?? 'w',
})
watch(availableSources, (list) => {
	if (list.length && !list.some((s) => s.id === aiOpts.source)) {
		aiOpts.source = list[0].id
	}
}, { immediate: true })
const local = reactive({
	// Empty means the default name, shown in the viewer's language ("White", "Wit", "Blancs", …)
	white: last.local?.white ?? '',
	black: last.local?.black ?? '',
	autoFlip: last.local?.autoFlip ?? preferences.autoFlip ?? false,
})
const online = reactive({
	open: false,
	opponent: props.opponent ? { id: props.opponent, user: props.opponent, displayName: props.opponent } : null,
	timeControl: last.online?.timeControl ?? 'corr:3d',
	rated: features.rated ? (last.online?.rated ?? true) : false,
	color: last.online?.color ?? 'r',
	message: '',
})

const ratedBlocked = useRatedCheck(() => online.opponent?.id)
const ratedEffective = computed(() => features.rated && online.rated && ratedBlocked.value === null)
watch(ratedEffective, (rated) => {
	if (rated && online.timeControl === 'corr:none') {
		online.timeControl = 'corr:3d'
	}
})

const canStart = computed(() => {
	if (mode.value === 'online') {
		return online.open || online.opponent !== null
	}
	if (mode.value === 'ai') {
		return ai.anyAvailable.value && availableSources.value.some((s) => s.id === aiOpts.source)
	}
	return true
})

const primaryLabel = computed(() => {
	if (mode.value === 'online') {
		return online.open ? t('quantumchess', 'Create challenge') : t('quantumchess', 'Send invitation')
	}
	return t('quantumchess', 'Start game')
})

/**
 * Arrow keys in the mode radio group: select the previous or next available mode and focus it.
 *
 * @param {number} dir -1 or 1
 * @param {KeyboardEvent} event the key event
 */
function stepMode(dir, event) {
	const list = modes.value.filter((m) => !m.disabled)
	const at = list.findIndex((m) => m.id === mode.value)
	const next = list[(at + dir + list.length) % list.length]
	mode.value = next.id
	nextTick(() => event.target.closest('[role=radiogroup]')?.querySelector('[aria-checked=true]')?.focus())
}

/**
 * Resolve a colour choice.
 *
 * @param {'w'|'b'|'r'} choice colour choice
 * @return {'w'|'b'}
 */
function resolveColor(choice) {
	if (choice === 'w' || choice === 'b') {
		return choice
	}
	return (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & 1) ? 'b' : 'w'
}

/** Create the game and open it. */
async function start() {
	errorText.value = ''
	busy.value = true
	try {
		if (mode.value === 'computer') {
			const level = Number(computer.level)
			const human = resolveColor(computer.color)
			const engine = { kind: 'engine', level }
			const record = createLocalGame({
				mode: 'computer',
				players: human === 'w' ? { w: { kind: 'human' }, b: engine } : { w: engine, b: { kind: 'human' } },
				humanColor: human,
				options: { coach: level <= 2 ? 'beginner' : 'standard' },
			})
			rememberNewGame('computer', { level, color: computer.color })
			router.replace(`/play/computer/${record.id}`)
		} else if (mode.value === 'ai') {
			if (!await ai.ensureNotice(aiOpts.source)) {
				return
			}
			const human = resolveColor(aiOpts.color)
			const source = ai.sources.value.find((s) => s.id === aiOpts.source)
			const bot = {
				kind: 'ai',
				persona: aiOpts.persona,
				source: aiOpts.source,
				model: null,
				strength: aiOpts.strength,
				sourceLabel: source?.label ?? '',
			}
			const record = createLocalGame({
				mode: 'ai',
				players: human === 'w' ? { w: { kind: 'human' }, b: bot } : { w: bot, b: { kind: 'human' } },
				humanColor: human,
			})
			rememberNewGame('ai', {
				persona: aiOpts.persona,
				source: aiOpts.source,
				strength: aiOpts.strength,
				color: aiOpts.color,
			})
			router.replace(`/play/ai/${record.id}`)
		} else if (mode.value === 'local') {
			const white = local.white.trim() === t('quantumchess', 'White') ? '' : local.white.trim()
			const black = local.black.trim() === t('quantumchess', 'Black') ? '' : local.black.trim()
			const record = createLocalGame({
				mode: 'local',
				players: { w: { kind: 'local', name: white }, b: { kind: 'local', name: black } },
				humanColor: null,
				options: { autoFlip: local.autoFlip },
			})
			rememberNewGame('local', { white, black, autoFlip: local.autoFlip })
			router.replace(`/play/local/${record.id}`)
		} else {
			const game = await createGame({
				opponent: online.open ? null : online.opponent.id,
				color: ratedEffective.value ? 'r' : online.color,
				rated: ratedEffective.value,
				timeControl: online.timeControl,
				message: online.message.trim() || null,
				scopeGroup: null,
			})
			rememberNewGame('online', { timeControl: online.timeControl, rated: online.rated, color: online.color })
			router.replace(`/game/${game.id}`)
		}
	} catch (e) {
		errorText.value = e?.message || t('quantumchess', 'The game could not be created. Please try again.')
	} finally {
		busy.value = false
	}
}
</script>

<style lang="scss" scoped>
.qc-new-game__body {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding-bottom: 8px;
}

.qc-new-game__modes {
	display: grid;
	grid-template-columns: repeat(var(--qc-mode-count, 4), minmax(0, 1fr));
	gap: 8px;

	@media (max-width: 480px) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.qc-new-game__mode {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	margin: 0;
	padding: 12px 8px;
	border: 2px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	color: var(--color-main-text);
	font-weight: bold;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		border-color: var(--color-primary-element);
	}

	&[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.5;
	}
}

.qc-new-game__mode--active {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
}

.qc-new-game__group {
	display: flex;
	flex-direction: column;
	gap: 2px;
	margin: 0;
	padding: 0;
	border: none;

	legend {
		margin-bottom: 4px;
		font-weight: bold;
	}
}

.qc-new-game__names {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;
}
</style>
