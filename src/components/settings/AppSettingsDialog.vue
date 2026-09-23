<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  In-app settings (GAME-DESIGN §8.1): every change applies live and is saved debounced through preferences.js.
  LEAN-1.0: three board themes, cburnett pieces only, no vibration setting; coach settings appear when the coach
  package is bundled.
-->
<template>
	<NcAppSettingsDialog
		:open="open"
		:name="t('quantumchess', 'Quantum Chess settings')"
		showNavigation
		@update:open="emit('update:open', $event)">
		<NcAppSettingsSection id="qc-settings-board" :name="t('quantumchess', 'Board')">
			<fieldset class="qc-settings__group">
				<legend>{{ t('quantumchess', 'Theme') }}</legend>
				<div class="qc-settings__themes" role="radiogroup" :aria-label="t('quantumchess', 'Theme')">
					<label
						v-for="id in BOARD_THEMES"
						:key="id"
						class="qc-settings__theme"
						:class="{ 'qc-settings__theme--active': theme === id }">
						<input
							class="hidden-visually"
							type="radio"
							name="qc-theme"
							:value="id"
							:checked="theme === id"
							@change="set('boardTheme', id)">
						<MiniBoard
							:state="previewState"
							:size="96"
							:boardTheme="id"
							:label="boardThemeLabel(id)" />
						<span>{{ boardThemeLabel(id) }}</span>
					</label>
				</div>
			</fieldset>
			<RadioRow
				:label="t('quantumchess', 'Coordinates')"
				:modelValue="preferences.coordinates"
				:options="coordinateOptions"
				@update:modelValue="set('coordinates', $event)" />
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.highlightLastMove" @update:modelValue="set('highlightLastMove', $event)">
				{{ t('quantumchess', 'Highlight the last move') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.showLegalMoves" @update:modelValue="set('showLegalMoves', $event)">
				{{ t('quantumchess', 'Show legal moves') }}
			</NcCheckboxRadioSwitch>
		</NcAppSettingsSection>

		<NcAppSettingsSection id="qc-settings-quantum" :name="t('quantumchess', 'Quantum display')">
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.showPercentages" @update:modelValue="set('showPercentages', $event)">
				{{ t('quantumchess', 'Show percentages on ghosts') }}
			</NcCheckboxRadioSwitch>
			<RadioRow
				:label="t('quantumchess', 'Probability format')"
				:modelValue="preferences.probabilityFormat"
				:options="formatOptions"
				@update:modelValue="set('probabilityFormat', $event)" />
			<RadioRow
				:label="t('quantumchess', 'Ghost style')"
				:modelValue="preferences.ghostStyle"
				:options="ghostOptions"
				@update:modelValue="set('ghostStyle', $event)" />
			<RadioRow
				:label="t('quantumchess', 'Link threads')"
				:modelValue="preferences.linkThreads"
				:options="linkOptions"
				@update:modelValue="set('linkThreads', $event)" />
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.kingDangerBoth" @update:modelValue="set('kingDangerBoth', $event)">
				{{ t('quantumchess', 'Show king danger for both sides') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.showPossibilities" @update:modelValue="set('showPossibilities', $event)">
				{{ t('quantumchess', 'Show the possibilities count') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.physicsNames" @update:modelValue="set('physicsNames', $event)">
				{{ t('quantumchess', 'Physics names (superposition, measurement, entanglement)') }}
			</NcCheckboxRadioSwitch>
		</NcAppSettingsSection>

		<NcAppSettingsSection id="qc-settings-moves" :name="t('quantumchess', 'Moves')">
			<RadioRow
				:label="t('quantumchess', 'Input')"
				:modelValue="preferences.inputMode"
				:options="inputOptions"
				@update:modelValue="set('inputMode', $event)" />
			<RadioRow
				:label="t('quantumchess', 'Confirm moves')"
				:modelValue="preferences.confirmMoves ?? 'auto'"
				:options="confirmOptions"
				@update:modelValue="set('confirmMoves', $event === 'auto' ? null : $event)" />
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.safetyNet" @update:modelValue="set('safetyNet', $event)">
				{{ t('quantumchess', 'Warn before risking my king') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.autoQueen" @update:modelValue="set('autoQueen', $event)">
				{{ t('quantumchess', 'Always promote to a queen') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.confirmResign" @update:modelValue="set('confirmResign', $event)">
				{{ t('quantumchess', 'Ask before resigning') }}
			</NcCheckboxRadioSwitch>
		</NcAppSettingsSection>

		<NcAppSettingsSection id="qc-settings-motion" :name="t('quantumchess', 'Animation and sound')">
			<RadioRow
				:label="t('quantumchess', 'Animation speed')"
				:modelValue="preferences.animationSpeed ?? 'auto'"
				:options="speedOptions"
				@update:modelValue="set('animationSpeed', $event === 'auto' ? null : $event)" />
			<p v-if="reducedMotion" class="qc-settings__note">
				{{ t('quantumchess', 'Your system asks for reduced motion, so animations are off unless you choose a speed.') }}
			</p>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.sound" @update:modelValue="set('sound', $event)">
				{{ t('quantumchess', 'Sound') }}
			</NcCheckboxRadioSwitch>
			<label class="qc-settings__volume">
				<span>{{ t('quantumchess', 'Volume') }}</span>
				<input
					type="range"
					min="0"
					max="100"
					step="5"
					:disabled="!preferences.sound"
					:value="preferences.volume"
					@change="onVolume($event.target.value)">
				<span class="qc-settings__value">{{ preferences.volume }}</span>
			</label>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.moveChime" @update:modelValue="set('moveChime', $event)">
				{{ t('quantumchess', 'Your-move chime') }}
			</NcCheckboxRadioSwitch>
		</NcAppSettingsSection>

		<NcAppSettingsSection id="qc-settings-engine" :name="hasCoach ? t('quantumchess', 'Coach and computer') : t('quantumchess', 'Computer')">
			<template v-if="hasCoach">
				<RadioRow
					:label="t('quantumchess', 'Coach level')"
					:modelValue="preferences.coachLevel ?? 'auto'"
					:options="coachOptions"
					@update:modelValue="set('coachLevel', $event === 'auto' ? null : $event)" />
				<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.evalBar" @update:modelValue="set('evalBar', $event)">
					{{ t('quantumchess', 'Evaluation bar') }}
				</NcCheckboxRadioSwitch>
				<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.hints" @update:modelValue="set('hints', $event)">
					{{ t('quantumchess', 'Hints') }}
				</NcCheckboxRadioSwitch>
			</template>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.engineLines" @update:modelValue="set('engineLines', $event)">
				{{ t('quantumchess', 'Let the computer talk') }}
			</NcCheckboxRadioSwitch>
			<NcCheckboxRadioSwitch type="switch" :modelValue="preferences.fastEngine" @update:modelValue="set('fastEngine', $event)">
				{{ t('quantumchess', 'Fast computer (no thinking delay)') }}
			</NcCheckboxRadioSwitch>
		</NcAppSettingsSection>

		<NcAppSettingsShortcutsSection>
			<NcHotkeyList :label="t('quantumchess', 'Board')">
				<NcHotkey :label="t('quantumchess', 'Move, Split, Merge, Measure')" hotkey="1 2 3 4" />
				<NcHotkey :label="t('quantumchess', 'Select a square')" hotkey="Enter" />
				<NcHotkey :label="t('quantumchess', 'Move the focus')" hotkey="ArrowUp ArrowDown ArrowLeft ArrowRight" />
				<NcHotkey :label="t('quantumchess', 'What-if view of the focused part')" hotkey="E" />
				<NcHotkey :label="t('quantumchess', 'Possibilities panel')" hotkey="W" />
				<NcHotkey :label="t('quantumchess', 'Describe the position')" hotkey="D" />
				<NcHotkey :label="t('quantumchess', 'Cancel')" hotkey="Escape" />
			</NcHotkeyList>
			<NcHotkeyList :label="t('quantumchess', 'Game')">
				<NcHotkey :label="t('quantumchess', 'Flip the board')" hotkey="F" />
				<NcHotkey :label="t('quantumchess', 'Previous and next move')" hotkey=", ." />
				<NcHotkey :label="t('quantumchess', 'Back to the live position')" hotkey="L" />
			</NcHotkeyList>
		</NcAppSettingsShortcutsSection>
	</NcAppSettingsDialog>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcAppSettingsDialog from '@nextcloud/vue/components/NcAppSettingsDialog'
import NcAppSettingsSection from '@nextcloud/vue/components/NcAppSettingsSection'
import NcAppSettingsShortcutsSection from '@nextcloud/vue/components/NcAppSettingsShortcutsSection'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcHotkey from '@nextcloud/vue/components/NcHotkey'
import NcHotkeyList from '@nextcloud/vue/components/NcHotkeyList'
import MiniBoard from '../board/MiniBoard.vue'
import RadioRow from './RadioRow.vue'
import { optionalComponent } from '../../composables/modules.js'
import { setupPosition } from '../../engine/index.js'
import { preferences, setPreference } from '../../services/preferences.js'
import { playSound } from '../../sound/sound.js'
import { reducedMotion } from '../board/boardPreferences.js'
import { BOARD_THEMES, boardThemeLabel, resolveBoardTheme } from '../board/themes.js'

defineProps({
	/** Dialog open */
	open: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const hasCoach = optionalComponent('coach', 'CoachPanel') !== null
const theme = computed(() => resolveBoardTheme(preferences.boardTheme))

// A small live preview: a 50 % knight, a solid bishop, the kings.
const previewState = setupPosition({ fen: '4k3/8/8/8/8/8/8/2B1KN2 w - - 0 1', prelude: ['f1-e3|g3'] })

const coordinateOptions = [
	{ value: 'inside', label: t('quantumchess', 'Inside') },
	{ value: 'all', label: t('quantumchess', 'All squares') },
	{ value: 'off', label: t('quantumchess', 'Off') },
]
const formatOptions = [
	{ value: 'percent', label: t('quantumchess', 'Percent') },
	{ value: 'fraction', label: t('quantumchess', 'Fraction') },
]
const ghostOptions = [
	{ value: 'fade', label: t('quantumchess', 'Fade') },
	{ value: 'solid', label: t('quantumchess', 'Opaque') },
]
const linkOptions = [
	{ value: 'off', label: t('quantumchess', 'Off') },
	{ value: 'selection', label: t('quantumchess', 'On selection') },
	{ value: 'always', label: t('quantumchess', 'Always') },
]
const inputOptions = [
	{ value: 'both', label: t('quantumchess', 'Click and drag') },
	{ value: 'click', label: t('quantumchess', 'Click only') },
	{ value: 'drag', label: t('quantumchess', 'Drag only') },
]
const confirmOptions = [
	{ value: 'auto', label: t('quantumchess', 'Automatic') },
	{ value: 'never', label: t('quantumchess', 'Never') },
	{ value: 'rolled', label: t('quantumchess', 'Rolled moves') },
	{ value: 'always', label: t('quantumchess', 'Always') },
]
const speedOptions = [
	{ value: 'auto', label: t('quantumchess', 'Automatic') },
	{ value: 'slow', label: t('quantumchess', 'Slow') },
	{ value: 'normal', label: t('quantumchess', 'Normal') },
	{ value: 'fast', label: t('quantumchess', 'Fast') },
	{ value: 'off', label: t('quantumchess', 'Off') },
]
const coachOptions = [
	{ value: 'auto', label: t('quantumchess', 'Automatic') },
	{ value: 'beginner', label: t('quantumchess', 'Beginner') },
	{ value: 'standard', label: t('quantumchess', 'Standard') },
	{ value: 'off', label: t('quantumchess', 'Off') },
]

/**
 * Change a preference.
 *
 * @param {string} key key
 * @param {any} value value
 */
function set(key, value) {
	setPreference(key, value)
}

/**
 * The volume slider was released: store and play a tick.
 *
 * @param {string} value 0–100
 */
function onVolume(value) {
	set('volume', Number(value))
	playSound('select')
}
</script>

<style lang="scss" scoped>
.qc-settings__group {
	margin: 0 0 12px;
	padding: 0;
	border: none;

	legend {
		margin-bottom: 6px;
		font-weight: bold;
	}
}

.qc-settings__themes {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}

.qc-settings__theme {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 6px;
	border: 2px solid transparent;
	border-radius: var(--border-radius-large);
	cursor: pointer;

	&:focus-within {
		outline: 2px solid var(--color-primary-element);
		outline-offset: 2px;
	}
}

.qc-settings__theme--active {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
}

.qc-settings__note {
	color: var(--color-text-maxcontrast);
}

.qc-settings__volume {
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 44px;

	input {
		flex: 1 1 auto;
		max-width: 260px;
	}
}

.qc-settings__value {
	min-width: 3ch;
	font-variant-numeric: tabular-nums;
}
</style>
