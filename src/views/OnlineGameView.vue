<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Online games (route /game/:id): one OnlineGameHost per game id, so a rematch starts with a fresh controller. A chess
  variant game is shown by OnlineVariantGame once it has started.
-->
<template>
	<div class="qc-online-view">
		<OnlineGameHost :id="gameId" :key="gameId">
			<template #variant="{ controller }">
				<OnlineVariantGame :controller="controller" />
			</template>
		</OnlineGameHost>
	</div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import OnlineGameHost from '../online/components/OnlineGameHost.vue'
import OnlineVariantGame from './OnlineVariantGame.vue'

const route = useRoute()
const gameId = computed(() => Number(route.params.id))
</script>

<style scoped>
.qc-online-view {
	width: 100%;
	min-height: 100%;
}
</style>
