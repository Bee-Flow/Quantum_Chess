<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Notification;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Db\Game;
use OCA\QuantumChess\Db\GameMapper;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\IAction;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;
use OCP\Notification\IPreloadableNotifier;
use OCP\Notification\NotificationPreloadReason;
use OCP\Notification\UnknownNotificationException;

/**
 * Renders the app's notifications in the recipient's language (docs/SPEC.md §9.1, GAME-DESIGN.md §7.12).
 */
class Notifier implements INotifier, IPreloadableNotifier {
	/** @var array<int, ?Game> */
	private array $games = [];

	public function __construct(
		private IFactory $l10nFactory,
		private IURLGenerator $url,
		private IUserManager $userManager,
		private GameMapper $gameMapper,
		private MoveDescriber $describer,
	) {
	}

	public function getID(): string {
		return Application::APP_ID;
	}

	public function getName(): string {
		return $this->l10nFactory->get(Application::APP_ID)->t('Quantum Chess');
	}

	public function preloadDataForParsing(array $notifications, string $languageCode, NotificationPreloadReason $reason): void {
		foreach ($notifications as $notification) {
			if ($notification->getApp() === Application::APP_ID && $notification->getObjectType() === 'game') {
				$this->game((int)$notification->getObjectId());
			}
		}
	}

	private function game(int $id): ?Game {
		if (!array_key_exists($id, $this->games)) {
			$this->games[$id] = $this->gameMapper->findById($id);
		}
		return $this->games[$id];
	}

	public static function timeControlLabel(IL10N $l, string $timeControl): string {
		return match ($timeControl) {
			'corr:1d' => $l->t('1 day per move'),
			'corr:7d' => $l->t('7 days per move'),
			'corr:none' => $l->t('No time limit'),
			default => $l->t('3 days per move'),
		};
	}

	public static function reasonLabel(IL10N $l, ?string $reason): string {
		return match ($reason) {
			'king_captured' => $l->t('King captured'),
			'king_trapped' => $l->t('King trapped'),
			'bare_kings' => $l->t('Only kings left'),
			'repetition' => $l->t('Repetition'),
			'fifty_moves' => $l->t('Fifty-move rule'),
			'max_ply' => $l->t('Move limit reached'),
			'no_moves' => $l->t('No moves left'),
			'resignation' => $l->t('Resignation'),
			'agreement' => $l->t('Draw agreed'),
			'timeout' => $l->t('Time ran out'),
			'timeout_draw' => $l->t('Time ran out, only a king left'),
			'abandoned' => $l->t('Abandoned'),
			'player_deleted' => $l->t('Account deleted'),
			'aborted_timeout' => $l->t('Aborted: no first move in time'),
			default => $l->t('Aborted'),
		};
	}

	public static function phraseLabel(IL10N $l, string $key): string {
		return match ($key) {
			'good_luck' => $l->t('Good luck!'),
			'nice_split' => $l->t('Nice split!'),
			'well_played' => $l->t('Well played'),
			'oops' => $l->t('Oops'),
			'thanks' => $l->t('Thanks for the game'),
			default => $l->t('Good game'),
		};
	}

	public function prepare(INotification $notification, string $languageCode): INotification {
		if ($notification->getApp() !== Application::APP_ID || $notification->getObjectType() !== 'game') {
			throw new UnknownNotificationException();
		}
		$id = (int)$notification->getObjectId();
		$game = $this->game($id);
		if ($game === null) {
			throw new AlreadyProcessedException();
		}
		$l = $this->l10nFactory->get(Application::APP_ID, $languageCode);
		$subject = $notification->getSubject();
		$params = $notification->getSubjectParameters();
		$status = $game->getStatus();

		$obsolete = match ($subject) {
			'invite', 'rematch' => $status !== Game::STATUS_PENDING,
			'draw_offer' => $status !== Game::STATUS_ACTIVE || $game->getDrawOffer() === null,
			'your_turn', 'reminder' => $status !== Game::STATUS_ACTIVE || $game->getPly() !== ($params['ply'] ?? $game->getPly()),
			default => false,
		};
		if ($obsolete) {
			throw new AlreadyProcessedException();
		}

		$actor = is_string($params['actor'] ?? null) ? $params['actor'] : null;
		$actorName = $actor === null ? $l->t('Deleted user') : ($this->userManager->getDisplayName($actor) ?? $actor);
		$rich = $actor === null ? [] : ['user' => ['type' => 'user', 'id' => $actor, 'name' => $actorName]];

		$message = '';
		switch ($subject) {
			case 'invite':
			case 'rematch':
				$text = $subject === 'invite' ? $l->t('{user} invited you to a game of Quantum Chess') : $l->t('{user} wants a rematch');
				$parts = [self::timeControlLabel($l, (string)($params['timeControl'] ?? 'corr:3d'))];
				$parts[] = !empty($params['rated']) ? $l->t('Rated') : $l->t('Casual');
				$parts[] = match ($params['color'] ?? 'r') {
					'w' => $l->t('You play White'),
					'b' => $l->t('You play Black'),
					default => $l->t('Random colours'),
				};
				$message = implode(' · ', $parts);
				if (is_string($params['message'] ?? null) && $params['message'] !== '') {
					$message .= ' · “' . $params['message'] . '”';
				}
				$this->addAction($notification, $l->t('Accept'), 'accept', $id, true);
				$this->addAction($notification, $l->t('Decline'), 'decline', $id, false);
				break;
			case 'invite_accepted':
			case 'open_joined':
				$text = $subject === 'invite_accepted' ? $l->t('{user} accepted your invitation') : $l->t('{user} joined your open challenge');
				$message = !empty($params['yourMove']) ? $l->t('It\'s your move.') : $l->t('Waiting for their first move.');
				break;
			case 'invite_declined':
				$text = $l->t('{user} declined your invitation');
				break;
			case 'your_turn':
			case 'reminder':
				$text = $l->t('Your move against {user}');
				$message = is_array($params['lastMove'] ?? null) ? $this->describer->describe($l, $params['lastMove']) : '';
				break;
			case 'draw_offer':
				$text = $l->t('{user} offers a draw');
				$message = $l->t('Move %d', [(int)($params['moveNumber'] ?? 1)]);
				$this->addAction($notification, $l->t('Accept'), 'drawAccept', $id, true);
				$this->addAction($notification, $l->t('Decline'), 'drawDecline', $id, false);
				break;
			case 'game_over':
				$text = match ($params['outcome'] ?? 'draw') {
					'win' => $l->t('You won against {user}'),
					'loss' => $l->t('You lost against {user}'),
					'aborted' => $l->t('Your game against {user} was aborted'),
					default => $l->t('Your game against {user} ended in a draw'),
				};
				$message = self::reasonLabel($l, is_string($params['reason'] ?? null) ? $params['reason'] : null);
				if (is_int($params['rating'] ?? null) && is_int($params['delta'] ?? null)) {
					$delta = $params['delta'];
					$message .= ' · ' . $l->t('Rating %1$d (%2$s)', [$params['rating'], ($delta >= 0 ? '+' : '−') . (string)abs($delta)]);
				}
				if ($actor !== null && $game->getRematchId() === null) {
					$this->addAction($notification, $l->t('Rematch'), 'rematch', $id, false);
				}
				break;
			case 'chat':
				$text = $l->t('{user} sent a message');
				if (is_string($params['phrase'] ?? null)) {
					$message = self::phraseLabel($l, $params['phrase']);
				} else {
					$message = is_string($params['excerpt'] ?? null) && $params['excerpt'] !== '' ? $params['excerpt'] : $l->t('New message');
				}
				break;
			case 'game_ended_deleted':
				$text = $l->t('Your game ended because your opponent\'s account was deleted');
				break;
			default:
				throw new UnknownNotificationException();
		}

		$notification->setRichSubject($text, $rich);
		$notification->setParsedSubject(str_replace('{user}', $actorName, $text));
		if ($message !== '') {
			$notification->setParsedMessage($message);
		}
		$notification->setLink($this->url->linkToRouteAbsolute('quantumchess.page.index') . '#/game/' . $id);
		$notification->setIcon($this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'app-dark.svg')));
		return $notification;
	}

	private function addAction(INotification $notification, string $label, string $method, int $id, bool $primary): void {
		$action = $notification->createAction();
		$action->setLabel($method)
			->setParsedLabel($label)
			->setLink($this->url->linkToOCSRouteAbsolute('quantumchess.ocs_game.' . $method, ['id' => $id]), IAction::TYPE_POST)
			->setPrimary($primary);
		$notification->addParsedAction($action);
	}
}
