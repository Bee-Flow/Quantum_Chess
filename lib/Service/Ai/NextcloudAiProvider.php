<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai;

use OCA\QuantumChess\AppInfo\Application;
use OCP\TaskProcessing\IManager;
use OCP\TaskProcessing\ShapeEnumValue;
use OCP\TaskProcessing\Task;
use OCP\TaskProcessing\TaskTypes\TextToText;
use OCP\TaskProcessing\TaskTypes\TextToTextChat;
use Psr\Log\LoggerInterface;

/**
 * Nextcloud AI through TaskProcessing (docs/SPEC.md §10.2): prefers `core:text2text:chat`, falls back to
 * `core:text2text`, schedules asynchronously and is polled by the client. Finished tasks are deleted after reading,
 * so the app keeps no prompts.
 */
class NextcloudAiProvider implements ProviderInterface {
	public const CUSTOM_PREFIX = Application::APP_ID . ':';

	private ?string $uid = null;

	public function __construct(
		private IManager $manager,
		private LoggerInterface $logger,
	) {
	}

	public function forUser(string $uid): static {
		$clone = clone $this;
		$clone->uid = $uid;
		return $clone;
	}

	/**
	 * The task type to use for a user, or null when none is available.
	 */
	public function taskType(string $uid): ?string {
		try {
			$ids = $this->manager->getAvailableTaskTypeIds(false, $uid);
		} catch (\Throwable $e) {
			$this->logger->debug('Quantum Chess AI: task types unavailable', ['app' => Application::APP_ID, 'exception' => $e]);
			return null;
		}
		foreach ([TextToTextChat::ID, TextToText::ID] as $type) {
			if (in_array($type, $ids, true)) {
				return $type;
			}
		}
		return null;
	}

	public function providerName(string $type): ?string {
		try {
			$provider = $this->manager->getPreferredProvider($type);
			return $provider->getName();
		} catch (\Throwable) {
			return null;
		}
	}

	public function chat(array $messages, array $options): array {
		$uid = $this->uid ?? throw new ProviderException('unreachable', 'no user');
		$type = $this->taskType($uid) ?? throw new ProviderException('unreachable', 'no task type');
		$system = '';
		$user = '';
		foreach ($messages as $message) {
			if ($message['role'] === 'system') {
				$system .= ($system === '' ? '' : "\n\n") . $message['content'];
			} elseif ($message['role'] === 'user') {
				$user .= ($user === '' ? '' : "\n\n") . $message['content'];
			}
		}
		$input = $type === TextToTextChat::ID
			? ['system_prompt' => $system, 'input' => $user, 'history' => []]
			: ['input' => PromptBuilder::joined($system, $user)];
		$model = $options['model'] ?? null;
		if ($model !== null && $model !== '' && in_array($model, array_column($this->listModels(), 'id'), true)) {
			$input['model'] = $model;
		}
		$task = new Task($type, $input, Application::APP_ID, $uid, self::CUSTOM_PREFIX . $options['purpose'] . ':' . bin2hex(random_bytes(6)));
		try {
			$this->manager->scheduleTask($task);
		} catch (\Throwable $e) {
			$this->logger->warning('Quantum Chess AI: could not schedule a task: ' . $e->getMessage(), ['app' => Application::APP_ID]);
			throw new ProviderException('unreachable', 'schedule failed');
		}
		$id = $task->getId();
		if ($id === null) {
			throw new ProviderException('unreachable', 'no task id');
		}
		return ['status' => 'pending', 'taskId' => $id];
	}

	/**
	 * The enum values of the optional `model` input of the task type, when it declares one.
	 */
	public function listModels(): array {
		$uid = $this->uid;
		$type = $uid === null ? null : $this->taskType($uid);
		if ($type === null) {
			return [];
		}
		try {
			$types = $this->manager->getAvailableTaskTypes(false, $uid);
		} catch (\Throwable) {
			return [];
		}
		$values = $types[$type]['optionalInputShapeEnumValues']['model'] ?? [];
		$models = [];
		foreach ($values as $value) {
			if ($value instanceof ShapeEnumValue) {
				$models[] = ['id' => $value->getValue(), 'label' => $value->getName()];
			}
		}
		return $models;
	}

	/**
	 * State of one of the viewer's tasks of this app.
	 *
	 * @return array{status: 'pending'}|array{status: 'done', purpose: string, text: string, durationMs: ?int}|array{status: 'error', error: string}|null null when the task is unknown
	 */
	public function status(string $uid, int $id): ?array {
		$task = $this->find($uid, $id);
		if ($task === null) {
			return null;
		}
		$status = $task->getStatus();
		if ($status === Task::STATUS_SCHEDULED || $status === Task::STATUS_RUNNING || $status === Task::STATUS_UNKNOWN) {
			return ['status' => 'pending'];
		}
		$purpose = explode(':', (string)$task->getCustomId())[1] ?? 'move';
		$this->delete($task);
		if ($status !== Task::STATUS_SUCCESSFUL) {
			return ['status' => 'error', 'error' => 'bad_response'];
		}
		$output = $task->getOutput()['output'] ?? null;
		if (!is_string($output) || trim($output) === '') {
			return ['status' => 'error', 'error' => 'bad_response'];
		}
		$start = $task->getStartedAt() ?? $task->getScheduledAt();
		$end = $task->getEndedAt();
		$duration = ($start !== null && $end !== null && $end >= $start) ? ($end - $start) * 1000 : null;
		return ['status' => 'done', 'purpose' => $purpose === 'coach' ? 'coach' : 'move', 'text' => $output, 'durationMs' => $duration];
	}

	/**
	 * Cancel and delete one of the viewer's tasks. Returns false when the task is unknown.
	 */
	public function cancel(string $uid, int $id): bool {
		$task = $this->find($uid, $id);
		if ($task === null) {
			return false;
		}
		try {
			if ($task->getStatus() === Task::STATUS_SCHEDULED || $task->getStatus() === Task::STATUS_RUNNING) {
				$this->manager->cancelTask($id);
			}
		} catch (\Throwable) {
			// already finished
		}
		$this->delete($task);
		return true;
	}

	/**
	 * Delete this app's finished tasks that ended before `$endedBefore` (all users).
	 */
	public function cleanup(int $endedBefore): void {
		foreach ([Task::STATUS_SUCCESSFUL, Task::STATUS_FAILED, Task::STATUS_CANCELLED] as $status) {
			try {
				foreach ($this->manager->getTasks(null, null, Application::APP_ID, null, $status, null, $endedBefore) as $task) {
					$this->delete($task);
				}
			} catch (\Throwable $e) {
				$this->logger->debug('Quantum Chess AI: task cleanup failed', ['app' => Application::APP_ID, 'exception' => $e]);
			}
		}
	}

	private function find(string $uid, int $id): ?Task {
		try {
			$task = $this->manager->getUserTask($id, $uid);
		} catch (\Throwable) {
			return null;
		}
		if ($task->getAppId() !== Application::APP_ID || !str_starts_with((string)$task->getCustomId(), self::CUSTOM_PREFIX)) {
			return null;
		}
		return $task;
	}

	private function delete(Task $task): void {
		try {
			$this->manager->deleteTask($task);
		} catch (\Throwable $e) {
			$this->logger->debug('Quantum Chess AI: could not delete a task', ['app' => Application::APP_ID, 'exception' => $e]);
		}
	}
}
