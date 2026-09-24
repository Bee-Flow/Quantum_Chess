<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
  Portraits of the personas, three expressions each: calm, happy, worried. Pure SVG, decorative (the name is always
  shown next to it).
-->
<template>
	<svg
		class="qc-persona-avatar"
		:width="size"
		:height="size"
		viewBox="0 0 48 48"
		aria-hidden="true"
		focusable="false">
		<circle
			cx="24"
			cy="24"
			r="24"
			:fill="bg" />
		<!-- Professor Qubit: an owl in a mortarboard with Bloch-sphere spectacles -->
		<g v-if="persona === 'professor'">
			<ellipse
				cx="24"
				cy="31"
				rx="14"
				ry="14"
				fill="#8a5a35" />
			<ellipse
				cx="24"
				cy="35"
				rx="8"
				ry="8"
				fill="#d9b48f" />
			<g fill="#fff" stroke="#2d2d2d" stroke-width="1.4">
				<circle cx="18" cy="26" r="5.5" />
				<circle cx="30" cy="26" r="5.5" />
			</g>
			<g
				fill="none"
				stroke="#2d2d2d"
				stroke-width="0.7"
				opacity="0.6">
				<ellipse
					cx="18"
					cy="26"
					rx="5.5"
					ry="1.8" />
				<ellipse
					cx="30"
					cy="26"
					rx="5.5"
					ry="1.8" />
			</g>
			<line
				x1="23.5"
				y1="26"
				x2="24.5"
				y2="26"
				stroke="#2d2d2d"
				stroke-width="1.4" />
			<g
				v-if="expression === 'happy'"
				fill="none"
				stroke="#2d2d2d"
				stroke-width="1.6"
				stroke-linecap="round">
				<path d="M15.5 27 q2.5 -3 5 0" />
				<path d="M27.5 27 q2.5 -3 5 0" />
			</g>
			<g v-else fill="#2d2d2d">
				<circle cx="18" :cy="expression === 'worried' ? 27 : 26.5" :r="expression === 'worried' ? 1.4 : 2" />
				<circle cx="30" :cy="expression === 'worried' ? 27 : 26.5" :r="expression === 'worried' ? 1.4 : 2" />
			</g>
			<path
				v-if="expression === 'worried'"
				d="M13 20 l6 -2 M35 20 l-6 -2"
				stroke="#2d2d2d"
				stroke-width="1.4"
				stroke-linecap="round" />
			<path d="M22 31 l2 3 l2 -3 z" fill="#f2a93b" />
			<path d="M10 16 l14 -6 l14 6 l-14 6 z" fill="#2d2d2d" />
			<rect
				x="18"
				y="16"
				width="12"
				height="4"
				fill="#2d2d2d" />
			<path d="M37 16 v7" stroke="#f2c14e" stroke-width="1.4" />
			<circle
				cx="37"
				cy="24"
				r="1.4"
				fill="#f2c14e" />
		</g>
		<!-- Captain Collapse: a pirate with a die as an eye-patch and a parrot -->
		<g v-else-if="persona === 'captain'">
			<circle
				cx="23"
				cy="28"
				r="12"
				fill="#f0c7a0" />
			<path d="M12 33 q11 14 22 0 q-3 5 -11 5 q-8 0 -11 -5 z" fill="#7a4a2a" />
			<path d="M9 22 q14 -16 28 0 z" fill="#2d2d2d" />
			<rect
				x="8"
				y="20.5"
				width="30"
				height="3"
				rx="1.5"
				fill="#2d2d2d" />
			<circle
				cx="23"
				cy="15"
				r="2"
				fill="#fff" />
			<rect
				x="25"
				y="23.5"
				width="6.5"
				height="6.5"
				rx="1.2"
				fill="#fff"
				stroke="#2d2d2d"
				stroke-width="1" />
			<circle
				cx="26.8"
				cy="25.3"
				r="0.8"
				fill="#2d2d2d" />
			<circle
				cx="29.7"
				cy="28.2"
				r="0.8"
				fill="#2d2d2d" />
			<circle
				cx="28.25"
				cy="26.75"
				r="0.8"
				fill="#2d2d2d" />
			<circle
				v-if="expression !== 'happy'"
				cx="18.5"
				cy="26.5"
				:r="expression === 'worried' ? 1.3 : 1.7"
				fill="#2d2d2d" />
			<path
				v-else
				d="M16.5 27 q2 -2.5 4 0"
				fill="none"
				stroke="#2d2d2d"
				stroke-width="1.5"
				stroke-linecap="round" />
			<path
				v-if="expression === 'happy'"
				d="M18 33 q5 4 10 0"
				fill="#fff"
				stroke="#2d2d2d"
				stroke-width="1.2" />
			<path
				v-else-if="expression === 'worried'"
				d="M18.5 34.5 q4.5 -3 9 0"
				fill="none"
				stroke="#2d2d2d"
				stroke-width="1.4"
				stroke-linecap="round" />
			<path
				v-else
				d="M18.5 33.5 h9"
				stroke="#2d2d2d"
				stroke-width="1.4"
				stroke-linecap="round" />
			<g transform="translate(37 30)">
				<ellipse
					cx="0"
					cy="3"
					rx="4"
					ry="6"
					fill="#2fa84f" />
				<circle
					cx="0"
					cy="-3"
					r="3.4"
					fill="#e03c31" />
				<path d="M2.5 -3 l3 1 l-3 1.2 z" fill="#f2c14e" />
				<circle
					cx="0.6"
					cy="-3.6"
					r="0.7"
					fill="#2d2d2d" />
			</g>
		</g>
		<!-- Madame Superposa: a fortune teller whose crystal ball shows two images -->
		<g v-else-if="persona === 'superposa'">
			<path d="M9 30 q0 -22 15 -22 q15 0 15 22 z" fill="#6b3fa0" />
			<circle
				cx="24"
				cy="23"
				r="9.5"
				fill="#e9b98f" />
			<path d="M14 19 q10 -9 20 0 q-10 -4 -20 0 z" fill="#8e5bc7" />
			<circle
				cx="24"
				cy="14"
				r="1.8"
				fill="#f2c14e" />
			<g
				v-if="expression === 'happy'"
				fill="none"
				stroke="#2d2d2d"
				stroke-width="1.4"
				stroke-linecap="round">
				<path d="M18.5 23 q2 -2 4 0" />
				<path d="M25.5 23 q2 -2 4 0" />
			</g>
			<g v-else fill="#2d2d2d">
				<ellipse
					cx="20.5"
					cy="22.5"
					rx="1.5"
					:ry="expression === 'calm' ? 0.8 : 1.6" />
				<ellipse
					cx="27.5"
					cy="22.5"
					rx="1.5"
					:ry="expression === 'calm' ? 0.8 : 1.6" />
			</g>
			<path
				v-if="expression === 'happy'"
				d="M21 27 q3 2.5 6 0"
				fill="none"
				stroke="#a8323e"
				stroke-width="1.4"
				stroke-linecap="round" />
			<ellipse
				v-else-if="expression === 'worried'"
				cx="24"
				cy="28"
				rx="1.6"
				ry="1.2"
				fill="#a8323e" />
			<path
				v-else
				d="M21.5 27.5 q2.5 1 5 0"
				fill="none"
				stroke="#a8323e"
				stroke-width="1.3"
				stroke-linecap="round" />
			<rect
				x="15"
				y="41"
				width="18"
				height="3"
				rx="1.5"
				fill="#7a4a2a" />
			<circle
				cx="24"
				cy="36"
				r="7.5"
				fill="#bfe3f5"
				stroke="#6b9fc0"
				stroke-width="1" />
			<circle
				cx="21.2"
				cy="36"
				r="2"
				fill="#2d2d2d"
				opacity="0.55" />
			<circle
				cx="26.8"
				cy="36"
				r="2"
				fill="#2d2d2d"
				opacity="0.55" />
			<path
				d="M21.2 36 h5.6"
				stroke="#2d2d2d"
				stroke-width="0.6"
				stroke-dasharray="1 1"
				opacity="0.55" />
		</g>
		<!-- Q-7: a boxy little robot with an LED-dot face -->
		<g v-else>
			<line
				x1="24"
				y1="6"
				x2="24"
				y2="12"
				stroke="#5b6770"
				stroke-width="1.6" />
			<circle
				cx="24"
				cy="5.5"
				r="2.2"
				:fill="expression === 'worried' ? '#e03c31' : '#4fc3f7'" />
			<rect
				x="9"
				y="12"
				width="30"
				height="26"
				rx="6"
				fill="#aab6bf" />
			<rect
				x="12.5"
				y="16"
				width="23"
				height="17"
				rx="3"
				fill="#1f2a30" />
			<rect
				x="6"
				y="21"
				width="3"
				height="8"
				rx="1.2"
				fill="#8a969f" />
			<rect
				x="39"
				y="21"
				width="3"
				height="8"
				rx="1.2"
				fill="#8a969f" />
			<g fill="#4fc3f7">
				<template v-if="expression === 'happy'">
					<path
						d="M16.5 22 q2 -2.4 4 0 M27.5 22 q2 -2.4 4 0"
						fill="none"
						stroke="#4fc3f7"
						stroke-width="1.5"
						stroke-linecap="round" />
					<circle cx="18" cy="27.5" r="1" />
					<circle cx="21" cy="29" r="1" />
					<circle cx="24" cy="29.5" r="1" />
					<circle cx="27" cy="29" r="1" />
					<circle cx="30" cy="27.5" r="1" />
				</template>
				<template v-else-if="expression === 'worried'">
					<circle
						cx="18.5"
						cy="21.5"
						r="2"
						fill="none"
						stroke="#4fc3f7"
						stroke-width="1.2" />
					<circle
						cx="29.5"
						cy="21.5"
						r="2"
						fill="none"
						stroke="#4fc3f7"
						stroke-width="1.2" />
					<circle cx="18" cy="29" r="1" />
					<circle cx="21" cy="28" r="1" />
					<circle cx="24" cy="29" r="1" />
					<circle cx="27" cy="28" r="1" />
					<circle cx="30" cy="29" r="1" />
				</template>
				<template v-else>
					<circle cx="18.5" cy="21.5" r="1.8" />
					<circle cx="29.5" cy="21.5" r="1.8" />
					<circle cx="19" cy="28.5" r="1" />
					<circle cx="22" cy="28.5" r="1" />
					<circle cx="25" cy="28.5" r="1" />
					<circle cx="28" cy="28.5" r="1" />
				</template>
			</g>
			<rect
				x="17"
				y="38"
				width="14"
				height="6"
				rx="2"
				fill="#8a969f" />
		</g>
	</svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
	/** professor | captain | superposa | q7 */
	persona: { type: String, required: true },
	/** calm | happy | worried */
	expression: { type: String, default: 'calm' },
	/** Size in px */
	size: { type: Number, default: 32 },
})

const BACKGROUNDS = { professor: '#e8f1d8', captain: '#d8e8f5', superposa: '#efe2f8', q7: '#e3e8ec' }
const bg = computed(() => BACKGROUNDS[props.persona] ?? '#e3e8ec')
</script>

<style scoped>
.qc-persona-avatar {
	display: block;
	flex: none;
	border-radius: 50%;
}
</style>
