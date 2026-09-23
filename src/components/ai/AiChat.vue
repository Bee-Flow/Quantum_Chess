<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Chat with the AI opponent (GAME-DESIGN §4): the persona's comments and "Say something" (≤ 200 characters, sent
  with the next AI move). Everything is plain text.
-->
<template>
	<div class="qc-ai-chat">
		<ol ref="list" class="qc-ai-chat__list" aria-live="polite">
			<li v-if="!messages.length" class="qc-ai-chat__empty">
				{{ t('quantumchess', 'Say hello to {name}. Your message is sent with the next move.', { name }) }}
			</li>
			<li
				v-for="(m, i) in messages"
				:key="i"
				class="qc-ai-chat__message"
				:class="'qc-ai-chat__message--' + m.from">
				<span class="qc-ai-chat__who">{{ m.from === 'ai' ? name : t('quantumchess', 'You') }}</span>
				<span class="qc-ai-chat__text">{{ m.text }}</span>
			</li>
		</ol>
		<form class="qc-ai-chat__form" @submit.prevent="send">
			<NcTextField
				v-model="draft"
				:label="t('quantumchess', 'Say something')"
				:maxlength="200"
				:disabled="over" />
			<NcButton type="submit" :disabled="!draft.trim() || over" :aria-label="t('quantumchess', 'Send')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiSend" />
				</template>
			</NcButton>
		</form>
	</div>
</template>

<script setup>
import { mdiSend } from '@mdi/js'
import { t } from '@nextcloud/l10n'
import { computed, nextTick, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcTextField from '@nextcloud/vue/components/NcTextField'

const props = defineProps({
	/** Local game controller of an AI game */
	controller: { type: Object, required: true },
	/** The persona's name */
	name: { type: String, required: true },
})

const draft = ref('')
const list = ref(null)
const messages = computed(() => props.controller.chat.value ?? [])
const over = computed(() => props.controller.result.value !== null)

/** Queue the message for the next AI move. */
function send() {
	const text = draft.value.trim()
	if (text) {
		props.controller.ai.say(text)
		draft.value = ''
	}
}

watch(() => messages.value.length, async () => {
	await nextTick()
	if (list.value) {
		list.value.scrollTop = list.value.scrollHeight
	}
})
</script>

<style lang="scss" scoped>
.qc-ai-chat {
	display: flex;
	flex-direction: column;
	gap: 8px;
	height: 100%;
}

.qc-ai-chat__list {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 6px;
	max-height: 360px;
	margin: 0;
	padding: 0;
	overflow-y: auto;
	list-style: none;
}

.qc-ai-chat__empty {
	color: var(--color-text-maxcontrast);
}

.qc-ai-chat__message {
	display: flex;
	flex-direction: column;
	max-width: 85%;
	padding: 6px 10px;
	border-radius: var(--border-radius-large);
	background: var(--color-background-dark);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.qc-ai-chat__message--ai {
	align-self: flex-start;
	border: 1px solid var(--qc-ai, #7c4dff);
	background: var(--color-main-background);
}

.qc-ai-chat__message--me {
	align-self: flex-end;
	background: var(--color-primary-element-light);
}

.qc-ai-chat__who {
	color: var(--color-text-maxcontrast);
	font-size: 12px;
}

.qc-ai-chat__form {
	display: flex;
	align-items: flex-end;
	gap: 6px;
}
</style>
