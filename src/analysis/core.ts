import { Chess, type Square } from 'chess.js'
import {
  es, winPct, moveAccuracy, nonPawnMaterial, phaseOf, material, PIECE_NAME, uciToMove, tryMove, pvToSan,
  type Phase,
} from '../lib/chess-utils'
import { engine } from '../engine/engine'
import type { ReviewSummary } from './review'

/** Evaluaciones desde el punto de vista de las blancas (cp, mates como ±10000) para cada posición 0..n. */
export type RawAnalysis = { v: 1 | 2; evals: number[]; pv: string[][]; eng?: string; alt?: (number | null)[]; nodes?: number }

/** Motor y fuerza con los que se analizan las partidas nuevas. Si cambia, se reanalizan. */
export const ENGINE_TAG = 'sf17l'

export type GameRow = {
  id?: string
  ext_id: string
  source: 'chesscom' | 'pgn' | 'seed'
  played_at: string
  time_control: string | null
  color: 'w' | 'b'
  result: 'W' | 'D' | 'L'
  termination: string | null
  my_elo: number | null
  opp_elo: number | null
  opening: string | null
  pgn: string
  analysis?: RawAnalysis | null
  stats?: GameStats | null
}

export type Ply = {
  i: number
  color: 'w' | 'b'
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  npm: number
  phase: Phase
  wpBefore: number // prob. de ganar del que mueve, antes
  wpAfter: number // prob. de ganar del que mueve, después
  loss: number
  best: string | null
  pv: string[]
  replyPv: string[]
  mateBefore: number | null
  mateAfter: number | null // mate para el bando que mueve después de su jugada (>0 a favor)
  clock: number | null // segundos que le quedan al que mueve tras su jugada
}

const PH: Phase[] = ['apertura', 'medio', 'final']
const zero = () => ({ apertura: 0, medio: 0, final: 0 })

export type OpeningErr = { i: number; san: string; best: string; bestSan: string; loss: number }

export type GameStats = {
  v: 3
  /** Primeras 24 jugadas (SAN inglesa) y tus errores en ellas, para «Mi apertura». */
  open: { path: string[]; errs: OpeningErr[] }
  moves: Record<Phase, number>
  loss: Record<Phase, number>
  blunders: Record<Phase, number>
  mistakes: Record<Phase, number>
  inaccuracies: Record<Phase, number>
  accuracy: number
  blunderKinds: { toAttacked: number; ignoredThreat: number; allowsCheck: number; quiet: number; uncovers: number }
  hung: Record<string, number>
  firstBlunderMove: number | null
  maxWin: number
  hadWinning: boolean
  endgameEntry: 'ganando' | 'igualado' | 'perdiendo' | null
  oppBlunders: number
  punished: number
  mated: boolean
  matedHomeRank: boolean
  forkE4: boolean
  pinG5: boolean
  stalemateWhileWinning: boolean
  timeoutLoss: boolean
  timeoutLossWhileBetter: boolean
  timeTroubleBlunders: number
  hasClock: boolean
  bucket: string
  plies: number
  /** Resumen de la revisión completa (precisión tipo Lichess y jugadas por clase, tuyas). */
  review?: ReviewSummary
}

const CLK = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g

export function parseClocks(pgn: string): number[] {
  const out: number[] = []
  for (const m of pgn.matchAll(CLK)) out.push(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
  return out
}

export function loadGame(pgn: string) {
  const g = new Chess()
  g.loadPgn(pgn)
  return g
}

export function buildPlies(pgn: string, a: RawAnalysis): Ply[] {
  const g = loadGame(pgn)
  const hist = g.history({ verbose: true })
  const clocks = parseClocks(pgn)
  const b = new Chess()
  const out: Ply[] = []
  hist.forEach((m, i) => {
    const fenBefore = b.fen()
    const npm = nonPawnMaterial(b)
    b.move(m.san)
    const sign = m.color === 'w' ? 1 : -1
    const evB = (a.evals[i] ?? 0) * sign
    const evA = (a.evals[i + 1] ?? a.evals[i] ?? 0) * sign
    const wB = winPct(evB)
    const wA = winPct(evA)
    const mB = Math.abs(evB) >= 9000 ? Math.sign(evB) * Math.round((10000 - Math.abs(evB)) / 10) : null
    const mA = Math.abs(evA) >= 9000 ? Math.sign(evA) * Math.round((10000 - Math.abs(evA)) / 10) : null
    out.push({
      i, color: m.color, san: m.san, uci: m.from + m.to + (m.promotion ?? ''),
      fenBefore, fenAfter: b.fen(), npm, phase: phaseOf(i, npm),
      wpBefore: wB, wpAfter: wA, loss: Math.max(0, wB - wA),
      best: a.pv[i]?.[0] ?? null, pv: a.pv[i] ?? [], replyPv: a.pv[i + 1] ?? [],
      mateBefore: mB, mateAfter: mA, clock: clocks[i] ?? null,
    })
  })
  return out
}

function baseTime(tc: string | null) {
  if (!tc) return null
  const n = Number(tc.split('+')[0].split('/').pop())
  return Number.isFinite(n) && n > 0 ? n : null
}

function bucketOf(plies: Ply[], color: 'w' | 'b') {
  const s = plies.slice(0, 16).map((p) => p.san)
  if (color === 'w') {
    if (s[0] !== 'd4') return 'Blancas · otra 1ª jugada'
    const blk = s.filter((_, i) => i % 2 === 1)
    if (blk[0] === 'e5') return 'Blancas · 1...e5 (Englund)'
    if (blk.slice(0, 5).includes('c5')) return 'Blancas · ...c5 temprano'
    if (blk.slice(0, 6).includes('e5')) return 'Blancas · ...e5 temprano'
    if (blk.slice(0, 3).includes('d5')) return 'Blancas · ...d5 sin ruptura'
    return 'Blancas · fianchetto / otras'
  }
  if (!s[0]) return 'Negras · —'
  if (s[0] === 'e4' || s[0] === 'd4') return `Negras · 1.${s[0]} ${s[1] ?? ''}`.trim()
  return 'Negras · otras'
}

export function computeStats(game: GameRow, plies: Ply[]): GameStats {
  const me = game.color
  const st: GameStats = {
    v: 3, open: { path: plies.slice(0, 24).map((p) => p.san), errs: [] }, moves: zero(), loss: zero(), blunders: zero(), mistakes: zero(), inaccuracies: zero(), accuracy: 0,
    blunderKinds: { toAttacked: 0, ignoredThreat: 0, allowsCheck: 0, quiet: 0, uncovers: 0 },
    hung: {}, firstBlunderMove: null, maxWin: 0, hadWinning: false, endgameEntry: null, oppBlunders: 0, punished: 0,
    mated: false, matedHomeRank: false, forkE4: false, pinG5: false, stalemateWhileWinning: false,
    timeoutLoss: false, timeoutLossWhileBetter: false, timeTroubleBlunders: 0, hasClock: false,
    bucket: bucketOf(plies, me), plies: plies.length,
  }
  const base = baseTime(game.time_control)
  st.hasClock = plies.some((p) => p.clock !== null)
  let accSum = 0
  let myClock: number | null = base
  plies.forEach((p, k) => {
    if (p.color !== me) {
      if (p.loss >= 30 && plies[k + 1]) {
        st.oppBlunders++
        if (plies[k + 1].loss < 10) st.punished++
      }
      // ¿tenedor ...e4 contra alfil d3 y caballo f3?
      if (me === 'w' && k < 30 && !st.forkE4 && p.uci.slice(2, 4) === 'e4' && p.san[0] >= 'a' && p.san[0] <= 'h' && !p.san.includes('x')) {
        const g = new Chess(p.fenAfter)
        const ok = (['d3', 'f3'] as Square[]).every((sq) => {
          const x = g.get(sq)
          return x && x.color === 'w' && (x.type === 'n' || x.type === 'b')
        })
        if (ok) st.forkE4 = true
      }
      return
    }
    // jugada propia
    if (me === 'b' && k < 50 && !st.pinG5) {
      const g = new Chess(p.fenBefore)
      const n = g.get('f6'), bi = g.get('g5'), e = g.get('e4')
      if (n && n.type === 'n' && n.color === 'b' && bi && bi.type === 'b' && bi.color === 'w' && e && e.color === 'w') st.pinG5 = true
    }
    st.moves[p.phase]++
    st.loss[p.phase] += p.loss
    accSum += moveAccuracy(p.loss)
    st.maxWin = Math.max(st.maxWin, p.wpBefore)
    if (p.loss >= 30) {
      st.blunders[p.phase]++
      if (st.firstBlunderMove === null) st.firstBlunderMove = Math.floor(p.i / 2) + 1
      if (base && myClock !== null && myClock < base * 0.1) st.timeTroubleBlunders++
      const reply = p.replyPv[0]
      if (reply) {
        const after = new Chess(p.fenAfter)
        const r = uciToMove(reply)
        const target = after.get(r.to)
        if (target && target.color === me) {
          st.hung[target.type] = (st.hung[target.type] ?? 0) + 1
          if (r.to === p.uci.slice(2, 4)) st.blunderKinds.toAttacked++
          else {
            const before = new Chess(p.fenBefore)
            const enemy = me === 'w' ? 'b' : 'w'
            if (before.get(r.to) && before.attackers(r.to, enemy).length) st.blunderKinds.ignoredThreat++
            else st.blunderKinds.uncovers++
          }
        } else {
          const m = tryMove(after, r)
          if (m && m.san.includes('+')) st.blunderKinds.allowsCheck++
          else st.blunderKinds.quiet++
        }
      }
    } else if (p.loss >= 20) st.mistakes[p.phase]++
    else if (p.loss >= 10) st.inaccuracies[p.phase]++
    if (p.i < 24 && p.loss >= 8 && p.best && p.best !== p.uci) {
      const bm = tryMove(new Chess(p.fenBefore), uciToMove(p.best))
      if (bm) st.open.errs.push({ i: p.i, san: p.san, best: p.best, bestSan: bm.san, loss: Math.round(p.loss * 10) / 10 })
    }
    if (p.clock !== null) myClock = p.clock
  })
  const myMoves = PH.reduce((s, ph) => s + st.moves[ph], 0)
  st.accuracy = myMoves ? accSum / myMoves : 0
  st.hadWinning = st.maxWin >= 90
  const entry = plies.find((p) => p.npm <= 26)
  if (entry) {
    const myWp = entry.color === me ? entry.wpBefore : 100 - entry.wpBefore
    st.endgameEntry = myWp >= 75 ? 'ganando' : myWp <= 25 ? 'perdiendo' : 'igualado'
  }
  const last = plies[plies.length - 1]
  if (last) {
    const fin = new Chess(last.fenAfter)
    if (fin.isCheckmate() && fin.turn() === me) {
      st.mated = true
      const k = fin.board().flat().find((x) => x && x.type === 'k' && x.color === me)
      if (k) st.matedHomeRank = k.square[1] === (me === 'w' ? '1' : '8')
    }
    if (fin.isStalemate() && game.result === 'D' && st.hadWinning) st.stalemateWhileWinning = true
  }
  const term = (game.termination ?? '').toLowerCase()
  if (game.result === 'L' && (term.includes('tiempo') || term.includes('time'))) {
    st.timeoutLoss = true
    const mine = plies.filter((p) => p.color === me)
    const lm = mine[mine.length - 1]
    if (lm && lm.wpAfter >= 70) st.timeoutLossWhileBetter = true
  }
  return st
}

/* ------------------------------------------------------------------ */
/* Análisis con el motor en el navegador                                */

export async function analyzePgn(pgn: string, nodes: number, onPly?: (i: number, n: number) => void): Promise<RawAnalysis> {
  const g = loadGame(pgn)
  const hist = g.history({ verbose: true })
  const b = new Chess()
  const evals: number[] = []
  const pv: string[][] = []
  for (let i = 0; i <= hist.length; i++) {
    const white = b.turn() === 'w'
    if (b.isCheckmate()) {
      evals.push(white ? -10000 : 10000)
      pv.push([])
    } else if (b.isGameOver()) {
      evals.push(0)
      pv.push([])
    } else {
      const [l] = await engine.analyse(b.fen(), { nodes })
      const cp = l?.cp ?? 0
      evals.push(white ? cp : -cp)
      pv.push((l?.pv ?? []).slice(0, 4))
    }
    onPly?.(i, hist.length)
    if (i < hist.length) b.move(hist[i].san)
  }
  return { v: 1, evals, pv, eng: ENGINE_TAG }
}

/* ------------------------------------------------------------------ */
/* Ejercicios a partir de tus errores                                   */

export type Puzzle = {
  id: string
  fen: string
  color: 'w' | 'b'
  best: string
  bestSan: string
  accept: string[]
  played: string
  playedUci: string
  phase: Phase
  motif: 'tactica' | 'colgada' | 'amenaza' | 'defensa_mate' | 'mate'
  date: string
  moveNo: number
  prompt: string
  hint: string
  explain: string
  whyBad: string
  line: string
  reply: string | null
  refutation?: string[]
  bestPv?: string[]
  prev: string | null
  lossTxt: string
  game_ext_id?: string
}

export const MOTIF_LABEL: Record<Puzzle['motif'], string> = {
  tactica: 'Táctica no vista',
  colgada: 'Pieza colgada',
  amenaza: 'Amenaza ignorada',
  defensa_mate: 'Defensa contra mate',
  mate: 'Mate no visto',
}
const PROMPTS: Record<Puzzle['motif'], string> = {
  mate: 'Hay mate. Encuéntralo.',
  defensa_mate: 'Te amenazan mate. Encuentra la defensa.',
  tactica: 'Hay una táctica. Encuéntrala.',
  colgada: 'Encuentra la jugada segura.',
  amenaza: 'Encuentra la mejor jugada.',
}
const HINTS: Record<Puzzle['motif'], string> = {
  mate: 'Mira todos los jaques, también los que entregan material.',
  defensa_mate: '¿Qué casillas cerca de tu rey controla el rival? Cubre la de entrada o dale aire al rey.',
  tactica: 'Busca piezas rivales sin defender o dos objetivos a la vez.',
  colgada: '¿Qué ataca la última jugada del rival? ¿Qué quedaría sin defensa después de tu jugada?',
  amenaza: 'Primero responde a la amenaza del rival; después mejora tu peor pieza.',
}

export async function generatePuzzles(game: GameRow, plies: Ply[], max = 3): Promise<Puzzle[]> {
  const me = game.color
  const cands = plies
    .filter((p) => p.color === me && p.i >= 4 && p.loss >= 25 && p.wpBefore >= 40 && p.wpAfter <= 85 && p.best && p.best !== p.uci)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, max * 2)
  const out: Puzzle[] = []
  for (const p of cands) {
    if (out.length >= max) break
    const lines = await engine.analyse(p.fenBefore, { nodes: 400000, multipv: 3 })
    if (!lines.length) continue
    const sc = lines.map((l) => ({ u: l.pv[0], w: winPct(l.cp), l }))
    const bestW = sc[0].w
    if (bestW < 55) continue
    const accept = sc.filter((x) => bestW - x.w <= 4).map((x) => x.u)
    if (accept.length > 2 || accept.includes(p.uci)) continue
    const best = sc[0].l
    const bestMove = tryMove(new Chess(p.fenBefore), uciToMove(best.pv[0]))
    if (!bestMove) continue
    const after = new Chess(p.fenAfter)
    const reply = p.replyPv[0] ?? null
    let motif: Puzzle['motif']
    if (best.mate !== null && best.mate > 0 && best.mate <= 3) motif = 'mate'
    else if (p.mateAfter !== null && p.mateAfter < 0) motif = 'defensa_mate'
    else if (bestMove.captured || bestMove.san.includes('+')) motif = 'tactica'
    else if (reply && after.get(uciToMove(reply).to)?.color === me) motif = 'colgada'
    else motif = 'amenaza'
    // ganancia de material de la línea buena
    const gb = new Chess(p.fenBefore)
    const m0 = material(gb, me)
    for (const u of best.pv.slice(0, 6)) if (!tryMove(gb, uciToMove(u))) break
    const gain = material(gb, me) - m0
    let explain: string
    if (best.mate !== null && best.mate > 0) explain = `${es(bestMove.san)} lleva a mate en ${best.mate}.`
    else if (gain >= 2) explain = `${es(bestMove.san)} gana material: unos ${gain} puntos tras la secuencia.`
    else if (motif === 'defensa_mate') explain = `${es(bestMove.san)} para la amenaza de mate.`
    else explain = `${es(bestMove.san)} mantiene la posición sana: es la única jugada que no pierde ventaja.`
    let whyBad = 'Esa jugada empeora mucho tu posición.'
    if (reply) {
      const r = uciToMove(reply)
      const target = after.get(r.to)
      const rm = tryMove(new Chess(p.fenAfter), r)
      const rs = rm ? es(rm.san) : reply
      if (p.mateAfter !== null && p.mateAfter < 0) whyBad = `Tras ${es(p.san)} el rival tiene mate empezando por ${rs}.`
      else if (target && target.color === me) whyBad = `Tras ${es(p.san)} el rival responde ${rs} y se lleva ${PIECE_NAME[target.type]}.`
      else {
        const gc = new Chess(p.fenAfter)
        const m1 = material(gc, me)
        for (const u of p.replyPv.slice(0, 5)) if (!tryMove(gc, uciToMove(u))) break
        const d = material(gc, me) - m1
        whyBad = `Tras ${es(p.san)} el rival juega ${rs}` + (d <= -2 ? ` y gana unos ${-d} puntos de material.` : ' y tu posición empeora mucho.')
      }
    }
    out.push({
      id: `${game.ext_id}#${p.i}`,
      fen: p.fenBefore, color: me, best: best.pv[0], bestSan: es(bestMove.san), accept,
      played: es(p.san), playedUci: p.uci, phase: p.phase, motif,
      date: game.played_at.slice(0, 10).replace(/-/g, '/'), moveNo: Math.floor(p.i / 2) + 1,
      prompt: PROMPTS[motif], hint: HINTS[motif], explain, whyBad,
      line: pvToSan(p.fenBefore, best.pv, 6), reply: best.pv[1] ?? null,
      refutation: p.replyPv.slice(0, 3), bestPv: best.pv.slice(0, 5),
      prev: p.i > 0 ? plies[p.i - 1].uci : null,
      lossTxt: `tu probabilidad de ganar bajó ${Math.round(p.loss)} puntos`,
      game_ext_id: game.ext_id,
    })
  }
  return out
}
