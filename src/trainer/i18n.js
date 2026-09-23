/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The translation function of the trainer data modules (SPEC §2.1). Lesson and puzzle texts are thunks, so a module
 * can be imported without a translation catalogue (tests) and texts are translated when they are shown.
 */

export { n, t } from '@nextcloud/l10n'
