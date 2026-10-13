import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color } from 'chess.js'
import { ArrowCounterClockwise, ArrowLeft, ArrowSquareOut, CaretLeft, CaretRight, Lightning, Play, SkipBack, SkipForward } from '@phosphor-icons/react'
import Board, { type Arrow, type Mark, type MoveInput } from '../board/Board'
import { sfx } from '../board/sounds'
import { Coach, EvalBar, Progress } from '../components/ui'
import { ClsIcon } from '../components/ClsIcon'
import type { GameRow, RawAnalysis } from '../analysis/core'
import {
  CLS_META, CLS_ORDER, KEY_CLS, classifyTry, deepAnalyze, fmtEval, isDeep, loadBook, phaseCls, reviewGame, reviewSummary, textOf, wpWhite,
  type Book, type Cls, type Review, type RPly,
} from '../analysis/review'
import { engine, type EngineLine } from '../engine/engine'
import { es, PHASE_LABEL, pvToSan, START_FEN, tryMove, uciToMove, type Phase } from '../lib/chess-utils'
import { db } from '../lib/db'
import { useStore } from '../lib/store'
import { getNodes } from '../lib/sync'
import { go } from '../lib/router'

type Full = GameRow & { id: string; analysis: RawAnalysis }
type Tab = 'resumen' | 'jugadas' | 'analizar'
type LineView = { title: string; fens: string[]; moves: { from: string; to: string; san: string }[]; k: number }
type Retry = { i: number; fen: string | null; last: [string, string] | null; result: { cls: Cls; text: string } | null; thinking: boolean }

const GOOD: Cls[] = ['brilliant', 'great', 'best', 'excellent']
const BAD: Cls[] = ['mistake', 'blunder', 'miss']
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const moveLabel = (p: RPly) => `${p.n}${p.color === 'w' ? '.' : '...'} ${es(p.san)}`
const baseTimeOf = (tc: string | null) => {
  const n = Number((tc ?? '').split('+')[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Juega una lista UCI desde una FEN y devuelve las posiciones intermedias. */
function playLine(fen: string, uci: string[], max = 10): Pick<LineView, 'fens' | 'moves'> {
  const g = new Chess(fen)
  const fens = [fen]
  const moves: LineView['moves'] = []
  for (const u of uci.slice(0, max)) {
    const m = tryMove(g, uciToMove(u))
    if (!m) break
    fens.push(g.fen())
    moves.push({ from: m.from, to: m.to, san: m.san })
  }
  return { fens, moves }
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
/** Piezas que ha capturado cada bando y la ventaja de material. */
function captured(fen: string) {
  const left: Record<Color, Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } }
  for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type !== 'k') left[p.color][p.type]++
  const took = (by: Color) => {
    const vic: Color = by === 'w' ? 'b' : 'w'
    const out: string[] = []
    for (const t of ['q', 'r', 'b', 'n', 'p']) for (let k = 0; k < Math.max(0, START_COUNT[t] - left[vic][t]); k++) out.push(vic + t)
    return out
  }
  const mat = (c: Color) => Object.entries(left[c]).reduce((s, [t, n]) => s + VALUE[t] * n, 0)
  return { w: took('w'), b: took('b'), diff: mat('w') - mat('b') }
}

export function GameReview({ id }: { id: string }) {
  const store = useStore()
  const [game, setGame] = useState<Full | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [analysis, setAnalysis] = useState<RawAnalysis | null>(null)
  const [deepProg, setDeepProg] = useState<{ done: number; total: number } | null>(null)
  const [deepErr, setDeepErr] = useState<string | null>(null)
  const [i, setI] = useState(0)
  const [tab, setTab] = useState<Tab>('resumen')
  const [onlyMine, setOnlyMine] = useState(true)
  const [showBest, setShowBest] = useState(true)
  const [line, setLine] = useState<LineView | null>(null)
  const [retry, setRetry] = useState<Retry | null>(null)
  const ctl = useRef<{ cancelled?: boolean; paused?: boolean }>({})

  useEffect(() => {
    db.gameFull(id).then((g) => { setGame(g); setAnalysis(g.analysis) }).catch((e) => setErr(e.message))
    loadBook().then(setBook).catch(() => setBook({ keys: new Set(), names: new Map() }))
  }, [id])

  // revisión completa con MultiPV 2 si la partida aún no la tiene
  useEffect(() => {
    if (!game || !analysis || isDeep(analysis)) return
    const c = { cancelled: false, paused: false }
    ctl.current = c
    setDeepProg({ done: 0, total: 1 })
    setDeepErr(null)
    deepAnalyze(game.pgn, Math.max(getNodes(), 150000), (k, n) => setDeepProg({ done: k, total: n }), c)
      .then(async (res) => {
        if (!res || c.cancelled) return
        setAnalysis(res)
        setDeepProg(null)
        const b = await loadBook()
        const summary = reviewSummary(reviewGame(game.pgn, game.color, res, b), game.color)
        const stats = game.stats ? { ...game.stats, review: summary } : null
        try {
          await db.saveAnalysis(game.id, res, stats)
          if (stats) store.patchGame(game.id, { stats, eng: res.eng ?? null })
        } catch {
          /* se queda en esta sesión; se repetirá al volver a abrirla */
        }
      })
      .catch((e) => { if (!c.cancelled) { setDeepErr((e as Error).message); setDeepProg(null) } })
    return () => { c.cancelled = true }
  }, [game, analysis]) // eslint-disable-line react-hooks/exhaustive-deps

  // el análisis de fondo se pausa mientras usas el motor para otra cosa
  useEffect(() => { ctl.current.paused = tab === 'analizar' || !!retry }, [tab, retry])

  const review: Review | null = useMemo(
    () => (game && analysis && book ? reviewGame(game.pgn, game.color, analysis, book, baseTimeOf(game.time_control)) : null),
    [game, analysis, book],
  )
  const plies = review?.plies ?? []
  const n = plies.length

  // análisis libre
  const [anal, setAnal] = useState<{ fens: string[]; moves: LineView['moves']; k: number }>({ fens: [START_FEN], moves: [], k: 0 })
  const [engLines, setEngLines] = useState<EngineLine[]>([])
  const [engBusy, setEngBusy] = useState(false)
  const token = useRef(0)
  const analFen = anal.fens[anal.k]
  useEffect(() => {
    if (tab !== 'analizar') return
    const t = ++token.current
    engine.clear()
    setEngBusy(true)
    const run = async () => {
      try {
        for (const nodes of [60000, 500000]) {
          const ls = await engine.analyse(analFen, { nodes, multipv: 3 })
          if (t !== token.current) return
          setEngLines(ls)
        }
      } catch { /* sustituida por una búsqueda más nueva */ }
      if (t === token.current) setEngBusy(false)
    }
    void run()
  }, [tab, analFen])
  const startAnalysis = () => {
    const fen = i > 0 ? plies[i - 1].fenAfter : START_FEN
    setAnal({ fens: [fen], moves: [], k: 0 })
    setEngLines([])
    setLine(null)
    setRetry(null)
    setTab('analizar')
  }
  const analMove = (m: MoveInput) => {
    const g = new Chess(analFen)
    const mv = tryMove(g, m)
    if (!mv) return
    sfx.forSan(mv.san)
    setAnal((a) => ({ fens: [...a.fens.slice(0, a.k + 1), g.fen()], moves: [...a.moves.slice(0, a.k), { from: mv.from, to: mv.to, san: mv.san }], k: a.k + 1 }))
  }

  // teclado: la línea, el análisis libre o la partida
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      const step = (x: number, max: number) => (e.key === 'ArrowRight' ? Math.min(x + 1, max) : e.key === 'ArrowLeft' ? Math.max(x - 1, 0) : e.key === 'Home' ? 0 : max)
      if (line) setLine((l) => l && { ...l, k: step(l.k, l.moves.length) })
      else if (tab === 'analizar') setAnal((a) => ({ ...a, k: step(a.k, a.fens.length - 1) }))
      else if (!retry) { setI((x) => step(x, n)); if (tab === 'resumen') setTab('jugadas') }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [line, tab, retry, n])

  // sonido y lista siempre a la vista
  const movesBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (i > 0 && plies[i - 1] && !line) sfx.forSan(plies[i - 1].san)
    const box = movesBox.current
    const cur = box?.querySelector<HTMLElement>('button.cur')
    if (box && cur) {
      const top = cur.offsetTop
      if (top < box.scrollTop + 4 || top > box.scrollTop + box.clientHeight - 36) box.scrollTop = Math.max(0, top - box.clientHeight / 2)
    } else if (box && i === 0) box.scrollTop = 0
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (line && line.k > 0) sfx.forSan(line.moves[line.k - 1].san)
  }, [line?.k]) // eslint-disable-line react-hooks/exhaustive-deps

  // reproducción automática de una línea
  const auto = useRef<number>()
  const openLine = (l: Omit<LineView, 'k'>) => {
    window.clearInterval(auto.current)
    setLine({ ...l, k: 0 })
    let k = 0
    auto.current = window.setInterval(() => {
      k++
      if (k > l.moves.length) { window.clearInterval(auto.current); return }
      setLine((cur) => (cur && cur.fens === l.fens ? { ...cur, k } : cur))
    }, 850)
  }
  useEffect(() => () => window.clearInterval(auto.current), [])
  const closeLine = () => { window.clearInterval(auto.current); setLine(null) }

  if (err) return <div className="banner err">No se pudo abrir la partida: {err}</div>
  if (!game || !review) return (
    <div className="page" aria-busy="true" aria-label="Cargando partida">
      <span className="sk" style={{ width: 240, height: 32 }} />
      <div className="train"><span className="sk" style={{ aspectRatio: '1 / 1' }} /><span className="sk" style={{ height: 320 }} /></div>
    </div>
  )

  const me = game.color
  const them: Color = me === 'w' ? 'b' : 'w'
  const ply = i > 0 ? plies[i - 1] : null
  const keys = review.keys.filter((k) => !onlyMine || plies[k].color === me)
  const goPly = (k: number) => { closeLine(); setRetry(null); setI(k); if (tab !== 'jugadas') setTab('jugadas') }
  const nextKey = (dir: 1 | -1) => {
    const curIdx = i - 1
    const k = dir > 0 ? keys.find((x) => x > curIdx) : [...keys].reverse().find((x) => x < curIdx)
    if (k !== undefined) goPly(k + 1)
  }

  // ---------- lo que muestra el tablero ----------
  let fen = START_FEN
  let last: [string, string] | null = null
  let arrows: Arrow[] = []
  let marks: Mark[] = []
  let interactive = false
  let onMove: ((m: MoveInput) => void) | undefined
  let evalCp: number | null = review.plies.length ? (analysis?.evals[i] ?? 0) : 0
  if (line) {
    fen = line.fens[line.k]
    const m = line.moves[line.k - 1]
    if (m) { last = [m.from, m.to]; arrows = [{ from: m.from, to: m.to, color: 'blue' }] }
  } else if (retry) {
    const p = plies[retry.i]
    fen = retry.fen ?? p.fenBefore
    last = retry.last ?? (retry.i > 0 ? [plies[retry.i - 1].uci.slice(0, 2), plies[retry.i - 1].uci.slice(2, 4)] : null)
    interactive = !retry.fen && !retry.thinking
    if (retry.result && retry.last) marks = [{ sq: retry.last[1], icon: <ClsIcon cls={retry.result.cls} size={26} title={false} /> }]
    onMove = (m) => void tryRetry(m)
    evalCp = analysis?.evals[retry.i] ?? 0
  } else if (tab === 'analizar') {
    fen = analFen
    const m = anal.moves[anal.k - 1]
    if (m) last = [m.from, m.to]
    interactive = true
    onMove = analMove
    const top = engLines[0]
    if (top) {
      const white = new Chess(fen).turn() === 'w'
      evalCp = white ? top.cp : -top.cp
      engLines.slice(0, 2).forEach((l, k) => { const u = l.pv[0]; if (u) arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), color: k === 0 ? 'green' : 'blue', dashed: k > 0 }) })
    }
  } else if (ply) {
    fen = ply.fenAfter
    last = [ply.uci.slice(0, 2), ply.uci.slice(2, 4)]
    marks = [{ sq: ply.uci.slice(2, 4), icon: <ClsIcon cls={ply.cls} size={26} title={false} /> }]
    if (showBest && ply.best && ply.bestSan !== ply.san && !GOOD.includes(ply.cls) && ply.cls !== 'book' && ply.cls !== 'forced') {
      const b = uciToMove(ply.best)
      arrows = [{ from: b.from, to: b.to, color: 'green' }]
    }
  }

  async function tryRetry(m: MoveInput) {
    if (!retry) return
    const p = plies[retry.i]
    const g = new Chess(p.fenBefore)
    const mv = tryMove(g, m)
    if (!mv) return
    sfx.forSan(mv.san)
    const uci = mv.from + mv.to + (mv.promotion ?? '')
    const lastSq: [string, string] = [mv.from, mv.to]
    const isBest = !!p.best && p.best.slice(0, 4) === uci.slice(0, 4)
    if (isBest || uci === p.uci) {
      const cls = isBest ? 'best' : p.cls
      setRetry({ ...retry, fen: g.fen(), last: lastSq, thinking: false, result: { cls, text: isBest ? `¡Exacto! ${es(mv.san)} era la mejor jugada.` : 'Es la misma jugada de la partida. Prueba otra.' } })
      isBest ? sfx.good() : sfx.bad()
      return
    }
    setRetry({ ...retry, fen: g.fen(), last: lastSq, thinking: true, result: null })
    try {
      const [l] = await engine.analyse(g.fen(), { nodes: 250000 })
      const sign = p.color === 'w' ? 1 : -1
      const cpWhite = g.turn() === 'w' ? (l?.cp ?? 0) : -(l?.cp ?? 0)
      const wpA = wpWhite(cpWhite * sign)
      const cls = classifyTry(p.wpBefore, wpA, false)
      const betterThanGame = p.wpBefore - wpA < p.loss - 1
      const text = GOOD.includes(cls) ? `¡Bien! ${es(mv.san)} también funciona.`
        : cls === 'good' ? `${es(mv.san)} es correcta${betterThanGame ? ' y mejor que lo que jugaste' : ''}, aunque ${p.bestSan ? es(p.bestSan) : 'otra'} era más precisa.`
          : `${es(mv.san)} ${CLS_META[cls].is}${betterThanGame ? ', aunque mejor que lo que jugaste' : ''}. Prueba otra o mira la mejor.`
      GOOD.includes(cls) || cls === 'good' ? sfx.good() : sfx.bad()
      setRetry((r) => r && { ...r, thinking: false, result: { cls, text } })
    } catch {
      setRetry((r) => r && { ...r, thinking: false, result: { cls: 'good', text: 'El motor está ocupado. Prueba de nuevo en un momento.' } })
    }
  }

  const cap = captured(fen)
  const orient = me
  const bar = (c: Color) => {
    const p = review.players[c]
    const adv = c === 'w' ? cap.diff : -cap.diff
    return (
      <div className="pbar">
        <span className={`sw-dot ${c}`} aria-hidden="true" />
        <span className="pname">{p.name}</span>
        {p.elo && <span className="meta num">({p.elo})</span>}
        <span className="caps" aria-label="Piezas capturadas">{cap[c].map((code, k) => <i key={k} className={`pc-${code}`} />)}</span>
        {adv > 0 && <span className="meta num">+{adv}</span>}
        <span className="pacc num" title="Precisión">{review.acc[c].toFixed(1).replace('.', ',')}</span>
      </div>
    )
  }

  return (
    <div className="page review">
      <div className="page-head">
        <div>
          <button type="button" className="back" onClick={() => go('partidas')}><ArrowLeft size={16} />Partidas</button>
          <h1>Revisión de la partida</h1>
          <p className="lead">{game.color === 'w' ? 'Blancas' : 'Negras'}, {game.result === 'W' ? 'victoria' : game.result === 'L' ? 'derrota' : 'tablas'} · {new Date(game.played_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })} · {game.termination}</p>
        </div>
        {game.ext_id.startsWith('http') && <a className="btn" href={game.ext_id} target="_blank" rel="noreferrer">Ver en Chess.com<ArrowSquareOut size={16} /></a>}
      </div>
      <div className="train">
        <div>
          {bar(them)}
          <div className="board-col">
            <EvalBar cpWhite={evalCp} orientation={orient} />
            <Board fen={fen} orientation={orient} lastMove={last} arrows={arrows} marks={marks} interactive={interactive} onMove={onMove} />
          </div>
          {bar(me)}
          {line ? (
            <div className="navbar" role="group" aria-label="Moverse por la línea">
              <button type="button" className="btn" onClick={() => { window.clearInterval(auto.current); setLine({ ...line, k: 0 }) }} aria-label="Inicio de la línea"><SkipBack size={18} weight="fill" /></button>
              <button type="button" className="btn" onClick={() => { window.clearInterval(auto.current); setLine({ ...line, k: Math.max(0, line.k - 1) }) }} aria-label="Jugada anterior de la línea"><CaretLeft size={20} weight="bold" /></button>
              <button type="button" className="btn" onClick={() => { window.clearInterval(auto.current); setLine({ ...line, k: Math.min(line.moves.length, line.k + 1) }) }} aria-label="Jugada siguiente de la línea"><CaretRight size={20} weight="bold" /></button>
              <button type="button" className="btn" onClick={closeLine}>Volver</button>
              <span className="meta mono num counter">{line.k}/{line.moves.length}</span>
            </div>
          ) : tab === 'analizar' ? (
            <div className="navbar" role="group" aria-label="Moverse por el análisis">
              <button type="button" className="btn" onClick={() => setAnal({ ...anal, k: 0 })} aria-label="Posición de partida"><SkipBack size={18} weight="fill" /></button>
              <button type="button" className="btn" onClick={() => setAnal({ ...anal, k: Math.max(0, anal.k - 1) })} aria-label="Jugada anterior"><CaretLeft size={20} weight="bold" /></button>
              <button type="button" className="btn" onClick={() => setAnal({ ...anal, k: Math.min(anal.fens.length - 1, anal.k + 1) })} aria-label="Jugada siguiente"><CaretRight size={20} weight="bold" /></button>
              <button type="button" className="btn" onClick={() => setTab('jugadas')}>Volver</button>
              <span className="meta mono num counter">{anal.k}/{anal.fens.length - 1}</span>
            </div>
          ) : (
            <div className="navbar" role="group" aria-label="Moverse por la partida">
              <button type="button" className="btn" onClick={() => goPly(0)} aria-label="Ir al inicio" title="Inicio"><SkipBack size={18} weight="fill" /></button>
              <button type="button" className="btn" onClick={() => goPly(Math.max(0, i - 1))} aria-label="Jugada anterior" title="Anterior (←)"><CaretLeft size={20} weight="bold" /></button>
              <button type="button" className="btn" onClick={() => goPly(Math.min(n, i + 1))} aria-label="Jugada siguiente" title="Siguiente (→)"><CaretRight size={20} weight="bold" /></button>
              <button type="button" className="btn" onClick={() => goPly(n)} aria-label="Ir al final" title="Final"><SkipForward size={18} weight="fill" /></button>
              <span className="meta mono num counter">{i}/{n}</span>
            </div>
          )}
          <EvalGraph review={review} evals={analysis?.evals ?? []} me={me} cur={i} onPick={goPly} />
        </div>

        <div className="side">
          <div className="seg tabs" role="tablist" aria-label="Revisión">
            {(['resumen', 'jugadas', 'analizar'] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t}
                onClick={() => { closeLine(); setRetry(null); if (t === 'analizar') startAnalysis(); else { setTab(t); if (t === 'jugadas' && i === 0) setI(1) } }}>
                {t === 'resumen' ? 'Resumen' : t === 'jugadas' ? 'Jugadas' : 'Analizar'}
              </button>
            ))}
          </div>
          {deepProg && (
            <div className="well stack tight" role="status">
              <span className="sec">{deepProg.total > 1 ? `Revisión completa con Stockfish 17: posición ${deepProg.done} de ${deepProg.total}` : 'Preparando la revisión completa…'}</span>
              <Progress value={(100 * deepProg.done) / Math.max(1, deepProg.total)} />
              <span className="meta">Mientras tanto, la clasificación es provisional (sin «Gran jugada»).</span>
            </div>
          )}
          {deepErr && <div className="banner err">No se pudo completar la revisión ({deepErr}). Recarga para reintentarlo.</div>}

          {tab === 'resumen' && <Summary review={review} me={me} onPick={(k) => goPly(k + 1)} onStart={() => goPly(1)} />}

          {tab === 'jugadas' && (
            <>
              {line ? (
                <div className="well stack tight">
                  <span className="sec" style={{ fontWeight: 500 }}>{line.title}</span>
                  <span className="mono sec">{line.moves.map((m, k) => <button key={k} type="button" className={`lmove${k === line.k - 1 ? ' cur' : ''}`} onClick={() => { window.clearInterval(auto.current); setLine({ ...line, k: k + 1 }) }}>{es(m.san)}</button>)}</span>
                </div>
              ) : retry ? (
                <RetryCard p={plies[retry.i]} retry={retry}
                  onAgain={() => setRetry({ ...retry, fen: null, last: null, result: null })}
                  onBest={() => { const p = plies[retry.i]; setRetry(null); openLine({ title: `La mejor: ${p.bestSan ? es(p.bestSan) : ''}`, ...playLine(p.fenBefore, p.pv, 8) }) }}
                  onBack={() => setRetry(null)} />
              ) : ply ? (
                <MoveCard review={review} p={ply} me={me}
                  onBest={() => openLine({ title: `La mejor en su lugar: ${ply.bestSan ? es(ply.bestSan) : ''}`, ...playLine(ply.fenBefore, ply.pv, 8) })}
                  onFollow={() => openLine({ title: 'Lo que viene después', ...playLine(ply.fenAfter, ply.replyPv, 8) })}
                  onRetry={() => setRetry({ i: ply.i, fen: null, last: null, result: null, thinking: false })} />
              ) : (
                <Coach title="Revisión de la partida">Pulsa una jugada, usa las flechas <kbd>←</kbd> <kbd>→</kbd> o salta entre los momentos clave.</Coach>
              )}
              <div className="keynav">
                <button type="button" className="btn icon" onClick={() => nextKey(-1)} aria-label="Momento clave anterior" disabled={!keys.length}><CaretLeft size={18} weight="bold" /></button>
                <span className="sec">Momentos clave <span className="meta num">({keys.length})</span></span>
                <button type="button" className="btn icon" onClick={() => nextKey(1)} aria-label="Momento clave siguiente" disabled={!keys.length}><CaretRight size={18} weight="bold" /></button>
                <div className="seg sm" role="group" aria-label="De quién">
                  <button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>Míos</button>
                  <button type="button" aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>Todos</button>
                </div>
              </div>
              <div className="moves rmoves" ref={movesBox}>
                {Array.from({ length: Math.ceil(n / 2) }, (_, k) => (
                  <MoveRow key={k} k={k} plies={plies} cur={i} onPick={goPly} />
                ))}
              </div>
              <label className="check"><input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> Flecha con la mejor jugada</label>
            </>
          )}

          {tab === 'analizar' && (
            <div className="stack">
              <Coach title="Análisis libre">Mueve piezas en el tablero: el motor evalúa cada posición. Las flechas muestran las dos mejores jugadas.</Coach>
              <div className="card pad-s stack tight" aria-live="polite">
                <div className="row between"><span className="sec" style={{ fontWeight: 500 }}>Stockfish 17</span><span className="meta">{engBusy ? 'pensando…' : 'listo'}</span></div>
                {engLines.length ? (
                  <div className="englines">
                    {engLines.map((l, k) => {
                      const white = new Chess(analFen).turn() === 'w'
                      const cpW = white ? l.cp : -l.cp
                      return (
                        <button key={k} type="button" className="engline" onClick={() => { const u = l.pv[0]; if (u) analMove(uciToMove(u)) }}>
                          <span className={`evchip ${cpW >= 0 ? 'w' : 'b'}`}>{fmtEval(cpW)}</span>
                          <span className="mono sec">{pvToSan(analFen, l.pv, 8)}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : <span className="sk" style={{ height: 96 }} />}
              </div>
              {anal.moves.length > 0 && (
                <nav className="crumbs" aria-label="Jugadas del análisis">
                  <button type="button" onClick={() => setAnal({ ...anal, k: 0 })}>Inicio</button>
                  {anal.moves.map((m, k) => <button key={k} type="button" className={k === anal.k - 1 ? 'cur' : ''} onClick={() => setAnal({ ...anal, k: k + 1 })}>{es(m.san)}</button>)}
                </nav>
              )}
              <div className="row">
                <button type="button" className="btn" onClick={startAnalysis}><ArrowCounterClockwise size={18} />Desde la posición de la partida</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Summary({ review, me, onPick, onStart }: { review: Review; me: Color; onPick: (k: number) => void; onStart: () => void }) {
  const cols: Color[] = ['w', 'b']
  const first = (c: Color, cls: Cls) => review.plies.find((p) => p.color === c && p.cls === cls)
  return (
    <div className="stack">
      <div className="card stack tight">
        <h2 className="h3">{review.headline}</h2>
        <p className="sec muted">{review.summary}</p>
      </div>
      <div className="card pad-s">
        <div className="acc-row">
          {cols.map((c) => (
            <div key={c} className={`acc-box${c === me ? ' me' : ''}`}>
              <span className="meta">{review.players[c].name}{c === me ? ' (tú)' : ''}</span>
              <span className="acc-big num">{review.acc[c].toFixed(1).replace('.', ',')}</span>
              <span className="meta">Precisión</span>
            </div>
          ))}
        </div>
        <table className="t cls-table">
          <thead><tr><th>Jugadas</th><th className="num">Blancas</th><th className="num">Negras</th></tr></thead>
          <tbody>
            {CLS_ORDER.map((cls) => (
              <tr key={cls}>
                <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><ClsIcon cls={cls} size={20} /><span style={{ color: review.counts.w[cls] + review.counts.b[cls] ? undefined : 'var(--muted)' }}>{CLS_META[cls].label}</span></span></td>
                {cols.map((c) => {
                  const v = review.counts[c][cls]
                  const p = first(c, cls)
                  return (
                    <td key={c} className="num">
                      {v && p ? <button type="button" className="count-btn" style={{ color: CLS_META[cls].color }} onClick={() => onPick(p.i)} aria-label={`${v} ${CLS_META[cls].label} de ${c === 'w' ? 'blancas' : 'negras'}: ir a la primera`}>{v}</button> : <span className="dim">0</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card pad-s stack tight">
        <span className="sec" style={{ fontWeight: 500 }}>Por fases</span>
        <table className="t phase-table">
          <tbody>
            {(['apertura', 'medio', 'final'] as Phase[]).map((ph) => (
              <tr key={ph}>
                <td>{PHASE_LABEL[ph]}</td>
                {cols.map((c) => {
                  const a = review.phases[c][ph]
                  return <td key={c}>{a === undefined ? <span className="dim">-</span> : <span className="row" style={{ gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' }}><ClsIcon cls={phaseCls(a)} size={18} /><span className="num">{Math.round(a)}</span></span>}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {review.opening && <span className="meta">Apertura: {review.opening}</span>}
      </div>
      <div><button type="button" className="btn primary big" onClick={onStart}><Play size={18} weight="fill" />Empezar revisión</button></div>
    </div>
  )
}

function MoveCard({ review, p, me, onBest, onFollow, onRetry }: { review: Review; p: RPly; me: Color; onBest: () => void; onFollow: () => void; onRetry: () => void }) {
  const meta = CLS_META[p.cls]
  const kind = GOOD.includes(p.cls) ? 'good' : BAD.includes(p.cls) ? 'bad' : 'info'
  const canRetry = p.color === me && ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(p.cls)
  return (
    <div className="stack tight">
      <Coach kind={kind} title={<span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><ClsIcon cls={p.cls} size={22} /><span>{moveLabel(p)} {meta.is}</span></span>}>
        <div>{textOf(review, p.i)}</div>
        <div className="row meta" style={{ marginTop: 6, gap: 12 }}>
          <span className="num">Evaluación {fmtEval(p.evAfter)}</span>
          <span>{PHASE_LABEL[p.phase]}</span>
          {p.clock !== null && <span className="num">Reloj {fmtClock(p.clock)}{p.spent !== null ? ` · pensó ${Math.round(p.spent)} s` : ''}</span>}
        </div>
      </Coach>
      <div className="row">
        {p.best && p.bestSan && p.bestSan !== p.san && <button type="button" className="btn sm" onClick={onBest}><Lightning size={16} />Ver la mejor ({es(p.bestSan)})</button>}
        {p.replyPv.length > 0 && <button type="button" className="btn sm" onClick={onFollow}><Play size={16} />Ver continuación</button>}
        {canRetry && <button type="button" className="btn sm primary" onClick={onRetry}><ArrowCounterClockwise size={16} />Reintentar</button>}
      </div>
    </div>
  )
}

function RetryCard({ p, retry, onAgain, onBest, onBack }: { p: RPly; retry: Retry; onAgain: () => void; onBest: () => void; onBack: () => void }) {
  return (
    <div className="stack tight">
      {retry.result ? (
        <Coach kind={GOOD.includes(retry.result.cls) ? 'good' : retry.result.cls === 'good' ? 'info' : 'bad'} title={<span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><ClsIcon cls={retry.result.cls} size={22} /><span>{CLS_META[retry.result.cls].label}</span></span>}>{retry.result.text}</Coach>
      ) : (
        <Coach title={`Reintenta ${p.n}${p.color === 'w' ? '.' : '...'}`}>{retry.thinking ? 'El motor está evaluando tu jugada…' : `En la partida jugaste ${es(p.san)}. Busca algo mejor y muévelo en el tablero.`}</Coach>
      )}
      <div className="row">
        {retry.result && <button type="button" className="btn sm primary" onClick={onAgain}><ArrowCounterClockwise size={16} />Probar otra</button>}
        <button type="button" className="btn sm" onClick={onBest}><Lightning size={16} />Ver la mejor</button>
        <button type="button" className="btn sm ghost" onClick={onBack}>Volver a la partida</button>
      </div>
    </div>
  )
}

function MoveRow({ k, plies, cur, onPick }: { k: number; plies: RPly[]; cur: number; onPick: (n: number) => void }) {
  const cell = (idx: number) => {
    const p = plies[idx]
    if (!p) return <span />
    return (
      <button type="button" className={cur === idx + 1 ? 'cur' : ''} onClick={() => onPick(idx + 1)} aria-label={`${moveLabel(p)}, ${CLS_META[p.cls].label}`}>
        <ClsIcon cls={p.cls} size={16} title={false} />{es(p.san)}
      </button>
    )
  }
  return (<><span className="n">{k + 1}.</span>{cell(2 * k)}{cell(2 * k + 1)}</>)
}

function EvalGraph({ review, evals, me, cur, onPick }: { review: Review; evals: number[]; me: Color; cur: number; onPick: (n: number) => void }) {
  const W = 620, H = 96
  if (evals.length < 2) return null
  const n = evals.length - 1
  const x = (k: number) => (k / n) * W
  const y = (cp: number) => {
    const w = wpWhite(cp) / 100
    return me === 'w' ? H - w * H : w * H
  }
  const pts = evals.map((e, k) => `${x(k)},${y(e)}`).join(' ')
  return (
    <svg className="chart evalgraph" viewBox={`0 0 ${W} ${H}`} style={{ background: me === 'w' ? '#2a2d33' : '#eef0ee' }}
      onClick={(e) => {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect()
        onPick(Math.round(((e.clientX - r.left) / r.width) * n))
      }} role="img" aria-label="Gráfica de evaluación: pulsa para ir a esa jugada">
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={me === 'w' ? '#eef0ee' : '#2a2d33'} />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#8a8c90" strokeDasharray="3 3" />
      {review.plies.map((p) => {
        if (!KEY_CLS.includes(p.cls)) return null
        return <circle key={p.i} cx={x(p.i + 1)} cy={y(evals[p.i + 1] ?? 0)} r={p.color === me ? 5 : 4} fill={CLS_META[p.cls].color} stroke="#111" strokeWidth=".75" opacity={p.color === me ? 1 : 0.75} />
      })}
      <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" />
    </svg>
  )
}

