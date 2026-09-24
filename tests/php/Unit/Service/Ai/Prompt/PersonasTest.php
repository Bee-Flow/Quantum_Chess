<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai\Prompt;

use OCA\QuantumChess\Service\Ai\Prompt\Personas;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

/**
 * The LLM opponent personas of the server match the persona catalogue of the web app (`src/llm/personas.js`): the
 * same ids, names and tolerances.
 */
#[CoversClass(Personas::class)]
final class PersonasTest extends TestCase {
	public function testMatchesTheWebAppCatalogue(): void {
		$source = (string)file_get_contents(__DIR__ . '/../../../../../../src/llm/personas.js');
		preg_match_all("/id: '([^']+)',\\s*name: '([^']+)',\\s*tolerance: (\\d+),/", $source, $matches, PREG_SET_ORDER);
		$web = [];
		foreach ($matches as [, $id, $name, $tolerance]) {
			$web[$id] = [$name, (int)$tolerance];
		}
		$server = array_map(fn (array $persona) => [$persona['name'], $persona['tolerance']], Personas::ALL);

		$this->assertCount(4, $web);
		$this->assertSame($web, $server);
	}

	public function testLooksUpPersonasById(): void {
		$this->assertTrue(Personas::exists('q7'));
		$this->assertFalse(Personas::exists('grandmaster'));
		$this->assertSame('Captain Collapse', Personas::name('captain'));
		$this->assertSame('unknown', Personas::name('unknown'), 'an unknown id stands for itself');
		$this->assertStringContainsString('pirate', Personas::block('captain'));
		$this->assertSame('', Personas::block('unknown'));
	}
}
