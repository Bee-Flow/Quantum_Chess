<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The play tiles of Home, in a grid that fills the width; the last one opens the chess variants. Online is hidden
  when online games are disabled; AI opponent is greyed out, with the reason, when no LLM source is available.
-->
<template>
	<ul class="qc-tiles">
		<li v-for="tile in tiles" :key="tile.mode">
			<button
				type="button"
				class="qc-tiles__tile"
				:class="{ 'qc-tiles__tile--disabled': tile.disabled }"
				:aria-disabled="tile.disabled ? 'true' : undefined"
				:title="tile.disabled ? tile.reason : undefined"
				:data-test="'tile-' + tile.mode"
				@click="choose(tile)">
				<NcIconSvgWrapper class="qc-tiles__icon" :path="tile.icon" :size="40" />
				<span class="qc-tiles__title">{{ tile.title }}</span>
				<span class="qc-tiles__subtitle">{{ tile.disabled ? tile.reason : tile.subtitle }}</span>
			</button>
		</li>
	</ul>
</template>

<script setup>
import { mdiAccountMultipleOutline, mdiCreationOutline, mdiCubeOutline, mdiEarth, mdiRobotOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { unavailableText, useAiSources } from '../../llm/composables/useAiSources.js'
import { features } from '../../services/initialState.js'

const router = useRouter()
const ai = useAiSources()
ai.refresh()

const tiles = computed(() => {
	const out = []
	if (features.multiplayer) {
		out.push({
			mode: 'online',
			icon: mdiEarth,
			title: t('quantumchess', 'Online'),
			subtitle: t('quantumchess', 'Play someone on this Nextcloud'),
		})
	}
	out.push({
		mode: 'computer',
		icon: mdiRobotOutline,
		title: t('quantumchess', 'Computer'),
		subtitle: t('quantumchess', 'Five levels, from Wobbles to The Observer'),
	})
	// "Add your own API key" is the one reason the user can act on: show it first
	const reasons = ai.sources.value.filter((s) => !s.available).map((s) => s.reason)
	const firstReason = reasons.includes('no_key') ? 'no_key' : (reasons[0] ?? null)
	out.push({
		mode: 'ai',
		icon: mdiCreationOutline,
		title: t('quantumchess', 'AI opponent'),
		subtitle: t('quantumchess', 'A chess personality powered by AI'),
		disabled: !ai.anyAvailable.value,
		reason: unavailableText(firstReason === 'not_configured' ? null : firstReason),
	})
	out.push({
		mode: 'local',
		icon: mdiAccountMultipleOutline,
		title: t('quantumchess', 'Pass & play'),
		subtitle: t('quantumchess', 'Two players, one device'),
	})
	out.push({
		mode: 'variants',
		icon: mdiCubeOutline,
		title: t('quantumchess', 'Chess variants'),
		subtitle: t('quantumchess', '3D, 4D, shogi, xiangqi and more, all quantum'),
	})
	return out
})

/**
 * Open the New game dialog for a mode.
 *
 * @param {object} tile tile
 */
function choose(tile) {
	if (tile.mode === 'variants') {
		router.push({ name: 'variants' })
	} else if (!tile.disabled) {
		router.push({ name: 'new-game', query: { mode: tile.mode } })
	}
}
</script>

<style lang="scss" scoped>
.qc-tiles {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-tiles__tile {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	width: 100%;
	min-height: 140px;
	margin: 0;
	padding: 16px;
	border: 2px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	transition: border-color 150ms ease, background-color 150ms ease;

	&:hover,
	&:focus-visible {
		border-color: var(--color-primary-element);
		background: var(--color-primary-element-light);
	}
}

.qc-tiles__tile--disabled {
	cursor: not-allowed;
	opacity: 0.6;

	&:hover,
	&:focus-visible {
		border-color: var(--color-border);
		background: var(--color-main-background);
	}
}

.qc-tiles__icon {
	color: var(--color-primary-element);
}

.qc-tiles__title {
	font-size: 17px;
	font-weight: bold;
}

.qc-tiles__subtitle {
	color: var(--color-text-maxcontrast);
	font-size: 14px;
	font-weight: normal;
	text-align: start;
	line-height: 1.3;
}
</style>
