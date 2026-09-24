/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How the board is drawn: piece sprites and their classes, badges, arrows, the outcome ring, the grid cells and the
 * placement of the floating card and tooltip.
 */

import { describe, expect, it } from 'vitest'
import { kingRings, pieceItems, viewsOf } from '../../../src/board/boardModel.js'
import {
	arrowShape,
	badgeList,
	boardCell,
	cardPlacement,
	cornerTriangles,
	partThreads,
	pieceSprites,
	RING_C,
	rollRing,
	tooltipPlacement,
} from '../../../src/board/boardScene.js'
import { squareCenter, squareXY } from '../../../src/board/geometry.js'
import { E, S, sq } from './helpers.js'

/**
 * The geometry of a board with 50 px squares.
 *
 * @param {'w'|'b'} [orientation] side at the bottom
 * @return {object}
 */
function geometry(orientation = 'w') {
	return {
		S: 50,
		orientation,
		center: (square) => squareCenter(square, orientation),
		pixelOf(square) {
			const { col, row } = squareXY(square, orientation)
			return { x: col * 50, y: row * 50 }
		},
	}
}

const PREFS = { showPercentages: true, ghostStyle: 'fade', pieceSet: 'cburnett', probabilityFormat: 'percent' }
const IDLE = { focus: null, drag: null, returning: null, shaking: null, hoverSquare: null, anim: { pops: [], sourceDim: null, crossfade: false }, prefs: PREFS }

describe('pieces and badges', () => {
	const ghost = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3'])

	it('places each piece on its square and draws a ring on ghost parts', () => {
		const pieces = pieceSprites(pieceItems(ghost), geometry(), IDLE)
		const f3 = pieces.find((p) => p.square === sq('f3'))
		expect(f3.style.transform).toBe('translate(250px, 250px)')
		expect(f3.symbol).toBe('qc-piece-cburnett-wN')
		expect(f3.ring).not.toBe('')
		expect(f3.opacity).toBeCloseTo(0.64)
		expect(f3.classes['qc-piece--ghost']).toBe(true)
		expect(pieces.find((p) => p.type === 'k').ring).toBe('')
	})

	it('lifts the hovered piece and follows a drag', () => {
		const items = pieceItems(E.initialState())
		const g1 = items.find((p) => p.square === sq('g1'))
		const pieces = pieceSprites(items, geometry(), { ...IDLE, hoverSquare: sq('g1'), drag: { key: g1.key, dragging: true, touch: false, x: 100, y: 100 } })
		const dragged = pieces.find((p) => p.key === g1.key)
		expect(dragged.classes['qc-piece--hover']).toBe(true)
		expect(dragged.style).toEqual({ transform: 'translate(75px, 75px) scale(1.1)', zIndex: 30 })
	})

	it('badges ghost parts and endangered kings', () => {
		const pieces = pieceSprites(pieceItems(ghost), geometry(), IDLE)
		const badges = badgeList(pieces, kingRings(ghost, ['w', 'b']), geometry(), PREFS)
		expect(badges.map((b) => b.text)).toEqual(['50%', '50%'])
		expect(badges[0].style.fontSize).toBe('10px')
		expect(badgeList(pieces, [], geometry(), { ...PREFS, showPercentages: false })).toEqual([])
	})

	it('draws a thread from the focused part to the other parts of its ghost', () => {
		const views = viewsOf(ghost)
		const threads = partThreads(views, { square: sq('f3'), piece: views.view[sq('f3')].piece }, geometry())
		expect(threads.outlines).toEqual([sq('h3')])
		expect(threads.paths).toHaveLength(1)
		expect(partThreads(viewsOf(ghost), null, geometry())).toEqual({ outlines: [], paths: [] })
	})
})

describe('shapes', () => {
	it('draws an arrow from square to square in board units', () => {
		const a = arrowShape({ from: sq('e2'), to: sq('e4') }, geometry())
		expect(a).toMatchObject({ kind: 'hint', dashed: false, x1: 4.5, x2: 4.5 })
		expect(a.y1).toBeCloseTo(6.32)
		expect(a.head.split(' ')).toHaveLength(3)
	})

	it('draws the four capture corners of a square', () => {
		expect(cornerTriangles(0.5, 0.5)[0]).toBe('0,0 0.24,0 0,0.24')
	})

	it('sizes the ring segments by weight and fills the settled one', () => {
		const ring = rollRing({ square: sq('e4'), settled: 'capture', segments: [{ key: 'miss', start: 0, length: 0.5 }, { key: 'capture', start: 0.5, length: 0.5 }] }, geometry())
		expect(ring.segments[1].style.strokeDasharray).toBe(`${RING_C} ${RING_C}`)
		expect(rollRing(null, geometry())).toBeNull()
	})
})

describe('grid and floating interface', () => {
	const scene = {
		state: E.initialState(),
		coordinates: 'inside',
		physicsNames: false,
		targets: new Map(),
		markers: new Map(),
		highlights: new Map([[sq('e4'), 'hint']]),
		whatIfItems: null,
		selection: sq('e2'),
		mergeSources: [],
		lastMove: [],
		dragOver: null,
	}

	it('labels the cells, shows the coordinates on the edges and marks the selection', () => {
		const a1 = boardCell(sq('a1'), geometry(), scene)
		expect(a1).toMatchObject({ rank: '1', file: 'a', name: '' })
		expect(a1.classes['qc-sq--dark']).toBe(true)
		expect(boardCell(sq('e2'), geometry(), scene).classes['qc-sq--selected']).toBe(true)
		expect(boardCell(sq('e4'), geometry(), scene).classes['qc-sq--hl-hint']).toBe(true)
		expect(boardCell(sq('e4'), geometry('b'), { ...scene, coordinates: 'all' })).toMatchObject({ rank: '', file: '', name: 'e4' })
	})

	it('opens the preview card below a square on the top rows and above it elsewhere', () => {
		expect(cardPlacement(sq('e8'), geometry())).toEqual({ left: '80px', width: '290px', top: '56px' })
		expect(cardPlacement(sq('e2'), geometry())).toEqual({ left: '80px', width: '290px', bottom: '106px' })
		expect(tooltipPlacement(sq('a8'), geometry())).toEqual({ left: '4px', width: '240px', top: '54px' })
	})
})
