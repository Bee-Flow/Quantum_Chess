/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Move chips in coach answers (GAME-DESIGN §5.5): move codes found in the text, each checked with `findMove`. A code
 * that is not legal here stays plain text.
 */

import { findMove } from '../engine/index.js'

/** Answers are cut at this length. */
export const ANSWER_MAX = 2000

const CODE = /\?[a-h][1-8]|[a-h][1-8](?:\|[a-h][1-8])?-[a-h][1-8](?:\|[a-h][1-8])?(?:=[QRBNqrbn])?/g

/**
 * Cut an answer to the display limit.
 *
 * @param {string} text answer
 * @return {string}
 */
export function truncateAnswer(text) {
	const s = String(text ?? '')
	return s.length > ANSWER_MAX ? s.slice(0, ANSWER_MAX - 1) + '…' : s
}

/**
 * The distinct move codes of a text, validated in a position.
 *
 * @param {string} text answer text
 * @param {object} state position
 * @return {Array<{text: string, code: string|null, legal: boolean, move: object|null}>}
 */
export function moveChips(text, state) {
	const seen = new Set()
	const out = []
	for (const match of String(text ?? '').matchAll(CODE)) {
		const raw = match[0]
		if (seen.has(raw)) {
			continue
		}
		seen.add(raw)
		const move = state && !state.result ? findMove(state, raw) : null
		out.push({ text: raw, code: move?.code ?? null, legal: Boolean(move), move })
	}
	return out
}
