<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Home, the lobby: play tiles, the online sections, games to continue on this device, the trainer card and recent games;
  an empty state for new players. The first paint comes from the initial state, without an API request.
-->
<template>
	<div class="qc-home">
		<div class="qc-home__main">
			<section class="qc-home__section" :aria-label="t('quantumchess', 'Play')">
				<h2 class="qc-home__heading">
					{{ t('quantumchess', 'Play') }}
				</h2>
				<PlayTiles />
			</section>

			<LobbyOnlineSections />

			<section v-if="continueGames.length" class="qc-home__section">
				<h2 class="qc-home__heading">
					{{ t('quantumchess', 'Continue on this device') }}
				</h2>
				<ul class="qc-home__cards">
					<li v-for="g in continueGames" :key="g.id">
						<router-link class="qc-home__card" :to="`/play/${g.mode}/${g.id}`" :data-test="'continue-' + g.mode">
							<MiniBoard
								:state="g.state"
								:size="120"
								:orientation="g.orientation"
								:label="t('quantumchess', 'Position of the game {name}', { name: g.name })" />
							<span class="qc-home__card-text">
								<strong>{{ g.name }}</strong>
								<span>{{ g.status }}</span>
							</span>
						</router-link>
					</li>
				</ul>
			</section>

			<NcEmptyContent
				v-if="isEmpty"
				class="qc-home__empty"
				:name="t('quantumchess', 'No games yet')"
				:description="t('quantumchess', 'Challenge a colleague, or learn the basics in 10 minutes.')">
				<template #icon>
					<QuantumKnightIllustration />
				</template>
				<template #action>
					<div class="qc-home__empty-actions">
						<NcButton to="/trainer">
							{{ t('quantumchess', 'Start the trainer') }}
						</NcButton>
						<NcButton variant="primary" :to="{ name: 'new-game' }">
							{{ t('quantumchess', 'New game') }}
						</NcButton>
					</div>
				</template>
			</NcEmptyContent>
		</div>

		<aside class="qc-home__side">
			<TrainerCard />
			<RecentGames />
			<section class="qc-home__section qc-home__rules">
				<h2 class="qc-home__heading">
					{{ t('quantumchess', 'New to Quantum Chess?') }}
				</h2>
				<div class="qc-home__rules-body">
					<MiniBoard :state="splitDemo" :size="120" :label="t('quantumchess', 'A knight split between f3 and h3')" />
					<p>
						{{ t('quantumchess', 'It is chess, but a piece can be in two places at once until something finds out where it really is.') }}
						<router-link :to="{ name: 'rules' }">
							{{ t('quantumchess', 'Read the rules') }}
						</router-link>
					</p>
				</div>
			</section>
		</aside>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, defineAsyncComponent } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import MiniBoard from '../board/components/MiniBoard.vue'
import PlayTiles from '../home/components/PlayTiles.vue'
import QuantumKnightIllustration from '../home/components/QuantumKnightIllustration.vue'
import { applyMove, initialState } from '../engine/index.js'
import { listLocalGames, loadLocalGame } from '../game/localGames.js'
import { localGameTitle } from '../game/localPlayers.js'
import { useLobby } from '../online/composables/useLobby.js'

const LobbyOnlineSections = defineAsyncComponent(() => import('../online/components/lobby/LobbyOnlineSections.vue'))
const RecentGames = defineAsyncComponent(() => import('../online/components/lobby/RecentGames.vue'))
const TrainerCard = defineAsyncComponent(() => import('../trainer/components/TrainerCard.vue'))
const lobbyState = useLobby()

const splitDemo = applyMove(initialState(), 'g1-f3|h3').state

const localIndex = listLocalGames()

const continueGames = computed(() => localIndex
	.filter((e) => !e.result)
	.slice(0, 4)
	.map((e) => {
		const rec = loadLocalGame(e.id)
		if (!rec?.state) {
			return null
		}
		const name = localGameTitle(rec)
		const moveNo = rec.state.fullmove
		const yourMove = rec.humanColor === null || rec.state.turn === rec.humanColor
		return {
			id: rec.id,
			mode: rec.mode,
			state: rec.state,
			orientation: rec.humanColor ?? 'w',
			name,
			status: yourMove
				? t('quantumchess', 'Move {n} · Your move', { n: moveNo })
				: t('quantumchess', 'Move {n}', { n: moveNo }),
		}
	})
	.filter(Boolean))

const isEmpty = computed(() => {
	const l = lobbyState.lobby.value
	const online = l ? ['yourTurn', 'waiting', 'invitations', 'outgoing', 'recent'].some((k) => (l[k] ?? []).length > 0) : false
	return localIndex.length === 0 && !online
})
</script>

<style lang="scss" scoped>
.qc-home {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 24px;
	box-sizing: border-box;
	max-width: 1200px;
	margin: 0 auto;
	padding: 8px 16px 32px;
	container-type: inline-size;
}

@media (min-width: 1024px) {
	.qc-home {
		grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
		padding: 8px 24px 24px;
	}
}

.qc-home__main,
.qc-home__side {
	display: flex;
	flex-direction: column;
	gap: 24px;
	min-width: 0;
}

.qc-home__heading {
	margin: 0 0 12px;
	font-size: 20px;
	font-weight: bold;
	line-height: 34px;
}

// keep clear of the navigation toggle in the top-left corner
.qc-home__main > .qc-home__section:first-child .qc-home__heading {
	padding-inline-start: 40px;
}

.qc-home__cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-home__card {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
	color: var(--color-main-text);

	&:hover,
	&:focus-visible {
		border-color: var(--color-primary-element);
		background: var(--color-background-hover);
	}
}

.qc-home__card-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;

	span {
		color: var(--color-text-maxcontrast);
	}
}

.qc-home__empty-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}

.qc-home__rules-body {
	display: flex;
	align-items: flex-start;
	gap: 12px;

	p {
		margin: 0;
		line-height: 1.5;
	}

	a {
		display: inline-block;
		margin-top: 6px;
		color: var(--color-primary-element);
		font-weight: bold;
	}
}
</style>
