/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What the layers of one QuantumBoard share: the board's geometry, the prefix of its SVG ids and its animator.
 * QuantumBoard provides it; the layer components in `components/layers/` inject it.
 */

import { inject, provide } from 'vue'

const KEY = Symbol('quantumchess-board')

/**
 * @typedef {object} BoardContext
 * @property {string} uid prefix of the SVG ids (patterns, gradients) of this board, unique on the page
 * @property {import('vue').ComputedRef<import('./useBoardGeometry.js').BoardGeometry>} geo the board's geometry
 * @property {object} anim the board's animator (`createAnimator()`)
 */

/**
 * Provide the context to the board's layers.
 *
 * @param {BoardContext} context the context
 * @return {BoardContext}
 */
export function provideBoardContext(context) {
	provide(KEY, context)
	return context
}

/**
 * The context of the enclosing QuantumBoard.
 *
 * @return {BoardContext}
 */
export function useBoardContext() {
	const context = inject(KEY, null)
	if (context === null) {
		throw new Error('A board layer must be rendered inside QuantumBoard')
	}
	return context
}
