<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Support;

use OCP\Notification\IAction;

/**
 * An in-memory notification action, created by FakeNotification.
 */
final class FakeAction implements IAction {
	/** @var array<string, mixed> */
	public array $f = [];
	public function setLabel(string $label): IAction {
		$this->f['label'] = $label;
		return $this;
	}
	public function getLabel(): string {
		return $this->f['label'] ?? '';
	}
	public function setParsedLabel(string $label): IAction {
		$this->f['parsed'] = $label;
		return $this;
	}
	public function getParsedLabel(): string {
		return $this->f['parsed'] ?? '';
	}
	public function setPrimary(bool $primary): IAction {
		$this->f['primary'] = $primary;
		return $this;
	}
	public function isPrimary(): bool {
		return $this->f['primary'] ?? false;
	}
	public function setLink(string $link, string $requestType): IAction {
		$this->f['link'] = $link;
		$this->f['type'] = $requestType;
		return $this;
	}
	public function getLink(): string {
		return $this->f['link'] ?? '';
	}
	public function getRequestType(): string {
		return $this->f['type'] ?? '';
	}
	public function isValid(): bool {
		return true;
	}
	public function isValidParsed(): bool {
		return true;
	}
}
