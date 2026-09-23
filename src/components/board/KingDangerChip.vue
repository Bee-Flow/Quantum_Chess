<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  King danger (GAME-DESIGN §3.4.5), the game's "check": "Your king can be captured · 100%" in the error colour when the
  capture is certain, a warning chip below 100 %. Nothing when the king is safe.
-->
<template>
	<NcChip
		v-if="weight > 0"
		class="qc-king-chip"
		:class="certain ? 'qc-king-chip--certain' : 'qc-king-chip--warning'"
		:text="text"
		:iconPath="mdiCrown"
		:variant="certain ? 'error' : 'warning'"
		noClose />
</template>

<script setup>
import { mdiCrown } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcChip from '@nextcloud/vue/components/NcChip'
import { T } from '../../engine/index.js'
import { formatProbability } from '../../engine/ui/index.js'

const props = defineProps({
	/** kingDanger weight 0..T */
	weight: { type: Number, required: true },
	/** The opponent's king ("King in danger") instead of your own ("Your king…") */
	opponent: { type: Boolean, default: false },
})

const certain = computed(() => props.weight >= T)
const text = computed(() => {
	const p = formatProbability(props.weight, { weight: true })
	if (!props.opponent) {
		return certain.value
			? t('quantumchess', 'Your king can be captured · {p}', { p })
			: t('quantumchess', 'Your king is in danger · {p}', { p })
	}
	return t('quantumchess', 'King in danger · {p}', { p })
})
</script>
