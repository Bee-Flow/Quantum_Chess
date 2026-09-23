<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The odds card (GAME-DESIGN §3.5.5): the resolution with its icon, the outcome bar of a roll, why each outcome
  happens (explainOutcome), the king risk and the What if? button. Data from preview.js (`input.previewInfo`).
-->
<template>
	<div class="qc-move-preview" :class="{ 'qc-move-preview--compact': compact }">
		<div class="qc-move-preview__header">
			<FigurineText class="qc-move-preview__title" :text="info.title" :size="18" />
			<span class="qc-move-preview__label" :class="'qc-move-preview__label--' + info.label">
				<NcIconSvgWrapper :path="icon" :size="16" />
				{{ info.labelText }}
			</span>
		</div>
		<OutcomeBar v-if="info.outcomes.length > 0" :outcomes="info.outcomes" />
		<ul class="qc-move-preview__lines">
			<li v-for="(line, i) in info.lines" :key="i" :class="'qc-move-preview__line--' + line.tone">
				<FigurineText :text="line.text" :size="15" />
			</li>
			<li v-if="info.riskText" class="qc-move-preview__line--warning">
				<NcIconSvgWrapper :path="mdiAlertOutline" :size="16" inline />
				<FigurineText :text="info.riskText" :size="15" />
			</li>
		</ul>
		<NcButton
			v-if="info.whatIf !== null && !compact"
			variant="tertiary"
			size="small"
			@click="emit('whatIf', info.whatIf)">
			{{ t('quantumchess', 'What if? (E)') }}
		</NcButton>
	</div>
</template>

<script setup>
import { mdiAlertOutline, mdiCheckCircleOutline, mdiDiceMultipleOutline, mdiLinkVariant, mdiLockOutline } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import FigurineText from './FigurineText.vue'
import OutcomeBar from './OutcomeBar.vue'

const props = defineProps({
	/** movePreview() data */
	info: { type: Object, required: true },
	/** Condensed (controls row on phones) */
	compact: { type: Boolean, default: false },
})

const emit = defineEmits(['whatIf'])

const ICONS = {
	certain: mdiCheckCircleOutline,
	quantum: mdiLinkVariant,
	roll: mdiDiceMultipleOutline,
	'roll-budget': mdiLockOutline,
}

const icon = computed(() => ICONS[props.info.label] ?? mdiDiceMultipleOutline)
</script>

<style lang="scss" scoped>
.qc-move-preview {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 260px;
	max-width: 100%;
	padding: 10px 12px;
	border-radius: var(--border-radius-container, 12px);
	background: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
	font-size: 14px;
	line-height: 1.35;

	&--compact {
		width: auto;
		box-shadow: none;
		padding: 0;
		background: transparent;
	}
}

.qc-move-preview__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-weight: 600;
}

.qc-move-preview__label {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	font-weight: 600;
	white-space: nowrap;
	color: var(--color-text-maxcontrast);

	&--quantum,
	&--roll-budget {
		color: var(--qc-quantum);
	}

	&--roll {
		color: var(--color-main-text);
	}
}

.qc-move-preview__lines {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-move-preview__line--quantum {
	color: var(--qc-quantum);
}

.qc-move-preview__line--success {
	color: var(--qc-success-strong);
}

.qc-move-preview__line--warning {
	display: flex;
	gap: 4px;
	align-items: flex-start;
	color: var(--color-warning-text, var(--qc-warning));
}
</style>
