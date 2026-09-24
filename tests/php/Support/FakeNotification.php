<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Support;

use OCP\Notification\IAction;
use OCP\Notification\INotification;

/**
 * An in-memory notification that keeps what the app sets on it, for tests of the notification service and the
 * notifier.
 */
final class FakeNotification implements INotification {
	/** @var array<string, mixed> */
	private array $f = ['app' => '', 'user' => '', 'subject' => '', 'params' => [], 'otype' => '', 'oid' => ''];
	/** @var list<IAction> the parsed actions */
	public array $actions = [];
	public function setApp(string $app): INotification {
		$this->f['app'] = $app;
		return $this;
	}
	public function getApp(): string {
		return $this->f['app'];
	}
	public function setUser(string $user): INotification {
		$this->f['user'] = $user;
		return $this;
	}
	public function getUser(): string {
		return $this->f['user'];
	}
	public function setDateTime(\DateTime $dateTime): INotification {
		return $this;
	}
	public function getDateTime(): \DateTime {
		return new \DateTime();
	}
	public function setObject(string $type, string $id): INotification {
		$this->f['otype'] = $type;
		$this->f['oid'] = $id;
		return $this;
	}
	public function getObjectType(): string {
		return $this->f['otype'];
	}
	public function getObjectId(): string {
		return $this->f['oid'];
	}
	public function setSubject(string $subject, array $parameters = []): INotification {
		$this->f['subject'] = $subject;
		$this->f['params'] = $parameters;
		return $this;
	}
	public function getSubject(): string {
		return $this->f['subject'];
	}
	public function getSubjectParameters(): array {
		return $this->f['params'];
	}
	public function setParsedSubject(string $subject): INotification {
		$this->f['parsed'] = $subject;
		return $this;
	}
	public function getParsedSubject(): string {
		return $this->f['parsed'] ?? '';
	}
	public function setRichSubject(string $subject, array $parameters = []): INotification {
		$this->f['rich'] = [$subject, $parameters];
		return $this;
	}
	public function getRichSubject(): string {
		return $this->f['rich'][0] ?? '';
	}
	public function getRichSubjectParameters(): array {
		return $this->f['rich'][1] ?? [];
	}
	public function setMessage(string $message, array $parameters = []): INotification {
		return $this;
	}
	public function getMessage(): string {
		return '';
	}
	public function getMessageParameters(): array {
		return [];
	}
	public function setParsedMessage(string $message): INotification {
		$this->f['message'] = $message;
		return $this;
	}
	public function getParsedMessage(): string {
		return $this->f['message'] ?? '';
	}
	public function setRichMessage(string $message, array $parameters = []): INotification {
		return $this;
	}
	public function getRichMessage(): string {
		return '';
	}
	public function getRichMessageParameters(): array {
		return [];
	}
	public function setLink(string $link): INotification {
		$this->f['link'] = $link;
		return $this;
	}
	public function getLink(): string {
		return $this->f['link'] ?? '';
	}
	public function setIcon(string $icon): INotification {
		return $this;
	}
	public function getIcon(): string {
		return '';
	}
	public function setPriorityNotification(bool $priorityNotification): INotification {
		return $this;
	}
	public function isPriorityNotification(): bool {
		return false;
	}
	public function createAction(): IAction {
		return new FakeAction();
	}
	public function addAction(IAction $action): INotification {
		return $this;
	}
	public function getActions(): array {
		return [];
	}
	public function addParsedAction(IAction $action): INotification {
		$this->actions[] = $action;
		return $this;
	}
	public function getParsedActions(): array {
		return $this->actions;
	}
	public function isValid(): bool {
		return true;
	}
	public function isValidParsed(): bool {
		return true;
	}
}
