<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Tests\Unit\Service\Ai\Provider;

use OCA\QuantumChess\Service\Ai\Provider\ChatResult;
use OCA\QuantumChess\Service\Ai\Provider\NextcloudAiProvider;
use OCA\QuantumChess\Service\Ai\Provider\TaskStatus;
use OCP\TaskProcessing\IManager;
use OCP\TaskProcessing\Task;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Nextcloud Assistant through TaskProcessing: the choice of the task type, the input shapes, task ownership, task
 * states, and deletion after reading.
 */
#[CoversClass(NextcloudAiProvider::class)]
#[CoversClass(TaskStatus::class)]
final class NextcloudAiProviderTest extends TestCase {
	/** @var list<Task> */
	private array $scheduled = [];
	/** @var list<Task> */
	private array $deleted = [];

	private function provider(array $types, ?Task $stored = null): NextcloudAiProvider {
		$manager = $this->createMock(IManager::class);
		$manager->method('getAvailableTaskTypeIds')->willReturn($types);
		$manager->method('getAvailableTaskTypes')->willReturn([]);
		$manager->method('scheduleTask')->willReturnCallback(function (Task $task): void {
			$task->setId(41 + count($this->scheduled));
			$this->scheduled[] = $task;
		});
		$manager->method('getUserTask')->willReturnCallback(function (int $id, ?string $uid) use ($stored): Task {
			if ($stored === null || $stored->getId() !== $id || $stored->getUserId() !== $uid) {
				throw new \OCP\TaskProcessing\Exception\NotFoundException('no');
			}
			return $stored;
		});
		$manager->method('deleteTask')->willReturnCallback(function (Task $task): void {
			$this->deleted[] = $task;
		});
		return new NextcloudAiProvider($manager, $this->createMock(LoggerInterface::class));
	}

	private const MESSAGES = [['role' => 'system', 'content' => 'SYS'], ['role' => 'user', 'content' => 'USR']];
	private const OPTIONS = ['model' => null, 'maxTokens' => 800, 'temperature' => 0.7, 'effort' => null, 'safetyId' => null, 'purpose' => 'move'];

	public function testPrefersChatWithSystemPrompt(): void {
		$result = $this->provider(['core:text2text', 'core:text2text:chat'])->forUser('bob')->chat(self::MESSAGES, self::OPTIONS);
		$this->assertEquals(ChatResult::pending(41), $result);
		$task = $this->scheduled[0];
		$this->assertSame('core:text2text:chat', $task->getTaskTypeId());
		$this->assertSame(['system_prompt' => 'SYS', 'input' => 'USR', 'history' => []], $task->getInput());
		$this->assertSame(['quantumchess', 'bob'], [$task->getAppId(), $task->getUserId()]);
		$this->assertMatchesRegularExpression('/^quantumchess:move:[0-9a-f]{12}$/', (string)$task->getCustomId());
	}

	public function testFallsBackToTextToText(): void {
		$this->provider(['core:text2text'])->forUser('bob')->chat(self::MESSAGES, ['purpose' => 'coach'] + self::OPTIONS);
		$this->assertSame(['input' => "SYSTEM:\nSYS\n\nUSER:\nUSR"], $this->scheduled[0]->getInput());
		$this->assertStringStartsWith('quantumchess:coach:', (string)$this->scheduled[0]->getCustomId());
		$this->assertNull($this->provider([])->taskType('bob'));
	}

	public function testStatusOwnershipAndDeletion(): void {
		$task = new Task('core:text2text:chat', [], 'quantumchess', 'bob', 'quantumchess:coach:abc');
		$task->setId(7);
		$task->setStatus(Task::STATUS_RUNNING);
		$provider = $this->provider(['core:text2text:chat'], $task);
		$this->assertSame(TaskStatus::PENDING, $provider->status('bob', 7)?->state);
		$this->assertNull($provider->status('carol', 7), 'other users do not see the task');
		$this->assertSame([], $this->deleted);

		$task->setStatus(Task::STATUS_SUCCESSFUL);
		$task->setOutput(['output' => '**Answer**']);
		$task->setStartedAt(100);
		$task->setEndedAt(108);
		$done = $provider->status('bob', 7);
		$this->assertSame([TaskStatus::DONE, 'coach', '**Answer**', 8000], [$done?->state, $done?->purpose, $done?->text, $done?->durationMs]);
		$this->assertSame([$task], $this->deleted, 'deleted after reading');

		$task->setStatus(Task::STATUS_FAILED);
		$failed = $provider->status('bob', 7);
		$this->assertSame([TaskStatus::ERROR, 'bad_response'], [$failed?->state, $failed?->error]);

		$foreign = new Task('core:text2text:chat', [], 'assistant', 'bob', 'x');
		$foreign->setId(8);
		$this->assertNull($this->provider(['core:text2text:chat'], $foreign)->status('bob', 8), 'only tasks of this app');
	}
}
