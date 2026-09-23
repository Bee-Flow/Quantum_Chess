<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  The AI coach chat (GAME-DESIGN §5.5): suggested questions, safe Markdown answers (at most 2000 characters) and move
  chips validated with findMove. Without an AI source, or when a request fails, the engine answers instead.
-->
<template>
	<section class="qc-coach-chat" :aria-label="t('quantumchess', 'Ask the coach')">
		<h3 class="qc-coach-chat__title">
			{{ t('quantumchess', 'Ask the coach') }}
		</h3>
		<ol
			v-if="messages.length"
			ref="list"
			class="qc-coach-chat__list"
			aria-live="polite">
			<li
				v-for="(m, i) in messages"
				:key="i"
				class="qc-coach-chat__message"
				:class="'qc-coach-chat__message--' + m.role">
				<template v-if="m.role === 'user'">
					{{ m.text }}
				</template>
				<template v-else>
					<p v-if="m.fallback" class="qc-coach-chat__fallback">
						{{ t('quantumchess', 'The AI coach is unavailable. Here is what the engine says:') }}
					</p>
					<NcRichText :text="withoutLinks(m.text)" useMarkdown :autolink="false" />
					<div v-if="m.chips.length" class="qc-coach-chat__chips">
						<button
							v-for="c in m.chips"
							:key="c.text"
							type="button"
							class="qc-coach-chat__chip"
							:class="{ 'qc-coach-chat__chip--illegal': !c.legal }"
							:disabled="!c.legal"
							:title="c.legal ? t('quantumchess', 'Show this move on the board') : t('quantumchess', 'not legal here')"
							data-test="move-chip"
							@mouseenter="c.legal && emit('showMove', { code: c.code })"
							@focus="c.legal && emit('showMove', { code: c.code })"
							@mouseleave="emit('showMove', { code: null })"
							@blur="emit('showMove', { code: null })"
							@click="emit('showMove', { code: c.code, pin: true })">
							{{ c.text }}
						</button>
					</div>
				</template>
			</li>
		</ol>
		<div v-if="pending" class="qc-coach-chat__pending">
			<NcLoadingIcon :size="20" />
			{{ t('quantumchess', 'The coach is thinking …') }}
		</div>
		<div class="qc-coach-chat__suggestions">
			<NcButton
				v-for="q in suggestions"
				:key="q"
				size="small"
				variant="secondary"
				:disabled="pending"
				@click="ask(q)">
				{{ q }}
			</NcButton>
		</div>
		<form class="qc-coach-chat__form" @submit.prevent="ask(draft)">
			<NcTextField
				v-model="draft"
				:label="t('quantumchess', 'Your question')"
				:maxlength="500"
				:disabled="pending" />
			<NcButton type="submit" :disabled="!draft.trim() || pending" :aria-label="t('quantumchess', 'Ask')">
				<template #icon>
					<NcIconSvgWrapper :path="mdiSend" />
				</template>
			</NcButton>
		</form>
		<p v-if="!aiAvailable" class="qc-coach-chat__note">
			{{ t('quantumchess', 'No AI provider is set up, so the built-in engine answers.') }}
		</p>
	</section>
</template>

<script setup>
import { mdiSend } from '@mdi/js'
import { getLanguage, t } from '@nextcloud/l10n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcRichText from '@nextcloud/vue/components/NcRichText'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { moveChips, truncateAnswer, withoutLinks } from '../../coach/chips.js'
import { engineAnswer } from '../../coach/explain.js'
import { useAiSources } from '../../composables/useAiSources.js'
import { waitForAiTask } from '../../services/aiTasks.js'
import { requestCoach } from '../../services/api.js'

const props = defineProps({
	/** Position the questions are about */
	state: { type: Object, required: true },
	/** MoveEntry list */
	moves: { type: Array, default: () => [] },
	/** Analysis of the position */
	analysis: { type: Object, default: null },
	/** {kind: game | lesson | puzzle | review, title?, goal?, ply?} */
	context: { type: Object, default: () => ({ kind: 'game' }) },
	/** The player's colour */
	playerColor: { type: String, default: 'w' },
	/** Threat sentences (≤ 8) */
	threats: { type: Array, default: () => [] },
	/** {code, label, deltaE} of the player's last graded move */
	lastMove: { type: Object, default: null },
	/** beginner | intermediate | advanced */
	skill: { type: String, default: 'beginner' },
})
const emit = defineEmits(['showMove'])

const ai = useAiSources()
const aiAvailable = computed(() => ai.anyAvailable.value)
const messages = ref([])
const draft = ref('')
const pending = ref(false)
const list = ref(null)
let ctrl = null

const suggestions = [
	t('quantumchess', 'Why was my last move a mistake?'),
	t('quantumchess', 'What is my opponent threatening?'),
	t('quantumchess', 'Explain the link here'),
	t('quantumchess', 'What\'s the plan?'),
]

onMounted(() => ai.refresh())
onBeforeUnmount(() => ctrl?.abort())

/**
 * The request body (SPEC §7.4.7 limits).
 *
 * @param {string} question question
 * @return {object}
 */
function body(question) {
	const a = props.analysis
	return {
		source: ai.defaultSource.value ?? ai.sources.value.find((s) => s.available)?.id,
		model: null,
		language: getLanguage(),
		state: toRaw(props.state),
		history: props.moves.slice(-16).map((m) => ({
			ply: m.ply,
			code: m.code,
			key: m.measurement?.key ?? null,
			weight: m.measurement?.outcomes?.find((o) => o.key === m.measurement.key)?.weight ?? null,
		})),
		analysis: a
			? {
					E: a.E,
					best: (a.best ?? []).slice(0, 3).map((b) => ({ code: b.code, E: b.E, line: (b.pv ?? [b.code]).slice(0, 6) })),
					threats: props.threats.slice(0, 8).map((x) => x.slice(0, 120)),
					lastMove: props.lastMove,
				}
			: null,
		context: { kind: props.context.kind, title: props.context.title?.slice(0, 200), goal: props.context.goal?.slice(0, 200), ply: props.context.ply },
		player: { color: props.playerColor, skill: props.skill },
		chat: messages.value.slice(-4).map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: m.text.slice(0, 600) })),
		question,
	}
}

/**
 * Add a coach answer.
 *
 * @param {string} text Markdown
 * @param {boolean} fallback engine fallback
 */
async function answer(text, fallback = false) {
	const shown = truncateAnswer(text)
	messages.value = [...messages.value, { role: 'coach', text: shown, fallback, chips: moveChips(shown, toRaw(props.state)) }]
	await nextTick()
	if (list.value) {
		list.value.scrollTop = list.value.scrollHeight
	}
}

/**
 * Ask a question.
 *
 * @param {string} q question
 */
async function ask(q) {
	const question = q.trim().slice(0, 500)
	if (!question || pending.value) {
		return
	}
	draft.value = ''
	const request = body(question)
	messages.value = [...messages.value, { role: 'user', text: question }]
	import('../../trainer/events.js').then((m) => m.reportGameEvent({ type: 'coachQuestion' })).catch(() => {})
	pending.value = true
	try {
		await ai.refresh()
		if (!request.source || !aiAvailable.value || !(await ai.ensureNotice(request.source))) {
			await answer(engineAnswer(toRaw(props.state), props.analysis, props.playerColor), aiAvailable.value)
			return
		}
		ctrl = new AbortController()
		let res = await requestCoach(request, { signal: ctrl.signal, timeout: 95000 })
		if (res?.status === 'pending' && res.taskId) {
			res = await waitForAiTask(res.taskId, { signal: ctrl.signal })
		}
		if (!res?.answer) {
			throw new Error('empty answer')
		}
		await answer(res.answer)
	} catch (e) {
		if (e?.name !== 'AbortError') {
			await answer(engineAnswer(toRaw(props.state), props.analysis, props.playerColor), true)
		}
	} finally {
		pending.value = false
	}
}
</script>

<style lang="scss" scoped>
.qc-coach-chat {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.qc-coach-chat__title {
	margin: 0;
	font-size: 1em;
	font-weight: bold;
}

.qc-coach-chat__list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: 320px;
	overflow-y: auto;
	margin: 0;
	padding: 0;
	list-style: none;
}

.qc-coach-chat__message {
	padding: 6px 10px;
	border-radius: var(--border-radius-large, 10px);
	background: var(--color-background-dark);

	&--user {
		align-self: flex-end;
		background: var(--color-primary-element-light);
		color: var(--color-primary-element-light-text);
	}
}

.qc-coach-chat__fallback {
	margin: 0 0 4px;
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}

.qc-coach-chat__chips,
.qc-coach-chat__suggestions {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 4px;
}

.qc-coach-chat__chip {
	min-height: 28px;
	margin: 0;
	padding: 0 10px;
	border: 1px solid var(--color-primary-element);
	border-radius: var(--border-radius-pill, 14px);
	background: var(--color-main-background);
	color: var(--color-primary-element);
	font-family: var(--font-face-monospace, monospace);
	cursor: pointer;

	&--illegal {
		border-color: var(--color-border);
		color: var(--color-text-maxcontrast);
		cursor: default;
	}
}

.qc-coach-chat__pending {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--color-text-maxcontrast);
}

.qc-coach-chat__form {
	display: flex;
	align-items: flex-end;
	gap: 4px;
}

.qc-coach-chat__note {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}
</style>
