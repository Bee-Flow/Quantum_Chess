<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Prompt;

/**
 * Reads the answers of LLMs.
 *
 * The move is returned as the text the model wrote; the client checks it with the rules engine and may retry once
 * with feedback. A comment is cut to 200 characters, a coach answer to 2000.
 */
final class AnswerParser {
	public const MOODS = ['happy', 'confident', 'playful', 'thinking', 'worried', 'surprised'];
	public const COMMENT_MAX = 200;
	public const COACH_MAX = 2000;

	private const MOVE_REGEX = '/(?<![A-Za-z0-9])([KQRBN]?[a-hA-H][1-8][-x:]?[a-hA-H][1-8]([|\/,][a-hA-H][1-8])?(=?[QRBNqrbn])?|\?[KQRBN]?[a-h][1-8]|[O0o]-[O0o](-[O0o])?)/';

	/**
	 * The move answer: the first JSON object with a `move` or a `pick`, otherwise the first move code in the text.
	 *
	 * @return array{move: ?string, pick: ?int, comment: string, mood: string}
	 */
	public static function parseMove(string $text): array {
		$text = self::stripFences(trim($text));
		$json = self::firstObject($text);
		if ($json !== null) {
			$data = json_decode($json, true);
			if (is_array($data)) {
				$move = $data['move'] ?? null;
				$move = is_string($move) ? trim(self::clean($move)) : null;
				if ($move === '' || ($move !== null && mb_strlen($move) > 32)) {
					$move = null;
				}
				$pick = $data['pick'] ?? null;
				if (is_string($pick) && preg_match('/^\d$/', trim($pick)) === 1) {
					$pick = (int)trim($pick);
				}
				$pick = is_int($pick) && $pick >= 1 && $pick <= 6 ? $pick : null;
				$comment = is_string($data['comment'] ?? null) ? self::comment($data['comment']) : '';
				$mood = is_string($data['mood'] ?? null) ? strtolower(trim($data['mood'])) : '';
				if ($move !== null || $pick !== null) {
					return [
						'move' => $move,
						'pick' => $pick,
						'comment' => $comment,
						'mood' => in_array($mood, self::MOODS, true) ? $mood : 'thinking',
					];
				}
			}
		}
		if (preg_match(self::MOVE_REGEX, $text, $m) === 1) {
			return ['move' => $m[1], 'pick' => null, 'comment' => '', 'mood' => 'thinking'];
		}
		return ['move' => null, 'pick' => null, 'comment' => '', 'mood' => 'thinking'];
	}

	/**
	 * The coach answer: control characters removed (newlines and tabs kept), cut at 2000 characters.
	 */
	public static function parseCoach(string $text): string {
		$text = str_replace(["\r\n", "\r"], "\n", $text);
		$text = (string)preg_replace('/[^\P{Cc}\n\t]/u', '', $text);
		$text = trim($text);
		if (mb_strlen($text) > self::COACH_MAX) {
			$text = rtrim(mb_substr($text, 0, self::COACH_MAX - 1)) . '…';
		}
		return $text;
	}

	private static function comment(string $text): string {
		$text = trim((string)preg_replace('/\s+/u', ' ', self::clean($text)));
		if (mb_strlen($text) > self::COMMENT_MAX) {
			$text = rtrim(mb_substr($text, 0, self::COMMENT_MAX - 1)) . '…';
		}
		return $text;
	}

	private static function clean(string $text): string {
		if (!mb_check_encoding($text, 'UTF-8')) {
			$text = (string)mb_convert_encoding($text, 'UTF-8', 'UTF-8');
		}
		return (string)preg_replace('/\p{Cc}/u', ' ', $text);
	}

	private static function stripFences(string $text): string {
		return (string)preg_replace('/```[a-zA-Z]*\s*|```/', '', $text);
	}

	/**
	 * The first balanced `{…}` (string-aware), or null.
	 */
	private static function firstObject(string $text): ?string {
		$start = strpos($text, '{');
		while ($start !== false) {
			$depth = 0;
			$inString = false;
			$escape = false;
			$length = strlen($text);
			for ($i = $start; $i < $length; $i++) {
				$c = $text[$i];
				if ($inString) {
					if ($escape) {
						$escape = false;
					} elseif ($c === '\\') {
						$escape = true;
					} elseif ($c === '"') {
						$inString = false;
					}
					continue;
				}
				if ($c === '"') {
					$inString = true;
				} elseif ($c === '{') {
					$depth++;
				} elseif ($c === '}') {
					$depth--;
					if ($depth === 0) {
						$candidate = substr($text, $start, $i - $start + 1);
						if (is_array(json_decode($candidate, true))) {
							return $candidate;
						}
						break;
					}
				}
			}
			$start = strpos($text, '{', $start + 1);
		}
		return null;
	}
}
