<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Home, the lobby (GAME-DESIGN §2.3): play tiles, the online sections (frontend-online), games to continue on this
  device, the trainer card and recent games; an empty state for new players. First paint comes from initial state.
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

			<component :is="lobbySections" v-if="lobbySections" />

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
						<NcButton v-if="hasTrainer" to="/trainer">
							{{ t('quantumchess', 'Start the trainer') }}
						</NcButton>
						<NcButton v-else :to="{ name: 'rules' }">
							{{ t('quantumchess', 'Read the rules') }}
						</NcButton>
						<NcButton variant="primary" :to="{ name: 'new-game' }">
							{{ t('quantumchess', 'New game') }}
						</NcButton>
					</div>
				</template>
			</NcEmptyContent>
		</div>

		<aside class="qc-home__side">
			<component :is="trainerCard" v-if="trainerCard" />
			<component :is="recentGames" v-if="recentGames" />
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
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import QuantumKnightIllustration from '../components/app/QuantumKnightIllustration.vue'
import MiniBoard from '../components/board/MiniBoard.vue'
import PlayTiles from '../components/home/PlayTiles.vue'
import { LEVELS } from '../ai/levels.js'
import { hasView, optionalComponent } from '../composables/modules.js'
import { useLobbyState } from '../composables/useLobbyState.js'
import { applyMove, initialState } from '../engine/index.js'
import { personaById } from '../personas/index.js'
import { listLocalGames, loadLocalGame } from '../services/localGames.js'

const hasTrainer = hasView('TrainerHomeView')
const lobbySections = optionalComponent('lobby', 'LobbyOnlineSections')
const recentGames = optionalComponent('lobby', 'RecentGames')
const trainerCard = optionalComponent('trainer', 'TrainerCard')
const lobbyState = useLobbyState()

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
		const p = rec.players ?? {}
		const other = rec.humanColor ? p[rec.humanColor === 'w' ? 'b' : 'w'] : null
		let name
		if (rec.mode === 'computer') {
			name = t('quantumchess', 'vs {name}', { name: LEVELS[(other?.level ?? 1) - 1]?.name ?? '' })
		} else if (rec.mode === 'ai') {
			name = t('quantumchess', 'vs {name}', { name: personaById(other?.persona)?.name ?? '' })
		} else {
			name = t('quantumchess', '{white} vs {black}', { white: p.w?.name || t('quantumchess', 'White'), black: p.b?.name || t('quantumchess', 'Black') })
		}
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
	const l = lobbyState.lobby?.value
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
