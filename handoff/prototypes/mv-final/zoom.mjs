// Probe: layout width in units vs the zoom the board component can reach (MAX_ZOOM = 8 in VariantBoard.vue) and the
// focus zoom clamp of spec 9.5 ([1, 4]); H6 asks for >= 28 px per unit on a coarse pointer.
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { layoutOf } from '../../tmp/mv-final/layoutf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
const [setup = 'small', games = '6', plies = '120', mode = 'random'] = process.argv.slice(2)
const PHONE = 360, PAD = 0.7, MAXZ = 8
let worst = null
const widths = []
for (let g = 1; g <= Number(games); g++) {
	const rng = seeded(500 + g)
	let s = Q.newGame(V, { setup, timelines: '3' })
	while (!s.result && s.ply < Number(plies)) {
		const L = layoutOf(s)
		const W = L.layout.width, H = L.layout.height
		const need = (W + 2 * PAD) * 28 / PHONE // zoom for 28 px per unit
		widths.push(W)
		if (!worst || W > worst.W) worst = { W, H, need, ply: s.ply, rows: s.worlds[0].b.x.tl.filter(Boolean).length, focusZoom: L.layout.focus.zoom, cols: new Set(L.layout.boards.map((b) => b.x)).size }
		let code
		if (mode === 'ai') code = await chooseMove(V, s, { level: 'easy', rng })
		else { const ms = Q.legalMoves(V, s); code = ms[Math.floor(rng() * ms.length)].code }
		s = Q.applyMove(V, s, code, rng).state
	}
}
widths.sort((a, b) => a - b)
const pct = (p) => widths[Math.floor(p * (widths.length - 1))].toFixed(0)
const pxAtMax = (W) => (PHONE / ((W + 2 * PAD) / MAXZ)).toFixed(1)
console.log(`${setup} ${mode}: layout width median ${pct(0.5)}, p90 ${pct(0.9)}, max ${worst.W.toFixed(0)} units (${worst.rows} rows, ${worst.cols} columns, height ${worst.H.toFixed(0)})`)
console.log(`  zoom needed for 28 px/unit on a ${PHONE} px phone at the widest: ${worst.need.toFixed(1)} (component MAX_ZOOM ${MAXZ}, spec focus clamp 4); px/unit at zoom 8: ${pxAtMax(worst.W)}, at zoom 4: ${(PHONE / ((worst.W + 2 * PAD) / 4)).toFixed(1)}; focus zoom given: ${worst.focusZoom.toFixed(2)}`)
console.log(`  share of positions needing zoom > 8: ${(widths.filter((W) => (W + 2 * PAD) * 28 / PHONE > MAXZ).length / widths.length * 100).toFixed(0)} %; > 4: ${(widths.filter((W) => (W + 2 * PAD) * 28 / PHONE > 4).length / widths.length * 100).toFixed(0)} %`)
