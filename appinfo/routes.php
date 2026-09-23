<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

return [
	'routes' => [
		// Single page app (client side routing uses the URL hash: /apps/quantumchess/#/game/42)
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

		// Online multiplayer games
		['name' => 'game#index', 'url' => '/api/games', 'verb' => 'GET'],
		['name' => 'game#create', 'url' => '/api/games', 'verb' => 'POST'],
		['name' => 'game#open', 'url' => '/api/games/open', 'verb' => 'GET'],
		['name' => 'game#show', 'url' => '/api/games/{id}', 'verb' => 'GET', 'requirements' => ['id' => '\d+']],
		['name' => 'game#poll', 'url' => '/api/games/{id}/poll', 'verb' => 'GET', 'requirements' => ['id' => '\d+']],
		['name' => 'game#accept', 'url' => '/api/games/{id}/accept', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#decline', 'url' => '/api/games/{id}/decline', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#cancel', 'url' => '/api/games/{id}/cancel', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#join', 'url' => '/api/games/{id}/join', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#move', 'url' => '/api/games/{id}/moves', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#resign', 'url' => '/api/games/{id}/resign', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#draw', 'url' => '/api/games/{id}/draw', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#chat', 'url' => '/api/games/{id}/chat', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],
		['name' => 'game#rematch', 'url' => '/api/games/{id}/rematch', 'verb' => 'POST', 'requirements' => ['id' => '\d+']],

		// Statistics, ratings and trainer progress
		['name' => 'stats#mine', 'url' => '/api/stats', 'verb' => 'GET'],
		['name' => 'stats#leaderboard', 'url' => '/api/leaderboard', 'verb' => 'GET'],
		['name' => 'stats#recordLocal', 'url' => '/api/stats/local', 'verb' => 'POST'],
		['name' => 'stats#getProgress', 'url' => '/api/trainer/progress', 'verb' => 'GET'],
		['name' => 'stats#setProgress', 'url' => '/api/trainer/progress', 'verb' => 'PUT'],

		// AI (LLM) opponent and coach
		['name' => 'ai#providers', 'url' => '/api/ai/providers', 'verb' => 'GET'],
		['name' => 'ai#models', 'url' => '/api/ai/models', 'verb' => 'GET'],
		['name' => 'ai#move', 'url' => '/api/ai/move', 'verb' => 'POST'],
		['name' => 'ai#coach', 'url' => '/api/ai/coach', 'verb' => 'POST'],
		['name' => 'ai#task', 'url' => '/api/ai/task/{taskId}', 'verb' => 'GET', 'requirements' => ['taskId' => '\d+']],

		// Settings
		['name' => 'settings#getPersonal', 'url' => '/api/settings/personal', 'verb' => 'GET'],
		['name' => 'settings#setPersonal', 'url' => '/api/settings/personal', 'verb' => 'PUT'],
		['name' => 'settings#getAdmin', 'url' => '/api/settings/admin', 'verb' => 'GET'],
		['name' => 'settings#setAdmin', 'url' => '/api/settings/admin', 'verb' => 'PUT'],
		['name' => 'settings#test', 'url' => '/api/settings/test', 'verb' => 'POST'],
		['name' => 'settings#setPreferences', 'url' => '/api/settings/preferences', 'verb' => 'PUT'],
	],
];
