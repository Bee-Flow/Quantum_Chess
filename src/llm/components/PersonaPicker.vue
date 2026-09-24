<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The LLM opponent options of the New game dialog: the persona, the LLM source when there is a choice, and the
  strength.
-->
<template>
	<fieldset class="qc-persona-picker__group">
		<legend>{{ t('quantumchess', 'Opponent') }}</legend>
		<div class="qc-persona-picker__personas">
			<label
				v-for="p in PERSONAS"
				:key="p.id"
				class="qc-persona-picker__persona"
				:class="{ 'qc-persona-picker__persona--active': persona === p.id }"
				:data-test="'persona-' + p.id">
				<input
					v-model="persona"
					class="hidden-visually"
					type="radio"
					name="qc-persona"
					:value="p.id">
				<PersonaAvatar :persona="p.id" expression="happy" :size="44" />
				<span>
					<strong>{{ p.name }}</strong>
					<span class="qc-persona-picker__muted">{{ p.description() }}</span>
				</span>
			</label>
		</div>
	</fieldset>
	<fieldset v-if="availableSources.length > 1" class="qc-persona-picker__group">
		<legend>{{ t('quantumchess', 'AI source') }}</legend>
		<NcCheckboxRadioSwitch
			v-for="s in availableSources"
			:key="s.id"
			v-model="source"
			type="radio"
			name="qc-source"
			:value="s.id">
			{{ s.label }}
		</NcCheckboxRadioSwitch>
	</fieldset>
	<fieldset class="qc-persona-picker__group">
		<legend>{{ t('quantumchess', 'Strength') }}</legend>
		<div class="qc-persona-picker__row">
			<NcCheckboxRadioSwitch
				v-for="s in strengths"
				:key="s.id"
				v-model="strength"
				type="radio"
				name="qc-strength"
				:value="s.id">
				{{ s.label }}
			</NcCheckboxRadioSwitch>
		</div>
	</fieldset>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import PersonaAvatar from './PersonaAvatar.vue'
import { PERSONAS } from '../personas.js'

/** Persona id */
const persona = defineModel('persona', { type: String, required: true })

/** LLM source id */
const source = defineModel('source', { type: String, required: true })

/** relaxed | balanced | sharp */
const strength = defineModel('strength', { type: String, required: true })

defineProps({
	/** The LLM sources the user may use now: `{id, label}` */
	availableSources: { type: Array, required: true },
})

const strengths = [
	{ id: 'relaxed', label: t('quantumchess', 'Relaxed') },
	{ id: 'balanced', label: t('quantumchess', 'Balanced') },
	{ id: 'sharp', label: t('quantumchess', 'Sharp') },
]
</script>

<style lang="scss" scoped>
.qc-persona-picker__group {
	display: flex;
	flex-direction: column;
	gap: 2px;
	margin: 0;
	padding: 0;
	border: none;

	legend {
		margin-bottom: 4px;
		font-weight: bold;
	}
}

.qc-persona-picker__row {
	display: flex;
	flex-wrap: wrap;
	gap: 0 16px;
}

.qc-persona-picker__personas {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 8px;
}

.qc-persona-picker__persona {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px;
	border: 2px solid var(--color-border);
	border-radius: var(--border-radius-large);
	cursor: pointer;

	> span {
		display: flex;
		flex-direction: column;
		gap: 2px;
		line-height: 1.3;
	}

	&:focus-within {
		outline: 2px solid var(--color-primary-element);
		outline-offset: 2px;
	}
}

.qc-persona-picker__persona--active {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element-light);
}

.qc-persona-picker__muted {
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}
</style>
