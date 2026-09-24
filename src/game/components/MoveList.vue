<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The move list: number | White | Black, the current ply highlighted, a click opens that move in the history view.
  Footer: Copy move codes.
-->
<template>
	<div class="qc-moves">
		<p v-if="!moves.length" class="qc-moves__empty">
			{{ t('quantumchess', 'No moves yet.') }}
		</p>
		<table v-else class="qc-moves__table">
			<caption class="hidden-visually">
				{{ t('quantumchess', 'Moves') }}
			</caption>
			<thead class="hidden-visually">
				<tr>
					<th scope="col">
						{{ t('quantumchess', 'Move') }}
					</th>
					<th scope="col">
						{{ t('quantumchess', 'White') }}
					</th>
					<th scope="col">
						{{ t('quantumchess', 'Black') }}
					</th>
				</tr>
			</thead>
			<tbody ref="body">
				<tr v-for="row in rows" :key="row.number">
					<th scope="row" class="qc-moves__number">
						{{ row.number }}.
					</th>
					<td v-for="side in ['w', 'b']" :key="side" class="qc-moves__cell">
						<button
							v-if="row[side]"
							type="button"
							class="qc-moves__move"
							:class="{ 'qc-moves__move--current': isCurrent(row[side].index) }"
							:aria-current="isCurrent(row[side].index) ? 'step' : undefined"
							@click="emit('selectPly', row[side].index + 1)">
							<NotationText :notation="row[side].entry.notation" :color="row[side].entry.color" />
							<span
								v-if="row[side].entry.by === 'ai-fallback'"
								class="qc-moves__badge"
								:title="t('quantumchess', 'The built-in engine chose this move')">⚙</span>
						</button>
					</td>
				</tr>
			</tbody>
		</table>
		<div v-if="moves.length" class="qc-moves__footer">
			<NcButton variant="tertiary" size="small" @click="copyCodes">
				<template #icon>
					<NcIconSvgWrapper :path="copied ? mdiCheck : mdiContentCopy" :size="18" />
				</template>
				{{ copied ? t('quantumchess', 'Copied') : t('quantumchess', 'Copy move codes') }}
			</NcButton>
		</div>
	</div>
</template>

<script setup>
import { mdiCheck, mdiContentCopy } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, nextTick, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NotationText from '../../board/components/NotationText.vue'
import { moveRows } from '../moveRows.js'

const props = defineProps({
	/** MoveEntry list */
	moves: { type: Array, required: true },
	/** Number of moves shown in the history view, null = live */
	currentPly: { type: Number, default: null },
})
const emit = defineEmits(['selectPly'])

const rows = computed(() => moveRows(props.moves))
const body = ref(null)
const copied = ref(false)

/**
 * Whether a move is the one shown.
 *
 * @param {number} index move index
 * @return {boolean}
 */
function isCurrent(index) {
	return props.currentPly === null ? index === props.moves.length - 1 : index === props.currentPly - 1
}

/** Copy the canonical codes. */
async function copyCodes() {
	const text = props.moves.map((m) => m.code + (m.measurement ? '@' + m.measurement.key : '')).join(' ')
	try {
		await navigator.clipboard.writeText(text)
		copied.value = true
		setTimeout(() => {
			copied.value = false
		}, 2000)
	} catch {
		// clipboard unavailable (plain HTTP): nothing to do
	}
}

/**
 * Keep the newest row visible inside the list's own scroll box (the panel body on desktop, the list in the review).
 * Never scroll the page: on phones the list grows below the board in the page scroller, and scrolling that one would
 * push the board off-screen after every move.
 *
 * @param {HTMLElement} row the row to reveal
 */
function revealInOwnBox(row) {
	for (let box = row.parentElement; box && box !== document.body; box = box.parentElement) {
		const overflow = getComputedStyle(box).overflowY
		if (overflow !== 'auto' && overflow !== 'scroll') {
			continue
		}
		if (box.id === 'app-content-vue' || box === document.scrollingElement || box.scrollHeight <= box.clientHeight) {
			return
		}
		const r = row.getBoundingClientRect()
		const b = box.getBoundingClientRect()
		if (r.bottom > b.bottom) {
			box.scrollTop += r.bottom - b.bottom
		} else if (r.top < b.top) {
			box.scrollTop -= b.top - r.top
		}
		return
	}
}

watch(() => props.moves.length, async () => {
	await nextTick()
	const last = body.value?.lastElementChild
	if (last) {
		revealInOwnBox(last)
	}
})
</script>

<style lang="scss" scoped>
.qc-moves__empty {
	padding: 12px;
	color: var(--color-text-maxcontrast);
}

.qc-moves__table {
	width: 100%;
	border-collapse: collapse;
}

.qc-moves__number {
	width: 3.5ch;
	padding-inline: 4px;
	color: var(--color-text-maxcontrast);
	font-weight: normal;
	text-align: end;
	vertical-align: middle;
}

.qc-moves__cell {
	width: 50%;
	padding: 1px 2px;
}

.qc-moves__move {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	min-height: 28px;
	margin: 0;
	padding: 2px 6px;
	border: none;
	border-inline-start: 3px solid transparent;
	border-radius: var(--border-radius-small);
	background: transparent;
	color: var(--color-main-text);
	font-weight: normal;
	text-align: start;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background: var(--color-background-hover);
	}
}

.qc-moves__move--current {
	border-inline-start-color: var(--qc-accent, var(--color-primary-element));
	background: var(--qc-accent-soft, var(--color-primary-element-light));
}

.qc-moves__badge {
	color: var(--color-text-maxcontrast);
	font-size: 12px;
}

.qc-moves__footer {
	display: flex;
	justify-content: flex-end;
	padding-top: 8px;
}
</style>
