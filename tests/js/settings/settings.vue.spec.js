// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The settings apps: the provider form emits the right payload and tests a connection without keys coming back; the
 * personal page shows only available sources and saves switches.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PersonalSettings from '../../../src/settings/components/PersonalSettings.vue'
import ProviderForm from '../../../src/settings/components/ProviderForm.vue'
import * as api from '../../../src/services/api.js'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn() }))
vi.mock('../../../src/services/api.js', () => ({
	testAiConnection: vi.fn(),
	getPersonalSettings: vi.fn(),
	getMultiplayerSettings: vi.fn(),
	savePersonalSettings: vi.fn(),
	saveMultiplayerSettings: vi.fn(),
}))

const PRESETS = [
	{
		id: 'openai',
		label: 'OpenAI',
		kind: 'openai',
		baseUrl: 'https://api.openai.com/v1',
		keyRequired: true,
		local: false,
		fixedUrl: true,
		suggestedModels: ['gpt-5-mini'],
	},
	{
		id: 'ollama',
		label: 'Ollama',
		kind: 'openai',
		baseUrl: 'http://localhost:11434/v1',
		keyRequired: false,
		local: true,
		fixedUrl: false,
		suggestedModels: [],
	},
	{
		id: 'custom',
		label: 'Custom',
		kind: 'openai',
		baseUrl: '',
		keyRequired: false,
		local: false,
		fixedUrl: false,
		suggestedModels: [],
	},
]

const PERSONAL = {
	allowPersonalKeys: true,
	provider: { preset: 'openai', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
	hasKey: true,
	keyHint: 'a1B2',
	keyUnreadable: false,
	defaultSource: 'personal',
	presets: PRESETS,
	localAllowlist: ['http://localhost:11434/v1'],
	sources: [
		{ id: 'nextcloud', label: 'Nextcloud AI', available: false, reason: 'no_provider' },
		{ id: 'shared', label: 'Company AI', available: true, reason: null },
		{ id: 'personal', label: 'My own API key', available: true, reason: null, keyHint: 'a1B2' },
	],
}

const MULTIPLAYER = {
	invitePolicy: 'everyone',
	blocked: [],
	listed: null,
	leaderboardMode: 'opt-in',
	notifications: {
		invites: true,
		yourTurn: true,
		reminders: true,
		drawOffers: true,
		results: true,
		chat: true,
		previews: true,
	},
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe('ProviderForm', () => {
	it('shows the key hint and saves the provider with a new key', async () => {
		const wrapper = mount(ProviderForm, {
			props: {
				provider: PERSONAL.provider,
				presets: PRESETS,
				scope: 'personal',
				keyInfo: { hasKey: true, keyHint: 'a1B2', keyUnreadable: false },
			},
		})
		expect(wrapper.text()).toContain('Address: https://api.openai.com/v1')
		expect(wrapper.text()).toContain('a1B2')
		await wrapper.find('input[type="password"]').setValue('  sk-new-key-9876 ')
		const save = wrapper.findAll('button').find((b) => b.text() === 'Save')
		await save.trigger('click')
		expect(wrapper.emitted('save')[0][0]).toEqual({
			provider: { preset: 'openai', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
			apiKey: 'sk-new-key-9876',
		})
		expect(wrapper.find('input[type="password"]').element.value).toBe('')
	})

	it('keeps the saved key when the field is empty, and tests the connection', async () => {
		api.testAiConnection.mockResolvedValue({
			ok: true,
			code: null,
			modelCount: 2,
			models: [{ id: 'gpt-5', label: 'gpt-5' }, { id: 'gpt-5-mini', label: 'gpt-5-mini' }],
		})
		const wrapper = mount(ProviderForm, {
			props: {
				provider: PERSONAL.provider,
				presets: PRESETS,
				scope: 'personal',
				keyInfo: { hasKey: true, keyHint: 'a1B2', keyUnreadable: false },
			},
		})
		await wrapper.findAll('button').find((b) => b.text() === 'Test connection').trigger('click')
		await flushPromises()
		expect(api.testAiConnection).toHaveBeenCalledWith({
			scope: 'personal',
			preset: 'openai',
			kind: 'openai',
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-5-mini',
			apiKey: null,
		})
		expect(wrapper.text()).toContain('Connected. The server offers 2 chat models.')

		await wrapper.findAll('button').find((b) => b.text() === 'Save').trigger('click')
		expect(wrapper.emitted('save')[0][0].apiKey).toBeNull()
	})

	it('explains a refused address', async () => {
		api.testAiConnection.mockResolvedValue({ ok: false, code: 'url_not_allowed', modelCount: null, models: null })
		const wrapper = mount(ProviderForm, {
			props: {
				provider: { preset: 'custom', kind: 'openai', baseUrl: 'http://10.0.0.5/v1', model: 'm' },
				presets: PRESETS,
				scope: 'personal',
			},
		})
		expect(wrapper.find('input[type="url"]').element.value).toBe('http://10.0.0.5/v1')
		await wrapper.findAll('button').find((b) => b.text() === 'Test connection').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('This address is not allowed')
	})

	it('warns when no local server is allowed', () => {
		const wrapper = mount(ProviderForm, {
			props: {
				provider: { preset: 'ollama', kind: 'openai', baseUrl: '', model: 'llama3' },
				presets: PRESETS,
				scope: 'personal',
				localAllowlist: [],
			},
		})
		expect(wrapper.text()).toContain('Your administrator has not allowed any local AI server yet.')
	})
})

describe('PersonalSettings', () => {
	it('renders the sections, disables unavailable sources and saves a switch', async () => {
		api.getPersonalSettings.mockResolvedValue(PERSONAL)
		api.getMultiplayerSettings.mockResolvedValue(MULTIPLAYER)
		api.saveMultiplayerSettings.mockResolvedValue({
			...MULTIPLAYER,
			notifications: { ...MULTIPLAYER.notifications, chat: false },
		})
		const wrapper = mount(PersonalSettings)
		await flushPromises()
		const text = wrapper.text()
		for (const heading of [
			'Online play',
			'Notifications',
			'AI opponent and coach',
			'My own API key',
			'What is sent to the AI',
		]) {
			expect(text).toContain(heading)
		}
		expect(text).not.toContain('Reminders')
		expect(text).toContain('No text generation provider is installed')
		const radios = wrapper.findAll('input[type="radio"]')
		expect(radios.map((r) => r.element.disabled)).toEqual([true, false, false])
		expect(radios[2].element.checked).toBe(true)

		const chat = wrapper.findAll('.checkbox-radio-switch').find((el) => el.text() === 'Chat messages')
		await chat.find('input').trigger('change')
		await flushPromises()
		expect(api.saveMultiplayerSettings).toHaveBeenCalledWith({ notifications: { chat: false } })
	})
})
