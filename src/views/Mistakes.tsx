import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import Board, { type Arrow, type Mark, type MoveInput } from '../board/Board'
import { sfx } from '../board/sounds'
import { ArrowLegend, Coach } from '../components/ui'
import { es, PHASE_LABEL, threatsAgainst, tryMove, uciToMove, type Phase } from '../lib/chess-utils'
import { MOTIF_LABEL, type Puzzle } from '../analysis/core'
import { useStore, type StoredPuzzle } from '../lib/store'
import { go } from '../lib/router'
import { setQueue } from '../lib/queue'

const PAGE = 24

export default function Mistakes() {
  const store = useStore()
  const [ph, setPh] = useState<Phase | 'todas'>('todas')
  const [mo, setMo] = useState<Puzzle['motif'] | 'todos'>('todos')
  const [onlyDue, setOnlyDue] = useState(false)
  const [n, setN] = useState(PAGE)
  const all = [...store.puzzles].sort((a, b) => b.date.localeCompare(a.date))
  const list = all.filter((p) => (ph === 'todas' || p.phase === ph) && (mo === 'todos' || p.motif === mo) && (!onlyDue || store.isDue(p.id)))
  const due = list.filter((p) => store.isDue(p.id))
  const solved = all.filter((p) => (store.review(p.id)?.ok ?? 0) > 0).length
  const motifs = [...new Set(all.map((p) => p.motif))]
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Mis errores · {solved} de {all.length} resueltos</div>
          <h1>Posiciones reales de tus partidas</h1>
          <p className="muted" style={{ margin: 0 }}>En cada una jugaste algo que perdió mucho. Encuentra lo que no viste. Las nuevas partidas añaden ejercicios solas.</p>
        </div>
        <button type="button" className="btn primary" disabled={!due.length} onClick={() => { setQueue('err', due.map((p) => p.id)); go(`errores/${due[0].id}`) }}>Resolver {due.length} pendientes</button>
      </div>
      {!all.length && <div className="banner">Aún no hay ejercicios. Importa tus partidas desde <a href="#/ajustes">Ajustes</a> o sincroniza Chess.com en <a href="#/partidas">Partidas</a>.</div>}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          {(['todas', 'apertura', 'medio', 'final'] as const).map((x) => (
            <button key={x} type="button" className="chip" aria-pressed={ph === x} onClick={() => { setPh(x); setN(PAGE) }}>{x === 'todas' ? 'Todas las fases' : PHASE_LABEL[x]}</button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="chip" aria-pressed={mo === 'todos'} onClick={() => setMo('todos')}>Todos los temas</button>
          {motifs.map((x) => (
            <button key={x} type="button" className="chip" aria-pressed={mo === x} onClick={() => { setMo(x); setN(PAGE) }}>{MOTIF_LABEL[x]}</button>
          ))}
          <button type="button" className="chip" aria-pressed={onlyDue} onClick={() => setOnlyDue(!onlyDue)}>Solo pendientes</button>
        </div>
      </div>
      <div className="grid-3">
        {list.slice(0, n).map((p) => {
          const r = store.review(p.id)
          return (
            <button key={p.id} type="button" className="thumb" onClick={() => { setQueue('err', list.map((x) => x.id)); go(`errores/${p.id}`) }}>
              <Board fen={p.fen} orientation={p.color} mini lastMove={p.prev ? [p.prev.slice(0, 2), p.prev.slice(2, 4)] : null} />
              <div className="meta stack" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{MOTIF_LABEL[p.motif]}</b>
                  {r?.ok ? <span className="pill green">Resuelto</span> : r ? <span className="pill red">Repetir</span> : <span className="pill orange">Nuevo</span>}
                </div>
                <span className="dim">{PHASE_LABEL[p.phase]} · {p.date} · jugada {p.moveNo}</span>
              </div>
            </button>
          )
        })}
      </div>
      {list.length > n && <button type="button" className="btn" onClick={() => setN(n + PAGE)}>Ver más ({list.length - n})</button>}
    </div>
  )
}

type Stage = 'solve' | 'done'

export function PuzzleSolver({ puzzle: p, onDone, header }: { puzzle: StoredPuzzle; onDone: (ok: boolean) => void; header?: ReactNode }) {
  const store = useStore()
  const start = useMemo(() => ({ fen: p.fen, last: p.prev ? [p.prev.slice(0, 2), p.prev.slice(2, 4)] as [string, string] : null }), [p])
  const [pos, setPos] = useState(start)
  const [stage, setStage] = useState<Stage>('solve')
  const [tries, setTries] = useState(0)
  const [helped, setHelped] = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  const [vis, setVis] = useState<{ arrows: Arrow[]; marks: Mark[] }>({ arrows: [], marks: [] })
  const [flash, setFlash] = useState<{ sq: string; kind: 'good' | 'bad'; key: number } | null>(null)
  const [bubble, setBubble] = useState<{ kind: 'good' | 'bad' | 'info'; title: string; body?: ReactNode }>({
    kind: 'info', title: p.prompt,
    body: <>Antes de mover: ¿qué amenaza la última jugada del rival (casillas amarillas)? Jaques, capturas y amenazas, primero las suyas.</>,
  })
  const [ok, setOk] = useState<boolean | null>(null)

  const reset = () => { setPos(start); setVis({ arrows: [], marks: [] }) }

  const finish = (success: boolean) => {
    setStage('done')
    setOk(success)
    store.grade(p.id, 'puzzle', success)
  }

  const showBestLine = async () => {
    const g = new Chess(p.fen)
    const pv = p.bestPv?.length ? p.bestPv : [p.best, ...(p.reply ? [p.reply] : [])]
    setPos({ fen: p.fen, last: start.last })
    for (let k = 0; k < Math.min(pv.length, 4); k++) {
      await new Promise((r) => setTimeout(r, k === 0 ? 350 : 750))
      const m = tryMove(g, uciToMove(pv[k]))
      if (!m) break
      sfx.forSan(m.san)
      setPos({ fen: g.fen(), last: [m.from, m.to] })
      setVis({ arrows: [{ from: m.from, to: m.to, color: k % 2 === 0 ? 'green' : 'orange' }], marks: k === 0 ? [{ sq: m.to, color: 'green', badge: '★' }] : [] })
    }
  }

  const showWhatHappened = async () => {
    const g = new Chess(p.fen)
    setPos({ fen: p.fen, last: start.last })
    setVis({ arrows: [], marks: [] })
    await new Promise((r) => setTimeout(r, 300))
    const m = tryMove(g, uciToMove(p.playedUci))
    if (!m) return
    sfx.forSan(m.san)
    setPos({ fen: g.fen(), last: [m.from, m.to] })
    setVis({ arrows: [{ from: m.from, to: m.to, color: 'red' }], marks: [{ sq: m.to, color: 'red', badge: '??' }] })
    const ref = p.refutation?.length ? p.refutation : []
    for (let k = 0; k < ref.length; k++) {
      await new Promise((r) => setTimeout(r, 900))
      const mm = tryMove(g, uciToMove(ref[k]))
      if (!mm) break
      sfx.forSan(mm.san)
      setPos({ fen: g.fen(), last: [mm.from, mm.to] })
      setVis({ arrows: [{ from: mm.from, to: mm.to, color: k % 2 === 0 ? 'red' : 'orange' }], marks: k === 0 ? [{ sq: mm.to, color: 'red' }] : [] })
    }
  }

  const onMove = (m: MoveInput) => {
    if (stage !== 'solve') return
    const g = new Chess(pos.fen)
    const mv = tryMove(g, m)
    if (!mv) return
    const u = mv.from + mv.to + (mv.promotion ?? '')
    const accepted = p.accept.includes(u) || p.accept.some((a) => a.slice(0, 4) === u.slice(0, 4))
    if (accepted) {
      sfx.forSan(mv.san)
      setTimeout(() => sfx.good(), 120)
      setFlash({ sq: mv.to, kind: 'good', key: Date.now() })
      setPos({ fen: g.fen(), last: [mv.from, mv.to] })
      setVis({ arrows: [{ from: mv.from, to: mv.to, color: 'green' }], marks: [{ sq: mv.to, color: 'green', badge: '✓' }] })
      const success = tries === 0 && !helped
      setBubble({
        kind: 'good', title: `${success ? '¡Correcto!' : 'Bien, aunque con ayuda'}: ${es(mv.san)}`,
        body: <><div>{p.explain}</div><div className="dim" style={{ marginTop: 6 }}>En la partida jugaste <span className="mv">{p.played}</span>: {p.lossTxt}.</div></>,
      })
      if (p.reply) setTimeout(() => {
        const r = tryMove(g, uciToMove(p.reply!))
        if (r) { sfx.forSan(r.san); setPos({ fen: g.fen(), last: [r.from, r.to] }) }
      }, 800)
      finish(success)
      return
    }
    sfx.bad()
    setFlash({ sq: mv.to, kind: 'bad', key: Date.now() })
    const t = tries + 1
    setTries(t)
    if (u.slice(0, 4) === p.playedUci.slice(0, 4)) {
      setBubble({ kind: 'bad', title: 'Esa es la que jugaste en la partida', body: <><div>{p.whyBad}</div><div className="dim" style={{ marginTop: 6 }}>Mira la flecha roja: es la respuesta del rival. Prueba otra.</div></> })
      const ref = p.refutation?.[0]
      const after = new Chess(p.fen)
      tryMove(after, uciToMove(p.playedUci))
      setVis({
        arrows: [{ from: mv.from, to: mv.to, color: 'red' }, ...(ref ? [{ from: ref.slice(0, 2), to: ref.slice(2, 4), color: 'red' as const }] : [])],
        marks: [{ sq: mv.to, color: 'red', badge: '??' }],
      })
    } else {
      setBubble({ kind: 'bad', title: `${es(mv.san)} no es suficiente`, body: <>Busca algo más fuerte. Pulsa «Ver amenazas» si no ves qué pasa.</> })
      setVis({ arrows: [{ from: mv.from, to: mv.to, color: 'red' }], marks: [{ sq: mv.to, color: 'red', badge: '✗' }] })
    }
    if (t >= 3) reveal()
  }

  const reveal = () => {
    setHelped(true)
    setBubble({
      kind: 'bad', title: `La buena era ${p.bestSan}`,
      body: <><div>{p.explain}</div><div style={{ marginTop: 6 }}>{p.whyBad}</div></>,
    })
    finish(false)
    void showBestLine()
  }

  const threats = () => {
    // La comprobación de seguridad es el hábito que entrenamos: no cuenta como ayuda.
    const enemy = p.color === 'w' ? 'b' : 'w'
    const mine = threatsAgainst(pos.fen, p.color)
    const theirs = threatsAgainst(pos.fen, enemy)
    setVis({
      arrows: [...mine.map((a) => ({ ...a, color: 'red' as const })), ...theirs.map((a) => ({ ...a, color: 'green' as const }))],
      marks: [...mine.map((a) => ({ sq: a.to, color: 'red' as const })), ...theirs.map((a) => ({ sq: a.to, color: 'green' as const }))],
    })
    setBubble({
      kind: 'info', title: 'Comprobación de seguridad',
      body: <>En <b style={{ color: '#d0361f' }}>rojo</b>, tus piezas atacadas o mal defendidas. En <b style={{ color: '#5d9948' }}>verde</b>, piezas rivales que podrías ganar. {mine.length + theirs.length === 0 && 'No hay nada colgado: busca jaques y amenazas.'}</>,
    })
  }

  const hint = () => {
    setHelped(true)
    const b = uciToMove(p.best)
    if (hintLevel === 0) {
      setVis({ arrows: [], marks: [{ sq: b.from, color: 'orange' }] })
      setBubble({ kind: 'info', title: 'Pista', body: <>{p.hint} La pieza marcada en naranja es la que debes mover.</> })
    } else {
      setVis({ arrows: [{ from: b.from, to: b.to, color: 'orange' }], marks: [] })
    }
    setHintLevel(hintLevel + 1)
  }

  useEffect(() => { reset() }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="train">
      <div>
        <Board fen={pos.fen} orientation={p.color} lastMove={pos.last} interactive={stage === 'solve' && pos.fen === p.fen} onMove={onMove} arrows={vis.arrows} marks={vis.marks} flash={flash} />
        <div className="under-board"><ArrowLegend /></div>
      </div>
      <div className="card stack">
        {header}
        <div>
          <div className="eyebrow">{MOTIF_LABEL[p.motif]} · {PHASE_LABEL[p.phase]} · {p.date} · jugada {p.moveNo}</div>
          <h2>Juegas con {p.color === 'w' ? 'blancas' : 'negras'}</h2>
        </div>
        <Coach kind={bubble.kind} title={bubble.title}>{bubble.body}</Coach>
        {stage === 'solve' ? (
          <div className="row">
            <button type="button" className="btn" onClick={threats}>Ver amenazas</button>
            <button type="button" className="btn" onClick={hint}>{hintLevel === 0 ? 'Pista' : 'Otra pista'}</button>
            <button type="button" className="btn ghost" onClick={reveal}>Solución</button>
            {pos.fen !== p.fen && <button type="button" className="btn ghost" onClick={reset}>Volver a la posición</button>}
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <div className="card flat stack" style={{ gap: 8 }}>
              <b>Repasa sobre el tablero</b>
              <div className="row">
                <button type="button" className="btn sm" onClick={showWhatHappened}>Lo que pasó en tu partida</button>
                <button type="button" className="btn sm" onClick={showBestLine}>La línea buena</button>
                {p.game_id && <button type="button" className="btn sm ghost" onClick={() => go(`partidas/${p.game_id}`)}>Abrir la partida</button>}
              </div>
              <span className="mono dim" style={{ fontSize: 12.5 }}>{p.line}</span>
            </div>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => onDone(!!ok)}>Siguiente ejercicio →</button>
              <button type="button" className="btn" onClick={() => { setStage('solve'); setTries(0); setHelped(true); setHintLevel(0); reset(); setBubble({ kind: 'info', title: p.prompt }) }}>Intentar otra vez</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
