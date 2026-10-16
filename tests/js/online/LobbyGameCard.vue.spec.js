// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * LobbyGameCard and the lobby sections for games of more than two seats: an invitation names its creator, a running
 * game every other player and the player to move, a seat the viewer took waits for players, and only the creator may
 * cancel.
 */

import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import LobbyGameCard from '../../../src/online/components/lobby/LobbyGameCard.vue'
import LobbyOnlineSections from '../../../src/online/components/lobby/LobbyOnlineSections.vue'
import { currentUser, features } from '../../../src/services/initialState.js'

const lobbyData = ref({})
vi.mock('../../../src/online/composables/useLobby.js', () => ({
	useLobby: () => ({
		lobby: lobbyData,
		watchFast: () => () => {},
		accept: vi.fn(),
		decline: vi.fn(),
		cancel: vi.fn(),
		join: vi.fn(),
	}),
}))
vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal()),
	useRouter: () => ({ push: vi.fn() }),
}))

const user = (userId, displayName) => ({ userId, displayName })
const alice = user('alice', 'Alice')
const bob = user('bob', 'Bob')
const carol = user('carol', 'Carol')
const dave = user('dave', 'Dave')

/**
 * A game of four created by Alice; seats 0 to 3 as given (null: open seat).
 *
 * @param {Array<object|null>} players the seats
 * @param {object} [extra] fields to override
 * @return {object}
 */
function seated(players, extra = {}) {
	return {
		id: 7,
		status: 'active',
		variant: 'fourplayer',
		timeControl: 'corr:3d',
		creator: alice,
		preview: [],
		seats: players.map((player, seat) => ({ seat, player, accepted: player !== null, team: null })),
		...extra,
	}
}

const stubs = { RouterLink: RouterLinkStub, NcAvatar: true }

/**
 * Mount a card.
 *
 * @param {object} game the game
 * @param {string} kind card kind
 * @return {object}
 */
function card(game, kind) {
	return mount(LobbyGameCard, { props: { game, kind, now: 1000 }, global: { stubs } })
}

beforeEach(() => {
	currentUser.uid = 'carol'
	features.multiplayer = true
})

describe('LobbyGameCard with more than two seats', () => {
	it('names the creator of an invitation', () => {
		const g = seated([alice, bob, carol, dave], { status: 'pending' })
		g.seats[2].accepted = false
		expect(card(g, 'invite').find('.qc-lobby-card__name').text()).toBe('Alice invites you')
	})

	it('names the creator of an open challenge', () => {
		const g = seated([alice, bob, null, null], { status: 'open', creator: alice })
		expect(card(g, 'open').find('.qc-lobby-card__name').text()).toBe('Open challenge by Alice')
	})

	it('names every other player and the player to move of a running game', () => {
		const g = seated([alice, bob, carol, dave], { turn: '1', yourTurn: false, myColor: '2' })
		const wrapper = card(g, 'waiting')
		expect(wrapper.find('.qc-lobby-card__name').text()).toBe('vs Alice, Bob and Dave')
		expect(wrapper.find('.qc-lobby-card__line').text()).toContain('Waiting for Bob')
	})

	it('says Your move when the viewer is to move', () => {
		const g = seated([alice, bob, carol, dave], { turn: '2', yourTurn: true, myColor: '2' })
		expect(card(g, 'turn').find('.qc-lobby-card__line').text()).toContain('Your move')
	})

	it('shows a seat the viewer took as waiting for players', () => {
		const g = seated([alice, bob, carol, null], { status: 'open' })
		const wrapper = card(g, 'outgoing')
		expect(wrapper.find('.qc-lobby-card__name').text()).toBe('Open challenge by Alice')
		expect(wrapper.find('.qc-lobby-card__line').text()).toBe('Waiting for players (3 of 4)')
	})
})

describe('LobbyOnlineSections', () => {
	it('offers Cancel to the creator only', async () => {
		const mine = seated([carol, null, null, null], { id: 1, status: 'open', creator: carol })
		const joined = seated([alice, carol, null, null], { id: 2, status: 'open', creator: alice })
		lobbyData.value = { outgoing: [mine, joined], now: 1000 }
		const wrapper = mount(LobbyOnlineSections, { global: { stubs } })
		expect(wrapper.find('[data-test="lobby-cancel-1"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="lobby-cancel-2"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="lobby-game-2"]').exists()).toBe(true)
	})
})
