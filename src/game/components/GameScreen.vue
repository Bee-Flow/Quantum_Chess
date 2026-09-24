<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The game screen shared by every mode: opponent card, board, own card and controls, the move strip on phones, and the
  panel (below on phones and tablets, on the right on desktops). It drives the board through a GameController and owns
  the history view, the game-over dialog and the resign confirmation. Slots: banners, overlay (over the board), eval
  (left of the board), chat and coach (panel tabs), actions (panel footer, replaces the local Undo/Resign buttons).
-->
<template>
	<div
		ref="root"
		class="qc-game"
		:class="'qc-game--' + layout"
		:style="{ '--qc-board-px': boardPx + 'px' }">
		<div class="qc-game__column">
			<div v-if="historyPly !== null || banners.length || $slots.banners" class="qc-game__banners">
				<GameBanner v-if="historyPly !== null" :text="t('quantumchess', 'Viewing move {n} of {total}', { n: historyPly, total: moves.length })">
					<NcButton size="small" data-test="back-to-live" @click="historyPly = null">
						{{ t('quantumchess', 'Back to live (L)') }}
					</NcButton>
				</GameBanner>
				<GameBanner
					v-for="b in banners"
					:key="b.id"
					:type="b.type"
					:text="b.text">
					<NcButton
						v-for="a in b.actions ?? []"
						:key="a.label"
						size="small"
						@click="a.handler()">
						{{ a.label }}
					</NcButton>
				</GameBanner>
				<slot name="banners" />
			</div>

			<ResultBar
				v-if="result && !gameOverOpen"
				:result="result"
				:names="names"
				:can="can"
				:extra="reasonExtra"
				@review="emit('review')"
				@rematch="emit('rematch')"
				@details="gameOverOpen = true" />

			<PlayerCard
				:player="players[top]"
				:state="shownState"
				:active="!result && shownState.turn === top"
				:isMe="myColor === top"
				:hideDanger="!(preferences.kingDangerBoth || myColor === top || myColor === null)"
				:compact="compact"
				:over="!!result">
				<template #status>
					<NcButton
						v-if="controller.ai && controller.ai.canLetEngineMove && players[top].kind === 'ai'"
						size="small"
						data-test="let-engine-move"
						@click="controller.ai.letEngineMove()">
						{{ t('quantumchess', 'Let the engine move') }}
					</NcButton>
				</template>
			</PlayerCard>

			<div class="qc-game__board-row">
				<slot name="eval" :layout="layout" />
				<div class="qc-game__board">
					<QuantumBoard
						ref="board"
						:state="controller.state.value"
						:legalMoves="boardMoves"
						:input="input"
						:orientation="controller.orientation.value"
						:squareSize="squareSize"
						:interactive="boardInteractive"
						:movableColor="controller.movableColor.value"
						:lastMove="lastMove"
						:history="history"
						:names="names"
						:preview="preview"
						:arrows="historyPly === null ? arrows : []"
						:highlights="historyPly === null ? highlights : []"
						:markers="historyPly === null ? markers : []"
						hotkeys
						@move="onMove"
						@previewClose="historyPly = null" />
					<slot name="overlay" />
				</div>
			</div>

			<div class="qc-game__bottom">
				<PlayerCard
					:player="players[bottom]"
					:state="shownState"
					:active="!result && shownState.turn === bottom"
					:isMe="myColor === bottom || myColor === null"
					:compact="compact"
					:over="!!result"
					bubbleAbove />
				<ControlsRow
					:controller="controller"
					:input="input"
					:state="shownState"
					:compact="compact"
					@settings="openSettings"
					@undo="undo"
					@resign="askResign" />
			</div>

			<MoveStrip
				v-if="layout === 'phone'"
				:moves="moves"
				:currentPly="historyPly"
				@selectPly="selectPly" />
		</div>

		<GamePanel
			ref="panel"
			class="qc-game__panel"
			:moves="moves"
			:stateAt="controller.stateAt"
			:names="names"
			:state="controller.state.value"
			:currentPly="historyPly"
			:chatCount="chatCount"
			:fixedHeight="layout === 'tablet'"
			@selectPly="selectPly">
			<template v-if="$slots.chat" #chat>
				<slot name="chat" />
			</template>
			<template v-if="$slots.coach" #coach>
				<slot name="coach" />
			</template>
			<template v-if="$slots.actions" #actions>
				<slot name="actions" />
			</template>
			<template v-else-if="!compact && (can.undo || can.resign) && controller.kind !== 'online'" #actions>
				<NcButton
					variant="tertiary"
					:disabled="!can.undo"
					:title="t('quantumchess', 'Undo takes the move back. The dice remember: the same move here gives the same result.')"
					data-test="undo"
					@click="undo">
					<template #icon>
						<NcIconSvgWrapper :path="mdiUndo" />
					</template>
					{{ t('quantumchess', 'Undo') }}
				</NcButton>
				<NcButton
					v-if="can.resign"
					variant="tertiary"
					data-test="resign"
					@click="askResign">
					<template #icon>
						<NcIconSvgWrapper :path="mdiFlagOutline" />
					</template>
					{{ t('quantumchess', 'Resign') }}
				</NcButton>
			</template>
		</GamePanel>

		<GameOverDialog
			v-if="gameOverOpen && result"
			:result="result"
			:players="players"
			:myColor="myColor"
			:summary="summary"
			:ratingChange="ratingChange"
			:kind="controller.kind"
			:level="level"
			:rematchState="rematchState"
			:extra="reasonExtra"
			@close="gameOverOpen = false"
			@rematch="gameOverOpen = false; emit('rematch')"
			@review="gameOverOpen = false; emit('review')"
			@newGame="gameOverOpen = false; emit('newGame')"
			@nextLevel="gameOverOpen = false; emit('nextLevel')" />

		<NcDialog
			v-if="resignOpen"
			:name="t('quantumchess', 'Resign this game?')"
			size="small"
			@update:open="(v) => !v && (resignOpen = false)">
			<p>{{ t('quantumchess', 'The game ends and counts as a loss.') }}</p>
			<template #actions>
				<NcButton @click="resignOpen = false">
					{{ t('quantumchess', 'Keep playing') }}
				</NcButton>
				<NcButton variant="error" data-test="confirm-resign" @click="resign">
					{{ t('quantumchess', 'Resign') }}
				</NcButton>
			</template>
		</NcDialog>
	</div>
</template>

<script setup>
import { mdiFlagOutline, mdiUndo } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { useHotKey } from '@nextcloud/vue/composables/useHotKey'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import QuantumBoard from '../../board/components/QuantumBoard.vue'
import ControlsRow from './ControlsRow.vue'
import GameBanner from './GameBanner.vue'
import GameOverDialog from './GameOverDialog.vue'
import GamePanel from './GamePanel.vue'
import MoveStrip from './MoveStrip.vue'
import PlayerCard from './PlayerCard.vue'
import ResultBar from './ResultBar.vue'
import { useBoardInput } from '../../board/composables/useBoardInput.js'
import { useBoardSize } from '../../board/composables/useBoardSize.js'
import { findMove, otherColor } from '../../engine/index.js'
import { preferences } from '../../services/preferences.js'
import { gameSummary } from '../moveRows.js'
import { kingCaptureContext } from '../resultText.js'

/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

const props = defineProps({
	/** GameController */
	controller: { type: Object, required: true },
	/** Computer level (game-over variants) */
	level: { type: Number, default: null },
	/** Online rating change {w, b} */
	ratingChange: { type: Object, default: null },
	/** Online rematch state */
	rematchState: { type: String, default: null },
	/** Unread chat messages */
	chatCount: { type: Number, default: 0 },
	/** Board arrows of the coach (hints, move chips) */
	arrows: { type: Array, default: () => [] },
	/** Board highlights of the coach */
	highlights: { type: Array, default: () => [] },
	/** Coach crosshairs (threats, opportunities) */
	markers: { type: Array, default: () => [] },
})
const emit = defineEmits(['review', 'newGame', 'rematch', 'nextLevel'])

const route = useRoute()
const router = useRouter()
const root = ref(null)
const board = ref(null)
const panel = ref(null)
const { squareSize, boardPx, layout } = useBoardSize(root)
const compact = computed(() => layout.value === 'phone')

const c = props.controller
const moves = computed(() => c.moves.value)
const players = computed(() => c.players.value)
const myColor = computed(() => c.myColor.value)
const result = computed(() => c.result.value)
const can = computed(() => c.can.value)
const banners = computed(() => c.banners.value ?? [])
const names = computed(() => ({ w: players.value.w.name, b: players.value.b.name }))
const bottom = computed(() => c.orientation.value)
const top = computed(() => otherColor(bottom.value))

// --- History view ---
const historyPly = ref(null)
const preview = computed(() => (historyPly.value === null
	? null
	: {
			state: c.stateAt(historyPly.value),
			kind: 'history',
			label: t('quantumchess', 'Move {n} of {total}', { n: historyPly.value, total: moves.value.length }),
		}))
const shownState = computed(() => preview.value?.state ?? c.state.value)
watch(() => moves.value.length, () => {
	historyPly.value = null
})

/**
 * Show the position after n moves (the live position for the last one).
 *
 * @param {number} n number of moves
 */
function selectPly(n) {
	historyPly.value = n >= moves.value.length ? null : Math.max(0, n)
}

// --- Board wiring ---
const boardInteractive = computed(() => c.interactive.value && historyPly.value === null)
const boardMoves = computed(() => (historyPly.value === null ? c.legalMoves.value : []))
const input = useBoardInput({ state: c.state, legalMoves: boardMoves, movableColor: c.movableColor, interactive: boardInteractive })
const history = computed(() => Array.from({ length: moves.value.length }, (_, i) => c.stateAt(i)))
const lastMove = computed(() => {
	if (c.lastMove?.value !== undefined) {
		return c.lastMove.value
	}
	const n = moves.value.length
	if (n === 0) {
		return null
	}
	const m = moves.value[n - 1]
	const legal = findMove(toRaw(c.stateAt(n - 1)), m.code)
	return legal ? { move: legal, key: m.measurement?.key ?? null } : null
})

/**
 * The board committed a move.
 *
 * @param {LegalMove} move the move
 */
function onMove(move) {
	c.submitMove(move)
}

let detach = null
onMounted(() => {
	detach = c.attachAnimator({
		play: (event) => board.value?.play(event) ?? Promise.resolve(),
		startRoll: (arg) => board.value?.startRoll(arg),
		finish: () => board.value?.finish(),
	})
})
onBeforeUnmount(() => detach?.())

// --- Game over ---
const gameOverOpen = ref(false)
let gameOverTimer = null
watch(result, (now, before) => {
	if (now && !before) {
		clearTimeout(gameOverTimer)
		gameOverTimer = setTimeout(() => {
			gameOverOpen.value = true
		}, 600)
	} else if (!now) {
		gameOverOpen.value = false
	}
})
onBeforeUnmount(() => clearTimeout(gameOverTimer))
const summary = computed(() => gameSummary(moves.value))
const reasonExtra = computed(() => {
	const r = result.value
	if (!r || r.reason !== 'king_captured' || !moves.value.length) {
		return {}
	}
	return kingCaptureContext(moves.value[moves.value.length - 1])
})

// --- Actions ---
const resignOpen = ref(false)

/** Resign (with confirmation when the preference asks for it). */
function askResign() {
	if (preferences.confirmResign) {
		resignOpen.value = true
	} else {
		resign()
	}
}

/** Resign now. */
function resign() {
	resignOpen.value = false
	c.resign()
}

/** Undo the last move. */
function undo() {
	historyPly.value = null
	c.undo()
}

/** Open the settings dialog. */
function openSettings() {
	router.push({ query: { ...route.query, dialog: 'settings' } })
}

// --- Keys (the board registers its own) ---
useHotKey('f', () => c.flip())
useHotKey('l', () => {
	historyPly.value = null
})
useHotKey(',', () => {
	selectPly((historyPly.value ?? moves.value.length) - 1)
})
useHotKey('.', () => {
	if (historyPly.value !== null) {
		selectPly(historyPly.value + 1)
	}
})

defineExpose({
	/**
	 * Open a panel tab.
	 *
	 * @param {string} id tab id
	 */
	openTab: (id) => panel.value?.open(id),
})
</script>

<style lang="scss" scoped>
.qc-game {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 8px 16px 24px;
	box-sizing: border-box;
}

.qc-game__column {
	display: flex;
	flex-direction: column;
	gap: 6px;
	width: var(--qc-board-px);
	max-width: 100%;
}

.qc-game__board-row {
	position: relative;
	display: flex;
	gap: 8px;
}

.qc-game__board {
	position: relative;
	width: var(--qc-board-px);
	height: var(--qc-board-px);
}

.qc-game__bottom {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.qc-game__banners {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.qc-game__panel {
	width: var(--qc-board-px);
	max-width: 100%;
}

.qc-game--phone {
	padding: 4px 4px 24px;
	gap: 8px;
}

// keep the first row clear of the navigation toggle in the top-left corner
.qc-game--phone,
.qc-game--tablet {
	.qc-game__column > :first-child {
		margin-inline-start: 40px;
	}
}

.qc-game--desktop,
.qc-game--wide {
	display: grid;
	grid-template-columns: auto minmax(300px, 340px);
	align-items: stretch;
	justify-content: center;
	column-gap: 24px;
	padding: 8px 16px;

	.qc-game__panel {
		width: auto;
		max-height: calc(100dvh - 50px - 32px);
	}
}

.qc-game--wide {
	grid-template-columns: auto minmax(320px, 400px);
}

.qc-game--phone-landscape {
	display: grid;
	grid-template-columns: auto 240px;
	align-items: start;
	column-gap: 12px;

	.qc-game__panel {
		width: 240px;
		max-height: calc(100dvh - 60px);
	}
}
</style>
