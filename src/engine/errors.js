/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Thrown by `applyMove` when the move is not legal. `code` is the `whyIllegal` reason (§4.11).
 */
export class IllegalMoveError extends Error {
	/**
	 * @param {string} code reason code
	 * @param {unknown} [move] the rejected input
	 */
	constructor(code, move) {
		super('illegal move: ' + code)
		this.name = 'IllegalMoveError'
		this.code = code
		this.move = move
	}
}

/**
 * Thrown for invalid options (a bad `u`, `rng` result or forced `outcome`, §5.2). Never an illegal move.
 */
export class EngineArgumentError extends Error {
	/**
	 * @param {string} message description
	 */
	constructor(message) {
		super(message)
		this.name = 'EngineArgumentError'
	}
}

/**
 * Thrown by `setupPosition` (Appendix A). `code` is one of SETUP_ERRORS, `detail` gives more context
 * (the `whyIllegal` code for `prelude_illegal`, the invariant for `invalid_state`).
 */
export class SetupError extends Error {
	/**
	 * @param {string} code setup error code
	 * @param {string} [detail] extra detail
	 */
	constructor(code, detail) {
		super('setup failed: ' + code + (detail ? ' (' + detail + ')' : ''))
		this.name = 'SetupError'
		this.code = code
		this.detail = detail ?? null
	}
}

/**
 * Thrown when a function that needs a valid state receives something else.
 */
export class InvalidStateError extends Error {
	/**
	 * @param {string} code invariant or shape code
	 * @param {string} [message] description
	 */
	constructor(code, message) {
		super('invalid state: ' + code + (message ? ': ' + message : ''))
		this.name = 'InvalidStateError'
		this.code = code
	}
}
