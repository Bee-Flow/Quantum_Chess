/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The GameController contract between a game and the game screen. `useLocalGame` (computer, LLM opponent, pass & play)
 * and `useOnlineGame` produce it; `GameScreen`, the coach panel and the chat components consume it. The game screen
 * knows nothing else about where a game comes from, so a new kind of game plugs in by producing this object.
 */

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/**
 * The end of a game as the screens show it.
 *
 * @typedef {object} GameResult
 * @property {string} result '1-0', '0-1' or '1/2-1/2'
 * @property {string} reason reason code of the rules engine or the server, e.g. `king_captured`, `resignation`
 * @property {'w'|'b'|null} winner the winning side, null for a draw
 * @property {'engine'|'server'} source where the result was decided
 */

/**
 * One played move in the move list.
 *
 * @typedef {object} MoveEntry
 * @property {number} ply ply of the position before the move
 * @property {'w'|'b'} color the side that moved
 * @property {string} code move code
 * @property {string} notation the rules engine's notation of the move
 * @property {object|null} measurement the measurement record of a rolled move, null for a quiet move
 * @property {number|null} u the roll value, null when the move did not roll
 * @property {'human'|'engine'|'ai'|'ai-fallback'|'opponent'} by who chose the move
 * @property {string} [comment] what the computer or LLM opponent said with the move
 * @property {string} [mood] mood of the comment: happy, surprised, worried, confident, …
 * @property {number} [createdAt] Unix seconds
 * @property {string} [chain] hash chain value after the move (online games)
 */

/**
 * A player as the player cards show it.
 *
 * @typedef {object} PlayerInfo
 * @property {'w'|'b'} color the player's side
 * @property {'user'|'engine'|'ai'|'local'} kind a Nextcloud user, the computer player, an LLM opponent or a pass &
 *   play player
 * @property {string} name display name
 * @property {string} [userId] Nextcloud user id
 * @property {number} [level] computer level, 1 to 5
 * @property {string} [persona] persona id of an LLM opponent
 * @property {string} [sourceLabel] name of the LLM source
 * @property {number} [rating] online rating
 * @property {boolean} [provisional] the rating is still provisional
 * @property {number} [deadlineAt] Unix seconds by which the player has to move (online games)
 * @property {number} [now] the server's time in Unix seconds, to compute the time left
 * @property {string} [statusText] a short status line under the name
 * @property {{depth?: number, since: number}|null} [thinking] the computer or LLM opponent is choosing a move
 * @property {{text: string, mood: string|null, at: number}|null} [comment] the speech bubble
 */

/**
 * What the local user may do now.
 *
 * @typedef {object} Capabilities
 * @property {boolean} undo take back the last own move
 * @property {boolean} resign give up the game
 * @property {boolean} abort end an online game before it really started
 * @property {boolean} offerDraw offer a draw
 * @property {boolean} answerDraw accept or decline the opponent's draw offer
 * @property {boolean} rematch play again
 * @property {boolean} chat the game has a chat
 */

/**
 * A banner above the board.
 *
 * @typedef {object} GameBanner
 * @property {string} id stable id
 * @property {'info'|'warning'|'error'} type severity
 * @property {string} text message
 * @property {Array<{label: string, handler: () => void}>} actions buttons of the banner
 */

/**
 * The move-by-move animation of the board, attached by the game screen.
 *
 * @typedef {object} Animator
 * @property {(event: object) => Promise<void>} play animates one move event and resolves when it is shown
 * @property {(arg: object) => void} [startRoll] starts the roll animation before the result is known
 * @property {() => void} [finish] fast-forwards the running animation
 */

/**
 * A running game as the game screen sees it. Refs and computed values are read with `.value`.
 *
 * @typedef {object} GameController
 * @property {'online'|'computer'|'ai'|'local'} kind where the game comes from
 * @property {import('vue').Ref<string|number>} id local or online game id
 * @property {import('vue').Ref<boolean>} loading the game is being loaded
 * @property {import('vue').Ref<Error|null>} error the game could not be loaded or continued
 * @property {import('vue').Ref<EngineState>} state the displayed position; it changes only after a move's animation
 * @property {import('vue').Ref<EngineState|null>} startState the setup position, null for the standard start
 * @property {import('vue').ComputedRef<LegalMove[]>} legalMoves what the local user may play now; empty when the board
 *   is not interactive
 * @property {import('vue').Ref<MoveEntry[]>} moves the played moves
 * @property {import('vue').ComputedRef<{w: PlayerInfo, b: PlayerInfo}>} players both players
 * @property {import('vue').ComputedRef<{w: string, b: string}>} names both display names
 * @property {import('vue').ComputedRef<'w'|'b'|null>} myColor the local user's side; null in pass & play and for
 *   spectators
 * @property {import('vue').ComputedRef<'w'|'b'|'both'|null>} movableColor the side whose pieces the board lets the
 *   user pick up
 * @property {import('vue').Ref<'w'|'b'>} orientation the side at the bottom of the board
 * @property {import('vue').ComputedRef<boolean>} interactive the board accepts a move now
 * @property {import('vue').ComputedRef<GameResult|null>} result the end of the game, null while it runs
 * @property {import('vue').Ref<object|null>} pending an online move on its way: {code, phase: 'sending'|'retrying'|
 *   'failed', attempt}
 * @property {import('vue').ComputedRef<Capabilities>} can what the local user may do now
 * @property {import('vue').ComputedRef<boolean>} fairPlayLock the user's own active online game: the coach, hints,
 *   the evaluation and the analysis are hidden
 * @property {import('vue').Ref<GameBanner[]>} banners messages above the board
 * @property {import('vue').Ref<{move: LegalMove, key: string|null}|null>} lastMove the last move, for the board
 *   highlight
 * @property {import('vue').Ref<boolean>} animating a move is being animated
 * @property {(move: LegalMove) => Promise<void>} submitMove play a legal move of the local user
 * @property {(n: number) => EngineState} stateAt the position after n moves (0 = start)
 * @property {(animator: Animator) => () => void} attachAnimator attach the board's animation; returns the detach
 *   function
 * @property {() => void} flip turn the board
 * @property {() => Promise<void>} undo take back the last own move
 * @property {() => Promise<void>} resign give up the game
 * @property {() => Promise<void>} abort end an online game before it really started
 * @property {() => Promise<void>} offerDraw offer a draw
 * @property {(accept: boolean) => Promise<void>} answerDraw accept or decline the opponent's draw offer
 * @property {() => Promise<void>} rematch offer or accept a rematch
 * @property {() => Promise<void>} retryPending send a failed online move again
 * @property {() => Promise<void>} discardPending drop a failed online move
 * @property {() => void} dispose stop timers, requests and the opponent (leaving the view)
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
})

/**
 * A GameResult from an engine or server result.
 *
 * @param {{result: string, reason: string}|null} res result and reason, or null while the game runs
 * @param {'engine'|'server'} [source] where the result was decided
 * @return {GameResult|null}
 */
export function toGameResult(res, source = 'engine') {
	if (!res) {
		return null
	}
	const winner = res.result === '1-0' ? 'w' : (res.result === '0-1' ? 'b' : null)
	return { result: res.result, reason: res.reason, winner, source }
}
