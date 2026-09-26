<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A chess variant game on this device (route /variants/:variant/:id): the board, the players, the move modes, the roll
  preview and result, the hands of the drop variants, the move list and the rules of the variant.

  Optional variant hooks shown here: `sideInfo(state, side, viewer)` in the player rows, `infoText(record, viewer)`
  under the moves, `noteText(note)` for roll notes, `codeText(code, record)` for move codes (with the move's history
  record), `handOrder` for the hands, `options[i].describe(value)` for the game's options, `moveWarning` (through the
  composable: the warning waits for "Play anyway") and `flipBoard: false` (no "Flip board"). While a game with hidden
  information runs, the other sides' budgets, the danger line and undo are hidden, and in pass & play the mover first
  sees "Your move" before passing the device; the curtain then covers the board and hides the players and the move
  controls (the title and the rules stay). Split is greyed out while the budget of the
  player to move is full, and the shared rules leave castling and en passant out when the variant has neither
  (`specialMoves: false`). During the hand-over the mode tooltips, the compulsory line and the keyboard focus say
  nothing about the opponent, and in a hidden game the keyboard reaches only the squares of the player to move (never
  a square that player cannot see, unless it is the target of a try built from what the player knows). The roll
  preview and the roll result say when an outcome ends the game ("The game ends: …") unless a roll note already does
  (the preview not while a hidden game runs, see useVariantGame), and the pieces in hand and in the promotion choice
  are turned like their side's pieces on the board (shogi).

  Layout: on a wide screen the board is on the left and the panel on the right (title and rules, players, the move
  controls and the hint of the move mode, then the last roll, the move list and the game buttons). On a narrow screen
  the title comes first (beside the navigation toggle), then the board, the move controls, which stay at the bottom of
  the screen while a tall board is scrolled (a slim bar: the status, the move types and a move waiting for
  confirmation), the hint below them, the players and the rest. The board leaves room for that bar, so a tall board
  (3D chess) opens whole above it; when a move waits for confirmation, the page scrolls so that the move's squares,
  which stay marked, are not under the bar. The pieces in hand of a drop variant sit at the board, always shown (empty
  or not): in a two-player game the hand of the side at the top of the board above it and the other below it, with
  more sides all below it, grouped per board with `handBoards` (bughouse: each board's two hands under it, the hand of
  the seat at its top first, in fixed halves that do not wrap when the hands fill).

  The move waiting for confirmation is named in its box (long algebraic, `moveText`), and the hint then says to
  confirm or cancel it. The move list is oldest first and numbered, with a column per side in a two-player game (a
  multi-move turn in one cell), written in long algebraic notation with the piece letters and `x` for a capture (the
  saved moves keep their piece type); the variant's `infoText` gives only the lines that carry information there
  (`brief`), and a game with an umpire heads its announcements "Umpire", one line per move. A budget the viewer may not
  know reads "Budget hidden" (a caption, no pips). The game buttons sit two to a row (three share one row), each with
  its whole label, and the hand-over curtain shows its prompt on a card over the blurred board. `boardLegend(state)`
  adds lines under the board (`{ kind, text }`, with a swatch for `kind: 'hill'`, the hill of King of the Hill), as the
  fog legend does for hidden squares. A failed save shows "This game could not be saved on this device." until a save
  works again; this notice and the refusal notice are drawn as warning notes (the main text colour on a light tint of
  the warning colour).
-->
<template>
	<div ref="rootEl" class="qc-vgame">
		<NcEmptyContent
			v-if="game.missing.value"
			:name="t('quantumchess', 'Game not found')"
			:description="t('quantumchess', 'This game is not stored on this device.')">
			<template #action>
				<NcButton :to="{ name: 'variants' }">
					{{ t('quantumchess', 'Chess variants') }}
				</NcButton>
			</template>
		</NcEmptyContent>
		<NcLoadingIcon v-else-if="!V || !state" :size="44" class="qc-vgame__loading" />
		<template v-else>
			<div class="qc-vgame__top">
				<header class="qc-vgame__head">
					<h2>{{ entry?.name() }}</h2>
					<NcButton
						class="qc-vgame__rules-toggle"
						variant="tertiary"
						:aria-expanded="showRules ? 'true' : 'false'"
						@click="showRules = !showRules">
						{{ showRules ? t('quantumchess', 'Hide rules') : t('quantumchess', 'Rules') }}
					</NcButton>
				</header>

				<section v-if="showRules" class="qc-vgame__rules">
					<ul>
						<li v-for="(r, i) in variantRules" :key="'v' + i">
							{{ r }}
						</li>
					</ul>
					<details>
						<summary>{{ t('quantumchess', 'The quantum rules of every variant') }}</summary>
						<ul>
							<li v-for="(r, i) in sharedRules(V)" :key="'s' + i">
								{{ r }}
							</li>
						</ul>
					</details>
				</section>
			</div>

			<div
				class="qc-vgame__board"
				:class="{ 'qc-vgame__board--hands': hands.length, 'qc-vgame__board--fill': fillBoard }">
				<VariantBoard
					class="qc-vgame__drawing"
					:variant="V"
					:state="state"
					:rotation="game.rotation.value"
					:marks="game.marks.value"
					:hidden="game.curtain.value ? allSquares : game.hidden.value"
					:viewer="game.curtain.value ? -1 : game.viewer.value"
					:focusable="focusable"
					:label="boardLabel"
					:hold="game.thinking.value"
					@square="game.click" />
				<div
					v-for="g in hands"
					:key="g.key"
					class="qc-vgame__hands"
					:class="['qc-vgame__hands--' + g.place, { 'qc-vgame__hands--board': g.board }]">
					<div
						v-for="h in g.hands"
						:key="h.side"
						class="qc-vgame__hand"
						:class="'qc-vgame__hand--' + g.place">
						<!-- TRANSLATORS: pieces held in hand; {side} is White, Black, Sente, Gote or White A -->
						<span class="qc-vgame__hand-title">{{
							t('quantumchess', 'In hand: {side}', { side: sideName(V, h.side) })
						}}</span>
						<button
							v-for="p in h.pieces"
							:key="p.type"
							type="button"
							class="qc-vgame__hand-piece"
							:class="{
								'qc-vgame__hand-piece--on': game.dropType.value === p.type && h.side === state.turn,
							}"
							:disabled="h.side !== state.turn || !game.isHumanTurn.value || Boolean(game.handover.value)"
							:aria-label="t('quantumchess', 'Drop {piece}', { piece: typeName(V, p.type) })"
							@click="game.chooseDrop(p.type)">
							<svg viewBox="-0.5 -0.5 1 1" class="qc-vgame__hand-glyph" aria-hidden="true">
								<VariantPiece
									:glyph="glyphOf(V, p.type, h.side)"
									:size="0.95"
									:spin="pieceSpin(V, h.side, game.rotation.value)" />
							</svg>
							<span>{{ p.min === p.max ? p.max : p.min + '–' + p.max }}</span>
						</button>
						<span v-if="!h.pieces.length" class="qc-vgame__hand-empty" aria-hidden="true" />
					</div>
				</div>
				<div v-if="game.curtain.value" class="qc-vgame__curtain">
					<div class="qc-vgame__curtain-card">
						<!-- TRANSLATORS: {side} is a player, such as White, Black, Red, Sente or White A -->
						<p>{{ t('quantumchess', 'Pass the device to {side}.', { side: sideName(V, state.turn) }) }}</p>
						<NcButton variant="primary" @click="game.curtain.value = false">
							{{ t('quantumchess', 'I am {side}: show my board', { side: sideName(V, state.turn) }) }}
						</NcButton>
					</div>
				</div>
				<p v-if="fogLegend" class="qc-vgame__legend">
					<span class="qc-vgame__fog-swatch" aria-hidden="true" />
					{{ t('quantumchess', 'Fog: squares you cannot see.') }}
				</p>
				<p v-if="boardLegend.length" class="qc-vgame__legend qc-vgame__legend--items">
					<span v-for="(l, i) in boardLegend" :key="'legend' + i" class="qc-vgame__legend-item">
						<span
							v-if="LEGEND_SWATCHES.includes(l.kind)"
							class="qc-vgame__legend-swatch"
							:class="'qc-vgame__legend-swatch--' + l.kind"
							aria-hidden="true" />
						{{ l.text }}
					</span>
				</p>
			</div>

			<section v-if="!game.curtain.value" class="qc-vgame__info">
				<details v-if="gameOptions.length" class="qc-vgame__options-box" :open="wide">
					<summary>{{ t('quantumchess', 'Game options') }}</summary>
					<ul class="qc-vgame__options">
						<li v-for="(line, i) in gameOptions" :key="i">
							{{ line }}
						</li>
					</ul>
				</details>

				<ul class="qc-vgame__players">
					<li
						v-for="(s, i) in V.sides"
						:key="i"
						class="qc-vgame__player"
						:class="{ 'qc-vgame__player--turn': !state.result && state.turn === i, 'qc-vgame__player--out': isOut(i) }">
						<span class="qc-vgame__swatch" :style="{ background: sideFill(s) }" aria-hidden="true" />
						<span class="qc-vgame__player-name">
							{{ sideName(V, i) }}
							<small>{{ playerText(i) }}</small>
						</span>
						<span
							v-if="players[i].info"
							class="qc-vgame__side-info"
							:title="players[i].info.title || undefined">{{ players[i].info.text }}</span>
						<span
							v-if="players[i].pips.known"
							class="qc-vgame__budget"
							:title="t('quantumchess', 'Quantum budget: {used} of {max}', {
								used: players[i].pips.used,
								max: players[i].pips.limit,
							})">
							<span class="qc-vgame__pips" aria-hidden="true">
								<span
									v-for="k in players[i].pips.limit"
									:key="k"
									class="qc-vgame__pip"
									:class="{ 'qc-vgame__pip--used': k <= players[i].pips.used }" />
							</span>
							<small class="qc-vgame__budget-count">{{ t('quantumchess', 'Budget {used}/{max}', {
								used: players[i].pips.used,
								max: players[i].pips.limit,
							}) }}</small>
						</span>
						<span
							v-else
							class="qc-vgame__budget qc-vgame__budget--unknown"
							:title="t('quantumchess', 'Quantum budget: unknown')">
							<span class="qc-vgame__unknown-track" aria-hidden="true">?</span>
							<small class="qc-vgame__budget-count">{{ t('quantumchess', 'Budget hidden') }}</small>
						</span>
					</li>
				</ul>
			</section>

			<section v-if="!game.curtain.value" ref="controlsEl" class="qc-vgame__controls">
				<p class="qc-vgame__status" role="status" aria-live="polite">
					<template v-if="state.result">
						<strong>{{ resultText(V, state.result) }}</strong>
						<span v-if="endNote" class="qc-vgame__end-note">{{ endNote }}</span>
					</template>
					<template v-else-if="game.thinking.value">
						<!-- TRANSLATORS: {side} is a player, such as White, Black, Red, Sente or White A -->
						<NcLoadingIcon :size="16" inline /> {{
							t('quantumchess', '{side} is thinking…', { side: sideName(V, state.turn) })
						}}
					</template>
					<template v-else>
						<!-- TRANSLATORS: {side} is a player, such as White, Black, Red, Sente or White A -->
						{{ t('quantumchess', '{side} to move', { side: sideName(V, state.turn) }) }}
					</template>
					<span v-if="compulsory" class="qc-vgame__compulsory">
						{{ t('quantumchess', 'You must capture: only moves that might capture are allowed.') }}
					</span>
					<span v-if="game.danger.value > 0 && !state.result && !V.hidden" class="qc-vgame__danger">
						{{ dangerLine(V, state, game.dangerSide.value, game.danger.value) }}
					</span>
				</p>

				<section v-if="game.handover.value" class="qc-vgame__box qc-vgame__box--handover">
					<p>
						<strong>{{ t('quantumchess', 'Your move: {result}', { result: handoverResult }) }}</strong>
					</p>
					<NcButton variant="primary" @click="game.passDevice">
						{{ t('quantumchess', 'Pass the device') }}
					</NcButton>
				</section>

				<div
					v-if="!state.result"
					class="qc-vgame__modes"
					role="group"
					:aria-label="t('quantumchess', 'Move type')">
					<!-- the reason sits on a wrapper: a disabled button shows no tooltip in every browser -->
					<span
						v-for="m in modes"
						:key="m.id"
						class="qc-vgame__mode"
						:title="m.blocked || undefined">
						<NcButton
							size="small"
							wide
							:variant="game.mode.value === m.id ? 'primary' : 'secondary'"
							:pressed="game.mode.value === m.id"
							:disabled="!game.isHumanTurn.value || Boolean(game.handover.value) || Boolean(m.blocked)"
							@click="game.setMode(m.id)">
							{{ m.label }}
						</NcButton>
					</span>
				</div>

				<div v-if="actions.length" class="qc-vgame__choices">
					<NcButton
						v-for="a in actions"
						:key="a.code"
						variant="primary"
						:disabled="!game.isHumanTurn.value || Boolean(game.handover.value) || !a.legal"
						@click="game.attempt(a.code)">
						{{ a.label }}
					</NcButton>
					<!-- a turn of several moves is often taken back move by move: Undo sits beside Submit turn -->
					<NcButton :disabled="!game.canUndo.value" @click="game.undo">
						{{ t('quantumchess', 'Undo') }}
					</NcButton>
				</div>

				<section v-if="game.promoChoices.value" class="qc-vgame__box">
					<p>{{ t('quantumchess', 'Promote to') }}</p>
					<div class="qc-vgame__choices">
						<NcButton
							v-for="m in game.promoChoices.value"
							:key="m.code"
							:aria-label="m.promo ? typeName(V, m.promo) : t('quantumchess', 'Do not promote')"
							@click="game.attempt(m.code)">
							<template #icon>
								<svg
									viewBox="-0.5 -0.5 1 1"
									width="28"
									height="28"
									aria-hidden="true">
									<VariantPiece
										:glyph="glyphOf(V, m.promo ?? pieceTypeAt(m.from), state.turn)"
										:size="0.95"
										:spin="pieceSpin(V, state.turn, game.rotation.value)" />
								</svg>
							</template>
						</NcButton>
					</div>
				</section>

				<section
					v-if="game.pending.value"
					class="qc-vgame__box qc-vgame__box--pending"
					:class="{ 'qc-vgame__box--warning': game.pending.value.warning }">
					<p class="qc-vgame__pending-move">
						<strong class="qc-vgame__code">{{ pendingText }}</strong>
					</p>
					<p v-if="game.pending.value.warning" class="qc-vgame__warning" role="alert">
						<strong>{{ game.pending.value.warning }}</strong>
					</p>
					<template v-if="game.pending.value.outcomes.length">
						<p>{{ t('quantumchess', 'This move is settled by a roll:') }}</p>
						<ul class="qc-vgame__outcomes">
							<li v-for="(o, i) in game.pending.value.outcomes" :key="i">
								<strong>{{ percent(o.p) }}</strong> {{
									outcomeText(o.key, game.pending.value.code, { V, state })
								}}
								<small v-for="nt in o.notes" :key="nt"> · {{ noteText(V, nt) }}</small>
								<small v-if="endText(V, o.result, o.notes)" class="qc-vgame__ends">
									· {{ endText(V, o.result, o.notes) }}
								</small>
							</li>
						</ul>
					</template>
					<!-- a move the variant warns about: Cancel is the safe choice and comes first -->
					<div v-if="game.pending.value.warning" class="qc-vgame__choices">
						<NcButton variant="primary" @click="game.cancel">
							{{ t('quantumchess', 'Cancel') }}
						</NcButton>
						<NcButton variant="secondary" @click="game.confirm">
							{{ game.pending.value.outcomes.length
								? t('quantumchess', 'Play and roll')
								: t('quantumchess', 'Play anyway') }}
						</NcButton>
					</div>
					<div v-else class="qc-vgame__choices">
						<NcButton variant="primary" @click="game.confirm">
							{{ game.pending.value.outcomes.length
								? t('quantumchess', 'Play and roll')
								: t('quantumchess', 'Play anyway') }}
						</NcButton>
						<NcButton @click="game.cancel">
							{{ t('quantumchess', 'Cancel') }}
						</NcButton>
					</div>
				</section>

				<p v-if="noticeText" class="qc-vgame__notice" role="alert">
					{{ noticeText }}
				</p>
				<p v-if="game.saveFailed.value" class="qc-vgame__notice qc-vgame__notice--save" role="alert">
					{{ t('quantumchess', 'This game could not be saved on this device.') }}
				</p>
			</section>

			<p v-if="!game.curtain.value && !state.result" class="qc-vgame__hint qc-vgame__hint--mode">
				{{ modeHint }}
			</p>

			<aside v-if="!game.curtain.value" class="qc-vgame__panel">
				<section v-if="showRoll" class="qc-vgame__box qc-vgame__box--roll">
					<p v-if="V.umpire">
						{{ t('quantumchess', 'Result: {result}', {
							result: outcomeText(game.lastRoll.value.key, game.lastRoll.value.code, rollWhere),
						}) }}
					</p>
					<template v-else>
						<p>
							{{ t('quantumchess', 'Roll: {result} ({percent})', {
								result: outcomeText(game.lastRoll.value.key, game.lastRoll.value.code, rollWhere),
								percent: percent(game.lastRoll.value.p),
							}) }}
						</p>
						<p v-for="nt in game.lastRoll.value.notes" :key="nt" class="qc-vgame__note">
							{{ noteText(V, nt) }}
						</p>
					</template>
					<p v-if="rollEnds" class="qc-vgame__note qc-vgame__ends">
						{{ rollEnds }}
					</p>
				</section>

				<section v-if="report.length" class="qc-vgame__box qc-vgame__box--report" aria-live="polite">
					<h3 v-if="V.umpire" class="qc-vgame__box-title">
						{{ t('quantumchess', 'Umpire') }}
					</h3>
					<template v-for="(group, g) in reportGroups" :key="g">
						<h3 v-if="group.title" class="qc-vgame__box-title">
							{{ group.title }}
						</h3>
						<p v-for="(line, i) in group.lines" :key="i" class="qc-vgame__report-line">
							{{ line }}
						</p>
					</template>
				</section>

				<p v-if="refusedText" class="qc-vgame__hint">
					{{ refusedText }}
				</p>

				<section
					ref="movesEl"
					class="qc-vgame__moves"
					:class="{ 'qc-vgame__moves--scrolled': movesScrolled }"
					:aria-label="t('quantumchess', 'Moves')"
					@scroll="movesScrolled = $event.target.scrollTop > 2">
					<ol class="qc-vgame__move-rows" :class="{ 'qc-vgame__move-rows--pairs': pairs }">
						<li v-for="row in moveList" :key="row.n" class="qc-vgame__move-row">
							<span class="qc-vgame__move-number">{{ row.n }}.</span>
							<!-- an empty first cell: a game that the second side began -->
							<div v-for="(cell, k) in row.cells" :key="k" class="qc-vgame__move-cell">
								<template v-if="cell">
									<div v-for="h in cell" :key="h.index" class="qc-vgame__move-entry">
										<div class="qc-vgame__move">
											<span
												v-if="!pairs"
												class="qc-vgame__swatch qc-vgame__swatch--small"
												:style="{ background: sideFill(V.sides[h.side]) }"
												aria-hidden="true" />
											<span
												class="qc-vgame__code"
												:class="{ 'qc-vgame__code--hidden': h.secret }"><template
													v-for="(part, j) in codeParts(h.text)"
													:key="j">{{ part }}<wbr></template></span>
										</div>
										<small v-if="h.result" class="qc-vgame__rolled">{{ h.result }}</small>
										<template v-if="!pairs">
											<small
												v-for="(line, j) in h.lines"
												:key="j"
												class="qc-vgame__move-line">{{ line }}</small>
										</template>
									</div>
								</template>
								<span v-else-if="k === 0" class="qc-vgame__move-none" aria-hidden="true">…</span>
							</div>
							<!-- with a column per side, the lines of the row's moves span both columns -->
							<div v-if="pairs && row.lines.length" class="qc-vgame__move-notes">
								<small
									v-for="(line, j) in row.lines"
									:key="j"
									class="qc-vgame__move-line">{{ line }}</small>
							</div>
						</li>
					</ol>
				</section>

				<div class="qc-vgame__actions">
					<NcButton v-if="!actions.length" :disabled="!game.canUndo.value" @click="game.undo">
						{{ t('quantumchess', 'Undo') }}
					</NcButton>
					<NcButton v-if="V.flipBoard !== false" @click="game.flipped.value = !game.flipped.value">
						{{ t('quantumchess', 'Flip board') }}
					</NcButton>
					<NcButton v-if="!state.result && !game.handover.value" @click="game.resign">
						{{ t('quantumchess', 'Resign') }}
					</NcButton>
					<NcButton :to="{ name: 'variants' }">
						{{ t('quantumchess', 'New game') }}
					</NcButton>
				</div>
			</aside>
		</template>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import VariantBoard from '../variantplay/components/VariantBoard.vue'
import VariantPiece from '../variantplay/components/VariantPiece.vue'
import { useVariantGame } from '../variantplay/composables/useVariantGame.js'
import { glyphOf, pieceSpin, sideFill, typeName } from '../variantplay/glyphs.js'
import { focusSquares } from '../variantplay/marks.js'
import { budgetPips, handGroups, moveRows, recordsSince, sideInfoOf, sortHand } from '../variantplay/panel.js'
import {
	dangerLine,
	endText,
	moveText,
	noteText,
	optionLines,
	outcomeText,
	percent,
	recordLines,
	resultText,
	sharedRules,
} from '../variantplay/texts.js'
import { catalogEntry, handView, isLegal, sideName } from '../variants/index.js'

const route = useRoute()
const game = useVariantGame(String(route.params.id))
game.load()
onBeforeUnmount(() => game.stop())

const V = computed(() => game.V.value)
const state = computed(() => game.state.value)
const record = computed(() => game.record.value)
const entry = computed(() => catalogEntry(String(route.params.variant)))
const showRules = ref(false)
const rootEl = ref(null)
const controlsEl = ref(null)
const movesEl = ref(null)

const variantRules = computed(() => (V.value?.rules ? V.value.rules() : []))

/**
 * The legend kinds drawn with a swatch: the hill of King of the Hill, the multiverse's halos, inactive timelines and
 * lines.
 */
const LEGEND_SWATCHES = ['hill', 'must', 'optional', 'inactive', 'threat', 'travel']

/**
 * Whether the screen is wide (the panel beside the board): the game's options are then shown open, on a narrow screen
 * folded under "Game options".
 */
const wide = ref(true)
try {
	wide.value = window.matchMedia?.('(min-width: 1024px)').matches ?? true
} catch {
	// no media queries: keep them open
}

/** Where a game ended, under the result (the variant's `endNote(state)`: the multiverse names the boards). */
const endNote = computed(() => {
	if (!state.value?.result || !V.value?.endNote) {
		return ''
	}
	const text = V.value.endNote(state.value)
	return typeof text === 'string' ? text : ''
})

/** The record of the last roll's move, for the square of an outcome (`outcomeText`). */
const rollWhere = computed(() => {
	const last = state.value?.history.at(-1)
	return { V: V.value, record: last && last.code === game.lastRoll.value?.code ? last : null }
})

/**
 * Whether the board fills the screen's height (`layout.fill`, the multiverse): it then leaves room for its caption,
 * its legend and, on a narrow screen, the move controls below it.
 */
const fillBoard = computed(() => Boolean(V.value?.layoutOf && state.value
	&& V.value.layoutOf(state.value).layout?.fill))

/** Whether the move list is scrolled away from its first row (its top then fades out). */
const movesScrolled = ref(false)

/**
 * A move code in parts, after which a line may break: after `|`, `-` and `>` or `>>` (not between the two), so a
 * long code of the multiverse wraps between its squares, not inside one.
 *
 * @param {string} text move code as shown
 * @return {string[]}
 */
function codeParts(text) {
	return String(text).split(/(?<=\||-|>>|[^>]>(?!>))/)
}
const allSquares = computed(() => new Set(Array.from({ length: V.value?.topology.size ?? 0 }, (_, i) => i)))

/**
 * Whether the player to move looks at the board and the panel (`boardInteractive` in marks.js): a human's turn, not
 * the hidden hand-over, in which the mover still looks while the opponent is to move, nor the curtain, and in a hidden
 * game the viewer is the side to move. Only then do the mode tooltips and the compulsory line speak about the side to
 * move, and only then does the keyboard reach any square.
 */
const moverLooks = computed(() => game.interactive.value)

/** Whether the player to move must capture (compulsory capture, as in Antichess). */
const compulsory = computed(() => moverLooks.value && game.compulsory.value)

/** Whether the budget of the player to move is full: no split is possible (docs/rules.md 7.1). */
const budgetFull = computed(() => moverLooks.value && game.budgetFull.value)

/** The move modes, each with the reason why it is closed now (the tooltip of the greyed-out button), or null. */
const modes = computed(() => {
	const must = compulsory.value ? t('quantumchess', 'Not now: a capture is compulsory.') : null
	const full = budgetFull.value ? t('quantumchess', 'Budget full: merge or measure a piece first.') : null
	return [
		{ id: 'move', label: t('quantumchess', 'Move'), blocked: null },
		{ id: 'split', label: t('quantumchess', 'Split'), blocked: must ?? full },
		{ id: 'merge', label: t('quantumchess', 'Merge'), blocked: null },
		{ id: 'measure', label: t('quantumchess', 'Measure'), blocked: must },
	]
})

/** Per side: the budget pips (unknown for the other sides while a hidden game runs) and the variant's own text. */
const players = computed(() => {
	if (!V.value || !state.value) {
		return []
	}
	const viewer = game.viewer.value
	return V.value.sides.map((s, i) => ({
		pips: budgetPips(V.value, state.value, i, viewer),
		info: sideInfoOf(V.value, state.value, i, viewer),
	}))
})

/** The game's options, one line each ("Start position (0–959): RNBQKBNR"). */
const gameOptions = computed(() => (V.value?.options?.length ? optionLines(V.value, record.value?.options) : []))

/** The fog legend under the board of a hidden game with fog. */
const fogLegend = computed(() => Boolean(V.value?.hidden && (V.value.hiddenStyle ?? 'fog') === 'fog'
	&& game.hidden.value && !game.curtain.value))

/** The variant's lines under the board (`boardLegend(state)`: the hill of King of the Hill), not behind the curtain. */
const boardLegend = computed(() => {
	if (!V.value?.boardLegend || !state.value || game.curtain.value) {
		return []
	}
	const list = V.value.boardLegend(state.value)
	return Array.isArray(list) ? list.filter((l) => l && typeof l.text === 'string' && l.text) : []
})

/** The result of the move just played, shown to the mover before the device is passed. */
const handoverResult = computed(() => {
	const h = game.handover.value
	if (!h) {
		return ''
	}
	const history = state.value?.history ?? []
	const last = history.at(-1)
	const type = typeOfRecord(history.length - 1)
	return moveText(V.value, h.code, { record: last?.code === h.code ? last : null, type })
		+ ' · ' + outcomeText(h.key, h.code)
})

/** The move waiting for confirmation, in the notation of the move list. */
const pendingText = computed(() => {
	const p = game.pending.value
	return p ? moveText(V.value, p.code, { type: p.type ?? null, capture: Boolean(p.capture), state: state.value }) : ''
})

const modeHint = computed(() => {
	if (game.pending.value) {
		return t('quantumchess', 'Confirm or cancel the move.')
	}
	switch (game.mode.value) {
		case 'split':
			return t('quantumchess', 'Choose a piece, then two empty squares.')
		case 'merge':
			return t('quantumchess', 'Choose two parts of one ghost, then the square where they meet.')
		case 'measure':
			return t('quantumchess', 'Choose one of your ghosts to find out where it really is.')
		default: {
			// the variant's own hint for the rest of a turn (the multiverse, once the must-move boards are played)
			const own = V.value?.turnHint && state.value ? V.value.turnHint(state.value) : null
			return typeof own === 'string' && own ? own : t('quantumchess', 'Choose a piece, then its target square.')
		}
	}
})

/** The variant's own turn actions, such as "Submit turn" in the multiverse. */
const actions = computed(() => {
	if (!V.value?.actions || !state.value || state.value.result) {
		return []
	}
	return V.value.actions(state.value).map((a) => ({ ...a, legal: isLegal(V.value, state.value, a.code) }))
})

/**
 * The hands of a drop variant, one per side, empty or not (so nothing jumps after the first capture), in the groups of
 * `handGroups` (panel.js): in a two-player game the hand of the side whose pieces point down in this view (the side at
 * the top of the board) above the board, every other hand below it; per board with the variant's `handBoards`.
 */
const hands = computed(() => {
	if (!V.value || !state.value || !V.value.drops) {
		return []
	}
	const rotation = game.rotation.value
	const onTop = (side) => pieceSpin(V.value, side, rotation) === 180
	return handGroups(V.value, rotation, onTop).map((g) => ({
		...g,
		hands: g.sides.map((side) => ({ side, pieces: sortHand(V.value, handView(state.value, side)) })),
	}))
})

/**
 * The squares the keyboard can reach (`focusSquares` in marks.js): only while the player to move looks at the board
 * (never during the hidden hand-over, behind the curtain or on a computer's turn), the from squares of the viewer's
 * moves that the viewer can see and the marked targets. A target on a square the viewer cannot see exists only when
 * the variant builds the viewer's attempts from what the viewer knows (Kriegspiel's tries).
 */
const focusable = computed(() => (moverLooks.value
	? focusSquares(game.moves.value, game.marks.value, game.hidden.value)
	: new Set()))

const boardLabel = computed(() => (entry.value
	? t('quantumchess', 'Board of {variant}', { variant: entry.value.name() })
	: ''))

/** Hide the last roll of the opponent in hidden-information variants (only what the umpire says is shown). */
const hideLast = computed(() => V.value?.hidden && game.lastRoll.value
	&& game.lastRoll.value.side !== game.viewer.value)

/**
 * The line of the roll box that says the move ended the game, when no roll note says so (with an umpire, the notes are
 * not shown).
 */
const rollEnds = computed(() => {
	const roll = game.lastRoll.value
	return roll ? endText(V.value, roll.result, V.value?.umpire ? [] : roll.notes) : ''
})

/** The roll box: not for the opponent's hidden roll, and not twice beside the "Your move" box of an umpire game. */
const showRoll = computed(() => Boolean(game.lastRoll.value && !hideLast.value
	&& !(V.value?.umpire && game.handover.value)))

const noticeText = computed(() => {
	const n = game.notice.value
	if (!n) {
		return ''
	}
	// the variant's own words, where its rules are the reason (the multiverse: the board, not the piece)
	const own = V.value?.refusalText ? V.value.refusalText(state.value, n.kind, n.sq ?? -1) : null
	if (typeof own === 'string' && own) {
		return own
	}
	switch (n.kind) {
		case 'umpire':
			return t('quantumchess', 'The umpire says: that move is not possible. Try another one.')
		case 'illegal':
			return t('quantumchess', 'That move is not possible.')
		case 'noSplit':
			return t(
				'quantumchess',
				'This piece cannot split: it needs two empty squares it could move to, within the budget.',
			)
		case 'noMerge':
			return t('quantumchess', 'Choose a part of one of your ghosts.')
		case 'noMeasure':
			return t('quantumchess', 'Choose one of your ghosts.')
		case 'measureHere':
			return t('quantumchess', 'This ghost cannot be measured from this square.')
		case 'mergeHere':
			return t('quantumchess', 'These parts cannot merge from here.')
		case 'notYours':
			return t('quantumchess', 'Choose one of your pieces.')
		default:
			return ''
	}
})

/** The codes the umpire refused this turn (Kriegspiel). */
const refusedText = computed(() => (V.value?.umpire && game.refused.value.length
	? t('quantumchess', 'Refused this turn: {moves}', { moves: game.refused.value.join(', ') })
	: ''))

/**
 * The report's lines in groups: one per run of records of one side. In a variant whose turn has several moves (its
 * `actions`, the multiverse) each group is headed with whose turn it was ("Last turn of White"), so an old line is not
 * read as the present. With an umpire, the announcements of one move share a line.
 */
const reportGroups = computed(() => {
	if (!V.value || !state.value) {
		return []
	}
	const viewer = game.viewer.value
	const groups = []
	for (const h of recordsSince(state.value.history, viewer)) {
		let lines = recordLines(V.value, h, viewer)
		if (!lines.length) {
			continue
		}
		// the umpire's announcements of one move read as one line ("White moved. No pawn tries.")
		if (V.value.umpire) {
			lines = [lines.join(' ')]
		}
		const last = groups[groups.length - 1]
		if (last && last.side === h.side) {
			last.lines.push(...lines)
		} else {
			const title = V.value.actions && !V.value.umpire
				// TRANSLATORS: above the moves of a player's last turn in 5D chess; {side} is White or Black
				? t('quantumchess', 'Last turn of {side}', { side: sideName(V.value, h.side) })
				: null
			groups.push({ side: h.side, title, lines: [...lines] })
		}
	}
	return groups
})

/** The lines of the records since the viewer's own last move: announcements, "Blue is out", sides that sat out. */
const report = computed(() => reportGroups.value.flatMap((g) => g.lines))

/**
 * The type of the piece that moved in a history record, as the saved move list keeps it (`t`), or null (games saved
 * before, or a move list that does not match the history).
 *
 * @param {number} i index in the history
 * @return {string|null}
 */
function typeOfRecord(i) {
	const saved = record.value?.moves ?? []
	return saved.length === (state.value?.history.length ?? -1) ? (saved[i]?.t ?? null) : null
}

/** Every history record as the move list shows it, oldest first. */
const historyRows = computed(() => {
	if (!state.value) {
		return []
	}
	const viewer = game.viewer.value
	const running = !state.value.result
	return state.value.history.map((h, index) => {
		const secret = V.value.hidden && h.side !== viewer && running
		// the move list keeps the lines that carry information (the umpire box says the rest)
		const lines = recordLines(V.value, h, viewer, { brief: true })
		let text = moveText(V.value, h.code, { record: h, type: typeOfRecord(index) })
		let result = null
		if (secret) {
			// a variant with its own lines (the umpire's announcements) says what the opponent's move revealed
			text = h.captures.length && !V.value.infoText
				? t(
						'quantumchess',
						'Capture on {squares}',
						{ squares: h.captures.map((s) => V.value.topology.names[s]).join(', ') },
					)
				: t('quantumchess', 'A move')
		} else if (V.value.umpire && running) {
			// with an umpire, whether a move was rolled is hidden information: every own row shows its result alone
			result = outcomeText(h.key, h.code)
		} else if (h.rolled) {
			result = '🎲 ' + outcomeText(h.key, h.code) + ' · ' + percent(h.p)
		}
		return { index, side: h.side, text, result, lines, secret }
	})
})

/** Whether the move list has a column per side (a two-player game). */
const pairs = computed(() => V.value?.sides.length === 2)

/**
 * The numbered rows of the move list (`moveRows`), each cell with the rows of its records, and the lines of all its
 * records (shown under the row, across both columns, in a two-player game).
 */
const moveList = computed(() => moveRows(state.value?.history ?? [], V.value?.sides.length ?? 2).map((row) => {
	const cells = row.cells.map((cell) => (cell ? cell.items.map((i) => historyRows.value[i]) : null))
	return { n: row.n, cells, lines: cells.flatMap((cell) => (cell ?? []).flatMap((h) => h.lines)) }
}))

// the newest move is at the end of the list: keep it in view
watch(() => state.value?.history.length, async () => {
	await nextTick()
	if (movesEl.value) {
		movesEl.value.scrollTop = movesEl.value.scrollHeight
	}
}, { immediate: true })

/**
 * The element whose scrolling moves the page: the nearest ancestor that scrolls, else the document.
 *
 * @param {Element} el element
 * @return {Element}
 */
function scroller(el) {
	for (let e = el.parentElement; e; e = e.parentElement) {
		const y = getComputedStyle(e).overflowY
		if ((y === 'auto' || y === 'scroll') && e.scrollHeight > e.clientHeight) {
			return e
		}
	}
	return document.scrollingElement ?? document.documentElement
}

/**
 * On a narrow screen the move controls stay at the bottom of the screen: when a move waits for confirmation, scroll
 * the page so that its marked squares are above them (as far as the top of the screen allows).
 */
function revealPending() {
	const bar = controlsEl.value
	const root = rootEl.value
	if (!bar || !root || getComputedStyle(bar).position !== 'sticky') {
		return
	}
	const cells = [...root.querySelectorAll('.qc-vboard__cell--selected, .qc-vboard__cell--target')]
		.map((c) => c.getBoundingClientRect())
	if (!cells.length) {
		return
	}
	const top = Math.min(...cells.map((r) => r.top))
	const bottom = Math.max(...cells.map((r) => r.bottom))
	const barTop = bar.getBoundingClientRect().top
	const box = scroller(root)
	const viewTop = box === document.scrollingElement || box === document.documentElement
		? 0
		: box.getBoundingClientRect().top
	const by = Math.min(bottom - barTop + 8, top - viewTop - 8)
	if (bottom > barTop - 8 && by > 0) {
		box.scrollBy({ top: by })
	}
}

watch(() => game.pending.value, async (p) => {
	if (p) {
		await nextTick()
		revealPending()
	}
})

/**
 * Who plays a side.
 *
 * @param {number} i side index
 * @return {string}
 */
function playerText(i) {
	const p = record.value?.players[i]
	if (!p) {
		return ''
	}
	if (p.kind === 'computer') {
		const level = {
			easy: t('quantumchess', 'Easy'),
			normal: t('quantumchess', 'Normal'),
			hard: t('quantumchess', 'Hard'),
		}[p.level] ?? ''
		return t('quantumchess', 'Computer ({level})', { level })
	}
	return game.humanSides.value.length === 1 ? t('quantumchess', 'You') : t('quantumchess', 'Player')
}

/**
 * Whether a side is out of the game.
 *
 * @param {number} i side index
 * @return {boolean}
 */
function isOut(i) {
	return Boolean(V.value?.isOut && state.value && V.value.isOut(state.value.worlds[0].b, i))
}

/**
 * The type of the piece on a square in the first world where one stands there.
 *
 * @param {number} sq square
 * @return {string}
 */
function pieceTypeAt(sq) {
	for (const { b } of state.value.worlds) {
		if (b.board[sq] >= 0) {
			return b.ty[b.board[sq]]
		}
	}
	return 'p'
}
</script>

<style lang="scss" scoped>
.qc-vgame {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	grid-template-areas:
		'top'
		'board'
		'controls'
		'hint'
		'info'
		'panel';
	gap: 8px;
	box-sizing: border-box;
	padding: 8px 4px 24px;
}

@media (min-width: 1024px) {
	.qc-vgame {
		grid-template-columns: minmax(0, 1fr) 360px;
		grid-template-rows: auto auto auto auto 1fr;
		grid-template-areas:
			'board top'
			'board info'
			'board controls'
			'board hint'
			'board panel';
		gap: 12px 20px;
		align-items: start;
		padding: 12px 20px;
	}

	// the hint belongs to the move types right above it
	.qc-vgame__hint.qc-vgame__hint--mode {
		margin-top: -4px;
	}
}

.qc-vgame__loading {
	margin: 64px auto;
}

.qc-vgame__top {
	grid-area: top;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.qc-vgame__info {
	grid-area: info;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

// the move controls: at the bottom of the screen while a tall board is scrolled on a narrow screen
.qc-vgame__controls {
	grid-area: controls;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.qc-vgame__hint--mode {
	grid-area: hint;
}

.qc-vgame__board {
	grid-area: board;
	position: relative;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 16px;
	min-width: 0;
	padding-top: 4px;
}

// the hands take room above and below the board: the drawing gives it up in height
.qc-vgame__board--hands {
	--qc-vboard-reserve: 250px;
}

// a board that fills the screen's height: room for its caption and zoom buttons above it and its legend below
.qc-vgame__board--fill {
	--qc-vboard-reserve: 200px;
}

// a slim bar (the status and the move types; the hint stays below it) that leaves the board as much of the screen
// as it can; the drawing is kept short enough to fit above it with the title (3D chess opens whole)
@media (max-width: 1023px) {
	.qc-vgame__controls {
		position: sticky;
		bottom: 0;
		z-index: 2;
		gap: 6px;
		padding: 6px 8px 8px;
		border-top: 1px solid var(--color-border);
		background: var(--color-main-background);
	}

	.qc-vgame__board {
		--qc-vboard-reserve: 232px;
		padding-top: 0;
	}

	.qc-vgame__board--hands {
		--qc-vboard-reserve: 340px;
	}

	// and the move controls, which stay at the bottom of the screen
	.qc-vgame__board--fill {
		--qc-vboard-reserve: 340px;
	}
}

.qc-vgame__drawing {
	flex: 1 0 100%;
	min-width: 0;
}

.qc-vgame__curtain {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	padding: 16px;
	background: color-mix(in srgb, var(--color-main-background) 70%, transparent);
	backdrop-filter: blur(6px);
	font-size: 18px;
	text-align: center;
}

// the hand-over prompt on a card of its own, so that the blurred board behind it reads as covered on purpose
.qc-vgame__curtain-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	max-width: 100%;
	box-sizing: border-box;
	padding: 20px 24px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	box-shadow: 0 2px 12px var(--color-box-shadow, rgb(0 0 0 / 0.15));

	p {
		margin: 0;
	}
}

.qc-vgame__panel {
	grid-area: panel;
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
}

// on a narrow screen the title is the first line, beside the navigation toggle
.qc-vgame__head {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 44px;
	padding-inline-start: 44px;

	h2 {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: 20px;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
}

.qc-vgame__rules-toggle {
	flex: none;
}

@media (min-width: 1024px) {
	.qc-vgame__head {
		padding-inline-start: 0;
	}
}

.qc-vgame__rules {
	padding: 8px 12px;
	border-radius: var(--border-radius-large);
	background: var(--color-background-dark);
	line-height: 1.45;

	ul {
		margin: 4px 0;
		padding-inline-start: 18px;
		list-style: disc;
	}

	summary {
		cursor: pointer;
		font-weight: bold;
	}
}

.qc-vgame__players {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-vgame__player {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border: 2px solid transparent;
	border-radius: var(--border-radius-large);
}

.qc-vgame__player--turn {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
}

.qc-vgame__player--out {
	opacity: 0.5;
	text-decoration: line-through;
}

.qc-vgame__player-name {
	display: flex;
	flex: 1 0 auto;
	flex-direction: column;
	min-width: 0;

	small {
		color: var(--color-text-maxcontrast);
	}
}

.qc-vgame__swatch {
	flex: none;
	box-sizing: border-box;
	width: 18px;
	height: 18px;
	border: 1px solid var(--color-text-maxcontrast);
	border-radius: 50%;
}

// a small square in the move list, so that it does not look like a radio button
.qc-vgame__swatch--small {
	width: 10px;
	height: 10px;
	border-radius: 2px;
}

.qc-vgame__budget {
	display: flex;
	flex: none;
	flex-direction: column;
	align-items: flex-end;
	gap: 2px;
}

.qc-vgame__pips {
	display: flex;
	gap: 2px;
}

// an empty pip is an outline that holds on the white card and on the highlighted card of the side to move
.qc-vgame__pip {
	box-sizing: border-box;
	width: 7px;
	height: 12px;
	border: 1px solid var(--color-text-maxcontrast);
	border-radius: 2px;
	background: var(--color-main-background);
}

.qc-vgame__pip--used {
	border-color: var(--qc-quantum, #6b3fd4);
	background: var(--qc-quantum, #6b3fd4);
}

.qc-vgame__budget-count {
	color: var(--color-text-maxcontrast);
	font-size: 11px;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

// a budget the viewer may not know: no pips, the caption "Budget hidden" beside a question mark in a dashed circle
.qc-vgame__budget--unknown {
	flex-direction: row;
	align-items: center;
	gap: 6px;

	.qc-vgame__budget-count {
		font-size: 13px;
	}
}

.qc-vgame__unknown-track {
	display: flex;
	flex: none;
	box-sizing: border-box;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	border: 1.5px dashed var(--color-text-maxcontrast);
	border-radius: 50%;
	color: var(--color-text-maxcontrast);
	font-size: 12px;
	font-weight: bold;
	line-height: 1;
}

// a long text (the multiverse's timelines) wraps instead of covering the name
.qc-vgame__side-info {
	flex: 0 1 auto;
	min-width: 0;
	padding: 0 6px;
	border: 1px solid var(--color-border-dark);
	border-radius: 10px;
	overflow-wrap: anywhere;
	background: var(--color-main-background);
	font-size: 13px;
	font-variant-numeric: tabular-nums;
}

.qc-vgame__options {
	margin: 0;
	padding: 0;
	color: var(--color-text-maxcontrast);
	list-style: none;
}

.qc-vgame__options-box summary {
	color: var(--color-text-maxcontrast);
	cursor: pointer;
}

// a sample of the hill of King of the Hill: its light and dark green, with its border
.qc-vgame__legend-swatch {
	flex: none;
	box-sizing: border-box;
	width: 14px;
	height: 14px;
	border-radius: 2px;
}

.qc-vgame__legend-swatch--hill {
	border: 1.5px solid #6b4f2c;
	background: linear-gradient(135deg, #b4d3a4 50%, #7fac75 50%);
}

// the multiverse: the gold and blue halos, a threat line and a travel arrow
.qc-vgame__legend-swatch--must {
	border: 1.5px solid #9a6b00;
	background: #e9b949;
}

.qc-vgame__legend-swatch--optional {
	border: 1.5px solid #2a7ab0;
	background: #9cc7e2;
}

.qc-vgame__legend-swatch--inactive {
	border: 1px solid #c9d0d4;
	background: repeating-linear-gradient(45deg, #c9d0d4 0 2px, #f1f3f4 2px 5px);
}

.qc-vgame__legend-swatch--threat,
.qc-vgame__legend-swatch--travel {
	width: 18px;
	height: 4px;
	border-radius: 2px;
	background: var(--qc-ring-danger, #d0263a);
}

.qc-vgame__legend-swatch--travel {
	background: #1f6fb2;
}

// several short legend items share a line
.qc-vgame__legend--items {
	flex-wrap: wrap;
	gap: 4px 14px;
}

.qc-vgame__legend-item {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.qc-vgame__legend {
	display: flex;
	flex: 1 0 100%;
	order: 2;
	align-items: center;
	justify-content: center;
	gap: 6px;
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

// a sample of the fog: the dark fog square with its hatch
.qc-vgame__fog-swatch {
	flex: none;
	width: 14px;
	height: 14px;
	border-radius: 2px;
	background:
		repeating-linear-gradient(45deg, rgb(255 255 255 / 0.3) 0 1px, transparent 1px 4px),
		#3d4652;
}

.qc-vgame__status {
	margin: 0;
	font-size: 15px;
}

.qc-vgame__compulsory {
	display: block;
	margin-top: 4px;
	font-weight: bold;
}

.qc-vgame__danger {
	display: block;
	margin-top: 4px;
	color: var(--qc-danger, #c90000);
	font-weight: bold;
}

// where the game was decided, under the result
.qc-vgame__end-note {
	display: block;
	margin-top: 4px;
}

.qc-vgame__choices {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

// the game buttons (Undo, Flip board, Resign, New game): two to a row, sharing it evenly, so none of four is left
// alone on a row of its own; three (the game over, the hand-over) share one row. A button never cuts its label (the
// longer translations): it takes the width the label needs and the row wraps.
.qc-vgame__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;

	> * {
		flex: 1 1 40%;
		min-width: max-content;
	}

	> :first-child:nth-last-child(3),
	> :first-child:nth-last-child(3) ~ * {
		flex-basis: 28%;
	}
}

// the four move types as one row: the buttons share the width, each at least as wide as its label
.qc-vgame__modes {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.qc-vgame__mode {
	display: flex;
	flex: 1 1 auto;
}

.qc-vgame__hint,
.qc-vgame__note {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

// the hands of one place: a whole line above or below the board
.qc-vgame__hands {
	display: flex;
	flex: 1 1 100%;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

// the hand of the side at the top of the board sits above it, the others below it
.qc-vgame__hands--top {
	order: -1;
}

.qc-vgame__hands--bottom {
	order: 1;
}

// the two hands of one board (bughouse) under it: a fixed half, so the layout does not change as the hands fill
.qc-vgame__hands--board {
	flex: 0 0 calc(50% - 8px);
	align-self: flex-start;
}

.qc-vgame__hand {
	--qc-hand-tile: clamp(34px, 4.2vw, 50px);
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 4px 6px;
	min-height: calc(var(--qc-hand-tile) + 8px);
}

.qc-vgame__hands--board .qc-vgame__hand {
	justify-content: flex-start;
}

.qc-vgame__hand-title {
	flex: none;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-vgame__hand-piece {
	display: flex;
	align-items: center;
	gap: 2px;
	min-height: 44px;
	margin: 0;
	padding: 1px 6px 1px 2px;
	border: 2px solid var(--color-border-dark);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	color: var(--color-main-text);
	font-weight: bold;
	font-variant-numeric: tabular-nums;
	cursor: pointer;

	&:disabled {
		cursor: default;
	}
}

.qc-vgame__hand-glyph {
	width: var(--qc-hand-tile);
	height: var(--qc-hand-tile);
}

.qc-vgame__hand-piece--on {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
}

.qc-vgame__hand-empty {
	box-sizing: border-box;
	width: var(--qc-hand-tile);
	height: var(--qc-hand-tile);
	border: 2px dashed var(--color-border-dark);
	border-radius: var(--border-radius-large);
}

.qc-vgame__box {
	padding: 8px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);

	p {
		margin: 0 0 4px;
	}
}

.qc-vgame__box-title {
	margin: 0 0 4px;
	font-size: 15px;
	font-weight: bold;
}

// the move a box asks about, first and in the move list's notation
.qc-vgame__pending-move {
	font-size: 16px;
}

.qc-vgame__box--pending {
	border-color: var(--color-primary-element);
}

.qc-vgame__box--roll {
	border-color: var(--qc-quantum, #6b3fd4);
}

.qc-vgame__box--handover {
	border-color: var(--color-primary-element);
}

.qc-vgame__box--warning {
	border-width: 2px;
	border-color: var(--qc-danger, #c90000);
}

.qc-vgame__warning {
	color: var(--qc-danger, #c90000);
}

.qc-vgame__report-line {
	margin: 0;
}

.qc-vgame__outcomes {
	margin: 0 0 8px;
	padding: 0;
	list-style: none;
}

// a warning note, as NcNoteCard draws one: the main text colour on a light tint of the warning colour (the warning
// text colour is made for the page background, and on the warning colour itself it is unreadable)
.qc-vgame__notice {
	margin: 0;
	padding: 6px 10px;
	border-inline-start: 4px solid rgb(var(--color-warning-rgb, 163, 114, 0));
	border-radius: var(--border-radius-large);
	background: rgba(var(--color-warning-rgb, 163, 114, 0), 0.1);
	color: var(--color-main-text);
}

.qc-vgame__moves {
	max-height: 220px;
	overflow-y: auto;
	font-size: 13px;
}

// scrolled: the top fades, so a half-cut first row reads as more above
.qc-vgame__moves--scrolled {
	mask-image: linear-gradient(to bottom, transparent 0, #000 22px);
}

// one numbered row per move (two players: a column per side) or per turn
.qc-vgame__move-rows {
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-vgame__move-row {
	display: grid;
	grid-template-columns: 2.6em minmax(0, 1fr);
	gap: 0 8px;
	padding: 2px 0;
	border-bottom: 1px solid var(--color-border);
}

.qc-vgame__move-rows--pairs .qc-vgame__move-row {
	grid-template-columns: 2.6em minmax(0, 1fr) minmax(0, 1fr);
}

.qc-vgame__move-number {
	color: var(--color-text-maxcontrast);
	text-align: end;
	font-variant-numeric: tabular-nums;
}

.qc-vgame__move-cell {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.qc-vgame__move-entry {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.qc-vgame__move-none {
	color: var(--color-text-maxcontrast);
}

.qc-vgame__move {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	// a code breaks between its squares (`<wbr>`), inside one only when a square alone is too long
	overflow-wrap: break-word;
}

.qc-vgame__move-line {
	color: var(--color-text-maxcontrast);
}

// the lines of a row's moves, across both columns of a two-player game
.qc-vgame__move-notes {
	display: flex;
	grid-column: 2 / -1;
	flex-direction: column;
	min-width: 0;
}

.qc-vgame__code {
	font-family: var(--font-face-monospace, monospace);
}

// a move the viewer cannot see is described in words, not written as a code
.qc-vgame__code--hidden {
	font-family: inherit;
	font-style: italic;
}

.qc-vgame__rolled {
	color: var(--color-text-maxcontrast);
}

@media (max-width: 1023px) {
	// the pending box sits in the slim bar at the bottom: compact
	.qc-vgame__box--pending {
		padding: 6px 10px;

		p {
			margin: 0 0 2px;
		}
	}
}
</style>
