/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The players of a local game as the screens show them: their names, their player cards, and the title of the game in
 * the lists ("vs Wobbles", "Ann vs Ben").
 */

import { t } from '@nextcloud/l10n'
import { LEVELS } from '../ai/levels.js'
import { personaById } from '../llm/personas.js'
import { currentUser } from '../services/initialState.js'

/**
 * The display name of one side of a local game.
 *
 * @param {object} record local game record
 * @param {'w'|'b'} color the side
 * @param {object|null} [persona] the LLM opponent's persona (looked up from the record when left out)
 * @return {string}
 */
export function localPlayerName(record, color, persona = personaById(record.players?.[color]?.persona)) {
	const p = record.players?.[color] ?? {}
	if (p.kind === 'engine') {
		return LEVELS[(p.level ?? 1) - 1]?.name ?? t('quantumchess', 'Computer')
	}
	if (p.kind === 'ai') {
		return persona?.name ?? t('quantumchess', 'AI opponent')
	}
	if (p.kind === 'human' && record.mode !== 'local') {
		return currentUser.displayName || t('quantumchess', 'You')
	}
	return p.name || (color === 'w' ? t('quantumchess', 'White') : t('quantumchess', 'Black'))
}

/**
 * The title of a local game in the navigation and on Home: the opponent against the computer player or an LLM
 * opponent, both names in pass & play.
 *
 * @param {{mode: string, players?: object}} game local game record or index entry
 * @return {string}
 */
export function localGameTitle(game) {
	const p = game.players ?? {}
	const other = p.w?.kind === 'human' ? p.b : p.w
	if (game.mode === 'computer') {
		const level = LEVELS[(other?.level ?? 1) - 1]
		return t('quantumchess', 'vs {name}', { name: level?.name ?? t('quantumchess', 'Computer') })
	}
	if (game.mode === 'ai') {
		return t('quantumchess', 'vs {name}', { name: personaById(other?.persona)?.name ?? t('quantumchess', 'AI opponent') })
	}
	return t('quantumchess', '{white} vs {black}', { white: p.w?.name || t('quantumchess', 'White'), black: p.b?.name || t('quantumchess', 'Black') })
}

/**
 * The PlayerInfo of one side of a local game.
 *
 * @param {object} record local game record
 * @param {'w'|'b'} color the side
 * @param {object} live what changes during the game
 * @param {string} live.name display name
 * @param {object|null} live.comment the speech bubble
 * @param {object|null} live.persona the LLM opponent's persona, if any
 * @param {{thinking: boolean, depth: number|null, since: number}} live.engine the computer player's thinking state
 * @param {object|null} live.llm the LLM opponent (`useLlmOpponent`), if any
 * @return {import('./gameController.js').PlayerInfo}
 */
export function localPlayerInfo(record, color, { name, comment, persona, engine, llm }) {
	const p = record.players?.[color] ?? {}
	const base = { color, name, comment }
	if (p.kind === 'engine') {
		return { ...base, kind: 'engine', level: p.level, thinking: engine.thinking ? { depth: engine.depth, since: engine.since } : null }
	}
	if (p.kind === 'ai') {
		return {
			...base,
			kind: 'ai',
			persona: persona?.id,
			sourceLabel: p.sourceLabel ?? '',
			thinking: llm?.thinking.value ? { since: Date.now() - llm.elapsedMs.value } : null,
			queued: llm?.queued.value ?? false,
			elapsedMs: llm?.elapsedMs.value ?? 0,
		}
	}
	if (record.mode === 'local') {
		return { ...base, kind: 'local' }
	}
	return { ...base, kind: 'user', userId: currentUser.uid ?? undefined }
}
