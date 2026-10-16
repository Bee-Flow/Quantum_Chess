/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Live push from the server through notify_push, when the server runs it. Each event is registered with notify_push
 * once (lazily, at the first subscriber), because notify_push has no way to unregister a listener; this module keeps
 * its own handlers instead, so a view can subscribe and unsubscribe as often as it likes.
 *
 * Without notify_push nothing is ever pushed and `pushActive` stays false: the pollers then keep their quick
 * intervals.
 */

import { listen } from '@nextcloud/notify_push'
import { ref } from 'vue'

/** The event the app pushes when a game changed; its body is `{id, rev}` (absent on older servers). */
export const GAME_EVENT = 'quantumchess_game'
/** The event notify_push sends for every new notification of the user. */
export const NOTIFICATION_EVENT = 'notify_notification'

/** Push is set up: notify_push accepted a listener. */
export const pushActive = ref(false)

/**
 * @typedef {object} Channel
 * @property {string} event the notify_push event name
 * @property {Set<(body: object|null) => void>} handlers the subscribers
 * @property {boolean} registered the event is registered with notify_push
 */

/** @type {Record<string, Channel>} */
const channels = {
	game: { event: GAME_EVENT, handlers: new Set(), registered: false },
	notification: { event: NOTIFICATION_EVENT, handlers: new Set(), registered: false },
}

/**
 * Register the channel with notify_push (once).
 *
 * @param {Channel} channel the channel
 */
function register(channel) {
	if (channel.registered) {
		return
	}
	channel.registered = true
	try {
		// `listen` only says that the server offers push, not that the socket connects: push counts as active once
		// something arrives
		listen(channel.event, (name, body) => {
			pushActive.value = true
			for (const handler of [...channel.handlers]) {
				try {
					handler(body ?? null)
				} catch {
					// one failing subscriber never stops the others
				}
			}
		})
	} catch {
		// no push here: the pollers carry on alone
	}
}

/**
 * Subscribe to a channel.
 *
 * @param {Channel} channel the channel
 * @param {(body: object|null) => void} fn the handler
 * @return {() => void} unsubscribe
 */
function subscribe(channel, fn) {
	channel.handlers.add(fn)
	register(channel)
	return () => {
		channel.handlers.delete(fn)
	}
}

/**
 * Be told when a game changed. The body is `{id, rev}`, or null from an older server (then any game may have changed).
 *
 * @param {(body: {id?: number, rev?: number}|null) => void} fn the handler
 * @return {() => void} unsubscribe
 */
export function onGameUpdate(fn) {
	return subscribe(channels.game, fn)
}

/**
 * Be told when the user got a new notification.
 *
 * @param {(body: object|null) => void} fn the handler
 * @return {() => void} unsubscribe
 */
export function onNotification(fn) {
	return subscribe(channels.notification, fn)
}
