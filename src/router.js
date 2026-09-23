/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Client-side routes (SPEC §14.1, hash history). Views of other packages are registered only when their file is
 * bundled (`import.meta.glob`), so a missing package never leaves a dead link; the Lab is deferred to 1.1
 * (docs/LEAN-1.0.md). `/dev/board` exists in development builds only.
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import { viewLoader } from './composables/modules.js'

const optional = [
	{ path: '/game/:id(\\d+)', name: 'online-game', view: 'OnlineGameView' },
	{ path: '/review/:source(local|online)/:id', name: 'review', view: 'ReviewView' },
	{ path: '/trainer', name: 'trainer', view: 'TrainerHomeView' },
	{ path: '/trainer/lesson/:id', name: 'lesson', view: 'LessonView' },
	{ path: '/trainer/puzzle/:id', name: 'puzzle', view: 'PuzzleView' },
	{ path: '/stats', name: 'stats', view: 'StatsView' },
	{ path: '/history', name: 'history', view: 'HistoryView' },
]

/**
 * The route table.
 *
 * @return {object[]}
 */
export function buildRoutes() {
	const routes = [
		{ path: '/', name: 'home', component: HomeView },
		{ path: '/new', name: 'new-game', component: HomeView },
		{ path: '/play/:mode(computer|ai|local)/:id?', name: 'local-game', component: () => import('./views/LocalGameView.vue') },
		{ path: '/rules', name: 'rules', component: () => import('./views/RulesView.vue') },
	]
	for (const r of optional) {
		const loader = viewLoader(r.view)
		if (loader) {
			routes.push({ path: r.path, name: r.name, component: loader })
		}
	}
	if (import.meta.env.MODE === 'development') {
		routes.push({ path: '/dev/board', name: 'dev-board', component: () => import('./components/board/dev/BoardPlayground.vue') })
	}
	routes.push({ path: '/:pathMatch(.*)*', redirect: '/' })
	return routes
}

/**
 * Create the router.
 *
 * @return {import('vue-router').Router}
 */
export function createAppRouter() {
	return createRouter({
		history: createWebHashHistory(),
		routes: buildRoutes(),
		scrollBehavior: () => ({ top: 0 }),
	})
}
