<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- A labelled row of radio buttons for the settings dialog. -->
<template>
	<fieldset class="qc-radio-row">
		<legend>{{ label }}</legend>
		<div class="qc-radio-row__options">
			<NcCheckboxRadioSwitch
				v-for="o in options"
				:key="o.value"
				type="radio"
				:name="name"
				:value="o.value"
				:modelValue="modelValue"
				@update:modelValue="emit('update:modelValue', $event)">
				{{ o.label }}
			</NcCheckboxRadioSwitch>
		</div>
	</fieldset>
</template>

<script setup>
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'

defineProps({
	/** Legend */
	label: { type: String, required: true },
	/** Selected value */
	modelValue: { type: String, default: '' },
	/** [{value, label}] */
	options: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

const name = 'qc-radio-' + Math.random().toString(36).slice(2, 8)
</script>

<style scoped>
.qc-radio-row {
	margin: 0 0 12px;
	padding: 0;
	border: none;
}

.qc-radio-row legend {
	margin-bottom: 2px;
	font-weight: bold;
}

.qc-radio-row__options {
	display: flex;
	flex-wrap: wrap;
	gap: 0 16px;
}
</style>
