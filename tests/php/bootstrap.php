<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Unit tests run standalone: the app code plus the OCP interfaces from the nextcloud/ocp package.
require_once __DIR__ . '/../../vendor/autoload.php';

// The nextcloud/ocp package ships the OCP sources without an autoloader: map OCP\ (and NCU\) to it so that unit
// tests can extend and mock the public API classes.
spl_autoload_register(static function (string $class): void {
	foreach (['OCP\\' => 'OCP/', 'NCU\\' => 'NCU/'] as $prefix => $dir) {
		if (str_starts_with($class, $prefix)) {
			$file = __DIR__ . '/../../vendor/nextcloud/ocp/' . $dir
				. str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
			if (is_file($file)) {
				require_once $file;
			}
			return;
		}
	}
});

if (!class_exists(\Doctrine\DBAL\ParameterType::class)) {
	require_once __DIR__ . '/stubs/doctrine-dbal.php';
}
