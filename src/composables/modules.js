/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Optional modules of other work packages (online, trainer, coach, review), found at build time with
 * `import.meta.glob`. The shell shows a link or a section only when its module is bundled, so there are never dead
 * buttons while a package is not merged yet (docs/LEAN-1.0.md).
 */

import { defineAsyncComponent } from 'vue'

const views = import.meta.glob(['../views/*.vue', '!../views/HomeView.vue', '!../views/LocalGameView.vue', '!../views/RulesView.vue'])
const lobbyComponents = import.meta.glob('../components/lobby/*.vue')
const trainerComponents = import.meta.glob('../components/trainer/*.vue')
const coachComponents = import.meta.glob('../components/coach/*.vue')
const onlineComponents = import.meta.glob('../components/online/*.vue')

/**
 * The lazy loader of a view, or null.
 *
 * @param {string} name view name, e.g. 'OnlineGameView'
 * @return {Function|null}
 */
export function viewLoader(name) {
	return views[`../views/${name}.vue`] ?? null
}

/**
 * Whether a view is bundled.
 *
 * @param {string} name view name
 * @return {boolean}
 */
export function hasView(name) {
	return viewLoader(name) !== null
}

const GROUPS = { lobby: lobbyComponents, trainer: trainerComponents, coach: coachComponents, online: onlineComponents }

/**
 * An async component of another module, or null when it is not bundled.
 *
 * @param {'lobby'|'trainer'|'coach'|'online'} group component folder
 * @param {string} name component name
 * @return {object|null}
 */
export function optionalComponent(group, name) {
	const loader = GROUPS[group]?.[`../components/${group}/${name}.vue`]
	return loader ? defineAsyncComponent(loader) : null
}
