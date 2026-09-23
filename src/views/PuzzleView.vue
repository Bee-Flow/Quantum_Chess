<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One puzzle (GAME-DESIGN §5.2): real rolls, grading against the verified accepted set, the refutation and the trap
  text after a wrong move, "Try again", hints (Nudge, Idea), stars and "Replay the other result"
  (route /trainer/puzzle/:id).
-->
<template>
	<NcEmptyContent
		v-if="!puzzle"
		:name="t('quantumchess', 'Puzzle not found')">
		<template #action>
			<NcButton variant="primary" to="/trainer">
				{{ t('quantumchess', 'Back to the trainer') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<div v-else class="qc-puzzle">
		<header class="qc-puzzle__header">
			<NcButton variant="tertiary" to="/trainer" :aria-label="t('quantumchess', 'Back to the trainer')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiArrowLeft" />
				</template>
			</NcButton>
			<div class="qc-puzzle__heading">
				<h2>{{ t('quantumchess', 'Puzzle {n}', { n: number }) }} · {{ puzzle.name() }}</h2>
				<p>
					<StarRating :stars="puzzle.stars" :aria-label="t('quantumchess', 'Difficulty')" />
					<span>{{ goalText }}</span>
				</p>
			</div>
		</header>

		<div class="qc-puzzle__body">
			<div class="qc-puzzle__board">
				<TrainerBoard
					v-if="playback.state.value"
					ref="board"
					:state="playback.state.value"
					:legalMoves="legalMoves"
					:interactive="phase === 'ready'"
					:orientation="puzzle.side"
					:lastMove="playback.lastMove.value"
					:arrows="arrows"
					:highlights="highlights"
					:preview="preview"
					:names="playback.names"
					@move="onMove"
					@previewClose="otherIndex = -1" />
			</div>

			<section class="qc-puzzle__card" aria-live="polite" data-test="puzzle-card">
				<p class="qc-puzzle__prompt">
					{{ puzzle.side === 'w' ? t('quantumchess', 'White to move.') : t('quantumchess', 'Black to move.') }}
					{{ goalText }}
				</p>
				<NcNoteCard
					v-if="message"
					:type="message.type"
					class="qc-puzzle__message"
					data-test="puzzle-message">
					<p>{{ message.text }}</p>
					<p v-if="message.detail" class="qc-puzzle__detail">
						{{ message.detail }}
					</p>
				</NcNoteCard>
				<p v-if="phase === 'solved'" class="qc-puzzle__solved">
					<StarRating :stars="earned" class="qc-puzzle__stars" />
				</p>
				<ul v-if="hintTexts.length" class="qc-puzzle__hints">
					<li v-for="(h, i) in hintTexts" :key="i">
						{{ h }}
					</li>
				</ul>
				<div class="qc-puzzle__actions">
					<NcButton v-if="phase === 'ready' && hintTier < 2" data-test="puzzle-hint" @click="nextHint">
						<template #icon>
							<NcIconSvgWrapper :path="mdiLightbulbOnOutline" />
						</template>
						{{ hintTier === 0 ? t('quantumchess', 'Hint') : t('quantumchess', 'Show the idea') }}
					</NcButton>
					<NcButton
						v-if="phase === 'failed'"
						variant="primary"
						data-test="try-again"
						@click="reset">
						{{ t('quantumchess', 'Try again') }}
					</NcButton>
					<NcButton v-if="phase === 'solved' && otherKeys.length" data-test="replay-other" @click="toggleOther">
						{{ otherIndex + 1 < otherKeys.length ? t('quantumchess', 'Replay the other result') : t('quantumchess', 'Back to what happened') }}
					</NcButton>
					<NcButton
						v-if="phase === 'solved' && next"
						variant="primary"
						data-test="next-puzzle"
						:to="'/trainer/puzzle/' + next.id">
						{{ t('quantumchess', 'Next puzzle') }}
					</NcButton>
					<NcButton v-if="phase === 'solved' && !next" variant="primary" to="/trainer">
						{{ t('quantumchess', 'Back to the trainer') }}
					</NcButton>
				</div>
			</section>
		</div>
	</div>
</template>

<script setup>
import { mdiArrowLeft, mdiLightbulbOnOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import StarRating from '../components/trainer/StarRating.vue'
import TrainerBoard from '../components/trainer/TrainerBoard.vue'
import { findMove, generateMoves, squareName } from '../engine/index.js'
import { outcomeLabel, resultSentence } from '../engine/ui/index.js'
import { progress, puzzleStars, recordPuzzle } from '../trainer/progress.js'
import { puzzleById, PUZZLES } from '../trainer/puzzles/index.js'
import { isAccepted, otherOutcomes, playMove, punishingOutcome, stepState, trapFor, wonBy } from '../trainer/runner.js'
import { usePlayback } from '../trainer/usePlayback.js'

const route = useRoute()
const board = ref(null)
const playback = usePlayback(board)

const puzzle = computed(() => puzzleById(String(route.params.id ?? '').toUpperCase()))
const number = computed(() => PUZZLES.indexOf(puzzle.value) + 1)
const next = computed(() => PUZZLES[number.value] ?? null)
const phase = ref('ready') // ready | busy | solved | failed
const message = ref(null)
const tries = ref(0)
const hints = ref(0)
const hintTier = ref(0)
const earned = ref(0)
const played = ref(null)
const otherIndex = ref(-1)
const start = shallowRef(null)

const goalText = computed(() => {
	switch (puzzle.value?.type) {
		case 'forced': return t('quantumchess', 'Win with certainty.')
		case 'max': return t('quantumchess', 'Find the best chance to capture the king.')
		case 'survive': return puzzle.value.side === 'b' ? t('quantumchess', 'Don\'t lose by force.') : t('quantumchess', 'Keep your king.')
		default: return t('quantumchess', 'Save as much as you can.')
	}
})

const legalMoves = computed(() => (phase.value === 'ready' && playback.state.value ? generateMoves(toRaw(playback.state.value)) : []))

/** Set up the puzzle (again). */
function reset() {
	start.value = stepState(puzzle.value, null)
	playback.set(start.value)
	phase.value = 'ready'
	message.value = null
	played.value = null
	otherIndex.value = -1
}

watch(() => route.params.id, () => {
	if (!puzzle.value) {
		return
	}
	tries.value = 0
	hints.value = 0
	hintTier.value = 0
	reset()
}, { immediate: true })

// --- Hints: Nudge (highlight + sentence) and Idea (arrow) ---
const solution = computed(() => (start.value && puzzle.value ? findMove(start.value, puzzle.value.accepted[0]) : null))
const hintTexts = computed(() => {
	const out = []
	if (hintTier.value >= 1) {
		out.push(puzzle.value.nudge())
	}
	if (hintTier.value >= 2 && solution.value) {
		out.push(t('quantumchess', 'Look at the move to {square}.', { square: solution.value.to.map(squareName).join(' / ') }))
	}
	return out
})
const highlights = computed(() => (hintTier.value >= 1 && phase.value === 'ready' && solution.value ? solution.value.from.map((square) => ({ square, kind: 'hint' })) : []))
const arrows = computed(() => (hintTier.value >= 2 && phase.value === 'ready' && solution.value ? [{ from: solution.value.from[0], to: solution.value.to[0], kind: 'best' }] : []))

/** Reveal the next hint tier. */
function nextHint() {
	hintTier.value++
	hints.value++
}

// --- Replay the other result ---
const otherKeys = computed(() => (played.value ? otherOutcomes(played.value.move, played.value.key) : []))
const preview = computed(() => {
	if (otherIndex.value < 0 || !played.value) {
		return null
	}
	const key = otherKeys.value[otherIndex.value]
	return {
		state: playMove(played.value.before, played.value.move.code, key).state,
		kind: 'history',
		label: t('quantumchess', 'The other result: {result}', { result: outcomeLabel(key) }),
	}
})

/** Cycle through the other results and back. */
function toggleOther() {
	otherIndex.value = otherIndex.value + 1 < otherKeys.value.length ? otherIndex.value + 1 : -1
}

/**
 * The player moved.
 *
 * @param {object} move LegalMove
 */
async function onMove(move) {
	if (phase.value !== 'ready') {
		return
	}
	const p = puzzle.value
	phase.value = 'busy'
	tries.value++
	const accepted = isAccepted(p, move)
	const before = toRaw(playback.state.value)
	// Rolls are real for a right move; a wrong move gets the roll that punishes it (GAME-DESIGN §5.2.1).
	const res = await playback.play(move.code, { outcome: accepted ? null : punishingOutcome(before, move.code, p.side) })
	const sentence = res.measurement ? resultSentence({ before, move: res.move, measurement: res.measurement })?.text : null
	if (accepted) {
		played.value = res.measurement ? { before, move: res.move, key: res.measurement.key } : null
		earned.value = puzzleStars(tries.value, hints.value)
		recordPuzzle(p.id, { solved: true, stars: earned.value, tries: tries.value, hints: hints.value })
		message.value = { type: 'success', text: t('quantumchess', 'Solved!') + ' ' + p.idea(), detail: sentence }
		phase.value = 'solved'
		return
	}
	recordPuzzle(p.id, { solved: Boolean(progress.puzzles?.[p.id]?.solved), tries: tries.value, hints: hints.value })
	if (!wonBy(res.after, p.side)) {
		await new Promise((resolve) => setTimeout(resolve, 350))
		await playback.engineReply(4, (s, code) => punishingOutcome(s, code, p.side))
	}
	const trap = trapFor(p, move)
	message.value = {
		type: 'error',
		text: trap ? trap.text() : (wonBy(res.after, p.side) ? t('quantumchess', 'That worked this time, but it was a gamble. There is a better move.') : t('quantumchess', 'Not the best move.')),
		detail: t('quantumchess', 'Try again.'),
	}
	phase.value = 'failed'
}
</script>

<style lang="scss" scoped>
.qc-puzzle {
	display: flex;
	flex-direction: column;
	gap: 12px;
	max-width: 1100px;
	margin: 0 auto;
	padding: 8px 16px 24px;
	box-sizing: border-box;
}

.qc-puzzle__header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding-inline-start: 36px;

	h2 {
		margin: 0;
		font-size: 1.3em;
	}

	p {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
		color: var(--color-text-maxcontrast);
	}
}

.qc-puzzle__body {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: center;
	gap: 16px 24px;
}

.qc-puzzle__board {
	flex: 1 1 360px;
	min-width: 0;
	display: flex;
	justify-content: center;
	max-width: 640px;
}

.qc-puzzle__card {
	flex: 0 1 360px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 260px;
	padding: 16px;
	border-radius: var(--border-radius-large, 10px);
	background: var(--color-main-background);
	box-shadow: 0 0 0 1px var(--color-border);

	p {
		margin: 0;
	}
}

.qc-puzzle__prompt {
	font-weight: bold;
	font-size: 1.1em;
}

.qc-puzzle__message {
	margin: 0 !important;
}

.qc-puzzle__detail {
	margin-top: 4px !important;
	color: var(--color-text-maxcontrast);
}

.qc-puzzle__stars {
	font-size: 2em;
}

.qc-puzzle__hints {
	margin: 0;
	padding-inline-start: 20px;
	list-style: disc;
	color: var(--color-text-maxcontrast);
}

.qc-puzzle__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

@media (max-width: 600px) {
	.qc-puzzle {
		padding: 4px 8px 24px;
	}

	.qc-puzzle__card {
		flex-basis: 100%;
		min-width: 0;
	}
}
</style>
