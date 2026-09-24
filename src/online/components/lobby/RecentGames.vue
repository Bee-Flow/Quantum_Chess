<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Recent online games on Home: the last five finished or aborted games with the result, the reason, the rating change,
  Review and Rematch.
-->
<template>
	<section v-if="enabled && recent.length" class="qc-recent" data-test="recent-games">
		<h2 class="qc-recent__heading">
			{{ t('quantumchess', 'Recent games') }}
		</h2>
		<ul class="qc-recent__list">
			<li v-for="r in rows" :key="r.game.id" class="qc-recent__row">
				<NcAvatar
					:user="r.other?.userId ?? undefined"
					:displayName="r.other?.displayName ?? '?'"
					:size="32"
					disableMenu />
				<router-link class="qc-recent__main" :to="`/game/${r.game.id}`">
					<span class="qc-recent__name">{{
						t('quantumchess', 'vs {name}', { name: r.other?.displayName ?? '' })
					}}</span>
					<span class="qc-recent__result">
						<strong :class="'qc-recent__outcome--' + r.outcome.outcome">{{ r.outcome.text }}</strong>
						<span v-if="r.outcome.delta" class="qc-recent__delta">{{ r.outcome.delta }}</span>
					</span>
					<span v-if="r.reason" class="qc-recent__reason">{{ r.reason }}</span>
				</router-link>
				<span class="qc-recent__actions">
					<NcButton
						v-if="r.game.status === 'finished'"
						variant="tertiary"
						:aria-label="t('quantumchess', 'Review')"
						:title="t('quantumchess', 'Review')"
						:to="`/review/online/${r.game.id}`">
						<template #icon>
							<NcIconSvgWrapper :path="mdiChartBellCurveCumulative" />
						</template>
					</NcButton>
					<NcButton
						v-if="r.other?.userId"
						variant="tertiary"
						:aria-label="t('quantumchess', 'Rematch')"
						:title="t('quantumchess', 'Rematch')"
						:disabled="busy === r.game.id"
						:data-test="'recent-rematch-' + r.game.id"
						@click="rematch(r.game.id)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiRestart" />
						</template>
					</NcButton>
				</span>
			</li>
		</ul>
	</section>
</template>

<script setup>
import { mdiChartBellCurveCumulative, mdiRestart } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { reasonCopy } from '../../../game/resultText.js'
import { currentUser, features } from '../../../services/initialState.js'
import { useLobby } from '../../composables/useLobby.js'
import { otherPlayer, outcomeText } from '../../summaryText.js'

const router = useRouter()
const lobby = useLobby()
const enabled = features.multiplayer
const busy = ref(null)
const me = currentUser.uid

const recent = computed(() => lobby.lobby.value?.recent ?? [])
const rows = computed(() => recent.value.slice(0, 5).map((game) => {
	const names = { w: game.white?.displayName ?? '', b: game.black?.displayName ?? '' }
	return {
		game,
		other: otherPlayer(game, me),
		outcome: outcomeText(game),
		reason: game.status === 'aborted' ? '' : reasonCopy(game.resultReason, { winner: game.winner, names }),
	}
}))

/**
 * Offer (or accept) a rematch and open it.
 *
 * @param {number} id finished game id
 */
async function rematch(id) {
	busy.value = id
	try {
		const next = await lobby.rematch(id)
		if (next?.id) {
			router.push(`/game/${next.id}`)
		}
	} finally {
		busy.value = null
	}
}
</script>

<style lang="scss" scoped>
.qc-recent__heading {
	margin: 0 0 12px;
	font-size: 20px;
	font-weight: bold;
	line-height: 34px;
}

.qc-recent__list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-recent__row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 4px;
	border-radius: var(--border-radius-large);

	&:hover {
		background: var(--color-background-hover);
	}
}

.qc-recent__main {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-width: 0;
	color: var(--color-main-text);
}

.qc-recent__name {
	overflow: hidden;
	font-weight: bold;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-recent__result {
	overflow: hidden;
	color: var(--color-text-maxcontrast);
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-recent__outcome--win {
	color: var(--color-success-text, var(--color-success));
}

.qc-recent__outcome--loss {
	color: var(--color-error-text, var(--color-error));
}

.qc-recent__reason {
	overflow: hidden;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qc-recent__delta {
	margin-inline-start: 4px;
	font-variant-numeric: tabular-nums;
}

.qc-recent__actions {
	display: flex;
	flex: 0 0 auto;
	gap: 2px;
}
</style>
