<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Dashboard;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Notification\Notifier;
use OCA\QuantumChess\Service\GameService;
use OCA\QuantumChess\Service\SettingsService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Dashboard\IAPIWidgetV2;
use OCP\Dashboard\IButtonWidget;
use OCP\Dashboard\IConditionalWidget;
use OCP\Dashboard\IIconWidget;
use OCP\Dashboard\IOptionWidget;
use OCP\Dashboard\IReloadableWidget;
use OCP\Dashboard\Model\WidgetButton;
use OCP\Dashboard\Model\WidgetItem;
use OCP\Dashboard\Model\WidgetItems;
use OCP\Dashboard\Model\WidgetOptions;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\IUserSession;

/**
 * Dashboard widget: invitations first, then the games waiting for your move (docs/SPEC.md §9.2).
 */
class GamesWidget implements IAPIWidgetV2, IIconWidget, IButtonWidget, IOptionWidget, IReloadableWidget, IConditionalWidget {
	public function __construct(
		private IL10N $l,
		private IURLGenerator $url,
		private IUserManager $userManager,
		private IUserSession $userSession,
		private GameService $games,
		private SettingsService $settings,
		private ITimeFactory $time,
	) {
	}

	public function getId(): string {
		return Application::APP_ID;
	}

	public function getTitle(): string {
		return $this->l->t('Quantum Chess');
	}

	public function getOrder(): int {
		return 30;
	}

	public function getIconClass(): string {
		return 'icon-quantumchess';
	}

	public function getIconUrl(): string {
		return $this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'app-dark.svg'));
	}

	public function getUrl(): ?string {
		return $this->appUrl('');
	}

	public function load(): void {
	}

	public function isEnabled(): bool {
		$user = $this->userSession->getUser();
		return $user !== null && $this->settings->isMultiplayerEnabledFor($user->getUID());
	}

	public function getReloadInterval(): int {
		return 60;
	}

	public function getWidgetOptions(): WidgetOptions {
		return new WidgetOptions(true);
	}

	/** @return list<WidgetButton> */
	public function getWidgetButtons(string $userId): array {
		return [
			new WidgetButton(WidgetButton::TYPE_NEW, $this->appUrl('/new'), $this->l->t('New game')),
			new WidgetButton(WidgetButton::TYPE_MORE, $this->appUrl('/'), $this->l->t('More')),
		];
	}

	private function appUrl(string $route): string {
		return $this->url->linkToRouteAbsolute('quantumchess.page.index') . ($route === '' ? '' : '#' . $route);
	}

	public function getItemsV2(string $userId, ?string $since = null, int $limit = 7): WidgetItems {
		$items = [];
		foreach ($this->games->listDashboard($userId, $limit) as $game) {
			$items[] = $this->item($game, $userId);
		}
		return new WidgetItems($items, $this->l->t('No games waiting for your move'));
	}

	private function item(Game $game, string $uid): WidgetItem {
		$other = $game->opponentOf($uid);
		$name = $other === null ? $this->l->t('Deleted user') : ($this->userManager->getDisplayName($other) ?? $other);
		$avatar = $other === null ? '' : $this->url->linkToRouteAbsolute('core.avatar.getAvatar', ['userId' => $other, 'size' => 64]);
		$link = $this->appUrl('/game/' . $game->getId());
		if ($game->getStatus() === Game::STATUS_PENDING) {
			$title = $game->getRematchOf() !== null
				? $this->l->t('%s wants a rematch', [$name])
				: $this->l->t('%s invited you', [$name]);
			$subtitle = Notifier::timeControlLabel($this->l, $game->getTimeControl()) . ' · '
				. ($game->getRatedRequested() === 1 ? $this->l->t('Rated') : $this->l->t('Unrated'));
			return new WidgetItem($title, $subtitle, $link, $avatar, (string)$game->getId());
		}
		$subtitle = $this->l->t('Move %d', [intdiv($game->getPly(), 2) + 1]);
		$deadline = $game->getDeadlineAt();
		if ($deadline !== null) {
			$left = max(0, $deadline - $this->time->getTime());
			$subtitle .= ' · ' . ($left >= 172800
				? $this->l->n('%n day left', '%n days left', intdiv($left, 86400))
				: $this->l->n('%n hour left', '%n hours left', max(1, intdiv($left, 3600))));
		}
		$overlay = $this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'overlay-king-' . ($game->colorOf($uid) === 'b' ? 'b' : 'w') . '.svg'));
		return new WidgetItem($this->l->t('Your move against %s', [$name]), $subtitle, $link, $avatar, (string)$game->getId(), $overlay);
	}
}
