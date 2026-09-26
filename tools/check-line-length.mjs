#!/usr/bin/env node
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Checks that no line of code is longer than the `max_line_length` of .editorconfig (tabs count to the next
 * `tab_width` stop), in the PHP, JavaScript, Vue, SCSS and YAML files of the repository.
 *
 * A line may only be longer when it holds a string literal or URL that does not fit on a line of its own at that
 * indentation: translatable sentences stay whole, so that the translation tools find them.
 *
 *   node tools/check-line-length.mjs        (npm run lint:lines)
 *
 * Exits 1 and lists every finding as `file:line: problem`.
 */

/* eslint-disable no-console -- a command-line tool */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CODE = /\.(php|js|mjs|cjs|vue|scss|css|ya?ml)$/
/** Built, vendored and generated files, whose .editorconfig sections unset the limit, and the session hand-over. */
const SKIPPED = /^(js|assets|vendor|node_modules|l10n|build|tests\/fixtures\/engine)\//
/**
 * String literals (single, double or back quotes, on one line) and URLs, with the concatenation operator that leads
 * a continuation line and the punctuation that closes them.
 */
const LITERAL = /(?:[.+] )?('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|https?:\/\/\S+)[,;)\]}]*/g

/**
 * @param {string} key a property of the `[*]` section of .editorconfig
 * @return {number} its value
 */
function editorconfig(key) {
	const all = readFileSync(join(ROOT, '.editorconfig'), 'utf8')
		.split(/^\[/m)
		.find((section) => section.startsWith('*]'))
	const match = all?.match(new RegExp(`^${key}\\s*=\\s*(\\d+)`, 'm'))
	if (!match) {
		throw new Error(`.editorconfig has no ${key} in its [*] section`)
	}
	return Number(match[1])
}

const LIMIT = editorconfig('max_line_length')
const TAB = editorconfig('tab_width')

/**
 * @param {string} text a line
 * @return {number} its width in columns, with tabs expanded to the next tab stop
 */
function width(text) {
	let column = 0
	for (const char of text) {
		column = char === '\t' ? column + TAB - (column % TAB) : column + 1
	}
	return column
}

/**
 * @param {string} text a line longer than the limit
 * @return {boolean} it holds a literal too long for a line of its own at this indentation, with its leading
 *   operator and closing punctuation (a trailing comma, a closing parenthesis)
 */
function unbreakable(text) {
	const indent = width(text.match(/^\s*/)[0])
	return [...text.matchAll(LITERAL)].some((match) => indent + width(match[0]) > LIMIT)
}

const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' })
const files = [...new Set(out.split('\0'))]
	.filter((file) => CODE.test(file) && !SKIPPED.test(file) && existsSync(join(ROOT, file)))
	.sort()
const problems = []

for (const file of files) {
	readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((text, i) => {
		const columns = width(text)
		if (columns > LIMIT && !unbreakable(text)) {
			problems.push(`${file}:${i + 1}: ${columns} columns (limit ${LIMIT})`)
		}
	})
}

for (const problem of problems) {
	console.error(problem)
}
console.info(`${files.length} files checked: ${problems.length ? `${problems.length} lines too long` : 'no problems'}`)
process.exitCode = problems.length ? 1 : 0
