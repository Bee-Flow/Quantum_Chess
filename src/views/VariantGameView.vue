<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  A chess variant game on this device (route /variants/:variant/:id): the board, the players, the move modes, the roll
  preview and result, the hands of the drop variants, the move list and the rules of the variant.

  Optional variant hooks shown here: `sideInfo(state, side, viewer)` in the player rows, `infoText(record, viewer)`
  under the moves, `noteText(note)` for roll notes, `codeText(code)` for move codes, `handOrder` for the hands and
  `options[i].describe(value)` for the game's options. While a game with hidden information runs, the other sides'
  budgets, the danger line and undo are hidden, and in pass & play the mover first sees "Your move" before passing the
  device; the curtain then covers the board and the whole side panel. Split is greyed out while the budget of the
  player to move is full, and the shared rules leave castling and en passant out when the variant has neither
  (`specialMoves: false`). During the hand-over the mode tooltips, the compulsory line and the keyboard focus say
  nothing about the opponent.
-->
<template>
	<div class="qc-vgame">
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
			<div class="qc-vgame__board">
				<VariantBoard
					:variant="V"
					:state="state"
					:rotation="game.rotation.value"
					:marks="game.marks.value"
					:hidden="game.curtain.value ? allSquares : game.hidden.value"
					:viewer="game.curtain.value ? -1 : game.viewer.value"
					:focusable="focusable"
					:label="boardLabel"
					@square="game.click" />
				<div v-if="game.curtain.value" class="qc-vgame__curtain">
					<p>{{ t('quantumchess', 'Pass the device to {side}.', { side: sideName(V, state.turn) }) }}</p>
					<NcButton variant="primary" @click="game.curtain.value = false">
						{{ t('quantumchess', 'I am {side}: show my board', { side: sideName(V, state.turn) }) }}
					</NcButton>
				</div>
				<p v-if="fogLegend" class="qc-vgame__legend">
					{{ t('quantumchess', 'Fog: squares you cannot see.') }}
				</p>
			</div>

			<aside v-if="!game.curtain.value" class="qc-vgame__panel">
				<header class="qc-vgame__head">
					<h2>{{ entry?.name() }}</h2>
					<NcButton
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

				<ul v-if="gameOptions.length" class="qc-vgame__options">
					<li v-for="(line, i) in gameOptions" :key="i">
						{{ line }}
					</li>
				</ul>

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
							<span
								v-for="k in players[i].pips.limit"
								:key="k"
								class="qc-vgame__pip"
								:class="{ 'qc-vgame__pip--used': k <= players[i].pips.used }" />
						</span>
						<span
							v-else
							class="qc-vgame__budget qc-vgame__budget--unknown"
							:title="t('quantumchess', 'Quantum budget: unknown')">?</span>
					</li>
				</ul>

				<p class="qc-vgame__status" role="status" aria-live="polite">
					<template v-if="state.result">
						<strong>{{ resultText(V, state.result) }}</strong>
					</template>
					<template v-else-if="game.thinking.value">
						<NcLoadingIcon :size="16" inline /> {{
							t('quantumchess', '{side} is thinking …', { side: sideName(V, state.turn) })
						}}
					</template>
					<template v-else>
						{{ t('quantumchess', '{side} to move', { side: sideName(V, state.turn) }) }}
					</template>
					<span v-if="compulsory" class="qc-vgame__compulsory">
						{{ t('quantumchess', 'You must capture: only moves that might capture are allowed.') }}
					</span>
					<span v-if="game.danger.value > 0 && !state.result && !V.hidden" class="qc-vgame__danger">
						{{ t(
							'quantumchess',
							'Your king is in danger: {percent}',
							{ percent: percent(game.danger.value) },
						) }}
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
					class="qc-vgame__modes"
					role="group"
					:aria-label="t('quantumchess', 'Move type')">
					<!-- the reason sits on a wrapper: a disabled button shows no tooltip in every browser -->
					<span
						v-for="m in modes"
						:key="m.id"
						:title="m.blocked || undefined">
						<NcButton
							size="small"
							:variant="game.mode.value === m.id ? 'primary' : 'secondary'"
							:pressed="game.mode.value === m.id"
							:disabled="!game.isHumanTurn.value || Boolean(game.handover.value) || Boolean(m.blocked)"
							@click="game.setMode(m.id)">
							{{ m.label }}
						</NcButton>
					</span>
				</div>
				<p class="qc-vgame__hint">
					{{ modeHint }}
				</p>

				<div v-if="actions.length" class="qc-vgame__choices">
					<NcButton
						v-for="a in actions"
						:key="a.code"
						variant="primary"
						:disabled="!game.isHumanTurn.value || Boolean(game.handover.value) || !a.legal"
						@click="game.attempt(a.code)">
						{{ a.label }}
					</NcButton>
				</div>

				<section v-if="hands.length" class="qc-vgame__hands">
					<div v-for="h in hands" :key="h.side" class="qc-vgame__hand">
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
							<svg
								viewBox="-0.5 -0.5 1 1"
								width="30"
								height="30"
								aria-hidden="true">
								<VariantPiece :glyph="glyphOf(V, p.type, h.side)" :size="0.95" />
							</svg>
							<span>{{ p.min === p.max ? p.max : p.min + '–' + p.max }}</span>
						</button>
					</div>
				</section>

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
										:size="0.95" />
								</svg>
							</template>
						</NcButton>
					</div>
				</section>

				<section v-if="game.pending.value" class="qc-vgame__box qc-vgame__box--pending">
					<p>{{ t('quantumchess', 'This move is settled by a roll:') }}</p>
					<ul class="qc-vgame__outcomes">
						<li v-for="(o, i) in game.pending.value.outcomes" :key="i">
							<strong>{{ percent(o.p) }}</strong> {{ outcomeText(o.key, game.pending.value.code) }}
							<small v-for="nt in o.notes" :key="nt"> · {{ noteText(V, nt) }}</small>
						</li>
					</ul>
					<div class="qc-vgame__choices">
						<NcButton variant="primary" @click="game.confirm">
							{{ t('quantumchess', 'Play and roll') }}
						</NcButton>
						<NcButton @click="game.cancel">
							{{ t('quantumchess', 'Cancel') }}
						</NcButton>
					</div>
				</section>

				<section v-if="showRoll" class="qc-vgame__box qc-vgame__box--roll">
					<p v-if="V.umpire">
						{{ t('quantumchess', 'Result: {result}', {
							result: outcomeText(game.lastRoll.value.key, game.lastRoll.value.code),
						}) }}
					</p>
					<template v-else>
						<p>
							{{ t('quantumchess', 'Roll: {result} ({percent})', {
								result: outcomeText(game.lastRoll.value.key, game.lastRoll.value.code),
								percent: percent(game.lastRoll.value.p),
							}) }}
						</p>
						<p v-for="nt in game.lastRoll.value.notes" :key="nt" class="qc-vgame__note">
							{{ noteText(V, nt) }}
						</p>
					</template>
				</section>

				<section v-if="report.length" class="qc-vgame__box qc-vgame__box--report" aria-live="polite">
					<p v-for="(line, i) in report" :key="i" class="qc-vgame__report-line">
						{{ line }}
					</p>
				</section>

				<p v-if="noticeText" class="qc-vgame__notice" role="alert">
					{{ noticeText }}
				</p>
				<p v-if="refusedText" class="qc-vgame__hint">
					{{ refusedText }}
				</p>

				<section class="qc-vgame__moves" :aria-label="t('quantumchess', 'Moves')">
					<ol>
						<li v-for="(h, i) in historyRows" :key="i">
							<div class="qc-vgame__move">
								<span
									class="qc-vgame__swatch qc-vgame__swatch--small"
									:style="{ background: sideFill(V.sides[h.side]) }"
									aria-hidden="true" />
								<span class="qc-vgame__code">{{ h.text }}</span>
								<span v-if="h.result" class="qc-vgame__rolled">{{ h.result }}</span>
							</div>
							<small v-for="(line, k) in h.lines" :key="k" class="qc-vgame__move-line">{{ line }}</small>
						</li>
					</ol>
				</section>

				<div class="qc-vgame__actions">
					<NcButton :disabled="!game.canUndo.value" @click="game.undo">
						{{ t('quantumchess', 'Undo') }}
					</NcButton>
					<NcButton @click="game.flipped.value = !game.flipped.value">
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
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import VariantBoard from '../variantplay/components/VariantBoard.vue'
import VariantPiece from '../variantplay/components/VariantPiece.vue'
import { useVariantGame } from '../variantplay/composables/useVariantGame.js'
import { glyphOf, sideFill, typeName } from '../variantplay/glyphs.js'
import { budgetPips, recordsSince, sideInfoOf, sortHand } from '../variantplay/panel.js'
import {
	codeText,
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

const variantRules = computed(() => (V.value?.rules ? V.value.rules() : []))
const allSquares = computed(() => new Set(Array.from({ length: V.value?.topology.size ?? 0 }, (_, i) => i)))

/**
 * Whether the player to move looks at the panel: a human's turn, and not the hidden hand-over, in which the mover still
 * looks at it while the opponent is to move (nor the curtain). Only then do the mode tooltips and the compulsory line
 * speak about the side to move.
 */
const moverLooks = computed(() => Boolean(state.value && !state.value.result && game.isHumanTurn.value
	&& !game.handover.value && !game.curtain.value))

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

/** The result of the move just played, shown to the mover before the device is passed. */
const handoverResult = computed(() => {
	const h = game.handover.value
	return h ? codeText(V.value, h.code) + ' · ' + outcomeText(h.key, h.code) : ''
})

const modeHint = computed(() => {
	switch (game.mode.value) {
		case 'split':
			return t('quantumchess', 'Choose a piece, then two empty squares.')
		case 'merge':
			return t('quantumchess', 'Choose two parts of one ghost, then the square where they meet.')
		case 'measure':
			return t('quantumchess', 'Choose one of your ghosts to find out where it really is.')
		default:
			return t('quantumchess', 'Choose a piece, then its target square.')
	}
})

/** The variant's own turn actions, such as "Submit turn" in the multiverse. */
const actions = computed(() => {
	if (!V.value?.actions || !state.value || state.value.result) {
		return []
	}
	return V.value.actions(state.value).map((a) => ({ ...a, legal: isLegal(V.value, state.value, a.code) }))
})

const hands = computed(() => {
	if (!V.value || !state.value || !V.value.drops) {
		return []
	}
	return V.value.sides.map((s, side) => ({ side, pieces: sortHand(V.value, handView(state.value, side)) }))
		.filter((h) => h.pieces.length)
})

/**
 * The squares the keyboard can reach: the from squares of the moves and the marked targets, only while the player to
 * move looks at the board (never the opponent's pieces during the hidden hand-over or a computer's turn). A from
 * square the viewer cannot see is left out unless the viewer's own piece may stand there; the targets are marked from
 * the viewer's own moves (in Kriegspiel on the board as the viewer knows it, where every other square is hidden).
 */
const focusable = computed(() => {
	const out = new Set()
	if (!moverLooks.value) {
		return out
	}
	const hidden = game.hidden.value
	for (const m of game.moves.value) {
		if (m.from >= 0 && (!hidden?.has(m.from) || ownPieceMaybe(m.from))) {
			out.add(m.from)
		}
	}
	for (const [sq, list] of Object.entries(game.marks.value)) {
		if (list.includes('target')) {
			out.add(Number(sq))
		}
	}
	return out
})

/**
 * Whether the viewer's own piece may stand on a square (in some world).
 *
 * @param {number} sq square
 * @return {boolean}
 */
function ownPieceMaybe(sq) {
	const viewer = game.viewer.value
	return state.value.worlds.some(({ b }) => b.board[sq] >= 0 && b.sd[b.board[sq]] === viewer)
}

const boardLabel = computed(() => (entry.value
	? t('quantumchess', 'Board of {variant}', { variant: entry.value.name() })
	: ''))

/** Hide the last roll of the opponent in hidden-information variants (only what the umpire says is shown). */
const hideLast = computed(() => V.value?.hidden && game.lastRoll.value
	&& game.lastRoll.value.side !== game.viewer.value)

/** The roll box: not for the opponent's hidden roll, and not twice beside the "Your move" box of an umpire game. */
const showRoll = computed(() => Boolean(game.lastRoll.value && !hideLast.value
	&& !(V.value?.umpire && game.handover.value)))

const noticeText = computed(() => {
	const n = game.notice.value
	if (!n) {
		return ''
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
		default:
			return ''
	}
})

/** The codes the umpire refused this turn (Kriegspiel). */
const refusedText = computed(() => (V.value?.umpire && game.refused.value.length
	? t('quantumchess', 'Refused this turn: {moves}', { moves: game.refused.value.join(', ') })
	: ''))

/** The lines of the records since the viewer's own last move: announcements, "Blue is out", sides that sat out. */
const report = computed(() => {
	if (!V.value || !state.value) {
		return []
	}
	const viewer = game.viewer.value
	return recordsSince(state.value.history, viewer).flatMap((h) => recordLines(V.value, h, viewer))
})

const historyRows = computed(() => {
	if (!state.value) {
		return []
	}
	const viewer = game.viewer.value
	const running = !state.value.result
	return state.value.history.map((h) => {
		const secret = V.value.hidden && h.side !== viewer && running
		const lines = recordLines(V.value, h, viewer)
		let text = codeText(V.value, h.code)
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
		return { side: h.side, text, result, lines }
	}).reverse()
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
	gap: 16px;
	box-sizing: border-box;
	padding: 8px 12px 24px;
}

@media (min-width: 1024px) {
	.qc-vgame {
		grid-template-columns: minmax(0, 1fr) 340px;
		align-items: start;
		padding: 12px 20px;
	}
}

.qc-vgame__loading {
	margin: 64px auto;
}

.qc-vgame__board {
	position: relative;
	min-width: 0;
	padding-top: 8px;
}

.qc-vgame__curtain {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	background: color-mix(in srgb, var(--color-main-background) 70%, transparent);
	backdrop-filter: blur(6px);
	font-size: 18px;
	text-align: center;
}

.qc-vgame__panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
}

.qc-vgame__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-inline-start: 40px;

	h2 {
		margin: 0;
		font-size: 20px;
	}
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
	flex: 1;
	flex-direction: column;
	min-width: 0;

	small {
		color: var(--color-text-maxcontrast);
	}
}

.qc-vgame__swatch {
	flex: none;
	width: 18px;
	height: 18px;
	border: 1px solid var(--color-border-dark);
	border-radius: 50%;
}

.qc-vgame__swatch--small {
	width: 10px;
	height: 10px;
}

.qc-vgame__budget {
	display: flex;
	gap: 2px;
}

.qc-vgame__pip {
	width: 6px;
	height: 12px;
	border-radius: 2px;
	background: var(--color-border);
}

.qc-vgame__pip--used {
	background: var(--qc-quantum, #6b3fd4);
}

.qc-vgame__budget--unknown {
	color: var(--color-text-maxcontrast);
	font-weight: bold;
}

.qc-vgame__side-info {
	flex: none;
	padding: 0 6px;
	border-radius: var(--border-radius-pill);
	background: var(--color-background-dark);
	font-size: 13px;
	font-variant-numeric: tabular-nums;
}

.qc-vgame__options {
	margin: 0;
	padding: 0;
	color: var(--color-text-maxcontrast);
	list-style: none;
}

.qc-vgame__legend {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
	text-align: center;
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

.qc-vgame__modes,
.qc-vgame__choices,
.qc-vgame__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.qc-vgame__hint,
.qc-vgame__note {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-vgame__hands {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.qc-vgame__hand {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
}

.qc-vgame__hand-title {
	width: 100%;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-vgame__hand-piece {
	display: flex;
	align-items: center;
	gap: 2px;
	min-height: 36px;
	margin: 0;
	padding: 2px 6px;
	border: 2px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	cursor: pointer;
}

.qc-vgame__hand-piece--on {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
}

.qc-vgame__box {
	padding: 8px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);

	p {
		margin: 0 0 4px;
	}
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

.qc-vgame__report-line {
	margin: 0;
}

.qc-vgame__outcomes {
	margin: 0 0 8px;
	padding: 0;
	list-style: none;
}

.qc-vgame__notice {
	margin: 0;
	padding: 6px 10px;
	border-radius: var(--border-radius-large);
	background: var(--color-warning, #fff3cd);
	color: var(--color-warning-text, #000);
}

.qc-vgame__moves {
	max-height: 220px;
	overflow-y: auto;

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-direction: column;
		padding: 2px 0;
		font-size: 13px;
	}
}

.qc-vgame__move {
	display: flex;
	align-items: center;
	gap: 6px;
}

.qc-vgame__move-line {
	padding-inline-start: 16px;
	color: var(--color-text-maxcontrast);
}

.qc-vgame__code {
	font-family: var(--font-face-monospace, monospace);
}

.qc-vgame__rolled {
	color: var(--color-text-maxcontrast);
}
</style>
