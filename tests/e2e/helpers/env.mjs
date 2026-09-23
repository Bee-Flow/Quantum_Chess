/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Settings of the end-to-end tests, read from environment variables (tests/e2e/README.md lists them all).
 * Defaults match the development Nextcloud of docs/SPEC.md §15.2.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Repository root (the app directory). */
export const appRoot = resolve(e2eDir, '..', '..')

/** Where Playwright writes results; the directory is ignored by git. */
export const resultsDir = join(appRoot, 'test-results')

/** Where the global setup stores one logged-in browser state per user. */
export const authDir = join(resultsDir, '.auth')

/**
 * Read the first non-empty environment variable of `names`.
 *
 * @param {string[]} names variable names in order of preference
 * @param {string} [fallback] value when none is set
 * @return {string|undefined}
 */
function read(names, fallback) {
	for (const name of names) {
		const value = process.env[name]
		if (value !== undefined && value !== '') {
			return value
		}
	}
	return fallback
}

/**
 * Root directory of the Nextcloud server (the directory holding `occ`): QC_NC_ROOT, else the server this app
 * sits in (apps/quantumchess or custom_apps/quantumchess), else the development server of SPEC §15.2.
 *
 * @return {string|null}
 */
function findServerRoot() {
	const candidates = [
		read(['QC_NC_ROOT', 'NC_ROOT']),
		resolve(appRoot, '..', '..'),
		'/tmp/claude-0/nc/server',
	].filter(Boolean)
	return candidates.find((dir) => existsSync(join(dir, 'occ'))) ?? null
}

/**
 * A test user.
 *
 * @typedef {object} TestUser
 * @property {string} uid login name
 * @property {string} password password
 * @property {string} displayName display name given to the user when the setup creates it
 * @property {boolean} admin whether the user is in the admin group
 */

/**
 * @param {string} key short name used in variable names (ADMIN, BOB, CAROL)
 * @param {string} uid default login name
 * @param {string} password default password
 * @param {string} displayName display name
 * @param {boolean} admin whether the user is an administrator
 * @return {TestUser}
 */
function user(key, uid, password, displayName, admin = false) {
	return {
		uid: read([`QC_${key}_USER`, `NC_${key}_USER`], uid),
		password: read([`QC_${key}_PASSWORD`, `NC_${key}_PASSWORD`], password),
		displayName,
		admin,
	}
}

const serverRoot = findServerRoot()
const occOverride = read(['QC_OCC'])

export const env = Object.freeze({
	/** Base URL of Nextcloud, without a trailing slash. */
	baseURL: read(['QC_BASE_URL', 'NC_URL'], 'http://127.0.0.1:8080').replace(/\/+$/, ''),
	/** Chromium executable; undefined means the browser Playwright downloaded (`npx playwright install chromium`). */
	chromium: read(['QC_CHROMIUM']),
	/** Nextcloud server root, or null when occ is not reachable from here. */
	serverRoot,
	/** occ as an argument vector, e.g. ['php', '/srv/nextcloud/occ'], or null. QC_OCC is split at whitespace. */
	occ: occOverride ? occOverride.split(/\s+/) : (serverRoot ? ['php', join(serverRoot, 'occ')] : null),
	/** Create or refresh the test users with occ during the global setup (QC_SETUP_USERS=0 turns it off). */
	setupUsers: read(['QC_SETUP_USERS'], '1') !== '0',
	/** Front controller prefix: '/index.php' unless the server has pretty URLs (QC_PRETTY_URLS=1). */
	indexPhp: read(['QC_PRETTY_URLS'], '0') === '1' ? '' : '/index.php',
	users: Object.freeze({
		admin: user('ADMIN', 'admin', 'QuantumAdmin!2026', 'Alice Admin', true),
		bob: user('BOB', 'bob', 'QuantumBob!2026', 'Bob Builder'),
		carol: user('CAROL', 'carol', 'QuantumCarol!2026', 'Carol Quantum'),
	}),
})

/**
 * Look up a test user by key (admin, bob, carol) or by uid.
 *
 * @param {string|TestUser} who key, uid or user object
 * @return {TestUser}
 */
export function getUser(who) {
	if (typeof who === 'object' && who !== null) {
		return who
	}
	const found = env.users[who] ?? Object.values(env.users).find((u) => u.uid === who)
	if (!found) {
		throw new Error(`Unknown test user "${who}"; use one of ${Object.keys(env.users).join(', ')}`)
	}
	return found
}

/**
 * URL of a page of the app, e.g. appUrl('#/game/42') → http://127.0.0.1:8080/index.php/apps/quantumchess/#/game/42.
 *
 * @param {string} [suffix] path or hash appended after /apps/quantumchess/
 * @return {string}
 */
export function appUrl(suffix = '') {
	return `${env.baseURL}${env.indexPhp}/apps/quantumchess/${suffix.replace(/^\//, '')}`
}
