#!/usr/bin/env node
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Checks the references in code comments and documentation that the comment policy
 * (docs/development/architecture.md, section 9) is about:
 *
 * - every `docs/….md` path named in the code exists;
 * - no comment cites a planning document by its abbreviation and a section number, carries a module marker or an
 *   owner tag, or has a TODO without an issue number;
 * - no code and no Markdown document outside the session folder names the working notes of a development session
 *   (the handoff/ folder, its decision, change and research files), which are not shipped; only the files that
 *   configure that folder name it;
 * - outside the rules engine and the computer player, a section sign only appears on a line that names
 *   docs/engine-rules.md;
 * - every relative link in the maintained Markdown documents resolves to an existing file.
 *
 *   node tools/check-references.mjs        (npm run lint:refs)
 *
 * Exits 1 and lists every finding as `file:line: problem`.
 */

/* eslint-disable no-console -- a command-line tool */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = relative(ROOT, fileURLToPath(import.meta.url))

/** Where code and its comments live. */
const CODE = ['src/', 'lib/', 'tests/', 'tools/', 'appinfo/', 'templates/', '.github/']
const CODE_FILES = [
	'Makefile',
	'package.json',
	'composer.json',
	'psalm.xml',
	'eslint.config.js',
	'vite.config.js',
	'vitest.config.js',
]
/** Generated files, which are checked by their own tests. */
const GENERATED = [/^tests\/fixtures\/engine\/.*\.json$/]
/**
 * The rules engine and the computer player, whose file headers declare that bare section numbers refer to the
 * rules.
 */
const ENGINE = [
	'src/engine/',
	'src/ai/',
	'lib/Engine/',
	'tests/js/engine/',
	'tests/js/ai/',
	'tests/php/Unit/Engine/',
	'tests/fixtures/',
]
const SECTION = '\u00a7'
/** The working notes of a development session, kept in handoff/ while it runs and never shipped. */
const SESSION_FOLDER = 'handoff/'
const SESSION_NOTES = new RegExp([
	'\\bhandoff\\b',
	'\\bLEAD-DECISIONS\\b',
	'\\bCORE-CHANGES\\b',
	'\\bIMPLEMENTING\\.md\\b',
	'\\bmultiverse-final\\b',
	'\\blead decisions?\\b',
	'\\bresearch spec\\b',
].join('|'), 'i')
const SESSION_PROBLEM = 'names the session notes in handoff/, which are not shipped; state the rule itself, or name '
	+ 'docs/variants.md or docs/development/architecture.md'
/** The files that configure the session folder (ignore, lint and licence exclusions) and so name it on purpose. */
const NAMES_SESSION_FOLDER = ['Makefile', 'eslint.config.js', 'tools/check-line-length.mjs']
const FORBIDDEN = [
	[
		new RegExp(`\\b(spec|gd|er) ?${SECTION}`, 'i'),
		'cites a planning document; state the rule itself, or name docs/engine-rules.md',
	],
	[/\u2039[a-z-]+\u203a/, 'module marker'],
	[/\bOwner: /, 'owner tag'],
	[/\b(TODO|FIXME)\b(?!\(#\d+\))/, 'a TODO names its issue: TODO(#123)'],
	[SESSION_NOTES, SESSION_PROBLEM, NAMES_SESSION_FOLDER],
]
const TEXT = /\.(js|mjs|cjs|vue|php|md|yml|yaml|json|xml|scss|css|html|txt)$|^Makefile$|\/Makefile$/

/**
 * @return {string[]} the files of the repository: tracked, and untracked but not ignored
 */
function repositoryFiles() {
	const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
	return [...new Set(out.split('\0').filter(Boolean))].filter((file) => existsSync(join(ROOT, file))).sort()
}

const files = repositoryFiles()
const problems = []

/**
 * @param {string} file repository path
 * @param {number} line 1-based line number
 * @param {string} problem what is wrong
 */
function report(file, line, problem) {
	problems.push(`${file}:${line}: ${problem}`)
}

const codeFiles = files.filter((file) => (CODE.some((dir) => file.startsWith(dir)) || CODE_FILES.includes(file))
	&& TEXT.test(file) && file !== SELF && !GENERATED.some((re) => re.test(file)))

for (const file of codeFiles) {
	const inEngine = ENGINE.some((dir) => file.startsWith(dir))
	readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((text, i) => {
		for (const match of text.matchAll(/\bdocs\/[\w./-]*\.md\b/g)) {
			const path = match[0]
			if (!existsSync(join(ROOT, path))) {
				report(file, i + 1, `${path} does not exist`)
			}
		}
		for (const [pattern, problem, allowedIn = []] of FORBIDDEN) {
			if (pattern.test(text) && !allowedIn.includes(file)) {
				report(file, i + 1, problem)
			}
		}
		if (!inEngine && text.includes(SECTION) && !text.includes('docs/engine-rules.md')) {
			report(
				file,
				i + 1,
				`a section number outside the rules engine names its document: "docs/engine-rules.md ${SECTION}9.4"`,
			)
		}
	})
}

const documents = files.filter((file) => file.endsWith('.md'))
for (const file of documents) {
	// the code files among the documents had the session-notes check with the other forbidden patterns above
	const checkNotes = !file.startsWith(SESSION_FOLDER) && !codeFiles.includes(file)
	readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((text, i) => {
		if (checkNotes && SESSION_NOTES.test(text)) {
			report(file, i + 1, SESSION_PROBLEM)
		}
		for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
			const target = match[1].split('#')[0]
			if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
				continue
			}
			const path = normalize(join(dirname(file), decodeURIComponent(target)))
			if (!existsSync(join(ROOT, path))) {
				report(file, i + 1, `link to ${match[1]}: ${path} does not exist`)
			}
		}
	})
}

for (const problem of problems) {
	console.error(problem)
}
console.info(`${codeFiles.length} code files and ${documents.length} documents checked: ${
	problems.length ? `${problems.length} problems` : 'no problems'
}`)
process.exitCode = problems.length ? 1 : 0
