/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The entry point for other features to report game events to the trainer, fire and forget. The trainer's handling
 * (`events.js`) is loaded on first use, so it stays out of the main bundle.
 */

/**
 * Report a game event to the trainer.
 *
 * @param {import('./events.js').GameEvent} event the event
 */
export function reportTrainerEvent(event) {
	import('./events.js').then((m) => m.reportGameEvent(event)).catch(() => {})
}
