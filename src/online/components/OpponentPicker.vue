<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The online options of the New game dialog: an open challenge or an invited opponent (recent opponents first, then a
  user search), the time per move and whether the game is rated.
-->
<template>
	<NcCheckboxRadioSwitch v-if="features.openChallenges" v-model="open" type="switch">
		{{ t('quantumchess', 'Open challenge: anyone who can find me may join') }}
	</NcCheckboxRadioSwitch>
	<NcSelectUsers
		v-if="!open"
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
		v-if="features.rated"
		v-model="rated"
		type="switch"
		:disabled="ratedBlocked !== null"
		:description="ratedBlocked ?? undefined">
		{{ t('quantumchess', 'Rated') }}
	</NcCheckboxRadioSwitch>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { ref } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcSelectUsers from '@nextcloud/vue/components/NcSelectUsers'
import { getRecentOpponents, searchUsers } from '../../services/api.js'
import { features } from '../../services/initialState.js'

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
})

const timeControls = [
	{ id: 'corr:1d', label: t('quantumchess', '1 day') },
	{ id: 'corr:3d', label: t('quantumchess', '3 days') },
	{ id: 'corr:7d', label: t('quantumchess', '7 days') },
	{ id: 'corr:none', label: t('quantumchess', 'No deadline') },
]

const userOptions = ref([])
const searching = ref(false)
let searchSeq = 0

/**
 * An NcSelectUsers option for a user.
 *
 * @param {{userId: string, displayName: string, subline?: string}} u the user
 * @return {{id: string, user: string, displayName: string, subname: string}}
 */
const toOption = (u) => ({ id: u.userId, user: u.userId, displayName: u.displayName, subname: u.subline ?? '' })

getRecentOpponents().then((users) => {
	if (userOptions.value.length === 0) {
		userOptions.value = users.map(toOption)
	}
}).catch(() => {})

/**
 * Search users; only the answer to the latest search is shown.
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
