<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\AppInfo;

use OCA\QuantumChess\Dashboard\GamesWidget;
use OCA\QuantumChess\Listener\UserDeletedListener;
use OCA\QuantumChess\Notification\Notifier;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\User\Events\UserDeletedEvent;

/**
 * The app's bootstrap: registers the notifier, the dashboard widget and the listener for deleted accounts.
 *
 * Services, controllers, the settings pages and the background job need no registration: the DI container autowires
 * them, and info.xml names the settings pages and the job.
 */
class Application extends App implements IBootstrap {
	public const APP_ID = 'quantumchess';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerNotifierService(Notifier::class);
		$context->registerDashboardWidget(GamesWidget::class);
		$context->registerEventListener(UserDeletedEvent::class, UserDeletedListener::class);
	}

	public function boot(IBootContext $context): void {
	}
}
