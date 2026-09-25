#!/usr/bin/env node
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Sets the app version in appinfo/info.xml, package.json, package-lock.json and CHANGELOG.md.
 *
 * The release workflow runs it with the version of the release tag, so publishing a GitHub release is all a
 * maintainer does: nobody bumps versions by hand.
 *
 *   node tools/set-version.mjs 1.2.0 [--notes-file notes.md] [--date 2026-10-01] [--no-downgrade]
 *
 * CHANGELOG.md follows Keep a Changelog. For a final release the `## [Unreleased]` section becomes `## [1.2.0] -
 * <date>`; when that section is empty, the release notes from `--notes-file` (the description of the GitHub release)
 * are used instead. A pre-release (a version with a `-`, e.g. 1.2.0-beta.1) keeps its notes under `## [Unreleased]`,
 * because the App Store shows that section for pre-releases. Running the tool again with the same version changes
 * nothing; with `--no-downgrade` it also leaves files alone that already carry a newer version.
 */

/* eslint-disable no-console -- a command-line tool */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const FALLBACK_NOTES = 'Maintenance release.'
const PRE_RELEASE_NOTES = 'Preview release.'

/**
 * @param {string} version the version to check
 * @return {boolean} whether it is a semantic version such as 1.2.0 or 1.2.0-beta.1
 */
export function isVersion(version) {
	return VERSION.test(version)
}

/**
 * Orders two versions by semantic versioning precedence: 1.2.0-beta.1 < 1.2.0-beta.2 < 1.2.0-rc.1 < 1.2.0 < 1.10.0.
 *
 * @param {string} a a version
 * @param {string} b another version
 * @return {number} a negative number, zero or a positive number when `a` is older than, equal to or newer than `b`
 */
export function compareVersions(a, b) {
	const [coreA, preA] = splitVersion(a)
	const [coreB, preB] = splitVersion(b)
	for (let i = 0; i < 3; i++) {
		if (coreA[i] !== coreB[i]) {
			return coreA[i] - coreB[i]
		}
	}
	if (!preA.length || !preB.length) {
		return preB.length - preA.length
	}
	for (let i = 0; i < Math.min(preA.length, preB.length); i++) {
		if (preA[i] === preB[i]) {
			continue
		}
		const [numericA, numericB] = [/^\d+$/.test(preA[i]), /^\d+$/.test(preB[i])]
		if (numericA && numericB) {
			return Number(preA[i]) - Number(preB[i])
		}
		if (numericA !== numericB) {
			return numericA ? -1 : 1
		}
		return preA[i] < preB[i] ? -1 : 1
	}
	return preA.length - preB.length
}

/**
 * @param {string} version a version such as 1.2.0-beta.1
 * @return {[number[], string[]]} the numeric major, minor and patch parts and the pre-release identifiers
 */
function splitVersion(version) {
	const dash = version.indexOf('-')
	const core = dash === -1 ? version : version.slice(0, dash)
	return [core.split('.').map(Number), dash === -1 ? [] : version.slice(dash + 1).split('.')]
}

/**
 * @param {string} xml the contents of appinfo/info.xml
 * @return {string} the app's version
 */
export function getInfoXmlVersion(xml) {
	const match = xml.match(/<version>([^<]*)<\/version>/)
	if (!match) {
		throw new Error('appinfo/info.xml has no <version> element')
	}
	return match[1].trim()
}

/**
 * @param {string} xml the contents of appinfo/info.xml
 * @param {string} version the new version
 * @return {string} the contents with the app's `<version>` replaced
 */
export function setInfoXmlVersion(xml, version) {
	getInfoXmlVersion(xml)
	return xml.replace(/<version>[^<]*<\/version>/, `<version>${version}</version>`)
}

/**
 * @param {string} json the contents of package.json or package-lock.json
 * @param {string} version the new version
 * @return {string} the contents with the package version (and the lock file's root package) replaced
 */
export function setPackageVersion(json, version) {
	const data = JSON.parse(json)
	data.version = version
	if (data.packages?.['']) {
		data.packages[''].version = version
	}
	return JSON.stringify(data, null, 2) + '\n'
}

/**
 * Demotes headings in release notes below the level of a changelog section, so that the "## What's Changed" of
 * GitHub's generated notes does not start a new section.
 *
 * @param {string} notes release notes in Markdown
 * @return {string} the notes, trimmed, with Unix line ends and no heading above level 3
 */
export function normalizeNotes(notes) {
	return notes
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/^#{1,2}(?=\s)/, '###'))
		.join('\n')
		.trim()
}

/**
 * @param {string} markdown the contents of CHANGELOG.md
 * @param {string} version the new version
 * @param {object} options release details
 * @param {string} options.date the release date as YYYY-MM-DD
 * @param {string} [options.notes] release notes to use when `## [Unreleased]` is empty
 * @return {string} the changelog with the release recorded
 */
export function releaseChangelog(markdown, version, { date, notes = '' }) {
	const heading = markdown.match(/^## \[Unreleased\][^\n]*\n/m)
	if (!heading) {
		throw new Error('CHANGELOG.md has no "## [Unreleased]" section')
	}
	if (new RegExp(`^## \\[${escape(version)}\\]`, 'm').test(markdown)) {
		return markdown
	}
	const start = heading.index + heading[0].length
	const next = markdown.slice(start).search(/^## \[|^\[[^\]]+\]: /m)
	const end = next === -1 ? markdown.length : start + next
	const unreleased = markdown.slice(start, end).trim()
	const body = unreleased || normalizeNotes(notes)

	if (version.includes('-')) {
		if (unreleased) {
			return markdown
		}
		return markdown.slice(0, start) + `\n${body || PRE_RELEASE_NOTES}\n\n` + markdown.slice(end)
	}

	const section = `## [${version}] - ${date}\n\n${body || FALLBACK_NOTES}\n\n`
	return linkRelease(markdown.slice(0, start) + '\n' + section + markdown.slice(end), version)
}

/**
 * Points the `[Unreleased]` link at the changes since the new version and adds a link for the version itself.
 *
 * @param {string} markdown the contents of CHANGELOG.md
 * @param {string} version the new version
 * @return {string} the changelog with updated link references
 */
function linkRelease(markdown, version) {
	const link = markdown.match(/^\[Unreleased\]: (\S+)\/compare\/\S+\.\.\.HEAD$/m)
	if (!link) {
		return markdown
	}
	const repository = link[1]
	const tag = `v${version}`
	return markdown.replace(
		link[0],
		`[Unreleased]: ${repository}/compare/${tag}...HEAD\n[${version}]: ${repository}/releases/tag/${tag}`,
	)
}

/**
 * @param {string} text literal text
 * @return {string} the text with regular expression characters escaped
 */
function escape(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string[]} args the command-line arguments after the script name
 * @return {{version: string, notesFile: string|null, date: string, noDowngrade: boolean}} the parsed arguments
 */
function parseArgs(args) {
	const options = { version: '', notesFile: null, date: new Date().toISOString().slice(0, 10), noDowngrade: false }
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--no-downgrade') {
			options.noDowngrade = true
		} else if (args[i] === '--notes-file') {
			options.notesFile = args[++i]
		} else if (args[i] === '--date') {
			options.date = args[++i]
		} else {
			options.version = args[i].replace(/^v/, '')
		}
	}
	if (!isVersion(options.version)) {
		throw new Error(`"${options.version}" is not a version such as 1.2.0 or 1.2.0-beta.1`)
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
		throw new Error(`"${options.date}" is not a date such as 2026-10-01`)
	}
	return options
}

/**
 * Applies the new version to every file that carries it and reports which files changed.
 *
 * @param {string[]} args the command-line arguments after the script name
 */
function main(args) {
	const { version, notesFile, date, noDowngrade } = parseArgs(args)
	const current = getInfoXmlVersion(readFileSync(join(ROOT, 'appinfo/info.xml'), 'utf8'))
	if (noDowngrade && compareVersions(current, version) > 0) {
		console.log(`appinfo/info.xml has ${current}, which is newer than ${version}: nothing changed`)
		return
	}
	const notes = notesFile && existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : ''
	const files = {
		'appinfo/info.xml': (text) => setInfoXmlVersion(text, version),
		'package.json': (text) => setPackageVersion(text, version),
		'package-lock.json': (text) => setPackageVersion(text, version),
		'CHANGELOG.md': (text) => releaseChangelog(text, version, { date, notes }),
	}
	for (const [file, update] of Object.entries(files)) {
		const path = join(ROOT, file)
		const before = readFileSync(path, 'utf8')
		const after = update(before)
		if (after !== before) {
			writeFileSync(path, after)
		}
		console.log(`${after === before ? 'unchanged' : 'updated  '} ${file}`)
	}
	console.log(`Version ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		main(process.argv.slice(2))
	} catch (error) {
		console.error(error.message)
		process.exit(1)
	}
}
