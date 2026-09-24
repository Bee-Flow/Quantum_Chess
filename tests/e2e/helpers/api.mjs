/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Calls to the app's HTTP API as a test user: basic auth plus `OCS-APIRequest: true`, which also satisfies the CSRF
 * check of web routes (docs/development/api.md). The API specs use them, and the browser tests use them to set up
 * games.
 */
import { appUrl, env, getUser } from './env.mjs'

/**
 * An error response of the API.
 */
export class ApiError extends Error {
	/**
	 * @param {number} status HTTP status
	 * @param {any} body parsed JSON body or text
	 * @param {string} what method and path
	 */
	constructor(status, body, what) {
		super(`${what} → ${status} ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body)}`)
		this.status = status
		this.body = body
	}
}

/**
 * The headers that authenticate a request as a test user.
 *
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @return {Record<string, string>}
 */
export function authHeaders(who) {
	const user = getUser(who)
	return {
		Authorization: 'Basic ' + Buffer.from(`${user.uid}:${user.password}`).toString('base64'),
		'OCS-APIRequest': 'true',
		Accept: 'application/json',
	}
}

/**
 * Call a route of the app.
 *
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @param {string} method HTTP method
 * @param {string} path path below /apps/quantumchess/, e.g. 'api/games' or 'api/games/42/moves'
 * @param {object} [body] JSON body
 * @return {Promise<any>} parsed JSON (or text, or null for 204/304)
 */
export async function api(who, method, path, body) {
	const response = await fetch(appUrl(path), {
		method,
		headers: {
			...authHeaders(who),
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await response.text()
	let parsed = text
	try {
		parsed = text === '' ? null : JSON.parse(text)
	} catch {
		// not JSON: keep the text
	}
	if (!response.ok && response.status !== 304) {
		throw new ApiError(response.status, parsed, `${method} ${path}`)
	}
	return parsed
}

/**
 * Call an OCS route of the app (/ocs/v2.php/apps/quantumchess/…) and return `ocs.data`.
 *
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @param {string} method HTTP method
 * @param {string} path path below /ocs/v2.php/apps/quantumchess/, e.g. 'api/v1/games/42/accept'
 * @param {object} [body] JSON body
 * @return {Promise<any>}
 */
export async function ocs(who, method, path, body) {
	const response = await fetch(`${env.baseURL}/ocs/v2.php/apps/quantumchess/${path.replace(/^\//, '')}?format=json`, {
		method,
		headers: {
			...authHeaders(who),
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const json = await response.json().catch(() => null)
	if (!response.ok) {
		throw new ApiError(response.status, json, `OCS ${method} ${path}`)
	}
	return json?.ocs?.data
}

/**
 * Wait until Nextcloud answers status.php as installed and not in maintenance mode.
 *
 * @param {number} [timeoutMs] how long to wait
 * @return {Promise<object>} the status document
 */
export async function waitForServer(timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs
	let last = 'no answer'
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${env.baseURL}/status.php`)
			const status = await response.json()
			if (status.installed && !status.maintenance) {
				return status
			}
			last = JSON.stringify(status)
		} catch (error) {
			last = error.message
		}
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
	throw new Error(`Nextcloud at ${env.baseURL} is not ready (${last}); set QC_BASE_URL`)
}
