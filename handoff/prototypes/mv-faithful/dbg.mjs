// print the live board of every row and the history of L0 for a prototype world
import { info, liveSq } from './mv.mjs'
export function dump(w) {
	const I = info(w.x)
	for (const r of w.x.r) {
		const lines = []
		for (let y = I.N - 1; y >= 0; y--) {
			let s = ''
			for (let x = 0; x < I.N; x++) { const id = w.board[liveSq(r[0], I.mode, x, y)]; s += id < 0 ? '.' : (w.sd[id] ? w.ty[id].toLowerCase() : w.ty[id].toUpperCase()).padEnd(2) .slice(0,2) }
			lines.push(s)
		}
		console.log('row', r.join(','), 'ep', w.x.ep[w.x.r.indexOf(r)], '\n  ' + lines.join('\n  '))
	}
}
