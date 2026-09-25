/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The release tool that writes the version of a release tag into info.xml, the npm files and CHANGELOG.md.
 */

import { describe, expect, it } from 'vitest'
import {
	compareVersions,
	getInfoXmlVersion,
	isVersion,
	normalizeNotes,
	releaseChangelog,
	setInfoXmlVersion,
	setPackageVersion,
} from '../../../tools/set-version.mjs'

const CHANGELOG = `# Changelog

Intro text.

## [Unreleased]

## [1.0.0] - 2026-09-23

The first release.

[Unreleased]: https://github.com/bee-flow/quantum_chess/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.0
`

/**
 * @param {string} notes the text to place under `## [Unreleased]`
 * @return {string} the test changelog with those notes
 */
function withUnreleased(notes) {
	return CHANGELOG.replace('## [Unreleased]\n', `## [Unreleased]\n\n${notes}\n`)
}

describe('isVersion', () => {
	it('accepts releases and pre-releases', () => {
		expect(isVersion('1.2.0')).toBe(true)
		expect(isVersion('1.2.0-beta.1')).toBe(true)
	})

	it('rejects tags and other text', () => {
		expect(isVersion('v1.2.0')).toBe(false)
		expect(isVersion('1.2')).toBe(false)
		expect(isVersion('latest')).toBe(false)
	})
})

describe('compareVersions', () => {
	it('orders versions by semantic versioning precedence', () => {
		const ordered = [
			'1.0.0',
			'1.2.0-alpha',
			'1.2.0-alpha.1',
			'1.2.0-beta.2',
			'1.2.0-beta.11',
			'1.2.0-rc.1',
			'1.2.0',
			'1.2.1',
			'1.10.0',
			'2.0.0',
		]
		const shuffled = [...ordered].reverse()
		expect(shuffled.sort(compareVersions)).toEqual(ordered)
	})

	it('treats equal versions as equal', () => {
		expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
		expect(compareVersions('1.2.0-beta.1', '1.2.0-beta.1')).toBe(0)
	})
})

describe('getInfoXmlVersion', () => {
	it('reads the app version', () => {
		expect(getInfoXmlVersion('<info>\n\t<version> 1.0.0 </version>\n</info>\n')).toBe('1.0.0')
	})

	it('refuses a file without a version', () => {
		expect(() => getInfoXmlVersion('<info/>')).toThrow(/no <version>/)
	})
})

describe('setInfoXmlVersion', () => {
	it('replaces the app version and nothing else', () => {
		const xml = (version) => `<info>\n\t<version>${version}</version>\n\t<php min-version="8.1"/>\n</info>\n`
		expect(setInfoXmlVersion(xml('1.0.0'), '1.2.0')).toBe(xml('1.2.0'))
	})

	it('refuses a file without a version', () => {
		expect(() => setInfoXmlVersion('<info/>', '1.2.0')).toThrow(/no <version>/)
	})
})

describe('setPackageVersion', () => {
	it('updates package.json', () => {
		const json = JSON.stringify({ name: 'quantumchess', version: '1.0.0', private: true }, null, 2) + '\n'
		expect(JSON.parse(setPackageVersion(json, '1.2.0')))
			.toEqual({ name: 'quantumchess', version: '1.2.0', private: true })
	})

	it('updates both versions of package-lock.json', () => {
		const lock = {
			name: 'quantumchess',
			version: '1.0.0',
			packages: { '': { version: '1.0.0' }, 'node_modules/x': { version: '3.0.0' } },
		}
		const updated = JSON.parse(setPackageVersion(JSON.stringify(lock, null, 2) + '\n', '1.2.0'))
		expect(updated.version).toBe('1.2.0')
		expect(updated.packages[''].version).toBe('1.2.0')
		expect(updated.packages['node_modules/x'].version).toBe('3.0.0')
	})
})

describe('normalizeNotes', () => {
	it('demotes the headings of GitHub generated notes and normalises line ends', () => {
		const notes = "## What's Changed\r\n* Faster engine by @someone\r\n\r\n**Full Changelog**: https://x.test\r\n"
		expect(normalizeNotes(notes))
			.toBe("### What's Changed\n* Faster engine by @someone\n\n**Full Changelog**: https://x.test")
	})
})

describe('releaseChangelog', () => {
	const date = '2026-10-01'

	it('turns the Unreleased notes into the section of the release and updates the links', () => {
		const result = releaseChangelog(withUnreleased('### Fixed\n\n- A bug.'), '1.0.1', { date, notes: 'ignored' })
		expect(result).toContain('## [Unreleased]\n\n## [1.0.1] - 2026-10-01\n\n### Fixed\n\n- A bug.\n\n## [1.0.0]')
		expect(result).toContain('[Unreleased]: https://github.com/bee-flow/quantum_chess/compare/v1.0.1...HEAD\n'
			+ '[1.0.1]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.1\n'
			+ '[1.0.0]: https://github.com/bee-flow/quantum_chess/releases/tag/v1.0.0\n')
	})

	it('uses the release description when Unreleased is empty', () => {
		const result = releaseChangelog(CHANGELOG, '1.1.0', { date, notes: '## Highlights\r\n- A new board theme.' })
		expect(result).toContain('## [1.1.0] - 2026-10-01\n\n### Highlights\n- A new board theme.\n\n## [1.0.0]')
	})

	it('writes a short note when there are no notes at all', () => {
		expect(releaseChangelog(CHANGELOG, '1.0.1', { date }))
			.toContain('## [1.0.1] - 2026-10-01\n\nMaintenance release.\n')
	})

	it('changes nothing when the version already has a section', () => {
		expect(releaseChangelog(CHANGELOG, '1.0.0', { date, notes: 'New notes' })).toBe(CHANGELOG)
	})

	it('is idempotent', () => {
		const once = releaseChangelog(withUnreleased('- A change.'), '1.0.1', { date })
		expect(releaseChangelog(once, '1.0.1', { date })).toBe(once)
	})

	it('keeps the notes of a pre-release under Unreleased', () => {
		const changelog = withUnreleased('- A preview.')
		expect(releaseChangelog(changelog, '1.1.0-beta.1', { date, notes: 'ignored' })).toBe(changelog)
	})

	it('puts the release description under Unreleased for a pre-release without notes', () => {
		const result = releaseChangelog(CHANGELOG, '1.1.0-beta.1', { date, notes: '- A preview.' })
		expect(result).toContain('## [Unreleased]\n\n- A preview.\n\n## [1.0.0]')
	})

	it('writes a short note for a pre-release without any notes', () => {
		expect(releaseChangelog(CHANGELOG, '1.1.0-beta.1', { date }))
			.toContain('## [Unreleased]\n\nPreview release.\n\n## [1.0.0]')
	})

	it('refuses a changelog without an Unreleased section', () => {
		expect(() => releaseChangelog('# Changelog\n', '1.0.1', { date })).toThrow(/Unreleased/)
	})
})
