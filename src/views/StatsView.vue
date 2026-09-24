<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Statistics (route /stats): the online record and rating graph, the one-time leaderboard question, the leaderboard with
  its group filter, and the results against the computer, AI opponents and pass & play games.
-->
<template>
	<div class="qc-stats">
		<h2 class="qc-stats__title">
			{{ t('quantumchess', 'Statistics') }}
		</h2>

		<div v-if="loading && !stats" class="qc-stats__loading">
			<NcLoadingIcon :size="44" />
		</div>
		<NcEmptyContent
			v-else-if="error && !stats"
			:name="t('quantumchess', 'The statistics could not be loaded')"
			:description="error.message">
			<template #action>
				<NcButton @click="load">
					{{ t('quantumchess', 'Try again') }}
				</NcButton>
			</template>
		</NcEmptyContent>

		<template v-else-if="stats">
			<NcNoteCard v-if="stats.online?.askListing" type="info" data-test="ask-listing">
				<p class="qc-stats__ask">
					{{ t(
						'quantumchess',
						'Show yourself on the leaderboard? Others will see your name, avatar, rating and record.',
					) }}
				</p>
				<div class="qc-stats__ask-actions">
					<NcButton :disabled="saving" @click="setListed(false)">
						{{ t('quantumchess', 'No, thanks') }}
					</NcButton>
					<NcButton variant="primary" :disabled="saving" @click="setListed(true)">
						{{ t('quantumchess', 'Show me') }}
					</NcButton>
				</div>
			</NcNoteCard>

			<section v-if="multiplayer" class="qc-stats__section" data-test="stats-online">
				<h3 class="qc-stats__heading">
					{{ t('quantumchess', 'Online') }}
				</h3>
				<dl class="qc-stats__tiles">
					<div class="qc-stats__tile">
						<dt>{{ t('quantumchess', 'Rating') }}</dt>
						<dd
							:title="online.provisional
								? t('quantumchess', 'Provisional rating: fewer than 10 rated games')
								: ''">
							{{ formatRating(online.rating, online.provisional) }}
						</dd>
					</div>
					<div class="qc-stats__tile">
						<dt>{{ t('quantumchess', 'Peak') }}</dt>
						<dd>{{ online.peak ?? online.rating }}</dd>
					</div>
					<div class="qc-stats__tile">
						<dt>{{ t('quantumchess', 'Games') }}</dt>
						<dd>{{ online.games }}</dd>
					</div>
					<div class="qc-stats__tile">
						<dt>{{ t('quantumchess', 'Won / lost / drawn') }}</dt>
						<dd>{{ online.wins }} / {{ online.losses }} / {{ online.draws }}</dd>
					</div>
					<div v-if="online.rank" class="qc-stats__tile">
						<dt>{{ t('quantumchess', 'Rank') }}</dt>
						<dd>#{{ online.rank }}</dd>
					</div>
				</dl>
				<RatingGraph :history="stats.ratingHistory ?? []" />
			</section>

			<section v-if="board && board.mode !== 'off'" class="qc-stats__section">
				<h3 class="qc-stats__heading">
					{{ t('quantumchess', 'Leaderboard') }}
				</h3>
				<LeaderboardTable :board="board" :group="group" @group="setGroup" />
			</section>

			<section class="qc-stats__section" data-test="stats-local">
				<h3 class="qc-stats__heading">
					{{ t('quantumchess', 'Against the computer and AI opponents') }}
				</h3>
				<table class="qc-stats__table">
					<thead>
						<tr>
							<th scope="col">
								{{ t('quantumchess', 'Opponent') }}
							</th>
							<th scope="col" class="qc-stats__num">
								{{ t('quantumchess', 'Won') }}
							</th>
							<th scope="col" class="qc-stats__num">
								{{ t('quantumchess', 'Lost') }}
							</th>
							<th scope="col" class="qc-stats__num">
								{{ t('quantumchess', 'Drawn') }}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="row in localRows" :key="row.key">
							<td>{{ row.name }}</td>
							<td class="qc-stats__num">
								{{ row.w }}
							</td>
							<td class="qc-stats__num">
								{{ row.l }}
							</td>
							<td class="qc-stats__num">
								{{ row.d }}
							</td>
						</tr>
					</tbody>
				</table>
				<p class="qc-stats__note">
					{{ n(
						'quantumchess',
						'Pass & play: %n game',
						'Pass & play: %n games',
						stats.local?.hotseat?.games ?? 0,
					) }}
				</p>
			</section>
		</template>
	</div>
</template>

<script setup>
import { n, t } from '@nextcloud/l10n'
import { computed, onMounted, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import LeaderboardTable from '../stats/components/LeaderboardTable.vue'
import RatingGraph from '../stats/components/RatingGraph.vue'
import { LEVELS } from '../ai/levels.js'
import { personaById } from '../llm/personas.js'
import { getLeaderboard, getStats, saveMultiplayerSettings } from '../services/api.js'
import { formatRating } from '../services/format.js'
import { features } from '../services/initialState.js'

const multiplayer = features.multiplayer
const stats = ref(null)
const board = ref(null)
const group = ref(null)
const loading = ref(false)
const saving = ref(false)
const error = ref(null)

const online = computed(() => stats.value?.online ?? { rating: 1200, games: 0, wins: 0, losses: 0, draws: 0 })
const localRows = computed(() => {
	const local = stats.value?.local ?? {}
	const rows = LEVELS.map((level, i) => {
		const r = local.engine?.[String(i + 1)] ?? { w: 0, l: 0, d: 0 }
		return {
			key: 'e' + (i + 1),
			name: t('quantumchess', 'Level {n}: {name}', { n: i + 1, name: level.name }),
			...r,
		}
	})
	for (const [id, r] of Object.entries(local.llm ?? {})) {
		rows.push({ key: 'p' + id, name: personaById(id)?.name ?? id, ...r })
	}
	return rows
})

/** Load the statistics and the leaderboard. */
async function load() {
	loading.value = true
	try {
		const [s, b] = await Promise.all([
			getStats(),
			multiplayer ? getLeaderboard({ group: group.value }).catch(() => null) : null,
		])
		stats.value = s
		board.value = b
		error.value = null
	} catch (e) {
		error.value = e
	} finally {
		loading.value = false
	}
}

/**
 * Filter the leaderboard by a group.
 *
 * @param {string|null} id group id
 */
async function setGroup(id) {
	group.value = id
	try {
		board.value = await getLeaderboard({ group: id })
	} catch (e) {
		error.value = e
	}
}

/**
 * Answer the one-time leaderboard question.
 *
 * @param {boolean} listed show me
 */
async function setListed(listed) {
	saving.value = true
	try {
		await saveMultiplayerSettings({ listed })
		await load()
	} finally {
		saving.value = false
	}
}

onMounted(load)
</script>

<style lang="scss" scoped>
.qc-stats {
	display: flex;
	flex-direction: column;
	gap: 24px;
	box-sizing: border-box;
	max-width: 900px;
	margin: 0 auto;
	padding: 8px 16px 32px;
}

.qc-stats__title {
	margin: 0;
	font-size: 20px;
	font-weight: bold;
	line-height: 34px;
}

// keep clear of the navigation toggle in the top-left corner when the column starts at the left edge
@media (max-width: 1100px) {
	.qc-stats__title {
		padding-inline-start: 40px;
	}
}

.qc-stats__loading {
	display: flex;
	justify-content: center;
	padding: 48px 0;
}

.qc-stats__section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.qc-stats__heading {
	margin: 0;
	font-size: 16px;
	font-weight: bold;
}

.qc-stats__tiles {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 8px;
	margin: 0;
}

.qc-stats__tile {
	padding: 8px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);

	dt,
	dd {
		display: block;
		margin: 0;
		padding: 0;
		text-align: start;
	}

	dt {
		color: var(--color-text-maxcontrast);
		font-size: 13px;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	dd {
		font-size: 22px;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
	}
}

.qc-stats__ask {
	margin: 0 0 8px;
}

.qc-stats__ask-actions {
	display: flex;
	gap: 8px;
}

.qc-stats__table {
	width: 100%;
	max-width: 560px;
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

.qc-stats__num {
	text-align: end !important;
	font-variant-numeric: tabular-nums;
}

.qc-stats__note {
	margin: 0;
	color: var(--color-text-maxcontrast);
}
</style>
