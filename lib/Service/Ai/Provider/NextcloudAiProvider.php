<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

use OCA\QuantumChess\AppInfo\Application;
use OCA\QuantumChess\Service\Ai\Prompt\PromptBuilder;
use OCP\TaskProcessing\IManager;
use OCP\TaskProcessing\ShapeEnumValue;
use OCP\TaskProcessing\Task;
use OCP\TaskProcessing\TaskTypes\TextToText;
use OCP\TaskProcessing\TaskTypes\TextToTextChat;
use Psr\Log\LoggerInterface;

/**
 * Nextcloud Assistant, through the TaskProcessing API.
 *
 * It prefers the chat task type (`core:text2text:chat`) and falls back to plain text generation. Tasks run
 * asynchronously: chat() schedules one and the client polls its status. A finished task is deleted as soon as it has
 * been read, so no prompts are kept.
 */
class NextcloudAiProvider implements ProviderInterface {
	/** The prefix of the custom id of the app's tasks, followed by the purpose and a random suffix. */
	public const CUSTOM_PREFIX = Application::APP_ID . ':';

	/** The user the tasks run for; set by forUser(). */
	private ?string $uid = null;

	public function __construct(
		private readonly IManager $manager,
		private readonly LoggerInterface $logger,
	) {
	}

	/** A copy of the provider that schedules tasks for `$uid`. */
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
			$this->logger->debug('The TaskProcessing task types are unavailable.', ['exception' => $e]);
			return null;
		}
		foreach ([TextToTextChat::ID, TextToText::ID] as $type) {
			if (in_array($type, $ids, true)) {
				return $type;
			}
		}
		return null;
	}

	/** The name of the provider that runs tasks of `$type`, or null. */
	public function providerName(string $type): ?string {
		try {
			$provider = $this->manager->getPreferredProvider($type);
			return $provider->getName();
		} catch (\Throwable) {
			return null;
		}
	}

	/**
	 * Schedules a task with the system and user messages. The chat task type gets them separately, the text task
	 * type as one text.
	 */
	public function chat(array $messages, array $options): ChatResult {
		$uid = $this->uid ?? throw new ProviderException(UpstreamError::Unreachable, 'no user');
		$type = $this->taskType($uid) ?? throw new ProviderException(UpstreamError::Unreachable, 'no task type');
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
		$task = new Task(
			$type,
			$input,
			Application::APP_ID,
			$uid,
			self::CUSTOM_PREFIX . $options['purpose'] . ':' . bin2hex(random_bytes(6)),
		);
		try {
			$this->manager->scheduleTask($task);
		} catch (\Throwable $e) {
			$this->logger->warning('Could not schedule a TaskProcessing task: ' . $e->getMessage());
			throw new ProviderException(UpstreamError::Unreachable, 'schedule failed');
		}
		$id = $task->getId();
		if ($id === null) {
			throw new ProviderException(UpstreamError::Unreachable, 'no task id');
		}
		return ChatResult::pending($id);
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
	 * The state of one of the user's tasks of this app. A finished task is deleted.
	 *
	 * @return TaskStatus|null null when the task is unknown
	 */
	public function status(string $uid, int $id): ?TaskStatus {
		$task = $this->find($uid, $id);
		if ($task === null) {
			return null;
		}
		$status = $task->getStatus();
		if ($status === Task::STATUS_SCHEDULED || $status === Task::STATUS_RUNNING
			|| $status === Task::STATUS_UNKNOWN) {
			return TaskStatus::pending();
		}
		$purpose = explode(':', (string)$task->getCustomId())[1] ?? 'move';
		$this->delete($task);
		if ($status !== Task::STATUS_SUCCESSFUL) {
			return TaskStatus::failed(UpstreamError::BadResponse->value);
		}
		$output = $task->getOutput()['output'] ?? null;
		if (!is_string($output) || trim($output) === '') {
			return TaskStatus::failed(UpstreamError::BadResponse->value);
		}
		$start = $task->getStartedAt() ?? $task->getScheduledAt();
		$end = $task->getEndedAt();
		$duration = ($start !== null && $end !== null && $end >= $start) ? ($end - $start) * 1000 : null;
		return TaskStatus::done($purpose === 'coach' ? 'coach' : 'move', $output, $duration);
	}

	/**
	 * Cancels and deletes one of the user's tasks of this app. Returns false when the task is unknown.
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
	 * Deletes this app's finished tasks of all users that ended before `$endedBefore`.
	 */
	public function cleanup(int $endedBefore): void {
		foreach ([Task::STATUS_SUCCESSFUL, Task::STATUS_FAILED, Task::STATUS_CANCELLED] as $status) {
			try {
				foreach ($this->manager->getTasks(
					null,
					null,
					Application::APP_ID,
					null,
					$status,
					null,
					$endedBefore,
				) as $task) {
					$this->delete($task);
				}
			} catch (\Throwable $e) {
				$this->logger->debug('The cleanup of TaskProcessing tasks failed.', ['exception' => $e]);
			}
		}
	}

	private function find(string $uid, int $id): ?Task {
		try {
			$task = $this->manager->getUserTask($id, $uid);
		} catch (\Throwable) {
			return null;
		}
		if ($task->getAppId() !== Application::APP_ID
			|| !str_starts_with((string)$task->getCustomId(), self::CUSTOM_PREFIX)) {
			return null;
		}
		return $task;
	}

	private function delete(Task $task): void {
		try {
			$this->manager->deleteTask($task);
		} catch (\Throwable $e) {
			$this->logger->debug('Could not delete a TaskProcessing task.', ['exception' => $e]);
		}
	}
}
