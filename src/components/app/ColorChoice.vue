<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- Colour choice of the New game dialog: Random, White or Black. -->
<template>
	<fieldset class="qc-color-choice">
		<legend>{{ t('quantumchess', 'Your colour') }}</legend>
		<div class="qc-color-choice__row">
			<NcCheckboxRadioSwitch
				v-for="c in choices"
				:key="c.id"
				:modelValue="modelValue"
				type="radio"
				:name="name"
				:value="c.id"
				@update:modelValue="emit('update:modelValue', $event)">
				{{ c.label }}
			</NcCheckboxRadioSwitch>
		</div>
	</fieldset>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'

defineProps({
	/** 'r' | 'w' | 'b' */
	modelValue: { type: String, default: 'r' },
	/** Radio group name */
	name: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

const choices = [
	{ id: 'r', label: t('quantumchess', 'Random') },
	{ id: 'w', label: t('quantumchess', 'White') },
	{ id: 'b', label: t('quantumchess', 'Black') },
]
</script>

<style scoped>
.qc-color-choice {
	margin: 0;
	padding: 0;
	border: none;
}

.qc-color-choice legend {
	margin-bottom: 4px;
	font-weight: bold;
}

.qc-color-choice__row {
	display: flex;
	flex-wrap: wrap;
	gap: 0 16px;
}
</style>
