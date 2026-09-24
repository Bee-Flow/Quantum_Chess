<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The game panel: tabs Moves · Log · Chat · Coach (chat and coach only when their slot is given) and the game actions.
-->
<template>
	<section class="qc-panel" :class="{ 'qc-panel--fixed': fixedHeight }" :aria-label="t('quantumchess', 'Game panel')">
		<div class="qc-panel__tabs" role="tablist">
			<button
				v-for="tab in tabs"
				:id="'qc-tab-' + tab.id"
				:key="tab.id"
				type="button"
				role="tab"
				class="qc-panel__tab"
				:class="{ 'qc-panel__tab--active': active === tab.id }"
				:aria-selected="active === tab.id ? 'true' : 'false'"
				:aria-controls="'qc-tabpanel-' + tab.id"
				:tabindex="active === tab.id ? 0 : -1"
				:data-test="'tab-' + tab.id"
				@click="active = tab.id"
				@keydown.right.prevent="step(1)"
				@keydown.left.prevent="step(-1)">
				{{ tab.label }}
				<NcCounterBubble v-if="tab.count" :count="tab.count" />
			</button>
		</div>
		<div
			:id="'qc-tabpanel-' + active"
			class="qc-panel__body"
			role="tabpanel"
			:aria-labelledby="'qc-tab-' + active">
			<MoveList
				v-if="active === 'moves'"
				:moves="moves"
				:currentPly="currentPly"
				@selectPly="emit('selectPly', $event)" />
			<RollLog
				v-else-if="active === 'log'"
				:moves="moves"
				:stateAt="stateAt"
				:names="names"
				:state="state"
				@selectPly="emit('selectPly', $event)" />
			<slot v-else-if="active === 'chat'" name="chat" />
			<slot v-else-if="active === 'coach'" name="coach" />
		</div>
		<div v-if="$slots.actions" class="qc-panel__actions">
			<slot name="actions" />
		</div>
	</section>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref, useSlots, watch } from 'vue'
import NcCounterBubble from '@nextcloud/vue/components/NcCounterBubble'
import MoveList from './MoveList.vue'
import RollLog from './RollLog.vue'

const props = defineProps({
	/** MoveEntry list */
	moves: { type: Array, required: true },
	/** stateAt(n) */
	stateAt: { type: Function, required: true },
	/** Names {w, b} */
	names: { type: Object, required: true },
	/** Live state */
	state: { type: Object, required: true },
	/** Moves shown in the history view, null = live */
	currentPly: { type: Number, default: null },
	/** Unread chat messages */
	chatCount: { type: Number, default: 0 },
	/** Tablet layout: fixed-height tabs */
	fixedHeight: { type: Boolean, default: false },
	/** Tab to open first */
	initialTab: { type: String, default: 'moves' },
})
const emit = defineEmits(['selectPly'])
const slots = useSlots()

const tabs = computed(() => [
	{ id: 'moves', label: t('quantumchess', 'Moves') },
	// TRANSLATORS: tab listing every roll of the game ("roll" is a game term: see the glossary)
	{ id: 'log', label: t('quantumchess', 'Log') },
	...(slots.chat ? [{ id: 'chat', label: t('quantumchess', 'Chat'), count: props.chatCount }] : []),
	...(slots.coach ? [{ id: 'coach', label: t('quantumchess', 'Coach') }] : []),
])

const active = ref(props.initialTab)
watch(tabs, (list) => {
	if (!list.some((tab) => tab.id === active.value)) {
		active.value = 'moves'
	}
})

/**
 * Keyboard: the next or previous tab.
 *
 * @param {number} delta +1 or -1
 */
function step(delta) {
	const i = tabs.value.findIndex((tab) => tab.id === active.value)
	const next = tabs.value[(i + delta + tabs.value.length) % tabs.value.length]
	active.value = next.id
	document.getElementById('qc-tab-' + next.id)?.focus()
}

defineExpose({
	/**
	 * Open a tab.
	 *
	 * @param {string} id tab id
	 */
	open: (id) => {
		active.value = id
	},
})
</script>

<style lang="scss" scoped>
.qc-panel {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
}

.qc-panel__tabs {
	display: flex;
	gap: 2px;
	padding: 4px 4px 0;
	border-block-end: 1px solid var(--color-border);
}

.qc-panel__tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 40px;
	margin: 0 0 -1px;
	padding: 0 12px;
	border: none;
	border-block-end: 3px solid transparent;
	border-radius: var(--border-radius-small) var(--border-radius-small) 0 0;
	background: transparent;
	color: var(--color-text-maxcontrast);
	font-weight: bold;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		color: var(--color-main-text);
	}
}

.qc-panel__tab--active {
	border-block-end-color: var(--color-primary-element);
	color: var(--color-main-text);
}

.qc-panel__body {
	flex: 1 1 auto;
	min-height: 120px;
	padding: 8px;
	overflow-y: auto;
}

.qc-panel--fixed .qc-panel__body {
	height: min(420px, 45dvh);
}

.qc-panel__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	padding: 8px;
	border-block-start: 1px solid var(--color-border);
}
</style>
