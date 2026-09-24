<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The leaderboard: rank, player, rating (provisional as "1340?"), rated games and record; the viewer's row is
  highlighted and pinned below the list when it is not in it. An optional group filter lists the viewer's own groups.
-->
<template>
	<div class="qc-board-table" data-test="leaderboard">
		<div v-if="groups.length" class="qc-board-table__filter">
			<NcSelect
				:modelValue="selectedGroup"
				:options="groupOptions"
				label="displayName"
				:inputLabel="t('quantumchess', 'Group')"
				:clearable="false"
				@update:modelValue="(o) => emit('group', o?.id ?? null)" />
		</div>
		<p v-if="!entries.length && !pinned" class="qc-board-table__empty">
			{{ n(
				'quantumchess',
				'Nobody is listed yet. Players appear after %n rated game.',
				'Nobody is listed yet. Players appear after %n rated games.',
				minGames,
			) }}
		</p>
		<table v-else class="qc-board-table__table">
			<thead>
				<tr>
					<th scope="col" class="qc-board-table__num">
						#
					</th>
					<th scope="col">
						{{ t('quantumchess', 'Player') }}
					</th>
					<th scope="col" class="qc-board-table__num">
						{{ t('quantumchess', 'Rating') }}
					</th>
					<!-- all online games, like the W / L / D record next to it and the Games card
						(ratedGames only ranks) -->
					<th scope="col" class="qc-board-table__num qc-board-table__wide">
						{{ t('quantumchess', 'Games') }}
					</th>
					<th scope="col" class="qc-board-table__num">
						{{ t('quantumchess', 'W / L / D') }}
					</th>
				</tr>
			</thead>
			<tbody>
				<tr
					v-for="e in rows"
					:key="e.userId + (e.pinned ? '-me' : '')"
					:class="{ 'qc-board-table__me': e.userId === me, 'qc-board-table__pinned': e.pinned }">
					<td class="qc-board-table__num">
						{{ e.rank ?? '–' }}
					</td>
					<td>
						<span class="qc-board-table__player">
							<NcAvatar
								:user="e.userId"
								:displayName="e.displayName"
								:size="24"
								disableMenu />
							<span class="qc-board-table__name">{{ e.displayName }}</span>
							<span
								v-if="e.pinned && !e.listed"
								class="qc-board-table__note">{{ t('quantumchess', '(only you see this row)') }}</span>
						</span>
					</td>
					<td
						class="qc-board-table__num"
						:title="e.provisional
							? t('quantumchess', 'Provisional rating: fewer than 10 rated games')
							: ''">
						{{ formatRating(e.rating, e.provisional) }}
					</td>
					<td class="qc-board-table__num qc-board-table__wide">
						{{ e.wins + e.losses + e.draws }}
					</td>
					<td class="qc-board-table__num">
						{{ e.wins }} / {{ e.losses }} / {{ e.draws }}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import { formatRating } from '../../services/format.js'
import { currentUser } from '../../services/initialState.js'

const props = defineProps({
	/** GET /api/leaderboard answer */
	board: { type: Object, required: true },
	/** Selected group id, null = everyone */
	group: { type: String, default: null },
})
const emit = defineEmits(['group'])

const me = currentUser.uid
const entries = computed(() => props.board.entries ?? [])
const minGames = computed(() => props.board.minGames ?? 5)
const groups = computed(() => props.board.groups ?? [])
const groupOptions = computed(() => [{ id: null, displayName: t('quantumchess', 'Everyone') }, ...groups.value])
const selectedGroup = computed(() => groupOptions.value.find((o) => o.id === props.group) ?? groupOptions.value[0])
const pinned = computed(() => {
	const mine = props.board.me
	if (!mine || entries.value.some((e) => e.userId === mine.userId)) {
		return null
	}
	return { ...mine, pinned: true }
})
const rows = computed(() => (pinned.value ? [...entries.value, pinned.value] : entries.value))
</script>

<style lang="scss" scoped>
.qc-board-table__filter {
	max-width: 280px;
	margin-bottom: 8px;
}

.qc-board-table__empty {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-board-table__table {
	width: 100%;
	border-collapse: collapse;

	th,
	td {
		padding: 6px 8px;
		border-block-end: 1px solid var(--color-border);
		text-align: start;
	}

	th {
		color: var(--color-text-maxcontrast);
		font-weight: normal;
	}
}

.qc-board-table__num {
	text-align: end !important;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.qc-board-table__player {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.qc-board-table__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-board-table__note {
	color: var(--color-text-maxcontrast);
	font-size: 12px;
}

.qc-board-table__me td {
	background: var(--color-primary-element-light);
	font-weight: bold;
}

.qc-board-table__pinned td {
	border-block-start: 2px dashed var(--color-border-dark);
}

@media (max-width: 480px) {
	.qc-board-table__wide {
		display: none;
	}
}
</style>
