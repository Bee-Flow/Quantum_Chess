<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Local games (route /play/:mode/:id?): against the computer player, against an LLM opponent, and pass & play. Without
  an id, a game is created from the last New game options of that mode and the URL is replaced.
-->
<template>
	<div class="qc-local-view">
		<LocalGameHost
			v-if="gameId"
			:id="gameId"
			:key="gameId"
			@rematch="rematch"
			@nextLevel="nextLevel"
			@newGame="(mode) => router.push({ name: 'new-game', query: { mode } })"
			@review="(id) => router.push(`/review/local/${id}`)" />
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LocalGameHost from '../game/components/LocalGameHost.vue'
import { otherColor } from '../engine/index.js'
import { createLocalGame } from '../game/localGames.js'
import { useAiSources } from '../llm/composables/useAiSources.js'
import { preferences } from '../services/preferences.js'

const route = useRoute()
const router = useRouter()
const gameId = computed(() => (typeof route.params.id === 'string' && route.params.id !== '' ? route.params.id : null))

/**
 * Create a game like an existing one, optionally with changes, and open it.
 *
 * @param {object} rec record to copy
 * @param {object} [changes] what to change
 * @param {boolean} [changes.swap] swap the colours
 * @param {number|null} [changes.level] another computer level
 */
function createLike(rec, { swap = false, level = null } = {}) {
	let players = { ...rec.players }
	let humanColor = rec.humanColor
	if (level !== null && rec.mode === 'computer') {
		const engineColor = otherColor(rec.humanColor)
		players = { ...players, [engineColor]: { ...players[engineColor], level } }
	}
	if (swap && rec.mode !== 'local') {
		players = { w: players.b, b: players.w }
		humanColor = otherColor(humanColor)
	}
	const record = createLocalGame({ mode: rec.mode, players, humanColor, options: { ...rec.options } })
	router.push(`/play/${rec.mode}/${record.id}`)
}

/**
 * A rematch with colours swapped.
 *
 * @param {object} rec record
 */
function rematch(rec) {
	createLike(rec, { swap: true })
}

/**
 * The next computer level.
 *
 * @param {object} rec record
 */
function nextLevel(rec) {
	const engine = rec.players[otherColor(rec.humanColor)]
	createLike(rec, { level: Math.min(5, (engine.level ?? 1) + 1) })
}

/** Create a game from the remembered options when the route has no id. */
function ensureGame() {
	if (gameId.value || route.name !== 'local-game') {
		return
	}
	const mode = route.params.mode
	const last = preferences.lastNewGame?.[mode] ?? {}
	const color = last.color === 'b'
		? 'b'
		: (last.color === 'r' ? ((globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & 1) ? 'b' : 'w') : 'w')
	let record
	if (mode === 'computer') {
		const engine = { kind: 'engine', level: last.level ?? 1 }
		record = createLocalGame({
			mode,
			players: color === 'w' ? { w: { kind: 'human' }, b: engine } : { w: engine, b: { kind: 'human' } },
			humanColor: color,
		})
	} else if (mode === 'ai') {
		const ai = useAiSources()
		if (!last.persona || !ai.anyAvailable.value) {
			router.replace({ name: 'new-game', query: { mode } })
			return
		}
		const bot = {
			kind: 'ai',
			persona: last.persona,
			source: last.source,
			model: null,
			strength: last.strength ?? 'balanced',
		}
		record = createLocalGame({
			mode,
			players: color === 'w' ? { w: { kind: 'human' }, b: bot } : { w: bot, b: { kind: 'human' } },
			humanColor: color,
		})
	} else {
		record = createLocalGame({
			mode: 'local',
			players: {
				w: { kind: 'local', name: last.white || t('quantumchess', 'White') },
				b: { kind: 'local', name: last.black || t('quantumchess', 'Black') },
			},
			humanColor: null,
			options: { autoFlip: last.autoFlip ?? preferences.autoFlip },
		})
	}
	router.replace(`/play/${mode}/${record.id}`)
}

watch(() => route.fullPath, ensureGame, { immediate: true })
</script>

<style scoped>
.qc-local-view {
	width: 100%;
	min-height: 100%;
}
</style>
