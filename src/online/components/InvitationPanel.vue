<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The panel over the board of a game that has not started: an invitation to accept or decline, the creator's waiting
  state with Cancel, the join screen of an open challenge (with Copy link for its creator), and the declined, cancelled
  and expired states.
-->
<template>
	<div
		class="qc-invite"
		role="dialog"
		:aria-labelledby="'qc-invite-title-' + g.id"
		data-test="invitation-panel">
		<div class="qc-invite__card">
			<NcAvatar
				v-if="other?.userId"
				:user="other.userId"
				:displayName="other.displayName"
				:size="48" />
			<h2 :id="'qc-invite-title-' + g.id" class="qc-invite__title">
				{{ title }}
			</h2>
			<p v-if="g.inviteMessage" class="qc-invite__message">
				“{{ g.inviteMessage }}”
			</p>
			<ul v-if="live" class="qc-invite__facts">
				<li>{{ timeControlText(g.timeControl) }}</li>
				<li>{{ g.ratedRequested ? t('quantumchess', 'Rated') : t('quantumchess', 'Casual (unrated)') }}</li>
				<li>{{ colorText(g, me) }}</li>
				<li v-if="g.expiresAt">
					{{ t('quantumchess', 'Expires: {when}', { when: expiry }) }}
				</li>
			</ul>
			<div class="qc-invite__actions">
				<template v-if="mode === 'invited'">
					<NcButton :disabled="busy" data-test="decline" @click="run(controller.decline)">
						{{ t('quantumchess', 'Decline') }}
					</NcButton>
					<NcButton
						variant="primary"
						:disabled="busy"
						data-test="accept"
						@click="run(controller.accept)">
						{{ t('quantumchess', 'Accept') }}
					</NcButton>
				</template>
				<template v-else-if="mode === 'join'">
					<NcButton
						variant="primary"
						:disabled="busy"
						data-test="join"
						@click="run(controller.join)">
						{{ t('quantumchess', 'Join the game') }}
					</NcButton>
				</template>
				<template v-else-if="mode === 'waiting' || mode === 'own-open'">
					<NcButton v-if="mode === 'own-open'" data-test="copy-link" @click="copyLink">
						{{ t('quantumchess', 'Copy link') }}
					</NcButton>
					<NcButton :disabled="busy" data-test="cancel" @click="run(controller.cancel)">
						{{ mode === 'own-open'
							? t('quantumchess', 'Cancel the challenge')
							: t('quantumchess', 'Cancel the invitation') }}
					</NcButton>
				</template>
				<template v-else>
					<NcButton :to="{ name: 'home' }">
						{{ t('quantumchess', 'Home') }}
					</NcButton>
					<NcButton variant="primary" :to="{ name: 'new-game', query: { mode: 'online' } }">
						{{ t('quantumchess', 'New game') }}
					</NcButton>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup>
import { showError, showSuccess } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcButton from '@nextcloud/vue/components/NcButton'
import { useBusyAction } from '../../composables/useBusyAction.js'
import { formatRelative } from '../../services/format.js'
import { colorText, otherPlayer, timeControlText } from '../summaryText.js'

const props = defineProps({
	/** The online game controller */
	controller: { type: Object, required: true },
	/** Viewer uid */
	me: { type: String, default: null },
})

const { busy, run } = useBusyAction()
const g = computed(() => props.controller.game.value)
const other = computed(() => otherPlayer(g.value, props.me))
const live = computed(() => g.value.status === 'pending' || g.value.status === 'open')

const mode = computed(() => {
	const game = g.value
	const mine = game.creator?.userId === props.me
	if (game.status === 'pending') {
		return mine ? 'waiting' : 'invited'
	}
	if (game.status === 'open') {
		return mine ? 'own-open' : 'join'
	}
	return game.status
})

const title = computed(() => {
	const name = other.value?.displayName ?? ''
	switch (mode.value) {
		case 'invited':
			return g.value.rematchOf
				? t('quantumchess', '{name} wants a rematch', { name })
				: t('quantumchess', '{name} invites you to a game', { name })
		case 'waiting':
			return t('quantumchess', 'Waiting for {name} to accept', { name })
		case 'join':
			return t('quantumchess', '{name} is looking for an opponent', { name })
		case 'own-open':
			return t('quantumchess', 'Your open challenge is waiting for an opponent')
		case 'declined':
			return g.value.creator?.userId === props.me
				? t('quantumchess', '{name} declined the invitation', { name })
				: t('quantumchess', 'You declined this invitation')
		case 'cancelled':
			return t('quantumchess', 'This invitation was cancelled')
		case 'expired':
			return t('quantumchess', 'This invitation expired')
		default:
			return t('quantumchess', 'This challenge is not available')
	}
})

const expiry = computed(() => {
	const now = Date.now() / 1000
	const s = (g.value.expiresAt ?? now) - now
	return s > 0
		? new Date(g.value.expiresAt * 1000).toLocaleString([], {
				weekday: 'short',
				hour: '2-digit',
				minute: '2-digit',
			})
		: formatRelative(g.value.expiresAt, now)
})

/** Copy the share link of the open challenge. */
async function copyLink() {
	try {
		await navigator.clipboard.writeText(props.controller.shareUrl.value)
		showSuccess(t('quantumchess', 'Link copied'))
	} catch {
		showError(t('quantumchess', 'Could not copy the link: {url}', { url: props.controller.shareUrl.value }))
	}
}
</script>

<style lang="scss" scoped>
.qc-invite {
	position: absolute;
	inset: 0;
	z-index: 20;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 12px;
	background: color-mix(in srgb, var(--color-main-background) 55%, transparent);
	backdrop-filter: blur(2px);
}

.qc-invite__card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	width: min(360px, 100%);
	padding: 20px 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-container, var(--border-radius-large));
	background: var(--color-main-background);
	box-shadow: 0 4px 24px var(--color-box-shadow);
	text-align: center;
}

.qc-invite__title {
	margin: 0;
	font-size: 18px;
	font-weight: bold;
	line-height: 1.3;
}

.qc-invite__message {
	margin: 0;
	font-style: italic;
	overflow-wrap: anywhere;
}

.qc-invite__facts {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 4px 12px;
	margin: 0;
	padding: 0;
	color: var(--color-text-maxcontrast);
	list-style: none;
}

.qc-invite__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
	margin-top: 8px;
}
</style>
