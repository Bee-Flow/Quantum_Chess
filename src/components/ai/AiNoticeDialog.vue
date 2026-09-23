<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The first-use AI privacy notice (GAME-DESIGN §8.5), once per AI source; driven by useAiSources().ensureNotice. -->
<template>
	<NcDialog
		v-if="aiNotice.open"
		:name="t('quantumchess', 'Before you play with AI')"
		size="small"
		@update:open="(v) => !v && answer(false)">
		<p class="qc-ai-notice__text">
			{{ t('quantumchess', 'Your position and questions will be sent to {provider}. No names or account data are included.', { provider: aiNotice.label }) }}
		</p>
		<p v-if="aiNotice.adminNotice" class="qc-ai-notice__admin">
			{{ aiNotice.adminNotice }}
		</p>
		<template #actions>
			<NcButton @click="answer(false)">
				{{ t('quantumchess', 'Cancel') }}
			</NcButton>
			<NcButton variant="primary" data-test="ai-notice-continue" @click="answer(true)">
				{{ t('quantumchess', 'Continue') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import { aiNotice } from '../../composables/useAiSources.js'

/**
 * Answer the notice.
 *
 * @param {boolean} ok continue
 */
function answer(ok) {
	const resolve = aiNotice.resolve
	aiNotice.resolve = null
	aiNotice.open = false
	resolve?.(ok)
}
</script>

<style scoped>
.qc-ai-notice__text {
	line-height: 1.5;
}

.qc-ai-notice__admin {
	margin-top: 8px;
	color: var(--color-text-maxcontrast);
	white-space: pre-line;
}
</style>
