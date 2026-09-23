<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  New game (GAME-DESIGN §2.4): the four modes as a radio group, then the options of the chosen mode. The last-used
  values are remembered per mode in the preferences.
-->
<template>
	<NcDialog
		:name="t('quantumchess', 'New game')"
		size="normal"
		class="qc-new-game"
		@update:open="(v) => !v && emit('close')">
		<div class="qc-new-game__body">
			<div class="qc-new-game__modes" role="radiogroup" :aria-label="t('quantumchess', 'Mode')">
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
					:data-test="'mode-' + m.id"
					@click="!m.disabled && (mode = m.id)">
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
				<fieldset class="qc-new-game__group">
					<legend>{{ t('quantumchess', 'Opponent') }}</legend>
					<div class="qc-new-game__personas">
						<label
							v-for="p in PERSONAS"
							:key="p.id"
							class="qc-new-game__persona"
							:class="{ 'qc-new-game__persona--active': aiOpts.persona === p.id }">
							<input
								v-model="aiOpts.persona"
								class="hidden-visually"
								type="radio"
								name="qc-persona"
								:value="p.id">
							<component :is="p.avatar.happy" :size="44" />
							<span>
								<strong>{{ p.name }}</strong>
								<span class="qc-new-game__muted">{{ p.description() }}</span>
							</span>
						</label>
					</div>
				</fieldset>
				<fieldset v-if="availableSources.length > 1" class="qc-new-game__group">
					<legend>{{ t('quantumchess', 'AI source') }}</legend>
					<NcCheckboxRadioSwitch
						v-for="s in availableSources"
						:key="s.id"
						v-model="aiOpts.source"
						type="radio"
						name="qc-source"
						:value="s.id">
						{{ s.label }}
					</NcCheckboxRadioSwitch>
				</fieldset>
				<fieldset class="qc-new-game__group">
					<legend>{{ t('quantumchess', 'Strength') }}</legend>
					<div class="qc-new-game__row">
						<NcCheckboxRadioSwitch
							v-for="s in strengths"
							:key="s.id"
							v-model="aiOpts.strength"
							type="radio"
							name="qc-strength"
							:value="s.id">
							{{ s.label }}
						</NcCheckboxRadioSwitch>
					</div>
				</fieldset>
				<ColorChoice v-model="aiOpts.color" name="qc-ai-color" />
			</template>

			<!-- Pass & play -->
			<template v-else-if="mode === 'local'">
				<div class="qc-new-game__names">
					<NcTextField v-model="local.white" :label="t('quantumchess', 'Name for White')" :maxlength="40" />
					<NcTextField v-model="local.black" :label="t('quantumchess', 'Name for Black')" :maxlength="40" />
				</div>
				<NcCheckboxRadioSwitch v-model="local.autoFlip" type="switch">
					{{ t('quantumchess', 'Turn the board to the side to move') }}
				</NcCheckboxRadioSwitch>
			</template>

			<!-- Online -->
			<template v-else-if="mode === 'online'">
				<NcCheckboxRadioSwitch v-if="features.openChallenges" v-model="online.open" type="switch">
					{{ t('quantumchess', 'Open challenge: anyone who can find me may join') }}
				</NcCheckboxRadioSwitch>
				<NcSelectUsers
					v-if="!online.open"
					v-model="online.opponent"
					:inputLabel="t('quantumchess', 'Opponent')"
					:placeholder="t('quantumchess', 'Search for a colleague')"
					:options="userOptions"
					:loading="searching"
					@search="onSearch" />
				<fieldset class="qc-new-game__group">
					<legend>{{ t('quantumchess', 'Time per move') }}</legend>
					<div class="qc-new-game__row">
						<NcCheckboxRadioSwitch
							v-for="tc in timeControls"
							:key="tc.id"
							v-model="online.timeControl"
							type="radio"
							name="qc-time"
							:value="tc.id"
							:disabled="tc.id === 'corr:none' && online.rated">
							{{ tc.label }}
						</NcCheckboxRadioSwitch>
					</div>
				</fieldset>
				<NcCheckboxRadioSwitch
					v-if="features.rated"
					v-model="online.rated"
					type="switch"
					:disabled="ratedBlocked !== null"
					:description="ratedBlocked ?? undefined">
					{{ t('quantumchess', 'Rated') }}
				</NcCheckboxRadioSwitch>
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
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcSelectUsers from '@nextcloud/vue/components/NcSelectUsers'
import NcTextArea from '@nextcloud/vue/components/NcTextArea'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import ColorChoice from './ColorChoice.vue'
import { LEVELS } from '../../ai/levels.js'
import { hasView } from '../../composables/modules.js'
import { unavailableText, useAiSources } from '../../composables/useAiSources.js'
import { levelLabel } from '../../personas/engineLines.js'
import { PERSONAS } from '../../personas/index.js'
import { checkRated, createGame, getRecentOpponents, searchUsers } from '../../services/api.js'
import { features } from '../../services/initialState.js'
import { createLocalGame } from '../../services/localGames.js'
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
const onlineAvailable = features.multiplayer && hasView('OnlineGameView')

const modes = computed(() => [
	...(onlineAvailable ? [{ id: 'online', icon: mdiEarth, label: t('quantumchess', 'Online') }] : []),
	{ id: 'computer', icon: mdiRobotOutline, label: t('quantumchess', 'Computer') },
	{ id: 'ai', icon: mdiCreationOutline, label: t('quantumchess', 'AI opponent'), disabled: !ai.anyAvailable.value, reason: unavailableText(null) },
	{ id: 'local', icon: mdiAccountMultipleOutline, label: t('quantumchess', 'Pass & play') },
])

const last = preferences.lastNewGame ?? {}
const wanted = ['online', 'computer', 'ai', 'local'].includes(props.initialMode) ? props.initialMode : 'computer'
const mode = ref(wanted === 'online' && !onlineAvailable ? 'computer' : wanted)
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
	white: last.local?.white ?? t('quantumchess', 'White'),
	black: last.local?.black ?? t('quantumchess', 'Black'),
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

const strengths = [
	{ id: 'relaxed', label: t('quantumchess', 'Relaxed') },
	{ id: 'balanced', label: t('quantumchess', 'Balanced') },
	{ id: 'sharp', label: t('quantumchess', 'Sharp') },
]
const timeControls = [
	{ id: 'corr:1d', label: t('quantumchess', '1 day') },
	{ id: 'corr:3d', label: t('quantumchess', '3 days') },
	{ id: 'corr:7d', label: t('quantumchess', '7 days') },
	{ id: 'corr:none', label: t('quantumchess', 'No deadline') },
]

// --- Online: user search and the rated check ---

const userOptions = ref([])
const searching = ref(false)
let searchSeq = 0

/**
 * NcSelect user option.
 *
 * @param {object} u user
 * @return {object}
 */
const toOption = (u) => ({ id: u.userId, user: u.userId, displayName: u.displayName, subname: u.subline ?? '' })

if (onlineAvailable) {
	getRecentOpponents().then((users) => {
		if (userOptions.value.length === 0) {
			userOptions.value = users.map(toOption)
		}
	}).catch(() => {})
}

/**
 * Search users.
 *
 * @param {string} term search text
 */
async function onSearch(term) {
	const seq = ++searchSeq
	if (!term || term.length < 1) {
		return
	}
	searching.value = true
	try {
		const users = await searchUsers(term, { limit: 10 })
		if (seq === searchSeq) {
			userOptions.value = users.map(toOption)
		}
	} catch {
		// keep the list
	} finally {
		if (seq === searchSeq) {
			searching.value = false
		}
	}
}

const ratedReason = ref(null)
watch(() => online.opponent?.id, async (uid) => {
	ratedReason.value = null
	if (!uid || !features.rated) {
		return
	}
	try {
		const r = await checkRated(uid)
		ratedReason.value = r.rated ? null : (r.reason ?? 'admin')
	} catch {
		ratedReason.value = null
	}
})
const ratedBlocked = computed(() => {
	if (ratedReason.value === 'pair_cap') {
		return t('quantumchess', 'You have played enough rated games against each other for now.')
	}
	if (ratedReason.value) {
		return t('quantumchess', 'Rated games are not available for this pair.')
	}
	return null
})
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
			const bot = { kind: 'ai', persona: aiOpts.persona, source: aiOpts.source, model: null, strength: aiOpts.strength, sourceLabel: source?.label ?? '' }
			const record = createLocalGame({
				mode: 'ai',
				players: human === 'w' ? { w: { kind: 'human' }, b: bot } : { w: bot, b: { kind: 'human' } },
				humanColor: human,
			})
			rememberNewGame('ai', { persona: aiOpts.persona, source: aiOpts.source, strength: aiOpts.strength, color: aiOpts.color })
			router.replace(`/play/ai/${record.id}`)
		} else if (mode.value === 'local') {
			const white = local.white.trim() || t('quantumchess', 'White')
			const black = local.black.trim() || t('quantumchess', 'Black')
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
	grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
	gap: 8px;
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

.qc-new-game__row {
	display: flex;
	flex-wrap: wrap;
	gap: 0 16px;
}

.qc-new-game__personas {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 8px;
}

.qc-new-game__persona {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px;
	border: 2px solid var(--color-border);
	border-radius: var(--border-radius-large);
	cursor: pointer;

	> span {
		display: flex;
		flex-direction: column;
		gap: 2px;
		line-height: 1.3;
	}

	&:focus-within {
		outline: 2px solid var(--color-primary-element);
		outline-offset: 2px;
	}
}

.qc-new-game__persona--active {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
}

.qc-new-game__muted {
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-new-game__names {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;
}
</style>
