// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Coach answers are untrusted model output: they render Markdown, but no link or image.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import NcRichText from '@nextcloud/vue/components/NcRichText'
import { withoutLinks } from '../../../src/coach/chips.js'

describe('coach answer rendering', () => {
	it('shows links and images from the model as plain text', async () => {
		const text = '**Play e2-e4.** See https://evil.example/login and [docs](https://phish.example/x) '
			+ '![p](https://track.example/p.png) <https://auto.example/a> [r][1]\n\n[1]: https://ref.example/'
		const wrapper = mount(NcRichText, { props: { text: withoutLinks(text), useMarkdown: true, autolink: false } })
		await nextTick()
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(wrapper.find('strong').text()).toBe('Play e2-e4.')
		expect(wrapper.findAll('a')).toHaveLength(0)
		expect(wrapper.findAll('img')).toHaveLength(0)
		expect(wrapper.text()).toContain('[docs](https://phish.example/x)')
		expect(wrapper.text()).toContain('https://evil.example/login')
	})
})
