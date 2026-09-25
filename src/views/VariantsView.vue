<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The chess variants (route /variants): the catalogue by category, the variant games on this device, and the New game
  dialog of a variant (opponent, level, side and the variant's options; an option may describe its value, for example
  the back rank of a Chess960 start position).
-->
<template>
	<div class="qc-variants">
		<header class="qc-variants__head">
			<h2>{{ t('quantumchess', 'Chess variants') }}</h2>
			<p>
				{{ t('quantumchess', 'Twenty ways to play, from 3D and 4D chess to shogi and xiangqi. Every variant keeps the quantum rules: split, merge, measure, and land = roll, pass = link.') }}
			</p>
		</header>

		<section v-if="saved.length" class="qc-variants__section">
			<h3>{{ t('quantumchess', 'Continue on this device') }}</h3>
			<ul class="qc-variants__saved">
				<li v-for="g in saved" :key="g.id">
					<router-link
						:to="{ name: 'variant-game', params: { variant: g.variant, id: g.id } }"
						class="qc-variants__saved-link">
						<strong>{{ catalogEntry(g.variant)?.name() ?? g.variant }}</strong>
						<span>{{
							g.result
								? t('quantumchess', 'Finished')
								: t('quantumchess', 'Move {n}', { n: Math.floor(g.ply / 2) + 1 })
						}}</span>
					</router-link>
					<NcButton
						variant="tertiary"
						:aria-label="t('quantumchess', 'Delete from this device')"
						@click="remove(g.id)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiTrashCanOutline" />
						</template>
					</NcButton>
				</li>
			</ul>
		</section>

		<section v-for="cat in categories" :key="cat.id" class="qc-variants__section">
			<h3>{{ cat.name }}</h3>
			<ul class="qc-variants__tiles">
				<li v-if="cat.id === 'uncertainty'">
					<router-link class="qc-variants__tile" :to="{ name: 'new-game' }" data-test="variant-classic">
						<span class="qc-variants__tile-title">{{ t('quantumchess', 'Quantum Chess') }}</span>
						<span class="qc-variants__tile-summary">{{ t(
							'quantumchess',
							'The classic: chess with superposition. Also online against other players.',
						) }}</span>
					</router-link>
				</li>
				<li v-for="e in cat.entries" :key="e.id">
					<button
						type="button"
						class="qc-variants__tile"
						:data-test="'variant-' + e.id"
						@click="openSetup(e)">
						<span class="qc-variants__tile-title">{{ e.name() }}</span>
						<span class="qc-variants__tile-summary">{{ e.summary() }}</span>
						<span v-if="e.players > 2" class="qc-variants__tile-badge">
							{{ n('quantumchess', '%n player', '%n players', e.players) }}
						</span>
					</button>
				</li>
			</ul>
		</section>

		<NcDialog
			v-if="setup"
			:name="setup.entry.name()"
			size="normal"
			@closing="setup = null">
			<NcLoadingIcon v-if="!setup.variant" :size="32" />
			<form v-else class="qc-variants__form" @submit.prevent="start">
				<p class="qc-variants__summary">
					{{ setup.entry.summary() }}
				</p>
				<fieldset>
					<legend>{{ t('quantumchess', 'Opponent') }}</legend>
					<NcCheckboxRadioSwitch
						v-model="setup.opponent"
						type="radio"
						value="computer"
						name="qc-variant-opponent">
						{{ t('quantumchess', 'Computer') }}
					</NcCheckboxRadioSwitch>
					<NcCheckboxRadioSwitch
						v-model="setup.opponent"
						type="radio"
						value="local"
						name="qc-variant-opponent">
						{{ t('quantumchess', 'Pass & play') }}
					</NcCheckboxRadioSwitch>
				</fieldset>
				<fieldset v-if="setup.opponent === 'computer'">
					<legend>{{ t('quantumchess', 'Level') }}</legend>
					<NcCheckboxRadioSwitch
						v-for="l in levels"
						:key="l.id"
						v-model="setup.level"
						type="radio"
						:value="l.id"
						name="qc-variant-level">
						{{ l.label }}
					</NcCheckboxRadioSwitch>
				</fieldset>
				<fieldset v-if="setup.opponent === 'computer'">
					<legend>{{ t('quantumchess', 'You play') }}</legend>
					<NcCheckboxRadioSwitch
						v-for="(s, i) in setup.variant.sides"
						:key="i"
						v-model="setup.side"
						type="radio"
						:value="String(i)"
						name="qc-variant-side">
						{{ sideName(setup.variant, i) }}
					</NcCheckboxRadioSwitch>
				</fieldset>
				<fieldset v-for="o in setup.variant.options" :key="o.id">
					<legend>{{ o.label() }}</legend>
					<template v-if="o.type === 'choice'">
						<NcCheckboxRadioSwitch
							v-for="c in o.values"
							:key="c.id"
							v-model="setup.options[o.id]"
							type="radio"
							:value="c.id"
							:name="'qc-variant-option-' + o.id">
							{{ c.label() }}
						</NcCheckboxRadioSwitch>
					</template>
					<NcCheckboxRadioSwitch v-else-if="o.type === 'boolean'" v-model="setup.options[o.id]">
						{{ o.label() }}
					</NcCheckboxRadioSwitch>
					<div v-else class="qc-variants__number">
						<NcTextField
							v-model="setup.options[o.id]"
							type="number"
							:label="o.label()"
							:min="o.min"
							:max="o.max" />
						<NcButton v-if="o.random" @click="setup.options[o.id] = String(randomInt(o.min, o.max))">
							{{ t('quantumchess', 'Random') }}
						</NcButton>
					</div>
					<p
						v-if="describeOption(o)"
						class="qc-variants__describe"
						aria-live="polite"
						:data-test="'option-describe-' + o.id">
						{{ describeOption(o) }}
					</p>
				</fieldset>
				<NcCheckboxRadioSwitch
					v-if="setup.opponent === 'local' && !setup.variant.hidden"
					v-model="setup.autoFlip">
					{{ t('quantumchess', 'Turn the board to the player to move') }}
				</NcCheckboxRadioSwitch>
				<div class="qc-variants__buttons">
					<NcButton variant="primary" type="submit">
						{{ t('quantumchess', 'Start game') }}
					</NcButton>
				</div>
			</form>
		</NcDialog>
	</div>
</template>

<script setup>
import { mdiTrashCanOutline } from '@mdi/js'
import { n, t } from '@nextcloud/l10n'
import { computed, markRaw, ref } from 'vue'
import { useRouter } from 'vue-router'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { createVariantGame, deleteVariantGame, listVariantGames } from '../variantplay/variantGames.js'
import {
	CATALOG,
	catalogEntry,
	CATEGORIES,
	categoryName,
	loadVariant,
	newGame,
	optionValues,
	sideName,
} from '../variants/index.js'

const router = useRouter()
const saved = ref(listVariantGames())
const setup = ref(null)

const categories = computed(() => CATEGORIES.map((id) => ({
	id,
	name: categoryName(id),
	entries: CATALOG.filter((e) => e.category === id),
})))

const levels = [
	{ id: 'easy', label: t('quantumchess', 'Easy') },
	{ id: 'normal', label: t('quantumchess', 'Normal') },
	{ id: 'hard', label: t('quantumchess', 'Hard') },
]

/**
 * A random integer in [min, max].
 *
 * @param {number} min lowest
 * @param {number} max highest
 * @return {number}
 */
function randomInt(min, max) {
	return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * The option's own description of the value chosen in the dialog (`describe(value)`), or an empty string.
 *
 * @param {object} o option declaration
 * @return {string}
 */
function describeOption(o) {
	if (!o.describe || !setup.value) {
		return ''
	}
	const raw = setup.value.options[o.id]
	const value = o.type === 'number' ? Number.parseInt(raw, 10) : raw
	if (o.type === 'number' && !(Number.isInteger(value) && value >= o.min && value <= o.max)) {
		return ''
	}
	const text = o.describe(value)
	return typeof text === 'string' ? text : ''
}

/**
 * Open the New game dialog of a variant.
 *
 * @param {object} entry catalogue entry
 */
async function openSetup(entry) {
	setup.value = {
		entry,
		variant: null,
		opponent: 'computer',
		level: 'normal',
		side: '0',
		options: {},
		autoFlip: false,
	}
	const V = markRaw(await loadVariant(entry.id))
	const options = {}
	for (const o of V.options) {
		options[o.id] = o.type === 'number'
			? String(o.random ? randomInt(o.min, o.max) : o.default)
			: o.default
	}
	// the dialog is still open for this variant (compare ids: the ref holds a reactive copy of the entry)
	if (setup.value?.entry.id === entry.id) {
		setup.value = { ...setup.value, variant: V, options }
	}
}

/** Create the game and open it. */
function start() {
	const s = setup.value
	const V = s.variant
	const given = {}
	for (const o of V.options) {
		given[o.id] = o.type === 'number' ? Number.parseInt(s.options[o.id], 10) : s.options[o.id]
	}
	const options = optionValues(V, given)
	const players = V.sides.map((x, i) => (s.opponent === 'local' || String(i) === s.side
		? { kind: 'human' }
		: { kind: 'computer', level: s.level }))
	const initial = newGame(V, options, Math.random)
	const rec = createVariantGame({ variant: V.id, options, players, initial, autoFlip: s.autoFlip })
	setup.value = null
	router.push({ name: 'variant-game', params: { variant: V.id, id: rec.id } })
}

/**
 * Delete a saved game.
 *
 * @param {string} id game id
 */
function remove(id) {
	deleteVariantGame(id)
	saved.value = listVariantGames()
}
</script>

<style lang="scss" scoped>
.qc-variants {
	box-sizing: border-box;
	max-width: 1200px;
	margin: 0 auto;
	padding: 8px 16px 32px;
}

.qc-variants__head {
	padding-inline-start: 40px;

	h2 {
		margin: 0 0 4px;
		font-size: 22px;
		line-height: 34px;
	}

	p {
		margin: 0;
		color: var(--color-text-maxcontrast);
		line-height: 1.45;
	}
}

.qc-variants__section {
	margin-top: 24px;

	h3 {
		margin: 0 0 10px;
		font-size: 18px;
		font-weight: bold;
	}
}

.qc-variants__tiles {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-variants__tile {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	min-height: 110px;
	margin: 0;
	padding: 14px;
	border: 2px solid var(--color-border);
	border-radius: var(--border-radius-large);
	background: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		border-color: var(--color-primary-element);
		background: var(--color-primary-element-light);
	}
}

.qc-variants__tile-title {
	font-size: 16px;
	font-weight: bold;
}

.qc-variants__tile-summary {
	color: var(--color-text-maxcontrast);
	font-weight: normal;
	line-height: 1.35;
}

.qc-variants__tile-badge {
	padding: 1px 8px;
	border-radius: var(--border-radius-pill);
	background: var(--color-primary-element-light);
	font-size: 12px;
}

.qc-variants__saved {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-large);
	}
}

.qc-variants__saved-link {
	display: flex;
	flex: 1;
	flex-direction: column;
	padding: 8px 12px;

	span {
		color: var(--color-text-maxcontrast);
	}
}

.qc-variants__form {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-bottom: 12px;

	fieldset legend {
		font-weight: bold;
	}
}

.qc-variants__summary {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.qc-variants__number {
	display: flex;
	align-items: flex-end;
	gap: 8px;
}

.qc-variants__describe {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
}

.qc-variants__buttons {
	display: flex;
	justify-content: flex-end;
}
</style>
