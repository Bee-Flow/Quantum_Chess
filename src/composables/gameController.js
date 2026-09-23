/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The GameController contract between the game views and the game screen (SPEC §14.4.1). Produced by
 * `useLocalGame` (frontend-app) and `useOnlineGame` (frontend-online); consumed by `GameScreen`, the coach panel
 * and the chat components.
 *
 * @typedef {object} GameController
 * @property {'online'|'computer'|'ai'|'local'} kind
 * @property {import('vue').Ref<string|number>} id
 * @property {import('vue').Ref<boolean>} loading
 * @property {import('vue').Ref<Error|null>} error
 * @property {import('vue').Ref<object>} state                  the displayed live state; replaced only after an animation finished
 * @property {import('vue').Ref<object|null>} startState        null = standard start
 * @property {import('vue').ComputedRef<object[]>} legalMoves   what the local user may play now; [] when not interactive
 * @property {import('vue').Ref<MoveEntry[]>} moves
 * @property {import('vue').ComputedRef<{w: PlayerInfo, b: PlayerInfo}>} players
 * @property {import('vue').ComputedRef<'w'|'b'|null>} myColor       null in pass & play and for spectators
 * @property {import('vue').ComputedRef<'w'|'b'|'both'|null>} movableColor
 * @property {import('vue').Ref<'w'|'b'>} orientation
 * @property {import('vue').ComputedRef<boolean>} interactive
 * @property {import('vue').ComputedRef<GameResult|null>} result     {result, reason, winner: 'w'|'b'|null, source: 'engine'|'server'}
 * @property {import('vue').Ref<object|null>} pending           {code, phase: 'sending'|'retrying'|'failed', attempt}
 * @property {import('vue').ComputedRef<Capabilities>} can
 * @property {import('vue').ComputedRef<boolean>} fairPlayLock       own active online game: coach, hints, eval, analysis, export hidden
 * @property {import('vue').Ref<object[]>} banners                   [{id, type: 'info'|'warning'|'error', text, actions: [{label, handler}]}]
 * @property {import('vue').Ref<{move: object, key: string|null}|null>} lastMove  last move for the board highlight
 * @property {(move: object) => Promise<void>} submitMove
 * @property {(n: number) => object} stateAt            state after n moves (0 = start), memoised
 * @property {(animator: object) => () => void} attachAnimator
 * @property {() => void} flip
 * @property {() => Promise<void>} undo
 * @property {() => Promise<void>} resign
 * @property {() => Promise<void>} abort
 * @property {() => Promise<void>} offerDraw
 * @property {() => Promise<void>} rematch
 * @property {() => Promise<void>} retryPending
 * @property {() => Promise<void>} discardPending
 * @property {(accept: boolean) => Promise<void>} answerDraw
 * @property {() => object} [exportRecord]              .qcg.json document (deferred to 1.1)
 * @property {() => void} dispose
 */

/**
 * @typedef {object} MoveEntry
 * @property {number} ply state ply before the move
 * @property {'w'|'b'} color
 * @property {string} code
 * @property {string} notation engine notation
 * @property {object|null} measurement
 * @property {number|null} u
 * @property {'human'|'engine'|'ai'|'ai-fallback'|'opponent'} by
 * @property {string} [comment]
 * @property {string} [mood]
 * @property {number} [createdAt]
 * @property {string} [chain]
 */

/**
 * @typedef {object} PlayerInfo
 * @property {'w'|'b'} color
 * @property {'user'|'engine'|'ai'|'local'} kind
 * @property {string} name
 * @property {string} [userId]
 * @property {number} [level]
 * @property {string} [persona]
 * @property {string} [sourceLabel]
 * @property {number} [rating]
 * @property {boolean} [provisional]
 * @property {boolean} [adminBadge]
 * @property {number} [deadlineAt]
 * @property {number} [now]
 * @property {string} [statusText]
 * @property {{depth?: number, since: number}|null} [thinking]
 * @property {{text: string, mood: string|null, at: number}|null} [comment]
 */

/**
 * @typedef {object} Capabilities
 * @property {boolean} undo
 * @property {boolean} resign
 * @property {boolean} abort
 * @property {boolean} offerDraw
 * @property {boolean} answerDraw
 * @property {boolean} rematch
 * @property {boolean} chat
 * @property {boolean} coach
 * @property {boolean} analysis
 * @property {boolean} export
 * @property {boolean} showOtherResult
 * @property {boolean} typeMove
 */

/** Capabilities with everything off. */
export const NO_CAPABILITIES = Object.freeze({
	undo: false,
	resign: false,
	abort: false,
	offerDraw: false,
	answerDraw: false,
	rematch: false,
	chat: false,
	coach: false,
	analysis: false,
	export: false,
	showOtherResult: false,
	typeMove: false,
})

/**
 * A GameResult from an engine or server result.
 *
 * @param {{result: string, reason: string}|null} res result
 * @param {'engine'|'server'} source source
 * @return {object|null}
 */
export function toGameResult(res, source = 'engine') {
	if (!res) {
		return null
	}
	const winner = res.result === '1-0' ? 'w' : (res.result === '0-1' ? 'b' : null)
	return { result: res.result, reason: res.reason, winner, source }
}
