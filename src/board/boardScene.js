/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How the board is drawn: pure functions that turn the board model (`boardModel.js`: pieces, kings, targets, links)
 * into what the layers of QuantumBoard render, with pixel positions, CSS classes and SVG shapes. Pixel positions are
 * relative to the board's top-left corner; SVG shapes use board units (one square = 1, viewBox 0 0 8 8).
 *
 * Every function takes the board's geometry as `geo`: `{S, orientation, center(square), pixelOf(square)}` (see
 * `composables/useBoardGeometry.js`).
 */

import { t } from '@nextcloud/l10n'
import { toRaw } from 'vue'
import { otherColor, squareName, T } from '../engine/index.js'
import {
	formatPercentNumber,
	formatProbability,
	moveSentence,
	resolutionLabel,
	resolutionText,
	resultSentence,
} from '../engine/ui/index.js'
import { revealArrow, squareLabel } from './boardModel.js'
import { arcPath, ghostOpacity, isLightSquare, piePath, squareXY } from './geometry.js'
import { pieceSymbolId } from './pieceSprites.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('./animator.js').MoveEvent} MoveEvent */

/** Radius of the outcome ring of a roll, in board units. */
export const RING_R = 0.62

/** Circumference of the outcome ring. */
export const RING_C = 2 * Math.PI * RING_R

/**
 * Font size of the probability badges for a square size.
 *
 * @param {number} S square size in px
 * @return {number} px
 */
function badgeFontPx(S) {
	return Math.min(12, Math.max(10, Math.round(0.2 * S)))
}

/**
 * The pieces as drawn: sprite, opacity, probability ring, transform and state classes.
 *
 * @param {object[]} items pieces of `pieceItems()`
 * @param {object} geo board geometry
 * @param {object} view the current interaction and preferences
 * @param {{piece: number}|null} view.focus the ghost whose parts are highlighted
 * @param {object|null} view.drag the piece being dragged: {key, dragging, touch, x, y}
 * @param {string|null} view.returning key of the piece springing back after a failed drop
 * @param {number|null} view.shaking square of the piece that shakes after a failed drop
 * @param {number|null} view.hoverSquare square of the movable piece under the pointer
 * @param {{pops: string[], sourceDim: object|null, crossfade: boolean}} view.anim the animator's piece effects
 * @param {{showPercentages: boolean, ghostStyle: string, pieceSet: string}} view.prefs display preferences
 * @return {object[]}
 */
export function pieceSprites(items, geo, { focus, drag, returning, shaking, hoverSquare, anim, prefs }) {
	const S = geo.S
	const forced = focus !== null && !prefs.showPercentages
	return items.map((p) => {
		const px = geo.pixelOf(p.square)
		const dragging = drag?.dragging && drag.key === p.key
		const transform = dragging
			? `translate(${drag.x - S / 2}px, ${drag.y - S / 2 - (drag.touch ? S / 2 : 0)}px) scale(1.1)`
			: `translate(${px.x}px, ${px.y}px)`
		let opacity = prefs.ghostStyle === 'solid' ? 1 : ghostOpacity(p.probability)
		if (p.impossible) {
			opacity = 0.1
		}
		const ringP = p.chosen ? 1 : (p.ghost && !p.impossible ? p.probability : 0)
		return {
			...p,
			symbol: pieceSymbolId(prefs.pieceSet, p.color, p.type),
			opacity,
			ring: ringP > 0 ? arcPath(ringP, 0.44) : '',
			forcedBadge: forced && focus.piece === p.piece,
			style: { transform, zIndex: dragging ? 30 : undefined },
			classes: {
				'qc-piece--dragging': dragging,
				'qc-piece--return': returning === p.key,
				'qc-piece--shake': shaking === p.square,
				'qc-piece--pop': anim.pops.includes(p.key),
				'qc-piece--source': anim.sourceDim !== null && anim.sourceDim.piece === p.piece
					&& anim.sourceDim.squares.includes(p.square),
				'qc-piece--hover': hoverSquare === p.square,
				'qc-piece--ghost': p.ghost,
				'qc-piece--crossfade': anim.crossfade,
			},
		}
	})
}

/**
 * The probability badges of ghost parts and endangered kings.
 *
 * @param {object[]} pieces pieces of `pieceSprites()`
 * @param {object[]} kings king rings of `kingRings()`
 * @param {object} geo board geometry
 * @param {{showPercentages: boolean, probabilityFormat: string}} prefs display preferences
 * @return {object[]}
 */
export function badgeList(pieces, kings, geo, prefs) {
	const out = []
	const fontSize = badgeFontPx(geo.S) + 'px'
	for (const p of pieces) {
		if (!(p.ghost && !p.impossible) && !p.chosen) {
			continue
		}
		if (!prefs.showPercentages && !p.forcedBadge) {
			continue
		}
		const px = geo.pixelOf(p.square)
		out.push({
			key: p.key,
			text: formatProbability(p.chosen ? T : p.weight, { format: prefs.probabilityFormat, weight: true }),
			dot: p.idColor,
			classes: { 'qc-badge--chosen': p.chosen },
			style: { left: px.x + geo.S - 2 + 'px', top: px.y + 2 + 'px', fontSize },
		})
	}
	for (const k of kings) {
		const px = geo.pixelOf(k.square)
		out.push({
			key: 'king' + k.color,
			text: formatProbability(k.weight, { weight: true }),
			dot: null,
			classes: { 'qc-badge--king': true, 'qc-badge--danger': k.certain },
			style: { left: px.x + geo.S - 2 + 'px', top: px.y + 2 + 'px', fontSize },
		})
	}
	return out
}

/**
 * The percentage of each coach marker, at the bottom-left corner of its square.
 *
 * @param {Array<{square: number, kind: string, pct?: number}>} markers coach markers
 * @param {object} geo board geometry
 * @return {object[]}
 */
export function coachLabelList(markers, geo) {
	return markers.filter((m) => Number.isFinite(m.pct)).map((m) => {
		const px = geo.pixelOf(m.square)
		return {
			square: m.square,
			kind: m.kind,
			text: formatPercentNumber(m.pct),
			style: { left: px.x + 2 + 'px', top: px.y + geo.S - 2 + 'px', fontSize: badgeFontPx(geo.S) + 'px' },
		}
	})
}

/**
 * The change labels of the what-if view ("▲ 100%").
 *
 * @param {object[]} changed pieces whose probability changes in the what-if view
 * @param {object} geo board geometry
 * @return {object[]}
 */
export function deltaList(changed, geo) {
	return changed.map((p) => {
		const px = geo.pixelOf(p.square)
		return {
			square: p.square,
			up: p.delta.up,
			text: (p.delta.up ? '▲ ' : '▼ ') + formatProbability(p.delta.percent / 100),
			style: { left: px.x + geo.S / 2 + 'px', top: px.y + geo.S - 3 + 'px' },
		}
	})
}

/**
 * The other parts of the focused ghost: their squares get a dashed outline and a curved thread from the focused part.
 *
 * @param {{locs: object[][]}} views the position's views (`viewsOf()`)
 * @param {{square: number, piece: number}|null} focus the focused part
 * @param {object} geo board geometry
 * @return {{outlines: number[], paths: string[]}}
 */
export function partThreads(views, focus, geo) {
	const out = { outlines: [], paths: [] }
	if (focus === null) {
		return out
	}
	const parts = views.locs[focus.piece].map((l) => l.square)
	if (parts.length < 2) {
		return out
	}
	const a = geo.center(focus.square)
	for (const s of parts) {
		if (s === focus.square) {
			continue
		}
		out.outlines.push(s)
		const b = geo.center(s)
		const mx = (a.x + b.x) / 2
		const my = (a.y + b.y) / 2
		const dx = b.x - a.x
		const dy = b.y - a.y
		const len = Math.hypot(dx, dy) || 1
		const bend = Math.min(0.9, len * 0.25)
		out.paths.push(`M ${a.x} ${a.y} Q ${mx - (dy / len) * bend} ${my + (dx / len) * bend} ${b.x} ${b.y}`)
	}
	return out
}

/**
 * Link glyphs on every part of the pieces linked to the focused ghost.
 *
 * @param {{links: number[][], locs: object[][]}} views the position's views
 * @param {{piece: number}|null} focus the focused part
 * @param {object} geo board geometry
 * @return {Array<{square: number, style: object}>}
 */
export function linkGlyphList(views, focus, geo) {
	if (focus === null) {
		return []
	}
	const linked = new Set()
	for (const [x, y] of views.links) {
		if (x === focus.piece) {
			linked.add(y)
		} else if (y === focus.piece) {
			linked.add(x)
		}
	}
	const out = []
	for (const id of linked) {
		for (const l of views.locs[id]) {
			const px = geo.pixelOf(l.square)
			out.push({ square: l.square, style: { left: px.x + 2 + 'px', top: px.y + geo.S - 18 + 'px' } })
		}
	}
	return out
}

/**
 * Chords between every pair of linked pieces (the "always" link-thread preference), between their likeliest parts.
 *
 * @param {{links: number[][], locs: object[][]}} views the position's views
 * @param {object} geo board geometry
 * @return {Array<{x1: number, y1: number, x2: number, y2: number}>}
 */
export function linkChordList(views, geo) {
	const best = (id) => views.locs[id].slice().sort((x, y) => y.weight - x.weight)[0]?.square
	return views.links.map(([x, y]) => {
		const a = geo.center(best(x))
		const b = geo.center(best(y))
		return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
	})
}

/**
 * Four corner triangles of a square in board units (capture markers).
 *
 * @param {number} x centre x
 * @param {number} y centre y
 * @return {string[]} SVG polygon points
 */
export function cornerTriangles(x, y) {
	const h = 0.5
	const k = 0.24
	return [
		[[x - h, y - h], [x - h + k, y - h], [x - h, y - h + k]],
		[[x + h, y - h], [x + h - k, y - h], [x + h, y - h + k]],
		[[x - h, y + h], [x - h + k, y + h], [x - h, y + h - k]],
		[[x + h, y + h], [x + h - k, y + h], [x + h, y + h - k]],
	].map((tri) => tri.map((p) => p.join(',')).join(' '))
}

/**
 * The target markers of the selected piece, with the shapes their kind needs.
 *
 * @param {object[]} targets targets of the input controller
 * @param {object} geo board geometry
 * @param {object} context what else the markers show
 * @param {number|null} context.hovered the target under the pointer or the focus
 * @param {object|null} context.selected the selected piece ({color, type}), drawn faintly on a chosen split target
 * @param {string} context.pieceSet the piece set
 * @return {object[]}
 */
export function targetMarkList(targets, geo, { hovered, selected, pieceSet }) {
	return targets.map((tg) => {
		const { x, y } = geo.center(tg.square)
		const hover = hovered === tg.square
		const mk = {
			square: tg.square,
			kind: tg.kind,
			x,
			y,
			hover,
			transform: hover ? `translate(${x} ${y}) scale(1.15) translate(${-x} ${-y})` : undefined,
		}
		if (tg.kind === 'roll-capture' || tg.kind === 'certain-capture' || tg.kind === 'converging'
			|| tg.kind === 'converging-roll') {
			mk.corners = cornerTriangles(x, y)
		}
		if (tg.kind === 'roll-capture' || tg.kind === 'converging-roll') {
			mk.px = x + 0.3
			mk.py = y + 0.3
			mk.pie = piePath(tg.pCapture ?? 0, 0.13, mk.px, mk.py)
		}
		if (tg.kind === 'split-chosen') {
			mk.symbol = selected ? pieceSymbolId(pieceSet, selected.color, selected.type) : ''
			mk.half = `M ${x} ${y - 0.2} A 0.2 0.2 0 0 1 ${x} ${y + 0.2} Z`
		}
		return mk
	})
}

/**
 * An arrow between two squares: the shaft and the head, in board units.
 *
 * @param {{from: number|number[], to: number|number[], kind?: string, dashed?: boolean}} arrow the arrow
 * @param {object} geo board geometry
 * @return {object}
 */
export function arrowShape(arrow, geo) {
	const from = geo.center(Array.isArray(arrow.from) ? arrow.from[0] : arrow.from)
	const to = geo.center(Array.isArray(arrow.to) ? arrow.to[0] : arrow.to)
	const dx = to.x - from.x
	const dy = to.y - from.y
	const len = Math.hypot(dx, dy) || 1
	const ux = dx / len
	const uy = dy / len
	const tipX = to.x - ux * 0.12
	const tipY = to.y - uy * 0.12
	const baseX = tipX - ux * 0.36
	const baseY = tipY - uy * 0.36
	const w = 0.22
	return {
		kind: arrow.kind ?? 'hint',
		dashed: Boolean(arrow.dashed),
		x1: from.x + ux * 0.18,
		y1: from.y + uy * 0.18,
		x2: baseX + ux * 0.02,
		y2: baseY + uy * 0.02,
		head: `${tipX},${tipY} ${baseX - uy * w},${baseY + ux * w} ${baseX + uy * w},${baseY - ux * w}`,
	}
}

/**
 * The outcome ring of a roll: one segment per outcome, sized by its weight.
 *
 * @param {{square: number, settled: string|null, segments: object[]}|null} ring the animator's ring
 * @param {object} geo board geometry
 * @return {object|null}
 */
export function rollRing(ring, geo) {
	if (!ring) {
		return null
	}
	const { x, y } = geo.center(ring.square)
	return {
		x,
		y,
		settled: ring.settled,
		segments: ring.segments.map((seg, i) => {
			const chosen = ring.settled === seg.key
			const len = chosen ? RING_C : Math.max(0, seg.length * RING_C - 0.04)
			return {
				...seg,
				style: {
					strokeDasharray: `${len} ${RING_C}`,
					strokeDashoffset: chosen ? 0 : -seg.start * RING_C,
					animationDelay: i * 200 + 'ms',
				},
			}
		}),
	}
}

/**
 * The accessible description of a target.
 *
 * @param {object} tg target
 * @param {boolean} physics use the physics names of the results
 * @return {string}
 */
export function targetText(tg, physics) {
	if (tg.disabled) {
		return tg.reason ?? ''
	}
	if (tg.move) {
		return resolutionText(resolutionLabel(tg.move), { physics })
	}
	return tg.kind === 'merge-part' ? t('quantumchess', 'merge') : t('quantumchess', 'target')
}

/**
 * One cell of the accessible grid: its label, tooltip, coordinates and classes.
 *
 * @param {number} square the square
 * @param {object} geo board geometry
 * @param {object} scene what the board shows
 * @param {EngineState} scene.state the displayed position
 * @param {string} scene.coordinates the coordinates preference: inside, all or off
 * @param {boolean} scene.physicsNames use the physics names of the results
 * @param {Map<number, object>} scene.targets targets by square
 * @param {Map<number, object>} scene.markers coach markers by square
 * @param {Map<number, string>} scene.highlights highlight kinds by square
 * @param {object[]|null} scene.whatIfItems the pieces of the what-if view, null outside it
 * @param {number|null} scene.selection the selected square
 * @param {number[]} scene.mergeSources the chosen merge sources
 * @param {number[]} scene.lastMove squares of the last move
 * @param {number|null} scene.dragOver the square under a dragged piece
 * @return {object}
 */
export function boardCell(square, geo, scene) {
	const { col, row } = squareXY(square, geo.orientation)
	const light = isLightSquare(square)
	const coords = scene.coordinates
	const name = squareName(square)
	const tg = scene.targets.get(square)
	const inWhatIf = scene.whatIfItems !== null
	const item = inWhatIf ? scene.whatIfItems.find((p) => p.square === square) : null
	let label = squareLabel(scene.state, square)
	if (tg) {
		label += ', ' + targetText(tg, scene.physicsNames)
	}
	const marker = scene.markers.get(square)
	if (marker?.text) {
		label += '. ' + marker.text
	}
	const selected = scene.selection === square || scene.mergeSources.includes(square)
	return {
		square,
		label,
		selected,
		title: tg?.disabled ? tg.reason : marker?.text,
		rank: coords !== 'off' && coords !== 'all' && col === 0 ? name[1] : '',
		file: coords !== 'off' && coords !== 'all' && row === 7 ? name[0] : '',
		name: coords === 'all' ? name : '',
		classes: {
			'qc-sq--light': light,
			'qc-sq--dark': !light,
			'qc-sq--last': scene.lastMove.includes(square),
			'qc-sq--selected': selected,
			'qc-sq--dragover': scene.dragOver === square,
			'qc-sq--dim': inWhatIf && (item === undefined || item === null || (item.delta === null && !item.chosen)),
			['qc-sq--hl-' + scene.highlights.get(square)]: scene.highlights.has(square),
		},
	}
}

/**
 * Where the move preview card goes: centred on its square, below it on the top three rows, above it elsewhere.
 *
 * @param {number} anchor the square the card belongs to
 * @param {object} geo board geometry
 * @return {object} CSS position
 */
export function cardPlacement(anchor, geo) {
	const S = geo.S
	const { col, row } = squareXY(anchor, geo.orientation)
	const width = Math.min(290, 8 * S - 8)
	const left = Math.max(4, Math.min(8 * S - width - 4, col * S + S / 2 - width / 2))
	const style = { left: left + 'px', width: width + 'px' }
	if (row >= 3) {
		style.bottom = (8 - row) * S + 6 + 'px'
	} else {
		style.top = (row + 1) * S + 6 + 'px'
	}
	return style
}

/**
 * Where the tooltip of a rejected move goes: centred on its square, below it on the top two rows, above it elsewhere.
 *
 * @param {number} square the square the tooltip belongs to
 * @param {object} geo board geometry
 * @return {object} CSS position
 */
export function tooltipPlacement(square, geo) {
	const S = geo.S
	const px = geo.pixelOf(square)
	const width = Math.min(240, 8 * S - 8)
	const left = Math.max(4, Math.min(8 * S - width - 4, px.x + S / 2 - width / 2))
	return {
		left: left + 'px',
		width: width + 'px',
		...(px.y >= 2 * S ? { bottom: 8 * S - px.y + 4 + 'px' } : { top: px.y + S + 4 + 'px' }),
	}
}

/**
 * What the board shows and says for a move event: the result chip of a roll, the arrow that reveals where a ghost
 * really was, and the sentence for screen readers. The sentences are told from the side of the local user.
 *
 * @param {MoveEvent} event the move
 * @param {object} options options
 * @param {{w: string, b: string}|null} options.names display names, when the event carries none
 * @param {boolean} options.lessonRoll tag the chip "Lesson roll"
 * @param {string} options.format probability format: percent or fraction
 * @return {{chip: object|null, reveal: object|null, speech: string}}
 */
export function describeMoveEvent(event, { names = null, lessonRoll = false, format }) {
	const before = toRaw(event.before)
	const after = toRaw(event.after)
	const moverColor = event.move.piece < 16 ? 'w' : 'b'
	const other = otherColor(moverColor)
	const pov = event.actor === 'opponent' ? 'opponent' : 'mover'
	const who = event.names ?? (names ? { mover: names[moverColor], opponent: names[other] } : {})
	const measurement = event.measurement ?? null
	let chip = null
	if (measurement) {
		const s = resultSentence({ before, move: event.move, measurement, pov, names: who, format })
		chip = s ? { ...s, lessonRoll: Boolean(event.lessonRoll || lessonRoll) } : null
	}
	return {
		chip,
		reveal: revealArrow(before, event.move, measurement),
		speech: moveSentence({ before, after, move: event.move, measurement, pov, names: who }),
	}
}
