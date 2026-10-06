<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The players of an online game with more than two seats (Four-player chess, Bughouse): per seat, the viewer, an
  invited user (recent opponents first, then a search) or an open seat that anyone who may see open challenges can
  join. The viewer sits in exactly one seat: choosing "You" for another seat opens the one the viewer left. The model is
  a list with one entry per seat: `'me'`, `null` (open) or the NcSelectUsers option of the invited user.
-->
<template>
	<fieldset class="qc-seat-picker">
		<legend>{{ t('quantumchess', 'Players') }}</legend>
		<div
			v-for="(side, i) in sides"
			:key="i"
			class="qc-seat-picker__row"
			:data-test="'seat-' + i">
			<span class="qc-seat-picker__side">{{ side }}</span>
			<NcSelect
				:modelValue="kindOf(i)"
				:options="kinds"
				:clearable="false"
				:inputLabel="t('quantumchess', 'Player of {side}', { side })"
				labelOutside
				@update:modelValue="(k) => setKind(i, k)" />
			<NcSelectUsers
				v-if="kindOf(i).id === 'user'"
				:modelValue="players[i] && players[i] !== 'me' ? players[i] : null"
				:inputLabel="t('quantumchess', 'Invite')"
				:placeholder="t('quantumchess', 'Search for a colleague')"
				:options="userOptions"
				:loading="searching"
				@search="onSearch"
				@update:modelValue="(u) => setUser(i, u)" />
		</div>
	</fieldset>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import NcSelectUsers from '@nextcloud/vue/components/NcSelectUsers'
import { features } from '../../services/initialState.js'
import { useUserSearch } from '../composables/useUserSearch.js'

/** One entry per seat: 'me', null (an open seat), or the NcSelectUsers option of an invited user */
const players = defineModel({ type: Array, required: true })

defineProps({
	/** The names of the sides, one per seat (Red, Blue, Yellow, Green; White A, Black A, …) */
	sides: { type: Array, required: true },
})

const { userOptions, searching, onSearch } = useUserSearch()

const kinds = computed(() => [
	{ id: 'me', label: t('quantumchess', 'You') },
	{ id: 'user', label: t('quantumchess', 'Invite a player') },
	...(features.openChallenges ? [{ id: 'open', label: t('quantumchess', 'Open seat') }] : []),
])

/** Seats whose invited player is still to be chosen. */
const choosing = new Set()

/**
 * The kind of a seat's entry.
 *
 * @param {number} i seat
 * @return {{id: string, label: string}}
 */
function kindOf(i) {
	const p = players.value[i]
	const id = p === 'me' ? 'me' : p || choosing.has(i) ? 'user' : features.openChallenges ? 'open' : 'user'
	return kinds.value.find((k) => k.id === id) ?? kinds.value[1]
}

/**
 * Change the kind of a seat; "You" moves the viewer, and the seat the viewer left becomes open (or to be invited).
 *
 * @param {number} i seat
 * @param {{id: string}} kind the chosen kind
 */
function setKind(i, kind) {
	const next = players.value.slice()
	if (kind.id === 'me') {
		const was = next.indexOf('me')
		if (was >= 0) {
			next[was] = null
		}
		next[i] = 'me'
		choosing.delete(i)
	} else if (next[i] === 'me') {
		return
	} else {
		next[i] = null
		if (kind.id === 'user') {
			choosing.add(i)
		} else {
			choosing.delete(i)
		}
	}
	players.value = next
}

/**
 * Choose the invited user of a seat.
 *
 * @param {number} i seat
 * @param {object|null} user NcSelectUsers option
 */
function setUser(i, user) {
	const next = players.value.slice()
	next[i] = user ?? null
	if (!user) {
		choosing.add(i)
	}
	players.value = next
}
</script>

<style lang="scss" scoped>
.qc-seat-picker {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	border: none;

	legend {
		margin-bottom: 4px;
		font-weight: bold;
	}
}

.qc-seat-picker__row {
	display: grid;
	grid-template-columns: minmax(80px, auto) 1fr;
	gap: 4px 8px;
	align-items: center;

	> :nth-child(3) {
		grid-column: 2;
	}
}

.qc-seat-picker__side {
	font-weight: bold;
}
</style>
