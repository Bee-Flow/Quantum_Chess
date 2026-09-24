<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  One local game: the useLocalGame controller rendered by GameScreen, with the coach (evaluation bar, move-quality
  toast, coach tab) and, against an LLM opponent, its chat. LocalGameView keys it by the game id.
-->
<template>
	<NcEmptyContent
		v-if="controller.error.value && !controller.moves.value.length && !controller.record.value"
		:name="t('quantumchess', 'Game not found')"
		:description="controller.error.value.message">
		<template #action>
			<NcButton variant="primary" :to="{ name: 'new-game' }">
				{{ t('quantumchess', 'New game') }}
			</NcButton>
		</template>
	</NcEmptyContent>
	<GameScreen
		v-else
		:controller="controller"
		:level="level"
		:arrows="coachArrows"
		:highlights="coach.highlights.value"
		:markers="coach.markers.value"
		@rematch="emit('rematch', controller.record.value)"
		@nextLevel="emit('nextLevel', controller.record.value)"
		@newGame="emit('newGame', controller.kind)"
		@review="emit('review', id)">
		<template v-if="controller.kind === 'ai'" #chat>
			<AiChat :controller="controller" :name="controller.names.value[aiColor]" />
		</template>
		<template v-if="coach.active.value && preferences.evalBar" #eval="{ layout }">
			<EvalBar
				:analysis="coach.analysis.value"
				:orientation="controller.orientation.value"
				:horizontal="layout === 'phone'"
				:format="preferences.evalFormat" />
		</template>
		<template v-if="coach.active.value" #overlay>
			<QualityToast :coach="coach" :orientation="controller.orientation.value" />
		</template>
		<template #coach>
			<CoachPanel
				:coach="coach"
				:state="controller.state.value"
				:moves="controller.moves.value"
				:myColor="controller.myColor.value"
				:context="{ kind: 'game' }"
				@showMove="showMove" />
		</template>
	</GameScreen>
</template>

<script setup>
import { showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, onMounted, shallowRef, toRaw, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import CoachPanel from '../../coach/components/CoachPanel.vue'
import EvalBar from '../../coach/components/EvalBar.vue'
import QualityToast from '../../coach/components/QualityToast.vue'
import AiChat from '../../llm/components/AiChat.vue'
import GameScreen from './GameScreen.vue'
import { useCoach } from '../../coach/composables/useCoach.js'
import { findMove, otherColor } from '../../engine/index.js'
import { preferences } from '../../services/preferences.js'
import { useLocalGame } from '../composables/useLocalGame.js'
import { saveLocalGame } from '../localGames.js'

const props = defineProps({
	/** Local game id */
	id: { type: String, required: true },
})
const emit = defineEmits(['rematch', 'nextLevel', 'newGame', 'review'])

const controller = useLocalGame(props.id, {
	onError: (e) => {
		if (e?.name === 'ApiError') {
			showError(t(
				'quantumchess',
				'The AI could not answer: {reason}. The built-in engine played instead.',
				{ reason: e.message || e.code },
			))
		}
	},
})
const aiColor = otherColor(controller.myColor.value)
const level = computed(() => {
	const rec = controller.record.value
	return rec?.mode === 'computer' ? rec.players[aiColor]?.level ?? null : null
})

// --- Coach: always the beginner level in the trainer's graduation game, else the user's preference ---
const coach = useCoach({
	state: controller.state,
	moves: controller.moves,
	myColor: controller.myColor,
	stateAt: controller.stateAt,
	level: computed(() => (controller.record.value?.options?.lesson ? 'beginner' : null)),
})
const chipArrow = shallowRef(null)
const coachArrows = computed(() => (chipArrow.value ? [...coach.arrows.value, chipArrow.value] : coach.arrows.value))
watch(() => controller.state.value, () => {
	chipArrow.value = null
})
watch(coach.used, (used) => {
	const rec = controller.record.value
	if (used && rec && !rec.coachUsed) {
		rec.coachUsed = true
		saveLocalGame(toRaw(rec))
	}
})

/**
 * Draw (or clear) the arrow of a move chip or a coach suggestion.
 *
 * @param {{code: string|null, before?: number}} e event (`before`: the move's index when it is not the live position)
 */
function showMove(e) {
	const at = typeof e?.before === 'number' ? controller.stateAt(e.before) : controller.state.value
	const m = e?.code ? findMove(toRaw(at), e.code) : null
	chipArrow.value = m ? { from: m.from[0], to: m.to[0], kind: 'best' } : null
}

onMounted(() => controller.start())
onBeforeUnmount(() => controller.dispose())
</script>
