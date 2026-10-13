/**
 * Revisión de partida: clasifica cada jugada de los dos bandos, calcula la precisión
 * (fórmula de Lichess) y escribe la explicación del entrenador.
 *
 * Umbrales de pérdida en puntos esperados (prob. de ganar / 100), los mismos que publica
 * Chess.com: Mejor 0, Excelente < 0,02, Buena < 0,05, Imprecisión < 0,10, Error < 0,20,
 * Error grave ≥ 0,20. Brillante, Gran jugada y Oportunidad perdida usan reglas propias.
 */
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { es, nonPawnMaterial, phaseOf, tryMove, uciToMove, type Phase } from '../lib/chess-utils'
import { engine } from '../engine/engine'
import { ENGINE_TAG, loadGame, parseClocks, type RawAnalysis } from './core'

export type Cls =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'forced'
  | 'inaccuracy' | 'mistake' | 'miss' | 'blunder'

export const CLS_ORDER: Cls[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder']

export const CLS_META: Record<Cls, { label: string; sym: string; color: string; is: string }> = {
  brilliant: { label: 'Brillante', sym: '!!', color: '#1fb0a6', is: 'es brillante' },
  great: { label: 'Gran jugada', sym: '!', color: '#5b8fd8', is: 'es una gran jugada' },
  best: { label: 'Mejor', sym: '★', color: '#5aa851', is: 'es la mejor jugada' },
  excellent: { label: 'Excelente', sym: '✓', color: '#7cb35a', is: 'es excelente' },
  good: { label: 'Buena', sym: '✓', color: '#8fa682', is: 'es buena' },
  book: { label: 'Teórica', sym: 'T', color: '#a3825f', is: 'es teoría' },
  forced: { label: 'Forzada', sym: '→', color: '#8b8f96', is: 'es forzada' },
  inaccuracy: { label: 'Imprecisión', sym: '?!', color: '#e3b03c', is: 'es una imprecisión' },
  mistake: { label: 'Error', sym: '?', color: '#ec8936', is: 'es un error' },
  miss: { label: 'Oportunidad perdida', sym: '✕', color: '#df5f80', is: 'deja escapar la ocasión' },
  blunder: { label: 'Error grave', sym: '??', color: '#e5484d', is: 'es un error grave' },
}

/** Clases que merecen parar la revisión. */
export const KEY_CLS: Cls[] = ['brilliant', 'great', 'miss', 'mistake', 'blunder']

/* ------------------------------------------------------------------ */
/* Probabilidad de ganar y precisión, como en Lichess (scalachess)      */

export function wpWhite(cp: number) {
  const c = Math.max(-1000, Math.min(1000, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1)
}

export function moveAcc(before: number, after: number) {
  if (after >= before) return 100
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411
  return Math.max(0, Math.min(100, raw + 1))
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const harmonic = (xs: number[]) => (xs.length ? xs.length / xs.reduce((s, x) => s + 1 / Math.max(x, 0.5), 0) : 0)

/** Precisión de partida por bando: media ponderada por volatilidad + media armónica, /2. */
export function gameAccuracy(evals: number[], startWhite = true): Record<Color, number> {
  const wps = evals.map(wpWhite)
  const n = wps.length - 1
  if (n < 1) return { w: 0, b: 0 }
  const ws = Math.max(2, Math.min(8, Math.floor(n / 10)))
  const windows: number[][] = []
  for (let k = 0; k < Math.max(0, Math.min(ws, wps.length) - 2); k++) windows.push(wps.slice(0, ws))
  for (let k = 0; k + ws <= wps.length; k++) windows.push(wps.slice(k, k + ws))
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, std(w))))
  const acc: Record<Color, { a: number; w: number }[]> = { w: [], b: [] }
  for (let i = 0; i < n; i++) {
    const white = (i % 2 === 0) === startWhite
    const before = white ? wps[i] : 100 - wps[i]
    const after = white ? wps[i + 1] : 100 - wps[i + 1]
    acc[white ? 'w' : 'b'].push({ a: moveAcc(before, after), w: weights[i] ?? 1 })
  }
  const one = (xs: { a: number; w: number }[]) => {
    if (!xs.length) return 0
    const wm = xs.reduce((s, x) => s + x.a * x.w, 0) / xs.reduce((s, x) => s + x.w, 0)
    return (wm + harmonic(xs.map((x) => x.a))) / 2
  }
  return { w: one(acc.w), b: one(acc.b) }
}

/* ------------------------------------------------------------------ */
/* Libro de aperturas                                                   */

export type Book = { keys: Set<number>; names: Map<number, string> }

const fnv = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
export const bookKey = (fen: string) => fnv(fen.split(' ').slice(0, 3).join(' '))

let bookP: Promise<Book> | null = null
export function loadBook(): Promise<Book> {
  bookP ??= import('../data/book.json').then((m) => {
    const d = (m.default ?? m) as { k: number[]; n: Record<string, string> }
    return { keys: new Set(d.k), names: new Map(Object.entries(d.n).map(([k, v]) => [Number(k), v])) }
  })
  return bookP
}

/* ------------------------------------------------------------------ */
/* Material y canjes                                                    */

const VAL: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** Lo que gana el bando que mueve capturando en `sq` con la mejor secuencia de capturas (SEE con jugadas legales). */
export function seeGain(g: Chess, sq: Square, depth = 0): number {
  const target = g.get(sq)
  if (!target || depth > 8) return 0
  const caps = g.moves({ verbose: true }).filter((m) => m.to === sq && m.captured)
  if (!caps.length) return 0
  caps.sort((a, b) => VAL[a.piece] - VAL[b.piece])
  const m = caps[0]
  const gain = VAL[target.type] + (m.promotion ? VAL[m.promotion] - 1 : 0)
  const g2 = new Chess(g.fen())
  g2.move(m)
  return Math.max(0, gain - seeGain(g2, sq, depth + 1))
}

/** Misma posición con el turno cambiado (para preguntar «¿estaba ya colgada?»). */
function withTurn(fen: string, turn: Color): Chess | null {
  const f = fen.split(' ')
  f[1] = turn
  f[3] = '-'
  try {
    return new Chess(f.join(' '))
  } catch {
    return null
  }
}

/** Pieza propia (caballo o mayor) que el rival puede ganar tras la jugada: la mayor pérdida neta. */
function hangingAfter(fenBefore: string, fenAfter: string, mover: Color, captured: number, movedTo: string) {
  const after = new Chess(fenAfter)
  let worst: { sq: Square; piece: PieceSymbol; net: number; wasHanging: boolean; trapped: boolean } | null = null
  for (const row of after.board())
    for (const p of row) {
      if (!p || p.color !== mover || p.type === 'k' || p.type === 'p') continue
      const g = seeGain(after, p.square)
      if (g <= 0) continue
      const net = g - captured
      if (net < 2) continue
      let wasHanging = false
      let trapped = false
      if (p.square !== movedTo) {
        const b = withTurn(fenBefore, opp(mover))
        wasHanging = !!b && seeGain(b, p.square) >= net
        trapped = wasHanging && !canEscape(fenBefore, p.square)
      }
      if (!worst || net > worst.net) worst = { sq: p.square, piece: p.type, net, wasHanging, trapped }
    }
  return worst
}

/** ¿Tenía la pieza alguna casilla segura a la que irse? (si no, estaba atrapada y no es un sacrificio) */
function canEscape(fenBefore: string, sq: Square) {
  const g = new Chess(fenBefore)
  for (const m of g.moves({ square: sq, verbose: true })) {
    const g2 = new Chess(fenBefore)
    g2.move(m)
    if (seeGain(g2, m.to) < 2) return true
  }
  return false
}

const PIECE_UN: Record<PieceSymbol, string> = { p: 'un peón', n: 'un caballo', b: 'un alfil', r: 'una torre', q: 'la dama', k: 'el rey' }
const PIECE_EL: Record<PieceSymbol, string> = { p: 'el peón', n: 'el caballo', b: 'el alfil', r: 'la torre', q: 'la dama', k: 'el rey' }
const NUM = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco']

function counts(g: Chess) {
  const c = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } } as Record<Color, Record<'p' | 'n' | 'b' | 'r' | 'q', number>>
  for (const row of g.board()) for (const p of row) if (p && p.type !== 'k') c[p.color][p.type]++
  return c
}

/** Juega una línea y dice qué material cambia para `me` (con la recaptura obvia al final). */
function lineOutcome(fen: string, line: string[], me: Color, maxPlies = 6) {
  const g = new Chess(fen)
  const c0 = counts(g)
  let lastTo: Square | null = null
  let lastCapture = false
  let plies = 0
  const sans: string[] = []
  for (const u of line.slice(0, maxPlies)) {
    const num = g.moveNumber()
    const white = g.turn() === 'w'
    const m = tryMove(g, uciToMove(u))
    if (!m) break
    sans.push((white ? `${num}. ` : sans.length === 0 ? `${num}... ` : '') + es(m.san))
    lastTo = m.to
    lastCapture = !!m.captured
    plies++
  }
  // si la línea se corta a mitad de un cambio, completa la recaptura
  let extra = 0
  if (lastCapture && lastTo && plies) {
    const gain = seeGain(g, lastTo)
    if (gain > 0) extra = g.turn() === me ? gain : -gain
  }
  const c1 = counts(g)
  const lost: PieceSymbol[] = []
  const won: PieceSymbol[] = []
  for (const t of ['q', 'r', 'b', 'n', 'p'] as const) {
    for (let k = 0; k < c0[me][t] - c1[me][t]; k++) lost.push(t)
    for (let k = 0; k < c0[opp(me)][t] - c1[opp(me)][t]; k++) won.push(t)
  }
  // compensa piezas del mismo valor (caballo por alfil, etc.)
  const L = [...lost]
  const W = [...won]
  for (let a = L.length - 1; a >= 0; a--) {
    const k = W.findIndex((x) => VAL[x] === VAL[L[a]])
    if (k >= 0) {
      W.splice(k, 1)
      L.splice(a, 1)
    }
  }
  const delta = W.reduce((s, x) => s + VAL[x], 0) - L.reduce((s, x) => s + VAL[x], 0) + extra
  return { delta, lost: L, won: W, san: sans.join(' '), mate: g.isCheckmate() }
}

function materialPhrase(o: { delta: number; lost: PieceSymbol[]; won: PieceSymbol[] }, verbLose = 'pierdes', verbWin = 'ganas') {
  const d = Math.round(o.delta)
  if (d === 0) return null
  const lose = d < 0
  const verb = lose ? verbLose : verbWin
  const mine = lose ? o.lost : o.won
  const theirs = lose ? o.won : o.lost
  const amount = Math.abs(d)
  if (mine.includes('r') && theirs.length === 1 && (theirs[0] === 'n' || theirs[0] === 'b') && amount <= 3) return `${verb} la calidad`
  // la pieza más valiosa que cabe en el saldo
  const top = [...mine].sort((a, b) => VAL[b] - VAL[a]).find((t) => VAL[t] <= amount + 0.5)
  if (top && top !== 'p') return `${verb} ${PIECE_UN[top]}`
  if (amount === 1) return `${verb} un peón`
  if (amount <= 5 && mine.every((t) => t === 'p')) return `${verb} ${NUM[amount]} peones`
  return `${verb} material`
}

/* ------------------------------------------------------------------ */
/* Análisis profundo: MultiPV 2 en cada posición                        */

export type DeepAnalysis = Omit<RawAnalysis, 'v' | 'alt' | 'nodes'> & { v: 2; alt: (number | null)[]; nodes: number }

export const isDeep = (a: RawAnalysis | null | undefined): a is DeepAnalysis => !!a && a.v === 2 && Array.isArray((a as DeepAnalysis).alt)

export async function deepAnalyze(
  pgn: string,
  nodes: number,
  onPly?: (i: number, n: number) => void,
  ctl?: { cancelled?: boolean; paused?: boolean },
): Promise<DeepAnalysis | null> {
  const g = loadGame(pgn)
  const hist = g.history({ verbose: true })
  const b = new Chess()
  const evals: number[] = []
  const pv: string[][] = []
  const alt: (number | null)[] = []
  for (let i = 0; i <= hist.length; i++) {
    while (ctl?.paused && !ctl.cancelled) await new Promise((r) => setTimeout(r, 200))
    if (ctl?.cancelled) return null
    const white = b.turn() === 'w'
    if (b.isCheckmate()) {
      evals.push(white ? -10000 : 10000)
      pv.push([])
      alt.push(null)
    } else if (b.isGameOver()) {
      evals.push(0)
      pv.push([])
      alt.push(null)
    } else {
      const lines = await engine.analyse(b.fen(), { nodes, multipv: 2 })
      const [l1, l2] = lines
      const cp = l1?.cp ?? 0
      evals.push(white ? cp : -cp)
      pv.push((l1?.pv ?? []).slice(0, 8))
      alt.push(l2 ? (white ? l2.cp : -l2.cp) : null)
    }
    onPly?.(i, hist.length)
    if (i < hist.length) b.move(hist[i].san)
  }
  return { v: 2, evals, pv, alt, eng: ENGINE_TAG, nodes }
}

/* ------------------------------------------------------------------ */
/* Revisión                                                             */

export type RPly = {
  i: number
  n: number // número de jugada
  color: Color
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  phase: Phase
  cls: Cls
  evBefore: number // cp desde las blancas, con la mejor jugada
  evAfter: number
  wpBefore: number // prob. del que mueve
  wpAfter: number
  loss: number
  acc: number
  best: string | null
  bestSan: string | null
  pv: string[]
  replyPv: string[]
  mateBefore: number | null
  mateAfter: number | null
  clock: number | null
  spent: number | null
  sac: { sq: Square; piece: PieceSymbol; net: number } | null
  opening: string | null
  text: string
}

export type Player = { name: string; elo: string | null }
export type Review = {
  plies: RPly[]
  acc: Record<Color, number>
  counts: Record<Color, Record<Cls, number>>
  phases: Record<Color, Partial<Record<Phase, number>>>
  opening: string | null
  keys: number[]
  players: Record<Color, Player>
  /** el bando del usuario: las explicaciones le hablan de tú y del rival en tercera persona */
  me: Color
  headline: string
  summary: string
  deep: boolean
}

const mateOf = (ev: number) => (Math.abs(ev) >= 9000 ? Math.sign(ev) * Math.round((10000 - Math.abs(ev)) / 10) : null)

export const fmtEval = (cpWhite: number) => {
  const m = mateOf(cpWhite)
  if (m !== null) return `${m > 0 ? '' : '−'}M${Math.abs(m)}`
  const v = cpWhite / 100
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}`
}

const header = (pgn: string, tag: string) => pgn.match(new RegExp(`\\[${tag} "([^"]*)"\\]`))?.[1] ?? null

const sameMove = (a: string | null, b: string) => !!a && a.slice(0, 4) === b.slice(0, 4) && (a[4] ?? '') === (b[4] ?? '')

export function reviewGame(pgn: string, me: Color, a: RawAnalysis, book: Book | null, baseTime: number | null = null): Review {
  const g = loadGame(pgn)
  const hist = g.history({ verbose: true })
  const clocks = parseClocks(pgn)
  const inc = Number((header(pgn, 'TimeControl') ?? '').split('+')[1] ?? 0) || 0
  const deep = isDeep(a)
  const alt = deep ? a.alt : []
  const b = new Chess()
  const plies: RPly[] = []
  const aux: { legal: number; isBest: boolean; isBook: boolean; captured: number; alt: number | null }[] = []
  let inBook = true
  let opening: string | null = null

  hist.forEach((m, i) => {
    const fenBefore = b.fen()
    const npm = nonPawnMaterial(b)
    const legal = b.moves().length
    b.move(m.san)
    const fenAfter = b.fen()
    const sign = m.color === 'w' ? 1 : -1
    const evB = a.evals[i] ?? 0
    const evA = a.evals[i + 1] ?? evB
    const uci = m.from + m.to + (m.promotion ?? '')
    const best = a.pv[i]?.[0] ?? null
    const mB0 = mateOf(evB * sign)
    const mA0 = mateOf(evA * sign)
    const keepsMate = mB0 !== null && mB0 > 0 && (b.isCheckmate() || (mA0 !== null && mA0 > 0 && mA0 < mB0))
    const isBest = sameMove(best, uci) || keepsMate
    const wpB = wpWhite(evB * sign)
    const wpA = isBest ? Math.max(wpB, wpWhite(evA * sign)) : wpWhite(evA * sign)
    const loss = isBest ? 0 : Math.max(0, wpB - wpA)
    const mB = mB0
    const mA = mA0
    let bestSan: string | null = null
    if (best && !isBest) bestSan = tryMove(new Chess(fenBefore), uciToMove(best))?.san ?? null
    else if (best) bestSan = m.san

    // libro: seguido desde el inicio y dentro de las primeras 30 medias jugadas
    const key = bookKey(fenAfter)
    const isBook = !!book && inBook && i < 30 && book.keys.has(key)
    if (!isBook) inBook = false
    if (isBook) opening = book!.names.get(key) ?? opening

    const prevClock = i >= 2 ? clocks[i - 2] : baseTime
    const clock = clocks[i] ?? null
    const spent = clock !== null && prevClock != null ? Math.max(0, prevClock - clock + inc) : null

    plies.push({
      i, n: Math.floor(i / 2) + 1, color: m.color, san: m.san, uci, fenBefore, fenAfter,
      phase: phaseOf(i, npm), cls: 'good', evBefore: evB, evAfter: evA, wpBefore: wpB, wpAfter: wpA, loss,
      acc: isBest ? 100 : moveAcc(wpB, wpA), best, bestSan, pv: a.pv[i] ?? [], replyPv: a.pv[i + 1] ?? [],
      mateBefore: mB, mateAfter: mA, clock, spent, sac: null, opening: isBook ? opening : null, text: '',
    })
    aux.push({ legal, isBest, isBook, captured: m.captured ? VAL[m.captured] : 0, alt: alt[i] ?? null })
  })

  plies.forEach((p, k) => {
    const x = aux[k]
    const prev = plies[k - 1]
    const sign = p.color === 'w' ? 1 : -1
    let cls: Cls
    if (x.legal === 1) cls = 'forced'
    else if (x.isBook) cls = 'book'
    else {
      cls = x.isBest ? 'best' : p.loss < 2 ? 'excellent' : p.loss < 5 ? 'good' : p.loss < 10 ? 'inaccuracy' : p.loss < 20 ? 'mistake' : 'blunder'
      // Brillante: sacrificio de pieza, jugada mejor o casi, posición buena después y sin estar ya ganado del todo
      if ((x.isBest || p.loss < 2) && p.wpAfter >= 50 && (p.wpBefore <= 82 || (p.mateAfter !== null && p.mateAfter > 0))) {
        const h = hangingAfter(p.fenBefore, p.fenAfter, p.color, x.captured, p.uci.slice(2, 4))
        // la pieza entregada no puede estar ya perdida de antes (desesperado o pieza atrapada),
        // y el rival o la rechaza o, si la toma, no recuperas el material enseguida (eso sería un cambio)
        if (h && !h.trapped && !(h.sq === p.uci.slice(2, 4) && isDesperado(p)) && isRealSacrifice(p, h.sq)) {
          p.sac = { sq: h.sq, piece: h.piece, net: h.net }
          cls = 'brilliant'
        }
      }
      // Gran jugada: la única buena (la segunda opción pierde ≥ 12 puntos), sin ser una recaptura obvia ni el mate final
      const mates = p.san.includes('#')
      if (cls !== 'brilliant' && !mates && x.isBest && x.alt !== null && x.legal > 2) {
        const wpSecond = wpWhite(x.alt * sign)
        const gap = p.wpBefore - wpSecond
        const recapture = !!prev && prev.san.includes('x') && prev.uci.slice(2, 4) === p.uci.slice(2, 4)
        // crítica: sin ella la posición deja de ser buena (no basta con ganar «un poco menos»)
        if (gap >= 12 && wpSecond < 70 && p.wpBefore >= 30 && !recapture) cls = 'great'
      }
      // Oportunidad perdida: no castiga el error del rival o deja escapar un mate corto
      const oppGift = !!prev && prev.color !== p.color && prev.loss >= 10
      if (!x.isBest && ((oppGift && p.loss >= 10 && p.wpAfter >= 30) || (p.mateBefore !== null && p.mateBefore > 0 && p.mateBefore <= 3 && !(p.mateAfter !== null && p.mateAfter > 0)))) cls = 'miss'
    }
    p.cls = cls
  })


  const counts = { w: zeroCounts(), b: zeroCounts() }
  plies.forEach((p) => counts[p.color][p.cls]++)
  const phases: Review['phases'] = { w: {}, b: {} }
  for (const c of ['w', 'b'] as Color[])
    for (const ph of ['apertura', 'medio', 'final'] as Phase[]) {
      const xs = plies.filter((p) => p.color === c && p.phase === ph).map((p) => p.acc)
      if (xs.length) phases[c][ph] = (mean(xs) + harmonic(xs)) / 2
    }
  const acc = gameAccuracy(a.evals.slice(0, plies.length + 1))
  const keys = plies.filter((p) => KEY_CLS.includes(p.cls)).map((p) => p.i)
  const players: Review['players'] = {
    w: { name: header(pgn, 'White') ?? 'Blancas', elo: header(pgn, 'WhiteElo') },
    b: { name: header(pgn, 'Black') ?? 'Negras', elo: header(pgn, 'BlackElo') },
  }
  const review: Review = { plies, acc, counts, phases, opening, keys, players, me, headline: '', summary: '', deep }
  Object.assign(review, summarize(review, me, header(pgn, 'Result')))
  return review
}

export type ReviewSummary = { acc: number; oacc: number; c: Partial<Record<Cls, number>> }

export function reviewSummary(r: Review, me: Color): ReviewSummary {
  const c: Partial<Record<Cls, number>> = {}
  for (const k of ['brilliant', 'great', 'miss', 'blunder', 'mistake', 'inaccuracy'] as Cls[]) if (r.counts[me][k]) c[k] = r.counts[me][k]
  const r1 = (x: number) => Math.round(x * 10) / 10
  return { acc: r1(r.acc[me]), oacc: r1(r.acc[me === 'w' ? 'b' : 'w']), c }
}

/** Explicación de una jugada (se calcula al mostrarla y se guarda). */
export function textOf(r: Review, i: number) {
  const p = r.plies[i]
  if (!p.text) p.text = explain(p, r.plies[i - 1], r.opening, r.me)
  return p.text
}

const zeroCounts = () => Object.fromEntries(CLS_ORDER.map((c) => [c, 0])) as Record<Cls, number>

function isRealSacrifice(p: RPly, sq: Square) {
  const reply = p.replyPv[0]
  if (!reply || reply.slice(2, 4) !== sq) return true // la rechaza: tomarla era peor
  const o = lineOutcome(p.fenBefore, [p.uci, ...p.replyPv], p.color, 4)
  return o.mate || o.delta <= -2
}

/** Sacrificio "falso": la pieza movida ya estaba perdida antes de moverla. */
function isDesperado(p: RPly) {
  const from = p.uci.slice(0, 2) as Square
  const b = withTurn(p.fenBefore, opp(p.color))
  return !!b && seeGain(b, from) >= 2
}

/** Nota del entrenador para una jugada. */
function explain(p: RPly, prev: RPly | undefined, opening: string | null, user: Color): string {
  const me = p.color
  const you = p.color === user
  const lose = you ? 'pierdes' : 'pierde'
  const win = you ? 'ganas' : 'gana'
  const best = p.bestSan ? es(p.bestSan) : null
  // el saldo se mide desde antes de la jugada del rival: así una recaptura no cuenta como ganancia
  const from = prev ? prev.fenBefore : p.fenBefore
  const pre = prev ? [prev.uci] : []
  const bestLine = p.best ? lineOutcome(from, [...pre, ...p.pv], me, 7) : null
  const bestGain = (() => {
    if (p.mateBefore !== null && p.mateBefore > 0) return `, con mate en ${p.mateBefore}`
    const ph = bestLine && bestLine.delta >= 1 ? materialPhrase(bestLine, 'pierde', 'gana') : null
    return ph ? `, que ${ph}` : ''
  })()
  const afterLine = lineOutcome(from, [...pre, p.uci, ...p.replyPv], me, 8)
  const consequence = (() => {
    if (p.mateAfter !== null && p.mateAfter < 0) return `permite mate en ${-p.mateAfter}${p.replyPv.length ? ` (${lineOutcome(p.fenAfter, p.replyPv, me, 5).san})` : ''}`
    // solo cuenta el material si pierdes más que con la mejor jugada
    const worse = !bestLine || afterLine.delta < bestLine.delta - 0.5
    const ph = afterLine.delta <= -1 && worse ? materialPhrase(afterLine, lose, win) : null
    if (ph) {
      const reply = lineOutcome(p.fenAfter, p.replyPv, me, 4).san
      return `${reply ? `tras ${reply}, ` : ''}${ph}`
    }
    const h = hangingAfter(p.fenBefore, p.fenAfter, me, 0, p.uci.slice(2, 4))
    if (h && !h.wasHanging) return `deja ${PIECE_EL[h.piece]} de ${h.sq} sin defensa suficiente`
    return `${you ? 'tu' : 'su'} probabilidad de ganar baja del ${Math.round(p.wpBefore)} % al ${Math.round(p.wpAfter)} %`
  })()
  switch (p.cls) {
    case 'book':
      return `Jugada teórica${p.opening ?? opening ? `: ${(p.opening ?? opening)!.replace(/^\w\d\d · /, '')}` : ''}.`
    case 'forced':
      return 'Única jugada legal.'
    case 'brilliant': {
      const where = !p.sac ? 'material' : p.sac.piece === 'r' && p.sac.net <= 2.5 ? `calidad en ${p.sac.sq}` : `${PIECE_UN[p.sac.piece]} en ${p.sac.sq}`
      const own = you ? 'tuya' : 'suya'
      const take = p.replyPv[0] && p.sac && p.replyPv[0].slice(2, 4) === p.sac.sq ? ` ${you ? 'El rival lo acepta' : 'Si lo aceptas'}, pero la posición sigue siendo ${own}.` : ` Si ${you ? 'lo toma' : 'lo tomas'}, la posición sigue siendo ${own}.`
      return `Sacrificio de ${where}.${take} Es la mejor jugada.`
    }
    case 'great': {
      const punish = prev && prev.color !== me && prev.loss >= 10 ? (you ? ' Castiga el error del rival.' : ' Castiga tu error.') : ''
      return `La única jugada buena: cualquier otra empeoraba mucho la posición.${punish}`
    }
    case 'best': {
      // solo la ganancia inmediata (la jugada, la respuesta y la siguiente)
      const now = p.best ? lineOutcome(from, [...pre, ...p.pv], me, pre.length + 3) : null
      const gain = now && now.delta >= 1 ? materialPhrase(now, 'pierde', 'gana') : null
      if (p.san.includes('#')) return 'Jaque mate.'
      if (p.mateBefore !== null && p.mateBefore > 0) return `La mejor jugada: mate en ${p.mateBefore}.`
      return gain ? `La mejor jugada: ${gain}.` : 'La mejor jugada.'
    }
    case 'excellent':
      return best ? `Muy buena jugada. La del motor era ${best}, casi igual.` : 'Muy buena jugada.'
    case 'good':
      return best ? `Jugada correcta, aunque ${best} era más precisa${bestGain}.` : 'Jugada correcta.'
    case 'inaccuracy':
      return `Imprecisión: ${consequence}. Mejor era ${best ?? 'otra'}${bestGain}.`
    case 'mistake':
      return `Error: ${consequence}. Lo mejor era ${best ?? 'otra'}${bestGain}.`
    case 'miss': {
      if (p.mateBefore !== null && p.mateBefore > 0) return `Había mate en ${p.mateBefore} con ${best ?? 'otra jugada'}${bestLine?.san ? ` (${bestLine.san})` : ''}. ${you ? 'Se te escapó' : 'Se le escapó'}.`
      return `Oportunidad perdida: tras ${you ? 'el error del rival' : 'tu error'}, ${best ?? 'otra jugada'}${bestGain || ' era mucho más fuerte'}. Con ${es(p.san)} ${consequence}.`
    }
    case 'blunder':
      return `Error grave: ${consequence}. Lo mejor era ${best ?? 'otra'}${bestGain}.`
  }
}

function summarize(r: Review, me: Color, result: string | null) {
  const { plies, acc } = r
  const mine = plies.filter((p) => p.color === me)
  const theirs = plies.filter((p) => p.color !== me)
  const won = result === (me === 'w' ? '1-0' : '0-1')
  const lost = result === (me === 'w' ? '0-1' : '1-0')
  const fmt = (p: RPly) => `${p.n}${p.color === 'w' ? '.' : '...'} ${es(p.san)}`
  const worst = [...mine].sort((a, b) => b.loss - a.loss)[0]
  const theirWorst = [...theirs].sort((a, b) => b.loss - a.loss)[0]
  const brill = mine.filter((p) => p.cls === 'brilliant')
  const misses = mine.filter((p) => p.cls === 'miss')
  const bl = mine.filter((p) => p.cls === 'blunder')
  let headline: string
  if (brill.length) headline = `Jugada brillante: ${fmt(brill[0])}${CLS_META.brilliant.sym}`
  else if (lost && worst && worst.loss >= 20) headline = `La partida se torció en ${fmt(worst)}`
  else if (won && theirWorst && theirWorst.loss >= 20) headline = `Tu rival falló en ${fmt(theirWorst)} y lo aprovechaste`
  else if (won) headline = 'Victoria trabajada'
  else if (!bl.length) headline = 'Partida limpia, sin errores graves'
  else headline = 'Partida con altibajos'
  const parts: string[] = []
  parts.push(`Tu precisión: ${acc[me].toFixed(1).replace('.', ',')} %, frente a ${acc[me === 'w' ? 'b' : 'w'].toFixed(1).replace('.', ',')} % de tu rival.`)
  if (worst && worst.loss >= 20) parts.push(`Tu peor momento: ${fmt(worst)}. ${textOf(r, worst.i)}`)
  if (misses.length) parts.push(`Dejaste escapar ${misses.length === 1 ? 'una ocasión clara' : `${misses.length} ocasiones claras`} tras errores del rival.`)
  const great = mine.filter((p) => p.cls === 'great').length
  if (great) parts.push(`Encontraste ${great === 1 ? 'una jugada única' : `${great} jugadas únicas`} en momentos críticos.`)
  return { headline, summary: parts.join(' ') }
}

/** Clasifica una jugada probada en «Reintentar» a partir de la evaluación tras ella. */
export function classifyTry(wpBefore: number, wpAfter: number, isBest: boolean): Cls {
  if (isBest) return 'best'
  const loss = Math.max(0, wpBefore - wpAfter)
  return loss < 2 ? 'excellent' : loss < 5 ? 'good' : loss < 10 ? 'inaccuracy' : loss < 20 ? 'mistake' : 'blunder'
}

/** Clase que resume la precisión de una fase. */
export function phaseCls(acc: number): Cls {
  return acc >= 95 ? 'best' : acc >= 85 ? 'excellent' : acc >= 75 ? 'good' : acc >= 60 ? 'inaccuracy' : acc >= 45 ? 'mistake' : 'blunder'
}
