<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Layer 5 of the board, the floating interface: the banner of the what-if view or of a read-only preview, the result
  chip of a roll, the move preview card of the hovered or pending move, the tooltip that explains a rejected move, and
  the promotion picker. Pointer presses on them do not reach the board.
-->
<template>
	<div v-if="banner" class="qc-board__banner" @pointerdown.stop>
		<FigurineText :text="banner.text" :size="16" />
		<NcButton
			v-if="banner.close"
			variant="tertiary"
			size="small"
			:aria-label="t('quantumchess', 'Close')"
			@click="banner.close">
			<template #icon>
				<NcIconSvgWrapper :path="mdiClose" :size="18" />
			</template>
		</NcButton>
	</div>
	<div
		v-if="chip"
		class="qc-board__chip"
		:class="'qc-board__chip--' + (chip.tone ?? 'neutral')"
		@pointerdown.stop="anim.dismissChip()">
		<template v-if="chip.waiting">
			<NcLoadingIcon :size="18" />
			<span>{{ t('quantumchess', 'Waiting for the server…') }}</span>
		</template>
		<template v-else>
			<span class="qc-board__chip-text">
				<span class="qc-board__chip-glyph">{{ chip.glyph }}</span>
				<FigurineText :text="chip.text" :size="17" />
			</span>
			<span v-if="chip.rarity" class="qc-board__chip-rarity">{{ chip.rarity }}</span>
			<span v-if="chip.lessonRoll" class="qc-board__chip-tag">{{ t('quantumchess', 'Lesson roll') }}</span>
		</template>
	</div>
	<div
		v-if="card"
		class="qc-board__card"
		:style="card.style"
		@pointerdown.stop>
		<MovePreview :info="card.info" @whatIf="(s) => input.setWhatIf(s)" />
	</div>
	<div
		v-if="tooltip"
		class="qc-board__tooltip"
		:style="tooltip.style"
		role="status">
		{{ tooltip.text }}
	</div>
	<PromotionPicker
		v-if="input.promotion"
		:square="input.promotion.square"
		:color="input.promotion.color"
		:orientation="geo.orientation"
		:size="geo.S"
		@pointerdown.stop
		@choose="(type) => input.choosePromotion(type)"
		@cancel="emit('promotionCancel')" />
</template>

<script setup>
import { mdiClose } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FigurineText from '../FigurineText.vue'
import MovePreview from '../MovePreview.vue'
import PromotionPicker from '../PromotionPicker.vue'
import { squareName } from '../../../engine/index.js'
import { figurine, formatProbability, TEXT } from '../../../engine/ui/index.js'
import { coarsePointer } from '../../../services/preferences.js'
import { viewsOf } from '../../boardModel.js'
import { boardPrefs } from '../../boardPreferences.js'
import { cardPlacement, tooltipPlacement } from '../../boardScene.js'
import { useBoardContext } from '../../composables/useBoardContext.js'

const props = defineProps({
	/** The board's input controller (useBoardInput) */
	input: { type: Object, required: true },
	/** The displayed position */
	state: { type: Object, required: true },
	/** Read-only view {state, kind, label}; its label shows in the banner */
	preview: { type: Object, default: null },
	/** A piece is being dragged */
	dragging: { type: Boolean, default: false },
	/** The preview follows the keyboard focus */
	keyboardPreview: { type: Boolean, default: false },
})
const emit = defineEmits(['rejected', 'previewClose', 'promotionCancel'])

const { geo, anim } = useBoardContext()
const chip = computed(() => anim.state.chip)

// The preview card of a hovered target waits a moment, so it does not flicker while the pointer crosses the board.
const cardDelayPassed = ref(false)
let cardTimer = null
watch(() => props.input.hovered, () => {
	cardDelayPassed.value = false
	clearTimeout(cardTimer)
	cardTimer = setTimeout(() => {
		cardDelayPassed.value = true
	}, 250)
})

const card = computed(() => {
	const i = props.input
	const info = i.previewInfo
	if (!info || anim.state.busy || coarsePointer.value || geo.value.S < 44 || props.dragging || i.promotion) {
		return null
	}
	const anchor = i.pending ? info.move.to[info.move.to.length - 1] ?? info.move.from[0] : (i.hovered ?? i.selection)
	if (anchor === null || anchor === undefined) {
		return null
	}
	if (!i.pending && i.mode !== 'measure' && !cardDelayPassed.value && !props.keyboardPreview) {
		return null
	}
	return { info, style: cardPlacement(anchor, geo.value) }
})

// A rejected move: for two seconds, a tooltip that says why.
const tooltip = ref(null)
let tooltipTimer = null
watch(() => props.input.feedback, (fb) => {
	if (!fb) {
		return
	}
	emit('rejected', fb)
	const sq = fb.square ?? props.input.selection
	if (sq === null || sq === undefined) {
		return
	}
	tooltip.value = { text: fb.text, style: tooltipPlacement(sq, geo.value) }
	clearTimeout(tooltipTimer)
	tooltipTimer = setTimeout(() => {
		tooltip.value = null
	}, 2000)
})

onBeforeUnmount(() => {
	clearTimeout(cardTimer)
	clearTimeout(tooltipTimer)
})

// The banner of the what-if view, or the label of a read-only preview.
const banner = computed(() => {
	const w = props.input.whatIf
	if (w !== null && !anim.state.busy) {
		const v = viewsOf(props.state).view[w]
		if (v) {
			return {
				text: t('quantumchess', 'If {piece} is on {square} ({p})… · Tab: other part · Esc', {
					piece: figurine(v.type, v.color),
					square: squareName(w),
					p: formatProbability(v.weight, { format: boardPrefs.probabilityFormat, weight: true }),
				}, undefined, TEXT),
				close: () => props.input.setWhatIf(null),
			}
		}
	}
	if (props.preview) {
		return { text: props.preview.label ?? '', close: () => emit('previewClose') }
	}
	return null
})
</script>

<style lang="scss" scoped>
.qc-board__banner {
	position: absolute;
	top: 6px;
	left: 6px;
	right: 6px;
	width: max-content;
	margin-inline: auto;
	z-index: 6;
	display: flex;
	align-items: center;
	gap: 4px;
	max-width: calc(100% - 12px);
	padding: 2px 4px 2px 12px;
	border-radius: var(--border-radius-pill, 999px);
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
	font-size: 14px;
}

.qc-board__chip {
	position: absolute;
	top: 12%;
	left: 50%;
	transform: translateX(-50%);
	z-index: 7;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	width: max-content;
	max-width: calc(100% - 16px);
	padding: 8px 14px;
	border-radius: var(--border-radius-container, 12px);
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
	border-inline-start: 4px solid var(--qc-neutral-outcome);
	font-size: 15px;
	text-align: center;
	animation: qc-chip-in 250ms var(--qc-ease-out);
	cursor: pointer;

	&--capture {
		border-inline-start-color: var(--qc-success);
	}
}

.qc-board__chip-text {
	display: inline;
}

.qc-board__chip-glyph {
	margin-inline-end: 6px;
	font-weight: 700;
}

.qc-board__chip--capture .qc-board__chip-glyph {
	color: var(--qc-success);
}

.qc-board__chip-rarity {
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.qc-board__chip-tag {
	font-size: 12px;
	padding: 0 6px;
	border-radius: var(--border-radius-pill, 999px);
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
}

.qc-board__card {
	position: absolute;
	z-index: 8;
}

.qc-board__tooltip {
	position: absolute;
	z-index: 9;
	padding: 6px 10px;
	border-radius: var(--border-radius-element, 8px);
	background: #222;
	color: #fff;
	font-size: 13px;
	text-align: center;
	pointer-events: none;
}

@keyframes qc-chip-in {
	from {
		transform: translate(-50%, -8px);
		opacity: 0;
	}

	to {
		transform: translate(-50%, 0);
		opacity: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.qc-board__chip {
		animation: none;
	}
}
</style>
