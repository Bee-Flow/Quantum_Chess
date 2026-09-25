/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * One variant game on this device: loading and saving the record, the move modes (Move, Split, Merge, Measure, drops),
 * the confirmation of moves that roll, promotions, the computer's turns, undo, and the hand-over curtain of the
 * hidden-information variants in pass & play.
 */

import { computed, markRaw, ref, shallowRef } from 'vue'
import {
	applyMove,
	applyOutcome,
	chooseMove,
	legalMoves,
	loadVariant,
	mergesFrom,
	outcomes,
	parseCode,
	pieceLocations,
	royalDanger,
	splitCode,
	splitTargets,
} from '../../variants/index.js'
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
	const flipped = ref(false)
	let controller = null

	const players = computed(() => record.value?.players ?? [])
	const humanSides = computed(() => players.value.map((p, i) => (p.kind === 'human' ? i : -1)).filter((i) => i >= 0))
	const isHumanTurn = computed(() => Boolean(state.value && !state.value.result
		&& players.value[state.value.turn]?.kind === 'human'))

	/** The side whose view is shown: the only human, or in pass & play the side to move. */
	const viewer = computed(() => {
		if (!state.value) {
			return 0
		}
		if (humanSides.value.length === 1) {
			return humanSides.value[0]
		}
		if (humanSides.value.length === 0) {
			return 0
		}
		return V.value?.hidden || record.value?.autoFlip ? state.value.turn : humanSides.value[0]
	})

	const rotation = computed(() => {
		if (!V.value) {
			return 0
		}
		const s = V.value.sides[viewer.value]
		const base = s.rotate ?? (viewer.value === 0 ? 0 : 180)
		return (base + (flipped.value ? 180 : 0)) % 360
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

	/** Clear the selection and every half-made move. */
	function clearSelection() {
		sel.value = []
		dropType.value = null
		promoChoices.value = null
	}

	/**
	 * Save the record with a new state.
	 *
	 * @param {object} next new state
	 * @param {Array<{code: string, i: number}>} movesList the move list that produces it
	 */
	function commit(next, movesList) {
		const rec = { ...record.value, moves: movesList, current: next }
		saveVariantGame(rec)
		record.value = rec
		state.value = next
	}

	/**
	 * Play a move (legal) and continue with the next turn.
	 *
	 * @param {string} code move code
	 */
	function play(code) {
		// the roll memo: the same move at the same ply gets the same roll, so undo never rerolls a result already seen
		const memoKey = state.value.ply + ':' + code
		const rolls = { ...(record.value.rolls ?? {}) }
		rolls[memoKey] ??= Math.random()
		record.value = { ...record.value, rolls }
		const res = applyMove(V.value, state.value, code, rolls[memoKey])
		if (!res) {
			return
		}
		const index = res.outcomes.indexOf(res.branch)
		lastRoll.value = res.outcomes.length > 1 || res.branch.rolled
			? {
					code,
					side: state.value.turn,
					key: res.branch.key,
					notes: res.branch.notes,
					p: res.branch.weight / 16777216,
				}
			: null
		pending.value = null
		notice.value = null
		clearSelection()
		commit(res.state, [...record.value.moves, { code, i: index }])
		afterChange()
	}

	/**
	 * Try a move: illegal moves get a notice (the umpire's "no" in Kriegspiel), rolled moves wait for confirmation.
	 *
	 * @param {string} code move code
	 */
	function attempt(code) {
		const outs = outcomes(V.value, state.value, code)
		clearSelection()
		if (!outs) {
			notice.value = { kind: 'illegal', code }
			return
		}
		if (outs.length > 1) {
			pending.value = { code, outcomes: outs }
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
		if (!isHumanTurn.value || curtain.value || pending.value || thinking.value) {
			return
		}
		notice.value = null
		const Vv = V.value
		const s = state.value
		if (mode.value === 'measure') {
			const code = '?' + Vv.topology.names[sq]
			if (legalMoves(Vv, s).some((m) => m.type === 'measure' && pieceAt(m.from[0]) === pieceAt(sq))) {
				attempt(code)
			} else {
				notice.value = { kind: 'noMeasure' }
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
			return
		}
		if (matches.length > 1) {
			promoChoices.value = matches
			return
		}
		attempt(matches[0].code)
	}

	/**
	 * The id of the side to move's piece on a square in the first world where one stands there.
	 *
	 * @param {number} sq square
	 * @return {number}
	 */
	function pieceAt(sq) {
		for (const { b } of state.value.worlds) {
			if (b.board[sq] >= 0) {
				return b.board[sq]
			}
		}
		return -1
	}

	/**
	 * A click in Split mode: the piece, then two targets.
	 *
	 * @param {number} sq square
	 */
	function clickSplit(sq) {
		const [f, t1] = sel.value
		if (f === undefined) {
			if (splitTargets(V.value, state.value, sq).length >= 2) {
				sel.value = [sq]
			} else {
				notice.value = { kind: 'noSplit' }
			}
			return
		}
		const targets = splitTargets(V.value, state.value, f)
		if (sq === f || !targets.includes(sq)) {
			clearSelection()
			return
		}
		if (t1 === undefined) {
			sel.value = [f, sq]
			return
		}
		if (sq === t1) {
			sel.value = [f]
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
			if (mergesFrom(V.value, state.value, sq).length) {
				sel.value = [sq]
			} else {
				notice.value = { kind: 'noMerge' }
			}
			return
		}
		const list = mergesFrom(V.value, state.value, f1)
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
		if (!isHumanTurn.value) {
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
		const last = state.value.history[state.value.history.length - 1]
		if (last && !(V.value.hidden && last.side !== viewer.value)) {
			const mv = parseCode(V.value, last.code)
			const sample = mv?.type === 'move'
				? legalFromHistory(last.code)
				: mv
			for (const s of [...(sample?.from ?? []), ...(sample?.to ?? [])]) {
				add(s, 'last')
			}
		}
		for (const s of sel.value) {
			add(s, sel.value[0] === s ? 'selected' : 'pick')
		}
		if (sel.value.length && mode.value !== 'split') {
			const id = pieceAt(sel.value[0])
			if (id >= 0) {
				for (const l of pieceLocations(state.value, id)) {
					if (l.sq >= 0 && !sel.value.includes(l.sq)) {
						add(l.sq, 'part')
					}
				}
			}
		}
		if (!isHumanTurn.value) {
			return out
		}
		if (dropType.value) {
			for (const m of moves.value) {
				if (m.drop === dropType.value) {
					add(m.to, 'target')
				}
			}
		} else if (mode.value === 'move' && sel.value.length) {
			for (const m of moves.value) {
				if (m.from === sel.value[0]) {
					add(m.to, 'target')
				}
			}
		} else if (mode.value === 'split' && sel.value.length) {
			for (const t of splitTargets(V.value, state.value, sel.value[0])) {
				if (!sel.value.includes(t)) {
					add(t, 'target')
				}
			}
		} else if (mode.value === 'merge' && sel.value.length) {
			const list = mergesFrom(V.value, state.value, sel.value[0])
			if (sel.value.length === 1) {
				for (const m of list) {
					for (const f of m.from) {
						if (f !== sel.value[0]) {
							add(f, 'target')
						}
					}
				}
			} else {
				for (const m of list) {
					if (m.from.includes(sel.value[1])) {
						add(m.to[0], 'target')
					}
				}
			}
		}
		return out
	})

	/**
	 * From and to squares of an ordinary move code, as far as the code tells them.
	 *
	 * @param {string} code move code
	 * @return {{from: number[], to: number[]}|null}
	 */
	function legalFromHistory(code) {
		const topo = V.value.topology
		const at = code.indexOf('@')
		if (at >= 0) {
			return { from: [], to: [topo.byName(code.slice(at + 1))] }
		}
		const [a, b] = code.split('=')[0].split('-')
		if (b === undefined) {
			return null
		}
		return { from: [topo.byName(a)], to: [topo.byName(b)] }
	}

	const danger = computed(() => {
		if (!V.value || !state.value || state.value.result) {
			return 0
		}
		return royalDanger(V.value, state.value, viewer.value)
	})

	/** Continue after a move: the hand-over curtain, the computer's turn. */
	function afterChange() {
		const s = state.value
		if (!s || s.result) {
			return
		}
		const p = players.value[s.turn]
		if (p?.kind === 'computer') {
			runComputer()
		} else if (V.value.hidden && humanSides.value.length > 1) {
			curtain.value = true
		}
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

	/** Take back the last move of the human (and the computer's answers after it). */
	function undo() {
		if (!record.value?.moves.length || thinking.value) {
			return
		}
		const list = record.value.moves.slice()
		list.pop()
		let s = replay(list)
		while (list.length && players.value[s.turn]?.kind === 'computer') {
			list.pop()
			s = replay(list)
		}
		lastRoll.value = null
		pending.value = null
		notice.value = null
		clearSelection()
		commit(s, list)
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
		if (!s || s.result) {
			return
		}
		const loser = humanSides.value.length === 1 ? humanSides.value[0] : s.turn
		const Vv = V.value
		const winners = Vv.sides.map((x, i) => i).filter((i) => Vv.enemies(loser, i))
		const result = winners.length === 1
			? { winner: winners[0], reason: 'resign' }
			: { winner: null, winners, reason: 'resign' }
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
		flipped,
		players,
		humanSides,
		isHumanTurn,
		viewer,
		rotation,
		hidden,
		moves,
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
		clearSelection,
	}
}
