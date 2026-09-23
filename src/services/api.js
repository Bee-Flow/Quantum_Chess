/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * One function per HTTP route (SPEC §7.3, §14.3.1). Other modules call these functions and never use axios directly.
 *
 * Return values: the response body, unwrapped where SPEC §14.3.1 names the inner value — `{game}` responses return
 * the game (GameLive / GameSummary / GameFull), `{games}` of the open list returns the array, `{users}` returns the
 * array, `{progress}` returns the progress document, `{preferences}` the preferences. Every other function returns
 * the body as sent by the server. Failures throw `ApiError`.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'

export class ApiError extends Error {
	/**
	 * @param {object} fields error fields
	 * @param {number} fields.status HTTP status, 0 for network errors
	 * @param {string} fields.code body.error, or 'network' | 'timeout' | 'http_<status>'
	 * @param {object|null} fields.data parsed body
	 * @param {number|null} fields.retryAfter seconds
	 * @param {string} [fields.message] message
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
 * Convert an axios failure into an ApiError (AbortErrors are rethrown unchanged).
 *
 * @param {any} error axios error
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
 * @param {string} path API path
 * @param {object} [options] {data, params, signal, headers, timeout}
 * @param options.data
 * @param options.params
 * @param options.signal
 * @param options.headers
 * @param options.timeout
 * @return {Promise<any>}
 */
async function request(method, path, { data, params, signal, headers, timeout } = {}) {
	try {
		const response = await axios.request({ method, url: apiUrl(path), data, params, signal, headers, timeout })
		return response.data
	} catch (error) {
		throw toApiError(error)
	}
}

const game = (body) => body?.game ?? body

// --- Lobby and lists ---------------------------------------------------------------------------------------------------

/** @return {Promise<object>} LobbyDTO */
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

/** @return {Promise<object[]>} GameSummary[] */
export const getOpenChallenges = async () => (await request('get', '/games/open'))?.games ?? []

/**
 * @param {object} query {status, opponent, result, rated, cursor, limit}
 * @return {Promise<{games: object[], next: string|null}>}
 */
export const getHistory = (query = {}) => request('get', '/games/history', { params: query })

/** @return {Promise<object[]>} UserRef[] */
export const getRecentOpponents = async () => (await request('get', '/users/recent'))?.users ?? []

/**
 * @param {string} opponent user id
 * @return {Promise<{rated: boolean, reason: string|null}>}
 */
export const checkRated = (opponent) => request('get', '/games/rated-check', { params: { opponent } })

/**
 * Search users through the core autocomplete (the current user is removed).
 *
 * @param {string} term search text
 * @param {object} [options] {limit}
 * @param options.limit
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

// --- Creating, reading and playing online games ------------------------------------------------------------------------

/**
 * @param {object} body {opponent, color, rated, timeControl, message, scopeGroup}
 * @return {Promise<object>} GameLive
 */
export const createGame = async (body) => game(await request('post', '/games', { data: body }))

/**
 * @param {number} id game id
 * @return {Promise<object>} GameFull
 */
export const getGame = async (id) => game(await request('get', `/games/${id}`))

/**
 * @param {number} id game id
 * @param {object} query {rev, ply, chat, watching}
 * @param {object} [options] {signal}
 * @param query.rev
 * @param query.ply
 * @param query.chat
 * @param query.watching
 * @param options.signal
 * @return {Promise<object>} poll body
 */
export function pollGame(id, { rev, ply, chat = 0, watching = 0 } = {}, { signal } = {}) {
	return request('get', `/games/${id}/poll`, { params: { rev, ply, chat, watching: watching ? 1 : 0 }, signal })
}

export const acceptGame = async (id) => game(await request('post', `/games/${id}/accept`))
export const declineGame = async (id) => game(await request('post', `/games/${id}/decline`))
export const cancelGame = async (id) => game(await request('post', `/games/${id}/cancel`))
export const joinGame = async (id) => game(await request('post', `/games/${id}/join`))

/**
 * @param {number} id game id
 * @param {object} body {code, ply, clientId, thinkMs}
 * @param body.code
 * @param body.ply
 * @param body.clientId
 * @param body.thinkMs
 * @return {Promise<object>} move response {game, move, measurement, chain, rev, now, replayed}
 */
export function sendMove(id, { code, ply, clientId, thinkMs }) {
	return request('post', `/games/${id}/moves`, { data: { code, ply, clientId, thinkMs } })
}

export const resignGame = async (id) => game(await request('post', `/games/${id}/resign`))
export const abortGame = async (id) => game(await request('post', `/games/${id}/abort`))

/**
 * @param {number} id game id
 * @param {'offer'|'accept'|'decline'} action draw action
 * @return {Promise<object>} GameLive
 */
export const drawAction = async (id, action) => game(await request('post', `/games/${id}/draw`, { data: { action } }))

/**
 * @param {number} id game id
 * @param {{message: string}|{phrase: string}} body text or quick phrase
 * @return {Promise<{message: object, rev: number}>}
 */
export const sendChat = (id, body) => request('post', `/games/${id}/chat`, { data: body })

/**
 * @param {number} id game id
 * @param {boolean} muted mute state
 * @return {Promise<{muted: boolean}>}
 */
export const muteChat = (id, muted) => request('put', `/games/${id}/mute`, { data: { muted } })

export const requestRematch = async (id) => game(await request('post', `/games/${id}/rematch`))

// --- Stats, trainer progress, preferences ------------------------------------------------------------------------------

export const getStats = () => request('get', '/stats')

/**
 * @param {object} [query] {group}
 * @param query.group
 * @return {Promise<object>}
 */
export const getLeaderboard = ({ group } = {}) => request('get', '/leaderboard', { params: group ? { group } : {} })

/**
 * @param {object} body {opponent, level?, persona?, result, color}
 * @return {Promise<{local: object}>}
 */
export const recordLocalResult = (body) => request('post', '/stats/local', { data: body })

/** @return {Promise<object>} the progress document */
export const getTrainerProgress = async () => (await request('get', '/trainer/progress'))?.progress ?? {}

/**
 * @param {object} doc progress document
 * @return {Promise<object>} the merged document
 */
export const saveTrainerProgress = async (doc) => (await request('put', '/trainer/progress', { data: { progress: doc } }))?.progress ?? {}

/**
 * @param {object} prefs the whole preferences document
 * @return {Promise<object>} the stored document
 */
export const savePreferences = async (prefs) => (await request('put', '/settings/preferences', { data: { preferences: prefs } }))?.preferences ?? prefs

// --- AI --------------------------------------------------------------------------------------------------------------

export const getAiSources = () => request('get', '/ai/providers')

/**
 * @param {string} source nextcloud | shared | personal
 * @return {Promise<{models: object[], chosenByAdmin: boolean}>}
 */
export const getAiModels = (source) => request('get', '/ai/models', { params: { source } })

/**
 * @param {object} body SPEC §7.4.7
 * @param {object} [options] {signal, timeout}
 * @param options.signal
 * @param options.timeout
 * @return {Promise<object>} {status: 'done', …} or {status: 'pending', taskId}
 */
export const requestAiMove = (body, { signal, timeout } = {}) => request('post', '/ai/move', { data: body, signal, timeout })

/**
 * @param {object} body SPEC §7.4.7
 * @param {object} [options] {signal, timeout}
 * @param options.signal
 * @param options.timeout
 * @return {Promise<object>}
 */
export const requestCoach = (body, { signal, timeout } = {}) => request('post', '/ai/coach', { data: body, signal, timeout })

/**
 * @param {number} taskId task id
 * @param {object} [options] {signal}
 * @param options.signal
 * @return {Promise<object>}
 */
export const getAiTask = (taskId, { signal } = {}) => request('get', `/ai/task/${taskId}`, { signal })

export const cancelAiTask = (taskId) => request('delete', `/ai/task/${taskId}`)

/**
 * @param {string} source AI source id
 * @return {Promise<{acked: string[]}>}
 */
export const ackAiNotice = (source) => request('post', '/ai/notice', { data: { source } })

// --- Settings ----------------------------------------------------------------------------------------------------------

export const getPersonalSettings = () => request('get', '/settings/personal')
export const savePersonalSettings = (patch) => request('put', '/settings/personal', { data: patch })
export const getMultiplayerSettings = () => request('get', '/settings/multiplayer')
export const saveMultiplayerSettings = (patch) => request('put', '/settings/multiplayer', { data: patch })
export const getAdminSettings = () => request('get', '/settings/admin')
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
 * @param {object} body connection to test
 * @return {Promise<object>}
 */
export const testAiConnection = (body) => request('post', '/settings/test', { data: body })
