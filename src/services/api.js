/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The HTTP client of the app: one function per JSON route of `appinfo/routes.php` (docs/development/api.md describes
 * them). It covers every route, also the few that the web app does not call itself, such as the game history and the
 * model list. Other modules call these functions and never use axios directly.
 *
 * Return values: the response body, unwrapped where the body has a single payload field. `{game}` responses return the
 * game (GameLive, GameSummary or GameFull), `{games}` of the open list and `{users}` return the array, `{progress}`
 * returns the progress document and `{preferences}` the preferences. Every other function returns the body as sent by
 * the server. Failures throw `ApiError`; cancelled requests reject with an `AbortError`.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'

/**
 * Options of a request.
 *
 * @typedef {object} RequestOptions
 * @property {unknown} [data] request body, sent as JSON
 * @property {Record<string, unknown>} [params] query parameters
 * @property {AbortSignal} [signal] cancels the request
 * @property {Record<string, string>} [headers] extra request headers
 * @property {number} [timeout] timeout in milliseconds
 */

/**
 * A user as the API shows it. A deleted account has `userId: null` and a translated display name.
 *
 * @typedef {object} UserRef
 * @property {string|null} userId user id
 * @property {string} displayName display name
 */

/**
 * An online game in lists (the lobby, the history, the answers to invitations), as one viewer sees it. The fields are
 * described in docs/development/api.md, "GameSummary".
 *
 * @typedef {object} GameSummary
 * @property {number} id game id
 * @property {string} status pending, open, active, finished, aborted, declined, cancelled or expired
 * @property {string} timeControl corr:1d, corr:3d, corr:7d or corr:none
 * @property {boolean} rated the game is rated (false until it starts)
 * @property {boolean} ratedRequested the creator asked for a rated game
 * @property {string|null} unratedReason why a requested rated game is unrated
 * @property {UserRef} creator the player who created the game
 * @property {UserRef|null} opponent the invited or joined player
 * @property {UserRef|null} white the White player, once the game started
 * @property {UserRef|null} black the Black player, once the game started
 * @property {'w'|'b'|'r'} colorChoice the creator's colour choice
 * @property {'w'|'b'|null} myColor the viewer's colour
 * @property {boolean} yourTurn the game is active and the viewer is to move
 * @property {'w'|'b'} turn the side to move
 * @property {number} ply the number of moves played
 * @property {number|null} deadlineAt Unix seconds by which the side to move has to move
 * @property {number|null} expiresAt Unix seconds at which an invitation expires
 * @property {string|null} result 1-0, 0-1 or 1/2-1/2
 * @property {string|null} resultReason the rule that ended the game
 * @property {'w'|'b'|null} winner the winning side
 * @property {{w: number, b: number}|null} ratingChange the rating change of a rated finished game
 * @property {string|null} inviteMessage the creator's message
 * @property {string|null} scopeGroup the group an open challenge is limited to
 * @property {number|null} rematchOf the game this game is a rematch of
 * @property {number|null} rematchId the rematch of this game
 * @property {number} createdAt Unix seconds
 * @property {number} updatedAt Unix seconds
 * @property {number|null} startedAt Unix seconds
 * @property {number|null} lastMoveAt Unix seconds
 * @property {number|null} finishedAt Unix seconds
 * @property {Array<[number, string, number]>} preview every occupied square as `[square, letter, percent]`
 * @property {number} rev the revision of the game
 */

/**
 * The game screen's view of an online game: a GameSummary plus the position, the chain head, draw offers, the
 * players' ratings, chat flags and the server time (docs/development/api.md, "GameLive").
 *
 * @typedef {GameSummary & GameLiveFields} GameLive
 */

/**
 * @typedef {object} GameLiveFields
 * @property {import('../engine/types.js').EngineState} state the position
 * @property {string} chain the head of the hash chain
 * @property {{by: 'w'|'b', ply: number}|null} drawOffer the open draw offer
 * @property {boolean} canOfferDraw the viewer may offer a draw now
 * @property {number|null} drawAvailableAtPly the ply from which a declined draw may be offered again
 * @property {boolean} canAbort the viewer may abort the game
 * @property {boolean} canResign the viewer may resign
 * @property {boolean} canRematch the viewer may offer a rematch
 * @property {{w: object|null, b: object|null}|null} ratings each side's `{rating, provisional}`
 * @property {{w: number, b: number}|null} ratingBefore the ratings before a rated game was scored
 * @property {boolean} muted the viewer muted the chat
 * @property {number} chatCount the number of chat messages
 * @property {boolean} chatOpen the viewer may chat
 * @property {number} now the server's time in Unix seconds
 */

/**
 * A complete online game: a GameLive plus the start position, every move and the recent chat
 * (docs/development/api.md, "GameFull").
 *
 * @typedef {GameLive & {startState: import('../engine/types.js').EngineState|null, moves: MoveDTO[],
 *   chat: ChatDTO[]}} GameFull
 */

/**
 * A stored move of an online game (docs/development/api.md, "MoveDTO").
 *
 * @typedef {object} MoveDTO
 * @property {number} ply the ply before the move, from 0
 * @property {'w'|'b'} color the side that moved
 * @property {string|null} userId the player who moved
 * @property {string} code the canonical move code
 * @property {string} notation the display notation
 * @property {import('../engine/types.js').Measurement|null} measurement the roll, for a rolled move
 * @property {string} chain the chain after the move
 * @property {string} stateHash the position hash after the move
 * @property {number} createdAt Unix seconds
 */

/**
 * A chat message of an online game (docs/development/api.md, "ChatDTO").
 *
 * @typedef {object} ChatDTO
 * @property {number} id message id
 * @property {'text'|'phrase'|'system'} kind typed text, a quick phrase key or a system event key
 * @property {string|null} userId the author
 * @property {string} displayName the author's display name
 * @property {string} message the text or the key
 * @property {object|null} params the parameters of a system event
 * @property {number} createdAt Unix seconds
 */

/**
 * The lobby: the user's online games in groups of GameSummaries (docs/development/api.md, "LobbyDTO").
 *
 * @typedef {object} LobbyDTO
 * @property {string} rev an opaque token that changes whenever the lobby changes
 * @property {number} now the server's time in Unix seconds
 * @property {GameSummary[]} yourTurn active games where the user moves
 * @property {GameSummary[]} waiting active games where the opponent moves
 * @property {GameSummary[]} invitations incoming invitations and rematch offers
 * @property {GameSummary[]} outgoing the user's own invitations and open challenges
 * @property {GameSummary[]} open open challenges the user may join
 * @property {GameSummary[]} recent the last finished or aborted games
 * @property {{yourTurn: number, invitations: number}} counts the numbers for the navigation badges
 */

/**
 * The answer to a move (docs/development/api.md, "POST /api/games/{id}/moves").
 *
 * @typedef {object} MoveResponse
 * @property {GameLive} game the game after the move
 * @property {MoveDTO} move the stored move
 * @property {import('../engine/types.js').Measurement|null} measurement the roll, for a rolled move
 * @property {string} chain the chain after the move
 * @property {number} rev the game's revision
 * @property {number} now the server's time in Unix seconds
 * @property {boolean} replayed the move was already stored (a resent `clientId`)
 */

/**
 * A failed request. Features branch on `code`, never on the message.
 */
export class ApiError extends Error {
	/**
	 * @param {object} fields error fields
	 * @param {number} fields.status HTTP status, 0 for network errors
	 * @param {string} fields.code `error` of the response body, or `network`, `timeout` or `http_<status>`
	 * @param {object|null} [fields.data] parsed response body
	 * @param {number|null} [fields.retryAfter] seconds from the `Retry-After` header
	 * @param {string} [fields.message] translated message of the response body
	 */
	constructor({ status, code, data = null, retryAfter = null, message = '' }) {
		super(message || code)
		this.name = 'ApiError'
		this.status = status
		this.code = code
		this.data = data
		this.retryAfter = retryAfter
	}
}

/**
 * Convert an axios failure into an ApiError. Cancellations become a `DOMException` named `AbortError`.
 *
 * @param {unknown} error what axios threw
 * @return {Error}
 */
export function toApiError(error) {
	if (error instanceof ApiError) {
		return error
	}
	if (error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
		return new DOMException('The request was cancelled.', 'AbortError')
	}
	const response = error?.response
	if (!response) {
		const timeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
		return new ApiError({ status: 0, code: timeout ? 'timeout' : 'network', message: error?.message ?? '' })
	}
	const data = response.data && typeof response.data === 'object' ? response.data : null
	const header = response.headers?.['retry-after'] ?? response.headers?.['Retry-After']
	const seconds = header === undefined || header === null ? NaN : Number.parseInt(header, 10)
	return new ApiError({
		status: response.status,
		code: typeof data?.error === 'string' ? data.error : `http_${response.status}`,
		data,
		retryAfter: Number.isFinite(seconds) ? seconds : null,
		message: typeof data?.message === 'string' ? data.message : '',
	})
}

/**
 * Absolute URL of an app API path.
 *
 * @param {string} path path below /api, starting with '/'
 * @return {string}
 */
export function apiUrl(path) {
	return generateUrl('/apps/quantumchess/api' + path)
}

/**
 * Perform a request and return the body.
 *
 * @param {string} method HTTP verb
 * @param {string} path API path below /api
 * @param {RequestOptions} [options] request options
 * @return {Promise<unknown>}
 */
async function request(method, path, { data, params, signal, headers, timeout } = {}) {
	try {
		const response = await axios.request({ method, url: apiUrl(path), data, params, signal, headers, timeout })
		return response.data
	} catch (error) {
		throw toApiError(error)
	}
}

/**
 * The game of a `{game}` response.
 *
 * @param {unknown} body response body
 * @return {GameSummary|GameLive|GameFull} the game
 */
const game = (body) => body?.game ?? body

// --- Lobby and lists -------------------------------------------------------------------------------------------------

/**
 * The lobby: games that wait for the user, invitations, open challenges and recent games.
 *
 * @return {Promise<LobbyDTO>}
 */
export const getLobby = () => request('get', '/games')

/**
 * The cheap lobby summary with ETag support; does not throw on 304.
 *
 * @param {string|null} etag last token
 * @return {Promise<{status: number, data: object|null, etag: string|null}>}
 */
export async function getSummary(etag = null) {
	try {
		const response = await axios.get(apiUrl('/games/summary'), {
			headers: etag ? { 'If-None-Match': etag } : {},
			validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
		})
		return {
			status: response.status,
			data: response.status === 304 ? null : response.data,
			etag: response.headers?.etag ?? etag,
		}
	} catch (error) {
		throw toApiError(error)
	}
}

/**
 * Open challenges the user may join.
 *
 * @return {Promise<GameSummary[]>}
 */
export const getOpenChallenges = async () => (await request('get', '/games/open'))?.games ?? []

/**
 * A page of finished games.
 *
 * @param {object} [query] filters and paging: status, opponent, result, rated, cursor, limit
 * @return {Promise<{games: GameSummary[], next: string|null}>}
 */
export const getHistory = (query = {}) => request('get', '/games/history', { params: query })

/**
 * The user's recent online opponents.
 *
 * @return {Promise<UserRef[]>}
 */
export const getRecentOpponents = async () => (await request('get', '/users/recent'))?.users ?? []

/**
 * Whether a game against this opponent can be rated, and why not.
 *
 * @param {string} opponent user id
 * @return {Promise<{rated: boolean, reason: string|null}>}
 */
export const checkRated = (opponent) => request('get', '/games/rated-check', { params: { opponent } })

/**
 * Search users through the core autocomplete (the current user is removed).
 *
 * @param {string} term search text
 * @param {object} [options] options
 * @param {number} [options.limit] maximum number of results
 * @return {Promise<Array<{userId: string, displayName: string, subline: string, status: object|null}>>}
 */
export async function searchUsers(term, { limit = 10 } = {}) {
	try {
		const response = await axios.get(generateOcsUrl('core/autocomplete/get'), {
			params: { search: term, itemType: 'quantumchess', itemId: 'new', shareTypes: [0], limit },
		})
		const me = globalThis.OC?.getCurrentUser?.()?.uid ?? null
		return (response.data?.ocs?.data ?? [])
			.filter((u) => u.id !== me)
			.map((u) => ({ userId: u.id, displayName: u.label, subline: u.subline ?? '', status: u.status ?? null }))
	} catch (error) {
		throw toApiError(error)
	}
}

// --- Creating, reading and playing online games ----------------------------------------------------------------------

/**
 * Invite a user, or post an open challenge when `opponent` is null.
 *
 * @param {object} body opponent, color, rated, timeControl, message, scopeGroup
 * @return {Promise<GameLive>}
 */
export const createGame = async (body) => game(await request('post', '/games', { data: body }))

/**
 * A game with all its moves and chat.
 *
 * @param {number} id game id
 * @return {Promise<GameFull>}
 */
export const getGame = async (id) => game(await request('get', `/games/${id}`))

/**
 * What changed in a game since the given revision, ply and chat id.
 *
 * @param {number} id game id
 * @param {object} query what the client has already seen
 * @param {number} query.rev game revision
 * @param {number} query.ply number of moves
 * @param {number} [query.chat] last chat message id
 * @param {boolean|number} [query.watching] the game is on screen
 * @param {{signal?: AbortSignal}} [options] cancellation
 * @return {Promise<{changed: boolean, rev: number, now: number, game?: GameLive, moves?: MoveDTO[], chat?: ChatDTO[]}>}
 *   only what changed
 */
export function pollGame(id, { rev, ply, chat = 0, watching = 0 } = {}, { signal } = {}) {
	return request('get', `/games/${id}/poll`, { params: { rev, ply, chat, watching: watching ? 1 : 0 }, signal })
}

/**
 * Accept an invitation.
 *
 * @param {number} id game id
 * @return {Promise<GameLive>}
 */
export const acceptGame = async (id) => game(await request('post', `/games/${id}/accept`))

/**
 * Decline an invitation.
 *
 * @param {number} id game id
 * @return {Promise<GameLive>}
 */
export const declineGame = async (id) => game(await request('post', `/games/${id}/decline`))

/**
 * Withdraw the user's own invitation or open challenge.
 *
 * @param {number} id game id
 * @return {Promise<GameLive>}
 */
export const cancelGame = async (id) => game(await request('post', `/games/${id}/cancel`))

/**
 * Join an open challenge.
 *
 * @param {number} id game id
 * @return {Promise<GameLive>}
 */
export const joinGame = async (id) => game(await request('post', `/games/${id}/join`))

/**
 * Play a move. Sending the same `clientId` again returns the stored move instead of playing it twice.
 *
 * @param {number} id game id
 * @param {object} body the move
 * @param {string} body.code move code
 * @param {number} body.ply ply of the position the move was chosen in
 * @param {string} body.clientId client-generated id of this move
 * @param {number} [body.thinkMs] time the player took
 * @return {Promise<MoveResponse>}
 */
export function sendMove(id, { code, ply, clientId, thinkMs }) {
	return request('post', `/games/${id}/moves`, { data: { code, ply, clientId, thinkMs } })
}

/**
 * Resign a game.
 *
 * @param {number} id game id
 * @return {Promise<GameLive>}
 */
export const resignGame = async (id) => game(await request('post', `/games/${id}/resign`))

/**
 * Abort a game before it really started.
 *
 * @param {number} id game id
 * @return {Promise<GameLive>}
 */
export const abortGame = async (id) => game(await request('post', `/games/${id}/abort`))

/**
 * Offer a draw, or answer the opponent's offer.
 *
 * @param {number} id game id
 * @param {'offer'|'accept'|'decline'} action draw action
 * @return {Promise<GameLive>}
 */
export const drawAction = async (id, action) => game(await request('post', `/games/${id}/draw`, { data: { action } }))

/**
 * Send a chat message or a quick phrase.
 *
 * @param {number} id game id
 * @param {{message: string}|{phrase: string}} body text or quick phrase
 * @return {Promise<{message: ChatDTO, rev: number}>}
 */
export const sendChat = (id, body) => request('post', `/games/${id}/chat`, { data: body })

/**
 * Mute or unmute the chat of a game for the user.
 *
 * @param {number} id game id
 * @param {boolean} muted mute state
 * @return {Promise<{muted: boolean}>}
 */
export const muteChat = (id, muted) => request('put', `/games/${id}/mute`, { data: { muted } })

/**
 * Offer a rematch, or accept the opponent's offer.
 *
 * @param {number} id finished game id
 * @return {Promise<GameLive>} the rematch game
 */
export const requestRematch = async (id) => game(await request('post', `/games/${id}/rematch`))

// --- Stats, trainer progress, preferences ----------------------------------------------------------------------------

/**
 * The user's statistics and rating history.
 *
 * @return {Promise<object>}
 */
export const getStats = () => request('get', '/stats')

/**
 * The leaderboard, optionally of one group.
 *
 * @param {{group?: string}} [query] group id
 * @return {Promise<object>}
 */
export const getLeaderboard = ({ group } = {}) => request('get', '/leaderboard', { params: group ? { group } : {} })

/**
 * Count a finished local game in the statistics.
 *
 * @param {object} body opponent, level or persona, result, color
 * @return {Promise<{local: object}>}
 */
export const recordLocalResult = (body) => request('post', '/stats/local', { data: body })

/**
 * The trainer progress stored on the server.
 *
 * @return {Promise<object>} the progress document
 */
export const getTrainerProgress = async () => (await request('get', '/trainer/progress'))?.progress ?? {}

/**
 * Store the trainer progress; the server merges it with what it has.
 *
 * @param {object} doc progress document
 * @return {Promise<object>} the merged document
 */
export async function saveTrainerProgress(doc) {
	return (await request('put', '/trainer/progress', { data: { progress: doc } }))?.progress ?? {}
}

/**
 * Store the in-app preferences.
 *
 * @param {object} prefs the whole preferences document
 * @return {Promise<object>} the stored document
 */
export async function savePreferences(prefs) {
	return (await request('put', '/settings/preferences', { data: { preferences: prefs } }))?.preferences ?? prefs
}

// --- LLM opponents and the coach chat --------------------------------------------------------------------------------

/**
 * The LLM sources and whether the user may use them.
 *
 * @return {Promise<object>}
 */
export const getAiSources = () => request('get', '/ai/providers')

/**
 * The models a source offers.
 *
 * @param {string} source nextcloud | shared | personal
 * @return {Promise<{models: object[], chosenByAdmin: boolean}>}
 */
export const getAiModels = (source) => request('get', '/ai/models', { params: { source } })

/**
 * Ask the LLM opponent for a move.
 *
 * @param {object} body position, candidate moves, persona and source (docs/development/api.md)
 * @param {{signal?: AbortSignal, timeout?: number}} [options] cancellation and timeout
 * @return {Promise<object>} {status: 'done', …} or {status: 'pending', taskId}
 */
export function requestAiMove(body, { signal, timeout } = {}) {
	return request('post', '/ai/move', { data: body, signal, timeout })
}

/**
 * Ask the LLM coach a question about a position.
 *
 * @param {object} body position, question and source (docs/development/api.md)
 * @param {{signal?: AbortSignal, timeout?: number}} [options] cancellation and timeout
 * @return {Promise<object>} {status: 'done', …} or {status: 'pending', taskId}
 */
export function requestCoach(body, { signal, timeout } = {}) {
	return request('post', '/ai/coach', { data: body, signal, timeout })
}

/**
 * The state of a Nextcloud Assistant task.
 *
 * @param {number} taskId task id
 * @param {{signal?: AbortSignal}} [options] cancellation
 * @return {Promise<object>}
 */
export const getAiTask = (taskId, { signal } = {}) => request('get', `/ai/task/${taskId}`, { signal })

/**
 * Cancel a Nextcloud Assistant task.
 *
 * @param {number} taskId task id
 * @return {Promise<object>}
 */
export const cancelAiTask = (taskId) => request('delete', `/ai/task/${taskId}`)

/**
 * Remember that the user has read the privacy notice of a source.
 *
 * @param {string} source LLM source id
 * @return {Promise<{acked: string[]}>}
 */
export const ackAiNotice = (source) => request('post', '/ai/notice', { data: { source } })

// --- Settings --------------------------------------------------------------------------------------------------------

/**
 * The user's personal LLM settings.
 *
 * @return {Promise<object>}
 */
export const getPersonalSettings = () => request('get', '/settings/personal')

/**
 * Change personal LLM settings.
 *
 * @param {object} patch changed settings
 * @return {Promise<object>}
 */
export const savePersonalSettings = (patch) => request('put', '/settings/personal', { data: patch })

/**
 * The user's online game settings.
 *
 * @return {Promise<object>}
 */
export const getMultiplayerSettings = () => request('get', '/settings/multiplayer')

/**
 * Change online game settings.
 *
 * @param {object} patch changed settings
 * @return {Promise<object>}
 */
export const saveMultiplayerSettings = (patch) => request('put', '/settings/multiplayer', { data: patch })

/**
 * The admin settings with the server status.
 *
 * @return {Promise<object>}
 */
export const getAdminSettings = () => request('get', '/settings/admin')

/**
 * Change admin settings.
 *
 * @param {object} patch changed settings
 * @return {Promise<object>}
 */
export const saveAdminSettings = (patch) => request('put', '/settings/admin', { data: patch })

/**
 * Store an admin secret after the password confirmation.
 *
 * @param {string} key secret key
 * @param {string} value secret value ('' removes it)
 * @return {Promise<object>}
 */
export async function saveAdminSecret(key, value) {
	const { confirmPassword } = await import('@nextcloud/password-confirmation')
	await confirmPassword()
	return request('put', '/settings/admin/secret', { data: { key, value } })
}

/**
 * Test an LLM connection with the given settings.
 *
 * @param {object} body connection to test
 * @return {Promise<object>}
 */
export const testAiConnection = (body) => request('post', '/settings/test', { data: body })
