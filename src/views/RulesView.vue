<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The Rules page (SPEC §14.10): RULES.md as translatable content with live mini-boards. A "play" board shows the
  position before and after one move, with a toggle per possible result.
-->
<template>
	<div class="qc-rules">
		<nav class="qc-rules__toc" :aria-label="t('quantumchess', 'Contents')">
			<h2 class="qc-rules__toc-title">
				{{ t('quantumchess', 'How to play') }}
			</h2>
			<ol>
				<li v-for="s in sections" :key="s.id">
					<a :href="'#' + route.path + '?s=' + s.id" @click.prevent="scrollTo(s.id)">{{ s.title }}</a>
				</li>
			</ol>
		</nav>
		<article class="qc-rules__content">
			<h1 class="qc-rules__title">
				{{ t('quantumchess', 'How to play Quantum Chess') }}
			</h1>
			<p class="qc-rules__lead">
				{{ t('quantumchess', 'Quantum Chess is chess with one new idea: a piece can be in more than one place at once, until something finds out where it really is.') }}
			</p>
			<section
				v-for="s in sections"
				:id="'qc-rules-' + s.id"
				:key="s.id"
				class="qc-rules__section">
				<h2>{{ s.title }}</h2>
				<template v-for="(b, i) in s.blocks" :key="i">
					<p v-if="b.type === 'p'">
						{{ b.text() }}
					</p>
					<component :is="b.ordered ? 'ol' : 'ul'" v-else-if="b.type === 'list'" class="qc-rules__list">
						<li v-for="(item, j) in b.items" :key="j">
							{{ item() }}
						</li>
					</component>
					<div v-else-if="b.type === 'table'" class="qc-rules__table-wrap">
						<table class="qc-rules__table">
							<thead>
								<tr>
									<th v-for="(h, j) in b.head" :key="j" scope="col">
										{{ h() }}
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="(row, j) in b.rows" :key="j">
									<td v-for="(cell, k) in row" :key="k">
										{{ cell() }}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<div v-else-if="b.type === 'faq'" class="qc-rules__faq">
						<h3>{{ b.q() }}</h3>
						<p>{{ b.a() }}</p>
					</div>
					<RulesBoard v-else-if="b.type === 'board'" :block="b" />
				</template>
			</section>
		</article>
	</div>
</template>

<script setup>
import { t } from '@nextcloud/l10n'
import { useRoute } from 'vue-router'
import RulesBoard from '../components/app/RulesBoard.vue'
import { RULES_SECTIONS } from '../rules/sections.js'

const route = useRoute()
const sections = RULES_SECTIONS.map((s) => ({ ...s, title: s.title() }))

/**
 * Scroll to a section.
 *
 * @param {string} id section id
 */
function scrollTo(id) {
	document.getElementById('qc-rules-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<style lang="scss" scoped>
.qc-rules {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 24px;
	box-sizing: border-box;
	max-width: 1100px;
	margin: 0 auto;
	padding: 8px 16px 48px;
}

@media (min-width: 1024px) {
	.qc-rules {
		grid-template-columns: 240px minmax(0, 1fr);
		padding: 8px 24px 24px;
	}

	.qc-rules__toc {
		position: sticky;
		top: 16px;
		align-self: start;
	}
}

.qc-rules__toc {
	ol {
		margin: 0;
		padding-inline-start: 0;
		list-style: none;
	}

	a {
		display: block;
		padding: 6px 8px;
		border-radius: var(--border-radius-small);
		color: var(--color-main-text);

		&:hover,
		&:focus-visible {
			background: var(--color-background-hover);
		}
	}
}

.qc-rules__toc-title {
	min-height: 34px;
	margin: 0 0 8px;
	// keep clear of the navigation toggle in the top-left corner
	padding-inline-start: 40px;
	font-size: 16px;
	line-height: 34px;
}

.qc-rules__title {
	margin: 0 0 8px;
	font-size: 26px;
	font-weight: bold;
	line-height: 1.2;
}

.qc-rules__lead {
	font-size: 17px;
	line-height: 1.5;
}

.qc-rules__section {
	scroll-margin-top: 16px;
	padding-top: 16px;

	h2 {
		margin: 16px 0 8px;
		font-size: 21px;
		font-weight: bold;
	}

	p {
		margin: 8px 0;
		line-height: 1.6;
	}
}

.qc-rules__list {
	margin: 8px 0;
	padding-inline-start: 24px;
	line-height: 1.6;

	li {
		margin: 4px 0;
	}
}

ul.qc-rules__list {
	list-style: disc;
}

ol.qc-rules__list {
	list-style: decimal;
}

.qc-rules__table-wrap {
	overflow-x: auto;
}

.qc-rules__table {
	width: 100%;
	margin: 8px 0;
	border-collapse: collapse;

	th,
	td {
		padding: 8px;
		border-block-end: 1px solid var(--color-border);
		text-align: start;
		vertical-align: top;
	}

	th {
		color: var(--color-text-maxcontrast);
	}
}

.qc-rules__faq h3 {
	margin: 16px 0 4px;
	font-size: 16px;
	font-weight: bold;
}
</style>
