/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Synchronous entry points of the built-in engine, for Node tools (the trainer validator and puzzle builder), tests
 * and the worker. The UI uses the promise API of `client.js`, which runs the same code in a Web Worker.
 */

export { ENGINE_VERSION, LEAF_K, levelOf, LEVELS, PIECE_VALUES, STRENGTHS } from './levels.js'
export { evaluate, materialOf, pieceThreats, staticE, toCp, toE } from './evaluate.js'
export { search, Searcher } from './search.js'
export { solve, SOLVER_GOALS } from './solver.js'
export { bestMove } from './bestmove.js'
export { candidates } from './candidates.js'
export { analyze, analyzeGame, evaluateMove } from './analyze.js'
export { BENCH_KEY, benchmark } from './benchmark.js'
