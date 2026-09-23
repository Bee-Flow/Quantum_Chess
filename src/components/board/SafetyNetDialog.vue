<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The king safety net (GAME-DESIGN §3.5.6): "Your king would be 25% capturable. ♔e8–d8 would make it 0%." with
  Play anyway, Show the safer move and "Don't ask again this game".
-->
<template>
	<NcDialog
		:open="net !== null"
		:name="t('quantumchess', 'Your king is at risk')"
		:buttons="buttons"
		size="small"
		@update:open="(open) => !open && answer('cancel')">
		<div v-if="net" class="qc-safety">
			<p>
				<FigurineText :text="message" :size="18" />
			</p>
			<NcCheckboxRadioSwitch v-model="dontAsk">
				{{ t('quantumchess', 'Don\'t ask again this game') }}
			</NcCheckboxRadioSwitch>
		</div>
	</NcDialog>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref, watch } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import FigurineText from './FigurineText.vue'
import { squareName, T } from '../../engine/index.js'
import { colorOfId, figurine, formatProbability, TEXT } from '../../engine/ui/index.js'

const props = defineProps({
	/** input.safetyNet: {move, risk, safer: {move, risk}} */
	net: { type: Object, default: null },
	/** State before the move (piece types) */
	state: { type: Object, required: true },
})

const emit = defineEmits(['resolve'])

const dontAsk = ref(false)
watch(() => props.net, () => {
	dontAsk.value = false
})

/**
 * Short display of a move: figurine, squares.
 *
 * @param {object} m LegalMove
 * @return {string}
 */
function short(m) {
	const fig = figurine(props.state.types[m.piece], colorOfId(m.piece))
	if (m.type === 'measure') {
		return '?' + fig + squareName(m.from[0])
	}
	return fig + m.from.map(squareName).join('|') + '–' + m.to.map(squareName).join('|')
}

const message = computed(() => {
	const n = props.net
	if (!n) {
		return ''
	}
	return t('quantumchess', 'Your king would be {risk} capturable. {move} would make it {safer}.', {
		risk: formatProbability(n.risk * T, { weight: true }),
		move: short(n.safer.move),
		safer: formatProbability(n.safer.risk * T, { weight: true }),
	}, undefined, TEXT)
})

const buttons = computed(() => [
	{ label: t('quantumchess', 'Show the safer move'), callback: () => answer('show') },
	{ label: t('quantumchess', 'Play anyway'), variant: 'primary', callback: () => answer('play') },
])

let answered = false
watch(() => props.net, () => {
	answered = false
})

/**
 * Answer once.
 *
 * @param {'play'|'show'|'cancel'} action the choice
 */
function answer(action) {
	if (answered || props.net === null) {
		return
	}
	answered = true
	emit('resolve', action, dontAsk.value)
}
</script>

<style scoped>
.qc-safety {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-bottom: 8px;
}
</style>
