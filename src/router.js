/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Client-side routes. The app uses hash history (`/apps/quantumchess/#/game/42`), so the server serves one page for
 * every route. Home is part of the main bundle; every other view is loaded lazily in its own chunk.
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

/**
 * The route table. `new-game` renders Home with the New game dialog on top (see `App.vue`); unknown paths go home.
 *
 * @return {import('vue-router').RouteRecordRaw[]}
 */
export function buildRoutes() {
	return [
		{ path: '/', name: 'home', component: HomeView },
		{ path: '/new', name: 'new-game', component: HomeView },
		{
			path: '/play/:mode(computer|ai|local)/:id?',
			name: 'local-game',
			component: () => import('./views/LocalGameView.vue'),
		},
		{ path: '/rules', name: 'rules', component: () => import('./views/RulesView.vue') },
		{ path: '/variants', name: 'variants', component: () => import('./views/VariantsView.vue') },
		{
			path: '/variants/:variant/:id',
			name: 'variant-game',
			component: () => import('./views/VariantGameView.vue'),
		},
		{ path: '/game/:id(\\d+)', name: 'online-game', component: () => import('./views/OnlineGameView.vue') },
		{
			path: '/review/:source(local|online)/:id',
			name: 'review',
			component: () => import('./views/ReviewView.vue'),
		},
		{ path: '/trainer', name: 'trainer', component: () => import('./views/TrainerHomeView.vue') },
		{ path: '/trainer/lesson/:id', name: 'lesson', component: () => import('./views/LessonView.vue') },
		{ path: '/trainer/puzzle/:id', name: 'puzzle', component: () => import('./views/PuzzleView.vue') },
		{ path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
		{ path: '/:pathMatch(.*)*', redirect: '/' },
	]
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
