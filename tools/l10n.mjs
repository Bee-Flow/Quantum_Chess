#!/usr/bin/env node
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Translation helper without external tools (translationfiles/README.md).
 *
 *   node tools/l10n.mjs extract   writes translationfiles/templates/quantumchess.pot from every t()/n() call in src/
 *                                 and every IL10N ->t()/->n() call in lib/ and templates/; reports calls whose text
 *                                 is not a string literal (the extractors of Nextcloud cannot read them either)
 *   node tools/l10n.mjs merge     adds new template entries to translationfiles/<lang>/quantumchess.po, marks entries
 *                                 that are no longer in the template obsolete (#~)
 *   node tools/l10n.mjs build     converts translationfiles/<lang>/quantumchess.po into l10n/<lang>.js and .json
 *   node tools/l10n.mjs check     lists untranslated entries per language and placeholder mismatches; exits 1 on any
 *
 * `make l10n-pot` / `make l10n` (Nextcloud's translationtool.phar) produce the same files; this script is the
 * dependency-free route used in development.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = 'quantumchess'
const POT = join(ROOT, 'translationfiles/templates', `${APP}.pot`)

/** Plural rules as Nextcloud (Transifex) uses them. */
const PLURAL_FORMS = {
	nl: 'nplurals=2; plural=(n != 1);',
	de: 'nplurals=2; plural=(n != 1);',
	fr: 'nplurals=3; plural=(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;',
}
const LANGUAGES = Object.keys(PLURAL_FORMS)

/** Source folders and the paths below them that are never shipped (development-only screens). */
const SOURCES = [
	{ dir: 'src', ext: ['.js', '.vue'], kind: 'js' },
	{ dir: 'lib', ext: ['.php'], kind: 'php' },
	{ dir: 'templates', ext: ['.php'], kind: 'php' },
]
const SKIP = [/^src\/components\/board\/dev\//, /^lib\/Engine\//]

/**
 * @param {string} dir absolute directory
 * @return {string[]} files below it
 */
function walk(dir) {
	const out = []
	for (const name of readdirSync(dir)) {
		const path = join(dir, name)
		if (statSync(path).isDirectory()) {
			out.push(...walk(path))
		} else {
			out.push(path)
		}
	}
	return out
}

/**
 * Reads a JS or PHP string literal (or a `+`/`.` concatenation of literals) at `pos`.
 *
 * @param {string} src source text
 * @param {number} pos index of the first character after skipping whitespace
 * @param {'js'|'php'} kind language
 * @return {{value: string, end: number}|null} the decoded string, or null when the argument is not a literal
 */
function readLiteral(src, pos, kind) {
	let value = ''
	let i = skipSpace(src, pos)
	let any = false
	for (;;) {
		const quote = src[i]
		if (quote !== '\'' && quote !== '"' && !(kind === 'js' && quote === '`')) {
			return any ? { value, end: i } : null
		}
		i++
		let part = ''
		while (i < src.length && src[i] !== quote) {
			let c = src[i]
			if (c === '\\') {
				const next = src[i + 1]
				i += 2
				if (kind === 'php' && quote === '\'') {
					part += (next === '\'' || next === '\\') ? next : '\\' + next
					continue
				}
				switch (next) {
				case 'n': part += '\n'; break
				case 't': part += '\t'; break
				case 'r': part += '\r'; break
				case '\n': break
				case 'u': {
					const hex = src.slice(i, i + 4)
					part += String.fromCharCode(parseInt(hex, 16))
					i += 4
					break
				}
				default: part += next
				}
				continue
			}
			if (quote === '`' && c === '$' && src[i + 1] === '{') {
				return null
			}
			if (kind === 'php' && quote === '"' && c === '$') {
				return null
			}
			part += c
			i++
			c = src[i]
		}
		i++
		value += part
		any = true
		const after = skipSpace(src, i)
		const op = kind === 'js' ? '+' : '.'
		if (src[after] === op) {
			const next = skipSpace(src, after + 1)
			if (src[next] === '\'' || src[next] === '"' || src[next] === '`') {
				i = next
				continue
			}
		}
		return { value, end: after }
	}
}

/**
 * @param {string} src text
 * @param {number} i index
 * @return {number} index of the next character that is neither white space nor inside a comment
 */
function skipSpace(src, i) {
	for (;;) {
		while (i < src.length && /\s/.test(src[i])) {
			i++
		}
		if (src.startsWith('//', i)) {
			i = src.indexOf('\n', i)
			if (i < 0) {
				return src.length
			}
			continue
		}
		if (src.startsWith('/*', i)) {
			i = src.indexOf('*/', i) + 2
			continue
		}
		return i
	}
}

/**
 * @param {string} src file text
 * @param {number} index offset
 * @return {number} 1-based line
 */
function lineOf(src, index) {
	let line = 1
	for (let i = 0; i < index; i++) {
		if (src.charCodeAt(i) === 10) {
			line++
		}
	}
	return line
}

/**
 * The translator comment right above a call: `// TRANSLATORS …` (JS) or `// TRANSLATORS …` / `/* TRANSLATORS … *\/`.
 *
 * @param {string} src text
 * @param {number} index offset of the call
 * @return {string|null} comment text
 */
function translatorComment(src, index) {
	const before = src.slice(Math.max(0, index - 600), index)
	const lines = before.split('\n').slice(-4, -1).reverse()
	for (const line of lines) {
		const m = line.match(/(?:\/\/|\/\*|\*|<!--)\s*TRANSLATORS:?\s*(.*?)\s*(?:\*\/|-->)?\s*$/)
		if (m) {
			return m[1]
		}
	}
	return null
}

/**
 * @return {{entries: Map<string, object>, problems: string[]}} every translatable string with its references
 */
function extract() {
	const entries = new Map()
	const problems = []
	const add = (entry, ref, comment) => {
		const key = entry.plural ? `${entry.id}\u0000${entry.plural}` : entry.id
		const existing = entries.get(key) ?? { ...entry, refs: [], comments: new Set() }
		existing.refs.push(ref)
		if (comment) {
			existing.comments.add(comment)
		}
		entries.set(key, existing)
	}
	for (const source of SOURCES) {
		const files = walk(join(ROOT, source.dir)).filter((f) => source.ext.some((e) => f.endsWith(e))).sort()
		for (const file of files) {
			const rel = relative(ROOT, file)
			if (SKIP.some((re) => re.test(rel))) {
				continue
			}
			const src = readFileSync(file, 'utf8')
			const re = source.kind === 'js'
				? /(?<![\w$.])([tn])\s*\(\s*(['"])quantumchess\2\s*,/g
				: /->([tn])\s*\(/g
			let m
			while ((m = re.exec(src))) {
				const fn = m[1]
				const start = m.index + m[0].length
				const ref = `${rel}:${lineOf(src, m.index)}`
				const first = readLiteral(src, start, source.kind)
				if (!first) {
					if (source.kind === 'php' && !/^\s*\)/.test(src.slice(start))) {
						problems.push(`${ref}: ${fn}() with a text that is not a string literal`)
					} else if (source.kind === 'js') {
						problems.push(`${ref}: ${fn}() with a text that is not a string literal`)
					}
					continue
				}
				const comment = translatorComment(src, m.index)
				if (fn === 't') {
					add({ id: first.value }, ref, comment)
				} else {
					const comma = skipSpace(src, first.end)
					const second = src[comma] === ',' ? readLiteral(src, comma + 1, source.kind) : null
					if (!second) {
						problems.push(`${ref}: n() without a literal plural text`)
						continue
					}
					add({ id: first.value, plural: second.value }, ref, comment)
				}
			}
		}
	}
	return { entries, problems }
}

/**
 * @param {string} s text
 * @return {string} PO-quoted string (split at newlines)
 */
function poQuote(s) {
	const esc = (x) => x.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\n/g, '\\n')
	if (!s.includes('\n') || s.indexOf('\n') === s.length - 1) {
		return `"${esc(s)}"`
	}
	const parts = s.split(/(?<=\n)/)
	return '""\n' + parts.map((p) => `"${esc(p)}"`).join('\n')
}

/**
 * Parses a PO file (the subset this project writes: comments, msgctxt-less entries, plurals, obsolete #~).
 *
 * @param {string} text file content
 * @return {object[]} entries {id, plural?, str: string[], comments: string[], obsolete}
 */
function parsePo(text) {
	const entries = []
	let cur = null
	let field = null
	const unq = (s) => JSON.parse(s.replace(/\t/g, '\\t'))
	const flush = () => {
		if (cur && cur.id !== undefined) {
			entries.push(cur)
		}
		cur = null
		field = null
	}
	for (let raw of text.split('\n')) {
		let obsolete = false
		if (raw.startsWith('#~ ')) {
			obsolete = true
			raw = raw.slice(3)
		}
		const line = raw.trim()
		if (line === '') {
			flush()
			continue
		}
		cur ??= { str: [], comments: [], obsolete }
		if (line.startsWith('#')) {
			if (cur.id !== undefined) {
				flush()
				cur = { str: [], comments: [], obsolete }
			}
			cur.comments.push(line)
			continue
		}
		let m
		if ((m = line.match(/^msgid_plural\s+(".*")$/))) {
			cur.plural = unq(m[1])
			field = 'plural'
		} else if ((m = line.match(/^msgid\s+(".*")$/))) {
			if (cur.id !== undefined) {
				flush()
				cur = { str: [], comments: [], obsolete }
			}
			cur.id = unq(m[1])
			field = 'id'
		} else if ((m = line.match(/^msgstr\[(\d+)\]\s+(".*")$/))) {
			cur.str[Number(m[1])] = unq(m[2])
			field = Number(m[1])
		} else if ((m = line.match(/^msgstr\s+(".*")$/))) {
			cur.str[0] = unq(m[1])
			field = 0
		} else if (line.startsWith('"')) {
			if (typeof field === 'number') {
				cur.str[field] += unq(line)
			} else if (field) {
				cur[field] += unq(line)
			}
		}
	}
	flush()
	return entries
}

/**
 * @param {object} e entry
 * @return {string} key of the entry (singular + NUL + plural)
 */
const keyOf = (e) => (e.plural !== undefined ? `${e.id}\u0000${e.plural}` : e.id)

/**
 * @param {object[]} entries template entries
 * @param {string|null} lang language, null for the template
 * @param {Map<string, object>} translated existing translations by key
 * @return {string} PO file text
 */
function writePo(entries, lang, translated = new Map()) {
	const nplurals = lang ? Number(PLURAL_FORMS[lang].match(/nplurals=(\d)/)[1]) : 2
	const head = [
		'# SPDX-FileCopyrightText: 2026 BeeFlow',
		'# SPDX-License-Identifier: AGPL-3.0-or-later',
		'msgid ""',
		'msgstr ""',
		'"Project-Id-Version: Quantum Chess\\n"',
		'"MIME-Version: 1.0\\n"',
		'"Content-Type: text/plain; charset=UTF-8\\n"',
		'"Content-Transfer-Encoding: 8bit\\n"',
		`"Language: ${lang ?? ''}\\n"`,
		`"Plural-Forms: ${lang ? PLURAL_FORMS[lang] : 'nplurals=INTEGER; plural=EXPRESSION;'}\\n"`,
		'',
	]
	const body = []
	for (const e of entries) {
		const t = translated.get(keyOf(e))
		const lines = []
		for (const c of e.comments ?? []) {
			lines.push(`#. TRANSLATORS: ${c}`)
		}
		if (e.refs) {
			lines.push(`#: ${e.refs.join(' ')}`)
		}
		if (/%(\d\$)?s/.test(e.id)) {
			lines.push('#, php-format')
		}
		lines.push(`msgid ${poQuote(e.id)}`)
		if (e.plural !== undefined) {
			lines.push(`msgid_plural ${poQuote(e.plural)}`)
			for (let i = 0; i < nplurals; i++) {
				lines.push(`msgstr[${i}] ${poQuote(t?.str?.[i] ?? '')}`)
			}
		} else {
			lines.push(`msgstr ${poQuote(t?.str?.[0] ?? '')}`)
		}
		body.push(lines.join('\n'))
	}
	return head.join('\n') + '\n' + body.join('\n\n') + '\n'
}

/**
 * @return {object[]} template entries in a stable order (file order of the first reference)
 */
function templateEntries() {
	return parsePo(readFileSync(POT, 'utf8')).filter((e) => e.id !== '').map((e) => ({
		id: e.id,
		plural: e.plural,
		refs: e.comments.filter((c) => c.startsWith('#:')).flatMap((c) => c.slice(2).trim().split(' ')),
		comments: e.comments.filter((c) => c.startsWith('#.')).map((c) => c.replace(/^#\.\s*(TRANSLATORS:\s*)?/, '')),
	}))
}

/** Placeholders that must survive translation: {name}, %s, %1$s, %n. */
const placeholders = (s) => (s.match(/\{[a-zA-Z0-9_]+\}|%(\d\$)?[sd]|%n/g) ?? []).sort().join(' ')

const command = process.argv[2]
if (command === 'extract') {
	const { entries, problems } = extract()
	const list = [...entries.values()].map((e) => ({ ...e, comments: [...e.comments] }))
	mkdirSync(dirname(POT), { recursive: true })
	writeFileSync(POT, writePo(list, null))
	console.info(`${list.length} strings (${list.filter((e) => e.plural).length} with plurals) → ${relative(ROOT, POT)}`)
	for (const p of problems) {
		console.warn(p)
	}
	process.exitCode = problems.length ? 1 : 0
} else if (command === 'merge') {
	const template = templateEntries()
	for (const lang of LANGUAGES) {
		const file = join(ROOT, 'translationfiles', lang, `${APP}.po`)
		const old = existsSync(file) ? parsePo(readFileSync(file, 'utf8')).filter((e) => e.id !== '') : []
		const byKey = new Map(old.map((e) => [keyOf(e), e]))
		mkdirSync(dirname(file), { recursive: true })
		let text = writePo(template, lang, byKey)
		const keys = new Set(template.map(keyOf))
		const gone = old.filter((e) => !keys.has(keyOf(e)) && e.str.some(Boolean))
		for (const e of gone) {
			text += '\n' + [`msgid ${poQuote(e.id)}`, ...(e.plural !== undefined ? [`msgid_plural ${poQuote(e.plural)}`] : []),
				...e.str.map((s, i) => (e.plural !== undefined ? `msgstr[${i}] ${poQuote(s)}` : `msgstr ${poQuote(s)}`))]
				.join('\n').split('\n').map((l) => `#~ ${l}`).join('\n') + '\n'
		}
		writeFileSync(file, text)
		console.info(`${lang}: ${template.length} entries, ${gone.length} obsolete`)
	}
} else if (command === 'build' || command === 'check') {
	let failures = 0
	for (const lang of LANGUAGES) {
		const file = join(ROOT, 'translationfiles', lang, `${APP}.po`)
		const entries = parsePo(readFileSync(file, 'utf8')).filter((e) => e.id !== '' && !e.obsolete)
		const translations = {}
		let missing = 0
		for (const e of entries) {
			const done = e.str.length > 0 && e.str.every((s) => s)
			if (!done) {
				missing++
				if (command === 'check') {
					console.warn(`${lang}: untranslated: ${JSON.stringify(e.id)}`)
				}
				continue
			}
			for (const s of e.str) {
				if (placeholders(s) !== placeholders(e.plural !== undefined && s !== e.str[0] ? e.plural : e.id)
					&& placeholders(s) !== placeholders(e.id)) {
					failures++
					console.warn(`${lang}: placeholders differ: ${JSON.stringify(e.id)} → ${JSON.stringify(s)}`)
				}
			}
			if (e.plural !== undefined) {
				translations[`_${e.id}_::_${e.plural}_`] = e.str
			} else {
				translations[e.id] = e.str[0]
			}
		}
		failures += missing
		if (command === 'build') {
			const json = JSON.stringify(translations, null, 4).slice(1, -2).split('\n').map((l) => l.replace(/^ {4}/, '    ')).join('\n')
			writeFileSync(join(ROOT, 'l10n', `${lang}.js`),
				`OC.L10N.register(\n    "${APP}",\n    {${json}\n},\n"${PLURAL_FORMS[lang]}");\n`)
			writeFileSync(join(ROOT, 'l10n', `${lang}.json`),
				`{ "translations": {${json}\n},"pluralForm" :"${PLURAL_FORMS[lang]}"\n}\n`)
		}
		console.info(`${lang}: ${entries.length - missing}/${entries.length} translated`)
	}
	if (command === 'check') {
		process.exitCode = failures ? 1 : 0
	}
} else {
	console.info('usage: node tools/l10n.mjs extract|merge|build|check')
	process.exitCode = 2
}
