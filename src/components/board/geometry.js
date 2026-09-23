/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Screen geometry of the board: square index (ER §2.1, a1 = 0) ↔ display column/row for an orientation.
 */

/**
 * Display column and row of a square (row 0 is the top).
 *
 * @param {number} square 0..63
 * @param {'w'|'b'} orientation the side at the bottom
 * @return {{col: number, row: number}}
 */
export function squareXY(square, orientation = 'w') {
	const file = square & 7
	const rank = square >> 3
	return orientation === 'b' ? { col: 7 - file, row: rank } : { col: file, row: 7 - rank }
}

/**
 * The square shown at a display column and row.
 *
 * @param {number} col 0..7
 * @param {number} row 0..7 (0 = top)
 * @param {'w'|'b'} orientation the side at the bottom
 * @return {number}
 */
export function squareAt(col, row, orientation = 'w') {
	return orientation === 'b' ? row * 8 + (7 - col) : (7 - row) * 8 + col
}

/**
 * Squares in display order (row by row from the top), for the grid.
 *
 * @param {'w'|'b'} orientation the side at the bottom
 * @return {number[][]} 8 rows of 8 squares
 */
export function displayRows(orientation = 'w') {
	const rows = []
	for (let row = 0; row < 8; row++) {
		const r = []
		for (let col = 0; col < 8; col++) {
			r.push(squareAt(col, row, orientation))
		}
		rows.push(r)
	}
	return rows
}

/**
 * Whether a square is light (h1 is light).
 *
 * @param {number} square 0..63
 * @return {boolean}
 */
export function isLightSquare(square) {
	return ((square & 7) + (square >> 3)) % 2 === 1
}

/**
 * Centre of a square in board units (the marker SVG uses viewBox 0 0 8 8).
 *
 * @param {number} square 0..63
 * @param {'w'|'b'} orientation the side at the bottom
 * @return {{x: number, y: number}}
 */
export function squareCentre(square, orientation = 'w') {
	const { col, row } = squareXY(square, orientation)
	return { x: col + 0.5, y: row + 0.5 }
}

/**
 * The next square for an arrow key, from the viewer's side.
 *
 * @param {number} square current square
 * @param {string} key ArrowUp | ArrowDown | ArrowLeft | ArrowRight | Home | End | PageUp | PageDown
 * @param {'w'|'b'} orientation the side at the bottom
 * @return {number}
 */
export function stepSquare(square, key, orientation = 'w') {
	let { col, row } = squareXY(square, orientation)
	switch (key) {
		case 'ArrowUp':
			row = Math.max(0, row - 1)
			break
		case 'ArrowDown':
			row = Math.min(7, row + 1)
			break
		case 'ArrowLeft':
			col = Math.max(0, col - 1)
			break
		case 'ArrowRight':
			col = Math.min(7, col + 1)
			break
		case 'Home':
			col = 0
			break
		case 'End':
			col = 7
			break
		case 'PageUp':
			row = 0
			break
		case 'PageDown':
			row = 7
			break
		default:
			return square
	}
	return squareAt(col, row, orientation)
}

/**
 * Probability ring arc path (starts at 12 o'clock, clockwise) in a 1 × 1 box centred at (0.5, 0.5).
 *
 * @param {number} p fraction of the circle 0..1
 * @param {number} r radius (box units)
 * @param {number} [cx] centre x
 * @param {number} [cy] centre y
 * @return {string} SVG path data ('' for p ≤ 0)
 */
export function arcPath(p, r, cx = 0.5, cy = 0.5) {
	if (p <= 0) {
		return ''
	}
	if (p >= 0.9999) {
		return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.0001} ${cy - r} Z`
	}
	const a = p * 2 * Math.PI
	const x = cx + r * Math.sin(a)
	const y = cy - r * Math.cos(a)
	return `M ${cx} ${cy - r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x.toFixed(4)} ${y.toFixed(4)}`
}

/**
 * Pie slice path (from 12 o'clock, clockwise).
 *
 * @param {number} p fraction 0..1
 * @param {number} r radius
 * @param {number} cx centre x
 * @param {number} cy centre y
 * @return {string}
 */
export function piePath(p, r, cx, cy) {
	if (p <= 0) {
		return ''
	}
	if (p >= 0.9999) {
		return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.0001} ${cy - r} Z`
	}
	const a = p * 2 * Math.PI
	const x = cx + r * Math.sin(a)
	const y = cy - r * Math.cos(a)
	return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x.toFixed(4)} ${y.toFixed(4)} Z`
}

/**
 * Ghost opacity (GAME-DESIGN §3.4.1): 0.28 + 0.72·p.
 *
 * @param {number} p probability
 * @return {number}
 */
export function ghostOpacity(p) {
	return p >= 1 ? 1 : 0.28 + 0.72 * p
}
