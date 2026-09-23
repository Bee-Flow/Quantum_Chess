<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Resets everything Quantum Chess stored on a development or CI server, for end-to-end tests.
 *
 * Usage: php reset-app-data.php <nextcloud-root> [--admin-settings]
 *
 * Deletes all rows of the app's tables, every user's app settings, the app's notifications and its distributed
 * cache. With --admin-settings the app config is reset too (except the keys Nextcloud itself manages).
 * Never run this against a production server.
 */

if (PHP_SAPI !== 'cli') {
	exit(1);
}

$root = $argv[1] ?? '';
if ($root === '' || !is_file($root . '/lib/base.php')) {
	fwrite(STDERR, "Usage: php reset-app-data.php <nextcloud-root> [--admin-settings]\n");
	exit(2);
}
$resetAdminSettings = in_array('--admin-settings', $argv, true);

require_once $root . '/lib/base.php';

$appId = 'quantumchess';
$summary = [];

// Games, moves, chat and ratings (docs/SPEC.md §5)
$db = \OCP\Server::get(\OCP\IDBConnection::class);
foreach (['qchess_moves', 'qchess_chat', 'qchess_games', 'qchess_ratings'] as $table) {
	if ($db->tableExists($table)) {
		$deleted = $db->getQueryBuilder()->delete($table)->executeStatement();
		$summary[] = $table . ': ' . $deleted;
	}
}

// Every user's settings of the app (docs/SPEC.md §11.2)
if (interface_exists(\OCP\Config\IUserConfig::class)) {
	\OCP\Server::get(\OCP\Config\IUserConfig::class)->deleteApp($appId);
} else {
	\OCP\Server::get(\OCP\IConfig::class)->deleteAppFromAllUsers($appId);
}
$summary[] = 'user settings: cleared';

// Admin settings (docs/SPEC.md §11.1), keeping what Nextcloud manages
if ($resetAdminSettings) {
	$appConfig = \OCP\Server::get(\OCP\IAppConfig::class);
	$keep = ['enabled', 'installed_version', 'types', 'groups'];
	$removed = 0;
	foreach ($appConfig->getKeys($appId) as $key) {
		if (!in_array($key, $keep, true)) {
			$appConfig->deleteKey($appId, $key);
			$removed++;
		}
	}
	$summary[] = 'admin settings: ' . $removed;
}

// Notifications of the app
$notificationManager = \OCP\Server::get(\OCP\Notification\IManager::class);
$notification = $notificationManager->createNotification();
$notification->setApp($appId);
$notificationManager->markProcessed($notification);
$summary[] = 'notifications: cleared';

// Distributed cache (GameCache, AI busy flags)
$cacheFactory = \OCP\Server::get(\OCP\ICacheFactory::class);
if ($cacheFactory->isAvailable()) {
	$cacheFactory->createDistributed($appId)->clear();
	$summary[] = 'cache: cleared';
}

echo implode(', ', $summary) . "\n";
