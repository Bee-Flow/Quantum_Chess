<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai;

use OCA\QuantumChess\Service\Ai\KeyStore;
use OCA\QuantumChess\Tests\Support\SettingsFixture;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * API keys are stored encrypted and only ever described by a hint.
 */
#[CoversClass(KeyStore::class)]
final class KeyStoreTest extends TestCase {
	use SettingsFixture;

	public function testKeysAreEncryptedAndNeverReturned(): void {
		$keys = $this->keys();
		$keys->setPersonal('bob', 'sk-abcdefgh1234');
		$this->assertStringStartsWith('enc:', $this->user['bob']['ai_api_key']);
		$this->assertSame(['hasKey' => true, 'keyHint' => '1234', 'keyUnreadable' => false], $keys->personalInfo('bob'));
		$this->assertSame('sk-abcdefgh1234', $keys->getPersonal('bob'));
		$this->user['bob']['ai_api_key'] = 'garbage';
		$this->assertSame(['hasKey' => true, 'keyHint' => null, 'keyUnreadable' => true], $keys->personalInfo('bob'));
		$this->assertNull($keys->getPersonal('bob'));
		$keys->setPersonal('bob', '');
		$this->assertSame(['hasKey' => false, 'keyHint' => null, 'keyUnreadable' => false], $keys->personalInfo('bob'));
	}

	public function testSharedKey(): void {
		$keys = $this->keys();
		$keys->setShared('sk-short');
		$this->assertSame(['hasKey' => true, 'keyHint' => 'hort', 'keyUnreadable' => false], $keys->sharedInfo());
		$keys->setShared('short');
		$this->assertSame(['hasKey' => true, 'keyHint' => null, 'keyUnreadable' => false], $keys->sharedInfo(), 'no hint for keys under 8 characters');
		$keys->setShared(null);
		$this->assertArrayNotHasKey(KeyStore::SHARED_KEY, $this->app);
		$this->assertTrue(KeyStore::isValidKey('sk-' . str_repeat('x', 1021)));
		$this->assertFalse(KeyStore::isValidKey('sk-' . str_repeat('x', 1022)));
		$this->assertFalse(KeyStore::isValidKey('sk key'));
	}
}
