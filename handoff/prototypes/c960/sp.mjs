const KN = [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]]
export function sp(n) {
  const r = new Array(8).fill(null)
  let q
  r[[1,3,5,7][n % 4]] = 'B'; n = Math.floor(n / 4)
  r[[0,2,4,6][n % 4]] = 'B'; n = Math.floor(n / 4)
  q = n % 6; n = Math.floor(n / 6)
  let free = r.map((v,i)=>v?null:i).filter(i=>i!==null)
  r[free[q]] = 'Q'
  free = r.map((v,i)=>v?null:i).filter(i=>i!==null)
  for (const k of KN[n]) r[free[k]] = 'N'
  free = r.map((v,i)=>v?null:i).filter(i=>i!==null)
  ;['R','K','R'].forEach((p,i)=> r[free[i]] = p)
  return r.join('')
}
export function spNumber(s) {
  const light = [1,3,5,7].findIndex(i => s[i] === 'B')
  const dark = [0,2,4,6].findIndex(i => s[i] === 'B')
  let free = [...s].map((p,i)=> p==='B'?null:i).filter(i=>i!==null)
  const q = free.findIndex(i => s[i] === 'Q')
  free = free.filter(i => s[i] !== 'Q')
  const kn = free.map((i,j)=> s[i]==='N'?j:null).filter(j=>j!==null)
  const code = KN.findIndex(([a,b]) => a===kn[0] && b===kn[1])
  return light + 4 * (dark + 4 * (q + 6 * code))
}
