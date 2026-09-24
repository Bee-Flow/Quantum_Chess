/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board themes. The ids are stored in the preferences; the labels are what the user sees. Older or unknown ids map
 * onto a shipped theme. `contrast` is not offered in the menu: it is chosen automatically under Nextcloud's
 * high-contrast themes.
 */

import { t } from '@nextcloud/l10n'

/** The selectable board themes, in menu order. */
export const BOARD_THEMES = Object.freeze(['wood', 'slate', 'quantum'])

/** The theme used when the preference names a theme that is not shipped. */
export const DEFAULT_BOARD_THEME = 'slate'

const ALIASES = Object.freeze({ classic: 'wood', blue: 'slate', nextcloud: 'slate', green: 'wood' })

/**
 * Translated label of a board theme.
 *
 * @param {string} id theme id
 * @return {string}
 */
export function boardThemeLabel(id) {
	switch (resolveBoardTheme(id)) {
		case 'wood':
			return t('quantumchess', 'Classic')
		case 'quantum':
		// TRANSLATORS: board theme with lavender squares
			return t('quantumchess', 'Quantum')
		case 'contrast':
			return t('quantumchess', 'High contrast')
		default:
			return t('quantumchess', 'Blue')
	}
}

/**
 * Whether Nextcloud's high-contrast theme is active.
 *
 * @return {boolean}
 */
export function isHighContrast() {
	if (typeof document === 'undefined' || !document.body) {
		return false
	}
	const themes = document.body.dataset?.themes ?? ''
	return themes.includes('highcontrast')
}

/**
 * The theme to draw for a preference value.
 *
 * @param {string|null|undefined} pref the `boardTheme` preference
 * @param {object} [options] options
 * @param {boolean} [options.highContrast] force the contrast theme
 * @return {string} wood | slate | quantum | contrast
 */
export function resolveBoardTheme(pref, { highContrast = false } = {}) {
	if (highContrast || pref === 'contrast') {
		return 'contrast'
	}
	const id = ALIASES[pref] ?? pref
	return BOARD_THEMES.includes(id) ? id : DEFAULT_BOARD_THEME
}
