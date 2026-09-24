<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The chat of an online game: plain-text messages (never HTML), quick phrases and system lines shown in the reader's
  language, an emoji picker, and muting the opponent (muted messages collapse).
-->
<template>
	<div class="qc-chat" data-test="game-chat">
		<div class="qc-chat__head">
			<span class="qc-chat__title">{{ t('quantumchess', 'Chat with {name}', { name: opponentName }) }}</span>
			<NcButton
				v-if="controller.participant.value"
				variant="tertiary"
				size="small"
				:pressed="muted"
				:aria-label="muted ? t('quantumchess', 'Unmute {name}', { name: opponentName }) : t('quantumchess', 'Mute {name}', { name: opponentName })"
				:title="muted ? t('quantumchess', 'Unmute {name}', { name: opponentName }) : t('quantumchess', 'Mute {name}', { name: opponentName })"
				data-test="chat-mute"
				@click="controller.setMuted(!muted)">
				<template #icon>
					<NcIconSvgWrapper :path="muted ? mdiBellOffOutline : mdiBellOutline" />
				</template>
			</NcButton>
		</div>

		<ol
			ref="list"
			class="qc-chat__list"
			aria-live="polite"
			:aria-label="t('quantumchess', 'Messages')">
			<li v-if="!rows.length" class="qc-chat__empty">
				{{ t('quantumchess', 'No messages yet. Say hello!') }}
			</li>
			<li
				v-for="row in rows"
				:key="row.key"
				class="qc-chat__row"
				:class="'qc-chat__row--' + row.kind"
				:data-test="'chat-' + row.kind">
				<template v-if="row.kind === 'hidden'">
					<button type="button" class="qc-chat__hidden" @click="reveal = true">
						{{ n('quantumchess', '%n hidden message', '%n hidden messages', row.count) }}
					</button>
				</template>
				<template v-else-if="row.kind === 'system'">
					{{ row.text }}
				</template>
				<template v-else>
					<span class="qc-chat__who">{{ row.who }} · {{ row.time }}</span>
					<span class="qc-chat__text">{{ row.text }}</span>
				</template>
			</li>
		</ol>

		<template v-if="controller.can.value.chat">
			<div class="qc-chat__phrases" role="group" :aria-label="t('quantumchess', 'Quick phrases')">
				<button
					v-for="key in PHRASE_KEYS"
					:key="key"
					type="button"
					class="qc-chat__phrase"
					:data-test="'phrase-' + key"
					@click="controller.sendChat(key)">
					{{ phraseText(key) }}
				</button>
			</div>
			<form class="qc-chat__form" @submit.prevent="send">
				<NcEmojiPicker @select="addEmoji">
					<NcButton
						variant="tertiary"
						:aria-label="t('quantumchess', 'Insert emoji')"
						:title="t('quantumchess', 'Insert emoji')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiEmoticonOutline" />
						</template>
					</NcButton>
				</NcEmojiPicker>
				<NcTextField
					v-model="draft"
					class="qc-chat__input"
					:label="t('quantumchess', 'Message')"
					:maxlength="500"
					data-test="chat-input" />
				<NcButton
					type="submit"
					variant="primary"
					:disabled="!draft.trim() || sending"
					:aria-label="t('quantumchess', 'Send')"
					data-test="chat-send">
					<template #icon>
						<NcIconSvgWrapper :path="mdiSend" />
					</template>
				</NcButton>
			</form>
		</template>
		<p v-else-if="controller.participant.value && controller.game.value" class="qc-chat__closed">
			{{ t('quantumchess', 'The chat of this game is closed.') }}
		</p>
	</div>
</template>

<script setup>
import { mdiBellOffOutline, mdiBellOutline, mdiEmoticonOutline, mdiSend } from '@mdi/js'
import { n, t } from '@nextcloud/l10n'
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { otherColor } from '../../engine/index.js'
import { PHRASE_KEYS, phraseText, systemText } from '../chatText.js'

const props = defineProps({
	/** The online game controller (useOnlineGame) */
	controller: { type: Object, required: true },
})

// the emoji data is large: load the picker only when the chat is shown
const NcEmojiPicker = defineAsyncComponent(() => import('@nextcloud/vue/components/NcEmojiPicker'))

const c = props.controller
const draft = ref('')
const sending = ref(false)
const reveal = ref(false)
const list = ref(null)
const muted = computed(() => !!c.game.value?.muted)
const me = computed(() => {
	const g = c.game.value
	const color = g?.myColor
	return color ? (color === 'w' ? g.white?.userId : g.black?.userId) : null
})
const opponentName = computed(() => {
	const color = c.myColor.value
	return color ? c.names.value[otherColor(color)] : t('quantumchess', 'your opponent')
})

/**
 * A short time for a message.
 *
 * @param {number} ts Unix seconds
 * @return {string}
 */
function time(ts) {
	return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Messages as display rows; the opponent's messages collapse while muted. */
const rows = computed(() => {
	const out = []
	let hidden = 0
	const flush = () => {
		if (hidden) {
			out.push({ key: 'h' + out.length, kind: 'hidden', count: hidden })
			hidden = 0
		}
	}
	for (const m of c.chat.value) {
		if (m.kind === 'system') {
			flush()
			out.push({ key: m.id, kind: 'system', text: systemText(m, c.names.value) })
			continue
		}
		const mine = m.userId !== null && m.userId === me.value
		if (!mine && muted.value && !reveal.value) {
			hidden++
			continue
		}
		flush()
		out.push({
			key: m.id,
			kind: mine ? 'mine' : 'theirs',
			who: mine ? t('quantumchess', 'You') : (m.displayName ?? t('quantumchess', 'Deleted user')),
			time: time(m.createdAt),
			text: m.kind === 'phrase' ? phraseText(m.message) : String(m.message ?? ''),
		})
	}
	flush()
	return out
})

/** Send the draft. */
async function send() {
	const text = draft.value.trim()
	if (!text || sending.value) {
		return
	}
	sending.value = true
	try {
		if (await c.sendChat(text)) {
			draft.value = ''
		}
	} finally {
		sending.value = false
	}
}

/**
 * Insert an emoji into the draft.
 *
 * @param {string} emoji emoji
 */
function addEmoji(emoji) {
	draft.value = (draft.value + emoji).slice(0, 500)
}

/** Scroll to the newest message and mark everything read. */
async function toBottom() {
	c.markChatSeen()
	await nextTick()
	if (list.value) {
		list.value.scrollTop = list.value.scrollHeight
	}
}

watch(() => c.chat.value.length, toBottom)
watch(muted, (now) => {
	if (now) {
		reveal.value = false
	}
})
onMounted(toBottom)
</script>

<style lang="scss" scoped>
.qc-chat {
	display: flex;
	flex-direction: column;
	gap: 8px;
	height: 100%;
	min-height: 240px;
}

.qc-chat__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.qc-chat__title {
	color: var(--color-text-maxcontrast);
	font-weight: bold;
}

.qc-chat__list {
	display: flex;
	flex: 1 1 0;
	flex-direction: column;
	gap: 6px;
	min-height: 96px;
	max-height: 60dvh;
	margin: 0;
	padding: 0;
	overflow-y: auto;
	list-style: none;
}

.qc-chat__empty,
.qc-chat__closed {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-chat__row {
	display: flex;
	flex-direction: column;
	max-width: 85%;
	padding: 6px 10px;
	border-radius: var(--border-radius-large);
	background: var(--color-background-dark);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.qc-chat__row--mine {
	align-self: flex-end;
	background: var(--color-primary-element-light);
}

.qc-chat__row--theirs {
	align-self: flex-start;
}

.qc-chat__row--system,
.qc-chat__row--hidden {
	align-self: center;
	max-width: 100%;
	padding: 2px 8px;
	background: transparent;
	color: var(--color-text-maxcontrast);
	font-style: italic;
	text-align: center;
}

.qc-chat__hidden {
	margin: 0;
	padding: 2px 8px;
	border: 1px dashed var(--color-border-dark);
	border-radius: var(--border-radius-pill);
	background: transparent;
	color: var(--color-text-maxcontrast);
	font-style: italic;
	cursor: pointer;
}

.qc-chat__who {
	color: var(--color-text-maxcontrast);
	font-size: 12px;
}

.qc-chat__phrases {
	display: flex;
	margin-top: auto;
	flex-wrap: wrap;
	gap: 4px;
}

.qc-chat__phrase {
	min-height: 32px;
	margin: 0;
	padding: 2px 10px;
	border: 1px solid var(--color-border-dark);
	border-radius: var(--border-radius-pill);
	background: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 13px;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		border-color: var(--color-primary-element);
		background: var(--color-background-hover);
	}
}

.qc-chat__form {
	display: flex;
	align-items: flex-end;
	gap: 4px;
}

.qc-chat__input {
	flex: 1 1 auto;
}
</style>
