<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- Key moments of a review: the biggest decision errors and luck swings, each with Show. -->
<template>
	<section class="qc-moments" :aria-label="t('quantumchess', 'Key moments')">
		<h3>{{ t('quantumchess', 'Key moments') }}</h3>
		<p v-if="!moments.length" class="qc-moments__empty">
			{{ done ? t('quantumchess', 'A clean game: no big mistakes and no big swings of luck.') : t('quantumchess', 'Key moments appear when the analysis is done.') }}
		</p>
		<ol v-else class="qc-moments__list">
			<li
				v-for="m in moments"
				:key="m.ply + m.kind"
				class="qc-moments__item"
				:class="{ 'qc-moments__item--active': active === m.ply }"
				data-test="key-moment">
				<div class="qc-moments__text">
					<strong>{{ moveLabel(m) }}</strong>
					<span v-if="m.kind === 'error'">
						<QualityBadge :label="m.label" />
						{{ t('quantumchess', '{pp} % worse than {best}', { pp: Math.round(m.deltaPp), best: m.bestCode }) }}
					</span>
					<span v-else>
						{{ m.luckPp > 0
							? t('quantumchess', '🎲 A lucky roll: +{pp} % for {name}', { pp: Math.round(m.luckPp), name: names[m.color] })
							: t('quantumchess', '🎲 An unlucky roll: −{pp} % for {name}', { pp: Math.round(-m.luckPp), name: names[m.color] }) }}
					</span>
				</div>
				<NcButton size="small" @click="emit('show', m)">
					{{ t('quantumchess', 'Show') }}
				</NcButton>
			</li>
		</ol>
	</section>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import QualityBadge from '../../coach/components/QualityBadge.vue'

defineProps({
	/** keyMoments() result */
	moments: { type: Array, required: true },
	/** Player names {w, b} */
	names: { type: Object, required: true },
	/** Analysis finished */
	done: { type: Boolean, default: false },
	/** Selected moment ply */
	active: { type: Number, default: null },
})
const emit = defineEmits(['show'])

/**
 * "12. White: d4|h5-h8".
 *
 * @param {object} m moment
 * @return {string}
 */
function moveLabel(m) {
	return `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '…'} ${m.code}`
}
</script>

<style lang="scss" scoped>
.qc-moments {
	display: flex;
	flex-direction: column;
	gap: 8px;

	h3 {
		margin: 0;
		font-size: 1em;
	}
}

.qc-moments__empty {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-moments__list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-moments__item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 6px 8px;
	border-radius: var(--border-radius-small, 4px);
	background: var(--color-background-hover);

	&--active {
		box-shadow: 0 0 0 2px var(--color-primary-element);
	}
}

.qc-moments__text {
	display: flex;
	flex-direction: column;
	gap: 2px;

	span {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 0.9em;
	}
}
</style>
