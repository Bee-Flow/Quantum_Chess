<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The controls under the board: the move switcher (Move, Split, Merge, Measure, with the reason when a type is not
  available), the preview text of the hovered target (the odds card condensed, for phones) and the Cancel and Play
  buttons of a move that waits for confirmation. It shares the input controller with QuantumBoard.
-->
<template>
	<div class="qc-controls" :class="{ 'qc-controls--compact': compact }">
		<NcRadioGroup
			:modelValue="input.mode"
			:label="t('quantumchess', 'Move type')"
			hideLabel
			class="qc-controls__switch"
			@update:modelValue="(m) => input.setMode(m)">
			<NcRadioGroupButton
				v-for="m in buttons"
				:key="m.value"
				:value="m.value"
				:label="compact ? undefined : m.label"
				:aria-label="m.ariaLabel"
				:title="m.title"
				:disabled="!m.enabled">
				<template #icon>
					<NcIconSvgWrapper :path="m.icon" :size="20" />
				</template>
			</NcRadioGroupButton>
		</NcRadioGroup>

		<div class="qc-controls__status" aria-live="polite">
			<template v-if="input.pending">
				<NcButton variant="tertiary" @click="input.cancel()">
					{{ t('quantumchess', 'Cancel') }}
				</NcButton>
				<NcButton variant="primary" @click="input.confirm()">
					{{ t('quantumchess', 'Play') }}
				</NcButton>
			</template>
			<span v-else-if="summary" class="qc-controls__preview">
				<FigurineText :text="summary" :size="16" />
			</span>
			<span v-else-if="hint" class="qc-controls__hint">{{ hint }}</span>
		</div>
	</div>
</template>

<script setup>
import { mdiArrowTopRight, mdiCallMerge, mdiCallSplit, mdiEyeOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcRadioGroup from '@nextcloud/vue/components/NcRadioGroup'
import NcRadioGroupButton from '@nextcloud/vue/components/NcRadioGroupButton'
import FigurineText from './FigurineText.vue'

const props = defineProps({
	/** The shared BoardInput (useBoardInput) */
	input: { type: Object, required: true },
	/** Phone layout: icons only */
	compact: { type: Boolean, default: false },
})

const buttons = computed(() => {
	const modes = props.input.modes
	const list = [
		{ value: 'move', icon: mdiArrowTopRight, label: t('quantumchess', 'Move'), key: 1 },
		// TRANSLATORS: move type that makes a piece a ghost on two squares (a game term: see the glossary)
		{ value: 'split', icon: mdiCallSplit, label: t('quantumchess', 'Split'), key: 2 },
		// TRANSLATORS: move type that joins two parts of a ghost (a game term: see the glossary)
		{ value: 'merge', icon: mdiCallMerge, label: t('quantumchess', 'Merge'), key: 3 },
		// TRANSLATORS: move type that settles where a ghost really is (a game term: see the glossary)
		{ value: 'measure', icon: mdiEyeOutline, label: t('quantumchess', 'Measure'), key: 4 },
	]
	return list.map((m) => {
		const state = modes[m.value] ?? { enabled: true, reason: null }
		return {
			...m,
			enabled: state.enabled,
			ariaLabel: m.label + ' (' + m.key + ')',
			title: state.enabled ? m.label + ' (' + m.key + ')' : state.reason,
		}
	})
})

const summary = computed(() => {
	const info = props.input.previewInfo
	if (!info) {
		return ''
	}
	const parts = [info.labelText]
	if (info.outcomes.length > 0) {
		parts.push(info.outcomes.map((o) => o.text).join(' · '))
	} else if (info.lines.length > 0) {
		parts.push(info.lines[0].text)
	}
	if (info.riskText) {
		parts.push('⚠ ' + info.riskText)
	}
	return parts.join(' · ')
})

const hint = computed(() => {
	const i = props.input
	if (!i.canInteract) {
		return ''
	}
	switch (i.mode) {
		case 'split':
			if (i.selection === null) {
				return t('quantumchess', 'Choose a knight, bishop, rook or queen to split.')
			}
			return i.splitFirst === null
				? t('quantumchess', 'Choose the first square.')
				: t('quantumchess', 'Choose the second square.')
		case 'merge':
			return i.mergeSources.length < 2
				? t('quantumchess', 'Choose two parts of a ghost.')
				: t('quantumchess', 'Choose where to merge.')
		case 'measure':
			return i.selection === null
				? t('quantumchess', 'Choose a ghost to measure.')
				: t('quantumchess', 'Click a part again to measure.')
		default:
			return ''
	}
})
</script>

<style lang="scss" scoped>
.qc-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	min-height: var(--default-clickable-area, 34px);
}

.qc-controls__switch {
	flex: none;
}

.qc-controls__status {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1 1 200px;
	min-width: 0;
	font-size: 14px;
}

.qc-controls__preview {
	overflow: hidden;
	text-overflow: ellipsis;
}

.qc-controls__hint {
	color: var(--color-text-maxcontrast);
}

.qc-controls--compact .qc-controls__status {
	flex-basis: 100%;
}
</style>
