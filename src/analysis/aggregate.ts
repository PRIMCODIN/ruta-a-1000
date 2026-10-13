import type { GameStats } from './core'
import type { Phase } from '../lib/chess-utils'

export type GameLite = {
  id: string
  ext_id: string
  source: string
  played_at: string
  time_control: string | null
  color: 'w' | 'b'
  result: 'W' | 'D' | 'L'
  my_elo: number | null
  opp_elo: number | null
  termination: string | null
  stats: GameStats | null
  eng?: string | null
  /** versión del análisis guardado; null si la partida aún no se ha analizado */
  av?: string | null
  opening?: string | null
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const withStats = (g: GameLite[]) => g.filter((x) => x.stats) as (GameLite & { stats: GameStats })[]
const ratio = (num: number, den: number) => (den > 0 ? num / den : null)
const score = (g: GameLite[]) => ratio(sum(g.map((x) => (x.result === 'W' ? 1 : x.result === 'D' ? 0.5 : 0))), g.length)

export type Metric = {
  key: string
  label: string
  short: string
  better: 'up' | 'down'
  fmt: (v: number) => string
  value: (g: GameLite[]) => number | null
  train?: string // pestaña recomendada si no mejora
  hint: string
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const dec = (d: number) => (v: number) => v.toFixed(d).replace('.', ',')

const per100 = (ph: Phase) => (g: GameLite[]) => {
  const s = withStats(g)
  return ratio(100 * sum(s.map((x) => x.stats.blunders[ph])), sum(s.map((x) => x.stats.moves[ph])))
}

export const METRICS: Metric[] = [
  {
    key: 'blundersPerGame', label: 'Errores graves por partida', short: 'Errores/partida', better: 'down', fmt: dec(2),
    value: (g) => { const s = withStats(g); return ratio(sum(s.map((x) => x.stats.blunders.apertura + x.stats.blunders.medio + x.stats.blunders.final)), s.length) },
    train: 'errores', hint: 'Rutina de 3 preguntas antes de cada jugada.',
  },
  {
    key: 'accuracy', label: 'Precisión media', short: 'Precisión', better: 'up', fmt: (v) => `${v.toFixed(1).replace('.', ',')}%`,
    value: (g) => { const s = withStats(g); return ratio(sum(s.map((x) => x.stats.accuracy)), s.length) },
    hint: 'Media de precisión por jugada, fórmula de Lichess.',
  },
  { key: 'b100_apertura', label: 'Errores graves cada 100 jugadas · apertura', short: 'Apertura /100', better: 'down', fmt: dec(1), value: per100('apertura'), train: 'repertorio', hint: 'Repasa las líneas pendientes del repertorio.' },
  { key: 'b100_medio', label: 'Errores graves cada 100 jugadas · medio juego', short: 'Medio juego /100', better: 'down', fmt: dec(1), value: per100('medio'), train: 'errores', hint: 'Ejercicios de pieza colgada y amenaza ignorada.' },
  { key: 'b100_final', label: 'Errores graves cada 100 jugadas · final', short: 'Final /100', better: 'down', fmt: dec(1), value: per100('final'), train: 'finales', hint: 'Finales contra el motor.' },
  {
    key: 'threatBlunders', label: 'Piezas a casilla atacada o amenazas ignoradas (por partida)', short: 'Amenazas no vistas', better: 'down', fmt: dec(2),
    value: (g) => { const s = withStats(g); return ratio(sum(s.map((x) => x.stats.blunderKinds.toAttacked + x.stats.blunderKinds.ignoredThreat)), s.length) },
    train: 'errores', hint: 'Antes de soltar la pieza: ¿la casilla a la que voy está atacada?',
  },
  {
    key: 'queenLost', label: 'Damas perdidas cada 100 partidas', short: 'Damas perdidas', better: 'down', fmt: dec(0),
    value: (g) => { const s = withStats(g); return ratio(100 * sum(s.map((x) => x.stats.hung.q ?? 0)), s.length) },
    train: 'errores', hint: 'Antes de mover la dama, mira qué pieza rival puede atacarla en la casilla de destino.',
  },
  {
    key: 'conversion', label: 'Partidas ganadas tras tener +90%', short: 'Conversión', better: 'up', fmt: pct,
    value: (g) => { const s = withStats(g).filter((x) => x.stats.hadWinning); return s.length >= 3 ? ratio(s.filter((x) => x.result === 'W').length, s.length) : null },
    train: 'finales', hint: 'Simplifica: cambia piezas, no peones. Cuenta las casillas del rey rival.',
  },
  {
    key: 'punish', label: 'Errores del rival que castigas', short: 'Castigas', better: 'up', fmt: pct,
    value: (g) => { const s = withStats(g); return ratio(sum(s.map((x) => x.stats.punished)), sum(s.map((x) => x.stats.oppBlunders))) },
    train: 'errores', hint: 'Cuando el rival hace una jugada rara, pregúntate qué ha dejado sin defender.',
  },
  {
    key: 'matedHome', label: 'Mates recibidos en tu primera fila (cada 100 partidas)', short: 'Mates 1ª fila', better: 'down', fmt: dec(0),
    value: (g) => { const s = withStats(g); return ratio(100 * s.filter((x) => x.stats.matedHomeRank).length, s.length) },
    hint: 'Haz luft (h3 / ...h6) cuando se cambien las piezas menores.',
  },
  {
    key: 'forkE4', label: 'Tenedor ...e5-e4 sufrido (cada 100 partidas con blancas)', short: 'Tenedor ...e4', better: 'down', fmt: dec(1),
    value: (g) => { const s = withStats(g).filter((x) => x.color === 'w'); return s.length >= 10 ? ratio(100 * s.filter((x) => x.stats.forkE4).length, s.length) : null },
    train: 'repertorio', hint: 'Alfil en d3 + caballo en f3 + peón negro en e5 = cambia en e5 ya.',
  },
  {
    key: 'timeoutBetter', label: 'Derrotas por tiempo con ventaja (cada 100 partidas)', short: 'Tiempo con ventaja', better: 'down', fmt: dec(1),
    value: (g) => { const s = withStats(g); return ratio(100 * s.filter((x) => x.stats.timeoutLossWhileBetter).length, s.length) },
    hint: 'Juega partidas más largas y busca la forma simple de ganar.',
  },
  { key: 'scoreWhite', label: 'Puntuación con blancas', short: 'Con blancas', better: 'up', fmt: pct, value: (g) => score(g.filter((x) => x.color === 'w')), train: 'repertorio', hint: 'Tu sistema contra ...e5 y ...Af5.' },
  { key: 'scoreBlack', label: 'Puntuación con negras', short: 'Con negras', better: 'up', fmt: pct, value: (g) => score(g.filter((x) => x.color === 'b')), hint: 'Siciliana con ...Cc6 y fianchetto.' },
]

export const metricByKey = Object.fromEntries(METRICS.map((m) => [m.key, m]))

/** Serie móvil: cada punto resume las `win` partidas anteriores. */
export function rolling(games: GameLite[], m: Metric, win = 30, step = 5) {
  const sorted = [...games].sort((a, b) => a.played_at.localeCompare(b.played_at))
  const pts: { x: string; y: number; n: number }[] = []
  for (let end = win; end <= sorted.length; end += step) {
    const slice = sorted.slice(end - win, end)
    const v = m.value(slice)
    if (v !== null) pts.push({ x: slice[slice.length - 1].played_at, y: v, n: end })
  }
  const lastEnd = sorted.length
  if (sorted.length >= win && (lastEnd - win) % step !== 0) {
    const slice = sorted.slice(lastEnd - win)
    const v = m.value(slice)
    if (v !== null) pts.push({ x: slice[slice.length - 1].played_at, y: v, n: lastEnd })
  }
  return pts
}

export type Verdict = 'mejor' | 'igual' | 'peor'
export type Comparison = { metric: Metric; before: number; after: number; verdict: Verdict; change: number }

/**
 * Compara el periodo base (las partidas importadas al empezar) con las más recientes.
 * Se considera cambio real si mejora o empeora más de un 10% relativo.
 */
export function compare(games: GameLite[], recentN = 50): { base: GameLite[]; recent: GameLite[]; rows: Comparison[] } {
  const sorted = [...games].sort((a, b) => a.played_at.localeCompare(b.played_at))
  const newer = sorted.filter((g) => g.source !== 'seed')
  const recent = newer.length >= 20 ? newer.slice(-recentN) : sorted.slice(-recentN)
  const recentIds = new Set(recent.map((g) => g.id))
  const base = sorted.filter((g) => !recentIds.has(g.id))
  const rows: Comparison[] = []
  for (const m of METRICS) {
    const before = m.value(base)
    const after = m.value(recent)
    if (before === null || after === null) continue
    const denom = Math.max(Math.abs(before), 1e-6)
    const rel = (after - before) / denom
    const good = m.better === 'up' ? rel : -rel
    const verdict: Verdict = good > 0.1 ? 'mejor' : good < -0.1 ? 'peor' : 'igual'
    rows.push({ metric: m, before, after, verdict, change: good })
  }
  return { base, recent, rows }
}

export function ratingSeries(games: GameLite[]) {
  const by: Record<string, { x: string; y: number }[]> = {}
  for (const g of [...games].sort((a, b) => a.played_at.localeCompare(b.played_at))) {
    if (!g.my_elo) continue
    const tc = g.time_control ?? '?'
    const base = Number(tc.split('+')[0])
    const cls = base < 180 ? 'Bullet' : base < 600 ? 'Blitz' : 'Rápidas'
    ;(by[cls] ??= []).push({ x: g.played_at, y: g.my_elo })
  }
  return by
}
