/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The chat of an online game: the messages this browser has, the unread count, sending a message or a quick phrase, and
 * muting the opponent.
 */

import { t } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import { PHRASE_KEYS } from '../chatText.js'

/**
 * @param {object} options the game
 * @param {number} options.gameId the game id
 * @param {object} options.api the HTTP client (`services/api.js`)
 * @param {string|null} options.me the viewer's user id
 * @param {import('vue').ShallowRef<object|null>} options.game the game record (its `muted` flag changes)
 * @param {{error: (text: string) => void}} options.notify shows an error
 * @return {object} {chat, unread, markChatSeen, mergeChat, replaceChat, lastChatId, sendChat, setMuted}
 */
export function useOnlineChat({ gameId, api, me, game, notify }) {
	/** The messages (ChatDTO), oldest first. */
	const chat = ref([])
	const seenChatId = ref(0)

	/** Messages of the other player that the viewer has not seen yet. */
	const unread = computed(() => chat.value.filter((m) => m.kind !== 'system' && m.userId !== me && m.id > seenChatId.value).length)

	/** Everything read. */
	function markChatSeen() {
		seenChatId.value = chat.value.reduce((max, m) => Math.max(max, m.id), seenChatId.value)
	}

	/**
	 * Merge messages from the server (by id).
	 *
	 * @param {object[]|undefined} list ChatDTO list
	 */
	function mergeChat(list) {
		if (!list?.length) {
			return
		}
		const known = new Set(chat.value.map((m) => m.id))
		const fresh = list.filter((m) => !known.has(m.id))
		if (fresh.length) {
			chat.value = [...chat.value, ...fresh].sort((a, b) => a.id - b.id)
		}
	}

	/**
	 * Take the whole chat of a freshly loaded game. On the first load everything counts as read.
	 *
	 * @param {object[]|undefined} list ChatDTO list
	 */
	function replaceChat(list) {
		chat.value = [...(list ?? [])]
		if (!seenChatId.value) {
			markChatSeen()
		}
	}

	/**
	 * The last chat id this browser has.
	 *
	 * @return {number}
	 */
	function lastChatId() {
		return chat.value.reduce((max, m) => Math.max(max, m.id), 0)
	}

	/**
	 * Send a text message or a quick phrase key.
	 *
	 * @param {string} textOrPhrase text or phrase key
	 * @return {Promise<boolean>} sent
	 */
	async function sendChat(textOrPhrase) {
		const body = PHRASE_KEYS.includes(textOrPhrase) ? { phrase: textOrPhrase } : { message: String(textOrPhrase) }
		try {
			const res = await api.sendChat(gameId, body)
			if (res?.message) {
				mergeChat([res.message])
				markChatSeen()
			}
			return true
		} catch (e) {
			notify.error(e?.message || t('quantumchess', 'The message could not be sent'))
			return false
		}
	}

	/**
	 * Mute or unmute the opponent's messages.
	 *
	 * @param {boolean} muted new state
	 */
	async function setMuted(muted) {
		try {
			const res = await api.muteChat(gameId, muted)
			game.value = { ...game.value, muted: !!res?.muted }
		} catch (e) {
			notify.error(e?.message || t('quantumchess', 'That did not work. Please try again.'))
		}
	}

	return { chat, unread, markChatSeen, mergeChat, replaceChat, lastChatId, sendChat, setMuted }
}
