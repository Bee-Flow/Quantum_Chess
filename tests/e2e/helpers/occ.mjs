/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Server-side helpers: occ, test users and resetting the app's data. They need the Nextcloud server on the same
 * machine (QC_NC_ROOT) or an occ command line (QC_OCC, e.g. "docker exec -u www-data nextcloud php occ").
 */
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { env, getUser } from './env.mjs'

const run = promisify(execFile)
const helpersDir = dirname(fileURLToPath(import.meta.url))

/**
 * Run an occ command.
 *
 * @param {string[]} args arguments, e.g. ['user:info', 'bob']
 * @param {object} [options] options
 * @param {Record<string, string>} [options.env] extra environment variables (e.g. OC_PASS)
 * @param {boolean} [options.allowFailure] resolve with the exit code instead of throwing
 * @return {Promise<{stdout: string, stderr: string, code: number}>}
 */
export async function occ(args, { env: extraEnv = {}, allowFailure = false } = {}) {
	if (!env.occ) {
		throw new Error('occ is not available: set QC_NC_ROOT to the Nextcloud server directory or QC_OCC to an occ command')
	}
	const [command, ...prefix] = env.occ
	try {
		const { stdout, stderr } = await run(command, [...prefix, '--no-interaction', '--no-ansi', ...args], {
			env: { ...process.env, ...extraEnv },
			maxBuffer: 16 * 1024 * 1024,
		})
		return { stdout, stderr, code: 0 }
	} catch (error) {
		if (allowFailure && typeof error.code === 'number') {
			return { stdout: error.stdout ?? '', stderr: error.stderr ?? '', code: error.code }
		}
		throw new Error(`occ ${args.join(' ')} failed: ${(error.stderr || error.stdout || error.message).trim()}`, { cause: error })
	}
}

/**
 * Create a user, or reset the password of an existing one so that logins always work. The display name of an
 * existing user is left alone.
 *
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @return {Promise<void>}
 */
export async function ensureUser(who) {
	const user = getUser(who)
	const passwordEnv = { OC_PASS: user.password }
	const exists = (await occ(['user:info', user.uid], { allowFailure: true })).code === 0
	if (exists) {
		await occ(['user:resetpassword', '--password-from-env', user.uid], { env: passwordEnv })
	} else {
		const groups = user.admin ? ['--group=admin'] : []
		await occ(['user:add', '--password-from-env', `--display-name=${user.displayName}`, ...groups, user.uid], { env: passwordEnv })
	}
	await occ(['user:enable', user.uid], { allowFailure: true })
}

/**
 * Create or refresh every test user of env.users.
 *
 * @return {Promise<void>}
 */
export async function ensureUsers() {
	for (const key of Object.keys(env.users)) {
		await ensureUser(key)
	}
}

/**
 * Delete what Quantum Chess stored on the server: games, moves, chat and ratings, every user's app settings
 * (preferences, trainer progress, local statistics, AI settings), the app's notifications and its distributed cache.
 * Admin settings stay unless `adminSettings` is set.
 *
 * @param {object} [options] options
 * @param {boolean} [options.adminSettings] also reset the admin settings to their defaults
 * @return {Promise<string>} summary printed by the reset script
 */
export async function resetAppData({ adminSettings = false } = {}) {
	if (!env.serverRoot) {
		throw new Error('resetAppData() needs the Nextcloud server on this machine: set QC_NC_ROOT')
	}
	const args = [join(helpersDir, 'reset-app-data.php'), env.serverRoot]
	if (adminSettings) {
		args.push('--admin-settings')
	}
	try {
		const { stdout } = await run('php', args, { maxBuffer: 4 * 1024 * 1024 })
		return stdout.trim()
	} catch (error) {
		throw new Error(`Resetting the app data failed: ${(error.stderr || error.stdout || error.message).trim()}`, { cause: error })
	}
}

/**
 * Set a user setting of the app, e.g. setUserSetting('bob', 'invite_policy', 'nobody').
 *
 * @param {string} who test user key or uid
 * @param {string} key user setting key of the app, e.g. 'notify_your_turn'
 * @param {string} value value
 * @return {Promise<void>}
 */
export async function setUserSetting(who, key, value) {
	await occ(['user:setting', getUser(who).uid, 'quantumchess', key, value])
}

/**
 * Set an admin setting of the app (app config), e.g. setAppConfig('chat_enabled', 'false', 'boolean').
 *
 * @param {string} key admin setting key, e.g. 'chat_enabled'
 * @param {string} value value
 * @param {'string'|'integer'|'float'|'boolean'|'array'} [type] value type
 * @return {Promise<void>}
 */
export async function setAppConfig(key, value, type = 'string') {
	await occ(['config:app:set', 'quantumchess', key, `--value=${value}`, `--type=${type}`])
}
