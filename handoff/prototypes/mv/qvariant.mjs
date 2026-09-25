// The prototype wired into the REAL, unchanged core (src/variants/core). Validation only.
import * as P from './proto.mjs'
import { makeTopology } from '/home/user/Quantum_Chess/src/variants/core/topology.js'
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'

const LS = (L) => (L === 0 ? '0' : L > 0 ? '+' + L : '−' + -L)
const coords = []
for (let u = 0; u < P.R; u++) for (let slot = 0; slot < P.S; slot++) for (let cell = 0; cell < 64; cell++) coords.push([cell % 8, cell >> 3, slot, u])
const topology = makeTopology({
	coords,
	name: ([f, r, slot, u]) => 'L' + LS(P.LOf(u)) + (slot ? "'" + slot : '') + ':' + 'abcdefgh'[f] + (r + 1),
	cell: ([f, r, slot, u]) => ({ x: (u * P.S + slot) * 9 + f, y: 7 - r, w: 1, h: 1, shape: 'rect', shade: 'light' }),
})

const LIVE = { k: [true, 0], k0: [true, 0], q: [false, 1500], r: [false, 300], r0: [false, 300], b: [false, 500], n: [false, 450], p: [false, 100], p0: [false, 100], u: [false, 550], d: [false, 350], s: [false, 800], y: [true, 1500], c: [false, 350], w: [false, 140], w0: [false, 140] }
const SOLID = new Set(['p', 'p0', 'w', 'w0', 'c'])
const types = {}
for (const [t, [royal, value]] of Object.entries(LIVE)) {
	types[t] = { name: () => t, moves: [], royal, solid: royal || SOLID.has(t), splittable: !royal && !SOLID.has(t), value, glyph: { text: t } }
	types['h' + t] = { name: () => 'h' + t, moves: [], royal, solid: royal, splittable: false, value: 0, glyph: { text: t } }
}

const conv = (m) => ({ ...m, promo: m.extra?.promo ? 'q' : null, drop: null })

const spec = {
	id: 'multiverse',
	category: 'dimensions',
	sides: [{ id: 'w', name: () => 'White', color: 'white', rotate: 0 }, { id: 'b', name: () => 'Black', color: 'black', rotate: 0 }],
	topology,
	types,
	maxPly: 3000,
	quietPlies: 1e9,
	options: [{ id: 'setup', type: 'choice', default: 'standard', values: [{ id: 'standard' }, { id: 'small' }] }],
	setup(o) {
		return o?.setup === 'small' ? P.setup('kqbnr/ppppp/5/PPPPP/KQBNR', 5) : P.setup('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 8)
	},
	rules: () => [],
	generate(w, side) {
		if (side === w.x.s) return P.generate(w, side).map(conv)
		// phantom royal captures, with ids mapped back to the real world
		const mand = new Set(P.mandatory(w))
		return P.royalThreats(w, w.x.s).map((m) => {
			const tu = m.tg.ut
			let cap = m.capture
			if (mand.has(tu) && m.tg.slot >= 2) cap = P.sqOf(tu, m.tg.slot - 1, m.tg.cell)
			return { ...conv(m), capture: cap }
		})
	},
	apply(w, m) { return P.apply(w, m) },
	measured() { return true },
	solidExtra(w) { return w.x.s + '|' + w.x.n + '|' + w.x.tl.map((e) => (e ? e.join('.') : '')).join(',') },
	nextSide(w) { return w.x.s },
	worldResult(w) { return w.x.k === null ? null : { winner: w.x.k, reason: 'king' } },
	actions: () => [{ code: '/', label: 'Submit turn' }],
}
export default defineVariant(spec)
