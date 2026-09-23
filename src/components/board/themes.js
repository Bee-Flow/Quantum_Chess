/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Board themes of 1.0 (docs/LEAN-1.0.md: three themes). The ids are the SPEC §11.3 names; the labels are what the
 * user sees. `contrast` is not offered: it is chosen automatically under Nextcloud's high-contrast themes.
 */

import { t } from '@nextcloud/l10n'

/** The selectable board themes, in menu order. */
export const BOARD_THEMES = Object.freeze(['wood', 'slate', 'quantum'])

/** The theme used when the preference names a theme that 1.0 does not ship (for example the SPEC default). */
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
