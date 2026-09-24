/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The presentation layer of the rules engine: helpers that turn engine data into what the UI shows (sentences that
 * explain a roll or a result, piece and color names, probability text, identity colors, split targets, the
 * possibilities view). JavaScript only and non-normative: never parity-tested, and never used by the rules, the
 * computer player or the server.
 *
 * These modules live inside the engine package because some build on engine internals (the world analysis and move
 * resolution) that the public API deliberately does not expose. They are the only engine modules that may import
 * `@nextcloud/l10n`; the rest of the engine is locale-free, and a test checks both rules.
 */

export { describePosition } from './describePosition.js'
export { diffViews } from './diffViews.js'
export { explainOutcome } from './explainOutcome.js'
export { formatPercentNumber, formatProbability } from './format.js'
export { identityColors } from './identityColors.js'
export { memoByHash } from './memo.js'
export { colorOfId, figurine, pieceName, pieceTypeName, TEXT } from './pieces.js'
export { kingCaptureThreat, possibilities } from './possibilities.js'
export { outcomeLabel, reasonText, resolutionLabel, resolutionText, rollLabels } from './reasons.js'
export { joinOr, moveSentence, resultSentence } from './resultSentence.js'
export { splitTargets } from './splitTargets.js'
