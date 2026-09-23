<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Development playground for the board (route #/dev/board, development builds only): scenario positions with ghosts,
  links, rolls, king danger and promotion, every board theme, speeds and orientation, the building blocks
  (BoardControls, PossibilitiesChip, BudgetPips, KingDangerChip, RollBar, NotationText, MiniBoard) and a pass & play
  loop that plays moves through the Animator exactly like a game controller does.
-->
<template>
	<div class="qc-playground qc-scope">
		<PieceSprite />
		<header class="qc-playground__bar">
			<h2>{{ t('quantumchess', 'Board playground') }}</h2>
			<label>
				{{ t('quantumchess', 'Scenario') }}
				<select v-model="scenarioId" data-test="scenario" @change="loadScenario">
					<option v-for="s in SCENARIOS" :key="s.id" :value="s.id">{{ s.label }}</option>
				</select>
			</label>
			<label>
				{{ t('quantumchess', 'Theme') }}
				<select v-model="theme" data-test="theme">
					<option v-for="id in BOARD_THEMES" :key="id" :value="id">{{ boardThemeLabel(id) }}</option>
				</select>
			</label>
			<label>
				{{ t('quantumchess', 'Speed') }}
				<select v-model="speed" data-test="speed">
					<option value="slow">slow</option>
					<option value="normal">normal</option>
					<option value="fast">fast</option>
					<option value="off">off</option>
				</select>
			</label>
			<label>
				{{ t('quantumchess', 'Roll result') }}
				<select v-model="forced" data-test="forced">
					<option value="">random</option>
					<option value="capture">capture</option>
					<option value="move">move</option>
					<option value="miss">miss</option>
				</select>
			</label>
			<label>
				<input v-model="fraction" type="checkbox" data-test="fraction">
				{{ t('quantumchess', 'Fractions') }}
			</label>
			<label>
				<input v-model="always" type="checkbox" data-test="links">
				{{ t('quantumchess', 'Link threads always') }}
			</label>
			<NcButton data-test="flip" @click="orientation = orientation === 'w' ? 'b' : 'w'">
				{{ t('quantumchess', 'Flip') }}
			</NcButton>
			<NcButton data-test="opponent" :disabled="state.result !== null || busy" @click="opponentMove">
				{{ t('quantumchess', 'Opponent roll') }}
			</NcButton>
		</header>

		<div class="qc-playground__game">
			<div class="qc-playground__board">
				<div class="qc-playground__card">
					<strong>{{ names[top] }}</strong>
					<BudgetPips :used="budgetOf(top)" :color="top" :state="state" />
					<KingDangerChip :weight="dangerOf(top)" opponent />
				</div>
				<QuantumBoard
					ref="board"
					:state="state"
					:legalMoves="legalMoves"
					:input="input"
					:orientation="orientation"
					:squareSize="squareSize"
					:interactive="!busy"
					movableColor="both"
					:lastMove="lastMove"
					:history="history"
					:names="names"
					:arrows="arrows"
					hotkeys
					@move="onMove" />
				<div class="qc-playground__card">
					<strong>{{ names[bottom] }}</strong>
					<BudgetPips :used="budgetOf(bottom)" :color="bottom" :state="state" />
					<KingDangerChip :weight="dangerOf(bottom)" />
				</div>
				<div class="qc-playground__controls">
					<BoardControls :input="input" :compact="squareSize < 48" />
					<PossibilitiesChip :state="state" :input="input" :orientation="orientation" />
				</div>
			</div>

			<aside class="qc-playground__panel">
				<h3>{{ t('quantumchess', 'Moves') }}</h3>
				<ol class="qc-playground__moves" data-test="moves">
					<li v-for="(entry, i) in log" :key="i">
						<NotationText :notation="entry.notation" :color="entry.color" />
						<RollBar
							v-if="entry.measurement"
							:record="entry.measurement"
							:compact="true"
							:showText="i === log.length - 1" />
					</li>
				</ol>
				<h3>{{ t('quantumchess', 'Mini boards') }}</h3>
				<div class="qc-playground__minis">
					<MiniBoard :state="state" :size="120" :orientation="orientation" />
					<MiniBoard
						:state="state"
						:size="120"
						boardTheme="wood"
						:arrows="[{ from: 12, to: 28, kind: 'hint' }]" />
				</div>
			</aside>
		</div>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import BoardControls from '../BoardControls.vue'
import BudgetPips from '../BudgetPips.vue'
import KingDangerChip from '../KingDangerChip.vue'
import MiniBoard from '../MiniBoard.vue'
import NotationText from '../NotationText.vue'
import PieceSprite from '../PieceSprite.vue'
import PossibilitiesChip from '../PossibilitiesChip.vue'
import QuantumBoard from '../QuantumBoard.vue'
import RollBar from '../RollBar.vue'
import {
	applyMove,
	budget,
	generateMoves,
	initialState,
	kingDanger,
	moveNotation,
	setupPosition,
} from '../../../engine/index.js'
import { clearBoardPreferenceOverrides, overrideBoardPreferences } from '../boardPreferences.js'
import { BOARD_THEMES, boardThemeLabel } from '../themes.js'
import { useBoardInput } from '../useBoardInput.js'

const SCENARIOS = [
	{ id: 'start', label: 'Start position', spec: null },
	{ id: 'ghosts', label: 'Ghosts and links', spec: { fen: '4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', prelude: ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'] } },
	{ id: 'roll', label: 'Rolled capture (Bc1×h6)', spec: { fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6'] } },
	{ id: 'danger', label: 'King danger 100 %', spec: { fen: '7k/8/8/8/8/8/8/3QK3 b - - 0 1', prelude: ['d1-d4|h5'] } },
	{ id: 'blocked', label: 'Blocked by a ghost', spec: { fen: '4k3/8/8/8/6n1/8/8/2B1K3 w - - 0 1', prelude: ['g4-e3|h6'] } },
	{ id: 'promotion', label: 'Promotion', spec: { fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1' } },
]

const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
const scenarioId = ref(params.get('scenario') ?? 'ghosts')
const theme = ref(params.get('theme') ?? 'slate')
const speed = ref(params.get('speed') ?? 'normal')
const forced = ref(params.get('outcome') ?? '')
const fraction = ref(false)
const always = ref(false)
const orientation = ref(params.get('orientation') ?? 'w')
const state = shallowRef(initialState())
const history = shallowRef([])
const lastMove = shallowRef(null)
const log = ref([])
const busy = ref(false)
const board = ref(null)
const width = ref(window.innerWidth)
const height = ref(window.innerHeight)
const names = { w: t('quantumchess', 'White'), b: t('quantumchess', 'Black') }

/** Follow the window width. */
function onResize() {
	width.value = window.innerWidth
	height.value = window.innerHeight
}
window.addEventListener('resize', onResize)
onBeforeUnmount(() => {
	window.removeEventListener('resize', onResize)
	clearBoardPreferenceOverrides()
})

watch([theme, speed, fraction, always], () => {
	overrideBoardPreferences({
		boardTheme: theme.value,
		animationSpeed: speed.value,
		probabilityFormat: fraction.value ? 'fraction' : 'percent',
		linkThreads: always.value ? 'always' : 'selection',
		confirmMoves: 'never',
	})
}, { immediate: true })

const squareSize = computed(() => {
	const avail = width.value < 700 ? width.value - 32 : Math.min(width.value - 420, height.value - 330, 720)
	return Math.max(36, Math.floor(avail / 8))
})
const legalMoves = computed(() => (busy.value ? [] : generateMoves(state.value)))
const input = useBoardInput({ state, legalMoves, movableColor: 'both', interactive: computed(() => !busy.value) })
const bottom = computed(() => orientation.value)
const top = computed(() => (orientation.value === 'w' ? 'b' : 'w'))
const arrows = ref([])

/**
 * Budget of a colour.
 *
 * @param {'w'|'b'} color colour
 * @return {number}
 */
function budgetOf(color) {
	return budget(state.value, color)
}

/**
 * King danger of a colour.
 *
 * @param {'w'|'b'} color colour
 * @return {number}
 */
function dangerOf(color) {
	return kingDanger(state.value, color)
}

/** Load the chosen scenario. */
function loadScenario() {
	const s = SCENARIOS.find((x) => x.id === scenarioId.value) ?? SCENARIOS[0]
	state.value = s.spec ? setupPosition(s.spec) : initialState()
	history.value = []
	lastMove.value = null
	log.value = []
	input.newGame()
}

/**
 * Apply and animate a move, then show the new state (the controller handshake of SPEC §14.4.2).
 *
 * @param {object} move LegalMove
 * @param {'self'|'opponent'} actor who moved
 */
async function playMove(move, actor) {
	const before = state.value
	const opts = forced.value && move.outcomes.some((o) => o.key === forced.value) ? { outcome: forced.value } : {}
	const result = applyMove(before, move.code, opts)
	busy.value = true
	try {
		const mover = before.turn
		await board.value?.play({
			before,
			after: result.state,
			move: result.move,
			measurement: result.measurement,
			actor,
			names: { mover: names[mover], opponent: names[mover === 'w' ? 'b' : 'w'] },
		})
	} finally {
		history.value = [...history.value, before]
		state.value = result.state
		lastMove.value = { move: result.move, key: result.measurement?.key ?? null }
		log.value = [...log.value, { notation: moveNotation(before, result.move, result.measurement), color: before.turn, measurement: result.measurement }]
		busy.value = false
	}
}

/**
 * The board committed a move.
 *
 * @param {object} move LegalMove
 */
function onMove(move) {
	playMove(move, 'self')
}

/** Play a rolled move for the side to move, as the opponent. */
function opponentMove() {
	const moves = generateMoves(state.value)
	const rolled = moves.filter((m) => m.resolution === 'rolled' && m.type !== 'measure')
	const list = rolled.length > 0 ? rolled : moves
	if (list.length > 0) {
		playMove(list[Math.floor(Math.random() * list.length)], 'opponent')
	}
}

loadScenario()
</script>

<style lang="scss" scoped>
.qc-playground {
	padding: 12px 16px 32px;
	max-width: 1200px;
	margin: 0 auto;
}

.qc-playground__bar {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 16px;
	align-items: center;
	margin-bottom: 12px;

	h2 {
		margin: 0;
		font-size: 20px;
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
}

.qc-playground__game {
	display: flex;
	flex-wrap: wrap;
	gap: 24px;
	align-items: flex-start;
}

.qc-playground__board {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.qc-playground__card,
.qc-playground__controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-height: 40px;
}

.qc-playground__controls {
	justify-content: space-between;
}

.qc-playground__panel {
	flex: 1 1 280px;
	min-width: 0;

	h3 {
		margin: 8px 0;
		font-size: 16px;
	}
}

.qc-playground__moves {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 320px;
	overflow: auto;
	padding-inline-start: 24px;
}

.qc-playground__minis {
	display: flex;
	gap: 12px;
}
</style>
