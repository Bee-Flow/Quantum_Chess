<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The HTTP routes of Quantum Chess, documented in docs/development/api.md. Web routes live under
 * /index.php/apps/quantumchess/ and OCS routes (the notification actions) under /ocs/v2.php/apps/quantumchess/.
 */

$id = ['id' => '\d+'];

return [
	'routes' => [
		// Single page app (client-side routing uses the URL hash: /apps/quantumchess/#/game/42) and share links
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'page#game', 'url' => '/g/{id}', 'verb' => 'GET', 'requirements' => $id],

		// Online games: lobby and lists
		['name' => 'game#index', 'url' => '/api/games', 'verb' => 'GET'],
		['name' => 'game#summary', 'url' => '/api/games/summary', 'verb' => 'GET'],
		['name' => 'game#open', 'url' => '/api/games/open', 'verb' => 'GET'],
		['name' => 'game#history', 'url' => '/api/games/history', 'verb' => 'GET'],
		['name' => 'game#ratedCheck', 'url' => '/api/games/rated-check', 'verb' => 'GET'],
		['name' => 'game#recentOpponents', 'url' => '/api/users/recent', 'verb' => 'GET'],

		// Online games: creating, answering, playing
		['name' => 'game#create', 'url' => '/api/games', 'verb' => 'POST'],
		['name' => 'game#show', 'url' => '/api/games/{id}', 'verb' => 'GET', 'requirements' => $id],
		['name' => 'game#poll', 'url' => '/api/games/{id}/poll', 'verb' => 'GET', 'requirements' => $id],
		['name' => 'game#accept', 'url' => '/api/games/{id}/accept', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#decline', 'url' => '/api/games/{id}/decline', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#cancel', 'url' => '/api/games/{id}/cancel', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#join', 'url' => '/api/games/{id}/join', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#move', 'url' => '/api/games/{id}/moves', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#resign', 'url' => '/api/games/{id}/resign', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#abort', 'url' => '/api/games/{id}/abort', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#draw', 'url' => '/api/games/{id}/draw', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#chat', 'url' => '/api/games/{id}/chat', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'game#mute', 'url' => '/api/games/{id}/mute', 'verb' => 'PUT', 'requirements' => $id],
		['name' => 'game#rematch', 'url' => '/api/games/{id}/rematch', 'verb' => 'POST', 'requirements' => $id],

		// Statistics, leaderboard, trainer progress, preferences, personal data
		['name' => 'stats#mine', 'url' => '/api/stats', 'verb' => 'GET'],
		['name' => 'stats#leaderboard', 'url' => '/api/leaderboard', 'verb' => 'GET'],
		['name' => 'stats#recordLocal', 'url' => '/api/stats/local', 'verb' => 'POST'],
		['name' => 'stats#getProgress', 'url' => '/api/trainer/progress', 'verb' => 'GET'],
		['name' => 'stats#setProgress', 'url' => '/api/trainer/progress', 'verb' => 'PUT'],
		['name' => 'preferences#update', 'url' => '/api/settings/preferences', 'verb' => 'PUT'],

		// AI opponent and coach (LLM)
		['name' => 'ai#providers', 'url' => '/api/ai/providers', 'verb' => 'GET'],
		['name' => 'ai#models', 'url' => '/api/ai/models', 'verb' => 'GET'],
		['name' => 'ai#move', 'url' => '/api/ai/move', 'verb' => 'POST'],
		['name' => 'ai#coach', 'url' => '/api/ai/coach', 'verb' => 'POST'],
		['name' => 'ai#task', 'url' => '/api/ai/task/{taskId}', 'verb' => 'GET', 'requirements' => ['taskId' => '\d+']],
		[
			'name' => 'ai#cancelTask',
			'url' => '/api/ai/task/{taskId}',
			'verb' => 'DELETE',
			'requirements' => ['taskId' => '\d+'],
		],
		['name' => 'ai#ackNotice', 'url' => '/api/ai/notice', 'verb' => 'POST'],

		// Settings (personal, multiplayer, admin)
		['name' => 'settings#getPersonal', 'url' => '/api/settings/personal', 'verb' => 'GET'],
		['name' => 'settings#setPersonal', 'url' => '/api/settings/personal', 'verb' => 'PUT'],
		['name' => 'settings#getMultiplayer', 'url' => '/api/settings/multiplayer', 'verb' => 'GET'],
		['name' => 'settings#setMultiplayer', 'url' => '/api/settings/multiplayer', 'verb' => 'PUT'],
		['name' => 'settings#getAdmin', 'url' => '/api/settings/admin', 'verb' => 'GET'],
		['name' => 'settings#setAdmin', 'url' => '/api/settings/admin', 'verb' => 'PUT'],
		['name' => 'settings#setAdminSecret', 'url' => '/api/settings/admin/secret', 'verb' => 'PUT'],
		['name' => 'settings#test', 'url' => '/api/settings/test', 'verb' => 'POST'],
	],
	'ocs' => [
		// Notification actions (Accept/Decline/Rematch) for the web, mobile and desktop clients
		['name' => 'ocs_game#accept', 'url' => '/api/v1/games/{id}/accept', 'verb' => 'POST', 'requirements' => $id],
		['name' => 'ocs_game#decline', 'url' => '/api/v1/games/{id}/decline', 'verb' => 'POST', 'requirements' => $id],
		[
			'name' => 'ocs_game#drawAccept',
			'url' => '/api/v1/games/{id}/draw-accept',
			'verb' => 'POST',
			'requirements' => $id,
		],
		[
			'name' => 'ocs_game#drawDecline',
			'url' => '/api/v1/games/{id}/draw-decline',
			'verb' => 'POST',
			'requirements' => $id,
		],
		['name' => 'ocs_game#rematch', 'url' => '/api/v1/games/{id}/rematch', 'verb' => 'POST', 'requirements' => $id],
	],
];
