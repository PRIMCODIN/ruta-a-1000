import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import Board, { type Arrow, type MoveInput } from '../board/Board'
import { sfx } from '../board/sounds'
import { Coach, EvalBar, Icons } from '../components/ui'
import { CaretRight } from '@phosphor-icons/react'
import { engine } from '../engine/engine'
import { tryMove, uciToMove } from '../lib/chess-utils'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { setQueue } from '../lib/queue'
import { endgames, type Endgame } from '../data'

export default function Endgames() {
  const store = useStore()
  const cats = [...new Set(endgames.map((e) => e.cat))]
  const done = endgames.filter((e) => store.review(e.id)?.ok).length
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Gana o salva el final contra el motor</h1>
          <p className="lead">Técnica básica y finales que se te escaparon en tus partidas. El motor defiende al máximo.</p>
          <p className="meta">{done} de {endgames.length} superados</p>
        </div>
      </div>
      {cats.map((c) => (
        <section key={c} className="stack" aria-labelledby={`cat-${c}`}>
          <h2 id={`cat-${c}`}>{c}</h2>
          <div className="grid-3">
            {endgames.filter((e) => e.cat === c).map((e) => {
              const r = store.review(e.id)
              return (
                <button key={e.id} type="button" className="thumb" onClick={() => { setQueue('fin', endgames.map((x) => x.id)); go(`finales/${e.id}`) }}>
                  <Board fen={e.fen} orientation={e.color} mini />
                  <div className="info">
                    <span className="title">{e.title}</span>
                    <span className="meta">{e.goalTxt}</span>
                    <div className="foot">
                      {r?.ok ? <span className="tag ok">Superado</span> : r ? <span className="tag due">Repetir</span> : <span className="tag new">Nuevo</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function EndgamePlay({ eg, onDone, onExit, header }: { eg: Endgame; onDone: (ok: boolean) => void; onExit?: () => void; header?: ReactNode }) {
  const store = useStore()
  const [fen, setFen] = useState(eg.fen)
  const [last, setLast] = useState<[string, string] | null>(null)
  const [moves, setMoves] = useState(0)
  const [result, setResult] = useState<{ ok: boolean; title: string; text: string } | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [evalCp, setEvalCp] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [engineErr, setEngineErr] = useState<string | null>(null)
  const token = useRef(0)

  const reset = () => {
    token.current++
    setFen(eg.fen); setLast(null); setMoves(0); setResult(null); setArrows([]); setEvalCp(null); setThinking(false)
  }
  useEffect(() => {
    engine.start().catch((e) => setEngineErr((e as Error).message))
  }, [])

  const end = (ok: boolean, title: string, text = '') => {
    setResult({ ok, title, text })
    ok ? sfx.good() : sfx.bad()
    store.grade(eg.id, 'endgame', ok)
  }

  const check = (g: Chess, n: number) => {
    const mine = eg.color
    if (g.isCheckmate()) { g.turn() === mine ? end(false, 'Te han dado mate') : end(true, '¡Mate!', 'Final convertido.'); return true }
    if (g.isStalemate()) { end(eg.goal === 'draw', eg.goal === 'draw' ? 'Tablas por ahogado' : '¡Ahogado! Son tablas', eg.goal === 'draw' ? 'Salvaste la partida.' : 'Antes de cada jugada con la dama, comprueba que el rey rival tenga al menos una casilla libre.'); return true }
    if (g.isDraw()) { end(eg.goal === 'draw', eg.goal === 'draw' ? 'Tablas conseguidas' : 'Tablas', ''); return true }
    if (eg.goal === 'promote') {
      const q = g.board().flat().filter((p) => p && p.type === 'q' && p.color === mine).length
      if (q > eg.startQ) { end(true, '¡Coronado!', 'Peón coronado: el resto es técnica de dama.'); return true }
    }
    if (eg.goal === 'draw' && n >= eg.limit) { end(true, `Has aguantado ${eg.limit} jugadas`, 'Tablas defendidas.'); return true }
    if (eg.goal !== 'draw' && n >= eg.limit) { end(false, 'Se acabó el margen', `No lo resolviste en ${eg.limit} jugadas. Repasa el plan y prueba de nuevo.`); return true }
    return false
  }

  const updateEval = async (f: string) => {
    try {
      const [l] = await engine.analyse(f, { depth: 12 })
      if (l) setEvalCp(new Chess(f).turn() === 'w' ? l.cp : -l.cp)
    } catch { /* motor ocupado o cancelado */ }
  }

  const onMove = async (m: MoveInput) => {
    if (result || thinking) return
    const g = new Chess(fen)
    const mv = tryMove(g, m)
    if (!mv) return
    sfx.forSan(mv.san)
    setArrows([])
    setFen(g.fen()); setLast([mv.from, mv.to])
    const n = moves + 1
    setMoves(n)
    if (check(g, n)) return
    const t = ++token.current
    setThinking(true)
    try {
      const u = await engine.bestMove(g.fen(), 600)
      if (t !== token.current) return
      const r = u ? tryMove(g, uciToMove(u)) : null
      if (r) { sfx.forSan(r.san); setFen(g.fen()); setLast([r.from, r.to]) }
      setThinking(false)
      if (!check(g, n)) void updateEval(g.fen())
    } catch (e) {
      setThinking(false)
      setEngineErr((e as Error).message)
    }
  }

  const hint = async () => {
    try {
      const u = await engine.bestMove(fen, 900)
      if (u) setArrows([{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'orange' }])
    } catch (e) { setEngineErr((e as Error).message) }
  }

  const g = new Chess(fen)
  return (
    <div className="train">
      <div>
        <div className="board-col">
          <EvalBar cpWhite={evalCp} orientation={eg.color} />
          <Board fen={fen} orientation={eg.color} lastMove={last} interactive={!result && !thinking && g.turn() === eg.color} onMove={onMove} arrows={arrows} />
        </div>
        <div className="under-board"><span className="meta" aria-live="polite">{thinking ? 'El motor piensa…' : result ? '' : `Jugada ${moves} de ${eg.limit}`}</span></div>
      </div>
      <div className="side">
        {header}
        <div className="side-head">
          <span className="meta">{eg.cat}</span>
          <h1 className="h2">{eg.title}</h1>
          <span className="sec" style={{ color: 'var(--warn)', fontWeight: 500 }}>{eg.goalTxt}</span>
        </div>
        {engineErr && <div className="banner err">El motor no está disponible ({engineErr}). Recarga la página.</div>}
        {result
          ? <Coach kind={result.ok ? 'good' : 'bad'} title={result.title}>{result.text}</Coach>
          : <Coach kind="info" title="Plan">{eg.plan}</Coach>}
        <div className="row">
          {result ? (
            <>
              <button type="button" className="btn primary" onClick={() => onDone(result.ok)}>Siguiente final<CaretRight size={18} /></button>
              <button type="button" className="btn" onClick={reset}>Intentar otra vez</button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={hint} disabled={thinking}>{Icons.hint}Pista del motor</button>
              <button type="button" className="btn" onClick={reset}>Reiniciar</button>
              <button type="button" className="btn ghost" onClick={() => (onExit ? onExit() : onDone(false))}>Salir</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
