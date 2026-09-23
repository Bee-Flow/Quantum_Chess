/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The AI sources available to the user (SPEC §14.4.8, GAME-DESIGN §8.4) and the first-use privacy notice (§8.5):
 * `ensureNotice(source)` shows `AiNoticeDialog` once per source and resolves with the user's choice.
 */

import { t } from '@nextcloud/l10n'
import { computed, reactive, ref } from 'vue'
import { ackAiNotice, getAiSources } from '../services/api.js'
import { features } from '../services/initialState.js'

const SOURCE_IDS = ['nextcloud', 'shared', 'personal']

/**
 * A default label of a source.
 *
 * @param {string} id source id
 * @return {string}
 */
export function sourceLabel(id) {
	switch (id) {
		case 'nextcloud': return t('quantumchess', 'Nextcloud AI')
		case 'shared': return t('quantumchess', 'Organisation AI provider')
		case 'personal': return t('quantumchess', 'My own API key')
		default: return id
	}
}

/**
 * The reason a source is not available, in plain words.
 *
 * @param {string|null} reason reason code (SPEC §7.4.7)
 * @return {string}
 */
export function unavailableText(reason) {
	switch (reason) {
		case 'disabled': return t('quantumchess', 'AI features are switched off by your administrator.')
		case 'not_allowed': return t('quantumchess', 'Your administrator has not enabled AI for your account.')
		case 'no_provider': return t('quantumchess', 'No Nextcloud AI provider is installed.')
		case 'not_configured': return t('quantumchess', 'The AI provider is not configured yet.')
		case 'no_key': return t('quantumchess', 'Add your own API key in the personal settings.')
		case 'cap_reached': return t('quantumchess', 'Today’s AI limit is reached.')
		default: return t('quantumchess', 'No AI source is available. An administrator can set one up in the Quantum Chess admin settings.')
	}
}

const summary = features.ai ?? {}
const acked = ref(Array.isArray(summary.noticeAcked) ? [...summary.noticeAcked] : [])
const sources = ref(SOURCE_IDS.map((id) => ({ id, label: sourceLabel(id), available: summary[id] === true, reason: summary[id] === true ? null : 'not_configured' })))
const defaultSource = ref(summary.default ?? null)
const privacyNotice = ref('')
let loaded = null

/** The notice dialog state (rendered by AiNoticeDialog in App.vue). */
export const aiNotice = reactive({ open: false, source: null, label: '', adminNotice: '', resolve: null })

/**
 * Load the sources from the server once.
 *
 * @param {boolean} [force] reload
 * @return {Promise<void>}
 */
async function refresh(force = false) {
	if (loaded && !force) {
		return loaded
	}
	loaded = (async () => {
		try {
			const body = await getAiSources()
			if (Array.isArray(body?.sources)) {
				sources.value = body.sources.map((s) => ({ ...s, label: s.label || sourceLabel(s.id) }))
				defaultSource.value = body.default ?? null
				privacyNotice.value = body.privacyNotice ?? ''
				acked.value = body.sources.filter((s) => s.noticeAcked).map((s) => s.id)
			}
		} catch {
			// keep the initial state
		}
	})()
	return loaded
}

/**
 * Show the privacy notice once per source.
 *
 * @param {string} source source id
 * @return {Promise<boolean>} whether the user continues
 */
async function ensureNotice(source) {
	if (acked.value.includes(source)) {
		return true
	}
	const label = sources.value.find((s) => s.id === source)?.label ?? sourceLabel(source)
	const ok = await new Promise((resolve) => {
		Object.assign(aiNotice, { open: true, source, label, adminNotice: privacyNotice.value, resolve })
	})
	aiNotice.open = false
	if (ok) {
		acked.value = [...acked.value, source]
		ackAiNotice(source).catch(() => {})
	}
	return ok
}

/**
 * @return {object} {sources, defaultSource, anyAvailable, refresh, ensureNotice}
 */
export function useAiSources() {
	return {
		sources,
		defaultSource,
		anyAvailable: computed(() => sources.value.some((s) => s.available)),
		refresh,
		ensureNotice,
	}
}
