// Comprueba que las estadísticas calculadas en TS sobre el seed coinciden con el análisis original.
import { readFileSync } from 'node:fs'
import { buildPlies, computeStats, type GameRow } from '../src/analysis/core'
import { METRICS, compare, type GameLite } from '../src/analysis/aggregate'

const seed = JSON.parse(readFileSync(new URL('../public/seed.json', import.meta.url), 'utf8'))
const lite: GameLite[] = seed.games.map((g: GameRow, i: number) => {
  const plies = buildPlies(g.pgn, g.analysis!)
  return { ...g, id: String(i), stats: computeStats(g, plies) }
})
for (const m of METRICS) { const v = m.value(lite); console.log(m.key.padEnd(18), v === null ? '-' : m.fmt(v)) }
const s = lite.map((g) => g.stats!)
const tot = (f: (x: any) => number) => s.reduce((a, x) => a + f(x), 0)
console.log('forkE4', tot((x) => +x.forkE4), 'pinG5', tot((x) => +x.pinG5), 'matedHome', tot((x) => +x.matedHomeRank), 'mated', tot((x) => +x.mated))
console.log('hadWinning', tot((x) => +x.hadWinning), 'stalemateWin', tot((x) => +x.stalemateWhileWinning), 'timeoutBetter', tot((x) => +x.timeoutLossWhileBetter))
console.log('kinds', JSON.stringify(s.reduce((a: any, x) => { for (const k in x.blunderKinds) a[k] = (a[k] ?? 0) + (x.blunderKinds as any)[k]; return a }, {})))
console.log(compare(lite).rows.map((r) => `${r.metric.key}:${r.verdict}`).join(' '))
