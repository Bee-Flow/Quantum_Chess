<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The online options of the New game dialog: an open challenge or an invited opponent (recent opponents first, then a
  user search), the time per move and whether the game is rated (not for a game that is never rated, `unrated`: a
  chess variant with more than two seats). With `timeOnly`, the time per move alone: a game with more than two seats
  chooses its players in SeatPicker.
-->
<template>
	<NcCheckboxRadioSwitch v-if="features.openChallenges && !timeOnly" v-model="open" type="switch">
		{{ t('quantumchess', 'Open challenge: anyone who can find me may join') }}
	</NcCheckboxRadioSwitch>
	<NcSelectUsers
		v-if="!open && !timeOnly"
		v-model="opponent"
		:inputLabel="t('quantumchess', 'Opponent')"
		:placeholder="t('quantumchess', 'Search for a colleague')"
		:options="userOptions"
		:loading="searching"
		@search="onSearch" />
	<fieldset class="qc-opponent-picker__group">
		<legend>{{ t('quantumchess', 'Time per move') }}</legend>
		<div class="qc-opponent-picker__row">
			<NcCheckboxRadioSwitch
				v-for="tc in timeControls"
				:key="tc.id"
				v-model="timeControl"
				type="radio"
				name="qc-time"
				:value="tc.id"
				:disabled="tc.id === 'corr:none' && rated">
				{{ tc.label }}
			</NcCheckboxRadioSwitch>
		</div>
	</fieldset>
	<NcCheckboxRadioSwitch
		v-if="features.rated && !unrated"
		v-model="rated"
		type="switch"
		:disabled="ratedBlocked !== null"
		:description="ratedBlocked ?? undefined">
		{{ t('quantumchess', 'Rated') }}
	</NcCheckboxRadioSwitch>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcSelectUsers from '@nextcloud/vue/components/NcSelectUsers'
import { features } from '../../services/initialState.js'
import { useUserSearch } from '../composables/useUserSearch.js'

/** An open challenge instead of an invitation */
const open = defineModel('open', { type: Boolean, default: false })

/** The invited opponent as an NcSelectUsers option, or null */
const opponent = defineModel('opponent', { type: Object, default: null })

/** corr:1d | corr:3d | corr:7d | corr:none */
const timeControl = defineModel('timeControl', { type: String, default: 'corr:3d' })

/** The player asks for a rated game */
const rated = defineModel('rated', { type: Boolean, default: false })

defineProps({
	/** Why the game cannot be rated with this opponent, in words, or null */
	ratedBlocked: { type: String, default: null },
	/** Whether the game is never rated (a variant with more than two seats), so that there is nothing to choose */
	unrated: { type: Boolean, default: false },
	/** Only the time per move: the players are chosen elsewhere (SeatPicker) */
	timeOnly: { type: Boolean, default: false },
})

const timeControls = [
	{ id: 'corr:1d', label: t('quantumchess', '1 day') },
	{ id: 'corr:3d', label: t('quantumchess', '3 days') },
	{ id: 'corr:7d', label: t('quantumchess', '7 days') },
	{ id: 'corr:none', label: t('quantumchess', 'No deadline') },
]

const { userOptions, searching, onSearch } = useUserSearch()
</script>

<style lang="scss" scoped>
.qc-opponent-picker__group {
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

.qc-opponent-picker__row {
	display: flex;
	flex-wrap: wrap;
	gap: 0 16px;
}
</style>
