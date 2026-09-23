/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * JS-only, non-normative UI helpers (SPEC §3.3, GAME-DESIGN §12.1). Never parity-tested and never used by the rules,
 * the AI search or the server. Owner: frontend-board.
 */

export { describePosition } from './describePosition.js'
export { diffViews } from './diffViews.js'
export { explainOutcome, MISS_CAUSES } from './explainOutcome.js'
export { dyadicFraction, formatPercentNumber, formatProbability, uiLocale } from './format.js'
export { IDENTITY_COLOURS, identityColours } from './identityColours.js'
export { memoByHash } from './memo.js'
export { capitalise, colorName, colorOfId, figurine, FIGURINES, pieceName, pieceTypeName, sentenceCase, TEXT } from './pieces.js'
export { boardView, kingCaptureThreat, possibilities } from './possibilities.js'
export { outcomeLabel, reasonText, resolutionLabel, resolutionText, rollLabels } from './reasons.js'
export { joinOr, moveSentence, resultSentence } from './resultSentence.js'
export { splitTargets } from './splitTargets.js'
