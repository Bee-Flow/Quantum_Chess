/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Board topologies of the chess variants: squares with integer coordinates in any number of dimensions, their names,
 * and where each square is drawn. A square is an index `0..size-1`; moving is adding a vector to the coordinates.
 *
 * The rules of the variants are in docs/variants.md; the architecture is in docs/development/architecture.md.
 */

/** File letters used by the default square names. */
export const FILE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'

/**
 * @typedef {object} Cell
 * @property {number} sq square index
 * @property {number} x left (or centre, for hex and point cells) in layout units
 * @property {number} y top (or centre) in layout units
 * @property {number} w width in layout units
 * @property {number} h height in layout units
 * @property {'rect'|'hex'|'point'} shape how the cell is drawn
 * @property {string} shade light, dark, mid or a variant-specific shade (river, palace, hill, ...)
 */

/**
 * @typedef {object} Topology
 * @property {number} size number of squares
 * @property {number} dims number of coordinates per square
 * @property {number[][]} coords coordinates per square
 * @property {string[]} names square names
 * @property {(sq: number, vec: number[]) => number} step the square at `sq + vec`, or -1
 * @property {(coords: number[]) => number} at the square with these coordinates, or -1
 * @property {(name: string) => number} byName the square with this name, or -1
 * @property {Cell[]} cells how every square is drawn
 * @property {{width: number, height: number, labels: object[], lines: object[], boards: object[]}} layout extras
 */

/**
 * Build a topology from a list of coordinates.
 *
 * @param {object} spec specification
 * @param {number[][]} spec.coords coordinates of every square, in index order
 * @param {(c: number[]) => string} spec.name square name (must not contain `-`, `|`, `?`, `@`, `=` or spaces)
 * @param {(c: number[], sq: number) => Omit<Cell, 'sq'>} spec.cell how a square is drawn
 * @param {object} [spec.layout] width, height, labels, lines and boards of the drawing
 * @return {Topology}
 */
export function makeTopology({ coords, name, cell, layout = {} }) {
	const dims = coords[0].length
	const index = new Map()
	const names = []
	const byName = new Map()
	coords.forEach((c, sq) => {
		index.set(c.join(','), sq)
		const n = name(c)
		if (/[-|?@=\s]/.test(n) || byName.has(n)) {
			throw new Error('invalid or duplicate square name ' + n)
		}
		names.push(n)
		byName.set(n, sq)
	})
	const stepCache = new Map()
	const cells = coords.map((c, sq) => ({ sq, ...cell(c, sq) }))
	let width = layout.width
	let height = layout.height
	if (width === undefined || height === undefined) {
		width = 0
		height = 0
		for (const c of cells) {
			const right = c.shape === 'rect' ? c.x + c.w : c.x + c.w / 2
			const bottom = c.shape === 'rect' ? c.y + c.h : c.y + c.h / 2
			width = Math.max(width, right)
			height = Math.max(height, bottom)
		}
	}
	return {
		size: coords.length,
		dims,
		coords,
		names,
		cells,
		layout: { labels: [], lines: [], boards: [], ...layout, width, height },
		at(c) {
			const sq = index.get(c.join(','))
			return sq === undefined ? -1 : sq
		},
		byName(n) {
			const sq = byName.get(n)
			return sq === undefined ? -1 : sq
		},
		step(sq, vec) {
			const key = sq + ':' + vec.join(',')
			let t = stepCache.get(key)
			if (t === undefined) {
				const c = coords[sq]
				const target = c.map((v, i) => v + (vec[i] ?? 0))
				t = index.get(target.join(','))
				t = t === undefined ? -1 : t
				stepCache.set(key, t)
			}
			return t
		},
	}
}

/**
 * A rectangular two-dimensional board, White (side 0) at the bottom: files `a…`, ranks `1…`.
 *
 * @param {number} files number of files
 * @param {number} ranks number of ranks
 * @param {object} [opts] options
 * @param {(f: number, r: number) => boolean} [opts.exists] which squares exist (default all)
 * @param {(f: number, r: number) => string} [opts.shade] shade of a square (default checkered light/dark)
 * @param {(f: number, r: number) => string} [opts.name] square name (default file letter + rank number)
 * @param {object} [opts.layout] extra layout (labels are added for files and ranks unless `noLabels`)
 * @param {boolean} [opts.noLabels] leave out the coordinate labels
 * @return {Topology}
 */
export function rectTopology(files, ranks, opts = {}) {
	const coords = []
	for (let r = 0; r < ranks; r++) {
		for (let f = 0; f < files; f++) {
			if (!opts.exists || opts.exists(f, r)) {
				coords.push([f, r])
			}
		}
	}
	const labels = []
	if (!opts.noLabels) {
		for (let f = 0; f < files; f++) {
			labels.push({ x: f + 0.5, y: ranks + 0.32, text: FILE_LETTERS[f] })
		}
		for (let r = 0; r < ranks; r++) {
			labels.push({ x: -0.3, y: ranks - r - 0.5, text: String(r + 1) })
		}
	}
	return makeTopology({
		coords,
		name: ([f, r]) => (opts.name ? opts.name(f, r) : FILE_LETTERS[f] + String(r + 1)),
		cell: ([f, r]) => ({
			x: f,
			y: ranks - 1 - r,
			w: 1,
			h: 1,
			shape: 'rect',
			shade: opts.shade ? opts.shade(f, r) : ((f + r) % 2 === 0 ? 'dark' : 'light'),
		}),
		layout: {
			width: files,
			height: ranks,
			labels,
			...opts.layout,
		},
	})
}

/**
 * Every vector obtained from `vec` by permuting its coordinates and flipping their signs, without duplicates.
 * `symmetric([1, 2], 2)` gives the eight knight jumps; `symmetric([1, 0, 0], 3)` the six rook directions in 3D.
 *
 * @param {number[]} vec base vector (padded with zeros to `dims`)
 * @param {number} dims number of dimensions
 * @return {number[][]}
 */
export function symmetric(vec, dims) {
	const base = vec.concat(new Array(Math.max(0, dims - vec.length)).fill(0))
	const out = new Map()
	const perms = permutations(base)
	for (const p of perms) {
		const nz = p.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0)
		for (let mask = 0; mask < 1 << nz.length; mask++) {
			const v = p.slice()
			nz.forEach((i, k) => {
				if (mask & (1 << k)) {
					v[i] = -v[i]
				}
			})
			out.set(v.join(','), v)
		}
	}
	return [...out.values()]
}

/**
 * All orderings of an array (with duplicates when values repeat; `symmetric` removes them).
 *
 * @param {number[]} arr values
 * @return {number[][]}
 */
function permutations(arr) {
	if (arr.length <= 1) {
		return [arr.slice()]
	}
	const out = []
	for (let i = 0; i < arr.length; i++) {
		const rest = arr.slice(0, i).concat(arr.slice(i + 1))
		for (const p of permutations(rest)) {
			out.push([arr[i], ...p])
		}
	}
	return out
}

/**
 * Directions with every coordinate in {-1, 0, 1} and exactly `k` non-zero coordinates (k = 1: rook lines, k = 2:
 * bishop diagonals, k = 3: triagonals, ...).
 *
 * @param {number} dims number of dimensions
 * @param {number} k number of non-zero coordinates
 * @return {number[][]}
 */
export function directions(dims, k) {
	return symmetric(new Array(k).fill(1), dims)
}

/**
 * Every direction with coordinates in {-1, 0, 1}, not all zero (the king and queen of n-dimensional chess).
 *
 * @param {number} dims number of dimensions
 * @return {number[][]}
 */
export function allDirections(dims) {
	const out = []
	for (let k = 1; k <= dims; k++) {
		out.push(...directions(dims, k))
	}
	return out
}
