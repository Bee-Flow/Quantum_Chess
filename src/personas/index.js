/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The AI opponent personas of 1.0 (SPEC §10.3, §14.10, GAME-DESIGN §6.2): ids, names (not translated), tolerances
 * (percentage points), style bonuses (added to a candidate's E when the engine has to choose for the persona),
 * avatars with three drawings and canned lines (translated thunks, no tokens and no latency).
 */

import { t } from '@nextcloud/l10n'
import { defineComponent, h } from 'vue'
import PersonaAvatar from '../components/ai/PersonaAvatar.vue'

/**
 * The three avatar components of a persona.
 *
 * @param {string} id persona id
 * @return {{calm: object, happy: object, worried: object}}
 */
function avatarsOf(id) {
	const make = (expression) => defineComponent({
		name: `Avatar-${id}-${expression}`,
		props: { size: { type: Number, default: 32 } },
		setup: (props) => () => h(PersonaAvatar, { persona: id, expression, size: props.size }),
	})
	return { calm: make('calm'), happy: make('happy'), worried: make('worried') }
}

export const PERSONAS = Object.freeze([
	Object.freeze({
		id: 'professor',
		name: 'Professor Qubit',
		priority: 'P0',
		tolerance: 4,
		styleTags: ['instructive', 'solid'],
		styleBonus: { split: 0, merge: 0.01, measure: 0.005, roll: 0, standard: 0.01 },
		description: () => t('quantumchess', 'A patient teacher who explains every idea'),
		avatar: avatarsOf('professor'),
		canned: {
			start: [
				() => t('quantumchess', 'Welcome! Let us explore some possibilities together.'),
				() => t('quantumchess', 'A fine day for superposition. Shall we begin?'),
			],
			opponentLucky: [
				() => t('quantumchess', 'The dice favoured you there. Well taken!'),
				() => t('quantumchess', 'A lucky roll, but you gave yourself the chance. Good.'),
			],
			opponentUnlucky: [
				() => t('quantumchess', 'Unlucky! The odds were on your side, and the idea was sound.'),
				() => t('quantumchess', 'A miss teaches us where the piece really was.'),
			],
			kingDanger: [
				() => t('quantumchess', 'Hmm, my king is exposed. Time to be careful.'),
				() => t('quantumchess', 'I must look after my king now.'),
			],
			win: [
				() => t('quantumchess', 'A good game! Review it with the coach and you will beat me next time.'),
				() => t('quantumchess', 'Well played. Every game teaches something.'),
			],
			loss: [
				() => t('quantumchess', 'Excellent! You have learned a lot today.'),
				() => t('quantumchess', 'Splendid play. I am proud to have lost to that.'),
			],
			fallback: [
				() => t('quantumchess', 'Let me think this one through on my own…'),
				() => t('quantumchess', 'My notes are a little blurry. I will trust my instincts.'),
			],
		},
	}),
	Object.freeze({
		id: 'captain',
		name: 'Captain Collapse',
		priority: 'P0',
		tolerance: 10,
		styleTags: ['rolls', 'king hunts'],
		styleBonus: { split: 0, merge: 0, measure: 0, roll: 0.03, standard: 0 },
		description: () => t('quantumchess', 'A loud pirate who loves rolls and king hunts'),
		avatar: avatarsOf('captain'),
		canned: {
			start: [
				() => t('quantumchess', 'Arr! Hoist the sails, let’s roll some dice!'),
				() => t('quantumchess', 'Ahoy! May the odds be ever in me favour!'),
			],
			opponentLucky: [
				() => t('quantumchess', 'Blimey! The sea gods smile on ye today.'),
				() => t('quantumchess', 'Arr, a lucky shot! I’ll have me revenge.'),
			],
			opponentUnlucky: [
				() => t('quantumchess', 'Har har! The dice be on me side!'),
				() => t('quantumchess', 'Missed, matey! The ghost was elsewhere.'),
			],
			kingDanger: [
				() => t('quantumchess', 'Batten down the hatches, me king’s in danger!'),
				() => t('quantumchess', 'All hands, protect the captain’s king!'),
			],
			win: [
				() => t('quantumchess', 'Victory! The treasure be mine!'),
				() => t('quantumchess', 'Arr, a fine battle. Ye fought bravely!'),
			],
			loss: [
				() => t('quantumchess', 'Shiver me timbers, ye beat me fair and square!'),
				() => t('quantumchess', 'Arr… I’ll be walkin’ the plank now.'),
			],
			fallback: [
				() => t('quantumchess', 'Me map got wet… I’ll steer by instinct!'),
				() => t('quantumchess', 'The parrot chose this one. Arr!'),
			],
		},
	}),
	Object.freeze({
		id: 'superposa',
		name: 'Madame Superposa',
		priority: 'P0',
		tolerance: 8,
		styleTags: ['split', 'merge', 'measure'],
		styleBonus: { split: 0.03, merge: 0.03, measure: 0.02, roll: 0, standard: 0 },
		description: () => t('quantumchess', 'A mystical fortune teller who loves splits and merges'),
		avatar: avatarsOf('superposa'),
		canned: {
			start: [
				() => t('quantumchess', 'The cards reveal… a game of many futures.'),
				() => t('quantumchess', 'I see two paths before you. Choose wisely.'),
			],
			opponentLucky: [
				() => t('quantumchess', 'Fate smiled upon you… this time.'),
				() => t('quantumchess', 'The crystal ball did not foresee that!'),
			],
			opponentUnlucky: [
				() => t('quantumchess', 'The spirits have spoken. It was not meant to be.'),
				() => t('quantumchess', 'A future that never came to pass…'),
			],
			kingDanger: [
				() => t('quantumchess', 'A dark shadow falls over my king…'),
				() => t('quantumchess', 'The omens are troubling for my king.'),
			],
			win: [
				() => t('quantumchess', 'It was written in the stars.'),
				() => t('quantumchess', 'I saw this ending long ago.'),
			],
			loss: [
				() => t('quantumchess', 'I saw a possibility where I win. Alas, not this one.'),
				() => t('quantumchess', 'The cards were clouded today. Well played.'),
			],
			fallback: [
				() => t('quantumchess', 'My crystal ball is foggy… I’ll trust my instincts.'),
				() => t('quantumchess', 'The spirits are silent. I shall choose myself.'),
			],
		},
	}),
	Object.freeze({
		id: 'q7',
		name: 'Q-7',
		priority: 'P0',
		tolerance: 1,
		styleTags: ['strongest', 'one number'],
		styleBonus: { split: 0, merge: 0, measure: 0, roll: 0, standard: 0 },
		description: () => t('quantumchess', 'A polite, deadpan robot. The strongest of the four'),
		avatar: avatarsOf('q7'),
		canned: {
			start: [
				() => t('quantumchess', 'Game initialised. Probability of an interesting game: 100.0 %.'),
				() => t('quantumchess', 'Greetings. Calculating.'),
			],
			opponentLucky: [
				() => t('quantumchess', 'Unexpected outcome recorded. Recalculating.'),
				() => t('quantumchess', 'Low-probability event observed. Noted.'),
			],
			opponentUnlucky: [
				() => t('quantumchess', 'Outcome within expectations.'),
				() => t('quantumchess', 'Your roll failed. Statistics remain undefeated.'),
			],
			kingDanger: [
				() => t('quantumchess', 'Warning: king exposure elevated.'),
				() => t('quantumchess', 'Alert. Defensive routine engaged.'),
			],
			win: [
				() => t('quantumchess', 'Game complete. Result: win. Thank you for the data.'),
				() => t('quantumchess', 'Victory probability: 100.0 %. Good game.'),
			],
			loss: [
				() => t('quantumchess', 'Result: loss. Updating my model of you.'),
				() => t('quantumchess', 'Impressive. Error rate of my opponent: 0.0 %.'),
			],
			fallback: [
				() => t('quantumchess', 'Connection noise detected. Using internal routine.'),
				() => t('quantumchess', 'Answer invalid. Fallback engaged.'),
			],
		},
	}),
])

/**
 * A persona by id.
 *
 * @param {string} id persona id
 * @return {object|null}
 */
export function personaById(id) {
	return PERSONAS.find((p) => p.id === id) ?? null
}

/**
 * The drawing for one of the six moods of an answer (GAME-DESIGN §6.2).
 *
 * @param {string|null} mood happy | confident | playful | thinking | worried | surprised
 * @return {'calm'|'happy'|'worried'}
 */
export function moodToExpression(mood) {
	switch (mood) {
		case 'happy':
		case 'playful':
			return 'happy'
		case 'worried':
		case 'surprised':
			return 'worried'
		default:
			return 'calm'
	}
}

/**
 * A random canned line of a persona for an event.
 *
 * @param {object} persona persona
 * @param {string} event start | opponentLucky | opponentUnlucky | kingDanger | win | loss | fallback
 * @param {() => number} [rng] random source (UI flavour only, never a roll)
 * @return {string}
 */
export function cannedLine(persona, event, rng = Math.random) {
	const lines = persona?.canned?.[event] ?? []
	if (lines.length === 0) {
		return ''
	}
	return lines[Math.floor(rng() * lines.length) % lines.length]()
}
