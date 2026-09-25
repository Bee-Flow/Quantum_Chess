const Chess = require('../../5dsrc/package/dist/5d-chess.js')
const fs = require('fs')
const { performance } = require('perf_hooks')
const dir = '../../5dsrc/cwmtt/tests/5dpgn/'
for (const f of fs.readdirSync(dir)) {
  const c = new Chess(); c.checkmateTimeout = 8000; c.skipDetection = true
  try { c.import(fs.readFileSync(dir + f, 'utf8')) } catch (e) { console.log(f, 'import failed:', e.message.split('\n')[0].slice(0, 80)); continue }
  c.skipDetection = false
  let tl = 0, boards = 0; for (const l of c.rawBoard) if (l) { tl++; for (const b of l) if (b) boards++ }
  const t0 = performance.now(); let mate
  try { mate = c.inCheckmate } catch (e) { mate = 'ERR ' + e.message.slice(0, 40) }
  const ms = performance.now() - t0
  console.log(f, JSON.stringify({ timelines: tl, boards, actions: c.rawAction, inCheck: c.inCheck, mate, ms: Math.round(ms) }))
}
