/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * One variant game on this device: loading and saving the record, the move modes (Move, Split, Merge, Measure, drops),
 * the confirmation of moves that roll, promotions, the computer's turns, undo, and the hand-over of the
 * hidden-information variants in pass & play (first "Your move" with the mover's view, then the curtain).
 *
 * Hidden information: the Split, Merge and Measure modes choose their squares on `V.ownView(state, viewer)` when the
 * variant has one (the board as the player knows it), but every attempt is decided on the real state. With
 * `V.umpire` an attempt is binding (no odds preview) and the results show no odds. While a hidden game runs there is
 * no undo and no danger line, and the odds preview does not say which outcome ends the game (it depends on hidden
 * pieces).
 *
 * Split is not offered while the budget of the side to move is full (docs/rules.md 7.1), nor Split and Measure while a
 * capture is compulsory; in hidden pass & play the mode follows the next player's budget only once the device is
 * passed, so the mover never learns it. Rolls are remembered under `rollMemoKey` (rolls.js), so undo never rerolls a
 * result.
 *
 * The board takes input and shows the selection and the move targets only while it is `interactive` (marks.js
 * `boardInteractive`): a human to move, no hand-over step, no curtain, and in a hidden game the viewer to move. A
 * target on a square the viewer cannot see is shown only when it comes from what the viewer knows
 * (`blindTargetAllowed`).
 *
 * Optional variant hooks read here: `moveWarning(state, code)` (a text: the move waits for confirmation with it, also a
 * certain move), `lastMoveMarks(state)` (the squares marked as the last move, instead of the last record's squares;
 * not in hidden variants), `turnMarks(state)` (the squares of the turn in progress, marked `turn`), `refusalText`
 * (whether a tap on an own piece without moves gets the notice `noMove`) and the declaration flag `flipBoard: false`
 * (the board is never turned by "Flip board", and in pass & play the view is always the side to move's, as with
 * "Turn the board to the player to move"). Split mode marks only second targets that make a legal split with the
 * first, Measure checks the tapped part itself (a variant may forbid some parts, `allowQuantum`); a refused tap on a
 * part of an own ghost says that the square is the reason (`measureHere`, `mergeHere`), a Split on an enemy piece
 * `notYours`. After a split, merge or measurement the mode goes back to Move when the same side moves again (a turn of
 * several moves). Undo takes back the human's last move and the computer's moves after it with one replay.
 * `saveFailed` tells when the browser storage refused the record.
 *
 * The danger line (`danger`) speaks for `dangerSide`: in pass & play (every side human, not hidden) the side to move,
 * whose turn it is on the device, otherwise the viewer.
 *
 * A move waiting for confirmation (`pending`: a roll or the variant's warning) keeps its squares marked (the from
 * square selected, the targets as targets) and carries the type of the piece that moves and whether it captures (not
 * in a hidden game), so the view can name it. Every move played keeps the type of its piece in the saved move list
 * (`t`), for the move list's notation.
 */

import { computed, markRaw, ref, shallowRef } from 'vue'
import {
	applyMove,
	applyOutcome,
	budgetInfo,
	chooseMove,
	isLegal,
	legalMoves,
	loadVariant,
	mergesFrom,
	mustCapture,
	outcomes,
	pieceLocations,
	royalDanger,
	splitCode,
	splitTargets,
} from '../../variants/index.js'
import {
	blindTargetAllowed,
	boardInteractive,
	lastMoveMarks,
	moveSquares,
	sidePieceAt,
	sidePieceType,
	turnMoveMarks,
} from '../marks.js'
import { needsConfirmation, refusalKind, resignResult } from '../panel.js'
import { rollMemoKey } from '../rolls.js'
import { loadVariantGame, saveVariantGame } from '../variantGames.js'

/**
 * The moves a player may try: the variant's own candidates in Kriegspiel (the enemy pieces are unknown), otherwise
 * the legal moves.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {object[]}
 */
function candidateMoves(V, state) {
	return V.candidateMoves ? V.candidateMoves(state) : legalMoves(V, state).filter((m) => m.type === 'move')
}

/**
 * @param {string} id game id
 * @return {object} the game API
 */
export function useVariantGame(id) {
	const V = shallowRef(null)
	const record = shallowRef(null)
	const state = shallowRef(null)
	const missing = ref(false)
	const mode = ref('move')
	const sel = ref([])
	const dropType = ref(null)
	const promoChoices = ref(null)
	const pending = ref(null)
	const lastRoll = ref(null)
	const thinking = ref(false)
	const notice = ref(null)
	const curtain = ref(false)
	/** Step 1 of the hidden hand-over: `{ side, code, key }` of the move just played, shown with the mover's view. */
	const handover = ref(null)
	/** The codes the umpire refused since the turn began (Kriegspiel); not saved. */
	const refused = ref([])
	const flipped = ref(false)
	/** Whether the last save of the record failed (the browser storage is full or blocked). */
	const saveFailed = ref(false)
	let controller = null

	const players = computed(() => record.value?.players ?? [])
	const humanSides = computed(() => players.value.map((p, i) => (p.kind === 'human' ? i : -1)).filter((i) => i >= 0))
	const isHumanTurn = computed(() => Boolean(state.value && !state.value.result
		&& players.value[state.value.turn]?.kind === 'human'))

	/**
	 * The side whose view is shown: the only human, or in pass & play the side to move (the mover until the device is
	 * passed, in hidden games; with "Turn the board to the player to move", or in a variant that is never turned), else
	 * the first human.
	 */
	const viewer = computed(() => {
		if (!state.value) {
			return 0
		}
		if (handover.value) {
			return handover.value.side
		}
		if (humanSides.value.length === 1) {
			return humanSides.value[0]
		}
		if (humanSides.value.length === 0) {
			return 0
		}
		const follows = V.value?.hidden || record.value?.autoFlip || V.value?.flipBoard === false
		return follows ? state.value.turn : humanSides.value[0]
	})

	/**
	 * The side the danger line speaks for: in pass & play (every side human) the side to move, which holds the device,
	 * otherwise the viewer.
	 */
	const dangerSide = computed(() => {
		if (!state.value || !V.value) {
			return 0
		}
		const all = humanSides.value.length > 1 && humanSides.value.length === V.value.sides.length
		return all && !V.value.hidden ? state.value.turn : viewer.value
	})

	const rotation = computed(() => {
		if (!V.value) {
			return 0
		}
		const s = V.value.sides[viewer.value]
		const base = s.rotate ?? (viewer.value === 0 ? 0 : 180)
		// a variant that must not be turned (the multiverse: time runs to the right) ignores "Flip board"
		const flip = flipped.value && V.value.flipBoard !== false
		return (base + (flip ? 180 : 0)) % 360
	})

	const hidden = computed(() => {
		if (!V.value?.visibility || !state.value || state.value.result) {
			return null
		}
		const visible = V.value.visibility(state.value, viewer.value)
		const out = new Set()
		for (let sq = 0; sq < V.value.topology.size; sq++) {
			if (!visible.has(sq)) {
				out.add(sq)
			}
		}
		return out
	})

	const moves = computed(() => (V.value && state.value ? candidateMoves(V.value, state.value) : []))

	/**
	 * Whether the board takes the viewer's input and shows the viewer's targets and keyboard focus
	 * (`boardInteractive`): never during the hand-over, behind the curtain, on a computer's turn, or in a hidden game
	 * while another side is to move.
	 */
	const interactive = computed(() => boardInteractive(V.value, state.value, {
		humanTurn: isHumanTurn.value,
		handover: Boolean(handover.value),
		curtain: curtain.value,
		viewer: viewer.value,
	}))

	/** Whether a hidden-information game is running (no undo, no danger line, the other budgets unknown). */
	const secret = computed(() => Boolean(V.value?.hidden && state.value && !state.value.result))

	/**
	 * The state as the viewer knows it (`V.ownView`), computed once per state and viewer: it rebuilds every world, and
	 * the move tables are cached per state object. Without the hook, the real state.
	 */
	const own = computed(() => {
		if (!V.value || !state.value) {
			return null
		}
		return V.value.ownView && !state.value.result ? V.value.ownView(state.value, viewer.value) : state.value
	})

	/** Whether the side to move must capture (compulsory capture): Split and Measure are not allowed then. */
	const compulsory = computed(() => Boolean(V.value && state.value && mustCapture(V.value, state.value)))

	/**
	 * Whether the quantum budget of the side to move is full (`budgetInfo`, the variant's budget rule): a split always
	 * adds arrangements, so none is possible then.
	 */
	const budgetFull = computed(() => {
		if (!V.value || !state.value || state.value.result) {
			return false
		}
		const info = budgetInfo(V.value, state.value, state.value.turn)
		return info.used >= info.limit
	})

	/**
	 * Whether a move mode is closed now: Split with a full budget or a compulsory capture, Measure with a compulsory
	 * capture.
	 *
	 * @param {string} m move, split, merge or measure
	 * @return {boolean}
	 */
	function blocked(m) {
		return (m === 'split' && (budgetFull.value || compulsory.value)) || (m === 'measure' && compulsory.value)
	}

	/** Go back to Move mode when the current mode is closed in the new position. */
	function leaveBlockedMode() {
		if (blocked(mode.value)) {
			mode.value = 'move'
			clearSelection()
		}
	}

	/**
	 * How many moves undo takes back: the computer's moves at the end of the move list and the human's move before
	 * them (read from the sides of the history records), or 0 when no human move is left to take back.
	 */
	const undoCount = computed(() => {
		const list = record.value?.moves ?? []
		const history = state.value?.history ?? []
		const sideOf = (i) => (history.length === list.length ? history[i].side : null)
		let k = 0
		while (k < list.length && players.value[sideOf(list.length - 1 - k)]?.kind === 'computer') {
			k++
		}
		return k < list.length ? k + 1 : 0
	})

	const canUndo = computed(() => Boolean(undoCount.value && !thinking.value && !secret.value && !handover.value))

	/** Clear the selection and every half-made move. */
	function clearSelection() {
		sel.value = []
		dropType.value = null
		promoChoices.value = null
	}

	/**
	 * The type of the piece that a move of the side to move moves (its first from square, on the real state), or null
	 * for a code without one (a drop, whose type is in the code, or a code that names no square).
	 *
	 * @param {string} code move code
	 * @return {string|null}
	 */
	function movedType(code) {
		const { from } = moveSquares(V.value, code, moves.value)
		return from.length ? sidePieceType(state.value, from[0], state.value.turn) : null
	}

	/**
	 * Save the record with a new state.
	 *
	 * @param {object} next new state
	 * @param {Array<{code: string, i: number, t?: string}>} movesList the move list that produces it
	 */
	function commit(next, movesList) {
		const rec = { ...record.value, moves: movesList, current: next }
		saveFailed.value = saveVariantGame(rec) === false
		record.value = rec
		state.value = next
	}

	/**
	 * Play a move (legal) and continue with the next turn.
	 *
	 * @param {string} code move code
	 */
	function play(code) {
		// the roll memo: the same move in the same position gets the same roll (whatever it promotes to), so undo never
		// rerolls a result already seen
		const memoKey = rollMemoKey(state.value, code)
		const rolls = { ...(record.value.rolls ?? {}) }
		rolls[memoKey] ??= Math.random()
		record.value = { ...record.value, rolls }
		const res = applyMove(V.value, state.value, code, rolls[memoKey])
		if (!res) {
			return
		}
		const index = res.outcomes.indexOf(res.branch)
		const mover = state.value.turn
		const quantum = code.includes('|') || code.startsWith('?')
		// the type of the piece that moved, for the move list (the states before the moves are not kept)
		const type = movedType(code)
		// with an umpire every own move gets the same result box: whether it rolled is hidden information
		lastRoll.value = res.outcomes.length > 1 || res.branch.rolled || V.value.umpire
			? {
					code,
					side: mover,
					key: res.branch.key,
					notes: res.branch.notes,
					p: res.branch.weight / 16777216,
					rolled: res.branch.rolled,
					result: res.state.result,
				}
			: null
		pending.value = null
		notice.value = null
		refused.value = []
		clearSelection()
		// a turn of several moves: the next board is played with an ordinary move far more often than not
		if (quantum && res.state.turn === mover && !res.state.result) {
			mode.value = 'move'
		}
		commit(res.state, [...record.value.moves, type ? { code, i: index, t: type } : { code, i: index }])
		afterChange({ side: mover, code, key: res.branch.key })
	}

	/**
	 * An outcome of the preview without its game result.
	 *
	 * @param {object} o outcome (`outcomes`)
	 * @return {object}
	 */
	function withoutResult(o) {
		const out = { ...o }
		delete out.result
		return out
	}

	/**
	 * The variant's warning for a legal move (`moveWarning(state, code)`, the multiverse's stranded turn), or null.
	 *
	 * @param {string} code move code
	 * @return {string|null}
	 */
	function warningOf(code) {
		const text = V.value.moveWarning ? V.value.moveWarning(state.value, code) : null
		return typeof text === 'string' && text ? text : null
	}

	/**
	 * Try a move on the real state: a refused attempt gets a notice (the umpire's "no" when the player could not know
	 * it), a move that rolls waits for confirmation, except with an umpire, where an attempt is binding. A move the
	 * variant warns about (`moveWarning`) waits for confirmation with the warning, even a certain move; with an umpire
	 * it shows no odds. In a hidden game the pending outcomes carry no `result`: whether an outcome ends the game
	 * depends on the whole real state (a quiet draw waits while a hidden enemy piece can capture the mover's king for
	 * certain, and the quiet counter counts the enemy's moves in the fog), which the player must not learn before
	 * committing to the move.
	 *
	 * @param {string} code move code
	 */
	function attempt(code) {
		const outs = outcomes(V.value, state.value, code)
		clearSelection()
		if (!outs) {
			const kind = refusalKind(V.value, own.value, code)
			notice.value = { kind, code }
			if (V.value.umpire && !refused.value.includes(code)) {
				refused.value = [...refused.value, code]
			}
			return
		}
		const warning = warningOf(code)
		const rolls = needsConfirmation(V.value, outs)
		if (rolls || warning) {
			const shown = V.value.umpire ? [] : secret.value ? outs.map(withoutResult) : outs
			// whether the move might capture is hidden information while a hidden game runs
			const capture = !secret.value && outs.some((o) => o.key === 'capture')
			pending.value = { code, outcomes: rolls ? shown : [], warning, type: movedType(code), capture }
			return
		}
		play(code)
	}

	/** Play the pending move. */
	function confirm() {
		if (pending.value) {
			play(pending.value.code)
		}
	}

	/** Drop the pending move. */
	function cancel() {
		pending.value = null
		clearSelection()
	}

	/**
	 * A square was clicked or chosen with the keyboard.
	 *
	 * @param {number} sq square
	 */
	function click(sq) {
		if (!interactive.value || pending.value || thinking.value) {
			return
		}
		notice.value = null
		const Vv = V.value
		if (mode.value === 'measure') {
			// the tapped part itself: a variant may allow a measurement from some parts only (`allowQuantum`)
			const code = '?' + Vv.topology.names[sq]
			if (pieceAt(sq) >= 0 && isLegal(Vv, own.value, code)) {
				attempt(code)
			} else {
				notice.value = { kind: ghostPart(sq) ? 'measureHere' : 'noMeasure' }
			}
			return
		}
		if (mode.value === 'split') {
			clickSplit(sq)
			return
		}
		if (mode.value === 'merge') {
			clickMerge(sq)
			return
		}
		if (dropType.value) {
			const m = moves.value.find((x) => x.drop === dropType.value && x.to === sq)
			if (m) {
				attempt(m.code)
			} else {
				clearSelection()
			}
			return
		}
		if (!sel.value.length) {
			if (moves.value.some((m) => m.from === sq)) {
				sel.value = [sq]
			} else {
				stuckNotice(sq)
			}
			return
		}
		const f = sel.value[0]
		if (sq === f) {
			clearSelection()
			return
		}
		const matches = moves.value.filter((m) => m.from === f && m.to === sq)
		if (!matches.length) {
			sel.value = moves.value.some((m) => m.from === sq) ? [sq] : []
			if (!sel.value.length) {
				stuckNotice(sq)
			}
			return
		}
		if (matches.length > 1) {
			promoChoices.value = matches
			return
		}
		attempt(matches[0].code)
	}

	/**
	 * A tap on an own piece that has no move: the variant's notice `noMove` when it has one (the multiverse: the piece
	 * stands on a board that cannot be played now); other variants say nothing, as before.
	 *
	 * @param {number} sq square
	 */
	function stuckNotice(sq) {
		if (pieceAt(sq) >= 0 && V.value.refusalText?.(state.value, 'noMove', sq)) {
			notice.value = { kind: 'noMove', sq }
		}
	}

	/**
	 * Whether a square holds a part of a ghost of the side to move (a piece that stands on more than one square).
	 *
	 * @param {number} sq square
	 * @return {boolean}
	 */
	function ghostPart(sq) {
		const id = pieceAt(sq)
		return id >= 0 && pieceLocations(own.value, id).filter((l) => l.sq >= 0).length > 1
	}

	/**
	 * Whether a square holds a piece of another side (on the own view).
	 *
	 * @param {number} sq square
	 * @return {boolean}
	 */
	function enemyAt(sq) {
		return own.value.worlds.some(({ b }) => b.board[sq] >= 0 && b.sd[b.board[sq]] !== state.value.turn)
	}

	/**
	 * The id of the side to move's piece on a square in the first world where one stands there (on the own view), or
	 * -1. Enemy pieces are never returned, so a selection cannot mark the parts of an enemy ghost.
	 *
	 * @param {number} sq square
	 * @return {number}
	 */
	function pieceAt(sq) {
		return sidePieceAt(own.value, sq, state.value.turn)
	}

	/**
	 * The squares a split may go to next: every split target of the piece on `f`, or after the first target `t1` only
	 * the targets that make a legal split with it (on the own view; a variant may forbid some pairs, the multiverse
	 * splits within one board).
	 *
	 * @param {number} f the piece's square
	 * @param {number} [t1] the first target
	 * @return {number[]}
	 */
	function splitChoices(f, t1) {
		const targets = splitTargets(V.value, own.value, f)
		if (t1 === undefined) {
			return targets
		}
		return targets.filter((t) => t !== t1 && isLegal(V.value, own.value, splitCode(V.value, f, t1, t)))
	}

	/**
	 * A click in Split mode: the piece, then two targets.
	 *
	 * @param {number} sq square
	 */
	function clickSplit(sq) {
		if (blocked('split')) {
			clearSelection()
			return
		}
		const [f, t1] = sel.value
		if (f === undefined) {
			if (splitTargets(V.value, own.value, sq).length >= 2) {
				sel.value = [sq]
			} else {
				notice.value = { kind: pieceAt(sq) < 0 && enemyAt(sq) ? 'notYours' : 'noSplit' }
			}
			return
		}
		if (t1 !== undefined && sq === t1) {
			sel.value = [f]
			return
		}
		if (sq === f || !splitChoices(f, t1).includes(sq)) {
			clearSelection()
			return
		}
		if (t1 === undefined) {
			sel.value = [f, sq]
			return
		}
		attempt(splitCode(V.value, f, t1, sq))
	}

	/**
	 * A click in Merge mode: two parts of one piece, then the target.
	 *
	 * @param {number} sq square
	 */
	function clickMerge(sq) {
		const [f1, f2] = sel.value
		if (f1 === undefined) {
			if (mergesFrom(V.value, own.value, sq).length) {
				sel.value = [sq]
			} else {
				notice.value = { kind: ghostPart(sq) ? 'mergeHere' : 'noMerge' }
			}
			return
		}
		const list = mergesFrom(V.value, own.value, f1)
		if (f2 === undefined) {
			if (list.some((m) => m.from.includes(sq) && sq !== f1)) {
				sel.value = [f1, sq]
			} else {
				clearSelection()
			}
			return
		}
		const m = list.find((x) => x.from.includes(f2) && x.to[0] === sq)
		if (m) {
			attempt(m.code)
		} else {
			clearSelection()
		}
	}

	/**
	 * Choose a piece from the hand to drop.
	 *
	 * @param {string} type piece type
	 */
	function chooseDrop(type) {
		if (!interactive.value) {
			return
		}
		mode.value = 'move'
		sel.value = []
		dropType.value = dropType.value === type ? null : type
	}

	/**
	 * Change the move mode.
	 *
	 * @param {string} m move, split, merge or measure
	 */
	function setMode(m) {
		if (blocked(m)) {
			return
		}
		mode.value = m
		clearSelection()
		notice.value = null
	}

	const marks = computed(() => {
		const out = {}
		const add = (sq, m) => {
			if (sq >= 0) {
				(out[sq] ??= []).push(m)
			}
		}
		if (!V.value || !state.value) {
			return out
		}
		for (const s of lastMoveMarks(V.value, state.value, viewer.value)) {
			add(s, 'last')
		}
		for (const s of turnMoveMarks(V.value, state.value)) {
			add(s, 'turn')
		}
		// the selection and the targets belong to the viewer's own turn only
		if (!interactive.value) {
			return out
		}
		// a move waiting for confirmation keeps its squares marked: the player sees what the box is about
		if (pending.value) {
			const { from, to } = moveSquares(V.value, pending.value.code, moves.value)
			from.forEach((s, i) => add(s, i === 0 ? 'selected' : 'pick'))
			for (const s of to) {
				add(s, 'target')
			}
			return out
		}
		const blind = hidden.value
		/**
		 * Mark a move target, unless the viewer cannot see its square and the target comes from the real state.
		 *
		 * @param {number} sq square
		 * @param {'move'|'drop'|'split'|'merge'} source where the target comes from
		 */
		const target = (sq, source) => {
			if (!blind?.has(sq) || blindTargetAllowed(V.value, source)) {
				add(sq, 'target')
			}
		}
		for (const s of sel.value) {
			add(s, sel.value[0] === s ? 'selected' : 'pick')
		}
		if (sel.value.length && mode.value !== 'split') {
			const id = pieceAt(sel.value[0])
			if (id >= 0) {
				for (const l of pieceLocations(own.value, id)) {
					if (l.sq >= 0 && !sel.value.includes(l.sq)) {
						add(l.sq, 'part')
					}
				}
			}
		}
		if (dropType.value) {
			for (const m of moves.value) {
				if (m.drop === dropType.value) {
					target(m.to, 'drop')
				}
			}
		} else if (mode.value === 'move' && sel.value.length) {
			for (const m of moves.value) {
				if (m.from === sel.value[0]) {
					target(m.to, 'move')
				}
			}
		} else if (mode.value === 'split' && sel.value.length && !blocked('split')) {
			for (const t of splitChoices(sel.value[0], sel.value[1])) {
				if (!sel.value.includes(t)) {
					target(t, 'split')
				}
			}
		} else if (mode.value === 'merge' && sel.value.length) {
			const list = mergesFrom(V.value, own.value, sel.value[0])
			if (sel.value.length === 1) {
				for (const m of list) {
					for (const f of m.from) {
						if (f !== sel.value[0]) {
							target(f, 'merge')
						}
					}
				}
			} else {
				for (const m of list) {
					if (m.from.includes(sel.value[1])) {
						target(m.to[0], 'merge')
					}
				}
			}
		}
		return out
	})

	/**
	 * The chance that a king of `dangerSide` can be taken (the side to move in pass & play, else the viewer); never
	 * computed while a hidden game runs (it would leak).
	 */
	const danger = computed(() => {
		if (!V.value || !state.value || state.value.result || secret.value) {
			return 0
		}
		return royalDanger(V.value, state.value, dangerSide.value)
	})

	/**
	 * Continue after a move: the hand-over of hidden pass & play (first the mover's "Your move" box, then the
	 * curtain), or the computer's turn.
	 *
	 * @param {object} [played] the move just played by a player: `{ side, code, key }`
	 */
	function afterChange(played = null) {
		const s = state.value
		if (!s || s.result) {
			return
		}
		const p = players.value[s.turn]
		if (p?.kind === 'computer') {
			// the computer's full budget keeps a player's Split mode
			runComputer()
		} else if (V.value.hidden && humanSides.value.length > 1) {
			if (played && players.value[played.side]?.kind === 'human') {
				// the mover still looks at the panel: the mode follows the next player's budget only behind the curtain
				handover.value = played
			} else {
				curtain.value = true
				leaveBlockedMode()
			}
		} else {
			// the player to move finds a usable mode
			leaveBlockedMode()
		}
	}

	/**
	 * Step 2 of the hidden hand-over: the mover passes the device, the curtain covers the board, and the next player
	 * finds a usable mode behind it.
	 */
	function passDevice() {
		handover.value = null
		refused.value = []
		lastRoll.value = null
		curtain.value = true
		leaveBlockedMode()
	}

	/** Let the computer play the side to move. */
	async function runComputer() {
		const s = state.value
		const p = players.value[s.turn]
		controller?.abort()
		controller = new AbortController()
		const signal = controller.signal
		thinking.value = true
		try {
			await new Promise((resolve) => setTimeout(resolve, 250))
			const code = await chooseMove(V.value, s, { level: p.level ?? 'normal', signal })
			if (!signal.aborted && state.value === s && code) {
				play(code)
			}
		} finally {
			if (!signal.aborted) {
				thinking.value = false
			}
		}
	}

	/**
	 * Take back the last move of the human and the computer's moves after it (a turn of several moves in the
	 * multiverse), with one replay.
	 */
	function undo() {
		if (!canUndo.value) {
			return
		}
		const list = record.value.moves.slice(0, record.value.moves.length - undoCount.value)
		let s = replay(list)
		// a record whose history does not match its moves: take back one move at a time until a human is to move
		while (list.length && players.value[s.turn]?.kind === 'computer') {
			list.pop()
			s = replay(list)
		}
		lastRoll.value = null
		pending.value = null
		notice.value = null
		clearSelection()
		commit(s, list)
		leaveBlockedMode()
	}

	/**
	 * Replay a move list from the start state.
	 *
	 * @param {Array<{code: string, i: number}>} list moves
	 * @return {object}
	 */
	function replay(list) {
		let s = record.value.initial
		for (const m of list) {
			s = applyOutcome(V.value, s, m.code, m.i) ?? s
		}
		return s
	}

	/** Resign for the side to move (or the only human). */
	function resign() {
		const s = state.value
		if (!s || s.result || handover.value || curtain.value) {
			return
		}
		const loser = humanSides.value.length === 1 ? humanSides.value[0] : s.turn
		const result = resignResult(V.value, s, loser)
		controller?.abort()
		thinking.value = false
		commit({ ...s, result }, record.value.moves)
	}

	/** Load the game. */
	async function load() {
		const rec = loadVariantGame(id)
		if (!rec) {
			missing.value = true
			return
		}
		V.value = markRaw(await loadVariant(rec.variant))
		record.value = rec
		state.value = rec.current
		afterChange()
	}

	/** Stop the computer (when leaving the page). */
	function stop() {
		controller?.abort()
	}

	return {
		V,
		record,
		state,
		missing,
		mode,
		sel,
		dropType,
		promoChoices,
		pending,
		lastRoll,
		thinking,
		notice,
		curtain,
		handover,
		refused,
		flipped,
		saveFailed,
		players,
		humanSides,
		isHumanTurn,
		interactive,
		viewer,
		dangerSide,
		rotation,
		hidden,
		moves,
		own,
		secret,
		compulsory,
		budgetFull,
		canUndo,
		marks,
		danger,
		load,
		stop,
		click,
		attempt,
		confirm,
		cancel,
		setMode,
		chooseDrop,
		undo,
		resign,
		passDevice,
		clearSelection,
	}
}
