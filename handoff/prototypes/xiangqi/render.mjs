// Draw the prototype layout (as VariantBoard.vue would: areas, lines, point cells, xiangqi discs, a ghost with its
// badge) to an SVG, to check the design by eye. Usage: node render.mjs out.svg
import { writeFileSync } from 'node:fs'
import { glyphOf } from '../../../src/variantplay/glyphs.js'
import { boardView } from '../../../src/variants/core/quantum.js'
import { V, after, newGame } from './lib.mjs'

const topo = V.topology
const L = topo.layout
const PAD = 0.7
let s = newGame(V)
s = after(s, 'h3-e3')
s = after(s, 'h10-g8|i8')
const view = boardView(s, topo.size)
const out = []
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${L.width + 2 * PAD} ${L.height + 2 * PAD}" width="${(L.width + 2 * PAD) * 60}" height="${(L.height + 2 * PAD) * 60}">`)
out.push(`<rect x="${-PAD}" y="${-PAD}" width="${L.width + 2 * PAD}" height="${L.height + 2 * PAD}" fill="#ffffff"/>`)
const AREA = { wood: '#eecb8c', river: '#cfe3ea', frame: '#eeeeee' }
for (const a of L.areas) {
	out.push(`<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="${AREA[a.shade]}"/>`)
}
for (const l of L.lines) {
	out.push(`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#5d4222" stroke-width="0.035"/>`)
}
for (const l of L.labels) {
	out.push(`<text x="${l.x}" y="${l.y}" font-size="0.32" text-anchor="middle" dominant-baseline="central" fill="#666">${l.text}</text>`)
}
for (const c of topo.cells) {
	const occ = view[c.sq]
	if (!occ.length) {
		continue
	}
	const o = occ[0]
	const g = glyphOf(V, o.type, o.side)
	const size = 0.9
	const op = o.p < 1 ? 0.55 : 1
	out.push(`<g transform="translate(${c.x},${c.y})" opacity="${op}">`)
	out.push(`<circle r="${size * 0.42}" fill="${g.fill}" stroke="${g.ink}" stroke-width="${size * 0.05}"/>`)
	out.push(`<circle r="${size * 0.34}" fill="none" stroke="${g.ink}" stroke-width="${size * 0.02}"/>`)
	out.push(`<text font-size="${size * 0.5}" text-anchor="middle" dominant-baseline="central" fill="${g.ink}" font-family="Noto Serif CJK TC, serif">${g.text}</text>`)
	if (o.p < 1) {
		out.push(`<rect x="${size * 0.2 - size * 0.27}" y="${size * 0.3 - size * 0.13}" width="${size * 0.54}" height="${size * 0.26}" rx="${size * 0.08}" fill="#6b3fd4"/>`)
		out.push(`<text x="${size * 0.2}" y="${size * 0.3}" font-size="${size * 0.2}" text-anchor="middle" dominant-baseline="central" fill="#fff">${Math.round(o.p * 100)}%</text>`)
	}
	out.push('</g>')
}
out.push('</svg>')
writeFileSync(process.argv[2] ?? 'board.svg', out.join('\n'))
