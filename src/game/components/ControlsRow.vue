<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The controls row: the move switcher with the preview text, the possibilities chip, quick toggles (flip, sound) and the
  ⋮ menu with display toggles, Settings and the game actions.
-->
<template>
	<div class="qc-controls" :class="{ 'qc-controls--compact': compact }">
		<BoardControls :input="input" :compact="compact" />
		<div class="qc-controls__right">
			<PossibilitiesChip :state="state" :input="input" :orientation="controller.orientation.value" />
			<NcButton
				v-if="!compact"
				variant="tertiary"
				:aria-label="t('quantumchess', 'Flip the board')"
				:title="t('quantumchess', 'Flip the board (F)')"
				@click="controller.flip()">
				<template #icon>
					<NcIconSvgWrapper :path="mdiSwapVertical" />
				</template>
			</NcButton>
			<NcButton
				variant="tertiary"
				:aria-label="preferences.sound ? t('quantumchess', 'Mute') : t('quantumchess', 'Unmute')"
				:title="preferences.sound ? t('quantumchess', 'Mute') : t('quantumchess', 'Unmute')"
				:pressed="!preferences.sound"
				@click="setPreference('sound', !preferences.sound)">
				<template #icon>
					<NcIconSvgWrapper :path="preferences.sound ? mdiVolumeHigh : mdiVolumeOff" />
				</template>
			</NcButton>
			<NcActions :aria-label="t('quantumchess', 'More')" forceMenu>
				<NcActionButton v-if="compact" closeAfterClick @click="controller.flip()">
					<template #icon>
						<NcIconSvgWrapper :path="mdiSwapVertical" />
					</template>
					{{ t('quantumchess', 'Flip the board') }}
				</NcActionButton>
				<NcActionCheckbox
					:modelValue="preferences.showPercentages"
					@update:modelValue="setPreference('showPercentages', $event)">
					{{ t('quantumchess', 'Percentages') }}
				</NcActionCheckbox>
				<NcActionCheckbox
					:modelValue="preferences.coordinates !== 'off'"
					@update:modelValue="setPreference('coordinates', $event ? 'inside' : 'off')">
					{{ t('quantumchess', 'Coordinates') }}
				</NcActionCheckbox>
				<NcActionCheckbox
					:modelValue="preferences.linkThreads === 'always'"
					@update:modelValue="setPreference('linkThreads', $event ? 'always' : 'selection')">
					{{ t('quantumchess', 'Always show link threads') }}
				</NcActionCheckbox>
				<NcActionButton closeAfterClick @click="emit('settings')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiCogOutline" />
					</template>
					{{ t('quantumchess', 'Settings…') }}
				</NcActionButton>
				<NcActionSeparator v-if="controller.can.value.undo || controller.can.value.resign" />
				<NcActionButton
					v-if="controller.kind !== 'online'"
					:disabled="!controller.can.value.undo"
					closeAfterClick
					:title="t('quantumchess', 'Undo takes the move back. The dice remember: the same move here gives the same result.')"
					@click="emit('undo')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiUndo" />
					</template>
					{{ t('quantumchess', 'Undo') }}
				</NcActionButton>
				<NcActionButton v-if="controller.can.value.resign" closeAfterClick @click="emit('resign')">
					<template #icon>
						<NcIconSvgWrapper :path="mdiFlagOutline" />
					</template>
					{{ t('quantumchess', 'Resign') }}
				</NcActionButton>
			</NcActions>
		</div>
	</div>
</template>

<script setup>
import { mdiCogOutline, mdiFlagOutline, mdiSwapVertical, mdiUndo, mdiVolumeHigh, mdiVolumeOff } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActionCheckbox from '@nextcloud/vue/components/NcActionCheckbox'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcActionSeparator from '@nextcloud/vue/components/NcActionSeparator'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import BoardControls from '../../board/components/BoardControls.vue'
import PossibilitiesChip from '../../board/components/PossibilitiesChip.vue'
import { preferences, setPreference } from '../../services/preferences.js'

defineProps({
	/** GameController */
	controller: { type: Object, required: true },
	/** BoardInput */
	input: { type: Object, required: true },
	/** Displayed state */
	state: { type: Object, required: true },
	/** Phone layout */
	compact: { type: Boolean, default: false },
})
const emit = defineEmits(['settings', 'undo', 'resign'])
</script>

<style lang="scss" scoped>
.qc-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 4px 8px;
	min-height: 48px;
}

.qc-controls__right {
	display: flex;
	align-items: center;
	gap: 2px;
	margin-inline-start: auto;
}
</style>
