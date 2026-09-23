<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Settings;

use OCA\QuantumChess\AppInfo\Application;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISettings;
use OCP\Util;

/**
 * Personal settings → Quantum Chess (docs/GAME-DESIGN.md §8.2). The Vue app loads its data from
 * `GET /api/settings/personal` and `GET /api/settings/multiplayer`.
 */
class PersonalSettings implements ISettings {
	public function getForm(): TemplateResponse {
		Util::addScript(Application::APP_ID, Application::APP_ID . '-settings-personal');
		return new TemplateResponse(Application::APP_ID, 'settings/personal', [], TemplateResponse::RENDER_AS_BLANK);
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 50;
	}
}
